#!/usr/bin/env node
/**
 * f100_b1189_sets.cjs — B-1189: a crystal (or ingot) SETS the blade's base damage and Critical rating, a barrel moves the
 * weapon's range one band, every set applies before every adjustment, and a hilt's printed crystal modifier is added
 * after the set (ruling `f100-b1189-card` R-B1189-1..12). A sibling of f100_b1185_attachments.cjs (R-B1189-5: "or a
 * sibling, disclosed"), on the same sandbox, so B-1185's legs stay where they are.
 *
 *   SETS THEN ADJUSTMENTS (R-B1189-1)
 *     (s1)  a basic lightsaber with a Dantari crystal fitted (the Ilum swapped out) → 7 / Crit 2, flat (FaD p.196)
 *     (s2)  a crystal on `sabercane_hilt` → flat, never Brawn; Ilum 6 − the cane's 1 = 5 (CotR p.55)
 *     (s3)  an Enhanced XCiter (crit_mod −1) listed BEFORE a Dragite gem (Crit 3) → 2: the crystal's Crit − 1, not the
 *           crystal's Crit overwriting the sharpening (FaD p.197; Special Modifications p.54)
 *     (s3b) the same order on a Krayt dragon pearl (Crit 1) → 1: the floor holds after the set (1 before the fix too, by
 *           construction; bitten by a mutant that drops the floor)
 *     (s4)  two crystals on one hilt (RAW forbids it, FaD p.196): the later set wins and `_attachmentSetConflicts` counts it
 *     (s5)  the gas cartridge's printed set (Special Modifications p.46, "Increase base damage to 5"): Multi-Goo Gun 2 → 5
 *     (s6)  a crystal's own damage option adds AFTER its set: Dantari's "Damage +1" (FaD p.196's 2 Damage +1 Mods)
 *           installed twice → 7 + 2 = 9. RE-POINTED by card `release-r5-attachments` R-R5A-1 (C2): the option's line is
 *           ONE install and N installs are N entries; KEEPS the 9 (two installs), DROPS "one selection holds both" 
 *   THE HILT'S CRYSTAL MODIFIER (R-B1189-7)
 *     (h1)  Dantari in a shoto → 6 (FaD p.177, "reduce the damage of that lightsaber crystal by 1")
 *     (h2)  Dantari in a broadsaber → 8 (Knights of Fate p.43, "increase … by 1")
 *     (h3)  Dantari in a basic hilt → 7 (no modifier)
 *     (h4)  the registry: exactly the seven printed records carry `crystal_damage_mod`, each its printed sign
 *   RANGE (R-B1189-2)
 *     (r1)  a marksman barrel → one band up: Blaster Rifle long → extreme
 *     (r2)  a shortened barrel → one band down: CS-14 Ghost Light short → engaged
 *     (r3)  a shortened barrel at engaged → engaged (the clamp; unmoved before the fix by construction, bitten by a mutant)
 *     (r4)  a balanced barrel on its one host (Special Modifications p.46, "Increases range to short"): Rivet Gun engaged →
 *           short (R-B1189-8(3))
 *   RESOLVE-AT-RENDER
 *     (g1)  a removal: the hilt's own numbers come back, and the registry record is untouched by a resolve (unmoved before
 *           the fix by construction, bitten by a mutant that writes the set into the record)
 *   THE DATA (R-B1189-8, R-B1189-11)
 *     (d1)  `sabercane_hilt.damage` is `{ value: 0, base: 'flat' }` (FaD p.177 Table 5-8; CotR p.55)
 *     (d2)  `training_lightsaber_emitter.crit_set` is 0 (FaD p.200, "critical rating to -")
 *     (d3)  the emitter on a basic hilt → computeWeaponPool's critThreshold is null (no rating in the roll)
 *
 * Run: node test/f100_b1189_sets.cjs
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const J = (f) => JSON.parse(read('public/data/canonical/' + f));
const payload = (o, k) => (o[k] && typeof o[k] === 'object') ? o[k] : o;
const byId = (o) => Array.isArray(o) ? Object.fromEntries(o.map((r) => [r.id, r])) : o;
const S = (x) => JSON.stringify(x);
let pass = 0, fail = 0;
const check = (ok, label, detail) => { if (ok) { pass++; console.log('  PASS  ' + label); } else { fail++; console.log('  FAIL  ' + label + (detail !== undefined ? '  ->  ' + detail : '')); } };

const W = byId(payload(J('weapons.json'), 'weapons')), A = byId(payload(J('armor.json'), 'armor')), G = byId(payload(J('gear.json'), 'gear'));
const ATT = byId(payload(J('attachments.json'), 'attachments'));
const W_BEFORE = S(W);

// the B-1185 sandbox (both hosts load these, in this order), plus the cores computeWeaponPool reads
const sb = { console, JSON, Math, Object, Array, String, Number, Boolean, isFinite, parseInt, parseFloat, RegExp, Date, Map, Set, WeakMap };
sb.window = sb; sb.globalThis = sb; sb.self = sb; sb.addEventListener = function () {}; sb.dispatchEvent = function () {};
vm.createContext(sb);
for (const f of ['lib/items.js', 'lib/shared/itemResolve.js', 'lib/shared/charResolve.js', 'lib/shared/diceEngine.js',
  'lib/shared/effectClass.js', 'lib/shared/poolMods.js', 'lib/shared/sheetPool.js']) {
  sb.module = { exports: {} }; vm.runInContext(read(f), sb, { filename: f });
}
const vocab = J('skills.vocab.json').entries;
const cb = { specializations: payload(J('specializations.json'), 'specializations'), talents: payload(J('talents.json'), 'talents'),
  species: payload(J('species.json'), 'species'), skillSheetKeys: {}, skillChars: {} };
vocab.forEach((e) => { cb.skillSheetKeys[e.id] = (e.aliases || []).find((a) => /^[A-Z]+$/.test(a)) || e.id; if (e.characteristic) cb.skillChars[e.id] = e.characteristic; });
sb._canonicalCharbuild = cb;
sb._canonicalRegistries = { skills: vocab };
sb.SWRPGItemRegistries = { forStampSync: () => ({ weapons: W, armor: A, gear: G, attachments: ATT }) };
sb._qualitiesDb = (() => { const m = {}; (J('qualities.vocab.json').entries || []).forEach((q) => { m[q.label.toLowerCase()] = q; (q.aliases || []).forEach((a) => { m[String(a).toLowerCase()] = q; }); }); return m; })();

// computeWeaponPool, sliced as f100_m8_ops.cjs slices it
const APP = read('player/app.jsx');
// D-507: computeWeaponPool and resolveWeaponSkillKey moved VERBATIM with DiceHub's closure to lib/shared/diceHub.jsx — sliced from there by name
const HUB = read('lib/shared/diceHub.jsx');
function sliceDecl(src, header) {
  const i = src.indexOf(header);
  if (i < 0) throw new Error('SLICE MISS: ' + header + ' — the source moved; fix the slice.');
  let k = header.endsWith('{') ? i + header.length - 1 : src.indexOf('{', i), depth = 0;
  for (; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) { k++; break; } }
  }
  return src.slice(i, k);
}
function sliceBetween(src, from, to) {
  const i = src.indexOf(from), j = src.indexOf(to, i);
  if (i < 0 || j < 0) throw new Error('SLICE MISS: ' + from);
  return src.slice(i, j);
}
vm.runInContext([
  sliceBetween(APP, '// ── BEGIN SHEETPOOL BINDINGS', '// ── END SHEETPOOL BINDINGS'),
  sliceDecl(APP, 'const SKILL_NAMES = {') + ';',
  sliceDecl(HUB, 'function resolveWeaponSkillKey(rawSkill)'),
  sliceDecl(HUB, 'function computeWeaponPool(sheet, weapon, targetBand, derived, accent, resolvedEquipment, taken)'),
].join('\n') + '\nglobalThis.__C = { computeWeaponPool };', sb, { filename: 'app.jsx-slices' });
sb.collectRollNumbers = function () { return []; };
const IR = sb.ItemResolve, C = sb.__C;

const fit = (id, atts) => IR.applyInstalledAttachments('weapon', W[id], atts, ATT);
const at = (id, mods) => ({ id: id, mods: mods || [] });

console.log('B-1189 · A CRYSTAL SETS, A BARREL MOVES, SETS BEFORE ADJUSTMENTS (f100-b1189-card R-B1189-1..12)');

// SETS THEN ADJUSTMENTS
{
  const r = fit('basic_lightsaber', [at('dantari_crystal')]);
  check(r.damage.value === 7 && r.damage.base === 'flat' && r.crit === 2,
    '(s1) basic lightsaber + Dantari crystal → 7 / Crit 2, flat (FaD p.196)', S([r.damage, r.crit]));
}
{
  const r = fit('sabercane_hilt', [at('ilum_crystal')]);
  check(r.damage.base === 'flat' && r.damage.value === 5 && r.crit === 2,
    '(s2) sabercane hilt + Ilum crystal → flat 5 (Ilum 6 − the cane\'s 1), Crit 2, never Brawn (CotR p.55)', S([r.damage, r.crit]));
}
{
  const r = fit('basic_lightsaber', [at('enhanced_xciter'), at('dragite_gem')]);
  check(r.crit === 2, '(s3) Enhanced XCiter listed BEFORE a Dragite gem (Crit 3) → 2: the set first, then the −1', S(r.crit));
  const p = fit('basic_lightsaber', [at('enhanced_xciter'), at('krayt_dragon_pearl')]);
  check(p.crit === 1, '(s3b) Enhanced XCiter before a Krayt dragon pearl (Crit 1) → 1: the floor holds after the set', S(p.crit));
}
{
  const r = fit('basic_lightsaber', [at('ilum_crystal'), at('dantari_crystal')]);
  check(r.damage.value === 7 && r._attachmentSetConflicts === 1,
    '(s4) two crystals on one hilt: the later set wins (7) and _attachmentSetConflicts counts the item (1)', S([r.damage, r._attachmentSetConflicts]));
}
{
  const r = fit('multi_goo_gun', [at('pressurized_gas_cartridge')]);
  check(W.multi_goo_gun.damage.value === 2 && r.damage.value === 5 && r.damage.base === 'flat',
    '(s5) Multi-Goo Gun 2 + Pressurized Gas Cartridge → 5 ("Increase base damage to 5", Special Modifications p.46)', S(r.damage));
}
{
  const opt = (ATT.dantari_crystal.added_mods || []).findIndex((m) => m.effect && m.effect.type === 'damage_delta');
  const r = fit('basic_lightsaber', [at('dantari_crystal', ['mod_' + opt, 'mod_' + opt])]);
  check(opt >= 0 && r.damage.value === 9, '(s6) Dantari + its own "Damage +1" option installed twice → 9: the option adds after the set', S([opt, r.damage]));
}

// THE HILT'S CRYSTAL MODIFIER
{
  const sh = fit('shoto', [at('dantari_crystal')]), br = fit('broadsaber', [at('dantari_crystal')]), bs = fit('basic_lightsaber', [at('dantari_crystal')]);
  check(sh.damage.value === 6, '(h1) Dantari in a shoto → 6 (7 − 1, FaD p.177)', S(sh.damage));
  check(br.damage.value === 8, '(h2) Dantari in a broadsaber → 8 (7 + 1, Knights of Fate p.43)', S(br.damage));
  check(bs.damage.value === 7, '(h3) Dantari in a basic hilt → 7 (no modifier)', S(bs.damage));
  const want = { shoto: -1, guard_shoto: -1, lightfoil: -1, sabercane: -1, sabercane_hilt: -1, broadsaber: 1, great_lightsaber: 1 };
  const have = {}; Object.keys(W).forEach((k) => { if (W[k].crystal_damage_mod != null) have[k] = W[k].crystal_damage_mod; });
  check(S(Object.keys(have).sort().map((k) => [k, have[k]])) === S(Object.keys(want).sort().map((k) => [k, want[k]])),
    '(h4) exactly the seven printed hilts carry crystal_damage_mod, each its printed sign', S(have));
}

// RANGE
{
  const r1 = fit('blaster_rifle', [at('marksman_barrel')]);
  check(W.blaster_rifle.range === 'long' && r1.range === 'extreme', '(r1) Blaster Rifle (long) + marksman barrel → extreme', S(r1.range));
  const r2 = fit('cs14_ghost_light_blaster_pistol', [at('shortened_barrel')]);
  check(W.cs14_ghost_light_blaster_pistol.range === 'short' && r2.range === 'engaged', '(r2) CS-14 (short) + shortened barrel → engaged', S(r2.range));
  const r3 = fit('rivet_gun', [at('shortened_barrel')]);
  check(W.rivet_gun.range === 'engaged' && r3.range === 'engaged', '(r3) Rivet Gun (engaged) + shortened barrel → engaged (clamped)', S(r3.range));
  const r4 = fit('rivet_gun', [at('balanced_barrel')]);
  check(r4.range === 'short', '(r4) Rivet Gun (engaged) + balanced barrel → short ("Increases range to short", Special Modifications p.46)', S(r4.range));
}

// RESOLVE-AT-RENDER
{
  fit('basic_lightsaber', [at('dantari_crystal')]); fit('shoto', [at('kimber_stone')]);
  const back = fit('basic_lightsaber', []);
  check(back.damage.value === 6 && back.crit === 2 && S(W) === W_BEFORE,
    '(g1) a removal: the basic lightsaber reads 6 / Crit 2 again, and no resolve wrote into the registry', S([back.damage, back.crit, S(W) === W_BEFORE]));
}

// THE DATA
{
  check(S(W.sabercane_hilt.damage) === S({ value: 0, base: 'flat' }), '(d1) sabercane_hilt.damage is { value: 0, base: "flat" } (FaD p.177; CotR p.55)', S(W.sabercane_hilt.damage));
  check(ATT.training_lightsaber_emitter.crit_set === 0, '(d2) training_lightsaber_emitter.crit_set is 0 (FaD p.200, "critical rating to -")', S(ATT.training_lightsaber_emitter.crit_set));
  const rec = fit('basic_lightsaber', [at('training_lightsaber_emitter')]);
  const row = sb.SWItems.canonicalToStore(rec, 'weapons');
  const SHEET = { name: 'B-1189', characteristics: { brawn: 2, agility: 3, intellect: 2, cunning: 2, willpower: 3, presence: 2 },
    skills: { LTSABER: 1 }, specializations: [], talents: [], equipment: { weapons: [], armor: null, gear: [] } };
  const pool = C.computeWeaponPool(SHEET, row, 'engaged', {}, '#fff', { weapons: [], armor: null, gear: [] });
  check(rec.crit === 0 && pool.critThreshold === null,
    '(d3) the emitter on a basic hilt → Crit 0, and computeWeaponPool\'s critThreshold is null (no rating in the roll)', S([rec.crit, pool.critThreshold]));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
