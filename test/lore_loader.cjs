#!/usr/bin/env node
/* lib/shared/lore.js — the one loader for planets and factions (ruling `between-sessions-lap-a-card` §3 item 6).
 *   L1  refs() reads every ref of every served planet and faction file, both shapes, each to a named book; none dropped.
 *   L2  isEntry() counts 80 planets and 28 factions; faction_index and isb_dossier_content are not entries.
 *   L3  the planet sheet DRAWS the same Planet Compendium source through refs() as through its old regex, over every
 *       planet file (four planets hold an object-shaped compendium ref the old read skipped; each has authored lore, so
 *       neither read draws it).
 *   L4  load() fetches a file once per page life, and a failed fetch reads null; factions() returns faction_index's 28.
 *   L5  the readers: gm/app.jsx's loadPlanetRecord and NpcGeneratorController fetch no lore path of their own, and both
 *       shells tag lore.js before the controller.
 * argv[2] (optional): another repo root to judge (the bite). */
const fs = require('fs');
const path = require('path');
const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '..');
let fails = 0;
const check = (ok, label) => { console.log((ok ? '  ✓ ' : '  ✗ ') + label); if (!ok) fails++; };

const Lore = require(path.join(ROOT, 'lib/shared/lore.js'));
const dir = (k) => path.join(ROOT, 'public/data', k);
const docs = (k) => fs.readdirSync(dir(k)).filter((f) => f.endsWith('.json'))
  .map((f) => ({ f, d: JSON.parse(fs.readFileSync(path.join(dir(k), f), 'utf8')) }));
const planets = docs('planets'), factions = docs('factions');

// L1
let raw = 0, read = 0, shapes = new Set(), bad = [];
for (const { f, d } of planets.concat(factions)) {
  const src = Array.isArray(d.source_refs) ? d.source_refs : [];
  const out = Lore.refs(d);
  raw += src.length; read += out.length;
  src.forEach((x) => shapes.add(typeof x));
  out.forEach((r) => { if (!r.book || /\bpp?\.\s*\d/.test(r.book)) bad.push(f + ': ' + r.book); });
  if (out.length !== src.length) bad.push(f + `: ${src.length} refs, ${out.length} read`);
}
check(shapes.has('string') && shapes.has('object'), `L1 both shapes are served (${[...shapes].join(', ')})`);
check(raw > 0 && read === raw && bad.length === 0, `L1 refs() reads ${read} of ${raw} refs to a named book, no page left in a book (${bad.slice(0, 3).join('; ') || 'none'})`);
const s = Lore.refs({ source_refs: ['Force and Destiny Core Rulebook pp.200, 365-366', 'Planet Compendium p.4', 'Dawn of Rebellion',
  { title: 'EotE', page: 353, detail: 'x' }, { source: 'AoR', pages: '12', scope: 'y' }] });
check(JSON.stringify(s) === JSON.stringify([{ book: 'Force and Destiny Core Rulebook', pages: '200, 365-366', note: null },
  { book: 'Planet Compendium', pages: '4', note: null }, { book: 'Dawn of Rebellion', pages: null, note: null },
  { book: 'EotE', pages: '353', note: 'x' }, { book: 'AoR', pages: '12', note: 'y' }]), 'L1 the two shapes read as one { book, pages, note }');

// L2
const pe = planets.filter((x) => Lore.isEntry('planets', x.d)).length;
const fe = factions.filter((x) => Lore.isEntry('factions', x.d)).map((x) => x.f);
check(pe === 80 && pe === planets.length, `L2 planets: ${pe} entries of ${planets.length} files (80)`);
check(fe.length === 28 && !fe.includes('faction_index.json') && !fe.includes('isb_dossier_content.json'), `L2 factions: ${fe.length} entries (28), the index and the dossier content left out`);

// L3
let diff = [];
for (const { f, d } of planets) {
  // what the sheet DRAWS: the source shows only beside compendium text on a record with no authored lore (B-1145)
  const id = d.identity || {}, c = d.compendium || {};
  const draws = !(id.essence || id.atmosphere || id.reputation) && !!(c.background || c.government || c.major_cities);
  const old = (d.source_refs || []).find((x) => typeof x === 'string' && /^Planet Compendium\b/.test(x));
  const was = draws && old ? old.replace(/\s*p\.?\s*\d.*$/, '') : null;
  const ref = Lore.refs(d).find((r) => /^Planet Compendium\b/.test(r.book));
  const now = draws && ref ? ref.book : null;
  if (was !== now) diff.push(`${f}: ${was} → ${now}`);
}
const drawn = planets.filter(({ d }) => !((d.identity || {}).essence || (d.identity || {}).atmosphere || (d.identity || {}).reputation) && d.compendium).length;
check(drawn > 0 && diff.length === 0, `L3 (${drawn} draw it) the sheet's compendium source is unchanged over ${planets.length} planets (${diff.slice(0, 3).join('; ') || 'none'})`);

// L4 + L5 (async)
(async () => {
  const fresh = () => { delete require.cache[require.resolve(path.join(ROOT, 'lib/shared/lore.js'))]; return require(path.join(ROOT, 'lib/shared/lore.js')); };
  const calls = [];
  global.fetch = (p) => { calls.push(p); const f = path.join(ROOT, p);
    return Promise.resolve(fs.existsSync(f) ? { ok: true, json: () => Promise.resolve(JSON.parse(fs.readFileSync(f, 'utf8'))) } : { ok: false }); };
  const L = fresh();
  const a = await L.load('planets', 'corellia'), b = await L.load('planets', 'corellia'), miss = await L.load('planets', 'no_such_world');
  check(a && a.id === 'corellia' && a === b && calls.filter((c) => c.endsWith('corellia.json')).length === 1, 'L4 load() fetches a file once and hands back the same record');
  check(miss === null, 'L4 a failed fetch reads null');
  const fs28 = await fresh().factions();
  check(fs28.length === 28 && fs28.every((r) => r.id && r.name), `L4 factions() returns ${fs28.length} faction records (28)`);

  const app = fs.readFileSync(path.join(ROOT, 'gm/app.jsx'), 'utf8');
  const lp = app.slice(app.indexOf('const loadPlanetRecord'), app.indexOf('const handleSelectPlanet'));
  check(lp.includes("SWRPGLore.load('planets'") && !/public\/data\/planets/.test(lp), "L5 gm/app.jsx's loadPlanetRecord reads through SWRPGLore.load");
  check(!/public\/data\/(planets|factions)/.test(app.replace(/\/\/.*$/gm, '')), 'L5 gm/app.jsx names no lore path of its own');
  const ctl = fs.readFileSync(path.join(ROOT, 'lib/npc/NpcGeneratorController.js'), 'utf8');
  check(ctl.includes('SWRPGLore.factions()') && !/fetch\('public\/data\/factions/.test(ctl), 'L5 NpcGeneratorController reads the factions through SWRPGLore.factions');
  for (const shell of ['gm/index.html', 'player/index.html']) {
    const h = fs.readFileSync(path.join(ROOT, shell), 'utf8');
    const lo = h.indexOf('/lib/shared/lore.js'), ct = h.indexOf('lib/npc/NpcGeneratorController.js');
    check(lo !== -1 && ct !== -1 && lo < ct, `L5 ${shell} tags lore.js before the NPC controller`);
  }
  console.log(fails ? `\nlore_loader: ${fails} FAILED` : '\nlore_loader: all green');
  process.exit(fails ? 1 : 0);
})();
