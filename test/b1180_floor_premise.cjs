#!/usr/bin/env node
/**
 * b1180_floor_premise.cjs — B-1180 (ruling `release-r7-bug-burndown` ADDENDUM 55 (A), ADDENDUM 75): computeDerived's legacy
 * floor is LOWERED by what a house rule takes away — floor = snapshot − max(0, computed over the BOOK − computed over the
 * character's OWN view) — one more pass of the one computeDerived, nothing persisted.
 *
 * Fixture: test/char_resolve_floor_held.cjs's own — the Colonist pregen Maro Jinx (snapshot strain 13, wound 12) under the
 * frames' Marshal Rework (Grit and Toughened swapped in the Marshal tree's first row), its projection re-done by
 * SWRPGProjectionDiff.diff as an attach writes it. The book is the shipped sections (`_canonicalCharbuildBase`, as both
 * hosts set it).
 *   (1) ADDENDUM 55's first guard — Maro reads 12: strain 10 + Willpower 2 under the house rule; wound 14 as before.
 *       With the stamp view registered, and again with the resolver off (the persisted re-projected projection).
 *   (2) the second — a legacy record with HAND EXTRAS and no house rule keeps its floor unchanged: the shipped Maro with
 *       a snapshot raised by hand (strain 15) reads 15, and derivedFloorHeld names it { computed 13, held 15 }.
 *   (3) the third — derivedFloorHeld still names what binds: the same hand extras UNDER the house rule hold 15 − 1 = 14
 *       ({ computed 12, held 14 }), and held === computeDerived wherever non-null.
 *   (4) max(0): a view that GIVES more than the book never raises a floor (book and own swapped: the floor stays 13).
 *   (5) no house rule, nothing moves: every shipped pregen × {book, no charbuild} × resolver {off, book} × armour reads
 *       byte-identical with the book loaded and without it.
 *   (6) the implant lines ride above the floor (ADDENDUM 52/73): an in-use implant's wound +N lands on top of the lowered
 *       floor on the floored branch — read at the gate; pinned here as "the floor pass adds no implant line".
 * RED AT THE CUT (5686fd2f9 and the merged base 3eac48a6d, exit 1): (1) reads 13, (3) holds 15.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const CR = require(path.join(ROOT, 'lib/shared/charResolve.js'));
global.CharResolve = CR;
const PD = require(path.join(ROOT, 'lib/shared/projectionDiff.js'));

let pass = 0, fail = 0;
const check = (label, ok, detail) => { if (ok) { pass++; console.log('  PASS  ' + label); } else { fail++; console.log('  FAIL  ' + label + (detail !== undefined ? '\n        ' + JSON.stringify(detail).slice(0, 400) : '')); } };
const clone = (v) => JSON.parse(JSON.stringify(v));
const reg = (s) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', s + '.json'), 'utf8'))[s];
const CB = { species: reg('species'), careers: reg('careers'), specializations: reg('specializations'), talents: reg('talents'), forcePowers: reg('force_powers') };
const PREGENS = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/pregen_sheets.json'), 'utf8')).characters;
const MARO = PREGENS.filter((c) => c.id === 'colonist')[0];
const VIEW = clone(CB);
(() => { const row = VIEW.specializations.marshal.talent_tree[0].talents, a = row[1].talent; row[1].talent = row[3].talent; row[3].talent = a; })();
const attached = (sheet) => { const d = PD.diff(sheet, VIEW);
  return Object.assign({}, sheet, d.stale ? { talents: d.rendered.talents, derivedBonuses: d.rendered.derivedBonuses, derivedConditional: d.rendered.derivedConditional } : {}); };
const withBook = (book, fn) => { const was = global._canonicalCharbuildBase; global._canonicalCharbuildBase = book; try { return fn(); } finally { if (was === undefined) delete global._canonicalCharbuildBase; else global._canonicalCharbuildBase = was; } };
const held = (s, cb) => CR.derivedFloorHeld(s, null, cb);
console.log('B-1180 · THE FLOOR A HOUSE RULE LOWERS (ADDENDUM 55 (A))');

const after = attached(clone(MARO));
check('fixture: the attach re-projects Maro’s owned 0-1 from Grit to Toughened; the snapshot is strain 13, wound 12',
  after.talents.some((t) => t.id === 'toughened') && !after.talents.some((t) => t.id === 'grit') && MARO.derived.strainThreshold === 13 && MARO.derived.woundThreshold === 12);

withBook(CB, () => {
  CR.setTalentViewResolver(() => VIEW);
  const d = CR.computeDerived(after, null, VIEW), h = held(after, VIEW);
  check('(1) Maro reads 12 under the house rule (stamp view registered): strain 12, wound 14', d.strainThreshold === 12 && d.woundThreshold === 14, d);
  check('(1) …and derivedFloorHeld holds nothing for strain (12 binds nothing)', h.strainThreshold === null && h.woundThreshold === null && h.forceRating === null, h);
  CR.setTalentViewResolver(null);
  const d0 = CR.computeDerived(after, null, VIEW);
  check('(1) resolver off (the persisted re-projected projection, own view passed): strain 12', d0.strainThreshold === 12 && d0.woundThreshold === 14, d0);

  const extras = clone(MARO); extras.derived.strainThreshold = 15;
  CR.setTalentViewResolver(() => CB);
  const d2 = CR.computeDerived(extras, null, CB), h2 = held(extras, CB);
  check('(2) hand extras, no house rule: the floor is unchanged — strain 15', d2.strainThreshold === 15, d2);
  check('(2) …derivedFloorHeld names it { computed 13, held 15 }', h2.strainThreshold && h2.strainThreshold.computed === 13 && h2.strainThreshold.held === 15, h2);

  const both = attached(extras);
  CR.setTalentViewResolver(() => VIEW);
  const d3 = CR.computeDerived(both, null, VIEW), h3 = held(both, VIEW);
  check('(3) hand extras UNDER the house rule: the floor is lowered by what the rule took (15 − 1 = 14)', d3.strainThreshold === 14, d3);
  check('(3) derivedFloorHeld names what binds: { computed 12, held 14 }, held === computeDerived',
    h3.strainThreshold && h3.strainThreshold.computed === 12 && h3.strainThreshold.held === 14 && h3.strainThreshold.held === d3.strainThreshold, h3);
  CR.setTalentViewResolver(null);
});

withBook(VIEW, () => {   // the "book" is the rework and the character's own view the shipped book: the own view GIVES +1
  CR.setTalentViewResolver(() => CB);
  const d = CR.computeDerived(clone(MARO), null, CB);
  check('(4) max(0): a view that gives more than the book never raises the floor — Maro stays 13', d.strainThreshold === 13, d);
  CR.setTalentViewResolver(null);
});

{ let n = 0; const moved = [];
  const armour = [null, { armor: { soak: 2, defense: 1 }, weapons: [] }];
  [null, () => CB].forEach((res) => { CR.setTalentViewResolver(res);
    PREGENS.forEach((p) => [undefined, CB].forEach((cb) => armour.forEach((eq) => {
      n++;
      const off = JSON.stringify(CR.computeDerived(clone(p), eq, cb)), on = withBook(CB, () => JSON.stringify(CR.computeDerived(clone(p), eq, cb)));
      if (off !== on) moved.push([p.name, off, on]);
    }))); });
  CR.setTalentViewResolver(null);
  check('(5) no house rule, nothing moves: ' + n + ' pregen calls byte-identical with the book loaded and without', n >= 100 && moved.length === 0, moved.slice(0, 2)); }

{ const src = fs.readFileSync(path.join(ROOT, 'lib/shared/charResolve.js'), 'utf8');
  const i = src.indexOf('if (_preFloor === _FLOOR_PASS) return out;'), j = src.indexOf('_addImplantDeltas(out, resolvedEquipment, _tr);   // B-1518 (ADDENDUM 47)');
  check('(6) the floor pass returns before the floored branch adds any implant line (the implant rides above the floor)', i > 0 && j > i); }

console.log('\nb1180_floor_premise: ' + pass + ' PASS · ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
