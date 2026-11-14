/**
 * travelTime.js — FFG travel time calculator.
 * Pure JS. No React. No DOM.
 *
 * Distance calibration (GDR coordinate units, Coruscant at origin):
 *   Coruscant to Tatooine ~ 840 units ~ 4-6 days
 *   Coruscant to Corellia  ~ 180 units ~ hours to 1 day
 *   Derived: ~150 units per day on well-traveled lane
 */

var UNITS_PER_DAY = {
  well_traveled: 150,
  minor: 100,
  uncharted: 60,
  wild_space: 40
};

// RAW astrogation (ruling R-MAP3, 2026-06-13). FFG has NO route-quality ->
// difficulty table: EVERY hyperspace jump is base Easy, 1 difficulty die
// (eote p.255-256; reprint aor p.262 / fad p.251; expanded smuggler p.76). Route
// quality modifies the POOL, not the band: a well-charted lane adds a boost, stale
// or uncharted charts add a setback, and a no-route wild-space leg upgrades the
// difficulty once (Easy -> Average) and adds a setback. Hardest leg on a mixed
// path dominates. (Replaces the retired house ASTROGATION_DIFFICULTY band table
// that read well_traveled=Easy ... wild_space=Daunting.)
function _astrogationPool(hardestQuality) {
  switch (hardestQuality) {
    case 'well_traveled':
      return { difficulty: 'Easy', difficultyDice: 1, boost: 1, setback: 0,
               reason: 'well-traveled lane', summary: 'EASY · +1 BOOST', color: '#3AFFA0' };
    case 'uncharted':
      return { difficulty: 'Easy', difficultyDice: 1, boost: 0, setback: 1,
               reason: 'uncharted — stale charts', summary: 'EASY · +1 SETBACK', color: '#3AFFA0' };
    case 'wild_space':
      return { difficulty: 'Average', difficultyDice: 2, boost: 0, setback: 1,
               reason: 'wild-space leg — no charted route', summary: 'AVERAGE · +1 SETBACK', color: '#FFC857' };
    case 'minor':
    default:
      return { difficulty: 'Easy', difficultyDice: 1, boost: 0, setback: 0,
               reason: 'charted route', summary: 'EASY', color: '#3AFFA0' };
  }
}


// UXQP-42 — travel time over a mixed path of lane + wild-space segments.
// Each segment's days are computed at its own quality's speed; the dominant
// astrogation difficulty is the HARDEST leg on the path (a single wild-space
// hop makes the whole jump Daunting — RAW-sensible: the route is only as easy
// as its worst stretch).
var _QUALITY_ORDER = ['well_traveled', 'minor', 'uncharted', 'wild_space'];

// hyperdriveClass scales the day bands per RAW: the table times assume a Class 1
// hyperdrive, and "he multiplies this travel time by the hyperdrive's Class —
// a Class 2 hyperdrive would take twice as long, a Class 3 three times, and so
// on" (eote p.247). Class affects TIME ONLY, never the astrogation pool. Defaults
// to 1 so existing callers (and the guard) are unchanged.
function calculateUniversalTravelTime(segments, hyperdriveClass) {
  var cls = (typeof hyperdriveClass === 'number' && hyperdriveClass > 0) ? hyperdriveClass : 1;
  if (!segments || !segments.length) {
    return {
      days_min: 0, days_max: 0, label: 'Same system',
      astrogation: _astrogationPool('minor'),
      dominant_quality: 'well_traveled', hasOffLane: false, hyperdrive_class: cls
    };
  }

  var rawDays = 0;
  var hardest = 'well_traveled';
  var hasOffLane = false;

  segments.forEach(function (seg) {
    var q = seg.quality || 'minor';
    var upd = UNITS_PER_DAY[q] || UNITS_PER_DAY.minor;
    rawDays += (seg.distance || 0) / upd;
    if (_QUALITY_ORDER.indexOf(q) > _QUALITY_ORDER.indexOf(hardest)) hardest = q;
    if (seg.offLane) hasOffLane = true;
  });

  rawDays *= cls;  // RAW: travel time x hyperdrive Class (eote p.247)

  var variance = hardest === 'well_traveled' ? 0.25 : 0.5;
  var rawMax = rawDays * (1 + variance);
  var totalMin = Math.max(1, Math.round(rawDays * (1 - variance)));
  var totalMax = Math.round(rawMax);

  var label;
  if (rawMax < 1) {
    label = 'Under a day';
    totalMin = 0; totalMax = 1;
  } else if (totalMin === totalMax) {
    label = '~' + totalMin + ' day' + (totalMin !== 1 ? 's' : '');
  } else {
    label = totalMin + '–' + totalMax + ' days';
  }

  return {
    days_min: totalMin, days_max: totalMax, label: label,
    astrogation: _astrogationPool(hardest),
    dominant_quality: hardest,
    hasOffLane: hasOffLane, hyperdrive_class: cls
  };
}

if (typeof window !== 'undefined') {
  window.GmTravelTime = {
    calculateUniversalTravelTime: calculateUniversalTravelTime
  };
}
