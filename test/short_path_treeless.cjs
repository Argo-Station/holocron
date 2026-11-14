#!/usr/bin/env node
/**
 * short_path_treeless.cjs — R-SPP-9 acceptance: a TREELESS talent purchase (Collapse of the
 * Republic's Short Path to Power — a Force Rating rank bought outside any spec tree for a flat 30 XP)
 * reaches the sheet and is paid for. Ruling `short-path-persist-shape` §4.3.
 *
 * THE SHAPE (R-SPP-9): sheet.treelessTalents = [{ id, xp, source }], one entry PER RANK, absent-
 * tolerant. Force rating derives from the `force_rating` talent for the ORDINARY reason (no
 * override); the ledger counts its `xp`; `source` is provenance, read by no resolver.
 *
 * Run: node test/short_path_treeless.cjs
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
let failures = 0;
function check(label, cond, detail) {
  if (cond) console.log('  PASS  ' + label);
  else { failures += 1; console.error('  FAIL  ' + label + (detail !== undefined ? '  — ' + JSON.stringify(detail).slice(0, 400) : '')); }
}

const SRC = fs.readFileSync(path.join(root, 'lib/shared/charResolve.js'), 'utf8');
function loadCR(mut) {
  let src = SRC;
  if (mut === 'forward_name') {
    // Revert the forward emitter to select on the FEATURE NAME (the pre-C-SPP-1 defect) — so a
    // treeless entry lacking the `short_path` label is silently dropped on re-save.
    const before = "if (t && t.specKey === '__treeless__' && t.talentKey) acc.push({ id: t.talentKey, xp: t.cost || 0, source: t.source || 'treeless' });";
    const after = "if (t && t.source === 'short_path' && t.talentKey) acc.push({ id: t.talentKey, xp: t.cost || 0, source: t.source });";
    if (src.indexOf(before) === -1) throw new Error('forward_name anchor not found');
    src = src.replace(before, after);
  }
  const ctx = { window: {}, module: { exports: {} }, console: { log() {}, error() {}, warn() {} } };
  ctx.self = ctx.window; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx.window.CharResolve || ctx.module.exports;
}

const J = (f) => JSON.parse(fs.readFileSync(path.join(root, 'public/data/canonical/' + f), 'utf8'));
const charbuild = {
  species: J('species.json').species,
  careers: J('careers.json').careers,
  specializations: J('specializations.json').specializations,
  talents: J('talents.json').talents,
  forcePowers: J('force_powers.json').force_powers,
  skillSheetKeys: (J('skills.vocab.json').entries || []).reduce((m, e) => {
    m[e.id] = (e.aliases || []).find((a) => /^[A-Z]+$/.test(a)) || e.id; return m;
  }, {}),
};

// A Short-Path Jedi Knight, as a CREATOR STATE. The FR rank is the synthetic treeless entry (what the take-action writes) —
// the whole point is that Knight (FR 2) was reached with no tree talent.
function jediState(entry) {
  const ch = {
    id: null, identity: { name: 'Short Path Jedi', playerName: '' }, gameLine: 'collapse', narrative: { backstory: '' }, appearance: {},
    species: { key: 'human', name: 'Human' }, career: { key: 'jedi', name: 'Jedi' }, specializations: [{ key: 'knight', name: 'Knight', isStarting: true }],
    characteristics: { brawn: 2, agility: 2, intellect: 2, cunning: 2, willpower: 3, presence: 3 },
    skills: {}, talents: {}, forcePowers: {}, mechanic: null, gearLedger: { startingCredits: 500, credits: 500, inventory: [] },
    motivations: { strength: null, flaw: null, desire: null, fear: null }, notes: { personal: '', gm: '' },
  };
  if (entry) ch.talents.__treeless___r0c0 = Object.assign({ talentKey: 'force_rating', specKey: '__treeless__', row: 0, col: 0 }, entry);
  return ch;
}

function assemble(CR, ch) {
  return CR.normalizeCreated(ch, charbuild.species.human, charbuild.specializations.knight, { charbuild: charbuild }, 'FullCreator',
    { registries: {}, activeMods: [], portraitFor: () => null });
}
function frInList(sheetTalents) {
  return (Array.isArray(sheetTalents) ? sheetTalents : []).find((t) => t && t.id === 'force_rating') || null;
}

const CR = loadCR(false);

console.log('\n── R-SPP-9: the forward writer emits treelessTalents from a source-marked entry ──');
(function () {
  const sheet = assemble(CR, jediState({ cost: 30, source: 'short_path' }));
  check('forward: sheet.treelessTalents is exactly [{force_rating, 30, short_path}]',
    JSON.stringify(sheet.treelessTalents) === JSON.stringify([{ id: 'force_rating', xp: 30, source: 'short_path' }]),
    sheet.treelessTalents);
  check('forward: no `rank` field on the entry (rank is the count, R-SPP-9)',
    sheet.treelessTalents && sheet.treelessTalents[0] && !('rank' in sheet.treelessTalents[0]), sheet.treelessTalents);
  check('forward: the force_rating talent also lands in sheet.talents (FR derives the ordinary way)',
    !!frInList(sheet.talents) && frInList(sheet.talents).rank === 1, sheet.talents);
  check('forward: the ledger counts its 30 XP',
    sheet.xp.spent === assemble(CR, jediState(null)).xp.spent + 30, sheet.xp);
})();

console.log('\n── R-SPP-9: ABSENT-TOLERANCE — a character with no treeless entry writes none ──');
(function () {
  const once = assemble(CR, jediState(null));
  check('absent: no treelessTalents key is invented on a plain character', !('treelessTalents' in once), once.treelessTalents);
  check('absent: the plain character carries NO force_rating talent (non-vacuous — the fixture differs)',
    !frInList(once.talents), once.talents);
})();

console.log('\n── C-SPP-1 / R-SPP-12: the save selects on STRUCTURE, so a FOREIGN-WRITTEN entry survives ──');
(function () {
  // A treeless entry that arrives WITHOUT the `short_path` label — exactly what F-45's importer writes — must reach the
  // sheet, not be silently dropped.
  // case B: no `source` at all.
  const bOnce = assemble(CR, jediState({ cost: 30 }));
  check('C-SPP-1: an UNLABELLED treeless entry reaches the sheet (rank kept)',
    !!frInList(bOnce.talents), bOnce.talents);
  check('C-SPP-1: and its 30 XP with it (provenance defaulted to `treeless`)',
    Array.isArray(bOnce.treelessTalents) && bOnce.treelessTalents.length === 1
    && bOnce.treelessTalents[0].xp === 30 && bOnce.treelessTalents[0].id === 'force_rating' && bOnce.treelessTalents[0].source === 'treeless',
    bOnce.treelessTalents);
  // case C: a DIFFERENT provenance (a future grant / another importer) — also structural, also kept.
  const foreign = assemble(CR, jediState({ cost: 30, source: 'some_other_grant' }));
  check('C-SPP-1: a differently-labelled treeless entry survives too, provenance preserved',
    !!frInList(foreign.talents)
    && foreign.treelessTalents && foreign.treelessTalents[0].source === 'some_other_grant',
    foreign.treelessTalents);
  // RED PROOF: with the forward emitter selecting on the FEATURE NAME (pre-C-SPP-1), case B's XP entry is dropped.
  const rOnce = assemble(loadCR('forward_name'), jediState({ cost: 30 }));
  check('C-SPP-1 RED PROOF: the feature-name emitter DROPS the unlabelled entry',
    !rOnce.treelessTalents || !rOnce.treelessTalents.length, rOnce.treelessTalents);
  check('the guard bites: structure-select KEEPS it where name-select LOSES it',
    !!(bOnce.treelessTalents && bOnce.treelessTalents.length) && !(rOnce.treelessTalents && rOnce.treelessTalents.length));
  // And the Short Path's own output is unchanged (the label rides along).
  check('C-SPP-1: the Short Path\'s own labelled entry is unaffected (source short_path preserved)',
    assemble(CR, jediState({ cost: 30, source: 'short_path' })).treelessTalents[0].source === 'short_path');
})();

console.log('');
if (failures) { console.error('FAILURES: ' + failures); process.exit(1); }
console.log('All short-path treeless-talent asserts passed.');
