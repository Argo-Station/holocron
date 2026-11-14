/* B-437 — BREATHING TEXT IS A CLASS, AND STAYS ONE (ruling `idle-prompt-motion-floor` R-IPM-4).
 *
 * WHY A GUARD AND NOT A NOTE. The defect was never that a pulse looped; it was that the pulse was
 * declared INLINE, where no `@media (prefers-reduced-motion: reduce)` rule can reach it. Three
 * sites carried the same inline declaration and the reduced-motion rules in `tokens.css` and
 * `paper.css` — which have existed for months and are correct — applied to none of them. Nothing
 * was red; nothing could be. A rule broken this way needs a CHECK that notices, not the rule
 * restated (`[[feedback_mechanism_over_a_louder_doc]]`).
 *
 * WHAT IT ASSERTS
 *   1. no source declares the shell's `breathe` keyframe in an INLINE style — the exact form that
 *      is unguardable; a class using it is fine, which is why the test is on the inline form;
 *   2. `.breathing-text` exists in `tokens.css` WITH a reduced-motion rule that turns it off —
 *      a class nobody guards is the same defect with better manners;
 *   3. its keyframe never dips below .85, so the pulse cannot cost more than 15% of an element's
 *      resting opacity (the floor-safe half of R-IPM-4; the FINITE half is deliberately not taken —
 *      a loader that stops breathing while it loads reads as stalled).
 *
 * FOUNDING CASES (R-CPR-39), asserted by name so silence here is a tested result: `player/app.jsx`'s
 * two "LOADING GALACTIC DATA" screens and `lib/shared/ui.jsx`'s hub-card tap cue — the third site,
 * which the brief that carded this class missed because it grepped the apps' jsx and not the shared.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.dirname(__dirname);

let bad = 0;
const fail = (m) => { console.log('✗ ' + m); bad++; };
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const SOURCES = ['player/app.jsx', 'gm/app.jsx', 'lib/shared/ui.jsx', 'lib/shared/diceUI.jsx',
                 'lib/shared/diceRoll.jsx', 'lib/dice/diceSurface.jsx', 'lib/library/npc/view.jsx',
                 'lib/store/view.jsx'];

// 1 — the unguardable form
for (const f of SOURCES) {
  let src;
  try { src = read(f); } catch (e) { continue; }
  src.split('\n').forEach((line, i) => {
    if (/animation:\s*['"`]breathe[ -]/.test(line)) {
      fail(f + ':' + (i + 1) + ' declares `breathe` in an INLINE style. An inline animation cannot '
         + 'be reached by any @media rule, so no reduced-motion guard applies to it. Use '
         + 'className="breathing-text" (lib/shared/tokens.css) and pass a rhythm with --breathe-dur.');
    }
  });
}

// 2 — the class, and its guard
const tokens = read('lib/shared/tokens.css');
if (!/\.breathing-text\s*\{[^}]*animation:/.test(tokens))
  fail('lib/shared/tokens.css: `.breathing-text` does not declare an animation — this guard has lost its subject');
const guarded = /@media \(prefers-reduced-motion: reduce\) \{[^}]*\.breathing-text[^}]*animation:\s*none/.test(tokens);
if (!guarded) fail('lib/shared/tokens.css: `.breathing-text` has no `prefers-reduced-motion` rule turning it off — '
                 + 'which is the entire reason it is a class');

// 3 — the floor-safe range
const kf = tokens.match(/@keyframes breathe-soft \{([^}]*\}[^}]*)\}/);
if (!kf) fail('lib/shared/tokens.css: `@keyframes breathe-soft` not found');
else {
  const stops = [...kf[1].matchAll(/opacity:\s*([0-9.]+)/g)].map((m) => parseFloat(m[1]));
  const lo = Math.min(...stops);
  if (!(lo >= 0.85)) fail('breathe-soft dips to ' + lo + ' — below .85, the pulse costs more than 15% of an '
                        + "element's resting opacity and a site that rests near the floor crosses it "
                        + '(the shell `breathe` dipped to .55 and took the parchment loader to 2.70:1)');
}

// 4 — the founding cases are actually on the class
const app = read('player/app.jsx');
const loaders = [...app.matchAll(/LOADING GALACTIC DATA/g)].length;
if (loaders !== 2) fail('expected the two "LOADING GALACTIC DATA" screens, found ' + loaders
                      + ' — re-point this guard at the founding cases it names');
app.split('\n').forEach((line, i) => {
  if (/LOADING GALACTIC DATA/.test(line) && !/className="breathing-text"/.test(line))
    fail('player/app.jsx:' + (i + 1) + ' is a loading screen not on `breathing-text`');
});
const ui = read('lib/shared/ui.jsx');
if (!/className: 'breathing-text'/.test(ui))
  fail("lib/shared/ui.jsx: the hub card's tap cue is not on `breathing-text` — the third founding case");

if (bad) { console.log('breathing_text_is_a_class: ' + bad + ' problem(s)'); process.exit(1); }
console.log('✓ breathing_text_is_a_class: no inline `breathe`; the class is declared, guarded, and '
          + 'floor-safe (>= .85); all three founding sites carry it');
