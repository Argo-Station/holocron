/**
 * effectClass.js — window.SWRPGEffectClass: THE chip classification (F-100 editor; ruling
 * f100-editor-contracts-2 R-EC2-5, brief C4; census row #10). One pure rule over a record's DATA — never
 * an id list — so a user's own talent is classified exactly as a book talent is.
 *
 *   an effects[] entry                                              → 'resolves'
 *   …unless it carries applies: "reminder" (F-100 M7 skill swaps)  → 'reminds' (offered, never applied: R-M7K-4;
 *                                                                     ruling f100-m7-build R-M7G-2)
 *   a pool_mods[] entry: applies_to set, direction set, no condition → 'resolves'
 *   a pool_mods[] entry: applies_to set, condition set               → 'reminds'
 *   any other pool_mods[] entry (unanchored, or direction null)      → 'prints'
 *
 * A RECORD's classes are the set of its lines' 'resolves' / 'reminds', in that order; a record with
 * neither is ['prints'] (its prose is text the table adjudicates) — unless it is a species ability carrying a non-empty
 * `carried` (R-SPF-5): then ['resolves'], the record field doing the work. That is the approved fixture's own
 * reading (scripts/f100_editor_fixture.py chips_of): NARRATIVE only when nothing else applies.
 *
 * ITEMS (weapons · armor · gear; ruling f100-items-editor-contracts R-FIEC-1, as amended by f100-items-frames
 * ADDENDUM 1 R-FIFG-A1-1). linesOf(rec, section) / classesOf(rec, section) take the section; for an item:
 *   a pool_mods[] entry                                   → classOfPoolMod, unchanged
 *   a base_mods[] line that dice are read from (from.index) → no line of its own: its dice carry the class
 *   a base_mods[] line with no dice                        → 'prints' (no core consumes an item `effect`)
 *   a weapon effects[] entry                               → 'prints' (crit_delta/damage_delta/range_delta: no reader)
 * An item's record classes are over those RULE lines only; an item with none has NO class ([] — the shelf's
 * "—"). Scalars are chipped per FIELD by fieldClassOf(section, field): a table over field NAMES whose every
 * AUTOMATIC ('resolves') row carries its READER — the shipped symbol its value reaches a number or a die
 * through (the evidence rule). A weapon's `qualities` is per VALUE: AUTOMATIC iff it holds a quality id the
 * engine reads (Defensive, Deflection → defense; ruling f100-items-qualities-class R-FIQC-1).
 * test/effect_class_items.cjs holds the table to the code both ways, no exceptions.
 *
 * (M12's key, R-M12B-85, once made its talent item_effects[] shapes DARK — 'prints' with the key OFF, by the table
 * DARK_LINES. post1-switch-deletion, ADDENDUM 638, deleted the key; every line classes by its own rule.)
 *
 * Internal values only. The UI words (AUTOMATIC · SITUATIONAL · NARRATIVE, R-FJA-A1-1) live in the UI.
 * NEVER persisted: computed at render (resolve-at-render). Dual-export, sources.js idiom.
 */
(function (root) {
  'use strict';

  var CLASSES = ['resolves', 'reminds', 'prints'];

  function set(v) { return v !== null && v !== undefined; }

  function classOfPoolMod(entry) {
    if (!entry || typeof entry !== 'object') return 'prints';
    var anchored = set(entry.applies_to);
    if (anchored && (set(entry.condition) || set(entry.cost) || set(entry.limit))) return 'reminds';   // M8 C4: a price or a limit is the player's call
    if (anchored && set(entry.unless)) return 'reminds';   // R-SPF-1: a sibling's words negate it at the table — OFFERED, as a condition is
    if (anchored && set(entry.direction)) return 'resolves';
    return 'prints';
  }
  function classOfEffect(entry) { return entry && entry.applies === 'reminder' ? 'reminds' : 'resolves'; }
  // F-100 M8 C11 (R-M8K-16): any condition, cost or limit makes a roll number OFFERED; range_band is machine-checked
  // (R-M8K-26), never a fate input. C5's told rows are TOLD by definition; C7's item rows and C8's vehicle rows are
  // projected by their resolvers, so they resolve.
  function classOfRollNumber(entry) {
    if (!entry || typeof entry !== 'object') return 'prints';
    return (set(entry.condition) || set(entry.cost) || set(entry.limit) || set(entry.unless)) ? 'reminds' : 'resolves';   // R-SPF-1: unless offers
  }
  function classOfTold() { return 'prints'; }
  // F-100 THE SURFACING MISSION (card f100-surfacing-roll-options-card R-SRO-3/4; brief §3, ruled ADDENDUM 8): a talent's
  // SPEND row is bought from the roll's results and a TARGET row is the player's tick before it (its `condition` is
  // required) — both the player's call at the roll, so OFFERED; a reroll pool_mods row reminds by classOfPoolMod (a limit).
  function classOfSpend() { return 'reminds'; }
  function classOfTarget() { return 'reminds'; }
  function classOfItemEffect() { return 'resolves'; }   // C7 (R-M8G-16): projected onto the item, computed

  function classOfVehicleEffect() { return 'resolves'; }

  var ITEM_SECTIONS = { weapons: true, armor: true, gear: true };
  function isItem(section) { return ITEM_SECTIONS[section] === true; }
  function arr(v) { return Array.isArray(v) ? v : []; }

  // linesOf(record[, section]) → [{ field: 'effects'|'pool_mods'|'base_mods', index, cls, from? }] in record
  // order. No section (or a non-item one): the talent rule, unchanged.
  function linesOf(rec, section) {
    var out = [];
    if (!rec || typeof rec !== 'object') return out;
    if (!isItem(section)) {
      arr(rec.effects).forEach(function (e, i) { out.push({ field: 'effects', index: i, cls: classOfEffect(e) }); });
      arr(rec.pool_mods).forEach(function (p, i) { out.push({ field: 'pool_mods', index: i, cls: classOfPoolMod(p) }); });
      arr(rec.roll_numbers).forEach(function (r, i) { out.push({ field: 'roll_numbers', index: i, cls: classOfRollNumber(r) }); });
      arr(rec.item_effects).forEach(function (r, i) { out.push({ field: 'item_effects', index: i, cls: classOfItemEffect(r) }); });
      arr(rec.vehicle_effects).forEach(function (r, i) { out.push({ field: 'vehicle_effects', index: i, cls: classOfVehicleEffect(r) }); });
      arr(rec.spend).forEach(function (r, i) { out.push({ field: 'spend', index: i, cls: classOfSpend(r) }); });
      arr(rec.target).forEach(function (r, i) { out.push({ field: 'target', index: i, cls: classOfTarget(r) }); });
      arr(rec.told).forEach(function (r, i) { out.push({ field: 'told', index: i, cls: classOfTold(r) }); });
      return out;
    }
    var read = {};
    arr(rec.pool_mods).forEach(function (p, i) {
      var l = { field: 'pool_mods', index: i, cls: classOfPoolMod(p) };
      if (p && p.from && p.from.channel === 'base_mods' && typeof p.from.index === 'number') { l.from = p.from.index; read[p.from.index] = true; }
      out.push(l);
    });
    arr(rec.base_mods).forEach(function (b, i) { if (!read[i]) out.push({ field: 'base_mods', index: i, cls: 'prints' }); });
    arr(rec.effects).forEach(function (e, i) { out.push({ field: 'effects', index: i, cls: 'prints' }); });
    return out;
  }

  // classesOf(record[, section]). A talent with no line prints (the approved talent reading); an item with
  // no rule line has no class at all ([]), which the shelf draws as "—" and its rail counts as "No rules".
  // A SPECIES ABILITY applied through a record field (`carried`, ruling f100-surfacing-preflip-species-card R-SPF-5 as
  // amended by R-SPF-11: Scavengers through starting_talents) resolves when no line of its own does: a TOLD line beside it
  // is words shown, never computed, so it does not make the ability NARRATIVE; with a working line, as before.
  function classesOf(rec, section) {
    var lines = linesOf(rec, section), seen = {};
    lines.forEach(function (l) { seen[l.cls] = true; });
    var out = ['resolves', 'reminds'].filter(function (c) { return seen[c]; });
    if (out.length) return out;
    if (!isItem(section) && rec && Array.isArray(rec.carried) && rec.carried.length) return ['resolves'];
    return (isItem(section) && !lines.length) ? [] : ['prints'];
  }

  // ── the scalar fields of an item (R-FIEC-1) ──────────────────────────────────────────────────────────
  // READERS: where each AUTOMATIC field's value reaches a number or a die the user sees in play. `read` is
  // the literal access inside `symbol`'s body; `kind` 'computes' (the value feeds arithmetic or a choice)
  // or 'shows' (a number carried to the sheet unchanged — `damage`, R-FIEC-1 Q2). Symbols, never lines:
  // the guard finds each one, its read, and a call site outside its definition (a dead reader is no reader).
  var R = {
    pool:   { file: 'lib/shared/sheetPool.js', symbol: 'weaponPoolOf', kind: 'computes' },   // the one weapon pool builder (R-SSC-4; was app.jsx's computeWeaponPool, now its caller)
    enc:    { file: 'lib/shared/charResolve.js', symbol: 'computeEncumbrance', kind: 'computes' },
    derive: { file: 'lib/shared/charResolve.js', symbol: 'computeDerived', kind: 'computes' },
    hp:     { file: 'lib/shared/itemResolve.js', symbol: 'pcHardpointAccounting', kind: 'computes' },
    price:  { file: 'lib/store/view.jsx', symbol: 'counterLineOf', kind: 'computes' },
    findRow: { file: 'lib/store/view.jsx', symbol: 'PaperFindRow', kind: 'computes' },
    shown:  { file: 'lib/items.js', symbol: 'canonicalToStore', kind: 'shows' },
  };
  // `via`: where the field enters a reader that takes it as a parameter — the call site's literal text.
  function rd(r, read, via) { var o = { file: r.file, symbol: r.symbol, kind: r.kind, read: read }; if (via) o.via = via; return o; }
  var SHARED_AUTO = {
    hardpoints: [rd(R.hp, 'itemHardpoints', { file: 'player/app.jsx', read: 'pcHardpointAccounting(item.hp' })],   // the capacity
    price: [rd(R.price, 'rec.price')],                                     // the buy's credits
    rarity: [rd(R.findRow, 'it.rarity')],                                   // the find check's difficulty
    restricted: [rd(R.findRow, 'it.restricted')],   // the find check's SKILL (J1 (b); R-FIQC-3)
  };
  var FIELD_READERS = {
    weapons: { skill: [rd(R.pool, 'opts.skillKey', { file: 'lib/shared/diceHub.jsx', read: "skillKey: resolveWeaponSkillKey(weapon.skillKey || weapon.skill || '')" })], range: [rd(R.pool, 'weapon.range')], crit: [rd(R.pool, 'weapon.crit')],
      damage: [rd(R.shown, 'rec.damage')], encumbrance: [rd(R.enc, 'w.encumbrance')] },
    armor: { soak: [rd(R.derive, 'resolvedEquipment.armor.soak')], defense: [rd(R.derive, 'resolvedEquipment.armor.defense')],
      encumbrance: [rd(R.enc, 'armor.encumbrance')], encumbrance_threshold_bonus: [rd(R.enc, 'armor.encumbrance_threshold_bonus')] },
    gear: { encumbrance: [rd(R.enc, 'g.encumbrance')], encumbrance_threshold_bonus: [rd(R.enc, 'g.encumbrance_threshold_bonus')] },
  };
  Object.keys(FIELD_READERS).forEach(function (s) { Object.keys(SHARED_AUTO).forEach(function (f) { FIELD_READERS[s][f] = SHARED_AUTO[f]; }); });
  // A weapon's `qualities` is classified PER VALUE (ruling f100-items-qualities-class R-FIQC-1): the engine
  // reads two quality ids, and only those reach a number. The consumed set is what the engine reads — not
  // a list of records — and each id carries its reader, like a field's.
  var PER_VALUE = 'per-value';
  var QUALITY_READERS = {
    defensive: [rd(R.derive, "=== 'defensive'")],                          // + rank → melee defense
    deflection: [rd(R.derive, "=== 'deflection'")],                        // + rank → ranged defense
  };
  var PER_VALUE_FIELDS = { weapons: ['qualities'], armor: [], gear: [] };
  function qualityClassOf(id) { return Object.prototype.hasOwnProperty.call(QUALITY_READERS, id) ? 'resolves' : 'prints'; }
  function qualityReadersOf(id) { return Object.prototype.hasOwnProperty.call(QUALITY_READERS, id) ? QUALITY_READERS[id].slice() : []; }
  function qualityId(q) { return (q && typeof q === 'object') ? q.id : q; }
  // NARRATIVE scalars: text for the table.
  var FIELD_NARRATIVE = {
    weapons: ['name', 'type', 'description'],
    armor: ['name', 'type', 'description'],
    gear: ['name', 'type', 'description', 'short'],
  };
  // fieldClassOf(section, field[, value]) → 'resolves' | 'prints' | null (null: not a chipped scalar — a
  // rule-line field, or one the form keeps as it is: categories, sources, store_hidden, id, `_` keys).
  // A per-value field (`qualities`) answers from `value`: 'resolves' iff it holds a consumed quality id,
  // else 'prints'; with no value it answers PER_VALUE.
  function fieldClassOf(section, field, value) {
    if (!isItem(section)) return null;
    if (Object.prototype.hasOwnProperty.call(FIELD_READERS[section], field)) return 'resolves';
    if (PER_VALUE_FIELDS[section].indexOf(field) !== -1) {
      if (value === undefined) return PER_VALUE;
      return arr(value).some(function (q) { return qualityClassOf(qualityId(q)) === 'resolves'; }) ? 'resolves' : 'prints';
    }
    if (FIELD_NARRATIVE[section].indexOf(field) !== -1) return 'prints';
    return null;
  }
  function readersOf(section, field) {
    return (isItem(section) && Object.prototype.hasOwnProperty.call(FIELD_READERS[section], field)) ? FIELD_READERS[section][field].slice() : [];
  }
  function fieldsOf(section) {
    if (!isItem(section)) return [];
    return Object.keys(FIELD_READERS[section]).concat(PER_VALUE_FIELDS[section], FIELD_NARRATIVE[section]);
  }

  // ── R-M12B-136: the editor's FORM FIELDS on an M12 key arm ───────────────────────────────────────────────────────────
  // R-M12B-85 (ii) governs every editor chip and claim on an arm of the key, so these chips come from HERE, never a form.
  // The evidence rule of fieldClassOf: a field is 'resolves' only through a READER — a shipped symbol with a call site
  // outside its definition (`via`) that brings the value to a number or a die; a field with no live reader 'prints'.
  // test/f100_m12_key_chips.cjs holds this table to the code both ways. (The readers' `key` member — the literal key test
  // inside each — went with M12's key, post1-switch-deletion ADDENDUM 638.)
  var CR_FILE = 'lib/shared/charResolve.js';
  function kr(symbol, read, via) { return { file: CR_FILE, symbol: symbol, kind: 'computes', read: read, via: via }; }
  var KEY_FIELDS = {
    careers: {
      // the Attributes rows: soak / defence / thresholds, bare (careerEffectBonuses) and under a `when` (computeDerived)
      effects: [kr('careerEffectsOf', 'rec.effects', { file: CR_FILE, read: 'careerEffectsOf(sheet, charbuild).forEach' })],
      // Extra starting XP: the ONE creation pool, creationXpPool (R-SCC-4 / B-1264), read by normalizeCreated and the
      // creator's xpPool memo — the live call site is inside it (creator concept ADDENDUM 21 (i))
      xp_adjustment: [kr('careerXpAdjustment', 'careerRec.xp_adjustment', { file: CR_FILE, read: 'careerXpAdjustment(_creationCareerRec(' })],
    },
    signature_abilities: {
      // a box's XP: CHARGED since D-229 Q1 (a) — the ONE cost walk (sigAbilitiesXp) summed by sigAbilitiesSpend into
      // normalizeCreated's xp.spent (creator concept ADDENDUM 18 C1 (a); re-classed at ADDENDUM 21 (ii))
      'tree.cost': [kr('sigAbilitiesSpend', 'return t + x.xp;', { file: CR_FILE, read: 'sigAbilitiesSpend(character, gameData' })],
      // Attaches under: V3 of sigAbilityChecks; an ability that fails it brings no row (sigAbilityRowSources)
      'attach.columns': [kr('sigAbilityRowSources', 'sigAbilityChecks(sheet, charbuild)', { file: CR_FILE, read: 'sigAbilityRowSources(' })],
    },
  };
  // keyFieldClassOf(section, field) → 'resolves' | 'prints', or null when the field is not in KEY_FIELDS.
  function keyFieldClassOf(section, field) {
    var sec = Object.prototype.hasOwnProperty.call(KEY_FIELDS, section) ? KEY_FIELDS[section] : null;
    if (!sec || !Object.prototype.hasOwnProperty.call(sec, field)) return null;
    return sec[field].length ? 'resolves' : 'prints';
  }

  var api = { CLASSES: CLASSES, ITEM_SECTIONS: Object.keys(ITEM_SECTIONS), classOfPoolMod: classOfPoolMod, classOfEffect: classOfEffect,
    classOfRollNumber: classOfRollNumber, classOfTold: classOfTold, classOfItemEffect: classOfItemEffect, classOfVehicleEffect: classOfVehicleEffect,
    classOfSpend: classOfSpend, classOfTarget: classOfTarget,
    linesOf: linesOf, classesOf: classesOf, fieldClassOf: fieldClassOf, readersOf: readersOf, fieldsOf: fieldsOf,
    PER_VALUE: PER_VALUE, qualityClassOf: qualityClassOf, qualityReadersOf: qualityReadersOf,
    CONSUMED_QUALITIES: Object.keys(QUALITY_READERS),
    KEY_FIELDS: KEY_FIELDS, keyFieldClassOf: keyFieldClassOf };
  if (typeof root !== 'undefined' && root) root.SWRPGEffectClass = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
