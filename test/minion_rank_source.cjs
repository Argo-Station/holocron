/**
 * Guard — a minion group's skill ranks derive from LIVE STANDING, through ONE function.
 * Ruling `bench-minion-skill-standing-triage` (§3.2 one shared core, R-BMS-1).
 *
 * WHAT WENT WRONG, so the guard's shape makes sense: two components each re-derived the RAW rule
 * inline (`standing - 1` in the (since deleted) minion card, `groupCount - 1` in NpcStatsBlock) while the shared
 * `BenchStore.minionGroupRanks` sat unused by either. Two copies of one rule is two chances to feed
 * the wrong input, and that is exactly what happened: the tabbed reference card was handed
 * `m.count` — the squad's ORIGINAL size — so its dice never changed as minions fell. A GM at a real
 * table saw four troopers' dice with one trooper left, and reported it.
 *
 * The math itself is covered by npc_bench_store.cjs. THIS guard covers the wiring: that no consumer
 * re-derives the rule, and that the rank input is named and fed from standing. A future edit that
 * reintroduces an inline `- 1`, or feeds a count where standing belongs, goes red here.
 *
 * Run: node test/minion_rank_source.cjs
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const VIEW = fs.readFileSync(path.join(ROOT, 'lib/library/npc/view.jsx'), 'utf8');
const STORE = fs.readFileSync(path.join(ROOT, 'lib/library/npc/benchStore.js'), 'utf8');

let pass = 0, fail = 0;
const check = (label, cond, detail) => {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (detail !== undefined ? '  -> ' + JSON.stringify(detail) : '')); }
};
// strip comments so prose about the rule never satisfies (or trips) a source assert
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const V = code(VIEW), S = code(STORE);

console.log('minion_rank_source — one rule, one function, fed from standing\n');

// ── the single source ────────────────────────────────────────────────────────
check('benchStore defines minionGroupRanks', /function\s+minionGroupRanks\s*\(/.test(S));
check('benchStore exports it', /minionGroupRanks\s*:\s*minionGroupRanks/.test(S));

// ── no consumer re-derives the rule ──────────────────────────────────────────
// Any "<something>standing|count|size> - 1" used as a rank is the divergence that caused this bug.
// Only a RANK derivation counts. A "- 1" inside a size setter (the "remove one minion" button)
// is arithmetic on the group's size, not on its skill ranks, so it is excluded by line context.
const INLINE = /\b(\w*[Ss]tanding|\w*[Cc]ount|\w*[Ss]ize)\s*-\s*1\b/;
const inlineHits = V.split('\n')
  .filter((l) => INLINE.test(l))
  .filter((l) => !/set[A-Z]\w*\(|onClick|aria-label|poolMax|index|idx|\.length/.test(l))
  .map((l) => l.trim().slice(0, 80));
check('no inline "<count|standing|size> - 1" rank derivation survives in view.jsx',
  inlineHits.length === 0, inlineHits);

// ── every rank consumer goes through the function ────────────────────────────
const rankAssigns = V.match(/groupSkillRank\s*=\{[^}]*\}/g) || [];
check('at least one groupSkillRank consumer exists', rankAssigns.length > 0, rankAssigns.length);
// The attribute may call the function directly, or pass a variable that does. A bare identifier is
// accepted only because every such variable is asserted separately below.
rankAssigns.forEach((a) => check('groupSkillRank derives via minionGroupRanks: ' + a.slice(0, 52),
  /minionGroupRanks/.test(a) || /groupSkillRank=\{[A-Za-z_$][\w$]*\}/.test(a), a));
// RETIRED 2026-09-24 (B-871's deletion ledger, ruling `npc-flip-ledger-switch` R-NFLS-5): the dark minion card's
// skillBonus assert. That card went with the dark face; its claim — a minion's skill dice come from
// minionGroupRanks — is CARRIED by the `groupSkillRank derives via minionGroupRanks` asserts above, which now read
// the paper tree's two derivations (NpcStatsBlock's and NpcPaperStatBlock's arsenal).

// ── the input is STANDING, and is named so ───────────────────────────────────
check('NpcStatsBlock takes groupStanding (not groupCount)',
  /function\s+NpcStatsBlock\s*\(\{[^}]*groupStanding/.test(V) && !/function\s+NpcStatsBlock\s*\(\{[^}]*groupCount/.test(V));
// RE-POINTED 2026-09-24 (B-871, claim kept): the tabbed card is now the ONE paper stat-block tree.
check('NpcPaperStatBlock takes groupStanding and hands it to NpcStatsBlock',
  /function\s+NpcPaperStatBlock\s*\(\{[^}]*groupStanding/.test(V) && /<NpcStatsBlock\b[^>]*groupStanding=\{groupStanding\}/.test(V));
check('no groupCount prop survives anywhere in view.jsx', !/groupCount/.test(V),
  (V.match(/.{0,40}groupCount.{0,40}/) || [])[0]);

// ── the bench feeds standing, never the line's size ──────────────────────────
const benchRef = (V.match(/function\s+BenchTabbedReference[\s\S]*?\n\}/) || [''])[0];
check('BenchTabbedReference destructures poolView from ctx', /poolView/.test(benchRef));
check('BenchTabbedReference feeds groupStanding from poolView().standing',
  /groupStanding=\{/.test(benchRef) && /poolView\(m\)[^;]*standing/.test(benchRef));
check('BenchTabbedReference does NOT read m.count for the rank',
  !/parseInt\(m\.count/.test(benchRef), (benchRef.match(/.{0,50}m\.count.{0,30}/) || [])[0]);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
