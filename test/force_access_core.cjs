#!/usr/bin/env node
/**
 * force_access_core.cjs — Force access at creation resolves ONCE, in the shared core.
 *
 * The four-clause rule (fad line ∨ FaD career ∨ Force-granting spec ∨ innate species FR) used to be
 * written in both the creator's controller (`_hasForceAccess`: gates the Force-powers step and the
 * Morality layering) and the sheet assembly (forceRatingBase). The exception census flagged the
 * DUPLICATE; `CharResolve.forceAccessAtCreation` is now the one implementation and app.jsx reads it.
 * Pinned on the shipped registries: every FaD career grants access in any line; the four FR-granting
 * universal specs grant it; an ordinary EotE build does not; app.jsx no longer carries the disjunction.
 */
const fs = require('fs'); const path = require('path'); const assert = require('assert');
const ROOT = path.join(__dirname, '..');
const R = require(path.join(ROOT, 'lib/shared/charResolve.js'));
const careers = Object.values(JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical/careers.json'), 'utf8')).careers);
const specs = Object.values(JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical/specializations.json'), 'utf8')).specializations);
let n = 0; const ok = (l, c, d) => { n++; assert(c, l + (d ? ' — ' + d : '')); console.log('  ok', l); };
const F = R.forceAccessAtCreation;
ok('exported', typeof F === 'function');
ok('EotE, no career/spec/species → no access', F('eote', null, null, null) === false);
ok('FaD line alone → access', F('fad', null, null, null) === true);
const fadCareers = careers.filter(c => Number(c.force_rating) >= 1);
ok(`every FaD career grants access in EotE (${fadCareers.length} careers)`, fadCareers.length >= 8 && fadCareers.every(c => F('eote', null, c, null)));
ok('a non-Force career does not', F('aor', null, careers.find(c => c.name === 'Smuggler'), null) === false);
const frSpecs = specs.filter(s => Number(s.force_rating) >= 1);
ok(`every FR-granting spec grants access (${frSpecs.length})`, frSpecs.length >= 4 && frSpecs.every(s => F('aor', null, null, s)));
ok('innate species FR grants access (fixture — no shipped carrier)', F('eote', { force_rating: 1 }, null, null) === true && F('eote', { force_rating: 0 }, null, null) === false);
const app = fs.readFileSync(path.join(ROOT, 'player/app.jsx'), 'utf8');
ok('app.jsx no longer carries the disjunction (reads the core)', !/gameLine === 'fad'\s*\|\|\s*!!\(selectedCareerData/.test(app) && /CharResolve\.forceAccessAtCreation\(/.test(app));
const core = fs.readFileSync(path.join(ROOT, 'lib/shared/charResolve.js'), 'utf8');
ok('the sheet assembly reads the same function', (core.match(/forceAccessAtCreation\(/g) || []).length >= 2);
console.log(`force_access_core: ${n} checks passed`);

// ── creationFreePicks — the pick-count arithmetic, once (fix 4) ──────────────────────────────────
{
  const species = Object.values(JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical/species.json'), 'utf8')).species);
  const P = R.creationFreePicks;
  const droid = species.find(s => s.name === 'Droid'), human = species.find(s => s.id === 'human');
  const smuggler = careers.find(c => c.name === 'Smuggler'), consular = careers.find(c => c.name === 'Consular');
  ok('creationFreePicks exported', typeof P === 'function');
  ok('Human + Smuggler → 4 career / 2 spec', JSON.stringify(P(human, smuggler)) === '{"career":4,"spec":2}', JSON.stringify(P(human, smuggler)));
  ok('Human + Consular (FaD) → 3 career / 2 spec', P(human, consular).career === 3 && P(human, consular).spec === 2);
  ok('Droid + Smuggler → 6 career / 3 spec (bonus_free_ranks)', P(droid, smuggler).career === 6 && P(droid, smuggler).spec === 3);
  ok('no species / no career → 4 / 2', JSON.stringify(P(null, null)) === '{"career":4,"spec":2}');
  ok('app.jsx no longer reads bonus_free_ranks raw', !/\.bonus_free_ranks\) \|\| \{\}/.test(app.replace(/\/\/[^\n]*/g, '')) && /CharResolve\.creationFreePicks\(/.test(app));
  console.log('creationFreePicks: pinned');
}

// ── specGate + costForNewSpec — the spec gates and cost, once (fix 2) ───────────────────────────
{
  const G = R.specGate, C = R.costForNewSpec;
  const knight = specs.find(s => s.name === 'Knight'), master = specs.find(s => s.name === 'Master'), rct = specs.find(s => /Retired Clone Trooper/.test(s.name));
  const exile = specs.find(s => /Force Sensitive Exile/.test(s.name)), sage = specs.find(s => s.name === 'Sage');
  const consular = careers.find(c => c.name === 'Consular');
  ok('specGate exported; a spec with no gates is met', typeof G === 'function' && G(sage, { forceRating: 0, speciesId: 'human' }).met === true);
  ok('Knight needs FR 2: refused at 1 with the reason, met at 2', !G(knight, { forceRating: 1 }).met && G(knight, { forceRating: 1 }).needForce === 2 && G(knight, { forceRating: 2 }).met);
  ok('Master needs FR 3', G(master, { forceRating: 2 }).met === false && G(master, { forceRating: 3 }).met === true);
  ok('Retired Clone Trooper requires the clone species: refused for a Human, met for a clone, met when species is unknown', !G(rct, { speciesId: 'human' }).met && G(rct, { speciesId: 'human' }).needSpecies === 'clone' && G(rct, { speciesId: 'clone' }).met && G(rct, {}).met);
  const gated = specs.filter(s => s.min_force_rating != null);
  ok(`every min_force_rating carrier is refused one below its floor (${gated.length})`, gated.length >= 3 && gated.every(s => !G(s, { forceRating: s.min_force_rating - 1 }).met && G(s, { forceRating: s.min_force_rating }).met));
  ok('meetsForceRating reads a Force POWER record too (a power with no floor is met at FR 1)', R.meetsForceRating({ name: 'Sense' }, 1) === true && R.meetsForceRating({ min_force_rating: 2 }, 1) === false);
  ok('cost: first in-career spec is free', C(sage, 0, consular) === 0);
  ok('cost: second in-career spec is 20', C(sage, 1, consular) === 20);
  ok('cost: universal spec is base (20 at owned 1), never +10', exile.universal === true && C(exile, 1, careers.find(c => c.name === 'Smuggler')) === 20);
  ok('cost: another career\'s spec is base + 10 (30 at owned 1)', C(knight, 1, careers.find(c => c.name === 'Smuggler')) === 30);
  ok('app.jsx wraps the core (no second implementation of the gate or the cost)', /function meetsForceRating\(rec, forceRating\) \{ return CharResolve\.meetsForceRating/.test(app) && /function costForNewSpec\([^)]*\) \{ return CharResolve\.costForNewSpec/.test(app) && !/min_force_rating\);\s*return n > 0/.test(app));
  console.log('specGate + costForNewSpec: pinned');
}

// ── computeMechanic — the narrative mechanic engine, out of the shell (fix 3) ────────────────────
{
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/narrative-mechanics.json'), 'utf8'));
  const M = R.computeMechanic, MR = R.mechanicRecord;
  ok('computeMechanic + mechanicRecord + inferRuleset exported', typeof M === 'function' && typeof MR === 'function' && typeof R.inferRuleset === 'function');
  const o = M('obligation', 10, 'debt', ['eote_obl_plus5_for_xp5'], cfg);
  ok('obligation 10 + one trade → final 15, +5 XP, one entry at 15', o.finalValue === 15 && o.xpAdjustment === 5 && o.creditAdjustment === 0 && o.entries.length === 1 && o.entries[0].magnitude === 15);
  ok('duplicate trade ids collapse', M('obligation', 10, 'debt', ['eote_obl_plus5_for_xp5', 'eote_obl_plus5_for_xp5'], cfg).finalValue === 15);
  ok('trades over the base cap → null (maxAbsDeltaEqualsBase)', M('obligation', 10, 'debt', ['eote_obl_plus10_for_xp10', 'eote_obl_plus5_for_xp5'], cfg) === null);
  ok('unknown mechanic / no config → null', M('honor', 10, '', [], cfg) === null && M('duty', 10, '', [], null) === null);
  const every = Object.keys(cfg.mechanics).map(t => M(t, 10, 'x', [], cfg));
  ok(`every configured mechanic resolves with no trades (${every.length})`, every.length === 3 && every.every(m => m && m.finalValue === 10 && m.tradeIds.length === 0));
  ok('inferRuleset maps the three lines', R.inferRuleset('Edge of the Empire') === 'obligation' && R.inferRuleset('Age of Rebellion') === 'duty' && R.inferRuleset('Force and Destiny') === 'morality' && R.inferRuleset('CSG') === null);
  ok('mechanicRecord defaults entries to one at the final value, keeps given entries', MR({ type: 'duty', descriptor: 'k', baseValue: 5, finalValue: 20 }).entries[0].magnitude === 20 && MR({ type: 'duty', entries: [{ type: 'a', magnitude: 1 }, { type: 'b', magnitude: 2 }] }).entries.length === 2);
  const shell = fs.readFileSync(path.join(ROOT, 'player/index.html'), 'utf8');
  ok('the shell forwards to the core (no engine body left inline)', /computeMechanic\([^)]*\)\s*\{\s*return window\.CharResolve\.computeMechanic/.test(shell) && !/maxAbsDeltaEqualsBase/.test(shell));
  const ogg = fs.readFileSync(path.join(ROOT, 'lib/shared/oggImport.js'), 'utf8');
  ok('oggImport builds the record through the core, not by hand', /_CR\.mechanicRecord\(/.test(ogg) && !/xpAdjustment: 0, creditAdjustment: 0, tradeIds: \[\]/.test(ogg));
  console.log('computeMechanic: pinned');
}
