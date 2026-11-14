#!/usr/bin/env node
/**
 * suite_bar_clearance.cjs — R5a: a full-screen Corpus surface must clear the SuiteBar.
 *
 * THE DEFECT THIS EXISTS FOR. The Ship Yard's ship-detail surface is `position:fixed; inset:0` at
 * zIndex 50, so it lays out from the true top of the viewport. The shared SuiteBar is
 * `position:sticky; top:0`, 54px tall, zIndex 120 (lib/shared/ui.jsx) — it paints OVER that surface's
 * first 54px. The detail shipped with 22px of top padding, which put its 44px back control at
 * y≈22-66: mostly inside the bar's band, and losing the z-index fight. So the taps did not merely
 * look clipped, they landed on the bar and opened the HUB menu. Jason: "when you search a ship, the
 * back button is obscured."
 *
 * RE-POINTED AT THE SHIPYARD-S5 FLIP (ruling `shipyard-s5-ready` R-S5R-20.4, commercial 309f7635). The ship detail and both
 * hosts' vessel-sheet overlays are deleted (R-S5R-18), and with them their `.ci-backbar` controls (`yard-vessel-back`);
 * the S4 Yard's way out is the suite bar's own back, so nothing of it sits under the bar. KEPT: the bar-height read, the
 * browse landing's clearance (MATRIX's browse, still mounted) and its CLOSE control's class pin. RETIRED by name: "Ship
 * Yard — ship detail (the R5a defect)", "GM — vessel sheet overlay", "Player — vessel sheet overlay" (each its two
 * checks) and the gm/app.jsx and player/app.jsx `.ci-backbar` pins. scripts/smoke_yard_backbar.py, named below, is
 * retired whole at the same flip (its last tree: 9fb68187).
 *
 * WHY A SOURCE GUARD AND NOT ONLY A BROWSER ONE. scripts/smoke_yard_backbar.py measured the real
 * rects and is the primary guard — but it only sees the surfaces it navigates to, and it needs a
 * built bundle and a server. This one is free, runs in the node battery, reads BOTH numbers out of
 * the source, and therefore catches the class from the other end: raise the bar's height in ui.jsx
 * and every hand-typed clearance below it reddens at once. That second direction is the durable
 * value — 54 lives in exactly one place, the clearances that answer to it live in four, and nothing
 * connected them before.
 *
 * NOT A REFACTOR PIN. The right long-term shape may well be one exported token instead of four
 * literals. Until someone does that (and can verify it in the browser across three apps), this guard
 * is what keeps the four literals honest.
 *
 * Run: node test/suite_bar_clearance.cjs
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
let failures = 0;
function check(label, cond, detail) {
  if (cond) console.log('  PASS  ' + label);
  else { failures += 1; console.error('  FAIL  ' + label + (detail !== undefined ? '  — ' + JSON.stringify(detail).slice(0, 300) : '')); }
}

function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }

// ── the ONE source of the bar's height ────────────────────────────────────────────────────────
// Read it out of the suite-bar's own style object rather than from a constant here, so a change to
// the bar is a change to this guard's expectation. `(?:^|[^A-Za-z])height` deliberately refuses to
// match `minHeight` — the bottom-nav tab in the same file also declares 54px, and matching it would
// make the guard pass for the wrong reason if the bar ever lost its own height.
const ui = read('lib/shared/ui.jsx');
const barDecls = ui.match(/className: 'suite-bar'/g) || [];
check("lib/shared/ui.jsx declares exactly one suite-bar header (the anchor is not stale)",
  barDecls.length === 1, barDecls.length);
const barIdx = ui.indexOf("className: 'suite-bar'");
const barH = barIdx >= 0
  ? (ui.slice(barIdx, barIdx + 800).match(/(?:^|[^A-Za-z])height:\s*'(\d+)px'/) || [])[1]
  : undefined;
check('the suite bar declares a pixel height in its own style object', barH !== undefined, barH);
const BAR_H = Number(barH);
// A NaN or 0 here would make every comparison below vacuous — an assert that examines nothing
// passes, so refuse to continue on a height we could not actually read.
check('the parsed bar height is a real positive number', Number.isFinite(BAR_H) && BAR_H > 0, barH);
if (!Number.isFinite(BAR_H) || BAR_H <= 0) {
  console.error('\nsuite_bar_clearance: could not read the bar height — aborting rather than passing vacuously.');
  process.exit(1);
}
console.log('  (suite bar height read from lib/shared/ui.jsx: ' + BAR_H + 'px)');

// ── the surfaces that must clear it ───────────────────────────────────────────────────────────
// Every one of these is a `position:fixed; inset:0` overlay that opens with a `.ci-backbar` control
// at its very top, so the first thing under the bar is the user's only way out. Each anchor captures
// the TOP value of that container's `padding` shorthand. The anchors are matched for uniqueness:
// a refactor that moves or duplicates one of these must redden here rather than silently stop
// measuring anything.
const SITES = [
  { file: 'lib/shared/yardView.jsx',
    label: 'Ship Yard — browse landing',
    re: /<div style=\{\{ padding: '(\d+)px [^']*', maxWidth: '1280px', margin: '0 auto' \}\}>/g },
];

SITES.forEach(function (site) {
  const src = read(site.file);
  const hits = [...src.matchAll(site.re)];
  check(site.label + ' — its container is found exactly once in ' + site.file,
    hits.length === 1, hits.length);
  if (hits.length !== 1) return;
  const top = Number(hits[0][1]);
  check(site.label + ' — top padding ' + top + 'px clears the ' + BAR_H + 'px suite bar',
    top >= BAR_H, { top: top, barHeight: BAR_H });
});

// ── the back controls these clearances protect ────────────────────────────────────────────────
// The clearance only matters because a back control sits at the top of each surface. If one of them
// is ever renamed away from `.ci-backbar`, the browser guard (which selects on that class) would go
// quiet without failing — so pin the class's presence here too.
// RE-POINTED (N-post, lap paper-sheet-delete step 4, 2026-09-30): player/app.jsx 2 → 1. The second player
// control was the dark SheetVessels sheet's `vessel-back`, deleted with the old sheet face (the paper VESSELS
// unit opens a vessel as a room, whose way out is the room's own `room-back`). KEPT: the vessel overlay's
// `yard-vessel-back`, which sits under the clearance measured above. DROPPED: the deleted control's count.
// RE-POINTED (shipyard-s5 flip, R-S5R-20.4): yardView 2 → 1 (the ship detail's back is deleted; the browse's CLOSE stays);
// the gm/app.jsx and player/app.jsx pins retire with the vessel overlays (named above).
[['lib/shared/yardView.jsx', 1]].forEach(function (pair) {
  const src = read(pair[0]);
  const n = (src.match(/ci-backbar/g) || []).length;
  check(pair[0] + ' still renders ' + pair[1] + ' .ci-backbar control(s) — the browser guard selects on this class',
    n === pair[1], n);
});

console.log(failures ? '\nsuite_bar_clearance: ' + failures + ' FAILED' : '\nsuite_bar_clearance: all clear');
process.exit(failures ? 1 : 0);
