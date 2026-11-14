/* r7_b1652_craft_log_under_tally — B-1652 (DECISIONS D-427 item 1; ruling `release-r7-bug-burndown` ADDENDA 401, 403; the approved
 * page Docs/mockups/release-r7-candidate2-fixes-look.html @ 8a97d5207): on the craft walk's CONSTRUCTION step, "Report the table's
 * result" (`craft-log-result`) sits directly UNDER the tally's counters (`rr-tally`), same words, same `hp-quiet` ink; "Roll here"
 * stays where it was. The counters live in the shared ResultsReference, so the move is a slot (`afterTally`) rendered right after
 * `rr-tally`, and only the craft walk passes one.
 *
 *   §A  ResultsReference renders props.afterTally directly after the rr-tally block (paper face)
 *   §B  the craft walk: craft-log-result is passed as afterTally, and is gone from the Roll here row
 *   §C  no other ResultsReference caller passes afterTally (they render as before)
 *
 * Red at the cut f9b7fa1eb (the button beside Roll here; no slot). Run: node test/r7_b1652_craft_log_under_tally.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let failures = 0, passes = 0;
function check(label, cond, detail) {
  if (cond) { passes += 1; console.log('  PASS  ' + label); }
  else { failures += 1; console.error('  FAIL  ' + label + (detail ? '  — ' + detail : '')); }
}
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const UI = read('lib/shared/ui.jsx'), APP = read('player/app.jsx');

console.log('§A the slot');
const t = UI.indexOf("'data-testid': 'rr-tally'");
const slot = UI.indexOf('props.afterTally || null', t);
const nextBlock = UI.indexOf("(character && scene === 'combat')", t);
check('ResultsReference renders props.afterTally', slot > 0);
check('…right after the rr-tally block, before anything else the face draws', t > 0 && slot > t && slot < nextBlock, [t, slot, nextBlock].join(' < '));

console.log('§B the craft walk');
const s2 = APP.indexOf('} else if (stepIdx === 2) {'), e2 = APP.indexOf('foot2 = <button type="button" className="hp-quiet" onClick={toBench}>', s2);
const step = s2 > 0 && e2 > s2 ? APP.slice(s2, e2) : '';
const rollRow = (step.match(/<div className="sb-pk-verbs"[^>]*>\s*<button[^>]*data-testid="craft-roll"[\s\S]*?<\/div>/) || [''])[0];
const after = (step.match(/afterTally: <div className="sb-pk-verbs"[\s\S]*?<\/div>/) || [''])[0];
check('the CONSTRUCTION step is found', step.length > 0);
check('"Roll here" keeps its row', /data-testid="craft-roll"[^>]*>Roll here</.test(rollRow));
check('craft-log-result is gone from the Roll here row', rollRow.length > 0 && rollRow.indexOf('craft-log-result') < 0, rollRow.slice(0, 200));
check('craft-log-result is passed as afterTally', /data-testid="craft-log-result"/.test(after));
check('…same words and ink: hp-quiet "Report the table’s result"', /className="hp-quiet" data-testid="craft-log-result"[^>]*>Report the table’s result</.test(after));
check('…writing the tally as before (Craft.logRoll(sel, readTally()))', /Craft\.logRoll\(sel, readTally\(\)\)/.test(after));
check('craft-log-result appears once in the step', step.split('data-testid="craft-log-result"').length === 2);

console.log('§C every other caller unchanged');
const callers = ['player/app.jsx', 'gm/app.jsx', 'lib/dice/diceSurface.jsx', 'lib/shared/diceRoll.jsx', 'lib/shared/ui.jsx']
  .map(p => [p, (read(p).match(/afterTally/g) || []).length]);
const want = { 'player/app.jsx': 1, 'lib/shared/ui.jsx': 1 };
callers.forEach(([p, n]) => check(p + ' names afterTally ' + (want[p] || 0) + '×', n === (want[p] || 0), String(n)));

console.log('\n' + passes + ' passed, ' + failures + ' failed');
process.exit(failures ? 1 : 0);
