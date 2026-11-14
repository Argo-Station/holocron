"""Ingest pipeline: reads every registered PDF + its OCR cache, cleans the
text, chunks per-page, and writes to the SQLite FTS5 database.

Design notes:
* One chunk per page for phase 1 (matches how pdf_ref.py already thinks about
  results). Short pages (< 300 chars cleaned) merge forward so trivia-only
  pages don't pollute search rank. Phase 2 will sub-chunk into ~500-800
  token passages for embedding retrieval.
* Chapter/section are stamped from the embedded TOC (PyMuPDF bookmarks). If
  a PDF has no bookmarks, we fall back to heading detection (same heuristic
  the legacy `gen-toc` used).
* Content-type heuristic is intentionally shallow in phase 1 — everything is
  'rule' unless we spot table-like grids, sidebar borders, or the word
  'adversary' on the page. Upgrade later if it matters.
"""
import collections
import datetime
import glob
import json
import os
import re
import sqlite3
import sys
import time

from .utils import (
    COMMUNITY_DB_PATH, CONFIG_PATH, DB_PATH, OCR_CACHE_DIR, SCRIPT_DIR,
    book_folios, db_path_for_alias, index_of, clean_page_text, classify_book_line, classify_tier, describe_folios,
    load_config, resolve_path,
)
from . import dice_marks
from . import glyph_decode
from .topics import seed_topics_table
from .passages import split_chunk


SHORT_PAGE_THRESHOLD = 300   # chars; pages shorter than this merge into the next
SCHEMA_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'schema.sql')


# ── Imports that may fail gracefully ───────────────────────────────────────

def _lazy_fitz():
    try:
        import fitz  # PyMuPDF
        return fitz
    except ImportError:
        print('ERROR: PyMuPDF (fitz) is not installed. Run: pip install pymupdf', file=sys.stderr)
        sys.exit(1)


# ── OCR cache ──────────────────────────────────────────────────────────────

def load_ocr_pages(alias):
    """Return {page_1indexed_str: text} or {} if no cache."""
    p = os.path.join(OCR_CACHE_DIR, f'{alias}.ocr.json')
    if not os.path.exists(p):
        return {}
    try:
        with open(p, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return data.get('pages', {}) if isinstance(data, dict) else {}
    except Exception as e:
        print(f'[ingest] warn: failed to read OCR cache {p}: {e}', file=sys.stderr)
        return {}


# ── text_source (ruling `ocr-rotation-repair` R-ORR-3) ───────────────────────
# `Docs/pdf_sources.json` may declare `"text_source": "ocr"` for a book whose embedded text layer is
# garbage (the rotated-scan class: gadgets, ships, allies). For such a book the ingest reads EVERY page
# from the OCR cache and never reads the native layer: no union, no [OCR] marker, no fallback. Absent
# (or "native") means today's path, unchanged. The cache must cover every page with ONE engine, the
# ruled one; anything less refuses the book BEFORE its rows are touched.
TEXT_SOURCES = ('native', 'ocr')
OCR_RULED_ENGINE = 'vision'


class IngestRefused(Exception):
    """An alias (or the overlay) could not be ingested exactly as ruled; nothing was written for it."""


def load_ocr_cache(alias):
    """The whole cache file (header + pages), or None when there is none."""
    p = os.path.join(OCR_CACHE_DIR, f'{alias}.ocr.json')
    if not os.path.exists(p):
        return None
    with open(p, 'r', encoding='utf-8') as f:
        return json.load(f)


def ocr_source_pages(alias, total_pages):
    """For a `text_source: "ocr"` book: {page_1indexed_str: text} covering 1..total_pages from ONE
    cache written by the ruled engine, or IngestRefused naming what is wrong."""
    cache = load_ocr_cache(alias)
    if cache is None:
        raise IngestRefused(f'{alias}: text_source "ocr" but no OCR cache at '
                            f'{os.path.join(OCR_CACHE_DIR, alias + ".ocr.json")}; run '
                            f'`ocr {alias} --force` first')
    engine = cache.get('engine', 'tesseract')   # a cache without a header predates engines: tesseract
    if engine != OCR_RULED_ENGINE:
        raise IngestRefused(f'{alias}: text_source "ocr" needs a cache written by {OCR_RULED_ENGINE}; '
                            f'this one is {engine} (ruling ocr-rotation-repair R-ORR-2)')
    pages = cache.get('pages') or {}
    missing = [p for p in range(1, total_pages + 1) if str(p) not in pages]
    if missing:
        shown = ', '.join(map(str, missing[:20])) + (' …' if len(missing) > 20 else '')
        raise IngestRefused(f'{alias}: text_source "ocr" but the cache lacks {len(missing)} of '
                            f'{total_pages} page(s): {shown}')
    return pages


def decode_cid_shift(text, shift):
    """Undo a uniform CID-offset text layer.

    Some PDFs — The Complete Species Guide v6 is the one that forced this — embed fonts whose
    character codes are the real codepoints minus a constant, so PyMuPDF faithfully extracts
    ":KDW\x03LV" where the page reads "What is". Ingesting that fills the index with gibberish that
    matches nothing, which is worse than not ingesting the book at all: a search returns silence and
    the reader concludes the content is absent.

    A DECODE, NOT AN OCR PASS. OCR would work but costs a full re-render of 358 pages and loses
    fidelity the text layer already has perfectly; the shift is uniform and lossless in the other
    direction, so a decode recovers the book exactly.

    THE ONE AMBIGUITY, stated because it is real and not fixable here: shifted printables land in
    0x03..0x61, and that range CONTAINS newline (0x0A). A real line break and a shifted apostrophe
    (0x27 - 0x1D = 0x0A) are therefore indistinguishable in the extracted stream. Newlines are
    PRESERVED, because a book with its line structure intact and an occasional apostrophe rendered
    as a break is searchable, while the reverse is not. In a species guide, a name like "Er'Kit"
    can split across two lines as a result — retrieval still finds both halves, but a verbatim
    quote of such a name should be checked against the page.

    Configured per source via `text_shift` in Docs/pdf_sources.json; absent means no shift, so no
    other book is touched.
    """
    if not shift:
        return text
    lo, hi = 0x20 - shift, 0x7E - shift
    out = []
    for ch in text:
        if ch in '\n\r':
            out.append('\n')
            continue
        o = ord(ch)
        out.append(chr(o + shift) if lo <= o <= hi else ch)
    return ''.join(out)


# C-ODL-1 (ruling `oracle-o3-decode-leftovers`): the junk CHARACTER class of `text_quality._JUNK_RE`, which is where the
# old OCR typed a die. Kept here as characters because the strip removes characters; the guard
# swrpg_index/tests/decode_leftovers.py holds the two in agreement.
OCR_JUNK_CHARS = '@®º°≤≥§¶¤¥¢£€'
_OCR_JUNK_TABLE = {ord(c): None for c in OCR_JUNK_CHARS}


def strip_ocr_junk(ocr):
    """C-ODL-1: a decoded page's `[OCR]` half keeps its words and loses its junk. Every OCR_JUNK_CHARS character is
    removed and nothing else changes: the dice those characters stood for are already tokens in the decoded native
    half, and no token is ever placed here (R-DRD-3's second placement door stays shut)."""
    return ocr.translate(_OCR_JUNK_TABLE) if ocr else ocr


def merge_native_and_ocr(native, ocr):
    """Same policy pdf_ref.py used: prefer native when present, union OCR
    behind a marker when both exist so FTS can hit either token stream."""
    native = native or ''
    ocr = ocr or ''
    if not ocr:
        return native
    if not native.strip():
        return ocr
    return native + '\n\n[OCR]\n' + ocr


# ── TOC handling ───────────────────────────────────────────────────────────

def extract_toc(doc):
    """Return list of (level, title, page_1indexed). Empty list if no bookmarks."""
    try:
        toc = doc.get_toc()
    except Exception:
        return []
    return toc or []


def infer_toc_page_ends(toc_entries, total_pages):
    """Given [(level, title, page_start), ...], append page_end to each.
    End = the page before the next entry at same-or-higher level, capped at
    total_pages. Matches pdf_ref.toc_section_pages logic."""
    out = []
    for i, (level, title, start) in enumerate(toc_entries):
        end = total_pages
        for j in range(i + 1, len(toc_entries)):
            lvl2, _, start2 = toc_entries[j]
            if lvl2 <= level:
                end = max(start, start2 - 1)
                break
        out.append((level, title, start, end))
    return out


def toc_lookup_for_page(toc_ranges, page_1indexed):
    """Return (chapter, section) for the page.

    Chapter  = level-1 entry whose start is the greatest ≤ page (i.e., the
               most-recently-opened level-1 heading). Handles books where
               multiple top-level entries overlap (PyMuPDF sometimes emits
               parallel "Tables" + numbered-chapter level-1 entries).
    Section  = deepest-level entry enclosing the page. Tie-break by latest
               page_start so the innermost subsection wins.
    """
    chapter = None
    chapter_start = -1
    section = None
    section_level = -1
    section_start = -1
    for level, title, start, end in toc_ranges:
        if not (start <= page_1indexed <= end):
            continue
        if level == 1 and start > chapter_start:
            chapter = title
            chapter_start = start
        # Deeper level wins; at same level, the later start wins.
        if (level > section_level) or (level == section_level and start > section_start):
            section = title
            section_level = level
            section_start = start
    return chapter, section


# ── Content-type heuristic ─────────────────────────────────────────────────
_ADVERSARY_WORDS = re.compile(r'\b(nemesis|rival|minion|stormtrooper|bounty hunter|adversaries?)\b', re.I)
_SIDEBAR_HINT    = re.compile(r'\bSIDEBAR\b|\bOPTIONAL RULE\b', re.I)
_TABLE_HINT      = re.compile(r'\bTABLE\s+\d', re.I)


def classify_content_type(text, page_1indexed, page_count):
    if not text:
        return 'cover' if page_1indexed <= 2 else 'rule'
    if page_1indexed <= 2 and len(text) < 300:
        return 'cover'
    if page_1indexed == 1 or (page_count > 50 and page_1indexed <= 12 and 'table of contents' in text.lower()):
        return 'toc'
    if _TABLE_HINT.search(text):
        return 'table'
    if _SIDEBAR_HINT.search(text):
        return 'sidebar'
    if _ADVERSARY_WORDS.search(text) and len(text) < 1200:
        return 'adversary'
    return 'rule'


# ── Database setup ─────────────────────────────────────────────────────────

def open_db(path=DB_PATH):
    first_time = not os.path.exists(path)
    conn = sqlite3.connect(path)
    conn.execute('PRAGMA foreign_keys = ON')
    conn.execute('PRAGMA journal_mode = WAL')
    if first_time:
        with open(SCHEMA_PATH, 'r', encoding='utf-8') as f:
            conn.executescript(f.read())
    else:
        # Safe to run — all statements are IF NOT EXISTS.
        with open(SCHEMA_PATH, 'r', encoding='utf-8') as f:
            conn.executescript(f.read())
    return conn


def prepare_text(src, doc):
    """Validate a source's per-file text properties and load what its pages are read from. Raises
    IngestRefused (the caller closes `doc`) — `ingest_pdf` calls this BEFORE deleting any row. Returns the
    keyword arguments of `book_raw_pages`. Read-only: nothing is written."""
    alias = src['alias']
    text_source = src.get('text_source', 'native')
    if text_source not in TEXT_SOURCES:
        raise IngestRefused(f'{alias}: text_source must be one of {TEXT_SOURCES}, got {text_source!r}')
    # R-GCR-2 (ruling glyph-class-recon): a dice-font book's symbols decoded from its own font and colour.
    text_decode = src.get('text_decode')
    if text_decode is not None and text_decode not in glyph_decode.TEXT_DECODES:
        raise IngestRefused(f'{alias}: text_decode must be absent or one of {glyph_decode.TEXT_DECODES}, '
                            f'got {text_decode!r}')
    # C-DRD-1 (ruling dice-render-decode): a scanned book's dice from the census's stamped marks cache, verified
    # BEFORE any row is deleted -- a missing, unstamped or stale cache refuses and the alias's rows are untouched.
    dice_pages, dice_stats = None, collections.Counter()
    if text_decode == 'dice-marks':
        try:
            dice_pages, dice_report = dice_marks.load_for_ingest(alias)
        except dice_marks.MarksRefused as e:
            raise IngestRefused(str(e))
        dice_stats['excluded'] = dice_report['excluded']
    if text_source == 'ocr':
        ocr_pages = ocr_source_pages(alias, doc.page_count)   # validated BEFORE any row is deleted
    else:
        ocr_pages = load_ocr_pages(alias)
    has_text = bool(src.get('has_text', True))
    text_shift = int(src.get('text_shift') or 0)   # see decode_cid_shift; 0 = the normal case
    return {'text_source': text_source, 'has_text': has_text, 'text_decode': text_decode,
            'dice_pages': dice_pages, 'dice_stats': dice_stats, 'text_shift': text_shift, 'ocr_pages': ocr_pages}


def source_raw_pages(src, cfg, fitz):
    """Read-only: every page's raw text for one registry source, exactly as `ingest_pdf` builds it. For the
    cli page printer's folio set (C-B861-3) and the b861 census. Raises IngestRefused as the ingest would."""
    doc = fitz.open(resolve_path(cfg, src['path']))
    try:
        return book_raw_pages(doc, **prepare_text(src, doc))
    finally:
        doc.close()


def book_raw_pages(doc, text_source, has_text, text_decode, dice_pages, dice_stats, text_shift, ocr_pages):
    """Every page's RAW text, index 0 = corpus page 1 — exactly what `clean_page_text` receives. Shared by
    `ingest_pdf` and the b861 census (Docs/audit_artifacts/b861_folio_strip/), so both read the same text."""
    raws = []
    for i in range(doc.page_count):
        page_1i = i + 1
        if text_source == 'ocr':
            raw = ocr_pages[str(page_1i)]   # R-ORR-3: the cache IS the text; the native layer is not read
        else:
            if not has_text:
                native = ''
            elif text_decode == 'dice-marks':
                native, st = dice_marks.decode_page(doc[i], dice_pages.get(str(page_1i), []))   # C-DRD-2
                dice_stats.update(st)
            elif text_decode:
                native = glyph_decode.decode_page(doc[i])[0]   # C-GCR-1: before clean_page_text
            else:
                native = doc[i].get_text()
            if text_shift:
                native = decode_cid_shift(native, text_shift)
            ocr = ocr_pages.get(str(page_1i), '') if ocr_pages else ''
            if text_decode and native.strip():
                ocr = strip_ocr_junk(ocr)   # C-ODL-1: a decoded book's [OCR] half (the union writes one only
                                            # behind a native half; an empty native page IS its OCR)
            raw = merge_native_and_ocr(native, ocr)
        raws.append(raw)
    return raws


# ── Per-PDF ingest ─────────────────────────────────────────────────────────

def ingest_pdf(conn, src, cfg, fitz, verbose=True):
    alias = src['alias']
    path = resolve_path(cfg, src['path'])
    if not os.path.exists(path):
        if verbose:
            print(f'[skip] {alias}: file not found at {path}', file=sys.stderr)
        return 0

    try:
        doc = fitz.open(path)
    except Exception as e:
        if verbose:
            print(f'[skip] {alias}: failed to open — {e}', file=sys.stderr)
        return 0

    total_pages = doc.page_count
    try:
        prep = prepare_text(src, doc)   # every refusal fires here, BEFORE any row is deleted
    except IngestRefused:
        doc.close()
        raise
    ocr_pages, dice_pages, dice_stats, has_text = (prep['ocr_pages'], prep['dice_pages'], prep['dice_stats'],
                                                   prep['has_text'])

    # TOC
    toc_entries = extract_toc(doc)
    toc_ranges = infer_toc_page_ends(toc_entries, total_pages)

    # Wipe existing rows for this alias (full re-ingest).
    # Order matters: children first to satisfy FK cascade when the pdfs row exists.
    conn.execute('DELETE FROM chunks_fts WHERE alias = ?', (alias,))
    conn.execute('DELETE FROM passages   WHERE alias = ?', (alias,))
    conn.execute('DELETE FROM chunks     WHERE alias = ?', (alias,))
    conn.execute('DELETE FROM toc        WHERE alias = ?', (alias,))
    conn.execute('DELETE FROM embeddings_meta WHERE alias = ?', (alias,))

    # Upsert pdfs row FIRST so child-row FKs (toc, chunks) resolve.
    conn.execute(
        '''INSERT OR REPLACE INTO pdfs
           (alias, name, path, book_line, tier, page_count, has_text, has_ocr, ingested_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)''',
        (
            alias, src.get('name', alias), path,
            classify_book_line(alias), classify_tier(alias),
            total_pages, 1 if has_text else 0, 1 if ocr_pages else 0,
            datetime.datetime.now().isoformat(timespec='seconds'),
        ),
    )

    # Insert TOC rows
    for level, title, page_start, page_end in toc_ranges:
        conn.execute(
            'INSERT INTO toc (alias, level, title, page_start, page_end) VALUES (?, ?, ?, ?, ?)',
            (alias, level, title, page_start, page_end),
        )

    # Raw per-page text first (every page), so the book's FOLIO SET can be derived once from the same text the
    # cleaner receives (ruling `b861-folio-strip` C-B861-2); then clean, merging short pages forward.
    raws = book_raw_pages(doc, **prep)
    folios_for, folio_info = book_folios(alias, raws)
    if verbose:
        print('  ' + describe_folios(alias, folio_info))

    page_texts = []  # list of (page_start_1indexed, page_end_1indexed, cleaned_text)
    buffer_text = ''
    buffer_start = None
    for i, raw in enumerate(raws):
        page_1i = i + 1
        cleaned = clean_page_text(raw, folios=folios_for(page_1i))

        if buffer_start is None:
            buffer_start = page_1i
            buffer_text = cleaned
        else:
            buffer_text = (buffer_text + '\n\n' + cleaned).strip() if cleaned else buffer_text

        if len(buffer_text) >= SHORT_PAGE_THRESHOLD or i == total_pages - 1:
            page_texts.append((buffer_start, page_1i, buffer_text))
            buffer_start = None
            buffer_text = ''

    doc.close()
    if dice_pages is not None and verbose:
        print(f'  {alias}: dice-marks placed {dice_stats["placed"]}, excluded {dice_stats["excluded"]}, '
              f'unalignable {dice_stats["unalignable"]}, whitespace-joined {dice_stats["whitespace-joined"]}, '
              f'whitespace-only {dice_stats["whitespace-only"]}')

    # Emit chunk rows + FTS rows + passage rows.
    # FTS uses explicit rowid; not contentless because we want alias/page
    # filters to work on the FTS table itself. Passages are emitted here too
    # (text only — embeddings are filled in by `embed` command afterward).
    written = 0
    passages_written = 0
    for page_start, page_end, text in page_texts:
        if not text:
            continue
        chapter, section = toc_lookup_for_page(toc_ranges, page_start)
        ctype = classify_content_type(text, page_start, total_pages)
        cur = conn.execute(
            '''INSERT INTO chunks (alias, page_start, page_end, chapter, section,
                                   content_type, char_count, text)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)''',
            (alias, page_start, page_end, chapter, section, ctype, len(text), text),
        )
        rowid = cur.lastrowid
        conn.execute(
            '''INSERT INTO chunks_fts (rowid, text, chapter, section,
                                       alias, page_start, page_end, content_type)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)''',
            (rowid, text, chapter or '', section or '', alias, page_start, page_end, ctype),
        )
        written += 1

        # Passage split for semantic retrieval (embeddings filled later).
        for seq, ptext in enumerate(split_chunk(text, content_type=ctype)):
            conn.execute(
                '''INSERT INTO passages
                   (chunk_id, alias, page_start, page_end, chapter, section,
                    content_type, seq, char_count, text)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                (rowid, alias, page_start, page_end, chapter, section,
                 ctype, seq, len(ptext), ptext),
            )
            passages_written += 1

    # Log run
    conn.execute(
        'INSERT INTO ingest_runs (ran_at, alias, action, chunks_written) VALUES (?, ?, ?, ?)',
        (datetime.datetime.now().isoformat(timespec='seconds'), alias, 'rebuild', written),
    )

    if verbose:
        print(f'[ok]   {alias:<20} {total_pages:>4}p  → {written:>4} chunk(s)  {passages_written:>4} passage(s)'
              + (f'  [OCR: {len(ocr_pages)}p]' if ocr_pages else ''))
    return written


# ── Verified rules-tables overlay (T1a; scope verified-tables-lane-scope §2) ─────────────────────────
# Jason-verified tables from Docs/rules_tables/*.json become their own high-signal chunks: content_type
# 'verified_table', clean transcribed text, section 'VERIFIED table' so the oracle cites the tier. Kept
# separate from OCR chunks (which a PDF re-ingest wipes by alias) — re-added at the end of every run_ingest,
# and re-runnable standalone via `cli ingest-tables`.

RULES_TABLES_DIR = os.path.join(SCRIPT_DIR, 'Docs', 'rules_tables')


def verified_label(d):
    """R-LANE1 (ruling msp-m3-maneuvers §2.4): NO LABEL DILUTION — human- and oracle-verified tables carry
    DISTINCT labels so a reader (and the oracle) can tell which authority stands behind a chunk. 'VERIFIED
    table' is reserved for verified_by:'jason'; oracle-cite-checked prose is 'oracle-verified table'."""
    return 'VERIFIED table' if d.get('verified_by') == 'jason' else 'oracle-verified table'


def render_table_text(d):
    """Search-friendly plain-text render of a verified table (title + cite marker + pipe rows)."""
    label = verified_label(d)
    basis = 'Jason-approved' if label == 'VERIFIED table' else 'oracle cite-checked vs the raw book pages'
    lines = [
        d['title'],
        f"[{label} — {d['book']} p.{d['page']}, transcribed from the book, {basis}]",
        '',
        ' | '.join(d['columns']),
    ]
    for row in d['rows']:
        lines.append(' | '.join('' if c is None else c for c in row))
    if (d.get('notes') or '').strip():
        lines.append('\nNotes: ' + d['notes'])
    return '\n'.join(lines)


def ingest_rules_tables(conn, verbose=True):
    """(Re)ingest every VERIFIED table under Docs/rules_tables/ as a content_type='verified_table'
    chunk. Idempotent — clears the prior overlay first. A table enters iff verified_by is 'jason'
    (Jason diffed the render — OCR-hostile grids) OR 'oracle' (the read-only rules-oracle cite-checked
    prose against the pages) — the lane's two authorities."""
    conn.execute("DELETE FROM chunks_fts WHERE content_type = 'verified_table'")
    conn.execute("DELETE FROM passages   WHERE content_type = 'verified_table'")
    conn.execute("DELETE FROM chunks     WHERE content_type = 'verified_table'")
    written = 0
    for f in sorted(glob.glob(os.path.join(RULES_TABLES_DIR, '*.json'))):
        try:
            d = json.load(open(f, encoding='utf-8'))
        except Exception as e:
            if verbose:
                print(f'[skip] rules_table {os.path.basename(f)}: {e}', file=sys.stderr)
            continue
        if d.get('verified_by') not in ('jason', 'oracle'):
            continue   # only VERIFIED tables (jason-diffed or oracle-cite-checked) enter the cache
        alias, page, title = d['book'], d['page'], d['title']
        # R-VTD-1 (ruling verified-table-rekey-durable): `page`/`page_end` are PRINTED pages; the index
        # coordinate is DERIVED through the ONE converter, never written by hand and never the printed
        # page itself. A book with no earned offset fails the ingest loud, naming the file.
        from . import pdf_pages
        start = pdf_pages.to_corpus(alias, page)
        end = pdf_pages.to_corpus(alias, d.get('page_end', page))
        if start is None or end is None:
            raise OverlayError(
                f'rules_table {os.path.basename(f)}: {pdf_pages.explain(alias)} — cannot derive its index '
                f'coordinate, so it is refused rather than filed at its printed page (R-VTD-1)')
        text = render_table_text(d)
        sect = verified_label(d)   # R-LANE1: 'VERIFIED table' (jason) | 'oracle-verified table' (oracle)
        cur = conn.execute(
            '''INSERT INTO chunks (alias, page_start, page_end, chapter, section,
                                   content_type, char_count, text)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)''',
            (alias, start, end, title, sect, 'verified_table', len(text), text),
        )
        rowid = cur.lastrowid
        conn.execute(
            '''INSERT INTO chunks_fts (rowid, text, chapter, section,
                                       alias, page_start, page_end, content_type)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)''',
            (rowid, text, title, sect, alias, start, end, 'verified_table'),
        )
        conn.execute(
            '''INSERT INTO passages
               (chunk_id, alias, page_start, page_end, chapter, section,
                content_type, seq, char_count, text)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
            (rowid, alias, start, end, title, sect, 'verified_table', 0, len(text), text),
        )
        written += 1
    if verbose:
        print(f'[ok]   rules_tables         → {written:>4} verified table chunk(s)')
    return written


class OverlayError(IngestRefused):
    """The overlay could not be laid exactly as ruled (a refused book, or a ledger replay failure)."""


def embed_overlay(conn, embedder=None, verbose=True):
    """Embed every `verified_table` passage with no embedding (R-VTD-4 iii). Selects the overlay only, so a
    bare `ingest-tables` never embeds unrelated passages as a side effect. Returns the number written."""
    rows = conn.execute("SELECT id, text FROM passages WHERE content_type = 'verified_table' "
                        "AND embedding IS NULL ORDER BY id").fetchall()
    if not rows:
        return 0
    from . import embed as _embed_mod
    embedder = embedder or _embed_mod.default_embedder()
    vectors = embedder.encode([t for _, t in rows], is_query=False)
    for (rid, _), v in zip(rows, vectors):
        conn.execute('UPDATE passages SET embedding = ?, embedding_model = ? WHERE id = ?',
                     (_embed_mod.vec_to_blob(v), embedder.model_id, rid))
    conn.commit()
    if verbose:
        print(f'[ok]   rules_tables         → {len(rows):>4} overlay passage(s) embedded')
    return len(rows)


def lay_overlay(conn, db_path=DB_PATH, corrections_path=None, embed=True, embedder=None, verbose=True):
    """R-VTD-4 — R-ORP-4's mechanism. The ONE sequence every entry point that lays the overlay runs:
    (i) lay the overlay at converter-derived coordinates, (ii) replay the corrections ledger with
    apply=True, (iii) embed the overlay's passages. A replay failure raises OverlayError carrying the
    replayer's report; the caller exits non-zero. Returns the number of tables laid."""
    import io
    from . import corrections as _corr
    n = ingest_rules_tables(conn, verbose=verbose)
    conn.commit()
    buf = io.StringIO()
    kw = {'corrections_path': corrections_path} if corrections_path else {}
    rc = _corr.replay(db_path=db_path, apply=True, out=buf, **kw)
    if verbose or rc:
        print(buf.getvalue().rstrip())
    if rc:
        raise OverlayError('the corrections ledger did not replay cleanly (R-ORP-4); the report is above')
    if embed:
        embed_overlay(conn, embedder=embedder, verbose=verbose)
    return n


# ── Public entry ───────────────────────────────────────────────────────────

def run_ingest(alias=None, db_path=None, verbose=True, auto_embed=True):
    """Rebuild the index. If alias is given, only re-ingest that one PDF.

    WHICH index (R-RDI-3-2): the target is the alias's own, from its registry row's `index`
    (utils.db_path_for_alias), never chosen by hand; with no alias, the books index, and only
    the rows of the index being built are walked. A `db_path` naming the OTHER index from the
    alias's row is refused, so a books row can never land in the community file or the reverse.
    The verified rules-tables overlay and the topics are the books' and are laid only there.

    `auto_embed=True` (default) embeds any new passages after ingest —
    re-ingesting an alias drops its passages + embeddings, so without this
    step the semantic retrieval leg goes blind to that alias until a manual
    `embed --alias X` is run. Pass `auto_embed=False` only if you're about
    to run `embed` yourself (e.g. the CLI --no-embed flag).

    Returns (total_chunks, pdfs_touched).
    """
    fitz = _lazy_fitz()
    cfg = load_config()

    sources = cfg.get('sources', [])
    if alias:
        sources = [s for s in sources if s['alias'] == alias]
        if not sources:
            raise ValueError(f'Unknown alias: {alias}')
        own = db_path_for_alias(alias, cfg)
        if db_path is None:
            db_path = own
        elif os.path.abspath(db_path) in (os.path.abspath(DB_PATH), os.path.abspath(COMMUNITY_DB_PATH)) \
                and os.path.abspath(db_path) != os.path.abspath(own):
            raise IngestRefused(f'{alias} is a {index_of(sources[0])} row; it is never ingested into {db_path}')
    else:
        db_path = db_path or DB_PATH
    community = os.path.abspath(db_path) == os.path.abspath(COMMUNITY_DB_PATH)
    if not alias:
        sources = [s for s in sources if (index_of(s) == 'community') == community]
    conn = open_db(db_path)

    total = 0
    touched = 0
    touched_aliases = []
    t0 = time.time()
    try:
        refused = []
        for src in sources:
            try:
                n = ingest_pdf(conn, src, cfg, fitz, verbose=verbose)
            except IngestRefused as exc:
                # R-ORR-3: a refused book is untouched (its rows were never deleted); the rest of the run
                # and the overlay still complete, and the run fails at the end naming it.
                refused.append(str(exc))
                if verbose:
                    print(f'[REFUSED] {exc}', file=sys.stderr)
                continue
            total += n
            if n:
                touched += 1
                touched_aliases.append(src['alias'])
            conn.commit()
        # Refresh topics whenever we reindex the whole library (the books' only)
        if not alias and not community:
            seeded = seed_topics_table(conn)
            conn.commit()
            if verbose:
                print(f'[ok]   topics seeded: {seeded} entries')

        # Re-add the verified rules-tables overlay — a PDF re-ingest wipes its alias's chunks (including any
        # table chunk sharing that alias), so re-lay it after every ingest, full or single-alias — then
        # replay the corrections ledger and embed the overlay (R-VTD-4; a replay failure raises).
        if not community:
            lay_overlay(conn, db_path=db_path, embed=auto_embed, verbose=verbose)

        # Auto-embed — close the foot-gun where re-ingesting drops embeddings
        # but doesn't recompute them, leaving the semantic leg blind.
        if auto_embed and touched_aliases:
            from . import embed as _embed_mod
            if verbose:
                label = 'full library' if not alias else alias
                print(f'\n[auto-embed] loading model for {label}…')
            try:
                embedder = _embed_mod.default_embedder()
                for a in touched_aliases:
                    written, _ = _embed_mod.embed_unembedded(
                        conn, alias=a, embedder=embedder, verbose=verbose,
                    )
                    if verbose and written:
                        print(f'[auto-embed] {a}: {written} passage(s) embedded')
            except ImportError:
                if verbose:
                    print('[auto-embed] sentence-transformers not installed; skipping. '
                          'Semantic leg will be blind to re-ingested aliases until you run `embed`.',
                          file=sys.stderr)
        if refused:
            raise IngestRefused('; '.join(refused))
    finally:
        conn.close()

    if verbose:
        dt = time.time() - t0
        print(f'\nIngested {total} chunk(s) across {touched} PDF(s) in {dt:.1f}s')
        print(f'Database: {db_path}')
    return total, touched
