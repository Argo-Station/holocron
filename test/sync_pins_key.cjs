#!/usr/bin/env node
/**
 * sync_pins_key.cjs — R-F5-1: `swrpg_map_pins` is the TENTH synced key, classified WHOLE.
 * Ruling `f5-map-pins` §3 (the R-SY4 paper: key name, class, and reason are ruled there).
 *
 * WHAT THIS GUARD IS FOR. Registering a synced key is not one edit, it is FOUR, and the failure
 * mode of missing one is silent in a different way each time:
 *
 *   1. the store module        lib/gm/mapPins.js      — the key's own name and envelope
 *   2. the merge class         lib/shared/syncMerge.js — WHOLE vs LISTS; ALSO derives the client's
 *                              key list (lib/shared/sync.js `syncedKeys()`), so this one edit has
 *                              two effects and both are asserted below rather than assumed
 *   3. the human-readable copy lib/shared/ui.jsx CONFLICT_COPY — see THE FALLBACK TRAP
 *   4. the SERVER allow-list   worker/sync.js SYNC_KEYS — a key absent here 404s on push no matter
 *                              what the client believes, because an allow-list that lives only in
 *                              the caller is a suggestion
 *
 * Miss (2) and nothing syncs. Miss (4) and every push 404s while the client thinks it is syncing.
 * Miss (3) and the feature "works" — which is the worst of the three, and the reason for the next
 * paragraph.
 *
 * THE FALLBACK TRAP. `describeConflict` has a no-copy fallback:
 *   `return { title: c.key, here: 'this version', there: 'the other version' };`
 * So a key with no CONFLICT_COPY entry does not crash and does not fail a smoke — it shows a GM the
 * literal string `swrpg_map_pins` and "this version". That is the open defect B-134 (the conflict
 * sheet showing a raw mod id), already filed as below the mechanics-voice bar. The copy asserts
 * below therefore check the OUTPUT, not the presence of a table entry: an entry whose describe()
 * returned the key would pass a presence check and still be the bug.
 *
 * WHAT THE COPY MAY USE. Only the two stored values. `swrpg_active_sources` wanted to say "12 books
 * on here, 9 on your account" and could not — an absent book sits at its group default, so the
 * count needs the whole book vocabulary. Pins have no such problem: both sides are
 * `{version, pins:{planetId:{note,when}}}`, so which worlds differ and how each side has them are
 * both derivable from the two values alone. The asserts below run the REAL shipped function text
 * (sliced out of ui.jsx and evaluated) rather than a copy of it, because a copy would only prove
 * the copy agrees with itself.
 *
 * Run: node test/sync_pins_key.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0, fail = 0;
const check = (label, cond, detail) => {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (detail !== undefined ? '  -> ' + JSON.stringify(detail).slice(0, 400) : '')); }
};

const KEY = 'swrpg_map_pins';

console.log('sync_pins_key — the tenth synced key, in all four places it has to be\n');

// ── the modules under test ───────────────────────────────────────────────────
const pins = require('../lib/gm/mapPins.js');
const MERGE = require('../lib/shared/syncMerge.js');
const { createSync } = require('../lib/shared/sync.js');
const workerSync = read('worker/sync.js');

// ── the conflict copy, evaluated from the REAL source text ───────────────────
// ui.jsx is a browser IIFE full of JSX and needs React, so it cannot be required. The conflict-copy
// region (bookTitle → describeConflict) is plain JS with no JSX and no React reference, so it is
// sliced out by its function boundaries and evaluated. The slice boundaries are themselves asserted
// below: a slice that silently found nothing would make every copy assert vacuous.
const uiSrc = read('lib/shared/ui.jsx');
// Anchored on explicit region markers, NOT on whichever function happens to sit first. The first
// draft sliced from `function bookTitle` and broke the moment a helper was hoisted above it — the
// slice still "worked", it just cut the region in half and the copy crashed on a missing name. A
// marker is a boundary somebody chose; a function name is a boundary that moves.
const SLICE_START = '  // ── CONFLICT-COPY REGION START';
const SLICE_END = '  // ── CONFLICT-COPY REGION END';
const a = uiSrc.indexOf(SLICE_START);
const b = uiSrc.indexOf(SLICE_END);
let UI = null, sliceErr = null;
if (a >= 0 && b > a) {
  try {
    // eslint-disable-next-line no-new-func
    UI = new Function('window', uiSrc.slice(a, b)
      + '\nreturn { CONFLICT_COPY: CONFLICT_COPY, describeConflict: describeConflict };')(undefined);
  } catch (e) { sliceErr = String((e && e.message) || e); }
}

console.log('— the harness itself is live (R-UNH-1: a dead slice makes every copy assert vacuous)');
check('HARNESS the conflict-copy region was found in ui.jsx', a >= 0 && b > a, { a, b });
check('HARNESS it evaluated to real functions, not a stub',
  !!UI && typeof UI.describeConflict === 'function' && !!UI.CONFLICT_COPY, sliceErr);
check('HARNESS the evaluated code is the shipped code — an UNRELATED key still describes correctly',
  !!UI && UI.describeConflict({ key: 'swrpg_mods', kind: 'envelope', local: { mods: ['a', 'b'] }, remote: { mods: [] } }).here === '2 on: a, b',
  UI && UI.describeConflict({ key: 'swrpg_mods', kind: 'envelope', local: { mods: ['a', 'b'] }, remote: { mods: [] } }));
check('HARNESS the no-copy FALLBACK is still there and still does the bad thing — so the asserts '
  + 'below are testing something a passing build could otherwise fail',
  !!UI && UI.describeConflict({ key: 'swrpg_nonexistent_key', kind: 'envelope', local: 1, remote: 2 }).title === 'swrpg_nonexistent_key');

// ── 1/4 the store module ─────────────────────────────────────────────────────
console.log('\n— registration point 1/4: the store module');
check('STORE lib/gm/mapPins.js owns the key name', pins.KEY === KEY, pins.KEY);
check('STORE its envelope is the synced-key idiom {version, pins}',
  pins.emptyState().version === pins.SCHEMA_VERSION
  && pins.emptyState().pins && typeof pins.emptyState().pins === 'object', pins.emptyState());

// ── 2/4 the merge class (and the client key list it derives) ─────────────────
console.log('\n— registration point 2/4: the merge class');
check('MERGE the key is classified WHOLE', MERGE.WHOLE.indexOf(KEY) >= 0, MERGE.WHOLE);
check('MERGE it is NOT a list key — a flat id→entry map has no per-item identity to merge (§3)',
  !Object.prototype.hasOwnProperty.call(MERGE.LISTS, KEY), Object.keys(MERGE.LISTS));
{
  // The one-edit-two-effects claim, VERIFIED rather than trusted: sync.js derives its key list from
  // MERGE, so adding to WHOLE is supposed to register push AND pull with no second edit.
  const s = createSync({
    fetch: () => Promise.reject(new Error('no network in this assert')),
    storage: { get: () => null, set: () => {} },
    schedule: (fn) => { fn(); return 1; },
  });
  check('DERIVED the client key list picked it up with no second edit', s.syncedKeys().indexOf(KEY) >= 0, s.syncedKeys());
  // Re-pointed 10 → 11 by ruling `shipyard-s3-contracts` R-S3K-5 (K5, the fleet units; built S4 JOB 2, R-S4G-17).
  // KEEPS "the pins key is derived into the client list"; the total moves with the eleventh ruled key.
  // Re-pointed 11 → 12 by ruling `release-r4-shapes` R-R4S-5 item 3 (the group record, `swrpg_party_v1`; card
  // `release-r6-backend-card` §3 names this pin). KEEPS "the pins key is derived"; the total moves with the twelfth key.
  // Re-pointed 12 → 13 by ruling `encounters-e6-plumbing` ADDENDUM 1, C2 (the campaign record, `swrpg_campaigns`). KEEPS "the pins key is derived";
  // DROPS nothing; the total moves with the thirteenth key.
  check('DERIVED the client now syncs exactly THIRTEEN keys (the tenth, pins; the eleventh, K5; the twelfth, the group record; the thirteenth, campaigns)', s.syncedKeys().length === 13, s.syncedKeys());
}

// ── 3/4 the conflict copy ────────────────────────────────────────────────────
console.log('\n— registration point 3/4: the conflict copy (and it must not be the fallback)');
const pinEnv = (obj) => ({ version: 1, pins: obj });
// When the harness is dead (region markers gone, slice failed), every assert below must go RED, not
// quietly true. The first cut returned `{title:null, here:null, there:null}` and three asserts
// PASSED on it — "neither side falls back to 'this version'" is trivially true of null, and
// String(null) contains no `swrpg_`. So the dead-harness stub is the FALLBACK'S OWN SHAPE, the exact
// B-134 output this guard exists to reject: it fails every copy assert the way a real regression
// would. (R-UNH-1: measured on clean code — those three flipped from vacuous PASS to FAIL.)
const DEAD = { title: KEY, here: 'this version', there: 'the other version' };
const describe = (mine, theirs) => (UI
  ? UI.describeConflict({ key: KEY, kind: 'envelope', local: mine, remote: theirs })
  : DEAD);

{
  const d = describe(pinEnv({ tatooine: { note: '', when: '2026-07-14' } }), pinEnv({}));
  check('COPY the title is a sentence, not the storage key', d.title && d.title !== KEY && !/swrpg_/.test(d.title), d.title);
  check('COPY neither side falls back to "this version"',
    d.here !== 'this version' && d.there !== 'the other version', d);
  // The TITLE is included deliberately: the fallback's `title: c.key` IS the B-134 defect, and an
  // assert that read only the two side-lines would go green on exactly the bug it exists to catch.
  check('COPY no part of it leaks the raw key or a payload dump',
    !/swrpg_|\{|\}|"note"/.test(String(d.title) + String(d.here) + String(d.there)), d);
}

// The fixtures the ruling names, plus the ones that break naive implementations.
{
  const d = describe(
    pinEnv({ tatooine: { note: 'crashed the speeder', when: '2026-07-14' } }),
    pinEnv({ hoth: { note: '', when: '2026-07-02' } }));
  check('COPY differing sides NAME the worlds rather than counting them',
    /Tatooine/.test(d.here) && /Hoth/.test(d.there), d);
  // BOTH halves, or it is vacuous: the readable name must be PRESENT, and the slug form must be
  // absent. "absent" alone passes on any string that never mentions the world at all.
  check('COPY a slug id is rendered readably, from the stored value alone',
    /Tatooine/.test(d.here) && !/tatooine|_/.test(d.here), d.here);
  check('COPY each side says how THIS side has the differing world',
    /Tatooine pinned/.test(d.here) && /Hoth not pinned/.test(d.here), d.here);
}
{
  const d = describe(pinEnv({ nal_hutta: { note: '', when: '2026-07-14' } }), pinEnv({}));
  check('COPY a multi-word slug title-cases with the joining word left alone',
    /Nal Hutta/.test(d.here), d.here);
}
// REAL KEYS FROM THE REAL KEY SPACE. `tatooine` and `nal_hutta` are the easy shape and they are the
// only shape the first cut of this guard exercised. But only 49 of 2,077 planets carry a canonical
// `planet_id`; the other 2,028 get a name-derived slug from planetKey(), which is where the awkward
// ids live. Both branches are pinned below — the one that renders exactly, and the one that does
// not — so the accepted imperfection is a CHOICE on the record instead of a silence.
{
  // Ordinal: the single largest class of awkward planet slug (19 of them), and plain title-case
  // renders it "Althir Iii".
  const d = describe(pinEnv({ althir_iii: { note: '', when: '2026-07-14' } }), pinEnv({}));
  check('COPY a name-derived ordinal slug renders as the real planet name',
    /Althir III pinned/.test(d.here) && !/Iii/.test(d.here), d.here);
}
{
  // ACCEPTED IMPERFECTION, pinned deliberately. `ahch-to` lost its capital T to the slug and cannot
  // get it back from the stored value (proven: capitalising after every hyphen takes 66 wrong names
  // to 72, because the dataset holds "Ahch-To" beside "Abregado-rae"). The assert is that it stays
  // READABLE and identifiable — never the raw slug, never a crash — not that it is perfect.
  const d = describe(pinEnv({ 'ahch-to': { note: '', when: '2026-07-14' } }), pinEnv({}));
  check('COPY an unrecoverable-casing slug is still readable and identifiable, not raw',
    d.here === 'Ahch-to pinned', d.here);
}
{
  // ONE SIDE EMPTY — the ruling names this one. "no worlds pinned" beats reciting every world the
  // other side has as "not pinned"; the other side still names its own.
  const d = describe(pinEnv({}), pinEnv({ tatooine: { note: '', when: '2026-07-14' }, hoth: { note: '', when: '2026-07-02' } }));
  check('COPY one side empty: the empty side says so plainly', /no worlds pinned/.test(d.here), d.here);
  check('COPY one side empty: the other side names what it has', /Tatooine/.test(d.there) && /Hoth/.test(d.there), d.there);
}
{
  // IDENTICAL BOTH SIDES — the ruling names this one too. The merge only raises a conflict when the
  // two envelopes differ, so reaching here means the pins agree and something else (the version
  // field, key order) does not. Saying "the same pins" is the honest answer; naming zero worlds and
  // returning an empty string would render as a blank line under the choice.
  const same = pinEnv({ tatooine: { note: 'ok', when: '2026-07-14' } });
  const d = describe(same, JSON.parse(JSON.stringify(same)));
  check('COPY identical both sides: says they are the same, and is never blank',
    /same pins/.test(d.here) && d.here.length > 0 && d.here === d.there, d);
}
{
  // Both sides pinned the same world with different notes: the difference IS the note, so show it.
  const d = describe(
    pinEnv({ tatooine: { note: 'crashed the speeder', when: '2026-07-14' } }),
    pinEnv({ tatooine: { note: 'left in a hurry', when: '2026-07-14' } }));
  check('COPY same world, different notes: each side shows ITS note',
    /crashed the speeder/.test(d.here) && /left in a hurry/.test(d.there), d);
}
{
  // Same world, same note, different date: fall through to the date rather than say nothing.
  const d = describe(
    pinEnv({ tatooine: { note: 'ok', when: '2026-07-14' } }),
    pinEnv({ tatooine: { note: 'ok', when: '2026-06-01' } }));
  check('COPY same world, same note, different date: the date is what is shown',
    /2026-07-14/.test(d.here) && /2026-06-01/.test(d.there), d);
}
{
  // Above the naming cap, count — the books precedent's overflow shape.
  const many = {};
  for (let i = 0; i < 7; i += 1) many['world_' + i] = { note: '', when: '2026-07-14' };
  const d = describe(pinEnv(many), pinEnv({ hoth: { note: '', when: '2026-07-02' } }));
  check('COPY above the naming cap it counts instead, and still says which way',
    /8 worlds differ/.test(d.here) && /7 pinned here/.test(d.here), d.here);
}
// THE CAP BOUNDARY ITSELF. Eight-versus-one only proves the cap exists somewhere; it passes just as
// happily with the cap at 3 or at 7, so it cannot pin WHERE the switch happens — and where it
// happens is the whole decision (past three, a phone shows a wall of text instead of a choice).
// Both sides of the 3/4 edge are asserted, so moving the cap one step in either direction reds.
{
  const three = {
    tatooine: { note: '', when: '2026-07-14' },
    hoth: { note: '', when: '2026-07-14' },
    nal_hutta: { note: '', when: '2026-07-14' },
  };
  // Read `here`, not `there`: describeConflict describes the OTHER side with the arguments
  // swapped, and `there` is the empty side, which short-circuits to "no worlds pinned" and would
  // make this assert a statement about the wrong sentence. (It did, on the first run.)
  const d = describe(pinEnv(three), pinEnv({}));
  check('COPY exactly THREE differing worlds are still NAMED — the last case under the cap',
    /Tatooine/.test(d.here) && /Hoth/.test(d.here) && /Nal Hutta/.test(d.here)
    && !/worlds differ/.test(d.here), d.here);
}
{
  const four = {
    tatooine: { note: '', when: '2026-07-14' },
    hoth: { note: '', when: '2026-07-14' },
    nal_hutta: { note: '', when: '2026-07-14' },
    dathomir: { note: '', when: '2026-07-14' },
  };
  const d = describe(pinEnv(four), pinEnv({}));
  check('COPY exactly FOUR differing worlds tip over to the count — the first case above the cap',
    /4 worlds differ/.test(d.here) && /4 pinned here/.test(d.here) && !/Tatooine/.test(d.here), d.here);
}
{
  // A world pinned only on the OTHER side, while this side has pins of its own — this side must not
  // claim to have it.
  const d = describe(
    pinEnv({ tatooine: { note: '', when: '2026-07-14' } }),
    pinEnv({ tatooine: { note: '', when: '2026-07-14' }, hoth: { note: '', when: '2026-07-02' } }));
  check('COPY a world only the other side has reads as NOT pinned here',
    /Hoth not pinned/.test(d.here) && /Hoth pinned/.test(d.there) && !/Tatooine/.test(d.here), d);
}
{
  // Garbage in — the copy runs on whatever localStorage held, so it must not throw.
  let threw = null;
  try { describe(null, undefined); describe('nonsense', 42); describe(pinEnv(null), pinEnv([])); }
  catch (e) { threw = String((e && e.message) || e); }
  // `!!UI` or this is the one assert the dead-harness stub cannot redden: a stub literally cannot
  // throw, so without it a missing region would report "does not throw" as a pass.
  check('COPY unreadable values do not throw — the sheet still renders', !!UI && threw === null, threw);
}

// ── 4/4 the server allow-list ────────────────────────────────────────────────
console.log('\n— registration point 4/4: the SERVER allow-list (worker — deploy-gated)');
// The FIRST cut of this section matched the key's TEXT inside the sliced declaration, and it was
// worthless: commenting the key out — `// 'swrpg_map_pins',` — leaves the text present, so the
// regex still matched and the ten-key count still counted ten. That mutant passed all 69 test
// files while the real Set held nine keys and every push of this key would have 404'd in
// production. On the ONE registration point no browser test can observe, a text match is not
// evidence. So the declaration is EVALUATED into a real Set and the Set is interrogated (R-Q2B-1:
// assert the behaviour of the shipped declaration, not its spelling).
{
  const a2 = workerSync.indexOf('const SYNC_KEYS');
  const b2 = workerSync.indexOf(']);', a2);
  let SET = null, evalErr = null;
  if (a2 >= 0 && b2 > a2) {
    try {
      // eslint-disable-next-line no-new-func
      SET = new Function(workerSync.slice(a2, b2 + 3) + '\nreturn SYNC_KEYS;')();
    } catch (e) { evalErr = String((e && e.message) || e); }
  }
  // R-UNH-1: a slice that found nothing, or evaluated to something that is not a Set, would make
  // both asserts below vacuous. Prove the harness is live BEFORE trusting what it reports.
  check('SERVER HARNESS the SYNC_KEYS declaration was found and evaluated to a real Set',
    !!SET && typeof SET.has === 'function' && typeof SET.size === 'number', evalErr || { a2, b2 });
  check('SERVER HARNESS the evaluated Set is the shipped one — an EXISTING key is in it',
    !!SET && SET.has('swrpg_active_sources'), SET && Array.from(SET));
  check('SERVER HARNESS a key that was never registered is absent — so .has() discriminates',
    !!SET && !SET.has('swrpg_store_shelves_v1'), SET && Array.from(SET));

  check('SERVER the key is in SYNC_KEYS — asked of the real Set, so a commented-out key fails here',
    !!SET && SET.has(KEY), SET && Array.from(SET));
  // Re-pointed 11 → 12 by R-R4S-5 item 3 (the group record; card `release-r6-backend-card` §3). KEEPS the pins key's membership.
  // Re-pointed 12 → 13 by ruling `encounters-e6-plumbing` ADDENDUM 1, C2 (the campaign record). KEEPS the pins key's and the group record's membership.
  check('SERVER SYNC_KEYS is now exactly thirteen keys (re-pointed on E6 C2, the campaign record)', !!SET && SET.size === 13 && SET.has('swrpg_party_v1') && SET.has('swrpg_campaigns'), SET && Array.from(SET));
  // RE-POINTED by card `f100-ms-build` R-MSB-5: the server admits the eleven SYNC_KEYS PLUS the three homebrew families
  // (R-HSC-1/-4/-11), by pattern beside the Set. KEEPS "eleven in the Set" above and "the pins key is in it"; DROPS
  // nothing. The families' predicate is evaluated and interrogated, like the Set (R-Q2B-1), not matched by spelling.
  const a3 = workerSync.indexOf('const PACK_KEY_RES');
  const b3 = workerSync.indexOf('];', a3);
  let isPack = null, packErr = null;
  if (a3 >= 0 && b3 > a3) {
    try { isPack = new Function(workerSync.slice(a3, b3 + 2) + '\nreturn function (k) { return PACK_KEY_RES.some(function (re) { return re.test(k); }); };')(); }
    catch (e) { packErr = String((e && e.message) || e); }
  }
  check('SERVER HARNESS the PACK_KEY_RES declaration was found and evaluated', typeof isPack === 'function', packErr || { a3, b3 });
  const yes = ['swrpg_user_pack:0123456789ab', 'swrpg_user_pack_meta', 'swrpg_user_pack_v:my_pack@0123456789ab'];
  const no = ['swrpg_user_pack:0123', 'swrpg_user_pack:0123456789AB', 'swrpg_user_pack_meta_x', 'swrpg_user_pack_v:My@0123456789ab', 'swrpg_map_pins'];
  check('SERVER the three homebrew families are admitted (R-HSC-1/-4/-11)', !!isPack && yes.every(isPack), yes.filter((k) => !(isPack && isPack(k))));
  check('SERVER a near-miss of a family, and a fixed key, are NOT admitted by the pattern', !!isPack && !no.some(isPack), no.filter((k) => isPack && isPack(k)));
  // Re-pointed 11 → 12 with the twelfth ruled key (R-R4S-5); KEEPS "the pack lane adds nothing to the client list".
  // Re-pointed 12 → 13 with the thirteenth (ruling `encounters-e6-plumbing` ADDENDUM 1, C2); KEEPS the same claim.
  check('SERVER the CLIENT key list stays thirteen — the pack lane is its own path (R-HSC-15)', createSync({ fetch: () => Promise.reject(new Error('no network')), storage: { get: () => null, set: () => {} } }).syncedKeys().length === 13);
}

// ── the WHOLE-merge behaviour (§3's class, exercised not just declared) ──────
console.log('\n— the WHOLE class, exercised');
const A = pinEnv({ tatooine: { note: 'a', when: '2026-07-14' } });
const B = pinEnv({ hoth: { note: 'b', when: '2026-07-02' } });
// R-SCH-1: an unregistered key produces `merged[KEY] === undefined`, and a bare `.pins` read on it
// throws — which would end the run and leave every assert below it with NO verdict at all rather
// than a red one. Every read below goes through these, so an absent key reports as a FAILURE.
const pinsOfMerged = (env) => (env && env.pins) || {};
const jsonEq = (x, y) => JSON.stringify(x) === JSON.stringify(y);
{
  const l = {}; l[KEY] = A;
  const r = {}; r[KEY] = B;
  const out = MERGE.mergeAdoption(l, r);
  const c = out.conflicts.filter((x) => x.key === KEY);
  check('MERGE differing sides raise exactly ONE envelope conflict', c.length === 1 && c[0].kind === 'envelope', out.conflicts);
  check('MERGE the local value is kept provisionally, so nothing changes under the GM',
    jsonEq(out.merged[KEY], A), out.merged[KEY]);
  check('MERGE it is WHOLE, not a union — the two sides\' pins are NOT combined',
    !!out.merged[KEY] && !pinsOfMerged(out.merged[KEY]).hoth, out.merged[KEY]);
  check('MERGE the conflict carries both sides, so the prompt can describe them',
    c.length === 1 && jsonEq(c[0].local, A) && jsonEq(c[0].remote, B), c[0]);
}
{
  const l = {}; l[KEY] = A;
  const r = {}; r[KEY] = JSON.parse(JSON.stringify(A));
  const out = MERGE.mergeAdoption(l, r);
  // `&& out.merged[KEY]` is load-bearing: an UNREGISTERED key also raises no conflict, so without it
  // this assert passes on clean code for the wrong reason. Asking nothing only counts as evidence
  // once the key actually went through the merge.
  check('MERGE identical sides ask nothing',
    out.conflicts.filter((x) => x.key === KEY).length === 0 && !!out.merged[KEY], out.conflicts);
  check('MERGE identical sides still produce the value', jsonEq(out.merged[KEY], A), out.merged[KEY]);
}
{
  const r = {}; r[KEY] = B;
  const out = MERGE.mergeAdoption({}, r);
  check('MERGE remote-only is adopted silently — a fresh device gets the account\'s pins',
    jsonEq(out.merged[KEY], B) && out.conflicts.length === 0, out);
}
{
  const l = {}; l[KEY] = A;
  const out = MERGE.mergeAdoption(l, {});
  check('MERGE local-only is kept and asks nothing — signing in never wipes local pins',
    jsonEq(out.merged[KEY], A) && out.conflicts.length === 0, out);
}
{
  // The store's own reader must survive whatever the merge hands back, including the other side's
  // envelope. This is the seam between the two modules and nothing else asserts it.
  const merged = MERGE.mergeAdoption({}, (() => { const r = {}; r[KEY] = B; return r; })()).merged[KEY];
  const n = pins.normalize(merged);
  const hoth = pinsOfMerged(n).hoth;
  check('SEAM an adopted envelope reads back through the store unchanged',
    !!hoth && hoth.note === 'b' && hoth.when === '2026-07-02', n);
  // Same trap as above: an unregistered key hands `normalize` undefined, whose result is also not
  // stale. Require the pin to have survived the round trip before the staleness reading means anything.
  check('SEAM and it is not flagged stale (same schema version on both sides)', !!hoth && !n.stale, n);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
