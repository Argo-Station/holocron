#!/usr/bin/env node
/* F-100 M12 · QG1's CRAFTING BYTE-IDENTITY GUARD (census card R-M12C-60; f100-m12-build-card §4 step 4, "QG1's crafting
 * byte-identity guard"). QG1 widens ItemResolve.grantOrIncrementQuality, a function crafting shares (R-CQM-3), with a `by`
 * step (a talent's "Pierce 2", "+1 per rank"). Crafting never passes `by`, so every crafting call must write the same
 * bytes as before the widening.
 *
 * THE BASELINE is test/fixtures/f100_m12_crafting_bytes.json, written by `--baseline` from the code BEFORE the widening
 * (lap/f100-m12-build @ ecf603279, the cut of this change) and committed with it. It holds, for every crafting row that
 * applies (SWRPGCrafting.appliedRowIds) over every shipped template's result_profile plus four planted profiles (no
 * qualities; Vicious 6 and Pierce 6 above crafting's caps, R-CQM-2; Knockdown already present; Defensive 3 at its cap):
 *   - the row applied once, and three times in a row (the increment and the cap);
 *   - every applied row in map order, once (a whole crafted weapon);
 *   - each direct helper call crafting makes (its 12 quality rows' {ranked, name, cap}) on an empty and a held list.
 * The run compares JSON.stringify of each case with the baseline. Any difference is a FAIL naming the case.
 *
 * THE BITE (a guard that cannot fail is no guard): one leg calls the helper as crafting would, but with `by: 2`, and must
 * DIFFER from the baseline; another passes `by: 1` and must be EQUAL (the default is the step crafting has always had).
 *
 * Run: node test/f100_m12_crafting_bytes.cjs            → exit 0 when every case is byte-equal and the bite bites.
 *      node test/f100_m12_crafting_bytes.cjs --baseline → (re)writes the baseline from the code as it stands. Only at the
 *                                                         cut of a change that must not move crafting.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const IR = require(path.join(ROOT, 'lib/shared/itemResolve.js'));
const CR = require(path.join(ROOT, 'lib/shared/crafting.js'));
const BASELINE = path.join(ROOT, 'test/fixtures/f100_m12_crafting_bytes.json');

const templates = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical/crafting_templates.json'), 'utf8'));
const tlist = Object.keys(templates.templates || {}).sort().map((k) => templates.templates[k]);
const profiles = {};
// release-r5-crafting-sm re-point: KEEPS melee's six templates, the ones shipped before QG1's widening; DROPS the
// categories that batch adds (ranged, gadget, cyber), which have no pre-widening bytes for a baseline to hold
tlist.forEach((t) => { if (t && t.result_profile && t.category === 'brawl_melee') profiles['template:' + t.id] = t.result_profile; });
const PLANT = { damage: { value: 5, base: 5 }, encumbrance: 3, crit: 3, hp: 2 };
profiles['planted:bare'] = Object.assign({}, PLANT, { qualities: [] });
profiles['planted:over_caps'] = Object.assign({}, PLANT, { qualities: [{ id: 'vicious', name: 'Vicious', ranked: true, rank: 6 }, { id: 'pierce', name: 'Pierce', ranked: true, rank: 6 }] });
profiles['planted:knockdown'] = Object.assign({}, PLANT, { qualities: [{ id: 'knockdown', name: 'Knockdown', ranked: false }] });
profiles['planted:defensive_at_cap'] = Object.assign({}, PLANT, { qualities: [{ id: 'defensive', name: 'Defensive', ranked: true, rank: 3 }] });

// crafting's own helper calls (lib/shared/crafting.js CRAFT_EFFECTS → quality(id, name, ranked, cap))
const CALLS = [
  ['knockdown', 'Knockdown', false, null], ['defensive', 'Defensive', true, 3], ['pierce', 'Pierce', true, null],
  ['vicious', 'Vicious', true, 5], ['stun', 'Stun', true, null], ['ensnare', 'Ensnare', true, null],
  ['deflection', 'Deflection', true, 3], ['accurate', 'Accurate', true, 3], ['sunder', 'Sunder', false, null],
  ['concussive', 'Concussive', true, null], ['cumbersome', 'Cumbersome', true, null], ['inaccurate', 'Inaccurate', true, null],
];

function cases(extraOpts) {
  const out = {};
  const applied = CR.appliedRowIds();
  Object.keys(profiles).sort().forEach((pk) => {
    applied.forEach((id) => {
      out[pk + ' · ' + id + ' ×1'] = JSON.stringify(CR.applyCraftingSpend(profiles[pk], [id]));
      out[pk + ' · ' + id + ' ×3'] = JSON.stringify(CR.applyCraftingSpend(profiles[pk], [id, id, id]));
    });
    out[pk + ' · all applied rows'] = JSON.stringify(CR.applyCraftingSpend(profiles[pk], applied));
  });
  CALLS.forEach(([id, name, ranked, cap]) => {
    [['empty', []], ['held', profiles['planted:over_caps'].qualities.concat(profiles['planted:defensive_at_cap'].qualities,
      profiles['planted:knockdown'].qualities)]].forEach(([lk, list]) => {
      const opts = Object.assign({ ranked, name, cap }, extraOpts || {});
      out['helper · ' + id + ' on ' + lk] = JSON.stringify(IR.grantOrIncrementQuality(list, id, opts));
    });
  });
  return out;
}

if (process.argv.includes('--baseline')) {
  const c = cases();
  fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
  fs.writeFileSync(BASELINE, JSON.stringify({ _about: 'test/f100_m12_crafting_bytes.cjs --baseline; written from the code before QG1\'s `by` (lap/f100-m12-build @ ecf603279). Never re-written after that change.', cases: c }, null, 1) + '\n');
  console.log('baseline written: ' + Object.keys(c).length + ' cases');
  process.exit(0);
}

let failures = 0;
const fail = (m) => { failures += 1; console.error('  FAIL  ' + m); };
const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8')).cases;
const now = cases();
const keys = Object.keys(base);
if (!keys.length) fail('the baseline holds no cases (a zero harvest is a FAILED run)');
if (Object.keys(now).length !== keys.length) fail('case count ' + Object.keys(now).length + ' ≠ baseline ' + keys.length);
let equal = 0;
keys.forEach((k) => { if (now[k] === base[k]) equal += 1; else fail('crafting moved: ' + k); });
console.log('  ' + (equal === keys.length ? 'PASS' : 'FAIL') + '  crafting byte-identical: ' + equal + ' / ' + keys.length + ' cases');

// the bite
const helperKeys = keys.filter((k) => k.indexOf('helper · ') === 0);
const by2 = cases({ by: 2 }), by1 = cases({ by: 1 });
const moved2 = helperKeys.filter((k) => by2[k] !== base[k]).length;
const moved1 = helperKeys.filter((k) => by1[k] !== base[k]).length;
if (moved2 > 0) console.log('  PASS  BITE: crafting\'s calls with `by: 2` differ in ' + moved2 + ' of ' + helperKeys.length + ' helper cases');
else fail('BITE: `by: 2` moved nothing — the guard cannot see a step');
if (moved1 === 0) console.log('  PASS  `by: 1` equals crafting\'s calls in all ' + helperKeys.length + ' helper cases (the default step)');
else fail('`by: 1` moved ' + moved1 + ' helper cases');

console.log(failures ? '\nFAILED: ' + failures : '\nOK');
process.exit(failures ? 1 : 0);
