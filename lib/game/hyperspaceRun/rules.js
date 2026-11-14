/**
 * Hyperspace Run — pure rules engine (state machine + leg/event resolution).
 * No React, no DOM. Every function takes a state (+ inputs) and returns a NEW
 * state (state is cloned, never mutated in place), so a run is deterministic from
 * its seed and fully testable (test/hyperspace_run.cjs). See HYPERSPACE_RUN_SPEC.
 *
 * Depends on window.GmPathfinding (routeUniversal/buildNavGraph),
 * window.GmTravelTime (calculateUniversalTravelTime), window.HyperRunData.
 *
 * TWO MVP DESIGN CALLS (Jason-approved 2026-06-13):
 *  1. Route choice = a *modifier on one computed route*, not a second pathfind.
 *     'direct' = base time, named for the hazard region it threads (Run Pirate
 *     Space / the Imperial Blockade / the Outer Reaches) and weighting those
 *     events; 'cautious' = +30% time, +1 boost, fewer encounters (the long way).
 *     A true all-lane alternate router is Phase 2 (routeUniversal returns the
 *     shortest incl. wild-space).
 *  2. The astrogation leg result uses a SEEDED OUTCOME MODEL (pool biases a
 *     deterministic draw into Triumph/Good/OK/Bad/Disaster) rather than rolling
 *     real SWRPGDice. Keeps the run replayable/testable; the UI can roll real
 *     dice for show and map to the same buckets.
 */
(function () {
  function D() { return window.HyperRunData; }
  function P() { return window.GmPathfinding; }
  function T() { return window.GmTravelTime; }

  function clone(s) { return JSON.parse(JSON.stringify(s)); }

  // Deterministic PRNG: value in [0,1) from (seed, cursor). Caller bumps cursor.
  function _rand(seed, cursor) {
    var t = (seed + cursor * 0x6D2B79F5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function draw(s) { return _rand(s.seed, s.rngCursor++); }

  // ── lifecycle ──
  function initRun(seed) {
    return {
      version: 1, phase: 'SHIP_SELECT', seed: (seed | 0) || 1, rngCursor: 0,
      credits: D().STARTING_CREDITS,
      ship: null, inventory: { spare_hyperdrive: 0, repair_kit: 0 },
      cargo: { units: 0, buy_price: 0 }, contract: null,
      route: { option: 'direct', hazard: { key: 'any', label: 'open space' }, legs: [], legIndex: 0 },
      clock: { days_elapsed: 0, days_left: 0 },
      pendingEvent: null, lastRoll: null, log: [], result: null,
    };
  }

  function selectShip(state, key) {
    var s = clone(state);
    var def = D().SHIPS.filter(function (x) { return x.key === key; })[0];
    if (!def) return s;
    s.ship = {
      key: def.key, name: def.name, archetype: def.archetype,
      hyperdrive_class: def.hyperdrive_class, cargo_capacity: def.cargo_capacity,
      hull_max: def.hull_max, strain_max: def.strain_max,
      speed: def.speed, handling: def.handling, silhouette: def.silhouette,
      hard_points: def.hard_points,
      hull: def.hull_max, strain: 0, hyperdrive_ok: true,
    };
    s.credits -= def.price;
    s.phase = 'OUTFIT';
    s.log.push('Bought the ' + def.name + ' for ' + def.price.toLocaleString() + ' cr.');
    return s;
  }

  function acceptContract(state, id) {
    var s = clone(state);
    var c = D().CONTRACTS.filter(function (x) { return x.id === id; })[0];
    if (!c) return s;
    s.contract = { id: c.id, name: c.name, origin: c.origin, destination: c.destination,
      cargo_required: c.cargo_required, unit_buy: c.unit_buy, payout: c.payout,
      deadline_days: c.deadline_days, failed: false };
    return s;
  }

  function buyItem(state, key) {
    var s = clone(state);
    var it = D().ITEMS.filter(function (x) { return x.key === key; })[0];
    if (!it || s.credits < it.price) return s;
    s.credits -= it.price;
    s.inventory[key] = (s.inventory[key] || 0) + 1;
    return s;
  }

  function buyCargo(state, units) {
    var s = clone(state);
    if (!s.contract) return s;
    units = Math.max(0, units | 0);
    var cost = units * s.contract.unit_buy;
    if (cost > s.credits) return s;
    s.credits -= cost;
    s.cargo = { units: units, buy_price: s.contract.unit_buy };
    return s;
  }

  // Ready to leave port: contract accepted, hold can carry the load, and it's bought.
  function canPlot(state) {
    return !!(state.ship && state.contract && state.credits >= 0 &&
      state.ship.cargo_capacity >= state.contract.cargo_required &&
      state.cargo.units >= state.contract.cargo_required);
  }

  function plotRoute(state, galaxy, option) {
    var s = clone(state);
    if (!canPlot(s)) return s;
    var graph = galaxy.graph || P().buildNavGraph(galaxy.planets, galaxy.routes);
    var r = P().routeUniversal(graph, galaxy.planets, galaxy.routes,
      s.contract.origin, s.contract.destination);
    var segs = (r && r.segments) ? r.segments : [];
    var byName = {};
    galaxy.planets.forEach(function (p) { byName[p.name] = p; });
    s.route = {
      option: option === 'cautious' ? 'cautious' : 'direct',
      hazard: _hazardForSegments(segs, byName),
      legs: _chunkLegs(segs),
      legIndex: 0,
    };
    s.clock = { days_elapsed: 0, days_left: s.contract.deadline_days };
    s.phase = 'TRANSIT';
    s.log.push('Plotted ' + s.contract.origin + ' -> ' + s.contract.destination +
      ' (' + s.route.legs.length + ' legs, ' + s.route.option + ' route).');
    return s;
  }

  // routeUniversal returns one segment PER WAYPOINT (often 20-70 hops). For the
  // game we chunk those into a handful of meaningful "legs" (~3-6). Each game-leg
  // keeps its sub-segments so its travel time is the real RAW time of the chunk
  // (not 1 day per hop), and its quality is the HARDEST stretch in the chunk.
  // The "direct" route is named for the most-hostile region it threads through —
  // Hutt Space = pirates, Core/Colonies = the Imperial blockade, the Rim/Wild =
  // the Outer Reaches. That label also weights which events fire on that route.
  var REGION_HAZARD = {
    'Hutt Space':      { key: 'hutt', label: 'Pirate Space' },
    'Outer Rim':       { key: 'rim',  label: 'the Outer Reaches' },
    'Wild Space':      { key: 'rim',  label: 'the Outer Reaches' },
    'Unknown Regions': { key: 'rim',  label: 'the Outer Reaches' },
    'Core':            { key: 'core', label: 'the Imperial Blockade' },
    'Deep Core':       { key: 'core', label: 'the Imperial Blockade' },
    'Colonies':        { key: 'core', label: 'the Imperial Blockade' },
  };
  function _hazardForSegments(segs, byName) {
    var tally = {};
    segs.forEach(function (s) {
      [s.from, s.to].forEach(function (n) {
        var p = byName[n]; if (!p) return;
        var h = REGION_HAZARD[p.region]; if (!h) return;
        if (!tally[h.key]) tally[h.key] = { count: 0, label: h.label };
        tally[h.key].count++;
      });
    });
    var best = null;
    Object.keys(tally).forEach(function (k) { if (!best || tally[k].count > tally[best].count) best = k; });
    return best ? { key: best, label: tally[best].label } : { key: 'any', label: 'open space' };
  }

  // Two route options for the UI to offer at PLOT — both over the same path; the
  // direct route is named for its hazard, the cautious one is the long way.
  function routeOptions(state, galaxy) {
    if (!state.contract) return [];
    var graph = galaxy.graph || P().buildNavGraph(galaxy.planets, galaxy.routes);
    var r = P().routeUniversal(graph, galaxy.planets, galaxy.routes,
      state.contract.origin, state.contract.destination);
    var segs = (r && r.segments) || [];
    var byName = {};
    galaxy.planets.forEach(function (p) { byName[p.name] = p; });
    var hz = _hazardForSegments(segs, byName);
    return [
      { key: 'direct', label: 'Run ' + hz.label, hazard: hz,
        note: 'Faster — straight through ' + hz.label + '. Expect trouble.' },
      { key: 'cautious', label: 'The Long Way Around', hazard: hz,
        note: 'Slower and steadier — fewer encounters.' },
    ];
  }

  var _Q_ORDER = ['well_traveled', 'minor', 'uncharted', 'wild_space'];
  function _chunkLegs(segs) {
    if (!segs.length) return [];
    var target = Math.max(3, Math.min(6, Math.round(segs.length / 9)));
    var per = Math.ceil(segs.length / target);
    var legs = [];
    for (var i = 0; i < segs.length; i += per) {
      var chunk = segs.slice(i, i + per);
      var quality = 'well_traveled', offLane = false, dist = 0;
      chunk.forEach(function (s) {
        dist += s.distance || 0;
        if (s.offLane) offLane = true;
        var q = s.quality || 'minor';
        if (_Q_ORDER.indexOf(q) > _Q_ORDER.indexOf(quality)) quality = q;
      });
      legs.push({
        from: chunk[0].from, to: chunk[chunk.length - 1].to,
        quality: quality, offLane: offLane, distance: dist,
        subsegments: chunk.map(function (s) {
          return { quality: s.quality || 'minor', distance: s.distance || 0, offLane: !!s.offLane };
        }),
        status: 'pending', pushed: false,
      });
    }
    return legs;
  }

  // ── derived (for UI + resolution) ──
  function legPool(leg, route, push) {
    var pool = { difficulty: 'Easy', difficultyDice: 1, boost: 0, setback: 0, reason: '' };
    var q = leg.quality;
    if (q === 'well_traveled') { pool.boost += 1; pool.reason = 'well-traveled lane'; }
    else if (q === 'uncharted') { pool.setback += 1; pool.reason = 'uncharted'; }
    else if (q === 'wild_space' || leg.offLane) {
      pool.difficulty = 'Average'; pool.difficultyDice = 2; pool.setback += 1;
      pool.reason = 'wild-space leg';
    } else { pool.reason = 'charted route'; }
    if (route.option === 'cautious') { pool.boost += 1; }
    if (push) {
      if (pool.difficulty === 'Easy') { pool.difficulty = 'Average'; pool.difficultyDice = 2; }
      else { pool.difficultyDice += 1; }
    }
    return pool;
  }

  function legDays(leg, ship, route, push) {
    var subs = leg.subsegments && leg.subsegments.length ? leg.subsegments
      : [{ quality: leg.quality, distance: leg.distance, offLane: leg.offLane }];
    var t = T().calculateUniversalTravelTime(subs, ship.hyperdrive_class);
    var d = t.days_max || 1;
    if (route.option === 'cautious') d = d * 1.3;
    if (push) d = d * 0.7;
    return Math.max(1, Math.round(d));
  }

  function legPreview(state, push) {
    var leg = state.route.legs[state.route.legIndex];
    if (!leg) return null;
    return { leg: leg, pool: legPool(leg, state.route, !!push),
      days: legDays(leg, state.ship, state.route, !!push) };
  }

  function _bucket(pool, push, v) {
    var mod = pool.boost - pool.setback - (pool.difficulty === 'Average' ? 1 : 0) - (push ? 1 : 0);
    var roll = v + mod * 0.11;
    if (roll >= 0.93) return 'TRIUMPH';
    if (roll >= 0.60) return 'GOOD';
    if (roll >= 0.28) return 'OK';
    if (roll >= 0.10) return 'BAD';
    return 'DISASTER';
  }

  function _clampHull(s) { s.ship.hull = Math.min(s.ship.hull, s.ship.hull_max); }

  function _guards(s) {
    if (s.ship.hull <= 0) {
      s.phase = 'END';
      s.result = { success: false, payout: 0, score: Math.max(0, s.credits),
        reason: 'Your ship was destroyed.' };
      return true;
    }
    if (!s.ship.hyperdrive_ok && s.inventory.spare_hyperdrive <= 0 &&
        s.credits < D().REPAIR_COST_PER_HULL) {
      s.phase = 'END';
      s.result = { success: false, payout: 0, score: Math.max(0, s.credits),
        reason: 'Stranded — your hyperdrive is dead and you cannot repair it.' };
      return true;
    }
    if (s.clock.days_left < 0 && s.contract) s.contract.failed = true;
    return false;
  }

  function _maybeEvent(s) {
    var chance = D().EVENT_BASE_CHANCE * (s.route.option === 'cautious' ? 0.6 : 1);
    if (draw(s) < chance) {
      var hz = (s.route.hazard && s.route.hazard.key) || 'any';
      var deck = D().EVENTS;
      // bias toward the route's hazard region; 'any' events always eligible
      var pool = deck.filter(function (e) { return e.region === hz || e.region === 'any'; });
      if (!pool.length) pool = deck;
      var ev = pool[Math.floor(draw(s) * pool.length)];
      s.pendingEvent = JSON.parse(JSON.stringify(ev));
      s.phase = 'EVENT';
      return true;
    }
    return false;
  }

  function _advanceOrArrive(s) {
    if (s.route.legIndex >= s.route.legs.length) { s.phase = 'ARRIVE'; }
    else { s.phase = 'TRANSIT'; }
  }

  function resolveLeg(state, opts) {
    var s = clone(state);
    if (s.phase !== 'TRANSIT') return s;
    var push = !!(opts && opts.push);
    var leg = s.route.legs[s.route.legIndex];
    if (!leg) { s.phase = 'ARRIVE'; return s; }
    var pool = legPool(leg, s.route, push);
    var days = legDays(leg, s.ship, s.route, push);

    s.clock.days_elapsed += days;
    s.clock.days_left -= days;
    if (push) s.ship.strain = Math.min(s.ship.strain_max, s.ship.strain + 2);

    var bucket = _bucket(pool, push, draw(s));
    s.lastRoll = { pool: pool, bucket: bucket, days: days };
    var note = leg.from + ' -> ' + leg.to + ' [' + bucket + ']';
    if (bucket === 'TRIUMPH') {
      var nxt = s.route.legs[s.route.legIndex + 1];
      if (nxt && nxt.status === 'pending') { nxt.status = 'skipped'; note += ' — shortcut! skipped a leg'; }
      else { s.clock.days_left += Math.ceil(days * 0.5); note += ' — found a faster lane'; }
    } else if (bucket === 'GOOD') {
      s.clock.days_left += Math.ceil(days * 0.25);
      s.ship.strain = Math.max(0, s.ship.strain - 1);
      note += ' — smooth, time saved';
    } else if (bucket === 'BAD') {
      s.ship.hull -= 3; note += ' — rough, took hull damage';
    } else if (bucket === 'DISASTER') {
      if (s.ship.hyperdrive_ok && draw(s) < 0.5) {
        if (s.inventory.spare_hyperdrive > 0) {
          s.inventory.spare_hyperdrive -= 1; note += ' — drive blew, swapped the spare';
        } else { s.ship.hyperdrive_ok = false; note += ' — HYPERDRIVE DEAD'; }
      } else {
        s.ship.hull -= 5; s.clock.days_left -= Math.ceil(days * 0.5);
        note += ' — gravity shadow, dropped out hard';
      }
    }
    _clampHull(s);
    s.log.push(note);

    leg.pushed = push;
    leg.status = 'done';
    // skip any leg a Triumph shortcut consumed
    s.route.legIndex += 1;
    while (s.route.legs[s.route.legIndex] && s.route.legs[s.route.legIndex].status === 'skipped') {
      s.route.legIndex += 1;
    }

    if (_guards(s)) return s;
    if (_maybeEvent(s)) return s;
    _advanceOrArrive(s);
    return s;
  }

  function applyEventChoice(state, choiceId) {
    var s = clone(state);
    if (s.phase !== 'EVENT' || !s.pendingEvent) return s;
    var choice = s.pendingEvent.choices.filter(function (c) { return c.id === choiceId; })[0];
    if (!choice) return s;
    var eff = choice.effects || {};
    if (choice.check) { eff = (draw(s) < choice.check.chance) ? choice.check.success : choice.check.fail; }
    eff = eff || {};
    if (eff.credits) s.credits += eff.credits;
    if (eff.hull) s.ship.hull -= eff.hull;           // positive hull in data = damage
    if (eff.strain) s.ship.strain = Math.max(0, Math.min(s.ship.strain_max, s.ship.strain + eff.strain));
    if (eff.days) { s.clock.days_elapsed += eff.days; s.clock.days_left -= eff.days; }
    _clampHull(s);
    s.log.push(s.pendingEvent.title + ': ' + choice.label);
    s.pendingEvent = null;
    if (_guards(s)) return s;
    _advanceOrArrive(s);
    return s;
  }

  function settle(state) {
    var s = clone(state);
    var base = s.contract.payout;
    var late = s.clock.days_left < 0 ? -s.clock.days_left : 0;
    var onTime = late === 0 ? 1 : Math.max(D().PAYOUT_FLOOR, 1 - D().LATE_PENALTY_PER_DAY * late);
    var payout = Math.round(base * onTime);
    var success = payout > 0;
    s.credits += payout;
    var bonus = s.clock.days_left > 0 ? s.clock.days_left * 500 : 0;
    s.result = {
      success: success, payout: payout, score: Math.max(0, s.credits + bonus),
      reason: success
        ? ('Delivered' + (late ? ' (' + late + ' day' + (late > 1 ? 's' : '') + ' late)' : ' on time') +
           ' for ' + payout.toLocaleString() + ' cr.')
        : 'Too late — the contract fell through.',
    };
    s.phase = 'END';
    return s;
  }

  var API = {
    initRun: initRun, selectShip: selectShip, acceptContract: acceptContract,
    buyItem: buyItem, buyCargo: buyCargo, canPlot: canPlot, plotRoute: plotRoute,
    routeOptions: routeOptions, legPool: legPool, legDays: legDays, legPreview: legPreview,
    resolveLeg: resolveLeg, applyEventChoice: applyEventChoice, settle: settle,
  };
  if (typeof window !== 'undefined') window.HyperRun = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
