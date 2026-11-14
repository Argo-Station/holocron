#!/usr/bin/env node
/**
 * morality_pair_resolver.cjs — R-MEP-1/2 guard (ruling `mechanic-emotional-pair-contract`).
 *
 * fad p.52 lets a player take the Emotional Strength and the Emotional Weakness from two tables
 * SEPARATELY (one roll for the emotional strength and another for
 * the emotional weakness). Before this contract the save stored only the strength and
 * four consumers derived the weakness from its `weakKey` — so a player who departed from the
 * pairing was shown the DEFAULT partner on the sheet, the review, the export and the motivation
 * step. Silently: no error, no missing field, just the wrong word.
 *
 * The contract this pins:
 *
 *   ABSENT `descriptorWeak`  — the player never departed. The weakness is DERIVED from `weakKey`,
 *                              which is B-117's fix and must not regress. Absence MEANS the
 *                              pairing, so every pre-contract save keeps reading correctly.
 *   PRESENT `descriptorWeak` — the player departed. That key wins over `weakKey`, everywhere.
 *   NEVER PRESENT-AND-EQUAL  — re-picking the book's own partner REMOVES the field rather than
 *                              storing the value it would have derived. A save carries the
 *                              override or nothing; that is what makes absence readable.
 *
 * And the layer question, which is the same bug's other half: a Force-sensitive character in an
 * Obligation/Duty campaign keeps Morality on `moralityLayer` while `mechanic` holds the Obligation.
 * All four consumers read `mechanic`, so a two-track pair was invisible to every one of them.
 *
 * Run:  node test/morality_pair_resolver.cjs
 */
const CR = require('../lib/shared/charResolve.js');

let failures = 0;
function check(label, cond, detail) {
  if (cond) { console.log('  PASS  ' + label); }
  else { failures += 1; console.error('  FAIL  ' + label + (detail !== undefined ? '  [' + JSON.stringify(detail) + ']' : '')); }
}

// A miniature of the shipped `morPairs` shape — key/name/weakKey on the strength, key/name on the
// weakness. Deliberately NOT the real registry: this guard pins the RULE, and a rule asserted
// against live data goes green or red for reasons that belong to the data.
const MORPAIRS = {
  strengths: [
    { key: 'BRAVERY', name: 'Bravery', weakKey: 'ANGER', description: 'Courage under danger.' },
    { key: 'COMPASSION', name: 'Compassion', weakKey: 'HATRED', description: 'Feels for others.' },
  ],
  weaknesses: [
    { key: 'ANGER', name: 'Anger', description: 'Answers provocation with force.' },
    { key: 'HATRED', name: 'Hatred', description: 'Nurses the grudge.' },
    { key: 'CRUELTY', name: 'Cruelty', description: 'Takes pleasure in the harm.' },
  ],
};

function moralityChar(descriptor, descriptorWeak) {
  const layer = { type: 'morality', descriptor: descriptor };
  if (descriptorWeak !== undefined) layer.descriptorWeak = descriptorWeak;
  return { mechanic: layer };
}
function twoTrackChar(descriptor, descriptorWeak) {
  const layer = { type: 'morality', descriptor: descriptor };
  if (descriptorWeak !== undefined) layer.descriptorWeak = descriptorWeak;
  // `mechanic` is the OBLIGATION here — that is the whole point of the case.
  return { mechanic: { type: 'obligation', descriptor: 'BOUNTY' }, moralityLayer: layer };
}

console.log('R-MEP-1/2 — the morality pair resolves once, and stores only the departure\n');

// ── 1. ABSENT → DERIVED (B-117's fix must survive this contract) ────────────────────────────────
const derived = CR.moralityPair(moralityChar('BRAVERY'), MORPAIRS);
check('1 absent override → the weakness is DERIVED from weakKey (Bravery → Anger)',
  derived && derived.strength === 'Bravery' && derived.weakness === 'Anger', derived);
check('1 absent override → reported as NOT overridden, so a surface can say which it is showing',
  derived && derived.overridden === false, derived && derived.overridden);

// ── 2. PRESENT → THE PLAYER'S CHOICE WINS, EVERYWHERE ───────────────────────────────────────────
const over = CR.moralityPair(moralityChar('BRAVERY', 'CRUELTY'), MORPAIRS);
check('2 override present → the PLAYER\'S weakness is returned, not weakKey\'s',
  over && over.weakness === 'Cruelty', over && over.weakness);
check('2 override present → the strength is untouched by the departure',
  over && over.strength === 'Bravery', over && over.strength);
check('2 override present → the BOOK\'S partner is still reported, so the surface can print '
  + '"Paired with … on the book\'s own table" against it',
  over && over.pairedKey === 'ANGER', over && over.pairedKey);
check('2 override present → flagged overridden', over && over.overridden === true);

// ── 3. THE TWO-TRACK LAYER — the half that was invisible to all four consumers ───────────────────
const two = CR.moralityPair(twoTrackChar('COMPASSION'), MORPAIRS);
check('3 two-track → the pair is found on `moralityLayer` while `mechanic` holds the Obligation',
  two && two.strength === 'Compassion' && two.weakness === 'Hatred', two);
const twoOver = CR.moralityPair(twoTrackChar('COMPASSION', 'CRUELTY'), MORPAIRS);
check('3 two-track + override → the override is honoured on the layer too',
  twoOver && twoOver.weakness === 'Cruelty', twoOver && twoOver.weakness);

// ── 4. THE WRITE RULE — absence is a rule, not an accident ───────────────────────────────────────
const bravery = MORPAIRS.strengths[0];
const removal = CR.moralityWeakPatch(bravery, 'ANGER');
check('4 re-picking the BOOK\'S partner yields a REMOVAL patch, never the derived value stored',
  Object.prototype.hasOwnProperty.call(removal, 'descriptorWeak')
    && removal.descriptorWeak === undefined, removal);
const departure = CR.moralityWeakPatch(bravery, 'CRUELTY');
check('4 departing yields the override key', departure.descriptorWeak === 'CRUELTY', departure);
check('4 a null pick is a removal too (the surface can clear without knowing the rule)',
  CR.moralityWeakPatch(bravery, null).descriptorWeak === undefined);

// ── 5. NO MORALITY, NO ANSWER — the resolver must not invent one ─────────────────────────────────
check('5 an Obligation-only character resolves to null (no layer, no pair)',
  CR.moralityPair({ mechanic: { type: 'obligation', descriptor: 'BOUNTY' } }, MORPAIRS) === null);
check('5 a morality layer with no descriptor resolves to null, not a half-pair',
  CR.moralityPair({ mechanic: { type: 'morality', descriptor: '' } }, MORPAIRS) === null);
check('5 an unknown strength key resolves to null rather than a pair with an empty name',
  CR.moralityPair(moralityChar('NOT_A_KEY'), MORPAIRS) === null);

// ── 6. THE BITE — this guard has been shown to go RED, and here is the mutation that does it ─────
// A guard that has never been red is not evidence (PRAXIS). The mutation is the exact regression
// this contract exists to prevent: a resolver that ignores `descriptorWeak` and derives anyway.
// Run in-process against a stand-in so the bite is REPRODUCIBLE rather than a story in a comment.
function mutantIgnoresOverride(character, morPairs) {
  const m = character.mechanic;
  const layer = (m && m.type === 'morality') ? m
    : (character.moralityLayer && character.moralityLayer.type === 'morality')
      ? character.moralityLayer : null;
  if (!layer || !layer.descriptor) return null;
  const s = (morPairs.strengths || []).find((x) => x.key === layer.descriptor);
  if (!s) return null;
  const w = (morPairs.weaknesses || []).find((x) => x.key === s.weakKey);   // <- ignores the override
  return { strength: s.name, weakness: w ? w.name : '' };
}
const bitten = mutantIgnoresOverride(moralityChar('BRAVERY', 'CRUELTY'), MORPAIRS);
check('6 THE BITE — a resolver that ignores `descriptorWeak` returns the DERIVED weakness, which '
  + 'is what assert 2 catches; the mutant is shown returning "Anger" where the contract says '
  + '"Cruelty", so assert 2 is known-red-able rather than merely green',
  bitten.weakness === 'Anger' && over.weakness === 'Cruelty',
  { mutant: bitten.weakness, contract: over && over.weakness });

console.log('\nmorality pair resolver (R-MEP-1/2): '
  + (failures === 0 ? 'ALL PASS' : failures + ' FAILED'));
process.exit(failures === 0 ? 0 : 1);
