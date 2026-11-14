"""Retrieval regression fixture.

Two kinds of cases:
  * POSITIVE — a query where we expect a specific alias+page to appear in
    the top-K of a given mode. Catches quality regressions when models or
    chunking change.
  * NEGATIVE — a query where a specific alias+page should NOT appear in
    the top-K (because an earlier version surfaced it wrongly). Catches
    silent regressions that positive recall tests can't see.

Run:
    python3 -m swrpg_index.tests.queries            # fast, all cases
    python3 -m swrpg_index.tests.queries --verbose  # show hits that passed too

If you add a case, include a one-line `why` so future-you knows what the
case is protecting against.
"""
import sys

from swrpg_index import DB_PATH
from swrpg_index.cli import (
    _alias_filter_from_args, _bm25_search, _semantic_search, _rrf_fuse, _fts_phrase,
    _detect_drift,
)


class _Args:
    """Lightweight stand-in for argparse.Namespace, for calling into CLI helpers."""
    def __init__(self, **kw):
        self.alias = None
        self.tier = None
        self.content_type = None
        self.limit = 10
        self.snippet_chars = 300
        self.mode = 'hybrid'
        self.rrf_k = 60
        self.json = False
        self.query = ''
        for k, v in kw.items():
            setattr(self, k, v)


CASES = [
    # ── POSITIVE ──────────────────────────────────────────────────────────
    {
        'name': 'nemesis-essay-hybrid-top3',
        'kind': 'positive',
        'query': 'nemesis encounter building',
        'mode':  'hybrid',
        'limit': 3,
        'expect_alias':  'eote-gm',
        'expect_page':   26,
        'why':           'Hybrid must find the GM\'s Kit "A GM\'s Guide to the Nemesis" in top-3. '
                         'This is the canonical hybrid win: BM25 hits on "Nemesis" title, '
                         'embedder hits on body semantics, RRF agrees.',
    },
    {
        'name': 'vocab-gap-semantic-nonempty',
        'kind': 'positive-nonempty',
        'query': 'one villain plus bodyguards and mook soldiers',
        'mode':  'semantic',
        'limit': 5,
        'why':           'Pure vocabulary-gap case — BM25 returns 0 because "villain/mook/bodyguard" '
                         'aren\'t CRB terms. Semantic must still surface at least one non-empty hit '
                         'so the corpus is still indexed. Don\'t pin a specific page because model swaps '
                         'legitimately change which adjacent passage wins.',
    },
    {
        'name': 'encounter-building-topic-resolves',
        'kind': 'topic-resolves',
        'topic': 'encounter building',
        'expect_min_sources': 2,
        'why':           'Topic index must return ≥2 verified TOC hits (not FTS fallbacks) for '
                         'encounter building — the single most-audited GM concept.',
    },

    # ── NEGATIVE ──────────────────────────────────────────────────────────
    # `negative-known-drift` is reported but does not count toward failure —
    # it documents a current quality gap that upgrades (query expansion,
    # chunk re-boundary, bge-base) are expected to fix. Flip `kind` to
    # 'negative' once the mitigation lands to enforce it.
    {
        'name': 'balanced-encounters-not-diplomat-social',
        'kind': 'negative-known-drift',
        'query': 'guidance for designing balanced encounters',
        'mode':  'semantic',
        'limit': 5,
        'forbid_alias': 'diplomat',
        'forbid_section_contains': 'Social Encounters',
        'why':           'Semantic drift surfaces Diplomat sourcebook "Social Encounters" in top-5. '
                         'Wrong neighborhood — should land on CRB GM chapter. Expected to resolve '
                         'via query expansion, chunk-boundary fix, or bge-base swap.',
    },
    # ── DRIFT DETECTION — verify the instrumentation is wired ──────────────
    {
        'name': 'drift-detector-catches-thin-section-hits',
        'kind': 'drift-detected',
        'query': 'introduction to roleplaying',
        'expect_min_drifts': 1,
        'why':           'Generic "introduction" queries semantically match appendix/cover '
                         'content in the beginner games. Verifies the drift detector\'s thin-'
                         'section + thin-content_type signals are wired correctly. If this '
                         'stops flagging, the detector has regressed silently.',
    },
]


# ── Runners ────────────────────────────────────────────────────────────────

def _run_search(conn, case):
    """Execute a search case and return the fused/ranked result list."""
    args = _Args(query=case['query'], mode=case['mode'], limit=case.get('limit', 5))
    alias_filter = _alias_filter_from_args(args)
    q_fts = _fts_phrase(args.query)

    if case['mode'] == 'bm25':
        rows = _bm25_search(conn, q_fts, alias_filter, None, args.limit)
        return [dict(r) for r in rows]
    if case['mode'] == 'semantic':
        return _semantic_search(conn, args.query, alias_filter, args.limit)

    # `drift-detected` case uses semantic mode implicitly
    # hybrid
    pool = max(args.limit * 4, 20)
    bm25_rows = _bm25_search(conn, q_fts, alias_filter, None, pool)
    sem_rows  = _semantic_search(conn, args.query, alias_filter, pool)
    fused = _rrf_fuse(bm25_rows, sem_rows, k=args.rrf_k, limit=args.limit)
    # Normalize fused to list of row-like dicts for assertions
    out = []
    for cid, score, meta in fused:
        row = meta['row']
        out.append({
            'alias':        row['alias'],
            'page_start':   row['page_start'],
            'page_end':     row['page_end'],
            'section':      row.get('section') if isinstance(row, dict) else row['section'],
            'content_type': row.get('content_type') if isinstance(row, dict) else row['content_type'],
            'score':        score,
        })
    return out


def _check(case, results, verbose=False):
    kind = case['kind']
    name = case['name']

    if kind == 'positive':
        alias = case['expect_alias']
        page  = case['expect_page']
        for r in results:
            if r['alias'] == alias and r.get('page_start', 0) <= page <= r.get('page_end', 0):
                return True, f'found {alias} p.{page}'
        return False, f'expected {alias} p.{page} in top-{case["limit"]}; got: ' + \
                      ', '.join(f'{r["alias"]} p.{r.get("page_start")}' for r in results[:3])

    if kind == 'positive-nonempty':
        if results:
            return True, f'{len(results)} result(s)'
        return False, '0 results'

    if kind in ('negative', 'negative-known-drift'):
        forbid_alias = case.get('forbid_alias')
        forbid_substr = case.get('forbid_section_contains', '').lower()
        hit = None
        for r in results:
            if forbid_alias and r['alias'] != forbid_alias:
                continue
            section = (r.get('section') or '').lower()
            if forbid_substr and forbid_substr not in section:
                continue
            hit = r
            break
        if hit is None:
            return True, f'none of top-{case["limit"]} hit forbidden alias/section'
        # If known-drift, treat presence as a soft fail (reported, not counted).
        if kind == 'negative-known-drift':
            return None, f'KNOWN-DRIFT hit: {hit["alias"]} / {hit.get("section")!r}  (tracking for later fix)'
        return False, f'FORBIDDEN hit: {hit["alias"]} / {hit.get("section")!r}'

    if kind == 'drift-detected':
        drifts = _detect_drift(results)
        need = case.get('expect_min_drifts', 1)
        if len(drifts) >= need:
            return True, f'detector flagged {len(drifts)} drift(s) (≥{need})'
        return False, f'detector flagged only {len(drifts)} drift(s) (need ≥{need})'

    if kind == 'topic-resolves':
        # Just count resolved sources via the DB.
        # Caller will have already fetched topic rows; case carries topic name.
        return True, 'checked externally'

    return False, f'unknown case kind: {kind}'


def _run_topic_case(conn, case, verbose=False):
    """topic-resolves kind — count sources that resolve via TOC (not FTS fallback)."""
    name = case['topic']
    rows = conn.execute(
        '''SELECT alias, section_fragment FROM topics WHERE name = ? ORDER BY priority DESC''',
        (name,),
    ).fetchall()
    if not rows:
        return False, f'topic "{name}" not registered'
    toc_hits = 0
    for (alias, frag) in rows:
        t = conn.execute(
            'SELECT 1 FROM toc WHERE alias = ? AND LOWER(title) LIKE ? LIMIT 1',
            (alias, f'%{frag.lower()}%'),
        ).fetchone()
        if t:
            toc_hits += 1
    need = case['expect_min_sources']
    if toc_hits >= need:
        return True, f'{toc_hits}/{len(rows)} resolve via TOC (need ≥{need})'
    return False, f'only {toc_hits}/{len(rows)} resolve via TOC (need ≥{need})'


def run_all(verbose=False):
    import sqlite3
    import os
    if not os.path.exists(DB_PATH):
        print(f'ERROR: DB not built at {DB_PATH}. Run: python3 swrpg_index.py ingest', file=sys.stderr)
        return 1
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    passed = failed = tracked = 0
    for case in CASES:
        try:
            if case['kind'] == 'topic-resolves':
                ok, msg = _run_topic_case(conn, case, verbose=verbose)
            elif case['kind'] == 'drift-detected':
                # Drift detector runs on semantic results for the case's query.
                results = _semantic_search(conn, case['query'], None, 10)
                ok, msg = _check(case, results, verbose=verbose)
            else:
                results = _run_search(conn, case)
                ok, msg = _check(case, results, verbose=verbose)
        except Exception as e:
            ok, msg = False, f'EXCEPTION: {e}'
        status = 'PASS' if ok is True else ('FAIL' if ok is False else 'TRACK')
        print(f'  [{status}] {case["name"]:<44} {msg}')
        if verbose and ok is True:
            print(f'          why: {case["why"]}')
        if ok is True:     passed  += 1
        elif ok is False:  failed  += 1
        else:              tracked += 1

    conn.close()
    summary = f'{passed} passed, {failed} failed'
    if tracked:
        summary += f', {tracked} tracked (known drift)'
    print(f'\n{summary}')
    return 0 if failed == 0 else 1


if __name__ == '__main__':
    verbose = '--verbose' in sys.argv or '-v' in sys.argv
    sys.exit(run_all(verbose=verbose))
