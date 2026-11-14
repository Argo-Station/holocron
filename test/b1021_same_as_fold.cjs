/*
 * b1021_same_as_fold.cjs — B-1021 (ruling `release-r7-bug-burndown` ADDENDUM 65/66/67): ONE talent under two emitted ids
 * reads ONE row on the sheet, ranks summed, through the ONE reader of a record's `same_as`, `CharResolve.resolveSheetTalents`.
 *
 * Driven over the SHIPPED registries: the base talents with the stamped packs folded over them in a sheet's stamp order
 * (later pack wins, as SWRPGMods folds), so a red names the data or the reader, never a fixture.
 *   (1) Tarak Nol stamped [eote-v1, aor-v1], holding respec_savy + respec_savvy, reads ONE "Savvy" row, ranked, rank 2;
 *   (2) the v2 pair [eote-v2, aor-v2], holding savvy + respec_savvy, reads one row, rank 2;
 *   (3) control, NEVER by name: grit + respec_grit (both "Grit", different rules) stay TWO rows;
 *   (4) the dice are untouched: Charm through SWRPGSheetPool.charPool carries 2 Boost (each id's own pool_mods), its green and yellow as without them;
 *   (5) both hosts: the player's one sheet-talent display reads CharResolve.resolveSheetTalents, the GM loads the same
 *       charResolve.js and draws no talent rows of its own (no second reader);
 *   (6) Blather: respec_blat + respec_blather read one row, and it stays unranked (an unranked talent held twice is held once);
 *   (7) Gearhead: gearhead + respec_gearhd read one row, rank 2.
 *   (8) F1 (b) (ruling ADDENDUM 80): a USER pack never carries `same_as` — SWRPGPackValidate.load prunes it from a user talent
 *       (`generator-only:same_as` on `_unapplied`, the record still applies) and authoring refuses it; that talent then
 *       reads as its OWN row beside Savvy. The shipped stamps are kept (aor-v1's respec_savvy still → savvy).
 * RED AT THE CUT (5686fd2f9, exit 1): (1) (2) (6) (7) — the packs carried no `same_as` and the reader folded nothing.
 * (8) RED AT e63cfde21 (exit 1): packValidate applied the user talent with its `same_as`, and it folded into Savvy.
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const J = (p) => JSON.parse(read(p));
let pass = 0, fail = 0;
const check = (label, ok, detail) => { if (ok) { pass++; console.log('  PASS  ' + label); } else { fail++; console.log('  FAIL  ' + label + (detail !== undefined ? '\n        ' + JSON.stringify(detail).slice(0, 400) : '')); } };

const CR = require(path.join(ROOT, 'lib/shared/charResolve.js'));
const BASE = J('public/data/canonical/talents.json').talents;
const pack = (v) => J('public/data/mods/respecialized/' + v + '/talents.overlay.json').talents;
const view = (stamps) => Object.assign.apply(null, [{}, BASE].concat(stamps.map(pack)));
const rows = (stamps, ids) => CR.resolveSheetTalents(ids.map((id) => ({ id: id, rank: 1 })), view(stamps), (s) => s);
const brief = (rs) => rs.map((r) => ({ name: r.name, rank: r.rank, ranked: r.ranked, id: r.id }));
console.log('B-1021 · ONE TALENT, ONE ROW (same_as)');

{ const r = rows(['eote-v1', 'aor-v1'], ['street_smarts', 'respec_savy', 'respec_savvy']).filter((x) => x.name === 'Savvy');
  check('(1) Tarak Nol [eote-v1, aor-v1]: respec_savy + respec_savvy read ONE "Savvy" row, ranked, rank 2',
    r.length === 1 && r[0].rank === 2 && r[0].ranked === true, brief(r)); }
{ const r = rows(['eote-v2', 'aor-v2'], ['savvy', 'respec_savvy']);
  check('(2) the v2 pair [eote-v2, aor-v2]: savvy + respec_savvy read one row, rank 2',
    r.length === 1 && r[0].name === 'Savvy' && r[0].rank === 2, brief(r)); }
{ const v = view(['eote-v1', 'aor-v1']);
  check('(3) non-vacuity: grit and respec_grit are both named "Grit" with different rules',
    v.grit && v.respec_grit && v.grit.name === v.respec_grit.name && v.grit.description !== v.respec_grit.description);
  const r = rows(['eote-v1', 'aor-v1'], ['grit', 'respec_grit']);
  check('(3) control, never by name: grit + respec_grit stay TWO rows', r.length === 2, brief(r)); }

// (4) the dice: the shared pool path in a vm (f100_m8_rematch's harness) over the same view, a pregen sheet holding both ids.
{ const sb = { console, JSON, Math, Object, Array, String, Number, Boolean, isFinite, parseInt, parseFloat, RegExp, Date, WeakMap, Map, Set, Symbol, Error };
  sb.window = sb; sb.global = sb; sb.globalThis = sb; sb.self = sb; sb.addEventListener = function () {};
  vm.createContext(sb);
  for (const f of ['lib/items.js', 'lib/shared/itemResolve.js', 'lib/shared/charResolve.js', 'lib/shared/diceEngine.js',
    'lib/shared/poolMods.js', 'lib/shared/itemRegistries.js', 'lib/shared/sheetPool.js']) { sb.module = { exports: {} }; vm.runInContext(read(f), sb, { filename: f }); }
  const C = (f) => J('public/data/canonical/' + f), vocab = C('skills.vocab.json').entries;
  sb._canonicalRegistries = { skills: vocab, weapons: C('weapons.json').weapons, armor: C('armor.json').armor, gear: C('gear.json').gear, attachments: C('attachments.json').attachments };
  const cb = { species: C('species.json').species, careers: C('careers.json').careers, specializations: C('specializations.json').specializations,
    talents: view(['eote-v1', 'aor-v1']), skillSheetKeys: {}, skillChars: {}, skillNames: {} };
  vocab.forEach((e) => { cb.skillSheetKeys[e.id] = (e.aliases || []).find((a) => /^[A-Z]+$/.test(a)) || e.id; cb.skillNames[e.id] = e.label; if (e.characteristic) cb.skillChars[e.id] = e.characteristic; });
  sb._canonicalCharbuild = cb;
  const sheet = JSON.parse(JSON.stringify(J('public/data/pregen_sheets.json').characters.find((c) => c.name === 'Tarak Nol')));
  sheet.talents = [{ id: 'respec_savy', rank: 1 }, { id: 'respec_savvy', rank: 1 }]; sheet.mods = ['respecialized@eote-v1', 'respecialized@aor-v1'];
  const base = sb.SWRPGSheetPool.charPool({ id: 'b1021', sheetData: Object.assign({}, sheet, { talents: [] }) }, 'charm', 0);
  const pool = sb.SWRPGSheetPool.charPool({ id: 'b1021', sheetData: sheet }, 'charm', 0);
  check('(4) non-vacuity: Tarak Nol\'s Charm with no talents has no Boost', base && !base.boost, base);
  check('(4) the dice are untouched: Charm = the same green and yellow + 2 Boost (each id\'s own pool_mods)',
    pool && base && pool.boost === 2 && pool.ability === base.ability && pool.proficiency === base.proficiency, { base, pool }); }

{ const app = read('player/app.jsx'), gm = read('gm/app.jsx'), gmHtml = read('gm/index.html');
  const fn = app.slice(app.indexOf('function sheetTalentsForDisplay('), app.indexOf('function sheetTalentsForDisplay(') + 900);
  check('(5) the player: sheetTalentsForDisplay reads CharResolve.resolveSheetTalents', /CharResolve\.resolveSheetTalents\(/.test(fn));
  check('(5) the GM loads the same lib/shared/charResolve.js', /<script[^>]+lib\/shared\/charResolve\.js/.test(gmHtml));
  check('(5) the GM draws no talent rows of its own (no resolveTalentEntry, no sheetTalentsForDisplay, no second reader of same_as)',
    !/resolveTalentEntry|sheetTalentsForDisplay|same_as/.test(gm));
  const readers = ['lib/shared', 'player', 'gm'].flatMap((d) => fs.readdirSync(path.join(ROOT, d)).filter((f) => /\.(js|jsx)$/.test(f) && !/^(app|vendor)\.js$/.test(f) && !/\.min\.js$/.test(f))
    .map((f) => d + '/' + f)).filter((p) => /\.same_as\b/.test(read(p)));
  check('(5) ONE reader: `.same_as` is read in lib/shared/charResolve.js only', readers.length === 1 && readers[0] === 'lib/shared/charResolve.js', readers); }

{ const r = rows(['eote-v1', 'aor-v2'], ['respec_blat', 'respec_blather']);
  check('(6) Blather: respec_blat + respec_blather read one row, unranked (no count)',
    r.length === 1 && r[0].name === 'Blather' && r[0].rank === 1 && r[0].ranked === false, brief(r)); }
{ const r = rows(['eote-v1'], ['gearhead', 'respec_gearhd']);
  check('(7) Gearhead: gearhead + respec_gearhd read one row, rank 2', r.length === 1 && r[0].name === 'Gearhead' && r[0].rank === 2, brief(r)); }

{ const PV = require(path.join(ROOT, 'lib/shared/packValidate.js'));
  const V = PV.create(PV.readSchemaDir(path.join(ROOT, 'schema')));
  const base = {}; for (const sec of PV.APPLIED_SECTIONS) base[sec] = J('public/data/canonical/' + sec + '.json')[sec];
  const vocabIds = (f) => J('public/data/canonical/' + f).entries.map((e) => e.id);
  const ctx = { base, vocab: { skills: vocabIds('skills.vocab.json'), qualities: vocabIds('qualities.vocab.json') } };
  const ID = 'custom_my_data_smooth_talker';
  const rec = { _mode: 'add', id: ID, name: 'Smooth Talker', description: 'Add [BO] to Deception checks.', ranked: true, activation: 'passive', sources: [], same_as: 'savvy' };
  const pack = { formatVersion: 1, packId: 'my_data', name: 'My Data', _provenance: 'custom', sections: { talents: { [ID]: rec } } };
  const res = V.load(pack, ctx), got = res.applied.talents && res.applied.talents[ID];
  check('(8) packValidate.load applies the user talent WITHOUT `same_as`', !!got && !('same_as' in got), got);
  check('(8) …and lists it `generator-only:same_as` on its _unapplied', res.unapplied.some((u) => u.id === ID && u.reason === 'generator-only:same_as'), res.unapplied);
  check('(8) the stored pack is byte-faithful (the key pruned from the applied copy only)', res.stored === pack && pack.sections.talents[ID].same_as === 'savvy');
  const a = V.authoring(pack, ctx);
  check('(8) authoring refuses `same_as` on a user talent', !a.ok && a.reasons.some((r) => /same_as: stamped by the reSpecialized emitter, never authored/.test(r)), a.reasons);
  const v = Object.assign(view(['eote-v2', 'aor-v2']), { [ID]: got });
  const r = CR.resolveSheetTalents([{ id: 'savvy', rank: 1 }, { id: ID, rank: 1 }], v, (x) => x);
  check('(8) the user talent reads as its OWN row beside Savvy', r.length === 2 && r[0].name === 'Savvy' && r[0].rank === 1 && r[1].id === ID, brief(r));
  const shipped = pack ? J('public/data/mods/respecialized/aor-v1/talents.overlay.json').talents.respec_savvy : null;
  check('(8) the shipped stamps are kept: aor-v1 respec_savvy.same_as is "savvy"', shipped && shipped.same_as === 'savvy', shipped && shipped.same_as); }

console.log('\nb1021_same_as_fold: ' + pass + ' PASS · ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
