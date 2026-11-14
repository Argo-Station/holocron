// test/b1334_creator_force_access.cjs — B-1334 (ruling `release-r7-bug-burndown` ADDENDUM 76): the creator's Force
// rating reader, `creatorForceRating` (player/app.jsx), holds a Force Rating talent's bonus WITHOUT Force access, exactly
// as `computeDerived` does since B-701 (FaD p.282: a non-Force-sensitive character gets no use or benefit
// from it until Force-sensitive, Force Rating talents included).
// ONE formula: both readers ask `CharResolve.forceRatingOf(base, floor, bonus, access)`, and the access term is the one
// `computeDerived` uses — base > 0, or a floor talent, or the creation predicate (`forceAccessAtCreation`, the creator's
// `hasForceAccess`; `sheetForceAccess` is the same predicate over a saved sheet).
//
// Driven, never retyped: `creatorForceRating` is SLICED from the shipped source by name and run against the shipped
// talents registry and the shared core. `B1334_REF=<sha>` reads player/app.jsx at that commit (the red-first run).
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log('✓ ' + label); } else { fail++; console.log('✗ ' + label + (detail !== undefined ? '  — ' + JSON.stringify(detail).slice(0, 300) : '')); }
}
const REF = process.env.B1334_REF || null;
const app = REF ? execFileSync('git', ['show', REF + ':player/app.jsx'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 })
                : fs.readFileSync(path.join(ROOT, 'player/app.jsx'), 'utf8');
function slice(code, name) {
  const m = new RegExp('(^|\\n)([ \\t]*)function ' + name + '\\(').exec(code);
  if (!m) return null;
  const start = m.index + m[1].length;
  let i = code.indexOf('{', start), depth = 0;
  for (; i < code.length; i++) { if (code[i] === '{') depth++; else if (code[i] === '}' && --depth === 0) return code.slice(start, i + 1); }
  return null;
}

global.window = {};
const CharResolve = require('../lib/shared/charResolve.js');
const talents = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical/talents.json'), 'utf8')).talents;
const cb = { talents };
const body = slice(app, 'creatorForceRating');
check('creatorForceRating is found in player/app.jsx', !!body);
const creatorForceRating = new Function('CharResolve', 'window', body + '\nreturn creatorForceRating;')(CharResolve, global.window);

const FR = { a: { talentKey: 'force_rating' } };
check('the fixture talent exists and carries a force_rating_delta', !!(talents.force_rating && (talents.force_rating.effects || []).some((e) => e.op === 'force_rating_delta')));

const held = creatorForceRating(false, FR, cb);
check('B-1334: no Force access → a Force Rating rank is HELD mid-creation (rating 0, read ' + held + ')', held === 0, held);
const counted = creatorForceRating(true, FR, cb);
check('B-1334: with Force access the same rank counts (1 + 1 = 2, read ' + counted + ')', counted === 2, counted);
check('B-1334: no talent, no access → 0', creatorForceRating(false, {}, cb) === 0);
check('B-1334: no talent, access → 1', creatorForceRating(true, {}, cb) === 1);

// THE SAME ANSWER AS THE SHEET: computeDerived over a sheet holding the same talent, with and without access.
const sheet = (book, fb) => ({ book: book, characteristics: { brawn: 2, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
  forceRatingBase: fb, talents: [{ id: 'force_rating', ranks: 1 }], specializations: [], skills: {},
  derivedBonuses: { soakBonus: 0, woundThresholdBonus: 0, strainThresholdBonus: 0, meleeDefenseBonus: 0, rangedDefenseBonus: 0, forceRatingBonus: 1 } });
const full = { talents, species: {}, careers: {}, specializations: {} };
const dNo = CharResolve.computeDerived(sheet('eote', 0), null, full).forceRating;
const dYes = CharResolve.computeDerived(sheet('fad', 1), null, full).forceRating;
check('B-1334: the creator and the sheet agree without access (' + held + ' vs computeDerived ' + dNo + ')', held === dNo, { held, dNo });
check('B-1334: the creator and the sheet agree with access (' + counted + ' vs computeDerived ' + dYes + ')', counted === dYes, { counted, dYes });

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
