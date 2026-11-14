#!/usr/bin/env node
/**
 * qb_source_gate.cjs — B-184: Guided Build honours ACTIVE SOURCES (ruling `b183-b184-ready-gap-recon`,
 * R-RG-2/3/4 + riders R-RG-6/R-RG-7).
 *
 * THE DEFECT THIS PINS: Guided Build's game-line step offered all three lines regardless of the user's
 * Active Sources, so switching Age of Rebellion off still offered "The Pilot" — a no-compromise-mirror
 * failure discovered at the table. The species shelf had the same gap, plus a raw name `.find` whose
 * correctness rested on registry ORDER.
 *
 * Legs 1–4, 8–9 read the source (structure: one predicate, gated load, live re-render, no raw find).
 * Legs 5–7 are BEHAVIOURAL — they execute the real `lib/shared/sources.js` against the real registries,
 * because the two riders are claims about behaviour, not about text:
 *   - leg 5 (R-RG-7) ties the empty-state guarantee to its mechanism: `setBook` REFUSES to disable the
 *     last active core, therefore >= 1 line always survives. The ruling's §2.1 reasoning expires
 *     silently if that guard is ever relaxed; this is the assert that would go red instead.
 *   - legs 6–7 (R-RG-6) pin the precedence-aware species lookup, and leg 7 does it against a REVERSED
 *     registry order — the exact condition (a re-import reordering keys) under which the retired raw
 *     `.find` would have flipped 12 of 13 curated species to community records with nothing to catch it.
 *
 * Run: node test/qb_source_gate.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'player', 'app.jsx'), 'utf8');
const S = require(path.join(ROOT, 'lib', 'shared', 'sources.js'));
const vocab = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'data', 'canonical', 'books.vocab.json'), 'utf8'));
const speciesReg = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'data', 'canonical', 'species.json'), 'utf8')).species;

let failures = 0;
function check(label, cond) {
  if (cond) console.log('  PASS  ' + label);
  else { failures += 1; console.error('  FAIL  ' + label); }
}
function count(re) { return (src.match(re) || []).length; }

const index = S.buildIndex(vocab);

// ── 1. the three lines carry `sources`, so the SHARED predicate can filter them ────────────────
const glBlock = (src.match(/var FC_GAME_LINES = \[[\s\S]*?\n\];/) || [''])[0];
check('FC_GAME_LINES carries sources for all three lines',
  (glBlock.match(/sources:\s*\[/g) || []).length === 3);
check("the line sources are the three Core book ids (eote/aor/fad)",
  /sources:\s*\['eote'\]/.test(glBlock) && /sources:\s*\['aor'\]/.test(glBlock) && /sources:\s*\['fad'\]/.test(glBlock));
check('those three ids are exactly the Core-group books in books.vocab.json',
  ['eote', 'aor', 'fad'].every(id => index.byId[id] && index.byId[id].group === 'Core') &&
  Object.keys(index.byId).filter(id => index.byId[id].group === 'Core').length === 3);

// ── 2. ONE predicate — the game-line step filters through the shared fcFilterActive (R-RG-3) ────
// RE-POINTED, B-1688 (D-449; ruling `release-r7-bug-burndown` ADDENDA 445, 469): `QBGameLineStep` went; `GBGameLineStep` is Guided's step. KEEPS the one predicate and R-RG-4's kept
// line with its note. DROPS "the sole card opens by default": paper's line plate is press-is-act and nothing opens.
check('GBGameLineStep filters the line list through fcFilterActive',
  /var lines = fcFilterActive\(FC_GAME_LINES\);/.test(src));
check('no QuickBuild-local source predicate was invented (fcFilterActive is the only filter fn)',
  count(/function fcFilterActive\s*\(/g) === 1 &&
  !/function qb[A-Za-z]*Filter(Active|Sources)\s*\(/.test(src));

// ── 3. the step renders 1–3 cards and never auto-advances past one option (R-RG-4) ──────────────
check('R-RG-4: the sole surviving line still renders (no auto-advance branch)',
  /var sole = lines\.length === 1 \? lines\[0\] : null;/.test(src) && /\{sole \? qbSingleLineNote\(sole\) : null\}/.test(src));

// ── 4. QuickBuild awaits ready() and re-renders on change (the B-183 ready()-gap, now load-bearing) ──
const qbBlock = src.slice(src.indexOf('function QuickBuild('), src.indexOf('function QuickBuild(') + 4000);
check('QuickBuild boot awaits SWRPGSources.ready() before rendering a filtered picker',
  /sourcesReady/.test(qbBlock) && /Promise\.all\(\[loadQuickBuildData\(\), loadCanonicalRegistries\(\), loadCanonicalCharacterBuild\(\), sourcesReady\]\)/.test(qbBlock));
check('QuickBuild re-renders when the active set changes mid-build',
  /addEventListener\('swrpg-sources-changed'/.test(qbBlock));

// ── 5. R-RG-7 — the empty-state guarantee, tied to the mechanism that provides it ───────────────
// Turn off two cores; the third must REFUSE, which is what makes "the step can never be empty" true.
let st = S.normalize({ version: S.STORE_VERSION, override: {} });
st = S.setBook(st, index, 'aor', false).state;
st = S.setBook(st, index, 'fad', false).state;
const lastCore = S.setBook(st, index, 'eote', false);
check('R-RG-7: setBook REFUSES to disable the last active core (the empty-state guarantee holds)',
  lastCore.refused === true && S.isBookActive(index, lastCore.state, 'eote') === true);
const linesLeft = ['eote', 'aor', 'fad'].filter(id => S.isBookActive(index, lastCore.state, id));
check('R-RG-7: therefore >= 1 game line is always offered (here exactly 1: ' + linesLeft.join(',') + ')',
  linesLeft.length >= 1);

// ── 6/7. R-RG-6 — precedence-aware species resolution, and the reversed-order pin ───────────────
const QB_SPECIES = ['Human', "Twi'lek", 'Wookiee', 'Rodian', 'Zabrak', 'Togruta',
  'Bothan', 'Mon Calamari', 'Mirialan', 'Nautolan', 'Duros', 'Chiss', 'Kel Dor'];
const allSpecies = Object.values(speciesReg);
function resolveVia(list) {
  const deduped = S.dedupeByName(list, index);
  const byName = {};
  deduped.forEach(s => { const k = S.dedupeName(s && s.name); if (k && !byName[k]) byName[k] = s; });
  return QB_SPECIES.map(n => byName[S.dedupeName(n)]).filter(Boolean);
}
const forward = resolveVia(allSpecies);
const reversed = resolveVia(allSpecies.slice().reverse());
const communityIn = list => list.filter(s => /^csg_|^tor_/.test(String(s.id))).map(s => s.id);

check('R-RG-6: every curated species resolves to a record (' + forward.length + '/13 present in the full set)',
  forward.length >= 12);
check('R-RG-6: 0 curated species resolve to a community record in registry order',
  communityIn(forward).length === 0);
check('R-RG-6 (THE PIN): with the registry order REVERSED, the official record STILL wins' +
  (communityIn(reversed).length ? ' — got ' + communityIn(reversed).join(',') : ''),
  communityIn(reversed).length === 0 &&
  forward.map(s => s.id).join('|') === reversed.map(s => s.id).join('|'));

// POSITIVE CONTROL — the rider's premise, executed rather than assumed. The RETIRED lookup is
// reproduced here and shown to FLIP under the same reversed order the pin above survives. Without
// this leg, legs 6–7 would pass on a codebase that never adopted the fix (they exercise the shared
// module, not the app), i.e. they would be controls wearing a pin's clothes. This is what makes the
// pair evidence: same input, retired path flips, adopted path does not.
const rawForward = QB_SPECIES.map(n => allSpecies.find(s => s.name === n)).filter(Boolean);
const rawReversed = QB_SPECIES.map(n => allSpecies.slice().reverse().find(s => s.name === n)).filter(Boolean);
check('POSITIVE CONTROL: the RETIRED raw .find flips to community records under reversed order' +
  ' (' + communityIn(rawReversed).length + ' of ' + rawReversed.length + ', e.g. ' + communityIn(rawReversed).slice(0, 3).join(',') + ')',
  communityIn(rawForward).length === 0 && communityIn(rawReversed).length >= 12);

// ── 8/9. the raw ordering-dependent lookup is retired, and the shelf resolves through the core ──
check('the raw `.find(s => s.name === name)` species lookup is RETIRED from the guided shelf',
  !/QB_SPECIES\.map\(name => Object\.values\(gameData\.charbuild\.species\)\.find\(/.test(src));
check('the guided species shelf resolves through the shared dedupeByName + fcFilterActive',
  /const speciesList = useMemo\(/.test(src) && /S\.dedupeByName\(active, cur\.index\)/.test(src) &&
  /var active = fcFilterActive\(all\);/.test(src));

console.log(failures === 0 ? '\nqb_source_gate guard: ALL PASS' : '\nqb_source_gate guard: ' + failures + ' FAILURES');
process.exit(failures === 0 ? 0 : 1);
