/* lib/shared/campaignStore.js — THE CAMPAIGN RECORD (ENCOUNTERS E6 plumbing): the one writer of `swrpg_campaigns`, for both apps.
 *
 * Save shape FIXED by ruling `encounters-e4-campaign-redraw` §5 (one record, two roles), on the envelope of
 * `encounters-e4-campaign-concept` §5; this module is its only writer, so the contract lives in one place:
 *
 *   { version: 1, campaigns: [ {
 *       id: 'camp_<uuid>',                        // globally unique: the tombstone list is shared by every LISTS key
 *       role: 'gm' | 'player',
 *       name: '',
 *       partyId: 'party_<uuid>' | null,           // a swrpg_party_v1 parties[].id; a dangling id reads as no party
 *       createdAt, updatedAt,                     // ms epoch; updatedAt stamped on every write (the stamp UNITS reads)
 *     // role 'gm' adds:
 *       cast: [_source_key],                      // the NPCs in play; an unresolvable key drops out at render
 *       log: [ { id: 'clog_<uuid>', at, kind: 'encounter' | 'session' | 'xp_sent', … } ],   // append-only: DELETE YES, EDIT NO
                                                 // xp_sent (R-E6F-6): { session: <a session entry's id>, offerId, amount }
 *       frame: { book, moralityLayer? } | null,   // the table profile seed, offered to a player as a proposal
 *     // role 'player' adds:
 *       characterIds: [savedCharacterId],         // the player's own characters here (the saved sheet is untouched)
 *       table: { gmCampaignId, gmLabel, lastSeen } | null,   // the link to a GM's campaign once paired
       frame: { book, moralityLayer? } | null,   // R-E6F-7: the GM's last table_hello frame; display-only, never applied
 *       inbox: [ { id, at, kind: 'xp', amount, fromLabel } ],  // offers the GM sent; ADD or DISMISS removes one
 *       handled: [offerId],                       // ids ADD or DISMISS removed; a re-sent offer never returns (never trimmed in v1)
 *   } ] }
 *
 * NEVER STORED: a party's members (the party store's), any sheet value, XP totals, Destiny, the encounter list (bench
 * v7 `group.campaignId` is the one link), the table link's keys or summaries (the link is in memory; R-E6W).
 *
 * THE PARTY PER CAMPAIGN (E4 §5 "the party, redrawn"; ruling `encounters-e6-plumbing` ADDENDUM 1, P1.2): every new
 * campaign, GM or player, makes its own `party_<uuid>` through SWRPGParty — never a second writer of swrpg_party_v1.
 * When a player's campaign receives the GM's `party`, the GM's record replaces that id on this device and the campaign
 * re-points at it. The campaign's old local party is removed only if no other campaign points at it AND it holds
 * nothing but members; otherwise it is kept, and the act says so (`kept`). A linked campaign's party refuses a local
 * edit (`editParty`); unlinked, the copy is the player's own. The vessel owner tag 'party' is untouched.
 *
 * THE INBOX (wire `encounters-e5-wire` §6 `xp_offer`, D-501 bind 4): `addOffer` is idempotent by offer id among the
 * offers HELD; `take` writes the player's own `sheet.xp` through SWRPGRoster.addXp (P4.1) — never anything the GM sent
 * — and refuses a character not in `characterIds` (P4.2); the offer goes only when the award held. `dismiss` writes no
 * sheet.
 *
 * Classic script → window.SWRPGCampaigns; CommonJS for node guards (test/campaign_store.cjs). Globals (localStorage,
 * SWRPGVersionGuard, SWRPGParty, SWRPGRoster, crypto) are read at CALL time. NO READER in either app yet (D-301).
 */
(function (global) {
  'use strict';

  var KEY = 'swrpg_campaigns';
  var SCHEMA_V = 1;
  var ROLES = ['gm', 'player'];
  var LOG_KINDS = ['encounter', 'session', 'xp_sent'];   // xp_sent: R-E6F-6 (ruling `encounters-e6-frames` ADDENDUM 2)
  var TOMBSTONES_KEY = 'swrpg_deleted_ids';
  var DELETED = '_deletedIds';
  var XP_MAX = 1000;                                       // wire §6 `xp_offer.amount`: integer 1–1000

  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function str(v) { return v == null ? '' : String(v); }
  function LS() {
    try { return (typeof window !== 'undefined' && window.localStorage) || (global && global.localStorage) || null; } catch (e) { return null; }
  }
  function VG() {
    var g = (typeof window !== 'undefined' && window.SWRPGVersionGuard) || (global && global.SWRPGVersionGuard);
    return g || { isAhead: function (raw, schema) { return typeof raw === 'number' && raw > schema; } };
  }
  function party() {
    var P = (typeof window !== 'undefined' && window.SWRPGParty) || (global && global.SWRPGParty) || null;
    if (!P && typeof require === 'function') { try { P = require('./partyStore.js'); } catch (e) { P = null; } }
    return P;
  }
  function roster() { return (typeof window !== 'undefined' && window.SWRPGRoster) || (global && global.SWRPGRoster) || null; }
  function now() { try { return Date.now(); } catch (e) { return 0; } }
  function uuid() {
    var c = (typeof crypto !== 'undefined' && crypto) || (global && global.crypto) || null;
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
    return now().toString(36) + '-' + Math.floor(Math.random() * 1e12).toString(36);
  }
  function stamp(v) { return typeof v === 'number' && isFinite(v) ? v : null; }

  // The record keeps every field it was handed (an older build never strips a newer one's field): the known fields are
  // normalized over the source, the rest ride unchanged — partyStore's `keep` idiom.
  function keep(src, known) {
    var out = {};
    if (isObj(src)) Object.keys(src).forEach(function (k) { out[k] = own(known, k) ? known[k] : src[k]; });
    Object.keys(known).forEach(function (k) { if (!own(out, k)) out[k] = known[k]; });
    return out;
  }
  function strList(list) {
    var seen = {}, out = [];
    (Array.isArray(list) ? list : []).forEach(function (x) {
      var s = x == null ? '' : String(x);
      if (s && !seen[s]) { seen[s] = 1; out.push(s); }
    });
    return out;
  }
  function normalizeFrame(f) {
    if (!isObj(f) || !str(f.book)) return null;
    var known = { book: str(f.book) };
    if (own(f, 'moralityLayer')) known.moralityLayer = f.moralityLayer;
    return keep(f, known);
  }
  function normalizeLogEntry(e) {
    if (!isObj(e) || !str(e.id)) return null;
    return keep(e, { id: str(e.id), at: stamp(e.at), kind: str(e.kind) });   // an unknown kind is kept as history, inert
  }
  function normalizeTable(t) {
    if (!isObj(t) || !str(t.gmCampaignId)) return null;
    return keep(t, { gmCampaignId: str(t.gmCampaignId), gmLabel: str(t.gmLabel), lastSeen: stamp(t.lastSeen) });
  }
  function amountOk(n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n && n >= 1 && n <= XP_MAX; }
  function normalizeOffer(o) {
    if (!isObj(o) || !str(o.id)) return null;
    return keep(o, { id: str(o.id), at: stamp(o.at), kind: str(o.kind), amount: o.amount, fromLabel: str(o.fromLabel) });
  }
  function byId(list, fn) {
    var seen = {};
    return (Array.isArray(list) ? list : []).map(fn).filter(function (x) {
      if (!x || seen[x.id]) return false;
      seen[x.id] = 1; return true;
    });
  }
  function normalizeCampaign(c) {
    if (!isObj(c) || !str(c.id)) return null;
    var known = {
      id: str(c.id),
      role: str(c.role),                                // an unknown role is kept as stored; no op writes it
      name: str(c.name),
      partyId: c.partyId == null || c.partyId === '' ? null : String(c.partyId),
      createdAt: stamp(c.createdAt),
      updatedAt: stamp(c.updatedAt),
    };
    if (known.role === 'gm') {
      known.cast = strList(c.cast);
      known.log = byId(c.log, normalizeLogEntry);
      known.frame = normalizeFrame(c.frame);
    } else if (known.role === 'player') {
      known.characterIds = strList(c.characterIds);
      known.table = normalizeTable(c.table);
      if (own(c, 'frame')) known.frame = normalizeFrame(c.frame);   // R-E6F-7 (absent on a record stored before it: kept absent)
      known.inbox = byId(c.inbox, normalizeOffer);
      known.handled = strList(c.handled);
    }
    return keep(c, known);
  }

  // ── persistence (versioned envelope; F-54 hold at module scope, as partyStore / vesselStore) ──
  var _stale = false;
  function readRaw() { var ls = LS(); try { return ls ? ls.getItem(KEY) : null; } catch (e) { return null; } }
  function fromRaw(raw) {
    var state = { version: SCHEMA_V, campaigns: [] }, ahead = false;
    try {
      var s = raw ? JSON.parse(raw) : null;
      if (isObj(s)) {
        var rawV = typeof s.version === 'number' ? s.version : SCHEMA_V;
        ahead = VG().isAhead(rawV, SCHEMA_V);           // a newer build's save is never ours to rewrite
        state = {};
        Object.keys(s).forEach(function (k) {
          if (k === 'stale') return;
          state[k] = k === 'version' ? rawV : k === 'campaigns'
            ? byId(s.campaigns, normalizeCampaign) : s[k];
        });
        if (!own(state, 'version')) state.version = rawV;
        if (!own(state, 'campaigns')) state.campaigns = [];
      }
    } catch (e) {}
    _stale = ahead;
    if (ahead) state.stale = true;                      // a read-only projection, never what the hold reads
    return state;
  }
  function load() { return fromRaw(readRaw()); }
  function isStale() { return _stale; }
  function envelope(state) {
    var out = {};
    Object.keys(state || {}).forEach(function (k) {
      if (k === 'stale') return;
      out[k] = k === 'version' ? SCHEMA_V : k === 'campaigns' ? byId(state.campaigns, normalizeCampaign) : state[k];
    });
    if (!own(out, 'version')) out.version = SCHEMA_V;
    if (!own(out, 'campaigns')) out.campaigns = [];
    return out;
  }
  // The shared tombstone list is only appended to (vesselStore V-4): a shape this build cannot read is left alone.
  function writeTombstones(ls, ids) {
    if (!ids || !ids.length) return;
    var raw = ls.getItem(TOMBSTONES_KEY), list;
    try { list = raw == null ? [] : JSON.parse(raw); } catch (e) { list = []; }
    if (list === null) list = [];
    if (!Array.isArray(list)) return;
    var have = {}, add = [];
    list.forEach(function (x) { have[String(x)] = true; });
    ids.forEach(function (id) { if (!have[id]) { have[id] = true; add.push(id); } });
    if (add.length) ls.setItem(TOMBSTONES_KEY, JSON.stringify(list.concat(add)));
  }
  // F-54: a stale state is never written back. Returns the written envelope, or null when nothing was written.
  function save(state) {
    if (_stale || (state && state.stale)) return null;
    var ls = LS();
    if (!ls) return null;
    var env = envelope(state);
    writeTombstones(ls, state && state[DELETED]);      // FIRST: a write cut short still reads as a delete
    ls.setItem(KEY, JSON.stringify(env));               // throws on quota: callers that must be atomic catch it
    return env;
  }

  // ── pure ops: (state, …) → new state. Each restamps the campaign it changes; a missing id is a no-op. ──
  function campaignOf(state, id) {
    var list = (state && state.campaigns) || [];
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i];
    return null;
  }
  function withCampaign(state, id, role, fn) {
    var base = state || { version: SCHEMA_V, campaigns: [] }, hit = false;
    var list = (base.campaigns || []).map(function (c) {
      if (!c || c.id !== id || (role && c.role !== role)) return c;
      var next = fn(c);
      if (next === c) return c;
      hit = true;
      return normalizeCampaign(Object.assign({}, next, { updatedAt: now() }));
    });
    return hit ? Object.assign({}, base, { campaigns: list }) : base;
  }
  // A new record (its party is the act's: `createCampaign`). Returns the state; the new id is `newRecord`'s.
  function newRecord(role, name, opts) {
    if (ROLES.indexOf(role) === -1) throw new Error('campaign: role must be gm or player');
    var t = now(), o = opts || {};
    var rec = { id: 'camp_' + uuid(), role: role, name: str(name), partyId: o.partyId == null ? null : String(o.partyId), createdAt: t, updatedAt: t };
    if (role === 'gm') { rec.cast = []; rec.log = []; rec.frame = normalizeFrame(o.frame); }
    else { rec.characterIds = []; rec.table = null; rec.frame = null; rec.inbox = []; rec.handled = []; }
    return normalizeCampaign(rec);
  }
  function addCampaign(state, rec) {
    var r = normalizeCampaign(rec);
    if (!r) return state;
    var base = state || { version: SCHEMA_V, campaigns: [] };
    if (campaignOf(base, r.id)) return base;
    return Object.assign({}, base, { campaigns: (base.campaigns || []).concat([r]) });
  }
  function removeCampaign(state, id) {
    var base = state || { version: SCHEMA_V, campaigns: [] }, gone = [];
    var kept = (base.campaigns || []).filter(function (c) {
      if (!c || c.id !== id) return true;
      gone.push(String(id)); return false;
    });
    if (!gone.length) return base;
    var next = Object.assign({}, base, { campaigns: kept });
    Object.defineProperty(next, DELETED, { value: gone });
    return next;
  }
  function setName(state, id, name) {
    return withCampaign(state, id, null, function (c) { return Object.assign({}, c, { name: str(name) }); });
  }
  // GM
  function setFrame(state, id, frame) {
    return withCampaign(state, id, 'gm', function (c) { return Object.assign({}, c, { frame: normalizeFrame(frame) }); });
  }
  function addCast(state, id, key) {
    return withCampaign(state, id, 'gm', function (c) {
      return !str(key) || c.cast.indexOf(str(key)) !== -1 ? c : Object.assign({}, c, { cast: c.cast.concat([str(key)]) });
    });
  }
  function removeCast(state, id, key) {
    return withCampaign(state, id, 'gm', function (c) {
      return c.cast.indexOf(str(key)) === -1 ? c : Object.assign({}, c, { cast: c.cast.filter(function (k) { return k !== str(key); }) });
    });
  }
  // DELETE YES, EDIT NO: an entry is appended (its id and `at` are the store's) or removed — never rewritten.
  function appendLog(state, id, entry) {
    if (!isObj(entry) || LOG_KINDS.indexOf(entry.kind) === -1) throw new Error('campaign log: kind must be ' + LOG_KINDS.join(', '));
    var e = normalizeLogEntry(Object.assign({}, entry, { id: 'clog_' + uuid(), at: now() }));
    return withCampaign(state, id, 'gm', function (c) { return Object.assign({}, c, { log: c.log.concat([e]) }); });
  }
  // R-E6F-6 (ruling `encounters-e6-frames` ADDENDUM 2): SEND XP on a SESSION line is the GM's tap, logged as ONE
  // `xp_sent` entry per session. `sendXp` appends it once; a second call (a re-send after a reload, D-E6P3 (a)) finds
  // it and answers the SAME offerId, so the player's `handled` refuses a second award. The answers are never logged.
  function xpSentOf(state, id, sessionId) {
    var c = campaignOf(state, id), hit = null;
    if (c && c.role === 'gm') c.log.forEach(function (e) { if (!hit && e.kind === 'xp_sent' && e.session === str(sessionId)) hit = e; });
    return hit;
  }
  // → { state, entry } | null (no such campaign or SESSION line, or an amount outside 1–XP_MAX).
  function sendXp(state, id, sessionId, amount) {
    var c = campaignOf(state, id);
    if (!c || c.role !== 'gm' || !amountOk(amount)) return null;
    if (!c.log.some(function (e) { return e.kind === 'session' && e.id === str(sessionId); })) return null;
    var had = xpSentOf(state, id, sessionId);
    if (had) return { state: state, entry: had };
    var next = appendLog(state, id, { kind: 'xp_sent', session: str(sessionId), offerId: 'offer_' + uuid(), amount: amount });
    return { state: next, entry: xpSentOf(next, id, sessionId) };
  }
  function removeLog(state, id, entryId) {
    return withCampaign(state, id, 'gm', function (c) {
      var log = c.log.filter(function (e) { return e.id !== entryId; });
      return log.length === c.log.length ? c : Object.assign({}, c, { log: log });
    });
  }
  // Player
  function attachCharacter(state, id, charId) {
    return withCampaign(state, id, 'player', function (c) {
      return !str(charId) || c.characterIds.indexOf(str(charId)) !== -1 ? c : Object.assign({}, c, { characterIds: c.characterIds.concat([str(charId)]) });
    });
  }
  function detachCharacter(state, id, charId) {
    return withCampaign(state, id, 'player', function (c) {
      return c.characterIds.indexOf(str(charId)) === -1 ? c
        : Object.assign({}, c, { characterIds: c.characterIds.filter(function (x) { return x !== str(charId); }) });
    });
  }
  // `table_hello` (wire §6): the link to the GM's campaign. `lastSeen` is the hello's own time.
  function setTable(state, id, hello, at) {
    if (!isObj(hello) || !str(hello.campaignId)) return state;
    return withCampaign(state, id, 'player', function (c) {
      var next = Object.assign({}, c, { table: { gmCampaignId: str(hello.campaignId), gmLabel: str(hello.gmLabel), lastSeen: stamp(at) != null ? at : now() } });
      if (own(hello, 'frame')) next.frame = normalizeFrame(hello.frame);   // R-E6F-7: the proposal, as it arrived
      return next;
    });
  }
  // Unlinked, the party copy stays and is the player's own (E4 §6.3).
  function clearTable(state, id) {
    return withCampaign(state, id, 'player', function (c) { return c.table ? Object.assign({}, c, { table: null }) : c; });
  }
  // `xp_offer` (wire §6) → the inbox, idempotent by offer id among the offers held AND the offers handled (ruling
  // `encounters-e6-plumbing-gate` C1: the GM re-sends an unacknowledged offer on every switch and rejoin, so an id
  // taken or dismissed must never re-enter). A malformed offer is refused.
  function addOffer(state, id, offer, at) {
    if (!isObj(offer) || !str(offer.offerId) || !amountOk(offer.amount)) return state;
    return withCampaign(state, id, 'player', function (c) {
      if (c.inbox.some(function (o) { return o.id === str(offer.offerId); })) return c;
      if (c.handled.indexOf(str(offer.offerId)) !== -1) return c;
      var o = { id: str(offer.offerId), at: stamp(at) != null ? at : now(), kind: 'xp', amount: offer.amount, fromLabel: str(offer.fromLabel) };
      return Object.assign({}, c, { inbox: c.inbox.concat([o]) });
    });
  }
  function dismiss(state, id, offerId) {
    return withCampaign(state, id, 'player', function (c) {
      var inbox = c.inbox.filter(function (o) { return o.id !== offerId; });
      if (inbox.length === c.inbox.length) return c;
      return Object.assign({}, c, { inbox: inbox, handled: c.handled.indexOf(offerId) === -1 ? c.handled.concat([offerId]) : c.handled });
    });
  }

  // ── the acts: they touch more than one key, so they load, check, write and say what happened ──
  function holdsOnlyMembers(p) {
    if (!p) return true;
    return !str(p.name) && !(p.duty || []).length && !(p.obligation || []).length && !(p.rank > 0)
      && !(p.rankUps || []).length && !(p.bases || []).length && (p.resource == null);
  }
  function pointedAt(state, partyId, exceptId) {
    return ((state && state.campaigns) || []).some(function (c) { return c && c.id !== exceptId && c.partyId === partyId; });
  }
  // createCampaign(role, name, opts) → { ok, id, partyId } | { ok: false, why }. The party is made FIRST (an empty
  // `party_<uuid>`), so a campaign never points at a party that was not written.
  function createCampaign(role, name, opts) {
    var P = party(), s = load();
    if (_stale) return { ok: false, why: 'held' };
    if (!P) return { ok: false, why: 'no-party-store' };
    var ps = P.load();
    if (P.isStale()) return { ok: false, why: 'party-held' };
    var pid = 'party_' + uuid();
    if (!P.save(P.ensureParty(ps, pid))) return { ok: false, why: 'party-held' };
    var rec = newRecord(role, name, Object.assign({}, opts || {}, { partyId: pid }));
    if (!save(addCampaign(s, rec))) return { ok: false, why: 'held' };
    return { ok: true, id: rec.id, partyId: pid };
  }
  // The old local party goes only when nothing else points at it and it holds nothing but members (ADDENDUM 1, P1.2).
  function retireParty(P, s, oldId, exceptId) {
    if (!oldId) return null;
    if (pointedAt(s, oldId, exceptId)) return { partyId: oldId, kept: 'pointed-at' };
    var ps = P.load(), p = P.partyOf(ps, oldId);
    if (!p) return null;
    if (!holdsOnlyMembers(p)) return { partyId: oldId, kept: 'holds-more-than-members' };
    P.save(P.removeParty(ps, oldId));
    return { partyId: oldId, removed: true };
  }
  // `party` (wire §6) on a LINKED player campaign: the GM's record replaces its id here, the campaign re-points at it,
  // and the campaign's old local party retires by the rule above. Unlinked (no `table`), it is refused.
  function receiveParty(id, record) {
    var P = party(), s = load(), c = campaignOf(s, id);
    if (_stale) return { ok: false, why: 'held' };
    if (!c || c.role !== 'player') return { ok: false, why: 'no-campaign' };
    if (!c.table) return { ok: false, why: 'not-linked' };
    if (!P || !isObj(record) || !str(record.id)) return { ok: false, why: 'bad-party' };
    var ps = P.load();
    if (P.isStale()) return { ok: false, why: 'party-held' };
    if (!P.save(P.replaceParty(ps, record))) return { ok: false, why: 'party-held' };
    var oldId = c.partyId, rid = str(record.id), out = { ok: true, partyId: rid };
    if (oldId !== rid) {
      var next = withCampaign(s, id, 'player', function (x) { return Object.assign({}, x, { partyId: rid }); });
      if (!save(next)) return { ok: false, why: 'held' };
      var r = retireParty(P, next, oldId, null);
      if (r) out.retired = r;
    }
    return out;
  }
  // A local edit to a campaign's party (fn: a partyStore pure op over (state, partyId)) — refused while linked.
  function editParty(id, fn) {
    var P = party(), c = campaignOf(load(), id);
    if (!c || !c.partyId || !P) return { ok: false, why: 'no-party' };
    if (c.role === 'player' && c.table) return { ok: false, why: 'linked' };
    var env = P.apply(function (ps) { return fn(ps, c.partyId); });
    return env ? { ok: true } : { ok: false, why: 'party-held' };
  }
  // ADD (P4.1/P4.2): the offer goes only when the player's own award held. The offer is removed FIRST and put back if
  // the award did not hold, so a write cut short can never award twice.
  function take(id, offerId, charId) {
    var s = load(), c = campaignOf(s, id), R = roster();
    if (_stale) return { ok: false, why: 'held' };
    if (!c || c.role !== 'player') return { ok: false, why: 'no-campaign' };
    if (c.characterIds.indexOf(str(charId)) === -1) return { ok: false, why: 'not-in-campaign' };
    var offer = null;
    c.inbox.forEach(function (o) { if (o.id === offerId) offer = o; });
    if (!offer) return { ok: false, why: 'no-offer' };
    if (!amountOk(offer.amount)) return { ok: false, why: 'bad-offer' };
    if (!R || typeof R.addXp !== 'function') return { ok: false, why: 'no-roster' };
    var raw = readRaw();
    if (!save(dismiss(s, id, offerId))) return { ok: false, why: 'held' };
    var list = null;
    try { list = R.addXp(str(charId), offer.amount); } catch (e) { list = null; }
    if (!list) {
      var ls = LS();
      try { if (raw == null) ls.removeItem(KEY); else ls.setItem(KEY, raw); } catch (e) {}
      load();
      return { ok: false, why: 'award-refused' };
    }
    return { ok: true, amount: offer.amount, charId: str(charId) };
  }
  // Delete: the campaign is tombstoned; its party retires by the same rule as a re-point.
  function deleteCampaign(id) {
    var P = party(), s = load(), c = campaignOf(s, id);
    if (_stale) return { ok: false, why: 'held' };
    if (!c) return { ok: false, why: 'no-campaign' };
    var next = removeCampaign(s, id);
    if (!save(next)) return { ok: false, why: 'held' };
    var out = { ok: true };
    if (P && c.partyId) { var r = retireParty(P, next, c.partyId, null); if (r) out.retired = r; }
    return out;
  }
  // apply(fn): load → fn(state) → save, the one-call shape partyStore offers. Null when held.
  function apply(fn) {
    var s = load();
    if (_stale) return null;
    return save(fn(s));
  }

  var api = {
    KEY: KEY, SCHEMA_V: SCHEMA_V, ROLES: ROLES.slice(), LOG_KINDS: LOG_KINDS.slice(), XP_MAX: XP_MAX,
    // persistence
    load: load, save: save, apply: apply, isStale: isStale, fromRaw: fromRaw,
    normalizeCampaign: normalizeCampaign,
    // pure ops
    campaignOf: campaignOf, newRecord: newRecord, addCampaign: addCampaign, removeCampaign: removeCampaign, setName: setName,
    setFrame: setFrame, addCast: addCast, removeCast: removeCast, appendLog: appendLog, removeLog: removeLog,
    xpSentOf: xpSentOf, sendXp: sendXp,
    attachCharacter: attachCharacter, detachCharacter: detachCharacter, setTable: setTable, clearTable: clearTable,
    addOffer: addOffer, dismiss: dismiss,
    // the acts
    createCampaign: createCampaign, receiveParty: receiveParty, editParty: editParty, take: take, deleteCampaign: deleteCampaign,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.SWRPGCampaigns = api;
})(typeof window !== 'undefined' ? window : this);
