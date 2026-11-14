#!/usr/bin/env node
/* RELEASE 1.0 R7 · lap release-r7-dice-roll-modifier-legibility (ruling release-r7-bug-burndown ADDENDUM 168 @ eb0591735).
 *
 * One leg per FIX row, each over the hub's own functions SLICED from lib/shared/diceHub.jsx (and player/app.jsx) by exact header (a miss reds):
 *
 *   B-1471  m7HubLines words a skill_characteristic reminder's limit for EVERY limit it knows, not only once per
 *           session: reSpecialized fad-v1 `respec_slytooka` (Charm/Negotiation with Cunning, `once_per_encounter`)
 *           reads "Sly As A Tooka — once per encounter, roll this with Cunning".
 *
 * Exit 0 only when every leg passes.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
let failures = 0;
const check = (ok, m) => { if (!ok) failures += 1; console[ok ? 'log' : 'error']((ok ? '  PASS  ' : '  FAIL  ') + m); };
const SRC = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const S = (x) => JSON.stringify(x);

function sliceDecl(src, header) {
  const i = src.indexOf(header);
  if (i < 0 || src.indexOf(header, i + 1) >= 0) throw new Error('SLICE MISS: ' + header);
  let k = src.indexOf('{', i + header.length - 1), depth = 0;
  for (; k < src.length; k++) { if (src[k] === '{') depth++; else if (src[k] === '}') { depth--; if (depth === 0) { k++; break; } } }
  return src.slice(i, k);
}
const APP = SRC('player/app.jsx');
// D-507 (handoff `encounters-e3-dicehub-move`): poolModRemindersFor, m7TalentName, m7Gerund and m7HubLines moved VERBATIM with
// DiceHub's closure to lib/shared/diceHub.jsx — sliced from there by name; SKILL_NAMES and m7CapChar stay in player/app.jsx
const HUB = SRC('lib/shared/diceHub.jsx');

// ═══ B-1471 — a once-per-encounter reminder words its limit ═══
console.log('B-1471 (m7HubLines: a skill_characteristic reminder words its limit)');
(function () {
  // the pack's row, read from the shipped overlay (the leg's subject, not a planted one)
  const pack = JSON.parse(SRC('public/data/mods/respecialized/fad-v1/talents.overlay.json'));
  let row = null;
  (function find(o) {
    if (row || !o || typeof o !== 'object') return;
    if (o.id === 'respec_slytooka') { row = o; return; }
    (Array.isArray(o) ? o : Object.values(o)).forEach(find);
  })(pack);
  const eff = row && (row.effects || []).find((e) => e.op === 'skill_characteristic');
  check(!!eff && eff.limit === 'once_per_encounter' && eff.applies === 'reminder' && eff.to === 'cunning',
    'fad-v1 respec_slytooka carries a once_per_encounter Cunning reminder (' + S(eff && { limit: eff.limit, applies: eff.applies, to: eff.to }) + ')');

  const sb = { console, Object, Array, String, Number, JSON, window: {}, CharResolve: {} };
  vm.createContext(sb);
  vm.runInContext([sliceDecl(APP, 'const SKILL_NAMES = {') + ';', sliceDecl(HUB, 'function poolModRemindersFor(mods, skillKeyOrId, characteristic)'),
    sliceDecl(APP, 'function m7CapChar(c)'), sliceDecl(HUB, 'function m7TalentName(cb, because)'), sliceDecl(HUB, 'function m7Gerund(phrase)'),
    sliceDecl(HUB, 'function m7HubLines(sheet, key, rank, sc, cb, using)')].join('\n') + '\nglobalThis.__L = { m7HubLines };', sb, { filename: 'b1471-slices' });
  const cb = { talents: { respec_slytooka: { name: row ? row.name : 'Sly As A Tooka' } } };
  const sheet = { characteristics: { presence: 2, cunning: 3 } };
  const read = (limit) => sb.__L.m7HubLines(sheet, 'charm', 1,
    { characteristic: 'presence', base: 'presence', because: 'base', reminders: [{ characteristic: 'cunning', because: 'talent:respec_slytooka', limit }] },
    cb, null, []).offers.map((o) => o.text);
  const enc = read('once_per_encounter'), ses = read('once_per_session'), rnd = read('once_per_round'), none = read(undefined);
  check(S(enc) === S(['Sly As A Tooka — once per encounter, roll this with Cunning']), 'once per encounter worded: ' + S(enc));
  check(S(ses) === S(['Sly As A Tooka — once per session, roll this with Cunning']), 'once per session unchanged: ' + S(ses));
  check(S(rnd) === S(['Sly As A Tooka — once per round, roll this with Cunning']), 'once per round worded: ' + S(rnd));
  check(S(none) === S(['Sly As A Tooka — roll with Cunning']), 'no limit: no limit words: ' + S(none));
})();

console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
process.exit(failures ? 1 : 0);
