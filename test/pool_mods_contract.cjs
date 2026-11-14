#!/usr/bin/env node
/**
 * pool_mods_contract.cjs — guard for R-DPS-1..9 (dicepool-effect-schema).
 *
 * Proves: pool_mods die enum (R-DPS-2), count positive int (R-DPS-3),
 * applies_to anchored to skills.vocab.json (R-DPS-4), from pointer presence
 * (R-DPS-1), weapon effects/never_modelled enum (R-DPS-8), and demon_mask
 * unstructured (R-DPS-3).
 *
 * REPORTS (does not fail on): the conditionless split — anchored vs anchorless — per R-BPH-3.
 *
 * applies_to is an ARRAY since R-PCH-1 (ruling `pool-mods-certification-halts`): OR semantics,
 * uniform shape, `null` reserved for "no anchor recorded" and never `[]`.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

function main() {
  const gear = rd('public/data/canonical/gear.json').gear;
  const armor = rd('public/data/canonical/armor.json').armor;
  const attachments = rd('public/data/canonical/attachments.json').attachments;
  const weapons = rd('public/data/canonical/weapons.json').weapons;
  const skillsVocab = rd('schema/vocab/skills.vocab.json');

  const skillIds = new Set(skillsVocab.entries.map(e => e.id));
  const charIds = new Set(rd('schema/vocab/characteristics.vocab.json').entries.map(e => e.id));
  const groups = new Set(skillsVocab.entries.map(e => e.group));
  const VALID_DIES = new Set(['boost', 'setback', 'difficulty', 'challenge', 'force']);
  const VALID_NM = new Set(['narrative', 'see_source', 'gm_discretion', 'conditional_triggered']);
  const VALID_EFFECT_TYPES = new Set([
    'quality_add', 'quality_add_contextual', 'damage_delta', 'stun_damage_delta',
    'damage_set', 'crit_delta', 'crit_set', 'range_delta', 'soak_delta',
    'defense_delta', 'encumbrance_delta', 'talent_grant', 'meta_hp_crystal', 'dicepool',
    // the fifteenth: QR1 `qualities_reduce` (B-1204, census card R-M12C-95; re-pointed 14 → 15 by
    // f100-m12-build-card R-M12B-46) — the bipod, tripod, harness, sling and gyrostabilizer base lines, and (5b-3) the
    // nine SUBQUAL* options
    'qualities_reduce',
    // the sixteenth and seventeenth (re-pointed 15 → 17 by R-M12B-54, inside the 5b-3 applier commit): MV3
    // `item_character_effect` (16 lines) and MV4 `host_hard_points_delta` (6 lines), census card R-M12C-55/-95
    'item_character_effect', 'host_hard_points_delta',
    // the eighteenth (re-pointed 17 → 18 inside the QS2 applier commit, as test/f100_m12_mod_lines.cjs P5 was at da7acadc;
    // f100-m12-build-card ADDENDUM 22, R-M12B-70): QS2 `spend_cost_delta`, jury_rigged_weapon/a3
    'spend_cost_delta'
  ]);
  const N_EFFECT_TYPES = VALID_EFFECT_TYPES.size;

  console.log('='.repeat(72));
  console.log('POOL_MODS CONTRACT — R-DPS-1..9');
  console.log('='.repeat(72));

  const fails = [];
  const counts = { gear: 0, armor: 0, attachments: 0, weapons: 0 };
  let autoApply = 0;
  const autoApplyDark = [];
  // R-BPH-3 (ruling `b221-pool-mods-consumer-halt`): the conditionless population and the
  // anchored subset are DIFFERENT numbers, and printing only the second made three readings of
  // "does this apply" agree in silence — R-DPS-7 auto-applies on `condition === null` alone,
  // this guard counted `condition === null && applies_to`, and a consumer filtering on both
  // would drop the difference reporting nothing (B-278). Print the split; the SEMANTIC answer
  // for anchorless entries is B-222's combined certification lap to make, not this guard's.
  let conditionless = 0;
  let notCertified = 0;
  const anchorless = [];

  // R-M12B-56 (f100-m12-build-card ADDENDUM 19; R-M12B-46's form): the shapes the 5b-3 modification lines brought onto
  // ATTACHMENT rows (R-M12B-53, R-M12C-98), admitted on attachment rows ONLY — each is bitten on a GEAR row below:
  //   (a) a symbol row (the schema's exactly-one-of die|symbol): advantage 10, threat 1, success 1;
  //   (b) die `ability` + direction `upgrade` (the schema's existing ability member), on these six line keys alone;
  //   (c) applies_to {scope: host_item} (MV1).
  const ATT_SYMBOLS = new Set(['success', 'advantage', 'threat', 'triumph']);
  const ATT_ABILITY_UPGRADE = new Set(['droid_targeting_system/b0', 'optical_camouflage_system/b0',
    'reflec_adaptive_skin/b0', 'scannerweave/b0', 'tracking_system/b1', 'water_reclamation_suit/b0']);
  const fromKey = (id, pm) => pm.from ? `${id}/${pm.from.channel[0]}${pm.from.index}` : null;
  const attAbilityUpgrade = (rname, id, pm) => rname === 'attachments' && pm.die === 'ability' && pm.direction === 'upgrade'
    && ATT_ABILITY_UPGRADE.has(fromKey(id, pm));
  function shapeRefusals(rname, id, i, pm) {
    const out = [];
    const where = `${rname}/${id}[${i}]`;
    const symbolRow = rname === 'attachments' && pm.die === undefined && ATT_SYMBOLS.has(pm.symbol);
    if (!VALID_DIES.has(pm.die) && !symbolRow && !attAbilityUpgrade(rname, id, pm))
      out.push(`${where}: die '${pm.die}' not in enum`);
    if ('direction' in pm && ![null, 'add', 'remove'].includes(pm.direction) && !attAbilityUpgrade(rname, id, pm))
      out.push(`${where}: direction '${pm.direction}' not in {add, remove, null}`);
    (Array.isArray(pm.applies_to) ? pm.applies_to : []).forEach((a, k) => {
      if (a && typeof a === 'object' && !['skill', 'group', 'characteristic', 'all'].includes(a.scope)
          && !(rname === 'attachments' && a.scope === 'host_item'))
        out.push(`${where}.applies_to[${k}]: scope '${a.scope}' invalid`);
    });
    return out;
  }

  function checkPoolMods(registry, rname, expectFrom) {
    for (const [id, item] of Object.entries(registry)) {
      for (const [i, pm] of (item.pool_mods || []).entries()) {
        counts[rname]++;

        fails.push(...shapeRefusals(rname, id, i, pm));
        if (typeof pm.count !== 'number' || pm.count < 1 || !Number.isInteger(pm.count))
          fails.push(`${rname}/${id}[${i}]: count ${pm.count} not a positive integer`);

        // R-PCH-1: applies_to is a UNIFORM ARRAY with OR semantics — the modifier applies to a
        // check matching ANY member. null still means "no anchor recorded" and is deliberately
        // NOT the same as [], which would assert "applies to nothing" (B-278's population).
        const at = pm.applies_to;
        if (at !== null && at !== undefined) {
          if (!Array.isArray(at)) {
            fails.push(`${rname}/${id}[${i}]: applies_to must be an ARRAY since R-PCH-1 (got ${typeof at})`);
          } else if (at.length === 0) {
            fails.push(`${rname}/${id}[${i}]: applies_to is an EMPTY array — use null for "no anchor recorded" (R-PCH-1)`);
          } else {
            at.forEach((a, k) => {
              const where = `${rname}/${id}[${i}].applies_to[${k}]`;
              if (!a || typeof a !== 'object' || Array.isArray(a)) {
                fails.push(`${where}: anchor is not an object`);
                return;
              }
              if (a.scope === 'skill' && !skillIds.has(a.value))
                fails.push(`${where}: skill '${a.value}' not in skills.vocab`);
              if (a.scope === 'group' && !groups.has(a.value))
                fails.push(`${where}: group '${a.value}' not in vocab groups`);
              // R-PBS-2: characteristic scope, value = a characteristics.vocab id
              if (a.scope === 'characteristic' && !charIds.has(a.value))
                fails.push(`${where}: characteristic '${a.value}' not in characteristics.vocab`);
            });
            const seen = at.map(a => `${a && a.scope}:${a && a.value}`);
            if (new Set(seen).size !== seen.length)
              fails.push(`${rname}/${id}[${i}]: applies_to repeats an anchor — OR semantics make a duplicate meaningless`);
          }
        }

        if (expectFrom && !pm.from)
          fails.push(`${rname}/${id}[${i}]: missing from pointer`);
        if (!expectFrom && pm.from)
          fails.push(`${rname}/${id}[${i}]: unexpected from pointer on weapon`);

        // R-PCA-1 / R-PCH-2: CERTIFICATION IS CARRIED BY `direction`. Non-null = walked to its
        // authored sentence and settled, so it may auto-apply when unconditional. null =
        // NOT-CERTIFIED: displays only, never applies. The field is REQUIRED so that "not yet
        // walked" cannot masquerade as "nothing to say".
        if (!('direction' in pm))
          fails.push(`${rname}/${id}[${i}]: no 'direction' — every entry states its certification (R-PCA-1)`);
        if (pm.direction === null) notCertified++;

        if (pm.condition === null) {
          conditionless++;
          // R-M12B-63: an attachment row auto-applies only once R1 carries it, with M12's key ON — counted DARK, apart
          if (pm.direction !== null && pm.direction !== undefined) {
            if (rname === 'attachments') autoApplyDark.push(fromKey(id, pm)); else autoApply++;
          }
          else anchorless.push(`${rname}/${id}[${i}]: ${pm.count}x ${pm.die} — NOT-CERTIFIED, displays only`);
        }
      }
    }
  }

  checkPoolMods(gear, 'gear', true);
  checkPoolMods(armor, 'armor', true);
  checkPoolMods(attachments, 'attachments', true);
  checkPoolMods(weapons, 'weapons', false);

  const total = counts.gear + counts.armor + counts.attachments + counts.weapons;
  console.log(`  [1] pool_mods: ${total} total (gear:${counts.gear} att:${counts.attachments} wpn:${counts.weapons} arm:${counts.armor})`);
  console.log(`  [2] conditionless: ${conditionless}`
    + ` = AUTO-APPLYING ${autoApply} + dark (attachments, key ON) ${autoApplyDark.length} + not-certified ${anchorless.length}`);
  console.log(`      NOT-CERTIFIED overall: ${notCertified} of ${total} (display only — R-PCA-1)`);
  if (anchorless.length) {
    console.log(`      conditionless but NOT certified, so they still never apply:`);
    for (const a of anchorless) console.log(`        ${a}`);
  }
  // R-PBS-3 population pin: the NOT-A-MODIFIER removals must not creep back in silently. Re-pinned 212 → 268 by R-M12B-56
  // (f100-m12-build-card ADDENDUM 19): the +56 are the 5b-3 attachment rows, named here by their `from` key (54 lines;
  // heating_system/b0 and thermal_shielding_system/b0 carry two rows each). Re-pinned 268 → 267: B-1068 removed Spore/B's
  // NOT-A-MODIFIER row (`f100-triage-census-card` ADDENDUM 10/11, the M12 runner).
  const PINNED_TOTAL = 267;
  const PINNED_ATTACHMENT_LINES = ["accu_strike_integrated_targeting_computer/b0", "amphibious_modification/b1", "augmented_spin_barrel/b1", "bantha_s_eye_laser_sight/b0", "blaster_actuating_module/b1", "built_in_blaster_sight/b0", "curved_hilt/b0", "custom_fit/a0", "custom_fit/b0", "custom_grip/b0", "droid_targeting_system/a0", "droid_targeting_system/b0", "energy_overclock_setting/a0", "enhanced_optics_suite/b0", "filed_front_sight/a0", "filed_front_sight/b0", "forearm_grip/b0", "galven_pattern_resequencing/b1", "h9_pistol_grip/b1", "heating_system/b0", "in_helmet_scanner/b0", "integrated_illuminator/b0", "integrated_scanner/a0", "integrated_scanner/b1", "jump_boots/a0", "jump_boots/b0", "kiirium_coating/a0", "low_friction_coating/b1", "motion_tracker/b0", "multi_optic_sight/b0", "night_vision_scope/b0", "nishalorite_stone/b4", "omniscan_3_integrated_scanner/b1", "optical_camouflage_system/b0", "radiation_shielding/b0", "reflec_adaptive_skin/a0", "reflec_adaptive_skin/b0", "reflec_shadowskin/b0", "removed_safety_features/b0", "scannerweave/b0", "seeker_crystal/b4", "sensor_unit/b0", "set_trigger/a0", "shortened_barrel/b0", "telescopic_optical_sight/b0", "temperature_control_unit/b0", "thermal_shielding_system/b0", "thisspiasian_stabilizing_coils/b0", "threat_monitor/a1", "threat_monitor/b0", "tracking_system/b1", "utility_arm/a0", "utility_arm/b1", "water_reclamation_suit/b0"];
  if (total !== PINNED_TOTAL)
    fails.push(`population moved: ${total} pool_mods, pinned at ${PINNED_TOTAL} post-certification `
      + `(R-PBS-3 removed 13 NOT-A-MODIFIER entries; R-M12B-56 added the 56 attachment rows — a change here needs a ruling, not a re-pin)`);
  const attLines = [...new Set(Object.entries(attachments).flatMap(([id, it]) => (it.pool_mods || []).map((pm) => fromKey(id, pm))))].sort();
  if (counts.attachments !== 56 || attLines.join() !== PINNED_ATTACHMENT_LINES.join())
    fails.push(`the attachment rows are not the 56 named by from key (R-M12B-56): ${counts.attachments} rows on ${attLines.length} lines`);
  // R-M12B-56's bites: each admitted shape planted on a GEAR row is refused
  const plant = [
    ['symbol row', { symbol: 'advantage', count: 1, direction: 'add', applies_to: [{ scope: 'all' }] }],
    ['ability upgrade', { die: 'ability', count: 1, direction: 'upgrade', applies_to: [{ scope: 'all' }], from: { channel: 'base_mods', index: 0 } }],
    ['host_item scope', { die: 'boost', count: 1, direction: 'add', applies_to: [{ scope: 'host_item' }] }],
  ];
  plant.forEach(([what, pm]) => {
    const got = shapeRefusals('gear', 'droid_targeting_system', 0, pm);
    if (!got.length) fails.push(`bite: a ${what} planted on a gear row is NOT refused (R-M12B-56)`);
    console.log(`  [1b] bite: a ${what} on a gear row → ${got.length ? 'refused' : 'ADMITTED'}`);
  });

  // ── THE AUTO-APPLY PIN (Phase B, R-PCA-2) ──────────────────────────────────────────────────
  // Until this lap, `autoApply` was REPORTED and nothing consumed it: a wrong number was a wrong
  // report. Now the consumers apply exactly this set, so a drift here is a change to WHAT PLAYERS
  // ROLL — silent at every surface, because the dice would still render, just wrongly. That makes
  // it the same class as the population pin above and it is pinned the same way.
  //
  // 19 is the walk's own answer, corrected mid-lap from a projected "3 to 11" when the condition
  // extractor was found slicing from the anchor phrase (ruling `pool-mods-phase-b-scope`
  // CORRECTION). A change to this number is a change to the certified data and needs a ruling —
  // never a re-pin to whatever the registries happen to say today.
  const PINNED_AUTO_APPLY = 19;
  if (autoApply !== PINNED_AUTO_APPLY)
    fails.push(`AUTO-APPLY set moved: ${autoApply} entries now move dice, pinned at ${PINNED_AUTO_APPLY} `
      + `(R-PCA-2 — the consumers apply exactly this set, so this is a change to what players roll)`);
  // R-M12B-63 (f100-m12-build-card ADDENDUM 20): the DARK auto-apply set — attachment rows with an explicit null
  // condition, which R1 carries only with M12's key ON. Named by from key; a change is a change to what players roll.
  const PINNED_AUTO_APPLY_DARK = ["blaster_actuating_module/b1", "custom_fit/a0", "custom_fit/b0", "custom_grip/b0", "energy_overclock_setting/a0", "galven_pattern_resequencing/b1", "reflec_shadowskin/b0", "sensor_unit/b0", "thisspiasian_stabilizing_coils/b0", "utility_arm/a0", "utility_arm/b1"];
  if (autoApplyDark.slice().sort().join() !== PINNED_AUTO_APPLY_DARK.join())
    fails.push(`DARK AUTO-APPLY set moved: [${autoApplyDark.sort()}], pinned at the ${PINNED_AUTO_APPLY_DARK.length} named (R-M12B-63)`);
  console.log(`  [2b] AUTO-APPLY live ${autoApply} + dark ${autoApplyDark.length} (attachment rows, key ON, R-M12B-63)`);

  // demon_mask must NOT have pool_mods (R-DPS-3)
  if (gear.demon_mask && gear.demon_mask.pool_mods) {
    fails.push('gear/demon_mask: has pool_mods (should be unstructured per R-DPS-3)');
  }
  console.log(`  [3] demon_mask: ${gear.demon_mask ? 'exists' : 'missing'}, pool_mods: ${gear.demon_mask?.pool_mods ? 'PRESENT (bad)' : 'absent (correct)'}`);

  // weapon effects enum
  let effCount = 0;
  let nmCount = 0;
  for (const [id, w] of Object.entries(weapons)) {
    for (const eff of (w.effects || [])) {
      effCount++;
      if (!VALID_EFFECT_TYPES.has(eff.type))
        fails.push(`weapons/${id}: effect type '${eff.type}' not in ${N_EFFECT_TYPES}-value enum`);
    }
    if (w.never_modelled !== undefined) {
      nmCount++;
      if (!VALID_NM.has(w.never_modelled))
        fails.push(`weapons/${id}: never_modelled '${w.never_modelled}' not in 4-value enum`);
    }
  }
  console.log(`  [4] weapon effects: ${effCount} effects[], ${nmCount} never_modelled`);

  // mod objects: effect.type and never_modelled enum validation (C-IES-2 + C-IGA)
  const modEffCounts = { gear: 0, armor: 0, attachments: 0 };
  const modNmCounts = { gear: 0, armor: 0, attachments: 0 };
  const modDescOnly = { gear: 0, armor: 0, attachments: 0 };
  let dpTagCount = 0;
  for (const [rname, registry] of [['gear', gear], ['armor', armor], ['attachments', attachments]]) {
    for (const [id, item] of Object.entries(registry)) {
      for (const [mi, mod] of [...(item.base_mods || []), ...(item.added_mods || [])].entries()) {
        if (mod.effect) {
          modEffCounts[rname]++;
          if (!VALID_EFFECT_TYPES.has(mod.effect.type))
            fails.push(`${rname}/${id}/mod[${mi}]: effect.type '${mod.effect.type}' not in ${N_EFFECT_TYPES}-value enum`);
          if (mod.effect.type === 'dicepool') dpTagCount++;
        }
        if (mod.never_modelled !== undefined) {
          modNmCounts[rname]++;
          if (!VALID_NM.has(mod.never_modelled))
            fails.push(`${rname}/${id}/mod[${mi}]: never_modelled '${mod.never_modelled}' not in 4-value enum`);
        }
        if (mod.description && !mod.effect && mod.never_modelled === undefined)
          modDescOnly[rname]++;
      }
    }
  }
  // R-M12B-46's bite, re-pointed by R-M12B-54 and then QS2 (ADDENDUM 22): the enum is exactly the eighteen, and without each of the four M12 values
  // the lines it was admitted for are refused, BY LINE KEY — so the re-point names its users, not only a count; an
  // unknown value planted on a line is refused
  const USERS = {
    // the 5 reducers' base lines (B-1204) + the 9 SUBQUAL* options (5b-3)
    // RE-POINTED by release-r7-bug-burndown ADDENDUM 37 D-R7GD1 (a): 'corrupted_crystal/a3' DROPPED — B-1466 withdrew that
    // option (Disciples of Harmony p.52 prints three; OggDude's fourth, Vicious −2, is not printed). KEEPS every other user.
    qualities_reduce: ['balanced_barrel/a0', 'bipod_mount/b0', 'cracked_jedha_crystal/a2',
      'flickerphase_blade/a0', 'gyrostabilizer/a0', 'gyrostabilizer/b0', 'rapid_recharge_xciter/a0',
      'staged_rocket_booster/a1', 'tripod_mount/a0', 'tripod_mount/b0', 'walking_stick_hilt_disguise/a0',
      'weapon_harness/b0', 'weapon_sling/b0',
      // RE-POINTED by card `release-r5-attachments` C3 (KEEPS the 14 above; ADDS the 26 held-from-print records' three
      // "Decrease … quality by 1" lines; DROPS nothing)
      'augmented_vibro_motor/a2', 'hair_trigger/a0', 'insulated_firing_mechanism/a0'],
    item_character_effect: ['biofeedback_system/b0', 'enhanced_optics_suite/a0', 'low_friction_coating/a0',
      'mk_iii_modular_backpack_accessory_pouch/a0', 'modular_backpack_accessory_pouch/a0', 'multi_optic_sight/a0',
      'omniscan_3_integrated_scanner/a0', 'optical_camouflage_system/a1', 'repulsor_assisted_lifting/a0',
      'repulsor_assisted_lifting/a1', 'sonic_scope/a0', 'sonic_scope/a1', 'strength_enhancing_system/a0',
      'strength_enhancing_system/b0', 'tracking_system/a0', 'tracking_system/a1',
      // RE-POINTED by card `release-r5-attachments` C3 (KEEPS the 16 above; ADDS the held-from-print records' six "1 Skill
      // (X) Mod" lines; DROPS nothing)
      'clone_polarized_electrobinoculars/a0', 'physiological_enhancement_system/a0', 'physiological_enhancement_system/a1',
      'physiological_enhancement_system/a2', 'squad_tactical_systems/a0', 'squad_tactical_systems/a1'],
    host_hard_points_delta: ['component_alteration_gear/b5', 'component_alteration_weapon/b5',
      'concealment_alteration_gear/b2', 'concealment_alteration_weapon/b2',
      'lightsaber_hilt_construction_modifications/a0', 'lightsaber_hilt_construction_modifications/a1'],
    // QS2 (ADDENDUM 22, R-M12B-70): "{1} Takes 1 Less [AD] to Activate", key any
    spend_cost_delta: ['jury_rigged_weapon/a3'],
  };
  const refusedBy = (enumSet, reg) => {
    const out = [];
    for (const [id, it] of Object.entries(reg)) {
      for (const side of ['base_mods', 'added_mods']) {
        (it[side] || []).forEach((m, i) => {
          if (m.effect && !enumSet.has(m.effect.type)) out.push(`${id}/${side[0]}${i}`);
        });
      }
    }
    return out.sort();
  };
  if (N_EFFECT_TYPES !== 18) fails.push(`effect-type enum holds ${N_EFFECT_TYPES}, not the ruled 18 (R-M12B-54 + QS2, ADDENDUM 22)`);
  for (const [t, users] of Object.entries(USERS)) {
    const refused = refusedBy(new Set([...VALID_EFFECT_TYPES].filter((x) => x !== t)), attachments);
    if (refused.join() !== [...users].sort().join())
      fails.push(`bite: without ${t} the enum refuses [${refused}], not its ${users.length} users`);
    console.log(`  [5b] bite: without ${t} the enum refuses ${refused.length} line(s), its ${users.length} named users`);
  }
  const planted = { x: { base_mods: [{ description: 'planted', effect: { type: 'no_such_effect' } }] } };
  const plantedRefused = refusedBy(VALID_EFFECT_TYPES, planted);
  if (plantedRefused.join() !== 'x/b0') fails.push('bite: an unknown effect type planted on a line is NOT refused');
  console.log(`  [5b] bite: enum ${N_EFFECT_TYPES}; a planted unknown type is refused: ${plantedRefused.join()}`);
  const totalModEff = modEffCounts.gear + modEffCounts.armor + modEffCounts.attachments;
  const totalModNm = modNmCounts.gear + modNmCounts.armor + modNmCounts.attachments;
  const totalDescOnly = modDescOnly.gear + modDescOnly.armor + modDescOnly.attachments;
  console.log(`  [5] mod effect.type: ${totalModEff} (gear:${modEffCounts.gear} arm:${modEffCounts.armor} att:${modEffCounts.attachments}), dicepool tags: ${dpTagCount}`);
  console.log(`  [6] mod never_modelled: ${totalModNm} (gear:${modNmCounts.gear} arm:${modNmCounts.armor} att:${modNmCounts.attachments})`);
  console.log(`  [7] mod desc-only (no effect, no never_modelled): ${totalDescOnly} (gear:${modDescOnly.gear} arm:${modDescOnly.armor} att:${modDescOnly.attachments})`);
  if (totalDescOnly > 0)
    fails.push(`${totalDescOnly} mod objects have description but no effect or never_modelled`);

  console.log('');
  if (fails.length) {
    console.log(`HARD FAILS: ${fails.length}`);
    for (const f of fails) console.log(`  ✗ ${f}`);
    process.exit(1);
  } else {
    console.log('0 HARD — all pool_mods in-enum, applies_to anchored, mod effect/never_modelled in-enum, 0 desc-only');
    process.exit(0);
  }
}

main();
