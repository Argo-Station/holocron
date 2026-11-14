#!/usr/bin/env node
/**
 * csg_import.cjs — STANDING guard for the Complete Species Guide import (F-67; ruling
 * `csg-species-import-census` + AMENDMENT 1; handoff `csg-import-handoff`).
 *
 * Run: node test/csg_import.cjs            (exit 0 green / 1 red)
 *      node test/csg_import.cjs --mutants  (R-VM1: run each mutant and assert the guard reddens)
 *
 * IT GUARDS THREE THINGS, and each is a behaviour rather than a number:
 *
 *   A. THE RECORD SHAPE (Amendment 1 A-1). Every CSG record has its own `csg_` id, carries
 *      `sources: ['The Complete Species Guide']`, and NOTHING it wrote redefines an id another
 *      source owns. Plus the load-bearing APPEND: every CSG record sits after every non-CSG one,
 *      which is what makes C's incumbent rule mean "the record that was already there".
 *
 *   B. THE RENDER DEDUPE (Amendment 1 A-2, C-CSG-7). The four-state table, run through the REAL
 *      predicate and the REAL vocabulary: Menagerie on / CSG off → ours; Menagerie OFF / CSG ON →
 *      CSG's; both on → ours; both off → none; and Bith stays Fully Operational's whatever happens.
 *      (The browser proof of the same table is scripts/smoke_csg_dedupe.py — this is the unit half.)
 *
 *   C. THE NAME-COLLISION FIX (C-CSG-6). A legacy sheet that stored its species as the WORD
 *      "Barabel" still resolves to the Menagerie's `barabel` after the import — through
 *      speciesAbilityGrants, a real reader, not a re-implementation. AND the talent homonym
 *      "Temple Training" still refuses to resolve, because that guard was right and must survive.
 */
const fs = require('fs');
const path = require('path');
const S = require('../lib/shared/sources.js');
const CR = require('../lib/shared/charResolve.js');

const R = (...p) => path.resolve(__dirname, '..', ...p);
const load = (p) => JSON.parse(fs.readFileSync(R(p), 'utf8'));

const vocab = load('public/data/canonical/books.vocab.json');
const IDX = S.buildIndex(vocab);
const species = load('public/data/canonical/species.json').species;
const talents = load('public/data/canonical/talents.json').talents;

const BOOK = 'The Complete Species Guide';
const MENAGERIE = 'Unofficial Species Menagerie';
// B-336 species wave (ruling release-r7-bug-burndown ADDENDUM 62): species `sources` store the vocabulary KEY, so
// the record checks read the key; the vocabulary checks keep reading the title (it is still an alias of the key).
const BOOK_KEY = 'the_complete_species_guide';
const MENAGERIE_KEY = 'unofficial_species_menagerie';

let failures = 0;
const failed = [];
function check(label, cond, detail) {
  if (cond) console.log('  PASS  ' + label);
  else { failures += 1; failed.push(label); console.error('  FAIL  ' + label + (detail ? '  — ' + detail : '')); }
}

// the shipped OFF-set for a given shelf state, expressed the way the app expresses it
function offSet(overrides) {
  return S.resolvedOff(IDX, { version: 2, override: overrides || {} });
}
// what the picker offers: the REAL filter, then the REAL dedupe — the exact pair app.jsx runs.
function offered(overrides) {
  const list = Object.values(species).filter((r) => S.isActiveWith(r, IDX, offSet(overrides)));
  return S.dedupeByName(list, IDX);
}
function offeredNamed(overrides, name) {
  const k = S.dedupeName(name);
  return offered(overrides).filter((r) => S.dedupeName(r.name) === k);
}

function main(mutant) {
  const csg = Object.entries(species).filter(([, r]) => (r.sources || []).indexOf(BOOK_KEY) !== -1);
  const ids = Object.keys(species);

  // ── A. RECORD SHAPE ────────────────────────────────────────────────────────────────────────
  check('the import actually landed (CSG records present)', csg.length > 100, 'found ' + csg.length);
  check('every CSG record owns a `csg_`-prefixed id',
    csg.every(([id]) => id.indexOf('csg_') === 0),
    String(csg.filter(([id]) => id.indexOf('csg_') !== 0).map((x) => x[0]).slice(0, 5)));
  check('every CSG record is sourced to the book, and to it alone',
    csg.every(([, r]) => Array.isArray(r.sources) && r.sources.length === 1 && r.sources[0] === BOOK_KEY));
  // …AND THE REVERSE, because the sweep above is defined BY the source string: re-source a
  // `csg_`-prefixed record to an FFG book and it simply leaves the set, unguarded. The id prefix
  // and the source must agree in both directions or the partition is not a partition.
  check('and every `csg_`-prefixed id is sourced to the book (the reverse pin)',
    ids.filter((id) => id.indexOf('csg_') === 0)
       .every((id) => (species[id].sources || [])[0] === BOOK_KEY),
    ids.filter((id) => id.indexOf('csg_') === 0 && (species[id].sources || [])[0] !== BOOK_KEY).slice(0, 5).join(','));
  check('every CSG record is provenance `community`',
    csg.every(([, r]) => r._provenance === 'community'));
  check('NO CSG record redefines an id another source owns (D-PS3 by construction)',
    csg.every(([id]) => {
      const bare = id.slice(4);
      return !(bare in species) || (species[bare].sources || []).indexOf(BOOK_KEY) === -1;
    }) && Object.entries(species).filter(([id, r]) =>
      (r.sources || []).indexOf(BOOK_KEY) !== -1 && id.indexOf('csg_') !== 0).length === 0);
  check('the book has a vocabulary row, Community group, so G12 defaults it OFF',
    IDX.aliasToId[BOOK] === 'the_complete_species_guide'
    && IDX.byId.the_complete_species_guide.group === 'Community'
    && S.isBookActive(IDX, { version: 2, override: {} }, 'the_complete_species_guide') === false);
  // THE APPEND IS LOAD-BEARING (C-CSG-6 depends on it). Not a style rule: `incumbentWins` reads
  // registry ORDER as ship order, so a CSG record placed BEFORE an incumbent would hand the
  // incumbent's name to the newcomer and silently re-point a legacy sheet.
  // C-TPS-2 (ruling `tor-p3-species`): the invariant GENERALISES from "CSG is last" to
  // **imports are append-only blocks in import order**. The old form asserted that everything after
  // the first CSG record is CSG, which was true only while CSG was the newest source; the moment a
  // second book landed, its five correctly-appended records read as "strays" and reddened a guard
  // whose invariant they actually satisfy.
  //
  // ONE DEVIATION FROM THE CONDITION AS WRITTEN, because the registry disagrees with it. C-TPS-2
  // also words the invariant as "every community record after every official record". That is FALSE
  // on the shipped shelf and always has been: the Unofficial Species Menagerie's 27 community
  // records are INTERLEAVED ALPHABETICALLY through the base block (measured: 21 separate runs), not
  // appended after it. They predate the prefixed-import era and are incumbents for their own names,
  // so they threaten nothing the invariant protects. Asserting that clause would redden this guard
  // for a pre-existing reason with nothing to do with either import. What IS true, and is what the
  // invariant actually rests on, is the block form below. Flagged to the architect rather than
  // silently narrowed.
  //
  // THE BLOCKS ARE A MANIFEST, NOT A PATTERN (ADR 0034) — declared in import order. A new book adds
  // one line here; inferring blocks from id shape would let a typo'd prefix invent a block.
  const IMPORT_BLOCKS = [
    { label: 'The Complete Species Guide', prefix: 'csg_' },
    { label: 'The Old Republic: An Era Sourcebook', prefix: 'tor_' },
  ];
  // PURE so the mutant below can strike it directly rather than reasoning about it.
  function appendOnlyBlocks(idList) {
    const blockOf = (id) => IMPORT_BLOCKS.findIndex((b) => id.indexOf(b.prefix) === 0);
    const seq = idList.map(blockOf);                       // -1 = base (pre-import) record
    const firstImport = seq.findIndex((b) => b !== -1);
    if (firstImport === -1) return { ok: false, why: 'no import block present at all' };
    // (a) every base record precedes every import record
    if (seq.slice(firstImport).some((b) => b === -1)) {
      const at = firstImport + seq.slice(firstImport).findIndex((b) => b === -1);
      return { ok: false, why: 'a base record sits INSIDE the import region, at ' + idList[at] };
    }
    // (b) each block is contiguous and (c) blocks appear in declared order
    const order = [];
    for (const b of seq.slice(firstImport)) if (order[order.length - 1] !== b) order.push(b);
    const dup = order.find((b, i) => order.indexOf(b) !== i);
    if (dup !== undefined) return { ok: false, why: 'block ' + IMPORT_BLOCKS[dup].label + ' is not contiguous' };
    for (let i = 1; i < order.length; i++) {
      if (order[i] < order[i - 1]) {
        return { ok: false, why: IMPORT_BLOCKS[order[i]].label + ' is placed BEFORE '
                                 + IMPORT_BLOCKS[order[i - 1]].label + ', reversing import order' };
      }
    }
    return { ok: true, blocks: order.map((b) => IMPORT_BLOCKS[b].label) };
  }
  const appendState = appendOnlyBlocks(ids);
  check('imports are APPEND-ONLY BLOCKS IN IMPORT ORDER (ship order == registry order)',
    appendState.ok, appendState.why);
  check('both import blocks are present and in the declared order',
    appendState.ok && appendState.blocks.length === IMPORT_BLOCKS.length
    && appendState.blocks.every((l, i) => l === IMPORT_BLOCKS[i].label),
    JSON.stringify(appendState.blocks));
  // THE MUTANT C-TPS-2 NAMES: a record inserted BETWEEN blocks must still redden. Splice one TOR id
  // in ahead of the CSG block and assert the predicate rejects it — otherwise the two greens above
  // are shape, not evidence.
  const firstImportIdx = ids.findIndex((id) => id.indexOf('csg_') === 0);
  const spliced = ids.slice(0, firstImportIdx)
    .concat(['tor_dashade'], ids.slice(firstImportIdx).filter((id) => id !== 'tor_dashade'));
  const splicedState = appendOnlyBlocks(spliced);
  check('MUTATION IS CAPABLE: a TOR record spliced ahead of the CSG block reddens the predicate',
    splicedState.ok === false, 'mutant was accepted — the assert above is inert');
  // and the OLD failure mode stays caught: a base record loose in the import region
  const looseBase = ids.slice(0, firstImportIdx - 1)
    .concat(ids.slice(firstImportIdx), [ids[firstImportIdx - 1]]);
  check('MUTATION IS CAPABLE: a base record trailing the import region also reddens',
    appendOnlyBlocks(looseBase).ok === false, 'mutant was accepted');
  check('the vocabulary row sits AFTER the Menagerie (the earliest-shipped-community tiebreak)',
    IDX.byId.the_complete_species_guide.order > IDX.byId.unofficial_species_menagerie.order);
  // R-EN2 — PRESENCE IS NOT PROTECTION, so the OTHER name-find paths get asserted too, not just
  // reasoned about. Three sites in player/app.jsx resolve a species by NAME with a plain
  // `.find(s => s.name === …)`: Guided's 13-species list (:14671), Guided's completion fallback
  // (:17204), and buildTestPc's key lookup (:6107). A `.find` returns the FIRST match in registry
  // order, so all three are correct ONLY because the CSG records are appended — the same fact
  // C-CSG-6 rests on, reached by a different route. This exercises the exact idiom.
  const GUIDED = (fs.readFileSync(R('player/app.jsx'), 'utf8')
    .match(/const QB_SPECIES = \[([\s\S]*?)\];/) || [, ''])[1]
    .match(/'[^']+'|"[^"]+"/g) || [];    // "Twi'lek" is double-quoted; both forms or the list is short
  const guidedNames = GUIDED.map((s) => s.slice(1, -1));
  const guidedHits = guidedNames.map((n) => Object.entries(species).find(([, r]) => r.name === n));
  check('Guided’s 13 species names still resolve, and never to a CSG record',
    guidedNames.length === 13 && guidedHits.every((h) => h && h[0].indexOf('csg_') !== 0),
    guidedNames.length + ' names; csg hits: '
      + guidedHits.filter((h) => h && h[0].indexOf('csg_') === 0).map((h) => h[0]).join(','));

  // ── B. THE FOUR-STATE TABLE (C-CSG-7, unit half) ───────────────────────────────────────────
  const MEN_ON = { unofficial_species_menagerie: true };
  const CSG_ON = { the_complete_species_guide: true };
  const BOTH_ON = { unofficial_species_menagerie: true, the_complete_species_guide: true };

  const s1 = offeredNamed(MEN_ON, 'Barabel');
  check('Menagerie ON, CSG OFF → exactly ONE Barabel, ours',
    s1.length === 1 && s1[0].id === 'barabel', JSON.stringify(s1.map((r) => r.id)));
  const s2 = offeredNamed(CSG_ON, 'Barabel');
  check('Menagerie OFF, CSG ON → exactly ONE Barabel, CSG’s  ← Jason’s question',
    s2.length === 1 && s2[0].id === 'csg_barabel', JSON.stringify(s2.map((r) => r.id)));
  const s3 = offeredNamed(BOTH_ON, 'Barabel');
  check('both ON → exactly ONE Barabel, ours (the incumbent wins)',
    s3.length === 1 && s3[0].id === 'barabel', JSON.stringify(s3.map((r) => r.id)));
  const s4 = offeredNamed({}, 'Barabel');
  check('both OFF → no Barabel at all, correctly', s4.length === 0, JSON.stringify(s4.map((r) => r.id)));
  const bith = offeredNamed(CSG_ON, 'Bith');
  check('Bith with an FFG book on → Fully Operational’s, always',
    bith.length === 1 && bith[0].id === 'bith', JSON.stringify(bith.map((r) => r.id)));

  // the dedupe must not be a blunt instrument: with CSG on, the picker still grows by the ~178
  // species we did not have, and offers no name twice.
  const base = offered({}).length, withCsg = offered(CSG_ON).length;
  check('switching CSG on ADDS species rather than swapping them',
    withCsg > base + 100, base + ' → ' + withCsg);
  const seen = {}, dupes = [];
  offered(BOTH_ON).forEach((r) => {
    const k = S.dedupeName(r.name);
    if (seen[k]) dupes.push(k); else seen[k] = 1;
  });
  check('with EVERY source on, no species name is offered twice', dupes.length === 0,
    JSON.stringify(dupes.slice(0, 8)));
  // A-MSP-4 — RE-POINTED BY RULING (`species-followups-creator-moments` §5), not rewritten at the
  // keyboard. The old assert said the Menagerie's DELIBERATELY-RENAMED Jawa is still its own
  // offering, which was true while F-47's "(Unofficial Species Menagerie)" suffix existed to keep
  // it visible. The multi-source picker replaces that workaround with the real mechanism, so the
  // rename is retired in this same merge — and the assert follows the SUBJECT rather than dying
  // with the wording. The successor invariant, stated by the architect:
  //   three records carry the name `Jawa`; the Menagerie's `jawa` is among them WITH ITS ID AND
  //   STATS INTACT; and `dedupeByName` yields exactly ONE Jawa row.
  // That is the same property the old line protected — both offerings survive and a player is never
  // shown two Jawas — now expressed in terms of the picker instead of a suffix.
  const jawaRecords = Object.values(species).filter((r) => S.dedupeName(r.name) === 'jawa');
  check('A-MSP-4: three records carry the name Jawa', jawaRecords.length === 3,
    JSON.stringify(jawaRecords.map((r) => r.id)));
  const menagerieJawa = species.jawa;
  check('A-MSP-4: the Menagerie’s `jawa` is among them, id and stats intact',
    !!menagerieJawa && S.dedupeName(menagerieJawa.name) === 'jawa'
    && menagerieJawa.sources[0] === MENAGERIE_KEY
    && !!menagerieJawa.characteristics && Object.keys(menagerieJawa.characteristics).length === 6,
    menagerieJawa && menagerieJawa.name);
  check('A-MSP-4: the list still offers exactly ONE Jawa row',
    offered(BOTH_ON).filter((r) => S.dedupeName(r.name) === 'jawa').length === 1,
    JSON.stringify(offered(BOTH_ON).filter((r) => S.dedupeName(r.name) === 'jawa').map((r) => r.id)));
  // DISCOVERY ONLY: the predicate the sheet uses to RESOLVE an owned record is untouched.
  check('ownership is untouched — the record a character stores still exists in the registry',
    !!species.barabel && species.barabel.sources[0] === MENAGERIE_KEY);

  // ── C. THE NAME-COLLISION FIX (C-CSG-6) ────────────────────────────────────────────────────
  const charbuild = {
    species: species,
    careers: load('public/data/canonical/careers.json').careers,
    specializations: load('public/data/canonical/specializations.json').specializations,
    talents: talents,
    force_powers: load('public/data/canonical/force_powers.json').force_powers,
  };
  // THE REAL PATH: a legacy sheet with NO speciesId, species stored as a word.
  const legacy = { name: 'Old Save', book: 'eote', species: 'Barabel', career: 'Bounty Hunter' };
  const grants = (sheet) => CR.speciesAbilityGrants(sheet, charbuild);
  check('a LEGACY name-only sheet still resolves its species after the import',
    grants(legacy).length > 0 && JSON.stringify(grants(legacy)) === JSON.stringify(grants({ speciesId: 'barabel' })),
    JSON.stringify(grants(legacy)));
  check('…and it resolves to the INCUMBENT record, not the newcomer',
    JSON.stringify(grants(legacy)) !== JSON.stringify(grants({ speciesId: 'csg_barabel' })));

  // the guard that must SURVIVE: a true homonym still refuses rather than guessing.
  const tIdx = CR.buildNameIndex(talents);
  check('the TALENT homonym guard is intact — "Temple Training" still refuses',
    tIdx.byName['temple training'] === false);
  check('…and it is a real homonym on file (two ids, two books)',
    Object.entries(talents).filter(([, t]) => (t.name || '').toLowerCase() === 'temple training').length === 2);
  // the species index records the collision even though it resolves it — presence AND protection.
  const sIdx = CR.speciesNameIndex(species);
  check('the species index still REPORTS the collisions it resolves',
    sIdx.collisions.indexOf('barabel') !== -1 && sIdx.byName.barabel === 'barabel',
    sIdx.collisions.length + ' collisions');
  check('a CSG-only species is reachable by name (the index is not just dropping csg records)',
    sIdx.byName['abednedo'] === 'csg_abednedo', String(sIdx.byName['abednedo']));

  const tag = mutant ? '[' + mutant + '] ' : '';
  console.log(failures === 0 ? '\n' + tag + 'csg import guard: ALL PASS'
                             : '\n' + tag + 'csg import guard: ' + failures + ' FAILURES');
  return failures;
}

// ── R-VM1: the mutants. Each one changes an OBSERVABLE, then we assert the guard notices. ──────
function mutants() {
  const cases = [
    ['dedupe removed', () => { S.dedupeByName = (l) => l; }],
    ['precedence inverted (later community wins)', () => {
      const real = S.namePrecedenceOf;
      S.namePrecedenceOf = (rec, idx) => -real(rec, idx);
      const dd = S.dedupeByName;
      S.dedupeByName = (list, idx) => {
        const best = {};
        list.forEach((r) => {
          const k = S.dedupeName(r.name); if (!k) return;
          const rank = S.namePrecedenceOf(r, idx);
          if (!best[k] || rank < best[k].rank) best[k] = { rank, rec: r };
        });
        return list.filter((r) => { const k = S.dedupeName(r.name); return !k || best[k].rec === r; });
      };
      void dd;
    }],
    ['species name index back to the poisoned rule', () => { CR.speciesNameIndex = (reg) => CR.buildNameIndex(reg); }],
  ];
  let bad = 0;
  // MUTANT 0 — the one that matters most, and the only one a monkeypatch cannot reach: revert the
  // FIX ITSELF inside charResolve's source (the five call sites go back to the poisoned index) and
  // assert that the legacy name-only sheet then FAILS to resolve its species. This is the defect
  // C-CSG-6 exists for, reproduced on demand rather than described.
  (function () {
    const os = require('os');
    const src = fs.readFileSync(R('lib/shared/charResolve.js'), 'utf8');
    // only the CALL SITES — `lookupByName(speciesNameIndex(` — never the definition or the export.
    const reverted = src.split('lookupByName(speciesNameIndex(').join('lookupByName(buildNameIndex(');
    const changed = src.split('lookupByName(speciesNameIndex(').length - 1 === 5 && reverted !== src;
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'csg-mut-')), 'charResolve.js');
    fs.writeFileSync(tmp, reverted);
    const MUT = require(tmp);                                    // (1) it PARSES and LOADS
    const cb = { species: species, careers: load('public/data/canonical/careers.json').careers,
                 specializations: load('public/data/canonical/specializations.json').specializations,
                 talents: talents, force_powers: load('public/data/canonical/force_powers.json').force_powers };
    const legacy = { name: 'Old Save', book: 'eote', species: 'Barabel' };
    const before = CR.speciesAbilityGrants(legacy, cb);
    const after = MUT.speciesAbilityGrants(legacy, cb);
    const observable = before.length > 0 && after.length === 0;   // (2) it MOVES
    console.log((changed ? '  ' : '  NO-OP ') + (observable ? 'RED   ' : 'INERT ')
      + 'mutant: charResolve reverted to the poisoned species index'
      + '  — legacy sheet reads ' + before.length + ' species abilities → ' + after.length);
    if (!changed || !observable) bad += 1;                       // (3) the verdict, and only now
  })();
  cases.forEach(([label, apply]) => {
    const child = require('child_process').spawnSync(process.execPath,
      ['-e', `
        const S = require(${JSON.stringify(R('lib/shared/sources.js'))});
        const CR = require(${JSON.stringify(R('lib/shared/charResolve.js'))});
        (${apply.toString()})();
        process.exit(require(${JSON.stringify(__filename)}).run(${JSON.stringify(label)}));
      `], { encoding: 'utf8' });
    const reddened = child.status !== 0;
    console.log((reddened ? '  RED   ' : '  INERT ') + 'mutant: ' + label);
    if (!reddened) { bad += 1; console.error(child.stdout); }
  });
  console.log(bad === 0 ? '\nmutants: every one reddened the guard'
                        : '\nmutants: ' + bad + ' DID NOT REDDEN — the guard is inert there');
  return bad;
}

module.exports = { run: main };

if (require.main === module) {
  if (process.argv.indexOf('--mutants') !== -1) process.exit(mutants());
  process.exit(main() === 0 ? 0 : 1);
}
