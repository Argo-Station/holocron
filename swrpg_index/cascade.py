"""Retrieval cascade — one-call rule lookup for sub-agent use.

Orchestrates topic detection + search + dedup + relevance check +
weak/miss/partial markers into a single `retrieve_rule_for_query(conn,
query)` call. (The search_expanded fallback is retired behind
CASCADE_FALLBACK — ruling `oracle-o5-blend` C-O5B-3.) The cascade is the same
one Threepio runs client-side in `retrieval.py`, ported here to a
synchronous server-side implementation that operates directly on the
sqlite connection + embedder the MCP server owns.

Why server-side: a Claude Code sub-agent that does its own
orchestration would have to call `topic()`, `search()`, possibly
`search_expanded()` in sequence and re-implement dedup + relevance
heuristics in its prompt. That's expensive (multiple tool calls per
RAW question), fragile (prompt-driven heuristics drift), and
duplicates logic that already works in Threepio. One MCP tool that
returns the fused result keeps sub-agent prompts terse and the
cascade testable.

Why not move api.py functions here too: existing per-primitive tools
(`search`, `topic`, etc.) remain useful for other agent shapes that
want finer control. This module is additive — it sits on top of them.
"""
from __future__ import annotations

import re
import sys
from typing import Optional

from . import api as _api


# ── Alias canonicalization ────────────────────────────────────────────────
#
# Aliases sharing content (parallel OCR / format / beginner-game
# extractions of the same source book) canonicalize to one family
# name so dedup can collapse them. Aliases not in this map pass
# through unchanged — the -gm variants and adventure folios are
# separate published books with distinct content and must remain
# distinct for retrieval purposes.
_CANONICAL_ALIAS = {
    'fad':          'fad',
    'fad-ocr':      'fad',
    'fad-lite':     'fad',
    'fad-beginner': 'fad',
    'eote':          'eote',
    'eote-beginner': 'eote',
    'aor':          'aor',
    'aor-beginner': 'aor',
}


def canonical_alias(alias: str) -> str:
    return _CANONICAL_ALIAS.get(alias, alias)


# ── Trigger / relevance vocabulary ────────────────────────────────────────
#
# Presence of any of these (whole-word, case-insensitive) is taken as
# evidence that the query is about FFG mechanics. Used (a) by the
# relevance check — at least one chunk must mention one of these
# keywords for the search hits to count as relevant; and (b) by the
# fallback query-expansion step — these are the words extracted to
# build the keyword-distilled variant.
#
# False positives are acceptable — the cost of an extra search call
# is small; the cost of a missed rules question is high.
_KEYWORDS: list[str] = [
    # action verbs
    'check', 'checks', 'roll', 'rolls', 'rolled', 'test', 'attempt', 'attempts',
    # dice / outcome symbols
    'success', 'successes', 'failure', 'failures',
    'advantage', 'advantages', 'threat', 'threats',
    'triumph', 'triumphs', 'despair', 'despairs',
    'boost', 'setback', 'difficulty',
    # resources / pools
    'destiny', 'strain', 'wound', 'wounds', 'soak', 'defense',
    'encumbrance', 'force point', 'force points', 'dark side', 'light side',
    # skills (FFG core 25)
    'athletics', 'brawl', 'charm', 'coercion', 'computers', 'cool',
    'coordination', 'deception', 'discipline', 'gunnery', 'leadership',
    'lightsaber', 'mechanics', 'medicine', 'melee', 'negotiation',
    'perception', 'piloting', 'ranged', 'resilience', 'skulduggery',
    'stealth', 'streetwise', 'survival', 'vigilance',
    # characteristics
    'brawn', 'agility', 'intellect', 'cunning', 'willpower', 'presence',
    # combat
    'attack', 'attacks', 'attacking', 'fire', 'shoot', 'shoots',
    'strike', 'parry', 'dodge', 'deflect', 'initiative',
    # adversary types
    'nemesis', 'rival', 'minion', 'adversary', 'npc', 'critical injury',
]

_KEYWORD_PATTERN = re.compile(
    r'\b(?:' + '|'.join(re.escape(k) for k in _KEYWORDS) + r')\b',
    re.IGNORECASE,
)


# ── Strength: leg agreement, not a score threshold ───────────────────────
#
# Audit `oracle-audit-2026-09-22` F3. The cascade used to call a result
# strong when the top hit's RRF score cleared WEAK_SCORE_THRESHOLD = 0.01.
# With limit=5 the search pool is 40 per leg and RRF k=60, so the LOWEST
# score any returned hit can carry is 1/(60+40) = 0.0100 — equal to the
# threshold. The gate could not fail (measured: 0 fires in 38 probes,
# "how to bake sourdough bread" included). The constant is kept only so
# `swrpg_index/tests/cascade_weak.py` can prove that arithmetic; nothing
# in the cascade reads it any more.
#
# A result is STRONG iff at least one of its top-`limit` hits was found by
# BOTH retrieval legs (`sources` carries 'bm25' AND 'semantic') AND the
# keyword leg saw the whole question on that page (`bm25_all_terms`). Until
# ruling `oracle-o2a-search-repair` (F2) the keyword leg only ever returned
# such pages — it ANDed every word — so 'bm25' in `sources` meant that by
# itself. The leg now ORs the question's content words so it can contribute
# to real questions, and 'bm25' in `sources` means only "shares a subject
# word"; the premise moved onto the flag, which `api.bm25_leg` sets from an
# all-words expression (`api.BM25_ALL_TERMS` says which). So the test keeps
# its meaning: the keyword leg saw the whole question on the page and the
# meaning leg independently ranked the same page. A hit short of that is
# WEAK — the signature of a miss (a shared word, or a neighbouring topic).
#
# NARROWED by ruling `oracle-o7` ADDENDUM 3 (R-O7-6). Every word on one page is rare for a real question
# (the test called 1,348 of the recall benchmark's 1,356 weak, and a weak answer was a miss 29.0 % of the
# time, the base rate). So a two-leg hit is ALSO strong when it ranks within the top STRONG_LEG_DEPTH of
# BOTH legs (`bm25_rank` and `sem_rank`, each leg's own rank of the page). Today's test is kept beside it,
# so no answer goes from strong to weak. Nothing ranked moves: this decides a LABEL only.
#
# ONLY weak -> search may move (ruling `oracle-o7` ADDENDUM 6, R-O7-13). The JOINED test (today's or the
# depth clause) decides only the promotion to `search` (with ≥1 relevant hit). Every weak / partial / miss
# decision reads TODAY'S test (`leg_depth=0`), so a page near the top of both legs with no on-subject snippet
# stays weak rather than falling to partial or miss, and partial / miss fire exactly where they did. Predicted
# on the held-out half: a weak answer is a miss 56.0 % of the time (base rate 29.9 %).
WEAK_SCORE_THRESHOLD = 0.01  # RETIRED — see above; read by the guard only
RRF_K = 60                   # api.search's default fusion constant
STRONG_LEG_DEPTH = 5         # ruling `oracle-o7` ADDENDUM 3, R-O7-6
# 0 restores the pre-O7 test; the 'expand' alternative reproduces the pre-O5 base only with it (R-O7-11).


def min_rrf_score(limit: int = 5, k: int = RRF_K) -> float:
    """The smallest RRF score a single-leg hit can carry in the cascade's
    primary search: rank = the search pool depth (api.search pools
    max(raw_budget*4, 20) per leg; raw_budget = max(limit*2, limit+1))."""
    raw_budget = max(limit * 2, limit + 1)
    pool = max(raw_budget * 4, 20)
    return 1.0 / (k + pool)


def _top_of_both_legs(h: dict, depth: int) -> bool:
    """The hit ranks within the top `depth` of BOTH legs. A hit carrying no leg rank (absent or None)
    does not qualify, so this never adds strength the hit cannot show; depth 0 never qualifies."""
    br, sr = h.get('bm25_rank'), h.get('sem_rank')
    return br is not None and sr is not None and max(br, sr) <= depth


def is_strong(hits: list[dict], min_variants: int = 1, leg_depth: Optional[int] = None) -> bool:
    """True iff ≥1 hit was found by both the bm25 and the semantic leg AND either
    the bm25 leg saw the whole question on it (`bm25_all_terms`) or it ranks within
    the top `leg_depth` of both legs (R-O7-6; see above). `leg_depth` None reads
    STRONG_LEG_DEPTH (the JOINED test); 0 is TODAY'S test alone (R-O7-13).

    `min_variants` applies to `search_expanded` hits, which also carry
    `variants_matched`: an expanded hit counts only when that many query
    variants agreed on it. The cascade passes 2 — search_expanded's own
    contract ("2+ means consensus; 1 means a variant-specific weak hit").
    Without it, the keyword-distilled variant ("attack", "check") finds a
    generic two-leg page for any question that happens to carry an FFG
    keyword: measured, "pathfinder attack of opportunity rules" and "what
    DC is a lock picking check" both read `search_expanded` on a
    single-variant two-leg hit, while the eval's two genuine expanded
    recoveries (lightsaber_stats, villain_scarier) carry a 2-variant hit.
    """
    depth = STRONG_LEG_DEPTH if leg_depth is None else leg_depth
    for h in hits:
        src = set(h.get('sources') or [])
        if 'bm25' in src and 'semantic' in src and (h.get('bm25_all_terms') or _top_of_both_legs(h, depth)):
            vm = h.get('variants_matched')
            if vm is None or vm >= min_variants:
                return True
    return False


EXPANDED_MIN_VARIANTS = 2


# ── Lazy topic-name cache ────────────────────────────────────────────────
#
# Built once per server lifetime on first cascade call (cheap — one
# topics() call hits the DB and produces ~71 names). Re-used for every
# subsequent retrieve_rule_for_query invocation.
_TOPIC_NAMES: Optional[list[str]] = None
_TOPIC_PATTERN: Optional[re.Pattern] = None


def _ensure_topics(conn) -> None:
    global _TOPIC_NAMES, _TOPIC_PATTERN
    if _TOPIC_NAMES is not None:
        return
    try:
        rows = _api.topics(conn)
    except Exception as e:
        print(f'[cascade] topics() failed: {type(e).__name__}: {e}', file=sys.stderr)
        _TOPIC_NAMES = []
        _TOPIC_PATTERN = None
        return
    names = [r['name'] for r in rows if r.get('name')]
    _TOPIC_NAMES = names
    if not names:
        _TOPIC_PATTERN = None
        return
    # Longest first so multi-word topics win over single-word substrings.
    # Optional trailing 's' for graceful plural handling.
    sorted_names = sorted(set(names), key=len, reverse=True)
    parts = [re.escape(n) + 's?' for n in sorted_names]
    _TOPIC_PATTERN = re.compile(
        r'\b(?:' + '|'.join(parts) + r')\b', re.IGNORECASE
    )


def _detect_topic(text: str) -> Optional[str]:
    if _TOPIC_PATTERN is None or not _TOPIC_NAMES:
        return None
    m = _TOPIC_PATTERN.search(text)
    if not m:
        return None
    matched = m.group(0).lower()
    if matched in _TOPIC_NAMES:
        return matched
    if matched.endswith('s') and matched[:-1] in _TOPIC_NAMES:
        return matched[:-1]
    return matched


# ── Helpers ──────────────────────────────────────────────────────────────


def _expand_queries(text: str) -> list[str]:
    """Up to 3 variants for the search_expanded vocabulary-gap fallback:

    1. Original verbatim
    2. FFG-keyword distillation (just the matched keywords)
    3. Keyword distillation + ' rules' suffix (biases toward rule-text)
    """
    variants = [text]
    matches = _KEYWORD_PATTERN.findall(text)
    if matches:
        kw = ' '.join(matches)
        if kw.lower() != text.strip().lower():
            variants.append(kw)
            variants.append(kw + ' rules')
    return variants[:3]


def _dedup(hits: list[dict], limit: int) -> list[dict]:
    """Drop hits whose (canonical_alias, page_start) matches a higher-
    scoring earlier hit. Hits arrive pre-sorted by score, so iteration
    order keeps the best score per family. Stops at `limit`.
    """
    deduped: list[dict] = []
    seen: set[str] = set()
    for h in hits:
        key = _page_key(h)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(h)
        if len(deduped) >= limit:
            break
    return deduped


# ── The weak path's evidence (ruling `oracle-o2c-cascade-fix` C-OCF-2) ────
#
# When neither the primary nor the expanded search is strong, the cascade
# used to return the EXPANDED list and discard the primary's — even though
# the expanded list is the primary question diluted by its keyword-only
# variants ("attack check"), and the primary's own top five was the better
# list: measured, 785 → 820/1,356 on the recall benchmark and 95 → 99/100 on
# the human-authored topics when the primary's hits are kept. Which list the
# weak path returns — measured, same discipline as api.BM25_LEG_ORDER:
#   'expanded'  the pre-O2c behaviour (kept so the ablation can reproduce it)
#   'primary'   the primary search's top `limit`
#   'merge'     RRF over the two ranked lists (both deduped), k = RRF_K
WEAK_PATH_HITS = 'primary'


# ── The fallback (ruling `oracle-o5-blend` C-O5B-3) ──────────────────────
#
# When the primary search was not strong, the cascade used to re-ask the question as up to three
# variants through `search_expanded` (the original, its FFG keywords, keywords + ' rules'). Measured
# with the score-space blend (api.HYBRID_FUSION = 'cc'), retiring it is part of lever A of
# `oracle-o4-research`: 810 → 963/1,356 on the recall benchmark, TREC 98 → 100/100. Same discipline
# as api.BM25_LEG_ORDER / WEAK_PATH_HITS:
#   'retired'  ONE hybrid search; its five pages are classified (search / weak / partial / miss)
#   'expand'   the pre-O5 search_expanded fallback (kept so the alternative reproduces the base)
# Pinned by `swrpg_index/tests/hybrid_blend.py`. WEAK_PATH_HITS matters only under 'expand': it
# chooses between lists only the fallback makes.
CASCADE_FALLBACK = 'retired'


def _page_key(h) -> str:
    """`_dedup`'s key: the canonical family and the corpus page."""
    return f"{canonical_alias(h.get('alias', ''))}:{h.get('page_start')}"


def _weak_path_hits(hits, raw, raw_exp, expanded, limit):
    if WEAK_PATH_HITS == 'expanded' or not hits:
        return expanded or hits
    if WEAK_PATH_HITS == 'primary':
        return hits
    if WEAK_PATH_HITS == 'merge':
        key = lambda h: f"{canonical_alias(h.get('alias', ''))}:{h.get('page_start')}"
        score: dict[str, float] = {}
        first: dict[str, dict] = {}
        for lst in (_dedup(raw, len(raw)), _dedup(raw_exp, len(raw_exp))):
            for rank, h in enumerate(lst, 1):
                k = key(h)
                score[k] = score.get(k, 0.0) + 1.0 / (RRF_K + rank)
                first.setdefault(k, h)       # the primary's copy of a page wins
        return [first[k] for k in sorted(score, key=lambda k: (-score[k], k))[:limit]]  # k is alias:page (C-OHY-4)
    raise ValueError(f'unknown WEAK_PATH_HITS {WEAK_PATH_HITS!r}')


# Words that carry no subject — one list with the BM25 leg, which drops them
# from a question. A query made only of these has no token to share with a
# snippet, so none of its hits counts as relevant.
_STOPWORDS = _api.QUERY_STOPWORDS
_TOKEN_RE = re.compile(r"[a-z0-9][a-z0-9'\-]*")


def _content_tokens(text: str) -> set[str]:
    return {t for t in _TOKEN_RE.findall((text or '').lower())
            if t not in _STOPWORDS and len(t) > 1}


def _relevance_count(hits: list[dict], query: str) -> int:
    """Count how many hits' snippets are about what was asked.

    A query carrying FFG mechanics keywords: a hit is relevant when its
    snippet contains one of THOSE keywords (unchanged behaviour).

    A query with NO FFG keyword used to return `len(hits)` — every hit
    "relevant" — which exempted exactly the non-FFG vocabulary (D&D terms,
    nonsense) the check exists for (audit F3). Now a hit is relevant when
    its snippet shares at least one non-stopword token with the query.
    """
    matches = _KEYWORD_PATTERN.findall(query)
    if not matches:
        q_tokens = _content_tokens(query)
        if not q_tokens:
            return 0
        return sum(1 for h in hits if q_tokens & _content_tokens(h.get('snippet')))
    kw_set = {m.lower() for m in matches}
    kw_pattern = re.compile(
        r'\b(?:' + '|'.join(re.escape(k) for k in kw_set) + r')\b',
        re.IGNORECASE,
    )
    return sum(1 for h in hits if kw_pattern.search(h.get('snippet') or ''))


# ── Public API ───────────────────────────────────────────────────────────


def retrieve_rule_for_query(
    conn,
    query: str,
    limit: int = 5,
    embedder=None,
    alias: Optional[str] = None,
    snippet_chars: int = 1200,
) -> dict:
    """Run the cascade. Returns:

        {
          'hits':           list[dict],   # search hits (deduped, scored)
          'topic_sources':  list[dict],   # chapter-level sources from topic()
          'topic_name':     str | None,   # the matched topic name, if any
          'tool_used':      str,          # 'search' | 'search_expanded'
                                          # | 'weak' | 'partial' | 'miss'
                                          # ('search_expanded' only under
                                          # CASCADE_FALLBACK = 'expand')
          'is_miss':        bool,         # nothing relevant found anywhere
          'is_partial':     bool,         # topic pointers exist but no
                                          # passage was strongly matched
          'is_weak':        bool,         # hits came back, but no page
                                          # ranked top five in both legs
                                          # or carried every word on both
          'alias':          str | None,   # the book the call was aimed at
        }

    Classification under CASCADE_FALLBACK = 'retired' (ruling `oracle-o5-blend` C-O5B-3), on
    `hits` = the first `limit` distinct pages of the one hybrid search's whole fused pool:
      1. hits STRONG (≥1 hit on both legs, keyword leg on every word OR top STRONG_LEG_DEPTH on both legs;
         R-O7-6) and ≥1 relevant → 'search'
      2. else hits exist and none is strong by TODAY'S test (both legs, keyword leg on every word;
         R-O7-13) → 'weak' (is_weak; is_partial too when topic_sources exist) — the hits are
         returned as locators. A page near the top of both legs with no relevant snippet is weak.
      3. else (no hits, or hits strong by today's test with no relevant snippet) → 'partial' when
         topic_sources exist, 'miss' otherwise
    The hits returned are `hits` in every case.

    Under CASCADE_FALLBACK = 'expand' (the pre-O5 cascade, kept) — audit F3's leg agreement:
      1. primary search STRONG (≥1 hit on both legs) and ≥1 relevant hit → 'search'
      2. else expanded search STRONG — ≥1 hit on both legs AND matched by ≥2
         query variants — and ≥1 relevant hit → 'search_expanded'
      3. else hits exist and none is strong → 'weak' (is_weak; is_partial
         too when topic_sources exist) — the hits are returned as locators;
         which list (the primary's, by default) is WEAK_PATH_HITS (C-OCF-2)
      4. else (no hits, or two-leg hits with no relevant snippet) → 'partial'
         when topic_sources exist, 'miss' otherwise (unchanged semantics)

    `alias` aims every search leg AND the topic pointers at one book
    (R-EQW1's per-book pass). `snippet_chars` widens the snippet window
    (audit F6: 600-char windows forced a page read for every answer).

    Every hit and topic source carries `text_quality` (book) and
    `page_hostile` (page) from `swrpg_index.text_quality` (audit F9).
    """
    from . import text_quality as _tq

    _ensure_topics(conn)
    topic_name = _detect_topic(query)

    # Topic fetch (optional; non-fatal on error)
    topic_sources: list[dict] = []
    if topic_name:
        try:
            payload = _api.topic(conn, topic_name)
            if isinstance(payload, dict):
                topic_sources = payload.get('sources') or []
        except Exception as e:
            print(
                f'[cascade] topic({topic_name!r}) failed: '
                f'{type(e).__name__}: {e}',
                file=sys.stderr,
            )
    if alias:
        topic_sources = [t for t in topic_sources if t.get('alias') == alias]
    for t in topic_sources:
        if 'page_start' in t and 'text_quality' not in t:
            _tq.annotate(conn, t)

    def _result(hits, tool_used, is_miss=False, is_partial=False, is_weak=False,
                sources=topic_sources):
        for h in hits:
            if 'text_quality' not in h:
                _tq.annotate(conn, h)
        return {
            'hits': hits,
            'topic_sources': sources,
            'topic_name': topic_name,
            'tool_used': tool_used,
            'is_miss': is_miss,
            'is_partial': is_partial,
            'is_weak': is_weak,
            'alias': alias,
        }

    if CASCADE_FALLBACK not in ('retired', 'expand'):
        raise ValueError(f'unknown CASCADE_FALLBACK {CASCADE_FALLBACK!r}')

    # Primary search (always runs). Under the score-space blend the pages are the first distinct
    # pages of the WHOLE fused pool (C-O5B-2), deduped before rendering; under 'rrf' the pre-O5
    # 10-row cut stands, so that alternative reproduces the base.
    raw_budget = max(limit * 2, limit + 1)
    if _api.HYBRID_FUSION == 'cc':
        raw = _api.search(
            conn, query, mode='hybrid', alias=alias,
            limit=raw_budget if CASCADE_FALLBACK == 'expand' else limit,
            snippet_chars=snippet_chars, embedder=embedder, page_key=_page_key,
        )
    else:
        raw = _api.search(
            conn, query, mode='hybrid', alias=alias, limit=raw_budget,
            snippet_chars=snippet_chars, embedder=embedder,
        )
    hits = _dedup(raw, limit=limit)
    rel = _relevance_count(hits, query)

    # Happy path: the legs agree on at least one page (the JOINED test), and it is on-subject.
    if hits and is_strong(hits) and rel >= 1:
        return _result(hits, 'search')

    if CASCADE_FALLBACK == 'retired':
        # Weak: hits exist and it is not search, and no page was found by both legs on every word — TODAY'S
        # test, so only weak -> search can move (C-O5B-3, R-O7-13).
        if hits and not is_strong(hits, leg_depth=0):
            return _result(hits, 'weak', is_weak=True, is_partial=bool(topic_sources))
        if topic_sources:
            return _result(hits, 'partial', is_partial=True)
        return _result(hits, 'miss', is_miss=True, sources=[])

    # Fallback: search_expanded with variants
    variants = _expand_queries(query)
    raw_exp = _api.search_expanded(
        conn, variants, mode='hybrid', alias=alias, limit=raw_budget,
        snippet_chars=snippet_chars, embedder=embedder,
    )
    expanded = _dedup(raw_exp, limit=limit)
    exp_rel = _relevance_count(expanded, query)

    if expanded and is_strong(expanded, EXPANDED_MIN_VARIANTS) and exp_rel >= 1:
        return _result(expanded, 'search_expanded')

    final_hits = expanded if expanded else hits

    # Weak: hits exist, but no page was found by both legs (for expanded
    # hits: by both legs AND by ≥2 variants). The strength test reads the
    # expanded list as before; WHICH list is returned is WEAK_PATH_HITS.
    # Like the retired path, the weak decision reads TODAY'S test (R-O7-13).
    if final_hits and not is_strong(final_hits, EXPANDED_MIN_VARIANTS, leg_depth=0) \
            and not is_strong(hits, leg_depth=0):
        return _result(_weak_path_hits(hits, raw, raw_exp, expanded, limit), 'weak',
                       is_weak=True, is_partial=bool(topic_sources))

    # Miss / partial (unchanged semantics)
    if topic_sources:
        return _result(final_hits, 'partial', is_partial=True)
    return _result(final_hits, 'miss', is_miss=True, sources=[])
