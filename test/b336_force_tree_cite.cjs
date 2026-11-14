// B-336 (consumer half, force_powers) — a Force tree cell's source cite prints book TITLES, never the vocabulary
// keys `force_powers.json` already holds ("fad · Rise of the Separatists" printed "fad" raw). lib/shared/treeView.jsx
// maps the power's sources through gameLineTitle, the shared resolver its talent cell already uses.
// Ruling `release-r7-bug-burndown` ADDENDUM 46.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let fail = 0;
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };
const src = fs.readFileSync(path.join(ROOT, 'lib/shared/treeView.jsx'), 'utf8');
const cites = src.split('\n').filter((l) => /^\s*sourceCite:\s*\(/.test(l));
ok(cites.length >= 2, `B-336 found ${cites.length} sourceCite builders in treeView.jsx`);
cites.forEach((l) => ok(/\.map\(gameLineTitle\)/.test(l), `B-336 resolves through gameLineTitle: ${l.trim().slice(0, 90)}`));
// the data half: the population this consumer reads holds keys today, so the raw print was live
const fp = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical/force_powers.json'), 'utf8'));
const recs = Object.values(fp.force_powers || fp);
const vocab = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical/books.vocab.json'), 'utf8')).entries;
const ids = new Set(vocab.map((e) => e.id));
const keyed = recs.filter((r) => (r.sources || []).some((s) => ids.has(s))).length;
ok(keyed > 0, `B-336 ${keyed} of ${recs.length} force powers carry a vocabulary key (the consumer must resolve it)`);
if (fail) { console.log(`✗ B-336 force tree cite: ${fail} failing`); process.exit(1); }
console.log('✓ B-336: the Force tree cell cite resolves its books');
