/**
 * qualityRows.js — THE ONE READER of a weapon's quality rows (B-219; ruling `f100-b219-card` ADDENDUM 1).
 *
 * A quality that changes the wielder's OWN roll (the census's ROLL class, brief `f100-b219-census`) carries its rows on
 * its qualities.vocab.json entry, written per ONE rating (R-B219C-6; scripts/canonical/apply_quality_rows.py). This
 * module reads them off the RESOLVED weapon — its `_qualitiesRaw`, after attachments (R-B1185) — and scales each by the
 * weapon's rating; an unrated quality reads 1. It lives here, beside poolMods.js, and never inline in player/app.jsx,
 * so a later path (the Yard's gunner seat, the GM's NPC rows) calls the same core (R-B219C-6's rider).
 *
 * WHAT IT RETURNS IS poolMods' OWN SHAPE. `poolRows` gives entries `SWRPGPoolMods.augment` folds and `reminders` offers,
 * stamped with the attack's own skill anchor (the rows carry none: "while using this weapon" is the anchor). They JOIN
 * ONE call's mods — computeWeaponPool's — and never enter collectPoolMods: a stock Dueling Pistol and one with a Custom
 * Grip are two copies of one weapons.json record, so a shared list would leak one's Accurate onto the other.
 * `rollSources` gives `SWRPGPoolMods.rollNumbersAt` its `owned` shape (the weapon as the owner), for Vicious at the
 * moment `critical_inflicted` (R-B219C-10). No surface asks for it yet (R-M9E-7).
 *
 * THE DEFICIT (R-B219C-7). A row with `count_of: {of: rating_deficit, key}` numbers count × max(0, rating − the owner's
 * characteristic `key`), read from the sheet as computeWeaponPool reads it. A deficit of 0 drops the row.
 *
 * THE OFFER (R-B219C-8, re-sourced by F-100 M12 B-1204). A reduction the app CAN subtract is applied before this reads
 * the weapon (QR1 `qualities_reduce`: the harness, the sling and the gyrostabilizer in ItemResolve.applyInstalledAttachments;
 * Burly in applyCharacterEffects), so the rating here is already the lowered one. A reduction its page makes CONDITIONAL
 * (the bipod: braced, EotE p.188; the tripod: set up, p.193) is not applied: it rides the resolved weapon on
 * `_qualityOffers`, and that quality's rows are OFFERED, never applied — M8's existing row, a certified entry with a
 * condition, named for its source. The data names the reducers; R-B219C-8's trigger table (CUMBERSOME_REDUCERS) is
 * retired (f100-m12-build-card R-M12B-8, ADDENDUM 14 R-M12B-42).
 *
 * GRANTED DAMAGE (R-B219C-14 (2)). `damageRows` gives Superior's +1 (Inferior's −1) ONLY for a quality an attachment
 * granted: a printed profile already includes it. computeWeaponPool carries it as `spec.qualityDamage`; the hub adds it to
 * the damage it prints, with its "Damage 6 → 7 — Superior" line.
 *
 * TOTAL OVER A MISSING VOCABULARY: no vocabulary (or a legacy weapon with no `_qualitiesRaw`) → no rows, as every
 * pool-mods helper is total over a missing module. Pure; no DOM. Dual-export (window.SWRPGQualityRows / CommonJS).
 */
(function () {
  'use strict';

  // R-B219C-14 (2): a quality's damage change, added ONLY where an attachment GRANTS the quality — a printed profile already
  // carries its own (the profile already counts Superior's damage; ADDENDUM 2 read the four
  // tables). No granting attachment carries its own +1 (superior_weapon_customization, superior_hilt_personalization: a
  // bare quality_add), so nothing doubles. Native Inferior keeps its printed number (R-B219C-14 (3), RAW-silent, reported);
  // no attachment grants Inferior today, so its row has no user.
  var GRANTED_DAMAGE = {
    superior: { amount: 1, cite: 'EotE p.157' },
    inferior: { amount: -1, cite: 'EotE p.156' },
  };

  // the vocabulary by id, from what a host holds: the entries array, or `window._qualitiesDb` (label/alias → entry)
  function byId(vocab) {
    if (!vocab) return null;
    if (byId._src === vocab) return byId._idx;
    var idx = {}, list = Array.isArray(vocab) ? vocab : (Array.isArray(vocab.entries) ? vocab.entries : Object.keys(vocab).map(function (k) { return vocab[k]; }));
    list.forEach(function (e) { if (e && e.id && !idx[e.id]) idx[e.id] = e; });
    byId._src = vocab; byId._idx = idx;
    return idx;
  }
  function ratingOf(q) {
    var n = Number(q && q.rank);
    return isFinite(n) && n > 0 ? n : 1;
  }
  function sourceOf(entry, q) {
    var label = (entry && entry.label) || (q && (q.name || q.id)) || '';
    return (q && q.rank != null && Number(q.rank) > 0) ? label + ' ' + Number(q.rank) : label;
  }
  function weaponQualities(weapon) {
    return weapon && Array.isArray(weapon._qualitiesRaw) ? weapon._qualitiesRaw : [];
  }
  // the conditional reducers this resolved weapon carries for quality `key` → [{name, cite}] (B-1204: from the data,
  // `_qualityOffers`, which applyInstalledAttachments writes for a `qualities_reduce` row with a `condition`)
  function reducersOn(weapon, key) {
    var offers = weapon && Array.isArray(weapon._qualityOffers) ? weapon._qualityOffers : [];
    return offers.filter(function (o) { return o && o.key === key; })
      .map(function (o) { return { name: o.source, cite: o.cite ? _citeWords(o.cite) : null }; });
  }
  var BOOK_SHORT = { eote: 'EotE', aor: 'AoR', fad: 'FaD' };
  // B-336 attachments wave (ADDENDUM 62 condition 1): a book that is not a core short prints its TITLE through the shared
  // resolver, never a raw key ("special_modifications p.54"); with no index up (node, a cold load) the stored string.
  function _bookWords(b) {
    if (BOOK_SHORT[b]) return BOOK_SHORT[b];
    var S = typeof window !== 'undefined' && window.SWRPGSources, c = S && S.current ? S.current() : null;
    return (c && c.index && S.sourceLabel) ? S.sourceLabel(c.index, b) : b;
  }
  // S1's one formatter (B-1809): the page's SWRPGSources, or in node its module.
  function _sources() {
    var S = typeof window !== 'undefined' ? window.SWRPGSources : null;
    if (!S && typeof require === 'function') { try { S = require('./sources.js'); } catch (e) { S = null; } }
    return S;
  }
  function _citeWords(c) { return _sources().pageCite(_bookWords(c.book), c.page); }
  function offerWords(reducers) {
    var names = reducers.map(function (r) { return r.name; });
    var cites = [];
    reducers.forEach(function (r) { if (r.cite && cites.indexOf(r.cite) === -1) cites.push(r.cite); });
    var who = names.length > 1 ? names.slice(0, -1).join(', ') + ' or ' + names[names.length - 1] : names[0];
    return 'unless ' + who + ' lowers it' + (cites.length ? ' (' + cites.join('; ') + ')' : '');
  }

  /**
   * The weapon's pool rows for ONE attack. `opts`:
   *   vocab           — the qualities vocabulary (entries, or the host's `_qualitiesDb` map);
   *   characteristics — the owner's sheet characteristics (`brawn`, `agility`), as computeWeaponPool reads them;
   *   ownedTalentIds  — accepted and unused since B-1204 (Burly is applied on the resolved weapon, not offered);
   *   anchor          — the attack's own check anchor, e.g. {scope: 'skill', value: 'ranged_light'}.
   * → [poolMods entry] with `source` "<Label> <rating>", `quality`, `rowId`; certified (`direction`); `condition` null,
   *   or the offer's words where R-B219C-8 makes it an offer.
   */
  function poolRows(weapon, opts) {
    opts = opts || {};
    var vocab = byId(opts.vocab), chars = opts.characteristics || {}, out = [];
    if (!vocab || !opts.anchor) return out;
    weaponQualities(weapon).forEach(function (q) {
      var e = q && vocab[q.id];
      if (!e || !Array.isArray(e.pool_mods)) return;
      var rating = ratingOf(q);
      e.pool_mods.forEach(function (row) {
        var times = rating;
        if (row.count_of) {
          if (row.count_of.of !== 'rating_deficit') return;   // a quality reads no other source (L1q.rows)
          times = Math.max(0, rating - (Number(chars[row.count_of.key]) || 0));
        }
        if (!(times > 0)) return;
        var m = { source: sourceOf(e, q), quality: e.id, rowId: row.id, count: (Number(row.count) || 0) * times,
                  direction: row.direction === undefined ? null : row.direction, condition: null, appliesTo: [opts.anchor] };
        if (row.symbol) m.symbol = row.symbol; else m.die = row.die;
        var reducers = reducersOn(weapon, e.id);
        if (reducers.length) m.condition = offerWords(reducers);
        out.push(m);
      });
    });
    return out;
  }

  // F-100 M12 QT1: an entry with `target_condition` (the droid variants) applies only against that kind of target —
  // `target` = {kind: 'droid' | 'vehicle' | …}. No target → it does not apply.
  function _targetFits(e, target) {
    if (!e || !e.target_condition) return true;
    return !!target && target.kind === e.target_condition.target_kind;
  }

  /** The weapon as an owner of roll numbers (Vicious): rollNumbersAt's `owned` shape, ranks = the weapon's rating.
   *  F-100 M12: a droid variant (Vicious (Droids), its base's rows under `target_condition`) counts only against a droid
   *  `opts.target` */
  function rollSources(weapon, opts) {
    opts = opts || {};
    var vocab = byId(opts.vocab), out = [];
    if (!vocab) return out;
    weaponQualities(weapon).forEach(function (q) {
      var e = q && vocab[q.id];
      if (!e || !Array.isArray(e.roll_numbers) || !e.roll_numbers.length) return;
      if (!_targetFits(e, opts.target)) return;
      out.push({ id: e.id, name: sourceOf(e, q), ranked: true, ranks: ratingOf(q), roll_numbers: e.roll_numbers });
    });
    return out;
  }

  /**
   * The base-damage changes of the qualities an ATTACHMENT granted this weapon (R-B219C-14 (2)): a quality on the resolved
   * weapon that its registry record (`native`, the record's own `qualities`) does not carry. → [{ quality, source, amount,
   * cite }]. A native quality, or a granted one already native, changes nothing.
   */
  function damageRows(weapon, native) {
    var had = {};
    (Array.isArray(native) ? native : []).forEach(function (q) { if (q && q.id) had[q.id] = true; });
    var out = [];
    weaponQualities(weapon).forEach(function (q) {
      var d = q && GRANTED_DAMAGE[q.id];
      if (!d || had[q.id]) return;
      out.push({ quality: q.id, source: (q.name || q.id), amount: d.amount, cite: d.cite });
    });
    return out;
  }

  // ── F-100 M12 · THE QUALITY MEMBERS' READERS (QS1–QS3, QM1, QT1) (R-M12F-8) ─────────────────────────────
  // The rows are the vocabulary's (scripts/canonical/apply_quality_members.py, f100-m12-build-card ADDENDUM 22), written per
  // ONE rating and read off the RESOLVED weapon (`_qualitiesRaw`, after attachments and talents). The engine PROPOSES; the
  // player taps (R-M12F-5): nothing here spends, rolls or writes. No app surface calls these yet — wiring them into the
  // spend menu, the dice hub's mode tick and a target's numbers is the surfacing mission's (D-124; R-M12C-58); in M12 their
  // consumer is their node guard, test/f100_m12_quality_readers.cjs.

  function _ad(clauses, fn) {
    return (clauses || []).map(function (c) {
      var o = {}; Object.keys(c).forEach(function (k) { o[k] = k === 'ad' ? fn(c[k]) : c[k]; }); return o;
    });
  }
  // A spend row's `effect` template, filled — the ONE filler (ruling f100-surfacing-hub-concept ADDENDUM 7, R2; the vocab's
  // `_meta.effect_tokens` and schema/quality.schema.json's `effect` say the same). `{field}` prints that `values` field;
  // `{field:noun}` prints the field and its noun, plural when the value is not 1 ("by 1 step" / "by 2 steps"). A token
  // whose field the row does not carry is left as written.
  function fillEffect(text, values) {
    return String(text || '').replace(/\{([a-z_]+)(?::([a-z]+))?\}/g, function (m, k, noun) {
      if (!values || !(k in values)) return m;
      var v = values[k];
      return noun ? String(v) + ' ' + (Number(v) === 1 ? noun : noun + 's') : String(v);
    });
  }
  // R3 (ruling f100-surfacing-hub-concept ADDENDUM 5): a mode's own words, from its registry fields — what Stun setting does
  // has no dice to say it ("damage dealt as strain; Short range at most", as frame H1 draws it). null when the mode says none.
  function modeWords(m) {
    var out = [];
    if (m && m.damage_as) out.push('damage dealt as ' + String(m.damage_as).replace(/_/g, ' '));
    if (m && m.range_max) out.push(String(m.range_max).charAt(0).toUpperCase() + String(m.range_max).slice(1) + ' range at most');
    return out.length ? out.join('; ') : null;
  }
  function _repeatMax(row, rating) {
    if (row.repeat === undefined) return 1;
    if (row.repeat === true) return null;                     // as often as it is paid
    if (row.repeat === 'rating') return rating;
    return Number(row.repeat) || 1;
  }

  /**
   * QS1 (+ QS2, QS3): the weapon's quality ACTIVATIONS for one check, as the spend menu would list them. `opts`:
   *   vocab   — the qualities vocabulary;
   *   when    — 'hit' | 'miss' (absent: both);
   *   modes   — the mode ids the wielder switched on before the check (QM1): a row naming a mode is listed only then;
   *   target  — {silhouette} when known: Knockdown's `req_add` is added per silhouette above 1; unknown → `reqAdd` rides.
   * QS2: the resolved weapon's `_spendCostDeltas` [{key, value, source}] (an attachment's `spend_cost_delta`) lower a
   *   matching quality's Advantage price by |value|, never below 1 (the floor is this reader's, the paper's §1); a `key:
   *   "any"` delta is NOT applied — the player names the quality at the spend menu (R-M12B-70) — and rides on `anyDeltas`.
   * QS3: `_spendEffectSets` [{key, field, amount, source}] (a talent's `spend_effect_set`, e.g. Sunder (Improved)) set that
   *   named `values` field; `{field}` in the effect text reads the result.
   * → [{ quality, source, rating, rowId, req, reqAdd, when, mode, repeatMax, effect, values, reads, cite, lowered[], set[] }]
   *   — `req` is spend_tables.json's clause list, so the menu's spendAfford(req, tally) reads it unchanged.
   */
  function spendRows(weapon, opts) {
    opts = opts || {};
    var vocab = byId(opts.vocab), out = [];
    if (!vocab) return out;
    var modes = Array.isArray(opts.modes) ? opts.modes : [];
    var deltas = weapon && Array.isArray(weapon._spendCostDeltas) ? weapon._spendCostDeltas : [];
    var sets = weapon && Array.isArray(weapon._spendEffectSets) ? weapon._spendEffectSets : [];
    var sil = opts.target && isFinite(Number(opts.target.silhouette)) ? Number(opts.target.silhouette) : null;
    weaponQualities(weapon).forEach(function (q) {
      var e = q && vocab[q.id];
      if (!e || !Array.isArray(e.spend) || !_targetFits(e, opts.target)) return;
      var rating = ratingOf(q);
      e.spend.forEach(function (row) {
        if (opts.when && row.when !== opts.when) return;
        if (row.mode && modes.indexOf(row.mode) === -1) return;
        var req = _ad(row.req, function (n) { return n; }), reqAdd = row.req_add || null;
        if (reqAdd && sil != null) {
          var more = reqAdd.ad * Math.max(0, sil - 1);
          req = _ad(req, function (n) { return n + more; });
          reqAdd = null;
        }
        var lowered = [];
        deltas.forEach(function (d) {
          if (!d || d.key !== e.id) return;
          var by = Math.abs(Number(d.value) || 0);
          if (!by) return;
          req = _ad(req, function (n) { return Math.max(1, n - by); });
          lowered.push({ by: by, source: d.source || null });
        });
        var values = row.values ? JSON.parse(JSON.stringify(row.values)) : null, set = [];
        sets.forEach(function (x) {
          if (!x || x.key !== e.id || !values || !(x.field in values)) return;
          values[x.field] = Number(x.amount);
          set.push({ field: x.field, amount: Number(x.amount), source: x.source || null });
        });
        var effect = fillEffect(row.effect, values);
        out.push({ quality: e.id, source: sourceOf(e, q), rating: rating, rowId: row.id, req: req, reqAdd: reqAdd, when: row.when,
          mode: row.mode || null, repeatMax: _repeatMax(row, rating), effect: effect, values: values, reads: row.reads || [],
          cite: row.cite || null, lowered: lowered, set: set,
          anyDeltas: deltas.filter(function (d) { return d && d.key === 'any'; }).map(function (d) { return { by: Math.abs(Number(d.value) || 0), source: d.source || null }; }) });
      });
    });
    return out;
  }

  // F-100 THE SURFACING MISSION (card f100-surfacing-roll-options-card R-SRO-3/4, ADDENDUM 8 F1/F8): the cores the talent
  // legs ask — CharResolve's owner walk and poolMods' ONE anchor rule — page globals, or sibling modules in node.
  function _cr() {
    var C = (typeof window !== 'undefined' && window.CharResolve) || null;
    if (!C && typeof require === 'function') { try { C = require('./charResolve.js'); } catch (e) { C = null; } }
    return C;
  }
  function _pm() {
    var P = (typeof window !== 'undefined' && window.SWRPGPoolMods) || null;
    if (!P && typeof require === 'function') { try { P = require('./poolMods.js'); } catch (e) { P = null; } }
    return P;
  }
  function _spanText(desc, w) {
    return w && typeof w.start === 'number' ? String(desc || '').slice(w.start, w.end).trim() : '';
  }
  // A5 (ruling argo-dataset-import-draft ADDENDUM 5 Q4 (b)): a talent whose description is blank (the open copy) reads its
  // row's span from the user's imported text only where spanOk holds over it (SWRPGSources.ruleTextSpan); '' otherwise and
  // always on holocron.work, so the row reads as before.
  function _talentSpanText(t, w) {
    var own = _spanText(t.description, w);
    if (own || !w || typeof w.start !== 'number') return own;
    var S = typeof window !== 'undefined' ? window.SWRPGSources : null;
    return String((S && S.ruleTextSpan && S.ruleTextSpan('talents', t.id, 'description', w)) || '').trim();
  }

  /**
   * V3 (R-SRO-3 as amended at ADDENDUM 8 F4/F11; D-294 L1): the owner's TALENT spend rows for one check — the menu's rows
   * beside spendRows', in spendRows' own shape so the ONE model (the hub's diceHubSpendModel) reads both: `quality` is the
   * talent id, so the row's key is `spend:<talentId>:<rowId>` (the drawn key). `ctx` = SWRPGPoolMods.contextFor(...) of the
   * check; a row is listed when its anchors match (`matches`, the one rule) and its `when` is `opts.when` or 'any' (absent
   * `opts.when`: every row). `effect` is the row's `words` span, trimmed (F4: no authored copy); `repeat: 'rating'` reads
   * the owned ranks (an unranked talent reads 1). `cost` / `limit` ride for the row's tags.
   */
  function talentSpendRows(sheet, charbuild, ctx, opts) {
    opts = opts || {};
    var C = _cr(), P = _pm(), out = [];
    if (!C || !P || !C.ownedTalentRowSources) return out;
    C.ownedTalentRowSources(sheet, charbuild, 'spend').forEach(function (t) {
      t.rows.forEach(function (row) {
        if (!row || !P.matches({ appliesTo: row.applies_to || null }, ctx)) return;
        if (opts.when && row.when !== 'any' && row.when !== opts.when) return;
        out.push({ talentId: t.id, quality: t.id, source: t.name, rating: t.ranked ? t.ranks : 1, rowId: row.id,
          req: row.req ? _ad(row.req, function (n) { return n; }) : null, reqAdd: null, when: row.when, mode: null,
          repeatMax: _repeatMax(row, t.ranked ? t.ranks : 1), effect: _talentSpanText(t, row.words), values: null, reads: [],
          cost: row.cost || null, limit: row.limit || null, cite: row.cite || null, words: row.words || null,
          lowered: [], set: [], anyDeltas: [] });
        if (row.who) out[out.length - 1].who = row.who;   // 5h brief §5: carried, read by ui.jsx offerWho only
      });
    });
    return out;
  }

  /**
   * V4 (R-SRO-4 as amended at ADDENDUM 8 F5/F6; D-294 L2): the owner's TARGET rows a matching check may take — ticks BEFORE
   * the roll, in the mode-tick place. `label` is DERIVED, never stored (F6): 'Deal as strain', + ' (+<skill name>)' when a
   * roll_numbers row of the same talent rides the tick (`when.ticked`) with `amount.of: skill_ranks` — Pressure Point reads
   * "Deal as strain (+Medicine)", Stunning Blow "Deal as strain". `key` = poolMods.offerKey({talentId, id}) — the key a
   * riding number's line is taken by (takeRollNumbers' `tickedBy`).
   * → [{ key, talentId, rowId, source, label, paired: [roll_numbers row ids], row }]
   */
  function talentTargetOffers(sheet, charbuild, ctx) {
    var C = _cr(), P = _pm(), out = [];
    if (!C || !P || !C.ownedTalentRowSources) return out;
    var talents = (charbuild && charbuild.talents) || {}, names = (charbuild && charbuild.skillNames) || {};
    C.ownedTalentRowSources(sheet, charbuild, 'target').forEach(function (t) {
      var nums = ((talents[t.id] || {}).roll_numbers || []);
      t.rows.forEach(function (row) {
        if (!row || !P.matches({ appliesTo: row.applies_to || null }, ctx)) return;
        var paired = nums.filter(function (n) { return n && n.when && n.when.ticked === row.id; });
        var label = 'Deal as strain';
        paired.forEach(function (n) {
          var a = n.amount;
          if (a && typeof a === 'object' && a.of === 'skill_ranks' && a.key) label += ' (+' + (names[a.key] || a.key) + ')';
        });
        out.push({ key: P.offerKey({ talentId: t.id, id: row.id }), talentId: t.id, rowId: row.id, source: t.name, label: label,
                   paired: paired.map(function (n) { return n.id; }), row: row });
      });
    });
    return out;
  }

  /**
   * QM1: the modes the wielder may switch on BEFORE the check (Auto-fire; Stun setting) — OFFERED, never applied
   * (R-M12C-8). → [{ quality, source, modeId, poolRows, rangeMax, damageAs, cite }]; `poolRows` are the mode's dice in
   * poolRows' own shape, stamped with `opts.anchor` (the attack's skill), for the fold to take once the player ticks it.
   */
  function modeOffers(weapon, opts) {
    opts = opts || {};
    var vocab = byId(opts.vocab), out = [];
    if (!vocab) return out;
    weaponQualities(weapon).forEach(function (q) {
      var e = q && vocab[q.id], m = e && e.mode;
      if (!m) return;
      // R1 (ADDENDUM 5): the mode is the quality's own switch, so its row names the source ONCE ("Auto-fire — +1 difficulty",
      // the hub's MODE tag saying it is a mode) — it was "Auto-fire (Auto-fire on)"
      // R-SHC-4 (the hub build's mode tick, ADDENDUM 6 IMPLEMENTER'S): every row of one mode carries the MARK
      // `limit: 'mode'` — so poolMods.appliesNow reads false and an UNTICKED mode never folds — and one id, `mode:<id>`,
      // so all its rows share ONE offerKey ('i:<source>:mode:<id>', the mode's `key`) and one tick takes them together
      // (takeOffers strips the mark). The hub's MODE tag is the same mark (ui.jsx offerTags prints a row's limit).
      var src = sourceOf(e, q), id = 'mode:' + m.id;
      var rows = (m.pool_mods || []).map(function (row) {
        var x = { source: src, quality: e.id, rowId: row.id, id: id, mode: m.id, limit: 'mode', count: Number(row.count) || 0,
                  direction: row.direction === undefined ? null : row.direction, condition: null, appliesTo: opts.anchor ? [opts.anchor] : [] };
        if (row.symbol) x.symbol = row.symbol; else x.die = row.die;
        return x;
      });
      out.push({ quality: e.id, source: src, modeId: m.id, key: 'i:' + src + ':' + id, poolRows: rows, rangeMax: m.range_max || null,
                 damageAs: m.damage_as || null, words: modeWords(m), cite: m.cite || null });
    });
    return out;
  }

  /**
   * QT1 (R-M12C-58): what the weapon's qualities do to ONE TARGET's numbers — the guarded pure resolver. `target`:
   *   { kind: 'personal' | 'droid' | 'vehicle' (droid is personal-scale), soak, armor (a vehicle's), qualities: {weapon: [ids],
   *     armor: [ids]} — the DEFENDER's own items' qualities (Cortosis) }.
   * Pierce ignores rating soak, never more than there is (EotE p.157). Breach ignores rating armour; on a personal-scale
   * target that is 10 soak per rating (p.155). Damage is dealt as strain / system strain where a row says so, still reduced
   * by soak (Stun Damage p.157; Ion p.156: vehicles system strain, droids strain). A defender's Cortosis armour makes its
   * soak immune to Pierce and Breach; Cortosis on its weapon makes that weapon immune to Sunder (listed: Sunder is a spend).
   * → { rows: [{quality, source, rowId, op, amount?, value?, cite}], soakIgnored, soakAfter (personal, when soak is given),
   *     armorIgnored (vehicle), damageAs ('strain' | 'system_strain' | null), immune: {weapon: [ids], armor: [ids]},
   *     blocked: [{quality, by}] } — or null with no vocabulary.
   * THE TALENT LEG (V4, ADDENDUM 8 F1; D-294 L2): `opts.talentTargets` — the owner's target rows TICKED at the roll,
   *   [{talentId, source, row}] (talentTargetOffers' entries the hub's `taken` names) — each pushes {talentId, source, rowId,
   *   op: 'damage_as', value, cite} and sets `damageAs` beside the weapon's own rows: one reader, one diceHubTargetLines.
   */
  function targetRows(weapon, target, opts) {
    opts = opts || {};
    var vocab = byId(opts.vocab);
    if (!vocab) return null;
    target = target || {};
    var kind = target.kind || 'personal', vehicle = kind === 'vehicle';
    var immune = { weapon: [], armor: [] };
    ['weapon', 'armor'].forEach(function (holder) {
      ((target.qualities && target.qualities[holder]) || []).forEach(function (qid) {
        var d = vocab[qid];
        (d && d.target || []).forEach(function (row) {
          if (row.op !== 'immune_to' || row.holder !== holder) return;
          (row.value || []).forEach(function (v) { if (immune[holder].indexOf(v) === -1) immune[holder].push(v); });
        });
      });
    });
    var out = { rows: [], soakIgnored: 0, soakAfter: null, armorIgnored: 0, damageAs: null, immune: immune, blocked: [] };
    var pierce = 0, breach = 0;
    weaponQualities(weapon).forEach(function (q) {
      var e = q && vocab[q.id];
      if (!e || !Array.isArray(e.target) || !_targetFits(e, target)) return;
      var rating = ratingOf(q);
      e.target.forEach(function (row) {
        if (row.op === 'immune_to') return;                       // a DEFENDER's row, read above
        if (row.condition && row.condition.target_kind !== kind) return;
        if ((row.op === 'soak_ignore' || row.op === 'armor_ignore') && immune.armor.indexOf(e.id) !== -1) {
          out.blocked.push({ quality: e.id, by: 'armor' });
          return;
        }
        // `source` = the quality as the weapon carries it ("Pierce 2", "Ion"): the hub's TARGET lines name it (R-SHC-8)
        var r = { quality: e.id, source: sourceOf(e, q), rowId: row.id, op: row.op, cite: row.cite || null };
        if (row.op === 'soak_ignore') { r.amount = rating; pierce += rating; }
        else if (row.op === 'armor_ignore') { r.amount = rating; breach += rating; }
        else if (row.op === 'damage_as') { r.value = row.value; if (out.damageAs !== 'system_strain') out.damageAs = row.value; }
        out.rows.push(r);
      });
    });
    (Array.isArray(opts.talentTargets) ? opts.talentTargets : []).forEach(function (x) {
      var row = x && x.row;
      if (!row || row.op !== 'damage_as') return;
      var tr = { talentId: x.talentId, source: x.source, rowId: row.id, op: 'damage_as', value: row.value, cite: row.cite || null };
      if (row.soak) tr.soak = row.soak;   // 5e (roll-options card ADDENDUM 25 F3): "not reduced by soak" (Pressure Point, EotE p.141)
      out.rows.push(tr);
      if (out.damageAs !== 'system_strain') out.damageAs = row.value;
    });
    if (vehicle) out.armorIgnored = breach;
    var soak = Number(target.soak);
    if (!vehicle && isFinite(soak) && target.soak != null) {
      var ign = Math.min(soak, pierce + 10 * breach);
      out.soakIgnored = ign;
      out.soakAfter = soak - ign;
    } else if (!vehicle) {
      out.soakIgnored = pierce + 10 * breach;
    }
    return out;
  }

  var api = {
    GRANTED_DAMAGE: GRANTED_DAMAGE,
    spendRows: spendRows,
    talentSpendRows: talentSpendRows,        // F-100 THE SURFACING MISSION (ADDENDUM 8): a talent's spend rows
    talentTargetOffers: talentTargetOffers,  // F-100 THE SURFACING MISSION (ADDENDUM 8): a talent's target ticks
    modeOffers: modeOffers,
    targetRows: targetRows,
    citeWords: _citeWords,   // "EotE p.156" — the hub's TARGET lines cite through it (one book-short map)
    damageRows: damageRows,
    poolRows: poolRows,
    rollSources: rollSources,
    reducersOn: reducersOn,
    ratingOf: ratingOf,
  };
  if (typeof window !== 'undefined') window.SWRPGQualityRows = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
