/* test/vessel_source_key.cjs — B-336's C1, given a home off the retiring face (ruling `shipyard-s4-catalogue-card`
 * R-S4CC-26: "C1's data check, which needs a home before the suite can retire").
 *
 * `smoke_b336_vessel_source_control` (retired at the shipyard-s5 flip; last tree 9fb68187) B2 asserted a part's cite shows the book's TITLE and not its KEY. That pair only
 * discriminates if the record really stores the key: were the stored value already the title, a dead resolver would print
 * the same words. C1 pins the data side, face-independent:
 *   - the control part stores the vocabulary KEY, not a title;
 *   - the key is a books-vocabulary entry, and its label is the title B2 expects (so the two differ in case and separator);
 *   - EVERY vehicle attachment's sources are vocabulary keys (the class, not one record).
 * The browser half (B1/B2) re-pointed to FIT: `smoke_yard_s4_fit` "b336 B1/B2 @390".
 * Run: node test/vessel_source_key.cjs   (SOURCE_KEY_ATTACHMENTS=<file> runs it against another copy: the bite)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const J = (p) => JSON.parse(fs.readFileSync(path.isAbsolute(p) ? p : path.join(ROOT, p), 'utf8'));

const TARGET_ID = 'advanced_subspace_encryption_array', TARGET_KEY = 'desperate_allies', TARGET_TITLE = 'Desperate Allies';
const ATT = J(process.env.SOURCE_KEY_ATTACHMENTS || 'public/data/canonical/vehicle-attachments.json').vehicle_attachments;
const BOOKS = new Map(J('public/data/canonical/books.vocab.json').entries.map((e) => [e.id, e]));

let ok = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { ok++; console.log('PASS  ' + label); }
  else { fail++; console.log('FAIL  ' + label + (detail !== undefined ? '  — ' + JSON.stringify(detail) : '')); }
}

const rec = ATT[TARGET_ID] || {};
check('C1 the control record stores the vocabulary KEY, not a title', JSON.stringify(rec.sources) === JSON.stringify([TARGET_KEY]),
  { stored: rec.sources, expected: [TARGET_KEY] });
const b = BOOKS.get(TARGET_KEY);
check('C1 the key is a books-vocabulary entry whose label is the title B2 expects, and the two differ',
  !!b && b.label === TARGET_TITLE && TARGET_KEY !== TARGET_TITLE && TARGET_KEY !== TARGET_TITLE.toLowerCase(), b && b.label);
const bad = Object.entries(ATT).flatMap(([id, a]) => (a.sources || []).filter((s) => !BOOKS.has(s)).map((s) => id + ':' + s));
check('C1 every vehicle attachment\'s sources are vocabulary keys (' + Object.keys(ATT).length + ' parts)', bad.length === 0, bad.slice(0, 5));

console.log('\n' + ok + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
