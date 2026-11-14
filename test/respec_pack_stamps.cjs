#!/usr/bin/env node
/*
 * respec_pack_stamps.cjs — every reSpecialized pack on disk is OFFERED (the toggle's RESPEC_STAMPS, mods.js
 * SHIPPED_STAMPS) or SUPERSEDED by an offered one (mods.js SUPERSEDES); every offered stamp has its pack.
 *
 * WHY THIS EXISTS. The GAME VARIANTS toggle drives a LITERAL stamp list in `lib/shared/ui.jsx`, and
 * `smoke_respec` ③a pins that same list literally (ruling `f96-slice1-respec-assert-repoint` §3: an
 * expectation computed from the code under test cannot fail). Two literals are safe only if
 * something independent checks they cover what actually ships — otherwise a slice emits a pack,
 * forgets the list, and the pack is simply invisible with every test green.
 *
 * So this guard reads neither literal as truth: it reads the PACK DIRECTORIES on disk. A stamp with
 * no pack is a 404 on load (B-30's failure path); a pack that is neither offered nor superseded is
 * unreachable — both are red here.
 *
 * F-100 M6 re-point (ruling `f100-m6-contracts` R-M6K-5; `f100-m6-pack` R-M6G-13.2, norm 3): a line
 * has several versions now, and only the newest is OFFERED to a new character; the older one stays on
 * disk because the sheets stamped with it resolve it by path forever. So "the toggle's list = the packs
 * on disk" became two claims: OFFERED ⊆ DISK, and SUPERSEDED = DISK − OFFERED, where SUPERSEDED is
 * mods.js SUPERSEDES's keys, each mapped to an OFFERED successor (a stored old stamp reads as it).
 * KEPT: the list exists, non-vacuous, offered ⊆ disk, the two homes equal, every pack's manifest
 * `line` and `counts`. DROPPED: offered = disk. ADDED: superseded = disk − offered; no offered stamp
 * is superseded; every superseded stamp maps to an offered one.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PACK_DIR = path.join(ROOT, 'public/data/mods/respecialized');
const UI = path.join(ROOT, 'lib/shared/ui.jsx');

let pass = 0, fail = 0;
const check = (label, cond, detail) => {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (!cond && detail ? '\n          -> ' + detail : ''));
  cond ? pass++ : fail++;
};

// ── what is ON DISK: a directory holding the three files the resolver requires ──
const shipped = fs.readdirSync(PACK_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .filter((d) => ['specializations.overlay.json', 'talents.overlay.json', 'manifest.json']
    .every((f) => fs.existsSync(path.join(PACK_DIR, d.name, f))))
  .map((d) => 'respecialized@' + d.name)
  .sort();

// ── what the TOGGLE offers: the literal array, sliced out by name ──
const src = fs.readFileSync(UI, 'utf8');
const m = src.match(/RESPEC_STAMPS\s*=\s*\[([^\]]*)\]/);
const listed = m ? m[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean).sort() : null;

check('the toggle declares a RESPEC_STAMPS list at all', listed !== null,
  'no RESPEC_STAMPS array found in lib/shared/ui.jsx — the slice that renamed it owes this guard a re-point');
check('at least one pack ships (the comparison is non-vacuous)', shipped.length > 0,
  'no pack directories under public/data/mods/respecialized/');

check('every LISTED (offered) stamp has a pack on disk (no 404 on load) — OFFERED ⊆ DISK',
  listed !== null && listed.every((s) => shipped.includes(s)),
  'listed but absent: ' + JSON.stringify((listed || []).filter((s) => !shipped.includes(s))));

// Each manifest must declare the `line` the card's derived "Covers …" sentence is built from
// (R-F96-3, Jason's choice): a pack with no line contributes nothing and the sentence silently
// under-reports its own coverage.
const missingLine = shipped.filter((s) => {
  const v = s.split('@')[1];
  try { return !JSON.parse(fs.readFileSync(path.join(PACK_DIR, v, 'manifest.json'), 'utf8')).line; }
  catch (e) { return true; }
});
check('every shipped pack manifest declares a `line` (the derived copy reads it)',
  missingLine.length === 0, 'no line: ' + JSON.stringify(missingLine));

// F-102 (R-FSA-A5-2): the sources box reads the overlay index from `lib/shared/mods.js`
// `SHIPPED_STAMPS` — a SECOND home for the same list, because a browser cannot glob the packs and
// the box lives in a module that cannot see the card's closure. Two homes are a drift waiting to
// happen unless something holds them equal; this does, and holds both equal to the disk.
const MODS = require(path.join(ROOT, 'lib', 'shared', 'mods.js'));
const indexed = Array.isArray(MODS.SHIPPED_STAMPS) ? MODS.SHIPPED_STAMPS.slice().sort() : null;
check('mods.js exports SHIPPED_STAMPS (the sources box\'s overlay index)', indexed !== null, 'no SHIPPED_STAMPS export');
check('SHIPPED_STAMPS equals the toggle\'s RESPEC_STAMPS (two homes, one list)',
  indexed !== null && listed !== null && JSON.stringify(indexed) === JSON.stringify(listed),
  'mods.js ' + JSON.stringify(indexed) + ' vs ui.jsx ' + JSON.stringify(listed));
// F-100 M6 (R-M6K-5): OFFERED vs SUPERSEDED. Every pack on disk is one or the other, never both, and a
// superseded stamp maps to an OFFERED successor — the stamp MODS.active() reads a stored old one as.
const sup = MODS.SUPERSEDES && typeof MODS.SUPERSEDES === 'object' ? MODS.SUPERSEDES : null;
check('mods.js exports SUPERSEDES (a superseded stamp → its successor, read in active())', sup !== null, 'no SUPERSEDES export');
const superseded = sup ? Object.keys(sup).sort() : [];
const offered = indexed || [];
const diskMinusOffered = shipped.filter((s) => !offered.includes(s));
check('SUPERSEDED = DISK − OFFERED (every pack on disk is offered or superseded)',
  JSON.stringify(superseded) === JSON.stringify(diskMinusOffered),
  'SUPERSEDES keys ' + JSON.stringify(superseded) + ' vs disk − offered ' + JSON.stringify(diskMinusOffered));
check('no OFFERED stamp is superseded',
  offered.every((s) => !superseded.includes(s)),
  'offered and superseded: ' + JSON.stringify(offered.filter((s) => superseded.includes(s))));
check('every superseded stamp maps to an OFFERED successor',
  superseded.every((s) => offered.includes(sup[s])),
  'successor not offered: ' + JSON.stringify(superseded.filter((s) => !offered.includes(sup[s])).map((s) => s + ' → ' + sup[s])));
// F-100 M11 (ruling `f100-m11-finish-line` R-M11F-13): JOINS — a joining stamp and the prior offered set it joins for a
// version-0/1 stored list (R-M11F-12). Its keys are OFFERED stamps and never SUPERSEDED (a superseded key would be read
// as its successor before the join could see it), and every prior-set member is offered.
const joins = MODS.JOINS && typeof MODS.JOINS === 'object' ? MODS.JOINS : null;
check('mods.js exports JOINS (a joining stamp → the prior offered set it joins, version 0/1 only)', joins !== null, 'no JOINS export');
const joinKeys = joins ? Object.keys(joins) : [];
check('every JOINS key is an OFFERED stamp and never in SUPERSEDES',
  joinKeys.every((k) => offered.includes(k) && !superseded.includes(k)),
  'bad keys: ' + JSON.stringify(joinKeys.filter((k) => !offered.includes(k) || superseded.includes(k))));
check('every JOINS prior set is non-empty and wholly OFFERED',
  joinKeys.every((k) => Array.isArray(joins[k]) && joins[k].length && joins[k].every((p) => offered.includes(p) && p !== k)),
  'bad prior sets: ' + JSON.stringify(joinKeys.filter((k) => !(Array.isArray(joins[k]) && joins[k].length && joins[k].every((p) => offered.includes(p) && p !== k)))));
// The box's variant row derives its figures from the manifest (R-FSA-A4-1); a manifest without
// `counts` renders "nothing yet", which would be a false statement about a pack that rewrites.
const noCounts = shipped.filter((s) => {
  const v = s.split('@')[1];
  try { const m = JSON.parse(fs.readFileSync(path.join(PACK_DIR, v, 'manifest.json'), 'utf8')); return !(m.counts && m.counts.specs); }
  catch (e) { return true; }
});
check('every shipped pack manifest carries `counts` (the sources box derives its row from them)',
  noCounts.length === 0, 'no counts: ' + JSON.stringify(noCounts));

console.log('\nrespec pack stamps: ' + pass + ' pass, ' + fail + ' fail  (on disk: ' + shipped.join(', ') + ' · offered: ' +
  offered.join(', ') + ' · superseded: ' + superseded.join(', ') + ')');
process.exit(fail ? 1 : 0);
