#!/usr/bin/env node
/**
 * min_force_rating.cjs — B-41 guard (ruling `b41-min-force-rating-brief`).
 *
 * Eighteen records carry a printed Force-rating prerequisite that the product ignored entirely:
 * `min_force_rating` was written, schema'd, and read by NOTHING, so a Force rating 0 character
 * could buy Jedi Knight and a fresh Force user could buy Protect/Unleash (needs 3).
 *
 * RAW: some powers need a minimum Force rating before they can be
 * bought (F&D CRB p.285; tree headers carry the number, e.g. Protect/Unleash
 * "Prerequisites: Force Rating 3+", p.303). Specs: Knight 2 (RotS p.26), General 2 (CotR p.28),
 * Master 3 (CotR p.29); Padawan prints none, which is what proves it is per-spec.
 *
 * This guard pins the two properties a future edit could quietly break:
 *   1. the predicate is REGISTRY-DERIVED — it reads the number off whatever record it is handed,
 *      so a record the author has never heard of still gates. Proven behaviourally, by evaluating
 *      the SHIPPED functions against synthetic records (not a reimplementation of them).
 *   2. every acquisition spine consults it, and against the RESOLVED rating (base + Force Rating
 *      talent ranks) — gating on `forceRatingBase` alone would refuse a purchase RAW allows,
 *      because the Force Rating talent is exactly how a character climbs to FR 2 (fad-gm p.26).
 *
 * Run: node test/min_force_rating.cjs
 */
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'player', 'app.jsx'), 'utf8');

let failures = 0;
function check(label, cond) {
  if (cond) console.log('  PASS  ' + label);
  else { failures += 1; console.error('  FAIL  ' + label); }
}
function count(re) { return (src.match(re) || []).length; }

// ── Extract the SHIPPED predicate and run it. Balanced-brace scan from the declaration so the test
// exercises the real source text; a reimplementation here would pass while the app was broken.
function extract(name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) return null;
  let i = src.indexOf('{', start), depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(start, j + 1); }
  }
  return null;
}
const minSrc = extract('minForceRatingOf');
const meetsSrc = extract('meetsForceRating');
check('minForceRatingOf is present in the shipped source', !!minSrc);
check('meetsForceRating is present in the shipped source', !!meetsSrc);

let minForceRatingOf, meetsForceRating;
if (minSrc && meetsSrc) {
  // eslint-disable-next-line no-eval
  // The rule now lives in the shared core (fix 2 of the exception census: `CharResolve.specGate`);
  // app.jsx's two functions are wrappers that name it. The loader hands the extracted source the
  // core it references — every assert below is unchanged and still exercises the shipped wrappers.
  const CharResolve = require(path.join(root, 'lib', 'shared', 'charResolve.js'));
  const factory = new Function('CharResolve', minSrc + '\n' + meetsSrc + '\nreturn { minForceRatingOf, meetsForceRating };');
  const api = factory(CharResolve);
  minForceRatingOf = api.minForceRatingOf;
  meetsForceRating = api.meetsForceRating;
}

// 1. REGISTRY-DERIVED: a synthetic record the code has never seen still gates, purely on its field.
if (meetsForceRating) {
  const invented = { id: 'totally_invented_power_' + Date.now(), name: 'Invented', min_force_rating: 4 };
  check('a SYNTHETIC record gates on its own field (registry-derived, not an id list)',
    meetsForceRating(invented, 3) === false && meetsForceRating(invented, 4) === true);
  check('a record with NO min_force_rating is never gated', meetsForceRating({ id: 'x' }, 0) === true);
  check('min_force_rating 0 / null / undefined all read as "no requirement"',
    minForceRatingOf({ min_force_rating: 0 }) === 0 &&
    minForceRatingOf({ min_force_rating: null }) === 0 &&
    minForceRatingOf({}) === 0 && minForceRatingOf(null) === 0);
  check('the comparison is >= (meeting the number exactly is enough, per the printed "N +")',
    meetsForceRating({ min_force_rating: 2 }, 2) === true && meetsForceRating({ min_force_rating: 2 }, 1) === false);
  check('a rating above the requirement still passes', meetsForceRating({ min_force_rating: 1 }, 5) === true);
  check('a missing/garbage rating is treated as 0, never as "passes"',
    meetsForceRating({ min_force_rating: 1 }, undefined) === false &&
    meetsForceRating({ min_force_rating: 1 }, null) === false &&
    meetsForceRating({ min_force_rating: 1 }, 'lots') === false);
}

// 2. No id lists in code — the whole point of deriving from the registry. Checked against the
//    EXTRACTED function bodies (an earlier version of this assert only swept 200 chars after a
//    `meetsForceRating` call site, and a mutation that hardcoded ids inside minForceRatingOf walked
//    straight past it).
// The gate BODIES are the core's (fix 2: the rule moved to lib/shared/charResolve.js); app.jsx's two
// functions are wrappers. Both are swept — a hardcoded id in either would still be caught.
const coreSrc = fs.readFileSync(path.join(root, 'lib', 'shared', 'charResolve.js'), 'utf8');
const coreBody = name => { const m = coreSrc.match(new RegExp('^  function ' + name + '\\([\\s\\S]*?^  }', 'm')); return m ? m[0] : ''; };
const gateBodies = (minSrc || '') + '\n' + (meetsSrc || '') + '\n' + coreBody('minForceRatingOf') + '\n' + coreBody('meetsForceRating');
check('the gate bodies contain NO record id at all (registry-derived, not an id list)',
  !/['"][a-z][a-z0-9_]{2,}['"]/.test(gateBodies));
check('the gate bodies read the field by name and nothing else',
  /min_force_rating/.test(gateBodies));

// 3. The predicate has ONE home, and every acquisition spine consults it.
check('minForceRatingOf defined exactly once', count(/function minForceRatingOf\s*\(/g) === 1);
check('meetsForceRating defined exactly once', count(/function meetsForceRating\s*\(/g) === 1);
// Each spine must carry the gate as a bare early return — `if (!meetsForceRating(…)) return;`. The
// looser "mentions meetsForceRating somewhere nearby" form let a `if (false && !meetsForceRating(…))`
// mutation through, because the call was still present in the text.
check('buyBasicPower (ADVANCEMENT power spine) early-returns on an unmet prerequisite',
  /function buyBasicPower[\s\S]{0,600}?if \(!meetsForceRating\([^)]*\)\) return;/.test(src));
check('buyNewSpec (ADVANCEMENT spec spine) early-returns on an unmet prerequisite',
  /function buyNewSpec[\s\S]{0,900}?if \(!meetsForceRating\([^)]*\)\) return;/.test(src));
check('handleSpecConfirm (CREATOR spec spine) early-returns on an unmet prerequisite',
  /handleSpecConfirm\s*=\s*useCallback\([\s\S]{0,400}?if \(!meetsForceRating\([\s\S]{0,120}?\) return;/.test(src));
check('handleForcePowerBuy (CREATOR power spine) early-returns on an unmet prerequisite',
  /handleForcePowerBuy\s*=\s*useCallback\([\s\S]{0,500}?if \(!meetsForceRating\([\s\S]{0,120}?\) return;/.test(src));

// 4. The RESOLVED rating, not the persisted base. This is the subtle one: SheetAdvancement keeps a
//    `forceRating` force-SENSITIVITY flag read from persisted inputs (no talent bonus). If a future
//    edit points the gate at that flag, a legitimately-FR-2 character is refused a legal purchase.
check('resolvedForceRating exists and routes through the shared resolver (charResolve.computeDerived)',
  /function resolvedForceRating[\s\S]{0,400}?CharResolve\.computeDerived\(/.test(src));
check('resolvedForceRating passes the charbuild arg (species-granted Force rating counts too)',
  /function resolvedForceRating[\s\S]{0,400}?computeDerived\([^)]*_canonicalCharbuild/.test(src));
check('ADVANCEMENT gates on the RESOLVED rating (frResolved), not on forceRatingBase',
  /var frResolved\s*=\s*React\.useMemo\([\s\S]{0,160}?resolvedForceRating\(sheet\)/.test(src) &&
  /function buyBasicPower[\s\S]{0,600}?meetsForceRating\([^)]*frResolved/.test(src) &&
  /function buyNewSpec[\s\S]{0,900}?meetsForceRating\([^)]*frResolved/.test(src));
// C1 (ruling b41-min-force-rating R-B41-1): the resolved rating is FLOORED by the B-32 sensitivity
// value, so the gate can never refuse a purchase the app's own flag calls legal. Without this, the
// legacy save shape (rating only in the `derived` snapshot) resolves to 0 the moment buyTalent writes
// `derivedBonuses` — which locked every Force power on ten SHIPPED pregens. Behavioural proof lives in
// smoke_b41 (the C1/ fixtures); this pins the floor at source so it cannot be quietly dropped.
check('C1: frResolved is floored by the sensitivity value (never refuses what the flag allows)',
  /var frResolved\s*=\s*React\.useMemo\(function\(\)\s*\{\s*return Math\.max\(resolvedForceRating\(sheet\),\s*forceRating\);/.test(src));
check('C1: the floor names the legacy branch (R-DAR1) as its reason',
  /C1 \(ruling b41-min-force-rating[\s\S]{0,900}?R-DAR1/.test(src));
check('the CREATOR bridge adds Force Rating TALENT ranks to its base (derivedBonusesFromTalents)',
  /function creatorForceRating[\s\S]{0,500}?CharResolve\.derivedBonusesFromTalents\([\s\S]{0,200}?forceRatingBonus/.test(src));

// 5. Display: the requirement is rendered, and on every carrier — an enforced-but-invisible rule is
//    the defect this lap exists to end.
check('ForceRatingReq badge component defined exactly once', count(/function ForceRatingReq\s*\(/g) === 1);
// Each carrier asserted BY NAME. A bare occurrence count was blind here: the component's own doc
// comment counted toward the total, so dropping a real carrier still cleared the threshold.
// RE-POINTED, B-1688 (D-449; ruling `release-r7-bug-burndown` ADDENDA 445, 469): the legacy spec card that drew the badge went. KEEPS a named creator carrier: the live spec step
// states the requirement when it refuses, through the same arithmetic. DROPS the badge as that carrier's renderer.
check('carrier 1 — the CREATOR spec step states an unmet requirement (fcSpecWhy, from meetsForceRating)',
  /'Needs Force rating ' \+ gate\.needFR/.test(src) && /frRefused: needFR > 0 && !meetsForceRating\(sp, fcForceRating\)/.test(src));
// RE-POINTED (N-post, lap paper-sheet-delete step 4, 2026-09-30). The claim before: the NEW SPECIALIZATION
// journey card renders the badge, read as the dark face's `h(ForceRatingReq, { rec: rec …` — that card was
// deleted with the old sheet. After: the PAPER journey (B-657, NewSpecJourney's walk) states the requirement
// on BOTH its carriers — each shelf row and the preview's foot — through the same arithmetic
// (minForceRatingOf / meetsForceRating), in the words "REQUIRES FORCE RATING n". KEPT: a named carrier on
// the new-spec journey, by name. DROPPED: the ForceRatingReq component as that carrier's renderer.
check('carrier 2 — the NEW SPECIALIZATION journey states the requirement on its shelf row AND its preview foot',
  /needP\s*=\s*minForceRatingOf\(recP\),\s*frOkP\s*=\s*meetsForceRating\(recP,/.test(src) &&
  /!frOkP \? <span className="sb-refuse">\{'REQUIRES FORCE RATING ' \+ needP\}/.test(src) &&
  /pNeed\s*=\s*minForceRatingOf\(pRec\),\s*pFrOk\s*=\s*meetsForceRating\(pRec,/.test(src) &&
  /data-testid="nsj-refuse">\{'REQUIRES FORCE RATING ' \+ pNeed\}/.test(src));
check('carrier 3 — the compact force-power row (desktop ADVANCEMENT) renders the badge',
  /h\(ForceRatingReq,\s*\{\s*rec:\s*p\b/.test(src));
check('carrier 4 — the full force-power card renders the badge',
  /<ForceRatingReq\s+rec=\{p\}/.test(src));
check('the shared power list receives a forceRating prop from BOTH consumers',
  count(/forceRating[:=]\s*\{?(frResolved|forceRating|creatorForceRating)/g) >= 2);
check('the CONFIRM bar states the requirement rather than dying silently',
  /Requires Force rating/.test(src));

// 6. The data still carries what we now enforce — a registry regression that drops the field would
//    silently un-enforce the rule, which is precisely the state this lap ended.
const powers = JSON.parse(fs.readFileSync(path.join(root, 'public/data/canonical/force_powers.json'), 'utf8')).force_powers;
const specs = JSON.parse(fs.readFileSync(path.join(root, 'public/data/canonical/specializations.json'), 'utf8')).specializations;
const gatedPowers = Object.keys(powers).filter(function (k) { return powers[k].min_force_rating; });
const gatedSpecs = Object.keys(specs).filter(function (k) { return specs[k].min_force_rating; });
check('15 force powers carry min_force_rating', gatedPowers.length === 15);
check('3 specializations carry min_force_rating', gatedSpecs.length === 3);
check('18 records total — the board census still holds', gatedPowers.length + gatedSpecs.length === 18);
check('protect_unleash requires 3 (F&D CRB p.303)', powers.protect_unleash && powers.protect_unleash.min_force_rating === 3);
check('knight + general require 2, master 3 (RotS p.26, CotR p.28/29)',
  specs.knight.min_force_rating === 2 && specs.general.min_force_rating === 2 && specs.master.min_force_rating === 3);
check('padawan carries NO requirement — the ladder keeps a legal first Jedi spec at creation',
  !specs.padawan.min_force_rating);

// 7. Non-destructive: nothing strips an existing save. The lap gates ACQUISITION only.
check('no code path deletes/filters owned powers or specs on a failed prerequisite',
  !/meetsForceRating[\s\S]{0,200}?(splice|filter\(|delete )/.test(src));
check('buyForceUpgrade is NOT gated (owning the basic power already cleared the prerequisite)',
  !/function buyForceUpgrade[\s\S]{0,400}?meetsForceRating\(/.test(src));

console.log('');
if (failures) { console.error('min_force_rating guard: ' + failures + ' FAILED'); process.exit(1); }
console.log('min_force_rating guard: ALL PASS');
