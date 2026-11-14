/*
 * f100_m8_picks.cjs — F-100 M8 C6's picks (ruling `f100-m8-contracts` R-M8K-6, R-M8K-23; `f100-m8-build-card` §4
 * item 4 at step 1; step 2 adds item 9's legs here).
 *
 * STEP 1 LEGS:
 *   (i)   THE ONE READER: CharResolve.pickOf reads `talentChoices` before the legacy maps (per rank, per talent, treeless);
 *   (ii)  THE LEGACY MAPS KEEP THEIR MEANINGS (R-M8K-6 (c)): only the career grant ('career_skills') and M7's swap
 *         ('characteristic') fall back to them; any other pick id reads talentChoices only; a pick written to talentChoices
 *         under another id is never read as a career grant, and the derives read through pickOf;
 *   (iii) THE HAND-OVER (B-1064): a creator state's Renegade Form pick reaches the sheet through normalizeCreated, a copy, and
 *         so does `talentChoices`; no map stays no map; the skill rolls the pick through both readers, CharResolve.skillCharacteristic
 *         and the sheet's own SWRPGSheetPool.sheetSkillCharacteristic, and its base without the pick;
 *   (vii) THE `_` REFUSAL (R-M8K-23): packValidate refuses a `_`-prefixed specialization id at authoring and keeps it
 *         unapplied at load; the validator's L1cb.spid is the registry half (run by validate_registries).
 * ITS BITES (scripts/canonical/f100_m8_bites.cjs): pickOf reading the legacy map first; the career fallback widened to
 * every pick id; the hand-over leg dropped; packValidate's refusal removed.
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const CR = require('../lib/shared/charResolve.js');
const PV = require('../lib/shared/packValidate.js');
let fails = 0, passes = 0;
const check = (label, ok, detail) => { if (ok) { passes++; console.log('  PASS  ' + label); } else { fails++; console.log('  FAIL  ' + label + (detail !== undefined ? '\n        ' + JSON.stringify(detail) : '')); } };
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', f), 'utf8'));
const vocab = J('skills.vocab.json').entries;
const cb = { species: J('species.json').species, careers: J('careers.json').careers, specializations: J('specializations.json').specializations,
  talents: J('talents.json').talents, forcePowers: J('force_powers.json').force_powers, skillSheetKeys: {}, skillChars: {}, skillNames: {} };
vocab.forEach((e) => { cb.skillSheetKeys[e.id] = (e.aliases || []).find((a) => /^[A-Z]+$/.test(a)) || e.id; cb.skillNames[e.id] = e.label; if (e.characteristic) cb.skillChars[e.id] = e.characteristic; });

console.log('F-100 M8 · PICKS (C6) — step 1');

// ── (i) the one reader, talentChoices first ──────────────────────────────────────────────────────────────────────────
{
  const sheet = {
    talentChoices: { spec_a: { '1-2': { characteristic: 'cunning', da_skill: 'ranged_light' } }, _talent: { knowledge_specialization: { ks_skill: 'lore' } } },
    talentCharacteristicChoices: { spec_a: { '1-2': 'agility', '0-0': 'presence' } },
    talentSkillChoices: { spec_a: { '0-1': ['charm', 'cool'] } },
    treelessTalents: [{ id: 'renegade_form', characteristicChoice: 'brawn' }, { id: 'renegade_form', choices: { characteristic: 'willpower' }, characteristicChoice: 'brawn' }],
  };
  check('(i) per rank: talentChoices wins over talentCharacteristicChoices at the same cell', CR.pickOf(sheet, 'spec_a', '1-2', 'characteristic') === 'cunning');
  check('(i) per rank: no talentChoices entry → M7\'s map', CR.pickOf(sheet, 'spec_a', '0-0', 'characteristic') === 'presence');
  check('(i) per talent: talentChoices._talent[<talentId>]', CR.pickOf(sheet, '_talent', 'knowledge_specialization', 'ks_skill') === 'lore');
  check('(i) treeless: the entry\'s `choices` first, then its legacy field',
    CR.pickOf(sheet, null, sheet.treelessTalents[1], 'characteristic') === 'willpower' && CR.pickOf(sheet, null, sheet.treelessTalents[0], 'characteristic') === 'brawn');
  check('(i) nothing recorded → undefined (fail closed)', CR.pickOf(sheet, 'spec_a', '3-3', 'characteristic') === undefined && CR.pickOf({}, 'x', '0-0', 'da_skill') === undefined);
}

// ── (ii) the legacy maps keep their meanings ─────────────────────────────────────────────────────────────────────────
{
  const sheet = { talentSkillChoices: { spec_a: { '0-1': ['charm'] } }, talentCharacteristicChoices: { spec_a: { '0-1': 'agility' } },
    talentChoices: { spec_a: { '2-2': { da_skill: 'gunnery' } } } };
  check('(ii) the career grant falls back to talentSkillChoices', JSON.stringify(CR.pickOf(sheet, 'spec_a', '0-1', 'career_skills')) === '["charm"]');
  check('(ii) an M8 pick id (Deadly Accuracy\'s) NEVER reads a legacy map', CR.pickOf(sheet, 'spec_a', '0-1', 'da_skill') === undefined);
  check('(ii) an M8 pick in talentChoices is NOT a career grant', CR.pickOf(sheet, 'spec_a', '2-2', 'career_skills') === undefined);
  check('(ii) the `_talent` key never falls back to a legacy map', CR.pickOf({ talentSkillChoices: { _talent: { x: ['charm'] } } }, '_talent', 'x', 'career_skills') === undefined);
  // the derives read through pickOf: a Well Rounded grant in the legacy map is career; a skill pick in talentChoices is not
  const wr = Object.values(cb.specializations).find((s) => (s.talent_tree || []).some((r) => (r.talents || []).some((c) => c && c.talent === 'well_rounded')));
  let pos = null; (wr.talent_tree || []).forEach((r, ri) => (r.talents || []).forEach((c, ci) => { if (!pos && c && c.talent === 'well_rounded') pos = ri + '-' + ci; }));
  const base = { careerId: wr.careers ? wr.careers[0] : 'smuggler', specializations: [{ id: wr.id, owned: [pos] }], characteristics: {}, skills: {} };
  const legacy = Object.assign({}, base, { talentSkillChoices: { [wr.id]: { [pos]: ['astrogation', 'cool'] } } });
  const m8only = Object.assign({}, base, { talentChoices: { [wr.id]: { [pos]: { da_skill: 'astrogation' } } } });
  const st1 = CR.careerSkillStatus(legacy, cb), st2 = CR.careerSkillStatus(m8only, cb);
  const talentCareer = (st) => Object.keys(st).filter((k) => (st[k].because || []).indexOf('talent:well_rounded') !== -1);
  check('(ii) careerSkillStatus (through pickOf): Well Rounded\'s legacy picks are career skills', talentCareer(st1).length === 2, talentCareer(st1));
  check('(ii) …and an M8 pick under another id on the same cell grants nothing', talentCareer(st2).length === 0, talentCareer(st2));
}

// ── (iii) the hand-over: a creator state's Renegade Form pick reaches the sheet, and the roll ────────────────────────
{
  const sp = cb.specializations.force_sensitive_outcast, cells = {};
  (sp.talent_tree || []).forEach((row, r) => (row.talents || []).forEach((c, ci) => { if (c && !cells[c.talent]) cells[c.talent] = r + '-' + ci; }));
  const [r, c] = cells.renegade_form.split('-').map(Number);
  const state = (extra) => Object.assign({ identity: { name: 'Hand Over', playerName: '' }, gameLine: 'eote', narrative: { backstory: '' }, appearance: {},
    species: { key: 'human', name: 'Human' }, career: { key: 'bounty_hunter', name: 'Bounty Hunter' }, specializations: [{ key: sp.id, name: sp.name, isStarting: true }],
    characteristics: { brawn: 2, agility: 3, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
    skills: { LTSAB: { freeCareer: false, freeSpec: false, freeSpecies: 0, purchased: 0, bought: [10] } },
    talents: { [sp.id + '_r' + r + 'c' + c]: { talentKey: 'renegade_form', specKey: sp.id, row: r, col: c, cost: sp.talent_tree[r].cost } },
    forcePowers: {}, mechanic: null, gearLedger: { startingCredits: 500, credits: 500, inventory: [] },
    motivations: { strength: null, flaw: null, desire: null, fear: null }, notes: { personal: '', gm: '' } }, extra || {});
  const gameData = { narrativeMechanics: { morPairs: { strengths: [], weaknesses: [] }, config: {} }, charbuild: cb };
  const toSheet = (ch) => CR.normalizeCreated(ch, cb.species.human, null, gameData, 'creator', { registries: { weapons: {}, armor: {}, gear: {} }, activeMods: [] });
  const tcc = { [sp.id]: { [cells.renegade_form]: 'agility' } };
  const tc = { [sp.id]: { [cells.renegade_form]: { note_pick: 'x' } }, _talent: { renegade_form: { note_pick: 'y' } } };
  const ch = state({ talentCharacteristicChoices: JSON.parse(JSON.stringify(tcc)), talentChoices: JSON.parse(JSON.stringify(tc)) });
  let back = null, err = null;
  try { back = toSheet(ch); } catch (e) { err = e.message; }
  check('(iii) creator → sheet: normalizeCreated keeps talentCharacteristicChoices', !err && back && JSON.stringify(back.talentCharacteristicChoices) === JSON.stringify(tcc), err || (back && back.talentCharacteristicChoices));
  check('(iii) creator → sheet: normalizeCreated keeps talentChoices', !err && back && JSON.stringify(back.talentChoices) === JSON.stringify(tc), err || (back && back.talentChoices));
  if (back && back.talentCharacteristicChoices && back.talentCharacteristicChoices[sp.id]) back.talentCharacteristicChoices[sp.id][cells.renegade_form] = 'brawn';
  check('(iii) the saved map is a copy: editing it leaves the creator\'s', ch.talentCharacteristicChoices[sp.id][cells.renegade_form] === 'agility');
  const made = toSheet(state({ talentCharacteristicChoices: JSON.parse(JSON.stringify(tcc)) }));
  const plain = toSheet(state());
  check('(iii) no map on the creator state → none on the sheet', !('talentCharacteristicChoices' in plain), plain.talentCharacteristicChoices);
  const sc = CR.skillCharacteristic(made, 'LTSAB', cb);
  check('(iii) on the saved sheet Lightsaber rolls Agility (Renegade Form\'s pick)', sc && sc.characteristic === 'agility', sc && sc.characteristic);
  // the sheet's own reader, executed from the shipped file in a window sandbox (as the app loads it)
  const sb = { console, JSON, Math, Object, Array, String, Number, Boolean, isFinite, parseInt, parseFloat, RegExp, Date, WeakMap, Map, Set, Symbol, Error, TypeError };
  sb.window = sb; sb.globalThis = sb; sb.self = sb; sb.addEventListener = function () {}; sb.dispatchEvent = function () {};
  vm.createContext(sb);
  for (const file of ['lib/shared/charResolve.js', 'lib/shared/sheetPool.js']) {
    sb.module = { exports: {} };
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sb, { filename: file });
  }
  sb._canonicalCharbuild = cb;
  const rolls = (sheet) => { const x = sb.SWRPGSheetPool.sheetSkillCharacteristic(JSON.parse(JSON.stringify(sheet)), 'LTSAB'); return x && x.characteristic; };
  check('(iii) the sheet\'s reader: sheetSkillCharacteristic rolls the pick (Agility)', rolls(made) === 'agility', rolls(made));
  check('(iii) control: without the pick, sheetSkillCharacteristic rolls the base (Brawn)', rolls(plain) === 'brawn', rolls(plain));
}

// ── (vii) the `_` refusal, packValidate ──────────────────────────────────────────────────────────────────────────────
{
  const V = PV.create(PV.readSchemaDir(path.join(ROOT, 'schema')));
  const base = {}; PV.APPLIED_SECTIONS.forEach((s) => { base[s] = J(s + '.json')[s]; });
  const ctx = { base, vocab: { skills: vocab.map((e) => e.id), qualities: J('qualities.vocab.json').entries.map((e) => e.id) } };
  const spec = (id) => Object.assign({}, JSON.parse(JSON.stringify(base.specializations.force_sensitive_outcast)), { _mode: 'add', id });
  const pack = (id) => ({ formatVersion: 1, packId: 'my_data', name: 'My Data', _provenance: 'custom', sections: { specializations: { [id]: spec(id) } } });
  const bad = V.authoring(pack('_talent'), ctx), good = V.authoring(pack('custom_my_data_scout'), ctx);
  const named = (bad.reasons || []).filter((r) => /L1cb\.spid/.test(r));
  check('(vii) authoring REFUSES a `_` specialization id, by name', !bad.ok && named.length === 1, bad.reasons);
  check('(vii) control: a namespaced id carries no such reason', !(good.reasons || []).some((r) => /L1cb\.spid/.test(r)), good.reasons);
  const L = V.load(pack('_talent'), ctx);
  check('(vii) load keeps the record UNAPPLIED', !(L.applied && L.applied.specializations && L.applied.specializations._talent), L.applied && Object.keys(L.applied.specializations || {}));
}

// ── (viii) R-M8G-4: THE CENSUS — no product line indexes a pick map outside pickOf, the writers and the hand-overs ──────
// Comments stripped first (block-aware), so prose quoting a retired read never counts. A "read" is an element access on a
// pick map (`MAP[…]`, `MAP && …[…]`) or a treeless entry's legacy field. Each must sit inside an ALLOWED function's span
// (brace-matched from its header): the reader, the hand-overs, the instrument-only map form, and the writers.
{
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');
  const spanOf = (src, header) => {
    const i = src.indexOf(header);
    if (i < 0) return null;
    let j = src.indexOf('{', i + header.length - 1), d = 0, k = j;
    for (; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) break; } }
    return [i, k];
  };
  const ALLOWED = {
    'lib/shared/charResolve.js': ['function pickOf(sheet, specId, pos, pickId, item) {', 'function normalizeCreated(character, speciesData, specData, gameData, source, deps) {',
      'function talentChoiceSkillsAll(specsList, specRegistry, talentRegistry, picks, treeless, each) {'],
    'player/app.jsx': ['var handleTalentChoicesFile = useCallback(function(specKey, row, col, skills) {', 'var handleTalentRefundWithChoices = useCallback(function(posKey) {',
      'var handleTalentChoiceConfirm = useCallback(function(skills) {', 'function buyTalent(talentKey, specKey, row, col, cost, charChoice) {',
      'function chooseTalentCharacteristic(specKey, pos, characteristic) {', 'function chooseTalentSkills(specKey, pos, skills) {'],
    'lib/shared/treeView.jsx': [], 'gm/app.jsx': [], 'lib/shared/oggExport.js': [], 'lib/shared/sheetPool.js': [],
  };
  const READ = /\b(talentSkillChoices|talentCharacteristicChoices|talentChoices|characteristicChoices)\s*(\[|&&\s*[\w.]+\s*\[)|\.(skillChoices|characteristicChoice)\b/g;
  const outside = [], missing = [];
  let inside = 0;
  Object.entries(ALLOWED).forEach(([f, headers]) => {
    const src = strip(fs.readFileSync(path.join(ROOT, f), 'utf8'));
    const spans = headers.map((h) => { const s = spanOf(src, h); if (!s) missing.push(f + ': ' + h); return s; }).filter(Boolean);
    let m;
    while ((m = READ.exec(src))) {
      if (spans.some(([a, b]) => m.index > a && m.index < b)) { inside++; continue; }
      outside.push(f + ':' + (src.slice(0, m.index).split('\n').length) + ' ' + m[0]);
    }
  });
  check('(viii) census premise: every allowed function is found (a missing header would widen nothing silently)', missing.length === 0, missing);
  check(`(viii) census is not vacuous: ${inside} reads found inside the allowed functions (7 at 5440d9bb)`, inside >= 7, inside);
  check('(viii) R-M8G-4: zero direct pick-map reads outside pickOf, the writers and the hand-overs', outside.length === 0, outside);
}

// ── (ix)–(xiv) STEP 2, item 9 (R-M8K-6 (a)–(c)): picks per owned instance, fail closed, one writer ─────────────────
// A fixture tree (two cells of a RANKED talent whose row declares a per-rank distinct skill pick, one cell of a talent
// whose row declares a per-talent pick) handed to the shipped CharResolve.picksOf / pickWrite.
if (typeof CR.picksOf !== 'function' || typeof CR.pickWrite !== 'function') { check('(ix) CharResolve exports picksOf and pickWrite', false); }
else {
  const SPEC = { fx_tree: { id: 'fx_tree', talent_tree: [ { talents: [{ talent: 'fx_rank' }, { talent: 'fx_once' }] }, { talents: [{ talent: 'fx_rank' }, { talent: 'fx_rank' }] } ] } };
  const W = (s, e) => ({ start: s, end: e, hash: 'aaaaaaaaaaaa' });
  const TAL = Object.assign({}, cb.talents, {
    fx_rank: { id: 'fx_rank', name: 'Rank Picker', ranked: true, sources: ['eote'], description: 'x'.repeat(40),
      told: [{ id: 'told', words: W(0, 5), pick: { id: 'which_skill', kind: 'skill', per: 'rank', distinct: true } }] },
    fx_once: { id: 'fx_once', name: 'Talent Picker', ranked: false, sources: ['eote'], description: 'x'.repeat(40),
      told: [{ id: 'told', words: W(0, 5), pick: { id: 'one_skill', kind: 'skill', per: 'talent' } }] },
  });
  const fcb = Object.assign({}, cb, { specializations: SPEC, talents: TAL });
  const sheet = (owned, tc) => ({ specializations: [{ id: 'fx_tree', owned: owned }], talentChoices: tc || {} });
  const P = (sh, tid) => CR.picksOf(sh, fcb, tid)[0];
  // (ix) fail closed
  const none = P(sheet(['0-0', '1-0']), 'fx_rank');
  check('(ix) FAIL CLOSED: two owned ranks, nothing picked → 2 unpicked, no values', none && none.unpicked === 2 && none.values.length === 0, none);
  // (x) per talent at _talent[<id>], dies with the last owned rank
  const once = sheet(['0-1'], { _talent: { fx_once: { one_skill: 'cool' } } });
  check('(x) per talent: read at talentChoices._talent[<talentId>]', JSON.stringify(P(once, 'fx_once').values) === '["cool"]', P(once, 'fx_once'));
  const gone = sheet([], { _talent: { fx_once: { one_skill: 'cool' } } });
  check('(x) …and it dies with the talent\'s last owned rank (the save keeps it; nothing reads it)',
    P(gone, 'fx_once').values.length === 0 && P(gone, 'fx_once').instances.length === 0 && gone.talentChoices._talent.fx_once.one_skill === 'cool');
  // (xi) per rank dies with its cell
  const two = sheet(['0-0', '1-0'], { fx_tree: { '0-0': { which_skill: 'brawl' }, '1-0': { which_skill: 'melee' } } });
  check('(xi) per rank: each owned cell reads its own pick', JSON.stringify(P(two, 'fx_rank').values) === '["brawl","melee"]', P(two, 'fx_rank'));
  const one = sheet(['0-0'], two.talentChoices);
  check('(xi) …and a pick dies with its cell (1-0 un-bought → only brawl)', JSON.stringify(P(one, 'fx_rank').values) === '["brawl"]', P(one, 'fx_rank'));
  // (xii) distinct
  const dup = sheet(['0-0', '1-0'], { fx_tree: { '0-0': { which_skill: 'brawl' }, '1-0': { which_skill: 'brawl' } } });
  check('(xii) distinct holds at READ: a repeat reads as unpicked (one value, one prompt)', JSON.stringify(P(dup, 'fx_rank').values) === '["brawl"]' && P(dup, 'fx_rank').unpicked === 1, P(dup, 'fx_rank'));
  const w = CR.pickWrite(two, fcb, 'fx_rank', 'fx_tree', '1-0', 'which_skill', 'brawl');
  check('(xii) distinct holds at WRITE: the writer refuses a value another rank holds', !!(w && w.refused), w);
  // (xiv) the one writer writes talentChoices only
  const w1 = CR.pickWrite(sheet(['0-0', '1-0']), fcb, 'fx_rank', 'fx_tree', '1-0', 'which_skill', 'gunnery');
  check('(xiv) a per-rank pick is written at talentChoices[<specId>]["r-c"], and the patch carries talentChoices ONLY',
    w1 && JSON.stringify(Object.keys(w1)) === '["talentChoices"]' && w1.talentChoices.fx_tree['1-0'].which_skill === 'gunnery', w1);
  const w2 = CR.pickWrite(sheet(['0-1']), fcb, 'fx_once', null, null, 'one_skill', 'cool');
  check('(xiv) a per-talent pick is written at talentChoices._talent[<talentId>]', w2 && w2.talentChoices && w2.talentChoices._talent.fx_once.one_skill === 'cool', w2);
  check('(xiv) the writer refuses an undeclared pick id, a legacy id, and an unowned cell',
    !!CR.pickWrite(two, fcb, 'fx_rank', 'fx_tree', '0-0', 'nope', 'x').refused
      && !!CR.pickWrite(two, fcb, 'fx_rank', 'fx_tree', '0-0', 'career_skills', ['cool']).refused
      && !!CR.pickWrite(two, fcb, 'fx_rank', 'fx_tree', '0-1', 'which_skill', 'cool').refused);
  const src = fs.readFileSync(path.join(ROOT, 'lib/shared/charResolve.js'), 'utf8');
  const body = src.slice(src.indexOf('function pickWrite('), src.indexOf('function pickWrite(') + 2600);
  check('(xiv) the writer names no legacy map (talentSkillChoices / talentCharacteristicChoices)', body.length > 100 && !/talentSkillChoices|talentCharacteristicChoices/.test(body.slice(0, body.indexOf('\n  }\n') + 4)));
  // (xiii) item and vehicle picks were here: pick kind `item` is STOPPED on the item-instance brief and leaves the enum
  // with `vehicle` (ruling `f100-m8-build` R-M8G-8, R-M8G-10); its leg re-enters with the brief's ruling.
  // (xiv) a TREELESS rank's pick is written to that entry's own `choices` (where pickOf reads it), addressed by index
  const tsh = { specializations: [], treelessTalents: [{ id: 'fx_rank' }, { id: 'fx_rank', choices: { which_skill: 'brawl' } }], talentChoices: {} };
  const tP = P(tsh, 'fx_rank');
  check('(xiv) treeless ranks are instances addressed by index; the earlier one is unpicked',
    !!tP && tP.instances.length === 2 && tP.instances[1].specId === null && tP.instances[1].pos === 1 && tP.unpicked === 1, tP);
  const tw = CR.pickWrite(tsh, fcb, 'fx_rank', null, 0, 'which_skill', 'melee');
  check('(xiv) a treeless write patches treelessTalents[i].choices and nothing else (the sheet is not mutated)',
    !!tw && !tw.talentChoices && tw.treelessTalents && tw.treelessTalents[0].choices.which_skill === 'melee' && !tsh.treelessTalents[0].choices, tw);
  check('(xiv) …and distinct holds there too', !!CR.pickWrite(tsh, fcb, 'fx_rank', null, 0, 'which_skill', 'brawl').refused);
}

// ── (xv)–(xvii) R-M8G-9 (ruling f100-m8-build ADDENDUM 2): the PICK-VALUED anchor {scope: skill, chosen} ─────────────
// A fixture ranked talent shaped as Deadly Accuracy: a per-rank distinct skill pick; a damage row anchored to the picked
// skill whose amount reads that skill's ranks; a dice row anchored the same way. Handed to the SHIPPED collectors
// (CharResolve.ownedTalentRollSources / ownedTalentPoolSources) and the shipped core (SWRPGPoolMods.rollNumbersAt).
{
  const PMOD = require('../lib/shared/poolMods.js'), EC = require('../lib/shared/effectClass.js');
  const SPEC = { fx_tree: { id: 'fx_tree', talent_tree: [ { talents: [{ talent: 'fx_da' }] }, { talents: [{ talent: 'fx_da' }] } ] } };
  const W = (s, e) => ({ start: s, end: e, hash: 'aaaaaaaaaaaa' });
  const PICK = { id: 'combat_skill', kind: 'skill', per: 'rank', distinct: true };
  const TAL = Object.assign({}, cb.talents, {
    fx_da: { id: 'fx_da', name: 'Deadly Fixture', ranked: true, sources: ['eote'], description: 'x'.repeat(40),
      roll_numbers: [{ id: 'damage_delta', op: 'damage_delta', moment: 'check', applies_to: [{ scope: 'skill', chosen: 'combat_skill' }],
        amount: { of: 'skill_ranks', chosen: 'combat_skill' }, pick: PICK, words: W(0, 5) }],
      pool_mods: [{ id: 'add_boost', die: 'boost', count: 1, direction: 'add', applies_to: [{ scope: 'skill', chosen: 'combat_skill' }], words: W(0, 5) }] },
  });
  const dcb = Object.assign({}, cb, { specializations: SPEC, talents: TAL });
  const dsheet = (tc) => ({ specializations: [{ id: 'fx_tree', owned: ['0-0', '1-0'] }], talents: [{ id: 'fx_da', rank: 2 }],
    skills: { BRAWL: 2, RANGLT: 1 }, characteristics: { brawn: 3, agility: 3 }, talentChoices: tc || {} });
  const rolls = (sh) => { const t = CR.ownedTalentRollSources(sh, dcb).filter((x) => x.id === 'fx_da')[0]; return t ? t.roll_numbers : []; };
  const pools = (sh) => { const t = CR.ownedTalentPoolSources(sh, dcb).filter((x) => x.id === 'fx_da')[0]; return t ? t.pool_mods : []; };
  const one = dsheet({ fx_tree: { '0-0': { combat_skill: 'brawl' } } });
  const r1 = rolls(one);
  check('(xv) a picked rank resolves to ONE concrete row: anchor {skill: brawl}, amount = Brawl\'s ranks by its sheet key, one rank (per_rank false)',
    r1.length === 1 && JSON.stringify(r1[0].applies_to) === '[{"scope":"skill","value":"brawl"}]' && r1[0].amount.of === 'skill_ranks'
      && r1[0].amount.key === cb.skillSheetKeys.brawl && r1[0].per_rank === false && !JSON.stringify(r1[0]).includes('"chosen"'), r1);
  const two = dsheet({ fx_tree: { '0-0': { combat_skill: 'brawl' }, '1-0': { combat_skill: 'ranged_light' } } });
  check('(xv) each owned rank is its OWN anchor: two picks → two rows, one per skill', JSON.stringify(rolls(two).map((r) => r.applies_to[0].value)) === '["brawl","ranged_light"]', rolls(two));
  check('(xv) the dice row resolves the same way (the pool collector)', JSON.stringify(pools(two).map((r) => r.applies_to[0].value)) === '["brawl","ranged_light"]' && pools(two)[0].per_rank === false, pools(two));
  check('(xvi) FAIL CLOSED: no pick made → no row at all (it matches nothing; the talent prompts)', rolls(dsheet()).length === 0 && pools(dsheet()).length === 0);
  const dup = dsheet({ fx_tree: { '0-0': { combat_skill: 'brawl' }, '1-0': { combat_skill: 'brawl' } } });
  check('(xvi) …and a distinct repeat is unpicked, so it adds no second row', rolls(dup).length === 1, rolls(dup));
  // end to end through the shipped core: Brawl attack gets +2 (Brawl 2), a Ranged (Light) attack +1, Melee nothing
  const idx = { bySheetKey: {}, byId: {} };
  vocab.forEach((e) => { const rec = { id: e.id, group: e.group, characteristic: e.characteristic }; idx.byId[e.id] = rec; idx.bySheetKey[cb.skillSheetKeys[e.id]] = rec; });
  const at = (skill) => { global.window = { SWRPGEffectClass: EC }; try { return PMOD.rollNumbersAt(CR.ownedTalentRollSources(two, dcb), 'damage_delta', { ctx: PMOD.contextFor(skill, idx), sheet: two }); } finally { delete global.window; } };
  const b = at('brawl'), rl = at('ranged_light'), me = at('melee');
  check('(xvii) at the roll: Brawl +2 (its ranks), Ranged (Light) +1, Melee nothing — each APPLIED (RAW names the attack)',
    b.total === 2 && b.applied.length === 1 && rl.total === 1 && me.total === 0 && !me.applied.length && !b.offered.length, { b: b.total, rl: rl.total, me: me.total });
}

console.log(`\nf100_m8_picks: ${passes} PASS · ${fails} FAIL`);
process.exit(fails ? 1 : 0);
