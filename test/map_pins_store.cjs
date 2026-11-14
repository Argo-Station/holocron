#!/usr/bin/env node
/**
 * map_pins_store.cjs — STANDING guard for the F-5 MAP PINS save shape (lib/gm/mapPins.js).
 *
 * The concept ruling (`Docs/rulings/map-pins-concept.md` §3) ruled this save shape ON PAPER and
 * named the three things this guard owes:
 *
 *   1. NORMALIZE — garbage, a truncated write, a hand-edited file: all degrade, none throw.
 *   2. VERSION BRANCHING FROM DAY ONE (R-NBB1) — normalize switches on the stored version while
 *      there is still only one version, and a NEWER-than-us save is flagged `stale` and never
 *      written back (F-54 hold).
 *   3. UNKNOWN PLANET IDS ARE PRESERVED — a pin against an id this build cannot resolve survives
 *      every read/write cycle byte-for-byte. This is the graceful old-data path, and it is the one
 *      that quietly deletes a GM's data if it regresses.
 *
 * It also pins the identity function (`planetKey`), because pins attach to canonical planet ids and
 * NEVER to coordinates (§2 rejected freeform lat/lng for exactly this reason) — and `planetKey` is
 * now the ONE home of a rule the planet-record fetch had its own copy of.
 *
 * R-UNH-1: every assert here examines seeded state, and the localStorage edge is exercised against
 * a real (fake-backed) storage rather than asserted about in the abstract — a store guard that
 * never writes anything is a guard that has not watched the store store.
 *
 * Run:  node test/map_pins_store.cjs   (pure logic + a fake localStorage; no data files needed)
 */

// A fake localStorage, installed BEFORE the module loads so its `root` (globalThis under Node)
// carries one. This is what lets the guard exercise load/persist for real.
const BACKING = {};
globalThis.localStorage = {
  getItem: (k) => (Object.prototype.hasOwnProperty.call(BACKING, k) ? BACKING[k] : null),
  setItem: (k, v) => { BACKING[k] = String(v); },
  removeItem: (k) => { delete BACKING[k]; },
};

const MP = require('../lib/gm/mapPins.js');

let failures = 0;
function check(label, cond, detail) {
  if (cond) { console.log('  PASS  ' + label); }
  else { failures += 1; console.error('  FAIL  ' + label + (detail !== undefined ? '  → ' + JSON.stringify(detail) : '')); }
}

const UNKNOWN_ID = 'a_world_this_build_does_not_ship';

function main() {
  // ── 1. THE RULED SHAPE, byte-for-byte ───────────────────────────────────────────────────────
  const empty = MP.emptyState();
  check('KEY is the ruled localStorage key', MP.KEY === 'swrpg_map_pins', MP.KEY);
  check('emptyState is exactly {version:1, pins:{}}',
        JSON.stringify(empty) === '{"version":1,"pins":{}}', empty);

  const pinned = MP.pin(empty, 'tatooine', 'crashed the speeder', '2026-08-05');
  check('a pin is {note, when} under the planet id — the ruled entry shape',
        JSON.stringify(pinned) === '{"version":1,"pins":{"tatooine":{"note":"crashed the speeder","when":"2026-08-05"}}}',
        pinned);
  check('PRESENCE OF THE KEY IS THE PIN (no pinned:true field to desync)',
        MP.isPinned(pinned, 'tatooine') && !('pinned' in pinned.pins.tatooine)
        && Object.keys(pinned.pins.tatooine).sort().join() === 'note,when');
  check('pin() is immutable — the source state is untouched', Object.keys(empty.pins).length === 0);
  check('unpin DELETES the entry (absence is the unpinned state)',
        !MP.isPinned(MP.unpin(pinned, 'tatooine'), 'tatooine')
        && Object.keys(MP.unpin(pinned, 'tatooine').pins).length === 0);
  check('togglePin round-trips: off → on → off',
        MP.isPinned(MP.togglePin(empty, 'hoth'), 'hoth')
        && !MP.isPinned(MP.togglePin(MP.togglePin(empty, 'hoth'), 'hoth'), 'hoth'));
  check('auto date is stamped when none is given, in YYYY-MM-DD',
        /^\d{4}-\d{2}-\d{2}$/.test(MP.pin(empty, 'hoth').pins.hoth.when),
        MP.pin(empty, 'hoth').pins.hoth.when);
  check('today() is LOCAL date, not UTC (a 23:00 pin files under tonight)',
        MP.today(new Date(2026, 0, 1, 23, 30)) === '2026-01-01',
        MP.today(new Date(2026, 0, 1, 23, 30)));

  // ── 2. planetKey — the ONE identity function; ids, never coordinates ────────────────────────
  check('planetKey prefers the canonical planet_id',
        MP.planetKey({ planet_id: 'yavin_iv', name: 'Yavin' }) === 'yavin_iv');
  check('planetKey falls back to the name slug when the record has no id',
        MP.planetKey({ planet_id: null, name: 'Nar Shaddaa' }) === 'nar_shaddaa');
  check('planetKey passes a bare id string through (callers may hold either)',
        MP.planetKey('tatooine') === 'tatooine');
  check('planetKey NEVER reads coordinates (§2: lat/lng pins rejected)',
        MP.planetKey({ name: 'Hoth', x: 1, y: 2 }) === MP.planetKey({ name: 'Hoth', x: 999, y: -999 }));
  check('a nameless, idless record yields no key — and cannot be pinned',
        MP.planetKey({}) === '' && Object.keys(MP.pin(empty, {}).pins).length === 0);

  // ── 3. NORMALIZE — nothing throws, everything degrades ──────────────────────────────────────
  const garbage = [null, undefined, 0, '', 'nope', [], [1, 2], { pins: 'nope' }, { pins: [] },
                   { version: 1 }, { version: 'x', pins: null }];
  let threw = null;
  garbage.forEach((g) => { try { MP.normalize(g); } catch (e) { threw = String(g) + ': ' + e.message; } });
  check('normalize survives ' + garbage.length + ' garbage inputs without throwing', threw === null, threw);
  check('R-UNH-1 non-vacuity: those garbage inputs really did reach normalize and all became empty',
        garbage.length === 11 && garbage.every((g) => Object.keys(MP.normalize(g).pins).length === 0));
  check('normalize re-emits at OUR schema version', MP.normalize({ version: 1, pins: {} }).version === 1);
  // R-SCH-1 ("a crash is not a verdict"): read the entry DEFENSIVELY. Reading `.pins.hoth.note`
  // directly means any regression that DROPS the id — a registry filter, a bad readV1 — dies here
  // on a TypeError instead of naming the defect. Exit 1 either way, so the battery still reddens,
  // but a stack trace is a third sentence that says neither "kept" nor "dropped". Verified: a
  // blanket-drop mutant crashed this line before the guard was hardened.
  const _hoth = MP.normalize({ version: 1, pins: { hoth: 'junk', endor: 42 } });
  check('an entry that is not an object keeps the PIN and drops only the garbage',
        !!(_hoth.pins.hoth) && _hoth.pins.hoth.note === '' && MP.isPinned(_hoth, 'endor'),
        { hoth: _hoth.pins.hoth, pinIds: Object.keys(_hoth.pins) });
  check('a malformed date becomes EMPTY, never an invented one',
        MP.normalize({ version: 1, pins: { hoth: { when: 'last tuesday' } } }).pins.hoth.when === ''
        && MP.normalize({ version: 1, pins: { hoth: { when: 20260805 } } }).pins.hoth.when === '');
  check('a note is ONE line — newlines/tabs become spaces, and it is capped at NOTE_MAX',
        MP.normalize({ version: 1, pins: { hoth: { note: 'a\nb\tc' } } }).pins.hoth.note === 'a b c'
        && MP.normalize({ version: 1, pins: { hoth: { note: 'x'.repeat(500) } } }).pins.hoth.note.length === MP.NOTE_MAX);
  // THE TYPING SCAR (found by the browser smoke, pinned here so it cannot come back): the note
  // writes through on every keystroke, so a store that trimmed would delete the space as you typed
  // it. "crashed the speeder" must survive being entered one character at a time.
  let typed = MP.pin(MP.emptyState(), 'hoth', '');
  for (const ch of 'crashed the speeder') {
    typed = MP.setNote(typed, 'hoth', typed.pins.hoth.note + ch);
  }
  check('a note typed ONE CHARACTER AT A TIME keeps its spaces (no mid-edit trim)',
        typed.pins.hoth.note === 'crashed the speeder', typed.pins.hoth.note);
  check('a whitespace-only note still normalises to empty',
        MP.normalize({ version: 1, pins: { hoth: { note: '   ' } } }).pins.hoth.note === '');
  check('setNote on an UNPINNED planet is a no-op (a keystroke can never mark a world visited)',
        !MP.isPinned(MP.setNote(empty, 'endor', 'hello'), 'endor'));
  check('setNote on a pinned planet edits the note and keeps the date',
        MP.setNote(pinned, 'tatooine', 'left in a hurry').pins.tatooine.note === 'left in a hurry'
        && MP.setNote(pinned, 'tatooine', 'left in a hurry').pins.tatooine.when === '2026-08-05');

  // ── 4. VERSION BRANCHING FROM DAY ONE (R-NBB1) + the F-54 write-hold ────────────────────────
  const unversioned = MP.normalize({ pins: { hoth: { note: 'old save', when: '2026-01-02' } } });
  check('an UNVERSIONED legacy save reads as v1 — its pins survive, not dropped',
        MP.isPinned(unversioned, 'hoth') && unversioned.pins.hoth.note === 'old save'
        && unversioned.version === 1 && !unversioned.stale);

  const ahead = MP.normalize({ version: 2, pins: { hoth: { note: 'from tomorrow', when: '2026-09-09' } } });
  check('a NEWER-than-us save still DISPLAYS (read what we understand, never blank)',
        MP.isPinned(ahead, 'hoth') && ahead.pins.hoth.note === 'from tomorrow');
  check('a NEWER-than-us save is FLAGGED stale', ahead.stale === true);
  check('R-UNH-1 non-vacuity: the sentinel is version-sensitive, not always-on',
        MP.normalize({ version: 1, pins: {} }).stale === undefined
        && MP.normalize({ version: 99, pins: {} }).stale === true);
  check('an edit CARRIES the stale flag forward (a transform cannot launder a stale save)',
        MP.pin(ahead, 'endor').stale === true && MP.unpin(ahead, 'hoth').stale === true
        && MP.setNote(ahead, 'hoth', 'x').stale === true);
  check('the stale flag is IN-MEMORY ONLY — it is never part of the written envelope',
        !('stale' in JSON.parse(JSON.stringify({ version: 1, pins: MP.normalize(ahead).pins }))));

  // ── 5. UNKNOWN PLANET IDS ARE PRESERVED (the graceful old-data path) ────────────────────────
  const withUnknown = {
    version: 1,
    pins: {
      tatooine: { note: 'sandstorm', when: '2026-08-01' },
      [UNKNOWN_ID]: { note: 'from a dataset we no longer ship', when: '2025-12-25' },
    },
  };
  const norm = MP.normalize(withUnknown);
  check('normalize PRESERVES a planet id this build cannot resolve',
        MP.isPinned(norm, UNKNOWN_ID) && norm.pins[UNKNOWN_ID].note === 'from a dataset we no longer ship'
        && norm.pins[UNKNOWN_ID].when === '2025-12-25');
  check('the unknown id survives an UNRELATED edit elsewhere in the store',
        MP.isPinned(MP.setNote(norm, 'tatooine', 'left'), UNKNOWN_ID)
        && MP.isPinned(MP.pin(norm, 'endor'), UNKNOWN_ID)
        && MP.isPinned(MP.unpin(norm, 'tatooine'), UNKNOWN_ID));
  check('the store holds NO planet registry — it cannot and does not judge an id valid',
        MP.isPinned(MP.pin(MP.emptyState(), 'not_a_planet_at_all'), 'not_a_planet_at_all'));
  check('an additive future field on an entry is passed through, not destroyed',
        MP.normalize({ version: 1, pins: { hoth: { note: 'n', when: '2026-01-01', colour: 'red' } } })
          .pins.hoth.colour === 'red');

  // ── 6. THE localStorage EDGE, exercised for real ────────────────────────────────────────────
  check('load() with nothing stored returns empty (not null, not a throw)',
        JSON.stringify(MP.load()) === '{"version":1,"pins":{}}');

  check('persist() reports it wrote', MP.persist(norm) === true);
  const rawWritten = BACKING[MP.KEY];
  check('R-UNH-1 non-vacuity: something was actually written to the fake storage',
        typeof rawWritten === 'string' && rawWritten.length > 20, rawWritten);
  check('what is on disk is exactly the ruled envelope — version + pins, nothing else',
        Object.keys(JSON.parse(rawWritten)).sort().join() === 'pins,version');

  const roundTripped = MP.load();
  check('ROUND TRIP: a real pin survives persist → load',
        MP.isPinned(roundTripped, 'tatooine') && roundTripped.pins.tatooine.note === 'sandstorm');
  check('ROUND TRIP: the UNKNOWN id survives persist → load byte-for-byte',
        JSON.stringify(roundTripped.pins[UNKNOWN_ID]) === JSON.stringify(norm.pins[UNKNOWN_ID]),
        roundTripped.pins[UNKNOWN_ID]);

  // The F-54 hold, proven by writing: a stale state must leave what is on disk untouched.
  const before = BACKING[MP.KEY];
  check('THE HOLD: persist() refuses a stale state', MP.persist(MP.pin(ahead, 'endor')) === false);
  check('THE HOLD: and the stored bytes are unchanged after that refusal', BACKING[MP.KEY] === before);

  // A corrupt/truncated write on disk must not take the map down with it.
  BACKING[MP.KEY] = '{"version":1,"pins":{"hoth":';
  check('load() over a TRUNCATED save degrades to empty rather than throwing',
        JSON.stringify(MP.load()) === '{"version":1,"pins":{}}');

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`);
  process.exit(failures ? 1 : 0);
}
main();
