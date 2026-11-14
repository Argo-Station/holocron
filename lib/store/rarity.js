/* lib/store/rarity.js — the RAW find-an-item difficulty logic, shared by the player store kernel
 * (lib/store/view.jsx) and the GM availability tool (ITM-B, gm/app.jsx). ONE cited source of the
 * Table 5-1 / 5-2 rules (no-compromise-reimplementation law).
 *
 * RAW (EotE CRB, printed pages; verified this arc — see Docs/RULES_FOUNDATION_ITEMS.md §4):
 *   - Finding an item = a check whose difficulty is set by the item's (modified) rarity — Table 5-1
 *     (p.150). Skill = Negotiation; Restricted/(R) items are black market → Streetwise (p.149-150).
 *   - Location shifts effective rarity by −2…+4 — Table 5-2, keyed to WORLD CIRCUMSTANCE (p.150).
 *   - Modified rarity above 10 stays Formidable; the GM may upgrade the difficulty once per point
 *     beyond 10 (p.150).
 * Band edges verified empirically against Table 5-1's own example items in our registries
 * (Glow Rod 0 → Simple … Thermal Detonator 8 → Daunting).
 *
 * Classic script (no framework) → window.SWRPGRarity. NOTE: the GM shop GENERATOR
 * (lib/shopGenerator.js rarityToDifficulty) is the RAW-DIVERGENT legacy math (harsher on odd
 * rarities) used to compose the generated shop — its convergence onto THIS module is D-RF3
 * (deferred, its own pass). ITM-B's difficulty CHIP is a cited display and uses THIS RAW module.
 */
(function (global) {
  'use strict';

  // Table 5-1 — (modified) rarity → find-check difficulty. `color` is the store's rarity language.
  var RARITY_BANDS = [
    { min: 0,  max: 1,  label: 'SIMPLE',     dice: 0, color: '#8F98A8' },
    { min: 2,  max: 3,  label: 'EASY',       dice: 1, color: '#E6ECF2' },
    { min: 4,  max: 5,  label: 'AVERAGE',    dice: 2, color: '#3ECFB2' },
    { min: 6,  max: 7,  label: 'HARD',       dice: 3, color: '#C6A0FF' },
    { min: 8,  max: 9,  label: 'DAUNTING',   dice: 4, color: '#FFC857' },
    { min: 10, max: 99, label: 'FORMIDABLE', dice: 5, color: '#FF6B6B' },
  ];

  // Table 5-2 — world-circumstance rarity modifiers (−2…+4), cited data for a future RAW-conformant
  // location control (D-RF3). Present + cited now; the current GM location control still uses the
  // legacy galaxy-region model (lib/shopGenerator.js REGION_MODIFIERS) until D-RF3 converges it.
  var LOCATION_MODIFIERS = [
    { id: 'primary_core',   label: 'Primary Core world',      mod: -2 },
    { id: 'other_core',     label: 'Other Core world',        mod: -1 },
    { id: 'primary_lane',   label: 'Primary trade-lane world', mod: -1 },
    { id: 'mid_rim',        label: 'Mid Rim world',           mod: 1 },
    { id: 'recently_settled', label: 'Recently-settled world', mod: 1 },
    { id: 'outer_rim',      label: 'Outer Rim world',         mod: 2 },
    { id: 'frontier',       label: 'Frontier world',          mod: 2 },
    { id: 'wild_space',     label: 'Wild Space world',        mod: 3 },
    { id: 'uncivilized',    label: 'Uncivilized world',       mod: 4 },
  ];

  var FIND_CITE = 'EotE CRB p.150';

  // A neutral "settled space" circumstance (mod 0) — Table 5-2 lists only the special circumstances;
  // a world matching none takes the base rarity. This is the picker's clear/default option.
  var NEUTRAL_CIRCUMSTANCE = { id: 'settled', label: 'Settled space', mod: 0 };

  // Bridge: a planet's GALAXY REGION (from the planet registry) → the nearest RAW WORLD-CIRCUMSTANCE
  // (STORE-UNIFY, transplanted + RAW-mapped from the dying generator's REGION_MODIFIERS). This is a
  // best-effort SUGGESTED default — the picker's manual Table 5-2 rows are the RAW-direct override
  // (RAW's "the GM decides" posture). A primary Core capital is a GM override to primary_core (−2).
  var REGION_TO_CIRCUMSTANCE = {
    'Deep Core':          'other_core',    // -1
    'Core':               'other_core',    // -1 (primary-Core capital → primary_core via override)
    'Core Worlds':        'other_core',
    'Colonies':           'other_core',    // -1, settled near-Core
    'Inner Rim':          'settled',       //  0, settled space, no special circumstance
    'Expansion Regions':  'settled',       //  0
    'Expansion Region':   'settled',
    'Mid Rim':            'mid_rim',       // +1
    'Hutt Space':         'outer_rim',     // +2, lawless outer territory
    'Outer Rim':          'outer_rim',     // +2
    'Outer Rim Territories': 'outer_rim',
    'Wild Space':         'wild_space',    // +3
    'Unknown Regions':    'uncivilized',   // +4
  };

  function circumstanceById(id) {
    if (id === NEUTRAL_CIRCUMSTANCE.id) return NEUTRAL_CIRCUMSTANCE;
    for (var i = 0; i < LOCATION_MODIFIERS.length; i++) {
      if (LOCATION_MODIFIERS[i].id === id) return LOCATION_MODIFIERS[i];
    }
    return NEUTRAL_CIRCUMSTANCE;
  }
  function circumstanceForRegion(region) {
    return circumstanceById(REGION_TO_CIRCUMSTANCE[region] || 'settled');
  }
  // The effective location modifier: the circumstance's mod, plus −1 if on a primary trade lane
  // (Table 5-2 "primary trade-lane world" −1, stacking with the world circumstance per RAW).
  function locationModifier(circumstance, tradeLane) {
    var base = (circumstance && typeof circumstance.mod === 'number') ? circumstance.mod : 0;
    return base + (tradeLane ? -1 : 0);
  }

  function rarityBand(r) {
    if (r == null || isNaN(Number(r))) return null;   // R-ITM5 fallback: never a silent undefined
    var n = Number(r);
    for (var i = 0; i < RARITY_BANDS.length; i++) {
      if (n >= RARITY_BANDS[i].min && n <= RARITY_BANDS[i].max) return RARITY_BANDS[i];
    }
    return null;
  }

  // The full find-an-item readout for a (modified) rarity: difficulty band + dice count + the skill
  // (Streetwise for Restricted/black-market, else Negotiation) + the cite. null rarity → null.
  function findDifficulty(rarity, restricted) {
    var band = rarityBand(rarity);
    if (!band) return null;
    return {
      dice: band.dice,
      label: band.label,
      color: band.color,
      skill: restricted ? 'STREETWISE' : 'NEGOTIATION',
      blackMarket: !!restricted,
      cite: FIND_CITE,
    };
  }

  global.SWRPGRarity = {
    RARITY_BANDS: RARITY_BANDS,
    LOCATION_MODIFIERS: LOCATION_MODIFIERS,
    NEUTRAL_CIRCUMSTANCE: NEUTRAL_CIRCUMSTANCE,
    REGION_TO_CIRCUMSTANCE: REGION_TO_CIRCUMSTANCE,
    FIND_CITE: FIND_CITE,
    rarityBand: rarityBand,
    findDifficulty: findDifficulty,
    circumstanceById: circumstanceById,
    circumstanceForRegion: circumstanceForRegion,
    locationModifier: locationModifier,
  };
})(typeof window !== 'undefined' ? window : this);
