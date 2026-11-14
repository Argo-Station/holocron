#!/usr/bin/env node
/**
 * sources.cjs — STANDING guard for the ACTIVE SOURCES predicate (lib/shared/sources.js;
 * BOOKS-1b, rulings books-filter-go + books-filter-scope §3). Runs against the REAL
 * books.vocab.json so the alias→book mapping stays honest, plus injected records for the
 * predicate's edge cases.
 *
 * Proves: any-source-active semantics; unsourced = always active; OFF hides; default all-on
 * (empty off set); the era composition (content line-gated by the campaign era; era-books/community agnostic);
 * last-core refusal; store normalize (versioned, garbage → all-on).
 *
 * Run: node test/sources.cjs
 */
const fs = require('fs');
const path = require('path');
const S = require('../lib/shared/sources.js');

const vocab = JSON.parse(fs.readFileSync(
  path.resolve(__dirname, '..', 'schema', 'vocab', 'books.vocab.json'), 'utf8'));
const IDX = S.buildIndex(vocab);

let failures = 0;
function check(label, cond) {
  if (cond) console.log('  PASS  ' + label);
  else { failures += 1; console.error('  FAIL  ' + label); }
}

function main() {
  // ── 1. vocabulary bijection (mapping is honest) ──
  check('every alias resolves to a known book id',
    Object.keys(IDX.aliasToId).every((a) => IDX.byId[IDX.aliasToId[a]]));
  check('cores present with their line', IDX.byId.eote.line === 'eote' && IDX.byId.eote.group === 'Core');
  check('a supplement carries its line + group', IDX.byId.dangerous_covenants.line === 'eote' && IDX.byId.dangerous_covenants.group === 'Supplement');
  check('community provenance classed line-null', IDX.byId.unofficial_species_menagerie.group === 'Community' && IDX.byId.unofficial_species_menagerie.line === null);
  check('the FaD Beta row is GONE (D-B1a-2)', IDX.byId.fad_beta === undefined && IDX.aliasToId['Force and Destiny Beta Rulebook'] === undefined);
  // BOOKS-1b D1(a)/D2 (vehicle vocab): the two adventure rows resolve; aorbeta is hide-listed, NOT a row.
  check('vehicle-vocab: Long Arm + Onslaught rows resolve by title AND code',
    IDX.aliasToId['Long Arm of the Hutt'] === 'long_arm_of_the_hutt' && IDX.aliasToId['laoth'] === 'long_arm_of_the_hutt'
    && IDX.aliasToId['Onslaught at Arda I'] === 'onslaught_at_arda_i' && IDX.aliasToId['oaa'] === 'onslaught_at_arda_i');
  check('vehicle-vocab: aorbeta is hide-listed (D2), never a book row',
    IDX.hiddenSourceCodes.aorbeta === true && IDX.byId.aorbeta === undefined && IDX.aliasToId['aorbeta'] === undefined);
  check('vehicle-vocab: a core full-label now resolves (source-field parity)',
    IDX.aliasToId['Edge of the Empire Core Rulebook'] === 'eote' && IDX.aliasToId['Suns of Fortune'] === 'suns_of_fortune' && IDX.aliasToId['sof'] === 'suns_of_fortune');

  // ── 2. isActive core semantics ──
  const rec = (srcs) => ({ sources: srcs });
  const allOn = {};
  check('unsourced record is always active', S.isActiveWith(rec([]), IDX, allOn) === true);
  check('all-on: a supplement record is active', S.isActiveWith(rec(['Dangerous Covenants']), IDX, allOn) === true);
  check('OFF hides the record', S.isActiveWith(rec(['Dangerous Covenants']), IDX, { dangerous_covenants: true }) === false);
  check('ANY active source keeps it (multi-source, one off one on)',
    S.isActiveWith(rec(['Dangerous Covenants', 'eote']), IDX, { dangerous_covenants: true }) === true);
  check('all its sources off → hidden',
    S.isActiveWith(rec(['Dangerous Covenants', 'Fly Casual']), IDX, { dangerous_covenants: true, fly_casual: true }) === false);
  // unknown book (not in vocab — e.g. an un-censused vehicle book) is NEVER a reason to hide (Law 2)
  check('an UNKNOWN book keeps the record visible',
    S.isActiveWith(rec(['Some Uningested Book']), IDX, allOn) === true);
  check('unknown source shows even when a KNOWN co-source is off (unknown = always-on)',
    S.isActiveWith(rec(['eote', 'Some Uningested Book']), IDX, { eote: true }) === true);

  // ── 3. era composition (BOOKS-1c opt-in "limit to campaign era"): content gates by LINE ──
  const eraEote = { eote: true };
  check('era EotE: an eote-core record shows', S.isActiveWith(rec(['eote']), IDX, allOn, eraEote) === true);
  check('era EotE: a fad-core record is HIDDEN (line not the campaign)', S.isActiveWith(rec(['fad']), IDX, allOn, eraEote) === false);
  check('era EotE: a fad SUPPLEMENT is HIDDEN (line-gated by era)',
    S.isActiveWith(rec(['Disciples of Harmony']), IDX, allOn, eraEote) === false);
  check('era EotE: fad-core + fad-supplement is HIDDEN (both fad-line)',
    S.isActiveWith(rec(['fad', 'Disciples of Harmony']), IDX, allOn, eraEote) === false);
  check('era EotE: a record with an eote source AND a fad supplement SHOWS (eote line is the campaign)',
    S.isActiveWith(rec(['eote', 'Disciples of Harmony']), IDX, allOn, eraEote) === true);
  check('era EotE: an ERA-BOOK (line "era") is era-agnostic — shows',
    S.isActiveWith(rec(['Rise of the Separatists']), IDX, allOn, eraEote) === true);
  check('era EotE: a COMMUNITY record (line null) is era-agnostic — shows',
    S.isActiveWith(rec(['Unofficial Species Menagerie']), IDX, allOn, eraEote) === true);
  check('era FaD: the fad supplement now shows', S.isActiveWith(rec(['Disciples of Harmony']), IDX, allOn, { fad: true }) === true);
  check('era set + globally OFF core: still hidden (both layers)',
    S.isActiveWith(rec(['eote']), IDX, { eote: true }, eraEote) === false);

  // ── 4. G12 (F-48): default BY GROUP (official on / community-homebrew off); v2 override contract ──
  const V2 = { version: 2, override: {} };
  check('load with no storage → v2 empty override', S.load().version === 2 && Object.keys(S.load().override).length === 0);
  check('normalize garbage → v2 group-defaults (empty override), NOT all-on', Object.keys(S.normalize('nope').override).length === 0);
  // the derivation: official ON by default, community/homebrew OFF by default
  check('G12 default: an OFFICIAL book (eote core) is ON by default', S.isBookActive(IDX, V2, 'eote') === true);
  check('G12 default: an OFFICIAL supplement (Fly Casual) is ON by default', S.isBookActive(IDX, V2, 'fly_casual') === true);
  check('G12 default: a COMMUNITY book (Menagerie) is OFF by default', S.isBookActive(IDX, V2, 'unofficial_species_menagerie') === false);
  check('G12 default: UserData (homebrew) is OFF by default', S.isBookActive(IDX, V2, 'user_data') === false);
  // overrides flip either way
  check('override flips a community book ON', S.isBookActive(IDX, { override: { unofficial_species_menagerie: true } }, 'unofficial_species_menagerie') === true);
  check('override flips an official book OFF', S.isBookActive(IDX, { override: { eote: false } }, 'eote') === false);
  // resolvedOff feeds the (unchanged) predicate: a community record hidden by default, official shown
  const off0 = S.resolvedOff(IDX, V2);
  check('resolvedOff: community book in the off-set by default', off0.unofficial_species_menagerie === true);
  check('resolvedOff: official book NOT in the off-set by default', off0.eote === undefined);
  check('by default a COMMUNITY record is HIDDEN (the new law)',
    S.isActiveWith(rec(['Unofficial Species Menagerie']), IDX, off0) === false);
  check('by default an OFFICIAL record SHOWS', S.isActiveWith(rec(['Fly Casual']), IDX, off0) === true);
  const offOn = S.resolvedOff(IDX, { override: { unofficial_species_menagerie: true } });
  check('enable the community source → its record SHOWS', S.isActiveWith(rec(['Unofficial Species Menagerie']), IDX, offOn) === true);
  // ── 4b. v1 → v2 migration (lossless) ──
  const mig = S.normalize({ version: 1, off: { fly_casual: true } });
  check('migration: v1 off entry → override false', mig.version === 2 && mig.override.fly_casual === false);
  check('migration: an off-array v1 blob migrates too', S.normalize({ off: ['dangerous_covenants'] }).override.dangerous_covenants === false);
  check('migration: a migrated user\'s community book still falls to its group default (off)',
    S.isBookActive(IDX, S.normalize({ off: { fly_casual: true } }), 'unofficial_species_menagerie') === false);
  // ── 4c. setBook (override) + last-core refusal ──
  let st = S.setBook(V2, IDX, 'fly_casual', false).state;
  check('setBook off an official supplement → override false', st.override.fly_casual === false);
  st = S.setBook(st, IDX, 'fly_casual', true).state;
  check('setBook back on → override drops (matches group default)', st.override.fly_casual === undefined);
  st = S.setBook(V2, IDX, 'unofficial_species_menagerie', true).state;
  check('setBook ON a community book → override true (opt-in recorded)', st.override.unofficial_species_menagerie === true);
  // turn off two of three cores, then refuse the last
  let sc = S.setBook(V2, IDX, 'aor', false).state;
  sc = S.setBook(sc, IDX, 'fad', false).state;
  const lastCore = S.setBook(sc, IDX, 'eote', false);
  check('refuses to turn off the LAST active core', lastCore.refused === true && lastCore.state.override.eote === undefined);
  check('a non-last core turns off fine', S.setBook(V2, IDX, 'aor', false).refused === false);
  // ── 4d. groupedBooks derivation + opt-in marker ──
  check('grouped books: Core active by default, Community OFF by default + defaultOff marker', (() => {
    const g = S.groupedBooks(IDX, V2);
    const core = (g.Core || []).every((b) => b.active);
    const comm = (g.Community || []).find((b) => b.id === 'unofficial_species_menagerie');
    return core && comm && comm.active === false && comm.defaultOff === true
      && (g.Supplement || []).every((b) => b.defaultOff === false);
  })());

  console.log(failures === 0 ? '\nsources guard: ALL PASS' : '\nsources guard: ' + failures + ' FAILURES');
  process.exit(failures === 0 ? 0 : 1);
}

main();
