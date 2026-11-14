#!/usr/bin/env node
/**
 * dark_launch.cjs — R-PA-1's flag, guarded as a MECHANISM (ruling f34-phase-a C-PA-1).
 *
 * WHY THIS FILE EXISTS AT ALL. Before the flag, Phase A's darkness was a SIDE-EFFECT of leaving
 * OAuth credentials unbound — which made the dark period and the live OAuth drive mutually
 * exclusive, because binding credentials to run the drive would have opened the sign-in door to
 * every visitor in the same instant (ruling §3). The flag is what separates "reachable for
 * verification" from "visible to users". A mechanism that exists only in one render path is one
 * refactor from being gone, so its shape is asserted here rather than remembered.
 *
 * THE RENDER BEHAVIOUR — flag off + providers bound → door and chip render nothing — is proven in
 * the real pages by scripts/smoke_f34_account_ui.py (8 DARK asserts). This file guards the parts a
 * browser cannot see: that the flag is a NAMED constant, that it ships OFF, that it carries its
 * expiry on its face (the COMMERCIAL_MODE idiom), that it is read at RENDER time by every
 * affordance, and that it gates the affordances WITHOUT gating the seam or the endpoints.
 *
 * R-PA-5 — TO WHOEVER REFACTORS THIS SEAM (ruling `f34-phase-a-conditions` §4). This guard works by
 * SOURCE-TEXT REGEX, deliberately: "this constant exists, ships off, and is consulted here" is a
 * claim about the code's shape, which no browser can see. The cost is that a LEGITIMATE rename or
 * refactor will red it. When that happens, RE-POINT the pattern by measurement — the way the OS-1
 * lap re-pointed its stale guards — and never "fix" a red by loosening the pattern until it matches
 * whatever the code now says; a regex relaxed to green is a guard that has stopped guarding.
 * And keep BOTH instruments: the behavioural half of this mechanism lives entirely in
 * smoke_f34_account_ui's DARK asserts. Deleting either leaves the dark launch half-proven.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0, fail = 0;
const check = (label, cond, detail) => {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (detail !== undefined ? '  -> ' + JSON.stringify(detail) : '')); }
};

console.log('dark_launch — R-PA-1\'s flag as a mechanism\n');

const account = read('lib/shared/account.js');
const ui = read('lib/shared/ui.jsx');
const launchpad = read('index.html');
const acctPage = read('account/index.html');
const mod = require('../lib/shared/account.js');

// ── the constant itself ──────────────────────────────────────────────────────
check('FLAG is a NAMED constant (not an inline literal, not a config lookup)',
  /var ACCOUNT_UI_ENABLED = (true|false);/.test(account));
// RE-POINTED BY RULING, not loosened (ruling f34-conflict-prompt-build §6 lists the flag flip as
// the light-up gate's work; R-PA-5). These two asserted the STATE "dark", and the state has been
// deliberately changed — so they now pin the new state with the same strictness, and the asserts
// that make the flag TRUSTWORTHY (published global, render-time accessor, every surface consulting
// it) are untouched below. What proves the gate still GATES is the smoke drive, which flips the
// flag OFF at runtime and requires all four affordances to vanish.
check('FLAG ships ON — the light-up landed, and the constant says so in source',
  /var ACCOUNT_UI_ENABLED = true;/.test(account) && mod.ACCOUNT_UI_ENABLED === true);
check('FLAG records WHEN it was lit and WHAT promise it now keeps (the self-documenting idiom, '
  + 'kept in past tense rather than deleted)',
  /LIT 2026-08-06/.test(account) && /R-PA-1/.test(account));
check('FLAG still states what it does NOT gate — the seam, /api/v1 and /api/auth stayed reachable '
  + 'dark, and the flip must not be read as having switched them on',
  /does NOT gate this module/.test(account) && /always reachable/.test(account));

// ── read at render time, through ONE accessor ────────────────────────────────
check('FLAG is published for plain-script surfaces (SWRPGAccountUI + SWRPGAccountUIEnabled)',
  /SWRPGAccountUI = \{ enabled: ACCOUNT_UI_ENABLED \}/.test(account)
  && /SWRPGAccountUIEnabled = accountUIEnabled/.test(account));
check('FLAG accessor reads the published global each call (render-time, never captured at load)',
  /function accountUIEnabled\(\) \{\s*return !!\(root\.SWRPGAccountUI && root\.SWRPGAccountUI\.enabled\);/.test(account));

// ── all THREE affordances consult it ─────────────────────────────────────────
check('AFFORDANCE 1/3 — the SuiteBar chip returns null while dark',
  /SWRPGAccountUIEnabled\(\)\) return null;/.test(ui));
check('AFFORDANCE 2/3 — the launchpad door returns before rendering anything while dark',
  /SWRPGAccountUIEnabled\(\)\) return;/.test(launchpad));
check('AFFORDANCE 3/3 — the account page\'s SIGN-IN buttons are gated',
  /s\.providers\.length && window\.SWRPGAccountUIEnabled && window\.SWRPGAccountUIEnabled\(\)/.test(acctPage));

// ── and it gates NOTHING else — the drive must still run dark ────────────────
check('the SEAM is not gated (createAccount never consults the flag — endpoints stay exercisable)',
  !/ACCOUNT_UI_ENABLED|accountUIEnabled/.test(account.slice(account.indexOf('function createAccount'), account.indexOf('// ── browser boot'))));
check('the WORKER is not gated (no flag reaches /api/*; the live drive runs while dark)',
  !/ACCOUNT_UI_ENABLED|SWRPGAccountUI/.test(read('worker/v1.js') + read('worker/auth.js') + read('worker/index.js')));
check('the PRIVACY PAGE itself is not gated (C4\'s floor must read dark or lit)',
  !/SWRPGAccountUIEnabled/.test(acctPage.slice(0, acctPage.indexOf('function render'))));

// ── R-PA-3: display labels, never raw machine ids ────────────────────────────
const auth = read('worker/auth.js');
check('R-PA-3 boundProviders emits a display LABEL beside the id',
  /\.map\(\(\[id, label, signIn\]\) => \(\{ id, label, signIn \}\)\)/.test(auth));
check('R-PA-3 the bindings table gives every provider a human label',
  /\['google', 'Google',/.test(auth) && /\['discord', 'Discord',/.test(auth) && /\['microsoft', 'Microsoft',/.test(auth));
check('R-PA-3 both views render the label, falling back to the id only if one is missing',
  (launchpad.match(/'Sign in with ' \+ \(p\.label \|\| p\.id\)/g) || []).length === 1
  && (acctPage.match(/'Sign in with ' \+ \(p\.label \|\| p\.id\)/g) || []).length === 1);

// ── D-LU1: the dead exception, inverted into a tombstone (ruling f34-light-up §4) ────────────
// F-B4 named two chip exceptions. One of them could never render — the seam sets `status:'offline'`
// and `user:null` in the same breath, and the chip does not exist without a user — so it was
// DELETED rather than made reachable, because holding a last-known identity through an outage
// would have the chip assert something it can no longer verify.
//
// This assert used to prove the message was unreachable. It now proves it is GONE, which is the
// retiring-assert law applied in the right direction: an assert that pins a defect must flip to
// pin its absence the moment the defect dies, or green comes to mean the bug is back.
//
// Comments are stripped before matching (R-D4-1): the explanation living beside the deletion
// legitimately discusses the thing that was removed, and an instrument that reads prose as code
// would report the fix as the defect. Block-aware, because a block's continuation lines start with
// ordinary words rather than `*`.
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const uiCode = stripComments(ui);
check('D-LU1: the chip has exactly ONE exception — the unrenderable offline message is gone from '
  + 'the code, not merely unreachable in it',
  !/Offline\.\s*Changes are saved on this device/.test(uiCode)
  && !/status === 'offline'/.test(uiCode));
check('D-LU1: ...and the exception that CAN render is still there, so the deletion removed the '
  + 'dead one and not the law',
  /Not yet synced\. Your work is safe on this device\./.test(uiCode));
check('D-LU1 non-vacuity: the comment-stripper actually stripped something, and the stripped '
  + 'source is still the real file',
  uiCode.length < ui.length && uiCode.indexOf('function AccountChip') !== -1,
  { full: ui.length, stripped: uiCode.length });

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
