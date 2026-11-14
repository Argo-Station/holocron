"""Order-invariance guard — a question's results do not depend on the order the index was built in (C-OHY-4).

Row ids are AUTOINCREMENT and re-minted by every ingest, so a rebuild changes the order passages and chunks
load in. Identical passages in two copies of a book (the fad trio, the folio pairs, the reprints) score
bit-for-bit equal, and before C-OHY-4 every score sort broke those ties by load order: the same question
could put a different copy, or a different page, in the top five after each rebuild. Laps 2 and 3 of O3
re-ingest, so their before/after measurements need this to hold.

The instrument: a temporary copy of the index whose chunks, passages, full-text rows and `pdfs` rows are
renumbered in REVERSE (so every table scan and every rowid tie runs backwards — what a re-ingest can do, at its
worst), then the same questions through every layer of the search path on both, compared with the row
ids stripped. A layer that differs when the layer beneath it agreed is where the order leaks in.

TOC rows are NOT renumbered: every TOC read is per book (`WHERE alias = ?`), and ingest writes a book's TOC in
its PDF outline order, so within a book a re-ingest reproduces that order exactly. Reversing it would model
something no re-ingest does, and `topic`'s pick among equal (level, page) entries — the first in outline order —
is itself a content-derived key.

  layers   bm25        api.bm25_search                  (api.py: the BM25 leg's ORDER BY)
           semantic    embed.semantic_search            (embed.py: the semantic leg's top-k)
           hybrid      api.search, mode hybrid          (api.py: the shipped fusion's sort — cc_fuse)
           rrf         api.rrf_fuse over the two legs   (api.py: rrf_fuse's sort — the kept alternative)
           boost       api.search, boost_tables, x3     (api.py: _apply_content_boost's three sorts)
           expanded    api.search_expanded              (api.py: search_expanded's sort)
           merge       cascade._weak_path_hits 'merge'  (cascade.py: the merge sort)
           cascade     cascade.retrieve_rule_for_query  (the rules-oracle's own call)
           topic       api.topic, every topic           (api.py: the topic FTS fallback's ORDER BY)

Questions: TIE PROBES — the opening of passages whose text is duplicated across books, chosen by a fixed hash
so the set never drifts — plus a handful of ordinary rules questions.

Run:
    python3 -m swrpg_index.tests.order_invariance              # the live index
    python3 -m swrpg_index.tests.order_invariance --db <copy>

It copies the index (~200 MB) into a temporary directory ($TMPDIR) and removes it afterwards. One embedder load.

RE-POINTED by ruling `oracle-o5-blend` (M-O5B-5, instrument norm 3): api.search's hybrid mode now fuses by
score (api.HYBRID_FUSION = 'cc'), so the `hybrid` layer measures cc_fuse's sort. KEPT: the claim — the hybrid
path's results do not depend on load order — and every layer as it was. The `rrf` layer is ADDED so rrf_fuse's
sort, which the `hybrid` layer measured until now and the lap keeps as the alternative, stays measured. DROPPED:
nothing.

MUTANT CHECK: set `embed.semantic_search`'s selection back to `np.argsort(-sims)[:limit]`, or drop the tie
columns from `api.bm25_search`'s ORDER BY: the `semantic` / `bm25` layer goes red and every layer above it
follows.
"""
import hashlib
import os
import shutil
import sqlite3
import sys
import tempfile

from swrpg_index import DB_PATH
import swrpg_index.api as api
import swrpg_index.cascade as cascade
import swrpg_index.embed as embed

N_TIE_PROBES = 16
NATURAL = [
    'How does the Force Rating advance?',
    'What does a stimpack heal?',
    'lightsaber critical injury table',
    'How many strain does a maneuver cost beyond the free one?',
    'What are the career skills of the Guardian?',
    'Sense Force power basic power',
    'How is soak calculated?',
    'What is the cost to upgrade a skill rank with experience?',
]
ID_KEYS = {'id', 'chunk_id', 'passage_id'}


def _strip(x):
    """A result with every row id removed, as a hashable, comparable value."""
    if isinstance(x, sqlite3.Row):
        x = dict(x)
    if isinstance(x, dict):
        return tuple(sorted((k, _strip(v)) for k, v in x.items() if k not in ID_KEYS))
    if isinstance(x, (list, tuple)):
        return tuple(_strip(v) for v in x)
    if isinstance(x, set):
        return tuple(sorted(_strip(v) for v in x))
    return x


def _fused(rows):
    return [(score, m['row']) for _, score, m in rows]


def permuted_copy(src, dst):
    """Copy `src` to `dst` and renumber its rows in reverse order."""
    shutil.copyfile(src, dst)
    c = sqlite3.connect(dst)
    c.execute('PRAGMA foreign_keys = OFF')
    (mc,) = c.execute('SELECT MAX(id) FROM chunks').fetchone()
    (mp,) = c.execute('SELECT MAX(id) FROM passages').fetchone()
    c.execute('UPDATE chunks SET id = -id')
    c.execute('UPDATE chunks SET id = ? + 1 + id', (mc,))
    c.execute('UPDATE passages SET id = -id, chunk_id = -chunk_id')
    c.execute('UPDATE passages SET id = ? + 1 + id, chunk_id = ? + 1 + chunk_id', (mp, mc))
    fts = c.execute('SELECT rowid, text, chapter, section, alias, page_start, page_end, content_type '
                    'FROM chunks_fts ORDER BY rowid DESC').fetchall()
    c.execute('DELETE FROM chunks_fts')
    c.executemany('INSERT INTO chunks_fts (rowid, text, chapter, section, alias, page_start, page_end, '
                  'content_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                  [(mc + 1 - r[0],) + tuple(r[1:]) for r in fts])
    pdfs = c.execute('SELECT * FROM pdfs ORDER BY rowid DESC').fetchall()
    c.execute('DELETE FROM pdfs')
    c.executemany(f'INSERT INTO pdfs VALUES ({",".join("?" * len(pdfs[0]))})', pdfs)
    c.commit()
    # The renumbering must be a pure permutation: same rows, reversed.
    (bad,) = c.execute('SELECT COUNT(*) FROM passages p LEFT JOIN chunks c ON c.id = p.chunk_id '
                       'WHERE c.id IS NULL OR c.alias != p.alias OR c.page_start != p.page_start').fetchone()
    (fbad,) = c.execute('SELECT COUNT(*) FROM chunks_fts f JOIN chunks c ON c.id = f.rowid '
                        'WHERE f.text IS NOT c.text OR f.alias IS NOT c.alias').fetchone()
    c.close()
    if bad or fbad:
        raise RuntimeError(f'permuted copy is not a permutation ({bad} orphan passages, {fbad} fts mismatches)')


def tie_probes(conn):
    """Openings of passages duplicated across books, picked by a fixed hash (the set never drifts)."""
    rows = conn.execute('SELECT text FROM passages GROUP BY text HAVING COUNT(DISTINCT alias) > 1').fetchall()
    texts = sorted((r[0] for r in rows), key=lambda t: hashlib.sha1(t.encode('utf-8')).hexdigest())
    out = []
    for t in texts:
        q = ' '.join(t.split())[:300]
        if len(api.content_tokens(q)) >= 5:
            out.append(q)
        if len(out) == N_TIE_PROBES:
            break
    return out


def layers(conn, q, emb):
    """{layer: stripped result} for one question on one index."""
    out = {}
    out['bm25'] = _strip(api.bm25_search(conn, api.fts_any(q), limit=40))
    out['semantic'] = _strip(api.semantic_search(conn, q, limit=40, embedder=emb))
    out['hybrid'] = _strip(api.search(conn, q, mode='hybrid', limit=20, embedder=emb))
    out['rrf'] = _strip(_fused(api.rrf_fuse(api.bm25_leg(conn, q, None, None, 40),
                                            api.semantic_search(conn, q, limit=40, embedder=emb), limit=40)))
    out['boost'] = _strip([api.search(conn, q, mode=m, limit=20, embedder=emb, boost_tables=True)
                           for m in ('bm25', 'semantic', 'hybrid')])
    variants = [q, ' '.join(sorted(api.content_tokens(q)))[:200]]
    out['expanded'] = _strip(api.search_expanded(conn, variants, limit=10, embedder=emb))
    raw = api.search(conn, q, limit=10, embedder=emb)
    raw_exp = api.search_expanded(conn, variants, limit=10, embedder=emb)
    was = cascade.WEAK_PATH_HITS
    cascade.WEAK_PATH_HITS = 'merge'
    try:
        out['merge'] = _strip(cascade._weak_path_hits(raw[:5], raw, raw_exp, raw_exp, 5))
    finally:
        cascade.WEAK_PATH_HITS = was
    out['cascade'] = _strip(cascade.retrieve_rule_for_query(conn, q, embedder=emb))
    return out


ORDER = ['bm25', 'semantic', 'hybrid', 'rrf', 'boost', 'expanded', 'merge', 'cascade']
BENEATH = {'bm25': [], 'semantic': [], 'hybrid': ['bm25', 'semantic'], 'rrf': ['bm25', 'semantic'],
           'boost': ['bm25', 'semantic'],
           'expanded': ['hybrid'], 'merge': ['hybrid', 'expanded'], 'cascade': ['hybrid', 'expanded']}


def run_all(db_path=DB_PATH, verbose=False):
    if not os.path.exists(db_path):
        print(f'ERROR: DB not built at {db_path}.', file=sys.stderr)
        return 1
    tmp = tempfile.mkdtemp(prefix='o3_order_')
    try:
        perm_path = os.path.join(tmp, 'permuted.db')
        permuted_copy(db_path, perm_path)
        a = sqlite3.connect(f'file:{db_path}?mode=ro', uri=True)
        b = sqlite3.connect(f'file:{perm_path}?mode=ro', uri=True)
        a.row_factory = b.row_factory = sqlite3.Row
        emb = embed.default_embedder()
        questions = tie_probes(a) + NATURAL
        differ = {k: [] for k in ORDER}
        leaks = {k: [] for k in ORDER}
        for i, q in enumerate(questions):
            la, lb = layers(a, q, emb), layers(b, q, emb)
            for k in ORDER:
                if la[k] != lb[k]:
                    differ[k].append(i)
                    if all(la[d] == lb[d] for d in BENEATH[k]):
                        leaks[k].append(i)
        names = [r['name'] for r in api.topics(a)]
        tdiff = [n for n in names if _strip(api.topic(a, n)) != _strip(api.topic(b, n))]
        a.close()
        b.close()
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    print(f'  {len(questions)} questions ({len(questions) - len(NATURAL)} tie probes, {len(NATURAL)} natural); '
          f'index vs the same index renumbered in reverse')
    failed = 0
    for k in ORDER:
        ok = not differ[k]
        failed += not ok
        leak = (f' — ORDER LEAKS IN HERE on {len(leaks[k])} (the layers beneath agreed)' if leaks[k] else
                (' — inherited from the layers beneath' if differ[k] else ''))
        print(f'  [{"PASS" if ok else "FAIL"}] {k:<9} {len(differ[k])}/{len(questions)} questions differ{leak}')
        if verbose and differ[k]:
            print(f'          questions {differ[k]}')
    ok = not tdiff
    failed += not ok
    print(f'  [{"PASS" if ok else "FAIL"}] {"topic":<9} {len(tdiff)}/{len(names)} topics differ'
          + (f' — the topic FTS fallback leaks order: {tdiff}' if tdiff else ''))
    print(f'\n{len(ORDER) + 1 - failed} passed, {failed} failed')
    return 0 if failed == 0 else 1


if __name__ == '__main__':
    argv = sys.argv[1:]
    db = argv[argv.index('--db') + 1] if '--db' in argv else DB_PATH
    sys.exit(run_all(db, verbose='--verbose' in argv or '-v' in argv))
