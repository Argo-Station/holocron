"""Guard for the folio strip (ruling `b861-folio-strip`, contracts C-B861-1/2/3; BOARD B-861).

`clean_page_text` used to delete EVERY lone 1–4-digit line as a "page number" — 15,255 table cells and prose
numbers library-wide (eote corpus 280: the Hyperdrive Generator's hard point `1` under `6,400/4`). It now
deletes a lone number only when its value is in the page's FOLIO SET. This guard pins that on fixture text:

  (1) calibrated     a folio (corpus - registry offset, via pdf_pages.PageMap.to_printed) is stripped; the
                     table cell `1` under `6,400/4` and the prose `1` in "suffer 1 less strain" are kept
  (2) no context     clean_page_text(text) with no folio set strips no lone number (C-B861-3)
  (3) shape          where every lone number IS a folio, the output is byte-identical to the pre-B-861 rule
                     (the removal itself did not change, only the choice of what to remove)
  (4) uncalibrated, no dominant offset  -> the set is empty and nothing is stripped (C-B861-2)
  (5) uncalibrated, dominant offset     -> detected, the folio stripped, a cell kept; the detection is NOT a
                     calibration: the PageMap still says uncalibrated and Docs/pdf_sources.json is byte-identical
  (6) thresholds     7 supporting pages (< FOLIO_MIN_PAGES) and a lead under FOLIO_MIN_LEAD both detect nothing;
                     8 pages and a lead over it both detect (each edge is shown live from both sides)
  (7) disagreement   a calibrated book whose detection names another offset is flagged; the registry still wins
  (8) spread         a two-up book (both 2p+c and 2p+c+1 lone on a page) detects as spread with a two-value set
  (9) live registry  eote corpus 226 -> {217} through the real registry and the one converter

HARVEST: the number of checks run. Zero is a failed run (instrument norm 5).

Run:
    .venv/bin/python -m swrpg_index.tests.folio_strip [--verbose]
Exit 0 iff every check passes and the harvest is non-zero.
"""
import hashlib
import os
import re
import sys

from swrpg_index import pdf_pages
from swrpg_index.utils import (
    FOLIO_MIN_LEAD, FOLIO_MIN_PAGES, book_folios, clean_page_text, lone_numbers,
)

VERBOSE = '--verbose' in sys.argv
RESULTS = []


def check(name, ok, detail=''):
    RESULTS.append((name, bool(ok)))
    if VERBOSE or not ok:
        print(f'  [{"PASS" if ok else "FAIL"}] {name}' + (f' — {detail}' if detail and not ok else ''))


def stub_map(offsets):
    """A PageMap over a fixture registry {alias: offset or None} — the real class, the real to_printed."""
    pm = pdf_pages.PageMap.__new__(pdf_pages.PageMap)
    pm._off = dict(offsets)
    return pm


# eote corpus 280, Table 7-16, as get_text() gives it (the B-861 site), with the page's folio (printed 271 for
# a +9 book) added on its own line, and aor corpus 87's prose number.
TABLE_PAGE = ('Table 7-16: Hyperdrive Attachments\nAttachment \nPrice/Rarity \nHP Required \n'
              'Hyperdrive Generator \n6,400/4 \n1 \nReinforced Shield Generator \n3,800/5 \n2 \n271\n')
PROSE_PAGE = 'the character may suffer\n1\nless strain than normal.\n271\n'


def main():
    reg_path = pdf_pages.REGISTRY
    reg_hash = hashlib.sha256(open(reg_path, 'rb').read()).hexdigest()

    # (1) calibrated: folio stripped, cells kept
    pm = stub_map({'booka': 9, 'bookb': None, 'bookc': 9, 'bookd': None})
    folios_for, info = book_folios('booka', [TABLE_PAGE], pagemap=pm)
    check('1a calibrated source is the registry', info['source'] == 'registry', info['source'])
    check('1b folio set of corpus 280 is {271}', folios_for(280) == frozenset({271}), folios_for(280))
    out = clean_page_text(TABLE_PAGE, folios=folios_for(280))
    check('1c folio 271 stripped', 271 not in lone_numbers(out), repr(out))
    check('1d hard point 1 kept under 6,400/4', re.search(r'6,400/4 \n1 \n', out) is not None, repr(out))
    check('1e hard point 2 kept under 3,800/5', re.search(r'3,800/5 \n2', out) is not None, repr(out))
    out = clean_page_text(PROSE_PAGE, folios=folios_for(280))
    check('1f prose "suffer 1 less strain" keeps its 1', re.search(r'suffer\n1\nless', out) is not None, repr(out))
    check('1g folio stripped from the prose page', 271 not in lone_numbers(out), repr(out))
    check('1h front matter (printed <= 0) has an empty set', folios_for(9) == frozenset() and folios_for(3) == frozenset())

    # (2) no page context strips nothing
    out = clean_page_text(TABLE_PAGE)
    check('2a no folio set -> every lone number kept', lone_numbers(out) == [1, 2, 271], repr(out))
    check('2b empty folio set -> every lone number kept',
          lone_numbers(clean_page_text(TABLE_PAGE, folios=frozenset())) == [1, 2, 271])

    # (3) removal shape unchanged where every lone number is a folio
    old = re.compile(r'^\s*\d{1,4}\s*$', re.MULTILINE)
    folio_only = 'Heading\n\n  271  \n\nBody text continues here.\n271\n'

    def old_clean(text):   # the pre-B-861 pipeline order, for comparison only
        text = re.sub(r'(\w)-\n(\w)', r'\1\2', text)
        text = old.sub('', text)
        text = re.sub(r'[ \t]{4,}', '   ', text)
        return re.sub(r'\n{3,}', '\n\n', text).strip()
    check('3a folio-only page byte-identical to the old rule',
          clean_page_text(folio_only, folios=frozenset({271})) == old_clean(folio_only),
          repr(clean_page_text(folio_only, folios=frozenset({271}))))

    # (4) uncalibrated, no dominant offset: stat pages whose numbers match no page relation
    stat_pages = ['Brawn\n3\nAgility\n2\nSoak\n4\nWounds\n12\n' for _ in range(30)]
    folios_for, info = book_folios('bookb', stat_pages, pagemap=pm)
    check('4a no relation detected', info['source'] == 'none' and info['detected']['kind'] is None,
          info['detected'])
    check('4b every page has an empty set', all(folios_for(p) == frozenset() for p in range(1, 31)))
    out = clean_page_text(stat_pages[2], folios=folios_for(3))
    check('4c the page keeps all its numbers', lone_numbers(out) == [3, 2, 4, 12], repr(out))

    # (5) uncalibrated, dominant offset 12 over 40 pages, with table noise
    pages = [f'Species text page {p}\nWound Threshold\n{10 + p % 3}\n{p - 12}\n' for p in range(1, 41)]
    folios_for, info = book_folios('bookd', pages, pagemap=pm)
    det = info['detected']
    check('5a detected single offset 12', info['source'] == 'detected' and det['kind'] == 'single'
          and det['value'] == 12, det)
    out = clean_page_text(pages[29], folios=folios_for(30))
    check('5b folio 18 stripped on corpus 30', 18 not in lone_numbers(out), repr(out))
    check('5c the wound-threshold cell kept', lone_numbers(out) == [10], repr(out))
    check('5d detection is not a calibration: the book is still uncalibrated',
          pm.status('bookd') == pdf_pages.UNCALIBRATED and pm.offset('bookd') is None)
    check('5e detection wrote nothing: Docs/pdf_sources.json byte-identical',
          hashlib.sha256(open(reg_path, 'rb').read()).hexdigest() == reg_hash)

    # (6) thresholds
    # printed = corpus + 100 (offset -100), so every fixture value is a positive lone number
    few = [f'x\n{p + 100}\n' if p <= FOLIO_MIN_PAGES - 1 else 'x\n' for p in range(1, 41)]
    d = book_folios('bookd', few, pagemap=pm)[1]['detected']
    check('6a support below FOLIO_MIN_PAGES detects nothing',
          d['kind'] is None and d['single_top'][0] == (-100, FOLIO_MIN_PAGES - 1), d)
    enough = [f'x\n{p + 100}\n' if p <= FOLIO_MIN_PAGES else 'x\n' for p in range(1, 41)]
    d = book_folios('bookd', enough, pagemap=pm)[1]['detected']
    check('6b support AT FOLIO_MIN_PAGES detects (the edge is live)', d['kind'] == 'single' and d['value'] == -100, d)
    # leader 20 pages at offset -100, runner-up 10 pages at offset -200: lead 2.0 < FOLIO_MIN_LEAD
    close = [(f'x\n{p + 100}\n' if p <= 20 else '') + (f'y\n{p + 200}\n' if 31 <= p <= 40 else '')
             for p in range(1, 41)]
    d = book_folios('bookd', close, pagemap=pm)[1]['detected']
    check('6c lead under FOLIO_MIN_LEAD detects nothing',
          FOLIO_MIN_LEAD > 2.0 and d['kind'] is None and d['single_top'] == [(-100, 20), (-200, 10)], d)
    # the same leader with a runner-up of 7 pages: lead 2.86 >= FOLIO_MIN_LEAD
    close = [(f'x\n{p + 100}\n' if p <= 20 else '') + (f'y\n{p + 200}\n' if 31 <= p <= 37 else '')
             for p in range(1, 41)]
    d = book_folios('bookd', close, pagemap=pm)[1]['detected']
    check('6d lead over FOLIO_MIN_LEAD detects', d['kind'] == 'single' and d['value'] == -100, d)

    # (7) calibrated book whose detection disagrees with the registry
    pages = [f'text\n{p - 5}\n' for p in range(1, 41)]
    folios_for, info = book_folios('bookc', pages, pagemap=pm)
    check('7a disagreement flagged', info['disagrees'] is True and info['detected']['value'] == 5, info)
    check('7b the registry wins for stripping', folios_for(30) == frozenset({21}), folios_for(30))
    out = clean_page_text(pages[29], folios=folios_for(30))
    check('7c the detected-but-unregistered value is kept', lone_numbers(out) == [25], repr(out))
    folios_for, info = book_folios('bookc', [f'text\n{p - 9}\n' for p in range(1, 41)], pagemap=pm)
    check('7d agreement is not flagged', info['disagrees'] is False and info['detected']['value'] == 9, info)

    # (8) two-up spread: corpus p shows printed 2p-3 and 2p-2
    pages = [f'left\n{2 * p - 3}\nright\n{2 * p - 2}\n' for p in range(2, 42)]
    pages = ['cover'] + pages
    folios_for, info = book_folios('bookb', pages, pagemap=pm)
    check('8a spread detected', info['detected']['kind'] == 'spread' and info['detected']['value'] == -3,
          info['detected'])
    check('8b two-value set', folios_for(20) == frozenset({37, 38}), folios_for(20))
    check('8c both folios stripped', lone_numbers(clean_page_text(pages[19], folios=folios_for(20))) == [])

    # (9) the live registry through the one converter (the ruling's own site)
    folios_for, info = book_folios('eote', [])
    check('9a eote is calibrated in the registry', info['source'] == 'registry')
    check('9b eote corpus 226 -> {217} via to_printed',
          folios_for(226) == frozenset({pdf_pages.to_printed('eote', 226)}) == frozenset({217}), folios_for(226))

    # (10) a MAPPED book (page runs, B-1850): the registry's runs decide, read through the converter; detection is
    # not used even where it would name another relation
    pm = stub_map({'booke': None})
    pm._runs = {'booke': [{'from': 3, 'to': 20, 'printed_from': 1, 'step': 1},
                          {'from': 25, 'to': 30, 'printed_from': 40, 'step': 2}]}
    pages = [f'text\n{p - 5}\n' for p in range(1, 41)]
    folios_for, info = book_folios('booke', pages, pagemap=pm)
    check('10a mapped source is the registry runs', info['source'] == 'registry-runs', info['source'])
    check('10b in a step-1 run: corpus 10 -> {8}', folios_for(10) == frozenset({8}), folios_for(10))
    check('10c outside every run: nothing stripped (not the detected 17)', folios_for(22) == frozenset(),
          folios_for(22))
    check('10d in a step-2 run: corpus 26 -> {42, 43}', folios_for(26) == frozenset({42, 43}), folios_for(26))

    passed = sum(1 for _, ok in RESULTS if ok)
    print(f'folio_strip: {passed}/{len(RESULTS)} checks pass (min pages {FOLIO_MIN_PAGES}, lead {FOLIO_MIN_LEAD})')
    print(f'HARVEST: {len(RESULTS)} checks run' + (' — ZERO IS A FAILED RUN' if not RESULTS else ''))
    return 0 if RESULTS and passed == len(RESULTS) else 1


if __name__ == '__main__':
    sys.exit(main())
