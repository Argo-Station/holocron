#!/usr/bin/env node
/**
 * respec_overlay.cjs — STANDING guard for the reSpecialized overlay pack (F-9 Phase A, build-plan A6
 * + ruling f9-phase-a-scout-handoff R-F9-3). Mirrors validate_respec_overlay.py in the node suite so
 * the overlay's invariants ride the same guard battery as the base registries.
 *
 *   L1mod.ids     — every overlay spec id joins a base specialization
 *   L1mod.tree    — every overlay tree is 5x4 with the [5,10,15,20,25] cost ladder (eote p.102)
 *   L1mod.talents — every tree-referenced talent id resolves in base ∪ overlay; overlay talents are
 *                   respec_-prefixed, complete, _provenance 'respecialized', sources []
 *   R-F9-3        — REVERSE leak: canon carries ZERO respec_* ids and ZERO 'respecialized' provenance
 *   L1mod.careers — R-M12B-98: a careers entry the base lacks is judged by SWRPGMods.refusedCareers (the ADD verb's one
 *                   check), a refusal a NAMED red; a base-id entry carries specializations_add / _remove and, since card
 *                   f100-career-powers-data ADDENDUM 2 F2, career_powers — nothing else
 *   L1mod.annotation — ADDENDUM 2 F1/F2: a spec row of exactly {bonus_career_powers} is an ANNOTATION, not a tree; it must
 *                   name a base specialization, and the tree and manifest checks below count only the other rows
 *   L1mod.overlays — B-1394 (ADDENDUM 115): the manifest's `overlays` equals the optional overlay files on disk, both ways
 *
 * COVERAGE (B-999; ruling f100-m6-pack ADDENDUM 2 R-M6G-13.4): EVERY pack on disk — each directory under
 * public/data/mods/respecialized/ holding a manifest.json — because a sheet folds any pack it is stamped with
 * (a superseded one resolves by path). This used to read eote-v1 alone. Finding NO pack FAILS.
 * KNOWN REDS: named by (pack, subject id, check) with their board row. A known red is reported and does not
 * fail; ANY other red fails; a known red that no longer reproduces fails, so the list cannot outlive its defect.
 *
 * Run: node test/respec_overlay.cjs   (needs the emitted packs under public/data/mods/respecialized/)
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const PACKS = path.join(ROOT, 'public/data/mods/respecialized');
const Mods = require(path.join(ROOT, 'lib/shared/mods.js'));
const COSTS = [5, 10, 15, 20, 25];  // eote p.102

// (pack, subject id, check) -> the board row carrying it. aor-v1 ships and is never written in M6
// (card f100-m6-pack-card §3), so its one defect is carded, not fixed. aor-v2 carried it over (R-M6G-17.3) until
// B-1012's lap (ruling `release-r7-bug-burndown` ADDENDUM 111) wrote its `description` (empty, R-M12R-17): aor-v2's
// cypher is now held to the full-record bar like every other add, so a missing field there reds this guard. B-1012
// closed on aor-v2 (ADDENDUM 115); aor-v1 stays frozen, its line carried by B-1566 (INTERNAL).
const KNOWN_REDS = {
  'aor-v1|cypher|L1mod.add:description': 'B-1566',
};

let failures = 0;
const fail = (m) => { failures += 1; console.error('  FAIL  ' + m); };
const load = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

const packs = fs.existsSync(PACKS)
  ? fs.readdirSync(PACKS).filter((d) => fs.existsSync(path.join(PACKS, d, 'manifest.json'))).sort() : [];
if (!packs.length) { console.error('no overlay pack under ' + PACKS + ' (finding none is a FAIL, B-999)'); process.exit(1); }
const baseSpecs = load(path.join(ROOT, 'public/data/canonical/specializations.json')).specializations;
const baseTalents = load(path.join(ROOT, 'public/data/canonical/talents.json')).talents;
const known = [];
const hits = new Set();

function validatePack(name) {
  const PACK = path.join(PACKS, name);
  const reds = [];
  // A pack's red: KNOWN_REDS may carry it when it is keyed (subject id + check); any other red fails.
  const fail = (m, key) => {
    const row = key ? KNOWN_REDS[name + '|' + key] : null;
    if (row) { hits.add(name + '|' + key); known.push(`${name}: ${m} — KNOWN, carded ${row}`); return; }
    reds.push(m); failures += 1; console.error('  FAIL  ' + name + ': ' + m);
  };
  const specs = load(path.join(PACK, 'specializations.overlay.json')).specializations;
  const talents = load(path.join(PACK, 'talents.overlay.json')).talents;
  const manifest = load(path.join(PACK, 'manifest.json'));

  // L1mod.overlays — B-1394 (ruling `release-r7-bug-burndown` ADDENDUM 115): the manifest's `overlays` EQUALS the optional
  // overlay files the pack ships (lib/shared/mods.js fetchPack fetches an optional overlay only when listed). Red both ways:
  // a listed file missing (the fold would lose a section) or a shipped file unlisted (never fetched).
  const OPTIONAL_OVERLAYS = ['careers', 'force_powers', 'signature_abilities'];
  const onDisk = OPTIONAL_OVERLAYS.filter((sec) => fs.existsSync(path.join(PACK, sec + '.overlay.json')));
  if (JSON.stringify(manifest.overlays) !== JSON.stringify(onDisk))
    fail(`L1mod.overlays: manifest overlays ${JSON.stringify(manifest.overlays)} != the optional overlays on disk ${JSON.stringify(onDisk)} (B-1394)`);

  // L1mod.ids — F-9-S2 §4.1: an overlay entry is EITHER a rebuild (base record exists; may be partial,
  // because it merges onto that base) OR an ADD (no base record; merges onto {} in the resolver, so it
  // must carry the COMPLETE record shape). The v1 rule "every overlay spec has a base record" is
  // superseded, not relaxed — an add is held to a stricter bar than a rebuild.
  const baseCareers = load(path.join(ROOT, 'public/data/canonical/careers.json')).careers;
  let careersOverlay = {};
  try { careersOverlay = load(path.join(PACK, 'careers.overlay.json')).careers || {}; } catch (e) { careersOverlay = {}; }

  const ADD_REQUIRED = ['id', 'name', 'description', 'talent_tree', 'career_skills', 'universal', '_provenance'];
  // card f100-career-powers-data ADDENDUM 2 F1/F2: an ANNOTATION row (exactly {bonus_career_powers}) annotates a tree the
  // pack does not rebuild — it must name a base specialization, and it is neither an add nor a tree.
  const isAnnotation = (r) => !!r && typeof r === 'object' && Object.keys(r).length === 1 && 'bonus_career_powers' in r;
  for (const sid of Object.keys(specs).filter((x) => isAnnotation(specs[x]))) {
    if (!baseSpecs[sid]) fail(`L1mod.annotation: powers-only row '${sid}' names no base specialization — it would stand alone as a record`);
  }
  const trees = Object.fromEntries(Object.entries(specs).filter(([, r]) => !isAnnotation(r)));
  const added = Object.keys(trees).filter((sid) => !baseSpecs[sid]);
  for (const sid of added) {
    const rec = specs[sid];
    for (const f of ADD_REQUIRED) {
      if (!(f in rec)) fail(`L1mod.add: added spec '${sid}' is missing required field '${f}' (a partial add is a defect)`, `${sid}|L1mod.add:${f}`);
    }
    if (rec._provenance !== 'respecialized') fail(`L1mod.add: added spec '${sid}' must carry _provenance 'respecialized'`);
    if (sid.startsWith('respec_')) fail(`L1mod.add: added spec id '${sid}' must carry NO mod prefix (§4.4)`);
  }

  // L1mod.careers — APPEND-only, and every add must be REACHABLE from a career or it is unreachable.
  // R-M12B-98 (f100-m12-build-card ADDENDUM 30): an entry whose id the base LACKS is the careers ADD verb's (R-M12B-3), so it
  // is judged by the verb's ONE check, SWRPGMods.refusedCareers, folded over the base exactly as applyOverlay folds it: a
  // refused career is a NAMED red here, at build, never a silent drop at fold time. Its `specializations` wire its adds.
  const refused = new Map(Mods.refusedCareers({ specializations: baseSpecs, careers: baseCareers },
    { specializations: specs, talents, careers: careersOverlay }).map((r) => [r.id, r.reasons]));
  const wired = new Set();
  for (const cid of Object.keys(careersOverlay)) {
    const entry = careersOverlay[cid] || {};
    if (!baseCareers[cid]) {
      if (refused.has(cid)) fail(`L1mod.careers: added career '${cid}' is refused — ${refused.get(cid).join('; ')}`);
      (entry.specializations || []).forEach((sid) => wired.add(sid));
      continue;
    }
    // (supported-key check lives with the F-9-S2b arms below, which know about removes)
    for (const aid of entry.specializations_add || []) {
      if (!specs[aid]) fail(`L1mod.careers: career '${cid}' adds '${aid}' which the spec overlay does not define`);
      if (((baseCareers[cid] || {}).specializations || []).includes(aid)) {
        fail(`L1mod.careers: career '${cid}' 'adds' '${aid}' which is already in its base roster`);
      }
      wired.add(aid);
    }
  }
  // F-100 M12 step 12 (ADDENDUM 44): an added spec with `universal: true` is reached by the creator's universal shelf
  // (player/app.jsx T2-D: every view spec with `universal`, outside the career's roster), never by a career's roster.
  for (const sid of added) if (!wired.has(sid) && specs[sid].universal !== true) fail(`L1mod.careers: added spec '${sid}' is wired to NO career and is not universal — it would be unreachable`);

  // F-9-S2b (Amendment 1 §A1.4.2): the REMOVE arms, loud by design.
  // R-M12B-98: a base-id entry is a ROSTER edit and nothing else; any other field (which the fold ignores, R-M12B-97) is a red.
  for (const cid of Object.keys(careersOverlay)) {
    if (!baseCareers[cid]) continue;   // an ADD: refusedCareers judged it above
    const entry = careersOverlay[cid] || {};
    const baseRoster = ((baseCareers[cid] || {}).specializations) || [];
    const addIds = entry.specializations_add || [];
    const dropIds = entry.specializations_remove || [];
    const unsupported = Object.keys(entry).filter((k) => k !== 'specializations_add' && k !== 'specializations_remove' && k !== 'career_powers');
    if (unsupported.length) fail(`L1mod.careers: base career '${cid}' carries ${JSON.stringify(unsupported)} — a base-id entry may carry only specializations_add / specializations_remove / career_powers (R-M12B-98, amended by f100-career-powers-data ADDENDUM 2 F2)`);
    for (const did of dropIds) {
      if (!baseRoster.includes(did)) fail(`L1mod.remove: career '${cid}' removes '${did}' which is NOT on its base roster — a remove that hits nothing is a typo, not a no-op`);
      if (addIds.includes(did)) fail(`L1mod.remove: career '${cid}' both adds and removes '${did}'`);
      if (!baseSpecs[did]) fail(`L1mod.remove: career '${cid}' removes '${did}' which is not a real specialization`);
    }
    const resolvedRoster = baseRoster.filter((x) => !dropIds.includes(x)).concat(addIds.filter((x) => !baseRoster.includes(x)));
    if (!resolvedRoster.length) fail(`L1mod.remove: career '${cid}' resolves to an EMPTY roster — creation needs a legal pick`);
  }

  // L1mod.tree + resolution
  const resolvable = new Set([...Object.keys(baseTalents), ...Object.keys(talents)]);
  for (const [sid, s] of Object.entries(trees)) {
    const tree = s.talent_tree || [];
    if (tree.length !== 5) fail(`L1mod.tree: ${sid} has ${tree.length} rows (expect 5)`);
    tree.forEach((row, ri) => {
      const cells = row.talents || [];
      if (cells.length !== 4) fail(`L1mod.tree: ${sid} row ${ri} has ${cells.length} talents (expect 4)`);
      if (row.cost !== COSTS[ri]) fail(`L1mod.tree: ${sid} row ${ri} cost ${row.cost} != ${COSTS[ri]}`);
      cells.forEach((c) => { if (!resolvable.has(c.talent)) fail(`L1mod.talents: ${sid} row ${ri} talent '${c.talent}' unresolved`); });
    });
  }

  // L1mod.talents completeness
  const REQ = ['id', 'name', 'description', 'activation', 'ranked', '_provenance', 'sources'];
  for (const [tid, t] of Object.entries(talents)) {
    if (!tid.startsWith('respec_')) fail(`L1mod.talents: overlay talent id '${tid}' not respec_-prefixed`);
    REQ.forEach((f) => { if (!(f in t)) fail(`L1mod.talents: overlay talent ${tid} missing '${f}'`); });
    if (t._provenance !== 'respecialized') fail(`L1mod.talents: ${tid} _provenance != respecialized`);
    if (!Array.isArray(t.sources) || t.sources.length) fail(`L1mod.talents: ${tid} sources not [] (A5)`);
  }

  // L1mod.manifest
  ['mod', 'version', 'line', 'counts', 'consumption_note'].forEach((f) => { if (!(f in manifest)) fail(`L1mod.manifest: missing '${f}'`); });
  if (manifest.counts.specs !== Object.keys(trees).length) fail('L1mod.manifest: spec count mismatch (counts.specs counts the TREE rows, annotations aside)');
  if (manifest.counts.overlay_talents !== Object.keys(talents).length) fail('L1mod.manifest: talent count mismatch');
  console.log(`  ${name}: ${Object.keys(trees).length} specs (+ ${Object.keys(specs).length - Object.keys(trees).length} annotation rows), ${Object.keys(talents).length} overlay talents, ${reds.length} red`);
}

console.log(`packs validated (${packs.length}): ${packs.join(', ')}`);
packs.forEach(validatePack);
for (const k of Object.keys(KNOWN_REDS)) {
  if (!hits.has(k)) fail(`KNOWN_REDS: (${k.split('|').join(', ')}) → ${KNOWN_REDS[k]} no longer reproduces — remove it and true ${KNOWN_REDS[k]}`);
}
known.forEach((m) => console.log('  KNOWN  ' + m));

// R-F9-3 reverse leak
for (const reg of ['specializations', 'talents']) {
  const data = reg === 'specializations' ? baseSpecs : baseTalents;
  for (const [rid, r] of Object.entries(data)) {
    if (rid.startsWith('respec_')) fail(`R-F9-3: respec_* id '${rid}' leaked into canonical ${reg}`);
    if (r && r._provenance === 'respecialized') fail(`R-F9-3: 'respecialized' provenance leaked into canonical ${reg} (${rid})`);
  }
}

if (failures) { console.error(`\nrespec_overlay guard: ${failures} FAIL`); process.exit(1); }
console.log(`respec overlay guard: ALL PASS (${packs.length} packs, 0 canon leak, ${known.length} known red carded)`);
