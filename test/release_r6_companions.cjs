#!/usr/bin/env node
/**
 * release_r6_companions.cjs — R6 lane B (card `release-r6-backend` §4): the companion store and the two transforms.
 *
 * WRITTEN FROM THE RULING TEXT: `release-r4-shapes` S1's save shape (exactly one of ref/own; unknown fields kept;
 * resolve at render) and its RAW lines, re-read by the rules oracle at this lap's cut:
 *   young  FaD Core p.415 — silhouette −1 (min 0); wound threshold, strain threshold (if any) and weapon damage
 *          halved, rounded UP; nothing else changes.
 *   mount  Stay on Target pp.80-81 / Savage Spirits pp.71-72 — silhouette 2 unless stated; speed ⌈Ag ÷ 2⌉ (a flyer:
 *          Ag in the air, 1 on the ground); handling = Ag − silhouette − Will.
 *
 *   C1  the normalizer: ref XOR own, the keep idiom, mount.trained 0..2, ids minted and de-duplicated.
 *   C2  YOUNG pinned at printed values on the library's own rows: Kaaten wounds 12 → 6 (the R4 drawing's number),
 *       Loth-Cat 6 → 3, silhouette 0 stays 0 and an unstated 1 → 0, Claws 7 → 4, Teeth and claws 4 → 2;
 *       soak, defence, characteristics untouched; strain null stays null.
 *   C3  MOUNT pinned: Varactyl (Ag 5, Will 1, Silhouette 2) → speed 3, handling 2; a profile with no silhouette → 2;
 *       a Flyer's air speed = Ag, ground 1.
 *   C4  ONE transform each: no other source file defines youngOf / mountOf, or halves a creature's wounds.
 *   C5  resolve at render: profileOf never writes the stored row; the stored row holds only S1's fields (+ kept ones).
 *
 * BITE (PRAXIS §6, read by EXIT CODE): R6C_MOD points the guard at a mutant COPY of lib/shared/companions.js.
 *
 * Run: node test/release_r6_companions.cjs
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const MOD = process.env.R6C_MOD || path.join(root, 'lib/shared/companions.js');
const C = require(MOD);
let failures = 0;
function check(label, cond, detail) {
  if (cond) console.log('  PASS  ' + label);
  else { failures += 1; console.error('  FAIL  ' + label + (detail !== undefined ? '  — ' + JSON.stringify(detail).slice(0, 400) : '')); }
}
const npcs = JSON.parse(fs.readFileSync(path.join(root, 'public/data/canonical/npcs.json'), 'utf8')).npcs;
const S1 = ['id', 'ref', 'own', 'name', 'young', 'mount', 'wounds', 'strain', 'crits'];

// ── C1 ──
check('C1 a row with neither ref nor own is dropped', C.normalizeCompanions([{ name: 'x' }]).length === 0);
check('C1 a row with both ref and own is dropped', C.normalizeCompanions([{ ref: 'kaaten', own: { name: 'k' } }]).length === 0);
const n1 = C.normalizeCompanions([{ ref: 'kaaten', future: { a: 1 }, mount: { trained: 7, seat: 'x' } }])[0];
check('C1 the keep idiom: an unknown field survives at row and mount level', n1 && n1.future && n1.future.a === 1 && n1.mount.seat === 'x', n1);
check('C1 mount.trained clamps to 0..2', n1 && n1.mount.trained === 2, n1 && n1.mount);
check('C1 defaults: name "", young false, wounds/strain 0, crits []', n1 && n1.name === '' && n1.young === false
  && n1.wounds === 0 && n1.strain === 0 && Array.isArray(n1.crits) && n1.crits.length === 0, n1);
check('C1 an id is minted as cmp-<base36>', n1 && /^cmp-[a-z0-9]+$/.test(n1.id), n1 && n1.id);
check('C1 two rows sharing an id keep the first', C.normalizeCompanions([{ id: 'cmp-a', ref: 'kaaten' }, { id: 'cmp-a', ref: 'lothcat' }]).map((c) => c.ref).join() === 'kaaten');
const added = C.addCompanion([], { ref: 'lothcat', young: true });
check('C1 addCompanion appends a normalized row with a fresh id', added.length === 1 && added[0].young === true && /^cmp-/.test(added[0].id));
let threw = false; try { C.addCompanion([], { name: 'nobody' }); } catch (e) { threw = true; }
check('C1 addCompanion refuses a row with neither ref nor own (LOUD at write)', threw);
const upd = C.updateCompanion(added, added[0].id, { wounds: 3, id: 'cmp-hijack' });
check('C1 updateCompanion patches by id and never changes the id', upd[0].wounds === 3 && upd[0].id === added[0].id);
check('C1 removeCompanion removes by id', C.removeCompanion(upd, added[0].id).length === 0);

// ── C2 — young ──
const yk = C.youngOf(npcs.kaaten).record;
check('C2 Kaaten wounds 12 → 6 (FaD Core p.415, round up; the R4 drawing\'s number)', npcs.kaaten.derived.wounds === 12 && yk.derived.wounds === 6, yk.derived);
check('C2 Kaaten (silhouette unstated, 1) → Silhouette 0', C.statedSilhouette(yk) === 0, yk.abilities);
check('C2 Kaaten Claws 7 → 4 (half, round up)', yk.weapons[0].damage.value === 4 && yk.weapons[0].damage.base === 'flat', yk.weapons[0].damage);
check('C2 soak, defence and characteristics unchanged', yk.derived.soak === 5 && yk.derived.melee_defense === 0
  && JSON.stringify(yk.characteristics) === JSON.stringify(npcs.kaaten.characteristics));
check('C2 strain null stays null (no strain threshold to halve)', yk.derived.strain === null);
const yl = C.youngOf(npcs.lothcat).record;
check('C2 Loth-Cat wounds 6 → 3, Silhouette 0 stays 0 (minimum 0)', yl.derived.wounds === 3 && C.statedSilhouette(yl) === 0, { d: yl.derived, a: yl.abilities });
check('C2 Loth-Cat Teeth and claws 4 → 2', yl.weapons[0].damage.value === 2);
const ys = C.youngOf({ derived: { wounds: 13, strain: 11 }, characteristics: { brawn: 3 }, weapons: [{ name: 'Bite', damage: { value: 2, base: 'brawn' } }] }).record;
check('C2 odd numbers round UP: wounds 13 → 7, strain 11 → 6; Brawn+2 at Brawn 3 = 5 → 3', ys.derived.wounds === 7 && ys.derived.strain === 6 && ys.weapons[0].damage.value === 3, ys);
check('C2 youngOf is pure (the library row is unchanged)', npcs.kaaten.derived.wounds === 12 && npcs.kaaten.weapons[0].damage.value === 7);

// ── C3 — mount ──
const mv = C.mountOf(npcs.varactyl, 1);
check('C3 Varactyl (Ag 5, Will 1, Silhouette 2) → speed 3, handling 2, trained 1', mv.speed === 3 && mv.handling === 2 && mv.silhouette === 2 && mv.trained === 1, mv);
const mk = C.mountOf(npcs.kaaten, 0);
check('C3 no stated silhouette → 2; Kaaten Ag 2 Will 1 → speed 1, handling −1', mk.silhouette === 2 && mk.speed === 1 && mk.handling === -1, mk);
const mf = C.mountOf({ characteristics: { agility: 4, willpower: 2 }, abilities: [{ name: 'Flyer' }, { name: 'Silhouette 3' }] }, 0);
check('C3 a Flyer: speed = Agility (4), ground speed 1; stated Silhouette 3 kept; handling 4−3−2 = −1', mf.flying === true && mf.speed === 4 && mf.groundSpeed === 1 && mf.silhouette === 3 && mf.handling === -1, mf);

// ── C4 — one transform each ──
const SCAN = ['player', 'gm', 'lib', 'dice'];
const second = [];
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); continue; }
    if (!/\.(jsx?|cjs|mjs)$/.test(e.name) || /\.map$/.test(e.name)) continue;
    if (path.resolve(p) === path.join(root, 'lib/shared/companions.js')) continue;
    if (/(^|\/)(app|vendor|view|desktopLayout|[a-zA-Z]+View|holotableCompose|roomSession|treeView)\.js$/.test(p) && fs.existsSync(p + 'x')) continue; // built bundles
    const s = fs.readFileSync(p, 'utf8');
    if (/function\s+(youngOf|mountOf)\s*\(/.test(s) || /juvenile/i.test(s)) second.push(path.relative(root, p));
  }
}
SCAN.forEach((d) => { if (fs.existsSync(path.join(root, d))) walk(path.join(root, d)); });
check('C4 no second young or mount transform in player/ gm/ lib/ dice/', second.length === 0, second);

// ── C5 — resolve at render ──
const row = { id: 'cmp-t1', ref: 'kaaten', name: 'Tibbs', young: true, mount: null, wounds: 2, strain: 0, crits: [] };
const before = JSON.stringify(row);
const pr = C.profileOf(row, npcs);
check('C5 profileOf resolves the ref, applies young, names the row', pr && pr.name === 'Tibbs' && pr.creature === 'Kaaten' && pr.record.derived.wounds === 6, pr && { name: pr.name, w: pr.record.derived });
check('C5 profileOf carries the why-sheet line (12 → 6, young)', pr && pr.because.some((b) => b.field === 'wounds' && b.from === 12 && b.to === 6 && b.source === 'young'));
check('C5 profileOf never writes the stored row', JSON.stringify(row) === before);
const stored = C.normalizeCompanions([row])[0];
// RR-2 (ruling release-r6-companions-npcs C1): `_ogg` is the ONE admitted extra, by name; any other extra field reds.
const S1_PLUS = S1.concat(['_ogg']);
const onlyS1 = (r) => Object.keys(r).every((k) => S1_PLUS.includes(k));
check('C5 the stored row holds only S1\'s fields (plus `_ogg` by name, RR-2)', onlyS1(stored), Object.keys(stored));
const withOgg = C.normalizeCompanions([Object.assign({}, row, { _ogg: { key: 'k', xml: '<Adversary/>', mapped: 'x' } })])[0];
check('C5 RR-2: a row carrying `_ogg` passes; a row carrying any other extra (a display shape) reds',
  onlyS1(withOgg) && !onlyS1(Object.assign({}, withOgg, { profile: { soak: 5 } })), Object.keys(withOgg));
const gone = C.profileOf({ id: 'cmp-g', ref: 'no_such_creature', name: 'Ghost' }, npcs);
check('C5 a ref that no longer resolves is GRACEFUL (missing, named), never thrown', gone && gone.missing === true && gone.name === 'Ghost');
const pm = C.profileOf({ id: 'cmp-m', ref: 'varactyl', mount: { trained: 1 } }, npcs);
check('C5 a mount row resolves its numbers at render (speed 3 · handling 2 · trained 1)', pm && pm.mount && pm.mount.speed === 3 && pm.mount.handling === 2 && pm.mount.trained === 1, pm && pm.mount);

console.log(failures ? '\nFAIL ' + failures : '\nPASS');
process.exit(failures ? 1 : 0);
