/**
 * ogg_import_ownership.cjs — B-225: the import learns the difference between a CATALOG ECHO and a
 * PURCHASE. Ruling `b225-import-ownership` §3.2 (namespace C-IPF-*).
 *
 * THE DEFECT. OggDude enumerates the whole Force-power catalog and every cell of a character's
 * talent trees, marking only the bought ones. The importer ignored the marker, so a player got the
 * base of nearly every Force power in the game and a 410 XP overdraft (field report, Vince).
 *
 * THE RULE. A `force_powers` record is emitted iff ANY of its ability nodes is purchased; a
 * `talents` record is emitted iff its OWN cell is purchased. Enumerated-but-unpurchased nodes are
 * catalog echoes and never become manifest records — the receipt discloses the split instead
 * (R-OGG1-3: nothing silently dropped, satisfied by disclosure rather than by importing junk).
 *
 * THE SHAPE, measured not assumed (the #64/#65/#66 lesson — an input's shape is part of the claim).
 * Censused across all six shipped saves plus the B-225 repro file: every file's "<Purchased>
 * present" count EQUALS its "true" count, i.e. OggDude OMITS the element when false. So the
 * unpurchased shape the parser actually meets is ABSENCE. The fixture carries absence AND the
 * explicit `false` spelling, so neither is guarded by luck.
 */
const fs = require('fs');
const path = require('path');
const OGG = require('../lib/shared/oggImport.js');

const FIX = path.join(__dirname, 'fixtures', 'oggdude_saves', 'G_SYNTH_ownership.xml');
const parsed = OGG.parseOggCharacter(fs.readFileSync(FIX, 'utf8'));
const manifest = OGG.recordManifest(parsed);
const keysOf = (type) => manifest.filter((r) => r.type === type).map((r) => r.key).sort();

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '\n          ' + detail : '')); }
}

console.log('ogg_import_ownership — B-225: a catalog echo is not a purchase');

// ── 1. PARSE: the ownership marker must survive into the parse output ────────────────────────
const tal = parsed.specializations[0].talents;
check('CharTalent parse carries `purchased` (it was dropped before the manifest)',
  tal.every((t) => 'purchased' in t), JSON.stringify(tal));
check('the purchased talent cells parse as purchased',
  tal.filter((t) => t.purchased).map((t) => t.key).join(',') === 'FULLTH,SKJOCK',
  JSON.stringify(tal.map((t) => [t.key, t.purchased])));
check('an ABSENT <Purchased> parses as not-purchased (the real-file shape)',
  tal.find((t) => t.key === 'GALMAP') && tal.find((t) => t.key === 'GALMAP').purchased === false);
check('an explicit <Purchased>false</Purchased> parses as not-purchased',
  tal.find((t) => t.key === 'LETSRIDE') && tal.find((t) => t.key === 'LETSRIDE').purchased === false);

// ── 2. MANIFEST: talents — a cell is owned iff ITS OWN cell is purchased ─────────────────────
check('only PURCHASED talent cells reach the manifest',
  keysOf('talents').join(',') === 'FULLTH,SKJOCK',
  'got ' + JSON.stringify(keysOf('talents')) + ' — the tree grid is a catalog echo, not ownership');

// ── 3. MANIFEST: powers — a power is owned iff ANY ability node is purchased ─────────────────
check('a power with purchased abilities reaches the manifest',
  keysOf('force_powers').indexOf('INFLUENCE') >= 0, JSON.stringify(keysOf('force_powers')));
check('a merely-ENUMERATED power never reaches the manifest (MOVE, no marker anywhere)',
  keysOf('force_powers').indexOf('MOVE') < 0,
  'got ' + JSON.stringify(keysOf('force_powers')) + ' — this is the 20-powers-for-free defect');
check('an explicitly-unpurchased power never reaches the manifest (SENSE)',
  keysOf('force_powers').indexOf('SENSE') < 0, JSON.stringify(keysOf('force_powers')));
check('exactly ONE power is owned in this fixture',
  keysOf('force_powers').length === 1, JSON.stringify(keysOf('force_powers')));

// ── 4. RECEIPT: the split is DISCLOSED, so nothing is silently dropped (R-OGG1-3) ────────────
const report = OGG.buildReport({ matched: [], adapted: [], absent: [] }, parsed);
check('the receipt states the force-power enumerated/owned split',
  report.ownership && report.ownership.force_powers &&
  report.ownership.force_powers.listed === 3 && report.ownership.force_powers.owned === 1,
  JSON.stringify(report.ownership));
check('the receipt states the talent enumerated/owned split',
  report.ownership && report.ownership.talents &&
  report.ownership.talents.listed === 4 && report.ownership.talents.owned === 2,
  JSON.stringify(report.ownership));

// ── 5. C-OGG1-3's forceUpgrades note keeps working over OWNED powers (verify, don't assume) ──
// RE-POINTED (F-100 M10, ruling f100-m10-shapes-card R-M10S-10: `count` = the upgrades CARRIED, plus the REFUSED list).
// KEPT: exactly the one purchased non-base cell of the one OWNED power reaches the receipt (carried + refused = 1; the
// unowned powers' cells never do). MOVED: "counts" → carried + refused — with no resolver report the power is not
// resolved, so its cell is refused by name. DROPPED: nothing. The synthetic key INFLUENCESTR is not an ability of our
// Influence (its key is influencestrength), so even resolved it is REFUSED, never invented — the second leg.
check('forceUpgrades still counts purchased non-base cells, and only in owned powers',
  report.forceUpgrades && report.forceUpgrades.count + report.forceUpgrades.refused.length === 1
  && report.forceUpgrades.refused[0] === 'INFLUENCE/INFLUENCESTR',
  JSON.stringify(report.forceUpgrades) + ' — INFLUENCESTR is the one purchased upgrade');
{
  const influence = Object.values(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public/data/canonical/force_powers.json'), 'utf8')).force_powers)
    .find((p) => p._source_key === 'INFLUENCE');
  const resolved = OGG.buildReport({ matched: [{ rec: { type: 'force_powers', key: 'INFLUENCE' }, record: influence }], adapted: [], absent: [] }, parsed);
  check('R-M10S-10: resolved, the synthetic INFLUENCESTR (not a key of our Influence) is REFUSED by name, 0 carried',
    resolved.forceUpgrades && resolved.forceUpgrades.count === 0 && JSON.stringify(resolved.forceUpgrades.refused) === '["INFLUENCE/INFLUENCESTR"]',
    JSON.stringify(resolved.forceUpgrades));
}

console.log('\nogg_import_ownership: ' + pass + '/' + (pass + fail) + ' PASS');
process.exit(fail ? 1 : 0);
