#!/usr/bin/env node
/**
 * mods_user_stamp_tolerated.cjs — B-853 (ruling f100-ud1-respec-stamp-assert R-FRS-4 §5).
 *
 * A character made on a UD-1 build carries `user:` stamps in `sheet.mods` (R-FUD-5: `user:my_data`,
 * ON by default, plus `user:<id>@<v12>` for imported packs). Before this row, mods.js fetched such a
 * stamp as a variant pack (`packPath` → public/data/mods/user:my_data//…), the fetch failed, the stamp
 * entered `failed()`, and the ADVANCEMENT tab showed a FALSE "reSpecialized data didn't load" notice
 * whose RETRY could never clear it. This guard pins the fix on the build that ships BEFORE UD-1:
 *   1. a `user:` stamp is NEVER fetched (no request path carries `user:`);
 *   2. it never enters `failed()`, so SheetAdvancement's predicate (copied verbatim below from
 *      player/app.jsx SheetAdvancement `_modsNotice`) stays false;
 *   3. it is NEUTRAL: resolveForStamp(stamps) == resolveForStamp(stamps without the user: ones).
 * CONTROLS keep the instrument honest: the respec-only and empty lists show no notice, and an unknown
 * NON-user stamp still fails and still shows the notice (so a guard blind to failures cannot pass).
 * Every row runs under BOTH ways a missing path answers: the SPA fallback (HTML, 200) and a 404.
 *
 * Run: node test/mods_user_stamp_tolerated.cjs
 */
const path = require('path');
const MODS_PATH = path.resolve(__dirname, '..', 'lib/shared/mods.js');

let failures = 0, harvest = 0;
const fail = (m) => { failures += 1; console.error('  FAIL  ' + m); };

// A minimal base + the two shipped respec stamps' overlay files, served by the stub.
const BASE = {
  species: {}, careers: {},
  specializations: { scoundrel: { id: 'scoundrel', talent_tree: [{ cost: 5, talents: [{ talent: 'grit' }] }] } },
  talents: { grit: { id: 'grit', name: 'Grit' } },
};
const OVERLAY = {
  'specializations.overlay.json': { specializations: { scoundrel: { talent_tree: [{ cost: 5, talents: [{ talent: 'respec_opp' }] }] } } },
  'talents.overlay.json': { talents: { respec_opp: { id: 'respec_opp', name: 'Opportunist', _provenance: 'respecialized', sources: [] } } },
  'manifest.json': { mod: 'respecialized', label: 'reSpecialized' },
};
const SERVED = /^public\/data\/mods\/respecialized\/(eote-v1|aor-v1)\/(.+)$/;

function freshMods(missingAs, log) {
  delete require.cache[MODS_PATH];
  global.fetch = function (url) {
    log.push(String(url));
    const m = SERVED.exec(String(url));
    if (m && OVERLAY[m[2]]) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(JSON.stringify(OVERLAY[m[2]]))) });
    if (missingAs === 'spa') return Promise.resolve({ ok: true, status: 200, json: () => Promise.reject(new SyntaxError("Unexpected token '<'")) });
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.reject(new Error('404')) });
  };
  const warn = console.warn; console.warn = () => {};
  const M = require(MODS_PATH);
  return { M, restore: () => { console.warn = warn; } };
}

// SheetAdvancement's predicate, verbatim in shape (player/app.jsx, `_modsNotice`).
function notice(sheet, _modsFailed) {
  return !!(sheet && sheet.mods && sheet.mods.length && _modsFailed.length
    && sheet.mods.some(function (s) { return _modsFailed.indexOf(s) >= 0; }));
}

const CASES = [
  { name: 'own My Data alone',            mods: ['user:my_data'],                                                             want: false },
  { name: 'respec + own My Data',         mods: ['respecialized@eote-v1', 'user:my_data'],                                    want: false },
  { name: 'imported frozen pack alone',   mods: ['user:smoke_pack@55dfb4e27303'],                                             want: false },
  { name: 'both respec + own + imported', mods: ['respecialized@eote-v1', 'respecialized@aor-v1', 'user:my_data', 'user:p@0123456789ab'], want: false },
  { name: 'CONTROL empty',                mods: [],                                                                           want: false },
  { name: 'CONTROL respec only',          mods: ['respecialized@eote-v1'],                                                    want: false },
  { name: 'CONTROL unknown non-user pack', mods: ['nosuchmod@v9'],                                                            want: true  },
];

(async function main() {
  for (const missingAs of ['spa', '404']) {
    for (const c of CASES) {
      harvest += 1;
      const tag = `[${missingAs}] ${c.name}`;
      const log = [];
      const { M, restore } = freshMods(missingAs, log);
      try {
        const view = await M.resolveForStamp(c.mods, BASE);
        const got = notice({ mods: c.mods }, M.failed());
        if (got !== c.want) fail(`${tag}: notice ${got}, want ${c.want} (failed() = ${JSON.stringify(M.failed())})`);
        // R-F853-2: the fix must not silence a VARIANT stamp — every row carrying respecialized@ still
        // gets the overlay (else "neutral" below compares two equally-unapplied views and passes).
        if (c.mods.some((s) => /^respecialized@/.test(s)) && !(view && view.talents && view.talents.respec_opp))
          fail(`${tag}: a respecialized@ stamp did not apply its overlay (respec_opp missing)`);
        const userFetches = log.filter((u) => u.indexOf('user:') !== -1);
        if (userFetches.length) fail(`${tag}: fetched a user: stamp → ${userFetches[0]}`);
        const userStamps = c.mods.filter((s) => /^user:/.test(s));
        if (userStamps.length) {
          const { M: M2, restore: r2 } = freshMods(missingAs, []);
          try {
            const plain = await M2.resolveForStamp(c.mods.filter((s) => !/^user:/.test(s)), BASE);
            if (JSON.stringify(view) !== JSON.stringify(plain)) fail(`${tag}: the user: stamp changed the resolved view`);
          } finally { r2(); }
          if (M.failed().some((s) => /^user:/.test(s))) fail(`${tag}: a user: stamp entered failed()`);
        }
      } catch (e) {
        fail(`${tag}: threw ${e && e.message}`);
      } finally { restore(); }
    }
  }
  delete global.fetch;
  console.log(`  HARVEST ${harvest} cases (${CASES.length} × 2 missing-path modes)`);
  if (!harvest) { console.error('  FAIL  zero harvest'); process.exit(1); }
  if (failures) { console.error(`mods_user_stamp_tolerated: ${failures} FAIL`); process.exit(1); }
  console.log('mods_user_stamp_tolerated: PASS');
})();
