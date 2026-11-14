/* lib/shared/shipSchematic.js — SHIPYARD Y1 (ruling shipyard-y1-scope-recon §4.2). The ONE ship
 * schematic module (R-SY1): the ship IDENTIFIER (D-196..D-212) and the pure arc/shield geometry under it, computed
 * ONLY from registry fields (category, category_subtype, type, silhouette, defense.*, weapons[].firing_arcs/turret) —
 * never invented (R-SY2).
 *
 * RAW (RULES_FOUNDATION_VEHICLES.md §1-2, EotE CRB printed): silhouette ≤4 → TWO zones (fore/aft);
 * silhouette ≥5 → FOUR zones (fore/aft/port/starboard); each zone's defense adds that many setback dice;
 * a weapon fires only in its listed arc(s); turret = all arcs.
 *
 * THE IDENTIFIER (card `shipyard-schematic-build-card` R-SSB-1..11; DECISIONS D-196, D-198, D-201..D-212): one visual
 * identifier per vehicle, read like a unit icon on an RTS map, PAPER ONLY (D-198). Two forms:
 *   – SMALL: the family glyph at its size band, with the class pictogram cut into it, or BESIDE it below the family's
 *     `cutMin` (drawn px);
 *   – FULL (the lab's LARGE): the same glyph inside the shield ring (S2 numerals) and the firing-arc wedges with their
 *     counts, the DORSAL/VENTRAL arcword below; the key line only where a host asks for it.
 * The geometry is PORTED from the approved lab drawing (ui-lab `lab/holocron/schematic_glyphs/v9/glyphs9.js` and
 * `v2/fold8.json` @ `c5ba89356`, D-211), table for table and function for function, so the markup is identical — held by
 * `test/ship_identifier_fidelity.cjs` against `test/fixtures/ship_identifier_approved.json`. No lab file and no
 * reference picture is in this repo: the family plans were measured off Jason's own references in the lab (never
 * shipped), and only the measured numbers live here. The class pictograms are Lucide-idiom shapes (ISC), as NAV_ICONS
 * cites them (`lib/shared/ui.jsx`, "Lucide bottom-bar icons … ISC").
 *
 * WHERE each host draws which form is DATA: HOSTS below (D-212's placement table, R-SSB-3); every call site names its
 * host, and `test/ship_identifier_placement.cjs` maps the table to D-212's lines.
 *
 * Plain JS (diceEngine pattern) so the pure geometry is node-requirable: `React.createElement` is captured lazily INSIDE
 * the component (browser-only render path); `Small`/`Large` take the element builder as their first argument, so a node
 * guard renders them with its own. Classic script → window.SWRPGShipSchematic.
 *
 * Geometry: COMPASS degrees (0 = up = FORE, clockwise), fore-up per §4.2.
 */
(function (global) {
  'use strict';

  // ── pure arc/shield geometry (guarded by test/ship_schematic.cjs) ───────────────────────────────────────────────────────
  function zonesForSilhouette(sil) {
    var n = Number(sil);
    return (isFinite(n) && n >= 5) ? 4 : 2;   // §1: ≤4 → 2 zones, ≥5 → 4 zones
  }

  // The defense zones for a vehicle, each with its arc span (compass a1→a2 clockwise), midpoint (for the
  // DEF number node + label), and its defense rating read straight off the record. TWO or FOUR per §1.
  function deriveZones(defense, sil) {
    var d = defense || {};
    if (zonesForSilhouette(sil) === 2) {
      return [
        { id: 'fore', label: 'FORE', a1: 270, a2: 90,  mid: 0,   defense: Number(d.fore) || 0 },
        { id: 'aft',  label: 'AFT',  a1: 90,  a2: 270, mid: 180, defense: Number(d.aft) || 0 },
      ];
    }
    return [
      { id: 'fore',      label: 'FORE', a1: 315, a2: 45,  mid: 0,   defense: Number(d.fore) || 0 },
      { id: 'starboard', label: 'STBD', a1: 45,  a2: 135, mid: 90,  defense: Number(d.starboard) || 0 },
      { id: 'aft',       label: 'AFT',  a1: 135, a2: 225, mid: 180, defense: Number(d.aft) || 0 },
      { id: 'port',      label: 'PORT', a1: 225, a2: 315, mid: 270, defense: Number(d.port) || 0 },
    ];
  }

  // One weapon's arc footprint: a turret is a full ring; otherwise the set of true fore/aft/port/starboard
  // wedges + dorsal/ventral badges (a top-down view can't sector dorsal/ventral honestly, §4.2).
  function weaponArcs(weapon) {
    var w = weapon || {}, fa = w.firing_arcs || {};
    if (w.turret) return { turret: true, wedges: [], badges: [] };
    var wedges = [], badges = [];
    ['fore', 'aft', 'port', 'starboard'].forEach(function (k) { if (fa[k]) wedges.push(k); });
    ['dorsal', 'ventral'].forEach(function (k) { if (fa[k]) badges.push(k); });
    return { turret: false, wedges: wedges, badges: badges };
  }

  // The union of all weapons' arcs.
  function unionArcs(weapons) {
    var out = { turret: false, wedges: [], badges: [] };
    (Array.isArray(weapons) ? weapons : []).forEach(function (w) {
      var a = weaponArcs(w);
      if (a.turret) out.turret = true;
      a.wedges.forEach(function (k) { if (out.wedges.indexOf(k) < 0) out.wedges.push(k); });
      a.badges.forEach(function (k) { if (out.badges.indexOf(k) < 0) out.badges.push(k); });
    });
    return out;
  }

  // ════ THE IDENTIFIER — ported from the approved v9 drawing (ui-lab glyphs9.js @ c5ba89356) ════════════════════════════
  function f3(n) { return +n.toFixed(3); }
  // geometry helpers: everything is a list of [x, y] points in the 24-unit cell, fore UP
  function circ(cx, cy, r, n) { n = n || 56; var o = []; for (var i = 0; i < n; i++) { var a = 2 * Math.PI * i / n; o.push([cx + r * Math.sin(a), cy - r * Math.cos(a)]); } return o; }
  // an arc, angles in degrees from fore (UP), clockwise
  function arc(cx, cy, r, a0, a1, n) { n = n || Math.max(6, Math.ceil(Math.abs(a1 - a0) / 6)); var o = [];
    for (var i = 0; i <= n; i++) { var a = (a0 + (a1 - a0) * i / n) * Math.PI / 180; o.push([cx + r * Math.sin(a), cy - r * Math.cos(a)]); } return o; }
  function rect(x0, y0, x1, y1) { return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]; }
  function mirror(pts) { return pts.map(function (p) { return [24 - p[0], p[1]]; }); }
  // a left-half outline (fore tip to aft centre, x ≤ 12) closed by its mirror: one symmetric silhouette
  function sym(half) { var m = mirror(half).reverse(); return half.concat(m.slice(half[half.length - 1][0] === 12 ? 1 : 0, half[0][0] === 12 ? m.length - 1 : m.length)); }
  function cat() { return [].concat.apply([], arguments); }
  // a SPOKE: a solid bar from radius r0 to r1 along the angle a about (cx, cy), w wide, set off its ray by `off`
  function spoke(cx, cy, a, r0, r1, w, off) { var t = a * Math.PI / 180, u = [Math.sin(t), -Math.cos(t)], n = [-u[1], u[0]], o = off || 0;
    return [[-w / 2, r0], [w / 2, r0], [w / 2, r1], [-w / 2, r1]].map(function (q) { var s = q[0] + o; return [cx + u[0] * q[1] + n[0] * s, cy + u[1] * q[1] + n[1] * s]; }); }
  // a CRESCENT: the arc of radius ro across a0..a1, its inner edge drawn in by up to `th` (full at the middle, nothing at the tips)
  function crescent(cx, cy, ro, th, a0, a1) { var n = 36, o = arc(cx, cy, ro, a0, a1, n), i;
    for (i = n; i >= 0; i--) { var f = i / n, a = (a0 + (a1 - a0) * f) * Math.PI / 180, r = ro - th * Math.sin(Math.PI * f); o.push([cx + r * Math.sin(a), cy - r * Math.cos(a)]); }
    return o; }
  // a ZIGZAG cut between radii ri and ro across the angles a0..a1, n strokes
  function zig(cx, cy, ri, ro, a0, a1, n) { var o = []; for (var i = 0; i <= n; i++) { var a = (a0 + (a1 - a0) * i / n) * Math.PI / 180, r = i % 2 ? ro : ri;
    o.push([cx + r * Math.sin(a), cy - r * Math.cos(a)]); } return o; }
  // A measured plan's own units mapped into the cell by ONE scale and no stretch: X = 12 + (x − cx)·s, Y = Y0 + (y − y0)·s.
  // The numbers below are the lab's measurements (in the units of the plan it measured); no picture is read here.
  function r3(pts) { return pts.map(function (p) { return [f3(p[0]), f3(p[1])]; }); }
  function refMap(s, cx, y0, Y0) { var m = function (p) { return [f3(12 + (p[0] - cx) * s), f3(Y0 + (p[1] - y0) * s)]; };
    return { p: m, pts: function (a) { return a.map(m); }, len: function (v) { return f3(v * s); } }; }
  var XW = refMap(0.0535, 186, 52, 0.7),     // starfighter (T-65B X-wing)
    SD = refMap(0.02662, 270, 24, 0.7),      // capital (Imperial I Star Destroyer)
    YT = refMap(0.03944, 218, 17, 0.8),      // freighter (YT-1300)
    X34 = refMap(0.0691, 93.5, 14, 0.8),     // landspeeder (X-34)
    T47 = refMap(0.03842, 266, 3, 0.8),      // airspeeder (T-47)
    AT = refMap(0.0334, 230, 8, 0.6);        // walker & tank (AT-AT)
  // an AT-AT foot: a solid disc and three claws fanned outboard (side −1 port, +1 starboard)
  function foot(x, y, side) { var c = AT.p([x, y]), a0 = side < 0 ? 270 : 90;
    return [circ(c[0], c[1], AT.len(62), 40)].concat([a0, a0 - 60 * side, a0 + 60 * side].map(function (a) { return r3(spoke(c[0], c[1], a, AT.len(50), AT.len(92), 0.7, 0)); })); }

  // ── SHAPES: the TEN family glyphs (D-204's record keys; D-205/D-206/D-208/D-209 redraws; all approved by D-211). Designed at
  // XL in the 24-cell, fore UP. `parts`: solid polygons (one ink). `cuts`: detail cuts in their stated order {id, pts, closed,
  // through, group}; `ports`: round cuts {id, c}. `zone`: the class zone, centre c and radius r (XL units); `carries`: the
  // classes this family's records carry (so the pictogram scale is the zone's radius over the widest carried pictogram);
  // `cutMin`: the family's own switch (drawn px), else CUT_MIN_PX; `classInk`: the class drawn in ink in an open centre.
  var SHAPES = {
    starfighters: { rec: 'T65BXWING',
      zone: { c: XW.p([186, 372]), r: 2.6 }, cutMin: 56, carries: ['STARFIGHTER'],
      parts: [
        sym(XW.pts([[186, 51], [182, 53], [178, 62], [174, 82], [170, 112], [166, 172], [162, 262], [158, 312], [157, 330], [122, 330], [120, 338], [29, 338], [28, 322],
          [10, 326], [8, 332], [8, 396], [12, 402], [25, 402], [29, 398], [60, 402], [96, 410], [124, 413], [128, 420], [128, 466], [131, 469], [147, 469], [150, 466],
          [150, 422], [156, 419], [160, 434], [172, 440], [186, 441]])),
        XW.pts(rect(12.7, 175, 24.3, 324)), mirror(XW.pts(rect(12.7, 175, 24.3, 324)))],
      cuts: [
        { id: 'housing-l', pts: XW.pts([[29, 340], [29, 398]]), through: true }, { id: 'housing-r', pts: mirror(XW.pts([[29, 340], [29, 398]])), through: true },
        { id: 'canopy', pts: XW.pts([[186, 232], [186, 296]]) },
        { id: 'nacelle-l', pts: XW.pts([[121, 356], [121, 392]]) }, { id: 'nacelle-r', pts: mirror(XW.pts([[121, 356], [121, 392]])) }],
      ports: [] },
    capital_ships: { rec: 'STARDESTI',
      zone: { c: SD.p([270, 595]), r: 2.7 }, carries: ['WARSHIP', 'GUNSHIP'],
      parts: [
        sym(SD.pts([[270, 24], [268, 30], [247, 44], [241, 64], [236, 84], [228, 104], [222, 124], [216, 144], [209, 164], [204, 184], [197, 204], [191, 224], [185, 244],
          [178, 268], [186, 274], [183, 304], [175, 324], [167, 344], [164, 358], [141, 368], [139, 384], [132, 404], [126, 424], [120, 444], [113, 464], [107, 484],
          [100, 504], [100, 528], [103, 536], [102, 548], [84, 556], [82, 564], [75, 584], [70, 604], [62, 624], [57, 644], [50, 664], [44, 684], [38, 704], [32, 724],
          [25, 744], [20, 764], [20, 770], [50, 784], [96, 804], [120, 824], [197, 844], [246, 864], [270, 873]]))],
      cuts: [
        { id: 'bridge', pts: SD.pts([[200, 800], [340, 800]]) },
        { id: 'keel', pts: SD.pts([[270, 110], [270, 395]]) },
        { id: 'trench-l', pts: SD.pts([[223, 300], [140, 520]]) }, { id: 'trench-r', pts: mirror(SD.pts([[223, 300], [140, 520]])) }],
      ports: [{ id: 'dome-l', c: SD.p([215, 735]) }, { id: 'dome-r', c: SD.p([325, 735]) }] },
    freighters: { rec: 'YT1300',
      zone: { c: YT.p([218, 357]), r: 3.0 }, carries: ['FREIGHTER'],
      parts: [
        sym(YT.pts([[218, 112], [193, 112], [193, 32], [189, 25], [161, 25], [157, 32], [99, 152], [74, 197], [57, 214], [46, 236], [26, 272], [14, 302], [10, 330], [11, 375]])
          .concat(r3(arc(12, YT.p([218, 375])[1], YT.len(207), 270, 180, 22)).slice(1))),
        YT.pts([[379, 262], [379, 178], [384, 166], [396, 159], [414, 159], [425, 166], [429, 178], [429, 262]])],
      cuts: [
        { id: 'cockpit', pts: YT.pts([[375, 190], [375, 242]]), through: true },
        { id: 'spine-l', pts: YT.pts([[196, 136], [196, 254]]) }, { id: 'spine-r', pts: YT.pts([[240, 136], [240, 254]]) },
        { id: 'corridor-lt', pts: YT.pts([[38, 332], [115, 332]]) }, { id: 'corridor-lb', pts: YT.pts([[38, 374], [115, 374]]) },
        { id: 'corridor-rt', pts: mirror(YT.pts([[38, 332], [115, 332]])) }, { id: 'corridor-rb', pts: mirror(YT.pts([[38, 374], [115, 374]])) }],
      ports: [{ id: 'dish', c: YT.p([120, 236]) },
        { id: 'vent-1', c: YT.p([165, 477]) }, { id: 'vent-2', c: YT.p([217, 485]) }, { id: 'vent-3', c: YT.p([268, 477]) }] },
    transports: { rec: 'T4A',
      zone: { c: [12, 14.0], r: 3.9 }, carries: ['TRANSPORT', 'SUPPORT', 'FREIGHTER', 'GUNSHIP'],
      parts: [
        sym([[12, 1.0], [10.4, 1.3], [9.4, 2.6], [9.0, 5.6], [7.6, 6.8], [7.6, 9.0], [1.0, 14.8], [0.8, 18.6], [7.6, 19.2], [7.6, 21.2], [9.0, 22.8], [12, 22.8]])],
      cuts: [
        { id: 'canopy', pts: [[10.6, 4.4], [12, 3.6], [13.4, 4.4]] },
        { id: 'wing-l', pts: [[2.4, 16.0], [6.6, 12.2]] }, { id: 'wing-r', pts: [[21.6, 16.0], [17.4, 12.2]] },
        { id: 'fin', pts: [[12, 6.2], [12, 8.4]] }],
      ports: [{ id: 'exh-l', c: [10.3, 21.2] }, { id: 'exh-r', c: [13.7, 21.2] }] },
    // the LAAT/i (D-205/D-206), its points in the cell's own units
    patrol_gunships: { rec: 'LAATI',
      zone: { c: [12, 15.0], r: 3.3 }, carries: ['GUNSHIP'],
      parts: [
        sym([[12, 2.75], [11.45, 2.8], [11.1, 2.95], [10.95, 3.2], [10.82, 3.6], [10.56, 4.2], [10.36, 4.8], [10.12, 5.4], [9.87, 6.0], [9.82, 7.5], [9.67, 8.5],
          [9.59, 9.5], [9.52, 10.4], [9.42, 11.4], [9.4, 12.82],
          [0.95, 12.82], [0.6, 13.15], [0.6, 15.55], [0.8, 15.78], [1.1, 16.02], [1.73, 16.29], [9.45, 18.37],
          [9.45, 20.66], [9.5, 20.95], [9.68, 21.15], [9.9, 21.27], [10.1, 21.3], [10.3, 21.27], [10.52, 21.15], [10.7, 20.95], [10.76, 20.66], [12, 20.66]])],
      cuts: [
        { id: 'pod-l', pts: [[10.85, 8.4], [10.85, 10.7]] }, { id: 'pod-r', pts: [[13.15, 8.4], [13.15, 10.7]] },
        { id: 'glazing', pts: [[12, 3.9], [12, 6.2]] }],
      ports: [{ id: 'dome-l', c: [2.6, 14.6] }, { id: 'dome-r', c: [21.4, 14.6] }, { id: 'rack-l', c: [10.8, 19.42] }, { id: 'rack-r', c: [13.2, 19.42] }] },
    airspeeders: { rec: 'T47AIRSPEEDER',
      zone: { c: T47.p([266, 333]), r: 4.2 }, carries: ['TRANSPORT', 'SUPPORT', 'FREIGHTER', 'GUNSHIP'],
      parts: [
        sym(T47.pts([[266, 96], [165, 70], [14, 400], [9, 470], [6, 545], [100, 575], [112, 575], [118, 586], [157, 586], [160, 575], [266, 575]])),
        T47.pts(rect(138.2, 20, 153.8, 262)), mirror(T47.pts(rect(138.2, 20, 153.8, 262))),
        T47.pts(rect(135, 3, 157, 30)), mirror(T47.pts(rect(135, 3, 157, 30)))],
      cuts: [
        { id: 'barrel-lo', pts: T47.pts([[134, 133], [134, 205]]), through: true, group: 'barrel-l' }, { id: 'barrel-li', pts: T47.pts([[158, 90], [158, 205]]), through: true, group: 'barrel-l' },
        { id: 'barrel-ri', pts: mirror(T47.pts([[158, 90], [158, 205]])), through: true, group: 'barrel-r' }, { id: 'barrel-ro', pts: mirror(T47.pts([[134, 133], [134, 205]])), through: true, group: 'barrel-r' },
        { id: 'canopy', pts: T47.pts([[222, 193], [310, 193]]) },
        { id: 'nacelle-l', pts: T47.pts([[107, 320], [107, 400]]) }, { id: 'nacelle-r', pts: mirror(T47.pts([[107, 320], [107, 400]])) },
        { id: 'block-l', pts: T47.pts([[40, 437], [150, 437]]) }, { id: 'block-r', pts: mirror(T47.pts([[40, 437], [150, 437]])) },
        { id: 'brake-l', pts: T47.pts([[215, 522], [215, 580]]), through: true }, { id: 'brake-c', pts: T47.pts([[266, 522], [266, 580]]), through: true },
        { id: 'brake-r', pts: mirror(T47.pts([[215, 522], [215, 580]])), through: true }],
      ports: [] },
    landspeeders: { rec: 'X34SPEEDER',
      zone: { c: X34.p([93.5, 223]), r: 3.7 }, cutMin: 56, carries: ['TRANSPORT', 'PERSONAL', 'FREIGHTER'],
      parts: [
        sym(X34.pts([[93.5, 14], [88, 14.5], [80, 17], [70, 22], [62, 30], [56, 38], [52, 46], [49, 54], [47, 62], [45, 70], [44, 78], [44, 200], [37, 213], [29, 219],
          [29, 257], [35, 262], [46, 270], [52, 278], [80, 284], [80, 330], [84, 337], [93.5, 339]])),
        X34.pts([[8, 204], [24, 204], [29, 211], [29, 266], [25, 270], [7, 270], [3, 266], [3, 211]]),
        mirror(X34.pts([[8, 204], [24, 204], [29, 211], [29, 266], [25, 270], [7, 270], [3, 266], [3, 211]]))],
      cuts: [
        { id: 'turbine-l', pts: X34.pts([[31, 208], [31, 266]]), through: true }, { id: 'turbine-r', pts: mirror(X34.pts([[31, 208], [31, 266]])), through: true },
        { id: 'windscreen', pts: r3(arc(12, X34.p([93.5, 170])[1], X34.len(48), -45, 45, 10)) },
        { id: 'nose', pts: X34.pts([[93.5, 40], [93.5, 102]]) }],
      ports: [] },
    walkers_tanks: { rec: 'ATAT',
      zone: { c: AT.p([230, 466]), r: 2.7 }, cutMin: 56, carries: ['SUPPORT', 'WALKER & TANK'],
      parts: [
        sym(AT.pts([[230, 8], [200, 8], [184, 30], [182, 140], [205, 146], [205, 185], [185, 185], [145, 215], [145, 625], [185, 655], [230, 655]]))]
        .concat(foot(140, 300, -1), foot(320, 300, 1), foot(140, 600, -1), foot(320, 600, 1)),
      cuts: [
        { id: 'neck', pts: AT.pts([[198, 185], [262, 185]]), through: true },
        { id: 'vents', pts: AT.pts([[190, 300], [270, 300]]) },
        { id: 'hip-fl', pts: AT.pts([[145, 243], [145, 357]]), through: true }, { id: 'hip-fr', pts: AT.pts([[315, 243], [315, 357]]), through: true },
        { id: 'hip-al', pts: AT.pts([[145, 568], [145, 657]]), through: true }, { id: 'hip-ar', pts: AT.pts([[315, 568], [315, 657]]), through: true }],
      ports: [{ id: 'hatch', c: AT.p([272, 348]) }] },
    // the M3185 station (D-208, D-209): a station has no fore; UP is the axis through its two truss arcs. Its class sits IN INK in
    // the open centre (`classInk`).
    stations: { rec: 'GOLAN1SPACEDEF',
      zone: { c: [12, 12], r: 2.3 }, classInk: true, cutMin: 28, carries: ['SUPPORT'],
      parts: [
        cat(arc(12, 12, 9.0, -54, 54, 28), arc(12, 12, 5.3, 54, -54, 20)), cat(arc(12, 12, 9.0, 126, 234, 28), arc(12, 12, 5.3, 234, 126, 20)),
        cat(arc(12, 12, 9.0, 52, 128, 24), arc(12, 12, 3.3, 128, 52, 16)), cat(arc(12, 12, 9.0, 232, 308, 24), arc(12, 12, 3.3, 308, 232, 16)),
        crescent(12, 12, 3.45, 0.9, 10, 170), mirror(crescent(12, 12, 3.45, 0.9, 10, 170)),
        spoke(12, 12, 86, 8.0, 11.5, 0.5, 1.26), spoke(12, 12, 94, 8.0, 11.5, 0.5, -1.26), spoke(12, 12, 274, 8.0, 11.5, 0.5, -1.26), spoke(12, 12, 266, 8.0, 11.5, 0.5, 1.26),
        spoke(12, 12, 53, 8.4, 10.1, 0.55, 0), spoke(12, 12, 127, 8.4, 10.1, 0.55, 0), spoke(12, 12, 233, 8.4, 10.1, 0.55, 0), spoke(12, 12, 307, 8.4, 10.1, 0.55, 0)],
      cuts: [
        { id: 'truss-top', pts: zig(12, 12, 6.25, 8.05, -44, 44, 8) }, { id: 'truss-bottom', pts: zig(12, 12, 6.25, 8.05, 136, 224, 8) },
        { id: 'truss-top-coarse', pts: zig(12, 12, 6.6, 7.7, -36, 36, 4) }, { id: 'truss-bottom-coarse', pts: zig(12, 12, 6.6, 7.7, 144, 216, 4) }],
      ports: [] },
    // UTILITY (C), the crate with its coupling lugs, no wrench of its own (D-206): every support record that is not a station
    utility_c: { rec: null,
      zone: { c: [12, 12], r: 4.6 }, carries: ['GUNSHIP', 'PERSONAL', 'SUPPORT', 'FREIGHTER', 'WALKER & TANK', 'WARSHIP', 'STARFIGHTER'],
      parts: [rect(3.4, 3.2, 20.6, 20.8), rect(9.6, 1.0, 14.4, 3.2), rect(9.6, 20.8, 14.4, 23.0), rect(1.2, 9.6, 3.4, 14.4), rect(20.6, 9.6, 22.8, 14.4)],
      cuts: [{ id: 'lug-n', pts: [[9.4, 3.2], [14.6, 3.2]], through: true }, { id: 'lug-s', pts: [[9.4, 20.8], [14.6, 20.8]], through: true }],
      ports: [] },
  };
  var FAMILIES = ['starfighters', 'capital_ships', 'freighters', 'transports', 'patrol_gunships', 'landspeeders', 'airspeeders', 'walkers_tanks', 'stations', 'utility_c'];
  // THE SPLIT RULE (D-205), the only place a record's family is decided: a support record whose category_subtype includes
  // "Station" (an element of the list, or the string itself; never a substring) is a STATION; every other support record is UTILITY.
  function isStation(rec) { var c = rec.category_subtype; return Array.isArray(c) ? c.indexOf('Station') >= 0 : c === 'Station'; }
  function famOf(rec) { if (rec.category !== 'support') return rec.category; return isStation(rec) ? 'stations' : 'utility_c'; }

  // ── THE CLASS PICTOGRAMS (D-201): NAV_ICONS' format on Lucide's 24-grid (ISC); WALKER & TANK is the tank SHELL (D-205).
  // `ext`: the pictogram's extent radius from (12, 12) on its grid, stroke excluded.
  var PICTOS = {
    'STARFIGHTER':   { lucide: 'crosshair', ext: 10, d: [['c', 12, 12, 10], ['l', 22, 12, 18, 12], ['l', 6, 12, 2, 12], ['l', 12, 6, 12, 2], ['l', 12, 22, 12, 18]] },
    'PERSONAL':      { lucide: 'user', ext: 11.4, d: [['p', 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2'], ['c', 12, 7, 4]] },
    'TRANSPORT':     { lucide: 'users', ext: 13.45, d: [['p', 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2'], ['p', 'M16 3.128a4 4 0 0 1 0 7.744'], ['p', 'M22 21v-2a4 4 0 0 0-3-3.87'], ['c', 9, 7, 4]] },
    'FREIGHTER':     { lucide: 'package', ext: 10.06, d: [['p', 'M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z'], ['p', 'M12 22V12'], ['p', 'm3.3 7 7.703 4.734a2 2 0 0 0 1.994 0L20.7 7'], ['p', 'm7.5 4.27 9 5.15']] },
    'GUNSHIP':       { lucide: 'target', ext: 10, d: [['c', 12, 12, 10], ['c', 12, 12, 6], ['c', 12, 12, 2]] },
    'WARSHIP':       { lucide: 'chevrons-up', ext: 7.81, d: [['p', 'm17 11-5-5-5 5'], ['p', 'm17 18-5-5-5 5']] },
    'SUPPORT':       { lucide: 'wrench', ext: 11.85, d: [['p', 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z']] },
    'WALKER & TANK': { lucide: 'adapted: a tank round in Lucide\'s idiom', ext: 10.55, d: [['p', 'M8.5 21V13c0-4.4 1.4-7.6 3.5-10.6 2.1 3 3.5 6.2 3.5 10.6v8'], ['p', 'M8.5 13h7'], ['p', 'M6.5 21h11']] },
  };
  var MARKS = ['STARFIGHTER', 'PERSONAL', 'TRANSPORT', 'FREIGHTER', 'GUNSHIP', 'WARSHIP', 'WALKER & TANK', 'SUPPORT'];
  function extOf(m) { return PICTOS[m] ? PICTOS[m].ext : 0; }
  function carriedExt(fam) { var e = 0; SHAPES[fam].carries.forEach(function (m) { e = Math.max(e, extOf(m)); }); return e; }

  // ── THE CLASS FOLD (D-195, lab v2/fold8.json): the book's `type` → its class. A type missing here draws the family glyph
  // with NO class mark, and `test/ship_identifier_fold.cjs` reports it — it is never guessed (R-SSG-1).
  var FOLD_MARKS = [
    ['STARFIGHTER', ['Starfighter', 'Droid Fighter', 'Variable Geometry Self-Propelled Battle Droid', 'Cloud Car']],
    ['PERSONAL', ['Speeder Bike', 'Swoop', 'Wheel Bike', 'Personal Speeder', 'Foot Speeder', 'Jet Pack', 'Rocket Boots', 'Jump Boots', 'Drop Suit', 'Podracer', 'Racing Vessel']],
    ['TRANSPORT', ['Landspeeder', 'Groundcar', 'Heavy Landspeeder', 'Airspeeder', 'Aquaspeeder', 'Swamp Speeder', 'Transport Airspeeder', 'Shuttle', 'Transport', 'Troop Transport', 'Landing Ship', 'Salon Pod', 'Yacht']],
    ['FREIGHTER', ['Light Freighter', 'Freighter', 'Bulk Freighter', 'Bulk Transport', 'Heavy Transport', 'Cargo Shuttle', 'Speeder Truck', 'Cargo Floater', 'Repulsorsled', 'Heavy Cargo Loader', 'Barge', 'Sail Barge', 'Cargo Skiff', 'Air Skiff/Hauler', 'Mobile Refinery']],
    ['GUNSHIP', ['Patrol Boat', 'Patrol Cruiser', 'Gunship', 'Assault Ship', 'Boarding Vessel', 'Light Assault Transport', 'Armored Transport', 'Droid Gunship', 'Planetary Assault Ship', 'Orbital Assault Pod', 'Heavy Assault Airspeeder', 'Combat Speeder']],
    ['WARSHIP', ['Corvette', 'Frigate', 'Light Cruiser', 'Cruiser', 'Heavy Cruiser', 'Bulk Cruiser', 'Heavy Star Cruiser', 'Destroyer', 'Star Destroyer', 'Battleship', 'Battlecruiser', 'Star Battlecruiser', 'Dreadnought', 'Carrier', 'Herd Ship']],
    ['WALKER & TANK', ['Walker', 'Heavy Assault Walker', 'Personal Scout Walker', 'Repulsor Tank', 'Armored Personnel Carrier', 'Armored Fighting Vehicle', 'Droid Tank']],
    ['SUPPORT', ['Courier', 'Scout Ship', 'Sloop', 'Pursuit Craft', 'Survey Vessel', 'Science Vessel', 'Recon Airspeeder', 'Drone', 'Space Station', 'Mobile Space Dock', 'Hyperdrive Docking Ring', 'Hyperdrive Sled', 'Field Equipment', 'Submersible', 'Tunneling Vehicle', 'Droid-Operated Vehicle', 'Space-dwelling Creature']],
  ];
  var FOLD = {};
  FOLD_MARKS.forEach(function (m) { m[1].forEach(function (t) { FOLD[t] = m[0]; }); });
  function markFor(type) { return Object.prototype.hasOwnProperty.call(FOLD, type) ? FOLD[type] : null; }

  // THE TWO WIDTHS. PSW: the class pictogram's stroke in its OWN 24-grid (the nav bar's 2). CW: the detail cut, in the cell's
  // final units — ONE width on every family and band. A port's diameter is 2 × CW.
  var PSW = 2.0, CW = 0.62;
  var DETAIL_MIN_PX = 36, CUT_MIN_PX = 54;   // measured by the lab (CUTS floor; the SWITCH)
  // THE BESIDE LAYOUT (R-SSG-19): the pictogram to the RIGHT of the glyph, drawn as a nav-bar icon (stroke 2, round caps), centred
  // on the glyph's centre line; its tile is the glyph's DRAWN height, never under navMin px nor over the host; a quarter-tile gap.
  var BESIDE = { side: 'right', gap: 0.25, minGap: 2, navMin: 14 };
  function cutMinOf(fam) { var F = SHAPES[fam]; return F && F.cutMin != null ? F.cutMin : CUT_MIN_PX; }

  // ── SIZE (D-202 (iii)): each band a bigger, heavier glyph, [scale, width factor] ──
  var BANDS = [{ id: 'S', lo: 0, hi: 2, s: 0.56, w: 0.86 }, { id: 'M', lo: 3, hi: 4, s: 0.7, w: 0.94 }, { id: 'L', lo: 5, hi: 6, s: 0.84, w: 1.02 },
    { id: 'XL', lo: 7, hi: 99, s: 1.0, w: 1.1 }];
  function bandOf(sil) { var n = Number(sil); if (sil == null || !isFinite(n)) return null; for (var i = 0; i < BANDS.length; i++) if (n <= BANDS[i].hi) return BANDS[i]; return BANDS[3]; }
  function tf(b) { return b ? function (p) { return [12 + (p[0] - 12) * b.s * b.w, 12 + (p[1] - 12) * b.s]; } : function (p) { return p; }; }
  function bandScale(b) { return b ? b.s : 1; }

  // ── THE DROP RULE, in final coordinates: a cut is kept only when it clears the outline, the class zone and every kept cut by
  // CW, is at least 3 CW long and lies on the solid; a group with any member dropped is dropped whole ──
  function segDist(p, a, b) { var dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0;
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); }
  function inPoly(p, poly) { var c = false; for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) { var a = poly[i], b = poly[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
  function densify(pts, closed, step) { var o = [], n = pts.length, m = closed ? n : n - 1;
    for (var i = 0; i < m; i++) { var a = pts[i], b = pts[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.max(1, Math.ceil(L / step));
      for (var j = 0; j < k; j++) o.push([a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k]); }
    if (!closed) o.push(pts[n - 1]); return o; }
  function plen(pts, closed) { var L = 0; for (var i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (closed) L += Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]); return L; }
  // the union's boundary, sampled: every part's edge point not strictly inside another part
  function boundary(parts) { var o = []; parts.forEach(function (P, i) { densify(P, true, 0.05).forEach(function (p) {
    for (var j = 0; j < parts.length; j++) if (j !== i && inPoly(p, parts[j])) { var d = 1e9, Q = parts[j]; for (var k = 0; k < Q.length; k++) d = Math.min(d, segDist(p, Q[k], Q[(k + 1) % Q.length])); if (d > 0.02) return; }
    o.push(p); }); }); return o; }
  function minDist(A, B) { var d = 1e9; for (var i = 0; i < A.length; i++) for (var j = 0; j < B.length; j++) { var x = Math.hypot(A[i][0] - B[j][0], A[i][1] - B[j][1]); if (x < d) d = x; } return d; }
  function zoneOf(fam, b) { var F = SHAPES[fam], T = tf(b), s = bandScale(b), r = F.zone.r * s, k = r / (carriedExt(fam) + PSW / 2);
    return { c: T(F.zone.c), k: k, sw: PSW * k, r: r }; }
  var PLAN = {};   // a family × band's plan is pure: computed once, kept
  function plan(fam, b) {
    var key = fam + '|' + (b ? b.id : 'none');
    if (PLAN[key]) return PLAN[key];
    var F = SHAPES[fam], T = tf(b), parts = F.parts.map(function (P) { return P.map(T); }), B = boundary(parts), Z = zoneOf(fam, b), kept = [], rows = [];
    var items = F.cuts.map(function (c) { return { id: c.id, kind: 'line', pts: c.pts.map(T), closed: !!c.closed, through: !!c.through, group: c.group || c.id }; })
      .concat((F.ports || []).map(function (p) { return { id: p.id, kind: 'port', pts: [T(p.c)], group: p.id }; }));
    items.forEach(function (it) {
      var S = it.kind === 'port' ? it.pts : densify(it.pts, it.closed, 0.05), half = it.kind === 'port' ? CW : CW / 2, why = [];
      var toOut = minDist(S, B) - half;
      if (!it.through && toOut < CW) why.push('outline ' + f3(toOut));
      var toZone = Math.min.apply(null, S.map(function (p) { return Math.hypot(p[0] - Z.c[0], p[1] - Z.c[1]); })) - half - Z.r;
      if (toZone < CW) why.push('zone ' + f3(toZone));
      kept.forEach(function (o) { if (o.group === it.group) return; var d = minDist(S, o.S) - half - o.half; if (d < CW) why.push(o.id + ' ' + f3(d)); });
      if (it.kind === 'line' && plen(it.pts, it.closed) < 3 * CW) why.push('length ' + f3(plen(it.pts, it.closed)));
      var off = S.filter(function (p) { return !parts.some(function (P) { return inPoly(p, P); }); }).length;
      if (!it.through && off) why.push('off the solid ' + off);
      rows.push({ id: it.id, kind: it.kind, kept: !why.length, why: why });
      if (!why.length) kept.push({ id: it.id, group: it.group, S: S, half: half, it: it });
    });
    var broken = {}; rows.forEach(function (r, i) { if (!r.kept && items[i].group !== items[i].id) broken[items[i].group] = r.id; });
    rows.forEach(function (r, i) { var g = items[i].group; if (r.kept && broken[g]) { r.kept = false; r.why.push('group ' + g + ' (' + broken[g] + ' dropped)'); } });
    kept = kept.filter(function (k) { return !broken[k.group]; });
    PLAN[key] = { fam: fam, band: b ? b.id : 'none', parts: parts, zone: Z, kept: kept.map(function (k) { return k.it; }), rows: rows };
    return PLAN[key];
  }

  // each drawing's own mask and hatch ids (a page draws many identifiers)
  var uid = 0;
  function nid(p) { uid += 1; return p + uid; }
  function ptsD(pts, closed) { return 'M' + pts.map(function (p) { return f3(p[0]) + ' ' + f3(p[1]); }).join(' L') + (closed ? ' Z' : ''); }

  function pictoNode(h, prim, i, sw, paint) {
    var a = { key: 'q' + i, fill: 'none', stroke: paint, strokeWidth: sw, strokeLinecap: 'round', strokeLinejoin: 'round' };
    if (prim[0] === 'p') return h('path', Object.assign(a, { d: prim[1] }));
    if (prim[0] === 'c') return h('circle', Object.assign(a, { cx: prim[1], cy: prim[2], r: prim[3] }));
    if (prim[0] === 'l') return h('line', Object.assign(a, { x1: prim[1], y1: prim[2], x2: prim[3], y2: prim[4] }));
    throw new Error('pictogram primitive ' + prim[0]);
  }
  function signNodes(h, Z, mark, paint) {
    var P = PICTOS[mark];
    if (!P) return [];
    var k = Math.min(Z.k, Z.r / ((P.ext || 0) + PSW / 2));   // a class the family never carries, wider than its zone, is shrunk to fit
    return [h('g', { key: 'k', 'data-cut': 'class', 'data-k': f3(k), transform: 'translate(' + f3(Z.c[0]) + ' ' + f3(Z.c[1]) + ') scale(' + f3(k) + ') translate(-12 -12)' },
      P.d.map(function (prim, i) { return pictoNode(h, prim, i, PSW, paint); }))];
  }
  function detailNodes(h, PL, paint) {
    return PL.kept.map(function (c) {
      if (c.kind === 'port') return h('circle', { key: 'c' + c.id, 'data-cut': 'detail', 'data-id': c.id, cx: f3(c.pts[0][0]), cy: f3(c.pts[0][1]), r: f3(CW), fill: paint });
      return h('path', { key: 'c' + c.id, 'data-cut': 'detail', 'data-id': c.id, d: ptsD(c.pts, c.closed), fill: 'none', stroke: paint, strokeWidth: CW, strokeLinecap: 'round', strokeLinejoin: 'round' });
    });
  }

  // THE ICON in its 24-unit cell: the glyph's parts in ink through a mask that cuts the kept detail and the class knockout.
  // o.band: a band object (default: the record's); o.detail false drops every detail cut; o.beside leaves the class out of the cell.
  function iconNodes(h, rec, ink, o) {
    o = o || {};
    var fam = famOf(rec), F = SHAPES[fam];
    if (!F) return { kids: [], fam: null, mark: null };
    var mark = markFor(rec.type);
    var b = o.band === undefined ? bandOf(rec.silhouette) : o.band, PL = plan(fam, b), id = nid('shid-m');
    var cut = o.beside ? null : mark;
    var maskKids = [h('rect', { key: 'w', x: -4, y: -4, width: 32, height: 32, fill: '#fff' })]
      .concat(o.detail === false ? [] : [h('g', { key: 'dc', className: 'g6-detail', 'data-part': 'detail', 'data-band': PL.band }, detailNodes(h, PL, '#000'))])
      .concat(F.classInk ? [] : signNodes(h, PL.zone, cut, '#000'));
    var body = PL.parts.map(function (P, i) { return h('path', { key: 'p' + i, d: ptsD(P, true), fill: ink }); });
    var kids = [
      h('defs', { key: 'd' }, h('mask', { id: id, maskUnits: 'userSpaceOnUse', x: -4, y: -4, width: 32, height: 32 }, maskKids)),
      h('g', { key: 'g', className: 'g3-icon', 'data-part': 'icon', 'data-field': 'category type silhouette', 'data-family': fam, 'data-mark': mark || '',
        'data-sil': rec.silhouette == null ? '' : rec.silhouette, 'data-band': PL.band, 'data-detail': o.detail === false ? 0 : PL.kept.length },
        [h('g', { key: 'b', mask: 'url(#' + id + ')', className: 'g3-body', 'data-part': 'silhouette', 'data-field': rec.category === 'support' ? 'category category_subtype' : 'category' }, body)]
          // a `classInk` family draws its class in ink on the ground of its zone (never through the mask)
          .concat(F.classInk && cut ? [h('g', { key: 'ci', className: 'g9-class-ink', 'data-part': 'class-ink', 'data-field': 'type', 'data-mark': cut }, signNodes(h, PL.zone, cut, ink))] : [])),
    ];
    return { kids: kids, fam: fam, mark: mark, plan: PL };
  }
  // the class pictogram drawn alone, as navIcon draws a nav-bar icon (the BESIDE form)
  function navNodes(h, mark, ink) {
    var P = PICTOS[mark];
    if (!P) return [];
    return P.d.map(function (prim, i) { return pictoNode(h, prim, i, 2, ink); });
  }
  function besideLayout(b, px) {
    var s = bandScale(b), w = b ? b.w : 1, tile = Math.min(24, Math.max(24 * s, 24 * BESIDE.navMin / px));
    var gap = Math.max(BESIDE.gap * tile, BESIDE.minGap * 24 / px), right = 12 + 12 * s * w;
    return { tile: tile, gap: gap, right: right, x: right + gap };
  }
  function labelOf(rec) { return (rec.name || rec.category) + (rec.type ? ', ' + rec.type : ''); }

  // SMALL: the glyph at its band; detail from DETAIL_MIN_PX; the class cut in from a drawn size of the family's cutMin, else beside.
  function Small(h, props) {
    var rec = props.rec, ink = props.ink, px = props.size;
    var b0 = bandOf(rec.silhouette);
    var form = px * bandScale(b0) >= cutMinOf(famOf(rec)) ? 'cut' : 'beside';
    var detail = px >= DETAIL_MIN_PX;
    var ic = iconNodes(h, rec, ink, { detail: detail, beside: form === 'beside' });
    var glyph = ic.kids, label = labelOf(rec);
    if (form !== 'beside' || !ic.mark || !PICTOS[ic.mark]) {
      return h('svg', { viewBox: '0 0 24 24', width: px, height: px, role: 'img', className: 'g3-small', 'data-form': 'small', 'data-class-form': 'cut', 'data-size': 'iii',
        'data-detail': detail ? 1 : 0, style: null, 'aria-label': label }, glyph);
    }
    var bl = besideLayout(b0, px), W = bl.x + bl.tile;
    return h('svg', { viewBox: '0 0 ' + f3(W) + ' 24', width: f3(px * W / 24), height: px, role: 'img', className: 'g3-small', 'data-form': 'small', 'data-class-form': 'beside',
      'data-size': 'iii', 'data-detail': detail ? 1 : 0, style: null, 'aria-label': label },
      [h('g', { key: 'gl' }, glyph), h('g', { key: 'bs', className: 'g6-beside', 'data-part': 'class-beside', 'data-field': 'type', 'data-mark': ic.mark,
        transform: 'translate(' + f3(bl.x) + ' ' + f3(12 - bl.tile / 2) + ') scale(' + f3(bl.tile / 24) + ')' }, navNodes(h, ic.mark, ink))]);
  }

  // ── FULL (the lab's LARGE, D-202): the glyph at its LARGE band in the S2 shield ring, the arc wedges with their counts ──
  var L = { W: 100, cx: 50, cy: 48, cell: 2.6, R: 34, ri: 39.6, ro: 45.4, H: 104, Hkey: 125 };
  function polar(cx, cy, r, deg) { var a = deg * Math.PI / 180; return { x: cx + r * Math.sin(a), y: cy - r * Math.cos(a) }; }
  function f2(n) { return +n.toFixed(2); }
  function sector(cx, cy, ri, ro, a1, a2) {
    var p1 = polar(cx, cy, ro, a1), p2 = polar(cx, cy, ro, a2), p3 = polar(cx, cy, ri, a2), p4 = polar(cx, cy, ri, a1);
    var f = function (p) { return f2(p.x) + ' ' + f2(p.y); };
    return 'M' + f(p1) + ' A' + ro + ' ' + ro + ' 0 0 1 ' + f(p2) + ' L' + f(p3) + ' A' + ri + ' ' + ri + ' 0 0 0 ' + f(p4) + ' Z';
  }
  // the weapons in each arc, counted (a turret fires in all four; a weapon's count multiplies)
  function arcCounts(rec) {
    var c = { fore: 0, aft: 0, port: 0, starboard: 0, dorsal: 0, ventral: 0 }, ws = Array.isArray(rec.weapons) ? rec.weapons : [];
    ws.forEach(function (w) {
      var fa = w.firing_arcs || {}, n = w.count == null ? 1 : Number(w.count), arcs = {};
      Object.keys(c).forEach(function (k) { if (fa[k]) arcs[k] = 1; });
      if (w.turret) ['fore', 'aft', 'port', 'starboard'].forEach(function (k) { arcs[k] = 1; });
      Object.keys(arcs).forEach(function (k) { c[k] += n; });
    });
    return { counts: c, armed: ws.length > 0 };
  }
  function shieldNodes(h, rec, ink, ground) {
    var zones = deriveZones(rec.defense, rec.silhouette), out = [], gap = zones.length === 2 ? 16 : 12, R = L.R;
    zones.forEach(function (z) {
      var a1 = z.a1 + gap / 2, a2 = z.a2 - gap / 2, on = z.defense > 0, kids = [], sweep = ((a2 - a1) % 360 + 360) % 360;
      var p1 = polar(L.cx, L.cy, R, a1), p2 = polar(L.cx, L.cy, R, a2);
      kids.push(h('path', { key: 'arc', className: 'g3-zarc', 'data-on': on ? 1 : 0, d: 'M' + f2(p1.x) + ' ' + f2(p1.y) + ' A' + R + ' ' + R + ' 0 ' + (sweep > 180 ? 1 : 0) + ' 1 ' + f2(p2.x) + ' ' + f2(p2.y),
        fill: 'none', stroke: ink, strokeWidth: on ? 1.6 : 0.9, strokeDasharray: on ? null : '2 2.4', strokeLinecap: on ? 'round' : 'butt' }));
      var nq = polar(L.cx, L.cy, R, z.mid);
      kids.push(h('circle', { key: 'node', className: 'g3-znode', 'data-on': on ? 1 : 0, cx: f2(nq.x), cy: f2(nq.y), r: 5.2, fill: on ? ink : ground, stroke: ink, strokeWidth: 0.9 }));
      kids.push(h('text', { key: 'num', className: 'g3-znum', 'data-on': on ? 1 : 0, x: f2(nq.x), y: f2(nq.y + 2.5), textAnchor: 'middle', fontFamily: 'var(--font-mono)', fontSize: 7, fontWeight: 700,
        fill: on ? ground : ink }, String(z.defense)));
      out.push(h('g', { key: 'z' + z.id, className: 'g3-zone', 'data-part': 'zone', 'data-field': 'defense', 'data-datum': 'defense.' + z.id, 'data-enc': 'numeral', 'data-value': z.defense }, kids));
    });
    return out;
  }
  function arcNodes(h, rec, ink, ground, hatchId) {
    var A = arcCounts(rec), kids = [], Q = { fore: 0, starboard: 90, aft: 180, port: 270 };
    ['fore', 'starboard', 'aft', 'port'].forEach(function (k) {
      var n = A.counts[k], on = n > 0, m = Q[k], g = [];
      if (A.armed) g.push(h('path', { key: 'w', className: 'g3-wedge', 'data-on': on ? 1 : 0, d: sector(L.cx, L.cy, L.ri, L.ro, m - 38, m + 38), fill: on ? 'url(#' + hatchId + ')' : 'none', stroke: ink,
        strokeWidth: on ? 0.9 : 0.8, strokeDasharray: on ? null : '1.6 2' }));
      if (on) { var tp = polar(L.cx, L.cy, (L.ri + L.ro) / 2, m);
        g.push(h('rect', { key: 'nb', className: 'g3-wnumbg', x: f2(tp.x - 4.6), y: f2(tp.y - 3.6), width: 9.2, height: 7.2, rx: 1.2, fill: ground, stroke: ink, strokeWidth: 0.7 }));
        g.push(h('text', { key: 'n', className: 'g3-wnum', x: f2(tp.x), y: f2(tp.y + 2.4), textAnchor: 'middle', fontFamily: 'var(--font-mono)', fontSize: 6.6, fontWeight: 700, fill: ink }, String(n))); }
      kids.push(h('g', { key: 'a' + k, className: 'g3-arc', 'data-part': 'arc', 'data-field': 'weapons.firing_arcs', 'data-datum': 'arc.' + k, 'data-enc': 'wedge+count', 'data-value': A.counts[k] }, g));
    });
    if (!A.armed) kids.push(h('g', { key: 'none', className: 'g3-arc', 'data-part': 'unarmed', 'data-field': 'weapons', 'data-datum': 'arc.none', 'data-value': 0 },
      [h('circle', { key: 'c', cx: L.cx, cy: L.cy, r: (L.ri + L.ro) / 2, fill: 'none', stroke: ink, strokeWidth: 0.8, strokeDasharray: '1.6 2' })]));
    var y = L.H - 3;
    if (A.armed) [['dorsal', 'DORSAL', 50 - 3], ['ventral', 'VENTRAL', 50 + 3]].forEach(function (dv, i) {
      var n = A.counts[dv[0]];
      kids.push(h('g', { key: dv[0], className: 'g3-arc', 'data-part': 'arc', 'data-field': 'weapons.firing_arcs', 'data-datum': 'arc.' + dv[0], 'data-enc': 'arcword', 'data-value': n },
        [h('text', { key: 't', x: dv[2], y: y, textAnchor: i ? 'start' : 'end', fontFamily: 'var(--font-mono)', fontSize: 6.2, letterSpacing: '0.04em', fill: ink }, dv[1] + ' ' + n)]));
    });
    else kids.push(h('g', { key: 'nonew', className: 'g3-arc', 'data-part': 'unarmed', 'data-field': 'weapons', 'data-datum': 'arc.noneword', 'data-value': 0 },
      [h('text', { key: 't', x: 50, y: y, textAnchor: 'middle', fontFamily: 'var(--font-mono)', fontSize: 6.2, letterSpacing: '0.04em', fill: ink }, 'WEAPONS none')]));
    return h('g', { key: 'arcs', className: 'g3-arcs', 'data-layer': 'arcs' }, kids);
  }
  // FULL draws the glyph at the record's own band, detail always on. AS DRAWN (C-MU-4): the lab module's `largeBand` (a milder
  // curve, S 0.72 · M 0.81 · L 0.91) never reached a drawing — its plan cache was keyed by the band's id, so every LARGE it drew
  // reused the SMALL band's plan (32 of 32 on the approved v9 board; every catalogue photograph). The approved look is that one.
  var KEY_LINE = ['RING: each zone\'s Defense', 'dashed = 0', 'WEDGES: arcs that fire'];
  function Large(h, rec, ink, ground, props) {
    var o = props || {}, hatchId = nid('shid-h');
    var ic = iconNodes(h, rec, ink, { band: bandOf(rec.silhouette), detail: true });
    var s = L.cell, off = [L.cx - 12 * s, L.cy - 12 * s];
    var kids = [h('g', { key: 'icon', transform: 'translate(' + off[0] + ' ' + off[1] + ') scale(' + s + ')' }, ic.kids)];
    kids.push(h('g', { key: 'shields', className: 'g3-shields', 'data-layer': 'shields' }, shieldNodes(h, rec, ink, ground)));
    kids.push(arcNodes(h, rec, ink, ground, hatchId));
    kids.unshift(h('defs', { key: 'hd' }, h('pattern', { id: hatchId, width: 2.2, height: 2.2, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' },
      h('rect', { width: 1.0, height: 2.2, fill: ink }))));
    var H = o.key ? L.Hkey : L.H;
    if (o.key) kids.push(h('g', { key: 'key', className: 'g3-key', 'data-part': 'key', 'data-field': 'defense' },
      KEY_LINE.map(function (t, i) { return h('text', { key: 'k' + i, x: 50, y: L.H + 5 + 6.2 * i, textAnchor: 'middle', fontFamily: 'var(--font-mono)', fontSize: 4.8,
        letterSpacing: '0.02em', fill: ink }, t); })));
    return h('svg', { viewBox: '0 0 ' + L.W + ' ' + H, width: o.size, height: +(o.size * H / L.W).toFixed(1), role: 'img', className: 'g3-large', 'data-form': 'large',
      'aria-label': rec.name + ', ' + rec.type }, kids);
  }

  // ── THE PLACEMENT TABLE (D-212; card §2, R-SSB-3, R-SSB-11): a host id → its form. `fullFrom`: a "full when wide" host turns FULL at
  // that slot width (px) and up; `key`: the key line (only where the notation is learned: the entry's Plate 1 and Plate 2, both ≥ 130
  // px). The GM Matrix's dark registry tiles are RETIRED (D-198, D-212) and have no row. ──
  var HOSTS = {
    'hangar-hero':     { n: 1,  form: 'full' },
    'hangar-row':      { n: 2,  form: 'small', fullFrom: 260 },
    'hangar-orphan':   { n: 3,  form: 'small', fullFrom: 260 },
    'unit-flagship':   { n: 4,  form: 'full' },
    'unit-fleet':      { n: 5,  form: 'small' },
    'ship-head':       { n: 6,  form: 'small', fullFrom: 200 },
    'sheet-vessel':    { n: 7,  form: 'small' },
    'cat-grid':        { n: 8,  form: 'full' },
    'cat-list':        { n: 9,  form: 'small' },
    'cat-compare':     { n: 10, form: 'small' },
    'cat-shelf':       { n: 11, form: 'full' },
    'entry-plate1':    { n: 12, form: 'full', key: true },
    'entry-family':    { n: 13, form: 'full' },
    'plan-head':       { n: 14, form: 'full' },
    'fit-ring':        { n: 15, form: 'full' },
    'fit-phone-ring':  { n: 15, form: 'full' },
    'entry-plate2':    { n: 16, form: 'full', key: true },
    'npc-craft':       { n: 17, form: 'small' },
    'fit-list-head':   { n: 15, form: 'full' },   // R-SSB-11: the workbench's FULL above the hard-point list when the ring is not drawn
  };
  // a host's form at its slot width; an unknown host is a defect, never a guess (the placement guard reads every call site)
  function formFor(host, w) {
    var H = HOSTS[host];
    if (!H) throw new Error('ship identifier — unknown host "' + host + '" (lib/shared/shipSchematic.js HOSTS)');
    return H.fullFrom != null && w != null && w >= H.fullFrom ? 'full' : H.form;
  }
  function keyFor(host) { return !!(HOSTS[host] && HOSTS[host].key); }

  // the paper inks (D-198, paper only): the frames' ink, and the mat it sits on (grounds/creator.css --doc-mat)
  var INK = '#241E30', GROUND = '#EDEBE4';

  // ── the component (browser render path; React captured lazily): the identifier for one vehicle at one host.
  // props: host (HOSTS id), w (the slot's width in px, for a "full when wide" host), size (the drawn px: SMALL's height, FULL's
  // width), rec (the vehicle record — name, type, category, category_subtype, silhouette, defense, weapons — with a workbench's
  // live shields and fitted weapons laid over it), name (the ship's own name for the label; else the record's). ──
  function Schematic(props) {
    var h = (typeof React !== 'undefined') ? React.createElement : function () { return null; };
    props = props || {};
    var rec = props.name ? Object.assign({}, props.rec, { name: props.name }) : props.rec;
    if (!rec) return null;
    var form = formFor(props.host, props.w);
    return form === 'full' ? Large(h, rec, INK, GROUND, { size: props.size, key: keyFor(props.host) })
      : Small(h, { rec: rec, size: props.size, ink: INK });
  }

  // ── SHIPYARD Y3a: vehicle combat-check difficulty from Table 7-4 (Silhouette Comparison, EotE p.235,
  //    print-verified C-Y1a; RULES_FOUNDATION_VEHICLES.md §3). RANGE does not affect it — only silhouette.
  //    diff = firer − target: ≥4 → Formidable(5) · 3 → Daunting(4) · 2 → Hard(3) · {−1,0,+1} → Average(2) ·
  //    ≤−2 → Easy(1). Pure + node-testable (R-RAWG1 guard derives expected FROM the printed table). ──
  function silhouetteDifficulty(firerSil, targetSil) {
    if (firerSil == null || targetSil == null) return null;
    var diff = firerSil - targetSil;
    var level, dice;
    if (diff >= 4) { level = 'formidable'; dice = 5; }
    else if (diff === 3) { level = 'daunting'; dice = 4; }
    else if (diff === 2) { level = 'hard'; dice = 3; }
    else if (diff <= -2) { level = 'easy'; dice = 1; }
    else { level = 'average'; dice = 2; }   // same, or firer ±1
    var LABEL = { easy: 'Easy', average: 'Average', hard: 'Hard', daunting: 'Daunting', formidable: 'Formidable' };
    return { level: level, dice: dice, label: LABEL[level], cite: 'EotE p.235' };
  }

  var api = {
    Schematic: Schematic,
    zonesForSilhouette: zonesForSilhouette,
    deriveZones: deriveZones,
    weaponArcs: weaponArcs,
    unionArcs: unionArcs,
    silhouetteDifficulty: silhouetteDifficulty,
    // the identifier's tables and forms (node guards render Small/Large with their own element builder)
    SHAPES: SHAPES, FAMILIES: FAMILIES, PICTOS: PICTOS, MARKS: MARKS, FOLD_MARKS: FOLD_MARKS, BANDS: BANDS, BESIDE: BESIDE, HOSTS: HOSTS,
    consts: { PSW: PSW, CW: CW, DETAIL_MIN_PX: DETAIL_MIN_PX, CUT_MIN_PX: CUT_MIN_PX }, INK: INK, GROUND: GROUND, KEY_LINE: KEY_LINE,
    isStation: isStation, famOf: famOf, markFor: markFor, bandOf: bandOf, cutMinOf: cutMinOf, plan: plan,
    arcCounts: arcCounts, formFor: formFor, keyFor: keyFor, Small: Small, Large: Large,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.SWRPGShipSchematic = api;
})(typeof window !== 'undefined' ? window : this);
