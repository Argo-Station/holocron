/* site-stripes-adoption — THE 27 APPROVED LISTS CARRY THE ONE STRIPE, AND ONLY THEM (ruling `site-stripes-adoption-card` R-SAP-1..5, -11; D-463).
 *
 * The measure of the paint is `scripts/site_stripes_pictures.py --real` (a real browser, every census site). This guard pins the SOURCE:
 *   1. SYMBOLS: each top-level symbol holds exactly its count of `.hp-bands`, so a site that loses the class reds by name;
 *   2. OUT: surface 10's four sites, surface 27 and the two FLAGGED sites hold none (R-SAP-1, §6);
 *   3. PINNED: the eight sites `--real` can't reach, each by the exact text that gives it the class;
 *   4. PLACE: `.hp-bands`, `.hp-bands2` and `--doc-row-band` stand only where R-SST-1, R-SST-2 and R-SAP-4 put them, with no `!important` on a stripe;
 *   5. REST: the rows whose resting ground stepped aside (R-SAP-5, R-SAP-11) have no resting `background` outside `:where()`;
 *   6. STATE: no resting state rule on an adopted row class reads transparent (R-SAP-13).
 * A new adopted list changes table 1 on purpose. BITES are in the gate `site-stripes-adoption`.
 *   ruling `encounters-e3-screens` ADDENDUM 10 @ `ac4238934`: view.jsx gains EncList: 1 (the switch-on ENCOUNTERS list; F2 paints the
 *   live .nl-grow rows, so the stripe is drawn).
 * Run: node test/site_stripes_adoption.cjs
 */
const fs = require('fs'), path = require('path');
const ROOT = path.dirname(__dirname);
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
let fails = 0, passes = 0;
const check = (ok, label, detail) => { if (ok) { passes++; console.log('  ok   ' + label); } else { fails++; console.log('  FAIL ' + label + (detail === undefined ? '' : ' — ' + detail)); } };

// the same top-level reading in every file: player and GM declare at column 0, the IIFE'd modules at 2
// lib/shared/diceHub.jsx (D-507): DiceHub's closure, moved VERBATIM, keeps column 0 inside the module's IIFE
const INDENT = { 'player/app.jsx': 0, 'lib/shared/diceHub.jsx': 0, 'gm/app.jsx': 0, 'lib/library/npc/view.jsx': 0, 'lib/shared/ui.jsx': 2, 'lib/store/view.jsx': 2, 'lib/shared/vesselView.jsx': 2, 'lib/editor/view.jsx': 2, 'lib/shared/diceRoll.jsx': 2 };
function counts(file) {
  const re = new RegExp('^ {0,' + INDENT[file] + '}(?:export\\s+)?(?:async\\s+)?function\\s+([\\w$]+)');
  let cur = '(top)'; const c = {}, spans = {};
  read(file).split('\n').forEach((l) => {
    const m = re.exec(l); if (m) { cur = m[1]; spans[cur] = spans[cur] || []; }
    if (spans[cur]) spans[cur].push(l);
    const n = (l.match(/hp-bands(?![\w-])/g) || []).length; if (n) c[cur] = (c[cur] || 0) + n;
  });
  return { c, spans };
}

// 1. SYMBOLS
const SYMBOLS = {
  // D-507 (handoff `encounters-e3-dicehub-move`): DiceHub and DiceReferenceBody moved VERBATIM to lib/shared/diceHub.jsx — the same counts, there
  "lib/shared/diceHub.jsx": { DiceHub: 3, DiceReferenceBody: 1 },
  "player/app.jsx": { FCBrowseSheet: 5, FCCharSheet: 2, FCCharSheetPhone: 1, FCForceSheet: 2, FCForceSheetPhone: 2, FCGearSheet: 1, FCGearSheetPhone: 1, FCMechanicSheet: 5, FCMechanicSheetPhone: 1, FCMotivationSheet: 7, FCRaiseLedger: 1, FCSkillsSheet: 8, FCSpecSheetPhone: 2, FCSpeciesListPhone: 1, FCTalentsSheet: 4, FCbChangesTable: 1, FCbSoFarTable: 1, ForcePowerBuyList: 1, GBLoadoutStep: 1, GBReviewStep: 2, GearModifyStage: 3, GrowthContacts: 1, ImportOgg: 3, JournalLog: 1, LandingPaper: 1, LoadoutItemDetail: 1, QSOpenedCard: 2, SheetAdvancement: 2, SheetCrits: 1, SheetFollowers: 1, SheetHonours: 1, SheetStack: 9, SheetStage: 1, fcGearKitPlate: 1, fcMechPhoneUnit: 1, fcPhoneOptionGroup: 1, fcReadSkills: 1, fcReviewCreditsPlate: 1, fcReviewGearPlate: 1, fcReviewSkillsPlate: 1, fcReviewSoFarPlate: 1, fcReviewThresholdsPlate: 1, fcReviewTracksPlate: 1, fcSourcesGroup: 1, fcSpecPoolPlates: 1, fcSpeciesLedgerTable: 1 },
  "gm/app.jsx": { EnrichedPlanetDetailSheet: 2, PlanetAutocompleteInput: 1, UniverseMapRoutePanel: 1 },
  "lib/shared/ui.jsx": { BackupScreen: 1, CritTableRef: 1, ManeuversCard: 1, RecoveryCard: 2, ResultsReference: 4 },
  "lib/store/view.jsx": { CounterView: 1, LocationPicker: 2, Store: 4 },
  "lib/library/npc/view.jsx": { BenchAddMemberBlock: 1, EncList: 1, BenchGroupCraft: 1, BenchLedgerBoard: 2, NpcPaperDossier: 2, NpcPaperDrill: 1, NpcPaperFront: 2, NpcPaperRecent: 1, NpcPaperRoster: 1, NpcProfilePickerView: 1, NpcSkillGrid: 1, TalentBlock: 1, VehiclePanel: 1, WeaponTable: 1 },
  "lib/shared/vesselView.jsx": { CatList: 2, CatTable: 2, CrewTab: 3, CritPicker: 1, Crits: 1, DeckTab: 1, FitHardPoints: 1, FleetList: 2, Seats: 1, TradeTab: 3, Weapons: 1 },
  "lib/editor/view.jsx": { BackupPanel: 1, BookShelf: 2, CollectionPlate: 1, QualPicker: 1, SharePanel: 1, Shelf: 2, SpecShelf: 2, SpeciesPicker: 1, SpeciesShelf: 2, TalentShelf: 2, TreePicker: 1, edBands: 1 },
};
// encounters-e3-deletion (encounters-e3-flip-gate ADDENDUM 13, E: RULING-MOVED): NpcBenchGroupsView 1 → gone — its one stripe was the
// old board's encounter list (`nl-glist hp-bands`), deleted with the switch. Keeps every other count.
// post1-switch-deletion (ADDENDUM 638): SpeciesShelf 3 → 2 — the species key's OFF arm (the "In the books" plate) and its band run were deleted with the key.
Object.keys(SYMBOLS).forEach((f) => {
  const got = counts(f).c, want = SYMBOLS[f];
  Object.keys(want).forEach((s) => check(got[s] === want[s], f + ' ' + s + ' carries ' + want[s], 'reads ' + got[s]));
  Object.keys(got).forEach((s) => { if (!(s in want)) check(false, f + ' ' + s + ' is not an adopted symbol', got[s] + ' uses'); });
});

// 2. OUT
[['player/app.jsx', 'SheetPack'], ['player/app.jsx', 'SheetAbilitiesRoom'], ['player/app.jsx', 'SheetFortifications'], ['player/app.jsx', 'CraftWorkshop'],
  ['lib/shared/diceRoll.jsx', 'StepperRow'], ['player/app.jsx', 'GrowthRewards'], ['lib/library/npc/view.jsx', 'CastRosterItem']].forEach(([f, s]) => {
  const { c, spans } = counts(f);
  check(!!spans[s] && !c[s], f + ' ' + s + ' stands, with no stripe', spans[s] ? c[s] + ' uses' : 'symbol gone');
});
['dice/app.jsx'].forEach((f) => { if (fs.existsSync(path.join(ROOT, f))) check(!/hp-bands/.test(read(f)), f + ': the dice key has no stripe (surface 27)'); });

// 3. PINNED
const PINS = [
  ['11.signature', 'player/app.jsx', '<div className="hp-bands" data-run="1">{sigs.map('],
  ['23.cargo', 'lib/shared/vesselView.jsx', "el('tbody', { className: 'hp-bands' }, openL.map(row))"],
  ['23.deck', 'lib/shared/vesselView.jsx', "el('div', { className: 'hp-bands', 'data-run': '1' }, decks.map("],
  ['25.quality', 'lib/editor/view.jsx', "h('div', { className: 'hp-bands' }, rows.map(function (e) {\n        var on = sel === e.id, rk"],
  ['25.pick', 'lib/editor/view.jsx', "h('div', { className: 'ed-pick-list hp-bands', 'data-editor-pick-list': '1' }, rows.map("],
  ['26.legs', 'gm/app.jsx', '<div className="mp-legs hp-bands">'],
];
PINS.forEach(([sid, f, needle]) => check(read(f).includes(needle), 'pinned ' + sid + ' holds the class in source'));
check(!/game-?line[^\n]{0,80}hp-bands/i.test(read('player/app.jsx')), 'pinned 2.gameline: cards, on the left-out line, so no stripe');
check(!/data-journey=[^\n]{0,120}hp-bands/.test(read('player/app.jsx')), 'pinned 11.journeys: cards, on the left-out line, so no stripe');

// 4. PLACE
const css = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, '');
const paper = css('lib/shared/paper.css'), sheet = css('lib/shared/sheet.css');
const CSSFILES = fs.readdirSync(path.join(ROOT, 'lib'), { recursive: true }).filter((f) => /\.css$/.test(f)).map((f) => 'lib/' + f);
check((paper.match(/:where\(\.hp-bands\) > :nth-child\(even\) \{ background: var\(--doc-row-band\); \}/g) || []).length === 1, 'R-SST-2: the class, once');
['--hp-band-2: var(--doc-row-band); --hp-band-3: transparent;', ':where(.hp-bands2) > :nth-child(4n+2) { background: var(--hp-band-2); }', ':where(.hp-bands2) > :nth-child(4n+3) { background: var(--hp-band-3); }', ':where(.hp-bands2) > :nth-child(4n)   { background: var(--doc-row-band); }'].forEach((r) => check(paper.includes(r), 'R-SAP-4 holds: ' + r));
const tokenUsers = CSSFILES.filter((f) => /--doc-row-band/.test(css(f))).sort();
check(JSON.stringify(tokenUsers) === JSON.stringify(['lib/shared/grounds/creator.css', 'lib/shared/paper.css', 'lib/shared/sheet.css', 'lib/shared/tokens.css']), 'R-SST-1, R-SAP-4: --doc-row-band lives in the token files, the stripe rule and the flips only', tokenUsers.join(' '));
const classUsers = CSSFILES.filter((f) => /\.hp-bands(?![\w-])/.test(css(f)));
check(JSON.stringify(classUsers) === JSON.stringify(['lib/shared/paper.css']), '.hp-bands has one rule\'s file', classUsers.join(' '));
const twoUsers = CSSFILES.filter((f) => /hp-band-[23]|\.hp-bands2/.test(css(f))).sort();
check(JSON.stringify(twoUsers) === JSON.stringify(['lib/shared/paper.css', 'lib/shared/sheet.css']), 'R-SAP-4: the flips are only in sheet.css', twoUsers.join(' '));
check((sheet.match(/--hp-band-2:transparent/g) || []).length === 2 && (sheet.match(/--hp-band-2:var\(--doc-row-band\)/g) || []).length === 2, 'R-SAP-4: two flips, two un-flips, each with its columns');
check(/@container stage \(min-width:800px\)\{ \.sb-stage2\{ grid-template-columns:1fr 1fr; \} \.sb-stage2 > \.hp-bands2\{/.test(sheet), 'R-SAP-4: the stage flips in the query that sets its columns');
const important = CSSFILES.filter((f) => /(--doc-row-band|--hp-band-\d)[^;}]*!important/.test(css(f)));
check(important.length === 0, 'no !important on a stripe', important.join(' '));

// 5. REST: a base rule for one of these rows, with a background, outside :where(), beats the stripe
const REST = [['lib/shared/paper.css', '[data-doc-ground="creator"] .hp-row'], ['lib/shared/paper.css', '[data-doc-ground="creator"] .hp-skill'], ['lib/shared/paper.css', '[data-doc-ground="creator"] .sb-bk'],
  ['lib/editor/editor.css', '[data-doc-ground="creator"] .ed-irow'], ['lib/editor/editor.css', '[data-doc-ground="creator"] .ed-qrow'], ['lib/editor/editor.css', '[data-doc-ground="creator"] .ed-pick'], ['lib/editor/editor.css', '[data-doc-ground="creator"] .ed-recrow'],
  ['lib/shared/store.css', '[data-store-shell] .gm-prow'], ['lib/shared/npc.css', '[data-npc-shell] .nl-lrow'],
  ['lib/shared/yard.css', '.yd:where([data-yard-page="ship"]) .y-hprow'], ['lib/shared/yard.css', '.yd:where([data-yard-page="ship"]) .y-sec .y-hprow']];
REST.forEach(([f, sel]) => {
  const body = css(f).split(sel + '{').slice(1).concat(css(f).split(sel + ' {').slice(1)).map((x) => x.slice(0, x.indexOf('}')));
  check(!body.some((b) => /(^|[;\s])background(-color)?\s*:/.test(b)), 'R-SAP-5: ' + sel + ' has no resting background outside :where()');
  check(css(f).includes(':where(') && css(f).replace(/\s+/g, ' ').includes(sel.replace(/^\.yd:where\(\[data-yard-page="ship"\]\)/, '.yd[data-yard-page="ship"]')), 'R-SAP-5: ' + sel + ' keeps a zero-specificity ground');
});

// 6. R-SAP-13: a state rule that reads transparent is no ground. No resting state rule on an adopted row class may read transparent; `:hover` stays, and the selected-and-refused pair stands by name.
const ROWCLASSES = ['hp-row', 'hp-skill', 'hp-buy', 'hp-tal', 'sb-bk', 'sb-e', 'sb-sk', 'sb-buy', 'sb-pk-r', 'sb-ax', 'sb-att', 'ed-row', 'ed-recrow', 'ed-irow', 'ed-qrow', 'ed-pick', 'gm-prow', 'gm-stockrow', 'nl-lrow', 'y-hprow', 'y-e', 'y-role', 'y-seatrow', 'y-critrow', 'y-deckrow', 'y-ship'];
const STATE_RE = new RegExp('\\.(' + ROWCLASSES.join('|') + ')((?:\\[[^\\]]*\\])+)\\s*$');
const PAIR = '[data-doc-ground="creator"] .hp-row[data-selected="1"][data-refused="1"]';
function restingTransparent(text) {
  const out = [], re = /([^{}]+)\{([^{}]*)\}/g; let m;
  while ((m = re.exec(text))) {
    if (!/(^|[;\s])background(-color)?\s*:\s*transparent/.test(m[2])) continue;
    m[1].split(',').map((x) => x.trim()).filter(Boolean).forEach((sel) => { if (sel !== PAIR && !sel.startsWith(':where(') && STATE_RE.test(sel)) out.push(sel); });
  }
  return out;
}
check(restingTransparent('[data-doc-ground="creator"] .hp-row[data-limit="1"] { background:transparent; }').length === 1, 'falsifier: a resting state rule reading transparent is caught');
check(restingTransparent('.x .hp-row[data-limit="1"]:hover { background:transparent; }').length === 0, 'falsifier: a hover rule stays out of the count');
CSSFILES.forEach((f) => { const bad = restingTransparent(css(f)); if (bad.length) check(false, 'R-SAP-13: ' + f + ' has a resting state rule reading transparent', bad.join(' | ')); });
check(CSSFILES.every((f) => restingTransparent(css(f)).length === 0), 'R-SAP-13: no resting state rule on an adopted row class reads transparent (' + CSSFILES.length + ' files)');
check(paper.includes(PAIR + ' { background: transparent; }'), 'R-SAP-13: the selected-and-refused pair keeps today\'s ground, by its one rule');
check(!/\.sb-bk \{[^}]*background:transparent/.test(paper), 'R-SAP-16: a re-derive that brings .sb-bk\'s transparent back reds here');

console.log('\nsite_stripes_adoption: ' + passes + ' pass, ' + fails + ' fail');
process.exit(fails ? 1 : 0);
