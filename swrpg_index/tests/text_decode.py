"""Guard for `text_decode` (ruling `glyph-class-recon` R-GCR-2/3, contract C-GCR-2): a dice-font book's symbols
reach the index as tokens, all of them, and no dice-font book sits undeclared.

Reads Docs/pdf_sources.json (or --config), the PDFs it names, and the live index (or --db), read-only:

  (i)   declared     every PDF whose fonts include a RULED icon font (`SWRPGIcons`, `ITCSymbolStdBookSWRPG`)
                     is declared `"text_decode": "swrpg-icons"`; an undeclared one FAILS, naming the alias and
                     its page count. The `SWRPGGlyphsAndDice` / `GenesysGlyphsAndDice` family (old-republic-v08)
                     is REPORTED as "icon font with no ruled table (R-GCR-6)", not failed; any OTHER icon-font
                     name (one carrying `SWRPG`, `GlyphsAndDice` or `Dice`) FAILS.
  (ii)  complete     for every declared alias, the index's token count equals the PDF's decoded icon-glyph
                     count, token by token (NUL excluded); a mismatch FAILS naming alias, token and the chunk
                     page ranges that differ
  (iii) known        unknown (glyph, colour) pairs across the declared PDFs = 0, else FAIL naming alias, page,
                     glyph, hex
  (iv)  vocabulary   `text_decode` values are absent or "swrpg-icons"
  (v)   has_text     every declared alias has `has_text: true` (a decode over an unread layer is a declaration
                     without a measurement, norm 4)

For a `"text_decode": "dice-marks"` alias (ruling `dice-render-decode` C-DRD-5), (ii)/(iii) are replaced by:
  (vi)  stamp        the marks cache exists and its stamp verifies against the tree (dice_marks.load_for_ingest)
  (vii) complete     the decode RECOMPUTED from the cache and the PDF's text layer equals the index's token count,
                     token by token, by chunk page range
  (viii) excluded    no written mark overlaps (IoU >= 0.5) a row of exclusions.json OR of PINNED_EXCLUSIONS below
                     (B-842's two, pinned here so an emptied list cannot pass), and the list carries every pinned row

HARVEST: the number of declared aliases checked (both values). Zero is a failed run (instrument norm 5).

Run:
    python3 -m swrpg_index.tests.text_decode [--verbose] [--db COPY] [--config REGISTRY_COPY]
Exit 0 iff every check passes and the harvest is non-zero.
"""
import collections
import json
import os
import re
import sqlite3
import sys

import fitz

from swrpg_index import DB_PATH
from swrpg_index import dice_marks as dm
from swrpg_index import glyph_decode as gd
from swrpg_index.utils import CONFIG_PATH, resolve_path

_TOKEN_RE = re.compile(r'\[(AB|PR|DI|CH|BO|SE|FO|SU|FA|AD|TH|TR|DE|LS|DS|FP)\]')


# B-842 (ruling dice-render-census C-DRCS-A2): the two known wrong names. Pinned so check (viii) cannot be emptied.
PINNED_EXCLUSIONS = [
    {'alias': 'aor', 'page': 180, 'box': [1011.12, 721.92, 1034.16, 744.96], 'named': '[LS]'},
    {'alias': 'aor', 'page': 466, 'box': [1038.24, 361.92, 1066.32, 388.08], 'named': '[DS]'},
]


def _dice_marks_counts(a, doc, fails, verbose):
    """(per_page Counter, total Counter) recomputed for a dice-marks alias, or None on a stamp failure."""
    try:
        pages, rep = dm.load_for_ingest(a)
    except dm.MarksRefused as exc:
        fails.append(f'(vi) {exc}')
        return None
    listed = dm.load_exclusions(a)
    for pin in (x for x in PINNED_EXCLUSIONS if x['alias'] == a):
        if not any(str(r['page']) == str(pin['page']) and dm.iou(r['box'], pin['box']) >= dm.EXCLUSION_IOU
                   for r in listed):
            fails.append(f'(viii) {a} p{pin["page"]}: pinned exclusion {pin["named"]} missing from exclusions.json')
    guard = listed + [x for x in PINNED_EXCLUSIONS if x['alias'] == a]
    per_page, total, stats = {}, collections.Counter(), collections.Counter()
    for page, marks in pages.items():
        if not marks:
            continue
        written = []
        _, st = dm.decode_page(doc[int(page) - 1], marks, written)
        stats.update(st)
        cnt = collections.Counter({k: v for k, v in st.items() if k.startswith('[')})
        per_page[int(page)] = cnt
        total += cnt
        for m in written:
            for x in guard:
                if str(x['page']) == page and dm.iou(m['box'], x['box']) >= dm.EXCLUSION_IOU:
                    fails.append(f'(viii) {a} p{page}: listed mark {x.get("named")} {x["box"]} would be written')
    if verbose:
        print(f'  {a:18} named {rep["named"]}  excluded {rep["excluded"]}  unalignable {stats["unalignable"]}  '
              f'whitespace-joined {stats["whitespace-joined"]}  whitespace-only {stats["whitespace-only"]}  '
              f'placed {stats["placed"]}')
    return per_page, total


def _font_names(doc):
    names = set()
    for i in range(doc.page_count):
        for f in doc[i].get_fonts():
            names.add(f[3] or '')
    return names


def run(db_path=DB_PATH, config_path=CONFIG_PATH, verbose=False):
    with open(config_path, encoding='utf-8') as fh:
        cfg = json.load(fh)
    if not os.path.exists(db_path):
        print(f'ERROR: no index at {db_path}')
        return 1
    conn = sqlite3.connect(f'file:{db_path}?mode=ro', uri=True)
    fails, notes = [], []
    declared = []
    for s in cfg.get('sources', []):
        a = s.get('alias')
        td = s.get('text_decode')
        if td is not None and td not in gd.TEXT_DECODES:
            fails.append(f'(iv) {a}: text_decode {td!r} is not one of {gd.TEXT_DECODES}')
            continue
        path = resolve_path(cfg, s.get('path', ''))
        if not os.path.exists(path):
            if td:
                fails.append(f'(ii) {a}: declared but its PDF is missing at {path}')
            continue
        try:
            doc = fitz.open(path)
        except Exception as exc:  # noqa: BLE001
            if td:
                fails.append(f'(ii) {a}: declared but its PDF will not open ({exc})')
            continue
        names = _font_names(doc)
        ruled = sorted(n for n in names if gd.is_ruled_icon_font(n))
        known = sorted(n for n in names if any(k in n for k in gd.KNOWN_UNRULED_ICON_FONTS))
        other = sorted(n for n in names if any(k in n for k in gd.ICON_FONT_MARKERS)
                       and n not in ruled and n not in known)
        if known:
            notes.append(f'{a}: icon font with no ruled table (R-GCR-6): {known}')
        if other:
            fails.append(f'(i) {a}: un-ruled icon font(s) {other}')
        if ruled and not td:
            fails.append(f'(i) {a}: carries {ruled} ({doc.page_count} pages) but is not declared '
                         f'text_decode "swrpg-icons"')
        if not td:
            doc.close()
            continue
        declared.append(a)
        if s.get('has_text') is not True:
            fails.append(f'(v) {a}: declared text_decode but has_text is {s.get("has_text")!r}')
        per_page = {}
        pdf_counts = collections.Counter()
        unknown = []
        if td == 'dice-marks':
            got = _dice_marks_counts(a, doc, fails, verbose)
            doc.close()
            if got is None:
                continue
            per_page, pdf_counts = got
        else:
            for i in range(doc.page_count):
                _, cnt, unk = gd.decode_page(doc[i])
                per_page[i + 1] = cnt
                pdf_counts += cnt
                unknown += [(i + 1, g, h) for g, h in unk]
            doc.close()
        for page, g, h in unknown[:10]:
            fails.append(f'(iii) {a} p.{page}: glyph {g!r} at #{h} has no TABLE row')
        if len(unknown) > 10:
            fails.append(f'(iii) {a}: … {len(unknown) - 10} more unknown pair(s)')
        idx_counts = collections.Counter()
        bad_ranges = []
        for ps, pe, text in conn.execute(
                "SELECT page_start, page_end, text FROM chunks WHERE alias = ? AND content_type != 'verified_table' "
                "ORDER BY page_start", (a,)):
            c = collections.Counter('[' + m + ']' for m in _TOKEN_RE.findall(text or ''))
            idx_counts += c
            want = sum((per_page.get(p, collections.Counter()) for p in range(ps, pe + 1)), collections.Counter())
            if c != want:
                bad_ranges.append(f'{ps}-{pe}')
        if idx_counts != pdf_counts:
            for tok in sorted(set(idx_counts) | set(pdf_counts)):
                if idx_counts[tok] != pdf_counts[tok]:
                    fails.append(f'({"vii" if td == "dice-marks" else "ii"}) {a}: {tok} index {idx_counts[tok]} '
                                 f'vs {"decode" if td == "dice-marks" else "PDF"} {pdf_counts[tok]} '
                                 f'(chunk ranges differing: {bad_ranges[:8]})')
        if verbose:
            print(f'  {a:18} PDF glyphs {sum(pdf_counts.values()):4}  index tokens {sum(idx_counts.values()):4}  '
                  f'unknown {len(unknown)}  {"ok" if idx_counts == pdf_counts and not unknown else "RED"}')
    conn.close()
    for n in notes:
        print(f'  [note] {n}')
    for f in fails:
        print(f'  [FAIL] {f}')
    harvest = len(declared)
    if harvest == 0:
        print('\nHARVEST 0 — no alias declares text_decode; a check aimed at no subject FAILS (norm 5)')
        return 1
    print(f'\ntext_decode: harvest {harvest} declared alias(es), {len(fails)} failure(s) — '
          f'{"FAIL" if fails else "PASS"}')
    return 1 if fails else 0


if __name__ == '__main__':
    argv = sys.argv[1:]
    db = argv[argv.index('--db') + 1] if '--db' in argv else DB_PATH
    config = argv[argv.index('--config') + 1] if '--config' in argv else CONFIG_PATH
    sys.exit(run(db_path=db, config_path=config, verbose='--verbose' in argv or '-v' in argv))
