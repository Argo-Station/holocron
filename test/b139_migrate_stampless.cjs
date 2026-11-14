#!/usr/bin/env node
/**
 * b139_migrate_stampless.cjs — D-B139-1, ruling `release-r7-bug-burndown` ADDENDUM 453 (amending 452): a deterministic
 * load-time migration or repair NEVER moves `updatedAt`, stamped or not; only a user's edit moves the clock. So a
 * stampless record still reaches the prompt (syncMerge §B.3), and a stamped one never beats a newer copy elsewhere.
 *
 * Every stamping migration seam of the roster, each with both legs, over the real modules:
 *   M  charResolve.js migrateRoster        (name-string talents → id-refs)
 *   L  roster.js loadSavedCharacters, the legacy double-nest lift
 *   X  roster.js loadSavedCharacters, the B-250 XP repair
 *   S  stampless leg: content migrated, `updatedAt` still absent
 *   T  stamped leg:   content migrated, `updatedAt` UNCHANGED (453 reverses 452's stamped leg)
 *   P  MOVED by B-1692 (ADDENDUM 484): KEEPS "no sync base + an exact stamp tie + different content → asks, both sides offered, neither lost",
 *      now as the rule with NO BUILD IN HAND (a cold merge; the GM and dice hosts). DROPS "this is what every merge does": with the build it is quiet,
 *      pinned there by test/b1692_quiet_migrate.cjs.
 *   B  MOVED by B-1692 (ADDENDUM 484): KEEPS "a base WITHOUT the migration, a migrated local, a newer remote → asks, the account's unit not lost",
 *      as the rule with no build in hand. DROPS "every merge"; with the build test/b1692_quiet_migrate.cjs pins it quiet, the account's XP kept.
 *   Q  the merge that follows, migration FIRST, against the account's stamped copy (T1 = a day ago):
 *      S: a stampless migrated local → mergeAdoption asks (1 conflict); the cut's minted stamp made it 0.
 *      T: a migrated local stamped T0 (a week ago) → the account's T1 copy is kept, quietly (453 item 4 (ii)).
 *
 * `--at <sha>` reads charResolve.js / roster.js from that commit (red at the cut: `--at fbc467388`, exit 1).
 * `--bite` re-runs once per mutant (each restores the stamp on a stampless record at one seam) and requires each to
 * fail the leg it names. Exit 0 every check passes · 1 otherwise.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const argAt = process.argv.indexOf('--at');
const AT = argAt > 0 ? process.argv[argAt + 1] : null;
const SRC = (rel) => AT ? execFileSync('git', ['show', AT + ':' + rel], { cwd: ROOT, encoding: 'utf8' })
  : (process.env['B139MS_' + path.basename(rel).replace('.js', '').toUpperCase()]
    ? fs.readFileSync(process.env['B139MS_' + path.basename(rel).replace('.js', '').toUpperCase()], 'utf8')
    : fs.readFileSync(path.join(ROOT, rel), 'utf8'));

// ── the mutants (--bite): [name, the leg it must fail, file, find, replace] — each restores a stamp at one seam ──
const M_FIND = 'if (rec && rec.sheetData && migrateSheet(rec.sheetData, charbuild).changed) changed = true;';
const MUTANTS = [
  ['M-restamp-all', 'M S', 'lib/shared/charResolve.js', M_FIND, 'if (rec && rec.sheetData && migrateSheet(rec.sheetData, charbuild).changed) { changed = true; rec.updatedAt = Date.now(); }'],
  ['M-restamp-stamped', 'M T', 'lib/shared/charResolve.js', M_FIND, 'if (rec && rec.sheetData && migrateSheet(rec.sheetData, charbuild).changed) { changed = true; if (rec.updatedAt > 1e12) rec.updatedAt = Date.now(); }'],
  ['L-restamp', 'L S', 'lib/shared/roster.js', '    rec.sheetData = sd.sheetData;\n', '    rec.sheetData = sd.sheetData; rec.updatedAt = Date.now();\n'],
  ['X-restamp-stamped', 'X T', 'lib/shared/roster.js', '        sd._xpRepairedAt = Date.now();\n', '        sd._xpRepairedAt = Date.now(); if (rec.updatedAt > 1e12) rec.updatedAt = Date.now();\n'],
  ['B-no-ask', 'B asks', 'lib/shared/syncMerge.js', "if (m3.asked) conflicts.push(", "if (false) conflicts.push("],
  ['P-tie-picks', 'P asks', 'lib/shared/recency.js', "if (aStamp === bStamp) return null;", "if (aStamp === bStamp) return 'a';"],
];

if (process.argv.includes('--bite')) {
  let bad = 0;
  const tmp = fs.mkdtempSync(path.join(process.env.CLAUDE_JOB_DIR ? path.join(process.env.CLAUDE_JOB_DIR, 'tmp') : os.tmpdir(), 'b139ms-'));
  for (const [name, leg, rel, find, repl] of MUTANTS) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    if (src.split(find).length !== 2) { console.log('  MISS  ' + name + ' — the find text is not in ' + rel + ' exactly once'); bad++; continue; }
    const out = path.join(tmp, name + '-' + path.basename(rel));
    fs.writeFileSync(out, src.replace(find, repl));
    const env = Object.assign({}, process.env, { ['B139MS_' + path.basename(rel).replace('.js', '').toUpperCase()]: out });
    const r = spawnSync(process.execPath, [__filename], { env, encoding: 'utf8' });
    const reds = (r.stdout.match(/^ {2}FAIL {2}(\S+ \S+)/gm) || []).map((l) => l.replace(/^ {2}FAIL {2}/, ''));
    const hit = reds.some((l) => l.startsWith(leg));
    console.log('  ' + (r.status === 1 && hit ? 'BIT ' : 'MISS') + '  ' + name.padEnd(12) + ' exit ' + r.status + ' · ' + reds.length + ' red · ' + leg + (hit ? ' red' : ' GREEN'));
    if (!(r.status === 1 && hit)) bad++;
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('\n' + (bad ? 'FAIL — ' + bad + ' mutant(s) not bitten' : 'PASS — ' + MUTANTS.length + '/' + MUTANTS.length + ' mutants bitten'));
  process.exit(bad ? 1 : 0);
}

let pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (detail !== undefined ? '  -> ' + JSON.stringify(detail) : '')); }
}

// The modules, from the tree (or --at / a mutant). charResolve is CommonJS; its `root` is null under node, so its
// recency read takes the require fallback, which needs the file beside it: load it from a temp dir holding both.
const dir = fs.mkdtempSync(path.join(process.env.CLAUDE_JOB_DIR ? path.join(process.env.CLAUDE_JOB_DIR, 'tmp') : os.tmpdir(), 'b139ms-mod-'));
for (const f of fs.readdirSync(path.join(ROOT, 'lib/shared'))) if (f.endsWith('.js')) fs.copyFileSync(path.join(ROOT, 'lib/shared', f), path.join(dir, f));
fs.writeFileSync(path.join(dir, 'charResolve.js'), SRC('lib/shared/charResolve.js'));
if (!AT) { fs.writeFileSync(path.join(dir, 'recency.js'), SRC('lib/shared/recency.js')); fs.writeFileSync(path.join(dir, 'syncMerge.js'), SRC('lib/shared/syncMerge.js')); }
const CR = require(path.join(dir, 'charResolve.js'));
const REC = require(path.join(dir, 'recency.js'));
const VG = require('../lib/shared/versionGuard.js');
const RP = require('../lib/shared/recordPortrait.js');
const MERGE = require(path.join(dir, 'syncMerge.js'));
// the registry, read as test/b977_readopt_migrates.cjs reads it (the app loader's section names)
const J = (n) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', n + '.json'), 'utf8'));
const un = (d, k) => (d && d[k]) || d;
const CB = { talents: un(J('talents'), 'talents'), species: un(J('species'), 'species'), careers: un(J('careers'), 'careers'),
  specializations: un(J('specializations'), 'specializations'), forcePowers: un(J('force_powers'), 'force_powers') };
const ROSTER_SRC = SRC('lib/shared/roster.js');
process.on('exit', () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* best effort */ } });

const T0 = 1793000000000, NOW = 1793500000000, KEY = 'swrpg_saved_characters';
const DICE = ['Beast Wrangler', 'Blooded'];
const legacy = (stamp) => { const r = { id: 'z', name: 'Zed', sheetData: { name: 'Zed', species: 'human', career: 'bounty_hunter', talents: DICE.slice(), xp: { total: 150, spent: 0, remaining: 150 } } }; if (stamp != null) r.updatedAt = stamp; return r; };
const idRefs = (r) => Array.isArray(r.sheetData.talents) && r.sheetData.talents.length === 2 && r.sheetData.talents.every((t) => t && t.id);
const has = (r) => Object.prototype.hasOwnProperty.call(r, 'updatedAt');

function at(t, fn) { const real = Date.now; Date.now = () => t; try { return fn(); } finally { Date.now = real; } }

// ── M · migrateRoster ──
const ms = legacy(null), mt = legacy(T0);
const mres = at(NOW, () => CR.migrateRoster([ms, mt], CB));
check('M (setup) both records migrated (id-refs) and the roster reports a change', mres.changed && idRefs(ms) && idRefs(mt));
check('M S the stampless record is LEFT stampless', !has(ms), ms.updatedAt);
check("M T the stamped record's clock is UNCHANGED", mt.updatedAt === T0, mt.updatedAt);

// ── L, X · roster.js load repairs, over a fake localStorage and the real globals ──
function loadRoster(records) {
  const store = { [KEY]: JSON.stringify({ version: 1, characters: records }) };
  const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  const FakeDate = class extends Date { static now() { return NOW; } };
  const win = { SWRPGVersionGuard: VG, CharResolve: CR, SWRPGRecordPortrait: RP, SWRPGRecency: REC };
  const ctx = vm.createContext({ window: win, localStorage, Date: FakeDate });
  vm.runInContext(ROSTER_SRC, ctx, { filename: 'roster.js' });
  const list = win.SWRPGRoster.loadSavedCharacters();
  return { list, stored: JSON.parse(store[KEY]).characters };
}
const nested = (stamp) => { const inner = legacy(null).sheetData; inner.characteristics = { brawn: 2 }; const r = { id: 'n' + (stamp ? 't' : 's'), name: 'Nest', sheetData: { name: 'Nest', sheetData: inner } }; if (stamp != null) r.updatedAt = stamp; return r; };
const L1 = loadRoster([nested(null), nested(T0)]);
const [ls, lt] = ['ns', 'nt'].map((id) => L1.stored.find((r) => r.id === id));
check('L (setup) both double-nested records lifted and written back', !!(ls && lt && ls.sheetData.characteristics && lt.sheetData.characteristics && !ls.sheetData.sheetData));
check('L S the stampless record is LEFT stampless', !!ls && !has(ls), ls && ls.updatedAt);
check("L T the stamped record's clock is UNCHANGED", !!lt && lt.updatedAt === T0, lt && lt.updatedAt);
const poisoned = (id, stamp) => { const r = legacy(stamp); r.id = id; r.sheetData.xp = { total: NaN, spent: 'x', remaining: null }; return r; };
const X1 = loadRoster([poisoned('xs', null), poisoned('xt', T0)]);
const [xs, xt] = ['xs', 'xt'].map((id) => X1.stored.find((r) => r.id === id));
check('X (setup) both poisoned budgets repaired and marked', !!(xs && xt && xs.sheetData._xpRepairedAt && xt.sheetData._xpRepairedAt));
check('X S the stampless record is LEFT stampless', !!xs && !has(xs), xs && xs.updatedAt);
check("X T the stamped record's clock is UNCHANGED", !!xt && xt.updatedAt === T0, xt && xt.updatedAt);

// ── P · the exact tie with no build in hand (ADDENDUM 457, moved by 484) ──
const unmigrated = legacy(T0), migratedHere = legacy(T0);
at(NOW, () => CR.migrateRoster([migratedHere], CB));
const pin = MERGE.mergeAdoption({ [KEY]: [migratedHere] }, { [KEY]: [unmigrated] });
const pc = pin.conflicts[0] || {};
check('P asks: no base, an exact stamp tie, different content → 1 question', pin.conflicts.length === 1 && pc.id === 'z', pin.conflicts.length);
check('P both sides are offered, neither lost', idRefs(pc.local || { sheetData: {} }) && !idRefs(pc.remote || { sheetData: {} }) && !!(pc.remote && pc.remote.sheetData));

// ── B · a base without the migration, with no build in hand (ADDENDUM 472 R2, moved by 484) ──
const baseCopy = legacy(T0), migratedB = legacy(T0);
at(NOW, () => CR.migrateRoster([migratedB], CB));
const T1b = NOW - 86400000;
const remoteB = legacy(T1b); remoteB.sheetData.xp = { total: 275, spent: 0, remaining: 275 };
const pinB = MERGE.mergeAdoption({ [KEY]: [migratedB] }, { [KEY]: [remoteB] }, { [KEY]: { z: baseCopy } });
const bc = pinB.conflicts[0] || {};
check('B asks: base without the migration, a migrated local, a newer remote → 1 question', pinB.conflicts.length === 1 && bc.id === 'z', pinB.conflicts.length);
check("B both sides are offered, the account's unit not lost", !!(bc.local && bc.remote) && idRefs(bc.local) && bc.remote.sheetData.xp.total === 275 && bc.local.sheetData.xp.total === 150,
  { local: bc.local && bc.local.sheetData.xp, remote: bc.remote && bc.remote.sheetData.xp });

// ── Q · migration first, then the adoption merge against the account's stamped copy ──
const local = legacy(null);
at(NOW, () => CR.migrateRoster([local], CB));
const remote = legacy(T0); remote.sheetData.xp = { total: 275, spent: 0, remaining: 275 };      // edited on the other device
const out = MERGE.mergeAdoption({ [KEY]: [local] }, { [KEY]: [remote] });
check('Q S migration first: the merge ASKS (1 conflict), the local record unstamped', out.conflicts.length === 1 && !has(local),
  { conflicts: out.conflicts.length, localStamp: local.updatedAt });
const localT = legacy(T0);
at(NOW, () => CR.migrateRoster([localT], CB));
const T1 = NOW - 86400000;                                         // edited elsewhere a day before this load (> T0)
const remoteT = legacy(T1); remoteT.sheetData.xp = { total: 275, spent: 0, remaining: 275 };
const outT = MERGE.mergeAdoption({ [KEY]: [localT] }, { [KEY]: [remoteT] });
const keptT = (function (v) { return (Array.isArray(v) ? v : (v && v.characters) || [])[0] || {}; })(outT.merged[KEY]);
check("Q T migrated local T0 vs the account's T1: quiet, T1 kept (XP 275)", outT.conflicts.length === 0 && keptT.updatedAt === T1 && keptT.sheetData && keptT.sheetData.xp.total === 275,
  { conflicts: outT.conflicts.length, kept: keptT.updatedAt, xp: keptT.sheetData && keptT.sheetData.xp });

console.log('\n  b139 migrate stampless' + (AT ? ' @ ' + AT : '') + ': ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
