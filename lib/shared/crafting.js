/**
 * crafting.js — the SINGLE application point for crafting spend rows (F-56), now a DATA applier.
 *
 * Ruled shape (`release-r5-crafting-contract` R-R5CC-1, ADDENDUM 2 and 3): every row in crafting_spend.json carries
 * EXACTLY ONE of
 *   effects[] — drawn only from the SHARED item grammar: the attachment option ops ItemResolve already applies
 *               (OPTION_APPLIED: quality_add, damage_delta, crit_delta, encumbrance_delta (+ its floor), range_delta,
 *               defense_delta, soak_delta, and hands_set, hard_points_delta, quality_grant), qualities_reduce, `pool_mod`
 *               ({entry: $defs/pool_mod_entry}) and `item_character_effect` ({op, key, value});
 *   told{reason} — a row the grammar cannot express, shown as its text with its cite and remembered (craft_notes).
 * The closed code map this file used to hold (CRAFT_EFFECTS, `crafting-v1-spend` §4) RETIRED into that data; its 29 melee
 * rows were migrated under test/release_r5_craft_equivalence.cjs, which proves the same `_inline` profile row by row.
 *
 * THIS FILE OWNS NO ARITHMETIC (one shared core). A row's effects become ONE inline attachment — its options are the
 * effects, every one selected; its qualities_reduce rows are the attachment's base `qualities_reduce` (LIVE there) — and
 * ItemResolve.applyInstalledAttachments writes the profile, the same writer an installed attachment goes through. Only two
 * lists are carried here, never computed: `pool_mod` entries ride the record's own `pool_mods` and `item_character_effect`
 * entries its `_characterEffects`, read at use by collectPoolMods / itemCharacterEffects behind M12's key, as an
 * attachment's are (R-R5CC-1; card §3). Bookkeeping the writer adds (`_qualitiesReduced`, …) is not kept on the record.
 *
 * LOUD vs GRACEFUL (C-J3): an unknown row id THROWS during a live spend — ids come from the registry, so a miss is a
 * code/data divergence. A told row is RETURNED in `unapplied`, never silently skipped (inform-and-record).
 *
 * LEGALITY IS THE CALLER'S (R-CA-1): this module does not enforce once_only, affordability, or the spend order.
 *
 * WHERE THE ROWS COME FROM: a caller passes them (craftStore.buildItem passes its index). The Workshop's preview calls with
 * two arguments, so the rows default to the category craftStore.indexSpend last indexed (useSpendRows); in node, to
 * brawl_melee from the registry file. Quality names come from the qualities vocabulary (window._qualitiesDb; in node,
 * qualities.vocab.json), the same labels the attachment path names a granted quality with.
 *
 * THE CRAFTER'S CHOICE (`release-r5-crafting-contract` ADDENDUM 4): a template's own `effects` may hold a SLOT,
 * `{ "choice": "skill" }` or `{ "choice": "characteristic" }`, where an id goes (a pool_mod's applies_to value, an
 * item_character_effect's key). applyTemplateEffects resolves every slot from the project's choice and applies the lines
 * as ONE inline attachment named for the template, through the same writer as a row; a slot it cannot resolve THROWS,
 * and a slot is never written onto a record (test/release_r5_crafting_choice.cjs). Spend rows hold no slot.
 *
 * A LIGHTSABER HILT'S DAMAGE (ruling `release-r5-crafting-ev-hilt-damage` Q1 (a), fenced): a hilt is crafted at damage 0 and
 * its damage is SET by the crystal installed later (ruling `release-r5-crafting-ev-c0`), so a row's `damage_delta` baked into
 * `damage` would be overwritten by that set. On a profile that CARRIES `crystal_damage_mod` (every Endless Vigil hilt: 0, or
 * −1 on Precision and Defensive), a row's `damage_delta` is added to `crystal_damage_mod` instead, the host modifier
 * ItemResolve adds after a crystal's set, and `damage` is left as it is (Two-Handed: hilt 0; + Ilum 7). Every profile
 * WITHOUT `crystal_damage_mod` (melee, ranged, every other host) bakes `damage_delta` into `damage` as before. `crit_delta`
 * is NOT routed (no hilt row carries one; a later one is a brief).
 *
 * A FORTIFICATION (ruling `release-r5-crafting-fib-c0` Q2 (a)): its rows are of two families. A row's `effects` (Additional
 * Cover, Inferior Protection: defense_delta, subtype ranged) are the occupant's ranged defence, an ARMOUR quantity, so the
 * fortification arm (`kind: 'fortification'`) hands them to the same applyInstalledAttachments as `kind: 'armor'` and keeps
 * ONLY `defense_ranged` from what it writes (the writer's `defense_melee` and bookkeeping are not the fortification's). A
 * row's `vehicle_effects` (Expanded Capacity, Reinforced Armor) are vehicle numbers: this file never applies them; it
 * returns their ids in `vehicle` for craftStore.fortificationOf, which hands them to SWRPGVesselResolve.resolve, the ONE
 * applier of that grammar. Which ops reach a core at all ("if applicable") is the resolver's rule, not this file's.
 *
 * Cites are PRINTED numbering (Special Modifications p.77). Pure + dual-export (window.SWRPGCrafting / CommonJS).
 */
(function (root) {
  'use strict';

  var NODE = typeof module !== 'undefined' && module.exports;
  var IR = NODE ? require('./itemResolve.js') : (root && root.ItemResolve);

  // ── the rows: {id: row}, from a caller, or the category last indexed ────────────────────────────────────────────────
  var _defaultRows = null;
  function rowsOfCategory(spendReg, category) {
    var out = {};
    var block = (spendReg && spendReg.spend && spendReg.spend[category || 'brawl_melee']) || {};
    (block.improvements || []).concat(block.flaws || []).forEach(function (r) { if (r && r.id) out[r.id] = r; });
    return out;
  }
  function useSpendRows(spendReg, category) { _defaultRows = rowsOfCategory(spendReg, category); return _defaultRows; }
  function defaultRows() {
    if (_defaultRows) return _defaultRows;
    if (NODE) return useSpendRows(require('../../public/data/canonical/crafting_spend.json'), 'brawl_melee');
    return {};
  }
  // accepts {id: row} or craftStore's index {id: {row, side}}
  function rowOf(rows, id) {
    var e = rows && Object.prototype.hasOwnProperty.call(rows, id) ? rows[id] : null;
    return e && e.row ? e.row : e;
  }

  var _labels = null;
  function qualityLabels() {
    if (NODE) {
      if (!_labels) {
        _labels = {};
        (require('../../public/data/canonical/qualities.vocab.json').entries || []).forEach(function (q) { if (q && q.id) _labels[q.id] = q.label; });
      }
      return _labels;
    }
    return IR.qualityLabelsOf(root && root._qualitiesDb);
  }

  function copyProfile(p) {
    var out = {}, k;
    for (k in p) { if (Object.prototype.hasOwnProperty.call(p, k)) out[k] = p[k]; }
    if (p && p.damage) out.damage = { value: p.damage.value, base: p.damage.base };
    if (p && Array.isArray(p.qualities)) out.qualities = p.qualities.map(function (q) { return q; });
    return out;
  }

  // ruling release-r5-crafting-ev-hilt-damage: a hilt (a profile carrying crystal_damage_mod) takes damage there
  function isHilt(profile) {
    return !!profile && typeof profile.crystal_damage_mod === 'number';
  }

  // ONE row's effects through the shared writer
  function applyRow(kind, profile, row) {
    var opts = [], reduce = [], pool = [], charFx = [], hiltDamage = 0;
    var hilt = kind === 'weapon' && isHilt(profile);
    row.effects.forEach(function (fx) {
      if (!fx || !fx.type) return;
      if (hilt && fx.type === 'damage_delta' && isFinite(Number(fx.value))) hiltDamage += Number(fx.value);
      else if (fx.type === 'qualities_reduce') reduce.push({ key: fx.key, by: fx.value, floor: fx.floor });
      else if (fx.type === 'pool_mod') pool.push(fx.entry);
      else if (fx.type === 'item_character_effect') charFx.push({ op: fx.op, key: fx.key, value: fx.value, source: row.name });
      else opts.push({ effect: fx });
    });
    var out = profile;
    if (opts.length || reduce.length) {
      var att = { name: row.name, added_mods: opts, mods: opts.map(function (o, i) { return 'mod_' + i; }) };
      if (reduce.length) att.qualities_reduce = reduce;
      var res = IR.applyInstalledAttachments(kind, profile, [att], {}, { qualityLabels: qualityLabels() });
      out = {};
      Object.keys(res).forEach(function (k) {
        if (k.charAt(0) === '_' && !Object.prototype.hasOwnProperty.call(profile, k)) return;   // the writer's bookkeeping
        out[k] = res[k];
      });
    } else {
      out = copyProfile(profile);
    }
    if (hiltDamage) out.crystal_damage_mod += hiltDamage;   // out is always a fresh copy here
    if (pool.length) out.pool_mods = (Array.isArray(out.pool_mods) ? out.pool_mods : []).concat(pool);
    if (charFx.length) out._characterEffects = (Array.isArray(out._characterEffects) ? out._characterEffects : []).concat(charFx);
    return out;
  }

  // ── the crafter's choice: {choice: 'skill' | 'characteristic'} slots, resolved from {skill} | {characteristic} ──────
  function isSlot(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v) && typeof v.choice === 'string' && Object.keys(v).length === 1;
  }
  function hasChoiceSlot(v) {
    if (isSlot(v)) return true;
    if (Array.isArray(v)) return v.some(hasChoiceSlot);
    if (v && typeof v === 'object') return Object.keys(v).some(function (k) { return hasChoiceSlot(v[k]); });
    return false;
  }
  // A NEW copy with every slot replaced by the chosen id; THROWS on a slot the choice does not fill (C-J3: a live build).
  function resolveChoiceSlots(v, chosen) {
    if (isSlot(v)) {
      var id = chosen && Object.prototype.hasOwnProperty.call(chosen, v.choice) ? chosen[v.choice] : null;
      if (typeof id !== 'string' || !id) throw new Error('[crafting] unresolved choice slot: ' + v.choice);
      return id;
    }
    if (Array.isArray(v)) return v.map(function (x) { return resolveChoiceSlots(x, chosen); });
    if (v && typeof v === 'object') {
      var o = {};
      Object.keys(v).forEach(function (k) { o[k] = resolveChoiceSlots(v[k], chosen); });
      return o;
    }
    return v;
  }
  /**
   * A template's own effects on its result_profile, slots resolved from `chosen` ({skill} | {characteristic}).
   *   opts — { kind: 'weapon' | 'gear' }; absent = 'weapon'
   * Returns a NEW profile; a template with no effects returns a copy of the profile.
   */
  function applyTemplateEffects(profile, template, chosen, opts) {
    var fx = template && Array.isArray(template.effects) ? template.effects : [];
    var out = copyProfile(profile || {});
    if (!fx.length) return out;
    return applyRow((opts && opts.kind) || 'weapon', out, { name: template.name, effects: resolveChoiceSlots(fx, chosen) });
  }

  /**
   * Apply chosen spend-row ids to a template's result_profile.
   *   profile — the crafted item's canonical profile (a result_profile, or an in-progress copy)
   *   rowIds  — chosen improvement/flaw ids, applied IN ORDER (spends are sequential)
   *   rows    — {id: row} or craftStore's index; absent = the category last indexed (see the header)
   *   opts    — { kind: 'weapon' | 'gear' | 'armor' | 'fortification' } — the writer's kind; absent = 'weapon'
   * Returns { profile, unapplied: [{id, reason}], vehicle?: [id] } — never throws for a told row, ALWAYS throws for an unknown
   * one. `vehicle`: a fortification's vehicle_effects rows, in order, left for craftStore.fortificationOf (see the header);
   * a vehicle_effects row on any other kind THROWS (only a fortification carries one, ruling release-r5-crafting-fib-c0 Q2).
   */
  function applyCraftingSpend(profile, rowIds, rows, opts) {
    var table = rows || defaultRows();
    var kind = (opts && opts.kind) || 'weapon';
    var out = copyProfile(profile || {});
    var skipped = [], vehicle = [];
    (Array.isArray(rowIds) ? rowIds : []).forEach(function (id) {
      var row = rowOf(table, id);
      if (!row) throw new Error('[crafting] unknown spend row id: ' + id);
      if (Array.isArray(row.vehicle_effects)) {
        if (kind !== 'fortification') throw new Error('[crafting] ' + id + ' moves a vehicle number; only a fortification has one');
        vehicle.push(id);
        return;
      }
      if (Array.isArray(row.effects)) { out = kind === 'fortification' ? fortificationRow(out, row) : applyRow(kind, out, row); return; }
      skipped.push({ id: id, reason: (row.told && row.told.reason) || '' });
    });
    var res = { profile: out, unapplied: skipped };
    if (vehicle.length) res.vehicle = vehicle;   // only a fortification's: every other call keeps its bytes (f100_m12_crafting_bytes)
    return res;
  }

  // THE FORTIFICATION ARM (ruling release-r5-crafting-fib-c0 Q2 (a)): the row through the armour writer, keeping ONLY the
  // occupant's ranged defence it moved; every other key of the fortification stays as it was.
  function fortificationRow(profile, row) {
    var res = applyRow('armor', { defense_ranged: profile.defense_ranged }, row);
    var out = copyProfile(profile);
    if (typeof res.defense_ranged === 'number') out.defense_ranged = res.defense_ranged;
    return out;
  }

  /** Ids that apply (effects, or a fortification's vehicle_effects) / are told — the gate enumerates both. Over `rows`, or
   *  the default category. */
  function applies(r) { return !!r && (Array.isArray(r.effects) || Array.isArray(r.vehicle_effects)); }
  function appliedRowIds(rows) {
    var t = rows || defaultRows();
    return Object.keys(t).filter(function (k) { return applies(rowOf(t, k)); });
  }
  function unappliedRowIds(rows) {
    var t = rows || defaultRows();
    return Object.keys(t).filter(function (k) { return !applies(rowOf(t, k)); });
  }
  /** The category's schematic row id (flags.schematic, ADDENDUM 3), or null. */
  function schematicRowId(rows) {
    var t = rows || defaultRows();
    var ids = Object.keys(t).filter(function (k) { var r = rowOf(t, k); return !!(r && r.flags && r.flags.schematic); });
    return ids.length ? ids[0] : null;
  }

  var api = {
    applyCraftingSpend: applyCraftingSpend,
    applyTemplateEffects: applyTemplateEffects,
    resolveChoiceSlots: resolveChoiceSlots,
    hasChoiceSlot: hasChoiceSlot,
    appliedRowIds: appliedRowIds,
    unappliedRowIds: unappliedRowIds,
    schematicRowId: schematicRowId,
    useSpendRows: useSpendRows,
    rowsOfCategory: rowsOfCategory,
  };
  if (NODE) module.exports = api;
  if (typeof root !== 'undefined') root.SWRPGCrafting = api;
})(typeof window !== 'undefined' ? window : this);
