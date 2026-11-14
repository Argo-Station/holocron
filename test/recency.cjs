#!/usr/bin/env node
/**
 * recency.cjs — the C-B-8 stamp repairs and the comparison rule that refuses to guess.
 * Ruling `f34-phase-b-foundations` §3 C-B-8, resting on Docs/SYNC_RECENCY_AUDIT.md.
 *
 * The audit found "newest wins per record" computable for ONE of seven synced lists. The danger in
 * that answer is not the missing stamps — it is the heuristics that would fill them in. Most of the
 * asserts below exist to prove the module keeps returning `null` instead of a plausible guess.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const R = require('../lib/shared/recency.js');

let pass = 0, fail = 0;
const check = (label, cond, detail) => {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (detail !== undefined ? '  -> ' + JSON.stringify(detail) : '')); }
};

console.log('recency — C-B-8: real stamps, and a comparison that refuses to guess\n');

// ── the rule: comparable only when BOTH are ms ───────────────────────────────
const T = 1786036920326, T2 = 1786036920999;
check('ms vs ms → the later one wins', R.newerOf(T2, T) === 'a' && R.newerOf(T, T2) === 'b');
check('an exact TIE is not a winner — it is a conflict', R.newerOf(T, T) === null);
check('a DAY-STRING is never compared (vessels wrote these; they are still in browsers)',
  R.newerOf('2026-08-06', T) === null && R.newerOf(T, '2026-08-06') === null);
check('two day-strings are not compared even when they differ',
  R.newerOf('2026-08-07', '2026-08-06') === null);
check('a MISSING stamp is never compared',
  R.newerOf(undefined, T) === null && R.newerOf(T, null) === null && R.newerOf(undefined, undefined) === null);
check('junk is never compared', R.newerOf(NaN, T) === null && R.newerOf('banana', T) === null);
check('a small integer is NOT an ms stamp (a version, a count, a 0)',
  R.isMsStamp(0) === false && R.isMsStamp(1) === false && R.isMsStamp(2) === false);
check('a real ms epoch IS one', R.isMsStamp(T) === true && R.isMsStamp(Date.now()) === true);

// ── the field, named so the merge cannot reach for the wrong one ─────────────
check('stampOf reads updatedAt', R.stampOf({ updatedAt: T }) === T);
check('stampOf is null-safe', R.stampOf(null) === undefined && R.stampOf(undefined) === undefined);
check('stampOf does NOT read lastOpenedAt (open-only; the roster UI sorts by it)',
  R.stampOf({ lastOpenedAt: T }) === undefined);
check('the module says WHY lastOpenedAt is excluded, not just that it is',
  /lastOpenedAt[\s\S]{0,200}OPENED/.test(read('lib/shared/recency.js')));
check('the module states the refusal rule in full (never order, never assume-local, never stamp-at-merge)',
  /NEVER array order\. NEVER assume-local-is-newer\. NEVER stamp-at-merge-time\./.test(read('lib/shared/recency.js')));

// ── C-B-8.1: the roster's two migration write-backs stamp ────────────────────
const app = read('player/app.jsx');
// R-SCGS-1: the roster block (the lift included) lives in lib/shared/roster.js, lifted verbatim inside a two-space wrapper
// indent; read with that indent removed, the regex below measures the same lines it measured in player/app.jsx.
const roster = read('lib/shared/roster.js').replace(/^ {2}/gm, '');
const cr = read('lib/shared/charResolve.js');
// RE-POINTED (ADDENDUM 453 item 6): KEEPS the lift-source read; DROPS "the lift stamps" — a repair is not an edit.
check('ADDENDUM 453 the legacy double-nest lift does NOT stamp updatedAt',
  /rec\.sheetData = sd\.sheetData;/.test(roster) && !/rec\.sheetData = sd\.sheetData;[\s\S]{0,400}?rec\.updatedAt =/.test(roster));
// RE-POINTED (ADDENDUM 455): KEEPS the read of migrateRoster's changed test; DROPS the stamp regex — no stamp is written
// after it. The old "does NOT stamp records it did not change" regex went vacuous; it is now behavioural (it bites).
check('ADDENDUM 453 migrateRoster writes no stamp after its changed test',
  /migrateSheet\(rec\.sheetData, charbuild\)\.changed\)/.test(cr)
  && !/migrateSheet\(rec\.sheetData, charbuild\)\.changed\)[\s\S]{0,160}?updatedAt\s*=/.test(cr));
{
  const CR = require('../lib/shared/charResolve.js');
  const J = (n) => JSON.parse(read('public/data/canonical/' + n + '.json'));
  const un = (d, k) => (d && d[k]) || d;
  const CB = { talents: un(J('talents'), 'talents'), species: un(J('species'), 'species'), careers: un(J('careers'), 'careers'),
    specializations: un(J('specializations'), 'specializations'), forcePowers: un(J('force_powers'), 'force_powers') };
  const T = 1786000000000;
  const changed = { id: 'c', updatedAt: T, sheetData: { talents: ['Grit'] } };
  const same = { id: 'u', updatedAt: T + 1, sheetData: { talents: [{ id: 'grit', rank: 1 }] } };
  const realNow = Date.now; Date.now = () => T + 9e6;
  let res; try { res = CR.migrateRoster([changed, same], CB); } finally { Date.now = realNow; }
  check('ADDENDUM 453 LIVE: a changed record and an unchanged one both keep their stamps',
    res.changed === true && changed.sheetData.talents[0] && changed.sheetData.talents[0].id === 'grit'
    && changed.updatedAt === T && same.updatedAt === T + 1, { changed: changed.updatedAt, same: same.updatedAt });
}
check('C-B-8.1 the caller no longer tries to stamp via a flag migrateRoster never set',
  !/__migrated/.test(app));

// ── C-B-8.2: vessels stamp ms, humans still read dates ───────────────────────
const vs = read('lib/shared/vesselStore.js');
check('C-B-8.2 the store owns an ms stamp', /function msNow\(\) \{ try \{ return Date\.now\(\); \}/.test(vs));
check('C-B-8.2 updateVessel stamps ms, not the caller\'s day-string',
  /updateVessel[\s\S]{0,300}?updatedAt: msNow\(\)/.test(vs) && !/updatedAt: now \|\| r\.updatedAt/.test(vs));
check('C-B-8.2 appendProvenance stamps ms', /appendProvenance[\s\S]{0,400}?updatedAt: msNow\(\)/.test(vs));
check('C-B-8.2 removeAttachment — the path the audit found skipping the stamp — now stamps',
  /removeAttachment[\s\S]{0,400}?updatedAt: msNow\(\)/.test(vs));
check('C-B-8.2 the HUMAN-facing `when` still comes from the caller (readable dates survive)',
  /when: opts\.when \|\| \(now \|\| null\)/.test(vs));

// behavioural: the split actually holds when the store runs
const sandbox = { window: undefined };
new Function(read('lib/shared/vesselStore.js')).call(sandbox);
const V = sandbox.SWRPGVessels;
const acq = V.acquire({ v: 2, vessels: [] }, 'yt1300', { owner: 'me', note: 'Acquired.' }, '2026-08-06');
const rec0 = acq.state.vessels[0];
check('LIVE: acquire stamps updatedAt as ms', R.isMsStamp(rec0.updatedAt), rec0.updatedAt);
check('LIVE: acquired.when stays a readable date', rec0.acquired.when === '2026-08-06');
const upd = V.updateVessel(acq.state, acq.id, { nickname: 'Falcon' }, '2026-08-06');
check('LIVE: updateVessel stamps ms', R.isMsStamp(upd.vessels[0].updatedAt));
check('LIVE: provenance `when` survives the update as a date',
  upd.vessels[0].provenance[0].when === '2026-08-06');
// The point of C-B-8.2, expressed as the thing the OLD stamp could not do: distinguish two edits
// inside one day. Asserted on a 1ms difference rather than by racing two real calls — two
// `Date.now()`s in the same millisecond legitimately tie, and a tie correctly returns null. (First
// version of this assert did race them, and its red was the clock, not the code.)
const sameDayEarlier = rec0.updatedAt;
const sameDayLater = rec0.updatedAt + 1;
check('LIVE: two edits inside ONE DAY are now orderable — the exact case the day-string could not express',
  R.newerOf(sameDayLater, sameDayEarlier) === 'a');
check('LIVE: and the legacy day-string form is still refused rather than mis-ordered',
  R.newerOf('2026-08-06', '2026-08-05') === null);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
