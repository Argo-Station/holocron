/* test/table_join_qr.cjs — THE OPEN TABLE SHEET'S QR (ruling `encounters-e6-frames` ADDENDUM 2 G3).
 *
 * The QR comes from a VENDORED, MIT-licensed encoder at public/vendor/qrcode-generator/ (no CDN at runtime), with its
 * licence file beside it and its exact version pinned; it encodes the join URL https://holocron.work/player/join#<CODE>.
 *   1. the vendored file is the pinned bytes (the sha256 the LICENSE file records) and the licence says MIT;
 *   2. the GM page loads it from /public/vendor/, before campaignsView.js (since B-1874 through the door's loader, not a tag);
 *      no page loads a QR library from a CDN;
 *   3. the encoder, run in a vm as the page runs it, makes a scalable SVG for the join URL;
 *   4. under the live setting, tableSession's joinUrl(code) is the R-E6F-1 path + the code;
 *   5. campaignsView's QR encodes joinUrl(showCode(code)). (Ruling `argo-a4-wifi-client` G2 re-pointed 4 and 5 from the
 *      JOIN_URL literal: the QR's address is the session's joinUrl, which is '@origin'-aware, A4-C2.)
 * Run: node test/table_join_qr.cjs
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function check(name, ok, info) { if (ok) { pass++; console.log('  PASS  ' + name); } else { fail++; console.log('  FAIL  ' + name + (info ? '  ->  ' + info : '')); } }

const dir = path.join(ROOT, 'public/vendor/qrcode-generator');
const src = fs.readFileSync(path.join(dir, 'qrcode.js'), 'utf8');
const lic = fs.readFileSync(path.join(dir, 'LICENSE'), 'utf8');
const sha = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, 'qrcode.js'))).digest('hex');
console.log('[the vendored encoder]');
check('qrcode.js is the pinned 1.4.4 bytes (sha256 recorded in LICENSE)', lic.indexOf(sha) !== -1 && /qrcode-generator 1\.4\.4/.test(lic), sha);
check('the licence beside it is MIT, Kazuhiko Arase', /MIT License/.test(lic) && /Copyright \(c\) 2009 Kazuhiko Arase/.test(lic));

console.log('[the GM page loads it locally]');
const gm = fs.readFileSync(path.join(ROOT, 'gm/index.html'), 'utf8');
// B-1874 (release-r7-bug-burndown ADDENDUM 721) re-pointed this check: the shell no longer tags qrcode.js; the GM's mount runs it
// through SWRPGCampaignsDoor.load({ qr: true }), from /public/vendor/, before campaignsView.js (the order is test/b1874_dark_scripts.cjs L)
const door = fs.readFileSync(path.join(ROOT, 'lib/shared/campaignsDoor.js'), 'utf8');
check('the door loads /public/vendor/qrcode-generator/qrcode.js for the GM ({ qr: true }), before campaignsView.js',
  /var QR = '\/public\/vendor\/qrcode-generator\/qrcode\.js';/.test(door) && /FILES\.slice\(0, 2\)\.concat\(opts && opts\.qr \? \[QR\] : \[\], FILES\.slice\(2\)\)/.test(door)
  && /'\/lib\/shared\/campaignsView\.js'\]/.test(door) && /D\.load\(\{ qr: true \}\)/.test(fs.readFileSync(path.join(ROOT, 'gm/app.jsx'), 'utf8')));
const pages = ['gm/index.html', 'player/index.html'].map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
check('no page loads a QR library from a CDN', !/<script[^>]+src="https?:\/\/[^"]*qr/i.test(pages));

console.log('[the encoder makes the join URL\'s QR]');
const box = {}; vm.runInNewContext(src + '\n;this.qrcode = qrcode;', box);
const url = 'https://holocron.work/player/join#7KQ-M4R';
const q = box.qrcode(0, 'M'); q.addData(url); q.make();
const svg = q.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
check('an SVG with a viewBox and no fixed width (scalable)', /^<svg[^>]*viewBox="0 0 \d+ \d+"/.test(svg) && !/<svg[^>]*\swidth="\d+px"/.test(svg), svg.slice(0, 120));
check('a version-3 symbol or larger (29+ modules) for the 39-character URL', q.getModuleCount() >= 29, q.getModuleCount());

console.log('[campaignsView encodes the R-E6F-1 join URL]');
const view = fs.readFileSync(path.join(ROOT, 'lib/shared/campaignsView.jsx'), 'utf8');
const TS = require(path.join(ROOT, 'lib/shared/tableSession.js'));   // the live lib/shared/siteSettings.js, read at call time
check("under the live setting, joinUrl(code) is 'https://holocron.work/player/join#' + code", TS.joinUrl('7KQ-M4R') === 'https://holocron.work/player/join#7KQ-M4R', TS.joinUrl('7KQ-M4R'));
// re-pointed at argo-a4-program-serve (A4-C7.3): joinUrl may answer '' or null in the program, so the QR is drawn from it
// only when it is a link; it still encodes joinUrl(showCode(code))
check("the sheet's QR is qrSvg(T.joinUrl(showCode(code)))", /ju = T\.joinUrl\(showCode\(s\.code\)\), qr = ju && qrSvg\(ju\)/.test(view) && /window\.qrcode/.test(view));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
