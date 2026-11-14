"""swrpg_index CLI — canonical command surface.

Commands (new + backward compatible with pdf_ref.py):
    ingest [--alias <a>] [--rebuild]
    list
    search <query> [--alias <a>] [--tier T] [--content-type T] [--limit N]
                    [--snippet-chars N] [--json]
    topic <name> [--json]
    topics [--json]
    toc <alias> [--json]
    chapter <alias> <section-name>
    read <alias> --pages N-M
    render <alias> --pages N-M [--outdir DIR]
    ocr <alias> [--pages N-M] [--force] [--dpi 300]
    quick <query> [--limit N] [--tier T]       (soft-fallback to full-library)
    gen-toc                                    (writes md + json)
    sync-registry [--db P] [--dry-run]         (pdfs.name + pdfs.tier from the registry; no re-ingest)

Design choices:
* FTS5 ranking uses bm25() with light column weighting: section > chapter > text.
* Search result format defaults to human-readable with citation headers; --json
  emits one object per match for agent/tooling consumption.
* Tier filter is a real SQL clause, not a prompt rule.
"""
import argparse
import json
import os
import re
import shlex
import sqlite3
import sys
import time

sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

from .utils import (
    COMMUNITY_DB_PATH, DB_PATH, OCR_CACHE_DIR, TOC_JSON_PATH, TOC_MD_PATH, db_path_for_alias,
    aliases_for_tier, classify_book_line, classify_tier,
    book_folios, clean_page_text, fail, load_config, parse_page_range, resolve_path, resolve_pdf,
)
from .topics import TOPIC_INDEX
from .ingest import run_ingest, load_ocr_pages
from . import embed as _embed_mod
from . import api as _api
# Re-export a few helpers so external callers (like swrpg_index.tests.queries)
# can continue to import from swrpg_index.cli. api.py is the canonical home.
_fts_phrase      = _api.fts_phrase
_bm25_search     = _api.bm25_search
_semantic_search = lambda conn, q, af, limit: _api.semantic_search(conn, q, af, limit)
_rrf_fuse        = _api.rrf_fuse
_detect_drift    = _api.detect_drift
DRIFT_SIMILARITY_THRESHOLD = _api.DRIFT_SIMILARITY_THRESHOLD


# ── DB connection ───────────────────────────────────────────────────────────

def _connect(db_path=None, alias=None):
    # An alias reads its own index (R-RDI-3-3, utils.db_path_for_alias); otherwise the books'.
    db_path = db_path or (db_path_for_alias(alias) if alias else DB_PATH)
    if not os.path.exists(db_path):
        fail(f'Database not found at {db_path}. Run: python3 swrpg_index.py ingest')
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def _db_or_none(db_path=DB_PATH):
    if not os.path.exists(db_path):
        return None
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


# ── CLI helpers ─────────────────────────────────────────────────────────────
# Most retrieval logic lives in api.py; these are thin wrappers + argparse glue.


def _alias_filter_from_args(args):
    """Argparse-facing wrapper around api.resolve_alias_filter."""
    return _api.resolve_alias_filter(alias=getattr(args, 'alias', None),
                                     tier=getattr(args, 'tier', None))


def _render_snippet(text, query_tokens, target_chars=600):
    return _api.render_snippet(text, query_tokens, target_chars=target_chars)


def _rrf_fuse(bm25_rows, semantic_rows, k=60, limit=10):
    """Reciprocal Rank Fusion on chunk_id keys. Returns list of
    {chunk_id: (chunk_row_or_passage_row, rrf_score, sources)}."""
    scores = {}
    meta = {}
    # BM25 leg: rank is position in list (0-based).
    for rank, row in enumerate(bm25_rows):
        cid = row['id']
        scores[cid] = scores.get(cid, 0.0) + 1.0 / (k + rank + 1)
        meta.setdefault(cid, {'sources': set(), 'row': row, 'passage_snippet': None})
        meta[cid]['sources'].add('bm25')
        meta[cid]['bm25_rank'] = rank + 1
    # Semantic leg: rank is position, row is passage-level dict.
    for rank, p in enumerate(semantic_rows):
        cid = p['chunk_id']
        scores[cid] = scores.get(cid, 0.0) + 1.0 / (k + rank + 1)
        entry = meta.setdefault(cid, {'sources': set(), 'row': None, 'passage_snippet': None})
        entry['sources'].add('semantic')
        entry['sem_rank'] = rank + 1
        entry['sem_similarity'] = p['similarity']
        # Prefer the passage text as the snippet surface for semantic hits.
        if entry['passage_snippet'] is None:
            entry['passage_snippet'] = p['text']
        # If BM25 didn't give us a full chunk row, fill with passage metadata.
        if entry['row'] is None:
            entry['row'] = {
                'id':         cid,
                'alias':      p['alias'],
                'page_start': p['page_start'],
                'page_end':   p['page_end'],
                'chapter':    p['chapter'],
                'section':    p['section'],
                'content_type': p['content_type'],
                'text':       p['text'],
                'book_name':  None,
                'tier':       None,
            }
    # Rank by fused score descending
    ranked = sorted(scores.items(), key=lambda kv: -kv[1])[:limit]
    return [(cid, scores[cid], meta[cid]) for cid, _ in ranked]


def cmd_search(args):
    conn = _connect(alias=args.alias)
    if not args.query.strip():
        fail('Empty query.')

    results = _api.search(
        conn, args.query, mode=args.mode,
        alias=args.alias, tier=args.tier, content_type=args.content_type,
        limit=args.limit, snippet_chars=args.snippet_chars, rrf_k=args.rrf_k,
        boost_tables=args.boost_tables,
    )

    # Drift detection (opt-in via --flag-drift) — runs on semantic_rows
    # before RRF. For CLI convenience we re-run the semantic leg here to
    # grab the raw passage similarities that api.search doesn't expose.
    if args.flag_drift and args.mode in ('semantic', 'hybrid'):
        sem_rows = _api.semantic_search(
            conn, args.query,
            alias_filter=_api.resolve_alias_filter(alias=args.alias, tier=args.tier),
            limit=max(args.limit * 4, 20),
        )
        drifts = _api.detect_drift(sem_rows, similarity_threshold=args.drift_threshold)
        if drifts:
            print(f'# DRIFT WARNINGS ({len(drifts)}):', file=sys.stderr)
            for d in drifts[:5]:
                print(f'  {d["alias"]:<16} p.{d["page_start"]:<4} cos={d["similarity"]:.3f}  {d["reason"]}',
                      file=sys.stderr)

    conn.close()

    if args.json:
        print(json.dumps({'query': args.query, 'mode': args.mode, 'matches': results, 'count': len(results)},
                         ensure_ascii=False, indent=2))
        return

    if not results:
        print(f'No matches for "{args.query}" (mode={args.mode}).')
        if args.tier:
            tier_set = aliases_for_tier(args.tier)
            print(f'  (tier filter: {args.tier} → {len(tier_set or [])} aliases)')
        print('Try: remove --tier/--alias, switch --mode, or run `ingest` / `embed` first.')
        return

    print(f'# Search (mode={args.mode}): "{args.query}" — {len(results)} match(es)\n')
    for m in results:
        pages = f'p.{m["page_start"]}' if m['page_start'] == m['page_end'] else f'pp.{m["page_start"]}-{m["page_end"]}'
        score_tag = f'[{m["score_kind"]} {m["score"]:.3f}]'
        if m.get('bm25_rank') or m.get('sem_rank'):
            ranks = []
            if m.get('bm25_rank'): ranks.append(f'bm25#{m["bm25_rank"]}')
            if m.get('sem_rank'):  ranks.append(f'sem#{m["sem_rank"]}')
            score_tag = f'[{m["score_kind"]} {m["score"]:.4f}  {" ".join(ranks)}]'
        hdr = f'{score_tag} {m["alias"]} {pages}'
        if m['chapter']:
            hdr += f' · {m["chapter"]}'
        if m['section'] and m['section'] != m['chapter']:
            hdr += f' › {m["section"]}'
        hdr += f'   ({m["content_type"]})'
        print(hdr)
        print('  ' + m['snippet'].replace('\n', '\n  '))
        print()


# ── search-expanded (RRF across query variants) ───────────────────────────

def cmd_search_expanded(args):
    conn = _connect(alias=args.alias)
    queries = args.queries or []
    if not queries:
        fail('At least one query string required.')
    results = _api.search_expanded(
        conn, queries, mode=args.mode,
        alias=args.alias, tier=args.tier, content_type=args.content_type,
        limit=args.limit, per_query_pool=args.per_query_pool,
        snippet_chars=args.snippet_chars, boost_tables=args.boost_tables,
    )
    conn.close()

    if args.json:
        print(json.dumps({
            'queries': queries, 'mode': args.mode,
            'matches': results, 'count': len(results),
        }, ensure_ascii=False, indent=2))
        return

    if not results:
        print(f'No matches across {len(queries)} variant(s).')
        return
    print(f'# search_expanded — {len(queries)} variant(s), {len(results)} fused match(es)\n')
    for m in results:
        pages = f'p.{m["page_start"]}' if m['page_start'] == m['page_end'] else f'pp.{m["page_start"]}-{m["page_end"]}'
        vote = f'{m["variants_matched"]}/{len(queries)}'
        hdr = f'[rrf {m["score"]:.4f}  variants={vote}] {m["alias"]} {pages}'
        if m['chapter']:
            hdr += f' · {m["chapter"]}'
        if m['section'] and m['section'] != m['chapter']:
            hdr += f' › {m["section"]}'
        hdr += f'   ({m["content_type"]})'
        print(hdr)
        print('  ' + m['snippet'].replace('\n', '\n  '))
        print()


# ── quick (soft-fallback) ──────────────────────────────────────────────────

_QUICK_PRIORITY = ['holocron', 'eote', 'aor', 'fad', 'talent-index', 'adversary-cards', 'ships', 'gadgets']


def cmd_quick(args):
    conn = _connect()
    q = _fts_phrase(args.query)
    if not q:
        fail('Empty query.')

    tier_set = aliases_for_tier(args.tier) if args.tier else None

    def _search(alias_filter):
        where = ['chunks_fts MATCH ?']
        params = [q]
        if alias_filter:
            ph = ','.join('?' * len(alias_filter))
            where.append(f'c.alias IN ({ph})')
            params.extend(alias_filter)
        sql = f'''
            SELECT c.alias, c.page_start, c.page_end, c.chapter, c.section,
                   c.content_type, c.text,
                   bm25(chunks_fts, 1.0, 1.2, 1.5) AS rank,
                   p.name AS book_name
            FROM chunks_fts
            JOIN chunks c ON c.id = chunks_fts.rowid
            JOIN pdfs p   ON p.alias = c.alias
            WHERE {' AND '.join(where)}
            ORDER BY rank ASC
            LIMIT ?
        '''
        params.append(args.limit)
        return conn.execute(sql, params).fetchall()

    # 1) Priority sources (intersected with tier filter if present)
    priority = _QUICK_PRIORITY
    if tier_set is not None:
        priority = [a for a in priority if a in tier_set]
    rows = _search(priority) if priority else []

    # 2) Soft fallback: if priority returned nothing, widen to tier or full library
    widened = False
    if not rows:
        widened = True
        wider = sorted(tier_set) if tier_set is not None else None
        rows = _search(wider)

    conn.close()

    query_tokens = [t for t in re.split(r'\s+', args.query.strip()) if t]
    if not rows:
        print(f'No matches for "{args.query}" anywhere in the library.')
        return

    scope = 'full library' if widened and tier_set is None else (f'tier={args.tier}' if widened else 'priority sources')
    print(f'# Quick search: "{args.query}" — {len(rows)} match(es) in {scope}\n')
    for r in rows:
        pages = f'p.{r["page_start"]}' if r["page_start"] == r["page_end"] else f'pp.{r["page_start"]}-{r["page_end"]}'
        hdr = f'[bm25 {r["rank"]:.2f}] {r["alias"]} {pages}'
        if r['chapter']:
            hdr += f' · {r["chapter"]}'
        if r['section'] and r['section'] != r['chapter']:
            hdr += f' › {r["section"]}'
        print(hdr)
        print('  ' + _render_snippet(r['text'], query_tokens, 500).replace('\n', '\n  '))
        print()


# ── topic ──────────────────────────────────────────────────────────────────

def cmd_topic(args):
    conn = _connect()
    name_lc = args.name.lower().strip()

    # Exact, then substring fallback
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
        known = [r['name'] for r in conn.execute('SELECT DISTINCT name FROM topics ORDER BY name').fetchall()]
        conn.close()
        print(f'Unknown topic: "{args.name}"')
        print(f'Known topics: {", ".join(known)}')
        return

    matched_name = rows[0]['name']

    # Resolve each (alias, fragment) to a page range via the toc table.
    # If the alias has no embedded TOC (e.g., holocron), fall back to a
    # BM25-ranked FTS search of the fragment restricted to the alias —
    # returning the top-ranked page instead of a section title.
    resolved = []
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
            resolved.append({
                'alias': alias,
                'fragment': frag,
                'title': t['title'],
                'page_start': t['page_start'],
                'page_end':   t['page_end'],
                'level':      t['level'],
            })
            continue

        # FTS fallback — find the best-matching page in this alias.
        q = _fts_phrase(frag)
        hit = conn.execute(
            '''SELECT c.page_start, c.page_end, c.chapter, c.section,
                      bm25(chunks_fts, 1.0, 1.2, 1.5) AS rank
               FROM chunks_fts
               JOIN chunks c ON c.id = chunks_fts.rowid
               WHERE chunks_fts MATCH ? AND c.alias = ?
               ORDER BY rank ASC LIMIT 1''',
            (q, alias),
        ).fetchone()
        if hit is not None:
            resolved.append({
                'alias': alias,
                'fragment': frag,
                'title': hit['section'] or hit['chapter'] or '(FTS hit — no TOC)',
                'page_start': hit['page_start'],
                'page_end':   hit['page_end'],
                'level': None,
                'via': 'fts-fallback',
            })
        else:
            resolved.append({'alias': alias, 'fragment': frag, 'status': 'no hit'})

    conn.close()

    if args.json:
        print(json.dumps({'topic': matched_name, 'sources': resolved}, ensure_ascii=False, indent=2))
        return

    print(f'# Topic: {matched_name.upper()}')
    print(f'  ({len(resolved)} source(s))\n')
    for r in resolved:
        if 'status' in r:
            print(f'  {r["alias"]:<20} section "{r["fragment"]}" — {r["status"]}')
            continue
        pages = f'p.{r["page_start"]}' if r['page_start'] == r['page_end'] else f'pp.{r["page_start"]}-{r["page_end"]}'
        print(f'  {r["alias"]:<20} {r["title"]:<40} {pages}')
        print(f'    read:    python3 swrpg_index.py read {r["alias"]} --pages {r["page_start"]}-{r["page_end"]}')
    print()


def cmd_topics(args):
    conn = _db_or_none()
    if conn:
        rows = conn.execute(
            '''SELECT name, GROUP_CONCAT(alias, ', ') AS aliases, COUNT(*) AS n
               FROM topics GROUP BY name ORDER BY name'''
        ).fetchall()
        conn.close()
        items = [{'name': r['name'], 'aliases': r['aliases'].split(', '), 'count': r['n']} for r in rows]
    else:
        items = [{'name': k, 'aliases': [a for a, _, _ in v], 'count': len(v)} for k, v in sorted(TOPIC_INDEX.items())]

    if args.json:
        print(json.dumps({'topics': items, 'count': len(items)}, ensure_ascii=False, indent=2))
        return
    print(f'# Topics ({len(items)})\n')
    for t in items:
        print(f'  {t["name"]:<24}  ({", ".join(t["aliases"])})')


# ── toc ────────────────────────────────────────────────────────────────────

def cmd_toc(args):
    conn = _connect(alias=args.alias)
    pdf = conn.execute('SELECT * FROM pdfs WHERE alias = ?', (args.alias,)).fetchone()
    if not pdf:
        conn.close()
        fail(f'Unknown alias: {args.alias}')
    rows = conn.execute(
        '''SELECT level, title, page_start, page_end, summary
           FROM toc WHERE alias = ? ORDER BY page_start ASC, level ASC''',
        (args.alias,),
    ).fetchall()
    conn.close()

    if args.json:
        print(json.dumps({
            'alias': pdf['alias'],
            'name': pdf['name'],
            'page_count': pdf['page_count'],
            'tier': pdf['tier'],
            'book_line': pdf['book_line'],
            'entries': [dict(r) for r in rows],
        }, ensure_ascii=False, indent=2))
        return

    print(f'# {pdf["name"]} ({pdf["alias"]}) — {pdf["page_count"]} pages  [{pdf["tier"]}]\n')
    if not rows:
        print('(no embedded TOC)')
        return
    for r in rows:
        indent = '  ' * (r['level'] - 1)
        pages = f'p{r["page_start"]}'
        if r['page_end'] and r['page_end'] != r['page_start']:
            pages = f'pp{r["page_start"]}-{r["page_end"]}'
        summary = f'  — {r["summary"]}' if r['summary'] else ''
        print(f'{indent}- {pages}: {r["title"]}{summary}')


# ── list ───────────────────────────────────────────────────────────────────

def cmd_list(args):
    conn = _db_or_none()
    if conn is None:
        # Fallback to config only
        cfg = load_config()
        print(f'{"ALIAS":<20} {"TIER":<10} {"PAGES":>5}  NAME   [DB not built yet]')
        for src in cfg.get('sources', []):
            tier = classify_tier(src['alias'])
            print(f'{src["alias"]:<20} {tier:<10}     ?  {src["name"]}')
        return

    rows = conn.execute(
        '''SELECT alias, name, tier, book_line, page_count, has_text, has_ocr
           FROM pdfs ORDER BY tier, alias'''
    ).fetchall()
    # Chunk counts per alias
    counts = dict(conn.execute(
        'SELECT alias, COUNT(*) FROM chunks GROUP BY alias'
    ).fetchall())
    conn.close()

    if args.json:
        items = []
        for r in rows:
            d = dict(r)
            d['chunks'] = counts.get(r['alias'], 0)
            items.append(d)
        print(json.dumps(items, ensure_ascii=False, indent=2))
        return

    print(f'{"ALIAS":<22} {"TIER":<10} {"LINE":<12} {"PAGES":>5} {"CHUNKS":>6} {"OCR":>4}  NAME')
    print('─' * 100)
    for r in rows:
        print(f'{r["alias"]:<22} {r["tier"] or "?":<10} {r["book_line"] or "?":<12} '
              f'{r["page_count"]:>5} {counts.get(r["alias"],0):>6} {"Y" if r["has_ocr"] else "":>4}  {r["name"]}')
    # The community index is its own file (R-RDI-3-2), listed after the books, never mixed into them.
    if os.path.exists(COMMUNITY_DB_PATH):
        cconn = _connect(COMMUNITY_DB_PATH)
        crow = cconn.execute('SELECT alias, name, page_count FROM pdfs ORDER BY alias').fetchall()
        ccounts = dict(cconn.execute('SELECT alias, COUNT(*) FROM chunks GROUP BY alias').fetchall())
        cconn.close()
        print(f'\n── community index ({os.path.relpath(COMMUNITY_DB_PATH)}): {len(crow)} document(s)')
        for r in crow:
            print(f'{r["alias"]:<34} {r["page_count"]:>5} {ccounts.get(r["alias"], 0):>6}  {r["name"]}')


# ── chapter / read / render (delegate to PyMuPDF, not the DB) ──────────────

def cmd_chapter(args):
    """Find a TOC section by fragment and dump its pages from the PDF."""
    conn = _connect(alias=args.alias)
    section = ' '.join(args.section)
    row = conn.execute(
        '''SELECT title, page_start, page_end, level
           FROM toc
           WHERE alias = ? AND LOWER(title) LIKE ?
           ORDER BY level ASC, page_start ASC
           LIMIT 1''',
        (args.alias, f'%{section.lower()}%'),
    ).fetchone()
    pdf = conn.execute('SELECT name FROM pdfs WHERE alias = ?', (args.alias,)).fetchone()
    conn.close()
    if not row:
        print(f'Section matching "{section}" not found in {args.alias}.')
        return
    print(f'# {pdf["name"]} — {row["title"]} (pp. {row["page_start"]}-{row["page_end"]})\n')
    _dump_pages(args.alias, row['page_start'], row['page_end'])


def cmd_read(args):
    pages = parse_page_range(args.pages)  # 0-indexed
    if not pages:
        fail('Empty page range.')
    _dump_pages(args.alias, pages[0] + 1, pages[-1] + 1, page_list_override=[p + 1 for p in pages])


def _page_folios(src, cfg, fitz):
    """The page printer's folio sets — the SAME as the ingest's (ruling `b861-folio-strip` C-B861-3): a
    calibrated book's come from the registry via the one converter; an uncalibrated book's are detected over
    the raw text the ingest reads (`ingest.source_raw_pages`). A file outside the registry, or a source the
    ingest would refuse, has no folio context and strips no lone number."""
    if src is None:
        return lambda p: frozenset()
    from . import pdf_pages
    from .ingest import IngestRefused, source_raw_pages
    if pdf_pages.status(src['alias']) == pdf_pages.CALIBRATED:
        return book_folios(src['alias'], [])[0]   # the registry decides; detection is not needed to strip
    try:
        raws = source_raw_pages(src, cfg, fitz)
    except IngestRefused as e:
        print(f'[read] {src["alias"]}: no folio context ({e}); no lone number is stripped', file=sys.stderr)
        return lambda p: frozenset()
    return book_folios(src['alias'], raws)[0]


def _dump_pages(alias, start_1i, end_1i, page_list_override=None):
    import fitz
    cfg = load_config()
    path, src = resolve_pdf(cfg, alias)
    if not os.path.exists(path):
        fail(f'File not found: {path}')
    doc = fitz.open(path)
    name = src['name'] if src else os.path.basename(path)
    pages = page_list_override if page_list_override else list(range(start_1i, end_1i + 1))
    ocr_pages = load_ocr_pages(alias)
    folios_for = _page_folios(src, cfg, fitz)
    print(f'# {name}  [alias={alias}]\n')
    for p in pages:
        if p < 1 or p > doc.page_count:
            continue
        native = doc[p - 1].get_text()
        ocr = ocr_pages.get(str(p), '') if ocr_pages else ''
        text = clean_page_text((native or '') + (('\n\n[OCR]\n' + ocr) if ocr and native else ('' if not ocr else ocr)),
                               folios=folios_for(p))
        print(f'--- Page {p} ---')
        print(text if text else '(no text)')
        print()
    doc.close()


def cmd_render(args):
    import fitz
    cfg = load_config()
    path, src = resolve_pdf(cfg, args.alias)
    outdir = args.outdir or os.path.join(os.path.dirname(DB_PATH), '..', 'temporary screenshots')
    outdir = os.path.abspath(outdir)
    os.makedirs(outdir, exist_ok=True)

    doc = fitz.open(path)
    pages = parse_page_range(args.pages)
    for p in pages:
        if p < 0 or p >= doc.page_count:
            continue
        pix = doc[p].get_pixmap(dpi=150)
        fname = f'{args.alias}-p{p+1}.png'
        out = os.path.join(outdir, fname)
        pix.save(out)
        print(f'Saved: {out}')
    doc.close()


# ── ocr ────────────────────────────────────────────────────────────────────

def _vision_binary():
    """Compile swrpg_index/vision_ocr.swift on demand into the gitignored OCR cache directory
    (ruling `ocr-rotation-repair` C-ORR-1). Rebuilds when the source is newer than the binary."""
    import subprocess
    from .utils import OCR_CACHE_DIR
    src = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'vision_ocr.swift')
    out_dir = os.path.join(OCR_CACHE_DIR, '.bin')
    binary = os.path.join(out_dir, 'vision_ocr')
    if os.path.exists(binary) and os.path.getmtime(binary) >= os.path.getmtime(src):
        return binary
    os.makedirs(out_dir, exist_ok=True)
    r = subprocess.run(['swiftc', '-O', src, '-o', binary], capture_output=True, text=True)
    if r.returncode != 0:
        fail(f'could not compile {src} with swiftc (exit {r.returncode}):\n{r.stderr.strip()[:800]}\n'
             f'Pass --engine tesseract for the fallback.')
    return binary


def _vision_version():
    import platform
    import subprocess
    build = subprocess.run(['sw_vers', '-buildVersion'], capture_output=True, text=True).stdout.strip()
    return f'macOS {platform.mac_ver()[0]} ({build}) Vision VNRecognizeTextRequest accurate en-US'


def cmd_ocr(args):
    """OCR a book's pages into Docs/ocr_cache/<alias>.ocr.json, then (unless --no-reindex) re-ingest it.

    Engines (ruling `ocr-rotation-repair` R-ORR-2): `vision`, the macOS Vision framework through
    swrpg_index/vision_ocr.swift, is the default on darwin; `tesseract` is the named fallback and the
    default elsewhere. The page is rendered with PyMuPDF `get_pixmap`, which applies the page's
    /Rotate, so an upside-down scan is read upright. The cache header records `engine` and its
    version. One cache holds ONE engine: adding pages with a different engine than the cache already
    holds is refused unless --force rewrites the whole file (a `text_source: "ocr"` book refuses a
    mixed cache at ingest)."""
    import subprocess
    from .utils import OCR_CACHE_DIR
    os.makedirs(OCR_CACHE_DIR, exist_ok=True)
    engine = args.engine or ('vision' if sys.platform == 'darwin' else 'tesseract')
    if engine == 'vision' and args.psm is not None:
        fail('--psm is a tesseract option; it has no meaning under --engine vision')
    try:
        import fitz
    except ImportError as e:
        fail(f'Missing dependency: {e}. Run: pip install pymupdf')

    if engine == 'tesseract':
        try:
            import pytesseract
        except ImportError as e:
            fail(f'Missing dependency: {e}. Run: pip install pytesseract')
        # Platform-specific Tesseract binary; falls back to PATH if none match.
        for candidate in (
            r'C:\Program Files\Tesseract-OCR\tesseract.exe',
            '/opt/homebrew/bin/tesseract',
            '/usr/local/bin/tesseract',
        ):
            if os.path.exists(candidate):
                pytesseract.pytesseract.tesseract_cmd = candidate
                break
        engine_version = 'tesseract ' + str(pytesseract.get_tesseract_version())
        psm_cfg = f'--psm {args.psm if args.psm is not None else 3}'
    else:
        if sys.platform != 'darwin':
            fail('--engine vision needs macOS (the Vision framework); pass --engine tesseract')
        vision_bin = _vision_binary()
        engine_version = _vision_version()

    cfg = load_config()
    path, src = resolve_pdf(cfg, args.alias)
    doc = fitz.open(path)
    total_pages = doc.page_count

    if args.pages:
        page_list = [p + 1 for p in parse_page_range(args.pages) if 0 <= p < total_pages]
    else:
        page_list = list(range(1, total_pages + 1))

    # Load current cache
    cache_path = os.path.join(OCR_CACHE_DIR, f'{args.alias}.ocr.json')
    header = {}
    if os.path.exists(cache_path):
        with open(cache_path, 'r', encoding='utf-8') as f:
            header = json.load(f)
        cached = header.get('pages', {}) or {}
    else:
        cached = {}

    prior = header.get('engine', 'tesseract') if cached else engine   # legacy caches were all tesseract
    if prior != engine:
        # One cache holds ONE engine. Switching engines is a whole-book rewrite: --force, no --pages.
        if not args.force or args.pages:
            fail(f'{cache_path} holds {prior} pages; adding {engine} pages would mix engines in one cache. '
                 f'Re-run the whole book with --force (and no --pages) to rewrite it with {engine}.')
        cached = {}
    if not args.force:
        before = len(page_list)
        page_list = [p for p in page_list if str(p) not in cached]
        if before - len(page_list):
            print(f'[ocr] skipping {before - len(page_list)} cached page(s); pass --force to re-run')
    if not page_list:
        print('[ocr] nothing to do')
        doc.close()
        return

    def save():
        with open(cache_path, 'w', encoding='utf-8') as f:
            json.dump({'alias': args.alias, 'dpi': args.dpi, 'engine': engine,
                       'engine_version': engine_version, 'pages': cached},
                      f, ensure_ascii=False, indent=2)

    mat = fitz.Matrix(args.dpi / 72, args.dpi / 72)
    tmp = os.environ.get('TEMP', '/tmp')
    CHECKPOINT = 5
    t0 = time.time()
    print(f'[ocr] {args.alias}: {len(page_list)} page(s) at {args.dpi} DPI, engine={engine_version}'
          + (f', {psm_cfg}' if engine == 'tesseract' else ''))
    for i, p in enumerate(page_list):
        pix = doc[p - 1].get_pixmap(matrix=mat)
        png_path = os.path.join(tmp, f'_ocr_{args.alias}_p{p}.png')
        pix.save(png_path)
        try:
            if engine == 'tesseract':
                text = pytesseract.image_to_string(png_path, config=psm_cfg)
            else:
                r = subprocess.run([vision_bin, png_path], capture_output=True, text=True, check=True)
                text = json.loads(r.stdout)['text']
        except Exception as e:
            print(f'[ocr] page {p} FAILED: {e}', file=sys.stderr)
            text = ''
        cached[str(p)] = text
        if (i + 1) % CHECKPOINT == 0 or i == len(page_list) - 1:
            save()
            print(f'  [{i+1}/{len(page_list)}] page {p} → {len(text)} chars  [checkpointed]')
        try:
            os.remove(png_path)
        except OSError:
            pass
    doc.close()
    print(f'[ocr] wrote {cache_path} ({len(cached)} page(s) cached, engine {engine}) in {time.time() - t0:.0f}s')

    # Auto-reindex the alias so new OCR text is searchable immediately.
    if not args.no_reindex:
        print('[ocr] reindexing alias...')
        run_ingest(alias=args.alias, verbose=False)
        print(f'[ok]  {args.alias} reindexed')


# ── ingest ─────────────────────────────────────────────────────────────────

def cmd_ingest(args):
    # The run's own target (R-RDI-3-2): a community alias's is the community index, so --rebuild never
    # deletes the books index for it, and the books' TOC json is not re-emitted from it.
    target = db_path_for_alias(args.alias) if args.alias else DB_PATH
    if args.rebuild and os.path.exists(target):
        os.remove(target)
        print(f'[ingest] removed existing database ({target})')
    from .ingest import IngestRefused, OverlayError
    try:
        total, touched = run_ingest(alias=args.alias, verbose=True,
                                     auto_embed=not args.no_embed)
    except OverlayError as exc:
        fail(f'ingest finished the PDFs but the verified overlay did NOT lay cleanly: {exc}')
    except IngestRefused as exc:
        fail(f'ingest REFUSED — nothing was written for the refused alias: {exc}')
    # Also dump structured TOC as JSON (phase 1: mirrors the md output). The books' only.
    if target == DB_PATH:
        _emit_toc_json()


def cmd_ingest_tables(args):
    """(Re)lay the verified rules-tables overlay only — no PDF re-ingest (T1a). Runs the same sequence as a
    full ingest (R-VTD-4): lay at converter-derived coordinates, replay the corrections ledger, embed the
    overlay. A refused book or a failed replay exits non-zero."""
    from .ingest import lay_overlay, open_db, OverlayError
    db_path = args.db or DB_PATH
    conn = open_db(db_path)
    try:
        n = lay_overlay(conn, db_path=db_path, corrections_path=args.corrections,
                        embed=not args.no_embed, verbose=True)
    except OverlayError as exc:
        conn.close()
        fail(f'verified rules-tables overlay NOT laid cleanly: {exc}')
    conn.close()
    print(f'[ok] verified rules-tables overlay re-laid: {n} chunk(s)')


# ── sync-registry (C-OHY-3) ──────────────────────────────────────────────────
# `pdfs.name` and `pdfs.tier` are written only at ingest (ingest.py's `INSERT OR REPLACE INTO pdfs`), and every
# result carries the index's values — so a registry rename or a classify_tier change reaches no reader until the
# book is re-ingested. This writes those two columns from the same two expressions ingest uses
# (`src.get('name', alias)`, `classify_tier(alias)`), so a rebuild and this sync reach the same rows, WITHOUT a
# re-ingest. It is an UPDATE of two columns, never a REPLACE (a REPLACE deletes the row, and the row's children
# cascade). No content table may move: the digest below is taken before and after inside one transaction, and
# any difference rolls the whole sync back (ruling oracle-o3-hygiene).

SYNC_CONTENT_TABLES = (
    ('chunks', 'SELECT id, alias, page_start, page_end, chapter, section, content_type, char_count, text '
               'FROM chunks ORDER BY id'),
    ('passages', 'SELECT id, chunk_id, alias, page_start, page_end, chapter, section, content_type, seq, '
                 'char_count, text, embedding, embedding_model FROM passages ORDER BY id'),
    ('chunks_fts', 'SELECT rowid, text, chapter, section, alias, page_start, page_end, content_type '
                   'FROM chunks_fts ORDER BY rowid'),
    ('embeddings_meta', 'SELECT alias, model, dim, embedded_at, passage_count FROM embeddings_meta ORDER BY alias'),
    ('toc', 'SELECT id, alias, level, title, page_start, page_end, summary FROM toc ORDER BY id'),
)


def content_digest(conn):
    """{table: (rows, sha256)} over every content table the sync must not touch."""
    import hashlib
    out = {}
    for table, sql in SYNC_CONTENT_TABLES:
        h, n = hashlib.sha256(), 0
        for row in conn.execute(sql):
            n += 1
            for v in row:
                b = v if isinstance(v, bytes) else repr(v).encode('utf-8')
                h.update(b'%d:' % len(b))
                h.update(b)
        out[table] = (n, h.hexdigest())
    return out


def registry_expectation(cfg=None):
    """{alias: (name, tier)} exactly as ingest would write the `pdfs` row."""
    cfg = cfg or load_config()
    return {s['alias']: (s.get('name', s['alias']), classify_tier(s['alias'])) for s in cfg.get('sources', [])}


def sync_registry(db_path, dry_run=False, verbose=True):
    """Bring `pdfs.name` and `pdfs.tier` into agreement with the registry. Returns the list of changes
    [(alias, (old_name, old_tier), (new_name, new_tier))]; raises RuntimeError (rolled back) if content moved."""
    want = registry_expectation()
    conn = sqlite3.connect(db_path, isolation_level=None)
    try:
        have = {a: (n, t) for a, n, t in conn.execute('SELECT alias, name, tier FROM pdfs')}
        changes = [(a, have[a], want[a]) for a in sorted(have) if a in want and have[a] != want[a]]
        if verbose:
            for a in sorted(set(have) - set(want)):
                print(f'[sync] {a}: indexed but not in the registry — left as it is')
            for a in sorted(set(want) - set(have)):
                print(f'[sync] {a}: in the registry but not indexed — nothing to sync')
            for a, (on, ot), (nn, nt) in changes:
                parts = []
                if on != nn:
                    parts.append(f'name {on!r} -> {nn!r}')
                if ot != nt:
                    parts.append(f'tier {ot} -> {nt}')
                print(f'[sync] {a}: ' + '; '.join(parts))
        if dry_run or not changes:
            return changes
        conn.execute('BEGIN IMMEDIATE')
        before = content_digest(conn)
        for a, _, (name, tier) in changes:
            conn.execute('UPDATE pdfs SET name = ?, tier = ? WHERE alias = ?', (name, tier, a))
        after = content_digest(conn)
        if after != before:
            conn.execute('ROLLBACK')
            moved = [t for t in before if before[t] != after[t]]
            raise RuntimeError(f'content moved in {moved} — sync rolled back, nothing written')
        conn.execute('COMMIT')
        if verbose:
            for t, (n, h) in after.items():
                print(f'[sync] unchanged {t}: {n} rows, sha256 {h[:12]}')
        return changes
    finally:
        conn.close()


def cmd_sync_registry(args):
    db_path = args.db or DB_PATH
    if not os.path.exists(db_path):
        fail(f'Database not found at {db_path}.')
    try:
        changes = sync_registry(db_path, dry_run=args.dry_run)
    except RuntimeError as exc:
        fail(f'sync-registry REFUSED: {exc}')
    verb = 'would update' if args.dry_run else 'updated'
    print(f'[ok] sync-registry {verb} {len(changes)} pdfs row(s)')


# ── embed ──────────────────────────────────────────────────────────────────

def cmd_embed(args):
    """Compute embeddings for passages that don't have one yet."""
    conn = _connect(alias=args.alias)
    # Show what's pending
    where = 'WHERE embedding IS NULL'
    params = []
    if args.alias:
        where += ' AND alias = ?'
        params.append(args.alias)
    if args.force:
        # Treat --force as "re-embed everything" by first clearing embeddings.
        clear_where = 'WHERE 1=1'
        clear_params = []
        if args.alias:
            clear_where = 'WHERE alias = ?'
            clear_params = [args.alias]
        conn.execute(f'UPDATE passages SET embedding = NULL, embedding_model = NULL {clear_where}',
                     clear_params)
        conn.commit()
        print(f'[embed] cleared existing embeddings{" for " + args.alias if args.alias else ""}')

    pending = conn.execute(f'SELECT COUNT(*) FROM passages {where}', params).fetchone()[0]
    total   = conn.execute('SELECT COUNT(*) FROM passages' + (' WHERE alias = ?' if args.alias else ''),
                           [args.alias] if args.alias else []).fetchone()[0]
    if pending == 0:
        print(f'[embed] nothing to do — {total} passage(s), all embedded')
        conn.close()
        return

    print(f'[embed] {pending}/{total} passage(s) to embed'
          + (f' (alias={args.alias})' if args.alias else ''))

    # Load the model lazily so --help stays fast.
    written, _ = _embed_mod.embed_unembedded(conn, alias=args.alias, verbose=True)
    conn.close()
    print(f'[embed] wrote {written} embeddings to {DB_PATH}')


# ── gen-toc (both md + json) ───────────────────────────────────────────────

def cmd_gen_toc(args):
    _emit_toc_md()
    _emit_toc_json()


def _emit_toc_md():
    conn = _connect()
    pdfs = conn.execute('SELECT * FROM pdfs ORDER BY alias').fetchall()
    lines = ['# PDF Reference — Table of Contents Index\n',
             f'Generated by `python3 swrpg_index.py gen-toc`. {len(pdfs)} registered PDFs.\n']
    for p in pdfs:
        lines.append(f'\n## {p["name"]} ({p["alias"]}) — {p["page_count"]} pages  [{p["tier"]}]')
        lines.append(f'`python3 swrpg_index.py read {p["alias"]} --pages <N>`\n')
        rows = conn.execute(
            'SELECT level, title, page_start FROM toc WHERE alias = ? ORDER BY page_start, level',
            (p['alias'],),
        ).fetchall()
        if not rows:
            lines.append('(no embedded TOC)')
            continue
        for r in rows:
            indent = '  ' * (r['level'] - 1)
            lines.append(f'{indent}- p{r["page_start"]}: {r["title"]}')
    conn.close()
    with open(TOC_MD_PATH, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')
    print(f'[gen-toc] wrote {TOC_MD_PATH}')


def _emit_toc_json():
    conn = _connect()
    pdfs = conn.execute('SELECT alias, name, tier, book_line, page_count FROM pdfs ORDER BY alias').fetchall()
    payload = {'pdfs': []}
    for p in pdfs:
        rows = conn.execute(
            'SELECT level, title, page_start, page_end, summary FROM toc WHERE alias = ? ORDER BY page_start, level',
            (p['alias'],),
        ).fetchall()
        payload['pdfs'].append({
            'alias': p['alias'],
            'name':  p['name'],
            'tier':  p['tier'],
            'book_line': p['book_line'],
            'page_count': p['page_count'],
            'entries': [dict(r) for r in rows],
        })
    conn.close()
    with open(TOC_JSON_PATH, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f'[gen-toc] wrote {TOC_JSON_PATH} ({len(payload["pdfs"])} PDFs)')


# ── Argparse wiring ─────────────────────────────────────────────────────────

def build_parser():
    p = argparse.ArgumentParser(
        prog='swrpg_index',
        description='SQLite FTS5-backed retrieval for Star Wars FFG rulebooks.',
    )
    sub = p.add_subparsers(dest='command')

    s = sub.add_parser('ingest', help='Rebuild the FTS5 index from PDFs + OCR cache')
    s.add_argument('--alias', default=None, help='Only re-ingest this alias (default: full library)')
    s.add_argument('--rebuild', action='store_true', help='Delete the database first')
    s.add_argument('--no-embed', action='store_true',
                   help='Skip the auto-embed step. Use when running `embed` separately. '
                        'Semantic retrieval will be blind to re-ingested aliases until '
                        'embeddings are computed.')

    s = sub.add_parser('ingest-tables',
                       help='(Re)lay the verified rules-tables overlay (Docs/rules_tables/) — no PDF re-ingest')
    s.add_argument('--db', default=None, help='index to write (default: the live index); a temp copy for a bite')
    s.add_argument('--corrections', default=None, help='corrections ledger (default: data-sources/corrections)')
    s.add_argument('--no-embed', action='store_true', help='skip embedding the overlay (the guard will report it)')

    s = sub.add_parser('sync-registry',
                       help='Write pdfs.name and pdfs.tier from the registry and classify_tier — no re-ingest; '
                            'refuses if any content table would move (C-OHY-3)')
    s.add_argument('--db', default=None, help='index to write (default: the live index)')
    s.add_argument('--dry-run', action='store_true', help='print the changes, write nothing')

    s = sub.add_parser('list', help='List indexed PDFs')
    s.add_argument('--json', action='store_true')

    s = sub.add_parser('search', help='Full-text / semantic / hybrid search')
    s.add_argument('query')
    s.add_argument('--alias', default=None, help='Restrict to one PDF')
    s.add_argument('--tier', default=None, choices=['beginner', 'mid', 'late'], help='Filter by agent tier')
    s.add_argument('--content-type', default=None, help='rule|table|sidebar|adversary|...')
    s.add_argument('--limit', type=int, default=5)
    s.add_argument('--snippet-chars', type=int, default=600)
    s.add_argument('--mode', default='hybrid', choices=['bm25', 'semantic', 'hybrid'],
                   help='Retrieval mode (default hybrid = BM25 + cosine, blended by score)')
    s.add_argument('--rrf-k', type=int, default=60, help="Reciprocal Rank Fusion constant (default 60); applies only under the 'rrf' fusion (api.HYBRID_FUSION)")
    s.add_argument('--flag-drift', action='store_true',
                   help='Warn to stderr if semantic hits land on thin sections (Tables/Introduction/Overview)')
    s.add_argument('--drift-threshold', type=float, default=DRIFT_SIMILARITY_THRESHOLD,
                   help=f'Cosine threshold for drift warnings (default {DRIFT_SIMILARITY_THRESHOLD})')
    s.add_argument('--boost-tables', action='store_true',
                   help='Apply 1.5x score multiplier to content_type="table" chunks. Use for '
                        'queries about numeric profiles (weapon stats, crit tables) where dense '
                        'prose reprints otherwise outrank the authoritative table.')
    s.add_argument('--json', action='store_true')

    s = sub.add_parser('embed', help='Compute sentence-transformers embeddings for passages')
    s.add_argument('--alias', default=None, help='Restrict to one PDF')
    s.add_argument('--force', action='store_true', help='Re-embed even passages that already have one')

    s = sub.add_parser('search-expanded',
                       help='Fuse 2-5 query variants via Reciprocal Rank Fusion. '
                            'Use when a single search returns weak or wrong hits and '
                            'the concept might match under different vocabulary.')
    s.add_argument('queries', nargs='+', help='2-5 reformulations of the same question')
    s.add_argument('--mode', default='hybrid', choices=['bm25', 'semantic', 'hybrid'])
    s.add_argument('--alias', default=None)
    s.add_argument('--tier', default=None, choices=['beginner', 'mid', 'late'])
    s.add_argument('--content-type', default=None)
    s.add_argument('--limit', type=int, default=5)
    s.add_argument('--per-query-pool', type=int, default=10,
                   help='How deep each variant\'s result list goes before fusion (default 10)')
    s.add_argument('--snippet-chars', type=int, default=600)
    s.add_argument('--boost-tables', action='store_true')
    s.add_argument('--json', action='store_true')

    s = sub.add_parser('quick', help='Priority search with soft fallback to full library')
    s.add_argument('query')
    s.add_argument('--limit', type=int, default=5)
    s.add_argument('--tier', default=None, choices=['beginner', 'mid', 'late'])

    s = sub.add_parser('topic', help='Look up a pre-indexed topic')
    s.add_argument('name', nargs='+')
    s.add_argument('--json', action='store_true')

    s = sub.add_parser('topics', help='List all registered topics')
    s.add_argument('--json', action='store_true')

    s = sub.add_parser('toc', help='Show a PDF\'s TOC from the database')
    s.add_argument('alias')
    s.add_argument('--json', action='store_true')

    s = sub.add_parser('chapter', help='Find a section by name and dump its pages')
    s.add_argument('alias')
    s.add_argument('section', nargs='+')

    s = sub.add_parser('read', help='Dump PDF pages')
    s.add_argument('alias')
    s.add_argument('--pages', required=True)

    s = sub.add_parser('render', help='Render PDF pages as PNG')
    s.add_argument('alias')
    s.add_argument('--pages', required=True)
    s.add_argument('--outdir', default=None)

    s = sub.add_parser('ocr', help='Run OCR on image-only pages and cache them')
    s.add_argument('alias')
    s.add_argument('--pages', default=None)
    s.add_argument('--force', action='store_true')
    s.add_argument('--dpi', type=int, default=300)
    s.add_argument('--engine', choices=['vision', 'tesseract'], default=None,
                   help='OCR engine (default: vision on macOS, tesseract elsewhere; ruling ocr-rotation-repair)')
    s.add_argument('--psm', type=int, default=None,
                   help='Tesseract page segmentation mode. 3=auto (default), '
                        '4=single column, 6=uniform block, 11=sparse text. '
                        'Tables with narrow numeric columns often need 4 or 6.')
    s.add_argument('--no-reindex', action='store_true', help='Skip auto-reindex after OCR')

    sub.add_parser('gen-toc', help='Regenerate Docs/pdf_toc_index.md + .json')

    return p


def _topic_name(args):
    args.name = ' '.join(args.name).lower().strip()
    return args


def main(argv=None):
    parser = build_parser()
    args = parser.parse_args(argv)
    if not args.command:
        parser.print_help()
        sys.exit(0)

    dispatch = {
        'ingest':  cmd_ingest,
        'ingest-tables': cmd_ingest_tables,
        'sync-registry': cmd_sync_registry,
        'embed':   cmd_embed,
        'list':    cmd_list,
        'search':  cmd_search,
        'search-expanded': cmd_search_expanded,
        'quick':   cmd_quick,
        'topic':   lambda a: cmd_topic(_topic_name(a)),
        'topics':  cmd_topics,
        'toc':     cmd_toc,
        'chapter': cmd_chapter,
        'read':    cmd_read,
        'render':  cmd_render,
        'ocr':     cmd_ocr,
        'gen-toc': cmd_gen_toc,
    }
    dispatch[args.command](args)


if __name__ == '__main__':
    main()
