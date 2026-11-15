/**
 * rules.mjs — the table server's pure rules: the code alphabet, the listing group, the frame fence, the relay rules by
 * role, the rate limit and every limit number. PURE, so node guards load it (test/table_server_rules.cjs) — the Durable
 * Objects only APPLY these (the room server's ttl.mjs split).
 *
 * The wire is `encounters-e5-wire` §5 (pairing, minus offer/answer) and §6 (the envelope and its seven types), as amended
 * by `encounters-e6-wire-online` §4 (the server path and its relay rules), §5 (what is held, for how long) and ADDENDUM 3
 * H1 (`signal`). Nothing here reads a `play` frame's payload: only `msg.type`, which the relay rules need.
 */

export const V = 1;
export const SERVICE = 'holocron-table-server';
export const SCHEMA = 1;

// ── limits (wire §5, §4; wire-online §4–§5, H1) ──
export const PAIR_MAX = 8 * 1024;          // a pairing frame, and `signal` (H1)
export const PLAY_MAX = 64 * 1024;         // a `play` frame (§4 rule 4)
export const RATE_PER_S = 10;              // frames a second per socket (§4 rule 4)
export const LABEL_MAX = 40;               // `label`, `deviceLabel`
export const MAX_SEATS = 6;                // `full` (§6.1's cap)
export const CODE_TTL_MS = 15 * 60 * 1000; // a code's life (wire §5 "≤ 15 min"; re-issued by `newcode`)
export const EMPTY_MS = 30 * 60 * 1000;    // the session ends when no socket has been attached this long (§5)
export const IDLE_WIPE_MS = 24 * 60 * 60 * 1000;   // storage deleted no later than 24 h after the table's last frame (§5)
export const FAILED_JOINS = 10, FAILED_WINDOW_MS = 10 * 60 * 1000;   // per source (wire §5)
export const OPENS = 20, OPENS_WINDOW_MS = 60 * 60 * 1000;           // per source (wire §5)
export const LIST_MAX = 20;

// ── the code: 6 of Crockford base32 without U (wire §5) ──
export const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';   // 31 symbols
// Input: any case; I and L read as 1, O as 0; a hyphen or a space is ignored. → the 6-char code, or null.
export function normalizeCode(input) {
  if (typeof input !== 'string') return null;
  const s = input.toUpperCase().replace(/[\s-]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0');
  if (s.length !== 6) return null;
  for (const ch of s) if (CODE_ALPHABET.indexOf(ch) === -1) return null;
  return s;
}
// randomByte: () → 0..255. Rejection sampling keeps the 31 symbols uniform.
export function newCode(randomByte) {
  let out = '';
  while (out.length < 6) {
    const b = randomByte();
    if (b < 248) out += CODE_ALPHABET[b % 31];   // 248 = 31 × 8
  }
  return out;
}

// ── the listing group (wire §5): IPv4 → the exact address; IPv6 → its /64 ──
export function groupKey(ip) {
  if (typeof ip !== 'string' || !ip) return null;
  if (ip.indexOf(':') === -1) return /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) ? 'v4:' + ip : null;
  const v4mapped = ip.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (v4mapped) return 'v4:' + v4mapped[1];
  const halves = ip.toLowerCase().split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const full = head.concat(new Array(fill).fill('0'), tail);
  if (full.length !== 8 || full.some((h) => !/^[0-9a-f]{1,4}$/.test(h))) return null;
  return 'v6:' + full.slice(0, 4).map((h) => h.replace(/^0+(?=.)/, '')).join(':') + '::/64';
}

// ── the relay rules by role (wire-online §4 rules 2–3; H1 `signal`) ──
export const PLAYER_TYPES = ['join', 'char_update', 'xp_taken', 'bye'];
export const GM_TYPES = ['table_hello', 'party', 'xp_offer', 'bye'];
export function playAllowed(role, type) {
  return (role === 'gm' ? GM_TYPES : role === 'player' ? PLAYER_TYPES : []).indexOf(type) !== -1;
}

// ── the frame fence (wire §5: strict; an unknown t, a missing field or v ≠ 1 is `bad_frame`) ──
const isStr = (x, max) => typeof x === 'string' && x.length > 0 && (max == null || x.length <= max);
const FRAMES = {
  open: (f) => isStr(f.label, LABEL_MAX) && typeof f.listed === 'boolean',
  list: () => true,
  join: (f) => (isStr(f.code, 16) || isStr(f.tableId, 128)) && isStr(f.deviceLabel, LABEL_MAX),
  admit: (f) => isStr(f.knockId, 64),
  refuse: (f) => isStr(f.knockId, 64),
  newcode: () => true,
  listing: (f) => typeof f.on === 'boolean',   // R-E6F-5 (ruling `encounters-e6-frames` ADDENDUM 2): ON THIS WI-FI, GM only
  close: () => true,
  rejoin: (f) => isStr(f.tableId, 128) && (isStr(f.gmKey, 128) || isStr(f.seatKey, 128)),
  play: (f) => !!f.msg && typeof f.msg === 'object' && !Array.isArray(f.msg) && typeof f.msg.type === 'string'
    && (f.to == null || isStr(f.to, 64)),
  // sdp, candidate, or `start: true` ("start the handshake if your limits allow"; ruling `encounters-e6-plumbing-gate`
  // D-E6P1 (b)). A signal with none of the three is bad_frame: WebRTC's null end-of-candidates must never read as a start.
  signal: (f) => (f.sdp != null || f.candidate != null || f.start === true) && (f.start == null || f.start === true)
    && (f.knockId == null || isStr(f.knockId, 64)),
};
// raw: the frame's text. → { ok: true, frame } | { ok: false, code }
export function readFrame(raw) {
  const size = typeof raw === 'string' ? utf8Length(raw) : (raw && raw.byteLength) || 0;
  if (size > PLAY_MAX) return { ok: false, code: 'bad_frame' };
  let f;
  try { f = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw)); } catch (e) { return { ok: false, code: 'bad_frame' }; }
  if (!f || typeof f !== 'object' || Array.isArray(f) || f.v !== V || typeof f.t !== 'string') return { ok: false, code: 'bad_frame' };
  const check = Object.prototype.hasOwnProperty.call(FRAMES, f.t) ? FRAMES[f.t] : null;
  if (!check || !check(f)) return { ok: false, code: 'bad_frame' };
  if (f.t !== 'play' && size > PAIR_MAX) return { ok: false, code: 'bad_frame' };
  return { ok: true, frame: f };
}
export function utf8Length(s) {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1; else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) { n += 4; i++; } else n += 3;
  }
  return n;
}

// ── the rate limit: a sliding one-second window per socket (in memory; a reset on hibernation only forgives) ──
export function rateAllows(times, now) {
  while (times.length && now - times[0] >= 1000) times.shift();
  if (times.length >= RATE_PER_S) return false;
  times.push(now);
  return true;
}
// a source counter's window: (stamps, now, windowMs, max) → { ok, stamps }
export function windowAllows(stamps, now, windowMs, max) {
  const kept = (Array.isArray(stamps) ? stamps : []).filter((t) => now - t < windowMs);
  return { ok: kept.length < max, stamps: kept };
}

// ── the alarm: the earlier of "30 min with no socket" and "24 h after the last frame" (§5) ──
// `emptyMs` is EMPTY_MS except under `wrangler dev --var TEST_EMPTY_MS:<ms>`, the session script's alarm leg (never set in
// wrangler.jsonc; test/deploy_shape.cjs F5 pins that the config carries no vars).
export function wipeAt({ emptySince, lastFrameAt }, emptyMs) {
  const a = typeof emptySince === 'number' ? emptySince + (emptyMs > 0 ? emptyMs : EMPTY_MS) : Infinity;
  const b = typeof lastFrameAt === 'number' ? lastFrameAt + IDLE_WIPE_MS : Infinity;
  const t = Math.min(a, b);
  return isFinite(t) ? t : null;
}

export function b64url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
