/**
 * syncMerge.js — the ADOPTION MERGE: what happens the first time you sign in on a second device
 * and both sides already have data. Ruling `f34-phase-b-scope` §3 (F-B1 (d) + (c) fallback),
 * conditions C-B-1 (the tombstone interlock) and C-B-2/C-B-8.3 (recency, or the refusal to guess).
 *
 * THE MOMENT THIS EXISTS FOR. You built characters on your laptop while signed out. Your account
 * already has characters from your phone. You sign in. Whole-list last-write-wins would replace one
 * set with the other — recoverable from history, but the person is watching their work disappear.
 * So: merge by id, keep both sides' records, and only ask when the SAME record genuinely changed in
 * two places. The honest answer to "did I lose anything?" is no.
 *
 * WHY THIS RUNS ON THE CLIENT and does not violate the never-parse law: that law binds the SERVER
 * (`accounts-sync-architecture` C2) and in the same breath assigns shape-aware work to the client,
 * "exactly as today". This module is the client doing what it already does on every load — it knows
 * these envelopes because the store modules next to it define them.
 *
 * WHAT IT REFUSES TO DO. Where a record's recency cannot be computed — no stamp, a legacy
 * day-string, or an exact tie — it does NOT pick. It marks a conflict and the caller asks. Five of
 * the seven synced lists could not compute recency at all when this was written
 * (Docs/SYNC_RECENCY_AUDIT.md), so the refusal path is the common path, not the edge case.
 *
 * Pure. No storage, no network, no DOM. Dual-export for test/sync_merge.cjs.
 */
(function (root) {
  'use strict';

  var R = (typeof require === 'function' && typeof module !== 'undefined')
    ? require('./recency.js')
    : (root.SWRPGRecency || null);

  // ── the per-key descriptors ──────────────────────────────────────────────────
  // Each list-shaped key keeps its own envelope and its own idea of a record id, and this table is
  // the only place that knows which is which. `list` names the array field; `id` names the record's
  // identity; `ver` names the envelope's version field (R-S3K-1 (b), below); `emit` rebuilds the
  // envelope around a merged list so the payload goes back in the shape its own store expects.
  // Nothing here interprets a record's CONTENTS.
  var LISTS = {
    swrpg_saved_characters: {
      list: 'characters', id: 'id', ver: 'version',
      read: function (env) { return Array.isArray(env) ? env : ((env && env.characters) || []); },
      emit: function (env, list) { return { version: (env && env.version) || 1, characters: list }; },
    },
    swrpg_npc_cast: {
      list: 'npcs', id: '_source_key', ver: 'version',
      read: function (env) { return (env && env.npcs) || []; },
      emit: function (env, list) { return Object.assign({}, env, { npcs: list }); },
    },
    swrpg_npc_bench: {
      list: 'groups', id: 'id', ver: 'version',
      read: function (env) { return (env && env.groups) || []; },
      emit: function (env, list) { return Object.assign({}, env, { groups: list }); },
    },
    swrpg_vessels_v1: {
      list: 'vessels', id: 'id', ver: 'v',
      read: function (env) { return (env && env.vessels) || []; },
      emit: function (env, list) { return Object.assign({}, env, { vessels: list }); },
    },
    // K5 · the fleet unit (ruling `shipyard-s3-contracts` R-S3K-5, text in its brief §2; S4 JOB 2, R-S4G-17):
    // its OWN list key, never inside the vessels envelope (this adoption merge keeps only the local side's
    // non-list fields, so a remote device's units would vanish). Merges and tombstones by id. It has no
    // writer while K9 is OFF; the worker's SYNC_KEYS carries it too, shipped by the Pages deploy.
    swrpg_fleet_units_v1: {
      list: 'units', id: 'id', ver: 'v',
      read: function (env) { return (env && env.units) || []; },
      emit: function (env, list) { return Object.assign({}, env, { units: list }); },
    },
    // R6 lane A · THE GROUP RECORD (ruling `release-r4-shapes` R-R4S-4/5 item 3): `{ v: 1, parties: [...] }`, merged
    // by party id, stamp `updatedAt` (recency.js). Writer `lib/shared/partyStore.js`; the worker's SYNC_KEYS carries it.
    swrpg_party_v1: {
      list: 'parties', id: 'id', ver: 'v',
      read: function (env) { return (env && env.parties) || []; },
      emit: function (env, list) { return Object.assign({}, env, { parties: list }); },
    },
    // ENCOUNTERS E6 · THE CAMPAIGN RECORD (`encounters-e4-campaign-redraw` §5; `encounters-e6-plumbing` ADDENDUM 1, C2):
    // `{ version: 1, campaigns: [...] }`, merged by campaign id. Writer `lib/shared/campaignStore.js`.
    swrpg_campaigns: {
      list: 'campaigns', id: 'id', ver: 'version',
      read: function (env) { return (env && env.campaigns) || []; },
      emit: function (env, list) { return Object.assign({}, env, { campaigns: list }); },
    },
    // the wish list (R-BSBP-4/5; writer holdsStore.js): per id the later max(at, removed) wins, a tie to the removal; its
    // removals are its own tombstones (not swrpg_deleted_ids), dropped after 90 days
    swrpg_store_holds_v2: {
      list: 'holds', id: 'id', ver: 'v', tombs: false,
      read: function (env) { return (env && env.holds) || []; },
      emit: function (env, list) {
        var old = Date.now() - 90 * 864e5;
        return Object.assign({ v: 2 }, env, { holds: list.filter(function (h) { return h.removed == null || h.removed < h.at || h.removed > old; }) });
      },
      merge: function (l, r) {
        var last = function (h) { return Math.max(h.at || 0, h.removed || 0); }, gone = function (h) { return h.removed != null && h.removed >= h.at; };
        var n = R ? R.newerOf(last(l), last(r)) : null;
        return n === 'a' ? l : n === 'b' ? r : gone(r) && !gone(l) ? r : l;
      },
    },
  };

  // Whole-envelope keys: not lists, so there is nothing to union. Identical on both sides means no
  // question; different means the single prompt. Per-key LWW governs them in steady state — this
  // path is adoption only.
  //
  // `swrpg_map_pins` is the TENTH synced key and joins HERE rather than in LISTS above, ruled in
  // `f5-map-pins` §3 (R-F5-1 — that section is the R-SY4 paper). It is a flat planetId→{note,when}
  // map: an entry has no id of its own, no stamp, and no life apart from its planet, so "merge the
  // two sides by record identity" has nothing to key on and nothing to order by. The books key's
  // shape, not the roster's. Adding it to this array is also what registers push and pull — the
  // client's key list is derived from this module (sync.js `syncedKeys()`), so there is ONE list
  // rather than a second copy that drifts.
  var WHOLE = ['swrpg_creation_draft', 'swrpg_mods', 'swrpg_active_sources',
    'swrpg_gm_vehicle_overrides', 'swrpg_map_pins'];

  var TOMBSTONES = 'swrpg_deleted_ids';

  // ── THE MERGE UNITS (B-1650; brief `release-r7-sync-base-step0` ADDENDUM 1 §B.5, ruled `release-r7-bug-burndown`
  // ADDENDUM 390). With a BASE (what this device last agreed with the account, sync.js), two copies of one record are
  // merged UNIT BY UNIT: a unit changed on one side only is taken from that side, silently; a unit changed on both
  // sides, differently, is the question. A unit is a set of persisted paths some writer changes in ONE patch (C-1):
  // the XP ledger with everything bought with XP, the purse with everything it buys, so a merge can never pair one
  // device's XP with the other device's purchases. Units are NAMED at depth 1 (sheet edits are shallow patches of
  // top-level keys), never a deep walk. A key not named in a group is a unit of its own; `test/sync_units_census.cjs`
  // holds this table to the writers and the fixture. `nest` names the one object whose CHILDREN are the slots
  // (written 'nest.child'); `whole` makes the record one unit; `stamps` are writer clocks, never compared (the later
  // comparable one is kept). `alone` lists the keys KNOWN to be units of their own: the merge treats any unnamed key the
  // same way, and the census guard reds on a key that is in neither a group nor `alone`, so a new field is looked at
  // once. Cross-record invariants (a purse against a ship's hold) cannot be one unit: ADDENDUM 1 §B.5.7.
  var UNITS = {
    swrpg_saved_characters: {
      nest: 'sheetData',
      stamps: ['updatedAt', 'savedAt', 'lastOpenedAt'],
      groups: {
        xp: ['sheetData.xp', 'sheetData.skills', 'sheetData.talents', 'sheetData.specializations', 'sheetData.specializationIds',
          'sheetData.specialization', 'sheetData.derivedBonuses', 'sheetData.derivedConditional', 'sheetData.characteristics',
          'sheetData.characteristicsAtCreation', 'sheetData.talentCharacteristicChoices', 'sheetData.talentSkillChoices',
          'sheetData.forceRatingBase', 'sheetData.forcePowers', 'sheetData.signatureAbilities', 'sheetData.rewards',
          'sheetData.contacts', 'sheetData.speciesOption', 'sheetData.speciesOptionPicks', 'sheetData.speciesSkillChoices', 'sheetData.speciesGrantApplied',
          'sheetData.mechanicTradeIds', 'sheetData._xpRepairedAt',
          // F-100 M13 (R-M13L-11): this group is THE BUILD UNIT. Everything one Modify Save writes merges as one piece, so a Save never splits.
          'sheetData.mods', 'sheetData.own', 'sheetData.looseTalents', 'sheetData.changes', 'sheetData.speciesId', 'sheetData.careerId',
          'species', 'career', 'sheetData.species', 'sheetData.career', 'sheetData.woundBase', 'sheetData.strainBase', 'sheetData.derived',
          'sheetData.motivations', 'sheetData.motivation',   // R-M13B-10: the book's ONE motivation, structured
          'sheetData.talentChoices', 'sheetData.treelessTalents',
          'sheetData.freeRanks', 'book', 'sheetData.book', 'sheetData.obligation', 'sheetData.duty', 'sheetData.morality'],   // f100-m13-reach-paper §7.1   // R-M13B-42: a talent's pick is saved with the talent
        purse: ['sheetData.equipment', 'sheetData.crafts', 'sheetData.craft_notes', 'sheetData.craft_schematics',
          'sheetData.fortifications', 'sheetData.companions'],
        identity: ['name', 'accent', 'source', 'selectedChar', 'portrait',
          'sheetData.name', 'sheetData.source', 'sheetData.portrait'],
        physical: ['sheetData.appearance', 'sheetData.playerName'],
      },
      alone: ['id', 'order', 'sheetData.id', 'sheetData.currentWounds', 'sheetData.currentStrain', 'sheetData.criticalInjuries',
        'sheetData.notes', 'sheetData.journal', 'sheetData.backstory', 'sheetData.myShipId'],
    },
    swrpg_npc_cast: {
      stamps: ['updatedAt'],
      groups: { identity: ['key', '_source_key', '_provenance', 'createdAt'], statBlock: ['characteristics', 'derived', 'tier'] },
      alone: ['id', 'name', 'type', 'description', 'skills', 'talents', 'weapons', 'abilities', 'gear', 'equipmentDesc', 'card',
        'attachedProfileKey', 'affiliation', 'affiliation_path', '_affiliation_path_prev', 'source', 'source_code', 'source_tags'],
    },
    // encounters-e2-manager-shape ADDENDUM 4 @ 6ae692233: bench v7's state + rounds travel together; campaignId alone
    swrpg_npc_bench: { stamps: ['updatedAt'], groups: { table: ['members', 'arrangement', 'vehicles'], life: ['state', 'rounds'] }, alone: ['id', 'name', 'notes', 'campaignId'] },
    swrpg_vessels_v1: {
      stamps: ['updatedAt'],
      groups: { log: ['provenance', 'attachments', 'mounts', 'cargo', 'crits', 'destroyed', 'retired', 'hull_current', 'strain_current'] },
      // `v` is the record's SCHEMA number (vesselStore.js normalizeVessel → recordV, never lowered; OPEN-2, ADDENDUM 390)
      alone: ['id', 'v', 'vehicleKey', 'name', 'nickname', 'notes', 'owner', 'acquired', 'shields_current', 'crew', 'passengers',
        'image', 'decks', 'stores', 'routes', 'createdAt'],
    },
    swrpg_fleet_units_v1: { whole: true, stamps: ['updatedAt'] },
    swrpg_party_v1: { stamps: ['updatedAt'], groups: { rank: ['rank', 'rankUps', 'duty', 'members'] }, alone: ['id', 'name', 'obligation', 'bases', 'resource'] },
    // E6 plumbing ADDENDUM 1, P2.1: every field its own unit in v1. A `log` or `inbox` changed on two of one person's
    // devices before they sync is the question, not a union by entry id (named, unmeasured; later work).
    swrpg_store_holds_v2: { whole: true },   // merged by LISTS' own rule
    swrpg_campaigns: { stamps: ['updatedAt'], alone: ['id', 'role', 'name', 'partyId', 'createdAt', 'cast', 'log', 'frame', 'characterIds', 'table', 'inbox', 'handled', 'sessions', 'xpReceived', 'groupSummary', 'inPlay'] },   // R-T2S-1
    swrpg_creation_draft: { whole: true },
    swrpg_mods: { whole: true },
    swrpg_active_sources: { whole: true },
    swrpg_gm_vehicle_overrides: {},
    swrpg_map_pins: { nest: 'pins' },
  };

  function stableStringify(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
    return '{' + Object.keys(v).sort().map(function (k) {
      return JSON.stringify(k) + ':' + stableStringify(v[k]);
    }).join(',') + '}';
  }
  function same(a, b) { return stableStringify(a) === stableStringify(b); }

  // R-B1173C-8 (card f100-b1173-card ADDENDUM 1). Two copies of one record that differ ONLY in `lastOpenedAt` — the
  // stamp an opener writes, the relaunch's restore among them, often before adoption reads — carry no content to choose
  // between, so asking "which one do you keep?" is a false question. Returns the side to keep ('local' | 'remote'), or
  // null when anything else differs. recency.js is untouched: `lastOpenedAt` still never ranks an EDIT.
  function onlyOpenedDiffers(l, r) {
    if (!l || !r || typeof l !== 'object' || typeof r !== 'object') return null;
    var lo = l.lastOpenedAt, ro = r.lastOpenedAt;
    var lr = Object.assign({}, l), rr = Object.assign({}, r);
    delete lr.lastOpenedAt; delete rr.lastOpenedAt;
    if (!same(lr, rr)) return null;
    if (ro != null && (lo == null || ro > lo)) return 'remote';
    return 'local';
  }

  // An envelope's version as a number, or null (a legacy bare-array roster has none). Coerced the way
  // versionGuard.js coerces it, so the merge reads the field the way the sentinel will.
  function versionOf(env, field) {
    if (!env || typeof env !== 'object' || Array.isArray(env)) return null;
    var n = typeof env[field] === 'number' ? env[field] : parseInt(env[field], 10);
    return isFinite(n) ? n : null;
  }
  function above(a, b) { return a != null && (b == null || a > b); }

  function isPlain(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function own(o, k) { return isPlain(o) && Object.prototype.hasOwnProperty.call(o, k); }

  // the slots of one record copy: top-level keys (stamps and the nest left out) and the nest's children
  function slotsOf(u, rec, into) {
    if (!isPlain(rec)) return;
    Object.keys(rec).forEach(function (k) {
      if ((u.stamps || []).indexOf(k) !== -1) return;
      if (u.nest && k === u.nest && isPlain(rec[k])) {
        Object.keys(rec[k]).forEach(function (c) { into[u.nest + '.' + c] = true; });
        return;
      }
      into[k] = true;
    });
  }
  function slotGet(u, rec, slot) {
    if (u.nest && slot.indexOf(u.nest + '.') === 0) {
      var n = isPlain(rec) ? rec[u.nest] : undefined;
      var c = slot.slice(u.nest.length + 1);
      return own(n, c) ? n[c] : undefined;
    }
    return own(rec, slot) ? rec[slot] : undefined;
  }
  function slotSet(u, rec, slot, value) {
    if (u.nest && slot.indexOf(u.nest + '.') === 0) {
      var c = slot.slice(u.nest.length + 1);
      var n = Object.assign({}, isPlain(rec[u.nest]) ? rec[u.nest] : {});
      if (value === undefined) delete n[c]; else n[c] = value;
      rec[u.nest] = n;
      return;
    }
    if (value === undefined) delete rec[slot]; else rec[slot] = value;
  }
  var ABSENT = '\u0000absent';
  function slotKey(u, rec, slot) { var v = slotGet(u, rec, slot); return v === undefined ? ABSENT : stableStringify(v); }

  /**
   * mergeUnits(key, base, local, remote) → { merged, local, remote, asked }
   * Three copies of ONE record (or one WHOLE value), all present. Per unit (§D's F1–F5): equal → either; local = base →
   * remote (one-sided there); remote = base → local (one-sided here); else two-sided → asked. `merged` takes local for an
   * asked unit (C-CP-1's provisional); `local` / `remote` are the question's two candidates, each holding every one-sided
   * unit, so either answer keeps the other device's untouched changes. A unit is never split between candidates (C-1).
   */
  function mergeUnits(key, base, local, remote) {
    var u = UNITS[key] || { whole: true };
    var asked = false;
    if (u.whole || !isPlain(local) || !isPlain(remote) || !isPlain(base)) {
      var strip = function (v) {
        if (!isPlain(v) || !(u.stamps || []).length) return stableStringify(v);
        var c = Object.assign({}, v); (u.stamps || []).forEach(function (s) { delete c[s]; }); return stableStringify(c);
      };
      var b = strip(base), l = strip(local), r = strip(remote);
      var pick = l === r || r === b ? local : (l === b ? remote : null);
      if (pick) return { merged: withStamps(u, pick, local, remote), asked: false };
      return { merged: withStamps(u, local, local, remote), local: withStamps(u, local, local, remote),
               remote: withStamps(u, remote, local, remote), asked: true };
    }
    // a nest that is not an object on some side is one slot of its own
    var nestOk = !u.nest || [base, local, remote].every(function (x) { return x[u.nest] === undefined || isPlain(x[u.nest]); });
    var uu = nestOk ? u : Object.assign({}, u, { nest: null });
    var slots = {};
    slotsOf(uu, base, slots); slotsOf(uu, local, slots); slotsOf(uu, remote, slots);
    var unitOf = {};
    Object.keys(uu.groups || {}).forEach(function (g) { uu.groups[g].forEach(function (p) { unitOf[p] = 'group:' + g; }); });
    var units = {};
    Object.keys(slots).forEach(function (s) { var id = unitOf[s] || ('slot:' + s); (units[id] = units[id] || []).push(s); });
    var merged = clone(local), lc = clone(local), rc = clone(local);
    Object.keys(units).forEach(function (id) {
      var members = units[id];
      var sig = function (rec) { return members.map(function (s) { return slotKey(uu, rec, s); }).join('|'); };
      var b = sig(base), l = sig(local), r = sig(remote);
      var from;
      if (l === r || r === b) from = 'local';
      else if (l === b) from = 'remote';
      else from = null;
      members.forEach(function (s) {                  // from 'local': local's value is already in all three
        var rv = slotGet(uu, remote, s);
        if (from === 'remote') { slotSet(uu, merged, s, rv); slotSet(uu, lc, s, rv); slotSet(uu, rc, s, rv); }
        else if (from === null) slotSet(uu, rc, s, rv);
      });
      if (from === null) asked = true;
    });
    var out = { merged: withStamps(uu, merged, local, remote), asked: asked };
    if (asked) { out.local = withStamps(uu, lc, local, remote); out.remote = withStamps(uu, rc, local, remote); }
    return out;
  }
  function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  // §B.3: each stamp is the later comparable one; not comparable → local's (present beats absent)
  function withStamps(u, rec, local, remote) {
    if (!isPlain(rec) || !(u.stamps || []).length) return rec;
    var out = clone(rec);
    u.stamps.forEach(function (s) {
      var l = own(local, s) ? local[s] : undefined, r = own(remote, s) ? remote[s] : undefined;
      var w = R ? R.newerOf(l, r) : null;
      var v = w === 'b' ? r : (l !== undefined ? l : r);
      if (v === undefined) delete out[s]; else out[s] = v;
    });
    return out;
  }

  /**
   * mergeAdoption(local, remote[, base]) → { merged, conflicts }
   *
   *   local / remote  { key: parsedEnvelope }   — absent keys simply missing
   *   base            { key: { id: record } }    — OPTIONAL, sync.js's `swrpg_sync_base_v1` keys (a WHOLE key under
   *                   ''). Where it holds a record both sides changed, that record merges by UNITS (mergeUnits).
   *                   Absent — or no entry for that record — and the rule below is exactly what it was (CONTRACT 4).
   *   merged          { key: parsedEnvelope }   — what to write on both sides
   *   conflicts       [{ key, id?, kind }]      — every place it refused to choose
   *
   * `merged` is always safe to apply: where a conflict was found the LOCAL value is kept
   * provisionally, so nothing changes under the person until they answer. The conflict list is what
   * the prompt is built from; an empty list means the merge was unambiguous and no one is asked.
   */
  function mergeAdoption(local, remote, base) {
    local = local || {};
    remote = remote || {};
    base = isPlain(base) ? base : null;
    function baseOf(key, id) { return base && own(base[key], id) ? base[key][id] : undefined; }
    var merged = {};
    var conflicts = [];

    // ── tombstones FIRST, as a set union, never LWW (C-B-1) ────────────────────
    // A character deleted on device A is simply ABSENT from A's roster. A naive union with B's older
    // copy resurrects it. Deletion is the most deliberate thing a person does to their data and it
    // has to survive adoption, so the two tombstone lists are unioned and applied AFTER the record
    // union below. Union and never LWW: taking the "newer" list would discard the other device's
    // deletions wholesale.
    var tombs = {};
    [local[TOMBSTONES], remote[TOMBSTONES]].forEach(function (arr) {
      (Array.isArray(arr) ? arr : []).forEach(function (id) { if (id) tombs[String(id)] = true; });
    });
    merged[TOMBSTONES] = Object.keys(tombs);

    // ── list keys: union by id, newest-wins only where recency is computable ───
    Object.keys(LISTS).forEach(function (key) {
      var d = LISTS[key];
      var hasLocal = Object.prototype.hasOwnProperty.call(local, key);
      var hasRemote = Object.prototype.hasOwnProperty.call(remote, key);
      if (!hasLocal && !hasRemote) return;

      var lEnv = local[key], rEnv = remote[key];
      var lList = d.read(lEnv), rList = d.read(rEnv);

      var byId = {};
      var order = [];
      function put(rec, side) {
        var id = rec && rec[d.id];
        if (id == null) return;                       // a record with no identity cannot be merged
        id = String(id);
        if (!byId[id]) { byId[id] = {}; order.push(id); }
        byId[id][side] = rec;
      }
      lList.forEach(function (r) { put(r, 'local'); });
      rList.forEach(function (r) { put(r, 'remote'); });

      var out = [];
      order.forEach(function (id) {
        var pair = byId[id];
        if (!pair.remote) { out.push(pair.local); return; }
        if (!pair.local) { out.push(pair.remote); return; }
        if (same(pair.local, pair.remote)) { out.push(pair.local); return; }
        if (d.merge) { out.push(d.merge(pair.local, pair.remote)); return; }
        // B-1650 (§D R7–R9): with this device's base for the record, a change made on one side only is never
        // overwritten; only a unit changed on both sides asks. No base → the ruled rule below, unchanged.
        var b3 = baseOf(key, id);
        if (b3 !== undefined) {
          var m3 = mergeUnits(key, b3, pair.local, pair.remote);
          out.push(m3.merged);
          // `stamps`, in memory only: each candidate carries the later stamp (withStamps), so the question reads each side's own time here (ADDENDUM 531 item 3)
          if (m3.asked) conflicts.push({ key: key, id: id, kind: 'record', local: m3.local, remote: m3.remote, stamps: { local: pair.local.updatedAt, remote: pair.remote.updatedAt } });
          return;
        }
        // R-B1173C-8: equal in every field but lastOpenedAt is no question — nothing but a "last looked at" time
        // differs, so the later stamp is kept (present beats missing; a tie keeps local).
        var opened = onlyOpenedDiffers(pair.local, pair.remote);
        if (opened) { out.push(pair[opened]); return; }

        // Both sides changed the same record. Only now does recency matter.
        var winner = R ? R.newerOf(R.stampOf(pair.local), R.stampOf(pair.remote)) : null;
        if (winner === 'a') { out.push(pair.local); return; }
        if (winner === 'b') { out.push(pair.remote); return; }
        // Not comparable, or a tie. Refuse. Keep local provisionally and ask.
        //
        // C-CP-2 (ruling f34-conflict-prompt §3b): BOTH SIDES ride the conflict. The prompt has to
        // show a person what the choice is between, and this is the only moment both versions are
        // in hand — a beat later `pair.remote` is unreferenced and the server's copy is the only
        // one left. Costs nothing here; without it the prompt has an id and no answer to "between
        // what?". In-memory only: this object is never persisted, so no save shape changes.
        out.push(pair.local);
        conflicts.push({ key: key, id: id, kind: 'record', local: pair.local, remote: pair.remote });
      });

      // C-B-1's second half: tombstones apply AFTER the union, or the union undoes the deletion.
      var kept = d.tombs === false ? out : out.filter(function (rec) { return !tombs[String(rec[d.id])]; });

      // R-S3K-1 (b) · B3 — THE HIGHER ENVELOPE IS EMITTED. This used to wrap the union in the LOCAL
      // envelope whenever there was one. So a device on an older build that adopted a newer build's
      // account wrote the newer records under ITS OWN version: its store's version-ahead sentinel read
      // that number, did not trip, and its next write stripped every field it did not know, and the
      // sweep pushed the stripped list back over the account's copy (driven at carry d11b6e86). Now,
      // when the other side's envelope is strictly higher, IT is the one emitted, whole: its number
      // reaches the store, which holds, and any other key the newer build put on its envelope rides
      // along. Raising only the number would have dropped those, the same strip one level up. Equal
      // versions, a one-sided key and a higher local are exactly as before. The version-ahead DECISION
      // stays the stores' (versionGuard.js); the merge only stops losing the number it reads.
      var base = hasLocal ? lEnv : rEnv;
      if (hasLocal && hasRemote && above(versionOf(rEnv, d.ver), versionOf(lEnv, d.ver))) base = rEnv;
      merged[key] = d.emit(base, kept);
    });

    // ── whole-envelope keys ────────────────────────────────────────────────────
    WHOLE.forEach(function (key) {
      var hasLocal = Object.prototype.hasOwnProperty.call(local, key);
      var hasRemote = Object.prototype.hasOwnProperty.call(remote, key);
      if (!hasLocal && !hasRemote) return;
      if (!hasRemote) { merged[key] = local[key]; return; }
      if (!hasLocal) { merged[key] = remote[key]; return; }
      if (same(local[key], remote[key])) { merged[key] = local[key]; return; }
      var bw = baseOf(key, '');
      if (bw !== undefined) {                          // B-1650: the WHOLE value is one record, merged by its units
        var mw = mergeUnits(key, bw, local[key], remote[key]);
        merged[key] = mw.merged;
        if (mw.asked) conflicts.push({ key: key, kind: 'envelope', local: mw.local, remote: mw.remote });
        return;
      }
      merged[key] = local[key];                       // provisional, pending the answer
      // C-CP-2, the whole-envelope half — and the one that matters most in practice, because these
      // four keys conflict on ANY difference and are the ordinary case (two devices with different
      // books switched on), not the dramatic one.
      conflicts.push({ key: key, kind: 'envelope', local: local[key], remote: remote[key] });
    });

    return { merged: merged, conflicts: conflicts };
  }

  // ── THE MIGRATED COMPARE (B-1692, ruling `release-r7-bug-burndown` ADDENDUM 484). A load-time migration moves no stamp (ADDENDUM 453), so a
  // copy changed by one alone used to read as a change here. `canon` = { key, ver, record(rec) → the record's migrated COPY }, or null (no build
  // in hand: this host, or not warm yet), and null is exactly the rule above. Base, here and account each pass through it, so only a difference a
  // migration cannot explain still counts. Nothing is stamped: this adds no stored shape, field, key or base write. A newer build's envelope is
  // not this build's to read (F-54), so the plain merge takes it. A record its migration cannot read stays as it is, which can only ask.
  function canonOf(canon, rec) {
    try { return canon.record(rec); } catch (e) { return rec; }
  }
  function canonEnv(canon, d, env) {
    if (Array.isArray(env)) return env.map(function (r) { return canonOf(canon, r); });
    if (!isPlain(env) || !Array.isArray(env[d.list])) return env;
    var out = Object.assign({}, env);
    out[d.list] = env[d.list].map(function (r) { return canonOf(canon, r); });
    return out;
  }
  function canonApplies(local, remote, canon) {
    var d = canon && LISTS[canon.key];
    return !!d && !above(versionOf((local || {})[canon.key], d.ver), canon.ver) && !above(versionOf((remote || {})[canon.key], d.ver), canon.ver);
  }
  function mergeCanon(local, remote, base, canon) {
    local = local || {};
    remote = remote || {};
    if (!canonApplies(local, remote, canon)) return mergeAdoption(local, remote, base);
    var d = LISTS[canon.key];
    var l = Object.assign({}, local), r = Object.assign({}, remote), b = base;
    if (own(local, canon.key)) l[canon.key] = canonEnv(canon, d, local[canon.key]);
    if (own(remote, canon.key)) r[canon.key] = canonEnv(canon, d, remote[canon.key]);
    if (isPlain(base) && isPlain(base[canon.key])) {
      b = Object.assign({}, base);
      b[canon.key] = {};
      Object.keys(base[canon.key]).forEach(function (id) { b[canon.key][id] = canonOf(canon, base[canon.key][id]); });
    }
    return mergeAdoption(l, r, b);
  }
  // The same compare for ONE open question, when the build warms after it was raised (ADDENDUM 484 Q2 (a)). `here` is the record as stored NOW,
  // never the question's copy, so an edit made while the question stood is in the compare. → the record to keep, or null: the question stands.
  function mootOf(conflict, here, base, canon) {
    var d = canon && conflict && conflict.kind === 'record' && conflict.key === canon.key ? LISTS[canon.key] : null;
    if (!d || !isPlain(here) || !isPlain(conflict.remote)) return null;
    var l = {}, r = {}, b = null;
    l[canon.key] = [here];
    r[canon.key] = [conflict.remote];
    if (isPlain(base) && own(base[canon.key], String(conflict.id))) {
      b = {};
      b[canon.key] = {};
      b[canon.key][String(conflict.id)] = base[canon.key][String(conflict.id)];
    }
    var res = mergeCanon(l, r, b, canon);
    return res.conflicts.length ? null : d.read(res.merged[canon.key])[0];
  }

  var API = { mergeAdoption: mergeAdoption, mergeUnits: mergeUnits, mergeCanon: mergeCanon, canonApplies: canonApplies, mootOf: mootOf, LISTS: LISTS, WHOLE: WHOLE, TOMBSTONES: TOMBSTONES, UNITS: UNITS };

  if (typeof window !== 'undefined') root.SWRPGSyncMerge = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : this);
