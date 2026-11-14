#!/usr/bin/env node
/**
 * pregen_card_record_parity.cjs — B-717: the Quick Start CARD and the SHEET it opens are one character.
 *
 * TWO FILES DESCRIBE THE SAME EIGHTEEN CHARACTERS AND NOTHING HAS EVER COMPARED THEM.
 *   · `PREGEN_CHARACTERS` in `player/app.jsx` — the card a player presses, with its name, species,
 *     career, game line, tagline and description.
 *   · `public/data/pregen_sheets.json` — the record that card fetches and persists into the roster.
 * They are keyed by the SAME ids. At the state this guard was written against they disagreed on ELEVEN
 * of eighteen: ten names and one species, and the species reached the PROSE — the bounty hunter's card
 * said "This Mandalorian" over a record whose species is Human, whose `speciesId` is `human`, and whose
 * characteristics and thresholds are Human's. A player pressed one name and received another.
 *
 * WHY THE RECORD IS THE SIDE THAT IS RIGHT (ruling `quickstart-guided-paper-concept` R-QSG-4): the
 * record is what the player RECEIVES, the paper shelf prints it, and it is the side the verification
 * apparatus already cites by name — guards, smokes, gates, rulings and the mockups all name the record's
 * names. The cards were corrected to match. This guard is what stops the two drifting apart again.
 *
 * WHY A PENDING LIST RATHER THAN A HARD BAN (the `creator_css_has_emitters` device). One of the eleven is
 * not a drift but a QUESTION: for `consular` the card reads `Kora Sul` and the record reads `Tidal`, and
 * which of those is the character's name is Jason's call, not an implementer's. Declaring it by name and
 * value costs one line, keeps the guard green, and makes the debt countable. Anything UNDECLARED fails,
 * and a declared pair that stops diverging — or whose either side moves — also fails, so the list cannot
 * rot into a permanent exemption.
 *
 * EVERY SHARED FIELD, NOT A TYPED LIST. The compared field set is the INTERSECTION of the keys the two
 * objects actually carry, computed per id, so a field added to both sides later is covered without
 * anyone remembering to add it here. A floor assert keeps that from going vacuous if a rename shrinks
 * the intersection.
 *
 * Run: node test/pregen_card_record_parity.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass += 1; console.log('  PASS  ' + label); }
  else { fail += 1; console.error('  FAIL  ' + label + (detail !== undefined ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 900)) : '')); }
}

/* DECLARED PENDING — a divergence that is a PRODUCT QUESTION, by id, field and BOTH values, with its
   row. Removing an entry here without reconciling the two files turns this guard red, which is the
   point; so does the pair changing on either side, because that re-opens the question. */
const PENDING = {
  // `consular` — the card names a character, the record names a word. `Kora Sul` is a two-part personal
  //   name in the roster's usual shape; `Tidal` is the roster's THIRD one-word name (beside `Patch` and
  //   `Wicket`, which the two files AGREE on) and is one of the six the repo's own
  //   `scripts/backfill_force_pregens.py` calls "the synthetic ones", so it is authored, not a stub.
  //   Which one the character is called is an editorial call and it is Jason's (B-717 says the record
  //   wins "unless Jason says otherwise"). NEITHER SIDE was touched. B-717.
  // EMPTY SINCE 2026-09-20 — Jason answered it: "Kora Sul". The record was rewritten to match the
  // card, so `consular` no longer diverges and the STALE arm below fired the moment it stopped,
  // which is the arm doing exactly its job. The entry is kept here as a comment because the
  // reasoning is worth more than the line was: `Tidal` was NOT a placeholder — the roster carries
  // two other one-word names both files agree on (`Patch`, `Wicket`) and `backfill_force_pregens.py`
  // calls its six "the synthetic ones" — so this was a name decision and not a defect, which is why
  // B-717 refused to settle it and B-728 carried it to him.
};

/* The FLOOR of the compared field set. Not the whole set — the point is that the set is derived — but
   if a rename on either side drops one of these, the comparison has silently narrowed and this guard
   would go green over less than it was written to cover. */
const MUST_COMPARE = ['id', 'name', 'career', 'species', 'book'];

// ── the cards: the literal out of the SOURCE the bundle is built from ────────────────────────────────
// Parsed with `new Function`, not a regex: the r1_guided_xp_solvency scar is a line-anchored regex that
// covered 14 of 52 rows and reported PASS. The literal is plain data — strings only, no expressions —
// so evaluating it is exactly what esbuild does with it and cannot under-cover.
const app = fs.readFileSync(path.join(ROOT, 'player/app.jsx'), 'utf8');
const DECL = 'const PREGEN_CHARACTERS = [';
const start = app.indexOf(DECL);
if (start === -1) { console.error('  FAIL  PREGEN_CHARACTERS not found in player/app.jsx'); process.exit(1); }
const end = app.indexOf('\n];', start);
if (end === -1) { console.error('  FAIL  PREGEN_CHARACTERS terminator not found'); process.exit(1); }
const CARDS = new Function('return ' + app.slice(start + DECL.length - 1, end + 2))();

const RECORDS = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/pregen_sheets.json'), 'utf8')).characters;

console.log('\n── B-717: the Quick Start card and the record it opens are the same character ──');

// 1 — non-vacuous on both sides. A parse that yields nothing would make every assert below trivially true.
check('the cards parsed (a non-empty roster with an id on every entry)',
  Array.isArray(CARDS) && CARDS.length > 0 && CARDS.every((c) => c && typeof c.id === 'string' && c.id),
  { parsed: Array.isArray(CARDS) ? CARDS.length : null });
check('the records parsed (a non-empty roster with an id on every entry)',
  Array.isArray(RECORDS) && RECORDS.length > 0 && RECORDS.every((r) => r && typeof r.id === 'string' && r.id),
  { parsed: Array.isArray(RECORDS) ? RECORDS.length : null });

// 2 — the two rosters are the same set of ids, and in the same order (the shelf prints the record's
//     register in the cards' order; a silent re-order would reshuffle the shelf under the drawing).
const cardIds = CARDS.map((c) => c.id);
const recIds = RECORDS.map((r) => r.id);
check('every card has a record and every record has a card (same id set, same count)',
  cardIds.length === recIds.length && cardIds.slice().sort().join(',') === recIds.slice().sort().join(','),
  { cardsWithoutRecord: cardIds.filter((i) => !recIds.includes(i)), recordsWithoutCard: recIds.filter((i) => !cardIds.includes(i)) });
check('the two rosters are in the same order',
  cardIds.join(',') === recIds.join(','), { cards: cardIds.join(','), records: recIds.join(',') });

const byId = {};
RECORDS.forEach((r) => { byId[r.id] = r; });

// 3 — THE COMPARISON. Every field both objects carry, per id.
const divergences = [];
const comparedFields = new Set();
CARDS.forEach((c) => {
  const r = byId[c.id];
  if (!r) return;                                        // already failed above; do not double-report
  Object.keys(c).forEach((k) => {
    if (!Object.prototype.hasOwnProperty.call(r, k)) return;
    comparedFields.add(k);
    const cv = c[k], rv = r[k];
    const same = (cv && typeof cv === 'object') ? JSON.stringify(cv) === JSON.stringify(rv) : String(cv) === String(rv);
    if (!same) divergences.push({ key: c.id + '.' + k, id: c.id, field: k, card: cv, record: rv });
  });
});

check('the compared field set is derived and still covers the floor (' + MUST_COMPARE.join(', ') + ')',
  MUST_COMPARE.every((f) => comparedFields.has(f)),
  { compared: [...comparedFields].sort(), missing: MUST_COMPARE.filter((f) => !comparedFields.has(f)) });

const undeclared = divergences.filter((d) => !PENDING[d.key]);
check('no card contradicts the record it opens, on any field they both carry',
  undeclared.length === 0,
  undeclared.length
    ? 'the card and the record disagree, and these are NOT declared pending:\n'
      + undeclared.map((d) => '          ' + d.key + '  card=' + JSON.stringify(d.card) + '  record=' + JSON.stringify(d.record)).join('\n')
      + '\n        THE RECORD IS THE AUTHORITY (R-QSG-4) — correct the card in player/app.jsx, and if the'
      + '\n        card carries the better value, declare the pair in PENDING with its row instead.'
    : null);

// 4 — the list cannot rot, in both directions.
const byKey = {};
divergences.forEach((d) => { byKey[d.key] = d; });
const stalePending = Object.keys(PENDING).filter((k) => !byKey[k]);
check('no PENDING entry is stale (a declared pair that no longer diverges must come off the list)',
  stalePending.length === 0,
  stalePending.length ? 'these no longer diverge, so remove them from PENDING: ' + stalePending.join(', ') : null);

const movedPending = Object.keys(PENDING).filter((k) => byKey[k]
  && (String(byKey[k].card) !== String(PENDING[k].card) || String(byKey[k].record) !== String(PENDING[k].record)));
check('no PENDING pair has MOVED (an exemption covers two named values, never a field in perpetuity)',
  movedPending.length === 0,
  movedPending.length
    ? movedPending.map((k) => k + ' declared card=' + JSON.stringify(PENDING[k].card) + '/record=' + JSON.stringify(PENDING[k].record)
        + ' but reads card=' + JSON.stringify(byKey[k].card) + '/record=' + JSON.stringify(byKey[k].record)).join('; ')
    : null);

check('every PENDING entry names its board row',
  Object.keys(PENDING).every((k) => /^B-\d+$/.test(PENDING[k].row || '')),
  Object.keys(PENDING).filter((k) => !/^B-\d+$/.test(PENDING[k].row || '')));

// 5 — THE SPECIES DEFECT'S OWN CLASS, caught even if BOTH sides carried it. `Mandalorian` was never a
//     species in the registry (the nearest record is `mandalorian_human`, "Mandalorian Human"), so the
//     card named something the game has no statistics for. Resolved through the SHARED name index —
//     C-CSG-6's incumbentWins, the same rule the app resolves a species by name with — never a private map.
const SPECIES = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical/species.json'), 'utf8')).species;
const SP_IDX = require('../lib/shared/charResolve.js').speciesNameIndex(SPECIES);
const unresolvable = [];
[['card', CARDS], ['record', RECORDS]].forEach(([side, rows]) => {
  rows.forEach((row) => {
    const n = String(row.species || '').trim().toLowerCase();
    if (!n || !SP_IDX.byName[n]) unresolvable.push({ side: side, id: row.id, species: row.species });
  });
});
check('every species named on a card OR in a record resolves in the species registry',
  unresolvable.length === 0, unresolvable);

// 6 — the prose cannot contradict the species the record carries. The species word is what reached the
//     player: "This Mandalorian" over a Human record. A card's description may not name a species other
//     than its own record's — checked against EVERY registry species name, so this does not depend on
//     anyone remembering which words are species words.
//     TERMS, NOT JUST NAMES, and that distinction is the whole check. `Mandalorian` is not a species
//     NAME in the registry — the nearest record is "Mandalorian Human" — so a name-only sweep reads
//     GREEN over the exact sentence this guard was written for. Measured as a deliberate bite: the
//     name-only version scored 11 PASS / 0 FAIL with "This Mandalorian" restored to the card. So the
//     term set is every registry name PLUS every ≥5-character word inside one, and a card's OWN terms
//     (its record's species name and that name's words) are excluded so "A Mon Calamari diplomat" and
//     "A Muun who survived the Purge" are not clashes with themselves.
function speciesTermsOf(name) {
  const n = String(name || '').trim();
  if (!n) return [];
  return [n].concat(n.split(/[^A-Za-z]+/).filter((w) => w.length >= 5));
}
const speciesWords = [...new Set(
  Object.values(SPECIES).reduce((acc, s) => acc.concat(speciesTermsOf(s.name)), []).filter((n) => n.length > 3)
)];
const proseClashes = [];
CARDS.forEach((c) => {
  const r = byId[c.id];
  if (!r) return;
  const own = new Set(speciesTermsOf(r.species).map((t) => t.toLowerCase()));
  const text = [c.description, c.tagline, c.playstyle].filter(Boolean).join(' ');
  speciesWords.forEach((w) => {
    if (own.has(w.toLowerCase())) return;
    // whole-word, case-sensitive: species names are capitalised in prose, and a lower-case coincidence
    // ("human nature") is not a species claim.
    if (new RegExp('(^|[^A-Za-z])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^A-Za-z]|$)').test(text)) {
      proseClashes.push({ id: c.id, recordSpecies: r.species, proseSays: w });
    }
  });
});
check('no card\'s prose names a species other than the one its record carries',
  proseClashes.length === 0, proseClashes);

console.log('\n  cards: ' + CARDS.length + ' · records: ' + RECORDS.length
  + ' · fields compared per id: ' + comparedFields.size + ' (' + [...comparedFields].sort().join(' ') + ')'
  + '\n  divergences: ' + divergences.length + ' · declared pending: ' + Object.keys(PENDING).length
  + ' · undeclared: ' + undeclared.length);

console.log('\npregen card/record parity: ' + pass + ' PASS, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
