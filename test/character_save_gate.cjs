/* test/character_save_gate.cjs — B-263: the character-save envelope is READ, not just written.
 *
 * player/app.jsx stamps every exported character with
 *     { schema: 'swrpg-character-sheet', schema_version: 1, ... }
 * and until now nothing read either field back. The one version field whose entire job is to
 * protect a USER'S OWN FILE was inert.
 *
 * The synthetic save below is the point of this guard: a file from a FUTURE build, which cannot be
 * produced by any build that exists, so the only way to test the refusal is to write one.
 *
 * NOTE, stated rather than implied: no import path consumes this yet — the app exports saves and
 * has no reader. The gate exists so the FIRST import cannot be written without one.
 *
 * Run: node test/character_save_gate.cjs
 */
'use strict';
const path = require('path');
const G = require(path.join(__dirname, '..', 'lib', 'shared', 'versionGuard.js'));

let ok = 0, fail = 0;
function check(label, cond, detail) {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + label + (!cond && detail !== undefined ? '   -> ' + JSON.stringify(detail) : ''));
  cond ? ok++ : fail++;
}

const save = (over) => Object.assign({
  schema: 'swrpg-character-sheet', schema_version: 1,
  exported_at: '2026-08-24T00:00:00.000Z', sheet: { name: 'Vessa Rone' }, character: { id: 'x' },
}, over);

// The envelope the app actually writes must open. If this ever fails, the gate is refusing our own
// exports and every user with a saved file is locked out.
const now = G.readCharacterSave(save({}));
check('a save from THIS build opens', now.ok === true, now);

// THE SYNTHETIC FUTURE SAVE — the case that cannot be produced by any build that exists.
const future = G.readCharacterSave(save({ schema_version: 2 }));
check('a save from a FUTURE build is REFUSED', future.ok === false, future);
check('…for the right reason, not by accident', future.reason === 'version-ahead', future);
check('…and it says so in words a player can act on',
  /newer version/i.test(future.message || '') && /update/i.test(future.message || ''), future.message);
check('…and reports both versions, so the refusal is diagnosable',
  future.version === 2 && future.expected === 1, future);

// Far-future, to prove it is a comparison and not an equality check on 2.
check('a save from a FAR-future build is refused too',
  G.readCharacterSave(save({ schema_version: 97 })).ok === false);

// Old saves must keep opening. A version gate that locks out history is a worse bug than no gate.
check('an OLDER save still opens', G.readCharacterSave(save({ schema_version: 0 })).ok === true);
const legacy = G.readCharacterSave({ schema: 'swrpg-character-sheet', sheet: {} });
check('an UNVERSIONED legacy save still opens (isAhead treats absent as not-ahead, on purpose)',
  legacy.ok === true, legacy);

// Not our file at all.
check('a foreign JSON is refused as wrong-schema',
  G.readCharacterSave({ schema: 'something-else', data: 1 }).reason === 'wrong-schema');
check('a schema-less object is refused', G.readCharacterSave({ sheet: {} }).ok === false);
check('null / a string / a number are refused without throwing',
  [null, 'x', 7, undefined].every((v) => G.readCharacterSave(v).ok === false));

// ONE CORE, not two comparisons: the gate must defer to isAhead rather than re-deriving it.
check('the gate and isAhead agree at the boundary',
  G.isAhead(2, 1) === true && G.readCharacterSave(save({ schema_version: 2 })).ok === false
  && G.isAhead(1, 1) === false && G.readCharacterSave(save({ schema_version: 1 })).ok === true);

// The constants the app stamps with must be the ones the gate checks against.
check('the exported constants match what player/app.jsx stamps',
  G.CHARACTER_SAVE_SCHEMA === 'swrpg-character-sheet' && G.CHARACTER_SAVE_VERSION === 1);

console.log('\ncharacter save gate: ' + ok + '/' + (ok + fail) + ' PASS' + (fail ? '  (' + fail + ' FAILED)' : ''));
process.exit(fail ? 1 : 0);
