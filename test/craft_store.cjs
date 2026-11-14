#!/usr/bin/env node
/**
 * craft_store.cjs — STANDING guard for the crafting project store (F-56 sub-step 3d).
 *
 * Carries the three conditions ruling `crafting-journey-shape-and-save-shapes` §4 bound to this lap:
 *   C-J1  a persisted project in EACH stage survives reload and resumes exactly, plus an item
 *         round-trip proving `built_with` -> the same derived grade after reload.
 *   C-J2  instance-id generation is unique — two crafts of the SAME template never collide.
 *   C-J3  loud during a LIVE spend (unknown id throws); GRACEFUL at render of an old item
 *         (unresolvable rows skipped, grade computed from what resolves, nothing stripped).
 *
 * C-J1 exists because of R-C1-2/R-SPA-5: a fixture per BRANCH, and `stage` is a branch. A single
 * happy-path fixture would pass while two of the three resumable states were broken.
 *
 * Run: node test/craft_store.cjs
 */
const fs = require('fs');
const path = require('path');
const C = require('../lib/shared/craftStore.js');

let failures = 0;
function check(label, cond) {
  if (cond) console.log('  PASS  ' + label);
  else { failures += 1; console.error('  FAIL  ' + label); }
}
const P = (f) => path.join(__dirname, '..', 'public', 'data', 'canonical', f);
const TPL = JSON.parse(fs.readFileSync(P('crafting_templates.json'), 'utf8'));
const SPEND = JSON.parse(fs.readFileSync(P('crafting_spend.json'), 'utf8'));
const IDX = C.indexSpend(SPEND, 'brawl_melee');
const vibro = TPL.templates.vibro_weapon;
const reload = (o) => JSON.parse(JSON.stringify(o));   // the save round-trip, honestly

function main() {
  // ── C-J2 — instance identity ────────────────────────────────────────────
  const a = C.newProject('vibro_weapon', 'brawl_melee', []);
  const b = C.newProject('vibro_weapon', 'brawl_melee', [a]);
  check('C-J2 two crafts of the SAME template get different ids', a.id !== b.id);
  check('C-J2 ids are instance ids, never the template id',
    a.id !== 'vibro_weapon' && /^craft_/.test(a.id));
  const many = [];
  for (let i = 0; i < 300; i++) many.push(C.newProject('vibro_weapon', 'brawl_melee', many));
  check('C-J2 300 projects, 300 distinct ids', new Set(many.map((p) => p.id)).size === 300);

  // ── closed vocabularies (R-SY4) ─────────────────────────────────────────
  check('stage vocabulary is exactly the ruled three',
    JSON.stringify(C.STAGES) === JSON.stringify(['materials', 'construction', 'spending']));
  check('method vocabulary is exactly the ruled two',
    JSON.stringify(C.ACQ_METHODS) === JSON.stringify(['bought', 'other']));
  let threw = false;
  try { C.acquireMaterials(a, { method: 'salvaged' }); } catch (e) { threw = /method must be one of/.test(e.message); }
  check('an unruled method THROWS rather than being absorbed', threw);

  // ── C-J1 — a fixture per STAGE, each surviving reload ────────────────────
  const s1 = C.newProject('vibro_weapon', 'brawl_melee', []);
  check('C-J1 stage 1 (materials) round-trips', (() => {
    const r = reload(s1);
    return r.stage === 'materials' && r.materials.acquired === false && r.roll === null
        && r.template_id === 'vibro_weapon' && r.id === s1.id;
  })());

  const s2 = C.acquireMaterials(s1, { method: 'bought', paid: 200, made_from: 'beskar' });
  check('C-J1 stage 2 (construction) round-trips with its acquisition intact', (() => {
    const r = reload(s2);
    return r.stage === 'construction' && r.materials.acquired === true
        && r.materials.method === 'bought' && r.materials.paid === 200 && r.made_from === 'beskar';
  })());
  check('the non-purchase path records a method and pays nothing', (() => {
    const o = C.acquireMaterials(s1, { method: 'other', note: 'salvaged off a wreck' });
    return o.materials.method === 'other' && o.materials.paid === null
        && /salvaged/.test(o.materials.note);
  })());

  const s3 = C.logRoll(s2, { su: 3, ad: 2, th: 1 });
  check('C-J1 stage 3 (spending) round-trips with the roll intact', (() => {
    const r = reload(s3);
    return r.stage === 'spending' && r.roll.su === 3 && r.roll.ad === 2 && r.roll.th === 1
        && r.roll.fa === 0 && r.roll.tr === 0 && r.roll.de === 0;
  })());
  check('C-J1 a part-spent project resumes its picks after reload', (() => {
    const spent = C.toggleRow(C.toggleRow(s3, 'lightweight', IDX), 'heavy', IDX);
    const r = reload(spent);
    return r.improvements.join() === 'lightweight' && r.flaws.join() === 'heavy';
  })());

  // ── the verdict ─────────────────────────────────────────────────────────
  check('verdict: 3 successes, no threat -> crafted', C.outcome({ su: 3 }) === 'crafted');
  check('verdict: success WITH threat -> its own third outcome, named up front',
    C.outcome({ su: 2, th: 2 }) === 'crafted_flawed');
  check('verdict: no net success -> failed', C.outcome({ su: 1, fa: 2 }) === 'failed');
  check('verdict: Triumph counts as a success (EotE p.23)', C.outcome({ tr: 1 }) === 'crafted');
  check('verdict: Despair counts as a failure', C.outcome({ su: 1, de: 1 }) === 'failed');
  check('verdict: everything cancelling is a FAILURE (RAW needs >=1 net success)',
    C.outcome({ su: 2, fa: 2 }) === 'failed');

  // ── build time (Special Modifications p.75) ─────────────────────────────
  const con = TPL.construction;
  check('time: 1 success leaves the base 24 h', C.buildHours(vibro, { su: 1 }, con) === 24);
  check('time: each success past the first cuts 2 h (3 -> 20 h)', C.buildHours(vibro, { su: 3 }, con) === 20);
  check('time: floors at 1 h, never 0 or negative', C.buildHours(vibro, { su: 40 }, con) === 1);

  // ── tiers + grade, derived from the cost ladder ─────────────────────────
  check('tier: a 1-Advantage row is tier 1', C.tierOf(IDX.lightweight.row) === 1);
  check('tier: a 4-Advantage row is tier 4', C.tierOf(IDX.lethal.row) === 4);
  check('tier: a Triumph-ONLY row sits above the ladder at 5', C.tierOf(IDX.concussive_quality.row) === 5);
  check('tier: a Despair-ONLY flaw is tier 5', C.tierOf(IDX.hidden_flaw.row) === 5);
  check('tier: an "or Triumph" row takes its ADVANTAGE cost, not 5',
    C.tierOf(IDX.defensive_quality.row) === 2);
  check('grade: best improvement wins, flaws graded separately', (() => {
    const g = C.gradeOf(['lightweight', 'lethal', 'heavy'], IDX);
    return g.good === 4 && g.bad === 1;
  })());
  check('grade: an item with no improvements grades 0/0', (() => {
    const g = C.gradeOf([], IDX);
    return g.good === 0 && g.bad === 0;
  })());

  // ── C-J3 — loud live, graceful at render ────────────────────────────────
  let liveThrew = false;
  try { C.toggleRow(s3, 'not_a_row', IDX); } catch (e) { liveThrew = /unknown spend row id/.test(e.message); }
  check('C-J3 LIVE spend: an unknown row id THROWS (code path -> bug)', liveThrew);
  check('C-J3 RENDER: an unresolvable row on an OLD item degrades gracefully', (() => {
    const g = C.gradeOf(['lethal', 'retired_row_from_a_future_lap'], IDX);
    return g.good === 4 && g.unresolved.length === 1 && g.unresolved[0] === 'retired_row_from_a_future_lap';
  })());
  check('C-J3 RENDER: an item built ENTIRELY of unresolvable rows still renders, grade 0',
    (() => { const g = C.gradeOf(['gone_a', 'gone_b'], IDX); return g.good === 0 && g.unresolved.length === 2; })());

  // ── C-J1 — the item round-trip ──────────────────────────────────────────
  const done = C.toggleRow(C.toggleRow(s3, 'two_handed', IDX), 'lethal', IDX);
  const built = C.buildItem(done, vibro, IDX, { name: "Ysalamiri's Tooth" });
  check('item: the applier did the item math (+1 dmg two-handed, +1 crit reduction)',
    built.record.damage.value === 2 && built.record.crit === 1 && built.record.hands === 'two_handed');
  check('item: carries built_with, made_from and custom provenance',
    built.record.built_with.join() === 'two_handed,lethal'
    && built.record.made_from === 'beskar' && built.record._provenance === 'custom');
  check('C-J1 ITEM ROUND-TRIP: built_with survives and derives the SAME grade after reload', (() => {
    const before = C.gradeOf(built.record.built_with, IDX);
    const after = C.gradeOf(reload(built.record).built_with, IDX);
    return before.good === after.good && before.bad === after.bad && after.good === 4;
  })());
  check('item: the source profile is NOT mutated (the template stays pristine)',
    vibro.result_profile.damage.value === 1 && vibro.result_profile.hands === 'one_handed');

  // ── naming: never required, always distinguishing ───────────────────────
  check('name: an explicit name wins', built.record.name === "Ysalamiri's Tooth");
  check('name: skipping it yields the template name', C.defaultName(vibro, []) === 'Vibro-weapon');
  check('name: a second unnamed craft distinguishes itself',
    C.defaultName(vibro, ['Vibro-weapon']) === 'Vibro-weapon 2');
  check('name: it keeps counting past the second',
    C.defaultName(vibro, ['Vibro-weapon', 'Vibro-weapon 2']) === 'Vibro-weapon 3');

  // ── remembered effects — the app refuses to forget, it does not enforce ──
  check('remembered: crafter-scoped rows are rememberable, item rows are not', (() => {
    const r = C.rememberable(['practice_makes_perfect', 'lethal', 'lessons_learned'], IDX);
    return r.length === 2 && r.indexOf('lethal') === -1;
  })());
  check('remembered: notes round-trip and dismiss', (() => {
    const n = C.addNotes([], ['practice_makes_perfect'], 'craft_x');
    const r = reload(n);
    return r.length === 1 && r[0].row_id === 'practice_makes_perfect'
        && C.dismissNote(r, 0).length === 0;
  })());

  console.log(failures === 0 ? '\ncraft store guard: ALL PASS' : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
