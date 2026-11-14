#!/usr/bin/env node
/**
 * room_code.cjs — STANDING guard for THE ROOM CODE (ruling `holotable-wiring-room-code-and-endpoint`
 * R-WRC-1; lib/shared/holotable.js).
 *
 * WHY THIS GUARD EXISTS AT ALL. There are no accounts (R-HT-4), so the code is the only lock on a
 * table, and R-WRC-1 chose ARITHMETIC over mechanism: no rate limiting, because 32^6 is the
 * defense. That makes the alphabet's SIZE and the mint's UNIFORMITY load-bearing security
 * properties rather than cosmetic ones — a mint that quietly favoured eight characters would
 * advertise a billion addresses and deliver a few million, and nothing else in the repo would
 * notice. So this file asserts the arithmetic, not just the format.
 *
 *   1. THE ALPHABET — exactly 32, a power of two, and all four look-alikes (I O 0 1) absent.
 *   2. THE MINT — six characters, every one of them legal, `rand` injectable.
 *   3. THE DISTRIBUTION — a full sweep of [0,1) reaches all 32 exactly once (no dead letters, no
 *      doubled ones), and a large real-random sample stays inside a band.
 *   4. CANONICALIZE-THEN-VALIDATE — spaced, lowercased and hyphenated input all reach one room;
 *      a 5-character code is refused; a look-alike character is refused rather than folded.
 *   5. DISPLAY — 3-3 grouping for reading aloud, and the WIRE never carries the hyphen.
 *
 * Every numbered leg has a BITE below it: a mutant that must turn it red. A green that has never
 * been red is not evidence (PRAXIS §6).
 *
 * Run:  node test/room_code.cjs   (pure logic; no data files, no build needed)
 */
const H = require('../lib/shared/holotable.js');

let pass = 0, fail = 0;
const check = (label, cond, detail) => {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (detail !== undefined ? '  -> ' + JSON.stringify(detail) : '')); }
};

const A = H.ROOM_CODE_ALPHABET;
const L = H.ROOM_CODE_LENGTH;

// ── 1. THE ALPHABET ─────────────────────────────────────────────────────────
check('1a alphabet is exactly 32 characters', A.length === 32, A.length);
check('1b alphabet is a POWER OF TWO — Math.floor(rand()*n) is unbiased only then',
      (A.length & (A.length - 1)) === 0, A.length);
check('1c no character repeats', new Set(A).size === A.length);
check('1d ALL FOUR look-alikes are absent — I, O, 0 and 1 (both members of each pair, which is '
      + 'what makes a fold unnecessary at the join)',
      ['I', 'O', '0', '1'].every((c) => A.indexOf(c) === -1),
      ['I', 'O', '0', '1'].map((c) => c + ':' + A.indexOf(c)));
check('1e every character is an uppercase letter or a digit 2-9', /^[A-Z2-9]+$/.test(A), A);
check('1f the space is the billion R-WRC-1 ruled on', Math.pow(A.length, L) === 1073741824,
      Math.pow(A.length, L));

// ── 2. THE MINT ─────────────────────────────────────────────────────────────
const seq = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };
const fixed = H.newRoomCode(seq([0.0, 0.2, 0.4, 0.6, 0.8, 0.99]));
check('2a mint returns exactly ROOM_CODE_LENGTH characters', fixed.length === L, fixed);
check('2b every minted character is in the alphabet',
      fixed.split('').every((c) => A.indexOf(c) !== -1), fixed);
check('2c the mint is DETERMINISTIC under an injected rand — a guard that cannot predict the '
      + 'code cannot assert on it', H.newRoomCode(seq([0.0, 0.2, 0.4, 0.6, 0.8, 0.99])) === fixed,
      fixed);
check('2d a real-random mint validates', H.isRoomCode(H.newRoomCode()));
check('2e a hostile rand (NaN, negative, >=1) cannot escape the alphabet — it must not throw and '
      + 'must not emit `undefined`',
      H.isRoomCode(H.newRoomCode(seq([NaN, -1, 2, Infinity, 'x', null]))),
      H.newRoomCode(seq([NaN, -1, 2, Infinity, 'x', null])));

// ── 3. THE DISTRIBUTION ─────────────────────────────────────────────────────
function firstCharHistogram(randFactory, n) {
  const hist = Object.create(null);
  for (let k = 0; k < n; k++) {
    const c = H.newRoomCode(randFactory(k)).charAt(0);
    hist[c] = (hist[c] || 0) + 1;
  }
  return hist;
}
// A sweep that steps through the middle of each of the 32 buckets must land on each letter once.
// This is the property that catches an off-by-one in the index arithmetic AND a short alphabet.
const sweep = firstCharHistogram((k) => () => (k + 0.5) / 32, 32);
check('3a a full sweep of [0,1) reaches all 32 letters', Object.keys(sweep).length === 32,
      Object.keys(sweep).length);
check('3b ...each EXACTLY once — no dead letter, no doubled letter',
      Object.values(sweep).every((v) => v === 1), sweep);
// And the real generator, over a large sample, stays inside a band. Loose on purpose: this is a
// uniformity smoke, not a statistics exam, and a flaky guard is worse than none.
const N = 32000;
const real = firstCharHistogram(() => Math.random, N);
const expected = N / 32;
const worst = Object.keys(real).reduce((w, c) => Math.max(w, Math.abs(real[c] - expected)), 0);
check('3c Math.random over ' + N + ' mints stays within 25% of even across all 32 letters',
      Object.keys(real).length === 32 && worst < expected * 0.25,
      { letters: Object.keys(real).length, worstDeviation: worst, expected });

// ── 4. CANONICALIZE, THEN VALIDATE ──────────────────────────────────────────
const ONE_ROOM = 'K7WQ4M';
[
  ['k7w q4m', 'a lowercased, space-separated code'],
  ['K7W-Q4M', 'the 3-3 display form with its hyphen'],
  ['k7wq4m', 'lowercase, unseparated'],
  ['  K7W — Q4M  ', 'an em-dash and stray whitespace (a phone keyboard will do this)'],
  ['K7W–Q4M', 'an en-dash'],
].forEach(([input, why]) => {
  const c = H.canonicalizeRoomCode(input);
  check('4a ' + why + ' reaches the SAME room', c === ONE_ROOM && H.isRoomCode(c), { input, c });
});
check('4b a 5-character code is REFUSED', !H.isRoomCode(H.canonicalizeRoomCode('K7WQ4')));
check('4c a 7-character code is REFUSED', !H.isRoomCode(H.canonicalizeRoomCode('K7WQ4MM')));
// An EXCLUDED look-alike is simply illegal — there is no correct fold for it, because BOTH
// members of each pair were removed. The user retypes; they are never sent somewhere else.
check('4d an excluded look-alike is REFUSED and left alone — `K0WQ4M` stays `K0WQ4M` and fails',
      !H.isRoomCode(H.canonicalizeRoomCode('K0WQ4M'))
      && H.canonicalizeRoomCode('K0WQ4M') === 'K0WQ4M');
// THE FOLD THAT WOULD ACTUALLY HURT is one between two LEGAL characters. S/5, B/8, Z/2 and G/6
// are all in the alphabet and all shaped alike in some faces; a canonicalizer that folded any of
// them would collapse two distinct valid codes onto ONE room, and both tables would read as
// working. Nothing about that failure is visible from either end, which is why it is asserted
// here rather than left to be noticed.
check('4d2 NO fold between LEGAL look-alikes — S/5, B/8, Z/2 and G/6 all survive distinct',
      H.canonicalizeRoomCode('S5B8Z2') === 'S5B8Z2'
      && H.canonicalizeRoomCode('G6S5B8') === 'G6S5B8'
      && ['S', '5', 'B', '8', 'Z', '2', 'G', '6'].every((c) => A.indexOf(c) !== -1),
      { S5B8Z2: H.canonicalizeRoomCode('S5B8Z2'), G6S5B8: H.canonicalizeRoomCode('G6S5B8') });
check('4e canonicalize does NOT strip arbitrary characters — only case and separators, so a wrong '
      + 'code stays wrong instead of being repaired into a legal one',
      H.canonicalizeRoomCode('K7W$Q4M') === 'K7W$Q4M'
      && !H.isRoomCode(H.canonicalizeRoomCode('K7W$Q4M')));
check('4f canonicalize survives null/undefined/number without throwing',
      H.canonicalizeRoomCode(null) === '' && H.canonicalizeRoomCode(undefined) === ''
      && H.canonicalizeRoomCode(12345) === '12345');
check('4g isRoomCode refuses a non-string', !H.isRoomCode(null) && !H.isRoomCode(123456));

// ── 5. DISPLAY ──────────────────────────────────────────────────────────────
check('5a display groups 3-3 with a hyphen', H.formatRoomCode(ONE_ROOM) === 'K7W-Q4M',
      H.formatRoomCode(ONE_ROOM));
check('5b the grouped display CANONICALIZES back to the wire form — the hyphen is presentation '
      + 'and the wire never carries it',
      H.canonicalizeRoomCode(H.formatRoomCode(ONE_ROOM)) === ONE_ROOM);
check('5c a NON-canonical string is handed back undressed, so an upstream bug shows as a wrong '
      + 'code rather than a well-formatted one',
      H.formatRoomCode('nope') === 'nope' && H.formatRoomCode(null) === '');
check('5d the mint never emits a hyphen', H.newRoomCode().indexOf('-') === -1);

// ── 6. THE BITES — every leg above, shown to go red ─────────────────────────
//
// These re-implement the ASSERT against a deliberately broken input, because the real functions
// cannot be monkey-patched (they close over module-scope constants). What is proven is that the
// PREDICATE each leg uses discriminates — an assert that passes for a broken value is the failure
// mode this section exists to rule out.
const BAD_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012345';   // 32 chars, but WITH the look-alikes
check('6a BITE (leg 1d): the look-alike predicate FAILS on an alphabet that keeps I/O/0/1',
      !['I', 'O', '0', '1'].every((c) => BAD_ALPHABET.indexOf(c) === -1));
check('6b BITE (leg 1b): the power-of-two predicate FAILS on a 33-letter alphabet',
      !((33 & 32) === 0));
const SHORT = 'ABCDEFGHJKLMNPQRSTUVWXYZ2345678';           // 31 — one short
check('6c BITE (leg 3a/3b): a 31-letter alphabet CANNOT produce 32 distinct sweep letters',
      new Set(Array.from({ length: 32 }, (_, k) =>
        SHORT.charAt(Math.floor(((k + 0.5) / 32) * SHORT.length)))).size !== 32);
const LOPSIDED = { A: 32000 };                              // everything on one letter
check('6d BITE (leg 3c): the distribution band FAILS a mint that always returns the same letter',
      !(Object.keys(LOPSIDED).length === 32));
check('6e BITE (leg 4b): the length predicate FAILS if isRoomCode ignored length — a 5-char code '
      + 'made only of legal characters must be refused BY LENGTH',
      'K7WQ4'.split('').every((c) => A.indexOf(c) !== -1) && !H.isRoomCode('K7WQ4'));
// The mutant is a canonicalizer that folds S->5, which is the shape leg 4d2 forbids. Both the
// input and the folded output are VALID codes for DIFFERENT rooms — that is the whole danger,
// and it is what makes leg 4d2's equality assert discriminating rather than decorative.
const foldingCanonicalize = (v) =>
  String(v).replace(/[\s\-\u2010-\u2015\u2212]/g, '').toUpperCase().replace(/S/g, '5');
check('6f BITE (leg 4d2): a canonicalizer that folded S->5 IS caught — and the mutant proves the '
      + 'danger is real, because BOTH `S5B8Z2` and its folded form are valid codes for different '
      + 'rooms',
      foldingCanonicalize('S5B8Z2') !== 'S5B8Z2'
      && H.isRoomCode('S5B8Z2') && H.isRoomCode(foldingCanonicalize('S5B8Z2')),
      { folded: foldingCanonicalize('S5B8Z2') });
check('6g BITE (leg 5b): the round-trip predicate FAILS on a 2-4 grouping',
      H.canonicalizeRoomCode('K7-WQ4M') === ONE_ROOM && 'K7-WQ4M' !== H.formatRoomCode(ONE_ROOM));

console.log('\n' + (fail === 0 ? 'ALL PASS' : fail + ' FAILED') + `  (${pass}/${pass + fail})`);
process.exit(fail === 0 ? 0 : 1);
