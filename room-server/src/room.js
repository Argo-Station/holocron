/**
 * room.js — the Room Durable Object. One instance per room code; the AUTHORITY while a table is
 * connected (ruling `holotable-room-state-contract` R-RSC-1).
 *
 * THE SHAPE IT HOLDS IS NOT DEFINED HERE. `lib/shared/roomState.js` owns the schema, the
 * enumeration and every transform; this file is the transport, the authority and the lifecycle.
 * That split is the contract's "one module owns the room-state shape with two backends" — if a
 * transform ever appears in this file, there are two shapes again and the split has failed.
 *
 * HIBERNATION. Sockets are accepted with `ctx.acceptWebSocket()`, never `server.accept()`, so the
 * DO can be evicted from memory while a table sits idle mid-session and still hold every
 * connection. Handlers are `webSocketMessage` / `webSocketClose` / `webSocketError` — the
 * addEventListener pattern would pin this object in memory for the length of a game night.
 *
 * IDENTITY SURVIVES HIBERNATION via `serializeAttachment` — a socket's participant identity is
 * stored ON the socket, because instance fields do not survive eviction and a re-created DO must
 * still know who is on the other end of an existing connection.
 */
import { DurableObject } from 'cloudflare:workers';
import RoomState from '../../lib/shared/roomState.js';
import Rights from './rights.js';
import { shouldArmTtl, shouldCancelTtl, ttlDeadline } from './ttl.mjs';

// R-RSC-6, Jason's word: 30 days from LAST DISCONNECT. Set at disconnect, never a standing
// heartbeat — an idle hibernating room must cost nothing.
// TTL_MS and the arm/cancel rules live in ./ttl.mjs — pure, and therefore guardable in Node.

const STATE_KEY = 'room_state';

// A room's whole state is stored as ONE value under ONE key, deliberately. The contract's
// snapshot-on-join IS the schema verbatim (R-RSC-1), so a relational decomposition here would
// create a second shape to keep in step — the exact thing the contract avoided. The state is
// small: slots, token positions, two Destiny counters and a roster.

export class Room extends DurableObject {
  async fetch(request) {
    // Handle the upgrade EXPLICITLY. A plain GET to a room URL is a mistake worth naming, not
    // something to answer with a confusing 500 three frames later.
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected a websocket upgrade', { status: 426 });
    }

    const url = new URL(request.url);
    const roomCode = url.searchParams.get('room') || null;

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);

    // A socket has NO IDENTITY until it says who it is. Until then `rights.js` admits exactly one
    // kind of message (`identify_first`). Stored on the socket so it survives hibernation.
    server.serializeAttachment({ memberId: null, side: null });

    // Someone is here — the room is not expiring. Cancel any pending TTL alarm. The count includes
    // the socket that just arrived, so this is always a cancel; it goes through the same predicate
    // as the arm so both directions read from one rule (ttl.mjs) rather than two inline conditions.
    if (shouldCancelTtl(this.ctx.getWebSockets().length)) await this.ctx.storage.deleteAlarm();

    const state = await this.#load(roomCode);
    // SNAPSHOT-ON-JOIN (R-RSC-1): the whole state in one frame, then enumerated deltas thereafter.
    server.send(JSON.stringify({ type: 'snapshot', state }));

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    let msg;
    try {
      msg = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
    } catch (e) {
      return this.#refuse(ws, 'malformed_json', null);
    }

    const who = ws.deserializeAttachment() || { memberId: null, side: null };

    // THE RIGHTS CHECK, BEFORE THE TRANSFORM. Authorization and state-transform are kept apart on
    // purpose: roomState.applyDelta is pure and knows nothing about who may call it, so a future
    // caller cannot bypass one by reaching the other.
    const before = await this.#load(null);
    // The claim check needs the order it is claiming AGAINST, and only the DO holds it. Passed
    // alongside the message rather than folded into it, so the sender can never supply its own
    // "current" and authorize itself.
    const refusal = Rights.rightsRefusal(who, Object.assign({}, msg, { __current: before.initiative }));
    if (refusal) return this.#refuse(ws, refusal, msg.type);

    let after;
    try {
      after = RoomState.applyDelta(before, msg);
    } catch (e) {
      // THE FENCE BITES HERE (R-HT-5). An unknown event type, a malformed delta, or a flip of an
      // empty Destiny pool all arrive as a typed refusal from the store. It is answered to the
      // SENDER and NOT broadcast — a refused event never becomes table state.
      return this.#refuse(ws, e.refused || 'refused', msg.type);
    }

    // A membership hello binds this socket's identity for the rest of its life.
    if (msg.type === 'membership' && msg.present !== false && msg.memberId != null) {
      ws.serializeAttachment({ memberId: String(msg.memberId), side: msg.side });
    }

    await this.ctx.storage.put(STATE_KEY, after);
    this.#broadcast(msg);
  }

  async webSocketClose(ws, code, reason) {
    // Drop the participant from the roster so the table sees them leave.
    const who = ws.deserializeAttachment();
    if (who && who.memberId) {
      const delta = { type: 'membership', memberId: who.memberId, present: false };
      try {
        const after = RoomState.applyDelta(await this.#load(null), delta);
        await this.ctx.storage.put(STATE_KEY, after);
        this.#broadcast(delta, ws);
      } catch (e) { /* a roster we cannot update must not block the close */ }
    }
    await this.#armExpiryIfEmpty(ws);
    try { ws.close(code, 'closing'); } catch (e) { /* already closed */ }
  }

  async webSocketError(ws) {
    await this.#armExpiryIfEmpty(ws);
  }

  // R-RSC-6: the alarm is armed only when the LAST socket goes. `getWebSockets()` can still include
  // the socket currently closing, so it is excluded by identity rather than by count.
  async #armExpiryIfEmpty(closing) {
    const live = this.ctx.getWebSockets().filter((s) => s !== closing);
    if (!shouldArmTtl(live.length)) return;
    const deadline = ttlDeadline(Date.now());
    if (deadline === null) return;          // an unreadable clock arms nothing, rather than garbage
    await this.ctx.storage.setAlarm(deadline);
  }

  // The room's board is kept for 30 days after the table last disconnects, then deleted. A weekly
  // campaign that pauses mid-combat comes back to its board; an abandoned room does not linger.
  async alarm() {
    await this.ctx.storage.deleteAll();
  }

  async #load(roomCode) {
    const stored = await this.ctx.storage.get(STATE_KEY);
    const state = RoomState.normalize(stored);
    if (!state.roomCode && roomCode) state.roomCode = roomCode;
    return state;
  }

  #refuse(ws, reason, type) {
    try { ws.send(JSON.stringify({ type: 'refused', reason, refusedType: type || null })); }
    catch (e) { /* the socket went away mid-refusal */ }
  }

  #broadcast(delta, except) {
    const frame = JSON.stringify(delta);
    for (const s of this.ctx.getWebSockets()) {
      if (s === except) continue;
      try { s.send(frame); } catch (e) { /* a dead socket must not stop the others */ }
    }
  }
}
