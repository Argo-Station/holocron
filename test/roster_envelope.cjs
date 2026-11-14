#!/usr/bin/env node
/**
 * roster_envelope.cjs — the roster's versioned envelope + the F-54 sentinel (F-B3; ruling
 * `f34-phase-b-scope` §5, conditions C-B-5/C-B-6).
 *
 * WHY THE ROSTER NEEDED THIS AND THE OTHER STORES ALREADY HAD IT: `swrpg_saved_characters` was the
 * only store persisting a BARE ARRAY — no version, no way to tell which era of the app wrote it,
 * migrations done by sniffing the data's shape. One device made that survivable. Phase B makes two
 * devices on two builds the normal case, and then an older tab renders what it understands and
 * strips the rest on its next write — silently, on the most important thing the product holds.
 *
 * The behaviour lives in `lib/shared/roster.js` (lifted verbatim from `player/app.jsx`, ruling
 * `shipyard-cargo-build-gm-seam-census` R-SCGS-1; its behaviour legs are test/roster_store.cjs), and
 * this guard asserts the CONTRACT at source and exercises the shared comparison directly. The
 * round-trip through a real browser is `scripts/smoke_roster_envelope.py`.
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

console.log('roster_envelope — the versioned envelope + the F-54 sentinel\n');

const app = read('lib/shared/roster.js');   // R-SCGS-1: the roster block's home; every assert below is kept
const VG = require('../lib/shared/versionGuard.js');

// ── the shared comparison itself (C-B-6: ONE implementation) ─────────────────
check('VG ahead-of-us is stale', VG.isAhead(2, 1) === true);
check('VG same version is not stale', VG.isAhead(1, 1) === false);
check('VG older is not stale', VG.isAhead(0, 1) === false);
check('VG an UNVERSIONED legacy save is NOT stale (missing must never lock a user out of writing)',
  VG.isAhead(undefined, 1) === false && VG.isAhead(null, 1) === false);
check('VG junk is not stale', VG.isAhead('banana', 1) === false && VG.isAhead(NaN, 1) === false);
check('VG numeric strings still compare (a version read back from JSON may be a string)',
  VG.isAhead('2', 1) === true && VG.isAhead('1', 1) === false);
check('VG blocked() is the write-hold predicate',
  VG.blocked({ stale: true }) === true && VG.blocked({}) === false && VG.blocked(null) === false);

// ── the envelope (C-B-5) ─────────────────────────────────────────────────────
check('ROSTER_SCHEMA_VERSION is a named constant', /const ROSTER_SCHEMA_VERSION = \d+;/.test(app));
check('the writer emits { version, characters } — not a bare array',
  /JSON\.stringify\(\{ version: ROSTER_SCHEMA_VERSION, characters: list \}\)/.test(app));
check('the reader accepts a BARE ARRAY as legacy version 0 (every existing user\'s data)',
  /if \(Array\.isArray\(stored\)\) \{ parsed = stored; rawV = 0; \}/.test(app));
check('the reader accepts the envelope shape',
  /Array\.isArray\(stored\.characters\)/.test(app));
// C-B-5 says the migration is non-destructive and in place. The property that actually encodes
// that: the load path never rewrites the store just to change its shape. It DOES still write
// conditionally for the pre-existing legacy double-nest lift — which C-B-5 also requires be
// preserved — so the assert is "the only write on the load path is that guarded one", not "no
// write at all". (The first version of this assert used a proximity regex that reddened on the
// catch block and was asserting a property the ruling never asked for; recorded because an assert
// that reddens for the wrong reason is worth more attention than one that passes.)
const loadBody = app.slice(app.indexOf('function loadSavedCharacters'), app.indexOf('function writeSavedCharacters'));
check('C-B-5 the load path writes ONLY for the legacy lift — the envelope migration is not forced on read',
  (loadBody.match(/writeSavedCharacters\(/g) || []).length === 1
  && /if \(migrated\) writeSavedCharacters\(parsed\);/.test(loadBody));
check('C-B-5 the legacy double-nest lift still runs (shape-sniffing migration preserved)',
  /sd\.sheetData && sd\.sheetData\.characteristics/.test(app));

// ── the sentinel (C-B-6) ─────────────────────────────────────────────────────
check('the RAW stored version is compared, before any migration touches records',
  app.indexOf('_rosterStale = window.SWRPGVersionGuard') < app.indexOf('sd.sheetData.characteristics'));
check('the roster consults the SHARED guard, not a re-typed comparison',
  /window\.SWRPGVersionGuard[\s\S]{0,80}isAhead\(rawV, ROSTER_SCHEMA_VERSION\)/.test(app));
check('a stale roster is NEVER written back — the hold is at the one write seam',
  /function writeSavedCharacters\(list\) \{[\s\S]{0,400}?if \(_rosterStale\) return;/.test(app));
check('every read path resets the flag (a stale read must not poison a later clean one)',
  (app.match(/_rosterStale = false;/g) || []).length >= 3);

// ── the quota catch keeps its rationale (D-B5 / R-B-2) ───────────────────────
check('the roster write no longer swallows failures with a bare, unexplained catch',
  /catch \(e\) \{\s*\n\s*\/\/ D-B5/.test(app));

// ── one implementation, three consumers ──────────────────────────────────────
check('C-B-6 vesselStore uses the shared guard', /VG\(\)\.isAhead\(rawV, SCHEMA_V\)/.test(read('lib/shared/vesselStore.js')));
check('C-B-6 benchStore uses the shared guard', /__VG\.isAhead\(toInt\(raw\.version\), SCHEMA_VERSION\)/.test(read('lib/library/npc/benchStore.js')));
check('C-B-6 the guard loads before the stores in BOTH apps that hold versioned data',
  ['player/index.html', 'gm/index.html'].every((p) => {
    const h = read(p);
    const g = h.indexOf('versionGuard.js');
    return g > -1 && g < h.indexOf('benchStore.js') && g < h.indexOf('vesselStore.js');
  }));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
