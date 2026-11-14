// R7 creator-pickers lap (ruling release-r7-bug-burndown ADDENDA 84–86) — the node half of the lap's FIX rows.
//   B-1055 — CharResolve.dedicationOwedCells (ADDENDUM 86 CALL 1): a creator-bought Dedication is owed exactly once and
//            placing it gives +1; a pre-M7 sheet-bought Dedication whose +1 is already held is owed 0; a pre-B-736
//            record (no characteristicsAtCreation) is owed 0. The sheet's place applies the +1 capped at the talent's 6
//            (Q1, ADDENDUM 85) and does not re-stamp characteristicsAtCreation (CALL 2 (i)). The creator's refund takes
//            the cell's characteristic pick with it.
//   B-756 (1) — the unreachable "SELECT n MORE" branch is gone (ADDENDUM 85: keep as drawn, delete the dead branch).
// Run: node test/release_r7_creator_pickers.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const CR = require('../lib/shared/charResolve.js');

let pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label + (detail !== undefined ? '  — ' + JSON.stringify(detail) : '')); }
}

const ROOT = path.join(__dirname, '..');
const specFile = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical/specializations.json'), 'utf8'));
const SPECS = specFile.specializations || specFile;
// advisor's tree holds Dedication at 4-0 (read off the registry, never assumed)
const DED_POS = (function () {
  const t = (SPECS.advisor && SPECS.advisor.talent_tree) || [];
  for (let r = 0; r < t.length; r++) for (let c = 0; c < ((t[r] && t[r].talents) || []).length; c++) {
    if (t[r].talents[c] && t[r].talents[c].talent === 'dedication') return r + '-' + c;
  }
  return null;
})();
check('fixture: the advisor tree carries a Dedication cell', !!DED_POS, DED_POS);

const BASE = { brawn: 2, agility: 2, intellect: 3, cunning: 2, willpower: 3, presence: 5 };
function sheetOf(over) {
  return Object.assign({
    specializations: [{ id: 'advisor', owned: ['0-0', '1-0', '2-0', '3-0', DED_POS] }],
    characteristics: Object.assign({}, BASE),
    characteristicsAtCreation: Object.assign({}, BASE),
  }, over || {});
}

check('B-1055 exported: CharResolve.dedicationOwedCells', typeof CR.dedicationOwedCells === 'function');
const fn = CR.dedicationOwedCells || function () { return null; };

// (1) creator-bought: owned, no pick, no point (characteristics == characteristicsAtCreation)
const creatorBought = sheetOf();
const owed1 = fn(creatorBought, SPECS);
check('B-1055 (1) a creator-bought Dedication is owed exactly once', Array.isArray(owed1) && owed1.length === 1 && owed1[0] === 'advisor ' + DED_POS, owed1);
// placed: the record filed and the +1 applied (what chooseTalentCharacteristic writes), the stamp untouched
const placed = sheetOf({ characteristics: Object.assign({}, BASE, { presence: 6 }),
  talentCharacteristicChoices: { advisor: { [DED_POS]: 'presence' } } });
const owed1b = fn(placed, SPECS);
check('B-1055 (1) once placed (+1, record filed), it is owed 0 — never offered twice', Array.isArray(owed1b) && owed1b.length === 0, owed1b);
check('B-1055 (1) placing gives +1 (5 → 6), and the creation stamp is unchanged (CALL 2 (i))',
  placed.characteristics.presence === BASE.presence + 1 && placed.characteristicsAtCreation.presence === BASE.presence);

// (2) a pre-M7 sheet-bought Dedication: no record, but its +1 is already in characteristics
const preM7 = sheetOf({ characteristics: Object.assign({}, BASE, { brawn: 3 }) });
const owed2 = fn(preM7, SPECS);
check('B-1055 (2) a pre-M7 sheet-bought Dedication whose +1 is held is owed 0', Array.isArray(owed2) && owed2.length === 0, owed2);

// (3) a pre-B-736 record: no characteristicsAtCreation → it cannot be told apart from a held point
const preB736 = sheetOf(); delete preB736.characteristicsAtCreation;
const owed3 = fn(preB736, SPECS);
check('B-1055 (3) a pre-B-736 record (no characteristicsAtCreation) is owed 0', Array.isArray(owed3) && owed3.length === 0, owed3);

// no Dedication owned → nothing
const none = sheetOf({ specializations: [{ id: 'advisor', owned: ['0-0'] }] });
check('B-1055 a sheet owning no Dedication is owed nothing', (fn(none, SPECS) || []).length === 0);

// Q1 — the cap is the talent's own 6, not the creation XP cap of 5
check('B-1055 Q1: CharResolve.CHARACTERISTIC_CAP is 6 (EotE p.134; FaD p.102 Table 2-2)', CR.CHARACTERISTIC_CAP === 6, CR.CHARACTERISTIC_CAP);

const APP = fs.readFileSync(path.join(ROOT, 'player/app.jsx'), 'utf8');
function bodyOf(src, head) {
  const i = src.indexOf(head);
  if (i < 0) return '';
  const j = src.indexOf('\n  }\n', i);
  return src.slice(i, j < 0 ? i + 4000 : j);
}
const place = bodyOf(APP, '  function chooseTalentCharacteristic(specKey, pos, characteristic) {');
check('B-1055 the sheet\'s place applies Dedication\'s +1 only when owed (dedicationOwedCells)',
  /dedicationOwedCells\(sheet/.test(place) && /onSheetChange\(\{ talentCharacteristicChoices: tcc, characteristics: chars \}\)/.test(place), place.slice(0, 200));
check('B-1055 Q1: the place refuses 6 → 7 (>= CHARACTERISTIC_CAP) and 5 → 6 passes (no 5-cap)',
  /\>= CharResolve\.CHARACTERISTIC_CAP\) return;/.test(place) && !/\>= 5\b/.test(place));
check('B-1055 CALL 2 (i): the place does not re-stamp characteristicsAtCreation',
  place.length > 0 && !/characteristicsAtCreation|creationCharacteristicsStamp/.test(place.replace(/\/\/.*$/gm, '')));
check('B-1055 the sheet passes the owed list to the tree (characteristicOwed)',
  /characteristicOwed: CharResolve\.dedicationOwedCells\(sheet, data\.specializations\)/.test(APP));
const TV = fs.readFileSync(path.join(ROOT, 'lib/shared/treeView.jsx'), 'utf8');
check('B-1055 the tree opens the one picker for an owed Dedication (charChoiceNeeded || dedicationOwed)',
  /charChoiceNeeded: charChoiceNeeded \|\| dedicationOwed/.test(TV));
const refund = bodyOf(APP, '  var handleTalentRefundWithChoices = useCallback(function(posKey) {');
check('B-1055 the creator\'s refund takes the cell\'s characteristic pick with it',
  /talentCharacteristicChoices/.test(refund) && /updateCharacter\('talentCharacteristicChoices'/.test(refund));

// B-756 (1)
check('B-756 (1) the unreachable "SELECT n MORE" label is deleted (fcPickerActLabel gone)',
  APP.indexOf('function fcPickerActLabel') === -1 && APP.indexOf("'SELECT ' + (max - count) + ' MORE'") === -1);
// RE-POINTED, B-1688: `FCBottomAction`'s mount went with the legacy host. KEEPS the word from its one home, and an act only at a full
// count (frames AC/AD/AE). DROPS the dark action bar's props.
check('B-756 (1) the skill picker\'s act reads CONFIRM from its one home, drawn only once the picks are full',
  /_gbPickCount === _gbPickMax/.test(APP) && /\{FC_PICK_CONFIRM\} <span>/.test(APP));

// ── B-1055 MOUNT (ADDENDUM 99 item 14 G1–G5, ADDENDUM 102's erratum): the creator's Dedication, stamp before raise ──
// A human Mystic/Advisor: 0-0..3-0 then Dedication at 4-0 = 5+10+15+20+25 = 75 spent, 35 remaining (the drawing's).
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', f), 'utf8'));
const CB = { species: J('species.json').species, careers: J('careers.json').careers, specializations: SPECS,
  talents: J('talents.json').talents, forcePowers: J('force_powers.json').force_powers, skillSheetKeys: {}, skillChars: {}, skillNames: {} };
const GD = { narrativeMechanics: { morPairs: { strengths: [], weaknesses: [] }, config: {} }, charbuild: CB };
const toSheet = (ch) => CR.normalizeCreated(JSON.parse(JSON.stringify(ch)), CB.species.human, null, GD, 'creator', { registries: { weapons: {}, armor: {}, gear: {} }, activeMods: [] });
const derived = (sh) => CR.computeDerived(sh, { weapons: [], armor: null, gear: [] }, CB);
const TWOS = { brawn: 2, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 2 };
const PATH = ['0-0', '1-0', '2-0', '3-0'];
// a FRESH creator draft holding the path, as ADD_TALENT writes it onto createEmptyCharacter's shape
function freshDraft(withDed) {
  const talents = {};
  PATH.concat(withDed ? [DED_POS] : []).forEach((pos) => { const [r, c] = pos.split('-').map(Number);
    talents['advisor_r' + r + 'c' + c] = { talentKey: SPECS.advisor.talent_tree[r].talents[c].talent, specKey: 'advisor', row: r, col: c, cost: SPECS.advisor.talent_tree[r].cost }; });
  return { identity: { name: 'G', playerName: '' }, gameLine: 'eote', narrative: { backstory: '' }, appearance: {},
    species: { key: 'human', name: 'Human' }, career: { key: 'mystic', name: 'Mystic' }, specializations: [{ key: 'advisor', name: SPECS.advisor.name, isStarting: true }],
    characteristics: Object.assign({}, TWOS), skills: {}, talents, forcePowers: {}, mechanic: null, gearLedger: { startingCredits: 500, credits: 500, inventory: [] },
    motivations: { strength: null, flaw: null, desire: null, fear: null }, notes: { personal: '', gm: '' }, dedicationCarried: [] };
}
const placedDraft = Object.assign(freshDraft(true), { talentCharacteristicChoices: { advisor: { [DED_POS]: 'brawn' } } });
const unplaced = toSheet(freshDraft(true));
let g1 = null, g1err = null;
try { g1 = toSheet(placedDraft); } catch (e) { g1err = String(e); }
check('B-1055 G1 the creator\'s Dedication on Brawn: characteristics.brawn = 2 + 1, characteristicsAtCreation.brawn = 2, the record filed',
  !!g1 && g1.characteristics.brawn === 3 && g1.characteristicsAtCreation.brawn === 2
  && (g1.talentCharacteristicChoices || {}).advisor && g1.talentCharacteristicChoices.advisor[DED_POS] === 'brawn',
  g1err || (g1 && { ch: g1.characteristics.brawn, atC: g1.characteristicsAtCreation.brawn, tcc: g1.talentCharacteristicChoices }));
check('B-1055 G1 xp.spent equals the same build unplaced (75 spent / 35 remaining, the drawing)',
  !!g1 && g1.xp.spent === unplaced.xp.spent && g1.xp.spent === 75 && g1.xp.remaining === 35, g1 && [g1.xp, unplaced.xp]);
const dU = derived(unplaced), dP = g1 ? derived(g1) : {};
check('B-1055 G2 wound threshold equals the unplaced build\'s; soak is +1 (live Brawn, R-TF-3)',
  !!g1 && dP.woundThreshold === dU.woundThreshold && dP.soak === dU.soak + 1, [dU.woundThreshold, dP.woundThreshold, dU.soak, dP.soak]);
check('B-1055 G3 dedicationOwedCells on the finished record is [] — the sheet never offers it again',
  !!g1 && JSON.stringify(fn(g1, SPECS)) === '[]', g1 && fn(g1, SPECS));
// G5 (ADDENDUM 102): a refund lowers the point and the record — the creator's refund drops the talent and the record
const refunded = toSheet(freshDraft(false));
check('B-1055 G5 a refund in the creator lowers the point and the record (Brawn 2, no record)',
  refunded.characteristics.brawn === 2 && !(refunded.talentCharacteristicChoices || {}).advisor);
// ── ADDENDUM 108 C1–C2: dedicationCarried's shape — [] on a new creation, ABSENT reads as every recorded cell ──
// R-M13B-131 Q2: a hand-built draft with the field absent reads every recorded Dedication cell as carried; a present field, even [], is its own answer
const absentDraft = Object.assign(freshDraft(true), { talentCharacteristicChoices: { advisor: { [DED_POS]: 'willpower' } } }); delete absentDraft.dedicationCarried;
const dedKey = 'advisor_r' + DED_POS.replace('-', 'c');
check('B-1055 C1 an absent dedicationCarried reads as the recorded Dedication cell (hand-built draft)', JSON.stringify(CR.creatorDedicationCarried(absentDraft)) === JSON.stringify([dedKey]));
check('B-1055 C1 a present [] stays [] (hand-built draft)', JSON.stringify(CR.creatorDedicationCarried(Object.assign({}, absentDraft, { dedicationCarried: [] }))) === '[]');
const c2b = toSheet(Object.assign(freshDraft(true), { dedicationCarried: [], talentCharacteristicChoices: { advisor: { [DED_POS]: 'willpower' } } }));
check('B-1055 C2 a new creation carrying [] plus a creator pick adds exactly one point (Willpower 2 → 3, at creation 2)',
  c2b.characteristics.willpower === 3 && c2b.characteristicsAtCreation.willpower === 2
  && Object.keys(c2b.characteristics).every((k) => k === 'willpower' || c2b.characteristics[k] === TWOS[k]), c2b.characteristics);
const noKey = [g1, c2b, refunded].filter(Boolean);
check('B-1055 C2 no finished sheet carries a dedicationCarried key (' + noKey.length + ' sheets)',
  noKey.length === 3 && noKey.every((sh) => !Object.prototype.hasOwnProperty.call(sh, 'dedicationCarried')));
const IDX = fs.readFileSync(path.join(ROOT, 'player/index.html'), 'utf8');
check('B-1055 C1 createEmptyCharacter writes dedicationCarried: [] (every new creation, custom and Quick Build)',
  /notes: \{ personal: '', gm: '' \},[\s\S]{0,400}dedicationCarried: \[\],\n  \};\n\}/.test(IDX));
check('B-1055 C1 the creator choose materializes an absent carry before the pick; the refund reads the absent field as carried',
  /if \(!Array\.isArray\(ctrl\.character\.dedicationCarried\)\) ctrl\.updateCharacter\('dedicationCarried', CharResolve\.creatorDedicationCarried\(ctrl\.character\)\);/.test(APP)
  && /carried = CharResolve\.creatorDedicationCarried\(ctrl\.character\);/.test(APP));

// the creator mount, read off the source (the smoke drives it at 390 and 1440)
const cBuy = bodyOf(APP, '  var handleTalentBuy = useCallback(function(talentKey, specKey, row, col, cost) {');
const cDirect = bodyOf(APP, '  var handleTalentBuyDirect = useCallback(function(talentKey, specKey, row, col, cost) {');
check('B-1055 MOUNT both creator buys raise the one picker for Dedication before the spend lands',
  /talentKey === 'dedication'\) \{ raiseCreatorCharPick\(/.test(cBuy) && /talentKey === 'dedication'\) \{ raiseCreatorCharPick\(/.test(cDirect));
const cChoose = (function () { const i = APP.indexOf('  var handleCreatorCharChoose = useCallback(function(c) {'); return i < 0 ? '' : APP.slice(i, APP.indexOf('}, [ctrl, creatorCharPick]);', i)); })();
check('B-1055 MOUNT a choice buys AND files the record (ADD_TALENT + talentCharacteristicChoices), never the characteristics',
  /type: 'ADD_TALENT'/.test(cChoose) && /updateCharacter\('talentCharacteristicChoices'/.test(cChoose) && !/updateCharacter\('characteristics'/.test(cChoose));
check('B-1055 MOUNT G5 Cancel buys nothing (ADDENDUM 102): the close only drops the picker',
  /var closeCreatorCharPick = useCallback\(function\(\) \{ setCreatorCharPick\(null\); \}, \[\]\);/.test(APP));
check('B-1055 MOUNT the picker is mounted on the creator, reading the pending characteristics (B-1688: the legacy mount went)',
  (APP.match(/h\(M7CharPickSheet, \{ pick: creatorCharPick,[\s\S]{0,80}characteristics: CharResolve\.creatorCharacteristicsWithPending\(ctrl\.character\)/g) || []).length === 1);

// ── B-1558 (ADDENDUM 99 item 15): Review's Create waits for a species and a career (the smoke drives both bands) ──
const review = (function () { const i = APP.indexOf('function FCReviewSheet(p) {'); return i < 0 ? '' : APP.slice(i, APP.indexOf('\nfunction ', i + 10)); })();
check('B-1558 Create is held on a species AND a career, and commit() refuses without them',
  /var heldOk = !!\(displayModel\.species && displayModel\.career\);/.test(review) && /var createOk = nameOk && heldOk;/.test(review)
  && /function commit\(\) \{ if \(createOk\) p\.onConfirm\(displayModel\); \}/.test(review));
check('B-1558 both commit sites print "Choose a species and a career to finish" in the name check\'s idiom; the name check unchanged',
  (review.match(/data-refused=\{!nameOk \? 'name' : \(heldOk \? undefined : 'species-career'\)\} aria-disabled=\{createOk \? undefined : 'true'\}/g) || []).length === 2
  && (review.match(/\{!heldOk \? <span className="hp-none" data-review-refused="species-career" style=\{\{ display: 'block', marginTop: '8px' \}\}>\{'Choose a species and a career to finish'\}<\/span> : null\}/g) || []).length === 2
  && (review.match(/\{!nameOk \? <span className="hp-none" data-review-refused="name" style=\{\{ display: 'block', marginTop: '8px' \}\}>\{'Name your character to finish'\}<\/span> : null\}/g) || []).length === 2);

console.log('\nrelease_r7_creator_pickers: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
