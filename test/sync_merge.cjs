#!/usr/bin/env node
/**
 * sync_merge.cjs — the adoption merge, the moment with data-loss stakes.
 * Ruling `f34-phase-b-scope` §3 (F-B1 (d) + (c)), C-B-1 (tombstone interlock), C-B-8.3 (recency).
 *
 * The scenario every test here is about: characters built on a laptop while signed out, an account
 * that already holds characters from a phone, and a sign-in. The merge must keep both sides, must
 * not resurrect anything the person deleted, and must ASK rather than guess whenever it cannot tell
 * which version of the same record is newer.
 *
 * Most of these asserts are about the refusing. Picking a winner correctly is easy; the failure
 * that costs somebody their work is picking one when you had no evidence.
 *
 * Since SHIP YARD S3 (ruling `shipyard-s3-contracts` R-S3K-1): the merge emits the HIGHER envelope
 * for every list key, and B3 and V-4 are driven end to end through sync.js into the vessel store.
 */
const M = require('../lib/shared/syncMerge.js');

let pass = 0, fail = 0;
const check = (label, cond, detail) => {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (detail !== undefined ? '  -> ' + JSON.stringify(detail) : '')); }
};
const MS = 1786000000000;
const roster = (chars) => ({ version: 1, characters: chars });
const ids = (env) => (env.characters || []).map((c) => c.id);

console.log('sync_merge — the adoption merge\n');

// ── the headline: nothing disappears ─────────────────────────────────────────
{
  const local = { swrpg_saved_characters: roster([{ id: 'a', name: 'Laptop A' }, { id: 'b', name: 'Laptop B' }]) };
  const remote = { swrpg_saved_characters: roster([{ id: 'c', name: 'Phone C' }]) };
  const r = M.mergeAdoption(local, remote);
  check('disjoint rosters UNION — all three survive',
    ids(r.merged.swrpg_saved_characters).sort().join() === 'a,b,c', ids(r.merged.swrpg_saved_characters));
  check('and nobody is asked anything', r.conflicts.length === 0, r.conflicts);
}

// ── the same record, changed in two places ───────────────────────────────────
{
  const local = { swrpg_saved_characters: roster([{ id: 'a', name: 'Older', updatedAt: MS }]) };
  const remote = { swrpg_saved_characters: roster([{ id: 'a', name: 'Newer', updatedAt: MS + 5000 }]) };
  const r = M.mergeAdoption(local, remote);
  check('both stamps ms → the newer record wins, no prompt',
    r.merged.swrpg_saved_characters.characters[0].name === 'Newer' && r.conflicts.length === 0);
}
{
  const local = { swrpg_saved_characters: roster([{ id: 'a', name: 'L', updatedAt: MS }]) };
  const remote = { swrpg_saved_characters: roster([{ id: 'a', name: 'R' }]) };
  const r = M.mergeAdoption(local, remote);
  check('one side has NO stamp → refuses to choose, and asks',
    r.conflicts.length === 1 && r.conflicts[0].id === 'a' && r.conflicts[0].kind === 'record');
  check('...and keeps LOCAL provisionally, so nothing changes under the person before they answer',
    r.merged.swrpg_saved_characters.characters[0].name === 'L');
}
{
  const local = { swrpg_saved_characters: roster([{ id: 'a', name: 'L', updatedAt: '2026-08-06' }]) };
  const remote = { swrpg_saved_characters: roster([{ id: 'a', name: 'R', updatedAt: '2026-08-05' }]) };
  const r = M.mergeAdoption(local, remote);
  check('legacy DAY-STRING stamps are refused, not mis-ordered', r.conflicts.length === 1);
}
{
  const local = { swrpg_saved_characters: roster([{ id: 'a', name: 'L', updatedAt: MS }]) };
  const remote = { swrpg_saved_characters: roster([{ id: 'a', name: 'R', updatedAt: MS }]) };
  const r = M.mergeAdoption(local, remote);
  check('an exact TIE is a conflict, not a coin toss', r.conflicts.length === 1);
}
{
  const rec = { id: 'a', name: 'Same', updatedAt: MS };
  const r = M.mergeAdoption(
    { swrpg_saved_characters: roster([rec]) },
    { swrpg_saved_characters: roster([JSON.parse(JSON.stringify(rec))]) });
  check('identical records are not a conflict even with equal stamps', r.conflicts.length === 0);
}

// ── R-B1173C-8 (card f100-b1173-card ADDENDUM 1): copies that differ ONLY in lastOpenedAt ──────────────
// The relaunch re-opens the last sheet and stamps lastOpenedAt before adoption reads, so the two copies differ in a
// "last looked at" time and nothing else — no content to choose between. That merges silently to the later stamp
// (a present stamp beats a missing one). recency.js is untouched: lastOpenedAt still never ranks an EDIT, so a copy
// differing in lastOpenedAt AND anything else still asks (the control).
{
  const base = { id: 'a', name: 'Kessa', updatedAt: MS, sheetData: { xp: { total: 110 } } };
  const at = (lo) => Object.assign(JSON.parse(JSON.stringify(base)), lo == null ? {} : { lastOpenedAt: lo });
  const run = (l, r) => M.mergeAdoption({ swrpg_saved_characters: roster([l]) }, { swrpg_saved_characters: roster([r]) });
  const kept = (res) => res.merged.swrpg_saved_characters.characters[0];
  let res = run(at(MS + 10), at(MS + 20));
  check('R-B1173C-8 only lastOpenedAt differs, the account\'s later → no question, the later stamp kept',
    res.conflicts.length === 0 && kept(res).lastOpenedAt === MS + 20, { c: res.conflicts.length, kept: kept(res) });
  res = run(at(MS + 30), at(MS + 20));
  check('R-B1173C-8 only lastOpenedAt differs, this device\'s later → no question, the later stamp kept',
    res.conflicts.length === 0 && kept(res).lastOpenedAt === MS + 30, { c: res.conflicts.length, kept: kept(res) });
  res = run(at(null), at(MS + 20));
  check('R-B1173C-8 a present stamp beats a missing one (this device never opened it) → no question',
    res.conflicts.length === 0 && kept(res).lastOpenedAt === MS + 20, { c: res.conflicts.length, kept: kept(res) });
  res = run(at(MS + 20), at(null));
  check('R-B1173C-8 …and the other way round (the account copy carries no stamp) → no question, this device\'s kept',
    res.conflicts.length === 0 && kept(res).lastOpenedAt === MS + 20, { c: res.conflicts.length, kept: kept(res) });
  const other = at(MS + 20); other.sheetData.xp.total = 115;
  res = run(at(MS + 10), other);
  check('R-B1173C-8 CONTROL: lastOpenedAt AND one other field differ (same updatedAt) → still a question',
    res.conflicts.length === 1 && res.conflicts[0].id === 'a', res.conflicts);
  const renamed = at(MS + 20); renamed.name = 'Kess';
  res = run(at(MS + 10), renamed);
  check('R-B1173C-8 CONTROL: …a renamed copy too → still a question', res.conflicts.length === 1, res.conflicts);
}

// ── C-B-1: the tombstone interlock ───────────────────────────────────────────
{
  const local = { swrpg_saved_characters: roster([{ id: 'a' }]), swrpg_deleted_ids: ['b'] };
  const remote = { swrpg_saved_characters: roster([{ id: 'a' }, { id: 'b', name: 'Deleted on the laptop' }]) };
  const r = M.mergeAdoption(local, remote);
  check('C-B-1 a character deleted here is NOT resurrected by the other device\'s older copy',
    ids(r.merged.swrpg_saved_characters).join() === 'a', ids(r.merged.swrpg_saved_characters));
}
{
  const local = { swrpg_saved_characters: roster([{ id: 'x' }]), swrpg_deleted_ids: ['p'] };
  const remote = { swrpg_saved_characters: roster([{ id: 'x' }]), swrpg_deleted_ids: ['q'] };
  const r = M.mergeAdoption(local, remote);
  check('C-B-1 tombstones UNION — neither device\'s deletions are discarded',
    r.merged.swrpg_deleted_ids.sort().join() === 'p,q', r.merged.swrpg_deleted_ids);
}
{
  // The ordering half of C-B-1: union first, tombstones after. If tombstones were applied to each
  // side BEFORE the union, a record deleted on one device but still live on the other would come
  // back through the union.
  const local = { swrpg_saved_characters: roster([{ id: 'keep' }]), swrpg_deleted_ids: ['gone'] };
  const remote = { swrpg_saved_characters: roster([{ id: 'keep' }, { id: 'gone' }]), swrpg_deleted_ids: [] };
  const r = M.mergeAdoption(local, remote);
  check('C-B-1 tombstones are applied AFTER the union, not before',
    ids(r.merged.swrpg_saved_characters).indexOf('gone') === -1);
}

// ── every list-shaped key, not just the roster ───────────────────────────────
{
  const r = M.mergeAdoption(
    { swrpg_npc_cast: { version: 1, npcs: [{ _source_key: 'custom:1', name: 'L' }] },
      swrpg_npc_bench: { version: 6, groups: [{ id: 'g1' }] },
      swrpg_vessels_v1: { v: 2, vessels: [{ id: 'v1' }] },
      swrpg_fleet_units_v1: { v: 1, units: [{ id: 'u_l', name: 'Red Squadron', members: ['v1'] }, { id: 'u_both', name: 'L' }] } },
    { swrpg_npc_cast: { version: 1, npcs: [{ _source_key: 'custom:2', name: 'R' }] },
      swrpg_npc_bench: { version: 6, groups: [{ id: 'g2' }] },
      swrpg_vessels_v1: { v: 2, vessels: [{ id: 'v2' }] },
      swrpg_fleet_units_v1: { v: 1, units: [{ id: 'u_r', name: 'Gold Squadron', members: ['v2'] }, { id: 'u_both', name: 'R' }] } });
  check('npc_cast unions on its own id field (_source_key, not id)',
    r.merged.swrpg_npc_cast.npcs.length === 2);
  check('npc_bench unions by group id', r.merged.swrpg_npc_bench.groups.length === 2);
  check('vessels union by id', r.merged.swrpg_vessels_v1.vessels.length === 2);
  // K5's ratified guard row (R-S3K-5; S4 JOB 2, R-S4G-17): "units union by id" — its own key, its own envelope.
  const units = r.merged.swrpg_fleet_units_v1;
  check('K5: fleet units union by id (u_l + u_r + one u_both), in their own { v, units } envelope',
    units && units.v === 1 && Array.isArray(units.units) && units.units.map((u) => u.id).sort().join() === 'u_both,u_l,u_r', units);
  check('each key keeps its OWN envelope shape (version vs v)',
    r.merged.swrpg_npc_bench.version === 6 && r.merged.swrpg_vessels_v1.v === 2);
}

// ── whole-envelope keys ──────────────────────────────────────────────────────
{
  const r = M.mergeAdoption({ swrpg_mods: ['a'] }, { swrpg_mods: ['a'] });
  check('identical whole-envelope keys are not a conflict', r.conflicts.length === 0);
}
{
  const r = M.mergeAdoption({ swrpg_mods: ['a'] }, { swrpg_mods: ['b'] });
  check('differing whole-envelope keys go to the prompt',
    r.conflicts.length === 1 && r.conflicts[0].kind === 'envelope' && r.conflicts[0].key === 'swrpg_mods');
  check('...keeping local provisionally', r.merged.swrpg_mods[0] === 'a');
}
{
  const r = M.mergeAdoption({}, { swrpg_active_sources: { version: 2, override: {} } });
  check('a key only the account has is adopted with no question',
    !!r.merged.swrpg_active_sources && r.conflicts.length === 0);
}

// ── the legacy shape still in every existing browser ─────────────────────────
{
  const r = M.mergeAdoption(
    { swrpg_saved_characters: [{ id: 'bare' }] },              // pre-envelope bare array
    { swrpg_saved_characters: roster([{ id: 'env' }]) });
  check('a LEGACY bare-array roster merges with an enveloped one',
    ids(r.merged.swrpg_saved_characters).sort().join() === 'bare,env', r.merged.swrpg_saved_characters);
  check('...and is re-emitted as an envelope', r.merged.swrpg_saved_characters.version === 1);
}

// ── degenerate input must not throw ──────────────────────────────────────────
{
  check('empty on both sides is a no-op, not a crash',
    M.mergeAdoption({}, {}).conflicts.length === 0);
  check('null input is tolerated', M.mergeAdoption(null, null).merged.swrpg_deleted_ids.length === 0);
  const r = M.mergeAdoption({ swrpg_saved_characters: roster([{ name: 'no id' }]) }, {});
  check('a record with NO id is dropped rather than merged blindly',
    r.merged.swrpg_saved_characters.characters.length === 0);
}

// ── C-CP-2: the conflict carries BOTH SIDES (ruling f34-conflict-prompt §3b) ──
// Without this the prompt knows a record was ambiguous and nothing about what the choice is
// between — and this is the only moment both versions are in hand, because a beat later the
// merge has dropped one and the push has overwritten the other.
{
  const mine = { id: 'kira', name: 'Kira (laptop)' };          // no updatedAt on either side,
  const theirs = { id: 'kira', name: 'Kira (phone)' };         // so recency REFUSES -> conflict
  const r = M.mergeAdoption(
    { swrpg_saved_characters: roster([mine]) },
    { swrpg_saved_characters: roster([theirs]) });
  check('C-CP-2 setup: this really is a conflict (non-vacuous)',
    r.conflicts.length === 1 && r.conflicts[0].kind === 'record', r.conflicts);
  const c = r.conflicts[0];
  check('C-CP-2 record: the conflict carries THIS DEVICE\'s version',
    c.local && c.local.name === 'Kira (laptop)', c.local);
  check('C-CP-2 record: ...and the ACCOUNT\'s version, the one the merge did not keep',
    c.remote && c.remote.name === 'Kira (phone)', c.remote);
  check('C-CP-2 record: it still says WHICH record, so the prompt can name it',
    c.key === 'swrpg_saved_characters' && c.id === 'kira', c);
}
{
  // The whole-envelope half — the ORDINARY case. Four keys conflict on any difference at all,
  // and "different books switched on" is near-certain on a second device's first sign-in.
  const r = M.mergeAdoption(
    { swrpg_active_sources: ['eote', 'aor', 'fad'] },
    { swrpg_active_sources: ['eote'] });
  check('C-CP-2 setup: a whole-envelope difference is a conflict by construction',
    r.conflicts.length === 1 && r.conflicts[0].kind === 'envelope', r.conflicts);
  const c = r.conflicts[0];
  check('C-CP-2 envelope: both sides ride it, so the prompt can say "3 books here, 1 there"',
    c.local.join() === 'eote,aor,fad' && c.remote.join() === 'eote', c);
}
{
  // The payload must not appear where there is no question — a conflict-shaped object on a clean
  // merge would put a prompt in front of somebody who has nothing to answer.
  const r = M.mergeAdoption(
    { swrpg_active_sources: ['eote'] },
    { swrpg_active_sources: ['eote'] });
  check('C-CP-2: identical sides raise NO conflict and therefore carry no payload',
    r.conflicts.length === 0, r.conflicts);
}

// ════ SHIP YARD S3 · JOB 2 — card `shipyard-s3-reader-first` (ruling `shipyard-s3-contracts` R-S3K-1 (b)) ════
// B3: the merge wrapped the union in the LOCAL envelope, so a device on an older build that adopted a
// newer build's account wrote the newer records under its own, lower version, and its store's
// version-ahead sentinel never saw the higher number. For EVERY list key the higher envelope is now
// emitted. Each key's version field and current version are written out here from its own store
// (roster `version` 1, player/app.jsx · cast `version` 1, castStore.js · bench `version` 6,
// benchStore.js · vessels `v` 3 since S3 JOB 3, vesselStore.js), never read back from the module under test.
const ENVELOPES = {
  swrpg_saved_characters: { ver: 'version', now: 1, list: 'characters', id: 'id', ownKeys: false },   // its emit rebuilds
  swrpg_npc_cast: { ver: 'version', now: 1, list: 'npcs', id: '_source_key', ownKeys: true },
  swrpg_npc_bench: { ver: 'version', now: 6, list: 'groups', id: 'id', ownKeys: true },
  swrpg_vessels_v1: { ver: 'v', now: 3, list: 'vessels', id: 'id', ownKeys: true },
  swrpg_fleet_units_v1: { ver: 'v', now: 1, list: 'units', id: 'id', ownKeys: true },   // K5 text: { v: 1, units }
  // R-R4S-4/5 (the group record, R6 lane A): `{ v: 1, parties }`, partyStore.js SCHEMA_V 1. Row owed by (b)'s pin.
  swrpg_party_v1: { ver: 'v', now: 1, list: 'parties', id: 'id', ownKeys: true },
  // E6 plumbing (ruling `encounters-e6-plumbing` ADDENDUM 1, C2): `{ version: 1, campaigns }`, campaignStore.js SCHEMA_V 1. Row owed by (b)'s pin.
  swrpg_campaigns: { ver: 'version', now: 1, list: 'campaigns', id: 'id', ownKeys: true },
};
check('(b) pin — this table covers every list key the merge knows (a new list key owes a row here)',
  Object.keys(ENVELOPES).sort().join() === Object.keys(M.LISTS).sort().join(), Object.keys(M.LISTS));
Object.keys(ENVELOPES).forEach((key) => {
  const d = ENVELOPES[key];
  const env = (ver, id, extra) => Object.assign({ [d.ver]: ver, [d.list]: [{ [d.id]: id }] }, extra || {});
  const run = (l, r) => {
    const local = {}, remote = {};
    if (l) local[key] = l;
    if (r) remote[key] = r;
    return M.mergeAdoption(local, remote).merged[key];
  };
  const up = run(env(d.now, 'l1'), env(d.now + 1, 'r1'));
  check(`(b) ${key}: ${d.ver} ${d.now} here, ${d.now + 1} on the account → the merge emits ${d.now + 1}`,
    up[d.ver] === d.now + 1, up);
  check(`(b) ${key}: control — …around the union of both sides`, up[d.list].length === 2, up[d.list]);
  if (d.ownKeys) {
    const whole = run(env(d.now, 'l1', { mine: 1 }), env(d.now + 1, 'r1', { theirs: 'newer' }));
    check(`(b) ${key}: the higher envelope is emitted WHOLE — a newer build's envelope key rides with its number`,
      whole.theirs === 'newer' && whole[d.ver] === d.now + 1, whole);
  }
  // Controls: the three cases the ruling keeps exactly as they were.
  const down = run(env(d.now + 1, 'l1'), env(d.now, 'r1'));
  check(`(b) ${key}: control — a HIGHER local is still the one emitted`, down[d.ver] === d.now + 1, down);
  const eq = run(env(d.now, 'l1', { mine: 1 }), env(d.now, 'r1', { theirs: 1 }));
  check(`(b) ${key}: control — equal versions are unchanged: ${d.now}, around the local envelope`,
    eq[d.ver] === d.now && (!d.ownKeys || (eq.mine === 1 && eq.theirs === undefined)), eq);
  const onlyL = run(env(d.now, 'l1'), null), onlyR = run(null, env(d.now + 1, 'r1'));
  check(`(b) ${key}: control — a one-sided key is unchanged: each side's own envelope`,
    onlyL[d.ver] === d.now && onlyR[d.ver] === d.now + 1, { onlyL, onlyR });
});
{
  const r = M.mergeAdoption(
    { swrpg_saved_characters: [{ id: 'bare' }] },
    { swrpg_saved_characters: { version: 2, characters: [{ id: 'env' }] } });
  check('(b) a LEGACY bare-array roster against a higher account emits the higher — the roster\'s copy of the hole',
    r.merged.swrpg_saved_characters.version === 2
      && ids(r.merged.swrpg_saved_characters).sort().join() === 'bare,env', r.merged.swrpg_saved_characters);
}

// ── the wire: B3 and V-4 end to end, through sync.js's own adopt() and push, one fake account, and the
// real vessel store sharing each device's storage (charter §7: a wire boundary is traced, not read) ──
const fs = require('fs');
const path = require('path');
const { createSync } = require('../lib/shared/sync.js');
const VSRC = fs.readFileSync(path.join(__dirname, '..', 'lib', 'shared', 'vesselStore.js'), 'utf8');
const ok = (body) => ({ ok: true, status: 200, json: () => Promise.resolve(body) });
const tick = () => new Promise((res) => setTimeout(res, 5));
// The account as adopt() and push use it (worker/sync.js): GET returns every key; a PUT lands only at
// the version the client last saw, else 409 with the current row.
function account(seed) {
  const rows = {};
  Object.keys(seed || {}).forEach((k) => { rows[k] = { value: JSON.stringify(seed[k]), version: 1 }; });
  return {
    read: (k) => (rows[k] ? JSON.parse(rows[k].value) : null),
    fetch(url, opts) {
      const method = (opts && opts.method) || 'GET';
      if (method === 'GET' && url === '/api/v1/sync') {
        return Promise.resolve(ok({ ok: true, keys: JSON.parse(JSON.stringify(rows)) }));
      }
      const m = /^\/api\/v1\/sync\/(.+)$/.exec(url);
      if (method !== 'PUT' || !m) return Promise.reject(new Error('unrouted ' + method + ' ' + url));
      const key = decodeURIComponent(m[1]), body = JSON.parse(opts.body);
      const cur = rows[key] || { value: null, version: 0 };
      if (body.version !== cur.version) {
        return Promise.resolve({ ok: false, status: 409, json: () => Promise.resolve({ current: cur }) });
      }
      rows[key] = { value: body.value, version: cur.version + 1 };
      return Promise.resolve(ok({ ok: true, version: rows[key].version }));
    },
  };
}
// One browser: its storage, its sync seam and its vessel store over the SAME strings. The store is
// subscribed to the seam the way the shells wire it (vesselStore.js `wire`). Pass `mem` to model the
// next page load: a new seam and a new store on the storage the last one left.
function device(acct, seed, memIn) {
  const mem = memIn || {};
  Object.keys(seed || {}).forEach((k) => { mem[k] = JSON.stringify(seed[k]); });
  const sync = createSync({
    fetch: (u, o) => acct.fetch(u, o),
    storage: { get: (k) => (k in mem ? mem[k] : null), set: (k, v) => { mem[k] = String(v); } },
    schedule: (fn) => { fn(); return 1; },
  });
  const sb = {
    SWRPGSync: sync,
    localStorage: { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } },
  };
  new Function(VSRC).call(sb);
  return { mem, sync, VS: sb.SWRPGVessels, fleet: () => JSON.parse(mem.swrpg_vessels_v1) };
}
const fleetIds = (env) => env.vessels.map((r) => r.id).join();
// RE-POINTED at S3 JOB 3 (`shipyard-s3-core`), when v3 became THIS build's version (instrument norm 3): the
// claims are kept — a device on this build that adopts a NEWER build's account holds, and keeps every field
// that build wrote — and "newer" moved from v3 to v4. R4 is a v4 build's ship: the v3 contract's fields plus
// a field v3 does not know (`identities`, one the ruling deferred). The device's own ship is v3. Dropped:
// the literal pre-fix v2 build, which this module can no longer play.
const R4 = {
  id: 'v_mf2a0b1_r4', vehicleKey: 'VCX100', owner: 'party', nickname: 'The Ghost',
  acquired: { note: 'Won at sabacc on Lothal', when: '2026-09-01' },
  provenance: [{ note: 'Won at sabacc on Lothal', when: '2026-09-01', kind: 'acquired', reason: 'reward', session: 3 }],
  hull_current: 0, strain_current: 0, crits: [], shields_current: null,
  attachments: [{ key: 'upgraded_weapons', when: '2026-09-04', note: null, session: 7, reason: 'bought',
    mods: [{ option: 'DAMWEAPSYSADD', when: null, session: 7 }] }],
  crew: [{ who: 'char:c1', role: 'pilot', where: { deck: 'd_main', area: null } }], mounts: [], retired: null,
  destroyed: null, image: null, decks: [{ id: 'd_main', name: 'Main deck', art: null, areas: [] }], cargo: [],
  passengers: [], stores: { days_out: null, next_jump: null }, routes: [],
  identities: [{ name: 'Blue Freight', transponder: 'BF-1' }],
  v: 4, createdAt: 1786000000000, updatedAt: 1786000500000,
};
const V2SHIP = (id, key) => ({ id, vehicleKey: key, owner: 'party', nickname: null, acquired: { note: null, when: null },
  provenance: [], hull_current: null, strain_current: null, crits: [], shields_current: null, attachments: [],
  v: 2, createdAt: 1786000000000, updatedAt: 1786000000000 });
const V3SHIP = (id, key) => Object.assign(V2SHIP(id, key), { crew: [], mounts: [], retired: null, destroyed: null,
  image: null, decks: [], cargo: [], passengers: [], stores: null, routes: [], v: 3 });
const V4_FIELDS = ['acquired', 'provenance', 'attachments', 'crew', 'mounts', 'retired', 'destroyed', 'image',
  'decks', 'cargo', 'passengers', 'stores', 'routes', 'identities', 'v'];

(async () => {
  // ── B3, executed: a device on THIS build signs in to an account a v4 build has written ───────────
  {
    const L2 = V3SHIP('v_mf2a0b2_l2', 'YT1300');
    const acct = account({ swrpg_vessels_v1: { v: 4, vessels: [R4] } });
    const dev = device(acct, { swrpg_vessels_v1: { v: 3, vessels: [L2] } });
    check('B3 setup: before sign-in the page holds its own v 3 fleet, not held (non-vacuity)',
      dev.VS.getState().vessels.length === 1 && dev.VS.isStale() === false);
    await dev.sync.adopt();
    const pushed = acct.read('swrpg_vessels_v1');
    check('B3: after adopt this device\'s copy reads v 4 — the account\'s envelope, not its own 3',
      dev.fleet().v === 4, dev.fleet().v);
    check('B3: …and what adopt pushed back reads v 4 — the account is not regressed', pushed.v === 4, pushed.v);
    check('B3: the store HOLDS — it heard the adoption and re-read a v 4 fleet as stale', dev.VS.isStale() === true);
    check('B3: control — …and still SHOWS both ships, read-only (never blank)', dev.VS.getState().vessels.length === 2);
    const adopted = dev.mem.swrpg_vessels_v1;
    dev.VS.apply((s) => dev.VS.updateVessel(s, R4.id, { hull_current: 4 }));
    dev.VS.apply((s) => dev.VS.acquire(s, 'T65BXWING', { owner: 'party' }).state);
    dev.VS.apply((s) => dev.VS.removeVessel(s, L2.id));
    check('B3: a later write on this device is held — the fleet it stores is byte-identical',
      dev.mem.swrpg_vessels_v1 === adopted);
    check('B3: …so the v4 ship is byte-identical to what the v4 build wrote, every v4 field kept',
      JSON.stringify(dev.fleet().vessels.find((r) => r.id === R4.id)) === JSON.stringify(R4));
    check('B3: …and the held decommission removed nothing and tombstoned nothing',
      dev.fleet().vessels.some((r) => r.id === L2.id) && JSON.parse(dev.mem.swrpg_deleted_ids || '[]').indexOf(L2.id) === -1);
    const reload = device(acct, null, dev.mem);           // the next signed-in page load, same storage
    await reload.sync.adopt();
    const acctR4 = acct.read('swrpg_vessels_v1').vessels.find((r) => r.id === R4.id);
    check('B3: the next page load adopts again — v 4 here and on the account, the v4 ship byte-identical in both',
      reload.fleet().v === 4 && acct.read('swrpg_vessels_v1').v === 4
        && JSON.stringify(reload.fleet().vessels.find((r) => r.id === R4.id)) === JSON.stringify(R4)
        && JSON.stringify(acctR4) === JSON.stringify(R4));
  }

  // ── (a) on the wire: a newer build's records under THIS build's envelope number (what a pre-fix build's
  // merge wrote, one version up). This build writes them back without losing a field, here and on the
  // account. ─────────────────────────────────────────────────────────────────────────────────────────
  {
    const L2 = V3SHIP('v_mf2a0b3_l2', 'YT1300');
    const shape = { v: 3, vessels: [L2, R4] };
    const acct = account({ swrpg_vessels_v1: shape });
    const dev = device(acct, { swrpg_vessels_v1: shape });
    await dev.sync.adopt();
    check('(a) wire setup: the fleet is at v 3 and NOT held, so this build does write (non-vacuity)',
      dev.VS.isStale() === false && dev.fleet().v === 3);
    dev.VS.apply((s) => dev.VS.updateVessel(s, R4.id, { hull_current: 5 }));
    dev.VS.apply((s) => dev.VS.updateVessel(s, L2.id, { strain_current: 1 }));
    dev.sync.push('swrpg_vessels_v1');
    await tick();
    const here = dev.fleet().vessels.find((r) => r.id === R4.id);
    const there = acct.read('swrpg_vessels_v1').vessels.find((r) => r.id === R4.id);
    check('(a) wire setup: the edit landed on the v4 ship (hull 5) and reached the account (non-vacuity)',
      here.hull_current === 5 && there.hull_current === 5, { here: here.hull_current, there: there.hull_current });
    const lost = (rec) => V4_FIELDS.filter((f) => JSON.stringify(rec[f]) !== JSON.stringify(R4[f]));
    check('(a) wire: this device\'s write kept every v4 field of that ship', lost(here).length === 0, lost(here));
    check('(a) wire: …and so did the copy pushed to the account', lost(there).length === 0, lost(there));
  }

  // ── S3 JOB 3 · the bump on the wire: the FIRST v3 save must not turn every other ship into a conflict.
  // A device on this build edits ONE ship of a v2 fleet and pushes; a second device on this build, still
  // holding the v2 fleet, signs in. The untouched ship was written back exactly as stored (the store's
  // lazy upgrade), so both copies are equal and the merge has nothing to ask; the edited one carries a new
  // stamp, so recency carries it. Without the lazy write the untouched ship reached the account in v3
  // shape with its old stamp — a tie, a conflict — and the V-4 leg below went red on the bump alone.
  {
    const S1 = V2SHIP('v_mf2a0d1_s1', 'YT1300'), S2 = V2SHIP('v_mf2a0d2_s2', 'CR90');
    const fleet = { v: 2, vessels: [S1, S2] };
    const acct = account({ swrpg_vessels_v1: fleet });
    const A = device(acct, { swrpg_vessels_v1: fleet });
    const B = device(acct, { swrpg_vessels_v1: fleet });
    await A.sync.adopt();
    A.VS.apply((s) => A.VS.updateVessel(s, S1.id, { hull_current: 2 }));
    A.sync.push('swrpg_vessels_v1');
    await tick();
    const up = acct.read('swrpg_vessels_v1');
    check('S3 bump setup: A\'s edit reached the account as v 3, the edited ship in v3 shape (non-vacuity)',
      up.v === 3 && up.vessels.find((r) => r.id === S1.id).v === 3 && up.vessels.find((r) => r.id === S1.id).hull_current === 2, up);
    check('S3 bump: the ship A did not touch reached the account EXACTLY as stored — its own v 2, byte-identical',
      JSON.stringify(up.vessels.find((r) => r.id === S2.id)) === JSON.stringify(S2));
    const res = await B.sync.adopt();
    check('S3 bump: B signs in and the merge asks NOTHING — no conflict for either ship',
      res && res.ok && res.conflicts.length === 0, res && res.conflicts);
    check('S3 bump: …and B holds A\'s edit, carried by its newer stamp',
      B.fleet().vessels.find((r) => r.id === S1.id).hull_current === 2);
  }

  // ── V-4, executed: a ship decommissioned on one device, then both devices sign in ─────────────────
  {
    const K1 = V2SHIP('v_mf2a0c1_k1', 'CR90'), X1 = V2SHIP('v_mf2a0c2_x1', 'T65BXWING');
    const both = { v: 2, vessels: [K1, X1] };
    const acct = account({ swrpg_vessels_v1: both });
    const A = device(acct, { swrpg_vessels_v1: both });
    const B = device(acct, { swrpg_vessels_v1: both });
    A.VS.apply((s) => A.VS.removeVessel(s, X1.id));          // the hosts' own decommission call, on A
    await A.sync.adopt();                                    // A's next signed-in page load
    check('V-4: A decommissioned the X-wing, and A\'s next sign-in did NOT bring it back from the account',
      fleetIds(A.fleet()) === K1.id, fleetIds(A.fleet()));
    check('V-4: …the account now holds the fleet without it, and its tombstone',
      fleetIds(acct.read('swrpg_vessels_v1')) === K1.id && (acct.read('swrpg_deleted_ids') || []).indexOf(X1.id) !== -1,
      { fleet: fleetIds(acct.read('swrpg_vessels_v1')), tombs: acct.read('swrpg_deleted_ids') });
    await B.sync.adopt();                                    // B never saw the delete
    check('V-4: B, which still held it, drops it at its own sign-in — decommissioned on one device, gone on both',
      fleetIds(B.fleet()) === K1.id, fleetIds(B.fleet()));
  }
})()
  .catch((e) => { fail++; console.log('  FAIL  the wire legs threw: ' + ((e && e.stack) || e)); })
  .then(() => {
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
  });
