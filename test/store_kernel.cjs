#!/usr/bin/env node
/**
 * store_kernel.cjs — STANDING guard for the ITM-V1 store kernel (lib/store/view.jsx).
 *
 * Proves the RAW constants + the finalize math on hand-anchored inputs:
 *   1. Table 5-1 rarity→difficulty bands (EotE CRB p.150) — every rarity 0-10 maps to the
 *      verified ladder; null/absent rarity maps to NO band (the R-ITM5 explicit fallback).
 *   2. Sell-back tiers are exactly ¼/½/¾ (EotE CRB p.150).
 *   3. buildNextEquipment — the ONE finalize write: weapons append id-refs ×qty; gear merges
 *      qty into an existing entry; ARMOUR IS WRITTEN LIKE GEAR and `equipment.armor` is never
 *      touched (B-686 · R-SPC-8, `store-paper-concept` §8 Amendment 1, Jason 2026-09-18 "Append";
 *      the entry is the SPARE SUIT of R-ASS-1 `armor-save-shape`, which the sheet's PACK lists under
 *      PROTECTION with WEAR — RAW own-many/wear-one, EotE p.168 / p.207). Before B-686 this branch
 *      set `equipment.armor` and the assertion here read "armor replaces the single slot"; credits
 *      debit by the EDITED price and may go NEGATIVE (warn-never-block, R-ITM1); the input equipment
 *      object is not mutated (§8 — the persisted record is built fresh, never patched in place).
 *      AMENDED AGAIN by B-692 · R-SPC-9 (`store-paper-concept` §9 Amendment 2, Jason 2026-09-18: "If
 *      the character is wearing nothing, wear it. If not, pack it."): an EMPTY worn slot takes the
 *      FIRST armour unit on the slip, in slip order, marked `state: 'worn'` (the shape the sheet's own
 *      WEAR act writes and `deriveItemState` reads); every other unit packs per R-SPC-8; a worn suit
 *      is NEVER replaced. §3d holds the amendment's own cases, and the write now returns the summary
 *      the DONE note is derived from (`armor: {worn, packed, wasWorn}`).
 *      AND B-687 (§3e): a line the CATALOG cannot resolve is not written, not charged, and reported
 *      back (`skipped: {ids, count}`) — never the dangling id-ref the gear fall-through used to write.
 *      The catalog is a THIRD ARGUMENT, so a call without one judges nothing and behaves as it always
 *      did; §3e builds the catalog out of `public/data/canonical/*.json` the way `buildCatalog` does.
 *   4. glyphFamily — form classification spot checks (name decides what the glyph depicts).
 *
 * Run:  node test/store_kernel.cjs
 */

// The module is a browser classic script — stub the globals it touches at load.
global.window = {};
global.React = {
  createElement: function () { return null; },
  Fragment: 'fragment',
  useState: function (v) { return [typeof v === 'function' ? v() : v, function () {}]; },
  useEffect: function () {}, useRef: function () { return { current: null }; },
  useMemo: function (f) { return f(); }, useCallback: function (f) { return f; },
};
require('../lib/store/glyphs.js');   // THE item glyph library — view.js delegates glyphFamily/glyph to it
require('../lib/store/rarity.js');   // must precede view.js — it consumes window.SWRPGRarity (ITM-B)
require('../lib/store/view.js');
const S = global.window.SWRPGStore;

let failures = 0;
function check(label, cond) {
  if (cond) { console.log('  PASS  ' + label); }
  else { failures += 1; console.error('  FAIL  ' + label); }
}

// ── 1. Table 5-1 bands (verified against the table's own example items in our registries:
//       Glow Rod 0 + Long-range Comlink 1 → Simple · Medpac 2 + Scanner Goggles 3 → Easy ·
//       Blaster Pistol 4 + Blaster Rifle 5 → Average · Bowcaster 7 → Hard ·
//       Thermal Detonator 8 + Personal Stealth Field 9 → Daunting) ──
const LADDER = [
  [0, 'SIMPLE', 0], [1, 'SIMPLE', 0], [2, 'EASY', 1], [3, 'EASY', 1],
  [4, 'AVERAGE', 2], [5, 'AVERAGE', 2], [6, 'HARD', 3], [7, 'HARD', 3],
  [8, 'DAUNTING', 4], [9, 'DAUNTING', 4], [10, 'FORMIDABLE', 5],
];
LADDER.forEach(function ([r, label, dice]) {
  const b = S.rarityBand(r);
  check('rarity ' + r + ' → ' + label + ' (' + dice + ' dice)', b && b.label === label && b.dice === dice);
});
check('rarity null → NO band (R-ITM5 fallback, never undefined text)', S.rarityBand(null) === null);
check('rarity "seven" → NO band', S.rarityBand('seven') === null);

// ── 2. Sell tiers ──
check('sell tiers are ¼/½/¾ of list', JSON.stringify(S.SELL_TIERS.map(t => t.frac)) === '[0.25,0.5,0.75]');

// ── 3. buildNextEquipment ──
const eq0 = { weapons: [{ id: 'vibrosword' }], armor: { id: 'heavy_clothing' }, gear: [{ id: 'medpac', qty: 2 }], credits: 1000 };
const cart = [
  { itemId: 'blaster_pistol', section: 'weapons', qty: 2, priceEach: 350 },   // edited from list 400
  { itemId: 'padded_armor', section: 'armor', qty: 1, priceEach: 500 },
  { itemId: 'medpac', section: 'gear', qty: 3, priceEach: 100 },
];
const out = S.buildNextEquipment(eq0, cart);
check('total = Σ edited price × qty (350×2 + 500 + 100×3 = 1500)', out.total === 1500);
check('credits debited once (1000 − 1500 = −500, may go negative — R-ITM1)', out.next.credits === -500);
check('weapons append one id-ref per unit (1 + 2 = 3)', out.next.weapons.length === 3
  && out.next.weapons[1].id === 'blaster_pistol' && out.next.weapons[2].id === 'blaster_pistol');
// B-686 re-point: the pack now holds TWO entries — the merged medpac stack and the bought suit — so
// the merge is asserted on the medpac ENTRY rather than on the list's length (the old assertion read
// `gear.length === 1`, which was a true statement about a write that appended nothing else).
const medpac5 = out.next.gear.find(g => g.id === 'medpac');
check('gear qty MERGES into the existing entry (2 + 3 = 5, one line)',
  medpac5 && medpac5.qty === 5
  && out.next.gear.filter(g => g.id === 'medpac').length === 1);
// B-686 · R-SPC-8 — WAS: 'armor replaces the single slot' (`out.next.armor.id === 'padded_armor'`).
// The suit is an inventory entry now and the worn slot is the store's to read, never to write.
const spare = out.next.gear.find(g => g.id === 'padded_armor');
check('R-SPC-8: an armour line APPENDS to the pack as a spare suit entry (id-ref + qty)',
  !!spare && spare.qty === 1);
check('R-SPC-8: and `equipment.armor` is UNTOUCHED — the worn suit is still Heavy Clothing',
  out.next.armor && out.next.armor.id === 'heavy_clothing');
check('item count = 6', out.count === 6);
check('input equipment NOT mutated', eq0.credits === 1000 && eq0.weapons.length === 1
  && eq0.gear[0].qty === 2 && eq0.armor.id === 'heavy_clothing');

const out2 = S.buildNextEquipment(undefined, [{ itemId: 'medpac', section: 'gear', qty: 1, priceEach: 100 }]);
check('empty equipment: gear appends, credits go 0 − 100 = −100', out2.next.gear.length === 1 && out2.next.credits === -100);

// ── 3a. R-SPC-3 (B-666) — a counter line carries the SECTION-QUALIFIED catalog key; an id-ref on a
//        sheet is the BARE registry id. The conversion happens once, inside buildNextEquipment, and it
//        is idempotent: the bare lines above (written before this row) still produce bare id-refs.
const outQ = S.buildNextEquipment(
  { weapons: [], armor: null, gear: [{ id: 'medpac', qty: 1 }], credits: 500 },
  [{ itemId: 'weapons:thermal_cutter', section: 'weapons', qty: 1, priceEach: 125 },
   { itemId: 'armor:padded_armor', section: 'armor', qty: 1, priceEach: 500 },
   { itemId: 'gear:medpac', section: 'gear', qty: 2, priceEach: 100 }]);
check('R-SPC-3: a qualified weapon line writes a BARE id-ref to the sheet',
  outQ.next.weapons.length === 1 && outQ.next.weapons[0].id === 'thermal_cutter');
// B-686 re-point: the bare id-ref claim is unchanged; where it LANDS moved from `armor` to `gear`.
// B-692 re-point (R-SPC-9, `store-paper-concept` §9 Amendment 2; Jason 2026-09-18: "If the character is
// wearing nothing, wear it. If not, pack it."): THIS FIXTURE WEARS NOTHING (`armor: null`), so the one
// suit on the slip now lands on the WORN SLOT, not in the pack. The bare-id-ref claim — the only thing
// this leg is about — is unchanged and is now read off `armor`. B-686's pack landing is still asserted,
// on the fixture it belongs to: `out` above wears Heavy Clothing.
// WAS: `outQ.next.gear.some(g => g.id === 'padded_armor') && outQ.next.armor === null`.
check('R-SPC-3: a qualified armor line writes a BARE id-ref (B-692 · R-SPC-9: with nothing worn it '
  + 'lands on `equipment.armor` as the worn suit, and it is marked `state: "worn"` so the sheet reads it)',
  outQ.next.armor && outQ.next.armor.id === 'padded_armor' && outQ.next.armor.state === 'worn'
  && !outQ.next.gear.some(g => g.id === 'padded_armor'));
check('R-SPC-3: a qualified gear line MERGES onto the bare stack already on the sheet (1 + 2 = 3, one line)',
  outQ.next.gear.filter(g => g.id === 'medpac').length === 1
  && outQ.next.gear.find(g => g.id === 'medpac').qty === 3);
check('R-SPC-3: the arithmetic is untouched by the conversion (125 + 500 + 200 = 825)', outQ.total === 825);

// ── 3b. PROV-1 acquire stamp — each NEWLY acquired item gets a per-item "purchased — N cr" entry
//        (plain YYYY-MM-DD date). id-refs only. Bumping an existing gear stack adds NO note.
const isStamp = (p, price) => Array.isArray(p) && p.length === 1 && p[0].note === 'purchased — ' + price + ' cr' && /^\d{4}-\d{2}-\d{2}$/.test(p[0].when);
check('PROV-1: bought weapons carry the acquire stamp with per-item price', out.next.weapons[1].provenance && isStamp(out.next.weapons[1].provenance, 350) && isStamp(out.next.weapons[2].provenance, 350));
// B-686 re-point: the stamp is read off the PACK ENTRY the suit is now written as.
check('PROV-1: bought armor carries the acquire stamp with per-item price', isStamp(spare.provenance, 500));
check('PROV-1: a NEW gear entry is stamped with per-item price', isStamp(out2.next.gear[0].provenance, 100));
check('PROV-1: bumping an EXISTING gear stack adds no note (kept the pre-owned entry as-is)',
  out.next.gear[0].id === 'medpac' && out.next.gear[0].provenance === undefined);
check('PROV-1: pre-owned weapon (not bought this trip) is untouched — no stamp', out.next.weapons[0].provenance === undefined);

// ── 3c. B-686 · R-SPC-8 — the ARMOUR APPEND, the two cases the shipped write could not reach ──────
//        (a) two suits on ONE line: the entry carries qty 2, the gear rule unchanged;
//        (b) a suit ALREADY in the pack: the stack bumps and adds no second entry and no new note.
const outA = S.buildNextEquipment(
  { weapons: [], armor: { id: 'heavy_clothing' }, gear: [], credits: 4000 },
  [{ itemId: 'armor:padded_armor', section: 'armor', qty: 2, priceEach: 500 }]);
check('R-SPC-8 (a): two suits on one line are ONE pack entry at qty 2',
  outA.next.gear.length === 1 && outA.next.gear[0].id === 'padded_armor' && outA.next.gear[0].qty === 2);
check('R-SPC-8 (a): both are charged (500 × 2 = 1000) and the worn suit is still Heavy Clothing',
  outA.total === 1000 && outA.count === 2 && outA.next.credits === 3000
  && outA.next.armor.id === 'heavy_clothing');
// B-692 re-point (R-SPC-9): THIS FIXTURE WEARS NOTHING, so the bought suit goes ON rather than onto the
// stack — which is a second, sharper claim about the same write: the one-default clause reads the WORN
// SLOT and not the pack, so a spare already owned does not make a character "already wearing" one.
// WAS: `outB.next.gear.length === 1 && outB.next.gear[0].qty === 2` (the bump). The bump claim is NOT
// dropped — it moves to `outB2` below, onto the fixture R-SPC-8 governs (a suit already worn).
const outB = S.buildNextEquipment(
  { weapons: [], armor: null, gear: [{ id: 'padded_armor', qty: 1, provenance: [{ note: 'found it', when: '2026-01-01' }] }], credits: 1000 },
  [{ itemId: 'armor:padded_armor', section: 'armor', qty: 1, priceEach: 500 }]);
check('R-SPC-9 (b): a SPARE already in the pack is not a suit WORN — nothing is on, so the bought suit '
  + 'goes on the body and the pre-owned stack is left exactly as it was, story included',
  outB.next.armor && outB.next.armor.id === 'padded_armor' && outB.next.armor.state === 'worn'
  && outB.next.gear.length === 1 && (outB.next.gear[0].qty || 1) === 1
  && outB.next.gear[0].provenance.length === 1 && outB.next.gear[0].provenance[0].note === 'found it');
// B-686's own claim, on the fixture it belongs to: a suit already WORN, a matching spare already in the
// pack, one more bought → the stack bumps, no second entry, no new note (R-SPC-8 unchanged by R-SPC-9).
const outB2 = S.buildNextEquipment(
  { weapons: [], armor: { id: 'heavy_clothing', state: 'worn' }, gear: [{ id: 'padded_armor', qty: 1, provenance: [{ note: 'found it', when: '2026-01-01' }] }], credits: 1000 },
  [{ itemId: 'armor:padded_armor', section: 'armor', qty: 1, priceEach: 500 }]);
check('R-SPC-8 (b): a suit already in the pack BUMPS THE STACK (1 + 1 = 2, one entry) and keeps its own story',
  outB2.next.gear.length === 1 && outB2.next.gear[0].qty === 2
  && outB2.next.gear[0].provenance.length === 1 && outB2.next.gear[0].provenance[0].note === 'found it'
  && outB2.next.armor.id === 'heavy_clothing');

// ── 3d. B-692 · R-SPC-9 — THE ONE-DEFAULT CLAUSE, the three cases the amendment names ─────────────
//        (a) nothing worn + ONE suit  → the worn slot, stamped, nothing in the pack;
//        (b) nothing worn + TWO units on one line → ONE worn, the rest packed (the ruling's own split);
//        (c) nothing worn + TWO armour LINES → the FIRST in slip order is worn, the second packed;
//        and the summary the DONE note is derived from (`worn` · `packed` · `wasWorn`) in each case.
const eqBare = { weapons: [], armor: null, gear: [], credits: 1000 };
const outW1 = S.buildNextEquipment(eqBare,
  [{ itemId: 'armor:padded_armor', section: 'armor', qty: 1, priceEach: 500 }]);
check('R-SPC-9 (a): nothing worn + one suit → the WORN SLOT, with the acquire stamp and no pack entry',
  outW1.next.armor && outW1.next.armor.id === 'padded_armor' && outW1.next.armor.state === 'worn'
  && isStamp(outW1.next.armor.provenance, 500) && outW1.next.gear.length === 0
  && outW1.next.credits === 500);
check('R-SPC-9 (a): and the write reports what it did — worn 1 · packed 0 · wasWorn false',
  outW1.armor.worn === 1 && outW1.armor.packed === 0 && outW1.armor.wasWorn === false);
const outW2 = S.buildNextEquipment(
  { weapons: [], armor: null, gear: [], credits: 4000 },
  [{ itemId: 'armor:padded_armor', section: 'armor', qty: 2, priceEach: 500 }]);
check('R-SPC-9 (b): nothing worn + TWO units on ONE line → one on the body, one in the pack at qty 1',
  outW2.next.armor.id === 'padded_armor' && outW2.next.armor.state === 'worn'
  && outW2.next.gear.length === 1 && outW2.next.gear[0].id === 'padded_armor'
  && outW2.next.gear[0].qty === 1);
check('R-SPC-9 (b): BOTH units are charged (500 × 2 = 1000, count 2) — the body is not a discount',
  outW2.total === 1000 && outW2.count === 2 && outW2.next.credits === 3000
  && outW2.armor.worn === 1 && outW2.armor.packed === 1);
const outW3 = S.buildNextEquipment(
  { weapons: [], armor: null, gear: [], credits: 4000 },
  [{ itemId: 'armor:padded_armor', section: 'armor', qty: 1, priceEach: 500 },
   { itemId: 'armor:heavy_clothing', section: 'armor', qty: 1, priceEach: 50 }]);
check('R-SPC-9 (c): two armour LINES → the FIRST IN SLIP ORDER is worn and the second is packed',
  outW3.next.armor.id === 'padded_armor' && outW3.next.armor.state === 'worn'
  && outW3.next.gear.length === 1 && outW3.next.gear[0].id === 'heavy_clothing'
  && outW3.armor.worn === 1 && outW3.armor.packed === 1);
// AND THE STORE NEVER REPLACES: the same slip against a character who HAS something on writes both
// suits to the pack and leaves the worn id alone (R-SPC-8's whole claim, re-asserted beside R-SPC-9's).
const outW4 = S.buildNextEquipment(
  { weapons: [], armor: { id: 'a_kt_mountaineer_armor', state: 'worn' }, gear: [], credits: 4000 },
  [{ itemId: 'armor:padded_armor', section: 'armor', qty: 1, priceEach: 500 },
   { itemId: 'armor:heavy_clothing', section: 'armor', qty: 1, priceEach: 50 }]);
check('R-SPC-9: something already ON → the store REPLACES NOTHING; both suits go to the pack and the '
  + 'worn id is untouched (R-SPC-8 unchanged), and the summary says wasWorn true · worn 0 · packed 2',
  outW4.next.armor.id === 'a_kt_mountaineer_armor' && outW4.next.armor.state === 'worn'
  && outW4.next.gear.map(g => g.id).sort().join(',') === 'heavy_clothing,padded_armor'
  && outW4.armor.wasWorn === true && outW4.armor.worn === 0 && outW4.armor.packed === 2);
check('R-SPC-9: the input equipment is STILL not mutated when the worn slot is the target (§8 — the '
  + 'persisted record is built fresh; the caller\'s object keeps its empty slot and its credits)',
  eqBare.armor === null && eqBare.credits === 1000 && eqBare.gear.length === 0);

// ── 3e. B-687 — AN UNRESOLVABLE LINE IS NOT WRITTEN AND NOT CHARGED ──────────────────────────────
//        A counter line that matches no catalog record has no `section` either, so before this row it
//        fell through to the GEAR branch and wrote `{ id: '<the id nobody has>' }` onto the sheet — a
//        dangling id-ref (§8's id-ref law: nothing downstream can resolve it). Reachable only since
//        B-669 made the counter persist, because a line can outlive the registry entry it names.
//        THE CATALOG IS THE PREDICATE, exactly as the paper slip reads it (`lineRecord`), and it
//        arrives as the third argument — every leg above calls with two and is therefore unchanged.
//        EVERY NUMBER HERE IS READ FROM `public/data/canonical/*.json`; the only typed string is the
//        id that must match nothing, and its absence is PROVEN rather than assumed.
const fs = require('fs');
const path = require('path');
const CANON = path.join(__dirname, '..', 'public', 'data', 'canonical');
function registry(section) {
  return JSON.parse(fs.readFileSync(path.join(CANON, section + '.json'), 'utf8'))[section];
}
const REGS = { weapons: registry('weapons'), armor: registry('armor'), gear: registry('gear') };
// The catalog the store actually builds: addressed `<section>:<id>` (R-SPC-3) with `store_hidden`
// records excluded — `buildCatalog`'s one filter (R-B39-1).
const BY_ID = {};
['weapons', 'armor', 'gear'].forEach(function (s) {
  Object.keys(REGS[s]).forEach(function (id) {
    const rec = REGS[s][id];
    if (!rec || rec.store_hidden) return;
    BY_ID[s + ':' + id] = { key: s + ':' + id, section: s, regId: id, price: rec.price || 0 };
  });
});
const GONE = 'no_such_item_at_all';          // the id the smoke's own fixture uses
const BUY_W = 'blaster_pistol', BUY_G = 'medpac';
const PRICE_W = REGS.weapons[BUY_W].price || 0, PRICE_G = REGS.gear[BUY_G].price || 0;
check('B-687 (the premise, derived): "' + GONE + '" is in NO loaded registry and under no '
  + 'qualification of the catalog — weapons ' + Object.keys(REGS.weapons).length + ' · armor '
  + Object.keys(REGS.armor).length + ' · gear ' + Object.keys(REGS.gear).length + ' records read',
  !REGS.weapons[GONE] && !REGS.armor[GONE] && !REGS.gear[GONE]
  && !BY_ID[GONE] && !BY_ID['weapons:' + GONE] && !BY_ID['armor:' + GONE] && !BY_ID['gear:' + GONE]);
check('B-687 (the premise, derived): and the two writable ids ARE on the shelf, at the registry\'s '
  + 'own prices (' + BUY_W + ' ' + PRICE_W + ' cr · ' + BUY_G + ' ' + PRICE_G + ' cr)',
  !!BY_ID['weapons:' + BUY_W] && !!BY_ID['gear:' + BUY_G] && PRICE_W > 0 && PRICE_G > 0);

// (a) THE LINE ALONE — and it carries a HAND-WRITTEN PRICE, because that is the half the write could
//     still have charged for: `editPrice` marks any typed number on such a line `edited` (it has no
//     list price to compare against), so `priceEach` is the one field an unresolvable line can carry.
const eqU = { weapons: [], armor: null, gear: [], credits: 1000 };
const outU = S.buildNextEquipment(eqU, [{ itemId: GONE, qty: 1, priceEach: 400 }], BY_ID);
check('B-687 (a): an unresolvable line writes NOTHING — no gear entry, no weapon, no worn suit (the '
  + 'gear fall-through that produced `{id: "' + GONE + '"}` is gone)',
  outU.next.gear.length === 0 && outU.next.weapons.length === 0 && outU.next.armor === null
  && JSON.stringify(outU.next).indexOf(GONE) < 0);
check('B-687 (a): and it is CHARGED NOTHING — total 0, count 0, credits still 1,000 — the '
  + 'hand-written 400 cr on the tag does not buy an item that never reaches the sheet',
  outU.total === 0 && outU.count === 0 && outU.next.credits === 1000);
check('B-687 (a): and the write REPORTS it, by id and by count, the way B-692\'s armour summary '
  + 'rides back — the DONE note is derived from this and never recounts the slip',
  outU.skipped && outU.skipped.count === 1
  && JSON.stringify(outU.skipped.ids) === JSON.stringify([GONE]));
check('B-687 (a): the input equipment is still not mutated (§8)',
  eqU.credits === 1000 && eqU.gear.length === 0 && eqU.armor === null);

// (b) THE LINE BESIDE TWO WRITABLE ONES — the deal goes through for the two and only for the two.
const WQTY = 2, GQTY = 3;
const SPEND = PRICE_W * WQTY + PRICE_G * GQTY;
const eqM = { weapons: [], armor: null, gear: [], credits: 9000 };
const outM = S.buildNextEquipment(eqM, [
  { itemId: 'weapons:' + BUY_W, section: 'weapons', qty: WQTY, priceEach: PRICE_W },
  { itemId: GONE, qty: 1, priceEach: 400 },
  { itemId: 'gear:' + BUY_G, section: 'gear', qty: GQTY, priceEach: PRICE_G },
], BY_ID);
check('B-687 (b): the two WRITABLE lines land in full — ' + WQTY + ' × ' + BUY_W + ' as bare id-refs '
  + 'and ' + BUY_G + ' at qty ' + GQTY,
  outM.next.weapons.map(w => w.id).join(',') === new Array(WQTY + 1).join(BUY_W + ',').slice(0, -1)
  && outM.next.gear.length === 1 && outM.next.gear[0].id === BUY_G && outM.next.gear[0].qty === GQTY);
check('B-687 (b): the charge is the WRITABLE lines only — ' + PRICE_W + '×' + WQTY + ' + ' + PRICE_G
  + '×' + GQTY + ' = ' + SPEND + ' cr, count ' + (WQTY + GQTY) + ', credits 9,000 − ' + SPEND + ' = '
  + (9000 - SPEND) + ' (the refused line\'s 400 cr is nowhere in it)',
  outM.total === SPEND && outM.count === WQTY + GQTY && outM.next.credits === 9000 - SPEND);
check('B-687 (b): and "' + GONE + '" is NOT in `next.gear` — nor anywhere else in the record — while '
  + 'the summary names it once',
  !outM.next.gear.some(g => g.id === GONE) && JSON.stringify(outM.next).indexOf(GONE) < 0
  && outM.skipped.count === 1 && outM.skipped.ids[0] === GONE);

// (c) THE CONTROL — THE SAME ID, THE SAME LINE, THE SAME FIXTURE, and the ONLY thing changed is that
//     the catalog HOLDS it. So these legs measure RESOLVABILITY and not the id's spelling: nothing in
//     the fix keys on what the id is called, and a line that resolves still lands and is still charged.
const BY_ID_PLUS = Object.assign({}, BY_ID);
BY_ID_PLUS['gear:' + GONE] = { key: 'gear:' + GONE, section: 'gear', regId: GONE, price: 400 };
const outC = S.buildNextEquipment({ weapons: [], armor: null, gear: [], credits: 1000 },
  [{ itemId: GONE, qty: 1, priceEach: 400 }], BY_ID_PLUS);
check('B-687 (c) THE CONTROL: the SAME id, resolvable, lands normally — one gear entry carrying the '
  + 'bare id-ref with its acquire stamp, charged 400 cr (1,000 − 400 = 600), and NOTHING skipped',
  outC.next.gear.length === 1 && outC.next.gear[0].id === GONE
  && isStamp(outC.next.gear[0].provenance, 400)
  && outC.total === 400 && outC.count === 1 && outC.next.credits === 600
  && outC.skipped.count === 0 && outC.skipped.ids.length === 0);
check('B-687 (c): and a call with NO catalog at all judges nothing — the 57 legs above pass two '
  + 'arguments and keep the write they always measured (the gear fall-through, unjudged)',
  (function () {
    const noCat = S.buildNextEquipment({ weapons: [], armor: null, gear: [], credits: 1000 },
      [{ itemId: GONE, qty: 1, priceEach: 400 }]);
    return noCat.next.gear.length === 1 && noCat.next.gear[0].id === GONE
      && noCat.total === 400 && noCat.skipped.count === 0;
  })());

// ── 4. glyph families (form classification, name over type) ──
[
  [{ section: 'weapons', name: 'Vibro-ax', type: 'Melee' }, 'ax'],
  [{ section: 'weapons', name: 'Lightwhip', type: 'Lightsaber' }, 'whip'],
  [{ section: 'weapons', name: 'Temple Guard Lightsaber Pike', type: 'Lightsaber' }, 'polearm'],
  [{ section: 'weapons', name: 'Shoto', type: 'Lightsaber' }, 'lightsaber'],
  [{ section: 'weapons', name: 'Heavy Blaster Pistol', type: 'Energy Weapon' }, 'pistol'],
  [{ section: 'weapons', name: 'Blaster Rifle', type: 'Energy Weapon' }, 'rifle'],
  [{ section: 'weapons', name: 'Thermal Detonator', type: 'Explosives/Other' }, 'grenade'],
  [{ section: 'armor', name: 'Laminate Armor' }, 'armor'],
  [{ section: 'gear', name: '3PX-Series Protocol Droid', type: 'Droids' }, 'protocol'],
  [{ section: 'gear', name: 'Cybernetic Arm', type: 'Cybernetics' }, 'limb'],
  [{ section: 'gear', name: 'Bantha', type: 'Riding Beasts' }, 'mount'],
  [{ section: 'gear', name: 'Sith Holocron', type: 'Holocrons/Ancient Lore' }, 'holocron'],
  [{ section: 'gear', name: 'Medpac', type: 'Medical' }, 'medpac'],
  [{ section: 'gear', name: 'Utility Belt', type: 'Carrying/Storage' }, 'belt'],
].forEach(function ([item, fam]) {
  check('glyph: ' + item.name + ' → ' + fam, S.glyphFamily(item) === fam);
});

if (failures) { console.error('\nstore_kernel: ' + failures + ' FAILED'); process.exit(1); }
console.log('\nstore_kernel: all green');
