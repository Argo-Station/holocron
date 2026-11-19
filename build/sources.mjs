// build/sources.mjs — THE ONE LIST OF WHAT THIS TREE SERVES, and the stamp computed from it.
//
// B-423 (`b412-species-parity-gate` Addendum 1, R-B412G-A1-3). `assert_build_fresh()` compared
// LOCAL source and bundle mtimes, which says nothing about WHICH TREE the port is serving: a
// worktree run aimed at the default :3000 passed the freshness guard while the page loaded the
// main checkout's bundle, and the branch's own code was simply not in it. A B-418 assert went red
// twice on code it had never touched (PRAXIS §2, 2026-09-06). The fix is a mechanism, not a louder
// doc: the build stamps a TREE IDENTITY into the file it already writes for the update beacon
// (`/version.json`, `max-age=0` in `_headers`, so it cannot serve a stale answer), and the smoke
// harness FETCHES that stamp from `SMOKE_BASE` and refuses a tree that is not its own.
//
// WHAT THE IDENTITY COVERS, and why each part: everything the build COMPILES (a bundle differing
// means the app differs), the three app SHELLS, which ship as source and carry app logic — the
// character reducer lives in `player/index.html` — and every plain `.js` under `lib/` that the
// pages load directly (`charResolve.js` is not a build input and is the most-read file in the
// repo). Build OUTPUTS are excluded: they are derived, gitignored, and rebuilt per tree.
//
// THE LISTS ARE THE BUILD'S OWN. `build.mjs` imports TRANSFORMS and VENDOR_INPUTS from here rather
// than keeping its own copy, so a transform added to the build joins the stamp in the same edit —
// a guard's scope derived from the document it guards, never a hand-typed second list.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, sep } from 'node:path';

// Classic-script JSX transforms: each compiles in isolation and stays global-scope.
export const TRANSFORMS = [
  { in: 'player/app.jsx', out: 'player/app.js', split: true },   // B-139: cut at build into app.js + creator.js + sheet.js (build/playerSplit.mjs)
  { in: 'gm/app.jsx', out: 'gm/app.js' },
  { in: 'lib/dice/diceSurface.jsx', out: 'lib/dice/diceSurface.js' },
  { in: 'lib/game/hyperspaceRun/ui.jsx', out: 'lib/game/hyperspaceRun/ui.js' },
  { in: 'lib/library/npc/view.jsx', out: 'lib/library/npc/view.js' },  // NPC section module → window.SWRPGLibrary.NPC
  { in: 'lib/store/view.jsx', out: 'lib/store/view.js' },              // ITM-V1 store kernel → window.SWRPGStore
  { in: 'lib/modify/view.jsx', out: 'lib/modify/view.js' },            // F-100 M13 Lap B "Modify this Character" → window.SWRPGModifyView
  { in: 'lib/editor/view.jsx', out: 'lib/editor/view.js' },            // F-100 C2 the homebrew editor → window.SWRPGEditorView
  { in: 'lib/shared/vesselView.jsx', out: 'lib/shared/vesselView.js' },// SHIPYARD Y2 vessel surface → window.SWRPGVesselView
  { in: 'lib/shared/yardView.jsx', out: 'lib/shared/yardView.js' },
  { in: 'lib/shared/treeView.jsx', out: 'lib/shared/treeView.js' },    // F-100 M5 C7 the ONE talent/Force tree → window.SWRPGTree    // SHIPYARD R-Y2-2 shared yard browse+entry → window.SWRPGYard
  { in: 'lib/shared/diceHub.jsx', out: 'lib/shared/diceHub.js' },      // D-507 the dice window, lifted from player/app.jsx → window.SWRPGDiceHub
  { in: 'lib/shared/desktopLayout.jsx', out: 'lib/shared/desktopLayout.js' },  // F-46 desktop primitives → window.SWRPGDesktop
  { in: 'lib/shared/holotableView.jsx', out: 'lib/shared/holotableView.js' }, // HOLOTABLE Stage B components → window.SWRPGHolotableView
  { in: 'lib/shared/holotableCompose.jsx', out: 'lib/shared/holotableCompose.js' }, // HOLOTABLE Stage B narrow compositions → window.SWRPGHolotableCompose
  { in: 'lib/shared/roomSession.jsx', out: 'lib/shared/roomSession.js' }, // HOLOTABLE Stage B wiring → window.SWRPGRoomSession (the ONE React binding for roomClient)
  { in: 'lib/shared/campaignsView.jsx', out: 'lib/shared/campaignsView.js' }, // ENCOUNTERS E6 frames (R-E6F-1, F5-a) the CAMPAIGNS screens, both apps → window.SWRPGCampaignsView
];

// The concatenated vendor chunk's inputs (buildVendor is a custom multi-build, so esbuild's
// per-transform watch does not cover them — T3a watches these by hand and the stamp reads them).
export const VENDOR_INPUTS = ['build/vendor.entry.js', 'lib/shared/ui.jsx',
                              'lib/shared/diceUI.jsx', 'lib/shared/diceRoll.jsx'];

// Served as source, never compiled: each app's thin shell. `player/index.html` carries the
// character reducer (`charReducer`, `dispatchBinding`), which is app logic by any measure.
export const SHELLS = ['player/index.html', 'gm/index.html', 'dice/index.html'];

// B-1912 (ruling release-r7-bug-burndown ADDENDUM 761 item 2, the URL contract): every hand-written `.js` under lib/
// (not a TRANSFORMS output) is served from a minified copy, `dist/lib/<same path>.js`, at `/dist/lib/<path>.js`.
// The source stays put and is what every guard, the stamp and the open copy read; the copy is gitignored and the shells,
// the door's lists and every runtime loader name it. RAW_LIB_OUT is that one prefix.
export const RAW_LIB_OUT = 'dist/';
export function rawLibFiles(repo) {
  const outputs = new Set(TRANSFORMS.map((t) => t.out));
  const files = [];
  const walk = (rel) => {
    for (const name of readdirSync(join(repo, rel))) {
      if (name.startsWith('.') || name === 'node_modules') continue;
      const child = rel + '/' + name;
      if (statSync(join(repo, child)).isDirectory()) { walk(child); continue; }
      if (name.endsWith('.js') && !outputs.has(child)) files.push(child);
    }
  };
  walk('lib');
  return files.sort();
}

/* Every file whose bytes decide what a browser executes against this tree, sorted, repo-relative.
   Build OUTPUTS are excluded by name (derived + gitignored): the .js each transform writes, its
   map, and the vendor chunk. */
export function stampFiles(repo) {
  const outputs = new Set(TRANSFORMS.map((t) => t.out).concat(['vendor.js', 'player/creator.js', 'player/sheet.js']));
  const files = new Set();
  for (const t of TRANSFORMS) files.add(t.in);
  for (const v of VENDOR_INPUTS) files.add(v);
  for (const s of SHELLS) files.add(s);
  // every plain .js the pages load straight from lib/ (charResolve, charbuild, the stores …)
  const walk = (rel) => {
    const abs = join(repo, rel);
    if (!existsSync(abs)) return;
    for (const name of readdirSync(abs)) {
      if (name.startsWith('.') || name === 'node_modules') continue;
      const child = rel + '/' + name;
      if (statSync(join(repo, child)).isDirectory()) { walk(child); continue; }
      if (!name.endsWith('.js') && !name.endsWith('.jsx')) continue;
      if (outputs.has(child) || name.endsWith('.map')) continue;
      files.add(child);
    }
  };
  walk('lib');
  return [...files].filter((f) => existsSync(join(repo, f))).sort();
}

/* The tree's identity: sha256 over "<path>\n<sha256 of its bytes>\n" for each file above.
   CONTENT-addressed on purpose — two trees holding identical sources ARE interchangeable to a
   browser, and refusing that pair would be a false alarm the guard would soon be muted for. */
export function treeStamp(repo) {
  const files = stampFiles(repo);
  const h = createHash('sha256');
  for (const f of files) {
    h.update(f.split(sep).join('/'));
    h.update('\n');
    h.update(createHash('sha256').update(readFileSync(join(repo, f))).digest('hex'));
    h.update('\n');
  }
  return { src: h.digest('hex'), files: files.length };
}
