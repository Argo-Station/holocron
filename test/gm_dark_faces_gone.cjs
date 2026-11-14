#!/usr/bin/env node
/**
 * gm_dark_faces_gone.cjs — PAPER N5 THE DELETION LAP: the dark GM faces, their switch and their dead code stay gone.
 *
 * WRITTEN FROM THE RULING TEXT (ruling `paper-n5-deletion` R-N5D-3 e). The dark toolbox, the dark store door and the
 * dark Universe Map chrome left with the `swrpg_gm_transplant` switch that showed them (D-94: "the dark trees stay
 * until the deletion lap AFTER the flip's push"); B-1130's dead code and B-1131's restatements left with them. This
 * is the DELETION PIN half (the f60_deletion_pins idiom): every deleted symbol reads ZERO in what the GM page SHIPS,
 * so a later lap cannot quietly bring a dark face, its lever or its warp back.
 *
 * WHAT IT READS — the shipped files, not the sources: the BUILT `gm/app.js` (PRAXIS §1: the browser runs it; run
 * `npm run build` first or this guard reads a stale bundle), `gm/index.html` (the warp's CSS lived there), and the two
 * map scripts the shell loads RAW (`lib/gm/GalaxyMapView.js`, `lib/gm/travelTime.js`; PRAXIS §4: `lib/` ships
 * unbundled), where B-1130's symbols lived. Every byte counts, comments included: the ruling's count is ZERO.
 *
 * OVER-REACH PINS: what the lap deliberately KEPT (R-N5D-2) — the paper toolbox under the mounted name `GmLanding`,
 * its `[data-gm-shell]` root, the ONE planet identity (`GmMapPins.planetKey`), the travel-time core the route panel
 * and the Hyperspace Run read (`calculateUniversalTravelTime`), the map's accent home (`HOLOCRON_ACCENT`).
 *
 * Run: npm run build && node test/gm_dark_faces_gone.cjs
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
let failures = 0;
function check(label, cond, detail) {
  if (cond) console.log('  PASS  ' + label);
  else { failures += 1; console.error('  FAIL  ' + label + (detail !== undefined ? '  — ' + JSON.stringify(detail).slice(0, 300) : '')); }
}

const FILES = ['gm/app.js', 'gm/index.html', 'lib/gm/GalaxyMapView.js', 'lib/gm/travelTime.js'];
const text = {};
FILES.forEach(function (f) {
  const p = path.join(root, f);
  if (!fs.existsSync(p)) { console.error('  FAIL  ' + f + ' is missing' + (f === 'gm/app.js' ? ' — run `npm run build` first' : '')); process.exit(1); }
  text[f] = fs.readFileSync(p, 'utf8');
});

function count(s, needle) { return s.split(needle).length - 1; }

// ── THE DELETED SYMBOLS (R-N5D-3 e, the ruling's list verbatim) — zero in every shipped file ─────────────────────
const DELETED = [
  'GM_TRANSPLANT_KEY', 'swrpg_gm_transplant',          // the switch
  'GmHeader', 'GmLandingPaper',                         // the dark header; the paper arm's old name
  'gm-warp', 'gm-band', 'gm-ray', 'gmWarp',             // the hyperspace warp and its CSS
  'gm-marker-pulse', 'sessionPlanetId',                 // B-1130: the never-drawn session marker
  'ASTROGATION_OUTCOMES', 'calculateTravelTime',        // B-1130: no caller on the surface
  'MERCHANT QUARTERMASTER',                             // the dark store door's GmHeader subtitle
];
DELETED.forEach(function (sym) {
  const hits = {};
  let total = 0;
  FILES.forEach(function (f) { const n = count(text[f], sym); if (n) { hits[f] = n; total += n; } });
  check('`' + sym + '` reads zero in what the GM page ships', total === 0, hits);
});

// ── THE LEVER: nothing reads `?gm=` any more ───────────────────────────────────────────────────────────────────
check('no `?gm=` reader in gm/app.js', !/\[\?&\]gm=/.test(text['gm/app.js']));

// ── OVER-REACH PINS (R-N5D-2): what stays ─────────────────────────────────────────────────────────────────────
const app = text['gm/app.js'];
check('the paper toolbox keeps the mounted name `GmLanding` (declared)', /function GmLanding\s*\(/.test(app));
check('GmLanding is still mounted by GmApp', /h\(GmLanding,|React\.createElement\(GmLanding,/.test(app));
check('the toolbox root is the paper shell `[data-gm-shell]`', count(app, '"data-gm-shell"') >= 1);
check('the map reads THE planet identity (`MapPins.planetKey`)', count(app, 'planetKey(') >= 1);
check('the map\'s accent home `HOLOCRON_ACCENT` stays', /HOLOCRON_ACCENT\s*=\s*"#4EAAFF"/.test(app));
check('`calculateUniversalTravelTime` stays exported (route panel, Hyperspace Run)',
  /calculateUniversalTravelTime:\s*calculateUniversalTravelTime/.test(text['lib/gm/travelTime.js']));
check('GalaxyMapView keeps the pin layer (`_pinKey`)', count(text['lib/gm/GalaxyMapView.js'], '_pinKey(') >= 1);

console.log(failures === 0 ? '\nPASS gm_dark_faces_gone' : '\nFAIL gm_dark_faces_gone — ' + failures + ' assert(s)');
process.exit(failures === 0 ? 0 : 1);
