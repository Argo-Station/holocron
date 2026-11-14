/**
 * poolMods.js — the ONE assembler that turns certified item effects into dice (R-PCA-2).
 *
 * Pure logic, no DOM, no React. Sits beside `ffgDicePool` (lib/shared/ui.jsx) and COMPOSES it
 * rather than replacing it: ffgDicePool still owns the ability/proficiency split, `buildPool`
 * (diceEngine.js) still owns pool construction, and this module only says which extra dice a
 * character's carried items contribute to a given check. `ffgDicePool` is untouched, so its GM and
 * NPC-library consumers do not move.
 *
 * Exports on window.SWRPGPoolMods:
 *   indexSkills(vocabEntries)      — sheetKey/id -> {id, group, characteristic}
 *   contextFor(skillKeyOrId, index, characteristic?, roll?, powerId?, sigAbility?) — the check context an anchor is matched against (no skill + a roll → roll-only)
 *   matches(mod, ctx)              — OR semantics across the anchor list (R-PCH-1)
 *   collect(equipment, owned)      — every carried item's pool_mods, and every owned talent's (F-100), with
 *                                    source names
 *   augment(spec, mods, ctx)       — fold AUTO-APPLYING mods into a buildPool spec
 *   reminders(mods, ctx)           — the display half: relevant but not applied, with a reason
 *
 * TWO RULES DECIDE EVERYTHING, and both are data, not opinion:
 *
 *   CERTIFIED  = `direction` is non-null. The entry was walked back to its authored sentence and
 *                settled (R-PCA-1/R-PCH-2). A null direction means NOT-CERTIFIED — the text does
 *                not settle it — and such an entry DISPLAYS but never applies.
 *   APPLIES NOW = certified AND `condition === null`. A condition is the book's own clause, stored
 *                verbatim; the app does not parse it and must not guess that it is satisfied.
 *
 * Anything else is a REMINDER. That is R-PCA-1's "uncertainty displays, certainty applies", and it
 * is why possessing a vial of dendriton toxin does not put a setback on every roll you make.
 *
 * DIRECTION IS ABOUT THE DIE, NOT THE CHARACTER. 'add' increases that die's count; 'remove'
 * decreases it, floored at zero — removing a setback from a pool that has none is a no-op, which
 * is exactly what the book means by "removes [SE] due to darkness".
 *
 * ORDER: item dice are folded in LAST, after characteristic/skill/difficulty/encumbrance have
 * contributed, so a 'remove' can actually find the die it is meant to remove.
 */
(function () {
  'use strict';

  // F-100 M8 C3 (R-M8K-3): `ability` and `proficiency` join, for upgrade and downgrade only; SYMBOLS are the six
  // automatic results an entry may carry in place of a die.
  var DICE = ['boost', 'setback', 'difficulty', 'challenge', 'force', 'ability', 'proficiency'];
  var SYMBOLS = ['success', 'advantage', 'triumph', 'failure', 'threat', 'despair'];

  /** sheetKey (RANGHVY) and canonical id (ranged_heavy) both -> {id, group, characteristic}. */
  function indexSkills(entries) {
    var bySheetKey = {}, byId = {};
    (entries || []).forEach(function (e) {
      if (!e || !e.id) return;
      var rec = { id: e.id, group: e.group || null, characteristic: e.characteristic || null };
      byId[e.id] = rec;
      var caps = (e.aliases || []).filter(function (a) { return /^[A-Z]+$/.test(a); })[0];
      if (caps) bySheetKey[caps] = rec;
    });
    return { bySheetKey: bySheetKey, byId: byId };
  }

  /**
   * The check an anchor is matched against. Accepts a sheet key or a canonical id. `characteristic` (optional) is the
   * one the check ROLLS — F-100 M8 THE RE-MATCH (ruling f100-m8-contracts R-M8K-2 (iii); B-1065): when a talent swaps a
   * skill's characteristic (M7's best-of, or the hub's one-roll switch), an entry anchored to a characteristic matches
   * the rolled one, not the vocabulary's base. Absent, the base — the behaviour before M8, exactly.
   */
  // F-100 M8 C2 (R-M8K-2): `roll` names the POOL BUILDER's kind (craft, …) for the `roll` anchor scope. Absent, a
  // `roll` anchor matches nothing here — a row anchored to the workshop never leaks onto a plain skill row.
  // B-1061: a roll with NO skill (a Force power check rolls Force dice, FaD p.280) gets a ROLL-ONLY context: only an
  // anchor naming that roll matches it, never `all`, a skill, a group or a characteristic — so no entry reaches the
  // Force row that did not ask for it by name.
  // F-100 M10 (ruling f100-m10-shapes-card R-M10S-3, V4): `powerId` (optional) names WHICH power's check a roll-only
  // context is — the hub's Force row passes it — so a row anchored `{scope: force_power, value: <id>}` reaches that power's
  // roll and no other. Absent, the context is exactly B-1061's.
  // F-100 M12 (ruling f100-m12-census-card R-M12C-14, SV1): `sigAbility` (optional) names the signature ability whose
  // ACTIVATION check this skill check is, so a node row anchored `{scope: signature_ability, value: <id>}` reaches that check
  // and no other (DARK in matches). Absent, the context is exactly what it was.
  function contextFor(skillKeyOrId, index, characteristic, roll, powerId, sigAbility) {
    if (!index) return null;
    var rec = skillKeyOrId ? (index.bySheetKey[skillKeyOrId] || index.byId[skillKeyOrId] || null) : null;
    if (!rec) {
      if (!(roll && !skillKeyOrId)) return null;
      var only = { roll: roll, rollOnly: true };
      if (powerId) only.forcePower = powerId;
      return only;
    }
    var ctx = { skillId: rec.id, group: rec.group, characteristic: characteristic || rec.characteristic };
    if (roll) ctx.roll = roll;
    if (sigAbility) ctx.sigAbility = sigAbility;
    return ctx;
  }

  /**
   * OR semantics (R-PCH-1): the modifier applies if ANY anchor matches — which is how the book
   * authors it ("Discipline, Perception, Resilience, or Vigilance"). `null`/absent anchors match
   * NOTHING: no anchor was recorded, so where it applies is unknown, and unknown never applies.
   */
  function matches(mod, ctx) {
    var anchors = mod && mod.appliesTo;
    if (!anchors || !anchors.length || !ctx) return false;
    for (var i = 0; i < anchors.length; i++) {
      var a = anchors[i];
      if (!a) continue;
      if (ctx.rollOnly && a.scope !== 'roll' && a.scope !== 'force_power') continue;   // B-1061: a roll-only context answers only its own roll
      // F-100 M10 (V4, R-M10S-3): the check of ONE power
      if (a.scope === 'force_power') { if (ctx.forcePower && a.value === ctx.forcePower) return true; continue; }
      // F-100 M12 (SV1, R-M12C-14): the activation check of ONE signature ability
      if (a.scope === 'signature_ability') { if (ctx.sigAbility && a.value === ctx.sigAbility) return true; continue; }
      if (a.scope === 'all') return true;
      if (a.scope === 'skill' && a.value === ctx.skillId) return true;
      if (a.scope === 'group' && a.value === ctx.group) return true;
      if (a.scope === 'characteristic' && a.value === ctx.characteristic) return true;
      if (a.scope === 'roll' && ctx.roll && a.value === ctx.roll) return true;   // C2: the pool builder's kind
      if (a.scope === 'weapon_record' && ctx.weapon && a.value === ctx.weapon) return true;   // R-M8K-25: the weapon row's record
    }
    return false;
  }

  /**
   * NO ANCHOR WAS EVER RECORDED — distinct from "recorded, and does not match this check". Such an
   * entry matches nothing, so it can never reach a row; a surface that wants to show it at all must
   * ask for it by name. Lives here rather than in a consumer so `matches`' "null matches NOTHING"
   * rule has exactly one expression.
   */
  function unanchored(mod) {
    return !(mod && mod.appliesTo && mod.appliesTo.length);
  }

  function isCertified(mod) {
    return mod && mod.direction !== null && mod.direction !== undefined;
  }

  // F-100 M8 C4 (R-M8K-4; R-M7K-4): a row that names a price (`cost`) or a limit is the player's to take, so it is an
  // OFFER at the roll, never folded on its own — exactly as a condition is. effectClass.classOfPoolMod says the same.
  function appliesNow(mod) {
    return isCertified(mod) && (mod.condition === null || mod.condition === undefined) && !mod.cost && !mod.limit && !mod.unless;
  }
  // R-SPF-1 (`f100-surfacing-preflip-species-card`): a species row a SIBLING ability negates (`unless`) is never applied
  // on its own and is OFFERED at the roll exactly as a condition row is, reason 'unless'. Its words are resolved by the
  // species reader (CharResolve.speciesAbilityRowSources → `unless_text`, "unless <Sibling>: <the sibling's words>"), so the
  // hub's existing condition line draws it with no surface of its own.

  /**
   * Every carried item's pool_mods, flattened with its source name.
   *
   * READS THE RESOLVED EQUIPMENT, NOT THE REGISTRY. `canonicalToStore` carries `pool_mods` through
   * (R-PCA-2), so this is one resolution path shared by the sheet, the cockpit and the hub. Reading
   * `window._canonicalRegistries` here instead would be a SECOND path beside the core — the defect
   * PRAXIS §5 names, the reason the first attempt at this lap was discarded, and bounce-on-sight
   * under R-BPH-2.
   *
   * A LEGACY (pre-id-ref) save entry never passes through `canonicalToStore`, so it simply has no
   * `pool_mods` and contributes nothing. That absence is deliberate and is NOT stamped as `[]`
   * (R-PCA-3): absent means "never resolved", `[]` would mean "resolved, has none", and the two
   * must stay distinguishable.
   */
  //
  // THE OWNED-TALENTS ARM (F-100, ruling f100-effects-census R-F100-6 · f100-effects-grammar-contracts
  // R-FEGC-2). `owned` = charResolve.ownedTalentPoolSources(sheet, charbuild): [{id, name, ranked, ranks,
  // pool_mods}], the ranks counted by the ONE counter there (charResolve.ownedRankCounts) — never here.
  // A talent entry is written UNRANKED, exactly as an item's (R-DPS-3); THIS is where it scales:
  //   effective count = count × ranks   for a RANKED talent (entry `per_rank` absent or true)
  //                   = count           for an UNRANKED talent, or an entry marked `per_rank: false`
  //                                     (secret_lore's / codebreaker's once-only difficulty removal).
  // `source` = the talent's name. direction / applies_to / condition carry unchanged, so R-PCA-1 holds
  // verbatim: a condition is a reminder, never applied — `augment` and `reminders` do not know or care
  // whether an entry came from an item or a talent. Absent `owned` = the item-only behaviour, exactly.
  // C3's `symbol` rides only on the entries that carry one, so every other entry keeps its exact shape.
  // M8's talent-row keys (id, cost, limit, words) ride the same way: present only where the entry carries them.
  var HOLDER_SECTION = { weapon: 'weapons', armor: 'armor', gear: 'gear' };
  // a copy whose book text was removed (SWRPGSources.bookTextRemoved, its one reader); false in node without the module
  function _bookTextRemoved() {
    var g = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null);
    var S = g && g.SWRPGSources;
    return !!(S && typeof S.bookTextRemoved === 'function' && S.bookTextRemoved());
  }
  function withSymbol(row, m) {
    if (m.symbol) row.symbol = m.symbol;
    // `floor` (member F, R-M8K-29): talent rows only — the validator refuses it on items (L1cb.prv).
    // `who` (5h brief §5): carried, never read here — ui.jsx offerWho / offerInfo are its readers.
    // `own_slot` (S3, R-AE-7): an item row's [owner, key] in own_words.json, present only at 'removed'
    ['id', 'cost', 'limit', 'words', 'floor', 'unless', 'unless_text', 'who', 'own_slot'].forEach(function (k) { if (m[k] !== undefined) row[k] = m[k]; });   // R-SPF-1: unless (species rows only)
    return row;
  }

  function collect(equipment, owned) {
    var out = [];
    if (!equipment && !owned) return out;

    // `holder` (the surfacing hub, D-229 Q1 (b) as ruled by ADDENDUM 7 Q3): which list the item rode in — 'weapon',
    // 'armor' or 'gear' — so the hub folds the CARRIED-GEAR offers behind one line and keeps worn armour and the weapon
    // in hand open. A word for a surface; it decides no fold, match or key.
    function take(list, holder) {
      (list || []).forEach(function (item) {
        if (!item || !item.pool_mods) return;
        // B-1590 (DECISIONS D-411 item 1): the owning item's record as this character resolved it — its id, name and
        // description — rides the row (never saved), so the line's (i) opens the item's own words (SWRPGUI.offerItemInfo)
        var own = { id: item.regId || item.id || null, name: item.name || item.key, text: item.description || '' };
        // S3: the item record itself, unlisted (never saved, never compared), for the public copy's book line (SWRPGSources reads it)
        try { Object.defineProperty(own, 'rec', { value: item, enumerable: false }); } catch (e) { /* frozen host object */ }
        // S3 (R-AE-7): at 'removed' only, the row's key in own_words.json — the item's own rows lead item.pool_mods in
        // registry order (itemResolve appends an attachment's, each stamped with its own slot)
        var sec = _bookTextRemoved() ? HOLDER_SECTION[holder] : null, rid = item.regId || item.id;
        item.pool_mods.forEach(function (m, i) {
          if (sec && rid != null && !m.own_slot) m = Object.assign({}, m, { own_slot: ['item:' + sec + ':' + rid, 'pool_mods[' + i + ']'] });
          out.push(withSymbol({
            source: item.name || item.key,
            holder: holder,
            item: own,
            die: m.die,
            count: m.count,
            direction: m.direction === undefined ? null : m.direction,
            condition: m.condition === undefined ? null : m.condition,
            appliesTo: m.applies_to || null,
          }, m));
        });
      });
    }

    if (equipment) {
      take(equipment.weapons, 'weapon');
      take(equipment.armor ? [equipment.armor] : [], 'armor');
      take(equipment.gear, 'gear');
    }

    (Array.isArray(owned) ? owned : []).forEach(function (t) {
      if (!t || !Array.isArray(t.pool_mods)) return;
      var ranks = Math.max(1, Number(t.ranks) || 1);
      t.pool_mods.forEach(function (m) {
        var times = (!t.ranked || m.per_rank === false) ? 1 : ranks;
        out.push(withSymbol({
          source: t.name || t.id,
          talentId: t.id,
          die: m.die,
          // F-100 M9 (R-M9S-6): `count: 'all'` (a species row: remove + a die) is never multiplied — it stays 'all'
          // F-100 THE SURFACING MISSION (ADDENDUM 8): a `reroll` row carries no count, and none is made (never NaN)
          count: m.count === 'all' ? 'all' : m.count == null ? m.count : m.count * times,
          direction: m.direction === undefined ? null : m.direction,
          condition: m.condition === undefined ? null : m.condition,
          appliesTo: m.applies_to || null,
        }, m));
      });
    });
    return out;
  }

  /**
   * Fold the auto-applying mods for this check into a `buildPool` spec. Returns a NEW spec; the
   * caller's object is never mutated. `changes` lists what moved, so a surface can explain the
   * number instead of just showing it.
   */
  //
  // RAW ORDER, NEVER DATA ORDER (F-100 M8 C3, ruling f100-m8-contracts R-M8K-3; B-1063): the matched mods fold
  // add → upgrade → downgrade → remove (R1: EotE p.20; FaD p.29), stable within a verb. Where a verb meets the
  // others it is NOT folded into a count here — it becomes the `buildPool` field that applies it in that order
  // (VERB_FIELD), because only the built pool knows what an upgrade or a downgrade left behind. Boost, setback and
  // force adds and removes never meet an upgrade or a downgrade, so they stay folded into the counts, as before.
  // A Difficulty die ADDED is a count too: adds come before every upgrade.
  //
  // THE CHANGE RECORD stays "what moved, from → to, floored": a verb that changed nothing is not recorded. For a
  // `buildPool` field that needs the built pool, the engine is asked (`SWRPGDice`, the one core); `from`/`to` are
  // the counts of the entry's own die in the pool built before and after it, and `before`/`after` carry both pools.
  function augment(spec, mods, ctx) {
    var next = {}, k;
    for (k in (spec || {})) if (Object.prototype.hasOwnProperty.call(spec, k)) next[k] = spec[k];
    var changes = [];
    var Dice = engine();

    (mods || []).map(function (m, i) { return { m: m, i: i }; })
      .filter(function (x) { return appliesNow(x.m) && matches(x.m, ctx); })
      .sort(function (a, b) { return (VERB_ORDER[a.m.direction] - VERB_ORDER[b.m.direction]) || (a.i - b.i); })
      .forEach(function (x) {
        var m = x.m;
        if (m.symbol) {                     // an AUTOMATIC result (C3): added, never rolled; `add` only
          if (m.direction !== 'add' || SYMBOLS.indexOf(m.symbol) === -1 || !(m.count > 0)) return;
          var auto = {}, s;
          for (s in (next._autoSymbols || {})) auto[s] = next._autoSymbols[s];
          var had = auto[m.symbol] || 0;
          auto[m.symbol] = had + m.count;
          next._autoSymbols = auto;
          changes.push(withAll({ source: m.source, symbol: m.symbol, count: m.count, direction: 'add', from: had, to: had + m.count, taken: !!m._taken }, m));
          return;
        }
        if (DICE.indexOf(m.die) === -1) return;
        // F-100 M9 (ruling f100-m9-shapes-card R-M9S-6): `count: 'all'` never reaches arithmetic. It is legal only with
        // `remove` and a die, and at the remove step (RAW order: last) it removes EVERY die of that kind present — the
        // built pool's count where a verb field meets the others (removeDifficulty / removeChallenge), the spec's count
        // otherwise. Nothing present: a silent no-op, like any remove that found nothing.
        if (m.count === 'all') {
          if (m.direction !== 'remove') return;
          var present = VERB_FIELD['remove:' + m.die]
            ? ((Dice ? Dice.buildPool(next) : null) || {})[m.die] || 0
            : Math.max(0, next[m.die] || 0);
          if (!(present > 0)) return;
          var mm = {}, kk;
          for (kk in m) if (Object.prototype.hasOwnProperty.call(m, kk)) mm[kk] = m[kk];
          mm.count = present; mm.all = true;
          m = mm;
        }
        // F-100 M8 member F (R-M8K-29/30): a floored decrease of difficulty goes to its own buildPool field, a list,
        // so the engine applies each floor to its own row only, floored rows first. The change record is the same.
        if (m.die === 'difficulty' && m.direction === 'remove' && m.floor != null) {
          var preF = Dice ? Dice.buildPool(next) : null, wasF = next.removeDifficultyFloored || [];
          next.removeDifficultyFloored = wasF.concat([{ count: m.count, floor: m.floor }]);
          var postF = Dice ? Dice.buildPool(next) : null;
          if (preF && postF && !poolMoved(preF, postF)) { next.removeDifficultyFloored = wasF; return; }   // at its floor: ignored
          changes.push(withAll({ source: m.source, die: m.die, count: m.count, direction: m.direction, floor: m.floor,
                         from: preF ? (preF.difficulty || 0) : null, to: postF ? (postF.difficulty || 0) : null,
                         before: preF, after: postF, taken: !!m._taken }, m));
          return;
        }
        var field = VERB_FIELD[m.direction + ':' + m.die];
        if (field) {
          var pre = Dice ? Dice.buildPool(next) : null;
          var was = Math.max(0, next[field] || 0);
          next[field] = was + m.count;
          var post = Dice ? Dice.buildPool(next) : null;
          if (pre && post && !poolMoved(pre, post)) { next[field] = was; return; }   // found nothing: ignored (R3, R6)
          changes.push(withAll({ source: m.source, die: m.die, count: m.count, direction: m.direction,
                         from: pre ? (pre[m.die] || 0) : was, to: post ? (post[m.die] || 0) : was + m.count,
                         before: pre, after: post, taken: !!m._taken }, m));
          return;
        }
        if (m.direction !== 'add' && m.direction !== 'remove') return;
        if (m.die === 'ability' || m.die === 'proficiency') return;   // not a talent verb (C3's allOf); no field
        var before = Math.max(0, next[m.die] || 0);
        var after = m.direction === 'remove'
          ? Math.max(0, before - m.count)
          : before + m.count;
        if (after === before) return;          // a remove that found nothing is a silent no-op
        next[m.die] = after;
        changes.push(withAll({ source: m.source, die: m.die, count: m.count,
                       direction: m.direction, from: before, to: after, taken: !!m._taken }, m));
      });

    next._poolModChanges = changes;
    return next;
  }

  // a change made by a `count: 'all'` row says so (R-M9S-6); every other change keeps its exact shape
  // B-1451 (D-406 item 14): a change names its owner's entry (`talentId`, `rowId`) where the row has one, so an applied line can
  // open its source's words; an item's or a quality's change (no talentId) records exactly as before
  function withAll(c, m) { if (m.all) c.all = true; if (m.talentId) { c.talentId = m.talentId; c.rowId = m.id; } if (m.item) c.item = m.item; return c; }   // B-1590: the owning item
  var VERB_ORDER = { add: 0, upgrade: 1, downgrade: 2, remove: 3 };
  // the verbs that meet one another in the Difficulty/Challenge and Ability/Proficiency pairs → buildPool's field
  var VERB_FIELD = {
    'add:challenge': 'addChallenge',
    'upgrade:ability': 'upgradeAbility', 'upgrade:difficulty': 'upgradeDifficulty',
    'downgrade:proficiency': 'downgradeAbility', 'downgrade:challenge': 'downgradeDifficulty',
    'remove:difficulty': 'removeDifficulty', 'remove:challenge': 'removeChallenge',
  };
  var POOL_DICE = ['ability', 'proficiency', 'boost', 'setback', 'difficulty', 'challenge', 'force'];
  function poolMoved(a, b) {
    for (var i = 0; i < POOL_DICE.length; i++) if ((a[POOL_DICE[i]] || 0) !== (b[POOL_DICE[i]] || 0)) return true;
    return false;
  }
  // The one dice core: a page global in the browser and in every vm that loads diceEngine.js; a sibling module in node.
  function engine() {
    if (typeof window !== 'undefined' && window.SWRPGDice) return window.SWRPGDice;
    try { return typeof require === 'function' ? require('./diceEngine.js') : null; } catch (e) { return null; }
  }

  /**
   * The display half: mods relevant to this check that did NOT apply, each with the reason —
   * a condition the player must judge, or an uncertified entry the text never settled.
   */
  // F-100 THE SURFACING MISSION (card f100-surfacing-roll-options-card ADDENDUM 8 F9): a `reroll` row is never a reminder —
  // nothing shows before the roll (D-294 L3); it comes only from rerollsAt, after the roll. One exclusion in the core, so
  // the sheet's why-lines, the Yard's seat lines (both hosts) and the hub's treat row inherit it.
  function reminders(mods, ctx) {
    return (mods || []).filter(function (m) {
      return matches(m, ctx) && !appliesNow(m) && m.direction !== 'reroll';
    }).map(function (m) {
      var r = {
        source: m.source, die: m.die, count: m.count, direction: m.direction,
        condition: m.condition || (m.unless ? m.unless_text || null : null),
        reason: !isCertified(m) ? 'uncertified' : (m.condition !== null && m.condition !== undefined) ? 'condition'
          : m.unless ? 'unless' : m.cost ? 'cost' : 'limit',
        symbol: m.symbol, id: m.id, cost: m.cost, limit: m.limit, talentId: m.talentId, holder: m.holder, key: offerKey(m),
      };
      if (m.who) r.who = m.who;   // 5h brief §5: carried only where the row has one
      if (m.own_slot) r.own_slot = m.own_slot;   // S3 (R-AE-7): the row's own_words.json key (public copy only)
      if (m.item) r.item = m.item;   // B-1590 (D-411 item 1): the owning item, for its (i)
      if (m.quality) r.quality = m.quality;   // B-1609 (D-412 item 5): the owning weapon quality's id, for its (i)
      // B-1453 (D-406 item 12): an entry anchored to EVERY check (`all` only) names no skill — the hub folds its conditional
      // offer behind one line ("1 more for a situation")
      if (m.appliesTo && m.appliesTo.length && m.appliesTo.every(function (a) { return a && a.scope === 'all'; })) r.anyCheck = true;
      return r;
    });
  }

  // F-100 THE SURFACING MISSION (card f100-surfacing-roll-options-card R-SRO-5, ADDENDUM 8 F8/F9/F12; D-294 L3): THE
  // REROLLS at one check, AFTER the roll — the matched `direction: 'reroll'` rows (talent rows: `limit` is refused on items),
  // each an offer the hub draws with a Reroll button in the tick's place. The limit is SHOWN, never tracked (R-M8BG-38): the
  // next roll of the row offers it again. Never folded (augment: appliesNow is false for a limited row), never a reminder.
  // → [{key, source, talentId, id, direction: 'reroll', limit, cost, words}]
  function rerollsAt(mods, ctx) {
    return (mods || []).filter(function (m) {
      return m && m.direction === 'reroll' && matches(m, ctx);
    }).map(function (m) {
      var r = { key: offerKey(m), source: m.source, talentId: m.talentId, id: m.id, direction: 'reroll',
                limit: m.limit, cost: m.cost, words: m.words };
      if (m.who) r.who = m.who;   // 5h brief §5: carried only where the row has one
      return r;
    });
  }

  // ── F-100 M8 step 3 (f100-m8-build-card R-M8B-11..13; f100-m8-contracts R-M8K-28): THE OFFER ──────────────────
  // A row the player takes at the roll: a CERTIFIED entry with a condition, a cost or a limit (appliesNow is false).
  // `offerKey` names it for one roll's tick; the tick lives in the surface's state for ONE roll and is never written
  // (R-M8B-12 (a)). Talent rows key by talent + row id; an item entry (no id) by its source and its own fields.
  function offerKey(m) {
    if (!m) return '';
    var who = m.talentId ? 't:' + m.talentId : 'i:' + (m.source || '');
    return who + ':' + (m.id || [m.symbol || m.die, m.direction, m.count, typeof m.condition === 'string' ? m.condition : ''].join('|'));
  }
  // The ticked offers, TAKEN: each certified mod whose key is ticked is copied without its condition, cost and limit,
  // so the ONE fold (`augment`, in RAW order with every other entry) applies it, and its change record says `taken`.
  // The cost is shown, never charged (F5). An uncertified entry cannot be taken: it has no direction to fold.
  // `taken` = { <offerKey>: true }. Returns a NEW list; the mods are never mutated.
  function takeOffers(mods, taken) {
    if (!taken) return mods || [];
    return (mods || []).map(function (m) {
      if (!m || appliesNow(m) || !isCertified(m) || !taken[offerKey(m)]) return m;
      var c = {}, k;
      for (k in m) if (Object.prototype.hasOwnProperty.call(m, k)) c[k] = m[k];
      c.condition = null; delete c.cost; delete c.limit; delete c.unless; delete c.unless_text; c._taken = true;
      return c;
    });
  }

  // ── F-100 M8 C11 (R-M8K-16..19, R-M8K-26): the owner's ROLL NUMBERS at a roll ─────────────────────────────────
  // `owned` = CharResolve.ownedTalentRollSources(sheet, charbuild). `op` is one of $defs/roll_number's ops. `opts`:
  //   ctx    — the check context (contextFor); its anchors match through `matches`, the ONE anchor rule. A row with NO
  //            anchor matches nothing at a check (unknown never applies, as for dice rows); at the `critical_injury`
  //            moment, which has no check, an anchor-less row is the owner's own injury roll (Durable, EotE p.135).
  //   moment — 'check' (default) or 'critical_injury'; a row answers only its own moment.
  //            'critical_inflicted' (B-219, R-B219C-10): the Critical roll the wielder INFLICTS. Its `owned` is the WEAPON
  //            (SWRPGQualityRows.rollSources: Vicious per rating), so an anchor-less row answers there, as at critical_injury;
  //            the owner's talents never carry it (L1q.rows), so Vicious never reaches the owner's own injury roll.
  //   band   — the weapon row's band, lowercase (the SAME band computeWeaponPool prices from, R-M8K-26). A row with
  //            `range_band` is ABSENT at any other band (machine-checked, so not a fate input).
  //   sheet  — for `amount: {of: characteristic | skill_ranks}`.
  //   pickFor(talentId, pickId) — a row whose amount reads a pick (`chosen`) with no answer FAILS CLOSED: it is never
  //            applied, and it is returned in `unpicked` so a surface can prompt (R-M8K-6).
  // Fate is effectClass.classOfRollNumber's, the one rule: a condition, cost or limit makes the row OFFERED.
  // → { applied: [line], offered: [line], unpicked: [line], total } where line = {source, talentId, rowId, op,
  //   amount, floor, row}; `total` sums the APPLIED amounts (signed).
  function rollAmount(row, t, sheet, pickFor) {
    var a = row.amount, n;
    if (typeof a === 'number') n = a;
    else if (a && typeof a === 'object') {
      var key = a.key;
      if (a.chosen) { key = pickFor ? pickFor(t.id, a.chosen) : null; if (key == null) return null; }
      if (!key || !sheet) return null;
      if (a.of === 'characteristic') n = Number((sheet.characteristics || {})[key]) || 0;
      else if (a.of === 'skill_ranks') {
        var sk = sheet.skills || {}, v = sk[key];
        n = (v && typeof v === 'object') ? (Number(v.rank) || 0) : (Number(v) || 0);
      } else return null;
      if (a.half_round_up) n = Math.ceil(n / 2);
    } else return null;
    return (row.per_rank && t.ranked) ? n * Math.max(1, Number(t.ranks) || 1) : n;
  }
  function rollNumbersAt(owned, op, opts) {
    opts = opts || {};
    var moment = opts.moment || 'check', EC = (typeof window !== 'undefined' && window.SWRPGEffectClass) || null;
    var out = { applied: [], offered: [], unpicked: [], total: 0 };
    (Array.isArray(owned) ? owned : []).forEach(function (t) {
      (t && Array.isArray(t.roll_numbers) ? t.roll_numbers : []).forEach(function (row) {
        if (!row || row.op !== op || (row.moment || 'check') !== moment) return;
        if (op === 'power_dial') return;   // F-100 M10: a dial is never a roll number's total — powerDialsAt is its one reader
        var anchors = row.applies_to;
        if (anchors && anchors.length) { if (!matches({ appliesTo: anchors }, opts.ctx)) return; }
        else if (moment !== 'critical_injury' && moment !== 'critical_inflicted') return;
        if (Array.isArray(row.range_band) && row.range_band.indexOf(String(opts.band || '').toLowerCase()) === -1) return;
        var line = { source: t.name || t.id, talentId: t.id, rowId: row.id, op: op, amount: rollAmount(row, t, opts.sheet, opts.pickFor),
                     floor: row.floor != null ? row.floor : null, row: row };
        // F-100 THE SURFACING MISSION (ADDENDUM 8 F1/F6, R-SRO-4): a number that rides a TARGET row's tick names it; it
        // draws no tick of its own, and takeRollNumbers takes it by that row's key
        if (row.when && row.when.ticked) line.tickedBy = row.when.ticked;
        if (line.amount == null) { out.unpicked.push(line); return; }
        var cls = EC && EC.classOfRollNumber ? EC.classOfRollNumber(row) : 'reminds';   // no rule loaded → never applied
        if (cls === 'resolves') { out.applied.push(line); out.total += line.amount; } else out.offered.push(line);
      });
    });
    return out;
  }
  // F-100 surfacing hub (ADDENDUM 6/7, `b1205:offered-crit-sets`, R-SFL-6 (a)): the ticked OFFERED roll numbers at ONE
  // roll, TAKEN — each offered line whose offerKey ({talentId, id: rowId}, the key the hub's tick holds) is ticked joins
  // `applied` (marked `_taken`, its amount added to `total`), so critRatingWith reads a ticked crit SET exactly as an
  // applied one. `offered` keeps every line, so the surface still draws the tick. `taken` = { <offerKey>: true }; absent or
  // nothing ticked → the very same result. Returns a NEW result; `at` is never mutated.
  function takeRollNumbers(at, taken) {
    if (!at || !taken) return at;
    var add = (at.offered || []).filter(function (l) { return taken[offerKey({ talentId: l.talentId, id: l.tickedBy || l.rowId })]; });
    if (!add.length) return at;
    var total = at.total || 0;
    add = add.map(function (l) { total += Number(l.amount) || 0; return Object.assign({}, l, { _taken: true }); });
    return { applied: (at.applied || []).concat(add), offered: at.offered, unpicked: at.unpicked, total: total };
  }
  // F-100 M10 (ruling f100-m10-shapes-card R-M10S-4, V2) — THE DIALS AT ONE POWER'S CHECK, the one reader. Every owned
  // upgrade's `power_dial` row whose V4 anchor matches `ctx` (contextFor(null, idx, undefined, 'force_power', powerId)), as
  // an OFFERED line — ALWAYS offered, never applied and never folded into a sheet number (C11's discipline), whatever
  // effectClass would say of a row without a cost. A line: { source, talentId, rowId, unit, perRank, ranks, amount, cost,
  // repeatable, row } where amount = perRank × ranks (V1's count, resolved by CharResolve into the row's `count`; a flat dial
  // reads 1) and perRank = the row's `amount` (an integer, or a characteristic read off the sheet: Presence × Magnitude).
  // F-100 M11 (D-M11C1 (a)): a row with `replaces_step_of: '<sibling ability>.<row id>'` is OFFERED IN PLACE OF that
  // sibling's step — its line takes the sibling's unit, ranks and repeatable, its OWN amount as the step (perRank), and
  // names what it replaces (`replaces`: '<power>.<ability>.<row id>'). With a `limit` ({first: 1, per}) the step is
  // replaced for the first activation per check/round/turn only, so the sibling's own line stays beside it; without one
  // the sibling's line is withdrawn. A replacing row whose sibling line is not offered (that upgrade unowned) offers nothing.
  function powerDialsAt(owned, ctx, sheet) {
    if (!ctx) return [];
    var out = [], replacing = [];
    (Array.isArray(owned) ? owned : []).forEach(function (t) {
      (t && Array.isArray(t.roll_numbers) ? t.roll_numbers : []).forEach(function (row) {
        if (!row || row.op !== 'power_dial' || (row.moment || 'check') !== 'check') return;
        if (!row.applies_to || !row.applies_to.length || !matches({ appliesTo: row.applies_to }, ctx)) return;
        var per = rollAmount(row, { id: t.id, ranked: false, ranks: 1 }, sheet, null);
        if (per == null) return;
        if (row.replaces_step_of) { replacing.push({ t: t, row: row, per: per }); return; }
        var ranks = row.count != null ? Number(row.count) || 0 : 1;
        if (!(ranks > 0)) return;
        out.push({ source: t.name || t.id, talentId: t.id, rowId: row.id, unit: row.unit, perRank: per, ranks: ranks,
                   amount: per * ranks, cost: row.cost || null, repeatable: row.repeatable == null ? null : !!row.repeatable, row: row,
                   _key: (t.power || '') + '.' + (t.ability || '') + '.' + row.id });
      });
    });
    var withdrawn = {};
    replacing.forEach(function (x) {
      var key = (x.t.power || '') + '.' + String(x.row.replaces_step_of), sib = out.filter(function (l) { return l._key === key; })[0];
      if (!sib || sib.unit !== x.row.unit) return;
      out.push({ source: x.t.name || x.t.id, talentId: x.t.id, rowId: x.row.id, unit: sib.unit, perRank: x.per, ranks: sib.ranks,
                 amount: x.per * sib.ranks, cost: x.row.cost || sib.cost, repeatable: sib.repeatable, row: x.row,
                 replaces: key, limit: x.row.limit || null });
      if (!x.row.limit) withdrawn[key] = true;
    });
    return out.filter(function (l) { return !(l._key && withdrawn[l._key]); }).map(function (l) {
      if (l._key) delete l._key;
      return l;
    });
  }
  // The attack's Critical rating with the APPLIED crit_rating_delta rows, never below the highest floor any of them
  // names (default 1, "to a minimum of 1" as printed). `printed` null (no rating) → null.
  // F-100 M9 (ruling f100-m9-shapes-card R-M9S-4): `setAt` = rollNumbersAt(owned, 'crit_rating_set', …) — a species
  // ability that FIXES the attack's rating (Trandoshan claws: Crit 3). ORDER, an encoding of a RAW-silent combination
  // (reported, not claimed as RAW): the APPLIED set replaces the printed rating first, then the deltas, then the floor —
  // so a Trandoshan with Iron Body 1 reads Crit 2. The validator admits ONE set per attack (L1cb.prv species, R-M9S-4).
  // Absent, or no applied set: exactly the rating it always returned.
  function critRatingWith(printed, at, setAt) {
    var set = setAt && setAt.applied && setAt.applied.length ? Number(setAt.applied[0].amount) : null;
    var base = (set != null && isFinite(set)) ? set : printed;
    if (base == null || !isFinite(base)) return null;
    if (!at || !at.applied.length) return base;
    var floor = 1; at.applied.forEach(function (l) { if (l.floor != null && l.floor > floor) floor = l.floor; });
    return Math.max(floor, base + at.total);
  }
  // The Critical Injury the OWNER suffers (R-M8K-19, N6): the d100, then every +10 (the injuries already suffered,
  // and any APPLIED positive row), then the reductions, then the floor (the highest a reduction names, default 1).
  // → { d100, total, lines: [{label, amount}] } — the lines are the roll's own printed steps (R-M8K-18).
  function critRoll(d100, critCount, at) {
    var lines = [], total = d100, plus = 0, minus = 0, floor = 1;
    if (critCount > 0) { lines.push({ label: critCount + (critCount === 1 ? ' injury' : ' injuries') + ' already suffered', amount: critCount * 10 }); total += critCount * 10; }
    (at ? at.applied : []).forEach(function (l) { if (l.amount > 0) { plus += l.amount; lines.push({ label: l.source, amount: l.amount }); } });
    total += plus;
    (at ? at.applied : []).forEach(function (l) {
      if (l.amount < 0) { minus += l.amount; lines.push({ label: l.source, amount: l.amount, floor: l.floor != null ? l.floor : 1 }); if (l.floor != null && l.floor > floor) floor = l.floor; }
    });
    total = Math.max(floor, total + minus);
    return { d100: d100, total: total, lines: lines };
  }

  var api = {
    DICE: DICE,
    indexSkills: indexSkills,
    contextFor: contextFor,
    matches: matches,
    unanchored: unanchored,
    isCertified: isCertified,
    appliesNow: appliesNow,
    collect: collect,
    augment: augment,
    reminders: reminders,
    rerollsAt: rerollsAt,   // F-100 THE SURFACING MISSION (ADDENDUM 8 F8/F9): the rerolls offered after a check — DARK
    offerKey: offerKey,
    takeOffers: takeOffers,
    rollNumbersAt: rollNumbersAt,
    takeRollNumbers: takeRollNumbers,   // the hub: a ticked offered roll number (a crit SET) taken for ONE roll
    powerDialsAt: powerDialsAt,   // F-100 M10 (V2): the dials offered at one power's check — DARK
    critRatingWith: critRatingWith,
    critRoll: critRoll,
  };

  if (typeof window !== 'undefined') window.SWRPGPoolMods = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
