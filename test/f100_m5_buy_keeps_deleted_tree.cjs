#!/usr/bin/env node
/**
 * f100_m5_buy_keeps_deleted_tree.cjs — ruling `f100-m5-talents-buy-after-deleted-tree` R-M5B-1..4.
 *
 * C5.2 turns buying back on for a character owning a DELETED own specialization, so every writer of `talents` from
 * positions must keep what a tree absent from its view held: per talent id, the projection of the present trees AFTER
 * the write plus max(0, persisted − projection of the present trees BEFORE it). ONE function does it
 * (CharResolve.talentsKeepingAbsentTrees, R-M5B-2), and `buyTalent` calls it.
 *
 * THE WRITER UNDER TEST is what `buyTalent` computes: the shared function when it exists, otherwise today's bare
 * `talentsFromOwnedPositions` — so this guard ran RED on the lap's code before the function landed (R-M5B-4), and it
 * reads the call in player/app.jsx so an un-wired buy goes red too.
 *   1 the brief's fixture: own Advisor copy, grit at 0-2; copy deleted; buy Bodyguard 0-0 → [grit, toughened]
 *   2 a RANKED talent in two trees, one deleted: the deleted tree's share is kept, the present tree's share still moves
 *   3 no absent tree: the result is exactly today's projection (byte for byte over every specialization's full tree)
 *   4 the wiring: buyTalent's write goes through the shared function
 *
 * Run: node test/f100_m5_buy_keeps_deleted_tree.cjs   (exit 1 on any FAIL)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const CR = require(path.join(ROOT, 'lib/shared/charResolve.js'));

let fails = 0, passes = 0;
function check(cond, label, detail) {
  if (cond) passes += 1; else fails += 1;
  console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (!cond && detail !== undefined ? '   -> ' + JSON.stringify(detail).slice(0, 400) : ''));
}
const reg = (s) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', s + '.json'), 'utf8'))[s];
const SPECS = reg('specializations');
const clone = (v) => JSON.parse(JSON.stringify(v));
const SHARED = typeof CR.talentsKeepingAbsentTrees === 'function';
// what buyTalent writes: (persisted talents, owned specs before the buy, after it, the view's specializations)
function buyWrites(persisted, before, after, specReg) {
  return SHARED ? CR.talentsKeepingAbsentTrees(persisted, before, after, specReg) : CR.talentsFromOwnedPositions(after, specReg);
}
const asMap = (list) => { const o = {}; (list || []).forEach((t) => { o[t.id] = t.rank; }); return o; };

console.log('f100_m5_buy_keeps_deleted_tree — R-M5B-1..4 (the writer: ' + (SHARED ? 'CharResolve.talentsKeepingAbsentTrees' : 'bare talentsFromOwnedPositions — TODAY') + ')');

// ── 1 · the brief's fixture ──
{
  const own = clone(SPECS.advisor); own.id = 'custom_my_data_night_counsel';
  const withOwn = Object.assign({}, SPECS, { [own.id]: own });
  const before = [{ id: own.id, owned: ['0-2'] }, { id: 'bodyguard', owned: [] }];
  const persisted = CR.talentsFromOwnedPositions(before, withOwn);                 // [grit] as bought
  const after = [{ id: own.id, owned: ['0-2'] }, { id: 'bodyguard', owned: ['0-0'] }];
  const wrote = buyWrites(persisted, before, after, SPECS);                        // the copy is deleted: SPECS lacks it
  const m = asMap(wrote);
  check(m.grit === 1 && m.toughened === 1 && wrote.length === 2, 'case 1: own tree deleted, Bodyguard 0-0 bought → [grit, toughened] (grit KEPT)', wrote);
}

// ── 2 · a ranked talent through two trees, one deleted ──
{
  // grit sits in advisor 0-2; an own copy of advisor and the book's advisor both own 0-2 → grit rank 2
  const own = clone(SPECS.advisor); own.id = 'custom_my_data_night_counsel';
  const withOwn = Object.assign({}, SPECS, { [own.id]: own });
  const before = [{ id: own.id, owned: ['0-2'] }, { id: 'advisor', owned: ['0-2'] }];
  const persisted = CR.talentsFromOwnedPositions(before, withOwn);                 // grit ×2
  const gritAt = [];
  SPECS.advisor.talent_tree.forEach((row, r) => row.talents.forEach((c, ci) => { if (c.talent === 'grit' && !(r === 0 && ci === 2)) gritAt.push(r + '-' + ci); }));
  const after = [{ id: own.id, owned: ['0-2'] }, { id: 'advisor', owned: ['0-2'].concat(gritAt.slice(0, 1)) }];
  const wrote = buyWrites(persisted, before, after, SPECS);
  check(asMap(persisted).grit === 2, 'case 2: fixture — grit owned through two trees (rank 2)', persisted);
  check(gritAt.length >= 1 && asMap(wrote).grit === 3, 'case 2: the deleted tree keeps its ONE rank and the present tree\'s new rank adds (grit 2 → 3, not 2)', { gritAt, wrote });
}

// ── 3 · no absent tree: exactly today's projection ──
{
  let rows = 0, diffs = [];
  Object.keys(SPECS).forEach((sid) => {
    const pos = []; SPECS[sid].talent_tree.forEach((row, r) => row.talents.forEach((c, ci) => { if (c && c.talent) pos.push(r + '-' + ci); }));
    const before = [{ id: sid, owned: pos.slice(0, 5) }], after = [{ id: sid, owned: pos }];
    const persisted = CR.talentsFromOwnedPositions(before, SPECS);
    const a = JSON.stringify(buyWrites(persisted, before, after, SPECS)), b = JSON.stringify(CR.talentsFromOwnedPositions(after, SPECS));
    rows += 1; if (a !== b) diffs.push(sid);
  });
  check(diffs.length === 0, 'case 3: with every tree present the write equals today\'s projection byte for byte (' + rows + ' specializations)', diffs.slice(0, 5));
}

// ── 4 · the wiring: buyTalent's write goes through the shared function ──
{
  const src = fs.readFileSync(path.join(ROOT, 'player/app.jsx'), 'utf8');
  const i = src.indexOf('  function buyTalent(');
  const body = i < 0 ? '' : src.slice(i, src.indexOf('\n  }\n', i));
  check(/talents:\s*CharResolve\.talentsKeepingAbsentTrees\(/.test(body), 'case 4: buyTalent writes `talents` through CharResolve.talentsKeepingAbsentTrees (R-M5B-2)');
}

console.log('\nf100_m5_buy_keeps_deleted_tree: ' + passes + ' PASS, ' + fails + ' FAIL · HARVEST ' + (passes + fails));
if (fails || !passes) process.exit(1);
