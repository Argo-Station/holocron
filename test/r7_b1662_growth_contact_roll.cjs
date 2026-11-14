/* r7_b1662_growth_contact_roll — B-1662 (ruling `release-r7-bug-burndown` ADDENDUM 405; D-278's board
 * `lab/holocron/release_r4/frames.html` @ 227106522, S3-growth at 390 and 1440): the growth room's CONTACTS stage draws
 * SheetContactCard's ROLL, through the same `openHubGiven` contract the sheet's ALLIES card uses — one card, one roll path.
 *
 *   §A  SheetPaper mounts the growth room with `openHubGiven`, opening the hub on `{ given: g }` exactly as ALLIES' mount does
 *   §B  SheetAdvancement takes `openHubGiven` from its props
 *   §C  the CONTACTS stage hands it to ContactStage, which hands it to SheetContactCard (the one card)
 *   §D  the card's ROLL sends `{ spec, label, kind: 'contact' }` and nothing else draws a contact roll
 *
 * Red at the cut 468859b19 (the growth mount and the stage pass no openHubGiven). Run: node test/r7_b1662_growth_contact_roll.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'player', 'app.jsx'), 'utf8');

let failures = 0, passes = 0;
function check(label, cond, detail) {
  if (cond) { passes += 1; console.log('  PASS  ' + label); }
  else { failures += 1; console.error('  FAIL  ' + label + (detail ? '  — ' + detail : '')); }
}
function fnBody(name) {
  const at = SRC.indexOf('\nfunction ' + name + '(');
  if (at < 0) return '';
  const next = SRC.indexOf('\nfunction ', at + 1);
  return SRC.slice(at, next < 0 ? SRC.length : next);
}
const squash = (s) => s.replace(/\s+/g, ' ');

// §A — the two mounts in SheetPaper: the stack's (ALLIES' contract: SheetStack → SheetAllies → SheetContacts → the card) and the
// growth room's. A mount runs from its tag to the first line ending ` />` (JSX comments inside a mount may hold a `>`).
const paperRaw = fnBody('SheetPaper');
function mount(tag) {
  const at = paperRaw.indexOf('<' + tag + ' ');
  if (at < 0) return '';
  const end = paperRaw.slice(at).search(/\/>\s*\n/);
  return squash(paperRaw.slice(at, end < 0 ? undefined : at + end + 2));
}
const paper = squash(paperRaw);
const allies = mount('SheetStack');
const growth = mount('SheetAdvancement');
check('§A ALLIES reaches the hub through the stack (SheetStack → SheetAllies)', /<SheetAllies [^\n]*openHubGiven=\{p\.openHubGiven\}/.test(fnBody('SheetStack') || SRC));
const HUB_GIVEN = /openHubGiven=\{function \((\w+)\) \{ p\.setHubOpen\(\{ given: \1 \}\); \}\}/;
check('§A the stack is mounted with openHubGiven → setHubOpen({ given }) (the contract read)', HUB_GIVEN.test(allies), allies.slice(0, 200));
check('§A the growth room is mounted with the same openHubGiven → setHubOpen({ given })', HUB_GIVEN.test(growth), growth.slice(0, 240));
check('§A SheetAdvancement has one mount', (paper.match(/<SheetAdvancement /g) || []).length === 1
  && (SRC.match(/<SheetAdvancement |h\(SheetAdvancement\b/g) || []).length === 1);

// §B — SheetAdvancement takes it
const adv = fnBody('SheetAdvancement');
const sig = (adv.match(/^\nfunction SheetAdvancement\(\{([^}]*)\}\)/) || ['', ''])[1];
check('§B SheetAdvancement destructures openHubGiven', /\bopenHubGiven\b/.test(sig), sig);

// §C — the CONTACTS stage → ContactStage → SheetContactCard
const stage = squash(adv).match(/growthUnit === 'contacts'[^;]*;[^;]*;[^;]*;/);
check('§C the CONTACTS stage mounts ContactStage with openHubGiven', !!stage && /<ContactStage [^>]*openHubGiven=\{openHubGiven\}/.test(stage[0]),
  stage ? stage[0] : 'no contacts stage');
const cstage = squash(fnBody('ContactStage'));
check('§C ContactStage hands openHubGiven to SheetContactCard', /<SheetContactCard [^>]*openHubGiven=\{p\.openHubGiven\}/.test(cstage), cstage.slice(0, 240));

// §D — the one card, the one contract
const card = squash(fnBody('SheetContactCard'));
check("§D the card's ROLL sends { spec, label, kind: 'contact' }", /p\.openHubGiven\(\{ spec: spec, label: name, kind: 'contact' \}\)/.test(card));
// RE-POINTED BY NAME (card dice-roll-button-build R-DRB3-8, D-483): the testid now reaches the DOM as DicePlateButton's `testid` prop. KEEPS: one site draws
// contact-roll. DROPS: the literal `data-testid=` spelling at that site.
check('§D no other contact-roll is drawn (one card, one roll path)', (SRC.match(/(?:data-)?testid="contact-roll"/g) || []).length === 1);

console.log('\nr7_b1662_growth_contact_roll: ' + passes + ' passed, ' + failures + ' failed');
process.exit(failures ? 1 : 0);
