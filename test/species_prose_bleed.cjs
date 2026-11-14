/**
 * species_prose_bleed.cjs — the B-178 correction is pinned, and the ONE legitimate look-alike is
 * recorded so a future sweep does not "fix" correct authorship.
 *
 * Ruling `species-prose-bleed-policy` (R-SPB-1..5). The Old Republic book's Miraluka entry ended
 * with two sentences about ECHANI (an author copy-paste). They were removed — nothing rewritten
 * (R-SPB-3) — because both already live, correctly, in the Echani entry (R-SPB-1). This is NOT a
 * general bleed detector: R-SPB-2 proved a machine sweep cannot tell a bleed from legitimate shared
 * authorship, so this pins the ONE correction and the ONE known-legit pair by name (ADR 0034), and
 * does not grow an allowlist. Ingest-time detection for future imports is R-SPB-5's, named there and
 * not built here.
 *
 * THE R-SPB-2 TEST, encoded: a bleed is prose that ASSERTS SOMETHING ABOUT A DIFFERENT NAMED SUBJECT
 * than the record it sits in. Decidable from the text; needs no species knowledge. Leg 1 is that
 * test applied to the corrected record.
 *
 * Run: node test/species_prose_bleed.cjs
 */
const path = require('path');
const REPO = path.resolve(__dirname, '..');
const SPECIES = require(path.join(REPO, 'public/data/canonical/species.json')).species;

let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? (pass++, console.log('  PASS  ' + m))
                            : (fail++, console.log('  FAIL  ' + m + (d ? ' — ' + d : ''))); };

const mir = (SPECIES.tor_miraluka || {}).physiology || '';
const ech = (SPECIES.tor_echani || {}).physiology || '';

// The bleed predicate, lifted to a named function so leg 4 can prove it DISCRIMINATES (C-SPB-1):
// the Miraluka bleed named ECHANI, another species, inside the Miraluka entry — the R-SPB-2 test
// ("asserts something about a different named subject") made concrete for this record.
const namesEchani = (text) => /Echani/.test(String(text || ''));

// ── 1. the bleed is out: Miraluka's prose names no Echani ───────────────────────────────────────
ok(!namesEchani(mir),
   'tor_miraluka.physiology names no other species (the two Echani sentences are removed)',
   namesEchani(mir) ? 'still contains "Echani"' : '');
// and it ends on its own sentence, not mid-word — deletion, not truncation-to-garbage
ok(/[.!?]$/.test(mir.trim()) && mir.length > 300,
   `and it still ends on a complete sentence (${mir.length} chars)`);

// ── 2. nothing was lost: both sentences remain where they belong ────────────────────────────────
ok(/The Thyrsian subspecies of Echani/.test(ech),
   'tor_echani.physiology still carries both sentences, correctly, as its own closing text',
   'the sentences would have been the only copy — refused if so');

// ── 3. R-SPB-4: csg_aalagar / csg_bith is LEGITIMATE shared authorship, recorded not "fixed" ─────
// A future reader running a duplicate-sentence sweep WILL find these six and reach for them. This
// leg is the answer waiting there: they were read, they are correct, leave them. Its failing would
// mean someone "corrected" a signposted shared passage — the exact over-reach R-SPB-2 forbids.
// R-SPB-6 — a red here has TWO meanings, not one: someone corrected correct authorship, OR a
// legitimate CSG re-import reworded the shared passage (nothing obliges a future version to keep six
// sentences identical). Either way the response is READ THE PAIR AND RE-RECORD — never silently
// raise the `>= 6` to match a new count.
const aal = SPECIES.csg_aalagar || {};
const bith = SPECIES.csg_bith || {};
const sentences = (t) => new Set(String(t || '').split(/(?<=[.!?])\s+/).map((s) => s.trim())
  .filter((s) => s.length > 60));
const shared = [...sentences(aal.physiology)].filter((s) => sentences(bith.physiology).has(s));
ok(shared.length >= 6,
   `csg_aalagar / csg_bith share ${shared.length} sentences — LEGITIMATE (R-SPB-4), not a bleed`,
   String(shared.length));
ok(/Bith-related/.test(aal.physiology || '') || /Bith-related/.test(aal.description || ''),
   'and Aalagar SIGNPOSTS the reuse ("Bith-related") — the author telling the reader it is shared, '
   + 'which is why it is correct and untouched',
   'the signpost that distinguishes legit reuse from a bleed is missing');

// ── 4. MUTATION IS CAPABLE — and NOT a tautology (C-SPB-1) ───────────────────────────────────────
// The old leg appended "Echani" to the text and then asserted the text contains "Echani" — true by
// construction, proving nothing about leg 1. This instead exercises leg 1's OWN predicate on two
// inputs and requires it to DISCRIMINATE: reject the shipped text, accept the bleed mutant. If leg
// 1's predicate were ever loosened (e.g. to always return false), this leg reddens on the mutant.
const mutant = mir + ' The Thyrsian subspecies of Echani starkly contrasts their appearance.';
ok(namesEchani(mutant) === true && namesEchani(mir) === false,
   'MUTATION IS CAPABLE: leg 1\'s predicate REJECTS the shipped Miraluka text and ACCEPTS the bleed '
   + 'mutant — so a re-import that reintroduced the sentences, or a loosening of leg 1, turns it red',
   `mutant=${namesEchani(mutant)} shipped=${namesEchani(mir)}`);

// ── 5. B-310 / ledger E2 — the glued OCR fragment, pinned and swept ─────────────────────────────
// `tor_miraluka.society` ended "...for the sake of the galaxy.eyes." — a word welded onto a finished
// sentence, which is an OCR flow artifact, not authorship. Jason read the printed page (E2) and
// confirmed it ends at `galaxy.`, so the fragment is OURS. Unlike the B-178 bleed there is no other
// record to restore it from; the evidence is the human reading, which is why the correction pass
// refuses unless the shipped tail is exactly what the inspection described.
const soc = (SPECIES.tor_miraluka || {}).society || '';
ok(/for the sake of the galaxy\.$/.test(soc.trim()),
   'tor_miraluka.society ends at "galaxy." — the E2 fragment is out',
   `tail=${JSON.stringify(soc.trim().slice(-40))}`);

// THE CLASS, not just the instance (the b178 measurement inverted): NO prose field in ANY shipped
// species record ends in a glued fragment. Scoped to the FIELD-END on purpose — mid-text periods
// are legitimately followed by letters ("e.g.", initials, ellipses), so a whole-text rule would
// flag correct prose and get relaxed into uselessness. A future import that reintroduces this
// artifact ANYWHERE turns this red, which is what stops it being a one-record allowlist.
const GLUED = /[a-z]\.[a-z]+\.?\s*$/;
const glued = [];
Object.keys(SPECIES).forEach((sid) => {
  const rec = SPECIES[sid];
  if (!rec || typeof rec !== 'object') return;
  Object.keys(rec).forEach((f) => {
    const v = rec[f];
    if (typeof v === 'string' && v.length > 40 && GLUED.test(v)) glued.push(`${sid}.${f}`);
  });
});
ok(glued.length === 0,
   `no prose field in any of the ${Object.keys(SPECIES).length} species records ends in a glued fragment`,
   glued.join(', '));

// MUTATION IS CAPABLE, and not a tautology: the sweep's OWN predicate must reject the shipped tail
// and accept the fragment restored. A predicate that always returned false would pass leg 5's first
// assert and the sweep above, and prove nothing.
ok(GLUED.test(soc.trim()) === false && GLUED.test(soc.trim() + 'eyes.') === true,
   'MUTATION IS CAPABLE: the sweep predicate REJECTS the corrected tail and ACCEPTS the fragment '
   + 'restored — so a re-import that reintroduces it, or a loosened predicate, turns leg 5 red');

console.log(`\nspecies prose bleed: ${fail ? `${fail} FAIL` : 'ALL PASS'} (${pass} pass, ${fail} fail)`);
process.exit(fail ? 1 : 0);
