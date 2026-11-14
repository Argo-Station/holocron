/* THE MARK'S SUBJECT IS THE RESOLUTION'S SUBJECT — a static tie between two lists that must not
   drift (R-CPD-6(c), R-AM-1).

   `fcSpeciesEffRecord` REPLACES exactly four fields on the species record: `characteristics` and
   the three numerics. `fcSpeciesMovedSet` diffs those same four to decide what the change
   highlight marks. A fifth field added to the resolution and not to the diff would be a value the
   entry draws, that a pick moves, and that the highlight silently ignores — the failure R-AM-1 was
   written about, in the opposite direction: there the fixture had a key list of its own; here the
   risk is a list that stops matching.

   A DOC WOULD NOT CATCH IT (`[[feedback_mechanism_over_a_louder_doc]]`), and neither would the
   browser suite: it drives real transitions, and a transition that moves a NEW field is exactly
   what nobody thinks to add a case for. This is a grep, and it belongs in the per-file node loop.

   FOUNDING CASE (R-CPR-39): the four fields as they stand at `csg_sith` Kissai -> Zuguruk, the
   seven-of-nine transition the piece was built on — characteristics, wound_threshold_base,
   strain_threshold_base, starting_xp. */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'player', 'app.jsx'), 'utf8');
let bad = 0;
const fail = (m) => { console.log('✗ ' + m); bad++; };

// 1. the fields the resolution replaces, read from its own `Object.assign`.
const eff = src.match(/function fcSpeciesEffRecord\([\s\S]*?\n\}/);
if (!eff) fail('fcSpeciesEffRecord not found — this guard has lost its subject');
const assign = eff && eff[0].match(/return Object\.assign\(\{\}, sp, \{([\s\S]*?)\}\);/);
if (!assign) fail('fcSpeciesEffRecord no longer ends in an Object.assign — re-point this guard');
const replaced = assign
  ? [...assign[1].matchAll(/^\s*([a-z_]+):/gm)].map((m) => m[1])
  : [];

// 2. the fields the mark diffs.
const list = src.match(/var FC_EFF_NUMERIC = \[([^\]]*)\]/);
if (!list) fail('FC_EFF_NUMERIC not found');
const numeric = list ? [...list[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]) : [];
const diffed = ['characteristics'].concat(numeric);

const a = [...replaced].sort().join(',');
const b = [...diffed].sort().join(',');
if (a !== b) {
  fail('the change highlight and the resolution disagree about which fields the resolution owns\n'
       + '    resolution replaces: ' + a + '\n'
       + '    the mark diffs:      ' + b + '\n'
       + '    A field in the first and not the second is a value a pick moves and the highlight\n'
       + '    never marks. Add it to FC_EFF_NUMERIC (or to the characteristics branch).');
}

// 3. the founding case's fields are actually among them — an instrument that cannot find the case
//    it exists for is untested, not clean.
for (const f of ['characteristics', 'wound_threshold_base', 'strain_threshold_base', 'starting_xp']) {
  if (!replaced.includes(f)) fail('the resolution no longer replaces `' + f + '`, which the '
    + 'founding transition (csg_sith Kissai -> Zuguruk, 7 of 9) moves');
}

if (bad) { console.log('species_moved_fields: ' + bad + ' problem(s)'); process.exit(1); }
console.log('✓ species_moved_fields: the mark diffs exactly the ' + diffed.length
  + ' fields the resolution replaces (' + b + ')');
