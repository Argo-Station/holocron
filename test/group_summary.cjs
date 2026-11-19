#!/usr/bin/env node
/* test/group_summary.cjs — lib/shared/groupSummary.js, the group summary produced once on the GM's device (ruling
 * `between-sessions-lap-a-card` §3 item 3; shape `encounters-t2-shapes` §3 N-4; R-BSPD-1; R-BSBP-2).
 * The REAL roster, party store, baseDerive and vessel store run in a vm over a seeded localStorage.
 *   G1  of() is exactly N-4's shape; Duty is partyStore's dutyParts / rankProgress; a group the device lacks reads null
 *   G2  THE ONE OBLIGATION TOTAL · obligation() = the members' sheets + a name stub's rows + the group's rows
 *       (partyStore.obligationParts, the same reader as Duty) + each base's Obligation (baseDerive), and its total is
 *       the sum of its parts
 *   G3  no second sum · no product source (lib/, gm/, player/, dice/; built bundles skipped) totals Obligation
 *       anywhere but groupSummary.obligation (a second sum reds here)
 *   G4  ship(), R-BSBP-2 + build-paper ADDENDUM 1 · a group-owned unit's flagship first, else the newest live vessel by
 *       createdAt through recency newerOf, a tie to the greater id; an edited older vessel stays older (retired
 *       and destroyed skipped), else null; another owner's ship never; the name is the nickname, else the library's
 *   G5  of() writes nothing; the GM shell tags it before tableSession, the player shell never
 * `node test/group_summary.cjs --bite` runs each mutant on a COPY; exit 1 if one survives.
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), os = require('os');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const SRC = process.env.GS_SRC || path.join(ROOT, 'lib/shared/groupSummary.js');
const SCAN = process.env.GS_SCAN || ROOT;   // G3's tree (a bite plants a second sum in a copy)
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const MUTANTS = [
  ['no-base-obligation', 'G2', 'if (o.total) parts.push(', 'if (false) parts.push('],
  ['duty-not-obligation', 'G2', 'Pa.obligationParts(party, chars)', 'Pa.dutyParts(party, chars)'],
  ['total-not-parts', 'G2', 'return { total: parts.reduce(function (n, x) { return n + num(x.value); }, 0), parts: parts };', 'return { total: 0, parts: parts };'],
  ['no-flagship-first', 'G4', 'units.some(function (u) {', '[].some(function (u) {'],
  ['retired-counts', 'G4', 'v.owner === gid && !v.retired && !v.destroyed', 'v.owner === gid'],
  ['oldest-first', 'G4', "return n === 'a' || (n === null", "return n === 'b' || (n === null"],
  ['tie-lesser-id', 'G4', 'String(v.id) > String(best.id)', 'String(v.id) < String(best.id)'],
  ['order-by-updatedAt', 'G4', 'Rc.newerOf(v.createdAt, best.createdAt)', 'Rc.newerOf(v.updatedAt, best.updatedAt)'],
  ['any-owner', 'G4', 'units = ((json(UNITS_KEY, {}) || {}).units || []).filter(function (u) { return u && u.owner === gid &&', 'units = ((json(UNITS_KEY, {}) || {}).units || []).filter(function (u) { return u &&'],
  ['shape-extra', 'G1', '      ship: ship(party.id),\n', '      ship: ship(party.id), members: party.members,\n'],
];
if (process.argv.includes('--bite')) {
  let bad = 0; const src = fs.readFileSync(SRC, 'utf8');
  const run = (env, leg, name) => {
    const r = spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, env), encoding: 'utf8' });
    const ok = r.status === 1 && new RegExp('FAIL  ' + leg + ' ').test(r.stdout);
    console.log((ok ? '  BIT   ' : '  MISSED') + ' ' + name.padEnd(22) + ' → ' + leg + (ok ? '' : ' (exit ' + r.status + ')'));
    if (!ok) bad++;
  };
  for (const [name, leg, find, repl] of MUTANTS) {
    if (src.split(find).length !== 2) { console.log('  BROKEN MUTANT ' + name); bad++; continue; }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gsum-')), f = path.join(tmp, 'groupSummary.js');
    fs.writeFileSync(f, src.replace(find, repl));
    run({ GS_SRC: f }, leg, name);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  // a second Obligation sum, planted in a copy of one product file G3 scans
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gsum-scan-'));
  fs.mkdirSync(path.join(tmp, 'lib/shared'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'lib/shared/campaignsView.jsx'), read('lib/shared/campaignsView.jsx') + "\nconst oblTotal = (p) => (p.obligation || []).reduce((n, r) => n + r.magnitude, 0);\n");
  run({ GS_SCAN: tmp }, 'G3', 'second-obligation-sum');
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(bad ? bad + ' mutant(s) survived' : 'every mutant bit (' + (MUTANTS.length + 1) + ')');
  process.exit(bad ? 1 : 0);
}

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ok    ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail !== undefined ? '  -> ' + JSON.stringify(detail).slice(0, 400) : '')); }
}
function leg(name, fn) { try { fn(); } catch (e) { check(name + ' threw: ' + (e && e.stack), false); } }
const J = (x) => JSON.stringify(x);
const BASES = JSON.parse(read('public/data/canonical/bases.json'));

function world(seed, fetched) {
  const store = Object.assign({}, seed || {}), writes = [];
  const ls = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { writes.push(k); store[k] = String(v); }, removeItem: (k) => { writes.push(k); delete store[k]; } };
  const ctx = { console, JSON, Math, Date, Object, Array, String, Number, Boolean, isFinite, Promise, RegExp, Error, localStorage: ls, CharResolve: {},
    crypto: { randomUUID: () => 'u1', getRandomValues: (a) => a } };
  ctx.fetch = (u) => { (fetched || []).push(u); return new Promise(() => {}); };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['lib/shared/recency.js', 'lib/shared/versionGuard.js', 'lib/shared/recordPortrait.js', 'lib/shared/roster.js', 'lib/shared/partyStore.js', 'lib/shared/baseDerive.js', 'lib/shared/vesselStore.js'])
    if (fs.existsSync(path.join(ROOT, f))) vm.runInContext(read(f), ctx, { filename: f });
  vm.runInContext(fs.readFileSync(SRC, 'utf8'), ctx, { filename: 'groupSummary.js' });
  return { ctx, store, writes, G: ctx.SWRPGGroupSummary, P: ctx.SWRPGParty };
}
const charRec = (id, name, sheet) => ({ id, name, species: 'Human', career: 'Smuggler', book: 'eote', source: 'test', selectedChar: { id, name }, sheetData: Object.assign({ name }, sheet), updatedAt: 1 });
const PID = 'party_abc';
function seeded(extra) {
  const party = { id: PID, name: 'The Ghost Crew', members: [{ who: 'char:kael', last: 'Kael' }, { who: 'char:lyra', last: 'Lyra' },
    { who: 'name:Mira', duty: [{ type: 'Combat Victory', magnitude: 10 }], obligation: [{ type: 'Debt', magnitude: 5 }] }],
    duty: [{ type: 'Resource Acquisition', magnitude: 5 }], obligation: [{ type: 'Bounty', magnitude: 3 }], rank: 1, rankUps: [],
    bases: [{ id: 'base-1', type: 'HOMESTEAD', name: 'Hideout', place: '', focus: '', start: 'bought', upgrades: [], notes: '' }], resource: null, updatedAt: 1 };
  const chars = [charRec('kael', 'Kael Voss', { obligation: { type: 'Debt', value: 10, entries: [{ type: 'Debt', magnitude: 10 }] }, duty: { type: 'Combat Victory', value: 40 } }),
    charRec('lyra', 'Lyra', { obligation: { type: 'Family', value: 7 } })];
  return Object.assign({ swrpg_party_v1: J({ v: 1, parties: [party] }), swrpg_saved_characters: J({ version: 1, characters: chars }) }, extra || {});
}
const CAMP = { id: 'camp_g', role: 'gm', name: 'Outer Rim', partyId: PID };

leg('G1', () => {
  const w = world(seeded());
  w.P.engineReader();
  const s = w.G.of(CAMP, 42);
  check('G1 of() is exactly N-4\'s shape', s && J(Object.keys(s)) === J(['at', 'duty', 'obligation', 'rank', 'toNext', 'bases', 'resource', 'ship']) && s.at === 42
    && J(Object.keys(s.duty)) === J(['total', 'parts']) && J(Object.keys(s.obligation)) === J(['total', 'parts']), s);
  const party = w.P.partyOf(w.P.load(), PID), pr = w.P.rankProgress(party);
  check('G1 Duty is partyStore\'s: total, rank and toNext from rankProgress, parts from dutyParts as { name, value }', s.duty.total === pr.total && s.duty.total === 55
    && s.rank === 1 && s.toNext === pr.toNext && J(s.duty.parts) === J(w.P.dutyParts(party).map((x) => ({ name: x.name, value: x.magnitude }))), s.duty);
  check('G1 bases by name; no ship yet reads null', J(s.bases) === J(['Hideout']) && s.ship === null, s);
  check('G1 a campaign whose group is not on this device reads null', w.G.of({ id: 'c', partyId: 'party_none' }, 1) === null && w.G.of({ id: 'c', partyId: null }, 1) === null);
});
leg('G2', () => {
  const w = world(seeded());
  const party = w.P.partyOf(w.P.load(), PID);
  const o = w.G.obligation(party, undefined, BASES);
  const want = [{ name: 'Kael Voss', value: 10, type: 'Debt' }, { name: 'Lyra', value: 7, type: 'Family' }, { name: 'Mira', value: 5, type: 'Debt' },
    { name: 'The Ghost Crew', value: 3, type: 'Bounty' }, { name: 'Hideout', value: 5, type: '' }];
  check('G2 the parts: sheets (rows or value), the stub\'s rows, the group\'s rows, then the base (Far Horizons\' 5)', J(o.parts) === J(want), o.parts);
  check('G2 the total is the parts\' sum (30)', o.total === 30 && o.total === o.parts.reduce((n, x) => n + x.value, 0), o);
  check('G2 with no bases registry the base adds nothing', w.G.obligation(party, undefined, null).total === 25);
});
leg('G3', () => {
  const files = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (!['node_modules', 'vendor', 'fixtures'].includes(e.name)) walk(p); }
    else if (/\.(jsx?|mjs)$/.test(e.name) && !/\.min\.js$/.test(e.name)) files.push(p);
  } };
  for (const d of ['lib', 'gm', 'player', 'dice']) if (fs.existsSync(path.join(SCAN, d))) walk(path.join(SCAN, d));
  const built = new Set(['player/app.js', 'gm/app.js', 'vendor.js', 'player/creator.js', 'player/sheet.js']);
  const hits = [];
  for (const f of files) {
    const rel = path.relative(SCAN, f);
    if (built.has(rel) || rel === 'lib/shared/groupSummary.js') continue;
    if (/\.js$/.test(rel) && fs.existsSync(f + 'x')) continue;   // a built sibling of a .jsx source
    fs.readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
      if (/obligation/i.test(l) && /\.reduce\(/.test(l) && !/^\s*(\/\/|\*)/.test(l)) hits.push(rel + ':' + (i + 1));
    });
  }
  check('G3 no product source totals Obligation outside groupSummary.obligation (' + files.length + ' files read)', files.length > 50 && hits.length === 0, hits);
});
const VKEY = 'swrpg_vessels_v1';
const T0 = 1.7e12;   // ms stamps (recency's floor)
const vessel = (id, owner, at, extra) => Object.assign({ v: 3, id, vehicleKey: 'YT1300', owner, nickname: null, acquired: { when: '2026-11-0' + (at % 9), note: '' }, createdAt: T0 + at, updatedAt: T0 + at }, extra || {});
leg('G4', () => {
  const ship = (vessels, units, names) => { const fetched = []; const w = world(seeded(Object.assign({ [VKEY]: J({ v: 3, vessels }) }, units ? { swrpg_fleet_units_v1: J({ v: 1, units }) } : {})), fetched);
    return { s: w.G.ship(PID), fetched }; };
  check('G4 no group vessel reads null', ship([vessel('v1', 'party', 9)]).s === null);
  const newest = ship([vessel('v1', PID, 1, { nickname: 'Old Hope' }), vessel('v2', PID, 5, { nickname: 'Ghost' }), vessel('v3', PID, 9, { nickname: 'Wreck', destroyed: { state: 'lost', when: null } }), vessel('v4', PID, 8, { nickname: 'Shelved', retired: { when: null } }), vessel('v5', 'char:kael', 10, { nickname: 'Mine' })]).s;
  check('G4 the newest live group vessel by createdAt; retired, destroyed and another owner\'s skipped', J(newest) === J({ name: 'Ghost' }), newest);
  const edited = ship([vessel('v1', PID, 1, { nickname: 'Old Hope', updatedAt: T0 + 99 }), vessel('v2', PID, 5, { nickname: 'Ghost' })]).s;
  check('G4 an edited older vessel stays older (createdAt, never updatedAt)', J(edited) === J({ name: 'Ghost' }), edited);
  const tie = ship([vessel('v_b', PID, 5, { nickname: 'Bee' }), vessel('v_c', PID, 5, { nickname: 'Cee' }), vessel('v_a', PID, 5, { nickname: 'Ay' })]).s;
  check('G4 a createdAt tie goes to the greater id, in any order', J(tie) === J({ name: 'Cee' }), tie);
  const flag = ship([vessel('v1', PID, 1, { nickname: 'Flag' }), vessel('v2', PID, 5, { nickname: 'Newer' })], [{ id: 'u1', owner: PID, flagship: 'v1', members: ['v1', 'v2'] }, { id: 'u2', owner: 'party', flagship: 'v2', members: [] }]).s;
  check('G4 a fleet unit the group owns: its flagship first', J(flag) === J({ name: 'Flag' }), flag);
  const other = ship([vessel('v1', PID, 1, { nickname: 'Mine' }), vessel('v2', 'party', 5, { nickname: 'Legacy' })], [{ id: 'u2', owner: 'party', flagship: 'v2', members: [] }]).s;
  check('G4 another group\'s unit is never read', J(other) === J({ name: 'Mine' }), other);
  const named = ship([vessel('v1', PID, 1)]);
  check('G4 no nickname: the library name is asked for once (the vehicleKey until it lands)', J(named.s) === J({ name: 'YT1300' }) && named.fetched.filter((u) => /vehicle-library\/index\.json$/.test(u)).length === 1, named);
});
leg('G5', () => {
  const w = world(seeded());
  w.writes.length = 0;
  w.G.of(CAMP, 1);
  check('G5 of() writes nothing', w.writes.length === 0, w.writes);
  const gm = read('gm/index.html'), pl = read('player/index.html');
  check('G5 the GM shell tags it before tableSession; the player shell never', gm.indexOf('/lib/shared/groupSummary.js') !== -1 && gm.indexOf('/lib/shared/groupSummary.js') < gm.indexOf('/lib/shared/tableSession.js') && !pl.includes('groupSummary.js'));
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
