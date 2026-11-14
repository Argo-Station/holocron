#!/usr/bin/env node
/**
 * shop_canonical.cjs — STANDING guard for the canonical → store display-shape contract (ADR 0003
 * items cluster). Proves every canonical weapon/armor/gear record shapes to the store item contract
 * the store kernel renders (lib/store/view.jsx buildCatalog → SWItems.canonicalToStore, view.jsx:98).
 *
 * STORE-UNIFY (2026-07-10): the random shop GENERATOR (lib/shopGenerator.js) was RETIRED — the one
 * store kernel is now the single source. This guard shed its generator-specific checks (flatten via
 * Gen, the pre-roll vehicle filter, and the generate() stock smoke) and keeps the load-bearing part:
 * the canonical→store shape contract, which the kernel depends on unchanged. The flatten is now a
 * plain envelope unwrap (no generator needed).
 *
 * Checks:
 *   1. Each registry envelope unwraps to its declared `count` of records, each _section-tagged.
 *   2. canonicalToStore shapes EVERY record to the store contract:
 *        - weapons: damage is "+N" for brawn / plain N for flat (FFG table convention,
 *          re-pointed by release-r7-bug-burndown ADDENDUM 37 D-R7GD1 (a): a NEGATIVE Brawn add reads "−N" (U+2212), and only
 *          as ItemResolve.brawnDamageText prints it — GUNGPES, Nexus of Power p.104, B-1429; KEEPS "+N" for every add ≥ 0
 *          and plain N for flat; DROPS "every brawn label starts with +";
 *          fad-ocr p.175 / eote p.169); skill is a DISPLAY label (no '_' ref leak); qualities
 *          are flat strings; key/name present.
 *        - armor: at least one of {soak, defense} present (schema anyOf mirror); key/name present.
 *        - gear: type + key + name present.
 *
 * Run:  node test/shop_canonical.cjs   (needs public/data/canonical/{weapons,armor,gear}.json)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

// lib/items.js is an IIFE binding `global` to module.exports in CommonJS → canonicalToStore is there.
const SWItems = require('../lib/items.js').SWItems;
const ItemResolve = require('../lib/shared/itemResolve.js');   // D-R7GD1: the ONE signed formatter

// Envelope unwrap — mirrors the kernel (view.jsx buildCatalog): records live under the section-named
// key as an id→record map ({ count, weapons: { id: rec, ... } }). Tolerates a bare map or array too.
function flatten(reg, section) {
  var body = (reg && reg[section]) ? reg[section] : reg;
  var recs = Array.isArray(body) ? body : Object.keys(body || {}).map(id => body[id]);
  return recs.map(r => Object.assign({}, r, { _section: section }));
}

function main() {
  const regs = {
    weapons: rd('public/data/canonical/weapons.json'),
    armor: rd('public/data/canonical/armor.json'),
    gear: rd('public/data/canonical/gear.json'),
  };
  console.log('='.repeat(72));
  console.log('SHOP CANONICAL FEED — guard (canonical → store display-shape contract)');
  console.log('='.repeat(72));

  const fails = [];

  // 1 — counts + _section tagging.
  const flat = [];
  for (const section of ['weapons', 'armor', 'gear']) {
    const f = flatten(regs[section], section);
    flat.push(...f);
    if (typeof regs[section].count === 'number' && f.length !== regs[section].count) {
      fails.push(`flatten ${section} ${f.length} != envelope count ${regs[section].count}`);
    }
  }
  if (flat.some(r => !r._section)) fails.push('flatten: a record is missing _section');
  const nW = flat.filter(r => r._section === 'weapons').length;
  const nA = flat.filter(r => r._section === 'armor').length;
  const nG = flat.filter(r => r._section === 'gear').length;
  console.log(`  [1] flatten: ${nW}w + ${nA}a + ${nG}g = ${flat.length} records, all _section-tagged`);

  // 2 — canonicalToStore shape over every record (the load-bearing contract the kernel renders).
  let brawnShaped = 0, flatShaped = 0, refLeak = 0, badQual = 0, armorEmpty = 0, gearNoType = 0;
  for (const rec of flat) {
    const s = SWItems.canonicalToStore(rec, rec._section);
    if (!s || !s.key || !s.name) { fails.push(`store shape missing key/name: ${rec.id}`); continue; }
    if (rec._section === 'weapons') {
      if (rec.damage && rec.damage.base === 'brawn') {
        brawnShaped++;
        const v = rec.damage.value != null ? rec.damage.value : 0;
        const lead = v < 0 ? '\u2212' : '+';
        if (typeof s.damage !== 'string' || s.damage !== ItemResolve.brawnDamageText(v) || s.damage[0] !== lead)
          fails.push(`${rec.id}: brawn damage not "${lead}N" through brawnDamageText (got ${s.damage})`);
      } else if (rec.damage) {
        flatShaped++;
        if (typeof s.damage === 'string' && s.damage[0] === '+') fails.push(`${rec.id}: flat damage rendered as "+N"`);
      }
      if (s.skill && /[_]/.test(s.skill)) { refLeak++; fails.push(`${rec.id}: skill ref leaked (${s.skill})`); }
      if (!Array.isArray(s.qualities) || s.qualities.some(q => typeof q !== 'string')) { badQual++; fails.push(`${rec.id}: qualities not flat strings`); }
    } else if (rec._section === 'armor') {
      if (s.soak == null && s.defense == null) { armorEmpty++; fails.push(`${rec.id}: armor with neither soak nor defense`); }
    } else {
      if (!s.type) { gearNoType++; fails.push(`${rec.id}: gear missing type`); }
    }
  }
  console.log(`  [2] canonicalToStore: ${brawnShaped} brawn->"+N", ${flatShaped} flat->N; ref-leaks ${refLeak}, bad-qualities ${badQual}, empty-armor ${armorEmpty}, gear-no-type ${gearNoType}`);

  console.log('-'.repeat(72));
  if (fails.length) {
    console.log(`FAIL (${fails.length}):`);
    fails.slice(0, 40).forEach(f => console.log('  - ' + f));
    process.exit(1);
  }
  console.log('PASS — canonical feed holds the store display-shape contract.');
}

main();
