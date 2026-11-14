/**
 * charModify.js — window.SWRPGModify: the engine of "Modify this Character" (F-100 M13; card f100-m13-build Lap A, ruling
 * f100-m13-layer R-M13L-1..19). The page calls this one module; it has no markup and writes nothing itself except the
 * device-local draft. save() and undo() RETURN one patch, and the sheet saves it through its normal save.
 *
 *   draftFrom(sheet, env)            → { baseFp, patch: {} }: what a page opens with
 *   price(sheet, patch, opts, env)   → { xp, total, net, tracked, lines: [{ part, ref, op, xp, book, total?, pastLimit?, offBook? }] }
 *                                      xp moves `spent`; total moves `xp.total` (R-M13B-30); net is what the player gains, total − xp
 *   save(sheet, patch, opts, env)    → { ok, patch, record, entry } | { ok: false, reasons }
 *   canUndo(sheet, env)              → { ok, reason, entry }: reason is a plain sentence or null
 *   undo(sheet, env)                 → as save; the patch appends the latest entry's inverse
 *   offers(sheet, env)               → [{ section, id, state: current|updated|gone, from, lower }] (R-M13L-4)
 *   newOwnId / ownCopy / addOwn      — the layer's ids and copies (R-M13L-15/-16)
 *   readDraft / writeDraft / dropDraft (id, …, store) and draftState (R-M13L-12)
 *   rebase(prevSheet, nextSheet, patch) — a copy landing under an open draft (R-M13B-151)
 *   fingerprint(sheet, env)          — the stable hash over the build unit (R-M13L-10)
 *
 * THE LOG (R-M13L-9): items carry what the player changed. One more item, part 'stored', carries the re-projected values and
 * the retired `derived`, so Undo restores them exactly: the page's log leaves it out.
 *
 * env = { CR, M, PD, BR, UD, SM, base, itemsBase?, rail?, now?, rand? }; envFromWindow() builds it in the browser.
 * Dual-export, as packAttach.js. Loaded by player/index.html after the shared cores it reads at call time.
 */
(function (root) {
  'use strict';

  var OWN_PACK_ID = 'own_layer';
  var OWN_ID_PREFIX = 'custom_' + OWN_PACK_ID + '_';
  var DRAFT_KEY = 'swrpg_modify_draft';
  // Who wrote the fields Save re-derives, so a draft can never hand them in.
  var STORED_KEYS = ['talents', 'derivedBonuses', 'derivedConditional', 'woundBase', 'strainBase', 'derived'];
  var NOT_MODIFY = ['changes', 'mods', 'rewards', 'contacts', '_xpRepairedAt', 'specializationIds', 'specialization', 'characteristicsAtCreation'];
  var LIST_KEYS = { specializations: 'specializations', forcePowers: 'force_powers', signatureAbilities: 'signature_abilities' };
  var MAP_KEYS = { characteristics: 'characteristics', skills: 'skills' };
  var GROUPS = { species: ['speciesId', 'species'], career: ['careerId', 'career'] };
  // Book limits (R-M13L-8), each cite rules-oracle's: a note and a flag, never a block.
  // The fields an inverse item cannot put back to the byte (a list's order, an emptied map): the 'stored' item restores them whole.
  var WHOLE_ON_UNDO = ['specializations', 'forcePowers', 'signatureAbilities', 'looseTalents', 'own'];
  var CHARACTERISTIC_CAP = 6, SKILL_CAP = 5, FREE_RANK_CAP = 2;
  var FREE_CITES = { eote: ['Edge of the Empire p.92', 'Edge of the Empire p.34', 'Edge of the Empire p.35'], aor: ['Age of Rebellion p.102', 'Age of Rebellion p.41', 'Age of Rebellion p.41'], fad: ['Force and Destiny p.102', 'Force and Destiny p.43', 'Force and Destiny p.44'] };
  var LIMIT_CITES = {
    characteristic: { eote: 'Edge of the Empire Core Rulebook p.92', aor: 'Age of Rebellion Core Rulebook p.36', fad: 'Force and Destiny Core Rulebook p.136' },
    skill: { eote: 'Edge of the Empire Core Rulebook p.92' },
  };

  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o || {}, k); }
  function same(a, b) { return JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b); }

  function envFromWindow() {
    var w = root || {};
    return { CR: w.CharResolve, M: w.SWRPGMods, PD: w.SWRPGProjectionDiff, BR: w.SWRPGBaseRef, UD: w.SWRPGUserData, SM: w.SWRPGSyncMerge,
             IR: w.SWRPGItemRegistries, base: w._canonicalCharbuildBase, rail: _rail, NM: w._narrativeMechConfig };
  }
  // ready() — the validator's rail, once (the Homebrew forms' own; R-M13L-1). A Save carrying `own` needs it.
  var _rail = null;
  function ready() {
    var UD = root && root.SWRPGUserData;
    if (_rail || !UD || typeof UD.authoringRail !== 'function') return Promise.resolve(_rail);
    return UD.authoringRail().then(function (r) { _rail = r; return r; });
  }

  // ── the build fingerprint (R-M13L-10): over the build unit's sheet keys, `changes` excluded. The unit's two top-level name keys
  //    mirror sheetData.species/career, so a sheet's fingerprint covers them. ─────────────────────────────────────────
  function buildKeys(env) {
    return env.SM.UNITS.swrpg_saved_characters.groups.xp
      .filter(function (k) { return k.indexOf('sheetData.') === 0; })
      .map(function (k) { return k.slice('sheetData.'.length); })
      .filter(function (k) { return k !== 'changes'; });
  }
  function fingerprint(sheet, env) {
    var o = {};
    buildKeys(env).forEach(function (k) { if (sheet && sheet[k] !== undefined) o[k] = sheet[k]; });
    return env.BR.sha256hex(env.BR.jcs(JSON.parse(JSON.stringify(o))));
  }
  function draftFrom(sheet, env) { return { baseFp: fingerprint(sheet, env), patch: {} }; }
  function apply(sheet, patch) {
    var next = Object.assign({}, sheet);
    Object.keys(patch).forEach(function (k) { if (patch[k] === undefined) delete next[k]; else next[k] = patch[k]; });
    return next;
  }

  // ── the layer's records (R-M13L-15/-16) ────────────────────────────────────────────────────────────────────────────
  function emptyOwn() { return { formatVersion: 1, packId: OWN_PACK_ID, name: OWN_PACK_ID, sections: {} }; }
  function newOwnId(ownPack, env) {
    var taken = {}, secs = (ownPack && ownPack.sections) || {}, rnd = (env && env.rand) || Math.random;
    Object.keys(secs).forEach(function (s) { Object.keys(secs[s] || {}).forEach(function (id) { taken[id] = true; }); });
    for (;;) { var id = OWN_ID_PREFIX + Math.floor(rnd() * 2176782336).toString(36); if (!taken[id]) return id; }
  }
  function withRecord(ownPack, section, id, rec) {
    var out = clone(ownPack) || emptyOwn();
    out.sections[section] = out.sections[section] || {};
    out.sections[section][id] = rec;
    return out;
  }
  // addOwn(ownPack, section, record, env) → { own, id }: a NEW record (New talent… / New ability… / New item…), `_mode: 'add'`
  function addOwn(ownPack, section, record, env) {
    var id = newOwnId(ownPack, env), rec = Object.assign(clone(record), { id: id, _mode: 'add' });
    return { own: withRecord(ownPack, section, id, rec), id: id };
  }
  // The view under the layer: the sheet's stamps with no `own`. Null when the sheet is held.
  function lowerView(sheet, section, env) {
    if (isItemSection(section)) return (env.IR && env.IR.forStampSync(sheet && sheet.mods)) || env.itemsBase || null;
    var bare = Object.assign({}, sheet); delete bare.own;
    return env.CR.stampTalentView(bare, env.base, env.M, env.UD);
  }
  function isItemSection(section) { return section === 'weapons' || section === 'armor' || section === 'gear'; }
  function lowerRecord(sheet, section, id, env) {
    var view = lowerView(sheet, section, env);
    if (!view) return { held: true, rec: null };
    var reg = view[env.M.SECTION_TABLE[section].viewKey];
    return { held: false, rec: (reg && own(reg, id)) ? reg[id] : null };
  }
  // The layer a copy was taken from: the last stamp supplying the id, else 'base' (R-M13L-16's `_from`).
  function stampOf(sheet, section, id, rec, env) {
    var mods = Array.isArray(sheet && sheet.mods) ? sheet.mods : [];
    for (var i = mods.length - 1; i >= 0; i--) {
      var m = mods[i];
      if (env.M.isUserStamp(m)) {
        var p = env.UD && env.UD.stampSync(m), s = p && p.sections && p.sections[section];
        if (s && own(s, id)) return m;
      } else if (rec && rec._variant) return m;
    }
    return 'base';
  }
  function stripPrivate(rec) { var o = {}; Object.keys(rec || {}).forEach(function (k) { if (k.charAt(0) !== '_') o[k] = rec[k]; }); return clone(o); }
  // ownCopy(sheet, section, id, env) → the whole record as a modified copy (`_mode: 'redefine'`), or null when nothing resolves.
  function ownCopy(sheet, section, id, env) {
    var lo = lowerRecord(sheet, section, id, env);
    if (!lo.rec) return null;
    return Object.assign(stripPrivate(lo.rec), { _mode: 'redefine', _base: { ref: env.BR.baseRef(lo.rec), editedAt: nowIso(env) }, _from: stampOf(sheet, section, id, lo.rec, env) });
  }
  function nowIso(env) { return new Date(env.now ? env.now() : Date.now()).toISOString(); }

  // offers (R-M13L-4): per own record. Never applied here: the page offers and the player chooses. A gone source still resolves,
  // because the copy is whole. A held sheet's lower stack cannot be read, so its copies stay `current` and carry `held`.
  function offers(sheet, env) {
    var out = [], secs = (sheet && sheet.own && sheet.own.sections) || {};
    Object.keys(secs).forEach(function (section) {
      Object.keys(secs[section] || {}).forEach(function (id) {
        var rec = secs[section][id], row = { section: section, id: id, state: 'current', from: (rec && rec._from) || null, lower: null };
        if (rec && rec._mode === 'redefine') {
          var lo = lowerRecord(sheet, section, id, env);
          if (lo.held) row.held = true;
          else if (!lo.rec) row.state = 'gone';
          else if (env.BR.baseRef(lo.rec) !== (rec._base && rec._base.ref)) { row.state = 'updated'; row.lower = lo.rec; }
        }
        out.push(row);
      });
    });
    return out;
  }

  // ── items: what a patch changes, as ids (R-M13L-9) ─────────────────────────────────────────────────────────────────
  function diffMap(part, a, b, flags, out) {
    a = isObj(a) ? a : {}; b = isObj(b) ? b : {};
    Object.keys(a).concat(Object.keys(b).filter(function (k) { return !own(a, k); })).forEach(function (k) {
      if (same(a[k], b[k])) return;
      var op = !own(a, k) ? 'add' : !own(b, k) ? 'remove' : (flags && flags.modify ? 'modify' : 'set');
      var it = { part: part, op: op, ref: k, before: own(a, k) ? a[k] : null, after: own(b, k) ? b[k] : null };
      if (flags && flags.offBook) it.offBook = true;
      out.push(it);
    });
  }
  function byId(list) { var o = {}; (Array.isArray(list) ? list : []).forEach(function (e) { if (e && e.id) o[e.id] = e; }); return o; }
  function itemsOf(sheet, patch) {
    var out = [];
    Object.keys(GROUPS).forEach(function (part) {
      var keys = GROUPS[part], touched = keys.some(function (k) { return own(patch, k) && !same(patch[k], sheet[k]); });
      if (!touched) return;
      var before = {}, after = {};
      keys.forEach(function (k) { before[k] = sheet[k] === undefined ? null : sheet[k]; after[k] = own(patch, k) ? patch[k] : before[k]; });
      out.push({ part: part, op: 'set', ref: after[keys[0]] || before[keys[0]], before: before, after: after });
    });
    Object.keys(patch).forEach(function (k) {
      if (GROUPS.species.indexOf(k) >= 0 || GROUPS.career.indexOf(k) >= 0 || k === 'xp') return;
      if (MAP_KEYS[k]) return diffMap(MAP_KEYS[k], sheet[k], patch[k], null, out);
      if (k === 'mechanicTradeIds') {
        var was = sheet[k] || [], now = patch[k] || [];
        if (!same(was, now)) out.push({ part: 'trades', op: 'set', ref: now.filter(function (x) { return was.indexOf(x) < 0; }).concat(was.filter(function (x) { return now.indexOf(x) < 0; })).join('+'), before: sheet[k] === undefined ? null : sheet[k], after: now });
        return;
      }
      if (LIST_KEYS[k]) return diffMap(LIST_KEYS[k], byId(sheet[k]), byId(patch[k]), { modify: true }, out);
      if (k === 'looseTalents') return diffMap('talents', sheet[k], patch[k], { modify: true, offBook: true }, out);
      if (k === 'own') {
        var sa = (sheet.own && sheet.own.sections) || {}, sb = (patch.own && patch.own.sections) || {};
        Object.keys(sa).concat(Object.keys(sb).filter(function (s) { return !own(sa, s); })).forEach(function (s) { diffMap('own.' + s, sa[s], sb[s], { modify: true, offBook: true }, out); });
        return;
      }
      if (k === 'speciesOptionPicks' && !same(sheet[k], patch[k])) {   // R-M13B-121: `ref` names the groups that moved, so an entry that has lost before/after still reads by name
        var p0 = sheet[k] || {}, p1 = patch[k] || {};
        out.push({ part: k, op: 'set', ref: Object.keys(p1).filter(function (s) { return !same(p0[s], p1[s]); }).join('+') || k, before: sheet[k] === undefined ? null : sheet[k], after: patch[k] === undefined ? null : patch[k] });
        return;
      }
      if (!same(sheet[k], patch[k])) out.push({ part: k, op: 'set', ref: k, before: sheet[k] === undefined ? null : sheet[k], after: patch[k] === undefined ? null : patch[k] });
    });
    return out;
  }

  // ── free ranks (f100-m13-reach-paper §4): freeRanksOf is the one reader; a moved pick moves a rank (R-M13R-2) ──
  function withBase(view, env) { return Object.assign({}, env.base, view); }
  function vb(sheet, env) { return withBase(viewFor(sheet, env) || env.base, env); }
  function labelsOf(rec, key) { return [rec.career || []].concat(Object.keys(rec.specs || {}).map(function (id) { return rec.specs[id]; })).reduce(function (n, l) { return n + l.filter(function (k) { return k === key; }).length; }, 0); }
  function recordOf(rec) { return { career: rec.career, specs: rec.specs }; }
  // a draft that doesn't name the record keeps the sheet's labels, so a stepper can't re-derive them
  function freeAcross(sheet, next, env) {
    var a = env.CR.freeRanksOf(sheet, vb(sheet, env));
    return { a: a, b: env.CR.freeRanksOf(Object.assign({}, next, { freeRanks: isObj(next.freeRanks) ? next.freeRanks : recordOf(a) }), vb(next, env)) };
  }
  function canon(v) { return Array.isArray(v) ? v.map(canon).sort() : isObj(v) ? Object.keys(v).sort().map(function (k) { return [k, canon(v[k])]; }) : v; }
  function eq(a, b) { return same(canon(a), canon(b)); }
  function freeOf(sheet, env) { return env.CR.freeRanksOf(sheet, vb(sheet, env)); }
  function named(patch, sheet, vals, env) {
    var out = Object.assign({}, patch);
    Object.keys(vals).forEach(function (k) { if (eq(vals[k], sheet[k])) delete out[k]; else out[k] = vals[k]; });
    // an old character's own reading is no change
    if (own(out, 'freeRanks') && !isObj(sheet.freeRanks) && !own(out, 'careerId') && !own(out, 'specializations') && eq(out.freeRanks, recordOf(freeOf(sheet, env)))) delete out.freeRanks;
    return out;
  }
  function draftRec(sheet, patch, env) { return clone(recordOf(freeAcross(sheet, apply(sheet, patch), env).b)); }
  function rankBy(skills, key, d) { var v = Math.max(0, (Number(skills[key]) || 0) + d); if (v > 0) skills[key] = v; else delete skills[key]; }
  // → { reconstructed, pools: [{ id, title, of, used, keys, eligible, cite }], marks, lines: [{ key, from, to, off }] }
  function freePools(sheet, patch, env) {
    var eff = apply(sheet, patch), view = vb(eff, env), both = freeAcross(sheet, eff, env), rec = both.b, allow = env.CR.creationSkillAllowance(eff, view), pools = [], cite = FREE_CITES[bookOf(eff)] || FREE_CITES.eote;
    var cs = view.careers || {}, carId = (eff.careerId && cs[eff.careerId]) ? eff.careerId : Object.keys(cs).filter(function (k) { return cs[k].name === eff.career; })[0];
    var specs = Array.isArray(eff.specializations) ? eff.specializations : [], holder = Object.keys(rec.specs).filter(function (id) { return rec.specs[id].length; })[0] || (specs[0] && specs[0].id);
    if (carId) pools.push({ id: 'career', title: cs[carId].name, of: allow.careerPicks, used: rec.career.length, keys: rec.career, eligible: allow.careerEligible, cite: cite[1] });
    if (holder && view.specializations[holder]) {
      var al = env.CR.creationSkillAllowance(Object.assign({}, eff, { specializations: specs.filter(function (e) { return e && e.id === holder; }) }), view);
      pools.push({ id: holder, title: view.specializations[holder].name, of: al.specPicks, used: (rec.specs[holder] || []).length, keys: rec.specs[holder] || [], eligible: al.specEligible, cite: cite[2] });
    }
    var marks = {}, lines = [];
    Object.keys(Object.assign({}, eff.skills, sheet.skills)).forEach(function (k) {
      var l0 = labelsOf(both.a, k), l1 = labelsOf(rec, k), s0 = Number((sheet.skills || {})[k]) || 0, s1 = Number((eff.skills || {})[k]) || 0;
      if (l1) marks[k] = l1;
      if (l0 !== l1 && s0 !== s1) lines.push({ key: k, from: s0, to: s1, off: l1 < l0 });
    });
    return { reconstructed: !!both.a.reconstructed && !own(patch, 'freeRanks'), pools: pools, marks: marks, lines: lines };
  }
  function moveFree(sheet, patch, pool, key, env) {
    var rec = draftRec(sheet, patch, env), list = pool === 'career' ? rec.career : (rec.specs[pool] = rec.specs[pool] || []), at = list.indexOf(key), skills = Object.assign({}, apply(sheet, patch).skills);
    if (at >= 0) list.splice(at, 1); else list.push(key);
    rankBy(skills, key, at >= 0 ? -1 : 1);
    if (pool !== 'career' && !list.length) delete rec.specs[pool];
    return named(patch, sheet, { skills: skills, freeRanks: rec }, env);
  }
  // R-M13R-5: a career change retracts the old picks; back on the sheet's own career, its picks return
  function careerDraft(sheet, patch, careerId, name, env) {
    var rec = draftRec(sheet, patch, env), skills = Object.assign({}, apply(sheet, patch).skills);
    rec.career.forEach(function (k) { rankBy(skills, k, -1); });
    rec.career = careerId === sheet.careerId ? freeOf(sheet, env).career.slice() : [];
    rec.career.forEach(function (k) { rankBy(skills, k, 1); });
    return named(patch, sheet, { careerId: careerId, career: name, skills: skills, freeRanks: rec }, env);
  }
  // R-M13R-25: a specialization leaving takes its picks and their ranks; R-M13R-35: one arriving asks nothing
  function specsDraft(sheet, patch, list, env) {
    var rec = clone(own(patch, 'freeRanks') ? patch.freeRanks : recordOf(freeOf(sheet, env))), skills = Object.assign({}, apply(sheet, patch).skills), ids = list.map(function (e) { return e && e.id; });
    Object.keys(rec.specs).forEach(function (id) { if (ids.indexOf(id) < 0) { rec.specs[id].forEach(function (k) { rankBy(skills, k, -1); }); delete rec.specs[id]; } });
    return named(patch, sheet, { specializations: list, skills: skills, freeRanks: rec }, env);
  }
  // ── trades and the game line (§5, §6): tradeDeltas is the one path from a trade to numbers ──
  var TRACKS = { eote: 'obligation', aor: 'duty', fad: 'morality' }, ZERO = { valueDelta: 0, xpDelta: 0, creditsDelta: 0 };
  function trackOf(sheet) { return TRACKS[bookOf(sheet)]; }
  function deltasOf(sheet, env) { return env.CR.tradeDeltas(trackOf(sheet), (sheet && sheet.mechanicTradeIds) || [], env.NM); }
  function dealt(sheet, env) { return deltasOf(sheet, env) || ZERO; }
  function tradeMove(sheet, next, env) {
    var a = dealt(sheet, env), b = dealt(next, env);
    return { xp: b.xpDelta - a.xpDelta, credits: b.creditsDelta - a.creditsDelta, value: b.valueDelta - a.valueDelta };
  }
  // §5.2: with entries the move lands on the first, then the next; `value` stays their sum. Morality clamps to 0–100.
  function trackMoved(track, d, mech) {
    var t = Object.assign({}, track || { type: '', value: 0, description: '' });
    if (Array.isArray(t.entries) && t.entries.length) {
      var left = d;
      t.entries = t.entries.map(function (e) { var m = (Number(e.magnitude) || 0) + left; left = m < 0 ? m : 0; return Object.assign({}, e, { magnitude: Math.max(0, m) }); });
      t.value = t.entries.reduce(function (n, e) { return n + e.magnitude; }, 0);
    } else t.value = (Number(t.value) || 0) + d;
    if (mech === 'morality') t.value = Math.min(100, Math.max(0, t.value));
    return t;
  }
  // R-M13B-114, -115: a species option's pick as one set of draft values: the pick, its grants and any skill choice (`ranks`, written with it or not at all), and the characteristics it moves.
  // No `ranks`: a choice the record already holds stays, unless the option it belonged to is the one being replaced.
  function speciesPickVals(sheet, patch, rec, slug, ids, ranks, skillKeys, env) {
    var eff = apply(sheet, patch);
    if (ranks == null) ranks = optionHoldsChoice(rec, slug, (eff.speciesOptionPicks || {})[slug]) ? {} : speciesChosenRanks(sheet, patch, rec, skillKeys, env);
    var ask = env.CR.speciesAskPatch(eff, rec, slug, ids, skillKeys, ranks);
    var moved = env.CR.speciesPickCharacteristics(sheet.characteristics || {}, eff.characteristics || {}, rec, sheet.speciesOptionPicks, eff.speciesOptionPicks, ask.speciesOptionPicks);
    return Object.assign({}, ask, { characteristics: moved.characteristics });
  }
  function optionHoldsChoice(rec, slug, have) {
    var ids = [].concat(have == null ? [] : have), held = false;
    ((rec && rec.option_choices) || []).forEach(function (oc) {
      (oc.options || []).forEach(function (o) { if (ids.indexOf(o.id) >= 0 && o.skill_choice_grants && String(oc.name || 'group').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') === slug) held = true; });
    });
    return held;
  }
  // R-M13B-115: the ranks a skill choice holds: what `speciesGrantApplied` marks, less what the picks grant by themselves. Derived, with no marker stored.
  function speciesChosenRanks(sheet, patch, rec, skillKeys, env) {
    var eff = apply(sheet, patch), fixed = env.CR.speciesSkillGrants(rec, eff.speciesOptionPicks, skillKeys || {}), applied = eff.speciesGrantApplied || {}, out = {};
    Object.keys(applied).forEach(function (k) { var n = (Number(applied[k]) || 0) - (Number(fixed[k]) || 0); if (n > 0) out[k] = n; });
    return out;
  }
  // R-M13B-116, -119: a species change leaves no stale pick. What the old species' picks granted comes off; going back to the sheet's own species restores its picks.
  // Characteristics lose only this draft's move: a change of species moves no characteristic by itself, as before this lap.
  function speciesChangeVals(sheet, patch, fromRec, id, env) {
    var eff = apply(sheet, patch), home = id === sheet.speciesId, vals = {}, skills = Object.assign({}, eff.skills), was = eff.speciesGrantApplied || {}, now = home ? (sheet.speciesGrantApplied || {}) : {};
    Object.keys(was).forEach(function (k) { var left = (Number(skills[k]) || 0) - (Number(was[k]) || 0); if (left > 0) skills[k] = left; else delete skills[k]; });
    Object.keys(now).forEach(function (k) { skills[k] = (Number(skills[k]) || 0) + (Number(now[k]) || 0); });
    if (!same(skills, eff.skills)) vals.skills = skills;
    [['speciesOptionPicks', {}], ['speciesOption', { picks: {}, xp: 0 }], ['speciesGrantApplied', {}], ['speciesSkillChoices', {}]].forEach(function (f) {
      if (home) vals[f[0]] = sheet[f[0]]; else if (!same(eff[f[0]], undefined) && !same(eff[f[0]], f[1])) vals[f[0]] = f[1];
    });
    if (fromRec) {
      var picksNext = sheet.speciesOptionPicks;
      vals.characteristics = env.CR.speciesPickCharacteristics(sheet.characteristics || {}, eff.characteristics || {}, fromRec, sheet.speciesOptionPicks, eff.speciesOptionPicks, picksNext).characteristics;
    }
    return vals;
  }
  // R-M13B-116: the career pick, through the one writer. `chosen` = { <poolId>: [ids] }; a pool it doesn't name keeps what the record holds.
  function careerPickVals(sheet, patch, rec, view, chosen, env) {
    var held = (apply(sheet, patch).speciesSkillChoices || {})[rec.id] || {};
    var groups = env.CR.speciesCareerPickGroups(rec, view);
    return { speciesSkillChoices: env.CR.speciesSkillChoicesFor(rec, groups, function (g) { var p = g.career_pick.poolId; return own(chosen, p) ? chosen[p] : (held[p] || []); }) };
  }
  function tradeDraft(sheet, patch, id, env) {
    var eff = apply(sheet, patch), mech = trackOf(eff), opts = env.NM.mechanics[mech].tradeOptions, cur = eff.mechanicTradeIds || [], on = cur.indexOf(id) >= 0;
    var ids = on ? cur.filter(function (x) { return x !== id; }) : (opts.mode === 'single_pick' ? [id] : cur.concat([id])), vals = { mechanicTradeIds: ids };
    var from = bookOf(eff) === bookOf(sheet) ? sheet : eff;   // from the sheet, so a clamp can't lose a point on the way back
    vals[mech] = trackMoved(from[mech], tradeMove(from, Object.assign({}, from, { mechanicTradeIds: ids, book: eff.book }), env).value, mech);
    return named(patch, sheet, vals, env);
  }
  // R-M13R-13: replace, don't stack; R-M13R-14: the Morality layer. asks = { value, type, strength, weakness }: the page's answers.
  function lineDraft(sheet, patch, book, asks, env) {
    var out = Object.assign({}, patch);
    ['book', 'mechanicTradeIds', 'obligation', 'duty', 'morality'].forEach(function (k) { delete out[k]; });
    if (book === bookOf(sheet)) return out;
    var vals = { book: book, mechanicTradeIds: [] }, old = trackOf(sheet), mech = TRACKS[book], next = apply(sheet, { book: book }), a = asks || {};
    vals[old] = null;
    if (old === 'morality' && sheet.morality && env.CR.sheetForceAccess(next, vb(next, env))) vals.morality = sheet.morality;
    var entry = { type: a.type || '', value: a.value, description: '' };
    if (mech === 'morality') {
      entry = Object.assign({}, sheet.morality || { type: '', value: env.NM.mechanics.morality.startingValueRule.startingValue, description: '' });
      ['type', 'strength', 'weakness'].forEach(function (k) { if (a[k]) entry[k] = a[k]; });
    } else entry.entries = [{ type: a.type || '', magnitude: a.value }];
    vals[mech] = entry;
    return Object.assign(out, vals);
  }
  // → what "What this changes" reads: the two accesses, the tracks either side, the money.
  function reach(sheet, patch, env) {
    var eff = apply(sheet, patch), m = tradeMove(sheet, eff, env), cr = Number((sheet.equipment || {}).credits) || 0;
    return { line: bookOf(eff) !== bookOf(sheet), trades: !eq(sheet.mechanicTradeIds || [], eff.mechanicTradeIds || []), xp: m.xp, credits: m.credits, creditsFrom: cr,
             accessA: env.CR.sheetForceAccess(sheet, vb(sheet, env)), accessB: env.CR.sheetForceAccess(eff, vb(eff, env)), past: pastCap(eff, env) };
  }
  // R-M13R-9, -41: the cap is a mark on Changes, not a refusal and not a note
  function pastCap(next, env) {
    var mech = trackOf(next), t = next[mech];
    return !!env.NM && !!t && !env.CR.computeMechanic(mech, (Number(t.value) || 0) - dealt(next, env).valueDelta, t.type || '', next.mechanicTradeIds || [], env.NM);
  }

  // ── price (R-M13L-8): every line through CharResolve.buildPrice; nothing here multiplies a rank ──────────────────
  function careerOf(sheet, view) { return (view.careers && sheet.careerId && view.careers[sheet.careerId]) || null; }
  function viewFor(sheet, env) { return env.CR.stampTalentView(sheet, env.base, env.M, env.UD); }
  // `free` (R-M13B-32): how many of the steps a species grant accounts for. They are the lowest ranks of the range.
  function rankSteps(a, b, one, free) {
    var t = 0, r, lo = Math.min(a, b) + (free || 0);
    for (r = a + 1; r <= b; r++) if (r > lo) t += one(r) || 0;
    for (r = a; r > b; r--) if (r > lo) t -= one(r) || 0;
    return t;
  }
  // A point a Dedication record accounts for is the talent's, not bought: it prices 0 both ways, and it stays off the creation value (eote p.134; R-M13B-57).
  function dedicationCount(sheet, view, key) {
    var n = 0, tcc = (sheet && sheet.talentCharacteristicChoices) || {}, reg = (view && view.specializations) || {};
    var ld = sheet && sheet.looseTalents && sheet.looseTalents.dedication, lp = ld && ld.picks && ld.picks[0];
    if (lp && lp.characteristicChoice === key) n++;
    (Array.isArray(sheet && sheet.specializations) ? sheet.specializations : []).forEach(function (e) {
      var tree = e && reg[e.id] && reg[e.id].talent_tree;
      (e && e.owned || []).forEach(function (pos) {
        var rc = String(pos).split('-'), cell = tree && tree[rc[0]] && tree[rc[0]].talents && tree[rc[0]].talents[rc[1]];
        if (cell && cell.talent === 'dedication' && tcc[e.id] && tcc[e.id][pos] === key) n++;
      });
    });
    return n;
  }
  function pickMoveOf(sheet, next, viewA, env) {
    var rec = viewA && viewA.species && next.speciesId && viewA.species[next.speciesId];
    return rec ? env.CR.speciesPickMove(rec, sheet.speciesOptionPicks, next.speciesOptionPicks) : {};
  }
  function dedicationSteps(sheet, next, viewB, viewA, key) { return Math.abs(dedicationCount(next, viewA, key) - dedicationCount(sheet, viewB, key)); }
  function grantOf(sheet, key) { return Number(sheet && sheet.speciesGrantApplied && sheet.speciesGrantApplied[key]) || 0; }
  // A rank the grant holds below the top of the range, or the ranks this very patch grants or retracts: raising reads the sheet after, lowering the sheet before.
  function grantedSteps(a, b, sheet, next, key) {
    var on = b > a ? grantOf(next, key) : grantOf(sheet, key), moved = Math.abs(grantOf(next, key) - grantOf(sheet, key));
    return Math.max(0, Math.min(Math.max(a, b), on) - Math.min(a, b), moved);
  }
  function cellsPrice(entry, rec, CR) {
    var tree = rec && rec.talent_tree, t = 0;
    (entry && entry.owned || []).forEach(function (pos) { t += CR.buildPrice('talent', { tree: tree, row: +String(pos).split('-')[0] }); });
    return t;
  }
  function powerXp(entry, view, ctx, CR) {
    if (!entry) return 0;
    var rec = view.forcePowers && view.forcePowers[entry.id];
    var basic = rec ? CR.buildPrice('force_basic', { rec: rec, ctx: ctx }) : null;
    return CR.buildPrice('force_entry', { id: entry.id, entry: Object.assign({}, entry, { cost: basic == null ? undefined : basic }), charbuild: view, ctx: ctx });
  }
  function bookOf(sheet) { return (sheet && typeof sheet.book === 'string') ? sheet.book.toLowerCase() : 'eote'; }
  function limitOf(kind, sheet) { var t = LIMIT_CITES[kind]; return t[bookOf(sheet)] || t.eote; }
  function priceItem(it, sheet, next, viewB, viewA, env, free) {
    var CR = env.CR, line = { part: it.part, ref: it.ref, op: it.op, book: 0 };
    if (it.offBook) line.offBook = true;
    if (it.part === 'characteristics') {
      var c0 = Number(it.before) || 0, c1 = Number(it.after) || 0;
      var dedFree = dedicationSteps(sheet, next, viewB, viewA, it.ref);
      // R-M13B-114: the part a species pick moved prices 0, takes no limit note and refunds nothing; a step on top of it prices as usual. Derived from the two picks.
      var from = Math.max(1, c0 + (pickMoveOf(sheet, next, viewA, env)[it.ref] || 0));
      line.book = rankSteps(from, c1, function (r) { return CR.buildPrice('characteristic', { rank: r }); }, dedFree);
      if (c1 > from + dedFree || c1 > CHARACTERISTIC_CAP) { line.pastLimit = true; line.limit = { kind: c1 > CHARACTERISTIC_CAP ? 'characteristic_cap' : 'characteristic_after_creation', cap: CHARACTERISTIC_CAP, cite: limitOf('characteristic', sheet) }; }
    } else if (it.part === 'skills') {
      var st = CR.careerSkillStatus(next, viewA), inCareer = !!(st[it.ref] && st[it.ref].career), s0 = Number(it.before) || 0, s1 = Number(it.after) || 0;
      var one = function (r) { return CR.buildPrice('skill', { rank: r, inCareer: inCareer }); };
      var bk = function (rank, free) { var t = 0; for (var r = free + 1; r <= rank; r++) t += one(r) || 0; return t; };   // R-M13R-3: the ranks above the free ones
      var g0 = grantOf(sheet, it.ref), g1 = grantOf(next, it.ref), l0 = labelsOf(free.a, it.ref), l1 = labelsOf(free.b, it.ref);
      line.book = (g0 !== g1 ? rankSteps(s0, s1, one, grantedSteps(s0, s1, sheet, next, it.ref)) : bk(s1, g0 + l0) - bk(s0, g0 + l0)) + bk(s1, g1 + l1) - bk(s1, g1 + l0);
      if (s1 > SKILL_CAP) { line.pastLimit = true; line.limit = { kind: 'skill_cap', cap: SKILL_CAP, cite: limitOf('skill', sheet) }; }
      else if (l1 > l0 && s1 > FREE_RANK_CAP) { line.pastLimit = true; line.limit = { kind: 'free_rank_cap', cap: FREE_RANK_CAP, cite: (FREE_CITES[bookOf(next)] || FREE_CITES.eote)[0] }; }   // R-M13R-4, R-M13R-40
    } else if (it.part === 'species' || it.part === 'career') {
      if (bookOf(next) !== 'aor') { line.pastLimit = true; line.limit = { kind: 'book_' + it.part, book: bookOf(next) }; }   // R-M13R-36
    } else if (it.part === 'specializations') {
      var reg0 = viewB.specializations || {}, reg1 = viewA.specializations || {};
      var at = function (list, id) { return (Array.isArray(list) ? list : []).map(function (e) { return e && e.id; }).indexOf(id); };
      var tree = function (entry, reg) { return cellsPrice(entry, reg[entry && entry.id], CR); };
      var entryPrice = function (entry, list, reg, sh, view) {
        return CR.buildPrice('specialization', { rec: reg[entry.id] || { id: entry.id }, ownedCount: at(list, entry.id), career: careerOf(sh, view) });
      };
      if (it.op === 'add') line.book = entryPrice(it.after, next.specializations, reg1, next, viewA) + tree(it.after, reg1);
      else if (it.op === 'remove') line.book = -(entryPrice(it.before, sheet.specializations, reg0, sheet, viewB) + tree(it.before, reg0));
      else line.book = tree(it.after, reg1) - tree(it.before, reg0);
    } else if (it.part === 'force_powers') {
      line.book = powerXp(it.after, viewA, CR.careerPowerPriceCtx(next, viewA), CR) - powerXp(it.before, viewB, CR.careerPowerPriceCtx(sheet, viewB), CR);
    } else if (it.part === 'signature_abilities') {
      var sig = function (e, view) { return e ? CR.buildPrice('signature', { state: { signatureAbilities: [e] }, charbuild: view, id: e.id }) : 0; };
      line.book = sig(it.after, viewA) - sig(it.before, viewB);
    } else if (it.part === 'talents') {
      line.book = (Number(it.after && it.after.xp) || 0) - (Number(it.before && it.before.xp) || 0);
    }
    return line;
  }
  // R-M13B-30, -31, -137: the species' effective starting XP, its option's delta included, after minus before. One rule for a change of species, of pick, and for the stepper's copy in `own`.
  function startingXpOf(sheet, view, env) {
    var rec = view.species && sheet.speciesId && view.species[sheet.speciesId];
    if (!rec) return null;
    var n = Number(env.CR.speciesEffective(rec, sheet.speciesOptionPicks).starting_xp) + env.CR.speciesOptionXpDelta(rec, sheet.speciesOptionPicks);
    return isNaN(n) ? null : n;
  }
  function priceItems(items, sheet, next, tracked, env) {
    var viewA = viewFor(next, env) || env.base, viewB = viewFor(sheet, env) || env.base, spent = 0;
    var free = items.some(function (it) { return it.part === 'skills'; }) ? freeAcross(sheet, next, env) : null;
    var lines = items.map(function (it) {
      var line = priceItem(it, sheet, next, viewB, viewA, env, free);
      line.xp = tracked ? line.book : 0;
      spent += line.xp;
      return line;
    });
    var x0 = startingXpOf(sheet, viewB, env), x1 = startingXpOf(next, viewA, env);
    var moved = (tracked && x0 != null && x1 != null) ? x1 - x0 : 0;
    if (moved) {
      var at = lines.filter(function (l) { return l.part === 'species'; })[0] || lines.filter(function (l) { return l.part === 'own.species'; })[0];
      if (at) at.total = moved;
    }
    var tm = tradeMove(sheet, next, env), tl = lines.filter(function (l) { return l.part === 'trades'; })[0] || lines.filter(function (l) { return l.part === 'book'; })[0];
    if (tl && tracked && tm.xp) tl.total = tm.xp;
    if (lines.some(function (l) { return l.part === 'trades'; }) && pastCap(next, env)) lines.filter(function (l) { return l.part === 'trades'; })[0].pastLimit = true;
    moved += tracked ? tm.xp : 0;
    return { xp: spent, total: moved, net: moved - spent, tracked: tracked, lines: lines, credits: tm.credits };
  }
  function trackedOf(opts) { return !(opts && opts.tracked === false); }
  function price(sheet, patch, opts, env) {
    return priceItems(itemsOf(sheet, patch), sheet, apply(sheet, patch), trackedOf(opts), env);
  }

  // §4.3: written by a Save that touches free ranks, career or specializations; a recorded character's dead keys go with any Save
  function freeRecorded(sheet, patch, env) {
    if (!isObj(sheet.freeRanks) && !own(patch, 'freeRanks') && !own(patch, 'careerId') && !own(patch, 'specializations')) return patch;
    if (!viewFor(sheet, env) || !viewFor(apply(sheet, patch), env)) return patch;
    var rec = recordOf(freeAcross(sheet, apply(sheet, patch), env).b), o = Object.assign({}, patch);
    if (same(rec, sheet.freeRanks)) delete o.freeRanks; else o.freeRanks = rec;
    return o;
  }

  // ── Save (R-M13L-7): one patch ─────────────────────────────────────────────────────────────────────────────────────
  function addCredits(sheet, d) { var eq0 = sheet.equipment || {}; return Object.assign({}, eq0, { credits: (Number(eq0.credits) || 0) + d }); }
  function refused(words) { return { ok: false, reasons: [].concat(words) }; }
  // R-M13R-51 R2: a patch that names a trade or the line is priced by the table, so without it nothing is half-done. Not a book limit (R-M13L-8).
  var NO_TABLE = 'The trade table didn\u2019t load, so this can\u2019t be priced. Try again.';
  function unpriced(sheet, patch, env) {
    if (!own(patch, 'mechanicTradeIds') && !own(patch, 'book')) return false;
    return !deltasOf(sheet, env) || !deltasOf(apply(sheet, patch), env);
  }
  // A characteristic edit moves the creation value by the same step, so the thresholds it feeds read it (computeDerived's brawnAtCreation).
  // A Dedication point is the exception: the book freezes thresholds at creation, so a record with no creation values is stamped before the raise, as buyTalent stamps it.
  function shiftedAtCreation(sheet, patch, env) {
    var at = sheet.characteristicsAtCreation;
    if (!isObj(patch.characteristics)) return null;
    var viewB = viewFor(sheet, env), viewA = viewFor(apply(sheet, patch), env), next = apply(sheet, patch);
    var free = function (k) { return viewB && viewA ? dedicationSteps(sheet, next, viewB, viewA, k) : 0; };
    if (!isObj(at)) return Object.keys(patch.characteristics).some(function (k) { return free(k) > 0; }) ? env.CR.creationCharacteristicsStamp(sheet) : null;
    var out = Object.assign({}, at), moved = false;
    Object.keys(patch.characteristics).forEach(function (k) {
      var d = (Number(patch.characteristics[k]) || 0) - (Number((sheet.characteristics || {})[k]) || 0), f = free(k);
      d = d > 0 ? Math.max(0, d - f) : Math.min(0, d + f);
      if (d && out[k] != null) { out[k] += d; moved = true; }
    });
    return moved ? out : null;
  }
  function ledger(sheet, patch, xpDelta, totalDelta) {
    var was = sheet.xp || {}, total = (own(patch.xp || {}, 'total') ? Number(patch.xp.total) || 0 : (Number(was.total) || 0)) + (totalDelta || 0);
    var spent = (Number(was.spent) || 0) + xpDelta;
    return { total: total, spent: spent, remaining: total - spent };
  }
  function strip(entry) {
    var out = Object.assign({}, entry);
    out.items = (entry.items || []).map(function (it) {
      var o = { part: it.part, op: it.op, ref: it.ref };
      if (it.offBook) o.offBook = true;
      if (it.pastLimit) o.pastLimit = true;
      return o;
    });
    return out;
  }
  function appendEntry(sheet, entry) {
    return (Array.isArray(sheet.changes) ? sheet.changes : []).map(strip).concat([entry]);
  }
  function entryId(env) {
    var rnd = env.rand || Math.random;
    return 'chg-' + (env.now ? env.now() : Date.now()).toString(36) + '-' + Math.floor(rnd() * 46656).toString(36);
  }
  function save(sheet, patch, opts, env) {
    opts = opts || {}; sheet = sheet || {}; patch = patch || {};
    var known = buildKeys(env);
    var bad = Object.keys(patch).filter(function (k) { return STORED_KEYS.indexOf(k) >= 0 || NOT_MODIFY.indexOf(k) >= 0 || known.indexOf(k) < 0; });
    if (bad.length) return refused('not a Modify field: ' + bad.join(', '));
    if (unpriced(sheet, patch, env)) return refused(NO_TABLE);
    if (patch.own) {
      if (!env.rail) return refused('the Homebrew validator has not loaded yet');
      var a = env.rail.authoring(patch.own, env.railCtx || env.rail.ctx);
      if (!a.ok) return refused(a.reasons);
    }
    var tracked = trackedOf(opts);
    patch = freeRecorded(sheet, patch, env);
    var items = itemsOf(sheet, patch);
    var xpIn = isObj(patch.xp) && own(patch.xp, 'total') && Number(patch.xp.total) !== Number((sheet.xp || {}).total);
    if (!items.length && !xpIn) return refused('nothing changed');

    var build = Object.assign({}, patch); delete build.xp;
    var at = shiftedAtCreation(sheet, patch, env);
    if (at) build.characteristicsAtCreation = at;
    var next = apply(sheet, build);
    var view = viewFor(next, env);
    if (!view) return refused('held');   // the held door keeps a Save from a view it cannot read (R-M13F-7)

    var p = priceItems(items, sheet, next, tracked, env);
    items.forEach(function (it, i) { if (p.lines[i].pastLimit) it.pastLimit = true; });

    var re = env.PD.reproject(next, view, null, { save: true, before: sheet });
    var out = Object.assign({}, build, { talents: re.sheet.talents, derivedBonuses: re.sheet.derivedBonuses, derivedConditional: re.sheet.derivedConditional });
    var spIds = env.CR.ownedSpecIds(next.specializationIds, next.specializations);
    if (spIds !== next.specializationIds) out.specializationIds = spIds;
    var spRec = view.species && next.speciesId && view.species[next.speciesId];
    if (spRec) {
      var eff = env.CR.speciesEffective(spRec, next.speciesOptionPicks);
      out.woundBase = eff.wound_threshold_base; out.strainBase = eff.strain_threshold_base;
    }
    if (own(sheet, 'derived')) out.derived = undefined;   // RETIRED on Save (B-1677): a snapshot floor would hold the old species' thresholds

    var xpNext = ledger(sheet, patch, p.xp, p.total);
    if (!same(xpNext, sheet.xp)) { out.xp = xpNext; items.push({ part: 'xp', op: 'set', ref: 'xp', before: sheet.xp === undefined ? null : clone(sheet.xp), after: xpNext }); }

    var cd = own(opts, 'creditsDelta') ? Number(opts.creditsDelta) || 0 : p.credits;   // §7.2: the log carries the delta, so a purchase in between survives Undo
    if (cd) { out.equipment = addCredits(sheet, cd); items.push({ part: 'credits', op: 'set', ref: 'credits', delta: cd }); }

    var stored = {}, storedBefore = {};
    STORED_KEYS.concat(['characteristicsAtCreation', 'specializationIds'], WHOLE_ON_UNDO).forEach(function (k) {
      if (own(out, k) && !same(out[k], sheet[k])) { stored[k] = out[k] === undefined ? null : out[k]; storedBefore[k] = sheet[k] === undefined ? null : sheet[k]; }
    });
    if (Object.keys(stored).length) items.push({ part: 'stored', op: 'set', ref: 'stored', before: clone(storedBefore) });   // Undo reads `before` alone; the record holds the rest

    var entry = { id: entryId(env), at: nowIso(env), tracked: tracked, xp: p.xp, total: p.total, net: p.net, items: clone(items), fpBefore: fingerprint(sheet, env), fpAfter: fingerprint(apply(sheet, out), env) };
    if (typeof opts.note === 'string' && opts.note) entry.note = opts.note;
    out.changes = appendEntry(sheet, entry);
    return { ok: true, patch: out, record: recordNames(sheet, out), entry: entry, price: p };
  }
  // The roster record's top-level names mirror the sheet's (the build unit's two top-level keys, R-M13L-11).
  function recordNames(sheet, patch) {
    var r = {};
    if (own(patch, 'species')) r.species = patch.species;
    if (own(patch, 'career')) r.career = patch.career;
    if (own(patch, 'book')) r.book = patch.book;
    return r;
  }

  // ── Undo (R-M13L-10): one deep, by appending the inverse ───────────────────────────────────────────────────────────
  function latest(sheet) { var c = Array.isArray(sheet && sheet.changes) ? sheet.changes : []; return c.length ? c[c.length - 1] : null; }
  function canUndo(sheet, env) {
    var e = latest(sheet);
    if (!e || e.undoes) return { ok: false, reason: null, entry: null };
    if (fingerprint(sheet, env) !== e.fpAfter) return { ok: false, reason: 'Can’t undo: ' + ((sheet && sheet.name) || 'this character') + ' changed since this save.', entry: e };
    return { ok: true, reason: null, entry: e };
  }
  function writeBack(patch, sheet, it) {
    var part = it.part, val = it.after;   // `it` is already the inverse: `after` is the value to restore
    if (part === 'stored' || GROUPS[part]) { Object.keys(val || {}).forEach(function (k) { patch[k] = val[k] === null ? undefined : val[k]; }); return; }
    if (part === 'xp') { patch.xp = val === null ? undefined : val; return; }
    if (part === 'trades') { patch.mechanicTradeIds = val === null ? undefined : val; return; }
    if (part === 'credits') { patch.equipment = addCredits(sheet, it.delta); return; }
    if (part === 'characteristics' || part === 'skills') {
      if (!own(patch, part)) patch[part] = clone(sheet[part]) || {};
      if (val === null) delete patch[part][it.ref]; else patch[part][it.ref] = val;
      return;
    }
    if (part === 'talents' || part === 'force_powers' || part === 'specializations' || part === 'signature_abilities' || part.indexOf('own.') === 0) return;   // in 'stored'
    patch[part] = val === null ? undefined : val;
  }
  function inverse(it) {
    var o = { part: it.part, op: it.op === 'add' ? 'remove' : it.op === 'remove' ? 'add' : it.op, ref: it.ref, before: it.after === undefined ? null : it.after, after: it.before === undefined ? null : it.before };
    if (it.delta) o.delta = -it.delta;
    if (it.offBook) o.offBook = true;
    if (it.pastLimit) o.pastLimit = true;
    return o;
  }
  function undo(sheet, env) {
    var can = canUndo(sheet, env);
    if (!can.ok) return refused(can.reason || 'nothing to undo');
    var e = can.entry, items = e.items.map(inverse), patch = {};
    items.forEach(function (it) { writeBack(patch, sheet, it); });
    if (unpriced(sheet, patch, env)) return refused(NO_TABLE);
    var entry = { id: entryId(env), at: nowIso(env), tracked: e.tracked, xp: -e.xp, total: -(e.total || 0), net: -(e.net != null ? e.net : -e.xp), items: clone(items), undoes: e.id, fpBefore: fingerprint(sheet, env), fpAfter: fingerprint(apply(sheet, patch), env) };
    patch.changes = appendEntry(sheet, entry);
    return { ok: true, patch: patch, record: recordNames(sheet, patch), entry: entry };
  }
  // ── the draft (R-M13L-12): device-local, never synced ──────────────────────────────────────────────────────────────
  function storeOf(store) { return store || (root && root.localStorage); }
  function readAll(store) { try { var v = storeOf(store).getItem(DRAFT_KEY); var o = v ? JSON.parse(v) : {}; return isObj(o) ? o : {}; } catch (e) { return {}; } }
  function writeAll(all, store) { try { storeOf(store).setItem(DRAFT_KEY, JSON.stringify(all)); return true; } catch (e) { return false; } }
  function readDraft(id, store) { var all = readAll(store); return own(all, id) ? all[id] : null; }
  function writeDraft(id, baseFp, patch, store, env) { var all = readAll(store); all[id] = { at: nowIso(env || {}), baseFp: baseFp, patch: patch }; return writeAll(all, store); }
  function dropDraft(id, store) { var all = readAll(store); if (own(all, id)) { delete all[id]; writeAll(all, store); } }
  // draftState(id, sheet, store, env) → { draft, stale }: a draft whose baseFp no longer matches is offered as "changed since", never applied silently.
  function draftState(id, sheet, store, env) {
    var d = readDraft(id, store);
    return { draft: d, stale: !!d && d.baseFp !== fingerprint(sheet, env) };
  }
  // rebase(prevSheet, nextSheet, patch) → { patch, clash } (R-M13B-151): another device's copy moved the sheet under an open draft. A value that didn't move
  // keeps the patch's; a MAP_KEYS map that moved keeps the player's own keys on the new map; a key both sides changed, or any other field that moved, is a clash,
  // and the patch comes back whole, for the stale offer. A moved list is a move: `eq` sorts lists, so this compares in order.
  function inOrder(v) { return Array.isArray(v) ? v.map(inOrder) : isObj(v) ? Object.keys(v).sort().map(function (k) { return [k, inOrder(v[k])]; }) : v; }
  function moved(a, b) { return !same(inOrder(a), inOrder(b)); }
  function rebase(prevSheet, nextSheet, patch) {
    var out = {}, clash = false;
    Object.keys(patch).forEach(function (k) {
      var was = prevSheet[k], now = nextSheet[k], mine = patch[k];
      if (!moved(was, now)) { out[k] = mine; return; }
      if (!MAP_KEYS[k] || !isObj(mine) || !isObj(now)) { clash = true; return; }
      var base = isObj(was) ? was : {}, merged = clone(now);
      Object.keys(Object.assign({}, base, mine)).forEach(function (key) {
        if (!moved(mine[key], base[key])) return;
        if (moved(now[key], base[key])) { clash = true; return; }
        if (own(mine, key)) merged[key] = mine[key]; else delete merged[key];
      });
      if (moved(merged, now)) out[k] = merged;
    });
    return clash ? { patch: patch, clash: true } : { patch: out, clash: false };
  }

  // R-M13R-40's rank note reads its cite here, the one table.
  function creationRankCite(sheet) { return (FREE_CITES[bookOf(sheet)] || FREE_CITES.eote)[0]; }
  var api = { speciesPickVals: speciesPickVals, speciesChosenRanks: speciesChosenRanks, speciesChangeVals: speciesChangeVals, careerPickVals: careerPickVals, creationRankCite: creationRankCite,OWN_PACK_ID: OWN_PACK_ID, OWN_ID_PREFIX: OWN_ID_PREFIX, DRAFT_KEY: DRAFT_KEY, envFromWindow: envFromWindow, ready: ready,
              fingerprint: fingerprint, buildKeys: buildKeys, draftFrom: draftFrom, price: price, save: save, freePools: freePools, moveFree: moveFree, careerDraft: careerDraft, specsDraft: specsDraft, tradeDraft: tradeDraft, lineDraft: lineDraft, reach: reach, trackOf: trackOf, canUndo: canUndo, undo: undo, offers: offers,
              emptyOwn: emptyOwn, newOwnId: newOwnId, addOwn: addOwn, ownCopy: ownCopy, withRecord: withRecord,
              readDraft: readDraft, writeDraft: writeDraft, dropDraft: dropDraft, draftState: draftState, rebase: rebase };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SWRPGModify = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
