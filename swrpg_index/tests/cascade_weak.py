"""Cascade weak-retrieval guard — "I don't know" is reachable, and every hit says how
trustworthy its text is.

Audit `oracle-audit-2026-09-22` F3: the cascade's miss/partial detector could not fire. Its
score gate (`WEAK_SCORE_THRESHOLD = 0.01`) equalled the smallest RRF score any returned hit can
carry, and its keyword check exempted every query without an FFG keyword. Measured 0 fires in
38 probes; "how to bake sourdough bread" came back as the happy path. F9: 31 books have
OCR-hostile text and the oracle was told of two. WP2 (`Docs/briefs/oracle-lap-brief.md`)
replaced the gate with LEG AGREEMENT and stamped `text_quality` / `page_hostile` on every hit.
This guard keeps both executable:

  (a) must-miss      — every `difficulty: must_miss` case in swrpg_index/eval/queries.yaml
                       (8, read from the document, not a hand list) reads `is_weak` or `is_miss`.
  (b) happy-path     — six real rules questions (the four happy-path rows of the audit's §6
                       probe table plus two §3 probes) read `tool_used: "search"`, and every
                       hit carries `text_quality` + `page_hostile`; `is_weak` is present.
  (c) old-gate proof — the minimum RRF score a hit can carry in the cascade's primary search
                       equals the retired threshold, so the OLD gate passes a synthetic
                       single-leg rank-40 hit that the NEW gate calls weak. This documents why
                       the gate was replaced; if pool depth or k ever change, re-read it.
  (e) the narrowing  — ruling `oracle-o7` ADDENDUM 3 (R-O7-6): `cascade.STRONG_LEG_DEPTH` is 5, and
                       `is_strong` keeps today's test (both legs + every word) and adds a two-leg hit
                       within the top 5 of BOTH legs. Synthetic hits pin each side: today-strong stays
                       strong; both legs top 5 without every word reads strong; one leg past 5 (either
                       leg), one leg only, or no leg ranks without every word reads weak. One REAL
                       question pins it end to end: the golden `minion-wound-threshold` reads `search`
                       through the depth clause alone (none of its hits carries every word).
  (f) only weak -> search moves — ruling `oracle-o7` ADDENDUM 6 (R-O7-13): the cascade itself, fed a synthetic
                       search result and relevance count (no topic): both legs top 5 without every word and
                       rel 0 reads `weak` (never partial/miss); both legs + every word with rel 0 reads `miss`
                       as today; both legs top 5 with rel 1 reads `search`; and with STRONG_LEG_DEPTH = 0 the
                       top-5 cases read as before O7 (weak, weak).
  (d) text quality   — the census reaches every class on REAL corpus text (ruling
                       `ingest-rotation-repair` R-IRR-2). LIVE index rows: `allies` clean (repaired
                       by `ocr-rotation-repair`), `eote-beginner` glyph-loss, `eote` clean. NATIVE-LAYER
                       fixture: the registry's `allies` PDF, its EMBEDDED text layer read page by page
                       (never the index, never the OCR cache), classified by the same census over an
                       in-memory table — mojibake. Since the repair no live book is mojibake, so the
                       mojibake witness is the book's own layer; a missing PDF or zero pages is a failure.

Run:
    .venv/bin/python -m swrpg_index.tests.cascade_weak            # all cases
    .venv/bin/python -m swrpg_index.tests.cascade_weak --verbose  # per-query detail

Exit 1 on any failure, each named. States its HARVEST (instrument norm 5); a harvest of zero —
no must_miss case found, or a happy-path query with no hits — is a FAILED run.

MUTANT CHECK (how to prove this guard still bites — each measured when the guard landed):
  * `cascade.is_strong` returns True for any non-empty list (the vacuous gate's behaviour)
    → (a) red on 3 of 8 (pathfinder, boss hp, lockpick DC) and (c) red. The other five are
    ALSO caught by the relevance check's token overlap — the fix has two halves.
  * that AND `_relevance_count` returning `len(hits)` for a no-keyword query again (the old
    exemption) → (a) red on all 8.
  * `cascade.EXPANDED_MIN_VARIANTS = 1` → (a) red on pathfinder and lockpick DC.
  * `text_quality.GLYPH_LOSS_HOSTILE_SHARE = 0.25` (the census's reporting line) → (d) red on
    `eote-beginner` (measured 0.246). Re-measured when the (d) re-point landed: B4 below.
  Measured when the (d) re-point landed (ruling `ingest-rotation-repair` C-IRR-1):
  * (B1) `text_quality.MOJIBAKE_CJK_SHARE = 1.01` → (d) red on the `allies` native-layer fixture
    (reads glyph-loss).
  * (B2) the fixture fed the live index's `allies` chunk text instead of the PDF layer → (d) red on
    the fixture (reads clean).
  * (B3) the fixture's PDF path unresolvable → a named (d) failure, never a skip.
  * (B4) `text_quality.GLYPH_LOSS_HOSTILE_SHARE = 0.25` → (d) red on `eote-beginner`.
"""
import os
import sqlite3
import sys

import yaml

from swrpg_index import DB_PATH
from swrpg_index import api, cascade, text_quality

QUERIES_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                            'eval', 'queries.yaml')

EXPECTED_MUST_MISS = 8

# (e) — R-O7-6's narrowing. The real question is the golden `minion-wound-threshold`'s, verbatim
# (swrpg_index/eval/oracle_golden.yaml): weak at the base (no hit carries every word), search at the tip.
NARROW_DEPTH = 5
NARROW_REAL = "What is the canonical formula for a minion group's wound threshold?"

HAPPY_PATH = [
    # audit §6 probe table — the four rows the pre-WP2 cascade read `search` with 0/5 single-leg
    'minion group wound threshold',
    'starting credits for a new character',
    'creating encounters',
    'Sith career skills',
    # audit §3 — two further probes whose answers were read and page-verified
    'hyperdrive attachment',
    'starting credits 500',
]

TEXT_QUALITY_EXPECT = {                      # the LIVE index
    'allies': text_quality.CLEAN,             # repaired: text_source "ocr" (ruling ocr-rotation-repair)
    'eote-beginner': text_quality.GLYPH_LOSS,
    'eote': text_quality.CLEAN,
}

NATIVE_LAYER_EXPECT = {                       # the book's own embedded text layer (ruling ingest-rotation-repair)
    'allies': text_quality.MOJIBAKE,
}


def _native_layer_pages(alias):
    """Every page's EMBEDDED text layer of the PDF the registry names for `alias` (the ingest's own
    resolution) — never the index, never the OCR cache. Raises on a missing or unopenable PDF."""
    import fitz
    from swrpg_index.utils import load_config, resolve_path
    cfg = load_config()
    src = next((s for s in cfg.get('sources', []) if s.get('alias') == alias), None)
    if src is None:
        raise FileNotFoundError(f'{alias!r} is not in Docs/pdf_sources.json')
    path = resolve_path(cfg, src['path'])
    doc = fitz.open(path)
    try:
        return [doc[i].get_text() for i in range(doc.page_count)]
    finally:
        doc.close()


def _census_of_pages(alias, pages):
    """text_quality's own census over an in-memory chunks table (never `census()`, whose cache keys
    on a file path and mtime and would conflate in-memory databases)."""
    mem = sqlite3.connect(':memory:')
    mem.execute('CREATE TABLE chunks (alias TEXT, page_start INTEGER, content_type TEXT, text TEXT)')
    mem.executemany('INSERT INTO chunks VALUES (?, ?, ?, ?)',
                    [(alias, i + 1, 'rule', t) for i, t in enumerate(pages)])
    c = text_quality._Census(mem)
    mem.close()
    return c.books.get(alias) or {}


def _label(conn, hits, rel):
    """(f): the cascade's own label for a synthetic one-search result — `api.search` returns `hits`,
    `_relevance_count` returns `rel`, no topic is detected; each restored after."""
    saved = (api.search, cascade._relevance_count, cascade._detect_topic)
    api.search = lambda *a, **k: [dict(h) for h in hits]
    cascade._relevance_count = lambda hs, q: rel
    cascade._detect_topic = lambda q: None
    try:
        return cascade.retrieve_rule_for_query(conn, 'synthetic label fixture')['tool_used']
    finally:
        api.search, cascade._relevance_count, cascade._detect_topic = saved


def _hit(allt, br, sr, page):
    return {'alias': 'synthetic', 'page_start': page, 'page_end': page, 'sources': ['bm25', 'semantic'],
            'bm25_all_terms': allt, 'bm25_rank': br, 'sem_rank': sr, 'text_quality': 'clean',
            'page_hostile': False, 'snippet': ''}


def _must_miss_cases():
    with open(QUERIES_PATH, encoding='utf-8') as f:
        doc = yaml.safe_load(f)
    return [c for c in doc.get('cases', []) if c.get('difficulty') == 'must_miss']


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    verbose = '--verbose' in argv or '-v' in argv
    if not os.path.exists(DB_PATH):
        print(f'CASCADE-WEAK GUARD FAILED — no index at {DB_PATH}')
        return 1
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    fails = []
    harvest = {'must_miss': 0, 'happy_hits': 0, 'books': 0}

    # (a) must-miss
    cases = _must_miss_cases()
    harvest['must_miss'] = len(cases)
    if len(cases) != EXPECTED_MUST_MISS:
        fails.append(f'(a) queries.yaml carries {len(cases)} must_miss case(s), expected '
                     f'{EXPECTED_MUST_MISS} — the class shrank or grew; the check is not '
                     f'measuring what it names')
    for c in cases:
        r = cascade.retrieve_rule_for_query(conn, c['query'])
        ok = bool(r.get('is_weak') or r.get('is_miss'))
        if verbose:
            print(f"  (a) {'ok ' if ok else 'RED'} {c['id']:30} tool_used={r['tool_used']!r}")
        if not ok:
            both = [f"{h['alias']} p.{h['page_start']} vm={h.get('variants_matched')}"
                    for h in r['hits'] if len(h.get('sources') or []) == 2]
            fails.append(f"(a) must_miss {c['id']!r} ({c['query']!r}) read "
                         f"tool_used={r['tool_used']!r}, expected weak or miss "
                         f"(two-leg hits: {', '.join(both) or 'none'})")

    # (b) happy-path
    for q in HAPPY_PATH:
        r = cascade.retrieve_rule_for_query(conn, q)
        hits = r.get('hits') or []
        harvest['happy_hits'] += len(hits)
        if verbose:
            print(f"  (b) {'ok ' if r['tool_used'] == 'search' else 'RED'} {q:40} "
                  f"tool_used={r['tool_used']!r} hits={len(hits)}")
        if 'is_weak' not in r:
            fails.append(f'(b) {q!r}: result is MISSING field `is_weak`')
        if not hits:
            fails.append(f'(b) {q!r}: harvest 0 — no hits; the check measured nothing')
            continue
        if r['tool_used'] != 'search':
            fails.append(f"(b) happy-path {q!r} read tool_used={r['tool_used']!r}, expected "
                         f"'search'")
        for i, h in enumerate(hits + (r.get('topic_sources') or [])):
            if 'page_start' not in h:
                continue
            for field in ('text_quality', 'page_hostile'):
                if field not in h:
                    fails.append(f"(b) {q!r}: record {i} ({h.get('alias')} corpus "
                                 f"p.{h.get('page_start')}) is MISSING field `{field}`")

    # (c) the retired gate could not fail
    floor = cascade.min_rrf_score(limit=5)
    rows = [{'id': n, 'alias': 'synthetic', 'page_start': n, 'page_end': n, 'chapter': None,
             'section': None, 'content_type': 'rule', 'text': '', 'book_name': None,
             'tier': None} for n in range(1, 41)]
    fused = api.rrf_fuse(rows, [], k=cascade.RRF_K, limit=40)
    cid, score, meta = fused[-1]
    synthetic = {'sources': sorted(meta['sources']), 'score': score}
    old_gate_passes = score >= cascade.WEAK_SCORE_THRESHOLD
    new_gate_passes = cascade.is_strong([synthetic])
    if verbose:
        print(f"  (c) floor 1/(k+pool) = {floor:.4f} · rank-40 single-leg score {score:.4f} · "
              f"old gate {'PASSES' if old_gate_passes else 'fails'} · new gate "
              f"{'passes' if new_gate_passes else 'calls it WEAK'}")
    if abs(floor - cascade.WEAK_SCORE_THRESHOLD) > 1e-12 or abs(score - floor) > 1e-12:
        fails.append(f'(c) the proof no longer holds as written: floor {floor!r}, rank-40 score '
                     f'{score!r}, retired threshold {cascade.WEAK_SCORE_THRESHOLD!r} — pool '
                     f'depth or k changed; re-read the retired gate\'s arithmetic')
    if not old_gate_passes:
        fails.append('(c) the retired score gate would FAIL the rank-40 single-leg hit — the '
                     'premise of audit F3 no longer holds')
    if new_gate_passes:
        fails.append('(c) the leg-agreement gate calls a single-leg hit STRONG')

    # (e) the narrowing (R-O7-6)
    d = NARROW_DEPTH
    if cascade.STRONG_LEG_DEPTH != d:
        fails.append(f'(e) cascade.STRONG_LEG_DEPTH is {cascade.STRONG_LEG_DEPTH!r}, ruled {d} (R-O7-6)')
    two = ['bm25', 'semantic']
    narrowing = [
        ('today-strong: both legs, every word, rank 40 on each', two, True, 40, 40, True),
        (f'both legs, top {d} of each, not every word', two, False, d, d, True),
        (f'both legs, words rank {d}, meaning rank {d + 1}, not every word', two, False, d, d + 1, False),
        (f'both legs, words rank {d + 1}, meaning rank 1, not every word', two, False, d + 1, 1, False),
        ('both legs, no leg ranks carried, not every word', two, False, None, None, False),
        ('meaning leg only, rank 1', ['semantic'], None, None, 1, False),
        ('words leg only, rank 1, every word', ['bm25'], True, 1, None, False),
    ]
    for name, src, allt, br, sr, want in narrowing:
        got = cascade.is_strong([{'sources': src, 'bm25_all_terms': allt, 'bm25_rank': br, 'sem_rank': sr}])
        harvest['narrowing'] = harvest.get('narrowing', 0) + 1
        if verbose:
            print(f"  (e) {'ok ' if got == want else 'RED'} {name}: is_strong {got}")
        if got != want:
            fails.append(f'(e) {name}: is_strong {got}, expected {want}')
    r = cascade.retrieve_rule_for_query(conn, NARROW_REAL)
    hits = r.get('hits') or []
    allt = [h for h in hits if h.get('bm25_all_terms')]
    if verbose:
        print(f"  (e) {'ok ' if r['tool_used'] == 'search' and not allt else 'RED'} {NARROW_REAL!r}: "
              f"tool_used={r['tool_used']!r}, every-word hits {len(allt)}")
    if not hits:
        fails.append(f'(e) {NARROW_REAL!r}: harvest 0 — no hits; the end-to-end leg measured nothing')
    elif allt:
        fails.append(f'(e) {NARROW_REAL!r}: {len(allt)} hit(s) carry every word, so it cannot show the depth '
                     f'clause alone — re-pick the real question (by ruling, never by deletion)')
    elif r['tool_used'] != 'search':
        fails.append(f"(e) {NARROW_REAL!r} read tool_used={r['tool_used']!r}, expected 'search' through the "
                     f"depth clause (R-O7-6)")

    # (f) only weak -> search moves (R-O7-13)
    top5 = [_hit(False, 2, 3, 1)]
    allw = [_hit(True, 30, 30, 1)]
    labels = [('both legs top 5, not every word, rel 0', top5, 0, None, 'weak'),
              ('both legs + every word, rel 0 (as today)', allw, 0, None, 'miss'),
              ('both legs top 5, not every word, rel 1', top5, 1, None, 'search'),
              ('STRONG_LEG_DEPTH 0: both legs top 5, rel 0', top5, 0, 0, 'weak'),
              ('STRONG_LEG_DEPTH 0: both legs top 5, rel 1', top5, 1, 0, 'weak')]
    for name, hits, rel, depth, want in labels:
        kept = cascade.STRONG_LEG_DEPTH
        if depth is not None:
            cascade.STRONG_LEG_DEPTH = depth
        try:
            got = _label(conn, hits, rel)
        finally:
            cascade.STRONG_LEG_DEPTH = kept
        harvest['labels'] = harvest.get('labels', 0) + 1
        if verbose:
            print(f"  (f) {'ok ' if got == want else 'RED'} {name}: {got}")
        if got != want:
            fails.append(f'(f) {name}: tool_used {got!r}, expected {want!r} (R-O7-13)')

    # (d) text quality
    for alias, want in TEXT_QUALITY_EXPECT.items():
        got = text_quality.book_quality(conn, alias)
        harvest['books'] += 1
        b = text_quality.census(conn).books.get(alias) or {}
        if verbose:
            print(f"  (d) {'ok ' if got == want else 'RED'} {alias:16} {got:10} "
                  f"(hostile_share {b.get('hostile_share')}, cjk_pages {b.get('cjk_pages')}/"
                  f"{b.get('pages')})")
        if got != want:
            fails.append(f'(d) text_quality({alias!r}) = {got!r}, expected {want!r} '
                         f'(hostile_share {b.get("hostile_share")})')
    harvest['fixture_pages'] = 0
    for alias, want in NATIVE_LAYER_EXPECT.items():
        try:
            pages = _native_layer_pages(alias)
        except Exception as exc:  # noqa: BLE001 — any failure to read the layer is a named failure
            fails.append(f'(d) native-layer fixture {alias!r}: could not read the PDF the registry names '
                         f'({type(exc).__name__}: {exc}) — a failure, never a skip')
            continue
        if not pages:
            fails.append(f'(d) native-layer fixture {alias!r}: zero pages read (instrument norm 5)')
            continue
        harvest['books'] += 1
        harvest['fixture_pages'] += len(pages)
        b = _census_of_pages(alias, pages)
        got = b.get('text_quality')
        if verbose:
            print(f"  (d) {'ok ' if got == want else 'RED'} {alias + ' [native layer]':16} {got:10} "
                  f"(pages {b.get('pages')}, cjk_pages {b.get('cjk_pages')}, "
                  f"hostile_share {b.get('hostile_share')})")
        if got != want:
            fails.append(f"(d) native-layer fixture {alias!r} = {got!r}, expected {want!r}: the census no "
                         f"longer classifies a real mojibake text layer as mojibake — or the registry's "
                         f"{alias!r} file no longer carries one (a repointed file re-points this fixture by "
                         f"ruling, never by deletion)")

    conn.close()
    h = (f"harvest: {harvest['must_miss']} must_miss case(s), {len(HAPPY_PATH)} happy-path "
         f"queries / {harvest['happy_hits']} hits, 1 synthetic gate proof, "
         f"{harvest['books']} book class(es), native-layer fixture {harvest['fixture_pages']} page(s), "
         f"{harvest.get('narrowing', 0)} narrowing fixture(s) + 1 real question, {harvest.get('labels', 0)} label fixture(s)")
    if harvest['must_miss'] == 0 or harvest['happy_hits'] == 0:
        fails.append('harvest is zero — the guard measured nothing (instrument norm 5)')
    if fails:
        print(f'CASCADE-WEAK GUARD FAILED — {len(fails)} failure(s); {h}')
        for f in fails:
            print('  ' + f)
        return 1
    print(f'cascade-weak guard OK — {h}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
