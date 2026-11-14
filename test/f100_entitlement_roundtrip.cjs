#!/usr/bin/env node
/* F-100 surfacing — THE STARTING ENTITLEMENT (ruling f100-surfacing-creator-concept R-SCC-3; ADDENDUM 11 OWNS "the save shape
 * sheet.entitlements: [{id, declined?: true}], declined: true persisted only when ticked" and ACCEPTANCE (4) "the
 * entitlement line and Decline round trip (reload; the record; the GEAR card's two faces, R6)"; D-229 Q1 (a) ii — LIVE,
 * ADDENDUM 18; brief §3.1 the NEW member). The reader and the tick's write are player/app.jsx's fcEntitlementLines and
 * fcEntitlementToggle, SLICED by name; the carry is CharResolve.normalizeCreated.
 *
 *   E1  THE READER on the real careers registry: Bounty Hunter → one line, "Imperial Peace-Keeping Certificate — Granted
 *       automatically; a player may decline it."; a saved {ipkc, declined: true} reads declined; an id the career does not
 *       carry is ignored; a career with no entitlement (Smuggler) → none; every carrier counted (21 careers, 1 carrier).
 *   E2  THE TICK: granted → [{id: 'ipkc', declined: true}]; ticked again → undefined (the field goes: absent = granted).
 *   E3  THE CARRY (a Bounty Hunter's creator state): the tick's value on the creator state → normalizeCreated → the saved
 *       sheet carries entitlements [{ipkc, declined: true}] (a deep copy); ticked again, the saved list reads back to
 *       undefined and the saved sheet has NO `entitlements` field; no tick at all has none either.
 *   E4  THE FACES (static, the sources): the sheet GEAR card and the review print a line only for a GRANTED entitlement
 *       ("<name> (starting entitlement)" on the sheet) through fcEntitlementLines; the gear step's tick is the plate's
 *       hp-head + hp-box with aria-pressed (D6), on both bands.
 *   BITE  `--mutant` drops the entitlements carry from normalizeCreated in memory → E3 red (exit 1). Read the exit code bare.
 *
 * Exit 0 = every leg green; 1 = a leg red (or the mutant's run); 2 = an unknown flag.
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), Module = require('module');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
if (args.some((a) => a !== '--mutant')) { console.error('usage: f100_entitlement_roundtrip.cjs [--mutant]'); process.exit(2); }
const MUTANT = args.includes('--mutant');

const CR_PATH = path.join(ROOT, 'lib/shared/charResolve.js');
let src = fs.readFileSync(CR_PATH, 'utf8');
const CARRY = "if (Array.isArray(character.entitlements) && character.entitlements.length) __sheet.entitlements = JSON.parse(JSON.stringify(character.entitlements));";
if (MUTANT) {
  if (src.split(CARRY).length !== 2) { console.error('MUTANT NOT PLANTED: the carry moved'); process.exit(1); }
  src = src.replace(CARRY, '');
  console.log('MUTANT PLANTED: normalizeCreated without the entitlements carry');
}
const m = new Module(CR_PATH, module);
m.filename = CR_PATH;
m.paths = Module._nodeModulePaths(path.dirname(CR_PATH));
m._compile(src, CR_PATH);
const CR = m.exports;

const APP = fs.readFileSync(path.join(ROOT, 'player/app.jsx'), 'utf8');
function slice(header) {
  const i = APP.indexOf(header);
  if (i < 0) { console.error('SLICE MISS: ' + header); process.exit(1); }
  let k = APP.indexOf('{', i + header.length), d = 0;
  for (; k < APP.length; k++) { if (APP[k] === '{') d++; else if (APP[k] === '}') { d--; if (!d) { k++; break; } } }
  return APP.slice(i, k);
}
const sandbox = { JSON, Array, Object, String };
vm.createContext(sandbox);
vm.runInContext([slice('function fcEntitlementLines(careerRec, saved)'), slice('function fcEntitlementToggle(lines, id)')].join('\n'), sandbox);
const { fcEntitlementLines: lines, fcEntitlementToggle: toggle } = sandbox;

let failures = 0;
const check = (ok, label) => { console.log((ok ? '  PASS  ' : '  FAIL  ') + label); if (!ok) failures++; };
const clone = (x) => JSON.parse(JSON.stringify(x));
const J1 = JSON.stringify;
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', f), 'utf8'));
const CB = {
  species: J('species.json').species, careers: J('careers.json').careers, specializations: J('specializations.json').specializations,
  talents: J('talents.json').talents, forcePowers: J('force_powers.json').force_powers, signatureAbilities: J('signature_abilities.json').signature_abilities,
  skillSheetKeys: (J('skills.vocab.json').entries || []).reduce((o, e) => { o[e.id] = (e.aliases || []).find((a) => /^[A-Z]+$/.test(a)) || e.id; return o; }, {}),
};
const DEPS = { registries: {}, activeMods: [], portraitFor: () => null };
const save = (character, sheet) => CR.normalizeCreated(character, CB.species[sheet.speciesId] || null,
  CB.specializations[(sheet.specializations || [])[0] ? sheet.specializations[0].id : null] || null, { charbuild: CB }, sheet.source, DEPS);

// ── E1 · the reader ──────────────────────────────────────────────────────────────────────────────────────────────────
const BH = CB.careers.bounty_hunter;
{
  const l = lines(BH, undefined);
  const words = l.map((x) => x.name + ' — ' + x.note);
  check(l.length === 1 && l[0].id === 'ipkc' && !l[0].declined
    && words[0] === 'Imperial Peace-Keeping Certificate — Granted automatically; a player may decline it.',
    'E1 Bounty Hunter: ' + J1(words) + ', granted');
  check(lines(BH, [{ id: 'ipkc', declined: true }])[0].declined === true, 'E1 a saved {ipkc, declined: true} reads declined');
  check(J1(lines(BH, [{ id: 'nope', declined: true }]).map((x) => x.declined)) === '[false]' && lines(CB.careers.smuggler, [{ id: 'ipkc', declined: true }]).length === 0,
    'E1 a foreign id is ignored; the Smuggler (no entitlement) has none');
  const carriers = Object.keys(CB.careers).filter((k) => lines(CB.careers[k]).length);
  check(Object.keys(CB.careers).length === 21 && J1(carriers) === '["bounty_hunter"]', 'E1 ' + Object.keys(CB.careers).length + ' careers, carriers ' + J1(carriers));
}
// ── E2 · the tick ────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const on = toggle(lines(BH, undefined), 'ipkc');
  const off = toggle(lines(BH, on), 'ipkc');
  check(J1(on) === J1([{ id: 'ipkc', declined: true }]) && off === undefined, 'E2 tick → ' + J1(on) + '; again → ' + String(off));
}
// ── E3 · the carry ───────────────────────────────────────────────────────────────────────────────────────────────────
{
  const sheet = { speciesId: 'human', specializations: [], source: 'FullCreator' };
  const state = () => ({
    identity: { name: 'Ryn Kessig', playerName: '' }, narrative: { backstory: '' }, appearance: {}, gameLine: 'eote',
    species: { key: 'human', name: 'Human' }, career: { key: 'bounty_hunter', name: BH.name }, specializations: [],
    characteristics: { brawn: 2, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
    skills: {}, talents: {}, forcePowers: {}, mechanic: null, gearLedger: { startingCredits: 500, credits: 500, inventory: [] },
    motivations: { strength: null, flaw: null, desire: null, fear: null }, notes: { personal: '', gm: '' },
  });
  check(!('entitlements' in clone(save(state(), sheet))), 'E3 a creator state with no tick saves with NO entitlements field (absent = granted)');
  const ch = state();
  ch.entitlements = toggle(lines(BH, undefined), 'ipkc');
  const made = save(ch, sheet), saved = clone(made);
  check(J1(saved.entitlements) === J1([{ id: 'ipkc', declined: true }]) && made.entitlements !== ch.entitlements,
    'E3 Decline ticked → saved ' + J1(saved.entitlements) + ', a deep copy');
  const back = state();
  back.entitlements = toggle(lines(BH, saved.entitlements), 'ipkc');
  const unt = clone(save(back, sheet));
  check(!('entitlements' in unt), 'E3 unticked → the saved sheet has no entitlements field');
  check(lines(BH, saved.entitlements).filter((l) => !l.declined).length === 0 && lines(BH, unt.entitlements).filter((l) => !l.declined).length === 1,
    'E3 R6: the GEAR card’s line — none when declined, one when granted');
}
// ── E4 · the faces ───────────────────────────────────────────────────────────────────────────────────────────────────
{
  const stack = slice('function SheetStack(p)');
  check(/fcEntitlementLines\(cb && cb\.careers && cb\.careers\[CharResolve\.sheetCareerId\(sheet, cb\.careers\)\], sheet\.entitlements\)\.filter\(function \(l\) \{ return !l\.declined; \}\)/.test(stack)
    && stack.includes("l.name + ' (starting entitlement)'"), 'E4 the sheet GEAR card: a granted entitlement’s one line, nothing when declined');
  const review = slice('function fcReviewCreditsPlate(a)');
  check(/\(a\.entitlementLines \|\| \[\]\)\.filter\(function\(l\) \{ return !l\.declined; \}\)/.test(review) && review.includes('data-review-entitlement'),
    'E4 the review repeats a granted entitlement’s line under Credits');
  const plate = slice('function FCEntitlementPlate({ lines, onToggle })');
  check(/className="hp-head"[\s\S]*aria-pressed=\{l\.declined \? 'true' : 'false'\}[\s\S]*className="hp-box" data-on=/.test(plate) && plate.includes('>Decline<'),
    'E4 the tick: hp-head + hp-box, aria-pressed, "Decline" (D6)');
  check(slice('function FCGearSheet(p)').includes('<FCEntitlementPlate lines={p.entitlementLines}') && slice('function FCGearSheetPhone(p)').includes('<FCEntitlementPlate lines={p.entitlementLines}'),
    'E4 both gear bands carry the plate');
}

console.log(failures ? `FAILED: ${failures} leg(s) red (exit 1)` : 'OK: every leg green (exit 0)');
process.exit(failures ? 1 : 0);
