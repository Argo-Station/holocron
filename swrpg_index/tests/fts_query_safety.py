"""FTS query-safety guard — no question crashes the search, and the BM25 leg answers real questions.

Ruling `oracle-o2a-search-repair` (ORACLE O2a), measured on O1's frozen recall benchmark:

  F1  A query carrying `"`, ` OR ` or ` NEAR(` went to FTS5 `MATCH` raw (`api.fts_phrase`), on the
      theory the caller typed FTS5 on purpose. A natural question with a quotation mark in it is not
      valid FTS5, so `sqlite3.OperationalError` rose out of `api.search`, `search_expanded` and the
      cascade: 35 of the benchmark's 1,356 questions (`tool_used: error:OperationalError`).
  F2  The BM25 leg ANDed every word of the question, stopwords included, so it almost never matched a
      real question: on 0.71 % of the benchmark's matching hits.

This guard keeps both executable (C-OSR-1):

  (a) benchmark crashers — the 35 questions that raised at the base commit (16477af0), read from
      `swrpg_index/eval/recall/sites.jsonl` by `site` (never a copied string), each through
      `cascade.retrieve_rule_for_query` and `api.search`: none raises.
  (b) hostile strings    — an FTS5-syntax fixture (unbalanced and balanced quotes, parentheses, `*`, `:`,
      `^`, a leading `-`, the boolean keywords, `NEAR(`, empty and whitespace-only) through
      `api.search` (bm25 and hybrid), `api.search_expanded`, `api.topic`, the cascade, and a direct
      `MATCH` of `api.fts_phrase` / `api.fts_any` (the expression `topic()`'s FTS fallback, the CLI and
      `tests/queries.py` hand to FTS5): none raises.
  (c) F2 pin             — ten benchmark questions whose BM25 leg returned NOTHING at the base commit:
      `api.search(mode='bm25')` now returns the question's own page (its site's address, by
      `eval.recall.common.hit_matches`) in the leg's pool.

Run:
    .venv/bin/python -m swrpg_index.tests.fts_query_safety            # all cases
    .venv/bin/python -m swrpg_index.tests.fts_query_safety --verbose  # per-case detail

Exit 1 on any failure, each named. States its HARVEST (instrument norm 5); a harvest short of 35
crashers, of the fixture, or of the ten pins is a FAILED run.

BITE (measured when the guard landed, ruling `oracle-o2a-search-repair` C-OSR-1):
  * at the base commit 16477af0 (the whole lap reverted) → exit 1, 132 failures: (a) 70 (35 questions
    × cascade + api.search), (b) 52 (30 OperationalError — the quoted, boolean, NEAR and empty
    strings; 22 AttributeError, `fts_any` not yet existing), (c) 10/10 (the leg returned nothing).
    Record: Docs/audit_artifacts/oracle_o2a_2026-09/guard_fts_query_safety_at_base.txt.
  * `api.fts_phrase`'s raw passthrough restored alone → exit 1: (a) 70, (b) 21, (c) 0.
  * `api.bm25_leg` searching `fts_phrase(query)` instead of `fts_any(query)` → exit 1: (c) 10 only.
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

# (a) — the `site` keys whose question raised OperationalError at 16477af0
# (Docs/audit_artifacts/oracle_o2a_2026-09/ab_base_full.json, `summary.errors`).
BASE_CRASHERS = [
    '1017c5cd42b1', '17eea7487de3', '17fe8c02f019', '1f17f5fddb1f', '3ee043f57102', '46ebd7d1a2ab',
    '473c468f5e48', '489daece417f', '49f8e2385e8c', '52aca7a91460', '5368977a06e3', '5c247a5bfc00',
    '6a28aca12504', '6c74301ceb8f', '763b4c59cc5c', '7b6602d8ccce', '82fae2fbe65d', '8d875c5ac1e1',
    '8ed818a1e2d9', '96fc5d640f93', 'a377ca9a12c2', 'a99f4f71e5d9', 'aca7f129b2cb', 'b0feeca9d5a2',
    'b327a473098d', 'bdca08440ee2', 'c449953efe1c', 'cf3a2204bb29', 'e0f4f7f03311', 'edcd489784b6',
    'f19feb2d7e8b', 'f25076091517', 'f822896045ca', 'f9411b819a01', 'fd0c4d47c253',
]

# (b)
HOSTILE = [
    'what does the "Dedication talent do',       # unbalanced quote
    'what does the "Dedication" talent do?',     # balanced quote, trailing ?
    '"',                                         # a lone quote
    '""',
    'attack (ranged',
    'attack ranged)',
    '(melee)',
    'boost* dice',
    'skill: athletics',
    'difficulty ^ 2',
    '-setback dice',
    'minion OR rival',
    'minion AND rival',
    'minion NOT rival',
    'NEAR(minion rival)',
    'minion NEAR(rival, 3)',
    'AND',
    'OR NOT',
    '* : ^ ( ) - "',
    '',
    '   ',
    '\t\n',
]

# (c) — kept sites whose BM25 leg (then: every word ANDed) returned 0 rows at 16477af0 — 1,299 of the
# 1,321 kept non-crashers did — the first ten by `site` whose own page the repaired leg pools.
F2_PINS = [
    '006652560929', '00dd9448ed29', '00e082d5044c', '00f1a24a6250', '0128ab163bdf', '01c2f884ccc9',
    '01d8bed923e8', '01f3db55582e', '01fbc27afd09', '0234ebe8c456',
]
F2_POOL = 40      # the cascade's primary pool per leg (limit 5 → raw budget 10 → 40)


def _sites():
    with open(SITES_PATH, encoding='utf-8') as f:
        return {s['site']: s for s in (json.loads(l) for l in f if l.strip())}


def _match(conn, expr):
    if expr:
        conn.execute('SELECT rowid FROM chunks_fts WHERE chunks_fts MATCH ? LIMIT 1', (expr,)).fetchall()


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    verbose = '--verbose' in argv or '-v' in argv
    if not os.path.exists(DB_PATH):
        print(f'FTS-QUERY-SAFETY GUARD FAILED — no index at {DB_PATH}')
        return 1
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    sites = _sites()
    fails = []
    harvest = {'crashers': 0, 'hostile_calls': 0, 'pins': 0}

    def attempt(label, fn):
        try:
            fn()
            return True
        except Exception as e:  # noqa: BLE001 — any raise is the defect this guard names
            fails.append(f'{label} RAISED {type(e).__name__}: {str(e)[:120]}')
            return False

    # (a)
    for sid in BASE_CRASHERS:
        s = sites.get(sid)
        if s is None:
            fails.append(f'(a) site {sid} is not in sites.jsonl — the frozen set moved')
            continue
        q = s['question']
        harvest['crashers'] += 1
        ok = attempt(f'(a) {sid} cascade {q!r}', lambda: cascade.retrieve_rule_for_query(conn, q))
        ok = attempt(f'(a) {sid} api.search {q!r}', lambda: api.search(conn, q)) and ok
        if verbose:
            print(f"  (a) {'ok ' if ok else 'RED'} {sid} {q[:70]!r}")

    # (b)
    for q in HOSTILE:
        calls = [
            ('api.search bm25', lambda: api.search(conn, q, mode='bm25')),
            ('api.search hybrid', lambda: api.search(conn, q)),
            ('api.search_expanded', lambda: api.search_expanded(conn, [q, 'minion ' + q])),
            ('api.topic', lambda: api.topic(conn, q)),
            ('cascade', lambda: cascade.retrieve_rule_for_query(conn, q)),
            ('MATCH fts_phrase', lambda: _match(conn, api.fts_phrase(q))),
            ('MATCH fts_any', lambda: _match(conn, api.fts_any(q))),
        ]
        ok = True
        for name, fn in calls:
            harvest['hostile_calls'] += 1
            ok = attempt(f'(b) {name} {q!r}', fn) and ok
        if verbose:
            print(f"  (b) {'ok ' if ok else 'RED'} {q!r}")

    # (c)
    for sid in F2_PINS:
        s = sites.get(sid)
        if s is None:
            fails.append(f'(c) site {sid} is not in sites.jsonl — the frozen set moved')
            continue
        q = s['question']
        try:
            rows = api.search(conn, q, mode='bm25', limit=F2_POOL)
        except Exception as e:  # noqa: BLE001
            fails.append(f'(c) {sid} RAISED {type(e).__name__}: {str(e)[:120]}')
            continue
        harvest['pins'] += 1
        rank = C.first_hit_rank(s, rows)
        if verbose:
            print(f"  (c) {'ok ' if rank else 'RED'} {sid} bm25 rows={len(rows)} own page at "
                  f"{rank or '—'} {q[:60]!r}")
        if not rank:
            fails.append(f'(c) {sid} {q!r}: the BM25 leg returned {len(rows)} row(s) and not the '
                         f'question\'s own page ({s["alias"]} corpus p.{s["corpus_page_start"]}) — '
                         f'the leg is not answering real questions (F2)')

    conn.close()
    h = (f"harvest: {harvest['crashers']}/{len(BASE_CRASHERS)} benchmark crashers, "
         f"{len(HOSTILE)} hostile strings / {harvest['hostile_calls']} calls, "
         f"{harvest['pins']}/{len(F2_PINS)} F2 pins")
    if (harvest['crashers'] != 35 or len(BASE_CRASHERS) != 35 or harvest['pins'] != 10
            or len(F2_PINS) != 10 or harvest['hostile_calls'] == 0):
        fails.append('harvest short — the guard did not measure what it names (instrument norm 5)')
    if fails:
        print(f'FTS-QUERY-SAFETY GUARD FAILED — {len(fails)} failure(s); {h}')
        for f in fails:
            print('  ' + f)
        return 1
    print(f'fts-query-safety guard OK — {h}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
