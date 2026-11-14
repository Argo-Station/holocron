/**
 * benchStore.js — the NPC bench persistence core ("paper that remembers").
 *
 * The single read/write wrapper for the GM's saved NPC groups (ruling npc-bench-scope, R-NBS1).
 * NO scattered localStorage access elsewhere — every reader/writer goes through here.
 *
 * SAVE-SHAPE CONTRACT (D-NB1, durable, schema-versioned from day one):
 *   { version: 5,
 *     groups: [ { id, name, arrangement, notes,
 *                 members: [ { id,                     // v5: INSTANCE identity — globally-unique, so the
 *                                                       //   same NPC can appear MULTIPLE times in a group
 *                                                       //   (rules-correct: two rival Wookiees, two ×4 minion
 *                                                       //   lines with independent pools — ruling force... no,
 *                                                       //   bench-reports-triage Amendment 1 / G-BENCH-DUP).
 *                              _source_key,             // id-ref into the canonical NPC registry (the STAT source)
 *                              currentWounds, currentStrain, conditions: [], notes?, count?, poolWounds? } ] } ] }
 *
 *   We persist ONLY the id-ref + the mutable overlay (wounds/strain/conditions) + GM-authored text.
 *   The stat block (characteristics, thresholds, weapons, skills) is NEVER persisted — it resolves
 *   from the registry by _source_key at render (the §8 id-ref rule; the Foundry ActorDelta pattern).
 *   A removed/renamed _source_key is an OLD-DATA path: render gracefully (placeholder), never throw;
 *   a persisted current that exceeds the freshly-resolved threshold clamps at render (canon drift).
 *
 * Pure state-transforms + a thin localStorage edge. Dual-export (browser window.NpcBenchStore /
 * CommonJS module.exports) so test/npc_bench_store.cjs can exercise the contract in Node.
 */
(function (root) {
  'use strict';

  var KEY = 'swrpg_npc_bench';
  // v6 (F-54, ruling `f54-crew-direction-and-raw`): `group.vehicles[]` + `member.vehicle{id,pilot?}`.
  // ADDITIVE ONLY — the migration is a version STAMP: both fields are optional and absent, so no
  // pre-existing data is rewritten and nothing in a v5 save can be lost by upgrading.
  // THE HONEST OTHER HALF (C-F54S-1): a v6 save opened by an ALREADY-DEPLOYED v5 build loses its
  // vehicle data, because that shipped code whitelists member keys and knows nothing of `vehicles`.
  // The pass-through added below protects v7 onward; it cannot reach back into shipped builds.
  // v7 (ENCOUNTERS E3, ruling `encounters-e2-manager-shape` §4.2, card `encounters-e3-plumbing` §4): the group is the
  // ENCOUNTER — `state`, `rounds`, `campaignId`, `updatedAt` join the group whitelist; `kind`, `who`, `crits`, `timers`
  // join KNOWN_MEMBER_KEYS. ADDITIVE ONLY, a version STAMP again: nothing on disk is rewritten, no field changes type.
  // A v7 save opened by a deployed v6 build reads `stale: true` and that build refuses to write (the F-54 sentinel).
  var SCHEMA_VERSION = 7;   // v6 (F-54): craft + crew. v5 (G-BENCH-DUP): member INSTANCE id — any NPC can appear N times (rivals/nemeses as
                            //   individuals, minions as independent ×N lines). v4: per-line poolWounds. v3: member count. v2: group poolWounds.

  function emptyState() {
    return { version: SCHEMA_VERSION, groups: [] };
  }

  // Defensive read: any garbage, parse failure, or wrong shape degrades to an empty bench rather
  // than throwing (old-data path).
  //
  // F-54 — THE VERSION-AHEAD SENTINEL (Jason 2026-08-04: "users get a prompt"; ruling
  // `f54-downgrade-prompt`). THIS COMMENT USED TO SAY "a future newer version is tolerated forward",
  // and tolerating it forward IS THE EXPOSURE: a tab running OLD code that opens a NEWER save
  // renders what it understands, and the moment it writes, everything it did not understand is
  // gone — a GM loses the ships and crew they just assigned, silently.
  // So a newer-than-us save is no longer tolerated: it is FLAGGED `stale: true` and the hosts refuse
  // to write. The flag rides the IN-MEMORY return only — the persisted shape is untouched, so this
  // is NOT a schema change and owes no R-SY4 halt (stated, not assumed).
  // We still normalize for DISPLAY, because a stale tab should show the encounter read-only rather
  // than go blank: render what you can, destroy nothing.
  // HONEST LIMIT, stated so it is never implied closed: a sentinel only protects from the version
  // that ships it ONWARD. It cannot reach tabs already running today's code, so the v6 window still
  // self-closes as clients pick up new bundles. What it buys is every FUTURE bump — the vehicle
  // programme alone plans two (benchStore v7, vessel v3).
  function normalize(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.groups)) return emptyState();
    // The comparison now lives in ONE place (C-B-6): Phase B added a third consumer of this rule
    // and cross-device sync is exactly when two builds meeting one save stops being an edge case.
    // Behaviour is unchanged — `toInt` still floors junk/missing to 0, which is never ahead.
    var __VG = (typeof window !== 'undefined' && window.SWRPGVersionGuard)
      || (typeof root !== 'undefined' && root && root.SWRPGVersionGuard);
    var __stale = __VG ? __VG.isAhead(toInt(raw.version), SCHEMA_VERSION)
                       : toInt(raw.version) > SCHEMA_VERSION;
    // R-NBB1 (BINDING): normalize BRANCHES on raw.version.
    //   v1 (or unversioned): no poolWounds → 0; members no count → 1.
    //   v2: group.poolWounds present; members no count → 1.
    //   v3: member.count present.
    //   v4 (BENCH-E1): poolWounds lives on the MEMBER (per minion LINE); group.poolWounds RETIRED.
    //     Migration v2/v3 → v4: the OLD group-level poolWounds moves to the group's FIRST member
    //     line (the dominant real case is a single-line minion group, which migrates perfectly;
    //     a multi-line v3 group's shared pool was RAW-wrong already — cross-type WT summing —
    //     so first-line is the least-bad landing, disclosed at the gate). v4+ reads member.poolWounds.
    var fromVersion = toInt(raw.version) || 1;
    var groups = raw.groups.map(function (g) {
      var members = g && Array.isArray(g.members)
        ? g.members.map(function (m) { return normalizeMember(m, fromVersion); }).filter(Boolean)
        : [];
      // v2/v3 → v4 migration: land the retired group pool on the first member line (once).
      if (fromVersion < 4 && g && toInt(g.poolWounds) > 0 && members.length) {
        members[0].poolWounds = toInt(g.poolWounds);
      }
      // v<5 → v5: arrangement stored _source_keys (unique pre-dup); remap to instance ids so ordering
      // survives. Tolerant: an id-based entry (v5) passes through; a _source_key maps to its member's id
      // (pre-v5 had no duplicates, so 1:1); anything unresolvable is dropped (ordering degrades to default).
      var rawArr = g && Array.isArray(g.arrangement) ? g.arrangement.slice() : [];
      var idSet = {}; members.forEach(function (m) { idSet[m.id] = true; });
      var firstIdBySrc = {}; members.forEach(function (m) { if (firstIdBySrc[m._source_key] == null) firstIdBySrc[m._source_key] = m.id; });
      var arrangement = rawArr.map(function (k) {
        return idSet[k] ? k : (firstIdBySrc[k] != null ? firstIdBySrc[k] : null);
      }).filter(function (k) { return k != null; });
      var out = {
        id: g && g.id != null ? String(g.id) : newId(),
        name: g && typeof g.name === 'string' ? g.name : 'Untitled group',
        arrangement: arrangement,
        notes: g && typeof g.notes === 'string' ? g.notes : '',
        // v6 (F-54): the craft present in this encounter. NOT given unknown-key pass-through — the
        // group level whitelists on purpose, because v4 RETIRED `group.poolWounds` and blanket
        // preservation would resurrect it (C-F54S-2 carve-out 1).
        vehicles: normalizeGroupVehicles(g && g.vehicles),
        members: members,
        // v7 (§4.2): the encounter's life. Read from a v<7 save as absent → 'prepped', 0, null (fromVersion < 7 reads
        // nothing; a v7 save is validated). `campaignId` is written by nobody in E3 (D-496 bind 1); it is only kept.
        state: fromVersion >= 7 && GROUP_STATES.indexOf(g && g.state) !== -1 ? g.state : 'prepped',
        rounds: fromVersion >= 7 ? toInt(g && g.rounds) : 0,
        campaignId: fromVersion >= 7 && g && typeof g.campaignId === 'string' && g.campaignId ? g.campaignId : null,
      };
      // the stamp syncMerge's UNITS reads (`swrpg_npc_bench` stamps). A v6 group has none and gains none on read:
      // only a write stamps (stamp(), below), so a migration never moves a record's recency.
      var at = g && Number(g.updatedAt);
      if (fromVersion >= 7 && isFinite(at) && at > 0) out.updatedAt = at;
      return out;
    });
    // A member aboard a craft the group does not carry is OLD DATA, not an error: drop the
    // membership, keep the member. Same posture as an unresolvable `_source_key` — degrade, never
    // throw, never silently invent a ship.
    groups.forEach(function (g) {
      var have = {}; (g.vehicles || []).forEach(function (v) { have[v.id] = true; });
      g.members.forEach(function (m) {
        if (m.vehicle && !have[m.vehicle.id]) delete m.vehicle;
      });
    });
    var __out = { version: SCHEMA_VERSION, groups: groups };
    if (__stale) __out.stale = true;   // F-54 sentinel — in-memory only
    return __out;
  }

  function normalizeMember(m, fromVersion) {
    if (!m || m._source_key == null) return null;   // a member with no id-ref can't resolve
    // v7 (§4.2): a player character stands in the fight as a member. Its `_source_key` is the reserved literal 'pc'
    // (no registry record carries it; test/encounter_v7_shape.cjs asserts so) and its `who` is the party vocabulary
    // verbatim. A 'pc' member whose `who` does not parse cannot resolve, so it is dropped like a member with no id-ref.
    var kind = fromVersion >= 7 && m.kind === 'pc' ? 'pc' : 'npc';
    var who = kind === 'pc' ? normalizeWho(m.who) : null;
    if (kind === 'pc' && !who) return null;
    var out = preserveUnknownMemberKeys(m, {
      // v5 (G-BENCH-DUP): instance identity. v5 saves carry it; pre-v5 members mint one on load (the same
      // migrate-on-read pattern group ids already use) — globally unique so a future encounter tracker can
      // reference individual combatants across groups without collision.
      id: (m.id != null && String(m.id)) || newId(),
      _source_key: String(m._source_key),
      currentWounds: toInt(m.currentWounds),
      currentStrain: toInt(m.currentStrain),
      conditions: Array.isArray(m.conditions) ? m.conditions.slice() : [],
      notes: typeof m.notes === 'string' ? m.notes : '',
      // v3 (T2-B): how many minions this LINE represents (Shyrack ×4 is ONE line, count 4).
      count: fromVersion >= 3 ? toCount(m.count) : 1,
      // v4 (BENCH-E1): this minion line's OWN shared wound pool (per-line, RAW same-type; EotE
      // p.390). Non-minion lines carry 0 and never render it. Migration lands the retired
      // group pool here (first line only, above). Pre-v4 lines start at 0.
      poolWounds: fromVersion >= 4 ? toInt(m.poolWounds) : 0,
      // v6 (F-54): which craft this NPC is aboard, and the ONE role RAW tracks.
      //   { id: <local vehicle instance id on the group>, pilot?: true }
      // A member is aboard AT MOST ONE craft; a craft holds many members — both directions read off
      // this single edge. `pilot` is a BOOLEAN AND STAYS ONE (R-F54C-1): RAW carries exactly one
      // crew distinction, `Pilot Only: Yes/No`, and one Pilot Only action per round per ship
      // (EotE printed pp.232–233, read at the corpus 2026-09-23 — the action sentence p.233, the maneuver
      // half and the Pilot Only column p.232; R-NPR57-6). A second role-ish field (`station`, `seat`, `gunner`) is the Non-Goal
      // boundary in code form and needs a new ruling, not a patch.
      vehicle: normalizeMemberVehicle(m.vehicle),
      kind: kind,
    });
    if (kind === 'pc') { out._source_key = PC_SOURCE_KEY; out.who = who; } else delete out.who;
    // `crits` and `timers`: absent ≡ []. Written only when there is one, so a v6 member reads back unchanged and a
    // minion line never carries the field at all (T4: minions never carry crits).
    var crits = fromVersion >= 7 ? normalizeCrits(m.crits) : [];
    var timers = fromVersion >= 7 ? normalizeTimers(m.timers) : [];
    if (crits.length) out.crits = crits; else delete out.crits;
    if (timers.length) out.timers = timers; else delete out.timers;
    return out;
  }

  // v7: `who` as partyStore.parseWho reads it — 'char:<savedCharacterId>' | 'name:<text>' — or null.
  function normalizeWho(w) {
    var P = party();
    var p = P && P.parseWho ? P.parseWho(w) : null;
    return p ? p.kind + ':' + p.ref : null;
  }
  // v7: `crits[{roll, label?, at?}]` — `roll` is the d100 total AFTER the +10s and is the id-ref (the row resolves by
  // range at read time); `label` only for a crit the GM typed; `at` the round. Effect text is never persisted.
  function normalizeCrits(list) {
    if (!Array.isArray(list)) return [];
    var out = [];
    list.forEach(function (c) {
      if (!c || typeof c !== 'object') return;
      var roll = parseInt(c.roll, 10);
      if (!isFinite(roll) || roll < 1) return;   // a crit with no total resolves to no row: old data, dropped
      var e = { roll: roll };
      if (typeof c.label === 'string' && c.label.trim()) e.label = c.label.trim();
      if (c.at != null && toInt(c.at) > 0) e.at = toInt(c.at);
      out.push(e);
    });
    return out;
  }
  // v7: `timers[{condition, round, active}]` — when a condition chip was set during a running fight (§3 row 7).
  function normalizeTimers(list) {
    if (!Array.isArray(list)) return [];
    var out = [];
    list.forEach(function (t) {
      if (!t || typeof t !== 'object' || typeof t.condition !== 'string' || !t.condition) return;
      out.push({ condition: t.condition, round: toInt(t.round), active: toInt(t.active) });
    });
    return out;
  }

  // C-F54S-2 — UNRECOGNISED MEMBER KEYS SURVIVE, so v6 is the LAST field this can happen to.
  //
  // `normalizeMember` whitelists: it rebuilds the record field by field, so any key it does not
  // know is silently dropped on the next write. That is why a v6 save opened by an already-deployed
  // v5 build loses its vehicle data — the exposure C-F54S-1 makes the gate state honestly.
  //
  // TWO CARVE-OUTS, BOTH LOAD-BEARING (the condition names them):
  //   1. MEMBER LEVEL ONLY. This is deliberately NOT applied at the group level, because v4 RETIRED
  //      `group.poolWounds` — blanket preservation there would resurrect a retired field, and
  //      retirement has to stay a deletion.
  //   2. It CANNOT protect v6 from v5 builds already in the wild; that code is shipped. This
  //      protects v7 onward. The hole is not closed, it is closed GOING FORWARD.
  //   3. AND IT IS NOT BLANKET — the RESOLVED STAT BLOCK STAYS STRIPPED. This is the carve-out the
  //      condition did not anticipate and the suite caught on the first run: charter §8 says a
  //      member persists an id-ref plus a mutable overlay and NEVER the resolved stats, so a save
  //      carrying `characteristics`/`weapons` must lose them. A blanket pass-through would have
  //      quietly resurrected the exact copy-the-stat-block defect the id-ref rule exists to
  //      prevent — "tolerate the unknown" cannot outrank "never persist what the registry owns".
  //      These are DENIED BY NAME rather than by a heuristic, so the list is auditable.
  var KNOWN_MEMBER_KEYS = ['id', '_source_key', 'currentWounds', 'currentStrain', 'conditions',
                           'notes', 'count', 'poolWounds', 'vehicle',
                           'kind', 'who', 'crits', 'timers'];   // v7 (§4.2)
  var NEVER_PERSIST_MEMBER_KEYS = ['characteristics', 'weapons', 'skills', 'talents', 'derived',
                                   'abilities', 'gear', 'equipment', 'equipmentDesc', 'tier',
                                   'name', 'description'];
  function preserveUnknownMemberKeys(src, out) {
    if (!src || typeof src !== 'object') return out;
    Object.keys(src).forEach(function (k) {
      if (KNOWN_MEMBER_KEYS.indexOf(k) !== -1) return;
      if (NEVER_PERSIST_MEMBER_KEYS.indexOf(k) !== -1) return;   // the registry owns these
      if (!(k in out)) out[k] = src[k];
    });
    return out;
  }

  // A member is aboard at most one craft. Absent/garbage means not aboard — never a throw.
  function normalizeMemberVehicle(v) {
    if (!v || typeof v !== 'object' || v.id == null) return undefined;
    var out = { id: String(v.id) };
    if (v.pilot === true) out.pilot = true;
    return out;
  }

  // v6 (F-54): the craft PRESENT in this encounter, each an id-ref into the vehicle registry plus a
  // local instance id. Group-level because a ship exists in the scene before anyone is assigned to
  // it — the order the reporter described — and because a crewless ship must be representable.
  // `key` is the registry key (433/433 present, 0 duplicates across the 11 shards); the stat block
  // is NEVER persisted and resolves at render, exactly as `_source_key` does for NPCs.
  // R-BVP-1 (`paper-bench-vessel-pointer`, reader first; built in SHIP YARD S4 JOB 2 by its grant): a craft
  // ENTRY keeps the keys this build does not know, so a newer build's field (the coming `vessel` pointer)
  // survives a round trip through an older one. This reader ships live strictly BEFORE any writer of `vessel`
  // (the R-S3K-1 HOLD). The group-level whitelist (C-F54S-2 carve-out 1) is unchanged.
  function normalizeGroupVehicles(list) {
    if (!Array.isArray(list)) return [];
    var out = [];
    list.forEach(function (v) {
      if (!v || typeof v !== 'object' || v.key == null) return;   // unusable entry: drop, never throw
      var entry = { id: (v.id != null && String(v.id)) || newId(), key: String(v.key) };
      Object.keys(v).forEach(function (k) { if (!(k in entry)) entry[k] = v[k]; });
      out.push(entry);
    });
    return out;
  }

  // v7 (§4.2)
  var GROUP_STATES = ['prepped', 'running', 'done'];
  var PC_SOURCE_KEY = 'pc';   // reserved: a PC member's id-ref; no registry record carries it
  function party() {
    var P = (typeof root !== 'undefined' && root && root.SWRPGParty) || null;
    if (!P && typeof require === 'function') { try { P = require('../../shared/partyStore.js'); } catch (e) { P = null; } }
    return P;
  }

  function toInt(n) { n = parseInt(n, 10); return isNaN(n) || n < 0 ? 0 : n; }
  function toCount(n) { n = parseInt(n, 10); return isNaN(n) || n < 1 ? 1 : n; }

  function newId() {
    if (typeof root !== 'undefined' && root.crypto && root.crypto.randomUUID) return root.crypto.randomUUID();
    return 'g' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
  }

  function clone(state) { return JSON.parse(JSON.stringify(state)); }
  // ponytail: JSON deep-clone per mutation — a GM has a handful of groups, not thousands;
  // structural sharing only if that ever stops being true.

  // v7 (§4.2): `updatedAt`, stamped on every group write — the stamp `syncMerge.js` UNITS already reads for the bench
  // and the bench never wrote. The clock is injectable for the guards (setClock); the hosts never set it.
  var clock = function () { return Date.now(); };
  function setClock(fn) { clock = typeof fn === 'function' ? fn : function () { return Date.now(); }; }
  function stamp(g) { if (g) g.updatedAt = clock(); return g; }

  function findGroup(state, id) {
    for (var i = 0; i < state.groups.length; i++) if (state.groups[i].id === id) return state.groups[i];
    return null;
  }

  // ── pure state-transforms (return a NEW state; callers feed it back to React + persist) ──

  function createGroup(state, name) {
    var s = clone(state);
    var id = newId();
    s.groups.push(stamp({ id: id, name: (name && name.trim()) || 'New group', arrangement: [], notes: '', members: [],
                          state: 'prepped', rounds: 0, campaignId: null }));
    return { state: s, id: id };
  }

  function deleteGroup(state, id) {
    var g0 = findGroup(state, id);
    if (g0) dropOwnedVessels(state, g0, g0.vehicles || []);   // R-SECB-2: tombstone what this encounter minted
    var s = clone(state);
    s.groups = s.groups.filter(function (g) { return g.id !== id; });
    return s;
  }

  function renameGroup(state, id, name) {
    var s = clone(state);
    var g = findGroup(s, id);
    if (g) { g.name = (name && name.trim()) || g.name; stamp(g); }
    return s;
  }

  // v5 (G-BENCH-DUP): the dedup is GONE — every add creates a NEW member with its own instance id, so a
  // rival/nemesis duplicates as an independent individual (own wounds) and a minion source adds a NEW ×N
  // LINE with its own count + pool (two "Stormtrooper ×4" lines coexist, pools never merged into ×8).
  function addMember(state, groupId, sourceKey) {
    var s = clone(state);
    var g = findGroup(s, groupId);
    if (g && sourceKey != null) {
      g.members.push({ id: newId(), _source_key: String(sourceKey), currentWounds: 0, currentStrain: 0, conditions: [], notes: '', count: 1, poolWounds: 0, kind: 'npc' });
      stamp(g);
    }
    return s;
  }

  // v7 (§4.2, bind 2): a player character joins the encounter as a member — `kind: 'pc'`, the reserved `_source_key`,
  // and `who` in the party vocabulary ('char:<id>' | 'name:<text>'). An unparseable `who` adds nothing. Its wounds and
  // strain are the sheet's (the mirror law): this member's are never written (setMember, resetGroup).
  function addPcMember(state, groupId, who) {
    var s = clone(state);
    var g = findGroup(s, groupId), w = normalizeWho(who);
    if (g && w) {
      g.members.push({ id: newId(), _source_key: PC_SOURCE_KEY, currentWounds: 0, currentStrain: 0, conditions: [], notes: '', count: 1, poolWounds: 0, kind: 'pc', who: w });
      stamp(g);
    }
    return s;
  }

  // v5: member ops key by the INSTANCE id (memberId), not _source_key — duplicates share a _source_key.
  function removeMember(state, groupId, memberId) {
    var s = clone(state);
    var g = findGroup(s, groupId);
    if (g) {
      g.members = g.members.filter(function (m) { return m.id !== memberId; });
      if (Array.isArray(g.arrangement)) g.arrangement = g.arrangement.filter(function (k) { return k !== memberId; });
      stamp(g);
    }
    return s;
  }

  // T1 (ruling bench-refinements-triage): write the group's member ORDER (the arrangement field, persisted
  // + v5 id-remapped since the beginning; no write op existed until now). Keeps only ids that are real
  // members (tolerant of stale/missing). Additive to the existing field — no schema change.
  function setArrangement(state, groupId, orderedIds) {
    var s = clone(state);
    var g = findGroup(s, groupId);
    if (g && Array.isArray(orderedIds)) {
      var ids = {};
      g.members.forEach(function (m) { ids[m.id] = true; });
      g.arrangement = orderedIds.filter(function (id) { return ids[id]; });
      stamp(g);
    }
    return s;
  }

  // Merge a mutable-overlay patch onto one member ({currentWounds?, currentStrain?, conditions?, notes?}).
  function setMember(state, groupId, memberId, patch) {
    var s = clone(state);
    var g = findGroup(s, groupId);
    if (g) {
      var m = g.members.filter(function (x) { return x.id === memberId; })[0];
      if (m && patch) {
        // v7 (§4.2, §10 "never"): a PC member's wounds and strain are the sheet's — no op writes them.
        if (patch.currentWounds != null && m.kind !== 'pc') m.currentWounds = toInt(patch.currentWounds);
        if (patch.currentStrain != null && m.kind !== 'pc') m.currentStrain = toInt(patch.currentStrain);
        if (Array.isArray(patch.conditions)) m.conditions = patch.conditions.slice();
        if (typeof patch.notes === 'string') m.notes = patch.notes;
        if (patch.count != null) m.count = toCount(patch.count);   // v3 (T2-B): minion line size, floor 1
        if (patch.poolWounds != null) m.poolWounds = toInt(patch.poolWounds);  // v4 (BENCH-E1): per-line pool
        stamp(g);
      }
    }
    return s;
  }

  // "New fight / heal all" — the explicit GM reset (D-NB1 ceiling; no auto-wipe anywhere else).
  // v4: zeroes every member's overlay AND its per-line pool.
  // R-SECB-2 (card `shipyard-encounter-craft-build`; R-SEC-4): HEAL & REPAIR ALL also returns each vessel the encounter minted
  // and still owns to zero damage — one updateVessel each, the record and the craft's pointer KEPT.
  function resetGroup(state, groupId) {
    var VS = vessels(), g0 = findGroup(state, groupId);
    if (VS && g0 && !state.stale) {
      var ids = ownedVesselIds(VS, g0, g0.vehicles || []);
      if (ids.length) VS.apply(function (st) {
        ids.forEach(function (id) { st = VS.updateVessel(st, id, { hull_current: 0, strain_current: 0 }, null); });
        return st;
      });
    }
    var s = clone(state);
    var g = findGroup(s, groupId);
    // v7 (R-E3P-1): also clears each member's `timers` (a timer without its chip means nothing) and KEEPS `crits` — a
    // Critical Injury persists until treated (EotE p.216–218); this reset is table bookkeeping, not treatment. A PC
    // member's wounds and strain are the sheet's and are not touched.
    if (g) {
      g.members.forEach(function (m) {
        if (m.kind !== 'pc') { m.currentWounds = 0; m.currentStrain = 0; }
        m.conditions = []; m.poolWounds = 0; delete m.timers;
      });
      stamp(g);
    }
    return s;
  }

  // v4 (BENCH-E1): set a MINION LINE's own pool wound total (per member, minion lines). Clamp >= 0;
  // the view clamps at the resolved line max (it knows the WT × count; the store holds only id-refs).
  // B-867: an optional `ceiling` (the view passes minionPoolCeiling = poolMax + 1) clamps the write; the
  // store alone does not know the WT, so without one it clamps at >= 0 only, as before.
  function setPoolWounds(state, groupId, memberId, value, ceiling) {
    var s = clone(state);
    var g = findGroup(s, groupId);
    if (g) {
      var m = g.members.filter(function (x) { return x.id === memberId; })[0];
      var v = toInt(value);
      if (ceiling != null) v = Math.min(v, Math.max(0, toInt(ceiling)));
      if (m) { m.poolWounds = v; stamp(g); }
    }
    return s;
  }

  // ── v7 (ENCOUNTERS E3): the encounter's life on the bench (`encounters-e2-manager-shape` §4.2–4.3) ─────────────
  //
  // `prepped → running → done → prepped`, and `running → prepped` (PAUSE). Any other move is refused (state handed
  // back unchanged), and so is a second `running` group (R-E2S-2: at most one). `rounds` is written only by END
  // (running → done), from the table's `round`. The table store's half lives in encounterLife.js.
  var STATE_MOVES = { prepped: ['running'], running: ['done', 'prepped'], done: ['prepped'] };
  function runningGroupId(state) {
    var g = (state && state.groups || []).filter(function (x) { return x.state === 'running'; })[0];
    return g ? g.id : null;
  }
  function setGroupState(state, groupId, next, rounds) {
    var g0 = findGroup(state, groupId);
    if (!g0 || (STATE_MOVES[g0.state || 'prepped'] || []).indexOf(next) === -1) return state;
    var other = runningGroupId(state);
    if (next === 'running' && other && other !== groupId) return state;
    var s = clone(state);
    var g = findGroup(s, groupId);
    g.state = next;
    if (next === 'done') g.rounds = toInt(rounds);
    stamp(g);
    return s;
  }

  // A crit on a member: `{roll, label?, at?}`, the roll the d100 total after the +10s (§4.2). Rivals and nemeses only:
  // a minion line never carries one (T4 — a crit on a group is minionCritPool's, one minion's worth of wounds) and a
  // PC's crits are its sheet's. `tier` is the resolved record's ('rival' | 'nemesis' | 'minion'); the store holds only
  // id-refs, so the caller hands it in. Anything else is refused (state unchanged).
  function addCrit(state, groupId, memberId, crit, tier) {
    var m0 = getMember(state, groupId, memberId);
    var c = normalizeCrits([crit])[0];
    if (!m0 || !c || m0.kind === 'pc' || (tier !== 'rival' && tier !== 'nemesis')) return state;
    var s = clone(state);
    var g = findGroup(s, groupId), m = getMember(s, groupId, memberId);
    m.crits = (m.crits || []).concat([c]);
    stamp(g);
    return s;
  }
  // The GM removes a crit (treated, or entered by mistake) — the only way one leaves a member (R-E3P-1).
  function removeCrit(state, groupId, memberId, index) {
    var m0 = getMember(state, groupId, memberId);
    if (!m0 || !Array.isArray(m0.crits) || !m0.crits[index]) return state;
    var s = clone(state);
    var g = findGroup(s, groupId), m = getMember(s, groupId, memberId);
    m.crits.splice(index, 1);
    if (!m.crits.length) delete m.crits;
    stamp(g);
    return s;
  }
  // A condition timer (§3 row 7): recorded when a chip is set during a running fight, at the table's `round` and
  // `active`. A repeat of the same condition replaces its timer (RAW: repeats add duration — the clock restarts from
  // the latest). The manager never clears a chip; dropTimer only forgets the clock (KEEP, or the GM's CLEAR).
  function addTimer(state, groupId, memberId, timer) {
    var m0 = getMember(state, groupId, memberId);
    var t = normalizeTimers([timer])[0];
    if (!m0 || !t) return state;
    var s = clone(state);
    var g = findGroup(s, groupId), m = getMember(s, groupId, memberId);
    m.timers = (m.timers || []).filter(function (x) { return x.condition !== t.condition; }).concat([t]);
    stamp(g);
    return s;
  }
  function dropTimer(state, groupId, memberId, condition) {
    var m0 = getMember(state, groupId, memberId);
    if (!m0 || !(m0.timers || []).some(function (x) { return x.condition === condition; })) return state;
    var s = clone(state);
    var g = findGroup(s, groupId), m = getMember(s, groupId, memberId);
    m.timers = m.timers.filter(function (x) { return x.condition !== condition; });
    if (!m.timers.length) delete m.timers;
    stamp(g);
    return s;
  }

  // Group-authored notes (v1 shape already persists `notes`; this is the setter the notes UI writes through).
  // ── v6 (F-54): the craft, and who is aboard ──────────────────────────────────────────────
  //
  // Three ops, and the invariants live HERE rather than in the UI — a second caller (an importer,
  // a future encounter tracker) must not be able to reach an illegal state by not knowing the rules.

  // Add a craft to the encounter. Id-ref only: `key` into the vehicle registry, plus a local
  // instance id so the SAME model can appear twice (two TIE fighters) without the memberships
  // becoming ambiguous — the same reason v5 gave members instance ids.
  function addVehicle(state, groupId, vehicleKey) {
    var s = clone(state);
    var g = findGroup(s, groupId);
    if (g && vehicleKey != null && String(vehicleKey)) {
      if (!Array.isArray(g.vehicles)) g.vehicles = [];
      g.vehicles.push({ id: newId(), key: String(vehicleKey) });
      stamp(g);
    }
    return s;
  }

  // Remove a craft, and take its crew off it. The membership is meaningless without the craft, and
  // leaving dangling ids would rely on normalize to clean up on the NEXT load — correct, but it
  // would mean the in-memory state disagreed with the persisted one until then.
  function removeVehicle(state, groupId, vehicleId) {
    var g0 = findGroup(state, groupId);
    if (g0) dropOwnedVessels(state, g0, (g0.vehicles || []).filter(function (v) { return v.id === vehicleId; }));   // R-SECB-2
    var s = clone(state);
    var g = findGroup(s, groupId);
    if (g && Array.isArray(g.vehicles)) {
      g.vehicles = g.vehicles.filter(function (v) { return v.id !== vehicleId; });
      g.members.forEach(function (m) { if (m.vehicle && m.vehicle.id === vehicleId) delete m.vehicle; });
      stamp(g);
    }
    return s;
  }

  // Put a member aboard a craft (or take them off with vehicleId = null).
  //
  // TWO INVARIANTS, both enforced here because neither is the UI's to remember:
  //   1. A member is aboard AT MOST ONE craft — assignment REPLACES, never accumulates.
  //   2. AT MOST ONE PILOT PER CRAFT (RAW: one Pilot Only action per round per ship, EotE p.242).
  //      Marking a new pilot DEMOTES the previous one rather than refusing — the GM's last action
  //      is the one they meant, and a silent refusal is the worse failure. It is a demotion, not a
  //      removal: the old pilot stays aboard.
  function setMemberVehicle(state, groupId, memberId, vehicleId, isPilot) {
    var s = clone(state);
    var g = findGroup(s, groupId);
    if (!g) return s;
    var m = g.members.filter(function (x) { return x.id === memberId; })[0];
    if (!m) return s;
    if (vehicleId == null) { delete m.vehicle; stamp(g); return s; }
    var known = (g.vehicles || []).some(function (v) { return v.id === vehicleId; });
    if (!known) return s;                       // never invent a craft the encounter does not carry
    m.vehicle = { id: String(vehicleId) };
    if (isPilot === true) {
      g.members.forEach(function (other) {
        if (other.id !== m.id && other.vehicle && other.vehicle.id === vehicleId) delete other.vehicle.pilot;
      });
      m.vehicle.pilot = true;
    }
    stamp(g);
    return s;
  }

  // ── ENCOUNTER CRAFT DAMAGE (card `shipyard-encounter-craft-build` R-SECB-1/-2, ruled in `shipyard-encounter-craft-build-recon`
  //    R-SECB-5/-6; concept `shipyard-encounter-craft-concept` R-SEC-2..4) ─────────────────────────────────────────────────
  //
  // A craft's hull trauma and system strain live on a Ship Yard VESSEL record, not on the bench: the craft's `vessel` field
  // points at it (R-BVP-1), and every write goes through the Yard store's own ops (`SWRPGVessels.apply` + acquire /
  // updateVessel / removeVessel; R-SEC-7). The record is minted on the FIRST mark, never on add (R-SEC-2), owned by
  // `bench:<groupId>` (R-SEC-3) so no hangar or owner list shows it.
  //
  // THESE FOUR ARE NOT PURE. Each writes the vessel store, so the host calls them OUTSIDE React's state updater (an updater
  // may run twice, and a mint must not; R-SECB-6). With no vessel store present markCraft refuses and the lifecycle three
  // (resetGroup, removeVehicle, deleteGroup) do exactly what they did before. The store is read at call time.
  var BENCH_OWNER = 'bench:';
  function vessels() {
    var VS = (typeof root !== 'undefined' && root && root.SWRPGVessels) || null;
    return VS && typeof VS.apply === 'function' && typeof VS.getState === 'function' ? VS : null;
  }
  function vesselById(VS, id) {
    if (id == null) return null;
    return ((VS.getState() || {}).vessels || []).filter(function (r) { return r && r.id === id; })[0] || null;
  }
  // the vessels this group's craft point at AND that it still owns (a record re-owned elsewhere is not the bench's to touch)
  function ownedVesselIds(VS, g, craft) {
    var out = [];
    craft.forEach(function (v) {
      var rec = v && v.vessel != null ? vesselById(VS, v.vessel) : null;
      if (rec && rec.owner === BENCH_OWNER + g.id && out.indexOf(rec.id) === -1) out.push(rec.id);
    });
    return out;
  }
  // R-SEC-4: removing a craft or deleting its group tombstones what the encounter minted (removeVessel: the store's V-4)
  function dropOwnedVessels(state, g, craft) {
    var VS = vessels();
    if (!VS || state.stale) return;
    var ids = ownedVesselIds(VS, g, craft);
    if (ids.length) VS.apply(function (st) { ids.forEach(function (id) { st = VS.removeVessel(st, id); }); return st; });
  }

  // markCraft(state, groupId, craftId, {track: 'hull'|'strain', delta}, now, vehicleRow) → { state, refused }
  //   `vehicleRow(key)` → the library row or null, handed by the host (R-SECB-5; cargo's gearRow precedent).
  //   REFUSALS, all decided before any write — `refused` names one and `state` is the one handed in:
  //     'no-vessel-store' · 'stale-bench' (a version-ahead save, held) · 'stale-vessels' (the Yard store's hold) ·
  //     'no-group' · 'no-craft' · 'no-row' (no vehicleRow, or no row for the key) · 'bad-mark' (track or delta) ·
  //     'below-zero' (the result under 0 — so a − on a fresh craft mints nothing).
  //   LATER MARKS (the pointer resolves): one updateVessel; the bench state comes back unchanged.
  //   FIRST MARK (no pointer, or a dangling one — R-SEC-4: a vessel deleted elsewhere reads fresh and the next mark re-points):
  //     acquire (owner bench:<groupId>) + updateVessel with the mark, in one apply; then the bench's `vessel` pointer, PERSISTED
  //     HERE. If that write is refused, removeVessel undoes the mint and the act answers 'bench-write-refused' (R-SCG-3's rule);
  //     if the Yard store held the mint, 'mint-refused'.
  function markCraft(state, groupId, craftId, mark, now, vehicleRow) {
    function no(why) { return { state: state, refused: why }; }
    var VS = vessels();
    if (!VS) return no('no-vessel-store');
    if (!state || state.stale) return no('stale-bench');
    if (typeof VS.isStale === 'function' && VS.isStale()) return no('stale-vessels');
    var g = findGroup(state, groupId);
    if (!g) return no('no-group');
    var v = (g.vehicles || []).filter(function (x) { return x.id === craftId; })[0];
    if (!v) return no('no-craft');
    if (typeof vehicleRow !== 'function' || !vehicleRow(v.key)) return no('no-row');
    var track = mark && mark.track, delta = mark ? Number(mark.delta) : NaN;
    if ((track !== 'hull' && track !== 'strain') || !delta || delta !== Math.floor(delta)) return no('bad-mark');
    var field = track === 'hull' ? 'hull_current' : 'strain_current';
    var rec = vesselById(VS, v.vessel);
    var next = (rec ? (rec[field] || 0) : 0) + delta;
    if (next < 0) return no('below-zero');
    var patch = {}; patch[field] = next;
    if (rec) {
      VS.apply(function (st) { return VS.updateVessel(st, rec.id, patch, now); });
      return { state: state, refused: null };
    }
    var id = null;
    VS.apply(function (st) {
      var r = VS.acquire(st, v.key, { owner: BENCH_OWNER + g.id }, now);
      id = r.id;
      return VS.updateVessel(r.state, id, patch, now);
    });
    if (!id || !vesselById(VS, id)) return no('mint-refused');
    var s = clone(state);
    var c = (stamp(findGroup(s, groupId)).vehicles || []).filter(function (x) { return x.id === craftId; })[0];
    c.vessel = id;
    if (!persist(s)) {
      VS.apply(function (st) { return VS.removeVessel(st, id); });
      return no('bench-write-refused');
    }
    return { state: s, refused: null };
  }

  function setGroupNotes(state, groupId, notes) {
    var s = clone(state);
    var g = findGroup(s, groupId);
    if (g && typeof notes === 'string') { g.notes = notes; stamp(g); }
    return s;
  }

  // ── minion-group math (RAW: EotE Core printed p.390 — the index's p.399; parallels AoR p.410 / FaD p.400,
  //    ruling npc-library-paper-concept R-NPC-5a; the corpus's own page numbers were cited here before) ──
  // Pure functions over (poolWounds, per-member WT, member count) — the view resolves the WTs from the
  // registry and calls these; the guard exercises them directly. See RULES_FOUNDATION_ADVERSARIES.md.
  function minionPoolMax(perMemberWT, count) {
    return Math.max(0, toInt(perMemberWT)) * Math.max(0, toInt(count));
  }
  // B-867 / R-NPC-5a — THE POOL'S CEILING IS poolMax + 1: the WIPED state. A member falls when the pooled
  // wounds EXCEED its share, so the last one falls only past the group's threshold; a pool clamped at
  // poolMax could never reach `standing = 0`. (An empty line — no threshold — has a ceiling of 0.)
  function minionPoolCeiling(perMemberWT, count) {
    var max = minionPoolMax(perMemberWT, count);
    return max > 0 ? max + 1 : 0;
  }
  // Members fall one at a time each time total wounds EXCEED a member's share (strictly greater — p.399
  // "exceeds that group member's share"; the group-as-a-whole is incapacitated at wounds > group WT — R-NPR57 R1).
  function minionFallen(poolWounds, perMemberWT, count) {
    var wt = toInt(perMemberWT), n = toInt(count), p = toInt(poolWounds);
    if (wt <= 0 || n <= 0 || p <= 0) return 0;
    // Strict "exceeds a share" governs EVERY boundary (RAW: a combatant/minion falls only when wounds are
    // GREATER THAN the threshold, never equal — EotE printed p.216, NPCs and creatures are defeated once
    // their wounds go past their threshold, read at the corpus 2026-09-23 (the
    // index's p.225); the minion clause printed p.390). So the group is wiped at
    // p > groupWT, NOT p >= groupWT: 3 troopers WT 5 → at 15/15 one still stands; the group dies at 16.
    // (Ruling npc-bench-fastfollow C1 — the earlier `p >= wt*n → all` short-circuit was the deviation.)
    return Math.min(n, Math.floor((p - 1) / wt));
  }
  // B-905 · ruling npc-paper-rows-8b R-NPR8B-2 — A CRITICAL HIT ON A MINION GROUP incapacitates EXACTLY ONE more:
  // the group takes one minion's share of wounds, so one member of the group drops
  // (EotE p.390 printed (index p.399), AoR p.410, FaD p.400 — read 2026-09-23). One share is added; where that does
  // not yet EXCEED a share (a pool sitting exactly on a share boundary — a fresh group, or k·WT), the pool takes
  // the first wound past it, so the outcome sentence holds (0 → WT + 1). Partial damage is kept; at poolMax a
  // crit WIPES (the ceiling, poolMax + 1). No stored counter: v6 stands.
  function minionCritPool(poolWounds, perMemberWT, count) {
    var wt = toInt(perMemberWT), n = toInt(count), p = toInt(poolWounds);
    if (wt <= 0 || n <= 0) return p;
    var ceiling = minionPoolCeiling(wt, n);
    return Math.min(ceiling, Math.max(p + wt, (minionFallen(p, wt, n) + 1) * wt + 1));
  }
  function minionStanding(poolWounds, perMemberWT, count) {
    return Math.max(0, toInt(count) - minionFallen(poolWounds, perMemberWT, count));
  }
  // A trained group skill has (standing - 1) ranks — one per member beyond the first; a lone minion has 0.
  function minionGroupRanks(standing) { return Math.max(0, toInt(standing) - 1); }

  function getMember(state, groupId, memberId) {
    var g = findGroup(state, groupId);
    if (!g) return null;
    return g.members.filter(function (m) { return m.id === memberId; })[0] || null;
  }

  // Render-time clamp for canon drift: hold a persisted current inside the tracker's valid range for
  // the FRESHLY-resolved threshold ([0, threshold*2] — the tracker's own ceiling). A stale value from
  // a since-shrunk stat block can't render out of range. threshold 0 (unresolvable) → 0.
  function clampCurrent(value, threshold) {
    var max = (toInt(threshold)) * 2;
    var v = toInt(value);
    return v > max ? max : v;
  }

  // ── localStorage edge (browser only; thin, swallows quota/parse failures) ──

  function load() {
    try {
      if (typeof root === 'undefined' || !root.localStorage) return emptyState();
      return normalize(JSON.parse(root.localStorage.getItem(KEY)));
    } catch (e) { return emptyState(); }
  }

  // F-54 — THE HOLD. A state loaded from a NEWER save is never written back, because
  // `normalize()` re-emits at OUR SCHEMA_VERSION and drops every field this build does not know —
  // which is precisely how a GM's ships and crew would vanish. One seam, every caller: the hold
  // belongs here rather than on each control, so a new control cannot forget it.
  // Silent by design at this layer — the SURFACE explains why (the banner); a store does not prompt.
  // R-SECB-6: it answers whether the write landed (true), so markCraft can undo a mint whose pointer was never saved.
  // Existing callers ignore the answer, as they ignored the old undefined.
  function persist(state) {
    if (state && state.stale) return false;
    try {
      if (typeof root === 'undefined' || !root.localStorage) return false;
      root.localStorage.setItem(KEY, JSON.stringify(normalize(state)));
      return true;
    } catch (e) { return false; /* quota / private mode — drop the write, keep the app alive */ }
  }

  // ── THE BOARD'S CARD/LIST PREFERENCE (B-764, ruling npc-library-paper-concept R-NPC-8) ──────────
  // A device preference, NOT the save shape: its own key, unchanged ('card' | 'list', default 'card').
  // It lived as a bare localStorage read/write inside the view (census §8's store-contract finding);
  // the store owns every localStorage edge of the bench now, so the view calls these.
  var BOARD_VIEW_KEY = 'swrpg_bench_board_view';
  function readBoardView() {
    try {
      var v = (typeof root !== 'undefined' && root.localStorage) ? root.localStorage.getItem(BOARD_VIEW_KEY) : null;
      return (v === 'list' || v === 'card') ? v : 'card';
    } catch (e) { return 'card'; }
  }
  function writeBoardView(v) {
    if (v !== 'list' && v !== 'card') return;
    try { if (typeof root !== 'undefined' && root.localStorage) root.localStorage.setItem(BOARD_VIEW_KEY, v); } catch (e) {}
  }

  var api = {
    KEY: KEY,
    SCHEMA_VERSION: SCHEMA_VERSION,
    emptyState: emptyState,
    normalize: normalize,
    createGroup: createGroup,
    deleteGroup: deleteGroup,
    renameGroup: renameGroup,
    addMember: addMember,
    addPcMember: addPcMember,           // v7 (E3)
    PC_SOURCE_KEY: PC_SOURCE_KEY,
    GROUP_STATES: GROUP_STATES,
    setGroupState: setGroupState,
    runningGroupId: runningGroupId,
    addCrit: addCrit,
    removeCrit: removeCrit,
    addTimer: addTimer,
    dropTimer: dropTimer,
    setClock: setClock,                 // guards only: the updatedAt clock
    removeMember: removeMember,
    setArrangement: setArrangement,
    setMember: setMember,
    resetGroup: resetGroup,
    setPoolWounds: setPoolWounds,
    setGroupNotes: setGroupNotes,
    addVehicle: addVehicle,
    removeVehicle: removeVehicle,
    setMemberVehicle: setMemberVehicle,
    markCraft: markCraft,   // R-SECB-1: encounter craft damage (not pure — see its block)
    BENCH_OWNER: BENCH_OWNER,
    getMember: getMember,
    clampCurrent: clampCurrent,
    minionPoolMax: minionPoolMax,
    minionPoolCeiling: minionPoolCeiling,
    minionFallen: minionFallen,
    minionCritPool: minionCritPool,
    minionStanding: minionStanding,
    minionGroupRanks: minionGroupRanks,
    load: load,
    persist: persist,
    BOARD_VIEW_KEY: BOARD_VIEW_KEY,
    readBoardView: readBoardView,
    writeBoardView: writeBoardView,
  };

  if (typeof root !== 'undefined') root.NpcBenchStore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
