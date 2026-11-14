#!/usr/bin/env node
/* F-100 surfacing — THE MENTOR PRICE AND THE BECAUSE LINES (ruling f100-surfacing-creator-concept R-SCC-5 (ADDENDUM 2 F4) and
 * R-SCC-6 as errata'd (ADDENDUM 4 FLAG 1 (iii)); ADDENDUM 11 ACCEPTANCE (5) "the Mentor rows as F4" and (7) "a Muun's gear
 * step 500 cr with the 'after creation' because"; ADDENDUM 18 Q4 (the built K9: "500 cr" + "+1,000 after creation — Deep
 * Pockets (Muun)"; the Anomid "1,600 cr" + "+1,100 — Vast Wealth (Anomid)", BUILT-NOT-DRAWN) and D4 ("−2 — No Hands
 * (Fefze)"); brief §3.9 steps 7–8). Real CharResolve, canonical registries and the real fad-v1 pack; fcBecauseLine sliced.
 *
 *   M1  THE MENTOR PRICE (fad-v1): Ilen Varo's sheet (Consular, Niman Disciple + Healer) — Heal/Harm 15 → 10,
 *       Move 10 → 5, Influence 10 → 5 (career powers, FaD p.109's −5); a non-career power (Bind) unchanged. (RULING-MOVED
 *       (ADDENDUM 638): the engine key is deleted; its OFF leg "no price context" had no subject and is dropped.)
 *   M2  THE ROW (static, ForcePowerBuyList's paper branch): the discount is the gap between the ctx price and the printed
 *       price (forcePowerBasicCost with no ctx); the button reads "Learn · N XP (Mentor −D)"; the because "A career power —
 *       Mentor discount (FaD p.109)" (data-mentor-why).
 *   B1  THE BECAUSE WORDS (the species key ON): Muun → purse 500, "+1,000 after creation — Deep Pockets (Muun)"; CSG Anomid →
 *       purse 1,600, "+1,100 — Vast Wealth (Anomid)"; CSG Fefze → the encumbrance row "−2 — No Hands (Fefze)"; Human → no
 *       row. (RULING-MOVED (release-r7-bug-burndown ADDENDUM 638): the species key is deleted; its OFF leg "no rows" had no subject and is dropped.)
 *   B2  ONE WALK: for EVERY species record, speciesEncumbranceDeltaOf = Σ speciesEncumbranceRowsOf and speciesCreditsDeltaOf =
 *       Σ startingCredits().rows; _speciesEffectSumOf's body reads _speciesEffectRowsOf (static).
 *   B3  THE FACES (static): both gear bands print fcBecauseSpans(credits.rows, …) and fcBecauseSpans(p.speciesEncRows, …); the
 *       host passes speciesEncRows from CharResolve.speciesEncumbranceRowsOf.
 *   BITE  `--mutant` drops " after creation" from fcBecauseLine in memory → B1 red (exit 1). Read the exit code bare.
 *
 * Exit 0 = every leg green; 1 = a leg red (or the mutant's run); 2 = an unknown flag.
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
if (args.some((a) => a !== '--mutant')) { console.error('usage: f100_creator_becauses.cjs [--mutant]'); process.exit(2); }
const MUTANT = args.includes('--mutant');

let APP = fs.readFileSync(path.join(ROOT, 'player/app.jsx'), 'utf8');
const AFTER = "(r.timing === 'after_creation' ? ' after creation' : '')";
if (MUTANT) {
  if (APP.split(AFTER).length !== 2) { console.error('MUTANT NOT PLANTED: the timing words moved'); process.exit(1); }
  APP = APP.replace(AFTER, "''");
  console.log('MUTANT PLANTED: fcBecauseLine without "after creation"');
}
function slice(src, header) {
  const i = src.indexOf(header);
  if (i < 0) { console.error('SLICE MISS: ' + header); process.exit(1); }
  let k = src.indexOf('{', i + header.length), d = 0;
  for (; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) { k++; break; } } }
  return src.slice(i, k);
}
const sandbox = { Math, Number };
vm.createContext(sandbox);
vm.runInContext(slice(APP, 'function fcBecauseLine(r)'), sandbox);
const line = sandbox.fcBecauseLine;

const CR_SRC = fs.readFileSync(path.join(ROOT, 'lib/shared/charResolve.js'), 'utf8');
const CR = require(path.join(ROOT, 'lib/shared/charResolve.js'));
const M = require(path.join(ROOT, 'lib/shared/mods.js'));

let failures = 0;
const check = (ok, label) => { console.log((ok ? '  PASS  ' : '  FAIL  ') + label); if (!ok) failures++; };
const J1 = JSON.stringify;
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', f), 'utf8'));
const P = (f) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/mods/respecialized/fad-v1', f), 'utf8')); } catch (e) { return null; } };
const BASE = { careers: J('careers.json').careers, specializations: J('specializations.json').specializations,
  talents: J('talents.json').talents, forcePowers: J('force_powers.json').force_powers };
const pack = { specializations: P('specializations.overlay.json').specializations, talents: P('talents.overlay.json').talents,
  careers: (P('careers.overlay.json') || {}).careers || null };
if ((P('force_powers.overlay.json') || {}).force_powers) pack.force_powers = P('force_powers.overlay.json').force_powers;
const CB = M.applyOverlay(BASE, pack);
const SP = J('species.json').species;

// ── M1 · the Mentor price ────────────────────────────────────────────────────────────────────────────────────────────
{
  const D = { careerId: 'consular', career: 'Consular', specializationIds: ['niman_disciple', 'healer'] };
  const price = (id, ctx) => CR.forcePowerBasicCost(CB.forcePowers[id], ctx);
  const ctx = CR.careerPowerPriceCtx(D, CB);
  const got = ['heal_harm', 'move', 'influence', 'bind'].map((id) => id + ' ' + price(id) + '→' + price(id, ctx));
  check(ctx && price('heal_harm', ctx) === 10 && price('heal_harm') === 15 && price('move', ctx) === 5 && price('move') === 10
    && price('influence', ctx) === 5 && price('bind', ctx) === price('bind'),
    'M1 Ilen Varo (Consular · Niman Disciple + Healer): ' + J1(got) + ' (career powers −5, Bind unchanged)');
}
// ── M2 · the row ─────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const list = slice(APP, 'function ForcePowerBuyList({');
  check(list.includes('var printedCost = priceCtx ? CharResolve.forcePowerBasicCost(p) : basicCost;')
    && /var mentorOff = \(!owned && basicCost != null && printedCost != null && printedCost > basicCost\) \? printedCost - basicCost : 0;/.test(list)
    && list.includes("(mentorOff ? ' (Mentor \\u2212' + mentorOff + ')' : '')")
    && list.includes("data-mentor-why={p.id}") && list.includes("'A career power \\u2014 Mentor discount (FaD p.109)'"),
    'M2 the paper row: the discount = printed − charged; "Learn · N XP (Mentor −D)"; the because line');
}
// ── B1 · the because words ───────────────────────────────────────────────────────────────────────────────────────────
{
  const mu = CR.startingCredits(0, SP.muun, {}, {}), an = CR.startingCredits(0, SP.csg_anomid, {}, {});
  const fz = CR.speciesEncumbranceRowsOf(SP.csg_fefze, {}, {}), hu = CR.startingCredits(0, SP.human, {}, {});
  const words = { muun: mu.rows.map(line), anomid: an.rows.map(line), fefze: fz.map(line) };
  check(mu.purse === 500 && J1(words.muun) === J1(['+1,000 after creation — Deep Pockets (Muun)']), 'B1 Muun: purse ' + mu.purse + ', ' + J1(words.muun));
  check(an.purse === 1600 && J1(words.anomid) === J1(['+1,100 — Vast Wealth (Anomid)']), 'B1 CSG Anomid: purse ' + an.purse + ', ' + J1(words.anomid));
  check(J1(words.fefze) === J1(['−2 — No Hands (Fefze)']), 'B1 CSG Fefze: ' + J1(words.fefze));
  check(hu.rows.length === 0 && CR.speciesEncumbranceRowsOf(SP.human, {}, {}).length === 0, 'B1 Human: no row');
}
// ── B2 · one walk ────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const bad = [];
  Object.keys(SP).forEach((k) => {
    const er = CR.speciesEncumbranceRowsOf(SP[k], {}, {}).reduce((t, r) => t + r.amount, 0);
    const cr = CR.startingCredits(0, SP[k], {}, {}).rows.reduce((t, r) => t + r.amount, 0);
    if (er !== CR.speciesEncumbranceDeltaOf(SP[k], {}, {}) || cr !== CR.speciesCreditsDeltaOf(SP[k], {}, {})) bad.push(k);
  });
  const sum = slice(CR_SRC, 'function _speciesEffectSumOf(rec, picks, buyouts, op)');
  check(!bad.length && /return _speciesEffectRowsOf\(rec, picks, buyouts, op\)\.reduce/.test(sum),
    'B2 ' + Object.keys(SP).length + ' species: the rows total the sums (mismatches ' + J1(bad) + '); the sum reads the rows walk');
}
// ── B3 · the faces ───────────────────────────────────────────────────────────────────────────────────────────────────
{
  const wide = slice(APP, 'function FCGearSheet(p)'), phone = slice(APP, 'function FCGearSheetPhone(p)');
  const both = (src) => src.includes("fcBecauseSpans(credits.rows, 'data-creator-purse-why')") && src.includes("fcBecauseSpans(p.speciesEncRows, 'data-creator-enc-why')");
  check(both(wide) && both(phone) && APP.includes('speciesEncRows={CharResolve.speciesEncumbranceRowsOf(ctrl.selectedSpeciesData, ctrl.character.speciesOptionPicks, ctrl.character.creationBuyouts)}'),
    'B3 both gear bands print the purse and encumbrance becauses; the host passes the rows');
}

console.log(failures ? `FAILED: ${failures} leg(s) red (exit 1)` : 'OK: every leg green (exit 0)');
process.exit(failures ? 1 : 0);
