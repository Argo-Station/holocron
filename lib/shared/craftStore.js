/* lib/shared/craftStore.js — F-56 crafting v1: the project store and grade derivation.
 *
 * A CRAFT PROJECT is a resumable attempt persisted on the character (`sheet.crafts[]`). Save shapes
 * are FIXED by ruling `crafting-journey-shape-and-save-shapes` §4 (R-SY4) — this module is their only
 * writer, so the contract lives in one place:
 *
 *   sheet.crafts[]   { id, template_id, category, stage, materials{acquired,method,paid,note},
 *                      made_from, roll{su,fa,ad,th,tr,de[,ls,ds]}, improvements[], flaws[], choice? }
 *                      roll.ls/ds: an ALCHEMY check's light- and dark-side results (R-R5CC-4; contract ADDENDUM 6 finding
 *                      4: the ledger's two keys, no new shape), written only when the roll carries them
 *                      choice: { skill: <id> } | { characteristic: <key> } — contract ADDENDUM 4, only where the
 *                      template has a `choice`; construction is not reachable without it
 *                      improvements[] / flaws[]: a LIST OF PURCHASES, not a set (ruling release-r5-crafting-kp-c0 Q3a,
 *                      R-RRD-1 — "Unless a limit is specified, an option … may be selected any number of times, and its
 *                      effects stack", Endless Vigil printed 85): a row id appears once per purchase, as far as limitOf
 *                      allows. toggleRow keeps the face's one-tap toggle; takeAgain / dropOne buy and return one more.
 *   sheet.craft_notes[]  { row_id, craft_id }        — earned crafter-scoped effects the app REMEMBERS
 *   <item>._inline.built_with[]                      — the row ids built into a finished item
 *   <item>._inline.chosen                            — the project's choice, ids only (ADDENDUM 4); names at render
 *   sheet.craft_schematics[]  { template_id, level } — R-R5CC-3: a template's schematic; level = difficulty steps removed
 *   sheet.fortifications[]    { id, template_id, name, built_with[], made_from? } — R-R5CC-2: a built fortification; `id`
 *                      is its craft project's id (ruling release-r5-crafting-fib-c0 Q3), so craft_notes key it too. NO
 *                      number is stored: fortificationOf resolves them at render from the template and `built_with`.
 *   sheetData.companions[].own  — a CRAFTED DROID (ruling release-r6-companions-c0 R-R6CC-4/5): the thin recipe
 *                      { _provenance: 'crafted', template_id, built_with[], directive_id|null, programmed_with[], picks{},
 *                      traits[], craft_id }; the companion store (companions.js) owns the row, droidOf resolves it.
 *                      A droid project's per-purchase picks ride the project as `picks` until landing.
 *
 * THREE THINGS THE RULING FIXED, and why each is load-bearing:
 *   · `id` is an INSTANCE id, never `template_id` (decisions/0016, the GM bench's hard-won lesson):
 *     two crafts of one template must not share state.
 *   · `stage` and `materials.method` are CLOSED VOCABULARIES. A new value is a fresh R-SY4 halt.
 *   · GRADE IS NEVER STORED. It derives from `built_with` at render, so a registry correction reaches
 *     every item ever made — the claim-ticket law. Storing it would freeze a lie.
 *
 * LOUD vs GRACEFUL (C-J3), the distinction that matters most here: during a LIVE spend an unknown row
 * id THROWS (code path -> bug). At RENDER of an already-built item, unresolvable rows degrade quietly —
 * the grade computes from what resolves and nothing is stripped. Old data is history, not corruption.
 *
 * Pure + dual-export (browser window.SWRPGCraft / CommonJS) for node harnesses.
 */
(function (root) {
  'use strict';

  var Crafting = (typeof module !== 'undefined' && module.exports)
    ? require('./crafting.js')
    : (root && root.SWRPGCrafting);

  var STAGES = ['materials', 'construction', 'spending'];      // CLOSED (R-SY4)
  var ACQ_METHODS = ['bought', 'other'];                        // CLOSED (R-SY4)
  var MAX_TIER = 5;

  // ── ids ────────────────────────────────────────────────────────────────────
  // Globally unique per character. Not Date.now-only: two crafts started in the same millisecond
  // (a double-tap) would collide, which is exactly the bug decisions/0016 was written about.
  function mintId(existing) {
    var taken = {};
    (existing || []).forEach(function (p) { if (p && p.id) taken[p.id] = 1; });
    var n = 0, id;
    do {
      n += 1;
      id = 'craft_' + Math.random().toString(36).slice(2, 10) + '_' + n;
    } while (taken[id]);
    return id;
  }

  function newProject(templateId, category, existing) {
    return {
      id: mintId(existing),
      template_id: templateId,
      category: category || 'brawl_melee',
      stage: 'materials',
      materials: { acquired: false, method: null, paid: null, note: null },
      made_from: null,
      roll: null,
      improvements: [],
      flaws: [],
    };
  }

  function patch(p, fields) {
    var out = {}, k;
    for (k in p) { if (Object.prototype.hasOwnProperty.call(p, k)) out[k] = p[k]; }
    for (k in fields) { if (Object.prototype.hasOwnProperty.call(fields, k)) out[k] = fields[k]; }
    return out;
  }

  // ── the crafter's choice (contract ADDENDUM 4): { skill } | { characteristic }, ids only ─────────────────────
  // validChoice: true when `choice` answers the template's `choice` — a skill of its skills.vocab group (checked against
  // `skills`, the vocabulary's entries, when given), or one characteristic of its `among`. A template without a `choice`
  // takes none.
  function validChoice(template, choice, skills) {
    var want = template && template.choice;
    if (!want) return choice == null;
    if (!choice || typeof choice !== 'object' || Object.keys(choice).length !== 1) return false;
    if (want.kind === 'skill') {
      if (typeof choice.skill !== 'string' || !choice.skill) return false;
      if (!skills) return true;
      return (skills || []).some(function (e) { return e && e.id === choice.skill && e.group === want.group; });
    }
    if (want.kind === 'characteristic') return (want.among || []).indexOf(choice.characteristic) !== -1;
    return false;
  }
  function setChoice(p, template, choice, skills) {
    if (!(template && template.choice)) throw new Error('[craft] template ' + (template && template.id) + ' takes no choice');
    if (!validChoice(template, choice, skills)) throw new Error('[craft] not a choice for ' + template.id + ': ' + JSON.stringify(choice));
    var c = template.choice.kind === 'skill' ? { skill: choice.skill } : { characteristic: choice.characteristic };
    return patch(p, { choice: c });
  }

  // ── stage transitions ──────────────────────────────────────────────────────
  // opts.template (optional): handed the template, construction is refused until a template's `choice` is made.
  function acquireMaterials(p, opts) {
    opts = opts || {};
    if (ACQ_METHODS.indexOf(opts.method) === -1) {
      throw new Error('[craft] materials.method must be one of ' + ACQ_METHODS.join('|'));
    }
    if (opts.template && opts.template.choice && !validChoice(opts.template, p.choice, opts.skills)) {
      throw new Error('[craft] choose a ' + opts.template.choice.kind + ' for ' + opts.template.id + ' before construction');
    }
    return patch(p, {
      stage: 'construction',
      materials: { acquired: true, method: opts.method,
                   paid: opts.method === 'bought' ? (opts.paid || 0) : null,
                   note: opts.note || null },
      made_from: opts.made_from != null ? opts.made_from : p.made_from,
    });
  }

  // A resolved roll (SWRPGDice.resolve's {success, advantage, triumph, despair, light, dark}) as the ledger's tally. With
  // `withForce` (an alchemy pool) the light and dark results become `ls`/`ds` (R-R5CC-4); they are spent on the alchemy
  // tables only and never become Force points (Unlimited Power p.80). Without it the tally is the six keys, as the
  // Workshop's roll builds today.
  function tallyOf(resolved, withForce) {
    var r = resolved || {};
    var su = r.success || 0, ad = r.advantage || 0;
    var t = { su: su > 0 ? su : 0, fa: su < 0 ? -su : 0, ad: ad > 0 ? ad : 0, th: ad < 0 ? -ad : 0,
              tr: r.triumph || 0, de: r.despair || 0 };
    if (withForce) { t.ls = r.light || 0; t.ds = r.dark || 0; }
    return t;
  }

  function logRoll(p, roll) {
    roll = roll || {};
    var r = { su: roll.su || 0, fa: roll.fa || 0, ad: roll.ad || 0,
              th: roll.th || 0, tr: roll.tr || 0, de: roll.de || 0 };
    // R-R5CC-4: an alchemy roll's Force results ride the same record; a roll without them stays byte-identical
    if (roll.ls != null || roll.ds != null) { r.ls = roll.ls || 0; r.ds = roll.ds || 0; }
    return patch(p, { stage: 'spending', roll: r });
  }

  // ── the verdict ────────────────────────────────────────────────────────────
  // RAW: Triumph counts as a success, Despair as a failure (EotE p.23); at least one net success is
  // required to succeed. A flawed craft is its OWN outcome, named up front — never a clean success
  // that reveals flaws afterwards.
  function netSuccesses(roll) {
    if (!roll) return 0;
    return ((roll.su || 0) + (roll.tr || 0)) - ((roll.fa || 0) + (roll.de || 0));
  }
  function outcome(roll) {
    if (netSuccesses(roll) < 1) return 'failed';
    return ((roll && ((roll.th || 0) + (roll.de || 0))) > 0) ? 'crafted_flawed' : 'crafted';
  }
  // Every success BEYOND the first cuts 2 hours, floor 1 (Special Modifications p.75).
  function buildHours(template, roll, construction) {
    var base = (template && template.time && template.time.hours) || 0;
    var per = (construction && construction.time_reduction_per_extra_success
               && construction.time_reduction_per_extra_success.hours) || 2;
    var floor = (construction && construction.time_minimum && construction.time_minimum.hours) || 1;
    var extra = Math.max(0, netSuccesses(roll) - 1);
    return Math.max(floor, base - (extra * per));
  }

  // ── the spend index: row id -> { row, side } ───────────────────────────────
  // R-R5CC-1: the applier reads its rows from the registry now, not from a code map, so indexing a category also hands
  // that category's rows to crafting.js (useSpendRows) — the Workshop's two-argument preview applies what was indexed.
  function indexSpend(spendReg, category) {
    var out = {};
    if (Crafting && Crafting.useSpendRows) Crafting.useSpendRows(spendReg, category || 'brawl_melee');
    var block = (spendReg && spendReg.spend && spendReg.spend[category || 'brawl_melee']) || {};
    (block.improvements || []).forEach(function (r) { out[r.id] = { row: r, side: 'improvement' }; });
    (block.flaws || []).forEach(function (r) { out[r.id] = { row: r, side: 'flaw' }; });
    return out;
  }

  // ── the grade (DERIVED, never stored) ──────────────────────────────────────
  // Tier = the row's position on RAW's own cost ladder. A row payable with Advantage or Threat takes
  // that count as its tier; a row payable ONLY with Triumph or Despair sits above the 1-4 ladder at 5,
  // which is precisely why those three rows are the expensive ones.
  function tierOf(row) {
    var prim = 0, hasPrim = false;
    ((row && row.req) || []).forEach(function (alt) {
      if (alt.ad != null) { hasPrim = true; prim = Math.max(prim, alt.ad); }
      if (alt.th != null) { hasPrim = true; prim = Math.max(prim, alt.th); }
    });
    return hasPrim ? prim : MAX_TIER;
  }

  // GRACEFUL by contract (C-J3): an id that no longer resolves is SKIPPED, never thrown on and never
  // stripped from the item. `unresolved` is returned so a surface may say so without inventing a grade.
  function gradeOf(builtWith, index) {
    var good = 0, bad = 0, unresolved = [];
    (builtWith || []).forEach(function (id) {
      var e = index && index[id];
      if (!e) { unresolved.push(id); return; }
      var t = tierOf(e.row);
      if (e.side === 'flaw') { if (t > bad) bad = t; }
      else if (t > good) good = t;
    });
    return { good: good, bad: bad, unresolved: unresolved };
  }

  // ── spending (LOUD — this is a live code path) ─────────────────────────────
  // HOTFIX (B-56): a running LEDGER, not a per-row check. `affordable()` alone asks "could this row be
  // paid from the whole roll", which is true for every cheap row no matter how many you have already
  // taken — so the menu let a 2-Advantage roll buy the entire table. Spending must DECREMENT.
  // Greedy in take-order: each row consumes the FIRST alternative its remaining budget can pay. Greedy
  // is right here because the player controls the order (they can deselect), and a solver would make
  // the UI's disabled-state unpredictable — a row would grey out because of a choice made three taps
  // ago and reorder itself.
  // ── which rows an outcome may buy (ruling release-r5-crafting-ev-on-failure, Q1 (a)) ───────────────────────────
  // A row whose printed symbol cell says "(failed check)" carries `flags.on_failure` (Learning Experience, Horrible
  // Accident; Endless Vigil printed 87). On a FAILED outcome only those rows may be bought; on any other outcome they
  // never may. `verdict` is outcome(roll); ABSENT reads as a success, so a caller that does not pass it keeps every
  // row it could buy before this flag and is refused only the failure rows. Such a row is told and lands nothing.
  // `base` and `taken` (optional, ruling release-r5-crafting-kp-c0 Q3b): with them, a row past its limit is not eligible.
  function eligible(row, verdict, base, taken) {
    var onFail = !!(row && row.flags && row.flags.on_failure);
    if (verdict === 'failed' ? !onFail : onFail) return false;
    return !limitOf(row, base, taken || 0);
  }

  // ── a row's printed LIMITS (ruling release-r5-crafting-kp-c0 Q3b; schema crafting-spend `limits`) ────────────────────
  // THE ONE PATH: eligible, spendLedger, toggleRow, takeAgain and buildItem all ask this. `taken` = how many of this row the
  // project already holds; `base` = the template's BASE item (result_profile after its own effects and choice), never the
  // running record, so the answer does not depend on purchase order. → null when one more may be bought, else
  // { limit: 'once' | 'max_count' | 'not_for', max?, field?, is? }.
  //   once_only          — the six-flags boolean, "(this can only be selected once)": max 1.
  //   limits.max_count   — "to a maximum of N" (Extra Hard Point, Keeping the Peace printed 91): max N.
  //   limits.not_for[]   — refused when ANY predicate holds on the base item. CLOSED grammar, grown only by ruling:
  //                        {field: 'hands', is: <value>} ("cannot be selected for a two-handed lightsaber", Endless Vigil
  //                        printed 87). A predicate outside it THROWS (a code/data divergence, C-J3). With no `base` the
  //                        fit is not asked; the count limits always are.
  //   limits.max_value   — "to a maximum of N" on the NUMBER (Deflective Carapace, Narrow Profile; ruling
  //                        release-r6-companions-c0 R-R6CC-2): refused once the base's value + n × the row's amount
  //                        reaches N. The ONE reader of max_value (rider 1). CLOSED to the ops in MAX_VALUE_OF; another
  //                        op THROWS. With no `base` the value counts from 0.
  //   not_for `tier` (R-R6CC-2): {field: 'tier', is: 'minion'} (Adaptive Programming, "Not on a minion") — the base is
  //                        the droid the directive programs.
  var NOT_FOR_FIELDS = ['hands', 'tier'];
  var MAX_VALUE_OF = {
    defense_delta: function (fx, base) {
      var f = fx.target === 'melee' ? 'melee_defense' : fx.target === 'ranged' ? 'ranged_defense' : null;
      if (!f) throw new Error('[craft] limits.max_value on a defense_delta without a melee/ranged target');
      return Number(((base && base.derived) || {})[f]) || 0;
    },
  };
  function maxValueHit(row, base, n) {
    var fx = ((row && (row.droid_effects || row.effects)) || [])[0];
    var read = fx && MAX_VALUE_OF[fx.op];
    if (!read) throw new Error('[craft] limits.max_value on ' + (row && row.id) + ': its op is outside the ruled grammar');
    return read(fx, base) + n * (Number(fx.amount) || 0) >= row.limits.max_value;
  }
  function notForHolds(pred, base) {
    if (!pred || NOT_FOR_FIELDS.indexOf(pred.field) === -1 || !('is' in pred) || Object.keys(pred).length !== 2) {
      throw new Error('[craft] not_for predicate outside the ruled grammar: ' + JSON.stringify(pred));
    }
    return base[pred.field] === pred.is;
  }
  function limitOf(row, base, taken) {
    var n = Number(taken) || 0, lim = (row && row.limits) || {};
    if (row && row.flags && row.flags.once_only && n >= 1) return { limit: 'once', max: 1 };
    if (lim.max_count != null && n >= lim.max_count) return { limit: 'max_count', max: lim.max_count };
    if (lim.max_value != null && maxValueHit(row, base, n)) return { limit: 'max_value', max: lim.max_value };
    if (base && Array.isArray(lim.not_for)) {
      for (var i = 0; i < lim.not_for.length; i++) {
        if (notForHolds(lim.not_for[i], base)) return { limit: 'not_for', field: lim.not_for[i].field, is: lim.not_for[i].is };
      }
    }
    return null;
  }
  function timesTaken(ids, rowId) {
    return (ids || []).filter(function (id) { return id === rowId; }).length;
  }

  // ── MAKER'S MARK — the one row-cost read (ruling `release-r6-rewards-c0` R-R6RC-3; Fully Operational p.96) ──────────
  // "For all future crafting checks, the character reduces the [Advantage] cost of this benefit by one, to a minimum of
  // one." `holder` is the CRAFTER'S sheet: a `sheetData.rewards` row with key MAKERSMARK and `improvement: <row id>`
  // (release-r4-shapes S2 ADDENDUM 4) lowers THAT row's Advantage price by one in every alternative that prices
  // Advantage, never below one. An alternative with no Advantage (a Triumph-only cost) is unchanged: the page prints no
  // Triumph alternative (silent, R-RRD-1: reported). The row itself is never rewritten, so its tier (tierOf, the grade's
  // ladder) stays the printed one. No holder, or a holder with no mark on the row → the printed `req`, unchanged.
  // MARK_LESS / MARK_FLOOR equal rewards.json MAKERSMARK's effect.advantage_less / advantage_floor (pinned by a guard).
  var MARK_LESS = 1, MARK_FLOOR = 1;
  function markedRows(holder) {
    var out = {};
    ((holder && Array.isArray(holder.rewards)) ? holder.rewards : []).forEach(function (r) {
      if (r && r.key === 'MAKERSMARK' && typeof r.improvement === 'string' && r.improvement) out[r.improvement] = true;
    });
    return out;
  }
  function costOf(row, holder) {
    var req = (row && row.req) || [];
    if (!row || !holder || !markedRows(holder)[row.id]) return req;
    return req.map(function (alt) {
      if (alt.ad == null) return alt;
      var a = Object.assign({}, alt);
      a.ad = Math.max(MARK_FLOOR, alt.ad - MARK_LESS);
      return a;
    });
  }

  // `base` (optional): the template's base item, so a not_for row is unpaid. A purchase past its count limit is unpaid.
  // `holder` (optional): the crafter's sheet, for a Maker's Mark's lowered price (costOf).
  function spendLedger(rowIds, index, tally, verdict, base, holder) {
    // R-R5CC-4: the alchemy tables price the crafter's rows in light side (ls) and the GM's in dark side (ds) too
    var rem = { ad: (tally && tally.ad) || 0, tr: (tally && tally.tr) || 0,
                th: (tally && tally.th) || 0, de: (tally && tally.de) || 0,
                ls: (tally && tally.ls) || 0, ds: (tally && tally.ds) || 0 };
    var paid = [], unpaid = [], seen = {};
    (rowIds || []).forEach(function (id) {
      var e = index && index[id];
      var n = seen[id] || 0;
      seen[id] = n + 1;
      if (!e || !eligible(e.row, verdict, base, n)) { unpaid.push(id); return; }
      var alt = null;
      costOf(e.row, holder).some(function (a) {
        var ok = Object.keys(a).every(function (k) { return (rem[k] || 0) >= a[k]; });
        if (ok) { alt = a; return true; }
        return false;
      });
      if (!alt) { unpaid.push(id); return; }
      Object.keys(alt).forEach(function (k) { rem[k] -= alt[k]; });
      paid.push(id);
    });
    return { remaining: rem, paid: paid, unpaid: unpaid };
  }
  function affordableFrom(row, remaining, verdict, holder) {
    if (!eligible(row, verdict)) return false;
    return costOf(row, holder).some(function (alt) {
      return Object.keys(alt).every(function (k) { return (remaining[k] || 0) >= alt[k]; });
    });
  }

  function affordable(row, tally, verdict, holder) {
    if (!eligible(row, verdict)) return false;
    return costOf(row, holder).some(function (alt) {
      return Object.keys(alt).every(function (k) { return (tally[k] || 0) >= alt[k]; });
    });
  }
  // ── exclusive groups (ruling release-r5-crafting-up-dupkey Q2 (a)) ────────────────────────────────────────────
  // Rows sharing `exclusive_group` are ONE printed row OggDude splits into versions. When the members are once_only
  // (Empowered, Mighty: "can only be selected once", Unlimited Power p.85), at most ONE member is bought per craft; a
  // group whose printed row has no "once" (Additional Power) is not limited by it. → the id of a bought member that
  // blocks `rowId`, or null.
  function groupTaken(ids, rowId, index) {
    var e = index && index[rowId];
    var g = e && e.row && e.row.exclusive_group;
    if (!g || !(e.row.flags && e.row.flags.once_only)) return null;
    var hit = null;
    (ids || []).some(function (id) {
      var o = index[id];
      if (id !== rowId && o && o.row && o.row.exclusive_group === g) { hit = id; return true; }
      return false;
    });
    return hit;
  }
  // The bought rows' group conflicts: [[blocked, blocker]] for each once-only group bought more than once.
  function groupConflicts(ids, index) {
    var out = [];
    (ids || []).forEach(function (id, i) {
      var hit = groupTaken((ids || []).slice(0, i), id, index);
      if (hit) out.push([id, hit]);
    });
    return out;
  }

  // The face's one-tap toggle: held → every purchase of it is returned; not held → one is bought, as far as limitOf and
  // the exclusive group allow (refused = unchanged). `base` (optional) is the template's base item, for a not_for row.
  function toggleRow(p, rowId, index, base) {
    var e = index && index[rowId];
    if (!e) throw new Error('[craft] unknown spend row id: ' + rowId);
    var key = e.side === 'flaw' ? 'flaws' : 'improvements';
    var cur = (p[key] || []).slice(), off = cur.indexOf(rowId) >= 0;
    if (off) cur = cur.filter(function (id) { return id !== rowId; });
    else if (limitOf(e.row, base, 0)) return p;
    else if (groupTaken(cur, rowId, index)) return p;   // a once-only group already has its one member (refused, unchanged)
    else cur.push(rowId);
    var f = {}; f[key] = cur;
    if (off && p.picks) f.picks = dropPicks(p.picks, rowId, 0);   // R-R6CC-5: every purchase returned, every pick with it
    return patch(p, f);
  }
  // ruling release-r5-crafting-kp-c0 Q3a: one MORE purchase of a row (the plumbing F1's face calls), refused (unchanged)
  // past its limit or its exclusive group.
  function takeAgain(p, rowId, index, base) {
    var e = index && index[rowId];
    if (!e) throw new Error('[craft] unknown spend row id: ' + rowId);
    var key = e.side === 'flaw' ? 'flaws' : 'improvements';
    var cur = (p[key] || []).slice();
    if (limitOf(e.row, base, timesTaken(cur, rowId))) return p;
    if (cur.indexOf(rowId) === -1 && groupTaken(cur, rowId, index)) return p;
    cur.push(rowId);
    var f = {}; f[key] = cur;
    return patch(p, f);
  }
  // One purchase of a row returned (its last); a row not held leaves the project unchanged.
  function dropOne(p, rowId, index) {
    var e = index && index[rowId];
    if (!e) throw new Error('[craft] unknown spend row id: ' + rowId);
    var key = e.side === 'flaw' ? 'flaws' : 'improvements';
    var cur = (p[key] || []).slice();
    var at = cur.lastIndexOf(rowId);
    if (at < 0) return p;
    var held = timesTaken(cur, rowId);
    cur.splice(at, 1);
    var f = {}; f[key] = cur;
    if (p.picks) f.picks = dropPicks(p.picks, rowId, held - 1);   // R-R6CC-5 rider: the HIGHEST n's pick goes with it
    return patch(p, f);
  }

  // ── per-purchase picks (ruling release-r6-companions-c0 Q5 (a), R-R6CC-5) ────────────────────────────────────────
  // p.picks: '<row id>#<n>' → the n-th purchase's pick (1-based), plus `directive` for a directive template's own skill
  // picks ({ skills: [...] }). Copied onto the droid's `own` at landing. `picks` never holds a key past its row's
  // purchase count: dropOne removes the highest n's, toggleRow-off removes them all.
  var PICK_KEY = /^(.+)#([1-9][0-9]*)$/;
  function dropPicks(picks, rowId, keep) {
    var out = {};
    Object.keys(picks || {}).forEach(function (k) {
      var m = PICK_KEY.exec(k);
      if (m && m[1] === rowId && Number(m[2]) > keep) return;
      out[k] = picks[k];
    });
    return out;
  }
  // One pick set. LOUD (a live path, C-J3): a row key must name a purchase the project holds; `directive` takes
  // { skills: [string] }.
  function setPick(p, key, value) {
    if (key !== 'directive') {
      var m = PICK_KEY.exec(String(key));
      if (!m) throw new Error('[craft] not a pick key: ' + key);
      var held = timesTaken((p.improvements || []).concat(p.flaws || []), m[1]);
      if (Number(m[2]) > held) throw new Error('[craft] ' + key + ' names a purchase the project does not hold');
    } else if (!value || !Array.isArray(value.skills)) {
      throw new Error('[craft] the directive pick is { skills: [...] }');
    }
    if (!value || typeof value !== 'object') throw new Error('[craft] a pick is an object');
    var picks = Object.assign({}, p.picks);
    picks[key] = JSON.parse(JSON.stringify(value));
    return patch(p, { picks: picks });
  }

  // ── what the Workshop offers (card ADDENDUM 6, C5 DARK) ────────────────────
  // A category is offered only once the card that builds its APPROVED face adds it here (R-WS-4, R-MU1); the registry
  // holds more than is offered. The face lists templates through offeredTemplates and nothing else
  // (test/release_r5_crafting_dark.cjs). → the template ids of the offered categories, in registry order.
  // ruling release-r5-f1-c0 R-R5F1C-1 (F1's faces); R6-S5 (card release-r6-ui §2.6, D-389; B-1528): lane B's droid kinds leave dark
  var OFFERED_CATEGORIES = ['brawl_melee', 'ranged', 'gadget', 'cyber', 'potion', 'talisman', 'lightsaber', 'armor', 'fortification', 'droid_chassis', 'droid_directive'];
  function offeredTemplates(tpl) {
    return Object.keys(tpl || {}).filter(function (id) {
      return !!tpl[id] && OFFERED_CATEGORIES.indexOf(tpl[id].category) !== -1;
    });
  }

  // ── alchemy: who may craft, and the Force dice its check rolls (R-R5CC-4, Unlimited Power p.80) ───────────────
  // Only Force-sensitive characters may craft alchemy; the check adds Force dice equal
  // to their current Force rating, which must be 1 or more.
  // The rating is the SHEET'S (the caller reads it through CharResolve.computeDerived, the one derivation); these two
  // take it as a number and derive nothing. Light-side results spent here are never Force points (p.80): the spend is
  // the ledger's `ls`, and nothing here makes a Force point.
  var ALCHEMY_CATEGORIES = ['potion', 'talisman'];
  var ALCHEMY_REFUSED = 'Only a Force user can craft alchemy: it takes a current Force rating of at least 1 '
    + '(Unlimited Power p.80).';
  function isAlchemy(template) {
    return !!template && ALCHEMY_CATEGORIES.indexOf(template.category) !== -1;
  }
  // → { ok: true } | { ok: false, reason } — the refusal carries the book's reason; a template that is not alchemy
  // is never refused here.
  function craftGate(template, forceRating) {
    if (!isAlchemy(template)) return { ok: true };
    return (Number(forceRating) || 0) >= 1 ? { ok: true } : { ok: false, reason: ALCHEMY_REFUSED };
  }
  // The Force dice the craft check adds: one per point of current Force rating on an alchemy template, else 0.
  function craftForceDice(template, forceRating) {
    return isAlchemy(template) ? Math.max(0, Math.floor(Number(forceRating) || 0)) : 0;
  }

  // ── where a finished thing lands (R-R5CC-2, B-1426) ────────────────────────
  // A template's OUTPUT is read off its result_profile, never stored: a weapon profile (a combat `skill` and a `damage`)
  // lands in equipment.weapons; every other profile is carried in equipment.gear. Both as `{_inline: record}`.
  // Potions and talismans (release-r5-crafting-up C2) are GEAR profiles at encumbrance 0 (UP p.80): they land in
  // equipment.gear through this same arm, their use and duration told by the profile's base_mods line.
  // ARMOUR (ruling release-r5-crafting-kp-c0 Q1 (a)): a profile armour-shaped by armor.schema's own anyOf (`soak`, or a
  // `defense` of 1 or more; gear.schema admits neither) is 'armor', and lands as a SPARE in equipment.gear (R-ASS-1). A
  // craft never writes equipment.armor: the sheet's spare branch knows the suit by the same test, and WEAR puts it on.
  var IR = (typeof module !== 'undefined' && module.exports) ? require('./itemResolve.js') : (root && root.ItemResolve);
  function isArmorProfile(rp) {
    return IR.isArmorRecord(rp);
  }
  // FORTIFICATION (ruling release-r5-crafting-fib-c0 Q1, outputOf (a)): a profile carrying `passengers` (its occupancy; no
  // item schema admits it) is a fortification, asked FIRST. It lands in sheet.fortifications[], never in equipment.
  function isFortificationProfile(rp) {
    return !!rp && typeof rp === 'object' && rp.passengers != null;
  }
  // A DROID (ruling release-r6-companions-c0 Q1 (a), R-R6CC-1): a chassis profile carries `tier` and `characteristics`
  // (the npcs.json fields) and lands a companion; a directive profile carries `skill_picks` and programs one.
  function isDroidProfile(rp) { return !!rp && typeof rp === 'object' && rp.tier != null && !!rp.characteristics; }
  function isDirectiveProfile(rp) { return !!rp && typeof rp === 'object' && Array.isArray(rp.skill_picks); }
  function outputOf(template) {
    var rp = (template && template.result_profile) || {};
    if (isFortificationProfile(rp)) return 'fortification';
    if (isDroidProfile(rp)) return 'droid';
    if (isDirectiveProfile(rp)) return 'directive';
    if (rp.skill && rp.damage) return 'weapon';
    return isArmorProfile(rp) ? 'armor' : 'gear';
  }
  // `copies` (buildItem's, default 1): a bought `flags.extra_copy` row lands one more entry of the same record (ruling
  // release-r5-crafting-up-extra-copy). Each entry is its own deep copy, so an edit to one never reaches another — and a
  // Duplicate suit is two spares, never `qty: 2`, since WEAR moves a whole entry (ruling release-r5-crafting-kp-c0 Q1).
  function landItem(equipment, record, template, copies) {
    var eq = equipment || {};
    var key = outputOf(template) === 'weapon' ? 'weapons' : 'gear';
    var out = Object.assign({}, eq);
    var n = Math.max(1, Math.floor(Number(copies) || 1)), add = [];
    for (var i = 0; i < n; i++) add.push({ _inline: i === 0 ? record : JSON.parse(JSON.stringify(record)) });
    out[key] = (eq[key] || []).concat(add);
    return out;
  }
  // The names already in the list the item will land in — defaultName keeps two crafts of one template apart there.
  function siblingNames(equipment, template) {
    var list = ((equipment || {})[outputOf(template) === 'weapon' ? 'weapons' : 'gear']) || [];
    return list.map(function (w) { return (w && w._inline && w._inline.name) || null; });
  }

  // ── schematics (R-R5CC-3, ADDENDUM 3): sheet.craft_schematics [{template_id, level}], ids only ─────────────
  // Buying the category's schematic row (flags.schematic) on a FINISHED project adds 1 to that template's level; a failed
  // check buys nothing (ADDENDUM 3). `level` is the number of difficulty steps the schematic removes, floored at Simple
  // where the check is built (craftPoolOf, the one difficulty path). OggDude's `Level` maps here; its meaning is INFERRED.
  function schematicLevel(schematics, templateId) {
    var n = 0;
    (schematics || []).forEach(function (s) { if (s && s.template_id === templateId) n = Math.max(n, Number(s.level) || 0); });
    return n;
  }
  function addSchematicLevel(schematics, templateId) {
    var list = (schematics || []).slice();
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].template_id === templateId) {
        list[i] = { template_id: templateId, level: (Number(list[i].level) || 0) + 1 };
        return list;
      }
    }
    list.push({ template_id: templateId, level: 1 });
    return list;
  }
  // The check's difficulty dice once THIS template's schematic is read: `level` steps off, floored at Simple (0). Called
  // only by craftPoolOf (player/app.jsx), the one place the craft pool is built.
  function schematicDiff(baseDice, schematics, templateId) {
    return Math.max(0, (Number(baseDice) || 0) - schematicLevel(schematics, templateId));
  }
  // The finish's sheet patch for a finished project's schematic row, or null. `index` is the project's category index.
  function schematicPatch(p, index, schematics) {
    var id = Crafting.schematicRowId(index);
    if (!id || outcome(p.roll) === 'failed') return null;
    if ((p.improvements || []).indexOf(id) === -1) return null;
    return addSchematicLevel(schematics, p.template_id);
  }

  // ── finishing: the `_inline` record that lands on the character ────────────
  // The applier owns item math (one application point); this adds only what makes the item THEIRS. A template's own
  // effects go first, slots resolved from the project's choice (ADDENDUM 4); a template with a `choice` and a project
  // without one THROWS (a live build, C-J3).
  function buildItem(p, template, index, opts) {
    opts = opts || {};
    var rows = (p.improvements || []).concat(p.flaws || []);
    rows.forEach(function (id) { if (!index[id]) throw new Error('[craft] unknown spend row id: ' + id); });
    rows.forEach(function (id) {   // a failure row never builds into a finished item (ruling release-r5-crafting-ev-on-failure)
      if (!eligible(index[id].row, 'crafted')) throw new Error('[craft] ' + id + ' is bought only on a failed check');
    });
    var clash = groupConflicts(rows, index);
    if (clash.length) throw new Error('[craft] ' + clash[0][0] + ' and ' + clash[0][1] + ' are one printed row, bought once');
    if (template.choice && !validChoice(template, p.choice, opts.skills)) {
      throw new Error('[craft] ' + template.id + ' is built for a chosen ' + template.choice.kind + ' and the project has none');
    }
    var kind = outputOf(template);
    // a directive's rows are limited by the DROID it programs (not_for tier): the caller's opts.base, its droidOf record
    var base = kind === 'directive' ? (opts.base || null)
      : Crafting.applyTemplateEffects(template.result_profile, template, p.choice, { kind: kind });
    var seen = {};
    rows.forEach(function (id) {   // ruling release-r5-crafting-kp-c0 Q3b: every purchase inside its row's limits, or THROW
      var lim = limitOf(index[id].row, base, seen[id] || 0);
      seen[id] = (seen[id] || 0) + 1;
      if (lim) throw new Error('[craft] ' + id + ' is past its limit (' + lim.limit + ')');
    });
    if (kind === 'droid' || kind === 'directive') {   // R-R6CC-4: the recipe, no number applied (resolve-at-render)
      var copiesD = 1 + rows.filter(function (id) { return !!(index[id].row.flags && index[id].row.flags.extra_copy); }).length;
      return { rows: rows, picks: JSON.parse(JSON.stringify(p.picks || {})), copies: kind === 'droid' ? copiesD : 1 };
    }
    if (kind === 'fortification') {   // ruling release-r5-crafting-fib-c0 Q3: the ENTRY, no number applied (resolve-at-render)
      var entry = { id: p.id, template_id: p.template_id,
                    name: (opts.name && String(opts.name).trim()) || defaultName(template, opts.siblings), built_with: rows.slice() };
      if (p.made_from) entry.made_from = p.made_from;
      var tpls = {};
      tpls[template.id] = template;
      return { entry: entry, unapplied: fortificationOf(entry, tpls, index).unapplied, copies: 1 };
    }
    var applied = Crafting.applyCraftingSpend(base, rows, index, { kind: kind });
    var rec = applied.profile;
    rec.name = (opts.name && String(opts.name).trim()) || defaultName(template, opts.siblings);
    rec.built_with = rows.slice();
    if (template.choice) rec.chosen = template.choice.kind === 'skill' ? { skill: p.choice.skill } : { characteristic: p.choice.characteristic };
    if (p.made_from) rec.made_from = p.made_from;
    rec._provenance = 'custom';
    // ruling release-r5-crafting-up-extra-copy: each bought extra_copy row lands one more entry (landItem's `copies`)
    var copies = 1 + rows.filter(function (id) { return !!(index[id].row.flags && index[id].row.flags.extra_copy); }).length;
    return { record: rec, unapplied: applied.unapplied, copies: copies };
  }

  // THE LANDING ARM, one call (R-R5CC-2; ruling release-r5-crafting-up-extra-copy): a FAILED project lands nothing
  // (null); a finished one lands buildItem's record in its list, `copies` times. → { equipment, record, copies, unapplied }
  // A FORTIFICATION (ruling release-r5-crafting-fib-c0 Q3) lands its entry at the end of `opts.fortifications`, named apart
  // from those (not from equipment), and hands `equipment` back UNTOUCHED (the same object), so a caller that writes
  // `.equipment` writes what it read. → { equipment, fortifications, entry, unapplied }. A failed one lands nothing (Q3 (a)).
  // A DROID (ruling release-r6-companions-c0 Q4 (a), R-R6CC-4): a chassis lands a companion row in `opts.companions`
  // whose `own` is the thin crafted recipe (directive_id null); Doppelganger (extra_copy) lands one more row with its own
  // id. A DIRECTIVE programs the companion its `made_from` names: directive_id, programmed_with and the picks. Both hand
  // `equipment` back untouched. → { equipment, companions, rows: [the landed/programmed rows], unapplied } — `unapplied`
  // is droidOf's, read with `opts.droid` (its registries) when given. A failed check lands nothing.
  function companionsCore() {
    if (typeof module !== 'undefined' && module.exports) return require('./companions.js');
    return root && root.SWRPGCompanions;
  }
  function droidLanding(p, template, index, equipment, opts) {
    var C = companionsCore(), list = (opts && opts.companions) || [], kind = outputOf(template);
    if (kind === 'droid') {
      var built = buildItem(p, template, index, opts);
      var own = { _provenance: 'crafted', template_id: template.id, built_with: built.rows, directive_id: null,
                  programmed_with: [], picks: built.picks, traits: [], craft_id: p.id };
      var cur = list, landed = [];
      for (var i = 0; i < built.copies; i++) {
        cur = C.addCompanion(cur, { ref: null, own: JSON.parse(JSON.stringify(own)), name: (opts && opts.name) || '' });
        landed.push(cur[cur.length - 1]);
      }
      return { equipment: equipment, companions: cur, rows: landed,
               unapplied: opts && opts.droid ? C.droidOf(own, opts.droid).unapplied : [] };
    }
    var target = C.normalizeCompanions(list).filter(function (c) { return c.id === p.made_from; })[0];
    if (!target || !C.isCrafted(target.own)) throw new Error('[craft] a directive programs a crafted droid: no companion ' + p.made_from);
    var dbase = opts && opts.droid ? C.droidOf(target.own, opts.droid) : null;
    var prog = buildItem(p, template, index, Object.assign({}, opts, { base: dbase }));
    var picks = Object.assign({}, target.own.picks, prog.picks);
    var next = C.updateCompanion(list, target.id, { own: Object.assign({}, target.own,
      { directive_id: template.id, programmed_with: prog.rows, picks: picks }) });
    var row = next.filter(function (c) { return c.id === target.id; })[0];
    return { equipment: equipment, companions: next, rows: [row],
             unapplied: opts && opts.droid ? C.droidOf(row.own, opts.droid).unapplied : [] };
  }
  function landingOf(p, template, index, equipment, opts) {
    if (outcome(p && p.roll) === 'failed') return null;
    var k = outputOf(template);
    if (k === 'droid' || k === 'directive') return droidLanding(p, template, index, equipment, opts);
    if (outputOf(template) === 'fortification') {
      var forts = (opts && opts.fortifications) || [];
      var fopts = Object.assign({}, opts, { siblings: forts.map(function (f) { return (f && f.name) || null; }) });
      var fb = buildItem(p, template, index, fopts);
      return { equipment: equipment, fortifications: forts.concat([fb.entry]), entry: fb.entry, unapplied: fb.unapplied };
    }
    var built = buildItem(p, template, index, opts);
    return { equipment: landItem(equipment, built.record, template, built.copies), record: built.record,
             copies: built.copies, unapplied: built.unapplied };
  }

  // ── THE ONE FORTIFICATION RESOLVER (ruling release-r5-crafting-fib-c0 Q2 (a), Q3, Q4a (a)) ─────────────────────────
  // A built fortification's numbers at RENDER: the template's printed profile, then `built_with` in purchase order through
  // the two cores that own each quantity — a row's vehicle_effects (occupancy, a bunker's armour) through
  // SWRPGVesselResolve.resolve, called unchanged with the profile's vehicle numbers as the hull and each row as an installed
  // part; a row's effects (the occupant's ranged defence) through crafting.js's fortification arm (ItemResolve's armour
  // writer). "IF APPLICABLE" (Q4a (a), the class P4 ruled): a VEHICLE op reaches its core ONLY when the template carries
  // its number, so the vessel core creates none; otherwise the row is returned in `unapplied` with why. RANGED DEFENCE is
  // the exception (DECISIONS D-327, ruling release-r5-crafting-fib-c0 ADDENDUM 3 C-D327-1..3): a defence row on a
  // fortification that prints none (the Bunker, the Blind) applies against a base counted as 0, seeded only inside this
  // call and only while such a row is built, so a bare one still shows no ranged defence (C-D327-2); the result is
  // FLOORED at 0. A told row is returned in `unapplied` with its reason. GRACEFUL at render (C-J3): an unknown template
  // or row id is listed in `unresolved`.
  //   → { name, template_id, passengers?, defense_ranged?, armor?, hull_trauma?, silhouette?, speed?, concealment?,
  //       because: { <field>: [{ source, amount }] }, unapplied: [{ id, reason }], unresolved: [id] }
  var FORT_FIELDS = ['passengers', 'defense_ranged', 'armor', 'hull_trauma', 'silhouette', 'speed', 'concealment'];
  var VEHICLE_OPS = { passengers_delta: 'passengers', armor_delta: 'armor' };
  var ITEM_OPS = { defense_delta: 'defense_ranged' };
  var FIELD_WORDS = { passengers: 'occupancy', defense_ranged: 'ranged defence', armor: 'armour' };
  function vesselResolve() {
    if (typeof module !== 'undefined' && module.exports) return require('./vesselResolve.js').SWRPGVesselResolve;
    return root && root.SWRPGVesselResolve;
  }
  function fortificationOf(entry, templates, index) {
    var e = entry || {};
    var t = templates && templates[e.template_id];
    var out = { name: e.name || (t && t.name) || '', template_id: e.template_id || null, because: {}, unapplied: [], unresolved: [] };
    if (!t || !t.result_profile) { out.unresolved.push(e.template_id || null); return out; }
    var base = t.result_profile;
    FORT_FIELDS.forEach(function (f) { if (base[f] != null) out[f] = base[f]; });
    var itemIds = [], parts = [], reg = {};
    (Array.isArray(e.built_with) ? e.built_with : []).forEach(function (id, i) {
      var hit = index && Object.prototype.hasOwnProperty.call(index, id) ? index[id] : null;
      var row = hit && hit.row ? hit.row : hit;
      if (!row) { out.unresolved.push(id); return; }
      var fx = Array.isArray(row.vehicle_effects) ? row.vehicle_effects : Array.isArray(row.effects) ? row.effects : null;
      if (!fx) { out.unapplied.push({ id: id, reason: (row.told && row.told.reason) || '' }); return; }
      var ops = Array.isArray(row.vehicle_effects) ? VEHICLE_OPS : ITEM_OPS;
      var missing = fx.map(function (x) { return ops[x.op || x.type]; })
        .filter(function (f) { return !f || (ops === VEHICLE_OPS && base[f] == null); });   // D-327: defence counts from 0
      if (missing.length) {
        out.unapplied.push({ id: id, reason: 'not applicable: the ' + (t.name || 'fortification') + ' has no ' +
          (FIELD_WORDS[missing[0]] || missing[0] || 'such number') });
        return;
      }
      if (ops === ITEM_OPS) { itemIds.push(id); return; }
      var key = 'fortification_row_' + i;
      reg[key] = { name: row.name, base_effects: row.vehicle_effects };
      parts.push({ key: key });
    });
    if (itemIds.length) {
      var seed = base.defense_ranged != null ? base.defense_ranged : 0;   // C-D327-1: an unprinted defence counts from 0
      var applied = Crafting.applyCraftingSpend({ defense_ranged: seed }, itemIds, index, { kind: 'fortification' });
      out.defense_ranged = Math.max(0, applied.profile.defense_ranged);   // C-D327-1: floored at 0 (the page is silent)
      out.because.defense_ranged = itemIds.map(function (id) {
        var r = index[id].row || index[id];
        return { source: r.name, amount: r.effects.reduce(function (n, x) { return n + (Number(x.value) || 0); }, 0) };
      });
    }
    if (parts.length) {
      var hull = {};
      ['passengers', 'armor', 'hull_trauma', 'silhouette', 'speed'].forEach(function (f) { if (base[f] != null) hull[f] = base[f]; });
      var v = vesselResolve().resolve({ attachments: parts }, hull, { attachments: reg });
      ['passengers', 'armor'].forEach(function (f) {
        if (base[f] == null) return;
        out[f] = v[f];
        if (v.because && v.because[f]) out.because[f] = v.because[f];
      });
    }
    return out;
  }

  // Skipping the name is FINE (never required) — but two identical rows in a loadout is not, so the
  // default distinguishes. Grade chips answer "which is better"; the name only has to answer "which".
  function defaultName(template, siblings) {
    var base = (template && template.name) || 'Crafted item';
    var names = {};
    (siblings || []).forEach(function (n) { if (n) names[String(n).toLowerCase()] = 1; });
    if (!names[base.toLowerCase()]) return base;
    var n = 2;
    while (names[(base + ' ' + n).toLowerCase()]) n += 1;
    return base + ' ' + n;
  }

  // ── remembered effects (the workshop strip) ────────────────────────────────
  // The app does not ENFORCE these; it refuses to forget them. Same posture as the GM's flaws.
  function rememberable(rowIds, index) {
    return (rowIds || []).filter(function (id) {
      var e = index && index[id];
      if (!e) return false;
      return Crafting.unappliedRowIds(index).indexOf(id) !== -1;   // told rows of THIS index's category (R-R5CC-1)
    });
  }
  function addNotes(notes, rowIds, craftId) {
    var out = (notes || []).slice();
    (rowIds || []).forEach(function (id) { out.push({ row_id: id, craft_id: craftId }); });
    return out;
  }
  function dismissNote(notes, i) {
    var out = (notes || []).slice();
    out.splice(i, 1);
    return out;
  }

  var api = {
    STAGES: STAGES, ACQ_METHODS: ACQ_METHODS, MAX_TIER: MAX_TIER,
    mintId: mintId, newProject: newProject,
    acquireMaterials: acquireMaterials, logRoll: logRoll, tallyOf: tallyOf, validChoice: validChoice, setChoice: setChoice,
    netSuccesses: netSuccesses, outcome: outcome, buildHours: buildHours,
    indexSpend: indexSpend, tierOf: tierOf, gradeOf: gradeOf,
    affordable: affordable, affordableFrom: affordableFrom, spendLedger: spendLedger, costOf: costOf, MARK_LESS: MARK_LESS, MARK_FLOOR: MARK_FLOOR, toggleRow: toggleRow, eligible: eligible,
    limitOf: limitOf, timesTaken: timesTaken, takeAgain: takeAgain, dropOne: dropOne, isArmorProfile: isArmorProfile,
    setPick: setPick, isDroidProfile: isDroidProfile, isDirectiveProfile: isDirectiveProfile,
    buildItem: buildItem, landingOf: landingOf, defaultName: defaultName,
    outputOf: outputOf, landItem: landItem, isFortificationProfile: isFortificationProfile, fortificationOf: fortificationOf, siblingNames: siblingNames, offeredTemplates: offeredTemplates,
    isAlchemy: isAlchemy, craftGate: craftGate, craftForceDice: craftForceDice, ALCHEMY_REFUSED: ALCHEMY_REFUSED,
    groupTaken: groupTaken, groupConflicts: groupConflicts,
    schematicLevel: schematicLevel, schematicDiff: schematicDiff, addSchematicLevel: addSchematicLevel, schematicPatch: schematicPatch,
    rememberable: rememberable, addNotes: addNotes, dismissNote: dismissNote,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof root !== 'undefined') root.SWRPGCraft = api;
})(typeof window !== 'undefined' ? window : this);
