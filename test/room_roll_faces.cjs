#!/usr/bin/env node
/**
 * room_roll_faces.cjs — STANDING guard for TRANSMIT-THE-FACES, the one-entropy-site law
 * (HOLOTABLE slice 1; ruling `holotable-substrate` Stage A item 5, over R-HFC-3 + R-V7S-4).
 *
 * THE LAW. One client rolls. `diceEngine.roll()` is the SINGLE entropy site. The wire carries the
 * FACES it produced, and every client scores those faces through the pure `diceEngine.resolve()`.
 * Two tables can then never disagree about a roll, because only one of them ever consulted a
 * random number generator.
 *
 * WHY THIS GUARD EXISTS RATHER THAN A COMMENT. The two ways to break the law both look reasonable
 * in a diff — "just send the seed, it's smaller" and "just send the result, it's already computed"
 * — and both fail LATE, at a table, as two players reading different numbers off one roll. So the
 * fence is executable and the breakage is a red guard, not an argument in a session.
 *
 * THE CENTRAL ASSERT IS AN ABSENCE, WHICH IS WHY IT IS INSTRUMENTED RATHER THAN INSPECTED.
 * "The receiver must not roll" cannot be proven by reading the receiver's output — a re-rolled
 * result is a perfectly well-formed result. So leg 4 REPLACES `Math.random` with a function that
 * THROWS, then runs the whole receive-and-score path underneath it. Scoring that completes has
 * demonstrably not consulted a die. Scoring that re-rolls dies on the spot.
 *
 * Leg 6 is the BITE (PRAXIS §6: a green that has never been red is not evidence). It runs a
 * deliberately WRONG receiver — one that re-rolls locally, the exact mutant R-V7S-4 forbids — and
 * requires the tripwire to catch it. If leg 6 ever reports "the mutant survived", this guard has
 * stopped measuring anything and every other leg here is worthless.
 *
 * Run:  node test/room_roll_faces.cjs   (pure logic; no data files, no browser)
 */
const R = require('../lib/shared/roomState.js');
const D = require('../lib/shared/diceEngine.js');
const H = require('../lib/shared/holotable.js');

// R-REI-2: the id is minted at the ROLL SITE and handed to makeRollEvent, which stays RNG-free.
// Deterministic here so the asserts can name the exact string rather than pattern-match it.
let _seq = 1;
const seqRand = () => ((_seq = (_seq * 1103515245 + 12345) % 2147483648) / 2147483648);
const mintId = () => H.newEventId(seqRand);

let failures = 0;
function check(label, cond, detail) {
  if (cond) { console.log('  PASS  ' + label); }
  else {
    failures += 1;
    console.error('  FAIL  ' + label + (detail === undefined ? '' : '  — ' + JSON.stringify(detail)));
  }
}
function threw(fn) {
  try { fn(); return null; } catch (e) { return e; }
}

/** Run `fn` with Math.random replaced by a tripwire that throws. Restores in a finally, so a
 *  throwing body can never leave the process without entropy for the following legs. */
function withNoEntropy(fn) {
  const real = Math.random;
  let calls = 0;
  Math.random = function () {
    calls += 1;
    throw new Error('ENTROPY-TRIPWIRE: Math.random() called on a path that must not roll');
  };
  try {
    const value = fn();
    return { ok: true, value: value, calls: calls };
  } catch (e) {
    return { ok: false, error: e, calls: calls };
  } finally {
    Math.random = real;
  }
}

const POOL = { ability: 2, proficiency: 1, difficulty: 2, boost: 1, setback: 1, force: 1 };

function main() {
  // ── 1. the emitter: ONE roll, faces on the wire ──────────────────────────────
  const faces = D.roll(POOL);
  const ID = mintId();
  const evt = R.makeRollEvent({ faces: faces, pool: POOL, by: 'member-a', at: 1000, id: ID });
  check('1 the event is a roll carrying faces, not a score',
        evt.type === 'roll' && evt.faces && evt.resolved === undefined && evt.result === undefined);
  check('1b every die type on the wire is an ARRAY of face objects',
        Object.keys(evt.faces).every((k) => Array.isArray(evt.faces[k])));
  check('1c the wire owns its COPY — mutating the roller\'s object cannot reach it',
        (function () {
          faces.ability.push({ s: 99 });
          const still = evt.faces.ability.length;
          faces.ability.pop();
          return still === evt.faces.ability.length;
        })());

  // ── 2. the wire: a JSON round-trip, because that is what a WebSocket does ─────
  const received = JSON.parse(JSON.stringify(evt));
  check('2 faces survive a JSON round-trip byte-for-byte',
        JSON.stringify(R.facesOf(received)) === JSON.stringify(evt.faces));

  // ── 3. both sides score the SAME faces to the SAME result ────────────────────
  const emitterScore = D.resolve(evt.faces);
  const receiverScore = D.resolve(R.facesOf(received));
  check('3 emitter and receiver resolve identically (two clients, one roll)',
        JSON.stringify(emitterScore) === JSON.stringify(receiverScore),
        { emitter: emitterScore.success, receiver: receiverScore.success });

  // ── 4. THE ONE-ENTROPY-SITE ASSERT: scoring consults no die at all ───────────
  const scored = withNoEntropy(() => D.resolve(R.facesOf(received)));
  check('4 the receive-and-score path calls Math.random ZERO times',
        scored.ok === true && scored.calls === 0,
        { ok: scored.ok, calls: scored.calls, error: scored.error && scored.error.message });
  check('4b and it still produced the right answer under the tripwire',
        scored.ok && JSON.stringify(scored.value) === JSON.stringify(emitterScore));

  // ── 5. the fence REFUSES the two shapes that would break the law ─────────────
  const seedErr = threw(() => R.makeRollEvent({ faces: faces, seed: 12345, id: mintId() }));
  check('5 a SEED is refused (it is a second entropy site in a costume)',
        seedErr !== null && /seed/i.test(seedErr.message), seedErr && seedErr.message);
  const resolvedErr = threw(() => R.makeRollEvent({ faces: faces, resolved: emitterScore, id: mintId() }));
  check('5b a pre-computed SCORE is refused (every client resolves)',
        resolvedErr !== null, resolvedErr && resolvedErr.message);
  const resultErr = threw(() => R.makeRollEvent({ faces: faces, result: emitterScore, id: mintId() }));
  check('5c `result` is refused too — the fence is on the shape, not one field name',
        resultErr !== null);
  check('5d faces must be roll()\'s shape — a bare count or a single face is refused',
        threw(() => R.makeRollEvent({ faces: { ability: 2 }, id: mintId() })) !== null
        && threw(() => R.makeRollEvent({ faces: null, id: mintId() })) !== null
        && threw(() => R.makeRollEvent({ faces: [], id: mintId() })) !== null);
  check('5e facesOf degrades to null on a malformed message rather than throwing',
        R.facesOf(null) === null && R.facesOf({ type: 'roll' }) === null
        && R.facesOf({ type: 'token_move', faces: {} }) === null);

  // ── 5f-5j. EVENT IDENTITY (R-REI-1/2/3, acceptance) ─────────────────────────
  check('5f every roll event carries an opaque id', typeof evt.id === 'string' && evt.id.length > 4,
        evt.id);
  check('5g the id SURVIVES the wire round-trip unchanged', received.id === ID, received.id);
  check('5h an event with NO id is REFUSED — a roll that went out anonymous is the whole defect',
        (function () { const e = threw(() => R.makeRollEvent({ faces: faces, by: 'x', at: 1 }));
                       return e !== null && /id/i.test(e.message); })());
  check('5i a non-string / empty id is refused too (the fence is on the value, not the key)',
        threw(() => R.makeRollEvent({ faces: faces, id: '' })) !== null
        && threw(() => R.makeRollEvent({ faces: faces, id: 42 })) !== null
        && threw(() => R.makeRollEvent({ faces: faces, id: null })) !== null);
  check('5j SCHEMA_VERSION is UNCHANGED at 1 — an additive, optional, ignorable field does not '
        + 'bump the wire version (R-REI-3, the standing rule)', R.SCHEMA_VERSION === 1,
        R.SCHEMA_VERSION);
  check('5k the mint is opaque — no timestamp, no member id, nothing a reader could parse',
        /^r_[a-z0-9]{20}$/.test(evt.id) && evt.id.indexOf(String(evt.at)) === -1
        && evt.id.indexOf('member') === -1, evt.id);
  check('5l two mints differ (the id is an identity, not a constant)', mintId() !== mintId());

  // ── 6. THE BITE — the mutant R-V7S-4 forbids must be CAUGHT ──────────────────
  //
  // A receiver that ignores the wire's faces and rolls its own. This is not hypothetical: it is
  // what "just call rollAndResolve on the pool" looks like when written by someone who has not
  // read the fence. Leg 4's tripwire must fire on it. Exit code, not output: a mutant that
  // CRASHES the guard and a mutant the guard IGNORES both leave the pass-marker absent, so this
  // asserts the tripwire's own error, not merely that something went wrong.
  const mutant = withNoEntropy(() => D.rollAndResolve(received.pool));
  check('6 BITE: a receiver that re-rolls locally is caught by the tripwire',
        mutant.ok === false && /ENTROPY-TRIPWIRE/.test(mutant.error.message),
        { ok: mutant.ok, error: mutant.error && mutant.error.message });

  // And, entropy restored, the mutant is also WRONG on the merits: rolling the same pool again
  // gives different faces, which is the whole reason the law exists. Compared across enough dice
  // that an accidental match is not a flake — 7 dice, and a re-roll matching all of them is
  // vanishingly unlikely, but this asserts on the FACES, which is the thing that must not match.
  const reRolled = D.roll(received.pool);
  check('6b BITE (merits): re-rolling the same pool does NOT reproduce the wire\'s faces',
        JSON.stringify(reRolled) !== JSON.stringify(evt.faces));

  // ── 7. the tripwire itself is real — a guard's instrument needs its own proof ─
  const selfTest = withNoEntropy(() => Math.random());
  check('7 the tripwire fires on a direct Math.random() call (instrument self-test)',
        selfTest.ok === false && selfTest.calls === 1);
  check('7b and Math.random is RESTORED afterwards',
        typeof Math.random() === 'number');

  console.log('');
  if (failures) {
    console.error('room_roll_faces: ' + failures + ' FAILED');
    process.exit(1);
  }
  console.log('room_roll_faces: all checks PASS');
}

main();
