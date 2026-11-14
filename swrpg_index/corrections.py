"""Replay the hand-corrections ledger over a freshly-ingested index.

WHY THIS EXISTS. Ingest rebuilds the index from the PDFs, which means it re-runs
OCR — and OCR is where the corrections came from in the first place. A re-ingest
therefore silently re-drops every hand-fix: Jason's Twi'lek strain numeral goes
back to blank, and the verified tables go back to being filed by printed page.
`data-sources/corrections/corrections.json` is the durable record of those fixes;
this module is what puts them back.

R-ORP-4 (ruling `oracle-rule-2-and-p2-rerun`) makes that a rule, not a courtesy:
**no ingest runs without replaying this file.** Until now that rule blocked
re-ingest outright, because there was nothing to replay with.

THE CONTRACT, and its spine is FAIL-LOUD (ruling §9, Amendment 3):

  * Replay is DETERMINISTIC FROM THE FILE ALONE. The file is the record; this tool
    adds no judgement of its own.
  * Dispatch is on the declared `kind`. The shape is never inferred from which
    fields happen to be present — inferring is guessing, and a tool that guesses
    about page numbers is the exact defect the corrections ledger exists to undo
    (R-EBD-2's spirit, applied at replay time).
  * An entry that cannot be applied EXACTLY as declared FAILS LOUD and aborts.
    Not a warning, not a skip. A silent skip would leave a half-corrected index
    that looks corrected, which is worse than an obvious failure.
  * A correction is found by its ADDRESS — `alias` · `page` (the PDF index) ·
    `match` — never by a row id, because every re-ingest re-mints the ids (ruling
    `b798-corrections-stable-key` R-CSK-1). The three copies of the chunk text
    (`chunks`, `chunks_fts` by rowid, `passages` by chunk_id) are the kind's own
    contract, and "exactly one site" is defined per store (R-CSK-3).

SAFETY. Writes require `--apply`. The default is a dry run that reports exactly
what would change and touches nothing, because the usual reason to run this is
straight after an ingest, on a database you cannot easily rebuild.

Usage:
    python3 -m swrpg_index.corrections                    # dry run against the live index
    python3 -m swrpg_index.corrections --apply            # write
    python3 -m swrpg_index.corrections --db /tmp/copy.db --apply
    python3 -m swrpg_index.corrections --verbose

Exit codes: 0 = every entry applied (or would apply) cleanly; 1 = a failure, and
the report says which entry and why.
"""
import argparse
import json
import os
import re
import sqlite3
import sys

from . import DB_PATH

CORRECTIONS_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    'data-sources', 'corrections', 'corrections.json',
)


class CorrectionError(Exception):
    """An entry could not be applied exactly as declared. Always fatal."""


# ── loading ───────────────────────────────────────────────────────────────

def load_corrections(path=CORRECTIONS_PATH):
    with open(path) as fh:
        doc = json.load(fh)
    entries = doc.get('corrections') or []
    for e in entries:
        if 'kind' not in e:
            raise CorrectionError(
                f"correction {e.get('id')!r} declares no `kind`. The replayer "
                f"dispatches on `kind` and will not infer it from the entry's shape."
            )
    return entries


COPIES = ('chunks', 'chunks_fts', 'passages')


def _stores(entry):
    """The table names the entry declares. A text correction lives in all three copies of the chunk text
    (`chunks`, `chunks_fts`, `passages`), so the declared set must equal that set EXACTLY: a correction that
    lands in fewer copies is the half-corrected index this ledger exists to prevent (ruling
    `b798-corrections-stable-key` R-CSK-2). Names only — a row id in a live entry is refused (R-CSK-1)."""
    names = []
    for s in entry.get('stores') or []:
        if not isinstance(s, str):
            raise CorrectionError(
                f"{entry['id']}: `stores` holds a non-name {s!r}. Stores are table names; the rows are found "
                f"by address (alias · page · match), never by a row id (R-CSK-1).")
        names.append(s)
    if sorted(names) != sorted(COPIES):
        missing = sorted(set(COPIES) - set(names))
        other = sorted(set(names) - set(COPIES))
        raise CorrectionError(
            f"{entry['id']}: `stores` must be exactly {list(COPIES)}; missing {missing}, other {other}, "
            f"declared {names}")
    return names


def _check_printed_page(entry, report):
    """`printed_page` is a declaration with its measurement (R-CSK-2): checked through the ONE converter when the
    book is calibrated, reported unmeasured by name when it is not."""
    from . import pdf_pages
    alias, page, printed = entry['alias'], entry['page'], entry.get('printed_page')
    if printed is None:
        report.append('    printed_page: not declared (unmeasured)')
        return
    if pdf_pages.status(alias) != pdf_pages.CALIBRATED:
        report.append(f'    printed_page {printed}: UNMEASURED — {pdf_pages.explain(alias)}')
        return
    want = pdf_pages.to_corpus(alias, printed)
    if want != page:
        raise CorrectionError(
            f"{entry['id']}: printed_page {printed} converts to PDF page {want}, but the entry declares page "
            f"{page}. Either the offset or the entry is wrong; a human decides which.")
    report.append(f'    printed_page {printed} -> PDF page {want}: agrees')


# ── the kind ──────────────────────────────────────────────────────────────

def _resolve(conn, entry, pat, new):
    """R-CSK-3: find the SITE chunk by address. Candidates are the entry's alias with a page span covering
    `page`, never the verified-table overlay (its text is corrected at its source). Returns (id, state)."""
    rows = conn.execute(
        "SELECT id, text FROM chunks WHERE alias = ? AND page_start <= ? AND page_end >= ? "
        "AND COALESCE(content_type, '') != 'verified_table' ORDER BY id",
        (entry['alias'], entry['page'], entry['page'])).fetchall()
    matching = [(i, len(pat.findall(t))) for i, t in rows if pat.search(t)]
    applied = [i for i, t in rows if new in t]
    if len(matching) == 1 and matching[0][1] == 1 and all(a == matching[0][0] for a in applied):
        return matching[0][0], 'to correct'
    if not matching and len(applied) == 1:
        return applied[0], 'already applied'
    raise CorrectionError(
        f"{entry['id']}: chunks at {entry['alias']} page {entry['page']} — {len(rows)} candidate rows "
        f"{[i for i, _ in rows]}; `match` hits {[f'{i}x{n}' for i, n in matching]}; `replacement` present in "
        f"{applied}. Exactly one site is required: one row matching once, or none matching and one already "
        f"applied.")


def _apply_text_replacement(conn, entry, apply, embedder_holder, report):
    for f in ('alias', 'page', 'match', 'replacement'):
        if entry.get(f) is None:
            raise CorrectionError(f"{entry['id']}: declares no `{f}`")
    _stores(entry)
    _check_printed_page(entry, report)
    pat = re.compile(entry['match'])
    new = entry['replacement']
    reembed = bool(entry.get('reembed'))
    cid, state = _resolve(conn, entry, pat, new)
    report.append(f"    resolved: {entry['alias']} page {entry['page']} -> chunks.id={cid} ({state})")

    def fix(table, key, value, text, label):
        """True = corrected (or would be), False = already applied, None = carries neither."""
        n = len(pat.findall(text))
        if n == 0:
            if new in text:
                report.append(f'    {label}: already applied (no change)')
                return False
            return None
        if n > 1:
            raise CorrectionError(f"{entry['id']}: {label} — `match` hits {n} times; one site per row")
        report.append(f'    {label}: 1 replacement')
        if apply:
            conn.execute(f'UPDATE {table} SET text = ? WHERE {key} = ?', (pat.sub(new, text), value))
        return True

    text = conn.execute('SELECT text FROM chunks WHERE id = ?', (cid,)).fetchone()[0]
    fix('chunks', 'id', cid, text, f'chunks.id={cid}')
    row = conn.execute('SELECT text FROM chunks_fts WHERE rowid = ?', (cid,)).fetchone()
    if row is None:
        raise CorrectionError(f"{entry['id']}: chunks_fts.rowid={cid} — no fts row for the site chunk")
    if fix('chunks_fts', 'rowid', cid, row[0], f'chunks_fts.rowid={cid}') is None:
        raise CorrectionError(
            f"{entry['id']}: chunks_fts.rowid={cid} carries neither `match` nor `replacement` — the copies disagree")
    passages = conn.execute('SELECT id, text FROM passages WHERE chunk_id = ? ORDER BY seq, id',
                            (cid,)).fetchall()
    carried = 0
    for pid, ptext in passages:
        r = fix('passages', 'id', pid, ptext, f'passages.id={pid}')
        if r is None:
            report.append(f'    passages.id={pid}: no site')
            continue
        carried += 1
        if r and reembed:
            if apply:
                vec = _embed(embedder_holder, pat.sub(new, ptext))
                conn.execute('UPDATE passages SET embedding = ? WHERE id = ?', (vec, pid))
                report.append(f'    passages.id={pid}: re-embedded')
            else:
                report.append(f'    passages.id={pid}: would re-embed')
    if not carried:
        raise CorrectionError(
            f"{entry['id']}: passages of chunk {cid} {[p for p, _ in passages]} — none carries `match` or "
            f"`replacement`; the chunk has the site and no window does")


KINDS = {'text_replacement': _apply_text_replacement}


# ── embedding (lazy: only loaded if a correction actually needs it) ────────

def _embed(holder, text):
    import numpy as np
    if holder.get('e') is None:
        from .embed import default_embedder
        holder['e'] = default_embedder()
    return holder['e'].encode([text], is_query=False)[0].astype(np.float32).tobytes()


# ── driver ────────────────────────────────────────────────────────────────

def replay(db_path=None, corrections_path=CORRECTIONS_PATH, apply=False, verbose=False,
           out=sys.stdout):
    db_path = db_path or DB_PATH
    if not os.path.exists(db_path):
        print(f'ERROR: no index at {db_path}', file=sys.stderr)
        return 1
    entries = load_corrections(corrections_path)
    conn = sqlite3.connect(db_path)
    holder = {'e': None}
    mode = 'APPLY' if apply else 'DRY RUN (no writes; pass --apply to write)'
    print(f'# replay corrections — {mode}', file=out)
    print(f'#   index : {db_path}', file=out)
    print(f'#   ledger: {corrections_path}  ({len(entries)} corrections)', file=out)
    failed = None
    try:
        if apply:
            conn.execute('BEGIN')
        for e in entries:
            report = []
            fn = KINDS.get(e['kind'])
            if fn is None:
                raise CorrectionError(
                    f"{e['id']}: unknown kind {e['kind']!r} — known kinds are "
                    f"{sorted(KINDS)}. Refusing to guess."
                )
            fn(conn, e, apply, holder, report)
            print(f"  [{e['kind']}] {e['id']}", file=out)
            for line in report:
                if verbose or 'already' not in line or line.lstrip().startswith('resolved:'):
                    print(line, file=out)
        if apply:
            conn.commit()
    except CorrectionError as exc:
        if apply:
            conn.rollback()
        failed = exc
    finally:
        conn.close()
    if failed is not None:
        print(f'\nFAILED — {failed}', file=out)
        print('No changes were written (the run is a single transaction).', file=out)
        return 1
    print(f'\nOK — {len(entries)} correction(s) {"applied" if apply else "would apply"} cleanly.',
          file=out)
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--db', default=None, help='index to replay over (default: the live index)')
    ap.add_argument('--corrections', default=CORRECTIONS_PATH)
    ap.add_argument('--apply', action='store_true', help='write (default is a dry run)')
    ap.add_argument('--verbose', '-v', action='store_true')
    a = ap.parse_args(argv)
    return replay(db_path=a.db, corrections_path=a.corrections, apply=a.apply, verbose=a.verbose)


if __name__ == '__main__':
    sys.exit(main())
