#!/usr/bin/env node
/**
 * room_rights.cjs — STANDING guard for WHO MAY EMIT WHAT in a HOLOTABLE room
 * (room-server/src/rights.js; R-HT-4 as amended by R-HRC-1, R-HRC-3 for Destiny).
 *
 * This is the AUTHORIZATION surface. It is guarded separately from the state transform because the
 * two answer different questions, and because a rule that can only be exercised through a live
 * websocket is a rule that does not get exercised.
 *
 * Pins:
 *   1. an unidentified socket may ONLY introduce itself;
 *   2. the GM (the `npc` side) writes the rest;
 *   3. a player's writes are exactly: own rolls/feed, a LIGHT destiny flip, and a single claim of an
 *      UNFILLED slot on their OWN side — everything else refuses BY NAME;
 *   4. `token_move` refuses `token_ownership_unmapped` — the ruled write-right the contract has no
 *      edge to enforce. This assert is the gap's tripwire: when the edge lands, this test must be
 *      re-pointed BY A RULING, not quietly deleted.
 *
 * Run:  node test/room_rights.cjs
 */
const R = require('../room-server/src/rights.js');

let failures = 0;
function check(label, cond) {
  if (cond) { console.log('  PASS  ' + label); }
  else { failures += 1; console.error('  FAIL  ' + label); }
}

const GM = { memberId: 'gm1', side: 'npc' };
const PC = { memberId: 'p1', side: 'pc' };
const ANON = { memberId: null, side: null };

// A two-slot order: one PC slot unfilled, one NPC slot filled.
const order = () => ({ round: 1, active: 0, slots: [
  { side: 'pc', benchMemberId: null },
  { side: 'npc', benchMemberId: 'bm-thug' },
] });
// Build an initiative_change delta from a mutation of the current order.
function claim(mutate) {
  const cur = order();
  const prop = JSON.parse(JSON.stringify(cur));
  mutate(prop);
  return { type: 'initiative_change', initiative: prop, __current: cur };
}

function main() {
  // ── 1. identity gate ──
  check('an unidentified socket may NOT move a token', R.rightsRefusal(ANON, { type: 'token_move' }) === 'identify_first');
  check('an unidentified socket may NOT roll', R.rightsRefusal(ANON, { type: 'roll' }) === 'identify_first');
  check('an unidentified socket MAY introduce itself', R.rightsRefusal(ANON, { type: 'membership', memberId: 'new', side: 'pc' }) === null);
  check('a malformed message is refused', R.rightsRefusal(PC, null) === 'malformed');

  // ── 2. the GM writes the rest ──
  check('GM may move any token', R.rightsRefusal(GM, { type: 'token_move', benchMemberId: 'x' }) === null);
  check('GM may rewrite initiative wholesale', R.rightsRefusal(GM, claim(p => { p.slots.reverse(); })) === null);
  check('GM may flip DARK destiny', R.rightsRefusal(GM, { type: 'destiny_change', from: 'dark' }) === null);
  check('GM may trigger FX', R.rightsRefusal(GM, { type: 'fx_trigger' }) === null);

  // ── 3. a player's writes ──
  check('player may roll', R.rightsRefusal(PC, { type: 'roll' }) === null);
  check('player may write a feed entry', R.rightsRefusal(PC, { type: 'feed_entry' }) === null);
  check('player may flip LIGHT destiny (R-HRC-3)', R.rightsRefusal(PC, { type: 'destiny_change', from: 'light' }) === null);
  check('player may NOT flip dark — that is the GM\'s', R.rightsRefusal(PC, { type: 'destiny_change', from: 'dark' }) === 'players_flip_light_only');
  check('player may NOT trigger FX', R.rightsRefusal(PC, { type: 'fx_trigger' }) === 'gm_only');
  check('player may only speak for themselves in the roster',
        R.rightsRefusal(PC, { type: 'membership', memberId: 'someone_else', side: 'pc' }) === 'membership_is_self_only');
  check('player may update their OWN roster entry',
        R.rightsRefusal(PC, { type: 'membership', memberId: 'p1', side: 'pc' }) === null);

  // ── 4. THE NAMED GAP (tripwire — re-point by ruling, never delete) ──
  check('player token_move refuses BY NAME: no participant->token ownership edge exists',
        R.rightsRefusal(PC, { type: 'token_move', benchMemberId: 'bm-anything' }) === 'token_ownership_unmapped');

  // ── 5. the initiative CLAIM (R-HRC-1's third write) ──
  check('a player MAY claim the unfilled slot on their OWN side',
        R.rightsRefusal(PC, claim(p => { p.slots[0].benchMemberId = 'bm-mine'; })) === null);
  check('a player may NOT claim a slot on the OTHER side',
        R.rightsRefusal(PC, claim(p => { p.slots[1].benchMemberId = 'bm-mine'; })) === 'slot_already_filled');
  const otherSideUnfilled = (() => {
    const cur = { round: 1, active: 0, slots: [{ side: 'npc', benchMemberId: null }] };
    const prop = JSON.parse(JSON.stringify(cur));
    prop.slots[0].benchMemberId = 'bm-mine';
    return { type: 'initiative_change', initiative: prop, __current: cur };
  })();
  check('a player may NOT claim an UNFILLED slot belonging to the other side',
        R.rightsRefusal(PC, otherSideUnfilled) === 'slot_belongs_to_the_other_side');
  check('a player may NOT claim two slots at once',
        R.rightsRefusal(PC, claim(p => { p.slots[0].benchMemberId = 'a'; p.slots[1].benchMemberId = 'b'; })) === 'players_may_claim_one_slot_at_a_time');
  // Emptying a filled slot is refused as an ALREADY-FILLED slot, which is the same wall by a more
  // accurate name — see the note in rights.js about the branch that was deleted for being dead.
  check('a player may NOT empty a filled slot',
        R.rightsRefusal(PC, claim(p => { p.slots[1].benchMemberId = null; })) === 'slot_already_filled');
  check('a player may NOT reorder (length change)',
        R.rightsRefusal(PC, claim(p => { p.slots.push({ side: 'pc', benchMemberId: null }); })) === 'players_may_claim_not_reorder');
  check('a player may NOT change a slot\'s side',
        R.rightsRefusal(PC, claim(p => { p.slots[0].side = 'npc'; })) === 'players_may_not_change_sides');
  check('a player may NOT advance the round',
        R.rightsRefusal(PC, claim(p => { p.round = 2; })) === 'players_may_not_change_round');
  check('a no-op initiative change is refused rather than broadcast',
        R.rightsRefusal(PC, claim(() => {})) === 'initiative_claim_changed_nothing');
  check('an initiative delta with no slots is refused',
        R.rightsRefusal(PC, { type: 'initiative_change', initiative: {}, __current: order() }) === 'initiative_needs_slots');
  check('a claim with no current order to claim against is refused',
        R.rightsRefusal(PC, { type: 'initiative_change', initiative: order() }) === 'initiative_no_current_order');

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`);
  process.exit(failures ? 1 : 0);
}
main();
