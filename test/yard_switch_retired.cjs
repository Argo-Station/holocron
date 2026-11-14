// test/yard_switch_retired.cjs — K9, THE SHIP YARD'S SWITCH, IS RETIRED (ruling `shipyard-s5-ready` ADDENDUM 8, R-S5R-18,
// R-S5R-20.2/.3). At the S5 flip the S4 Yard became the only Yard and its old faces were deleted. The persisted key is LEFT in
// a user's localStorage (no boot-time delete: a key nothing reads costs nothing, R-S5R-20.3), so this guard pins that nothing
// reads or writes it: ZERO hits of the key's name, and ZERO hits of the URL lever that set it, in every tracked file under
// player/ gm/ lib/ scripts/ test/. An instrument that names a dead switch reads as if the switch were alive (R-S5R-20.2).
//
// The patterns are assembled from parts below, so this file never names them whole: its own pattern line is the one
// exclusion the ruling allows, and here there is nothing to exclude.
//
// THE BITE: YARD_SWITCH_PLANT=1 adds one in-memory file under player/ that reads the key (nothing on disk is touched), and the
// pin goes red by exit code. The always-on control proves the scan finds a planted hit in each root's kind of file.
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log('✓ ' + label); } else { fail++; console.log('✗ ' + label + (detail !== undefined ? '  — ' + JSON.stringify(detail).slice(0, 400) : '')); }
}

const KEY = ['swrpg', 'yard', 'transplant'].join('_');
const LEVER = '?' + 'yard' + '=';
const ROOTS = ['player', 'gm', 'lib', 'scripts', 'test'];
const files = execFileSync('git', ['ls-files', '--', ...ROOTS], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 })
  .split('\n').filter(Boolean).filter((f) => !/\.(png|jpe?g|webp|gif|ico|woff2?|ttf|otf|pdf|zip|db|sqlite)$/i.test(f));

function scan(entries) {
  const hits = [];
  entries.forEach(([f, text]) => {
    text.split('\n').forEach((line, i) => {
      if (line.indexOf(KEY) >= 0) hits.push(f + ':' + (i + 1) + ' key');
      if (line.indexOf(LEVER) >= 0) hits.push(f + ':' + (i + 1) + ' lever');
    });
  });
  return hits;
}
const read = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };
const entries = files.map((f) => [f, read(f)]);
if (process.env.YARD_SWITCH_PLANT === '1') entries.push(['player/__plant.jsx', "var on = localStorage.getItem('" + KEY + "') === '1';"]);

check('non-vacuity: the scan reads every root (' + ROOTS.join(' ') + '), > 500 tracked files',
  files.length > 500 && ROOTS.every((r) => files.some((f) => f.indexOf(r + '/') === 0)), { files: files.length });
const hits = scan(entries);
check('R-S5R-20.2/.3: ZERO readers and writers of the retired switch — its key and its URL lever appear in no tracked file under '
  + ROOTS.join('/ ') + '/' + (process.env.YARD_SWITCH_PLANT === '1' ? ' [YARD_SWITCH_PLANT=1: planted]' : ''), hits.length === 0, hits.slice(0, 30));
const control = scan([['player/x.jsx', "localStorage.getItem('" + KEY + "')"], ['scripts/x.py', "page.goto(BASE + '/player/yard" + LEVER + "1')"],
  ['test/x.cjs', "location.search = '" + LEVER + "0'"]]);
check('control: the scan finds a planted key read and a planted lever in a host, a script and a guard (3 hits)', control.length === 3, control);

console.log('\n' + pass + '/' + (pass + fail) + ' ' + (fail ? 'FAILED' : 'ALL PASS'));
process.exit(fail ? 1 : 0);
