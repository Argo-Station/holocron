#!/usr/bin/env node
/*
 * f100_hub_quality_words.cjs — the dice hub BUILD lap's quality words (ruling `f100-surfacing-hub-concept` ADDENDUM 5 riders
 * R1–R3, ADDENDUM 7 R2's token): lib/shared/qualityRows.js, M12's key ON.
 *
 *   R1  a mode's pool row names its source ONCE: Auto-fire's row reads source "Auto-fire" (it was "Auto-fire (Auto-fire on)").
 *   R2  the ONE filler: `{steps:step}` prints "by 1 step" at the printed value and "by 2 steps" under Sunder (Improved);
 *       the shipped Sunder template carries the token; a bare `{field}` still prints the value.
 *   R3  a mode with no pool rows carries its own words from its registry fields: Stun setting → "damage dealt as strain;
 *       Short range at most"; Auto-fire (no damage_as / range_max) → null.
 *   BITE each leg is re-run over a mutant (the noun token stripped from the template; the source doubled; the mode's fields
 *       removed) and must fail there — read from the leg's own result, not the output.
 *
 *   node test/f100_hub_quality_words.cjs   → exit 0 green, exit 1 on any failed leg
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const QR = require(path.join(ROOT, 'lib/shared/qualityRows.js'));
const vocab = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical/qualities.vocab.json'), 'utf8')).entries;
const V = {}; vocab.forEach((e) => { V[e.id] = e; });

let fails = 0, legs = 0;
const check = (label, ok, detail) => { legs++; if (!ok) fails++; console.log((ok ? '  PASS  ' : '  FAIL  ') + label + (detail ? ' — ' + detail : '')); };
const W = (...qs) => ({ _qualitiesRaw: qs.map(([id, rank]) => rank ? { id, name: V[id].label, ranked: true, rank } : { id, name: V[id].label, ranked: false }) });
const ON = (fn) => fn();   // post1-switch-deletion (ADDENDUM 638): the engine key is deleted; the one world
const clone = (x) => JSON.parse(JSON.stringify(x));

ON(() => {
  // R1
  const r1 = (voc) => { const m = QR.modeOffers(W(['auto_fire']), { vocab: voc, anchor: { scope: 'skill', value: 'ranged_heavy' } })[0]; return m && m.poolRows[0] && m.poolRows[0].source; };
  check('R1 Auto-fire\'s mode row names its source once', r1(vocab) === 'Auto-fire', JSON.stringify(r1(vocab)));
  const v1 = clone(vocab); v1.find((e) => e.id === 'auto_fire').label = 'Auto-fire (Auto-fire on)';
  check('R1 BITE: a doubled label reads as doubled (the leg can fail)', r1(v1) !== 'Auto-fire', JSON.stringify(r1(v1)));

  // R2
  const sun = (voc, sets) => { const w = W(['sunder']); if (sets) w._spendEffectSets = sets; return (QR.spendRows(w, { vocab: voc, when: 'hit' })[0] || {}).effect || ''; };
  check('R2 the shipped Sunder template carries {steps:step}', /\{steps:step\}/.test(V.sunder.spend[0].effect), V.sunder.spend[0].effect.slice(0, 60));
  check('R2 Sunder at its printed value reads "by 1 step"', /by 1 step\b/.test(sun(vocab)) && !/by 1 steps/.test(sun(vocab)), sun(vocab).slice(0, 60));
  const imp = [{ key: 'sunder', field: 'steps', amount: 2, source: 'Sunder (Improved)' }];
  check('R2 Sunder (Improved) reads "by 2 steps"', /by 2 steps\b/.test(sun(vocab, imp)), sun(vocab, imp).slice(0, 60));
  const v2 = clone(vocab); const s2 = v2.find((e) => e.id === 'sunder'); s2.spend[0].effect = s2.spend[0].effect.replace('{steps:step}', '{steps} step');
  check('R2 BITE: the bare-token template reads "by 2 step" (the leg can fail)', !/by 2 steps\b/.test(sun(v2, imp)), sun(v2, imp).slice(0, 60));

  // R3
  const md = (voc, id) => { const m = QR.modeOffers(W([id]), { vocab: voc, anchor: { scope: 'skill', value: 'ranged_heavy' } })[0]; return m ? m.words : undefined; };
  check('R3 Stun setting\'s words read from its mode fields', md(vocab, 'stun_setting') === 'damage dealt as strain; Short range at most', JSON.stringify(md(vocab, 'stun_setting')));
  check('R3 Auto-fire\'s mode says no words of its own (its dice say it)', md(vocab, 'auto_fire') === null, JSON.stringify(md(vocab, 'auto_fire')));
  const v3 = clone(vocab); const st = v3.find((e) => e.id === 'stun_setting'); delete st.mode.damage_as; delete st.mode.range_max;
  check('R3 BITE: the fields removed → no words (the leg can fail)', md(v3, 'stun_setting') !== 'damage dealt as strain; Short range at most', JSON.stringify(md(v3, 'stun_setting')));
});

console.log((fails ? 'FAILED' : 'OK') + ' — ' + (legs - fails) + '/' + legs);
process.exit(fails ? 1 : 0);
