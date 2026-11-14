"""Sampler for the recall benchmark (C-ORB-1, C-ORB-2). Deterministic: sorted address order and a
recorded integer seed; no unseeded randomness anywhere.

ELIGIBLE: a passage on the index whose content_type is not an overlay (toc, verified_table), whose
text is >= 200 characters, and whose normalised text is not a byte-duplicate of a passage already
taken earlier in (family, alias, page, seq) order. The duplicate rule exists because fad-ocr and
fad-lite are ~99 % byte copies of fad (698 of ~705 passages): without it "proportional to family
passage count" would weight the fad family three times. Every exclusion is counted by reason.

STRATUM: tier (pdfs.tier) x the book's text quality (swrpg_index.text_quality: clean / glyph-loss /
mojibake). The page's own `page_hostile` flag is recorded per site.

ALLOCATION, per tier, for a stated tier total N_t:
  every family in the tier gets min(6, eligible) sites;
  the remainder goes proportionally to the family's eligible passage count (largest remainder,
  capped at what the family holds, overflow redistributed);
  inside a family the sites are the first k of a seeded shuffle of its address-sorted passages
  (so raising N_t only adds sites; the ones already drawn never change).
N_t comes from --per-tier (the gate records how it was chosen from the pilot's keep rate).

PILOT (--pilot K): K sites per tier, one family at a time in seeded order, one seeded passage each,
round-robin until K. Same eligibility; a separate seed domain from the full sample.

Usage:
  .venv/bin/python -m swrpg_index.eval.recall.sample --db <index.db> --seed 20260923 --pilot 15 --out pilot_sample.jsonl
  .venv/bin/python -m swrpg_index.eval.recall.sample --db <index.db> --seed 20260923 \
      --per-tier core=420,advanced=420,supplement=420,beginner=440 --out sample.jsonl
Writes one JSON line per site (address + stratum + seed) and a <out>.manifest.json with the counts.
Read-only against the index (opened mode=ro).
"""
import argparse
import collections
import hashlib
import json
import os
import random
import sqlite3
import sys

from ... import text_quality as _tq
from . import common as C

TIERS = ('core', 'advanced', 'supplement', 'beginner')
FAMILY_FLOOR = 6


def open_ro(db):
    if not os.path.exists(db):
        sys.exit(f'no index at {db}')
    return sqlite3.connect('file:' + db + '?mode=ro', uri=True)


def eligible_pool(conn):
    """Returns (pool, exclusions). pool: list of site dicts in address-sorted order."""
    census = _tq.census(conn)
    tiers = dict(conn.execute('SELECT alias, tier FROM pdfs'))
    rows = conn.execute(
        'SELECT alias, page_start, page_end, seq, content_type, text FROM passages').fetchall()
    rows.sort(key=lambda r: (C.family_of(r[0]), r[0], r[1], r[2], r[3]))
    excl = collections.Counter()
    seen = set()
    pool = []
    for alias, ps, pe, seq, ctype, text in rows:
        if ctype in C.EXCLUDED_TYPES:
            excl[f'content_type:{ctype}'] += 1
            continue
        if len(text or '') < C.MIN_CHARS:
            excl['short(<200)'] += 1
            continue
        addr = C.address(alias, ps, pe, text)
        if addr['anchor_sha1'] in seen:
            excl['duplicate_text'] += 1
            continue
        seen.add(addr['anchor_sha1'])
        tier = tiers.get(alias) or 'unknown'
        quality = census.quality(alias)
        site = dict(addr)
        site.update({
            'site': C.site_id(addr),
            'tier': tier,
            'text_quality': quality,
            'page_hostile': bool(census.hostile(alias, ps, ctype)),
            'content_type': ctype,
            'stratum': f'{tier}|{quality}',
            '_seq': seq,
        })
        pool.append(site)
    return pool, excl


def _largest_remainder(weights, total, caps):
    """Integer allocation of `total` proportional to `weights`, each capped at caps[k]."""
    alloc = {k: 0 for k in weights}
    remaining = total
    active = {k for k in weights if caps[k] > 0}
    while remaining > 0 and active:
        wsum = sum(weights[k] for k in active)
        quotas = {k: remaining * weights[k] / wsum for k in active}
        give = {k: min(int(quotas[k]), caps[k] - alloc[k]) for k in active}
        handed = sum(give.values())
        if handed < remaining:
            order = sorted(active, key=lambda k: (-(quotas[k] - int(quotas[k])), k))
            for k in order:
                if handed >= remaining:
                    break
                if alloc[k] + give[k] < caps[k]:
                    give[k] += 1
                    handed += 1
        for k in active:
            alloc[k] += give[k]
        remaining -= handed
        active = {k for k in active if alloc[k] < caps[k]}
        if handed == 0:
            break
    return alloc


def allocate(pool, per_tier, seed):
    by_tf = collections.defaultdict(list)
    for s in pool:
        by_tf[(s['tier'], s['family'])].append(s)
    chosen, plan = [], {}
    for tier in TIERS:
        fams = sorted(f for (t, f) in by_tf if t == tier)
        if not fams:
            continue
        elig = {f: len(by_tf[(tier, f)]) for f in fams}
        floors = {f: min(FAMILY_FLOOR, elig[f]) for f in fams}
        target = max(per_tier.get(tier, 0), sum(floors.values()))
        target = min(target, sum(elig.values()))
        rest = _largest_remainder(elig, target - sum(floors.values()),
                                  {f: elig[f] - floors[f] for f in fams})
        plan[tier] = {'target': target, 'eligible': sum(elig.values()), 'families': {}}
        for f in fams:
            k = floors[f] + rest[f]
            order = list(by_tf[(tier, f)])          # address-sorted
            random.Random(f'{seed}|{tier}|{f}').shuffle(order)
            picks = order[:k]                       # a prefix: a larger N only ever ADDS sites
            picks.sort(key=lambda s: (s['alias'], s['corpus_page_start'], s['corpus_page_end'], s['_seq']))
            chosen.extend(picks)
            plan[tier]['families'][f] = {'eligible': elig[f], 'sampled': k}
    return chosen, plan


def pilot(pool, k, seed):
    by_tf = collections.defaultdict(list)
    for s in pool:
        by_tf[(s['tier'], s['family'])].append(s)
    chosen, plan = [], {}
    for tier in TIERS:
        fams = sorted(f for (t, f) in by_tf if t == tier)
        rng = random.Random(f'pilot|{seed}|{tier}')
        rng.shuffle(fams)
        queues = {f: random.Random(f'pilot|{seed}|{tier}|{f}').sample(by_tf[(tier, f)], len(by_tf[(tier, f)]))
                  for f in fams}
        got = []
        while len(got) < k and any(queues.values()):
            for f in fams:
                if len(got) >= k:
                    break
                if queues[f]:
                    got.append(queues[f].pop())
        chosen.extend(got)
        plan[tier] = {'target': k, 'sampled': len(got),
                      'families': dict(collections.Counter(s['family'] for s in got))}
    return chosen, plan


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--db', required=True)
    ap.add_argument('--seed', type=int, required=True)
    ap.add_argument('--out', required=True)
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument('--pilot', type=int)
    g.add_argument('--per-tier', help='core=N,advanced=N,supplement=N,beginner=N')
    a = ap.parse_args(argv)

    conn = open_ro(a.db)
    pool, excl = eligible_pool(conn)
    if a.pilot:
        sites, plan = pilot(pool, a.pilot, a.seed)
        mode = f'pilot:{a.pilot}'
    else:
        per_tier = {k: int(v) for k, v in (p.split('=') for p in a.per_tier.split(','))}
        sites, plan = allocate(pool, per_tier, a.seed)
        mode = f'per-tier:{a.per_tier}'
    for s in sites:
        s.pop('_seq', None)
        s['seed'] = a.seed
    with open(a.out, 'w', encoding='utf-8') as f:
        for s in sites:
            f.write(json.dumps(s, sort_keys=True, ensure_ascii=False) + '\n')
    digest = hashlib.sha256(open(a.out, 'rb').read()).hexdigest()
    manifest = {
        'mode': mode, 'seed': a.seed, 'sites': len(sites), 'sha256': digest,
        'eligible': len(pool), 'exclusions': dict(excl),
        'eligible_by_tier': dict(collections.Counter(s['tier'] for s in pool)),
        'eligible_by_stratum': dict(collections.Counter(s['stratum'] for s in pool)),
        'sampled_by_stratum': dict(collections.Counter(s['stratum'] for s in sites)),
        'sampled_page_hostile': sum(1 for s in sites if s['page_hostile']),
        'plan': plan,
    }
    with open(a.out + '.manifest.json', 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=1, sort_keys=True)
    print(f'{mode}: {len(sites)} sites from {len(pool)} eligible; exclusions {dict(excl)}')
    print(f'sampled by stratum: {manifest["sampled_by_stratum"]}')
    print(f'sha256 {digest}')
    print(f'HARVEST: {len(sites)} sites' + (' — ZERO IS A FAILED RUN' if not sites else ''))
    return 0 if sites else 1


if __name__ == '__main__':
    sys.exit(main())
