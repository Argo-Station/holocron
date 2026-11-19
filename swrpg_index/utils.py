"""Shared helpers: config loading, path resolution, text cleanup, tier tagging."""
import json
import os
import re
import sys

SCRIPT_DIR    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH   = os.path.join(SCRIPT_DIR, 'Docs', 'pdf_sources.json')
DB_PATH       = os.path.join(SCRIPT_DIR, 'Docs', 'swrpg_index.db')
# The community documents' own index (card respecialized-docs-index ADDENDUM 3, R-RDI-3-2): same schema, never
# ranked with the books, so the books' term statistics stay the books' alone.
COMMUNITY_DB_PATH = os.path.join(SCRIPT_DIR, 'Docs', 'swrpg_community.db')
OCR_CACHE_DIR = os.path.join(SCRIPT_DIR, 'Docs', 'ocr_cache')
TOC_MD_PATH   = os.path.join(SCRIPT_DIR, 'Docs', 'pdf_toc_index.md')
TOC_JSON_PATH = os.path.join(SCRIPT_DIR, 'Docs', 'pdf_toc_index.json')


def load_config():
    if not os.path.exists(CONFIG_PATH):
        raise FileNotFoundError(f'Config not found at {CONFIG_PATH}')
    with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)


def resolve_path(cfg, path_str):
    if path_str.startswith('icloud:'):
        base = cfg.get('icloud_base', '')
        return os.path.join(base, path_str[7:])
    if os.path.isabs(path_str):
        return path_str
    return os.path.join(SCRIPT_DIR, path_str)


def resolve_pdf(cfg, alias_or_path):
    """Return (absolute_path, source_dict) or (path, None) if a raw path was passed."""
    for src in cfg.get('sources', []):
        if src['alias'] == alias_or_path:
            return resolve_path(cfg, src['path']), src
    if os.path.exists(alias_or_path):
        return alias_or_path, None
    rel = os.path.join(SCRIPT_DIR, alias_or_path)
    if os.path.exists(rel):
        return rel, None
    raise FileNotFoundError(
        f'"{alias_or_path}" is not a known alias or file path. '
        f'Known: {", ".join(s["alias"] for s in cfg.get("sources", []))}'
    )


# ── Which index a book lives in (R-RDI-3-1, R-RDI-3-3) ─────────────────────
# A registry row's optional `index` is a closed vocabulary: "books" (absent = books) or "community". THE ONE
# alias→DB rule is db_path_for_alias below; a second one anywhere is a defect (R-RDI-3-3).

INDEXES = ('books', 'community')


def index_of(src):
    """The registry row's index word. Refuses a word outside the closed vocabulary."""
    word = src.get('index', 'books')
    if word not in INDEXES:
        raise ValueError(f'{src.get("alias")!r}: index {word!r} is not one of {INDEXES}')
    return word


def db_path_for_corpus(corpus):
    if corpus not in INDEXES:
        raise ValueError(f'corpus {corpus!r} is not one of {INDEXES}')
    return COMMUNITY_DB_PATH if corpus == 'community' else DB_PATH


def corpus_for_alias(alias, cfg=None):
    """The index an alias's registry row names; an alias the registry does not know is a books alias, so
    an unknown name fails exactly as it did before there were two indexes."""
    cfg = cfg if cfg is not None else load_config()
    for src in cfg.get('sources', []):
        if src['alias'] == alias:
            return index_of(src)
    return 'books'


def db_path_for_alias(alias, cfg=None):
    """THE router: the DB file an alias is ingested into and read from."""
    return db_path_for_corpus(corpus_for_alias(alias, cfg))


def parse_page_range(s):
    """'1-5,10,12-13' → [0, 1, 2, 3, 4, 9, 11, 12] (0-indexed)."""
    pages = set()
    for part in s.split(','):
        part = part.strip()
        if not part:
            continue
        if '-' in part:
            a, b = part.split('-', 1)
            for p in range(int(a), int(b) + 1):
                pages.add(p - 1)
        else:
            pages.add(int(part) - 1)
    return sorted(pages)


# ── Text cleanup ────────────────────────────────────────────────────────────
# OCR output has ligature drops, mid-word line breaks, and repeated running
# headers/page-number stragglers. We normalize before indexing so FTS5 doesn't
# eat noise tokens and BM25 doesn't get skewed by header repetition.

# Running headers seen repeatedly in FFG books across pages — strip when isolated.
_RUNNING_HEADER_RE = re.compile(
    r'^\s*(?:EDGE OF THE EMPIRE|AGE OF REBELLION|FORCE AND DESTINY|'
    r'CORE RULEBOOK|BEGINNER GAME|GAME MASTER\'?S KIT|'
    r'SOURCEBOOK|SPECIES MENAGERIE|TABLE OF CONTENTS)\s*$',
    re.IGNORECASE | re.MULTILINE,
)
# Lone-number lines (1–4 digits on their own line). Ruling `b861-folio-strip` C-B861-1: a match is REMOVED
# only when its value is in the page's FOLIO SET (the page's own printed page number); every other match is
# kept byte-for-byte. The pattern's shape is the pre-B-861 one, unchanged, so a folio line is removed exactly
# as it always was — only the choice of WHICH matches to remove changed. (B-861: the old rule removed every
# match, 15,255 table cells and prose numbers library-wide among them.)
_PAGE_NUMBER_RE = re.compile(r'^\s*(\d{1,4})\s*$', re.MULTILINE)
# One lone-number line, not spanning newlines — what folio DETECTION and the census count.
_LONE_NUMBER_LINE_RE = re.compile(r'^[ \t]*(\d{1,4})[ \t]*$', re.MULTILINE)
# Excessive blank runs.
_BLANK_RUN_RE = re.compile(r'\n{3,}')
# Stretched whitespace from column spacing.
_STRETCHED_SPACE_RE = re.compile(r'[ \t]{4,}')
# Hyphenated line wraps: "encoun-\ntered" → "encountered".
_HYPHEN_WRAP_RE = re.compile(r'(\w)-\n(\w)')
# Orphan single-character lines common in OCR of decorative text.
_ORPHAN_CHAR_RE = re.compile(r'^\s*[^\w\s]{1,2}\s*$', re.MULTILINE)
# C-ODT-4 (ruling `oracle-o3-damage-truth`, B-825): a matched line whose every non-space character is in
# text_quality's junk class is a LOST SYMBOL (a die the scan could not read), not decoration, and stays verbatim;
# every other match is removed as before. The class is text_quality._JUNK_RE's (guard tests.damage_truth (iv)).
# EXCEPT a line made only of `¢` or only of `°` (ruling `oracle-o3-damage-truth-reingest-drift` ADDENDUM 1 ANSWER):
# the old scans typed list bullets as `¢` and map dots, ornaments and checkboxes as `°`, so those lines are deleted.
LOST_SYMBOL_CHARS = '@®º°≤≥§¶¤¥¢£€'
NOT_LOST_ALONE = ('¢', '°')


def _orphan_repl(m):
    s = ''.join(m.group(0).split())
    if not s or not all(c in LOST_SYMBOL_CHARS for c in s) or any(set(s) == {c} for c in NOT_LOST_ALONE):
        return ''
    return m.group(0)


def clean_page_text(text, folios=None):
    """Normalise one page's text for the index.

    `folios` is the page's FOLIO SET (ruling `b861-folio-strip` C-B861-1/2): the printed page number(s)
    that page carries, from `book_folios` below. A lone 1–4-digit line is removed iff its value is in the
    set. None or empty (a caller with no page context, C-B861-3) removes NO lone number — keeping a number
    is safe; deleting one is the defect."""
    if not text:
        return ''
    # De-hyphenate wraps first so the wrapped word tokenizes cleanly.
    text = _HYPHEN_WRAP_RE.sub(r'\1\2', text)
    text = _RUNNING_HEADER_RE.sub('', text)
    if folios:
        text = _PAGE_NUMBER_RE.sub(lambda m: '' if int(m.group(1)) in folios else m.group(0), text)
    text = _ORPHAN_CHAR_RE.sub(lambda m: _orphan_repl(m), text)   # C-ODT-4 (looked up per call: the guard's mutant)
    text = _STRETCHED_SPACE_RE.sub('   ', text)
    text = _BLANK_RUN_RE.sub('\n\n', text)
    return text.strip()


# ── The folio set (ruling `b861-folio-strip` C-B861-2) ──────────────────────
# A CALIBRATED book's folio on corpus page p is `pdf_pages.to_printed(alias, p)` — the one converter, never a
# hand-typed offset. An UNCALIBRATED book's folio relation is DETECTED from its own lone-number lines and is
# used ONLY to choose which lone numbers to strip: it is never written to the registry, the index or anywhere
# else as a calibration (R-OAL-1: a calibration is a human page read). A book with no relation that clears ALL
# three thresholds below strips nothing.
#
# The thresholds, measured on the 100-book registry at a0ae95fe (Docs/audit_artifacts/b861_folio_strip/):
#   support  = pages that carry a lone line equal to the relation's folio for that page
#   FOLIO_MIN_PAGES   support >= 8 pages          (the 8-page character folios cannot clear it: their stat
#                                                   columns hit small page numbers by chance)
#   FOLIO_MIN_SHARE   support >= 25% of the pages that carry ANY lone-number line
#   FOLIO_MIN_LEAD    support >= 2.5 x the best OTHER relation's support
# Margins at measurement: nearest pass lostk (11 vs 4 = 2.75x), nearest fail gadgets (19 vs 10 = 1.9x).
FOLIO_MIN_PAGES = 8
FOLIO_MIN_SHARE = 0.25
FOLIO_MIN_LEAD = 2.5


def lone_numbers(text):
    """The values of `text`'s lone 1–4-digit lines, in order (one per line)."""
    return [int(m.group(1)) for m in _LONE_NUMBER_LINE_RE.finditer(text or '')]


def _pick(counter, pages_with_any):
    """(key, support, runner_up_support) when counter's leader clears all three thresholds, else None."""
    if not counter:
        return None
    ranked = counter.most_common(2)
    key, support = ranked[0]
    runner = ranked[1][1] if len(ranked) > 1 else 0
    if support < FOLIO_MIN_PAGES:
        return None
    if support < FOLIO_MIN_SHARE * pages_with_any:
        return None
    if support < FOLIO_MIN_LEAD * runner:
        return None
    return key, support, runner


def detect_folio_relation(pages):
    """Detect a book's folio relation from its own text. `pages` is an iterable of (corpus_page, raw_text).

    Two shapes are tried. SINGLE: folio = corpus_page - d, one per page. SPREAD (two-up, C-B861-2's last
    clause): folios = {2*corpus_page + c, 2*corpus_page + c + 1}, and a page supports c only when BOTH are
    lone lines on it. SINGLE is taken when it clears the thresholds; SPREAD only when SINGLE does not.

    Returns a dict: {'kind': 'single'|'spread'|None, 'value': d|c|None, 'support', 'runner_up',
    'pages_with_any', 'single_top', 'spread_top'} — the *_top fields are the leaders whether or not they
    cleared, so a report can say how close a book came."""
    import collections
    single = collections.Counter()
    spread = collections.Counter()
    pages_with_any = 0
    for corpus_page, text in pages:
        vals = set(lone_numbers(text))
        if not vals:
            continue
        pages_with_any += 1
        for d in {corpus_page - v for v in vals}:
            single[d] += 1
        for v in vals:
            if v + 1 in vals:
                spread[v - 2 * corpus_page] += 1
    out = {'kind': None, 'value': None, 'support': 0, 'runner_up': 0, 'pages_with_any': pages_with_any,
           'single_top': single.most_common(2), 'spread_top': spread.most_common(2)}
    for kind, counter in (('single', single), ('spread', spread)):
        hit = _pick(counter, pages_with_any)
        if hit:
            out.update(kind=kind, value=hit[0], support=hit[1], runner_up=hit[2])
            break
    return out


def book_folios(alias, pages, pagemap=None):
    """The folio set for every page of one book. `pages` is a list of raw page texts, index 0 = corpus page 1
    (the text `clean_page_text` is about to receive). Returns (folios_for, info):

      folios_for(corpus_page) -> frozenset of ints (empty = strip no lone number on that page)
      info = {'source': 'registry'|'registry-runs'|'detected'|'none', 'offset': registry offset or None,
              'detected': detect_folio_relation(...)'s dict, 'disagrees': bool}

    `disagrees` is True when a CALIBRATED book's detection cleared the thresholds and names a relation other
    than its registry offset. The registry still wins for stripping (C-B861-2); the caller reports the book."""
    from . import pdf_pages
    pm = pagemap if pagemap is not None else pdf_pages._map()
    det = detect_folio_relation(enumerate(pages, 1))
    info = {'source': 'none', 'offset': None, 'detected': det, 'disagrees': False}
    empty = frozenset()

    if pm.status(alias) == pdf_pages.CALIBRATED:
        info['source'] = 'registry'
        info['offset'] = pm.offset(alias)
        info['disagrees'] = det['kind'] is not None and not (
            det['kind'] == 'single' and det['value'] == pm.offset(alias))

        def folios_for(corpus_page):
            printed = pm.to_printed(alias, corpus_page)
            return frozenset({printed}) if printed is not None and printed >= 1 else empty
        return folios_for, info

    if pm.status(alias) == pdf_pages.MAPPED:
        # B-1850: a book mapped by page runs (C-C1P-4) strips the folios its runs print, read through the converter;
        # a step-2 spread page prints its run's folio and the next. Detection is reported beside it, never used.
        info['source'] = 'registry-runs'
        runs = pm.runs(alias)

        def folios_for(corpus_page):
            printed = pm.to_printed(alias, corpus_page)
            if printed is None or printed < 1:
                return empty
            two = any(r['step'] == 2 and r['from'] <= corpus_page <= r['to'] for r in runs)
            return frozenset({int(printed), int(printed) + 1} if two else {int(printed)})
        return folios_for, info

    if det['kind'] == 'single':
        info['source'] = 'detected'
        d = det['value']

        def folios_for(corpus_page):
            v = corpus_page - d
            return frozenset({v}) if v >= 1 else empty
        return folios_for, info

    if det['kind'] == 'spread':
        info['source'] = 'detected'
        c = det['value']

        def folios_for(corpus_page):
            return frozenset(v for v in (2 * corpus_page + c, 2 * corpus_page + c + 1) if v >= 1)
        return folios_for, info

    return (lambda corpus_page: empty), info


def describe_folios(alias, info):
    """One log line for a book's folio source. A detected relation is labelled strip-only, never a calibration."""
    det = info['detected']
    if info['source'] == 'registry':
        line = f'{alias}: folios from the registry offset {info["offset"]:+d} (pdf_pages.to_printed)'
        if info['disagrees']:
            line += (f' — DISAGREES with detection ({det["kind"]} {det["value"]:+d}, support {det["support"]} '
                     f'of {det["pages_with_any"]}); the registry wins (C-B861-2)')
        return line
    if info['source'] == 'registry-runs':
        return f'{alias}: folios from the registry page runs (pdf_pages.to_printed; B-1850)'
    if info['source'] == 'detected':
        return (f'{alias}: folios DETECTED for stripping only, not a calibration — {det["kind"]} '
                f'{det["value"]:+d}, support {det["support"]} of {det["pages_with_any"]} pages, runner-up '
                f'{det["runner_up"]}')
    return f'{alias}: no folio relation clears the thresholds — no lone number is stripped'


# ── Tier / book-line classification ─────────────────────────────────────────
# Used at ingest time to tag every chunk so we can filter by `--tier beginner`
# at query time. Matches the STRICT RULES pattern used in vet-agent prompts.

# Tier `core` is the three core rulebooks and their copies (plus _GM_KITS below) — nothing else (C-OHY-2).
# The oracle prefers a core hit for a RAW question, so a sourcebook, the adversary cards or a fan compilation
# counted here was preferred as rules text: `holocron`, `talent-index`, `adversary-cards`, `ships` and
# `gadgets` fall to classify_tier's default, `supplement` (ruling oracle-o3-hygiene, B-810). A change here
# reaches the live index only through `swrpg_index.py sync-registry`, never by itself.
_CORE_ALIASES = {'eote', 'aor', 'fad', 'fad-ocr', 'fad-lite'}
_BEGINNER_ALIASES = {'eote-beginner', 'aor-beginner', 'fad-beginner'}
_CAREER_EOTE = {'bounty', 'colonist', 'explorer', 'hired', 'smuggler', 'tech'}
_CAREER_AOR  = {'commander', 'diplomat', 'engineer', 'pilot', 'soldier', 'spy'}
_CAREER_FAD  = {'guardian', 'consular', 'mystic', 'seeker', 'sentinel', 'warrior'}
_ERA_SUPPLEMENT = {
    'corellia', 'hutt', 'alliance', 'forceworlds',
    'dawn', 'collapse', 'separatists', 'old-republic', 'atlas',
}
_GM_KITS = {'eote-gm', 'aor-gm', 'fad-gm'}


def classify_tier(alias):
    if alias in _BEGINNER_ALIASES:          return 'beginner'
    if alias.startswith('folio-'):          return 'beginner'
    if alias in _CORE_ALIASES:              return 'core'
    if alias in _GM_KITS:                   return 'core'
    if alias in _CAREER_EOTE | _CAREER_AOR | _CAREER_FAD:
        return 'advanced'
    if alias in _ERA_SUPPLEMENT:            return 'supplement'
    return 'supplement'


def classify_book_line(alias):
    if alias in _BEGINNER_ALIASES:          return 'beginner-game'
    if alias.startswith('folio-'):          return 'folio'
    if alias == 'holocron':                 return 'holocron'
    if alias == 'atlas':                    return 'atlas'
    if alias in _GM_KITS:
        return 'gm-kit-' + alias.replace('-gm', '')
    if alias == 'eote' or alias in _CAREER_EOTE: return 'eote'
    if alias == 'aor'  or alias in _CAREER_AOR:  return 'aor'
    if alias in ('fad', 'fad-ocr', 'fad-lite') or alias in _CAREER_FAD: return 'fad'
    if alias in _ERA_SUPPLEMENT:            return 'supplement'
    if alias in ('ships', 'gadgets', 'talent-index', 'adversary-cards'): return 'shared'
    return 'shared'


# ── Aliases allowed per tier (vet-agent STRICT RULES mirror) ────────────────

def aliases_for_tier(tier):
    """Return a set of alias strings that an agent running at `tier` should be
    allowed to query. Matches the prompt-level STRICT RULES documented in
    memory/feedback_qa_rulebook_access.md."""
    if tier == 'beginner':
        return set(_BEGINNER_ALIASES) | {a for a in _allowed_folios()}
    if tier == 'mid':
        return {'eote', 'aor', 'fad', 'fad-ocr', 'fad-lite', 'holocron',
                'ships', 'gadgets', 'talent-index', 'adversary-cards'} \
            | _CAREER_EOTE | _CAREER_AOR | _CAREER_FAD | set(_GM_KITS)
    if tier == 'late':
        return aliases_for_tier('mid') | _ERA_SUPPLEMENT | {'old-republic', 'atlas'}
    # 'any' / None → no filter
    return None


def _allowed_folios():
    # Folio aliases are enumerated at runtime from config — the set is
    # ever-growing. For simplicity we treat ALL folios as beginner-tier.
    # (The ingest pipeline uses classify_tier() which already marks folio-*
    # as beginner.)
    return []


def fail(msg, code=1):
    print(f'ERROR: {msg}', file=sys.stderr)
    sys.exit(code)
