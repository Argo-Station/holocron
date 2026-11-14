// B-1605 (ruling release-r7-bug-burndown ADDENDUM 288; B-1498's class): ONE resolver for an Obligation/Duty type's NAME,
// `lib/shared/mechTypeNames.js`, read by the sheet, the creator review and both PDF exporters (charter §8).
//   R  the resolver: every registry key → its name; a type that is no key → as stored; '' stays ''.
//   L  the creator review's lift is byte-identical: the cut's inline lookup (narrativeMechanics' items `.find` by key) and
//      the resolver agree on every key of both registries, a name-form type and the empty descriptor.
//   S  the source: the review's inline `.find` and B-1498's local loader are gone (one resolution path), and both PDF
//      exporters print through the resolver (B1605a / B1605b's faces; the browser legs are smoke_r7_b1605_mech_names.py).
// Red at the cut c3299ad66 by exit code (the module is absent: R fails, S fails).
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let ok = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { ok++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label + (detail !== undefined ? '  — ' + JSON.stringify(detail) : '')); }
}
const reg = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
const OBL = reg('obligation-types.json'), DUTY = reg('duty-types.json');

let M = null;
try { M = require(path.join(ROOT, 'lib/shared/mechTypeNames.js')); } catch (e) { M = null; }
check('B1605 R: lib/shared/mechTypeNames.js loads', !!M);

if (M) {
  const names = M.fromRegistries(OBL, DUTY);
  const bad = [];
  [['obligation', OBL], ['duty', DUTY]].forEach(([track, r]) => r.items.forEach((t) => {
    if (M.name(names, track, t.key) !== t.name) bad.push([track, t.key]);
  }));
  check('B1605 R: every key of both registries resolves to its name (' + (OBL.items.length + DUTY.items.length) + ')', bad.length === 0, bad.slice(0, 5));
  check('B1605 R: a name-form type prints as stored', M.name(names, 'duty', 'Recruitment') === 'Recruitment');
  check('B1605 R: a key on the other track prints as stored', M.name(names, 'obligation', 'COMBATVICTORY') === 'COMBATVICTORY');
  check('B1605 R: no names in hand → the type as stored', M.name(null, 'duty', 'COMBATVICTORY') === 'COMBATVICTORY');

  // L — the cut's inline lookup, verbatim in effect (player/app.jsx FCReviewMechanicSection @ c3299ad66).
  const nm = { oblTypes: OBL, dutyTypes: DUTY };
  function cutReview(type, descriptor) {
    let typeName = descriptor || '';
    if (type === 'obligation') { const oi = ((nm.oblTypes || {}).items || []).find((t) => t.key === descriptor); if (oi) typeName = oi.name; }
    else if (type === 'duty') { const di = ((nm.dutyTypes || {}).items || []).find((t) => t.key === descriptor); if (di) typeName = di.name; }
    return typeName;
  }
  function tipReview(type, descriptor) {
    return M.name(M.fromRegistries(nm.oblTypes, nm.dutyTypes), type, descriptor || '');
  }
  const cases = [];
  OBL.items.forEach((t) => cases.push(['obligation', t.key]));
  DUTY.items.forEach((t) => cases.push(['duty', t.key]));
  cases.push(['obligation', 'Recruitment'], ['duty', 'Recruitment'], ['obligation', ''], ['duty', undefined], ['duty', 'RESP']);
  const diff = cases.filter(([ty, d]) => cutReview(ty, d) !== tipReview(ty, d));
  check('B1605 L: the review prints byte-identical to the cut on ' + cases.length + ' descriptors', diff.length === 0, diff.slice(0, 5));
}

const app = fs.readFileSync(path.join(ROOT, 'player/app.jsx'), 'utf8');
check('B1605 S: the review\'s inline `.find(… mech.descriptor)` lookup is retired',
  !/\.find\(function\(t\) \{ return t\.key === mech\.descriptor; \}\)/.test(app.replace(/morPairs\.strengths[^\n]*/g, '')));
check('B1605 S: no second resolver in player/app.jsx (B-1498\'s local loader and its map are gone)',
  !/function loadMechTypeNames|var _mechTypeNames|function mechTypeName\(/.test(app));
function body(fn) {
  const i = app.indexOf('async function ' + fn + '(');
  if (i < 0) return '';
  const j = app.indexOf('\nasync function ', i + 1), k = app.indexOf('\nfunction ', i + 1);
  return app.slice(i, Math.min(j < 0 ? app.length : j, k < 0 ? app.length : k));
}
const custom = body('generateCustomPdf'), ffg = body('generateFFGPdf');
check('B1605 S (a): generateCustomPdf\'s mechanic block prints through the resolver',
  /SWRPGMechTypeNames\.load/.test(custom) && /mechTypeName\(mechNames, blk\.track, mech\.type\)/.test(custom) && !/text\(p2, \(mech\.type \|\| ''\)/.test(custom));
check('B1605 S (b): generateFFGPdf\'s Obligation1 and Duty1 fill through the resolver',
  /set\('Obligation1',[^\n]*mechTypeName\([^\n]*'obligation'/.test(ffg) && /set\('Duty1', mechTypeName\([^\n]*'duty'/.test(ffg));
const html = fs.readFileSync(path.join(ROOT, 'player/index.html'), 'utf8');
check('B1605 S: player/index.html loads the resolver before app.js',
  html.indexOf('/lib/shared/mechTypeNames.js') > 0 && html.indexOf('/lib/shared/mechTypeNames.js') < html.indexOf('<script defer src="/player/app.js"'));

console.log(ok + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
