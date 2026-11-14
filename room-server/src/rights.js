/**
 * rights.js — WHO MAY EMIT WHAT (R-HT-4 as amended by R-HRC-1; R-HRC-3 for Destiny).
 *
 * Pure and separately testable ON PURPOSE. Authorization living inside the Durable Object's message
 * handler would be reachable only through a socket, and an authorization rule that can only be
 * exercised by standing up a server is an authorization rule that does not get exercised. It is
 * also kept OUT of `roomState.applyDelta`, which is a pure transform that knows nothing about who
 * called it — two rules in one function let a future caller bypass whichever one it did not reach.
 *
 * Returns a REFUSAL REASON string, or null when the write is allowed.
 *
 * THE GM IS THE `npc` SIDE, and that is an inference from the ruled shape rather than a field.
 * The roster carries `{name, side}` and nothing else; the RAW model this program adopted puts the
 * adversary side in the GM's hands (R-HRC-1's side-scoped slots; R-HRC-3's players-flip-light,
 * GM-flips-dark). So "the GM writes the rest" resolves as side === 'npc'. Written down because the
 * next reader will look for a `role` field and not find one.
 */
'use strict';

// R-HT-4's rights, stated as data so the guard can read the same list the code enforces.
const PLAYER_WRITES = ['roll', 'feed_entry', 'destiny_change', 'initiative_change', 'token_move'];

function rightsRefusal(who, msg) {
  if (!msg || typeof msg !== 'object') return 'malformed';
  who = who || { memberId: null, side: null };
  const type = msg.type;

  // An unidentified socket may only introduce itself.
  if (!who.memberId && type !== 'membership') return 'identify_first';

  // A participant may only speak for themselves in the roster.
  if (type === 'membership') {
    if (who.memberId && msg.memberId != null && String(msg.memberId) !== who.memberId) {
      return 'membership_is_self_only';
    }
    return null;
  }

  if (who.side === 'npc') return null;               // "the GM writes the rest"

  // ── what a PLAYER holds ──
  if (type === 'roll' || type === 'feed_entry') return null;   // their own rolls into the feed

  if (type === 'destiny_change') {
    // R-HRC-3: players flip LIGHT, the GM flips dark.
    return msg.from === 'light' ? null : 'players_flip_light_only';
  }

  // R-HRC-1's THIRD write — claim an UNFILLED slot belonging to their OWN side. A player may CLAIM,
  // never REWRITE, so the delta is admitted only when it differs from the current order in exactly
  // one slot, that slot was unfilled, it belongs to the player's side, and it is being filled.
  if (type === 'initiative_change') return initiativeClaimRefusal(who, msg);

  // R-HT-4 gives a player "their own token's position". THE CONTRACT HAS NO OWNERSHIP EDGE between
  // a participant (`members`, keyed by the opaque memberId) and a token (`tokens`, keyed by a BENCH
  // MEMBER INSTANCE id) — different id spaces, no mapping. "Their own" is therefore unanswerable,
  // and both wrong answers are worse than refusing: letting any player move any token breaks the
  // right in one direction, pretending the right does not exist breaks it in the other.
  // REFUSED LOUDLY AND SPECIFICALLY so the gap shows up in logs and at the gate rather than being
  // discovered by a player dragging someone else's token across the table.
  if (type === 'token_move') return 'token_ownership_unmapped';

  return 'gm_only';
}

// `current` is the room's initiative BEFORE the delta; `proposed` is what the player sent.
function initiativeClaimRefusal(who, msg) {
  const proposed = msg.initiative;
  const current = msg.__current;   // supplied by the caller, which holds the room state
  if (!proposed || !Array.isArray(proposed.slots)) return 'initiative_needs_slots';
  if (!current || !Array.isArray(current.slots)) return 'initiative_no_current_order';
  if (proposed.slots.length !== current.slots.length) return 'players_may_claim_not_reorder';
  if (Number(proposed.round) !== Number(current.round)) return 'players_may_not_change_round';

  let changed = -1;
  for (let i = 0; i < current.slots.length; i += 1) {
    const a = current.slots[i], b = proposed.slots[i];
    if (a.side !== b.side) return 'players_may_not_change_sides';
    if (a.benchMemberId !== b.benchMemberId) {
      if (changed !== -1) return 'players_may_claim_one_slot_at_a_time';
      changed = i;
    }
  }
  if (changed === -1) return 'initiative_claim_changed_nothing';

  const was = current.slots[changed];
  // NOTE ON A BRANCH THAT IS NOT HERE: there is no separate "a player may not EMPTY a slot" refusal,
  // because it cannot be reached. Emptying a FILLED slot means the slot was filled, which
  // `slot_already_filled` catches on the line above; emptying an already-empty slot changes nothing
  // and is caught by `initiative_claim_changed_nothing`. A branch was written for it, the guard
  // proved it unreachable, and it was deleted rather than left as reassuring dead code in an
  // authorization function.
  if (was.benchMemberId !== null) return 'slot_already_filled';
  if (was.side !== who.side) return 'slot_belongs_to_the_other_side';
  return null;
}

module.exports = { rightsRefusal, initiativeClaimRefusal, PLAYER_WRITES };
