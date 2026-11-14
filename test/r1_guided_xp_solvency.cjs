#!/usr/bin/env node
/**
 * r1_guided_xp_solvency.cjs — C-R1-1: no Guided character is born overdrawn.
 *
 * WRITTEN FROM THE RULING TEXT (R-MEL-1). Ruling `r1-assembly-core-blockers` C-R1-1: *"the gate proves
 * NO guided species × Force-career combo is born overdrawn by the new deduction — a matrix assert
 * across QB_SPECIES × the six F&D careers.
 *   (Guided exposes 4 of those 6; see the assert. 13 x 4 = 52 reachable combos.) If any combo goes negative, it comes back here as a product
 * question (which pick yields), not a silent clamp and not a silently-negative newborn."*
 *
 * R1 folds Guided's starting Force power in as a PRICED purchase (Q1 option (e)). Before R1 the power
 * skipped the XP register, so this matrix could not go negative — the pricing is what can overdraw a
 * low-starting-XP species.
 *
 * THIS GUARD IS CURRENTLY EXPECTED TO FAIL, and that is the finding, not a defect in the guard: two of
 * the 52 reachable combos are overdrawn. It stays red until the product question in
 * `Docs/briefs/r1-guided-xp-solvency.md` is answered. A silent clamp would make it green and would be
 * the exact thing C-R1-1 forbids.
 *
 * PROVENANCE OF THE ARITHMETIC: the tables are parsed out of player/app.jsx (QB_ROLES / QB_AUTO_BUILD /
 * QB_SPECIES / the editorial power picks) and the costs read from the canonical registries, so this
 * mirrors the app's derivation rather than driving it. That is the R-B55-1 anti-pattern, so the two
 * failing combos were CONFIRMED against the real code in a browser before being reported —
 * Wookiee/Mystic persisted `xp.remaining: -10` and Wookiee/Sentinel `-5`. This matrix is the FINDER;
 * the browser run is the proof.
 *
 * Run: node test/r1_guided_xp_solvency.cjs
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
let failures = 0;
function check(label, cond, detail) {
  if (cond) console.log('  PASS  ' + label);
  else { failures += 1; console.error('  FAIL  ' + label + (detail !== undefined ? '  — ' + JSON.stringify(detail).slice(0, 600) : '')); }
}

const app = fs.readFileSync(path.join(root, 'player/app.jsx'), 'utf8');
const species = JSON.parse(fs.readFileSync(path.join(root, 'public/data/canonical/species.json'), 'utf8')).species;
const powers = JSON.parse(fs.readFileSync(path.join(root, 'public/data/canonical/force_powers.json'), 'utf8')).force_powers;

// The terminator matters: QB_SPECIES is an ARRAY (`];`), the others are objects (`};`). Reading to the
// wrong one ran past the array into QB_SPECIES_DESC and counted every species name twice — caught when
// the matrix reported 96 combos and duplicated every finding.
function block(name, end) {
  const i = app.indexOf('const ' + name);
  if (i === -1) throw new Error('block not found: ' + name);
  const j = app.indexOf('\n' + (end || '};'), i);
  if (j === -1) throw new Error('block terminator not found for ' + name);
  return app.slice(i, j);
}

const QB_SPECIES = block('QB_SPECIES = [', '];').match(/'([^']+)'|"([^"]+)"/g)
  .map((q) => q.slice(1, -1));
const fadRoles = block('QB_ROLES').split('fad:')[1] || '';
const careers = [...fadRoles.matchAll(/career: '([^']+)'/g)].map((m) => m[1]);
const picks = {};
// NOT line-anchored: the table puts several pairs on one line, and anchoring caught only the first of
// each — which left the matrix covering 14 of 52 combos while C-R1-1 still reported PASS. A vacuous
// green, caught only because the sibling count asserts disagreed. The combo-count assert below is
// therefore load-bearing, not decoration.
[...block('QB_FORCE_POWER_PICKS = {', '};').matchAll(/'([^']+)':\s*'([^']+)'/g)].forEach((m) => { picks[m[1]] = m[2]; });
// P1's per-species overrides (ruling `r1-guided-xp-solvency`).
const bySpecies = {};
{
  const blk = block('QB_FORCE_POWER_PICKS_BY_SPECIES', '};');
  [...blk.matchAll(/'([^']+)':\s*\{([^}]*)\}/g)].forEach((m) => {
    bySpecies[m[1]] = {};
    [...m[2].matchAll(/'([^']+)':\s*'([^']+)'/g)].forEach((n) => { bySpecies[m[1]][n[1]] = n[2]; });
  });
}
function pickFor(species, career) {
  return (bySpecies[species] && bySpecies[species][career]) || picks[career];
}
const autoBuild = block('QB_AUTO_BUILD');

check('parsed the Guided species list (13, no duplicates)',
  QB_SPECIES.length === 13 && new Set(QB_SPECIES).size === 13, QB_SPECIES);
// The ruling says "the six F&D careers" — that is the REGISTRY's six. Guided's role step exposes only
// FOUR of them (Guardian / Mystic / Seeker / Sentinel); Consular and Warrior have editorial picks
// defined but no role offering them, so they are unreachable via Guided today. The matrix is therefore
// 13 x 4 = 52 reachable combos, and 52 is what it must cover — asserting 6 would have been asserting
// the ruling's phrasing over the product's behaviour.
check('parsed the F&D careers Guided actually offers (4 of the registry\'s 6)',
  careers.length === 4, careers);
check('every offered career has an editorial power pick', careers.every((c) => picks[c]), careers.filter((c) => !picks[c]));
check('the two unreachable picks are Consular + Warrior (defined, no role exposes them)',
  Object.keys(picks).filter((c) => !careers.includes(c)).sort().join(',') === 'Consular,Warrior',
  Object.keys(picks).filter((c) => !careers.includes(c)));

// F-67 RE-POINT, BY MEASUREMENT. Another LAST-WINS private name map: after the Complete Species
// Guide import, "Nautolan" resolved to CSG's record (90 XP) instead of ours, and the matrix
// reported the GUIDED flow as overdrawn for a combination the flow never offers. Re-pointed at THE
// shared species index (C-CSG-6's incumbentWins) so the matrix scores the records the creator
// actually hands a player. The solvency assert is untouched.
const SP_IDX = require('../lib/shared/charResolve.js').speciesNameIndex(species);
const byName = {};
Object.entries(species).forEach(([id, r]) => {
  const n = (r.name || '').trim();
  if (SP_IDX.byName[n.toLowerCase()] === id) byName[n] = r;
});

function buildFor(career) {
  const re = new RegExp("'" + career + "':\\s*\\{[^}]*charBoosts: (\\[\\[.*?\\]\\])[^}]*talent: \\{ key: '[^']+', specKey: '[^']+', row: (\\d+)", 's');
  const m = re.exec(autoBuild);
  if (!m) return null;
  return { boosts: JSON.parse(m[1].replace(/'/g, '"')), talent: (Number(m[2]) + 1) * 5 };
}
function powerCost(pid) {
  const rec = powers[pid];
  const c = rec && rec.tree && rec.tree[0] && rec.tree[0].cells && rec.tree[0].cells[0];
  return c ? c.cost : null;
}

const overdrawn = [];
let combos = 0;
const resolved = {};
careers.forEach(function (career) {
  const b = buildFor(career);
  if (!b) return;
  QB_SPECIES.forEach(function (name) {
    const rec = byName[name];
    if (!rec) return;
    const pid = pickFor(name, career);
    const pcost = powerCost(pid);
    if (pcost == null) return;
    resolved[name + '/' + career] = pid;
    combos += 1;
    let chars = 0;
    b.boosts.forEach(function (pair) {
      const base = (rec.characteristics || {})[pair[0]] || 2;
      for (let r = base + 1; r <= pair[1]; r += 1) chars += r * 10;
    });
    const left = (rec.starting_xp || 0) - chars - b.talent - pcost;
    if (left < 0) overdrawn.push({ species: name, career: career, pick: pid, pool: rec.starting_xp, chars: chars, talent: b.talent, power: pcost, remaining: left });
  });
});

// Load-bearing: an under-covering matrix would let C-R1-1 pass on a fraction of the space.
check('the matrix covered every reachable combo (13 species x 4 offered careers = 52)',
  combos === 52, combos);

// THE condition. Left red deliberately while the product question is open.
check('C-R1-1: no Guided species x F&D career combo is born with negative XP',
  overdrawn.length === 0, overdrawn);

// C-SOLV-1: green FOR THE RIGHT REASON — the two named combos take farsight …
check('C-SOLV-1: Wookiee/Mystic and Wookiee/Sentinel both resolve to `farsight` (P1)',
  resolved['Wookiee/Mystic'] === 'farsight' && resolved['Wookiee/Sentinel'] === 'farsight',
  { mystic: resolved['Wookiee/Mystic'], sentinel: resolved['Wookiee/Sentinel'] });

// … and NOTHING ELSE moved. A fix that quietly re-picked other combos would also go green on solvency
// alone, so collateral editorial drift is asserted against directly.
const drifted = Object.keys(resolved)
  .filter(function (k) { return k !== 'Wookiee/Mystic' && k !== 'Wookiee/Sentinel'; })
  .filter(function (k) { return resolved[k] !== picks[k.split('/')[1]]; })
  .map(function (k) { return { combo: k, got: resolved[k], base: picks[k.split('/')[1]] }; });
check('C-SOLV-1: every OTHER combo keeps its base editorial pick (no collateral drift)',
  drifted.length === 0, drifted);

if (overdrawn.length) {
  console.error('');
  console.error('  C-R1-1 HAS FIRED — ' + overdrawn.length + ' of ' + combos + ' combos are born overdrawn:');
  overdrawn.forEach(function (o) {
    console.error('    %s / %s: pool %d - chars %d - talent %d - power %d = %d',
      o.species, o.career, o.pool, o.chars, o.talent, o.power, o.remaining);
  });
  console.error('  Per the ruling this is a PRODUCT question (which pick yields), not a clamp.');
  console.error('  See Docs/briefs/r1-guided-xp-solvency.md. Confirmed in a browser against the real');
  console.error('  code before reporting: Wookiee/Mystic persisted xp.remaining -10, Sentinel -5.');
}

console.log('');
if (failures) { console.error('r1_guided_xp_solvency: ' + failures + ' FAILED'); process.exit(1); }
console.log('r1_guided_xp_solvency: ALL PASS');
