#!/usr/bin/env node
/* test/b134_mods_conflict_label.cjs — B-134: the sync conflict sheet names a game variant, never its storage id.
 *
 * The defect (R-LD-3, the first real live conflict, 2026-08-07): the swrpg_mods line read "1 on: respecialized@eote-v1"
 * — the stored stamp, version and all. Lap f100-fix-live-numbers-s (card f100-triage-census-card ADDENDUM 7): each
 * stamp reads as the loaded pack's manifest label, else (pack not loaded) the mod's plain name and the line's book
 * title, the way bookTitle degrades; a value with no "@" is untouched.
 *
 * The SHIPPED text runs: the CONFLICT-COPY region of lib/shared/ui.jsx is sliced and evaluated (the sync_pins_key
 * harness), with a `window` carrying the REAL lib/shared/mods.js (loaded in a vm) and, for the loaded case, a pack whose
 * `_variant` is built from the shipped manifest.
 *
 * Run: node test/b134_mods_conflict_label.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let pass = 0, fail = 0;
function check(label, ok, detail) {
  console.log((ok ? '  PASS  ' : '  FAIL  ') + label + (ok || detail === undefined ? '' : '\n          -> ' + JSON.stringify(detail)));
  ok ? pass++ : fail++;
}

const uiSrc = read('lib/shared/ui.jsx');
const a = uiSrc.indexOf('  // ── CONFLICT-COPY REGION START'), b = uiSrc.indexOf('  // ── CONFLICT-COPY REGION END');
const region = uiSrc.slice(a, b) + '\nreturn { describeConflict: describeConflict };';
const uiWith = (win) => new Function('window', region)(win);

// the real mods.js, in a sandbox that is its own window
const sb = { console: console, JSON: JSON, Math: Math, Object: Object, Array: Array, String: String, Number: Number };
sb.window = sb;
vm.createContext(sb);
vm.runInContext(read('lib/shared/mods.js'), sb, { filename: 'mods.js' });
const MODS = sb.SWRPGMods;

// the sources index the app hands bookTitle, from the shipped vocabulary. RE-POINTED (B-1514, card
// f100-surfacing-roll-options-card ADDENDUM 62): bookTitle reads the REAL lib/shared/sources.js — its ONE resolver
// sourceLabel over the loaded index (window._swrpgSourcesIndex). The old fake modelled `SWRPGSources.index()`, an API
// sources.js never exported, so this guard was green over a title the app could never show.
const books = JSON.parse(read('public/data/canonical/books.vocab.json')).entries;
const byId = {}; books.forEach((e) => { byId[e.id] = { title: e.label }; });
const ssb = { console: console, JSON: JSON, Math: Math, Object: Object, Array: Array, String: String, Number: Number };
ssb.window = ssb;
vm.createContext(ssb);
vm.runInContext(read('lib/shared/sources.js'), ssb, { filename: 'sources.js' });
const REAL_SOURCES = ssb.SWRPGSources;
const INDEX = REAL_SOURCES.buildIndex({ entries: books });
const SOURCES = REAL_SOURCES;
const winWith = (o) => Object.assign({ SWRPGSources: SOURCES, _swrpgSourcesIndex: INDEX }, o);

const STAMP = 'respecialized@eote-v1';
const MAN = JSON.parse(read('public/data/mods/respecialized/eote-v1/manifest.json'));
const line = (UI, mods) => UI.describeConflict({ key: 'swrpg_mods', kind: 'envelope', local: { mods: mods }, remote: { mods: [] } }).here;

console.log('B-134: the conflict sheet names a variant, not its storage id\n');
check('HARNESS the region was found', a >= 0 && b > a, { a, b });
check('HARNESS the real mods.js loaded', !!MODS && typeof MODS.variantOf === 'function');

// 1. the pack NOT loaded (variantOf null until warm): plain name + book title
const cold = line(uiWith(winWith({ SWRPGMods: MODS })), [STAMP]);
check('unloaded pack: no "@" and no version in the line', !/@|-v\d/.test(cold), cold);
check('unloaded pack: reads "reSpecialized — ' + byId.eote.title + '"', cold === '1 on: reSpecialized — ' + byId.eote.title, cold);

// 2. the pack loaded: the manifest's own label
const warmMods = Object.assign({}, MODS, { variantOf: (s) => (s === STAMP ? { mod: MAN.mod, label: MAN.label } : null) });
const warm = line(uiWith(winWith({ SWRPGMods: warmMods })), [STAMP]);
check('loaded pack: reads the manifest label "' + MAN.label + '"', warm === '1 on: ' + MAN.label, warm);

// B-1514's BITE: the old read (`SWRPGSources.index()`) put back in the sliced region must lose the title (the readable id)
const OLD_READ = "var lab = src && src.sourceLabel ? src.sourceLabel(window._swrpgSourcesIndex || null, id) : null;\n      if (lab && lab !== id) return lab;";
check('HARNESS B-1514: the resolver line is in the region, once', region.split(OLD_READ).length === 2);
const oldRegion = region.replace(OLD_READ, "var idx = src && src.index && src.index(); var meta = idx && idx.byId && idx.byId[id];\n      if (meta && meta.title) return meta.title;");
const oldCold = line(new Function('window', oldRegion)(winWith({ SWRPGMods: MODS })), [STAMP]);
check('B-1514 BITE: the old index() read gives the readable id ("' + oldCold + '"), not the title', oldCold !== cold && /Eote/.test(oldCold), oldCold);

// 3. no window at all (the harness sync_pins_key runs): still no "@"; a non-stamp value is untouched
const bare = uiWith(undefined);
check('no window: no "@" in the line', !/@/.test(line(bare, [STAMP])), line(bare, [STAMP]));
check('a value with no "@" is untouched (sync_pins_key\'s "2 on: a, b")', line(bare, ['a', 'b']) === '2 on: a, b', line(bare, ['a', 'b']));

console.log('\n  B-134 conflict label: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
