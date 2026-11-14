#!/usr/bin/env node
/* release-r5-crafting-sm C1 · THE MELEE MIGRATION'S EQUIVALENCE GUARD (contract `release-r5-crafting-contract` R-R5CC-1
 * MIGRATION, ADDENDUM 2). crafting.js's closed code map retired into `effects[]` / `told` rows in crafting_spend.json, applied
 * through ItemResolve's shared writers. The new path must build the SAME `_inline` profile as the old map for every one
 * of the 29 brawl_melee rows, row by row, and for the 6 templates' sample builds. `hands` is compared like every other key
 * (ADDENDUM 2: no exception).
 *
 * THE BASELINE is test/fixtures/release_r5_craft_equivalence.json, written by `--baseline` from the OLD map (crafting.js's
 * CRAFT_EFFECTS at lap/release-r5-crafting-sm @ 8bfb4c26c, the cut of the migration) and committed before the map retired.
 * Cases, per template result_profile:
 *   - each of the 29 rows applied once (profile bytes; a told row leaves the profile as it was), and three times;
 *   - the SAMPLE BUILDS: every improvement in table order; every flaw in table order; every row (improvements then flaws).
 * Each case records the profile's JSON and the ids the path left unapplied (`unapplied[].id`; reasons are prose and may be
 * re-worded, the SET may not move).
 * And per row: whether it applies (`effects`) or is told — the old map's applied/unapplied split.
 *
 * THE BITE: one leg plants a change in one migrated row's `effects` (destructive's damage_delta 1 → 2) and must go red.
 *
 * Run: node test/release_r5_craft_equivalence.cjs            → exit 0 when every case equals the old map and the bite bites.
 *      node test/release_r5_craft_equivalence.cjs --baseline → writes the baseline from the OLD map. Only at the cut.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CR = require(path.join(ROOT, 'lib/shared/crafting.js'));
const BASELINE = path.join(ROOT, 'test/fixtures/release_r5_craft_equivalence.json');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', f), 'utf8'));
const templates = J('crafting_templates.json').templates;
const spend = J('crafting_spend.json');
const melee = spend.spend.brawl_melee;
const IMPS = melee.improvements.map((r) => r.id);
const FLAWS = melee.flaws.map((r) => r.id);
const ROWS = IMPS.concat(FLAWS);

function caseOf(apply, profile, ids) {
  const r = apply(profile, ids);
  return JSON.stringify({ profile: r.profile, unapplied: r.unapplied.map((u) => u.id) });
}
function cases(apply) {
  const out = {};
  Object.keys(templates).filter((k) => templates[k].category === 'brawl_melee').sort().forEach((tk) => {
    const p = templates[tk].result_profile;
    ROWS.forEach((id) => {
      out[tk + ' · ' + id + ' ×1'] = caseOf(apply, p, [id]);
      out[tk + ' · ' + id + ' ×3'] = caseOf(apply, p, [id, id, id]);
    });
    out[tk + ' · sample: every improvement'] = caseOf(apply, p, IMPS);
    out[tk + ' · sample: every flaw'] = caseOf(apply, p, FLAWS);
    out[tk + ' · sample: every row'] = caseOf(apply, p, ROWS);
  });
  return out;
}
function split() {
  const applied = CR.appliedRowIds();
  const out = {};
  ROWS.forEach((id) => { out[id] = applied.indexOf(id) >= 0 ? 'applies' : 'told'; });
  return out;
}

if (process.argv.includes('--baseline')) {
  if (!CR.CRAFT_EFFECTS) { console.error('--baseline reads the OLD map (CRAFT_EFFECTS); it is gone — the baseline is never re-written'); process.exit(2); }
  const c = cases((p, ids) => CR.applyCraftingSpend(p, ids));
  fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
  fs.writeFileSync(BASELINE, JSON.stringify({ _about: 'test/release_r5_craft_equivalence.cjs --baseline; written from crafting.js\'s OLD closed map (CRAFT_EFFECTS) at lap/release-r5-crafting-sm @ 8bfb4c26c, before the map retired (R-R5CC-1). Never re-written.', split: split(), cases: c }, null, 1) + '\n');
  console.log('baseline written: ' + Object.keys(c).length + ' cases, ' + ROWS.length + ' rows');
  process.exit(0);
}

let failures = 0;
const fail = (m) => { failures += 1; console.error('  FAIL  ' + m); };
const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));

// 0 · the map is gone; every melee row carries exactly one of effects / told (R-R5CC-1)
if (CR.CRAFT_EFFECTS) fail('crafting.js still exports CRAFT_EFFECTS — the closed map has not retired');
const both = ROWS.filter((id) => { const r = melee.improvements.concat(melee.flaws).find((x) => x.id === id); return !!r.effects === !!r.told; });
if (both.length) fail('rows carrying both or neither of effects/told: ' + both.join(', '));
else console.log('  PASS  every one of the ' + ROWS.length + ' melee rows carries exactly one of effects / told');

// 1 · the applied/told split equals the old map's
const now = split();
const moved = ROWS.filter((id) => now[id] !== base.split[id]);
if (moved.length) moved.forEach((id) => fail('split moved: ' + id + ' ' + base.split[id] + ' → ' + now[id]));
else console.log('  PASS  applied/told split equals the old map: ' + ROWS.filter((id) => now[id] === 'applies').length + ' apply, ' + ROWS.filter((id) => now[id] === 'told').length + ' told');

// 2 · every case, row by row and the sample builds
const run = (rows) => cases((p, ids) => CR.applyCraftingSpend(p, ids, rows));
const c = run(null);
const keys = Object.keys(base.cases);
if (!keys.length) fail('the baseline holds no cases (a zero harvest is a FAILED run)');
if (Object.keys(c).length !== keys.length) fail('case count ' + Object.keys(c).length + ' ≠ baseline ' + keys.length);
let equal = 0;
keys.forEach((k) => { if (c[k] === base.cases[k]) equal += 1; else fail('moved: ' + k + '\n        was ' + base.cases[k] + '\n        now ' + c[k]); });
console.log('  ' + (equal === keys.length ? 'PASS' : 'FAIL') + '  new path equals the old map: ' + equal + ' / ' + keys.length + ' cases (6 templates × 29 rows ×1/×3 + 3 sample builds each)');

// 3 · the bite: a planted change in one migrated row's effects
const plantedRows = {};
melee.improvements.concat(melee.flaws).forEach((r) => { plantedRows[r.id] = r; });
const d = plantedRows.destructive;
plantedRows.destructive = Object.assign({}, d, { effects: d.effects.map((fx) => (fx.type === 'damage_delta' ? Object.assign({}, fx, { value: fx.value + 1 }) : fx)) });
const bitten = run(plantedRows);
const bit = keys.filter((k) => bitten[k] !== base.cases[k]).length;
if (bit > 0) console.log('  PASS  BITE: destructive damage_delta 1 → 2 moves ' + bit + ' case(s)');
else fail('BITE: a planted change in destructive\'s effects moved nothing');

console.log(failures ? '\nFAILED: ' + failures : '\nOK');
process.exit(failures ? 1 : 0);
