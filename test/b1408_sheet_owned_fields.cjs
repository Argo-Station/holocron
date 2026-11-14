#!/usr/bin/env node
/**
 * b1408_sheet_owned_fields.cjs — B-1408: the census of the keys the sheet's writers write.
 *
 *   G2  THE WRITER CENSUS AS A GUARD (brief `b1408-reentry-fields` (2)): every top-level key the sheet's writers write
 *       is in SHEET_OWNED, BUILD_OWNED or RELATION below. Literal patches are SCANNED out of player/app.jsx;
 *       the writers that build their patch elsewhere are a NAMED table, each entry pinned by a read of its builder
 *       (R-M13B-8: attachPlan → PD.projectedFields). Every non-literal `onSheetChange(` site is named, so a new one is
 *       unclassified until it is.
 *
 * BITES (PRAXIS §6, read by EXIT CODE and the failing check's name): B1408_APP / B1408_CR point the guard at a mutant
 * COPY of player/app.jsx / lib/shared/charResolve.js, so a bite never writes the tree.
 *
 * Run: node test/b1408_sheet_owned_fields.cjs
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const APP = process.env.B1408_APP || path.join(root, 'player/app.jsx');
const CRJS = process.env.B1408_CR || path.join(root, 'lib/shared/charResolve.js');
let failures = 0;
function check(label, cond, detail) {
  if (cond) console.log('  PASS  ' + label);
  else { failures += 1; console.error('  FAIL  ' + label + (detail !== undefined ? '  — ' + JSON.stringify(detail).slice(0, 500) : '')); }
}

const crSrc = fs.readFileSync(CRJS, 'utf8');
const app = fs.readFileSync(APP, 'utf8');
// the roster's writers (the store's equipment write, the R-B250 XP repair) live in lib/shared/roster.js since the
// verbatim lift (ruling `shipyard-cargo-build-gm-seam-census` R-SCGS-1, 57ff5dbf5); re-pointed by R-SCG1-6.
const rosterSrc = fs.readFileSync(path.join(root, 'lib/shared/roster.js'), 'utf8');
const packSrc = fs.readFileSync(path.join(root, 'lib/shared/packAttach.js'), 'utf8');
const projSrc = fs.readFileSync(path.join(root, 'lib/shared/projectionDiff.js'), 'utf8');
const vesselSrc = fs.readFileSync(path.join(root, 'lib/shared/vesselResolve.js'), 'utf8');
const oggImportSrc = fs.readFileSync(path.join(root, 'lib/shared/oggImport.js'), 'utf8');
// R6 lane C (card `release-r6-backend` §5): the Rewards and contact-network writers, in their shared store
const rewardsSrc = fs.readFileSync(process.env.B1408_REWARDS || path.join(root, 'lib/shared/rewardsStore.js'), 'utf8');

// ── The three classes (ADDENDUM 3 R-1). SHEET_OWNED: only the sheet's own writers write it. BUILD_OWNED: the creator
// writes it, carries it, or re-derives it. RELATION: a pointer to another record.
const SHEET_OWNED = ['notes', 'journal', 'playerName', 'appearance', 'currentWounds', 'currentStrain', 'criticalInjuries',
  'crafts', 'craft_notes', 'craft_schematics', 'fortifications', 'companions', 'rewards', 'contacts'];
const BUILD_OWNED = ['name', 'motivations', 'backstory', 'xp', 'skills', 'talents', 'specializations', 'forcePowers',
  'forceRatingBase', 'characteristics', 'characteristicsAtCreation', 'derivedBonuses', 'derivedConditional',
  'talentCharacteristicChoices', 'talentSkillChoices', 'talentChoices', 'treelessTalents', 'signatureAbilities', 'mods',
  'rules_seen', 'speciesOptionPicks', 'speciesOption', 'speciesGrantApplied', 'speciesId', 'careerId',
  'specializationIds', 'duty', 'morality', 'obligation', 'equipment', 'portrait', '_xpRepairedAt'];
const RELATION = {
  myShipId: 'a pointer to a vessel record (the Yard\'s, lib/shared/vesselResolve.js markMyShip) (ADDENDUM 3 R-1)',
};

// ── G2 — the scanner ─────────────────────────────────────────────────────────────────────────────────────────────
function inComment(src, i) {
  const ls = src.lastIndexOf('\n', i);
  if (src.slice(ls + 1, i).includes('//')) return true;
  // A block comment opens at a `/*` not glued to a word — `accept="image/*"` is a string, not a comment.
  let o = src.lastIndexOf('/*', i);
  while (o > 0 && /[A-Za-z0-9]/.test(src[o - 1])) o = src.lastIndexOf('/*', o - 1);
  return o >= 0 && o > src.lastIndexOf('*/', i);
}
// The depth-1 keys of the object literal whose `{` is at `i` (strings skipped; `k:` and shorthand `k`).
function literalKeys(src, i) {
  const keys = []; let d = 0, tok = '', q = null;
  const take = () => { const s = tok.match(/^\s*([A-Za-z_$][\w$]*)\s*$/); if (s) keys.push(s[1]); tok = ''; };
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (q) { if (c === '\\') { j++; continue; } if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if ('{[('.includes(c)) { d++; if (d === 1) tok = ''; continue; }
    if ('}])'.includes(c)) { if (d === 1) take(); d--; if (d === 0) break; continue; }
    if (d !== 1) continue;
    if (c === ',') { take(); continue; }
    if (c === ':') { const m = tok.match(/^\s*([A-Za-z_$][\w$]*)\s*$/); if (m) keys.push(m[1]); tok = '\u0000'; continue; }
    tok += c;
  }
  return keys;
}
const written = {};   // key -> [site, …]
function note(k, site) { (written[k] = written[k] || []).push(site); }
const lineOf = (src, i) => src.slice(0, i).split('\n').length;
// (a) a literal handed to the sheet's writer or one of its wrappers (`patch(u)`, CraftWorkshop's `save(patch)`).
for (const m of app.matchAll(/\b(onSheetChange|patch|save)\(\s*(?:Object\.assign\(\s*)?\{/g)) {
  if (inComment(app, m.index)) continue;
  literalKeys(app, m.index + m[0].length - 1).forEach((k) => note(k, m[1] + ':' + lineOf(app, m.index)));
}
// (b) a patch assembled in a `var patch = { … }` then `patch.k = …` (buyTalent, buyNewSpec, CraftWorkshop's finish).
for (const m of app.matchAll(/var patch = \{/g)) {
  const i = m.index + m[0].length - 1;
  literalKeys(app, i).forEach((k) => note(k, 'var patch:' + lineOf(app, m.index)));
  const end = app.slice(i).search(/(?:onSheetChange|save)\(patch\)/);
  const body = end >= 0 ? app.slice(i, i + end) : '';
  for (const a of body.matchAll(/\bpatch\.([A-Za-z_$][\w$]*)\s*=/g)) note(a[1], 'patch.' + a[1] + ':' + lineOf(app, i));
}
// (c) the writers that build their patch elsewhere — each NAMED and PINNED by a read of its builder.
function bodyOf(src, name) {
  const m = src.match(new RegExp('function\\s+' + name.replace(/\$/g, '\\$') + '\\s*\\('));
  if (!m) return null;
  const i = src.indexOf('{', m.index); let d = 0;
  for (let j = i; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (d === 0) return src.slice(i, j + 1); } }
  return null;
}
const has = (body, k) => !!body && new RegExp('\\b' + k + '\\b').test(body);
const BUILDERS = [
  { site: 'SpeciesAskSurface → CR.speciesAskPatch', src: crSrc, fn: 'speciesAskPatch', keys: ['speciesOptionPicks', 'speciesOption', 'skills', 'speciesGrantApplied'] },
  { site: 'SpeciesFlipNotice → CR.speciesFlipSeenPatch', src: crSrc, fn: 'speciesFlipSeenPatch', keys: ['rules_seen'] },
  // `f100-surfacing-engine-flip-card` ADDENDUM 12 (§2.2 of its brief): the engine switch's one-time line, its own stamp key
  { site: 'EngineFlipNotice → CR.engineFlipSeenPatch', src: crSrc, fn: 'engineFlipSeenPatch', keys: ['rules_seen'] },
  // `f100-surfacing-force-flip-card` ADDENDUM 12 (§2.2 of its brief): the Force switch's one-time line, its own stamp key (THIS LAP'S)
  { site: 'ForceFlipNotice → CR.forceFlipSeenPatch', src: crSrc, fn: 'forceFlipSeenPatch', keys: ['rules_seen'] },
  // Re-pointed by `f100-m13-build-card` R-M13B-8 (R-M13L-19's shared step). KEEPS: the promise that these keys are written. DROPS: the literal text inside attachPlan.
  { site: 'HomebrewLines → PA.patchFor / PA.restore (attachPlan)', src: packSrc, fn: 'attachPlan', re: /if \(d\.stale\) Object\.assign\(patch, PD\.projectedFields\(d\)\);/, keys: ['mods'] },
  { site: 'attachPlan → PD.projectedFields', src: projSrc, fn: 'projectedFields', keys: ['talents', 'derivedBonuses', 'derivedConditional'] },
  { site: 'SheetAdvancement pickWrite (w8)', src: crSrc, fn: 'pickWrite', keys: ['talentChoices', 'treelessTalents'] },
  { site: 'SheetAdvancement pickWrite item arm (w8)', src: crSrc, fn: '_itemMarkWrite', keys: ['equipment'] },
  { site: 'SheetAdvancement _dismissXpRepaired', src: app, fn: null, re: /_dismissXpRepaired[\s\S]{0,400}?delete next\._xpRepairedAt/, keys: ['_xpRepairedAt'] },
  { site: 'SheetPack counts (credits, functional form)', src: app, fn: null, re: /p\.onSheetChange\(function \(prev\) \{ var pe = \(prev && prev\.equipment\)[^\n]*\{ equipment:/, keys: ['equipment'] },
  { site: 'SheetVesselsS4 → R.markMyShip', src: vesselSrc, fn: 'markMyShip', keys: ['myShipId'] },
  // R6 lane C (card `release-r6-backend` §5, R-R4S-1): the one writer of each array, a patch with the one XP ledger's `xp`
  { site: 'SWRPGRewards.buyRewardTier', src: rewardsSrc, fn: 'buyRewardTier', keys: ['rewards', 'xp'] },
  { site: 'SWRPGRewards.buyContact', src: rewardsSrc, fn: 'buyContact', keys: ['contacts', 'xp'] },
  // ruling `release-r6-ui-battery-reds` §1: R6's face calls five more writers (NON_LITERAL below). Each one's keys are
  // read from its body's `patch: {…}` literals (patchKeys), so a key a writer adds and the pin does not name is a red.
  { site: 'SWRPGRewards.buyBattleScar', src: rewardsSrc, fn: 'buyBattleScar', keys: ['rewards', 'xp'], patchKeys: true },
  { site: 'SWRPGRewards.giveReward', src: rewardsSrc, fn: 'giveReward', keys: ['rewards'], patchKeys: true },
  { site: 'SWRPGRewards.setReputation', src: rewardsSrc, fn: 'setReputation', keys: ['rewards'], patchKeys: true },
  { site: 'SWRPGRewards.raiseContact', src: rewardsSrc, fn: 'raiseContact', keys: ['contacts', 'xp'], patchKeys: true },
  { site: 'SWRPGRewards.giveContact', src: rewardsSrc, fn: 'giveContact', keys: ['contacts'], patchKeys: true },
  // B-1533 (`release-r7-bug-burndown` ADDENDA 460, 461): RowRemove's two verbs. removeReward's third key is the scar's stored pick,
  // written only when a pick is cleared, and is pickWrite's own key.
  { site: 'SWRPGRewards.removeReward', src: rewardsSrc, fn: 'removeReward', keys: ['rewards', 'xp', 'talentChoices'], patchKeys: true },
  { site: 'SWRPGRewards.removeContact', src: rewardsSrc, fn: 'removeContact', keys: ['contacts', 'xp'], patchKeys: true },
  // the sheet's writers outside onSheetChange (census (2)): the store, the load-time repair, the roster migration
  // re-pointed by ruling `shipyard-cargo-build-gate1` R-SCG1-6 (the R-SCGS-1 lift moved both writers whole into
  // roster.js): the store row reads the patch in SWRPGRoster.writeEquipment AND, in the same check, that the purchase
  // (`handleStoreFinalize`, player/app.jsx) goes through it; the XP row reads roster.js's loadSavedCharacters.
  { site: 'handleStoreFinalize → SWRPGRoster.writeEquipment', src: rosterSrc, fn: 'writeEquipment', re: /\{ equipment: nextEquipment \}/, keys: ['equipment'],
    calls: { src: app, re: /handleStoreFinalize = useCallback\(function[\s\S]{0,400}?window\.SWRPGRoster\.writeEquipment\(charId, nextEquipment\)/ } },
  // E6 plumbing (ruling `encounters-e6-plumbing` ADDENDUM 1, P4.1): a campaign's ADD — the XP award, writeEquipment's idiom.
  { site: 'SWRPGRoster.addXp', src: rosterSrc, fn: 'addXp', re: /\{ xp: nextXp \}/, keys: ['xp'] },
  { site: 'loadSavedCharacters XP repair (R-B250)', src: rosterSrc, fn: 'loadSavedCharacters', keys: ['xp', '_xpRepairedAt'] },
  // ruling `release-r6-companions-npcs` RR-3: `companions`' first writer, the OggDude import's settle step, called by the
  // import room on the sheet normalizeCreated made (the settleSchematics pattern)
  { site: 'ImportRoom handleText → OGG.settleCompanions', src: oggImportSrc, fn: 'settleCompanions', keys: ['companions'],
    calls: { src: app, re: /OGG\.settleCompanions\(out, sheet\)/ } },
  { site: 'roster migration → CR.migrateSheet', src: crSrc, fn: 'migrateSheet', keys: ['talents', 'forcePowers', 'careerId', 'speciesId', 'specializationIds'] },
];
BUILDERS.forEach((b) => {
  const fnBody = b.fn ? bodyOf(b.src, b.fn) : null;
  const body = b.fn ? (fnBody && (!b.re || b.re.test(fnBody)) ? fnBody : null) : ((b.src.match(b.re) || [])[0] || null);
  const missing = b.keys.filter((k) => !has(body, k));
  const called = !b.calls || b.calls.re.test(b.calls.src);
  const read = b.patchKeys && body ? [...body.matchAll(/\bpatch:\s*\{/g)].flatMap((m) => literalKeys(body, m.index + m[0].length - 1)) : [];
  const extra = [...new Set(read.filter((k) => !b.keys.includes(k)))];
  check('G2 pin: ' + b.site + ' writes ' + b.keys.join(', '), body && missing.length === 0 && called && extra.length === 0
    && (!b.patchKeys || read.length > 0), b.calls ? { missing, found: !!body, called } : { missing, extra, found: !!body });
  b.keys.concat(extra).forEach((k) => note(k, b.site));
});
// SheetProfile's track writers (`mechPatch`, `patchEntries`) write `sheet[t.key]` — the keys are mechTracks' own.
const tracks = [...app.matchAll(/mechTracks\.push\(\{ key: '([A-Za-z_]+)'/g)].map((m) => m[1]);
check('G2 pin: SheetProfile mechPatch / patchEntries write the mechTracks keys duty, morality, obligation',
  ['duty', 'morality', 'obligation'].every((k) => tracks.includes(k)) && tracks.every((k) => ['duty', 'morality', 'obligation'].includes(k)), tracks);
tracks.forEach((k) => note(k, 'mechTracks'));

// Lap C: the scanner names a site by the nearest function above it. SheetPack's new openPackForm now sits above the `counts` site, so it reads that name; the site and its row are unchanged.
// Every NON-literal `onSheetChange(` site is one the table above (or a wrapper the scanner reads) accounts for.
// + R6's seven, ruling `release-r6-ui-battery-reds` §1 (17 → 24): GrowthContacts `raise` (raiseContact), ContactNetworkBuy
// `buy` (buyContact), ContactGiveForm `add` (giveContact), RewardBuyForm `buy` (buyRewardTier), RewardScarRow `buy`
// (buyBattleScar), RewardGiveForm `add` (giveReward), HonourRepStep `set` (setReputation) — each an SWRPGRewards patch.
// + B-1533's one (24 → 25): RowRemove `remove` (removeReward / removeContact).
const NON_LITERAL = ['paperAnswerable', 'commit', 'listRows', 'patch', 'save', 'mechPatch', 'patchEntries',
  '_dismissXpRepaired', 'buyTalent', 'buyNewSpec', '_makeTree', 'patch', 'patch', 'openPackForm', 'SpeciesFlipNotice', 'EngineFlipNotice', 'ForceFlipNotice',
  'raise', 'buy', 'add', 'buy', 'buy', 'add', 'set', 'remove'];
const nonLiteral = [];
for (const m of app.matchAll(/onSheetChange\(/g)) {
  if (inComment(app, m.index) || /^\s*\{/.test(app.slice(m.index + 14, m.index + 40))) continue;
  const before = app.slice(0, m.index);
  const fn = [...before.matchAll(/(?:function\s+([A-Za-z_$][\w$]*)\s*\(|(?:var|const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:function|useCallback))/g)].pop();
  nonLiteral.push(fn ? (fn[1] || fn[2]) : '?');
}
check('G2 every non-literal onSheetChange( site is a named writer (' + NON_LITERAL.length + ')',
  JSON.stringify(nonLiteral.slice().sort()) === JSON.stringify(NON_LITERAL.slice().sort()), { found: nonLiteral });

const allKeys = Object.keys(written);
const unclassified = allKeys.filter((k) => !SHEET_OWNED.includes(k) && !BUILD_OWNED.includes(k) && !(k in RELATION));
// The positive control (R-CPR-39): the scanner finds every key of the census it was founded on — brief (2)'s 42,
// which are exactly the three classes — so a writer the scanner went blind to reads red here, not silent.
const classified = SHEET_OWNED.concat(BUILD_OWNED, Object.keys(RELATION));
const unseen = classified.filter((k) => !written[k]);
check('G2 the scanner reads all ' + classified.length + ' keys of brief (2)\'s census (each class entry has a writer)',
  // re-pointed 42 → 43 by `release-r5-crafting-sm-card` ADDENDUM 4 (Q3, ruling-moved): craft_schematics joined the list (C2 as
  // amended by ADDENDUM 3); KEPT the logic and the positive control. Re-pointed 43 → 44 by ruling `release-r5-crafting-fib-c0`
  // Q3 ('fortifications' joins the list, in the commit with its writer, finish()); KEPT the same; ADDED its name.
  // Re-pointed 44 → 45 by ruling `release-r6-companions-npcs` RR-3 ('companions' joins in the commit with its writer, the
  // import's settleCompanions); KEPT the logic and the positive control; ADDED its name
  // Re-pointed 44 → 46 by card `release-r6-backend` R-R6B-1 (lane C, ruling-moved): `rewards` and `contacts` joined the list
  // with their writer (lib/shared/rewardsStore.js, pinned in BUILDERS); KEPT the logic and the positive control; ADDED both names
  // Re-pointed → 47 at the merge of commercial into lap/release-r6-companions: the two lanes' names together (45 + 46 − 44)
  classified.length === 47 && classified.includes('craft_schematics') && classified.includes('fortifications') && classified.includes('companions')
    && classified.includes('rewards') && classified.includes('contacts') && unseen.length === 0, { count: classified.length, unseen });
check('G2 every key a sheet writer writes is SHEET-OWNED, BUILD-OWNED or a RELATION', unclassified.length === 0,
  unclassified.map((k) => ({ key: k, at: written[k] })));

if (failures) { console.error('\n' + failures + ' FAILED'); process.exit(1); }
console.log('\nall passed');
