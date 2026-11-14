"""The benchmark's bite (C-ORB-8 i): a DEGRADED COPY of the index.

Copies the index (sqlite backup API — a real copy, never a symlink, WAL content included), then for a
seeded 25 % of the KEPT sites deletes every chunk, passage (with its embedding) and chunks_fts row on
the site's pages, in every alias of the site's pagination group (fad's pages go from fad, fad-ocr and
fad-lite together, or the byte-identical copies would still answer). Writes the degraded site ids to
<out>.sites.txt for `run.py --only-sites`.

The retrieval arm must then score the degraded sites' hit@5 at <= 5 %, and the overall rate must fall
by at least 0.20 x the baseline rate. `--check` compares two run.py JSONs and exits 1 if either
condition fails.

Usage:
  .venv/bin/python -m swrpg_index.eval.recall.degrade --db <live.db> --sites sites.jsonl \
      --seed 20260923 --out <worktree>/recall_degraded.db
  .venv/bin/python -m swrpg_index.eval.recall.degrade --check --baseline live.json \
      --degraded degraded.json --degraded-sites <out>.sites.txt
The copy is scratch: delete it when the run is recorded.
"""
import argparse
import json
import os
import random
import sqlite3
import sys

from . import common as C

SHARE = 0.25
MAX_DEGRADED_HIT = 0.05
MIN_RELATIVE_DROP = 0.20


def build(db, sites_path, seed, out):
    if os.path.islink(out):
        sys.exit('refusing: the degraded copy must be a copy, not a symlink')
    if os.path.exists(out):
        os.remove(out)
    src = sqlite3.connect('file:' + db + '?mode=ro', uri=True)
    dst = sqlite3.connect(out)
    src.backup(dst)
    src.close()
    kept = [json.loads(l) for l in open(sites_path, encoding='utf-8') if l.strip()]
    kept = [s for s in kept if s.get('kept')]
    k = round(SHARE * len(kept))
    pick = random.Random(f'degrade|{seed}').sample(kept, k)
    aliases = [r[0] for r in dst.execute('SELECT alias FROM pdfs')]
    n_chunks = n_pass = 0
    for s in pick:
        group = [a for a in aliases if C.pagination_of(a) == C.pagination_of(s['alias'])]
        for a in group:
            ids = [r[0] for r in dst.execute(
                'SELECT id FROM chunks WHERE alias=? AND page_start<=? AND page_end>=?',
                (a, s['corpus_page_end'], s['corpus_page_start']))]
            for cid in ids:
                dst.execute('DELETE FROM chunks_fts WHERE rowid=?', (cid,))
            n_pass += dst.execute('DELETE FROM passages WHERE alias=? AND page_start<=? AND page_end>=?',
                                  (a, s['corpus_page_end'], s['corpus_page_start'])).rowcount
            n_chunks += dst.execute('DELETE FROM chunks WHERE alias=? AND page_start<=? AND page_end>=?',
                                    (a, s['corpus_page_end'], s['corpus_page_start'])).rowcount
    dst.commit()
    dst.close()
    with open(out + '.sites.txt', 'w') as f:
        f.write('\n'.join(sorted(s['site'] for s in pick)) + '\n')
    print(f'degraded copy {out}: {k} of {len(kept)} kept sites; deleted {n_chunks} chunks, {n_pass} passages')
    print(f'HARVEST: {k} sites degraded' + (' — ZERO IS A FAILED RUN' if not k else ''))
    return 0 if k else 1


def check(baseline, degraded, degraded_sites):
    b = json.load(open(baseline))
    d = json.load(open(degraded))
    ids = {l.strip() for l in open(degraded_sites) if l.strip()}
    b_rate = b['summary']['overall']['rate']
    d_rate = d['summary']['overall']['rate']
    drows = [r for r in d['rows'] if r['site'] in ids]
    dhit = sum(r['hit5'] for r in drows)
    d_site_rate = dhit / len(drows) if drows else None
    drop = b_rate - d_rate
    ok1 = d_site_rate is not None and d_site_rate <= MAX_DEGRADED_HIT
    ok2 = drop >= MIN_RELATIVE_DROP * b_rate
    print(f'baseline overall {b_rate:.4f} · degraded overall {d_rate:.4f} · drop {drop:.4f} '
          f'(needs >= {MIN_RELATIVE_DROP * b_rate:.4f}) -> {"PASS" if ok2 else "FAIL"}')
    print(f'degraded sites hit@5 {dhit}/{len(drows)} = {d_site_rate:.4f} (needs <= {MAX_DEGRADED_HIT}) '
          f'-> {"PASS" if ok1 else "FAIL"}')
    print(f'HARVEST: {len(drows)} degraded sites scored' + (' — ZERO IS A FAILED RUN' if not drows else ''))
    return 0 if (ok1 and ok2 and drows) else 1


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--check', action='store_true')
    ap.add_argument('--db')
    ap.add_argument('--sites')
    ap.add_argument('--seed', type=int, default=20260923)
    ap.add_argument('--out')
    ap.add_argument('--baseline')
    ap.add_argument('--degraded')
    ap.add_argument('--degraded-sites')
    a = ap.parse_args(argv)
    if a.check:
        return check(a.baseline, a.degraded, a.degraded_sites)
    return build(a.db, a.sites, a.seed, a.out)


if __name__ == '__main__':
    sys.exit(main())
