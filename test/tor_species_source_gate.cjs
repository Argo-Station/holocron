/**
 * tor-p3-species — THE BOOK IS THE SWITCH.
 *
 * Ruling `tor-p3-app-ingest-scope` §4 acceptance, with the mechanism set by Jason 2026-08-13:
 * "it's a community sourcebook, so the toggle should be the book. The majority of toggles are
 * books." So the acceptance item reads: a TOR species resolves end-to-end with the book ON, and is
 * ABSENT with it off — both asserted, plus a mutant proving the off-state assertion can bite.
 *
 * WHY THE OFF-STATE HALF IS THE ONE THAT MATTERS. An opt-in source that leaks when it is off is the
 * class defect of every gated-content system: the content is visibly correct, so nobody looks, and
 * the gate is decorative. `Community` is DEFAULT OFF via sources.js groupDefaultOn — that default is
 * the only thing standing between a fan sourcebook and a player who asked for official content, and
 * a default is exactly the kind of thing that is true until someone refactors it.
 *
 * WHAT IT CHECKS
 *   1. the five records are present, with the values read off the page (not a sample — all five)
 *   2. the vocabulary row exists, is Community, and carries the newly-legal `old_republic` era
 *   3. DEFAULT STATE: with no overrides, the book is OFF and all five records filter out
 *   4. OPTED IN: with the book overridden ON, all five records pass the filter
 *   5. the four name-shared records LOSE to their incumbents on `_name_precedence`, so opting in
 *      never shows a player "Dashade" three times
 *   6. MUTATION IS CAPABLE: force the book's group to an official one and leg 3 must go red —
 *      otherwise leg 3 is green because nothing was ever filtered, which is not the same thing
 *
 * Run: node test/tor_species_source_gate.cjs
 */
const path = require('path');
const REPO = path.resolve(__dirname, '..');
const S = require(path.join(REPO, 'lib/shared/sources.js'));
const SPECIES = require(path.join(REPO, 'public/data/canonical/species.json')).species;
const VOCAB = require(path.join(REPO, 'public/data/canonical/books.vocab.json'));

let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? (pass++, console.log('  PASS  ' + m))
                            : (fail++, console.log('  FAIL  ' + m + (d ? ' — ' + d : ''))); };

const BOOK_ID = 'the_old_republic_era_sourcebook';
const BOOK_LABEL = 'The Old Republic: An Era Sourcebook';

// Read off the page, page by page — the fixture is the whole import, not a sample (decision 0035).
const WANT = {
  tor_dashade:        { wt: 12, st: 9,  xp: 75,  chars: [3, 2, 2, 2, 2, 1], abilities: 2, page: 6 },
  tor_echani:         { wt: 10, st: 11, xp: 100, chars: [2, 2, 2, 2, 2, 2], abilities: 1, page: 7 },
  tor_miraluka:       { wt: 9,  st: 10, xp: 100, chars: [2, 2, 2, 2, 3, 1], abilities: 1, page: 8 },
  tor_rattataki:      { wt: 12, st: 9,  xp: 100, chars: [2, 2, 2, 2, 2, 2], abilities: 1, page: 9 },
  tor_sith_pureblood: { wt: 10, st: 11, xp: 95,  chars: [2, 2, 2, 3, 1, 2], abilities: 0, page: 10 },
};
const ORDER = ['brawn', 'agility', 'intellect', 'cunning', 'willpower', 'presence'];
const IDS = Object.keys(WANT);

// ── 1. the records, by value ──────────────────────────────────────────────────────────────────
for (const id of IDS) {
  const r = SPECIES[id];
  const w = WANT[id];
  if (!r) { ok(false, `${id} is in the registry`); continue; }
  const chars = ORDER.map((k) => r.characteristics[k]);
  ok(r.wound_threshold_base === w.wt && r.strain_threshold_base === w.st && r.starting_xp === w.xp
     && JSON.stringify(chars) === JSON.stringify(w.chars)
     && (r.special_abilities || []).length === w.abilities
     && (r.sources || []).length === 1 && r.sources[0] === BOOK_ID   // B-336 species wave (ADDENDUM 62): the KEY
     && r._provenance === 'community',
     `${id}: WT ${w.wt} / ST ${w.st} / XP ${w.xp} / ${w.chars.join('·')} / ${w.abilities} abilities, sourced + community (v0.8 p${w.page})`,
     JSON.stringify({ wt: r.wound_threshold_base, st: r.strain_threshold_base, xp: r.starting_xp, chars, ab: (r.special_abilities || []).length }));
}

// Exactly one grants a FLAT rank; the other four grant a CHOICE and must not have been flattened
// into one (R-B176's shape, bound onto this lap by R-P3A-2).
ok(IDS.filter((id) => (SPECIES[id].starting_skills || []).length > 0).length === 1
   && IDS.filter((id) => (SPECIES[id].skill_choice_grants || []).length > 0).length === 4,
   'one flat skill grant (Miraluka), four CHOICE grants left as choices');

// ── 2. the vocabulary row ─────────────────────────────────────────────────────────────────────
const row = (VOCAB.entries || []).find((e) => e.id === BOOK_ID);
ok(!!row && row.group === 'Community' && row.line === null,
   'the book has a vocabulary row, group Community, line null');
ok(!!row && row.era === 'old_republic',
   'the row carries the newly-legal `old_republic` era');
ok(!!row && (row.aliases || []).includes(row.label) && row.label === BOOK_LABEL,
   'the row carries its own label in aliases, so the records\' `sources` string resolves');

// ── 3/4. the switch, both ways ────────────────────────────────────────────────────────────────
const IDX = S.buildIndex(VOCAB);
const recordsOf = (ids) => ids.map((id) => SPECIES[id]);
function visible(state) {
  const off = S.resolvedOff(IDX, state);
  return recordsOf(IDS).filter((r) => S.isActiveWith(r, IDX, off)).length;
}
const DEFAULT_STATE = {};                                   // a player who has chosen nothing
const OPTED_IN = { override: { [BOOK_ID]: true } };

ok(visible(DEFAULT_STATE) === 0,
   'DEFAULT: the book is off, so all five records are filtered out',
   `${visible(DEFAULT_STATE)} leaked`);
ok(visible(OPTED_IN) === IDS.length,
   'OPTED IN: with the book on, all five records pass the filter',
   `${visible(OPTED_IN)}/${IDS.length}`);

// ── 5. opting in must not show one name three times ───────────────────────────────────────────
const SHARED = ['tor_dashade', 'tor_echani', 'tor_miraluka', 'tor_rattataki'];
const losers = SHARED.filter((id) => {
  const mine = SPECIES[id]._name_precedence;
  const rivals = Object.values(SPECIES)
    .filter((r) => r.name === SPECIES[id].name && r.id !== id)
    .map((r) => r._name_precedence);
  return !(rivals.length && rivals.every((p) => p < mine));   // lower wins
});
ok(losers.length === 0,
   'the four name-shared records rank BEHIND their incumbents, so the duplicate never shows',
   losers.join(','));
ok(Object.values(SPECIES).filter((r) => r.name === 'Sith Pureblood').length === 1,
   'the one genuinely new species is unique and owns its own name');

// ── 6. the mutant: leg 3 must be capable of failing ───────────────────────────────────────────
// Flip the row's group to an official one in a COPY of the vocabulary. If leg 3 still reads 0, it
// was never measuring the gate — it was measuring an empty set, and its green meant nothing.
const mutantVocab = JSON.parse(JSON.stringify(VOCAB));
mutantVocab.entries.find((e) => e.id === BOOK_ID).group = 'Supplement';
const mutantIdx = S.buildIndex(mutantVocab);
const mutantOff = S.resolvedOff(mutantIdx, DEFAULT_STATE);
const leaked = recordsOf(IDS).filter((r) => S.isActiveWith(r, mutantIdx, mutantOff)).length;
ok(leaked === IDS.length,
   `MUTATION IS CAPABLE: making the book official leaks all ${IDS.length} into the default view `
   + `(got ${leaked}) — so the off-state assert above is an outcome, not an empty set`);

console.log(`\ntor species source gate: ${fail ? `${fail} FAIL` : 'ALL PASS'} (${pass} pass, ${fail} fail)`);
process.exit(fail ? 1 : 0);
