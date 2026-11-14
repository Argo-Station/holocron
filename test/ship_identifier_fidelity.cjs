#!/usr/bin/env node
/**
 * ship_identifier_fidelity.cjs — STANDING guard: the PRODUCTION ship identifier draws exactly the APPROVED drawing
 * (card `shipyard-schematic-build-card` R-SSB-2, C-MU-4; DECISIONS D-211, D-212).
 *
 * test/fixtures/ship_identifier_approved.json holds the approved drawings as normalized SVG markup, rendered by the LAB
 * module at its approved commit (scripts/export_ship_identifier_fixture.cjs, which records that commit). This guard renders
 * every case through lib/shared/shipSchematic.js's own Small/Large with the same element builder and serializer
 * (test/fixtures/ship_identifier_svg.cjs) and compares the markup EXACTLY, with the root's width and height.
 *
 * FOUNDING CASE: the port itself — one moved point in any family glyph turns this red (bitten at the gate, by exit code).
 * Run: node test/ship_identifier_fidelity.cjs
 */
'use strict';
const path = require('path');
const S = require('../lib/shared/shipSchematic.js');
const { h, normalized } = require('./fixtures/ship_identifier_svg.cjs');
const FX = require('./fixtures/ship_identifier_approved.json');

let failures = 0, compared = 0;
const fail = (msg) => { failures += 1; if (failures <= 12) console.error('  FAIL  ' + msg); };

if (!/^c5ba89356/.test(FX.lab.commit)) fail('the fixture was not exported from the approved lab commit c5ba89356 (read ' + FX.lab.commit + ')');
if (FX.ink !== S.INK || FX.ground !== S.GROUND) fail('the fixture\'s inks (' + FX.ink + ' / ' + FX.ground + ') are not production\'s (' + S.INK + ' / ' + S.GROUND + ')');

const VEH = {};
const fs = require('fs'), dir = path.join(__dirname, '..', 'public', 'data', 'vehicle-library');
fs.readdirSync(dir).filter((f) => f.endsWith('.json') && !/^(index|taxonomy)\.json$/.test(f))
  .forEach((f) => (JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).entries || []).forEach((e) => { VEH[e.key] = e; }));
const recs = FX.records.map((R) => R.synthetic || VEH[R.ref]);
FX.records.forEach((R, i) => { if (!recs[i]) fail('record ' + R.ref + ' is no longer in the vehicle library (re-export the fixture)'); });

const seenForms = {};
FX.rows.forEach((row) => {
  const [ri, form, size, key, mi, width, height] = row, rec = recs[ri];
  if (!rec) return;
  const tree = form === 'small' ? S.Small(h, { rec, size, ink: S.INK }) : S.Large(h, rec, S.INK, S.GROUND, { size, key: !!key });
  const got = normalized(tree);
  compared += 1;
  seenForms[S.famOf(rec) + '|' + ((S.bandOf(rec.silhouette) || { id: 'none' }).id) + '|' + form] = 1;
  if (got.svg !== FX.markup[mi] || got.width !== width || got.height !== height) {
    let i = 0; const a = FX.markup[mi], b = got.svg; while (i < a.length && a[i] === b[i]) i += 1;
    fail(FX.records[ri].ref + ' ' + form + ' ' + size + (key ? ' +key' : '') + ': differs at ' + i + ' — approved …' + a.slice(Math.max(0, i - 40), i + 40) + '… production …' + b.slice(Math.max(0, i - 40), i + 40) + '…'
      + (got.width !== width || got.height !== height ? ' (size ' + got.width + '×' + got.height + ' vs ' + width + '×' + height + ')' : ''));
  }
});
// coverage: every family × band × form is in the fixture (R-SSB-2)
S.FAMILIES.forEach((fam) => S.BANDS.forEach((b) => ['small', 'full'].forEach((form) => {
  if (!seenForms[fam + '|' + b.id + '|' + form]) fail('the fixture holds no ' + fam + ' × ' + b.id + ' × ' + form + ' case');
})));

console.log('ship_identifier_fidelity: ' + compared + ' drawings compared against lab ' + FX.lab.commit.slice(0, 9) + ' · ' + failures + ' failure(s)');
process.exit(failures ? 1 : 0);
