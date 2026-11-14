/* test/shipyard_s8_convert.cjs — SHIP YARD S8, step 3c: THE CONVERSION (card `shipyard-s8-build` R-S8B-5 + ADDENDA 2, 4, 7; ruling
 * `shipyard-s8-census-card` R-S8C-10/-11/-12; `f100-s8-vocabulary` R-S8V-6). Dangerous Covenants p.71, the quick conversion templates.
 *
 *   C-1 the record   · `conversion: {key, arcs, note}` normalizes (vesselStore normalizeConversion), is optional, and keeps a
 *                      wrong-length or illegal `arcs` AS STORED (b1); a normalized converted ship normalizes to itself
 *   C-2 the data     · the eleven templates: kind 'conversion', cite "DC p.71", every one of their 54 lines MODELLED (the Yacht's
 *                      gun line two, ADDENDUM 2 Q2), `defense_picks` bulk 2 · shuttle 2 · light freighter / medium transport /
 *                      yacht 1 · the rest none, and the page's cells (D-218): the cloud car's hull −1, the shuttle's twin guns
 *                      forward Linked 1, the Yacht's 2 fore + 1 aft, G-1 AUTOBLAST, G-2 BLASTLTREP_VEH; a turret gun is the four plane
 *                      arcs and `turret` (ADDENDUM 15 H-3 (a), RE-POINTED from six arcs); no weapon_add effect carries `location`
 *                      (ADDENDUM 20 E-S8C-20, R-S8C-20a (i)), and the RESOLVED added turret rows read location null (20a (ii));
 *                      C-1 the landspeeder's
 *                      limit is "Landspeeder"; G-2's weapons row is never priced, offered, swapped in or sold (THE SHELF,
 *                      vesselStore `onTheShelf`: the swap, the counter and the K4 list read it)
 *   C-3 the resolve  · the YT-1300 + LIGHT FREIGHTER = the approved frames' numbers (lab s8_numbers.cjs @ ui-lab 1fddaae94: handling
 *                      −1 → −2 · armor 3 → 4 · hull 22 → 24 · strain 15 → 13 · +1 in the picked arc · 2 quad laser turrets, the
 *                      identifier still DORSAL 1 · VENTRAL 1 as drawn, ADDENDUM 15 H-3); a
 *                      part's weapon delta reaches the conversion's guns (R-S8C-11: added in the SET pass); "+1 in two arcs" is
 *                      two DIFFERENT arcs — ['fore','fore'] lands one +1 and leaves one PENDING (ADDENDUM 2 Q3); a missing or
 *                      illegal pick is PENDING; a template held as a PART (a legacy holder) moves no number (R-S8B-6); with the
 *                      parts list missing, HELD; an unknown template is ORPHANED
 *   C-4 who may take one · CONVERSION_ADMITS (ADDENDUM 7 H-6): every key a library row, every cite present, every template a
 *                      kind 'conversion' row; the measured cases (the YT-1300 admitted; the TIE/br and TIE/sh refused for type; the
 *                      Starwind admitted to the Yacht, not the Light Freighter); C-2's category evaluated (bare string and list);
 *                      the refusals has_parts (only a KIND-LESS part refuses: Combat Plating converts, R-S8FJ-2 corrected) ·
 *                      no_hard_points · type · category; resolveFit reads the same answer for a held template
 *                      · and with the parts list NOT in hand, 'held', never has_parts (ruling shipyard-s8-build-gate R-S8G-1)
 *   C-5 MAKE IT THIS SHIP'S CONVERSION · 6h (card ADDENDUM 21, H-8 (a); frames v3 L-before → L-after): vesselStore makeConversion is
 *                      ONE apply — the held template entry out, `conversion` {key, arcs: [], note: the entry's note}, no event, no
 *                      other member moved, the record read back; the legacy part moved nothing before, the conversion moves the
 *                      approved numbers after; legacyConversion's door: live on a ship whose only held entry is the template (no
 *                      has_parts against itself), live beside a kinded piece (v_iron), has_parts beside a kind-less part, absent
 *                      on a converted ship, on a non-template entry and with the parts list not in hand
 *
 * THE BITE: each MUTANT removes one arm in memory (the code, or the shipped data's text); the child run must exit 1 — read by EXIT CODE.
 * Run: node test/shipyard_s8_convert.cjs        (children: --mutant=<name>)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const J = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const MUT = (process.argv.find((a) => a.indexOf('--mutant=') === 0) || '').slice(9) || null;

const MUTANTS = {
  normalize: ['lib/shared/vesselStore.js', "opt(known, rec, 'conversion', normalizeConversion(rec.conversion));", ''],
  resolve: ['lib/shared/vesselResolve.js', 'if (!held && conv) (function () {', 'if (false) (function () {'],
  distinct: ['lib/shared/vesselResolve.js', "ok = ZONES.indexOf(z) !== -1 && !used[z];", 'ok = ZONES.indexOf(z) !== -1;'],
  legacy: ['lib/shared/vesselResolve.js', "if (typeof ai === 'number' && row.kind === 'conversion') return;", ''],
  admit: ['lib/shared/vesselStore.js', "      YT1300: 'eote p.264 · name \"YT-1300 Light Freighter\"',\n", ''],
  kindless: ['lib/shared/vesselStore.js', 'return !row || offerable(row); });', 'return true; });'],
  category: ['lib/shared/vesselStore.js', "if (!c.category_limit.some(function (x) { return cats.indexOf(x) !== -1; })) return 'category';", ''],
  held: ['lib/shared/vesselStore.js', "if (held.length && !(attachments && typeof attachments === 'object')) return 'held';", ''],
  shelf: ['lib/shared/vesselStore.js', "function onTheShelf(row) { return !!row && typeof row === 'object' && row.table === SHELF_TABLE; }",
    "function onTheShelf(row) { return !!row && typeof row === 'object'; }"],
  // ADDENDUM 15 H-3: the first turret row back to six arcs (the shipped data, in memory)
  // ADDENDUM 21: a TWO-apply write (the part removed, no conversion written) / the held template counted as a part that refuses
  twoapply: ['lib/shared/vesselStore.js', ',\n      conversion: { key: a.key, arcs: [], note: a.note == null ? null : a.note } }, now);', ' }, now);'],
  selfparts: ['lib/shared/vesselStore.js', 'var parts = held.some(function (a) { var row = reg[a.key]; return !row || offerable(row); });',
    "var parts = held.some(function (a) { var row = reg[a.key]; return !row || offerable(row) || row.kind === 'conversion'; });"],
  turretarcs: ['public/data/canonical/vehicle-attachments.json', '"dorsal": false,\n            "ventral": false\n          },\n          "turret": true\n',
    '"dorsal": true,\n            "ventral": true\n          },\n          "turret": true\n'],
  // R-S8C-20a: RE-AIMED at the resolved row: the added turret row takes a non-null location (vesselResolve's weapon_add line)
  turretloc: ['lib/shared/vesselResolve.js', "swappedIn({ firing_arcs: e.firing_arcs || {}, location: null, turret: !!e.turret",
    "swappedIn({ firing_arcs: e.firing_arcs || {}, location: 'Dorsal', turret: !!e.turret"],
  // R-S8C-20a: `location` written back onto the first turret EFFECT (the shipped data, in memory) — bites (i) and the member leg
  effectloc: ['public/data/canonical/vehicle-attachments.json', '"turret": true\n        }', '"turret": true,\n          "location": null\n        }'],
};
function source(file) {
  let s = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const m = MUT && MUTANTS[MUT];
  if (m && m[0] === file) {
    if (s.indexOf(m[1]) === -1) { console.log('MUTANT ' + MUT + ': its text is not in ' + file + ' (the guard is stale)'); process.exit(2); }
    s = s.replace(m[1], m[2]);
  }
  return s;
}
function load(file, name) { const sb = {}; new Function(source(file)).call(sb); return sb[name]; }
const R = load('lib/shared/vesselResolve.js', 'SWRPGVesselResolve');
const VS = load('lib/shared/vesselStore.js', 'SWRPGVessels');

let ok = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { ok++; if (!MUT) console.log('PASS  ' + label); }
  else { fail++; console.log('FAIL  ' + label + (detail !== undefined ? '  — ' + JSON.stringify(detail).slice(0, 400) : '')); }
}

const ATT = JSON.parse(source('public/data/canonical/vehicle-attachments.json')).vehicle_attachments;
const WPN = J('public/data/canonical/vehicle-weapons.json').vehicle_weapons;
const LIB = [].concat(...fs.readdirSync(path.join(ROOT, 'public/data/vehicle-library')).filter((f) => /\.json$/.test(f) && f !== 'index.json' && f !== 'taxonomy.json')
  .map((f) => J('public/data/vehicle-library/' + f).entries || []));
const lib = (k) => LIB.find((e) => e.key === k) || null;
const CTX = { attachments: ATT, weapons: WPN };
const ship = (key, extra) => Object.assign({ id: 'v_' + key, vehicleKey: key, owner: 'party', v: 3, attachments: [] }, extra || {});
const conv = (key, arcs) => ({ key, arcs: arcs || [], note: null });
const TEMPLATES = Object.keys(ATT).filter((k) => ATT[k].kind === 'conversion').sort();
const TURRET = { fore: true, aft: true, port: true, starboard: true, dorsal: false, ventral: false };   // H-3 (a): the four plane arcs

// ── C-1 · the record ──
{
  const raw = ship('YT1300', { conversion: { key: 'paramilitary_bulk_transport', arcs: ['fore', 'sideways', 'aft'], note: 'Q-ship', extra: 7 } });
  const n = VS.normalizeVessel(raw, 1);
  check('C-1 · conversion normalizes to {key, arcs, note}, an unknown field kept', n.conversion && n.conversion.key === 'paramilitary_bulk_transport'
    && n.conversion.note === 'Q-ship' && n.conversion.extra === 7, n.conversion);
  check('C-1 (b1) · a wrong-length, illegal `arcs` is kept AS STORED (nothing lost)', JSON.stringify(n.conversion.arcs) === '["fore","sideways","aft"]', n.conversion.arcs);
  check('C-1 · a normalized converted ship normalizes to itself', JSON.stringify(VS.normalizeVessel(n, 2)) === JSON.stringify(n));
  const plain = VS.normalizeVessel(ship('YT1300'), 1);
  check('C-1 · optional: a record without `conversion` reads back without one', !('conversion' in plain));
  const odd = VS.normalizeVessel(ship('YT1300', { conversion: { key: 'paramilitary_yacht', arcs: 'fore', note: '' } }), 1);
  const keyless = VS.normalizeVessel(ship('YT1300', { conversion: { arcs: ['fore'] } }), 1);
  check('C-1 · normalizeVessel runs the conversion through its normalizer: a non-list `arcs` reads [], an empty note null, a keyless one null',
    odd.conversion && JSON.stringify(odd.conversion.arcs) === '[]' && odd.conversion.note === null && keyless.conversion === null, [odd.conversion, keyless.conversion]);
  check('C-1 · a conversion with no key reads null; a non-list `arcs` reads []',
    VS.normalizeConversion({ arcs: ['fore'] }) === null && JSON.stringify(VS.normalizeConversion({ key: 'k', arcs: 'fore' }).arcs) === '[]');
}

// ── C-2 · the data ──
{
  check('C-2 · eleven templates carry kind "conversion"', TEMPLATES.length === 11, TEMPLATES);
  const lines = [].concat(...TEMPLATES.map((k) => ATT[k].base_mods || []));
  check('C-2 · their 54 lines are each MODELLED (a vehicle_effect ref onto base_effects), none TOLD (DC p.71 per D-218)',
    lines.length === 54 && lines.every((l) => l.effect && l.effect.type === 'vehicle_effect' && !('never_modelled' in l)), lines.length);
  check('C-2 · every template cites "DC p.71" and prints no `prints` line', TEMPLATES.every((k) => ATT[k].cite === 'DC p.71' && !ATT[k].prints));
  const PICKS = { paramilitary_bulk_transport: 2, paramilitary_shuttle: 2, paramilitary_light_freighter: 1, paramilitary_medium_transport: 1, paramilitary_yacht: 1 };
  check('C-2 · defense_picks: bulk 2 · shuttle 2 · light freighter / medium transport / yacht 1 · the other six none',
    TEMPLATES.every((k) => (ATT[k].defense_picks || 0) === (PICKS[k] || 0)), TEMPLATES.map((k) => [k, ATT[k].defense_picks]));
  check('C-2 · each picking template carries ONE chosen +1 defense line (ADDENDUM 2 Q3)', TEMPLATES.every((k) =>
    ATT[k].base_effects.filter((e) => e.op === 'defense_delta' && e.target === 'chosen' && e.amount === 1).length === (PICKS[k] ? 1 : 0)));
  const guns = (k) => ATT[k].base_effects.filter((e) => e.op === 'weapon_add');
  const cc = ATT.paramilitary_cloud_car.base_effects;
  check('C-2 · C-3 the cloud car\'s hull is −1 (the page; OggDude\'s words said +1) and G-1 its gun is AUTOBLAST, forward',
    cc.some((e) => e.op === 'hull_threshold_delta' && e.amount === -1) && guns('paramilitary_cloud_car').length === 1
    && guns('paramilitary_cloud_car')[0].weapon === 'AUTOBLAST' && guns('paramilitary_cloud_car')[0].firing_arcs.fore === true && !guns('paramilitary_cloud_car')[0].turret);
  const sh = guns('paramilitary_shuttle');
  check('C-2 · C-6 the shuttle\'s two twin light laser cannons are FORWARD, Linked 1 (not turrets)',
    sh.length === 1 && sh[0].weapon === 'LASERLT' && sh[0].amount === 2 && sh[0].linked === 1 && !sh[0].turret && sh[0].firing_arcs.fore && !sh[0].firing_arcs.aft, sh);
  const y = guns('paramilitary_yacht');
  check('C-2 · Q2 the Yacht\'s cell is two lines: LASERLT ×2 forward, LASERLT ×1 aft',
    y.length === 2 && y[0].weapon === 'LASERLT' && y[0].amount === 2 && y[0].firing_arcs.fore && !y[0].firing_arcs.aft
    && y[1].weapon === 'LASERLT' && y[1].amount === 1 && y[1].firing_arcs.aft && !y[1].firing_arcs.fore && ATT.paramilitary_yacht.base_mods.length === 5, y);
  check('C-2 · G-2 the speeder bike / swoop\'s gun is BLASTLTREP_VEH, forward', guns('paramilitary_speeder_bike_swoop').length === 1
    && guns('paramilitary_speeder_bike_swoop')[0].weapon === 'BLASTLTREP_VEH');
  // RE-POINTED (card ADDENDUM 15 H-3 (a) @ 49fc19358): was "all six arcs". DC p.71's facing All names no dorsal or ventral mount
  // (SILENT, R-RRD-1), so an added turret claims neither surface: the four plane arcs — the library's idiom. RE-POINTED again
  // (ADDENDUM 20 R-S8C-20a @ 9d53a8c77): the effect-member claim ("location null" on the effect) is DROPPED, since `location` is
  // not a vehicle_effect member (E-S8C-20); the resolved-row claim is KEPT and is read from vesselResolve's output (C-2b below).
  const turrets = TEMPLATES.reduce((a, k) => a.concat(guns(k).filter((g) => g.turret)), []);
  check('C-2 · a turret gun has facing All as the four plane arcs and `turret` — no dorsal/ventral claim (H-3 (a))',
    turrets.length === 5 && turrets.every((g) => JSON.stringify(g.firing_arcs) === JSON.stringify(TURRET))
    && guns('paramilitary_light_freighter')[0].turret === true, turrets.map((g) => [g.weapon, g.firing_arcs]));
  const adds = Object.keys(ATT).reduce((a, k) => a.concat((ATT[k].base_effects || []).concat(...(ATT[k].added_options || [])
    .map((o) => o.effects || []))).filter((e) => e && e.op === 'weapon_add'), []);
  check('C-2 · R-S8C-20a (i) none of the 12 weapon_add effects in vehicle-attachments.json carries `location` (E-S8C-20)',
    adds.length === 12 && adds.every((e) => !('location' in e)), { n: adds.length, carrying: adds.filter((e) => 'location' in e) });
  // L1.vatt's member rule, read in node: $defs/vehicle_effect is additionalProperties false, so a key outside its properties fails
  const VE = J('schema/charbuild-common.schema.json').$defs.vehicle_effect;
  check('C-2 · every weapon_add effect\'s keys are $defs/vehicle_effect members (additionalProperties false; L1.vatt\'s schema leg)',
    VE.additionalProperties === false && adds.every((e) => Object.keys(e).every((m) => m in VE.properties)),
    adds.map((e) => Object.keys(e).filter((m) => !(m in VE.properties))).filter((x) => x.length));
  check('C-2 · every template gun names a vehicle-weapons.json row', TEMPLATES.every((k) => guns(k).every((g) => WPN[g.weapon])));
  check('C-2 · C-1 the landspeeder template\'s limit is the page\'s "Landspeeder" (no "Speeder Truck")',
    JSON.stringify(ATT.paramilitary_landspeeder.constraints.type_limit) === '["Landspeeder"]');
  const x = WPN.BLASTLTREP_VEH;
  check('C-2 · G-2\'s row is never priced: price, rarity, (R) and silhouette null (the view\'s listPrice reads a non-number as no price)',
    x && x.price === null && x.rarity === null && x.restricted === null && x.silhouette === null && typeof x.price !== 'number', x && x.price);
  // THE SHELF (ADDENDUM 4 H-2: "A null price is never sold or priced"): swap, counter and the view's K4 list read onTheShelf
  const shelf = Object.keys(WPN).filter((k) => VS.onTheShelf(WPN[k]));
  check('C-2 · G-2 · THE SHELF is Table 7-17\'s 18 rows: BLASTLTREP_VEH is never offered', shelf.length === 18 && shelf.indexOf('BLASTLTREP_VEH') === -1
    && shelf.every((k) => WPN[k].table === 'EotE Table 7-17'), shelf.length);
  const st = { vessels: [VS.normalizeVessel(ship('YT1300'), 1)] }, yt = lib('YT1300');
  const fitW = { hull: yt.weapons.map((w) => w.key), weapons: WPN };
  check('C-2 · G-2 · a swap to BLASTLTREP_VEH is refused not_in_the_book; a Table 7-17 weapon is not',
    VS.swapRefusal(st, 'v_YT1300', 0, 'BLASTLTREP_VEH', fitW) === 'not_in_the_book' && VS.swapRefusal(st, 'v_YT1300', 0, 'LASERQUAD', fitW) === null);
  const cctx = { k9: true, writable: true, weapons: WPN, attachments: ATT, hull: () => fitW.hull };
  check('C-2 · G-2 · a counter line holding BLASTLTREP_VEH is refused not_in_the_book (no price, no sale); a Table 7-17 one delivers',
    VS.counterRefusal(st, { id: 'vweap:BLASTLTREP_VEH', qty: 1, for: { vessel: 'v_YT1300', then: 'hold' } }, cctx) === 'not_in_the_book'
    && VS.counterRefusal(st, { id: 'vweap:LASERQUAD', qty: 1, for: { vessel: 'v_YT1300', then: 'hold' } }, cctx) === null);
}

// ── C-2b · R-S8C-20a (ii): the RESOLVED added turret rows — turret, location null, the four plane arcs (vesselResolve's output) ──
{
  const yt = lib('YT1300');
  const base = R.resolve(ship('YT1300'), yt, CTX);
  const tt = TEMPLATES.filter((k) => ATT[k].base_effects.some((e) => e.op === 'weapon_add' && e.turret));
  const rows = tt.map((k) => {
    const want = ATT[k].base_effects.filter((e) => e.op === 'weapon_add' && e.turret).reduce((n, e) => n + e.amount, 0);
    const got = R.resolve(ship('YT1300', { conversion: conv(k, []) }), yt, CTX).weapons.slice(base.weapons.length).filter((w) => w.added_by);
    return { k, want, got };
  });
  check('C-2b · R-S8C-20a (ii) each of the 5 turret conversions\' resolved added rows read turret true, location null, the four plane arcs (dorsal/ventral false)',
    tt.length === 5 && rows.every((x) => x.got.length === x.want && x.got.every((w) => w.turret === true && 'location' in w && w.location === null
      && JSON.stringify(w.firing_arcs) === JSON.stringify(TURRET))),
    rows.map((x) => [x.k, x.want, x.got.map((w) => [w.key, w.turret, w.location, w.firing_arcs])]));
}

// ── C-3 · the resolve ──
{
  const yt = lib('YT1300');
  const base = R.resolve(ship('YT1300'), yt, CTX);
  const r = R.resolve(ship('YT1300', { conversion: conv('paramilitary_light_freighter', ['fore']) }), yt, CTX);
  check('C-3 · the YT-1300 + LIGHT FREIGHTER = the approved frames (handling −1 → −2 · armor 3 → 4 · hull 22 → 24 · strain 15 → 13 · fore +1)',
    base.handling === -1 && r.handling === -2 && base.armor === 3 && r.armor === 4 && base.hull_threshold === 22 && r.hull_threshold === 24
    && base.strain_threshold === 15 && r.strain_threshold === 13 && r.defense.fore === base.defense.fore + 1 && r.defense.aft === base.defense.aft,
    { handling: r.handling, armor: r.armor, hull: r.hull_threshold, strain: r.strain_threshold, defense: r.defense });
  const added = r.weapons.slice(base.weapons.length);
  // THIS LAP'S re-point (f100-s8-vocabulary ADDENDUM 2 @ 31a6eecb4, R-S8V-6 amended): a TURRET add is one row per gun, count 1,
  // each credited — the approved frames' two TURRET · QUAD LASER CANNON rows (M-conv, C-elig, S-conv)
  check('C-3 · its 2 quad laser turrets are appended as TWO rows of count 1, each credited {source, add} (R-S8V-6 as amended)', added.length === 2
    && added.every((w, j) => w.key === 'LASERQUAD' && w.count === 1 && w.turret === true && w.added_by === 'Paramilitary Light Freighter'
      && r.because['weapon_' + (base.weapons.length + j)][0].add === true), added);
  // ADDENDUM 15 H-3 (a): the identifier counts dorsal/ventral from the rows' own arcs — the stock two, as drawn (M-conv)
  const SS = require(path.join(ROOT, 'lib/shared/shipSchematic.js'));
  const ac = SS.arcCounts({ weapons: r.weapons }).counts, ac0 = SS.arcCounts({ weapons: base.weapons }).counts;
  check('C-3 · H-3 the converted YT-1300\'s identifier reads DORSAL 1 · VENTRAL 1 as drawn (the stock two), its plane arcs +2 each',
    ac.dorsal === 1 && ac.ventral === 1 && ac0.dorsal === 1 && ac0.ventral === 1
    && ['fore', 'aft', 'port', 'starboard'].every((k) => ac[k] === ac0[k] + 2), { ac, ac0 });
  check('C-3 · every number names the template (because)', ['handling', 'armor', 'hull_threshold', 'strain_threshold', 'defense_fore']
    .every((k) => (r.because[k] || []).some((c) => /Paramilitary Light Freighter/.test(c.source))), r.because);
  // R-S8C-11: a part fitted later (a weapon delta, chosen onto the conversion's gun) reaches it
  const gi = base.weapons.length;
  const up = R.resolve(ship('YT1300', { conversion: conv('paramilitary_light_freighter', ['fore']),
    attachments: [{ key: 'upgraded_firepower', mods: [], weapon: { i: gi, key: 'LASERQUAD' } }] }), yt, CTX);
  const hasWd = (ATT.upgraded_firepower || {}).base_effects;
  check('C-3 · R-S8C-11 · a part\'s weapon delta reaches the conversion\'s gun (added in the SET pass, before every delta)',
    !hasWd ? false : up.weapons[gi] && up.weapons[gi].damage === WPN.LASERQUAD.profile.damage + 1, up.weapons[gi] || hasWd);
  const two = R.resolve(ship('ACTIONIV', { conversion: conv('paramilitary_bulk_transport', ['fore', 'fore']) }), lib('ACTIONIV'), CTX);
  const b0 = R.resolve(ship('ACTIONIV'), lib('ACTIONIV'), CTX);
  const pend = two.pending.filter((p) => p.att === 'conversion');
  check('C-3 · Q3 "+1 in two arcs" is two DIFFERENT arcs: [fore, fore] → one +1 fore, the second pick PENDING (pick 1)',
    two.defense.fore === b0.defense.fore + 1 && pend.length === 1 && pend[0].pick === 1 && pend[0].op === 'defense_delta', { fore: two.defense.fore, pend });
  const both = R.resolve(ship('ACTIONIV', { conversion: conv('paramilitary_bulk_transport', ['port', 'aft']) }), lib('ACTIONIV'), CTX);
  check('C-3 · two different picks land one +1 each', both.defense.port === b0.defense.port + 1 && both.defense.aft === b0.defense.aft + 1
    && both.pending.filter((p) => p.att === 'conversion').length === 0, both.defense);
  const none = R.resolve(ship('ACTIONIV', { conversion: conv('paramilitary_bulk_transport', ['sideways']) }), lib('ACTIONIV'), CTX);
  check('C-3 (b1) · an illegal pick and a missing one are PENDING, never guessed (picks 0 and 1)',
    JSON.stringify(none.defense) === JSON.stringify(b0.defense) && none.pending.filter((p) => p.att === 'conversion').map((p) => p.pick).join() === '0,1', none.pending);
  const legacy = R.resolve(ship('YT1300', { attachments: [{ key: 'paramilitary_light_freighter', mods: [] }] }), yt, CTX);
  check('C-3 · R-S8B-6 a template held as a PART (a legacy holder) moves no number, as S7 promised',
    ['handling', 'armor', 'hull_threshold', 'strain_threshold'].every((k) => legacy[k] === base[k]) && legacy.weapons.length === base.weapons.length
    && JSON.stringify(legacy.defense) === JSON.stringify(base.defense), legacy);
  const held = R.resolve(ship('YT1300', { conversion: conv('paramilitary_light_freighter', ['fore']) }), yt, { attachments: null, weapons: WPN });
  check('C-3 · with the parts list missing, a converted ship HOLDS (R-S4CC-6)', held.held === true && held.armor === null, held.held);
  const orphan = R.resolve(ship('YT1300', { conversion: conv('paramilitary_starfighter', []) }), yt, CTX);
  check('C-3 · an unknown template is ORPHANED as the conversion piece, moving nothing', orphan.orphaned.attachments.some((o) => o.piece === 'conversion'
    && o.key === 'paramilitary_starfighter' && o.index === null) && orphan.armor === base.armor, orphan.orphaned);
}

// ── C-4 · who may take one ──
{
  const ADM = VS.CONVERSION_ADMITS;
  const entries = [].concat(...Object.keys(ADM).map((t) => Object.keys(ADM[t]).map((k) => [t, k, ADM[t][k]])));
  check('C-4 · CONVERSION_ADMITS: every key a library row, every cite present, every template a kind "conversion" row (' + entries.length + ' entries)',
    entries.length === 17 && entries.every(([t, k, c]) => lib(k) && typeof c === 'string' && c.length > 0 && ATT[t] && ATT[t].kind === 'conversion'),
    entries.filter(([t, k, c]) => !(lib(k) && c && ATT[t])));
  const lf = Object.keys(ADM.paramilitary_light_freighter);
  check('C-4 · V-8: the 13 admitted Light Freighters are exactly the library ships typed Freighter whose name says "Light Freighter"',
    JSON.stringify(lf.slice().sort()) === JSON.stringify(LIB.filter((e) => /Light Freighter/.test(e.name || '') && e.type === 'Freighter').map((e) => e.key).sort()) && lf.length === 13, lf);
  const refuse = (key, t, rec) => VS.conversionRefusal(rec || ship(key), lib(key), ATT[t], ATT);
  check('C-4 · the YT-1300 takes LIGHT FREIGHTER (admitted by name) and is refused the other ten',
    refuse('YT1300', 'paramilitary_light_freighter') === null && TEMPLATES.filter((t) => t !== 'paramilitary_light_freighter').every((t) => refuse('YT1300', t) !== null));
  // both print 0 hard points, so the ship-level refusal answers first; their type refusal is the template's own limit
  check('C-4 · H-5 the TIE/br and TIE/sh are refused SHUTTLE for type (AoR p.272: Starfighter) — and, first, for their 0 hard points',
    ['TIEBR', 'TIESH'].every((k) => VS.conversionLimit(lib(k), ATT.paramilitary_shuttle) === 'type' && refuse(k, 'paramilitary_shuttle') === 'no_hard_points'),
    ['TIEBR', 'TIESH'].map((k) => [VS.conversionLimit(lib(k), ATT.paramilitary_shuttle), refuse(k, 'paramilitary_shuttle')]));
  check('C-4 · H-5 the Starwind takes YACHT (name-admitted, EotE p.263) and is refused LIGHT FREIGHTER for type',
    refuse('STARWIND', 'paramilitary_yacht') === null && refuse('STARWIND', 'paramilitary_light_freighter') === 'type');
  check('C-4 · H-4 the Starhawk takes SPEEDER BIKE / SWOOP (FC p.53), the Versatile-Athletic Walker WALKER, the Zeta-class SHUTTLE',
    refuse('STARHAWKSPEED', 'paramilitary_speeder_bike_swoop') === null && refuse('VERATHWALK', 'paramilitary_walker') === null && refuse('ZETACARGOSHUTTLE', 'paramilitary_shuttle') === null);
  check('C-4 · C-2 a category limit is evaluated: ACTION IV takes BULK (list), the GR-75 MEDIUM, the Dustcrawler WHEELED/TRACKED (a bare string); the YT-1300 is refused BULK for category',
    refuse('ACTIONIV', 'paramilitary_bulk_transport') === null && refuse('GR75', 'paramilitary_medium_transport') === null
    && refuse('DUSTCRAWLER', 'paramilitary_wheeled_tracked') === null && refuse('YT1300', 'paramilitary_bulk_transport') === 'category');
  check('C-4 · the stringified-list form of category_subtype reads as its items', JSON.stringify(VS.categoriesOf({ category_subtype: "['Bulk Transport', 'Starship']" })) === '["Bulk Transport","Starship"]');
  const iron = ship('YT1300', { attachments: [{ key: 'combat_plating', mods: [] }, { key: 'paramilitary_light_freighter', mods: [] }] });
  check('C-4 · R-S8FJ-2 (corrected): v_iron\'s Combat Plating (kind hull) and its held template do not refuse — v_iron converts',
    refuse('YT1300', 'paramilitary_light_freighter', iron) === null);
  const part = Object.keys(ATT).find((k) => !ATT[k].kind && ATT[k].hp);
  check('C-4 · a ship holding an ordinary (kind-less) part is refused has_parts (D-219)', refuse('YT1300', 'paramilitary_light_freighter', ship('YT1300', { attachments: [{ key: part, mods: [] }] })) === 'has_parts', part);
  const plated = ship('YT1300', { attachments: [{ key: 'combat_plating', mods: [] }] });
  check('C-4 · R-S8G-1: the parts list NOT in hand (null) + Combat Plating only → held, never has_parts (R-S4CC-6\'s class)',
    VS.conversionRefusal(plated, lib('YT1300'), ATT.paramilitary_light_freighter, null) === 'held'
    && VS.conversionRefusal(plated, lib('YT1300'), ATT.paramilitary_light_freighter, undefined) === 'held',
    VS.conversionRefusal(plated, lib('YT1300'), ATT.paramilitary_light_freighter, null));
  check('C-4 · R-S8G-1: …the same ship with the list IN HAND converts, and a bare ship needs no list (nothing to classify)',
    refuse('YT1300', 'paramilitary_light_freighter', plated) === null
    && VS.conversionRefusal(ship('YT1300'), lib('YT1300'), ATT.paramilitary_light_freighter, null) === null);
  check('C-4 · R-S8G-1: with the list in hand, a held key it does not hold still counts as a part → has_parts',
    refuse('YT1300', 'paramilitary_light_freighter', ship('YT1300', { attachments: [{ key: 'no_such_part', mods: [] }] })) === 'has_parts');
  const zero = LIB.find((e) => e.hard_points_total === 0 && /Wheel/.test(JSON.stringify(e.category_subtype)));
  check('C-4 · a ship with zero hard points is refused no_hard_points (DC p.71)', zero && refuse(zero.key, 'paramilitary_wheeled_tracked') === 'no_hard_points', zero && zero.key);
  const truck = LIB.find((e) => e.type === 'Speeder Truck');
  check('C-4 · C-1 a Speeder Truck is refused LANDSPEEDER for type', truck && refuse(truck.key, 'paramilitary_landspeeder') === 'type', truck && truck.key);
  const fit = VS.resolveFit(lib('YT1300'), ATT.paramilitary_light_freighter);
  check('C-4 · resolveFit reads the same answer for a held template: the YT-1300\'s LIGHT FREIGHTER fits (no OFF-BOOK reason)', fit.ok && fit.reasons.length === 0, fit);
  const nofit = VS.resolveFit(lib('YT1300'), ATT.paramilitary_shuttle);
  check('C-4 · …and a refused one keeps the existing reason form', !nofit.ok && /^only for Shuttle — this is a Freighter$/.test(nofit.reasons[0]), nofit.reasons);
}

// ── C-5 · MAKE IT THIS SHIP'S CONVERSION (6h) ──
{
  const yt = lib('YT1300'), TPL = 'paramilitary_light_freighter', PART = 'advanced_targeting_array';
  const ent = (key, extra) => Object.assign({ key, mods: [], note: null }, extra || {});
  const state = (atts, extra) => ({ v: 3, vessels: [VS.normalizeVessel(ship('YT1300', Object.assign({ attachments: atts }, extra || {})), 1)] });
  const s0 = state([ent('combat_plating'), ent(TPL, { note: 'from the old save', zone: 'fore' })]);
  const r0 = s0.vessels[0];
  const s1 = VS.makeConversion(s0, r0.id, 1, 2), r1 = s1.vessels[0];
  const strip = (r) => { const o = Object.assign({}, r); delete o.attachments; delete o.conversion; delete o.updatedAt; return JSON.stringify(o); };
  check('C-5 · makeConversion is ONE apply: the held template out, conversion {key, arcs: [], note: the entry\'s note}, the record read back',
    r1.attachments.length === 1 && r1.attachments[0].key === 'combat_plating'
    && JSON.stringify(r1.conversion) === JSON.stringify({ key: TPL, arcs: [], note: 'from the old save' }), { att: r1.attachments, conv: r1.conversion });
  check('C-5 · no provenance event and no other member moves (the Convert door writes none; the S7 zone pick is not carried)',
    r1.provenance.length === r0.provenance.length && strip(r1) === strip(r0) && !!r1.conversion && !('zone' in r1.conversion), [strip(r0).length, strip(r1).length]);
  const b0 = R.resolve(r0, yt, CTX), b1 = R.resolve(r1, yt, CTX), stock = R.resolve(VS.normalizeVessel(ship('YT1300', { attachments: [ent('combat_plating')] }), 1), yt, CTX);
  check('C-5 · L-before → L-after: the legacy part moved nothing (R-S8B-6); the conversion moves handling −1 and the arc PENDING',
    b0.handling === stock.handling && b0.armor === stock.armor && b1.handling === stock.handling - 1 && b1.hull_threshold === stock.hull_threshold + 2
    && (b1.pending || []).some((x) => x.att === 'conversion'), { before: [b0.handling, b0.armor], after: [b1.handling, b1.armor, b1.hull_threshold], pending: b1.pending });
  const only = state([ent(TPL)]).vessels[0];
  check('C-5 · the door is LIVE on a ship whose only held entry is the template (no has_parts against itself), and beside a kinded piece (v_iron)',
    JSON.stringify(VS.legacyConversion(only, 0, yt, ATT)) === JSON.stringify({ key: TPL, why: null })
    && JSON.stringify(VS.legacyConversion(r0, 1, yt, ATT)) === JSON.stringify({ key: TPL, why: null }), [VS.legacyConversion(only, 0, yt, ATT), VS.legacyConversion(r0, 1, yt, ATT)]);
  const parts = state([ent(TPL), ent(PART)]).vessels[0];
  check('C-5 · beside one kind-less part the door is inert, has_parts (the Convert door\'s rule)',
    (VS.legacyConversion(parts, 0, yt, ATT) || {}).why === 'has_parts', VS.legacyConversion(parts, 0, yt, ATT));
  const conv = state([ent(TPL)], { conversion: conv0() }).vessels[0];
  function conv0() { return { key: 'paramilitary_light_freighter', arcs: ['fore'], note: null }; }
  check('C-5 · absent on a converted ship, and makeConversion refuses there (REMOVE CONVERSION is CONVERSION\'s)',
    VS.legacyConversion(conv, 0, yt, ATT) === null && VS.makeConversion({ v: 3, vessels: [conv] }, conv.id, 0, 2).vessels[0] === conv);
  check('C-5 · absent on a non-template entry (a BUILD PIECE) and with the parts list not in hand',
    VS.legacyConversion(r0, 0, yt, ATT) === null && VS.legacyConversion(r0, 1, yt, null) === null && VS.legacyConversion(r0, 7, yt, ATT) === null);
}

if (MUT) { console.log('MUTANT ' + MUT + ': ' + fail + ' FAIL'); process.exit(fail ? 1 : 0); }
Object.keys(MUTANTS).forEach((m) => {
  const c = spawnSync(process.execPath, [__filename, '--mutant=' + m], { encoding: 'utf8' });
  check('bite · --mutant=' + m + ' turns this guard RED — the child exits 1 (read by exit code)', c.status === 1, (c.stdout || '').split('\n').filter((l) => /^FAIL|MUTANT/.test(l)).slice(0, 2));
});
console.log('\nshipyard_s8_convert: ' + ok + '/' + (ok + fail) + ' PASS' + (fail ? '  (' + fail + ' FAILED)' : ''));
process.exit(fail ? 1 : 0);
