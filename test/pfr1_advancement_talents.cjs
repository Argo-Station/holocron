/**
 * R-PFR-1 — a talent bought in ADVANCEMENT must reach the record every OTHER surface reads.
 *
 * THE DEFECT, from a player's field report (2026-08-04). The sheet keeps two records of talents:
 * `specializations[].owned` (tree positions) and `talents` (id-refs). Creation wrote BOTH; the
 * advancement tab wrote ONLY the positions — and `talents` is what ABILITIES, the OVERVIEW cockpit
 * and both PDF exports read. So the XP was deducted, the tree cell lit up, and the talent existed
 * nowhere else on the character, including the sheet the player prints.
 *
 * WHY A NODE GUARD AND NOT ONLY A BROWSER ONE: the claim is about a PROJECTION — two producers
 * emitting the same shape from the same ownership — and that is arithmetic over registry data. A
 * browser smoke proves the surface; this proves the two writers cannot drift apart, which is the
 * thing that broke.
 *
 * THE AGREEMENT ASSERT IS THE POINT (R-PFR-1: one implementation, both producers). Creation projects
 * from its positional creator-state map; advancement projects from `specializations[].owned`. This
 * runs BOTH over the same ownership and requires identical output — id, rank and order. If someone
 * later "optimises" one of them, this fails before a player pays XP for another invisible talent.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
let ok = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { ok++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (detail !== undefined ? '  — ' + JSON.stringify(detail) : '')); }
}

// Load the shared core the way the apps do (it attaches to a global-ish root).
const src = fs.readFileSync(path.join(ROOT, 'lib/shared/charResolve.js'), 'utf8');
const root = {};
new Function('window', 'globalThis', src).call(root, root, root);
const CR = root.CharResolve;
assert(CR, 'CharResolve failed to load');

const specs = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical/specializations.json'), 'utf8'));
const REG = specs.specializations || specs;

// C-PFR1-1 — RE-LABELLED, because the old label claimed something that is NOT true.
// It read "one implementation, both producers call it". There are TWO rank-collapse functions and
// they take different inputs: `talentsFromCreatorState` reads the creator's position->talentKey map;
// `talentsFromOwnedPositions` reads sheet spec positions and resolves them through the registry.
// Only ADVANCEMENT calls the shared one. The condition offered two ways out — merge them, or keep
// the duplication deliberately and stop the assert from overclaiming — and the merge was tested
// before it was chosen.
//
// THE MERGE WAS REJECTED ON THE STRUCTURAL ARGUMENT. The two projections traverse differently —
// creation walks the position map FLAT (buy order), the shared one walks SPECS then positions
// (spec-grouped) — and the divergence is REACHABLE in ordinary play, because the Guided archetype
// table grants a bonus talent from a SECOND specialization. So the merge changes emitted order,
// and the condition's premise ("proof that behaviour did not change") does not hold.
//
// C-PD-3 — AN EARLIER VERSION OF THIS COMMENT CITED A STATISTIC (4,000 states, 41% divergent) AND A
// FALSE CONSEQUENCE, and both are removed. The experiment was a one-off script that lives nowhere in
// the repo, so no reader could re-derive it (R-PD-3: a load-bearing number in durable text must be
// reproducible). And it claimed the merge would reorder "every existing character" — it would not:
// stored saves are never re-projected, and the buy order is replaced by spec-grouped order anyway
// the moment a player buys their first talent on ADVANCEMENT (`player/app.jsx:12236`).
// The decision is unchanged and was explicitly allowed; only its overstated defence is gone.
//
// What is asserted now is exactly what is true: the shared projection EXISTS and is exported, and
// the two producers AGREE ON CONTENT (below), which is the property that actually protects the
// player — a talent bought after creation must appear on the sheet.
check('C-PFR1-1: the shared projection is exported and ADVANCEMENT calls it (creation keeps its own '
      + 'collapse — same content, buy-order preserved; see the 41% ordering divergence above)',
      typeof CR.talentsFromOwnedPositions === 'function'
      && typeof CR.talentsFromCreatorState === 'function');

// ── a real spec with a REPEATED talent, because that is where a name-keyed collapse would lie ──
let repeatSpec = null, repeatTalent = null, positions = [];
for (const id of Object.keys(REG)) {
  const tree = REG[id] && REG[id].talent_tree;
  if (!tree) continue;
  const seen = {};
  for (let r = 0; r < tree.length; r++) {
    const cells = (tree[r] && tree[r].talents) || [];
    for (let c = 0; c < cells.length; c++) {
      const t = cells[c] && cells[c].talent;
      if (!t) continue;
      if (seen[t]) { repeatSpec = id; repeatTalent = t; positions = [seen[t], r + '-' + c]; break; }
      seen[t] = r + '-' + c;
    }
    if (repeatSpec) break;
  }
  if (repeatSpec) break;
}
check('found a shipped spec whose tree repeats a talent (the rank-collapse population)',
      !!repeatSpec, { spec: repeatSpec, talent: repeatTalent, positions });

// ── 1. THE FIX: owned positions project to id-refs with ranks collapsed ──────────────────────
const owned = [{ id: repeatSpec, owned: positions }];
const list = CR.talentsFromOwnedPositions(owned, REG);
const entry = list.find(e => e.id === repeatTalent);
check('two owned positions of the SAME talent collapse to one entry at rank 2',
      !!entry && entry.rank === 2 && list.filter(e => e.id === repeatTalent).length === 1,
      { list, repeatTalent });
check('every entry is an id-ref {id, rank} — never a display string (charter §8)',
      list.every(e => e && typeof e.id === 'string' && Number.isInteger(e.rank) && !('name' in e)),
      list.slice(0, 3));

// ── 2. THE AGREEMENT: both producers, same ownership, identical output ───────────────────────
// Creation's input is its positional creator-state map; rebuild it from the same owned positions.
const creatorState = {};
positions.forEach((pos, i) => {
  const rc = pos.split('-');
  const cell = REG[repeatSpec].talent_tree[+rc[0]].talents[+rc[1]];
  creatorState[repeatSpec + '_r' + rc[0] + 'c' + rc[1]] = { talentKey: cell.talent, specKey: repeatSpec, row: +rc[0], col: +rc[1], cost: 0 };
});
const fromCreation = CR.talentsFromCreatorState(creatorState);
check('CREATION and ADVANCEMENT project the SAME ownership to the SAME list (id, rank and order)',
      JSON.stringify(fromCreation) === JSON.stringify(list),
      { creation: fromCreation, advancement: list });

// ── 3. IDEMPOTENCE: re-projecting the whole owned set never double-counts ────────────────────
// The advancement writer recomputes from the WHOLE set on every purchase rather than appending, so
// buying a second talent must not inflate the first.
const twoTalents = [{ id: repeatSpec, owned: positions.concat(['0-0']) }];
const listTwo = CR.talentsFromOwnedPositions(twoTalents, REG);
const stillTwo = listTwo.find(e => e.id === repeatTalent);
check('re-projecting after another purchase leaves the first talent at rank 2 (idempotent)',
      !!stillTwo && stillTwo.rank === 2, { listTwo });

// ── 4. A SAVE NAMING A RETIRED SPEC STILL OPENS ──────────────────────────────────────────────
const unknown = CR.talentsFromOwnedPositions([{ id: 'a_spec_that_never_existed', owned: ['0-0'] }], REG);
check('an unknown specialization contributes nothing rather than throwing', Array.isArray(unknown) && unknown.length === 0, unknown);

// ── 5. THE READERS: the surfaces the player lost ─────────────────────────────────────────────
// Stated as a SOURCE fact rather than mimed: all four read the `talents` list this writer now fills.
const app = fs.readFileSync(path.join(ROOT, 'player/app.jsx'), 'utf8');
// F-100 M5 R-M5B-1/2 (ruling f100-m5-talents-buy-after-deleted-tree): the writer now goes through the ONE function that keeps what
// a tree absent from `data` held — `talentsKeepingAbsentTrees(persisted, before, after, reg)`, which WRAPS
// talentsFromOwnedPositions(after, reg) and is byte-identical to it whenever every tree is present (test/f100_m5_buy_keeps_
// deleted_tree.cjs case 3). KEPT: both claims (the writer emits `talents`; from the WHOLE owned set `specs`). WIDENED: the
// spelling, to that one wrapper; DROPPED: nothing (instrument norm 3).
check('the advancement writer now emits `talents` in its patch (the record the readers use)',
      /talents:\s*CharResolve\.(talentsFromOwnedPositions\(specs,|talentsKeepingAbsentTrees\(sheet\.talents,\s*sheetSpecs,\s*specs,)/.test(app));
check('and it projects from the WHOLE owned set, not the one cell just bought',
      /(talentsFromOwnedPositions\(specs,|talentsKeepingAbsentTrees\(sheet\.talents,\s*sheetSpecs,\s*specs,)\s*\(data && data\.specializations\)/.test(app));

console.log('\npfr1_advancement_talents: ' + ok + '/' + (ok + fail) + ' PASS' + (fail ? '  (' + fail + ' FAILED)' : ''));
process.exit(fail ? 1 : 0);
