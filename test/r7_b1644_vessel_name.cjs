/* r7_b1644_vessel_name — B-1644 (ruling `release-r7-bug-burndown` ADDENDA 372, 373; brief `release-r7-b1644-step0` A): a
 * vessel line on a store with NO ship seam (the creator's gear-step Store) is named by the HOST from the Yard's own registry
 * caches, never printed as its raw `vpart:<key>`. lib/store parses no vehicle data (R-S4WC-1 A2), so the name comes from
 * `SWRPGVesselView.counterName`, loaded by `useCounterNames(on)`, and `on` false fetches nothing (373's CONDITION).
 *
 *   §A  useCounterNames(false) answers null and fetches no vehicle file
 *   §B  useCounterNames(true) loads the two registries through the Yard's own loaders; then counterName names
 *       vpart:, vmod: (its part) and vweap: by the row's `name` READ FROM THE FILE; a gear line and junk answer null
 *   §C  the store's counter reads the host's `vesselName` (view.jsx passes it to CounterView, vesselLine falls back to it)
 *   §D  the creator's mount turns the names on only while the gear step's store is open AND the slip holds a vessel line
 *
 * Red at the cut 3eefcd9af (no counterName, no useCounterNames, no vesselName). Run: node test/r7_b1644_vessel_name.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let failures = 0, passes = 0;
function check(label, cond, detail) {
  if (cond) { passes += 1; console.log('  PASS  ' + label); }
  else { failures += 1; console.error('  FAIL  ' + label + (detail ? '  — ' + detail : '')); }
}

const fetched = [];
global.window = globalThis.window || {};
global.fetch = function (p) {
  fetched.push(String(p));
  const file = path.join(ROOT, String(p).replace(/^\//, ''));
  return Promise.resolve({ ok: fs.existsSync(file), json: () => Promise.resolve(JSON.parse(fs.readFileSync(file, 'utf8'))) });
};
global.window.fetch = global.fetch;
global.React = {
  createElement: function () { return null; }, Fragment: 'fragment',
  useState: function (v) { return [typeof v === 'function' ? v() : v, function () {}]; },
  useEffect: function (f) { f(); },   // effects run at once: the hook's loader fires where the browser's would
  useRef: function () { return { current: null }; },
  useMemo: function (f) { return f(); }, useCallback: function (f) { return f; },
  useSyncExternalStore: function (_s, g) { return g(); },
};
global.window.React = global.React;
global.window.addEventListener = function () {};
global.window.removeEventListener = function () {};
const mem = new Map();
const st = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(), key: (i) => Array.from(mem.keys())[i] || null, get length() { return mem.size; } };
Object.defineProperty(globalThis, 'localStorage', { value: st, configurable: true, writable: true });
global.window.localStorage = st;

require(path.join(ROOT, 'lib/shared/vesselStore.js'));
try { require(path.join(ROOT, 'lib/shared/vesselResolve.js')); } catch (e) { /* not read here */ }
require(path.join(ROOT, 'lib/shared/vesselView.js'));
const VV = global.window.SWRPGVesselView;

const ATT = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical/vehicle-attachments.json'), 'utf8')).vehicle_attachments;
const WPN = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical/vehicle-weapons.json'), 'utf8')).vehicle_weapons;
const PART = 'hyperdrive_generator';
const MODK = Object.keys(ATT).find((k) => (ATT[k].added_options || []).length);
const MODO = MODK ? ATT[MODK].added_options[0].id : null;
const WK = Object.keys(WPN).sort()[0];
const VEH = /vehicle-(attachments|weapons)\.json|vehicle_weapon_categories/;

(async function main() {
  console.log('r7_b1644_vessel_name — a no-seam vessel line named by the Yard (B-1644)');
  check('fixtures: the part, a part with an added option and a weapon, each with a name in its file',
    !!(ATT[PART] && ATT[PART].name && MODK && MODO && WPN[WK] && WPN[WK].name), JSON.stringify([PART, MODK, MODO, WK]));
  check('§ the Yard exports counterName and useCounterNames', !!VV && typeof VV.counterName === 'function' && typeof VV.useCounterNames === 'function');
  if (!VV || typeof VV.useCounterNames !== 'function' || typeof VV.counterName !== 'function') { finish(); return; }

  // §A — off: null, nothing fetched
  const off = VV.useCounterNames(false);
  check('§A useCounterNames(false) answers null', off === null, String(off));
  check('§A … and fetches no vehicle file', !fetched.some((p) => VEH.test(p)), JSON.stringify(fetched));
  check('§A counterName before any load answers null (the caches are empty), never the raw key',
    VV.counterName('vpart:' + PART) === null, String(VV.counterName('vpart:' + PART)));

  // §B — on: the two loaders run; then the names are the files' own
  const on = VV.useCounterNames(true);
  check('§B useCounterNames(true) answers the namer', on === VV.counterName);
  check('§B … and fetches the parts file and the weapons file through the Yard\'s own loaders',
    fetched.some((p) => /vehicle-attachments\.json/.test(p)) && fetched.some((p) => /vehicle-weapons\.json/.test(p)), JSON.stringify(fetched));
  await new Promise((r) => setTimeout(r, 50));
  check('§B vpart:' + PART + ' → "' + ATT[PART].name + '" (the file\'s row name)', VV.counterName('vpart:' + PART) === ATT[PART].name, String(VV.counterName('vpart:' + PART)));
  check('§B vmod:' + MODK + '/' + MODO + ' → its part, "' + ATT[MODK].name + '" (as the seam\'s plan names it)',
    VV.counterName('vmod:' + MODK + '/' + MODO) === ATT[MODK].name, String(VV.counterName('vmod:' + MODK + '/' + MODO)));
  check('§B vweap:' + WK + ' → "' + WPN[WK].name + '"', VV.counterName('vweap:' + WK) === WPN[WK].name, String(VV.counterName('vweap:' + WK)));
  check('§B a gear line, an unknown key and junk answer null',
    VV.counterName('gear:stimpack') === null && VV.counterName('vpart:no_such_part') === null && VV.counterName('nonsense') === null);

  // §C — the store reads the host's name (A2: the store parses nothing itself)
  const SV = fs.readFileSync(path.join(ROOT, 'lib/store/view.jsx'), 'utf8');
  check('§C vesselLine falls back seam name → props.vesselName(id) → the raw id',
    /\(pr && pr\.name\) \|\| \(props\.vesselName && props\.vesselName\(line\.itemId\)\) \|\| line\.itemId/.test(SV));
  check('§C Store hands vesselName to CounterView', /vesselName: props\.vesselName/.test(SV));
  check('§C lib/store fetches no vehicle file (A2)', !/vehicle-attachments\.json|vehicle-weapons\.json/.test(SV));

  // §D — the creator's mount: on only while the gear step's store is open and the slip holds a vessel line (373)
  const AP = fs.readFileSync(path.join(ROOT, 'player/app.jsx'), 'utf8');
  const m = AP.match(/var creatorVesselNamesOn = ([\s\S]*?);\n/);
  check('§D the creator computes its switch from the gear step, the open store and the slip',
    !!m && /currentStep === 'gear'/.test(m[1]) && /subView === 'store'/.test(m[1]) && /\^\(vpart\|vmod\|vweap\):/.test(m[1]), m ? m[1] : 'absent');
  check('§D … feeds useCounterNames with it, and the creator\'s Store gets vesselName',
    /useCounterNames\(creatorVesselNamesOn\)/.test(AP) && /vesselName: creatorVesselName/.test(AP));
  finish();
})();

function finish() {
  console.log('r7_b1644_vessel_name: ' + passes + ' passed, ' + failures + ' failed');
  process.exit(failures ? 1 : 0);
}
