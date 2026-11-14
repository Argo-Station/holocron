"""MCP server — exposes swrpg_index retrieval tools to any MCP-compatible
client (Claude Desktop, Claude Code, etc.) via stdio transport.

Design:
* Pure retrieval tools only — search, topic, topics, toc, list_pdfs,
  read_pages, chapter. No maintenance commands (ingest, embed, ocr, render);
  an agent shouldn't rebuild the index.
* One SQLite connection + one embedder are loaded at server startup and
  reused across tool calls. This is the *real* perf win over the CLI —
  the embedder's ~3s cold-start happens once per server session, not
  per invocation.
* All tools accept optional `tier: "beginner" | "mid" | "late"` for
  mechanical enforcement of the vet-agent STRICT RULES (no more prompt
  rules that agents might ignore).

Usage:
    python3 swrpg_mcp.py           # starts stdio server, blocks

Claude Desktop config (see docs/mcp-integration.md for details):
    {
      "mcpServers": {
        "swrpg": {
          "command": "py",
          "args": ["-3", "C:/path/to/swrpg_mcp.py"]
        }
      }
    }
"""
import os
import pathlib
import sqlite3
import sys
from contextlib import contextmanager
from typing import Optional, Literal

from mcp.server.fastmcp import FastMCP

from . import api as _api
from . import cascade as _cascade
import json

from .utils import COMMUNITY_DB_PATH, INDEXES, SCRIPT_DIR, corpus_for_alias, db_path_for_corpus, load_config
from . import embed as _embed_mod
from . import pdf_pages as _pdf_pages


# ── Server + shared resources ──────────────────────────────────────────────

mcp = FastMCP('swrpg-index')


class _State:
    """Lazy singletons — embedder and DB connection are created on first use
    and reused for the lifetime of the server."""
    _embedder = None
    _conn_path = None  # track DB path for reconnect-on-change

    @classmethod
    def embedder(cls):
        if cls._embedder is None:
            # stderr because MCP stdio uses stdout for protocol frames.
            print('[swrpg-mcp] loading embedder (first use)…', file=sys.stderr)
            cls._embedder = _embed_mod.default_embedder()
        return cls._embedder


def _corpus(alias=None, corpus='books'):
    """Which index a call reads (R-RDI-3-3/4): an alias goes where its registry row says (THE router,
    utils.corpus_for_alias); without one, the `corpus` asked for, books by default."""
    if alias:
        return corpus_for_alias(alias)
    if corpus not in INDEXES:
        raise ValueError(f'corpus {corpus!r} is not one of {INDEXES}')
    return corpus


@contextmanager
def _connection(alias=None, corpus='books'):
    """Open a fresh connection per tool call. SQLite connections aren't
    thread-safe by default and MCP servers may fan out; this is cheap.

    Every tool opens one first, so this is also where the page map catches up
    with Docs/pdf_sources.json: an offset changed while the service runs is
    served from the next call on, not after a restart (R-OPT-4, B-1116).

    It opens ONE index: the books' (Docs/swrpg_index.db) or the community documents'
    (Docs/swrpg_community.db), never both, so no call ranks the two together (R-RDI-3-4)."""
    _pdf_pages.refresh_if_changed()
    path = db_path_for_corpus(_corpus(alias, corpus))
    # READ-ONLY (B-1269): a plain connect CREATES an empty file where the index is absent, and every
    # DB-dependent guard after it in that tree read FAIL instead of VOID. No tool writes the index.
    conn = sqlite3.connect(pathlib.Path(path).as_uri() + '?mode=ro', uri=True)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


# ── Tools ──────────────────────────────────────────────────────────────────

@mcp.tool()
def search(
    query: str,
    mode: Literal['bm25', 'semantic', 'hybrid'] = 'hybrid',
    alias: Optional[str] = None,
    tier: Optional[Literal['beginner', 'mid', 'late']] = None,
    content_type: Optional[str] = None,
    limit: int = 5,
    snippet_chars: int = 600,
    rrf_k: int = 60,
    boost_tables: bool = False,
    corpus: Literal['books', 'community'] = 'books',
) -> list[dict]:
    """Search the FFG rulebook library — use for general rule/content queries.

    ## When to use
    * The user asks an open question about rules, adversaries, mechanics,
      or lore and you don't already know the alias and page.
    * A previous `topic()` call returned no match or an incomplete one.
    * Paraphrased or natural-language queries ("how do I make combat feel
      dangerous", "rules for a chase scene").

    ## When NOT to use
    * You already know the alias and page range — use `read_pages` instead,
      it's free (no retrieval cost) and returns full page text.
    * The concept maps to a known topic ("encounter building", "nemesis",
      "crit table") — try `topic()` FIRST. It's a shortcut to the canonical
      rulebook section and gives you the authoritative pages in one call.
    * You want every page of a named chapter — use `chapter(alias, name)`.
    * The user wants a list of what's indexed — use `list_pdfs()`.

    ## Example
        search(
            query="how do I run a nemesis at the table",
            mode="hybrid",
            tier="mid",
            limit=5,
        )

    ## Args
        query: Natural-language or keyword text. Don't pre-format as FTS5
            boolean expression — the server tokenizes and quotes for you.
            Short (3-6 words) queries with concrete mechanics terms beat
            long conversational questions.
        mode: **'hybrid' (default, recommended)** combines BM25 keyword
            matching with bge-small-en-v1.5 semantic cosine, blended by
            score (30% keyword, 70% meaning); best default for any GM
            question.
            'bm25' is keyword-only — use when you have exact FFG terminology
            and want literal matches (e.g. 'Force Rating', 'Adversary 2').
            'semantic' is vector-only — use when the query uses non-FFG
            vocabulary ('boss fight', 'mook') or is abstract ('making a
            villain scarier'). Has a known vocabulary-gap strength.
        alias: Single-PDF restriction (e.g. 'eote', 'fad-beginner',
            'eote-gm', 'holocron'). Call `list_pdfs()` to discover aliases.
        corpus: Which index to search when no `alias` is given: 'books' (default, the FFG
            rulebooks) or 'community' (the reSpecialized Folios and Design Docs, aliases
            `respec-folio-<slug>` / `respec-design-<slug>`). The two are never ranked together.
            An `alias` decides on its own: a community alias reads the community index.
        tier: Enforces the vet-agent STRICT RULES mechanically.
            'beginner' → Beginner Games + folios only.
            'mid' → all three CRBs + 18 career sourcebooks + GM kits +
            shared (Gadgets, Ships, Talent Index, Adversary Cards).
            'late' → everything including era supplements (Dawn of
            Rebellion, Collapse of the Republic, etc.).
            Omit to search the whole library.
        content_type: Filter to one chunk category: 'rule' (the default
            classification — most useful), 'table', 'sidebar', 'adversary',
            'cover', 'toc'. Use 'rule' to suppress adversary stat-block
            false-positives on mechanics queries (e.g. searching 'soak'
            without this filter surfaces every NPC's stat line).
        limit: Max hits returned. 5 is usually enough; bump to 10 for
            adversarial/vocabulary-gap queries where the right answer may
            be #6-10.
        snippet_chars: Snippet window around the first query-term hit.
            600 is ~2-3 sentences of context; 1200+ to see the full rule
            paragraph.
        rrf_k: Reciprocal Rank Fusion k. Applies only under the 'rrf'
            fusion (`api.HYBRID_FUSION`), which is not the shipped one:
            under the shipped score blend it is accepted and has no
            effect. Default 60 is the standard from the RRF paper.
        boost_tables: When True, applies a 1.5x score multiplier to
            content_type='table' chunks BEFORE the top-K cut.

            **Use when** the query is really asking about a numeric
            profile or stat block: weapon damage/crit, armor soak/defence,
            vehicle handling/silhouette, crit-table d100 rolls. Signs
            you need it: the query contains "stats," "profile," "damage,"
            "crit," "Dam Crit Range," "weapon table," "armor table."
            **Don't use** for rule-prose queries ("how does soak work,"
            "when to award XP," "how to run a nemesis") — dense prose
            pages carry these answers better than sparse table cells,
            and boosting tables here surfaces wrong content.

            Rationale: FFG weapon/stats tables have sparse numeric cells
            interleaved with text columns, which makes their BM25 scores
            lower than prose pages that discuss the same stats in flowing
            sentences. Without this boost, authoritative tables in the
            CRB consistently lose to reprints in career sourcebooks,
            GM kits, or compiled quick-refs.

    ## WHICH PAGE NUMBERS ARE THESE? (B-335 A1-4 — read this before citing)
    `page_start`/`page_end` are **CORPUS pages** — the PDF's own index — and every record
    says so in `pagination: "corpus"`. A book's PRINTED page (what a reader checks, what a
    citation names) differs by that book's front matter (EotE +9) — the record's own
    `printed_offset` is the authority, never a number written here.
    * Calibrated book → `printed_start` / `printed_end` / `printed_offset` are also present.
      **Cite the PRINTED number; navigate by the CORPUS one.**
    * Uncalibrated book → `printed_unavailable` ('uncalibrated' | 'unknown-book') and a
      `printed_note` saying why. No printed page is guessed, because a wrong one makes the
      citation confidently wrong. About a third of the 100 books are calibrated
      (`python -m swrpg_index.pdf_pages` prints the live count).
    Never do the arithmetic yourself — `swrpg_index/pdf_pages.py` is the only legal converter.

    ## Return shape
    List of match dicts, ordered best → worst:
        {alias, book, tier, page_start, page_end, chapter, section,
         content_type, score, score_kind, snippet, sources,
         bm25_rank?, sem_rank?}

    ### How to read the score
    * score_kind='cc'    (hybrid):  higher = better, 0–1 before a table
      boost (a verified table ×2.5; a table ×1.5 under boost_tables).
      Each leg's score is min-max normalised over its own 40 rows, then
      0.3 × keyword + 0.7 × meaning; a page on one leg only scores at
      most that leg's share. sources=['bm25','semantic'] means both
      retrievers agreed — high trust. (score_kind='rrf', range
      ~0.01–0.08, appears only under the 'rrf' fusion.)
    * score_kind='bm25'  (bm25):    LOWER = better (negative distance).
      −8 is great, −3 is marginal, 0 is essentially no signal.
    * score_kind='cosine'(semantic): higher = better, 0..1 range.
      >0.75 is strong; 0.6–0.75 is suggestive; <0.6 is weak.

    ## Failure signals — what to do if results are empty or weak

    Empty result list:
        1. Drop filters first (`content_type`, then `tier`, then `alias`).
        2. Switch `mode='semantic'` — catches vocabulary-gap queries BM25
           misses ("bodyguards/mooks", "boss fight").
        3. Reformulate with concrete FFG mechanics terms ('nemesis',
           'rival', 'adversary', 'initiative', 'destiny point', 'force
           rating'). If you don't know the right terms, call `topics()`
           to see what's registered.
        4. **If reformulating once doesn't help, escalate to
           `search_expanded(queries=[...])`** with 2-3 different
           reformulations of the user's question. RRF across variants
           finds the consensus when no single phrasing hits cleanly.
        5. If still empty, the concept is probably not in the indexed
           corpus. Say so — do not speculate from training data.

    Results look wrong (top hit is an adversary stat block, cover page,
    or TOC):
        1. Re-run with `content_type='rule'` to suppress stat-block noise.
        2. Narrow the query: 'lightsaber rules' → 'lightsaber base weapon
           profile damage stats'.
        3. Switch to `mode='bm25'` if you have exact terminology. It lists
           the pages carrying every word first (`bm25_all_terms: true`),
           then pages sharing only some of them (`false`).
        4. Or use `boost_tables=True` if the query is really about a
           numeric profile table (weapon stats, crit table, armor stats).

    Results look thin (single weak hit, cosine < 0.6 on semantic, or
    the hit is vocabulary-adjacent but doesn't answer the actual question):
        1. Trust hybrid mode's bm25+semantic agreement as the primary
           signal. A single-leg hit with low score is a soft lead.
        2. **Escalate to `search_expanded`** with 2-3 reformulations
           in different vocabulary registers (colloquial, mechanical,
           situational). Consensus across variants = trustworthy.
        3. Verify with `read_pages` before citing.
    """
    with _connection(alias, corpus) as conn:
        # Preload embedder if the query needs it so the first hybrid call
        # after startup pays the ~3s cost once (not per-call).
        embedder = _State.embedder() if mode in ('semantic', 'hybrid') else None
        return _api.search(
            conn, query, mode=mode, alias=alias, tier=tier,
            content_type=content_type, limit=limit,
            snippet_chars=snippet_chars, rrf_k=rrf_k,
            embedder=embedder, boost_tables=boost_tables,
        )


@mcp.tool()
def search_expanded(
    queries: list[str],
    mode: Literal['bm25', 'semantic', 'hybrid'] = 'hybrid',
    alias: Optional[str] = None,
    tier: Optional[Literal['beginner', 'mid', 'late']] = None,
    content_type: Optional[str] = None,
    limit: int = 5,
    per_query_pool: int = 10,
    snippet_chars: int = 600,
    boost_tables: bool = False,
    corpus: Literal['books', 'community'] = 'books',
) -> list[dict]:
    """Fuse 2-5 of your own query reformulations via Reciprocal Rank Fusion —
    **the vocabulary-gap escalation after `search` returns weak/empty hits**.

    ## When to use
    * `search` returned empty, or only weak hits (bm25 score > -3, cosine
      < 0.6), or hits that are vocabulary-adjacent but wrong (you searched
      "villain" and got "antagonist" pages that don't discuss the rule you
      wanted).
    * The user's query uses language the corpus likely doesn't ("mook,"
      "boss fight," "gun bunny," "tank") and you need to bridge the gap
      with FFG-native vocabulary.
    * You have strong candidate reformulations in mind but no confidence
      about which is best. Let RRF pick.

    ## When NOT to use
    * `search` already surfaced a strong answer — this costs 2-5x the
      retrieval latency vs a single call.
    * You haven't TRIED `search` yet. This is escalation, not first line.
    * The query maps to a known `topic()` shortcut. Topic is free, authoritative,
      and faster.
    * You only have one phrasing in mind. RRF-across-one-variant is
      equivalent to regular `search`.

    ## Example — vocabulary-gap recovery

        # User asked: "how do I make a villain feel scarier?"
        # Initial search returned weak hits in era-specific sourcebooks.
        search_expanded(
            queries=[
                "how to develop a nemesis GM advice",
                "running the nemesis as a GM",
                "making an iconic nemesis character",
            ],
            limit=5,
        )
        # → eote-gm pp.26-32 "A GM's Guide to the Nemesis" (variants_matched: 3/3)

    ## How to author good reformulations

    1. **Translate colloquial → FFG-native.** boss fight → nemesis
       encounter; mook → minion; gun bunny → Ranged specialist; tank →
       Marauder / high-Soak PC.
    2. **Vary abstraction level.** One concrete (mentions mechanics),
       one mid (mentions role), one high (describes the situation).
    3. **Include a "target chapter" hint** in one variant if you can
       guess it: "12: Adversaries nemesis guidance" or "Game Master
       chapter encounter building."
    4. **Don't include the user's original query verbatim** — you've
       already tried that with `search`. These are alternatives.
    5. **2-3 is usually enough.** 4-5 if the gap is severe. More than
       5 dilutes the RRF signal.

    ## Args
        queries: 2-5 query variants. Each goes through the full search
            pipeline (BM25 + semantic if hybrid). Dedupe is automatic.
        mode: same as search(). 'hybrid' recommended.
        alias / tier / content_type / boost_tables: applied to every
            variant identically. Use tier to scope, boost_tables if
            you're asking about stats.
        limit: final top-K after fusion.
        per_query_pool: how deep each variant's list goes before RRF
            (default 10). Don't change unless you know why.

    ## Return shape

    Same as `search()` plus:
      * `expand_score` — fused RRF score (higher = better).
      * `variants_matched` — how many of your variants produced this
        hit. **2+ means consensus — trust these more.** 1 means a
        variant-specific weak hit; verify with `read_pages` before citing.

    ## Failure signals — what to do if STILL empty

    1. Check `variants_matched` on the top hit. If it's always 1, your
       variants are pulling different content — the corpus genuinely may
       not have a consensus answer. Say so.
    2. Try `topic()` / `topics()` — the concept may be registered.
    3. Drop filters (tier, content_type, alias).
    4. If still nothing, write to the user: "The corpus doesn't contain
       a clear answer for this. The closest related content is [cite]."
       Do not fabricate from training data.
    """
    with _connection(alias, corpus) as conn:
        embedder = _State.embedder() if mode in ('semantic', 'hybrid') else None
        return _api.search_expanded(
            conn, queries, mode=mode, alias=alias, tier=tier,
            content_type=content_type, limit=limit,
            per_query_pool=per_query_pool, snippet_chars=snippet_chars,
            boost_tables=boost_tables, embedder=embedder,
        )


@mcp.tool()
def retrieve_rule_for_query(
    query: str,
    limit: int = 5,
    alias: Optional[str] = None,
    snippet_chars: int = 1200,
    corpus: Literal['books', 'community'] = 'books',
) -> dict:
    """**Cascade lookup — one call that runs topic detection and one
    hybrid search, then classifies what came back (search / weak /
    partial / miss).**
    Designed for sub-agent (oracle / consult) use where the caller wants
    a single canonical "look up this rule" tool, not the per-step
    primitives.

    ## When to use
    * You are a sub-agent invoked to answer a single RAW (Rules As
      Written) question. The parent gave you a natural-language query
      and expects a citation-bearing answer.
    * You want the cascade's weak/miss/partial markers so the persona
      prompt can switch into (source: unverified) mode when retrieval
      failed.
    * You want one tool call per question rather than orchestrating
      `topic` + `search` by hand.

    ## When NOT to use
    * You already know the alias and page — use `read_pages` directly.
    * You want finer control over the pipeline (specific mode, tier
      filter, content_type filter, boost_tables, custom expansion
      variants) — call the per-primitive tools instead.
    * The query is exploratory / multi-turn — the cascade is one-shot;
      a multi-turn conversation should orchestrate primitives so it can
      adapt between turns.

    ## How the cascade works

    1. **Topic detection** — the query is scanned against the registered
       topic names (regex, longest-first). If matched, `topic(name)` is
       called to fetch chapter-level sources (filtered to `alias` when
       the call is aimed).
    2. **One search** — `search(query, mode='hybrid')`: the score blend
       over 40 rows per leg.
    3. **Dedup** — the hits are the first N distinct pages of the whole
       fused pool, deduplicated by canonical-alias-family (e.g.
       `fad-ocr` + `fad-lite` + `fad-beginner` collapse to `fad`) so
       reprints don't crowd out distinct sources.
    4. **Strength + relevance** — the result is STRONG when at least one
       hit was found by BOTH retrieval legs (`sources` carries `bm25`
       AND `semantic`) and either the keyword leg saw every word of the
       question on it (`bm25_all_terms`) or it ranks in the top five of
       both legs (`bm25_rank`, `sem_rank`; ruling `oracle-o7` R-O7-6),
       and RELEVANT when ≥ 1 snippet carries the
       query's FFG keywords (or, for a query with none, shares a
       non-stopword word with it). Strong + relevant → `search`.
       (This replaced a score threshold that could never fail — audit
       `oracle-audit-2026-09-22` F3.)
    5. **No fallback** — the cascade no longer re-asks the question in
       other words (ruling `oracle-o5-blend`; the blend recovers more
       than the fallback did). `search_expanded` stays a tool you can
       call yourself with your own reformulations.
    6. **Weak / partial / miss markers** (the hits returned are the one
       search's, in every case):
         - hits came back, it is not `search`, and no two-leg hit has
           every word (`bm25_all_terms`) → `tool_used='weak'`,
           `is_weak=True` (and `is_partial=True` when `topic_sources`
           exist). The hits are returned — as LOCATORS. A page in the
           top five of both legs with no relevant snippet is weak, never
           partial or miss (ruling `oracle-o7` R-O7-13).
         - no hits (or two-leg every-word hits with no relevant snippet)
           and `topic_sources` non-empty → `tool_used='partial'`.
         - otherwise → `tool_used='miss'`, `is_miss=True`.

    ## Args
        query: Natural-language rule question. The cascade handles
            tokenization and FTS5 quoting internally.
        limit: Max hits returned (after dedup). Default 5.
        alias: Aim EVERY leg (and the topic pointers) at one book, e.g.
            'eote', 'aor', 'fad'. Use it for the second, differently-aimed
            pass after a weak/miss result, and for one pass per book when
            a question names several (the core books are peers — R-EQW1).
            Omit to search the whole library.
        corpus: Which index to search when no `alias` is given: 'books' (default, the FFG
            rulebooks) or 'community' (the reSpecialized Folios and Design Docs, aliases
            `respec-folio-<slug>` / `respec-design-<slug>`). The two are never ranked together.
            An `alias` decides on its own: a community alias reads the community index.
        snippet_chars: Snippet window around the first query-term hit.
            Default 1200 (~a full rule paragraph — audit F6: 600-char
            windows forced a page read for nearly every answer).

    ## WHICH PAGE NUMBERS ARE THESE? (B-335 A1-4 — read this before citing)
    `page_start`/`page_end` are **CORPUS pages** — the PDF's own index — and every record
    says so in `pagination: "corpus"`. A book's PRINTED page (what a reader checks, what a
    citation names) differs by that book's front matter (EotE +9) — the record's own
    `printed_offset` is the authority, never a number written here.
    * Calibrated book → `printed_start` / `printed_end` / `printed_offset` are also present.
      **Cite the PRINTED number; navigate by the CORPUS one.**
    * Uncalibrated book → `printed_unavailable` ('uncalibrated' | 'unknown-book') and a
      `printed_note` saying why. No printed page is guessed, because a wrong one makes the
      citation confidently wrong. About a third of the 100 books are calibrated
      (`python -m swrpg_index.pdf_pages` prints the live count).
    Never do the arithmetic yourself — `swrpg_index/pdf_pages.py` is the only legal converter.

    ## Weak retrieval, aim and text quality (audit F3 · F4 · F6 · F9)
    * `is_weak` is ALWAYS present. `tool_used: "weak"` / `is_weak: true`
      means hits came back but no page both searches found carried every word of the question, and no page in the top five of both the word and the meaning search came with an on-subject passage (a single leg alone: keyword = a shared word;
      meaning = a neighbouring topic). It is the signature of a question the corpus does not
      answer — and ALSO of a real question phrased colloquially, so it
      is a warning, not a verdict. Treat those hits as locators: cite nothing from one until
      `read_pages` shows the sentence, and make a second, re-phrased or
      `alias`-aimed pass before concluding anything is absent.
    * `alias` echoes the book the call was aimed at (null when un-aimed);
      `snippet_chars` sets the width of every hit's `snippet`.
    * `text_quality` (`clean` | `glyph-loss` | `mojibake`) rides every
      hit and topic source and is a property of the BOOK, derived at
      runtime from the index's own text (`swrpg_index/text_quality.py`):
      `mojibake` = the text layer is unreadable (≥ half its pages are CJK
      garbage) — neither its positives nor its negatives count;
      `glyph-loss` = ≥ 20% of its pages are OCR-hostile — words survive,
      dice glyphs arrive as `@ ® º ≤` and numerals drop. `page_hostile`
      is the same judgement for THIS page (> 20 CJK glyphs, > 8%
      non-ASCII, ≥ 8 glyph-substitution runs, or < 200 characters). A
      hostile page is a LOCATOR: quote its words after `read_pages`;
      every NUMERAL on it is inferred until a human reads the printed
      page. `lost_glyphs` (int, or null when the index holds no chunk
      for the page) counts the glyph-substitution marks on THIS page:
      symbols the index could not read (ruling `oracle-o3-damage-truth`
      C-ODT-1). Below 8 the page is not hostile on that account; a number
      touching one of those marks is inferred.

    ## Return shape
        {
          "hits": [                              # search hits, deduped
            {alias, book, tier, page_start, page_end,
             pagination, printed_start?, printed_end?, printed_offset?,
             printed_unavailable?, printed_note?,
             chapter, section, content_type, score, score_kind, snippet,
             sources, text_quality, page_hostile, lost_glyphs, ...},
            ...                                  # up to `limit`
          ],
          "topic_sources": [                     # chapter-level pointers
            {alias, title, page_start, page_end, level, via, pagination,
             printed_start | printed_unavailable, text_quality,
             page_hostile, lost_glyphs},
            ...
          ],
          "topic_name": "encounter building" | null,
          "tool_used": "search" | "search_expanded" | "weak" | "partial"
                       | "miss",           # search_expanded: legal, not produced by the shipped cascade
          "is_miss":    bool,                    # nothing relevant anywhere
          "is_partial": bool,                    # chapter pointers, no strong passage
          "is_weak":    bool,                    # hits, but no page both searches found carried every word of the question, and no page in the top five of both the word and the meaning search came with an on-subject passage
          "alias":      str | null               # the book the call was aimed at
        }

    ## How a sub-agent should read the result

    * **tool_used = 'search'** — happy path. Cite from `hits` (the
      PRINTED page — see above).
    * **tool_used = 'search_expanded'** — a legal value the shipped
      cascade does not produce (its fallback is retired). If seen:
      recovered via vocabulary expansion with cross-variant agreement.
      Cite normally.
    * **tool_used = 'weak'** — no page both searches found carried every word of the question, and no page in the top five of both the word and the meaning search came with an on-subject passage.
      Locators, not support; emit
      `Retrieval status: weak — no page both searches found carried every word of the question, and no page in the top five of both the word and the meaning search came with an on-subject passage`.
    * **tool_used = 'partial'** — `topic_sources` has chapter pointers,
      but no individual passage matched. Cite the chapter and use
      `(source: unverified)` for specific mechanic claims.
    * **tool_used = 'miss'** — no usable retrieval. Answer with
      `(source: unverified)`. Do not invent page numbers.

    ## Implementation note

    This tool is server-side orchestration over `topic` and `search`.
    See `swrpg_index/cascade.py` for the implementation, and
    `swrpg_index/tests/cascade_weak.py` and
    `swrpg_index/tests/hybrid_blend.py` for its guards.
    """
    with _connection(alias, corpus) as conn:
        embedder = _State.embedder()
        return _cascade.retrieve_rule_for_query(
            conn, query, limit=limit, embedder=embedder,
            alias=alias, snippet_chars=snippet_chars,
        )


@mcp.tool()
def topic(name: str) -> dict:
    """Resolve a pre-indexed topic name to canonical rulebook pages —
    **try this BEFORE `search()` for known concepts**.

    ## When to use
    * The user's question maps cleanly to a rules concept: 'nemesis',
      'encounter building', 'crit table', 'lightsaber', 'xp spending',
      'morality', 'obligation', 'force rating', 'starship combat', etc.
    * You want the *authoritative* passage, not a best-effort search.
    * Call `topics()` first if you're not sure what's registered.

    ## When NOT to use
    * The query is paraphrased, abstract, or uses non-FFG vocabulary
      ("making a villain scarier", "boss fight", "balanced encounters")
      — go straight to `search(mode='hybrid')`.
    * You need content that's NOT a rule concept (adversary stat blocks,
      specific flavor text, random tables embedded mid-chapter) —
      `search` handles those better.
    * You already resolved this topic in the same turn — don't re-call.

    ## Example
        topic(name="encounter building")
        # → resolves to AoR pp.330-341 + FaD pp.333-340 + EotE pp.296-333
        topic(name="nemesis")
        # → resolves to 12: Adversaries in all three CRBs + GM Kit essay

    ## Args
        name: Topic name. Case-insensitive. Exact-match tried first, then
            substring. 71 topics are registered — call `topics()` if
            unsure. Common topic names: 'adversary design', 'attack
            sequence', 'combat', 'crit table', 'critical', 'cover',
            'crafting lightsaber', 'destiny', 'difficulty', 'duty',
            'encounter building', 'force', 'force powers', 'force rating',
            'gm guide nemesis', 'initiative', 'lightsaber', 'maneuvers',
            'minion', 'morality', 'motivation', 'nemesis', 'obligation',
            'range bands', 'rival', 'spending results', 'starship combat',
            'weapon mods', 'weapon qualities', 'wounds', 'xp spending'.

    ## WHICH PAGE NUMBERS ARE THESE? (B-335 A1-4 — read this before citing)
    `page_start`/`page_end` are **CORPUS pages** — the PDF's own index — and every record
    says so in `pagination: "corpus"`. A book's PRINTED page (what a reader checks, what a
    citation names) differs by that book's front matter (EotE +9) — the record's own
    `printed_offset` is the authority, never a number written here.
    * Calibrated book → `printed_start` / `printed_end` / `printed_offset` are also present.
      **Cite the PRINTED number; navigate by the CORPUS one.**
    * Uncalibrated book → `printed_unavailable` ('uncalibrated' | 'unknown-book') and a
      `printed_note` saying why. No printed page is guessed, because a wrong one makes the
      citation confidently wrong. About a third of the 100 books are calibrated
      (`python -m swrpg_index.pdf_pages` prints the live count).
    Never do the arithmetic yourself — `swrpg_index/pdf_pages.py` is the only legal converter.

    ## Return shape
    On match:
        {
          "topic": "encounter building",
          "sources": [
            {"alias": "aor", "title": "Creating Encounters, ...",
             "page_start": 330, "page_end": 341,
             "level": 2, "via": "toc"},
            ...
          ]
        }

    * `via='toc'` means the page range comes directly from the PDF's
      embedded Table of Contents — authoritative.
    * `via='fts-fallback'` means the alias has no embedded TOC (e.g.
      'holocron') and we resolved via BM25 search on the fragment;
      the returned page is the best-matching single page, not a
      section range. Trust less than TOC hits.

    On miss:
        {"topic": null, "sources": [], "error": "unknown topic: ..."}

    ## Failure signals — what to do next

    Unknown topic (error set):
        1. Call `topics()` to see the registered set.
        2. Try a related name — 'crit' vs 'critical' vs 'crit table'.
        3. Fall back to `search(mode='hybrid')` with a natural query.

    `via='fts-fallback'` with weak page range:
        The topic's fragment didn't match a TOC entry, so the page
        pointer is approximate. Before citing, call `read_pages` on the
        returned page ± 2 to verify the content is what you expected.
    """
    with _connection() as conn:
        return _api.topic(conn, name)


@mcp.tool()
def topics() -> list[dict]:
    """List every registered topic and the rulebook aliases each one
    points at — **call this when you don't know the right topic name**.

    ## When to use
    * You don't know whether a concept has a topic shortcut. Call this,
      scan the list, then call `topic(best_match)`.
    * Starting a new task and want to see what the library supports.
    * You suspect a topic should exist but got `error: unknown topic`
      from `topic()`.

    ## When NOT to use
    * Per-query lookup — this is a one-time orientation call. Don't
      retrieve it for every question.
    * As a substitute for `search()`. It only returns names + aliases,
      no content.

    ## Example
        topics()
        # → [{"name":"actions","aliases":["aor","eote","fad","holocron"],"count":4},
        #    {"name":"adversary design","aliases":["aor","eote","fad"],"count":3},
        #    ...71 entries total]

    ## Return shape
    List of {name, aliases, count}. Ordered alphabetically.
        * `name` is the key to pass into `topic()`.
        * `aliases` tells you which rulebooks have a registered pointer
          for this topic — gives you an advance hint of where the
          answer lives.
        * `count` = len(aliases).

    ## Failure signals
    Empty list means the database hasn't been seeded — should never
    happen in normal operation. If it does, the index needs rebuilding;
    that's a maintenance task, not an agent task.
    """
    with _connection() as conn:
        return _api.topics(conn)


@mcp.tool()
def toc(alias: str) -> dict:
    """Return the structured Table of Contents for a PDF — use to orient
    yourself in a book before drilling into `chapter` or `read_pages`.

    ## When to use
    * You know the alias but not which section covers a concept.
    * The user asked "what's in the EotE Game Master chapter?" — scan
      the TOC for subsections.
    * A `topic()` result was too broad and you want to narrow to a
      specific subsection.

    ## When NOT to use
    * You want the *content* of a section — call `chapter()` or
      `read_pages()` instead.
    * You want to find which PDF covers a concept — call `search()` or
      `topic()`; TOC lookup requires you already know the alias.
    * Image-only or flat PDFs (e.g. 'holocron', 'gadgets', 'ships')
      have no embedded TOC. The call returns an empty `entries` list —
      don't waste a turn asking again.

    ## Example
        toc(alias="eote")
        # → {"alias":"eote", "name":"EotE CRB", "page_count":457,
        #    "tier":"core", "entries":[{level:1, title:"1: Playing...",
        #    page_start:16, page_end:40}, ...]}

    ## Args
        alias: PDF alias from `list_pdfs()`.

    ## Return shape
        {alias, name, page_count, tier, book_line, entries}
    where `entries` is a flat list of {level, title, page_start,
    page_end, summary} ordered by page_start.
        * level 1 = chapter
        * level 2 = section
        * level 3+ = subsection
        * `page_end` is inclusive.
        * `summary` is usually null in phase 1 — reserved for future
          LLM-written chapter abstracts.

    ## Failure signals
    * `{"error": "unknown alias: ..."}` — typo or unindexed alias.
      Call `list_pdfs()` to see what's actually in the index.
    * Empty `entries` list — the PDF has no embedded bookmarks.
      Typical for compiled/OCR-only books. Use `search` with
      `alias=<name>` to scan contents instead.
    """
    with _connection(alias) as conn:
        return _api.toc(conn, alias)


@mcp.tool()
def list_pdfs() -> list[dict]:
    """Discover aliases — the full list of indexed PDFs with tier + page
    count + chunk count.

    ## When to use
    * First turn of a new task, to see what's in the library.
    * You got an `unknown alias` error and need to find the right name.
    * You want to filter manually to a specific tier / book_line before
      narrowing searches.

    ## When NOT to use
    * Per-query — this is orientation, not retrieval. Call it once
      at most per task.
    * To discover *topics* — use `topics()` instead. That returns the
      named concept shortcuts; this one returns the raw book inventory.

    ## Example
        list_pdfs()
        # → [{"alias":"eote","name":"EotE CRB","tier":"core",
        #     "book_line":"eote","page_count":457,"chunks":437,
        #     "has_text":true,"has_ocr":true}, ...75 entries]

    ## Return shape
    List of {alias, name, tier, book_line, page_count, chunks,
    has_text, has_ocr}. Ordered by tier then alias. These are the BOOKS index's rows.
    After them, ONE summary entry stands for the community documents (the reSpecialized
    Folios and Design Docs, a separate index):
    {alias: "respec-*", name, tier: "community", count, reach} — `reach` says how to
    address them (an alias `respec-folio-<slug>` / `respec-design-<slug>`, or
    `corpus="community"` on the search tools).

    * `tier`: 'beginner' | 'core' | 'advanced' | 'supplement'
    * `book_line`: 'eote' | 'aor' | 'fad' | 'holocron' | 'shared' |
      'beginner-game' | 'folio' | 'supplement' | 'atlas' | 'gm-kit-*'
    * `has_ocr=true` means the alias has an OCR cache; its OCR'd pages are
      searchable. For a `text_source: "ocr"` book (Docs/pdf_sources.json;
      ruling ocr-rotation-repair) the cache IS the text: every page comes
      from it and the PDF's own text layer is not read.

    ## Failure signals
    Empty list = DB not built. Agent cannot fix this; tell the user
    to run `python3 swrpg_index.py ingest`.
    """
    with _connection() as conn:
        books = _api.list_pdfs(conn)
    return books + _community_summary()


SNAPSHOT_MANIFEST = os.path.join(SCRIPT_DIR, 'Docs', 'respecialized_snapshot.json')


def _community_summary():
    """R-RDI-3-5: the community documents as EXACTLY ONE entry, never one row each (B-1356's fold).
    Empty when the registry names no community row. `count` is what the community index holds."""
    rows = [s for s in load_config().get('sources', []) if s.get('index') == 'community']
    if not rows:
        return []
    count = 0
    if os.path.exists(COMMUNITY_DB_PATH):
        conn = sqlite3.connect(pathlib.Path(COMMUNITY_DB_PATH).as_uri() + '?mode=ro', uri=True)
        try:
            count = conn.execute('SELECT COUNT(*) FROM pdfs').fetchone()[0]
        finally:
            conn.close()
    try:
        with open(SNAPSHOT_MANIFEST, encoding='utf-8') as fh:
            date = json.load(fh).get('fetched_at', '?')
    except (OSError, ValueError):
        date = '?'
    return [{
        'alias': 'respec-*',
        'name': f'reSpecialized Folios and Design Docs (community, snapshot {date})',
        'tier': 'community',
        'count': count,
        'reach': 'alias respec-folio-<slug> or respec-design-<slug>, or corpus="community"; '
                 'the slugs are in Docs/respecialized_snapshot.json',
    }]


@mcp.tool()
def read_pages(alias: str, pages: str) -> list[dict]:
    """Fetch cleaned full-page text when you already know alias + page —
    **use this instead of `search` when citing a known page**.

    ## When to use
    * `search` returned a hit with promising metadata but the snippet
      was too short to be authoritative — read the full page to verify
      before citing.
    * A `topic()` result gave you alias + page_range; read those pages
      to extract the exact rule text.
    * The user explicitly referenced a page ('EotE p.216', 'Game
      Master's Kit p.26').
    * You need multi-page context around a snippet hit.

    ## When NOT to use
    * You don't know the alias or pages — call `search()` or `topic()`
      first.
    * You want the whole chapter — use `chapter()`; it scopes to the
      TOC-defined section and is more natural than guessing page ranges.
    * Very large ranges (>20 pages) — prefer `chapter` (respects TOC
      boundaries) or narrow your query.

    ## Example
        read_pages(alias="eote-gm", pages="26-32")
        # → [{"page_start":26,"page_end":26,"text":"A GM'S GUIDE TO..."},
        #    {"page_start":27,"page_end":27,"text":"..."}, ...]

        read_pages(alias="fad", pages="180-181")
        # → lightsaber weapon profile + hilt customization pages

    ## Args
        alias: PDF alias.
        pages: 1-indexed page spec. Examples:
            "26"         — single page
            "26-32"      — inclusive range
            "1,5,10-12"  — mixed list + ranges

    ## WHICH PAGE NUMBERS ARE THESE? (B-335 A1-4 — read this before citing)
    `page_start`/`page_end` are **CORPUS pages** — the PDF's own index — and every record
    says so in `pagination: "corpus"`. A book's PRINTED page (what a reader checks, what a
    citation names) differs by that book's front matter (EotE +9) — the record's own
    `printed_offset` is the authority, never a number written here.
    * Calibrated book → `printed_start` / `printed_end` / `printed_offset` are also present.
      **Cite the PRINTED number; navigate by the CORPUS one.**
    * Uncalibrated book → `printed_unavailable` ('uncalibrated' | 'unknown-book') and a
      `printed_note` saying why. No printed page is guessed, because a wrong one makes the
      citation confidently wrong. About a third of the 100 books are calibrated
      (`python -m swrpg_index.pdf_pages` prints the live count).
    Never do the arithmetic yourself — `swrpg_index/pdf_pages.py` is the only legal converter.

    ## Return shape
    List of {page_start, page_end, text} where text is already
    OCR-cleaned (running headers stripped, hyphenated line-wraps
    de-hyphenated, page numbers removed). page_end may equal
    page_start (single-page chunk) or cover a small range if the
    ingest pipeline merged short pages forward.

    ## Failure signals
    * Empty list — alias exists but no chunks cover the requested
      pages. Usually means the pages are blank (cover, blank endpaper)
      or outside the PDF's page count. Call `list_pdfs` to verify the
      book's page_count.
    * If you were following a `search` hit and get empty here, the
      search's page_start/page_end is still correct — try the page
      number itself (sometimes the chunk covers 220-221 but you asked
      for 222).
    """
    from .utils import parse_page_range
    page_list = [p + 1 for p in parse_page_range(pages)]
    with _connection(alias) as conn:
        return _api.read_pages(conn, alias, page_list)


@mcp.tool()
def chapter(alias: str, section_name: str) -> dict:
    """Fetch a named section's full text — **use instead of `read_pages`
    when you want a logical section, not a page range**.

    ## When to use
    * You want the whole "12: Adversaries" chapter, not a specific page.
    * A `topic()` result gave you a section title and you want the full
      text rather than the page-range you'd pass to `read_pages`.
    * You know the section name but not its page numbers.

    ## When NOT to use
    * You know the exact pages — `read_pages(alias, pages)` is more
      direct and returns identical data without the TOC lookup.
    * The alias has no embedded TOC (holocron, gadgets, ships) — this
      call will return `{"error": "section matching ... not found"}`.
      Fall back to `search(alias=<name>, query=<section words>)`.
    * For a short concept — sections can span 40+ pages. If you only
      need the definition, use `search` with `limit=3` instead.

    ## Example
        chapter(alias="eote-gm", section_name="Nemesis")
        # → {"alias":"eote-gm", "title":"A GM's Guide to the Nemesis",
        #    "page_start":26, "page_end":32, "chunks":[{...},{...}]}

        chapter(alias="aor", section_name="Creating Encounters")
        # → full AoR GM chapter on encounter design, pp.330-341

    ## Args
        alias: PDF alias.
        section_name: TOC title substring, case-insensitive. Partial
            match: 'Nemesis' matches "A GM's Guide to the Nemesis";
            'Adversaries' matches '12: Adversaries'. If multiple TOC
            entries match, the shallowest (lowest level number) +
            earliest page wins.

    ## WHICH PAGE NUMBERS ARE THESE? (B-335 A1-4 — read this before citing)
    `page_start`/`page_end` are **CORPUS pages** — the PDF's own index — and every record
    says so in `pagination: "corpus"`. A book's PRINTED page (what a reader checks, what a
    citation names) differs by that book's front matter (EotE +9) — the record's own
    `printed_offset` is the authority, never a number written here.
    * Calibrated book → `printed_start` / `printed_end` / `printed_offset` are also present.
      **Cite the PRINTED number; navigate by the CORPUS one.**
    * Uncalibrated book → `printed_unavailable` ('uncalibrated' | 'unknown-book') and a
      `printed_note` saying why. No printed page is guessed, because a wrong one makes the
      citation confidently wrong. About a third of the 100 books are calibrated
      (`python -m swrpg_index.pdf_pages` prints the live count).
    Never do the arithmetic yourself — `swrpg_index/pdf_pages.py` is the only legal converter.

    ## Return shape
    On match:
        {alias, title, page_start, page_end,
         chunks: [{page_start, page_end, text}, ...]}
    where chunks cover the section inclusively.

    On miss:
        {"error": "section matching '<name>' not found in <alias>"}

    ## Failure signals
    * error set — fragment didn't match any TOC entry. Try a shorter
      fragment (just 'Combat' instead of 'Conflict and Combat'), or
      call `toc(alias)` to see what's available.
    * title doesn't match the user's intent — PyMuPDF TOC extraction
      is greedy; '1: Playing' might match '1: Playing the Game' (what
      you wanted) OR '1: Playing the Game Online Tutorial' (not what
      you wanted). Inspect the returned `title` before citing.
    * Chapter is huge (>20 pages) — consider a `search` within the
      chapter's page range instead of dumping all of it.
    """
    with _connection(alias) as conn:
        return _api.chapter(conn, alias, section_name)


# ── Entry point ────────────────────────────────────────────────────────────

def run(transport='stdio', host='127.0.0.1', port=8765):
    """Start the MCP server. Blocks until the client disconnects.

    transport='stdio'  — read MCP frames from stdin/stdout (default; spawned-child use).
    transport='http'   — bind streamable-http on host:port for long-lived service use.
    """
    if transport == 'http':
        # Preload embedder so the first semantic/hybrid query doesn't pay the
        # ~3s cold-start tax. Acceptable for long-lived service mode where
        # startup latency is invisible (login / crash-recovery); skipped for
        # stdio mode so BM25-only sessions stay fast.
        print('[swrpg-mcp] preloading embedder…', file=sys.stderr)
        _State.embedder()
        print('[swrpg-mcp] embedder ready', file=sys.stderr)

        # FastMCP host/port live on the settings object, not run().
        mcp.settings.host = host
        mcp.settings.port = port
        print(f'[swrpg-mcp] streamable-http on http://{host}:{port}/mcp', file=sys.stderr)
        mcp.run(transport='streamable-http')
    else:
        mcp.run(transport='stdio')


if __name__ == '__main__':
    run()
