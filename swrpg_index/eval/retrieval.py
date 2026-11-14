"""Fast retrieval-only eval.

Reads `queries.yaml`, calls `api.search` or `api.topic` directly (no MCP,
no agent, no API), and reports whether each case's required references
appear in the top-K results and whether any forbidden references leaked.

Scoring:
    * A case passes when all `required: true` expected_refs are hit AND
      no `must_not_cite` entries appear in top-K.
    * Easy/medium/hard/adversarial/negative are reported as separate
      aggregate scores so a drop in one bucket is diagnostic.
    * `must_miss` cases (`tool: cascade`) run through the retrieval
      CASCADE (`cascade.retrieve_rule_for_query`) and pass iff the result
      reads `is_weak` or `is_miss` — an out-of-corpus query must not come
      back as a happy path (audit `oracle-audit-2026-09-22` F3).
    * The WEAK COUNT on the legacy cases (every case that is not a
      `must_miss` cascade case — 26 today) is REPORTED, not graded: each
      legacy query is also run through the cascade exactly as the oracle
      calls it (query only, default limit) and the summary prints how many
      read `tool_used: "weak"`. Weak is a warning, not a verdict; the
      number is printed so a regression that pushes real questions into
      weak shows up (ruling `oracle-audit-lap` R-OAL-6; 8/26 at ruling).

Usage:
    python3 -m swrpg_index.eval.retrieval
    python3 -m swrpg_index.eval.retrieval --json          # machine-readable
    python3 -m swrpg_index.eval.retrieval --only hard     # one difficulty
    python3 -m swrpg_index.eval.retrieval --case nemesis_how_to_run --verbose

This runs in milliseconds once the embedder is loaded (first semantic
case pays the ~3s cold-start; everything after is matmul). Safe to run
on every commit.
"""
import argparse
import json
import os
import sqlite3
import sys
from collections import defaultdict

import yaml

sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

from .. import api as _api
from .. import cascade as _cascade
from ..utils import DB_PATH


QUERIES_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'queries.yaml')


# ── YAML loader ────────────────────────────────────────────────────────────

def load_cases(path=QUERIES_PATH):
    with open(path, 'r', encoding='utf-8') as f:
        doc = yaml.safe_load(f)
    cases = doc.get('cases', [])
    for c in cases:
        c.setdefault('tool', 'search')
        c.setdefault('mode', 'hybrid')
        c.setdefault('k', 5)
        c.setdefault('difficulty', 'medium')
        c.setdefault('expected_refs', [])
        c.setdefault('must_not_cite', [])
    return cases


# ── Hit-test helpers ───────────────────────────────────────────────────────

def _ranges_overlap(a, b):
    """a and b are [start, end] inclusive. True if they intersect."""
    return a[0] <= b[1] and b[0] <= a[1]


def _match_ref(ref, result_alias, result_pages):
    """Does a single result (alias + [page_start, page_end]) satisfy this
    expected_ref? alias match + page range overlap."""
    if ref.get('alias') != result_alias:
        return False
    pr = ref.get('page_range')
    if not pr:
        return True
    return _ranges_overlap(list(pr), result_pages)


def _match_forbidden(entry, result_alias, result_section):
    """Does a single result trip a must_not_cite entry?"""
    if 'alias' in entry and result_alias != entry['alias']:
        return False
    sc = entry.get('section_contains', '')
    if sc and sc.lower() not in (result_section or '').lower():
        return False
    # At least one dimension must have been specified
    return 'alias' in entry or 'section_contains' in entry


# ── Case runners ───────────────────────────────────────────────────────────

def run_search_case(conn, case):
    results = _api.search(
        conn,
        case['query'],
        mode=case.get('mode', 'hybrid'),
        alias=case.get('alias'),
        tier=case.get('tier'),
        content_type=case.get('content_type'),
        limit=case.get('k', 5),
        boost_tables=case.get('boost_tables', False),
    )
    simplified = [
        {
            'alias': r['alias'],
            'pages': [r['page_start'], r['page_end']],
            'section': r.get('section'),
        }
        for r in results
    ]
    return simplified


def run_search_expanded_case(conn, case):
    """Run a case through api.search_expanded with the YAML-specified variants."""
    variants = case.get('variants') or [case['query']]
    results = _api.search_expanded(
        conn, variants,
        mode=case.get('mode', 'hybrid'),
        alias=case.get('alias'),
        tier=case.get('tier'),
        content_type=case.get('content_type'),
        limit=case.get('k', 5),
        boost_tables=case.get('boost_tables', False),
    )
    return [
        {'alias': r['alias'], 'pages': [r['page_start'], r['page_end']],
         'section': r.get('section')}
        for r in results
    ]


def run_topic_case(conn, case):
    result = _api.topic(conn, case['query'])
    simplified = []
    for s in result.get('sources', []):
        if 'page_start' not in s:
            continue
        simplified.append({
            'alias': s['alias'],
            'pages': [s['page_start'], s['page_end']],
            'section': s.get('title'),
        })
    return simplified


def run_cascade_case(conn, case):
    """Run a case through the cascade. Returns (simplified hits, raw payload)."""
    payload = _cascade.retrieve_rule_for_query(
        conn, case['query'], limit=case.get('k', 5), alias=case.get('alias'),
    )
    hits = [
        {'alias': r['alias'], 'pages': [r['page_start'], r['page_end']],
         'section': r.get('section')}
        for r in payload.get('hits') or []
    ]
    return hits, payload


def legacy_weak_count(conn, cases):
    """(weak, total, tool_used tally) over the legacy (non-cascade) cases, each run through the
    cascade exactly as the oracle calls it — query only, default limit (R-OAL-6)."""
    legacy = [c for c in cases if c.get('tool') != 'cascade']
    tally = defaultdict(int)
    for c in legacy:
        try:
            tally[_cascade.retrieve_rule_for_query(conn, c['query']).get('tool_used') or 'none'] += 1
        except Exception as e:  # an unmeasured case is named, never folded into "not weak"
            tally['error: %s' % type(e).__name__] += 1
    return tally.get('weak', 0), len(legacy), dict(tally)


def grade_must_miss(payload, hits):
    """A must_miss case passes iff the cascade flagged the result weak or a miss."""
    passed = bool(payload.get('is_weak') or payload.get('is_miss'))
    return {
        'passed': passed,
        'required_misses': [],
        'forbidden_triggers': [],
        'optional_bonus': 0,
        'hits_returned': len(hits),
        'tool_used': payload.get('tool_used'),
    }


def _ref_or_group_hits(entry, hits):
    """entry is either a single ref {alias,page_range,required?} or a group
    {any_of:[ref,...], required?}. Returns True if the entry is satisfied
    (single: match; group: ≥1 alternative matches)."""
    if 'any_of' in entry:
        return any(
            _match_ref(sub, h['alias'], h['pages'])
            for sub in entry['any_of']
            for h in hits
        )
    return any(_match_ref(entry, h['alias'], h['pages']) for h in hits)


def grade_case(case, hits):
    """Check expected_refs + must_not_cite against the top-K hits list.

    expected_refs is a list of either:
      * single ref     {alias, page_range, required?}
      * any-of group   {any_of: [ref, ref, ...], required?}
    Group semantics: at least one alternative must match. Both forms default
    to required: true.
    """
    required_misses = []
    optional_bonus = 0
    for entry in case.get('expected_refs', []):
        required = entry.get('required', True)
        matched = _ref_or_group_hits(entry, hits)
        if required and not matched:
            required_misses.append(entry)
        elif not required and matched:
            optional_bonus += 1

    forbidden_triggers = []
    for entry in case.get('must_not_cite', []):
        for h in hits:
            if _match_forbidden(entry, h['alias'], h['section']):
                forbidden_triggers.append((entry, h))
                break

    passed = not required_misses and not forbidden_triggers
    return {
        'passed': passed,
        'required_misses': required_misses,
        'forbidden_triggers': forbidden_triggers,
        'optional_bonus': optional_bonus,
        'hits_returned': len(hits),
    }


# ── Runner ────────────────────────────────────────────────────────────────

def run(only_difficulty=None, only_case=None, verbose=False, emit_json=False,
        yaml_path=QUERIES_PATH):
    if not os.path.exists(DB_PATH):
        print(f'ERROR: DB not built at {DB_PATH}. Run: python3 swrpg_index.py ingest', file=sys.stderr)
        return 2

    cases = load_cases(yaml_path)
    if only_case:
        cases = [c for c in cases if c['id'] == only_case]
        if not cases:
            print(f'ERROR: no case with id={only_case!r}', file=sys.stderr)
            return 2
    if only_difficulty:
        cases = [c for c in cases if c.get('difficulty') == only_difficulty]

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    per_bucket_pass = defaultdict(int)
    per_bucket_total = defaultdict(int)
    results = []

    for case in cases:
        bucket = case.get('difficulty', 'medium')
        per_bucket_total[bucket] += 1
        try:
            tool = case['tool']
            if tool == 'cascade':
                hits, payload = run_cascade_case(conn, case)
                grade = grade_must_miss(payload, hits)
            elif tool == 'search_expanded':
                hits = run_search_expanded_case(conn, case)
            elif tool == 'topic':
                hits = run_topic_case(conn, case)
            else:
                hits = run_search_case(conn, case)
            if tool != 'cascade':
                grade = grade_case(case, hits)
        except Exception as e:
            grade = {'passed': False, 'error': str(e),
                     'required_misses': [], 'forbidden_triggers': [],
                     'optional_bonus': 0, 'hits_returned': 0}
            hits = []

        if grade['passed']:
            per_bucket_pass[bucket] += 1

        results.append({
            'id': case['id'], 'query': case['query'], 'difficulty': bucket,
            'tool': case['tool'], 'mode': case.get('mode'),
            'passed': grade['passed'],
            'required_misses': grade['required_misses'],
            'forbidden_triggers': [{'rule': e, 'hit_alias': h['alias'], 'hit_section': h['section']}
                                   for (e, h) in grade['forbidden_triggers']],
            'optional_bonus': grade['optional_bonus'],
            'tool_used': grade.get('tool_used'),
            'hits': hits if verbose else hits[:3],
            'error': grade.get('error'),
        })

    weak = legacy_weak_count(conn, cases)
    conn.close()

    if emit_json:
        print(json.dumps({
            'total': len(cases),
            'passed': sum(per_bucket_pass.values()),
            'buckets': {b: {'passed': per_bucket_pass[b], 'total': per_bucket_total[b]}
                        for b in per_bucket_total},
            'legacy_weak': {'weak': weak[0], 'total': weak[1], 'tool_used': weak[2]},
            'results': results,
        }, ensure_ascii=False, indent=2))
    else:
        _print_human(results, per_bucket_pass, per_bucket_total, verbose, weak)

    total_pass = sum(per_bucket_pass.values())
    total = len(cases)
    # Exit non-zero if any case failed (for CI use).
    return 0 if total_pass == total else 1


def _print_human(results, per_bucket_pass, per_bucket_total, verbose, weak=None):
    print(f'# Retrieval eval — {len(results)} cases\n')
    for r in results:
        tag = '[PASS]' if r['passed'] else '[FAIL]'
        bucket = f"({r['difficulty']})"
        print(f'  {tag} {r["id"]:<40} {bucket:<14} {r["query"][:60]}')
        if not r['passed']:
            for ref in r['required_misses']:
                if 'any_of' in ref:
                    alts = ', '.join(f'{s.get("alias")} pp.{s.get("page_range")}' for s in ref['any_of'])
                    print(f'         MISS  required any-of: {alts}')
                else:
                    pr = ref.get('page_range', '?')
                    print(f'         MISS  required: {ref.get("alias")} pp.{pr}')
            for t in r['forbidden_triggers']:
                rule = t['rule']
                reason = rule.get('reason', '')
                what = f'alias={rule.get("alias")}' if 'alias' in rule else f'section~"{rule.get("section_contains")}"'
                print(f'         VIOL  {what} — {reason} (hit: {t["hit_alias"]} / {t["hit_section"]!r})')
            if r.get('tool_used'):
                print(f'         CASCADE  tool_used={r["tool_used"]!r} — expected weak or miss')
            if r.get('error'):
                print(f'         ERR   {r["error"]}')
            # Always show actual top-3 hits on failure — faster diagnosis.
            if r['hits']:
                top3 = ', '.join(f'{h["alias"]}·p{h["pages"][0]}' for h in r['hits'][:3])
                print(f'         top3: {top3}')
        if verbose and r['passed'] and r['hits']:
            print(f'         top hits: {[(h["alias"], h["pages"]) for h in r["hits"]]}')

    print()
    print('## By difficulty:')
    for bucket in ('easy', 'medium', 'hard', 'adversarial', 'negative', 'must_miss'):
        if bucket in per_bucket_total:
            passed = per_bucket_pass[bucket]
            total = per_bucket_total[bucket]
            pct = 100.0 * passed / total if total else 0
            print(f'  {bucket:<14} {passed}/{total}  ({pct:.0f}%)')
    total_pass = sum(per_bucket_pass.values())
    total = sum(per_bucket_total.values())
    pct = 100.0 * total_pass / total if total else 0
    print(f'\n  TOTAL        {total_pass}/{total}  ({pct:.0f}%)')
    if weak is not None and weak[1]:
        w, n, tally = weak
        breakdown = ' · '.join(f'{k} {v}' for k, v in sorted(tally.items()))
        print(f'  WEAK (legacy, reported not graded — R-OAL-6)  {w}/{n}  [cascade: {breakdown}]')


# ── CLI ────────────────────────────────────────────────────────────────────

def _build_parser():
    p = argparse.ArgumentParser(description='Retrieval-only eval against queries.yaml')
    p.add_argument('--only', default=None, help='Only run a single difficulty bucket')
    p.add_argument('--case', default=None, help='Only run a specific case id')
    p.add_argument('--verbose', '-v', action='store_true', help='Show top hits for every case')
    p.add_argument('--json', action='store_true', help='Emit machine-readable JSON')
    p.add_argument('--yaml', default=QUERIES_PATH, help='Path to queries.yaml')
    return p


def main(argv=None):
    args = _build_parser().parse_args(argv)
    return run(only_difficulty=args.only, only_case=args.case,
               verbose=args.verbose, emit_json=args.json,
               yaml_path=args.yaml)


if __name__ == '__main__':
    sys.exit(main())
