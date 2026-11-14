"""Retrieval arm of the recall benchmark (C-ORB-5) — re-runnable, no LLM.

Each KEPT question goes through `cascade.retrieve_rule_for_query(conn, question)` at its defaults
(limit 5), exactly as the rules-oracle calls it, and is scored against its site's ADDRESS:

  hit@5   a returned hit in the site's family, in the site's pagination group, whose page range
          overlaps the site's pages (common.hit_matches). The literal family-only reading is
          scored beside it as `hit5_family_only`, so the pagination rule's effect is a number.
  RR      1 / rank of the first such hit (0 when none)
  also    tool_used, wall-clock ms, whether the matching hit carried the bm25 leg, and whether
          the site's address still resolves on this index (exact / anchor / unresolved; C-ORB-9)

Report: overall, per tier, per text-quality stratum, per family and per book — each with n, the rate
and its Wilson 95 % interval — plus MRR, the tool_used distribution and median / p90 ms. A MEASURE,
not a gate: exit 0 whatever the scores; exit 1 only when zero questions were scored (norm 5).

Usage:
  .venv/bin/python -m swrpg_index.eval.recall.run --db <index.db> --sites sites.jsonl \
      --json out.json --md out.md [--only-sites ids.txt] [--questions extractive.jsonl]
`--questions` swaps each site's question for the one in that file (same `site` key): the leakage
control runs the extractive questions through the same scorer this way.
"""
import argparse
import collections
import json
import sqlite3
import statistics
import sys
import time

from ... import cascade as _cascade
from ... import embed as _embed
from . import common as C
from .sample import open_ro


def score_site(conn, site, question, embedder, answer=None):
    t0 = time.perf_counter()
    error = None
    try:
        res = _cascade.retrieve_rule_for_query(conn, question, embedder=embedder)
    except Exception as e:           # the oracle would receive this error: a miss, counted and named
        error = f'{type(e).__name__}: {e}'[:200]
        res = {'hits': [], 'tool_used': f'error:{type(e).__name__}'}
    ms = (time.perf_counter() - t0) * 1000
    hits = res.get('hits') or []
    rank = C.first_hit_rank(site, hits)
    rank_fam = C.first_hit_rank(site, hits, pagination=False)
    bm25 = None
    if rank:
        bm25 = 'bm25' in (hits[rank - 1].get('sources') or [])
    elsewhere = None
    if not rank and answer:
        verdicts = [C.answer_in_text(answer, h.get('snippet') or '') for h in hits[:5]]
        elsewhere = None if all(v is None for v in verdicts) else any(verdicts)
    return {
        'site': site['site'], 'alias': site['alias'], 'family': site['family'], 'tier': site['tier'],
        'text_quality': site['text_quality'], 'page_hostile': site['page_hostile'],
        'stratum': site['stratum'], 'question': question,
        'rank': rank, 'hit5': bool(rank and rank <= 5), 'rr': (1.0 / rank) if rank else 0.0,
        'hit5_family_only': bool(rank_fam and rank_fam <= 5),
        'matched_bm25': bm25, 'answer_elsewhere': elsewhere, 'error': error, 'tool_used': res.get('tool_used'), 'ms': round(ms, 1),
        'resolve': C.resolve(conn, site),
        'top': [[h.get('alias'), h.get('page_start'), h.get('page_end')] for h in hits[:5]],
    }


def _group(rows, key):
    g = collections.defaultdict(list)
    for r in rows:
        g[key(r)].append(r)
    out = {}
    for k in sorted(g):
        rs = g[k]
        hit = sum(r['hit5'] for r in rs)
        row = C.rate_row(hit, len(rs))
        row['mrr'] = round(sum(r['rr'] for r in rs) / len(rs), 4)
        row['hit5_family_only'] = sum(r['hit5_family_only'] for r in rs)
        out[k] = row
    return out


def summarise(rows):
    ms = sorted(r['ms'] for r in rows)
    matched = [r for r in rows if r['matched_bm25'] is not None]
    return {
        'overall': _group(rows, lambda r: 'ALL')['ALL'] if rows else None,
        'by_tier': _group(rows, lambda r: r['tier']),
        'by_quality': _group(rows, lambda r: r['text_quality']),
        'by_page_hostile': _group(rows, lambda r: 'hostile' if r['page_hostile'] else 'clean-page'),
        'by_stratum': _group(rows, lambda r: r['stratum']),
        'by_family': _group(rows, lambda r: r['family']),
        'by_book': _group(rows, lambda r: r['alias']),
        'tool_used': dict(collections.Counter(r['tool_used'] for r in rows)),
        'errors': [[r['site'], r['question'], r['error']] for r in rows if r['error']],
        'misses_answer_elsewhere': sum(1 for r in rows if r['answer_elsewhere']),
        'misses_answer_elsewhere_checkable': sum(1 for r in rows if r['answer_elsewhere'] is not None),
        'resolve': dict(collections.Counter(r['resolve'] for r in rows)),
        'bm25_leg_share_of_hits': (round(sum(r['matched_bm25'] for r in matched) / len(matched), 4)
                                   if matched else None),
        'ms_median': round(statistics.median(ms), 1) if ms else None,
        'ms_p90': round(ms[int(0.9 * (len(ms) - 1))], 1) if ms else None,
    }


def _pct(x):
    return '—' if x is None else f'{100 * x:.1f}%'


def markdown(summary, title):
    L = [f'# {title}', '']
    o = summary['overall']
    L.append(f"**Overall hit@5 {_pct(o['rate'])}** (n={o['n']}, 95% CI {_pct(o['ci95'][0])}–{_pct(o['ci95'][1])}) · "
             f"MRR {o['mrr']} · family-only reading {o['hit5_family_only']}/{o['n']} · "
             f"median {summary['ms_median']} ms, p90 {summary['ms_p90']} ms")
    L.append('')
    L.append(f"tool_used: {summary['tool_used']} · address resolve: {summary['resolve']} · "
             f"bm25 leg on the matching hit: {_pct(summary['bm25_leg_share_of_hits'])}")
    if summary['errors']:
        L += ['', f"**The cascade RAISED on {len(summary['errors'])} question(s)** (scored as misses):", '']
        L += [f"- `{sid}` {q!r} → {err}" for sid, q, err in summary['errors']]
    L.append('')
    L.append(f"Misses whose top-5 carries the recorded answer in ANOTHER book (heuristic: every number and "
             f"content word of the answer in a hit's snippet; thin answers not checked): "
             f"{summary['misses_answer_elsewhere']} of {summary['misses_answer_elsewhere_checkable']} checkable misses")
    for name, key in (('Tier', 'by_tier'), ('Book text quality', 'by_quality'), ('Page', 'by_page_hostile'),
                      ('Stratum', 'by_stratum'), ('Family', 'by_family'), ('Book', 'by_book')):
        L += ['', f'## By {name.lower()}', '', f'| {name} | n | hit@5 | 95% CI | MRR | family-only hits |',
              '|---|---:|---:|---|---:|---:|']
        for k, r in summary[key].items():
            L.append(f"| {k} | {r['n']} | {_pct(r['rate'])} | {_pct(r['ci95'][0])}–{_pct(r['ci95'][1])} | "
                     f"{r['mrr']} | {r['hit5_family_only']} |")
    return '\n'.join(L) + '\n'


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--db', required=True)
    ap.add_argument('--sites', required=True)
    ap.add_argument('--json')
    ap.add_argument('--md')
    ap.add_argument('--title', default='Recall benchmark — retrieval arm')
    ap.add_argument('--only-sites', help='file of site ids, one per line')
    ap.add_argument('--questions', help='JSONL {site, question} overriding each site question')
    a = ap.parse_args(argv)

    conn = open_ro(a.db)
    conn.row_factory = sqlite3.Row      # api/embed read rows by column name, as the MCP server's do
    sites = [json.loads(l) for l in open(a.sites, encoding='utf-8') if l.strip()]
    sites = [s for s in sites if s.get('kept')]
    if a.only_sites:
        only = {l.strip() for l in open(a.only_sites) if l.strip()}
        sites = [s for s in sites if s['site'] in only]
    qs = {s['site']: s['question'] for s in sites}
    if a.questions:
        over = {r['site']: r['question'] for r in
                (json.loads(l) for l in open(a.questions, encoding='utf-8') if l.strip()) if r.get('question')}
        sites = [s for s in sites if s['site'] in over]
        qs = {s['site']: over[s['site']] for s in sites}

    embedder = _embed.default_embedder()
    rows = []
    t0 = time.perf_counter()
    for i, s in enumerate(sites, 1):
        rows.append(score_site(conn, s, qs[s['site']], embedder,
                               answer=None if a.questions else s.get('answer')))
        if i % 100 == 0:
            print(f'  {i}/{len(sites)}', file=sys.stderr, flush=True)
    summary = summarise(rows)
    summary['meta'] = {'db': a.db, 'sites_file': a.sites, 'questions_file': a.questions,
                       'scored': len(rows), 'seconds': round(time.perf_counter() - t0, 1)}
    if a.json:
        with open(a.json, 'w', encoding='utf-8') as f:
            json.dump({'summary': summary, 'rows': rows}, f, indent=1, ensure_ascii=False)
    md = markdown(summary, a.title) if rows else '# no rows\n'
    if a.md:
        with open(a.md, 'w', encoding='utf-8') as f:
            f.write(md)
    o = summary['overall']
    if o:
        print(f"hit@5 {o['k']}/{o['n']} = {_pct(o['rate'])} CI {o['ci95']} · MRR {o['mrr']} · "
              f"family-only {o['hit5_family_only']} · tool_used {summary['tool_used']} · "
              f"resolve {summary['resolve']} · {summary['meta']['seconds']}s")
        for t, r in summary['by_tier'].items():
            print(f"  {t:11} {r['k']}/{r['n']} {_pct(r['rate'])} CI {r['ci95']}")
    print(f'HARVEST: {len(rows)} questions scored' + (' — ZERO IS A FAILED RUN' if not rows else ''))
    return 0 if rows else 1


if __name__ == '__main__':
    sys.exit(main())
