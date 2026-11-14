/* diceUI.jsx — Shared dice-pool UI for SWRPG (loaded via <script type="text/babel" src="...">).
 *
 * Depends on:
 *   - window.SWRPGDice (from diceEngine.js)
 *   - React (global)
 *   - SWRPGIcons + Genesys fonts (loaded in <head>)
 *
 * Exposes (extends window.SWRPGDice):
 *   renderPool(pool)      — React fragment of pool symbols
 *   renderResults(r)      — React fragment of result symbols
 *
 * (InlinePoolPreview / RollResults / FloatingDiceButton removed in Lane B — 0 consumers after the
 *  modal was rebuilt on the shared components. The builder modal and its imperative opener — the old
 *  roll window — retired with B-1209 (D-172): their one caller, the crit plate's Medicine, opens the
 *  paper dice hub on that injury.)
 *
 * Design notes:
 * - This file is Babel-transpiled in the browser. Keep to ES2020 features that
 *   stable Babel-standalone handles (no top-level await, no decorators).
 * - All UI is opt-in; silent rolls use diceEngine directly.
 */
(function() {
  var D = window.SWRPGDice;
  if (!D) { console.warn('[diceUI] SWRPGDice not loaded'); return; }
  var h = React.createElement;

  // ── Symbol table (mirrors player.html FFG_SYMBOL but local so it works in both apps) ──
  var SYMBOLS = {
    /* INK IS KEYED BY THE SURFACE'S GROUND (F-101, ruling `visual-revision-concept` R-VR-3).
       ONE table, never a fork and never a global swap: each ink resolves `--doc-sym-<key>` if the
       surface it renders in declares one, and otherwise FALLS BACK to the value below — which is
       today's dark-ground ink, unchanged, so the instrument looks exactly as it always has.

       WHY THESE VALUES CANNOT SIMPLY TRAVEL TO PAPER: the B-11 note further down is the proof —
       dark-pip ink was tuned to clear 3:1 against the DARK DIE SILHOUETTE (#0c1019). An ink
       chosen for contrast on near-black has no claim to contrast on paper. A paper ground must
       therefore key EVERY symbol; `test/ground_token_contract.cjs` refuses a partial set, because
       a symbol left unkeyed silently renders its dark-tuned ink on paper and looks correct to
       whoever authored the ground while being unreadable to whoever uses it.

       Consumed at exactly one site (`color: sym.color`, below) as an inline style, so `var()`
       resolves; there is no canvas ink path where it would not. */
    // Die shapes (Genesys font) — EXCEPT `force`, which is SWRPGIcons and sits here because it
    // is a DIE, not a result. The old comment claimed Genesys for all seven and was false;
    // PRAXIS §6 names this exact conflation as the one that cannot be detected cheaply, so
    // the table's own comment must not be the thing that misleads. `test/dice_symbol_fonts`
    // legs in ground_token_contract pin every entry's font against its section.
    ability:     { char: 'k', color: 'var(--doc-sym-ability, #45AD48)', font: 'Genesys',    label: 'Ability' },
    proficiency: { char: 'l', color: 'var(--doc-sym-proficiency, #FDE600)', font: 'Genesys',    label: 'Proficiency' },
    boost:       { char: 'j', color: 'var(--doc-sym-boost, #80CEC4)', font: 'Genesys',    label: 'Boost' },
    difficulty:  { char: 'k', color: 'var(--doc-sym-difficulty, #A47BC7)', font: 'Genesys',    label: 'Difficulty' },
    challenge:   { char: 'l', color: 'var(--doc-sym-challenge, #CC3333)', font: 'Genesys',    label: 'Challenge' },
    setback:     { char: 'j', color: 'var(--doc-sym-setback, #AAAAAA)', font: 'Genesys',    label: 'Setback' },
    force:       { char: '\ue904', color: 'var(--doc-sym-force, #EEEEEE)', font: 'SWRPGIcons', label: 'Force' },
    // Result symbols (SWRPGIcons font)
    success:   { char: '\ue941', color: 'var(--doc-sym-success, #45AD48)', font: 'SWRPGIcons', label: 'Success' },
    failure:   { char: '\ue93b', color: 'var(--doc-sym-failure, #999999)', font: 'SWRPGIcons', label: 'Failure' },
    advantage: { char: '\ue936', color: 'var(--doc-sym-advantage, #45AD48)', font: 'SWRPGIcons', label: 'Advantage' },
    threat:    { char: '\ue943', color: 'var(--doc-sym-threat, #999999)', font: 'SWRPGIcons', label: 'Threat' },
    triumph:   { char: '\ue945', color: 'var(--doc-sym-triumph, #FDE600)', font: 'SWRPGIcons', label: 'Triumph' },
    despair:   { char: '\ue93a', color: 'var(--doc-sym-despair, #CC3333)', font: 'SWRPGIcons', label: 'Despair' },
    light:     { char: '\ue93e', color: 'var(--doc-sym-light, #EEEEEE)', font: 'SWRPGIcons', label: 'Light side' },
    // B-11: dark-pip ink #555555 \u2192 #808080 \u2014 light/dark share one glyph, told apart by INK
    // ALONE, so dark must clear 3:1 on the die silhouette (#0c1019: \u22484.8:1) while staying
    // clearly darker than light's #EEEEEE. ONE shared table app-wide (ruling b11-dark-pip-ink).
    dark:      { char: '\ue93e', color: 'var(--doc-sym-dark, #808080)', font: 'SWRPGIcons', label: 'Dark side' },
    // Text-token symbols (D-3A2 glyph consolidation: ONE shared table app-wide; the encounter
    // board's set is the default). forcepip = a generated Force point in prose ([FP]);
    // destiny_point color matches the dice app's destiny token (dice/index.html), the only
    // destiny glyph that existed before this entry.
    forcepip:      { char: '\ue93e', color: 'var(--doc-sym-forcepip, #EEEEEE)', font: 'SWRPGIcons', label: 'Force pip' },
    destiny_point: { char: '\ue93e', color: 'var(--doc-sym-destiny-point, #F5ECD7)', font: 'SWRPGIcons', label: 'Destiny Point' },
  };

  // OggDude/canonical bracket tokens -> SYMBOLS keys. TOTAL over the retired player FFG_SYMBOL
  // set (D-3A2 condition R-3A3): SU AD TR FA TH DE FO FP LI DA BO SE PR DI CH + AB + DP.
  // Canonical descriptions carry these tokens per schema/vocab/glyphs.vocab.json.
  var BRACKET_TOKENS = {
    SU: 'success', AD: 'advantage', TR: 'triumph', FA: 'failure', TH: 'threat', DE: 'despair',
    FO: 'force', FP: 'forcepip', LI: 'light', DA: 'dark',
    BO: 'boost', SE: 'setback', AB: 'ability', PR: 'proficiency', DI: 'difficulty', CH: 'challenge',
    DP: 'destiny_point',
  };

  // ── THE FILL FAMILY (ruling `tree-cell-force-pip-fill` R-FPF-1/3; LAB_NOTES §75.1) ──────────
  // FOUR TOKENS SHARE ONE GLYPH (\ue93e: light · dark · forcepip · destiny_point) and `force` is
  // \ue904, so the family cannot be told apart by SHAPE — and the lab found it was not reliably
  // told apart by INK either: on paper `light` (#2B2B2B) had ended up DARKER than `dark`
  // (#6D6A62), an inversion. On the dark ground the same three (`force`/`light`/`forcepip`) are
  // all #EEEEEE. So the family is told apart by FILL, drawn from the canonical glyph and never
  // from a new shape (`project_canonical_die_shape_asset`, A7-3).
  //
  // IN PROSE ONLY. The board draws the fill registers inside a power's prose and leaves the
  // RATING ROW plain — measured at pin 5763dc2c across the 11 force fixtures: 135 half, 11
  // hollow, and 11 plain `hp-sym` inside `hp-frrow`. `glyphText` (prose) opts in; `renderPool`
  // (the pool and the rating row) does not, so the row keeps the board's plain mark by
  // construction rather than by a caller remembering.
  //
  // `ring` IS DELIBERATELY ABSENT. R-FPF-3's map names ring for DESTINY, but at this pin the
  // board draws ZERO ring instances and the lab's own stylesheet carries no ring rule — only
  // `.hp-sym-fill`, `> i`, and `[data-fill="half"] > i + i`. There is nothing to copy, and
  // inventing the shape is the defect A7-3 forbids. `destiny_point` therefore stays SOLID and the
  // gap is named in the gate for the architect: either the lab draws it, or DP is solid by rule.
  var FILL_FAMILY = { light: 'hollow', force: 'hollow', forcepip: 'half' };
  // THE WHITE REGISTER (D-447 riders; ruling `release-r7-bug-burndown` ADDENDUM 443): the same HOLLOW mark — the token's
  // ink as the stroke — with a WHITE interior instead of the ground showing through. It is a register ON this map, never
  // a fourth map entry: a caller asks for it with `fill: FILL_WHITE` (exported, so no caller spells the word), and it
  // replaces `hollow` only, so a pip stays half and the dark side stays solid whatever the caller asks. The dice app's
  // pool and Dice Key and the holotable's feed card ask for it; the roll keeps `hollow` beside it, as Jason chose.
  // The register table itself is inside `symbolSpan` (below), so a guard that slices the function carries it.
  var FILL_WHITE = 'white';

  // ── T3: DICE WITHOUT THE DICE FONT (argo-a1-export ADDENDUM 6, D-510; mockup argo-public-step4.html T3 @ d6b9f3286) ──
  // ONE fallback, at 'removed' only and only when the font file answered 404 (SWRPGSources.diceFontProbe, run inside
  // ready()): each die becomes a small tag with its name, in the die's own ink; a pool reads the count, then the die, in
  // renderPool's order; a symbol in prose reads as a word ("2 advantage"). On holocron.work fontAbsent() is false and
  // nothing below draws. The PDF's word form (PDF_ABBR) is the same table's: pdfSymbolKit reads it.
  function fontAbsent() {
    var S = window.SWRPGSources;
    return !!(S && typeof S.diceFontAbsent === 'function' && S.diceFontAbsent());
  }
  var PDF_ABBR = { proficiency: 'Pr', ability: 'Ab', boost: 'Bo', challenge: 'Ch', difficulty: 'Di', setback: 'Se', force: 'Fo' };
  function dieWord(key, count) {
    var sym = SYMBOLS[key];
    if (!sym) return '';
    return (count ? count + ' ' : '') + sym.label.toLowerCase();
  }
  // `lift` (a dark ground's caller, the dice app): the die's hex ink mixed 30% toward white, so a small tag clears 4.5:1
  // there (#CC3333 measured 3.49:1 on the dice app's ground at 10.5px); the tint stays the die's own.
  function liftInk(hex) {
    var m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ''));
    if (!m) return hex;
    return '#' + [m[1], m[2], m[3]].map(function (c) { return ('0' + Math.round(parseInt(c, 16) * 0.7 + 255 * 0.3).toString(16)).slice(-2); }).join('');
  }
  function dieTag(key, count, idx, opts) {
    var sym = SYMBOLS[key];
    if (!sym) return null;
    var lab = (count ? count + ' ' : '') + sym.label;
    if (opts && opts.lift) opts = Object.assign({}, opts, { ink: liftInk(opts.ink) });
    return h('span', {
      key: idx,
      className: 'dt' + ((opts && opts.className) ? ' ' + opts.className : ''),
      'data-die': key,
      style: Object.assign({
        fontFamily: 'var(--font-mono)', fontSize: '10.5px', letterSpacing: '.04em', fontWeight: 'normal',
        textTransform: 'none', lineHeight: 1.3, padding: '2px 6px', margin: '0 2px 0 0', display: 'inline-block',
        border: '1px solid currentColor', background: 'var(--doc-paper-raised, transparent)', whiteSpace: 'nowrap',
        verticalAlign: 'middle', color: (opts && opts.ink) || sym.color,
      }, (opts && opts.style) || null),
    }, lab);
  }
  // A symbol inside prose (glyphText's tokens, a spend row's cost) reads as a word, not a tag.
  function dieWordSpan(key, count, idx) {
    if (!SYMBOLS[key]) return null;
    return h('span', { key: idx, className: 'sy', 'data-die': key,
      style: { fontFamily: 'var(--font-mono)', fontSize: '.88em', color: 'var(--doc-accent, inherit)', borderBottom: '1px dotted currentColor' } },
      dieWord(key, count));
  }

  // THE GLYPH'S BOX (B-530; ruling release-r7-bug-burndown ADDENDA 250–251, A′). Written INLINE it beats every stylesheet,
  // so the board's own `.hp-pool .hp-sym` sizes (paper.css, the DERIVED block: 19px, the Force row's 26px, their bands)
  // matched and lost — every creator pool glyph drew 13.33px. A caller whose stylesheet draws the glyph's box passes
  // `cssSized`, and the four box properties are left to it; nothing of the board is copied here. Every other caller
  // keeps the inline box it had, so no other surface moves.
  // (An inner function, so a guard that slices `symbolSpan` as shipped carries it: test/f100_m8_offers.cjs.)
  function symbolSpan(key, idx, size, opts) {
    function boxStyle(size, opts) {
      if (opts && opts.cssSized) return {};
      return { fontSize: (size || 1.3) + 'em', lineHeight: 1, verticalAlign: '-0.12em', margin: '0 1px' };
    }
    var sym = SYMBOLS[key];
    if (!sym) return null;
    if (typeof fontAbsent === 'function' && fontAbsent()) return dieTag(key, null, idx, opts && opts.className ? { className: opts.className } : null);   // T3
    var fill = (opts && opts.fill) ? FILL_FAMILY[key] : null;
    var FILL_REGISTERS = { white: { hollow: 'white' } };   // a caller's register, by name -> the fill it replaces
    if (fill && FILL_REGISTERS[opts.fill] && FILL_REGISTERS[opts.fill][fill]) fill = FILL_REGISTERS[opts.fill][fill];
    if (fill) {
      // THE COLOURS LIVE IN CSS, NOT INLINE — the one deliberate departure from the board's own
      // technique, and it is what makes every other surface pixel-identical. The board's generator
      // writes `color:#FFFFFF;-webkit-text-stroke:...` inline; inline styles cannot be neutralised
      // by a stylesheet, so the dice app, holotable, store, yard and vessel would inherit the
      // paper ground's white-on-stroke marks. Here the span keeps its ordinary token ink and the
      // paper ground restyles it (`paper.css`), while `tokens.css`'s base rule collapses the two
      // `<i>` back to ONE solid glyph everywhere else (R-FPF-2 (ii)/(iii)).
      // A11Y (R-FPF-4): `role="img"` + one `aria-label`, on the SPAN. The `<i>` children carry no
      // label and no announced text — `role="img"` replaces the subtree for AT, so the duplicated
      // glyph character is never read twice.
      // A CALLER THAT DRAWS ITS OWN BOX (the dice app's `symbolGlyph` and PoolStrip, ADDENDUM 441 item 2) passes `ink`,
      // `label`, `className` and `style`, so its mark keeps its own ink, name and size while the FILL comes from here.
      // Nothing else is drawn differently: no second fill anywhere.
      var lab = (opts && opts.label) || sym.label;
      return h('span', {
        key: idx,
        className: 'hp-sym hp-sym-fill' + ((opts && opts.className) ? ' ' + opts.className : ''),
        'data-fill': fill,
        title: lab,
        'aria-label': lab,
        role: 'img',
        style: Object.assign({
          fontFamily: '"' + sym.font + '"',
          // THE INK TRAVELS AS A CUSTOM PROPERTY, NOT AS `color`. An inline `color` beats every
          // stylesheet, so writing it here would make the ground unable to restyle the mark —
          // which is the whole mechanism. The base rule in `tokens.css` reads it back as
          // `color: var(--sym-ink)`, so off the paper ground the glyph keeps the exact token ink
          // it had before this family existed; the paper ground overrides `color` instead.
          '--sym-ink': (opts && opts.ink) || sym.color,
          display: 'inline-block',
          fontWeight: 'normal',
          textTransform: 'none',   // B-1265: the die IS the letter's case (see the plain branch)
        }, boxStyle(size, opts), (opts && opts.style) || null),
      }, h('i', { key: 'u' }, sym.char), h('i', { key: 'o' }, sym.char));
    }
    return h('span', {
      key: idx,
      // `hp-sym` is the BOARD'S OWN NAME for this object, and naming it here is what lets the
      // board's rules reach it: `paper.css` already carries per-band `.hp-sym` sizing derived
      // from the board, and until now it matched NOTHING because this span was unclassed. The
      // class is inert outside the creator's declared ground (every rule is scoped under it), so
      // dice, sheet and GM surfaces are unchanged. Found by DOM parity on the specialization
      // frame: the board draws a Triumph glyph inside a talent's prose and we drew an unnamed
      // span, which is 267 objects against 268.
      className: 'hp-sym',
      title: sym.label,
      'aria-label': sym.label,
      role: 'img',
      // Hide glyph character from AT (screen readers announce aria-label instead of the private-use codepoint)
      style: Object.assign({
        fontFamily: '"' + sym.font + '"',
        color: sym.color,
        display: 'inline-block',
        fontWeight: 'normal',
        // B-1265: Genesys draws each die by a LOWERCASE letter (difficulty `k`, challenge `l`, setback `j`), so a
        // host's `text-transform:uppercase` turned the mark into a different glyph: the paper crit table's
        // `.sb-e-m` printed "EASY (K)". Set on the mark, so no host's case rule reaches it on any surface.
        textTransform: 'none',
      }, boxStyle(size, opts)),
    }, sym.char);
  }

  // ── Pool symbol row ────────────────────────────────────────────────────
  // Renders: [positive dice] vs [negative dice] · [force]
  function renderPool(pool, opts) {
    pool = pool || {};
    opts = opts || {};
    var size = opts.size || 1.3;
    var items = [];
    var so = opts.cssSized ? { cssSized: true } : undefined;   // B-530: the caller's stylesheet draws the glyph's box
    // D-447: a pool draws its Force dice by fill when its CALLER asks (`fill: true`, or a register such as 'white').
    // The creator's Force rating row asks nothing and stays plain, as the board draws it (R-FPF-3, the comment above).
    if (opts.fill) so = Object.assign({}, so, { fill: opts.fill });
    var i = 0;
    if (fontAbsent()) {
      // T3: the count, then the die, in the order below (Pr · Ab · Bo, "vs", Ch · Di · Se, "·", Fo)
      var tag = function (k) { if ((pool[k] || 0) > 0) items.push(dieTag(k, pool[k], i++)); };
      ['proficiency', 'ability', 'boost'].forEach(tag);
      if ((pool.difficulty || 0) + (pool.challenge || 0) + (pool.setback || 0) > 0) {
        items.push(h('span', { key: 'sep' + (i++), className: 'dice-sep', style: { margin: '0 4px', color: 'var(--doc-ink-muted)' } }, 'vs'));
      }
      ['challenge', 'difficulty', 'setback'].forEach(tag);
      if (pool.force > 0) {
        if (items.length) items.push(h('span', { key: 'fsep' + (i++), className: 'dice-sep', style: { margin: '0 4px', color: 'var(--doc-ink-muted)' } }, '·'));
        tag('force');
      }
    } else {
    for (var n = 0; n < (pool.proficiency || 0); n++) items.push(symbolSpan('proficiency', i++, size, so));
    for (var n = 0; n < (pool.ability || 0); n++) items.push(symbolSpan('ability', i++, size, so));
    for (var n = 0; n < (pool.boost || 0); n++) items.push(symbolSpan('boost', i++, size, so));
    if ((pool.difficulty || 0) + (pool.challenge || 0) + (pool.setback || 0) > 0) {
      items.push(h('span', { key: 'sep' + (i++), className: 'dice-sep', style: { margin: '0 4px', color: 'var(--doc-ink-muted)' } }, 'vs'));
    }
    for (var n = 0; n < (pool.challenge || 0); n++) items.push(symbolSpan('challenge', i++, size, so));
    for (var n = 0; n < (pool.difficulty || 0); n++) items.push(symbolSpan('difficulty', i++, size, so));
    for (var n = 0; n < (pool.setback || 0); n++) items.push(symbolSpan('setback', i++, size, so));
    if (pool.force > 0) {
      // A SEPARATOR SEPARATES TWO THINGS. This one was emitted unconditionally, so a force-only
      // pool — `renderPool({ force: n })`, which is what BOTH creator Force steps call — drew a
      // leading `·` with nothing on its left. Eleven approved Force frames draw the row as
      // `hp-track-val` + ONE `hp-sym` and NOT ONE of them draws the dot (`board_force_1366` /
      // `_1920` / `_2560` / `_3840` / `_buyable` / `_cell` / `_ebbflow` / `_farsight` / `_needxp` /
      // `_phone` / `_rating` at pin 6051229c, checked one by one); the frames are law (R-MU1,
      // C-MU-4) and the app is corrected INTO them. It was also unreadable where it landed: hard
      // `rgba(255,255,255,0.3)` on the creator's parchment measures 1.13:1, B-517's class inside a
      // shared renderer, found by `build-phone-force`'s INK leg. Neither parity layer could see it
      // — they compare `data-pad`/`-size`/`-cols`, never text.
      // THE `vs` SEPARATOR ABOVE, and this dot, now take the GROUND's muted ink (B-1209, ruling
      // `paper-n7-b1209-dice-hub-card` R-B1209-2): `--doc-ink-muted` is the Yard drawing's separator ink
      // (`yard.css` `.y-vs`), #403D38 on paper (7.9:1 page · 9.6:1 plate) and the instrument's `--text-muted`
      // outside a declared ground (6.5:1 on the HOLOTABLE panel, up from 2.7:1). An inline var, so every host
      // gets it whether or not it loads diceRoll.css. `dice-sep` lets a surface whose drawing has no
      // separator hide it in CSS — the dice hub's rows (R-B1209-1, `sheet.css` `.sb-dh .dice-sep`; ADR 0049).
      if (items.length) items.push(h('span', { key: 'fsep' + (i++), className: 'dice-sep', style: { margin: '0 4px', color: 'var(--doc-ink-muted)' } }, '·'));
      for (var n = 0; n < pool.force; n++) items.push(symbolSpan('force', i++, size, so));
    }
    }
    if (items.length === 0) {
      return h('span', { style: { color: 'var(--doc-ink-muted)', fontFamily: 'var(--font-mono)', fontSize: '10px' } }, 'EMPTY POOL');
    }
    return h(React.Fragment, null, items);
  }

  // ── Results symbol row ─────────────────────────────────────────────────
  // Shows NET success/advantage and any triumph/despair/light/dark (these don't cancel)
  function renderResults(r, opts) {
    if (!r) return null;
    opts = opts || {};
    var size = opts.size || 1.4;
    var items = [];
    var i = 0;
    var fo = opts.fill ? { fill: opts.fill } : undefined;   // D-447: as renderPool's — light by fill, dark stays solid
    var net = r.success;
    var netAdv = r.advantage;
    if (fontAbsent()) {
      // T3: each result as the count, then its name, in the order below
      var res = function (k, c) { if (c > 0) items.push(dieTag(k, c, i++)); };
      if (net > 0) res('success', net); else if (net < 0) res('failure', -net);
      if (netAdv > 0) res('advantage', netAdv); else if (netAdv < 0) res('threat', -netAdv);
      res('triumph', r.triumph || 0); res('despair', r.despair || 0); res('light', r.light || 0); res('dark', r.dark || 0);
    } else {
    // Success / failure
    if (net > 0) {
      for (var n = 0; n < net; n++) items.push(symbolSpan('success', i++, size));
    } else if (net < 0) {
      for (var n = 0; n < -net; n++) items.push(symbolSpan('failure', i++, size));
    }
    // Advantage / threat
    if (netAdv > 0) {
      for (var n = 0; n < netAdv; n++) items.push(symbolSpan('advantage', i++, size));
    } else if (netAdv < 0) {
      for (var n = 0; n < -netAdv; n++) items.push(symbolSpan('threat', i++, size));
    }
    // Triumph / despair / light / dark — don't cancel
    for (var n = 0; n < (r.triumph || 0); n++) items.push(symbolSpan('triumph', i++, size));
    for (var n = 0; n < (r.despair || 0); n++) items.push(symbolSpan('despair', i++, size));
    for (var n = 0; n < (r.light || 0); n++) items.push(symbolSpan('light', i++, size, fo));
    for (var n = 0; n < (r.dark || 0); n++) items.push(symbolSpan('dark', i++, size, fo));
    }
    if (items.length === 0) {
      return h('span', { style: { color: 'var(--doc-ink-muted)', fontFamily: 'var(--font-mono)', fontSize: '11px', letterSpacing: '0.12em' } }, 'WASH');
    }
    return h(React.Fragment, null, items);
  }

  // ── Exports ────────────────────────────────────────────────────────────
  Object.assign(D, {
    SYMBOLS: SYMBOLS,
    BRACKET_TOKENS: BRACKET_TOKENS,
    FILL_FAMILY: FILL_FAMILY,   // read by the printed sheet's dice projector (player/app.jsx pdfGlyphRuns, B-981)
    FILL_WHITE: FILL_WHITE,     // D-447's white register, by name (callers never spell it)
    symbolSpan: symbolSpan,
    // T3 (ADDENDUM 6): the font-absent fallback — the probe's answer, the tag, the word, and the PDF's short form
    fontAbsent: fontAbsent, dieTag: dieTag, dieWord: dieWord, dieWordSpan: dieWordSpan, PDF_ABBR: PDF_ABBR,
    renderPool: renderPool,
    renderResults: renderResults,
  });
})();
