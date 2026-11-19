/* lib/shared/vesselResolve.js — SHIP YARD S3: THE ONE resolver of an owned ship's numbers.
 *
 * Ruling `shipyard-s3-contracts` R-S3K-4 (brief §2 K3): a ship's numbers are its registry row plus what is
 * installed on it, and ONE function says so — `resolve(record, vehicle, ctx)`. Every number it returns
 * carries `because`: the list of what moved it ([{ source, amount }]), which is what S4 prints as
 * "SPEED 6 (+1 High-Output Ion Turbine)". Attachments change the HULL; a talent stays a dice change on the
 * roll (R-S1RJ-5) — so Signature Vehicle's Mechanics upgrade is a REMINDER here, and only Custom Loadout's
 * two hard points (a hull number) is applied, through the bond (K2).
 *
 * The effect grammar is `charbuild-common.schema.json#/$defs/vehicle_effect`. Its op enum and this file's
 * ARMS are one list (R-F100-9: an op enters with its arm, its guard row and a canonical row together);
 * test/vessel_resolve.cjs pins that they are equal.
 *
 * What it does NOT do (each named, never silent):
 *   - apply a crit's printed result to a number (no frame shows a crit-changed number; K8);
 *   - pick the zone for a `defense_delta` whose target is `chosen`, or the weapon a `weapon_damage_delta`
 *     boosts ("one weapon system", R-S3CR-10) — the contract saves neither choice yet, so each is returned in
 *     `pending` and in `because.defense_chosen` / `because.weapon_chosen`, never guessed;
 *   - land a conversion's chosen defense without its pick: each of the template's `defense_picks` lands in `conversion.arcs[i]`,
 *     a zone already picked, an illegal one or a missing one stays PENDING ({att: 'conversion', pick: i}) (R-S8B-5);
 *   - move a number for a conversion template saved as a PART (a legacy holder): S7 held it as words, so it moves none (R-S8B-6);
 *   - decide a weapon swap without the book's weapons registry: with none handed (still loading, or failed), a swapped
 *     mount prints its hull weapon, a warning names it, and nothing is called ORPHANED (see THE RUNG below);
 *   - clamp anything a rule does not clamp. A hyperdrive never goes below its effect's `floor`.
 *
 * ctx (all optional):
 *   attachments: { <registry id>: vehicle-attachment row }   — the registry, by id
 *   weapons:     { <registry id>: vehicle-weapon row }       — the book's weapons (vehicle-weapons.json), by id (THE RUNG)
 *   characters:  [{ id, sheetData: { myShipId }, talents: { <talent id>: ranks }, talentRecords? }]  — who might be bonded;
 *                a character's own `talentRecords` (its stamp view's registry, B-1084) beat the ctx-level ones for the holder
 *   talentRecords: { <talent id>: talent record }  — the talent registry; the holder's `vehicle_effects` rows (R-M8C8-1)
 *
 * Classic script → window.SWRPGVesselResolve; node-safe (the guard loads it via `this`). Reads nothing
 * from storage and writes nothing: pure over its arguments.
 */
(function (global) {
  'use strict';

  // THE ARMS — one per op of $defs/vehicle_effect, in the schema's order. `key` is the resolved number the
  // op moves; defense and hyperdrive also take a target.
  var ARMS = {
    hull_threshold_delta: 'hull_threshold',
    strain_threshold_delta: 'strain_threshold',
    armor_delta: 'armor',
    speed_delta: 'speed',
    handling_delta: 'handling',
    defense_delta: 'defense',
    hard_points_delta: 'hard_points',
    hyperdrive_class_delta: 'hyperdrive',
    passengers_delta: 'passengers',
    encumbrance_delta: 'encumbrance',
    sensor_range_step: 'sensor_range',
    massive_delta: 'massive',
    hidden_capacity_delta: 'hidden',
    weapon_damage_delta: 'weapons',
    // F-100 M8 × SHIP YARD (ruling f100-m8-c8-signature-vehicle R-M8C8-3): TALENT-only — the part schema refuses it.
    weapon_quality_delta: 'qualities',
    // SHIP YARD S7 (ruling `shipyard-s7-contracts` R-S7V-3): the five SETs, one per stat. A SET replaces the hull's printed number
    // and lands BEFORE every delta on that number on the ship, whatever the install order (`resolve` queues the parts' and the
    // holder's effects and applies the SETs first).
    hyperdrive_class_set: 'hyperdrive',
    speed_set: 'speed',
    handling_set: 'handling',
    armor_set: 'armor',
    defense_set: 'defense',
    // SHIP YARD S8 (ruling `f100-s8-vocabulary` R-S8V-1): the sixth SET — an engine's "system strain threshold to N × silhouette"
    // (Fully Operational pp.81–82), its amount the printed base with `per_silhouette`, which `apply` already multiplies.
    strain_threshold_set: 'strain_threshold',
    // R-S8V-6: APPENDS one weapon row (a conversion's guns, DC p.71). Not a SET — it replaces nothing — but it runs in the SET
    // pass (FIRST, below), so every appended row exists before a weapon delta walks `out.weapons` (R-S8C-11).
    weapon_add: 'weapons',
  };
  var OPS = Object.keys(ARMS);
  var SETS = { hyperdrive_class_set: true, speed_set: true, handling_set: true, armor_set: true, defense_set: true,
    strain_threshold_set: true };
  // the first pass (R-S7V-3 (i), R-S8C-11): every SET, and every weapon_add, before any delta
  function first(op) { return !!SETS[op] || op === 'weapon_add'; }
  // R-S8V-4: a frame row's `fixed` map names a number that stays put whatever moves it — the Space Station's speed ("remains
  // zero no matter the engine type", FO p.81). Only these scalar numbers can be fixed; a key outside them warns.
  var FIXABLE = { speed: 1, handling: 1, armor: 1, hull_threshold: 1, strain_threshold: 1, hard_points: 1, passengers: 1,
    encumbrance: 1, massive: 1 };
  // The ops a PART may not carry (vehicle-attachment.schema.json's refusal, R-M8C8-3); the held guard derives the same list
  // from the schema, so the two cannot drift apart.
  var TALENT_ONLY = ['weapon_quality_delta'];
  // A weapon quality's key is the vocabulary id (limited_ammo) on a swapped-in weapon and the OggDude key (LIMITEDAMMO) on a
  // hull row; the vocabulary carries the latter as an alias. One normal form joins them (letters and digits, lower case): the
  // guard (test/vessel_resolve.cjs (g5)) pins it TOTAL and UNIQUE over every key the served data writes.
  function qualNorm(k) { return String(k == null ? '' : k).toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function qualityKeyIs(key, id) { return qualNorm(key) !== '' && qualNorm(key) === qualNorm(id); }
  // Range bands, nearest first, in the registry's own `sensor_range_value` words.
  var BANDS = ['srClose', 'srShort', 'srMedium', 'srLong', 'srExtreme'];
  var BAND_LABEL = { srClose: 'Close', srShort: 'Short', srMedium: 'Medium', srLong: 'Long', srExtreme: 'Extreme' };
  var ZONES = ['fore', 'aft', 'port', 'starboard'];

  function num(n) { return typeof n === 'number' && isFinite(n) ? n : null; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // ── K2 · THE BOND ──
  // resolveBond(char, vessels) → the record when it exists, is owned by 'char:<char.id>' or 'party', and is
  // neither retired nor destroyed. Otherwise null — WITH THE POINTER KEPT (the character is never edited
  // here), so an un-retire restores the bond. `vessels` is a list or a store state ({ vessels }).
  function resolveBond(char, vessels, groupIds) {
    var ptr = char && char.sheetData ? char.sheetData.myShipId : null;
    if (ptr == null || ptr === '') return null;
    var list = Array.isArray(vessels) ? vessels : ((vessels && vessels.vessels) || []);
    var rec = list.filter(function (r) { return r && r.id === ptr; })[0];
    if (!rec) return null;                                                          // absent (deleted, other device)
    if (rec.owner !== 'char:' + char.id && rec.owner !== 'party'                     // someone else's ship, unless it is a
      && (groupIds || []).indexOf(rec.owner) === -1) return null;                    // group the host says this char is in (R-BSBP-2)
    if (rec.retired) return null;                                                   // retired: history, not MY SHIP
    if (rec.destroyed) return null;                                                 // lost or derelict
    return rec;
  }
  // markMyShip(char, vesselId, vessels) → a NEW character whose sheetData.myShipId is the id (null clears).
  // An id the state does not hold THROWS (charter §8): a mark op never writes a pointer to nothing. A saved
  // pointer that later goes absent is not an error — resolveBond reads it as null.
  function markMyShip(char, vesselId, vessels) {
    if (vesselId != null) {
      var list = Array.isArray(vessels) ? vessels : ((vessels && vessels.vessels) || []);
      if (!list.some(function (r) { return r && r.id === vesselId; })) {
        throw new Error('vesselResolve.markMyShip: no vessel ' + JSON.stringify(vesselId) + ' in this state');
      }
    }
    var next = Object.assign({}, char || {});
    next.sheetData = Object.assign({}, (char && char.sheetData) || {}, { myShipId: vesselId == null ? null : String(vesselId) });
    return next;
  }

  // Signature Vehicle (V-SUP-022, Stay on Target p.32; V-SUP-080, Special Modifications pp.34–35): applies to
  // the BONDED hull when its silhouette ≤ 3 + ranks of Larger Project. Larger Project's digit is VERIFIED on a
  // clean page: "a silhouette value 1 higher than normal per rank" (Special Modifications p.34; R-S4G-19).
  var LARGER_PROJECT = { per_rank: 1, inferred: false, cite: 'Special Modifications p.34' };
  // "a vehicle of silhouette 3 or lower that the character owns" (V-SUP-080, Special Modifications pp.34–35) —
  // the base limit every holder's limit starts from; Larger Project adds per rank.
  // one_holder_cite: a vehicle is one character's Signature Vehicle at most (V-SUP-080) — U19's captions
  var SIGNATURE_VEHICLE = { max_silhouette: 3, cite: 'Special Modifications p.34–35', one_holder_cite: 'Special Modifications p.35' };
  function signatureLimit(talents) {
    var lp = num(talents && talents.larger_project) || 0;
    return SIGNATURE_VEHICLE.max_silhouette + LARGER_PROJECT.per_rank * lp;
  }
  function charRef(id) { return 'char:' + id; }
  // → { holder, too_large[], second[] }. A vehicle is one character's Signature
  // Vehicle at most (Special Modifications p.35; R-S4G-6): of the bonded characters with the talent whose limit admits
  // the hull, ONE holds it. Legacy data (an import, a sync) can carry two: the first by character id holds, and
  // each other is returned in `second` — it gets neither Custom Loadout's +2 nor the Mechanics upgrade.
  // (R-S4G-6 orders by the bond's `when` first; the bond, sheetData.myShipId, carries no `when` — that field is
  // on paper for the architect before any code reads it, so id alone orders today.)
  function signatureOf(record, vehicle, ctx) {
    var fits = [], too_large = [];
    ((ctx && ctx.characters) || []).forEach(function (c) {
      if (resolveBond(c, [record]) !== record) return;
      var t = c.talents || {};
      if (!t.signature_vehicle) return;
      var sil = num(vehicle && vehicle.silhouette);
      var lp = num(t.larger_project) || 0;
      var limit = signatureLimit(t);
      var s = { character: c.id, applies: sil != null && sil <= limit, limit: limit,
        larger_project: lp ? { ranks: lp, inferred: LARGER_PROJECT.inferred, cite: LARGER_PROJECT.cite } : null };
      (s.applies ? fits : too_large).push(s);
    });
    fits.sort(function (a, b) { return String(a.character) < String(b.character) ? -1 : String(a.character) > String(b.character) ? 1 : 0; });
    return { holder: fits[0] || null, too_large: too_large, second: fits.slice(1) };
  }

  // ── MARK's refusal (R-S4G-6; its face is U19, waiting on Jason's word): ONE pure answer to "may this character
  // mark this ship MY SHIP?". Only a character who would HOLD it as Signature Vehicle can be refused — marking
  // is the bond, and the bond is what makes a holder (K2). Built on `signatureOf`, the one holder rule:
  //   too_large — the hull's silhouette is above this character's limit (3, +1 per rank of Larger Project);
  //   held      — another character on `roster` already holds it (bonded, with the talent, and it fits).
  // `char` and `roster` entries are the resolver's ctx shape { id, sheetData, talents }. → null (allowed) or
  // { kind:'no_vessel' } | { kind:'too_large', silhouette, limit } | { kind:'held', holder }. Writes nothing.
  function markRefusal(char, vesselId, vessels, vehicle, roster) {
    var list = Array.isArray(vessels) ? vessels : ((vessels && vessels.vessels) || []);
    var rec = list.filter(function (r) { return r && r.id === vesselId; })[0];
    if (!rec) return { kind: 'no_vessel' };
    var t = (char && char.talents) || {};
    if (!t.signature_vehicle) return null;
    var sil = num(vehicle && vehicle.silhouette), limit = signatureLimit(t);
    if (sil == null || sil > limit) return { kind: 'too_large', silhouette: sil, limit: limit };
    var others = (roster || []).filter(function (c) { return c && char && String(c.id) !== String(char.id); });
    var sig = signatureOf(rec, vehicle, { characters: others });
    if (sig.holder) return { kind: 'held', holder: sig.holder.character };
    return null;
  }

  // ── THE RESOLVER ──
  // The act K4 performs has one RAW name: Upgraded Weapons (EotE p.271; A1.6: its attachment row is not a second writer).
  var UPGRADED_WEAPONS = 'Upgraded Weapons';
  // A swapped-in weapon: the hull row's MOUNTING and the registry row's PROFILE, one weapon (R-S4WC-5). Its qualities are
  // the registry's vocabulary ids (qualities.vocab.json; the hull rows' OggDude keys are that vocabulary's aliases).
  function swappedIn(hullRow, row) {
    var p = row.profile || {};
    var w = {
      key: row.id, name: row.name, damage: p.damage, crit: p.crit, range_value: p.range_value, range_label: p.range_label,
      count: 1, skill: p.skill || hullRow.skill || null,
      location: hullRow.location, turret: hullRow.turret, retractable: hullRow.retractable,
      firing_arcs: clone(hullRow.firing_arcs || {}),
      qualities_resolved: (p.qualities || []).map(function (q) { return { key: q.key, count: q.count }; }),
      swapped_from: hullRow.key,
    };
    if (hullRow.mount_note != null) w.mount_note = hullRow.mount_note;
    return w;
  }
  // B4 · THE HOLD's reading of a spare weapon (CargoLine {kind:'weapon', ref, from_mount}), on the ship whose hold holds it:
  // the hull row at `from_mount` while that row still carries its key (the count and Linked it came off with, R-S4WC-5);
  // otherwise — bought, `from_mount` null, or the row no longer carries it — the registry's book profile, as one weapon;
  // otherwise nothing resolves (U11): null. → { weapon, from: 'mount'|'registry' } or null. Pure; never persisted.
  function spareWeapon(line, vehicle, ctx) {
    if (!line || line.kind !== 'weapon' || line.ref == null) return null;
    var ws = (vehicle && Array.isArray(vehicle.weapons)) ? vehicle.weapons : [];
    var at = typeof line.from_mount === 'number' ? ws[line.from_mount] : null;
    if (at && at.key === line.ref) return { weapon: clone(at), from: 'mount' };
    var row = ctx && ctx.weapons && ctx.weapons[line.ref];
    if (row && row.profile) {
      var w = swappedIn({ firing_arcs: {} }, row);
      delete w.swapped_from;
      ['location', 'turret', 'retractable'].forEach(function (k) { delete w[k]; });
      return { weapon: w, from: 'registry' };
    }
    return null;
  }

  // B-1015 · HELD (ruling `shipyard-s4-catalogue-card` R-S4CC-1/6/7/8, the approved page @ 6aa1f830): `ctx.attachments === null`
  // says the parts list is MISSING (still loading, or its fetch failed), which is not the same as `{}` or an absent key, whose
  // meaning is unchanged. A ship with any fitted part then cannot be resolved: the list is the only map from a fitted key to its
  // ops, so every output any of the schema's 14 ops can move is HELD — returned as null (each zone, both hyperdrive classes,
  // every weapon's damage), and the face prints its existing "—". A part's seat upgrade is held too (`pools` stays empty and
  // `poolOf` marks the pool `held`), and a part's name is not looked up. Nothing is called ORPHANED: an unknown key is not a
  // lost one. A bare ship moves nothing and resolves as always. HELD_KEYS is the class, one entry per op's arm; the guard
  // (test/vessel_resolve_held.cjs) derives the ops from the schema and fails for any whose output is not held.
  // R-M8C8-3: the class is what the PARTS list could move — the talent-only ops are outside it (a held ship's quality ratings
  // stay knowable: the hull's plus the holder's talents).
  var HELD_KEYS = OPS.filter(function (op) { return TALENT_ONLY.indexOf(op) === -1; }).map(function (op) { return ARMS[op]; });
  // A sensor step on a hull with no range band only warns (`no_sensor_range`), so such a hull keeps it as printed while held — no
  // part could have given it one — and only a value an op CAN move is held. The hyperdrive is held on EVERY hull: a hyperdrive
  // delta cannot give a hull one (it warns `no_hyperdrive`), but `hyperdrive_class_set` can (R-S7V-3, the hyperdrive modules).
  // `rowsBlind`: the holder's talent rows are not in hand (R-M8C8-1), so a rated weapon quality — which a talent row could move
  // (R-M8C8-3) — is not known either: its rating reads null, as a held damage does, and the quality carries `held: true`, so a
  // face can tell a held rating ("—") from a quality the book never rates (S6 B2, card `shipyard-s6-build`; resolver output only,
  // never saved).
  function heldOut(out, rowsBlind) {
    ['hull_threshold', 'strain_threshold', 'armor', 'speed', 'handling', 'hard_points', 'passengers', 'encumbrance', 'massive',
      'hidden'].forEach(function (k) { out[k] = null; });
    if (BANDS.indexOf(out.sensor_range) !== -1) out.sensor_range = null;
    ZONES.forEach(function (z) { out.defense[z] = null; });
    ['primary', 'backup'].forEach(function (w) { out.hyperdrive[w] = null; });
    out.weapons.forEach(function (w) { w.damage = null; });
    if (rowsBlind) out.weapons.forEach(function (w) {
      (w.qualities_resolved || []).forEach(function (q) { if (typeof q.count === 'number') { q.count = null; q.held = true; } });
    });
    out.seat_talents = [];   // a held ship's parts are not known, so none grants a talent (belt and braces: it installs nothing)
    out.held = true;
    return out;
  }

  function resolve(record, vehicle, ctx) {
    var v = vehicle || {}, rec = record || {}, reg = (ctx && ctx.attachments) || {};
    // SHIP YARD S8 (R-S8B-4/-5): a built ship's engine and hull, and a conversion, are records in the parts list too — with the
    // list not in hand, a ship holding any of them HOLDS (R-S4CC-6), as a ship holding a part does
    var bld = rec.build && typeof rec.build === 'object' ? rec.build : null;
    var pieces = bld ? ['engine', 'hull'].filter(function (k) { return bld[k] && bld[k].key; }) : [];
    var held = !!ctx && ctx.attachments === null && ((rec.attachments || []).length > 0 || pieces.length > 0 || !!(rec.conversion && rec.conversion.key));
    var sil = num(v.silhouette);
    var out = {
      speed: num(v.speed), handling: num(v.handling), armor: num(v.armor),
      hull_threshold: num(v.hull_trauma), strain_threshold: num(v.system_strain),
      defense: {}, hard_points: num(v.hard_points_total),
      hyperdrive: { primary: num(v.hyperdrive_primary), backup: num(v.hyperdrive_backup) },
      passengers: num(v.passengers), encumbrance: num(v.encumbrance_capacity), hidden: 0,
      sensor_range: v.sensor_range_value || null, massive: num(v.massive),
      silhouette: sil,
      weapons: Array.isArray(v.weapons) ? v.weapons.map(clone) : [],
      pools: {}, holder_pools: {}, reminders: [], pending: [], warnings: [],
      orphaned: { attachments: [], mods: [], mounts: [], choices: [] },
      because: {}, held: false,
      seat_talents: [],   // R-SYC-5: { talentId, part, att, mod } per installed option carrying `talent_grant`; [] when held
    };
    ZONES.forEach(function (z) { out.defense[z] = num(v.defense && v.defense[z]); });
    // `floor`: a floored hyperdrive's printed floor rides its credit, so a face says "−1, NOT BELOW 1" without re-reading
    // the part (W2, W3); `ceiling` rides the same way ("+1, to 6", R-S7V-4); every other credit is { source, amount } as before
    function why(key, source, amount, floor, ceiling) {
      var c = { source: source, amount: amount };
      if (typeof floor === 'number') c.floor = floor;
      if (typeof ceiling === 'number') c.ceiling = ceiling;
      (out.because[key] = out.because[key] || []).push(c);
    }
    // R-S7V-3 (ii): a SET is credited { source, amount: null, set, from } — no signed amount, since it replaces the number
    // (a face that prints `amount` prints the part's name alone, as it does a swap's)
    function whySet(key, source, set, from) {
      (out.because[key] = out.because[key] || []).push({ source: source, amount: null, set: set, from: from });
    }
    // R-S7V-4: a ceiling bounds THIS effect's result and never lowers a number already at or above it
    function capped(cur, amt, e) {
      var next = cur + amt;
      return typeof e.ceiling === 'number' ? Math.min(next, Math.max(cur, e.ceiling)) : next;
    }
    // R-S4G-1: a PENDING entry carries its application's address — the part (`att`) and the mod rank (`mod`,
    // null for the base) — so a face can ask for that one choice (U10). Computed, never persisted.
    function pend(entry, choice) {
      if (choice) { entry.att = choice.att; entry.mod = choice.mod; if (typeof choice.pick === 'number') entry.pick = choice.pick; }
      out.pending.push(entry);
    }
    // THE RUNG — MountState (K4; ruling `shipyard-s4-workbench-contracts` R-S4WC-5, the brief's A1.3 as ratified with B4–B6):
    // i = the hull row's weapons[] index, key = the weapon key there when written.
    //   the key no longer matches the hull row's      → ORPHANED (the registry moved): kept, never applied, named;
    //   `replaced_by` names a row of ctx.weapons       → the mount PRINTS that weapon: the hull row's MOUNTING (location,
    //       arcs, turret, retractable; FaD p.234, "based on its mounting") with the book's PROFILE, as one weapon (count 1),
    //       and `because.weapon_<i>` names the swap (Upgraded Weapons, EotE p.271);
    //   `replaced_by` names no row of it              → ORPHANED (U11): kept, never applied; the hull weapon prints;
    //   no registry handed                            → nothing is decided: the hull weapon prints, a warning names the
    //       mount, and a weapon choice aimed at it stays PENDING (it may be about to change) — never a false ORPHANED.
    // It runs BEFORE the parts' effects, so a WeaponRef {i, key} chosen after a swap meets the weapon it named, and one
    // chosen before it names a weapon that is off the mount: ORPHANED, moving nothing (MountState's rule).
    var wreg = ctx && ctx.weapons && typeof ctx.weapons === 'object' ? ctx.weapons : null;
    var unsettled = {};
    (rec.mounts || []).forEach(function (m, mi) {
      var w = out.weapons[m.i];
      if (!w || w.key !== m.key) { out.orphaned.mounts.push({ mount: mi, i: m.i, key: m.key }); return; }
      if (m.note != null) w.mount_note = m.note;
      if (m.replaced_by == null) return;
      if (!wreg) { unsettled[m.i] = true; out.warnings.push({ kind: 'no_weapons_registry', i: m.i, replaced_by: m.replaced_by }); return; }
      var row = wreg[m.replaced_by];
      if (!row || !row.profile) { out.orphaned.mounts.push({ mount: mi, i: m.i, key: m.key, replaced_by: m.replaced_by }); return; }
      out.weapons[m.i] = swappedIn(w, row);
      (out.because['weapon_' + m.i] = out.because['weapon_' + m.i] || []).push({ source: UPGRADED_WEAPONS, amount: null,
        swap: { from: m.key, to: row.id } });
    });

    // `choice` is the application's own R-S4G-1 fields: { zone, weapon, att, mod, label } — the part's for its
    // base effects, the mod rank's for that rank's. `label` is the `because` source a landed choice prints.
    function apply(e, source, choice) {
      var arm = ARMS[e.op];
      if (!arm) { out.warnings.push({ kind: 'unknown_op', op: e.op, source: source }); return; }
      var amt = e.per_silhouette ? e.amount * (sil || 0) : e.amount;
      // R-S8V-6 · weapon_add: rows in swappedIn's shape from the book's profile (Linked when `linked` > 0,
      // no location, not retractable), `added_by` the source where a swap writes `swapped_from`, credited `{source, add}`. No
      // weapons registry in hand: nothing appended, a warning names it (as `mounts` do). An id the registry lacks appends
      // nothing and warns (the data path refuses it loudly, at validate_registries' Layer 1).
      if (e.op === 'weapon_add') {
        if (!wreg) { out.warnings.push({ kind: 'no_weapons_registry', weapon: e.weapon, source: source }); return; }
        var wrow = wreg[e.weapon];
        if (!wrow || !wrow.profile) { out.warnings.push({ kind: 'unknown_weapon', weapon: e.weapon, source: source }); return; }
        // R-S8V-6 as amended (f100-s8-vocabulary ADDENDUM 2): a TURRET add appends `amount` rows of count 1, one per gun, each
        // credited (the approved frames draw two TURRET rows); a non-turret add keeps ONE row with count = amount (the
        // counted pair the pages print). The rows exist before anything indexes them, so no stored row is ever split.
        var rows = e.turret ? amt : 1;
        for (var g = 0; g < rows; g++) {
          var added = swappedIn({ firing_arcs: e.firing_arcs || {}, location: null, turret: !!e.turret, retractable: false }, wrow);
          delete added.swapped_from;
          added.count = e.turret ? 1 : amt;
          if (typeof e.linked === 'number' && e.linked > 0) added.qualities_resolved.push({ key: 'LINKED', count: e.linked });
          added.added_by = source;
          out.weapons.push(added);
          out.because['weapon_' + (out.weapons.length - 1)] = [{ source: source, add: true }];
        }
        return;
      }
      // R-S7V-3: a SET replaces the number. Two SETs on one number: the later in install order wins and BOTH are credited
      // (iii, RAW silent, REPORTED); a hyperdrive SET onto a hull that already has that class lands and `from` names the
      // class it replaced (iv, RAW silent, REPORTED). A `chosen` defense SET waits for its zone, as defense_delta does.
      if (SETS[e.op]) {
        if (arm === 'defense') {
          var sz = ZONES.indexOf(e.target) !== -1 ? e.target : (choice && ZONES.indexOf(choice.zone) !== -1 ? choice.zone : null);
          if (!sz) { pend({ op: e.op, amount: amt, target: 'chosen', source: source }, choice); whySet('defense_chosen', source, amt, null); return; }
          var dfrom = out.defense[sz];
          out.defense[sz] = amt;
          whySet('defense_' + sz, e.target === 'chosen' ? choice.label : source, amt, dfrom);
          return;
        }
        if (arm === 'hyperdrive') {
          var hw = e.target === 'backup' ? 'backup' : 'primary', hfrom = out.hyperdrive[hw];
          out.hyperdrive[hw] = amt;
          whySet('hyperdrive_' + hw, source, amt, hfrom);
          return;
        }
        var from = out[arm];
        out[arm] = amt;
        whySet(arm, source, amt, from);
        return;
      }
      if (arm === 'defense') {
        if (e.target === 'chosen' || ZONES.indexOf(e.target) === -1) {
          // R-S4G-1: the owner's chosen zone lands; absent (or illegal) stays PENDING — never guessed.
          var z = choice && choice.zone;
          if (z && ZONES.indexOf(z) !== -1) {
            out.defense[z] = (out.defense[z] || 0) + amt;
            why('defense_' + z, choice.label, amt);
            return;
          }
          pend({ op: e.op, amount: amt, target: 'chosen', source: source }, choice);
          why('defense_chosen', source, amt);
          return;
        }
        if (out.defense[e.target] == null) out.defense[e.target] = 0;
        var dcur = out.defense[e.target], dnext = capped(dcur, amt, e);
        if (dnext === dcur && typeof e.ceiling === 'number') return;
        out.defense[e.target] = dnext;
        why('defense_' + e.target, source, dnext - dcur, null, e.ceiling);
        return;
      }
      if (arm === 'hyperdrive') {
        var which = e.target === 'backup' ? 'backup' : 'primary';
        var cur = out.hyperdrive[which];
        if (cur == null || cur <= 0) { out.warnings.push({ kind: 'no_hyperdrive', target: which, source: source }); return; }
        var next = cur + amt;
        if (typeof e.floor === 'number' && next < e.floor) next = e.floor;
        if (next === cur) return;
        out.hyperdrive[which] = next;
        why('hyperdrive_' + which, source, next - cur, e.floor);
        return;
      }
      if (arm === 'sensor_range') {
        var i = BANDS.indexOf(out.sensor_range);
        if (i === -1) { out.warnings.push({ kind: 'no_sensor_range', source: source }); return; }
        var j = Math.max(0, Math.min(BANDS.length - 1, i + amt));
        out.sensor_range = BANDS[j];
        why('sensor_range', source, j - i);
        return;
      }
      // R-S3CR-10: the book prints "Increases the damage of ONE weapon system by one" (Upgraded Firepower) —
      // which weapon is the owner's choice. R-S4G-1 saves it as a WeaponRef {i, key} per application: a
      // matching key moves that one weapon (`because.weapon_<i>`); a mismatched key is ORPHANED and moves
      // nothing (MountState's rule); no choice, a swap pending on that mount, or a damage the row does not
      // print as a number stays PENDING, named in `because.weapon_chosen` — never guessed.
      if (arm === 'weapons') {
        var ref = choice && choice.weapon;
        if (ref && typeof ref === 'object') {
          var wp = out.weapons[ref.i];
          if (!wp || wp.key !== ref.key) {
            out.orphaned.choices.push({ att: choice.att, mod: choice.mod, ref: { i: ref.i, key: ref.key } });
            return;
          }
          if (!unsettled[ref.i] && typeof wp.damage === 'number') {
            wp.damage += amt;
            why('weapon_' + ref.i, choice.label, amt);
            return;
          }
        }
        pend({ op: e.op, amount: amt, target: 'chosen', source: source }, choice);
        why('weapon_chosen', source, amt);
        return;
      }
      // R-M8C8-3 (Stay on Target p.33, Overstocked Ammo): +amount to `quality`'s rating on EVERY weapon that already carries it,
      // each credited on its own `because.weapon_quality_<i>`; a weapon without it is untouched, and so is a rating the row
      // does not print as a number (warned, never guessed).
      if (arm === 'qualities') {
        out.weapons.forEach(function (w, wi) {
          (w.qualities_resolved || []).forEach(function (q) {
            if (!qualityKeyIs(q.key, e.quality)) return;
            if (typeof q.count !== 'number') { out.warnings.push({ kind: 'no_quality_rating', i: wi, quality: e.quality, source: source }); return; }
            q.count += amt;
            (out.because['weapon_quality_' + wi] = out.because['weapon_quality_' + wi] || []).push({ source: source, amount: amt, quality: e.quality });
          });
        });
        return;
      }
      if (arm === 'hidden') { out.hidden += amt; why('hidden', source, amt); return; }
      if (out[arm] == null) out[arm] = 0;
      var cur0 = out[arm], next0 = capped(cur0, amt, e);
      if (next0 === cur0 && typeof e.ceiling === 'number') return;   // at or above its ceiling already: moves nothing, as a floored hyperdrive
      out[arm] = next0;
      why(arm, source, next0 - cur0, null, e.ceiling);
    }
    // R-S7V-3 (i) — the MECHANISM: the parts' and the holder's effects are queued in their install order, then every SET
    // applies before every delta (a stable two-pass, so the deltas keep their order among themselves).
    var queue = [];
    function later(e, source, choice) { queue.push([e, source, choice]); }
    function flush() {
      queue.filter(function (q) { return first(q[0].op); }).forEach(function (q) { apply(q[0], q[1], q[2]); });
      queue.filter(function (q) { return !first(q[0].op); }).forEach(function (q) { apply(q[0], q[1], q[2]); });
      queue = [];
    }
    // F-100 M8 · SHIP YARD (ruling f100-m8-c8-signature-vehicle R-M8C8-2): a part's dice change is a `pool_mods` entry in
    // C3's family (item-common $defs/pool_mod_entry). On a part it is only `upgrade · ability · one skill` — the part
    // schema refuses anything else — so this sums `count` per `applies_to[0].value`, as `{skill, kind, count}` summed before.
    function upgrade(p, source) {
      if (!p || p.die !== 'ability' || p.direction !== 'upgrade') return;
      var skill = p.applies_to && p.applies_to[0] && p.applies_to[0].scope === 'skill' ? p.applies_to[0].value : null;
      if (!skill) return;
      var pool = out.pools[skill] = out.pools[skill] || { upgradeAbility: 0, because: [] };
      pool.upgradeAbility += p.count;
      pool.because.push({ source: source, amount: p.count });
    }

    // ONE install, for a part (`ai` its index in attachments[]) and for a build piece (`ai` 'engine' | 'hull'): its base effects
    // and its mods' through the same queue, so every SET lands before every delta whatever holds it
    function install(a, ai) {
      var row = reg[a.key];
      if (!row) { out.orphaned.attachments.push(typeof ai === 'string' ? { index: null, piece: ai, key: a.key } : { index: ai, key: a.key }); return; }
      // R-S8B-6 (R-S8C-10): a conversion template saved as a PART (a legacy holder, e.g. v_iron) keeps resolving as S7 promised —
      // its lines were words then, so it moves no number now. Its numbers land only as the ship's `conversion`, a visible act.
      if (typeof ai === 'number' && row.kind === 'conversion') return;
      var name = row.name || a.key;
      var baseChoice = { zone: a.zone, weapon: a.weapon, att: ai, mod: null, label: name + ' (chosen)' };
      (row.base_effects || []).forEach(function (e) { later(e, name, baseChoice); });
      (row.pool_mods || []).forEach(function (p) { upgrade(p, name); });
      // AM-1: mods by the option's STABLE id; installs of one option = its ranks (R-S1C-4).
      var opts = {};
      (row.added_options || []).forEach(function (o) { opts[o.id] = o; });
      var count = {};
      (a.mods || []).forEach(function (m, mi) {
        var o = opts[m.option];
        if (!o) { out.orphaned.mods.push({ attachment: ai, mod: mi, option: m.option, key: a.key }); return; }
        count[o.id] = (count[o.id] || 0) + 1;
        var rankChoice = { zone: m.zone, weapon: m.weapon, att: ai, mod: mi, label: name + ' (mod, chosen)' };
        (o.effects || []).forEach(function (e) { later(e, name + ' (mod)', rankChoice); });
        (o.pool_mods || []).forEach(function (p) { upgrade(p, name + ' (mod)'); });
        // THE SURFACING MISSION (card f100-surfacing-yard-concept ADDENDUM 2 Q3 (a), R-SYC-5): an option that grants whoever uses
        // the system a talent is PROJECTED here, one entry per install in `mods` order — the talent's own anchors choose the
        // seat (sheetPool's one path folds it for the sitter); a projection, never saved
        if (o.talent_grant) out.seat_talents.push({ talentId: o.talent_grant, part: name, att: ai, mod: mi });
      });
      // Over the printed count WARNS, never blocks (EotE p.187): every install above still applied.
      Object.keys(count).forEach(function (id) {
        if (count[id] > opts[id].max) out.warnings.push({ kind: 'over_max', attachment: ai, key: a.key, option: id, installed: count[id], max: opts[id].max });
      });
    }
    // R-S8B-4 (R-S8C-9): the build's engine and hull resolve through ARMS as the records ordinary holders read, queued BEFORE
    // any ordinary part (so a part's own SET, installed later, is the later SET); one of each, by the record's shape
    if (!held) pieces.forEach(function (k) { install(bld[k], k); });
    // R-S8B-5 (R-S8C-10/-11, card ADDENDUM 2 Q3): the ship's ONE conversion, queued after the build and before any part — its
    // weapon_add rows in the SET pass with every SET, so a part's weapon delta reaches its guns. Its chosen defense (DC p.71: "the
    // GM decides which arc the increase applies to") is ONE `defense_delta {amount 1, target chosen}` applied once per pick
    // (`defense_picks`), pick i landing in `arcs[i]`: "+1 in two arcs" is two DIFFERENT arcs, so a zone already picked, an
    // illegal zone or a missing pick stays PENDING ({att: 'conversion', pick: i}), never guessed (b1).
    var conv = rec.conversion && typeof rec.conversion === 'object' && rec.conversion.key ? rec.conversion : null;
    if (!held && conv) (function () {
      var row = reg[conv.key];
      if (!row) { out.orphaned.attachments.push({ index: null, piece: 'conversion', key: conv.key }); return; }
      var name = row.name || conv.key, arcs = Array.isArray(conv.arcs) ? conv.arcs : [], used = {};
      var picks = typeof row.defense_picks === 'number' && row.defense_picks > 0 ? row.defense_picks : 1;
      (row.base_effects || []).forEach(function (e) {
        if (!(e.op === 'defense_delta' && e.target === 'chosen')) { later(e, name, { att: 'conversion', mod: null, label: name }); return; }
        for (var pi = 0; pi < picks; pi++) {
          var z = arcs[pi], ok = ZONES.indexOf(z) !== -1 && !used[z];
          if (ok) used[z] = true;
          later(e, name, { zone: ok ? z : null, att: 'conversion', mod: null, pick: pi, label: name + ' (chosen)' });
        }
      });
    })();
    (held ? [] : (rec.attachments || [])).forEach(install);

    // K2 · the bond's talents. Signature Vehicle upgrades "all Mechanics checks made to work on the
    // vehicle once" (Special Modifications p.35) — the HOLDER's checks, so the upgrade lives in `holder_pools`
    // under the holder's ref and never in `pools`, which every seat reads (R-S4G-7). The reminder stays: it is
    // the attribution line.
    // F-100 M8 · SHIP YARD (ruling f100-m8-c8-signature-vehicle R-M8C8-1): every other talent number on the ship is
    // the HOLDER's talent `vehicle_effects` rows (Custom Loadout's +2 hard points, Bolstered Armor's armor per rank),
    // applied through the parts' own `apply`, AFTER the parts, amount × ranks when `per_rank`, `because` naming the
    // talent — for the ONE holder only, never `second` or `too_large`. The rows come from the holder's own talentRecords,
    // else ctx.talentRecords (the talent registry, by id; B-1084). A holder whose rows are not in hand HOLDS (R-S4CC-6):
    // nothing they could move prints as known. The only talent ids read here are signature_vehicle and larger_project (the cited constants).
    var talentHold = false;
    var sig = signatureOf(rec, v, ctx);
    sig.too_large.forEach(function (s) { out.warnings.push({ kind: 'signature_too_large', character: s.character, silhouette: sil, limit: s.limit }); });
    if (sig.holder) {
      var h = sig.holder;
      out.reminders.push({ source: 'Signature Vehicle', character: h.character, skill: 'mechanics', upgrade: 'ability', count: 1,
        larger_project: h.larger_project });
      // the cited constant (R-S4G-7), written in C3's family (R-M8C8-2); M8 authors it neither as a vehicle row nor as a dice row
      out.holder_pools[charRef(h.character)] = { mechanics: [{ die: 'ability', count: 1, applies_to: [{ scope: 'skill', value: 'mechanics' }], condition: null, direction: 'upgrade' }] };
      var hc = ((ctx && ctx.characters) || []).filter(function (c) { return c && c.id === h.character; })[0];
      // B-1084 (R-S5R-23): the holder's OWN rows when they are an object (the same view as its ranks), else the ctx's
      var recs = (hc && hc.talentRecords && typeof hc.talentRecords === 'object') ? hc.talentRecords : (ctx && ctx.talentRecords);
      var ranks = (hc && hc.talents) || {};
      if (!recs || typeof recs !== 'object') talentHold = true;
      else Object.keys(ranks).sort().forEach(function (tid) {   // held: a part-movable number reads "—" whatever they add; a talent-only op still lands (R-M8C8-3)
        var tr = Object.prototype.hasOwnProperty.call(recs, tid) ? recs[tid] : null;
        var n = Math.max(1, num(ranks[tid]) || 1);
        ((tr && Array.isArray(tr.vehicle_effects)) ? tr.vehicle_effects : []).forEach(function (row) {
          if (held && TALENT_ONLY.indexOf(row.op) === -1) return;
          later(row.per_rank ? Object.assign({}, row, { amount: row.amount * n }) : row, tr.name || tid, null);
        });
      });
    }
    sig.second.forEach(function (s) { out.warnings.push({ kind: 'signature_second_holder', character: s.character, holder: sig.holder.character }); });
    flush();
    // R-S8V-4 · the frame's `fixed`: AFTER every SET and delta on that number, credited `{fixed, from}` beside the credits it
    // overrides (so a reason line can say both: "Ion Drive Array sets 4; the Space Station's speed stays 0", FO p.81). The book's
    // rule, not a conflict: no warning.
    var fx = v.fixed && typeof v.fixed === 'object' ? v.fixed : null;
    if (fx) Object.keys(fx).forEach(function (k) {
      if (!FIXABLE[k] || typeof fx[k] !== 'number') { out.warnings.push({ kind: 'unknown_fixed', key: k }); return; }
      var ffrom = out[k];
      out[k] = fx[k];
      (out.because[k] = out.because[k] || []).push({ source: v.name || 'frame', amount: null, fixed: fx[k], from: ffrom });
    });
    return (held || talentHold) ? heldOut(out, talentHold) : out;
  }

  // The seat's pool (R-S3K-4 "a seat's pool"): a role rolls one skill; an attachment's `pool_mods` upgrades for
  // that skill reach it. → { skill, upgradeAbility, because } — `upgradeAbility` is diceEngine.buildPool's.
  // R-S4G-8 (ruling `shipyard-s4-ground`): the SENSORS AND COMMS station rolls Computers, as the approved W4 draws —
  // Jamming, Slice Enemy's Systems and "Spoofing" Missiles are Computers checks (Table 7-7, EotE p.237; V-RAW-053). Scan
  // the Enemy is the station's one Perception check; the CREW face names it where it lists the station's actions.
  var ROLE_SKILL = { gunner: 'gunnery', engineer: 'mechanics', astrogator: 'astrogation', sensors: 'computers',
    commander: 'leadership' };
  function seatSkill(role, vehicle) {
    if (role === 'pilot' || role === 'copilot') return vehicle && vehicle.is_starship === false ? 'piloting_planetary' : 'piloting_space';
    return ROLE_SKILL[role] || null;
  }
  // ctx.character (a crew ref, 'char:<id>') names who rolls: the holder's own upgrades (`holder_pools`) join
  // the ship's by the same sum. skillPool is that one summing path; V4's MECHANICS line reads it too (R-S4G-7).
  function poolOf(r, skill, who) {
    var p = (skill && r.pools[skill]) || { upgradeAbility: 0, because: [] };
    // B-1015: a held ship's pool is the sitter's own (no part's upgrade is known), marked `held` so the seat prints "UPGRADE —"
    // (R-S4CC-7); a holder's own Signature Vehicle upgrade is a talent, not a part, and still joins.
    var out = { skill: skill, upgradeAbility: p.upgradeAbility, because: p.because.slice(), held: !!r.held };
    var own = who && r.holder_pools[who] && r.holder_pools[who][skill];
    (own || []).forEach(function (u) { out.upgradeAbility += u.count; out.because.push({ source: 'Signature Vehicle', amount: u.count }); });
    return out;
  }
  function skillPool(record, vehicle, ctx, skill) {
    return poolOf(resolve(record, vehicle, ctx), skill, ctx && ctx.character);
  }
  function seatPool(record, vehicle, ctx, role) {
    return skillPool(record, vehicle, ctx, seatSkill(role, vehicle));
  }

  // The K9-ON face's view of a ship: the registry row with the resolved numbers in the registry's own field
  // names, so a site that read `vehicle.hull_trauma` reads the same name. Only the four fields the four
  // wired sites read (#1 thresholds, #2 defense, #4 hard points, #5 the fit's hyperdrive and silhouette) —
  // the weapons (#3) stay the registry's until S4 (R-S3K-6 F-c).
  function asVehicle(record, vehicle, ctx) {
    if (!vehicle) return vehicle;
    var r = resolve(record, vehicle, ctx);
    return Object.assign({}, vehicle, {
      hull_trauma: r.hull_threshold, system_strain: r.strain_threshold,
      defense: Object.assign({}, vehicle.defense || {}, r.defense),
      hard_points_total: r.hard_points,
      hyperdrive_primary: r.hyperdrive.primary, hyperdrive_backup: r.hyperdrive.backup,
      silhouette: r.silhouette,
      _resolved: r,
    });
  }

  global.SWRPGVesselResolve = {
    OPS: OPS,
    ARMS: ARMS,
    HELD_KEYS: HELD_KEYS,
    qualityKeyIs: qualityKeyIs,   // R-M8C8-3: the one join of a weapon quality key to a vocabulary id (the guard pins it total)
    BANDS: BANDS,
    BAND_LABEL: BAND_LABEL,
    LARGER_PROJECT: LARGER_PROJECT,
    SIGNATURE_VEHICLE: SIGNATURE_VEHICLE,
    signatureLimit: signatureLimit,
    markRefusal: markRefusal,
    signatureOf: signatureOf,   // U19's third refusal (legacy data, two holders) reads the one holder rule
    resolve: resolve,
    spareWeapon: spareWeapon,
    UPGRADED_WEAPONS: UPGRADED_WEAPONS,
    asVehicle: asVehicle,
    seatSkill: seatSkill,
    seatPool: seatPool,
    skillPool: skillPool,
    resolveBond: resolveBond,
    markMyShip: markMyShip,
  };
})(typeof window !== 'undefined' ? window : this);
