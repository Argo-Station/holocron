/**
 * index.js — the room server's Worker entry. Routes a websocket upgrade to one Durable Object per
 * room code, and refuses an out-of-date client AT THE DOOR.
 *
 * THIS WORKER IS THE SECOND DEPLOYABLE (R-RSC-5). It is not part of the Pages build and a
 * `commercial` push does not ship it; see room-server/wrangler.jsonc for why that is a platform
 * fact rather than a choice.
 */
import RoomState from '../../lib/shared/roomState.js';
import { Room } from './room.js';

// The Durable Object class must be exported from the Worker's entry for the runtime to find it.
export { Room };

const json = (body, status) =>
  Response.json(body, { status: status || 200, headers: { 'cache-control': 'no-store' } });

// A room code is the ONLY handle to a table — there are no accounts (R-HT-4) — so it is also the
// Durable Object's name. Bounded and charset-limited here to keep a hostile string out of
// `idFromName`.
//
// THE CANONICAL CODE FORMAT IS NOT RULED YET, and this validator does NOT decide it: it is a
// permissive bound (safe characters, sane length), not an alphabet or a length contract. The real
// format carries guessability consequences — how hard a stranger can dictionary-attack a live
// table — which makes it R-Y2-1 class, not a helper's call. Flagged at the gate.
const ROOM_CODE = /^[A-Za-z0-9-]{4,32}$/;

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      if (url.pathname === '/ping') {
        return json({ ok: true, service: 'holocron-room-server', schema: RoomState.SCHEMA_VERSION });
      }

      if (url.pathname !== '/room') return json({ ok: false, error: 'not_found' }, 404);

      const code = url.searchParams.get('room') || '';
      if (!ROOM_CODE.test(code)) return json({ ok: false, error: 'bad_room_code' }, 400);

      // ── THE VERSION-GATED JOIN (R-V7S-3, confirmed at R-RSC-1) ──
      //
      // A client older than the room is REFUSED HERE, before it holds a socket. The alternative —
      // admitting it and letting it render what it understands — is the named anti-pattern: a
      // participant who joins, sees the board, and silently cannot act.
      //
      // THE WIRE CARRIES A MACHINE REASON, NOT USER COPY. The join-gate's wording is part of the
      // substrate's R-MU1 surface work and owes its mockup; inventing the sentence here would be
      // building that surface through the back door.
      // THE DECISION IS `RoomState.joinDecision`, not a copy of it. It used to be inline here,
      // where nothing outside a Workers runtime could execute it; it now lives in the store beside
      // SCHEMA_VERSION and is guarded by test/room_join_gate.cjs. This handler only APPLIES it.
      const decision = RoomState.joinDecision(url.searchParams.get('v'));
      if (!decision.ok) {
        const body = { ok: false, error: decision.error };
        if (decision.error === 'room_schema_newer') {
          body.roomSchema = decision.roomSchema;
          body.clientSchema = decision.clientSchema;
        }
        return json(body, decision.status);
      }

      const id = env.ROOM.idFromName(code);
      return env.ROOM.get(id).fetch(request);
    } catch (e) {
      // Honest JSON, never a hang and never an HTML soft-200 — the same availability posture
      // worker/index.js takes for /api/*.
      return json({ ok: false, error: 'room_server_fault' }, 500);
    }
  },
};
