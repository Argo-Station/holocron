#!/usr/bin/env node
/**
 * holotable_flag.cjs — STANDING guard for the HOLOTABLE LAUNCH FLAG and the reconnect policy
 * (lib/shared/holotable.js; slice 1, Stage A item 6, ruling `holotable-substrate`).
 *
 * Modelled on test/dark_launch.cjs, which guards F-34's flag as a MECHANISM rather than as a
 * value: a switch that exists only in one render path is one refactor from being gone.
 *
 * ── "CI RUNS BOTH FLAG STATES EVERY BUILD" — WHAT THAT MEANS IN THIS REPO ────────────────────
 *
 * The build card asks for CI to run both flag states every build. THIS REPO HAS NO CI SERVICE —
 * no `.github/workflows`, no pipeline config; its verification currency is the node guard battery
 * plus the browser smokes, and Cloudflare builds on push without running either. Rather than
 * writing a workflow for a runner nobody invokes, both states are exercised HERE, in a guard that
 * runs every time the battery does — which is the closest thing to "every build" that actually
 * executes. Disclosed in the gate as a MECHANISM-class adaptation, not taken silently: the
 * CONTRACT half ("default OFF", "both states exercised") is met; the premise ("there is a CI to
 * hook") was not true.
 *
 * Legs 4-5 flip the published global at runtime and require the accessor to follow. That is the
 * assert that makes the flag TRUSTWORTHY: a module-scope boolean captured at load would pass
 * every other leg here and still be unflippable, which is exactly the shape that cannot be
 * proven dark in a browser.
 *
 * Run:  node test/holotable_flag.cjs
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const check = (label, cond, detail) => {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (detail !== undefined ? '  -> ' + JSON.stringify(detail) : '')); }
};

const SRC = fs.readFileSync(path.join(__dirname, '..', 'lib', 'shared', 'holotable.js'), 'utf8');
const H = require('../lib/shared/holotable.js');

console.log('holotable_flag — dark by default, flippable at render time, and it never herds\n');

// ── 1. the constant itself, in source ────────────────────────────────────────
check('1 FLAG is a NAMED constant (not an inline literal, not a config lookup)',
  /var HOLOTABLE_ENABLED = (true|false);/.test(SRC));
check('1b FLAG ships OFF — slice 1 deploys the mechanism DARK',
  /var HOLOTABLE_ENABLED = false;/.test(SRC) && H.HOLOTABLE_ENABLED === false);
check('1c FLAG states WHAT IT GATES (the Stage B affordances)',
  /WHAT IT GATES/.test(SRC) && /start-table door/.test(SRC));
check('1d FLAG states WHAT IT DOES NOT GATE — the store, the wire and the Worker stay reachable '
    + 'dark, or the dark period verifies nothing',
  /WHAT IT DOES NOT GATE/.test(SRC) && /always reachable/.test(SRC));
check('1e FLAG says it is NEVER REPURPOSED (how one switch ends up gating two features)',
  /NEVER REPURPOSED/.test(SRC));

// ── 2-3. the indirection layer ───────────────────────────────────────────────
check('2 FLAG is published for plain-script surfaces (SWRPGHolotable)',
  /root\.SWRPGHolotable = \{ enabled: HOLOTABLE_ENABLED \};/.test(SRC)
  && typeof globalThis.SWRPGHolotable === 'object');
check('2b a named accessor is published too (SWRPGHolotableEnabled)',
  typeof globalThis.SWRPGHolotableEnabled === 'function');
check('3 the accessor READS THE PUBLISHED GLOBAL each call, never a captured boolean',
  /function holotableEnabled\(\) \{\s*return !!\(root\.SWRPGHolotable && root\.SWRPGHolotable\.enabled\);/.test(SRC));
check('3b and it reports dark right now', H.holotableEnabled() === false);

// ── 4-5. BOTH FLAG STATES, exercised here because there is no CI to run them ─
{
  const before = globalThis.SWRPGHolotable.enabled;
  globalThis.SWRPGHolotable.enabled = true;
  check('4 STATE ON: flipping the published global flips the accessor (render-time read)',
        H.holotableEnabled() === true && globalThis.SWRPGHolotableEnabled() === true);
  globalThis.SWRPGHolotable.enabled = false;
  check('5 STATE OFF: flipping it back flips the accessor back',
        H.holotableEnabled() === false && globalThis.SWRPGHolotableEnabled() === false);
  check('5b the source constant is UNCHANGED by a runtime flip (the ship state is the file)',
        H.HOLOTABLE_ENABLED === false);
  globalThis.SWRPGHolotable.enabled = before;
}
{
  // The mechanism must be reachable in BOTH states — the clause that makes a dark deploy worth
  // deploying. If the flag also switched off the store or the reconnect policy, there would be
  // nothing to verify in production before lighting up.
  const R = require('../lib/shared/roomState.js');
  const both = [];
  [true, false].forEach((state) => {
    globalThis.SWRPGHolotable.enabled = state;
    both.push(typeof R.emptyState === 'function'
              && typeof H.reconnectDelay === 'function'
              && R.emptyState().version === R.SCHEMA_VERSION);
  });
  globalThis.SWRPGHolotable.enabled = false;
  check('5c the MECHANISM (store + reconnect) is reachable with the flag ON and OFF',
        both.length === 2 && both.every(Boolean), both);
}

// ── 6. reconnect: bounded, never zero, never aligned ─────────────────────────
check('6 RECONNECT is a named policy object, not scattered literals',
  H.RECONNECT && typeof H.RECONNECT.baseMs === 'number'
  && typeof H.RECONNECT.maxMs === 'number' && typeof H.RECONNECT.factor === 'number');

// Equal jitter: delay ∈ [exp/2, exp], where exp = min(base * factor^n, max).
const expFor = (n) => Math.min(H.RECONNECT.maxMs, H.RECONNECT.baseMs * Math.pow(H.RECONNECT.factor, n));
let inBand = true, monotonic = true, prevLo = -1;
for (let n = 0; n < 12; n++) {
  const exp = expFor(n);
  const lo = H.reconnectDelay(n, () => 0);
  const hi = H.reconnectDelay(n, () => 1);
  const mid = H.reconnectDelay(n, () => 0.5);
  if (!(lo === Math.round(exp / 2) && hi === Math.round(exp) && mid >= lo && mid <= hi)) inBand = false;
  if (lo < prevLo) monotonic = false;
  prevLo = lo;
}
check('6b every attempt lands in the equal-jitter band [exp/2, exp]', inBand);
check('6c backoff is non-decreasing across attempts', monotonic);
check('6d NEVER ZERO — even the luckiest draw waits (full jitter would hammer)',
  H.reconnectDelay(0, () => 0) > 0 && H.reconnectDelay(0, () => 0) === H.RECONNECT.baseMs / 2);
check('6e NEVER FIXED — the luckiest and unluckiest draws differ (no jitter would herd)',
  H.reconnectDelay(3, () => 0) !== H.reconnectDelay(3, () => 1));
check('6f CAPPED — a large attempt count saturates at maxMs rather than overflowing',
  H.reconnectDelay(1000, () => 1) === H.RECONNECT.maxMs
  && isFinite(H.reconnectDelay(1e9, () => 1)));

// ── 7. hostile inputs degrade, never throw or NaN ────────────────────────────
const hostile = [undefined, null, NaN, -5, 'seven', Infinity, 2.7];
let clean = true;
hostile.forEach((v) => {
  const d = H.reconnectDelay(v, () => 0.5);
  if (typeof d !== 'number' || !isFinite(d) || d <= 0) clean = false;
});
check('7 a garbage attempt count degrades to a sane delay (never NaN, never <= 0)', clean);
let randClean = true;
[undefined, null, NaN, -1, 2, 'x'].forEach((r) => {
  const d = H.reconnectDelay(2, () => r);
  if (typeof d !== 'number' || !isFinite(d) || d < expFor(2) / 2 - 1 || d > expFor(2) + 1) randClean = false;
});
check('7b a garbage rand() clamps into the band rather than escaping it', randClean);
check('7c with no rand supplied it still returns a delay in band (production path)',
  (function () { const d = H.reconnectDelay(2); return d >= expFor(2) / 2 - 1 && d <= expFor(2) + 1; })());

// ── 8. EVENT IDENTITY minted here, not in the store (R-REI-1/2) ──────────────
{
  const seq = (() => { let s = 7; return () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648); })();
  const a = H.newEventId(seq), b = H.newEventId(seq);
  check('8 newEventId returns an opaque, prefixed, fixed-shape string',
        /^r_[a-z0-9]{20}$/.test(a), a);
  check('8b two mints differ (an identity, not a constant)', a !== b);
  check('8c it is DETERMINISTIC under an injected rand (fixtures and guards can predict it)',
        (function () { const s2 = (() => { let s = 7; return () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648); })();
                       return H.newEventId(s2) === a; })());
  check('8d it encodes NOTHING — no timestamp, no member id (an id that carries facts invites '
      + 'code that parses it)', !/\d{10,}/.test(a) && a.indexOf('member') === -1);
  check('8e a garbage rand degrades to a well-formed id rather than throwing',
        /^r_[a-z0-9]{20}$/.test(H.newEventId(() => NaN))
        && /^r_[a-z0-9]{20}$/.test(H.newEventId(() => 5)));
  check('8f with no rand supplied it still mints (the production path)',
        /^r_[a-z0-9]{20}$/.test(H.newEventId()));
  // The store must NOT mint: R-REI-2 keeps makeRollEvent RNG-free, so it REFUSES an id-less event
  // rather than quietly generating one. Asserted here because that split is the rule's substance.
  const R2 = require('../lib/shared/roomState.js');
  let refused = false;
  try { R2.makeRollEvent({ faces: { ability: [] } }); } catch (e) { refused = /id/i.test(e.message); }
  check('8g the STORE refuses an id-less roll rather than minting one itself (R-REI-2)', refused);
}

console.log('');
console.log(`holotable_flag: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
