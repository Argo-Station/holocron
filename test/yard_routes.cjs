// test/yard_routes.cjs — SHIP YARD S4 · K6's route grammar and the Yard host's switch lines (ruling
// `shipyard-s4-ground` R-S4G-3, R-S4G-15, §4 U8/U9, §6 JOB 2 G6/G11; the ratified K6 text in
// `shipyard-s3-contracts` §2: "Vehicle keys are upper-case, and the four words are reserved lower-case;
// a guard row asserts no key collides").
//
// The grammar is ONE function for both hosts (`yardRoute` in lib/shared/vesselView.jsx). This guard lifts
// it out of the SOURCE (no built bundle needed) and drives it; then it reads the vehicle library for the
// reserved-word collision; then it pins the host lines that make the S4 Yard the only Yard (K9 retired at the S5 flip,
// ruling `shipyard-s5-ready` R-S5R-18), and that the walk levers are gone (D-27; ruling `shipyard-s5-ready` P3).
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let fail = 0, pass = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log('✓ ' + label); } else { fail++; console.log('✗ ' + label + (detail !== undefined ? '  — ' + JSON.stringify(detail).slice(0, 300) : '')); }
}
const src = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

// ── (a) the grammar, driven ──
const vv = src('lib/shared/vesselView.jsx');
const a = vv.indexOf('  var YARD_ROOMS = ');
const b = vv.indexOf('  // ── the three registries the floor reads');
check('the grammar block is in vesselView.jsx (YARD_ROOMS … yardQuery)', a > 0 && b > a);
let G = {};
try {
  G = new Function(vv.slice(a, b) + '\nreturn { YARD_ROOMS, yardRoute, yardTail, yardQuery: typeof yardQuery !== "undefined" ? yardQuery : null,'
    + ' SHIP_TABS: typeof SHIP_TABS !== "undefined" ? SHIP_TABS : null, YARD_RESERVED: typeof YARD_RESERVED !== "undefined" ? YARD_RESERVED : null };')();
} catch (e) { check('the grammar block evaluates', false, String(e)); }
const R = (t) => JSON.stringify(G.yardRoute ? G.yardRoute(t) : null);
check('the four room words, lower-case', JSON.stringify(G.YARD_ROOMS) === JSON.stringify(['hangar', 'catalogue', 'ship', 'unit']), G.YARD_ROOMS);
// `shipyard-s4-ship-room` R-S4SR-2: the workbench's six tabs, in the drawn order (the approved bar reads
// FIT · CREW · DOCK · LOG · TRADE · DECK), each accepted, any other refused
const DRAWN_TABS = ['fit', 'crew', 'dock', 'log', 'trade', 'deck'];
check('R-S4SR-2: SHIP_TABS is the drawn bar, in order (trade included)', JSON.stringify(G.SHIP_TABS) === JSON.stringify(DRAWN_TABS), G.SHIP_TABS);
DRAWN_TABS.forEach((t) => check('R-S4SR-2: "ship/v_1/' + t + '" is the ' + t.toUpperCase() + ' tab', R('ship/v_1/' + t) === JSON.stringify({ room: 'ship', id: 'v_1', tab: t }), R('ship/v_1/' + t)));
['FIT', 'cargo', 'room', 'sheet', 'bench', ''].forEach((t) => check('R-S4SR-2: "ship/v_1/' + t + '" is refused unless it is a ship with no tab', R('ship/v_1/' + t) === JSON.stringify(t ? { room: 'notfound' } : { room: 'ship', id: 'v_1', tab: null }), R('ship/v_1/' + t)));
// R-S4SR-1: the at-table DECK room has its own address; `room` is reserved (never a tab, never a lone key)
check('R-S4SR-1: "ship/v_1/room/deck" is the DECK room at the table', R('ship/v_1/room/deck') === JSON.stringify({ room: 'ship', id: 'v_1', tab: null, at: 'deck' }), R('ship/v_1/room/deck'));
[['ship/v_1/room', 'room alone is never a tab'], ['ship/v_1/room/fit', 'room holds no workbench tab'], ['ship/v_1/room/deck/x', 'nothing below the room'],
  ['room', 'room is never a lone key']]
  .forEach(([t, why]) => check('R-S4SR-1: "' + t + '" → notfound (' + why + ')', R(t) === JSON.stringify({ room: 'notfound' }), R(t)));
check('R-S4SR-1: the room\'s tail is its address (yardTail)', G.yardTail && G.yardTail({ room: 'ship', id: 'v 1', tab: null, at: 'deck' }) === 'ship/v%201/room/deck');
check('R-S4SR-1: `room` joins the reserved words (the key-collision row reads them)', Array.isArray(G.YARD_RESERVED) && G.YARD_RESERVED.indexOf('room') !== -1
  && G.YARD_ROOMS.every((w) => G.YARD_RESERVED.indexOf(w) !== -1), G.YARD_RESERVED);
const CASES = [
  ['', { room: 'hangar' }], ['hangar', { room: 'hangar' }], ['/hangar/', { room: 'hangar' }],
  ['catalogue', { room: 'catalogue' }], ['catalogue/YT1300', { room: 'entry', key: 'YT1300' }],
  ['ship/v_1', { room: 'ship', id: 'v_1', tab: null }], ['ship/v_1/log', { room: 'ship', id: 'v_1', tab: 'log' }],
  ['ship/v_1/deck', { room: 'ship', id: 'v_1', tab: 'deck' }],
  ['unit/u_1', { room: 'unit', id: 'u_1' }],
  ['T65BXWING', { room: 'entry', key: 'T65BXWING', alias: true }],
  ['ship/v_1/bogus', { room: 'notfound' }], ['ship', { room: 'notfound' }], ['unit', { room: 'notfound' }],
  ['hangar/x', { room: 'notfound' }], ['catalogue/A/B', { room: 'notfound' }], ['unit/u_1/x', { room: 'notfound' }],
];
CASES.forEach(([t, want]) => check('K6: "' + t + '" → ' + JSON.stringify(want), R(t) === JSON.stringify(want), R(t)));
[{ room: 'hangar' }, { room: 'catalogue' }, { room: 'entry', key: 'YT1300' }, { room: 'ship', id: 'v_1', tab: 'fit' }, { room: 'unit', id: 'u_1' },
  { room: 'ship', id: 'v_1', tab: 'trade' }, { room: 'ship', id: 'v_1', tab: null, at: 'deck' }]
  .forEach((r) => {
    const back = G.yardRoute ? G.yardRoute(G.yardTail(r)) : {};
    const same = Object.keys(r).every((k) => back[k] === r[k]) && Object.keys(back).every((k) => k in r || back[k] == null);
    check('K6 round trip: ' + JSON.stringify(r), same, back);
  });
// R-S4CC-2 (`shipyard-s4-catalogue-card` ADDENDUM 2, ratified on paper): PLAN's route — 'catalogue/<KEY>/plan' is P1 on that
// hull, its `?part=` read from the search (the tail stays a path); `?part=` is the Yard's one URL key (S5 P3). The
// parser takes any KEY: an unknown one is the ROOM's not-found and an unfitting part plans nothing (the catalogue suite's legs).
const RS = (t, q) => JSON.stringify(G.yardRoute ? G.yardRoute(t, q) : null);
check('R-S4CC-2: "catalogue/T65BXWING/plan" → P1 on that hull, nothing named', RS('catalogue/T65BXWING/plan', '') === JSON.stringify({ room: 'plan', key: 'T65BXWING', part: null }), RS('catalogue/T65BXWING/plan', ''));
check('R-S4CC-2 · S5 P3: "catalogue/T65BXWING/plan" with ?part= → that part named (an old lever key beside it is inert)',
  RS('catalogue/T65BXWING/plan', '?yard_b1=date&part=advanced_targeting_array') === JSON.stringify({ room: 'plan', key: 'T65BXWING', part: 'advanced_targeting_array' }), RS('catalogue/T65BXWING/plan', '?yard_b1=date&part=advanced_targeting_array'));
check('R-S4CC-2: an unknown KEY still parses as PLAN (the room answers with the entry\'s not-found)', RS('catalogue/NOSUCHHULL/plan', '?part=x') === JSON.stringify({ room: 'plan', key: 'NOSUCHHULL', part: 'x' }));
check('R-S4CC-2: ?part= on any other room is not read', RS('catalogue/T65BXWING', '?part=x') === JSON.stringify({ room: 'entry', key: 'T65BXWING' }));
[['catalogue/T65BXWING/plan/x', 'nothing below PLAN'], ['catalogue/T65BXWING/PLAN', 'the word is lower-case'], ['catalogue/T65BXWING/fit', 'only PLAN sits under an entry']]
  .forEach(([t, why]) => check('R-S4CC-2: "' + t + '" → notfound (' + why + ')', R(t) === JSON.stringify({ room: 'notfound' }), R(t)));
check('R-S4CC-2: yardTail writes PLAN as a path only', G.yardTail && G.yardTail({ room: 'plan', key: 'T65BXWING', part: 'x' }) === 'catalogue/T65BXWING/plan');
check('R-S4CC-2: round trip through the tail and the query', (function () {
  const r = { room: 'plan', key: 'T65BXWING', part: 'a b&c' }, q = G.yardQuery ? G.yardQuery(r) : '';
  return q === '?part=a%20b%26c' && RS(G.yardTail(r), q) === JSON.stringify(r);
})(), G.yardQuery && G.yardQuery({ room: 'plan', key: 'T65BXWING', part: 'a b&c' }));
check('S5 P3: yardQuery writes ?part= for PLAN with a part, and nothing for every other move (no lever key, ever)',
  !!G.yardQuery && G.yardQuery({ room: 'entry', key: 'YT1300' }) === '' && G.yardQuery({ room: 'hangar' }) === ''
  && G.yardQuery({ room: 'plan', key: 'YT1300', part: null }) === '' && G.yardQuery.length === 1);
// S5 (shipyard-s5-card R-S5C-1; ruling `shipyard-s5-ready` P3): the walk levers are read NOWHERE. Every source file under
// lib/, player/ and gm/ (the .jsx and the hand-written .js, never a built bundle) is swept for the five lever names.
const LEVER_RE = /yard_b[12]|yardLevers|leverQuery|LEVER_KEYS|yardLeverSt/;
const built = new Set(['player/app.js', 'player/creator.js', 'player/sheet.js', 'gm/app.js', 'vendor.js']);   // B-139: + the chunks
const leverHits = []; let leverScanned = 0;
(function walk(dir) {
  fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).forEach((d) => {
    const rel = dir + '/' + d.name;
    if (d.isDirectory()) { if (d.name !== 'node_modules') walk(rel); return; }
    if (!/\.(jsx?|html)$/.test(d.name) || /\.map$/.test(d.name) || built.has(rel)) return;
    if (/\.js$/.test(d.name) && fs.existsSync(path.join(ROOT, rel + 'x'))) return;   // a built sibling of a .jsx
    leverScanned++; if (LEVER_RE.test(fs.readFileSync(path.join(ROOT, rel), 'utf8'))) leverHits.push(rel);
  });
})('lib'); ['player', 'gm'].forEach((d) => { fs.readdirSync(path.join(ROOT, d)).forEach((f) => {
  const rel = d + '/' + f; if (/\.(jsx|html)$/.test(f) && ++leverScanned && LEVER_RE.test(fs.readFileSync(path.join(ROOT, rel), 'utf8'))) leverHits.push(rel); }); });
check('S5 P3: yard_b1, yard_b2, yardLevers, leverQuery, LEVER_KEYS, yardLeverSt occur in no source under lib/, player/, gm/ (non-vacuity: > 80 files read)', leverHits.length === 0 && leverScanned > 80, { leverHits, leverScanned });
check('S5 (R-S5C-1): no hard-coded walk default survives — no `b1: \'session\'` / `b2: \'card\'` in the Yard\'s sources',
  !/b1: 'session'|b2: 'card'/.test(vv) && !/b1: 'session'|b2: 'card'/.test(src('player/app.jsx')) && !/b1: 'session'|b2: 'card'/.test(src('gm/app.jsx')));

// ── (b) no registry vehicle key collides with a reserved room word ──
const keys = [];
fs.readdirSync(path.join(ROOT, 'public/data/vehicle-library')).filter((f) => f.endsWith('.json')).forEach((f) => {
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/vehicle-library', f), 'utf8'));
  (j.entries || []).forEach((e) => { if (e && e.key) keys.push(String(e.key)); });
});
check('the vehicle library is read (non-vacuity: > 400 keys)', keys.length > 400, keys.length);
const collide = keys.filter((k) => (G.YARD_RESERVED || G.YARD_ROOMS || []).indexOf(k.toLowerCase()) !== -1);
check('K6: no vehicle key collides with a reserved word — the four rooms and `room` (any case; R-S4SR-1)', collide.length === 0 && !!G.YARD_RESERVED, collide);
const lower = keys.filter((k) => k !== k.toUpperCase());
check('K6: every vehicle key is upper-case (so a lower-case room word can never be a key)', lower.length === 0, lower.slice(0, 5));

// ── (c) the hosts: the S4 Yard is the only Yard (ruling `shipyard-s5-ready` R-S5R-18) ──
// RE-POINTED at the S5 flip (R-S5R-20, the brief's ADDENDUM 2 §5: "re-pointed to 'the S4 host is the Yard'"). KEPT: the same
// six host sites, each read from source. CHANGED: each now pins the term-free line (no switch); "the live PlayerYardScreen /
// ShipYardScreen otherwise" becomes "and no old face is mounted". The zero-reader pin is test/yard_switch_retired.cjs's.
const pa = src('player/app.jsx'), gm = src('gm/app.jsx');
check('player: yardScreenFor reads every /player/yard path (no switch)', /function yardScreenFor\(path\) \{\s*var m = /.test(pa));
check('gm: gmYardTail reads every /gm/yard path (no switch)', /function gmYardTail\(path\) \{\s*var m = /.test(gm));
check('U9 player: navTo sends every Yard door to the HANGAR (a hull to its ENTRY)',
      /if \(screenId === 'yard'\) \{\s*var ytail = vk \? 'catalogue\/' \+ encodeURIComponent\(vk\) : 'hangar';/.test(pa));
check('U9 gm: navTo sends every Yard door to the HANGAR (a hull to its ENTRY)',
      /if \(screenId === 'yard'\) \{\s*var ytail = \(params && params\.vehicleKey\) \? 'catalogue\/' \+ encodeURIComponent\(params\.vehicleKey\) : 'hangar';/.test(gm));
check('player: the S4 host is the Yard, and no old face is mounted (no !yardS4 mount, no PlayerYardScreen)',
      /const yardS4 = screen === 'yard' && !!\(window\.SWRPGVesselView/.test(pa) && !/!yardS4 && \(/.test(pa) && !/PlayerYardScreen[,)]/.test(pa));
check('gm: the S4 host is the Yard, and no old face is mounted (no !yardS4 mount, no ShipYardScreen)',
      /const yardS4 = screen === 'yard' && !!\(window\.SWRPGVesselView/.test(gm) && !/!yardS4 && \(/.test(gm) && !/<ShipYardScreen\b/.test(gm));
check('m1 (P3, G2): paperChrome includes the Yard (no switch)',
      /\|\| screen === 'yard'   \/\/ SHIP YARD S4/.test(pa) && /\|\| screen === 'yard';   \/\/ SHIP YARD S4/.test(gm));
// Re-pointed at JOB 3a (U3): KEEPS the claim — the floor's and the catalogue's BACK go home through homeScreenFor, and
// U1's and the ship's read ‹ HANGAR — and DROPS the old adjacency to `chip: yardChar` (the ship room's chip now comes first).
check('rider 23: the player ON face\'s BACK goes home through homeScreenFor (U1\'s and the ship\'s: the HANGAR)',
      // JOB 4: the entry's BACK reads ‹ CATALOGUE (E1–E3) and returns to the index; the index's still goes home
      /: \(yardRouteNow\.room === 'unit' \|\| yardRouteNow\.room === 'ship'\)\s*\? function\(\) \{ yardGo\(\{ room: 'hangar' \}\); \}\s*: yardRouteNow\.room === 'entry' \? function\(\) \{ yardGo\(\{ room: 'catalogue' \}\); \}\s*: function\(\) \{ navTo\(homeScreenFor\(savedChars\)\); \},/.test(pa));
// RE-POINTED at the S5 flip: DROPPED `onVessels: yardOpenSheetVessels` (PlayerYardScreen's prop, deleted with it, R-S5R-18).
check('U3: a ship opened from the sheet\'s VESSELS reads ‹ <NAME>’S SHEET and goes back to that sheet (the one sheet-return)',
      /exitLabel: yardShipFromSheet \? String\(yardChar\.name \|\| ''\)\.toUpperCase\(\) \+ '’S SHEET'/.test(pa) && /onExit: yardShipFromSheet \? yardOpenSheetVessels/.test(pa)
      && /yardGo\(route\.room === 'ship' \? Object\.assign\(\{ from: 'sheet' \}, route\) : route\)/.test(pa));
check('U8: the GM ON face\'s BACK is handleBack (the GM landing); an entry\'s reads ‹ CATALOGUE (JOB 4)',
      /: yardRouteNow\.room === 'entry' \? function\(\) \{ yardGo\(\{ room: 'catalogue' \}\); \} : handleBack,/.test(gm) && /const handleBack = useCallback\(\(\) => \{\s*navTo\('landing'\);/.test(gm));
// JOB 4 (U6): the catalogue's add writes the scoped character, a character picked in "Whose ship?", or nothing (MAKE A
// CHARACTER ›) — never `char:player`
check('rider 22 (ON face): the S4 host writes no `char:player` — its owner is the scoped character, a picked one, or none',
      /var owner = yardChar \? 'char:' \+ yardChar\.id : null;/.test(pa) && !/'char:player'/.test(vv.replace(/\/\/.*$/gm, ''))
      && /add\('char:' \+ props\.character\.id, 'Acquired\.'\)/.test(vv) && /'MAKE A CHARACTER ›'/.test(vv)
      && /props\.onChoose\(function \(owner\) \{ add\(owner, 'Acquired\.'\); \}\)/.test(vv));

console.log('\n' + pass + '/' + (pass + fail) + ' ' + (fail ? 'FAILED' : 'ALL PASS'));
process.exit(fail ? 1 : 0);
