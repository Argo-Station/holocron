#!/usr/bin/env node
/* store_worn_inline_suit.cjs — a WORN `{_inline}` suit survives a store armour purchase (ruling
 * `release-r5-crafting-kp-c0` D1; card `release-r5-crafting-kp`).
 *
 * `equipment.armor` is the worn suit, singular (R-ASS-1). The store's ONE write (`buildNextEquipment`) puts a bought
 * suit ON only when nothing is worn, and otherwise writes it to the pack. "Nothing worn" was read as `!eq.armor.id`, so a
 * worn suit with no id — a crafted suit put on with WEAR, a homebrew copy (B-1161) — read as nothing worn, and the
 * purchase wrote the bought suit OVER it: the worn suit was lost and nothing reached the pack.
 *
 *   W1  a worn {_inline} suit + one armour bought → the inline suit is still worn (same record), the bought suit is a
 *       pack entry carrying its bare id, and the write's own summary says a suit was already worn (wasWorn, packed 1).
 *   W2  control: a worn catalogue {id} suit behaves exactly the same way (unchanged).
 *   W3  control: nothing worn → the bought suit goes on (unchanged).
 *
 * RED AT BASE: at the lap's cut (`9f855c0a5`) W1 fails — `next.armor` is the bought suit.
 * Reads the BUILT bundle (lib/store/view.js): run `npm run build` first (PRAXIS §1).
 *
 * Run: node test/store_worn_inline_suit.cjs → exit 0 when every leg holds.
 */
'use strict';
global.window = {};
global.React = {
  createElement: function () { return null; },
  Fragment: 'fragment',
  useState: function (v) { return [typeof v === 'function' ? v() : v, function () {}]; },
  useEffect: function () {}, useRef: function () { return { current: null }; },
  useMemo: function (f) { return f(); }, useCallback: function (f) { return f; },
};
require('../lib/store/glyphs.js');
require('../lib/store/rarity.js');
require('../lib/store/view.js');
const S = global.window.SWRPGStore;

let failures = 0;
const check = (label, cond, detail) => {
  if (cond) console.log('  PASS  ' + label);
  else { failures += 1; console.error('  FAIL  ' + label + (detail !== undefined ? '  — ' + JSON.stringify(detail) : '')); }
};

const SUIT = { name: 'Combat Armor', soak: 2, defense: 0, encumbrance: 4, hardpoints: 3, built_with: ['extra_soak'], _provenance: 'custom' };
const BUY = [{ itemId: 'padded_armor', section: 'armor', qty: 1, priceEach: 500 }];

// W1
const eq1 = { weapons: [], armor: { _inline: JSON.parse(JSON.stringify(SUIT)), state: 'worn' }, gear: [], credits: 1000 };
const r1 = S.buildNextEquipment(eq1, BUY);
const n1 = r1.next || {};
check('W1 the worn inline suit is still worn', !!(n1.armor && n1.armor._inline && n1.armor._inline.name === 'Combat Armor' && n1.armor.state === 'worn'), n1.armor);
check('W1 its record is unchanged (built_with rides)', !!(n1.armor && n1.armor._inline && JSON.stringify(n1.armor._inline.built_with) === '["extra_soak"]'));
check('W1 the bought suit is in the pack by its bare id', (n1.gear || []).some(function (g) { return g && g.id === 'padded_armor' && !g._inline; }), n1.gear);
check('W1 the write says a suit was worn and one went to the pack', !!(r1.armor && r1.armor.wasWorn === true && r1.armor.worn === 0 && r1.armor.packed === 1), r1.armor);

// W2
const eq2 = { weapons: [], armor: { id: 'heavy_clothing', state: 'worn' }, gear: [], credits: 1000 };
const n2 = S.buildNextEquipment(eq2, BUY).next || {};
check('W2 control: a worn catalogue suit stays worn, the bought one is packed', !!(n2.armor && n2.armor.id === 'heavy_clothing') && (n2.gear || []).some(function (g) { return g && g.id === 'padded_armor'; }), n2);

// W3
const eq3 = { weapons: [], armor: null, gear: [], credits: 1000 };
const n3 = S.buildNextEquipment(eq3, BUY).next || {};
check('W3 control: nothing worn → the bought suit goes on', !!(n3.armor && n3.armor.id === 'padded_armor' && n3.armor.state === 'worn'), n3.armor);

console.log(failures ? '\nstore_worn_inline_suit: ' + failures + ' FAILED' : '\nstore_worn_inline_suit: all legs hold');
process.exit(failures ? 1 : 0);
