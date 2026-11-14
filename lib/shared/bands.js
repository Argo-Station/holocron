/**
 * bands.js — THE screen-width ladder, one home (audit item B; ruling ADAPTIVE_STANDARD §1).
 *
 * Three bands, three names, two seams — the law in Docs/ADAPTIVE_STANDARD.md, now readable by every
 * consumer instead of typed into each: `layout.js` (the 1024 seam), the creator's `useWideDesktop` /
 * `useCreatorBand` (the 1367 seam), the AS-9 sweep's BAND_SEAMS, the lab's audit ladder, and the
 * creator map's band line. Before this file the same two numbers were typed in six places under
 * three vocabularies (code: mobile/mid/wide · lab: handheld/mid-tier/wide/broad/room · census:
 * phone/narrow-tablet), which is one of the ways an agent reading two sources gets a contradiction.
 *
 * THE LAB'S LADDER IS A REFINEMENT, NOT A FOURTH VOCABULARY: `WIDE_LADDER` splits the WIDE band
 * (1367–2299 wide · 2300–2999 broad · ≥3000 room) for the board's frames; every rung is still WIDE
 * to the product. `handheld` was the lab's name for MOBILE and is retired here.
 *
 * Plain classic script, dual-exported (the sources.js idiom). Loaded NO-DEFER before layout.js.
 * Guard: test/bands_one_source.cjs (the standard's table, the smokes' seams and the lab's ladder
 * all equal this file).
 */
(function (root) {
  var BANDS = [
    { id: 'mobile', label: 'MOBILE',   min: 0,    max: 1023 },
    { id: 'mid',    label: 'MID-TIER', min: 1024, max: 1366 },
    { id: 'wide',   label: 'WIDE',     min: 1367, max: null },
  ];
  var SEAMS = [1024, 1367];
  var WIDE_LADDER = [
    { id: 'wide',  min: 1367, max: 2299 },
    { id: 'broad', min: 2300, max: 2999 },
    { id: 'room',  min: 3000, max: null },
  ];
  // The proof set every adaptive smoke visits (AS-9): straddles both seams on purpose.
  // Extended by the revision's AS-9 to the lab's broad/room rungs (2200 · 2560 · 3840) and 1280.
  var PROOF_WIDTHS = [390, 768, 1024, 1194, 1280, 1366, 1440, 1920, 2200, 2560, 3840];

  function bandOf(w) {
    w = Number(w) || 0;
    for (var i = BANDS.length - 1; i >= 0; i--) if (w >= BANDS[i].min) return BANDS[i].id;
    return BANDS[0].id;
  }
  function rungOf(w) {
    w = Number(w) || 0;
    if (w < SEAMS[1]) return bandOf(w);
    for (var i = WIDE_LADDER.length - 1; i >= 0; i--) if (w >= WIDE_LADDER[i].min) return WIDE_LADDER[i].id;
    return 'wide';
  }
  var api = {
    BANDS: BANDS, SEAMS: SEAMS, WIDE_LADDER: WIDE_LADDER, PROOF_WIDTHS: PROOF_WIDTHS,
    bandOf: bandOf, rungOf: rungOf,
    MQ_DESKTOP: '(min-width: ' + SEAMS[0] + 'px)',   // layout.js's seam (mobile | desktop)
    MQ_WIDE: '(min-width:' + SEAMS[1] + 'px)',        // the creator's / sheet's wide seam
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SWRPGBands = api;
})(typeof window !== 'undefined' ? window : this);
