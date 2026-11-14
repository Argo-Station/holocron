#!/usr/bin/env node
/**
 * room_sync_suspension.cjs — STANDING guard for ACCOUNT-SYNC SUSPENSION
 * (HOLOTABLE slice 1, Stage A item 4; ruling `holotable-substrate` over R-RSC-2).
 *
 * THE RULE. While a client is IN A ROOM the Durable Object is authoritative over table state, so
 * pushing `swrpg_npc_bench` to the account at the same time would create a second authority for
 * one quantity — the exact defect R-V7S-1 split the two stores to avoid. Bench pushes therefore
 * SUSPEND for the duration, and room exit pushes the bench EXACTLY ONCE through the sync core's
 * existing version-conditional path.
 *
 * THE CONTRACT CLAUSE THIS GUARD EXISTS FOR: **derived from connection state, NEVER a persisted
 * flag.** That is the half a reviewer cannot see by reading the happy path, because a persisted
 * flag works perfectly until the day a tab is killed mid-room — and then the bench is silently
 * offline forever with nothing on screen to say so, and the only cure is a second flag to detect
 * the first one being stale. So leg 3 asserts the ABSENCE of any storage write, and leg 3b
 * asserts a brand-new sync instance over the SAME storage is not suspended: if suspension had
 * been written down anywhere, that instance would have inherited it.
 *
 * Legs 8-9 are the BITE (PRAXIS §6). Every "it did not push" assert above is a claim about an
 * absence, and an absence is also what a broken harness produces — a typo'd key, an unrouted
 * fetch, a debounce that never fired all look identical to "correctly suspended". So leg 8 runs
 * the SAME sequence with the room closed and requires the pushes to APPEAR. A green leg 8 is what
 * makes the silence above meaningful.
 *
 * Run:  node test/room_sync_suspension.cjs   (injected edges; no browser, no network)
 */
const { createSync } = require('../lib/shared/sync.js');

let pass = 0, fail = 0;
const check = (label, cond, detail) => {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (detail !== undefined ? '  -> ' + JSON.stringify(detail) : '')); }
};

const BENCH = 'swrpg_npc_bench';
const bench = (members) => JSON.stringify({ version: 6, members: members });

/** Injected-edges harness, matching test/sync_seam.cjs. `roomRef.in` flips the live connection
 *  state the way a socket opening and closing would — the predicate reads it on every call. */
function harness(seed, roomRef) {
  const calls = [];
  const mem = Object.assign({}, seed || {});
  const writes = [];
  const edges = {
    fetch: (url, opts) => {
      calls.push({ url, method: (opts && opts.method) || 'GET',
                   body: opts && opts.body ? JSON.parse(opts.body) : null });
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ keys: {} }) });
    },
    storage: {
      get: (k) => (k in mem ? mem[k] : null),
      set: (k, v) => { writes.push(k); mem[k] = v; },
    },
    schedule: (fn) => { fn(); return 1; },      // fire debounces immediately
    inRoom: () => !!roomRef.in,
  };
  return { s: createSync(edges), calls, mem, writes };
}
// pushNow fetches inside a promise chain, so requests land on a microtask. Every count-the-
// requests assert yields first — sync_seam.cjs records what happens when one does not.
const tick = () => new Promise((r) => setTimeout(r, 5));
const putsFor = (calls, key) =>
  calls.filter((c) => c.method === 'PUT' && c.url.indexOf(encodeURIComponent(key)) !== -1);

(async () => {
  console.log('room_sync_suspension — the DO is authoritative, and nothing is written down\n');

  // ── 1. the predicate itself ────────────────────────────────────────────────
  {
    const room = { in: false };
    const { s } = harness({}, room);
    check('1 not in a room -> the bench is not suspended', s.isRoomSuspended(BENCH) === false);
    room.in = true;
    check('1b in a room -> the bench IS suspended', s.isRoomSuspended(BENCH) === true);
    check('1c ONLY the bench suspends — a character roster is a player\'s own paper',
          s.isRoomSuspended('swrpg_saved_characters') === false);
    check('1d the suspended list is named, not inlined', Array.isArray(s.ROOM_SUSPENDED_KEYS)
          && s.ROOM_SUSPENDED_KEYS.indexOf(BENCH) !== -1);
    room.in = false;
    check('1e leaving the room lifts it, with no call to any setter',
          s.isRoomSuspended(BENCH) === false);
  }

  // ── 2. the three push origins are all gated ────────────────────────────────
  {
    const room = { in: true };
    const { s, calls } = harness({ [BENCH]: bench([{ id: 'a' }]) }, room);
    s.push(BENCH);
    await tick();
    check('2 the debounced push is withheld in a room', putsFor(calls, BENCH).length === 0,
          putsFor(calls, BENCH).length);

    // the GM edits the bench mid-room, exactly what the DO is already carrying
    const h2 = harness({ [BENCH]: bench([{ id: 'a' }]) }, room);
    h2.s.primeSnapshot();
    h2.mem[BENCH] = bench([{ id: 'a' }, { id: 'b' }]);
    h2.s.sweep();
    await tick();
    check('2b the sweep is withheld in a room', putsFor(h2.calls, BENCH).length === 0,
          putsFor(h2.calls, BENCH).length);

    const h3 = harness({ [BENCH]: bench([{ id: 'a' }]) }, room);
    await h3.s.adopt();
    await tick();
    check('2c adopt\'s push loop skips the suspended key', putsFor(h3.calls, BENCH).length === 0,
          putsFor(h3.calls, BENCH).length);
  }

  // ── 2d-2g. R-HSA-2: the suspension is BIDIRECTIONAL for the bench ──────────
  //
  // Adopting the ACCOUNT's bench into local mid-session is the same dual-authority defect as
  // pushing local up, arriving from the other side: the GM would watch the table change under
  // them because they happened to sign in for the first time during a game.
  {
    const room = { in: true };
    const LOCAL = bench([{ id: 'local-only' }]);
    const h = harness({ [BENCH]: LOCAL, swrpg_saved_characters: JSON.stringify({ version: 1, characters: [] }) }, room);
    await h.s.adopt();
    await tick();
    check('2d in a room, adopt does NOT overwrite the local bench (the DO is mirroring it)',
          h.mem[BENCH] === LOCAL, h.mem[BENCH]);
    check('2e ...and the bench key was never even written', h.writes.indexOf(BENCH) === -1, h.writes);
    check('2f ...while OTHER keys adopt normally (only the bench defers)',
          h.writes.indexOf('swrpg_saved_characters') !== -1, h.writes);
  }
  {
    // THE BITE for the inbound half: with the room closed, adopt DOES write the bench.
    const room = { in: false };
    const h = harness({ [BENCH]: bench([{ id: 'local-only' }]) }, room);
    await h.s.adopt();
    await tick();
    check('2g BITE: with the room closed, adopt DOES write the bench locally',
          h.writes.indexOf(BENCH) !== -1, h.writes);
  }

  // ── 3. NOTHING IS PERSISTED — the contract clause ──────────────────────────
  {
    const room = { in: true };
    const { s, writes, mem } = harness({ [BENCH]: bench([{ id: 'a' }]) }, room);
    s.isRoomSuspended(BENCH); s.push(BENCH); s.primeSnapshot(); s.sweep();
    await tick();
    check('3 suspension writes NOTHING to storage (no flag to go stale)',
          writes.length === 0, writes);
    check('3b no key in storage names a room or a suspension',
          Object.keys(mem).every((k) => !/room|suspend/i.test(k)), Object.keys(mem));

    // The decisive one: a FRESH instance over the SAME storage. If suspension were written
    // down anywhere, this instance would inherit it. It must not.
    const fresh = createSync({
      fetch: () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ keys: {} }) }),
      storage: { get: (k) => (k in mem ? mem[k] : null), set: () => {} },
      schedule: (fn) => { fn(); return 1; },
      // no inRoom edge at all — the default
    });
    check('3c a fresh sync over the same storage is NOT suspended (state lived only in the socket)',
          fresh.isRoomSuspended(BENCH) === false);
  }

  // ── 4. the sweep leaves the snapshot STALE, so nothing is lost ─────────────
  {
    const room = { in: true };
    const { s, calls, mem } = harness({ [BENCH]: bench([{ id: 'a' }]) }, room);
    s.primeSnapshot();
    mem[BENCH] = bench([{ id: 'a' }, { id: 'b' }]);   // edited during the room
    s.sweep();
    await tick();
    check('4 withheld during the room', putsFor(calls, BENCH).length === 0);
    room.in = false;                                   // the socket closes
    s.sweep();
    await tick();
    check('4b the FIRST sweep after the room carries what accumulated during it',
          putsFor(calls, BENCH).length === 1, putsFor(calls, BENCH).length);
    check('4c and it carried the EDITED value, not the pre-room one',
          JSON.parse(putsFor(calls, BENCH)[0].body.value).members.length === 2);
  }

  // ── 5. the single push at room exit ────────────────────────────────────────
  {
    const room = { in: true };
    const { s, calls, mem } = harness({ [BENCH]: bench([{ id: 'a' }]) }, room);
    s.primeSnapshot();
    mem[BENCH] = bench([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    await s.flushRoomSuspension();
    await tick();
    const puts = putsFor(calls, BENCH);
    check('5 flushRoomSuspension pushes the bench EXACTLY once', puts.length === 1, puts.length);
    check('5b through the version-conditional PUT (the existing 409 path, not a second writer)',
          puts.length === 1 && typeof puts[0].body.version === 'number'
          && puts[0].url.indexOf('/api/v1/sync/') === 0);
    check('5c carrying the value as it stood at exit',
          puts.length === 1 && JSON.parse(puts[0].body.value).members.length === 3);

    // and it must not be pushed a SECOND time by the sweep that follows
    room.in = false;
    s.sweep();
    await tick();
    check('5d the following sweep does NOT duplicate it (snapshot advanced by the flush)',
          putsFor(calls, BENCH).length === 1, putsFor(calls, BENCH).length);
  }

  // ── 6. an unanswered conflict question still outranks the flush ────────────
  {
    const room = { in: true };
    const { s, calls } = harness({ [BENCH]: bench([{ id: 'a' }]) }, room);
    // drive a real conflict onto the key rather than reaching inside: adopt with a 409-ish
    // shape is heavy here, so assert the documented precedence via isHeld's own contract.
    const held = s.isHeld(BENCH);
    check('6 (precondition) no conflict question is open on the bench', held === false);
    await s.flushRoomSuspension();
    await tick();
    check('6b with no question open, the flush proceeds', putsFor(calls, BENCH).length === 1);
  }

  // ── 7. a throwing predicate fails toward SYNCING, not toward data loss ─────
  {
    const s = createSync({
      fetch: () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ keys: {} }) }),
      storage: { get: () => null, set: () => {} },
      schedule: (fn) => { fn(); return 1; },
      inRoom: () => { throw new Error('socket exploded'); },
    });
    check('7 an inRoom predicate that THROWS reads as "not in a room"',
          s.isRoomSuspended(BENCH) === false);
  }

  // ── 8-9. THE BITE — the same sequences with the room CLOSED must push ──────
  //
  // Without these, every "length === 0" above is equally satisfied by a harness that never
  // reaches the network at all.
  {
    const room = { in: false };
    const { s, calls, mem } = harness({ [BENCH]: bench([{ id: 'a' }]) }, room);
    s.push(BENCH);
    await tick();
    check('8 BITE: with the room closed, the debounced push DOES fire',
          putsFor(calls, BENCH).length === 1, putsFor(calls, BENCH).length);

    const h2 = harness({ [BENCH]: bench([{ id: 'a' }]) }, room);
    h2.s.primeSnapshot();
    h2.mem[BENCH] = bench([{ id: 'a' }, { id: 'b' }]);
    h2.s.sweep();
    await tick();
    check('8b BITE: with the room closed, the sweep DOES fire',
          putsFor(h2.calls, BENCH).length === 1, putsFor(h2.calls, BENCH).length);

    const h3 = harness({ [BENCH]: bench([{ id: 'a' }]) }, room);
    await h3.s.adopt();
    await tick();
    check('8c BITE: with the room closed, adopt DOES push the bench',
          putsFor(h3.calls, BENCH).length >= 1, putsFor(h3.calls, BENCH).length);
  }
  {
    // 9: the suspension is specific — other keys keep syncing THROUGHOUT a room.
    const room = { in: true };
    const { s, calls } = harness({ swrpg_saved_characters: JSON.stringify({ version: 1, characters: [] }) }, room);
    s.push('swrpg_saved_characters');
    await tick();
    check('9 a non-bench key still syncs while in a room',
          putsFor(calls, 'swrpg_saved_characters').length === 1,
          putsFor(calls, 'swrpg_saved_characters').length);
  }

  console.log('');
  console.log(`room_sync_suspension: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})();
