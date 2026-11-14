"""Hybrid-blend guard — the search combines its two legs by score, and the cascade makes one search
(ruling `oracle-o5-blend` C-O5B-2/3/4; lever A of `oracle-o4-research`: 810 → 963/1,356 on the recall
benchmark, TREC 98 → 100/100).

Four named settings carry the lap, and the benchmark that measured them is a measure, not a gate — so
this pins each one by its value AND by a behaviour that depends on it, on fixed questions from the frozen
set (`sites.jsonl`, keyed by address; PINNED below):

  (a) the four settings: api.HYBRID_FUSION 'cc', api.HYBRID_CC_ALPHA 0.3, api.HYBRID_POOL 40,
      cascade.CASCADE_FALLBACK 'retired';
  (b) THE POOL: every leg call a cascade makes asks for exactly 40 rows — and api.search asks for 40 at
      limit 3 and at limit 20 too (the pool does not follow the limit);
  (c) ONE SEARCH: each cascade call makes exactly one hybrid api.search and no search_expanded call —
      NON-VACUOUS: at least one pinned question is not strong under the shipped test; the last two
      PINNED sites are the first two kept sites by site id that the shipped cascade calls weak, appended
      when R-O7-6 made the first seven strong (ruling `oracle-o7` ADDENDUM 5, R-O7-12; picks recorded in
      Docs/audit_artifacts/oracle_o7_weak_2026-10/hybrid_blend_picks.txt);
  (d) THE BLEND: each pinned question's cascade pages equal an INDEPENDENT computation of C-O5B-2
      written here (legs at 40 → min-max per leg → 0.3 words + 0.7 meaning → sort → verified-table
      boost → the first five distinct pages of the whole pool); api.search's own order equals it too;
  (e) NON-VACUOUS for (d): the independent computation at alpha 0.5, Reciprocal Rank Fusion over the
      same legs, and the blend cut to its first 10 rows before the page dedup (the pre-O5 cut) each give
      different pages on at least one pinned question — so (d) can tell the shipped blend, and its
      whole-pool page rule, from each (the cut: ruling `oracle-o5-blend-gate` R-O5BG-1);
  (f) a hybrid hit is labelled score_kind 'cc', and every unboosted score lies in [0, 1].

Bites (recorded in the gate): land each mutant in swrpg_index/api.py or cascade.py — HYBRID_CC_ALPHA
0.5; HYBRID_POOL 20; HYBRID_FUSION 'rrf'; CASCADE_FALLBACK 'expand'; and (R-O5BG-1) the cascade's primary
search under 'cc' without page_key at limit 10 — and this guard exits 1.

Usage:  .venv/bin/python -m swrpg_index.tests.hybrid_blend [-v]
Exit 0 on pass; exit 1 on any failure or a harvest short of the pinned questions.
"""
import json
import os
import sqlite3
import sys

from swrpg_index import DB_PATH
from swrpg_index import api, cascade, embed

SITES_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                          'eval', 'recall', 'sites.jsonl')

# Frozen-set sites (Docs/audit_artifacts/oracle_o5_blend_2026-09/guard_pick.txt says how they were
# picked): strong and weak questions, each tier, and pages where alpha 0.5, RRF and a 10-row cut part
# from the blend (the cut: ruling `oracle-o5-blend-gate` R-O5BG-1).
PINNED = ['006652560929', '007330bf49cf', '00dd9448ed29', '01c5360ca83c', '056a1858b609', '069b3f5c925e', '3d89bceadcb0',
          '026427d99bf7', '02b970c4b03c']
LIMIT = 5
POOL = 40
ALPHA = 0.3
VERIFIED_TABLE_BOOST = 2.5
RRF_K = 60


def _page(alias, page_start):
    return f'{cascade.canonical_alias(alias or "")}:{page_start}'


def _minmax(values):
    if not values:
        return []
    lo, hi = min(values), max(values)
    return [1.0] * len(values) if hi == lo else [(v - lo) / (hi - lo) for v in values]


def _legs(conn, q, emb):
    """The two legs as the search fetches them — each is unchanged by the lap (C-O5B-1)."""
    words = api.bm25_leg(conn, q, None, None, POOL)
    meaning, seen = [], set()
    for p in api.semantic_search(conn, q, None, POOL, embedder=emb):
        if p['chunk_id'] not in seen:          # first-seen passage per chunk
            seen.add(p['chunk_id'])
            meaning.append(p)
    return words, meaning


def _ranked_pages(entries, limit=LIMIT):
    """entries: {cid: [score, identity row]} → the first `limit` distinct pages, best first."""
    ordered = sorted(entries.values(), key=lambda e: (-e[0], embed.tie_key(e[1])))
    out = []
    for score, row in ordered:
        key = _page(row['alias'], row['page_start'])
        if key not in out:
            out.append(key)
        if len(out) == limit:
            break
    return out


def blend_pages(words, meaning, alpha, cut=None):
    """C-O5B-2, computed here without api.cc_fuse. `cut` keeps only the first `cut` rows before the page
    dedup — the pre-O5 10-row cut, for (e) only; the shipped rule dedups the whole pool."""
    entries = {}
    for r, w in zip(words, _minmax([-r['rank'] for r in words])):
        entries[r['id']] = [alpha * w, r]
    for p, m in zip(meaning, _minmax([p['similarity'] for p in meaning])):
        e = entries.setdefault(p['chunk_id'], [0.0, p])
        e[0] += (1 - alpha) * m
    for e in entries.values():
        if e[1]['content_type'] == 'verified_table':
            e[0] *= VERIFIED_TABLE_BOOST
    if cut is not None:
        rows = sorted(entries.values(), key=lambda e: (-e[0], embed.tie_key(e[1])))[:cut]
        return _ranked_pages({i: e for i, e in enumerate(rows)})
    return _ranked_pages(entries)


def rrf_pages(words, meaning):
    """Reciprocal Rank Fusion over the same legs (k 60, the pre-O5 10-row cut) — for (e) only."""
    entries = {}
    for rank, r in enumerate(words):
        w = 1.0 if r.get('bm25_all_terms') is not False else api.BM25_PARTIAL_WEIGHT
        entries[r['id']] = [w / (RRF_K + rank + 1), r]
    for rank, p in enumerate(meaning):
        e = entries.setdefault(p['chunk_id'], [0.0, p])
        e[0] += 1.0 / (RRF_K + rank + 1)
    for e in entries.values():
        if e[1]['content_type'] == 'verified_table':
            e[0] *= VERIFIED_TABLE_BOOST
    top10 = sorted(entries.values(), key=lambda e: (-e[0], embed.tie_key(e[1])))[:10]
    return _ranked_pages({i: e for i, e in enumerate(top10)})


class _Recorder:
    """Counts the calls the cascade makes, and the pool each leg is asked for, without changing them."""

    def __init__(self):
        self.orig = {n: getattr(api, n) for n in ('bm25_leg', 'semantic_search', 'search', 'search_expanded')}
        self.reset()

    def reset(self):
        self.leg_limits, self.searches, self.expanded = [], [], 0

    def __enter__(self):
        o = self.orig

        def bm25_leg(conn, query, alias_filter=None, content_type=None, limit=20):
            self.leg_limits.append(('words', limit))
            return o['bm25_leg'](conn, query, alias_filter, content_type, limit)

        def semantic_search(conn, query, alias_filter=None, limit=20, embedder=None):
            self.leg_limits.append(('meaning', limit))
            return o['semantic_search'](conn, query, alias_filter, limit, embedder=embedder)

        def search(conn, query, mode='hybrid', *a, **k):
            self.searches.append(mode)
            return o['search'](conn, query, mode, *a, **k)

        def search_expanded(*a, **k):
            self.expanded += 1
            return o['search_expanded'](*a, **k)

        api.bm25_leg, api.semantic_search = bm25_leg, semantic_search
        api.search, api.search_expanded = search, search_expanded
        return self

    def __exit__(self, *exc):
        for n, f in self.orig.items():
            setattr(api, n, f)


def main(argv=None):
    verbose = '-v' in (argv or sys.argv[1:])
    if not os.path.exists(DB_PATH):
        print(f'HYBRID-BLEND GUARD FAILED — no index at {DB_PATH}')
        return 1
    conn = sqlite3.connect(f'file:{DB_PATH}?mode=ro', uri=True)
    conn.row_factory = sqlite3.Row
    emb = embed.default_embedder()
    sites = {s['site']: s for s in (json.loads(l) for l in open(SITES_PATH, encoding='utf-8') if l.strip())
             if s['site'] in PINNED}
    fails = []

    # (a)
    for name, got, want in (('api.HYBRID_FUSION', api.HYBRID_FUSION, 'cc'),
                            ('api.HYBRID_CC_ALPHA', api.HYBRID_CC_ALPHA, ALPHA),
                            ('api.HYBRID_POOL', api.HYBRID_POOL, POOL),
                            ('cascade.CASCADE_FALLBACK', cascade.CASCADE_FALLBACK, 'retired')):
        if got != want:
            fails.append(f'(a) {name} is {got!r}, the shipped value is {want!r}')

    harvest = not_strong = alpha_parts = rrf_parts = cut_parts = 0
    rec = _Recorder()
    for sid in PINNED:
        s = sites.get(sid)
        if s is None:
            fails.append(f'{sid}: not in the frozen set')
            continue
        q = s['question']
        with rec:
            rec.reset()
            res = cascade.retrieve_rule_for_query(conn, q, limit=LIMIT, embedder=emb)
            legs, searches, expanded = list(rec.leg_limits), list(rec.searches), rec.expanded
        got = [_page(h['alias'], h['page_start']) for h in res['hits']]
        # (b)
        if sorted(legs) != [('meaning', POOL), ('words', POOL)]:
            fails.append(f'(b) {sid}: the cascade asked the legs for {legs}, not 40 rows each, once')
        # (c)
        if searches != ['hybrid'] or expanded:
            fails.append(f'(c) {sid}: {len(searches)} search call(s) {searches} and {expanded} '
                         f'search_expanded call(s) — the cascade makes ONE hybrid search')
        if not cascade.is_strong(res['hits']):
            not_strong += 1
        # (d)
        words, meaning = _legs(conn, q, emb)
        want = blend_pages(words, meaning, ALPHA)
        if got != want:
            fails.append(f'(d) {sid}: cascade pages {got} != the blend computed here {want}')
        raw = api.search(conn, q, mode='hybrid', limit=POOL, embedder=emb)   # the fused pool's first 40
        order = []
        for h in raw:
            k = _page(h['alias'], h['page_start'])
            if k not in order:
                order.append(k)
        if order[:LIMIT] != want:
            fails.append(f'(d) {sid}: api.search order {order[:LIMIT]} != the blend computed here {want}')
        # (e)
        alpha_parts += blend_pages(words, meaning, 0.5) != want
        rrf_parts += rrf_pages(words, meaning) != want
        cut_parts += blend_pages(words, meaning, ALPHA, cut=10) != want
        # (f)
        for h in raw:
            if h['score_kind'] != 'cc':
                fails.append(f"(f) {sid}: a hybrid hit is labelled score_kind {h['score_kind']!r}")
                break
            if h['content_type'] != 'verified_table' and not 0.0 <= h['score'] <= 1.0:
                fails.append(f"(f) {sid}: unboosted score {h['score']} outside [0, 1]")
                break
        harvest += 1
        if verbose:
            print(f"  {sid} {res['tool_used']:7} {got}")

    # (b) the pool does not follow the limit
    for lim in (3, 20):
        with rec:
            rec.reset()
            api.search(conn, 'How is soak calculated?', mode='hybrid', limit=lim, embedder=emb)
            legs = list(rec.leg_limits)
        if sorted(legs) != [('meaning', POOL), ('words', POOL)]:
            fails.append(f'(b) api.search(limit={lim}) asked the legs for {legs}, not 40 rows each')
    # (c) / (e) non-vacuous
    if not not_strong:
        fails.append('(c) every pinned question is strong — the fallback check cannot bite here')
    if not alpha_parts:
        fails.append('(e) alpha 0.5 gives the same pages on every pinned question — (d) cannot tell it apart')
    if not rrf_parts:
        fails.append('(e) RRF gives the same pages on every pinned question — (d) cannot tell it apart')
    if not cut_parts:
        fails.append('(e) a 10-row cut gives the same pages on every pinned question — (d) cannot tell the '
                     'whole-pool rule apart')
    if harvest < len(PINNED) or not PINNED:
        fails.append(f'harvest {harvest}/{len(PINNED)} pinned questions')

    if fails:
        print(f'HYBRID-BLEND GUARD FAILED — {len(fails)} failure(s); harvest {harvest}/{len(PINNED)}')
        for f in fails:
            print('  ' + f)
        return 1
    print(f'hybrid-blend guard OK — harvest {harvest}/{len(PINNED)}: settings cc / 0.3 / 40 / retired; the '
          f'cascade makes one search at 40 rows a leg ({not_strong} not strong); its pages equal the blend '
          f'computed here; alpha 0.5 parts on {alpha_parts}, RRF on {rrf_parts}, a 10-row cut on {cut_parts}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
