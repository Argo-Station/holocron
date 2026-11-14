"""Guard for the recall benchmark's scoring (ruling `oracle-recall-benchmark`, C-ORB-1..5, C-ORB-8, C-ORB-9).

Every number the benchmark reports is decided in `swrpg_index/eval/recall/common.py` (plus the sampler's
allocation and the control's check). This guard pins them on FIXTURES — no live index, no LLM:

  (1) family collapse   a fad-ocr / fad-lite hit counts for a fad site; eote-beginner is the eote family;
                        a different family on the same pages never counts
  (2) pagination        fad-beginner p.13 is NOT fad p.13 under the headline rule, and IS under the
                        family-only reading reported beside it
  (3) page overlap      touching ranges count, adjacent ones do not (both edges shown)
  (4) rank / RR         the first matching hit's 1-based rank; None when nothing matches
  (5) leakage           max_shared_run on known strings; the bar is 4
  (6) agreement         the round-trip rule on the pilot's own cases (a number set must match exactly)
  (7) Wilson            8/10 -> (0.490, 0.943); 0/0 -> (0, 0)
  (8) address           C-ORB-1's keys exactly, no id of any kind; whitespace-insensitive; stable site id
  (9) resolve           exact / anchor / unresolved on a fixture index (C-ORB-9)
 (10) sampler           on a fixture index: every exclusion counted by reason, the family floor, the tier
                        target, byte-identical output on a re-run with the same seed, different with another
 (11) control check     degrade.check passes a real drop and FAILS a flat one (the bite's own bite)
 (12) answer heuristic  thin answers are not checked; a full answer is found in a snippet
 (13) CITE parser       a registry title with its own parentheses parses; `(source: unverified)` never
                        swallows the next citation; printed fad p.94 -> corpus 97 via the one converter
 (14) answer-bearing    C-OBA-5's classes in their fixed order (SAME-BOOK > REPRINT > CONFLICT > LOSS;
                        book = pagination group, line = family); a `conflicts` never carries; a fourth
                        verdict raises; answer-bearing@5's numerator; C-OBA-7's probe classes; the
                        controls' pairing (ruling `oracle-o2c-answer-bearing`)

HARVEST: the number of checks run. Zero is a failed run (instrument norm 5).

Run:
    .venv/bin/python -m swrpg_index.tests.recall_scoring [--verbose]
Exit 0 iff every check passes and the harvest is non-zero.
"""
import io
import json
import os
import sqlite3
import sys
import tempfile
from contextlib import redirect_stdout

from swrpg_index.eval.recall import common as C
from swrpg_index.eval.recall import degrade as D
from swrpg_index.eval.recall import sample as S

VERBOSE = '--verbose' in sys.argv
RESULTS = []


def check(name, ok, detail=None):
    RESULTS.append((name, bool(ok)))
    if VERBOSE or not ok:
        print(f"{'✓' if ok else '✗'} {name}" + ('' if ok else f'   got: {detail!r}'))


def site(alias, ps, pe=None):
    return {'alias': alias, 'family': C.family_of(alias), 'corpus_page_start': ps,
            'corpus_page_end': ps if pe is None else pe}


def hit(alias, ps, pe=None):
    return {'alias': alias, 'page_start': ps, 'page_end': ps if pe is None else pe}


def fixture_db(path):
    conn = sqlite3.connect(path)
    conn.executescript('''
      CREATE TABLE pdfs (alias TEXT PRIMARY KEY, tier TEXT);
      CREATE TABLE chunks (id INTEGER PRIMARY KEY, alias TEXT, page_start INT, page_end INT,
                           content_type TEXT, text TEXT);
      CREATE TABLE passages (id INTEGER PRIMARY KEY, chunk_id INT, alias TEXT, page_start INT,
                             page_end INT, seq INT, content_type TEXT, text TEXT);
    ''')
    books = {'fad': 'core', 'fad-ocr': 'core', 'eote': 'core', 'ships': 'core',
             'eote-beginner': 'beginner', 'tiny': 'supplement'}
    conn.executemany('INSERT INTO pdfs VALUES (?,?)', list(books.items()))
    pid = 0

    def put(alias, page, text, ctype='rule', seq=0):
        nonlocal pid
        pid += 1
        conn.execute('INSERT INTO chunks VALUES (?,?,?,?,?,?)', (pid, alias, page, page, ctype, text))
        conn.execute('INSERT INTO passages VALUES (?,?,?,?,?,?,?,?)',
                     (pid, pid, alias, page, page, seq, ctype, text))
    for p in range(1, 21):
        body = f'Fad page {p}. ' + 'The Seeker talent grants a Force user insight into the galaxy. ' * 5
        put('fad', p, body)
        put('fad-ocr', p, body)                         # byte-identical copy -> duplicate_text
    for p in range(1, 31):
        put('eote', p, f'Eote page {p}. ' + 'A smuggler pays the Hutt a cut of every run. ' * 6)
    for p in range(1, 9):
        put('ships', p, f'Ships page {p}. ' + 'The YT-1300 carries a hyperdrive class 2 backup. ' * 6)
    for p in range(1, 4):
        put('eote-beginner', p, f'Beginner page {p}. ' + 'Roll the dice and count the symbols. ' * 7)
    put('tiny', 1, 'Too short to ask about.')           # short
    put('tiny', 2, 'Contents ' * 40, ctype='toc')        # toc
    put('tiny', 3, 'Verified table ' * 30, ctype='verified_table')
    for p in range(4, 7):
        put('tiny', p, f'Tiny page {p}. ' + 'A rare crystal sells for 1,000 credits in the Outer Rim. ' * 5)
    conn.commit()
    return conn


def main():
    # (1) family collapse
    fad = site('fad', 100)
    check('1a fad-ocr hit counts for a fad site', C.hit_matches(fad, hit('fad-ocr', 100)))
    check('1b fad-lite hit counts for a fad site', C.hit_matches(fad, hit('fad-lite', 100)))
    check('1c eote-beginner is the eote family', C.family_of('eote-beginner') == 'eote')
    check('1d another family on the same page does not count', not C.hit_matches(fad, hit('eote', 100)))
    check('1e a -gm book is its own family', C.family_of('fad-gm') == 'fad-gm'
          and not C.hit_matches(fad, hit('fad-gm', 100)))

    # (2) pagination
    check('2a fad-beginner p100 is not fad p100 (headline rule)', not C.hit_matches(fad, hit('fad-beginner', 100)))
    check('2b ...but is under the family-only reading', C.hit_matches(fad, hit('fad-beginner', 100), pagination=False))
    check('2c fad-ocr and fad share pagination', C.pagination_of('fad-ocr') == C.pagination_of('fad') == 'fad')

    # (3) overlap, both edges
    s = site('eote', 10, 12)
    check('3a touching at the start counts', C.hit_matches(s, hit('eote', 8, 10)))
    check('3b touching at the end counts', C.hit_matches(s, hit('eote', 12, 14)))
    check('3c adjacent before does not count', not C.hit_matches(s, hit('eote', 9)))
    check('3d adjacent after does not count', not C.hit_matches(s, hit('eote', 13)))
    check('3e inside counts', C.hit_matches(s, hit('eote', 11)))

    # (4) rank
    hits = [hit('eote', 50), hit('fad-beginner', 100), hit('fad-lite', 99, 100), hit('fad', 100)]
    check('4a first matching rank is 3', C.first_hit_rank(fad, hits) == 3, C.first_hit_rank(fad, hits))
    check('4b family-only rank is 2', C.first_hit_rank(fad, hits, pagination=False) == 2)
    check('4c no match -> None', C.first_hit_rank(site('ships', 1), hits) is None)

    # (5) leakage
    passage = 'The character must make a Hard Athletics check or fall from the skiff.'
    check('5a a 4-word copy measures 4',
          C.max_shared_run('Does he make a Hard Athletics roll?', passage) == 4,
          C.max_shared_run('Does he make a Hard Athletics roll?', passage))
    check('5b a paraphrase measures under the bar',
          C.max_shared_run('What happens to someone who slips off the cargo sled?', passage) < C.LEAKAGE_BAR)
    check('5c case and punctuation are folded', C.max_shared_run('HARD, ATHLETICS CHECK!', passage) == 3)
    check('5d the bar is 4', C.LEAKAGE_BAR == 4)

    # (6) agreement (the pilot's own cases)
    check('6a a repeated number agrees', C.answers_agree('3 (Pierce 3)', '3')[0])
    check('6b a dropped number disagrees', not C.answers_agree('1 rank in Charm or Deception', 'Charm or Deception')[0])
    check('6c NOT_ANSWERABLE disagrees', not C.answers_agree('1', 'NOT_ANSWERABLE')[0])
    check('6d number words fold to digits', C.answers_agree('Ten wounds', '10 wounds')[0])
    check('6e different numbers disagree', not C.answers_agree('500 credits', '5,000 credits')[0])
    check('6f comma thousands fold', C.answers_agree('100,000 credits', '100000 credits')[0])
    check('6g same words agree', C.answers_agree('Viceroy Cray Linlok', 'Viceroy Cray Linlok')[0])
    check('6h unrelated words disagree', not C.answers_agree('Nomi Sunrider', 'Exar Kun')[0])

    # (7) Wilson
    lo, hi = C.wilson(8, 10)
    check('7a Wilson 8/10 = (0.490, 0.943)', abs(lo - 0.4902) < 5e-4 and abs(hi - 0.9433) < 5e-4, (lo, hi))
    check('7b Wilson 0/0 = (0, 0)', C.wilson(0, 0) == (0.0, 0.0))

    # (8) address
    a1 = C.address('fad-ocr', 5, 6, '  Some   passage\ntext here ')
    a2 = C.address('fad-ocr', 5, 6, 'Some passage text here')
    check('8a exactly the C-ORB-1 keys', set(a1) == {'alias', 'family', 'corpus_page_start', 'corpus_page_end',
                                                     'anchor', 'anchor_sha1'}, sorted(a1))
    check('8b whitespace-insensitive', a1 == a2)
    check('8c family is the canonical alias', a1['family'] == 'fad')
    check('8d site id is stable and address-derived', C.site_id(a1) == C.site_id(a2) and len(C.site_id(a1)) == 12)

    with tempfile.TemporaryDirectory() as tmp:
        db = os.path.join(tmp, 'fixture.db')
        conn = fixture_db(db)

        # (9) resolve
        t = conn.execute("SELECT text FROM passages WHERE alias='eote' AND page_start=3").fetchone()[0]
        s9 = C.address('eote', 3, 3, t)
        check('9a exact', C.resolve(conn, s9) == 'exact')
        conn.execute("UPDATE passages SET text = text || ' Errata.' WHERE alias='eote' AND page_start=3")
        check('9b anchor (text changed, first 80 chars survive)', C.resolve(conn, s9) == 'anchor')
        check('9c unresolved (page gone)', C.resolve(conn, dict(s9, corpus_page_start=99, corpus_page_end=99))
              == 'unresolved')
        conn.rollback()
        conn.close()

        # (10) sampler
        ro = S.open_ro(db)
        pool, excl = S.eligible_pool(ro)
        check('10a exclusions counted by reason',
              excl == {'content_type:toc': 1, 'content_type:verified_table': 1, 'short(<200)': 1,
                       'duplicate_text': 20}, dict(excl))
        check('10b no fad-ocr duplicate enters the pool', not any(p['alias'] == 'fad-ocr' for p in pool))
        chosen, plan = S.allocate(pool, {'core': 20, 'beginner': 1, 'supplement': 1}, seed=7)
        fams = plan['core']['families']
        check('10c core target met exactly', sum(f['sampled'] for f in fams.values()) == 20, fams)
        check('10d every family gets its floor', all(f['sampled'] >= min(6, f['eligible']) for f in fams.values()),
              fams)
        check('10e a family smaller than the floor gives all it has',
              plan['beginner']['families']['eote']['sampled'] == 3, plan['beginner'])
        check('10f remainder goes proportionally (eote 30 > fad 20 > ships 8)',
              fams['eote']['sampled'] >= fams['fad']['sampled'] >= fams['ships']['sampled'], fams)
        outs = []
        for seed in (7, 7, 8):
            path = os.path.join(tmp, f'sample_{len(outs)}.jsonl')
            with redirect_stdout(io.StringIO()):
                S.main(['--db', db, '--seed', str(seed), '--per-tier', 'core=20,beginner=1,supplement=1',
                        '--out', path])
            outs.append(open(path, 'rb').read())
        check('10g same seed -> byte-identical file', outs[0] == outs[1])
        check('10h another seed -> a different sample', outs[0] != outs[2])
        rows = [json.loads(l) for l in outs[0].decode().splitlines()]
        check('10i no id of any kind is stored',
              not any(k in r for r in rows for k in ('id', 'chunk_id', 'passage_id', '_seq')))
        check('10j every site carries its stratum and page_hostile',
              all('stratum' in r and 'page_hostile' in r for r in rows))
        ro.close()

        # (11) the control's own check bites
        def run_json(path, rate, rows):
            json.dump({'summary': {'overall': {'rate': rate}}, 'rows': rows}, open(path, 'w'))
        ids = os.path.join(tmp, 'ids.txt')
        open(ids, 'w').write('a\nb\n')
        base = os.path.join(tmp, 'base.json')
        run_json(base, 0.60, [])
        good = os.path.join(tmp, 'good.json')
        run_json(good, 0.40, [{'site': 'a', 'hit5': False}, {'site': 'b', 'hit5': False}])
        flat = os.path.join(tmp, 'flat.json')
        run_json(flat, 0.58, [{'site': 'a', 'hit5': True}, {'site': 'b', 'hit5': False}])
        with redirect_stdout(io.StringIO()):
            g, f = D.check(base, good, ids), D.check(base, flat, ids)
        check('11a a real drop passes', g == 0, g)
        check('11b a flat control FAILS', f == 1, f)

    # (12) the answer-elsewhere heuristic
    check('12a a thin answer is not checked', C.answer_in_text('Human', 'Human') is None)
    check('12b a full answer is found', C.answer_in_text('500 credits', 'Each PC starts with 500 credits.') is True)
    check('12c a wrong number is not found', C.answer_in_text('500 credits', 'starts with 5,000 credits') is False)

    # (13) the oracle arm's citation parser (CITE)
    from swrpg_index.eval.recall import oracle_arm as O
    idx = {O._norm_title('Heroes on Both Sides (community, v2.0)'): {'hobs'},
           O._norm_title('Star Wars: Force and Destiny Core Rulebook'): {'fad', 'fad-ocr'}}
    cs = O.citations('x (source: Heroes on Both Sides (community, v2.0) corpus p.120 — printed page uncalibrated)', idx)
    check('13a a title with its own parentheses parses', [(c['alias'], c['corpus']) for c in cs] == [('hobs', [120, 120])],
          cs)
    cs = O.citations('(source: unverified) and later (source: Star Wars: Force and Destiny Core Rulebook p.94)', idx)
    check('13b unverified is not glued to the next citation',
          sorted(c['alias'] for c in cs) == ['fad', 'fad-ocr'] and cs[0]['corpus'] == [97, 97], cs)

    # (14) answer-bearing@5 (ruling `oracle-o2c-answer-bearing`, C-OBA-4/5/6/7)
    def pg(alias, verdict):
        return {'alias': alias, 'verdict': verdict}
    ab = site('aor-beginner', 36)
    check('14a SAME-BOOK outranks REPRINT (own book carries, another book carries too)',
          C.classify_miss(ab, [pg('eote', 'carries'), pg('aor-beginner', 'carries')]) == ('SAME-BOOK', None),
          C.classify_miss(ab, [pg('eote', 'carries'), pg('aor-beginner', 'carries')]))
    check('14b a beginner box reprinted in its own core is an IN-LINE reprint, not the same book',
          C.classify_miss(ab, [pg('aor', 'carries')]) == ('REPRINT', 'in-line'),
          C.classify_miss(ab, [pg('aor', 'carries')]))
    check('14c another line carrying is a CROSS-LINE reprint',
          C.classify_miss(ab, [pg('eote', 'carries'), pg('aor', 'absent')]) == ('REPRINT', 'cross-line'),
          C.classify_miss(ab, [pg('eote', 'carries'), pg('aor', 'absent')]))
    check('14d in-line wins when both lines carry',
          C.classify_miss(ab, [pg('eote', 'carries'), pg('aor', 'carries')]) == ('REPRINT', 'in-line'))
    check('14e a conflicts never carries (own book conflicting is CONFLICT, not SAME-BOOK)',
          C.classify_miss(ab, [pg('aor-beginner', 'conflicts'), pg('eote', 'absent')]) == ('CONFLICT', None),
          C.classify_miss(ab, [pg('aor-beginner', 'conflicts'), pg('eote', 'absent')]))
    check('14f a carrying page outranks a conflicting one',
          C.classify_miss(ab, [pg('aor', 'conflicts'), pg('eote', 'carries')]) == ('REPRINT', 'cross-line'))
    check('14g every page absent is LOSS', C.classify_miss(ab, [pg('aor', 'absent')] * 5) == ('LOSS', None))
    check('14h an unread page (None) neither carries nor conflicts',
          C.classify_miss(ab, [pg('aor-beginner', None), pg('aor', 'absent')]) == ('LOSS', None))
    fs = site('fad', 97)
    check('14i fad-ocr is the SAME BOOK as fad (pagination group)',
          C.classify_miss(fs, [pg('fad-ocr', 'carries')]) == ('SAME-BOOK', None))
    check('14j fad-beginner is another book of the fad line',
          C.classify_miss(fs, [pg('fad-beginner', 'carries')]) == ('REPRINT', 'in-line'))
    try:
        C.classify_miss(ab, [pg('aor', 'partial')])
        raised = False
    except ValueError:
        raised = True
    check('14k a fourth verdict value raises (C-OBA-4 is a durable vocabulary)', raised)
    check('14l answer-bearing@5 counts HIT, SAME-BOOK, REPRINT and nothing else',
          [C.answer_bearing(k) for k in ('HIT',) + C.MISS_CLASSES] == [True, True, True, False, False])
    check('14m a thin key is UNPROBED, never guessed',
          C.probe_class('Human', True) == 'UNPROBED' and C.key_is_thin('4'))
    check('14n a probed key: hit -> REACHABLE, miss -> UNREACHABLE',
          C.probe_class('Three stimpacks per day', True) == 'REACHABLE'
          and C.probe_class('Three stimpacks per day', False) == 'UNREACHABLE')

    from swrpg_index.eval.recall import answer_bearing as AB

    class _Pages(object):
        def text(self, alias, ps, pe):
            return f'{alias} {ps}'
    fx_sites, fx_rows = {}, []
    for i, (alias, tier) in enumerate([('eote', 'core'), ('aor', 'core'), ('soldier', 'supplement'),
                                       ('commander', 'supplement'), ('hobs', 'advanced'), ('fad', 'advanced'),
                                       ('eote-beginner', 'beginner'), ('aor-beginner', 'beginner')]):
        sid = f'fx{i:02d}'
        fx_sites[sid] = dict(site(alias, 10 + i), site=sid, tier=tier, question=f'q{i}', answer=f'a{i}')
        fx_rows.append({'site': sid, 'tier': tier, 'hit5': True, 'rank': 2,
                        'top': [['eote', 1, 1], [alias, 10 + i, 10 + i]]})
    pos, neg = AB.controls(fx_rows, fx_sites, _Pages())
    check('14o the positive control is judged on each site\'s own matched page',
          all(p['alias'] == fx_sites[p['site']]['alias'] and p['pages'][0] == fx_sites[p['site']]['corpus_page_start']
              for p in pos) and len(pos) == 8, [(p['site'], p['alias']) for p in pos])
    check('14p every negative pair is another book AND another line, and never its own site',
          len(neg) == 8 and all(C.book_of(p['alias']) != C.book_of(fx_sites[p['site']]['alias'])
                                and C.line_of(p['alias']) != fx_sites[p['site']]['family']
                                and p['pair_with'] != p['site'] for p in neg),
          [(p['site'], p['alias'], p['pair_with']) for p in neg])
    check('14q the judge message carries no book, page, rank or control marker',
          AB.message('Q?', 'A.', 'TEXT') == 'QUESTION:\nQ?\n\nEXPECTED ANSWER:\nA.\n\nPAGE TEXT:\nTEXT')

    passed = sum(1 for _, ok in RESULTS if ok)
    print(f'recall_scoring: {passed}/{len(RESULTS)} checks pass')
    print(f'HARVEST: {len(RESULTS)} checks run' + (' — ZERO IS A FAILED RUN' if not RESULTS else ''))
    return 0 if RESULTS and passed == len(RESULTS) else 1


if __name__ == '__main__':
    sys.exit(main())
