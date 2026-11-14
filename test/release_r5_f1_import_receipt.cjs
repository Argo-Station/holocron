/**
 * release_r5_f1_import_receipt.cjs — release-r5-f1 D on the import receipt (F1 S4; ruling release-r5-f1-c0 + ADDENDUM 1, D-379).
 *   §W  B-1520: the receipt's LEFT IN THE FILE renderer, sliced from player/app.jsx, draws a `rigger_weapon` entry as its own row
 *       ["Signature Vehicle", "its weapon pick"] and does not throw (it fell into the companions branch and read
 *       `e.names.length` of undefined). BITE: without the branch it throws, as live did.
 *   §C  finding 8: a custom <CharVehicle> with no name prints "Your Signature Vehicle is a custom ship in OggDude, so no ship is
 *       marked as yours.", never the doubled "Your Signature Vehicle, your Signature Vehicle, …"; a named one keeps its name.
 *   §H  handleText settles the rigger (OGG.settleRigger is called there) and the receipt draws rep.rigger's section.
 * Run: node test/release_r5_f1_import_receipt.cjs
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const APP = fs.readFileSync(path.join(ROOT, 'player/app.jsx'), 'utf8');
const OGG = require(path.join(ROOT, 'lib/shared/oggImport.js'));
let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.error('  FAIL  ' + label + (detail !== undefined ? '  — ' + String(detail).slice(0, 400) : '')); }
}
function braced(src, at) {   // the object/function literal opening at the first '{' from `at`
  let i = src.indexOf('{', at), d = 0;
  for (let j = i; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}' && --d === 0) return src.slice(i, j + 1); }
  throw new Error('unbalanced at ' + at);
}
// ── §W ──
const COPY = braced(APP, APP.indexOf('var CF_COPY = {'));
const MAP_AT = APP.indexOf('paperLedger(rep.leftOut.map(function(e) {');
if (MAP_AT < 0) { console.error('FAIL  slice miss: the leftOut renderer'); process.exit(1); }
const MAP_FN = 'function(e) ' + braced(APP, MAP_AT + 'paperLedger(rep.leftOut.map('.length);
function rowsOf(fnSrc, entries) {
  const ctx = { window: { SWRPGOggImport: { rewardNamesOf: (k) => k } }, gameData: null };
  vm.createContext(ctx);
  ctx.CF_COPY = vm.runInContext('(' + COPY + ')', ctx);
  return JSON.parse(JSON.stringify(entries.map(vm.runInContext('(' + fnSrc + ')', ctx))));
}
const WEAPON = [{ kind: 'rigger_weapon', count: 1, index: 3 }];
let rows = null, err = null;
try { rows = rowsOf(MAP_FN, WEAPON); } catch (e) { err = e; }
check('§W B-1520: a rigger_weapon entry is its own row ["Signature Vehicle", "its weapon pick"], no throw', !err && JSON.stringify(rows) === JSON.stringify([['Signature Vehicle', 'its weapon pick']]), err || JSON.stringify(rows));
const BITTEN = MAP_FN.replace(/\n\s*if \(e\.kind === 'rigger_weapon'\)[^\n]*/, '');
let bitErr = null;
try { rowsOf(BITTEN, WEAPON); } catch (e) { bitErr = e; }
check('§W BITE: the renderer without the branch throws on the entry (live\'s TypeError)', BITTEN !== MAP_FN && !!bitErr && /TypeError/.test(String(bitErr)), bitErr);   // the vm's TypeError is another realm's: read by name
// ── §C ──
function custom(name) {
  const out = { parsed: { rigger: { vehicleKey: 'g-1' }, vehicles: [{ guid: 'g-1', itemKey: '', name: name }] }, oggSource: { report: {} } };
  return OGG.settleRigger(out, {}, { vessels: [], vehicles: [] });
}
const bare = custom(''), named = custom('The Long Shot');
check('§C finding 8: an unnamed custom ship reads the one undoubled line',
  bare && bare.status === 'CUSTOM' && bare.player === 'Your Signature Vehicle is a custom ship in OggDude, so no ship is marked as yours.', bare && bare.player);
check('§C a named custom ship keeps its name in the line',
  named && named.status === 'CUSTOM' && named.player === 'Your Signature Vehicle, The Long Shot, is a custom ship in OggDude, so no ship is marked as yours.', named && named.player);
check('§C BITE-shaped: no CUSTOM line doubles "your Signature Vehicle"', ![bare, named].some((r) => /Signature Vehicle, your Signature Vehicle/i.test(r.player)));
// ── §H ──
const HT = braced(APP, APP.indexOf('function handleText(text, filename) {'));
check('§H handleText settles the rigger after the schematics (OGG.settleRigger)', /OGG\.settleSchematics\(out, sheet\)[\s\S]*OGG\.settleRigger\(out, sheet,/.test(HT));
check('§H the receipt draws rep.rigger under SIGNATURE VEHICLE (BONDED: "Marked as yours: " + the ship)',
  /\{rep\.rigger \? \(/.test(APP) && /headRigger: 'SIGNATURE VEHICLE'/.test(APP) && /wordRiggerMarked: 'Marked as yours: '/.test(APP));
console.log('\n' + (fail ? 'FAIL' : 'OK') + ' — ' + pass + ' pass · ' + fail + ' fail');
process.exit(fail ? 1 : 0);
