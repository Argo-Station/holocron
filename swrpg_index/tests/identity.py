"""Retrieval identity guard — a result's book name is present on BOTH legs.

The rules oracle cites the `book` field, and the community marker
("… (community, v0.8)") lives ONLY on that field. So a result that arrives
without a book name is a community passage that can be quoted as canon.

P2 measured the defect (`Docs/gates/tor-p2-separation-gate.md`): the BM25 leg
joined `pdfs` and carried identity; the semantic leg hardcoded None. Whether a
fan book was labelled therefore depended on HOW THE USER PHRASED THE QUESTION —
keyword phrasings reached it by BM25 and were labelled, conversational phrasings
reached it by meaning and were not. R-TP2-2's corollary is why this guard tests
both legs AND both phrasings rather than one of each.

The cases below are the fix's acceptance criteria, kept executable:

  1. no-null-identity      — no hit, on any mode, has book=None or tier=None.
  2. cross-leg-agreement   — the same chunk, same query, retrieved by bm25 and
                             by semantic, reports the SAME book. This is P2's
                             same-chunk control, kept as a fixture.
  3. both-phrasings-marked — the community chunk carries its marker whether the
                             question is phrased conversationally or as keywords.
  4. community-self-labels — every hit from a community-marked book carries the
                             marker, so no oracle discipline has to remember it.

Run:
    python3 -m swrpg_index.tests.identity            # all cases
    python3 -m swrpg_index.tests.identity --verbose  # show per-hit detail

MUTANT CHECK (how to prove this guard still bites): restore the old behaviour by
hardcoding `'book_name': None, 'tier': None` in `api.rrf_fuse`'s synthesized row,
or by dropping the `LEFT JOIN pdfs` from `embed.semantic_search`. Cases 1-4 must
go red. A guard that stays green under that edit is not protecting anything.
"""
import os
import sqlite3
import sys

from swrpg_index import DB_PATH
import swrpg_index.api as api

MODES = ('bm25', 'semantic', 'hybrid')

# The P2 control: a community book whose passage is the real answer to a
# question about a career that has no canon equivalent.
CONTROL_ALIAS  = 'old-republic-v08'
CONTROL_MARKER = '(community, v0.8)'
CONVERSATIONAL = 'What are the career skills for the Sith career?'
KEYWORD        = 'Sith career skills'

# Spread across canon and community, and across phrasing styles, so case 1 is a
# sweep rather than a single lucky query.
SWEEP_QUERIES = [
    CONVERSATIONAL,
    KEYWORD,
    'What are the starting characteristics for a Twi\'lek?',
    'lightsaber critical injury table',
    'How does the Force Rating advance?',
    'stimpack healing',
]


def _search(conn, query, mode, limit=5):
    return api.search(conn, query, mode=mode, limit=limit)


def _community_aliases(conn):
    """Books that self-declare as community in their `pdfs.name`."""
    return {
        r[0]: r[1] for r in conn.execute(
            "SELECT alias, name FROM pdfs WHERE name LIKE '%(community%'"
        )
    }


# ── Cases ────────────────────────────────────────────────────────────────

def case_no_null_identity(conn, verbose=False):
    """Every hit, every mode, carries a book name and a tier."""
    offenders = []
    checked = 0
    for q in SWEEP_QUERIES:
        for mode in MODES:
            for h in _search(conn, q, mode):
                checked += 1
                if h.get('book') is None or h.get('tier') is None:
                    offenders.append(
                        f'{mode}/{h["alias"]} p{h.get("page_start")} '
                        f'book={h.get("book")!r} tier={h.get("tier")!r} '
                        f'(query: {q!r})'
                    )
                elif verbose:
                    print(f'          {mode:<9} {h["alias"]:<20} book={h["book"]!r}')
    if offenders:
        return False, (f'{len(offenders)}/{checked} hits missing identity; first: '
                       + offenders[0])
    return True, f'{checked} hits across {len(SWEEP_QUERIES)} queries x {len(MODES)} modes, all identified'


def case_cross_leg_agreement(conn, verbose=False):
    """P2's same-chunk control: bm25 and semantic must agree on the book."""
    by_leg = {}
    for mode in ('bm25', 'semantic'):
        for h in _search(conn, KEYWORD, mode, limit=10):
            if h['alias'] == CONTROL_ALIAS:
                by_leg[mode] = (h.get('book'), h.get('tier'))
                break
    missing = [m for m in ('bm25', 'semantic') if m not in by_leg]
    if missing:
        return False, f'control chunk {CONTROL_ALIAS} not returned by: {", ".join(missing)}'
    if by_leg['bm25'] != by_leg['semantic']:
        return False, (f'legs disagree — bm25={by_leg["bm25"]!r} '
                       f'semantic={by_leg["semantic"]!r}')
    book, tier = by_leg['bm25']
    if book is None or CONTROL_MARKER not in book:
        return False, f'agreed book lacks the community marker: {book!r}'
    if verbose:
        print(f'          both legs -> {book!r} [{tier}]')
    return True, f'both legs agree: {book!r}'


def case_both_phrasings_marked(conn, verbose=False):
    """The marker survives conversational phrasing, not just keyword phrasing."""
    failures = []
    seen_any = []
    for label, q in (('conversational', CONVERSATIONAL), ('keyword', KEYWORD)):
        for mode in MODES:
            hits = [h for h in _search(conn, q, mode, limit=5)
                    if h['alias'] == CONTROL_ALIAS]
            if not hits:
                continue  # ranking didn't surface it on this route; not a labelling fact
            seen_any.append(f'{label}/{mode}')
            for h in hits:
                book = h.get('book')
                if book is None or CONTROL_MARKER not in book:
                    failures.append(f'{label}/{mode}: book={book!r}')
    if not seen_any:
        return False, 'control chunk surfaced on NO route — fixture is stale, not passing'
    if failures:
        return False, 'unmarked on ' + '; '.join(failures)
    if verbose:
        print(f'          marked on: {", ".join(seen_any)}')
    return True, f'marked on every route that returned it ({len(seen_any)}: {", ".join(seen_any)})'


def case_community_self_labels(conn, verbose=False):
    """Any hit from a community book carries its marker — on every mode."""
    community = _community_aliases(conn)
    if not community:
        return False, 'no community-marked books in `pdfs` — fixture is stale'
    failures = []
    hits_seen = 0
    for q in SWEEP_QUERIES:
        for mode in MODES:
            for h in _search(conn, q, mode):
                if h['alias'] not in community:
                    continue
                hits_seen += 1
                book = h.get('book')
                if book is None or '(community' not in book:
                    failures.append(f'{mode}/{h["alias"]} book={book!r} (query: {q!r})')
    if failures:
        return False, f'{len(failures)} community hit(s) unlabelled; first: {failures[0]}'
    if hits_seen == 0:
        return False, ('no community book appeared in any sweep result — the guard '
                       'cannot prove labelling; fixture is stale')
    if verbose:
        print(f'          {hits_seen} community hit(s), all carrying the marker')
    return True, f'{hits_seen} community hit(s) across the sweep, all labelled'


CASES = [
    ('no-null-identity',      case_no_null_identity,
     'a null book name is an unlabelled community passage waiting to be cited as canon'),
    ('cross-leg-agreement',   case_cross_leg_agreement,
     "P2's same-chunk control — identity must not depend on which leg found the chunk"),
    ('both-phrasings-marked', case_both_phrasings_marked,
     'R-TP2-2: labelling must not depend on how the user phrased the question'),
    ('community-self-labels', case_community_self_labels,
     'plan §3.1 — community books are self-labelling BY CONSTRUCTION, on every path'),
]


def run_all(verbose=False):
    if not os.path.exists(DB_PATH):
        print(f'ERROR: DB not built at {DB_PATH}. Run: python3 swrpg_index.py ingest',
              file=sys.stderr)
        return 1
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    passed = failed = 0
    for name, fn, why in CASES:
        try:
            ok, msg = fn(conn, verbose=verbose)
        except Exception as e:
            ok, msg = False, f'EXCEPTION: {type(e).__name__}: {e}'
        print(f'  [{"PASS" if ok else "FAIL"}] {name:<24} {msg}')
        if verbose:
            print(f'          why: {why}')
        if ok:
            passed += 1
        else:
            failed += 1

    conn.close()
    print(f'\n{passed} passed, {failed} failed')
    return 0 if failed == 0 else 1


if __name__ == '__main__':
    sys.exit(run_all(verbose='--verbose' in sys.argv or '-v' in sys.argv))
