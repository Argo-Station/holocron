/**
 * table.js — the Table Durable Object: ONE per open table (ruling `encounters-e6-wire-online` R-E6W-2), the relay between
 * the GM's socket and each admitted player's. It RELAYS AND NEVER STORES GAME CONTENT (§5, D-524 b4): a `play` or
 * `signal` frame is in memory only while it is forwarded, and its payload is never parsed (only `msg.type`, for the
 * relay rules).
 *
 * WHAT IT HOLDS (§5), under ONE storage key while the session lives, and deleted at close or by the alarm:
 *   meta = { tableId, label, listed, group, code, codeExpiresAt, gmKeyHash, seats: { <knockId>: { deviceLabel, seatKeyHash } },
 *            lastFrameAt, emptySince }
 * Per-socket identity rides each socket's attachment ({ role: 'pending'|'knock'|'gm'|'player', mode, knockId?,
 * deviceLabel?, group }), which survives hibernation and is lost when that socket closes (§7) — so the seats live in
 * storage too. The keys themselves are never stored: their SHA-256 hashes are.
 *
 * HIBERNATION (R-E6W-3): sockets are accepted with `ctx.acceptWebSocket()`; handlers are webSocketMessage/Close/Error;
 * pings are answered by `setWebSocketAutoResponse` without waking the object (H1). The room server's pattern.
 * THE ALARM is the earlier of "30 min with no socket attached" and "24 h after the last frame" (rules.mjs `wipeAt`).
 */
import { DurableObject } from 'cloudflare:workers';
import * as R from './rules.mjs';

const META = 'meta';
const PING = '{"v":1,"t":"ping"}', PONG = '{"v":1,"t":"pong"}';

function rand(n) { const b = new Uint8Array(n); crypto.getRandomValues(b); return b; }
async function sha256(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), (x) => x.toString(16).padStart(2, '0')).join('');
}
const send = (ws, frame) => { try { ws.send(JSON.stringify(Object.assign({ v: R.V }, frame))); } catch (e) { /* gone */ } };

export class Table extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.rates = new Map();           // socket → its last second's frame times (memory only: a reset only forgives)
    try { ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG)); } catch (e) { /* older runtime */ }
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('expected a websocket upgrade', { status: 426 });
    // The Worker's route (ADDENDUM 2, P8.1): 'open' | 'code' (with the normalised code) | 'table' (with the URL's id).
    const mode = request.headers.get('x-table-mode');
    const group = request.headers.get('x-table-group') || null;
    const urlCode = request.headers.get('x-table-code') || null, urlTable = request.headers.get('x-table-id') || null;
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ role: 'pending', mode, group, urlCode, urlTable });
    const meta = await this.#meta();                            // a guessed id holds none, and nothing below writes (P8.1.4)
    if (meta && meta.emptySince != null) { meta.emptySince = null; await this.#save(meta); }
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    const now = Date.now();
    let times = this.rates.get(ws);
    if (!times) { times = []; this.rates.set(ws, times); }
    if (!R.rateAllows(times, now)) return send(ws, { t: 'error', code: 'slow_down' });
    const read = R.readFrame(raw);
    if (!read.ok) return send(ws, { t: 'error', code: read.code });
    const f = read.frame, who = ws.deserializeAttachment() || { role: 'pending' };
    const meta = await this.#meta();
    if (who.role === 'pending') return this.#first(ws, who, f, meta, now);
    if (!meta) { send(ws, { t: 'error', code: 'closed' }); return this.#hangUp(ws); }
    if (who.role === 'knock') return send(ws, { t: 'error', code: 'bad_frame' });   // nothing but waiting until LET IN
    if (who.role === 'gm') return this.#fromGm(ws, f, meta, now);
    if (who.role === 'player') return this.#fromPlayer(ws, who, f, meta, now);
    return send(ws, { t: 'error', code: 'bad_frame' });
  }

  // ── the first frame on a socket: it must AGREE with the route (ADDENDUM 2, P8.1.2), or bad_frame and close ──
  async #first(ws, who, f, meta, now) {
    if (who.mode === 'open' && f.t === 'open') {
      if (meta) { send(ws, { t: 'error', code: 'bad_frame' }); return this.#hangUp(ws); }
      const gmKey = R.b64url(rand(32));
      const m = { tableId: this.ctx.id.toString(), label: f.label, listed: f.listed, group: who.group, code: null, codeExpiresAt: null,
        gmKeyHash: await sha256(gmKey), seats: {}, lastFrameAt: now, emptySince: null };
      if (!(await this.#issueCode(m, now))) return send(ws, { t: 'error', code: 'full' });
      await this.#save(m);
      ws.serializeAttachment({ role: 'gm', group: who.group });
      return send(ws, { t: 'opened', code: m.code, codeExpiresAt: m.codeExpiresAt, gmKey, tableId: m.tableId });
    }
    const joinHere = f.t === 'join' && ((who.mode === 'code' && f.code != null && R.normalizeCode(f.code) === who.urlCode && f.tableId == null)
      || (who.mode === 'table' && f.tableId === who.urlTable && f.code == null));
    if (joinHere) {
      if (!meta) { await this.#missed(who); send(ws, { t: 'error', code: 'no_table' }); return this.#hangUp(ws); }
      if (Object.keys(meta.seats).length >= R.MAX_SEATS) { send(ws, { t: 'error', code: 'full' }); return this.#hangUp(ws); }
      const knockId = 'k_' + R.b64url(rand(9));
      ws.serializeAttachment({ role: 'knock', knockId, deviceLabel: f.deviceLabel, group: who.group });
      const gm = this.#gm();
      if (gm) send(gm, { t: 'knock', knockId, deviceLabel: f.deviceLabel });
      return this.#touch(meta, now);
    }
    if (who.mode === 'table' && f.t === 'rejoin' && f.tableId === who.urlTable) return this.#rejoin(ws, who, f, meta, now);
    send(ws, { t: 'error', code: 'bad_frame' });
    return this.#hangUp(ws);
  }
  // A miss on a guessed or dead table is counted in the group's storage (P8.3) — in the GROUP's object, never this one.
  async #missed(who) {
    if (!who.group) return;
    try { await this.#listing(who.group).fetch('https://listing/failed', { method: 'POST', body: '{}' }); } catch (e) {}
  }

  async #rejoin(ws, who, f, meta, now) {
    if (!meta || f.tableId !== meta.tableId) { send(ws, { t: 'error', code: 'closed' }); return this.#hangUp(ws); }
    if (f.gmKey && (await sha256(f.gmKey)) === meta.gmKeyHash) {
      for (const s of this.ctx.getWebSockets()) if (s !== ws && (s.deserializeAttachment() || {}).role === 'gm') this.#hangUp(s);
      ws.serializeAttachment({ role: 'gm', group: who.group });
      send(ws, { t: 'opened', code: meta.code, codeExpiresAt: meta.codeExpiresAt, tableId: meta.tableId });
      const live = new Set();
      for (const s of this.ctx.getWebSockets()) {
        const a = s.deserializeAttachment() || {};
        if (a.role === 'player') { live.add(a.knockId); send(ws, { t: 'peer', knockId: a.knockId, state: 'here' }); send(s, { t: 'table', state: 'here' }); }
        if (a.role === 'knock') send(ws, { t: 'knock', knockId: a.knockId, deviceLabel: a.deviceLabel });
      }
      // an admitted seat with no live socket is DROPPED, so a reloaded GM page still draws its dot (ADDENDUM 3 F2, R-E6P-R6)
      for (const knockId of Object.keys(meta.seats || {})) if (!live.has(knockId)) send(ws, { t: 'peer', knockId, state: 'dropped' });
      return this.#touch(meta, now);
    }
    if (f.seatKey) {
      const h = await sha256(f.seatKey);
      const knockId = Object.keys(meta.seats).find((k) => meta.seats[k].seatKeyHash === h);
      if (knockId) {
        for (const s of this.ctx.getWebSockets()) {
          const a = s.deserializeAttachment() || {};
          if (s !== ws && a.role === 'player' && a.knockId === knockId) this.#hangUp(s);
        }
        ws.serializeAttachment({ role: 'player', knockId, deviceLabel: meta.seats[knockId].deviceLabel, group: who.group });
        const gm = this.#gm();
        send(ws, { t: 'table', state: gm ? 'here' : 'gm_away' });
        if (gm) send(gm, { t: 'peer', knockId, state: 'here' });
        return this.#touch(meta, now);
      }
    }
    send(ws, { t: 'error', code: 'closed' });
    return this.#hangUp(ws);
  }

  async #fromGm(ws, f, meta, now) {
    if (f.t === 'admit' || f.t === 'refuse') {
      const knock = this.#knock(f.knockId);
      if (!knock) return send(ws, { t: 'error', code: 'bad_frame' });
      const a = knock.deserializeAttachment();
      if (f.t === 'refuse') { send(knock, { t: 'error', code: 'refused' }); return this.#hangUp(knock); }
      if (Object.keys(meta.seats).length >= R.MAX_SEATS) { send(knock, { t: 'error', code: 'full' }); return this.#hangUp(knock); }
      const seatKey = R.b64url(rand(32));
      meta.seats[a.knockId] = { deviceLabel: a.deviceLabel, seatKeyHash: await sha256(seatKey) };
      knock.serializeAttachment({ role: 'player', knockId: a.knockId, deviceLabel: a.deviceLabel, group: a.group });
      meta.lastFrameAt = now;
      await this.#save(meta);
      send(knock, { t: 'admitted', seatKey, tableId: meta.tableId });   // tableId: the rejoin's handle (flagged, P8.5)
      return send(ws, { t: 'peer', knockId: a.knockId, state: 'here' });
    }
    if (f.t === 'newcode') {
      await this.#dropCode(meta);
      if (!(await this.#issueCode(meta, now))) return send(ws, { t: 'error', code: 'full' });
      meta.lastFrameAt = now;
      await this.#save(meta);
      return send(ws, { t: 'opened', code: meta.code, codeExpiresAt: meta.codeExpiresAt, tableId: meta.tableId });
    }
    if (f.t === 'close') return this.#end(meta, ws);
    if (f.t === 'play') {
      if (!R.playAllowed('gm', f.msg.type)) return send(ws, { t: 'error', code: 'bad_frame' });
      const msg = Object.assign({}, f.msg, { actorId: 'gm' });        // the server stamps actorId (rule 2)
      const to = f.to == null ? 'all' : f.to;
      for (const s of this.ctx.getWebSockets()) {
        const a = s.deserializeAttachment() || {};
        if (a.role === 'player' && (to === 'all' || a.knockId === to)) send(s, { t: 'play', msg });
      }
      return this.#touch(meta, now);
    }
    if (f.t === 'signal') {
      if (utf8(f) > R.PAIR_MAX || !f.knockId) return send(ws, { t: 'error', code: 'bad_frame' });
      const p = this.#player(f.knockId);
      if (p) send(p, signalOut(f, f.knockId));
      return this.#touch(meta, now);
    }
    return send(ws, { t: 'error', code: 'bad_frame' });
  }

  async #fromPlayer(ws, who, f, meta, now) {
    if (f.t === 'play') {
      if (!R.playAllowed('player', f.msg.type)) return send(ws, { t: 'error', code: 'bad_frame' });
      const msg = Object.assign({}, f.msg, { actorId: who.knockId });   // stamped, never trusted (rule 2)
      const gm = this.#gm();
      if (gm) send(gm, { t: 'play', msg });                             // stars only (rule 1): never another player
      if (f.msg.type === 'bye') {                                       // the player LEFT: its seat goes, so does its key
        delete meta.seats[who.knockId];
        await this.#save(meta);
        if (gm) send(gm, { t: 'peer', knockId: who.knockId, state: 'left' });
        ws.serializeAttachment(Object.assign({}, who, { role: 'gone' }));
        return this.#hangUp(ws);
      }
      return this.#touch(meta, now);
    }
    if (f.t === 'signal') {
      if (utf8(f) > R.PAIR_MAX) return send(ws, { t: 'error', code: 'bad_frame' });
      const gm = this.#gm();
      if (gm) send(gm, signalOut(f, who.knockId));                      // the server fills knockId for a player (H1)
      return this.#touch(meta, now);
    }
    return send(ws, { t: 'error', code: 'bad_frame' });
  }

  async webSocketClose(ws) { return this.#gone(ws); }
  async webSocketError(ws) { return this.#gone(ws); }

  async #gone(ws) {
    this.rates.delete(ws);
    const a = ws.deserializeAttachment() || {};
    const meta = await this.#meta();
    if (!meta) return;
    if (a.role === 'player') { const gm = this.#gm(ws); if (gm) send(gm, { t: 'peer', knockId: a.knockId, state: 'dropped' }); }
    if (a.role === 'gm') for (const s of this.#live(ws)) if ((s.deserializeAttachment() || {}).role === 'player') send(s, { t: 'table', state: 'gm_away' });
    if (!this.#live(ws).length) { meta.emptySince = Date.now(); await this.#save(meta); }
  }

  // §5: the session ends at `close`, or by the alarm. Everything the table held goes, and so do its code and listing.
  async alarm() {
    const meta = await this.#meta();
    if (!meta) return this.ctx.storage.deleteAll();
    const due = R.wipeAt(meta, Number(this.env.TEST_EMPTY_MS) || 0);
    if (due != null && due > Date.now()) return this.ctx.storage.setAlarm(due);
    return this.#end(meta, null);
  }

  async #end(meta, gmWs) {
    for (const s of this.ctx.getWebSockets()) {
      const a = s.deserializeAttachment() || {};
      if (s !== gmWs && a.role !== 'gm') send(s, { t: 'error', code: 'closed' });
      this.#hangUp(s);
    }
    await this.#dropCode(meta);
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  // ── the code and the listing (P8.2, P8.3): the Code object points a code at this table; the group's object lists it ──
  async #issueCode(meta, now) {
    for (let i = 0; i < 6; i++) {
      const code = R.newCode(() => rand(1)[0]);
      const r = await this.env.CODE.get(this.env.CODE.idFromName(code)).fetch('https://code/put', {
        method: 'POST', body: JSON.stringify({ tableId: meta.tableId, codeExpiresAt: now + R.CODE_TTL_MS }) });
      if (r.ok) {
        meta.code = code; meta.codeExpiresAt = now + R.CODE_TTL_MS;
        if (meta.listed && meta.group) await this.#listing(meta.group).fetch('https://listing/put', {
          method: 'POST', body: JSON.stringify({ tableId: meta.tableId, label: meta.label, openedAt: now, expiresAt: meta.codeExpiresAt }) });
        return true;
      }
    }
    return false;
  }
  async #dropCode(meta) {
    if (meta.code) { try { await this.env.CODE.get(this.env.CODE.idFromName(meta.code)).fetch('https://code/drop', { method: 'POST', body: JSON.stringify({ tableId: meta.tableId }) }); } catch (e) {} }
    if (meta.listed && meta.group) { try { await this.#listing(meta.group).fetch('https://listing/drop', { method: 'POST', body: JSON.stringify({ tableId: meta.tableId }) }); } catch (e) {} }
  }
  #listing(group) { return this.env.LISTING.get(this.env.LISTING.idFromName(group)); }

  // ── storage: ONE key; the alarm kept at the earlier deadline. A frame only re-arms when the 24 h deadline would come
  // sooner than an hour from now, so relaying does not write storage per frame. ──
  async #meta() { return (await this.ctx.storage.get(META)) || null; }
  async #save(meta) {
    await this.ctx.storage.put(META, meta);
    const due = R.wipeAt(meta, Number(this.env.TEST_EMPTY_MS) || 0);
    if (due != null) await this.ctx.storage.setAlarm(due);
  }
  async #touch(meta, now) {
    if (now - (meta.lastFrameAt || 0) > 60 * 60 * 1000) { meta.lastFrameAt = now; await this.#save(meta); }
  }

  #live(except) { return this.ctx.getWebSockets().filter((s) => s !== except && (s.deserializeAttachment() || {}).role !== 'gone'); }
  #gm(except) { return this.#live(except).find((s) => (s.deserializeAttachment() || {}).role === 'gm') || null; }
  #knock(knockId) { return this.#live().find((s) => { const a = s.deserializeAttachment() || {}; return a.role === 'knock' && a.knockId === knockId; }) || null; }
  #player(knockId) { return this.#live().find((s) => { const a = s.deserializeAttachment() || {}; return a.role === 'player' && a.knockId === knockId; }) || null; }
  #hangUp(ws) { try { ws.close(1000, 'closing'); } catch (e) { /* already closed */ } }
}

function signalOut(f, knockId) {
  const out = { t: 'signal', knockId };
  if (f.sdp != null) out.sdp = f.sdp;
  if (f.candidate != null) out.candidate = f.candidate;
  if (f.start === true) out.start = true;                               // D-E6P1 (b): the hand-off, by name
  return out;
}
function utf8(f) { return R.utf8Length(JSON.stringify(f)); }
