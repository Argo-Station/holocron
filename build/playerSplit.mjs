// build/playerSplit.mjs — B-139: the player bundle's computed cut (ruling release-r7-bug-burndown ADDENDUM 426 §2).
//
// player/app.jsx stays ONE source file. This module cuts it, at build time, into three classic scripts that
// share the page's global scope exactly as the one file did (a top-level function/var/let/const in a classic
// script is visible to every later classic script, so no piece is rewritten):
//
//   player/app.js      FIRST PAINT — the name-closure of every load-time statement and of PlayerApp
//   player/creator.js  what only FullCreator / QuickBuild / ImportOgg / ModifyHost reach
//   player/sheet.js    what only CharacterSheet reaches
//
// THE CLOSURE. app.jsx is cut at its top-level statements (a line starting in column 0 that is not a closer or
// a comment). A piece that declares nothing (a call, an assignment) runs at load: it is a root, with PlayerApp.
// Edges are word matches of top-level declared names over each piece's text with its COMMENTS stripped (esbuild,
// identifiers unminified) — so a string that names a symbol IS a reference (§2: strings count). Everything the
// roots reach is first paint; everything no name reaches stays in first paint too. The ONLY cut edges are the
// GATE SITES: `React.createElement(<Root>,` inside PlayerApp, for the five chunk roots below. A chunk holds the
// pieces only its roots reach; a piece both chunks reach stays in app.js (no third chunk).
//
// THE REFUSAL (§2). A first-paint piece that names a chunk symbol anywhere but a gate site is a load that would
// throw (a classic script cannot see a script that has not run) — the build exits non-zero and names it. And
// (ADDENDUM 427) app.jsx may not hold window[…], globalThis[…], eval( or Function( — the one way a root-name string,
// which Q1 (a) stopped counting, could become a call.
//
// Each output is app.jsx with every other piece's lines BLANKED (newlines kept), so each chunk's source map
// points at the real app.jsx lines.
import esbuild from 'esbuild';

export const CHUNKS = {
  creator: ['FullCreator', 'QuickBuild', 'ImportOgg', 'ModifyHost'],
  sheet: ['CharacterSheet'],
};
export const CHUNK_OUT = { app: 'player/app.js', creator: 'player/creator.js', sheet: 'player/sheet.js' };
const GATE_HOST = 'PlayerApp';

// app.jsx → top-level pieces { line (1-based), lines: [start, end), text, names }
export function pieces(src) {
  const L = src.split('\n');
  const starts = [];
  for (let i = 0; i < L.length; i++) if (/^[A-Za-z_$(\[]/.test(L[i]) && !/^(\}|\)|\]|\/\/|\/\*|\*)/.test(L[i])) starts.push(i);
  // anything before the first statement (a header comment) rides with the first piece
  if (starts.length && starts[0] !== 0) starts[0] = 0;
  return starts.map((s, k) => {
    const e = k + 1 < starts.length ? starts[k + 1] : L.length;
    const text = L.slice(s, e).join('\n');
    const body = text.replace(/^(\s*(\/\/[^\n]*|\/\*[\s\S]*?\*\/)\s*)+/, '');
    const m = body.match(/^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)|^(?:var|let|const|class)\s+([A-Za-z_$][\w$]*)/);
    const names = m ? [m[1] || m[2]] : [];
    // `var a = 1, b = 2;` and `const { x, y } = obj;` declare more than one name
    const dm = body.match(/^(?:var|let|const)\s+\{([^}]*)\}\s*=/);
    if (dm) names.push(...dm[1].split(',').map(s => s.split(':').pop().split('=')[0].trim()).filter(Boolean));
    const multi = body.match(/^(?:var|let|const)\s+[A-Za-z_$][\w$]*\s*=\s*[^,;\n]*(?:,\s*([A-Za-z_$][\w$]*)\s*=[^,;\n]*)+;/);
    if (multi) for (const x of body.split(';')[0].matchAll(/,\s*([A-Za-z_$][\w$]*)\s*=/g)) names.push(x[1]);
    return { line: s + 1, lines: [s, e], text, names: [...new Set(names)], declares: !!m || !!dm };
  });
}

const JSX = { loader: 'jsx', jsx: 'transform', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment', target: 'es2018' };
const codeOf = t => esbuild.transformSync(t, { ...JSX, minifyWhitespace: true }).code;   // comments go; names and strings stay

export function cut(src) {
  const P = pieces(src);
  for (const p of P) p.code = codeOf(p.text);
  const owner = new Map(); P.forEach((p, i) => p.names.forEach(n => owner.set(n, i)));
  const names = [...owner.keys()].sort((a, b) => b.length - a.length);
  const re = new RegExp('(?<![\\w$])(' + names.map(n => n.replace(/\$/g, '\\$')).join('|') + ')(?![\\w$])', 'g');
  const roots = Object.values(CHUNKS).flat();
  const rootIdx = new Map(roots.map(r => [owner.get(r), r]));
  for (const r of roots) if (!owner.has(r)) throw new Error(`playerSplit: chunk root ${r} is not a top-level declaration in player/app.jsx`);
  const host = owner.get(GATE_HOST);
  // refs[i] = [{ to, at, gate }] — `gate` marks a gate site (the only cut edges)
  const refs = P.map((p, i) => {
    const out = [];
    for (const m of p.code.matchAll(re)) {
      const to = owner.get(m[1]); if (to === i) continue;
      const gate = i === host && rootIdx.has(to) && p.code.slice(m.index - 20, m.index) === 'React.createElement(' && p.code[m.index + m[1].length] === ',';
      // ADDENDUM 427 Q1 (a): a string literal whose WHOLE value is a chunk root's name is save vocabulary (the
      // sheet-source 'FullCreator'), not a reference; every other string still counts. B139_ROOT_STRINGS=ref restores
      // §2 as first written — a diagnostic only; the shipped build and the gate run the default.
      const q = p.code[m.index - 1];
      if (process.env.B139_ROOT_STRINGS !== 'ref' && rootIdx.has(to) && (q === '"' || q === "'" || q === '`') && p.code[m.index + m[1].length] === q) continue;
      out.push({ to, name: m[1], at: m.index, gate });
    }
    return out;
  });
  const walk = (starts, stop) => {
    const seen = new Set(); const st = [...starts];
    while (st.length) { const i = st.pop(); if (seen.has(i) || stop(i)) continue; seen.add(i);
      for (const r of refs[i]) if (!r.gate) st.push(r.to); }
    return seen;
  };
  // first paint: from every load-time piece and PlayerApp, following every edge but a gate site
  const loadTime = P.map((p, i) => (!p.declares ? i : -1)).filter(i => i >= 0);
  // a piece no name reaches from anywhere (dead, or reached through window/string) stays in first paint —
  // and so is a root of it: what IT names must be there too
  const any = walk([...loadTime, host, ...roots.map(r => owner.get(r))], () => false);
  const unreached = P.map((_, i) => i).filter(i => !any.has(i));
  const fp = walk([...loadTime, host, ...unreached], () => false);
  // each chunk: from its roots, stopping at first paint
  const reach = {};
  for (const [c, rs] of Object.entries(CHUNKS)) reach[c] = walk(rs.map(r => owner.get(r)), i => fp.has(i));
  const where = P.map((_, i) => {
    if (fp.has(i)) return 'app';
    const who = Object.keys(reach).filter(c => reach[c].has(i));
    return who.length === 1 ? who[0] : 'app';   // shared by both chunks, or reached by no name → app.js
  });
  // THE REFUSAL: a first-paint piece naming a chunk piece outside a gate site
  const refusals = [];
  P.forEach((p, i) => { if (where[i] !== 'app') return;
    for (const r of refs[i]) if (!r.gate && where[r.to] !== 'app')
      refusals.push({ from: p.names[0] || `L${p.line}`, line: p.line, name: r.name, chunk: where[r.to], ctx: p.code.slice(Math.max(0, r.at - 50), r.at + r.name.length + 30) }); });
  // a gate site naming a root that did NOT land in its chunk (e.g. something in first paint pulled it in)
  for (const [c, rs] of Object.entries(CHUNKS)) for (const r of rs) if (where[owner.get(r)] !== c)
    refusals.push({ from: '(chunk root)', line: P[owner.get(r)].line, name: r, chunk: where[owner.get(r)], ctx: `root ${r} landed in ${where[owner.get(r)]}, not ${c}` });
  // ADDENDUM 427: a dynamic lookup anywhere in app.jsx (comments stripped) is refused outright
  P.forEach(p => { for (const m of p.code.matchAll(/(?<![\w$.])(window|globalThis|self)\s*\[|(?<![\w$.])(eval|Function)\s*\(/g))
    refusals.push({ from: p.names[0] || `L${p.line}`, line: p.line, name: m[0], chunk: 'dynamic', ctx: p.code.slice(Math.max(0, m.index - 50), m.index + 40) }); });
  return { P, where, refusals, owner };
}

// the text esbuild compiles for one output: app.jsx with every other piece's lines blanked
export function textFor(src, P, where, out) {
  const L = src.split('\n'); const keep = new Array(L.length).fill(false);
  P.forEach((p, i) => { if (where[i] === out) for (let k = p.lines[0]; k < p.lines[1]; k++) keep[k] = true; });
  return L.map((l, k) => (keep[k] ? l : '')).join('\n');
}

// ── SPLIT A's CHECK (ruling release-r7-bug-burndown ADDENDUM 426 §1, 428): nothing reads a lazy file before its
// surface opens. The lazy files' globals, every reader the tree holds, and the screens each reader serves are pinned
// here; the build REFUSES (1) a lazy file still loaded by player/index.html, (2) a reader not in this table — an
// app.jsx piece or an eager page script — and (3) a reader whose screens do not all ensure its part
// (app.jsx's PLAYER_SCREEN_PARTS, read from the source). A new reader is a review, not a silent load-order bet.
export const LAZY_GLOBALS = { vessels: ['SWRPGVessels', 'SWRPGVesselView'], ogg: ['SWRPGOggImport', 'SWRPGOggExport'], sheet: ['SWRPGDiceHub'] };
export const LAZY_READERS = {
  // app.jsx pieces (by declared name) → the screens on which they read
  importShipName: ['import'], exportCarried: ['import'], ImportOgg: ['import'],        // the OggDude import receipt
  yardResolveCtx: ['import', 'sheet', 'yard', 'store'],   // guarded (falls back to no characters); its callers' screens
  FullCreator: ['custom'],                                // the creator's store step: counter ship names (guarded)
  sheetCargoShip: ['sheet'], SheetCargoAct: ['sheet'], SheetHoldDoor: ['sheet'], SheetVesselsCount: ['sheet'], SheetVesselsS4: ['sheet'], sheetVesselFilesIn: ['sheet'],
  // SWRPGDiceHub (lib/shared/diceHub.jsx, the sheet part's first file; ruling encounters-e3-dicehub-move M2): its 13 readers
  SheetCrits: ['sheet'], sheetWeaponTalentDamage: ['sheet'], LoadoutItemDetail: ['sheet'], SheetSpine: ['sheet'], m7CareerSuffix: ['sheet'],
  m7RollsLine: ['sheet'], whySheetLines: ['sheet'], SheetEncumbranceWhy: ['sheet'], sheetAbilityToldWords: ['sheet'], SheetStack: ['sheet'],
  SheetPack: ['sheet'], SheetAbilitiesRoom: ['sheet'], SheetPaper: ['sheet'],
  PlayerStoreYard: ['store'], PlayerYardS4: ['yard'],
  PlayerApp: ['yard', 'store'],                           // yardGo / the yard bar / yardShipOwnerWord; the store's ship seam (guarded)
  // eager page scripts (by path) → the screens on which they read
  'lib/library/npc/benchStore.js': ['npc'],               // L421: the bench's ship ops (call time; `|| null` would degrade silently)
};

function objLiteral(src, name) {
  const m = src.match(new RegExp('^var ' + name + ' = (\\{[\\s\\S]*?\\n\\});', 'm'));
  if (!m) throw new Error(`playerSplit: ${name} not found in player/app.jsx`);
  return Function('"use strict"; return (' + m[1] + ');')();   // the build's own source, not page input
}

export function lazyCheck(src, P, readFile) {
  const parts = objLiteral(src, 'PLAYER_PARTS'), screens = objLiteral(src, 'PLAYER_SCREEN_PARTS');
  const refusals = [];
  // B-1912 (ADDENDUM 761): a raw lib/ file loads as its dist/ copy, so a URL names its SOURCE once `dist/` is dropped —
  // both lists below and LAZY_READERS speak in source paths, and the check reads the source
  const srcOf = u => u.replace(/^\//, '').replace(/^dist\/(?=lib\/)/, '');
  const lazyFiles = Object.values(parts).flat().map(srcOf).filter(f => f.startsWith('lib/'));
  const html = readFile('player/index.html');
  const pageScripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(m => srcOf(m[1])).filter(s => !/^https?:/.test(s));
  for (const f of lazyFiles) if (pageScripts.includes(f)) refusals.push(`player/index.html still loads ${f} (a lazy part)`);
  const readersOf = code => Object.entries(LAZY_GLOBALS).filter(([, gs]) => gs.some(g => new RegExp('(?<![\\w$])' + g + '(?![\\w$])').test(code))).map(([part]) => part);
  const check = (who, partsRead) => {
    if (!partsRead.length) return;
    const on = LAZY_READERS[who];
    if (!on) { refusals.push(`${who} reads ${partsRead.join('+')} and is not in LAZY_READERS (build/playerSplit.mjs)`); return; }
    for (const part of partsRead) for (const sc of on)
      if (!(screens[sc] || []).includes(part)) refusals.push(`${who} reads ${part} on screen '${sc}', whose PLAYER_SCREEN_PARTS lack it`);
  };
  for (const p of P) check(p.names[0] || `player/app.jsx:${p.line}`, readersOf(p.code));
  for (const f of pageScripts) {
    if (f === 'player/app.js' || lazyFiles.includes(f)) continue;
    let s = f; try { readFile(s.replace(/\.js$/, '.jsx')); s = s.replace(/\.js$/, '.jsx'); } catch (e) { /* plain .js */ }
    let text; try { text = readFile(s); } catch (e) { continue; }   // a built output not on disk yet
    check(f, readersOf(esbuild.transformSync(text, { loader: s.endsWith('.jsx') ? 'jsx' : 'js', minifyWhitespace: true }).code));
  }
  return refusals;
}
