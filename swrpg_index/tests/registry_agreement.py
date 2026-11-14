"""Registry agreement guard — one name per book, only the core rulebooks are core, and the index says so.

The oracle cites a hit's `book` and prefers a `tier: core` hit for a RAW question. Both fields come off the
index's `pdfs` row, and that row is written only at ingest — so a registry rename or a tier change can sit in
the code while every result still carries the old value (ruling `oracle-o3-hygiene`, M-OHY-1). Cases:

  1. one-name-per-duplicate  (C-OHY-1) every group of books whose passages are IDENTICAL, passage for passage,
                             carries one registry name — so the oracle cites a book the same way whichever copy
                             it found. A book reprinted INSIDE another (a folio inside a Beginner Game) is its
                             own book and is not a group.
  2. core-is-core-rulebooks  (C-OHY-2) classify_tier calls exactly the three core rulebooks, their copies and the
                             GM kits `core`: no sourcebook, card deck or fan compilation.
  3. index-agrees            (C-OHY-3) for every alias, `pdfs.name` is the registry name and `pdfs.tier` is
                             classify_tier(alias) — the two expressions ingest writes.
  4. sync-moves-no-content   (C-OHY-3) `sync-registry` on a temporary copy with rows set back restores case 3
                             and leaves the row counts and a content digest of chunks, passages (with their
                             embeddings), the full-text table, embeddings_meta and toc identical. The digest here
                             is this guard's own, not the sync's.

Run:
    python3 -m swrpg_index.tests.registry_agreement               # the live index (Docs/swrpg_index.db)
    python3 -m swrpg_index.tests.registry_agreement --db <copy>   # any index
    python3 -m swrpg_index.tests.registry_agreement --skip-sync   # cases 1-3 only (no temporary copy)

MUTANT CHECK (how to prove this guard still bites): on a copy, set one row back —
`UPDATE pdfs SET tier = 'core' WHERE alias = 'ships'` — and run with `--db <copy>`: case 3 goes red naming it.
Put 'ships' back into `utils._CORE_ALIASES` and case 2 goes red; give `folio-dao-jodh` its old name in
`Docs/pdf_sources.json` and case 1 goes red.
"""
import collections
import hashlib
import os
import shutil
import sqlite3
import sys
import tempfile

from swrpg_index import DB_PATH
from swrpg_index.utils import _GM_KITS, classify_tier, load_config

# C-OHY-2, as ruled: the three core rulebooks and their copies. The GM kits are core by `_GM_KITS`.
CORE_RULEBOOKS = {'eote', 'aor', 'fad', 'fad-ocr', 'fad-lite'}

# The mutant case 4 applies before syncing: every ruled row set back to its pre-lap value.
SET_BACK = {
    'fad-lite': ('Force and Destiny Core Rulebook', None),
    'folio-sarenda-v2': ('Folio — Sarenda (FaD, Pre-Gens variant)', None),
    'folio-dao-jodh': ('Folio — Dao Jodh (FaD, full-name variant)', None),
    'folio-tarast-voon': ('Folio — Tarast Voon (FaD, full-name variant)', None),
    'holocron': (None, 'core'), 'talent-index': (None, 'core'), 'adversary-cards': (None, 'core'),
    'ships': (None, 'core'), 'gadgets': (None, 'core'),
}

DIGEST_SQL = {
    'chunks': 'SELECT * FROM chunks ORDER BY id',
    'passages': 'SELECT * FROM passages ORDER BY id',
    'chunks_fts': 'SELECT rowid, * FROM chunks_fts ORDER BY rowid',
    'embeddings_meta': 'SELECT * FROM embeddings_meta ORDER BY alias',
    'toc': 'SELECT * FROM toc ORDER BY id',
    'pdfs (other columns)': 'SELECT alias, path, book_line, page_count, has_text, has_ocr, ingested_at '
                            'FROM pdfs ORDER BY alias',
}


def _sources():
    return {s['alias']: s for s in load_config()['sources']}


def case_one_name(conn, verbose=False):
    texts = collections.defaultdict(collections.Counter)
    for alias, text in conn.execute('SELECT alias, text FROM passages'):
        texts[alias][text] += 1
    groups = collections.defaultdict(list)
    for alias, ctr in texts.items():
        groups[frozenset(ctr.items())].append(alias)
    src = _sources()
    groups = [sorted(g) for g in groups.values() if len(g) > 1]
    bad = []
    for g in sorted(groups):
        names = {src[a].get('name', a) for a in g if a in src}
        if len(names) > 1:
            bad.append(f'{"/".join(g)}: {sorted(names)}')
    if verbose:
        for g in sorted(groups):
            print(f'          group {"/".join(g)}')
    if bad:
        return False, f'{len(bad)} duplicate group(s) under more than one name: ' + ' · '.join(bad)
    return True, f'{len(groups)} duplicate group(s), one name each'


def case_core(conn, verbose=False):
    core = {a for a in _sources() if classify_tier(a) == 'core'}
    want = CORE_RULEBOOKS | set(_GM_KITS)
    extra, missing = sorted(core - want), sorted(want - core)
    if extra or missing:
        return False, f'core has {len(extra)} extra {extra} and {len(missing)} missing {missing}'
    return True, f'core = {len(core)} aliases: {sorted(core)}'


def case_index_agrees(conn, verbose=False):
    src = _sources()
    have = {a: (n, t) for a, n, t in conn.execute('SELECT alias, name, tier FROM pdfs')}
    names, tiers = [], []
    for a in sorted(src):
        if a not in have:
            continue
        name, tier = have[a]
        if name != src[a].get('name', a):
            names.append(f'{a} {name!r}≠{src[a].get("name", a)!r}')
        if tier != classify_tier(a):
            tiers.append(f'{a} {tier}≠{classify_tier(a)}')
    unindexed = sorted(set(src) - set(have))
    if names or tiers:
        return False, (f'{len(names)} name(s) and {len(tiers)} tier(s) disagree: '
                       + ' · '.join(names + tiers))
    return True, (f'{len(have)} rows agree with the registry and classify_tier'
                  + (f' ({len(unindexed)} registry alias(es) not indexed: {unindexed})' if unindexed else ''))


def _digest(conn):
    out = {}
    for label, sql in DIGEST_SQL.items():
        h, n = hashlib.sha256(), 0
        for row in conn.execute(sql):
            n += 1
            h.update(repr(tuple(row)).encode('utf-8'))
        out[label] = (n, h.hexdigest()[:16])
    return out


def case_sync(conn, db_path, verbose=False):
    from swrpg_index.cli import sync_registry
    tmp = tempfile.mkdtemp(prefix='o3_sync_')
    try:
        copy = os.path.join(tmp, 'index.db')
        shutil.copyfile(db_path, copy)
        c = sqlite3.connect(copy)
        for a, (name, tier) in SET_BACK.items():
            if name is not None:
                c.execute('UPDATE pdfs SET name = ? WHERE alias = ?', (name, a))
            if tier is not None:
                c.execute('UPDATE pdfs SET tier = ? WHERE alias = ?', (tier, a))
        c.commit()
        before = _digest(c)
        red_ok, red_msg = case_index_agrees(c)
        c.close()
        if red_ok:
            return False, 'the set-back copy reads green on case 3 — the mutant did not bite'
        changes = sync_registry(copy, verbose=False)
        c = sqlite3.connect(copy)
        after = _digest(c)
        ok3, msg3 = case_index_agrees(c)
        c.close()
        moved = [t for t in before if before[t] != after[t]]
        if not ok3:
            return False, f'after sync case 3 still red: {msg3}'
        if moved:
            return False, f'sync moved content: {moved}'
        rows = ', '.join(f'{t} {n}' for t, (n, _) in after.items())
        return True, (f'set back {len(SET_BACK)} rows (red: {red_msg.split(":")[0]}); sync wrote {len(changes)}; '
                      f'case 3 green; unchanged: {rows}')
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def run_all(db_path=DB_PATH, skip_sync=False, verbose=False):
    if not os.path.exists(db_path):
        print(f'ERROR: DB not built at {db_path}.', file=sys.stderr)
        return 1
    conn = sqlite3.connect(f'file:{db_path}?mode=ro', uri=True)
    cases = [('one-name-per-duplicate', lambda: case_one_name(conn, verbose)),
             ('core-is-core-rulebooks', lambda: case_core(conn, verbose)),
             ('index-agrees', lambda: case_index_agrees(conn, verbose))]
    if not skip_sync:
        cases.append(('sync-moves-no-content', lambda: case_sync(conn, db_path, verbose)))
    passed = failed = 0
    for name, fn in cases:
        try:
            ok, msg = fn()
        except Exception as e:
            ok, msg = False, f'EXCEPTION: {type(e).__name__}: {e}'
        print(f'  [{"PASS" if ok else "FAIL"}] {name:<24} {msg}')
        passed += ok
        failed += not ok
    conn.close()
    print(f'\n{passed} passed, {failed} failed')
    return 0 if failed == 0 else 1


if __name__ == '__main__':
    argv = sys.argv[1:]
    db = argv[argv.index('--db') + 1] if '--db' in argv else DB_PATH
    sys.exit(run_all(db, skip_sync='--skip-sync' in argv, verbose='--verbose' in argv or '-v' in argv))
