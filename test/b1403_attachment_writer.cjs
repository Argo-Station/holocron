/* test/b1403_attachment_writer.cjs — B-1403 (card `b1403-store-attachments-card` R-B1403-6/-7, ACCEPTANCE (1)): THE ONE
 * ATTACHMENT WRITER.
 *
 * `ItemResolve.writeAttachment(equipment, host, op)` is the only code that writes an item's `attachments[]`, on both hosts:
 * the store's FINALIZE and the sheet's six writers (MODIFY's install/uninstall; LoadoutItemDetail's add/remove/toggle-mod).
 * It returns the NEXT equipment, or the SAME object when nothing is written (a refused fit, HP over capacity, a bad index),
 * so a caller tells "written" by identity.
 *
 *   §A  attach: a weapon, an armour, a gear host each gain exactly `{ id, mods: [] }` (R-B1403-6: no new save shape);
 *       nothing else in the equipment moves; `gear[]` never gains an attachment.
 *   §B  refusals write nothing, under the FIT check (FINALIZE, MODIFY's install): `attachmentFit`'s refusal (the sight on the
 *       Vibroknife), a refused kind, HP over capacity, a second copy already fitted (R-B1403-16); an unknown attachment id.
 *   §R  the ROOM check (the pack's Add attachment, ruling `b1403-store-attachments-owns` R-B1403-13 (iii)): today's arithmetic
 *       only — an armour part attaches to a rifle with HP to spare, a duplicate is allowed, HP over capacity writes nothing.
 *   §C  detach and toggle-mod.
 *   §D  STRUCTURAL: no write to `attachments` in player/app.jsx or lib/store/view.jsx outside the helper's call sites;
 *       each of the six writers reaches the helper by name (the five sheet writers; the store's FINALIZE).
 *   §G  GEAR HOSTS (card ADDENDUM 4, R-B1403-19; D-285): on the store kernel compiled from SOURCE (esbuild, in-process), GOES
 *       ON (`partHostsFor`) lists a gear-type part ONLY on gear with hard points, by attachmentFit's verdict; a weapon-type
 *       part lists no gear; and FINALIZE (`buildNextEquipment`) fits it onto the gear host through the one writer.
 *
 * Mutants (ACCEPTANCE (1) as re-pointed by R-B1403-14): a second writer reintroduced (§D reds); the fit check dropped inside
 * the helper (§B reds); GOES ON's gear branch dropped (§G reds). Bitten at the gate.
 * Run: node test/b1403_attachment_writer.cjs   (exit 1 on any FAIL)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const IR = require(path.join(ROOT, 'lib', 'shared', 'itemResolve.js'));
const DATA = path.join(ROOT, 'public', 'data', 'canonical');
const reg = (n) => JSON.parse(fs.readFileSync(path.join(DATA, n + '.json'), 'utf8'))[n];
const ATT = reg('attachments'), WPN = reg('weapons'), ARM = reg('armor'), GEAR = reg('gear');

let ok = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { ok++; console.log('PASS  ' + label); }
  else { fail++; console.log('FAIL  ' + label + (detail !== undefined ? '  — ' + JSON.stringify(detail) : '')); }
}

const W = IR.writeAttachment;
check('ItemResolve exports writeAttachment', typeof W === 'function');
if (typeof W !== 'function') { console.log('\n' + ok + ' passed, ' + (fail) + ' failed'); process.exit(1); }

const SIGHT = 'telescopic_optical_sight';
const eq0 = () => ({
  weapons: [{ id: 'blaster_rifle' }, { id: 'vibroknife' }],
  armor: { id: 'a_kt_tracker_utility_vest' },
  gear: [{ id: 'military_modular_backpack_frame', qty: 1 }, { id: 'stimpack', qty: 2 }],
  credits: 400,
});
const attach = (id, record, extra) => Object.assign({ op: 'attach', check: 'fit', id: id, registry: ATT, record: record }, extra || {});
const room = (id, record) => attach(id, record, { check: 'room' });

// ── §A attach ──────────────────────────────────────────────────────────────────────────────────────────────────────
let eq = eq0();
let next = W(eq, { kind: 'weapon', idx: 0 }, attach(SIGHT, WPN.blaster_rifle));
check('§A weapon: the rifle gains exactly { id, mods: [] }', next !== eq && JSON.stringify(next.weapons[0].attachments) === JSON.stringify([{ id: SIGHT, mods: [] }]), next.weapons && next.weapons[0]);
check('§A weapon: the other weapon, armour, gear and credits are untouched',
  next.weapons[1] === eq.weapons[1] && next.armor === eq.armor && next.gear === eq.gear && next.credits === 400);
check('§A weapon: the input equipment is not mutated', eq.weapons[0].attachments === undefined);

const armAtt = Object.keys(ATT).find((k) => ATT[k].type === 'armor' && ATT[k].hp === 1 && !ATT[k].constraints);
next = W(eq, { kind: 'armor', idx: 0 }, attach(armAtt, ARM.a_kt_tracker_utility_vest));
check('§A armour: the vest gains { id, mods: [] } (' + armAtt + ')', next !== eq && JSON.stringify(next.armor.attachments) === JSON.stringify([{ id: armAtt, mods: [] }]) && next.armor.id === eq.armor.id, next.armor);

next = W(eq, { kind: 'gear', idx: 0 }, attach('comms_unit', GEAR.military_modular_backpack_frame));
check('§A gear: the backpack frame gains { id, mods: [] }', next !== eq && JSON.stringify(next.gear[0].attachments) === JSON.stringify([{ id: 'comms_unit', mods: [] }]) && next.gear[0].qty === 1, next.gear && next.gear[0]);
check('§A gear: gear[] keeps its length (an attachment is never a gear entry)', next.gear.length === eq.gear.length);

const two = W(W(eq, { kind: 'weapon', idx: 0 }, attach(SIGHT, WPN.blaster_rifle)), { kind: 'weapon', idx: 0 }, attach('gene_lock', WPN.blaster_rifle));
check('§A a second attach appends after the first', two.weapons[0].attachments.map((a) => a.id).join(',') === SIGHT + ',gene_lock', two.weapons[0].attachments);

// ── §B refusals write nothing ──────────────────────────────────────────────────────────────────────────────────────
next = W(eq, { kind: 'weapon', idx: 1 }, attach(SIGHT, WPN.vibroknife));
check('§B a refused fit (the sight on the Vibroknife: "Ranged only") writes nothing', next === eq);
check('§B …and attachmentFit is what refused it', IR.attachmentFit(WPN.vibroknife, ATT[SIGHT], { kind: 'weapon' }).reasons.join('; ') === 'Ranged only');
next = W(eq, { kind: 'weapon', idx: 0 }, attach(armAtt, WPN.blaster_rifle));
check('§B a refused kind (an armour attachment on the rifle) writes nothing', next === eq);
const full = { weapons: [{ id: 'blaster_rifle', attachments: [{ id: 'augmented_spin_barrel', mods: [] }, { id: 'gene_lock', mods: [] }, { id: SIGHT, mods: [] }] }] };
// the rifle has 4 HP: 2 + 1 + 1 used; a 2-HP part is over capacity
const twoHp = 'scanner_proof_hardware';   // 2 HP, unconstrained
next = W(full, { kind: 'weapon', idx: 0 }, attach(twoHp, WPN.blaster_rifle));
check('§B HP over capacity (4 HP, 4 used, a 2-HP part: ' + twoHp + ') writes nothing', next === full);
const three = { weapons: [{ id: 'blaster_rifle', attachments: [{ id: 'augmented_spin_barrel', mods: [] }, { id: 'gene_lock', mods: [] }] }] };
next = W(three, { kind: 'weapon', idx: 0 }, attach(SIGHT, WPN.blaster_rifle));
check('§B HP exactly at capacity after the write (3 used + 1 = 4) writes', next !== three && next.weapons[0].attachments.length === 3);
const oneSight = { weapons: [{ id: 'blaster_rifle', attachments: [{ id: SIGHT, mods: [] }] }] };
next = W(oneSight, { kind: 'weapon', idx: 0 }, attach(SIGHT, WPN.blaster_rifle));
check('§B a second copy of a fitted part (fit check, R-B1403-16) writes nothing', next === oneSight);
check('§B …refused by attachmentFit\'s own "already fitted" leg (the verdict GOES ON reads)',
  IR.attachmentFit(WPN.blaster_rifle, ATT[SIGHT], { kind: 'weapon', installed: [SIGHT] }).reasons.join('; ') === 'already fitted');
check('§B …and attachmentFit without `installed` is unchanged (MODIFY\'s list passes none)',
  IR.attachmentFit(WPN.blaster_rifle, ATT[SIGHT], { kind: 'weapon' }).fits === true);
check('§B a check left unnamed is the FIT check', W(eq, { kind: 'weapon', idx: 1 }, { op: 'attach', id: SIGHT, registry: ATT, record: WPN.vibroknife }) === eq);
next = W(eq, { kind: 'weapon', idx: 0 }, attach('no_such_attachment', WPN.blaster_rifle));
check('§B an unknown attachment id writes nothing', next === eq);
next = W(eq, { kind: 'weapon', idx: 7 }, attach(SIGHT, WPN.blaster_rifle));
check('§B a host index with no item writes nothing', next === eq);

// ── §R the room check: today's pack add ────────────────────────────────────────────────────────────────────────────
next = W(eq, { kind: 'weapon', idx: 0 }, room(armAtt, WPN.blaster_rifle));
check('§R an armour part attaches to the rifle with HP to spare (today\'s pack add, pinned)', next !== eq && next.weapons[0].attachments[0].id === armAtt, next.weapons && next.weapons[0]);
next = W(eq, { kind: 'weapon', idx: 1 }, room(SIGHT, WPN.vibroknife));
check('§R the sight goes on the Vibroknife under the room check (no limits)', next !== eq && next.weapons[1].attachments.length === 1);
next = W(oneSight, { kind: 'weapon', idx: 0 }, room(SIGHT, WPN.blaster_rifle));
check('§R a duplicate is allowed under the room check', next !== oneSight && next.weapons[0].attachments.length === 2);
check('§R HP over capacity writes nothing under the room check', W(full, { kind: 'weapon', idx: 0 }, room(twoHp, WPN.blaster_rifle)) === full);
const uncosted = Object.keys(ATT).find((k) => ATT[k].type === 'weapon' && ATT[k].hp == null && !ATT[k].constraints);
check('§R an unknown cost counts 1 under the room check (' + uncosted + ' onto a full rifle writes nothing)', !uncosted || W(full, { kind: 'weapon', idx: 0 }, room(uncosted, WPN.blaster_rifle)) === full);

// ── §C detach and toggle-mod ───────────────────────────────────────────────────────────────────────────────────────
const fitted = { weapons: [{ id: 'blaster_rifle', attachments: [{ id: SIGHT, mods: [] }, { id: 'gene_lock', mods: [] }] }], credits: 5 };
next = W(fitted, { kind: 'weapon', idx: 0 }, { op: 'detach', index: 0 });
check('§C detach removes the indexed entry only', next !== fitted && JSON.stringify(next.weapons[0].attachments) === JSON.stringify([{ id: 'gene_lock', mods: [] }]) && next.credits === 5, next.weapons[0]);
check('§C detach out of range writes nothing', W(fitted, { kind: 'weapon', idx: 0 }, { op: 'detach', index: 9 }) === fitted);
next = W(fitted, { kind: 'weapon', idx: 0 }, { op: 'toggle-mod', index: 1, mod: 'm1' });
check('§C toggle-mod adds the key', next !== fitted && JSON.stringify(next.weapons[0].attachments[1]) === JSON.stringify({ id: 'gene_lock', mods: ['m1'] }), next.weapons[0].attachments);
next = W(next, { kind: 'weapon', idx: 0 }, { op: 'toggle-mod', index: 1, mod: 'm1' });
check('§C toggle-mod again removes it', JSON.stringify(next.weapons[0].attachments[1]) === JSON.stringify({ id: 'gene_lock', mods: [] }));
const legacy = { armor: { id: 'x', attachments: ['bare_id'] } };
next = W(legacy, { kind: 'armor', idx: 0 }, { op: 'toggle-mod', index: 0, mod: 'k' });
check('§C toggle-mod on a legacy bare-id entry writes { id, mods }', JSON.stringify(next.armor.attachments[0]) === JSON.stringify({ id: 'bare_id', mods: ['k'] }), next.armor);
check('§C an unknown op writes nothing', W(fitted, { kind: 'weapon', idx: 0 }, { op: 'paint' }) === fitted);

// ── §M D1's count (release-r5-f1, R-R5A-1): mod-add pushes one entry of the key, held at the printed count; mod-drop removes one ──
const spin = { weapons: [{ id: 'blaster_rifle', attachments: [{ id: 'augmented_spin_barrel', mods: [] }] }] };
const add = (eq, mod) => W(eq, { kind: 'weapon', idx: 0 }, { op: 'mod-add', index: 0, mod: mod, registry: ATT });
const drop = (eq, mod) => W(eq, { kind: 'weapon', idx: 0 }, { op: 'mod-drop', index: 0, mod: mod });
const twice = add(add(spin, 'mod_0'), 'mod_0');
check('§M mod-add twice writes two entries of a rank-2 option', JSON.stringify(twice.weapons[0].attachments[0].mods) === JSON.stringify(['mod_0', 'mod_0']), twice.weapons[0]);
check('§M BITE: a third mod-add at the printed count (2) writes nothing', add(twice, 'mod_0') === twice);
check('§M an unranked option is held at 1', add(add(spin, 'mod_1'), 'mod_1').weapons[0].attachments[0].mods.length === 1);
check('§M a key with no option writes nothing', add(spin, 'mod_9') === spin);
const mixed = add(add(twice, 'mod_2'), 'mod_0');
const back = drop(add(twice, 'mod_2'), 'mod_0');
check('§M mod-drop removes the key\'s LAST entry only', JSON.stringify(back.weapons[0].attachments[0].mods) === JSON.stringify(['mod_0', 'mod_2']), back.weapons[0]);
check('§M mod-drop of an absent key writes nothing', drop(spin, 'mod_0') === spin && mixed !== null);

// ── §D STRUCTURAL: one writer ──────────────────────────────────────────────────────────────────────────────────────
// Reads of `attachments` that are NOT writes, allowed by their own text: the resolve ctx (attLoad.by / attById) and
// MODIFY's preview (installed + the focused candidate, never persisted).
const ALLOW = [/attachments:\s*attLoad\.by/, /attachments:\s*attById/, /var pending = focused \? installed\.concat/];
function scan(rel) {
  const lines = fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n');
  const bad = [];
  lines.forEach((ln, i) => {
    const code = ln.replace(/\/\/.*$/, '');
    if (ALLOW.some((re) => re.test(code))) return;
    // string literals emptied first: the catalog's SECTION is named 'attachments' too (its key prefix, its tab title), and
    // a section name is not an item write; `bySection.attachments` is the catalog's own shelf array, never an item's
    const bare = code.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, "''");
    if (/(^|[^.\w])attachments\s*:(?!\s*'')/.test(bare) || /\bnextAtts\b/.test(bare) || /mods:\s*\[\s*\]/.test(bare)
        || /(?<!bySection)\.attachments\s*(\.push|\.splice|=[^=])/.test(bare)) bad.push(rel + ':' + (i + 1) + '  ' + ln.trim().slice(0, 110));
  });
  return { bad: bad, calls: lines.filter((ln) => /\bwriteAttachment\(/.test(ln)).length };
}
const app = scan('player/app.jsx'), view = scan('lib/store/view.jsx');
check('§D player/app.jsx writes attachments[] only through the helper', app.bad.length === 0, app.bad.slice(0, 6));
check('§D lib/store/view.jsx writes attachments[] only through the helper', view.bad.length === 0, view.bad.slice(0, 6));
// the six writers by name (R-B1403-7): each body reaches the helper, directly or through LoadoutItemDetail's `writeAtt`
const APP = fs.readFileSync(path.join(ROOT, 'player', 'app.jsx'), 'utf8');
function body(src, name, from) {
  const at = src.indexOf('function ' + name + '(', from || 0);
  if (at < 0) return null;
  let i = src.indexOf('{', at), depth = 0;
  for (let j = i; j < src.length; j++) { if (src[j] === '{') depth++; else if (src[j] === '}' && --depth === 0) return src.slice(at, j + 1); }
  return null;
}
const LID = APP.indexOf('function LoadoutItemDetail('), GMS = APP.indexOf('function GearModifyStage(');
const writeAttBody = body(APP, 'writeAtt', LID) || '';
check('§D LoadoutItemDetail.writeAtt calls the helper', /IR\.writeAttachment\(/.test(writeAttBody), writeAttBody.slice(0, 80));
// release-r5-f1-c0 L1 RETIRE: the pack's toggleMod is gone; an option's count is MODIFY's modOptions (D1), the same writer
[['addAttachment', LID], ['removeAttachment', LID], ['modOptions', GMS], ['install', GMS], ['uninstall', GMS]].forEach(([name, from]) => {
  const b = body(APP, name, from) || '';
  check('§D ' + name + ' writes through the helper', /writeAttachment\(|writeAtt\(/.test(b), b.slice(0, 90));
});
check('§D lib/store/view.jsx calls the helper at FINALIZE (≥ 1 site)', view.calls >= 1, view.calls);
// R-B1403-14's new structural leg: each caller's CHECK, read by name
const VIEW = fs.readFileSync(path.join(ROOT, 'lib', 'store', 'view.jsx'), 'utf8');
check('§D addAttachment (the pack) attaches under the ROOM check', /check:\s*'room'/.test(body(APP, 'addAttachment', LID) || ''));
check('§D install (MODIFY) attaches under the FIT check', /check:\s*'fit'/.test(body(APP, 'install', GMS) || ''));
const bne = body(VIEW, 'buildNextEquipment') || '';
check('§D FINALIZE (buildNextEquipment) attaches under the FIT check', /writeAttachment\([^)]*\{ op: 'attach', check: 'fit'/.test(bne.replace(/\s+/g, ' ')));
check('§D only the pack names the ROOM check', (APP.match(/check:\s*'room'/g) || []).length === 1 && !/check:\s*'room'/.test(VIEW));

// ── §G GEAR HOSTS (card ADDENDUM 4, R-B1403-19) — the kernel from SOURCE, the shipped registries, the real helper ──────────
(function gearHosts() {
  const vm = require('vm');
  const esbuild = require(path.join(ROOT, 'node_modules', 'esbuild'));
  const SWItems = require(path.join(ROOT, 'lib', 'items.js')).SWItems;
  const REACT = { createElement: () => null, Fragment: 'fragment', useState: (v) => [typeof v === 'function' ? v() : v, () => {}],
                  useEffect: () => {}, useRef: () => ({ current: null }), useMemo: (f) => f(), useCallback: (f) => f };
  let S = null;
  try {
    const win = { ItemResolve: IR, SWItems };
    const ctx = vm.createContext({ window: win, React: REACT, console, Object, Array, JSON, Number, String, Math, Date, Promise, Set, Map,
                                   localStorage: { getItem: () => null, setItem() {} } });
    for (const f of ['lib/store/glyphs.js', 'lib/store/rarity.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx);
    vm.runInContext(esbuild.transformSync(fs.readFileSync(path.join(ROOT, 'lib', 'store', 'view.jsx'), 'utf8'), { loader: 'jsx' }).code, ctx);
    S = win.SWRPGStore;
  } catch (e) { check('§G the store kernel compiles and runs from source', false, String(e)); return; }
  const cat = S.buildCatalog({ weapons: WPN, armor: ARM, gear: GEAR, attachments: ATT });
  const hostsOf = typeof S.partHostsFor === 'function' ? S.partHostsFor : null;
  check('§G the kernel exports partHostsFor (GOES ON\'s rows)', !!hostsOf);
  if (hostsOf) {
    const rows = hostsOf(eq0(), 'comms_unit', cat.regs, cat.keyNames);
    check('§G a gear-type part (Comms Unit) lists ONLY the gear with hard points: gear/0, the backpack frame',
      JSON.stringify(rows.map((r) => r.key)) === JSON.stringify(['gear/0']), rows);
    check('§G …which fits, by attachmentFit\'s verdict: "2 of 2 HP free"', !!rows[0] && rows[0].fits && rows[0].text === '2 of 2 HP free', rows[0]);
    const srows = hostsOf(eq0(), SIGHT, cat.regs, cat.keyNames);
    check('§G a weapon-type part (the sight) lists the two weapons and no gear',
      JSON.stringify(srows.map((r) => r.key)) === JSON.stringify(['weapon/0', 'weapon/1']), srows);
    // R-B1403-20 (card ADDENDUM 5): the 0-HP BOUNDARY. `stimpack` has NO hardpoints field; 150 shipped gear records carry an
    // explicit `hardpoints: 0` (adrenal_implant among them), and those are not hosts either (R-B1403-19)
    check('§G (R-B1403-20) the fixture is real: adrenal_implant carries an explicit hardpoints: 0',
      Object.prototype.hasOwnProperty.call(GEAR.adrenal_implant || {}, 'hardpoints') && GEAR.adrenal_implant.hardpoints === 0, GEAR.adrenal_implant);
    const zero = hostsOf({ gear: [{ id: 'adrenal_implant', qty: 1 }, { id: 'military_modular_backpack_frame', qty: 1 }] }, 'comms_unit', cat.regs, cat.keyNames);
    check('§G (R-B1403-20) gear with an explicit hardpoints: 0 (adrenal_implant) beside the frame: GOES ON lists ONLY the frame (gear/1)',
      JSON.stringify(zero.map((r) => r.key)) === JSON.stringify(['gear/1']), zero);
    const none = hostsOf({ weapons: [{ id: 'blaster_rifle' }], gear: [{ id: 'stimpack', qty: 2 }] }, 'comms_unit', cat.regs, cat.keyNames);
    check('§G with no hard-pointed gear carried, a gear-type part lists no row', none.length === 0, none);
    const fitted = Object.assign(eq0(), { gear: [{ id: 'military_modular_backpack_frame', qty: 1, attachments: [{ id: 'comms_unit', mods: [] }] }] });
    const again = hostsOf(fitted, 'comms_unit', cat.regs, cat.keyNames);
    check('§G the frame already carrying a Comms Unit is REFUSED with the same verdict as the writer ("won’t fit — already fitted")',
      again.length === 1 && !again[0].fits && /already fitted/.test(again[0].text), again);
  }
  // FINALIZE onto the gear host, through the one writer under the fit check
  const line = { itemId: 'attachments:comms_unit', section: 'attachments', qty: 1, priceEach: 500 };
  const parts = { hosts: { 'attachments:comms_unit': 'gear/0' }, regs: cat.regs, keyNames: cat.keyNames };
  const start = Object.assign(eq0(), { credits: 600 });
  const b = S.buildNextEquipment(start, [line], cat.byId, null, null, parts);
  const g = (b && b.next && b.next.gear) || [];
  check('§G FINALIZE fits the Comms Unit onto the frame: exactly [{ id: comms_unit, mods: [] }]',
    !!g[0] && g[0].id === 'military_modular_backpack_frame' && JSON.stringify(g[0].attachments) === JSON.stringify([{ id: 'comms_unit', mods: [] }]), g[0]);
  check('§G …gear[] gains no item, credits 600 → 100, the line is fitted (not kept)',
    g.length === 2 && !g.some((x) => x && x.id === 'comms_unit') && b.next.credits === 100
    && b.parts && b.parts.fitted.length === 1 && b.parts.kept.length === 0, b && { gear: g, credits: b.next.credits, parts: b.parts });
  const b2 = S.buildNextEquipment(start, [Object.assign({}, line, { qty: 1 })], cat.byId, null, null,
    { hosts: { 'attachments:comms_unit': 'weapon/0' }, regs: cat.regs, keyNames: cat.keyNames });
  check('§G a gear-type part forced onto a weapon host is refused by the writer: nothing written, the line kept, nothing charged',
    !(b2.next.weapons[0].attachments || []).length && b2.next.credits === 600 && b2.parts && b2.parts.left['attachments:comms_unit'] === 1, b2 && b2.parts);
})();

console.log('\n' + ok + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
