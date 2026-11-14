#!/usr/bin/env node
/**
 * test/fixtures/f100_m12_harness.cjs — NOT A TEST. The fixture prefix of the retired key-off guard test/f100_m12_key_off.cjs
 * (post1-switch-deletion, ADDENDUM 638 table 3: its run section — Z0–Z5, the key-OFF premise — retired with the keys): the
 * data per side, the vm world, numbers(), M12's readers, the fixtures (FIX). BEFORE = commercial 5c57b7cf's code and data
 * (its species/force keys held OFF there, as the guard held them); TREE = this tree, the one world (no reader files, no key).
 * Read as source by test/f100_force_flip.cjs and test/f100_engine_flip.cjs (S3): each slices it up to the `// ── run`
 * marker below, re-points the ROOT line and appends its own leg. Running it alone builds the fixtures and prints nothing.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const BASE_SHA = '5c57b7cf';

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const atBase = (p) => execFileSync('git', ['-C', ROOT, 'show', BASE_SHA + ':' + p], { encoding: 'utf8', maxBuffer: 1 << 28 });
const S = (x) => JSON.stringify(x);
const clone = (x) => JSON.parse(S(x));

let failures = 0;
const check = (ok, m, detail) => {
  if (ok) console.log('  PASS  ' + m);
  else { failures += 1; console.error('  FAIL  ' + m + (detail !== undefined ? '\n        ' + S(detail).slice(0, 600) : '')); }
};
function slice(src, header) {
  const i = src.indexOf(header);
  if (i < 0) throw new Error('SLICE MISS: ' + header);
  let j = src.indexOf('{', i), depth = 0, k = j;
  for (; k < src.length; k++) { if (src[k] === '{') depth++; else if (src[k] === '}') { depth--; if (depth === 0) { k++; break; } } }
  return src.slice(i, k);
}

// ── the data, per side ─────────────────────────────────────────────────────────────────────────────────────────────
const REG_KEYS = { weapons: 'weapons', armor: 'armor', gear: 'gear', attachments: 'attachments' };
function dataOf(side) {
  const get = side === 'before' ? atBase : read;
  const C = (f) => JSON.parse(get('public/data/canonical/' + f));
  const reg = {};
  Object.keys(REG_KEYS).forEach((k) => { reg[k] = C(k + '.json')[REG_KEYS[k]]; });
  return { vocab: C('skills.vocab.json').entries, reg, talents: C('talents.json').talents, careers: C('careers.json').careers,
    specs: C('specializations.json').specializations, species: C('species.json').species, powers: C('force_powers.json').force_powers,
    qv: C('qualities.vocab.json').entries, sig: side === 'before' ? null : C('signature_abilities.json').signature_abilities };
}
const D_BEFORE = dataOf('before'), D_TREE = dataOf('tree');
const vocab = D_TREE.vocab;
function charbuild(D) {
  const cb = { species: D.species, careers: D.careers, specializations: D.specs, talents: D.talents, forcePowers: D.powers,
    skillSheetKeys: {}, skillChars: {}, skillNames: {}, skillGroups: {} };
  if (D.sig) cb.signatureAbilities = D.sig;
  D.vocab.forEach((e) => { cb.skillSheetKeys[e.id] = (e.aliases || []).find((a) => /^[A-Z]+$/.test(a)) || e.id; cb.skillNames[e.id] = e.label;
    if (e.characteristic) cb.skillChars[e.id] = e.characteristic; if (e.group) cb.skillGroups[e.id] = e.group; });
  return cb;
}
const qualitiesDb = (entries) => { const m = {}; entries.forEach((q) => { m[q.label.toLowerCase()] = q; (q.aliases || []).forEach((a) => { m[String(a).toLowerCase()] = q; }); }); return m; };

// ── a world ────────────────────────────────────────────────────────────────────────────────────────────────────────
const FILES_BEFORE = ['lib/items.js', 'lib/shared/itemResolve.js', 'lib/shared/speciesRules.js', 'lib/shared/forceRules.js', 'lib/shared/charResolve.js',
  'lib/shared/diceEngine.js', 'lib/shared/effectClass.js', 'lib/shared/poolMods.js', 'lib/shared/qualityRows.js', 'lib/shared/packValidate.js',
  'lib/shared/itemRegistries.js', 'lib/shared/sheetPool.js'];
// the tree side is the one world: the three reader files (species, force, engine) are gone with their keys
const FILES_TREE = FILES_BEFORE.filter((f) => !/(species|force)Rules\.js$/.test(f));
// D-507 (handoff `encounters-e3-dicehub-move`): diceHubForceSpec moved VERBATIM with DiceHub's closure to
// lib/shared/diceHub.jsx — the tree side slices it from there by name; the before side keeps reading player/app.jsx at BASE_SHA
const APP = { before: atBase('player/app.jsx'), tree: read('lib/shared/diceHub.jsx') };
const APP_FILE = { before: 'app.jsx', tree: 'diceHub.jsx' };
const HDR = 'function diceHubForceSpec(sheet, poolMods, available, accent, powerId)';
function world(opts) {
  const side = opts.side, D = opts.data || (side === 'before' ? D_BEFORE : D_TREE);
  const sb = { console, JSON, Math, Object, Array, String, Number, Boolean, isFinite, isNaN, parseInt, parseFloat, RegExp, Date, WeakMap, Map, Set, Symbol, Error };
  sb.window = sb; sb.global = sb; sb.globalThis = sb; sb.self = sb; sb.addEventListener = function () {}; sb.dispatchEvent = function () {};
  vm.createContext(sb);
  for (const f of (side === 'before' ? FILES_BEFORE : FILES_TREE)) {
    sb.module = { exports: {} };
    let src = side === 'before' ? atBase(f) : read(f);
    if (opts.swap && opts.swap[f]) src = opts.swap[f](src);
    vm.runInContext(src, sb, { filename: f });
  }
  sb.module = undefined;
  sb._canonicalRegistries = Object.assign({ skills: D.vocab }, D.reg);
  sb._canonicalRegistriesBase = sb._canonicalRegistries;
  sb._qualitiesDb = qualitiesDb(D.qv);
  const cb = charbuild(D);
  if (opts.careers) cb.careers = opts.careers;
  sb._canonicalCharbuild = cb; sb._canonicalCharbuildBase = cb;
  if (side === 'before') { sb.SWRPGSpeciesRules.setForTest(false); sb.SWRPGForceRules.setForTest(false); }
  sb.withPoolMods = sb.SWRPGSheetPool.withPoolMods;
  vm.runInContext(slice(APP[side], HDR) + '\nglobalThis.__forceSpec = diceHubForceSpec;', sb, { filename: APP_FILE[side] + '#diceHubForceSpec' });
  return { side, D, cb, IR: sb.ItemResolve, CR: sb.CharResolve, P: sb.SWRPGPoolMods, SP: sb.SWRPGSheetPool, D6: sb.SWRPGDice, QR: sb.SWRPGQualityRows, forceSpec: sb.__forceSpec };
}

// ── a sheet's numbers (M11's numbers(), plus each resolved item) ───────────────────────────────────────────────────
const SHEET_KEYS = [...new Set(vocab.map((e) => (e.aliases || []).find((a) => /^[A-Z]+$/.test(a)) || e.id))];
const UNARMED = { regId: 'unarmed', skill: 'brawl', crit: 5, name: 'Unarmed' };
const powerEntries = (sheet) => (Array.isArray(sheet.forcePowers) ? sheet.forcePowers : []).filter((p) => p && typeof p.id === 'string' && p.name == null);
function commitsOf(sheet) {
  const c = { 0: true };
  powerEntries(sheet).forEach((p) => (p.upgrades || []).forEach((u) => { c[p.id + '.' + u] = 1; }));
  return c;
}
// RE-BASELINED (f100-triage-census-card ADDENDUM 13, B-136 d6e407791): B-136 restored the bracketed range bands the books
// print ("Range [Engaged]"), and one LIVE sheet carries a record so restored (seeker_crystal on master_lodaka_s_lightsaber), so
// its ITEM_VIEW's description moved against BASE_SHA with no number moving. For the records NAMED here, and only the restored
// words, the view reads the description less those words; every other key and every other character stays compared. Z1p keeps
// the list honest: each named description differs from BASE_SHA's, and by exactly those words.
const PROSE_RESTORED = { master_lodaka_s_lightsaber: 'B-136 d6e407791 (ADDENDUM 13): "Range [Engaged]" restored' };
const BAND_WORDS = / \[(Engaged|Short|Medium|Long|Extreme|Strategic|Planetary|Light|Heavy)\]/g;
// RE-BASELINED (release-r7-bug-burndown ADDENDUM 225, DECISIONS D-406 item 8, B-1452): the Staff of Office's "attempting to
// convincing" reads "convince" (the weapon corrections manifest), in its description and its boost row's condition; one LIVE
// sheet (pregen Zara Koth) carries it, and no number moves. For this record, and only that word, the view reads it back as the
// base; Z1w checks the registry differs from BASE_SHA by exactly that word.
const WORDS_CORRECTED = { staff_of_office: ['attempting to convince others', 'attempting to convincing others'] };
// RE-POINTED (release-r7-bug-burndown ADDENDUM 499 D-IT1 (a), B-1693): the typo rows in source_text_corrections move the prose of
// items LIVE sheets carry, with no number moving. A record's text reads back as BASE_SHA's ONLY when BASE_SHA's text with this
// table's B-1693 rows applied equals it exactly, so a word off the table stays a move. KEEPS every other character and every
// number compared. DROPS the misspelled words as a pin. Z1t keeps the put-back honest and proves it has work to do.
const TYPO_ROWS = JSON.parse(read('data-sources/source_text_corrections.json')).rows.filter((r) => r.row === 'B-1693');
const typoApplied = (text, rows) => rows.reduce((t, r) => (typeof t === 'string' && t.split(r.find).length === 2 ? t.replace(r.find, () => r.replace) : null), text);
const typoPut = new Set();
function typoPutBack(o, regId) {
  const put = (holder, baseHolder, field) => {
    const rows = TYPO_ROWS.filter((r) => r.id === regId && r.field === field);
    if (!rows.length || !holder || !baseHolder) return;
    const base = baseHolder.description;
    if (typeof holder.description === 'string' && holder.description !== base && typoApplied(base, rows) === holder.description) { holder.description = base; typoPut.add(regId + ' ' + field); }
  };
  const base = ['gear', 'weapons', 'armor'].map((k) => D_BEFORE.reg[k][regId]).find(Boolean);
  if (!base) return o;
  const out = Object.assign({}, o);
  put(out, base, 'description');
  if (Array.isArray(o.base_mods)) out.base_mods = o.base_mods.map((m, i) => { const c = m && typeof m === 'object' ? Object.assign({}, m) : m; put(c, (base.base_mods || [])[i], 'base_mods[' + i + '].description'); return c; });
  return out;
}
const ITEM_VIEW = (it) => { let o = {}; Object.keys(it || {}).sort().forEach((k) => { if (k !== '_categories') o[k] = it[k]; });
  if (it && PROSE_RESTORED[it.regId] && typeof o.description === 'string') o.description = o.description.replace(BAND_WORDS, '');
  if (it && it.regId) o = typoPutBack(o, it.regId);
  const wc = it && WORDS_CORRECTED[it.regId];
  return wc ? S(o).split(wc[0]).join(wc[1]) : S(o); };
function numbers(W, sheet) {
  const { CR, P, SP, D6, cb } = W, out = {}, commits = commitsOf(sheet), session = { committed: commits };
  const eq = SP.resolveSheetEquipment(sheet.equipment || {}, sheet);
  const d = CR.computeDerived(sheet, eq, cb);
  Object.keys(d).forEach((k) => { out['derived.' + k] = d[k]; });
  const enc = CR.computeEncumbrance(eq, sheet.characteristics || {}, CR.speciesEncumbranceDelta(sheet, cb));
  ['carried', 'limit', 'over', 'setbacks', 'freeManeuverLost'].forEach((k) => { out['enc.' + k] = enc[k]; });
  const mods = SP.collectPoolMods(eq, session);
  const idx = SP.poolModSkillIndex();
  SHEET_KEYS.forEach((k) => {
    const sc = SP.sheetSkillCharacteristic(sheet, k);
    out['skill.' + k + '.char'] = sc ? sc.characteristic : null;
    out['skill.' + k + '.alts'] = sc ? sc.alternatives.length + sc.reminders.length + sc.substitutes.length : null;
    const pool = SP.sheetPoolOf(sheet, k, mods, { forceCommitted: commits });
    out['skill.' + k + '.pool'] = pool ? [pool.proficiency, pool.ability, pool.boost, pool.setback].join('/') : null;
    const ctx = sc ? P.contextFor(k, idx, sc.characteristic) : null;
    out['skill.' + k + '.reminders'] = ctx ? P.reminders(mods, ctx).map((m) => (m.die || m.symbol) + ':' + m.count).sort().join(',') : null;
  });
  const owned = SP.collectRollNumbers(sheet);
  out['owned.pool'] = CR.ownedTalentPoolSources(sheet, cb, session).length;
  out['owned.roll'] = owned.length;
  // post1-switch-deletion (ADDENDUM 638, Q5 (1)): the Force key that this world held OFF is gone; its own rows (owner
  // `force:<power>:<ability>`, a Force power's TOLD line) are taken out here by the fixture, so the engine key's figure stays
  // compared alone. RULING-MOVED: before, sb.SWRPGForceRules.setForTest(false) kept them out (Kiran Sol's Enhance basic).
  const told = CR.ownedTalentToldSources(sheet, cb).filter((t) => !/^force:/.test(t.id));
  out['owned.told'] = told.length;
  out['owned.toldRows'] = S(told.map((t) => t.id + ':' + t.told.map((r) => r.id).join('+')));
  (eq.weapons || []).concat([UNARMED]).forEach((w, i) => {
    if (w !== UNARMED) out['item.weapon.' + i] = ITEM_VIEW(w);
    const key = cb.skillSheetKeys[w.skill] || w.skill;
    const sc = SP.sheetSkillCharacteristic(sheet, key);
    const ctx = P.contextFor(key, idx, sc ? sc.characteristic : undefined);
    if (!ctx) { out['weapon.' + i + '.crit'] = null; return; }
    if (w.regId) ctx.weapon = w.regId;
    const o = { ctx, band: '', sheet, pickFor: () => null };
    out['weapon.' + i + '.crit'] = P.critRatingWith(Number(w.crit) > 0 ? Number(w.crit) : null, P.rollNumbersAt(owned, 'crit_rating_delta', o), P.rollNumbersAt(owned, 'crit_rating_set', o));
    out['weapon.' + i + '.damage'] = P.rollNumbersAt(owned, 'damage_delta', o).total;
  });
  if (eq.armor) out['item.armor'] = ITEM_VIEW(eq.armor);
  // the hard-point accounting the sheet's item card reads (player/app.jsx: IR.pcHardpointAccounting(item.hp, …)), per raw entry
  const rawEq = sheet.equipment || {}, AT = W.D.reg.attachments;
  const hpOf = (sec, e) => { const rec = e && W.D.reg[sec][e.id]; return rec ? rec.hardpoints : null; };
  (Array.isArray(rawEq.weapons) ? rawEq.weapons : []).forEach((e, i) => { if (e && Array.isArray(e.attachments)) out['hp.weapon.' + i] = S(W.IR.pcHardpointAccounting(hpOf('weapons', e), e.attachments, AT)); });
  if (rawEq.armor && Array.isArray(rawEq.armor.attachments)) out['hp.armor'] = S(W.IR.pcHardpointAccounting(hpOf('armor', rawEq.armor), rawEq.armor.attachments, AT));
  (eq.gear || []).forEach((g, i) => { out['item.gear.' + i] = ITEM_VIEW(g); });
  const fr = Number(d.forceRating) || 0;
  out['hub.available'] = CR.forceDiceAvailable(fr, commits);
  powerEntries(sheet).forEach((p) => {
    const spec = W.forceSpec(sheet, mods, out['hub.available'], '#fff', p.id);
    const pl = D6.buildPool(spec);
    out['hub.force.' + p.id + '.pool'] = ['boost', 'setback', 'force', 'difficulty', 'challenge'].map((x) => pl[x] || 0).join('/');
    out['hub.force.' + p.id + '.changes'] = (spec._poolModChanges || []).length;
    out['hub.force.' + p.id + '.symbols'] = S(spec._autoSymbols || {});
  });
  return out;
}
const diff = (a, b) => Object.keys(Object.assign({}, a, b)).filter((k) => S(a[k]) !== S(b[k]));

// ── M12's own readers (AFTER worlds only) and their empty values ───────────────────────────────────────────────────
function m12(W, sheet) {
  const { CR, SP, QR, cb } = W, out = {};
  const eq = SP.resolveSheetEquipment(sheet.equipment || {}, sheet);
  const crec = cb.careers[CR.sheetCareerId(sheet, cb.careers)] || null;
  out['cp.all'] = S(CR.careerPowersOf(sheet, cb).all);
  const pctx = CR.careerPowerPriceCtx(sheet, cb);
  out['cp.ctx'] = S(pctx);
  out['cp.prices'] = S(Object.keys(cb.forcePowers).filter((id) => CR.forcePowerBasicCost(cb.forcePowers[id], pctx) !== CR.forcePowerBasicCost(cb.forcePowers[id], null)));
  out['ca.effects'] = CR.careerEffectsOf(sheet, cb).length;
  out['ca.bonuses'] = S(CR.careerEffectBonuses(sheet, cb));
  out['ca.xp'] = CR.careerXpAdjustment(crec);
  out['sig.rows'] = CR.sigAbilityRowSources(sheet, cb).length;
  const entries = Array.isArray(sheet.signatureAbilities) ? sheet.signatureAbilities : [];
  out['sig.counts'] = S(entries.map((e) => CR.sigTreeCells(cb.signatureAbilities[e.id]).map((c) => CR.sigUpgradeCount(sheet, e.id + '.' + c.ability, cb))));
  out['sig.activation'] = S(entries.map((e) => CR.sigActivation(sheet, cb, e.id)));
  out['sig.grants'] = S(CR.sigQualityGrantOffers(sheet, cb, W.D.qv));
  // SV1: a row anchored {scope: signature_ability} against its ability's activation check (contextFor's sigAbility; N3's probe)
  const idx = SP.poolModSkillIndex();
  out['sig.actcheck'] = entries.filter((e) => W.P.matches({ appliesTo: [{ scope: 'signature_ability', value: e.id }] },
    W.P.contextFor(vocab[0].id, idx, undefined, undefined, undefined, e.id))).length;
  out['mv3.effects'] = CR.itemCharacterEffects(eq).length;
  out['mv3.chars'] = S(CR.characteristicsInUse(sheet.characteristics || {}, eq)) === S(sheet.characteristics || {}) ? 'sheet' : S(CR.characteristicsInUse(sheet.characteristics || {}, eq));
  // Burly is a LIVE record (R-M12B-8): its Cumbersome rows apply with the key OFF; every other talent's item rows are M12's
  out['items.effects'] = CR.ownedItemEffects(sheet, cb).filter((fx) => !Object.prototype.hasOwnProperty.call(LIVE.talents, fx.talent)).length;
  (eq.weapons || []).forEach((w, i) => {
    out['q.' + i + '.spend'] = QR.spendRows(w, { vocab: W.D.qv }).length;
    out['q.' + i + '.modes'] = QR.modeOffers(w, { vocab: W.D.qv }).length;
    out['q.' + i + '.target'] = S(QR.targetRows(w, { soak: 3, kind: 'person' }, { vocab: W.D.qv }));
    out['cat.weapon.' + i] = S(w._categories === undefined ? null : w._categories);
  });
  return out;
}
const EMPTY = { 'sig.actcheck': 0, 'cp.all': '[]', 'cp.ctx': 'null', 'cp.prices': '[]', 'ca.effects': 0, 'ca.xp': 0, 'sig.rows': 0, 'sig.grants': '[]', 'mv3.effects': 0,
  'mv3.chars': 'sheet', 'items.effects': 0 };
const ZERO_BONUS = S({ soakBonus: 0, woundThresholdBonus: 0, strainThresholdBonus: 0, meleeDefenseBonus: 0, rangedDefenseBonus: 0 });
function notEmpty(o) {
  return Object.keys(o).filter((k) => {
    if (k in EMPTY) return o[k] !== EMPTY[k];
    if (k === 'ca.bonuses') return o[k] !== ZERO_BONUS;
    if (k === 'sig.counts') return /[1-9]/.test(o[k]);
    if (k === 'sig.activation') return /[^\[\],null]/.test(o[k].replace(/null/g, ''));
    if (/^q\.\d+\.(spend|modes)$/.test(k)) return o[k] !== 0;
    if (/^q\.\d+\.target$/.test(k)) return o[k] !== 'null';
    if (/^cat\./.test(k)) return o[k] !== 'null';
    return true;
  });
}

// ── the fixtures ───────────────────────────────────────────────────────────────────────────────────────────────────
const J = (p) => JSON.parse(read(p));
const FIX = [];
const PREGENS = J('public/data/pregen_sheets.json').characters;
PREGENS.forEach((c) => FIX.push({ src: 'pregen:' + (c.name || c.id), sheet: c }));
J('public/data/test-bench/swrpg_test_bed_bundle.json').pcs.forEach((p) => FIX.push({ src: 'test-bed:' + (p.payload.sheet.name || ''), sheet: p.payload.sheet }));
FIX.push({ src: 'retired-save', sheet: J('scripts/fixtures/retired_pregen_save.json').record.sheetData });
['creator_human_guardian_fad', 'creator_human_smuggler'].forEach((n) => FIX.push({ src: 'native:' + n, sheet: J('test/fixtures/native/' + n + '.json') }));
const N_REPO = FIX.length;
const TEMPLATE = PREGENS.find((c) => c.name === 'Tovan Kade');
if (!TEMPLATE) throw new Error('the template (pregen Tovan Kade) is gone — re-point it, never drop the leg');
const EQ0 = { weapons: [], armor: null, gear: [], credits: 0 };
const sheetWith = (equipment, extra) => Object.assign(clone(TEMPLATE), { equipment: Object.assign({}, EQ0, equipment) }, extra || {});
const wpn = (id, more) => Object.assign({ id, qty: 1, state: 'carried' }, more || {});
// a signature owner: career, its spec with the bottom-row columns owned, the ability with EVERY cell owned
function sigSheet(career, spec, abilityId) {
  const bottom = D_TREE.specs[spec].talent_tree.length - 1, rec = D_TREE.sig[abilityId];
  const cells = []; (rec.tree || []).forEach((row, r) => (row.cells || []).forEach((c) => { if (c) cells.push(r + '-' + (typeof c.col === 'number' ? c.col : 0)); }));
  return sheetWith({ weapons: [wpn('blaster_pistol')] }, { careerId: career, career: D_TREE.careers[career].name, talents: [],
    specializations: [{ id: spec, owned: rec.attach.columns.map((c) => bottom + '-' + (c - 1)) }],
    signatureAbilities: [{ id: abilityId, tree: spec, owned: cells }] });
}
const ENGINEER_SPEC = D_TREE.careers.engineer.specializations[0];
const M12 = {
  'engineer+unmatched-ingenuity': sigSheet('engineer', ENGINEER_SPEC, 'unmatchedingen'),
  'sig-owner:counterespionage': sigSheet('spy', 'courier', 'counterespionage'),
  'jury-rigged-weapon': sheetWith({ weapons: [wpn('8_gauge_scatter_gun', { attachments: [{ id: 'jury_rigged_weapon', mods: ['mod_3'] }] })] }),
  'talent:ichor_blade': sheetWith({ weapons: [wpn('ashla_staff', { talentMarks: [{ talent: 'ichor_blade', spec: 'nightsister', cell: '1-1' }] })] }, { specializations: [{ id: 'nightsister', owned: ['1-1'] }], talents: [] }),
  'talent:ichor_blade_improved': sheetWith({ weapons: [wpn('ashla_staff', { talentMarks: [{ talent: 'ichor_blade', spec: 'nightsister', cell: '1-1' }] })] }, { specializations: [{ id: 'nightsister', owned: ['1-1', '2-1'] }], talents: [] }),
  'told:ichor_blade': sheetWith({}, { talents: [{ id: 'ichor_blade', rank: 1 }] }),
  'told:ichor_blade_improved': sheetWith({ weapons: [wpn('ashla_staff', { talentMarks: [{ talent: 'ichor_blade', spec: 'nightsister', cell: '1-1' }] })] },
    { specializations: [{ id: 'nightsister', owned: ['1-1', '2-1'] }], talents: [{ id: 'ichor_blade', rank: 1 }, { id: 'ichor_blade_improved', rank: 1 }] }),
  'talent:acklay_s_scything_strike': sheetWith({ weapons: [wpn('brass_knuckles')] }, { specializations: [{ id: 'steel_hand_adept', owned: ['1-1'] }], talents: [{ id: 'acklay_s_scything_strike', rank: 1 }], forceRatingBase: 2 }),
  'talent:powerful_blast': sheetWith({ weapons: [wpn('frag_grenade')] }, { talents: [{ id: 'powerful_blast', rank: 2 }] }),
  'talent:sunder_improved': sheetWith({ weapons: [wpn('arg_garok')] }, { talents: [{ id: 'sunder_improved', rank: 1 }] }),
  'talent:burly': sheetWith({ weapons: [wpn('a280_heavy_blaster_rifle')] }, { talents: [{ id: 'burly', rank: 2 }] }),
  'mv1+r1:curved_hilt': sheetWith({ weapons: [wpn('training_lightsaber', { attachments: [{ id: 'curved_hilt', mods: [] }] })] }),
  'mv2+r1:custom_grip': sheetWith({ weapons: [wpn('blaster_pistol', { attachments: [{ id: 'custom_grip', mods: ['mod_0'] }] })] }),
  'mv3:tracking_system': sheetWith({ armor: { id: 'padded_armor', state: 'worn', attachments: [{ id: 'tracking_system', mods: ['mod_0'] }] } }),
  'mv3:biofeedback_system': sheetWith({ armor: { id: 'padded_armor', state: 'worn', attachments: [{ id: 'biofeedback_system', mods: [] }] } }),
  'mv4:component_alteration_weapon': sheetWith({ weapons: [wpn('blaster_pistol', { attachments: [{ id: 'component_alteration_weapon', mods: [] }] })] }),
  'qm1+qt1:auto-fire': sheetWith({ weapons: [wpn('heavy_repeating_blaster')] }),
  'qs1:blast': sheetWith({ weapons: [wpn('8_gauge_scatter_gun')] }),
  'career:engineer(synthetic)': sheetWith({}, { careerId: 'engineer', career: 'Engineer', specializations: [{ id: ENGINEER_SPEC, owned: [] }], talents: [] }),
};
Object.keys(M12).forEach((k) => FIX.push({ src: 'm12:' + k, sheet: M12[k] }));
// Career Powers + Attributes ship on no record until GATE #2: the CONTROL reads an in-memory engineer copy (disclosed).
const SYN_CAREERS = Object.assign({}, D_TREE.careers, { engineer: Object.assign(clone(D_TREE.careers.engineer), {
  career_powers: ['influence', 'move'], effects: [{ op: 'soak_delta', amount: 1 }], xp_adjustment: 10 }) });

// THE LIVE RECORDS (R-M12B-8), by registry: the fix each carries. Each must differ from 5c57b7cf (the list cannot rot).
const LIVE = {
  weapons: { double_bladed_inquisitorious_lightsaber: 'B-1230 (R-M12C-68)', training_lightsaber: 'B-1230 (R-M12C-68)', fear_stick: 'B-1231 (R-M12C-68)',
    forsaken_jedi_lightsaber: 'B-1230 (R-M12C-66)', forsaken_jedi_lightsaber_aor: 'B-1230 (R-M12C-66, new)', lightwhip: 'B-1230 (R-M12C-64)',
    shock_whip: 'B-1231 (R-M12C-67/-77)', the_darksaber: 'B-1230 (R-M12C-65)' },
  armor: { destri_series_laminated_beast_armor: 'B-1232', diplomat_s_robes: 'B-1232', holographic_costume: 'B-1232', mimetic_suit: 'B-1232',
    phase_i_arc_trooper_armor_rise_of_the_separatists: 'B-1232', sakiyan_shadowsuit: 'B-1232', mandalorian_armor: 'B-1232 (R-M12C-76)',
    mandalorian_armor_cotr: 'B-1232 (R-M12C-76, new)' },
  attachments: { bipod_mount: 'B-1204', gyrostabilizer: 'B-1204', tripod_mount: 'B-1204', weapon_harness: 'B-1204', weapon_sling: 'B-1204',
    droid_brain_defense_system: 'B-1245', seeker_crystal: 'B-1245 (sibling row)' },
  talents: { burly: 'B-1204 (R-M12B-40..42)' },
  // `f100-surfacing-preflip-species-card` R-SPF-3 (b), (d): Superior's armour numbers live on the quality (armor_effects)
  qualities: { superior: 'B-1297 (R-SPF-3 (b))' },
};
// R-SPF-3 (a) (d) + R-SPF-19 (ADDENDUM 8): the armour-type attachments whose `qualities_add` now reaches the armour — a CODE
// fix (itemResolve's armour branch), so their bytes equal 5c57b7cf's and the REVERT world cannot put them back; each is
// listed by name, carried on its own sheet, and its move is attributed to the code path below (Z1s) and to Superior's
// vocabulary member above (the numbers). Each must stay an armour attachment granting a quality (the list cannot rot).
const LIVE_CODE = { cortosis_weave: 'B-1297 (R-SPF-19) qualities list', superior_armor_customization: 'B-1297 (R-SPF-3) soak / encumbrance' };
const LIVE_HOST = { bipod_mount: 'a280_heavy_blaster_rifle', gyrostabilizer: 'a280_heavy_blaster_rifle', tripod_mount: 'a280_heavy_blaster_rifle',
  weapon_harness: 'a280_heavy_blaster_rifle', weapon_sling: 'a280_heavy_blaster_rifle', seeker_crystal: 'master_lodaka_s_lightsaber' };
Object.keys(LIVE.weapons).forEach((id) => FIX.push({ src: 'live:' + id, sheet: sheetWith({ weapons: [wpn(id)] }) }));
Object.keys(LIVE.armor).forEach((id) => FIX.push({ src: 'live:' + id, sheet: sheetWith({ armor: { id, state: 'worn' } }) }));
Object.keys(LIVE.attachments).forEach((id) => FIX.push({ src: 'live:' + id, sheet: D_TREE.reg.attachments[id].type === 'armor'
  ? sheetWith({ armor: { id: 'padded_armor', state: 'worn', attachments: [{ id, mods: [] }] } })
  : sheetWith({ weapons: [wpn(LIVE_HOST[id], { attachments: [{ id, mods: [] }] })] }) }));
Object.keys(LIVE_CODE).forEach((id) => FIX.push({ src: 'live:' + id, sheet: sheetWith({ armor: { id: 'padded_armor', state: 'worn', attachments: [{ id, mods: [] }] } }) }));

// ── run (the readers' cut: everything above is the harness) ────────────────────────────────────────────────────────
