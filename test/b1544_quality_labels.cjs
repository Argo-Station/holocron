// B-1544 — a weapon quality an attachment adds or removes prints the qualities vocabulary's LABEL
// ("Auto-fire", "Inaccurate 2"), never its key ("auto_fire", "inaccurate 2"). The three sites that printed
// `q.key` (LoadoutItemDetail's baseMods; GearModifyStage `effectParts`' added and "Removes" lines) read the
// one label source, ItemResolve.qualityLabelsOf. Ruling `release-r7-bug-burndown` ADDENDUM 46.
//   1. SOURCE: no site in player/app.jsx prints an attachment's quality key bare.
//   2. DATA: every key the attachments registry adds or removes HAS a vocabulary label, and
//      qualityLabelsOf over the host's db shape (keyed by label and alias, lower-cased) yields it.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let fail = 0;
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };

const src = fs.readFileSync(path.join(ROOT, 'player/app.jsx'), 'utf8');
const bare = [
  [/\(q\.key \|\| 'Quality'\)/g, "(q.key || 'Quality') — a key printed with no label lookup"],
  [/'Removes ' \+ key\b/g, "'Removes ' + key — a removed quality's key printed bare"],
];
for (const [re, what] of bare) {
  const n = (src.match(re) || []).length;
  ok(n === 0, `B-1544 player/app.jsx: ${n} site(s) print ${what}`);
}
// each of the three sites reads the label map
for (const [name, re] of [
  ['LoadoutItemDetail baseMods', /baseMods\.push\(\(qLab\[q\.key\] \|\| q\.key/],
  ['effectParts added', /push\(\(qLab\[q\.key\] \|\| q\.key \|\| 'Quality'\)/],
  ['effectParts Removes', /'Removes ' \+ \(qLab\[key\] \|\| key\)/],
]) ok(re.test(src), `B-1544 ${name} reads the vocabulary label`);

const vocab = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical/qualities.vocab.json'), 'utf8')).entries;
const atts = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical/attachments.json'), 'utf8'));
const reg = atts.attachments || atts;
// the host's db shape (player/app.jsx loader): entries keyed by label and alias, lower-cased
const db = {};
vocab.forEach((q) => { [q.label, ...(q.aliases || [])].forEach((a) => { db[String(a).toLowerCase()] = q; }); });
global.window = global.window || {};
require(path.join(ROOT, 'lib/shared/itemResolve.js'));
const IR = global.window.ItemResolve || require(path.join(ROOT, 'lib/shared/itemResolve.js'));
const labels = IR.qualityLabelsOf(db);
const keys = new Set();
for (const v of Object.values(reg)) {
  if (!v || typeof v !== 'object') continue;
  (v.qualities_add || []).forEach((q) => q && q.key && keys.add(q.key));
  (v.qualities_remove || []).forEach((q) => keys.add((q && q.key) || q));
}
const missing = [...keys].filter((k) => !labels[k] || labels[k] === k);
ok(keys.size > 0 && missing.length === 0, `B-1544 ${keys.size} attachment quality keys each resolve to a label${missing.length ? ' — missing: ' + missing.join(', ') : ''}`);
ok(labels.auto_fire === 'Auto-fire', `B-1544 auto_fire → "${labels.auto_fire}"`);

if (fail) { console.log(`✗ B-1544: ${fail} failing`); process.exit(1); }
console.log('✓ B-1544: attachment qualities print their vocabulary labels');
