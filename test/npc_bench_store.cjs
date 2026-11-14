#!/usr/bin/env node
/**
 * npc_bench_store.cjs — STANDING guard for the NPC bench persistence contract
 * (lib/library/npc/benchStore.js; ruling npc-bench-scope R-NBS1 + bench-reports-triage / G-BENCH-DUP).
 *
 * Pins the durable save-shape (D-NB1) so a future edit can't silently break it:
 *   1. emptyState / normalize: schema-versioned (v6); garbage degrades to empty, never throws.
 *   2. Group + member CRUD returns NEW state; v5: add is NOT idempotent — every add is a new member
 *      (instance id); members default to a 0 overlay. Member ops key by the INSTANCE id, not _source_key.
 *   3. setMember merges only the mutable overlay; resetGroup zeroes wounds/strain/conditions/pool.
 *   4. normalize persists ONLY id-ref + overlay (never a resolved stat block), drops a keyless ghost,
 *      and mints a globally-unique instance `id` for every member (migration + new).
 *   5. clampCurrent holds a stale/drifted current inside [0, threshold*2] (the render clamp).
 *   6-9. schema/migration, minion math, per-member count, per-line pools.
 *   10. v5 (G-BENCH-DUP): duplicates are INDEPENDENT — same rival twice = two members, own tracks;
 *       same minion twice = two ×N lines, pools never merged; every member id is unique.
 *
 * Run:  node test/npc_bench_store.cjs   (pure logic; no data files needed)
 */
const S = require('../lib/library/npc/benchStore.js');

let failures = 0;
function check(label, cond) {
  if (cond) { console.log('  PASS  ' + label); }
  else { failures += 1; console.error('  FAIL  ' + label); }
}
// v5 helpers: member ops key by instance id. Fetch the id of the Nth member with a given _source_key.
function idOf(st, gid, srcKey, nth) {
  const g = st.groups.filter(x => x.id === gid)[0];
  const ms = g ? g.members.filter(m => m._source_key === srcKey) : [];
  return (ms[nth || 0] || {}).id || null;
}

function main() {
  // ── 1. emptyState / normalize ──
  const empty = S.emptyState();
  check('emptyState is versioned (v7 — E3, re-pointed from v6) + groupless', empty.version === S.SCHEMA_VERSION && S.SCHEMA_VERSION === 7 && empty.groups.length === 0);
  check('normalize(null) -> empty, no throw', S.normalize(null).groups.length === 0);
  check('normalize(garbage) -> empty, no throw', S.normalize({ groups: 'nope' }).groups.length === 0);

  // ── 2. CRUD returns NEW state; v5 add is NOT idempotent; default overlay ──
  const c = S.createGroup(empty, 'Cantina ambush');
  check('createGroup returns {state,id}', !!c.id && c.state.groups.length === 1);
  check('createGroup is immutable (empty untouched)', empty.groups.length === 0);
  let st = c.state;
  check('group name kept', st.groups[0].name === 'Cantina ambush');

  st = S.addMember(st, c.id, 'stormtrooper');
  st = S.addMember(st, c.id, 'stormtrooper');   // v5: a SECOND member, not a dedup
  check('v5: addMember is NOT idempotent (dup source = two members)', st.groups[0].members.length === 2);
  const m0 = st.groups[0].members[0];
  check('new member has an instance id + a 0 overlay', !!m0.id && m0.currentWounds === 0 && m0.currentStrain === 0 && Array.isArray(m0.conditions) && m0.conditions.length === 0);
  check('the two duplicate members have DIFFERENT ids', st.groups[0].members[0].id !== st.groups[0].members[1].id);

  st = S.addMember(st, c.id, 'rebel-trooper');
  check('third (distinct) member added', st.groups[0].members.length === 3);
  const rebelId = idOf(st, c.id, 'rebel-trooper');
  st = S.removeMember(st, c.id, rebelId);
  check('removeMember drops the right one by id', st.groups[0].members.length === 2 && st.groups[0].members.every(m => m._source_key === 'stormtrooper'));

  // ── 3. setMember merges only the overlay (keyed by id); resetGroup zeroes ──
  const stormId = idOf(st, c.id, 'stormtrooper');
  st = S.setMember(st, c.id, stormId, { currentWounds: 4, currentStrain: 2, conditions: ['staggered'] });
  let m = S.getMember(st, c.id, stormId);
  check('setMember writes the overlay (by id)', m.currentWounds === 4 && m.currentStrain === 2 && m.conditions[0] === 'staggered');
  st = S.setMember(st, c.id, stormId, { currentWounds: 6 });   // partial patch
  m = S.getMember(st, c.id, stormId);
  check('setMember partial patch keeps untouched fields', m.currentWounds === 6 && m.currentStrain === 2);
  st = S.resetGroup(st, c.id);
  m = S.getMember(st, c.id, stormId);
  check('resetGroup zeroes wounds/strain/conditions', m.currentWounds === 0 && m.currentStrain === 0 && m.conditions.length === 0);

  // ── 4. normalize: id-ref + overlay only; drops keyless ghosts; MINTS instance ids ──
  const dirty = { version: 1, groups: [{ id: 'g1', name: 'G', members: [
    { _source_key: 'vader', currentWounds: 3, characteristics: { brawn: 5 }, weapons: ['lightsaber'] },  // stat block must NOT survive
    { currentWounds: 9 },   // no _source_key -> ghost, dropped
  ] }] };
  const n = S.normalize(dirty);
  const vm = n.groups[0].members[0];
  check('normalize drops the keyless ghost member', n.groups[0].members.length === 1 && vm._source_key === 'vader');
  check('normalize keeps the overlay', vm.currentWounds === 3);
  check('normalize strips the resolved stat block (id-ref rule)', vm.characteristics === undefined && vm.weapons === undefined);
  check('normalize MINTS an instance id for a pre-v5 member (migration)', typeof vm.id === 'string' && vm.id.length > 0);

  // ── 5. clampCurrent ──
  check('clamp holds a drifted current at threshold*2', S.clampCurrent(99, 5) === 10);
  check('clamp leaves an in-range current alone', S.clampCurrent(7, 5) === 7);
  check('clamp floors a negative/garbage at 0', S.clampCurrent(-3, 5) === 0 && S.clampCurrent('x', 5) === 0);
  check('clamp on unresolvable threshold (0) -> 0', S.clampCurrent(8, 0) === 0);

  // ── 6. schema version + v1 migration ──
  // ADDENDUM 11 (E-E3PG-1's class): emptyState stamps the CURRENT version, read by name; `SCHEMA_VERSION === 7` stays the
  // paper pin (shape v7, as test/encounter_v7_shape.cjs holds it): a bump is a paper change and reds here on purpose.
  check('emptyState is the current version (v' + S.SCHEMA_VERSION + '), and the paper says v7 (E3; was v6)', S.emptyState().version === S.SCHEMA_VERSION && S.SCHEMA_VERSION === 7);
  const v1 = { groups: [{ id: 'g1', name: 'Squad', notes: 'ambush', members: [{ _source_key: 'stormtrooper', currentWounds: 2 }] }] };
  const mig = S.normalize(v1);
  check('v1 migration: version bumped to current (' + S.SCHEMA_VERSION + ')', mig.version === S.SCHEMA_VERSION);   // ADDENDUM 11: by name
  check('v1 migration: group.poolWounds RETIRED; member.poolWounds 0 + instance id minted',
        mig.groups[0].poolWounds === undefined && mig.groups[0].members[0].poolWounds === 0 && !!mig.groups[0].members[0].id);
  check('v1 migration: notes + members preserved', mig.groups[0].notes === 'ambush' && mig.groups[0].members[0].currentWounds === 2);

  // setPoolWounds (per MEMBER, by id) / setGroupNotes / reset
  let pg = S.createGroup(S.emptyState(), 'Troopers').state; const gid = pg.groups[0].id;
  pg = S.addMember(pg, gid, 'stormtrooper');
  const pgStorm = idOf(pg, gid, 'stormtrooper');
  pg = S.setPoolWounds(pg, gid, pgStorm, 6);
  check('setPoolWounds writes the member line pool (by id)', S.getMember(pg, gid, pgStorm).poolWounds === 6);
  check('setPoolWounds floors negatives to 0', S.getMember(S.setPoolWounds(pg, gid, pgStorm, -3), gid, pgStorm).poolWounds === 0);
  pg = S.setGroupNotes(pg, gid, 'flanking left');
  check('setGroupNotes writes group notes', pg.groups[0].notes === 'flanking left');
  check('resetGroup zeroes the line pool too', S.getMember(S.resetGroup(pg, gid), gid, pgStorm).poolWounds === 0);

  // ── 7. minion math (RAW EotE p.399; strict "exceeds a share") — pure, unchanged by v5 ──
  const WT = 5, N = 3;
  check('minionPoolMax = sum of WTs (15)', S.minionPoolMax(WT, N) === 15);
  check('at 0 wounds: 0 fallen, 3 standing', S.minionFallen(0, WT, N) === 0 && S.minionStanding(0, WT, N) === 3);
  check('at EXACTLY one share (5): still 0 fallen (strict >)', S.minionFallen(5, WT, N) === 0);
  check('at 6 (passes 5): 1 fallen, 2 standing (p.399)', S.minionFallen(6, WT, N) === 1 && S.minionStanding(6, WT, N) === 2);
  check('at 10 (== 2 shares): still 1 fallen', S.minionFallen(10, WT, N) === 1);
  check('at 11 (passes 10): 2 fallen', S.minionFallen(11, WT, N) === 2);
  check('at 15 (== group WT): 2 fallen, ONE still standing (strict)', S.minionFallen(15, WT, N) === 2 && S.minionStanding(15, WT, N) === 1);
  check('at 16 (passes group WT): whole group down', S.minionFallen(16, WT, N) === 3 && S.minionStanding(16, WT, N) === 0);
  check('fallen never exceeds member count', S.minionFallen(999, WT, N) === 3);
  check('group ranks = standing - 1 (floor 0)', S.minionGroupRanks(3) === 2 && S.minionGroupRanks(1) === 0 && S.minionGroupRanks(0) === 0);
  check('unresolvable WT (0) -> 0 fallen, no divide error', S.minionFallen(10, 0, N) === 0 && S.minionPoolMax(0, N) === 0);

  // ── 8. v3 (T2-B) per-member `count` — read + patch (by id), migration ──
  const v3fix = { version: 3, groups: [{ id: 'g1', name: 'N', members: [
    { _source_key: 'a', count: 4 }, { _source_key: 'b', count: 0 }, { _source_key: 'c' }] }] };
  const v3r = S.normalize(v3fix);
  check('v3 record: count read; floor 1 (0 and missing clamp up)',
        v3r.groups[0].members[0].count === 4 && v3r.groups[0].members[1].count === 1 && v3r.groups[0].members[2].count === 1);
  check('v3 migration mints ids for every member', v3r.groups[0].members.every(m => !!m.id));
  let cs = S.createGroup(S.emptyState(), 'C'); const cgid = cs.id; cs = cs.state;
  cs = S.addMember(cs, cgid, 'shyrack');
  const shyId = idOf(cs, cgid, 'shyrack');
  check('addMember seeds count 1', S.getMember(cs, cgid, shyId).count === 1);
  cs = S.setMember(cs, cgid, shyId, { count: 4 });
  check('setMember count patch persists', S.getMember(cs, cgid, shyId).count === 4);
  cs = S.setMember(cs, cgid, shyId, { count: -2 });
  check('count patch clamps to floor 1', S.getMember(cs, cgid, shyId).count === 1);
  check('round-trip: normalize(normalize(x)) stable (ids preserved)',
        JSON.stringify(S.normalize(v3r)) === JSON.stringify(v3r));

  // ── 9. v4 per-LINE pools INDEPENDENT (keyed by id); v2/v3→v4 pool migration ──
  let ml = S.createGroup(S.emptyState(), 'Mixed').state; const mgid = ml.groups[0].id;
  ml = S.addMember(ml, mgid, 'shyrack');
  ml = S.addMember(ml, mgid, 'stormtrooper');
  const mlShy = idOf(ml, mgid, 'shyrack'), mlStorm = idOf(ml, mgid, 'stormtrooper');
  ml = S.setPoolWounds(ml, mgid, mlShy, 5);
  ml = S.setPoolWounds(ml, mgid, mlStorm, 2);
  check('two minion lines carry SEPARATE pools (no cross-type sum)',
        S.getMember(ml, mgid, mlShy).poolWounds === 5 && S.getMember(ml, mgid, mlStorm).poolWounds === 2);
  ml = S.setPoolWounds(ml, mgid, mlShy, 9);
  check('editing one line pool does not touch the other',
        S.getMember(ml, mgid, mlShy).poolWounds === 9 && S.getMember(ml, mgid, mlStorm).poolWounds === 2);
  const v2fix = S.normalize({ version: 2, groups: [{ id: 'g1', name: 'Shyracks', poolWounds: 4,
    members: [{ _source_key: 'shyrack', currentWounds: 0 }] }] });
  check('v2->v5: retired group pool lands on the first member line',
        v2fix.groups[0].members[0].poolWounds === 4 && v2fix.groups[0].poolWounds === undefined);

  // ── 10. v5 (G-BENCH-DUP): duplicates are INDEPENDENT ──
  // (a) same RIVAL twice → two members, independent wound tracks
  let dg = S.createGroup(S.emptyState(), 'Wookiees').state; const dgid = dg.groups[0].id;
  dg = S.addMember(dg, dgid, 'wookiee-warrior');
  dg = S.addMember(dg, dgid, 'wookiee-warrior');
  check('(a) two Wookiee Warriors coexist (two members, same source)',
        dg.groups[0].members.length === 2 && dg.groups[0].members.every(m => m._source_key === 'wookiee-warrior'));
  const wA = idOf(dg, dgid, 'wookiee-warrior', 0), wB = idOf(dg, dgid, 'wookiee-warrior', 1);
  check('(a) the two share a _source_key but have distinct ids', wA && wB && wA !== wB);
  dg = S.setMember(dg, dgid, wA, { currentWounds: 7 });
  check('(a) wounding Wookiee A leaves Wookiee B untouched (independent tracks)',
        S.getMember(dg, dgid, wA).currentWounds === 7 && S.getMember(dg, dgid, wB).currentWounds === 0);
  // (b) same MINION source twice → two ×N lines, INDEPENDENT pools (never merged to ×8)
  let sg = S.createGroup(S.emptyState(), 'Two squads').state; const sgid = sg.groups[0].id;
  sg = S.addMember(sg, sgid, 'stormtrooper');
  sg = S.addMember(sg, sgid, 'stormtrooper');
  const sA = idOf(sg, sgid, 'stormtrooper', 0), sB = idOf(sg, sgid, 'stormtrooper', 1);
  sg = S.setMember(sg, sgid, sA, { count: 4 });
  sg = S.setMember(sg, sgid, sB, { count: 4 });
  sg = S.setPoolWounds(sg, sgid, sA, 6);
  check('(b) two Stormtrooper ×4 LINES coexist (not merged into ×8)',
        sg.groups[0].members.length === 2 && S.getMember(sg, sgid, sA).count === 4 && S.getMember(sg, sgid, sB).count === 4);
  check('(b) wounding line A pool never drains line B (independent pools)',
        S.getMember(sg, sgid, sA).poolWounds === 6 && S.getMember(sg, sgid, sB).poolWounds === 0);
  // (c) migration + globally-unique ids across groups (tracker prerequisite)
  const twoGroups = S.normalize({ version: 4, groups: [
    { id: 'g1', name: 'A', members: [{ _source_key: 'x' }, { _source_key: 'y' }] },
    { id: 'g2', name: 'B', members: [{ _source_key: 'x' }] },
  ] });
  const allIds = twoGroups.groups.reduce((acc, g) => acc.concat(g.members.map(m => m.id)), []);
  check('(c) v4 save migrates: every member gets an id, all globally unique',
        allIds.length === 3 && new Set(allIds).size === 3 && allIds.every(Boolean));

  // ── v6 (F-54): ships in the encounter, NPCs aboard, ONE pilot flag ────────────────────────
  // Ruled by `f54-crew-direction-and-raw` §4, with C-F54S-1/C-F54S-2 from the schema ruling.
  const v5save = { version: 5, groups: [{ id: 'g1', name: 'G', arrangement: [], notes: '',
    poolWounds: 9,                                   // v4 RETIRED this — it must stay retired
    members: [{ id: 'm1', _source_key: 'stormtrooper', count: 4, poolWounds: 3,
                aFutureField: 'keep me' }] }] };
  const up = S.normalize(v5save);
  check('(v6) a v5 save normalises to the current version (' + S.SCHEMA_VERSION + ')', up.version === S.SCHEMA_VERSION);   // ADDENDUM 11: by name
  check('(v6) MIGRATION IS A STAMP — no member data is rewritten',
        up.groups[0].members[0].count === 4 && up.groups[0].members[0].poolWounds === 3);
  check('(v6) a v5 group gains an EMPTY vehicles list, not a null or a missing key',
        Array.isArray(up.groups[0].vehicles) && up.groups[0].vehicles.length === 0);
  check('(v6) and no member is aboard anything by default',
        up.groups[0].members[0].vehicle === undefined);

  // C-F54S-2, both halves — the pass-through AND its carve-out.
  check('(C-F54S-2) an UNRECOGNISED MEMBER key survives a normalize round trip',
        up.groups[0].members[0].aFutureField === 'keep me');
  check('(C-F54S-2 carve-out) group.poolWounds STAYS RETIRED — pass-through is member-level only',
        !('poolWounds' in up.groups[0]));
  // The carve-out the condition did NOT anticipate, caught by this suite on its first run: the
  // pass-through must never outrank the id-ref rule. A save carrying a resolved stat block loses it.
  const statty = S.normalize({ version: 6, groups: [{ id: 'g1', name: 'G', members: [
    { id: 'm1', _source_key: 'vader', characteristics: { brawn: 5 }, weapons: ['lightsaber'],
      skills: {}, derived: { wounds: 9 }, someFutureField: 'kept' } ] }] });
  const sm = statty.groups[0].members[0];
  check('(C-F54S-2 carve-out) the RESOLVED STAT BLOCK is still stripped — tolerance does not outrank charter §8',
        sm.characteristics === undefined && sm.weapons === undefined &&
        sm.skills === undefined && sm.derived === undefined);
  check('(C-F54S-2) …while a genuinely unknown field beside it still survives',
        sm.someFutureField === 'kept');

  // The edge itself, both directions off one field.
  const withShip = S.normalize({ version: 6, groups: [{ id: 'g1', name: 'G', arrangement: [], notes: '',
    vehicles: [{ id: 'v1', key: 'T47ALLIANCE' }, { id: 'v2', key: 'BR549' }],
    members: [
      { id: 'm1', _source_key: 'pilot_a', vehicle: { id: 'v1', pilot: true } },
      { id: 'm2', _source_key: 'gunner_b', vehicle: { id: 'v1' } },
      { id: 'm3', _source_key: 'loner_c' },
      { id: 'm4', _source_key: 'ghost_d', vehicle: { id: 'v_GONE' } },
    ] }] });
  const G = withShip.groups[0];
  check('(v6) the group carries its craft as id-refs (key only, never a stat block)',
        G.vehicles.length === 2 && G.vehicles[0].key === 'T47ALLIANCE' &&
        Object.keys(G.vehicles[0]).sort().join(',') === 'id,key');
  check('(v6) a craft holds MANY members — read the edge from the ship',
        G.members.filter(m => m.vehicle && m.vehicle.id === 'v1').length === 2);
  check('(v6) a member is aboard AT MOST ONE craft — read the same edge from the NPC',
        G.members[0].vehicle.id === 'v1' && !Array.isArray(G.members[0].vehicle));
  check('(v6) an NPC aboard nothing stays aboard nothing', G.members[2].vehicle === undefined);
  check('(v6) OLD DATA: a membership naming a craft the group lacks is DROPPED, member survives',
        G.members[3].vehicle === undefined && G.members[3]._source_key === 'ghost_d');

  // R-F54C-1 — the Non-Goal, in code.
  check('(R-F54C-1) `pilot` is a BOOLEAN and only true survives',
        G.members[0].vehicle.pilot === true && G.members[1].vehicle.pilot === undefined);
  const roleSmuggled = S.normalize({ version: 6, groups: [{ id: 'g1', name: 'G', members: [
    { id: 'm1', _source_key: 'x', vehicle: { id: 'v1', pilot: true, station: 'gunner', seat: 3 } } ],
    vehicles: [{ id: 'v1', key: 'T47ALLIANCE' }] }] });
  check('(R-F54C-1) a second role-ish field on the membership is NOT persisted (station/seat dropped)',
        !('station' in roleSmuggled.groups[0].members[0].vehicle) &&
        !('seat' in roleSmuggled.groups[0].members[0].vehicle));

  // R-BVP-1 (`paper-bench-vessel-pointer`; SHIP YARD S4 JOB 2, ruling shipyard-s4-ground ADDENDUM 1, G14):
  // READER FIRST — a craft ENTRY keeps keys this build does not know; the group-level whitelist stays.
  const later = S.normalize({ version: 6, groups: [{ id: 'g1', name: 'G', members: [],
    vehicles: [{ id: 'v1', key: 'T47ALLIANCE', vessel: 'v_later_build', someFutureField: { a: 1 } }, { id: 7, key: 42 }] }] });
  const LV = later.groups[0].vehicles;
  check('(R-BVP-1) a craft entry keeps an unknown key (a later build\'s `vessel` pointer survives this reader)',
        LV[0].vessel === 'v_later_build' && JSON.stringify(LV[0].someFutureField) === '{"a":1}');
  const rt = S.normalize(JSON.parse(JSON.stringify(later)));
  check('(R-BVP-1) …through a save and a re-read (round trip), unchanged',
        rt.groups[0].vehicles[0].vessel === 'v_later_build' && JSON.stringify(rt.groups[0].vehicles) === JSON.stringify(LV));
  check('(R-BVP-1) the known fields are still normalized (id and key as strings), and id + key lead the entry',
        LV[1].id === '7' && LV[1].key === '42' && Object.keys(LV[0]).slice(0, 2).join(',') === 'id,key');
  const other = S.normalize({ version: 6, groups: [{ id: 'g1', name: 'G', members: [], vehicles: [], zzUnknownGroupField: 1 }] });
  check('(R-BVP-1) control: nothing is invented — an entry with no extra key carries none (id,key only)',
        Object.keys(G.vehicles[0]).sort().join(',') === 'id,key' && other.groups[0].vehicles.length === 0);

  // A craft entry with no registry key is unusable — drop it, never throw, never invent one.
  const junk = S.normalize({ version: 6, groups: [{ id: 'g1', name: 'G', members: [],
    vehicles: [{ id: 'v1' }, null, { key: 'BR549' }] }] });
  check('(v6) an unusable craft entry is dropped and a keyed one is kept + given an id',
        junk.groups[0].vehicles.length === 1 && junk.groups[0].vehicles[0].key === 'BR549' &&
        !!junk.groups[0].vehicles[0].id);

  // ── v6 OPERATIONS (F-54 increment 2): the invariants live in the STORE, not the UI ────────
  let vs = S.normalize({ version: 6, groups: [{ id: 'g1', name: 'Patrol', arrangement: [], notes: '',
    vehicles: [], members: [
      { id: 'a', _source_key: 'pilot_a' },
      { id: 'b', _source_key: 'gunner_b' },
      { id: 'c', _source_key: 'other_c' },
    ] }] });
  vs = S.addVehicle(vs, 'g1', 'T47ALLIANCE');
  vs = S.addVehicle(vs, 'g1', 'T47ALLIANCE');          // the SAME model twice — must stay distinct
  const [shipA, shipB] = vs.groups[0].vehicles;
  check('(op) addVehicle stores an id-ref and mints a local instance id',
        vs.groups[0].vehicles.length === 2 && shipA.key === 'T47ALLIANCE' && !!shipA.id);
  check('(op) two of the SAME model are distinguishable (instance ids differ)', shipA.id !== shipB.id);

  vs = S.setMemberVehicle(vs, 'g1', 'a', shipA.id, true);
  vs = S.setMemberVehicle(vs, 'g1', 'b', shipA.id);
  check('(op) a member goes aboard, and the pilot flag lands only where asked',
        S.getMember(vs, 'g1', 'a').vehicle.pilot === true &&
        S.getMember(vs, 'g1', 'b').vehicle.id === shipA.id &&
        S.getMember(vs, 'g1', 'b').vehicle.pilot === undefined);

  // INVARIANT 1 — at most one craft per member: assignment REPLACES.
  vs = S.setMemberVehicle(vs, 'g1', 'b', shipB.id);
  check('(op) reassigning a member MOVES them — never aboard two craft at once',
        S.getMember(vs, 'g1', 'b').vehicle.id === shipB.id);

  // INVARIANT 2 — at most one pilot per craft (RAW: one Pilot Only action per round, EotE p.242).
  vs = S.setMemberVehicle(vs, 'g1', 'c', shipA.id, true);
  const aAfter = S.getMember(vs, 'g1', 'a'), cAfter = S.getMember(vs, 'g1', 'c');
  check('(op) a NEW pilot DEMOTES the old one rather than the store refusing the action',
        cAfter.vehicle.pilot === true && aAfter.vehicle.pilot === undefined);
  check('(op) …and the demoted pilot STAYS ABOARD — demotion is not removal',
        aAfter.vehicle.id === shipA.id);

  // A craft the encounter does not carry is never invented.
  const bogus = S.setMemberVehicle(vs, 'g1', 'c', 'not-a-real-ship', true);
  check('(op) assigning an unknown craft is refused, leaving the member where they were',
        S.getMember(bogus, 'g1', 'c').vehicle.id === shipA.id);

  // Taking a member off.
  const off = S.setMemberVehicle(vs, 'g1', 'b', null);
  check('(op) passing null takes the member off the craft', S.getMember(off, 'g1', 'b').vehicle === undefined);

  // Removing the craft takes its crew off it, in the SAME state — not deferred to the next load.
  const gone = S.removeVehicle(vs, 'g1', shipA.id);
  check('(op) removeVehicle drops the craft', gone.groups[0].vehicles.length === 1 &&
        gone.groups[0].vehicles[0].id === shipB.id);
  check('(op) …and takes its crew off it immediately, leaving the NPCs in the group',
        S.getMember(gone, 'g1', 'a').vehicle === undefined &&
        S.getMember(gone, 'g1', 'c').vehicle === undefined &&
        gone.groups[0].members.length === 3);
  check('(op) …while a member aboard a DIFFERENT craft is untouched',
        S.getMember(gone, 'g1', 'b').vehicle.id === shipB.id);

  // Purity: every op returns new state and never mutates its input (the store's standing contract).
  const before = JSON.stringify(vs);
  S.addVehicle(vs, 'g1', 'BR549'); S.removeVehicle(vs, 'g1', shipA.id); S.setMemberVehicle(vs, 'g1', 'a', null);
  check('(op) all three ops are PURE — the input state is untouched', JSON.stringify(vs) === before);

  // ── F-54 — THE VERSION-AHEAD SENTINEL (ruling `f54-downgrade-prompt`) ──────────────────────
  // A save written by a NEWER build is FLAGGED and never written back. The exposure it closes: an
  // old tab renders what it understands, and the moment it writes, everything it did not understand
  // is gone — a GM loses the ships and crew they just assigned, with no error and no undo.
  const _ahead = { version: S.SCHEMA_VERSION + 1, groups: [{ id: 'g', name: 'N', members: [], arrangement: [], notes: '' }] };
  const _same  = { version: S.SCHEMA_VERSION,     groups: [{ id: 'g', name: 'N', members: [], arrangement: [], notes: '' }] };
  const _older = { version: 3,                    groups: [{ id: 'g', name: 'N', members: [], arrangement: [], notes: '' }] };
  check('F-54: a NEWER-than-us save is flagged stale', S.normalize(_ahead).stale === true);
  check('F-54: our own version is NOT flagged', S.normalize(_same).stale === undefined);
  check('F-54: an OLDER save is not flagged — it migrates forward exactly as before',
        S.normalize(_older).stale === undefined && S.normalize(_older).version === S.SCHEMA_VERSION);
  check('F-54: the flag is IN-MEMORY ONLY — absent from the persisted shape, so no schema change '
        + 'and no R-SY4 halt', Object.keys(S.emptyState()).indexOf('stale') === -1);

  // THE HOLD, asserted as BYTE-IDENTITY rather than "it did not throw". `persist` re-emits at OUR
  // version and drops unknown fields — which IS the downgrade. Only byte-identity can see that.
  // A SECOND INSTANCE, LOADED WITH A REAL STORAGE ROOT — and this detail is the difference between
  // a real assert and a vacuous one. `benchStore` is an IIFE that captures its root at load time;
  // required at the top of this file (node, no `window`) that root is `module.exports`, so
  // `root.localStorage` is undefined and `persist` writes NOTHING NO MATTER WHAT. Both legs below
  // would then pass for the same wrong reason. Loading a fresh copy against a fake window — the
  // idiom `test/vessel_store.cjs` already uses — is what makes the byte-identity assert mean
  // something. The "normal state still persists" leg is what caught it.
  const _raw = JSON.stringify(_ahead);
  const _store = { _d: { 'swrpg_npc_bench': _raw }, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = v; } };
  const _sandbox = { window: { localStorage: _store }, localStorage: _store };
  _sandbox.window.window = _sandbox.window;
  const _src = require('fs').readFileSync(require('path').join(__dirname, '..', 'lib', 'library', 'npc', 'benchStore.js'), 'utf8');
  new Function('window', 'module', 'exports', _src).call(_sandbox.window, _sandbox.window, { exports: {} }, {});
  // NAMED EXACTLY — `root.NpcBenchStore`. A tolerant `|| S` fallback here silently handed the
  // legs the NON-writable instance and turned the fix back into the vacuity it was fixing.
  const S2 = _sandbox.window.NpcBenchStore;
  check('F-54 setup: the second instance can actually WRITE (non-vacuity — without this the two '
        + 'legs below pass because `persist` is a no-op in node)',
        (function () { S2.persist(S2.normalize(_same)); const wrote = _store.getItem('swrpg_npc_bench') !== _raw;
                       _store.setItem('swrpg_npc_bench', _raw); return wrote; })());
  // B-764 — the CARD/LIST preference is the store's edge now: its own key, 'card' by default, a
  // garbage value reads 'card', and only the two values are ever written.
  check('B-764: readBoardView defaults to card on an empty key (positive control: the key is absent)',
        _store.getItem('swrpg_bench_board_view') === null && S2.readBoardView() === 'card');
  S2.writeBoardView('list');
  check('B-764: writeBoardView("list") writes the key, and readBoardView reads it back',
        _store.getItem('swrpg_bench_board_view') === 'list' && S2.readBoardView() === 'list');
  S2.writeBoardView('tiles');
  check('B-764: a value outside card/list is NEVER written (the key still reads list)',
        _store.getItem('swrpg_bench_board_view') === 'list');
  _store.setItem('swrpg_bench_board_view', 'garbage');
  check('B-764: a garbage stored value reads as card', S2.readBoardView() === 'card');
  check('B-764: the key is the one the view always used (no new contract)', S2.BOARD_VIEW_KEY === 'swrpg_bench_board_view');
  S2.persist(S2.normalize(_ahead));
  check('F-54: persisting a STALE state writes NOTHING — the raw save is byte-identical',
        _store.getItem('swrpg_npc_bench') === _raw);
  S2.persist(S2.normalize(_same));
  check('F-54: …while a normal state still persists — the hold is not a global mute',
        _store.getItem('swrpg_npc_bench') !== _raw);

  // B-867 / R-NPC-5a — THE WIPE (EotE printed p.390: a member falls when the pool EXCEEDS its share).
  // Radtrooper-shaped: WT 5 × 4 → poolMax 20. FALSIFIER FIRST: at the old clamp (poolMax) one still stands,
  // which is the defect — the leg below it can only pass if the ceiling moved.
  check('B-867 falsifier: at p = poolMax (20/20) one minion still stands — the old clamp could never wipe',
        S.minionStanding(20, 5, 4) === 1);
  check('B-867: the ceiling is poolMax + 1 (21 for 5 × 4); an empty line (WT 0) has a ceiling of 0',
        S.minionPoolCeiling(5, 4) === 21 && S.minionPoolCeiling(0, 4) === 0);
  check('B-867: at p = poolMax + 1 the group is WIPED — standing 0, fallen 4, group ranks 0',
        S.minionStanding(21, 5, 4) === 0 && S.minionFallen(21, 5, 4) === 4 && S.minionGroupRanks(S.minionStanding(21, 5, 4)) === 0);
  check('B-867: the fall is strict — 6 wounds drop one (5 < 6), 5 drop none', S.minionStanding(6, 5, 4) === 3 && S.minionStanding(5, 5, 4) === 4);
  (function () {
    let st = S.createGroup({ version: 6, groups: [] }, 'wipe');
    const gid = st.id; st = S.addMember(st.state, gid, 'RADTROOPER');
    const mid = st.groups[0].members[0].id;
    const over = S.setPoolWounds(st, gid, mid, 40, S.minionPoolCeiling(5, 4));
    const free = S.setPoolWounds(st, gid, mid, 40);
    check('B-867: setPoolWounds clamps a write at the ceiling it is given (40 → 21); without one it clamps only at 0 (40)',
          over.groups[0].members[0].poolWounds === 21 && free.groups[0].members[0].poolWounds === 40);
  })();
  // B-893 / R-NPR57-12 — THE SECOND COPY OF A CRAFT is the store's EXISTING v6 shape: two addVehicle of one key
  // are two INSTANCES (distinct local ids), each with its own crew edge; removing one keeps the other and its crew.
  (function () {
    let st = S.createGroup({ version: 6, groups: [] }, 'two craft');
    const gid = st.id; st = S.addMember(st.state, gid, 'RADTROOPER'); st = S.addMember(st, gid, 'STORMTROOPER');
    const one = S.addVehicle(st, gid, 'r444');
    check('B-893 falsifier: ONE addVehicle is one instance', (one.groups[0].vehicles || []).length === 1);
    const two = S.addVehicle(one, gid, 'r444');
    const vs = two.groups[0].vehicles;
    check('B-893: a second addVehicle of the SAME key is a second INSTANCE (two entries, one key, distinct ids); v6 stands',
          vs.length === 2 && vs[0].key === 'r444' && vs[1].key === 'r444' && vs[0].id !== vs[1].id && two.version === 6);
    const [m1, m2] = two.groups[0].members.map((m) => m.id);
    let crew = S.setMemberVehicle(two, gid, m1, vs[0].id, true);
    crew = S.setMemberVehicle(crew, gid, m2, vs[1].id, false);
    const on = (st_, mid) => (st_.groups[0].members.find((m) => m.id === mid).vehicle || {}).id;
    check('B-893: a member aboard the first instance is NOT aboard the second', on(crew, m1) === vs[0].id && on(crew, m1) !== vs[1].id);
    const rm = S.removeVehicle(crew, gid, vs[0].id);
    check('B-893: removing one instance leaves the other AND its crew (the removed one\'s crew is unassigned)',
          rm.groups[0].vehicles.length === 1 && rm.groups[0].vehicles[0].id === vs[1].id && on(rm, m2) === vs[1].id && on(rm, m1) === undefined);
  })();
  // B-905 · R-NPR8B-2 — a CRIT incapacitates EXACTLY ONE more (minionCritPool; 4 minions of WT 5, poolMax 20).
  (function () {
    const one = (p) => { const q = S.minionCritPool(p, 5, 4); return { q, down: S.minionFallen(q, 5, 4) - S.minionFallen(p, 5, 4) }; };
    check('B-905 FALSIFIER: the old crit (p + WT) on a FRESH group leaves all 4 standing (0 → 5)', S.minionStanding(0 + 5, 5, 4) === 4);
    let r = one(0);
    check('B-905: a fresh group 0 → 6 — one down (the outcome sentence; the extra wound is the stated artefact)', r.q === 6 && r.down === 1);
    r = one(3);
    check('B-905: mid-share 3 → 8 — one down, the partial damage KEPT (one minion\'s worth added)', r.q === 8 && r.down === 1);
    r = one(5);
    check('B-905: at a share boundary 5 → 10 — one down (the ruling\'s example reads 11; its formula gives 10: at 5 none has fallen, so + WT already fells one)', r.q === 10 && r.down === 1);
    r = one(10);
    check('B-905: at 2·WT (one already down) 10 → 15 — exactly one more', r.q === 15 && r.down === 1);
    r = one(20);
    check('B-905: at poolMax 20 a crit WIPES — 21, the ceiling, standing 0', r.q === 21 && S.minionStanding(r.q, 5, 4) === 0);
    check('B-905: past the ceiling nothing more (21 stays 21); an empty line (WT 0) is unchanged', S.minionCritPool(21, 5, 4) === 21 && S.minionCritPool(3, 0, 4) === 3);
  })();
  console.log('\n' + (failures === 0 ? 'ALL PASS' : failures + ' FAILURES'));
  process.exit(failures === 0 ? 0 : 1);
}

main();
