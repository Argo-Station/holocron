// B-1541 — the landing's NPC door never prints a raw affiliation id ("Rival · sapient_natives").
// An NPC without a description carries its tier and affiliation in `rollcall.json`; the affiliation
// must be the affiliations vocabulary's LABEL, joined at the generator (scripts/canonical/build_rollcall.py
// `_npc_desc`). Reads the SERVED file and the vocabulary; ruling `release-r7-bug-burndown` ADDENDUM 46.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const canon = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', f), 'utf8'));

const vocab = canon('affiliations.vocab.json').entries;
const ids = new Set(vocab.map((e) => e.id));
const roll = canon('rollcall.json');

let fail = 0, checked = 0;
for (const e of roll.doors.npcs) {
  for (const part of String(e.description || '').split(' · ')) {
    checked++;
    if (ids.has(part.trim())) { fail++; console.log(`  ✗ B-1541 ${e.id}: "${e.description}" prints the raw id "${part.trim()}"`); }
  }
}
// The generator's own fallback, over the WHOLE population (not only the 24 sampled): every
// description-less NPC's affiliation must resolve to a label.
const npcs = canon('npcs.json').npcs;
const label = Object.fromEntries(vocab.map((e) => [e.id, e.label]));
let bare = 0;
for (const [k, v] of Object.entries(npcs)) {
  if ((v.description || '').trim() || !v.affiliation) continue;
  if (!label[v.affiliation]) { bare++; console.log(`  ✗ B-1541 ${k}: affiliation "${v.affiliation}" has no vocabulary label`); }
}
if (fail || bare) { console.log(`✗ B-1541: ${fail} raw id(s) on the NPC door, ${bare} unlabelled affiliation(s)`); process.exit(1); }
console.log(`✓ B-1541: ${roll.doors.npcs.length} NPC door entries, ${checked} parts, no raw affiliation id`);
