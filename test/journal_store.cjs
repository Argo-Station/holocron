#!/usr/bin/env node
/**
 * journal_store.cjs — STANDING guard for F-8 THE JOURNAL (lib/shared/journal.js).
 *
 * Ruling `Docs/rulings/reddit-cluster-f7-f8-f9s3.md` §3 ruled the shape AND the entry model, so
 * this guard is the ruling written as asserts:
 *
 *   1. APPEND PREPENDS — newest-first, and the order survives a read of a badly ordered save.
 *   2. DELETE REMOVES — a real removal, not a tombstone. And there is NO edit(): a log whose past
 *      can be rewritten is a notes field with extra steps, so the absence of that verb is asserted.
 *   3. IDS ARE STABLE AND UNIQUE — unique across appends inside the SAME millisecond, and an
 *      existing entry's id is unchanged by any later append, delete or re-read.
 *   4. MALFORMED / ABSENT DEGRADES TO EMPTY, never throws. The absent case is not hypothetical:
 *      every character that exists today has no `journal` key at all (C-F8-1 ii).
 *   5. C-F8-1 (i) — THE PAD IS UNTOUCHED. `sheet.notes` is byte-identical through a full journal
 *      create → delete cycle, exercised through the SAME shallow-merge patch semantics
 *      `handleSheetChange` uses. This is the condition the whole feature was shaped around: real
 *      people have text in that field on more than one device and in the production database.
 *   6. C-F8-2 — MERGE. The journal rides inside `characters[].sheetData`, so it is governed by
 *      syncMerge's EXISTING per-record policy for `swrpg_saved_characters`: no new key, no new
 *      class. This guard drives the REAL merge (lib/shared/syncMerge.js) with two devices rather
 *      than asserting about it in prose — including the honest negative: entries are NOT unioned.
 *
 * R-UNH-1 (non-vacuity): every assert below examines a value produced by the module under test, and
 * the fixtures are checked to be non-trivial before they are relied on — a guard that asserts
 * `[] === []` and reports green is this programme's standing defect.
 *
 * Run:  node test/journal_store.cjs      (pure logic; no storage, no data files, no network)
 */

const J = require('../lib/shared/journal.js');
const SM = require('../lib/shared/syncMerge.js');

let failures = 0;
function check(label, cond, detail) {
  if (cond) { console.log('  PASS  ' + label); }
  else { failures += 1; console.error('  FAIL  ' + label + (detail !== undefined ? '  → ' + JSON.stringify(detail) : '')); }
}

// Deterministic stamps so ordering asserts are about the SORT, not about clock luck.
const T1 = '2026-08-01T10:00:00.000Z';
const T2 = '2026-08-03T21:30:00.000Z';
const T3 = '2026-08-05T08:15:00.000Z';

function main() {
  // ── 1. THE RULED SHAPE + APPEND ───────────────────────────────────────────────────────────────
  const one = J.append([], 'Teemo took the droid back.', { at: T1, id: 'e1' });
  check('append onto nothing yields exactly one entry', one.length === 1, one);
  check('the entry is the RULED shape — id, at, text, nothing invented',
        Object.keys(one[0]).sort().join() === 'at,id,text', one[0]);
  check('NO TITLE FIELD (refused on paper: "a field nobody fills at a table")',
        !('title' in one[0]) && !('name' in one[0]));
  check('NO SESSION FIELD (refused: the app has no session concept; W-E1 owns it)',
        !('sessionId' in one[0]) && !('session' in one[0]));
  check('the text is carried verbatim (trimmed of surrounding whitespace only)',
        one[0].text === 'Teemo took the droid back.', one[0].text);

  const two = J.append(one, 'Made planetfall on Ryloth.', { at: T2, id: 'e2' });
  const three = J.append(two, 'The Hutt wants a word.', { at: T3, id: 'e3' });
  check('NEWEST-FIRST: the newest append is index 0',
        three.map(e => e.id).join() === 'e3,e2,e1', three.map(e => e.id));
  check('append is IMMUTABLE — the source list is not mutated',
        one.length === 1 && two.length === 2, [one.length, two.length]);
  check('R-UNH-1 non-vacuity: the fixture actually carries three distinct texts',
        new Set(three.map(e => e.text)).size === 3);

  // A save written in the WRONG order (a hand edit, a merge, any future writer) still reads
  // newest-first: normalize sorts on read rather than trusting stored order.
  const scrambled = J.normalize([three[2], three[0], three[1]]);
  check('order is recovered on READ, not merely written — a scrambled save reads newest-first',
        scrambled.map(e => e.id).join() === 'e3,e2,e1', scrambled.map(e => e.id));

  // An unparseable date must not hide somebody's writing — it sorts oldest and still renders.
  const withBadDate = J.normalize(three.concat([{ id: 'ebad', at: 'not-a-date', text: 'still mine' }]));
  check('an entry with an unparseable date is KEPT (sorted oldest), never dropped',
        withBadDate.length === 4 && withBadDate[3].id === 'ebad', withBadDate.map(e => e.id));

  // ── 2. DELETE — a real removal, and no EDIT verb exists ───────────────────────────────────────
  const afterDel = J.remove(three, 'e2');
  check('delete removes exactly that entry',
        afterDel.map(e => e.id).join() === 'e3,e1', afterDel.map(e => e.id));
  check('delete is a REAL removal — no tombstone left behind in the list',
        JSON.stringify(afterDel).indexOf('e2') === -1 && !afterDel.some(e => e.deleted));
  check('delete is IMMUTABLE — the source list still has three', three.length === 3);
  check('deleting an id that is not there is a no-op, not a throw',
        J.remove(three, 'nope').length === 3);
  check('EDIT NO — the module exposes no edit/update/replace verb (ruled: the past is not rewritable)',
        !J.edit && !J.update && !J.replace && !J.setText,
        Object.keys(J));

  // ── 3. IDS — unique, and stable across every later operation ──────────────────────────────────
  const ids = {};
  let collisions = 0;
  for (let i = 0; i < 2000; i++) {
    const id = J.newId();
    if (ids[id]) collisions += 1;
    ids[id] = true;
  }
  check('ids are UNIQUE across 2000 mints in the same tick (a double-tap must not collide)',
        collisions === 0 && Object.keys(ids).length === 2000, collisions);

  // Minted for real (no opts) — the app's own path, twice in the same millisecond.
  const rapid = J.append(J.append([], 'first'), 'second');
  check('R-UNH-1 non-vacuity: two real (unstubbed) appends produced two real ids',
        rapid.length === 2 && rapid[0].id && rapid[1].id && rapid[0].id !== rapid[1].id,
        rapid.map(e => e.id));
  check('a real append stamps a parseable ISO date', !isNaN(Date.parse(rapid[0].at)), rapid[0].at);

  const stableBefore = three.map(e => e.id).join();
  const stableAfter = J.normalize(J.remove(J.append(three, 'noise', { at: T3, id: 'e4' }), 'e4'))
    .map(e => e.id).join();
  check('IDS ARE STABLE — an append + delete round trip leaves every surviving id unchanged',
        stableBefore === stableAfter, [stableBefore, stableAfter]);

  // ── 4. THE DEGRADE PATHS — absent, malformed, hostile. None may throw. ────────────────────────
  const junk = [undefined, null, '', 'a string', 42, {}, { entries: [] }, NaN, true];
  let threw = null;
  junk.forEach((v) => {
    try {
      const n = J.normalize(v);
      if (!Array.isArray(n) || n.length !== 0) threw = ['not empty', v, n];
    } catch (e) { threw = ['threw', v, String(e)]; }
  });
  check('ABSENT/MALFORMED degrades to [] and never throws (9 hostile inputs incl. undefined)',
        threw === null, threw);
  check('C-F8-1 (ii) — a character with NO journal key reads as an empty log',
        J.normalize(undefined).length === 0 && J.count(undefined) === 0);
  check('append onto an ABSENT field works — the first entry needs no migration step',
        J.append(undefined, 'first ever', { at: T1, id: 'x' }).length === 1);
  check('delete against an ABSENT field is a no-op, not a throw',
        J.remove(undefined, 'x').length === 0);

  const dirty = J.normalize([
    null, 7, 'nope', [],
    { text: 'no id at all' },                       // undeletable junk — dropped
    { id: 'k1', at: T2 },                           // no text — kept, coerced to ''
    { id: 'k1', at: T3, text: 'duplicate id' },     // dup id — dropped, delete stays unambiguous
    { id: 'k2', at: T1, text: 'fine', sessionId: 'w-e1-future' },  // unknown field — preserved
  ]);
  check('entries with no id are dropped (an entry the UI cannot delete is junk forever)',
        !dirty.some(e => e.text === 'no id at all'), dirty);
  check('a missing text coerces to empty string rather than dropping the entry',
        dirty.some(e => e.id === 'k1' && e.text === ''), dirty);
  check('a DUPLICATED id keeps the first only — delete must never be ambiguous',
        dirty.filter(e => e.id === 'k1').length === 1);
  check('UNKNOWN entry fields are PRESERVED (the additive `sessionId` path the ruling reserved)',
        dirty.some(e => e.id === 'k2' && e.sessionId === 'w-e1-future'), dirty);
  check('R-UNH-1 non-vacuity: the dirty fixture yielded a non-empty list to examine',
        dirty.length === 2, dirty.length);

  check('SAVE ENTRY on an empty box does nothing (no dated nothing in the log)',
        J.append(three, '   ').length === 3 && J.append(three, '').length === 3
        && J.append(three, null).length === 3);
  check('isBlank agrees with that refusal', J.isBlank('  \n ') && !J.isBlank(' x '));

  // Mechanics voice: a plain date, no varnish.
  check('formatDate renders a plain date', J.formatDate('2026-08-05T08:15:00.000Z').match(/^\d{1,2} [A-Z]{3} \d{4}$/) !== null,
        J.formatDate('2026-08-05T08:15:00.000Z'));
  check('formatDate on a missing/garbage date renders nothing rather than "Invalid Date"',
        J.formatDate(undefined) === '' && J.formatDate('nope') === '');

  // ── 5. C-F8-1 (i) — THE PAD IS BYTE-IDENTICAL THROUGH CREATE → DELETE ─────────────────────────
  // Exercised through the SAME shallow-merge the sheet's write path uses:
  //   handleSheetChange({journal:next})  →  Object.assign({}, prev, patch)
  // Awkward on purpose: the pad text carries a newline, a quote and a unicode ellipsis, because
  // "byte-identical" is only worth asserting on a string that could plausibly be mangled.
  const PAD = 'Teemo’s deadline is Tuesday.\n"bring the droid" — his words…';
  const padBytes = Buffer.from(PAD, 'utf8').toString('hex');
  let sheet = { name: 'Kira Vess', notes: PAD, currentWounds: 3 };
  const sheetBefore = JSON.stringify(sheet);

  sheet = Object.assign({}, sheet, { journal: J.append(sheet.journal, 'Entry one', { at: T1, id: 'p1' }) });
  check('CREATE: the journal patch lands', sheet.journal.length === 1);
  check('C-F8-1 (i) create — sheet.notes is byte-identical',
        Buffer.from(sheet.notes, 'utf8').toString('hex') === padBytes);

  sheet = Object.assign({}, sheet, { journal: J.append(sheet.journal, 'Entry two', { at: T2, id: 'p2' }) });
  sheet = Object.assign({}, sheet, { journal: J.remove(sheet.journal, 'p1') });
  check('DELETE: the cycle completes with one entry left',
        sheet.journal.length === 1 && sheet.journal[0].id === 'p2', sheet.journal);
  check('C-F8-1 (i) delete — sheet.notes is STILL byte-identical after the full cycle',
        Buffer.from(sheet.notes, 'utf8').toString('hex') === padBytes, sheet.notes);
  check('C-F8-1 (i) — nothing else on the sheet moved either; only `journal` was added',
        JSON.stringify(Object.assign({}, sheet, { journal: undefined }))
          === JSON.stringify(Object.assign({}, JSON.parse(sheetBefore), { journal: undefined })),
        sheet);
  check('R-UNH-1 non-vacuity: the pad fixture is a real string with the characters that break naive code',
        PAD.length > 40 && PAD.indexOf('\n') > -1 && PAD.indexOf('’') > -1);

  // Remove the journal key entirely and the sheet is the ORIGINAL object again — the field is
  // additive and droppable, which is what "no migration" buys.
  const stripped = Object.assign({}, sheet); delete stripped.journal;
  check('the field is ADDITIVE: drop `journal` and the record is byte-identical to before F-8',
        JSON.stringify(stripped) === sheetBefore, [JSON.stringify(stripped), sheetBefore]);

  // ── 6. C-F8-2 — MERGE, driven for real through lib/shared/syncMerge.js ────────────────────────
  // Re-pointed (norm 3) when K5 joined LISTS (ruling `shipyard-s3-contracts` R-S3K-5, built S4 JOB 2): KEEPS
  // "F-8 added no key" — the set is the four keys before F-8 plus the one a later ruling named, and no journal key.
  // Re-pointed again when the group record joined LISTS (ruling `release-r4-shapes` R-R4S-5 item 3, R6 lane A): KEEPS
  // "F-8 added no key"; the set gains only that ruled key.
  // Re-pointed a third time when the campaign record joined LISTS (ruling `encounters-e6-plumbing` ADDENDUM 1 C2 / P2.1,
  // its ADDENDUM 6 R1): KEEPS "F-8 added no key" (no journal key, no new class); the set gains only `swrpg_campaigns`.
  // Re-pointed a fourth time when the wish list joined LISTS (ruling `between-sessions-build-paper` R-BSBP-5; card
  // `between-sessions-lap-a-card` ADDENDUM 5 row 1 @ 74de11e20): KEEPS "F-8 added no key"; DROPS nothing; the set gains
  // only `swrpg_store_holds_v2`.
  check('C-F8-2 — NO NEW KEY: syncMerge governs the keys it did before F-8, plus only K5\'s fleet units, R-R4S-5\'s group record, E6\'s campaign record and R-BSBP-5\'s wish list',
        Object.keys(SM.LISTS).sort().join() ===
          'swrpg_campaigns,swrpg_fleet_units_v1,swrpg_npc_bench,swrpg_npc_cast,swrpg_party_v1,swrpg_saved_characters,swrpg_store_holds_v2,swrpg_vessels_v1',
        Object.keys(SM.LISTS));
  check('C-F8-2 — NO NEW CLASS: the journal is not a top-level synced key of its own',
        !SM.LISTS.swrpg_journal && SM.WHOLE.indexOf('swrpg_journal') === -1
        && !Object.keys(SM.LISTS).some(k => /journal/i.test(k))
        && !SM.WHOLE.some(k => /journal/i.test(k)));

  // Real ms epochs, not small integers. `recency.isMsStamp` has a 2001-09-09 FLOOR — it refuses to
  // treat a number that cannot be a timestamp as one — so a fixture using `updatedAt: 1000` would
  // silently exercise the REFUSE path while claiming to test the newer-wins path. Measured, not
  // assumed: the first draft of this guard did exactly that and the assert caught it.
  const MS_OLD = Date.parse(T1);
  const MS_NEW = Date.parse(T2);
  check('fixture sanity: both merge stamps clear recency\'s ms floor (else every case below is the refuse path)',
        require('../lib/shared/recency.js').isMsStamp(MS_OLD)
        && require('../lib/shared/recency.js').isMsStamp(MS_NEW) && MS_NEW > MS_OLD);

  const rec = (id, updatedAt, journal, notes) => ({
    id, name: 'Kira Vess', updatedAt,
    sheetData: { notes: notes === undefined ? PAD : notes, journal },
  });
  const env = (records) => ({ swrpg_saved_characters: { version: 1, characters: records } });

  // (a) TWO DEVICES, DIFFERENT CHARACTERS — both journals survive, union by id.
  const a = SM.mergeAdoption(
    env([rec('c1', MS_NEW, [{ id: 'a1', at: T1, text: 'phone entry' }])]),
    env([rec('c2', MS_NEW, [{ id: 'b1', at: T2, text: 'laptop entry' }])]));
  const aChars = a.merged.swrpg_saved_characters.characters;
  check('C-F8-2 two devices / DIFFERENT characters — both records, both journals, no conflict',
        aChars.length === 2 && a.conflicts.length === 0
        && aChars[0].sheetData.journal[0].text === 'phone entry'
        && aChars[1].sheetData.journal[0].text === 'laptop entry',
        [aChars.length, a.conflicts]);

  // (b) TWO DEVICES, SAME CHARACTER, both appended, recency COMPUTABLE — the newer WHOLE record
  //     wins. This is the pre-existing per-record policy for every field of a character (wounds,
  //     notes, portrait); the journal inherits it and does NOT get entry-level union. Stated
  //     plainly because it is a real behaviour, not a bug: the older device's entry does not
  //     survive. Changing that would be a new merge class, which was not ruled.
  const older = rec('c1', MS_OLD, [{ id: 'a1', at: T1, text: 'phone entry' }]);
  const newer = rec('c1', MS_NEW, [{ id: 'b1', at: T2, text: 'laptop entry' }]);
  const bMerge = SM.mergeAdoption(env([older]), env([newer]));
  const bChar = bMerge.merged.swrpg_saved_characters.characters[0];
  check('C-F8-2 two-device APPEND to the same character — newer updatedAt wins the whole record',
        bMerge.merged.swrpg_saved_characters.characters.length === 1
        && bChar.sheetData.journal.length === 1 && bChar.sheetData.journal[0].id === 'b1'
        && bMerge.conflicts.length === 0,
        [bChar.sheetData.journal, bMerge.conflicts]);
  check('C-F8-2 — and the merge did NOT union entries (documented behaviour, asserted not assumed)',
        bChar.sheetData.journal.length === 1);
  check('C-F8-2 — the pad rides through the merge unharmed',
        Buffer.from(bChar.sheetData.notes, 'utf8').toString('hex') === padBytes);

  // (c) SAME CHARACTER, recency NOT computable (no stamps) — the merge REFUSES and asks, keeping
  //     local provisionally. The journal must not silently pick a side either.
  const l = rec('c1', undefined, [{ id: 'a1', at: T1, text: 'phone entry' }]);
  const r = rec('c1', undefined, [{ id: 'b1', at: T2, text: 'laptop entry' }]);
  const cMerge = SM.mergeAdoption(env([l]), env([r]));
  check('C-F8-2 no-recency — the merge REFUSES to guess and raises one record conflict',
        cMerge.conflicts.length === 1 && cMerge.conflicts[0].kind === 'record'
        && cMerge.conflicts[0].id === 'c1',
        cMerge.conflicts);
  check('C-F8-2 no-recency — local is kept provisionally and BOTH sides ride the conflict (C-CP-2)',
        cMerge.merged.swrpg_saved_characters.characters[0].sheetData.journal[0].id === 'a1'
        && cMerge.conflicts[0].local.sheetData.journal[0].id === 'a1'
        && cMerge.conflicts[0].remote.sheetData.journal[0].id === 'b1');

  // (d) ONE DEVICE HAS NO JOURNAL KEY AT ALL — today's universal case meeting a device that has one.
  const noKey = { id: 'c1', name: 'Kira Vess', updatedAt: MS_OLD, sheetData: { notes: PAD } };
  const dMerge = SM.mergeAdoption(env([noKey]), env([rec('c1', MS_NEW, [{ id: 'b1', at: T2, text: 'laptop entry' }])]));
  const dChar = dMerge.merged.swrpg_saved_characters.characters[0];
  check('C-F8-2 — a journal-less device merging with a journaled one does not throw and keeps the newer',
        dChar.sheetData.journal && dChar.sheetData.journal.length === 1 && dMerge.conflicts.length === 0);
  check('C-F8-2 — and the reverse direction leaves the journal-less record readable as empty',
        J.normalize(SM.mergeAdoption(env([rec('c1', MS_NEW, [{ id: 'b1', at: T2, text: 'x' }])]), env([noKey]))
          .merged.swrpg_saved_characters.characters[0].sheetData.journal).length === 1);

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`);
  process.exit(failures ? 1 : 0);
}
main();
