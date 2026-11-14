#!/usr/bin/env node
/**
 * spec_tree_shape.cjs — STANDING guard for the specialization talent-tree data (CS-4 / Lane C).
 *
 * Promotes the CS-4 scope census's one-off check into a standing validator: EVERY specialization's
 * talent_tree is a 5-row × 4-talent grid with the printed row-cost ladder [5,10,15,20,25]
 * (source: Edge of the Empire Core Rulebook p.102), each cell carrying a talent id-ref + links.
 * The advancement buy surface trusts this shape (row index → cost, links → connection rule), so a
 * data drift here is a silent mispricing / broken tree — caught loudly at build time instead.
 *
 * Run:  node test/spec_tree_shape.cjs   (needs public/data/canonical/specializations.json)
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const EXPECTED_COSTS = [5, 10, 15, 20, 25];  // eote p.102
let failures = 0;
function fail(msg) { failures += 1; console.error('  FAIL  ' + msg); }

function main() {
  const specs = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical/specializations.json'), 'utf8')).specializations;
  const ids = Object.keys(specs);
  let rowsChecked = 0, cellsChecked = 0;

  ids.forEach(function (id) {
    const tt = specs[id].talent_tree;
    if (!Array.isArray(tt) || tt.length !== 5) { fail(id + ': talent_tree is not 5 rows (' + (tt ? tt.length : 'missing') + ')'); return; }
    tt.forEach(function (row, ri) {
      rowsChecked += 1;
      if (row.cost !== EXPECTED_COSTS[ri]) fail(id + ' row ' + ri + ': cost ' + row.cost + ' ≠ ' + EXPECTED_COSTS[ri]);
      if (!Array.isArray(row.talents) || row.talents.length !== 4) { fail(id + ' row ' + ri + ': not 4 talents (' + (row.talents ? row.talents.length : 'missing') + ')'); return; }
      row.talents.forEach(function (cell, ci) {
        cellsChecked += 1;
        if (!cell || typeof cell.talent !== 'string' || !cell.talent) fail(id + ' r' + ri + 'c' + ci + ': missing talent id-ref');
        if (!cell || typeof cell.links !== 'object' || cell.links == null) fail(id + ' r' + ri + 'c' + ci + ': missing links object (connection rule depends on it)');
      });
    });
  });

  if (!failures) {
    console.log('  PASS  ' + ids.length + ' specs — all 5×4 grids at costs [5,10,15,20,25]');
    console.log('  PASS  ' + rowsChecked + ' rows / ' + cellsChecked + ' cells — every cell has talent id-ref + links');
  }
  console.log('\n' + (failures ? '  ' + failures + ' FAILED' : '  spec tree-shape guard: ALL PASS (' + ids.length + ' specs)'));
  process.exit(failures ? 1 : 0);
}
main();
