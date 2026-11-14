/**
 * b242_legacy_gear_string.cjs — B-242: a legacy gear STRING must render the name it carries,
 * never "(unknown gear)".
 *
 * WHAT GOES WRONG. `isCanonicalEntry` returns true for ANY string. But the PC equipment-entry
 * convention this module documents at its head is `{id, qty?}` or `{_inline}` — a BARE STRING was
 * never part of it (bare id-ref strings belong to `resolveWeapon`, the NPC/canonical contract).
 * So a pre-canonical save carrying `gear: ["Blaster power pack"]` is claimed by the canonical
 * branch, fails to resolve, and falls to the `!gRec` marker — which reads `entry.name` off a
 * STRING, gets undefined, and renders "(unknown gear)". The legacy branch one line below, which
 * exists precisely to render that string, is UNREACHABLE for the shape it was written for.
 *
 * LIVE, NOT LATENT (the R-BLL-2 test): this needs no synthetic data. Any character saved before the
 * canonical migration carries this shape, and the 96-entry prod incident is its measured instance —
 * that one was repaired in DATA; this closes the CODE path so the next old save renders correctly.
 *
 * THE FIX IS REGISTRY-AWARE, NOT SHAPE-AWARE. "Is this string canonical?" is answered by the
 * registry, never by how the string looks: `isCanonicalEntry(entry, registry)` treats a string as
 * canonical iff the registry actually holds that key. Called WITHOUT a registry it is unchanged,
 * so no other consumer moves. That preserves the case a blanket `return false` would have broken —
 * a legacy string that DOES happen to name a real canonical key still resolves canonically.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const IR = require(path.join(ROOT, 'lib/shared/itemResolve.js'));
const GEAR = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical/gear.json'), 'utf8')).gear;

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '\n          ' + detail : '')); }
}
console.log('b242_legacy_gear_string — a legacy gear string renders its name, not "(unknown gear)"');

// A REAL canonical key, read from the shipped registry rather than hardcoded.
const REAL_KEY = Object.keys(GEAR)[0];
// A legacy display name: the shape old saves carry. Asserted absent from the registry, so the
// fixture cannot silently become a canonical ref if the data changes under it.
const LEGACY = 'Blaster power pack';

console.log('\n  fixture: REAL_KEY=' + JSON.stringify(REAL_KEY) + '  LEGACY=' + JSON.stringify(LEGACY));
check('fixture precondition: the legacy name is NOT a registry key',
  !Object.prototype.hasOwnProperty.call(GEAR, LEGACY));
check('fixture precondition: the real key IS a registry key',
  Object.prototype.hasOwnProperty.call(GEAR, REAL_KEY));

// ── 1. THE CONTRACT ──────────────────────────────────────────────────────────────────────────
check('a legacy display-name string is NOT canonical when checked against the registry',
  IR.isCanonicalEntry(LEGACY, GEAR) === false,
  'isCanonicalEntry(' + JSON.stringify(LEGACY) + ', GEAR) = ' + IR.isCanonicalEntry(LEGACY, GEAR));

check('a string that IS a registry key stays canonical (the canonical path is untouched)',
  IR.isCanonicalEntry(REAL_KEY, GEAR) === true);

// ── 2. BACKWARD COMPATIBILITY — no registry supplied means unchanged behaviour ────────────────
check('called WITHOUT a registry, a string is still claimed (no other consumer moves)',
  IR.isCanonicalEntry(LEGACY) === true);

// ── 3. THE OBJECT SHAPES ARE UNMOVED ─────────────────────────────────────────────────────────
check('{id} is canonical, with a registry', IR.isCanonicalEntry({ id: REAL_KEY, qty: 2 }, GEAR) === true);
check('{id} is canonical, without one', IR.isCanonicalEntry({ id: REAL_KEY, qty: 2 }) === true);
check('{_inline} is canonical', IR.isCanonicalEntry({ _inline: { name: 'Custom' } }, GEAR) === true);
check('a legacy OBJECT is not canonical', IR.isCanonicalEntry({ name: 'Old Thing', qty: 1 }, GEAR) === false);
check('null / undefined are not canonical',
  IR.isCanonicalEntry(null, GEAR) === false && IR.isCanonicalEntry(undefined, GEAR) === false);

// ── 4. THE POINT-FREE HAZARD — the reason `registry` must be typechecked ─────────────────────
// Array.every/some/map pass (element, INDEX, array). A point-free call therefore hands this
// function a NUMBER as its registry. Pinned at EVERY index, so the assert cannot pass by an
// accident of ordering the way test/item_resolve.cjs's did.
const POINT_FREE = [LEGACY, REAL_KEY, { id: REAL_KEY }, { _inline: { name: 'X' } }];
check('point-free .every() is unaffected at every index (index is not mistaken for a registry)',
  POINT_FREE.every(IR.isCanonicalEntry) === true,
  POINT_FREE.map((e, i) => i + ':' + IR.isCanonicalEntry(e, i)).join(' '));
check('a NUMBER as registry is ignored, not consulted',
  IR.isCanonicalEntry(LEGACY, 1) === true && IR.isCanonicalEntry(LEGACY, 0) === true);

// ── 5. THE CALL SITES PASS THEIR REGISTRY (the fix is inert unless they do) ───────────────────
// R-S4PP-1 (ruling `shipyard-s4-ship-pool-path`): resolveSheetEquipment, which holds the three sites, moved VERBATIM to
// lib/shared/sheetPool.js — both files are scanned, so a site in either counts (norm 3: the claim is the call sites').
const SRCS = [['player/app.jsx', path.join(ROOT, 'player', 'app.jsx')], ['lib/shared/sheetPool.js', path.join(ROOT, 'lib', 'shared', 'sheetPool.js')]];
const sites = [].concat(...SRCS.map(([rel, abs]) => fs.readFileSync(abs, 'utf8').split('\n')
  .map((line, i) => ({ line: rel + ':' + (i + 1), text: line.trim() }))))
  .filter(o => /IR\.isCanonicalEntry\(/.test(o.text) && !/^\s*\/\//.test(o.text));
check('all three equipment call sites are found', sites.length === 3, String(sites.length));
const bare = sites.filter(o => /IR\.isCanonicalEntry\([^,)]*\)/.test(o.text));
check('NO equipment call site calls isCanonicalEntry without a registry',
  bare.length === 0,
  bare.map(o => ':' + o.line + '  ' + o.text.slice(0, 92)).join('\n          '));

console.log('\nb242_legacy_gear_string: ' + pass + '/' + (pass + fail) + ' PASS');
process.exit(fail ? 1 : 0);
