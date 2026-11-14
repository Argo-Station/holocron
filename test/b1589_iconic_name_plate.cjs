// B-1589 (lap `release-r7-gm-map-plates`; DECISIONS D-408 "Plate them too", ruled in `release-r7-bug-burndown`
// ADDENDUM 218): the galaxy map's twelve iconic names take the ordinary names' dark plate and drop UXQP-39's halo,
// so every name reads at 4.5:1 (D-406 item 21). Reads the label CSS `lib/gm/GalaxyMapView.js` injects.
// KEEPS the iconic size, weight, tracking and ink, and the class itself (B-1146's `_placeNameBoxes` keys on it).
// Red at the cut `69fcb4eef` (transparent background + three-layer text-shadow); the browser half (the contrast
// reading, and B-1146 with the larger boxes) is `scripts/smoke_r7_gm_galaxy_map.py` row B-1589.
'use strict';
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'gm', 'GalaxyMapView.js'), 'utf8');
const start = src.indexOf("style.id = 'gm-leaflet-css'");
const css = Function('return ' + src.slice(src.indexOf('[', start), src.indexOf("].join('')", start) + 1))().join('');
const rule = sel => { const m = css.match(new RegExp('(?:^|})' + sel.replace('.', '\\.') + '\\{([^}]*)\\}')); return m ? m[1] : null; };
const decl = (body, prop) => { const m = (body || '').match(new RegExp('(?:^|;)' + prop + ':([^;]*)')); return m ? m[1].trim() : null; };

let fail = 0;
const check = (name, ok, detail) => { console.log(`${ok ? '✓' : '✗'} B-1589 ${name}${ok ? '' : ' — ' + detail}`); if (!ok) fail++; };

const plain = rule('.galaxy-label');
const iconic = rule('.galaxy-label-iconic');
check('both label rules exist', plain && iconic, `galaxy-label ${!!plain}, galaxy-label-iconic ${!!iconic}`);
for (const prop of ['background', 'padding', 'border-radius']) {
  check(`iconic ${prop} = the plate's`, decl(iconic, prop) && decl(iconic, prop) === decl(plain, prop),
    `iconic ${decl(iconic, prop)} vs plate ${decl(plain, prop)}`);
}
check('iconic has no halo', decl(iconic, 'text-shadow') === 'none', `text-shadow ${decl(iconic, 'text-shadow')}`);
const kept = { color: 'rgba(235,247,255,0.96)', 'font-size': '12px', 'font-weight': '600', 'letter-spacing': '0.08em' };
for (const [prop, v] of Object.entries(kept)) {
  check(`iconic ${prop} kept`, decl(iconic, prop) === v, `${decl(iconic, prop)}, want ${v}`);
}
check("B-1146's placement still keys on the iconic class", /galaxy-label-iconic/.test(src.slice(src.indexOf('_placeNameBoxes'))),
  '_placeNameBoxes no longer reads galaxy-label-iconic');

console.log(fail ? `FAIL ${fail}` : 'PASS');
process.exit(fail ? 1 : 0);
