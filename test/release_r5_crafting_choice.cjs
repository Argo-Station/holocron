#!/usr/bin/env node
/* release-r5-crafting-sm · THE CRAFTER'S CHOICE (contract `release-r5-crafting-contract` ADDENDUM 4; card blind checklist
 * item 4). A gadget or the implant is built for a CHOSEN General skill, the Appendage for Brawn or Agility; the template's
 * effects hold `{choice}` slots, resolved at build and never persisted.
 *
 *   C1  no slot survives: every template, built with a valid choice (and every applied row of its category), lands a
 *       record with no `{choice}` anywhere in it.
 *   C2  five templates take a choice; construction is not reachable without the choice: buildItem THROWS for a choice template and a project without
 *       one; acquireMaterials, handed the template, refuses; both pass once setChoice has run. A template without a
 *       choice builds and acquires as before.
 *   C3  setChoice refuses what the template does not offer: a skill outside its group (with the vocabulary), a
 *       characteristic outside `among`, any choice on a template that takes none.
 *   C4  `_inline.chosen` is the choice, ids only.
 *   C5  (blind item 4) the Specialist Tool lands in equipment.gear, and its automatic Success reaches a check with the
 *       CHOSEN skill through SWRPGPoolMods.collect / matches (collectPoolMods' assembler), and no other skill's.
 *   C6  the Implant's rank and the Appendage's characteristic reach CharResolve.skillRankInUse / characteristicsInUse with
 *       the chosen skill / characteristic. The Precision Instrument removes two setback dice on the chosen skill.
 *   (post1-switch-deletion, ADDENDUM 638: M12's key is gone; C5's measured key-OFF read and C6's key-OFF legs went with it.)
 *   BITE: a planted crafting.js whose applyTemplateEffects skips the slot resolution reds C1.
 *
 * Run: node test/release_r5_crafting_choice.cjs → exit 0 when every leg holds and the bite bites.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const Craft = require(path.join(ROOT, 'lib/shared/craftStore.js'));
const Crafting = require(path.join(ROOT, 'lib/shared/crafting.js'));
const IR = require(path.join(ROOT, 'lib/shared/itemResolve.js'));
const PM = require(path.join(ROOT, 'lib/shared/poolMods.js'));
const CR = require(path.join(ROOT, 'lib/shared/charResolve.js'));
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', f), 'utf8'));
const TPL = J('crafting_templates.json').templates;
const SPEND = J('crafting_spend.json');
const SKILLS = J('skills.vocab.json').entries;

let failures = 0;
const check = (label, cond, detail) => {
  if (cond) console.log('  PASS  ' + label);
  else { failures += 1; console.error('  FAIL  ' + label + (detail !== undefined ? '  — ' + JSON.stringify(detail) : '')); }
};
const CHOICE = { skill: { skill: 'mechanics' }, characteristic: { characteristic: 'agility' } };
const choiceFor = (t) => (t.choice ? CHOICE[t.choice.kind] : undefined);

function finished(t, rows, choice) {
  const p = Object.assign(Craft.newProject(t.id, t.category, []), { stage: 'spending', roll: { su: 2 }, improvements: rows || [] });
  return choice ? Object.assign(p, { choice }) : p;
}
function build(CraftMod, t, rows) {
  const index = CraftMod.indexSpend(SPEND, t.category);
  return CraftMod.buildItem(finished(t, rows, choiceFor(t)), t, index, { skills: SKILLS }).record;
}

// ── C1 ──
function legC1(CraftMod, CraftingMod) {
  const bad = [];
  Object.values(TPL).forEach((t) => {
    const index = CraftMod.indexSpend(SPEND, t.category);
    // every applied row THIS template may buy (re-pointed by card release-r5-crafting-kp C9: a row its limits refuse on
    // this template's base — Two-Handed on a two-handed hilt — is not a legal build, and buildItem throws on it)
    const applied = CraftingMod.appliedRowIds(index).filter((id) => !CraftMod.limitOf(index[id].row, t.result_profile, 0));
    [[], applied].forEach((rows) => {
      const rec = build(CraftMod, t, rows);
      if (Crafting.hasChoiceSlot(rec)) bad.push(t.id + (rows.length ? ' + rows' : ''));
    });
  });
  return bad;
}
const withEffects = Object.values(TPL).filter((t) => Array.isArray(t.effects));
check('C1 the registry holds slotted template effects to resolve (' + withEffects.length + ' templates)',
  withEffects.length === 4 && withEffects.every((t) => Crafting.hasChoiceSlot(t.effects)), withEffects.map((t) => t.id));
const c1 = legC1(Craft, Crafting);
check('C1 no {choice} slot survives in any built record (' + Object.keys(TPL).length + ' templates, bare and with every applied row)',
  c1.length === 0, c1);

// ── C2 ──
const choiceTpls = Object.values(TPL).filter((t) => t.choice);
check('C2 five templates take a choice (3 gadgets + the implant: skill; the Appendage: characteristic)',
  choiceTpls.length === 5 && choiceTpls.filter((t) => t.choice.kind === 'skill').length === 4, choiceTpls.map((t) => t.id));
const throwsC2 = choiceTpls.filter((t) => {
  try { Craft.buildItem(finished(t, []), t, Craft.indexSpend(SPEND, t.category), {}); return false; } catch (e) { return true; }
});
check('C2 buildItem throws for every choice template on a project with no choice', throwsC2.length === choiceTpls.length,
  choiceTpls.filter((t) => throwsC2.indexOf(t) === -1).map((t) => t.id));
const spec = TPL.specialist_tool;
let refused = false;
try { Craft.acquireMaterials(Craft.newProject(spec.id, spec.category, []), { method: 'bought', paid: 400, template: spec }); }
catch (e) { refused = true; }
check('C2 acquireMaterials, handed the template, refuses construction without the choice', refused);
const chosenP = Craft.setChoice(Craft.newProject(spec.id, spec.category, []), spec, { skill: 'mechanics' }, SKILLS);
const acq = Craft.acquireMaterials(chosenP, { method: 'bought', paid: 400, template: spec });
check('C2 after setChoice, construction is reached and the choice is kept', acq.stage === 'construction'
  && JSON.stringify(acq.choice) === '{"skill":"mechanics"}', acq);
const vibro = TPL.vibro_weapon;
const plain = Craft.acquireMaterials(Craft.newProject(vibro.id, vibro.category, []), { method: 'other', template: vibro });
check('C2 a template without a choice acquires as before, and no `choice` key is written', plain.stage === 'construction' && !('choice' in plain));

// ── C3 ──
const refuses = (fn) => { try { fn(); return false; } catch (e) { return true; } };
const p0 = Craft.newProject(spec.id, spec.category, []);
check('C3 a skill outside the template\'s group is refused (brawl is combat)', refuses(() => Craft.setChoice(p0, spec, { skill: 'brawl' }, SKILLS)));
check('C3 a skill the vocabulary lacks is refused', refuses(() => Craft.setChoice(p0, spec, { skill: 'basket_weaving' }, SKILLS)));
const app = TPL.cybernetic_appendage;
check('C3 a characteristic outside `among` is refused (Intellect, for the Appendage)',
  refuses(() => Craft.setChoice(Craft.newProject(app.id, app.category, []), app, { characteristic: 'intellect' })));
check('C3 a template that takes no choice refuses one', refuses(() => Craft.setChoice(Craft.newProject(vibro.id, vibro.category, []), vibro, { skill: 'mechanics' }, SKILLS)));
check('C3 two keys in one choice are refused', refuses(() => Craft.setChoice(p0, spec, { skill: 'mechanics', characteristic: 'brawn' }, SKILLS)));

// ── C4 ──
const specRec = build(Craft, spec, []);
const appRec = build(Craft, app, []);
check('C4 _inline.chosen is the choice, ids only (skill)', JSON.stringify(specRec.chosen) === '{"skill":"mechanics"}', specRec.chosen);
check('C4 _inline.chosen is the choice, ids only (characteristic)', JSON.stringify(appRec.chosen) === '{"characteristic":"agility"}', appRec.chosen);
check('C4 a template without a choice writes no `chosen`', !('chosen' in build(Craft, vibro, [])));

// ── C5 (blind item 4) ──
const eq = Craft.landItem({ weapons: [], gear: [] }, specRec, spec);
const landed = eq.gear.length === 1 ? IR.pcResolveEntry(eq.gear[0], {}) : null;
check('C5 the Specialist Tool lands in equipment.gear as {_inline}', !!landed && eq.weapons.length === 0 && landed === specRec);
const colOn = PM.collect({ weapons: [], gear: [landed] }).filter((m) => m.symbol === 'success');
const reaches = (col, skillId) => col.some((m) => PM.matches(m, { skillId }));
check('C5 its automatic Success reaches a Mechanics check (the chosen skill)', colOn.length === 1 && reaches(colOn, 'mechanics'), colOn);
check('C5 and not a Computers check', !reaches(colOn, 'computers'));
const prec = build(Craft, TPL.precision_instrument, []);
const pm = (prec.pool_mods || [])[0] || {};
check('C6 the Precision Instrument removes 2 setback dice on the chosen skill',
  pm.die === 'setback' && pm.count === 2 && pm.direction === 'remove' && JSON.stringify(pm.applies_to) === '[{"scope":"skill","value":"mechanics"}]', pm);

// ── C6 ──
const imp = build(Craft, TPL.cybernetic_implant, []);
const eqImp = { weapons: [], armor: null, gear: [imp, appRec] };
const rankOn = CR.skillRankInUse(eqImp, { skillSheetKeys: {} }, 'mechanics', 2);
check('C6 the Implant adds 1 rank to the chosen skill (Mechanics 2 → 3)', rankOn === 3, rankOn);
const chOn = CR.characteristicsInUse({ brawn: 2, agility: 3 }, eqImp);
check('C6 the Appendage adds 1 to the chosen characteristic (Agility 3 → 4), Brawn untouched', chOn.agility === 4 && chOn.brawn === 2, chOn);
check('C6 a template\'s character effect is named for the template', (imp._characterEffects || [])[0]
  && imp._characterEffects[0].source === 'Cybernetic Implant' && imp._characterEffects[0].key === 'mechanics', imp._characterEffects);

// ── BITE ──
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'r5choice-'));
try {
  // re-pointed by card release-r5-crafting-fib (c0 Q2): a fortification build reaches craftStore.fortificationOf, which
  // requires vesselResolve.js lazily, so the copy carries it; the cut is unchanged
  ['craftStore.js', 'itemResolve.js', 'vesselResolve.js'].forEach((f) => fs.copyFileSync(path.join(ROOT, 'lib/shared', f), path.join(tmp, f)));
  const src = fs.readFileSync(path.join(ROOT, 'lib/shared/crafting.js'), 'utf8');
  const cut = src.replace("effects: resolveChoiceSlots(fx, chosen) }", 'effects: fx }');
  if (cut === src) throw new Error('the bite found no resolution call to cut');
  fs.writeFileSync(path.join(tmp, 'crafting.js'), cut.split('../../public/').join(path.join(ROOT, 'public') + '/'));
  const MC = require(path.join(tmp, 'craftStore.js')), MCr = require(path.join(tmp, 'crafting.js'));
  const bit = legC1(MC, MCr);
  if (bit.length) console.log('  PASS  BITE: an applyTemplateEffects that skips the resolution reds C1 (' + bit.length + ' builds)');
  else { failures += 1; console.error('  FAIL  BITE: a planted unresolving applyTemplateEffects passed C1'); }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(failures ? '\nFAILED: ' + failures : '\nOK');
process.exit(failures ? 1 : 0);
