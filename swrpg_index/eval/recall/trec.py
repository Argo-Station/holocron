"""The human-authored arm (C-ORB-7): the July TREC topics, re-keyed from chunk ids to addresses.

The July harness (`Docs/audit_artifacts/level_2_*`) keyed its 553 qrels by chunk ids that a later
re-ingest re-minted, so every one of them is dead as written. Each qrel is re-keyed through
`level_2_pool.tsv`, whose row for (topic, chunk_id) recorded the alias and pages at the time:

  REKEY  qrel -> pool row (topic, chunk_id) -> {alias, family, corpus pages, anchor (pool snippet)}
         no pool row                          -> dropped `no-pool-row` (counted, never guessed)
         alias no longer on the index         -> dropped `alias-gone`
         pages absent from the index now      -> dropped `page-gone`
  The anchor is the first 80 characters of the pool's snippet; the pool carries a snippet, not the
  passage, so there is no text hash (anchor_sha1 null) and resolution is by alias + pages.

  RUN    each topic's query through cascade.retrieve_rule_for_query at defaults (as the oracle calls
         it); hit@5 iff a top-5 hit matches ANY relevant qrel of the topic (common.hit_matches, the
         same rule as the synthetic arm). Relevant = grade >= 1 (TREC convention); grade >= 2 is
         reported beside it. Topics with no relevant qrel left are counted and not scored.

Topics: 95 in level_2_topic_candidates_working.tsv (proposed_query) + 5 in level_2_topics.tsv (query).

Usage:
  .venv/bin/python -m swrpg_index.eval.recall.trec --db <index.db> --rekey-out trec_rekeyed.jsonl \
      [--json out.json --md out.md]
"""
import argparse
import collections
import csv
import json
import os
import sqlite3
import sys
import time

from ... import cascade as _cascade
from ... import embed as _embed
from . import common as C
from .sample import open_ro

ART = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'Docs', 'audit_artifacts')


def _tsv(name):
    with open(os.path.join(ART, name), encoding='utf-8', newline='') as f:
        return list(csv.reader(f, delimiter='\t', quoting=csv.QUOTE_NONE))


def load_topics():
    topics = {}
    rows = _tsv('level_2_topic_candidates_working.tsv')
    h = rows[0]
    for r in rows[1:]:
        d = dict(zip(h, r))
        topics[d['candidate_id']] = d['proposed_query']
    rows = _tsv('level_2_topics.tsv')
    h = rows[0]
    for r in rows[1:]:
        d = dict(zip(h, r))
        topics[d['topic_id']] = d['query']
    return topics


def rekey(conn):
    topics = load_topics()
    pool = {}
    rows = _tsv('level_2_pool.tsv')
    h = rows[0]
    for r in rows[1:]:
        d = dict(zip(h, r))
        pool[(d['topic_id'], d['chunk_id'])] = d
    aliases = {r[0] for r in conn.execute('SELECT alias FROM pdfs')}
    dropped = collections.Counter()
    dropped_detail = []
    out = collections.defaultdict(list)
    n_qrels = 0
    for topic, _, chunk_id, grade in _tsv('level_2_qrels.tsv'):
        n_qrels += 1
        d = pool.get((topic, chunk_id))
        if d is None:
            dropped['no-pool-row'] += 1
            continue
        alias, ps, pe = d['alias'], int(d['page_start']), int(d['page_end'])
        if alias not in aliases:
            dropped['alias-gone'] += 1
            dropped_detail.append([topic, chunk_id, alias, ps, pe])
            continue
        if not conn.execute('SELECT 1 FROM chunks WHERE alias=? AND page_start<=? AND page_end>=? LIMIT 1',
                            (alias, pe, ps)).fetchone():
            dropped['page-gone'] += 1
            continue
        out[topic].append({'alias': alias, 'family': C.family_of(alias), 'corpus_page_start': ps,
                           'corpus_page_end': pe, 'anchor': C.normalise(d.get('snippet_chars'))[:C.ANCHOR_CHARS],
                           'anchor_sha1': None, 'grade': int(grade)})
    rekeyed = [{'topic': t, 'query': topics.get(t), 'qrels': out.get(t, [])} for t in sorted(topics)]
    stats = {'topics': len(topics), 'qrels': n_qrels, 'rekeyed': sum(len(v) for v in out.values()),
             'dropped': dict(dropped), 'dropped_detail': dropped_detail,
             'topics_without_query': sorted(t for t in out if t not in topics)}
    return rekeyed, stats


def run(conn, rekeyed):
    emb = _embed.default_embedder()
    rows = []
    for t in rekeyed:
        rel1 = [q for q in t['qrels'] if q['grade'] >= 1]
        rel2 = [q for q in t['qrels'] if q['grade'] >= 2]
        if not rel1 or not t['query']:
            rows.append({'topic': t['topic'], 'scored': False})
            continue
        t0 = time.perf_counter()
        res = _cascade.retrieve_rule_for_query(conn, t['query'], embedder=emb)
        ms = (time.perf_counter() - t0) * 1000
        hits = res.get('hits') or []

        def best(qs, pagination=True):
            ranks = [r for r in (C.first_hit_rank(q, hits, pagination=pagination) for q in qs) if r]
            return min(ranks) if ranks else None
        r1, r2, rf = best(rel1), best(rel2) if rel2 else None, best(rel1, pagination=False)
        # SINGLE TARGET — comparable to a synthetic site, which has exactly one relevant page: the
        # topic's first top-grade qrel in address order.
        top_grade = max(q['grade'] for q in rel1)
        single = sorted((q for q in rel1 if q['grade'] == top_grade),
                        key=lambda q: (q['alias'], q['corpus_page_start'], q['corpus_page_end']))[0]
        rs = C.first_hit_rank(single, hits)
        rows.append({'topic': t['topic'], 'scored': True, 'query': t['query'], 'n_rel': len(rel1),
                     'rank': r1, 'hit5': bool(r1), 'rr': 1.0 / r1 if r1 else 0.0,
                     'has_grade2': bool(rel2), 'hit5_grade2': bool(r2),
                     'hit5_family_only': bool(rf), 'hit5_single': bool(rs), 'rr_single': 1.0 / rs if rs else 0.0,
                     'single_target': [single['alias'], single['corpus_page_start'], single['grade']], 'tool_used': res.get('tool_used'), 'ms': round(ms, 1),
                     'top': [[h.get('alias'), h.get('page_start'), h.get('page_end')] for h in hits[:5]]})
    return rows


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--db', required=True)
    ap.add_argument('--rekey-out', required=True)
    ap.add_argument('--json')
    ap.add_argument('--md')
    a = ap.parse_args(argv)
    conn = open_ro(a.db)
    conn.row_factory = sqlite3.Row
    rekeyed, stats = rekey(conn)
    with open(a.rekey_out, 'w', encoding='utf-8') as f:
        for t in rekeyed:
            f.write(json.dumps(t, ensure_ascii=False, sort_keys=True) + '\n')
    print(f"rekey: {stats['qrels']} qrels -> {stats['rekeyed']} re-keyed; dropped {stats['dropped']}; "
          f"{stats['topics']} topics")
    rows = run(conn, rekeyed)
    sc = [r for r in rows if r['scored']]
    k = sum(r['hit5'] for r in sc)
    g2 = [r for r in sc if r['has_grade2']]
    summary = {
        'rekey': stats, 'topics_scored': len(sc), 'topics_unscored': len(rows) - len(sc),
        'hit5': C.rate_row(k, len(sc)), 'mrr': round(sum(r['rr'] for r in sc) / len(sc), 4) if sc else None,
        'hit5_grade2': C.rate_row(sum(r['hit5_grade2'] for r in g2), len(g2)),
        'hit5_family_only': sum(r['hit5_family_only'] for r in sc),
        'hit5_single_target': C.rate_row(sum(r['hit5_single'] for r in sc), len(sc)),
        'mrr_single_target': round(sum(r['rr_single'] for r in sc) / len(sc), 4) if sc else None,
        'relevant_pages_per_topic_mean': round(sum(r['n_rel'] for r in sc) / len(sc), 2) if sc else None,
        'tool_used': dict(collections.Counter(r['tool_used'] for r in sc)),
    }
    if a.json:
        json.dump({'summary': summary, 'rows': rows}, open(a.json, 'w'), indent=1, ensure_ascii=False)
    if a.md:
        h = summary['hit5']
        with open(a.md, 'w') as f:
            f.write('# Human-authored arm — the July TREC topics, re-keyed by address (C-ORB-7)\n\n')
            f.write(f"Re-key: {stats['qrels']} qrels → {stats['rekeyed']} re-keyed; dropped {stats['dropped']}.\n\n")
            f.write(f"Topics scored {len(sc)} of {len(rows)} (a topic needs a relevant qrel and a query).\n\n")
            f.write(f"**hit@5 {h['k']}/{h['n']} = {100 * h['rate']:.1f}%** (95% CI {100 * h['ci95'][0]:.1f}–"
                    f"{100 * h['ci95'][1]:.1f}%) · MRR {summary['mrr']} · grade≥2 only: "
                    f"{summary['hit5_grade2']['k']}/{summary['hit5_grade2']['n']} · family-only reading "
                    f"{summary['hit5_family_only']} · tool_used {summary['tool_used']}\n\n")
            st = summary['hit5_single_target']
            f.write(f"**Single target** (one top-grade page per topic, as a synthetic site has one): hit@5 "
                    f"{st['k']}/{st['n']} = {100 * st['rate']:.1f}% (95% CI {100 * st['ci95'][0]:.1f}–"
                    f"{100 * st['ci95'][1]:.1f}%) · MRR {summary['mrr_single_target']} · relevant pages per "
                    f"topic, mean {summary['relevant_pages_per_topic_mean']}\n\n")
            f.write('The July qrels were judged over a POOL built from the July system\'s own top results, so '
                    'every judged page is one retrieval already surfaced (pool bias), and a topic counts as '
                    'a hit when ANY of its relevant pages is returned.\n')
    print(f"single-target hit@5 {summary['hit5_single_target']['k']}/{len(sc)} MRR {summary['mrr_single_target']}")
    print(f"hit@5 {k}/{len(sc)} MRR {summary['mrr']} grade2 {summary['hit5_grade2']['k']}/{len(g2)} "
          f"tool_used {summary['tool_used']}")
    print(f'HARVEST: {len(sc)} topics scored' + (' — ZERO IS A FAILED RUN' if not sc else ''))
    return 0 if sc else 1


if __name__ == '__main__':
    sys.exit(main())
