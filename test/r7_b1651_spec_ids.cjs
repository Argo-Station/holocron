#!/usr/bin/env node
// B-1651 (ruling release-r7-bug-burndown ADDENDUM 390): a specialization bought after creation reaches `specializationIds`.
// buyNewSpec wrote `specializations` only. The OggDude export (oggExport.js, `character.specializationIds`) then left the
// bought tree out of the file, and careerPowersOf / careerPowerPriceCtx (charResolve.js) gave a reSpecialized bonus tree no
// career powers, so its Mentor discount was missing (Heal/Harm basic 15 XP, not 10). STEP 0 measured both at 0619ad054.
//   H   ownedSpecIds: appends each owned tree id the list lacks, in tree order; returns the SAME array when none is missing;
//       never removes or reorders; tolerates an absent list.
//   W1  buyNewSpec's patch writes specializationIds through CharResolve.ownedSpecIds (one patch, one unit: U-XP).
//   W2  buyTalent writes it when its patch adds a tree, and leaves the key out otherwise.
//   L1  migrateSheet repairs a drifted save (the smuggler pregen after buying Gadgeteer): changed, ids = [pilot, gadgeteer].
//   L2  IDEMPOTENT: a second pass is changed=false and byte-identical; every pregen's specializationIds comes out
//       unchanged (each one is already complete).
//   E1  the repaired save exports the bought tree: its OggDude key (GADG) is a <CharSpecialization> in the file.
//   E2  the repaired save prices a reSpecialized bonus tree's career power with the Mentor discount (Heal/Harm 15 → 10).
// B1651_CR=<path> requires another charResolve.js, B1651_APP=<path> reads another player/app.jsx (the bite: the cut's
// files). The guard writes nothing.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const CR = require(process.env.B1651_CR || path.join(ROOT, 'lib/shared/charResolve.js'));
const appSrc = fs.readFileSync(process.env.B1651_APP || path.join(ROOT, 'player/app.jsx'), 'utf8');
const X = require(path.join(ROOT, 'lib/shared/oggExport.js'));

let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (detail !== undefined ? '  -> ' + JSON.stringify(detail) : '')); }
}
const C = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', f + '.json'), 'utf8'));
const J = (v) => JSON.stringify(v);

// ── H ──
const own = CR.ownedSpecIds;
check('H  CharResolve.ownedSpecIds is exported', typeof own === 'function');
if (typeof own === 'function') {
  const ids = ['pilot'];
  check('H  a missing tree id is appended in tree order', J(own(ids, [{ id: 'pilot' }, { id: 'gadgeteer' }, { id: 'scout' }])) === J(['pilot', 'gadgeteer', 'scout']));
  check('H  nothing missing → the SAME array', own(ids, [{ id: 'pilot', owned: ['0-0'] }]) === ids);
  check('H  never removes or reorders an id', J(own(['scout', 'pilot'], [{ id: 'pilot' }])) === J(['scout', 'pilot']));
  check('H  an absent list with trees → the trees\' ids', J(own(undefined, [{ id: 'pilot' }, { id: 'pilot' }])) === J(['pilot']));
  check('H  an absent list and no trees → absent (no key written)', own(undefined, []) === undefined && own(undefined, undefined) === undefined);
}

// ── W1 / W2 (the writers in player/app.jsx) ──
function body(name) {
  const m = new RegExp('function ' + name + '\\([^)]*\\) \\{([\\s\\S]*?)\\n  \\}\\n').exec(appSrc);
  return m ? m[1] : '';
}
const bns = body('buyNewSpec'), bt = body('buyTalent');
check('W1 buyNewSpec found', bns.length > 0);
check('W1 buyNewSpec\'s patch writes specializationIds through CharResolve.ownedSpecIds',
  /var patch = \{[\s\S]*?specializations: specs,[\s\S]*?specializationIds: CharResolve\.ownedSpecIds\(sheet\.specializationIds, specs\)[\s\S]*?\};/.test(bns));
check('W2 buyTalent found', bt.length > 0);
check('W2 buyTalent adds specializationIds only when its patch adds a tree',
  /var specIds = CharResolve\.ownedSpecIds\(sheet\.specializationIds, specs\);\s*if \(specIds !== sheet\.specializationIds\) patch\.specializationIds = specIds;/.test(bt));

// ── L1 / L2 (the load repair) ──
const specReg = C('specializations').specializations;
const cb = { species: C('species').species, careers: C('careers').careers, specializations: specReg,
  talents: C('talents').talents, forcePowers: C('force_powers').force_powers };
const pregens = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/pregen_sheets.json'), 'utf8')).characters;
const smuggler = JSON.parse(J(pregens.find((c) => c.id === 'smuggler')));
function bought(sheet, specId) {   // the stored record buyNewSpec left before the fix: specializations only
  const s = JSON.parse(J(sheet));
  s.specializations = (s.specializations || []).map((x) => ({ id: x.id, owned: (x.owned || []).slice() })).concat([{ id: specId, owned: [] }]);
  return s;
}
const drifted = bought(smuggler, 'gadgeteer');
check('L1 HARNESS the drifted save lacks the bought id', J(drifted.specializationIds) === J(['pilot']));
const r1 = CR.migrateSheet(drifted, cb);
check('L1 migrateSheet repairs it: changed, ids = [pilot, gadgeteer]', r1.changed && J(drifted.specializationIds) === J(['pilot', 'gadgeteer']),
  { changed: r1.changed, ids: drifted.specializationIds });
const snap = J(drifted);
const r2 = CR.migrateSheet(drifted, cb);
check('L2 a second pass: changed=false, byte-identical', !r2.changed && J(drifted) === snap);
const moved = pregens.filter((p) => {
  const s = JSON.parse(J(p)), before = J(s.specializationIds);
  CR.migrateSheet(s, cb);
  return J(s.specializationIds) !== before;
}).map((p) => p.id);
check('L2 every pregen (' + pregens.length + ') keeps its specializationIds byte for byte', pregens.length > 0 && moved.length === 0, moved);

// ── E1 (the export reads the repaired list) ──
const key = specReg.gadgeteer && specReg.gadgeteer._source_key;
const xml = X.exportCharacter(drifted, { fileName: 'b1651.xml', volatile: {} });
const specEls = (/<Specializations>([\s\S]*?)<\/Specializations>/.exec(xml) || [, ''])[1];
check('E1 HARNESS Gadgeteer has an OggDude key', typeof key === 'string' && key.length > 0, key);
check('E1 the bought tree is in the file: <Key>' + key + '</Key> under <Specializations>', specEls.indexOf('<Key>' + key + '</Key>') !== -1);

// ── E2 (the career powers read the repaired list; reSpecialized overlay records carry bonus_career_powers) ──
const ovRaw = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/mods/respecialized/fad-v1/specializations.overlay.json'), 'utf8')).specializations;
const ov = Array.isArray(ovRaw) ? Object.fromEntries(ovRaw.map((r) => [r.id, r])) : ovRaw;
const cbR = Object.assign({}, cb, { specializations: Object.assign({}, specReg) });
Object.keys(ov).forEach((k) => { cbR.specializations[k] = Object.assign({}, specReg[k] || {}, ov[k]); });
check('E2 HARNESS reSpecialized Healer\'s bonus career powers include heal_harm',
  Array.isArray(cbR.specializations.healer && cbR.specializations.healer.bonus_career_powers) && cbR.specializations.healer.bonus_career_powers.indexOf('heal_harm') !== -1);
const healerBuy = bought({ careerId: 'smuggler', specializations: [{ id: 'pilot', owned: [] }], specializationIds: ['pilot'] }, 'healer');
CR.migrateSheet(healerBuy, cbR);
const fp = C('force_powers').force_powers, hh = Array.isArray(fp) ? fp.find((p) => p.id === 'heal_harm') : fp.heal_harm;
const ctx = CR.careerPowerPriceCtx(healerBuy, cbR);
check('E2 HARNESS Heal/Harm\'s basic power prints 15 XP', CR.forcePowerBasicCost(hh, null) === 15);
check('E2 after the repair Heal/Harm prices at 10 XP (FaD p.109, a career power from the bought tree)',
  CR.forcePowerBasicCost(hh, ctx) === 10, { price: CR.forcePowerBasicCost(hh, ctx), careerPowers: ctx && ctx.careerPowers });

console.log('\nr7_b1651_spec_ids: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
