/**
 * Guard — a FLAT derived talent granted by BOTH a species and a tree counts ONCE.
 *
 * Ruling `csg-grant-fidelity-data` R-GFD-2. CSG's Sakiyan grants Superior Reflexes
 * ({meleeDefenseBonus, ranked:false}), which retired the old invariant that no species
 * grants a non-ranked derived talent. Species bonuses are summed separately and then ADDED
 * to the already-summed persisted tree bonuses, so without a cross-source rule a Sakiyan who
 * also takes Superior Reflexes in a tree gets +2 melee defence where RAW gives +1.
 *
 * The two halves are deliberately opposite, and that is the point:
 *   NON-RANKED (flat) -> counts once across sources        (Superior Reflexes)
 *   RANKED            -> stacks across sources             (Enduring)
 * A guard that only checked the first would be satisfied by a fix that broke the second.
 */
const path = require('path');
const CR = require(path.join(__dirname, '..', 'lib', 'shared', 'charResolve.js'));

let pass = 0, fail = 0;
const ok = (name, got, want) => {
  const good = got === want;
  good ? pass++ : fail++;
  console.log(`  [${good ? 'PASS' : 'FAIL'}] ${name}${good ? '' : `  got ${got}, want ${want}`}`);
};

// Minimal registry: only what the derived-effects map needs to resolve.
const charbuild = {
  species: {
    csg_sakiyan: { id: 'csg_sakiyan', name: 'Sakiyan',
      starting_talents: [{ talent: 'expert_tracker', ranks: 1 }, { talent: 'superior_reflexes', ranks: 1 }] },
    csg_neti:    { id: 'csg_neti', name: 'Neti', starting_talents: [{ talent: 'enduring', ranks: 2 }] },
  },
  talents: {},
};
const sheet = (speciesId, treeTalents) => ({
  speciesId,
  talents: treeTalents,
  characteristics: { brawn: 2, willpower: 2 },
  derivedBonuses: CR.derivedBonusesFromTalents
    ? CR.derivedBonusesFromTalents(treeTalents.flatMap(t => Array(t.rank || 1).fill(t.id)), charbuild.talents)   // F-100 R-FEGC-1: registry required
    : null,
});

// --- 1. FLAT talent in BOTH sources counts once -----------------------------
const both = CR.computeDerived(sheet('csg_sakiyan', [{ id: 'superior_reflexes', rank: 1 }]), null, charbuild);
ok('flat talent from species + tree -> +1 melee defence (not +2)', both.meleeDefense, 1);

// --- 2. species alone still grants it ---------------------------------------
const speciesOnly = CR.computeDerived(sheet('csg_sakiyan', []), null, charbuild);
ok('flat talent from species alone -> +1', speciesOnly.meleeDefense, 1);

// --- 3. tree alone still grants it (species half must not suppress it) ------
const treeOnly = CR.computeDerived(sheet('csg_neti', [{ id: 'superior_reflexes', rank: 1 }]), null, charbuild);
ok('flat talent from tree alone -> +1', treeOnly.meleeDefense, 1);

// --- 4. RANKED still STACKS across sources (the opposite half) --------------
const ranked = CR.computeDerived(sheet('csg_neti', [{ id: 'enduring', rank: 1 }]), null, charbuild);
ok('ranked talent species(2) + tree(1) -> +3 soak (stacks)', ranked.soak - 2 /* brawn */, 3);

console.log(`\nspecies derived-talent dedup guard: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
