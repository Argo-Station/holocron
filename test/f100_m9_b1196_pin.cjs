#!/usr/bin/env node
/**
 * f100_m9_b1196_pin.cjs — B-1196 as ruled (c) by `f100-m9-build-card` ADDENDUM 4 (R-M9B-12): an UNANCHORED pool_mods row
 * with a direction ("on any check", e.g. Beast Wrangler's boost) classifies NARRATIVE ('prints'), because the engine only
 * shows it — `poolMods.matches` matches nothing on a null anchor, and the dice hub's footer reminder (`DiceHubReminder`,
 * "DISPLAYED, never applied") is the one place it appears. The chip tells the truth; whether such rows become hub offers is
 * the surfacing mission's question (R-M9E-7), not this guard's.
 *
 *   1  the census: every unanchored row with a direction in the shipped registries (top-level pool_mods and species
 *      abilities' pool_mods) classifies 'prints'; the count is printed, not pinned (the engine lap may add rows).
 *      RE-POINTED (ruling `f100-surfacing-hub-concept` ADDENDUM 7, "the ruled-moved reds"): B-1196's write anchors every
 *      such row (`test/f100_b1196_anchor.cjs` pins 0), so R-M9B-12's LAW is held on SYNTHETIC unanchored rows — each
 *      shipped directed row that carries an `all` anchor, copied with its anchor removed, classifies 'prints'. Keeps: the
 *      law and its bites; drops: the premise that live data holds such a row (`rows.length > 0`).
 *   2  the named row: talents.beast_wrangler `add_boost` — RE-POINTED: shipped, it is anchored `all` and 'reminds' (an
 *      offer); its synthetic unanchored copy → 'prints'
 *   3  the reason: poolMods.matches answers false for a null anchor, for a skill and for a roll-only context
 *   4  the contrast: the same row anchored to `all` with its condition → 'reminds' (SITUATIONAL, offered), and anchored
 *      with no condition → 'resolves' — so 1–2 pin the ANCHOR's absence, not the row's other fields
 * BITES (each must turn a case red, by the assertions' result): classOfPoolMod resolving on a direction alone (the anchor
 * test dropped); an unanchored row with a direction read as 'reminds' (B-1196's withdrawn reclassification).
 *
 * Run: node test/f100_m9_b1196_pin.cjs   (exit 1 on any FAIL)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'lib/shared/effectClass.js'), 'utf8');
const PoolMods = require(path.join(ROOT, 'lib/shared/poolMods.js'));
const reg = (s) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', s + '.json'), 'utf8'))[s]; } catch (e) { return null; } };
const set = (v) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length);

function load(src) {
  const m = { exports: {} };
  new Function('module', 'exports', 'window', 'globalThis', src)(m, m.exports, undefined, {});
  return m.exports;
}

function census() {
  const out = [];
  for (const s of ['talents', 'weapons', 'armor', 'gear', 'species', 'force_powers']) {
    const R = reg(s); if (!R) continue;
    for (const [id, r] of Object.entries(R)) {
      const walk = (rows, where) => (Array.isArray(rows) ? rows : []).forEach((p, i) => {
        if (p && !set(p.applies_to) && set(p.direction)) out.push({ s, id, where, i, row: p });
      });
      walk(r.pool_mods, 'pool_mods');
      (Array.isArray(r.special_abilities) ? r.special_abilities : []).forEach((a, k) => walk(a && a.pool_mods, 'special_abilities.' + k + '.pool_mods'));
    }
  }
  return out;
}

function allAnchored() {
  const out = [];
  for (const s of ['talents', 'weapons', 'armor', 'gear', 'species', 'force_powers']) {
    const R = reg(s); if (!R) continue;
    for (const [id, r] of Object.entries(R)) {
      const walk = (rows, where) => (Array.isArray(rows) ? rows : []).forEach((p, i) => {
        if (p && set(p.direction) && Array.isArray(p.applies_to) && p.applies_to.length === 1 && p.applies_to[0] && p.applies_to[0].scope === 'all')
          out.push({ s, id, where, i, row: p });
      });
      walk(r.pool_mods, 'pool_mods');
      (Array.isArray(r.special_abilities) ? r.special_abilities : []).forEach((a, k) => walk(a && a.pool_mods, 'special_abilities.' + k + '.pool_mods'));
    }
  }
  return out;
}

function cases(EC) {
  const out = [];
  const check = (cond, label, detail) => out.push([!!cond, label, detail]);
  const rows = census();
  const bad = rows.filter((r) => EC.classOfPoolMod(r.row) !== 'prints');
  const by = {}; rows.forEach((r) => { by[r.s] = (by[r.s] || 0) + 1; });
  // the SYNTHETIC set: every shipped directed row anchored `all`, its anchor removed (B-1196's 60 and any like them)
  const syn = allAnchored().map((r) => Object.assign({}, r, { row: Object.assign({}, r.row, { applies_to: null }) }));
  const badSyn = syn.filter((r) => EC.classOfPoolMod(r.row) !== 'prints');
  check(syn.length > 0 && bad.length === 0 && badSyn.length === 0, 'case 1: every unanchored row with a direction classifies NARRATIVE — ' + rows.length + ' shipped ' + JSON.stringify(by) +
    ' + ' + syn.length + ' synthetic (the `all` rows unanchored)', bad.concat(badSyn).slice(0, 3).map((r) => [r.s, r.id, r.where, r.i, EC.classOfPoolMod(r.row)]));
  const bw = ((reg('talents') || {}).beast_wrangler || {}).pool_mods || [];
  const live = bw.filter((p) => p && p.id === 'add_boost')[0];
  const row = live ? Object.assign({}, live, { applies_to: null }) : null;
  check(live && JSON.stringify(live.applies_to) === '[{"scope":"all"}]' && EC.classOfPoolMod(live) === 'reminds' && row.direction === 'add' && EC.classOfPoolMod(row) === 'prints',
    'case 2: talents.beast_wrangler add_boost shipped anchored `all` → reminds; its synthetic unanchored copy → prints', live && [EC.classOfPoolMod(live), EC.classOfPoolMod(row)]);
  const none = { appliesTo: null };
  check(!PoolMods.matches(none, { skillId: 'perception' }) && !PoolMods.matches(none, { skillId: 'survival', rollOnly: true }) && !PoolMods.matches({ appliesTo: [] }, { skillId: 'perception' }),
    'case 3: poolMods.matches — a null or empty anchor matches no check (the engine never offers or applies it)');
  if (row) {
    const anch = Object.assign({}, row, { applies_to: [{ scope: 'all' }] });
    const bare = Object.assign({}, anch); delete bare.condition;
    check(EC.classOfPoolMod(anch) === 'reminds' && EC.classOfPoolMod(bare) === 'resolves',
      'case 4: the same row anchored to all → reminds with its condition, resolves without (the anchor decides 1–2)', [EC.classOfPoolMod(anch), EC.classOfPoolMod(bare)]);
  }
  return out;
}

(function main() {
  console.log('f100_m9_b1196_pin — B-1196 (c): an unanchored "every check" row reads NARRATIVE (f100-m9-build-card R-M9B-12)');
  const rows = cases(require(path.join(ROOT, 'lib/shared/effectClass.js')));
  let fails = 0;
  rows.forEach(([ok, l, d]) => { if (!ok) fails++; console.log((ok ? '  PASS  ' : '  FAIL  ') + l + (!ok && d !== undefined ? '   -> ' + JSON.stringify(d).slice(0, 300) : '')); });
  console.log('BITES (each must turn at least one case red):');
  const LINE = "if (anchored && set(entry.direction)) return 'resolves';";
  if (SRC.indexOf(LINE) === -1) { fails++; console.log('  FAIL  the anchor line is not where the bites expect it'); }
  const bites = [
    ['the anchor test dropped (a direction alone resolves)', SRC.replace(LINE, "if (set(entry.direction)) return 'resolves';")],
    ['an unanchored row with a direction read as reminds', SRC.replace(LINE, LINE + " if (!anchored && set(entry.direction)) return 'reminds';")],
  ];
  for (const [name, mut] of bites) {
    let red;
    try { red = cases(load(mut)).some((r) => !r[0]); } catch (e) { red = true; }
    if (!red) fails++;
    console.log((red ? '  PASS  ' : '  FAIL  ') + 'bite: ' + name + ' → red');
  }
  console.log('\nHARVEST ' + rows.length + ' cases · ' + bites.length + ' bites');
  console.log('f100_m9_b1196_pin: ' + (fails ? 'FAIL (' + fails + ')' : 'PASS'));
  process.exit(fails ? 1 : 0);
})();
