#!/usr/bin/env node
// B-139 STEP 0 (ruling release-r7-bug-burndown ADDENDUM 424) — what player/app.js is made of.
// Read-only. Run from a tree root AFTER `npm run build`:  node scripts/b139_bundle_census.mjs
//
// 1. Sizes: player/app.js and every <script src> in player/index.html — raw, gzip -9, brotli q11,
//    and whether the tag blocks the parser (no defer/async) or is deferred (runs before
//    DOMContentLoaded, so it still precedes the React mount at the bottom of app.js).
// 2. Shares: player/app.jsx cut at its top-level statements (a line starting in column 0 that is
//    not a closer or a comment). Each piece is minified ALONE by esbuild (the build's own options),
//    so a piece's bytes ≈ its share of app.js. A name graph (top-level declared names → the
//    pieces whose text mentions them, by word match) is walked from each surface root; a piece
//    reachable from the first-paint roots is FIRST-PAINT, else it belongs to the one surface that
//    reaches it, else SHARED (reached by two or more surfaces but not by first paint).
//    Approximate on purpose: a word match over-reaches (a string naming a function counts;
//    comments do not — edges read the minified piece).
// 3. THE CEILING (ruling release-r7-bug-burndown ADDENDUM 426 §7 as amended by 427, 428, 466 and 474), read from the BUILT
//    output: player/app.js ≤ 205 KB raw, and the script before mount (every BLOCKING + defer <script src> in
//    player/index.html, brotli q11) ≤ 475 KB br (790 until B-1912's compaction; D-638 bind 1, ADDENDUM 770 item 1).
//    Either over → the census prints REFUSED and EXITS 1. The split's
//    two chunks (player/creator.js, player/sheet.js) are reported, never counted: they load after mount.
// 4. E6'S DOOR-LOADED BYTES (B-1895, ruling release-r7-bug-burndown ADDENDUMS 749, 750; encounters-e6-walk ADDENDUM 27). A
//    file the campaigns door injects and the player's mount awaits is outside step 1's tags. Its list is read from the
//    product's own declaration (lib/shared/campaignsDoor.js FILES and FIRST, the player's load() takes no QR), never a list
//    kept here; WHEN the mount awaits which is read from player/app.jsx's boot line (`… .then(playerBoot); else
//    playerBoot();`): `playerCampaignsLoadFirst()` awaits FIRST on the landing (encounters-e6-walk ADDENDUM 29); a
//    campaigns-route test (`playerBootScreen() === 'campaigns'`) with `playerCampaignsLoad()` awaits FILES on a cold
//    campaigns/join route; a bare door test awaits FILES on every route. Per state, from the same tags: door OFF; door
//    ON on /player/ (and every non-E6 route); door ON cold on /player/campaigns… or /player/join…. 475 KB br is the
//    LANDING budget (door OFF everywhere, door ON on /player/); E6's line (FILES) is ≤ 19 KB br (ADDENDUM 761 item 5: B-1912's
//    measured 19 131 B rounded up; 27 by 760, 26 by 759, 24 by 750); the cold route prints the page's tags + E6 and is bound by both lines (750).
// 5. B-1912 (ADDENDUM 761): the shells and the door name the dist/lib/ copies (build.mjs buildRawLib), so every figure
//    here reads the minified bytes a browser is sent, never the lib/ source.
// 6. THE GM PAGE'S OWN LINE (D-638 bind 2; ADDENDUM 770 item 2, 774 STEP 0.3): every BLOCKING + defer <script src> in
//    gm/index.html, brotli q11, door OFF; door ON adds the door's FILES and QR (gm/app.jsx boots both before mount by
//    design; b1912_raw_lib_census.mjs's "GM door OFF" / "GM door ON (FILES + QR)" lines, measured the same way). Each
//    ≤ 630 KB br, or REFUSED and exit 1. Before D-638 nothing limited the GM page.
import fs from "node:fs";
import vm from "node:vm";
import zlib from "node:zlib";
import esbuild from "esbuild";

const rd = p => fs.readFileSync(p);
const kb = n => (n / 1024).toFixed(1) + " KB";
// B-1914 (ruling release-r7-bug-burndown ADDENDUM 761 item 3): the build stamps `dev-<epoch>` into vendor.js and
// player/app.js (build.mjs BUILD_ID), and brotli q11 answers those 4 changed digits with up to ~80 B per file — 0.3 KB on
// the door-OFF line across identical builds (brief b1912-raw-lib-census §1). The stamp is set to one fixed value of the
// same length before compressing, so two builds of one tree read identical figures. `raw` is the bytes as they are.
const STAMP = /dev-\d{13}/g;
const norm = buf => Buffer.from(buf.toString("latin1").replace(STAMP, "dev-0000000000000"), "latin1");
const sizes = buf => { const n = norm(buf); return { raw: buf.length, gz: zlib.gzipSync(n, { level: 9 }).length,
  br: zlib.brotliCompressSync(n, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }).length }; };

// ── 1. the page's scripts ─────────────────────────────────────────────────────────────────────
const html = rd("player/index.html").toString();
const tags = [...html.matchAll(/<script\b([^>]*)\bsrc="([^"]+)"([^>]*)>/g)].map(m => {
  const attrs = m[1] + m[3]; const src = m[2];
  const path = src.replace(/^\//, "").replace(/^https?:.*$/, "");
  const mode = /\basync\b/.test(attrs) ? "async" : /\bdefer\b/.test(attrs) ? "defer" : "BLOCKING";
  const line = html.slice(0, m.index).split("\n").length;
  let s = null; try { if (path) s = sizes(rd(path)); } catch { s = null; }
  return { line, src, mode, s };
});
console.log("== player/index.html <script src> tags ==");
const tot = { BLOCKING: { raw: 0, gz: 0, br: 0, n: 0 }, defer: { raw: 0, gz: 0, br: 0, n: 0 }, async: { raw: 0, gz: 0, br: 0, n: 0 } };
for (const t of tags) {
  if (t.s) { const T = tot[t.mode]; T.raw += t.s.raw; T.gz += t.s.gz; T.br += t.s.br; T.n++; }
  if (t.mode === "BLOCKING" || (t.s && t.s.raw > 50000))
    console.log(`  L${t.line}  ${t.mode.padEnd(8)} ${t.src.padEnd(44)} ${t.s ? `${kb(t.s.raw)} raw · ${kb(t.s.gz)} gz · ${kb(t.s.br)} br` : "(not on disk)"}`);
}
for (const [k, T] of Object.entries(tot)) console.log(`  TOTAL ${k.padEnd(8)} ${T.n} files · ${kb(T.raw)} raw · ${kb(T.gz)} gz · ${kb(T.br)} br`);
const inline = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
console.log(`  inline <script> blocks: ${inline.length} · ${kb(inline.reduce((a, m) => a + m[1].length, 0))} raw`);
const app = sizes(rd("player/app.js"));
console.log(`== player/app.js == ${kb(app.raw)} raw · ${kb(app.gz)} gz · ${kb(app.br)} br`);
for (const c of ["player/creator.js", "player/sheet.js"]) if (fs.existsSync(c)) {
  const z = sizes(rd(c)); console.log(`== ${c} == ${kb(z.raw)} raw · ${kb(z.gz)} gz · ${kb(z.br)} br (after mount: not counted)`); }
// 790 → 475 and the GM's new 630 (D-638, on B-1912's landing: 458.2 / 610.8 KB br read at the merged tree)
const CEIL = { appRaw: 205 * 1024, beforeMountBr: 475 * 1024, gmBeforeMountBr: 630 * 1024, e6Br: 19 * 1024 };   // E6 24 → 26 (759) → 27 (760, the last raise) → 19 KB br on B-1912's landing (761 item 5: 19 131 B measured after merging commercial @ 63d91f332, rounded up to the next whole KB)
const beforeMount = tot.BLOCKING.br + tot.defer.br;
// 4. the door's files and when the mount awaits them
const doorCtx = { localStorage: { getItem: () => null }, document: {} }; doorCtx.window = doorCtx;
vm.runInNewContext(rd("lib/shared/campaignsDoor.js").toString(), doorCtx, { filename: "lib/shared/campaignsDoor.js" });
const Door = doorCtx.SWRPGCampaignsDoor;
const e6 = Door.FILES.map(f => ({ f, s: sizes(rd(f.replace(/^\//, ""))) }));
const e6Br = e6.reduce((a, x) => a + x.s.br, 0);
const boot = (rd("player/app.jsx").toString().match(/^if \(.*\.then\(playerBoot\); else playerBoot\(\);$/m) || [""])[0];
const routed = /playerBootScreen\(\) === 'campaigns'/.test(boot);
const landing = !boot ? [] : /playerCampaignsLoadFirst\(\)/.test(boot) ? Door.FIRST : routed ? [] : Door.FILES;
const cold = !boot ? [] : routed || landing === Door.FILES ? Door.FILES : landing;
const brOf = files => e6.filter(x => files.includes(x.f)).reduce((a, x) => a + x.s.br, 0);
const name = files => files.length ? files.map(f => f.replace(/^.*\//, "")).join(" + ") : "none";
console.log(`== E6 door-loaded (lib/shared/campaignsDoor.js FILES; default ${Door.on() ? "ON" : "OFF"} with no key; before mount: /player/ ${name(landing)} · cold campaigns/join ${name(cold)}) ==`);
for (const x of e6) console.log(`  ${x.f.padEnd(44)} ${kb(x.s.raw)} raw · ${kb(x.s.gz)} gz · ${kb(x.s.br)} br`);
const st = { off: beforeMount, onLanding: beforeMount + brOf(landing), cold: beforeMount + brOf(cold) };
console.log(`  STATES before mount, br: door OFF ${kb(st.off)} · door ON /player/ ${kb(st.onLanding)}` +
  (landing.length ? ` = ${kb(beforeMount)} + ${name(landing)} ${kb(brOf(landing))}` : "") +
  ` · door ON cold /player/campaigns|join ${kb(st.cold)}` + (cold.length ? ` = ${kb(beforeMount)} + E6 ${kb(brOf(cold))}` : ""));
// 6. the GM page: its tags before mount (deduped, as the b1912 census sums them), then door ON = + FILES + QR
const gmHtml = rd("gm/index.html").toString();
const gmPre = [...gmHtml.matchAll(/<script\b([^>]*)\bsrc="([^"]+)"([^>]*)>/g)].filter(m => !/\basync\b/.test(m[1] + m[3]))
  .map(m => m[2].replace(/^\//, "")).filter(p => p && !/^https?:/.test(p));
const gmBr = paths => [...new Set(paths)].reduce((a, p) => { try { return a + sizes(rd(p)).br; } catch { return a; } }, 0);
const gm = { off: gmBr(gmPre), on: gmBr([...gmPre, ...Door.FILES.map(f => f.replace(/^\//, "")), Door.QR.replace(/^\//, "")]) };
console.log(`== GM first load (gm/index.html BLOCKING + defer; door ON + campaignsDoor FILES + QR) == door OFF ${kb(gm.off)} br · door ON ${kb(gm.on)} br`);
const over = [];
if (app.raw > CEIL.appRaw) over.push(`player/app.js ${kb(app.raw)} raw > ${kb(CEIL.appRaw)}`);
if (st.off > CEIL.beforeMountBr) over.push(`script before mount (door OFF) ${kb(st.off)} br > ${kb(CEIL.beforeMountBr)}`);
if (st.onLanding > CEIL.beforeMountBr) over.push(`script before mount (door ON /player/) ${kb(st.onLanding)} br > ${kb(CEIL.beforeMountBr)}`);
if (gm.off > CEIL.gmBeforeMountBr) over.push(`GM script before mount (door OFF) ${kb(gm.off)} br > ${kb(CEIL.gmBeforeMountBr)}`);
if (gm.on > CEIL.gmBeforeMountBr) over.push(`GM script before mount (door ON, FILES + QR) ${kb(gm.on)} br > ${kb(CEIL.gmBeforeMountBr)}`);
if (e6Br > CEIL.e6Br) over.push(`E6 door-loaded ${kb(e6Br)} br > ${kb(CEIL.e6Br)}`);
// R-751-1 (release-r7-bug-burndown ADDENDUM 751): no boot line found would place E6's bytes nowhere and read door ON as OFF
if (!boot) over.push("boot line not found — E6's bytes cannot be placed (player/app.jsx: `if (…) ….then(playerBoot); else playerBoot();`)");
console.log(`== CEILING (ADDENDUM 426 §7 / 427 / 428 / 466 / 474; 750; 759; 760; 761; D-638) == app.js ${kb(app.raw)} raw (≤ ${kb(CEIL.appRaw)}) · before mount ${kb(st.onLanding)} br (≤ ${kb(CEIL.beforeMountBr)}; door OFF ${kb(st.off)}) · GM ${kb(gm.on)} br (≤ ${kb(CEIL.gmBeforeMountBr)}; door OFF ${kb(gm.off)}) · E6 ${kb(e6Br)} br (≤ ${kb(CEIL.e6Br)}); cold campaigns ${kb(st.cold)} → ${over.length ? "REFUSED: " + over.join("; ") : "within"}`);
process.exitCode = over.length ? 1 : 0;

// ── 2. shares of app.jsx ──────────────────────────────────────────────────────────────────────
const src = rd("player/app.jsx").toString(); const L = src.split("\n");
const starts = [];
for (let i = 0; i < L.length; i++) if (/^[A-Za-z_$(\[]/.test(L[i]) && !/^(\}|\)|\]|\/\/|\/\*|\*)/.test(L[i])) starts.push(i);
const pieces = starts.map((s, k) => ({ line: s + 1, text: L.slice(s, k + 1 < starts.length ? starts[k + 1] : L.length).join("\n") }));
const JSX = { loader: "jsx", jsx: "transform", jsxFactory: "React.createElement", jsxFragment: "React.Fragment", target: "es2018", minify: true };
let failed = 0;
for (const p of pieces) {
  const m = p.text.match(/^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)|^(?:var|let|const|class)\s+([A-Za-z_$][\w$]*)/);
  p.name = m ? (m[1] || m[2]) : null;
  const more = [...p.text.matchAll(/^(?:var|let|const)\s+\{([^}]*)\}\s*=/gm)].flatMap(x => x[1].split(",").map(s => s.split(":").pop().trim()));
  p.names = [p.name, ...more].filter(Boolean);
  try { p.code = esbuild.transformSync(p.text, JSX).code; p.min = p.code.length; } catch { p.code = p.text; p.min = Buffer.byteLength(p.text); p.raw = true; failed++; }
}
const sumMin = pieces.reduce((a, p) => a + p.min, 0);
const owner = new Map(); pieces.forEach((p, i) => p.names.forEach(n => owner.set(n, i)));
const names = [...owner.keys()].sort((a, b) => b.length - a.length);
const re = new RegExp("\\b(" + names.map(n => n.replace(/\$/g, "\\$")).join("|") + ")\\b", "g");
// edges read the MINIFIED piece (comments gone; top-level names survive a non-bundled transform)
const edges = pieces.map((p, i) => new Set([...p.code.matchAll(re)].map(m => owner.get(m[1])).filter(j => j !== i)));
const reach = roots => { const seen = new Set(); const st = roots.map(r => owner.get(r)).filter(x => x !== undefined);
  while (st.length) { const i = st.pop(); if (seen.has(i)) continue; seen.add(i); for (const j of edges[i]) st.push(j); } return seen; };

// Surface roots = the components PlayerApp mounts (and what they mount for a surface we name).
const SURFACES = {
  creator: ["FullCreator"], quick: ["QuickBuild"], sheet: ["CharacterSheet"], npcLibrary: ["PlayerNpcLibrary"],
  backup: ["PlayerBackup"], oggImport: ["ImportOgg"], holotable: ["HolotableJoinPanel"], testBed: ["TestBedScreen"],
};
// SUB-SURFACES inside the sheet, reported as shares of the sheet (they ride the sheet's split).
const SUB = { workshop: ["CraftWorkshop"], diceHub: ["DiceHub"], yardStore: ["PlayerStoreYard", "PlayerYardS4"],
  growth: ["SheetStage", "RewardStage", "ContactStage"], gearModify: ["GearModifyStage"], homebrew: ["HomebrewList", "HomebrewMenu", "H1Window"] };

// First paint = everything PlayerApp reaches when the surface components are cut out of the graph.
const cut = new Set(Object.values(SURFACES).flat().map(n => owner.get(n)));
const appIdx = owner.get("PlayerApp");
const fp = new Set(); { const st = [appIdx]; while (st.length) { const i = st.pop(); if (fp.has(i) || (cut.has(i))) continue; fp.add(i); for (const j of edges[i]) st.push(j); } }
// top-level side-effect statements (no name: calls, assignments) run at load — first paint by definition
pieces.forEach((p, i) => { if (!p.name) fp.add(i); });
const reached = Object.fromEntries(Object.entries(SURFACES).map(([k, r]) => [k, reach(r)]));
const bucket = {}; const add = (k, p) => { bucket[k] = bucket[k] || { min: 0, n: 0 }; bucket[k].min += p.min; bucket[k].n++; };
pieces.forEach((p, i) => {
  if (fp.has(i)) return add("FIRST-PAINT (landing + roster + chrome + load-time code)", p);
  const who = Object.keys(reached).filter(k => reached[k].has(i));
  add(who.length === 1 ? who[0] : who.length ? "SHARED by " + who.sort().join("+") : "UNREACHED by name (dead or reached via window/string)", p);
});
console.log(`== player/app.jsx: ${L.length} lines · ${pieces.length} top-level pieces · Σ minified-alone ${kb(sumMin)} (app.js ${kb(app.raw)}; ${failed} piece(s) un-minifiable alone, counted raw) ==`);
for (const [k, b] of Object.entries(bucket).sort((a, b) => b[1].min - a[1].min))
  console.log(`  ${(100 * b.min / sumMin).toFixed(1).padStart(5)}%  ${kb(b.min).padStart(10)}  ${String(b.n).padStart(4)} pieces  ${k}`);
console.log("== inside the sheet (exclusive to each sub-root among the sheet's pieces, not first paint) ==");
const sheetSet = reached.sheet;
for (const [k, r] of Object.entries(SUB)) {
  const mine = reach(r); const others = new Set(Object.entries(SUB).filter(([kk]) => kk !== k).flatMap(([, rr]) => [...reach(rr)]));
  let b = 0; for (const i of mine) if (!fp.has(i) && !others.has(i) && sheetSet.has(i)) b += pieces[i].min;
  console.log(`  ${(100 * b / sumMin).toFixed(1).padStart(5)}%  ${kb(b).padStart(10)}  ${k} (${r.join(", ")})`);
}
console.log("== the 15 largest first-paint pieces ==");
[...fp].map(i => pieces[i]).sort((a, b) => b.min - a.min).slice(0, 15).forEach(p => console.log(`  ${kb(p.min).padStart(10)}  L${p.line}  ${p.name || p.text.slice(0, 60).replace(/\n/g, " ")}`));
