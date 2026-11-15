// test/editor_switch_routes.cjs — THE HOMEBREW EDITOR'S SWITCH AND ROUTE GRAMMAR (lib/editor/switch.js).
//
// Ruling `f100-items-editor-contracts` R-FIEC-5: the key `swrpg_homebrew_editor` (since the one-pass flip, R-FILG-A1-2 /
// R-PRS-8 step 4: '0' is OFF, anything else — a missing key included — is ON; the key is kept as the OFF override),
// `?homebrew=1|0` persisted at load, the OFF wrapper `screenFor` (null for every path while off), and the route
// table — identical under /player and /gm, `new` / `in` / `collections` reserved, a non-item or unknown shelf at
// HOME, a segment past a route's own dropped to the nearest level. Plus the host glue both apps carry: each app
// asks the wrapper, never the parser, and each mounts the editor only on its `homebrew` screen.
//
// BITES (run below, each must turn a row red): the wrapper ignoring the switch; `talents`, `species` or `force_powers` left closed; a
// blank specialization, species or Force power allowed;
// `new` read as a record id; a host asking `parse` instead of `screenFor`.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(label, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ ' + label + (detail !== undefined ? '  — ' + JSON.stringify(detail) : '')); }
}

function load(src, search, stored) {
  const store = Object.assign({}, stored || {});
  const g = { location: { search: search || '' }, localStorage: {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); } } };
  const fn = new Function('window', 'globalThis', 'module', src + '\nreturn window.SWRPGEditor;');
  return { E: fn(g, g, undefined), store };
}
const SRC = fs.readFileSync(path.join(ROOT, 'lib/editor/switch.js'), 'utf8');

function rows(src) {
  const r = [];
  // THE FLIP (R-FILG-A1-2, norm 3): the default leg asserts the NEW default; the OFF legs keep their claim ("OFF
  // shows nothing") and reach OFF by the explicit override, a stored '0', because a missing key is now ON.
  const fresh = load(src, '', {}).E;
  r.push(['ON by default: on() is true on a fresh profile (no key)', fresh.on() === true]);
  r.push(['ON by default: screenFor answers /player/homebrew on a fresh profile', !!fresh.screenFor('/player/homebrew')]);
  const off = load(src, '', { swrpg_homebrew_editor: '0' }).E;
  r.push(['OFF (stored "0"): on() is false', off.on() === false]);
  r.push(['OFF (stored "0"): screenFor answers null for /player/homebrew', off.screenFor('/player/homebrew') === null]);
  r.push(['OFF (stored "0"): screenFor answers null for /gm/homebrew/collections', off.screenFor('/gm/homebrew/collections') === null]);
  const on1 = load(src, '?homebrew=1');
  r.push(['?homebrew=1 persists "1" under swrpg_homebrew_editor', on1.store.swrpg_homebrew_editor === '1' && on1.E.on() === true]);
  const on0 = load(src, '?x=2&homebrew=0', { swrpg_homebrew_editor: '1' });
  r.push(['?homebrew=0 persists "0" and reads OFF', on0.store.swrpg_homebrew_editor === '0' && on0.E.on() === false]);
  r.push(['a stored "false" is ON (only the string "0" is OFF)', load(src, '', { swrpg_homebrew_editor: 'false' }).E.on() === true]);
  const E = load(src, '', { swrpg_homebrew_editor: '1' }).E;
  const P = (p) => { const x = E.screenFor(p); return x && { view: x.view, shelf: x.shelf, id: x.id, packId: x.packId, host: x.host, canonical: x.canonical }; };
  const T = [
    ['/player/homebrew', { view: 'home', host: 'player', canonical: '/player/homebrew' }],
    ['/gm/homebrew/', { view: 'home', host: 'gm', canonical: '/gm/homebrew' }],
    ['/player/homebrew/collections', { view: 'collections', canonical: '/player/homebrew/collections' }],
    ['/gm/homebrew/weapons', { view: 'shelf', shelf: 'weapons', canonical: '/gm/homebrew/weapons' }],
    ['/player/homebrew/armor/new', { view: 'draft', shelf: 'armor', canonical: '/player/homebrew/armor/new' }],
    ['/player/homebrew/gear/backpack', { view: 'record', shelf: 'gear', id: 'backpack', canonical: '/player/homebrew/gear/backpack' }],
    ['/player/homebrew/weapons/in/my_data/custom_my_data_x', { view: 'record', shelf: 'weapons', packId: 'my_data', id: 'custom_my_data_x', canonical: '/player/homebrew/weapons/in/my_data/custom_my_data_x' }],
    ['/player/homebrew/talents', { view: 'shelf', shelf: 'talents', canonical: '/player/homebrew/talents' }],   // M5 U6: TALENTS opens
    ['/player/homebrew/talents/new', { view: 'draft', shelf: 'talents', canonical: '/player/homebrew/talents/new' }],   // U12
    ['/player/homebrew/specializations/x', { view: 'record', shelf: 'specializations', id: 'x', canonical: '/player/homebrew/specializations/x' }],
    ['/player/homebrew/specializations/new', { view: 'shelf', shelf: 'specializations', canonical: '/player/homebrew/specializations' }],   // STOP-9: no blank tree
    ['/player/homebrew/species', { view: 'shelf', shelf: 'species', canonical: '/player/homebrew/species' }],   // M9 step 8: SPECIES opens
    ['/player/homebrew/species/trandoshan', { view: 'record', shelf: 'species', id: 'trandoshan', canonical: '/player/homebrew/species/trandoshan' }],
    ['/gm/homebrew/species/new', { view: 'shelf', shelf: 'species', canonical: '/gm/homebrew/species' }],   // M9: no blank species (NO_BLANK)
    ['/player/homebrew/force_powers', { view: 'shelf', shelf: 'force_powers', canonical: '/player/homebrew/force_powers' }],   // M10: FORCE POWERS opens
    ['/gm/homebrew/force_powers/move', { view: 'record', shelf: 'force_powers', id: 'move', canonical: '/gm/homebrew/force_powers/move' }],
    ['/player/homebrew/force_powers/new', { view: 'shelf', shelf: 'force_powers', canonical: '/player/homebrew/force_powers' }],   // M10 (D-141 K1): no blank power
    ['/player/homebrew/careers', { view: 'shelf', shelf: 'careers', canonical: '/player/homebrew/careers' }],   // M12 (R-M12B-9 F1): CAREERS opens
    ['/gm/homebrew/careers/smuggler', { view: 'record', shelf: 'careers', id: 'smuggler', canonical: '/gm/homebrew/careers/smuggler' }],
    ['/player/homebrew/careers/new', { view: 'shelf', shelf: 'careers', canonical: '/player/homebrew/careers' }],   // M12 (F1): a new career is a copy
    ['/player/homebrew/nonsense', { view: 'home', canonical: '/player/homebrew' }],
    ['/player/homebrew/weapons/in', { view: 'shelf', shelf: 'weapons', canonical: '/player/homebrew/weapons' }],
    ['/player/homebrew/weapons/in/my_data', { view: 'shelf', shelf: 'weapons', canonical: '/player/homebrew/weapons' }],
    ['/player/homebrew/weapons/collections', { view: 'shelf', shelf: 'weapons', canonical: '/player/homebrew/weapons' }],
    ['/player/homebrew/weapons/blaster_pistol/new', { view: 'record', shelf: 'weapons', id: 'blaster_pistol', canonical: '/player/homebrew/weapons/blaster_pistol' }],
  ];
  T.forEach(([p, want]) => {
    const got = P(p) || {};
    const bad = Object.keys(want).filter((k) => got[k] !== want[k]);
    r.push(['route ' + p + ' → ' + want.view + (want.canonical !== p ? ' (canonical ' + want.canonical + ')' : ''), bad.length === 0, bad.length ? got : undefined]);
  });
  r.push(['not a homebrew path → null', P('/player/store') === null && P('/player/homebrewx') === null]);
  r.push(['pathFor round-trips every canonical route', T.every(([p]) => { const x = E.parse(p); return E.pathFor(x) === x.canonical; })]);
  r.push(['screen ids: PLAYER.HOMEBREW · GM.HOMEBREW.COLLECTIONS · PLAYER.HOMEBREW.SHELF · .RECORD · .DRAFT',
    E.screenId(E.parse('/player/homebrew')) === 'PLAYER.HOMEBREW' && E.screenId(E.parse('/gm/homebrew/collections')) === 'GM.HOMEBREW.COLLECTIONS'
    && E.screenId(E.parse('/player/homebrew/gear')) === 'PLAYER.HOMEBREW.SHELF' && E.screenId(E.parse('/player/homebrew/gear/x')) === 'PLAYER.HOMEBREW.RECORD'
    && E.screenId(E.parse('/player/homebrew/gear/new')) === 'PLAYER.HOMEBREW.DRAFT']);
  r.push(['an id is encoded on the way out, decoded on the way in', E.parse(E.pathFor({ host: 'player', view: 'record', shelf: 'gear', packId: 'my_data', id: 'a b/c' })).id === 'a b/c']);
  return r;
}

function hostRows(player, gm) {
  const r = [];
  [['player', player], ['gm', gm]].forEach(([n, s]) => {
    r.push([n + ': the OFF wrapper asks screenFor, never parse', /function homebrewScreenFor\(path\) \{\s*return \(window\.SWRPGEditor && window\.SWRPGEditor\.screenFor\(path\)\)/.test(s) && !/SWRPGEditor\.parse\(/.test(s)]);
    r.push([n + ': the cold load and popstate both go through the wrapper', (s.match(/homebrewScreenFor\(/g) || []).length >= 3]);
    r.push([n + ": the editor mounts only on screen === 'homebrew'", /\{screen === 'homebrew' && window\.SWRPGEditorView && \(/.test(s)]);
  });
  r.push(['player: the tile and the Sources group gate on SWRPGEditor.on()', (player.match(/window\.SWRPGEditor && window\.SWRPGEditor\.on\(\) && window\.SWRPGEditorView/g) || []).length === 2]);
  // ENCOUNTERS E3 lap B (ruling encounters-e3-screens §8 pins, both switch states): the door may concat the switch's
  // ENCOUNTERS card first; the editor's card still gates on SWRPGEditor.on() (KEPT), whichever slot it lands in
  // RE-POINTED at encounters-e6-frames (ruling encounters-e6-frames-gate C2 @ 91d815c56): KEPT — the editor card gates on
  // SWRPGEditor.on(); DROPPED — "the editor card is the fifth in the chain", which R-E6F-1's CAMPAIGNS card moved. The card is
  // found by NAME (its `id: 'homebrew'`), and it is the only homebrew card the GM shell builds.
  r.push(['gm: the editor card (id homebrew) gates on SWRPGEditor.on()', /window\.SWRPGEditor && window\.SWRPGEditor\.on\(\) && window\.SWRPGEditorView\s*\?\s*\[Object\.assign\(\{ id: 'homebrew' \}, window\.SWRPGEditorView\.DOOR\.gm\)\]/.test(gm)
    && (gm.match(/id: 'homebrew'/g) || []).length === 1]);
  ['player/index.html', 'gm/index.html'].forEach((f) => {
    const h = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const sw = h.indexOf('/lib/editor/switch.js'), app = h.indexOf(f.startsWith('player') ? 'src="/player/app.js"' : 'src="/gm/app.js"'), v = h.indexOf('/lib/editor/view.js');
    r.push([f + ': switch.js and view.js load before the app bundle', sw > 0 && v > 0 && sw < app && v < app]);
  });
  return r;
}

const PLAYER = fs.readFileSync(path.join(ROOT, 'player/app.jsx'), 'utf8');
const GM = fs.readFileSync(path.join(ROOT, 'gm/app.jsx'), 'utf8');
console.log('editor_switch_routes — lib/editor/switch.js + the host glue (R-FIEC-5)');
rows(SRC).concat(hostRows(PLAYER, GM)).forEach(([l, c, d]) => ok(l, c, d));
const HARVEST = rows(SRC).length + hostRows(PLAYER, GM).length;

console.log('BITES (each must turn at least one row red):');
const bites = [
  ['the wrapper ignores the switch', rows(SRC.replace('return on() ? parse(path) : null;', 'return parse(path);'))],
  // RE-POINTED at M10 (f100-m10-editor-card R-M10E-2): KEPT — every bite; MOVED — each mutates the M10 lines (force_powers opens and
  // has no blank); DROPPED — nothing. Two bites join them: force_powers left closed, a blank Force power allowed.
  ['force_powers left closed (the M9 grammar)', rows(SRC.replace("var OPEN_SHELVES = ITEM_SHELVES.concat(['talents', 'specializations', 'species', 'force_powers', 'careers']);", "var OPEN_SHELVES = ITEM_SHELVES.concat(['talents', 'specializations', 'species', 'careers']);"))],
  ['species left closed (the M5 grammar)', rows(SRC.replace("var OPEN_SHELVES = ITEM_SHELVES.concat(['talents', 'specializations', 'species', 'force_powers', 'careers']);", "var OPEN_SHELVES = ITEM_SHELVES.concat(['talents', 'specializations', 'force_powers', 'careers']);"))],
  ['talents left closed (the M3 grammar)', rows(SRC.replace("var OPEN_SHELVES = ITEM_SHELVES.concat(['talents', 'specializations', 'species', 'force_powers', 'careers']);", "var OPEN_SHELVES = ITEM_SHELVES.slice();"))],
  ['a blank specialization allowed (STOP-9)', rows(SRC.replace("var NO_BLANK = ['specializations', 'species', 'force_powers', 'careers'];", "var NO_BLANK = ['species', 'force_powers', 'careers'];"))],
  ['a blank species allowed (M9 step 8)', rows(SRC.replace("var NO_BLANK = ['specializations', 'species', 'force_powers', 'careers'];", "var NO_BLANK = ['specializations', 'force_powers', 'careers'];"))],
  // RE-POINTED at M12 (f100-m12-build-card R-M12B-9 F1; census f100-m12-editor-census Q7): KEPT — every bite; MOVED — each needle
  // is the M12 line (careers opens, last, and has no blank); DROPPED — nothing. Two bites join them: careers left closed, a blank career.
  ['careers left closed (the M10 grammar)', rows(SRC.replace("var OPEN_SHELVES = ITEM_SHELVES.concat(['talents', 'specializations', 'species', 'force_powers', 'careers']);", "var OPEN_SHELVES = ITEM_SHELVES.concat(['talents', 'specializations', 'species', 'force_powers']);"))],
  ['a blank career allowed (M12, D-157 F1)', rows(SRC.replace("var NO_BLANK = ['specializations', 'species', 'force_powers', 'careers'];", "var NO_BLANK = ['specializations', 'species', 'force_powers'];"))],
  ['a blank Force power allowed (M10, D-141 K1)', rows(SRC.replace("var NO_BLANK = ['specializations', 'species', 'force_powers', 'careers'];", "var NO_BLANK = ['specializations', 'species', 'careers'];"))],
  ["'new' read as a record id", rows(SRC.replace("else if (seg[1] === 'new') r = NO_BLANK.indexOf(shelf) === -1 ? { host: host, view: 'draft', shelf: shelf } : { host: host, view: 'shelf', shelf: shelf };", ''))],
  ['a host asks parse instead of screenFor', hostRows(PLAYER.replace('window.SWRPGEditor.screenFor(path))', 'window.SWRPGEditor.parse(path))'), GM)],
  // C2 (ruling encounters-e6-frames-gate @ 91d815c56): the GM's editor card shown with the switch OFF.
  ['the GM editor card ignores the switch', hostRows(PLAYER, GM.replace(/window\.SWRPGEditor && window\.SWRPGEditor\.on\(\) && (window\.SWRPGEditorView\s*\?\s*\[Object\.assign\(\{ id: 'homebrew' \})/, '$1'))],
];
bites.forEach(([n, rs]) => ok('bite: ' + n + ' → red', rs.some((x) => !x[1])));

console.log('\nHARVEST ' + HARVEST + ' rows · ' + bites.length + ' bites');
console.log(`editor_switch_routes: ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
