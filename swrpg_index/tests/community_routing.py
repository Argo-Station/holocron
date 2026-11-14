"""Community-index routing guard — the reSpecialized documents live in their own index, and nothing ranks the two
together (card respecialized-docs-index ADDENDUM 3, R-RDI-3-1..5).

The books' index (Docs/swrpg_index.db) and the community documents' (Docs/swrpg_community.db) share a schema and
nothing else. With the two in one file, 1,200 fan chunks moved every book's bm25 statistics and fan pages ranked above
the books on books questions (brief respecialized-docs-index-retrieval-drift). Cases:

  1. vocabulary        (R-RDI-3-1) every registry row's `index` is "books" (or absent) or "community"; every
                       `respec-*` row is community; no other row is (the guide `respecialized` stays books).
  2. router            (R-RDI-3-3) utils.db_path_for_alias sends a community alias to COMMUNITY_DB_PATH and a books
                       alias, or an alias the registry does not know, to DB_PATH.
  3. ingest-refuses    (R-RDI-3-2) run_ingest refuses a community alias aimed at the books file and a books alias
                       aimed at the community file, before opening either (both files' size+mtime unchanged).
  4. connection        (R-RDI-3-3/4) mcp_server._connection opens the books file by default, the community file for
                       a community alias or corpus="community", read-only, and refuses any other corpus word.
  5. never-together    (R-RDI-3-4) the three search tools with no alias return no community hit on corpus="books"
                       and only community hits on corpus="community"; an alias decides on its own.
  6. list-summary      (R-RDI-3-5) list_pdfs is the books rows (no `respec-` alias among them) plus EXACTLY ONE
                       entry `respec-*`, tier "community", whose count is the community index's row count.

Cases 5-6 need both index files; without the community file they print VOID and the run exits 2 (unmeasured,
never green).

Run:
    python3 -m swrpg_index.tests.community_routing

MUTANT CHECK: in mcp_server._connection, open DB_PATH whatever `_corpus` says → cases 4 and 5 go red; delete
`"index": "community"` from one respec row → case 1 goes red; drop the cross-index check in ingest.run_ingest →
case 3 goes red.
"""
import os
import sqlite3
import sys

from swrpg_index.utils import COMMUNITY_DB_PATH, DB_PATH, db_path_for_alias, index_of, load_config

QUERY = 'Assassin talent that adds to Critical Injury results'


def _stat(path):
    return (os.path.getsize(path), os.path.getmtime(path)) if os.path.exists(path) else None


def case_vocabulary():
    bad, wrong = [], []
    for s in load_config()['sources']:
        try:
            word = index_of(s)
        except ValueError as e:
            bad.append(str(e))
            continue
        if s['alias'].startswith('respec-') != (word == 'community'):
            wrong.append(f'{s["alias"]}={word}')
    if bad or wrong:
        return False, f'{len(bad)} outside the vocabulary, {len(wrong)} on the wrong side: ' + '; '.join((bad + wrong)[:5])
    n = sum(1 for s in load_config()['sources'] if s.get('index') == 'community')
    return True, f'{n} community rows, all respec-*; every other row books'


def case_router():
    cfg = load_config()
    comm = next((s['alias'] for s in cfg['sources'] if s.get('index') == 'community'), None)
    got = {'eote': db_path_for_alias('eote', cfg), 'respecialized': db_path_for_alias('respecialized', cfg),
           'no-such-alias': db_path_for_alias('no-such-alias', cfg)}
    if comm:
        got[comm] = db_path_for_alias(comm, cfg)
    want = {'eote': DB_PATH, 'respecialized': DB_PATH, 'no-such-alias': DB_PATH}
    if comm:
        want[comm] = COMMUNITY_DB_PATH
    ok = got == want and comm is not None
    return ok, (f'{comm} → community; eote, respecialized, an unknown alias → books' if ok
                else f'got {got}, want {want}')


def case_ingest_refuses():
    # NEVER aimed at the real index files: both index paths are swapped for empty temp stand-ins first, so a
    # mutant that drops the refusal writes into a temp file, not an index (a first version of this case wrote
    # a community row into the books copy under that mutant, 2026-10-20). open_db is stubbed too: reaching it
    # IS the failure, named here by assertion, and nothing is ingested anywhere.
    import tempfile
    from swrpg_index import ingest as ing, utils as ut
    from swrpg_index.ingest import IngestRefused, run_ingest
    cfg = load_config()
    comm = next(s['alias'] for s in cfg['sources'] if s.get('index') == 'community')
    real = (_stat(DB_PATH), _stat(COMMUNITY_DB_PATH))
    tmp = tempfile.mkdtemp(prefix='community_routing_')
    fake_books, fake_comm = os.path.join(tmp, 'books.db'), os.path.join(tmp, 'community.db')
    saved = (ut.DB_PATH, ut.COMMUNITY_DB_PATH, ing.DB_PATH, ing.COMMUNITY_DB_PATH, ing.open_db)

    class _Opened(Exception):
        pass

    def _no_open(path):
        raise _Opened(path)

    ut.DB_PATH = ing.DB_PATH = fake_books
    ut.COMMUNITY_DB_PATH = ing.COMMUNITY_DB_PATH = fake_comm
    ing.open_db = _no_open
    out = []
    try:
        for alias, target in ((comm, fake_books), ('eote', fake_comm)):
            try:
                run_ingest(alias=alias, db_path=target, verbose=False, auto_embed=False)
                out.append(f'{alias} → {os.path.basename(target)} was NOT refused')
            except IngestRefused:
                pass
            except _Opened:
                out.append(f'{alias} → {os.path.basename(target)} was NOT refused (the target was opened)')
            if os.path.exists(target):
                out.append(f'{os.path.basename(target)} was created')
    finally:
        ut.DB_PATH, ut.COMMUNITY_DB_PATH, ing.DB_PATH, ing.COMMUNITY_DB_PATH, ing.open_db = saved
        import shutil
        shutil.rmtree(tmp, ignore_errors=True)
    if (_stat(DB_PATH), _stat(COMMUNITY_DB_PATH)) != real:
        out.append('a REAL index file moved (size or mtime)')
    return (not out), ('both cross-index ingests refused before any file opened' if not out else '; '.join(out))


def _file_of(conn):
    return os.path.abspath(conn.execute('PRAGMA database_list').fetchone()[2])


def case_connection():
    from swrpg_index import mcp_server as m
    cfg = load_config()
    comm = next(s['alias'] for s in cfg['sources'] if s.get('index') == 'community')
    seen, out = {}, []
    for label, kw in (('default', {}), ('eote', {'alias': 'eote'}), ('corpus=books', {'corpus': 'books'}),
                      ('corpus=community', {'corpus': 'community'}), (comm, {'alias': comm}),
                      (comm + '+corpus=books', {'alias': comm, 'corpus': 'books'})):
        want = COMMUNITY_DB_PATH if ('community' in label or label.startswith(comm)) else DB_PATH
        if not os.path.exists(want):
            seen[label] = 'VOID'
            continue
        with m._connection(**kw) as conn:
            seen[label] = _file_of(conn)
            try:
                conn.execute('CREATE TABLE _rw_probe (x)')
                out.append(f'{label} opened read-WRITE')
            except sqlite3.OperationalError:
                pass
        if seen[label] != os.path.abspath(want):
            out.append(f'{label} opened {os.path.basename(seen[label])}')
    try:
        with m._connection(corpus='everything'):
            out.append('corpus="everything" was not refused')
    except ValueError:
        pass
    return (not out), ('each call opened its own index, read-only; an unknown corpus refused' if not out
                       else '; '.join(out))


def case_never_together():
    from swrpg_index import mcp_server as m
    comm = next(s['alias'] for s in load_config()['sources'] if s.get('index') == 'community')
    out = []
    calls = {
        'search': lambda **kw: m.search(QUERY, limit=8, **kw),
        'search_expanded': lambda **kw: m.search_expanded([QUERY, 'Lethal Blows talent'], limit=8, **kw),
        'retrieve_rule_for_query': lambda **kw: m.retrieve_rule_for_query(QUERY, limit=8, **kw)['hits'],
    }
    for name, call in calls.items():
        books = [h['alias'] for h in call(corpus='books')]
        community = [h['alias'] for h in call(corpus='community')]
        aimed = [h['alias'] for h in call(alias=comm)]
        if any(a.startswith('respec-') for a in books):
            out.append(f'{name} corpus=books returned {[a for a in books if a.startswith("respec-")][:3]}')
        if not community or not all(a.startswith('respec-') for a in community):
            out.append(f'{name} corpus=community returned {community[:4]}')
        if not aimed or set(aimed) != {comm}:
            out.append(f'{name} alias={comm} returned {sorted(set(aimed))[:4]}')
    return (not out), ('3 tools: books-only by default, community-only on corpus="community", an alias decides'
                       if not out else '; '.join(out))


def case_list_summary():
    from swrpg_index import mcp_server as m
    rows = m.list_pdfs()
    summary = [r for r in rows if r.get('tier') == 'community']
    books = [r for r in rows if r.get('tier') != 'community']
    leak = [r['alias'] for r in books if r['alias'].startswith('respec-')]
    c = sqlite3.connect(f'file:{COMMUNITY_DB_PATH}?mode=ro', uri=True)
    n = c.execute('SELECT COUNT(*) FROM pdfs').fetchone()[0]
    c.close()
    ok = (len(summary) == 1 and summary[0].get('alias') == 'respec-*' and summary[0].get('count') == n and not leak
          and rows[-1] is summary[0])
    return ok, (f'{len(books)} books rows + 1 summary entry (count {n})' if ok
                else f'summary entries {summary}, respec rows among books {leak[:3]}, community rows {n}')


def run_all():
    have_both = os.path.exists(DB_PATH) and os.path.exists(COMMUNITY_DB_PATH)
    cases = [('vocabulary', case_vocabulary), ('router', case_router), ('ingest-refuses', case_ingest_refuses),
             ('connection', case_connection)]
    if have_both:
        cases += [('never-together', case_never_together), ('list-summary', case_list_summary)]
    passed = failed = 0
    for name, fn in cases:
        try:
            ok, msg = fn()
        except Exception as e:
            ok, msg = False, f'EXCEPTION: {type(e).__name__}: {e}'
        print(f'  [{"PASS" if ok else "FAIL"}] {name:<16} {msg}')
        passed += ok
        failed += not ok
    if not have_both:
        print(f'  [VOID] never-together, list-summary — an index file is missing '
              f'({DB_PATH if not os.path.exists(DB_PATH) else COMMUNITY_DB_PATH})')
    print(f'\n{passed} passed, {failed} failed' + ('' if have_both else ', 2 VOID'))
    return 1 if failed else (0 if have_both else 2)


if __name__ == '__main__':
    sys.exit(run_all())
