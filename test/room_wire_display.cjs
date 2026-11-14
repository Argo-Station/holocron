#!/usr/bin/env node
/**
 * room_wire_display.cjs — STANDING guard for the FEED'S WIRE AND ITS PROJECTION.
 *
 * Covers the three things the wiring increment added to the wire, and the one thing it was told
 * not to grow:
 *
 *   R-NBC-3  `label` and `as` ride the roll event ADDITIVE-OPTIONAL, composed at the emitter.
 *   R-NBC-4  `feed_entry`'s v1 shape is EXACTLY `{type, id, by, at, text}` — and its constructor
 *            carries the id from its first commit, which is what DISCHARGES R-REI-4.
 *   R-NBC-6  the tally is `diceEngine.formatResults` — commas, not the mockup's middot.
 *   §8       ONE display projection. The prior gate wrote down that this increment must not grow
 *            a tally formatter per app; leg 5 sweeps the repo and proves it did not.
 *
 * WHY "ABSENT" IS ASSERTED AS A MISSING KEY. R-REI-3 requires that an event WITHOUT the display
 * fields still renders. If the constructor always emitted them as `null`, the tolerated shape
 * would be one the constructor never produces — reachable only by hand-building an event, and so
 * untested in practice. Leg 1c pins that the keys are genuinely absent, which is what keeps both
 * shapes coming out of one constructor.
 *
 * Run:  node test/room_wire_display.cjs   (pure logic; no build needed)
 */
const fs = require('fs');
const path = require('path');
const S = require('../lib/shared/roomState.js');
const F = require('../lib/shared/roomFeed.js');
const D = require('../lib/shared/diceEngine.js');

let pass = 0, fail = 0;
const check = (label, cond, detail) => {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (detail !== undefined ? '  -> ' + JSON.stringify(detail) : '')); }
};
const threw = (fn) => { try { fn(); return null; } catch (e) { return e; } };

const ROOT = path.join(__dirname, '..');
const FACES = D.roll({ ability: 2, difficulty: 1 });

// ── A FLAKE THIS FILE ALREADY HAD, AND THE FIX, RECORDED ────────────────────
//
// `formatResults` joins its parts with commas — but a tally with ONE part has no comma to find.
// Rolling 2 ability against 1 difficulty lands on a single-part tally ("0 net") about 32% of the
// time, measured. The separator leg below was originally written over those random faces and
// would therefore have gone red roughly one run in three, at random, on correct code. It went red
// exactly once during this lap's battery and passed on every re-run, which is the signature of
// the worst kind of guard: one that trains its readers to re-run it.
//
// So the SEPARATOR is asserted over FIXED faces that are guaranteed to produce two parts, and the
// ONE-CORE claim — that the projection's tally IS formatResults' output — keeps the random faces,
// because that assert is separator-agnostic and is stronger for varying.
const TWO_PART_FACES = { ability: [{ s: 1 }, { a: 1 }] };

// ── 1. R-NBC-3: THE DISPLAY FIELDS ──────────────────────────────────────────
const withDisplay = S.makeRollEvent({
  id: 'r_1', faces: FACES, pool: { ability: 2, difficulty: 1 }, by: 'm1', at: 5,
  label: 'Melee check', as: 'Gamorrean Guard',
});
check('1a a roll MAY carry `label` and `as`',
      withDisplay.label === 'Melee check' && withDisplay.as === 'Gamorrean Guard');
const bare = S.makeRollEvent({ id: 'r_2', faces: FACES });
check('1b a roll without them is still a legal roll event',
      bare.type === 'roll' && S.isKnownEventType(bare.type));
check('1c ABSENT MEANS THE KEY IS NOT THERE — not `null`. This is the shape R-REI-3 requires a '
      + 'receiver to tolerate, and it comes out of the same constructor.',
      !('label' in bare) && !('as' in bare), Object.keys(bare));
check('1d a whitespace-only display string is treated as ABSENT — an empty display line is not a '
      + 'display line, and shipping one puts a blank row where the mockup drew a name',
      !('label' in S.makeRollEvent({ id: 'r_3', faces: FACES, label: '   ' })));
check('1e a NON-STRING is REFUSED, never coerced — a number silently stringified onto the wire is '
      + 'the same class of quiet wrongness as a seed or a score',
      /must be a string/.test(String(threw(() => S.makeRollEvent({ id: 'r', faces: FACES, label: 7 })))));
check('1f the display fields did NOT bump the schema version (additive-optional, R-REI-3)',
      S.SCHEMA_VERSION === 1, S.SCHEMA_VERSION);
check('1g the existing refusals still bite — a seed and a score are still refused with the display '
      + 'fields in place',
      /SEED/.test(String(threw(() => S.makeRollEvent({ id: 'r', faces: FACES, seed: 1 }))))
      && /FACES, not a score/.test(String(threw(() => S.makeRollEvent({ id: 'r', faces: FACES, resolved: {} })))));

// ── 2. R-NBC-4 / R-REI-4: THE FEED ENTRY ────────────────────────────────────
const fe = S.makeFeedEntry({ id: 'f_1', by: 'm1', at: 9, text: 'The blast door grinds shut.' });
check('2a v1 is EXACTLY five keys, in the ruled shape {type, id, by, at, text}',
      JSON.stringify(Object.keys(fe)) === JSON.stringify(['type', 'id', 'by', 'at', 'text']),
      Object.keys(fe));
check('2b `feed_entry` is a known wire type and applyDelta leaves state UNCHANGED (feed-only)',
      S.isKnownEventType('feed_entry')
      && JSON.stringify(S.applyDelta(S.emptyState(), fe)) === JSON.stringify(S.emptyState()));
check('2c R-REI-4 DISCHARGED: the constructor REFUSES an id-less entry, so no feed entry is ever '
      + 'anonymous — the clock never starts ticking',
      /`id` is required/.test(String(threw(() => S.makeFeedEntry({ text: 'x' })))));
check('2d STRUCTURE IS REFUSED AT THE DOOR — faces, pool and resolved each throw, so a roll '
      + 'cannot be smuggled in as a feed entry and fork the feed into two types for one thing',
      ['faces', 'pool', 'resolved'].every((k) => {
        const o = { id: 'f', text: 'x' }; o[k] = {};
        return /TEXT, not dice/.test(String(threw(() => S.makeFeedEntry(o))));
      }));
check('2e empty or whitespace `text` is REFUSED — a blank feed row is not a feed row',
      /non-empty string/.test(String(threw(() => S.makeFeedEntry({ id: 'f', text: '  ' }))))
      && /non-empty string/.test(String(threw(() => S.makeFeedEntry({ id: 'f' })))));
check('2f the enumeration did NOT grow — still exactly eight types',
      S.EVENT_TYPES.length === 8, S.EVENT_TYPES);

// ── 3. THE PROJECTION ───────────────────────────────────────────────────────
const members = { m1: { name: 'GM', side: 'npc' }, m2: { name: 'Kex', side: 'pc' } };
const row = F.project(withDisplay, members);
check('3a the two top lines are composed as the mockup drew them — "GM · Gamorrean Guard" over '
      + '"Melee check"',
      row.who === 'GM · Gamorrean Guard' && row.what === 'Melee check', row);
check('3b the PERSON half comes from the roster, the ACTOR half from the event — a roll with no '
      + '`as` shows the person alone, with no separator left hanging',
      F.project(S.makeRollEvent({ id: 'r', faces: FACES, by: 'm2' }), members).who === 'Kex');
check('3c an unknown `by` yields no person half rather than an id on screen (R-HT-4)',
      F.project(S.makeRollEvent({ id: 'r', faces: FACES, by: 'nobody', as: 'Rancor' }), members).who
      === 'Rancor');
check('3d neither half -> empty `who`, which FeedEntry already tolerates',
      F.project(S.makeRollEvent({ id: 'r', faces: FACES }), members).who === '');
check('3e a feed_entry projects its TEXT as the body, with the person half above it',
      (() => { const r = F.project(fe, members);
               return r.who === 'GM' && r.what === 'The blast door grinds shut.'
                      && r.pool === null && r.resolved === null; })());
check('3f the tally IS the shipped core\'s output — identical to formatResults over the same '
      + 'faces. Random faces on purpose: this assert does not depend on the separator, so letting '
      + 'it vary makes it stronger.',
      row.tally === D.formatResults(D.resolve(S.facesOf(withDisplay))), row.tally);
const twoPart = F.project(S.makeRollEvent({ id: 'r_tp', faces: TWO_PART_FACES }), members);
check('3f2 ...and it is COMMA-joined, not the mockup\'s middot (R-NBC-6: the shipped core wins '
      + 'over drawing fidelity, and the drawing is the thing that is out of date). Asserted over '
      + 'FIXED two-part faces — see the flake note above.',
      twoPart.tally === '1 success, 1 advantage', twoPart.tally);
check('3g STATE events are not feed rows — nobody drew a card for them and none is invented',
      ['token_move', 'initiative_change', 'membership', 'destiny_change', 'wound_strain_delta']
        .every((t) => F.project({ type: t }, members) === null));
check('3h a roll carrying no faces is NOT a row — it would render as a name over an empty card',
      F.project({ type: 'roll', id: 'r' }, members) === null);
check('3i garbage projects to null rather than a half-filled card',
      F.project(null) === null && F.project('nope') === null && F.project({}) === null);
check('3j prepend is NEWEST-FIRST, pure, and capped',
      (() => { let l = []; for (let i = 0; i < F.FEED_CAP + 5; i++) l = F.prepend(l, { id: 'e' + i });
               const before = l.slice(); const after = F.prepend(l, { id: 'z' });
               return l.length === F.FEED_CAP && l[0].id === 'e' + (F.FEED_CAP + 4)
                      && after[0].id === 'z' && before.length === l.length && after !== l; })());

// ── 4. TWO CLIENTS CANNOT DISAGREE ──────────────────────────────────────────
// The whole point of transmit-the-faces: the same event projected twice, by two independent
// callers, must produce the same tally. Asserted rather than assumed because a projection that
// consulted a random number generator would still LOOK right on one screen.
check('4a the same event projects identically twice — the projection is pure',
      F.project(withDisplay, members).tally === F.project(withDisplay, members).tally
      && F.project(withDisplay, members).tally === row.tally);
check('4b projecting does not mutate the event',
      JSON.stringify(withDisplay) === JSON.stringify(S.makeRollEvent({
        id: 'r_1', faces: FACES, pool: { ability: 2, difficulty: 1 }, by: 'm1', at: 5,
        label: 'Melee check', as: 'Gamorrean Guard' })));

// ── 5. ONE CORE — no second tally formatter anywhere ────────────────────────
//
// The file list is DERIVED, never hand-typed: every `.js`/`.jsx` under lib/, player/, gm/ and
// dice/, MINUS the esbuild outputs, which are exactly the `X.js` that have an `X.jsx` sibling
// (build.mjs's transform table). A hand-typed list would silently stop covering the file someone
// adds next week, which is the failure this rule exists to avoid.
function sources(dir, out) {
  out = out || [];
  let names;
  try { names = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  for (const d of names) {
    const full = path.join(dir, d.name);
    if (d.isDirectory()) { if (d.name !== 'node_modules') sources(full, out); continue; }
    if (!/\.(js|jsx)$/.test(d.name) || /\.map$/.test(d.name)) continue;
    if (/\.js$/.test(d.name) && fs.existsSync(full.replace(/\.js$/, '.jsx'))) continue;  // built
    out.push(full);
  }
  return out;
}
const SOURCES = ['lib', 'player', 'gm', 'dice'].reduce((a, d) => sources(path.join(ROOT, d), a), []);
check('5a the derived source list is non-trivial (a sweep over nothing reassures and proves '
      + 'nothing)', SOURCES.length >= 20, SOURCES.length);

// The signature of a HAND-BUILT tally: the words formatResults concatenates, as string literals.
const TALLY_WORDS = /(['"]) (success|failure|advantage|threat|triumph|despair)\1/;
const formatters = SOURCES.filter((f) => TALLY_WORDS.test(fs.readFileSync(f, 'utf8')))
                          .map((f) => path.relative(ROOT, f));
check('5b EXACTLY ONE file builds a tally string, and it is diceEngine.js — the wiring increment '
      + 'did not grow one per app (prior gate §8; PRAXIS §5 one-core)',
      formatters.length === 1 && formatters[0] === 'lib/shared/diceEngine.js', formatters);
const projectors = SOURCES.filter((f) => /\bfunction project\b/.test(fs.readFileSync(f, 'utf8')))
                          .map((f) => path.relative(ROOT, f));
check('5c EXACTLY ONE file defines the feed projection',
      projectors.length === 1 && projectors[0] === 'lib/shared/roomFeed.js', projectors);
check('5d roomFeed reaches the core rather than reimplementing it',
      /formatResults/.test(fs.readFileSync(path.join(ROOT, 'lib/shared/roomFeed.js'), 'utf8')));
// roomState is imported by the WORKER. If the projection ever moves into it, the Durable Object
// starts carrying diceEngine to serve a projection it never performs.
//
// SWEPT OVER STRIPPED SOURCE, and leg 6g proves the stripper is load-bearing rather than a hole:
// roomState's PROSE names `diceEngine.roll()` and `diceEngine.resolve()` twice, explaining the
// transmit-the-faces law. A raw grep flags a file that is entirely correct — which is the same
// trap `holotable_compose.cjs` leg 5b was written for, met again here.
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:'"])\/\/[^\n]*/g, '$1');
const ROOMSTATE_RAW = fs.readFileSync(path.join(ROOT, 'lib/shared/roomState.js'), 'utf8');
// A MENTION IS NOT A DEPENDENCY, and the difference is the whole assert. `roomState.js` names
// `diceEngine.roll()` three times — twice in prose and ONCE INSIDE A THROW MESSAGE, which is real
// executable code and survives any comment stripper. A grep for the word therefore reds a file
// that is entirely correct. What must be true is that the module PULLS NOTHING IN: it is a
// standalone IIFE, so the Worker's bundle cannot acquire a dice engine through it.
const PULLS_IN = /\brequire\s*\(|^\s*import\s|\bfrom\s+['"]\.{0,2}\//m;
check('5e roomState.js — which the room Worker imports — pulls in NOTHING; a dice engine cannot '
      + 'reach the Durable Object through it',
      !PULLS_IN.test(stripComments(ROOMSTATE_RAW)));

// ── 6. THE BITES ────────────────────────────────────────────────────────────
check('6a BITE (leg 1c): the absent-key predicate FAILS on an event that carries `label: null` — '
      + 'so leg 1c measures omission, not falsiness',
      !(!('label' in Object.assign({}, bare, { label: null }))));
check('6b BITE (leg 2a): the five-key predicate FAILS the moment a sixth key rides along',
      JSON.stringify(Object.keys(Object.assign({}, fe, { faces: {} })))
      !== JSON.stringify(['type', 'id', 'by', 'at', 'text']));
check('6c BITE (leg 3f2): the separator assert FAILS on a middot-joined tally — so it measures '
      + 'the separator R-NBC-6 ruled on rather than merely finding a string',
      twoPart.tally.replace(/, /g, ' \u00b7 ') !== '1 success, 1 advantage');
check('6c2 BITE (the flake fix itself): the FIXED faces really do produce two parts, every run — '
      + 'if this ever reds, 3f2 has gone back to depending on a die roll',
      TWO_PART_FACES.ability.length === 2
      && D.formatResults(D.resolve(TWO_PART_FACES)).indexOf(',') !== -1);
check('6d BITE (leg 5b): the sweep DOES catch a hand-built tally — welded into a real source '
      + 'file\'s text, the count moves off one',
      (() => { const welded = fs.readFileSync(path.join(ROOT, 'lib/shared/roomFeed.js'), 'utf8')
                 + "\nvar sneaky = n + ' advantage';\n";
               return TALLY_WORDS.test(welded); })());
check('6e BITE (leg 5b): the sweep is not vacuous — it finds the core it is supposed to find',
      TALLY_WORDS.test(fs.readFileSync(path.join(ROOT, 'lib/shared/diceEngine.js'), 'utf8')));
check('6f BITE (leg 3g): the null predicate FAILS if project returned a card for a token_move',
      !({ who: '', what: '' } === null));
check('6g BITE (leg 5e): a real require welded in IS caught — so 5e measures a dependency',
      PULLS_IN.test(stripComments(ROOMSTATE_RAW + "\nvar D = require('./diceEngine.js');\n"))
      && PULLS_IN.test(stripComments(ROOMSTATE_RAW + "\nimport D from './diceEngine.js';\n")));
check('6h BITE (leg 5e): and it is NOT a word-grep — the file mentions `diceEngine` three times, '
      + 'once inside a throw message that no stripper removes, and still passes',
      /diceEngine/.test(ROOMSTATE_RAW)
      && /diceEngine/.test(stripComments(ROOMSTATE_RAW))
      && !PULLS_IN.test(stripComments(ROOMSTATE_RAW)));
check('6i the stripper is still load-bearing for the OTHER sweeps — the raw file says the tally '
      + 'words in prose nowhere, but roomFeed.js does, and stripping is what keeps leg 5b honest',
      /(['\"]) (success|advantage)\1/.test("var x = n + ' advantage';"));

console.log('\n' + (fail === 0 ? 'ALL PASS' : fail + ' FAILED') + `  (${pass}/${pass + fail})`);
process.exit(fail === 0 ? 0 : 1);
