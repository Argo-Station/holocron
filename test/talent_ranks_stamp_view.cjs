// test/talent_ranks_stamp_view.cjs — R-S5R-17 (ruling `shipyard-s5-ready` ADDENDUM 7): the Yard's ONE ctx builder projects a
// character's owned positions through THAT CHARACTER'S OWN trees — its stamp view (CharResolve.talentViewFor, f100-m5 C4.1)
// first, else the device's discovery view, else the pristine base (ADDENDUM 3's step). The B-984 class's third reader.
//
// Driven, never retyped: `talentRanksOf` is SLICED from lib/shared/vesselView.jsx by name and run over the real
// lib/shared/charResolve.js, whose talent-view resolver is registered here as a host registers it at boot.
// The case: Bex owns Modder 0-3 (Signature Vehicle in the shipped tree). Her sheet is STAMPED with a pack whose Modder tree
// puts Grit at 0-3; this device's toggles differ (its discovery view is the shipped tree). Her ranks must be her pack's.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log('✓ ' + label); } else { fail++; console.log('✗ ' + label + (detail !== undefined ? '  — ' + JSON.stringify(detail).slice(0, 300) : '')); }
}
function slice(code, name) {
  const m = new RegExp('(^|\\n)([ \\t]*)function ' + name + '\\(').exec(code);
  if (!m) return null;
  const start = m.index + m[1].length;
  let i = code.indexOf('{', start), depth = 0;
  for (; i < code.length; i++) { if (code[i] === '{') depth++; else if (code[i] === '}' && --depth === 0) return code.slice(start, i + 1); }
  return null;
}
const SPECS = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical/specializations.json'), 'utf8')).specializations;
const CR = require(path.join(ROOT, 'lib/shared/charResolve.js'));
// B-1084 (R-S5R-23) factored the chain out as `talentChainOf`, which talentRanksOf (and deviceResolveCtx's rows) now call:
// sliced with it, so the chain driven here is still the shipped one. KEPT: talentRanksOf by name; ADDED: its one helper.
const vvSrc = fs.readFileSync(path.join(ROOT, 'lib/shared/vesselView.jsx'), 'utf8');
const fn = [slice(vvSrc, 'talentChainOf'), slice(vvSrc, 'talentRanksOf')].filter(Boolean).join('\n');
check('talentRanksOf (and the chain it calls, talentChainOf) are sliced from the shipped vesselView.jsx',
  /function talentRanksOf\(/.test(fn) && /function talentChainOf\(/.test(fn));
const win = { CharResolve: CR };
const talentRanksOf = new Function('window', fn + '\nreturn talentRanksOf;')(win);

// the pack's Modder tree: Signature Vehicle at 0-3 becomes Grit (a different talent, so the source of the answer shows)
const PACK = JSON.parse(JSON.stringify(SPECS));
PACK.modder.talent_tree[0].talents[3].talent = 'grit';
check('fixture: the shipped Modder puts Signature Vehicle at 0-3; the pack\'s puts Grit there',
  SPECS.modder.talent_tree[0].talents[3].talent === 'signature_vehicle' && PACK.modder.talent_tree[0].talents[3].talent === 'grit');
const BEX = { id: 'char_b', sheetData: { stamps: ['user:bex_pack'], specializations: [{ id: 'modder', owned: ['0-3'] }] } };
const ids = (o) => Object.keys(o).sort();

// a host's resolver at boot: a sheet stamped with the pack reads the pack's trees; any other sheet, none (C4.4's null)
CR.setTalentViewResolver(function (sheet) {
  return sheet && Array.isArray(sheet.stamps) && sheet.stamps.indexOf('user:bex_pack') !== -1 ? { talents: {}, specializations: PACK } : null;
});
win._canonicalCharbuild = { specializations: SPECS };            // this device's toggles: the shipped tree
win._canonicalCharbuildBase = { specializations: SPECS };
check('R-S5R-17: a sheet stamped with a pack, on a device toggled otherwise, gets ITS PACK\'S ranks (Grit), not the device\'s (Signature Vehicle)',
  JSON.stringify(ids(talentRanksOf(BEX))) === JSON.stringify(['grit']), talentRanksOf(BEX));
win._canonicalCharbuild = null;                                     // a pack save / a toggle nulled the discovery view
check('…and still after the discovery view is nulled (the stamp view does not depend on it)',
  JSON.stringify(ids(talentRanksOf(BEX))) === JSON.stringify(['grit']), talentRanksOf(BEX));
const UNSTAMPED = { id: 'char_u', sheetData: { specializations: [{ id: 'modder', owned: ['0-3'] }] } };
check('ADDENDUM 3\'s step: no stamp view, the discovery view nulled → the pristine base answers (Signature Vehicle), never {}',
  JSON.stringify(ids(talentRanksOf(UNSTAMPED))) === JSON.stringify(['signature_vehicle']), talentRanksOf(UNSTAMPED));
win._canonicalCharbuild = { specializations: PACK };                // a device that toggled the pack ON for discovery
check('no stamp view, the discovery view present → the discovery view answers (the device\'s Grit)',
  JSON.stringify(ids(talentRanksOf(UNSTAMPED))) === JSON.stringify(['grit']), talentRanksOf(UNSTAMPED));
win._canonicalCharbuild = null; win._canonicalCharbuildBase = null;
check('nothing loaded at all → {} (the builder\'s pre-load answer)', JSON.stringify(talentRanksOf(UNSTAMPED)) === '{}');

console.log('\ntalent_ranks_stamp_view: ' + pass + '/' + (pass + fail) + (fail ? ' (' + fail + ' FAILED)' : ' ALL PASS'));
process.exit(fail ? 1 : 0);
