#!/usr/bin/env node
/* test/n9_group_owner.cjs — N-9, the group's ship tag: the owner word is the group's swrpg_party_v1 id (ruling
 * `between-sessions-build-paper` R-BSBP-1, -2; `between-sessions-lap-a-card` §3 item 4). One test per reader:
 *   A1  vesselStore.acquiredLine: a `party_<uuid>` owner prints the legacy party's sentence; a note still wins; the other
 *       owners print as before
 *   B1  vesselResolve.resolveBond: a group id the host passes holds the bond; without it, or for another group, it does
 *       not; `char:` and `party` hold as before; retired and destroyed never do
 *   V1  vesselView's three owner labels (ownerName · the hangar chip ownerLabel · the ship's plate shipRun), read from the
 *       .jsx source: the group's name; with an empty name the campaign's; with neither THE GROUP; a word naming no group
 *       here falls through as any unknown owner does (NO OWNER's path); `party` reads as before
 * Env T9_VS / T9_VR / T9_VV measure another source (the bite: `node test/n9_group_owner.cjs --bite`).
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), os = require('os');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const SRC = { VS: process.env.T9_VS || path.join(ROOT, 'lib/shared/vesselStore.js'), VR: process.env.T9_VR || path.join(ROOT, 'lib/shared/vesselResolve.js'),
  VV: process.env.T9_VV || path.join(ROOT, 'lib/shared/vesselView.jsx') };

const MUTANTS = [
  ['acquired-no-group', 'A1', "owner === 'party' || /^party_/.test(owner)", "owner === 'party'"],
  ['bond-ignores-groups', 'B1', '&& (groupIds || []).indexOf(rec.owner) === -1) return null;', ') return null;'],
  ['bond-any-group', 'B1', '&& (groupIds || []).indexOf(rec.owner) === -1) return null;', '&& !/^party_/.test(rec.owner)) return null;'],
  ['no-campaign-name', 'V1', 'return g.name || (c && c.name) || \'THE GROUP\';', 'return g.name || \'THE GROUP\';'],
  ['unknown-group-named', 'V1', '    if (!g) return null;\n    var c = C', '    if (!g) return \'THE GROUP\';\n    var c = C'],
  ['chip-skips-group', 'V1', '    if (groupName(owner)) return upper(groupName(owner));\n', ''],
  ['name-skips-group', 'V1', '      if (groupName(owner)) return groupName(owner);\n', ''],
  ['plate-skips-group', 'V1', "var gn = rec.owner === 'party' ? 'THE PARTY' : groupName(rec.owner);", "var gn = rec.owner === 'party' ? 'THE PARTY' : null;"],
];
if (process.argv.includes('--bite')) {
  let bad = 0;
  for (const [name, leg, find, repl] of MUTANTS) {
    const key = { A1: 'VS', B1: 'VR', V1: 'VV' }[leg], src = fs.readFileSync(SRC[key], 'utf8');
    if (src.split(find).length !== 2) { console.log('  BROKEN MUTANT ' + name); bad++; continue; }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'n9-')), f = path.join(tmp, path.basename(SRC[key]));
    fs.writeFileSync(f, src.replace(find, repl));
    const r = spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { ['T9_' + key]: f }), encoding: 'utf8' });
    const ok = r.status === 1 && new RegExp('FAIL  ' + leg + ' ').test(r.stdout);
    console.log((ok ? '  BIT   ' : '  MISSED') + ' ' + name.padEnd(22) + ' → ' + leg + (ok ? '' : ' (exit ' + r.status + ')'));
    if (!ok) bad++;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(bad ? bad + ' mutant(s) survived' : 'every mutant bit (' + MUTANTS.length + ')');
  process.exit(bad ? 1 : 0);
}

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ok    ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail !== undefined ? '  -> ' + JSON.stringify(detail).slice(0, 300) : '')); }
}
function leg(name, fn) { try { fn(); } catch (e) { check(name + ' threw: ' + (e && e.stack), false); } }
const load = (f, g) => { const sb = { console, Date, JSON, Math }; vm.runInNewContext(fs.readFileSync(f, 'utf8'), Object.assign(sb, { window: sb })); return sb[g]; };
const G = 'party_7f3a';

leg('A1', () => {
  const VS = load(SRC.VS, 'SWRPGVessels');
  const line = (owner, note) => VS.acquiredLine({ owner, acquired: { note: note || null, when: '2026-11-17' }, provenance: [] }, { npcName: 'Vex' });
  check('A1 a group\'s party_<uuid> owner prints the party\'s sentence', line(G).text === 'Added to the party’s ships.', line(G));
  check('A1 a note still wins over the sentence', line(G, 'Won at sabacc.').text === 'Won at sabacc.');
  check('A1 char, party, npc and no owner print as before', line('char:k').text === 'Added to your ships.' && line('party').text === 'Added to the party’s ships.'
    && line('npc:vex').text === 'Added under Vex from the catalogue.' && line('').text === null && line('name:Bob').text === null);
});
leg('B1', () => {
  const VR = load(SRC.VR, 'SWRPGVesselResolve');
  const char = { id: 'kael', sheetData: { myShipId: 'v1' } };
  const v = (owner, extra) => [Object.assign({ id: 'v1', owner }, extra || {})];
  check('B1 a group id the host passes holds the bond', VR.resolveBond(char, v(G), [G]) && VR.resolveBond(char, v(G), [G]).id === 'v1');
  check('B1 without it, or for another group, no bond', VR.resolveBond(char, v(G)) === null && VR.resolveBond(char, v(G), ['party_other']) === null);
  check('B1 char: and party hold as before', !!VR.resolveBond(char, v('char:kael')) && !!VR.resolveBond(char, v('party')) && VR.resolveBond(char, v('char:lyra'), [G]) === null);
  check('B1 retired and destroyed never hold, group or not', VR.resolveBond(char, v(G, { retired: { when: null } }), [G]) === null && VR.resolveBond(char, v(G, { destroyed: { state: 'lost' } }), [G]) === null);
});

function sliceIn(src, name) {
  const at = src.indexOf('\n  function ' + name + '('); if (at < 0) throw new Error('no function ' + name);
  const rest = src.slice(at + 1); const end = rest.indexOf('\n  function ', 1); return end < 0 ? rest : rest.slice(0, end);
}
leg('V1', () => {
  const src = fs.readFileSync(SRC.VV, 'utf8');
  const blockAt = src.indexOf('    var ownerName = (function () {');
  const block = src.slice(blockAt, src.indexOf('})();', blockAt) + 5);
  const parties = { [G]: { id: G, name: 'The Ghost Crew' }, party_empty: { id: 'party_empty', name: '' }, party_bare: { id: 'party_bare', name: '' } };
  const camps = [{ id: 'c1', partyId: 'party_empty', name: 'Outer Rim' }, { id: 'c2', partyId: 'party_bare', name: '' }];
  const win = { SWRPGParty: { load: () => ({}), partyOf: (s, id) => parties[id] || null }, SWRPGCampaigns: { load: () => ({ campaigns: camps }) },
    SWRPGVessels: { parseWho: (w) => { const m = /^(char|npc|name):(.*)$/.exec(w || ''); return m ? (m[1] === 'name' ? { kind: 'name', text: m[2] } : { kind: m[1], id: m[2] }) : null; } } };
  const ctx = vm.createContext({ window: win, String, Object, Array, JSON });
  vm.runInContext(['groupName', 'whoOf', 'npcOf', 'upper', 'ownerLabel', 'shipRun'].map((n) => { try { return sliceIn(src, n); } catch (e) { return ''; } }).join('\n')
    + "\nvar NO_OWNER = '__no_owner__', _ydReg = null;\nfunction ownerNameOf(owner) { var reg = null, props = { roster: [] };\n" + block + "\n return ownerName; }", ctx);
  const chip = (o) => ctx.ownerLabel(o, []), name = (o) => ctx.ownerNameOf(o), plate = (o, flag) => ctx.shipRun({ host: 'gm', owner: null, reg: null, roster: [] }, { id: 'v1', owner: o }, flag ? [{ flagship: 'v1' }] : []);
  check('V1 the group\'s name: ownerName, the chip, the plate (ship and flagship)', name(G) === 'The Ghost Crew' && chip(G) === 'THE GHOST CREW'
    && plate(G) === 'THE GHOST CREW’S SHIP' && plate(G, true) === 'THE GHOST CREW’S FLAGSHIP', [name(G), chip(G), plate(G), plate(G, true)]);
  check('V1 an empty name shows the campaign\'s name', name('party_empty') === 'Outer Rim' && chip('party_empty') === 'OUTER RIM' && plate('party_empty') === 'OUTER RIM’S SHIP', [name('party_empty'), chip('party_empty'), plate('party_empty')]);
  check('V1 with neither: THE GROUP', name('party_bare') === 'THE GROUP' && chip('party_bare') === 'THE GROUP' && plate('party_bare') === 'THE GROUP’S SHIP', [name('party_bare'), chip('party_bare'), plate('party_bare')]);
  check('V1 a word naming no group here reads as any unknown owner does', name('party_gone') === '' && chip('party_gone') === 'PARTY_GONE' && plate('party_gone') === 'THE SHIP', [name('party_gone'), chip('party_gone'), plate('party_gone')]);
  check('V1 party reads as before', name('party') === 'THE PARTY' && chip('party') === 'PARTY' && plate('party') === 'THE PARTY’S SHIP' && plate('party', true) === 'THE PARTY’S FLAGSHIP');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
