#!/usr/bin/env node
/**
 * holotable_ui.cjs — STANDING guard for the Stage B COMPONENTS and, above all, for the
 * ARRANGEMENT DEFERRAL they were approved under.
 * (lib/shared/holotableView.jsx; rulings `holotable-mockup-partial-approval` R-MPA-1..4.)
 *
 * WHY THIS FILE IS MOSTLY ABOUT WHAT IS *NOT* THERE. Jason approved these components and
 * explicitly did NOT approve how they are arranged — he raised it himself: "things like the feed
 * take up a lot of space for a battlemap product". R-MPA-2 lets surface code proceed on the
 * components on the condition that nothing here asserts a screen share, because a build that
 * picks a proportion decides the deferred question by default and nobody would ever see it
 * happen. A deferral defended only by a comment is a deferral that lasts until the next hurry.
 *
 * So: legs 3-4 assert the ABSENCE of arrangement, and leg 5 is their bite — a component that
 * DOES weld a proportion in is caught, so "no split found" is a measurement rather than a
 * spelling accident.
 *
 * Reads the BUILT bundle for behaviour (PRAXIS §1 — the browser runs the build, so the guard
 * does too; an unbuilt worktree reads red here and that red is the missing build) and the SOURCE
 * for the discipline it must carry in writing.
 *
 * Run:  node test/holotable_ui.cjs
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const check = (label, cond, detail) => {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (detail !== undefined ? '  -> ' + JSON.stringify(detail) : '')); }
};

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'lib/shared/holotableView.jsx'), 'utf8');

// ── a minimal React + window, so the BUILT classic script can be executed here ──
function load(flagOn) {
  const els = [];
  global.React = {
    createElement: function (type, props) {
      const kids = Array.prototype.slice.call(arguments, 2);
      const el = { type: type, props: props || {}, children: kids };
      els.push(el);
      return el;
    },
  };
  global.window = global;
  global.SWRPGHolotableEnabled = () => !!flagOn;
  global.SWRPGDice = null;                 // FeedEntry must tolerate the dice module being absent
  delete require.cache[require.resolve('../lib/shared/holotableView.js')];
  require('../lib/shared/holotableView.js');
  return { V: global.SWRPGHolotableView, els };
}

console.log('holotable_ui — the components, and the arrangement that must NOT be in them\n');

// ── 1. the module contract ───────────────────────────────────────────────────
const { V } = load(false);
const NAMES = ['StartTableDoor', 'RoomCodePanel', 'JoinByCode', 'JoinRefused', 'FeedEntry'];
check('1 ONE shared module publishes all five components (the mirror law — not one per app)',
  V && NAMES.every((n) => typeof V[n] === 'function'),
  V ? Object.keys(V) : null);
check('1b exactly five — the sixth approved component (the bench ledger row) is NOT rebuilt here, '
    + 'because it already ships in lib/library/npc/view.jsx',
  V && Object.keys(V).length === 5, V ? Object.keys(V).length : null);

// ── 2. DARK by default, and the gate is real ────────────────────────────────
{
  const dark = load(false).V;
  const allNull = NAMES.every((n) => dark[n]({ entry: {}, code: 'X', roomSchema: 2, clientSchema: 1 }) === null);
  check('2 every component returns null while the flag is DARK', allNull);

  const lit = load(true).V;
  const allRender = NAMES.every((n) => {
    const out = lit[n]({ entry: { who: 'GM', what: 'Melee check' }, code: 'TARKIN-9',
                         present: 2, roomSchema: 2, clientSchema: 1 });
    return out && typeof out === 'object';
  });
  check('2b BITE: with the flag LIT every component renders — so leg 2 measured the gate, '
      + 'not a broken harness', allRender);
  check('2c the gate is read at RENDER time, never captured at load',
    /function enabled\(\)\s*\{\s*return !!\(window\.SWRPGHolotableEnabled/.test(SRC));
}

// ── 3. NO ARRANGEMENT — the deferral, defended ──────────────────────────────
{
  // Anything that allocates one component a SHARE of a screen against another. The mocked
  // 336px/1fr gm-live split is named because it is the specific thing R-MPA-2 forbids building.
  const banned = [
    [/gridTemplateColumns/, 'a grid that allocates columns'],
    [/336px/, "the mockup's 336px rail split"],
    [/\bflexBasis\b/, 'a flex-basis share'],
    [/position:\s*['"]absolute/, 'absolute positioning (places a sibling)'],
    [/\bvw\b/, 'viewport-width units'],
    [/\bmaxWidth\b/, 'a max-width (a component constraining itself against a screen)'],
    [/\bwidth:\s*['"](?!100%)\d+%/, 'a fractional width — that IS a share'],
  ];
  const hits = banned.filter(([re]) => re.test(SRC)).map(([, why]) => why);
  // PIXEL widths are judged by SIZE, not banned outright: `width:'100%'` is the neutral answer
  // (leg 3c requires it) and an 8px liveness dot is a bullet, not a screen allocation. Anything
  // wide enough to be a column, though, is exactly the thing being deferred. The first cut of
  // this leg banned every `width:` with digits and flagged BOTH of those — a mis-specified sweep
  // reads as a real red, so the rule is stated in what it means rather than in what it matches.
  const DECORATIVE_PX = 24;
  const wide = (SRC.match(/\bwidth:\s*['"](\d+)px/g) || [])
    .map((m) => parseInt(m.match(/(\d+)px/)[1], 10))
    .filter((n) => n > DECORATIVE_PX);
  hits.push(...wide.map((n) => `a ${n}px fixed width (wider than decorative)`));
  check('3 no component asserts a screen SHARE (R-MPA-2 — arrangement is deferred)',
    hits.length === 0, hits);
  check('3b no component positions a SIBLING or sets a parent width',
    !/marginLeft:\s*['"]auto|float:/.test(SRC));
  // `width:'100%'` is allowed and is the point: fill whatever you are put in, decide nothing.
  check('3c components fill their container instead (width 100% is the neutral answer)',
    /width:\s*['"]100%['"]/.test(SRC));
}

// ── 4. the discipline is written down where the next editor will look ───────
check('4 the file cites R-MPA-2 so the provisionality is GREPPABLE',
  /R-MPA-2/.test(SRC));
check('4b it names what was approved vs deferred, in those words',
  /APPROVED — the COMPONENTS/.test(SRC) && /DEFERRED — the ARRANGEMENT/.test(SRC));
check('4c it records the slice-2 direction so a later composer does not re-derive it',
  /R-MPA-3/.test(SRC) && /MAP-FIRST/.test(SRC));
check('4d it states that NO composition is built here',
  /NO COMPOSITION IS BUILT IN THIS FILE/.test(SRC));

// ── 5. THE BITE for leg 3 — a welded proportion must be CAUGHT ──────────────
{
  // The mutant is the exact thing R-MPA-2 forbids: the mockup's gm-live split, welded in.
  const mutant = SRC.replace(
    "  var CARD = {",
    "  var SPLIT = { display: 'grid', gridTemplateColumns: '336px 1fr' };\n  var CARD = {");
  const banned = [/gridTemplateColumns/, /336px/];
  check('5 BITE: a welded 336px/1fr split IS caught by leg 3\'s sweep',
    banned.every((re) => re.test(mutant)));
  check('5b and leg 3 is not vacuous — the sweep found real style source to read',
    SRC.length > 4000 && /borderRadius/.test(SRC));
}

// ── 6. the floors the standard sets, not the mockup (C-MU-4) ────────────────
check('6 every control declares the 44px+ touch floor (AS-6)',
  /minHeight:\s*['"]48px['"]/.test(SRC) && !/minHeight:\s*['"](2\d|3\d|4[0-3])px['"]/.test(SRC));
check('6b the code input is >= 16px type (iOS zooms a focused field under 16px)',
  /--fs-lg,\s*20px/.test(SRC) && /minHeight:\s*['"]52px['"]/.test(SRC));
check('6c the input carries an accessible name',
  /'aria-label':\s*'Table code'/.test(SRC));
check('6d the refusal copy lives in the SURFACE, never on the wire (the substrate sends a '
    + 'machine reason)', /CAN’T JOIN THIS TABLE/.test(SRC));

// ── 7. glyphs go through the ONE shipped renderer ───────────────────────────
check('7 dice render through SWRPGDice.renderPool / renderResults, not a local glyph table',
  /D\.renderPool/.test(SRC) && /D\.renderResults/.test(SRC)
  && !/SYMBOLS\s*=/.test(SRC) && !/Genesys/.test(SRC));
check('7b FeedEntry tolerates the dice module being ABSENT rather than throwing',
  (function () {
    const lit = load(true).V;
    const out = lit.FeedEntry({ entry: { who: 'GM', what: 'x', pool: { ability: 2 } } });
    return out && typeof out === 'object';
  })());

// ── 8. R-NBC-5 — THE SECOND REFUSAL'S COPY, IN THE APPROVED FRAME ───────────
//
// The ruling fixed the MEANING and left the exact wording to the implementer, to be quoted in the
// gate for Jason. These legs pin the meaning so a later edit cannot drift the promise:
//
//   (i)   the join did not complete
//   (ii)  it is NOT the out-of-date case — NO false "reload to update" promise
//   (iii) try again FIRST, reload as the second resort
//
// The frame is shared rather than duplicated because a sixth EXPORT would have moved leg 1b's
// exactly-five count (R-SBC-2's durable form of the bench-ledger refusal) for a reason unrelated
// to that refusal. Leg 1b above is what proves it did not move.
{
  const lit = load(true).V;
  const ver = lit.JoinRefused({ roomSchema: 2, clientSchema: 1 });
  const bad = lit.JoinRefused({ kind: 'join_failed' });
  const flat = (n) => JSON.stringify(n);

  check('8 both refusals render through the SAME approved frame — one testid, one shape',
    ver.props['data-testid'] === 'holotable-refused'
    && bad.props['data-testid'] === 'holotable-refused');
  check('8b the two cards are DISTINGUISHABLE to a test and to a screen reader\'s DOM — the kind '
      + 'is stamped, so a smoke can tell which refusal it is looking at',
    ver.props['data-refusal'] === 'room_schema_newer'
    && bad.props['data-refusal'] === 'join_failed');
  check('8c the APPROVED version copy is UNCHANGED, verbatim — R-NBC-5 added a card, it did not '
      + 'license editing the one Jason already approved',
    /This table is running a newer version of the app than you are\. Reload the page to update, then use the code again\./
      .test(flat(ver).replace(/\\u2019/g, "'")));
  check('8d (i) the second card says the JOIN DID NOT COMPLETE',
    /The join didn.{1,6}t go through/.test(flat(bad)));
  check('8e (ii) it makes NO reload-to-update promise — the version sentence and the word '
      + '"update" are both absent from it',
    !/newer version|to update/.test(flat(bad)));
  check('8e2 (ii, the other direction) it does not claim the app IS up to date either. Often we '
      + 'cannot know: a failed handshake gives the browser 1006 and no body, and the room server '
      + 'is cross-origin. The copy promises nothing it cannot vouch for.',
    !/up to date|not a version|your version is fine/i.test(flat(bad)));
  check('8f (iii) TRY AGAIN is offered FIRST and reload is the second resort — retry is the '
      + 'primary control and appears before reload in the DOM',
    flat(bad).indexOf('holotable-retry') !== -1
    && flat(bad).indexOf('holotable-retry') < flat(bad).indexOf('holotable-reload'));
  check('8g the version card is untouched by that — reloading IS its fix, so it keeps ONE button '
      + 'and gains no retry',
    flat(ver).indexOf('holotable-retry') === -1
    && flat(ver).indexOf('holotable-reload') !== -1);
  check('8h the VERSION LINE belongs to the version card alone — printing "table v? · you v?" on '
      + 'a failure whose cause could not be read would be inventing a diagnosis',
    /table v2/.test(flat(ver)) && !/table v/.test(flat(bad)));
  check('8i MECHANICS VOICE — plain and gamey. No business-speak, no metaphor, no apology.',
    !/unfortunately|we apologize|apologise|an error occurred|something went wrong|oops|please try/i
      .test(flat(bad)));
  check('8j the second card obeys the SAME 44px+ touch floor as everything else (AS-6, C-MU-4: '
      + 'the standard outranks the mockup)',
    (flat(bad).match(/48px/g) || []).length >= 2, (flat(bad).match(/48px/g) || []).length);
  check('8k BOTH cards are still DARK when the flag is off — a second copy path is a second way '
      + 'to leak a surface',
    load(false).V.JoinRefused({ kind: 'join_failed' }) === null
    && load(false).V.JoinRefused({ roomSchema: 2, clientSchema: 1 }) === null);
  check('8l BITE (leg 8e): the no-promise sweep DOES catch the version sentence — so 8e measures '
      + 'the promise rather than merely finding a short string',
    /newer version|to update/.test(flat(ver)));
  // A real mutant of the RENDERED output: swap the two controls, and the ordering leg must red.
  // Written this way rather than as a toy comparison because a toy proves the guard can compare
  // two numbers, not that leg 8f is reading the card it claims to read.
  const swapped = flat(bad)
    .replace(/holotable-retry/g, '\u0000')
    .replace(/holotable-reload/g, 'holotable-retry')
    .replace(/\u0000/g, 'holotable-reload');
  check('8m BITE (leg 8f): with the two controls SWAPPED in the rendered card, the ordering leg '
      + 'goes red — so 8f measures which control comes first, not merely that both exist',
    swapped !== flat(bad)
    && !(swapped.indexOf('holotable-retry') < swapped.indexOf('holotable-reload')));
}

console.log('');
console.log(`holotable_ui: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
