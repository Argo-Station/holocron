#!/usr/bin/env node
/* store_glyphs — the wall around lib/store/glyphs.js, THE item glyph library.
 *
 * Every item a visitor sees in the store, the sheet's shop and the store bars gets its picture from this
 * module, so a hole here is a blank plate on a live surface. The checks:
 *
 *   (i)   SHAPE     — 58 families, each with a path on the 512 canvas, a measured bounding box that lies
 *                     inside the canvas, a source path and an author; CREDITS names every author present
 *                     and the credit line names them all (CC BY 3.0 asks for it).
 *   (ii)  COVERAGE  — every record in weapons.json, armor.json and gear.json maps to a DEFINED family;
 *                     the `parcel` fallthrough is reached only by the two registry types that mean
 *                     "an unspecified thing" (Generic, Personal Gear) — anything else landing there is a
 *                     mapping hole. The harvest (items measured) is stated; zero is a failed run.
 *   (iii) ALIASES   — every family name the FIRST library used still resolves to a glyph, and the three
 *                     names the store bars pass (pistol, armor, storage) resolve; an unknown name falls
 *                     to parcel, never throws.
 *   (iv)  FIT       — the fitted transform puts each glyph's box inside the canvas with the longer side
 *                     filling it (the shared-keyline rule); svgString renders a parseable element that
 *                     names its family.
 *   (v)   RULES     — spot checks that name decides the form (a Lightwhip is a whip, a saber pike a
 *                     polearm) and that the registry type decides the rest.
 *
 * Run: node test/store_glyphs.cjs
 */
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const G = require(path.join(REPO, 'lib/store/glyphs.js'));
const reg = (f, k) => Object.values(JSON.parse(fs.readFileSync(path.join(REPO, 'public/data/canonical', f + '.json'), 'utf8'))[k] || {});

let pass = 0, fail = 0;
const check = (label, cond, detail) => {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (detail ? '  ->  ' + detail : '')); }
};

// (i) shape
const fams = Object.keys(G.GLYPHS);
check('58 families', fams.length === 58, String(fams.length));
const badShape = fams.filter((k) => { const g = G.GLYPHS[k]; return !(typeof g.d === 'string' && g.d.length > 20 && Array.isArray(g.bb) && g.bb.length === 4 && g.src && g.by); });
check('every family carries d, bb, src, by', badShape.length === 0, badShape.join(', '));
const badBox = fams.filter((k) => { const b = G.GLYPHS[k].bb; return b[0] < 0 || b[1] < 0 || b[0] + b[2] > G.CANVAS + 0.5 || b[1] + b[3] > G.CANVAS + 0.5 || b[2] <= 0 || b[3] <= 0; });
check('every bounding box lies inside the canvas', badBox.length === 0, badBox.join(', '));
const authors = new Set(fams.map((k) => G.GLYPHS[k].by));
check('CREDITS names every author present', [...authors].every((a) => G.CREDITS[a] > 0) && Object.keys(G.CREDITS).length === authors.size);
check('the credit line names every author and the source', [...authors].every((a) => G.CREDIT_LINE.includes(a)) && /game-icons\.net/.test(G.CREDIT_LINE) && /CC BY 3\.0/.test(G.CREDIT_LINE));
check('every src is author/name from the library', fams.every((k) => /^[a-z0-9-]+\/[a-z0-9-]+$/.test(G.GLYPHS[k].src)));

// (ii) coverage
const items = [
  ...reg('weapons', 'weapons').map((x) => ({ ...x, section: 'weapons' })),
  ...reg('armor', 'armor').map((x) => ({ ...x, section: 'armor' })),
  ...reg('gear', 'gear').map((x) => ({ ...x, section: 'gear' })),
];
const undefinedFam = items.filter((it) => !G.GLYPHS[G.familyFor(it)]);
check('every registry record maps to a defined family', undefinedFam.length === 0, undefinedFam.slice(0, 5).map((x) => x.name).join(', '));
const PARCEL_OK = new Set(['Generic', 'Personal Gear']);
const parcelLeak = items.filter((it) => G.familyFor(it) === 'parcel' && !PARCEL_OK.has(it.type));
check('parcel is reached only by Generic and Personal Gear', parcelLeak.length === 0, parcelLeak.slice(0, 6).map((x) => x.name + ' [' + x.type + ']').join(', '));
const used = new Set(items.map(G.familyFor));
const unused = fams.filter((k) => !used.has(k));
check('every family is used by at least one record', unused.length === 0, unused.join(', '));
check(`HARVEST: ${items.length} registry records measured (zero is a failed run)`, items.length > 0);

// (iii) aliases
const OLD = ['pistol', 'rifle', 'cannon', 'launcher', 'grenade', 'polearm', 'sword', 'knife', 'ax', 'club', 'whip', 'bow', 'fist', 'lightsaber', 'flame', 'net', 'dart', 'armor', 'survival', 'medical', 'tools', 'comms', 'security', 'storage', 'consumable', 'droid', 'cyber', 'beast', 'relic', 'generic'];
const dead = OLD.filter((k) => !G.GLYPHS[G.resolve(k)]);
check('every first-library family name still resolves', dead.length === 0, dead.join(', '));
check('the store bars\' three names resolve (pistol, armor, storage)', ['pistol', 'armor', 'storage'].every((k) => G.GLYPHS[G.resolve(k)]));
check('an unknown name falls to parcel, never throws', G.resolve('no-such-thing') === 'parcel');

// (iv) fit + render
const badFit = fams.filter((k) => { const t = G.fit(k), b = G.GLYPHS[k].bb; const w = b[2] * t[2], h = b[3] * t[2]; const x = b[0] * t[2] + t[0], y = b[1] * t[2] + t[1]; return Math.abs(Math.max(w, h) - G.CANVAS) > 0.5 || x < -0.5 || y < -0.5 || x + w > G.CANVAS + 0.5 || y + h > G.CANVAS + 0.5; });
check('the fit fills the canvas on the longer side and stays inside it', badFit.length === 0, badFit.join(', '));
const s = G.svgString('grenade', 20, '#fff');
check('svgString renders an svg that names its family', /^<svg [^>]*data-glyph="grenade"[^>]*>.*<path [^>]*d="M/.test(s) && s.endsWith('</svg>'));
check('zoom is 1 by default, capped at 1.25, and off below 32px (a bar icon never outgrows its slot)', G.zoomOf('pistol') === 1 && G.zoomOf('rifle') > 1 && fams.every((k) => G.zoomOf(k) <= 1.25) && G.drawSize('rifle', 20) === 20 && G.drawSize('rifle', 43) === 52);
check('svg() needs React only at call time (module loaded without it)', typeof G.svg === 'function' && typeof globalThis.React === 'undefined');

// (v) rules
[
  [{ section: 'weapons', name: 'Vibro-ax', type: 'Melee' }, 'ax'],
  [{ section: 'weapons', name: 'Lightwhip', type: 'Lightsaber' }, 'whip'],
  [{ section: 'weapons', name: 'Temple Guard Lightsaber Pike', type: 'Lightsaber' }, 'polearm'],
  [{ section: 'weapons', name: 'Shoto', type: 'Lightsaber' }, 'lightsaber'],
  [{ section: 'weapons', name: 'Heavy Blaster Pistol', type: 'Energy Weapon' }, 'pistol'],
  [{ section: 'weapons', name: 'Blaster Rifle', type: 'Energy Weapon' }, 'rifle'],
  [{ section: 'weapons', name: 'Thermal Detonator', type: 'Explosives/Other' }, 'grenade'],
  [{ section: 'armor', name: 'Laminate Armor' }, 'armor'],
  [{ section: 'gear', name: 'Hologoggles (Perception)', type: 'Tools/Electronics' }, 'goggles'],
  [{ section: 'gear', name: 'R7-Series Astromech Droid', type: 'Droids' }, 'astromech'],
  [{ section: 'gear', name: '3PX-Series Protocol Droid', type: 'Droids' }, 'protocol'],
  [{ section: 'gear', name: 'Recon Remote', type: 'Remotes' }, 'probe'],
  [{ section: 'gear', name: 'Cybernetic Arms (Mod V)', type: 'Cybernetics' }, 'limb'],
  [{ section: 'gear', name: 'Cybernetic Eyes', type: 'Cybernetics' }, 'eye'],
  [{ section: 'gear', name: 'Bantha', type: 'Riding Beasts' }, 'mount'],
  [{ section: 'gear', name: 'Sith Holocron', type: 'Holocrons/Ancient Lore' }, 'holocron'],
  [{ section: 'gear', name: 'Medpac', type: 'Medical' }, 'medpac'],
  [{ section: 'gear', name: 'Stimpack', type: 'Medical' }, 'stimpack'],
  [{ section: 'gear', name: 'Utility Belt', type: 'Carrying/Storage' }, 'belt'],
  [{ section: 'gear', name: 'Breath Mask', type: 'Survival' }, 'breathmask'],
  [{ section: 'gear', name: 'Ryll (100 doses)', type: 'Drugs and Consumables' }, 'crate'],
  [{ section: 'gear', name: 'Macrobinoculars', type: 'Detection/Surveillance Devices' }, 'binoculars'],
  [{ section: 'gear', name: 'Extra Reload', type: 'Reloads/Ammo' }, 'magazine'],
  [{ section: 'gear', name: 'Small Item', type: 'Generic' }, 'parcel'],
].forEach(([item, fam]) => check('rule: ' + item.name + ' → ' + fam, G.familyFor(item) === fam, 'got ' + G.familyFor(item)));

console.log(`\nstore glyphs: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
