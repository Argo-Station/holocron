/* r7_b1656_weapon_attachments — B-1656 (DECISIONS D-427 item 2; ruling `release-r7-bug-burndown` ADDENDA 401, 403; the approved
 * page Docs/mockups/release-r7-candidate2-fixes-look.html @ 8a97d5207): the sheet's weapon card (`stack-weapon`) names its fitted
 * parts on ONE line under its head — "Attachments · <names>", the pack panel's word — in the four drawn states:
 *   none → no line (today's card) · one · several (joined ", " in the saved order) · a dangling id → "(unknown attachment)".
 *
 *   §A  the card draws the line between its head (.sb-e-h) and its stat lines (.sb-e-l), only when the saved weapon holds parts
 *   §B  ONE name rule: `pcAttachmentName` (the pack's, lifted) — the card and the pack panel both call it, through
 *       ItemResolve.pcResolveAttachment; no second lookup
 *   §C  the rule over the registry, the page's four states: names and order exact
 *
 * Red at the cut f9b7fa1eb (no line, no pcAttachmentName). Run: node test/r7_b1656_weapon_attachments.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let failures = 0, passes = 0;
function check(label, cond, detail) {
  if (cond) { passes += 1; console.log('  PASS  ' + label); }
  else { failures += 1; console.error('  FAIL  ' + label + (detail ? '  — ' + detail : '')); }
}

const APP = fs.readFileSync(path.join(ROOT, 'player/app.jsx'), 'utf8');
const card = (() => { const i = APP.indexOf('data-testid="stack-weapon">'); return i < 0 ? '' : APP.slice(i, APP.indexOf('</div>\n    );\n  })', i)); })();
const head = card.indexOf('className="sb-e-h"'), line = card.indexOf('data-testid="stack-weapon-attachments"'), stats = card.indexOf('<div className="sb-e-l">');

console.log('§A the line on the card');
check('the weapon card is found', card.length > 0);
check('it draws stack-weapon-attachments', line > 0);
check('…after the head and before the stat lines', head >= 0 && head < line && line < stats, [head, line, stats].join(' < '));
check('…only when the saved weapon holds parts', /pw && Array\.isArray\(pw\.attachments\) && pw\.attachments\.length \?/.test(card));
check('…lead "Attachments · " in the meta ink, names joined ", "', /<span className="sb-e-m">\{'Attachments · '\}<\/span>/.test(card) && /\.join\(', '\)/.test(card));

console.log('§B one name rule');
const fnSrc = (APP.match(/function pcAttachmentName\(att, attachmentReg\) \{[\s\S]*?\n\}/) || [])[0];
check('pcAttachmentName is defined once', !!fnSrc && APP.split('function pcAttachmentName(').length === 2);
check('the card names through it', /pcAttachmentName\(a, \(sheetItemRegistries\(sheet\) \|\| \{\}\)\.attachments\)/.test(card));
check('the pack panel names through it', /var attName = pcAttachmentName\(att, attachmentReg\);/.test(APP));
check('the pack keeps no inline copy of the rule (its attUnresolved ternary is gone)', !/var attUnresolved = !canonRaw;/.test(APP));

console.log('§C the four drawn states over the registry');
global.window = globalThis.window || {};
window.ItemResolve = require(path.join(ROOT, 'lib/shared/itemResolve.js'));
const pcAttachmentName = fnSrc ? new Function(fnSrc + '; return pcAttachmentName;')() : () => null;
const REG = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical/attachments.json'), 'utf8')).attachments;
const reg = Array.isArray(REG) ? Object.fromEntries(REG.map(a => [a.id, a])) : REG;
const names = atts => atts.map(a => pcAttachmentName(a, reg)).join(', ');
const sight = { id: 'telescopic_optical_sight', mods: [] };
check('one: "Telescopic Optical Sight"', names([sight]) === 'Telescopic Optical Sight', names([sight]));
check('several, saved order: "Bipod Mount, Telescopic Optical Sight"', names([{ id: 'bipod_mount', mods: [] }, sight]) === 'Bipod Mount, Telescopic Optical Sight');
check('dangling: "Telescopic Optical Sight, (unknown attachment)"', names([sight, { id: 'retired_scope_r7c2', mods: [] }]) === 'Telescopic Optical Sight, (unknown attachment)');
check('none: no parts, no names', names([]) === '');

console.log('\n' + passes + ' passed, ' + failures + ' failed');
process.exit(failures ? 1 : 0);
