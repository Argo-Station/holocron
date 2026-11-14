#!/usr/bin/env node
/**
 * char_resolve_derived.cjs — STANDING guard for computeDerived (CS-2 / R-DAR).
 *
 * Proves the resolve-at-render derived math + the R-DAR1 fallback law, on hand-anchored inputs
 * (pure — no registries needed):
 *   1. Base character: soak = brawn + soakBonus (no armor); thresholds = speciesBase + char + bonus.
 *   2. Armored: equipped-armor soak folds into soak LIVE (the fix).
 *   3. Armor swapped: swapping armor changes soak by construction (the bug this lap kills).
 *   4. Toughened-style bonus: a +wound bonus lands in woundThreshold.
 *   5. F&D force grant: forceRating = forceRatingBase.
 *   6. Legacy fallback (R-DAR1): a record with NO derivedBonuses returns its `derived` snapshot
 *      verbatim — no throw, no recompute distortion (old saves + pregens stay exact).
 *   7. B-736 THE THRESHOLDS FREEZE AT CREATION — see the block above section 7 below for what this
 *      guard is re-pointed FROM and why the old pin could not see the defect.
 *
 * Run:  node test/char_resolve_derived.cjs
 */
const CR = require('../lib/shared/charResolve.js');

let failures = 0;
function check(label, cond) {
  if (cond) { console.log('  PASS  ' + label); }
  else { failures += 1; console.error('  FAIL  ' + label); }
}

// A modern (post-CS-2) record: persists INPUTS, not the snapshot.
function modernSheet(over) {
  return Object.assign({
    characteristics: { brawn: 3, willpower: 2 },
    derivedBonuses: { soakBonus: 0, woundThresholdBonus: 0, strainThresholdBonus: 0, meleeDefenseBonus: 0, rangedDefenseBonus: 0 },
    forceRatingBase: 0,
    woundBase: 10, strainBase: 10,
  }, over || {});
}
const armor = (soak, defense) => ({ armor: { soak: soak, defense: defense || 0 } });

function main() {
  // 1. Base character — no armor.
  const d1 = CR.computeDerived(modernSheet(), null);
  check('base: soak = brawn + soakBonus (3)', d1.soak === 3);
  // B-736 — READ THESE TWO FOR WHAT THEY ARE. `modernSheet` carries NO `characteristicsAtCreation`, so
  // these exercise the absent-field FALLBACK (Addendum 1 (2): a pre-ruling record reads exactly what it
  // reads today). They are NOT the freeze, and they cannot be: both the wrong formula and the right one
  // return 13 here, which is precisely why the old pin stayed green while the app was wrong. Section 7
  // is where the rule is held. Do not "strengthen" these by adding a creation block — that would delete
  // the only coverage the fallback branch has.
  check('base: woundThreshold = woundBase + brawn (13) — absent creation field → LIVE fallback (B-736)', d1.woundThreshold === 13);
  check('base: strainThreshold = strainBase + willpower (12) — same fallback branch', d1.strainThreshold === 12);
  check('base: defense = 0, forceRating = 0', d1.meleeDefense === 0 && d1.rangedDefense === 0 && d1.forceRating === 0);

  // 2. Armored — equipped armor soak folds in LIVE.
  const d2 = CR.computeDerived(modernSheet(), armor(2));
  check('armored: soak = brawn + armorSoak + soakBonus (5)', d2.soak === 5);
  check('armored: thresholds unchanged by armor', d2.woundThreshold === 13 && d2.strainThreshold === 12);

  // 3. Armor swapped — soak differs by construction (the bug this lap kills).
  const light = CR.computeDerived(modernSheet(), armor(1));
  const heavy = CR.computeDerived(modernSheet(), armor(4));
  check('armor swap: soak tracks the equipped armor (4 vs 7)', light.soak === 4 && heavy.soak === 7 && heavy.soak - light.soak === 3);

  // 4. Toughened-style bonus — +2 wound bonus lands in the threshold.
  const d4 = CR.computeDerived(modernSheet({ derivedBonuses: { soakBonus: 1, woundThresholdBonus: 2, strainThresholdBonus: 0, meleeDefenseBonus: 1, rangedDefenseBonus: 0 } }), armor(2));
  check('bonuses: soak (3+2+1=6), wound (10+3+2=15), melee def (1)', d4.soak === 6 && d4.woundThreshold === 15 && d4.meleeDefense === 1);

  // 4b. R-ADEF1 — armor Defense raises BOTH melee and ranged defense (+ their bonuses).
  const adef = CR.computeDerived(modernSheet({ derivedBonuses: { soakBonus: 0, woundThresholdBonus: 0, strainThresholdBonus: 0, meleeDefenseBonus: 1, rangedDefenseBonus: 0 } }), armor(2, 1));
  check('R-ADEF1: armor defense(1) folds into melee(1+1=2) AND ranged(0+1=1)', adef.meleeDefense === 2 && adef.rangedDefense === 1);
  const adef0 = CR.computeDerived(modernSheet(), armor(2, 0));
  check('R-ADEF1: no armor defense → both defenses stay at bonus (0)', adef0.meleeDefense === 0 && adef0.rangedDefense === 0);

  // 5. F&D force grant — forceRating comes from forceRatingBase.
  const d5 = CR.computeDerived(modernSheet({ forceRatingBase: 1 }), null);
  check('force: forceRating = forceRatingBase (1)', d5.forceRating === 1);

  // 6. Legacy fallback (R-DAR1) — NO derivedBonuses → return the snapshot verbatim.
  const legacy = { characteristics: { brawn: 3, willpower: 2 }, derived: { soak: 99, woundThreshold: 42, strainThreshold: 41, meleeDefense: 7, rangedDefense: 6, forceRating: 2 } };
  const dl = CR.computeDerived(legacy, armor(5, 3));  // armor soak AND defense MUST be ignored under fallback
  check('fallback: returns the legacy snapshot verbatim (soak 99, melee-def 7, not recomputed)', dl.soak === 99 && dl.woundThreshold === 42 && dl.meleeDefense === 7 && dl.forceRating === 2);
  check('fallback: no throw on a bare/empty record', (function () { try { CR.computeDerived({}, null); CR.computeDerived(null, null); return true; } catch (e) { return false; } })());

  // ══ 7. B-736 — THE WOUND AND STRAIN THRESHOLDS FREEZE AT CREATION ════════════════════════════
  //
  // THE RAW, and it is the same sentence in all three core rulebooks: starting wound
  // threshold is the species' wound threshold plus Brawn (as it stands after
  // starting XP is spent). Once that value is set, later Brawn gains
  // leave the wound threshold alone — it grows only by buying
  // talents such as Toughened. The strain sentence is parallel, with Willpower and Grit.
  //   EotE p.94 · AoR p.104 · FaD p.104.
  // (Those three pages and no others. `test/` is outside scripts/raw_citation_page_audit.py's SCAN
  // list, so cites in here are unaudited by construction; the other wrong cites in the guard suite are
  // B-749's class, deliberately not touched from this row — ruling `threshold-freezing-shape` §5.)
  //
  // WHAT THIS GUARD WAS RE-POINTED FROM, because that is the whole reason the defect shipped. The base
  // checks in section 1 assert `woundThreshold === 13` on a sheet whose LIVE characteristics are also
  // its CREATION ones. Both the wrong formula (live Brawn) and the right one (frozen Brawn) return 13
  // there, so the pin could not tell them apart and stayed green while the app computed thresholds off
  // live characteristics. Section 1 is kept — it now exercises the ABSENT-field fallback, which is a
  // real law of its own (Addendum 1 (2)) — and the legs below are what actually hold the rule.
  //
  // THE SHAPE, ruled R-TF-1: the persisted thing is the creation CHARACTERISTIC
  // (`sheet.characteristicsAtCreation`), never the threshold — a threshold is derived and must still
  // move for Toughened and Grit, which leg 7c is here to prove.

  // 7a. THE FROZEN LEG — the audit's own before/after fixture, and the whole row.
  //     brawn 3→4 and willpower 3→4 must give wound 13→13, strain 13→13, soak 3→4.
  const frozenBase = { characteristics: { brawn: 3, willpower: 3 }, characteristicsAtCreation: { brawn: 3, willpower: 3 } };
  const frozenRaised = { characteristics: { brawn: 4, willpower: 4 }, characteristicsAtCreation: { brawn: 3, willpower: 3 } };
  const f0 = CR.computeDerived(modernSheet(frozenBase), null);
  const f1 = CR.computeDerived(modernSheet(frozenRaised), null);
  check('B-736 frozen: baseline reads wound 13 · strain 13 · soak 3',
        f0.woundThreshold === 13 && f0.strainThreshold === 13 && f0.soak === 3);
  check('B-736 frozen: brawn 3→4 does NOT move woundThreshold (13→13) — EotE p.94',
        f1.woundThreshold === 13);
  check('B-736 frozen: willpower 3→4 does NOT move strainThreshold (13→13) — EotE p.94',
        f1.strainThreshold === 13);
  check('B-736 frozen: soak DOES move with live brawn (3→4) — soak has no freezing sentence, R-TF-3',
        f1.soak === 4 && f1.soak - f0.soak === 1);

  // 7b. R-TF-3 SCOPE — forceRating is NOT frozen by association. A Force rating legitimately rises
  //     after creation, so it must keep reading forceRatingBase + bonuses with no creation field
  //     anywhere in its path. Asserted positively so a future "freeze everything" edit reddens here.
  const frOnly = CR.computeDerived(modernSheet(Object.assign({ forceRatingBase: 1 }, frozenRaised)), null);
  check('B-736 scope: forceRating stays live/floored, untouched by the freeze (1)', frOnly.forceRating === 1);

  // 7c. THE TALENT LEG, KEPT — and WHY it is kept rather than merged into section 4's bonus case:
  //     section 4 proves the bonus lands; this proves it still lands ON A FROZEN SHEET. If the freeze
  //     had been implemented by persisting the THRESHOLD (R-TF-1's rejected shape (a)) or by freezing
  //     the whole sum, Toughened and Grit would stop working and every other leg here would still pass.
  //     This is the leg that says we froze the characteristic and not the threshold.
  const tough = CR.computeDerived(modernSheet(Object.assign({}, frozenRaised, {
    derivedBonuses: { soakBonus: 0, woundThresholdBonus: 2, strainThresholdBonus: 1, meleeDefenseBonus: 0, rangedDefenseBonus: 0 },
  })), null);
  check('B-736 talents: Toughened(+2) still raises a FROZEN woundThreshold (10+3+2=15)', tough.woundThreshold === 15);
  check('B-736 talents: Grit(+1) still raises a FROZEN strainThreshold (10+3+1=14)', tough.strainThreshold === 14);

  // 7d. THE MIGRATION SEQUENCE — three steps, Addendum 1, matching Jason's answer to §4
  //     ("As recommended" = FREEZE AT MIGRATION: nobody loses the point they have today).
  //     The record is PRE-RULING (no creation field) and its Brawn was already raised to 4 by a
  //     Dedication buy that happened before the fix existed.
  const preRuling = modernSheet({ characteristics: { brawn: 4, willpower: 4 } });
  const step1 = CR.computeDerived(preRuling, null);
  check('B-736 migration 1: a pre-ruling record reads the SAME threshold as today (wound 14 · strain 14) — absent field falls back to LIVE, nobody loses a point',
        step1.woundThreshold === 14 && step1.strainThreshold === 14);

  //     Step 2 — buy Dedication once more. This reproduces `buyTalent`'s Dedication branch through the
  //     SAME shared function that branch calls: stamp from the PRE-patch characteristics, then +1.
  //     Nothing here is a copy of the app's logic — `creationCharacteristicsStamp` IS the app's logic,
  //     which is what makes leg 7e a real bite rather than theatre.
  function buyDedication(rec, key) {
    const patch = {};
    const stamp = CR.creationCharacteristicsStamp(rec);          // stamp BEFORE raise
    if (stamp) patch.characteristicsAtCreation = stamp;
    const chars = Object.assign({}, rec.characteristics || {});
    chars[key] = Math.min(CR.CHARACTERISTIC_CAP, (Number(chars[key]) || 0) + 1);
    patch.characteristics = chars;
    return Object.assign({}, rec, patch);                        // one atomic patch
  }
  const afterBuy = buyDedication(preRuling, 'brawn');
  const step2 = CR.computeDerived(afterBuy, null);
  check('B-736 migration 2: the field is now ON the record, stamped from the PRE-patch value (brawn 4)',
        !!afterBuy.characteristicsAtCreation && afterBuy.characteristicsAtCreation.brawn === 4);
  check('B-736 migration 2: brawn actually rose to 5 (the buy still does its job)',
        afterBuy.characteristics.brawn === 5);
  check('B-736 migration 3: the threshold does NOT move on that second buy (14→14) — this is the defect, gone',
        step2.woundThreshold === 14);

  //     And it stays frozen for every buy after — a third Dedication must not move it either, which is
  //     what "never re-stamped" buys us.
  const afterBuy2 = buyDedication(afterBuy, 'brawn');
  check('B-736 migration: a THIRD buy still does not move it, and the stamp is never rewritten (still 4)',
        CR.computeDerived(afterBuy2, null).woundThreshold === 14
        && afterBuy2.characteristicsAtCreation.brawn === 4
        && afterBuy2.characteristics.brawn === 6);

  // 7e. THE TRAP NEGATIVE (Addendum 1's central warning, asserted rather than trusted). With the stamp
  //     REMOVED and only the read fallback left, the second Dedication buy MUST lift the threshold —
  //     "a freeze that is never persisted is the present behaviour wearing the new field's name". This
  //     leg proves the suite can SEE that failure, so the negative is checked here on a stamp-less
  //     simulation rather than only asserted by hand in the gate.
  function buyDedicationNoStamp(rec, key) {
    const chars = Object.assign({}, rec.characteristics || {});
    chars[key] = Math.min(CR.CHARACTERISTIC_CAP, (Number(chars[key]) || 0) + 1);
    return Object.assign({}, rec, { characteristics: chars });   // fallback only — no stamp
  }
  const trapped = buyDedicationNoStamp(preRuling, 'brawn');
  check('B-736 trap: WITHOUT the stamp the second buy DOES lift the threshold (14→15) — so leg 7d is load-bearing, not tautological',
        CR.computeDerived(trapped, null).woundThreshold === 15);

  // 7f. R-TF-2's absent-tolerance, per KEY and not just per block: a half-written block must never
  //     read as a frozen 0. A block carrying only brawn leaves strain on the live fallback.
  const halfBlock = CR.computeDerived(modernSheet({
    characteristics: { brawn: 4, willpower: 4 }, characteristicsAtCreation: { brawn: 3 },
  }), null);
  check('B-736 tolerance: a partial block freezes brawn (wound 13) and leaves willpower on the live fallback (strain 14) — absence is never 0',
        halfBlock.woundThreshold === 13 && halfBlock.strainThreshold === 14);
  check('B-736 tolerance: a non-object creation block is ignored, not thrown on',
        (function () { try { return CR.computeDerived(modernSheet({ characteristicsAtCreation: 'legacy junk' }), null).woundThreshold === 13; } catch (e) { return false; } })());

  // 7g. THE STAMP'S OWN CONTRACT — the two different reasons it returns null.
  check('B-736 stamp: an unstamped record yields a copy of its live characteristics',
        (function () { const s = CR.creationCharacteristicsStamp({ characteristics: { brawn: 3, willpower: 2 } }); return !!s && s.brawn === 3 && s.willpower === 2; })());
  check('B-736 stamp: an ALREADY-stamped record yields null — never re-stamped, so the frozen value cannot drift up',
        CR.creationCharacteristicsStamp({ characteristics: { brawn: 5 }, characteristicsAtCreation: { brawn: 3 } }) === null);
  check('B-736 stamp: nothing to copy yields null, not an invented zero block',
        CR.creationCharacteristicsStamp({}) === null && CR.creationCharacteristicsStamp(null) === null);
  check('B-736 stamp: the returned block does not ALIAS the record (mutating the copy cannot edit history)',
        (function () { const rec = { characteristics: { brawn: 3 } }; const s = CR.creationCharacteristicsStamp(rec); s.brawn = 99; return rec.characteristics.brawn === 3; })());

  // 7h. STRUCTURAL PIN — the stamp's CALL SITE, which node cannot execute. `buyTalent` lives in
  //     player/app.jsx; this asserts its Dedication branch still routes through the shared stamp, so
  //     deleting the call is caught here instead of only by a browser smoke. Addendum 1 (1): this is
  //     the ONLY post-creation writer of a characteristic, so it is the only site that needs the pin.
  const appSrc = require('fs').readFileSync(require('path').join(__dirname, '..', 'player', 'app.jsx'), 'utf8');
  const dedBranch = appSrc.slice(appSrc.indexOf("talentKey === 'dedication' && charChoice"));
  const dedBody = dedBranch.slice(0, dedBranch.indexOf('patch.characteristics = chars;'));
  check('B-736 call site: buyTalent\'s Dedication branch stamps via CharResolve.creationCharacteristicsStamp BEFORE the raise',
        dedBody.indexOf('CharResolve.creationCharacteristicsStamp(sheet)') !== -1
        && dedBody.indexOf('patch.characteristicsAtCreation') !== -1);
  // RE-POINTED by ruling `reentry-trade-deltas-shape` ADDENDUM 1 (R-RTD-5/R-RTD-6, board row B-754),
  // and DISCLOSED rather than quietly rewritten. The claim is unchanged — normalizeCreated still
  // persists the block at creation — but the MECHANISM it was pinned to is the exact line that ruling
  // retired. It grepped charResolve.js for the literal
  //     characteristicsAtCreation: Object.assign({}, chars)
  // and that UNCONDITIONAL write from the live characteristics IS B-754: a character re-entered through
  // EDIT IN CREATOR came back stamped at its Dedication-inflated live Brawn and its wound threshold rose
  // by one, permanently, for having been edited. The write now subtracts the post-creation gain the
  // reverse transform measured (`characteristicsAtCreation: charsAtCreation`).
  // The re-point makes it BEHAVIOURAL instead of textual, which is strictly stronger: a fresh creation
  // carries no gain block, so the block must still come back EQUAL to the live characteristics — the
  // property the old grep was standing in for — and renaming the local can no longer satisfy it.
  (function b736CreationWriterStillWrites() {
    const chars = { brawn: 3, agility: 2, intellect: 4, cunning: 2, willpower: 3, presence: 2 };
    const made = CR.normalizeCreated({
      gameLine: 'eote', identity: { name: 'Creation Writer' }, narrative: { backstory: '' },
      species: null, career: null, specializations: [], characteristics: chars,
      skills: {}, talents: {}, forcePowers: {}, mechanic: null,
      gearLedger: { startingCredits: 500, credits: 500, inventory: [] }, pocketMoney: null,
      motivations: { strength: null, flaw: null, desire: null, fear: null },
    }, null, null, { charbuild: { careers: {}, species: {}, specializations: {}, talents: {} } }, 'FullCreator',   // talents: F-100 R-FEGC-1 — the resolver needs the registry (throws without it)
      { registries: {}, activeMods: [], portraitFor: () => null });
    check('B-736 call site: normalizeCreated persists characteristicsAtCreation at creation (re-pointed '
      + 'behaviourally by R-RTD-6 — a FRESH creation carries no post-creation gain, so the block equals live)',
      !!made.characteristicsAtCreation
      && JSON.stringify(made.characteristicsAtCreation) === JSON.stringify(chars));
    check('B-736 call site: …and the block is a COPY, not an alias of the creator state\'s characteristics',
      made.characteristicsAtCreation !== chars);
  })();

  // ── B-23: species starting talents derive at render + stack (charbuild passed as 3rd arg) ──
  // A hand-built charbuild: Droid grants Enduring (ranked +1 soak); Sluissi grants a talent by
  // option pick (Gearhead / Solid Repairs). Enduring is the derived one (soak).
  const CB = {
    species: {
      droid:   { id: 'droid', name: 'Droid', starting_talents: [{ talent: 'enduring', ranks: 1 }] },
      sluissi: { id: 'sluissi', name: 'Sluissi', option_choices: [{ name: 'Talents', options: [
        { id: 'gearhead', name: 'Gearhead', starting_talents: [{ talent: 'gearhead', ranks: 1 }] },
        { id: 'solid_repairs', name: 'Solid Repairs', starting_talents: [{ talent: 'solid_repairs', ranks: 1 }] },
      ] }] },
      aleena:  { id: 'aleena', name: 'Aleena', starting_talents: [{ talent: 'durable', ranks: 1 }] },  // non-derived
    },
    talents: { enduring: { id: 'enduring', name: 'Enduring', ranked: true }, gearhead: { id: 'gearhead', name: 'Gearhead' }, solid_repairs: { id: 'solid_repairs', name: 'Solid Repairs' }, durable: { id: 'durable', name: 'Durable' } },
  };

  // B-23.1 — a Droid with NO tree talents: species Enduring lands → +1 soak (base brawn 3 → 4).
  const droidBase = modernSheet({ speciesId: 'droid', talents: [] });
  check('B-23: Droid species Enduring lands → soak = brawn+1 (4)', CR.computeDerived(droidBase, null, CB).soak === 4);
  check('B-23: without charbuild (legacy path) the species bonus does NOT apply → soak 3', CR.computeDerived(droidBase, null).soak === 3);

  // B-23.2 — STACKING: species Enduring 1 + a tree Enduring 1 → +2 soak (5). RAW: ranked stacks.
  const droidStack = modernSheet({ speciesId: 'droid', talents: [{ id: 'enduring', rank: 1 }], derivedBonuses: { soakBonus: 1, woundThresholdBonus: 0, strainThresholdBonus: 0, meleeDefenseBonus: 0, rangedDefenseBonus: 0 } });
  check('B-23: species Enduring + tree Enduring STACK → soak = brawn+2 (5)', CR.computeDerived(droidStack, null, CB).soak === 5);

  // B-23.3 — species name→id resolution (no speciesId, only species name).
  const droidByName = modernSheet({ species: 'Droid', talents: [] });
  check('B-23: species resolves by NAME too (Droid → +1 soak)', CR.computeDerived(droidByName, null, CB).soak === 4);

  // B-23.4 — option pick (Sluissi Gearhead): non-derived talent → no soak change, but grants present.
  const sluissiPick = modernSheet({ speciesId: 'sluissi', talents: [], speciesOptionPicks: { talents: 'gearhead' } });
  const grants = CR.speciesTalentGrants(sluissiPick, CB);
  check('B-23: Sluissi option pick (Gearhead) resolves to its talent grant', grants.length === 1 && grants[0].id === 'gearhead' && grants[0].origin === 'option');
  check('B-23: an ABSENT speciesOptionPicks yields no option grant (R-Y2-1 tolerance)',
        CR.speciesTalentGrants(modernSheet({ speciesId: 'sluissi', talents: [] }), CB).length === 0);

  // B-23.5 — non-derived species talent (Aleena Durable) grants the talent but moves no stat.
  const aleena = modernSheet({ speciesId: 'aleena', talents: [] });
  check('B-23: non-derived species talent (Durable) grants but soak unchanged (3)', CR.computeDerived(aleena, null, CB).soak === 3);
  check('B-23: Durable IS in the species grant list (shows on the sheet)', CR.speciesTalentGrants(aleena, CB).some(g => g.id === 'durable'));

  // B-23.6 — unresolvable legacy species → graceful [] (no throw).
  check('B-23: unknown species → graceful empty grants (no throw)',
        CR.speciesTalentGrants(modernSheet({ species: 'Nonexistent', talents: [] }), CB).length === 0);
  check('B-23: no charbuild → graceful empty grants', CR.speciesTalentGrants(droidBase, null).length === 0);

  console.log('\n' + (failures ? '  ' + failures + ' FAILED' : '  computeDerived guard: ALL PASS'));
  process.exit(failures ? 1 : 0);
}
main();
