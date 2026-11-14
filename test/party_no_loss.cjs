#!/usr/bin/env node
/* test/party_no_loss.cjs — the group record survives every leg (card `release-r6-backend-card` §2 ACCEPTANCE 3, §3;
 * ruling `release-r4-shapes` R-R4S-5). Each leg writes through lib/shared/partyStore.js and reads the record BACK
 * through it from the bytes the leg left (the paper-smoke rule: read the record, not the row):
 *   N1 save → reload: a fresh store over the same bytes reads the same record, `resource` and `rankUps` included
 *   N2 backup → restore: the key is in the file (LOCAL), and a restore onto an empty device brings the party back
 *   N3 backup → restore onto a device with its own copy of `party`: merged by id, the newer `updatedAt` kept (MERGE)
 *   N4 sync, two devices: mergeAdoption unions by party id, keeps the newer stamp, and emits `{ v, parties }`
 *   N5 resolve at render: the stored party carries only R4's fields (+ R-R6PC-1's `resource`) — no derived number
 * Every leg carries one base (S4, lane D: a ranch homestead, two upgrades) and reads it back key for key; N5 also holds
 * the stored base to S4's keys (+ `focusSkill`), so no derived base number (Obligation, profit, skills) is stored.
 *
 * `node test/party_no_loss.cjs --bite` runs each mutant (on backup.js / syncMerge.js / partyStore.js) against its leg.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const FILES = { backup: 'lib/shared/backup.js', syncMerge: 'lib/shared/syncMerge.js', party: 'lib/shared/partyStore.js' };
const SRC = {};
Object.keys(FILES).forEach((k) => {
  const o = process.env['NOLOSS_' + k.toUpperCase()];
  SRC[k] = fs.readFileSync(o || path.join(ROOT, FILES[k]), 'utf8');
});

const MUTANTS = [
  ['no-local-row', 'N2', 'backup', "    ['swrpg_party_v1', 'MERGE'],\n", ''],
  ['if-empty-not-merge', 'N3', 'backup', "    ['swrpg_party_v1', 'MERGE'],", "    ['swrpg_party_v1', 'IF-EMPTY'],"],
  ['no-lists-row', 'N4', 'syncMerge', 'swrpg_party_v1: {\n      list: ', 'swrpg_party_vX: {\n      list: '],
  ['no-stamp', 'N1', 'party', 'return normalizeParty(Object.assign({}, fn(p), { updatedAt: now() }));', 'return normalizeParty(fn(p));'],
  ['derived-stored', 'N5', 'party', "    if (own(p, 'resource')) known.resource = normalizeResource(p.resource);",
    "    if (own(p, 'resource')) known.resource = normalizeResource(p.resource);\n    known.dutyTotal = 0;"],
  ['drop-bases', 'N2', 'party', 'bases: (Array.isArray(p.bases) ? p.bases : []).map(normalizeBase).filter(Boolean),', 'bases: [],'],
  ['base-derived-stored', 'N5', 'party', "    if (own(b, 'upgrades')) known.upgrades", "    known.obligation = 6;\n    if (own(b, 'upgrades')) known.upgrades"],
];

if (process.argv.includes('--bite')) {
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'party-noloss-'));
  let bad = 0;
  for (const [name, leg, file, find, repl] of MUTANTS) {
    const src = fs.readFileSync(path.join(ROOT, FILES[file]), 'utf8');
    if (src.split(find).length !== 2) { console.log('  BROKEN MUTANT ' + name); bad++; continue; }
    const f = path.join(tmp, name + '.js');
    fs.writeFileSync(f, src.replace(find, repl));
    const r = spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { ['NOLOSS_' + file.toUpperCase()]: f }), encoding: 'utf8' });
    const ok = r.status === 1 && new RegExp('FAIL  ' + leg + ' ').test(r.stdout);
    console.log((ok ? '  BIT   ' : '  MISSED') + ' ' + name.padEnd(20) + ' → ' + leg + (ok ? '' : ' (exit ' + r.status + ')\n' + (r.stdout + r.stderr).split('\n').filter((l) => /FAIL|Error/.test(l)).slice(0, 3).join('\n')));
    if (!ok) bad++;
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(bad ? bad + ' mutant(s) survived' : 'every mutant bit (' + MUTANTS.length + ')');
  process.exit(bad ? 1 : 0);
}

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ok    ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail !== undefined ? '  -> ' + JSON.stringify(detail).slice(0, 400) : '')); }
}
function guard(fn) { try { return fn(); } catch (e) { return { threw: String(e && e.message || e) }; } }

// One device: localStorage + the real modules, each in its own vm.
function device(seed) {
  const store = Object.assign({}, seed || {});
  const ls = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  const ctx = { localStorage: ls, SWRPGVersionGuard: require('../lib/shared/versionGuard.js'), console, Date, JSON, Math };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'lib/shared/recency.js'), 'utf8'), ctx, { filename: 'recency.js' });   // as the apps load it
  vm.runInContext(SRC.syncMerge, ctx, { filename: 'syncMerge.js' });
  vm.runInContext(SRC.backup, ctx, { filename: 'backup.js' });
  vm.runInContext(SRC.party, ctx, { filename: 'partyStore.js' });
  return { store, ctx, P: ctx.SWRPGParty, B: ctx.SWRPGBackup, M: ctx.SWRPGSyncMerge };
}
function party(d) { return d.P.partyOf(d.P.load()); }

// The fixture base (S4), keys only — and how a leg reads it back
const BASE = { id: 'base-noloss', type: 'HOMESTEAD', name: 'Hollow Ridge', place: 'Lothal', focus: 'BASERANCH', start: 'bought',
  upgrades: [{ key: 'HOMECORE', option: null, paid: 'credits' }, { key: 'HOMENPC', option: 'HOMENPC2', paid: 'obligation' }], notes: '' };
const S4 = ['id', 'type', 'name', 'place', 'focus', 'focusSkill', 'start', 'upgrades', 'notes'];
function baseHeld(p) {
  const b = p && Array.isArray(p.bases) && p.bases.length === 1 && p.bases[0];
  return !!b && Object.keys(BASE).every((k) => JSON.stringify(b[k]) === JSON.stringify(BASE[k]));
}

// The fixture group, written through the store's own ops.
function seedGroup(d, name, members) {
  let s = d.P.load();
  s = d.P.setName(s, name);
  (members || ['Mira']).forEach((m) => { s = d.P.addNameMember(s, m, [{ type: 'Intelligence', magnitude: 10 }], []); });
  s = d.P.setGroupRows(s, 'duty', [{ type: 'Rebel Base', magnitude: 5 }]);
  s = d.P.setResource(s, { from: 'fad', pick: 'holocron', skills: ['astrogation', 'athletics'] });
  s = d.P.addBase(s, BASE).state;
  d.P.save(s);
  return party(d);
}

// ── N1 save → reload ──
{
  const a = device();
  const p = guard(() => seedGroup(a, 'Rogue Cell'));
  const b = device(a.store);
  const q = guard(() => party(b));
  check('N1 a fresh store over the same bytes reads the same record', !!p && !!q && JSON.stringify(p) === JSON.stringify(q), [p, q]);
  check('N1 the base reads back key for key after the reload', baseHeld(q), q && q.bases);
  check('N1 the record carries a ms `updatedAt` stamp (recency.js compares it)', !!q && typeof q.updatedAt === 'number' && q.updatedAt > 1e12, q && q.updatedAt);
  const env = JSON.parse(b.store.swrpg_party_v1); env.parties[0].updatedAt = 1; b.store.swrpg_party_v1 = JSON.stringify(env);
  const c = device(b.store);
  c.P.save(c.P.setName(c.P.load(), 'Renamed'));
  const r = guard(() => party(device(c.store)));
  check('N1 every change restamps the record, so the merge carries it', !!r && r.name === 'Renamed' && r.updatedAt > 1e12, r && r.updatedAt);
}

// ── N2 backup → restore onto an empty device ──
{
  const a = device();
  seedGroup(a, 'Rogue Cell');
  const file = a.B.makeFile({ local: a.store, idb: {} }, Date.now(), 'test');
  check('N2 the backup file carries swrpg_party_v1 (backup.js LOCAL)', !!file.local.swrpg_party_v1, Object.keys(file.local));
  const b = device();
  const p = guard(() => b.B.plan(b.B.readFile(JSON.stringify(file)).file, { local: b.store, idb: {} }));
  Object.keys((p && p.local) || {}).forEach((k) => { b.store[k] = p.local[k]; });
  const got = guard(() => party(device(b.store)));
  check('N2 a restore onto an empty device brings the party back, read through the store', !!got && got.name === 'Rogue Cell'
    && got.resource && got.resource.pick === 'holocron' && got.members.length === 1, got);
  check('N2 the restore brings the base back key for key', baseHeld(got), got && got.bases);
}

// ── N3 backup → restore onto a device with its own copy ──
{
  const a = device();
  seedGroup(a, 'Rogue Cell (newer)', ['Mira', 'Vel']);
  const b = device();
  seedGroup(b, 'Rogue Cell (older)');
  const envB = JSON.parse(b.store.swrpg_party_v1); envB.parties[0].updatedAt = 1700000000000; b.store.swrpg_party_v1 = JSON.stringify(envB);
  const file = a.B.makeFile({ local: a.store, idb: {} }, Date.now(), 'test');
  const p = guard(() => b.B.plan(b.B.readFile(JSON.stringify(file)).file, { local: b.store, idb: {} }));
  Object.keys((p && p.local) || {}).forEach((k) => { b.store[k] = p.local[k]; });
  const got = guard(() => party(device(b.store)));
  check('N3 a restore over this device\'s own copy merges by id: the newer stamp is kept', !!got && got.name === 'Rogue Cell (newer)' && got.members.length === 2, got);
  check('N3 the kept record carries its base', baseHeld(got), got && got.bases);
}

// ── N4 sync: two devices ──
{
  const a = device(), b = device();
  seedGroup(a, 'Left'); seedGroup(b, 'Right');
  const ea = JSON.parse(a.store.swrpg_party_v1), eb = JSON.parse(b.store.swrpg_party_v1);
  ea.parties[0].updatedAt = 1800000000000; eb.parties[0].updatedAt = 1700000000000;
  eb.parties.push({ id: 'party_2', name: 'Second cell', members: [], duty: [], obligation: [], rank: 0, rankUps: [], bases: [], updatedAt: 1700000000000 });
  const r = guard(() => a.M.mergeAdoption({ swrpg_party_v1: ea }, { swrpg_party_v1: eb }));
  const m = r && r.merged && r.merged.swrpg_party_v1;
  check('N4 the merge emits the store\'s envelope { v, parties }', !!m && m.v === 1 && Array.isArray(m.parties), m);
  const byId = {}; ((m && m.parties) || []).forEach((p) => { byId[p.id] = p; });
  check('N4 unioned by party id: both groups present', !!byId.party && !!byId.party_2, m);
  check('N4 the same id on both devices: the newer `updatedAt` wins, no conflict prompt', !!byId.party && byId.party.name === 'Left'
    && !((r && r.conflicts) || []).some((c) => c.key === 'swrpg_party_v1'), [byId.party, r && r.conflicts]);
  const c = device({ swrpg_party_v1: JSON.stringify(m) });
  check('N4 the merged bytes read back through the store', guard(() => c.P.load().parties.length) === 2);
  check('N4 the merged group reads its base back through the store', baseHeld(guard(() => c.P.partyOf(c.P.load(), 'party'))));
}

// ── N5 resolve at render: only the save shape's fields are stored ──
{
  const a = device();
  seedGroup(a, 'Rogue Cell');
  const env = JSON.parse(a.store.swrpg_party_v1);
  const R4 = ['id', 'name', 'members', 'duty', 'obligation', 'rank', 'rankUps', 'bases', 'updatedAt', 'resource'];
  const extra = Object.keys(env.parties[0]).filter((k) => R4.indexOf(k) === -1);
  check('N5 the stored party holds only R-R4S-4\'s fields and R-R6PC-1\'s `resource`', extra.length === 0, extra);
  const bx = (env.parties[0].bases || []).flatMap((b) => Object.keys(b).filter((k) => S4.indexOf(k) === -1));
  const ux = (env.parties[0].bases || []).flatMap((b) => (b.upgrades || []).flatMap((u) => Object.keys(u).filter((k) => ['key', 'option', 'paid'].indexOf(k) === -1)));
  check('N5 the stored base holds only S4\'s keys (+ focusSkill), its upgrades only { key, option, paid }', env.parties[0].bases.length === 1 && !bx.length && !ux.length, [bx, ux]);
  check('N5 the envelope holds only { v, parties }', JSON.stringify(Object.keys(env).sort()) === JSON.stringify(['parties', 'v']), Object.keys(env));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
