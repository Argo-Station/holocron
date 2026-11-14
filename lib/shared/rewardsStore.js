/* lib/shared/rewardsStore.js — R6 lane C (card `release-r6-backend` §5): a character's Rewards and contact networks.
 *
 * TWO ARRAYS ON THE SAVED SHEET, no new storage key (release-r4-shapes R-R4S-1: `sheetData` rides whole, so backup, sync
 * and the no-loss legs carry them). This module is their only writer, so the contract lives in one place:
 *
 *   sheetData.rewards[]   { id: 'rwd-<base36>', key, tier, name, level, skills[], xp, talent }   — release-r4-shapes S2
 *                         + `improvement` on a MAKERSMARK row only (S2 as amended by ADDENDUM 4; ruling
 *                         `release-r6-rewards-c0` R-R6RC-3): the crafting_spend.json row id the mark cheapens.
 *   sheetData.contacts[]  { id: 'cnt-<base36>', name, skill, scope 1..5, expertise 1..5, xp }   — release-r4-shapes S3
 *
 * THREE THINGS THE RULINGS FIXED, and where each lives here:
 *   · NOTHING DISPLAYED IS STORED (charter §8). A reward's words, dice and price resolve from
 *     `public/data/canonical/rewards.json` at render; a network's pool is built by diceEngine.buildPool from Scope and
 *     Expertise. The HONTITLE kind is derived from the row's `skills` (R-R6RC-2), never stored.
 *   · ONE XP LEDGER (S2, "XP paid writes through the existing XP ledger"): every buy returns ONE sheet patch carrying
 *     its row AND `xp` { spent, remaining } moved by the price, the same two fields the growth room's other buyers write.
 *   · WHAT A NORMALIZER DOES NOT KNOW, IT KEEPS (vesselStore's `keep`, R-S3K-1 (a)): a field a newer build wrote rides
 *     through every read and write untouched.
 *
 * `max_shown` (APPRENTICE 1, BS 3) is NEVER read by a writer here: shown, never enforced (R-R6RC-1, rider 4).
 * Classic script → window.SWRPGRewards; node-safe (module.exports). Pure: no function writes its arguments.
 */
(function (root) {
  'use strict';

  var REWARD_KEYS = ['ALLY', 'APPRENTICE', 'FOLLOWER', 'SCHOOL', 'HONTITLE', 'REP', 'MEDALS', 'MEDALSCAMP',
    'DECORATIONS', 'BS', 'MAKERSMARK', 'PROVENEXP', 'EXPLOIT', 'ACE', 'TROPHY'];
  var RATING_MIN = 1, RATING_MAX = 5;   // Endless Vigil p.77, Table 3-6 (S3: scope/expertise 1..5)

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
  function str(v) { return typeof v === 'string' ? v : (v == null ? '' : String(v)); }
  function strOrNull(v) { return typeof v === 'string' && v ? v : null; }
  function int0(v) { var n = Math.floor(Number(v)); return isFinite(n) && n > 0 ? n : 0; }
  function clampRating(v) { var n = Math.floor(Number(v)); return isFinite(n) ? Math.min(RATING_MAX, Math.max(RATING_MIN, n)) : RATING_MIN; }
  function mintId(prefix, existing) {
    var taken = {};
    (existing || []).forEach(function (r) { if (r && r.id) taken[r.id] = 1; });
    var id;
    do { id = prefix + '-' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36); } while (taken[id]);
    return id;
  }

  // ── normalizers (the `keep` idiom; drop only what is not a row) ─────────────────────────────────────────
  function normalizeReward(r) {
    if (!r || typeof r !== 'object' || Array.isArray(r) || !strOrNull(r.key)) return null;
    var level = r.level == null ? null : Math.floor(Number(r.level));
    var known = {
      id: strOrNull(r.id),
      key: r.key,
      tier: strOrNull(r.tier),
      name: str(r.name),
      level: (level != null && isFinite(level) && level >= -3 && level <= 3) ? level : null,
      skills: Array.isArray(r.skills) ? r.skills.filter(function (s) { return typeof s === 'string' && s; }) : [],
      xp: int0(r.xp),
      talent: strOrNull(r.talent),
    };
    // S2 ADDENDUM 4: `improvement` is MAKERSMARK's alone; a stray one on another key is KEPT as stored (keep) and read by nothing
    if (r.key === 'MAKERSMARK') known.improvement = strOrNull(r.improvement);
    return keep(r, known);
  }
  function normalizeRewards(list) {
    return (Array.isArray(list) ? list : []).map(normalizeReward).filter(Boolean);
  }
  function normalizeContact(c) {
    if (!c || typeof c !== 'object' || Array.isArray(c)) return null;
    return keep(c, {
      id: strOrNull(c.id),
      name: str(c.name),
      skill: str(c.skill),
      scope: clampRating(c.scope),
      expertise: clampRating(c.expertise),
      xp: int0(c.xp),
    });
  }
  function normalizeContacts(list) {
    return (Array.isArray(list) ? list : []).map(normalizeContact).filter(Boolean);
  }

  // ── THE ONE XP LEDGER: the patch's `xp`, moved as the growth room's buyers move it ─────────────────────
  function available(sheet) {
    var xp = (sheet && sheet.xp) || {};
    return xp.remaining != null ? Number(xp.remaining) || 0 : (Number(xp.total) || 0) - (Number(xp.spent) || 0);
  }
  function charge(sheet, cost) {
    var xp = (sheet && sheet.xp) || { total: 0, spent: 0, remaining: 0 };
    var left = available(sheet);
    if (cost > left) return { ok: false, reason: 'not enough XP: ' + cost + ' needed, ' + left + ' left' };
    return { ok: true, xp: Object.assign({}, xp, { remaining: left - cost, spent: (Number(xp.spent) || 0) + cost }) };
  }
  function refused(reason) { return { ok: false, reason: reason }; }

  // ── the registry, read ───────────────────────────────────────────────────────────────────────────────
  function typeOf(reg, key) {
    var t = reg && (reg.types || reg);
    return (t && Object.prototype.hasOwnProperty.call(t, key)) ? t[key] : null;
  }
  // the tier a row holds (null for none), and the tier after it (null at the top) — bought in order (KoF p.94)
  function tierIndex(type, tierKey) {
    var tiers = (type && type.tiers) || [];
    for (var i = 0; i < tiers.length; i++) if (tiers[i].key === tierKey) return i;
    return -1;
  }
  function nextTier(reg, row, key) {
    var type = typeOf(reg, row ? row.key : key);
    if (!type || type.kind !== 'bought') return null;
    var i = row ? tierIndex(type, row.tier) : -1;
    return type.tiers[i + 1] || null;
  }
  // R-R6RC-2: the HONTITLE kind, derived from the row's two skills; null when the pair matches no kind
  function titleKindOf(reg, row) {
    var type = typeOf(reg, 'HONTITLE');
    if (!type || !row) return null;
    var have = (row.skills || []).slice().sort().join('|');
    var hit = (type.kinds || []).filter(function (k) { return k.skills.slice().sort().join('|') === have; })[0];
    return hit || null;
  }

  // ── reward writers: each → { ok, patch: { rewards, xp? }, row } or { ok: false, reason } ────────────────
  // buyRewardTier: the NEXT tier of a bought type (ALLY, APPRENTICE, FOLLOWER, SCHOOL, HONTITLE). With `rowId` it raises
  // that row (the new tier replaces the old one; S2's `xp` sums them, R4 S2); without, it opens the type's first tier as a
  // new row. HONTITLE's first tier needs `skills` that name a kind (Knights of Fate p.92).
  function buyRewardTier(sheet, reg, opts) {
    opts = opts || {};
    var rows = normalizeRewards(sheet && sheet.rewards);
    var row = opts.rowId ? rows.filter(function (r) { return r.id === opts.rowId; })[0] : null;
    if (opts.rowId && !row) return refused('no reward row ' + opts.rowId);
    var key = row ? row.key : opts.key;
    var type = typeOf(reg, key);
    if (!type) return refused('no reward type ' + key);
    if (type.kind !== 'bought') return refused(key + ' is not bought with XP');
    var tier = nextTier(reg, row, key);
    if (!tier) return refused(key + ' is at its top tier');
    var c = charge(sheet, tier.xp);
    if (!c.ok) return c;
    var out;
    if (row) {
      out = Object.assign({}, row, { tier: tier.key, xp: row.xp + tier.xp });
      rows = rows.map(function (r) { return r.id === row.id ? out : r; });
    } else {
      var skills = Array.isArray(opts.skills) ? opts.skills.slice() : [];
      if (key === 'HONTITLE' && !titleKindOf(reg, { skills: skills })) return refused('a title needs its kind\'s two skills');
      out = normalizeReward({ id: mintId('rwd', rows), key: key, tier: tier.key, name: str(opts.name), level: null,
        skills: skills, xp: tier.xp, talent: null });
      rows = rows.concat([out]);
    }
    return { ok: true, patch: { rewards: rows, xp: c.xp }, row: out };
  }
  // buyBattleScar: a talent bought at the scar's price by the injury's severity (Forged in Battle p.95; D-280 (3)).
  // Any talents.json id may be bought (the book's lists are suggestions); the talent reaches the engine through
  // charResolve's scarTalentGrants (R-R4D-4), never sheet.talents.
  function buyBattleScar(sheet, reg, opts) {
    opts = opts || {};
    var type = typeOf(reg, 'BS');
    var tier = (type && type.tiers || []).filter(function (t) { return t.key === opts.tier; })[0];
    if (!tier) return refused('no Battle Scar severity ' + opts.tier);
    if (!strOrNull(opts.talent)) return refused('a Battle Scar buys a talent');
    var c = charge(sheet, tier.xp);
    if (!c.ok) return c;
    var rows = normalizeRewards(sheet && sheet.rewards);
    var row = normalizeReward({ id: mintId('rwd', rows), key: 'BS', tier: tier.key, name: str(opts.name), level: null,
      skills: [], xp: tier.xp, talent: opts.talent });
    return { ok: true, patch: { rewards: rows.concat([row]), xp: c.xp }, row: row };
  }
  // giveReward: any type, given by the GM, no XP (S2's `＋ GIVEN BY THE GM`). REP takes a level and its tier is the
  // matching option key (S2: `tier` and `level` agree); MAKERSMARK may carry its `improvement`.
  function giveReward(sheet, reg, opts) {
    opts = opts || {};
    var type = typeOf(reg, opts.key);
    if (!type) return refused('no reward type ' + opts.key);
    var rows = normalizeRewards(sheet && sheet.rewards);
    var fields = { id: mintId('rwd', rows), key: opts.key, tier: strOrNull(opts.tier), name: str(opts.name), level: null,
      skills: Array.isArray(opts.skills) ? opts.skills.slice() : [], xp: 0, talent: strOrNull(opts.talent) };
    if (opts.key === 'REP') {
      var lv = repOption(type, opts.level);
      if (!lv) return refused('Reputation runs -3..3');
      fields.level = lv.level; fields.tier = lv.key;
    }
    if (opts.key === 'MAKERSMARK') fields.improvement = strOrNull(opts.improvement);
    var row = normalizeReward(fields);
    return { ok: true, patch: { rewards: rows.concat([row]) }, row: row };
  }
  function repOption(type, level) {
    var n = Math.floor(Number(level));
    return ((type && type.options) || []).filter(function (o) { return o.level === n; })[0] || null;
  }
  // setReputation: the GM moves a sphere one step at an arc's end (Keeping the Peace p.92); any level -3..3 is accepted
  // (the book's step is the table's to keep). `tier` follows `level`.
  function setReputation(sheet, reg, rowId, level) {
    var rows = normalizeRewards(sheet && sheet.rewards);
    var row = rows.filter(function (r) { return r.id === rowId && r.key === 'REP'; })[0];
    if (!row) return refused('no Reputation row ' + rowId);
    var lv = repOption(typeOf(reg, 'REP'), level);
    if (!lv) return refused('Reputation runs -3..3');
    var out = Object.assign({}, row, { level: lv.level, tier: lv.key });
    return { ok: true, patch: { rewards: rows.map(function (r) { return r.id === rowId ? out : r; }) }, row: out };
  }

  // ── contact networks (Endless Vigil pp.77–79) ──────────────────────────────────────────────────────────
  function careerOf(sheet, charbuild, skillId) {
    var CR = (typeof window !== 'undefined' && window.CharResolve) || (root && root.CharResolve) || null;
    if (!CR && typeof require === 'function') { try { CR = require('./charResolve.js'); } catch (e) { CR = null; } }
    if (!CR || typeof CR.careerSkillStatus !== 'function') return false;
    var st = CR.careerSkillStatus(sheet || {}, charbuild || {});
    return Object.keys(st).some(function (k) { return st[k] && st[k].id === skillId && st[k].career; });
  }
  // the price: a new network 10 XP; raising Scope or Expertise 5 XP × the new rating; +5 XP each time on a non-career
  // Knowledge skill (Endless Vigil pp.78–79). Career status from the one character core (careerSkillStatus).
  function contactPrice(sheet, charbuild, skillId, newRating) {
    var base = newRating == null ? 10 : 5 * newRating;
    return base + (careerOf(sheet, charbuild, skillId) ? 0 : 5);
  }
  // buyContact: a new network at Scope 1, Expertise 1. RAW prints no starting ratings for a bought network (Endless
  // Vigil p.78, silent, R-RRD-1: reported); the approved drawing's `New network · 10 XP` asks only the skill and name.
  function buyContact(sheet, charbuild, opts) {
    opts = opts || {};
    if (!strOrNull(opts.skill)) return refused('a network ties to one Knowledge skill');
    var cost = contactPrice(sheet, charbuild, opts.skill, null);
    var c = charge(sheet, cost);
    if (!c.ok) return c;
    var rows = normalizeContacts(sheet && sheet.contacts);
    var row = normalizeContact({ id: mintId('cnt', rows), name: str(opts.name), skill: opts.skill, scope: 1, expertise: 1, xp: cost });
    return { ok: true, patch: { contacts: rows.concat([row]), xp: c.xp }, row: row, cost: cost };
  }
  // raiseContact: Scope or Expertise up by one, to 5
  function raiseContact(sheet, charbuild, id, which) {
    if (which !== 'scope' && which !== 'expertise') return refused('raise scope or expertise');
    var rows = normalizeContacts(sheet && sheet.contacts);
    var row = rows.filter(function (r) { return r.id === id; })[0];
    if (!row) return refused('no network ' + id);
    if (row[which] >= RATING_MAX) return refused(which + ' is at ' + RATING_MAX);
    var cost = contactPrice(sheet, charbuild, row.skill, row[which] + 1);
    var c = charge(sheet, cost);
    if (!c.ok) return c;
    var out = Object.assign({}, row, { xp: row.xp + cost });
    out[which] = row[which] + 1;
    return { ok: true, patch: { contacts: rows.map(function (r) { return r.id === id ? out : r; }), xp: c.xp }, row: out, cost: cost };
  }
  // giveContact: a GM's award, no XP — a narrative award at the ratings the GM picks, or the "prominent in a field" award
  // (the GM's choice; one rating ranks − 1, the other ranks − 2, minimum 1; Endless Vigil p.78). Never auto-granted.
  function giveContact(sheet, opts) {
    opts = opts || {};
    if (!strOrNull(opts.skill)) return refused('a network ties to one Knowledge skill');
    var rows = normalizeContacts(sheet && sheet.contacts);
    var row = normalizeContact({ id: mintId('cnt', rows), name: str(opts.name), skill: opts.skill,
      scope: opts.scope, expertise: opts.expertise, xp: 0 });
    return { ok: true, patch: { contacts: rows.concat([row]) }, row: row };
  }
  // the prominent award's two ratings for `ranks` in the skill; which one is −1 is the GM's pick (`scopeHigher`)
  function prominentRatings(ranks, scopeHigher) {
    var hi = Math.max(1, (Number(ranks) || 0) - 1), lo = Math.max(1, (Number(ranks) || 0) - 2);
    return scopeHigher ? { scope: hi, expertise: lo } : { scope: lo, expertise: hi };
  }

  // ── removal (B-1533; `release-r7-bug-burndown` ADDENDA 460, 461): the whole row, every kind, gift or bought ─────────────
  // A correction, not a play rule (RAW is silent). The refund is what the row paid, `row.xp`, floored by what `spent` holds;
  // `refund` is the amount that moved and is what a confirm prints. `total` is kept; nothing moves, no `xp` in the patch.
  // opts.held refuses (460 Q4): this pure module cannot read the hold, so the face passes it in, and draws no Remove either.
  function moveBack(sheet, paid) {
    var xp = (sheet && sheet.xp) || {};
    var spent = Math.max(0, Number(xp.spent) || 0);
    var refund = Math.min(spent, paid);
    return { refund: refund, xp: Object.assign({}, xp, { spent: spent - refund, remaining: available(sheet) + refund }) };
  }
  // A scar's talent leaves at render; a per-talent pick stored for it would come back unasked on a re-buy (460 Q3, measured by
  // test/b1533_reward_remove.cjs). It goes with the talent's last source THE SHEET CAN SEE. A talent a species or implant also
  // grants needs the registries to see: there the pick is asked again, which adds nothing unasked (R-M8K-6's fail closed).
  function scarPickCleared(sheet, rest, row) {
    var tc = sheet && sheet.talentChoices, at = tc && tc._talent;
    if (row.key !== 'BS' || !row.talent || !at || !Object.prototype.hasOwnProperty.call(at, row.talent)) return null;
    if (rest.some(function (r) { return r.key === 'BS' && r.talent === row.talent; })) return null;
    var owns = function (t) { return t && t.id === row.talent; };
    if ((Array.isArray(sheet.talents) && sheet.talents.some(owns)) || (Array.isArray(sheet.treelessTalents) && sheet.treelessTalents.some(owns))) return null;
    var left = Object.assign({}, at);
    delete left[row.talent];
    var out = Object.assign({}, tc);
    if (Object.keys(left).length) out._talent = left; else delete out._talent;
    return out;
  }
  function removeReward(sheet, id, opts) {
    if (opts && opts.held) return refused('buying is held');
    var rows = normalizeRewards(sheet && sheet.rewards);
    var row = id ? rows.filter(function (r) { return r.id === id; })[0] : null;
    if (!row) return refused('no reward row ' + id);
    var rest = rows.filter(function (r) { return r.id !== id; });
    var picks = scarPickCleared(sheet, rest, row);
    var back = moveBack(sheet, row.xp);
    var out = !back.refund ? { ok: true, patch: { rewards: rest }, row: row, refund: 0 }
      : { ok: true, patch: { rewards: rest, xp: back.xp }, row: row, refund: back.refund };
    if (picks) out.patch.talentChoices = picks;
    return out;
  }
  function removeContact(sheet, id, opts) {
    if (opts && opts.held) return refused('buying is held');
    var rows = normalizeContacts(sheet && sheet.contacts);
    var row = id ? rows.filter(function (r) { return r.id === id; })[0] : null;
    if (!row) return refused('no network ' + id);
    var rest = rows.filter(function (r) { return r.id !== id; });
    var back = moveBack(sheet, row.xp);
    if (!back.refund) return { ok: true, patch: { contacts: rest }, row: row, refund: 0 };
    return { ok: true, patch: { contacts: rest, xp: back.xp }, row: row, refund: back.refund };
  }

  // ── pools, from the one dice core ───────────────────────────────────────────────────────────────────
  function dice() {
    var D = (typeof window !== 'undefined' && window.SWRPGDice) || null;
    if (!D && typeof require === 'function') { try { D = require('./diceEngine.js'); } catch (e) { D = null; } }
    return D;
  }
  // a network's check: Scope counts as the characteristic, Expertise as the skill ranks (Endless Vigil p.77).
  // contactSpec is the spec the pool is built from (card release-r6-ui ADDENDUM 5): the dice hub rolls it as an ordinary
  // spec row; contactPool is buildPool of it, unchanged.
  function contactSpec(contact) {
    var c = normalizeContact(contact);
    return c ? { characteristic: c.scope, skillRank: c.expertise } : null;
  }
  function contactPool(contact) {
    var spec = contactSpec(contact);
    return spec ? dice().buildPool(spec) : null;
  }
  // an Ally's or Follower's check: the tier's printed pool, with a School's part that targets it folded in (Knights of
  // Fate p.95). → { pool, symbols: { success, advantage }, per, skills } or null. The School's dice are the sheet's
  // highest School row's (a character has one school).
  // rewardSpec → { spec, symbols, per, skills } or null: the spec rewardPool builds from (ADDENDUM 5)
  function rewardSpec(reg, sheet, rowId) {
    var rows = normalizeRewards(sheet && sheet.rewards);
    var row = rows.filter(function (r) { return r.id === rowId; })[0];
    if (!row) return null;
    var type = typeOf(reg, row.key);
    var tier = type && (type.tiers || [])[tierIndex(type, row.tier)];
    var fx = tier && tier.effect;
    if (!fx || !fx.pool) return null;
    var spec = { characteristic: fx.pool.ability + fx.pool.proficiency, skillRank: fx.pool.proficiency, boost: 0, upgradeAbility: 0 };
    var symbols = { success: 0, advantage: 0 };
    var school = typeOf(reg, 'SCHOOL');
    var best = -1;
    rows.forEach(function (r) { if (r.key === 'SCHOOL') best = Math.max(best, tierIndex(school, r.tier)); });
    var parts = best >= 0 ? school.tiers[best].effect : [];
    (Array.isArray(parts) ? parts : [parts]).forEach(function (p) {
      if (!p || (p.targets || []).indexOf(row.key) === -1) return;
      (p.mods || []).forEach(function (m) {
        if (m.die === 'boost' && m.direction === 'add') spec.boost += m.count;
        else if (m.die === 'ability' && m.direction === 'upgrade') spec.upgradeAbility += m.count;
        else if (m.symbol && symbols[m.symbol] != null) symbols[m.symbol] += m.count;
      });
    });
    return { spec: spec, symbols: symbols, per: fx.per || null, skills: fx.skills || [] };
  }
  function rewardPool(reg, sheet, rowId) {
    var r = rewardSpec(reg, sheet, rowId);
    return r ? { pool: dice().buildPool(r.spec), symbols: r.symbols, per: r.per, skills: r.skills } : null;
  }

  var api = {
    REWARD_KEYS: REWARD_KEYS, RATING_MIN: RATING_MIN, RATING_MAX: RATING_MAX,
    normalizeReward: normalizeReward, normalizeRewards: normalizeRewards,
    normalizeContact: normalizeContact, normalizeContacts: normalizeContacts,
    nextTier: nextTier, titleKindOf: titleKindOf,
    buyRewardTier: buyRewardTier, buyBattleScar: buyBattleScar, giveReward: giveReward, setReputation: setReputation,
    contactPrice: contactPrice, buyContact: buyContact, raiseContact: raiseContact, giveContact: giveContact,
    removeReward: removeReward, removeContact: removeContact,
    prominentRatings: prominentRatings, contactPool: contactPool, rewardPool: rewardPool,
    contactSpec: contactSpec, rewardSpec: rewardSpec,   // card release-r6-ui ADDENDUM 5: the specs the hub rolls
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SWRPGRewards = api;
})(typeof window !== 'undefined' ? window : this);
