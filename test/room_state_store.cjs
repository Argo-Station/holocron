#!/usr/bin/env node
/**
 * room_state_store.cjs — STANDING guard for the ROOM-STATE contract
 * (lib/shared/roomState.js; HOLOTABLE slice 1, ruling `holotable-room-state-contract` R-RSC-1..4).
 *
 * Pins the durable room-state shape and, above all, THE FENCE — so a later slice cannot widen the
 * wire by editing one array and shipping:
 *   1. emptyState / normalize: versioned; garbage degrades to empty, never throws.
 *   2. THE ENUMERATION (R-HT-5 + R-RSC-3): exactly eight types, named; an unknown type THROWS
 *      rather than no-ops; the four non-mutating types are legal and change nothing.
 *   3. initiative: R-HRC-1's side-scoped slots; a NULL benchMemberId survives (the ruled third
 *      write-right claims exactly that); a bad side drops; `active` clamps into range.
 *   4. tokens keyed by BENCH MEMBER INSTANCE ID; non-finite coordinates normalize to 0, never NaN.
 *   5. members keyed by the opaque PARTICIPANT memberId; no PII beyond name+side.
 *   6. destiny: a flip moves one point; an EMPTY pool REFUSES rather than clamping at zero.
 *   7. purity: applyDelta never mutates its input.
 *   8. backend switchover: import-never-merge, adopt-whole, snapshot IS the schema.
 *
 * Run:  node test/room_state_store.cjs   (pure logic; no data files needed)
 */
const S = require('../lib/shared/roomState.js');

let failures = 0;
function check(label, cond) {
  if (cond) { console.log('  PASS  ' + label); }
  else { failures += 1; console.error('  FAIL  ' + label); }
}
function threw(fn) {
  try { fn(); return null; } catch (e) { return e; }
}

function main() {
  // ── 1. emptyState / normalize ──
  const empty = S.emptyState();
  check('emptyState is versioned and empty',
        empty.version === S.SCHEMA_VERSION && empty.roomCode === null
        && Object.keys(empty.tokens).length === 0 && empty.initiative.slots.length === 0);
  check('normalize(null) -> empty, no throw', S.normalize(null).version === S.SCHEMA_VERSION);
  check('normalize(garbage) -> empty, no throw',
        S.normalize({ tokens: 'nope', initiative: 7, members: null }).tokens
        && Object.keys(S.normalize({ tokens: 'nope' }).tokens).length === 0);
  check('normalize pins OUR version even when the blob claims another',
        S.normalize({ version: 99 }).version === S.SCHEMA_VERSION);

  // ── 2. THE FENCE (R-HT-5 as extended by R-RSC-3) ──
  check('the enumeration is exactly EIGHT types', S.EVENT_TYPES.length === 8);
  check('the eight are the ruled eight, by name',
        ['token_move', 'initiative_change', 'membership', 'destiny_change',
         'roll', 'feed_entry', 'fx_trigger', 'wound_strain_delta']
          .every(t => S.EVENT_TYPES.includes(t)));
  check('destiny_change IS enumerated (R-RSC-3, the eighth)',
        S.isKnownEventType('destiny_change'));
  const unknown = threw(() => S.applyDelta(S.emptyState(), { type: 'granted_loot' }));
  check('an UNKNOWN type is REFUSED LOUDLY — it throws, it does not no-op',
        unknown !== null && unknown.refused === 'unknown_event_type');
  const malformed = threw(() => S.applyDelta(S.emptyState(), null));
  check('a malformed delta is refused, not silently ignored',
        malformed !== null && malformed.refused === 'malformed');
  const feedOnly = S.applyDelta(S.emptyState(), { type: 'roll', pool: 'whatever' });
  check('a legal FEED-ONLY type is accepted and persists nothing',
        JSON.stringify(feedOnly) === JSON.stringify(S.emptyState()));
  const bench = S.applyDelta(S.emptyState(), { type: 'wound_strain_delta', wounds: 3 });
  check('wound_strain_delta is KNOWN but BENCH-owned — nothing lands in this store',
        JSON.stringify(bench) === JSON.stringify(S.emptyState()));

  // ── 3. initiative (R-HRC-1) ──
  const init = S.applyDelta(S.emptyState(), {
    type: 'initiative_change',
    initiative: { round: 1, active: 0, slots: [
      { side: 'pc', benchMemberId: 'm1' },
      { side: 'npc', benchMemberId: null },      // unfilled — a player may claim it
      { side: 'sideways', benchMemberId: 'm9' }, // old data — drops
    ] },
  });
  check('initiative slots are side-scoped and a bad side DROPS', init.initiative.slots.length === 2);
  check('an UNFILLED slot survives with a null id (the ruled third write-right)',
        init.initiative.slots[1].benchMemberId === null && init.initiative.slots[1].side === 'npc');
  check('round is carried', init.initiative.round === 1);
  const clamped = S.normalize({ initiative: { round: 2, active: 99, slots: [{ side: 'pc' }] } });
  check('an `active` index past the end CLAMPS into range', clamped.initiative.active === 0);
  check('an empty order has active 0, not a negative index',
        S.normalize({ initiative: { active: 5, slots: [] } }).initiative.active === 0);

  // ── 4. tokens ──
  const tok = S.applyDelta(S.emptyState(), { type: 'token_move', benchMemberId: 'bm7', x: 12.5, y: -3 });
  check('token_move writes under the BENCH MEMBER INSTANCE ID',
        tok.tokens.bm7 && tok.tokens.bm7.x === 12.5 && tok.tokens.bm7.y === -3);
  const noId = threw(() => S.applyDelta(S.emptyState(), { type: 'token_move', x: 1, y: 1 }));
  check('token_move without an id is refused', noId !== null && noId.refused === 'token_move_needs_benchMemberId');
  check('a non-finite coordinate normalizes to 0, never NaN',
        S.normalize({ tokens: { a: { x: 'over there', y: null } } }).tokens.a.x === 0);

  // ── 5. members (the OTHER id space) ──
  let st = S.applyDelta(S.emptyState(), { type: 'membership', memberId: 'p1', side: 'pc', name: 'Vex' });
  check('membership adds a participant under the opaque memberId',
        st.members.p1 && st.members.p1.side === 'pc' && st.members.p1.name === 'Vex');
  check('a member record carries ONLY name+side (no PII, no account ref)',
        Object.keys(st.members.p1).sort().join() === 'name,side');
  const badSide = threw(() => S.applyDelta(S.emptyState(), { type: 'membership', memberId: 'p2', side: 'ghost' }));
  check('membership with an invalid side is refused', badSide !== null);
  st = S.applyDelta(st, { type: 'membership', memberId: 'p1', present: false });
  check('membership with present:false removes the participant', !st.members.p1);

  // ── 6. destiny (R-V7S-2 / R-RSC-3) ──
  const pool = S.normalize({ destiny: { light: 2, dark: 1 } });
  const flipped = S.applyDelta(pool, { type: 'destiny_change', from: 'light' });
  check('a flip moves ONE point across, conserving the total',
        flipped.destiny.light === 1 && flipped.destiny.dark === 2);
  const emptyPool = threw(() => S.applyDelta(S.normalize({ destiny: { light: 0, dark: 3 } }),
                                             { type: 'destiny_change', from: 'light' }));
  check('flipping an EMPTY pool REFUSES rather than clamping at zero',
        emptyPool !== null && emptyPool.refused === 'destiny_pool_empty');
  check('destiny is SESSION scope — it lives at the top level, not on a group',
        S.emptyState().destiny && S.emptyState().groups === undefined);

  // ── 7. purity ──
  const before = S.normalize({ destiny: { light: 1, dark: 0 }, tokens: { a: { x: 1, y: 1 } } });
  const snap = JSON.stringify(before);
  S.applyDelta(before, { type: 'token_move', benchMemberId: 'a', x: 99, y: 99 });
  S.applyDelta(before, { type: 'destiny_change', from: 'light' });
  check('applyDelta NEVER mutates its input', JSON.stringify(before) === snap);

  // ── 8. backend switchover (R-V7S-1 / R-RSC-1) ──
  // The roster is SEEDED here on purpose: an earlier cut of this fixture imported a state that had
  // no members, so the "import clears the roster" assert below could not fail and the mutation pass
  // caught it as vacuous. A fixture that cannot exercise the behaviour is not a test of it.
  let solo = S.applyDelta(S.emptyState(), { type: 'token_move', benchMemberId: 'x', x: 4, y: 4 });
  solo = S.applyDelta(solo, { type: 'membership', memberId: 'stale', side: 'pc', name: 'Solo ghost' });
  const opened = S.importAsRoomOpening(solo, 'ABCD');
  check('solo -> room IMPORT keeps the board and stamps the room code',
        opened.roomCode === 'ABCD' && opened.tokens.x.x === 4);
  check('the import CLEARS a populated roster — the room rebuilds it from membership events',
        Object.keys(solo.members).length === 1 && Object.keys(opened.members).length === 0);
  const joined = S.adoptSnapshot({ roomCode: 'ZZZZ', destiny: { light: 5, dark: 0 } });
  check('joining ADOPTS the snapshot whole (no merge with local)',
        joined.roomCode === 'ZZZZ' && joined.destiny.light === 5);
  check('the join snapshot IS the schema — no separate shape to keep in step',
        JSON.stringify(S.snapshotOf(opened)) === JSON.stringify(S.normalize(opened)));

  // ── the localStorage edge ──
  const bag = {};
  const fake = { getItem: k => (k in bag ? bag[k] : null), setItem: (k, v) => { bag[k] = v; } };
  S.write(S.applyDelta(S.emptyState(), { type: 'token_move', benchMemberId: 'q', x: 8, y: 9 }), fake);
  check('write/read round-trips through the storage edge', S.read(fake).tokens.q.y === 9);
  check('read of an absent key -> empty, no throw', S.read({ getItem: () => null, setItem: () => {} }).version === S.SCHEMA_VERSION);
  check('read of corrupt JSON -> empty, no throw',
        S.read({ getItem: () => '{not json', setItem: () => {} }).version === S.SCHEMA_VERSION);

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`);
  process.exit(failures ? 1 : 0);
}
main();
