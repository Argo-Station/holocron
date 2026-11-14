#!/usr/bin/env node
/* F-100 surfacing — CAREER POWERS ON THE FORCE STEP (ruling f100-surfacing-creator-concept R-SCC-2 as errata'd; ADDENDUM 11
 * OWNS "the write forcePowers[id] = {cost: 0, basic: true, granted, granted_upgrade?} … forcePowerGrantProblems read before
 * save, a TOLD double pick writes granted "both" and NO granted_upgrade (R4, bitten)";
 * DECISIONS D-229 Q2 (a); brief §3.1 and D2). The pick's state and write are player/app.jsx's fcCareerPowerState and
 * fcCareerPowerWrite, SLICED by name and run over the real CharResolve, the real canonical registries and the real
 * reSpecialized fad-v1 pack (mods.applyOverlay). (post1-switch-deletion, ADDENDUM 638: M12's key is gone; P7's key-OFF
 * half went with it, table 3.)
 *
 *   P1  THE GROUPS: Consular starting as Niman Disciple → "From the Consular" [Influence, Move] and "From Niman Disciple"
 *       [Move, Influence] (D2: the STARTING tree's pair only — a second tree adds nothing here); nothing picked → owed.
 *   P2  TWO POWERS: Influence from the career, Move from the tree → {influence: granted "career"}, {move: granted "bonus"},
 *       each cost 0, basic, no granted_upgrade; owed after one pick, answered after both; forcePowersXp 0.
 *   P3  R4 — THE TOLD DOUBLE: Influence in both → ONE entry granted "both", NO granted_upgrade and no upgrades; told true;
 *       the swapped-out Move entry is gone; the section owes nothing.
 *   P4  THE CHOICE DOUBLE (Jedi starting as Padawan, the data's upgrade_if_owned): Enhance in both → the "Enhance · one free
 *       upgrade" group opens (row 1's linked, non-Mastery upgrades) and is owed; its answer → granted "both",
 *       granted_upgrade <key>, upgrades [<key>]; forcePowerGrantProblems clean; forcePowerEntryXp 0 (the upgrade is free).
 *       A Master tree's CHOICE asks for two (min = max = 2).
 *   P5  A POWER BOUGHT AT ITS PRICE, THEN PICKED → the free entry replaces it (cost 0, granted); a swap away removes it;
 *       an entry without `granted` is never touched by a pick.
 *   P6  FAIL-CLOSED: with forcePowerGrantProblems answering a problem, the write returns { problems } and no map; the
 *       creator's handler dispatches only `w.next` (static, its own source).
 *   P7  DARK: without the fad-v1 pack → no state (nothing to ask, nothing written).
 *   P8  THE BAR: both bands hold the commit (`data-cp-held`) in FC_CP_BAR's words while owed (static, the sources).
 *   BITES  `--mutant r4` writes a granted_upgrade on a TOLD double → P3 red; `--mutant check` drops the forcePowerGrantProblems
 *       read from the write → P6 red. Each exits 1; read the exit code bare.
 *
 * Exit 0 = every leg green; 1 = a leg red (or a mutant's run); 2 = an unknown flag.
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const MUT = args[0] === '--mutant' ? args[1] : null;
if (args.length && !(args.length === 2 && args[0] === '--mutant' && (MUT === 'r4' || MUT === 'check'))) {
  console.error('usage: f100_career_powers_pick.cjs [--mutant r4|check]'); process.exit(2);
}

let APP = fs.readFileSync(path.join(ROOT, 'player/app.jsx'), 'utf8');
const plant = (from, to, label) => {
  if (APP.split(from).length !== 2) { console.error('MUTANT NOT PLANTED: ' + label + ' moved'); process.exit(1); }
  APP = APP.replace(from, to); console.log('MUTANT PLANTED: ' + label);
};
if (MUT === 'r4') plant("if (kinds[id] === 'both' && upKey != null && st.upgrade && id === st.upgrade.power) {",
  "if (kinds[id] === 'both') { upKey = upKey || 'influencecontrol';", 'a TOLD double writes a granted_upgrade');
if (MUT === 'check') plant('(CR && CR.forcePowerGrantProblems ? CR.forcePowerGrantProblems(entry) : [])', '[]',
  'the write without forcePowerGrantProblems');

function slice(header) {
  const i = APP.indexOf(header);
  if (i < 0) { console.error('SLICE MISS: ' + header); process.exit(1); }
  let k = APP.indexOf('{', i + header.length), d = 0;
  for (; k < APP.length; k++) { if (APP[k] === '{') d++; else if (APP[k] === '}') { d--; if (!d) { k++; break; } } }
  return APP.slice(i, k);
}
const line = (header) => { const i = APP.indexOf(header); if (i < 0) { console.error('SLICE MISS: ' + header); process.exit(1); } return APP.slice(i, APP.indexOf(';\n', i) + 1); };
const SRC = [
  'function fcCareerPowerUpgradeOptions(rec)', 'function fcCareerPowerGroups(character, charbuild, gameLine)',
  'function fcCareerPowerPicks(groups, forcePowersMap)', 'function fcCareerPowerState(character, charbuild, gameLine)',
  'function fcCareerPowerWrite(st, slug, optId, forcePowersMap, charbuild)',
  'function groupIdSlug(name)', 'function pickedIdFor(group, optionPicks)', 'function pickedIdsOf(group, optionPicks)',
  'function boundsOf(group)', 'function fcSpeciesGroupOwed(g, picks)', 'function buildBasicForcePowerList(allPowers, gameLine)',
  'function fcPowerBookOf(rec)', 'function cleanMarkup(text)', 'function plainTextGlyphless(text)',
].map(slice).join('\n') + '\n' + ['var FC_CP_BAR = '].map(line).join('\n');

const CR = require(path.join(ROOT, 'lib/shared/charResolve.js'));
const M = require(path.join(ROOT, 'lib/shared/mods.js'));
const sandbox = { console, JSON, Math, Object, Array, String, Number, RegExp, CharResolve: CR, fcFilterActive: (l) => l };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(SRC, sandbox);
const S = sandbox;

const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', f), 'utf8'));
const P = (f) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/mods/respecialized/fad-v1', f), 'utf8')); } catch (e) { return null; } };
const BASE = { careers: J('careers.json').careers, specializations: J('specializations.json').specializations,
  talents: J('talents.json').talents, forcePowers: J('force_powers.json').force_powers };
const pack = { specializations: P('specializations.overlay.json').specializations, talents: P('talents.overlay.json').talents,
  careers: (P('careers.overlay.json') || {}).careers || null };
if ((P('force_powers.overlay.json') || {}).force_powers) pack.force_powers = P('force_powers.overlay.json').force_powers;
const CB = M.applyOverlay(BASE, pack);

let failures = 0;
const check = (ok, label) => { console.log((ok ? '  PASS  ' : '  FAIL  ') + label); if (!ok) failures++; };
const J1 = JSON.stringify;
const ch = (career, spec, forcePowers, extra) => ({ career: { key: career, name: CB.careers[career].name },
  specializations: [{ key: spec, name: CB.specializations[spec].name, isStarting: true }].concat(extra || []), forcePowers: forcePowers || {} });
const st = (c, cb) => S.fcCareerPowerState(c, cb || CB, 'fad');
const slugOf = (g) => S.groupIdSlug(g.name);
// one press, as the creator's handler makes it: the state off the save, the write, the dispatch of w.next
function press(c, gi, id, cb) {
  const s = st(c, cb), g = gi === 'up' ? s.upgrade : s.groups[gi];
  const w = S.fcCareerPowerWrite(s, slugOf(g), id, c.forcePowers, cb || CB);
  return { w, c: w.next ? Object.assign({}, c, { forcePowers: w.next }) : c };
}

// ── P1 · the groups ──────────────────────────────────────────────────────────────────────────────────────────────────
{
  const s = st(ch('consular', 'niman_disciple'));
  const shape = s && s.groups.map((g) => g.name + ' [' + g.options.map((o) => o.id).join(', ') + ']');
  check(s && J1(shape) === J1(['From the Consular [influence, move]', 'From Niman Disciple [move, influence]']) && s.owed,
    'P1 Consular / Niman Disciple: ' + J1(shape) + ', owed ' + (s && s.owed));
  const two = st(ch('consular', 'niman_disciple', {}, [{ key: 'healer', name: 'Healer' }]));
  check(two && two.groups.length === 2 && two.groups[1].name === 'From Niman Disciple',
    'P1 D2: a second tree (Healer) adds no group — the STARTING tree’s pair only (' + (two && two.groups.length) + ' groups)');
}
// ── P2 · two powers ──────────────────────────────────────────────────────────────────────────────────────────────────
{
  const a = press(ch('consular', 'niman_disciple'), 0, 'influence');
  const mid = st(a.c);
  const b = press(a.c, 1, 'move');
  const m = b.c.forcePowers, after = st(b.c);
  check(a.w.next && mid.owed && m.influence && m.influence.granted === 'career' && m.move && m.move.granted === 'bonus'
    && m.influence.cost === 0 && m.move.cost === 0 && m.influence.basic && m.move.basic
    && m.influence.granted_upgrade == null && m.move.granted_upgrade == null && !after.owed,
    'P2 Influence (career) + Move (bonus): ' + J1(Object.keys(m).map((k) => k + ':' + m[k].granted)) + ', owed after one ' + mid.owed + ', after both ' + after.owed);
  check(CR.forcePowersXp(m, CB) === 0 && Object.keys(m).every((k) => !CR.forcePowerGrantProblems(m[k]).length),
    'P2 the two free picks cost ' + CR.forcePowersXp(m, CB) + ' XP and pass forcePowerGrantProblems');
}
// ── P3 · R4, the TOLD double ─────────────────────────────────────────────────────────────────────────────────────────
{
  const a = press(ch('consular', 'niman_disciple'), 0, 'influence');
  const b = press(a.c, 1, 'move');
  const c = press(b.c, 1, 'influence');
  const m = c.c.forcePowers, s = st(c.c);
  check(c.w.next && J1(Object.keys(m)) === J1(['influence']) && m.influence.granted === 'both' && !('granted_upgrade' in m.influence)
    && !('upgrades' in m.influence) && s.told && !s.upgrade && !s.owed,
    'P3 R4 Influence twice: ' + J1(m) + ' — told ' + s.told + ', owed ' + s.owed);
}
// ── P4 · the CHOICE double ───────────────────────────────────────────────────────────────────────────────────────────
{
  const a = press(ch('jedi', 'padawan'), 0, 'enhance');
  const b = press(a.c, 1, 'enhance');
  const s = st(b.c);
  const opts = s.upgrade ? s.upgrade.options : [];
  check(s.upgrade && s.upgrade.name === 'Enhance · one free upgrade' && opts.length >= 2 && opts.every((o) => !/mastery/i.test(o.name)) && s.owed && !s.told,
    'P4 Enhance twice on Padawan’s CHOICE: the upgrade group opens with ' + J1(opts.map((o) => o.name)) + ', owed ' + s.owed);
  const k = opts[0] && opts[0].id;
  const c = press(b.c, 'up', k);
  const e = c.c.forcePowers.enhance, s2 = st(c.c);
  check(c.w.next && e.granted === 'both' && e.granted_upgrade === k && J1(e.upgrades) === J1([k]) && !CR.forcePowerGrantProblems(e).length
    && CR.forcePowerEntryXp('enhance', e, CB) === 0 && !s2.owed,
    'P4 the upgrade answered: ' + J1(e) + ' — XP ' + CR.forcePowerEntryXp('enhance', e, CB) + ', owed ' + s2.owed);
  const ms = st(ch('jedi', 'master'));
  const mg = ms && ms.groups.filter((g) => g.list === 'bonus')[0];
  check(mg && mg.choice && S.boundsOf(mg).min === 2 && S.boundsOf(mg).max === 2,
    'P4 Master’s CHOICE asks for two: ' + (mg && J1(S.boundsOf(mg))));
}
// ── P5 · a bought power, then picked ─────────────────────────────────────────────────────────────────────────────────
{
  const bought = { move: { name: 'Move', desc: 'x', cost: 10, basic: true }, bind: { name: 'Bind', desc: 'y', cost: 5, basic: true } };
  const a = press(ch('consular', 'niman_disciple', bought), 0, 'move');
  const m1 = a.c.forcePowers;
  const b = press(a.c, 0, 'influence');
  const m2 = b.c.forcePowers;
  check(m1.move.granted === 'career' && m1.move.cost === 0 && J1(m1.bind) === J1(bought.bind) && !m2.move && J1(m2.bind) === J1(bought.bind) && m2.influence.granted === 'career',
    'P5 Move bought (10 XP) then picked → ' + J1(m1.move.granted) + ' cost ' + m1.move.cost + '; swapped to Influence → Move gone ' + !m2.move + '; Bind untouched');
}
// ── P6 · fail-closed ─────────────────────────────────────────────────────────────────────────────────────────────────
{
  const real = CR.forcePowerGrantProblems;
  CR.forcePowerGrantProblems = () => ['planted refusal'];
  let w;
  try { const c0 = ch('consular', 'niman_disciple'); const s = st(c0); w = S.fcCareerPowerWrite(s, slugOf(s.groups[0]), 'influence', {}, CB); }
  finally { CR.forcePowerGrantProblems = real; }
  check(w && !w.next && Array.isArray(w.problems) && w.problems.length === 1 && /planted refusal/.test(w.problems[0]),
    'P6 a refused entry writes nothing: ' + J1(w));
  const h = APP.slice(APP.indexOf('var handleCareerPowerPick = useCallback('), APP.indexOf('var handleForcePowerRefund = useCallback('));
  check(/fcCareerPowerWrite\(/.test(h) && /if \(!w\.next\) \{[^}]*return; \}/.test(h) && /value: w\.next/.test(h),
    'P6 the creator’s handler dispatches only w.next (its own source)');
}
// ── P7 · dark ────────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const noPack = st(ch('consular', 'niman_disciple'), BASE);
  check(noPack === null, 'P7 without fad-v1 → ' + J1(noPack) + ' (nothing asked, nothing written)');
}
// ── P8 · the bar ─────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const wide = slice('function FCForceSheet(p)'), phone = slice('function FCForceSheetPhone(p)');
  check(/p\.careerPowers && p\.careerPowers\.owed[\s\S]{0,200}data-cp-held="1" disabled aria-disabled="true">\{FC_CP_BAR\}/.test(wide)
    && /cpHeld \? FC_CP_BAR/.test(phone) && /disabled=\{overspent \|\| cpHeld\}/.test(phone)
    && /var FC_CP_BAR = 'Pick your Career Powers to continue';/.test(APP),
    'P8 both bands hold the commit in "Pick your Career Powers to continue" while owed');
}

console.log(failures ? `FAILED: ${failures} leg(s) red (exit 1)` : 'OK: every leg green (exit 0)');
process.exit(failures ? 1 : 0);
