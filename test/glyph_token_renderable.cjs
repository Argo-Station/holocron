/**
 * Every bracket token in every shipped registry resolves to a die the renderer can DRAW.
 *
 * Ruling `tor-p3-talents-addendum` R-TTA-5 (build card §6), under R-TTA-1 — which amends R-TPT-3's
 * poison-token posture with its missing second half: it is not enough that no UNDECODED glyph
 * reaches a shipped record; **the shipped form must be one the shared renderer resolves.**
 *
 * WHY THAT AMENDMENT EXISTED. Lap 2's guard asserted "no undecoded glyph token reached a shipped
 * description" and was green and honest — the glyphs *were* decoded, into a vocabulary the renderer
 * does not speak. `lib/shared/ui.jsx`'s `glyphText` splits on `/(\[[A-Z]{2}\])/g` and resolves
 * through `BRACKET_TOKENS`, so `[setback]` is never captured and survives to the page as literal
 * text. A check on the wrong half of a translation is the kind of green that costs the most,
 * because it retires the suspicion.
 *
 * THE ALPHABET IS READ FROM THE RENDERER, NOT RESTATED HERE. If this guard kept its own list of
 * legal tokens, it could drift from the thing that actually draws them and go green over text no
 * player can read — the exact failure it exists to catch. So `BRACKET_TOKENS` is parsed out of
 * `lib/shared/diceUI.jsx`: name the consumer in the assert.
 *
 * Run: node test/glyph_token_renderable.cjs
 */
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '..');
const CANON = path.join(REPO, 'public/data/canonical');

let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? (pass++, console.log('  PASS  ' + m))
                            : (fail++, console.log('  FAIL  ' + m + (d ? ' — ' + d : ''))); };

// ── the renderer's own alphabet ───────────────────────────────────────────────────────────────
const uiSrc = fs.readFileSync(path.join(REPO, 'lib/shared/diceUI.jsx'), 'utf8');
const tableMatch = uiSrc.match(/BRACKET_TOKENS\s*=\s*\{([\s\S]*?)\}/);
const LEGAL = new Set((tableMatch ? tableMatch[1] : '').match(/\b([A-Z]{2})\s*:/g)
  ? (tableMatch[1].match(/\b([A-Z]{2})\s*:/g) || []).map((s) => s.replace(/\s*:$/, '')) : []);
ok(LEGAL.size === 17,
   `the renderer's BRACKET_TOKENS alphabet was read from lib/shared/diceUI.jsx (${LEGAL.size} keys)`,
   [...LEGAL].join(','));
// Non-vacuity: if the parse silently produced an empty set, every scan below would pass trivially.
ok(LEGAL.has('SE') && LEGAL.has('DI') && LEGAL.has('SU'),
   'and it is a real alphabet, not an empty parse (SE/DI/SU present)');

// ── PROSE IN BRACKETS is not a glyph token, and is named rather than pattern-matched ──────────
// Three shipped strings legitimately bracket a WORD: a planet, a skill, a range band. A guard that
// treated every bracketed token as a die would report these as defects forever, and the pressure
// would be to loosen the check. Membership is a manifest (ADR 0034).
// RE-POINTED (f100-triage-census-card ADDENDUM 8 Q4 + ADDENDUM 13, B-136 d6e407791): the books print the range
// bands and the ranged-skill qualifiers in brackets ("Ranged [Light]; … Range [Short]", UaBS p.36); B-136 restored
// them. They are WORDS, not a token class — the drawers match `[A-Z]{2}` only, so they print as words.
const PROSE_IN_BRACKETS = new Set(['Dinegia', 'Warfare',
  'Engaged', 'Short', 'Medium', 'Long', 'Extreme', 'Strategic', 'Planetary',  // range bands
  'Light', 'Heavy']);                                                          // Ranged [Light] / [Heavy]

function scan(file) {
  const raw = fs.readFileSync(path.join(CANON, file), 'utf8');
  const hits = [];
  for (const m of raw.matchAll(/\[([A-Za-z_]{2,20})\]/g)) {
    const tok = m[1];
    if (LEGAL.has(tok) || PROSE_IN_BRACKETS.has(tok)) continue;
    hits.push(tok);
  }
  return hits;
}

function recordsWith(file, key) {
  const data = JSON.parse(fs.readFileSync(path.join(CANON, file), 'utf8'));
  const table = data[key] || data;
  const out = {};
  for (const [id, rec] of Object.entries(table)) {
    if (!rec || typeof rec !== 'object') continue;
    const bad = [];
    for (const m of JSON.stringify(rec).matchAll(/\[([A-Za-z_]{2,20})\]/g)) {
      if (!LEGAL.has(m[1]) && !PROSE_IN_BRACKETS.has(m[1])) bad.push(m[1]);
    }
    if (bad.length) out[id] = bad;
  }
  return out;
}

// ── 1. THE WHOLE REGISTRY, every file ─────────────────────────────────────────────────────────
const FILES = fs.readdirSync(CANON).filter((f) => f.endsWith('.json')).sort();
const perFile = {};
for (const f of FILES) {
  const hits = scan(f);
  if (hits.length) perFile[f] = hits.length;
}
ok(FILES.length >= 14, `scanned every canonical registry (${FILES.length} files)`);

// ── 2. TALENTS: zero. This is what R-TTA-5 repairs ────────────────────────────────────────────
const talentBad = recordsWith('talents.json', 'talents');
ok(Object.keys(talentBad).length === 0,
   'talents.json: EVERY bracket token resolves to a die the renderer can draw',
   JSON.stringify(talentBad));

// ── 3. SPECIES: the same defect, now REPAIRED ─────────────────────────────────────────────────
// The registry-wide scan (this file's own reason for existing) found the same defect Lap 2's
// talents importer had, in Lap 1's four TOR species. `tor-talents-glyph-repair` pinned it at 10
// across those four; `tor-species-glyph-repair` (R-TGR-5) fixed it. The pin flips 10 -> 0 rather
// than being deleted — a repaired defect with nothing watching it returns through a re-import — and
// this assert now warrants the SAME renderable-form property for species that leg 2 does for
// talents, so the whole class is under one guard.
const speciesBad = recordsWith('species.json', 'species');
const speciesCount = Object.values(speciesBad).reduce((n, v) => n + v.length, 0);
ok(speciesCount === 0,
   'species.json: EVERY bracket token resolves to a die the renderer can draw — the 10 across four '
   + 'TOR records are repaired and import_tor_species.py can no longer reproduce them',
   JSON.stringify(speciesBad));

// ── 4. NOTHING ELSE anywhere ──────────────────────────────────────────────────────────────────
const unexpected = Object.entries(perFile).map(([f, n]) => `${f}:${n}`);
ok(unexpected.length === 0,
   'no registry carries an unrenderable token — the class (talents + species) is fully repaired',
   unexpected.join(', '));

// ── 5. MUTATION IS CAPABLE ────────────────────────────────────────────────────────────────────
// If the scanner could not see a long-form token, legs 2-4 would be green over anything.
const planted = JSON.stringify({ x: { description: 'removes [setback] per rank' } });
const seen = [...planted.matchAll(/\[([A-Za-z_]{2,20})\]/g)]
  .filter((m) => !LEGAL.has(m[1]) && !PROSE_IN_BRACKETS.has(m[1])).length;
ok(seen === 1,
   'MUTATION IS CAPABLE: a planted [setback] is seen by the same scanner legs 2-4 use, so their '
   + 'green is an outcome and not a blind pass');

console.log(`\nglyph token renderable: ${fail ? `${fail} FAIL` : 'ALL PASS'} (${pass} pass, ${fail} fail)`);
process.exit(fail ? 1 : 0);
