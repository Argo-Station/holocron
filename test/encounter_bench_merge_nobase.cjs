/**
 * Guard — THE §4.2 UNMEASURED ROW, measured (`encounters-e2-manager-shape` §4.2 "Sync", card `encounters-e3-plumbing`
 * §4 ACCEPTANCE 4): what the adoption merge does, with NO BASE, for a bench group that has no `updatedAt`.
 *
 * MEASURED (this guard is the run; syncMerge.js is unchanged by E3):
 *   A. both copies unstamped (every v6 group), both changed → NOT chosen: local kept provisionally, one conflict asked.
 *      recency.newerOf refuses a missing stamp, so nothing is lost silently.
 *   B. one copy stamped (a v7 write), the other unstamped (a v6 device) → the SAME: asked, never "the stamped one wins".
 *   C. both stamped, both changed → the NEWER copy wins whole, silently — the ruled no-base rule for every stamped list
 *      (the characters' too); per-field (unit) merging needs the base. Not a v7 defect, so no fix is owed here.
 *   D. with a BASE, a group changed on one side per unit merges silently: the v7 group fields ride as units of their own.
 *
 * Run: node test/encounter_bench_merge_nobase.cjs — exit 0 green, 1 red.
 */
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const M = require(path.join(ROOT, 'lib/shared/syncMerge.js'));
const B = require(path.join(ROOT, 'lib/library/npc/benchStore.js'));

let fail = 0;
const check = (label, cond, detail) => {
  if (cond) console.log('  PASS  ' + label);
  else { fail++; console.log('  FAIL  ' + label + (detail !== undefined ? '  -> ' + JSON.stringify(detail) : '')); }
};
const KEY = 'swrpg_npc_bench';
const env = (groups, v) => ({ version: v, groups });
const grp = (extra) => Object.assign({ id: 'g1', name: 'Bay 94', arrangement: [], notes: '', vehicles: [],
  members: [{ id: 'm1', _source_key: '000', currentWounds: 0, currentStrain: 0, conditions: [], notes: '', count: 1, poolWounds: 0 }] }, extra);
const merge = (l, r, base) => {
  const local = {}, remote = {}; local[KEY] = l; remote[KEY] = r;
  return M.mergeAdoption(local, remote, base);
};

console.log('[A] both unstamped (v6), both changed, no base');
let a = merge(env([grp({ name: 'Bay 94 (laptop)' })], 6), env([grp({ notes: 'phone note' })], 6));
check('one conflict is asked for the group', a.conflicts.length === 1 && a.conflicts[0].id === 'g1' && a.conflicts[0].kind === 'record', a.conflicts);
check('local is kept provisionally; the remote copy rides the question', a.merged[KEY].groups[0].name === 'Bay 94 (laptop)' && a.conflicts[0].remote.notes === 'phone note');

console.log('[B] one stamped (v7 write), one unstamped (v6 device), no base');
let b = merge(env([B.normalize(env([grp({ name: 'v7 rename', state: 'running', updatedAt: 1762560000000 })], 7)).groups[0]], 7), env([grp({ notes: 'v6 note' })], 6));
check('still asked — the stamped copy does not win over an unstamped one', b.conflicts.length === 1, b.conflicts);
check('the higher envelope is emitted (v7), so a v6 store reading it holds (F-54)', b.merged[KEY].version === 7);

console.log('[C] both stamped, both changed, no base');
let c = merge(env([grp({ name: 'older', updatedAt: 1762560000000 })], 7), env([grp({ notes: 'newer', updatedAt: 1762560005000 })], 7));
check('the newer copy wins whole and nobody is asked', c.conflicts.length === 0 && c.merged[KEY].groups[0].notes === 'newer' && c.merged[KEY].groups[0].name === 'Bay 94');

console.log('[D] with a base: per unit');
const base = {}; base[KEY] = { g1: grp({ state: 'prepped', rounds: 0, campaignId: null, updatedAt: 1762560000000 }) };
let d = merge(env([grp({ state: 'done', rounds: 4, campaignId: null, updatedAt: 1762560001000 })], 7),
              env([grp({ state: 'prepped', rounds: 0, campaignId: null, notes: 'phone note', updatedAt: 1762560002000 })], 7), base);
const dg = d.merged[KEY].groups[0];
check('a one-sided state/rounds change and a one-sided notes change both survive, silently', d.conflicts.length === 0 && dg.state === 'done' && dg.rounds === 4 && dg.notes === 'phone note', dg);
check('the later stamp is kept', dg.updatedAt === 1762560002000);

console.log(fail ? '\n' + fail + ' FAILURE' + (fail === 1 ? '' : 'S') : '\nALL PASS');
process.exit(fail ? 1 : 0);
