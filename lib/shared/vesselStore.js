/* lib/shared/vesselStore.js — SHIPYARD Y2 "vessels that remember": the living vessel record store.
 *
 * A vessel = one acquisition of a registry ship, persisted as id-ref + overlay (the proven shelfStore /
 * NPC-bench class): the registry ship is referenced by `vehicleKey` and its canonical stats are NEVER
 * copied — read live from VehicleLibraryController at render, so a registry fix reaches every owned
 * vessel. The overlay holds only what makes the ship THEIRS and ALIVE: nickname, provenance (PROV-1 for
 * ships), owner, acquisition record, and live battle state (hull/strain/crits/shields angling).
 *
 * Ships are INDIVIDUALS (R-SY4): acquiring one registry key twice mints two records with two ids — no
 * qty/stack field exists. Every field is legacy-null-safe: a record with only {id,vehicleKey,owner}
 * (or a pre-Y2 blob) normalizes to a fresh, undamaged vessel; no field access throws. And every
 * normalizer KEEPS what it does not know (SHIP YARD S3, R-S3K-1 (a)): a field a newer build wrote rides
 * through every read, op and save untouched, at every level of the record and on the envelope.
 *
 * Schema contract: Docs/SHIPYARD_Y2_SCHEMA.md (R-SY4). Key: swrpg_vessels_v1 (verified non-colliding).
 * Classic script → window.SWRPGVessels; node-safe (guard test/vessel_store.cjs loads it via `this`).
 * NO financing math / wallet (R-SY3 / R-ITM4): acquired.note may mention a price as free text only.
 */
(function (global) {
  'use strict';

  var VESSELS_KEY = 'swrpg_vessels_v1';
  // v2 (Y3d): + attachments[]. v3 (SHIP YARD S3, ruling `shipyard-s3-contracts` R-S3K-2; the contract text is
  // Docs/SHIPYARD_Y2_SCHEMA.md §1): + crew, mounts, retired, destroyed, image, decks, cargo, passengers,
  // stores, routes; story events gain kind/session/ref/reason; crits name their Table 7-9 row; an installed
  // attachment carries its mods by option id (AM-1). Reading a v1 or v2 record fills every new field at its
  // default and stamps v:3 — the one bump (F-a). JOB 2's reader-first fix is live FIRST (R-S3K-1's hold).
  var SCHEMA_V = 3;
  // The account-sync tombstone list (V-4): bare ids, which the adoption merge drops from EVERY list key
  // after its union (syncMerge.js). Named here, not read off SWRPGSyncMerge, so this store keeps no
  // load-order dependency on the sync modules; test/vessel_store.cjs pins that the two names agree.
  var TOMBSTONES_KEY = 'swrpg_deleted_ids';

  // The F-54 sentinel's comparison, resolved at CALL time rather than captured at load: this file
  // is loaded as a classic script in the browser and via `this` in the node guard, and the two
  // disagree about when globals exist. Falls back to the original inline comparison if the shared
  // module is absent, so a load-order slip degrades to the previous behaviour rather than throwing.
  function VG() {
    var g = (typeof window !== 'undefined' && window.SWRPGVersionGuard)
      || (global && global.SWRPGVersionGuard);
    return g || { isAhead: function (raw, schema) { return typeof raw === 'number' && raw > schema; } };
  }

  // ── R-S3K-1 (a) · B3 — WHAT A NORMALIZER DOES NOT KNOW, IT KEEPS ──
  // A newer build's record can reach this code: through the sync layer's local write, which never
  // passes through this file, or as a field a later build adds without a version bump. Every normalizer
  // here used to build a FIXED literal, so the first read-and-write dropped every field it did not name,
  // and the sync sweep pushed the stripped copy back over the account's (B3, driven at carry d11b6e86).
  // Now each one walks the input's own keys in the input's own order: a field it knows takes its
  // normalized value in place, a field it does not know is copied through untouched, and a known field
  // the input lacks is filled at the end, in this file's order. A save this build did not change
  // therefore writes back byte-for-byte. (The journal's forward-compatibility idiom, `journal.js`,
  // applied at every level the record has.) What v2's rules DROP is unchanged: an event with no note,
  // an attachment with no key, a shield zone that is not a number.
  function keep(src, known) {
    var out = {};
    if (src && typeof src === 'object' && !Array.isArray(src)) {
      Object.keys(src).forEach(function (k) {
        out[k] = Object.prototype.hasOwnProperty.call(known, k) ? known[k] : src[k];
      });
    }
    Object.keys(known).forEach(function (k) {
      if (!Object.prototype.hasOwnProperty.call(out, k)) out[k] = known[k];
    });
    return out;
  }
  // keep() for a record this read UPGRADES (its own v below ours): the known fields in THIS file's order —
  // the contract's order — then whatever it carried that this file does not know. A record at our version
  // or a newer one keeps its own order (keep), so a save this build did not change writes back byte-equal.
  function keepUpgrade(src, known, upgrading) {
    if (!upgrading) return keep(src, known);
    var out = {};
    Object.keys(known).forEach(function (k) { out[k] = known[k]; });
    if (src && typeof src === 'object' && !Array.isArray(src)) {
      Object.keys(src).forEach(function (k) { if (!Object.prototype.hasOwnProperty.call(out, k)) out[k] = src[k]; });
    }
    return out;
  }
  // An optional field (the contract's `kind?`, `zone?`…) is normalized only when the input carries it, so a
  // legacy entry that never had one reads back exactly as it was.
  function opt(known, src, k, v) { if (src && Object.prototype.hasOwnProperty.call(src, k)) known[k] = v; return known; }
  // A record's own `v` is never LOWERED. A v1 record upgrades to v2 in place, as before; a record a
  // newer build wrote keeps its number, because this build kept its fields rather than rewriting them —
  // a newer reader that branches on the record's version must not find its own fields labelled v2.
  function recordV(v) { return typeof v === 'number' && isFinite(v) && v > SCHEMA_V ? v : SCHEMA_V; }

  // ── normalization: fill every default so no downstream access throws (legacy-null-safe) ──
  function normalizeVessel(rec, now) {
    rec = rec || {};
    var ts = now || null;
    var upgrading = !(typeof rec.v === 'number' && rec.v >= SCHEMA_V);
    var known = {
      id: rec.id != null ? String(rec.id) : mintId(ts),
      vehicleKey: rec.vehicleKey != null ? String(rec.vehicleKey) : '',
      owner: rec.owner != null ? String(rec.owner) : '',
      nickname: rec.nickname != null && rec.nickname !== '' ? String(rec.nickname) : null,
      acquired: normalizeAcquired(rec.acquired),
      provenance: Array.isArray(rec.provenance) ? rec.provenance.map(normalizeProv).filter(Boolean) : [],
      // NO upper clamp: past the threshold is RAW's CRIPPLED (V-RAW-090) and SYSTEMS DOWN (V-RAW-092), EotE
      // p.242–243 — S2 draws 23/22 and 16/15. Never negative.
      hull_current: countOrNull(rec.hull_current),
      strain_current: countOrNull(rec.strain_current),
      crits: Array.isArray(rec.crits) ? rec.crits.map(normalizeCrit).filter(Boolean) : [],
      shields_current: normalizeShields(rec.shields_current),
      // SHIPYARD Y3d v2: installed attachments (id-refs into vehicle-attachments; dups allowed). The
      // v1→v2 migration is BRANCH-on-version (R-NBB1): a v1 record (no `attachments`) backfills to [] and
      // is upgraded. Canonical stats stay in the registry — nothing copied here (§8).
      attachments: Array.isArray(rec.attachments) ? rec.attachments.map(normalizeInstalled).filter(Boolean) : [],
      // ── v3 (R-S3K-2) ──
      crew: Array.isArray(rec.crew) ? rec.crew.map(normalizeSeat).filter(Boolean) : [],
      mounts: Array.isArray(rec.mounts) ? rec.mounts.map(normalizeMount).filter(Boolean) : [],
      retired: normalizeRetired(rec.retired),
      destroyed: normalizeDestroyed(rec.destroyed),
      image: typeof rec.image === 'string' && rec.image !== '' ? rec.image : null,
      decks: Array.isArray(rec.decks) ? rec.decks.map(normalizeDeck).filter(Boolean) : [],
      cargo: Array.isArray(rec.cargo) ? rec.cargo.map(normalizeCargo).filter(Boolean) : [],
      passengers: Array.isArray(rec.passengers) ? rec.passengers.map(normalizePassenger).filter(Boolean) : [],
      stores: normalizeStores(rec.stores),
      routes: Array.isArray(rec.routes) ? rec.routes.map(normalizeRoute).filter(Boolean) : [],
      v: recordV(rec.v),   // the current version, or a newer build's — reading upgrades v1/v2 → v3 in place
      createdAt: rec.createdAt != null ? rec.createdAt : ts,
      updatedAt: rec.updatedAt != null ? rec.updatedAt : ts,
    };
    // SHIP YARD S8 (R-S8B-4, R-S8C-9): a BUILT ship — keys and choices only, its numbers resolved at render. Optional: a record
    // that never had one reads back exactly as it was (no version bump: an older build keeps the field through keep()).
    opt(known, rec, 'build', normalizeBuild(rec.build));
    // SHIP YARD S8 (R-S8B-5, R-S8C-10): the ship's ONE quick conversion (DC p.71) — the template's key, the GM's arc picks, a note.
    // Optional as `build` is; it is not an attachments[] entry (a legacy holder's `paramilitary_*` part stays where it was saved).
    opt(known, rec, 'conversion', normalizeConversion(rec.conversion));
    return keepUpgrade(rec, known, upgrading);
  }
  // build: {frame, engine: {key, mods}, hull: {key, mods}, note} — a piece without a key reads null (not chosen yet); its mods
  // are normalizeMod's, by the option's stable id (AM-1). Unknown fields are kept.
  function normalizeBuild(b) {
    if (!b || typeof b !== 'object' || Array.isArray(b)) return null;
    function piece(p) {
      if (!p || typeof p !== 'object' || p.key == null || p.key === '') return null;
      return keep(p, { key: String(p.key), mods: Array.isArray(p.mods) ? p.mods.map(normalizeMod).filter(Boolean) : [] });
    }
    return keep(b, { frame: strOrNull(b.frame), engine: piece(b.engine), hull: piece(b.hull), note: strOrNull(b.note) });
  }
  // conversion: {key, arcs, note} — (b1, R-S8C-10): `arcs` is KEPT AS STORED, a wrong length or an illegal zone included (the
  // resolver lands the picks it can and leaves the rest PENDING, never guessed), so a save this build cannot fully read loses
  // nothing. A non-list `arcs` reads []. No key = no conversion (null). Unknown fields are kept.
  function normalizeConversion(c) {
    if (!c || typeof c !== 'object' || Array.isArray(c) || c.key == null || c.key === '') return null;
    return keep(c, { key: String(c.key), arcs: Array.isArray(c.arcs) ? c.arcs.slice() : [], note: strOrNull(c.note) });
  }
  function normalizeAcquired(a) {
    var acq = a || {};
    return keep(acq, {
      note: acq.note != null && acq.note !== '' ? String(acq.note) : null,
      when: acq.when != null && acq.when !== '' ? String(acq.when) : null,
    });
  }
  function normalizeInstalled(a) {
    if (a == null) return null;
    if (typeof a === 'string') a = { key: a };
    if (a.key == null || a.key === '') return null;
    var known = {
      key: String(a.key),
      when: strOrNull(a.when),
      note: strOrNull(a.note),
    };
    opt(known, a, 'session', intOrNull(a.session));
    opt(known, a, 'reason', REASONS[a.reason] ? a.reason : null);
    // R-S4G-1 (P1) · per APPLICATION: where this part's BASE `chosen` defense lands, and which hull weapon its
    // BASE `weapon_damage_delta` moves. Absent or null = PENDING (the resolver moves nothing). An illegal
    // value reads null; a legal one on a part with no `chosen` effect is kept and ignored (B3a).
    opt(known, a, 'zone', ZONES[a.zone] ? a.zone : null);
    opt(known, a, 'weapon', weaponRef(a.weapon));
    // AM-1: a mod names its option by the registry's stable id (`added_options[].id`), never a position.
    // Mods of one option = its ranks (R-S1C-4); over the printed count WARNS in the resolver, never here.
    known.mods = Array.isArray(a.mods) ? a.mods.map(normalizeMod).filter(Boolean) : [];
    return keep(a, known);
  }
  function normalizeMod(m) {
    if (!m || typeof m !== 'object' || m.option == null || m.option === '') return null;
    var known = { option: String(m.option), when: strOrNull(m.when), session: intOrNull(m.session) };
    // R-S4G-1 · the same two choices, per mod RANK (each rank is its own application).
    opt(known, m, 'zone', ZONES[m.zone] ? m.zone : null);
    opt(known, m, 'weapon', weaponRef(m.weapon));
    return keep(m, known);
  }
  // WeaponRef {i, key} (R-S4G-1): i = the index into the registry row's weapons[], key = the weapon key found
  // there when written — MountState's address and rule: a key mismatch on read is ORPHANED (the resolver's).
  // Anything else is not a reference and reads null.
  function weaponRef(w) {
    if (!w || typeof w !== 'object' || Array.isArray(w)) return null;
    var i = Number(w.i);
    if (!isFinite(i) || i < 0 || Math.floor(i) !== i || w.key == null || w.key === '') return null;
    return keep(w, { i: i, key: String(w.key) });
  }

  // PROV-1 shape ({note, when}) so the gear provenance renderer is shared, not reinvented; v3 adds the
  // StoryEvent fields. No `kind` = the player's own line (removable); a `kind` = an app-written event,
  // never removed (W6). D-S3R3 (a) → WIDENED here: an event is dropped only when it has NEITHER a note nor
  // a kind (v2 dropped every event without a note). Legacy entries carry no kind and read as player lines.
  // S4 · `removed` (ruling shipyard-s4-workbench-contracts R-S4WC-6, READER FIRST): REMOVE writes {ref, to, when, session?},
  // `to` = 'hold' (a spare, with its CargoLine) or 'discarded'; a swap writes `installed` + `removed` (to 'hold'). No note is
  // written (resolve-at-render). This reader ships before any writer can run for a user: the reader before it erased a
  // note-less event of an unknown kind, and vessels sync (S5's flip may not be the first deploy carrying it, R-S4WC-13).
  var KINDS = { acquired: 1, installed: 1, crit: 1, repaired: 1, lost: 1, retired: 1, removed: 1 };
  var REASONS = { bought: 1, reward: 1, salvaged: 1, gift: 1, built: 1, aboard: 1 };
  var TO = { hold: 1, discarded: 1 };
  function normalizeProv(e) {
    if (!e || typeof e !== 'object') return null;
    var note = e.note != null && e.note !== '' ? String(e.note) : null;
    var kind = KINDS[e.kind] ? e.kind : null;
    if (note == null && kind == null) return null;
    var known = { note: note, when: strOrNull(e.when) };
    opt(known, e, 'kind', kind);
    opt(known, e, 'session', intOrNull(e.session));
    opt(known, e, 'ref', strOrNull(e.ref));
    opt(known, e, 'reason', REASONS[e.reason] ? e.reason : null);
    opt(known, e, 'to', TO[e.to] ? e.to : null);
    return keep(e, known);
  }
  // RAW Table 7-9 (EotE p.244 — RULES_FOUNDATION_VEHICLES.md §4): FOUR severity tiers that set the
  // repair-check difficulty — Easy / Average / Hard / Daunting. C-Y2a: `average` was missing.
  // v3 · K8: a crit names its Table 7-9 row by KEY (`crit_tables.json` vehicle rows' 4th element); `sev` is
  // still written, for v2 readers. `row` null = the legacy {sev, label} entry, shown as today.
  var CRIT_SEV = { easy: 1, average: 1, hard: 1, daunting: 1 };
  var ZONES = { fore: 1, aft: 1, port: 1, starboard: 1 };
  function normalizeCrit(c) {
    if (c == null) return null;
    if (typeof c === 'string') c = { sev: c };
    var known = {
      row: strOrNull(c.row),
      sev: CRIT_SEV[c.sev] ? c.sev : 'hard',
      label: strOrNull(c.label),
      when: strOrNull(c.when),
      session: intOrNull(c.session),
    };
    opt(known, c, 'zone', ZONES[c.zone] ? c.zone : null);
    opt(known, c, 'component', strOrNull(c.component));
    return keep(c, known);
  }
  // A zone is kept only as a number, as before; any other key is a newer build's, kept as it is, in place.
  var SHIELD_ZONES = ['fore', 'aft', 'port', 'starboard'];
  function normalizeShields(s) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return null;
    var out = {}, any = false;
    Object.keys(s).forEach(function (k) {
      if (SHIELD_ZONES.indexOf(k) !== -1 && typeof s[k] !== 'number') return;
      out[k] = s[k];
      any = true;
    });
    return any ? out : null;
  }
  function numOrNull(n) { return typeof n === 'number' && isFinite(n) ? n : null; }
  function strOrNull(v) { return v != null && v !== '' ? String(v) : null; }
  function intOrNull(n) { return typeof n === 'number' && isFinite(n) ? Math.round(n) : null; }
  // hull/strain SUFFERED: a finite number, never below 0; no ceiling (see normalizeVessel).
  function countOrNull(n) { return typeof n === 'number' && isFinite(n) ? Math.max(0, n) : null; }

  // ── v3 · K4 — WHO: owner and crew words ──
  // 'char:<saved character id>' · 'npc:<NPC _source_key>' · 'name:<free text>'. Typed text is always
  // written under `name:`, so it can never parse as a reference; a bare string with no known prefix is
  // read as a name, for the same reason.
  function normalizeWho(w) {
    if (w == null || w === '') return null;
    w = String(w);
    return /^(char|npc|name):/.test(w) ? w : 'name:' + w;
  }
  function parseWho(w) {
    var m = /^(char|npc|name):([\s\S]*)$/.exec(w == null ? '' : String(w));
    if (!m) return null;
    return m[1] === 'name' ? { kind: 'name', text: m[2] } : { kind: m[1], id: m[2] };
  }
  var ROLES = { pilot: 1, copilot: 1, gunner: 1, engineer: 1, astrogator: 1, sensors: 1, commander: 1, crew: 1 };
  function normalizePlace(p) {
    if (!p || typeof p !== 'object' || p.deck == null || p.deck === '') return null;
    return keep(p, { deck: String(p.deck), area: strOrNull(p.area) });
  }
  function normalizeSeat(c) {
    if (!c || typeof c !== 'object') return null;
    var who = normalizeWho(c.who);
    if (!who) return null;
    return keep(c, { who: who, role: ROLES[c.role] ? c.role : 'crew', where: normalizePlace(c.where) });
  }
  function normalizeMount(m) {
    if (!m || typeof m !== 'object' || typeof m.i !== 'number' || m.key == null) return null;
    return keep(m, { i: Math.round(m.i), key: String(m.key), replaced_by: strOrNull(m.replaced_by), note: strOrNull(m.note) });
  }
  function normalizeRetired(r) {
    if (!r || typeof r !== 'object') return null;
    return keep(r, { when: strOrNull(r.when), session: intOrNull(r.session), note: strOrNull(r.note) });
  }
  function normalizeDestroyed(d) {
    if (!d || typeof d !== 'object') return null;
    return keep(d, { state: d.state === 'derelict' ? 'derelict' : 'lost', when: strOrNull(d.when),
      session: intOrNull(d.session), note: strOrNull(d.note) });
  }
  function unitNum(n) { return typeof n === 'number' && isFinite(n) ? Math.min(1, Math.max(0, n)) : null; }
  function normalizeArea(a) {
    if (!a || typeof a !== 'object' || a.id == null) return null;
    return keep(a, { id: String(a.id), name: a.name != null ? String(a.name) : '', note: strOrNull(a.note),
      x: unitNum(a.x), y: unitNum(a.y) });
  }
  function normalizeDeck(d) {
    if (!d || typeof d !== 'object' || d.id == null) return null;
    return keep(d, { id: String(d.id), name: d.name != null ? String(d.name) : '', art: strOrNull(d.art),
      areas: Array.isArray(d.areas) ? d.areas.map(normalizeArea).filter(Boolean) : [] });
  }
  var CARGO_KINDS = { item: 1, free: 1, part: 1, weapon: 1 };
  function normalizeCargo(c) {
    if (!c || typeof c !== 'object' || c.id == null) return null;
    var known = {
      id: String(c.id), kind: CARGO_KINDS[c.kind] ? c.kind : 'free', ref: strOrNull(c.ref), name: strOrNull(c.name),
      qty: typeof c.qty === 'number' && c.qty >= 1 ? Math.round(c.qty) : 1, enc: numOrNull(c.enc),
      hidden: c.hidden === true, from_mount: typeof c.from_mount === 'number' ? Math.round(c.from_mount) : null,
      session: intOrNull(c.session), note: strOrNull(c.note),
    };
    // C1 (ADDENDUM 2 ANSWER, `shipyard-s4-workbench-contracts`): a spare part keeps its mods — `mods?: [{option, when,
    // session?}]`, additive at v3 (an older reader keeps it through keep()). Read only when the line carries it.
    opt(known, c, 'mods', Array.isArray(c.mods) ? c.mods.map(normalizeSpareMod).filter(Boolean) : []);
    return keep(c, known);
  }
  function normalizeSpareMod(m) {
    if (!m || typeof m !== 'object' || m.option == null || m.option === '') return null;
    var known = { option: String(m.option), when: strOrNull(m.when) };
    opt(known, m, 'session', intOrNull(m.session));
    return keep(m, known);
  }
  function normalizePassenger(p) {
    if (!p || typeof p !== 'object' || p.id == null) return null;
    var who = normalizeWho(p.who);
    if (!who) return null;
    return keep(p, { id: String(p.id), who: who, where: normalizePlace(p.where) });
  }
  function normalizeStores(s) {
    if (!s || typeof s !== 'object') return null;
    var j = s.next_jump;
    return keep(s, {
      days_out: typeof s.days_out === 'number' && s.days_out >= 0 ? Math.round(s.days_out) : null,
      next_jump: j && typeof j === 'object' && j.from != null && j.to != null
        ? keep(j, { from: String(j.from), to: String(j.to) }) : null,
    });
  }
  function normalizeRoute(r) {
    if (!r || typeof r !== 'object' || r.id == null || r.from == null || r.to == null) return null;
    return keep(r, { id: String(r.id), from: String(r.from), to: String(r.to), kind: r.kind === 'shortcut' ? 'shortcut' : 'line',
      note: strOrNull(r.note), session: intOrNull(r.session) });
  }

  // id: caller may pass an explicit id (tests do). Otherwise mint a value unique ACROSS RELOADS —
  // Date.now() (ms) + randomness — so two same-day acquisitions never collide (a module counter alone
  // resets on reload → same-day id clash). ts is the last-resort fallback when no clock exists.
  var _seq = 0;
  function mintId(ts) {
    var t = '', rnd = '';
    try { t = Date.now().toString(36); } catch (e) {}
    try { rnd = Math.floor(Math.random() * 1e9).toString(36); } catch (e) {}
    var base = (t || (ts != null ? String(ts) : 't')) + '_' + (rnd || (_seq++));
    return 'v_' + base;
  }

  // ── persistence (versioned envelope; legacy-null-safe) ──
  // F-54 — THE VERSION-AHEAD SENTINEL (ruling `f54-downgrade-prompt`), the vessel half: a save written
  // by a NEWER build is FLAGGED, not silently accepted, because the only thing this code's write can do
  // to newer data is strip it. Nothing about it touches the persisted envelope, so no schema change and
  // no R-SY4 halt. Records still normalize for DISPLAY: a stale tab shows the fleet read-only, not blank.
  //
  // V-1 · B-912 — THE HOLD'S FLAG IS MODULE-LEVEL (ruling `shipyard-s0-foundations-census` §4 F-2).
  // It used to ride the state object `load()` returned, and every op below builds a NEW object without
  // it — so the first edit on a stale tab saved a downgraded v:2 envelope and stripped the newer
  // build's fields (Docs/VEHICLE_PLUMBING.md §2.4, driven). Now `fromRaw` sets `_stale` from the RAW
  // envelope, and `save` and `apply` refuse while it is set, whatever object they are handed. The
  // `stale: true` that `load()` still puts on its return is a read-only PROJECTION of the flag, kept for
  // display and for the old `save(load())` call shape; the hold never depends on it being carried.
  var _stale = false;
  // S3 · THE UPGRADE IS LAZY ON WRITE. Reading upgrades every v1/v2 record to v3 in memory, but a save
  // writes a record this build did not change back EXACTLY AS IT WAS STORED — its own v, its own shape.
  // Why: the account merge compares records by content and, where two copies differ, by `updatedAt`
  // (recency.js). A save that rewrote an untouched v2 ship in v3 shape kept its old stamp, so the next
  // device to sign in held two different copies with one stamp — a tie, which the merge refuses to break,
  // and a conflict prompt for every ship after the first v3 save (found at S3 JOB 3: sync_merge's V-4 leg
  // went red on the bump alone). An op that changes a record restamps it, so a changed record is written
  // in v3 shape and recency carries it; an untouched one never looks changed. `_storedById` is filled by
  // every read (`fromRaw`); a record is swapped for its stored form only when normalizing that stored
  // form gives exactly the record being saved, so what is written always means what is in memory.
  var _storedById = {};

  function readRaw() {
    try { return global.localStorage ? global.localStorage.getItem(VESSELS_KEY) : null; } catch (e) { return null; }
  }
  // The envelope keeps what it does not know, too (R-S3K-1 (a)). `v` and `vessels` are this store's;
  // `stale` is the hold's in-memory projection (below), never read from storage and never written to
  // it. Any other key a newer build put on the envelope rides through every op and every save, in its
  // place. `v` is re-emitted at SCHEMA_V, as before: a write only happens when the file is not ahead.
  function withVessels(state, vessels) {
    var out = {};
    Object.keys(state || {}).forEach(function (k) {
      if (k === 'stale') return;
      out[k] = k === 'v' ? SCHEMA_V : k === 'vessels' ? vessels : state[k];
    });
    if (!Object.prototype.hasOwnProperty.call(out, 'v')) out.v = SCHEMA_V;
    if (!Object.prototype.hasOwnProperty.call(out, 'vessels')) out.vessels = vessels;
    return out;
  }
  // One raw string → a display state, and THE MODULE FLAG from the same read (its only writer).
  function fromRaw(raw) {
    var state = { v: SCHEMA_V, vessels: [] };
    var ahead = false;
    try {
      var s = raw ? JSON.parse(raw) : null;
      if (s && typeof s === 'object') {
        var rawV = typeof s.v === 'number' ? s.v : SCHEMA_V;
        // AHEAD OF US → stale. Note this reads the RAW version, before the v1→v2 upgrade-in-place
        // that `normalizeVessel` performs, so the comparison is against what the file actually says.
        // The comparison itself now lives in ONE place (C-B-6) — Phase B added a third consumer and
        // three copies of a rule this sharp is the defect class ADR 0025 already cost us once.
        // Read for ANY envelope, not only one whose `vessels` we can parse: a newer build that
        // reshaped the list is still a newer build's save, and never ours to rewrite.
        ahead = VG().isAhead(rawV, SCHEMA_V);
        if (Array.isArray(s.vessels)) {
          _storedById = {};
          s.vessels.forEach(function (r) { if (r && typeof r === 'object' && r.id != null) _storedById[String(r.id)] = r; });
          // The envelope as stored, in its own key order: `v` as read (the hold compares the raw
          // number), the list normalized, any other key kept.
          state = {};
          Object.keys(s).forEach(function (k) {
            if (k === 'stale') return;
            state[k] = k === 'v' ? rawV : k === 'vessels' ? s.vessels.map(function (r) { return normalizeVessel(r); }) : s[k];
          });
          if (!Object.prototype.hasOwnProperty.call(state, 'v')) state.v = rawV;
        }
      }
    } catch (e) {}
    _stale = ahead;
    if (ahead) state.stale = true;   // the projection (display) — never what the hold reads
    return state;
  }
  function load() { return fromRaw(readRaw()); }

  // F-54 — A STALE STATE IS NEVER WRITTEN BACK. This is the clean-rewrite the ruling names: reading
  // normally re-emits the envelope at SCHEMA_V, which is exactly how a newer save would be
  // downgraded. While the module flag is set we return the state untouched and write NOTHING — not
  // the fleet, and not a delete's tombstone — the hold lives here, at the one seam every caller passes
  // through, rather than in each control. (An object that was itself loaded stale is refused too;
  // that only ever adds a refusal.)
  function save(state) {
    if (_stale || (state && state.stale)) return state;
    try {
      var records = (state.vessels || []).map(function (r) { return normalizeVessel(r); });
      var clean = withVessels(state, records);
      if (global.localStorage) {
        // V-4: the tombstone goes FIRST, so a write cut short between the two keys still reads as a
        // delete at the next adoption, rather than as a ship that was never deleted.
        writeTombstones(state[DELETED]);
        global.localStorage.setItem(VESSELS_KEY, JSON.stringify(withVessels(state, records.map(asStored))));
      }
      return clean;
    } catch (e) { return state; }
  }

  // The record as it was stored, when this save did not change it (see `_storedById`); else the record.
  function asStored(r) {
    var was = _storedById[r.id];
    if (!was || (typeof was.v === 'number' && was.v >= SCHEMA_V)) return r;
    try { return JSON.stringify(normalizeVessel(was)) === JSON.stringify(r) ? was : r; } catch (e) { return r; }
  }

  // ── V-4 · R-S3K-1 (c), F-e — A DELETE LEAVES A TOMBSTONE ──
  // The adoption merge unions every device's fleet, then drops every id in `swrpg_deleted_ids`. Nothing
  // wrote a vessel's id there, so a ship decommissioned on one device and still held by another came
  // back at the next sign-in (V-4, measured in `Docs/VEHICLE_PLUMBING.md`). `removeVessel` stays a pure
  // op: it marks its result with the ids it removed on a NON-ENUMERABLE property — never serialized,
  // never copied into the next state by `Object.assign`, never seen by the merge's comparison — and
  // `save` writes them. So a removal that is held, or never saved, leaves no tombstone.
  var DELETED = '_deletedIds';
  // The list is SHARED by every synced list key (character deletions live in it too), so it is only
  // ever appended to: read, de-duplicated, written back. A value this build cannot read as a list is
  // left alone, because a shape it does not know is not its to rewrite (B3's lesson) — except text
  // that does not parse at all, which no reader can use and which the roster's own writer
  // (`addDeletedId`, player/app.jsx) replaces the same way.
  function writeTombstones(ids) {
    if (!ids || !ids.length) return;
    try {
      var raw = global.localStorage.getItem(TOMBSTONES_KEY), list;
      try { list = raw == null ? [] : JSON.parse(raw); } catch (e) { list = []; }
      if (list === null) list = [];
      if (!Array.isArray(list)) return;
      var have = {}, add = [];
      list.forEach(function (x) { have[String(x)] = true; });
      ids.forEach(function (id) { if (!have[id]) { have[id] = true; add.push(id); } });
      if (add.length) global.localStorage.setItem(TOMBSTONES_KEY, JSON.stringify(list.concat(add)));
    } catch (e) { /* quota: the delete itself still lands; the next adoption cannot see it (V-4's old gap) */ }
  }

  // ── THE PAGE-LOCAL STORE (V-2 · B-913; ruling `shipyard-s0-foundations-census` §4 F-3, (c) + (b)) ──
  // Every vessel host used to hold its OWN `useState(load())` copy of the whole fleet and write that
  // whole copy back, so two surfaces — two tabs, or the GM and player apps on one machine — each erased
  // what the other had written since it loaded, any owner's ships (VEHICLE_PLUMBING §2.5, driven). Now
  // there is ONE in-memory state per page, owned here: hosts read it by subscription (`subscribe` +
  // `getState`, the shape React's useSyncExternalStore takes) and write only through `apply(fn)`, which
  // is the hosts' old `apply` helpers moved inside — `fn` is one of the pure ops below, unchanged.
  //
  // REFRESHED FROM OUTSIDE by two seams: another tab's write arrives as a `storage` event for this key;
  // the sync layer's local writes (adopt · recheck · resolve · a 409 re-merge) arrive through
  // `SWRPGSync.subscribe` — a `storage` event never fires in the tab that wrote.
  // AND `apply` RE-READS BEFORE IT WRITES. Both seams deliver late: another tab's event is queued on
  // this tab's loop, and the sync layer announces `adopted` only after its pushes land. A tap in that
  // window would otherwise apply an op to an out-of-date copy and write it over the newer one — the
  // V-2 loss again, narrower. The re-read is one getItem and a string compare.
  //
  // Merge-by-id on every save was REJECTED (ruling §4), and still is: the page writes the whole list.
  // (A delete now writes a tombstone — V-4, ruled at S3 — but that is for the ACCOUNT merge, not for
  // this page's saves.) The persisted shape is `{ v: 2, vessels }` plus whatever a newer build put
  // there, every record as `normalizeVessel` emits it.
  var _state = null;   // the page's ONE vessel state (null until the first read)
  var _raw = null;     // the raw string `_state` was read from or last wrote — what "storage moved" compares
  var _subs = [];
  var _wired = false;

  // ── B-983 (ruling `shipyard-s5-ready` P2): A SHIP DELETED ON ANOTHER DEVICE TAKES ITS DECK PLANS HERE TOO ──
  // A remote delete reaches this page only as a re-read: the sync layer's adoption drops the record and keeps its id in
  // `swrpg_deleted_ids`, and another tab's delete arrives as its write. Both end in `pull()`, and the page's first read
  // (`ensure()`) catches one the sync wrote before this store first read, so the sweep runs at those two places. Every
  // TOMBSTONED id that names no record in this state loses its `vessel:<id>:` keys in the art database
  // (lib/store/userArt.js, through its own `vesselPrefix`, never a second spelling). An id merely ABSENT from the list is
  // never swept (a version-ahead strip or an unreadable list is not a delete), and nothing is swept while the store is
  // HELD (a newer build's save is not this build's to read as a delete; the next readable read sweeps). `removePrefix` is
  // idempotent: a delete made on this device already removed its plans (`removeShip`, R-S4SH-1), and a character's id in
  // the shared list has no such keys. Total without the art module, which is read at CALL time.
  function sweepArt(state) {
    var UA = global.SWRPGUserArt;
    if (_stale || !UA || typeof UA.removePrefix !== 'function' || typeof UA.vesselPrefix !== 'function') return;
    var list;
    try { list = JSON.parse(global.localStorage.getItem(TOMBSTONES_KEY) || 'null'); } catch (e) { return; }
    if (!Array.isArray(list) || !list.length) return;
    var live = {};
    ((state && state.vessels) || []).forEach(function (r) { if (r && r.id != null) live[String(r.id)] = true; });
    list.forEach(function (id) {
      if (id == null || typeof id === 'object' || live[String(id)]) return;
      try { var p = UA.removePrefix(UA.vesselPrefix(id)); if (p && typeof p.catch === 'function') p.catch(function () {}); } catch (e) { /* the art store cannot open: the plans wait for the next read */ }
    });
  }
  function notify() { _subs.slice().forEach(function (fn) { try { fn(); } catch (e) { /* a bad subscriber cannot break the store */ } }); }
  // Re-read storage into the page state; true when it had moved.
  function pull() {
    var raw = readRaw();
    if (raw === _raw) return false;
    _raw = raw;
    _state = fromRaw(raw);
    sweepArt(_state);   // B-983: a later arrival (another tab, the sync layer, apply's re-read)
    return true;
  }
  function refresh() { if (_state && pull()) notify(); }
  function wire() {
    if (_wired) return;
    _wired = true;
    try {
      if (typeof global.addEventListener === 'function') {
        global.addEventListener('storage', function (e) {
          // key null = localStorage.clear() in another tab: this key went with it
          if (!e || e.key === VESSELS_KEY || e.key === null) refresh();
          // B-983: another tab's sync writes its keys in its map's order, so the fleet can land BEFORE the tombstone; the
          // tombstone's own arrival sweeps then (smoke_yard_s4_ship's live leg found the order race).
          else if (e.key === TOMBSTONES_KEY && _state) sweepArt(_state);
        });
      }
    } catch (e) {}
    try {
      // Resolved at wiring time (the first read, at render), when every shell script has loaded.
      var S = global.SWRPGSync;
      if (S && typeof S.subscribe === 'function') S.subscribe(function () { refresh(); });
    } catch (e) {}
  }
  function ensure() {
    if (_state) return;
    _raw = readRaw();
    _state = fromRaw(_raw);
    sweepArt(_state);   // B-983: a delete the sync wrote before this page's first read
    wire();
  }
  function getState() { ensure(); return _state; }
  function isStale() { ensure(); return _stale; }   // what the hosts RENDER (the banner, recessed controls)
  function subscribe(fn) {
    ensure();
    _subs.push(fn);
    return function () { var i = _subs.indexOf(fn); if (i >= 0) _subs.splice(i, 1); };
  }
  // The React face of the page store: the state, re-rendering on every change (React 18's
  // useSyncExternalStore; React is read off the global at CALL time — node loads this file and never calls it).
  function useVessels() { return global.React.useSyncExternalStore(subscribe, getState); }
  // apply(fn): state = fn(state); persist; notify — refused whole while the module flag is set.
  function apply(fn) {
    ensure();
    var moved = pull();
    try {
      if (_stale) return _state;          // V-1: THE HOLD — the op never runs and nothing is written
      var next = fn(_state);
      if (!next || next === _state) return _state;
      _state = save(next);
      _raw = readRaw();
      moved = true;
      return _state;
    } finally {
      if (moved) notify();
    }
  }

  // ── operations (pure over a state object; caller persists) ──
  // acquire: mint a NEW record for this registry key (individuals — a second call = a second record).
  function acquire(state, vehicleKey, opts, now) {
    opts = opts || {};
    var rec = normalizeVessel({
      id: opts.id,                         // tests pass an explicit id; browser mints
      vehicleKey: vehicleKey,
      owner: opts.owner || '',
      nickname: opts.nickname || null,
      acquired: { note: opts.note || null, when: opts.when || (now || null) },
      provenance: opts.note ? [{ note: opts.note, when: opts.when || (now || null) }] : [],
      // `when` above stays the caller's readable date; the record's own stamps are ms (C-B-8.2).
    }, msNow());
    var next = withVessels(state, (state.vessels || []).concat([rec]));
    return { state: next, id: rec.id };
  }

  // C-B-8.2 — `updatedAt` IS NOW MS-EPOCH, and it is stamped HERE rather than taken from the
  // caller's `now`.
  //
  // WHY THE SPLIT: `now` arrives from the apps as `nowStamp()` — `YYYY-MM-DD` — and it serves DOUBLE
  // DUTY. It fills the human-facing `when` on provenance entries and `acquired.when` ("Acquired
  // 2026-08-06"), which must stay a readable date, AND it filled `updatedAt`, which must be
  // orderable. Day granularity cannot order two edits to the same ship on the same day, and a tie
  // has no resolution rule — the audit's finding (Docs/SYNC_RECENCY_AUDIT.md). Blanket-replacing
  // `nowStamp` with `Date.now()` would have fixed recency and turned every provenance line into a
  // raw number on screen.
  //
  // So the store now owns its own recency stamp and the caller keeps owning the prose. Readers stay
  // tolerant of the legacy `YYYY-MM-DD` values already in people's browsers; the merge simply
  // refuses to compare them (C-B-8.3 — a non-ms stamp routes that record to the prompt, never to a
  // guess).
  function msNow() { try { return Date.now(); } catch (e) { return null; } }

  function updateVessel(state, id, patch, now) {
    var next = (state.vessels || []).map(function (r) {
      if (r.id !== id) return r;
      return normalizeVessel(Object.assign({}, r, patch, { id: r.id, updatedAt: msNow() }), now);
    });
    return withVessels(state, next);
  }

  function appendProvenance(state, id, event, now) {
    var next = (state.vessels || []).map(function (r) {
      if (r.id !== id) return r;
      var ev = normalizeProv(event);
      if (!ev) return r;
      return Object.assign({}, r, { provenance: r.provenance.concat([ev]), updatedAt: msNow() });
    });
    return withVessels(state, next);
  }

  // The one path the audit flagged as skipping the stamp entirely. Currently unreachable from the
  // UI — every removal routes through `updateVessel` — but it is an exported function waiting for a
  // caller, and "unreachable today" is how the next silent staleness gets in.
  function touch(rec) { return Object.assign({}, rec, { updatedAt: msNow() }); }

  // Decommission. The removed id rides the result, invisibly, to `save`, which tombstones it (V-4).
  function removeVessel(state, id) {
    var gone = [];
    var kept = (state.vessels || []).filter(function (r) {
      if (r.id !== id) return true;
      gone.push(String(r.id));
      return false;
    });
    var next = withVessels(state, kept);
    if (gone.length) Object.defineProperty(next, DELETED, { value: gone });
    return next;
  }

  // R-S4CC-2 · THE ACQUIRED LINE IS READ, NOT WRITTEN (ruling `shipyard-s4-collection-contracts`). The S4 faces
  // build it from the record's own `acquired` field and never write it back: one fact, one home. K1's
  // kind:'acquired' stays in the vocabulary with no writer.
  //   text: acquired.note when it has one; otherwise the owner's sentence the approved frames print —
  //         'char:*' → "Added to your ships." · 'party' or a group's 'party_<uuid>' (R-BSBP-1) → "Added to the party’s ships." ·
  //         'npc:*' → "Added under <opts.npcName> from the catalogue." (the caller resolves the name; the
  //         frames print none for 'name:' or no owner, so text is null there).
  //   when: acquired.when, the caller's readable date (the face applies B1).
  //   prov: the index of the PROV-1 line carry's acquire seeded from the same note (same note, same `when`, no
  //         kind), or null — that line IS this line, so the face shows it once. The switched-off player door's
  //         legacy "Acquired." pair reads as ONE line carrying the owner's sentence.
  var ACQUIRED_LEGACY_NOTE = 'Acquired.';
  function acquiredLine(rec, opts) {
    if (!rec || typeof rec !== 'object') return null;
    var a = rec.acquired || {}, note = a.note != null && a.note !== '' ? String(a.note) : null, when = a.when == null ? null : a.when;
    var prov = null;
    if (note != null) {
      (rec.provenance || []).some(function (e, i) {
        if (e && !e.kind && e.note === note && (e.when == null ? null : e.when) === when) { prov = i; return true; }
        return false;
      });
    }
    var owner = String(rec.owner || ''), sentence = null;
    if (/^char:/.test(owner)) sentence = 'Added to your ships.';
    else if (owner === 'party' || /^party_/.test(owner)) sentence = 'Added to the party\u2019s ships.';   // R-BSBP-2: a group's id reads as the party's
    else if (/^npc:/.test(owner)) sentence = 'Added under ' + ((opts && opts.npcName) || owner.slice(4)) + ' from the catalogue.';
    var text = note != null && note !== ACQUIRED_LEGACY_NOTE ? note : sentence;
    return { text: text, when: when, prov: prov };
  }

  function forOwner(state, owner) {
    if (owner == null) return (state.vessels || []).slice();
    return (state.vessels || []).filter(function (r) { return r.owner === owner; });
  }

  // ── SHIPYARD Y3d attachments (v2) ──
  // S3: an install writes its INSTALLED event (W6; the brief's LIVE-vs-DRAWN keeps this as the one install
  // path). `att` may carry `reason` and `session`; `mods` start empty.
  function installAttachment(state, id, att, now) {
    var next = (state.vessels || []).map(function (r) {
      if (r.id !== id) return r;
      var na = normalizeInstalled(att);
      if (!na) return r;
      var ev = { note: null, when: strOrNull(now), kind: 'installed', ref: na.key };
      if (na.reason) ev.reason = na.reason;
      if (na.session != null) ev.session = na.session;
      return normalizeVessel(Object.assign({}, r, { attachments: r.attachments.concat([na]), provenance: r.provenance.concat([ev]) },
        { id: r.id, updatedAt: msNow() }), now);
    });
    return withVessels(state, next);
  }
  function removeAttachment(state, id, index) {
    var next = (state.vessels || []).map(function (r) {
      if (r.id !== id) return r;
      // Stamped now — this is the path the audit found skipping `updatedAt` entirely.
      return normalizeVessel(Object.assign({}, r, { attachments: r.attachments.filter(function (_, i) { return i !== index; }) }, { id: r.id, updatedAt: msNow() }), null);
    });
    return withVessels(state, next);
  }

  // ── SHIP YARD S3 · the core's ops (ruling `shipyard-s3-contracts` R-S3K-2, R-S3K-5; brief §2) ──
  // Each is pure over a state, like the ops above; the caller persists through `apply`. `now` is the
  // caller's READABLE date (it fills `when`); the record's own recency stamp is the store's (msNow).
  // `session` is nullable until a campaign exists (R-S3K-8, ADDENDUM 1).
  function edit(state, id, fn, now) {
    var next = (state.vessels || []).map(function (r) {
      if (r.id !== id) return r;
      var patch = fn(r);
      if (!patch) return r;
      return normalizeVessel(Object.assign({}, r, patch, { id: r.id, updatedAt: msNow() }), now);
    });
    return withVessels(state, next);
  }
  function event(kind, ref, now, session, extra) {
    var ev = { note: null, when: strOrNull(now), kind: kind, ref: ref == null ? null : String(ref) };
    if (session != null) ev.session = intOrNull(session);
    return extra ? Object.assign(ev, extra) : ev;
  }
  function has(state, id) { return (state.vessels || []).some(function (r) { return r.id === id; }); }

  // K8 — a critical hit by its Table 7-9 row. `rows` is `crit_tables.json`'s `vehicle.rows` (each
  // [range, severity, result, key]); the row's severity word gives `sev` (still written for v2 readers)
  // and its printed name gives `label`. A key the table does not hold THROWS (a caller's bug, charter §8).
  // VAPORIZED IS NOT A CRIT: it writes destroyed LOST and a `crit` event whose ref is 'vaporized'.
  // With no `row`, the legacy {sev, label} entry is written, as the live stepper does today.
  function critRow(rows, key) {
    var hit = (rows || []).filter(function (r) { return r && r[3] === key; })[0];
    if (!hit) throw new Error('vesselStore.addCrit: no Table 7-9 row keyed ' + JSON.stringify(key));
    return { sev: String(hit[1] || '').split(' ')[0].toLowerCase(), label: String(hit[2] || '').split(':')[0] };
  }
  function addCrit(state, id, crit, now, rows) {
    crit = crit || {};
    var session = crit.session != null ? crit.session : null;
    if (crit.row === 'vaporized') {
      critRow(rows, 'vaporized');
      return edit(state, id, function (r) {
        return { destroyed: { state: 'lost', when: strOrNull(now), session: session, note: null },
          provenance: r.provenance.concat([event('crit', 'vaporized', now, session)]) };
      }, now);
    }
    var entry = { row: null, sev: crit.sev, label: crit.label, when: strOrNull(now), session: session };
    if (crit.row != null) {
      var rr = critRow(rows, crit.row);
      entry.row = String(crit.row); entry.sev = rr.sev; entry.label = rr.label;
    }
    if (crit.zone != null) entry.zone = crit.zone;
    if (crit.component != null) entry.component = crit.component;
    return edit(state, id, function (r) {
      return { crits: r.crits.concat([entry]), provenance: r.provenance.concat([event('crit', entry.row, now, session)]) };
    }, now);
  }

  // K10 — REPAIR. Nothing new is saved (W5 draws no repair in progress); each op records the outcome the
  // table reached, and none of them rolls.
  //   passDay: 1 system strain recovers per full day without new system strain (V-RAW-110; EotE p.225, p.243).
  function passDay(state, id, now) {
    return edit(state, id, function (r) {
      if (!r.strain_current) return null;
      return { strain_current: Math.max(0, r.strain_current - 1) };
    }, now);
  }
  //   repairCrit: the crit is repaired (difficulty = its severity, V-RAW-051, p.234, p.244); `repaired` + its row.
  function repairCrit(state, id, index, now, session) {
    return edit(state, id, function (r) {
      var c = r.crits[index];
      if (!c) return null;
      return { crits: r.crits.filter(function (_, i) { return i !== index; }),
        provenance: r.provenance.concat([event('repaired', c.row, now, session)]) };
    }, now);
  }
  //   repairStrain: Damage Control recovers 1 system strain per success, with unlimited attempts
  //   (V-RAW-110, V-RAW-051; EotE p.233–234, p.243); the table reached zero — W5's REPAIRED is the outcome.
  function repairStrain(state, id, now, session) {
    return edit(state, id, function (r) {
      return { strain_current: 0, provenance: r.provenance.concat([event('repaired', 'strain', now, session)]) };
    }, now);
  }
  //   repairHull: hull trauma to 0 at a shipyard (V-RAW-111: ~500 cr a point, SHOWN never deducted; p.243, p.245).
  function repairHull(state, id, now, session) {
    return edit(state, id, function (r) {
      return { hull_current: 0, provenance: r.provenance.concat([event('repaired', 'hull', now, session)]) };
    }, now);
  }
  //   angleShields: one point of defense from one zone to another, no zone above 4 (V-RAW-049, EotE p.233).
  //   `factory` is the registry's `defense` (the zones an unangled ship holds). A move the rule refuses
  //   returns the state unchanged.
  var MAX_ZONE = 4;
  function angleShields(state, id, from, to, factory, now) {
    if (!ZONES[from] || !ZONES[to] || from === to) return state;
    var moved = false;
    var next = edit(state, id, function (r) {
      var cur = resolveShields(r, factory);
      if (cur[from] < 1 || cur[to] + 1 > MAX_ZONE) return null;
      var sh = Object.assign({}, r.shields_current || {});
      sh[from] = cur[from] - 1; sh[to] = cur[to] + 1;
      moved = true;
      return { shields_current: sh };
    }, now);
    return moved ? next : state;
  }

  // K4 — CREW. Nothing is capped (R-S1C-2); one person may hold two roles. Typed text goes in as a NAME.
  function crewName(text) { return 'name:' + String(text == null ? '' : text); }
  function assignCrew(state, id, seat, now) {
    var ns = normalizeSeat(seat);
    if (!ns) return state;
    return edit(state, id, function (r) { return { crew: r.crew.concat([ns]) }; }, now);
  }
  function unassignCrew(state, id, index, now) {
    return edit(state, id, function (r) {
      if (!r.crew[index]) return null;
      return { crew: r.crew.filter(function (_, i) { return i !== index; }) };
    }, now);
  }

  // §9 Q3 · Q5 — RETIRE and LOST. Neither is a delete: the ship moves to HISTORY with its log and crew.
  function retire(state, id, note, now, session) {
    return edit(state, id, function (r) {
      return { retired: { when: strOrNull(now), session: session == null ? null : session, note: strOrNull(note) },
        provenance: r.provenance.concat([event('retired', null, now, session)]) };
    }, now);
  }
  function unretire(state, id, now) {
    return edit(state, id, function (r) { return r.retired ? { retired: null } : null; }, now);
  }
  function markDestroyed(state, id, how, now) {
    how = how || {};
    return edit(state, id, function (r) {
      return { destroyed: { state: how.state === 'derelict' ? 'derelict' : 'lost', when: strOrNull(now),
          session: how.session == null ? null : how.session, note: strOrNull(how.note) },
        provenance: r.provenance.concat([event('lost', null, now, how.session)]) };
    }, now);
  }

  // W6 — only the player's own line (no `kind`) is removable; an app-written event is refused.
  function removeLine(state, id, index, now) {
    return edit(state, id, function (r) {
      var e = r.provenance[index];
      if (!e || e.kind) return null;
      return { provenance: r.provenance.filter(function (_, i) { return i !== index; }) };
    }, now);
  }

  // R-S4G-1 (P1) — THE ONE WRITER of a choice, through `apply`: the zone a `chosen` defense lands on, or the
  // hull weapon a `weapon_damage_delta` moves, for ONE application — the part's base when `modIndex` is null,
  // one mod rank otherwise. `choice` is { zone } or { weapon: {i, key} }; null clears it back to PENDING.
  // An illegal value, or a part / rank that is not there, writes nothing. No event: a choice configures the
  // part, it is not the ship's story. The registry is not read here: a choice on a part whose row carries
  // no `chosen` effect is kept and ignored (B3a). A zone must be one the HULL has (R-S4WC-9; V-RAW-011, EotE p.226:
  // two at silhouette 4 or less, four from 5): the caller hands `hullZones`, the zone ids its face derives from the one
  // rule (SWRPGShipSchematic.deriveZones), and a zone outside them, or with none handed, is refused. Clearing (null)
  // needs no hull.
  function chooseTarget(state, id, attIndex, modIndex, choice, now, hullZones) {
    if (!choice || typeof choice !== 'object') return state;
    var patch = {}, own = function (k) { return Object.prototype.hasOwnProperty.call(choice, k); };
    if (own('zone')) {
      if (choice.zone !== null && (!ZONES[choice.zone] || !Array.isArray(hullZones) || hullZones.indexOf(choice.zone) === -1)) return state;
      patch.zone = choice.zone;
    }
    if (own('weapon')) {
      var ref = choice.weapon === null ? null : weaponRef(choice.weapon);
      if (choice.weapon !== null && !ref) return state;
      patch.weapon = ref;
    }
    if (!own('zone') && !own('weapon')) return state;
    return edit(state, id, function (r) {
      var a = r.attachments[attIndex];
      if (!a) return null;
      var atts = r.attachments.slice();
      if (modIndex == null) {
        atts[attIndex] = Object.assign({}, a, patch);
      } else {
        if (!a.mods[modIndex]) return null;
        var mods = a.mods.slice();
        mods[modIndex] = Object.assign({}, a.mods[modIndex], patch);
        atts[attIndex] = Object.assign({}, a, { mods: mods });
      }
      return { attachments: atts };
    }, now);
  }

  // AM-1 — one install of an option, by its stable id. Over the printed count is the resolver's WARN.
  function installMod(state, id, attIndex, option, now, session) {
    if (option == null || option === '') return state;
    return edit(state, id, function (r) {
      var a = r.attachments[attIndex];
      if (!a) return null;
      var atts = r.attachments.slice();
      atts[attIndex] = Object.assign({}, a, { mods: a.mods.concat([{ option: String(option), when: strOrNull(now),
        session: session == null ? null : session }]) });
      return { attachments: atts };
    }, now);
  }
  function removeMod(state, id, attIndex, modIndex, now) {
    return edit(state, id, function (r) {
      var a = r.attachments[attIndex];
      if (!a || !a.mods[modIndex]) return null;
      var atts = r.attachments.slice();
      atts[attIndex] = Object.assign({}, a, { mods: a.mods.filter(function (_, i) { return i !== modIndex; }) });
      return { attachments: atts };
    }, now);
  }

  // ── SHIP YARD S4 · JOB 3b — THE SWAP, REMOVE, and a spare fitted from the hold ──
  // Ruling `shipyard-s4-workbench-contracts` R-S4WC-5/6, the brief's A1.3 as ratified with B5, B6 and B8, and ADDENDUM 2's
  // C1–C4. Each is pure over a state and runs through `apply` as ONE op, so a weapon or a part is never both aboard and in
  // the hold. A refusal returns the state it was handed (apply writes nothing and tells no one). The registries are not read
  // here: the caller hands what a refusal needs (`fit`), as chooseTarget takes `hullZones`.
  function vesselOf(state, id) { return (state.vessels || []).filter(function (r) { return r.id === id; })[0] || null; }
  function cargoIndex(rec, cargoId) {
    var at = -1;
    (rec.cargo || []).forEach(function (c, k) { if (at === -1 && c.id === String(cargoId)) at = k; });
    return at;
  }
  function mintCargoId() { return 'c_' + mintId().slice(2); }
  // The live MountState at i: the one whose key is still the hull row's (a mismatched one is ORPHANED and left alone).
  function liveMount(rec, i, hullKey) {
    var at = -1;
    (rec.mounts || []).forEach(function (m, k) { if (at === -1 && m.i === i && m.key === hullKey) at = k; });
    return at;
  }
  // B8 · THE ONE REFUSAL TEST of a swap — swapMount's own, and the counter's `vweap` line's deliverability (A3: a swap that
  // would be refused is never charged). `fit` = { hull: [the hull row's weapons[].key], weapons: { <registry id>: row },
  // spare?: <CargoLine id> }. → null (it would be written) or the reason it would not:
  //   'no_ship' · 'no_mount' (i not on the hull row) · 'not_in_the_book' (W neither a registry row nor the hull row's own key
  //   at i — B5: FIT IT BACK is always possible, for every key class) · 'already_fitted' (W is the mount's weapon now) ·
  //   'no_spare' (a named spare is not in this hold as W).
  // SHIP YARD S8 (card `shipyard-s8-build` ADDENDUM 4 H-2): THE SHELF — a weapons-registry row the Yard offers, sells or swaps in is
  // a Table 7-17 row ("Upgrading Weapons", EotE p.271). The one row outside it (BLASTLTREP_VEH, EotE p.250, the gun a conversion
  // adds) has no printed price and is "never sold or priced" (A2: no price, no sale). Read by `table`, never by price: the schema
  // admits a null price ONLY outside Table 7-17, so the two sets are one, and the Yard's price read stays listPrice's alone
  // (R-S4WB-8). Read by swapRefusal, the counter's fold and the view's K4 shelf.
  var SHELF_TABLE = 'EotE Table 7-17';
  function onTheShelf(row) { return !!row && typeof row === 'object' && row.table === SHELF_TABLE; }
  function swapRefusal(state, id, i, W, fit) {
    fit = fit || {};
    var r = vesselOf(state, id), hull = Array.isArray(fit.hull) ? fit.hull : null;
    if (!r) return 'no_ship';
    if (!hull || typeof i !== 'number' || hull[i] == null) return 'no_mount';
    if (W == null || W === '') return 'not_in_the_book';
    W = String(W);
    var hk = String(hull[i]);
    if (W !== hk && !(fit.weapons && Object.prototype.hasOwnProperty.call(fit.weapons, W) && onTheShelf(fit.weapons[W]))) return 'not_in_the_book';
    var at = liveMount(r, i, hk), cur = at === -1 || r.mounts[at].replaced_by == null ? hk : r.mounts[at].replaced_by;
    if (cur === W) return 'already_fitted';
    if (fit.spare != null) {
      var si = cargoIndex(r, fit.spare);
      if (si === -1 || r.cargo[si].kind !== 'weapon' || r.cargo[si].ref !== W) return 'no_spare';
    }
    return null;
  }
  // A1.3 · THE SWAP on mount i to weapon W (K4; FINALIZE's vweap·fit with reason 'bought'; FIT IT BACK from the hold with
  // fit.spare). Writes, in one op: the live MountState {i, key: the hull row's key, replaced_by: W — null when W is the
  // hull's own key (B5), so its as-published weapon prints again —, note kept (B6)}; the weapon coming off (replaced_by if
  // the mount was swapped before, else the hull's) into the hold, CargoLine {kind:'weapon', ref, from_mount: i, qty: 1,
  // session?}; the named spare's line gone; and the log's `installed {ref: W, reason?}` then `removed {ref: <off>, to:
  // 'hold'}` (R-S4WC-6). Hard points: 0 (EotE p.271, replacing a system). The fit verdict is information, never a gate.
  function swapMount(state, id, i, W, reason, now, session, fit) {
    if (swapRefusal(state, id, i, W, fit) !== null) return state;
    W = String(W);
    var r = vesselOf(state, id), hk = String(fit.hull[i]), at = liveMount(r, i, hk);
    var m = at === -1 ? { i: i, key: hk, replaced_by: null, note: null } : r.mounts[at];
    var off = m.replaced_by != null ? m.replaced_by : hk;
    var mounts = r.mounts.slice(), next = Object.assign({}, m, { replaced_by: W === hk ? null : W });
    if (at === -1) mounts.push(next); else mounts[at] = next;
    var cargo = r.cargo.slice();
    if (fit.spare != null) cargo.splice(cargoIndex(r, fit.spare), 1);
    var line = { id: mintCargoId(), kind: 'weapon', ref: off, qty: 1, from_mount: i };
    if (session != null) line.session = session;
    cargo.push(line);
    var evs = [event('installed', W, now, session, REASONS[reason] ? { reason: reason } : null),
      event('removed', off, now, session, { to: 'hold' })];
    return edit(state, id, function () { return { mounts: mounts, cargo: cargo, provenance: r.provenance.concat(evs) }; }, now);
  }
  // R-S4WC-6 + C1/C2/C4 · REMOVE a part (WB3's choice): `to` 'hold' (a spare) or 'discarded'. Writes `removed {ref, to}` and,
  // to the hold, CargoLine {kind:'part', ref, qty: 1, session?, note?, mods?}: the part's mods travel as they were ({option,
  // when, session?}, C1); its positional choices do not — `zone`, `weapon` and each rank's (C2); its own note becomes the
  // line's note. No roll and no cost (C4). Refused: no such ship or part, or a `to` outside the two words.
  function removePart(state, id, attIndex, to, now, session) {
    var r = vesselOf(state, id), a = r && TO[to] ? r.attachments[attIndex] : null;
    if (!a) return state;
    var patch = { attachments: r.attachments.filter(function (_, k) { return k !== attIndex; }),
      provenance: r.provenance.concat([event('removed', a.key, now, session, { to: to })]) };
    if (to === 'hold') {
      var line = { id: mintCargoId(), kind: 'part', ref: a.key, qty: 1 };
      if (session != null) line.session = session;
      if (a.note != null) line.note = a.note;
      var mods = (a.mods || []).map(function (m) {
        var o = { option: m.option, when: m.when == null ? null : m.when };
        if (m.session != null) o.session = m.session;
        return o;
      });
      if (mods.length) line.mods = mods;
      patch.cargo = r.cargo.concat([line]);
    }
    return edit(state, id, function () { return patch; }, now);
  }
  // S8 6h (card `shipyard-s8-build` ADDENDUM 21, H-8 (a); frames v3 L-before → L-after, R-S8FR-5): MAKE IT THIS SHIP'S CONVERSION —
  // a template held as a PART (a legacy holder, R-S8B-6) becomes the ship's `conversion` in ONE apply: the held entry at
  // `attIndex` leaves `attachments` and `conversion` = {key: its key, arcs: [] (PENDING, as L-after draws), note: its note}. No
  // other member moves and no provenance event is written (the Convert door writes none). The entry's S7 zone picks are not
  // carried (inert under R-S8B-6). Refused: no such ship or entry, or a ship already converted. The door's rule is
  // `legacyConversion`; this writes, it does not judge the template.
  function makeConversion(state, id, attIndex, now) {
    var r = vesselOf(state, id), a = r ? r.attachments[attIndex] : null;
    if (!a || r.conversion) return state;
    return updateVessel(state, id, { attachments: r.attachments.filter(function (_, k) { return k !== attIndex; }),
      conversion: { key: a.key, arcs: [], note: a.note == null ? null : a.note } }, now);
  }
  // MAKE IT's door (ADDENDUM 21 (iii)/(iv)): null = no door — no entry, the parts list not in hand (the kind is unknowable, and
  // WB5 owns PARTS' body then), an entry that is not a kind 'conversion' row, or a ship already converted (REMOVE CONVERSION is
  // CONVERSION's). Else {key, why}: `why` null = live; a code = inert, read as the Convert door reads it (conversionRefusal over
  // the ship as it stands — the held template is not a part that refuses, R-S8FJ-2 as corrected).
  function legacyConversion(record, attIndex, vehicle, attachments) {
    var a = record && record.attachments ? record.attachments[attIndex] : null;
    if (!a || record.conversion || !(attachments && typeof attachments === 'object')) return null;
    var row = attachments[a.key];
    if (!row || row.kind !== 'conversion') return null;
    return { key: a.key, why: conversionRefusal(record, vehicle, row, attachments) };
  }
  // C3 · FIT IT from the hold (WB4): the spare part installed through THE install path (installAttachment: its INSTALLED
  // line, `reason?`) with its mods restored — each rank's choices absent, which is PENDING (C2) — and the line's note back on
  // the part; the line gone. One op (both halves are pure; apply writes once). Refused: no such ship, or `cargoId` is not a
  // part in this hold.
  function fitPart(state, id, cargoId, reason, now, session) {
    var r = vesselOf(state, id), at = r ? cargoIndex(r, cargoId) : -1, c = at === -1 ? null : r.cargo[at];
    if (!c || c.kind !== 'part' || c.ref == null) return state;
    var att = { key: c.ref, note: c.note == null ? null : c.note,
      mods: (c.mods || []).map(function (m) { return { option: m.option, when: m.when == null ? null : m.when, session: m.session == null ? null : m.session }; }) };
    if (session != null) att.session = session;
    if (REASONS[reason]) att.reason = reason;
    var out = edit(state, id, function (rec) { return { cargo: rec.cargo.filter(function (_, k) { return k !== at; }) }; }, now);
    return installAttachment(out, id, att, now);
  }
  // WB4 · DISCARD a spare (R-S4WC-6; the approved page's log line "REMOVED · <name> — discarded."): the hold's line gone and
  // `removed {ref, to: 'discarded'}` logged, in one op. Refused: no such ship, or `cargoId` is not a spare (a part or a
  // weapon) in this hold.
  function discardSpare(state, id, cargoId, now, session) {
    var r = vesselOf(state, id), at = r ? cargoIndex(r, cargoId) : -1, c = at === -1 ? null : r.cargo[at];
    if (!c || (c.kind !== 'part' && c.kind !== 'weapon') || c.ref == null) return state;
    return edit(state, id, function (rec) {
      return { cargo: rec.cargo.filter(function (_, k) { return k !== at; }),
        provenance: rec.provenance.concat([event('removed', c.ref, now, session, { to: 'discarded' })]) };
    }, now);
  }
  // ── WB6 · TRADE's writes (R-S4WC-7 item 6; the approved page, `shipyard-s4-approvals` R-S4A-4). Each is one op over the
  // ratified fields only (SHIPYARD_Y2_SCHEMA.md §1's CargoLine and Passenger), none charged and none logged: TRADE records
  // what she carries. A spare (a part, a weapon) is FIT's to move or discard (WB4), never TRADE's.
  // addCargo: an item from the gear list {kind:'item', ref, qty ≥ 1, hidden} or a line of your own {kind:'free', name, qty ≥
  // 1, enc — the WHOLE line's, as W7 weighs it —, hidden}. Refused: no such ship, another kind, an item with no ref, a line of
  // your own with no words.
  function addCargo(state, id, line, now) {
    var r = vesselOf(state, id);
    if (!r || !line) return state;
    var qty = Math.max(1, Math.round(Number(line.qty) || 1)), out = null, words = String(line.name == null ? '' : line.name).trim();
    if (line.kind === 'item' && line.ref != null && line.ref !== '') out = { id: mintCargoId(), kind: 'item', ref: String(line.ref), qty: qty, hidden: line.hidden === true };
    else if (line.kind === 'free' && words) out = { id: mintCargoId(), kind: 'free', name: words, qty: qty, enc: numOrNull(line.enc), hidden: line.hidden === true };
    if (!out) return state;
    return edit(state, id, function (rec) { return { cargo: rec.cargo.concat([out]) }; }, now);
  }
  // editCargo: a line's count and where it rides; a line of your own also its words and its encumbrance. `patch` ⊆ {qty,
  // hidden, name, enc}; anything else is ignored. Refused: no such ship or line, a spare, a count below 1, words emptied.
  function editCargo(state, id, cargoId, patch, now) {
    var r = vesselOf(state, id), at = r ? cargoIndex(r, cargoId) : -1, c = at === -1 ? null : r.cargo[at];
    if (!c || !patch || (c.kind !== 'item' && c.kind !== 'free')) return state;
    var next = Object.assign({}, c);
    if ('qty' in patch) { var q = Math.round(Number(patch.qty)); if (!(q >= 1)) return state; next.qty = q; }
    if ('hidden' in patch) next.hidden = patch.hidden === true;
    if (c.kind === 'free' && 'name' in patch) { var w = String(patch.name == null ? '' : patch.name).trim(); if (!w) return state; next.name = w; }
    if (c.kind === 'free' && 'enc' in patch) next.enc = numOrNull(patch.enc);
    return edit(state, id, function (rec) { var cargo = rec.cargo.slice(); cargo[at] = next; return { cargo: cargo }; }, now);
  }
  // removeCargo: a cargo line's REMOVE — the line gone, nothing logged. Refused: no such ship or line, a spare.
  function removeCargo(state, id, cargoId, now) {
    var r = vesselOf(state, id), at = r ? cargoIndex(r, cargoId) : -1, c = at === -1 ? null : r.cargo[at];
    if (!c || (c.kind !== 'item' && c.kind !== 'free')) return state;
    return edit(state, id, function (rec) { return { cargo: rec.cargo.filter(function (_, k) { return k !== at; }) }; }, now);
  }
  // ── SHIP CARGO (card `shipyard-cargo-build` R-SCB-1; ruling `shipyard-cargo-concept` R-SCG-1/-2). The SHIP's half of LOAD
  // and UNLOAD, one pure op each; the character's half is the host's (R-SCB-2) and the act that pairs them is the host's too
  // (R-SCB-3). Neither logs nor charges (TRADE's rule). `gearRow(ref)` → the gear registry's row or null is handed by the
  // host, never read here (as sumCargo's `encFor`); without it no ref can be shown to be a gear row, so both refuse.
  // loadCargo: n (a whole number ≥ 1) of the gear entry `ref` into the hold — onto the item line of that ref riding where the
  // load rides (open, or HIDDEN when `hidden` is true: the approved frames O-hid / O-hid-after load into a smuggling
  // compartment, R-SCG-5 reads it against the hidden capacity) when there is one (qty += n; one stack per good, R-SCG-1), else a
  // new line through addCargo. Refused (the state handed back): no such ship, n out of range, a ref with no gear row.
  function loadCargo(state, id, load, now, gearRow) {
    var r = vesselOf(state, id), ref = load && load.ref != null ? String(load.ref) : '', n = load ? Number(load.n) : NaN, hid = !!load && load.hidden === true;
    if (!r || !ref || !(n >= 1) || n !== Math.floor(n) || typeof gearRow !== 'function' || !gearRow(ref)) return state;
    var at = -1;
    (r.cargo || []).forEach(function (c, k) { if (at === -1 && c.kind === 'item' && c.ref === ref && !!c.hidden === hid) at = k; });
    if (at === -1) return addCargo(state, id, { kind: 'item', ref: ref, qty: n, hidden: hid }, now);
    return edit(state, id, function (rec) {
      var cargo = rec.cargo.slice(); cargo[at] = Object.assign({}, cargo[at], { qty: (cargo[at].qty || 1) + n });
      return { cargo: cargo };
    }, now);
  }
  // unloadCargo: n of the item line `cargoId` out of the hold — qty -= n, and removeCargo at 0 (R-SCG-2). Open or hidden
  // alike. Refused: no such ship or line, a line that is not an `item` (a line of your own, a spare), n out of range
  // (1..the line's count), a ref with no gear row.
  function unloadCargo(state, id, cargoId, n, now, gearRow) {
    var r = vesselOf(state, id), at = r ? cargoIndex(r, cargoId) : -1, c = at === -1 ? null : r.cargo[at], k = Number(n);
    if (!c || c.kind !== 'item' || c.ref == null || !(k >= 1) || k !== Math.floor(k) || k > (c.qty || 1)) return state;
    if (typeof gearRow !== 'function' || !gearRow(c.ref)) return state;
    if (k === (c.qty || 1)) return removeCargo(state, id, cargoId, now);
    return edit(state, id, function (rec) {
      var cargo = rec.cargo.slice(); cargo[at] = Object.assign({}, c, { qty: (c.qty || 1) - k });
      return { cargo: cargo };
    }, now);
  }
  // addPassenger: ＋ A NAME — {id, who: 'name:<words>', where: {deck, area} | null}. Refused: no such ship, no words.
  function addPassenger(state, id, name, where, now) {
    var r = vesselOf(state, id), words = String(name == null ? '' : name).trim();
    if (!r || !words) return state;
    var px = { id: 'p_' + mintId().slice(2), who: crewName(words),
      where: where && where.deck != null ? { deck: String(where.deck), area: where.area == null ? null : String(where.area) } : null };
    return edit(state, id, function (rec) { return { passengers: rec.passengers.concat([px]) }; }, now);
  }
  // removePassenger: ✕ — taken off at once, no ask. Refused: no such ship or passenger.
  function removePassenger(state, id, passengerId, now) {
    var r = vesselOf(state, id);
    if (!r || !(r.passengers || []).some(function (x) { return x.id === String(passengerId); })) return state;
    return edit(state, id, function (rec) { return { passengers: rec.passengers.filter(function (x) { return x.id !== String(passengerId); }) }; }, now);
  }
  // A SPARE INTO THE HOLD — K3's INTO THE HOLD and the counter's `then:'hold'` (the brief's §4.1; A1.4): ONE writer. It
  // writes the ratified CargoLine {id, kind: 'part'|'weapon', ref, qty ≥ 1, from_mount (a weapon's: null — it came off no
  // mount), session?} and no log line (a spare writes none, A1.4). Refused: no such ship, another kind, or no ref.
  function holdSpare(state, id, spare, now, session) {
    var r = vesselOf(state, id);
    if (!r || !spare || (spare.kind !== 'part' && spare.kind !== 'weapon') || spare.ref == null || spare.ref === '') return state;
    var line = { id: mintCargoId(), kind: spare.kind, ref: String(spare.ref), qty: Math.max(1, Math.round(Number(spare.qty) || 1)) };
    if (spare.kind === 'weapon') line.from_mount = null;
    if (session != null) line.session = session;
    return edit(state, id, function (rec) { return { cargo: rec.cargo.concat([line]) }; }, now);
  }

  // ── SHIP YARD S4 · JOB 3b · G-7 — A COUNTER LINE DELIVERED ──
  // Ruling `shipyard-s4-workbench-contracts` R-S4WC-1 (A1, A3, A4, A6, A7) and the brief's A1.4 as ratified with B8. A line
  // is the counter's RECORD, {id, qty, price?, for?}: `for` = {vessel, then: 'fit'|'hold', att?|mount?}; the id is
  // `vpart:<vehicle-attachments key>`, `vmod:<key>/<added_options id>` or `vweap:<vehicle-weapons key>`.
  // counterRefusal → null (it would be delivered) or why not — A4's rule, ONE rule, in this order:
  //   'none'  no `for` (A1: an older build's re-save dropped it) · 'bad_line' an id or `for` this build cannot read ·
  //   'off'   K9 is OFF · 'away' the ship is not on this device · 'held' the door's write rule fails (V-1: the Yard writes
  //           nothing while its store is stale) ·
  //   'not_in_the_book' a part, or a spare weapon, the registry does not hold (A2: it has no price) — or a part the books
  //           price per point of silhouette on a ship whose hull gives none (R-S4WB-6: no price, no sale) ·
  //   'no_part' a mod's `att` no longer names the part in its id ·
  //   'left_out' a part, or a mod onto a part, the parts list does not offer (B-1326; R-S8C-15; S8's `offerable`, by kind): the host's `offered`, the
  //           same rule its offer paths read (S7's leave-out, D-222), so a left-out part is never delivered ·
  //   a weapon fitted: swapRefusal's own reason, the one predicate (B8) — 'no_mount' · 'not_in_the_book' · 'already_fitted' ·
  //   'not_in_the_book' also for a gear line (B-1636, 355 Q2 A: `gear:<id>`, then 'hold' only) whose id no gear row holds
  //           (the SHIPYARD_Y2_SCHEMA list); whether it is on the Trade goods shelf is the STORE's test (the hold never
  //           reads trade_goods.vocab.json, 355 Q3 A).
  // `ctx` = { k9, writable, gearRow?: function (id) → the gear.json row or null (a gear line's test, and loadCargo's), hull: function (vesselId) → the hull row's weapons[].key or null, attachments: {id: row},
  //   weapons: {id: row}, unpriced?: function (vesselId, row) → true when that part has no price on that ship (R-S4WB-6),
  //   offered?: function (row) → false when the parts list leaves that part out (B-1326) }
  //   — handed by the host, never read here (as swapMount's `fit`); the price itself is the host's one read (A2).
  function parseCounterId(id) {
    var s = String(id == null ? '' : id), c = s.indexOf(':'), sec = c > 0 ? s.slice(0, c) : null, rest = c > 0 ? s.slice(c + 1) : '';
    if (sec === 'vmod') {
      var k = rest.indexOf('/');
      return k > 0 && k < rest.length - 1 ? { sec: sec, key: rest.slice(0, k), option: rest.slice(k + 1) } : null;
    }
    // B-1636 (ruling `release-r7-bug-burndown` ADDENDUM 355 Q2 A): a GEAR line bound for a hold, `gear:<gear.json id>`
    return (sec === 'vpart' || sec === 'vweap' || sec === 'gear') && rest ? { sec: sec, key: rest } : null;
  }
  // SHIP YARD S8 · THE ONE OFFER RULE (card `shipyard-s8-build` R-S8B-3; ruling `shipyard-s8-census-card` R-S8C-8): a row is
  // offered as a PART only when it carries no `kind`. The 22 that do — the eleven crafting core components (kind 'engine' |
  // 'hull', FO pp.81–84) and the eleven conversions (kind 'conversion', DC p.71) — have their own homes (a build, a conversion),
  // never the parts list. Every path that offers, sells or mods a part reads THIS function: the view's `offered` (fitModel's
  // groups and count, the plan's ?part=, the ITS MODS doors) and the counter's fold below. It replaced S7's LEAVE_OUT list
  // (D-222) and retires B-1327. A saved ship that holds one keeps it (R-S8C-10, s-4): this rule offers, it never strips.
  function offerable(row) { return !!row && typeof row === 'object' && row.kind == null; }
  // ── SHIP YARD S8 · THE ONE VEHICLE LOOKUP (card `shipyard-s8-build` R-S8B-4; ruling `shipyard-s8-census-card` R-S8C-9) ──
  // vehicleFor(ref, library, frames?) → the row a ship resolves over. A record carrying `build` → its FRAME row (from `frames`,
  // else this module's loaded frames registry; null while it loads = HELD, never a library row); otherwise the LIBRARY row by
  // `vehicleKey` (a vessel record) or `key` (an encounter's craft entry). `library` is the host's: key → row, or a list of rows.
  // Every face that turns a ship into its row calls this, so a built ship and a stock ship are looked up one way.
  var FRAMES_URL = 'public/data/canonical/vehicle-frames.json';
  var _frames = null, _framesPending = false, _framesSubs = [];
  function setFrames(byId) {
    _frames = byId && typeof byId === 'object' ? byId : null;
    _framesSubs.slice().forEach(function (fn) { try { fn(); } catch (e) { /* a bad subscriber cannot break the lookup */ } });
  }
  // one load per page, in a browser only (node hands the registry with setFrames); a failed load is NOT cached
  function loadFrames() {
    if (_frames || _framesPending || typeof global.document === 'undefined' || typeof global.fetch !== 'function') return;
    _framesPending = true;
    global.fetch(FRAMES_URL).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      _framesPending = false;
      if (j && j.vehicle_frames) setFrames(j.vehicle_frames);
    }).catch(function () { _framesPending = false; });
  }
  function getFrames() { loadFrames(); return _frames; }
  function subscribeFrames(fn) {
    loadFrames();
    _framesSubs.push(fn);
    return function () { var i = _framesSubs.indexOf(fn); if (i >= 0) _framesSubs.splice(i, 1); };
  }
  // the React face: re-renders when the frames arrive, so a built ship's row appears without a reload
  function useFrames() { return global.React.useSyncExternalStore(subscribeFrames, getFrames); }
  function vehicleFor(ref, library, frames) {
    if (!ref || typeof ref !== 'object') return null;
    var b = ref.build;
    if (b && typeof b === 'object' && b.frame) { var fr = frames || getFrames(); return (fr && fr[b.frame]) || null; }
    var key = ref.vehicleKey != null ? ref.vehicleKey : ref.key;
    if (key == null || key === '') return null;
    if (typeof library === 'function') return library(key) || null;
    if (Array.isArray(library)) { for (var i = 0; i < library.length; i++) if (library[i] && library[i].key === key) return library[i]; }
    return null;
  }
  function counterRefusal(state, line, ctx) {
    ctx = ctx || {};
    // the store's own rule first, whatever the host hands; the host's `offered` (the view's, which also leaves out K4's act)
    // may only narrow it
    function leftOut(row) { return !offerable(row) || (!!ctx.offered && !ctx.offered(row)); }
    var f = line && line.for;
    if (!f || typeof f !== 'object') return 'none';
    var L = parseCounterId(line.id);
    // B-1636 (355 Q2 A): `then` takes only 'hold' on a gear line; 'fit' is a vessel-line word
    if (!L || (f.then !== 'fit' && f.then !== 'hold') || (L.sec === 'vmod' && f.then !== 'fit') || (L.sec === 'gear' && f.then !== 'hold')) return 'bad_line';
    if (!ctx.k9) return 'off';
    var r = vesselOf(state, f.vessel);
    if (!r) return 'away';
    if (!ctx.writable) return 'held';
    // B-1636 (355 Q2 A): the gear arm — a gear row the registry holds (`ctx.gearRow`, loadCargo's own test), and NEVER a
    // refusal over capacity (the hold's own warn shows, R-SCG-5)
    if (L.sec === 'gear') return typeof ctx.gearRow === 'function' && ctx.gearRow(L.key) ? null : 'not_in_the_book';
    if (L.sec === 'vpart') {
      var row = ctx.attachments && ctx.attachments[L.key];
      if (row && leftOut(row)) return 'left_out';
      return row && !(ctx.unpriced && ctx.unpriced(f.vessel, row)) ? null : 'not_in_the_book';
    }
    if (L.sec === 'vmod') {
      var a = typeof f.att === 'number' ? r.attachments[f.att] : null;
      if (!a || a.key !== L.key) return 'no_part';
      var held = ctx.attachments && ctx.attachments[L.key];
      return held && leftOut(held) ? 'left_out' : null;
    }
    if (f.then === 'hold') return ctx.weapons && onTheShelf(ctx.weapons[L.key]) ? null : 'not_in_the_book';
    return swapRefusal(state, f.vessel, f.mount, L.key, { hull: ctx.hull ? ctx.hull(f.vessel) : null, weapons: ctx.weapons });
  }
  // A3 · THE FOLD — the lines IN LINE ORDER, each judged against the state the lines before it made (two swaps of one mount
  // in one deal: the second takes the first's weapon off). The same fold DECIDES (the host's plan runs it over the state and
  // writes nothing) and DELIVERS (inside `apply`), so what is charged is what is written. Each delivered line is ONE op of
  // this store: vpart·fit → installAttachment ×qty (reason 'bought') · a hold line → holdSpare (a gear line → loadCargo, B-1636) · vmod → installMod ·
  // vweap·fit → swapMount (reason 'bought'). An op that leaves the state as it was is not a delivery ('refused').
  // → { state, delivered: [line index…], refused: { <line index>: reason } }.
  function deliverCounter(state, lines, ctx, now, session) {
    ctx = ctx || {};
    var s = state, delivered = [], refused = {};
    (lines || []).forEach(function (line, i) {
      var why = counterRefusal(s, line, ctx);
      if (why) { refused[i] = why; return; }
      var L = parseCounterId(line.id), f = line.for, s0 = s;
      var n = L.sec === 'vpart' || L.sec === 'gear' ? Math.max(1, Math.round(Number(line.qty) || 1)) : 1;
      // B-1636 (355 Q1 A, Q2 A): a gear line into the hold through THE ONE hold writer, loadCargo (one stack per good)
      if (L.sec === 'gear') s = loadCargo(s, f.vessel, { ref: L.key, n: n, hidden: line.hidden === true }, now, ctx.gearRow);
      else if (f.then === 'hold') s = holdSpare(s, f.vessel, { kind: L.sec === 'vpart' ? 'part' : 'weapon', ref: L.key, qty: n }, now, session);
      else if (L.sec === 'vpart') {
        var att = { key: L.key, reason: 'bought' };
        if (session != null) att.session = session;
        for (var k = 0; k < n; k++) s = installAttachment(s, f.vessel, att, now);
      } else if (L.sec === 'vmod') s = installMod(s, f.vessel, f.att, L.option, now, session);
      else s = swapMount(s, f.vessel, f.mount, L.key, 'bought', now, session, { hull: ctx.hull ? ctx.hull(f.vessel) : null, weapons: ctx.weapons });
      if (s === s0) { refused[i] = 'refused'; return; }
      delivered.push(i);
    });
    return { state: s, delivered: delivered, refused: refused };
  }

  // F-b — THE PICTURE (R-S3K-6). A JPEG data URL of at most 96,000 characters; a write that would carry the
  // vessels key past 1,200,000 bytes (80% of the sync server's 1,500,000 refusal, worker/sync.js) is refused.
  // The encode ladder is pinned here; the helper that walks it moves to lib/shared at S4 (R-S3K-5).
  var IMAGE_MAX_CHARS = 96000;
  var IMAGE_KEY_MAX_BYTES = 1200000;
  var IMAGE_LADDER = [[512, 0.82], [512, 0.70], [384, 0.70]];   // [edge px, JPEG quality], then refuse
  function utf8Bytes(str) {
    var n = 0;
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      n += c < 0x80 ? 1 : c < 0x800 ? 2 : (c >= 0xd800 && c <= 0xdbff) ? (i++, 4) : 3;
    }
    return n;
  }
  // null when the picture may be written; else the reason (S4's refusal message reads it).
  function imageRefusal(state, id, dataUrl) {
    if (dataUrl == null) return null;   // clearing the picture is always allowed
    if (typeof dataUrl !== 'string' || dataUrl.indexOf('data:image/jpeg') !== 0) return 'not_jpeg';
    if (dataUrl.length > IMAGE_MAX_CHARS) return 'too_large';
    if (!has(state, id)) return 'no_vessel';
    var trial = edit(state, id, function () { return { image: dataUrl }; }, null);
    if (utf8Bytes(JSON.stringify(withVessels(trial, trial.vessels))) > IMAGE_KEY_MAX_BYTES) return 'fleet_full';
    return null;
  }
  function setImage(state, id, dataUrl, now) {
    if (imageRefusal(state, id, dataUrl)) return state;
    return edit(state, id, function () { return { image: dataUrl == null ? null : dataUrl }; }, now);
  }

  // §16.1 — removing a deck clears every `where` that named it (crew and passengers), never the people.
  function removeDeck(state, id, deckId, now) {
    return edit(state, id, function (r) {
      if (!r.decks.some(function (d) { return d.id === deckId; })) return null;
      var off = function (x) { return x.where && x.where.deck === deckId ? Object.assign({}, x, { where: null }) : x; };
      return { decks: r.decks.filter(function (d) { return d.id !== deckId; }), crew: r.crew.map(off), passengers: r.passengers.map(off) };
    }, now);
  }

  // §14.1 · W7 — the hold's weight. `encFor(line)` resolves a registry line's encumbrance EACH (items, parts,
  // weapons), times its count; a free line carries its own, for the WHOLE line — the number the player writes
  // (W7 draws six crates at EACH "—" and ENCUMBRANCE 30; the S3 appendix's `scene.cargo.free1.enc`; the page's
  // WB6 asks it "for the whole line"). `hidden` = the lines in a smuggling compartment, which still count
  // toward the total (V-RAW-161).
  function sumCargo(rec, encFor) {
    var total = 0, hidden = 0;
    ((rec && rec.cargo) || []).forEach(function (c) {
      var e = c.kind === 'free' ? c.enc : (typeof encFor === 'function' ? encFor(c) : null);
      var w = (typeof e === 'number' && isFinite(e) ? e : 0) * (c.kind === 'free' ? 1 : (c.qty || 1));
      total += w;
      if (c.hidden) hidden += w;
    });
    return { total: total, hidden: hidden };
  }

  // resolveBudget: the hard-point ledger (pure; ONE home). capacity = registry hard_points_total (null →
  // unknown, no warn — can't warn against an unknown, C-Y3d ruling); used = Σ(installed attachment hp ?? 0);
  // over = used > capacity when capacity is known. `hpFor(key)` resolves a cost from the registry (null-safe).
  function resolveBudget(rec, vehicle, hpFor) {
    var capacity = (vehicle && typeof vehicle.hard_points_total === 'number') ? vehicle.hard_points_total : null;
    var used = 0;
    ((rec && rec.attachments) || []).forEach(function (a) {
      var hp = (typeof hpFor === 'function') ? hpFor(a.key) : null;
      used += (typeof hp === 'number' && isFinite(hp)) ? hp : 0;   // hp null (source lists none) counts as 0
    });
    return {
      capacity: capacity,
      capacityKnown: capacity != null,
      used: used,
      over: (capacity != null) && (used > capacity),   // warn-never-block; no warn when capacity unknown
    };
  }

  // §13.3 · W1's FIT COST: the installed parts' listed prices, summed — information only, never charged (the counter
  // records what the table charged). `priceFor(key)` resolves a price from the registry (null-safe); a part with no listed
  // price adds nothing and is counted in `unpriced`.
  function fitCost(rec, priceFor) {
    var total = 0, unpriced = 0;
    ((rec && rec.attachments) || []).forEach(function (a) {
      var pr = (typeof priceFor === 'function') ? priceFor(a.key) : null;
      if (typeof pr === 'number' && isFinite(pr)) total += pr; else unpriced += 1;
    });
    return { total: total, unpriced: unpriced };
  }

  // resolveFit: does this attachment fit THIS ship? (SHIPYARD Y3e, ruling shipyard-y3d-picker-fit-scope §3.)
  // Pure, warn-never-block: returns {ok, reasons[], unevaluated[]}. Computes ONLY the reliably-mappable
  // constraints against the registry vehicle — silhouette (min/max_size), is_starship, hyperdrive_primary,
  // and type_limit (whose vocabulary matches vehicle.type exactly). category_limit + item_limit use a
  // DIFFERENT taxonomy / opaque model keys → NEVER a computed verdict; quoted verbatim as `unevaluated` for
  // the reader. A field the ship doesn't carry → unevaluated, never a false "doesn't fit" (the dim never
  // speaks beyond what the data backs). `ok` is false ONLY when a computed constraint actually fails.
  // S8 (R-S8B-5): a CONVERSION template's type or category limit is computed by `conversionLimit` (the admit map, C-2's
  // category) — an ordinary part's category_limit is still quoted, never computed.
  // B-1176 (S6 B6, card `shipyard-s6-build`): the ONE article rule for "this is a <type>" — "an" before a vowel letter, else
  // "a". Every type word in the vehicle library that starts with a vowel letter is a vowel sound (the S6 gate's count), so
  // the letter decides. resolveFit's two reasons and vesselView's fitWhy both say it through this.
  function withArticle(word) {
    var w = String(word == null ? '' : word);
    return (/^[aeiou]/i.test(w) ? 'an ' : 'a ') + w;
  }

  // ── SHIP YARD S8 · WHO MAY TAKE A CONVERSION (card `shipyard-s8-build` R-S8B-5 + ADDENDUM 7 H-4..H-6; ruling
  // `shipyard-s8-census-card` R-S8C-10) — each quick conversion template fits one vehicle type (DC p.71). ──
  // CONVERSION_ADMITS: the library ships a template's limit misses but the book admits, {template id: {library key: cite}}. Read
  // ONLY by the conversion's eligibility (`conversionLimit`, below). Guarded by test/shipyard_s8_convert.cjs: every key a library
  // row, every cite present, every template a kind 'conversion' row.
  //   - V-8: the 13 ships the library types `Freighter` whose printed NAME is "… Light Freighter" (brief `shipyard-s8-surfaces`
  //     S-3). The name admits them; each cite is the page that prints that name — the library source's page (OggDude's
  //     <Source Page>), except the YV-929's, read at Dangerous Covenants p.68 (corpus `hired` 69), and the YT-1000's heading, read at
  //     Enter the Unknown p.64 (corpus `explorer` 65; its stat block runs onto p.65, the page OggDude records).
  //   - H-4 (ACCEPTED, ADDENDUM 7): three ships whose page's type line names the template's type.
  //   - H-5: the Starwind, NAME-admitted by its heading. The TIE/br and TIE/sh are NOT admitted: their one printed type is the
  //     TIE/sa's Starfighter (AoR p.272); a heading names a role, not a type.
  var CONVERSION_ADMITS = {
    paramilitary_light_freighter: {
      GHTROC720: 'enter_the_unknown p.62 · name "Ghtroc 720 Light Freighter"',
      ILHKKCITADEL: 'eote p.260 · name "ILH-KK Citadel-Class Light Freighter"',
      SIMIYIARLT: 'fad p.264 · name "Simiyiar Light Freighter"',
      YG4210: 'enter_the_unknown p.64 · name "YG-4210 Light Freighter"',
      YG4400FREIGHTER: 'suns_of_fortune p.112 · name "YG-4400 Light Freighter"',
      YT1000: 'enter_the_unknown p.64 · name "YT-1000 Light Freighter"',
      YT1200: 'far_horizons p.57 · name "YT-1200 Light Freighter"',
      YT1210FREIGHTER: 'suns_of_fortune p.112 · name "YT-1210 Light Freighter"',
      YT1300: 'eote p.264 · name "YT-1300 Light Freighter"',
      YT2400: 'eote p.265 · name "YT-2400 Light Freighter"',
      YV560: 'enter_the_unknown p.66 · name "YV-560 Light Freighter"',
      YV929F: 'dangerous_covenants p.68 · name "YV-929 Light Freighter"',
      ZH25QUEST: 'fad p.265 · name "ZH-25 Questor Light Freighter"',
    },
    paramilitary_speeder_bike_swoop: { STARHAWKSPEED: 'fly_casual p.53 · type line "Swoop/Starhawk"' },
    paramilitary_walker: { VERATHWALK: 'forged_in_battle p.58 · type line "Personal Scout Walker"' },
    paramilitary_shuttle: { ZETACARGOSHUTTLE: 'dawn_of_rebellion p.127 · type line "Cargo Shuttle"' },
    paramilitary_yacht: { STARWIND: 'eote p.263 · name-admitted: heading "STARWIND PLEASURE YACHT"' },
  };
  // a library row's categories: `category_subtype` is a list, a bare string, or (older rows) a stringified Python list
  function categoriesOf(v) {
    var c = v && v.category_subtype;
    if (Array.isArray(c)) return c.map(String);
    if (typeof c !== 'string' || c === '') return [];
    if (c.charAt(0) === '[') { var out = [], re = /'([^']*)'|"([^"]*)"/g, m; while ((m = re.exec(c))) out.push(m[1] != null ? m[1] : m[2]); return out; }
    return [c];
  }
  // the template's own limit against this ship → null (it applies) | 'type' | 'category'. An admitted key passes; a type_limit
  // reads `type` exactly (C-1 tightened the landspeeder's to the page); a category_limit (C-2) reads `category_subtype`. A
  // field the ship does not carry refuses — the page names a type, and an unlisted one is not it.
  function conversionLimit(vehicle, template) {
    var v = vehicle || {}, c = (template && template.constraints) || {}, adm = template && CONVERSION_ADMITS[template.id];
    if (adm && v.key != null && Object.prototype.hasOwnProperty.call(adm, v.key)) return null;
    if (Array.isArray(c.type_limit) && c.type_limit.length && c.type_limit.indexOf(v.type) === -1) return 'type';
    if (Array.isArray(c.category_limit) && c.category_limit.length) {
      var cats = categoriesOf(v);
      if (!c.category_limit.some(function (x) { return cats.indexOf(x) !== -1; })) return 'category';
    }
    return null;
  }
  // conversionRefusal(record, vehicle, template, attachments) → null (the template may go on) or WHY NOT, one reason, in this
  // order — computed, never stored (R-S8C-10):
  //   'held'           the ship holds attachments and the parts list is not in hand (still loading, or failed): their kinds
  //                    are unknown, so the door shows HELD (R-S4CC-6), never 'has_parts' about parts that may not exist
  //                    (ruling `shipyard-s8-build-gate` R-S8G-1);
  //   'has_parts'      the ship holds an ordinary part: only a KIND-LESS attachment refuses (D-219, as corrected by
  //                    `shipyard-s8-frames-card` ADDENDUM 4 / R-S8FJ-2: a held engine, hull or conversion does not — v_iron's
  //                    Combat Plating converts). With the parts list IN HAND, a held key it does not hold counts as a part (its
  //                    kind is unknown);
  //   'no_hard_points' the ship's hard points are 0 ("or has zero hard points", DC p.71);
  //   'type' | 'category'  the template's limit (conversionLimit).
  // `vehicle` is the row the ship resolves over (vehicleFor); `template` a kind 'conversion' row (anything else: 'type' — it
  // applies to no vehicle type); `attachments` the parts list by id.
  function conversionRefusal(record, vehicle, template, attachments) {
    var held = (record && record.attachments) || [];
    if (held.length && !(attachments && typeof attachments === 'object')) return 'held';
    var reg = attachments || {};
    var parts = held.some(function (a) { var row = reg[a.key]; return !row || offerable(row); });
    if (parts) return 'has_parts';
    if (vehicle && vehicle.hard_points_total === 0) return 'no_hard_points';
    if (!template || template.kind !== 'conversion') return 'type';
    return conversionLimit(vehicle, template);
  }

  function resolveFit(vehicle, attachment) {
    var reasons = [], unevaluated = [];
    var v = vehicle || {};
    var c = (attachment && attachment.constraints) || {};
    var sil = (typeof v.silhouette === 'number') ? v.silhouette : null;
    if (typeof c.min_size === 'number') {
      if (sil == null) unevaluated.push('Minimum silhouette ' + c.min_size + ' (this ship’s silhouette is unlisted)');
      else if (sil < c.min_size) reasons.push('needs silhouette ' + c.min_size + '+ — this ship is ' + sil);
    }
    if (typeof c.max_size === 'number') {
      if (sil == null) unevaluated.push('Maximum silhouette ' + c.max_size + ' (this ship’s silhouette is unlisted)');
      else if (sil > c.max_size) reasons.push('silhouette ' + c.max_size + ' or smaller — this ship is ' + sil);
    }
    if (c.must_be_starship === true) {
      if (typeof v.is_starship !== 'boolean') unevaluated.push('Starships only (this ship’s class is unlisted)');
      else if (!v.is_starship) reasons.push('starships only — this is ' + withArticle(v.type || 'non-starship'));
    }
    // SHIP YARD S8 (ruling `f100-s8-vocabulary` R-S8V-3): the inverse, read off the same field — "This engine type cannot be
    // mounted on starships" (Fully Operational p.82). Its drawn words are the frames' (R-MU1); until drawn, the existing form.
    if (c.must_not_be_starship === true) {
      if (typeof v.is_starship !== 'boolean') unevaluated.push('Not for starships (this ship’s class is unlisted)');
      else if (v.is_starship) reasons.push('not for starships — this is ' + withArticle(v.type || 'starship'));
    }
    if (c.must_have_hyperdrive === true) {
      var hd = v.hyperdrive_primary;
      if (hd == null) unevaluated.push('Requires a hyperdrive (this ship’s hyperdrive is unlisted)');
      else if (!(typeof hd === 'number' && hd >= 1)) reasons.push('needs a hyperdrive');
    }
    // S8 (R-S8B-5): a conversion's type or category limit is the conversion's own rule (the admit map, C-2's category) — the
    // same answer the Convert door reads, so a held template on an admitted ship reads as fitting
    var conv = attachment && attachment.kind === 'conversion';
    if (conv && conversionLimit(v, attachment)) {
      var lim = (c.type_limit && c.type_limit.length ? c.type_limit : c.category_limit) || [];
      reasons.push('only for ' + lim.join(' / ') + ' — this is ' + withArticle(v.type || 'vehicle'));
    }
    if (!conv && Array.isArray(c.type_limit) && c.type_limit.length) {
      if (!v.type) unevaluated.push('Only for: ' + c.type_limit.join(', '));
      else if (c.type_limit.indexOf(v.type) === -1) reasons.push('only for ' + c.type_limit.join(' / ') + ' — this is ' + withArticle(v.type));
    }
    // NOT cleanly mappable — quote verbatim, never computed (invent nothing):
    if (!conv && Array.isArray(c.category_limit) && c.category_limit.length)
      unevaluated.push('Limited to: ' + c.category_limit.join(', '));
    if (Array.isArray(c.item_limit) && c.item_limit.length)
      unevaluated.push('Limited to specific models: ' + c.item_limit.join(', '));
    return { ok: reasons.length === 0, reasons: reasons, unevaluated: unevaluated };
  }

  // resolveShields: current angling merged over registry factory defaults (unset zones fall back).
  function resolveShields(rec, registryDefense) {
    var d = registryDefense || {};
    var cur = (rec && rec.shields_current) || {};
    var out = {};
    ['fore', 'aft', 'port', 'starboard'].forEach(function (z) {
      out[z] = typeof cur[z] === 'number' ? cur[z] : (typeof d[z] === 'number' ? d[z] : 0);
    });
    return out;
  }

  global.SWRPGVessels = {
    VESSELS_KEY: VESSELS_KEY,
    SCHEMA_V: SCHEMA_V,
    normalizeVessel: normalizeVessel,
    load: load,
    save: save,
    // the page-local store (V-2 · B-913) — hosts read and write ONLY through these
    getState: getState,
    subscribe: subscribe,
    apply: apply,
    isStale: isStale,
    useVessels: useVessels,
    acquire: acquire,
    updateVessel: updateVessel,
    appendProvenance: appendProvenance,
    removeVessel: removeVessel,
    forOwner: forOwner,
    acquiredLine: acquiredLine,
    resolveShields: resolveShields,
    installAttachment: installAttachment,
    removeAttachment: removeAttachment,
    resolveBudget: resolveBudget,
    fitCost: fitCost,
    resolveFit: resolveFit,
    withArticle: withArticle,
    // SHIP YARD S3 · the core (R-S3K-2..6)
    addCrit: addCrit,
    passDay: passDay,
    repairCrit: repairCrit,
    repairStrain: repairStrain,
    repairHull: repairHull,
    angleShields: angleShields,
    assignCrew: assignCrew,
    unassignCrew: unassignCrew,
    crewName: crewName,
    parseWho: parseWho,
    retire: retire,
    unretire: unretire,
    markDestroyed: markDestroyed,
    removeLine: removeLine,
    installMod: installMod,
    chooseTarget: chooseTarget,
    removeMod: removeMod,
    // SHIP YARD S4 · JOB 3b (R-S4WC-5/6; A1.3 with B5, B6, B8; C1–C4)
    swapRefusal: swapRefusal,
    swapMount: swapMount,
    removePart: removePart,
    fitPart: fitPart,
    discardSpare: discardSpare,
    holdSpare: holdSpare,
    // WB6 · TRADE's writes: the hold's lines and the passengers, over the ratified fields
    addCargo: addCargo,
    editCargo: editCargo,
    removeCargo: removeCargo,
    // SHIP CARGO (R-SCB-1): the ship's half of LOAD and UNLOAD
    loadCargo: loadCargo,
    unloadCargo: unloadCargo,
    addPassenger: addPassenger,
    removePassenger: removePassenger,
    // SHIP YARD S4 · JOB 3b · G-7 (R-S4WC-1 A1/A3/A4/A6; A1.4 with B8): a counter line delivered, one fold
    parseCounterId: parseCounterId,
    counterRefusal: counterRefusal,
    offerable: offerable,   // S8 (R-S8B-3): the ONE offer rule, by kind
    onTheShelf: onTheShelf, // S8 (ADDENDUM 4 H-2): a weapons row the Yard sells or swaps in (a printed price)
    // S8 (R-S8B-4): the built ship and the ONE vehicle lookup
    normalizeBuild: normalizeBuild,
    vehicleFor: vehicleFor,
    // S8 (R-S8B-5): the conversion record, who may take one, and the admit map (read by its guard)
    normalizeConversion: normalizeConversion,
    conversionRefusal: conversionRefusal,
    makeConversion: makeConversion, legacyConversion: legacyConversion,   // S8 6h (ADDENDUM 21): MAKE IT THIS SHIP'S CONVERSION
    conversionLimit: conversionLimit,
    categoriesOf: categoriesOf,
    CONVERSION_ADMITS: CONVERSION_ADMITS,
    setFrames: setFrames,
    getFrames: getFrames,
    useFrames: useFrames,
    deliverCounter: deliverCounter,
    imageRefusal: imageRefusal,
    setImage: setImage,
    removeDeck: removeDeck,
    sumCargo: sumCargo,
    IMAGE_MAX_CHARS: IMAGE_MAX_CHARS,
    IMAGE_KEY_MAX_BYTES: IMAGE_KEY_MAX_BYTES,
    IMAGE_LADDER: IMAGE_LADDER,
  };
})(typeof window !== 'undefined' ? window : this);
