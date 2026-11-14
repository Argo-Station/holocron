#!/usr/bin/env node
/* release-r5-crafting-sm C2 + C3 · WHERE A FINISHED THING LANDS, AND WHAT A SCHEMATIC DOES (contract
 * `release-r5-crafting-contract` R-R5CC-2, R-R5CC-3 with ADDENDUM 3; card blind checklist items 4 and 5).
 *
 *   L1  a weapon template's build lands in equipment.weapons as {_inline}; a gear-profile template's in equipment.gear;
 *       nothing else in the equipment moves; the input equipment is not written.
 *   L2  defaultName's siblings are read from the list the item lands in.
 *   S1  the schematic row (flags.schematic) on a FINISHED project adds 1 to that template's level; a second buy makes 2;
 *       a FAILED project buys nothing (ADDENDUM 3); a project without the row changes nothing.
 *   S2  schematicDiff: level 1 lowers that template's check one step, never below Simple (0 dice); a second template
 *       is untouched. craftPoolOf (player/app.jsx) calls it and is the only place the craft pool's difficulty is set.
 *   BITE: a planted landItem that sends every build to weapons reds L1.
 *
 * Run: node test/release_r5_crafting_landing.cjs → exit 0 when every leg holds and the bite bites.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const Craft = require(path.join(ROOT, 'lib/shared/craftStore.js'));
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', f), 'utf8'));
const TPL = J('crafting_templates.json').templates;
const SPEND = J('crafting_spend.json');

let failures = 0;
const check = (label, cond, detail) => {
  if (cond) console.log('  PASS  ' + label);
  else { failures += 1; console.error('  FAIL  ' + label + (detail !== undefined ? '  — ' + JSON.stringify(detail) : '')); }
};

const index = Craft.indexSpend(SPEND, 'brawl_melee');
const vibro = TPL.vibro_weapon;
const GEAR_T = { id: 'planted_gadget', name: 'Planted Gadget', category: 'planted', result_profile: { name: 'Planted Gadget', type: 'Tools', encumbrance: 2, hardpoints: 0 } };
const EQ = { weapons: [{ id: 'blaster_pistol' }], gear: [{ id: 'stimpack', qty: 2 }], armor: { id: 'padded_armor' }, credits: 100 };

function project(templateId, rows, roll) {
  return Object.assign(Craft.newProject(templateId, 'brawl_melee', []), { stage: 'spending', roll: roll || { su: 2 }, improvements: rows || [] });
}

function legsL1(land) {
  const eqBefore = JSON.stringify(EQ);
  const w = land(EQ, { name: 'Vibro-weapon' }, vibro);
  const g = land(EQ, { name: 'Planted Gadget' }, GEAR_T);
  return {
    weapon: w.weapons.length === 2 && w.weapons[1]._inline.name === 'Vibro-weapon' && JSON.stringify(w.gear) === JSON.stringify(EQ.gear),
    gear: g.gear.length === 2 && g.gear[1]._inline.name === 'Planted Gadget' && JSON.stringify(g.weapons) === JSON.stringify(EQ.weapons),
    rest: w.armor === EQ.armor && w.credits === 100 && g.armor === EQ.armor && g.credits === 100,
    pure: JSON.stringify(EQ) === eqBefore,
  };
}
const l1 = legsL1(Craft.landItem);
check('L1 a weapon template lands in equipment.weapons as {_inline}, gear untouched', l1.weapon);
check('L1 a gear-profile template lands in equipment.gear as {_inline}, weapons untouched', l1.gear);
check('L1 armour and credits are carried unchanged', l1.rest);
check('L1 the input equipment is not written', l1.pure);
check('L1 outputOf: weapon / gear read off the profile', Craft.outputOf(vibro) === 'weapon' && Craft.outputOf(GEAR_T) === 'gear');

const eqNames = { weapons: [{ _inline: { name: 'Vibro-weapon' } }], gear: [{ _inline: { name: 'Planted Gadget' } }] };
check('L2 siblings come from the list the item lands in',
  Craft.defaultName(vibro, Craft.siblingNames(eqNames, vibro)) === 'Vibro-weapon 2'
  && Craft.defaultName(GEAR_T, Craft.siblingNames(eqNames, GEAR_T)) === 'Planted Gadget 2'
  && Craft.defaultName(GEAR_T, Craft.siblingNames({ weapons: eqNames.weapons }, GEAR_T)) === 'Planted Gadget');

// S1
const schemId = require(path.join(ROOT, 'lib/shared/crafting.js')).schematicRowId(index);
check('S1 the melee category\'s schematic row is found by flags.schematic', schemId === 'schematic', schemId);
const once = Craft.schematicPatch(project('vibro_weapon', [schemId]), index, []);
check('S1 a finished project with the row: vibro_weapon level 1', JSON.stringify(once) === JSON.stringify([{ template_id: 'vibro_weapon', level: 1 }]), once);
const twice = Craft.schematicPatch(project('vibro_weapon', [schemId]), index, once);
check('S1 a second buy: level 2, one entry', JSON.stringify(twice) === JSON.stringify([{ template_id: 'vibro_weapon', level: 2 }]), twice);
check('S1 a FAILED project buys nothing', Craft.schematicPatch(project('vibro_weapon', [schemId], { fa: 2 }), index, []) === null);
check('S1 a project without the row changes nothing', Craft.schematicPatch(project('vibro_weapon', ['destructive']), index, once) === null);
check('S1 the input list is not written', JSON.stringify(once) === JSON.stringify([{ template_id: 'vibro_weapon', level: 1 }]));

// S2
const S = [{ template_id: 'vibro_weapon', level: 1 }];
check('S2 level 1 lowers that template\'s check one step (Average 2 → 1)', Craft.schematicDiff(2, S, 'vibro_weapon') === 1);
check('S2 a second template is untouched', Craft.schematicDiff(2, S, 'bladed_weapon') === 2);
check('S2 never below Simple (Easy 1, level 3 → 0)', Craft.schematicDiff(1, [{ template_id: 'fist_weapon', level: 3 }], 'fist_weapon') === 0);
check('S2 no schematics → the printed difficulty', Craft.schematicDiff(3, undefined, 'vibro_weapon') === 3);
const app = fs.readFileSync(path.join(ROOT, 'player/app.jsx'), 'utf8');
const callers = (app.match(/SWRPGCraft\.schematicDiff\(/g) || []).length;
const poolFn = app.slice(app.indexOf('function craftPoolOf('), app.indexOf('function CraftWorkshop('));
check('S2 craftPoolOf calls schematicDiff, and nothing else in the app does', callers === 1 && /SWRPGCraft\.schematicDiff\(diff, sheet\.craft_schematics, t\.id\)/.test(poolFn), { callers });

// BITE
const planted = (eq, rec) => Object.assign({}, eq, { weapons: (eq.weapons || []).concat([{ _inline: rec }]) });
const bit = legsL1(planted);
if (!bit.gear) console.log('  PASS  BITE: a landItem that sends every build to weapons reds L1');
else { failures += 1; console.error('  FAIL  BITE: a planted all-weapons landItem passed L1'); }

console.log(failures ? '\nFAILED: ' + failures : '\nOK');
process.exit(failures ? 1 : 0);
