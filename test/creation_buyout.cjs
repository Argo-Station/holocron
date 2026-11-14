/**
 * THE CREATION BUYOUT — the shared core, the save, and the two mutants.
 *
 * Ruling `species-followups-creator-moments` §3 (R-SFC-1/2/3), amended by
 * `creation-buyout-count-and-price` (R-CBC-1/2/4). This guard owns the parts that are provable in
 * node: WHICH abilities offer a buyout, at WHAT price, what the purchase does to the XP audit, and
 * that the fact survives being saved. The browser suite
 * (`scripts/smoke_creation_buyout.py`) owns what only a rendered screen can show.
 *
 * BOTH MUTANTS ARE RUN, because a guard whose failure mode is never exercised is not a guard, and
 * these two are the named ones (R-CBC-4):
 *   · a NAME-KEYED implementation (match the ability called "Primitive") misses FOUR of the 35
 *     stamped records — Kamarian's Badlander, Krish, Roonan and Toong.
 *   · a HARD-CODED 10 charges Roonan and Toong double: their own prose prints 5.
 */
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '..');
const CR = require(path.join(REPO, 'lib/shared/charResolve.js'));
const SPECIES = JSON.parse(fs.readFileSync(
  path.join(REPO, 'public/data/canonical/species.json'), 'utf8')).species;
const charbuild = { species: SPECIES };

let pass = 0, fail = 0;
const ok = (cond, msg) => { cond ? (pass++, console.log('PASS ' + msg))
                                 : (fail++, console.log('FAIL ' + msg)); };
// A MISSING ROW MUST REDDEN, NEVER THROW. B-130's shape: an assert that reaches into an empty
// result crashes the file, and a crash reports nothing at all — so the run that was supposed to
// prove the guard catches a defect instead prints a stack trace and no count. Every "the first
// offer" read below goes through here.
const first = (offers) => (offers && offers[0]) || {};

// ── the API exists, and it is the one the surfaces call ─────────────────────────────────────
['speciesBuyoutOffers', 'speciesAbilitiesResolved', 'abilitySlug', 'creationBuyoutSpend']
  .forEach((fn) => ok(typeof CR[fn] === 'function', `shared core exports ${fn}`));

// ── the CLASS, walked off the shelf (the census the validator asserts, re-derived here) ──────
// Read structurally, never by prose: this is the same field the surface reads, so a stamp that
// went missing reddens here as well as in validate_registries.
const carriers = [];
Object.keys(SPECIES).forEach((id) => {
  const rec = SPECIES[id];
  (rec.special_abilities || []).forEach((a) => {
    if (a.buyout_xp != null) carriers.push({ id, name: a.name, xp: a.buyout_xp, level: 'top' });
  });
  (rec.option_choices || []).forEach((oc) => (oc.options || []).forEach((o) => {
    (o.special_abilities || []).forEach((a) => {
      if (a.buyout_xp != null) carriers.push({ id, name: a.name, xp: a.buyout_xp, level: 'option:' + o.id });
    });
  }));
});
ok(carriers.length === 35, `R-CBC-2: the stamped class is 35 carriers (got ${carriers.length})`);
const names = [...new Set(carriers.map((c) => c.name))].sort();
ok(names.length === 4, `four ability names carry the offer (got ${names.length}: ${names})`);
const prices = [...new Set(carriers.map((c) => c.xp))].sort((a, b) => a - b);
ok(prices.length === 2 && prices[0] === 5 && prices[1] === 10,
   `two prices on the shelf, 5 and 10 (got ${prices})`);

// ── OFFERS: present for a carrier, absent for a non-carrier ─────────────────────────────────
const abyssin = CR.speciesBuyoutOffers(SPECIES.csg_abyssin);
const abyssinRow = first(abyssin);
ok(abyssin.length === 1 && abyssinRow.slug === 'primitive' && abyssinRow.xp === 10,
   'a top-level carrier offers exactly its one buyout (Abyssin / Primitive / 10 XP)');
ok(abyssinRow.description === (SPECIES.csg_abyssin.special_abilities.find((a) => a.name === 'Primitive').description || '').replace(/\s+/g, ' ').trim(),
   'the row carries the FULL registry description, verbatim (whitespace-normalised only)');
ok(CR.speciesBuyoutOffers(SPECIES.bith).length === 0,
   'a non-carrier offers nothing (Bith) — the block is absent, not empty');
ok(CR.speciesBuyoutOffers(null).length === 0, 'no species record at all is graceful, never a throw');

// ── the PRICE is read from the record, not assumed ──────────────────────────────────────────
const roonan = first(CR.speciesBuyoutOffers(SPECIES.csg_roonan));
ok(roonan.xp === 5 && roonan.slug === 'small_comforts',
   `R-CBC-4: Roonan's Small Comforts costs 5 XP, read from the record (got ${roonan.xp})`);
ok(/5 XP/.test(roonan.description || '') && !/10 XP/.test(roonan.description || ''),
   "the price on the row matches the number printed in the ability's OWN sentence");

// ── the WINDOW vocabulary (R-CBC-1): absent means "creation" ────────────────────────────────
ok(first(CR.speciesBuyoutOffers(SPECIES.csg_krish)).window === 'creation',
   'an unstamped window resolves to "creation" (the default, not undefined)');
ok(first(CR.speciesBuyoutOffers(SPECIES.csg_toong)).window === 'any',
   'Toong carries window "any" — the offer that also stands after creation');

// ── THE KAMARIAN, BOTH SIDES: the offer follows the subspecies pick ─────────────────────────
const KAM = SPECIES.csg_kamarian;
const GID = String(KAM.option_choices[0].name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
ok(CR.speciesBuyoutOffers(KAM, { [GID]: 'badlander' }).length === 1,
   'Kamarian + Badlander: the option-level buyout is offered');
ok(CR.speciesBuyoutOffers(KAM, { [GID]: 'mountain_dweller' }).length === 0,
   'Kamarian + Mountain Dweller: no offer — the block is absent on the other side of the same pick');
ok(CR.speciesBuyoutOffers(KAM).length === 0,
   'Kamarian with NO pick yet offers nothing (an unpicked group grants nothing — B-19s gate)');

// ── the SPEND summer (one source for the live bar and the saved sheet) ──────────────────────
ok(CR.creationBuyoutSpend({ primitive: { xp: 10 } }) === 10, 'spend: one taken buyout costs its price');
ok(CR.creationBuyoutSpend({ primitive: { xp: 10 }, small_comforts: { xp: 5 } }) === 15,
   'spend: two taken buyouts sum their OWN prices (10 + 5 = 15, never 2 x 10)');
ok(CR.creationBuyoutSpend({}) === 0 && CR.creationBuyoutSpend(undefined) === 0,
   'spend: nothing taken, and the key absent entirely, both cost 0 (old saves)');

// ── THE PROJECTION: a bought-out ability is OMITTED from the resolved sheet ─────────────────
const before = CR.speciesAbilityGrants({ speciesId: 'csg_abyssin' }, charbuild).map((a) => a.name);
const after = CR.speciesAbilityGrants(
  { speciesId: 'csg_abyssin', creationBuyouts: { primitive: { xp: 10 } } }, charbuild).map((a) => a.name);
ok(before.includes('Primitive'), 'fixture: Abyssin resolves Primitive before the buyout');
ok(!after.includes('Primitive'), 'R-SFC-2: the bought-out ability is GONE from the resolved sheet');
ok(after.length === before.length - 1 && before.filter((n) => n !== 'Primitive').every((n) => after.includes(n)),
   'R-SFC-2: only the bought-out ability leaves — every other ability survives');
ok(CR.speciesAbilityGrants({ speciesId: 'csg_abyssin', creationBuyouts: {} }, charbuild).length === before.length,
   'an EMPTY buyout map removes nothing (the projection fires on the key, not on its presence)');

// ── THE ROUND TRIP: creator -> sheet -> creator (F-45 §6) ───────────────────────────────────
function creatorCharacter(extra) {
  return Object.assign({
    id: 'x', identity: { name: 'Buyout Tester' }, gameLine: 'eote',
    narrative: { backstory: '' }, appearance: {},
    species: { name: 'Abyssin', key: 'csg_abyssin' }, career: null, specializations: [],
    characteristics: { brawn: 2, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
    skills: {}, talents: {}, forcePowers: {}, mechanic: null,
    gearLedger: { startingCredits: 500, credits: 500, inventory: [] },
    motivations: { strength: null, flaw: null, desire: null, fear: null },
    notes: { personal: '', gm: '' },
  }, extra || {});
}
const REC = SPECIES.csg_abyssin;
const GAMEDATA = { charbuild: { species: SPECIES, careers: {}, specializations: {}, talents: {} } };
const DEPS = { registries: {}, activeMods: [], portraitFor: () => null };
const plain = CR.normalizeCreated(creatorCharacter(), REC, null, GAMEDATA, 'test', DEPS);
const bought = CR.normalizeCreated(
  creatorCharacter({ creationBuyouts: { primitive: { xp: 10 } } }), REC, null, GAMEDATA, 'test', DEPS);

ok(plain.creationBuyouts === undefined,
   'ADDITIVE: a character that bought nothing writes NO key (old saves stay byte-identical)');
ok(bought.creationBuyouts && bought.creationBuyouts.primitive.xp === 10,
   'the purchase persists as the FACT — { <ability-slug>: { xp } }');
ok(bought.xp.remaining === plain.xp.remaining - 10,
   `the saved sheet's remaining XP is 10 lower (${plain.xp.remaining} -> ${bought.xp.remaining})`);
ok(bought.xp.spent === plain.xp.spent + 10,
   'the saved sheet counts the buyout as SPENT, so total = spent + remaining still holds');
ok(bought.xp.spent + bought.xp.remaining === bought.xp.total,
   'the XP audit balances with a buyout taken');

// ── THE ADVANCEMENT NEGATIVE: creation-only by RAW (R-CBC-4, narrowed to window=creation) ───
// Structural, because the property is "no advancement surface offers this".
// RE-POINTED (B-1688, D-449; ruling `release-r7-bug-burndown` ADDENDUM 469 F3): `FCBuyoutBlock` was the dead legacy shell's,
// deleted with it, and its mount count measured that shell. The offer a player sees is `FCbBuyOff`, `[data-buyout-block]`.
// KEEPS: no advancement surface offers buy-off, on the live section. DROPS: the mount count in the dead shell, and the line
// window's history. The chain read here: the section mounts only in the two characteristics sheets; those mount only under
// the creator's characteristics step; the offers are computed only by `FullCreator` (and the species count beside it).
const APP = fs.readFileSync(path.join(REPO, 'player/app.jsx'), 'utf8');
const LINES = APP.split('\n');
const enclosingFn = (at) => {
  for (let i = at; i >= 0; i--) { const m = LINES[i].match(/^function (\w+)/); if (m) return m[1]; }
  return null;
};
const siteFns = (re) => LINES.map((l, i) => (re.test(l) ? enclosingFn(i) : null)).filter(Boolean);
const eq = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const mountFns = siteFns(/<FCbBuyOff\b/);
ok(eq(mountFns, ['FCCharSheetPhone', 'FCCharSheet']),
   `the buy-off section mounts only in the two characteristics sheets (${mountFns.join(', ')})`);
ok((APP.match(/data-buyout-block=/g) || []).length === 1, 'the section is the only thing in the app carrying data-buyout-block');
const sheetAt = (sheet) => LINES.map((l, i) => (new RegExp('<' + sheet + '\\b').test(l) ? i : -1)).filter((i) => i >= 0);
const phoneAt = sheetAt('FCCharSheetPhone');
ok(phoneAt.length === 1 && enclosingFn(phoneAt[0]) === 'FCCharSheet', 'the phone sheet mounts only inside FCCharSheet');
const wideAt = sheetAt('FCCharSheet');
const conds = wideAt.map((i) => {
  for (let k = i; k >= 0; k--) { const m = LINES[k].match(/ctrl\.currentStep === '(\w+)'/); if (m) return m[1]; }
  return null;
});
ok(wideAt.length >= 1 && conds.every((c) => c === 'characteristics'),
   `FCCharSheet mounts only under the creator's characteristics step (${conds.join(', ')})`);
ok(wideAt.every((i) => enclosingFn(i) === 'FullCreator'), 'FCCharSheet mounts only inside FullCreator');
const offerFns = [...new Set(siteFns(/\.speciesBuyoutOffers\(/))];
ok(eq(offerFns, ['fcBuyoutSpeciesCount', 'FullCreator']), `only the creator asks for the offers (${offerFns.join(', ')})`);
for (const f of ['gm/app.jsx', 'lib/store/view.jsx', 'lib/modify/view.jsx']) {
  const p2 = path.join(REPO, f);
  const src = fs.existsSync(p2) ? fs.readFileSync(p2, 'utf8') : '';
  ok(!/speciesBuyoutOffers|data-buyout-block|FCbBuyOff/.test(src), `no offer in ${f}`);
}
const creationWindow = carriers.filter((c) => {
  const rec = SPECIES[c.id];
  const all = (rec.special_abilities || []).concat(
    ...(rec.option_choices || []).map((oc) => [].concat(...(oc.options || []).map((o) => o.special_abilities || []))));
  const a = all.find((x) => x.name === c.name);
  return (a.buyout_window || 'creation') === 'creation';
});
ok(creationWindow.length === 34,
   `R-CBC-4: 34 carriers are creation-only; the one window="any" offer is a deferred lap (got ${creationWindow.length})`);

// ── MUTANT 1 — keyed to the ability NAME "Primitive" ────────────────────────────────────────
// The naive shape, exactly as R-SFC-1 described it and R-CBC-4 re-scored it: find the top-level
// ability called "Primitive". Two independent blind spots in five lines — the NAME (three other
// abilities carry the same offer) and the LEVEL (Kamarian's carrier lives on a subspecies option) —
// which is why the count of what it misses is 4, not 2.
function mutantNameKeyed(rec) {
  return (rec.special_abilities || [])
    .filter((a) => a.name === 'Primitive')
    .map(() => ({ slug: 'primitive', xp: 10 }));
}
const missed = [
  ['csg_krish', undefined], ['csg_roonan', undefined], ['csg_toong', undefined],
  ['csg_kamarian', { [GID]: 'badlander' }],
].filter(([id, picks]) => CR.speciesBuyoutOffers(SPECIES[id], picks).length > mutantNameKeyed(SPECIES[id]).length);
ok(missed.length === 4,
   'MUTATION: a name-keyed implementation misses FOUR records — Krish, Roonan, Toong and '
   + `Kamarian/Badlander (it missed ${missed.length})`);

// ── MUTANT 2 — the price hard-coded to 10 ───────────────────────────────────────────────────
const hardCoded = carriers.filter((c) => c.xp !== 10);
ok(hardCoded.length === 2,
   `MUTATION: a hard-coded 10 is wrong for TWO shipped records (${hardCoded.map((c) => c.id).join(', ')})`);
const roonanSheet = CR.normalizeCreated(
  creatorCharacter({ species: { name: 'Roonan', key: 'csg_roonan' }, creationBuyouts: { small_comforts: { xp: 5 } } }),
  SPECIES.csg_roonan, null, GAMEDATA, 'test', DEPS);
const roonanPlain = CR.normalizeCreated(
  creatorCharacter({ species: { name: 'Roonan', key: 'csg_roonan' } }), SPECIES.csg_roonan, null, GAMEDATA, 'test', DEPS);
ok(roonanPlain.xp.remaining - roonanSheet.xp.remaining === 5,
   `MUTATION TARGET: Roonan's buyout deducts 5, not 10 (deducted ${roonanPlain.xp.remaining - roonanSheet.xp.remaining})`);

console.log(`\ncreation buyout guard: ${fail ? `${fail} FAIL` : 'ALL PASS'} (${pass} pass, ${fail} fail)`);
process.exit(fail ? 1 : 0);
