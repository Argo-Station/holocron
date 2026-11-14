#!/usr/bin/env node
/**
 * release_r6_droid_finish.cjs — B-1528: CraftWorkshop's finish writes `companions` (card `release-r6-ui` §2.6, §3 item 6;
 * ruling `release-r6-ui-c0` L39: "B-1528's fix, with its bitten guard").
 *
 *   F1  craftStore.landingOf on a crafted Labor Chassis lands ONE companion row whose `own` is the crafted recipe, named as
 *       finish names it, and hands `equipment` back untouched (the same object): a droid never lands in the pack.
 *   F2  a directive programs the droid its `made_from` names: directive_id, its skill pick, the same companion id.
 *   F3  the face: CraftWorkshop's finish hands landingOf the sheet's companions and the droid registries, and writes the
 *       landing's `companions` onto the patch. Read from player/app.jsx, or from RR6_APP (the bite: today's finish).
 *
 * Bite: RR6_APP=<a copy of player/app.jsx before this fix> node test/release_r6_droid_finish.cjs → F3 reds, exit 1.
 * Run:  node test/release_r6_droid_finish.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const Craft = require(path.join(ROOT, 'lib/shared/craftStore.js'));
const C = require(path.join(ROOT, 'lib/shared/companions.js'));
const TPL = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical/crafting_templates.json'), 'utf8')).templates;
const SPEND = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical/crafting_spend.json'), 'utf8'));
const DROID = { templates: TPL, spend: SPEND };
let failures = 0;
function check(ok, msg, detail) {
  if (ok) console.log('  PASS  ' + msg);
  else { failures += 1; console.log('  FAIL  ' + msg + (detail !== undefined ? '  — ' + JSON.stringify(detail).slice(0, 400) : '')); }
}
const project = (tid, cat, extra) => Object.assign(Craft.logRoll(Craft.acquireMaterials(Craft.newProject(tid, cat, []), Object.assign({ method: 'other' }, extra || {})),
  { su: 2, fa: 0, ad: 0, th: 0, tr: 0, de: 0 }));

// F1 · a chassis lands in companions, never in equipment
const eq = { weapons: [], gear: [], armor: null, credits: 100 };
const ch = project('labor_chassis', 'droid_chassis');
const out = Craft.landingOf(ch, TPL.labor_chassis, Craft.indexSpend(SPEND, 'droid_chassis'), eq, { companions: [], name: 'Tibbs-9', droid: DROID });
const row = (out.companions || [])[0];
check(out.equipment === eq, 'F1 the chassis hands equipment back untouched (the same object)');
check((out.companions || []).length === 1 && row.name === 'Tibbs-9' && C.isCrafted(row.own) && row.own.template_id === 'labor_chassis' && row.own.craft_id === ch.id,
  'F1 one companion row: named, crafted, its template and craft id', out.companions);

// F2 · a directive programs that droid
const dir = Craft.setPick(project('labor_directives', 'droid_directive', { made_from: row.id }), 'directive', { skills: ['mechanics'] });
const out2 = Craft.landingOf(dir, TPL.labor_directives, Craft.indexSpend(SPEND, 'droid_directive'), eq, { companions: out.companions, droid: DROID });
const prog = (out2.companions || []).filter((c) => c.id === row.id)[0];
check(out2.equipment === eq && (out2.companions || []).length === 1 && prog && prog.own.directive_id === 'labor_directives'
  && JSON.stringify(((prog.own.picks || {}).directive || {}).skills) === '["mechanics"]', 'F2 the directive programs the same droid: directive_id and its skill pick', out2.companions);

// F3 · the face's finish (B-1528)
const app = fs.readFileSync(process.env.RR6_APP || path.join(ROOT, 'player/app.jsx'), 'utf8');
const at = app.indexOf('function CraftWorkshop(');
const fin = at < 0 ? '' : app.slice(app.indexOf('function finish(p, name) {', at), app.indexOf('save(patch);', app.indexOf('function finish(p, name) {', at)));
check(/Craft\.landingOf\(p, t, index, eq, \{[^}]*companions: sheet\.companions[^}]*droid: craftDroidRegs\(regs, sheet\)/.test(fin),
  'F3 finish hands landingOf the sheet\'s companions and the droid registries', fin.slice(0, 300));
check(/if \(landed\.companions\) patch\.companions = landed\.companions;/.test(fin), 'F3 finish writes the landing\'s companions onto the patch', fin.slice(-300));

console.log(failures ? '\n' + failures + ' FAILED' : '\nall passed');
process.exit(failures ? 1 : 0);
