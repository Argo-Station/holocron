#!/usr/bin/env node
/**
 * npc_vehicle_categories.cjs — B-893 · B14 fix (1) (ruling npc-paper-rows-5-7 A1 R-NPR57-11): EVERY vehicle
 * type reaches a pill of the bench's vehicle picker. The catch-all pill (`VEHICLE_CATCHALL`) takes its own
 * list AND every type no pill names.
 *
 * The pill table and the catch-all label are READ from lib/library/npc/view.jsx (never retyped); the records
 * are the shipped vehicle library (public/data/vehicle-library, the shards the controller loads); the
 * picker's stats_complete rule is applied. The falsifier: under the pill LISTS alone, the orphan types are
 * named by no pill — unreachable by any pill before the fix.
 *
 * Run:  node test/npc_vehicle_categories.cjs
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + label); } else { fail++; console.error('  FAIL  ' + label + (detail ? '  — ' + JSON.stringify(detail).slice(0, 300) : '')); }
}

const view = fs.readFileSync(path.join(ROOT, 'lib/library/npc/view.jsx'), 'utf8');
const tm = view.match(/const VEHICLE_CATEGORIES = (\[[\s\S]*?\n\]);/);
check('view.jsx declares VEHICLE_CATEGORIES (read, not retyped)', !!tm);
const CATS = tm ? eval(tm[1]) : [];   // a literal array of { label, match: [...] }
const cm = view.match(/const VEHICLE_CATCHALL = '([^']+)';/);
check('view.jsx declares the catch-all pill by label (VEHICLE_CATCHALL)', !!cm && CATS.some((c) => c.label === cm[1]), cm && cm[1]);
const CATCHALL = cm ? cm[1] : '';
check('the picker filters a category THROUGH vehicleInCategory (the rule counted below is the one it runs)',
      /pool\.filter\(v => vehicleInCategory\(cat, v\.type \|\| v\.Type\)\)/.test(view));

const idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/vehicle-library/index.json'), 'utf8'));
let recs = [];
Object.keys(idx.shards).forEach((k) => {
  recs = recs.concat(JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/vehicle-library', idx.shards[k].file), 'utf8')).entries || []);
});
const shown = recs.filter((v) => v.stats_complete !== false);            // the picker's own guard
check('the vehicle library loads (records read from every shard, the picker\'s stats_complete applied)', shown.length > 0, shown.length);

const byList = (c, v) => c.match.some((m) => m.toLowerCase() === String(v.type || '').toLowerCase());
// THE PRODUCT'S OWN RULE, evaluated from its source (not restated): the table, the catch-all, the named set and
// `vehicleInCategory` — a mutant of the rule moves these counts.
const fm = view.match(/const VEHICLE_NAMED_TYPES = [^\n]*\n(function vehicleInCategory\([\s\S]*?\n\})/);
const nm = view.match(/(const VEHICLE_NAMED_TYPES = [^\n]*)\n/);
check('view.jsx declares vehicleInCategory beside VEHICLE_NAMED_TYPES (evaluated from source)', !!fm && !!nm);
const ruleFn = (fm && nm && tm && cm) ? new Function(
  'const VEHICLE_CATEGORIES = ' + tm[1] + ';\nconst VEHICLE_CATCHALL = ' + JSON.stringify(CATCHALL) + ';\n' + nm[1] + '\n' + fm[1] + '\nreturn vehicleInCategory;')() : () => false;
const withRule = (c, v) => ruleFn(c, v.type || v.Type);
const orphans = shown.filter((v) => !CATS.some((c) => byList(c, v)));
const orphanTypes = [...new Set(orphans.map((v) => v.type))].sort();
check('FALSIFIER — under the pill LISTS alone ' + orphans.length + ' records (' + orphanTypes.length + ' types) reach NO pill: '
      + orphanTypes.join(' · '), orphans.length === 5 && orphanTypes.length === 5, orphanTypes);
const cat = CATS.find((c) => c.label === CATCHALL);
const nList = shown.filter((v) => byList(cat, v)).length;
const nRule = shown.filter((v) => withRule(cat, v)).length;
check('the catch-all "' + CATCHALL + '" holds ' + nList + ' by its list and ' + nRule + ' with the rule (33 → 38, the ruling\'s counts)',
      nList === 33 && nRule === 38, { nList, nRule });
const unreached = shown.filter((v) => !CATS.some((c) => withRule(c, v)));
check('with the rule EVERY record reaches a pill (0 unreached)', unreached.length === 0, unreached.map((v) => v.name).slice(0, 5));

console.log('\nnpc_vehicle_categories: ' + pass + '/' + (pass + fail) + ' PASS' + (fail ? '  (' + fail + ' FAILED)' : ''));
process.exit(fail ? 1 : 0);
