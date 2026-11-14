"""The answer-bearing@5 arm of the recall benchmark (D-ORB3 b; ruling `oracle-o2c-answer-bearing`,
C-OBA-1..9). A MEASURE: it reads a `run.py` JSON and the index, and changes nothing that searches or
answers.

For every MISS in the run (hit@5 by address failed), each of the five pages the search returned
(`row['top']`, exactly those — C-OBA-2) is read the way the oracle reads it (`api.read_pages` on the
hit's alias and page range — C-OBA-3) and judged ALONE, blind, by the pipeline model (C-OBA-4):
does this page state the site's key? One of `carries` / `conflicts` / `absent` + one line.
The judge never sees the book, the page number, the rank, the other pages, or whether the pair is a
control. The miss is then classed by `common.classify_miss` (C-OBA-5):
SAME-BOOK · REPRINT (in-line / cross-line) · CONFLICT · LOSS, and

    answer-bearing@5 = (HIT + SAME-BOOK + REPRINT) / kept      beside hit@5, both with Wilson intervals.

Also judged: every HIT site's same-line pages from another book (the medpac trap where it hides
behind a hit); a positive and a negative control (C-OBA-6); every paged citation in the oracle's
saved replies (C-OBA-8, no new oracle call). LOSS and CONFLICT sites are asked once more with their
key as the question through `run.py` (C-OBA-7): this module writes that run's inputs and reads its
output back (`--probe-run`).

Phases:
  pilot   5 misses per tier (lowest sha1 of the site id) + the two O2b leftovers + the first 10 of
          each control; writes <outdir>/pilot_<tag>/ (the prompt, its sha1, every verdict, the bars)
  full    everything; writes answer_bearing.json/.md, probe_keys.jsonl / probe_ids.txt, the blind
          calibration pair, the unread-page list. Re-running it spends nothing already spent.

Every judge call goes through `llm.py`'s logged cache (<outdir>/judge_calls.jsonl, one log for the
lap), so the ceiling (C-OBA §4: 4,000 calls) is counted from that log; a run that would pass it
stops before its first call (exit 3).

Usage:
  .venv/bin/python -m swrpg_index.eval.recall.answer_bearing --phase pilot --tag it1 \
      --db <live index.db> --sites swrpg_index/eval/recall/sites.jsonl --run <base run.json> --outdir <dir>
  .venv/bin/python -m swrpg_index.eval.recall.answer_bearing --phase full \
      --db ... --sites ... --run ... --outdir <dir> --oracle-arm <o2b tip_arm dir> [--probe-run probe.json]
"""
import argparse
import collections
import concurrent.futures as cf
import hashlib
import json
import os
import random
import sqlite3
import sys
import threading
import time

from ... import api as _api
from . import common as C
from . import llm
from . import oracle_arm as O
from .sample import open_ro, TIERS

ROLE = 'answer_bearing'
PROMPT = 'answer_bearing'
SCHEMA = {
    'type': 'object',
    'properties': {'verdict': {'type': 'string', 'enum': list(C.VERDICTS)},
                   'reason': {'type': 'string'}},
    'required': ['verdict', 'reason'],
}
CEILING = 4000
SEED = 20260924
KNOWN_DEFECTS = ('a1a346f34714', 'af7409a2e406')       # README "Known defects" (R-OFAG-3)
LEFTOVERS = ('2b10c6fde8de', '5241915c4278')           # O2b's medpac and commander questions
POSITIVE_PER_TIER = {'core': 13, 'advanced': 13, 'supplement': 12, 'beginner': 12}
PILOT_PER_TIER = 5
PILOT_CONTROLS = 10
POSITIVE_BAR = 0.90       # >= 45/50 carries
NEGATIVE_BAR = 0.06       # <= 3/50 not absent
CALIBRATION = (('carries', 8), ('conflicts', 6), ('absent', 6))
MAX_PAGE_SPAN = 10        # a citation spanning more pages than this is not a page (reported, not judged)


def sha1(s):
    return hashlib.sha1(s.encode('utf-8')).hexdigest()


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''):
            h.update(b)
    return h.hexdigest()


def by_lowest_sha1(items, key=lambda r: r['site']):
    return sorted(items, key=lambda r: sha1(key(r)))


# ── Pages: the oracle's view of a page (C-OBA-3) ──────────────────────────

class Pages(object):
    """read_pages text per (alias, page_start, page_end), read once on the main thread."""

    def __init__(self, conn):
        self.conn = conn
        self.cache = {}

    def text(self, alias, ps, pe):
        k = (alias, int(ps), int(pe))
        if k not in self.cache:
            rows = _api.read_pages(self.conn, alias, list(range(k[1], k[2] + 1)))
            t = '\n\n'.join((r.get('text') or '') for r in rows).strip()
            self.cache[k] = t or None
        return self.cache[k]


def message(question, answer, text):
    return f'QUESTION:\n{question}\n\nEXPECTED ANSWER:\n{answer}\n\nPAGE TEXT:\n{text}'


def pair(kind, site, alias, ps, pe, pages, question=None, answer=None, **extra):
    """One (question, key, page) to judge. `site` supplies the question and key unless given."""
    p = {'kind': kind, 'site': site['site'], 'alias': alias, 'pages': [int(ps), int(pe)],
         'book': C.book_of(alias), 'line': C.line_of(alias),
         'question': question if question is not None else site['question'],
         'answer': answer if answer is not None else site['answer']}
    p.update(extra)
    p['id'] = sha1(f"{kind}|{p['site']}|{alias}|{ps}|{pe}|{p.get('pair_with', '')}")[:12]
    p['text'] = pages.text(alias, ps, pe)
    return p


# ── Judging ───────────────────────────────────────────────────────────────

def calls_spent(log_path):
    if not os.path.exists(log_path):
        return 0
    n = 0
    with open(log_path, encoding='utf-8') as f:
        for line in f:
            if line.strip() and json.loads(line).get('role') == ROLE:
                n += 1
    return n


def _lines(path):
    with open(path, 'rb') as f:
        return sum(1 for line in f if line.strip())


def judge_all(log, pairs, workers, ceiling):
    """Judges every pair that has page text. Returns {'spent_before', 'uncached', 'spent_after'}.
    Refuses (SystemExit 3) before its first call if the uncached set would pass the ceiling."""
    _, psha = llm.prompt(PROMPT)
    msgs = {}
    for p in pairs:
        if p['text'] is None:
            p['verdict'], p['reason'] = None, 'read_pages returned nothing'
            continue
        p['msg'] = message(p['question'], p['answer'], p['text'])
        msgs[p['msg']] = None
    uncached = [m for m in msgs if llm._key(ROLE, llm.PIPELINE_MODEL, psha, m) not in log.cache]
    spent = calls_spent(log.path)
    if spent + len(uncached) > ceiling:
        print(f'STOP: {spent} calls spent + {len(uncached)} uncached > ceiling {ceiling}', file=sys.stderr)
        sys.exit(3)
    lock = threading.Lock()
    count = [spent]
    done = [0]
    t0 = time.perf_counter()

    def one(m):
        with lock:
            if count[0] + 3 > ceiling:      # llm.call may log up to 3 attempts
                return m, None
        r = llm.call(log, ROLE, PROMPT, m, SCHEMA)
        with lock:
            count[0] = _lines(log.path)       # this lap's log holds only this role (checked at the gate)
            done[0] += 1
            if done[0] % 100 == 0:
                print(f'  judged {done[0]}/{len(uncached)} ({time.perf_counter() - t0:.0f}s, '
                      f'{count[0]} calls in log)', file=sys.stderr, flush=True)
        return m, r

    with cf.ThreadPoolExecutor(max_workers=workers) as ex:
        list(ex.map(one, uncached))
    for m in msgs:
        msgs[m] = log.cache.get(llm._key(ROLE, llm.PIPELINE_MODEL, psha, m))
    for p in pairs:
        if 'msg' not in p:
            continue
        rec = msgs[p.pop('msg')]
        o = (rec or {}).get('output') or {}
        p['verdict'] = o.get('verdict') or 'ERROR'
        p['reason'] = o.get('reason') or 'no judge output'
    return {'spent_before': spent, 'uncached': len(uncached), 'spent_after': calls_spent(log.path),
            'prompt_sha1': psha}


# ── Selection ─────────────────────────────────────────────────────────────

def load(a):
    conn = open_ro(a.db)
    conn.row_factory = sqlite3.Row          # api reads rows by column name, as the MCP server does
    sites = {s['site']: s for s in (json.loads(l) for l in open(a.sites, encoding='utf-8') if l.strip())}
    run = json.load(open(a.run, encoding='utf-8'))
    return conn, sites, run


def interleave(per_tier):
    """Round-robin across tiers so 'the first N' of a control spans every tier."""
    out = []
    for i in range(max(len(v) for v in per_tier.values())):
        for t in TIERS:
            if i < len(per_tier[t]):
                out.append(per_tier[t][i])
    return out


def controls(rows, sites, pages):
    """C-OBA-6. Positive: the lowest-sha1 HIT sites per tier, each judged on its own matched page.
    Negative: each positive site's question and key against the matched page of a positive site in
    the NEXT tier (same index, stepping forward) from another book and another line."""
    hits = [r for r in rows if r['hit5']]
    per_tier = {t: by_lowest_sha1([r for r in hits if r['tier'] == t])[:POSITIVE_PER_TIER[t]] for t in TIERS}
    pos, neg = [], []
    for r in interleave(per_tier):
        s = sites[r['site']]
        al, ps, pe = r['top'][r['rank'] - 1]
        pos.append(pair('positive', s, al, ps, pe, pages))
    for r in interleave(per_tier):
        s = sites[r['site']]
        nxt = per_tier[TIERS[(TIERS.index(r['tier']) + 1) % len(TIERS)]]
        i0 = per_tier[r['tier']].index(r)
        for k in range(len(nxt)):
            o = nxt[(i0 + k) % len(nxt)]
            al, ps, pe = o['top'][o['rank'] - 1]
            if C.book_of(al) != C.book_of(s['alias']) and C.line_of(al) != s['family']:
                neg.append(pair('negative', s, al, ps, pe, pages, pair_with=o['site']))
                break
    return pos, neg


def miss_pairs(rows, sites, pages, only=None):
    out = []
    for r in rows:
        if r['hit5'] or (only is not None and r['site'] not in only):
            continue
        for rank, (al, ps, pe) in enumerate(r['top'], 1):
            out.append(pair('miss', sites[r['site']], al, ps, pe, pages, rank=rank))
    return out


def sibling_pairs(rows, sites, pages):
    """HIT sites' top-5 pages from ANOTHER book of the SAME line (C-OBA-5's second trap count)."""
    out = []
    for r in rows:
        if not r['hit5']:
            continue
        s = sites[r['site']]
        for rank, (al, ps, pe) in enumerate(r['top'], 1):
            if C.line_of(al) == s['family'] and C.book_of(al) != C.book_of(s['alias']):
                out.append(pair('sibling', s, al, ps, pe, pages, rank=rank))
    return out


def oracle_pairs(arm_dir, sites, pages):
    """C-OBA-8. The saved replies re-parsed with the arm's own parser and mapping; every paged
    citation's page becomes a pair. Returns (rows, pairs)."""
    arm = json.load(open(os.path.join(arm_dir, 'oracle_arm.json'), encoding='utf-8'))
    idx = O.title_index()
    rows, prs = [], []
    for r in arm['rows']:
        s = sites[r['site']]
        reply = open(os.path.join(arm_dir, 'transcripts', r['site'] + '.md'), encoding='utf-8').read()
        cites = O.citations(reply, idx)
        seen, paged, unpaged = set(), [], []
        for c in cites:
            if not c['corpus'] or c['corpus'][0] is None or c['corpus'][1] is None:
                unpaged.append(c)
                continue
            ps, pe = c['corpus']
            if pe < ps or pe - ps >= MAX_PAGE_SPAN:
                unpaged.append(c)
                continue
            k = (c['alias'], ps, pe)
            if k in seen:
                continue
            seen.add(k)
            p = pair('oracle', s, c['alias'], ps, pe, pages)
            paged.append(p['id'])
            prs.append(p)
        rows.append({'site': r['site'], 'tier': r['tier'], 'fact': r['fact'], 'cite_saved': r['cite'],
                     'cite': O.cite_ok(s, cites), 'n_citations': len(cites), 'paged': paged,
                     'unpaged': [[c['title'], c['alias'], c['page'], c['corpus']] for c in unpaged]})
    return rows, prs


# ── Classing and the split ────────────────────────────────────────────────

def class_rows(rows, sites, judged):
    """One row per kept site, with its class and each judged page."""
    by_site = collections.defaultdict(list)
    for p in judged:
        by_site[p['site']].append(p)
    out = []
    for r in rows:
        s = sites[r['site']]
        base = {'site': r['site'], 'alias': s['alias'], 'tier': r['tier'], 'text_quality': r['text_quality'],
                'page_hostile': r['page_hostile'], 'stratum': r['stratum'], 'hit5': r['hit5'],
                'answer': s['answer'], 'known_defect': r['site'] in KNOWN_DEFECTS}
        if r['hit5']:
            sib = [p for p in by_site[r['site']] if p['kind'] == 'sibling']
            base.update({'class': 'HIT', 'scope': None, 'pages': [page_view(p) for p in sib],
                         'sibling_conflict': any(p['verdict'] == 'conflicts' for p in sib)})
        else:
            ps = sorted((p for p in by_site[r['site']] if p['kind'] == 'miss'), key=lambda p: p['rank'])
            if any(p['verdict'] == 'ERROR' for p in ps) or len(ps) != len(r['top']):
                cls, scope = 'UNJUDGED', None
            else:
                cls, scope = C.classify_miss(s, ps)
            base.update({'class': cls, 'scope': scope, 'pages': [page_view(p) for p in ps],
                         'unread': sum(1 for p in ps if p['verdict'] is None),
                         'reprint_conflict': cls == 'REPRINT' and any(p['verdict'] == 'conflicts' for p in ps)})
        out.append(base)
    return out


def page_view(p):
    return {'alias': p['alias'], 'pages': p['pages'], 'book': p['book'], 'line': p['line'],
            'rank': p.get('rank'), 'verdict': p['verdict'], 'reason': p['reason']}


def split(crs):
    """Class counts and both rates for one group of classed sites."""
    c = collections.Counter(r['class'] for r in crs)
    scope = collections.Counter(r['scope'] for r in crs if r['class'] == 'REPRINT')
    n = len(crs)
    misses = n - c['HIT']
    return {'n': n, 'HIT': c['HIT'], 'SAME-BOOK': c['SAME-BOOK'], 'REPRINT': c['REPRINT'],
            'REPRINT_in_line': scope['in-line'], 'REPRINT_cross_line': scope['cross-line'],
            'CONFLICT': c['CONFLICT'], 'LOSS': c['LOSS'], 'UNJUDGED': c['UNJUDGED'],
            'hit5': C.rate_row(c['HIT'], n),
            'answer_bearing5': C.rate_row(sum(C.answer_bearing(r['class']) for r in crs), n),
            'loss_of_misses': C.rate_row(c['LOSS'], misses),
            'conflict_of_misses': C.rate_row(c['CONFLICT'], misses),
            'reprint_of_misses': C.rate_row(c['REPRINT'], misses),
            'same_book_of_misses': C.rate_row(c['SAME-BOOK'], misses)}


GROUPS = (('tier', lambda r: r['tier']), ('text_quality', lambda r: r['text_quality']),
          ('page', lambda r: 'hostile' if r['page_hostile'] else 'clean-page'),
          ('stratum', lambda r: r['stratum']))


def split_table(crs):
    out = {'overall': split(crs)}
    for name, key in GROUPS:
        g = collections.defaultdict(list)
        for r in crs:
            g[key(r)].append(r)
        out['by_' + name] = {k: split(g[k]) for k in sorted(g)}
    return out


def control_result(pos, neg):
    pc = sum(p['verdict'] == 'carries' for p in pos)
    nn = sum(p['verdict'] not in ('absent',) for p in neg)
    return {'positive': {'carries': pc, 'n': len(pos), 'pass': bool(pos) and pc >= POSITIVE_BAR * len(pos) - 1e-9,
                         'verdicts': dict(collections.Counter(p['verdict'] for p in pos))},
            'negative': {'not_absent': nn, 'n': len(neg), 'pass': bool(neg) and nn <= NEGATIVE_BAR * len(neg) + 1e-9,
                         'verdicts': dict(collections.Counter(p['verdict'] for p in neg))}}


# ── Reporting helpers ─────────────────────────────────────────────────────

def pct(x):
    return '—' if x is None else f'{100 * x:.1f}%'


def rate_cell(rr):
    return f"{rr['k']}/{rr['n']} {pct(rr['rate'])} ({pct(rr['ci95'][0])}–{pct(rr['ci95'][1])})"


def md_split(title, table):
    L = [f'### {title}', '',
         '| group | n | HIT | SAME-BOOK | REPRINT in-line | REPRINT cross-line | CONFLICT | LOSS | hit@5 (95% CI) | answer-bearing@5 (95% CI) |',
         '|---|---:|---:|---:|---:|---:|---:|---:|---|---|']
    rows = [('**ALL**', table['overall'])]
    for name, _ in GROUPS:
        rows += [(f'{name}: {k}', v) for k, v in table['by_' + name].items()]
    for k, v in rows:
        L.append(f"| {k} | {v['n']} | {v['HIT']} | {v['SAME-BOOK']} | {v['REPRINT_in_line']} | "
                 f"{v['REPRINT_cross_line']} | {v['CONFLICT']} | {v['LOSS']} | {rate_cell(v['hit5'])} | "
                 f"{rate_cell(v['answer_bearing5'])} |")
    return L


def trace(cr):
    L = [f"- `{cr['site']}` ({cr['alias']}, {cr['tier']}, {cr['stratum']}, hostile page: {cr['page_hostile']}) — "
         f"**{cr['class']}**" + (f" ({cr['scope']})" if cr['scope'] else '') +
         (f" · probe **{cr['probe']}**" if cr.get('probe') else '') + f" · key: {cr['answer']!r}"]
    for p in cr['pages']:
        L.append(f"  - #{p['rank']} {p['alias']} {p['pages'][0]}–{p['pages'][1]} (book {p['book']}, line {p['line']}): "
                 f"**{p['verdict']}** — {p['reason']}")
    return L


# ── Phases ────────────────────────────────────────────────────────────────

def run_pilot(a, conn, sites, run):
    pages = Pages(conn)
    rows = [r for r in run['rows']]
    misses = [r for r in rows if not r['hit5']]
    chosen = []
    for t in TIERS:
        chosen += [r['site'] for r in by_lowest_sha1([r for r in misses if r['tier'] == t])[:PILOT_PER_TIER]]
    chosen += [s for s in LEFTOVERS if s not in chosen]
    mp = miss_pairs(rows, sites, pages, only=set(chosen))
    pos, neg = controls(rows, sites, pages)
    pos, neg = pos[:PILOT_CONTROLS], neg[:PILOT_CONTROLS]
    log = llm.CallLog(os.path.join(a.outdir, 'judge_calls.jsonl'))
    spend = judge_all(log, mp + pos + neg, a.workers, a.ceiling)
    d = os.path.join(a.outdir, f'pilot_{a.tag}')
    os.makedirs(d, exist_ok=True)
    ptext, psha = llm.prompt(PROMPT)
    open(os.path.join(d, 'prompt.txt'), 'w', encoding='utf-8').write(ptext)
    ctl = control_result(pos, neg)
    crs = class_rows([r for r in rows if r['site'] in chosen], sites, mp)
    out = {'tag': a.tag, 'prompt_sha1': psha, 'model': llm.PIPELINE_MODEL, 'spend': spend,
           'sites': chosen, 'controls': ctl,
           'classes': dict(collections.Counter(c['class'] for c in crs)),
           'verdicts': dict(collections.Counter(p['verdict'] for p in mp)),
           'unread': [[p['site'], p['alias'], p['pages']] for p in mp if p['text'] is None],
           'rows': crs,
           'controls_rows': [{k: p[k] for k in ('kind', 'id', 'site', 'alias', 'pages', 'pair_with', 'question',
                                                'answer', 'verdict', 'reason') if k in p} for p in pos + neg]}
    json.dump(out, open(os.path.join(d, 'pilot.json'), 'w'), indent=1, ensure_ascii=False)
    L = [f'# Pilot {a.tag} — prompt sha1 `{psha}`', '',
         f"Calls: {spend['spent_before']} before, {spend['uncached']} new, {spend['spent_after']} after "
         f"(ceiling {a.ceiling}).", '',
         f"**Positive control:** {ctl['positive']['carries']}/{ctl['positive']['n']} carries "
         f"(bar {POSITIVE_BAR:.0%}) — {'PASS' if ctl['positive']['pass'] else 'FAIL'} · {ctl['positive']['verdicts']}",
         f"**Negative control:** {ctl['negative']['not_absent']}/{ctl['negative']['n']} not absent "
         f"(bar ≤ {NEGATIVE_BAR:.0%}) — {'PASS' if ctl['negative']['pass'] else 'FAIL'} · {ctl['negative']['verdicts']}",
         '', f"Miss verdicts: {out['verdicts']} · classes: {out['classes']} · unread: {len(out['unread'])}", '',
         '## Every classed miss', '']
    for cr in crs:
        L += trace(cr)
    L += ['', '## Controls', '']
    for p in pos + neg:
        L.append(f"- {p['kind']} `{p['site']}` vs {p['alias']} {p['pages']} → **{p['verdict']}** — {p['reason']} "
                 f"· key: {p['answer']!r}")
    open(os.path.join(d, 'pilot.md'), 'w', encoding='utf-8').write('\n'.join(L) + '\n')
    print(f"pilot {a.tag}: prompt {psha} · positive {ctl['positive']['carries']}/{ctl['positive']['n']} "
          f"· negative not-absent {ctl['negative']['not_absent']}/{ctl['negative']['n']} · classes {out['classes']}")
    n = len(mp) + len(pos) + len(neg)
    print(f'HARVEST: {n} pairs judged' + (' — ZERO IS A FAILED RUN' if not n else ''))
    return 0 if n else 1


def run_full(a, conn, sites, run):
    pages = Pages(conn)
    rows = run['rows']
    mp = miss_pairs(rows, sites, pages)
    sp = sibling_pairs(rows, sites, pages)
    pos, neg = controls(rows, sites, pages)
    orows, op = oracle_pairs(a.oracle_arm, sites, pages)
    log = llm.CallLog(os.path.join(a.outdir, 'judge_calls.jsonl'))
    t0 = time.perf_counter()
    spend = judge_all(log, mp + sp + pos + neg + op, a.workers, a.ceiling)
    wall = round(time.perf_counter() - t0, 1)
    judged_by_id = {p['id']: p for p in op}

    crs = class_rows(rows, sites, mp + sp)
    # C-OBA-7: the damaged-text test's inputs, and its outputs when given
    probe_sites = [c for c in crs if c['class'] in ('LOSS', 'CONFLICT')]
    with open(os.path.join(a.outdir, 'probe_keys.jsonl'), 'w', encoding='utf-8') as f:
        for c in probe_sites:
            if not C.key_is_thin(c['answer']):
                f.write(json.dumps({'site': c['site'], 'question': c['answer']}, ensure_ascii=False) + '\n')
    with open(os.path.join(a.outdir, 'probe_ids.txt'), 'w') as f:
        f.write(''.join(c['site'] + '\n' for c in probe_sites if not C.key_is_thin(c['answer'])))
    probe_meta = None
    if a.probe_run:
        pr = json.load(open(a.probe_run, encoding='utf-8'))
        ph = {r['site']: r['hit5'] for r in pr['rows']}
        probe_meta = {'file': a.probe_run, 'sha256': sha256_file(a.probe_run), 'scored': len(pr['rows'])}
        for c in probe_sites:
            if C.key_is_thin(c['answer']):
                c['probe'] = 'UNPROBED'
            elif c['site'] in ph:
                c['probe'] = C.probe_class(c['answer'], ph[c['site']])
            else:
                c['probe'] = 'MISSING'          # asked for, not in the probe run: reported, never guessed

    # C-OBA-8: the oracle half
    for o in orows:
        o['pages'] = [page_view(judged_by_id[i]) | {'id': i} for i in o['paged']]
        verd = [p['verdict'] for p in o['pages']]
        o['cite_bearing'] = 'carries' in verd
        if o['fact'] == 'CORRECT' and not o['cite']:
            if not o['pages']:
                o['correct_not_cited'] = 'no paged citation'
            elif o['cite_bearing']:
                s = sites[o['site']]
                books = {judged_by_id[i]['book'] for i in o['paged'] if judged_by_id[i]['verdict'] == 'carries'}
                o['correct_not_cited'] = ('cited a carrying page' +
                                          (' of its own book' if C.book_of(s['alias']) in books else ' of another book'))
            else:
                o['correct_not_cited'] = 'cited only pages that do not carry'
    def oracle_summary(ors):
        return {'n': len(ors), 'cite': sum(o['cite'] for o in ors),
                'cite_bearing': C.rate_row(sum(o['cite_bearing'] for o in ors), len(ors)),
                'fact_x_cite_bearing': {f'{f}|{"bearing" if b else "not-bearing"}': n for (f, b), n in
                                        sorted(collections.Counter((o['fact'], o['cite_bearing']) for o in ors).items())},
                'fact_x_cite': {f'{f}|{"cited" if c else "not-cited"}': n for (f, c), n in
                                sorted(collections.Counter((o['fact'], o['cite']) for o in ors).items())},
                'correct_not_cited': dict(collections.Counter(o['correct_not_cited'] for o in ors
                                                              if 'correct_not_cited' in o)),
                'replies_without_paged_citation': sum(1 for o in ors if not o['pages'])}
    osum = oracle_summary(orows)
    osum_aside = oracle_summary([o for o in orows if o['site'] not in KNOWN_DEFECTS])
    osum['cite_saved'] = sum(o['cite_saved'] for o in orows)
    osum['cite_rederived_matches_saved'] = all(o['cite'] == o['cite_saved'] for o in orows)

    # C-OBA-6: the blind calibration pair (miss pairs only; seeded; stratified by verdict)
    rng = random.Random(f'calibration|{SEED}')
    calib = []
    for v, k in CALIBRATION:
        pool = sorted((p for p in mp if p['verdict'] == v), key=lambda p: p['id'])
        calib += rng.sample(pool, min(k, len(pool)))
    calib.sort(key=lambda p: p['id'])
    L = ['# Calibration pair — blind (C-OBA-6)', '',
         f'{len(calib)} pairs from the full run, drawn by `random.Random("calibration|{SEED}")` from the miss pairs, '
         f'stratified by the judge\'s verdict ({", ".join(f"{k} {v}" for v, k in CALIBRATION)}; all of a verdict '
         'when it has fewer). Each block is exactly what the judge saw. For each, write carries / conflicts / '
         'absent; the verdicts are in `calibration_key.json`.', '']
    for i, p in enumerate(calib, 1):
        L += [f'## {i}. pair `{p["id"]}`', '', f'**QUESTION:** {p["question"]}', '',
              f'**EXPECTED ANSWER:** {p["answer"]}', '', '**PAGE TEXT:**', '', '```', p['text'], '```', '',
              'Your verdict: ______', '']
    open(os.path.join(a.outdir, 'calibration_pairs.md'), 'w', encoding='utf-8').write('\n'.join(L))
    json.dump({'seed': f'calibration|{SEED}', 'rule': 'rng.sample per verdict from miss pairs sorted by pair id',
               'pairs': [{'n': i, 'id': p['id'], 'site': p['site'], 'alias': p['alias'], 'pages': p['pages'],
                          'verdict': p['verdict'], 'reason': p['reason']} for i, p in enumerate(calib, 1)]},
              open(os.path.join(a.outdir, 'calibration_key.json'), 'w'), indent=1, ensure_ascii=False)

    ctl = control_result(pos, neg)
    unread = [p for p in mp + sp + pos + neg + op if p['text'] is None]
    kept = [c for c in crs]
    aside = [c for c in crs if not c['known_defect']]
    summary = {
        'stamps': {'run_json': a.run, 'run_json_sha256': sha256_file(a.run), 'db': a.db,
                   'prompt_sha1': spend['prompt_sha1'], 'model': llm.PIPELINE_MODEL,
                   'oracle_arm': a.oracle_arm, 'seed': SEED},
        'spend': spend, 'wall_s_this_invocation': wall,
        'harvest': {'miss_pairs': len(mp), 'miss_pairs_judged': sum(1 for p in mp if p['verdict'] in C.VERDICTS),
                    'sibling_pairs': len(sp), 'sibling_sites': len({p['site'] for p in sp}),
                    'oracle_pairs': len(op), 'controls': [len(pos), len(neg)],
                    'misses': sum(1 for r in rows if not r['hit5']),
                    'misses_classed': sum(1 for c in crs if c['class'] in C.MISS_CLASSES),
                    'unjudged': sum(1 for c in crs if c['class'] == 'UNJUDGED'),
                    'errors': sum(1 for p in mp + sp + pos + neg + op if p['verdict'] == 'ERROR'),
                    'unread': len(unread), 'unread_miss_pairs': sum(1 for p in mp if p['text'] is None)},
        'controls': ctl,
        'verdicts': {k: dict(collections.Counter(p['verdict'] for p in g)) for k, g in
                     (('miss', mp), ('sibling', sp), ('oracle', op))},
        'split': split_table(kept),
        'split_known_defects_aside': split_table(aside),
        'traps': {'reprint_with_conflict': sum(c.get('reprint_conflict', False) for c in crs),
                  'hit_with_sibling_conflict': sum(c.get('sibling_conflict', False) for c in crs),
                  'hit_sites_with_sibling_pages': sum(1 for c in crs if c['class'] == 'HIT' and c['pages'])},
        'probe': probe_meta and {
            'by_class': {k: dict(collections.Counter(c['probe'] for c in probe_sites if c['class'] == k))
                         for k in ('LOSS', 'CONFLICT')},
            'x_text_quality': {f"{c1}|{q}": n for (c1, q), n in sorted(collections.Counter(
                (c['probe'], c['text_quality']) for c in probe_sites).items())},
            'x_page': {f"{c1}|{'hostile' if h else 'clean-page'}": n for (c1, h), n in sorted(collections.Counter(
                (c['probe'], c['page_hostile']) for c in probe_sites).items())},
            'x_stratum': {f"{c1}|{s}": n for (c1, s), n in sorted(collections.Counter(
                (c['probe'], c['stratum']) for c in probe_sites).items())}},
        'oracle': osum, 'oracle_known_defects_aside': osum_aside,
    }
    if probe_meta:
        summary['probe']['x_class_tier'] = {f'{k}|{p}|{t}': n for (k, p, t), n in sorted(collections.Counter(
            (c['class'], c['probe'], c['tier']) for c in probe_sites).items())}
        summary['probe']['run'] = probe_meta
    out = {'summary': summary, 'rows': crs, 'oracle_rows': orows,
           'controls': [{k: p[k] for k in ('kind', 'id', 'site', 'alias', 'pages', 'pair_with', 'question', 'answer',
                                           'verdict', 'reason') if k in p} for p in pos + neg],
           'unread': [{k: p[k] for k in ('kind', 'site', 'alias', 'pages')} for p in unread]}
    json.dump(out, open(os.path.join(a.outdir, 'answer_bearing.json'), 'w'), indent=1, ensure_ascii=False)
    open(os.path.join(a.outdir, 'answer_bearing.md'), 'w', encoding='utf-8').write(markdown(out, crs, orows))
    h = summary['harvest']
    o = summary['split']['overall']
    print(f"answer-bearing@5 {rate_cell(o['answer_bearing5'])} beside hit@5 {rate_cell(o['hit5'])} · "
          f"SAME-BOOK {o['SAME-BOOK']} REPRINT {o['REPRINT']} ({o['REPRINT_in_line']} in-line) "
          f"CONFLICT {o['CONFLICT']} LOSS {o['LOSS']} UNJUDGED {o['UNJUDGED']}")
    print(f"controls: positive {ctl['positive']['carries']}/{ctl['positive']['n']} "
          f"negative not-absent {ctl['negative']['not_absent']}/{ctl['negative']['n']} · "
          f"oracle CITE {osum['cite']}/60 (saved {osum['cite_saved']}) CITE-BEARING {osum['cite_bearing']['k']}")
    print(f"calls {spend['spent_after']}/{a.ceiling} · errors {h['errors']} · unread {h['unread']}")
    print(f"HARVEST: {h['miss_pairs_judged']}/{h['miss_pairs']} miss pairs judged, {h['misses_classed']}/{h['misses']} "
          f"misses classed" + (' — ZERO IS A FAILED RUN' if not h['misses_classed'] else ''))
    ok = h['misses_classed'] and not h['unjudged'] and not h['errors']
    return 0 if ok else 1


def markdown(out, crs, orows):
    s = out['summary']
    st, sp, h, ctl = s['stamps'], s['spend'], s['harvest'], s['controls']
    L = ['# ORACLE O2c — answer-bearing@5 (D-ORB3 b)', '',
         f"Run JSON `{st['run_json']}` sha256 `{st['run_json_sha256']}` · judge `{st['model']}` · prompt sha1 "
         f"`{st['prompt_sha1']}` · calls in log {sp['spent_after']} (ceiling {CEILING})", '',
         '## Controls (C-OBA-6)', '',
         f"- Positive: {ctl['positive']['carries']}/{ctl['positive']['n']} carries (bar ≥ 45/50) — "
         f"**{'PASS' if ctl['positive']['pass'] else 'FAIL'}** · {ctl['positive']['verdicts']}",
         f"- Negative: {ctl['negative']['not_absent']}/{ctl['negative']['n']} not absent (bar ≤ 3/50) — "
         f"**{'PASS' if ctl['negative']['pass'] else 'FAIL'}** · {ctl['negative']['verdicts']}", '',
         '## Harvest', '',
         f"- miss pairs {h['miss_pairs_judged']}/{h['miss_pairs']} judged; misses classed {h['misses_classed']}/"
         f"{h['misses']}; unjudged {h['unjudged']}; judge errors {h['errors']}",
         f"- sibling pages {h['sibling_pairs']} on {h['sibling_sites']} HIT sites; oracle citation pages "
         f"{h['oracle_pairs']}; controls {h['controls']}",
         f"- pages `read_pages` returned nothing for: {h['unread']} (miss pairs {h['unread_miss_pairs']}) — listed "
         'at the end', '',
         f"Verdicts: {s['verdicts']}", '', '## The split (C-OBA-5)', '']
    L += md_split('Scored as-is (all kept sites)', s['split'])
    L += [''] + md_split('The two known defects set aside (R-OFAG-3)', s['split_known_defects_aside'])
    t = s['traps']
    L += ['', '## The conflict trap', '',
          f"- REPRINT sites that also show a `conflicts` page: **{t['reprint_with_conflict']}**",
          f"- HIT sites whose same-line pages from another book include a `conflicts`: "
          f"**{t['hit_with_sibling_conflict']}** of {t['hit_sites_with_sibling_pages']} HIT sites with such pages", '']
    if s['probe']:
        pr = s['probe']
        L += ['## The damaged-text test (C-OBA-7)', '', f"Probe run `{pr['run']['file']}` sha256 `{pr['run']['sha256']}`, "
              f"{pr['run']['scored']} scored.", '', f"- by class: {pr['by_class']}",
              f"- × text quality: {pr['x_text_quality']}", f"- × page: {pr['x_page']}",
              f"- × stratum: {pr['x_stratum']}", f"- class × probe × tier: {pr['x_class_tier']}", '']
    else:
        L += ['## The damaged-text test (C-OBA-7)', '', '_Not yet run: pass `--probe-run`._', '']
    o, oa = s['oracle'], s['oracle_known_defects_aside']
    L += ['## The oracle half (C-OBA-8)', '',
          f"- CITE re-derived from the saved replies: **{o['cite']}/60** (saved rows {o['cite_saved']}; "
          f"every row matches: {o['cite_rederived_matches_saved']})",
          f"- CITE-BEARING: **{rate_cell(o['cite_bearing'])}** (known defects aside: {rate_cell(oa['cite_bearing'])})",
          f"- FACT × CITE-BEARING: {o['fact_x_cite_bearing']}",
          f"- FACT × CITE: {o['fact_x_cite']}",
          f"- CORRECT but not cited: {o['correct_not_cited']}",
          f"- replies with no paged citation: {o['replies_without_paged_citation']}", '',
          '### Every reply and its cited pages', '']
    for r in orows:
        L.append(f"- `{r['site']}` {r['tier']} · FACT {r['fact']} · CITE {r['cite']} · CITE-BEARING "
                 f"{r['cite_bearing']}" + (f" · {r['correct_not_cited']}" if 'correct_not_cited' in r else ''))
        for p in r['pages']:
            L.append(f"  - {p['alias']} {p['pages'][0]}–{p['pages'][1]}: **{p['verdict']}** — {p['reason']}")
        for u in r['unpaged']:
            L.append(f"  - unpaged: {u}")
    L += ['', '## The two O2b leftovers', '']
    for cr in crs:
        if cr['site'] in LEFTOVERS:
            L += trace(cr)
    L += ['', '## Every LOSS and CONFLICT site', '']
    for cr in crs:
        if cr['class'] in ('LOSS', 'CONFLICT'):
            L += trace(cr)
    L += ['', '## Pages read_pages returned nothing for', '']
    L += [f"- {u['kind']} `{u['site']}` {u['alias']} {u['pages']}" for u in out['unread']] or ['- none']
    return '\n'.join(L) + '\n'


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--phase', choices=('pilot', 'full'), required=True)
    ap.add_argument('--db', required=True)
    ap.add_argument('--sites', required=True)
    ap.add_argument('--run', required=True, help='a run.py JSON (the base run)')
    ap.add_argument('--outdir', required=True)
    ap.add_argument('--tag', default='it1')
    ap.add_argument('--oracle-arm', help="O2b tip_arm directory (oracle_arm.json + transcripts/)")
    ap.add_argument('--probe-run', help='run.py JSON of the damaged-text test')
    ap.add_argument('--workers', type=int, default=4)
    ap.add_argument('--ceiling', type=int, default=CEILING)
    a = ap.parse_args(argv)
    if a.workers > 4:
        sys.exit('machine safety: at most 4 judge workers')
    if a.phase == 'full' and not a.oracle_arm:
        sys.exit('--oracle-arm is required for the full run')
    os.makedirs(a.outdir, exist_ok=True)
    conn, sites, run = load(a)
    return run_pilot(a, conn, sites, run) if a.phase == 'pilot' else run_full(a, conn, sites, run)


if __name__ == '__main__':
    sys.exit(main())
