// test/picture_helper.cjs — SHIP YARD S4 · JOB 3a · R-S4G-16 (ruling `shipyard-s4-ground`: "one helper, two settings";
// `shipyard-s3-contracts` F-b). The ONE re-encode helper, lib/shared/picture.js (window.SWRPGPicture), takes its ladder
// and cap from the caller:
//   · a character's PORTRAIT keeps its single rung and no cap — it never refuses, and on any failure it hands back the
//     ORIGINAL data URI, so a portrait is never lost to a re-encode error (the shipped `reEncodePortrait`, B-926);
//   · a SHIP'S PICTURE (U1) takes F-b's ladder and cap from SWRPGVessels, walks the ladder in order until the JPEG fits,
//     and is refused 'too_large' when none fits, 'not_picture' when the file will not decode.
// Driven in node with a counting canvas (each draw's JPEG length is measurable), then the source pins: both hosts reach
// the one helper, and neither app keeps a canvas re-encode of its own.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log('✓ ' + label); } else { fail++; console.log('✗ ' + label + (detail !== undefined ? '  — ' + JSON.stringify(detail).slice(0, 300) : '')); }
}
const src = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };

let P = null, VS = null;
try { P = require(path.join(ROOT, 'lib/shared/picture.js')); } catch (e) { check('lib/shared/picture.js loads', false, String(e).slice(0, 120)); }
try { const m = require(path.join(ROOT, 'lib/shared/vesselStore.js')); VS = m.SWRPGVessels || global.SWRPGVessels; } catch (e) { check('vesselStore.js loads', false, String(e).slice(0, 120)); }
check('the ONE helper exists: SWRPGPicture.reEncode + readFile', !!(P && typeof P.reEncode === 'function' && typeof P.readFile === 'function'));

// the counting canvas: a draw at longest edge E and quality Q yields a JPEG of E·Q·per characters
function harness(o) {
  const draws = [];
  global.Image = function () {
    const img = this;
    setTimeout(function () {
      if (o.decode === false) { if (img.onerror) img.onerror(); return; }
      img.naturalWidth = 'w' in o ? o.w : 1000; img.naturalHeight = 'h' in o ? o.h : 800;
      if (img.onload) img.onload();
    }, 0);
  };
  global.document = { createElement: function () {
    return { width: 0, height: 0, getContext: function () { return { drawImage: function () {} }; },
      toDataURL: function (type, q) {
        draws.push({ w: this.width, h: this.height, q: q, type: type });
        return 'data:image/jpeg;base64,' + 'A'.repeat(Math.round(Math.max(this.width, this.height) * q * (o.per || 100)));
      } };
  } };
  return draws;
}
const URI = 'data:image/png;base64,iVBORw0KGgo=';

(async function main() {
  if (!P || !VS) { finish(); return; }
  // ── the portrait's setting: ONE rung, no cap ──
  check('R-S4G-16: the portrait setting is one rung [512, 0.82] with no cap', JSON.stringify(P.PORTRAIT) === JSON.stringify({ ladder: [[512, 0.82]], maxChars: null }), P.PORTRAIT);
  let d = harness({});
  let r = await P.reEncode(URI, P.PORTRAIT);
  check('portrait: one draw at the longest edge 512 (1000×800 → 512×410), quality 0.82, JPEG', d.length === 1 && d[0].w === 512 && d[0].h === 410 && d[0].q === 0.82 && d[0].type === 'image/jpeg', d);
  check('portrait: never refused, the JPEG returned', r.refused === null && /^data:image\/jpeg/.test(r.dataUrl), { refused: r.refused });
  d = harness({ per: 100000 });
  r = await P.reEncode(URI, P.PORTRAIT);
  check('portrait: no cap — a huge JPEG is still kept', r.refused === null && r.dataUrl.length > 1e6);
  harness({ decode: false });
  r = await P.reEncode(URI, P.PORTRAIT);
  check('portrait: a file that will not decode hands back the ORIGINAL (never lost)', r.dataUrl === URI && r.refused === null, r);
  r = await P.reEncode('', P.PORTRAIT);
  check('portrait: nothing given → an empty string, as the shipped reEncodePortrait', r.dataUrl === '' && r.refused === null, r);
  harness({ w: 0, h: 0 });
  r = await P.reEncode(URI, { ladder: [[512, 0.82]] });
  check('portrait: an image with no size hands back the ORIGINAL', r.dataUrl === URI && r.refused === null, r);

  // ── the ship's setting: F-b's ladder and cap, from the store ──
  check('F-b: the ship ladder is [512,.82] → [512,.70] → [384,.70] (SWRPGVessels.IMAGE_LADDER)', JSON.stringify(VS.IMAGE_LADDER) === JSON.stringify([[512, 0.82], [512, 0.7], [384, 0.7]]), VS.IMAGE_LADDER);
  check('F-b: the cap is 96,000 characters (SWRPGVessels.IMAGE_MAX_CHARS)', VS.IMAGE_MAX_CHARS === 96000, VS.IMAGE_MAX_CHARS);
  const SHIP = { ladder: VS.IMAGE_LADDER, maxChars: VS.IMAGE_MAX_CHARS };
  // per chosen so rung 1 (512·.82·per) and rung 2 (512·.70·per) exceed 96,000 and rung 3 (384·.70·per) fits
  d = harness({ per: 300 });
  r = await P.reEncode(URI, SHIP);
  check('ship: the ladder is walked IN ORDER until the JPEG fits (3 draws: 512/.82, 512/.70, 384/.70)',
    d.length === 3 && d[0].w === 512 && d[0].q === 0.82 && d[1].w === 512 && d[1].q === 0.7 && d[2].w === 384 && d[2].q === 0.7, d);
  check('ship: the first rung that fits is kept', r.refused === null && r.dataUrl.length <= 96000 && r.dataUrl.length > 0, { len: r.dataUrl && r.dataUrl.length });
  d = harness({ per: 10 });
  r = await P.reEncode(URI, SHIP);
  check('ship: a picture that fits at the first rung stops there (1 draw)', d.length === 1 && r.refused === null, d.length);
  harness({ per: 100000 });
  r = await P.reEncode(URI, SHIP);
  check('ship: none fits → refused too_large, nothing kept', r.refused === 'too_large' && r.dataUrl === null, r.refused);
  harness({ decode: false });
  r = await P.reEncode(URI, SHIP);
  check('ship: a file that will not decode → refused not_picture', r.refused === 'not_picture' && r.dataUrl === null, r.refused);
  r = await P.reEncode('', SHIP);
  check('ship: nothing given → refused not_picture', r.refused === 'not_picture', r.refused);

  // ── the callers: both hosts reach the ONE helper; nobody keeps a second canvas re-encode ──
  const pa = src('player/app.jsx'), vv = src('lib/shared/vesselView.jsx'), gm = src('gm/app.jsx'), pix = src('player/index.html');
  check('player: reEncodePortrait is the same-name adapter over the helper, with the portrait\'s one rung',
    /function reEncodePortrait\(dataUri, maxEdge, quality\) \{[\s\S]{0,400}?P\.reEncode\(dataUri, \{ ladder: \[\[maxEdge \|\| 512, quality \|\| 0\.82\]\] \}\)/.test(pa));
  check('U1: the ship\'s picture line re-encodes through the helper with the store\'s ladder and cap',
    /P\.reEncode\(uri, \{ ladder: VS\.IMAGE_LADDER, maxChars: VS\.IMAGE_MAX_CHARS \}\)/.test(vv));
  check('no second re-encode: neither app nor the Yard draws a JPEG itself (toDataURL lives only in picture.js)',
    !/toDataURL\(/.test(pa) && !/toDataURL\(/.test(vv) && !/toDataURL\(/.test(gm) && /toDataURL\(/.test(src('lib/shared/picture.js')));
  check('player: the shell loads the helper, deferred', /<script defer src="lib\/shared\/picture\.js"><\/script>/.test(pix));
  // RULING-MOVED (release-r7-bug-burndown ADDENDUM 248, B-1258): the GM's store doors call SWRPGPicture.check, so the GM shell
  // loads the helper at boot, deferred, as the player shell does. KEPT: the Yard core's inject. DROPPED: "never at boot".
  check('gm: the Yard\'s lazy character core injects the helper under K9',
    /_yardCharCore = \[[^\]]*'\/lib\/shared\/picture\.js'[^\]]*\]/.test(gm));
  check('gm: the shell loads the helper, deferred', /<script defer src="\/lib\/shared\/picture\.js"><\/script>/.test(src('gm/index.html')));
  finish();
})().catch(function (e) { check('the drive completes', false, String(e && e.stack || e).slice(0, 300)); finish(); });

function finish() {
  console.log('\n' + pass + '/' + (pass + fail) + ' ' + (fail ? 'FAILED' : 'ALL PASS'));
  process.exit(fail ? 1 : 0);
}
