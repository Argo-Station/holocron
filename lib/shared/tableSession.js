/* lib/shared/tableSession.js — THE TABLE SESSION (window.SWRPGTableSession): the one live table link of an app, for the
 * CAMPAIGNS screens of both apps and the fight card's linked PC (ruling `encounters-e6-frames` ADDENDUM 2).
 *
 * WHAT IT IS. `tableLink.js` is the wire's client and draws nothing; this module holds ONE link per app (the GM's open
 * table, or the player's seat), keeps what the screens draw from it IN MEMORY (knocks, seats, presence, the players'
 * summaries, the XP answers), and writes what the wire lets a receiver write through the one writer of each key:
 *   GM      `join` → the campaign's party gains that member (`who` only, wire §6) through SWRPGCampaigns.editParty
 *   GM      LEAVE TABLE → that member leaves the party (partyStore.removeMember) and every fight on this device (the
 *           bench's removeMember), ruling `encounters-e6-walk` §3
 *   player  `table_hello` → setTable (with its `frame`, R-E6F-7) · `party` → receiveParty · `xp_offer` → addOffer
 *           `record` (T4, shapes §4) → setRecord · GM: sendRecord(knockId) on seating and `join`
 *           its own LEAVE TABLE → its own characters leave the campaign's received party (§3, D15)
 * Summaries, presence and answers are never persisted (wire §6; D-497 b4).
 * A SENT SESSION'S LINES (B-1886, ruling `encounters-e6-walk` ADDENDUM 22 shape L-2; D13 "the LOG kept"): xpLines(offerId)
 * is every seat that held a `who` when SEND XP went, plus any seat that answers later; a seat is named by its live
 * summary, else by the name this device held for it when it departed. Both records are memory only, so after a reload
 * or a closed table the lines read as before: the seats at the table that hold a `who`.
 *
 * WHEN A LINK EXISTS (F11). `createLink` runs only on an act: OPEN, JOIN, LIST, or a rejoin from a saved session key
 * when a CAMPAIGNS screen mounts with the door on. Loading this file opens no socket, writes no key, adds no listener.
 *
 * TWO KEYS (on paper in ADDENDUM 2):
 *   `swrpg_table_label` (R-E6F-8) — PREF, ≤ 24 characters, "your name at the table"; one key for both roles,
 *     prefilled into OPEN's and JOIN's name and written when either is sent.
 *   `swrpg_table_server` (R-E6F-9) — an override of the server address, honoured ONLY on a localhost / 127.0.0.1
 *     origin (suites set `ws://127.0.0.1:8791`); production ignores it. No writer: suites plant it.
 *   `swrpg_table_seats_v1` (W-2, `encounters-e6-wire-online` ADDENDUM 9) — GM, SESSION storage beside the link's key:
 *     `{ v: 1, seats: { <knockId>: "char:<id>" } }`. Put on a seat's `join` naming a char: who, deleted on its leave, the
 *     whole key dropped on close or end. Never synced or exported; no summary, no name. It lets a rejoin after a reload
 *     know a seat's who, so a rejoin `opened` WITH `seats` (W-1) can read every unnamed seat as left.
 *   `swrpg_table_campaign_v1` (W-4, ADDENDUM 10; B-1859) — both roles, SESSION storage: `{ v: 1, campaignId }`, an id
 *     only. Put when campaignId is set (the GM's OPEN, the player's DONE), removed on LEAVE, CLOSE TABLE and an ended or
 *     refused table. A reload's rejoin restores campaignId from it when this device still holds that campaign in the
 *     matching role; otherwise it stays null. Never synced or exported.
 *
 * T2, THE REMEMBERED TABLE (rulings `encounters-t2-shapes` §1–§3 + ADDENDUM 2, `encounters-t2-build` items 1, 3, 4; D-621).
 * THIS FILE READS T2'S SWITCH, `swrpg_table_memory_door` in localStorage, SINCE THE FLIP (`encounters-t2-flip`; D-628):
 * the string '0' is OFF; anything else, or no key, is ON; a storage error reads ON. DEFAULT ON. OFF ('0', the escape) is
 * the app before the flip: no memory is written, OPEN dials `?open=1`, no session is recorded and the landings draw no
 * line (`recent()` answers null). The app never writes the key; suites plant it.
 * THIS FILE IS THE ONE WRITER of `swrpg_table_memory_v1` (localStorage; NEVER synced, never in a URL):
 *   { v: 1, tables: { <campaignId>: { role: 'gm', secret, tableId | null, lastAt, seats: [ { knockId, label, seatKeyHash, firstAt } ] }
 *                                 | { role: 'player', tableId, seatKey, gmLabel, lastAt } } }
 *   GM: the secret is minted at the campaign's first OPEN TABLE with the switch on and leaves the device only inside the
 *   `open` frame (tableLink); `seated` adds a seat (hashes only, ≤ 6); FORGET deletes it. Player: put at P4's DONE from
 *   the link's held seat; the one-tap JOIN waits on it (`wait: true`); LEAVE TABLE, and a turned-away wait, delete it.
 *   `recent(role)` is the landings' one reader: the most recent entry, by lastAt, whose campaign this device holds.
 * THE SESSION RECORD (§3): an OPEN TABLE that opens a table (an `opened` with no `seats`, not a reload or a takeover)
 * opens a session on the GM's record, closing any left open at its last activity; each seat seated joins `came`; CLOSE
 * TABLE or the server's end closes it; a SESSION line logged while it is open names it.
 * THE WAIT ends after WAIT_MS (30 min) of setTimeout: the browser suites drive it with Playwright's clock.
 *
 * THE SERVER'S HOST is an account value, `TABLE_SERVER_HOST` in lib/shared/siteSettings.js (ruling
 * `encounters-e6-wire-online` ADDENDUM 9 W-3), read at call time; '' (the public copy's template, or the key absent)
 * means no server, and OPEN, JOIN and the listing read as unreachable without dialling.
 *
 * Classic script → window.SWRPGTableSession; CommonJS for node guards. Globals read at CALL time.
 */
(function (global) {
  'use strict';

  var SERVER_KEY = 'swrpg_table_server';
  var LABEL_KEY = 'swrpg_table_label';
  var LABEL_MAX = 24;
  var SEATS_KEY = 'swrpg_table_seats_v1';
  var CAMP_KEY = 'swrpg_table_campaign_v1';   // W-4 (`encounters-e6-wire-online` ADDENDUM 10): both roles, session storage only   // W-2 (`encounters-e6-wire-online` ADDENDUM 9): GM, session storage only
  var CHAR_REFRESH_MS = 2000;
  var DOOR_KEY = 'swrpg_table_memory_door';   // T2's switch (read only)
  var MEM_KEY = 'swrpg_table_memory_v1';      // T2's device memory (this file is its one writer)
  var WAIT_MS = 30 * 60 * 1000, MAX_SEATS = 6;   // the summary's refresh, the one message on a timer (E4 concept §6); the link throttles too

  function TL() { return global.SWRPGTableLink || null; }
  function C() { return global.SWRPGCampaigns || null; }
  function P() { return global.SWRPGParty || null; }
  function R() { return global.SWRPGRoster || null; }
  function NB() { return global.NpcBenchStore || null; }
  function LS() { try { return global.localStorage || null; } catch (e) { return null; } }
  function SS() { try { return global.sessionStorage || null; } catch (e) { return null; } }
  function now() { return Date.now(); }
  function nodeRequire(name) {
    if (typeof require !== 'function' || typeof module === 'undefined') return null;
    try { return require(name); } catch (e) { return null; }
  }
  function siteSettings() { return nodeRequire('./siteSettings.js') || global.SWRPGSiteSettings || {}; }
  function serverHost() { return String(siteSettings().TABLE_SERVER_HOST || ''); }
  var ORIGIN = '@origin';   // A4-C1: TABLE_SERVER_HOST's sentinel for "the host that served this page"
  function loc() { try { return global.location || {}; } catch (e) { return {}; } }

  function serverUrl() {
    var host = '';
    try { host = String((global.location && global.location.hostname) || ''); } catch (e) {}
    if (host === 'localhost' || host === '127.0.0.1') {
      try { var o = LS() && LS().getItem(SERVER_KEY); if (o) return String(o); } catch (e) {}
    }
    var h = serverHost();
    if (h === ORIGIN) return (loc().protocol === 'https:' ? 'wss://' : 'ws://') + loc().host;   // A4-C1: the server this page came from
    return h ? 'wss://' + h : '';   // '' = no server (W-3): the callers read it as unreachable and make no link
  }
  // A4-C7.2: the program's Wi-Fi origin from /program/lan.json, re-read ≤ every 5 s; undefined unread, '' none
  var lanO, lanAt = 0;
  function loopback() { var h = String(loc().hostname || ''); return h === 'localhost' || h === '127.0.0.1' || h === '[::1]'; }
  function lanOrigin() {
    if (now() - lanAt >= 5000 && typeof global.fetch === 'function') {
      lanAt = now();
      global.fetch('/program/lan.json', { cache: 'no-store' }).then(function (r) { return r.json(); })
        .then(function (j) { return j && j.v === 1 ? String(j.origin) : ''; }, function () { return ''; })
        .then(function (o) { lanO = /^http:\/\/\d+\.\d+\.\d+\.\d+:\d+$/.test(o) && !/^http:\/\/127\./.test(o) ? o : ''; });
    }
    return lanO;
  }
  // The QR's link. A4-C7.3: '@origin' on loopback → the published origin's (null unread, '' none); A4-C2: '@origin'
  // elsewhere → this origin's; else holocron.work's
  function joinUrl(code) {
    if (serverHost() === ORIGIN && loopback()) { var o = lanOrigin(); return o == null ? null : o && o + '/player/join#' + code; }
    return (serverHost() === ORIGIN ? loc().origin : 'https://holocron.work') + '/player/join#' + code;
  }
  function atOrigin() { return serverHost() === ORIGIN; }
  function label() { try { return String((LS() && LS().getItem(LABEL_KEY)) || '').slice(0, LABEL_MAX); } catch (e) { return ''; } }
  function setLabel(v) {
    var s = String(v == null ? '' : v).trim().slice(0, LABEL_MAX);
    var ls = LS();
    try { if (ls) { if (s) ls.setItem(LABEL_KEY, s); else ls.removeItem(LABEL_KEY); } } catch (e) {}
    return s;
  }
  // a saved session key (the link's own, in session storage): what makes a rejoin an act on mount
  function seatKeyGet() {
    try { var k = JSON.parse((SS() && SS().getItem(SEATS_KEY)) || 'null'); return k && k.v === 1 && k.seats && typeof k.seats === 'object' ? k.seats : {}; } catch (e) { return {}; }
  }
  function seatKeyPut(knockId, who) {          // who null deletes the entry
    var seats = seatKeyGet(), ss = SS();
    if (who) seats[knockId] = who; else delete seats[knockId];
    try { if (ss) ss.setItem(SEATS_KEY, JSON.stringify({ v: 1, seats: seats })); } catch (e) {}
  }
  function campKeyPut(id) { var ss = SS(); try { if (ss) ss.setItem(CAMP_KEY, JSON.stringify({ v: 1, campaignId: String(id) })); } catch (e) {} }
  function campKeyDrop() { try { if (SS()) SS().removeItem(CAMP_KEY); } catch (e) {} }
  function campKeyFor(role) {                  // the saved campaign, only if this device holds it in `role`
    var Cs = C(), id = null;
    try { var k = JSON.parse((SS() && SS().getItem(CAMP_KEY)) || 'null'); id = k && k.v === 1 && k.campaignId ? String(k.campaignId) : null; } catch (e) {}
    var c = Cs && id ? Cs.campaignOf(Cs.load(), id) : null;
    return c && c.role === role ? c.id : null;
  }
  function seatKeyDrop() { try { if (SS()) SS().removeItem(SEATS_KEY); } catch (e) {} }
  function savedRole() {
    var T = TL(), ss = SS();
    if (!T || !ss) return null;
    try { var k = JSON.parse(ss.getItem(T.KEYS_KEY) || 'null'); return k && k.tableId ? k.role : null; } catch (e) { return null; }
  }

  // ── T2: the switch and the device's memory ──
  function doorOn() { try { return !(LS() && LS().getItem(DOOR_KEY) === '0'); } catch (e) { return true; } }
  function memRead() {
    try { var m = JSON.parse((LS() && LS().getItem(MEM_KEY)) || 'null'); return m && m.v === 1 && m.tables && typeof m.tables === 'object' ? m : { v: 1, tables: {} }; } catch (e) { return { v: 1, tables: {} }; }
  }
  function memOf(cid) { return doorOn() ? memRead().tables[cid] || null : null; }
  function memPut(cid, entry) {               // entry null deletes it
    if (!doorOn()) return;
    var m = memRead();
    if (entry) m.tables[cid] = entry; else delete m.tables[cid];
    var ls = LS();
    try { ls.setItem(MEM_KEY, JSON.stringify(m)); } catch (e) {}
  }
  function memEdit(cid, fn) { var e = memOf(cid); if (e) memPut(cid, fn(Object.assign({}, e))); }
  function b64(bytes) { var s = ''; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  // the landings' line (shape S3): the most recent remembered table of `role` whose campaign this device holds
  function recent(role) {
    if (!doorOn()) return null;
    var t = memRead().tables, Cs = C(), all = Cs ? Cs.load().campaigns || [] : [];
    var hit = Object.keys(t).filter(function (k) { return t[k] && t[k].role === role && all.some(function (c) { return c && c.id === k && c.role === role; }); })
      .sort(function (a, b) { return (t[b].lastAt || 0) - (t[a].lastAt || 0); })[0];
    return hit ? Cs.campaignOf(Cs.load(), hit) : null;
  }
  // a GM's remembered seats for `cid` (M3): [{knockId, label}]
  function remembered(cid) { var e = memOf(cid); return e && e.role === 'gm' ? (e.seats || []).map(function (x) { return { knockId: x.knockId, label: x.label }; }) : []; }

  // ── the state the screens draw (in memory) ──
  var link = null, listLink = null, subs = [], charTimer = null, lastSummary = null;
  var S = fresh();
  function fresh() {
    return {
      role: null,
      phase: 'idle',          // gm: idle · opening · open · lost · unreachable · ended  |  player: idle · joining · knocking · admitted · lost · unreachable · ended
      campaignId: null,       // gm: its campaign · player: the campaign the seat was put in (P4 DONE)
      code: null, codeExpiresAt: null, listed: false,
      knocks: [],             // gm: [{knockId, deviceLabel}]
      seats: {},              // gm: knockId → {deviceLabel, presence, who, summary}
      gm: null,               // player: 'here' | 'away' | 'lost'
      error: null,            // the last error frame's code
      unreachable: null,      // the phase R-E6F-4 named
      tables: null,           // player: the listing (null until asked)
      hello: null,            // player: the last table_hello payload
      answers: {},            // gm: offerId → {knockId: took}
      offered: {},            // gm: offerId → [knockId] the seats holding a `who` when SEND XP went (L-2, memory only)
      gone: {},               // gm: knockId → the name a departed seat held (L-2, memory only)
      joinCode: null,         // player: the code typed for this knock (D4)
      session: null,          // gm (T2): the open session's id on the record
      oneTap: false,          // gm (T2): this open came from a remembered table (D-T2M5 (b)'s order); player: waiting began
    };
  }
  // emit() always hands subscribers a NEW S (ruling `encounters-e6-preview-gate` C1): a path that writes the campaign store
  // and changes nothing in S (xp_offer, party, table_hello's write, sendXp, seat, the GM's party edit on join) still
  // redraws a view that keeps S by reference (campaignsView's useSession). set() is a patch plus this.
  function emit() { var s = S = Object.assign({}, S); subs.slice().forEach(function (f) { try { f(s); } catch (e) {} }); }
  function set(patch) { S = Object.assign({}, S, patch); emit(); }
  function subscribe(fn) { subs.push(fn); return function () { subs = subs.filter(function (f) { return f !== fn; }); }; }

  function onEvent(ev) {
    if (ev.kind === 'unreachable') { set({ phase: 'unreachable', unreachable: ev.phase }); return; }
    if (ev.kind === 'frame') return onFrame(ev.f);
    if (ev.kind === 'presence') return onPresence(ev.who, ev.state);
    if (ev.kind === 'ended') {
      stopChar(); stopWait();
      if (S.role === 'gm') { seatKeyDrop(); endSession(); }
      if (S.role === 'player' && S.phase === 'waiting') memPut(S.campaignId, null);   // turned away: the seat is gone (D-T2M8)
      campKeyDrop(); set({ phase: 'ended', error: ev.code || null }); return;
    }
    if (ev.kind === 'message') return onMessage(ev.from, ev.env);
  }
  function onFrame(f) {
    switch (f.t) {
      case 'opened': {
        var first = S.phase !== 'open';
        if (S.role === 'gm' && S.campaignId) { memEdit(S.campaignId, function (e) { e.tableId = f.tableId; e.lastAt = now(); return e; }); if (first) f.seats ? adoptSession() : newSession(); }
        set({ phase: 'open', code: f.code, codeExpiresAt: f.codeExpiresAt, error: null, unreachable: null });
        if (S.role === 'gm' && Array.isArray(f.seats)) reconcile(f.seats);   // W-1: authoritative only when present
        if (first) sayHello();
        return;
      }
      case 'knock': set({ knocks: S.knocks.filter(function (k) { return k.knockId !== f.knockId; }).concat([{ knockId: f.knockId, deviceLabel: f.deviceLabel || '' }]) }); return;
      // no `peer` case: tableLink consumes the server's `peer` frame and reports it as a `presence` event (onPresence)
      case 'admitted': set({ phase: 'admitted', error: null }); return;
      case 'seated':                                                 // T2 §2.3: the GM's device remembers the seat (hashes only)
        memEdit(S.campaignId, function (e) {
          var l = (e.seats || []).filter(function (x) { return x.knockId !== f.knockId; });
          if (l.length < MAX_SEATS) l.push({ knockId: f.knockId, label: f.deviceLabel || '', seatKeyHash: f.seatKeyHash, firstAt: now() });
          e.seats = l; e.lastAt = now(); return e;
        });
        emit(); return;
      case 'table': if (f.state === 'waiting') set({ phase: 'waiting', error: null }); return;   // T2: the GM has not opened
      case 'tables': set({ tables: f.tables || [] }); return;
      case 'error':
        if (S.phase === 'ended' && S.oneTap && S.role === 'player') { set({ error: f.code }); return; }   // T2 turned away: stays ended
        set({ error: f.code, phase: S.role === 'player' && S.phase !== 'admitted' ? 'idle' : S.phase }); return;
      default: return;
    }
  }
  function knockLabel(id) { var k = S.knocks.filter(function (x) { return x.knockId === id; })[0]; return k ? k.deviceLabel : ''; }
  function onPresence(who, state) {
    // T2 turned away (D-T2M8): the server's `closed` hangs up, and the link then reports the GM `lost`; a one-tap wait
    // that ended stays ended (M4's frame), so P5 reads only "That table has closed". The door-OFF path is untouched.
    if (S.phase === 'ended' && S.oneTap && S.role === 'player') return;
    if (S.role === 'player' && who === 'gm' && state === 'here' && (S.phase === 'waiting' || S.phase === 'waitEnded')) return seatedFromWait();
    if (S.role === 'player' || who === 'table') {
      if (who === 'table' || who === 'gm') set(who === 'table' ? { phase: state === 'lost' ? 'lost' : S.phase } : { gm: state, phase: state === 'lost' ? 'lost' : S.phase === 'lost' ? 'admitted' : S.phase });
      return;
    }
    // GM: `who` is a knockId. Any presence for it means the knock was answered (LET IN), so the knock row goes;
    // `left` (LEAVE TABLE) removes the seat and what it brought (departed).
    if (state === 'left') return departed(who);
    var seats = Object.assign({}, S.seats), s = seats[who];
    seats[who] = Object.assign({ deviceLabel: knockLabel(who) || memLabel(who), who: null, summary: null }, s || {}, { presence: state });
    set({ seats: seats, knocks: S.knocks.filter(function (k) { return k.knockId !== who; }) });
    if (state === 'here') { came(who); sendRecord(who); }
  }
  // LEAVE TABLE on the GM's device (ruling `encounters-e6-walk` §3; D13, D14). The player's `bye` (reason left) and the
  // `left` presence both mean it, and the server forwards the bye BEFORE `peer left`, so whichever lands first reads the
  // seat's `who` and the second finds no seat and does nothing. A `char:` seat's member leaves the campaign's party and
  // its PC card leaves every fight on this device; the bench's removeMember keeps initiative.slots (ADDENDUM 3 Q2). The
  // LOG is not touched. A drop (`dropped`, `lost`) never comes here: it keeps everything, as G4 and G6 draw it.
  function departed(knockId) {
    var s = S.seats[knockId], who = s && s.who ? String(s.who) : (seatKeyGet()[knockId] || ''), Cs = C();
    var seats = Object.assign({}, S.seats); delete seats[knockId];
    var gone = S.gone, nm = seatName(s);
    if (nm) { gone = Object.assign({}, gone); gone[knockId] = nm; }            // L-2: its sent-session lines keep the name
    seatKeyPut(knockId, null);
    S = Object.assign({}, S, { seats: seats, gone: gone, knocks: S.knocks.filter(function (k) { return k.knockId !== knockId; }) });
    if (/^char:/.test(who)) {
      if (Cs && S.campaignId && P()) Cs.editParty(S.campaignId, function (ps, pid) { return P().removeMember(ps, who, pid); });
      dropFights(who);
      sendParty();
    }
    emit();                                                   // after the writes: the NPC view adopts the bench on it
  }
  // W-1 (B-1856): a GM rejoin's `opened` names the seats the server still holds; every other seat, in memory or in the
  // W-2 key, left while this device was away, and runs the same removal (no timer, no end marker needed)
  function reconcile(named) {
    var keep = {}; named.forEach(function (k) { keep[String(k)] = true; });
    var ids = Object.keys(S.seats).concat(Object.keys(seatKeyGet()));
    ids.filter(function (k, i) { return !keep[k] && ids.indexOf(k) === i; }).forEach(departed);
  }
  // the bench's own remove act for a PC, in every fight that holds `who`; one write, through the bench's edge (its hold)
  function dropFights(who) {
    var B = NB(); if (!B) return;
    var st = B.load(), next = st;
    (st.groups || []).forEach(function (g) {
      (g.members || []).forEach(function (m) { if (m && m.kind === 'pc' && m.who === who) next = B.removeMember(next, g.id, m.id); });
    });
    if (next !== st) B.persist(next);
  }
  function onMessage(from, env) {
    var p = env.payload || {}, Cs = C();
    if (S.role === 'gm') {
      if (env.type === 'join' || env.type === 'char_update') {
        var seats = Object.assign({}, S.seats), s = seats[from] || { deviceLabel: '', presence: 'here' };
        seats[from] = Object.assign({}, s, { who: p.who || s.who, summary: p.summary || s.summary });
        if (/^char:/.test(String(p.who || ''))) seatKeyPut(from, String(p.who));
        set({ seats: seats });
        came(from);
        if (env.type === 'join') sendRecord(from);
        if (env.type === 'join' && Cs && S.campaignId && /^char:/.test(String(p.who || '')) && P()) {   // wire §6: `who` only
          var name = (p.summary && p.summary.name) || '';
          Cs.editParty(S.campaignId, function (ps, pid) { return P().addCharMember(ps, String(p.who).slice(5), name, pid); });
          sendParty();
          emit();                                                     // the party write lands after set()'s emit
        }
      } else if (env.type === 'xp_taken' && p.offerId) {
        var a = Object.assign({}, S.answers), o = Object.assign({}, a[p.offerId] || {});
        o[from] = !!p.took; a[p.offerId] = o; set({ answers: a });
      } else if (env.type === 'bye') {
        if (p.reason === 'left') return departed(from);
        var st = Object.assign({}, S.seats); delete st[from]; set({ seats: st });
      }
      return;
    }
    // player
    if (env.type === 'table_hello') {
      set({ hello: p });
      if (Cs && S.campaignId) Cs.apply(function (s) { return Cs.setTable(s, S.campaignId, p, env.ts); });
    } else if (env.type === 'party') {
      if (Cs && S.campaignId && p.party) Cs.receiveParty(S.campaignId, p.party);
    } else if (env.type === 'xp_offer') {
      if (Cs && S.campaignId) Cs.apply(function (s) { return Cs.addOffer(s, S.campaignId, p, env.ts); });
    } else if (env.type === 'record') {
      if (Cs && S.campaignId) Cs.apply(function (s) { return Cs.setRecord(s, S.campaignId, p); });
    } else if (env.type === 'bye' && p.reason === 'closed') {
      stopChar(); set({ phase: 'ended' });
    }
    emit();
  }

  function make(role) {
    var T = TL();
    if (!T) return null;
    if (link && link.role === role) return link;
    if (link) { try { link.dispose(); } catch (e) {} }
    link = T.createLink({ role: role, server: serverUrl(), onEvent: onEvent });
    return link;
  }

  // ── GM ──
  function campaign() { var Cs = C(); return Cs && S.campaignId ? Cs.campaignOf(Cs.load(), S.campaignId) : null; }
  function helloPayload() {
    var c = campaign(), P_ = P(), party = c && P_ ? P_.partyOf(P_.load(), c.partyId) : null;
    return { campaignId: S.campaignId, name: c ? c.name : '', gmLabel: label(), frame: c ? c.frame : null,
      partyNames: ((party && party.members) || []).map(function (m) { return m.last || ''; }).filter(Boolean) };
  }
  function sayHello() { if (link && S.role === 'gm') { link.send('table_hello', helloPayload()); sendParty(); } }
  function sendParty() {
    var c = campaign(), P_ = P();
    if (!link || S.role !== 'gm' || !c || !P_ || !c.partyId) return;
    var party = P_.partyOf(P_.load(), c.partyId);
    if (party) link.send('party', { party: party });
  }
  // `record`: the sessions whose came holds this seat; characterId known only for the open one
  function sendRecord(knockId) {
    var c = campaign(), G = global.SWRPGGroupSummary, st = S.seats[knockId], who = st && /^char:/.test(st.who || '') ? String(st.who).slice(5) : null, ip = (c && c.inPlay) || {};
    if (!link || S.role !== 'gm' || !c) return;
    link.send('record', {
      campaignId: c.id,
      sessions: (c.sessions || []).filter(function (x) { return x.came.some(function (y) { return y.knockId === knockId; }); })
        .map(function (x) { return { id: x.id, at: x.openedAt, characterId: x.id === S.session ? who : null }; }),
      groupSummary: G ? G.of(c, now()) : null,
      inPlay: { people: c.cast || [], planets: ip.planets || [], factions: ip.factions || [] },
    }, knockId);
  }
  // D11 (D-543): one table at a time — another campaign's table open (or opening, or lost) refuses OPEN; the GM closes it first
  function otherTable(campaignId) { return S.role === 'gm' && S.campaignId !== campaignId && (S.phase === 'opening' || S.phase === 'open' || S.phase === 'lost'); }
  function open(campaignId, name, listed) {
    var c = C() && C().campaignOf(C().load(), campaignId);
    if (!c || otherTable(campaignId)) return false;
    setLabel(name);
    if (!serverUrl()) { set({ role: 'gm', phase: 'unreachable', unreachable: 'open', campaignId: campaignId }); return false; }
    var mem = null;
    if (doorOn()) {                                                  // T2: the campaign's one table; its secret minted once
      mem = memOf(campaignId);
      if (!mem || mem.role !== 'gm') { var r = new Uint8Array(32); crypto.getRandomValues(r); mem = { role: 'gm', secret: b64(r), tableId: null, lastAt: now(), seats: [] }; }
      prevAt = mem.lastAt; mem.lastAt = now(); memPut(campaignId, mem);
    }
    S = fresh(); set({ role: 'gm', phase: 'opening', campaignId: campaignId, listed: !!listed, oneTap: !!(mem && mem.seats.length) });
    campKeyPut(campaignId);
    var l = make('gm'); if (!l) return false;
    l.open(c.name || 'Table', !!listed, mem ? { secret: mem.secret, seats: mem.seats.map(function (x) { return { knockId: x.knockId, deviceLabel: x.label, seatKeyHash: x.seatKeyHash }; }) } : null);
    return true;
  }
  // FORGET (T2 S2): the server deletes the seat and closes its socket; this device forgets its hash and its row
  function forget(knockId) {
    memEdit(S.campaignId, function (e) { e.seats = (e.seats || []).filter(function (x) { return x.knockId !== knockId; }); return e; });
    var seats = Object.assign({}, S.seats); delete seats[knockId];
    if (link && link.forget) link.forget(knockId);
    set({ seats: seats });
  }
  function memLabel(knockId) { var e = memOf(S.campaignId), x = e && (e.seats || []).filter(function (y) { return y.knockId === knockId; })[0]; return x ? x.label : ''; }
  // the session record (§3, S5)
  function editRec(fn) { var Cs = C(); if (Cs && S.campaignId && doorOn()) Cs.apply(fn); }
  function newSession() {
    var Cs = C(), c = campaign(), id = 'sess_' + (Cs ? Cs.uuid() : now());
    if (!Cs || !c || !doorOn()) return;
    editRec(function (st) {
      (c.sessions || []).forEach(function (x) { if (x.closedAt == null) st = Cs.closeSession(st, c.id, x.id, Math.max(x.openedAt || 0, lastAct(x))); });
      return Cs.openSession(st, c.id, id, now());
    });
    S = Object.assign({}, S, { session: id });
  }
  var prevAt = 0;                                                    // the remembered table's last activity before this open
  function lastAct(x) { return prevAt || x.openedAt || now(); }
  // a reload's rejoin or a takeover keeps the session the record holds open (one session per table opened)
  function adoptSession() { var c = campaign(), o = c && doorOn() ? (c.sessions || []).filter(function (x) { return x.closedAt == null; }).pop() : null; if (o) S = Object.assign({}, S, { session: o.id }); }
  function endSession() { var Cs = C(), sid = S.session; if (sid) editRec(function (st) { return Cs.closeSession(st, S.campaignId, sid, now()); }); }
  function came(knockId) {
    var Cs = C(), sid = S.session, st = S.seats[knockId];
    if (!sid || !st || st.presence !== 'here') return;
    var named = st.summary && st.summary.name, label = named || st.deviceLabel || memLabel(knockId);
    // a device label only fills a new entry: a GM reload's rejoin reads `here` before the player's summary is re-sent,
    // and must not turn "Kael Voss" back into the device's name
    editRec(function (x) {
      var c = Cs.campaignOf(x, S.campaignId), o = c && (c.sessions || []).filter(function (y) { return y.id === sid; })[0];
      if (!named && o && o.came.some(function (y) { return y.knockId === knockId; })) return x;
      return Cs.cameTo(x, S.campaignId, sid, { knockId: knockId, label: label });
    });
  }
  function deleteSession(campaignId, sid) { var Cs = C(); if (Cs) Cs.apply(function (st) { return Cs.removeSession(st, campaignId, sid); }); if (S.session === sid) S = Object.assign({}, S, { session: null }); emit(); }
  function admit(knockId) { return !!(link && link.admit && link.admit(knockId)); }
  function refuse(knockId) { set({ knocks: S.knocks.filter(function (k) { return k.knockId !== knockId; }) }); return !!(link && link.refuse && link.refuse(knockId)); }
  function newcode() { return !!(link && link.newcode && link.newcode()); }
  function setListed(on) { set({ listed: !!on }); return !!(link && link.listing && link.listing(on)); }
  function close() { seatKeyDrop(); campKeyDrop(); endSession(); if (link && link.close) link.close(); link = null; S = fresh(); emit(); }
  // SEND XP (R-E6F-6): log once, send the entry's offerId; a re-send re-uses it.
  function sendXp(campaignId, sessionId, amount) {
    var Cs = C(); if (!Cs) return null;
    var out = null;
    Cs.apply(function (s) { var r = Cs.sendXp(s, campaignId, sessionId, amount); out = r ? r.entry : null; return r ? r.state : s; });
    if (out && link && S.role === 'gm' && S.campaignId === campaignId) {
      var line = (campaign() || { log: [] }).log.filter(function (e) { return e.id === sessionId; })[0];
      link.send('xp_offer', { offerId: out.offerId, amount: out.amount, fromLabel: label(), session: (line && line.session) || null });
      var was = S.offered[out.offerId] || [], o = Object.assign({}, S.offered);
      o[out.offerId] = was.concat(Object.keys(S.seats).filter(function (k) { return S.seats[k].who && was.indexOf(k) === -1; }));
      S = Object.assign({}, S, { offered: o });                 // L-2: a re-send adds the seats seated since
    }
    emit();
    return out;
  }
  function seatName(s) { return s ? (s.summary && s.summary.name) || s.deviceLabel || '' : ''; }
  // a sent session's per-player lines (L-2): [{ k, name, took }], took true (ADD), false (DISMISS) or null (waiting)
  function xpLines(offerId) {
    var ans = S.answers[offerId] || {}, ids = S.offered[offerId];
    ids = ids ? ids.concat(Object.keys(ans).filter(function (k) { return ids.indexOf(k) === -1; }))
      : Object.keys(S.seats).filter(function (k) { return S.seats[k].who; });
    return ids.filter(function (k) { return S.seats[k] || S.gone[k]; }).map(function (k) {
      return { k: k, name: S.seats[k] ? seatName(S.seats[k]) : S.gone[k], took: k in ans ? ans[k] : null };
    });
  }

  // ── player ──
  function list() {
    var T = TL(); if (!T) return false;
    if (!serverUrl()) { set({ unreachable: 'list', tables: [] }); return false; }
    set({ tables: null, unreachable: null });
    if (!listLink) listLink = T.createLink({ role: 'player', server: serverUrl(), onEvent: function (ev) {
      if (ev.kind === 'unreachable') set({ unreachable: 'list', tables: [] });
      else if (ev.kind === 'frame' && ev.f.t === 'tables') set({ tables: ev.f.tables || [] });
      else if (ev.kind === 'frame' && ev.f.t === 'error') set({ tables: [], error: ev.f.code });
    } });
    listLink.list();
    return true;
  }
  function join(where, name) {
    if (!String(name == null ? '' : name).trim()) return false;   // B-1855: the server refuses a blank device label (D10's rule)
    setLabel(name);
    if (!serverUrl()) { S = fresh(); set({ role: 'player', phase: 'unreachable', unreachable: 'join' }); return false; }
    S = fresh(); set({ role: 'player', phase: 'knocking', joinCode: where && where.code != null ? String(where.code) : null });
    var l = make('player'); if (!l) return false;
    l.join(where, label());
    return true;
  }
  // P4 DONE: the campaign the seat goes in, and the character played (null = none yet, R-E6J-1: no `join`)
  function seat(campaignId, charId) {
    var Cs = C(); if (!Cs) return false;
    set({ campaignId: campaignId });
    campKeyPut(campaignId);
    if (S.hello) Cs.apply(function (s) { return Cs.setTable(s, campaignId, S.hello, now()); });
    if (charId != null) { Cs.apply(function (s) { return Cs.attachCharacter(s, campaignId, String(charId)); }); sendJoin(String(charId)); }
    var held = link && link.heldSeat && link.heldSeat();
    if (held) memPut(campaignId, { role: 'player', tableId: held.tableId, seatKey: held.seatKey, gmLabel: (S.hello && S.hello.gmLabel) || '', lastAt: now() });
    emit();
    return true;
  }
  // the one-tap JOIN (T2 S3, S4): take the remembered seat, waiting for the GM's open if the table is not open yet
  var waitTimer = null;
  function stopWait() { if (waitTimer) { clearTimeout(waitTimer); waitTimer = null; } }
  function joinRemembered(campaignId) {
    var e = memOf(campaignId);
    if (!e || e.role !== 'player') return false;
    if (!serverUrl()) { S = fresh(); set({ role: 'player', phase: 'unreachable', unreachable: 'join', campaignId: campaignId }); return false; }
    if (link) { try { link.dispose(); } catch (x) {} link = null; }
    stopWait();
    S = fresh(); set({ role: 'player', phase: 'waiting', campaignId: campaignId, oneTap: true });
    campKeyPut(campaignId);
    var l = make('player'); if (!l) return false;
    l.wait(e.tableId, e.seatKey);
    waitTimer = setTimeout(function () {                             // S4: the client stops waiting after 30 minutes
      waitTimer = null;
      if (S.phase !== 'waiting') return;
      if (link) { try { link.dispose(); } catch (x) {} link = null; }
      set({ phase: 'waitEnded' });
    }, WAIT_MS);
    return true;
  }
  function seatedFromWait() {
    stopWait();
    var Cs = C(), c = Cs && Cs.campaignOf(Cs.load(), S.campaignId);
    memEdit(S.campaignId, function (e) { e.lastAt = now(); return e; });
    set({ phase: 'admitted', gm: 'here' });
    var ch = c && (c.characterIds || []).filter(function (id) { return sheetOf(id); })[0];
    if (ch != null) sendJoin(String(ch));
  }
  function sheetOf(charId) {
    var r = R(); var rec = r ? (r.loadSavedCharacters() || []).filter(function (c) { return c && String(c.id) === String(charId); })[0] : null;
    return rec ? (rec.sheetData || rec) : null;
  }
  function sendJoin(charId) {
    var T = TL(); if (!link || !T) return false;
    var sum = T.summaryOf(sheetOf(charId));
    if (!sum) return false;
    lastSummary = JSON.stringify(sum);
    link.send('join', { who: 'char:' + charId, summary: sum });
    startChar(charId);
    return true;
  }
  function startChar(charId) {
    stopChar();
    charTimer = setInterval(function () {
      var T = TL(); if (!link || !T) return stopChar();
      var sum = T.summaryOf(sheetOf(charId)), txt = sum && JSON.stringify(sum);
      if (sum && txt !== lastSummary) { lastSummary = txt; link.send('char_update', { who: 'char:' + charId, summary: sum }); }
    }, CHAR_REFRESH_MS);
  }
  function stopChar() { if (charTimer) { clearInterval(charTimer); charTimer = null; } }
  function taken(offerId, took) { return !!(link && S.role === 'player' && link.send('xp_taken', { offerId: offerId, took: !!took })); }
  // LEAVE TABLE (§3, D15): unlinked first, so the party is the player's own to edit (editParty refuses a linked one); then
  // the characters this campaign plays leave its received party, so P5's chips lose them and the others stay as last seen.
  // The campaign, its characters (MY CHARACTERS) and its inbox stay. Joining again and DONE brings the party back.
  function leave() {
    var Cs = C(), cid = S.campaignId;
    if (Cs && cid) {
      Cs.apply(function (s) { return Cs.clearTable(s, cid); });
      var c = Cs.campaignOf(Cs.load(), cid), mine = (c && c.characterIds) || [];
      if (mine.length && P()) Cs.editParty(cid, function (ps, pid) {
        return mine.reduce(function (ps2, id) { return P().removeMember(ps2, 'char:' + id, pid); }, ps);
      });
    }
    stopChar(); stopWait();
    if (cid) memPut(cid, null);                                      // T2 S2: LEAVE TABLE forgets the table on this device
    campKeyDrop();
    if (link && link.leave) link.leave();
    link = null; S = fresh(); emit();
  }

  // ── both ──
  function rejoin() {
    var role = savedRole(); if (!role) return false;
    if (!serverUrl()) { set({ role: role, phase: 'unreachable', unreachable: role === 'gm' ? 'open' : 'join' }); return false; }
    // W-4 (B-1859): a reloaded page comes back to the campaign it was at the table for, before the link rejoins
    if (!link) { S = Object.assign(fresh(), { role: role, phase: role === 'gm' ? 'opening' : 'admitted', campaignId: campKeyFor(role) }); emit(); }
    var l = make(role); if (!l) return false;
    return l.rejoin();
  }
  // P4's "Keep it in" (B-1854, ruling `encounters-e6-walk` ADDENDUM 1): the player's campaigns that are unlinked, or linked
  // to THIS table's GM campaign — a closed table never clears the link, so last session's campaign comes back — with that
  // one pre-picked. A campaign linked to another GM campaign stays off (one campaign holds one link).
  function keepChoices() {
    var Cs = C(), gid = S.hello && S.hello.campaignId != null ? String(S.hello.campaignId) : null;
    var all = Cs ? (Cs.load().campaigns || []).filter(function (c) { return c && c.role === 'player'; }) : [];
    var camps = all.filter(function (c) {
      return !c.table || (gid != null && c.table.gmCampaignId === gid);
    });
    var mine = camps.filter(function (c) { return c.table && gid != null && c.table.gmCampaignId === gid; })[0];
    return { camps: camps, pick: mine ? mine.id : null };
  }

  // ── the fight card (F6-a, G8): a linked `who` not on this device ──
  function seatOf(who) {
    var k = Object.keys(S.seats).filter(function (id) { return S.seats[id].who === who; })[0];
    return k ? S.seats[k] : null;
  }
  function summaryFor(who) { var s = seatOf(who); return s && s.summary ? s.summary : null; }
  function presenceFor(who) { var s = seatOf(who); return s ? s.presence : null; }
  // encPcVitals' shape {w, wt, s, st} off the wire's summary (wounds, strain); null with no summary yet
  // THE ONE LINE under a party character (ruling `encounters-e6-walk` §4; B-1851, B-1847), for G3's party row and the
  // fight card alike, in encPcOf's form `species career · specialization`: this device's saved record when it holds the
  // character, else the seat's summary while a seat for that `who` exists (here or dropped), else '' (the surfaces say PC).
  // The summary is display-only and never persisted (encounters-e5-wire ADDENDUM 4).
  function lineOf(species, career, spec) { return [species, career].filter(Boolean).join(' ') + (spec ? ' · ' + spec : ''); }
  function pcOf(who) {
    who = String(who || '');
    if (/^name:/.test(who)) return { name: who.slice(5), line: 'BY NAME', rec: null };
    var id = who.slice(5), r = R();
    var rec = r ? (r.loadSavedCharacters() || []).filter(function (c) { return c && String(c.id) === id; })[0] || null : null;
    if (rec) {
      var sd = rec.sheetData || {};   // the roster's record wraps the sheet (roster.js upsertSavedCharacter)
      return { name: rec.name || 'Unnamed', line: lineOf(rec.species || sd.species, rec.career || sd.career, sd.specialization || rec.specialization), rec: rec };
    }
    var sm = summaryFor(who);
    if (sm) return { name: sm.name || 'Unnamed', line: lineOf(sm.species, sm.career, sm.specialization), rec: null, table: true };
    return { name: null, line: '', rec: null };
  }
  function vitalsFor(who) {
    var sm = summaryFor(who);
    if (!sm || !sm.wounds || !sm.strain) return null;
    return { w: sm.wounds.current || 0, wt: sm.wounds.threshold || 0, s: sm.strain.current || 0, st: sm.strain.threshold || 0 };
  }

  var api = {
    SERVER_KEY: SERVER_KEY, SEATS_KEY: SEATS_KEY, CAMP_KEY: CAMP_KEY, serverHost: serverHost, LABEL_KEY: LABEL_KEY, LABEL_MAX: LABEL_MAX,
    serverUrl: serverUrl, joinUrl: joinUrl, atOrigin: atOrigin, label: label, setLabel: setLabel, savedRole: savedRole, otherTable: otherTable,
    state: function () { return S; }, subscribe: subscribe,
    DOOR_KEY: DOOR_KEY, MEM_KEY: MEM_KEY, WAIT_MS: WAIT_MS, doorOn: doorOn, recent: recent, remembered: remembered, memOf: memOf,
    forget: forget, joinRemembered: joinRemembered, deleteSession: deleteSession,
    lineTap: null,   // T2: the campaign id a one-tap OPEN TABLE just opened; G3 reads it once to land on G4's sheet
    open: open, admit: admit, refuse: refuse, newcode: newcode, setListed: setListed, close: close, sendXp: sendXp, sendParty: sendParty, xpLines: xpLines,
    list: list, join: join, seat: seat, taken: taken, leave: leave, rejoin: rejoin, keepChoices: keepChoices,
    pcOf: pcOf, summaryFor: summaryFor, presenceFor: presenceFor, vitalsFor: vitalsFor,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.SWRPGTableSession = api;
})(typeof window !== 'undefined' ? window : this);
