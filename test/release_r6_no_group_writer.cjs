#!/usr/bin/env node
/**
 * release_r6_no_group_writer.cjs — card `release-r6-ui` §2.7 (D-385, D-387, D-388): no frame of R6's face calls a group writer.
 * The guard pins it by grep over the face's source.
 *
 * THE WRITERS are read from the group store's own export (lib/shared/partyStore.js `api`): every exported function except
 * the reads it names, so a writer added to the store is covered without editing this file.
 *   READS (never a write): load, isStale, fromRaw, the normalizers, parseWho, partyOf, mentorKind, normalizeResource,
 *   resourceEffects, normalizeBase, engineReader, registerEngineReader (a read hook the engine registers at load),
 *   sheetDutyRows, dutyParts, dutyTotal, rankProgress, blockers, canUndo.
 * THE FACE is player/app.jsx (R6's one face file; the gate's diff `52d7218ec..` touches no gm/ or dice/ file). Every
 * `SWRPGParty.<name>` / `PartyStore.<name>` there that names a writer is a red; so is the group's storage key written raw.
 *
 *   G1  the writer set is real: at least 15 exported writers read off the store (a vacuous set would pass anything)
 *   G2  player/app.jsx names no group writer
 *   G3  player/app.jsx never writes `swrpg_party_v1` directly (setItem / removeItem on the key)
 *
 * BITE (PRAXIS §6, read by EXIT CODE): R6NG_APP points the guard at a mutant COPY of player/app.jsx (one planted
 * `window.SWRPGParty.addCharMember(...)`), so a bite never writes the tree. It must exit 1 with G2 red.
 *
 * Run: node test/release_r6_no_group_writer.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const P = require(path.join(ROOT, 'lib/shared/partyStore.js'));
const APP = fs.readFileSync(process.env.R6NG_APP || path.join(ROOT, 'player/app.jsx'), 'utf8');
const READS = new Set(['load', 'isStale', 'fromRaw', 'normalizeParty', 'normalizeMember', 'normalizeRow', 'parseWho', 'partyOf',
  'mentorKind', 'normalizeResource', 'resourceEffects', 'normalizeBase', 'engineReader', 'registerEngineReader', 'sheetDutyRows',
  'dutyParts', 'obligationParts', 'dutyTotal', 'rankProgress', 'blockers', 'canUndo']);   // obligationParts: T4 lap A (a reader)
let failures = 0;
function check(label, ok, detail) {
  console.log((ok ? 'PASS  ' : 'FAIL  ') + label + (ok ? '' : '  — ' + JSON.stringify(detail)));
  if (!ok) failures++;
}

const WRITERS = Object.keys(P).filter((k) => typeof P[k] === 'function' && !READS.has(k)).sort();
check('G1 the writer set is read off the store: ' + WRITERS.length + ' (' + WRITERS.join(', ') + ')', WRITERS.length >= 15, WRITERS);

const hits = [];
APP.split('\n').forEach((line, i) => {
  const re = /\b(?:SWRPGParty|PartyStore)\s*\.\s*([A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = re.exec(line))) if (WRITERS.includes(m[1])) hits.push((i + 1) + ': ' + m[1]);
});
check('G2 player/app.jsx names no group writer', hits.length === 0, hits.slice(0, 6));

const raw = [];
APP.split('\n').forEach((line, i) => {
  if (/(setItem|removeItem)\s*\(\s*['"]swrpg_party_v1['"]/.test(line)) raw.push(i + 1);
});
check('G3 player/app.jsx never writes swrpg_party_v1 directly', raw.length === 0, raw);

console.log(failures ? '\n' + failures + ' FAILED' : '\nall passed');
process.exit(failures ? 1 : 0);
