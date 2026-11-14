"""Guard for `text_source` (ruling `ocr-rotation-repair` R-ORR-3, C-ORR-3): declaration and measurement together.

A book whose embedded text layer is garbage is declared `"text_source": "ocr"` in Docs/pdf_sources.json, and the
ingest then reads every page from its OCR cache. This guard reads the registry and the live index side by side:

  (i)   cache        every `text_source: "ocr"` alias has an OCR cache covering pages 1..page_count, written by
                     ONE engine, the ruled one (`vision`)
  (ii)  measured     every such alias measures `text_quality == clean` with hostile share < 0.20 in the live
                     index (the census of swrpg_index.text_quality, the same instrument every hit carries)
  (iii) declared     every alias the census reads `mojibake` is declared `text_source: "ocr"`, so the next
                     rotated or corrupt scan cannot sit in that class undeclared the way these three did
  (iv)  vocabulary   `text_source` values are only "native" or "ocr"

HARVEST: the number of declared `ocr` aliases checked. Zero is a failed run (instrument norm 5).

IT EXITS BY REPORT (ruling `oracle-o7` C-O7H-1, B-932): an alias prints `[PASS]` only when it recorded no failure, so a
declared `ocr` alias with no cache (a fresh worktree without the `Docs/ocr_cache/` copy) prints its (i) `[FAIL]` and
the summary and exits 1 — it never reaches the `[PASS]` line, which used to die there by traceback.

Run:
    python3 -m swrpg_index.tests.text_source              # the live index, read-only
    python3 -m swrpg_index.tests.text_source --db COPY    # a temp copy, for a bite
    python3 -m swrpg_index.tests.text_source --ocr-cache DIR   # the OCR caches read from DIR (an empty DIR injects
                                                               # the absence; the real copy is never moved)
Exit 0 iff every check passes and the harvest is non-zero.
"""
import json
import os
import sqlite3
import sys

from swrpg_index import DB_PATH
from swrpg_index import ingest
from swrpg_index import text_quality as tq
from swrpg_index.ingest import OCR_RULED_ENGINE, TEXT_SOURCES, load_ocr_cache
from swrpg_index.utils import load_config

HOSTILE_SHARE_MAX = tq.GLYPH_LOSS_HOSTILE_SHARE   # 0.20: below the glyph-loss line


def run(db_path=DB_PATH):
    if not os.path.exists(db_path):
        print(f'ERROR: no index at {db_path}')
        return 1
    cfg = load_config()
    conn = sqlite3.connect(f'file:{db_path}?mode=ro', uri=True)
    census = tq._Census(conn)   # measured fresh; never a cached read of another file
    page_count = dict(conn.execute('SELECT alias, page_count FROM pdfs'))
    fails = []
    declared = []
    for s in cfg.get('sources', []):
        a, ts = s.get('alias'), s.get('text_source', 'native')
        if ts not in TEXT_SOURCES:
            fails.append(f'(iv) {a}: text_source {ts!r} is not one of {TEXT_SOURCES}')
            continue
        if ts != 'ocr':
            continue
        declared.append(a)
        before = len(fails)
        cache = load_ocr_cache(a)
        n = page_count.get(a)
        if cache is None:
            fails.append(f'(i) {a}: declared text_source "ocr" but has no OCR cache')
        else:
            engine = cache.get('engine', 'tesseract')
            pages = cache.get('pages') or {}
            missing = [p for p in range(1, (n or 0) + 1) if str(p) not in pages]
            if engine != OCR_RULED_ENGINE:
                fails.append(f'(i) {a}: cache engine is {engine}, the ruled engine is {OCR_RULED_ENGINE}')
            if n is None:
                fails.append(f'(i) {a}: not in the index (pdfs has no row)')
            elif missing:
                fails.append(f'(i) {a}: cache lacks {len(missing)} of {n} pages (first: {missing[:10]})')
        b = census.books.get(a)
        if b is None:
            fails.append(f'(ii) {a}: no chunks in the index')
        elif b['text_quality'] != tq.CLEAN or b['hostile_share'] >= HOSTILE_SHARE_MAX:
            fails.append(f"(ii) {a}: measures {b['text_quality']}, hostile share {b['hostile_share']:.3f} "
                         f"(needs clean and < {HOSTILE_SHARE_MAX}), {b['cjk_pages']} CJK page(s)")
        elif len(fails) == before:
            print(f"  [PASS] {a}: cache {len(cache.get('pages') or {})}/{n} {cache.get('engine')}; "
                  f"{b['text_quality']}, hostile share {b['hostile_share']:.3f}, CJK pages {b['cjk_pages']}")
    declared_set = set(declared)
    for a, b in sorted(census.books.items()):
        if b['text_quality'] == tq.MOJIBAKE and a not in declared_set:
            fails.append(f"(iii) {a}: the census reads it mojibake (share {b['hostile_share']:.3f}, "
                         f"{b['cjk_pages']} CJK pages) but it is not declared text_source \"ocr\"")
    conn.close()
    for f in fails:
        print(f'  [FAIL] {f}')
    harvest = len(declared)
    if harvest == 0:
        print('\nHARVEST 0 — no alias declares text_source "ocr"; a check aimed at no subject FAILS (norm 5)')
        return 1
    print(f'\ntext_source: harvest {harvest} declared ocr alias(es), {len(fails)} failure(s) — '
          f'{"FAIL" if fails else "PASS"}')
    return 1 if fails else 0


if __name__ == '__main__':
    argv = sys.argv[1:]
    db = argv[argv.index('--db') + 1] if '--db' in argv else DB_PATH
    if '--ocr-cache' in argv:
        ingest.OCR_CACHE_DIR = argv[argv.index('--ocr-cache') + 1]   # load_ocr_cache reads the module global
    sys.exit(run(db_path=db))
