"""Shared pieces of the corpus-wide recall benchmark (ruling `oracle-recall-benchmark`, C-ORB-1..9).

Everything that decides a NUMBER lives here, so the guard (`swrpg_index.tests.recall_scoring`) pins
one copy of it:

  address()        C-ORB-1 — a site is keyed by {alias, family, corpus pages, anchor}; never by an id
  family_of()      cascade's canonical alias (fad / fad-ocr / fad-lite / fad-beginner are one family)
  pagination_of()  the aliases whose corpus page numbers mean the same page (fad, fad-ocr, fad-lite are
                   one PDF; fad-beginner is another book in the same family, with its own page numbers)
  hit_matches()    C-ORB-5 — a hit in the site's family whose page range overlaps the site's pages
  max_shared_run() C-ORB-3's leakage bar — the longest run of consecutive words a question shares
                   with its passage (normalised, case-folded)
  answers_agree()  C-ORB-4 — the round-trip filter's agreement rule (numbers must match exactly)
  wilson()         the 95 % Wilson interval every reported rate carries

No LLM, no network, no writes. Read-only against whatever connection it is handed.
"""
import hashlib
import math
import re

from ... import cascade as _cascade

# ── C-ORB-1: the address ──────────────────────────────────────────────────

ANCHOR_CHARS = 80
MIN_CHARS = 200                                  # passages shorter than this are excluded
EXCLUDED_TYPES = ('toc', 'verified_table')       # overlays, not book text

# Aliases that are the SAME PDF pages under another extraction. Their corpus page N is one page.
# Measured 2026-09-23 on the live index: fad ∩ fad-ocr ∩ fad-lite = 698 of ~705 passages
# byte-identical after whitespace normalisation, same page_count (452).
_PAGINATION = {'fad-ocr': 'fad', 'fad-lite': 'fad'}


def normalise(text):
    """Whitespace-collapsed text: the form every anchor and hash is taken over."""
    return ' '.join((text or '').split())


def text_sha1(text):
    return hashlib.sha1(normalise(text).encode('utf-8')).hexdigest()


def family_of(alias):
    return _cascade.canonical_alias(alias)


def pagination_of(alias):
    return _PAGINATION.get(alias, alias)


def address(alias, page_start, page_end, text):
    """C-ORB-1. The only key a site carries. No chunk or passage id, ever."""
    n = normalise(text)
    return {
        'alias': alias,
        'family': family_of(alias),
        'corpus_page_start': int(page_start),
        'corpus_page_end': int(page_end),
        'anchor': n[:ANCHOR_CHARS],
        'anchor_sha1': hashlib.sha1(n.encode('utf-8')).hexdigest(),
    }


def site_id(addr):
    """A stable short name derived from the address (so re-ingest cannot re-mint it)."""
    key = '|'.join(str(addr[k]) for k in ('alias', 'corpus_page_start', 'corpus_page_end', 'anchor_sha1'))
    return hashlib.sha1(key.encode('utf-8')).hexdigest()[:12]


def resolve(conn, site):
    """Does this address still name a passage on `conn`'s index?
    'exact'  — same alias, same pages, same text hash
    'anchor' — same alias and pages, text changed but the first 80 characters survive
    'unresolved' — neither (C-ORB-9: reported, never dropped)."""
    rows = conn.execute(
        'SELECT text FROM passages WHERE alias=? AND page_start=? AND page_end=?',
        (site['alias'], site['corpus_page_start'], site['corpus_page_end'])).fetchall()
    status = 'unresolved'
    for (t,) in rows:
        n = normalise(t)
        if hashlib.sha1(n.encode('utf-8')).hexdigest() == site['anchor_sha1']:
            return 'exact'
        if n[:ANCHOR_CHARS] == site['anchor']:
            status = 'anchor'
    return status


# ── C-ORB-5: the hit rule ─────────────────────────────────────────────────

def pages_overlap(a_start, a_end, b_start, b_end):
    return a_start <= b_end and b_start <= a_end


def hit_matches(site, hit, pagination=True):
    """A hit counts for a site iff it is in the site's family AND its page range overlaps the site's.
    With `pagination` (the headline rule) the hit must also be in the site's pagination group: page 13
    of fad-beginner is not page 13 of fad, though both are the fad family. `pagination=False` is the
    literal family-only reading, reported beside it so the difference is measured, not assumed."""
    alias = hit.get('alias')
    if alias is None or family_of(alias) != site['family']:
        return False
    if pagination and pagination_of(alias) != pagination_of(site['alias']):
        return False
    return pages_overlap(int(hit['page_start']), int(hit['page_end']),
                         site['corpus_page_start'], site['corpus_page_end'])


def first_hit_rank(site, hits, pagination=True):
    """1-based rank of the first matching hit, or None."""
    for i, h in enumerate(hits, 1):
        if hit_matches(site, h, pagination=pagination):
            return i
    return None


# ── C-ORB-3: leakage ──────────────────────────────────────────────────────

_WORD = re.compile(r"[a-z0-9]+(?:'[a-z0-9]+)*")


def words(text):
    return _WORD.findall((text or '').lower())


def max_shared_run(question, passage):
    """Longest run of consecutive words the question shares with the passage."""
    q, p = words(question), words(passage)
    if not q or not p:
        return 0
    best = 0
    prev = [0] * (len(p) + 1)
    for i in range(1, len(q) + 1):
        cur = [0] * (len(p) + 1)
        qi = q[i - 1]
        for j in range(1, len(p) + 1):
            if qi == p[j - 1]:
                cur[j] = prev[j - 1] + 1
                if cur[j] > best:
                    best = cur[j]
        prev = cur
    return best


LEAKAGE_BAR = 4   # a run of this many consecutive shared words fails the question


# ── C-ORB-4: answer agreement ─────────────────────────────────────────────

_NUMBER_WORDS = {
    'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4', 'five': '5', 'six': '6',
    'seven': '7', 'eight': '8', 'nine': '9', 'ten': '10', 'eleven': '11', 'twelve': '12',
    'once': '1', 'twice': '2', 'single': '1', 'double': '2',
}
_STOP = set('''a an the of to in on for by with and or is are be as at it its this that these those
from into per each any all can may must will when if then than your you their they he she his her
which who what how does do has have had not no only also more most less'''.split())


def _answer_tokens(text):
    toks = []
    for w in words(text.replace(',', '')):
        w = _NUMBER_WORDS.get(w, w)
        if w.endswith('s') and len(w) > 3 and not w.isdigit():
            w = w[:-1]
        toks.append(w)
    nums = sorted({t for t in toks if t.isdigit()})
    content = {t for t in toks if not t.isdigit() and t not in _STOP}
    return nums, content


WORD_CONTAINMENT = 0.6


def answers_agree(recorded, independent):
    """Round-trip agreement (C-ORB-4). The SET of numbers must match EXACTLY (number words folded
    to digits; "3 (Pierce 3)" and "3" carry the same number); the words must overlap by >= 60 % of the shorter answer's content words.
    Returns (agree, reason)."""
    if not recorded or not independent:
        return False, 'empty answer'
    if 'not_answerable' in independent.lower().replace(' ', '_'):
        return False, 'filter: not answerable from the passage'
    na, ca = _answer_tokens(recorded)
    nb, cb = _answer_tokens(independent)
    if na or nb:
        if na != nb:
            return False, f'numbers differ {na} vs {nb}'
    if ca and cb:
        share = len(ca & cb) / min(len(ca), len(cb))
        if share < WORD_CONTAINMENT:
            return False, f'words overlap {share:.2f} < {WORD_CONTAINMENT}'
    elif ca or cb:
        if not (na and na == nb):
            return False, 'one answer has no content words'
    return True, 'agree'


def answer_in_text(answer, text):
    """HEURISTIC, reported beside hit@5 and never instead of it: does `text` carry every number and
    every content word of `answer`? Answers too thin to discriminate (fewer than two content words,
    and not a number with a word) return None, so "Human" or "4" never counts."""
    na, ca = _answer_tokens(answer)
    if not (len(ca) >= 2 or (na and ca)):
        return None
    nt, ct = _answer_tokens(text)
    return set(na) <= set(nt) and ca <= ct


# ── Intervals ─────────────────────────────────────────────────────────────

def wilson(k, n, z=1.96):
    """95 % Wilson score interval for k successes in n. Returns (low, high); (0, 0) for n == 0."""
    if n == 0:
        return (0.0, 0.0)
    p = k / n
    den = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / den
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return (max(0.0, centre - half), min(1.0, centre + half))


def rate_row(k, n):
    lo, hi = wilson(k, n)
    return {'k': k, 'n': n, 'rate': (k / n) if n else None, 'ci95': [round(lo, 4), round(hi, 4)]}


# ── D-ORB3(b): answer-bearing@5 (ruling `oracle-o2c-answer-bearing`, C-OBA-4/5/7) ──
#
# A miss by ADDRESS is judged page by page: does each of its top-5 pages state the site's key?
# BOOK = pagination group (the printed book); LINE = family (a beginner box shares its core's line).
# Keying on family would call a core rulebook's reprint of a beginner-box fact "the same book" and
# hide exactly the class F3/F4 is about.

VERDICTS = ('carries', 'conflicts', 'absent')        # C-OBA-4: a durable vocabulary (R-Y2-1)
MISS_CLASSES = ('SAME-BOOK', 'REPRINT', 'CONFLICT', 'LOSS')
PROBE_CLASSES = ('REACHABLE', 'UNREACHABLE', 'UNPROBED')


def book_of(alias):
    return pagination_of(alias)


def line_of(alias):
    return family_of(alias)


def classify_miss(site, pages):
    """C-OBA-5. `pages`: the miss's judged top-5, each {'alias', 'verdict'}; verdict None means
    read_pages returned nothing for it (counted, never judged on a snippet — C-OBA-3).
    First class met, in order: SAME-BOOK (a page of the site's own book carries) · REPRINT (a page
    of another book carries; scope 'in-line' when one such page shares the site's line, else
    'cross-line') · CONFLICT (nothing carries, a page conflicts) · LOSS (nothing carries or conflicts).
    Returns (class, reprint_scope)."""
    for p in pages:
        if p['verdict'] is not None and p['verdict'] not in VERDICTS:
            raise ValueError(f"verdict outside C-OBA-4's vocabulary: {p['verdict']!r}")
    carrying = [p for p in pages if p['verdict'] == 'carries']
    own = book_of(site['alias'])
    if any(book_of(p['alias']) == own for p in carrying):
        return 'SAME-BOOK', None
    if carrying:
        in_line = any(line_of(p['alias']) == site['family'] for p in carrying)
        return 'REPRINT', 'in-line' if in_line else 'cross-line'
    if any(p['verdict'] == 'conflicts' for p in pages):
        return 'CONFLICT', None
    return 'LOSS', None


def answer_bearing(site_class):
    """answer-bearing@5 counts a site when the fact is on one of its five pages: HIT (by address),
    SAME-BOOK or REPRINT. CONFLICT and LOSS do not."""
    return site_class in ('HIT', 'SAME-BOOK', 'REPRINT')


def key_is_thin(answer):
    """The key is too thin to ask with (the rule `answer_in_text` already applies: fewer than two
    content words and not a number with a word)."""
    return answer_in_text(answer, '') is None


def probe_class(answer, hit5):
    """C-OBA-7. The damaged-text test: asked with its own key, does the site's page come back?
    UNPROBED when the key is thin (never guessed)."""
    if key_is_thin(answer):
        return 'UNPROBED'
    return 'REACHABLE' if hit5 else 'UNREACHABLE'
