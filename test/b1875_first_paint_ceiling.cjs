#!/usr/bin/env node
/**
 * b1875_first_paint_ceiling.cjs — B-1875: the first-paint ceiling is a battery guard.
 *
 * Ruling `release-r7-bug-burndown` ADDENDUM 736, HANDOFF b1875-b1883-battery-instruments. The ceiling
 * (ADDENDUM 426 §7 as amended by 427, 428, 466, 474: player/app.js ≤ 205 KB raw, the script before
 * mount ≤ 790 KB br, 475 since D-638) lived only in `scripts/b139_bundle_census.mjs`, run by hand at a release. 720
 * found the app at 803.9 KB br before mount at 6c2af66fd and nothing in the battery had said so.
 *
 * This guard runs the census over this tree's BUILT player/ and reds by the census's own exit
 * (REFUSED → 1). The census owns the numbers; nothing is re-measured here (one path per quantity).
 *
 * It reads BUILT output (PRAXIS §1). In an unbuilt tree it reds with a line naming the missing build
 * and never passes: the census reports an absent <script src> as "(not on disk)" and leaves it out of
 * the sum, so an unbuilt tree would otherwise read UNDER the ceiling.
 *
 * B-1895 (ADDENDUMS 749, 750; OWNS grant to lap encounters-e6-flip): the census now also sums the bytes the campaigns
 * door injects and the player's mount awaits, per state (door OFF · door ON /player/ · door ON cold /player/campaigns),
 * from the door's own FILES. This guard still re-measures nothing: it also refuses a census that prints no E6 line, so
 * a census that lost the door's bytes cannot read "within" by leaving them out.
 *
 * D-638 (release-r7-bug-burndown ADDENDUM 770, 774 STEP 0.3): the player's line is 475 KB br (from 790) and the GM page
 * gains its own 630 KB br line, door OFF and door ON (FILES + QR). Re-pointed: every check above is KEPT (the unbuilt
 * refusal, the E6 line's presence, the census's own exit) and nothing is dropped; ADDED: the GM shell's tags join the
 * unbuilt check, and a census that prints no GM line is refused as the E6 one is, so it cannot read "within" by
 * leaving the GM page out.
 *
 * Run: node test/b1875_first_paint_ceiling.cjs
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');

const html = ['player/index.html', 'gm/index.html'].map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
const local = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/g)]
  .map(m => m[1]).filter(s => !/^https?:/.test(s)).map(s => s.replace(/^\//, '').split('?')[0]);
const missing = ['player/app.js', ...local].filter((p, i, a) => a.indexOf(p) === i && !fs.existsSync(path.join(root, p)));
if (missing.length) {
  console.error('  FAIL  first-paint ceiling: the tree is not built — run `npm run build` (PRAXIS §1). Missing: ' + missing.join(', '));
  process.exit(1);
}

const r = spawnSync(process.execPath, [path.join(root, 'scripts/b139_bundle_census.mjs')], { cwd: root, encoding: 'utf8' });
const line = (r.stdout || '').split('\n').find(l => l.startsWith('== CEILING')) || '';
const states = (r.stdout || '').split('\n').find(l => /^\s+STATES before mount/.test(l)) || '';
if (!/^== E6 door-loaded/m.test(r.stdout || '') || !states || !/ · E6 [\d.]+ KB br \(≤ /.test(line)) {
  console.error('  FAIL  first-paint ceiling: the census printed no E6 door-loaded line (B-1895) — ' + (line || '(no CEILING line)'));
  process.exit(1);
}
if (!/^== GM first load/m.test(r.stdout || '') || !/ · GM [\d.]+ KB br \(≤ /.test(line)) {
  console.error('  FAIL  first-paint ceiling: the census printed no GM first-load line (D-638) — ' + (line || '(no CEILING line)'));
  process.exit(1);
}
if (r.status === 0 && /→ within/.test(line)) {
  console.log('  PASS  ' + states.trim());
  console.log('  PASS  first-paint ceiling: ' + line.replace(/^== CEILING[^=]*== /, ''));
  process.exit(0);
}
console.error('  FAIL  first-paint ceiling (census exit ' + r.status + '): ' + (line || (r.stderr || '').trim().split('\n').slice(-3).join(' | ')));
process.exit(1);
