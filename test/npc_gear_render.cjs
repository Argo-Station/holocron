#!/usr/bin/env node
/**
 * npc_gear_render.cjs — B-31 anti-divergence pin (ruling npc-gear-display-triage §3.5).
 *
 * NPC gear must render through ONE shared block, not per-card copies (the divergence that hid gear on
 * minion/rival cards for so long — a field added to one of three near-duplicate renderers). This guard
 * asserts, at source, that the one-shared-core wiring holds so a future edit can't silently re-diverge:
 *   - exactly ONE GEAR block (`head="GEAR"`), inside WeaponTable (since B-871; the dark gear list went with the dark face);
 *   - every WeaponTable call passes a `gear=` prop;
 *   - the one stat-block tree reaches it through NpcArsenalBlock.
 *
 * RE-POINTED 2026-07-22 (ruling npc-gear-render-triage, R-E3-2 — TEST-DRIFT, no product bug).
 * The last assert used to demand TWO gear-list uses: one in WeaponTable, one directly in
 * the dark stat-block body. The F4/T2 decomposition then converged further — the body's arsenal section
 * (NpcArsenalBlock) passes gear INTO WeaponTable, which renders the single gear list for every
 * surface. One call site is MORE converged than two, so the code had outgrown the guard's
 * fingerprint while its INVARIANT held (behaviour proven green throughout by
 * scripts/smoke_b31_npc_gear.py, 6/6). The asserts below pin today's convergence — and tighten
 * it: a SECOND gear-list call site appearing anywhere now FAILS, which is the real risk.
 * Standing lesson (ruling §3): a structure guard asserts the invariant's TIGHTEST CURRENT
 * fingerprint, and a re-architecture lap greps test/ for fingerprints it is about to stale.
 *
 * Run: node test/npc_gear_render.cjs
 */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.resolve(__dirname, '..', 'lib', 'library', 'npc', 'view.jsx'), 'utf8');

let failures = 0;
function check(label, cond) {
  if (cond) console.log('  PASS  ' + label);
  else { failures += 1; console.error('  FAIL  ' + label); }
}

function count(re) { return (src.match(re) || []).length; }

// Slice one top-level function body: `function Name(` -> the next line-start `function `.
// Char-window regexes were tried first and are wrong: WeaponTable's gear list sat 8811 chars
// into its body, so any fixed window is a guess that silently passes or fails on file growth.
function body(name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return '';
  const j = src.indexOf('\nfunction ', i + 1);
  return src.slice(i, j < 0 ? src.length : j);
}

// RE-POINTED 2026-09-24 (B-871's deletion ledger, ruling `npc-flip-ledger-switch` R-NFLS-5 — the claim KEPT):
// the dark tier cards, the dark gear list and the dark stat-block body are deleted; every tier renders through the ONE paper
// stat-block tree (`NpcPaperStatBlock`), whose ARSENAL is `NpcArsenalBlock` -> `WeaponTable(gear=)` -> the single
// GEAR block (`<NpcPaperSechead head="GEAR" …>`). The invariant is unchanged — ONE gear render, reached by every
// equipment surface, a second site FAILS — and so is its tightest current fingerprint's shape.

// 1. ONE gear header in the module, and it lives inside WeaponTable (a second is the B-31 divergence).
check('exactly ONE head="GEAR" in the module (a second is the B-31 divergence)', count(/head="GEAR"/g) === 1);
check('the one GEAR block lives inside WeaponTable', /head="GEAR"/.test(body('WeaponTable')));

// 2. every WeaponTable call carries a gear prop (one tree now serves minion, rival and nemesis alike).
const calls = src.match(/<WeaponTable\b[^>]*>/g) || [];
check('at least one WeaponTable call exists (the one tree serves every tier)', calls.length >= 1);
check('EVERY <WeaponTable> call passes a gear= prop', calls.length > 0 && calls.every((c) => /\bgear=/.test(c)));

// 3. the stat-block tree reaches equipment through the arsenal block, which hands gear into WeaponTable.
check('NpcPaperStatBlock reaches equipment via NpcArsenalBlock', /<NpcArsenalBlock\b/.test(body('NpcPaperStatBlock')));
check('NpcArsenalBlock passes gear={statBlock.gear} into WeaponTable',
      /<WeaponTable\b[^>]*\bgear=\{statBlock\.gear\}/.test(body('NpcArsenalBlock')));

console.log(failures === 0 ? '\nnpc_gear_render guard: ALL PASS' : '\nnpc_gear_render guard: ' + failures + ' FAILURES');
process.exit(failures === 0 ? 0 : 1);
