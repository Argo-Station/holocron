"""The oracle arm of the recall benchmark (C-ORB-6): the REAL rules-oracle, judged.

SELECT  60 kept questions, 15 per tier, seeded (`oracle|<seed>|<tier>`), from the frozen sites file.
ASK     each question verbatim to the `rules-oracle` agent in a fresh headless session:
          claude -p --agent rules-oracle --model <explicit> --output-format stream-json --verbose
                 --strict-mcp-config --mcp-config .mcp.json --setting-sources project
                 --settings '{"disableAllHooks": true}' --no-session-persistence
                 --allowedTools <the agent's two swrpg tools>
        run from the repo root (the agent file and .mcp.json live there). Only the swrpg MCP server is
        loaded, only the project settings source (it is what resolves the agent file), and every hook is
        disabled, so the SessionStart pre-flight never speaks into the oracle's context. The stream
        is saved as <site>.jsonl, the reply as <site>.md.
SCORE   (a) FACT — a judge call (pipeline model, separate from the generator, the filter and the
            oracle) sees question, recorded answer, source passage and reply:
            CORRECT / PARTIAL / WRONG / NOT-FOUND + one line;
        (b) CITE — mechanical: a `(source: <Title> [corpus] p.N[-M])` in the reply names a book of the
            site's family and pagination group on a page overlapping the site. Printed pages go through
            the one converter (pdf_pages.to_corpus); `corpus p.` is taken as corpus. Title -> aliases by
            normalised pdf_sources.json name;
        (c) EFFICIENCY — tool calls, retrieve_rule_for_query calls, read_pages calls, turns, output
            tokens, wall-clock, cost, from the stream.
CALIBRATION  20 of the 60 (seeded) are listed for the architect's blind read; not read here.

Usage:
  .venv/bin/python -m swrpg_index.eval.recall.oracle_arm --db <index.db> --sites sites.jsonl \
      --outdir <dir> [--model claude-fable-5-1] [--workers 2] [--limit N]
Resumable: a site whose <site>.jsonl already holds a result event is not asked again.
"""
import argparse
import collections
import concurrent.futures as cf
import json
import os
import random
import re
import subprocess
import sys
import time

from ... import pdf_pages
from . import common as C
from . import llm
from .generate import passage_text
from .sample import open_ro, TIERS

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
ORACLE_MODEL = 'claude-fable-5-1'     # rules-oracle row: "top available model" (R-MWT-4 names it)
ORACLE_TOOLS = ['mcp__swrpg__retrieve_rule_for_query', 'mcp__swrpg__read_pages']
PER_TIER = 15
CALIBRATION_N = 20
JUDGE_SCHEMA = {
    'type': 'object',
    'properties': {'verdict': {'type': 'string', 'enum': ['CORRECT', 'PARTIAL', 'WRONG', 'NOT-FOUND']},
                   'reason': {'type': 'string'}},
    'required': ['verdict', 'reason'],
}


def select(sites, seed):
    kept = [s for s in sites if s.get('kept')]
    out = []
    for t in TIERS:
        pool = sorted((s for s in kept if s['tier'] == t), key=lambda s: s['site'])
        out += random.Random(f'oracle|{seed}|{t}').sample(pool, min(PER_TIER, len(pool)))
    calib = sorted(random.Random(f'calibration|{seed}').sample([s['site'] for s in out],
                                                               min(CALIBRATION_N, len(out))))
    return out, calib


def ask(question, model, stream_path):
    """One fresh headless oracle session. Returns (reply, events, wall_ms)."""
    if os.path.exists(stream_path):
        ev = [json.loads(l) for l in open(stream_path, encoding='utf-8') if l.strip()]
        if any(e.get('type') == 'result' for e in ev):
            res = next(e for e in ev if e.get('type') == 'result')
            return res.get('result') or '', ev, res.get('duration_ms')
    cmd = ['claude', '-p', '--agent', 'rules-oracle', '--model', model,
           '--output-format', 'stream-json', '--verbose',
           '--strict-mcp-config', '--mcp-config', os.path.join(REPO, '.mcp.json'),
           '--setting-sources', 'project', '--settings', json.dumps({'disableAllHooks': True}),
           '--no-session-persistence',
           '--allowedTools', *ORACLE_TOOLS]
    t0 = time.perf_counter()
    p = subprocess.run(cmd, input=question, capture_output=True, text=True, timeout=900, cwd=REPO)
    ms = int((time.perf_counter() - t0) * 1000)
    with open(stream_path, 'w', encoding='utf-8') as f:
        f.write(p.stdout)
    if p.stderr.strip():
        with open(stream_path[:-len('.jsonl')] + '.err', 'w', encoding='utf-8') as f:
            f.write(p.stderr)
    ev = []
    for l in p.stdout.splitlines():
        try:
            ev.append(json.loads(l))
        except ValueError:
            pass
    res = next((e for e in ev if e.get('type') == 'result'), {})
    return res.get('result') or '', ev, ms


def efficiency(events, wall_ms):
    calls = []
    for e in events:
        if e.get('type') == 'assistant':
            for c in (e.get('message') or {}).get('content') or []:
                if c.get('type') == 'tool_use':
                    calls.append({'name': c.get('name'), 'input': c.get('input')})
    res = next((e for e in events if e.get('type') == 'result'), {})
    usage = res.get('usage') or {}
    models = sorted((res.get('modelUsage') or {}).keys())
    init = next((e for e in events if e.get('type') == 'system' and e.get('subtype') == 'init'), {})
    return {
        'tool_calls': len(calls),
        'retrieve_calls': sum(1 for c in calls if c['name'].endswith('retrieve_rule_for_query')),
        'read_pages_calls': sum(1 for c in calls if c['name'].endswith('read_pages')),
        'other_calls': sorted({c['name'] for c in calls
                               if not c['name'].endswith(('retrieve_rule_for_query', 'read_pages'))}),
        'turns': res.get('num_turns'), 'output_tokens': usage.get('output_tokens'),
        'wall_ms': res.get('duration_ms') or wall_ms, 'cost_usd': res.get('total_cost_usd'),
        'models_reported': models, 'init_model': init.get('model'), 'is_error': bool(res.get('is_error')),
        'calls': calls,
    }


# ── CITE ──────────────────────────────────────────────────────────────────

# The title may carry its own parentheses ("Heroes on Both Sides (community, v2.0)"), so it runs lazily
# up to "[corpus] p.N" without crossing a newline or another "(source:".
_SRC = re.compile(r'\(source:\s*((?:(?!\(source:)[^\n])+?)\s+(corpus\s+)?pp?\.\s*(\d+)(?:\s*[-–]\s*(\d+))?',
                  re.IGNORECASE)


def _norm_title(t):
    t = t.lower().replace('’', "'")
    t = re.sub(r'^star wars[:\s]*', '', t)
    return re.sub(r'[^a-z0-9]+', ' ', t).strip()


def title_index():
    reg = json.load(open(os.path.join(REPO, 'Docs', 'pdf_sources.json'), encoding='utf-8'))
    idx = collections.defaultdict(set)
    for s in reg.get('sources', []):
        if s.get('name'):
            idx[_norm_title(s['name'])].add(s['alias'])
    return idx


def citations(reply, idx):
    out = []
    for m in _SRC.finditer(reply or ''):
        title, is_corpus, a, b = m.group(1), bool(m.group(2)), int(m.group(3)), m.group(4)
        b = int(b) if b else a
        nt = _norm_title(title)
        aliases = set(idx.get(nt, ()))
        if not aliases:        # a cited title that is a prefix/extension of a registry name
            for k, v in idx.items():
                if nt and (nt in k or k in nt) and min(len(nt), len(k)) >= 8:
                    aliases |= v
        for al in sorted(aliases):
            if is_corpus:
                ps, pe = a, b
            else:
                ps, pe = pdf_pages.to_corpus(al, a), pdf_pages.to_corpus(al, b)
            out.append({'title': title, 'alias': al, 'printed': not is_corpus, 'page': [a, b],
                        'corpus': [ps, pe] if ps is not None else None})
    return out


def cite_ok(site, cites):
    for c in cites:
        if c['corpus'] and C.hit_matches(site, {'alias': c['alias'], 'page_start': c['corpus'][0],
                                                'page_end': c['corpus'][1]}):
            return True
    return False


def judge(log, site, text, reply):
    msg = (f"QUESTION:\n{site['question']}\n\nSOURCE PASSAGE:\n{text}\n\nEXPECTED ANSWER:\n{site['answer']}"
           f"\n\nREPLY:\n{reply}")
    r = llm.call(log, 'judge', 'judge', msg, JUDGE_SCHEMA)
    o = r.get('output') or {}
    return o.get('verdict') or 'ERROR', o.get('reason') or r.get('error', '')


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--db', required=True)
    ap.add_argument('--sites', required=True)
    ap.add_argument('--outdir', required=True)
    ap.add_argument('--model', default=ORACLE_MODEL)
    ap.add_argument('--seed', type=int, default=20260923)
    ap.add_argument('--workers', type=int, default=2)
    ap.add_argument('--limit', type=int)
    a = ap.parse_args(argv)
    if a.workers > 4:
        sys.exit('machine safety: at most 4 parallel calls')
    os.makedirs(os.path.join(a.outdir, 'transcripts'), exist_ok=True)
    conn = open_ro(a.db)
    sites = [json.loads(l) for l in open(a.sites, encoding='utf-8') if l.strip()]
    chosen, calib = select(sites, a.seed)
    if a.limit:
        chosen = chosen[:a.limit]
    log = llm.CallLog(os.path.join(a.outdir, 'judge_calls.jsonl'))
    idx = title_index()

    texts = {s['site']: passage_text(conn, s) or '' for s in chosen}   # sqlite stays on this thread

    def one(s):
        base = os.path.join(a.outdir, 'transcripts', s['site'])
        reply, ev, ms = ask(s['question'], a.model, base + '.jsonl')
        with open(base + '.md', 'w', encoding='utf-8') as f:
            f.write(reply)
        text = texts[s['site']]
        verdict, why = judge(log, s, text, reply) if reply else ('NOT-FOUND', 'empty reply')
        cites = citations(reply, idx)
        eff = efficiency(ev, ms)
        eff.pop('calls')
        return {'site': s['site'], 'tier': s['tier'], 'alias': s['alias'], 'family': s['family'],
                'pages': [s['corpus_page_start'], s['corpus_page_end']], 'question': s['question'],
                'answer': s['answer'], 'fact': verdict, 'fact_reason': why,
                'cite': cite_ok(s, cites), 'citations': cites, 'n_citations': len(cites),
                'n_unverified': len(re.findall(r'\(source:\s*unverified\)', reply or '', re.IGNORECASE)),
                'calibration': s['site'] in calib, **eff}

    with cf.ThreadPoolExecutor(max_workers=a.workers) as ex:
        rows = list(ex.map(one, chosen))
    summ = {
        'model': a.model, 'judge_model': llm.PIPELINE_MODEL, 'n': len(rows), 'calibration_sites': calib,
        'fact': dict(collections.Counter(r['fact'] for r in rows)),
        'fact_by_tier': {t: dict(collections.Counter(r['fact'] for r in rows if r['tier'] == t)) for t in TIERS},
        'cite': C.rate_row(sum(r['cite'] for r in rows), len(rows)),
        'cite_by_tier': {t: C.rate_row(sum(r['cite'] for r in rows if r['tier'] == t),
                                       sum(1 for r in rows if r['tier'] == t)) for t in TIERS},
        'correct': C.rate_row(sum(r['fact'] == 'CORRECT' for r in rows), len(rows)),
        # FACT x CITE: a CORRECT fact without the site's page cited came from another book or from
        # the model's own memory (`(source: unverified)`), not from recall of THIS passage.
        'fact_x_cite': {f'{f}|{"cited" if c else "not-cited"}': n for (f, c), n in
                        sorted(collections.Counter((r['fact'], r['cite']) for r in rows).items())},
        'replies_with_unverified': sum(1 for r in rows if r['n_unverified']),
        'correct_and_cited': C.rate_row(sum(r['fact'] == 'CORRECT' and r['cite'] for r in rows), len(rows)),
        'efficiency': {k: {'mean': round(sum(r[k] or 0 for r in rows) / len(rows), 2),
                           'max': max((r[k] or 0) for r in rows)}
                       for k in ('tool_calls', 'retrieve_calls', 'read_pages_calls', 'turns',
                                 'output_tokens', 'wall_ms', 'cost_usd')} if rows else {},
        'models_reported': sorted({m for r in rows for m in r['models_reported']}),
        'errors': sum(r['is_error'] for r in rows),
    }
    json.dump({'summary': summ, 'rows': rows}, open(os.path.join(a.outdir, 'oracle_arm.json'), 'w'),
              indent=1, ensure_ascii=False)
    print(json.dumps({k: summ[k] for k in ('model', 'n', 'fact', 'cite', 'fact_x_cite', 'replies_with_unverified',
                                           'errors', 'models_reported')}))
    print(f'HARVEST: {len(rows)} oracle replies judged' + (' — ZERO IS A FAILED RUN' if not rows else ''))
    return 0 if rows else 1


if __name__ == '__main__':
    sys.exit(main())
