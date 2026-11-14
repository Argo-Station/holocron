// test/b1067_device_roster_ctx.cjs — B-1067 / F2 (ruling `shipyard-s5-ready` R-S5R-2, rider R-S5R-7): ONE SHIP, ONE NUMBER
// on every face of one device. The resolver sees every character saved on this device (plus the scoped one, when it is not
// yet saved) — on both hosts, at every call site. The case the brief measured (`q2_viewer.cjs`, now this committed leg): a
// party HWK-290 (silhouette 3, 5 hard points); character B bonded to it with Signature Vehicle and Custom Loadout (Modder's
// tree); A and B both saved on the device. Custom Loadout adds 2 hard points through the bond, so every face reads 7.
// At 64f2cb9b the player's Yard scoped to A read 5 (it passed only [yardChar]) and the GM read 5 (characters: []).
//
// Driven, never retyped: each host's `yardResolveCtx` (and what it calls) is SLICED from the shipped source by name, and each CALL SITE's own argument expression is read from the source and evaluated in a scope
// holding what that face holds (the scoped character; the sheet's own `me`). The resolver is lib/shared/vesselResolve.js.
// `B1067_REF=<sha>` reads the three host files at that commit instead (the red-first run).
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log('✓ ' + label); } else { fail++; console.log('✗ ' + label + (detail !== undefined ? '  — ' + JSON.stringify(detail).slice(0, 300) : '')); }
}
const REF = process.env.B1067_REF || null;
const src = (p) => (REF ? execFileSync('git', ['show', REF + ':' + p], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 }) : fs.readFileSync(path.join(ROOT, p), 'utf8'));
const json = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

// a function declaration, sliced by name with its braces counted (these bodies hold no brace inside a string)
function slice(code, name) {
  const m = new RegExp('(^|\\n)([ \\t]*)function ' + name + '\\(').exec(code);
  if (!m) return null;
  const start = m.index + m[1].length;
  let i = code.indexOf('{', start), depth = 0;
  for (; i < code.length; i++) { if (code[i] === '{') depth++; else if (code[i] === '}' && --depth === 0) return code.slice(start, i + 1); }
  return null;
}

// ── the device: A and B saved; B bonded to the party's HWK-290 with Signature Vehicle (0-3) and Custom Loadout (4-3) ──
const SPECS = json('public/data/canonical/specializations.json').specializations;
const modder = SPECS.modder.talent_tree;
check('the fixture\'s talents sit where the tree puts them (Modder 0-3 Signature Vehicle, 4-3 Custom Loadout)',
  modder[0].talents[3].talent === 'signature_vehicle' && modder[4].talents[3].talent === 'custom_loadout');
const HWK = json('public/data/vehicle-library/freighters.json').entries.filter((r) => r.key === 'HWK290LTFREIGHT')[0];
const SHIP = { id: 'v_hwk', vehicleKey: 'HWK290LTFREIGHT', owner: 'party', attachments: [], crew: [], mounts: [] };
const A = { id: 'char_a', name: 'Ama', sheetData: { specializations: [] } };
const B = { id: 'char_b', name: 'Bex', sheetData: { myShipId: 'v_hwk', specializations: [{ id: 'modder', owned: ['0-3', '4-3'] }] } };
const ROSTER = [A, B];
const base = HWK && HWK.hard_points_total;
check('the HWK-290 prints ' + base + ' hard points bare (silhouette ' + (HWK && HWK.silhouette) + ')', base === 5 && HWK.silhouette === 3, HWK && { hp: HWK.hard_points_total, sil: HWK.silhouette });

const box = {};
new Function(fs.readFileSync(path.join(ROOT, 'lib/shared/vesselResolve.js'), 'utf8')).call(box);
const CRmod = require(path.join(ROOT, 'lib/shared/charResolve.js'));
const VR = box.SWRPGVesselResolve;
function makeWindow(VV) {
  return {
    // RE-POINTED at the S5 flip (ruling `shipyard-s5-ready` R-S5R-18/20): K9 is retired, so the device no longer stubs its key ON
    localStorage: { getItem: (k) => (k === 'swrpg_saved_characters' ? JSON.stringify(ROSTER) : null), setItem: () => {} },
    location: { search: '' },
    // the loaded charbuild carries its talents (loadCanonicalCharacterBuild): F-100 M8's resolver reads Custom Loadout's +2 from
    // its `vehicle_effects` row and HOLDS a holder without the registry (R-M8C8-1) — merged by `f100-m8-build` R-M8G-75
    _canonicalCharbuild: { specializations: SPECS, talents: json('public/data/canonical/talents.json').talents },
    CharResolve: CRmod,
    SWRPGVesselView: VV,
  };
}
// the shared module's builder (vesselView.jsx), sliced the same way: readDeviceRoster and whatever the builder calls
const vvSrc = src('lib/shared/vesselView.jsx');
const VV_FNS = ['readDeviceRoster', 'talentChainOf', 'talentRanksOf', 'deviceResolveCtx'].map((n) => slice(vvSrc, n)).filter(Boolean);
const VV = new Function('window', VV_FNS.join('\n') + '\nreturn { readDeviceRoster: readDeviceRoster, '
  + (/function deviceResolveCtx\(/.test(VV_FNS.join('')) ? 'deviceResolveCtx: deviceResolveCtx, talentRanksOf: talentRanksOf' : '') + ' };');

function host(file) {
  const code = src(file);
  const fns = ['yardTalentRanks', 'yardResolveCtx'].map((n) => slice(code, n)).filter(Boolean);   // the switch is gone (R-S5R-18)
  const win = makeWindow(null);
  win.SWRPGVesselView = VV(win);
  const api = new Function('window', fns.join('\n') + '\nreturn { yardResolveCtx: yardResolveCtx };')(win);
  // every call site: the argument text between `yardResolveCtx(` and its matching `)`
  const sites = [];
  const re = /yardResolveCtx\(/g; let m;
  while ((m = re.exec(code))) {
    if (/function\s+$/.test(code.slice(Math.max(0, m.index - 10), m.index))) continue;   // the definition
    let i = m.index + m[0].length, depth = 1;
    for (; i < code.length && depth; i++) { if (code[i] === '(') depth++; else if (code[i] === ')') depth--; }
    sites.push({ line: code.slice(0, m.index).split('\n').length, arg: code.slice(m.index + m[0].length, i - 1) });
  }
  return { api, win, sites };
}
function hardPoints(ctx) {
  const r = VR.resolve(SHIP, HWK, Object.assign({}, ctx || { characters: [] }, { attachments: {} }));
  return r && r.hard_points;
}

const P = host('player/app.jsx'), G = host('gm/app.jsx');
// R-S5R-7 after the flip (R-S5G-5, R-S5R-23: "R-S5R-7 stays at 7"): the two dead sites (PlayerYardScreen, ShipYardScreen) went
// with their faces, so the player reads 4 (the Yard ×3, the sheet's VESSELS) and the GM 3 (the Yard's rooms).
// RE-POINTED 4 → 5 (7 → 8 in all) by ruling `release-r5-rigger` CONDITION 2 (D-R5R2): the files room's export hands the OggDude
// exporter `resolveCtx: yardResolveCtx([record])` (the picked roster record), a fifth player site, read and evaluated below
// like the others. KEEPS every site, every 7-hard-points leg and the GM's 3; DROPS only the bare count 4.
// RE-POINTED 5 → 6 (8 → 9 in all) by card `release-r5-f1-card` (the `release-r5-rigger` RIDERS: `handleText` → `settleRigger`): the
// import hands settleRigger `yardResolveCtx([{ id: '__import', sheetData: sheet }].concat(<the saved roster>))` (the sheet just
// made, before it is saved), a sixth player site, read and evaluated below like the others. KEEPS every site, every
// 7-hard-points leg and the GM's 3; DROPS only the bare count 5.
check('R-S5R-7: the player host\'s resolver call sites are all read (the Yard ×3, the sheet\'s VESSELS, the files room\'s export, the import\'s settle) — 6', P.sites.length === 6, P.sites);
check('R-S5R-7: the GM host\'s resolver call sites are all read (the Yard\'s rooms) — 3; 9 in all', G.sites.length === 3 && P.sites.length + G.sites.length === 9, G.sites);
// what each face holds in scope: the Yard's scoped character, the sheet's own `me` (its live sheet), and — at the base — the
// sheet's own `others` read (the roster minus me), which the old sheet site concatenated itself
function scope(scoped) {
  const me = scoped ? { id: scoped.id, sheetData: scoped.sheetData } : null;
  // `record`: the files room's picked roster record (runExport's argument; release-r5-rigger CONDITION 2)
  // `sheet`: the import's sheet just made (handleText; release-r5-f1 D) — a new character, not on the roster, bonded to nothing
  return { yardChar: scoped, me, charId: scoped ? String(scoped.id) : null, others: ROSTER.filter((c) => !scoped || c.id !== scoped.id), record: scoped,
    sheet: { myShipId: null, specializations: [] } };
}
// the import's site reads the saved roster through the shared module (lib/shared/roster.js), loaded whole over the device's storage
const ROSTER_WIN = makeWindow(null);
new Function('window', 'localStorage', src('lib/shared/roster.js'))(ROSTER_WIN, ROSTER_WIN.localStorage);
const evalSite = (hostApi, arg, sc) => new Function('yardResolveCtx', 'yardChar', 'me', 'charId', 'others', 'record', 'sheet', 'window', 'return yardResolveCtx(' + arg + ');')(
  hostApi.yardResolveCtx, sc.yardChar, sc.me, sc.charId, sc.others, sc.record, sc.sheet, ROSTER_WIN);
[['A', A], ['B', B], ['nobody', null]].forEach(([who, c]) => {
  P.sites.forEach((s) => {
    const hp = hardPoints(evalSite(P.api, s.arg, scope(c)));
    check('R-S5R-7 · player/app.jsx:' + s.line + ' (' + s.arg.slice(0, 40) + '), scoped to ' + who + ': hard points 7', hp === 7, { hp });
  });
});
G.sites.forEach((s) => {
  const hp = hardPoints(evalSite(G.api, s.arg, scope(null)));
  check('R-S5R-7 · gm/app.jsx:' + s.line + ' (the GM holds A and B on this device): hard points 7', hp === 7, { hp });
});
// R-S5R-2: ONE builder, not two spellings — both hosts delegate to the shared module's
const pSrc = src('player/app.jsx'), gSrc = src('gm/app.jsx');
check('R-S5R-2: both hosts\' yardResolveCtx delegate to the ONE builder (SWRPGVesselView.deviceResolveCtx); no host projects talents itself',
  /deviceResolveCtx/.test(slice(pSrc, 'yardResolveCtx') || '') && /deviceResolveCtx/.test(slice(gSrc, 'yardResolveCtx') || '') && !slice(pSrc, 'yardTalentRanks'),
  { player: (slice(pSrc, 'yardResolveCtx') || '').slice(0, 120), gm: (slice(gSrc, 'yardResolveCtx') || '').slice(0, 120) });
// de-duplicated by id, the scoped one first (its live sheet beats the saved copy); a holder on another device is not seen
if (P.win.SWRPGVesselView.deviceResolveCtx) {
  const ctx = P.win.SWRPGVesselView.deviceResolveCtx([{ id: 'char_b', sheetData: { myShipId: null, specializations: [] } }]);
  check('R-S5R-2: de-duplicated by id, the scoped character\'s live sheet first (B un-bonded live → 5, the saved bond not double-counted)',
    ctx.characters.length === 2 && ctx.characters.filter((c) => c.id === 'char_b').length === 1 && hardPoints(ctx) === 5, ctx.characters.map((c) => c.id));
  const winNo = makeWindow(null); winNo.localStorage.getItem = () => null;
  const lone = VV(winNo).deviceResolveCtx([]);
  check('R-S5R-2: a device holding no characters → no bond (both hosts then agree without the holder\'s effect)', lone.characters.length === 0 && hardPoints(lone) === 5);
} else check('R-S5R-2: the shared builder exists (SWRPGVesselView.deviceResolveCtx)', false, 'absent');

// B-1084 (ruling `shipyard-s5-ready` R-S5R-23): each character's entry carries ITS OWN talent rows, from the same chain as its
// ranks (stamp view → the device's view → the base). A registered talentViewFor stamps B with a pack whose Custom Loadout
// adds 3; A is unstamped and carries the loaded charbuild's rows. The ctx-level registry stays (the fallback).
if (P.win.SWRPGVesselView.deviceResolveCtx) {
  const TALS = json('public/data/canonical/talents.json').talents;
  const packTalents = Object.assign({}, TALS, { custom_loadout: Object.assign({}, TALS.custom_loadout, {
    vehicle_effects: [Object.assign({}, TALS.custom_loadout.vehicle_effects[0], { amount: 3 })] }) });
  const stamp = { specializations: SPECS, talents: packTalents };
  const Bs = { id: 'char_b', sheetData: Object.assign({}, B.sheetData, { packStamp: 'p1' }) };
  CRmod.setTalentViewResolver((sheet) => (sheet && sheet.packStamp === 'p1' ? stamp : null));
  let ctx;
  try { ctx = P.win.SWRPGVesselView.deviceResolveCtx([Bs]); } finally { CRmod.setTalentViewResolver(null); }
  const eb = ctx.characters.filter((c) => c.id === 'char_b')[0], ea = ctx.characters.filter((c) => c.id === 'char_a')[0];
  check('B-1084: the stamped character\'s entry carries the STAMP\'s talents (its own Custom Loadout row, +3)',
    !!eb && eb.talentRecords === packTalents, eb && eb.talentRecords && eb.talentRecords.custom_loadout && eb.talentRecords.custom_loadout.vehicle_effects);
  check('B-1084: the unstamped character\'s entry carries the loaded charbuild\'s talents (the base chain)',
    !!ea && ea.talentRecords === P.win._canonicalCharbuild.talents, ea && typeof ea.talentRecords);
  check('B-1084: the ctx-level registry is unchanged (the loaded charbuild\'s talents, the fallback)', ctx.talentRecords === P.win._canonicalCharbuild.talents);
  check('B-1084: the Yard prints the stamped holder\'s OWN number (5 + 3 = 8)', hardPoints(ctx) === 8, { hp: hardPoints(ctx) });
}

console.log('\n' + pass + '/' + (pass + fail) + ' ' + (fail ? 'FAILED' : 'ALL PASS'));
process.exit(fail ? 1 : 0);
