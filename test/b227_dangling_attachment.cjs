/* test/b227_dangling_attachment.cjs — B-227: a dangling attachment id-ref DEGRADES in the player
 * lane and still THROWS in the canonical lane.
 *
 * The defect: `resolveAttachment` throws by design (canonical-integrity contract), but the player's
 * equipment lane is the graceful one — `pcResolveEntry` returns null and the sheet renders a
 * visible marker. Attachments had no such lane, so one bad id inside `hardpointAccounting` failed
 * the WHOLE loadout panel render: the panel did not mount while the face still did.
 *
 * Direction ruled by `gear-consolidation-build` §3 (B-227): the PC lane degrades to null + the
 * existing marker pattern; the loud path stays for code/NPC paths. BOTH halves are asserted here —
 * a test that only proved the graceful half would pass a change that softened the canonical
 * contract too, which is the thing the ruling explicitly kept.
 *
 * Run: node test/b227_dangling_attachment.cjs
 */
'use strict';
const path = require('path');
const IR = require(path.join(__dirname, '..', 'lib', 'shared', 'itemResolve.js'));

let pass = 0, fail = 0;
function check(label, ok, detail) {
  console.log((ok ? '  PASS  ' : '  FAIL  ') + label + (ok || !detail ? '' : '\n          -> ' + detail));
  ok ? pass++ : fail++;
}

const REG = {
  cheek_pad:    { id: 'cheek_pad',    name: 'Cheek Pad',    hp: 1 },
  augmented_hp: { id: 'augmented_hp', name: 'Augmented HP', hp: null },   // real, cost unknown
};

// ── A. the GRACEFUL lane (the fix) ────────────────────────────────────────────────────────────
check('A1 resolves a real id-ref', IR.pcResolveAttachment('cheek_pad', REG) === REG.cheek_pad);
check('A2 resolves a {id} catalog ref', IR.pcResolveAttachment({ id: 'cheek_pad' }, REG) === REG.cheek_pad);
// try/catch is LOAD-BEARING here, not defensive noise. The mutation these two exist to catch is
// "the PC lane throws like the loud one" — and an uncaught throw KILLS the run, which prints no
// FAIL line at all and reads exactly like a mutant the guard ignored (PRAXIS §6: read the exit
// code, not the output). Caught, the guard NAMES what broke instead of dying at it.
function nullNotThrow(fn) {
  try { return fn() === null ? true : 'returned a value instead of null'; }
  catch (e) { return 'THREW: ' + e.message + ' (the PC lane must degrade, not throw)'; }
}
let r3 = nullNotThrow(() => IR.pcResolveAttachment('ghost_attachment', REG));
check('A3 a DANGLING string returns null, never throws', r3 === true, r3 === true ? '' : r3);
let r4 = nullNotThrow(() => IR.pcResolveAttachment({ id: 'ghost_attachment' }, REG));
check('A4 a DANGLING {id} returns null, never throws', r4 === true, r4 === true ? '' : r4);
check('A5 an INLINE record passes through (same as the loud lane)',
      IR.pcResolveAttachment({ name: 'Homebrew', hp: 2 }, REG).name === 'Homebrew');
let r6 = nullNotThrow(() => IR.pcResolveAttachment('cheek_pad', undefined));
check('A6 a missing registry does not throw', r6 === true, r6 === true ? '' : r6);

// ── B. the accounting the panel actually calls ────────────────────────────────────────────────
let acct;
try {
  acct = IR.pcHardpointAccounting(3, ['cheek_pad', 'ghost_attachment', { id: 'also_ghost' }], REG);
  check('B1 accounting SURVIVES a dangling ref (this is the panel not going down)', true);
} catch (e) {
  check('B1 accounting SURVIVES a dangling ref (this is the panel not going down)', false, e.message);
  acct = {};
}
check('B2 used counts only what resolved (1, not 3)', acct.used === 1, 'used=' + acct.used);
check('B3 unresolved is COUNTED, not silently dropped', acct.unresolved === 2, 'unresolved=' + acct.unresolved);
check('B4 unresolved is NOT folded into uncosted — two different facts',
      acct.uncosted === 0, 'uncosted=' + acct.uncosted);
check('B5 a null-cost REAL attachment still counts as uncosted, not unresolved', (function () {
  const a = IR.pcHardpointAccounting(3, ['augmented_hp'], REG);
  return a.uncosted === 1 && a.unresolved === 0;
})());
check('B6 capacity/over still computed normally', acct.capacity === 3 && acct.over === false);

// ── C. the LOUD lane is UNCHANGED — the half the ruling deliberately kept ──────────────────────
check('C1 canonical resolveAttachment STILL throws on a dangling string', (function () {
  try { IR.resolveAttachment('ghost_attachment', REG); return false; } catch (e) { return true; }
})());
check('C2 canonical resolveAttachment STILL throws on a dangling {id}', (function () {
  try { IR.resolveAttachment({ id: 'ghost_attachment' }, REG); return false; } catch (e) { return true; }
})());
// The message check is the assert, not decoration. Softening resolveAttachment to `return null`
// makes this line throw a TypeError on `att.hp` instead — still a throw, so a bare try/catch
// PASSED a mutant that had removed the very contract C3 exists to protect. "It threw" and "it
// threw the integrity error" are different claims.
check('C3 canonical hardpointAccounting STILL throws the INTEGRITY error (not just any error)',
  (function () {
    try { IR.hardpointAccounting(3, ['ghost_attachment'], REG); return false; }
    catch (e) { return /dangling attachment id-ref/.test(e.message); }
  })());
check('C4 the two lanes AGREE when everything resolves — no arithmetic drift', (function () {
  const loud = IR.hardpointAccounting(3, ['cheek_pad', 'augmented_hp'], REG);
  const pc = IR.pcHardpointAccounting(3, ['cheek_pad', 'augmented_hp'], REG);
  return loud.used === pc.used && loud.capacity === pc.capacity
      && loud.over === pc.over && loud.uncosted === pc.uncosted;
})());

console.log('\n  B-227 dangling attachment: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
