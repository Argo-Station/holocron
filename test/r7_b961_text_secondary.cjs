#!/usr/bin/env node
/* test/r7_b961_text_secondary.cjs — B-961 (ruling release-r7-bug-burndown ADDENDUM 186): `--text-secondary` is declared in
 * none of the app's stylesheets, and lib/shared/treeView.jsx's DirectionalTreeEntryBody named it on its three dark-skin
 * lines (the held reason, the locked reason, the characteristic receipt). An undefined custom property leaves `color`
 * inheriting, so the reference drew nothing of its own. Those lines render only on rollback faces (ADDENDUM 186: no
 * product face reaches the default skin's held/locked/receipt), and the ruling drops the dead reference, so no colour is
 * chosen and nothing on any face changes.
 *   B961a  treeView.jsx names no `--text-secondary` (comments excepted).
 *   B961b  the three lines still exist — each testid is present, so the leg cannot pass on a deleted component.
 * Run: node test/r7_b961_text_secondary.cjs   Exit 0 pass; 1 a leg failed.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'shared', 'treeView.jsx'), 'utf8');
const code = src.split('\n').map((l) => (/^\s*(\/\/|\*|\/\*)/.test(l) ? '' : l.replace(/\/\/.*$/, ''))).join('\n');
let fails = 0;
function check(name, ok, detail) {
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (ok ? '' : '  ' + JSON.stringify(detail)));
  if (!ok) fails++;
}
const hits = code.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => l.includes('--text-secondary')).map(([n]) => n);
check('B961a lib/shared/treeView.jsx names no --text-secondary (B-961)', hits.length === 0, { lines: hits });
const ids = ['talent-held', 'tree-locked-reason', 'talent-char-receipt'];
check('B961b the held, locked and receipt lines are still drawn (their testids present)',
  ids.every((t) => src.includes('data-testid="' + t + '"')), ids.filter((t) => !src.includes('data-testid="' + t + '"')));
console.log(fails ? `FAIL — ${fails} leg(s)` : 'PASS — B-961: the dead --text-secondary reference is gone');
process.exit(fails ? 1 : 0);
