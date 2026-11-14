/**
 * recency.js — "which of these two records is newer?", answered in ONE place, or honestly refused.
 * C-B-8.3 (ruling `f34-phase-b-foundations`), resting on Docs/SYNC_RECENCY_AUDIT.md.
 *
 * THE RULE, and it is a refusal as much as a comparison:
 *
 *     A per-record winner is computed ONLY when BOTH sides carry an ms-epoch stamp.
 *     A day-string, a missing stamp, or a tie routes that record to the adoption prompt.
 *     NEVER array order. NEVER assume-local-is-newer. NEVER stamp-at-merge-time.
 *
 * WHY A WHOLE MODULE FOR ONE COMPARISON. The audit asked whether "newest wins per record" is even
 * computable across the seven synced lists and found it true for ONE of them. The tempting response
 * to that — and the reason this file exists — is a heuristic: fall back to array position, or treat
 * the device you are standing on as authoritative, or stamp both sides at merge time so at least
 * something can be compared. Every one of those SILENTLY picks a winner it has no evidence for, and
 * the thing it discards is somebody's character. `null` is the correct answer far more often than a
 * merge would like, and this module's job is to keep returning it.
 *
 * The three stamp shapes actually in the wild (all of them legitimate, none of them going away):
 *   · ms epoch  — `updatedAt: 1786036920326`. Comparable. The only comparable one.
 *   · day string — `updatedAt: '2026-08-06'`. Vessels wrote these until C-B-8.2; they are still in
 *     people's browsers. Two edits to one ship on one day are indistinguishable, so they are never
 *     compared — a same-day tie has no honest winner.
 *   · absent — benches, shelves, holds, overrides carry no stamp at all, and the roster's
 *     pre-`updatedAt` records do not either.
 *
 * Pure; no storage, no DOM. Dual-export (browser `window.SWRPGRecency` / CommonJS) so
 * test/recency.cjs exercises it in Node.
 */
(function (root) {
  'use strict';

  // 2001-09-09. Any ms epoch the product could plausibly have written is far above this; a
  // day-string coerces to NaN and a small integer (a version, a count, a 0) falls below it. The
  // point is not precision — it is refusing to treat a number that cannot be a timestamp as one.
  var MS_FLOOR = 1000000000000;

  function isMsStamp(v) {
    return typeof v === 'number' && isFinite(v) && v >= MS_FLOOR;
  }

  /**
   * newerOf(a, b) → 'a' | 'b' | null
   *   'a' / 'b' — that side is strictly newer and both stamps were comparable.
   *   null      — NOT COMPARABLE, or an exact tie. The caller must route this record to the
   *               prompt. It must not guess, and it must not treat null as "keep local".
   */
  function newerOf(aStamp, bStamp) {
    if (!isMsStamp(aStamp) || !isMsStamp(bStamp)) return null;
    if (aStamp === bStamp) return null;      // a tie is a real conflict, not a coin toss
    return aStamp > bStamp ? 'a' : 'b';
  }

  // The stamp field, read defensively. Named here so the merge cannot start reaching for
  // `lastOpenedAt` — which the roster UI sorts by and which is set only when a sheet is OPENED, not
  // when it changes. Using it as recency would rank "looked at" above "edited".
  function stampOf(record) {
    return record && typeof record === 'object' ? record.updatedAt : undefined;
  }

  var API = { isMsStamp: isMsStamp, newerOf: newerOf, stampOf: stampOf, MS_FLOOR: MS_FLOOR };

  if (typeof window !== 'undefined') root.SWRPGRecency = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : this);
