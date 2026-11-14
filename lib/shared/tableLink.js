/* lib/shared/tableLink.js — THE TABLE LINK (ENCOUNTERS E6 plumbing, card §3 step 3): the client of the table server, for both apps.
 *
 * THE WIRE IS FIXED ELSEWHERE, and this module is only its client:
 *   - the server path: `encounters-e6-wire-online` §4 (frames, relay rules), §6 (drops and rejoin), with the routes of
 *     `encounters-e6-plumbing` ADDENDUM 2 P8.1 (`/t?open=1 | ?code= | ?table= | ?list=1`; the first frame agrees);
 *   - the envelope, the seven types and their payloads: `encounters-e5-wire` §6 (kept by its ADDENDUM 3), with `seq`;
 *   - the hybrid: wire-online ADDENDUM 3 H1–H3 (the local path, the switch, `seq`, presence, the browser's question),
 *     ADDENDUM 4 R-E6W-7 (zero setup).
 *
 * TWO PATHS, ONE AT A TIME (H1–H2). The server socket stays open the whole session; it carries the pairing frames, the
 * local handshake (`signal`), presence, and play whenever the local path is not up. The local path is one WebRTC data
 * channel per player (`holocron-table`, ordered, reliable) with `iceServers: []` — host and mDNS candidates only,
 * never STUN or TURN (R-E6W-4: local means local).
 *   UP: after LET IN (never on page load, R-E6W-6.1) the initiator starts the handshake; open within 10 s → local.
 *       Otherwise server; local is retried at most once a minute, only on a network change, and not after 3 failed
 *       tries until the next rejoin. A `local-network` permission query answering `denied` skips the local path
 *       (R-E6W-6.3). No copy of ours ever explains the browser's question (R-E6W-6.5): this module draws nothing.
 *   DOWN: a channel that closes or errors puts that player on the server path at once.
 *   ON A SWITCH (and on a rejoin) each side re-sends its current state on the new path: the GM its table_hello, party
 *   and every unacknowledged xp_offer; the player its latest join and char_update and its xp_taken (all idempotent).
 * `seq` (R-E6W-5) rises with every message a sender sends, across both paths and across a reload of the tab (it is
 * kept beside the keys and never starts below the clock). A receiver drops a whole-state message (table_hello, party,
 * join, char_update) whose seq is not above the highest it applied from that sender for that type.
 *
 * WHO STARTS THE HANDSHAKE (R-E6W-6.4, a MECHANISM item, disclosed): the GM's device, unless its browser is Firefox
 * (bug 1698141), when the player's starts. The hand-off is `signal {knockId, start: true}`: "start the handshake, if
 * your limits allow" (ruling `encounters-e6-plumbing-gate` D-E6P1 (b)). A Firefox GM sends one after LET IN; a player
 * whose network changes sends one too. A received `signal` with none of sdp, candidate or start is `bad_frame` and
 * starts nothing (WebRTC's null end-of-candidates must never read as "start again"). The `sdp` field carries the
 * description object `{type, sdp}`, relayed verbatim.
 *
 * PRESENCE (H2): a player is `here` while EITHER path is up and `dropped` only when both are down (`left` after its
 * bye). On a player's device the GM is `here`, `away` (the server says gm_away and no local channel) or `lost` (our
 * server is unreachable and no local channel is up).
 *
 * KEYS (`gmKey` / `seatKey`, with `tableId` and `seq`) live in SESSION STORAGE ONLY, under one key this module alone
 * reads and writes. The link holds a peer's summary nowhere: what arrives is handed to `onEvent` and dropped.
 *
 * `summaryOf(sheet)` (brief C3, P3.1): the wire's `summary`, composed from CharResolve and SWRPGSheetPool at call time
 * with no number of its own. Null while either pool is null; the link sends join / char_update only on a non-null one.
 *
 * Classic script → window.SWRPGTableLink; CommonJS for node guards (test/table_link.cjs). Every browser API
 * (WebSocket, RTCPeerConnection, timers, sessionStorage, navigator, the window's events) is read at CALL time, or
 * injected through `createLink({env})`. NO SCREEN AND NO APP WIRING (D-301): no app loads this file yet.
 */
(function (global) {
  'use strict';

  var V = 1;
  var TYPES = ['table_hello', 'join', 'char_update', 'party', 'xp_offer', 'xp_taken', 'bye'];
  var GM_TYPES = ['table_hello', 'party', 'xp_offer', 'bye'];
  var PLAYER_TYPES = ['join', 'char_update', 'xp_taken', 'bye'];
  var WHOLE_STATE = { table_hello: 1, party: 1, join: 1, char_update: 1 };
  var CHANNEL_LABEL = 'holocron-table';
  var MSG_MAX = 64 * 1024;          // a message, on either path (wire §6; the server's rule 4)
  var LOCAL_UP_MS = 10 * 1000;      // H2: the channel opens within 10 s, or this try failed
  var LOCAL_TRIES = 3;              // H2: then no more tries until the next rejoin
  var LOCAL_GAP_MS = 60 * 1000;     // H2: at most once a minute
  var CHAR_UPDATE_MS = 2000;        // E4 §6.3: at most one char_update per 2 s
  // §6: retries back off; JOIN AGAIN / RECONNECT stay manual after the first minute (these sum to 60 s).
  var SERVER_RETRY_MS = [1000, 2000, 4000, 8000, 15000, 30000];
  var KEYS_KEY = 'swrpg_table_link_v1';

  // ── the summary (brief C3) ──────────────────────────────────────────────────────────────────────────────────────
  function poolOf(p) { return { proficiency: p.proficiency || 0, ability: p.ability || 0, boost: p.boost || 0, setback: p.setback || 0 }; }
  function summaryOf(sheet) {
    var CR = global.CharResolve, SP = global.SWRPGSheetPool;
    if (!sheet || !CR || !SP || !CR.computeDerived || !SP.sheetPoolOf) return null;
    var eq = SP.resolveSheetEquipment(sheet.equipment, sheet);
    var mods = SP.collectPoolMods(eq);
    var cool = SP.sheetPoolOf(sheet, 'COOL', mods), vigil = SP.sheetPoolOf(sheet, 'VIGIL', mods);
    if (!cool || !vigil) return null;                                   // R-M7G-9: not until the vocabulary answers
    var d = CR.computeDerived(sheet, eq, global._canonicalCharbuild) || {};
    var names = (CR.buildNamesOf && CR.buildNamesOf(sheet)) || {};
    return {
      name: sheet.name || '',
      species: sheet.species || '',
      career: names.career || sheet.career || '',
      wounds: { current: sheet.currentWounds != null ? sheet.currentWounds : 0, threshold: d.woundThreshold || 0 },
      strain: { current: sheet.currentStrain != null ? sheet.currentStrain : 0, threshold: d.strainThreshold || 0 },
      soak: d.soak || 0,
      defense: { melee: d.meleeDefense || 0, ranged: d.rangedDefense || 0 },
      pools: { cool: poolOf(cool), vigilance: poolOf(vigil) },
    };
  }

  // ── seq (R-E6W-5) ───────────────────────────────────────────────────────────────────────────────────────────────
  // accept(sender, type, seq) → true if the message applies. Whole-state types need a seq above the last applied one
  // from that sender and type; xp_offer / xp_taken / bye pass (they are idempotent by offerId, or final).
  function seqGuard() {
    var high = {};
    return {
      accept: function (sender, type, seq) {
        if (!WHOLE_STATE[type]) return true;
        if (typeof seq !== 'number' || !isFinite(seq)) return false;
        var k = sender + '|' + type;
        if (high[k] != null && seq <= high[k]) return false;
        high[k] = seq;
        return true;
      },
      highest: function (sender, type) { return high[sender + '|' + type]; },
    };
  }

  function utf8Len(s) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s).length;
    return unescape(encodeURIComponent(s)).length;
  }
  function typesFor(role) { return role === 'gm' ? GM_TYPES : role === 'player' ? PLAYER_TYPES : []; }
  function isFirefox(nav) { return !!(nav && /firefox\//i.test(nav.userAgent || '')); }

  // R-E6W-6.3: `denied` from either query name skips the local path; no answer (unsupported, a throw) does not.
  function localAllowed(nav) {
    var perms = nav && nav.permissions;
    if (!perms || typeof perms.query !== 'function') return Promise.resolve(true);
    function ask(name) { try { return Promise.resolve(perms.query({ name: name })).then(function (s) { return s && s.state; }, function () { return null; }); } catch (e) { return Promise.resolve(null); } }
    return ask('local-network').then(function (a) { return a ? a : ask('local-network-access'); })
      .then(function (state) { return state !== 'denied'; });
  }

  // ── the keys, in session storage only ──────────────────────────────────────────────────────────────────────────
  function readKeys(storage) {
    try { var o = JSON.parse(storage.getItem(KEYS_KEY) || 'null'); return o && o.v === 1 ? o : null; } catch (e) { return null; }
  }
  function writeKeys(storage, keys) { try { storage.setItem(KEYS_KEY, JSON.stringify(keys)); } catch (e) { /* private mode: the link still works */ } }
  function clearKeys(storage) { try { storage.removeItem(KEYS_KEY); } catch (e) {} }

  function defaultEnv() {
    return {
      WebSocket: global.WebSocket, RTCPeerConnection: global.RTCPeerConnection,
      setTimeout: function (f, ms) { return global.setTimeout(f, ms); }, clearTimeout: function (t) { return global.clearTimeout(t); },
      now: function () { return Date.now(); },
      storage: (function () { try { return global.sessionStorage; } catch (e) { return null; } })(),
      navigator: global.navigator,
      on: function (name, fn) { if (global.addEventListener) global.addEventListener(name, fn); },
      off: function (name, fn) { if (global.removeEventListener) global.removeEventListener(name, fn); },
    };
  }
  var NO_STORAGE = { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} };

  /**
   * createLink({ role: 'gm' | 'player', server: 'wss://<table server>', onEvent(ev), env? })
   * Events (every one a plain object with `kind`):
   *   frame    {f}                  a server frame the caller draws from (opened, knock, tables, admitted, error, …)
   *   message  {from, env}          an applied play message (`from` = 'gm' or a knockId)
   *   unknown  {from, type}         a type this version does not know: one system line, never applied (wire §6)
   *   version  {from}               a peer on a newer envelope: the link sent `bye version`
   *   presence {who, state}         'here' | 'dropped' | 'left' for a player (on the GM's device); 'here' | 'away' | 'lost' for the GM
   *   path     {who, path}          'local' | 'server' (never drawn: H5 — for instruments only)
   *   ended    {code}               the table is gone (closed / no_table on rejoin); keys cleared
   */
  function createLink(opts) {
    var role = opts.role, base = String(opts.server || '').replace(/\/+$/, ''), emit = opts.onEvent || function () {};
    var env = Object.assign(defaultEnv(), opts.env || {});
    var storage = env.storage || NO_STORAGE;
    if (role !== 'gm' && role !== 'player') throw new Error('tableLink: role must be gm or player');

    var keys = readKeys(storage);
    if (keys && keys.role !== role) keys = null;
    var seq = Math.max((keys && keys.seq) || 0, env.now());
    var ws = null, wsUp = false, retryAt = 0, retryTimer = null, closing = false, wantSocket = false;
    var peers = {};                        // GM: one per knockId; player: one, 'gm'
    var guard = seqGuard();
    var lastSent = {};                     // `${to}|${type}` → payload, the whole-state messages to re-send
    var offers = {};                       // GM: offerId → {to, payload} until its xp_taken
    var taken = [];                        // player: every xp_taken this session, re-sent on a switch (idempotent)
    var charPending = null, charTimer = null, lastCharAt = 0;
    var gmServer = null;                   // player: the server's last word on the GM ('here' | 'gm_away')
    var presenceSeen = {};
    var asFirefoxGm = role === 'gm' && isFirefox(env.navigator);

    function saveKeys() { if (keys) { keys.seq = seq; writeKeys(storage, keys); } }
    function nextSeq() { seq = Math.max(seq + 1, env.now()); saveKeys(); return seq; }

    // ── the server socket ──
    function connect(query, first) {
      wantSocket = true; closing = false;
      if (ws) { try { ws.onclose = null; ws.close(); } catch (e) {} }
      var sock = new env.WebSocket(base + '/t' + query);
      ws = sock;
      sock.onopen = function () { if (ws !== sock) return; wsUp = true; retryAt = 0; sendServer(first); presenceAll(); };
      sock.onmessage = function (e) { if (ws !== sock) return; var f; try { f = JSON.parse(e.data); } catch (x) { return; } onServer(f); };
      sock.onclose = function () { if (ws !== sock) return; ws = null; wsUp = false; onServerDown(); };
      sock.onerror = function () {};
    }
    function sendServer(f) {
      if (!ws || !wsUp) return false;
      try { ws.send(JSON.stringify(Object.assign({ v: V }, f))); return true; } catch (e) { return false; }
    }
    function onServerDown() {
      Object.keys(peers).forEach(function (id) { peers[id].server = null; });
      if (role === 'player') gmServer = null;
      presenceAll();
      if (closing || !wantSocket) return;
      if (!keys || !keys.tableId) return;                           // nothing to rejoin: the caller's line, the caller's retry
      if (retryAt >= SERVER_RETRY_MS.length) { emit({ kind: 'presence', who: role === 'gm' ? 'table' : 'gm', state: 'lost' }); return; }
      var ms = SERVER_RETRY_MS[retryAt++];
      retryTimer = env.setTimeout(function () { retryTimer = null; rejoin(true); }, ms);
    }

    function peerOf(id) {
      if (!peers[id]) peers[id] = { id: id, server: null, pc: null, dc: null, local: false, tries: 0, lastTry: -Infinity, timer: null, denied: false, initiator: role === 'gm' ? !asFirefoxGm : false, queued: [] };
      return peers[id];
    }

    function onServer(f) {
      switch (f.t) {
        case 'opened':                                               // open, rejoin and newcode (ADDENDUM 3 F1–F3)
          keys = { v: 1, role: 'gm', tableId: f.tableId, gmKey: f.gmKey || (keys && keys.gmKey), seq: seq };
          saveKeys();
          emit({ kind: 'frame', f: f });
          return;
        case 'admitted':
          keys = { v: 1, role: 'player', tableId: f.tableId, seatKey: f.seatKey, seq: seq };
          saveKeys();
          gmServer = 'here';
          peerOf('gm').server = 'here';
          emit({ kind: 'frame', f: { t: 'admitted', tableId: f.tableId } });   // the key stays in here
          presence(peerOf('gm'));
          resendTo(peerOf('gm'));
          return;
        case 'peer': {                                               // GM's device
          var p = peerOf(f.knockId), was = p.server;
          p.server = f.state;
          presence(p);
          if (f.state === 'here' && was !== 'here') { p.tries = 0; resendTo(p); beginLocal(p); }
          if (f.state === 'left') { dropLocal(p, true); delete peers[f.knockId]; }
          return;
        }
        case 'table': {                                              // player's device
          var g = peerOf('gm'), before = gmServer;
          gmServer = f.state;
          g.server = f.state === 'here' ? 'here' : 'gm_away';
          presence(g);
          if (f.state === 'here' && before !== 'here') { g.tries = 0; resendTo(g); }
          return;
        }
        case 'signal': onSignal(peerOf(role === 'gm' ? f.knockId : 'gm'), f); return;
        case 'play': {
          var msg = f.msg || {};
          onPlay(role === 'gm' ? msg.actorId : 'gm', msg, 'server');
          return;
        }
        case 'error':
          if (f.code === 'closed' && keys) { clearKeys(storage); keys = null; wantSocket = false; emit({ kind: 'ended', code: 'closed' }); }
          emit({ kind: 'frame', f: f });
          return;
        default:
          emit({ kind: 'frame', f: f });
      }
    }

    // ── play: in ──
    function onPlay(from, msg, via) {
      if (!msg || typeof msg !== 'object' || from == null) return;
      if (typeof msg.v === 'number' && msg.v > V) {
        sendTo(from, 'bye', { reason: 'version' });
        emit({ kind: 'version', from: from });
        return;
      }
      if (TYPES.indexOf(msg.type) === -1) { emit({ kind: 'unknown', from: from, type: msg.type }); return; }
      if (typesFor(from === 'gm' ? 'gm' : 'player').indexOf(msg.type) === -1) return;   // type by role, either path
      if (!guard.accept(from, msg.type, msg.seq)) return;                                // R-E6W-5
      if (role === 'gm' && msg.type === 'xp_taken' && msg.payload) delete offers[msg.payload.offerId];
      var out = Object.assign({}, msg, { actorId: from });                                // never what the sender says
      emit({ kind: 'message', from: from, env: out, via: via });
    }

    // ── play: out ──
    function envelope(type, payload) {
      return { v: V, ts: env.now(), actorId: role === 'gm' ? 'gm' : (keys && keys.knockId) || 'player', type: type, payload: payload, seq: nextSeq() };
    }
    function deliver(p, msg) {
      var text = JSON.stringify(msg);
      if (utf8Len(text) > MSG_MAX) return false;
      if (p.local && p.dc && p.dc.readyState === 'open') {
        try { p.dc.send(text); return true; } catch (e) { dropLocal(p); }
      }
      return role === 'gm' ? sendServer({ t: 'play', to: p.id, msg: msg }) : sendServer({ t: 'play', msg: msg });
    }
    function sendTo(to, type, payload) {
      var targets = role === 'player' ? [peerOf('gm')]
        : to === 'all' ? Object.keys(peers).map(function (k) { return peers[k]; }).filter(function (p) { return p.server === 'here' || p.local; })
        : [peerOf(to)];
      var msg = envelope(type, payload), ok = true;
      targets.forEach(function (p) { ok = deliver(p, msg) && ok; });
      return ok;
    }
    // send(type, payload, to?) — `to` (GM only): a knockId or 'all' (the default).
    function send(type, payload, to) {
      if (typesFor(role).indexOf(type) === -1) return false;
      if (utf8Len(JSON.stringify(payload == null ? null : payload)) > MSG_MAX) return false;
      var dest = role === 'gm' ? (to || 'all') : 'gm';
      if (WHOLE_STATE[type]) lastSent[dest + '|' + type] = payload;
      if (type === 'xp_offer' && payload && payload.offerId) offers[payload.offerId] = { to: dest, payload: payload };
      if (type === 'xp_taken') taken.push(payload);
      if (type === 'char_update') {                                  // at most one per 2 s; the latest wins
        var wait = lastCharAt + CHAR_UPDATE_MS - env.now();
        if (wait > 0) {
          charPending = payload;
          if (!charTimer) charTimer = env.setTimeout(function () { charTimer = null; var p = charPending; charPending = null; lastCharAt = env.now(); sendTo('gm', 'char_update', p); }, wait);
          return true;
        }
        lastCharAt = env.now();
      }
      return sendTo(dest, type, payload);
    }
    // H2 "on a switch, each side re-sends its current state on the new path" — and on a rejoin (§6).
    function resendTo(p) {
      if (role === 'gm') {
        ['table_hello', 'party'].forEach(function (type) {
          var pl = lastSent[p.id + '|' + type] !== undefined ? lastSent[p.id + '|' + type] : lastSent['all|' + type];
          if (pl !== undefined) deliver(p, envelope(type, pl));
        });
        Object.keys(offers).forEach(function (id) { var o = offers[id]; if (o.to === 'all' || o.to === p.id) deliver(p, envelope('xp_offer', o.payload)); });
      } else {
        if (lastSent['gm|join'] !== undefined) deliver(p, envelope('join', lastSent['gm|join']));
        if (lastSent['gm|char_update'] !== undefined) deliver(p, envelope('char_update', lastSent['gm|char_update']));
        taken.forEach(function (pl) { deliver(p, envelope('xp_taken', pl)); });
      }
    }

    // ── presence (H2) ──
    function presence(p) {
      var state;
      if (role === 'gm') state = (p.local || p.server === 'here') ? 'here' : p.server === 'left' ? 'left' : 'dropped';
      else state = p.local ? 'here' : !wsUp ? 'lost' : gmServer === 'here' ? 'here' : 'away';
      var who = role === 'gm' ? p.id : 'gm';
      if (presenceSeen[who] === state) return;
      presenceSeen[who] = state;
      emit({ kind: 'presence', who: who, state: state });
    }
    function presenceAll() {
      if (role === 'player') { if (peers.gm || keys) presence(peerOf('gm')); return; }
      Object.keys(peers).forEach(function (k) { presence(peers[k]); });
    }

    // ── the local path (H1–H3) ──
    function signal(p, fields) {
      var f = Object.assign({ t: 'signal' }, fields);
      if (role === 'gm') f.knockId = p.id;
      return sendServer(f);
    }
    // beginLocal: after LET IN or a rejoin. The initiator starts; a Firefox GM asks the player to.
    function beginLocal(p) {
      if (!env.RTCPeerConnection) return;
      if (p.initiator) startLocal(p);
      else if (role === 'gm') signal(p, { start: true });
    }
    function startLocal(p) {
      if (!env.RTCPeerConnection || p.local || p.pc || p.denied) return;
      if (p.tries >= LOCAL_TRIES || env.now() - p.lastTry < LOCAL_GAP_MS) return;
      p.tries++; p.lastTry = env.now();
      localAllowed(env.navigator).then(function (ok) {
        if (!ok) { p.denied = true; return; }
        if (p.pc || p.local) return;
        var pc = makePc(p);
        var dc = pc.createDataChannel(CHANNEL_LABEL, { ordered: true });
        wireChannel(p, dc);
        return pc.createOffer().then(function (o) { return pc.setLocalDescription(o).then(function () { return o; }); })
          .then(function (o) { if (p.pc === pc) signal(p, { sdp: { type: o.type, sdp: o.sdp } }); });
      }).catch(function () { dropLocal(p); });
    }
    function makePc(p) {
      var pc = new env.RTCPeerConnection({ iceServers: [] });        // R-E6W-4: host and mDNS only
      p.pc = pc; p.queued = [];
      pc.onicecandidate = function (e) { if (e && e.candidate && p.pc === pc) signal(p, { candidate: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate }); };
      pc.onconnectionstatechange = function () { if (p.pc === pc && (pc.connectionState === 'failed' || pc.connectionState === 'closed')) dropLocal(p); };
      if (p.timer) env.clearTimeout(p.timer);
      p.timer = env.setTimeout(function () { p.timer = null; if (p.pc === pc && !p.local) dropLocal(p); }, LOCAL_UP_MS);
      return pc;
    }
    function wireChannel(p, dc) {
      p.dc = dc;
      dc.onopen = function () {
        if (p.dc !== dc) return;
        if (p.timer) { env.clearTimeout(p.timer); p.timer = null; }
        p.local = true; p.tries = 0;
        emit({ kind: 'path', who: role === 'gm' ? p.id : 'gm', path: 'local' });
        presence(p);
        resendTo(p);
      };
      dc.onmessage = function (e) {
        if (p.dc !== dc) return;
        var msg; try { msg = JSON.parse(e.data); } catch (x) { return; }
        onPlay(role === 'gm' ? p.id : 'gm', msg, 'local');
      };
      dc.onclose = function () { if (p.dc === dc) dropLocal(p); };
      dc.onerror = function () { if (p.dc === dc) dropLocal(p); };
    }
    function onSignal(p, f) {
      if (f.start === true) {                                        // "start the handshake, if your limits allow"
        if (role === 'player') { p.initiator = true; startLocal(p); }
        else if (p.initiator) startLocal(p);
        else signal(p, { start: true });                             // a Firefox GM hands it back
        return;
      }
      if (f.sdp == null && f.candidate == null) { emit({ kind: 'frame', f: { t: 'error', code: 'bad_frame', of: 'signal' } }); return; }
      if (f.sdp && f.sdp.type === 'offer') {
        if (p.pc) dropLocal(p, true);
        if (!env.RTCPeerConnection || p.denied) return;
        localAllowed(env.navigator).then(function (ok) {
          if (!ok) { p.denied = true; return; }
          var pc = makePc(p);
          pc.ondatachannel = function (e) { if (p.pc === pc && e.channel && e.channel.label === CHANNEL_LABEL) wireChannel(p, e.channel); };
          return pc.setRemoteDescription(f.sdp)
            .then(function () { flushCandidates(p); return pc.createAnswer(); })
            .then(function (a) { return pc.setLocalDescription(a).then(function () { return a; }); })
            .then(function (a) { if (p.pc === pc) signal(p, { sdp: { type: a.type, sdp: a.sdp } }); });
        }).catch(function () { dropLocal(p); });
        return;
      }
      if (f.sdp && f.sdp.type === 'answer' && p.pc) {
        p.pc.setRemoteDescription(f.sdp).then(function () { flushCandidates(p); }).catch(function () { dropLocal(p); });
        return;
      }
      if (f.candidate && p.pc) {
        if (p.pc.remoteDescription) p.pc.addIceCandidate(f.candidate).catch(function () {});
        else p.queued.push(f.candidate);
      }
    }
    function flushCandidates(p) {
      var q = p.queued || []; p.queued = [];
      q.forEach(function (c) { if (p.pc) p.pc.addIceCandidate(c).catch(function () {}); });
    }
    // dropLocal: the channel is gone. Server at once, the state re-sent there (H2 "down").
    function dropLocal(p, quiet) {
      var was = p.local;
      if (p.timer) { env.clearTimeout(p.timer); p.timer = null; }
      var pc = p.pc, dc = p.dc;
      p.pc = null; p.dc = null; p.local = false; p.queued = [];
      try { if (dc) dc.close(); } catch (e) {}
      try { if (pc) pc.close(); } catch (e) {}
      if (!was || quiet) return;
      emit({ kind: 'path', who: role === 'gm' ? p.id : 'gm', path: 'server' });
      presence(p);
      resendTo(p);
    }
    // H2: a retry only on a network change, at most once a minute, within 3 tries.
    function onNetworkChange() {
      Object.keys(peers).forEach(function (k) {
        var p = peers[k];
        if (p.local || p.pc || p.denied || !wsUp) return;
        if (role === 'gm' ? p.server !== 'here' : gmServer !== 'here') return;
        if (p.initiator) startLocal(p);
        else if (p.tries < LOCAL_TRIES && env.now() - p.lastTry >= LOCAL_GAP_MS) { p.tries++; p.lastTry = env.now(); signal(p, { start: true }); }
      });
    }
    env.on('online', onNetworkChange);
    var conn = env.navigator && env.navigator.connection;
    if (conn && conn.addEventListener) conn.addEventListener('change', onNetworkChange);

    // ── the acts ──
    function rejoin(auto) {
      if (!keys || !keys.tableId) return false;
      if (!auto) retryAt = 0;
      if (retryTimer) { env.clearTimeout(retryTimer); retryTimer = null; }
      Object.keys(peers).forEach(function (k) { peers[k].tries = 0; });
      var first = role === 'gm' ? { t: 'rejoin', tableId: keys.tableId, gmKey: keys.gmKey } : { t: 'rejoin', tableId: keys.tableId, seatKey: keys.seatKey };
      connect('?table=' + encodeURIComponent(keys.tableId), first);
      return true;
    }
    function shutdown() {
      closing = true; wantSocket = false;
      if (retryTimer) { env.clearTimeout(retryTimer); retryTimer = null; }
      if (charTimer) { env.clearTimeout(charTimer); charTimer = null; }
      Object.keys(peers).forEach(function (k) { dropLocal(peers[k], true); });
      env.off('online', onNetworkChange);
      if (conn && conn.removeEventListener) conn.removeEventListener('change', onNetworkChange);
    }

    var api = {
      role: role,
      send: send,
      rejoin: function () { return rejoin(false); },
      hasKeys: function () { return !!(keys && keys.tableId); },
      pathOf: function (who) { var p = peers[who]; return p && p.local ? 'local' : 'server'; },
      onNetworkChange: onNetworkChange,
      dispose: function () { shutdown(); if (ws) { try { ws.close(); } catch (e) {} ws = null; } },
    };
    if (role === 'gm') {
      api.open = function (label, listed) { keys = null; clearKeys(storage); connect('?open=1', { t: 'open', label: String(label || ''), listed: !!listed }); };
      api.admit = function (knockId) { return sendServer({ t: 'admit', knockId: knockId }); };
      api.refuse = function (knockId) { return sendServer({ t: 'refuse', knockId: knockId }); };
      api.newcode = function () { return sendServer({ t: 'newcode' }); };
      api.close = function () {
        sendTo('all', 'bye', { reason: 'closed' });
        sendServer({ t: 'close' });
        clearKeys(storage); keys = null;
        shutdown();
      };
    } else {
      // join({code} | {tableId}, deviceLabel): the code goes in the URL as typed; the server normalises it (P8.2.1).
      api.join = function (where, deviceLabel) {
        keys = null; clearKeys(storage);
        if (where && where.code != null) connect('?code=' + encodeURIComponent(where.code), { t: 'join', code: String(where.code), deviceLabel: String(deviceLabel || '') });
        else connect('?table=' + encodeURIComponent(where.tableId), { t: 'join', tableId: where.tableId, deviceLabel: String(deviceLabel || '') });
      };
      // list(): its own short socket; answers through onEvent as a `tables` frame (or `slow_down`).
      api.list = function () {
        var sock = new env.WebSocket(base + '/t?list=1');
        sock.onopen = function () { try { sock.send(JSON.stringify({ v: V, t: 'list' })); } catch (e) {} };
        sock.onmessage = function (e) { var f; try { f = JSON.parse(e.data); } catch (x) { return; } emit({ kind: 'frame', f: f }); try { sock.close(); } catch (x) {} };
        sock.onerror = function () {};
      };
      api.leave = function () {
        sendTo('gm', 'bye', { reason: 'left' });
        clearKeys(storage); keys = null;
        shutdown();
      };
    }
    return api;
  }

  var api = {
    V: V, TYPES: TYPES.slice(), GM_TYPES: GM_TYPES.slice(), PLAYER_TYPES: PLAYER_TYPES.slice(), CHANNEL_LABEL: CHANNEL_LABEL,
    MSG_MAX: MSG_MAX, LOCAL_UP_MS: LOCAL_UP_MS, LOCAL_TRIES: LOCAL_TRIES, LOCAL_GAP_MS: LOCAL_GAP_MS, CHAR_UPDATE_MS: CHAR_UPDATE_MS,
    SERVER_RETRY_MS: SERVER_RETRY_MS.slice(), KEYS_KEY: KEYS_KEY,
    summaryOf: summaryOf, seqGuard: seqGuard, localAllowed: localAllowed, isFirefox: isFirefox,
    createLink: createLink,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.SWRPGTableLink = api;
})(typeof window !== 'undefined' ? window : this);
