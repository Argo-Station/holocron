"""text_quality.py — can the corpus TEXT of this book (and this page) be trusted?

Audit `oracle-audit-2026-09-22` F9: `Docs/pdf_sources.json` records only `has_text` (100/100
true), and a text layer that is garbage still counts as text. The census
`Docs/audit_artifacts/oracle_ocr_hostility_census.py` measured two failure classes over the
live index — whole-page mojibake (a rotated/corrupt text layer that OCR turned into CJK
garbage: `allies`, `gadgets`, `ships`) and stat-block glyph substitution (dice glyphs arrive as
`@ ® º ≤`, numerals drop: the folios, the beginner games, the adventures). The oracle was told
about two of those books. This module makes every hit SAY which class its book is in, the way
`printed_offset` rides every hit (B-335 A1-4's pattern).

DERIVED AT RUNTIME, NOT STORED. Nothing here edits `Docs/pdf_sources.json` or the `pdfs`
table (no registry schema change — WP2 of `Docs/briefs/oracle-lap-brief.md`). The classes are
computed from the `chunks` table on first use and cached in-process for the life of the
connection's database file (a rebuilt DB — new mtime — is re-measured).

THE FOUR PAGE SIGNALS (the census's, verbatim in meaning). A chunk ("page") is HOSTILE if ANY:
    cjk        > 20 CJK/hangul glyphs          (rotated-page OCR emits them)
    non-ASCII  > 8% of its characters          (dice glyphs, mojibake)
    junk runs  >= 8 glyph-substitution matches ('@', '®', 'º', '≤≥', 'Q@' …)
    short      < 200 characters                (image-only page, no usable text)

THE BOOK CLASS (thresholds ratified by ruling `oracle-audit-lap` R-OAL-9 — the census's, with
glyph-loss at 0.20):
    mojibake    iff  cjk_pages / pages  >= 0.5     (the text layer is unreadable garbage)
    glyph-loss  iff  hostile_share      >= 0.20    (words survive; numerals are suspect)
    clean       otherwise
    where hostile_share = hostile pages / pages, and "pages" counts chunks, as the census does.
    (0.20, not the census's 0.25 reporting line: `eote-beginner` measures 0.246 and is the
    glyph-loss class the audit's minion probe hit at rank 1 — "Q4@4@®".)

EVERY RECORD CARRIES THREE FIELDS (see `annotate`):
    text_quality  'clean' | 'glyph-loss' | 'mojibake'   — a property of the BOOK
    page_hostile  bool                                  — a property of THIS page
    lost_glyphs   int | null                            — how many symbols THIS page lost (ruling
                  `oracle-o3-damage-truth` C-ODT-1): the junk-run count `page_signals` returns for the
                  page's text, the same number `page_is_hostile` compares to JUNK_RUNS_MIN. 0 on a
                  `verified_table` record; null for a page the index holds no chunk for (keyed by the
                  chunk's first page, as page_hostile is) and for a record with no page. No mark is
                  excluded (the ruling's M1).
A `verified_table` chunk (Jason-verified text, T1a) is never hostile: its text is the checked
layer, not OCR. A page the index holds no chunk for reads `page_hostile: false` only when the
book is clean; otherwise the unknown page is reported hostile (it cannot be vouched for).

THE FALLBACK PAGES (C-ODT-3) read hostile whatever their signals say, and count as hostile in their
book's share: lap 2's decode wrote a die on them at a grazed space it could not place on its row, so a
die may sit on the wrong line (`FALLBACK_PAGES` below). No threshold moves (C-ODT-2).

Run:  .venv/bin/python -m swrpg_index.text_quality [alias ...]   — prints the class table and
      the in-process compute time. Read-only.
"""
import os
import re
import sqlite3
import sys
import time

CLEAN, GLYPH_LOSS, MOJIBAKE = 'clean', 'glyph-loss', 'mojibake'

# Page-signal thresholds (the census's).
CJK_GLYPHS_MAX = 20
NON_ASCII_SHARE_MAX = 0.08
JUNK_RUNS_MIN = 8
SHORT_CHARS = 200

# Book-class thresholds (WP2).
MOJIBAKE_CJK_SHARE = 0.5
GLYPH_LOSS_HOSTILE_SHARE = 0.20

# C-ODT-3 (ruling `oracle-o3-damage-truth`, citing `oracle-o3-decode-leftovers-lone-marks` R-ODLL-2): the
# C-ODL-3a FALLBACK list of Docs/audit_artifacts/oracle_o3_decode_leftovers_2026-09/lone_marks.md, pinned to that
# list by swrpg_index/tests/damage_truth.py (iii). A later lap that places those dice on their row removes its pages.
FALLBACK_PAGES = frozenset({('eote', 159), ('aor', 19), ('aor', 126), ('aor', 165)})

_CJK_RE = re.compile(r'[　-鿿가-힯]')
_JUNK_RE = re.compile(r'[@®º°≤≥§¶¤¥¢£€]|[A-Z]@|@[A-Z]')


def page_signals(text):
    """The census's four signals for one page's text → (cjk, non_ascii_share, junk, short)."""
    t = text or ''
    n = len(t)
    non_ascii = n - len(t.encode('ascii', 'ignore'))
    # CJK glyphs are non-ASCII, so a page with ≤ 20 non-ASCII chars cannot exceed the CJK line.
    cjk = len(_CJK_RE.findall(t)) if non_ascii > CJK_GLYPHS_MAX else 0
    share = (non_ascii / n) if n else 1.0
    junk = len(_JUNK_RE.findall(t))
    return cjk, share, junk, n < SHORT_CHARS


def page_is_hostile(text):
    cjk, share, junk, short = page_signals(text)
    return cjk > CJK_GLYPHS_MAX or share > NON_ASCII_SHARE_MAX or junk >= JUNK_RUNS_MIN or short


def classify(pages, hostile, cjk_pages):
    """Book class from the census counts."""
    if not pages:
        return CLEAN
    if cjk_pages / pages >= MOJIBAKE_CJK_SHARE:
        return MOJIBAKE
    if hostile / pages >= GLYPH_LOSS_HOSTILE_SHARE:
        return GLYPH_LOSS
    return CLEAN


class _Census(object):
    """One measurement of one database file."""

    def __init__(self, conn):
        t0 = time.perf_counter()
        self.books = {}            # alias -> dict(pages, hostile, cjk_pages, hostile_share, text_quality)
        self.hostile_pages = set() # (alias, page_start) of hostile OCR chunks
        self.ocr_pages = set()     # (alias, page_start) the index holds an OCR chunk for
        self.lost_glyphs = {}      # (alias, page_start) -> junk runs of that OCR chunk (C-ODT-1)
        for alias, page, ctype, text in conn.execute(
                'SELECT alias, page_start, content_type, text FROM chunks'):
            b = self.books.get(alias)
            if b is None:
                b = self.books[alias] = {'pages': 0, 'hostile': 0, 'cjk_pages': 0}
            cjk, share, junk, short = page_signals(text)
            hostile = cjk > CJK_GLYPHS_MAX or share > NON_ASCII_SHARE_MAX or junk >= JUNK_RUNS_MIN or short
            if ctype != 'verified_table' and (alias, page) in FALLBACK_PAGES:
                hostile = True   # C-ODT-3
            b['pages'] += 1
            b['cjk_pages'] += cjk > CJK_GLYPHS_MAX
            b['hostile'] += hostile
            if ctype != 'verified_table':
                self.ocr_pages.add((alias, page))
                self.lost_glyphs[(alias, page)] = junk
                if hostile:
                    self.hostile_pages.add((alias, page))
        for b in self.books.values():
            b['hostile_share'] = round(b['hostile'] / b['pages'], 3) if b['pages'] else 0.0
            b['text_quality'] = classify(b['pages'], b['hostile'], b['cjk_pages'])
        self.seconds = time.perf_counter() - t0

    def quality(self, alias):
        b = self.books.get(alias)
        return b['text_quality'] if b else CLEAN

    def hostile(self, alias, page, content_type=None):
        if content_type == 'verified_table' or page is None:
            return False
        key = (alias, page)
        if key in self.ocr_pages:
            return key in self.hostile_pages
        return self.quality(alias) != CLEAN

    def lost(self, alias, page, content_type=None):
        if content_type == 'verified_table':
            return 0
        if page is None:
            return None
        return self.lost_glyphs.get((alias, page))


_CACHE = {}  # (db path, mtime) -> _Census


def _db_key(conn):
    path = None
    for row in conn.execute('PRAGMA database_list'):
        if row[1] == 'main':
            path = row[2]
            break
    try:
        mtime = os.path.getmtime(path) if path else None
    except OSError:
        mtime = None
    return (path or ':memory:', mtime)


def census(conn):
    """The cached measurement for `conn`'s database (computed on first use)."""
    key = _db_key(conn)
    c = _CACHE.get(key)
    if c is None:
        c = _CACHE[key] = _Census(conn)
    return c


def book_quality(conn, alias):
    return census(conn).quality(alias)


def annotate(conn, rec, alias=None):
    """Stamp `text_quality` (book), `page_hostile` and `lost_glyphs` (page) on a page-bearing record in
    place. Additive only — no existing key changes. Returns the record."""
    c = census(conn)
    a = alias or rec.get('alias')
    rec['text_quality'] = c.quality(a)
    rec['page_hostile'] = c.hostile(a, rec.get('page_start'), rec.get('content_type'))
    rec['lost_glyphs'] = c.lost(a, rec.get('page_start'), rec.get('content_type'))
    return rec


def main(argv=None):
    from .utils import DB_PATH
    argv = sys.argv[1:] if argv is None else argv
    conn = sqlite3.connect('file:%s?mode=ro' % DB_PATH, uri=True)
    c = census(conn)
    rows = sorted(c.books.items(), key=lambda kv: -kv[1]['hostile_share'])
    if argv:
        rows = [(a, c.books[a]) for a in argv if a in c.books]
    print(f"{'alias':22} {'pages':>5} {'hostile':>7} {'cjk':>4} {'share':>6}  text_quality")
    for a, b in rows:
        print(f"{a:22} {b['pages']:5} {b['hostile']:7} {b['cjk_pages']:4} {b['hostile_share']:6.3f}  {b['text_quality']}")
    counts = {}
    for b in c.books.values():
        counts[b['text_quality']] = counts.get(b['text_quality'], 0) + 1
    print(f"books {len(c.books)} · pages {sum(b['pages'] for b in c.books.values())} · "
          f"classes {counts} · computed in {c.seconds:.3f}s")
    return 0


if __name__ == '__main__':
    sys.exit(main())
