"""Question generator + round-trip filter for the recall benchmark (C-ORB-3, C-ORB-4, C-ORB-8 ii).

For each sampled site:
  1. GENERATE — one call that sees ONLY the passage returns {question, answer} or `unquestionable`.
     If the question shares a run of >= 4 consecutive words with the passage (C-ORB-3's leakage bar),
     it is asked ONCE more with that run named; still over the bar -> rejected `leakage`.
  2. FILTER  — a second, independent call sees the passage and the question only (never the recorded
     answer) and answers. KEPT iff the two answers agree (common.answers_agree: numbers exact).
Every site is written back with its outcome: kept | unquestionable | leakage | filter-disagree |
filter-not-answerable | llm-error. Nothing is dropped.

--mode extractive (C-ORB-8 ii): for a seeded N of the KEPT sites, one more call with copying allowed;
writes {site, question, answer, max_shared_run} to --out.

Usage:
  .venv/bin/python -m swrpg_index.eval.recall.generate --db <index.db> --sample sample.jsonl \
      --out sites.jsonl --log calls.jsonl [--workers 4]
  .venv/bin/python -m swrpg_index.eval.recall.generate --db <index.db> --mode extractive \
      --sample sites.jsonl --n 50 --seed 20260923 --out extractive.jsonl --log calls.jsonl
"""
import argparse
import collections
import concurrent.futures as cf
import json
import random
import sys

from . import common as C
from . import llm
from .sample import open_ro

GEN_SCHEMA = {
    'type': 'object',
    'properties': {
        'question': {'type': 'string'}, 'answer': {'type': 'string'},
        'unquestionable': {'type': 'boolean'}, 'reason': {'type': 'string'},
    },
    'required': ['question', 'answer', 'unquestionable'],
}
FILTER_SCHEMA = {'type': 'object', 'properties': {'answer': {'type': 'string'}}, 'required': ['answer']}


def passage_text(conn, site):
    rows = conn.execute(
        'SELECT text FROM passages WHERE alias=? AND page_start=? AND page_end=?',
        (site['alias'], site['corpus_page_start'], site['corpus_page_end'])).fetchall()
    for (t,) in rows:
        if C.text_sha1(t) == site['anchor_sha1']:
            return t
    return None


def _shared_run_text(question, passage, n):
    q, p = C.words(question), C.words(passage)
    grams = {tuple(p[i:i + n]) for i in range(len(p) - n + 1)}
    for i in range(len(q) - n + 1):
        if tuple(q[i:i + n]) in grams:
            return ' '.join(q[i:i + n])
    return ''


def process(site, text, log):
    out = dict(site)
    gen_msg = 'PASSAGE:\n' + text
    g = llm.call(log, 'generate', 'generator', gen_msg, GEN_SCHEMA)
    _, gsha = llm.prompt('generator')
    out.update({'generator': llm.PIPELINE_MODEL, 'prompt_sha1': gsha, 'leak_retry': False})
    if g.get('is_error'):
        out.update({'kept': False, 'reason': 'llm-error', 'question': '', 'answer': '', 'max_shared_run': None})
        return out
    o = g['output']
    if o.get('unquestionable') or not (o.get('question') or '').strip():
        out.update({'kept': False, 'reason': 'unquestionable', 'question': '', 'answer': '',
                    'max_shared_run': None, 'unquestionable_reason': (o.get('reason') or '')[:200]})
        return out
    q, a = o['question'].strip(), o['answer'].strip()
    run = C.max_shared_run(q, text)
    if run >= C.LEAKAGE_BAR:
        shared = _shared_run_text(q, text, run)
        retry_msg = (gen_msg + '\n\nYOUR PREVIOUS QUESTION WAS:\n' + q +
                     f'\nIt copies the words "{shared}" from the passage. Write a new question in your own '
                     'words that shares no run of 4 or more consecutive words with the passage.')
        g2 = llm.call(log, 'generate-retry', 'generator', retry_msg, GEN_SCHEMA)
        out['leak_retry'] = True
        if not g2.get('is_error') and not g2['output'].get('unquestionable') and g2['output'].get('question'):
            q, a = g2['output']['question'].strip(), g2['output']['answer'].strip()
            run = C.max_shared_run(q, text)
    out.update({'question': q, 'answer': a, 'max_shared_run': run})
    if run >= C.LEAKAGE_BAR:
        out.update({'kept': False, 'reason': 'leakage'})
        return out
    f = llm.call(log, 'filter', 'filter', 'PASSAGE:\n' + text + '\n\nQUESTION:\n' + q, FILTER_SCHEMA)
    _, fsha = llm.prompt('filter')
    out.update({'filter_model': llm.PIPELINE_MODEL, 'filter_prompt_sha1': fsha})
    if f.get('is_error'):
        out.update({'kept': False, 'reason': 'llm-error', 'filter_answer': None})
        return out
    fa = (f['output'].get('answer') or '').strip()
    agree, why = C.answers_agree(a, fa)
    out.update({'filter_answer': fa, 'agree_reason': why})
    if agree:
        out.update({'kept': True, 'reason': 'kept'})
    else:
        not_ans = 'not_answerable' in fa.lower().replace(' ', '_')
        out.update({'kept': False, 'reason': 'filter-not-answerable' if not_ans else 'filter-disagree'})
    return out


def run_pipeline(conn, sites, log, workers):
    texts = {s['site']: passage_text(conn, s) for s in sites}
    results = {}
    missing = [s for s in sites if texts[s['site']] is None]
    for s in missing:
        results[s['site']] = dict(s, kept=False, reason='unresolved', question='', answer='', max_shared_run=None)
    todo = [s for s in sites if texts[s['site']] is not None]
    done = 0
    with cf.ThreadPoolExecutor(max_workers=workers) as ex:
        futs = {ex.submit(process, s, texts[s['site']], log): s for s in todo}
        for fu in cf.as_completed(futs):
            r = fu.result()
            results[r['site']] = r
            done += 1
            if done % 25 == 0:
                print(f'  {done}/{len(todo)}', file=sys.stderr, flush=True)
    return [results[s['site']] for s in sites]


def extractive(conn, sites, log, n, seed, workers):
    kept = [s for s in sites if s.get('kept')]
    pick = random.Random(f'extractive|{seed}').sample(kept, min(n, len(kept)))
    _, esha = llm.prompt('extractive')
    texts = {s['site']: passage_text(conn, s) for s in pick}   # sqlite stays on this thread

    def one(s):
        t = texts[s['site']]
        r = llm.call(log, 'extractive', 'extractive', 'PASSAGE:\n' + t, GEN_SCHEMA)
        o = r.get('output') or {}
        q = (o.get('question') or '').strip()
        return {'site': s['site'], 'question': q, 'answer': (o.get('answer') or '').strip(),
                'max_shared_run': C.max_shared_run(q, t) if q else None,
                'unquestionable': bool(o.get('unquestionable')), 'generator': llm.PIPELINE_MODEL,
                'prompt_sha1': esha, 'error': bool(r.get('is_error'))}
    with cf.ThreadPoolExecutor(max_workers=workers) as ex:
        rows = list(ex.map(one, pick))
    return rows


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--db', required=True)
    ap.add_argument('--sample', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--log', required=True)
    ap.add_argument('--workers', type=int, default=4)
    ap.add_argument('--mode', choices=('questions', 'extractive'), default='questions')
    ap.add_argument('--n', type=int, default=50)
    ap.add_argument('--seed', type=int, default=20260923)
    a = ap.parse_args(argv)
    if a.workers > 4:
        sys.exit('machine safety: at most 4 parallel calls (ruling oracle-recall-benchmark §4)')
    conn = open_ro(a.db)
    sites = [json.loads(l) for l in open(a.sample, encoding='utf-8') if l.strip()]
    log = llm.CallLog(a.log)
    if a.mode == 'extractive':
        rows = extractive(conn, sites, log, a.n, a.seed, a.workers)
        with open(a.out, 'w', encoding='utf-8') as f:
            for r in rows:
                f.write(json.dumps(r, sort_keys=True, ensure_ascii=False) + '\n')
        ok = sum(1 for r in rows if r['question'])
        print(f'extractive: {ok}/{len(rows)} questions; max_shared_run '
              f'{dict(collections.Counter(r["max_shared_run"] for r in rows))}')
        print(f'HARVEST: {ok} questions' + (' — ZERO IS A FAILED RUN' if not ok else ''))
        return 0 if ok else 1
    rows = run_pipeline(conn, sites, log, a.workers)
    with open(a.out, 'w', encoding='utf-8') as f:
        for r in rows:
            f.write(json.dumps(r, sort_keys=True, ensure_ascii=False) + '\n')
    by = collections.defaultdict(collections.Counter)
    for r in rows:
        by[r['stratum']][r['reason']] += 1
        by['ALL'][r['reason']] += 1
    for k in sorted(by):
        print(f'{k:24} {dict(by[k])}')
    runs = collections.Counter(r['max_shared_run'] for r in rows if r['max_shared_run'] is not None)
    print(f'max_shared_run distribution: {dict(sorted(runs.items()))}')
    kept = by['ALL']['kept']
    print(f'HARVEST: {kept} kept of {len(rows)}' + (' — ZERO IS A FAILED RUN' if not kept else ''))
    return 0 if kept else 1


if __name__ == '__main__':
    sys.exit(main())
