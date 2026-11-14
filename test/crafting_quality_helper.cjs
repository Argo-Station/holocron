#!/usr/bin/env node
/**
 * crafting_quality_helper.cjs — STANDING guard for grantOrIncrementQuality (R-CQM-1).
 *
 * The shared quality WRITE (lib/shared/itemResolve.js), ruled into existence by
 * `crafting-quality-mutation-helper` Q1 (c) as a minimal shared helper: crafting's 12 quality rows
 * use it now, F-53 attachments are bound to consume it rather than write a second (R-CQM-3).
 *
 * R-CQM-1 names the six asserts: bare grant · ranked grant when absent · increment when present ·
 * cap clamps · absent cap does NOT clamp · input array unmutated. Each is below, plus the canon-
 * protection case that R-CQM-2 exists for.
 *
 * THE ONE THAT MATTERS MOST is "absent cap does not clamp". Crafting's printed maxima are CRAFTING's,
 * not the game's — the shipped catalogue legally carries Vicious 6 / Pierce 6 / Stun 8 against
 * crafting's Vicious 5. A helper that clamped by default would silently corrupt canon data, and
 * R-CQM-2 bars any lap from "fixing" the catalogue to obey a cap that was never global.
 *
 * Run: node test/crafting_quality_helper.cjs
 */
const IR = require('../lib/shared/itemResolve.js');
let failures = 0;
function check(label, cond) {
  if (cond) console.log('  PASS  ' + label);
  else { failures += 1; console.error('  FAIL  ' + label); }
}
const g = IR.grantOrIncrementQuality;
const rank = (list, id) => (list.find((q) => q.id === id) || {}).rank;

function main() {
  // 1. BARE GRANT (unranked) — Knockdown / Sunder shape.
  const bare = g([], 'knockdown', { ranked: false, name: 'Knockdown' });
  check('bare grant: unranked quality appended', bare.length === 1 && bare[0].id === 'knockdown');
  check('bare grant: carries ranked:false and NO rank',
    bare[0].ranked === false && bare[0].rank === undefined);
  check('bare grant: re-granting an unranked quality is a no-op (no duplicate row)',
    g(bare, 'knockdown', { ranked: false }).length === 1);

  // 2. RANKED GRANT when absent — enters at rank 1.
  const r1 = g([], 'pierce', { ranked: true, name: 'Pierce' });
  check('ranked grant: absent quality enters at rank 1', rank(r1, 'pierce') === 1);
  check('ranked grant: carries ranked:true + name', r1[0].ranked === true && r1[0].name === 'Pierce');

  // 3. INCREMENT when present.
  check('increment: rank 1 -> 2', rank(g(r1, 'pierce', { ranked: true }), 'pierce') === 2);
  check('increment: rank 2 -> 3 (repeatable)',
    rank(g(g(r1, 'pierce', { ranked: true }), 'pierce', { ranked: true }), 'pierce') === 3);
  const mixed = g([{ id: 'vicious', name: 'Vicious', ranked: true, rank: 1 }], 'pierce', { ranked: true });
  check('increment: an unrelated quality is left alone', rank(mixed, 'vicious') === 1 && rank(mixed, 'pierce') === 1);

  // 4. CAP CLAMPS when supplied — crafting's Defensive/Deflection/Accurate 3, Vicious 5.
  const atCap = [{ id: 'defensive', name: 'Defensive', ranked: true, rank: 3 }];
  check('cap: at the cap, increment does not exceed it',
    rank(g(atCap, 'defensive', { ranked: true, cap: 3 }), 'defensive') === 3);
  check('cap: below the cap, increment still works',
    rank(g([{ id: 'defensive', ranked: true, rank: 2 }], 'defensive', { ranked: true, cap: 3 }), 'defensive') === 3);
  check('cap: ABOVE the cap (pre-existing canon value) is never reduced',
    rank(g([{ id: 'vicious', ranked: true, rank: 6 }], 'vicious', { ranked: true, cap: 5 }), 'vicious') === 6);

  // 5. ABSENT CAP DOES NOT CLAMP — R-CQM-2's protection. Catalogue ranks legally exceed crafting's.
  const v6 = g([{ id: 'vicious', name: 'Vicious', ranked: true, rank: 6 }], 'vicious', { ranked: true });
  check('no cap: a shipped Vicious 6 increments to 7, NOT clamped to crafting\'s 5 (R-CQM-2)',
    rank(v6, 'vicious') === 7);
  check('no cap: Stun 8 (shipped) increments freely',
    rank(g([{ id: 'stun', ranked: true, rank: 8 }], 'stun', { ranked: true }), 'stun') === 9);

  // 6. PURITY — the input array AND its entries survive untouched (the applyOverlay posture).
  const src = [{ id: 'pierce', name: 'Pierce', ranked: true, rank: 2 }];
  const snapshot = JSON.stringify(src);
  const derived = g(src, 'pierce', { ranked: true });
  check('purity: input array is not mutated', JSON.stringify(src) === snapshot);
  check('purity: returns a NEW array', derived !== src);
  check('purity: the input ENTRY object is not mutated (replaced, not edited)',
    src[0].rank === 2 && derived.find((q) => q.id === 'pierce').rank === 3);
  check('purity: granting into an empty/absent list tolerates null input',
    g(null, 'stun', { ranked: true }).length === 1);

  // 7. Fields the render pipeline needs survive — a crafted quality must look like a catalog one
  //    (concept §4.2: the crafted weapon renders through the SAME quality renderer).
  const shaped = g([], 'accurate', { ranked: true, name: 'Accurate', cap: 3 });
  check('shape: matches the weapons.json quality shape {id,name,ranked,rank}',
    shaped[0].id === 'accurate' && shaped[0].name === 'Accurate'
    && shaped[0].ranked === true && shaped[0].rank === 1);

  console.log(failures === 0 ? '\nquality helper guard: ALL PASS' : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
