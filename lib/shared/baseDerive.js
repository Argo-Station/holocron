/* lib/shared/baseDerive.js — S4's DERIVED base numbers (R6 lane D), pure: a group base + the bases registry → the
 * numbers the books print. Nothing here is stored (release-r4-shapes A1.3: "Derived at render, never stored").
 *
 * The save shape it reads is S4's (`party.bases[]`, normalized by partyStore.js), amended by ruling
 * `release-r6-bases-registry` Q3 (i) with `focusSkill`:
 *   { id, type, name, place, focus, focusSkill?, start: 'creation'|'bought'|'reward'|'story',
 *     upgrades: [ { key, option, paid: 'credits'|'obligation'|'rank'|'story' } ], notes }
 * The registry is public/data/canonical/bases.json (scripts/canonical/build_bases.py).
 *
 * The rules, each from its printed page:
 *  - obligation: the basic cost's 5 Obligation unless the base was taken `start: 'creation'` in lieu of the starting
 *    ship (Far Horizons pp.82, 84), plus each `paid: 'obligation'` upgrade's printed Obligation, which "increases the
 *    magnitude of the original Obligation" (p.82). A type with no Obligation prices (Rebel base, civilian facility)
 *    adds 0 for such an entry — it is kept as stored.
 *  - profit: per member per month, the type's printed amount × its Increase Core Focus purchases (FH pp.83, 85).
 *    Shown, never credited: a month is table time.
 *  - purchasesLeft: the printed count less the entries bought (null = no printed cap); for a "different option each
 *    time" upgrade, the options still unpicked.
 *  - careerSkills: the focus skill (FH p.84: "a career skill for all party members"; Service's is the stored
 *    `focusSkill` when it is on the focus's list) and a Rebel base Training Facility's chosen skill (Desperate Allies
 *    p.89). Several bases grant the UNION (R-R4S-8; a grant owned twice counts once).
 *  - unconcealed: a civilian facility's refits not taken by rank (Fully Operational p.75: rank refits are Concealed).
 *    Concealed Upgrades (D-373) is not itself a refit that draws notice, so it is not counted; WHICH refit a purchase of
 *    it conceals has no field (ruling `release-r6-bases-registry` Q3 (iii) (a)), so its effect is the table's.
 * An entry whose key is not among its type's upgrades, or a focus not among its type's foci, is kept as stored and
 * derives nothing (old data is history).
 *
 * Classic script → window.SWRPGBaseDerive; CommonJS for node (test/base_derive.cjs, charResolve's group read).
 */
(function (global) {
  'use strict';

  function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function list(v) { return Array.isArray(v) ? v : []; }
  function typeOf(base, reg) { return isObj(base) && reg && reg.types ? reg.types[base.type] || null : null; }
  // the base's upgrade entries that belong to its type (the only ones that derive anything)
  function ownedEntries(base, reg) {
    var t = typeOf(base, reg);
    if (!t) return [];
    return list(base.upgrades).filter(function (u) {
      return isObj(u) && t.upgrades.indexOf(u.key) !== -1 && reg.upgrades[u.key];
    });
  }

  function obligation(base, reg) {
    var t = typeOf(base, reg), out = { total: 0, parts: [] };
    if (!t) return out;
    if (t.cost && t.cost.obligation && base.start !== t.cost.waived_when) {
      out.parts.push({ why: 'basic', amount: t.cost.obligation, cite: t.cite });
    }
    var paysObl = t.pays.indexOf('obligation') !== -1;
    ownedEntries(base, reg).forEach(function (u) {
      var rec = reg.upgrades[u.key];
      if (u.paid === 'obligation' && paysObl && rec.obligation) {
        out.parts.push({ why: 'upgrade', key: u.key, amount: rec.obligation, cite: rec.cite });
      }
    });
    out.parts.forEach(function (p) { out.total += p.amount; });
    return out;
  }

  function profit(base, reg) {
    var t = typeOf(base, reg);
    if (!t || !t.profit) return { perMemberPerMonth: 0, purchases: 0, cite: null, rule: null };
    var n = ownedEntries(base, reg).filter(function (u) { return u.key === t.profit.upgrade; }).length;
    var rec = reg.upgrades[t.profit.upgrade];
    n = rec && rec.count != null ? Math.min(n, rec.count) : n;
    // `rule`: the sidebar told beside the line (FH p.82 — the GM may lower a month's profit; no number, so nothing here)
    return { perMemberPerMonth: n * t.profit.per_member_per_month, purchases: n, cite: rec ? rec.cite : t.cite,
             rule: t.profit.text ? { text: t.profit.text, cite: t.profit.cite } : null };
  }

  function purchasesLeft(base, reg) {
    var t = typeOf(base, reg), out = {};
    if (!t) return out;
    var owned = ownedEntries(base, reg);
    t.upgrades.forEach(function (key) {
      var rec = reg.upgrades[key];
      if (!rec) return;
      var mine = owned.filter(function (u) { return u.key === key; });
      var row = { left: rec.count == null ? null : Math.max(0, rec.count - mine.length) };
      if (rec.distinct_options && rec.options) {
        var picked = mine.map(function (u) { return u.option; });
        row.options = rec.options.map(function (o) { return o.key; }).filter(function (k) { return picked.indexOf(k) === -1; });
      }
      out[key] = row;
    });
    return out;
  }

  // → [{ skill, because: 'group-base:<id>' | 'group-train:<id>', base: <id> }], in grant order
  function careerSkills(base, reg) {
    var t = typeOf(base, reg), out = [];
    if (!t) return out;
    var id = String(base.id == null ? '' : base.id);
    var f = t.foci.indexOf(base.focus) !== -1 ? reg.foci[base.focus] : null;
    if (f) {
      var s = f.skill || null;
      if (!s && f.choose && Array.isArray(f.choose.from) && f.choose.from.indexOf(base.focusSkill) !== -1) s = base.focusSkill;
      if (s) out.push({ skill: s, because: 'group-base:' + id, base: id });
    }
    ownedEntries(base, reg).forEach(function (u) {
      var rec = reg.upgrades[u.key];
      (rec.options || []).forEach(function (o) {
        if (o.key === u.option && o.skill) out.push({ skill: o.skill, because: 'group-train:' + id, base: id });
      });
    });
    return out;
  }

  // every base of a group → the union, first grant kept (a skill owned twice counts once)
  function groupCareerSkills(bases, reg) {
    var seen = {}, out = [];
    list(bases).forEach(function (b) {
      careerSkills(b, reg).forEach(function (g) { if (!seen[g.skill]) { seen[g.skill] = 1; out.push(g); } });
    });
    return out;
  }

  function unconcealed(base, reg) {
    var t = typeOf(base, reg);
    if (!t || t.key !== 'CIVREFIT') return 0;
    return ownedEntries(base, reg).filter(function (u) { return u.paid !== 'rank' && u.key !== 'CIVREFITCONCEAL'; }).length;
  }

  var api = {
    obligation: obligation, profit: profit, purchasesLeft: purchasesLeft,
    careerSkills: careerSkills, groupCareerSkills: groupCareerSkills, unconcealed: unconcealed,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.SWRPGBaseDerive = api;
})(typeof window !== 'undefined' ? window : this);
