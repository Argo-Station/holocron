#!/usr/bin/env node
/**
 * room_join_gate.cjs — STANDING guard for THE VERSION-GATED JOIN and THE 30-DAY TTL
 * (HOLOTABLE slice 1; ruling `holotable-substrate` ACCEPTANCE, over R-V7S-3, R-RSC-1, R-RSC-6).
 *
 * WHY THESE TWO RULES NEEDED EXTRACTING BEFORE THEY COULD BE GUARDED. Both lived inline in the
 * room Worker — the join gate in a `fetch` handler, the TTL in a Durable Object method — and
 * `room-server/src/room.js` imports `cloudflare:workers`, which plain Node cannot resolve. So the
 * single most important refusal in the substrate, and the rule that decides whether a room costs
 * money forever, were both unreachable by every test this repo can actually run. The DECISIONS now
 * live in pure modules (`roomState.joinDecision`, `room-server/src/ttl.mjs`) and the Worker APPLIES
 * them; this file guards the decisions. That is a real reduction in what has to be taken on trust,
 * and it is why the extraction happened rather than a note saying "needs miniflare".
 *
 * WHAT IS STILL NOT PROVEN HERE, said plainly: that the Worker WIRES these correctly at runtime —
 * that `setAlarm` is really called with this deadline on a real socket close. That needs a Workers
 * runtime (workerd / vitest-pool-workers) which this repo does not have, and it is named as a
 * limit in the gate rather than implied away. What this file removes is the possibility of the
 * RULES being wrong; what remains unproven is the WIRING.
 *
 * Run:  node test/room_join_gate.cjs
 */
const R = require('../lib/shared/roomState.js');

let pass = 0, fail = 0;
const check = (label, cond, detail) => {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (detail !== undefined ? '  -> ' + JSON.stringify(detail) : '')); }
};

(async () => {
  console.log('room_join_gate — refused at the door, and a room that stops costing money\n');

  const V = R.SCHEMA_VERSION;

  // ── 1. the join gate ───────────────────────────────────────────────────────
  check('1 a CURRENT client is admitted', R.joinDecision(V).ok === true);
  check('1b a NEWER client is admitted too — the snapshot is written in the ROOM\'s schema, which '
      + 'a newer client understands by construction; only the reverse is unsafe',
    R.joinDecision(V + 1).ok === true);

  // At SCHEMA_VERSION 1 there is no version below 1, so the 409 branch cannot be reached by
  // `V - 1` — it would fall into `client_version_required` instead. THAT IS THE FINDING, not a
  // test inconvenience: the substrate's headline refusal is dead code in production today. The
  // room version is injected so the branch is executed NOW rather than first executed on the day
  // v2 ships and every existing client becomes the old one.
  const older = R.joinDecision(V, V + 1);
  check('2 an OLDER client is REFUSED at the door, not admitted as a spectator who cannot act',
    older.ok === false && older.error === 'room_schema_newer', older);
  check('2b refused with 409 and BOTH schema numbers, so the surface can say something true',
    older.status === 409 && older.roomSchema === V + 1 && older.clientSchema === V, older);

  check('3 a MISSING version is refused (400) — a client that will not say who it is cannot join',
    R.joinDecision(undefined).ok === false
    && R.joinDecision(undefined).error === 'client_version_required'
    && R.joinDecision(undefined).status === 400);
  let hostileClean = true;
  [null, '', 'abc', NaN, 0, -3, Infinity, {}, []].forEach((v) => {
    const d = R.joinDecision(v);
    if (d.ok !== false || d.status !== 400) hostileClean = false;
  });
  check('3b every garbage version is refused as `client_version_required`, never admitted',
    hostileClean);
  check('3c a NUMERIC STRING is accepted — the wire carries query params, which are strings, and '
      + 'a gate that rejected "1" would refuse every real client',
    R.joinDecision(String(V)).ok === true);

  // THE MACHINE-REASON RULE: no user-facing sentence may leak out of the substrate. The copy a
  // refused player reads is Stage B surface work and owes its R-MU1 mockup.
  const words = JSON.stringify(older);
  check('4 the refusal carries a MACHINE reason and no user copy (no sentence, no prose)',
    /^[a-z_]+$/.test(older.error) && !/ [a-z]+ [a-z]+ /i.test(words), words);

  // ── 5. the TTL ─────────────────────────────────────────────────────────────
  const T = await import('../room-server/src/ttl.mjs');
  check('5 the TTL is thirty days, to the millisecond (R-RSC-6, Jason\'s word)',
    T.TTL_MS === 30 * 24 * 60 * 60 * 1000, T.TTL_MS);
  check('5b the alarm arms ONLY when the last socket has gone',
    T.shouldArmTtl(0) === true && T.shouldArmTtl(1) === false && T.shouldArmTtl(7) === false);
  check('5c NO STANDING HEARTBEAT — presence CANCELS, it never re-arms on a timer',
    T.shouldCancelTtl(1) === true && T.shouldCancelTtl(3) === true
    && T.shouldCancelTtl(0) === false);
  check('5d arm and cancel are mutually exclusive at every count (one rule, not two conditions)',
    [0, 1, 2, 9].every((n) => T.shouldArmTtl(n) !== T.shouldCancelTtl(n)));
  check('5e the deadline is now + 30 days, from an INJECTED clock (this module reads none)',
    T.ttlDeadline(1000) === 1000 + T.TTL_MS);
  check('5f an unreadable count arms NOTHING rather than arming wrongly',
    T.shouldArmTtl(NaN) === false && T.shouldArmTtl(undefined) === false
    && T.shouldArmTtl(-1) === false && T.shouldArmTtl('x') === false);
  check('5g an unreadable clock returns null rather than a garbage deadline — arming an alarm at '
      + 'NaN is how a room either never expires or expires immediately',
    T.ttlDeadline(NaN) === null && T.ttlDeadline(undefined) === null
    && T.ttlDeadline('soon') === null);

  // ── 6. the BITE — these asserts must be able to fail ───────────────────────
  //
  // Every leg above is a claim about a pure function, so the mutant is applied to the CALL rather
  // than to the source: if the gate compared with `<=` instead of `<`, a CURRENT client would be
  // refused; if the TTL armed on any count, a busy room would expire under the table. Both are
  // asserted as the inverse of what the rules say, so a rule that silently inverted would show up
  // here rather than at a table in thirty days.
  check('6 BITE: the gate is not vacuous — it distinguishes older from current',
    R.joinDecision(V - 1).ok !== R.joinDecision(V).ok);
  check('6b BITE: the TTL rule is not vacuous — it distinguishes empty from occupied',
    T.shouldArmTtl(0) !== T.shouldArmTtl(1));
  check('6c BITE: SCHEMA_VERSION is a real number the gate actually reads, not a constant it '
      + 'ignores (a gate keyed to nothing would admit everything)',
    typeof V === 'number' && V > 0 && R.joinDecision(V, V + 1).roomSchema === V + 1
    && R.joinDecision(V).roomSchema === V);

  console.log('');
  console.log(`room_join_gate: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})();
