'use strict';

const CR = require('../lib/shared/charResolve.js');
const fs = require('fs');
const path = require('path');

const gearReg = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'public', 'data', 'canonical', 'gear.json'), 'utf8')).gear;
const armorReg = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'public', 'data', 'canonical', 'armor.json'), 'utf8')).armor;

let passed = 0, failed = 0;
function check(label, ok) {
  if (ok) { passed++; console.log('  PASS  ' + label); }
  else { failed++; console.log('  FAIL  ' + label); }
}

// ── LEGACY TOLERANCE ──────────────────────────────────────────────────
// A sheet with no loc/worn/container fields produces the same numbers as
// the old flat sum: absent state = carried, absent worn = not worn, absent
// bonus = 0. The old code used || 1 for weapons and || 2 for armor —
// the shared function uses || 0, so legacy characters whose weapons have
// no encumbrance field get 0, not 1. That is CORRECT — the fabricated
// defaults were the bug the deletion contract names.

const legacyEquipment = {
  weapons: [
    { encumbrance: 3 },
    { encumbrance: 1 },
  ],
  armor: { encumbrance: 5 },
  gear: [
    { encumbrance: 1, qty: 2 },
    { encumbrance: 0, qty: 1 },
  ],
};
const legacyChars = { brawn: 3 };
const legacyEnc = CR.computeEncumbrance(legacyEquipment, legacyChars);

check('legacy: carried = 3+1+5+2+0 = 11', legacyEnc.carried === 11);
check('legacy: limit = 5+3 = 8 (no containers)', legacyEnc.limit === 8);
check('legacy: over = 3', legacyEnc.over === 3);
check('legacy: setbacks = 3', legacyEnc.setbacks === 3);
check('legacy: freeManeuverLost = true (over 3 >= brawn 3)', legacyEnc.freeManeuverLost === true);

// Absent equipment → zero / default
const emptyEnc = CR.computeEncumbrance({}, { brawn: 2 });
check('empty: carried=0, limit=7, over=0', emptyEnc.carried === 0 && emptyEnc.limit === 7 && emptyEnc.over === 0);

// ── MUTANT (a): stored item still counted as carried ──────────────────
const mutantStored = {
  weapons: [{ encumbrance: 4, state: 'stowed' }],
  armor: null,
  gear: [{ encumbrance: 2, qty: 1 }],
};
const mutantStoredEnc = CR.computeEncumbrance(mutantStored, { brawn: 2 });
check('MUTANT stored: a stored weapon does NOT count (carried=2, not 6)', mutantStoredEnc.carried === 2);

// Confirm the mutant bites: the SAME item with no loc DOES count
const mutantStoredControl = {
  weapons: [{ encumbrance: 4 }],
  armor: null,
  gear: [{ encumbrance: 2, qty: 1 }],
};
const controlEnc = CR.computeEncumbrance(mutantStoredControl, { brawn: 2 });
check('MUTANT stored CONTROL: absent state = carried (carried=6)', controlEnc.carried === 6);

// ── MUTANT (b): worn armor discount under-applies ─────────────────────
const mutantWorn = {
  weapons: [],
  armor: { encumbrance: 5, state: 'worn' },
  gear: [],
};
const wornEnc = CR.computeEncumbrance(mutantWorn, { brawn: 2 });
check('MUTANT worn: armor enc 5 worn → 5-3=2 (not 5)', wornEnc.carried === 2);

// Worn with enc <= 3: floor 0
const wornLow = {
  weapons: [],
  armor: { encumbrance: 2, state: 'worn' },
  gear: [],
};
check('MUTANT worn floor: armor enc 2 worn → max(0, 2-3)=0', CR.computeEncumbrance(wornLow, { brawn: 2 }).carried === 0);

// NOT worn → full encumbrance
const unworn = {
  weapons: [],
  armor: { encumbrance: 5 },
  gear: [],
};
check('MUTANT worn CONTROL: unworn armor → full enc 5', CR.computeEncumbrance(unworn, { brawn: 2 }).carried === 5);

// ── MUTANT (c): container bonus while stored ──────────────────────────
const mutantContainerStored = {
  weapons: [],
  armor: null,
  gear: [
    { encumbrance: 0, qty: 1, encumbrance_threshold_bonus: 4, state: 'stowed' },
    { encumbrance: 3, qty: 1 },
  ],
};
const containerStoredEnc = CR.computeEncumbrance(mutantContainerStored, { brawn: 2 });
check('MUTANT container stored: bonus does NOT apply (limit=7, not 11)', containerStoredEnc.limit === 7);

// Control: carried container DOES add to limit
const containerCarried = {
  weapons: [],
  armor: null,
  gear: [
    { encumbrance: 0, qty: 1, encumbrance_threshold_bonus: 4 },
    { encumbrance: 3, qty: 1 },
  ],
};
const containerCarriedEnc = CR.computeEncumbrance(containerCarried, { brawn: 2 });
check('MUTANT container CONTROL: carried bonus applies (limit=11)', containerCarriedEnc.limit === 11);

// ── MUTANT (d): over-state setbacks at exactly over==brawn ────────────
const exactlyOver = {
  weapons: [{ encumbrance: 10 }],
  armor: null,
  gear: [],
};
const exactEnc = CR.computeEncumbrance(exactlyOver, { brawn: 2 });
check('MUTANT over-state: carried 10, limit 7, over=3, setbacks=3', exactEnc.over === 3 && exactEnc.setbacks === 3);
check('MUTANT over-state: over 3 >= brawn 2 → freeManeuverLost', exactEnc.freeManeuverLost === true);

// One less: over=1, brawn=2 → NOT lost
const justOver = {
  weapons: [{ encumbrance: 8 }],
  armor: null,
  gear: [],
};
const justEnc = CR.computeEncumbrance(justOver, { brawn: 2 });
check('MUTANT over-state: over 1 < brawn 2 → freeManeuverLost=false', justEnc.freeManeuverLost === false);

// ── THRESHOLD ARITHMETIC, STATED ──────────────────────────────────────
// Brawn 2 + backpack carried → 11; same backpack stored → 7
const backpackCarried = {
  weapons: [],
  armor: null,
  gear: [{ encumbrance: 0, qty: 1, encumbrance_threshold_bonus: 4 }],
};
check('threshold: Brawn 2 + backpack carried → limit 11',
  CR.computeEncumbrance(backpackCarried, { brawn: 2 }).limit === 11);

const backpackStored = {
  weapons: [],
  armor: null,
  gear: [{ encumbrance: 0, qty: 1, encumbrance_threshold_bonus: 4, state: 'stowed' }],
};
check('threshold: Brawn 2 + backpack stored → limit 7',
  CR.computeEncumbrance(backpackStored, { brawn: 2 }).limit === 7);

// ── A3: ARMOR THRESHOLD BONUS (worn-gated) ────────────────────────────
const armorBonus = {
  weapons: [],
  armor: { encumbrance: 4, state: 'worn', encumbrance_threshold_bonus: 3 },
  gear: [],
};
check('A3: worn armor +3 bonus → limit 10 (5+2+3)',
  CR.computeEncumbrance(armorBonus, { brawn: 2 }).limit === 10);

// NOT worn → no bonus
const armorBonusUnworn = {
  weapons: [],
  armor: { encumbrance: 4, encumbrance_threshold_bonus: 3 },
  gear: [],
};
check('A3: unworn armor → no bonus (limit=7)',
  CR.computeEncumbrance(armorBonusUnworn, { brawn: 2 }).limit === 7);

// ── R-LAB-7: ATTACHMENT BONUS TERM (structurally present) ─────────────
const attachBonus = {
  weapons: [],
  armor: null,
  gear: [{
    encumbrance: 0, qty: 1,
    encumbrance_threshold_bonus: 3,
    attachments: [{ encumbrance_threshold_bonus: 1 }],
  }],
};
check('R-LAB-7: gear base +3 + attachment +1 → limit 11 (5+2+3+1)',
  CR.computeEncumbrance(attachBonus, { brawn: 2 }).limit === 11);

// Attachment on carried armor (worn) also counts
const armorAttachBonus = {
  weapons: [],
  armor: {
    encumbrance: 4, state: 'worn',
    encumbrance_threshold_bonus: 3,
    attachments: [{ encumbrance_threshold_bonus: 2 }],
  },
  gear: [],
};
check('R-LAB-7: worn armor base +3 + attachment +2 → limit 12 (5+2+3+2)',
  CR.computeEncumbrance(armorAttachBonus, { brawn: 2 }).limit === 12);

// Attachment on unworn armor does NOT count
const armorAttachUnworn = {
  weapons: [],
  armor: {
    encumbrance: 4,
    encumbrance_threshold_bonus: 3,
    attachments: [{ encumbrance_threshold_bonus: 2 }],
  },
  gear: [],
};
check('R-LAB-7: unworn armor attachment → no bonus (limit=7)',
  CR.computeEncumbrance(armorAttachUnworn, { brawn: 2 }).limit === 7);

// Attachment on stored gear does NOT count
const gearAttachStored = {
  weapons: [],
  armor: null,
  gear: [{
    encumbrance: 0, qty: 1, state: 'stowed',
    encumbrance_threshold_bonus: 3,
    attachments: [{ encumbrance_threshold_bonus: 1 }],
  }],
};
check('R-LAB-7: stored gear attachment → no bonus (limit=7)',
  CR.computeEncumbrance(gearAttachStored, { brawn: 2 }).limit === 7);

// ── DELETION PROVEN ───────────────────────────────────────────────────
// The old encTotal/encLimit locals are gone from player/app.jsx (the second calculator).
// A weapon with no encumbrance field: the old code fabricated || 1; the new code gives 0.
const noEncWeapon = {
  weapons: [{}],
  armor: null,
  gear: [],
};
check('deletion: weapon with no encumbrance field → carried 0 (not fabricated 1)',
  CR.computeEncumbrance(noEncWeapon, { brawn: 2 }).carried === 0);

// The old code fabricated || 2 for armor with no encumbrance:
const noEncArmor = {
  weapons: [],
  armor: {},
  gear: [],
};
check('deletion: armor with no encumbrance field → carried 0 (not fabricated 2)',
  CR.computeEncumbrance(noEncArmor, { brawn: 2 }).carried === 0);

// ── REGISTRY DATA ─────────────────────────────────────────────────────
// Verify the 9 gear + 8 armor rows carry their stated bonuses.
const GEAR_BONUSES = {
  backpack: 4,
  load_bearing_gear: 3,
  military_pack: 6,
  mk_iv_modular_backpack: 3,
  spacer_s_duffel: 2,
  surveyor_s_bag: 2,
  utility_belt: 1,
  wizard_pouch: 1,
  jedi_utility_belt: 1,
};
Object.keys(GEAR_BONUSES).forEach(function(id) {
  const rec = gearReg[id];
  check('gear bonus: ' + id + ' = +' + GEAR_BONUSES[id],
    rec && rec.encumbrance_threshold_bonus === GEAR_BONUSES[id]);
});

const ARMOR_BONUSES = {
  hauling_harness: 6,
  mk_i_katarn_class_commando_armor: 3,
  phase_i_arc_trooper_armor: 3,
  phase_i_arc_trooper_armor_rise_of_the_separatists: 3,
  pioneer_armor: 3,
  a_kt_tracker_utility_vest: 2,
  pit_crew_coveralls: 1,
  survivalist_armor: 1,
};
Object.keys(ARMOR_BONUSES).forEach(function(id) {
  const rec = armorReg[id];
  check('armor bonus: ' + id + ' = +' + ARMOR_BONUSES[id],
    rec && rec.encumbrance_threshold_bonus === ARMOR_BONUSES[id]);
});

// ── EXCLUSION CLASS ───────────────────────────────────────────────────
// Items that say "encumbrance" but must NOT carry a threshold bonus.
const EXCLUDED = [
  'sleight_box_tiny', 'sleight_box_small', 'sleight_box_medium',
  'sleight_box_large', 'sleight_box_very_large',
  'military_belt_pouch',
  'specimen_container_tiny', 'specimen_container_small',
  'specimen_container_medium', 'speciman_container_large',
  'cargo_scanner',
  'repulsor_clamp', 'shift_coffer',
];
var excludedCount = 0;
EXCLUDED.forEach(function(id) {
  const rec = gearReg[id];
  check('excluded: ' + id + ' has NO bonus',
    rec && rec.encumbrance_threshold_bonus == null);
  excludedCount++;
});
check('excluded: all ' + EXCLUDED.length + ' subjects found and checked',
  excludedCount === EXCLUDED.length);

// ── SECOND CALCULATOR GREP ────────────────────────────────────────────
const appSrc = fs.readFileSync(path.join(__dirname, '..', 'player', 'app.jsx'), 'utf8');
const encTotalRefs = (appSrc.match(/\bencTotal\b/g) || []).length;
const encLimitRefs = (appSrc.match(/\bencLimit\b/g) || []).length;
check('deletion grep: encTotal removed (Lap C meter reads enc.carried directly)',
  encTotalRefs === 0);
// RE-POINTED (N-post, lap paper-sheet-delete step 4, 2026-09-30). The claim before: `encLimit` appears 4×
// — the old sheet's encumbrance meter (declaration + guard + fill + label), the one sanctioned local. That
// meter was deleted with the old face. After: 0 — no local limit anywhere; the paper spine's encumbrance row
// reads `enc.carried` / `enc.limit` straight off CharResolve.computeEncumbrance. KEPT: the no-second-
// calculator claim. DROPPED: the deleted meter's four references.
check('deletion grep: encLimit is gone with the old meter (0×)', encLimitRefs === 0, encLimitRefs);
check('the paper spine reads the ONE resolver: computeEncumbrance → enc.carried / enc.limit',
  /function SheetSpine[\s\S]{0,600}?var enc = CharResolve\.computeEncumbrance\(/.test(appSrc) &&
  /\{enc\.carried\}<span className="sb-of"> \/ \{enc\.limit\}/.test(appSrc));
check('deletion grep: computeEncumbrance is the source',
  appSrc.includes('CharResolve.computeEncumbrance'));

// ═══════════════════════════════════════════════════════════════════════
console.log('\nencumbrance_resolver guard: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
