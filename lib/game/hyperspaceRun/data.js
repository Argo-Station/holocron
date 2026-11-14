/**
 * Hyperspace Run — content data (ships, contracts, events, constants).
 * Pure data + a few tuning constants. No logic. See Docs/HYPERSPACE_RUN_SPEC.md.
 *
 * BALANCE NOTE: every number here is a tuning knob, not RAW gospel. Ship STAT
 * SHAPES are from public/data/vehicle-library (RAW); a few values are retuned for
 * gameplay per Jason's standing call (flagged): the Courier's drive -> Class 1,
 * the Hauler's cargo 10000 -> 800. Prices, the starting purse, payouts, and
 * deadlines are game-balance picks made for this MVP and meant to be tuned after
 * playtest.
 */

var STARTING_CREDITS = 250000;
var LATE_PENALTY_PER_DAY = 0.10;   // payout -10% per day late...
var PAYOUT_FLOOR = 0.0;            // ...down to 0 (contract fails past here)
var REPAIR_COST_PER_HULL = 800;    // credits to patch 1 hull at a stop
var EVENT_BASE_CHANCE = 0.30;      // flat per-leg event chance for the MVP deck

// Ship archetypes. Levers: hyperdrive_class (lower=faster), cargo_capacity
// (payout ceiling), hull/strain (survive), speed+handling (evade), silhouette
// (detection, phase 2), hard_points (upgrade slots, phase 2), price (trade-off).
var SHIPS = [
  { key: 'YT1300', name: 'YT-1300 Light Freighter', archetype: 'All-rounder',
    price: 100000, hyperdrive_class: 2, cargo_capacity: 165,
    hull_max: 22, strain_max: 15, speed: 3, handling: -1, silhouette: 4, hard_points: 6,
    blurb: 'Balanced, and the most moddable hull. The reliable smuggler classic.' },
  { key: 'HWK290', name: 'HWK-290 Light Freighter', archetype: 'Courier',
    price: 95000, hyperdrive_class: 1, cargo_capacity: 75,
    hull_max: 18, strain_max: 18, speed: 4, handling: 1, silhouette: 3, hard_points: 5,
    blurb: 'Fast and nimble with the best drive — but a tiny hold and a thin hull.' },
  { key: 'YV666', name: 'YV-666 Light Freighter', archetype: 'Gunship',
    price: 130000, hyperdrive_class: 3, cargo_capacity: 200,
    hull_max: 30, strain_max: 12, speed: 3, handling: -2, silhouette: 4, hard_points: 6,
    blurb: 'Tough and built to fight, with room to bolt on guns. Slow off the line.' },
  { key: 'ACTIONVI', name: 'Action VI Bulk Transport', archetype: 'Hauler',
    price: 200000, hyperdrive_class: 3, cargo_capacity: 800,
    hull_max: 40, strain_max: 20, speed: 2, handling: -3, silhouette: 5, hard_points: 4,
    blurb: 'A flying warehouse — huge payouts — but slow, sluggish, and easy to spot.' },
  { key: 'BARLOZ', name: 'Barloz Medium Freighter', archetype: 'Budget clunker',
    price: 60000, hyperdrive_class: 2, cargo_capacity: 170,
    hull_max: 26, strain_max: 12, speed: 3, handling: -2, silhouette: 4, hard_points: 4,
    blurb: 'Cheap and unremarkable — but the savings buy a lot of cargo and gear.' },
];

// Outfitting items (MVP: just the two safety nets; attachments are Phase 2).
var ITEMS = [
  { key: 'spare_hyperdrive', name: 'Spare Hyperdrive', price: 12000,
    blurb: 'Swap in if your drive is killed mid-run (avoids being stranded).' },
  { key: 'repair_kit', name: 'Repair Kit', price: 6000,
    blurb: 'Patch hull or clear system strain on the fly, without a costly stop.' },
];

// Contracts. origin/destination are real mapped worlds. cargo_required gates by
// hold size (small jobs fit the Courier; big jobs need the Hauler). unit_buy is
// the upfront cargo cost; payout is the on-time reward. deadline_days is tuned
// against typical route times (tighten/loosen after playtest).
// Deadlines tuned to REAL whole-route times (calculateUniversalTravelTime):
// Tat->Cor ~9/17/26 d at class 1/2/3; Tat->Cor(uscant) ~11/22/34; Nal Hutta->
// Mandalore ~17/35/52 (wild-space); Nar Shaddaa->Bespin ~24/49/73 (long). A
// good/fast ship makes the deadline with margin; a slow hull needs to push or
// gets there late. cargo_required gates by hold (the short job fits the Courier).
var CONTRACTS = [
  { id: 'ore_short', name: 'Ore Run to Corellia',
    origin: 'Tatooine', destination: 'Corellia',
    cargo_required: 60, unit_buy: 150, payout: 38000, deadline_days: 20,
    blurb: 'A light job on busy lanes. Small hold welcome — good first run.' },
  { id: 'supply_mid', name: 'Supplies to Coruscant',
    origin: 'Tatooine', destination: 'Coruscant',
    cargo_required: 140, unit_buy: 90, payout: 60000, deadline_days: 28,
    blurb: 'A solid mid-weight haul into the Core.' },
  { id: 'hot_mando', name: 'No-Questions Freight to Mandalore',
    origin: 'Nal Hutta', destination: 'Mandalore',
    cargo_required: 90, unit_buy: 200, payout: 96000, deadline_days: 42,
    blurb: 'Mandalore sits off the lanes — expect a wild-space leg. Pays well.' },
  { id: 'bulk_long', name: 'Bulk Cargo to Bespin',
    origin: 'Nar Shaddaa', destination: 'Bespin',
    cargo_required: 320, unit_buy: 80, payout: 175000, deadline_days: 58,
    blurb: 'A long, heavy haul across the galaxy. You will want a big hold.' },
];

// Event deck (MVP: flat draw; region-weighting is Phase 2). Each choice either
// applies `effects` directly, or runs a `check` (seeded chance) -> success/fail.
// effects/deltas: { credits, hull, strain, days } (added to state; negatives help).
var EVENTS = [
  { id: 'imp_patrol', title: 'Imperial Patrol', region: 'core',
    prompt: 'A patrol drops out of hyperspace and orders you to hold for inspection.',
    choices: [
      { id: 'comply', label: 'Comply (lose time)', effects: { days: 2 } },
      { id: 'bribe', label: 'Grease a palm', effects: { credits: -5000 } },
      { id: 'run', label: 'Punch it', check: { stat: 'handling', chance: 0.55,
        success: { strain: 1 }, fail: { hull: 4, days: 1 } } },
    ] },
  { id: 'pirates', title: 'Pirate Ambush', region: 'hutt',
    prompt: 'Raiders swing in, weapons hot, demanding your cargo.',
    choices: [
      { id: 'fight', label: 'Fight them off', check: { stat: 'hull', chance: 0.5,
        success: { strain: 2 }, fail: { hull: 6 } } },
      { id: 'flee', label: 'Outrun them', check: { stat: 'handling', chance: 0.5,
        success: {}, fail: { hull: 3, days: 1 } } },
      { id: 'toll', label: 'Pay the toll', effects: { credits: -8000 } },
    ] },
  { id: 'debris', title: 'Debris Field', region: 'rim',
    prompt: 'Realspace debris litters the reversion point.',
    choices: [
      { id: 'careful', label: 'Pick through carefully', effects: { days: 1 } },
      { id: 'power', label: 'Power through', check: { stat: 'handling', chance: 0.6,
        success: {}, fail: { hull: 4 } } },
    ] },
  { id: 'mynocks', title: 'Mynock Infestation', region: 'rim',
    prompt: 'Mynocks latched on during the last stop and are chewing your systems.',
    choices: [
      { id: 'clear', label: 'Clear them now', effects: { days: 1, strain: -2 } },
      { id: 'ignore', label: 'Deal with it later', effects: { strain: 3 } },
    ] },
  { id: 'distress', title: 'Distress Beacon', region: 'any',
    prompt: 'A faint distress call pings nearby. Could be salvage. Could be bait.',
    choices: [
      { id: 'investigate', label: 'Investigate', check: { stat: 'luck', chance: 0.5,
        success: { credits: 12000 }, fail: { hull: 5, days: 1 } } },
      { id: 'ignore2', label: 'Stay on course', effects: {} },
    ] },
  { id: 'customs', title: 'Customs Checkpoint', region: 'core',
    prompt: 'A sector checkpoint waves you into the inspection queue.',
    choices: [
      { id: 'wait', label: 'Wait it out', effects: { days: 2 } },
      { id: 'talk', label: 'Talk your way through', check: { stat: 'luck', chance: 0.5,
        success: {}, fail: { credits: -4000, days: 1 } } },
    ] },
];

if (typeof window !== 'undefined') {
  window.HyperRunData = {
    STARTING_CREDITS: STARTING_CREDITS, LATE_PENALTY_PER_DAY: LATE_PENALTY_PER_DAY,
    PAYOUT_FLOOR: PAYOUT_FLOOR, REPAIR_COST_PER_HULL: REPAIR_COST_PER_HULL,
    EVENT_BASE_CHANCE: EVENT_BASE_CHANCE,
    SHIPS: SHIPS, ITEMS: ITEMS, CONTRACTS: CONTRACTS, EVENTS: EVENTS,
  };
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { STARTING_CREDITS: STARTING_CREDITS, LATE_PENALTY_PER_DAY: LATE_PENALTY_PER_DAY,
    PAYOUT_FLOOR: PAYOUT_FLOOR, REPAIR_COST_PER_HULL: REPAIR_COST_PER_HULL,
    EVENT_BASE_CHANCE: EVENT_BASE_CHANCE, SHIPS: SHIPS, ITEMS: ITEMS,
    CONTRACTS: CONTRACTS, EVENTS: EVENTS };
}
