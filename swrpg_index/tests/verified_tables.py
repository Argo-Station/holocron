"""Guard for the verified rules-tables overlay: does each table sit where the BOOK is? (C-VTD-3)

Ruling `verified-table-rekey-durable` R-VTD-1/2/4. The overlay's index coordinates are DERIVED at ingest
from each table's printed `page` (and optional `page_end`) through the ONE converter, `swrpg_index.pdf_pages`.
This guard reads the live index and checks, per verified table file:

  row          exactly one `verified_table` row carries the table's title
  stores       `chunks`, `chunks_fts` and `passages` agree on its coordinates (the index keeps three copies)
  coordinate   page_start/page_end equal the converter's values from the file, never the printed page
  anchor       the RAW book text (the overlay excluded) on page_start contains the file's `anchor`,
               case- and whitespace-insensitively. This is the content-identity check that replaced R-EBD-2's
               per-table hand verification.
  continuation for a range, the RAW text on page_end carries at least two of the table's own row names
               (R-RCA-A6-1: an END page is checked for continuation)
  embedding    no NULL embedding on its passage (the semantic leg is blind to an unembedded row)

It also fails on a `verified_table` row that no verified file accounts for. It states its HARVEST, the number
of tables checked; a harvest of zero is a failed run (instrument norm 5).

History this guard exists for: the August re-key (verified-table-page-rekey) was erased by the next ingest
(run 218, 2026-08-26) and nothing noticed for four weeks.

Run:
    python3 -m swrpg_index.tests.verified_tables              # the live index, read-only
    python3 -m swrpg_index.tests.verified_tables --db COPY    # a temp copy, for a bite
Exit 0 iff every table passes and the harvest is non-zero.
"""
import glob
import json
import os
import re
import sqlite3
import sys

from swrpg_index import DB_PATH
from swrpg_index import pdf_pages
from swrpg_index.ingest import RULES_TABLES_DIR


def _norm(s):
    return re.sub(r'\s+', '', s or '').lower()


def _raw_text(conn, alias, page):
    rows = conn.execute(
        "SELECT text FROM chunks WHERE alias = ? AND page_start <= ? AND page_end >= ? "
        "AND content_type != 'verified_table'", (alias, page, page)).fetchall()
    return '\n'.join(t for (t,) in rows)


def _verified_files():
    out = []
    for f in sorted(glob.glob(os.path.join(RULES_TABLES_DIR, '*.json'))):
        d = json.load(open(f, encoding='utf-8'))
        if d.get('verified_by') in ('jason', 'oracle'):
            out.append((os.path.basename(f), d))
    return out


def check_table(conn, name, d):
    """Return (failures, facts) for one verified table file."""
    fails, facts = [], []
    alias, title = d['book'], d['title']
    want_s = pdf_pages.to_corpus(alias, d['page'])
    want_e = pdf_pages.to_corpus(alias, d.get('page_end', d['page']))
    if want_s is None or want_e is None:
        return [f'converter refuses {alias}: {pdf_pages.explain(alias)}'], facts
    rows = conn.execute("SELECT id, page_start, page_end FROM chunks WHERE content_type = 'verified_table' "
                        "AND alias = ? AND chapter = ?", (alias, title)).fetchall()
    if len(rows) != 1:
        return [f'row: expected exactly 1 verified_table row titled {title!r}, found {len(rows)}'], facts
    cid, ps, pe = rows[0]
    facts.append(f'chunk {cid} at {ps}-{pe}')
    if (ps, pe) != (want_s, want_e):
        fails.append(f'coordinate: {ps}-{pe}, converter says {want_s}-{want_e} '
                     f'(printed {d["page"]}-{d.get("page_end", d["page"])})')
    fts = conn.execute("SELECT page_start, page_end FROM chunks_fts WHERE rowid = ?", (cid,)).fetchall()
    psg = conn.execute("SELECT page_start, page_end, embedding IS NULL FROM passages WHERE chunk_id = ?",
                       (cid,)).fetchall()
    if [tuple(map(int, r)) for r in fts] != [(ps, pe)]:
        fails.append(f'stores: chunks_fts reads {fts}, chunks reads {(ps, pe)}')
    if len(psg) != 1 or (int(psg[0][0]), int(psg[0][1])) != (ps, pe):
        fails.append(f'stores: passages reads {[(r[0], r[1]) for r in psg]}, chunks reads {(ps, pe)}')
    elif psg[0][2]:
        fails.append('embedding: its passage has a NULL embedding')
    anchor = d.get('anchor')
    if not anchor:
        fails.append('anchor: the file declares none (scripts/validate_rules_tables.py also refuses this)')
    elif _norm(anchor) not in _norm(_raw_text(conn, alias, want_s)):
        fails.append(f'anchor: {anchor!r} is not on the RAW text of {alias} corpus {want_s}')
    else:
        facts.append(f'anchor {anchor!r} on {alias} corpus {want_s}')
    if want_e != want_s:
        end_text = _norm(_raw_text(conn, alias, want_e))
        names = [r[0] for r in d['rows'] if r and r[0]]
        hit = [n for n in names if _norm(n.split('(')[0]) and _norm(n.split('(')[0]) in end_text]
        if len(hit) < 2:
            fails.append(f'continuation: RAW text of {alias} corpus {want_e} carries {len(hit)} of the table\'s '
                         f'row names (need >= 2): {hit}')
        else:
            facts.append(f'continuation on corpus {want_e}: {hit}')
    return fails, facts


def run(db_path=DB_PATH, verbose=False):
    if not os.path.exists(db_path):
        print(f'ERROR: no index at {db_path}')
        return 1
    conn = sqlite3.connect(f'file:{db_path}?mode=ro', uri=True)
    files = _verified_files()
    bad = 0
    for name, d in files:
        fails, facts = check_table(conn, name, d)
        print(f'  [{"PASS" if not fails else "FAIL"}] {name}')
        for x in fails:
            print(f'         - {x}')
        if verbose or fails:
            for x in facts:
                print(f'           {x}')
        bad += bool(fails)
    titles = {(d['book'], d['title']) for _, d in files}
    strays = [r for r in conn.execute("SELECT id, alias, chapter FROM chunks WHERE content_type = 'verified_table'")
              if (r[1], r[2]) not in titles]
    for r in strays:
        print(f'  [FAIL] stray verified_table row {r[0]} ({r[1]}, {r[2]!r}): no verified file accounts for it')
    bad += len(strays)
    conn.close()
    harvest = len(files)
    if harvest == 0:
        print('\nHARVEST 0 — no verified table was checked; a check aimed at no subject FAILS (norm 5)')
        return 1
    print(f'\nverified tables: harvest {harvest}, {bad} failure(s) — {"FAIL" if bad else "PASS"}')
    return 1 if bad else 0


if __name__ == '__main__':
    argv = sys.argv[1:]
    db = argv[argv.index('--db') + 1] if '--db' in argv else DB_PATH
    sys.exit(run(db_path=db, verbose='--verbose' in argv or '-v' in argv))
