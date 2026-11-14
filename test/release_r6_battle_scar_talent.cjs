#!/usr/bin/env node
/**
 * release_r6_battle_scar_talent.cjs — R-R4D-4 (card `release-r6-backend` §5, lane C): a Battle Scar's talent reaches the
 * engine through the one character core, `charResolve`, and is never written onto the sheet.
 *
 * A scar is a `sheetData.rewards` row (release-r4-shapes S2: key 'BS', `talent` the talents.json id it bought). It sits in
 * no tree, so it is not in `sheet.talents`; `scarTalentGrants` reads it and `grantedTalentsAtRender` joins it to the
 * species grants wherever "every talent the sheet owns" is read.
 *
 *   G1  Grit (eote p.136, +1 strain threshold per rank) bought as a scar: computeDerived's strainThreshold is +1 over the
 *       same sheet without the scar, and the stored sheet is unchanged (no talents / derivedBonuses written).
 *   G2  derivedBecause names the +1 with a "(Battle Scar)" row (the trace sums what the number sums).
 *   G3  two scars on Grit (ranked) = +2; a FLAT talent the tree already owns adds nothing (R-CS4e).
 *   G4  a scar talent with dice reaches the dice collector: ownedTalentPoolSources carries a scarred talent that has
 *       pool_mods, and not without the scar.
 *   G5  a non-BS reward row, or a BS row with no talent, grants nothing.
 *   BITE  the computeDerived join removed in a mutated copy of the core → G1 reads +0, exit 1 (the exit code is read).
 *
 * Run: node test/release_r6_battle_scar_talent.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');
const Module = require('module');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SRC_PATH = process.env.R6_BS_CORE || path.join(ROOT, 'lib/shared/charResolve.js');
function core(src, name) {
  const m = new Module(path.join(ROOT, 'lib/shared', name));
  m.paths = Module._nodeModulePaths(path.join(ROOT, 'lib/shared'));
  m._compile(src, m.id);
  return m.exports;
}
const CR = core(fs.readFileSync(SRC_PATH, 'utf8'), 'charResolve.r6bs.js');

let failures = 0;
function check(ok, msg, detail) {
  if (ok) console.log('  PASS  ' + msg);
  else { failures += 1; console.log('  FAIL  ' + msg + (detail !== undefined ? '  — ' + JSON.stringify(detail).slice(0, 300) : '')); }
}
const clone = (v) => JSON.parse(JSON.stringify(v));
const reg = (s) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', s + '.json'), 'utf8'))[s];
const CB = { species: reg('species'), careers: reg('careers'), specializations: reg('specializations'), talents: reg('talents'), forcePowers: reg('force_powers') };
const BASE = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/native/creator_human_smuggler.json'), 'utf8'));

const scar = (id, talent) => ({ id: id, key: 'BS', tier: 'BSAB1OP2', name: 'Blaster burn', level: null, skills: [], xp: 15, talent: talent });
const strain = (s) => CR.computeDerived(clone(s), [], CB).strainThreshold;

const plain = clone(BASE);
delete plain.rewards;
const withGrit = Object.assign(clone(plain), { rewards: [scar('rwd-a', 'grit')] });

// G1
check(CB.talents.grit && CB.talents.grit.effects.some((e) => e.op === 'strain_threshold_delta' && e.amount === 1),
  'fixture: grit carries strain_threshold_delta +1 in the shipped registry');
const s0 = strain(plain), s1 = strain(withGrit);
check(s1 === s0 + 1, 'G1: a Grit Battle Scar adds +1 to the derived strain threshold', { without: s0, with: s1 });
const stored = clone(withGrit);
CR.computeDerived(stored, [], CB);
check(JSON.stringify(stored) === JSON.stringify(withGrit), 'G1: computeDerived writes nothing onto the stored sheet');
check(!(withGrit.talents || []).some((t) => t && t.id === 'grit'), 'G1: the scar talent is not in sheet.talents');

// G2
const why = CR.derivedBecause ? CR.derivedBecause(clone(withGrit), [], CB) : null;
const rows = why && why.strainThreshold;
check(Array.isArray(rows) && rows.some((r) => r.source === 'Grit (Battle Scar)' && r.to - r.from === 1),
  'G2: derivedBecause names the strain +1 as a Battle Scar row', why && why.strainThreshold);

// G3
const twoGrit = Object.assign(clone(plain), { rewards: [scar('rwd-a', 'grit'), scar('rwd-b', 'grit')] });
check(strain(twoGrit) === s0 + 2, 'G3: two Grit scars (a ranked talent) add +2', strain(twoGrit));
// The shipped registry holds no flat threshold talent, so the flat arm runs on one planted in a CLONED registry.
const CBF = Object.assign({}, CB, { talents: Object.assign({}, CB.talents, { r6_flat_probe: { id: 'r6_flat_probe', name: 'Flat probe', ranked: false,
  effects: [{ id: 'strain_threshold_delta', op: 'strain_threshold_delta', amount: 1, per_rank: false }] } }) });
const sf = (s) => CR.computeDerived(clone(s), [], CBF).strainThreshold;
const owned = Object.assign(clone(plain), { talents: (plain.talents || []).concat([{ id: 'r6_flat_probe', rank: 1 }]) });
check(sf(Object.assign(clone(plain), { rewards: [scar('rwd-c', 'r6_flat_probe')] })) === sf(plain) + 1 &&
  sf(Object.assign(clone(owned), { rewards: [scar('rwd-c', 'r6_flat_probe')] })) === sf(owned) &&
  sf(Object.assign(clone(plain), { rewards: [scar('rwd-c', 'r6_flat_probe'), scar('rwd-g', 'r6_flat_probe')] })) === sf(plain) + 1,
  'G3: a FLAT talent adds once as a scar, nothing more when a tree owns it or a second scar repeats it (R-CS4e)');

// G4
const diceId = ['intimidating', 'confidence', 'street_smarts', 'commanding_presence', 'resolve']
  .find((k) => CB.talents[k] && Array.isArray(CB.talents[k].pool_mods) && CB.talents[k].pool_mods.length);
if (diceId) {
  const has = (s) => CR.ownedTalentPoolSources(clone(s), CB).some((o) => o.id === diceId);
  check(!has(plain) && has(Object.assign(clone(plain), { rewards: [scar('rwd-d', diceId)] })),
    'G4: a scarred talent with dice (' + diceId + ') reaches ownedTalentPoolSources, and not without the scar');
} else {
  failures += 1;
  console.log('  FAIL  G4: none of the suggested scar talents carries pool_mods; the dice arm is unmeasured');
}

// G5
const other = Object.assign(clone(plain), { rewards: [{ id: 'rwd-e', key: 'ALLY', tier: 'ALLYAB1OP1', name: 'Dex', level: null, skills: [], xp: 5, talent: 'grit' },
  Object.assign(scar('rwd-f', null))] });
check(strain(other) === s0 && CR.scarTalentGrants(other).length === 0, 'G5: an ALLY row naming a talent, and a BS row with none, grant nothing');

// BITE
if (!process.env.R6_BS_CORE) {
  const src = fs.readFileSync(path.join(ROOT, 'lib/shared/charResolve.js'), 'utf8');
  const cut = '      Object.keys(scb).forEach(function (k) { db[k] = (db[k] || 0) + scb[k]; });\n';
  if (src.indexOf(cut) === -1) { failures += 1; console.log('  FAIL  BITE: the computeDerived join line is not in the core'); }
  else {
    const tmp = path.join(require('os').tmpdir(), 'r6bs-mutant-' + process.pid + '.js');
    fs.writeFileSync(tmp, src.replace(cut, ''));
    const r = spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { R6_BS_CORE: tmp }), encoding: 'utf8' });
    fs.unlinkSync(tmp);
    check(r.status === 1 && /FAIL  G1: a Grit/.test(r.stdout), 'BITE: the join removed → G1 reds and the run exits 1', { status: r.status });
  }
}

console.log(failures ? '\n' + failures + ' FAILED' : '\nall passed');
process.exit(failures ? 1 : 0);
