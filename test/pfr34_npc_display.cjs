/**
 * R-PFR-3 / R-PFR-4 — the NPC display lap: wound threshold, DEFENSE, and the minion pool arithmetic.
 *
 * Reports 3 and 4 of `player-field-reports-2026-08-04`, plus the defect nobody reported.
 *
 * WHY THESE ASSERT AGAINST THE SHIPPED REGISTRY AND NOT A FIXTURE (R-PFR-3, verbatim: "an assert
 * that passes against a hand-made NPC carrying `derived.defense` has proven nothing"). The DEFENSE
 * bug existed precisely BECAUSE the code read a key that no real record has. A fixture invented for
 * the test would carry whatever the test author assumed — and the assumption is the defect. So the
 * population here is `public/data/canonical/npcs.json`, all 1430 of them.
 *
 * The RAW arithmetic is asserted BY NAME (R-PFR-4): a minion group's wound threshold is the SUM of
 * its members' (EotE p.399), so four WT-5 stormtroopers are 20, not 5.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let ok = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { ok++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (detail !== undefined ? '  — ' + JSON.stringify(detail) : '')); }
}

// ── the shipped population, not a fixture ────────────────────────────────────────────────────
const doc = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical/npcs.json'), 'utf8'));
let recs = doc.npcs || doc;
recs = Array.isArray(recs) ? recs : Object.values(recs);
check('the NPC registry loaded a real population (non-vacuity)', recs.length > 1000, { count: recs.length });

const derivedOf = (r) => (r && r.derived) || {};
const wtPresent = recs.filter(r => {
  const d = derivedOf(r);
  return (d.wounds != null ? d.wounds : d.woundThreshold) != null;
}).length;
const flatDefense = recs.filter(r => derivedOf(r).defense != null).length;
const realKeys = recs.filter(r => derivedOf(r).melee_defense != null && derivedOf(r).ranged_defense != null).length;

check('every NPC carries a wound threshold — so a default is unreachable on real data',
      wtPresent === recs.length, { withThreshold: wtPresent, total: recs.length });
check('ZERO NPCs carry `derived.defense` — the key the desktop card used to read',
      flatDefense === 0, { carrying: flatDefense });
check('every NPC carries melee_defense AND ranged_defense — the real keys',
      realKeys === recs.length, { withRealKeys: realKeys, total: recs.length });

// ── the resolvers, lifted out of the view for direct exercise ────────────────────────────────
// The view is a JSX module, so the two pure resolvers are re-implemented here ONLY to assert the
// contract; the SOURCE asserts below prove the view actually calls its own shared home rather than
// keeping a copy. (An arithmetic mirror alone would test the mirror — B-55's lesson.)
function npcWoundThreshold(d) { d = d || {}; return (d.wounds != null ? d.wounds : d.woundThreshold) || 0; }
// C-PFR34-2: the view's resolver returns the PAIR now. Mirrored here to assert the contract; the
// SOURCE asserts below prove the view calls its own shared home rather than keeping a copy.
function npcDefensePair(d) {
  d = d || {};
  if (d.melee_defense != null || d.ranged_defense != null) return [d.melee_defense || 0, d.ranged_defense || 0];
  if (Array.isArray(d.defence)) return [d.defence[0] || 0, d.defence[1] || 0];
  return [d.defense || 0, d.defense || 0];
}
function npcDefense(d) { return npcDefensePair(d)[0]; }

const nonZeroDef = recs.filter(r => npcDefense(derivedOf(r)) !== 0).length;
check('resolving defence the CORRECT way yields a non-zero value for at least some NPCs ' +
      '(the old read yielded 0 for all 1430)', nonZeroDef > 0, { nonZero: nonZeroDef });
check('and every NPC resolves a wound threshold > 0 through the shared rule',
      recs.every(r => npcWoundThreshold(derivedOf(r)) > 0), {
        zeroes: recs.filter(r => npcWoundThreshold(derivedOf(r)) === 0).map(r => r.id).slice(0, 4) });

// ── R-PFR-4: the RAW arithmetic, by name ─────────────────────────────────────────────────────
// Required the way `test/npc_bench_store.cjs` already does — the module is CommonJS-aware, so
// re-evaluating its source in a fabricated scope (my first attempt) both duplicates the loader and
// gets the global's name wrong. Use the shipped door.
const BS = require('../lib/library/npc/benchStore.js');
check('BenchStore.minionPoolMax is available to every surface that needs it', typeof BS.minionPoolMax === 'function');
check('RAW (EotE p.399): a group threshold is the SUM of its members — 4 x WT-5 = 20, not 5',
      BS.minionPoolMax(5, 4) === 20, { got: BS.minionPoolMax(5, 4) });
check('RAW: a single minion is its own threshold', BS.minionPoolMax(5, 1) === 5, { got: BS.minionPoolMax(5, 1) });
check('a zero/absent count cannot produce a negative or NaN pool',
      BS.minionPoolMax(5, 0) === 0 && BS.minionPoolMax(0, 4) === 0,
      { zeroCount: BS.minionPoolMax(5, 0), zeroWT: BS.minionPoolMax(0, 4) });

// ── the SOURCE facts: the view calls its shared home, and the defects are gone ────────────────
const view = fs.readFileSync(path.join(ROOT, 'lib/library/npc/view.jsx'), 'utf8');
check('R-PFR-4: ONE wound-threshold resolver exists in the view', /function npcWoundThreshold\(/.test(view));
// RE-POINTED BY THIS LAP, and stated rather than slipped in. C-PFR34-2's browser leg found that the
// two DESKTOP surfaces rendered melee-only under a box labelled "DEFENSE", hiding ranged entirely —
// so the resolver became `npcDefensePair` and all THREE surfaces (phone + two desktop) now read it.
// The assert's INTENT is unchanged and now stronger: ONE implementation, and it returns BOTH values.
check('C-PFR34-2: ONE defence resolver exists in the view, and it returns the PAIR',
      /function npcDefensePair\(/.test(view) && !/function npcDefense\(/.test(view));
// Counted, not merely present: three surfaces, one resolver, no inline pair-building left behind.
// RE-POINTED 2026-09-24 (B-871's deletion ledger, ruling `npc-flip-ledger-switch` R-NFLS-5; the claim KEPT): the phone card and the two
// desktop cards were three surfaces; the dark face's deletion left ONE stat-block tree, whose NpcStatsBlock is the
// only surface that prints the defences. One resolver, one reader, no inline pair-building.
check('C-PFR34-2: the ONE stat-block tree reads it (NpcStatsBlock — the only surface that prints defences), no inline copy',
      (view.match(/npcDefensePair\(d\)/g) || []).length === 1 && /const \[meleeDef, rangedDef\] = npcDefensePair\(d\);/.test(view)
        && !/const defArr =/.test(view),
      { calls: (view.match(/npcDefensePair\(d\)/g) || []).length });
// THE DEFECT ITSELF: a single collapsed DEFENSE box is what dropped the ranged value at >=1024.
check('C-PFR34-2: no surface renders a single collapsed DEFENSE box any more',
      !/label="DEFENSE"/.test(view));
// COUNTED, not merely absent: the expression must survive EXACTLY ONCE — inside the resolver that
// is now its only home. My first version asserted the pattern was gone entirely and reddened on the
// shared function's own body, which is the code being correct. An assert that cannot tell the one
// legitimate occurrence from the five it replaced is measuring the wrong thing.
const wtOccurrences = (view.match(/\(d\.wounds != null \? d\.wounds : d\.woundThreshold\)/g) || []).length;
check('R-PFR-4: the wound-threshold expression exists EXACTLY ONCE — in its shared home (was 5 copies)',
      wtOccurrences === 1, { occurrences: wtOccurrences });
check('R-PFR-4: and the per-record minion variant is gone with them',
      !/r\.derived\.wounds != null \? r\.derived\.wounds : r\.derived\.woundThreshold\)\) \|\| 5/.test(view));
check('R-PFR-3: the desktop stats block no longer reads the key no record carries',
      !/const defense = \(d\.defense != null \? d\.defense : 0\);/.test(view));
// The JSX ATTRIBUTE, not the prose: `showVitals={false}` still appears in two COMMENTS (including
// the one explaining this very fix), and my first assert matched those. Measure the call sites.
const liveFalse = (view.match(/showVitals=\{false\}/g) || []).filter((_, i) => true).length;
const commentFalse = (view.match(/\/\/[^\n]*showVitals=\{false\}/g) || []).length
                   + (view.match(/^\s*\*[^\n]*showVitals=\{false\}/gm) || []).length;
// RE-POINTED 2026-09-24 (B-871's deletion ledger, ruling `npc-flip-ledger-switch` R-NFLS-5; the claim KEPT): the dark tabbed card's
// `const showVitals = context !== 'bench'` is now the tree's prop expression.
check('R-PFR-3: showVitals is DERIVED from the host context, not hardcoded',
      /showVitals=\{ctx !== 'bench'\}/.test(view));
check('R-PFR-3: no LIVE call site hardcodes showVitals={false} (comments about it are fine)',
      liveFalse === commentFalse, { total: liveFalse, inComments: commentFalse });
// ── MINION-DMG: the saved-encounter strip's chip arithmetic, EXECUTED ───────────────────────────
// THIS PAIR OF ASSERTS USED TO BE SOURCE-STRING MATCHES, AND THEY WERE VACUOUS. The second one
// asserted `isMinionLine ? num(m.poolWounds) : num(m.currentWounds)` was present — and it was, and
// it was green, while the defect it claimed to guard was fully alive: the DISCRIMINATOR feeding
// those arms was `num(m.count) > 1`, a COUNT answering a question about TIER. `addMember` seeds
// `count: 1` and `bumpCount` clamps at 1, so a one-minion line took the false arm and read
// `currentWounds` — a field minions never write — and rendered a damaged line as untouched. The
// assert examined the ARMS and never the branch, so a mutant restoring the count key would sail
// through it. That is the class of guard this file already burned itself on twice above (the
// `showVitals` comment match, the wound-threshold over-broad absence assert).
//
// So it now EXECUTES the arithmetic instead of reading it. The block is lifted VERBATIM out of the
// shipped `view.jsx` — extraction failure is itself a red, because a guard that silently stops
// covering its subject is the vacuity being fixed — and run against SEEDED members (R-UNH-1) built
// from real registry records, so nothing here can pass by examining an empty object.
// RE-POINTED 2026-09-24 (B-871's deletion ledger, ruling `npc-flip-ledger-switch` R-NFLS-5; the claim KEPT): the dark strip was deleted;
// the paper ENCOUNTERS list (frames B1–B3) carries the same chips, reading CURRENT / THRESHOLD (R-NPC-5d). The
// block is lifted VERBATIM from it, with the hurt test and the label read out of its JSX, and run as before.
const stripSrc = (view.match(
  /const num = \(v\) => \{ const n = parseInt\(v, 10\); return isNaN\(n\) \|\| n < 0 \? 0 : n; \};\s*const wt = npcWoundThreshold\(rend && rend\.derived\);[\s\S]*?const cur = minion \? num\(m\.poolWounds\) : BenchStore\.clampCurrent\(num\(m\.currentWounds\), wt\);/) || [])[0];
const chipLabelSrc = (view.match(/<span data-npc-chip-val="1">\{([^{}]*)\}<\/span>/) || [])[1];
const chipHurtSrc = (view.match(/className="nl-mchip" data-hurt=\{([^{}?]*) \? '1' : '0'\}/) || [])[1];
check('MINION-DMG: the strip\'s chip arithmetic is still where this guard reads it from ' +
      '(extraction failed → re-point this guard, do not delete it)',
      !!stripSrc && !!chipLabelSrc && !!chipHurtSrc, { block: !!stripSrc, label: !!chipLabelSrc, hurt: !!chipHurtSrc });

// The strip's own scope, reproduced exactly: `num` and `tierOf` are lifted verbatim from the view
// (view.jsx `const num = ...` inside the map, and `const tierOf = ...` above the group-list return),
// `rend`/`BenchStore`/`npcWoundThreshold` are injected the way the component's closure supplies them.
const stripNum = (v) => { const n = parseInt(v, 10); return isNaN(n) || n < 0 ? 0 : n; };
const runChip = (stripSrc && chipLabelSrc && chipHurtSrc) ? new Function('m', 'deps', `
  const { tierOf, npcWoundThreshold, BenchStore, rend } = deps;
  ${stripSrc}
  return { maxW: mx, cur, hurt: ${chipHurtSrc}, cnt: count, label: ${chipLabelSrc} };
`) : null;

// Seeded from the SHIPPED registry, not invented: a real minion and a real rival, each carrying the
// wound threshold the strip will actually resolve. A hand-made NPC would carry my assumptions.
const minionRec = recs.filter(r => r.tier === 'minion' && npcWoundThreshold(derivedOf(r)) > 0)[0];
const rivalRec = recs.filter(r => r.tier === 'rival' && npcWoundThreshold(derivedOf(r)) > 0)[0];
check('MINION-DMG: seeded from real records — one minion, one rival, both with thresholds',
      !!minionRec && !!rivalRec && npcWoundThreshold(derivedOf(minionRec)) > 0,
      { minion: minionRec && minionRec.id, rival: rivalRec && rivalRec.id });

const chip = (rec, member) => runChip(member, {
  num: stripNum,
  tierOf: () => rec.tier,                       // the view resolves this through the catalog by _source_key
  npcWoundThreshold,
  BenchStore: BS,
  rend: rec,
});

// B-763 (census row 9; ruling npc-library-paper-concept R-NPC-8 "before row 1") — THE SKIP IS LOUD.
// The seven legs below sit behind the verbatim extraction above. When a reformat of `view.jsx` moved
// the block, the extraction check went red ONCE and the seven behavioural legs vanished — the report
// read 1 red where 7 claims had stopped being measured. Every leg now runs through `leg()`, which
// counts it; if the block does not run, each of the seven is reported RED by number, and when it does
// run, the count itself is asserted, so the constant below cannot drift from the legs it stands for.
const MINION_DMG_LEGS = 7;
let _legsRun = 0;
const leg = (label, cond, detail) => { _legsRun++; check(label, cond, detail); };
if (runChip && minionRec && rivalRec) {
  const mWT = npcWoundThreshold(derivedOf(minionRec));
  const rWT = npcWoundThreshold(derivedOf(rivalRec));

  // THE DEFECT ITSELF. One minion, three wounds on the LINE pool, `currentWounds` untouched at 0 —
  // exactly the state benchStore holds after a GM taps the board's + three times on a fresh add.
  // Under the count-keyed discriminator this returned cur:0 / hurt:false and a calm full-health chip.
  const one = chip(minionRec, { count: 1, poolWounds: 3, currentWounds: 0 });
  leg('MINION-DMG: a ONE-minion line reads its damage from the LINE pool (the bug: it read currentWounds)',
        one.cur === 3 && one.maxW === mWT, { got: one, wt: mWT });
  leg('MINION-DMG: …and the chip therefore renders HURT — the orange border/ink the GM scans for',
        one.hurt === true, { got: one });
  // RE-POINTED (claim kept — the label shows the damage, never stuck at full): paper reads CURRENT / THRESHOLD.
  leg('MINION-DMG: …and its label shows the damage — CURRENT / THRESHOLD, not stuck at full',
        one.label === '3/' + mWT, { got: one.label, expected: '3/' + mWT });

  // An UNDAMAGED one-minion line must still read calm — otherwise the assert above would pass for a
  // mutant that simply hardcoded `hurt = true`.
  const oneCalm = chip(minionRec, { count: 1, poolWounds: 0, currentWounds: 0 });
  leg('MINION-DMG: an undamaged one-minion line stays calm (hurt is measured, not hardcoded)',
        oneCalm.hurt === false && oneCalm.label === '0/' + mWT, { got: oneCalm });

  // R-PFR-4 defect 1, kept live: the squad threshold is the SUM (EotE p.399), via the shared fn.
  const squad = chip(minionRec, { count: 4, poolWounds: 7, currentWounds: 0 });
  leg('R-PFR-4: a ×4 squad\'s threshold is the SUM of its members, and its pool damage shows',
        squad.maxW === BS.minionPoolMax(mWT, 4) && squad.cur === 7 && squad.cnt === 4,
        { got: squad, expected: BS.minionPoolMax(mWT, 4) });

  // The OTHER direction — an over-broad fix (always-minion) would redden here, because a rival's
  // damage lives on `currentWounds` and its `poolWounds` is permanently 0.
  const rival = chip(rivalRec, { count: 1, poolWounds: 0, currentWounds: 4 });
  leg('MINION-DMG: a non-minion line still reads its own currentWounds against its own threshold',
        rival.cur === 4 && rival.maxW === rWT && rival.hurt === true,   // (the dark strip's cnt 0: paper's count is display-only)
        { got: rival, wt: rWT });

  // Old saves predate `count`. The clamp must read them as a line of one, not collapse the pool to 0
  // (minionPoolMax(wt, 0) === 0, which would render the chip as "—" and lose the threshold entirely).
  const legacy = chip(minionRec, { poolWounds: 2, currentWounds: 0 });
  leg('MINION-DMG: a legacy minion member with no `count` reads as a line of ONE, pool intact',
        legacy.maxW === mWT && legacy.cur === 2 && legacy.hurt === true, { got: legacy, wt: mWT });
}

if (!(runChip && minionRec && rivalRec)) {
  for (let i = 1; i <= MINION_DMG_LEGS; i++) {
    check('MINION-DMG leg ' + i + '/' + MINION_DMG_LEGS + ' NOT RUN — the strip block did not extract or the seed '
          + 'failed; a skipped leg is a RED, never a silence (B-763)', false,
          { block: !!runChip, minion: !!minionRec, rival: !!rivalRec });
  }
} else {
  check('B-763: the behavioural block ran all ' + MINION_DMG_LEGS + ' legs (the loud-skip count is honest)',
        _legsRun === MINION_DMG_LEGS, { ran: _legsRun });
}

// The discriminator, pinned at source as well — belt to the executing braces above. A mutant that
// restores the count key reddens the behavioural asserts first; this one names the cause.
check('MINION-DMG: the strip branches on TIER, and the count-as-tier-proxy is gone',
      /const minion = tierOf\(m\) === 'minion';/.test(view) &&
      !/const (isMinionLine|minion) = num\(m\.count\) > 1;/.test(view));
check('R-PFR-4: the saved-encounter strip still multiplies by the line count via the shared fn',
      /const mx = minion \? BenchStore\.minionPoolMax\(wt, count\) : wt;/.test(view));
// ONE `tierOf`, defined ABOVE the group-list early return — the strip is inside that return, so a
// definition below it is in the temporal dead zone and the fix would throw on render.
check('MINION-DMG: exactly ONE tierOf definition, and it is hoisted above the group-list return',
      (view.match(/const tierOf = \(m\) =>/g) || []).length === 1 &&
      view.indexOf('const tierOf = (m) =>') < view.indexOf('  // ── GROUP LIST ──'),
      { defs: (view.match(/const tierOf = \(m\) =>/g) || []).length });

console.log('\npfr34_npc_display: ' + ok + '/' + (ok + fail) + ' PASS' + (fail ? '  (' + fail + ' FAILED)' : ''));
process.exit(fail ? 1 : 0);
