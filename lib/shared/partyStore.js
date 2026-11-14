/* lib/shared/partyStore.js — THE GROUP RECORD (R6 lane A): the one writer of `swrpg_party_v1`, for both apps.
 *
 * Save shape FIXED by ruling `release-r4-shapes` ADDENDUM 1 A1.2 (R-R4S-4, amended by R-R4S-9); this module is its only
 * writer, so the contract lives in one place:
 *
 *   { v: 1, parties: [ { id: 'party',                 // = the owner tag on swrpg_vessels_v1 / swrpg_fleet_units_v1
 *       name: '',                                     // '' shows "THE GROUP"
 *       members: [ { who: 'char:<saved id>', last: 'Tarn' },        // live: Duty read from that sheet at render
 *                  { who: 'name:Mira', duty: [{type, magnitude}], obligation: [] } ],
 *       duty: [ {type, magnitude} ],                  // the group's own rows
 *       obligation: [],                               // the group's own rows (a base adds its own at render)
 *       rank: 0,                                      // stored: it cannot be derived once Duty resets
 *       rankUps: [ { at, from, to, reward: 'gear'|'vehicle'|'asset'|'base', note, undo? } ],
 *       bases: [ … ],                                 // S4 (lane D's normalizer, below)
 *       resource: null | { from, pick, skills?, mentor?, refs?, note },   // the group's starting resource (R-R6PC-1, below)
 *       updatedAt } ] }                               // ms epoch (recency.js: the only comparable stamp)
 *
 * NEVER STORED: the group Duty total, its parts, the progress to the next rank, a base's Obligation. They derive at
 * render from the members' sheets and the group's rows (`dutyParts`, `dutyTotal`, `rankProgress`).
 *
 * `rankUps[].undo` — the implementer's (card `release-r6-backend-card` §3 IMPLEMENTER'S): the Duty the rank-up reset,
 * so its UNDO can put it back exactly. It rides the record by the `keep` idiom: an older reader keeps it untouched.
 * Only the LATEST rank-up can be undone, and an undo drops its entry whole.
 *
 * THE RANK-UP (R-R4S-6) is one all-or-nothing act. It sets `rank`, appends `rankUps`, writes 0 into every Duty row of
 * every `char:` member's sheet through the roster's own record write (`SWRPGRoster.upsertSavedCharacter`, the path
 * every sheet edit takes), and zeroes every `name:` stub's and the group's Duty rows. A member sheet that cannot be
 * written — missing, or the roster held by the F-54 guard — STOPS the act before any write, naming it. A write that
 * fails partway puts both keys back as they were (`release-r3-no-loss` C1's rule, the backup restore's).
 *
 * THE STARTING RESOURCE (ruling `release-r6-party-c0` R-R6PC-1/2): `from` names the BOOK whose page grants the pick
 * (`eote` p.99 · `aor` p.111 · `fad` p.109 · `fh` Far Horizons pp.81–82), closed; `pick` is closed to the five below;
 * only the tabled pairs (RESOURCE_PAIRS) do anything. `skills` rides only a holocron, as two distinct skill ids. `refs`
 * points at the ship(s) or base the pick produced, by id; they live in their own stores. Every effect is DERIVED
 * (`resourceEffects`), never stored. A malformed or unknown resource is kept as stored and does nothing (old data is
 * history). The engine READS of those effects are lane D's (R-R6PC-2), so nothing here is shown or charged.
 *
 * THE MENTOR'S KIND (ruling `release-r6-bases-registry` Q4, amending R-R6PC-1): `mentor` rides only `pick: 'mentor'`,
 * closed to MENTOR_KINDS — FaD p.109's Jedi mentor, or one of Disciples of Harmony pp.79–80's four traditions, which
 * stand in for the Core Rulebook's mentor benefit. Absent reads 'jedi'; an unknown value is
 * kept as stored and is inert (`mentorKind` → null). The price arms are charResolve's (lane D).
 *
 * THE BASES (S4, release-r4-shapes A1.3, amended by `release-r6-bases-registry` Q3 (i); lane D's normalizer):
 *   { id: 'base-<base36>', type: 'HOMESTEAD'|'BUSINESS'|'REBELBASE'|'CIVREFIT', name, place,
 *     focus: '<BaseFoci key>', focusSkill?: '<skill id>',   // focusSkill only where the focus has `choose` (Service)
 *     start: 'creation'|'bought'|'reward'|'story',
 *     upgrades: [ { key: '<BaseUpgrades key>', option: '<option key>'|null, paid: 'credits'|'obligation'|'rank'|'story' } ],
 *     notes: '' }
 * Keys only. Every number (the base's Obligation, profit, purchases left, the skills it grants) derives at render
 * through lib/shared/baseDerive.js against bases.json. A value outside a closed vocabulary is kept as stored.
 *
 * R-R4S-7: no person-to-person path. Another player's character is a `name:` stub, and only its rows here are reset.
 *
 * Classic script → window.SWRPGParty; CommonJS for node guards (test/party_store.cjs). Globals (localStorage,
 * SWRPGVersionGuard, SWRPGRoster) are read at CALL time, so load order among the deferred scripts does not matter.
 */
(function (global) {
  'use strict';

  var PARTY_KEY = 'swrpg_party_v1';
  var SCHEMA_V = 1;
  var PARTY_ID = 'party';
  var THRESHOLD = 100;                                   // "exceeds 100" (AoR Core pp.49–50)
  var REWARDS = { gear: 1, vehicle: 1, asset: 1, base: 1 };   // S5's four (AoR Core p.50; Desperate Allies p.88)

  // R-R6PC-1's table: the book → the picks its page grants. Any other pair is kept and does nothing.
  var RESOURCE_PAIRS = { eote: ['ship'], fh: ['base'], aor: ['ship', 'ywings', 'base'], fad: ['ship', 'holocron', 'mentor'] };
  var MENTOR_KINDS = ['jedi', 'baran_do', 'dagoyan', 'findsmen', 'sith'];   // FaD p.109 · Disciples of Harmony pp.79–80
  var BASE_STARTS = ['creation', 'bought', 'reward', 'story'];
  var BASE_PAID = ['credits', 'obligation', 'rank', 'story'];
  var AOR_BASE_CREDITS = 1000;                           // AoR Core p.111: "an additional 1,000 credits' worth of starting gear"

  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function VG() {
    var g = (typeof window !== 'undefined' && window.SWRPGVersionGuard) || (global && global.SWRPGVersionGuard);
    return g || { isAhead: function (raw, schema) { return typeof raw === 'number' && raw > schema; } };
  }
  function LS() {
    try { return (typeof window !== 'undefined' && window.localStorage) || (global && global.localStorage) || null; }
    catch (e) { return null; }
  }
  function roster() { return (typeof window !== 'undefined' && window.SWRPGRoster) || (global && global.SWRPGRoster) || null; }
  function now() { try { return Date.now(); } catch (e) { return 0; } }

  // ── WHAT A NORMALIZER DOES NOT KNOW, IT KEEPS (vesselStore's R-S3K-1 (a) idiom) ──
  // A known field takes its normalized value in place, an unknown one rides through untouched, and a known field
  // the input lacks is filled at the end in this file's order. A save this build did not change writes back equal.
  function keep(src, known) {
    var out = {};
    if (isObj(src)) Object.keys(src).forEach(function (k) { out[k] = own(known, k) ? known[k] : src[k]; });
    Object.keys(known).forEach(function (k) { if (!own(out, k)) out[k] = known[k]; });
    return out;
  }
  function str(v) { return v == null ? '' : String(v); }
  function mag(v) { var n = parseInt(v, 10); return isFinite(n) && n > 0 ? n : 0; }

  // A Duty or Obligation row: `{ type, magnitude }` (the printed sheet's TYPE column; OggDude's CharDuty is a row).
  function normalizeRow(r) {
    if (!isObj(r)) return null;
    return keep(r, { type: str(r.type), magnitude: mag(r.magnitude) });
  }
  function rows(list) { return Array.isArray(list) ? list.map(normalizeRow).filter(Boolean) : []; }

  // `who` reuses the crew-seat vocabulary (vesselStore `parseWho`): `char:<id>` or `name:<text>`. `npc:` is OUT
  // (R-R4S-4: a group's members are player characters). A member with any other `who` is dropped.
  function parseWho(w) {
    var s = str(w), i = s.indexOf(':');
    if (i < 1) return null;
    var kind = s.slice(0, i), ref = s.slice(i + 1);
    if ((kind !== 'char' && kind !== 'name') || !ref) return null;
    return { kind: kind, ref: ref };
  }
  function normalizeMember(m) {
    if (!isObj(m)) return null;
    var w = parseWho(m.who);
    if (!w) return null;
    if (w.kind === 'char') return keep(m, { who: 'char:' + w.ref, last: str(m.last) });
    return keep(m, { who: 'name:' + w.ref, duty: rows(m.duty), obligation: rows(m.obligation) });
  }
  function normalizeRankUp(u) {
    if (!isObj(u)) return null;
    var known = {
      at: u.at != null ? u.at : null,
      from: typeof u.from === 'number' && isFinite(u.from) ? u.from : 0,
      to: typeof u.to === 'number' && isFinite(u.to) ? u.to : 0,
      reward: REWARDS[u.reward] ? u.reward : null,
      note: str(u.note),
    };
    return keep(u, known);
  }
  // The starting resource. A well-formed pick normalizes in place (unknown keys kept); anything else is kept AS STORED.
  function resourcePairOk(r) {
    return isObj(r) && own(RESOURCE_PAIRS, r.from) && RESOURCE_PAIRS[r.from].indexOf(r.pick) !== -1;
  }
  function skillsOk(list, vocabIds) {
    if (!Array.isArray(list) || list.length !== 2) return false;
    var a = list[0], b = list[1];
    if (typeof a !== 'string' || typeof b !== 'string' || !a || !b || a === b) return false;
    return !vocabIds || (vocabIds.indexOf(a) !== -1 && vocabIds.indexOf(b) !== -1);
  }
  function normalizeResource(r) {
    if (r == null) return null;
    if (!resourcePairOk(r)) return r;                   // kept as stored; does nothing
    var known = { from: r.from, pick: r.pick };
    if (own(r, 'skills')) known.skills = Array.isArray(r.skills) ? r.skills.slice() : r.skills;
    if (own(r, 'mentor')) known.mentor = r.mentor;     // kept as stored; `mentorKind` reads it (Q4)
    if (own(r, 'refs')) known.refs = Array.isArray(r.refs) ? r.refs.filter(function (x) { return x != null && x !== ''; }).map(String) : r.refs;
    known.note = str(r.note);
    return keep(r, known);
  }

  // A base (S4). Only the fields a base CARRIES normalize (in place); nothing is filled in, so a save this build did not
  // change writes back equal. Unknown fields ride through; a value outside its vocabulary is kept as stored.
  function normalizeBaseUpgrade(u) {
    if (!isObj(u)) return null;
    var known = {};
    if (own(u, 'key')) known.key = str(u.key);
    if (own(u, 'option')) known.option = u.option == null || u.option === '' ? null : String(u.option);
    return keep(u, known);
  }
  function normalizeBase(b) {
    if (!isObj(b)) return null;
    var known = {};
    ['id', 'type', 'name', 'place', 'notes'].forEach(function (k) { if (own(b, k)) known[k] = str(b[k]); });
    ['focus', 'focusSkill'].forEach(function (k) { if (own(b, k)) known[k] = b[k] == null || b[k] === '' ? null : String(b[k]); });
    if (own(b, 'upgrades')) known.upgrades = (Array.isArray(b.upgrades) ? b.upgrades : []).map(normalizeBaseUpgrade).filter(Boolean);
    return keep(b, known);
  }

  function normalizeParty(p) {
    if (!isObj(p) || p.id == null || p.id === '') return null;
    var seen = {};
    var members = (Array.isArray(p.members) ? p.members : []).map(normalizeMember).filter(function (m) {
      if (!m || seen[m.who]) return false;              // one row per member
      seen[m.who] = 1; return true;
    });
    var known = {
      id: String(p.id),
      name: str(p.name),
      members: members,
      duty: rows(p.duty),
      obligation: rows(p.obligation),
      rank: typeof p.rank === 'number' && isFinite(p.rank) && p.rank > 0 ? Math.floor(p.rank) : 0,
      rankUps: (Array.isArray(p.rankUps) ? p.rankUps : []).map(normalizeRankUp).filter(Boolean),
      bases: (Array.isArray(p.bases) ? p.bases : []).map(normalizeBase).filter(Boolean),
      updatedAt: p.updatedAt != null ? p.updatedAt : null,
    };
    // `resource` joins a record only when it carries one, so a record from before the field writes back equal.
    if (own(p, 'resource')) known.resource = normalizeResource(p.resource);
    return keep(p, known);
  }

  function emptyParty(id) {
    return normalizeParty({ id: id || PARTY_ID, name: '', members: [], duty: [], obligation: [], rank: 0, rankUps: [], bases: [] });
  }

  // ── persistence (versioned envelope; F-54 hold at module scope, as vesselStore V-1 / roster) ──
  var _stale = false;
  function readRaw() { var ls = LS(); try { return ls ? ls.getItem(PARTY_KEY) : null; } catch (e) { return null; } }
  function fromRaw(raw) {
    var state = { v: SCHEMA_V, parties: [] }, ahead = false;
    try {
      var s = raw ? JSON.parse(raw) : null;
      if (isObj(s)) {
        var rawV = typeof s.v === 'number' ? s.v : SCHEMA_V;
        ahead = VG().isAhead(rawV, SCHEMA_V);           // read for ANY envelope: a newer build's save is never ours to rewrite
        state = {};
        Object.keys(s).forEach(function (k) {
          if (k === 'stale') return;
          state[k] = k === 'v' ? rawV : k === 'parties'
            ? (Array.isArray(s.parties) ? s.parties.map(normalizeParty).filter(Boolean) : []) : s[k];
        });
        if (!own(state, 'v')) state.v = rawV;
        if (!own(state, 'parties')) state.parties = [];
      }
    } catch (e) {}
    _stale = ahead;
    if (ahead) state.stale = true;                      // a read-only projection, never what the hold reads
    return state;
  }
  function load() { return fromRaw(readRaw()); }

  // ── THE ENGINE READER (R6 lane D; ruling `release-r6-bases-registry` Q7): what both hosts register with
  // CharResolve.setGroupResolver at boot (`registerEngineReader`). It answers `{ parties, bases, chars }` — the stored groups,
  // re-parsed only when the stored string changes (careerSkillStatus asks it on every call), and bases.json, fetched once
  // (null until it lands: the holocron's skills read at once, a base's on the next render), and `chars`, the roster's
  // records on demand (rosterChars). Reading never touches the F-54 hold's flag.
  var _snapRaw, _snapParties = [], _basesReg = null, _basesAsked = false;
  function engineReader() {
    var raw = readRaw();
    if (raw !== _snapRaw) {
      var held = _stale;
      _snapRaw = raw; _snapParties = fromRaw(raw).parties || [];
      _stale = held;
    }
    if (!_basesAsked && typeof fetch === 'function') {
      _basesAsked = true;
      try {
        fetch('/public/data/canonical/bases.json').then(function (r) { return r.ok ? r.json() : null; })
          .then(function (j) { if (isObj(j) && isObj(j.types)) _basesReg = j; }, function () {});
      } catch (e) {}
    }
    return { parties: _snapParties, bases: _basesReg, chars: rosterChars };
  }
  // The saved roster's records, for groupGrants' members' items (B-1039, ruling release-r7-bug-burndown ADDENDUM 314 C5):
  // asked only when the sheet is in a group, re-read only when the stored roster string changes. The roster the app
  // already holds — no new saved, synced or wire field.
  var _snapRosterRaw, _snapRoster = [];
  function rosterChars() {
    var raw = null, ls = LS();
    try { raw = ls ? ls.getItem('swrpg_saved_characters') : null; } catch (e) { raw = null; }
    if (raw !== _snapRosterRaw) {
      _snapRosterRaw = raw;
      // parsed HERE, not through SWRPGRoster.loadSavedCharacters: that read sets the F-54 hold and may write a migration
      // back; this one only reads (both stored shapes, and a legacy double-nested sheet read where its sheet is)
      var list = [];
      try { var st = raw ? JSON.parse(raw) : null; list = Array.isArray(st) ? st : (st && Array.isArray(st.characters) ? st.characters : []); } catch (e) { list = []; }
      _snapRoster = list.filter(isObj).map(function (r) {
        var sd = r.sheetData;
        return (sd && sd.sheetData && sd.sheetData.characteristics) ? Object.assign({}, r, { sheetData: sd.sheetData }) : r;
      });
    }
    return _snapRoster;
  }
  function registerEngineReader(charResolve) {
    var CR = charResolve || (typeof window !== 'undefined' && window.CharResolve) || (global && global.CharResolve);
    if (CR && typeof CR.setGroupResolver === 'function') CR.setGroupResolver(engineReader);
  }
  function isStale() { return _stale; }
  function envelope(state) {
    var out = {};
    Object.keys(state || {}).forEach(function (k) {
      if (k === 'stale') return;
      out[k] = k === 'v' ? SCHEMA_V : k === 'parties' ? (state.parties || []).map(normalizeParty).filter(Boolean) : state[k];
    });
    if (!own(out, 'v')) out.v = SCHEMA_V;
    if (!own(out, 'parties')) out.parties = [];
    return out;
  }
  // F-54: a stale state is never written back. Returns the written envelope, or null when nothing was written.
  function save(state) {
    if (_stale || (state && state.stale)) return null;
    var ls = LS();
    if (!ls) return null;
    var gone = state && state[DELETED];                 // read before refreshLast: a copy drops the non-enumerable mark
    var env = envelope(refreshLast(state));
    writeTombstones(ls, gone);                          // FIRST, as vesselStore V-4: a write cut short still reads as a delete
    ls.setItem(PARTY_KEY, JSON.stringify(env));        // throws on quota: callers that must be atomic catch it
    return env;
  }

  // ── E6 plumbing (ruling `encounters-e6-plumbing` ADDENDUM 1, P1.3): A REMOVED PARTY LEAVES A TOMBSTONE ──
  // vesselStore's idiom (V-4): `removeParty` stays a pure op and marks its result with the ids it removed on a
  // NON-ENUMERABLE property — never serialized, never copied by Object.assign — and `save` appends them to the shared
  // `swrpg_deleted_ids` list (every synced LISTS key's), so a party removed here does not come back at the next adoption.
  // A list this build cannot read is left alone; unparseable text is replaced, as the roster's own writer does.
  var DELETED = '_deletedIds', TOMBSTONES_KEY = 'swrpg_deleted_ids';
  function writeTombstones(ls, ids) {
    if (!ids || !ids.length) return;
    var raw = ls.getItem(TOMBSTONES_KEY), list;
    try { list = raw == null ? [] : JSON.parse(raw); } catch (e) { list = []; }
    if (list === null) list = [];
    if (!Array.isArray(list)) return;
    var have = {}, add = [];
    list.forEach(function (x) { have[String(x)] = true; });
    ids.forEach(function (id) { if (!have[id]) { have[id] = true; add.push(id); } });
    if (add.length) ls.setItem(TOMBSTONES_KEY, JSON.stringify(list.concat(add)));
  }

  // R-R4S-9: `last` is refreshed on every write of the group record while the sheet resolves; never during render.
  function refreshLast(state) {
    var R = roster(), list = null;
    if (!R || !state || !Array.isArray(state.parties)) return state;
    try { list = R.loadSavedCharacters(); } catch (e) { return state; }
    var byId = {};
    (list || []).forEach(function (c) { if (c && c.id != null) byId[String(c.id)] = c; });
    var changed = false;
    var parties = state.parties.map(function (p) {
      if (!p || !Array.isArray(p.members)) return p;
      var ms = p.members.map(function (m) {
        var w = m && parseWho(m.who), rec = w && w.kind === 'char' ? byId[w.ref] : null;
        var nm = rec ? str(rec.name || (rec.sheetData && rec.sheetData.name)) : '';
        if (!rec || !nm || m.last === nm) return m;
        changed = true;
        return Object.assign({}, m, { last: nm });
      });
      return changed ? Object.assign({}, p, { members: ms }) : p;
    });
    return changed ? Object.assign({}, state, { parties: parties }) : state;
  }

  // ── pure ops: (state, …) → new state. Each restamps the party it changes. ──
  function partyOf(state, id) {
    var pid = id || PARTY_ID;
    var list = (state && state.parties) || [];
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === pid) return list[i];
    return null;
  }
  function withParty(state, id, fn) {
    var pid = id || PARTY_ID, found = false;
    var base = state || { v: SCHEMA_V, parties: [] };
    var parties = (base.parties || []).map(function (p) {
      if (!p || p.id !== pid) return p;
      found = true;
      return normalizeParty(Object.assign({}, fn(p), { updatedAt: now() }));
    });
    if (!found) parties = parties.concat([normalizeParty(Object.assign({}, fn(emptyParty(pid)), { updatedAt: now() }))]);
    return Object.assign({}, base, { parties: parties });
  }
  function ensureParty(state, id) {
    return partyOf(state, id) ? state : withParty(state, id, function (p) { return p; });
  }
  // E6 plumbing (ruling `encounters-e6-plumbing` ADDENDUM 1, P1.3) — a campaign's party, removed whole. The id rides
  // the result, invisibly, to `save`, which tombstones it. No id, or none stored: the state comes back unchanged.
  function removeParty(state, id) {
    var pid = id == null ? '' : String(id), gone = [];
    var base = state || { v: SCHEMA_V, parties: [] };
    var kept = (base.parties || []).filter(function (p) {
      if (!p || p.id !== pid) return true;
      gone.push(pid);
      return false;
    });
    if (!gone.length) return base;
    var next = Object.assign({}, base, { parties: kept });
    Object.defineProperty(next, DELETED, { value: gone });
    return next;
  }
  // E6 plumbing (P1.3; wire `encounters-e5-wire` §6 `party`) — a received copy replaces the record of ITS id whole, as
  // the sender holds it: its own `updatedAt` is kept (a copy, not an edit here) and unknown fields ride the `keep`
  // idiom. A record with no id is refused (the state comes back unchanged). No other record is touched.
  function replaceParty(state, record) {
    var rec = normalizeParty(record);
    if (!rec) return state;
    var base = state || { v: SCHEMA_V, parties: [] }, found = false;
    var parties = (base.parties || []).map(function (p) {
      if (!p || p.id !== rec.id) return p;
      found = true;
      return rec;
    });
    if (!found) parties = parties.concat([rec]);
    return Object.assign({}, base, { parties: parties });
  }
  function setName(state, name, id) {
    return withParty(state, id, function (p) { return Object.assign({}, p, { name: str(name) }); });
  }
  // A `char:` member carries `last` from the moment it is added (R-R4S-9).
  function addCharMember(state, charId, lastName, id) {
    var who = 'char:' + str(charId);
    return withParty(state, id, function (p) {
      if (p.members.some(function (m) { return m.who === who; })) return p;
      return Object.assign({}, p, { members: p.members.concat([{ who: who, last: str(lastName) }]) });
    });
  }
  function addNameMember(state, name, dutyRows, obligationRows, id) {
    var who = 'name:' + str(name);
    return withParty(state, id, function (p) {
      if (!str(name) || p.members.some(function (m) { return m.who === who; })) return p;
      return Object.assign({}, p, { members: p.members.concat([{ who: who, duty: rows(dutyRows), obligation: rows(obligationRows) }]) });
    });
  }
  function removeMember(state, who, id) {
    return withParty(state, id, function (p) {
      return Object.assign({}, p, { members: p.members.filter(function (m) { return m.who !== who; }) });
    });
  }
  // A `name:` stub's rows (its Duty and Obligation are typed in here; a `char:` member's live on its sheet).
  function setStubRows(state, who, field, list, id) {
    if (field !== 'duty' && field !== 'obligation') throw new Error('setStubRows: field must be duty or obligation');
    return withParty(state, id, function (p) {
      return Object.assign({}, p, { members: p.members.map(function (m) {
        if (m.who !== who) return m;
        if (m.who.indexOf('name:') !== 0) throw new Error('setStubRows: ' + who + ' is a char: member; its rows live on its sheet');
        var o = Object.assign({}, m); o[field] = rows(list); return o;
      }) });
    });
  }
  // A LIVE write is loud (C-J3): an illegal pair, or a holocron without two distinct vocab skills, THROWS. `vocabIds`
  // (optional) = skills.vocab.json's ids; with it, membership is checked too. `null` clears the pick.
  function setResource(state, res, vocabIds, id) {
    var next = null;
    if (res != null) {
      if (!resourcePairOk(res)) throw new Error('setResource: ' + JSON.stringify([res && res.from, res && res.pick]) + ' is not a ruled pair (R-R6PC-1)');
      if (res.pick === 'holocron' && !skillsOk(res.skills, vocabIds)) throw new Error('setResource: a holocron takes exactly two distinct skill ids');
      if (res.pick !== 'holocron' && own(res, 'skills')) throw new Error('setResource: skills ride only a holocron');
      next = { from: res.from, pick: res.pick };
      if (res.pick === 'holocron') next.skills = res.skills.slice();
      if (own(res, 'mentor') && res.mentor != null) {
        if (res.pick !== 'mentor') throw new Error('setResource: mentor rides only a mentor pick');
        if (MENTOR_KINDS.indexOf(res.mentor) === -1) throw new Error('setResource: mentor must be one of ' + MENTOR_KINDS.join(', '));
        next.mentor = res.mentor;
      }
      if (Array.isArray(res.refs) && res.refs.length) next.refs = res.refs.map(String);
      next.note = str(res.note);
    }
    return withParty(state, id, function (p) { return Object.assign({}, p, { resource: next }); });
  }
  // → { careerSkills, mentor, extraCredits, ywings } — what the pick does, per its printed page. Shown nowhere and
  // read by no engine yet: lane D's charResolve reads consume it (R-R6PC-2).
  //   holocron: two career skills for the group (FaD p.109) · mentor: −5 XP on a basic Force power after creation
  //   (FaD p.109) · aor + base: +1,000 cr of starting gear per PC (AoR p.111) · ywings: one per two PCs, rounding up
  //   (AoR p.111), counted from the members at render.
  function resourceEffects(party, vocabIds) {
    var out = { careerSkills: [], mentor: false, extraCredits: 0, ywings: 0 };
    var r = party && party.resource;
    if (!resourcePairOk(r)) return out;
    if (r.pick === 'holocron' && skillsOk(r.skills, vocabIds)) out.careerSkills = r.skills.slice();
    if (r.pick === 'mentor') out.mentor = true;
    if (r.from === 'aor' && r.pick === 'base') out.extraCredits = AOR_BASE_CREDITS;
    if (r.from === 'aor' && r.pick === 'ywings') out.ywings = Math.ceil(((party.members || []).length) / 2);
    return out;
  }

  // The Mentor's kind (Q4) — 'jedi' when the mentor pick carries none, the stored kind when it is one of the five,
  // null for every other resource and for an unknown kind (kept, inert).
  function mentorKind(party) {
    var r = party && party.resource;
    if (!resourcePairOk(r) || r.pick !== 'mentor') return null;
    if (!own(r, 'mentor') || r.mentor == null) return 'jedi';
    return MENTOR_KINDS.indexOf(r.mentor) !== -1 ? r.mentor : null;
  }

  // ── the bases (S4): the group's one writer, keys only ──
  function newBaseId() { return 'base-' + now().toString(36) + Math.floor(Math.random() * 1296).toString(36); }
  function checkBase(b) {
    if (!isObj(b)) throw new Error('base: an object');
    if (b.start != null && BASE_STARTS.indexOf(b.start) === -1) throw new Error('base: start must be one of ' + BASE_STARTS.join(', '));
    (Array.isArray(b.upgrades) ? b.upgrades : []).forEach(function (u) {
      if (!isObj(u) || !u.key) throw new Error('base: an upgrade names its key');
      if (BASE_PAID.indexOf(u.paid) === -1) throw new Error('base: paid must be one of ' + BASE_PAID.join(', '));
    });
  }
  // → { state, id } — the new base's id is returned so a caller can point `resource.refs` at it
  function addBase(state, base, id) {
    checkBase(base);
    var bid = base.id ? String(base.id) : newBaseId();
    var next = withParty(state, id, function (p) {
      if (p.bases.some(function (b) { return b.id === bid; })) throw new Error('addBase: ' + bid + ' exists');
      return Object.assign({}, p, { bases: p.bases.concat([Object.assign({ upgrades: [], notes: '' }, base, { id: bid })]) });
    });
    return { state: next, id: bid };
  }
  // `patch` replaces the named fields of one base (an `upgrades` list replaces the list whole)
  function updateBase(state, baseId, patch, id) {
    return withParty(state, id, function (p) {
      var hit = false;
      var bases = p.bases.map(function (b) {
        if (b.id !== baseId) return b;
        hit = true;
        var nb = Object.assign({}, b, patch || {}, { id: b.id });
        checkBase(nb);
        return nb;
      });
      if (!hit) throw new Error('updateBase: no base ' + baseId);
      return Object.assign({}, p, { bases: bases });
    });
  }
  function removeBase(state, baseId, id) {
    return withParty(state, id, function (p) {
      return Object.assign({}, p, { bases: p.bases.filter(function (b) { return b.id !== baseId; }) });
    });
  }

  function setGroupRows(state, field, list, id) {
    if (field !== 'duty' && field !== 'obligation') throw new Error('setGroupRows: field must be duty or obligation');
    return withParty(state, id, function (p) { var o = Object.assign({}, p); o[field] = rows(list); return o; });
  }

  // ── derivations (never stored) ──
  // A sheet's Duty, as its rows: the sheet's `duty.entries` when it carries rows, else its one `{type, value}`
  // (the creator's mechDisplay). The total is the sheet's `value` — the number the sheet's DUTY card prints, which
  // its own writer (`patchEntries`) keeps equal to the rows' sum.
  function sheetDutyRows(sheet) {
    var d = sheet && sheet.duty;
    if (!isObj(d)) return [];
    if (Array.isArray(d.entries) && d.entries.length) return d.entries.map(function (e) { return { type: str(e && e.type), magnitude: mag(e && e.magnitude) }; });
    return mag(d.value) ? [{ type: str(d.type), magnitude: mag(d.value) }] : [];
  }
  function sheetDutyValue(sheet) { var d = sheet && sheet.duty; return isObj(d) ? mag(d.value) : 0; }

  // `chars`: the roster list (or omit to read the stored roster). → the printed sheet's rows, in member order, then
  // the group's own; a `char:` member whose sheet is gone is one MISSING part, counted as 0 and named (amend 5).
  function dutyParts(party, chars) {
    if (!party) return [];
    var byId = indexChars(chars);
    var out = [];
    (party.members || []).forEach(function (m) {
      var w = parseWho(m.who);
      if (!w) return;
      if (w.kind === 'name') {
        rows(m.duty).forEach(function (r) { out.push({ who: m.who, name: w.ref, type: r.type, magnitude: r.magnitude }); });
        return;
      }
      var rec = byId[w.ref];
      if (!rec) { out.push({ who: m.who, name: m.last || '', type: '', magnitude: 0, missing: true }); return; }
      var nm = str(rec.name || (rec.sheetData && rec.sheetData.name));
      var rs = sheetDutyRows(rec.sheetData), val = sheetDutyValue(rec.sheetData);
      var sum = rs.reduce(function (n, r) { return n + r.magnitude; }, 0);
      if (rs.length && sum === val) rs.forEach(function (r) { out.push({ who: m.who, name: nm, type: r.type, magnitude: r.magnitude }); });
      else if (val) out.push({ who: m.who, name: nm, type: str(rec.sheetData.duty.type), magnitude: val });
    });
    rows(party.duty).forEach(function (r) { out.push({ who: 'group', name: party.name || '', type: r.type, magnitude: r.magnitude }); });
    return out;
  }
  function dutyTotal(party, chars) { return dutyParts(party, chars).reduce(function (n, p) { return n + p.magnitude; }, 0); }
  // → { total, rank, canRankUp, toNext }: RANK UP shows only while the total EXCEEDS 100; `toNext` is the Duty still
  // needed to exceed it (0 once it does). Axiom 6: nothing here ranks up by itself.
  function rankProgress(party, chars) {
    var total = dutyTotal(party, chars);
    return { total: total, rank: party ? party.rank : 0, canRankUp: total > THRESHOLD, toNext: total > THRESHOLD ? 0 : THRESHOLD + 1 - total };
  }
  function indexChars(chars) {
    var list = chars;
    if (!Array.isArray(list)) { var R = roster(); try { list = R ? R.loadSavedCharacters() : []; } catch (e) { list = []; } }
    var byId = {};
    (list || []).forEach(function (c) { if (c && c.id != null) byId[String(c.id)] = c; });
    return byId;
  }

  // ── THE RANK-UP and its UNDO (R-R4S-6) ──
  // The sheet write `patchEntries` makes, as a pure function of the stored Duty: every row's magnitude to 0, and the
  // value its writer keeps equal to their sum. A sheet with no rows carries its one Duty in `value`, so it goes to 0.
  function zeroDuty(duty) {
    if (!isObj(duty)) return duty;
    var out = Object.assign({}, duty, { value: 0 });
    if (Array.isArray(duty.entries)) out.entries = duty.entries.map(function (e) { return isObj(e) ? Object.assign({}, e, { magnitude: 0 }) : e; });
    return out;
  }
  function zeroRows(list) { return rows(list).map(function (r) { return Object.assign({}, r, { magnitude: 0 }); }); }

  // Every reason the act cannot run, BEFORE any write: [{ who, name, why: 'missing'|'held' }] plus the store's own.
  function blockers(party, op) {
    var out = [];
    if (_stale) out.push({ who: 'group', name: party ? party.name : '', why: 'held' });
    var R = roster();
    var charMembers = (party && party.members || []).filter(function (m) { return m.who.indexOf('char:') === 0; });
    if (!charMembers.length) return out;
    if (!R) { charMembers.forEach(function (m) { out.push({ who: m.who, name: m.last || '', why: 'missing' }); }); return out; }
    var held = rosterHeld();
    var byId = indexChars(R.loadSavedCharacters());
    charMembers.forEach(function (m) {
      var rec = byId[m.who.slice(5)];
      if (!rec) out.push({ who: m.who, name: m.last || '', why: 'missing' });
      else if (held) out.push({ who: m.who, name: str(rec.name) || m.last || '', why: 'held' });
      else if (op === 'undo' && !undoFits(party, m.who, rec)) out.push({ who: m.who, name: str(rec.name) || m.last || '', why: 'changed' });
    });
    return out;
  }
  // The roster's F-54 hold, read the way the roster reads it: the RAW stored version against its schema.
  function rosterHeld() {
    var R = roster(), ls = LS();
    if (!R || !ls) return false;
    try {
      var s = JSON.parse(ls.getItem(R.ROSTER_STORAGE_KEY) || 'null');
      var v = Array.isArray(s) ? 0 : (s && s.version);
      return VG().isAhead(v, R.ROSTER_SCHEMA_VERSION);
    } catch (e) { return false; }
  }

  // One sheet's Duty write, through the roster's own record write (the path every sheet edit takes).
  function writeSheetDuty(R, charId, nextDuty) {
    var rec = R.findCharById(R.loadSavedCharacters(), charId);
    if (!rec) throw new Error('rank-up: char:' + charId + ' vanished mid-write');
    var opened = R.openedPairOf(rec);
    var nextSheet = Object.assign({}, opened.sheetData, { duty: nextDuty });
    R.upsertSavedCharacter(opened.selectedChar, nextSheet, rec.source || 'unknown');
    var back = R.findCharById(R.loadSavedCharacters(), charId);
    if (!back || JSON.stringify(back.sheetData && back.sheetData.duty) !== JSON.stringify(nextDuty)) {
      throw new Error('rank-up: char:' + charId + ' did not take the write');
    }
  }

  // Every key the act writes BEFORE its last step, as stored, so a failure partway puts this device back exactly (the
  // backup restore's rule): the roster, and the tombstone list the roster's write rewrites (`clearDeletedId`). The group
  // record is the act's LAST write and a single setItem, so it lands whole or throws and stays as it was.
  function snapshot() {
    var R = roster(), ls = LS();
    return { roster: R && ls ? ls.getItem(R.ROSTER_STORAGE_KEY) : null, tombs: R && ls ? ls.getItem(R.DELETED_IDS_KEY) : null };
  }
  // Two explicit writes, each key named (scripts/release_store_census.py resolves a write site only by its key).
  function restore(snap) {
    var ls = LS(), R = roster();
    if (!ls) return;
    if (R) { try { if (snap.roster == null) ls.removeItem(R.ROSTER_STORAGE_KEY); else ls.setItem(R.ROSTER_STORAGE_KEY, snap.roster); } catch (e) {} }
    if (R) { try { if (snap.tombs == null) ls.removeItem(R.DELETED_IDS_KEY); else ls.setItem(R.DELETED_IDS_KEY, snap.tombs); } catch (e) {} }
  }

  // rankUp({ reward, note, at }, id) → { ok: true, state } | { ok: false, stopped: [blockers], state }
  // Reads and writes the STORED record (never a host's rendered copy). `reward` is S5's pick; the act needs one.
  function rankUp(opts, id) {
    opts = opts || {};
    var state = load(), party = partyOf(state, id);
    if (!party) return { ok: false, stopped: [{ who: 'group', name: '', why: 'missing' }], state: state };
    if (!REWARDS[opts.reward]) throw new Error('rankUp: reward must be one of gear, vehicle, asset, base');
    // A sheet that cannot be written is named first: a missing member's Duty counts 0, so it can also pull the total down.
    var stop = blockers(party, 'rankUp');
    if (stop.length) return { ok: false, stopped: stop, state: state };
    // RAW (AoR Core pp.49–50): the rank rises when the group's Duty EXCEEDS 100 — and not otherwise.
    if (!rankProgress(party).canRankUp) return { ok: false, stopped: [{ who: 'group', name: party.name, why: 'below-threshold' }], state: state };
    var R = roster(), byId = indexChars(R ? R.loadSavedCharacters() : []);
    var undo = { sheets: {}, members: {}, duty: rows(party.duty) };
    party.members.forEach(function (m) {
      if (m.who.indexOf('char:') === 0) {
        var d = byId[m.who.slice(5)].sheetData && byId[m.who.slice(5)].sheetData.duty;
        undo.sheets[m.who.slice(5)] = d === undefined ? null : d;
      } else undo.members[m.who] = rows(m.duty);
    });
    var snap = snapshot();
    try {
      Object.keys(undo.sheets).forEach(function (cid) {
        if (isObj(undo.sheets[cid])) writeSheetDuty(R, cid, zeroDuty(undo.sheets[cid]));
      });
      var next = withParty(state, id, function (p) {
        return Object.assign({}, p, {
          rank: p.rank + 1,
          rankUps: p.rankUps.concat([{ at: opts.at != null ? opts.at : now(), from: p.rank, to: p.rank + 1,
            reward: opts.reward, note: str(opts.note), undo: undo }]),
          members: p.members.map(function (m) { return m.who.indexOf('name:') === 0 ? Object.assign({}, m, { duty: zeroRows(m.duty) }) : m; }),
          duty: zeroRows(p.duty),
        });
      });
      if (!save(next)) throw new Error('rank-up: the group record did not take the write');
      return { ok: true, state: load() };
    } catch (e) {
      restore(snap);
      load();
      return { ok: false, stopped: [{ who: 'group', name: party.name, why: 'write-failed', error: String(e && e.message || e) }], state: load() };
    }
  }

  // An undo puts back only what the rank-up wrote: a sheet whose Duty moved since is CHANGED, and stops it.
  function undoFits(party, who, rec) {
    var last = party.rankUps[party.rankUps.length - 1], u = last && last.undo;
    if (!u || !u.sheets || !own(u.sheets, who.slice(5))) return true;   // added after the rank-up: not ours to touch
    var was = u.sheets[who.slice(5)];
    var cur = rec.sheetData ? rec.sheetData.duty : undefined;
    return JSON.stringify(cur === undefined ? null : cur) === JSON.stringify(isObj(was) ? zeroDuty(was) : was);
  }
  function canUndo(party) {
    var last = party && party.rankUps[party.rankUps.length - 1];
    return !!(last && isObj(last.undo) && party.rank === last.to);
  }
  // undoRankUp(id) → { ok, state } | { ok: false, stopped }
  function undoRankUp(id) {
    var state = load(), party = partyOf(state, id);
    if (!canUndo(party)) return { ok: false, stopped: [{ who: 'group', name: party ? party.name : '', why: 'nothing-to-undo' }], state: state };
    var stop = blockers(party, 'undo');
    if (stop.length) return { ok: false, stopped: stop, state: state };
    var last = party.rankUps[party.rankUps.length - 1], u = last.undo, R = roster();
    var snap = snapshot();
    try {
      Object.keys(u.sheets || {}).forEach(function (cid) {
        if (!isObj(u.sheets[cid])) return;
        if (!R.findCharById(R.loadSavedCharacters(), cid)) return;      // removed from the roster since: nothing to restore
        writeSheetDuty(R, cid, u.sheets[cid]);
      });
      var next = withParty(state, id, function (p) {
        return Object.assign({}, p, {
          rank: last.from,
          rankUps: p.rankUps.slice(0, -1),
          members: p.members.map(function (m) {
            return own(u.members || {}, m.who) ? Object.assign({}, m, { duty: rows(u.members[m.who]) }) : m;
          }),
          duty: rows(u.duty),
        });
      });
      if (!save(next)) throw new Error('undo: the group record did not take the write');
      return { ok: true, state: load() };
    } catch (e) {
      restore(snap);
      load();
      return { ok: false, stopped: [{ who: 'group', name: party.name, why: 'write-failed', error: String(e && e.message || e) }], state: load() };
    }
  }

  // apply(fn): load → fn(state) → save, the one-call shape the vessel store offers its hosts. Null when held.
  function apply(fn) {
    var s = load();
    if (_stale) return null;
    return save(fn(s));
  }

  var api = {
    PARTY_KEY: PARTY_KEY, SCHEMA_V: SCHEMA_V, PARTY_ID: PARTY_ID, THRESHOLD: THRESHOLD,
    REWARDS: Object.keys(REWARDS),
    // persistence
    load: load, save: save, apply: apply, isStale: isStale, fromRaw: fromRaw,
    // normalizers (the sync and backup layers never call these; exposed for guards)
    normalizeParty: normalizeParty, normalizeMember: normalizeMember, normalizeRow: normalizeRow, parseWho: parseWho,
    // pure ops
    partyOf: partyOf, ensureParty: ensureParty, removeParty: removeParty, replaceParty: replaceParty, setName: setName, addCharMember: addCharMember,
    addNameMember: addNameMember, removeMember: removeMember, setStubRows: setStubRows, setGroupRows: setGroupRows,
    setResource: setResource, RESOURCE_PAIRS: RESOURCE_PAIRS, normalizeResource: normalizeResource, resourceEffects: resourceEffects,
    MENTOR_KINDS: MENTOR_KINDS.slice(), mentorKind: mentorKind,
    normalizeBase: normalizeBase, addBase: addBase, updateBase: updateBase, removeBase: removeBase,
    engineReader: engineReader, registerEngineReader: registerEngineReader,
    // derivations
    sheetDutyRows: sheetDutyRows, dutyParts: dutyParts, dutyTotal: dutyTotal, rankProgress: rankProgress,
    // the act
    zeroDuty: zeroDuty, blockers: blockers, rankUp: rankUp, canUndo: canUndo, undoRankUp: undoRankUp,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.SWRPGParty = api;
})(typeof window !== 'undefined' ? window : this);
