"""Cascade weak-path guard — a weak result carries the PRIMARY search's evidence (ruling
`oracle-o2c-cascade-fix` C-OCF-2; rider `oracle-o2c-cascade-fix-gate` R-OCFG-2).

When neither the primary nor the expanded search is strong, the cascade used to return the EXPANDED
list and discard the primary's. Keeping the primary's top five took the recall benchmark 785 → 820 of
1,356 and the human-authored topics 95 → 99 of 100 — but only the benchmark (a measure, not a gate)
would have noticed the knob going back. This pins it, on three frozen-set questions (the benchmark's
`sites.jsonl`, keyed by address) that the fix turned from misses into hits:

  (a) `cascade.WEAK_PATH_HITS == 'primary'`;
  (b) each question reads `weak`, and its hits are exactly the primary search's deduped top five
      (the same `api.search` call the cascade makes, keyed by canonical family + page);
  (c) NON-VACUOUS: the expanded list's top five differs from the primary's, so (b) can tell the two
      forms apart;
  (d) the question's own page is in the returned five (common.hit_matches — the benchmark's rule).

Bite (recorded in the gate's ADDENDUM 1): with `WEAK_PATH_HITS = 'expanded'` landed in
`swrpg_index/cascade.py`, this guard exits 1.

RE-POINTED by ruling `oracle-o5-blend` (M-O5B-5, instrument norm 3). The shipped cascade no longer runs
the fallback (cascade.CASCADE_FALLBACK = 'retired') and fuses by score (api.HYBRID_FUSION = 'cc'), so
there is no expanded list for WEAK_PATH_HITS to choose against. KEPT: the claim — where a weak result
could carry either list, it carries the primary's — and (a)..(d) as written, now run under the
pre-O5 alternative the lap keeps (fusion 'rrf', fallback 'expand'), set here for the run and restored:
the one setting in which WEAK_PATH_HITS chooses anything. DROPPED: that the SHIPPED cascade exercises
WEAK_PATH_HITS — it does not; that its weak path returns the one search's pages is
`swrpg_index/tests/hybrid_blend.py`'s (c)/(d).

RE-POINTED by ruling `oracle-o7` ADDENDUM 5 (R-O7-11). R-O7-6 narrowed the strength test (a two-leg hit in
the top 5 of both legs is strong too), and the pre-O5 alternative's primary hits carry both leg ranks, so all
three pinned questions read `search` there. The alternative run therefore also sets
`cascade.STRONG_LEG_DEPTH = 0` (the pre-O7 test), beside the other two knobs, restored after: the pre-O5
cascade is reproduced as it was. KEPT: (a)..(d) and the claim. DROPPED: nothing measured.

Usage:  .venv/bin/python -m swrpg_index.tests.cascade_weak_path
Exit 0 on pass; exit 1 on any failure or a harvest short of the three pinned questions.
"""
import json
import os
import sqlite3
import sys

from swrpg_index import DB_PATH
from swrpg_index import api, cascade
from swrpg_index.eval.recall import common as C

SITES_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                          'eval', 'recall', 'sites.jsonl')

# Three of the 36 sites C-OCF-2 gained (Docs/audit_artifacts/oracle_o2c_fix_2026-09/paired_base_vs_tip.md),
# one per tier it touched most: beginner, advanced, core.
PINNED = ['03f5d113dff6', '1573ee8d25e7', '50200242b67a']
LIMIT = 5


def _keys(hits):
    return [f"{cascade.canonical_alias(h.get('alias', ''))}:{h.get('page_start')}" for h in hits]


def main(argv=None):
    if not os.path.exists(DB_PATH):
        print(f'CASCADE-WEAK-PATH GUARD FAILED — no index at {DB_PATH}')
        return 1
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    sites = {s['site']: s for s in (json.loads(l) for l in open(SITES_PATH, encoding='utf-8') if l.strip())
             if s['site'] in PINNED}
    fails = []

    # (a)
    if cascade.WEAK_PATH_HITS != 'primary':
        fails.append(f"(a) cascade.WEAK_PATH_HITS is {cascade.WEAK_PATH_HITS!r}, not 'primary'")

    raw_budget = max(LIMIT * 2, LIMIT + 1)
    shipped = (api.HYBRID_FUSION, cascade.CASCADE_FALLBACK, cascade.STRONG_LEG_DEPTH)
    # the pre-O5 alternative (see above), with the pre-O7 strength test (R-O7-11)
    api.HYBRID_FUSION, cascade.CASCADE_FALLBACK, cascade.STRONG_LEG_DEPTH = 'rrf', 'expand', 0
    try:
        harvest = _pinned(conn, sites, raw_budget, fails)
    finally:
        api.HYBRID_FUSION, cascade.CASCADE_FALLBACK, cascade.STRONG_LEG_DEPTH = shipped

    if harvest < len(PINNED):
        fails.append(f'harvest {harvest}/{len(PINNED)} pinned questions reached the weak path')
    if fails:
        print(f'CASCADE-WEAK-PATH GUARD FAILED — {len(fails)} failure(s); harvest {harvest}/{len(PINNED)}')
        for f in fails:
            print('  ' + f)
        return 1
    print(f'cascade-weak-path guard OK — under the pre-O5 alternative (rrf, expand): harvest '
          f'{harvest}/{len(PINNED)} weak questions return the primary top {LIMIT}, each distinct from the '
          f'expanded list and carrying its own page')
    return 0


def _pinned(conn, sites, raw_budget, fails):
    harvest = 0
    for sid in PINNED:
        s = sites.get(sid)
        if s is None:
            fails.append(f'{sid}: not in the frozen set')
            continue
        q = s['question']
        res = cascade.retrieve_rule_for_query(conn, q, limit=LIMIT)
        primary = cascade._dedup(api.search(conn, q, mode='hybrid', limit=raw_budget, snippet_chars=1200),
                                 limit=LIMIT)
        expanded = cascade._dedup(api.search_expanded(conn, cascade._expand_queries(q), mode='hybrid',
                                                      limit=raw_budget, snippet_chars=1200), limit=LIMIT)
        got = _keys(res['hits'])
        # (b)
        if res['tool_used'] != 'weak':
            fails.append(f"(b) {sid}: tool_used {res['tool_used']!r}, the pin needs 'weak'")
            continue
        if got != _keys(primary):
            fails.append(f'(b) {sid}: returned {got} != primary {_keys(primary)}'
                         + (' — that is the EXPANDED list' if got == _keys(expanded) else ''))
        # (c)
        if _keys(primary) == _keys(expanded):
            fails.append(f'(c) {sid}: primary and expanded agree ({_keys(primary)}) — the pin cannot bite here')
        # (d)
        if not C.first_hit_rank(s, res['hits']):
            fails.append(f"(d) {sid}: its page ({s['alias']} {s['corpus_page_start']}) is not in {got}")
        harvest += 1
    return harvest


if __name__ == '__main__':
    sys.exit(main())
