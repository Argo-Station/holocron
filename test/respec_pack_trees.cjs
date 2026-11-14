#!/usr/bin/env node
/*
 * respec_pack_trees.cjs — every tree in every shipped reSpecialized pack is MECHANICALLY SOUND.
 *
 * Commissioned by ruling `f96-overlay-scale-probe` R-OSP-3 ("the 6 trees validated mechanically")
 * and generalised to every pack tree, because a rule that only checks six records stops being true
 * the moment a seventh ships.
 *
 * THE INVARIANTS ARE DERIVED FROM OUR OWN CORPUS, NOT INVENTED. Measured across all 137 shipped
 * base specializations before this guard was written:
 *     rows per tree      5      (137/137)
 *     cost sequence      5,10,15,20,25   (137/137)
 *     cells per row      4      (685/685)
 *     link keys per cell  up,down,left,right   (2740/2740)
 *     cells pointing at a talent we lack       0
 * A pack tree that breaks any of these renders wrong on a surface built for the uniform shape.
 *
 * CONNECTIVITY is the one that is about PLAY rather than layout: FFG trees are bought downward from
 * a purchased neighbour, so a cell reachable from no row-0 entry is a talent nobody can ever buy.
 * The rule is checked against the BASE corpus too — if our own shipped trees violated it, the rule
 * would be wrong rather than the data, and this guard says so instead of failing the packs.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PACK_DIR = path.join(ROOT, 'public/data/mods/respecialized');
const rd = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

const baseSpecs = rd(path.join(ROOT, 'public/data/canonical/specializations.json')).specializations;
const baseTalents = rd(path.join(ROOT, 'public/data/canonical/talents.json')).talents;

let pass = 0, fail = 0;
const check = (label, cond, detail) => {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (!cond && detail ? '\n          -> ' + detail : ''));
  cond ? pass++ : fail++;
};

const COSTS = [5, 10, 15, 20, 25];

/** Reachable from any row-0 cell, walking the links each cell declares. */
function unreachable(tree) {
  const R = tree.length, C = (tree[0].talents || []).length;
  const seen = Array.from({ length: R }, () => new Array(C).fill(false));
  const stack = [];
  for (let c = 0; c < C; c++) { seen[0][c] = true; stack.push([0, c]); }
  const cell = (r, c) => (tree[r] && tree[r].talents && tree[r].talents[c]) || null;
  while (stack.length) {
    const [r, c] = stack.pop();
    const L = (cell(r, c) || {}).links || {};
    const go = (nr, nc, back) => {
      const n = cell(nr, nc);
      if (!n || seen[nr][nc]) return;
      // A link is declared on BOTH sides in this data; accept either direction as a join.
      if (L[back.out] || ((n.links || {})[back.in])) { seen[nr][nc] = true; stack.push([nr, nc]); }
    };
    go(r + 1, c, { out: 'down', in: 'up' });
    go(r - 1, c, { out: 'up', in: 'down' });
    go(r, c + 1, { out: 'right', in: 'left' });
    go(r, c - 1, { out: 'left', in: 'right' });
  }
  const out = [];
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) if (!seen[r][c]) out.push(r + ',' + c);
  return out;
}

// ── the connectivity RULE is validated against OUR corpus first ──────────────────────────────
const baseBroken = Object.entries(baseSpecs)
  .filter(([, r]) => (r.talent_tree || []).length)
  .map(([id, r]) => [id, unreachable(r.talent_tree)])
  .filter(([, u]) => u.length);
check('the connectivity rule holds across all ' + Object.keys(baseSpecs).length + ' BASE trees '
      + '(so a pack failure below is the pack, not the rule)',
  baseBroken.length === 0, baseBroken.slice(0, 3).map(([id, u]) => id + ' @ ' + u.join(' ')).join('; '));

// ── every pack ────────────────────────────────────────────────────────────────────────────────
const packs = fs.readdirSync(PACK_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
check('at least one pack to check (non-vacuous)', packs.length > 0, JSON.stringify(packs));

for (const v of packs) {
  const specs = rd(path.join(PACK_DIR, v, 'specializations.overlay.json')).specializations;
  const talents = rd(path.join(PACK_DIR, v, 'talents.overlay.json')).talents;
  const known = new Set([...Object.keys(baseTalents), ...Object.keys(talents)]);
  // card f100-career-powers-data ADDENDUM 2 F2: a row without a talent_tree (an ANNOTATION carrying only
  // bonus_career_powers) is not a tree; it is skipped and COUNTED, never read as one (it used to throw a TypeError).
  const ids = Object.keys(specs).filter((id) => specs[id].talent_tree);
  const skipped = Object.keys(specs).length - ids.length;

  const shape = ids.filter((id) => {
    const t = specs[id].talent_tree || [];
    return t.length !== 5 || t.some((row) => (row.talents || []).length !== 4);
  });
  const cost = ids.filter((id) => (specs[id].talent_tree || []).some((row, i) => row.cost !== COSTS[i]));
  const links = ids.filter((id) => (specs[id].talent_tree || []).some((row) =>
    (row.talents || []).some((c) => ['up', 'down', 'left', 'right'].some((k) => typeof (c.links || {})[k] !== 'boolean'))));
  const dangle = [];
  for (const id of ids) {
    for (const row of specs[id].talent_tree || []) {
      for (const c of row.talents || []) if (!known.has(c.talent)) dangle.push(id + ' -> ' + c.talent);
    }
  }
  const unreach = ids.map((id) => [id, unreachable(specs[id].talent_tree || [])]).filter(([, u]) => u.length);

  console.log('\n  ── ' + v + ' (' + ids.length + ' trees, ' + Object.keys(talents).length + ' overlay talents'
    + (skipped ? ', ' + skipped + ' rows without a tree skipped' : '') + ')');
  check(v + ': every tree is 5 rows x 4 cells', shape.length === 0, JSON.stringify(shape.slice(0, 4)));
  check(v + ': every row cost is 5/10/15/20/25 in order', cost.length === 0, JSON.stringify(cost.slice(0, 4)));
  check(v + ': every cell declares all four link booleans', links.length === 0, JSON.stringify(links.slice(0, 4)));
  check(v + ': no cell points at a talent absent from base+pack', dangle.length === 0, JSON.stringify(dangle.slice(0, 4)));
  check(v + ': every cell is reachable from a row-0 entry (no unbuyable talent)',
    unreach.length === 0, unreach.slice(0, 3).map(([id, u]) => id + ' @ ' + u.join(' ')).join('; '));
}

console.log('\nrespec pack trees: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
