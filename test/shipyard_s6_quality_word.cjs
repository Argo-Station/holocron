// test/shipyard_s6_quality_word.cjs — SHIP YARD S6 (card `shipyard-s6-build` §3, acceptance (b)'s node leg): the ONE quality
// word, the resolver's held mark, THE SHIP's credit words, the OFF-BOOK note's joined reasons and the type word's article.
//
//   B2  `vesselResolve.js` `heldOut`, the `rowsBlind` branch: a rated quality whose count a talent hold nulls also carries
//       `held: true`; an unrated quality never does; a ship that is not held carries no `held` on any quality.
//   B1  `vesselView.jsx` `qualWord` stays the one formatter: "<Label> N", "<Label> —" where held, "<Label>" alone only when
//       unrated. Its parts form (`qualParts`) is the same words, one string per quality, so THE SHIP keeps each whole.
//   B3  `qualCredits`: one line per `because.weapon_quality_<i>` entry, "<QUALITY LABEL> <resolved count> · <SOURCE> <signed>"
//       ("LIMITED AMMO 7 · OVERSTOCKED AMMO +1", the frames' F1).
//   B5  `fitOffBook` returns EVERY reason joined " · "; `fitVerdict` (K2 (a)) still prints the first.
//   B6  one article rule (`vesselStore.js` `withArticle`): "an" before a vowel letter, else "a" — at resolveFit's two
//       reasons and fitWhy's two lines; the count of hulls it turns is recomputed from the registries and pinned.
//
// Driven, never retyped: the view's functions are SLICED from the shipped source by name (test/b1067_device_roster_ctx.cjs's
// way); the resolver and the store load whole. Every figure is read from the registries. `S6_REF=<sha>` reads the three
// product files at that commit instead (the red-first run); `S6_SRC=<dir>` reads them from a mutant copy (the bites).
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log('✓ ' + label); } else { fail++; console.log('✗ ' + label + (detail !== undefined ? '  — ' + JSON.stringify(detail).slice(0, 400) : '')); }
}
const REF = process.env.S6_REF || null;
// `S6_SRC=<dir>` reads the product files from a mutant COPY of the tree's lib/ (the bites; the tree itself is never planted)
const SRC = process.env.S6_SRC || ROOT;
const src = (p) => (REF ? execFileSync('git', ['show', REF + ':' + p], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 }) : fs.readFileSync(path.join(SRC, p), 'utf8'));
const json = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
function slice(code, name) {
  const m = new RegExp('(^|\\n)([ \\t]*)function ' + name + '\\(').exec(code);
  if (!m) return null;
  const start = m.index + m[1].length;
  let i = code.indexOf('{', start), depth = 0;
  for (; i < code.length; i++) { if (code[i] === '{') depth++; else if (code[i] === '}' && --depth === 0) return code.slice(start, i + 1); }
  return null;
}
function load(file, name) { const box = {}; new Function(src(file)).call(box); return box[name]; }

const R = load('lib/shared/vesselResolve.js', 'SWRPGVesselResolve');
const VS = load('lib/shared/vesselStore.js', 'SWRPGVessels');
const ATT = json('public/data/canonical/vehicle-attachments.json').vehicle_attachments;
const TAL = json('public/data/canonical/talents.json').talents;
const VOC = json('public/data/canonical/qualities.vocab.json').entries;
const VEH = {};
fs.readdirSync(path.join(ROOT, 'public/data/vehicle-library')).filter((f) => f.endsWith('.json'))
  .forEach((f) => (json('public/data/vehicle-library/' + f).entries || []).forEach((e) => { VEH[e.key] = e; }));
// the registry the view reads (`p.reg.qualities`): the vocab by id AND by alias (the hull rows carry OggDude keys)
const QREG = {};
VOC.forEach((e) => { QREG[e.id] = e; (e.aliases || []).forEach((a) => { QREG[a] = e; }); });
const label = (k) => (QREG[k] ? QREG[k].label : k);

// the view's functions, sliced; `window` holds the two shared modules the view reaches through VR() and V()
const vv = src('lib/shared/vesselView.jsx');
const NAMES = ['VR', 'V', 'upper', 'qualLabel', 'qualParts', 'qualWord', 'qualCredits', 'fitSign', 'fitOffBook', 'fitVerdict', 'fitWhy'];
const got = NAMES.map((n) => [n, slice(vv, n)]);
const missing = got.filter((x) => !x[1]).map((x) => x[0]);
check('the view carries every function this leg drives (' + NAMES.join(', ') + ')', missing.length === 0, missing);
const F = new Function('window', got.filter((x) => x[1]).map((x) => x[1]).join('\n') + '\nreturn { '
  + got.filter((x) => x[1]).map((x) => x[0] + ': ' + x[0]).join(', ') + ' };')({ SWRPGVesselResolve: R, SWRPGVessels: VS });
const p = { reg: { qualities: QREG } };
const call = (n, ...a) => { try { return F[n] ? F[n](...a) : undefined; } catch (e) { return 'THREW ' + e.message; } };

// ── fixtures, read from the registries ──
const XW = VEH.T65BXWING, T47 = VEH.T47ALLIANCE;
const vessel = (id, key) => ({ id, vehicleKey: key, owner: 'party', attachments: [], crew: [], mounts: [] });
const holder = (ship, talents, rows) => ({ characters: [{ id: 'ace', sheetData: { myShipId: ship }, talents }], talentRecords: rows, attachments: ATT });
const OA = (TAL.overstocked_ammo.vehicle_effects || []).filter((e) => e.op === 'weapon_quality_delta')[0];
check('the fixtures are the registries\': the X-wing\'s torpedoes print Limited Ammo, the T-47\'s second weapon carries an unrated '
  + 'Knockdown beside rated qualities, Overstocked Ammo\'s row is +' + (OA && OA.amount) + ' Limited Ammo per rank',
  XW.weapons[1].qualities_resolved.some((q) => R.qualityKeyIs(q.key, 'limited_ammo') && typeof q.count === 'number')
  && T47.weapons[1].qualities_resolved.some((q) => q.count == null) && T47.weapons[1].qualities_resolved.some((q) => typeof q.count === 'number')
  && OA && OA.per_rank === true && OA.amount === 1 && R.qualityKeyIs('LIMITEDAMMO', OA.quality));

// ── B2 · the held mark ──
const held = R.resolve(vessel('v_t47', 'T47ALLIANCE'), T47, holder('v_t47', { signature_vehicle: 1 }, null));
const hq = held.weapons[1].qualities_resolved, bq = T47.weapons[1].qualities_resolved;
check('B2: holder rows not in hand → the ship is held (R-M8C8-1)', held.held === true, held.held);
check('B2: every quality the hull rates reads count null AND held: true (' + bq.filter((q) => typeof q.count === 'number').map((q) => q.key).join(', ') + ')',
  bq.every((q, j) => typeof q.count !== 'number' || (hq[j].count === null && hq[j].held === true)), hq);
check('B2: an unrated quality (' + bq.filter((q) => q.count == null).map((q) => q.key).join(', ') + ') carries no held mark',
  bq.every((q, j) => q.count != null || hq[j].held === undefined), hq);
const plain = R.resolve(vessel('v_xw', 'T65BXWING'), XW, holder('v_xw', { signature_vehicle: 1, overstocked_ammo: 1 }, TAL));
const partsHeld = R.resolve(vessel('v_xw', 'T65BXWING'), XW, { characters: [], attachments: null });
check('B2: a ship that is not talent-held carries no held mark on any quality (bonded with rows in hand; and parts-held, whose ratings stay knowable)',
  !plain.held && plain.weapons.every((w) => w.qualities_resolved.every((q) => q.held === undefined))
  && partsHeld.weapons.every((w) => w.qualities_resolved.every((q) => q.held === undefined)), [plain.held, partsHeld.held]);

// ── B1 · one quality word ──
const word = (qs) => qs.map((q) => label(q.key) + (q.count != null ? ' ' + q.count : q.held ? ' —' : '')).join(', ');
check('B1: held — "' + word(hq) + '" (a held rating reads "—", the unrated Knockdown its bare label)',
  call('qualWord', p, hq) === word(hq) && /Knockdown, Ensnare —, Limited Ammo —/.test(call('qualWord', p, hq)), call('qualWord', p, hq));
check('B1: the parts form is the same words, one per quality, joined by nothing else',
  Array.isArray(call('qualParts', p, hq)) && call('qualParts', p, hq).join(', ') === call('qualWord', p, hq)
  && call('qualParts', p, hq).length === hq.length, call('qualParts', p, hq));
const xw1 = plain.weapons[1].qualities_resolved;
check('B1: bonded at Overstocked Ammo 1 — "' + word(xw1) + '"', call('qualWord', p, xw1) === word(xw1) && /Limited Ammo 7/.test(word(xw1)), call('qualWord', p, xw1));
check('B1: no qualities → the empty word (the line is absent, never "NONE")', call('qualWord', p, []) === '' && (call('qualParts', p, []) || [1]).length === 0);

// ── B3 · the credit words ──
const credits = (i, r, w) => (r.because['weapon_quality_' + i] || []).map((c) => {
  const q = w.qualities_resolved.filter((x) => R.qualityKeyIs(x.key, c.quality))[0];
  return label(q ? q.key : c.quality).toUpperCase() + ' ' + (q && q.count != null ? q.count : '—') + ' · ' + String(c.source).toUpperCase() + ' ' + (c.amount > 0 ? '+' + c.amount : c.amount < 0 ? '−' + Math.abs(c.amount) : '0');
});
const want = credits(1, plain, plain.weapons[1]);
check('B3: the torpedoes\' credit — ' + JSON.stringify(want), JSON.stringify(call('qualCredits', p, plain.weapons[1], plain.because['weapon_quality_1'])) === JSON.stringify(want)
  && want.length === 1 && want[0] === 'LIMITED AMMO 7 · ' + TAL.overstocked_ammo.name.toUpperCase() + ' +1', call('qualCredits', p, plain.weapons[1], plain.because['weapon_quality_1']));
check('B3: the laser carries no credit (no Limited Ammo), and no entry gives no line',
  !plain.because.weapon_quality_0 && JSON.stringify(call('qualCredits', p, plain.weapons[0], plain.because.weapon_quality_0)) === '[]');

// ── B5 · the OFF-BOOK note ──
const CD = VS.resolveFit(Object.assign({}, T47, { type: T47.type, is_starship: T47.is_starship }), ATT.cloaking_device);
// RE-POINTED (S7, card `shipyard-s7-build` ADDENDUM 7 item 2): fitOffBook reads fitModel's `verdict` (every row's, before the
// offer drops D-222's 22), no longer `groups.nofit`. KEPT: the row, the reasons, the join. DROPPED: the groups-only model.
const CDROW = { a: { id: 'cloaking_device' }, fit: CD, g: 'nofit' };
const m = { groups: { nofit: [CDROW] }, verdict: { cloaking_device: CDROW } };
check('B5: the fixture fails two limits (Cloaking Device on the T-47: ' + JSON.stringify(CD.reasons) + ')', CD.ok === false && CD.reasons.length === 2, CD);
check('B5: fitOffBook joins every reason with " · "', call('fitOffBook', {}, m, { id: 'cloaking_device' }) === CD.reasons.join(' · '), call('fitOffBook', {}, m, { id: 'cloaking_device' }));
check('B5: a plan prints no note', call('fitOffBook', { plan: true }, m, { id: 'cloaking_device' }) === null);
check('B5 · K2 (a): fitVerdict still prints the first reason only', call('fitVerdict', { g: 'nofit', fit: CD }) === 'DOES NOT FIT · ' + CD.reasons[0], call('fitVerdict', { g: 'nofit', fit: CD }));

// ── B6 · the article ──
const vowel = (t) => /^[aeiou]/i.test(String(t || ''));
const art = (t) => (vowel(t) ? 'an ' : 'a ') + t;
check('B6: the one rule — "an Airspeeder", "a Landspeeder", "an Armored Transport", "a Light Freighter"',
  typeof VS.withArticle === 'function' && VS.withArticle('Airspeeder') === 'an Airspeeder' && VS.withArticle('Landspeeder') === 'a Landspeeder'
  && VS.withArticle('Armored Transport') === 'an Armored Transport' && VS.withArticle('Light Freighter') === 'a Light Freighter', typeof VS.withArticle);
check('B6: resolveFit\'s starships-only reason on the T-47 reads "this is an Airspeeder"', CD.reasons.indexOf('starships only — this is an Airspeeder') !== -1, CD.reasons);
const hulls = Object.values(VEH), vow = hulls.filter((v) => vowel(v.type));
const STARONLY = { constraints: { must_be_starship: true } };
const bad = [];
hulls.forEach((v) => {
  if (v.is_starship === false) {
    const r = VS.resolveFit(v, STARONLY).reasons[0];
    if (r !== 'starships only — this is ' + art(v.type || 'non-starship')) bad.push([v.key, r]);
  }
  if (v.type) {
    const r = VS.resolveFit(v, { constraints: { type_limit: ['__none__'] } }).reasons[0];
    if (r !== 'only for __none__ — this is ' + art(v.type)) bad.push([v.key, r]);
  }
});
check('B6: every hull\'s two resolveFit reasons take the rule (' + hulls.length + ' hulls)', bad.length === 0, bad.slice(0, 4));
check('B6: the count it turns — ' + vow.length + ' hulls whose type starts with a vowel, ' + vow.filter((v) => v.is_starship === false).length
  + ' not starships (the lab\'s 37), ' + vow.filter((v) => v.is_starship === true).length + ' starships (reached through type_limit only)',
  hulls.length === 433 && vow.length === 41 && vow.filter((v) => v.is_starship === false).length === 37 && vow.filter((v) => v.is_starship === true).length === 4,
  { hulls: hulls.length, vowel: vow.length });
const live = { silhouette: T47.silhouette, type: T47.type };
const why = call('fitWhy', { g: 'fits', a: { constraints: { must_be_starship: true, type_limit: ['Landspeeder'] } } }, live, false);
check('B6: fitWhy\'s two lines take it — ' + why, typeof why === 'string' && why.indexOf('STARSHIPS ONLY; THIS IS AN AIRSPEEDER') !== -1
  && why.indexOf('ONLY FOR LANDSPEEDER; THIS IS AN AIRSPEEDER') !== -1, why);
const why2 = call('fitWhy', { g: 'fits', a: { constraints: { must_be_starship: true } } }, { silhouette: 4, type: 'Light Freighter' }, true);
check('B6: …and "a" before a consonant (the phone\'s form) — ' + why2, why2 === 'FITS THIS HULL · STARSHIPS ONLY, AND THIS IS A LIGHT FREIGHTER', why2);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
