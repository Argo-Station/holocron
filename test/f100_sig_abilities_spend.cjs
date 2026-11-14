#!/usr/bin/env node
/* F-100 — THE ONE SIGNATURE SPEND SUMMER (ruling f100-surfacing-creator-concept ADDENDUM 18, C1 (a); brief
 * f100-surfacing-creator-build §1). D-229 Q1 (a) charges a signature ability's XP when it is bought on the sheet; the save
 * (normalizeCreated) and the creator's live bar re-sum every purchase, so the signature term must be in both or the save
 * silently refunds it. ONE summer, CharResolve.sigAbilitiesSpend, behind M12's key; its domain is EVERY OWNED
 * CELL (the V-checks gate buying, never the spend).
 *
 *   G1  STATIC: normalizeCreated's xpRemaining and xp.spent each carry `xpSpentOnSignature`, read from
 *       sigAbilitiesSpend(character, …); the creator's xpRemaining subtracts `xpSpentOnSignature`, a memo over
 *       CharResolve.sigAbilitiesSpend(.
 *   G2  THE SAVE CHARGES IT: a creator state owning Counterespionage's four cells saves with spent + 65 and
 *       remaining − 65 against the same state without it, and the entry rides the save whole.
 *   G3  THE PANEL IS THE SPEND: Σ sigAbilitiesXp(…).xp === sigAbilitiesSpend on every fixture of this file.
 *   G4  A V-CHECK FAILING AFTER THE BUY KEEPS ITS SPEND (synthetic): a standing Counterespionage (Spy, Courier, four
 *       cells, 65 XP) re-read with the career changed (V1) and with the attach columns unowned (V3): the entry fails,
 *       its price and the summer stay 65; a position with no box (V7) adds nothing.
 *   (post1-switch-deletion, ADDENDUM 638: M12's key is gone; G5 (the key OFF, R-SRF-5) went with it, table 3.)
 *   BITE  `--mutant` drops the term from normalizeCreated's xp.spent in memory (the pre-C1 shape) and runs G2 against it —
 *       it must go red (exit 1). Read the exit code bare.
 *
 * Exit 0 = every leg green; 1 = a leg red (or the mutant's run); 2 = an unknown flag.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
if (args.some((a) => a !== '--mutant')) { console.error('usage: f100_sig_abilities_spend.cjs [--mutant]'); process.exit(2); }
const MUTANT = args.includes('--mutant');

const CR_PATH = path.join(ROOT, 'lib/shared/charResolve.js');
const CR_SRC = fs.readFileSync(CR_PATH, 'utf8');
let src = CR_SRC;
const SPENT = 'spent: xpSpentOnChars + xpSpentOnTalents + xpSpentOnForcePowers + xpSpentOnSkills + xpSpentOnBuyouts + xpSpentOnSignature';   // + B-1038's xpSpentOnSpecs after it (ruling release-r7-bug-burndown ADDENDUM 21)
if (MUTANT) {
  if (src.split(SPENT).length !== 2) { console.error('MUTANT NOT PLANTED: the spent line moved'); process.exit(1); }
  src = src.replace(SPENT, 'spent: xpSpentOnChars + xpSpentOnTalents + xpSpentOnForcePowers + xpSpentOnSkills + xpSpentOnBuyouts');
  console.log('MUTANT PLANTED: normalizeCreated\'s xp.spent without the signature term');
}
const m = new Module(CR_PATH, module);
m.filename = CR_PATH;
m.paths = Module._nodeModulePaths(path.dirname(CR_PATH));
m._compile(src, CR_PATH);
const CR = m.exports;

let failures = 0;
const check = (ok, label) => { console.log((ok ? '  PASS  ' : '  FAIL  ') + label); if (!ok) failures++; };
const clone = (x) => JSON.parse(JSON.stringify(x));
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', f), 'utf8'));
const SIG = J('signature_abilities.json').signature_abilities;
const CB = {
  species: J('species.json').species, careers: J('careers.json').careers, specializations: J('specializations.json').specializations,
  talents: J('talents.json').talents, forcePowers: J('force_powers.json').force_powers, signatureAbilities: SIG,
  skillSheetKeys: (J('skills.vocab.json').entries || []).reduce((o, e) => { o[e.id] = (e.aliases || []).find((a) => /^[A-Z]+$/.test(a)) || e.id; return o; }, {}),
};
const DEPS = { registries: {}, activeMods: [], portraitFor: () => null };
const OWNED_CE = ['0-0', '1-0', '1-2', '2-2'];
const ENTRY_CE = { id: 'counterespionage', tree: 'courier', owned: OWNED_CE };
const save = (entries) => CR.normalizeCreated(Object.assign({
  identity: { name: 'Sig', playerName: '' }, narrative: { backstory: '' }, appearance: {}, gameLine: 'eote',
  species: { key: 'human', name: 'Human' }, career: { key: 'spy', name: CB.careers.spy.name },
  specializations: [{ key: 'courier', name: CB.specializations.courier.name, isStarting: true }],
  characteristics: { brawn: 2, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
  skills: {}, talents: {}, forcePowers: {}, mechanic: null, gearLedger: { startingCredits: 500, credits: 500, inventory: [] },
  motivations: { strength: null, flaw: null, desire: null, fear: null }, notes: { personal: '', gm: '' },
}, entries ? { signatureAbilities: clone(entries) } : {}), CB.species.human, CB.specializations.courier, { charbuild: CB }, 'FullCreator', DEPS);
const panel = (sh) => CR.sigAbilitiesXp(sh, CB).reduce((t, x) => t + x.xp, 0);
const cellCost = (id, pos) => { const [r, c] = pos.split('-').map(Number); const cell = (SIG[id].tree[r].cells || []).find((x) => x && (x.col || 0) === c); return cell ? cell.cost : 0; };

// ── G1 · STATIC ──────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const ncAt = CR_SRC.indexOf('function normalizeCreated('), nc = CR_SRC.slice(ncAt, CR_SRC.indexOf('\nfunction ', ncAt + 1));
  const app = fs.readFileSync(path.join(ROOT, 'player/app.jsx'), 'utf8');
  const ctrlAt = app.indexOf('function useFullCreatorController('), ctrl = app.slice(ctrlAt, app.indexOf('\nfunction ', ctrlAt + 1));
  check(nc.includes('var xpSpentOnSignature = sigAbilitiesSpend(character, gameData && gameData.charbuild);')
    && /var xpRemaining = [^;]*- xpSpentOnSignature\b[^;]*;/.test(nc) && nc.includes(SPENT),
    'G1 normalizeCreated: xpSpentOnSignature = sigAbilitiesSpend(character, …), in xpRemaining and in xp.spent');
  check(/var xpSpentOnSignature = useMemo\(function\(\) \{\s*return CharResolve\.sigAbilitiesSpend\(/.test(ctrl)
    && /var xpRemaining = [^;]*- xpSpentOnSignature\b[^;]*;/.test(ctrl),
    'G1 the creator: xpSpentOnSignature is a memo over CharResolve.sigAbilitiesSpend, subtracted from xpRemaining');
}

// ── G2 · the save charges it ─────────────────────────────────────────────────────────────────────────────────
{
  const plain = save(null), bought = save([ENTRY_CE]);
  const cost = OWNED_CE.reduce((t, p) => t + cellCost('counterespionage', p), 0);
  check(cost === 65 && bought.xp.spent === plain.xp.spent + cost && bought.xp.remaining === plain.xp.remaining - cost,
    `G2 Counterespionage ${JSON.stringify(OWNED_CE)} for ${cost}: spent ${plain.xp.spent} → ${bought.xp.spent}; remaining ${plain.xp.remaining} → ${bought.xp.remaining}`);
  check(JSON.stringify(bought.signatureAbilities) === JSON.stringify([ENTRY_CE]), 'G2 the entry rides the save whole');
}

// ── G3 / G4 · the panel is the spend; a V-check failing after the buy keeps its spend (synthetic) ───────────────────
{
  const sheet = (career, spec, cols, entries) => {
    const bottom = CB.specializations[spec].talent_tree.length - 1;
    return { careerId: career, career: CB.careers[career].name, specializations: [{ id: spec, owned: cols.map((c) => bottom + '-' + (c - 1)) }],
      talents: [], skills: {}, characteristics: { brawn: 2, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 2 }, signatureAbilities: entries };
  };
  const OWNED = OWNED_CE, want = OWNED.reduce((t, p) => t + cellCost('counterespionage', p), 0);
  const standing = sheet('spy', 'courier', [2, 3], [{ id: 'counterespionage', tree: 'courier', owned: OWNED }]);
  const v1 = Object.assign(clone(standing), { careerId: 'smuggler', career: 'Smuggler' });
  const v3 = sheet('spy', 'courier', [2], [{ id: 'counterespionage', tree: 'courier', owned: OWNED }]);
  const v7 = sheet('spy', 'courier', [2, 3], [{ id: 'counterespionage', tree: 'courier', owned: OWNED.concat(['3-0']) }]);
  const ok = (sh) => CR.sigAbilityChecks(sh, CB)[0].ok;
  const codes = (sh) => CR.sigAbilityChecks(sh, CB)[0].problems.map((p) => p.check).join(',');
  check(want === 65 && ok(standing) && CR.sigAbilitiesSpend(standing, CB) === 65 && panel(standing) === 65,
    `G3 standing Counterespionage ${JSON.stringify(OWNED)}: the panel ${panel(standing)} = the summer ${CR.sigAbilitiesSpend(standing, CB)} = 65`);
  [['V1 (the career changed)', v1, 'V1'], ['V3 (column 3 unowned)', v3, 'V3']].forEach(([label, sh, v]) => {
    const x = CR.sigAbilitiesXp(sh, CB)[0];
    check(!ok(sh) && codes(sh).includes(v) && x.xp === 65 && x.ok === false && CR.sigAbilitiesSpend(sh, CB) === 65,
      `G4 SYNTHETIC: failing ${label} after the buy [${codes(sh)}] keeps its spend — panel ${x.xp}, summer ${CR.sigAbilitiesSpend(sh, CB)} (65)`);
  });
  check(CR.sigAbilitiesSpend(v7, CB) === 65 && panel(v7) === 65,
    `G4 a position with no box (V7, '3-0') is priced 0: summer ${CR.sigAbilitiesSpend(v7, CB)} (65)`);
  check(CR.sigAbilitiesSpend(Object.assign(clone(standing), { signatureAbilities: [] }), CB) === 0 && CR.sigAbilitiesSpend({}, CB) === 0,
    'G3 no entries → 0 (absent member, empty list)');
}

console.log(failures ? `\nf100_sig_abilities_spend${MUTANT ? ' --mutant' : ''}: ${failures} FAILED` : `\nf100_sig_abilities_spend${MUTANT ? ' --mutant' : ''}: all legs pass`);
process.exit(failures ? 1 : 0);
