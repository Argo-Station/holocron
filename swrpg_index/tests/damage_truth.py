"""Guard for ruling `oracle-o3-damage-truth` (C-ODT-1..6): every page says how many symbols it lost.

Reads the index (or --db), `.claude/agents/rules-oracle.md`, and the C-ODL-3a FALLBACK list in
Docs/audit_artifacts/oracle_o3_decode_leftovers_2026-09/lone_marks.md. Read-only; no PDF, no service.

  (i)    C-ODT-1   every chunk's served record (`text_quality.annotate`) carries `lost_glyphs`, equal to
                   `page_signals(text)`'s junk for an OCR chunk and 0 for a `verified_table` record; a page the index
                   holds no chunk for, and a record with no page, read `null`
  (ii)   C-ODT-2   the thresholds stand: JUNK_RUNS_MIN 8, GLYPH_LOSS_HOSTILE_SHARE 0.20 (R-OAL-9)
  (iii)  C-ODT-3   text_quality.FALLBACK_PAGES is exactly the C-ODL-3a FALLBACK list of lone_marks.md (R-ODLL-2);
                   each of its pages is served `page_hostile: true` and counts in its book's hostile share
  (iv)   C-ODT-4   the orphan rule keeps a lone line whose every non-space character is in the junk class, except
                   one made only of `¢` or only of `°` (bullets, ornaments: ruling `oracle-o3-damage-truth-reingest-
                   drift` ADDENDUM 1 ANSWER), and deletes every other line it matched before (the named cases);
                   utils' class is exactly text_quality._JUNK_RE's; the index carries lone lost-symbol lines (> 0: a
                   re-ingest happened) and no lone `¢`/`°` line
  (v)    C-ODT-5d  the oracle prompt names `lost_glyphs` in the hit shape and in the `text_quality` bullet
  (vi)   C-ODT-6   scripts/check_rules_service.py's judge fails a hit that lacks `lost_glyphs` (assert (e))

--bite runs the checks against in-process MUTANTS and FAILS unless each goes red: (i) with the stamp dropped,
(iii) with the fallback set emptied, (iv) with the exemption removed.

HARVEST: chunks checked, fallback pages checked, lone lost lines found. A zero is a failed run (instrument norm 5).

Run:
    python3 -m swrpg_index.tests.damage_truth [--db COPY] [--bite] [--verbose]
Exit 0 iff every check passes (and, with --bite, every mutant is caught) and the harvest is non-zero.
"""
import os
import re
import sqlite3
import sys

from swrpg_index import DB_PATH
from swrpg_index import text_quality as TQ
from swrpg_index import utils as U

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LONE_MARKS = os.path.join(ROOT, 'Docs', 'audit_artifacts', 'oracle_o3_decode_leftovers_2026-09', 'lone_marks.md')
PROMPT = os.path.join(ROOT, '.claude', 'agents', 'rules-oracle.md')
LOST_LINE_RE = re.compile(r'^[ \t]*([^\w\s]{1,2})[ \t]*$', re.MULTILINE)

# (text, expected cleaned text) — the orphan step's named cases (C-ODT-4).
ORPHAN_CASES = [
    ('spend\n@\nto recover', 'spend\n@\nto recover'),           # a lone lost symbol: kept
    ('fails with\n®®\nor', 'fails with\n®®\nor'),               # two: kept
    ('when\n£ ¢\nare rolled', 'when\n£ ¢\nare rolled'),         # two, spaced: kept
    ('Table 3\n§\nrow', 'Table 3\n§\nrow'),
    ('word\n@)\nword', 'word\n\nword'),                         # mixed with a bracket: deleted, as before
    ('word\n•\nword', 'word\n\nword'),                          # a bullet: deleted, as before
    ('word\n--\nword', 'word\n\nword'),                         # decoration: deleted, as before
    ('word\n.\nword', 'word\n\nword'),
    ('list:\n¢\nItem one', 'list:\n\nItem one'),               # a lone `¢` is a bullet: deleted, as before (Q3 → B)
    ('Tund\n°\nRenatasia', 'Tund\n\nRenatasia'),               # a lone `°` is a map dot / ornament: deleted, as before
    ('list:\n¢¢\nItem', 'list:\n\nItem'),
    ('spend\n¢@\nto', 'spend\n¢@\nto'),                         # mixed with a dice sign: kept
]


def junk_class():
    m = re.match(r'\[([^\]]+)\]', TQ._JUNK_RE.pattern)
    return set(m.group(1)) if m else set()


def fallback_list():
    """(alias, page) of every entry under the C-ODL-3a FALLBACK heading of lone_marks.md."""
    out, on = set(), False
    for line in open(LONE_MARKS, encoding='utf-8'):
        if line.startswith('## '):
            on = 'FALLBACK' in line
            continue
        m = on and re.match(r'- \*\*(\S+) corpus p\.(\d+)\*\*', line)
        if m:
            out.add((m.group(1), int(m.group(2))))
    return out


def check_stamp(conn, fails, verbose):
    n = 0
    bad = []
    for alias, ps, ct, text in conn.execute('SELECT alias, page_start, content_type, text FROM chunks'):
        rec = TQ.annotate(conn, {'alias': alias, 'page_start': ps, 'content_type': ct})
        want = 0 if ct == 'verified_table' else TQ.page_signals(text)[2]
        n += 1
        if 'lost_glyphs' not in rec:
            bad.append(f'{alias} p.{ps}: no `lost_glyphs` field')
        elif rec['lost_glyphs'] != want:
            bad.append(f'{alias} p.{ps} ({ct}): lost_glyphs {rec["lost_glyphs"]!r} != junk {want}')
    if bad:
        fails.append(f'(i) {len(bad)} of {n} chunk record(s) wrong; first: ' + '; '.join(bad[:3]))
    # a page with no chunk, and a record with no page
    alias, top = conn.execute('SELECT alias, MAX(page_end) FROM chunks GROUP BY alias LIMIT 1').fetchone()
    for rec in ({'alias': alias, 'page_start': top + 1000}, {'alias': alias, 'page_start': None}):
        TQ.annotate(conn, rec)
        if rec.get('lost_glyphs', 'ABSENT') is not None:
            fails.append(f'(i) {alias} page {rec["page_start"]!r} (no chunk): lost_glyphs '
                         f'{rec.get("lost_glyphs", "ABSENT")!r}, expected null')
    if verbose:
        print(f'  (i) {n} chunk records checked')
    return n


def check_fallback(conn, fails):
    want = fallback_list()
    have = set(getattr(TQ, 'FALLBACK_PAGES', ()))
    if not want:
        fails.append(f'(iii) no FALLBACK entries parsed from {LONE_MARKS}: the pin measures nothing')
    if have != want:
        fails.append(f'(iii) text_quality.FALLBACK_PAGES {sorted(have)} != lone_marks.md FALLBACK {sorted(want)}')
    c = TQ.census(conn)
    for alias, page in sorted(want):
        rec = TQ.annotate(conn, {'alias': alias, 'page_start': page})
        if rec.get('page_hostile') is not True:
            fails.append(f'(iii) {alias} corpus p.{page} is served page_hostile {rec.get("page_hostile")!r}, not true')
        if (alias, page) not in c.hostile_pages:
            fails.append(f'(iii) {alias} corpus p.{page} does not count in {alias}\'s hostile share')
    return len(want)


def check_orphans(conn, fails):
    if set(getattr(U, 'LOST_SYMBOL_CHARS', '')) != junk_class():
        fails.append(f'(iv) utils.LOST_SYMBOL_CHARS {getattr(U, "LOST_SYMBOL_CHARS", None)!r} != text_quality '
                     f'junk class {"".join(sorted(junk_class()))!r}')
    for text, want in ORPHAN_CASES:
        got = U.clean_page_text(text)
        if got != want:
            fails.append(f'(iv) clean_page_text({text!r}) = {got!r}, expected {want!r}')
    lone = 0
    for (text,) in conn.execute("SELECT text FROM chunks WHERE content_type != 'verified_table'"):
        for m in LOST_LINE_RE.finditer(text or ''):
            s = ''.join(m.group(1).split())
            if s and all(ch in junk_class() for ch in s):
                lone += 1
    if not lone:
        fails.append('(iv) the index carries 0 lone lost-symbol lines: the orphan rule deleted them all '
                     '(no re-ingest under C-ODT-4)')
    bullets = 0
    for (text,) in conn.execute("SELECT text FROM chunks WHERE content_type != 'verified_table'"):
        for m in LOST_LINE_RE.finditer(text or ''):
            s = ''.join(m.group(1).split())
            if s and (set(s) == {'¢'} or set(s) == {'°'}):
                bullets += 1
    if bullets:
        fails.append(f'(iv) the index carries {bullets} lone `¢`/`°` line(s): bullets and ornaments kept as lost '
                     f'symbols (ADDENDUM 1 ANSWER: deleted as before)')
    return lone


def check_prompt(fails):
    p = open(PROMPT, encoding='utf-8').read()
    shape = re.search(r'"hits": \[\{.*?\}, \.\.\.\]', p, re.S)
    if not shape or 'lost_glyphs' not in shape.group(0):
        fails.append('(v) the prompt\'s hit shape does not name `lost_glyphs`')
    bullet = re.search(r'- \*\*`text_quality`\*\*.*?(?=\n- \*\*)', p, re.S)
    if not bullet or 'lost_glyphs' not in bullet.group(0):
        fails.append('(v) the prompt\'s `text_quality` bullet does not name `lost_glyphs`')


def check_service_judge(fails):
    sys.path.insert(0, os.path.join(ROOT, 'scripts'))
    try:
        import check_rules_service as crs
    except Exception as e:  # noqa: BLE001 — mcp missing on a bare machine
        fails.append(f'(vi) scripts/check_rules_service.py did not import: {type(e).__name__}: {e}')
        return
    hit = {'alias': crs.NEEDLE_ALIAS, 'page_start': 1, 'printed_offset': crs.NEEDLE_OFFSET,
           'pagination': 'corpus', 'text_quality': 'clean', 'page_hostile': False, 'lost_glyphs': 0}
    ok, _ = crs.judge({'hits': [hit]})
    bare = dict(hit)
    bare.pop('lost_glyphs')
    red, _ = crs.judge({'hits': [bare]})
    if ok:
        fails.append(f'(vi) judge fails a complete hit: {ok}')
    if not any(f.startswith('(e)') for f in red):
        fails.append('(vi) judge passes a hit without `lost_glyphs`: assert (e) is missing')


def _checks(conn, verbose=False):
    fails = []
    TQ._CACHE.clear()
    n = check_stamp(conn, fails, verbose)
    if TQ.JUNK_RUNS_MIN != 8 or TQ.GLYPH_LOSS_HOSTILE_SHARE != 0.20:
        fails.append(f'(ii) thresholds moved: JUNK_RUNS_MIN {TQ.JUNK_RUNS_MIN}, '
                     f'GLYPH_LOSS_HOSTILE_SHARE {TQ.GLYPH_LOSS_HOSTILE_SHARE}')
    nf = check_fallback(conn, fails)
    lone = check_orphans(conn, fails)
    check_prompt(fails)
    check_service_judge(fails)
    return fails, n, nf, lone


def _bite(conn):
    """Each mutant must turn its leg red. Returns [(name, caught)]."""
    out = []
    orig_annotate, orig_fb, orig_repl = TQ.annotate, getattr(TQ, 'FALLBACK_PAGES', None), getattr(U, '_orphan_repl', None)

    def no_stamp(c, rec, alias=None):
        r = orig_annotate(c, rec, alias=alias)
        r.pop('lost_glyphs', None)
        return r
    TQ.annotate = no_stamp
    try:
        f, *_ = _checks(conn)
        out.append(('(i) stamp dropped', any(x.startswith('(i)') for x in f)))
    finally:
        TQ.annotate = orig_annotate
    TQ.FALLBACK_PAGES = frozenset()
    try:
        f, *_ = _checks(conn)
        out.append(('(iii) fallback set emptied', any(x.startswith('(iii)') for x in f)))
    finally:
        TQ.FALLBACK_PAGES = orig_fb
        TQ._CACHE.clear()
    U._orphan_repl = lambda m: ''
    try:
        f, *_ = _checks(conn)
        out.append(('(iv) exemption removed', any(x.startswith('(iv) clean_page_text') for x in f)))
    finally:
        U._orphan_repl = orig_repl
    return out


def run(db_path=DB_PATH, bite=False, verbose=False):
    conn = sqlite3.connect('file:%s?mode=ro' % db_path, uri=True)
    fails, n, nf, lone = _checks(conn, verbose)
    if bite:
        for name, caught in _bite(conn):
            print(f'  [bite] {name}: {"caught" if caught else "NOT CAUGHT"}')
            if not caught:
                fails.append(f'(bite) mutant "{name}" was not caught')
        TQ._CACHE.clear()
    conn.close()
    for f in fails:
        print(f'  [FAIL] {f}')
    print(f'\ndamage_truth: harvest {n} chunk record(s), {nf} fallback page(s), {lone} lone lost-symbol line(s) in the '
          f'index; {len(fails)} failure(s) — {"FAIL" if fails else "PASS"}')
    if not n or not nf:
        print('HARVEST 0 in a leg — a check aimed at no subject FAILS (norm 5)')
        return 1
    return 1 if fails else 0


if __name__ == '__main__':
    argv = sys.argv[1:]
    db = argv[argv.index('--db') + 1] if '--db' in argv else DB_PATH
    sys.exit(run(db_path=db, bite='--bite' in argv, verbose='--verbose' in argv or '-v' in argv))
