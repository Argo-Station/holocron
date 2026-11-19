"""Programmatic API — pure data-returning functions shared by the CLI and
the MCP server. No printing, no argparse.

Every function takes a sqlite3 connection as its first argument so callers
manage their own connection lifecycle (the MCP server keeps one resident
for the life of the process; the CLI opens and closes per command).

Return shapes are JSON-serializable dicts and lists so they drop straight
into `--json` CLI output and into MCP tool returns.
"""
import re
import sqlite3

from .utils import aliases_for_tier
from . import embed as _embed_mod

# Equal scores break by what a re-ingest keeps, never by row id or insertion order (C-OHY-4). Every score sort
# below uses it, or its columns in SQL in the same order.
_tie_key = _embed_mod.tie_key


# ── FTS query preparation (shared between BM25 and hybrid) ────────────────
# FTS5 reserves a handful of characters; we escape by double-quoting each
# token. "nemesis encounter building" → `"nemesis" "encounter" "building"`
# which FTS5 treats as AND semantics on phrase tokens.
#
# ALWAYS escaped (ruling `oracle-o2a-search-repair` F1 / C-OSR-1). A query
# carrying `"`, ` OR ` or ` NEAR(` used to go to MATCH raw, on the theory the
# caller was typing FTS5 on purpose; no caller does (the MCP tools tell the
# agent the server quotes for it), and a natural question with a quotation
# mark in it is not valid FTS5, so 35 of the 1,356 benchmark questions raised
# `sqlite3.OperationalError` out of the cascade. Inside a quoted phrase every
# character but `"` is literal, and a phrase with no word in it (`"?"`) is
# ignored by FTS5 rather than rejected — so stripping `"` and quoting every
# token makes any string a valid expression.
_FTS_QUOTE_RE = re.compile(r'"')


def fts_phrase(query):
    """Convert a human query to an FTS5 expression with AND semantics: every
    whitespace token must be on the page. The fragment/keyword path — `topic()`'s
    FTS fallback, the CLI and `tests/queries.py` (M-OSR-1). A natural question
    goes through `fts_any` instead (see there)."""
    if not query:
        return ''
    tokens = [t for t in re.split(r'\s+', query.strip()) if t]
    if not tokens:
        return ''
    return ' '.join(f'"{_FTS_QUOTE_RE.sub("", t)}"' for t in tokens)


# Words that carry no subject. The BM25 leg drops them from a natural question
# (they would match every page), and the cascade's relevance check uses the same
# list to decide whether a snippet shares anything with the query.
QUERY_STOPWORDS = frozenset('''
a about above after again against all am an and any are as at be because been
before being below between both but by can could did do does doing down during
each few for from further had has have having he her here hers him his how i if
in into is it its itself just me more most my no nor not now of off on once only
or other our out over own same she should so some such than that the their them
then there these they this those through to too under until up very was we were
what when where which while who whom why will with would you your yours rule
rules rulebook book books ffg rpg star wars page pages
'''.split())
_CONTENT_TOKEN_RE = re.compile(r"[a-z0-9][a-z0-9'\-]*")


def content_tokens(text):
    """The query's subject words, lowercased, first-seen order, stopwords and
    single characters dropped."""
    out = []
    for t in _CONTENT_TOKEN_RE.findall((text or '').lower()):
        if t not in QUERY_STOPWORDS and len(t) > 1 and t not in out:
            out.append(t)
    return out


def fts_any(query):
    """A natural question as an FTS5 expression with OR semantics over its
    content words: `"pilot" OR "gunnery" OR "check"`. BM25 still ranks a page
    carrying more (and rarer) of the words higher.

    Ruling `oracle-o2a-search-repair` F2: the leg used to be `fts_phrase` —
    every word of the question, stopwords included, on one page — and real
    questions almost never manage that; the leg was on 0.71 % of the benchmark's
    matching hits. '' when the question has no content word."""
    return ' OR '.join(f'"{t}"' for t in content_tokens(query))


# How the BM25 leg orders its pool, and which of its rows count as having seen
# the whole question (`bm25_all_terms`, what the cascade's strength test reads).
# The four combinations were measured on the recall benchmark's EVEN half and the
# winner confirmed on the ODD half (Docs/audit_artifacts/oracle_o2a_2026-09/).
#   BM25_LEG_ORDER    'and_first' — the every-term matches first (in BM25 order),
#                                   then the OR pool fills the rest
#                     'rank'      — the OR pool in plain BM25 order
#   BM25_ALL_TERMS    'every_word' — the row matches `fts_phrase(query)`, every
#                                    whitespace token (the pre-O2a AND leg)
#                     'content'    — the row carries every content word
BM25_LEG_ORDER = 'and_first'
BM25_ALL_TERMS = 'every_word'
# The RRF weight of a BM25 row that does NOT carry the whole question, as a share
# of the leg's weight. RRF interleaves the legs, so an OR leg at full weight
# halves the depth the meaning leg reaches on its own; a partial match at a
# reduced weight still lifts a page the meaning leg also found. Measured, same
# discipline as above.
BM25_PARTIAL_WEIGHT = 0.25


def render_snippet(text, query_tokens, target_chars=600):
    """Extract a word-boundary-aligned window around the first matching token."""
    if not text:
        return ''
    lo = text.lower()
    pos = -1
    for t in query_tokens:
        p = lo.find(t.lower())
        if p >= 0 and (pos == -1 or p < pos):
            pos = p
    if pos < 0:
        pos = 0
    half = target_chars // 2
    start = max(0, pos - half)
    end = min(len(text), pos + half)
    while start > 0 and text[start] not in ' \n\t':
        start -= 1
    while end < len(text) and text[end] not in ' \n\t':
        end += 1
    snippet = text[start:end].strip()
    prefix = '…' if start > 0 else ''
    suffix = '…' if end < len(text) else ''
    return f'{prefix}{snippet}{suffix}'


# ── Filter resolution ─────────────────────────────────────────────────────

def resolve_alias_filter(alias=None, tier=None):
    """Return sorted list[alias] | None (None = no constraint)."""
    sets = []
    if alias:
        sets.append({alias})
    if tier:
        t = aliases_for_tier(tier)
        if t is not None:
            sets.append(set(t))
    if not sets:
        return None
    out = sets[0]
    for s in sets[1:]:
        out &= s
    return sorted(out)


# ── Retrieval primitives ──────────────────────────────────────────────────

def bm25_search(conn, query_fts, alias_filter=None, content_type=None, limit=20):
    """FTS5 + BM25 leg. Column weights: text 1.0, chapter 1.2, section 1.5."""
    if not query_fts:
        return []
    where = ['chunks_fts MATCH ?']
    params = [query_fts]
    if alias_filter is not None:
        ph = ','.join('?' * len(alias_filter))
        where.append(f'c.alias IN ({ph})')
        params.extend(alias_filter)
    if content_type:
        where.append('c.content_type = ?')
        params.append(content_type)
    sql = f'''
        SELECT c.id, c.alias, c.page_start, c.page_end, c.chapter, c.section,
               c.content_type, c.text,
               bm25(chunks_fts, 1.0, 1.2, 1.5) AS rank,
               p.name AS book_name, p.tier AS tier
        FROM chunks_fts
        JOIN chunks c ON c.id = chunks_fts.rowid
        JOIN pdfs   p ON p.alias = c.alias
        WHERE {' AND '.join(where)}
        ORDER BY rank ASC, c.alias, c.page_start, c.page_end, c.content_type, c.text
        LIMIT ?
    '''
    params.append(limit)
    return conn.execute(sql, params).fetchall()


def _rows_matching(conn, query_fts, ids):
    """The subset of chunk `ids` that match `query_fts`."""
    if not query_fts or not ids:
        return set()
    ph = ','.join('?' * len(ids))
    return {r[0] for r in conn.execute(
        f'SELECT rowid FROM chunks_fts WHERE chunks_fts MATCH ? AND rowid IN ({ph})',
        [query_fts, *ids])}


def bm25_leg(conn, query, alias_filter=None, content_type=None, limit=20):
    """The BM25 leg for a natural question (F2): the OR pool over its content
    words, each row a dict stamped `bm25_all_terms` — True when the page carries
    the whole question (BM25_ALL_TERMS says which reading of "whole")."""
    all_expr = (fts_phrase(query) if BM25_ALL_TERMS == 'every_word'
                else ' '.join(f'"{t}"' for t in content_tokens(query)))
    rows = [dict(r) for r in bm25_search(conn, fts_any(query), alias_filter, content_type, limit)]
    if BM25_LEG_ORDER == 'and_first':
        head = [dict(r) for r in bm25_search(conn, all_expr, alias_filter, content_type, limit)]
        full = {r['id'] for r in head}
        rows = head + [r for r in rows if r['id'] not in full][:limit - len(head)]
    else:
        full = _rows_matching(conn, all_expr, [r['id'] for r in rows])
    for r in rows:
        r['bm25_all_terms'] = r['id'] in full
    return rows


def semantic_search(conn, query, alias_filter=None, limit=20, embedder=None):
    """Passage-level cosine search via numpy matmul."""
    return _embed_mod.semantic_search(conn, query, alias_filter=alias_filter,
                                       limit=limit, embedder=embedder)


def book_identity(row):
    """(book_name, tier) off a result row — dict or sqlite3.Row; missing ⇒ (None, None).

    Both retrieval legs now carry identity (BM25 joins `pdfs`; the semantic leg
    left-joins it in embed.semantic_search), so this is a reader, not a fallback.
    A None book name means "this row has no verified identity" and is cited as
    unverified — never guessed at, and never silently dropped.
    """
    if isinstance(row, dict):
        return row.get('book_name'), row.get('tier')
    try:
        return row['book_name'], row['tier']
    except (IndexError, KeyError):
        return None, None


def _get(row, key):
    """row[key] off a dict or sqlite3.Row; None when the row has no such column."""
    if isinstance(row, dict):
        return row.get(key)
    try:
        return row[key]
    except (IndexError, KeyError):
        return None


def rrf_fuse(bm25_rows, semantic_rows, k=60, limit=10,
             bm25_weight=1.0, semantic_weight=1.0):
    """Reciprocal Rank Fusion on chunk_id. Returns list of (cid, score, meta).

    bm25_weight / semantic_weight: per-leg contribution multipliers. Defaults
    (1.0, 1.0) reproduce the standard RRF formulation. Phase 3 F.4 explored
    asymmetric weighting — BM25 is high-precision/low-recall, semantic is
    broad-recall/medium-precision; symmetric mixing dilutes good semantic
    ranks with BM25's frequent silence.
    """
    scores = {}
    meta = {}
    for rank, row in enumerate(bm25_rows):
        cid = row['id']
        w = bm25_weight if _get(row, 'bm25_all_terms') is not False else bm25_weight * BM25_PARTIAL_WEIGHT
        scores[cid] = scores.get(cid, 0.0) + w / (k + rank + 1)
        meta.setdefault(cid, {'sources': set(), 'row': row, 'passage_snippet': None})
        meta[cid]['sources'].add('bm25')
        meta[cid]['bm25_rank'] = rank + 1
        meta[cid]['bm25_all_terms'] = _get(row, 'bm25_all_terms')
    # Semantic passages are deduped to first-seen per chunk before RRF
    # accumulation — otherwise chunks with multiple matching passages get
    # passage-summed RRF scores that drown out BM25's contribution and
    # diverge from canonical semantic-only ranking (Phase 3 F.4 finding).
    seen_chunks: set = set()
    deduped_semantic = []
    for p in semantic_rows:
        if p['chunk_id'] in seen_chunks:
            continue
        seen_chunks.add(p['chunk_id'])
        deduped_semantic.append(p)
    for rank, p in enumerate(deduped_semantic):
        cid = p['chunk_id']
        scores[cid] = scores.get(cid, 0.0) + semantic_weight / (k + rank + 1)
        entry = meta.setdefault(cid, {'sources': set(), 'row': None, 'passage_snippet': None})
        entry['sources'].add('semantic')
        entry['sem_rank'] = rank + 1
        entry['sem_similarity'] = p['similarity']
        if entry['passage_snippet'] is None:
            entry['passage_snippet'] = p['text']
        if entry['row'] is None:
            # Chunk reached the fuse by the semantic leg only (no BM25 row to take
            # identity from). It carries its own now — this used to hardcode None,
            # which is how community books arrived unlabelled (R-TP2-2).
            sem_book, sem_tier = book_identity(p)
            entry['row'] = {
                'id': cid, 'alias': p['alias'],
                'page_start': p['page_start'], 'page_end': p['page_end'],
                'chapter': p['chapter'], 'section': p['section'],
                'content_type': p['content_type'], 'text': p['text'],
                'book_name': sem_book, 'tier': sem_tier,
            }
    ranked = sorted(scores.items(), key=lambda kv: (-kv[1], _tie_key(meta[kv[0]]['row'])))[:limit]
    return [(cid, scores[cid], meta[cid]) for cid, _ in ranked]


def _minmax(values):
    """[0, 1] min-max over `values`; a leg whose rows share one value (one row included) maps every row
    to 1.0 — equally best — never a division by zero."""
    if not values:
        return []
    lo, hi = min(values), max(values)
    if hi == lo:
        return [1.0] * len(values)
    return [(v - lo) / (hi - lo) for v in values]


def cc_fuse(bm25_rows, semantic_rows, alpha=None):
    """Score-space blend (convex combination) on chunk_id — ruling `oracle-o5-blend` C-O5B-2, lever A of
    `oracle-o4-research`, as `o4/M2/m2_cc.py` measured it. Returns every fused chunk as (cid, score, meta),
    best first, with the same meta `rrf_fuse` carries.

    words   raw score -rank of each `bm25_leg` row, as returned; min-max over the leg's rows
    meaning the first-seen passage per chunk (the dedup rrf_fuse does), raw score its `similarity`;
            min-max over those
    fused   alpha * words + (1 - alpha) * meaning; a chunk absent from a leg scores 0 on it; an empty leg
            contributes 0. Sorted by (-score, tie key). 0..1 before any table boost.
    """
    alpha = HYBRID_CC_ALPHA if alpha is None else alpha
    meta = {}
    words = {}
    for rank, (row, w) in enumerate(zip(bm25_rows, _minmax([-_get(r, 'rank') for r in bm25_rows]))):
        cid = row['id']
        words[cid] = w
        meta[cid] = {'sources': {'bm25'}, 'row': row, 'passage_snippet': None,
                     'bm25_rank': rank + 1, 'bm25_all_terms': _get(row, 'bm25_all_terms')}
    seen_chunks: set = set()
    deduped_semantic = []
    for p in semantic_rows:
        if p['chunk_id'] in seen_chunks:
            continue
        seen_chunks.add(p['chunk_id'])
        deduped_semantic.append(p)
    meaning = {}
    for rank, (p, m) in enumerate(zip(deduped_semantic, _minmax([p['similarity'] for p in deduped_semantic]))):
        cid = p['chunk_id']
        meaning[cid] = m
        entry = meta.setdefault(cid, {'sources': set(), 'row': None, 'passage_snippet': None})
        entry['sources'].add('semantic')
        entry['sem_rank'] = rank + 1
        entry['sem_similarity'] = p['similarity']
        entry['passage_snippet'] = p['text']
        if entry['row'] is None:
            # A meaning-only chunk carries its own identity, as in rrf_fuse (R-TP2-2).
            sem_book, sem_tier = book_identity(p)
            entry['row'] = {
                'id': cid, 'alias': p['alias'],
                'page_start': p['page_start'], 'page_end': p['page_end'],
                'chapter': p['chapter'], 'section': p['section'],
                'content_type': p['content_type'], 'text': p['text'],
                'book_name': sem_book, 'tier': sem_tier,
            }
    fused = [(cid, alpha * words.get(cid, 0.0) + (1 - alpha) * meaning.get(cid, 0.0), m)
             for cid, m in meta.items()]
    fused.sort(key=lambda t: (-t[1], _tie_key(t[2]['row'])))
    return fused


# ── Drift detection (thin-section heuristic) ──────────────────────────────

_THIN_SECTION_TITLES = {
    'tables', 'introduction', 'overview', 'table of contents',
    'appendix', 'index', 'glossary',
}
_THIN_CONTENT_TYPES = {'cover', 'toc'}
DRIFT_SIMILARITY_THRESHOLD = 0.65


def detect_drift(results, similarity_threshold=DRIFT_SIMILARITY_THRESHOLD):
    drifts = []
    for r in results:
        if 'similarity' not in r:
            continue
        if r['similarity'] < similarity_threshold:
            continue
        section_lc = (r.get('section') or '').lower().strip()
        ctype = (r.get('content_type') or '').lower()
        reason = None
        if section_lc in _THIN_SECTION_TITLES:
            reason = f'section title "{r.get("section")}" is a generic appendix-style heading'
        elif ctype in _THIN_CONTENT_TYPES:
            reason = f'content_type="{ctype}" (cover/TOC pages are thin)'
        if reason:
            drifts.append({
                'alias': r['alias'], 'page_start': r['page_start'],
                'section': r.get('section'), 'chapter': r.get('chapter'),
                'content_type': r.get('content_type'),
                'similarity': r['similarity'], 'reason': reason,
            })
    return drifts


# ── High-level search (mode = bm25|semantic|hybrid) ───────────────────────

TABLE_BOOST_FACTOR = 1.5  # multiplier applied to content_type='table' chunks when boost_tables=True
VERIFIED_TABLE_BOOST_FACTOR = 2.5  # content_type='verified_table' (Jason-verified, T1a) — ALWAYS boosted,
                                   # independent of --boost-tables, so it outranks the OCR chunk of the
                                   # same table (the authoritative layer the oracle cites as VERIFIED).
EXPANSION_RRF_K = 60       # Reciprocal Rank Fusion k across query variants
HYBRID_BM25_WEIGHT = 1.0      # Phase 3 F.4: symmetric RRF retained; the F.4 fix is semantic-passage dedup in rrf_fuse (not weight tuning)
HYBRID_SEMANTIC_WEIGHT = 1.0  # Phase 3 F.4: symmetric RRF retained

# How a hybrid search combines its two legs (ruling `oracle-o5-blend` C-O5B-2/4). Measured, same
# discipline as BM25_LEG_ORDER — `oracle-o4-research` §2 on the recall benchmark (1,356 questions) and
# the July human-authored topics (100):
#   'cc'   score-space blend: each leg min-max normalised over its own rows, then
#          HYBRID_CC_ALPHA * words + (1 - HYBRID_CC_ALPHA) * meaning (`cc_fuse`) — 963/1,356, TREC 100/100
#   'rrf'  Reciprocal Rank Fusion (`rrf_fuse`), the pre-O5 fusion — 810/1,356, TREC 98/100; kept so the
#          alternative reproduces the base site by site (with cascade.CASCADE_FALLBACK = 'expand')
# Pinned by `swrpg_index/tests/hybrid_blend.py`.
HYBRID_FUSION = 'cc'
# The words leg's share of the blend. Measured alpha 0.3 / 0.5 / 0.7 (EVEN 503 / 480 / 441 of 678,
# `oracle-o4-research` §2); the benchmark's halves are spent, so no other value is tried (C-O5B-7).
HYBRID_CC_ALPHA = 0.3
# Rows fetched per leg under 'cc', whatever the `limit` (a `limit` above it widens it). 40 is what the
# blend was measured at — the pool the cascade's primary search had under 'rrf' (max(10 * 4, 20)).
# Under 'rrf' the pre-O5 formula max(limit * 4, 20) stands.
HYBRID_POOL = 40


def _boost_for(ct, boost_tables):
    """Score multiplier for a content_type. verified_table ALWAYS boosts (authoritative layer);
    content_type='table' boosts only under --boost-tables."""
    if ct == 'verified_table':
        return VERIFIED_TABLE_BOOST_FACTOR
    if ct == 'table' and boost_tables:
        return TABLE_BOOST_FACTOR
    return 1.0


def _has_verified_table(bm25_rows, semantic_rows, fused):
    def ct(r):
        return r.get('content_type') if isinstance(r, dict) else r['content_type']
    if any(ct(r) == 'verified_table' for r in bm25_rows):
        return True
    if any((p.get('content_type') if isinstance(p, dict) else p['content_type']) == 'verified_table'
           for p in semantic_rows):
        return True
    return False


def _apply_content_boost(bm25_rows, semantic_rows, fused, mode, boost_tables):
    """Apply a score multiplier to table-like results, then re-sort (before the top-K cut) so a boosted
    chunk can lift into the final list. verified_table always boosts; 'table' boosts under --boost-tables.

    The multiplier direction depends on score semantics:
      * BM25 distance is negative and lower=better → multiply by boost (>1) to push more-negative = better.
      * Cosine / RRF / the blend are positive and higher=better → multiply by boost to lift.
    """
    # No-op fast path — nothing to boost AND nothing to re-sort. Preserves the original ordering (and the
    # retrieval eval) for the common query that has no verified table in its pool and doesn't ask for tables.
    if not boost_tables and not _has_verified_table(bm25_rows, semantic_rows, fused):
        return bm25_rows, semantic_rows, fused

    if mode == 'bm25':
        out = []
        for r in bm25_rows:
            d = dict(r)
            f = _boost_for(d.get('content_type'), boost_tables)
            if f != 1.0:
                d['rank'] = d['rank'] * f
            out.append(d)
        out.sort(key=lambda d: (d['rank'], _tie_key(d)))  # lower = better (bm25 distance is negative)
        return out, semantic_rows, fused

    if mode == 'semantic':
        out = []
        for p in semantic_rows:
            pp = dict(p)
            f = _boost_for(pp.get('content_type'), boost_tables)
            if f != 1.0:
                pp['similarity'] = min(1.0, pp['similarity'] * f)
            out.append(pp)
        out.sort(key=lambda p: (-p['similarity'], _tie_key(p)))  # higher = better
        return bm25_rows, out, fused

    # hybrid mode — boost after fusion (RRF or the score-space blend)
    if fused is not None:
        boosted = []
        for cid, score, m in fused:
            row = m['row']
            ct = row.get('content_type') if isinstance(row, dict) else row['content_type']
            f = _boost_for(ct, boost_tables)
            if f != 1.0:
                score = score * f
            boosted.append((cid, score, m))
        boosted.sort(key=lambda t: (-t[1], _tie_key(t[2]['row'])))  # higher = better
        return bm25_rows, semantic_rows, boosted
    return bm25_rows, semantic_rows, fused


def search(conn, query, mode='hybrid', alias=None, tier=None, content_type=None,
           limit=5, snippet_chars=600, rrf_k=60, embedder=None, boost_tables=False,
           bm25_weight=None, semantic_weight=None, page_key=None):
    """Unified search. Returns list[dict] — drop-in for JSON or MCP tool returns.

    `boost_tables=True` applies a 1.5x multiplier to content_type='table'
    chunks before the top-K cut. Useful for queries that are really asking
    about numeric profiles (weapon stats, armor stats, crit tables) where
    dense prose reprints in career sourcebooks and compiled references
    otherwise outrank the authoritative table chunk. The agent decides when
    to flip this on via the MCP docstring's 'When to use' guidance.

    Hybrid mode fuses its legs by HYBRID_FUSION ('cc' — a score-space blend, `cc_fuse`; 'rrf' —
    `rrf_fuse`, where `rrf_k` and the leg weights apply). `page_key`, when given, keeps only the first
    fused hit per key BEFORE the `limit` cut, so `limit` distinct pages come from the whole fused pool
    and only those are rendered (the cascade's dedup, C-O5B-2).
    """
    if mode not in ('bm25', 'semantic', 'hybrid'):
        raise ValueError(f'unknown mode: {mode!r}')
    alias_filter = resolve_alias_filter(alias=alias, tier=tier)
    q_tokens = [t for t in re.split(r'\s+', (query or '').strip()) if t]
    fusion = HYBRID_FUSION
    if fusion not in ('cc', 'rrf'):
        raise ValueError(f'unknown HYBRID_FUSION {fusion!r}')
    if mode == 'hybrid' and fusion == 'cc':
        pool_size = max(HYBRID_POOL, limit)
    else:
        pool_size = max(limit * 4, 20)

    bm25_rows = semantic_rows = []
    if mode in ('bm25', 'hybrid'):
        bm25_rows = bm25_leg(conn, query, alias_filter, content_type, pool_size)
    if mode in ('semantic', 'hybrid'):
        semantic_rows = semantic_search(conn, query, alias_filter, pool_size, embedder=embedder)

    # For hybrid we need fused BEFORE the boost so the boost operates on the
    # same object BM25+semantic combined. For other modes, fused stays None.
    fused = None
    if mode == 'hybrid' and fusion == 'cc':
        fused = cc_fuse(bm25_rows, semantic_rows)
    elif mode == 'hybrid':
        bw = HYBRID_BM25_WEIGHT if bm25_weight is None else bm25_weight
        sw = HYBRID_SEMANTIC_WEIGHT if semantic_weight is None else semantic_weight
        fused = rrf_fuse(bm25_rows, semantic_rows, k=rrf_k, limit=pool_size,
                         bm25_weight=bw, semantic_weight=sw)

    bm25_rows, semantic_rows, fused = _apply_content_boost(
        bm25_rows, semantic_rows, fused, mode, boost_tables,
    )

    results = []
    if mode == 'bm25':
        # bm25_rows may be list[dict] if boosted, else list[Row] — both
        # dict-subscriptable.
        for r in bm25_rows[:limit]:
            results.append({
                'alias': r['alias'], 'book': r['book_name'], 'tier': r['tier'],
                'page_start': r['page_start'], 'page_end': r['page_end'],
                'chapter': r['chapter'], 'section': r['section'],
                'content_type': r['content_type'],
                'score': round(r['rank'], 3), 'score_kind': 'bm25',
                'snippet': render_snippet(r['text'], q_tokens, snippet_chars),
                'sources': ['bm25'],
                'bm25_all_terms': r.get('bm25_all_terms'),
                'boosted': bool(boost_tables and r['content_type'] == 'table'),
            })
    elif mode == 'semantic':
        for p in semantic_rows[:limit]:
            sem_book, sem_tier = book_identity(p)
            results.append({
                'alias': p['alias'], 'book': sem_book, 'tier': sem_tier,
                'page_start': p['page_start'], 'page_end': p['page_end'],
                'chapter': p['chapter'], 'section': p['section'],
                'content_type': p['content_type'],
                'score': round(p['similarity'], 4), 'score_kind': 'cosine',
                'snippet': render_snippet(p['text'], q_tokens, snippet_chars),
                'sources': ['semantic'],
                'boosted': bool(boost_tables and p['content_type'] == 'table'),
            })
    else:
        if page_key is not None:
            kept, seen = [], set()
            for t in fused:
                row = t[2]['row']
                key = page_key({'alias': _get(row, 'alias'), 'page_start': _get(row, 'page_start')})
                if key not in seen:
                    seen.add(key)
                    kept.append(t)
                    if len(kept) >= limit:
                        break
            fused = kept
        for cid, score, m in fused[:limit]:
            row = m['row']
            snippet_source = m.get('passage_snippet') or row['text']
            ct = row.get('content_type') if isinstance(row, dict) else row['content_type']
            book, tier_ = book_identity(row)
            results.append({
                'alias': row['alias'],
                'book':  book,
                'tier':  tier_,
                'page_start': row['page_start'], 'page_end': row['page_end'],
                'chapter': row['chapter'], 'section': row['section'],
                'content_type': ct,
                'score': round(score, 4), 'score_kind': fusion,
                'snippet': render_snippet(snippet_source, q_tokens, snippet_chars),
                'sources': sorted(m['sources']),
                'bm25_rank': m.get('bm25_rank'),
                'sem_rank':  m.get('sem_rank'),
                'bm25_all_terms': m.get('bm25_all_terms'),
                'boosted':   bool(boost_tables and ct == 'table'),
            })
    # A1-4: stamped HERE rather than in each of the three branches above — every branch already
    # attaches the row's own alias, and a result set can mix books, so the stamp must be per-row.
    # Audit F9: `text_quality` (book) + `page_hostile` (page) ride the same per-row stamp.
    return [stamp_text_quality(conn, stamp_pagination(r['alias'], r)) for r in results]


# ── Multi-variant expansion (RRF across query variants) ──────────────────

def search_expanded(conn, queries, mode='hybrid', alias=None, tier=None,
                    content_type=None, limit=5, per_query_pool=10,
                    snippet_chars=600, rrf_k=EXPANSION_RRF_K,
                    boost_tables=False, embedder=None):
    """Fuse multiple query variants via Reciprocal Rank Fusion on chunks.

    The agent authors 2-5 reformulations of its original question — each
    one a different phrasing or vocabulary slice — and this function runs
    every variant through `search()` in parallel, then re-ranks by RRF
    across the variants. Chunks that appear in multiple variants' results
    rise to the top; chunks that match only one variant weakly fall.

    This is the vocabulary-gap lever. When a user asks "how do I make a
    villain scarier," no single phrasing may hit the canonical rulebook
    passage, but "how to develop a nemesis," "running the nemesis as GM,"
    and "GM guide to the nemesis" all converge on eote-gm pp.26-32. RRF
    finds the consensus.

    RRF math: score(c) = Σ_i 1/(k + rank_i(c)) where rank_i is c's
    position in variant i's top-K results (or ∞ if absent). k defaults
    to 60 per the RRF paper.

    Args:
        queries: list of 2-5 query strings. Agent-authored reformulations
            of the original question. Duplicates are deduped silently.
        mode: passed through to search() per variant ('hybrid' recommended).
        alias / tier / content_type / boost_tables: passed through — they
            constrain every variant identically.
        limit: final top-K after fusion.
        per_query_pool: how deep each variant's result list goes before
            fusion. 10 is the sweet spot — too shallow misses consensus
            hits that rank #6-#10 on each variant; too deep dilutes the
            RRF signal.
        rrf_k: fusion constant.
        embedder: optional pre-loaded embedder (for performance on
            repeated semantic/hybrid calls).

    Returns:
        list[dict] — each hit has the same shape as search() results plus
        two extras:
          * expand_score — fused RRF score (higher = better)
          * variants_matched — how many of the N variants produced this
            chunk in their top-K. 2+ means consensus; 1 means a
            variant-specific weak hit.
    """
    # Dedupe + clean queries
    qs = []
    seen = set()
    for q in queries or []:
        key = (q or '').strip().lower()
        if key and key not in seen:
            seen.add(key)
            qs.append(q.strip())
    if not qs:
        return []

    scores = {}
    meta   = {}
    for q in qs:
        hits = search(
            conn, q, mode=mode, alias=alias, tier=tier,
            content_type=content_type, limit=per_query_pool,
            snippet_chars=snippet_chars, embedder=embedder,
            boost_tables=boost_tables,
        )
        for rank, h in enumerate(hits):
            cid = (h['alias'], h['page_start'], h['page_end'])
            scores[cid] = scores.get(cid, 0.0) + 1.0 / (rrf_k + rank + 1)
            if cid not in meta:
                meta[cid] = {'hit': h, 'variants_matched': []}
            meta[cid]['variants_matched'].append(q)

    ranked = sorted(scores.items(), key=lambda kv: (-kv[1], kv[0]))[:limit]  # cid = (alias, pages): C-OHY-4
    results = []
    for cid, score in ranked:
        m = meta[cid]
        out = dict(m['hit'])
        out['expand_score'] = round(score, 4)
        out['variants_matched'] = len(m['variants_matched'])
        out['score_kind'] = 'expand-rrf'
        out['score'] = out['expand_score']  # overwrite per-variant score with fused
        results.append(out)
    return results


# ── Topic lookup ──────────────────────────────────────────────────────────

def topic(conn, name):
    """Resolve a topic name to the per-source page ranges (via TOC; FTS
    fallback for aliases without an embedded TOC). Returns dict with
    'topic' (matched name) + 'sources' list."""
    name_lc = (name or '').lower().strip()
    rows = conn.execute(
        '''SELECT name, alias, section_fragment, priority
           FROM topics WHERE name = ?
           ORDER BY priority DESC''',
        (name_lc,),
    ).fetchall()
    if not rows:
        rows = conn.execute(
            '''SELECT name, alias, section_fragment, priority
               FROM topics WHERE name LIKE ?
               ORDER BY priority DESC''',
            (f'%{name_lc}%',),
        ).fetchall()
    if not rows:
        return {'topic': None, 'sources': [], 'error': f'unknown topic: {name!r}'}

    matched = rows[0]['name']
    sources = []
    for r in rows:
        alias = r['alias']
        frag = r['section_fragment']
        t = conn.execute(
            '''SELECT title, page_start, page_end, level
               FROM toc
               WHERE alias = ? AND LOWER(title) LIKE ?
               ORDER BY level ASC, page_start ASC
               LIMIT 1''',
            (alias, f'%{frag.lower()}%'),
        ).fetchone()
        if t is not None:
            sources.append({
                'alias': alias, 'fragment': frag,
                'title': t['title'], 'page_start': t['page_start'],
                'page_end': t['page_end'], 'level': t['level'], 'via': 'toc',
            })
            continue
        # FTS fallback
        q = fts_phrase(frag)
        hit = conn.execute(
            '''SELECT c.page_start, c.page_end, c.chapter, c.section,
                      bm25(chunks_fts, 1.0, 1.2, 1.5) AS rank
               FROM chunks_fts
               JOIN chunks c ON c.id = chunks_fts.rowid
               WHERE chunks_fts MATCH ? AND c.alias = ?
               ORDER BY rank ASC, c.page_start, c.page_end, c.content_type, c.text LIMIT 1''',
            (q, alias),
        ).fetchone()
        if hit is not None:
            sources.append({
                'alias': alias, 'fragment': frag,
                'title': hit['section'] or hit['chapter'] or '(FTS hit)',
                'page_start': hit['page_start'], 'page_end': hit['page_end'],
                'level': None, 'via': 'fts-fallback',
            })
        else:
            sources.append({'alias': alias, 'fragment': frag, 'status': 'no hit'})

    return {'topic': matched,
            'sources': [stamp_text_quality(conn, stamp_pagination(x['alias'], x))
                        if 'page_start' in x else x
                        for x in sources]}


def topics(conn):
    rows = conn.execute(
        '''SELECT name, GROUP_CONCAT(alias, ',') AS aliases, COUNT(*) AS n
           FROM topics GROUP BY name ORDER BY name'''
    ).fetchall()
    return [
        {'name': r['name'], 'aliases': (r['aliases'] or '').split(','), 'count': r['n']}
        for r in rows
    ]


# ── TOC / list ────────────────────────────────────────────────────────────

def toc(conn, alias):
    pdf = conn.execute('SELECT * FROM pdfs WHERE alias = ?', (alias,)).fetchone()
    if not pdf:
        return {'error': f'unknown alias: {alias!r}'}
    rows = conn.execute(
        '''SELECT level, title, page_start, page_end, summary
           FROM toc WHERE alias = ? ORDER BY page_start ASC, level ASC''',
        (alias,),
    ).fetchall()
    return {
        'alias': pdf['alias'], 'name': pdf['name'],
        'page_count': pdf['page_count'], 'tier': pdf['tier'],
        'book_line': pdf['book_line'],
        'entries': [dict(r) for r in rows],
    }


def list_pdfs(conn):
    rows = conn.execute(
        '''SELECT alias, name, tier, book_line, page_count, has_text, has_ocr
           FROM pdfs ORDER BY tier, alias'''
    ).fetchall()
    counts = dict(conn.execute(
        'SELECT alias, COUNT(*) FROM chunks GROUP BY alias'
    ).fetchall())
    return [
        {
            'alias':      r['alias'],
            'name':       r['name'],
            'tier':       r['tier'],
            'book_line':  r['book_line'],
            'page_count': r['page_count'],
            'chunks':     counts.get(r['alias'], 0),
            'has_text':   bool(r['has_text']),
            'has_ocr':    bool(r['has_ocr']),
        }
        for r in rows
    ]


# ── Page reads (for read_pages / chapter MCP tools) ───────────────────────

# ── B-335 A1-4: THE INSTRUMENT SPEAKS ITS OWN COORDINATES ────────────────────────────────
#
# Every page number this module returns is a CORPUS page — the PDF's own index. Every page a
# human can check in a printed book is a PRINTED page. They differ by that book's front matter
# (eote +9, e.g.; each book's own offset in Docs/pdf_sources.json), and until now
# nothing in an answer said which kind it was holding. That silence is the whole bug: a reader takes a corpus page for a printed one, cites it, and the
# citation is confidently wrong with nothing anywhere to catch it. Jason's directive was to stop
# this being rediscovered; A1-1 gave the repo one converter, and this makes the INSTRUMENT
# ITSELF say what it is handing you, so a future agent cannot be silently wrong.
#
# ADDITIVE ONLY. Existing keys keep their names and meanings; consumers that ignore the new keys
# behave exactly as before (the eval baseline scores pass counts, not shapes — checked).
def stamp_pagination(alias, rec):
    """Annotate a page-bearing record with WHICH pagination it is in, and the printed
    equivalent where the book has earned an offset or page runs. Refuses with a class where it has not."""
    from . import pdf_pages
    rec['pagination'] = 'corpus'
    st = pdf_pages.status(alias)
    if st == pdf_pages.CALIBRATED:
        for src, dst in (('page_start', 'printed_start'), ('page_end', 'printed_end')):
            if rec.get(src) is not None:
                rec[dst] = pdf_pages.to_printed(alias, rec[src])
        rec['printed_offset'] = pdf_pages.offset(alias)
    elif st == pdf_pages.MAPPED:
        # B-1850: a book mapped by page runs answers its printed pages through the converter; a page outside every
        # run has none, and says so by class rather than by a missing key. A parted book (C-C2F-4) names the part.
        for src, dst in (('page_start', 'printed_start'), ('page_end', 'printed_end')):
            if rec.get(src) is not None:
                got = pdf_pages.to_printed(alias, rec[src])
                rec[dst] = None if got is None else int(got)
                if getattr(got, 'part', None) is not None:
                    rec[dst.replace('printed_', 'printed_part_')] = got.part
                if got is None:
                    rec['printed_unavailable'] = pdf_pages.NO_PRINTED
        rec['printed_note'] = pdf_pages.explain(alias)
    else:
        rec['printed_unavailable'] = st          # 'uncalibrated' | 'unknown-book'
        rec['printed_note'] = pdf_pages.explain(alias)
    return rec


def stamp_text_quality(conn, rec, alias=None):
    """Audit F9: annotate a page-bearing record with `text_quality` ('clean' | 'glyph-loss' |
    'mojibake' — the BOOK's class) and `page_hostile` (THIS page's OCR text failed the census's
    signals). Derived at runtime by `swrpg_index/text_quality.py`; additive only."""
    from . import text_quality
    return text_quality.annotate(conn, rec, alias=alias)


def read_pages(conn, alias, pages):
    """Return a list of {'page': N, 'text': str} from the chunks table
    (already cleaned at ingest time). Pages is a list of 1-indexed ints."""
    if not pages:
        return []
    ph = ','.join('?' * len(pages))
    rows = conn.execute(
        f'''SELECT page_start, page_end, text FROM chunks
            WHERE alias = ? AND page_start IN ({ph})
            ORDER BY page_start''',
        [alias] + list(pages),
    ).fetchall()
    # chunks are per-page (phase 1); one row per requested page (if it
    # wasn't merged forward). For pages that merged, the row covers a
    # range and we emit once with the page_start.
    out = []
    for r in rows:
        out.append(stamp_text_quality(conn, stamp_pagination(alias, {
            'page_start': r['page_start'],
            'page_end':   r['page_end'],
            'text':       r['text'],
        }), alias=alias))
    return out


def chapter(conn, alias, section_name):
    """Find a TOC entry by substring and return (title, pages, chunks)."""
    row = conn.execute(
        '''SELECT title, page_start, page_end, level
           FROM toc
           WHERE alias = ? AND LOWER(title) LIKE ?
           ORDER BY level ASC, page_start ASC
           LIMIT 1''',
        (alias, f'%{section_name.lower()}%'),
    ).fetchone()
    if not row:
        return {'error': f'section matching {section_name!r} not found in {alias}'}
    chunks = conn.execute(
        '''SELECT page_start, page_end, text FROM chunks
           WHERE alias = ? AND page_start >= ? AND page_end <= ?
           ORDER BY page_start''',
        (alias, row['page_start'], row['page_end']),
    ).fetchall()
    return stamp_text_quality(conn, stamp_pagination(alias, {
        'alias': alias,
        'title': row['title'],
        'page_start': row['page_start'],
        'page_end':   row['page_end'],
        'chunks': [
            stamp_text_quality(conn, stamp_pagination(alias, {
                'page_start': r['page_start'], 'page_end': r['page_end'],
                'text': r['text']}), alias=alias)
            for r in chunks
        ],
    }))
