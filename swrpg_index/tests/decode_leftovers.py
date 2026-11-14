"""Guard for ruling `oracle-o3-decode-leftovers` (C-ODL-1..5): what the two decodes left behind stays cleaned up.

Reads the index (or --db), Docs/pdf_sources.json, the OCR caches, and — for (iv)/(v) — the dice-marks books' PDFs and
their marks cache (Docs/dice_marks/, gitignored; SWRPG_DICE_MARKS). Read-only.

  (i)    junk class   ingest.OCR_JUNK_CHARS is exactly the character class of text_quality._JUNK_RE
  (ii)   C-ODL-1      no junk left in the `[OCR]` halves of a `text_decode` book: none in a single-page chunk's
                      half (ii-a), and no junk-bearing OCR cache line verbatim in any chunk (ii-b; merged chunks)
  (iii)  C-ODL-1      every word (4+ letters) of each such page's OCR cache text, junk removed and cleaned as the ingest
                      cleans, is still in its chunk's `[OCR]` half: the half keeps its words (a dropped half FAILS)
  (iv)   C-ODL-2      the ruling's named pages decode as ruled: eote corpus p.19 "represented by [BO] in text", aor p.28
                      "die [BO] is added", eote p.226's eight "Easy ([DI])" rows and all 28 dice-bearing cells count-
                      exact against Docs/rules_tables/eote_p217_critical-injury-result.json, eote p.245 a line that
                      reads exactly "[TH] or [DE]"; eote p.68 a line that reads exactly "Add [BO]" (C-ODL-3a), aor
                      p.316 "Easy ([DI])" and eote p.226's six "Hard ([DI][DI][DI])" rows (C-ODL-3b);
                      eote p.253's dice lines equal the sequence accepted at `dice-render-decode` ACCEPTANCE 5
  (v)    C-ODL-2/3    whole book, eote and aor: no token directly followed or preceded by a letter or digit (glue 0),
                      and every mark that claims anything is written (placed + unalignable = marks after exclusion):
                      the whitespace-only marks included (C-ODL-3)
  (vi)   C-ODL-4      the five books read `calibrated`, `to_printed` returns Jason's number for each of his numbered
                      readings, and each carries `page_offset_provenance.earned_by == "jason-reading"`
  (vii)  C-ODL-5      golden `critical-injury-table` expects status [none, weak]

--bite runs the checks against in-process MUTANTS and FAILS unless each goes red: (ii) with junk put back into every
`[OCR]` half, (iii) with every `[OCR]` half dropped, (iv)/(v) with C-DRD-2a's any-overlap claim restored, (iv) with
C-ODL-3a's row placement switched off.
--no-pdf skips (iv)/(v) (a machine without the PDFs or the marks cache) and SAYS so.

HARVEST: `[OCR]` chunks checked, OCR words checked, dice pages decoded. A zero is a failed run (instrument norm 5).

IT EXITS BY REPORT (ruling `oracle-o7` C-O7H-1, B-932): a book whose marks cache is refused (absent, as in a fresh
worktree without the `Docs/dice_marks/` copy, or stamped for another tree) is a (iv)/(v) `[FAIL]` naming the refusal,
and the run goes on to its summary and exits 1 — it used to die there by `MarksRefused` traceback.
--ocr-cache DIR reads the OCR caches from DIR, and SWRPG_DICE_MARKS=DIR the marks caches: an empty DIR injects the
absence for a bite; the real copies are never moved.

Run:
    python3 -m swrpg_index.tests.decode_leftovers [--db COPY] [--ocr-cache DIR] [--no-pdf] [--bite] [--verbose]
Exit 0 iff every check passes (and, with --bite, every mutant is caught) and the harvest is non-zero.
"""
import collections
import json
import os
import re
import sqlite3
import sys

from swrpg_index import DB_PATH
from swrpg_index import dice_marks as dm
from swrpg_index import ingest
from swrpg_index import pdf_pages
from swrpg_index import text_quality
from swrpg_index.glyph_decode import TOKENS
from swrpg_index.utils import CONFIG_PATH, SCRIPT_DIR, clean_page_text, load_config, resolve_path

MARKER = '\n[OCR]\n'
WORD = re.compile(r'[A-Za-z]{4,}')
TOK = '(?:' + '|'.join(re.escape(t) for t in TOKENS) + ')'
GLUE_AFTER, GLUE_BEFORE = re.compile(TOK + r'[A-Za-z0-9]'), re.compile(r'[A-Za-z0-9]' + TOK)
DI = re.compile(r'\[DI\]')
FIVE = ('separatists', 'collapse', 'spy', 'seeker', 'species-guide')
# eote corpus p.253's dice lines as `dice-render-decode` ACCEPTANCE 5 accepted them (0 over RAW, 17 exact).
P253_ACCEPTED = [1, 1, 1, 1, 1, 1, 2, 2, 2, 3, 2, 3, 3, 3, 4, 4, 3, 1, 4]
# (alias, corpus page, needle, whole_line). p.245's needle is a WHOLE line: "[TH] or [DE]" is also a substring of
# the page's "[TH][TH] or [DE]" row, so as a substring it would pass at base (measured).
NAMED = [('eote', 19, 'represented by [BO] in text', False), ('aor', 28, 'die [BO] is added', False),
         ('eote', 245, '[TH] or [DE]', True),
         # C-ODL-3a (ruling `oracle-o3-decode-leftovers-lone-marks`): the talent line's die on its own row, not after
         # "Strike" on the line below; C-ODL-3b: a lone die inside the parenthesis it follows.
         ('eote', 68, 'Add [BO]', True), ('aor', 316, 'Easy ([DI])', False)]


def junk_class():
    m = re.match(r'\[([^\]]+)\]', text_quality._JUNK_RE.pattern)
    return set(m.group(1)) if m else set()


def ocr_half(text):
    i = text.find(MARKER)
    return None if i < 0 else text[i + len(MARKER):]


def decoded_aliases(cfg):
    return [s['alias'] for s in cfg['sources'] if s.get('text_decode')]


def ocr_rows(conn, aliases):
    return [(a, ps, pe, t) for a in aliases for ps, pe, t in conn.execute(
        'SELECT page_start, page_end, text FROM chunks WHERE alias = ? ORDER BY page_start', (a,))]


def check_junk(rows, fails):
    """(ii) in two legs, because a chunk that MERGES short pages joins them with a blank line: the text cannot say
    where one page's `[OCR]` half ends and the next page's native text begins (eote corpus 10-11: page 11's own
    printed "®" follows page 10's half).
      (ii-a) a single-page chunk: no junk character anywhere in its `[OCR]` half;
      (ii-b) every chunk: no line of its pages' OCR cache text that carries junk appears in it verbatim."""
    n = 0
    junk = junk_class()
    per_a, per_b = collections.Counter(), collections.Counter()
    caches = {}
    for a, ps, pe, t in rows:
        half = ocr_half(t)
        if half is None:
            continue
        n += 1
        if ps == pe:
            per_a[a] += sum(ch in junk for ch in half)
        if a not in caches:
            caches[a] = ingest.load_ocr_pages(a)
        for p in range(ps, pe + 1):
            for line in caches[a].get(str(p), '').split('\n'):
                line = line.strip()
                if len(line) >= 4 and any(ch in junk for ch in line) and line in half:
                    per_b[a] += 1
    for a, c in sorted(per_a.items()):
        if c:
            fails.append(f'(ii-a) {a}: {c} junk character(s) left in single-page [OCR] halves')
    for a, c in sorted(per_b.items()):
        if c:
            fails.append(f'(ii-b) {a}: {c} junk-bearing OCR line(s) left verbatim')
    if not getattr(ingest, 'OCR_JUNK_CHARS', ''):
        fails.append('(ii) ingest.OCR_JUNK_CHARS is missing: no strip exists')
    return n


def check_words(rows, fails):
    strip = getattr(ingest, 'strip_ocr_junk', None)
    if strip is None:
        fails.append('(iii) ingest.strip_ocr_junk is missing')
        return 0
    n, missing = 0, collections.defaultdict(list)
    caches = {}
    for a, ps, pe, t in rows:
        half = ocr_half(t)
        if half is None:
            continue
        if a not in caches:
            caches[a] = ingest.load_ocr_pages(a)
        for p in range(ps, pe + 1):
            # the words the index keeps of that text: junk stripped, then cleaned as the ingest cleans (running
            # headers go, wraps de-hyphenate), so a word only the cleaner removes is not counted missing
            for w in WORD.findall(clean_page_text(strip(caches[a].get(str(p), '')))):
                n += 1
                if w not in half:
                    missing[a].append((p, w))
    for a, ms in sorted(missing.items()):
        fails.append(f'(iii) {a}: {len(ms)} OCR word(s) missing from the [OCR] half, e.g. {ms[:5]}')
    return n


def _raw_seq(name):
    with open(os.path.join(SCRIPT_DIR, 'Docs', 'rules_tables', name), encoding='utf-8') as f:
        d = json.load(f)
    return [r[1].count('[DI]') for r in d['rows'] if '[DI]' in r[1]]


def _dice_lines(text):
    return [line.count('[DI]') for line in text.split('\n') if '[DI]' in line and len(line.strip()) < 40]


def check_decode(cfg, fails, verbose):
    """(iv) and (v). Returns pages decoded."""
    import fitz
    pages = 0
    texts = {}
    for alias in ('eote', 'aor'):
        src = next(s for s in cfg['sources'] if s['alias'] == alias)
        try:
            marks, _ = dm.load_for_ingest(alias)
        except dm.MarksRefused as e:
            fails.append(f'(iv)/(v) {alias}: marks cache refused — {e}')
            continue
        doc = fitz.open(resolve_path(cfg, src['path']))
        st = collections.Counter()
        total = glue_a = glue_b = 0
        for p, ms in marks.items():
            if not ms:
                continue
            pages += 1
            t, s = dm.decode_page(doc[int(p) - 1], ms)
            texts[(alias, int(p))] = t
            st.update(s)
            total += len(ms)
            glue_a += len(GLUE_AFTER.findall(t))
            glue_b += len(GLUE_BEFORE.findall(t))
        doc.close()
        if glue_a or glue_b:
            fails.append(f'(v) {alias}: glue — token followed by a letter/digit {glue_a}, preceded {glue_b}')
        if st['placed'] + st['unalignable'] != total:
            fails.append(f'(v) {alias}: {total - st["placed"] - st["unalignable"]} mark(s) claim something and are '
                         f'not written (placed {st["placed"]}, unalignable {st["unalignable"]}, marks {total})')
        if verbose:
            print(f'  {alias:5} marks {total}  placed {st["placed"]}  unalignable {st["unalignable"]}  '
                  f'whitespace-only {st["whitespace-only"]}  row-placed {st["row-placed"]}  '
                  f'lone-fallback {st["lone-fallback"]}  paren-inside {st["paren-inside"]}  '
                  f'kept-last {st["kept-last"]}  glue {glue_a}/{glue_b}')
    for alias, page, want, whole in NAMED:
        t = texts.get((alias, page), '')
        if (want not in [ln.strip() for ln in t.split('\n')]) if whole else (want not in t):
            fails.append(f'(iv) {alias} corpus p.{page}: "{want}" not in the decoded page')
    t226 = texts.get(('eote', 226), '')
    if t226.count('Easy ([DI])') != 8:
        fails.append(f'(iv) eote p.226: {t226.count("Easy ([DI])")} "Easy ([DI])" rows, want 8')
    if t226.count('Hard ([DI][DI][DI])') != 6:
        fails.append(f'(iv) eote p.226: {t226.count("Hard ([DI][DI][DI])")} "Hard ([DI][DI][DI])" rows, want 6 (C-ODL-3b)')
    got, raw = _dice_lines(t226), _raw_seq('eote_p217_critical-injury-result.json')
    if got != raw:
        fails.append(f'(iv) eote p.226: dice cells {got} != RAW {raw}')
    got253 = _dice_lines(texts.get(('eote', 253), ''))
    if got253 != P253_ACCEPTED:
        fails.append(f'(iv) eote p.253: dice lines {got253} != accepted {P253_ACCEPTED}')
    return pages


def check_offsets(cfg, fails):
    sys.path.insert(0, os.path.join(SCRIPT_DIR, 'scripts'))
    try:
        from b335_calibrate_offsets import JASON_READINGS
    except ImportError:
        fails.append('(vi) scripts/b335_calibrate_offsets.py carries no JASON_READINGS')
        return
    by = {s['alias']: s for s in cfg['sources']}
    for al in FIVE:
        if pdf_pages.status(al) != pdf_pages.CALIBRATED:
            fails.append(f'(vi) {al}: status {pdf_pages.status(al)}')
            continue
        for scan, printed in JASON_READINGS.get(al, []):
            if printed is not None and pdf_pages.to_printed(al, scan) != printed:
                fails.append(f'(vi) {al}: to_printed({scan}) = {pdf_pages.to_printed(al, scan)}, Jason read {printed}')
        if (by[al].get('page_offset_provenance') or {}).get('earned_by') != 'jason-reading':
            fails.append(f'(vi) {al}: page_offset_provenance.earned_by is not "jason-reading"')


def check_golden(fails):
    import yaml
    with open(os.path.join(SCRIPT_DIR, 'swrpg_index', 'eval', 'oracle_golden.yaml'), encoding='utf-8') as f:
        g = yaml.safe_load(f)
    entries = g if isinstance(g, list) else g.get('goldens') or []
    e = next((q for q in entries if q.get('id') == 'critical-injury-table'), None)
    st = None if e is None else e.get('expect_status')
    if sorted(st if isinstance(st, list) else [st]) != ['none', 'weak']:
        fails.append(f'(vii) critical-injury-table expect_status {st!r}, want [none, weak]')


def _any_overlap_claims(chars, marks, stats):
    """The MUTANT for --bite: C-DRD-2a's claim before C-ODL-2 (any positive overlap claims)."""
    claims = collections.defaultdict(set)
    for li, cs in enumerate(chars):
        for ci, (_, bbox) in enumerate(cs):
            for mi, m in enumerate(marks):
                if dm._hits(bbox, m['box']):
                    claims[mi].add((li, ci))
    return claims


def run(db_path=DB_PATH, config_path=CONFIG_PATH, pdf=True, bite=False, verbose=False):
    cfg = load_config() if config_path == CONFIG_PATH else json.load(open(config_path, encoding='utf-8'))
    fails, notes = [], []
    if set(getattr(ingest, 'OCR_JUNK_CHARS', '')) != junk_class():
        fails.append(f'(i) ingest.OCR_JUNK_CHARS {getattr(ingest, "OCR_JUNK_CHARS", None)!r} != '
                     f'text_quality junk class {"".join(sorted(junk_class()))!r}')
    conn = sqlite3.connect(db_path)
    rows = ocr_rows(conn, decoded_aliases(cfg))
    conn.close()
    n_chunks = check_junk(rows, fails)
    n_words = check_words(rows, fails)
    n_pages = check_decode(cfg, fails, verbose) if pdf else 0
    if not pdf:
        notes.append('--no-pdf: (iv) and (v) NOT run')
    check_offsets(cfg, fails)
    check_golden(fails)
    if bite:
        caught = []
        f2 = []
        check_junk([(a, ps, pe, t.replace(MARKER, MARKER + '@®€ ') if MARKER in t else t) for a, ps, pe, t in rows], f2)
        caught.append(('junk put back', any(x.startswith(('(ii-a)', '(ii-b)')) for x in f2)))
        f3 = []
        check_words([(a, ps, pe, t[:t.find(MARKER) + len(MARKER)] if MARKER in t else t) for a, ps, pe, t in rows], f3)
        caught.append(('[OCR] half dropped', any(x.startswith('(iii)') for x in f3)))
        if pdf:
            real, f4 = dm._claims, []
            dm._claims = _any_overlap_claims
            try:
                check_decode(cfg, f4, False)
            finally:
                dm._claims = real
            caught.append(('any-overlap claim', any(x.startswith(('(iv)', '(v)')) for x in f4)))
            gap, f5 = dm.ROW_GAP, []
            dm.ROW_GAP = -1e9          # C-ODL-3a off: every grazing lone mark falls back to its grazed space
            try:
                check_decode(cfg, f5, False)
            finally:
                dm.ROW_GAP = gap
            caught.append(('row placement off', any('p.68' in x for x in f5)))
            if verbose:
                print('  [bite] any-overlap claim raised: ' + '; '.join(f4)[:400])
        for name, ok in caught:
            print(f'  [bite] {name}: {"CAUGHT" if ok else "MISSED"}')
            if not ok:
                fails.append(f'(bite) mutant "{name}" was not caught')
    for n in notes:
        print(f'  [note] {n}')
    for f in fails:
        print(f'  [FAIL] {f}')
    print(f'\ndecode_leftovers: harvest {n_chunks} [OCR] chunk(s), {n_words} OCR word(s), {n_pages} dice page(s); '
          f'{len(fails)} failure(s) — {"FAIL" if fails else "PASS"}')
    if not n_chunks or not n_words or (pdf and not n_pages):
        print('HARVEST 0 in a leg — a check aimed at no subject FAILS (norm 5)')
        return 1
    return 1 if fails else 0


if __name__ == '__main__':
    argv = sys.argv[1:]
    db = argv[argv.index('--db') + 1] if '--db' in argv else DB_PATH
    config = argv[argv.index('--config') + 1] if '--config' in argv else CONFIG_PATH
    if '--ocr-cache' in argv:
        ingest.OCR_CACHE_DIR = argv[argv.index('--ocr-cache') + 1]   # load_ocr_pages reads the module global
    sys.exit(run(db_path=db, config_path=config, pdf='--no-pdf' not in argv, bite='--bite' in argv,
                 verbose='--verbose' in argv or '-v' in argv))
