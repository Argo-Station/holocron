#!/usr/bin/env node
/**
 * sheet_openers_routed.cjs — B-407's guard: THE WALK OVER THE SHEET OPENERS (ruling
 * `landing-front-matter-concept` R-LFM-4; `landing-revision-prep` card 3).
 *
 * Every path that puts a character's sheet on screen goes through `openSheetRecord`, which stamps
 * `swrpg_last_sheet_id` and the record's `lastOpenedAt` — the two facts a return visit reads. This
 * guard fails when a new `navTo('sheet', …)` appears outside the opener: the allowed exceptions are
 * the store's EXIT and Modify's Back, each to the sheet already open (nothing is opened there). Add an opener → route it
 * through `openSheetRecord`, or name the exception here with its reason.
 */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'player', 'app.jsx'), 'utf8').split('\n');

const calls = [];
src.forEach((l, i) => { if (/navTo\('sheet'/.test(l) && !/^\s*\/\//.test(l)) calls.push({ line: i + 1, text: l.trim() }); });

const openerStart = src.findIndex(l => /const openSheetRecord = useCallback\(/.test(l));
let openerEnd = -1;
for (let i = openerStart + 1; i < src.length && openerStart >= 0; i++) { if (/^\s{2}\}, \[navTo\]\);/.test(src[i])) { openerEnd = i; break; } }
const inside = calls.filter(c => openerStart >= 0 && c.line > openerStart + 1 && c.line <= openerEnd + 1);
const outside = calls.filter(c => !inside.includes(c));
const EXCEPTIONS = [
  { test: /storeBackTarget === 'sheet' && selectedChar/, why: 'the store\'s EXIT returns to the sheet already open' },
  { test: /onApply: handleModifyApply, onBack: function\(\) \{ navTo\('sheet', selectedChar\.id\); \}/, why: 'F-100 M13: Modify\'s Back returns to the sheet already open' },
];
const stray = outside.filter(c => !EXCEPTIONS.some(x => x.test.test(c.text)));
const routed = src.filter(l => /\bopenSheetRecord\(/.test(l) && !/const openSheetRecord/.test(l) && !/^\s*\/\//.test(l)).length;

let fail = 0;
const check = (label, ok, detail) => { console.log((ok ? 'PASS  ' : 'FAIL  ') + label + (ok || !detail ? '' : '  — ' + detail)); if (!ok) fail++; };
check('openSheetRecord is defined once, with its own navTo inside', openerStart >= 0 && openerEnd > openerStart && inside.length === 1, `start ${openerStart + 1} end ${openerEnd + 1} inside ${inside.length}`);
check('no sheet opener outside openSheetRecord (except the named store exit)', stray.length === 0, stray.map(c => `${c.line}: ${c.text}`).join(' | '));
// RE-POINTED (N-post, card `paper-roster-delete` JOB 2): the old landing's one-shot AUTO-ROUTE opener was deleted with
// the landing switch (it never ran ON: the switch held it). KEPT: every live opener goes through openSheetRecord.
// DROPPED: only that opener, so the floor is 8, not 9.
check('the openers are routed (restore · roster row · guided · custom · import · pregen ×2 · the yard\'s VESSELS)', routed >= 8, `routed calls ${routed}`);
console.log(`\nsheet openers: ${3 - fail}/3 PASS` + (fail ? `  (${fail} FAILED)` : ''));
process.exit(fail ? 1 : 0);
