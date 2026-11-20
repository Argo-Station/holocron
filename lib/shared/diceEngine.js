/**
 * diceEngine.js — Shared dice pool logic for SWRPG (FFG Narrative Dice).
 *
 * Pure logic, no DOM, no React. Safe to call from any screen or background
 * task (silent rolls for auto-play, NPC AI, etc).
 *
 * Exports on window.SWRPGDice:
 *   DIE_FACES            — face distributions per die type
 *   buildPool(spec)      — build a pool from {characteristic, skillRank, boost, setback, difficulty, challenge, force},
 *                          then RAW's order (F-100 M8 C3): addChallenge · upgradeAbility, upgradeDifficulty ·
 *                          downgradeAbility, downgradeDifficulty · removeDifficultyFloored ([{count, floor}], first),
 *                          removeDifficulty, removeChallenge; `_autoSymbols` rides along
 *   roll(pool)           — return raw face results {ability: [...], proficiency: [...], ...}
 *   resolve(results)     — tally faces (+ the pool's automatic symbols) → {success, advantage, triumph, despair, threat, failure, light, dark}
 *   rollAndResolve(pool) — convenience: roll + resolve + return both
 *   formatPool(pool)     — compact text like "2A 1P · 2D"
 *   formatResults(r)     — plain text summary e.g. "2 success, 1 advantage"
 */
(function() {
  // ── Die face distributions (from FFG Star Wars RPG Core Rulebook) ──────
  // Each face is an object of symbol counts. A blank face is {}.
  // Symbols: s=success, a=advantage, t=triumph, f=failure, h=threat (h=hit), d=despair, l=light, dk=dark
  var BLANK = {};
  var S = { s: 1 };
  var SS = { s: 2 };
  var A = { a: 1 };
  var AA = { a: 2 };
  var SA = { s: 1, a: 1 };
  var F = { f: 1 };
  var FF = { f: 2 };
  var H = { h: 1 };
  var HH = { h: 2 };
  var FH = { f: 1, h: 1 };
  var T = { s: 1, t: 1 };          // triumph face: 1 success + 1 triumph
  var D = { f: 1, d: 1 };          // despair face: 1 failure + 1 despair
  var L = { l: 1 };
  var LL = { l: 2 };
  var DK = { dk: 1 };
  var DKDK = { dk: 2 };

  var DIE_FACES = {
    // Boost (d6, light blue) — 6 faces
    boost:      [BLANK, BLANK, S, SA, AA, A],
    // Setback (d6, black) — 6 faces
    setback:    [BLANK, BLANK, F, F, H, H],
    // Ability (d8, green) — 8 faces
    ability:    [BLANK, S, S, SS, A, A, SA, AA],
    // Difficulty (d8, purple) — 8 faces
    difficulty: [BLANK, F, FF, H, H, H, HH, FH],
    // Proficiency (d12, yellow) — 12 faces
    proficiency:[BLANK, S, S, SS, SS, A, SA, SA, SA, AA, AA, T],
    // Challenge (d12, red) — 12 faces
    challenge:  [BLANK, F, F, FF, FF, H, H, FH, FH, HH, HH, D],
    // Force (d12, white) — 12 faces
    force:      [DK, DK, DK, DK, DK, DK, DKDK, L, L, LL, LL, LL],
  };

  // ── Pool construction ──────────────────────────────────────────────────
  // FFG formula:
  //   characteristic → N ability dice
  //   skill rank upgrades min(char, rank) of those ability dice → proficiency
  //   remaining skill rank (if rank > char) → extra ability dice
  //   (i.e. final ability = max(char, rank) - min(char, rank))
  //        final proficiency = min(char, rank)
  //
  // Minions use this SAME standard build — no special path. A minion group's skill ranks =
  // members − 1, fed in as spec.skillRank, and the pool builds normally (mooks CAN crit).
  // (EotE p.390; fad-beginner Adventure Book p.22-23.)
  // B-1928: the six dice ADJUST counts, in the hub's pool order, and the count's ceiling (ADDENDUM 791 item 1)
  var ADJUST_DICE = ['ability', 'proficiency', 'boost', 'difficulty', 'challenge', 'setback'], ADJUST_MAX = 9;
  function buildPool(spec) {
    spec = spec || {};
    var ch = Math.max(0, spec.characteristic || 0);
    var rk = Math.max(0, spec.skillRank || 0);
    var proficiency = Math.min(ch, rk);
    var ability = Math.max(ch, rk) - proficiency;

    // The basic difficulty: `challenge` of the `difficulty` dice arrive already red (a caller that passes both).
    // (The `adversary` field is gone, ruling `f100-dice-hotfix` R-FDH-10: no caller set it. Adversary X is an
    // upgradeDifficulty, which the phases below apply in RAW's order.)
    var diff = Math.max(0, spec.difficulty || 0);
    var cha = Math.min(diff, Math.max(0, spec.challenge || 0));
    var difficulty = diff - cha;
    var challenge = cha;

    // ── THE ORDER IS RAW's, NEVER THE CALLER'S (F-100 M8 C3, ruling f100-m8-contracts R-M8K-3; B-1063).
    // Build the basic pool, then add dice, then upgrade, then
    // downgrade, and remove dice last (EotE p.20; FaD p.29.) The basic pool and the plain
    // ADDS are the counts above (boost, setback and force are counts; an added Difficulty die is in
    // `difficulty`). `addChallenge` adds Challenge dice outright — `challenge` above is how many of the
    // Difficulty dice are already upgraded, a different thing. Then:
    challenge += Math.max(0, spec.addChallenge || 0);

    // UPGRADES, all of them before any downgrade (R2: EotE p.22; FaD p.30). One upgrade turns an Ability die
    // into Proficiency (Difficulty into Challenge). WITH NONE LEFT, the upgrade ADDS THE LOWER DIE, and a
    // further upgrade then turns that new die over (R4/R5): one upgrade adds an Ability
    // die, and a remaining upgrade then turns that new die into a
    // Proficiency die (FaD Core p.30; EotE Core p.21 prints the same paragraph.) So [PR][PR] + 1 upgrade is
    // [PR][PR][AB], and + 2 is [PR][PR][PR].
    // CORRECTED AT THE SOURCE (charter §3a.6; B-1066): this comment used to read "when no ability dice remain —
    // ADDS a proficiency die" (TRUE-AIM1, 3e5a6bf1), and every surplus upgrade yielded a yellow die. The book
    // says green first. The live consumer is a Ship Yard seat's upgrade (`vesselResolve`'s pools).
    function upgrade(lower, higher, n) {
      var turned = Math.min(lower, n), left = n - turned;
      return [lower - turned + (left % 2), higher + turned + Math.floor(left / 2)];
    }
    var up = upgrade(ability, proficiency, Math.max(0, spec.upgradeAbility || 0));
    ability = up[0]; proficiency = up[1];
    up = upgrade(difficulty, challenge, Math.max(0, spec.upgradeDifficulty || 0));
    difficulty = up[0]; challenge = up[1];

    // DOWNGRADES: Proficiency → Ability, Challenge → Difficulty, and nothing else (R7: FaD p.30). Once every
    // die is already downgraded, extra downgrades do nothing (R6: FaD p.30.)
    var down = Math.min(proficiency, Math.max(0, spec.downgradeAbility || 0));
    proficiency -= down; ability += down;
    down = Math.min(challenge, Math.max(0, spec.downgradeDifficulty || 0));
    challenge -= down; difficulty += down;

    // REMOVALS, last: remove as many dice as exist, and extra removals are
    // dropped (R3: FaD p.30.) A removed Difficulty die is a purple one; a Challenge die is not touched by it
    // (R8: decreasing the difficulty is not downgrading it). Boost, setback and force removals never meet an
    // upgrade or a downgrade, so `poolMods.augment` folds them into the counts directly; they commute.
    // FLOORED DECREASES FIRST (F-100 M8 member F, ruling f100-m8-contracts R-M8K-29/30): a talent's "to a minimum
    // of Easy" binds ITS OWN decrease only, and floored decreases apply before plain ones (order (β); RAW silent,
    // reported). The LEVEL is the count of Difficulty dice, Challenge dice included (EotE p.22: upgrading is not
    // increasing). Each entry removes purple dice only (R8), never taking the count below its floor. Absent → nothing.
    (Array.isArray(spec.removeDifficultyFloored) ? spec.removeDifficultyFloored : []).forEach(function (f) {
      var n = Math.max(0, (f && f.count) || 0), room = Math.max(0, difficulty + challenge - Math.max(0, (f && f.floor) || 0));
      difficulty -= Math.min(n, difficulty, room);
    });
    difficulty = Math.max(0, difficulty - Math.max(0, spec.removeDifficulty || 0));
    challenge = Math.max(0, challenge - Math.max(0, spec.removeChallenge || 0));

    var pool = {
      ability: ability,
      proficiency: proficiency,
      boost: Math.max(0, spec.boost || 0),
      difficulty: difficulty,
      challenge: challenge,
      setback: Math.max(0, spec.setback || 0),
      force: Math.max(0, spec.force || 0),
    };
    // B-1928 (D-673/D-674; ruling release-r7-bug-burndown ADDENDUM 791 items 5–6): THE PLAYER'S ADJUST, the LAST step — the
    // pool above is the sheet's SUGGESTION. `adjust` = signed per-die differences from it ({ ability: -1, challenge: +1 });
    // each count lands clamped 0..9. Then `destinyUpgrade` (the Destiny Point tick) upgrades the player's own ability ONCE by
    // RAW's rule — with no green left it adds a green (EotE pp.20–21; one point per check, EotE p.28). Absent → nothing.
    if (spec.adjust || spec.destinyUpgrade) {
      ADJUST_DICE.forEach(function (k) { pool[k] = Math.max(0, Math.min(ADJUST_MAX, pool[k] + ((spec.adjust && Number(spec.adjust[k])) || 0))); });
      if (spec.destinyUpgrade) { up = upgrade(pool.ability, pool.proficiency, 1); pool.ability = up[0]; pool.proficiency = up[1]; }
    }
    // AUTOMATIC results (C3 `symbol`, R-M8K-3): added to the check's results, never rolled. Carried on the pool
    // only when there are some, so a pool without them keeps its exact shape.
    var auto = autoSymbolsOf(spec._autoSymbols);
    if (auto) pool._autoSymbols = auto;
    return pool;
  }

  // { success, advantage, triumph, failure, threat, despair } → the same with only positive counts, or null.
  var AUTO_SYMBOLS = ['success', 'advantage', 'triumph', 'failure', 'threat', 'despair'];
  function autoSymbolsOf(src) {
    if (!src) return null;
    var out = null;
    AUTO_SYMBOLS.forEach(function (k) { var n = Math.max(0, Number(src[k]) || 0); if (n) { out = out || {}; out[k] = n; } });
    return out;
  }
  // An automatic symbol is the SYMBOL, so it counts as the symbol does on a die face: a Triumph is a Success as
  // well, a Despair a Failure as well (the T and D faces above). RAW prints no general rule for automatic symbols
  // (R9, SILENT, REPORTED under R-RRD-1); a talent's own words govern its exceptions (Showboat).
  var AUTO_TALLY = { success: { s: 1 }, advantage: { a: 1 }, triumph: { s: 1, t: 1 },
                     failure: { f: 1 }, threat: { h: 1 }, despair: { f: 1, d: 1 } };

  // ── Rolling ────────────────────────────────────────────────────────────
  function rollOne(dieType) {
    var faces = DIE_FACES[dieType];
    if (!faces) return BLANK;
    return faces[Math.floor(Math.random() * faces.length)];
  }

  function roll(pool) {
    pool = pool || {};
    var types = ['ability', 'proficiency', 'boost', 'difficulty', 'challenge', 'setback', 'force'];
    var out = {};
    types.forEach(function(t) {
      var n = pool[t] || 0;
      var arr = [];
      for (var i = 0; i < n; i++) arr.push(rollOne(t));
      out[t] = arr;
    });
    if (pool._autoSymbols) out._autoSymbols = pool._autoSymbols;   // carried to `resolve`, never rolled
    return out;
  }

  // ── Resolution ─────────────────────────────────────────────────────────
  // Net success = success - failure. Net advantage = advantage - threat.
  // Triumph counts as success too; despair counts as failure too.
  // Force dice produce light/dark pips (no cancellation).
  //
  // Resolved-result schema: `success` and `advantage` are SIGNED integers.
  //   success > 0   → succeeded === true,  netFailure === 0
  //   success === 0 → succeeded === false, netFailure === 0  (literal tie)
  //   success < 0   → succeeded === false, netFailure === Math.abs(success)
  //   advantage > 0 → N net advantage
  //   advantage < 0 → Math.abs(advantage) net threat (formatResults reads this)
  // Same convention applies to `scriptedResult.{success,advantage}` in
  // scenario beats — the consumer at lib/dice/diceSurface.jsx (performRoll)
  // passes them through directly. Negative scripted values are supported:
  //   Beat 1 of sabotage-drydock uses advantage: -1 (1 net threat)
  //   Beat 2 of sabotage-drydock uses success: -1 (1 net failure)
  function resolve(results) {
    results = results || {};
    var totals = { s: 0, a: 0, t: 0, f: 0, h: 0, d: 0, l: 0, dk: 0 };
    ['ability', 'proficiency', 'boost', 'difficulty', 'challenge', 'setback', 'force'].forEach(function(t) {
      (results[t] || []).forEach(function(face) {
        Object.keys(face).forEach(function(sym) {
          totals[sym] = (totals[sym] || 0) + face[sym];
        });
      });
    });
    // F-100 M8 C3: the pool's automatic symbols join the tally (`buildPool` → `roll` carry them as `_autoSymbols`).
    var auto = autoSymbolsOf(results._autoSymbols);
    if (auto) Object.keys(auto).forEach(function (k) {
      var per = AUTO_TALLY[k];
      Object.keys(per).forEach(function (sym) { totals[sym] += per[sym] * auto[k]; });
    });

    var success = totals.s - totals.f;
    var advantage = totals.a - totals.h;
    return {
      success: success,
      advantage: advantage,
      triumph: totals.t,
      despair: totals.d,
      light: totals.l,
      dark: totals.dk,
      // Raw totals for display / debugging
      raw: totals,
      // Convenience flags
      succeeded: success > 0,
      netFailure: success <= 0 ? Math.abs(success) : 0,
      netThreat: advantage < 0 ? Math.abs(advantage) : 0,
    };
  }

  function rollAndResolve(pool) {
    var results = roll(pool);
    return { pool: pool, results: results, resolved: resolve(results) };
  }

  // ── Probabilities (Dice Tutor Lap A) ────────────────────────────────────
  // EXACT odds for a built pool, computed by convolving DIE_FACES — our OWN cited face
  // data (§8: one face dataset, no second source). Each display metric is an INDEPENDENT
  // 1-D marginal (success, advantage, triumph, despair, net-force), so we convolve one axis
  // at a time — exact, dependency-free, and cheap for table-sized pools. The external datasets
  // (swrpg-online/dice, TTFTCUTS/sw_dice) are VALIDATORS in the node guard, not a source here.
  var DICE_ORDER = ['ability', 'proficiency', 'boost', 'difficulty', 'challenge', 'setback', 'force'];
  var _axisCache = {};   // memo: per (dieType|axisName) -> per-die delta distribution {delta: prob}

  function _perDieDist(dieType, axisName, faceVal) {
    var key = dieType + '|' + axisName;
    if (_axisCache[key]) return _axisCache[key];
    var faces = DIE_FACES[dieType] || [];
    var per = {};
    var p = faces.length ? 1 / faces.length : 0;
    faces.forEach(function(face) { var v = faceVal(face); per[v] = (per[v] || 0) + p; });
    _axisCache[key] = per;
    return per;
  }

  function _convolve(a, b) {
    var out = {};
    Object.keys(a).forEach(function(x) {
      Object.keys(b).forEach(function(y) {
        var k = (+x) + (+y);
        out[k] = (out[k] || 0) + a[x] * b[y];
      });
    });
    return out;
  }

  // Convolve one axis across the whole pool → {netValue: probability}.
  function _axisDist(pool, axisName, faceVal) {
    // The pool's automatic symbols are a certain shift on every axis (F-100 M8 C3), so the odds and the roll agree.
    var shift = 0, auto = autoSymbolsOf(pool && pool._autoSymbols);
    if (auto) Object.keys(auto).forEach(function (k) { shift += faceVal(AUTO_TALLY[k]) * auto[k]; });
    var dist = {}; dist[shift] = 1;
    DICE_ORDER.forEach(function(dieType) {
      var n = Math.max(0, (pool && pool[dieType]) || 0);
      if (!n || !(DIE_FACES[dieType] || []).length) return;
      var per = _perDieDist(dieType, axisName, faceVal);
      for (var i = 0; i < n; i++) dist = _convolve(dist, per);
    });
    return dist;
  }

  function _summarize(dist) {
    var posP = 0, negP = 0, zeroP = 0, mean = 0, distArr = [];
    Object.keys(dist).map(Number).sort(function(a, b) { return a - b; }).forEach(function(v) {
      var p = dist[v];
      distArr.push({ value: v, p: p });
      mean += v * p;
      if (v > 0) posP += p; else if (v < 0) negP += p; else zeroP += p;
    });
    return { dist: distArr, mean: mean, posChance: posP, negChance: negP, zeroChance: zeroP };
  }

  // probabilities(pool) → exact odds for the pool the player has built.
  function probabilities(pool) {
    pool = pool || {};
    var total = 0;
    DICE_ORDER.forEach(function(t) { total += Math.max(0, pool[t] || 0); });
    if (!total) return null;   // empty pool → no readout

    var suc = _summarize(_axisDist(pool, 'success', function(f) { return (f.s || 0) - (f.f || 0); }));
    var adv = _summarize(_axisDist(pool, 'advantage', function(f) { return (f.a || 0) - (f.h || 0); }));
    var triDist = _axisDist(pool, 'triumph', function(f) { return f.t || 0; });
    var desDist = _axisDist(pool, 'despair', function(f) { return f.d || 0; });
    var force = _summarize(_axisDist(pool, 'force', function(f) { return (f.l || 0) - (f.dk || 0); }));

    return {
      dice: total,
      // headline: net success > 0 (triumph's success is already in the s-f axis)
      success: { chance: suc.posChance, fail: suc.negChance, tie: suc.zeroChance, mean: suc.mean, dist: suc.dist },
      advantage: { posChance: adv.posChance, negChance: adv.negChance, mean: adv.mean, dist: adv.dist },
      triumph: { chance: 1 - (triDist[0] || 0), mean: _summarize(triDist).mean },
      despair: { chance: 1 - (desDist[0] || 0), mean: _summarize(desDist).mean },
      force: { lightChance: force.posChance, darkChance: force.negChance, mean: force.mean, dist: force.dist, hasForce: (pool.force || 0) > 0 },
    };
  }

  // ── Compact formatters ─────────────────────────────────────────────────
  // Returns a short text form: "2A 1P 1B · 2D 1C 1S" (ability/prof/boost · difficulty/challenge/setback)
  function formatPool(pool) {
    pool = pool || {};
    var left = [];
    if (pool.proficiency) left.push(pool.proficiency + 'P');
    if (pool.ability) left.push(pool.ability + 'A');
    if (pool.boost) left.push(pool.boost + 'B');
    var right = [];
    if (pool.challenge) right.push(pool.challenge + 'C');
    if (pool.difficulty) right.push(pool.difficulty + 'D');
    if (pool.setback) right.push(pool.setback + 'S');
    var force = pool.force ? (' · ' + pool.force + 'F') : '';
    var leftStr = left.join(' ');
    var rightStr = right.join(' ');
    if (!leftStr && !rightStr) return '—';
    return (leftStr || '0') + ' vs ' + (rightStr || '0') + force;
  }

  function formatResults(r) {
    if (!r) return '—';
    var parts = [];
    if (r.success > 0) parts.push(r.success + ' success');
    else if (r.success < 0) parts.push(Math.abs(r.success) + ' failure');
    else parts.push('0 net');
    if (r.advantage > 0) parts.push(r.advantage + ' advantage');
    else if (r.advantage < 0) parts.push(Math.abs(r.advantage) + ' threat');
    if (r.triumph) parts.push(r.triumph + ' triumph');
    if (r.despair) parts.push(r.despair + ' despair');
    if (r.light) parts.push(r.light + ' light');
    if (r.dark) parts.push(r.dark + ' dark');
    return parts.join(', ');
  }

  // ── Sanity check (logged once on load) ─────────────────────────────────
  function selfTest() {
    // Roll 1000 ability dice and check expected net success is positive-ish.
    // Ability die: 1 blank, 2×(1s), 1×(2s), 2×(1a), 1×(1s1a), 1×(2a) = success rate ~2.625/8 = ~0.33
    var n = 1000;
    var totalS = 0;
    for (var i = 0; i < n; i++) {
      var f = rollOne('ability');
      totalS += (f.s || 0);
    }
    var avgS = totalS / n;
    // Expected: (0 + 1 + 1 + 2 + 0 + 0 + 1 + 0) / 8 = 5/8 = 0.625 successes per ability die
    // (faces: BLANK, S, S, SS, A, A, SA, AA → 0+1+1+2+0+0+1+0 = 5)
    var expected = 5 / 8;
    var ok = Math.abs(avgS - expected) < 0.1;
    return { ok: ok, avgSuccess: avgS, expected: expected };
  }

  // ── Exports ────────────────────────────────────────────────────────────
  var api = {
    DIE_FACES: DIE_FACES,
    buildPool: buildPool,
    ADJUST_DICE: ADJUST_DICE, ADJUST_MAX: ADJUST_MAX,   // B-1928: the ADJUST strip's six counts and their ceiling
    roll: roll,
    resolve: resolve,
    rollAndResolve: rollAndResolve,
    probabilities: probabilities,
    formatPool: formatPool,
    formatResults: formatResults,
    selfTest: selfTest,
  };

  if (typeof window !== 'undefined') {
    window.SWRPGDice = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
