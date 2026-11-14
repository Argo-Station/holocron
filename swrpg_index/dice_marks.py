"""The dice-marks decode: dice read from the PAGE IMAGE of a scanned book, written into its text as tokens.

Ruling `dice-render-decode` (C-DRD-1..4). A scanned book's text layer is an old OCR that typed junk (`©`, `®`,
`Il`, nothing at all) where the page prints a die or a result symbol. The census instruments
(`Docs/audit_artifacts/dice_render_census_2026-09-22/`: finder -> namer -> census_report) locate and name those
symbols from the page picture and write a machine-local MARKS CACHE, `Docs/dice_marks/<alias>.marks.json`
(gitignored). A book opts in with `"text_decode": "dice-marks"` in Docs/pdf_sources.json, a FILE property like
`text_shift`, `text_source` and the other `text_decode` value.

At ingest:
  load_for_ingest(alias)   reads the cache, verifies its STAMP against the tree (C-DRD-3) and applies the
                           exclusion list (C-DRD-4). Raises MarksRefused, naming the field, BEFORE any row is
                           deleted: a stale cache can never reach the index.
  decode_page(page, marks) rebuilds one page's text from its rawdict characters with the CLAIM RULE (C-DRD-2a,
                           ruling ADDENDUM 1, as amended by `oracle-o3-decode-leftovers` C-ODL-2/3): a character
                           is claimed by every mark whose box intersects its box, whitespace included, EXCEPT a
                           NEIGHBOUR'S character, which no mark claims (C-ODL-2, see `_claims`). A mark
                           claiming nothing is unalignable. A mark claiming only whitespace is whitespace-JOINED
                           if one of its characters sits beside (same line) a character claimed by a mark with a
                           non-whitespace claim, else whitespace-ONLY, and a whitespace-only mark writes its token
                           as a word of its own at the first whitespace run it claims, one space kept on each side
                           (C-ODL-3) -- inside the parenthesis when that space directly follows a `)` (C-ODL-3b),
                           and on its own ROW after the row line's last word when every space it claims is a GRAZE
                           on another line (C-ODL-3a; ruling `oracle-o3-decode-leftovers-lone-marks`). On each line a maximal run of claimed characters keeps its LEADING and
                           TRAILING whitespace verbatim; an all-whitespace run is emitted verbatim unless a
                           whitespace-only mark writes there; otherwise the interior becomes the tokens of every
                           mark claiming any character of the run, ordered by box x0, each mark written once (at
                           the first run that writes); a run none of whose marks is left to write is emitted
                           verbatim (only a WRITING run's interior is removed, E-DRD-3). Unclaimed characters are
                           emitted verbatim. The only characters ever inserted are single spaces that keep a
                           written token apart from a letter or digit beside it (C-ODL-2: a token is a word of its
                           own). A page with no mark equals get_text() line for line.
The census instruments import `compute_stamp` from here to WRITE the stamp; this module imports nothing from
Docs/audit_artifacts/ (it reads the instruments' constants with `ast` and hashes their bytes).
"""
import ast
import collections
import datetime
import glob
import hashlib
import json
import os

import fitz

from swrpg_index.utils import SCRIPT_DIR as REPO_ROOT

STAMP_SCHEMA = 1
INSTRUMENT_DIR = os.environ.get(
    'SWRPG_DICE_INSTRUMENTS',
    os.path.join(REPO_ROOT, 'Docs', 'audit_artifacts', 'dice_render_census_2026-09-22'))
MARKS_DIR = os.environ.get('SWRPG_DICE_MARKS', os.path.join(REPO_ROOT, 'Docs', 'dice_marks'))
INSTRUMENTS = ('finder.py', 'namer.py', 'census_report.py')
EXCLUSION_IOU = 0.5


class MarksRefused(Exception):
    """The marks cache is missing, unstamped, or stamped by instruments that are not the tree's."""


def _sha(path):
    with open(path, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


def _constants(path, names):
    """Top-level literal assignments NAME = <literal> read from a source file without importing it."""
    out = {}
    with open(path, encoding='utf-8') as f:
        tree = ast.parse(f.read())
    for node in tree.body:
        if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
            if node.targets[0].id in names:
                out[node.targets[0].id] = ast.literal_eval(node.value)
    return out


def tree_parameters(instrument_dir=None):
    d = instrument_dir or INSTRUMENT_DIR
    nm = _constants(os.path.join(d, 'namer.py'), ('FLOOR', 'MARGIN', 'CLASS_FLOOR'))
    fd = _constants(os.path.join(d, 'finder.py'), ('RULE_LEN_V',))
    return {'floor': nm['FLOOR'], 'margin': nm['MARGIN'], 'class_floor': nm['CLASS_FLOOR'],
            'rule_len_v': fd['RULE_LEN_V']}


def compute_stamp(instrument_dir=None, labels_dir=None, floor=None, margin=None):
    """The stamp of the tree's instruments. floor/margin default to namer.py's; a census run at other values
    records them, and the stamp then fails to verify (ingest decodes only at the ruled parameters)."""
    d = instrument_dir or INSTRUMENT_DIR
    labels_dir = labels_dir or os.path.join(d, 'labels')
    params = tree_parameters(d)
    lab = hashlib.sha256()
    for p in sorted(glob.glob(os.path.join(labels_dir, '*.json'))):
        lab.update(os.path.basename(p).encode() + b'\0')
        with open(p, 'rb') as f:
            lab.update(f.read())
        lab.update(b'\0')
    return {
        'schema': STAMP_SCHEMA,
        'instruments': {name: _sha(os.path.join(d, name)) for name in INSTRUMENTS},
        'labels': lab.hexdigest(),
        'exclusions': _sha(os.path.join(d, 'exclusions.json')),
        'floor': params['floor'] if floor is None else floor,
        'margin': params['margin'] if margin is None else margin,
        'class_floor': params['class_floor'],
        'rule_len_v': params['rule_len_v'],
    }


def stamp_now(**kw):
    s = compute_stamp(**kw)
    s['written_at'] = datetime.datetime.now().isoformat(timespec='seconds')
    return s


def verify_stamp(alias, stamp, instrument_dir=None):
    """Raise MarksRefused naming the first field of the cache's stamp that differs from the tree."""
    if not stamp:
        raise MarksRefused(f'{alias}: marks cache has no stamp (re-run census_report.py)')
    want = compute_stamp(instrument_dir)
    for key in ('schema', 'labels', 'exclusions', 'floor', 'margin', 'class_floor', 'rule_len_v'):
        if stamp.get(key) != want[key]:
            raise MarksRefused(f'{alias}: marks cache stamp differs from the tree at "{key}"')
    for name in INSTRUMENTS:
        if (stamp.get('instruments') or {}).get(name) != want['instruments'][name]:
            raise MarksRefused(f'{alias}: marks cache stamp differs from the tree at "instruments.{name}"')


def marks_path(alias, marks_dir=None):
    return os.path.join(marks_dir or MARKS_DIR, f'{alias}.marks.json')


def load_exclusions(alias, instrument_dir=None):
    with open(os.path.join(instrument_dir or INSTRUMENT_DIR, 'exclusions.json'), encoding='utf-8') as f:
        return [r for r in json.load(f)['rows'] if r['alias'] == alias]


def iou(a, b):
    ix = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / union if union > 0 else 0.0


def apply_exclusions(alias, marks, rows):
    """(marks with every listed mark removed, removed count). A named mark whose box has IoU >= 0.5 with a
    listed box on the same page is removed (the rule exclusion_guard.py checks)."""
    out, removed = {}, 0
    for page, rs in marks.items():
        listed = [r['box'] for r in rows if str(r['page']) == page]
        keep = []
        for m in rs:
            if m.get('token') and any(iou(m['box'], b) >= EXCLUSION_IOU for b in listed):
                removed += 1
                continue
            keep.append(m)
        out[page] = keep
    return out, removed


def load_for_ingest(alias, marks_dir=None, instrument_dir=None):
    """{page_1indexed_str: [mark, ...]} ready for decode_page, plus a report dict. Raises MarksRefused."""
    path = marks_path(alias, marks_dir)
    if not os.path.exists(path):
        raise MarksRefused(f'{alias}: marks cache not found at {path} (run finder.py, then census_report.py)')
    with open(path, encoding='utf-8') as f:
        data = json.load(f)
    report = data.get('report') or {}
    if report.get('alias') != alias:
        raise MarksRefused(f'{alias}: marks cache names alias {report.get("alias")!r}')
    verify_stamp(alias, report.get('stamp'), instrument_dir)
    marks = {p: [m for m in rs if m.get('token')] for p, rs in data['marks'].items()}
    marks, removed = apply_exclusions(alias, marks, load_exclusions(alias, instrument_dir))
    return marks, {'named': sum(len(v) for v in data['marks'].values()), 'excluded': removed}


def _line_chars(line):
    return [(ch['c'], ch['bbox']) for span in line['spans'] for ch in span['chars']]


def _hits(bbox, box):
    return bbox[0] < box[2] and bbox[2] > box[0] and bbox[1] < box[3] and bbox[3] > box[1]


def _inter_area(bbox, box):
    return (max(0.0, min(bbox[2], box[2]) - max(bbox[0], box[0]))
            * max(0.0, min(bbox[3], box[3]) - max(bbox[1], box[1])))


# C-ODL-2: the characters a neighbour's word can own: letters and digits (str.isalnum) and the page's own word and
# sentence punctuation. Everything else a box covers (the junk class `[@®º°≤≥§¶¤¥¢£€]`, square and curly brackets,
# `|`, `©`, `%`, `&`, `#`, `+` ...) is what the old OCR typed for a symbol and stays the symbol's own.
NEIGHBOUR_PUNCT = set(".,;:!?'\u2018\u2019\"\u201c\u201d-\u2013\u2014/")


def _word_char(c):
    return c.isalnum() or c in NEIGHBOUR_PUNCT


def _paired_parens(cs):
    """Indices of round parentheses that close a pair on their own line (a stack match): the page's punctuation."""
    stack, paired = [], set()
    for ci, (c, _) in enumerate(cs):
        if c == '(':
            stack.append(ci)
        elif c == ')' and stack:
            paired.update((stack.pop(), ci))
    return paired


ROW_OVERLAP = 0.5


def _row_mates(a, b):
    """Two boxes on one printed row: their vertical overlap is at least half the shorter box's height."""
    iy = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    h = min(a[3] - a[1], b[3] - b[1])
    return h > 0 and iy / h >= ROW_OVERLAP


def _claims(chars, marks, stats):
    """C-DRD-2a's claims as amended by C-ODL-2: {mark index: {(line, char)}}, whitespace included.

    A box claims the characters it intersects, EXCEPT a NEIGHBOUR's character, which is never replaced whatever the
    overlap:
      (p) a round parenthesis whose partner is on the same line: the page's punctuation round a die, `Easy ([DI])`.
      (w) a word character (`_word_char`) directly beside, on its line with no whitespace between, a word character
          no box claims: it is part of that word (`Hj|i|n` gives the `i` back to "in"). One step only, so the old
          OCR's own letters for the symbol (`Hj`) stay the symbol's.
      (g) GRAZE: a character on any line but the mark's HOME line. A die sits on one line; a box reaching into the
          line above or below touches that line's words, not its own symbol. The home line is chosen among the lines
          where the mark still claims something after (p) and (w), whitespace included: first, the SETTLED line of a
          ROW-MATE (`_row_mates`: symbols printed side by side sit on one text line; eote corpus p.245, whose text
          layer lies half a line above the print, and p.226's phantom `))` line), a mate being settled when it has
          one candidate line, or one line holding junk; else a line holding a character that is not a word
          character (the OCR's junk for a symbol); then the greatest intersection area; then the first line.
    (w) runs twice: over every character a box touches, and again after (g) over what the marks still claim, so a
    letter beside a grazed character that (g) handed back is its word's too.
    A mark that (p) and (w) would leave with nothing at all keeps what they took from it on its greatest-area line:
    every mark that touched something still claims something, and each such non-whitespace character is counted
    ('kept-last': a residual, named in the gate). stats: 'grazed', 'released' (by (p) or (w)) and 'kept-last', over
    non-whitespace characters."""
    touched = collections.defaultdict(set)
    for li, cs in enumerate(chars):
        for ci, (_, bbox) in enumerate(cs):
            for mi, m in enumerate(marks):
                if _hits(bbox, m['box']):
                    touched[mi].add((li, ci))
    ws = lambda key: chars[key[0]][key[1]][0].isspace()  # noqa: E731
    word_ch = lambda key: _word_char(chars[key[0]][key[1]][0])  # noqa: E731
    parens = {li: _paired_parens(cs) for li, cs in enumerate(chars)}

    def neighbours(held):
        """(p) and (w) against the characters `held` by some box."""
        def free(li, ci):
            return 0 <= ci < len(chars[li]) and (li, ci) not in held and _word_char(chars[li][ci][0])
        return ({k for k in held if k[1] in parens[k[0]]}
                | {(li, ci) for li, ci in held if word_ch((li, ci)) and (free(li, ci - 1) or free(li, ci + 1))})

    def area(mi, keys):
        return sum(_inter_area(chars[li][ci][1], marks[mi]['box']) for li, ci in keys)

    def by_line(keys):
        out = collections.defaultdict(set)
        for k in keys:
            out[k[0]].add(k)
        return out

    held = set().union(*touched.values()) if touched else set()
    gone = neighbours(held)
    cands, kept = {}, {}
    for mi, cl in touched.items():
        rest = by_line(cl - gone)
        if not rest:
            # (p)/(w) would leave nothing: the mark keeps its greatest-area line whole.
            lines = by_line(cl)
            home = min(lines, key=lambda li: (-area(mi, lines[li]), li))
            kept[mi] = lines[home]
            stats['kept-last'] += sum(not ws(k) for k in lines[home])
            continue
        junky = [li for li, ks in rest.items() if any(not ws(k) and not word_ch(k) for k in ks)]
        cands[mi] = (sorted(rest), junky, rest)
    claims = {}
    settled = {mi: junky or lines for mi, (lines, junky, _) in cands.items()}
    single = {mi: ls[0] for mi, ls in settled.items() if len(ls) == 1}
    for mi, (lines, junky, rest) in cands.items():
        pick = lines
        if len(lines) > 1:
            row = {li for mj, li in single.items() if mj != mi and _row_mates(marks[mi]['box'], marks[mj]['box'])}
            pick = [li for li in lines if li in row] or junky or lines
        home = min(pick, key=lambda li: (-area(mi, rest[li]), li))
        claims[mi] = {k for k in touched[mi] if k[0] == home}
    for mi, cl in kept.items():
        claims[mi] = set(cl)
    for mi, cl in touched.items():
        stats['grazed'] += sum(not ws(k) for k in cl if k not in claims[mi] and k not in gone)
    held = set().union(*claims.values()) if claims else set()
    gone2 = neighbours(held)
    for mi, cl in claims.items():
        if mi in kept:
            continue
        if cl and cl <= gone2:
            stats['kept-last'] += sum(not ws(k) for k in cl)
            continue
        stats['released'] += sum(not ws(k) for k in cl & gone2)
        cl -= gone2
    return claims


GRAZE_SHARE = 0.5          # C-ODL-3a: a claimed space with less than half its height inside the box is a GRAZE
ROW_GAP = 20.0             # C-ODL-3a: a grazing lone mark goes after its row's last word within this many points
ROW_SLACK = 2.0            # a row line may end this far past the box's left edge and still lie "to its left"


def _is_graze(bbox, box):
    h = bbox[3] - bbox[1]
    return h > 0 and max(0.0, min(bbox[3], box[3]) - max(bbox[1], box[1])) / h < GRAZE_SHARE


def _row_line(lines, box):
    """C-ODL-3a: the text line sharing the box's ROW (vertical overlap >= half the box's height) that ends nearest its
    left edge, within ROW_GAP points; None when there is none."""
    h = box[3] - box[1]
    best = None
    for li, line in enumerate(lines):
        x0, y0, x1, y1 = line['bbox']
        if min(y1, box[3]) - max(y0, box[1]) < 0.5 * h or x1 > box[0] + ROW_SLACK:
            continue
        gap = box[0] - x1
        if gap <= ROW_GAP and (best is None or gap < best[0]):
            best = (gap, li)
    return None if best is None else best[1]


def decode_page(page, marks, written_out=None):
    """(text, stats) for one PyMuPDF page under the claim rule (C-DRD-2a as amended by C-ODL-2/3).

    stats: Counter with 'placed', 'unalignable', 'whitespace-only' (marks claiming only whitespace with nothing beside
    them: each now placed as a word of its own, C-ODL-3), 'row-placed' / 'lone-fallback' (C-ODL-3a), 'paren-inside'
    (C-ODL-3b), 'whitespace-joined', 'grazed' / 'released' / 'kept-last'
    (C-ODL-2, see `_claims`), 'spaced' (spaces written to keep a token off a letter or digit),
    'nonwriting-runs' and 'nonwriting-chars' (runs kept verbatim because their marks wrote earlier: a HARVEST, not a
    check) and one key per token.
    written_out: if a list, every mark written is appended to it (the guard's check (viii))."""
    stats = collections.Counter()
    lines = [line for block in page.get_text('rawdict', flags=fitz.TEXTFLAGS_TEXT)['blocks']
             if block.get('type') == 0 for line in block['lines']]
    chars = [_line_chars(line) for line in lines]
    claims = _claims(chars, marks, stats)
    is_ws = lambda key: chars[key[0]][key[1]][0].isspace()  # noqa: E731
    solid = {mi for mi, cl in claims.items() if not all(is_ws(k) for k in cl)}
    solid_chars = {k for mi in solid for k in claims[mi]}
    eligible = set(solid)
    lone = set()                                  # whitespace-only marks (C-ODL-3)
    for mi in range(len(marks)):
        cl = claims.get(mi, [])
        if not cl:
            stats['unalignable'] += 1
        elif mi not in solid:
            if any((li, ci + d) in solid_chars for li, ci in cl for d in (-1, 1)):
                stats['whitespace-joined'] += 1
            else:
                stats['whitespace-only'] += 1
                lone.add(mi)
            eligible.add(mi)
    # C-ODL-3a: a lone mark whose every claim is a GRAZE (a space on another text line) is written on its own ROW,
    # after the last word of the row's line nearest its left, within ROW_GAP; with no such line it stays at the grazed
    # space (the fallback, counted 'lone-fallback': a residual the gate names).
    on_row = collections.defaultdict(list)        # row line -> [mark index]
    for mi in sorted(lone):
        if all(_is_graze(chars[li][ci][1], marks[mi]['box']) for li, ci in claims[mi]):
            li = _row_line(lines, marks[mi]['box'])
            if li is None:
                stats['lone-fallback'] += 1
            else:
                on_row[li].append(mi)
                eligible.discard(mi)
                lone.discard(mi)
                stats['row-placed'] += 1
    claimers = collections.defaultdict(set)       # (line, char) -> {eligible mark index}
    for mi in eligible:
        for key in claims[mi]:
            claimers[key].add(mi)
    written = set()
    out = []

    def write(parts, todo):
        for mi in todo:
            parts.append(marks[mi]['token'])
            stats[marks[mi]['token']] += 1
            stats['placed'] += 1
            written.add(mi)
            if written_out is not None:
                written_out.append(marks[mi])

    for li, cs in enumerate(chars):
        parts, ci = [], 0
        while ci < len(cs):
            if (li, ci) not in claimers:
                parts.append(cs[ci][0])
                ci += 1
                continue
            start, run = ci, set()
            while ci < len(cs) and (li, ci) in claimers:
                run |= claimers[(li, ci)]
                ci += 1
            text = [c for c, _ in cs[start:ci]]
            lo, hi = 0, len(text)
            while lo < hi and text[lo].isspace():
                lo += 1
            while hi > lo and text[hi - 1].isspace():
                hi -= 1
            if lo == hi:
                # An all-whitespace run: verbatim, unless a whitespace-only mark writes here as a word of its own,
                # one space kept on each side (C-ODL-3); directly after a `)` it goes INSIDE the parenthesis, just
                # before the `)`, and the space stays as it was (C-ODL-3b: `Easy ([DI])`).
                todo = sorted((run & lone) - written, key=lambda k: (marks[k]['box'][0], k))
                done = ''.join(parts)
                if todo and done.endswith(')'):
                    parts = [done[:-1]]
                    write(parts, todo)
                    parts.append(')')
                    parts.append(''.join(text))
                    stats['paren-inside'] += len(todo)
                elif todo:
                    parts.append(' ')
                    write(parts, todo)
                    parts.append(' ')
                else:
                    parts.append(''.join(text))
                continue
            todo = sorted(run - written, key=lambda k: (marks[k]['box'][0], k))
            if not todo:
                # Nothing but the interior of a WRITING run is removed (C-DRD-2a; E-DRD-3): a run whose marks all
                # wrote earlier (a box grazing the next line) is emitted verbatim.
                parts.append(''.join(text))
                stats['nonwriting-runs'] += 1
                stats['nonwriting-chars'] += hi - lo
                continue
            parts.append(''.join(text[:lo]))
            before = ''.join(parts)[-1:]
            if before.isalnum():
                parts.append(' ')                 # C-ODL-2: a token is a word of its own
                stats['spaced'] += 1
            write(parts, todo)
            after = ''.join(text[hi:]) or (cs[ci][0] if ci < len(cs) else '')
            if after[:1].isalnum():
                parts.append(' ')
                stats['spaced'] += 1
            parts.append(''.join(text[hi:]))
        t = ''.join(parts)
        if on_row.get(li):
            # C-ODL-3a: the grazing lone marks of this row, after its last word, a word of their own
            row = sorted(on_row[li], key=lambda k: (marks[k]['box'][0], k))
            tail = []
            write(tail, row)
            t = t.rstrip() + ' ' + ''.join(tail) + ' '
        if t == '':
            continue
        out.append(t if t.endswith('\n') else t + '\n')
    return ''.join(out), stats
