#!/usr/bin/env node
/**
 * books_vocab_parity.cjs — STANDING guard over the BOOK VOCABULARY's two structural invariants
 * (W1b + W2, ruling provenance-w1-w2-handoff). Both invariants are conventions this repo has
 * already been bitten by once each, so they are mechanised here rather than trusted.
 *
 * INVARIANT 1 — THE TWO COPIES ARE BYTE-IDENTICAL.
 * books.vocab.json exists twice: `schema/vocab/` is the SOURCE OF TRUTH (.gitignore's
 * canonical-pipeline note — "the durable products ARE tracked: schema/ (schemas + vocab + ...)";
 * apply_vehicle_vocab.py:19-20 — "Writes schema/vocab/books.vocab.json (source of truth) + the
 * identical served copy under public/data/canonical/") and `public/data/canonical/` is the SERVED
 * copy the browser fetches (sources.js:236). Divergence is invisible in normal use because the two
 * are read by DIFFERENT checkers — validate_registries' L1bk and L1bk.uniq open the schema copy
 * (validate_registries.py:890, via harness.py:16 VOCAB_DIR = SCHEMA_DIR/"vocab"), L1bk.ship opens
 * the served copy (:959) — so each can be green while the other file is wrong. That is exactly the
 * F-32 bug: the CotR row landed in schema/vocab (38 entries) and never reached the shipped vocab
 * (37), and holocron.work went live with CotR content and no ⚙ toggle for it (ruling
 * f32-cotr-ingest-gate §"Root cause"). skills.vocab and qualities.vocab are already pinned this way
 * inside the validator (validate_registries.py:1283-1291 and :1296-1303, `served_sv == sv`);
 * books.vocab had no such pin, which is the gap this file closes. It is a NODE guard rather than a
 * validator layer deliberately: the vocabulary is inert data with no build step, so the cheapest
 * battery (`node test/*.cjs`) is the one that should catch it.
 *
 * INVARIANT 2 — EVERY ROW CARRIES ITS OWN `label` IN `aliases`.
 * `aliases` IS the mapping table (the vocab's own _doc), and registries write their `sources`
 * strings in two different dialects: npcs.json stores the NPC library's parenthetical form
 * ("Heroes on Both Sides (adventure)"), while every other registry stores the bare label
 * (gear/weapons/species carry "Savage Spirits", never the "sava" short code). A row that carries
 * only one dialect silently fails to resolve the other, and the failure surfaces one lap later as
 * a red L1bk when someone backfills `sources` onto weapons for that same book. The one legitimate
 * exception is `user_data`, whose _note says it is a provenance marker rather than a book; it is
 * named explicitly below so that a NEW violation cannot hide behind a blanket allowance.
 *
 * INVARIANT 3 — THE `era` COLUMN IS TOTAL AND LEGAL (the guard §W2 owes).
 * Every row carries `era`, drawn from exactly {clone_wars, galactic_civil_war, sequel_era,
 * agnostic}. `old_republic` is RESERVED (handoff §W2: "do not add it to the legal set until Old
 * Republic content actually enters") and is asserted rejected by name, so a future row cannot
 * quietly invent a fifth era ahead of the architect.
 *
 * Run: node test/books_vocab_parity.cjs
 */
const fs = require('fs');
const path = require('path');
const S = require('../lib/shared/sources.js');

const ROOT = path.resolve(__dirname, '..');
const SCHEMA_PATH = path.join(ROOT, 'schema', 'vocab', 'books.vocab.json');
const SERVED_PATH = path.join(ROOT, 'public', 'data', 'canonical', 'books.vocab.json');

// The legal set is duplicated here ON PURPOSE rather than imported from sources.js: this guard's
// job is to catch the day someone widens the vocabulary's legal values, and a guard that reads its
// expectation from the thing it is guarding would widen silently along with it.
const LEGAL_ERAS = ['clone_wars', 'galactic_civil_war', 'sequel_era', 'agnostic', 'old_republic'];
// `old_republic` LEFT the reserved set when Old Republic content entered — the exact release
// condition the reservation was written with (ruling `tor-p3-app-ingest-scope` R-P3A-1, which also
// requires THIS guard green). `high_republic` inherits the reserved slot's job: it is a different
// period, its corpus evidence is contrary (CORPUS_REALITY_GAPS.md:115 — zero matches across 75
// PDFs), and one shipped row sits at `agnostic` under protest waiting on it. Widening this list is
// still a ruling-only act; the list stays duplicated from sources.js on purpose, so the day someone
// widens the vocabulary silently, this guard is the thing that disagrees.
const RESERVED_ERA = 'high_republic';
// user_data predates the label-as-alias invariant and documents itself as a provenance marker, not
// a book ("User-Added Data" is a shelf heading; "User Data" is the string records actually carry).
const LABEL_ALIAS_EXEMPT = ['user_data'];

let failures = 0;
function check(label, cond, detail) {
  if (cond) console.log('  PASS  ' + label);
  else {
    failures += 1;
    console.error('  FAIL  ' + label + (detail === undefined ? '' : '  ->  ' + JSON.stringify(detail)));
  }
}

function main() {
  const schemaText = fs.readFileSync(SCHEMA_PATH, 'utf8');
  const servedText = fs.readFileSync(SERVED_PATH, 'utf8');

  // ── 1. the two copies ───────────────────────────────────────────────────
  // Compared as BYTES, not as parsed objects: the file is hand-authored one-entry-per-line with
  // group spacing (its _doc says "Authored, not generated"), and apply_vehicle_vocab.py's
  // format-preserving text edit writes the same string to both paths. A deep-equal comparison would
  // pass on two files that differ in row ORDER, and row order is what the ⚙ panel renders.
  check('the schema (source of truth) and served copies are BYTE-identical',
    schemaText === servedText,
    schemaText === servedText ? null : { schemaBytes: schemaText.length, servedBytes: servedText.length });

  const vocab = JSON.parse(schemaText);
  const entries = vocab.entries || [];
  check('the vocabulary parses and is non-empty', entries.length > 0, { entries: entries.length });

  // ── 2. label-as-alias ───────────────────────────────────────────────────
  const labelNotAliased = entries
    .filter((e) => LABEL_ALIAS_EXEMPT.indexOf(e.id) === -1)
    .filter((e) => (e.aliases || []).indexOf(e.label) === -1)
    .map((e) => e.id);
  check('every row carries its own `label` in `aliases` (user_data excepted by name)',
    labelNotAliased.length === 0, labelNotAliased);

  // The exemption is itself pinned: if user_data ever gains its label as an alias, or the row is
  // renamed away, this guard's allowance is stale and should be revisited rather than left standing.
  const userData = entries.filter((e) => e.id === 'user_data')[0];
  check('the one exemption still describes reality (user_data exists and is still the exception)',
    !!userData && (userData.aliases || []).indexOf(userData.label) === -1, userData && userData.aliases);

  // ── 3. the era column ───────────────────────────────────────────────────
  const missingEra = entries.filter((e) => e.era === undefined).map((e) => e.id);
  check('every row carries an `era`', missingEra.length === 0, missingEra);

  const illegalEra = entries
    .filter((e) => LEGAL_ERAS.indexOf(e.era) === -1)
    .map((e) => e.id + '=' + String(e.era));
  check('every `era` is one of the four legal values', illegalEra.length === 0, illegalEra);

  const reserved = entries.filter((e) => e.era === RESERVED_ERA).map((e) => e.id);
  check('no row uses the RESERVED `high_republic` era', reserved.length === 0, reserved);

  // The reserved slot's release is itself pinned: `old_republic` is legal ONLY while a row actually
  // claims it. If the Old Republic content is ever removed, this fails and sends the widening back
  // for a ruling instead of leaving a fifth era legal on the strength of history.
  const claimsOldRepublic = entries.filter((e) => e.era === 'old_republic').map((e) => e.id);
  check('`old_republic` is legal because content claims it', claimsOldRepublic.length > 0, claimsOldRepublic);

  // contentEraOf is the ONLY reader of the column (sources.js:167). Pin its three "I don't know"
  // answers, which D-PS1 ruled deliberately indistinguishable: an unknown book, a row with no era,
  // and an explicit agnostic all read 'agnostic' — AND so does a row smuggling the reserved value,
  // which is the behaviour that keeps a bad row from inventing a fifth era at read time.
  const IDX = S.buildIndex(vocab);
  check('contentEraOf: an UNKNOWN book id reads agnostic',
    S.contentEraOf(IDX, 'no_such_book_id') === 'agnostic');
  check('contentEraOf: a null/absent index reads agnostic',
    S.contentEraOf(null, 'eote') === 'agnostic' && S.contentEraOf(undefined, undefined) === 'agnostic');
  check('contentEraOf: the RESERVED value is rejected at read time, not passed through',
    S.contentEraOf(S.buildIndex({ entries: [{ id: 'smuggled', label: 'S', aliases: [], era: RESERVED_ERA }] }),
      'smuggled') === 'agnostic');
  check('contentEraOf: a real assigned era comes back verbatim',
    S.contentEraOf(IDX, 'rise_of_the_separatists') === 'clone_wars'
    && S.contentEraOf(IDX, 'dawn_of_rebellion') === 'galactic_civil_war'
    && S.contentEraOf(IDX, 'discovery_on_jakku') === 'sequel_era'
    && S.contentEraOf(IDX, 'eote') === 'agnostic');
  check('contentEraOf: the newly-legal old_republic era comes back verbatim, not flattened',
    S.contentEraOf(IDX, 'the_old_republic_era_sourcebook') === 'old_republic');

  // ── 4. mapping hygiene the two copies must BOTH satisfy ─────────────────
  // L1bk.uniq (validate_registries.py:940) already asserts this over the schema copy. It is
  // repeated here because this guard is the only place the SERVED copy's alias table is checked for
  // collisions, and the served copy is what the browser resolves against.
  const owner = {};
  const dup = [];
  entries.forEach((e) => {
    (e.aliases || []).forEach((a) => {
      if (owner[a] !== undefined && owner[a] !== e.id) dup.push(a + ': ' + owner[a] + ' vs ' + e.id);
      owner[a] = e.id;
    });
  });
  check('no alias maps to two different book ids', dup.length === 0, dup);

  const seen = {};
  const dupIds = entries.map((e) => e.id).filter((id) => (seen[id] = (seen[id] || 0) + 1) === 2);
  check('no duplicate book ids', dupIds.length === 0, dupIds);

  console.log(failures === 0
    ? '\nbooks.vocab parity guard: ALL PASS'
    : '\nbooks.vocab parity guard: ' + failures + ' FAILURES');
  process.exit(failures === 0 ? 0 : 1);
}

main();
