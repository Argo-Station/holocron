#!/usr/bin/env node
/* r7_b1422_pack_add_kind.cjs — B-1422: THE PACK'S "ADD ATTACHMENT" LIST OFFERS AN ITEM ONLY ITS OWN KIND OF ATTACHMENT
 *
 * `LoadoutItemDetail`'s `availableAttachments` (player/app.jsx) skipped a record only when `a.category` named another
 * kind, and 0 of the registry's records carry `category` (the data spells it `type`: weapon / armor / gear), so a rifle
 * was offered armour parts and armour was offered weapon parts. DECISIONS D-395 (a), ruling `release-r7-bug-burndown`
 * ADDENDUM 7: filter on `type`, the code's stated intent. The add stays free of payment and fit checks (D-279).
 *
 * The memo's body is sliced from the source by name and run against the shipped registry (the sheet is not loadable
 * in node), so this measures the code that ships, not a copy.
 *   K1  a weapon is offered only weapon-type attachments, and every one of them;
 *   K2  armour is offered only armour-type attachments, and every one of them;
 *   K3  every shipped attachment carries a `type` the filter reads (no record silently passes every kind).
 *
 * Exit 1 on any failure (R-R7-3: shown red at the cut by exit code).
 */
'use strict';
const fs = require('fs'), path = require('path');

const ROOT = path.resolve(__dirname, '..');
const J = JSON.stringify;
let fail = 0;
function check(ok, msg, err) {
  console.log((ok ? '  PASS  ' : '  FAIL  ') + msg + (err ? '  [' + err + ']' : ''));
  if (!ok) fail++;
}

const REG = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'data', 'canonical', 'attachments.json'), 'utf8')).attachments;
const src = fs.readFileSync(path.join(ROOT, 'player', 'app.jsx'), 'utf8');
const m = src.match(/var availableAttachments = React\.useMemo\(function\(\) \{([\s\S]*?)\n  \}, \[kind\]\);/);
check(!!m, 'the memo is found by name in player/app.jsx');
const offered = (kind) => new Function('attachmentReg', 'kind', m[1])(REG, kind).map((x) => REG[x.id].type);
const count = (t) => Object.values(REG).filter((a) => a && a.name && a.type === t).length;

if (m) {
  let w = null, a = null, err = null;
  try { w = offered('weapon'); a = offered('armor'); } catch (e) { err = String(e.message || e).split('\n')[0]; }
  const tally = (xs) => xs && xs.reduce((o, t) => (o[t] = (o[t] || 0) + 1, o), {});
  check(!err && w.every((t) => t === 'weapon') && w.length === count('weapon'),
    `K1 a weapon is offered the ${count('weapon')} weapon attachments only: ${J(tally(w))}`, err);
  check(!err && a.every((t) => t === 'armor') && a.length === count('armor'),
    `K2 armour is offered the ${count('armor')} armour attachments only: ${J(tally(a))}`, err);
}
const untyped = Object.keys(REG).filter((k) => !['weapon', 'armor', 'gear'].includes(REG[k] && REG[k].type));
check(untyped.length === 0, `K3 every shipped attachment carries a type: untyped ${J(untyped)}`);

console.log(fail ? `\nr7_b1422_pack_add_kind: ${fail} FAIL` : '\nr7_b1422_pack_add_kind: all PASS');
process.exit(fail ? 1 : 0);
