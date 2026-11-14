// test/sheet_pool_talent_view.cjs — R-S4SH-2 (ruling `shipyard-s4-ship`, F2): the carry-merged member of the ONE pool
// path, `SWRPGSheetPool.collectPoolMods` (lib/shared/sheetPool.js, carry 19708d5c · F-100 M5 C4.1, merged at 22c861fc),
// resolves the owner's talent dice through the character's STAMP VIEW when a resolver is registered
// (`CharResolve.setTalentViewResolver`, which each host registers with the shared `sheetTalentView`), and through the
// DISCOVERY view (`window._canonicalCharbuild`) when none is — carry's own C4.4 fallback.
//
// Driven, not read: the shared module runs in a node vm over the real CharResolve and SWRPGPoolMods, with one owned
// talent whose pool_mods differ between the two views (the discovery view adds a Boost; the stamp view removes a
// Setback), so the dice returned name the view that answered.
// THE BITE (the ruling's own mutant, landed in lib/shared/sheetPool.js): `var cb = view || window._canonicalCharbuild`
// → `var cb = window._canonicalCharbuild` — the stamp row goes red and the file exits 1.
//
// PART 2 — HANDOFF `f100-talent-view-shared` (ruling `f100-m5-contracts` ADDENDUM 3, A3-1…A3-4): THE SHARED WRAPPER,
// registered the way each HOST registers it. lib/shared/talentView.js and lib/shared/sheetPool.js run in a fresh node vm
// per host over the real CharResolve, SWRPGMods and SWRPGPoolMods and a REAL user store (userData.js on its memory
// adapter, the shipped schemas and registries). The base is the one SWRPGSheetPool.loadCanonicalCharacterBuild writes
// (A3-3; qbFetchJson reads the shipped files). The host's registration is the statement READ OUT OF ITS OWN SOURCE —
// gm/app.jsx, player/app.jsx — and run; a host whose source carries none registers nothing here either.
// FIXTURE (case 7's device state): the device's own pack My Data redefines two book talents the character owns — Grit,
// strain threshold +1 → +2 (a derived value), and Combat Veteran, a Boost on Brawl and Discipline → a removed Setback
// (its pool_mods) — and is switched OFF on this device, so the DISCOVERY view is the book's while the character's STAMP
// still names the house rule. The sheet's persisted projection was written under the book (+1), before the house rule,
// so the value names the view that answered: the stamp's (+2 · remove setback) or the fallbacks' (+1 · add boost).
// THE BITE (the card's mutant, landed in gm/app.jsx): delete `window.SWRPGTalentView.register();` → the GM rows go red
// and the file exits 1.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log('✓ ' + label); } else { fail++; console.log('✗ ' + label + (detail !== undefined ? '  — ' + JSON.stringify(detail).slice(0, 300) : '')); }
}

const CharResolve = require(path.join(ROOT, 'lib/shared/charResolve.js'));
const PoolMods = require(path.join(ROOT, 'lib/shared/poolMods.js'));
const MOD = (die, direction) => ({ die: die, count: 1, direction: direction, condition: null, applies_to: [{ scope: 'characteristic', value: 'agility' }] });
const DISCOVERY = { talents: { tal_view: { id: 'tal_view', name: 'Test Talent', ranked: false, pool_mods: [MOD('boost', 'add')] } }, species: {} };
const STAMP = { talents: { tal_view: { id: 'tal_view', name: 'Test Talent', ranked: false, pool_mods: [MOD('setback', 'remove')] } }, species: {} };
const OWNER = { name: 'Test Pilot', talents: [{ id: 'tal_view', rank: 1 }], mods: ['a-house-rule-pack'] };

const box = { console: console, Promise: Promise, setTimeout: setTimeout, CharResolve: CharResolve, SWRPGPoolMods: PoolMods,
  _canonicalCharbuild: DISCOVERY, addEventListener: function () {}, dispatchEvent: function () {} };
box.window = box;
let SP = null;
try {
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'lib/shared/sheetPool.js'), 'utf8'), box, { filename: 'sheetPool.js' });
  SP = box.SWRPGSheetPool;
} catch (e) { check('lib/shared/sheetPool.js evaluates in node', false, String(e).slice(0, 200)); }
check('the one pool path is up: SWRPGSheetPool.collectPoolMods', !!(SP && typeof SP.collectPoolMods === 'function'));
check('non-vacuity: CharResolve carries the talent-view resolver the player registers (setTalentViewResolver · talentViewFor)',
  typeof CharResolve.setTalentViewResolver === 'function' && typeof CharResolve.talentViewFor === 'function');

function dice(mods) { return (mods || []).filter((m) => m.source === 'Test Talent').map((m) => m.direction + ' ' + m.die).sort(); }
const EQUIPMENT = { weapons: [], armor: null, gear: [], _owner: OWNER };

if (SP && typeof CharResolve.setTalentViewResolver === 'function') {
  CharResolve.setTalentViewResolver(null);
  const none = dice(SP.collectPoolMods(EQUIPMENT));
  check('no resolver registered (the GM app): the owner\'s talent dice are the DISCOVERY view\'s (add boost)', JSON.stringify(none) === JSON.stringify(['add boost']), none);

  CharResolve.setTalentViewResolver(function (sheet) { return sheet === OWNER ? STAMP : null; });
  const stamped = dice(SP.collectPoolMods(EQUIPMENT));
  check('a resolver registered (the player\'s sheetTalentView): the owner\'s talent dice are the STAMP view\'s (remove setback), never the discovery\'s',
    JSON.stringify(stamped) === JSON.stringify(['remove setback']), stamped);

  CharResolve.setTalentViewResolver(function () { return null; });
  const declined = dice(SP.collectPoolMods(EQUIPMENT));
  check('a resolver that has no view for this sheet: back to the discovery view (C4.4\'s fallback)', JSON.stringify(declined) === JSON.stringify(['add boost']), declined);

  CharResolve.setTalentViewResolver(function () { return STAMP; });
  const ownerless = dice(SP.collectPoolMods({ weapons: [], armor: null, gear: [] }));
  check('equipment with no owner: no talent dice at all, whichever view is registered', ownerless.length === 0, ownerless);
  CharResolve.setTalentViewResolver(null);
}

console.log('— part 1 (R-S4SH-2): ' + pass + '/' + (pass + fail));

// ══ PART 2 — the shared wrapper, registered the way each HOST registers it (f100-talent-view-shared, A3-1…A3-4) ══
const U = require(path.join(ROOT, 'lib/shared/userData.js'));
const PV = require(path.join(ROOT, 'lib/shared/packValidate.js'));
const M = require(path.join(ROOT, 'lib/shared/mods.js'));
const clone = (v) => JSON.parse(JSON.stringify(v));
const canon = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', f), 'utf8'));
const BOOK = {}; PV.APPLIED_SECTIONS.forEach((sec) => { BOOK[sec] = canon(sec + '.json')[sec]; });
const VOCAB = { skills: canon('skills.vocab.json').entries.map((e) => e.id), qualities: canon('qualities.vocab.json').entries.map((e) => e.id) };
// A host's registration as its own source carries it: a top-level statement, at column 0, never commented out.
const REG_LINE = /^window\.SWRPGTalentView\.register\(\);$/;
const registrationOf = (host) => fs.readFileSync(path.join(ROOT, host), 'utf8').split('\n').filter((l) => REG_LINE.test(l));
const cvDice = (mods) => (mods || []).filter((m) => m.source === 'Combat Veteran').map((m) => m.direction + ' ' + m.die).sort();

// One host's page, in node: the two shared modules it loads, the base its loader writes, then ITS registration.
async function hostRun(label, stmts, H, sheets) {
  CharResolve.setTalentViewResolver(null);   // CharResolve holds ONE resolver slot: each host starts with it empty
  const box = { console: console, Promise: Promise, setTimeout: setTimeout, CharResolve: CharResolve, SWRPGPoolMods: PoolMods,
    SWRPGMods: M, SWRPGUserData: H, addEventListener: function () {}, removeEventListener: function () {}, dispatchEvent: function () {},
    qbFetchJson: (url) => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, url), 'utf8'))),
    speciesPortraitIndexReady: Promise.resolve(null) };
  box.window = box;
  const ctx = vm.createContext(box);
  for (const f of ['lib/shared/talentView.js', 'lib/shared/sheetPool.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  await box.SWRPGSheetPool.loadCanonicalCharacterBuild();
  stmts.forEach((st) => vm.runInContext(st, ctx, { filename: label + ' — its registration' }));
  const out = { base: box._canonicalCharbuildBase, discovery: box._canonicalCharbuild, TV: box.SWRPGTalentView, per: {} };
  for (const k of Object.keys(sheets)) {
    const sh = sheets[k];
    out.per[k] = { view: box.SWRPGTalentView.sheetTalentView(sh), seam: CharResolve.talentViewFor(sh),
      dice: cvDice(box.SWRPGSheetPool.collectPoolMods({ weapons: [], armor: null, gear: [], _owner: sh })),
      strain: CharResolve.computeDerived(sh, null, box._canonicalCharbuild).strainThreshold };
  }
  CharResolve.setTalentViewResolver(null);
  return out;
}

(async function part2() {
  console.log('\nPART 2 — f100-talent-view-shared: the shared wrapper, registered the way each host registers it');
  // the device: a real store, My Data redefining Grit (+1 → +2 strain) and Combat Veteran (add boost → remove setback)
  const H = U.createStore({ adapter: U.memoryAdapter(), schemas: PV.readSchemaDir(path.join(ROOT, 'schema')), vocab: VOCAB, base: BOOK });
  await H.ready();
  const grit = clone(BOOK.talents.grit); grit.effects[0].amount = 2;
  const cv = clone(BOOK.talents.combat_veteran); cv.pool_mods = [Object.assign(clone(cv.pool_mods[0]), { die: 'setback', direction: 'remove' })];
  const w1 = await H.saveRecord('my_data', 'talents', grit), w2 = await H.saveRecord('my_data', 'talents', cv);
  check('fixture: the store took both house rules (Grit, Combat Veteran) into My Data', !!(w1 && w1.ok !== false && w2 && w2.ok !== false), [w1, w2]);
  const stamps = H.activeStamps();
  check('fixture: the character is stamped with My Data (' + JSON.stringify(stamps) + ')', stamps.length === 1 && /^user:/.test(stamps[0]), stamps);
  const sheet = { name: 'Kel Arvo', speciesId: 'human', characteristics: { brawn: 2, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
    woundBase: 10, strainBase: 10, forceRatingBase: 0, specializations: [], forcePowers: [],
    talents: [{ id: 'grit', rank: 1 }, { id: 'combat_veteran', rank: 1 }], mods: stamps.slice() };
  Object.assign(sheet, CharResolve.talentValuesAtRender(sheet, { talents: BOOK.talents }));   // persisted at buy, under the BOOK
  const away = Object.assign(clone(sheet), { mods: [stamps[0].replace(/^user:[^@]+/, 'user:a_pack_not_on_this_device')] });
  await H.setActive('my_data', false);   // case 7: the house rule is OFF for discovery on this device; the stamp still names it
  M.useUserPacks(H);
  check('fixture: My Data is OFF for discovery (no active stamps), yet present for the stamp (missingFor [])',
    H.activeStamps().length === 0 && H.missingFor(sheet.mods).length === 0, { active: H.activeStamps(), missing: H.missingFor(sheet.mods) });
  check('fixture: the second sheet\'s stamp names a pack NOT on this device (missingFor names it)', H.missingFor(away.mods).length === 1, away.mods);

  const SHEETS = { own: sheet, away: away };
  const none = await hostRun('no host', [], H, SHEETS);
  const gmStmts = registrationOf('gm/app.jsx'), plStmts = registrationOf('player/app.jsx');
  check('gm/app.jsx registers the shared wrapper at boot — one top-level `window.SWRPGTalentView.register();` (' + gmStmts.length + ')', gmStmts.length === 1);
  check('player/app.jsx registers it the same way (' + plStmts.length + ')', plStmts.length === 1);
  const gm = await hostRun('gm/app.jsx', gmStmts, H, SHEETS), pl = await hostRun('player/app.jsx', plStmts, H, SHEETS);

  // non-vacuity: the fallbacks answer differently from the stamp, so a value names its view
  check('control, no registration: Combat Veteran\'s dice are the book discovery view\'s (add boost) ' + JSON.stringify(none.per.own.dice),
    JSON.stringify(none.per.own.dice) === '["add boost"]', none.per.own.dice);
  check('control, no registration: CharResolve.talentViewFor answers null, so the strain threshold is the persisted projection\'s (Grit +1) — ' + none.per.own.strain,
    typeof none.per.own.strain === 'number' && none.per.own.seam === null, { seam: !!none.per.own.seam, strain: none.per.own.strain });
  // A3-3: one base, one loader
  check('A3-3: on the GM the view reads the base SWRPGSheetPool.loadCanonicalCharacterBuild wrote — pristine (Grit +1), not the house rule',
    !!gm.base && gm.base.talents && gm.base.talents.grit.effects[0].amount === 1 && gm.base.talents.combat_veteran.pool_mods[0].die === 'boost');
  // THE GM ROWS — A3-2
  check('GM (its own registration): CharResolve.talentViewFor answers the character\'s STAMP view — My Data\'s Grit (+2) in it',
    !!gm.per.own.seam && gm.per.own.seam.talents.grit.effects[0].amount === 2 && gm.per.own.seam === gm.per.own.view);
  check('GM (its own registration): Combat Veteran\'s dice are the character\'s STAMP view\'s (remove setback), never discovery\'s ' + JSON.stringify(gm.per.own.dice),
    JSON.stringify(gm.per.own.dice) === '["remove setback"]', gm.per.own.dice);
  check('GM (its own registration): the strain threshold is the STAMP\'s — Grit +2, one above the persisted +1 (' + none.per.own.strain + ' → ' + gm.per.own.strain + ')',
    gm.per.own.strain === none.per.own.strain + 1, { none: none.per.own.strain, gm: gm.per.own.strain });
  // the mirror: the same sheet, the same device state → the same numbers on both hosts
  check('the no-compromise mirror: the GM\'s dice and strain equal the player\'s under the player\'s own registration',
    JSON.stringify(pl.per.own.dice) === JSON.stringify(gm.per.own.dice) && pl.per.own.strain === gm.per.own.strain && JSON.stringify(pl.per.own.dice) === '["remove setback"]',
    { gm: { dice: gm.per.own.dice, strain: gm.per.own.strain }, pl: { dice: pl.per.own.dice, strain: pl.per.own.strain } });
  // A3-4: the same degrade on both hosts
  check('A3-4: a stamped pack not on this device → the view is NULL on both hosts (the wrapper and the seam)',
    gm.per.away.view === null && pl.per.away.view === null && gm.per.away.seam === null && pl.per.away.seam === null);
  check('A3-4: …and each consumer takes the player\'s own fallback on both hosts — dice from discovery (add boost), strain from the persisted projection',
    JSON.stringify(gm.per.away.dice) === '["add boost"]' && JSON.stringify(pl.per.away.dice) === '["add boost"]' && gm.per.away.strain === none.per.own.strain && pl.per.away.strain === none.per.own.strain,
    { gm: [gm.per.away.dice, gm.per.away.strain], pl: [pl.per.away.dice, pl.per.away.strain] });
})().catch((e) => { check('part 2 ran to the end', false, String(e && e.stack || e).slice(0, 300)); }).then(() => {
  console.log('\n' + pass + '/' + (pass + fail) + ' ' + (fail ? 'FAILED' : 'ALL PASS'));
  process.exit(fail ? 1 : 0);
});
