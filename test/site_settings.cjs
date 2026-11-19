#!/usr/bin/env node
/* site_settings — the site's account values live in ONE module, and blank values turn each consumer off.
 *
 * Ruling argo-a1-curation R-AAC-3 / R-AAC-19: the analytics token and hosts, the room-server host, the sign-in
 * worker's fallback origin and the Ko-fi link are read from lib/shared/siteSettings.js by their consumers, which
 * hold no copy. The public copy swaps that file for a blank template (scripts/argo_export/overlay/), so this
 * guard runs in BOTH trees and asserts whichever world it finds:
 *
 *   (i)   SHAPE    — the module exports exactly the six keys, with the right types.
 *   (ii)  ONE COPY — no consumer carries a literal of a filled value (token, room host, Ko-fi id).
 *   (iii) SHELLS   — every shell loads siteSettings.js exactly once, live, BEFORE analytics.js; the player
 *                deferred (R-BDC-1: its boot keeps three undeferred scripts), every other shell undeferred.
 *   (iv)  WIRED    — each consumer's value is the module's value (analytics token + hosts, room host,
 *                    the worker's fallback origin, the GM board's and landing's Ko-fi reads).
 *   (v)   BLANK    — with a blank module injected, analytics measures nothing and the room client refuses
 *                    `no_room_server` without dialling; the worker trusts no origin.
 *   (vi)  TEMPLATE — in the workshop, the overlay's template has the same keys, every account value blank and BOOK_CONTENT removed.
 *                    TABLE_SERVER_HOST (ruling encounters-e6-wire-online ADDENDUM 9 W-3) may be absent there: the
 *                    template is ARGO's file, and an absent key reads as '' (no server), which (v) asserts.
 *
 * Run: node test/site_settings.cjs
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');

const REPO = path.resolve(__dirname, '..');
const SETTINGS_PATH = path.join(REPO, 'lib/shared/siteSettings.js');
const TEMPLATE_PATH = path.join(REPO, 'scripts/argo_export/overlay/lib/shared/siteSettings.js');
const SHELLS = ['index.html', 'player/index.html', 'gm/index.html', 'dice/index.html', 'account/index.html'];
const KEYS = ['ANALYTICS_TOKEN', 'PRODUCTION_HOSTS', 'ROOM_SERVER_HOST', 'TABLE_SERVER_HOST', 'AUTH_ORIGIN', 'KOFI_URL', 'BOOK_CONTENT'];
const OPTIONAL_IN_TEMPLATE = ['TABLE_SERVER_HOST'];   // W-3: added after the template; ARGO's file gains it

let pass = 0, fail = 0;
const check = (label, cond, detail) => {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (detail !== undefined ? '  ->  ' + JSON.stringify(detail) : '')); }
};
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"])\/\/[^\n]*/g, '$1');

const S = require(SETTINGS_PATH);
const filled = !!S.ANALYTICS_TOKEN;
console.log(`  (settings are ${filled ? 'FILLED — the workshop' : 'BLANK — the public template'})`);

// (i) shape
check('exports exactly the seven keys', JSON.stringify(Object.keys(S).sort()) === JSON.stringify(KEYS.slice().sort()), Object.keys(S));
check('string values are strings, hosts a list',
  ['ANALYTICS_TOKEN', 'ROOM_SERVER_HOST', 'TABLE_SERVER_HOST', 'AUTH_ORIGIN', 'KOFI_URL'].every((k) => typeof S[k] === 'string') && Array.isArray(S.PRODUCTION_HOSTS));
check('the module is frozen', Object.isFrozen(S));
check('BOOK_CONTENT is included or removed, and removed exactly when the account values are blank',
  (S.BOOK_CONTENT === 'included' || S.BOOK_CONTENT === 'removed') && (S.BOOK_CONTENT === 'removed') === !filled, S.BOOK_CONTENT);
if (S.ANALYTICS_TOKEN) check('a filled token is a 32-hex Web Analytics site token', /^[0-9a-f]{32}$/.test(S.ANALYTICS_TOKEN));

// (ii) one copy — consumers carry no literal of a filled value
const CONSUMERS = ['lib/shared/analytics.js', 'lib/shared/roomClient.js', 'lib/shared/tableSession.js', 'worker/auth.js', 'index.html', 'gm/app.jsx'];
const literals = [S.ANALYTICS_TOKEN, S.ROOM_SERVER_HOST, S.TABLE_SERVER_HOST, S.KOFI_URL && S.KOFI_URL.split('/').pop()].filter(Boolean);
for (const rel of CONSUMERS) {
  const src = read(rel);
  const hits = literals.filter((v) => src.includes(v));
  check(`${rel} holds no copy of an account value`, hits.length === 0, hits);
}

// (iii) shells
let shells = 0;
for (const shell of SHELLS) {
  const html = read(shell).replace(/<!--[\s\S]*?-->/g, '');
  shells++;
  // B-1912 (ADDENDUM 761): the shells load both files' minified dist/ copies
  const loads = html.match(/<script\b[^>]*\bsrc="\/dist\/lib\/shared\/siteSettings\.js"[^>]*>/g) || [];
  check(`${shell} loads siteSettings.js exactly once`, loads.length === 1, loads.length);
  const deferred = shell === 'player/index.html';
  check(`${shell} loads it ${deferred ? 'deferred' : 'undeferred'}, before analytics.js`,
    loads.length === 1 && !/\basync\b/.test(loads[0]) && /\bdefer\b/.test(loads[0]) === deferred
      && html.indexOf(loads[0]) < html.indexOf('/dist/lib/shared/analytics.js'));
}
check(`HARVEST: ${shells} shells measured (zero is a failed run)`, shells === SHELLS.length);

// (iv) wired
const A = require(path.join(REPO, 'lib/shared/analytics.js'));
check('analytics reads the token from the module', A.SITE_TOKEN === S.ANALYTICS_TOKEN, A.SITE_TOKEN);
check('analytics reads the hosts from the module', JSON.stringify(A.PRODUCTION_HOSTS) === JSON.stringify(S.PRODUCTION_HOSTS));
const RC = require(path.join(REPO, 'lib/shared/roomClient.js'));
check('the room client reads its host from the module', RC.ROOM_SERVER_HOST === S.ROOM_SERVER_HOST, RC.ROOM_SERVER_HOST);
const TSn = require(path.join(REPO, 'lib/shared/tableSession.js'));
check('the table session reads its host from the module', TSn.serverHost() === S.TABLE_SERVER_HOST && TSn.serverUrl() === (S.TABLE_SERVER_HOST ? 'wss://' + S.TABLE_SERVER_HOST : ''), TSn.serverUrl());
check('the table session holds no workers.dev host literal (the host is siteSettings\')', !/\.workers\.dev/i.test(read('lib/shared/tableSession.js')));
const gm = stripComments(read('gm/app.jsx'));
check('the GM board reads its Ko-fi link from the module', /SWRPGSiteSettings\b[^\n]*KOFI_URL/.test(gm) && /href=\{window\.SWRPGSiteSettings\.KOFI_URL\}/.test(gm));
const landing = read('index.html');
check('the landing footer reads its Ko-fi link from the module',
  /SWRPGSiteSettings[^\n]*KOFI_URL/.test(landing) && !/<a\b[^>]*data-role="support"[^>]*href=/.test(landing.replace(/\s+/g, ' ')));

// (v) blank — inject a blank module and reload the CJS consumers
function withBlank(fn) {
  const blank = Object.freeze({ ANALYTICS_TOKEN: '', PRODUCTION_HOSTS: Object.freeze([]), ROOM_SERVER_HOST: '', TABLE_SERVER_HOST: '', AUTH_ORIGIN: '', KOFI_URL: '', BOOK_CONTENT: 'removed' });
  const saved = {};
  const ids = [SETTINGS_PATH, path.join(REPO, 'lib/shared/analytics.js'), path.join(REPO, 'lib/shared/roomClient.js'), path.join(REPO, 'lib/shared/tableSession.js')];
  for (const id of ids) { saved[id] = require.cache[id]; delete require.cache[id]; }
  const m = new Module(SETTINGS_PATH); m.filename = SETTINGS_PATH; m.loaded = true; m.exports = blank;
  require.cache[SETTINGS_PATH] = m;
  try { return fn(); } finally { for (const id of ids) { if (saved[id]) require.cache[id] = saved[id]; else delete require.cache[id]; } }
}
withBlank(() => {
  const A0 = require(path.join(REPO, 'lib/shared/analytics.js'));
  const appended = [];
  const doc = { head: { appendChild: (n) => appended.push(n) }, createElement: () => ({ setAttribute() {} }), querySelector: () => null };
  const host = (S.PRODUCTION_HOSTS[0] || 'example.org');
  check('BLANK: analytics measures nothing, even on a production-looking host',
    A0.shouldMeasure(host, { webdriver: false }, null) === false && A0.install(doc, { hostname: host }, {}, null) === false && appended.length === 0);
  const RC0 = require(path.join(REPO, 'lib/shared/roomClient.js'));
  require(path.join(REPO, 'lib/shared/roomState.js'));
  let dialled = 0;
  const client = RC0.createRoomClient({ code: 'K7WQ4M', memberId: 'm1', name: 'x', WebSocketImpl: function () { dialled++; } });
  client.open();
  const snap = client.snapshot();
  check('BLANK: the room client refuses `no_room_server` and never dials',
    RC0.ROOM_SERVER_HOST === '' && dialled === 0 && snap.phase === 'refused' && snap.refusal && snap.refusal.cause === 'no_room_server',
    { host: RC0.ROOM_SERVER_HOST, dialled, phase: snap.phase, refusal: snap.refusal });
  const TS0 = require(path.join(REPO, 'lib/shared/tableSession.js'));
  check('BLANK: the table session has no server (the screens read it as unreachable)', TS0.serverHost() === '' && TS0.serverUrl() === '', TS0.serverUrl());
});
const auth = stripComments(read('worker/auth.js'));
check('the worker falls back to the module\'s AUTH_ORIGIN, and trusts none when it is blank',
  /import SITE_SETTINGS from '\.\.\/lib\/shared\/siteSettings\.js'/.test(auth)
    && /SITE_SETTINGS\.AUTH_ORIGIN \|\| ''/.test(auth) && /return base \? \[base\] : \[\];/.test(auth));

// (vi) the template (workshop only; in the public tree the module IS the template)
if (fs.existsSync(TEMPLATE_PATH)) {
  delete require.cache[TEMPLATE_PATH];
  const T = require(TEMPLATE_PATH);
  const tk = Object.keys(T);
  check('TEMPLATE: the same keys (TABLE_SERVER_HOST may be absent)', tk.every((k) => KEYS.includes(k)) && KEYS.every((k) => tk.includes(k) || OPTIONAL_IN_TEMPLATE.includes(k)), tk);
  check('TEMPLATE: every account value blank, BOOK_CONTENT removed',
    KEYS.every((k) => (!(k in T) && OPTIONAL_IN_TEMPLATE.includes(k)) || (k === 'BOOK_CONTENT' ? T[k] === 'removed' : Array.isArray(T[k]) ? T[k].length === 0 : T[k] === '')), T);
} else {
  check('no template beside a blank module (this is the public tree)', !filled);
}

console.log(`\nsite settings: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
