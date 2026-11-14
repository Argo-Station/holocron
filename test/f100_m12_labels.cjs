#!/usr/bin/env node
/**
 * f100_m12_labels.cjs — GUARD for F-100 M12 step 13 (ruling f100-m12-build-card R-M12B-5; DECISIONS D-157 "Both leans":
 * K-MK (b) the plain marker, and the desktop source label is the pack's own label; f100-m12-census-card R-M12C-70, B-1241).
 * Over the REAL mods.js, its REAL fetchPack (served from disk) and the shipped packs:
 *
 *   L1  THE MARKER (specializations; the fold records it, so a toggle view and a stamped sheet answer alike):
 *       a tree one pack places keeps that pack's label (Detective, Edge of the Empire's only; fad-v1's Arbiter with all
 *       three on); a tree more than one active pack places reads plain "reSpecialized" (Detective and the other nine
 *       line-less trees, all three on; the five book trees eote-v2 and aor-v2 both rebuild); a book tree no pack
 *       places → null.
 *   L2  THE SOURCE LABEL (careers, by stamps): Syndicate with all three on → "reSpecialized"; Edge of the Empire's only
 *       → that pack's label; a book career a pack only re-rosters (smuggler) → null; no stamps → null.
 *       Force powers (M11 K4 (b)) unchanged: fad-v1's alter → "reSpecialized — Force and Destiny"; the book alter → null.
 *   L3  ONE LABEL PATH: treeView's marker model asks SWRPGMods.variantOfRecord; player/app.jsx's four desktop sites (the
 *       career rail row, the career head, the specialization head, the talents sheet) each call fcRecordSourceLabel,
 *       which asks variantOfRecord(MODS.active(), section, rec); no app.jsx line reads a record's `_variant` itself.
 *   L4  `sources` (R-M12B-5): every pack-ADDED tree and career in every shipped and superseded pack names no source the
 *       books vocabulary resolves; in the current stamps (eote-v2, aor-v2, fad-v1) each is exactly [] — the 18 trees
 *       (38 copies) and Syndicate (3).
 *   BITE  (a) a book source planted on one added tree turns L4 red; (b) mods.js with the plain rule reverted (the last
 *       pack's label, as M11 shipped it) turns L1 and L2 red — run in a vm sandbox, nothing on disk changes.
 *
 * Run (argv read by hand; anything else prints usage and exits 2):
 *   node test/f100_m12_labels.cjs
 * Ends `HARVEST: <n>`; exit 1 on any FAIL or a zero harvest.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
if (process.argv.length > 2) { console.error('usage: node test/f100_m12_labels.cjs'); process.exit(2); }

let harvest = 0, failures = 0;
const check = (ok, m) => { harvest++; if (ok) console.log('  PASS  ' + m); else { failures++; console.log('  FAIL  ' + m); } };
const J = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));

// the real fetchPack, its fetch served from disk (mods.js reads `fetch` at call time)
const diskFetch = (url) => {
  const file = path.join(ROOT, String(url).replace(/^\/+/, ''));
  const ok = fs.existsSync(file);
  return Promise.resolve({ ok, status: ok ? 200 : 404, json: () => Promise.resolve(JSON.parse(fs.readFileSync(file, 'utf8'))) });
};
global.fetch = diskFetch;
const M = require(path.join(ROOT, 'lib/shared/mods.js'));
const S = require(path.join(ROOT, 'lib/shared/sources.js'));
const IDX = S.buildIndex(J('public/data/canonical/books.vocab.json'));

const canon = (s) => J('public/data/canonical/' + s + '.json')[s];
const charbuild = () => ({ species: canon('species'), careers: canon('careers'), specializations: canon('specializations'),
  talents: canon('talents'), forcePowers: canon('force_powers'), skillNames: { cool: 'Cool' } });
const EOTE = 'respecialized@eote-v2', AOR = 'respecialized@aor-v2', FAD = 'respecialized@fad-v1';
const ALL3 = [EOTE, AOR, FAD];
const L_EOTE = 'reSpecialized — Edge of the Empire', L_FAD = 'reSpecialized — Force and Destiny', PLAIN = 'reSpecialized';
const LINELESS = ['cyber_soldier', 'detective', 'field_agent', 'infochant', 'majordomo', 'nerf_herder', 'overseer', 'pit_fighter',
  'poisoner', 'spice_dealer'];
const SHARED_BOOK = ['driver', 'heavy', 'mechanic', 'scout', 'slicer'];

// the mutant: mods.js with R-M12B-5's plain rule reverted to the last pack's label, in a vm sandbox
function loadMutant() {
  let src = fs.readFileSync(path.join(ROOT, 'lib/shared/mods.js'), 'utf8');
  const a = '? plainVariant(pack._variant) : pack._variant', b = '? plainVariant(last) : last';
  if (src.indexOf(a) === -1 || src.indexOf(b) === -1) return null;
  src = src.replace(a, '? pack._variant : pack._variant').replace(b, '? last : last');
  const sandbox = { module: { exports: {} }, console, fetch: diskFetch, Promise, JSON };
  vm.runInNewContext(src.replace('(typeof window !== \'undefined\' ? window : this)', '(this)'), sandbox);
  return sandbox.module.exports;
}

// L1 + L2 over a module: [[ok, message], …]
async function labelLegs(Mod) {
  const out = [];
  const view = async (stamps) => Mod.resolveForStamp(stamps, charbuild());
  const spec = (v, id) => { const r = Mod.variantOfRecord(null, 'specializations', v.specializations[id]); return r ? r.label : null; };
  const [vE, v3, vEA, vF] = [await view([EOTE]), await view(ALL3), await view([EOTE, AOR]), await view([FAD])];
  out.push([spec(vE, 'detective') === L_EOTE, 'L1 Detective, Edge of the Empire\'s only → ' + JSON.stringify(spec(vE, 'detective'))]);
  const lineless3 = LINELESS.map((id) => spec(v3, id));
  out.push([lineless3.every((l) => l === PLAIN), 'L1 the 10 line-less trees, all three on → ' + JSON.stringify([...new Set(lineless3)])]);
  const shared = SHARED_BOOK.map((id) => spec(vEA, id)), sharedE = SHARED_BOOK.map((id) => spec(vE, id));
  out.push([shared.every((l) => l === PLAIN) && sharedE.every((l) => l === L_EOTE),
    'L1 the 5 book trees eote-v2 and aor-v2 both rebuild: both on → ' + JSON.stringify([...new Set(shared)]) + ', Edge only → '
      + JSON.stringify([...new Set(sharedE)])]);
  out.push([spec(v3, 'arbiter') === L_FAD && spec(vF, 'arbiter') === L_FAD,
    'L1 Arbiter (fad-v1 alone places it), all three on → ' + JSON.stringify(spec(v3, 'arbiter'))]);
  out.push([spec(v3, 'advisor') === null, 'L1 a book tree no pack places (advisor) → ' + spec(v3, 'advisor')]);
  const car = (stamps, v, id) => { const r = Mod.variantOfRecord(stamps, 'careers', v.careers[id]); return r ? r.label : null; };
  out.push([car(ALL3, v3, 'syndicate') === PLAIN && car([EOTE], vE, 'syndicate') === L_EOTE,
    'L2 Syndicate: all three on → ' + JSON.stringify(car(ALL3, v3, 'syndicate')) + ', Edge only → ' + JSON.stringify(car([EOTE], vE, 'syndicate'))]);
  out.push([car(ALL3, v3, 'smuggler') === null && car([], v3, 'syndicate') === null,
    'L2 a re-rostered book career (smuggler) → ' + car(ALL3, v3, 'smuggler') + '; no stamps → ' + car([], v3, 'syndicate')]);
  const pw = (stamps, rec) => { const r = Mod.variantOfRecord(stamps, 'force_powers', rec); return r ? r.label : null; };
  out.push([pw(ALL3, v3.forcePowers.alter) === L_FAD && pw(ALL3, canon('force_powers').alter) === null,
    'L2 Force powers unchanged (M11 K4 (b)): fad-v1 alter → ' + JSON.stringify(pw(ALL3, v3.forcePowers.alter)) + ', the book alter → '
      + pw(ALL3, canon('force_powers').alter)]);
  return out;
}

// L4 over a set of packs: the offending (stamp:section.id) list, and the current stamps' non-[] list
function sourcesLeg(packs) {
  const baseSpecs = canon('specializations'), baseCareers = canon('careers');
  const resolves = [], notEmpty = [];
  let trees = 0, careers = 0;
  for (const [stamp, p] of packs) {
    const current = ALL3.indexOf(stamp) !== -1;
    const added = [].concat(
      Object.entries(p.specializations || {}).filter(([id]) => !baseSpecs[id]).map(([id, r]) => ['specializations', id, r]),
      Object.entries(p.careers || {}).filter(([id]) => !baseCareers[id]).map(([id, r]) => ['careers', id, r]));
    for (const [sec, id, r] of added) {
      if (current) { if (sec === 'careers') careers++; else trees++; }
      if ((r.sources || []).some((s) => IDX.aliasToId[s])) resolves.push(stamp + ':' + sec + '.' + id);
      if (current && JSON.stringify(r.sources) !== '[]') notEmpty.push(stamp + ':' + sec + '.' + id);
    }
  }
  return { resolves, notEmpty, trees, careers };
}

(async () => {
  for (const [ok, m] of await labelLegs(M)) check(ok, m);

  // L3 one label path
  const APP = fs.readFileSync(path.join(ROOT, 'player/app.jsx'), 'utf8');
  const TREE = fs.readFileSync(path.join(ROOT, 'lib/shared/treeView.jsx'), 'utf8');
  const treeAsks = /MODS\.variantOfRecord\(null, 'specializations', specData\)[\s\S]{0,120}?_variant: variant,/.test(TREE)
    && !/specData && specData\._variant/.test(TREE);
  const helperAsks = /function fcRecordSourceLabel\(section, rec, bookLabel\) \{[\s\S]{0,400}?MODS\.variantOfRecord\(MODS\.active\(\), section, rec\)/.test(APP);
  const sites = {
    'career rail row': /source: fcRecordSourceLabel\('careers', c, fcBookLabel\),/,
    'career head': /fcReadProse\(c\.name, fcRecordSourceLabel\('careers', c, fcBookLabel\),/,
    'specialization head': /fcReadProse\(sp\.name, fcRecordSourceLabel\('specializations', sp, fcBookLabel\),/,
    'talents sheet': /var bookName = fcRecordSourceLabel\('specializations', spec, function\(src\) \{/,
  };
  const missing = Object.keys(sites).filter((k) => !sites[k].test(APP));
  const ownReads = APP.split('\n').filter((l) => /\._variant\b/.test(l) && !/^\s*(\/\/|\*)/.test(l));
  check(treeAsks && helperAsks && !missing.length && !ownReads.length,
    'L3 one label path: treeView asks variantOfRecord ' + treeAsks + '; fcRecordSourceLabel asks it ' + helperAsks + '; the four sites call it'
      + (missing.length ? ' — MISSING ' + missing.join(', ') : ' (all 4)') + '; app.jsx lines reading a record\'s _variant: ' + ownReads.length);

  // L4 sources
  const stamps = M.SHIPPED_STAMPS.concat(Object.keys(M.SUPERSEDES));
  const packs = stamps.map((st) => {
    const d = M.packPath(st);
    let careers = null; try { careers = J(d + 'careers.overlay.json').careers || null; } catch (e) { careers = null; }
    return [st, { specializations: J(d + 'specializations.overlay.json').specializations, careers }];
  });
  const L4 = sourcesLeg(packs);
  check(!L4.resolves.length && !L4.notEmpty.length && L4.trees === 38 && L4.careers === 3,
    'L4 sources: over ' + stamps.length + ' packs no added record names a book source' + (L4.resolves.length ? ' — RESOLVES ' + L4.resolves.join(', ') : '')
      + '; the current stamps\' ' + L4.trees + ' added trees and ' + L4.careers + ' Syndicate copies are all []'
      + (L4.notEmpty.length ? ' — NOT [] ' + L4.notEmpty.join(', ') : ''));

  // BITE (a): a book source planted on one added tree
  const planted = packs.map(([st, p]) => [st, clone(p)]);
  planted.find(([st]) => st === AOR)[1].specializations.cypher.sources = ['aor'];
  const B4 = sourcesLeg(planted);
  check(B4.resolves.length === 1 && B4.notEmpty.length === 1, 'BITE (a): a book source planted on aor-v2 cypher turns L4 red ('
    + B4.resolves.join(', ') + ')');

  // BITE (b): the plain rule reverted
  const MUT = loadMutant();
  if (!MUT) check(false, 'BITE (b): the mutant could not be built (its two anchors are gone from mods.js)');
  else {
    const red = (await labelLegs(MUT)).filter(([ok]) => !ok).map(([, m]) => m.split(' → ')[0]);
    check(red.some((m) => /10 line-less/.test(m)) && red.some((m) => /5 book trees/.test(m)) && red.some((m) => /Syndicate/.test(m)),
      'BITE (b): mods.js with the last pack\'s label (the plain rule reverted) turns ' + red.length + ' legs red: ' + red.join(' · '));
  }

  console.log('\nHARVEST: ' + harvest);
  if (failures || !harvest) { console.log('f100_m12_labels: ' + failures + ' FAIL'); process.exit(1); }
  console.log('f100_m12_labels: ALL PASS');
})().catch((e) => { console.log('  FAIL  crashed: ' + (e && e.stack || e)); console.log('\nHARVEST: ' + harvest); process.exit(1); });
