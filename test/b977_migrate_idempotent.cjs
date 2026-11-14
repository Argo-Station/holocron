// B-977 C1/C2 (ruling `release-r7-bug-burndown` ADDENDUM 93): `CharResolve.migrateRoster` is IDEMPOTENT. An entry a past pass
// marked `_legacy` that still does not resolve is kept as it is (keys, order, no re-mark) and is not a change, so the
// migration on every landing (`migrateStoredRoster`, ADDENDUM 81) cannot re-stamp a record forever across tabs and devices.
// The browser half (no storage event between tabs after the settle) is scripts/smoke_b977_adopted_legacy_migrates.py N.
//   P1  pass 1 over one record holding every marking branch — a resolvable talent (Grit), an unknown talent, an unranked
//       duplicate (Quick Draw ×2), an unknown Force power, a power with an unknown upgrade key (Influence + a made-up
//       key) — is a change, stamps updatedAt, and marks each unresolved entry.
//   P2/P3  passes 2 and 3: changed=false, updatedAt unchanged, the record's JSON byte-equal.
//   G   POSITIVE: a marked entry whose name the registry LATER gains migrates on the next pass (a real change).
// B977_CR=<path> requires another charResolve.js (the bite: abb917264's file), never written by this guard.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const CR = require(process.env.B977_CR || path.join(ROOT, 'lib/shared/charResolve.js'));

let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (detail !== undefined ? '  -> ' + JSON.stringify(detail) : '')); }
}

const J = (n) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', n + '.json'), 'utf8'));
const un = (d, k) => (d && d[k]) || d;
const CB = { talents: un(J('talents'), 'talents'), forcePowers: un(J('force_powers'), 'force_powers'), careers: {}, species: {} };
check('HARNESS Grit is ranked, Quick Draw unranked, Influence has influencecontrol1',
  CB.talents.grit && CB.talents.grit.ranked && CB.talents.quick_draw && !CB.talents.quick_draw.ranked
  && CB.forcePowers.influence && (CB.forcePowers.influence.abilities || {}).influencecontrol1);

const T0 = 1786000000000;
const rec = { id: 'b977_idem', updatedAt: T0, sheetData: {
  talents: ['Grit', 'My Homebrew Knack', 'Quick Draw', 'Quick Draw'],
  forcePowers: [{ name: 'My Homebrew Power' }, { name: 'Influence', upgrades: ['influencecontrol1', 'no_such_upgrade'] }],
} };

let t = T0 + 1000;
const realNow = Date.now;
function passAt() { t += 1000; Date.now = () => t; try { return CR.migrateRoster([rec], CB); } finally { Date.now = realNow; } }

const r1 = passAt();
const tal = rec.sheetData.talents, fp = rec.sheetData.forcePowers;
// RE-POINTED (ADDENDUM 455): KEEPS "a change"; DROPS "stamps updatedAt" (453: a migration is not an edit).
check('P1 pass 1 is a change and leaves updatedAt unchanged', r1.changed === true && rec.updatedAt === T0, { changed: r1.changed, updatedAt: rec.updatedAt });
check('P1 Grit migrates to an id-ref', tal.some((e) => e && e.id === 'grit' && e.name == null), tal);
check('P1 the unknown talent is marked', tal.some((e) => e && e.name === 'My Homebrew Knack' && e._legacy === true), tal);
check('P1 the unranked duplicate is kept as two marked entries', tal.filter((e) => e && e.name === 'Quick Draw' && e._legacy === true).length === 2, tal);
check('P1 the unknown power is marked', fp.some((e) => e && e.name === 'My Homebrew Power' && e._legacy === true), fp);
check('P1 the power with an unknown upgrade stays whole, marked', fp.some((e) => e && e.name === 'Influence' && e._legacy === true
  && JSON.stringify(e.upgrades) === JSON.stringify(['influencecontrol1', 'no_such_upgrade'])), fp);

for (const n of [2, 3]) {
  const before = JSON.stringify(rec), stamp = rec.updatedAt;
  const r = passAt();
  check('P' + n + ' pass ' + n + ' is no change (changed=false)', r.changed === false, r.changed);
  check('P' + n + ' updatedAt unchanged', rec.updatedAt === stamp, { before: stamp, after: rec.updatedAt });
  check('P' + n + " the record's JSON is byte-equal", JSON.stringify(rec) === before);
}

// G — the registry gains the homebrew talent's name: the marked entry migrates on the next pass
const CB2 = Object.assign({}, CB, { talents: Object.assign({}, CB.talents, {
  my_homebrew_knack: { id: 'my_homebrew_knack', name: 'My Homebrew Knack', ranked: false } }) });
const stampG = rec.updatedAt;
t += 1000; Date.now = () => t;
let rG; try { rG = CR.migrateRoster([rec], CB2); } finally { Date.now = realNow; }
// RE-POINTED (ADDENDUM 455): KEEPS changed=true; DROPS "stamped" (453).
check('G a marked entry the registry now resolves migrates (changed=true, updatedAt unchanged)', rG.changed === true && rec.updatedAt === stampG,
  { changed: rG.changed, updatedAt: rec.updatedAt, stampG: stampG });
check('G it is an id-ref now', rec.sheetData.talents.some((e) => e && e.id === 'my_homebrew_knack' && e.name == null), rec.sheetData.talents);
check('G and the entries still unresolved are untouched', rec.sheetData.talents.filter((e) => e && e.name === 'Quick Draw' && e._legacy).length === 2);

console.log('\n  B-977 migrate idempotent: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
