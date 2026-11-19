/* lib/shared/groupSummary.js — THE GROUP SUMMARY (window.SWRPGGroupSummary), computed ONCE, on the GM's device
 * (R-BSPD-1; ruling `between-sessions-lap-a-card` §3 item 3; shape `encounters-t2-shapes` §3 N-4):
 *   { at, duty: { total, parts: [ { name, value } ] }, obligation: { total, parts: [ { name, value, type } ] },
 *     rank, toNext, bases: [name], resource, ship: { name } | null }
 * Read from the campaign's group in swrpg_party_v1, the members' sheets through partyStore's own readers (dutyParts,
 * obligationParts, rankProgress), the bases through baseDerive against bases.json, and the vessels. `record` carries it
 * whole to each seat (tableSession); a player only displays it and never applies it to swrpg_party_v1 (BND-3).
 *
 *   of(campaign, at)              → the summary, or null when the campaign has no group on this device
 *   obligation(party, chars, reg) → { total, parts }: THE ONE OBLIGATION TOTAL — the members' and the group's rows
 *                                   (obligationParts), then each base's Obligation (baseDerive.obligation). The GM's
 *                                   own PARTY reads this function; no second sum (PRAXIS §5).
 *   ship(groupId)                 → { name } | null, R-BSBP-2 + build-paper ADDENDUM 1: the flagship of a fleet unit the
 *                                   group owns, else the group's vessel neither retired nor destroyed with the greatest
 *                                   createdAt (recency newerOf; a tie to the greater id), else null.
 *                                   The name is the vessel's nickname, else its vehicle-library name (loaded once,
 *                                   only when a group ship has no nickname), else its vehicleKey until that lands.
 *
 * Writes nothing. Tagged in the GM shell only: a player's device never produces one. Classic script; CommonJS for node
 * guards (test/group_summary.cjs). Globals (SWRPGParty, SWRPGBaseDerive, SWRPGVessels, SWRPGRecency, localStorage, fetch) read at CALL time.
 */
(function (global) {
  'use strict';

  var UNITS_KEY = 'swrpg_fleet_units_v1', TOMBS_KEY = 'swrpg_deleted_ids';
  function P() { return global.SWRPGParty || null; }
  function D() { return global.SWRPGBaseDerive || null; }
  function V() { return global.SWRPGVessels || null; }
  function num(v) { return typeof v === 'number' && isFinite(v) ? v : 0; }
  function json(k, d) { try { var ls = global.localStorage, v = ls ? JSON.parse(ls.getItem(k)) : null; return v == null ? d : v; } catch (e) { return d; } }

  function obligation(party, chars, reg) {
    var parts = [], Pa = P(), Bd = D();
    if (!party || !Pa) return { total: 0, parts: parts };
    Pa.obligationParts(party, chars).forEach(function (x) { parts.push({ name: x.name, value: x.magnitude, type: x.type }); });
    if (Bd && reg) (party.bases || []).forEach(function (b) {
      var o = Bd.obligation(b, reg);
      if (o.total) parts.push({ name: b.name || '', value: o.total, type: '' });
    });
    return { total: parts.reduce(function (n, x) { return n + num(x.value); }, 0), parts: parts };
  }

  // vehicle-library names, by key: loaded once, GM only, and only when asked for a ship with no nickname
  var _names = null, _asked = false;
  function libName(key) {
    if (_names) return _names[key] || null;
    if (!_asked && typeof global.fetch === 'function') {
      _asked = true;
      var got = {};
      global.fetch('/public/data/vehicle-library/index.json').then(function (r) { return r.json(); }).then(function (ix) {
        return Promise.all(Object.keys((ix && ix.shards) || {}).map(function (k) {
          return global.fetch('/public/data/vehicle-library/' + ix.shards[k].file).then(function (r) { return r.json(); })
            .then(function (l) { (Array.isArray(l) ? l : []).forEach(function (v) { if (v && v.key) got[v.key] = v.name; }); });
        }));
      }).then(function () { _names = got; }, function () {});
    }
    return null;
  }
  function ship(groupId) {
    var Vs = V(), gid = String(groupId || '');
    if (!Vs || !gid) return null;
    var vessels = (Vs.load().vessels || []), dead = json(TOMBS_KEY, []).map(String);
    var units = ((json(UNITS_KEY, {}) || {}).units || []).filter(function (u) { return u && u.owner === gid && u.flagship != null && dead.indexOf(String(u.id)) === -1; });
    var rec = null;
    units.some(function (u) { rec = vessels.filter(function (v) { return v.id === String(u.flagship); })[0] || null; return !!rec; });
    // build-paper ADDENDUM 1: the greatest createdAt through recency's newerOf; a tie (or no comparable stamp) to the
    // greater id, so two devices name the same ship
    var Rc = global.SWRPGRecency;
    if (!rec) rec = vessels.filter(function (v) { return v.owner === gid && !v.retired && !v.destroyed; }).reduce(function (best, v) {
      if (!best) return v;
      var n = Rc ? Rc.newerOf(v.createdAt, best.createdAt) : null;
      return n === 'a' || (n === null && String(v.id) > String(best.id)) ? v : best;
    }, null);
    return rec ? { name: rec.nickname || libName(rec.vehicleKey) || rec.vehicleKey } : null;
  }

  function of(campaign, at) {
    var Pa = P(), party = Pa && campaign && campaign.partyId ? Pa.partyOf(Pa.load(), campaign.partyId) : null;
    if (!party) return null;
    var reg = Pa.engineReader ? Pa.engineReader().bases : null, pr = Pa.rankProgress(party);
    return {
      at: at,
      duty: { total: pr.total, parts: Pa.dutyParts(party).map(function (x) { return { name: x.name, value: x.magnitude }; }) },
      obligation: obligation(party, undefined, reg),
      rank: pr.rank, toNext: pr.toNext,
      bases: (party.bases || []).map(function (b) { return b.name || ''; }),
      resource: party.resource || null,
      ship: ship(party.id),
    };
  }

  var api = { of: of, obligation: obligation, ship: ship };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.SWRPGGroupSummary = api;
})(typeof window !== 'undefined' ? window : globalThis);
