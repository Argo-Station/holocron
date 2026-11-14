// B-977 — a record that LANDS (sync's adopted/rechecked/resolved, the roster `storage` event) passes through the roster
// migration, by the ONE body the mount uses. Ruling `release-r7-bug-burndown` ADDENDUM 81 (Q1 → (A), on paper there, R-Y2-1).
// The browser half (a legacy record adopted after mount is stored migrated before any reload; a no-op writes nothing;
// warm-or-wait; an open sheet takes the migrated copy) is scripts/smoke_b977_adopted_legacy_migrates.py.
//   W1  player/app.jsx names the migration body ONCE (`function migrateStoredRoster`), and `migrateRoster` is called
//       nowhere else in the file.
//   W2  the mount effect calls it.
//   W3  the landing handler calls it, and every landing (the storage event, sync's three events) goes through that handler.
//   W4  the body leaves storage alone on a no-op (`if (!res.changed) return null;` before any write).
//   Q   condition 4: two devices migrating the same legacy record give the same content and two ms stamps, and
//       `mergeAdoption` merges them QUIETLY (the newer wins), in both directions.
//   E   the defect's read: as name strings the talents give `ownedTalentPoolSources` nothing; migrated, both.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const CR = require(path.join(ROOT, 'lib/shared/charResolve.js'));
const M = require(path.join(ROOT, 'lib/shared/syncMerge.js'));

let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (detail !== undefined ? '  -> ' + JSON.stringify(detail) : '')); }
}

// B977_APP=<path> reads another app.jsx (the bite: the cut's file), never written by this guard
const src = fs.readFileSync(process.env.B977_APP || path.join(ROOT, 'player/app.jsx'), 'utf8');
const defs = src.split('function migrateStoredRoster(').length - 1;
check('W1 the migration body is named once (function migrateStoredRoster)', defs === 1, defs);
const migrateCalls = (src.match(/CharResolve\.migrateRoster\(/g) || []).length;
check('W1 and CharResolve.migrateRoster is called only inside it (once in the file)', migrateCalls === 1, migrateCalls);
const body = defs === 1 ? src.slice(src.indexOf('function migrateStoredRoster('), src.indexOf('\n}\n', src.indexOf('function migrateStoredRoster(')) + 2) : '';
const noop = body.indexOf('if (!res.changed) return null;'), write = body.indexOf('writeSavedCharacters(');
check('W4 a no-op returns before any write (no stamp moves, nothing is written)', noop > 0 && write > noop, { noop, write });
check('W2 the mount effect calls it', /loadCanonicalRegistries\(\);\s*\n\s*migrateStoredRoster\(\)\.then/.test(src));
const landing = src.slice(src.indexOf('function onLanding()'), src.indexOf('function onLanding()') + 400);
check('W3 the landing handler re-adopts, then migrates', src.indexOf('function onLanding()') > 0
  && /readoptStored\(\);\s*\n\s*migrateStoredRoster\(\)\.then/.test(landing), landing.slice(0, 200));
check('W3 the roster storage event goes through the landing handler',
  /e\.key === ROSTER_STORAGE_KEY\) onLanding\(\)/.test(src));
check("W3 sync's three events go through the landing handler",
  /type === 'adopted' \|\| type === 'rechecked' \|\| type === 'resolved'\) onLanding\(\)/.test(src));

// ── the registry, read the way the app's loader names its sections ──
const J = (n) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', n + '.json'), 'utf8'));
const un = (d, k) => (d && d[k]) || d;
const CB = { talents: un(J('talents'), 'talents'), species: un(J('species'), 'species'), careers: un(J('careers'), 'careers'),
  specializations: un(J('specializations'), 'specializations'), forcePowers: un(J('force_powers'), 'force_powers') };
const DICE = ['Beast Wrangler', 'Blooded'];
check('HARNESS the two talents carry dice in the registry', DICE.every((n) => Object.values(CB.talents).some((t) => t.name === n && Array.isArray(t.pool_mods) && t.pool_mods.length)));
const legacyRec = () => ({ id: 'z', name: 'Zed', sheetData: { name: 'Zed', species: 'human', career: 'bounty_hunter', talents: DICE.slice() } });

// E — the defect's read
const legacy = legacyRec();
check('E legacy name-string talents give the pool nothing', CR.ownedTalentPoolSources(legacy.sheetData, CB).length === 0);
const migrated = legacyRec();
CR.migrateRoster([migrated], CB);
check('E migrated, both talents give the pool their dice', CR.ownedTalentPoolSources(migrated.sheetData, CB).length === 2,
  CR.ownedTalentPoolSources(migrated.sheetData, CB).map((s) => s.id));

// Q — condition 4: two devices, two migrations, one quiet merge
const realNow = Date.now;
function migrateAt(t) { Date.now = () => t; try { const r = legacyRec(); CR.migrateRoster([r], CB); return r; } finally { Date.now = realNow; } }
const a = migrateAt(1793000000000), b = migrateAt(1793000009000);
// RE-POINTED (ADDENDUM 453 item 6): KEEPS the zero-conflict merge; DROPS "the migration stamps" (a migration is not an edit).
check('Q (setup) neither migration stamps (ADDENDUM 453)', !('updatedAt' in a) && !('updatedAt' in b), [a.updatedAt, b.updatedAt]);
const strip = (r) => { const c = JSON.parse(JSON.stringify(r)); delete c.updatedAt; return c; };
check('Q (setup) and give the same content', JSON.stringify(strip(a)) === JSON.stringify(strip(b)));
for (const [label, l, r] of [['A local, B remote', a, b], ['B local, A remote', b, a]]) {
  const out = M.mergeAdoption({ swrpg_saved_characters: [l] }, { swrpg_saved_characters: [r] });
  const kept = out.merged.swrpg_saved_characters;
  const k = (Array.isArray(kept) ? kept : kept.characters)[0];
  check('Q ' + label + ': merges QUIETLY (0 conflicts), the record kept stampless', out.conflicts.length === 0 && !('updatedAt' in k),
    { conflicts: out.conflicts.length, kept: k.updatedAt });
}

console.log('\n  B-977 readopt migrates: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
