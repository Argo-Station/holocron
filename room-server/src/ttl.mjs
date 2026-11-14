/**
 * ttl.js — the room's 30-day expiry DECISION, pure and runtime-free.
 *
 * R-RSC-6 (Jason's word): thirty days from the LAST DISCONNECT. Set at disconnect, NEVER a
 * standing heartbeat — a heartbeat keeps a Durable Object awake and billed for a room nobody is
 * sitting at, which is the failure mode the alarm exists to avoid.
 *
 * WHY THIS IS A SEPARATE FILE. `room.js` imports `cloudflare:workers`, so nothing in it can be
 * loaded by plain Node — which left the TTL rule unguarded by anything short of a Workers runtime
 * this repo does not have. The DECISION lives here and the Durable Object merely applies it, so
 * the rule is testable by `node test/room_join_gate.cjs` and the wiring stays thin enough to read.
 */
export const TTL_MS = 30 * 24 * 60 * 60 * 1000;   // 30 days

/**
 * Arm the expiry alarm ONLY when the last socket has gone.
 * `liveSockets` is the count AFTER the closing socket has been excluded.
 */
export function shouldArmTtl(liveSockets) {
  const n = Number(liveSockets);
  if (!Number.isFinite(n) || n < 0) return false;   // an unreadable count never arms
  return n === 0;
}

/** The deadline to hand `storage.setAlarm`. `now` is injected; this module never reads a clock. */
export function ttlDeadline(now) {
  const t = Number(now);
  if (!Number.isFinite(t)) return null;             // refuse rather than arm a garbage alarm
  return t + TTL_MS;
}

/** True when someone is present, i.e. any pending expiry alarm must be CANCELLED. */
export function shouldCancelTtl(liveSockets) {
  const n = Number(liveSockets);
  return Number.isFinite(n) && n > 0;
}
