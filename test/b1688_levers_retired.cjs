// test/b1688_levers_retired.cjs — B-1688 (D-449; ruling `release-r7-bug-burndown` ADDENDA 445, 468): THE FOUR ROLLBACK LEVERS
// ARE RETIRED. A stored key is LEFT in a browser (a key nothing reads costs nothing, R-S5R-20.3), so this pins that the product
// neither reads nor writes one: ZERO hits of each key, its switch function, its KEY var and its URL flag in every tracked file
// under player/ gm/ lib/, and the seed's FACES no longer carry the three rows. `swrpg_homebrew_editor` stays (D-449 bind 2).
//
// The patterns are assembled from parts, so this file never names them whole. RED AT THE CUT `292637e70` by exit code.
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log('✓ ' + label); } else { fail++; console.log('✗ ' + label + (detail !== undefined ? '  — ' + JSON.stringify(detail) : '')); }
}
const SHORTS = [['creator', 'fc', 'FC', 'transplant'], ['store', 'store', 'STORE', 'store'], ['qsg', 'qsg', 'QSG', 'qsg'], ['files', 'files', 'FILES', 'files']];
const NEEDLES = [];
SHORTS.forEach(([key, fn, up, flag]) => {
  NEEDLES.push(['swrpg', key, 'transplant'].join('_'), fn + 'Transplant' + 'Switch', [up, 'TRANSPLANT', 'KEY'].join('_'), '[?&]' + flag + '=([01])');
});
const files = execFileSync('git', ['ls-files', '--', 'player', 'gm', 'lib'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 })
  .split('\n').filter(Boolean).filter((f) => /\.(jsx?|mjs|html|css)$/.test(f));
const read = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };
check('the scan reads the host (player/app.jsx is in it)', files.includes('player/app.jsx') && read('player/app.jsx').length > 100000);
NEEDLES.forEach((needle) => {
  const hits = [];
  files.forEach((f) => {
    read(f).split('\n').forEach((line, i) => { if (line.indexOf(needle) >= 0) hits.push(f + ':' + (i + 1)); });
  });
  check('no product file names ' + needle, hits.length === 0, hits.slice(0, 6));
});
const app = read('player/app.jsx');
check('the two legacy bodies are gone', !/\blegacyBody\b/.test(app), (app.match(/\blegacyBody\b/g) || []).length);
check('the creator has no OFF branch', !/\bfcTransplanted\b/.test(app), (app.match(/\bfcTransplanted\b/g) || []).length);
const store = read('lib/store/view.jsx');
check("the store's dark artwork panel is gone", !/\bArtworkPanelDark\b/.test(store));
const seed = read('scripts/old_faces_seed.py');
check('the seed keeps only the homebrew rows', !/\("(store|qsg|files)", "player"/.test(seed));
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
