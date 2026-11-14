#!/usr/bin/env node
/**
 * b960_tree_links.cjs — STANDING guard for B-960 (lap f100-fix-live-numbers-s; f100-triage-census-card ADDENDUM 8 C3):
 * a talent-tree link is stored twice (the upper cell's `down`, the lower cell's `up`; the left cell's `right`, the right
 * cell's `left`), and a tree whose two halves disagree draws a link one way and a gap the other.
 *
 *   1. THE CLASS: 0 half-claimed edges over every shipped tree (specializations.json) AND every reSpecialized overlay tree.
 *   2. The four edges as the printed pages draw them (image reads; `scripts/canonical/apply_b960_tree_links.py` cites
 *      book + printed page per row): Ambassador r3c2/r4c2 OPEN (AoR p.79), Protector r3c0/r4c0 OPEN (FaD p.76),
 *      Scoundrel r3c1/r4c1 JOINED (EotE p.84), Sharpshooter r3c0/r4c0 JOINED (AoR p.93).
 *   3. HARVEST: the census actually walked trees and claimed edges (zero = a FAILED run).
 *
 * THE BITE: one of the four reverted in a copy → the census finds 1 half-claimed edge.
 * Run: node test/b960_tree_links.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let failures = 0, rows = 0;
function check(ok, msg, detail) {
  rows += 1;
  if (ok) console.log('  PASS  ' + msg);
  else { failures += 1; console.log('  FAIL  ' + msg + (detail !== undefined ? '  — ' + JSON.stringify(detail).slice(0, 400) : '')); }
}
const J = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

function census(specs, label, acc) {
  Object.keys(specs).forEach((id) => {
    const t = specs[id] && specs[id].talent_tree;
    if (!Array.isArray(t)) return;
    acc.trees += 1;
    t.forEach((row, r) => (row.talents || []).forEach((cell, c) => {
      const L = (cell && cell.links) || {};
      const right = row.talents[c + 1], below = t[r + 1] && (t[r + 1].talents || [])[c];
      if (right) { const b = !!((right.links || {}).left); if (L.right || b) acc.edges += 1; if (!!L.right !== b) acc.half.push(`${label}/${id} r${r}c${c} right`); }
      if (below) { const b = !!((below.links || {}).up); if (L.down || b) acc.edges += 1; if (!!L.down !== b) acc.half.push(`${label}/${id} r${r}c${c} down`); }
    }));
  });
  return acc;
}
const SPECS = J('public/data/canonical/specializations.json').specializations;
const OVERLAYS = fs.readdirSync(path.join(ROOT, 'public/data/mods/respecialized'))
  .filter((v) => fs.existsSync(path.join(ROOT, 'public/data/mods/respecialized', v, 'specializations.overlay.json')));

// 1 + 3
const base = census(SPECS, 'base', { trees: 0, edges: 0, half: [] });
check(base.half.length === 0, `1 base: 0 half-claimed edges over ${base.trees} trees, ${base.edges} claimed edges`, base.half);
check(base.trees > 100 && base.edges > 1000, `3 HARVEST base: ${base.trees} trees, ${base.edges} edges walked`);
OVERLAYS.forEach((v) => {
  const o = census(J(`public/data/mods/respecialized/${v}/specializations.overlay.json`).specializations, v, { trees: 0, edges: 0, half: [] });
  check(o.half.length === 0 && o.trees > 0, `1 overlay ${v}: 0 half-claimed edges over ${o.trees} trees`, o.half);
});
// 2
const link = (id, r, c, k) => !!((SPECS[id].talent_tree[r].talents[c].links || {})[k]);
[['ambassador', 3, 2, false, 'AoR p.79'], ['protector', 3, 0, false, 'FaD p.76'], ['scoundrel', 3, 1, true, 'EotE p.84'], ['sharpshooter', 3, 0, true, 'AoR p.93']]
  .forEach(([id, r, c, joined, cite]) => check(link(id, r, c, 'down') === joined && link(id, r + 1, c, 'up') === joined,
    `2 ${id} r${r}c${c} ↔ r${r + 1}c${c} ${joined ? 'JOINED' : 'OPEN'} as printed (${cite})`));
// THE BITE
const mut = JSON.parse(JSON.stringify(SPECS));
mut.scoundrel.talent_tree[4].talents[1].links.up = false;
const bit = census(mut, 'bite', { trees: 0, edges: 0, half: [] });
check(bit.half.length === 1 && bit.half[0] === 'bite/scoundrel r3c1 down', 'BITE Scoundrel\'s Natural Charmer up reverted → 1 half-claimed edge', bit.half);

console.log(`\nb960_tree_links: ${failures} FAIL of ${rows}`);
process.exit(failures ? 1 : 0);
