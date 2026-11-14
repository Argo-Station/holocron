/**
 * projectionDiff.js — window.SWRPGProjectionDiff: is a sheet's PERSISTED talent projection stale against
 * the view it resolves through? (F-100; ruling f100-editor-contracts-2 R-EC2-6, brief C6; U-7.)
 *
 * The sheet persists three projections of its owned tree positions at the last buy (R-PFR-1, R-CS4d):
 * `talents` ({id, rank}), `derivedBonuses` and `derivedConditional`. An own pack is LIVE (G5), so an edit
 * to a specialization record the character owns moves the rendered tree while those three stay as
 * written. diff() recomputes them through the SAME shared-core producers the buy uses
 * (player/app.jsx buyTalent) and names what differs.
 *
 * PURE. reproject() is the write (R-EC2-6 (ii); ruling f100-m5-contracts C4.5): it RETURNS the next record and the
 * notice, and the sheet saves it through its normal save (player/app.jsx useProjectionTelling). eligible() is
 * R-EC2-6 (i), widened by C4.3 to talent records: only a spec or talent record supplied (or last supplied) by a LIVE
 * own-collection stamp this device holds is re-projectable; a frozen import never is, and a divergence from any other
 * source (a book change, a missing pack) is not this function's to fix.
 *
 * Needs charResolve.js (window.CharResolve / require). Dual-export, sources.js idiom.
 */
(function (root) {
  'use strict';

  function CRdep() {
    if (typeof root !== 'undefined' && root && root.CharResolve) return root.CharResolve;
    if (typeof module !== 'undefined' && module.exports && typeof require === 'function') return require('./charResolve.js');
    throw new Error('projectionDiff: CharResolve is not loaded (script order)');
  }
  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function jsonEq(a, b) { return JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b); }

  // The owned tree ids, position by position — buyTalent's ownedTalentIdsAll, over `data`.
  function ownedIds(specs, data) {
    var reg = (data && data.specializations) || {}, ids = [];
    (specs || []).forEach(function (s) {
      var tree = reg[s && s.id] && reg[s.id].talent_tree;
      if (!tree) return;
      (s.owned || []).forEach(function (pos) {
        var rc = String(pos).split('-'), cell = tree[+rc[0]] && tree[+rc[0]].talents && tree[+rc[0]].talents[+rc[1]];
        if (cell && cell.talent) ids.push(cell.talent);
      });
    });
    return ids;
  }

  // projectSheet(sheet, data) → the three projections exactly as buyTalent writes them.
  function projectSheet(sheet, data) {
    var CR = CRdep();
    var specs = CR.resolveSheetSpecs(sheet, data);
    var ids = ownedIds(specs, data).concat(CR.looseTalentIds(sheet && sheet.looseTalents));   // F-100 M13 (R-M13L-6): the one path
    return {
      talents: CR.talentsFromOwnedPositions(specs, (data && data.specializations) || {}, sheet && sheet.looseTalents),
      derivedBonuses: CR.derivedBonusesFromTalents(ids, data && data.talents),
      derivedConditional: CR.conditionalTalentsFromOwned(ids, data && data.talents),
    };
  }

  // Which spec ids hold a position whose talent differs between the sheet's projection and `data`'s:
  // a cell-level compare is impossible from the persisted list alone (it is rank-collapsed), so a spec is
  // named when the persisted list does not contain its projected owned talents at the projected ranks.
  function divergingSpecs(sheet, data) {
    var CR = CRdep();
    var persisted = {};
    (sheet.talents || []).forEach(function (t) { if (t && t.id) persisted[t.id] = (persisted[t.id] || 0) + (t.rank || 1); });
    var out = [];
    CR.resolveSheetSpecs(sheet, data).forEach(function (s) {
      var mine = CR.talentsFromOwnedPositions([s], (data && data.specializations) || {});
      if (mine.some(function (t) { return (persisted[t.id] || 0) < (t.rank || 1); })) out.push(s.id);
    });
    return out;
  }

  // diff(sheet, data) → { stale, talents:{persisted, rendered, differing}, bonusFields:[…], conditional, specs:[…] }
  function diff(sheet, data) {
    sheet = sheet || {};
    var now = projectSheet(sheet, data);
    var key = function (t) { return t.id + '×' + (t.rank || 1); };
    var a = (sheet.talents || []).map(key), b = now.talents.map(key);
    var differing = a.filter(function (k) { return b.indexOf(k) === -1; }).length + b.filter(function (k) { return a.indexOf(k) === -1; }).length;
    var pb = isObj(sheet.derivedBonuses) ? sheet.derivedBonuses : {}, rb = isObj(now.derivedBonuses) ? now.derivedBonuses : {};
    var fields = {};
    Object.keys(pb).concat(Object.keys(rb)).forEach(function (k) { if (!jsonEq(pb[k], rb[k])) fields[k] = true; });
    var conditional = !jsonEq(sheet.derivedConditional || [], now.derivedConditional || []);
    var bonusFields = Object.keys(fields).sort();
    return {
      stale: differing > 0 || bonusFields.length > 0 || conditional,
      talents: { persisted: sheet.talents || [], rendered: now.talents, differing: differing },
      bonusFields: bonusFields, conditional: conditional,
      specs: divergingSpecs(sheet, data),
      rendered: now,
    };
  }

  // ── F-100 M5 C4.3 — which TALENT RECORDS explain a difference (U8's names) ─────────────────────────────────────
  // The persisted projection is a SUM, so a talent is named by what it can explain, never by guess: the fields that
  // differ (derivedBonuses keys, plus 'conditional'), and each owned talent's fields under `data`.
  //   changed  — an owned talent a LIVE own stamp supplies (supplier('talents', id)) that touches a differing field;
  //   restored — an owned talent NO stamp of the sheet supplies any more (opts.suppliedByAny false) and the book holds
  //              (opts.book), touching a differing field no changed talent covers: its house rule was deleted and the
  //              book stands in ("Your house rules no longer change Grit.").
  // `unexplained` lists the differing fields neither covers — a book update, a frozen import (C4.3: never ours).
  var DELTA_FIELD = { soak_delta: 'soakBonus', wound_threshold_delta: 'woundThresholdBonus', strain_threshold_delta: 'strainThresholdBonus',
                      force_rating_delta: 'forceRatingBonus' };
  function talentFields(id, talents) {
    var CR = CRdep(), out = {}, effs = [];
    try { effs = CR.talentEffectsOf(id, talents || {}) || []; } catch (e) { effs = []; }
    effs.forEach(function (e) {
      if (!e) return;
      if (e.when != null) { out.conditional = true; return; }
      if (e.op === 'defense_delta') out[e.target === 'melee' ? 'meleeDefenseBonus' : 'rangedDefenseBonus'] = true;
      else if (DELTA_FIELD[e.op]) out[DELTA_FIELD[e.op]] = true;
    });
    return out;
  }
  function attributeTalents(sheet, data, d, supplier, opts) {
    opts = opts || {};
    var fields = d.bonusFields.slice(); if (d.conditional) fields.push('conditional');
    var owned = [], seen = {};
    (sheet.talents || []).forEach(function (t) { if (t && t.id && !seen[t.id]) { seen[t.id] = true; owned.push(t.id); } });
    var talents = (data && data.talents) || {}, covered = {}, changed = [], restored = [];
    owned.forEach(function (id) {
      if (typeof supplier !== 'function' || !supplier('talents', id)) return;
      var f = talentFields(id, talents), hit = fields.filter(function (k) { return f[k]; });
      if (hit.length) { changed.push(id); hit.forEach(function (k) { covered[k] = true; }); }
    });
    var book = opts.book && opts.book.talents, any = opts.suppliedByAny;
    owned.forEach(function (id) {
      if (changed.indexOf(id) !== -1 || !book || !Object.prototype.hasOwnProperty.call(book, id)) return;
      if (typeof any === 'function' && any('talents', id)) return;
      var f = talentFields(id, talents), hit = fields.filter(function (k) { return f[k] && !covered[k]; });
      if (hit.length) restored.push(id);
    });
    restored.forEach(function (id) { var f = talentFields(id, talents); fields.forEach(function (k) { if (f[k]) covered[k] = true; }); });
    return { changed: changed, restored: restored, unexplained: fields.filter(function (k) { return !covered[k]; }) };
  }

  // eligible(d, supplier[, sheet, data, opts]) — R-EC2-6 (i), WIDENED by ruling f100-m5-contracts C4.3: re-projectable iff
  // the sheet is stale AND every diverging spec is supplied by a LIVE own-collection stamp this device holds AND every
  // differing talent field is explained by a talent record such a stamp supplies (or last supplied — `restored`). A
  // frozen import is never eligible (liveOwnSupplier never answers for one), nor is a book change. The two-argument
  // form (no sheet) keeps its spec-only reading exactly.
  function eligible(d, supplier, sheet, data, opts) {
    if (!d || !d.stale || typeof supplier !== 'function') return false;
    // C5.2's deleted specialization: its tree is gone from `data`, so its positions cannot be re-projected and a write
    // would DROP the talents it holds (case 6: "the talents are kept and work"). Never re-projectable; the render reads
    // the persisted talent list and keeps them working.
    if (sheet && (sheet.specializations || []).some(function (s) { return s && s.id && !((data && data.specializations) || {})[s.id]; })) return false;
    if (!d.specs.every(function (id) { return !!supplier('specializations', id); })) return false;
    if (!sheet) return d.specs.length > 0;
    if (d.specs.length) return true;   // a tree change moves talents, and with them their fields: the tree explains them
    var a = attributeTalents(sheet, data, d, supplier, opts);
    if (!a.changed.length && !a.restored.length) return false;
    if (a.restored.length && !(opts && opts.holdsLiveOwn)) return false;
    return a.unexplained.length === 0;
  }

  // projectedFields(d) — THE ONE RE-PROJECTION STEP (R-M13L-7/-19): a diff's three persisted fields as they render. reproject, packAttach's two
  // plans and the Save all write them through here; none copies it.
  function projectedFields(d) {
    return { talents: d.rendered.talents, derivedBonuses: d.rendered.derivedBonuses, derivedConditional: d.rendered.derivedConditional };
  }

  // reproject(sheet, data, supplier[, opts]) → { sheet, notice } or null — THE WRITE (ruling f100-m5-contracts C4.5,
  // RATIFIED; R-EC2-6 (ii)). On an eligible difference, the three persisted projections are re-projected through `data`
  // (the sheet's stamp view, the buy's own producers) and returned as the next record; positions, XP and everything else
  // untouched (F24). notice = { kind: 'changed', specs: [spec ids], talents: [talent ids], restored: [talent ids] }; the
  // words are the frames' (U8; C6's count-level "Changed"). Pure: the caller saves it through the sheet's normal save.
  // opts: { book: the pristine base view, suppliedByAny(section, id): any stamp of the sheet supplies it,
  //         holdsLiveOwn: the sheet carries a live own stamp this device holds }.
  // opts.save (F-100 M13 R-M13L-19; only SWRPGModify passes it): the player's own Save, so `eligible` is not its question; `talents`
  // go through talentsKeepingAbsentTrees over opts.before (the record before this Save) so a deleted tree's talents are kept.
  function reproject(sheet, data, supplier, opts) {
    sheet = sheet || {};
    var d = diff(sheet, data);
    if (!(opts && opts.save) && !eligible(d, supplier, sheet, data, opts)) return null;
    var a = (opts && opts.save) ? { changed: [], restored: [] } : attributeTalents(sheet, data, d, supplier, opts);
    var next = {}, k;
    for (k in sheet) if (Object.prototype.hasOwnProperty.call(sheet, k)) next[k] = sheet[k];
    Object.assign(next, projectedFields(d));
    if (opts && opts.save) {
      var CR = CRdep(), reg = (data && data.specializations) || {}, was = opts.before || sheet, after = CR.resolveSheetSpecs(sheet, data), before = CR.resolveSheetSpecs(was, data);
      var gone = function (s) { return s && s.id && !(reg[s.id] && reg[s.id].talent_tree); };
      // A deleted tree the player removes in this Save (R-M13F-8) takes its talents with it: they are unattributable, and nothing else can name them.
      var removedDeleted = before.some(function (s) { return gone(s) && !after.some(function (x) { return x && x.id === s.id; }); });
      if (!removedDeleted) next.talents = CR.talentsKeepingAbsentTrees(was.talents || [], before, after, reg, sheet.looseTalents, was.looseTalents, true);
    }
    return { sheet: next, notice: { kind: 'changed', specs: d.specs.slice(), talents: a.changed.slice(), restored: a.restored.slice() } };
  }

  // tellingInputs(sheet, UD, M, book) → { supplier, opts } for reproject, from the user store `UD` and SWRPGMods `M`:
  // the live own supplier (R-EC2-6 (i)), whether ANY stamp of the sheet supplies a record (a frozen import included — its
  // records are never "restored"), and whether the sheet carries a live own stamp this device holds.
  function tellingInputs(sheet, UD, M, book) {
    var mods = (sheet && Array.isArray(sheet.mods)) ? sheet.mods : [];
    var users = mods.filter(function (m) { return typeof m === 'string' && m.indexOf('user:') === 0; });
    var packOf = function (m) { try { return (UD && typeof UD.stampSync === 'function') ? UD.stampSync(m) : null; } catch (e) { return null; } };
    return {
      supplier: (UD && typeof UD.liveOwnSupplier === 'function') ? UD.liveOwnSupplier(mods) : function () { return null; },
      opts: {
        book: book || null,
        suppliedByAny: function (section, id) {
          return users.some(function (m) { var pk = packOf(m); return !!(pk && pk.sections && pk.sections[section] && Object.prototype.hasOwnProperty.call(pk.sections[section], id)); });
        },
        holdsLiveOwn: users.some(function (m) { var ps = M && M.parseUserStamp ? M.parseUserStamp(m) : null; return !!(ps && ps.instance && !ps.version && packOf(m)); }),
      },
    };
  }

  var api = { projectSheet: projectSheet, diff: diff, eligible: eligible, reproject: reproject, projectedFields: projectedFields, attributeTalents: attributeTalents, tellingInputs: tellingInputs };
  if (typeof root !== 'undefined' && root) root.SWRPGProjectionDiff = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
