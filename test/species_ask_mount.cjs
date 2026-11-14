#!/usr/bin/env node
/**
 * species_ask_mount.cjs — Lap 2b (the sheet species-ask mount) gate guards.
 *
 * WRITTEN FROM THE RULING TEXT. Conditions this file discharges:
 *   · C-SAVR-1 (`species-ask-variant-reseed`): the widened deferral predicate splits the shipped
 *     registry into 183 answerable / 24 deferred — COMPUTED from `species.json`, never hard-coded —
 *     and both predicate legs (skill_choice_grants + baked-stat) are live.
 *   · C-SAVR-2: the mount's persist (`speciesAskPatch`) NEVER writes `characteristics` / `woundBase`
 *     / `strainBase`. Published RED against a deliberately-wrong mount (source-mutated), then green.
 *   · C-SAE-1 (`species-apply-extraction`): a guard that BITES on OVER-granting — the applier claiming
 *     a grant the species did not give, so the reverse transform accounts a PURCHASED rank as FREE.
 *     Published RED against an over-granting applier (source-mutated), then green.
 *   · C-SAE-2: the option XP delta is ONE computation — the creator's `applySpeciesPicks` calls the
 *     shared `speciesOptionXpDelta` (no second inline reduce), and the sheet patch banks the same.
 *   · R-SAM-3/4: answering grants EXACTLY what the creator would (skill + XP delta), FREE, with the
 *     provenance marker, and is IDEMPOTENT (answering twice is a no-op).
 *
 * The red/green bites are self-verifying: each mutant is loaded from source-mutated charResolve and
 * the guard asserts BOTH that the real code passes AND that the mutant is caught. The gate shows this
 * file green; internally that green PROVES the bite.
 *
 * Run: node test/species_ask_mount.cjs
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
let failures = 0;
function check(label, cond, detail) {
  if (cond) console.log('  PASS  ' + label);
  else { failures += 1; console.error('  FAIL  ' + label + (detail !== undefined ? '  — ' + JSON.stringify(detail).slice(0, 400) : '')); }
}

const CHARRESOLVE_SRC = fs.readFileSync(path.join(root, 'lib/shared/charResolve.js'), 'utf8');
function loadCR(mutations) {
  let src = CHARRESOLVE_SRC;
  (mutations || []).forEach(function (m) {
    if (src.indexOf(m.find) === -1) throw new Error('mutation anchor NOT FOUND: ' + m.find.slice(0, 60));
    src = src.replace(m.find, m.repl);
  });
  const ctx = { window: {}, module: { exports: {} }, console: { log: function () {}, error: function () {}, warn: function () {} } };
  ctx.self = ctx.window; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx.window.CharResolve || ctx.module.exports;
}

// The two source mutations. Each anchor is unique to its function — verified by the loadCR throw.
const OVERGRANT = { find: '(rec.starting_skills || []).forEach(add);',
  repl: '(rec.starting_skills || []).forEach(add); out[\'ATHL\'] = 3;' };
const WRITECHARS = { find: 'skills: nextSkills,\n      speciesGrantApplied: grants,',
  repl: 'skills: nextSkills,\n      characteristics: { brawn: 99 },\n      speciesGrantApplied: grants,' };

const CR = loadCR();
const J = (f) => JSON.parse(fs.readFileSync(path.join(root, 'public/data/canonical/' + f), 'utf8'));
const speciesReg = J('species.json').species;
const charbuild = {
  species: speciesReg,
  careers: J('careers.json').careers,
  specializations: J('specializations.json').specializations,
  talents: J('talents.json').talents,
  forcePowers: J('force_powers.json').force_powers,
  skillSheetKeys: (J('skills.vocab.json').entries || []).reduce((m, e) => {
    m[e.id] = (e.aliases || []).find((a) => /^[A-Z]+$/.test(a)) || e.id; return m;
  }, {}),
};
const KEYS = charbuild.skillSheetKeys;

console.log('\n── C-SAVR-1: the widened predicate splits the shipped registry 183 / 24 ──');

check('the shared predicate + unanswered-group split are exported',
  typeof CR.speciesGroupDeferred === 'function' && typeof CR.speciesUnansweredGroups === 'function');

let groups = 0, ans = 0, defr = 0, byChoice = 0, byStat = 0;
const STAT_FIELDS = ['characteristics', 'wound_threshold_base', 'strain_threshold_base',
  'wound_threshold_adjustment', 'strain_threshold_adjustment', 'starting_xp'];
Object.keys(speciesReg).forEach((k) => {
  (speciesReg[k].option_choices || []).forEach((oc) => {
    groups += 1;
    const d = CR.speciesGroupDeferred(oc);
    if (d) {
      defr += 1;
      const opts = oc.options || [];
      if (opts.some((o) => o && o.skill_choice_grants)) byChoice += 1;
      else if (opts.some((o) => o && STAT_FIELDS.some((f) => o[f] != null))) byStat += 1;
    } else ans += 1;
  });
});
// 207 -> 208 (ruling `b294-xidec-castes-gate` R-XCG-1, executing `b294-xidec-castes`): Xi'Dec's
// five genders stop being inert `special_abilities` prose and become the pick-one group they always
// were. One group, one cause; ANSWERABLE is untouched at 183 because the new group DEFERS.
check('C-SAVR-1 total option groups on the shelf is 208', groups === 208, groups);
check('C-SAVR-1 ANSWERABLE = 183 (computed from the registry, not hard-coded)', ans === 183, ans);
// 24 -> 25 (same ruling, same cause, second half): Xi'Dec's group defers on the SKILL-CHOICE leg —
// Constructor carries `skill_choice_grants` (Athletics or Mechanics), which R-SAM-5 defers to the
// creator because the option opens a second question the slim ask line does not draw.
check('C-SAVR-1 DEFERRED = 25', defr === 25, defr);
// Both predicate legs must be LIVE, or a one-legged predicate would pass the counts by accident.
check('C-SAVR-1 the skill-choice leg defers ≥1 group (R-SAM-5 still bites)', byChoice >= 1, byChoice);
check('C-SAVR-1 the baked-stat leg defers ≥1 group (R-SAM-8 bites)', byStat >= 1, byStat);
check('C-SAVR-1 the two legs account for every deferred group', byChoice + byStat === defr, { byChoice, byStat, defr });

// speciesUnansweredGroups agrees with the predicate on a real unanswered character (empty picks).
(function () {
  // csg_sith carries a baked-stat Subspecies group → must land in `deferred`, never `answerable`.
  const sith = speciesReg['csg_sith'];
  const split = CR.speciesUnansweredGroups(sith, {});
  check('C-SAVR-1 an unanswered baked-stat group (csg_sith Subspecies) splits to DEFERRED',
    split.deferred.length >= 1 && split.answerable.every((oc) => !CR.speciesGroupDeferred(oc)),
    { def: split.deferred.map((o) => o.name), ans: split.answerable.map((o) => o.name) });
  // cathar carries a Skills group (grants a skill, pick-one) → answerable.
  const cathar = speciesReg['cathar'];
  const csplit = CR.speciesUnansweredGroups(cathar, {});
  check('C-SAVR-1 an unanswered skill group (cathar Skills) splits to ANSWERABLE',
    csplit.answerable.length >= 1, { ans: csplit.answerable.map((o) => o.name) });
  // A recorded pick removes the group from the ask entirely.
  const slug = cathar.option_choices[0].name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const answered = {}; answered[slug] = cathar.option_choices[0].options[0].id;
  check('C-SAVR-1 a recorded pick removes its group from the unanswered set',
    CR.speciesUnansweredGroups(cathar, answered).answerable.every((oc) =>
      (oc.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')) !== slug), answered);
})();

console.log('\n── C-SAVR-2: the mount persist NEVER writes characteristics / woundBase / strainBase ──');

// The exhaustive negative: answer EVERY answerable group on the shelf through the real patch and
// assert not one of them emits a baked stat key. This is the whole ruling made enforceable.
const FORBIDDEN = ['characteristics', 'woundBase', 'strainBase', 'wound_threshold_base', 'strain_threshold_base'];
function slugOf(name) { return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''); }
let patchesChecked = 0, offenders = [];
Object.keys(speciesReg).forEach((sid) => {
  const rec = speciesReg[sid];
  (rec.option_choices || []).forEach((oc) => {
    if (CR.speciesGroupDeferred(oc)) return;            // only answerable groups reach the patch
    const opt = (oc.options || [])[0];
    if (!opt || opt.id == null) return;
    const sheet = { speciesId: sid, speciesOptionPicks: {}, skills: {}, speciesGrantApplied: {}, speciesOption: {} };
    const patch = CR.speciesAskPatch(sheet, rec, slugOf(oc.name), opt.id, KEYS);
    patchesChecked += 1;
    const bad = Object.keys(patch).filter((k) => FORBIDDEN.indexOf(k) !== -1);
    if (bad.length) offenders.push({ sid, group: oc.name, bad });
  });
});
check('C-SAVR-2 the patch was exercised on every answerable group (not a vacuous sweep)',
  patchesChecked === 183, patchesChecked);
check('C-SAVR-2 NO answerable group\'s patch writes a baked stat key', offenders.length === 0, offenders.slice(0, 5));

// THE BITE, published RED: a mount that DID write characteristics is caught by the same check.
(function () {
  const CRbad = loadCR([WRITECHARS]);
  const rec = speciesReg['cathar'];
  const sheet = { speciesId: 'cathar', speciesOptionPicks: {}, skills: {}, speciesGrantApplied: {}, speciesOption: {} };
  const badPatch = CRbad.speciesAskPatch(sheet, rec, slugOf(rec.option_choices[0].name), rec.option_choices[0].options[0].id, KEYS);
  const caught = Object.keys(badPatch).some((k) => FORBIDDEN.indexOf(k) !== -1);
  check('C-SAVR-2 RED PROOF: a stat-writing mount IS caught by this guard (the check bites)', caught,
    Object.keys(badPatch));
  check('C-SAVR-2 GREEN: the real mount emits only pick/skills/xp/marker keys',
    JSON.stringify(Object.keys(CR.speciesAskPatch(sheet, rec, slugOf(rec.option_choices[0].name), rec.option_choices[0].options[0].id, KEYS)).sort())
      === JSON.stringify(['skills', 'speciesGrantApplied', 'speciesOption', 'speciesOptionPicks']));
})();

console.log('\n── C-SAE-1: over-granting is caught — the reverse transform never frees a purchased rank ──');

// The real code: `human` grants no skills, so the reverse transform credits ATHL to NOTHING.
const humanSheet = { speciesId: 'human', careerId: 'smuggler', specializations: [], skills: { ATHL: 1 } };
const realAllow = CR.creationSkillAllowance(humanSheet, charbuild);
check('C-SAE-1 the real applier does NOT grant ATHL to a species that never gave it',
  realAllow.speciesGrants.ATHL == null, realAllow.speciesGrants);
const realSkills = CR.skillsFromRanks(humanSheet.skills, realAllow);
check('C-SAE-1 so ATHL is NOT accounted as a free species rank (freeSpecies 0)',
  !realSkills.ATHL.freeSpecies, realSkills.ATHL);

// THE BITE, published RED: an over-granting applier claims ATHL, and the reverse transform then
// frees the purchased rank. Both the allowance leg and the free-accounting leg go red on the mutant.
(function () {
  const CRbad = loadCR([OVERGRANT]);
  const badAllow = CRbad.creationSkillAllowance(humanSheet, charbuild);
  check('C-SAE-1 RED PROOF: the over-grant REACHES the reverse transform (ATHL now a species grant)',
    badAllow.speciesGrants.ATHL != null, badAllow.speciesGrants);
  const badSkills = CRbad.skillsFromRanks(humanSheet.skills, badAllow);
  check('C-SAE-1 RED PROOF: and the purchased ATHL rank is now wrongly accounted FREE (freeSpecies > 0)',
    badSkills.ATHL.freeSpecies > 0, badSkills.ATHL);
  // The guard's own assertion (speciesGrants excludes ATHL) FAILS on the mutant — that is the bite.
  check('C-SAE-1 the guard leg BITES: real passes `speciesGrants.ATHL == null`, mutant fails it',
    (realAllow.speciesGrants.ATHL == null) && (badAllow.speciesGrants.ATHL != null));
})();

console.log('\n── C-SAE-2: the option XP delta is ONE computation, shared by creator and sheet ──');

check('the shared XP-delta reduce is exported', typeof CR.speciesOptionXpDelta === 'function');
const appSrc = fs.readFileSync(path.join(root, 'player/app.jsx'), 'utf8');
const appCode = appSrc.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
// The creator's confirm banks the delta THROUGH the shared reduce…
check('C-SAE-2 applySpeciesPicks calls the shared CharResolve.speciesOptionXpDelta',
  /CharResolve\.speciesOptionXpDelta\(sp, optionPicks\)/.test(appCode));
// …and the old inline second reduce is GONE (deleted, not bypassed).
check('C-SAE-2 no second inline `xp_adjustment` reduce survives in the creator',
  !/optXp \+= [a-z]*\.xp_adjustment/.test(appCode), (appCode.match(/optXp \+= [^;]*/g) || []));
// The sheet banks the SAME number: speciesAskPatch's xp === speciesOptionXpDelta(rec, nextPicks).
(function () {
  const gand = speciesReg['gand'];  // gand/Breathing carries an xp_adjustment option (Ammonia lung)
  const bg = (gand.option_choices || []).find((oc) => (oc.options || []).some((o) => o.xp_adjustment));
  check('C-SAE-2 fixture: gand carries an xp_adjustment answerable group', !!bg && !CR.speciesGroupDeferred(bg), bg && bg.name);
  if (bg) {
    const opt = bg.options.find((o) => o.xp_adjustment);
    const sheet = { speciesId: 'gand', speciesOptionPicks: {}, skills: {}, speciesGrantApplied: {}, speciesOption: { xp: 0 } };
    const patch = CR.speciesAskPatch(sheet, gand, slugOf(bg.name), opt.id, KEYS);
    const expected = CR.speciesOptionXpDelta(gand, patch.speciesOptionPicks);
    check('C-SAE-2 the sheet patch banks EXACTLY the shared reduce\'s delta (one computation)',
      patch.speciesOption.xp === expected && patch.speciesOption.xp === opt.xp_adjustment,
      { banked: patch.speciesOption.xp, shared: expected, opt: opt.xp_adjustment });
  }
})();

console.log('\n── R-SAM-3/4: answering grants what the creator would, FREE + IDEMPOTENT ──');

(function () {
  // cathar/Skills: pick-one, grants Athletics OR Stealth. Answering grants exactly that rank, free.
  const cathar = speciesReg['cathar'];
  const grp = cathar.option_choices[0];
  const opt = grp.options[0];                                  // one_rank_in_athletics
  const slug = slugOf(grp.name);
  const sheet = { speciesId: 'cathar', speciesOptionPicks: {}, skills: {}, speciesGrantApplied: {}, speciesOption: {} };
  const patch = CR.speciesAskPatch(sheet, cathar, slug, opt.id, KEYS);

  // What the CREATOR would grant for the same pick, through the same applier.
  const picks = {}; picks[slug] = opt.id;
  const creatorGrants = CR.speciesSkillGrants(cathar, picks, KEYS);
  const grantedKey = Object.keys(creatorGrants)[0];
  check('R-SAM-3 the pick actually grants a skill (non-vacuous fixture)', !!grantedKey, creatorGrants);
  check('R-SAM-3 the sheet grant EQUALS the creator\'s grant for the same pick',
    JSON.stringify(patch.speciesGrantApplied) === JSON.stringify(creatorGrants), { patch: patch.speciesGrantApplied, creator: creatorGrants });
  // RE-POINTED by R-B658-1 (ruling `b658-sheet-skill-grant-shape`, Jason 2026-09-18 "Fix it"). This
  // asserted `.purchased >= 1` — the CREATOR's record shape — and that WAS the defect: a saved sheet's
  // `skills` map holds ONE NUMBER per key, so writing the record made the rank invisible to every sheet
  // reader. Same intent ("the granted rank lands in the sheet's skills, so it appears"), now pinned to
  // the contract the sheet actually has: the entry IS the number 1.
  check('R-SAM-3/R-B658-1 the granted rank lands in the sheet\'s skills AS A NUMBER, so it appears',
    grantedKey && typeof patch.skills[grantedKey] === 'number' && patch.skills[grantedKey] === 1, patch.skills[grantedKey]);
  check('R-SAM-3 the pick is persisted under its slug', patch.speciesOptionPicks[slug] === opt.id, patch.speciesOptionPicks);

  // IDEMPOTENT: feed the patch's own result back as the sheet and answer again — no double-grant.
  const sheet2 = Object.assign({}, sheet, patch);
  const patch2 = CR.speciesAskPatch(sheet2, cathar, slug, opt.id, KEYS);
  check('R-SAM-4 answering the SAME group twice is a no-op (idempotent skills)',
    JSON.stringify(patch2.skills) === JSON.stringify(patch.skills), { first: patch.skills, second: patch2.skills });
  check('R-SAM-4 and the provenance marker is stable across the re-answer',
    JSON.stringify(patch2.speciesGrantApplied) === JSON.stringify(patch.speciesGrantApplied));

  // RE-ANSWERABLE: changing the pick removes the old grant and applies the new (marker makes it clean).
  const opt2 = grp.options[1];                                 // one_rank_in_stealth
  const patch3 = CR.speciesAskPatch(sheet2, cathar, slug, opt2.id, KEYS);
  const newKey = Object.keys(CR.speciesSkillGrants(cathar, (function () { const p = {}; p[slug] = opt2.id; return p; })(), KEYS))[0];
  // RE-POINTED by R-B658-1, same reason as the R-SAM-3 leg above: a number, not a record.
  check('R-SAM-4/R-B658-1 changing the answer applies the NEW grant as a number',
    typeof patch3.skills[newKey] === 'number' && patch3.skills[newKey] === 1, patch3.skills[newKey]);
  check('R-SAM-4 changing the answer REMOVES the old grant (no orphaned free rank)',
    !patch3.skills[grantedKey] || CR.skillRankOf(patch3.skills[grantedKey]) === 0, { old: grantedKey, skills: patch3.skills });
  // R-B658-2 — THE LATENT DESTRUCTION, pinned where the rule lives. A skill carrying ranks from ANOTHER
  // source keeps them when the grant is retracted: the merge, handed a number, read `.purchased` as
  // undefined, computed `left = max(0, undefined - 1)` = 0 with `bare` true, and DELETED a bought rank.
  const owned = Object.assign({}, sheet, { skills: (function () { const m = {}; m[grantedKey] = 2; return m; })() });
  const ownedGranted = CR.speciesAskPatch(owned, cathar, slug, opt.id, KEYS);
  check('R-B658-2 a rank the player already owns takes the grant ON TOP (2 -> 3, a number)',
    ownedGranted.skills[grantedKey] === 3 && typeof ownedGranted.skills[grantedKey] === 'number', ownedGranted.skills);
  const retracted = CR.speciesAskPatch(Object.assign({}, owned, ownedGranted), cathar, slug, opt2.id, KEYS);
  check('R-B658-2 and RETRACTING it returns exactly the owned rank, never deleting it (3 -> 2)',
    retracted.skills[grantedKey] === 2 && retracted.skills[newKey] === 1, retracted.skills);
  // Every entry the patch emits is a number — the contract stated as a sweep, not one key at a time.
  check('R-B658-1 EVERY entry the patch emits is a number (the sheet\'s shape, no record anywhere)',
    [patch, patch2, patch3, ownedGranted, retracted].every(function (pt) {
      return Object.keys(pt.skills).every(function (k) { return typeof pt.skills[k] === 'number'; });
    }), [patch.skills, patch2.skills, patch3.skills, ownedGranted.skills, retracted.skills]);
})();

console.log('');
if (failures) { console.error('FAILURES: ' + failures); process.exit(1); }
console.log('All species-ask-mount gate guards passed.');
