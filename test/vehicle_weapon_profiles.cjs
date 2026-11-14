/**
 * Guard: every vehicle weapon profile in the library carries the 14 fields
 * with correct types, and range_value / skill / quality-resolved keys come
 * from the vocabularies the app ships.
 *
 * Commissioned by ruling vehicle-armament-repair R-VAR-2.
 */
const fs = require("fs");
const path = require("path");

const LIB = path.join(__dirname, "..", "public", "data", "vehicle-library");

const VALID_RANGE_VALUES = new Set([
  "wrClose", "wrShort", "wrMedium", "wrLong", "wrExtreme",
  "wrEngaged",   // R-R7-V2 (b), as RANGE_LABEL_MAP below
]);

const RANGE_LABEL_MAP = {
  wrClose: "Close",
  wrShort: "Short",
  wrMedium: "Medium",
  wrLong: "Long",
  wrExtreme: "Extreme",
  wrEngaged: "Engaged",   // R-R7-V2 (b): those weapons print Range [Engaged]
};

// BRAWL and MELEE join by R-R7-V2 (b) (card release-r7-bug-burndown ADDENDUM 2): a vehicle's printed close-combat weapon
// (the Trident's tentacles and boarding drill, CotR p.73); lib/shared/sheetPool.js MELEE_CLASS already reads both
const VALID_SKILLS = new Set(["GUNN", "RANGHVY", "BRAWL", "MELEE"]);

const VALID_QUALITY_KEYS = new Set([
  "ACCURATE", "AUTOFIRE", "BLAST", "BREACH", "BURN", "CONCUSSIVE",
  "CUMBERSOME", "DISORIENT", "ENSNARE", "GUIDED", "INACCURATE", "ION",
  "KNOCKDOWN", "LIMITEDAMMO", "LINKED", "PIERCE", "SLOWFIRING",
  "STUNDAMAGE", "SUNDER", "TRACTOR", "VICIOUS",
]);

const FIRING_ARC_KEYS = new Set([
  "fore", "aft", "port", "starboard", "dorsal", "ventral",
]);

const REQUIRED_FIELDS = {
  key:                "string",
  name:               "string",
  damage:             "number",
  crit:               "number",
  range_value:        "string",
  range_label:        "string",
  count:              "number",
  location:           "string|null",
  turret:             "boolean",
  retractable:        "boolean",
  qualities:          "string",
  skill:              "string",
  qualities_resolved: "array",
  firing_arcs:        "object",
};

function checkType(val, spec) {
  if (spec === "string|null") return typeof val === "string" || val === null;
  if (spec === "array") return Array.isArray(val);
  if (spec === "object") return typeof val === "object" && val !== null && !Array.isArray(val);
  return typeof val === spec;
}

// Pre-existing null damage/crit — pinned so the guard exits 0 on the known state.
// A NEW violation still goes red. Board row B-218, data question not this guard's.
const KNOWN_BAD = new Set([
  "starfighters.json:TIEADVANCEDV1:weapon[1].damage expected number, got null",
  "starfighters.json:TIEADVANCEDV1:weapon[1].crit expected number, got null",
  "support.json:DEATHSTAR1:weapon[0].damage expected number, got null",
  "support.json:DEATHSTAR1:weapon[0].crit expected number, got null",
]);

let totalVehicles = 0;
let totalWeapons = 0;
let fails = [];

const files = fs.readdirSync(LIB)
  .filter(f => f.endsWith(".json") && f !== "index.json" && f !== "taxonomy.json")
  .sort();

for (const fname of files) {
  const data = JSON.parse(fs.readFileSync(path.join(LIB, fname), "utf8"));
  const entries = data.entries || [];

  for (const v of entries) {
    totalVehicles++;
    const vKey = v.key || "UNKNOWN";
    const weapons = v.weapons || [];

    for (let wi = 0; wi < weapons.length; wi++) {
      totalWeapons++;
      const w = weapons[wi];
      const loc = `${fname}:${vKey}:weapon[${wi}]`;

      for (const [field, expectedType] of Object.entries(REQUIRED_FIELDS)) {
        if (!(field in w)) {
          fails.push(`${loc} missing field '${field}'`);
          continue;
        }
        if (!checkType(w[field], expectedType)) {
          fails.push(`${loc}.${field} expected ${expectedType}, got ${w[field] === null ? "null" : typeof w[field]}`);
        }
      }

      if (typeof w.range_value === "string" && !VALID_RANGE_VALUES.has(w.range_value)) {
        fails.push(`${loc}.range_value '${w.range_value}' not in vocabulary`);
      }

      if (typeof w.range_value === "string" && typeof w.range_label === "string" &&
          RANGE_LABEL_MAP[w.range_value] !== w.range_label) {
        fails.push(`${loc}.range_label '${w.range_label}' does not match range_value '${w.range_value}' (expected '${RANGE_LABEL_MAP[w.range_value]}')`);
      }

      if (typeof w.skill === "string" && !VALID_SKILLS.has(w.skill)) {
        fails.push(`${loc}.skill '${w.skill}' not in vocabulary`);
      }

      if (Array.isArray(w.qualities_resolved)) {
        for (let qi = 0; qi < w.qualities_resolved.length; qi++) {
          const qr = w.qualities_resolved[qi];
          if (!qr || typeof qr !== "object") {
            fails.push(`${loc}.qualities_resolved[${qi}] not an object`);
            continue;
          }
          if (!("key" in qr)) {
            fails.push(`${loc}.qualities_resolved[${qi}] missing 'key'`);
          } else if (!VALID_QUALITY_KEYS.has(qr.key)) {
            fails.push(`${loc}.qualities_resolved[${qi}].key '${qr.key}' not in vocabulary`);
          }
          if (!("count" in qr)) {
            fails.push(`${loc}.qualities_resolved[${qi}] missing 'count'`);
          } else if (qr.count !== null && typeof qr.count !== "number") {
            fails.push(`${loc}.qualities_resolved[${qi}].count expected number|null, got ${typeof qr.count}`);
          }
        }
      }

      if (typeof w.firing_arcs === "object" && w.firing_arcs !== null) {
        const faKeys = Object.keys(w.firing_arcs);
        for (const fk of faKeys) {
          if (!FIRING_ARC_KEYS.has(fk)) {
            fails.push(`${loc}.firing_arcs unknown key '${fk}'`);
          }
          if (typeof w.firing_arcs[fk] !== "boolean") {
            fails.push(`${loc}.firing_arcs.${fk} expected boolean, got ${typeof w.firing_arcs[fk]}`);
          }
        }
        for (const expected of FIRING_ARC_KEYS) {
          if (!(expected in w.firing_arcs)) {
            fails.push(`${loc}.firing_arcs missing '${expected}'`);
          }
        }
      }
    }
  }
}

console.log(`Vehicle weapon profiles: ${totalVehicles} vehicles, ${totalWeapons} weapons`);

const knownBad = fails.filter(f => KNOWN_BAD.has(f));
const novel = fails.filter(f => !KNOWN_BAD.has(f));

if (knownBad.length > 0) {
  console.log(`  (${knownBad.length} known-bad pinned — B-216):`);
  for (const f of knownBad) console.log(`    ${f}`);
}

if (novel.length > 0) {
  console.log(`FAIL — ${novel.length} NEW issue(s):`);
  for (const f of novel) console.log(`  ${f}`);
  process.exit(1);
} else {
  console.log(`PASS — all weapon profiles valid (${knownBad.length} known-bad pinned)`);
}
