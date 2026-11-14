#!/usr/bin/env node
/**
 * effect_class_items.cjs — STANDING guard for the ITEM chips (F-100 items editor; ruling
 * f100-items-editor-contracts R-FIEC-1, as amended by f100-items-frames ADDENDUM 1 R-FIFG-A1-1: the two-way
 * evidence guard runs with NO exceptions). lib/shared/effectClass.js.
 *
 *   C-1  THE LINE RULE: over the three shipped registries, classesOf(rec, section) reproduces the ruling's
 *        §2 row 3 per registry (resolves / resolves+reminds / reminds / prints / none) and its line totals
 *        (19 · 186 · 391 — re-measured on the merged tree at the hub lap's merge, citing BOTH f100-surfacing-hub-concept
 *        ADDENDUM 9 (B-1196: reminds +48 rows, prints −48) and f100-triage-census-card ADDENDUM 11 (B-1068: Spore/B's
 *        NOT-A-MODIFIER row removed, reminds −1)). HARVEST = records classified; zero = fail.
 *   E1   EVERY AUTOMATIC FIELD HAS A LIVE READER: each cited symbol is found in its file, its body (comments
 *        stripped) holds the cited read, and the symbol is referenced OUTSIDE its own definition somewhere in
 *        shipped source (a reader nothing calls is no reader).
 *   E2   NO NARRATIVE FIELD HAS ONE: no 'computes' reader body reads a NARRATIVE field (or the name it travels
 *        under, e.g. qualities → _qualitiesRaw). For a free-text field (JSON type string) only a DECISION use
 *        counts — Number()/parse*, a comparison, a switch, a key lookup, a regex test; a label passed on as
 *        text (`name: g.name`) is text, which is what NARRATIVE means.
 *   Q    QUALITIES, PER VALUE (ruling f100-items-qualities-class R-FIQC-1): every consumed quality id has a
 *        live cited reader holding its comparison; NO other id of qualities.vocab.json is compared (=== / case)
 *        anywhere in shipped source. The day the engine starts reading another quality, this goes red until
 *        the consumed set says so.
 *   E3   COMPLETENESS: every property each item schema declares is chipped (fieldClassOf) or is on the
 *        declared not-chipped list with its reason — a new field cannot arrive unclassified.
 *   BITE each check is run again on a mutated table and must go red: restricted declared NARRATIVE (E2);
 *        restricted cited to biteDeadReader, a fixture in this file that no SRC_FILES file can call (E1; ruling
 *        effect-class-items-b2 R-ECB-1 — it was rarity.js findDifficulty until the Ship Yard's catalogue called it);
 *        description declared
 *        AUTOMATIC with no read in its cited body (E1); defensive dropped from the consumed set (Q).
 *
 * Run: node test/effect_class_items.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const EC = require(path.join(ROOT, 'lib/shared/effectClass.js'));

let failures = 0, rows = 0;
function check(ok, msg) { rows += 1; if (ok) console.log('  PASS  ' + msg); else { failures += 1; console.log('  FAIL  ' + msg); } }
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const SCHEMA = { weapons: 'weapon', armor: 'armor', gear: 'gear' };

// ── C-1 ──
// Re-pointed by f100-m12-build-card R-M12B-46: each registry's one NEW record lands in `none` — weapons 345 → 346
// (`forsaken_jedi_lightsaber_aor`, R-M12C-66), armor 21 → 22 (`mandalorian_armor_cotr`, R-M12C-76). Bite: without
// the named record the section counts the prior pin again.
// Re-pointed by f100-triage-census-card ADDENDUM 10/11: B-1068 removed `spore_b_stun_grenade`'s NOT-A-MODIFIER pool_mods
// row (the M12 runner), so that record moves weapons reminds → none (the bite's prior moves with it), lines reminds −1.
// Re-pointed by f100-surfacing-hub-concept ADDENDUM 7 Q2 (a) (iii) as named by ADDENDUM 9 ruling 2 (B-1196's anchor
// write d0f6e6a82, measured): the 48 item rows gain `applies_to: [{scope: all}]` with their conditions and classify
// 'reminds' — weapons 4 records prints → reminds (prints 17 → 13), armor 6 (18/61 → 24/55; 9 rows), gear 29 (71/206 →
// 100/177; 35 rows); lines reminds +48, prints 439 → 391.
// BOTH, re-measured on the merged tree at the hub lap's merge (the lap that merged SECOND, as ADDENDUM 9 and triage
// ADDENDUM 11 ruled, closed by hub ADDENDUM 11): weapons 38/17/346 → 41/13/347, armor and gear as the hub's, lines
// 19 · 139 · 439 → 19 · 186 · 391.
// Re-pointed by release-r5-data R-R5DG-1 (the R-M12B-46 precedent): the three C3 personal weapons (`spray_rifle`,
// `spray_foam_grenade`, `mk_viii_gravitic_mortar_launcher`) carry no effect line and land in `none` by the line rule —
// weapons none 347 → 350; the bite's prior 346 → 349. Every other leg kept; nothing dropped.
// Re-pointed by release-r7-bug-burndown ADDENDUM 37 D-R7GD1 (a): `gungan_personal_energy_shield` (GUNGPES, Nexus of Power
// p.104, held by B-1429) carries no effect line and lands in `none` — weapons none 350 → 351; the bite's prior 349 → 350.
// Its qualities Defensive 2 / Deflection 2 resolve, so Q's AUTOMATIC count 44 → 45. KEEPS every leg and both bites;
// DROPS nothing.
const RULED_C1 = { weapons: [1, 0, 41, 13, 351], armor: [9, 3, 24, 55, 22], gear: [6, 0, 100, 177, 327] };
const C1_NEW = { weapons: ['forsaken_jedi_lightsaber_aor', [1, 0, 41, 13, 350]], armor: ['mandalorian_armor_cotr', [9, 3, 24, 55, 21]] };
const RULED_LINES = { resolves: 19, reminds: 186, prints: 391 };
const lines = { resolves: 0, reminds: 0, prints: 0 };
let harvest = 0;
console.log('effect_class_items — ruling f100-items-editor-contracts R-FIEC-1 + f100-items-frames R-FIFG-A1-1');
EC.ITEM_SECTIONS.forEach((sec) => {
  const recs = Object.values(readJson('public/data/canonical/' + sec + '.json')[sec]);
  const k = { resolves: 0, 'resolves+reminds': 0, reminds: 0, prints: 0, none: 0 };
  recs.forEach((r) => {
    harvest++;
    EC.linesOf(r, sec).forEach((l) => { lines[l.cls]++; });
    const c = EC.classesOf(r, sec);
    k[c.length ? c.join('+') : 'none']++;
  });
  const got = [k.resolves, k['resolves+reminds'], k.reminds, k.prints, k.none];
  check(JSON.stringify(got) === JSON.stringify(RULED_C1[sec]), `C-1 ${sec}: ${JSON.stringify(got)} == ruling §2 row 3 ${JSON.stringify(RULED_C1[sec])}`);
  if (C1_NEW[sec]) {
    const [nid, prior] = C1_NEW[sec];
    const b = { resolves: 0, 'resolves+reminds': 0, reminds: 0, prints: 0, none: 0 };
    recs.filter((r) => r.id !== nid).forEach((r) => { const c = EC.classesOf(r, sec); b[c.length ? c.join('+') : 'none']++; });
    const bit = [b.resolves, b['resolves+reminds'], b.reminds, b.prints, b.none];
    check(recs.some((r) => r.id === nid) && JSON.stringify(bit) === JSON.stringify(prior),
      `C-1 ${sec} bite: without ${nid} the counts are the prior pin ${JSON.stringify(bit)} == ${JSON.stringify(prior)}`);
  }
});
check(JSON.stringify(lines) === JSON.stringify(RULED_LINES), `C-1 line totals ${JSON.stringify(lines)} == ruling ${JSON.stringify(RULED_LINES)}`);
check(EC.classesOf({ id: 'x' }, 'gear').length === 0 && EC.classesOf({ id: 'x' }).join() === 'prints',
  'an item with no rule line has no class ([]: the shelf\'s "—"); a talent with none still prints');
check(EC.classesOf({ base_mods: [{ description: 'x' }], pool_mods: [{ die: 'boost', count: 1, direction: 'add', applies_to: [{ scope: 'skill', value: 'athletics' }], from: { channel: 'base_mods', index: 0 } }] }, 'gear').join() === 'resolves',
  'a base_mods sentence that dice are read from takes its dice\'s class, not a line of its own');

// ── the evidence instrument ──
const SRC_FILES = ['lib/items.js', 'lib/shared/charResolve.js', 'lib/shared/itemResolve.js', 'lib/shared/poolMods.js',
  'lib/shared/yardView.jsx', 'lib/shared/vesselView.jsx', 'lib/store/view.jsx', 'lib/store/rarity.js', 'lib/store/shelfStore.js',
  'player/app.jsx', 'gm/app.jsx',
  // D-507 (handoff `encounters-e3-dicehub-move`): DiceHub's closure (computeWeaponPool, resolveWeaponSkillKey, …) moved
  // VERBATIM to lib/shared/diceHub.jsx — a product file whose calls count like the rest
  'lib/shared/diceHub.jsx'];
const srcCache = {};
function stripComments(t) {
  return t.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .split('\n').map((l) => l.replace(/(^|[^:'"\\])\/\/.*$/, '$1')).join('\n');
}
function src(f) { if (!(f in srcCache)) srcCache[f] = fs.existsSync(path.join(ROOT, f)) ? stripComments(fs.readFileSync(path.join(ROOT, f), 'utf8')) : null; return srcCache[f]; }
function defRe(sym) { return new RegExp('function\\s+' + sym + '\\s*\\(|(?:var|const|let)\\s+' + sym + '\\s*=\\s*(?:function|\\()'); }
function bodyOf(file, sym) {
  const t = src(file); if (t == null) return null;
  const m = defRe(sym).exec(t); if (!m) return null;
  let i = t.indexOf('(', m.index), d = 0, j;                 // past the parameter list (it may destructure `{…}`)
  for (j = i; j < t.length; j++) { if (t[j] === '(') d++; else if (t[j] === ')') { d--; if (!d) break; } }
  i = t.indexOf('{', j); d = 0; j = i;
  for (; j < t.length; j++) { const c = t[j]; if (c === '{') d++; else if (c === '}') { d--; if (!d) break; } }
  return { from: m.index, to: j + 1, text: t.slice(m.index, j + 1) };
}
function calledOutside(file, sym) {
  const b = bodyOf(file, sym); if (!b) return 0;
  const re = new RegExp('\\b' + sym + '\\b', 'g');
  let n = 0;
  SRC_FILES.forEach((f) => {
    const t = src(f); if (t == null) return;
    let m; re.lastIndex = 0;
    const exported = new RegExp('\\b' + sym + '\\s*:\\s*' + sym + '\\b', 'g');      // `sym: sym` in an export object is not a call
    const skip = []; let x; while ((x = exported.exec(t))) skip.push([x.index, x.index + x[0].length]);
    while ((m = re.exec(t))) {
      if (f === file && m.index >= b.from && m.index < b.to) continue;
      if (skip.some((r) => m.index >= r[0] && m.index < r[1])) continue;
      n++;
    }
  });
  return n;
}
const ALIAS = { qualities: ['_qualitiesRaw'], hardpoints: ['hp'], skill: ['skillKey'], range: ['rangeCode'] };
function fieldType(sec, f) { const p = (readJson('schema/' + SCHEMA[sec] + '.schema.json').properties || {})[f]; return p && p.type; }
function narrativeHits(sec, f, sinks) {
  const names = [f].concat(ALIAS[f] || []), hits = [];
  const freeText = fieldType(sec, f) === 'string';
  sinks.forEach((s) => {
    const b = bodyOf(s.file, s.symbol); if (!b) return;
    b.text.split('\n').forEach((l) => names.forEach((n) => {
      const acc = "[\\w$.\\]]+(?:\\." + n + "|\\['" + n + "'\\])\\b";
      const any = new RegExp("(\\." + n + "|\\['" + n + "'\\])\\b");
      const decide = new RegExp('(Number|parseInt|parseFloat)\\(\\s*' + acc + '|' + acc + '\\s*(?:[!=]==?|<|>)|(?:[!=]==?|<|>)\\s*' + acc +
        '|switch\\s*\\(\\s*' + acc + '|\\[\\s*' + acc + '\\s*\\]|' + acc + '\\.(?:match|test|indexOf|search)\\(|' + acc + '\\s*\\?');
      if (freeText ? decide.test(l) : any.test(l)) hits.push(s.symbol + ' reads ' + n + ': ' + l.trim().slice(0, 90));
    }));
  });
  return hits;
}

function readerProblems(r) {
  const out = [], b = bodyOf(r.file, r.symbol);
  if (!b) return [r.file + ' has no ' + r.symbol];
  if (b.text.indexOf(r.read) === -1) out.push(r.symbol + ' does not read `' + r.read + '`');
  if (r.via && (src(r.via.file) || '').indexOf(r.via.read) === -1) out.push(r.via.file + ' never calls `' + r.via.read + '`');
  if (!calledOutside(r.file, r.symbol)) out.push(r.symbol + ' has no call site outside its definition (a dead reader)');
  return out;
}
const QUALITY_IDS = readJson('public/data/canonical/qualities.vocab.json').entries.map((e) => e.id);
// run(tables) → { e1: [problems], e2: [problems], q: [problems] }. tables: { readersOf(sec,f), fieldClassOf(sec,f), fieldsOf(sec) }
function run(T) {
  const e1 = [], e2 = [];
  const sinks = [];
  EC.ITEM_SECTIONS.forEach((sec) => T.fieldsOf(sec).forEach((f) => {
    if (T.fieldClassOf(sec, f) !== 'resolves') return;
    const rs = T.readersOf(sec, f);
    if (!rs.length) { e1.push(sec + '.' + f + ': AUTOMATIC with no cited reader'); return; }
    rs.forEach((r) => {
      readerProblems(r).forEach((p) => e1.push(sec + '.' + f + ': ' + p));
      if (r.kind === 'computes' && !sinks.some((s) => s.file === r.file && s.symbol === r.symbol)) sinks.push(r);
    });
  }));
  // Q — qualities per value
  const q = [];
  const consumed = T.consumedQualities();
  consumed.forEach((id) => {
    const rs = T.qualityReadersOf(id);
    if (!rs.length) q.push('quality ' + id + ': consumed with no cited reader');
    rs.forEach((r) => readerProblems(r).forEach((p) => q.push('quality ' + id + ': ' + p)));
  });
  QUALITY_IDS.filter((id) => consumed.indexOf(id) === -1).forEach((id) => {
    const re = new RegExp("(===|!==|==|!=)\\s*['\"]" + id + "['\"]|['\"]" + id + "['\"]\\s*(===|!==|==|!=)|case\\s+['\"]" + id + "['\"]");
    SRC_FILES.forEach((f) => (src(f) || '').split('\n').forEach((l, i) => { if (re.test(l)) q.push('quality ' + id + ' is not in the consumed set but ' + f + ':' + (i + 1) + ' compares it: ' + l.trim().slice(0, 80)); }));
  });
  EC.ITEM_SECTIONS.forEach((sec) => T.fieldsOf(sec).forEach((f) => {
    if (T.fieldClassOf(sec, f) !== 'prints') return;
    narrativeHits(sec, f, sinks).forEach((h) => e2.push(sec + '.' + f + ' is NARRATIVE but ' + h));
  }));
  return { e1, e2, q, sinks };
}
const live = run(mutated({}));
check(live.sinks.length >= 5, `E1 the computing readers found: ${live.sinks.map((s) => s.symbol).join(', ')}`);
check(live.e1.length === 0, 'E1 every AUTOMATIC field has a live cited reader' + (live.e1.length ? ' — ' + live.e1.join('; ') : ''));
check(live.e2.length === 0, 'E2 no NARRATIVE field is read by a computing reader (no exceptions)' + (live.e2.length ? ' — ' + live.e2.join('; ') : ''));
check(live.q.length === 0 && QUALITY_IDS.length > 0, `Q qualities per value: consumed ${EC.CONSUMED_QUALITIES.join(', ')} each with a live reader; none of the other ${QUALITY_IDS.length - EC.CONSUMED_QUALITIES.length} vocab ids is compared in shipped source` + (live.q.length ? ' — ' + live.q.join('; ') : ''));
const W = readJson('public/data/canonical/weapons.json').weapons;
const autoQ = Object.values(W).filter((w) => EC.fieldClassOf('weapons', 'qualities', w.qualities) === 'resolves').length;
check(autoQ === 45 && EC.fieldClassOf('weapons', 'qualities') === EC.PER_VALUE,
  `Q the QUALITIES chip: ${autoQ} / ${Object.keys(W).length} weapons AUTOMATIC (the ruling's 45, D-R7GD1), the rest NARRATIVE; with no value, per-value`);
const DRAWN = ['blaster_pistol', 'plasma_charge', 'akrab_clip_point_vibrodagger', 'holdout_blaster', '12_defender'];
check(DRAWN.every((id) => W[id] && EC.fieldClassOf('weapons', 'qualities', W[id].qualities) === 'prints') && ['blast', 'breach', 'burn'].every((id) => EC.qualityClassOf(id) === 'prints'),
  'Q every drawn weapon\'s QUALITIES chip and I-12\'s rows (Blast, Breach, Burn) stay NARRATIVE, as approved (R-FIQC-1 §2)');

// ── E3 completeness ──
const NOT_CHIPPED = {
  id: 'minted, never edited (R-FIEC-7)', _source_key: 'book bookkeeping', _provenance: 'book bookkeeping', _cite: 'book bookkeeping',
  categories: 'kept as it is; which attachments fit (HIDES)', sources: 'resolved from the live book (R-FIEC-4)', availability: 'no reader (HIDES)',
  store_hidden: 'carried as is', not_purchasable: 'carried as is', never_modelled: 'a claim about the book\'s sentence; dropped on edit',
  pool_mods: 'rule lines (linesOf)', base_mods: 'rule lines (linesOf)', effects: 'rule lines (linesOf)',
  refuses_crystals: 'which crystals fit, read only by attachmentFit (R-M12C-64); listed by f100-m12-build-card R-M12B-47',
  threshold_bonus_requires: 'the qualifier of the carry-limit bonus row (I-4)',
  crystal_damage_mod: 'a hilt\'s printed crystal modifier, read only inside applyInstalledAttachments after a crystal\'s set; written by apply_weapon_crystal_mods from its manifest, not on the editor\'s form (B-1189 R-B1189-7)',
  crystal_default: 'the crystal a ready-made hilt is printed with, read only inside applyInstalledAttachments to take its qualities off before a new crystal\'s; written by apply_weapon_crystal_mods from its manifest, not on the editor\'s form (B-1198 R-B11FU-5)',
  // ruling-moved (release-r7-bug-burndown ADDENDUM 494 D-2, B-1715). KEEPS every other field; DROPS nothing else. A chip is a surface (R-MU1).
  _book_page: 'a printed page, no reader until a drawing is approved (B-1715); written by apply_item_book_pages, not on the editor',
  // ruling-moved (release-r6-companions-d365 ADDENDUM 2 R-R6CD-6): gear.schema.json's new property
  character_effects: 'a cybernetic implant\'s own page-cited lines, read by ItemResolve.implantEffectLines (R-R6CD-8) and droidOf\'s cybernetic_add; written by apply_cybernetic_effects from its manifest, not on the editor\'s form (release-r6-companions-d365 R-R6CD-6)',
};
const unclassified = [];
EC.ITEM_SECTIONS.forEach((sec) => Object.keys(readJson('schema/' + SCHEMA[sec] + '.schema.json').properties).forEach((f) => {
  if (!EC.fieldClassOf(sec, f) && !NOT_CHIPPED[f]) unclassified.push(sec + '.' + f);
}));
check(unclassified.length === 0, 'E3 every declared item field is chipped or listed as not chipped' + (unclassified.length ? ' — ' + unclassified.join(', ') : ''));
check(EC.fieldClassOf('weapons', 'restricted') === 'resolves' && EC.fieldClassOf('armor', 'restricted') === 'resolves' && EC.fieldClassOf('gear', 'restricted') === 'resolves',
  'restricted is AUTOMATIC on every item form (R-FIFG-A1-1, J1 (b))');
check(EC.fieldClassOf('talents', 'name') === null && EC.fieldClassOf('weapons', 'sources') === null, 'fieldClassOf is null off the item sections and for a not-chipped field');

// ── BITES: the same instrument over mutated tables ──
function mutated(over) {
  return {
    fieldsOf: EC.fieldsOf,
    fieldClassOf: (s, f) => (over.cls && over.cls[f] !== undefined ? over.cls[f] : EC.fieldClassOf(s, f)),
    readersOf: (s, f) => (over.readers && over.readers[f] ? over.readers[f] : EC.readersOf(s, f)),
    consumedQualities: () => (over.consumed || EC.CONSUMED_QUALITIES),
    qualityReadersOf: EC.qualityReadersOf,
  };
}
const b1 = run(mutated({ cls: { restricted: 'prints' } }));
check(b1.e2.some((p) => /restricted is NARRATIVE but PaperFindRow reads restricted/.test(p)), 'BITE restricted declared NARRATIVE → E2 red (' + b1.e2.filter((p) => /restricted/.test(p)).length + ' named)');
// R-ECB-1 (ruling effect-class-items-b2): the dead reader is a stand-in defined HERE, outside SRC_FILES, so no product
// change can ever call it. It reads `restricted` in its body, so the only clause that can fire is E1's liveness one.
// KEEPS E1's liveness clause bitten by a real, cited, uncalled reader; DROPS the dependence on shipped source that
// happened to be dead (rarity.js findDifficulty, which the Ship Yard's catalogue now calls, `catFind`).
function biteDeadReader(item) { return item.restricted; }   // never called: the bite's fixture
const b2 = run(mutated({ readers: { restricted: [{ file: 'test/effect_class_items.cjs', symbol: 'biteDeadReader', kind: 'computes', read: 'restricted' }] } }));
check(b2.e1.some((p) => /biteDeadReader has no call site/.test(p)), 'BITE restricted cited to the uncalled fixture biteDeadReader → E1 red (a dead reader)');
const b3 = run(mutated({ cls: { description: 'resolves' }, readers: { description: [{ file: 'lib/shared/diceHub.jsx', symbol: 'computeWeaponPool', kind: 'computes', read: 'weapon.description' }] } }));
check(b3.e1.some((p) => /does not read `weapon.description`/.test(p)), 'BITE description declared AUTOMATIC → E1 red (no read in its cited body)');

const b4 = run(mutated({ consumed: ['deflection'] }));
check(b4.q.some((p) => /quality defensive is not in the consumed set but lib\/shared\/charResolve\.js/.test(p)), 'BITE defensive dropped from the consumed set → Q red (charResolve compares it)');

if (failures) { console.error(`\neffect_class_items: ${failures} FAIL of ${rows} · HARVEST ${harvest} records`); process.exit(1); }
console.log(`\neffect_class_items: ALL PASS — ${rows} rows · HARVEST ${harvest} records`);
