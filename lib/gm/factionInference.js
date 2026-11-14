/**
 * factionInference.js — Pure faction interest inference engine.
 *
 * Takes a McGuffin profile (type, origin, sensitivity) and a planet
 * data object. Returns a prioritized faction interest list showing
 * which factions care about this McGuffin and why.
 *
 * No DOM. No fetch. No async. No dependencies.
 * Data files are passed as parameters.
 */

var VALID_TYPES = ['data', 'artifact', 'weapon', 'resource', 'person', 'leverage', 'technology'];
var VALID_ORIGINS = ['imperial', 'criminal', 'force', 'civilian', 'ancient'];
var VALID_SENSITIVITIES = ['unknown', 'rumored', 'known', 'contested'];

var INTEREST_ORDER = { high: 0, moderate: 1, low: 2, conditional: 3 };

function inferFactionInterest(mcguffin, planetData, mcguffinTypesData, sessionState) {
  // Validate inputs
  var invalidFields = [];
  if (!mcguffin || typeof mcguffin !== 'object') return { error: 'Invalid mcguffin profile', invalid_fields: ['mcguffin'] };
  if (VALID_TYPES.indexOf(mcguffin.type) < 0) invalidFields.push('type');
  if (VALID_ORIGINS.indexOf(mcguffin.origin) < 0) invalidFields.push('origin');
  if (VALID_SENSITIVITIES.indexOf(mcguffin.sensitivity) < 0) invalidFields.push('sensitivity');
  if (invalidFields.length > 0) return { error: 'Invalid mcguffin profile', invalid_fields: invalidFields };
  if (!planetData) return { error: 'Missing planet data', invalid_fields: ['planetData'] };
  if (!mcguffinTypesData) return { error: 'Missing mcguffin types data', invalid_fields: ['mcguffinTypesData'] };

  // Build planet faction ID set
  var planetFactions = {};
  var factions = planetData.factions || [];
  for (var i = 0; i < factions.length; i++) {
    var fid = factions[i].id || factions[i].faction_id || '';
    planetFactions[fid] = factions[i].name || fid;
  }
  // Also check encounter_population for faction_ids
  var ep = planetData.encounter_population || [];
  for (var i = 0; i < ep.length; i++) {
    if (ep[i].faction_id && !planetFactions[ep[i].faction_id]) {
      planetFactions[ep[i].faction_id] = ep[i].faction_id;
    }
  }

  var interested = {}; // faction_id -> { faction_name, interest_level, reasons[], likely_moves[], source }
  var incomingThreats = [];

  // ── Pass 1: Direct type interest ──
  var typeEntry = null;
  var types = mcguffinTypesData.types || [];
  for (var i = 0; i < types.length; i++) {
    if (types[i].id === mcguffin.type) { typeEntry = types[i]; break; }
  }
  if (typeEntry) {
    var standing = typeEntry.standing_interest || [];
    for (var i = 0; i < standing.length; i++) {
      var si = standing[i];
      if (planetFactions[si.faction_id]) {
        interested[si.faction_id] = {
          faction_id: si.faction_id,
          faction_name: planetFactions[si.faction_id],
          interest_level: si.interest_level,
          reasons: [si.reason],
          likely_moves: [],
          source: 'direct_type'
        };
      }
    }
  }

  // ── Pass 2: Origin escalation ──
  var originEntry = null;
  var origins = mcguffinTypesData.origins || [];
  for (var i = 0; i < origins.length; i++) {
    if (origins[i].id === mcguffin.origin) { originEntry = origins[i]; break; }
  }
  if (originEntry) {
    var escalations = originEntry.escalation || [];
    for (var i = 0; i < escalations.length; i++) {
      var esc = escalations[i];
      if (planetFactions[esc.faction_id]) {
        if (interested[esc.faction_id]) {
          // Upgrade to high
          interested[esc.faction_id].interest_level = 'high';
          interested[esc.faction_id].reasons.push(esc.effect);
        } else {
          interested[esc.faction_id] = {
            faction_id: esc.faction_id,
            faction_name: planetFactions[esc.faction_id],
            interest_level: 'high',
            reasons: [esc.effect],
            likely_moves: [],
            source: 'origin_escalation'
          };
        }
      }
    }
  }

  // ── Pass 3: Sensitivity alert ──
  var sensitivityEntry = null;
  var sensitivities = mcguffinTypesData.sensitivities || [];
  for (var i = 0; i < sensitivities.length; i++) {
    if (sensitivities[i].id === mcguffin.sensitivity) { sensitivityEntry = sensitivities[i]; break; }
  }
  if (sensitivityEntry) {
    var alerts = sensitivityEntry.galaxy_alert || [];
    for (var i = 0; i < alerts.length; i++) {
      var alert = alerts[i];
      if (planetFactions[alert.faction_id]) {
        if (interested[alert.faction_id]) {
          interested[alert.faction_id].reasons.push(alert.effect);
        } else {
          interested[alert.faction_id] = {
            faction_id: alert.faction_id,
            faction_name: planetFactions[alert.faction_id],
            interest_level: 'moderate',
            reasons: [alert.effect],
            likely_moves: [],
            source: 'sensitivity_alert'
          };
        }
      }
    }
  }

  // ── Pass 4: Incoming threats ──
  var galaxyInterest = mcguffinTypesData.galaxy_faction_interest || [];
  for (var i = 0; i < galaxyInterest.length; i++) {
    var gi = galaxyInterest[i];
    // Check dispatch trigger conditions
    var triggered = false;

    if (gi.faction_id === 'imperial_military') {
      if ((mcguffin.origin === 'imperial' && mcguffin.sensitivity === 'known') ||
          (mcguffin.origin === 'imperial' && mcguffin.sensitivity === 'contested') ||
          (mcguffin.origin === 'force' && mcguffin.sensitivity === 'known') ||
          (mcguffin.origin === 'force' && mcguffin.sensitivity === 'contested')) {
        triggered = true;
      }
    }

    if (gi.faction_id === 'knights_of_ren') {
      if ((mcguffin.origin === 'force' || mcguffin.origin === 'ancient') &&
          mcguffin.sensitivity !== 'unknown') {
        triggered = true;
      }
    }

    // Only add as incoming if NOT already on planet
    if (triggered && !planetFactions[gi.faction_id]) {
      incomingThreats.push({
        faction_id: gi.faction_id,
        faction_name: gi.faction_id,
        trigger: gi.dispatch_trigger,
        clock: gi.dispatch_clock,
        dispatch_type: gi.dispatch_type
      });
    }
  }

  // ── Pass 5: Rebel cell check ──
  var rebelCell = null;
  if (sessionState) {
    // Check campaign_state presets for AoR flags
    var cs = planetData.campaign_state || {};
    var presets = cs.presets || {};
    var flags = cs.flags || [];

    // Check presets
    for (var key in presets) {
      if (key.toLowerCase().indexOf('aor') >= 0) {
        var preset = presets[key];
        var presetFlags = preset.flags || [];
        for (var j = 0; j < presetFlags.length; j++) {
          if (presetFlags[j].toLowerCase().indexOf('rebel') >= 0 ||
              presetFlags[j].toLowerCase().indexOf('safehouse') >= 0 ||
              presetFlags[j].toLowerCase().indexOf('cell') >= 0) {
            rebelCell = { present: true, notes: presetFlags[j] };
            break;
          }
        }
        if (rebelCell) break;
      }
    }

    // Also check top-level flags
    if (!rebelCell) {
      for (var j = 0; j < flags.length; j++) {
        if (flags[j].toLowerCase().indexOf('rebel') >= 0) {
          rebelCell = { present: true, notes: flags[j] };
          break;
        }
      }
    }
  }

  // ── Sort results ──
  var interestedArray = [];
  for (var fid in interested) {
    interestedArray.push(interested[fid]);
  }
  interestedArray.sort(function(a, b) {
    var levelDiff = (INTEREST_ORDER[a.interest_level] || 9) - (INTEREST_ORDER[b.interest_level] || 9);
    if (levelDiff !== 0) return levelDiff;
    return b.reasons.length - a.reasons.length;
  });

  return {
    mcguffin: mcguffin,
    planet_id: planetData.id || '',
    generated_at: new Date().toISOString(),
    interested_factions: interestedArray,
    incoming_threats: incomingThreats,
    rebel_cell: rebelCell
  };
}
