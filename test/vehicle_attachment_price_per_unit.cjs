#!/usr/bin/env node
'use strict';
/*
 * vehicle_attachment_price_per_unit.cjs — SHIP YARD S5 · B-1025: ruling `shipyard-s5-ready` R-S5R-3/4, ADDENDUM 5 (D-45)
 * and ADDENDUM 6 (R-S5R-16). Sibling of vehicle_attachment_price_per_silhouette.cjs (R-S4WB-6).
 *
 * Two parts are priced per unit of the ship they go on:
 *   Luxury Passenger Compartments — "2,000 credits times the vehicle's passenger capacity" (Desperate Allies p.65),
 *     OggDude <PricePassMult>true → `price_per_passenger: true`, price 2000.
 *   Laser Focusing Array — "3,000 credits per laser weapon enhanced" (Special Modifications p.66; Table 2-11 p.67 prints
 *     5,000, Jason picks p.66: DECISIONS D-45), OggDude <PriceWeponCatMult>Laser → `price_per_laser_weapon: true`, 3000.
 * The ONE read is lib/shared/vesselView.jsx `listPrice(row, hull, ship)`: the ship's RESOLVED passengers / Laser-category
 * weapons WITHOUT the part being priced, or the hull row where there is no ship. A weapon is a laser only when the
 * categories vocabulary reads exactly "Laser" (null is not). 0, null or nothing to read → no price, no sale (R-S5R-4).
 * The categories ride the parts list's one load (`loadAttachments`), exercised here through a fetch that reads the disk.
 *
 * Every expected number is the registry's row × a number READ from the hull row (or a stated synthetic), never the module's.
 * Run: node test/vehicle_attachment_price_per_unit.cjs     (needs the BUILT lib/shared/vesselView.js: npm run build)
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); },
    clear: () => m.clear(), key: (i) => Array.from(m.keys())[i] || null, get length() { return m.size; } };
}
global.window = globalThis.window || {};
global.React = {
  createElement: function () { return null; }, Fragment: 'fragment',
  useState: function (v) { return [typeof v === 'function' ? v() : v, function () {}]; },
  useEffect: function () {}, useRef: function () { return { current: null }; },
  useMemo: function (f) { return f(); }, useCallback: function (f) { return f; },
  useSyncExternalStore: function (_s, g) { return g(); },
};
global.window.React = global.React;
global.window.addEventListener = function () {};
global.window.removeEventListener = function () {};
Object.defineProperty(globalThis, 'localStorage', { value: memStorage(), configurable: true, writable: true });
global.window.localStorage = globalThis.localStorage;
let MISSING = null;   // a path the fetch answers 404 for (the failure leg)
global.fetch = function (p) {
  const f = path.join(ROOT, String(p).replace(/^\//, ''));
  if (p === MISSING || !fs.existsSync(f)) return Promise.resolve({ ok: false, status: 404, json: () => Promise.reject(new Error('404')) });
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(fs.readFileSync(f, 'utf8'))) });
};
require(path.join(ROOT, 'lib/shared/vesselResolve.js'));
require(path.join(ROOT, 'lib/shared/vesselStore.js'));
const VS = global.window.SWRPGVessels;
require(path.join(ROOT, 'lib/shared/vesselView.js'));
const VV = global.window.SWRPGVesselView;

let failures = 0, passes = 0;
function check(label, cond, detail) {
  if (cond) { passes += 1; console.log('  PASS  ' + label); }
  else { failures += 1; console.error('  FAIL  ' + label + (detail !== undefined ? '  — ' + JSON.stringify(detail) : '')); }
}
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const ATT = read('public/data/canonical/vehicle-attachments.json').vehicle_attachments;
const WPN = read('public/data/canonical/vehicle-weapons.json').vehicle_weapons;
const CAT = read('public/data/canonical/vehicle_weapon_categories.vocab.json').categories;
const HULLS = {};
fs.readdirSync(path.join(ROOT, 'public/data/vehicle-library')).filter((f) => f.endsWith('.json') && f !== 'index.json' && f !== 'taxonomy.json')
  .forEach((f) => (read('public/data/vehicle-library/' + f).entries || []).forEach((e) => { HULLS[e.key] = e; }));
const lasers = (h) => (h.weapons || []).reduce((n, w) => n + (CAT[w.key] === 'Laser' ? (typeof w.count === 'number' ? w.count : 1) : 0), 0);
const LPC = 'luxury_passenger_compartments', LFA = 'laser_focusing_array';

(async function main() {
  // ── the registry: exactly the two, at their printed bases, with the cites ──
  const pp = Object.keys(ATT).filter((k) => 'price_per_passenger' in ATT[k]);
  const pl = Object.keys(ATT).filter((k) => 'price_per_laser_weapon' in ATT[k]);
  check('registry: price_per_passenger on exactly Luxury Passenger Compartments (LUXPASSCOMP), base 2,000, cite Desperate Allies p.65',
    JSON.stringify(pp) === JSON.stringify([LPC]) && ATT[LPC]._source_key === 'LUXPASSCOMP' && ATT[LPC].price_per_passenger === true
    && ATT[LPC].price === 2000 && /desperate_allies p\.65/.test(ATT[LPC].cite || ''), { pp, cite: ATT[LPC] && ATT[LPC].cite });
  check('registry: price_per_laser_weapon on exactly Laser Focusing Array (LASFOCUS), base 3,000 (D-45)',
    JSON.stringify(pl) === JSON.stringify([LFA]) && ATT[LFA]._source_key === 'LASFOCUS' && ATT[LFA].price_per_laser_weapon === true && ATT[LFA].price === 3000, pl);
  check('ADDENDUM 5: the Laser Focusing Array\'s cite names p.66 for the price, and D-45 for Table 2-11 p.67\'s 5,000',
    /special_modifications p\.66/.test(ATT[LFA].cite || '') && /p\.67/.test(ATT[LFA].cite || '') && /5,000/.test(ATT[LFA].cite || '') && /D-45/.test(ATT[LFA].cite || ''), ATT[LFA].cite);
  check('registry: no row carries two price_per_* flags',
    Object.keys(ATT).every((k) => ['price_per_silhouette', 'price_per_passenger', 'price_per_laser_weapon'].filter((f) => ATT[k][f]).length <= 1));

  // ── the load: the categories ride the parts list; a missing categories file is WB5's failure, not an empty list ──
  MISSING = 'public/data/canonical/vehicle_weapon_categories.vocab.json';
  const bad = await new Promise((res) => VV.loadAttachments((l, b, e) => res({ l, b, e })));
  check('load: with the categories file missing, the parts list FAILS (an error text, no parts) — never priced without it',
    !!bad.e && Object.keys(bad.b).length === 0, bad.e);
  check('load: …and a per-laser part then has no price (nothing loaded to count with)', VV.listPrice(ATT[LFA], HULLS.YT1300) === null);
  MISSING = null;
  const ok = await new Promise((res) => VV.loadAttachments((l, b, e) => res({ l, b, e })));
  check('load: both files present → the parts list loads (121 rows, no error)', !ok.e && Object.keys(ok.b).length === Object.keys(ATT).length, ok.e);

  // ── the hull row (no ship: the catalogue) ──
  const YT = HULLS.YT1300, XW = HULLS.T65BXWING, A6 = HULLS.ACTIONVI, NT = HULLS.NUTRANS;
  check('fixtures: YT-1300 (6 passengers, 2 lasers) · X-wing (0 passengers, lasers) · Action VI (passengers, 0 lasers) · Nu-class (passengers null)',
    YT.passengers === 6 && lasers(YT) === 2 && XW.passengers === 0 && lasers(XW) > 0 && A6.passengers > 0 && lasers(A6) === 0 && NT.passengers == null,
    { yt: [YT.passengers, lasers(YT)], xw: [XW.passengers, lasers(XW)], a6: [A6.passengers, lasers(A6)], nt: NT.passengers });
  check('hull row: the YT-1300 prices Luxury Passenger Compartments at 2,000 × 6 = 12,000 and the Laser Focusing Array at 3,000 × 2 = 6,000 (the brief\'s measure)',
    VV.listPrice(ATT[LPC], YT) === 12000 && VV.listPrice(ATT[LFA], YT) === 6000, [VV.listPrice(ATT[LPC], YT), VV.listPrice(ATT[LFA], YT)]);
  check('hull row: the X-wing\'s lasers counted by their count (3,000 × ' + lasers(XW) + ')', VV.listPrice(ATT[LFA], XW) === 3000 * lasers(XW), VV.listPrice(ATT[LFA], XW));
  check('hull row: the Action VI\'s passengers (2,000 × ' + A6.passengers + ')', VV.listPrice(ATT[LPC], A6) === 2000 * A6.passengers);
  check('R-S5R-4 no price, no sale: 0 passengers (X-wing) · null passengers (Nu-class) · 0 lasers (Action VI) · no hull → null, and hullUnpriced says so',
    VV.listPrice(ATT[LPC], XW) === null && VV.listPrice(ATT[LPC], NT) === null && VV.listPrice(ATT[LFA], A6) === null && VV.listPrice(ATT[LPC], null) === null
    && VV.hullUnpriced(ATT[LPC], XW) && VV.hullUnpriced(ATT[LPC], NT) && VV.hullUnpriced(ATT[LFA], A6) && !VV.hullUnpriced(ATT[LPC], YT) && !VV.hullUnpriced(ATT[LFA], YT));
  // re-pointed by name (R-R7-V1, card release-r7-bug-burndown ADDENDUM 2): ANTIPERSLASER and SUPERLASER are now Laser by their
  // printed names, so the null example is the two batteries whose printed names do not say laser; the claim is unchanged
  check('R-S5R-16: a null category is NOT a laser — DF11BATTERY ×2 and FD14BATTERY alone price nothing; beside one LASERLT ×2 they add nothing (6,000)',
    CAT.DF11BATTERY === null && CAT.FD14BATTERY === null
    && VV.listPrice(ATT[LFA], { weapons: [{ key: 'DF11BATTERY', count: 2 }, { key: 'FD14BATTERY', count: 1 }] }) === null
    && VV.listPrice(ATT[LFA], { weapons: [{ key: 'LASERLT', count: 2 }, { key: 'DF11BATTERY', count: 2 }] }) === 6000);
  check('B-1080 · R-R7-V1: ANTIPERSLASER and SUPERLASER are Laser by their printed names, so they price per laser (3,000 × 3)',
    CAT.ANTIPERSLASER === 'Laser' && CAT.SUPERLASER === 'Laser'
    && VV.listPrice(ATT[LFA], { weapons: [{ key: 'ANTIPERSLASER', count: 2 }, { key: 'SUPERLASER', count: 1 }] }) === 9000);
  check('a flat part and a per-silhouette part are unchanged by the third argument',
    Object.keys(ATT).filter((k) => typeof ATT[k].price === 'number' && !ATT[k].price_per_passenger && !ATT[k].price_per_laser_weapon)
      .every((k) => VV.listPrice(ATT[k], YT, { rec: VS.normalizeVessel({ vehicleKey: 'YT1300' }), ctx: { attachments: ATT, weapons: WPN } }) === VV.listPrice(ATT[k], YT)));

  // ── the ship: resolved, WITHOUT the part being priced ──
  const ADDS = 'test_adds_four_passengers';   // a synthetic part that adds 4 passengers (op passengers_delta, the resolver's own)
  const ATT2 = Object.assign({}, ATT, { [ADDS]: { id: ADDS, name: 'Adds Four', hp: 1, price: 1000, base_effects: [{ op: 'passengers_delta', amount: 4 }], base_mods: [{ key: 'X' }] } });
  const LPC_ADDS = Object.assign({}, ATT[LPC], { base_effects: [{ op: 'passengers_delta', amount: 4 }], base_mods: [{ key: 'X' }] });
  const ATT3 = Object.assign({}, ATT, { [LPC]: LPC_ADDS });
  const shipWith = (keys, att) => ({ rec: VS.normalizeVessel({ vehicleKey: 'YT1300', attachments: keys.map((k) => ({ key: k, mods: [] })) }), ctx: { attachments: att, weapons: WPN } });
  const r2 = global.window.SWRPGVesselResolve.resolve(shipWith([ADDS], ATT2).rec, YT, { attachments: ATT2, weapons: WPN });
  check('fixture: the synthetic part moves the resolved passengers 6 → 10', r2 && r2.passengers === 10, r2 && r2.passengers);
  check('ship: ANOTHER part that adds passengers counts (resolved, RAW "the vehicle\'s passenger capacity"): 2,000 × 10 = 20,000',
    VV.listPrice(ATT[LPC], YT, shipWith([ADDS], ATT2)) === 20000, VV.listPrice(ATT[LPC], YT, shipWith([ADDS], ATT2)));
  check('ship: the priced part\'s OWN passengers do not count (no self-reference): installed, it still prices 2,000 × 6 = 12,000',
    VV.listPrice(LPC_ADDS, YT, shipWith([LPC], ATT3)) === 12000, VV.listPrice(LPC_ADDS, YT, shipWith([LPC], ATT3)));
  check('ship: a YT-1300 with the Laser Focusing Array installed still prices it on its 2 lasers (6,000)', VV.listPrice(ATT[LFA], YT, shipWith([LFA], ATT)) === 6000);
  check('ship: while the parts list is missing (ctx.attachments null) and another part is aboard, the passengers are HELD → no price',
    VV.listPrice(ATT[LPC], YT, { rec: shipWith([ADDS], ATT2).rec, ctx: { attachments: null, weapons: WPN } }) === null);

  // ── the counter: its line priced on its ship as FIT prices it; no price → refused ──
  const st = { v: 3, vessels: [VS.normalizeVessel({ id: 'v1', vehicleKey: 'YT1300', owner: 'party' }, '2026-10-04'), VS.normalizeVessel({ id: 'v2', vehicleKey: 'T65BXWING', owner: 'party' }, '2026-10-04')] };
  globalThis.localStorage.setItem(VS.VESSELS_KEY, JSON.stringify(st));
  if (VS.refresh) VS.refresh();
  const seam = VV.counterSeam({ k9: true, getVehicle: (k) => HULLS[k] || null, attachments: ATT, weapons: WPN, now: () => '2026-10-04' });
  const PL = seam.plan([
    { id: 'vpart:' + LPC, qty: 1, for: { vessel: 'v1', then: 'hold' } },
    { id: 'vpart:' + LFA, qty: 1, for: { vessel: 'v1', then: 'fit' } },
    { id: 'vpart:' + LPC, qty: 1, for: { vessel: 'v2', then: 'hold' } },
  ]).lines;
  check('counter: on the YT-1300 the compartments cost 12,000 and the array 6,000, both deliverable',
    PL[0].ok === true && PL[0].price === 12000 && PL[1].ok === true && PL[1].price === 6000, PL.map((l) => [l.ok, l.why, l.price]));
  check('counter: the compartments on the X-wing (0 passengers) are refused (not_in_the_book) and priced nothing — no sale at 0 CR',
    PL[2].ok === false && PL[2].why === 'not_in_the_book' && PL[2].price === null, [PL[2].ok, PL[2].why, PL[2].price]);

  console.log('\nvehicle_attachment_price_per_unit: ' + passes + '/' + (passes + failures) + ' PASS' + (failures ? '  (' + failures + ' FAILED)' : ''));
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('CRASH', e && e.stack || e); process.exit(2); });
