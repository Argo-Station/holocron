"""Guard for the corrections replayer — can it rebuild the hand-fix history, whatever the row ids are?

The replayer's whole promise is that a re-ingest is survivable: wipe the index, rebuild it from the PDFs, replay
the ledger, and every hand-correction is back. A re-ingest re-mints every row id, so the replayer finds each
correction by its ADDRESS — alias · page · match — never by an id (ruling `b798-corrections-stable-key` R-CSK-1).
This guard is built around the SITE, not the row (R-CSK-6). Four cases, each stating its HARVEST; a zero or
phantom harvest is a FAIL (instrument norm 5):

  1. site-resurrection  From the backup of each LIVE ledger entry (its `backup` field, never a directory
                        listing), put the pre-write text back at the rows the address resolves to in a COPY of the
                        live index, replay, and require those rows to equal the live index's. Every row the backup
                        names must land on exactly one existing resolved row: a backup row with nowhere to land is a
                        PHANTOM and fails the case.
  2. re-mint            On a copy, move the site chunk, its fts row and its passages to NEW ids (the old deleted),
                        put the pre-write text back, clear the passage embedding, replay: the correction must
                        resolve at the new ids, all three copies read back the replacement, the passage is
                        re-embedded.
  3. idempotent         A second replay changes nothing.
  4. fails-loud         A corrupted `match`, and a second candidate chunk at the same alias and page, each abort the
                        run (exit 1, "FAILED") with nothing written.

Run:
    python3 -m swrpg_index.tests.corrections
    python3 -m swrpg_index.tests.corrections --verbose

Nothing here writes to the live index — every case operates on a temp copy.
"""
import io
import json
import os
import re
import shutil
import sqlite3
import sys
import tempfile

from swrpg_index import DB_PATH
from swrpg_index.corrections import CORRECTIONS_PATH, load_corrections, replay, _resolve

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TABLE_KEY = {'chunks': 'id', 'chunks_fts': 'rowid', 'passages': 'id'}


class GuardFail(Exception):
    pass


def _entries(corrections_path):
    return [e for e in load_corrections(corrections_path) if e['kind'] == 'text_replacement']


def _site_rows(conn, entry):
    """The resolved rows of an APPLIED entry: {table: [row key, ...]} for the rows carrying the replacement."""
    pat, new = re.compile(entry['match']), entry['replacement']
    cid, _ = _resolve(conn, entry, pat, new)
    rows = {'chunks': [cid], 'chunks_fts': [cid], 'passages': []}
    for pid, text in conn.execute('SELECT id, text FROM passages WHERE chunk_id = ? ORDER BY seq, id', (cid,)):
        if new in text or pat.search(text):
            rows['passages'].append(pid)
    return cid, rows


def _broken_span(entry, backup):
    """The pre-write text of the site: the backup's matched span (MECHANISM premise, R-CSK-6)."""
    pat = re.compile(entry['match'])
    for payload in (backup.get('rows') or {}).values():
        m = pat.search(payload.get('text') or '')
        if m:
            return m.group(0)
    raise GuardFail(f"{entry['id']}: the backup carries no text the entry's `match` finds")


def _restore(conn, entry, backup_path):
    """Put the pre-write state back at the resolved rows. Returns the rows restored, [(table, key)].
    Each row the backup names must land on exactly one existing resolved row of its table (else PHANTOM)."""
    backup = json.load(open(os.path.join(REPO, backup_path)))
    broken = _broken_span(entry, backup)
    new = entry['replacement']
    _, site = _site_rows(conn, entry)
    free = {t: list(v) for t, v in site.items()}
    restored = []
    for name in sorted((backup.get('rows') or {})):
        table = name.split(':')[0]
        if table not in free:
            raise GuardFail(f"{entry['id']}: backup row {name} names an unknown store")
        if not free[table]:
            raise GuardFail(f"{entry['id']}: PHANTOM — backup row {name} has no resolved {table} row to land on "
                            f"(resolved {site[table]})")
        key = free[table].pop(0)
        col = TABLE_KEY[table]
        text = conn.execute(f'SELECT text FROM {table} WHERE {col} = ?', (key,)).fetchone()
        if text is None or text[0].count(new) != 1:
            raise GuardFail(f"{entry['id']}: {table}.{col}={key} does not carry the replacement exactly once")
        cur = conn.execute(f'UPDATE {table} SET text = ? WHERE {col} = ?', (text[0].replace(new, broken), key))
        if cur.rowcount != 1:
            raise GuardFail(f"{entry['id']}: restoring {table}.{col}={key} hit {cur.rowcount} rows")
        restored.append((table, key))
    conn.commit()
    return restored


def _texts(conn, rows):
    return {(t, k): conn.execute(f'SELECT text FROM {t} WHERE {TABLE_KEY[t]} = ?', (k,)).fetchone()[0]
            for t, k in rows}


def _replay(db, corrections_path, verbose=False):
    buf = io.StringIO()
    rc = replay(db_path=db, corrections_path=corrections_path, apply=True, out=buf, verbose=verbose)
    return rc, buf.getvalue()


# ── cases ─────────────────────────────────────────────────────────────────

def case_resurrection(tmpdb, corrections_path=CORRECTIONS_PATH):
    live = sqlite3.connect(f'file:{DB_PATH}?mode=ro', uri=True)
    copy = sqlite3.connect(tmpdb)
    restored = []
    for e in _entries(corrections_path):
        if not e.get('backup'):
            raise GuardFail(f"{e['id']}: declares no backup — nothing to resurrect from")
        restored += _restore(copy, e, e['backup'])
    if not restored:
        raise GuardFail('harvest 0 — no row restored, the case proves nothing')
    before = _texts(copy, restored)
    want = _texts(live, restored)
    if before == want:
        raise GuardFail('restored state already equals live — the restore did nothing')
    copy.close()
    rc, out = _replay(tmpdb, corrections_path)
    if rc != 0:
        raise GuardFail(f'replay failed on the restored copy: {out.strip()[-200:]}')
    copy = sqlite3.connect(tmpdb)
    after = _texts(copy, restored)
    diffs = [k for k in want if after[k] != want[k]]
    live.close(); copy.close()
    if diffs:
        raise GuardFail(f'{len(diffs)} row(s) did not resurrect, first {diffs[0]}')
    return f'harvest {len(restored)} rows {restored}: restored to pre-write, replayed, equal to live'


def case_remint(tmpdb, corrections_path=CORRECTIONS_PATH):
    e = _entries(corrections_path)[0]
    conn = sqlite3.connect(tmpdb)
    old, site = _site_rows(conn, e)
    # move the chunk, its fts row and all its passages to NEW ids
    cols = 'alias, page_start, page_end, chapter, section, content_type, char_count, text'
    cur = conn.execute(f'INSERT INTO chunks ({cols}) SELECT {cols} FROM chunks WHERE id = ?', (old,))
    nid = cur.lastrowid
    fts_cols = [r[1] for r in conn.execute('PRAGMA table_info(chunks_fts)')]
    fc = ', '.join(fts_cols)
    conn.execute(f'INSERT INTO chunks_fts (rowid, {fc}) SELECT ?, {fc} FROM chunks_fts WHERE rowid = ?', (nid, old))
    pcols = [r[1] for r in conn.execute('PRAGMA table_info(passages)') if r[1] not in ('id', 'chunk_id')]
    pc = ', '.join(pcols)
    newp = []
    for (pid,) in conn.execute('SELECT id FROM passages WHERE chunk_id = ? ORDER BY seq, id', (old,)).fetchall():
        c2 = conn.execute(f'INSERT INTO passages (chunk_id, {pc}) SELECT ?, {pc} FROM passages WHERE id = ?',
                          (nid, pid))
        newp.append((pid, c2.lastrowid))
    conn.execute('DELETE FROM passages WHERE chunk_id = ?', (old,))
    conn.execute('DELETE FROM chunks_fts WHERE rowid = ?', (old,))
    conn.execute('DELETE FROM chunks WHERE id = ?', (old,))
    conn.commit()
    # pre-write state at the new rows; the site passage's embedding cleared so the re-embed is observable
    restored = _restore(conn, e, e['backup'])
    site_new = [k for t, k in restored if t == 'passages']
    for k in site_new:
        conn.execute('UPDATE passages SET embedding = NULL WHERE id = ?', (k,))
    conn.commit(); conn.close()
    rc, out = _replay(tmpdb, corrections_path)
    if rc != 0:
        raise GuardFail(f'replay failed after the re-mint: {out.strip()[-200:]}')
    if f'chunks.id={nid}' not in out:
        raise GuardFail(f'the replay did not resolve at the new chunk id {nid}')
    conn = sqlite3.connect(tmpdb)
    new = e['replacement']
    got = _texts(conn, [('chunks', nid), ('chunks_fts', nid)] + [('passages', k) for k in site_new])
    missing = [k for k, v in got.items() if new not in v]
    emb = [conn.execute('SELECT embedding FROM passages WHERE id = ?', (k,)).fetchone()[0] for k in site_new]
    conn.close()
    if missing:
        raise GuardFail(f'the replacement is missing from {missing}')
    if not site_new or any(v is None for v in emb):
        raise GuardFail('the corrected passage was not re-embedded')
    return (f'harvest 1 site: chunk {old}->{nid}, passages {newp}; resolved at the new ids, 3 copies read back '
            f'the replacement, {len(site_new)} passage re-embedded')


def case_idempotent(tmpdb, corrections_path=CORRECTIONS_PATH):
    rc, out = _replay(tmpdb, corrections_path, verbose=True)
    if rc != 0:
        raise GuardFail('second replay failed')
    changes = [l for l in out.splitlines() if l.startswith('    ') and ('1 replacement' in l or 're-embedded' in l)]
    resolved = [l for l in out.splitlines() if 'already applied (no change)' in l]
    if changes:
        raise GuardFail(f'{len(changes)} change(s) on a second run; first: {changes[0].strip()}')
    if not resolved:
        raise GuardFail('harvest 0 — the second replay reported no row at all')
    return f'harvest {len(resolved)} rows already applied, 0 changes'


def _counts(db):
    c = sqlite3.connect(db)
    out = tuple(c.execute(f'SELECT count(*) FROM {t}').fetchone()[0] for t in ('chunks', 'chunks_fts', 'passages'))
    c.close()
    return out


def case_fails_loud(tmpdb, corrections_path=CORRECTIONS_PATH):
    e = _entries(corrections_path)[0]
    msgs = []
    # (a) corrupted match, struck on a RESTORED copy (against a corrected index it lands in the idempotency branch)
    conn = sqlite3.connect(tmpdb)
    _restore(conn, e, e['backup'])
    conn.close()
    doc = json.load(open(corrections_path))
    doc['corrections'][0]['match'] += 'THIS_CANNOT_MATCH'
    with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False) as fh:
        json.dump(doc, fh); mutated = fh.name
    n0 = _counts(tmpdb)
    rc, out = _replay(tmpdb, mutated)
    os.unlink(mutated)
    if rc == 0 or 'FAILED' not in out:
        raise GuardFail('a corrupted match was accepted — the guard does NOT bite')
    msgs.append('corrupted match: exit 1')
    # (b) a second candidate chunk at the same alias and page, carrying the broken text
    conn = sqlite3.connect(tmpdb)
    cid, _ = _resolve(conn, e, re.compile(e['match']), e['replacement'])
    cols = 'alias, page_start, page_end, chapter, section, content_type, char_count, text'
    conn.execute(f'INSERT INTO chunks ({cols}) SELECT {cols} FROM chunks WHERE id = ?', (cid,))
    conn.commit(); conn.close()
    n1 = _counts(tmpdb)
    rc, out = _replay(tmpdb, corrections_path)
    if rc == 0 or 'FAILED' not in out or '2 candidate rows' not in out:
        raise GuardFail(f'a second candidate row was accepted: {out.strip()[-160:]}')
    if _counts(tmpdb) != n1:
        raise GuardFail('the failed run wrote rows')
    msgs.append('second candidate: exit 1, "2 candidate rows", nothing written')
    return 'harvest 2 mutants bit — ' + '; '.join(msgs)


CASES = [
    ('site-resurrection', case_resurrection, 'the ledger must REBUILD the hand-fix history at the resolved rows'),
    ('re-mint', case_remint, 'a re-ingest re-mints every id; the address must still find the site'),
    ('idempotent', case_idempotent, 'replay runs after every ingest; a second run must not double-apply'),
    ('fails-loud', case_fails_loud, 'a silent skip or a guessed site leaves a half-corrected index'),
]


def run_all(verbose=False, corrections_path=CORRECTIONS_PATH):
    if not os.path.exists(DB_PATH):
        print(f'ERROR: no index at {DB_PATH}', file=sys.stderr)
        return 1
    tmpdir = tempfile.mkdtemp(prefix='corr-guard-')
    passed = failed = 0
    try:
        for name, fn, why in CASES:
            tmpdb = os.path.join(tmpdir, f'{name}.db')
            shutil.copy(DB_PATH, tmpdb)
            try:
                ok, msg = True, fn(tmpdb, corrections_path)
            except GuardFail as exc:
                ok, msg = False, str(exc)
            except Exception as exc:
                ok, msg = False, f'EXCEPTION: {type(exc).__name__}: {exc}'
            print(f'  [{"PASS" if ok else "FAIL"}] {name:<18} {msg}')
            if verbose:
                print(f'          why: {why}')
            passed, failed = passed + bool(ok), failed + (not ok)
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)
    print(f'\n{passed} passed, {failed} failed')
    return 0 if failed == 0 else 1


if __name__ == '__main__':
    args = sys.argv[1:]
    cp = args[args.index('--corrections') + 1] if '--corrections' in args else CORRECTIONS_PATH
    sys.exit(run_all(verbose='--verbose' in args or '-v' in args, corrections_path=cp))
