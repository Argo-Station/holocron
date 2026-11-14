#!/usr/bin/env node
/**
 * sync_merge_base.cjs — B-1650's three-argument merge, one case per row of the ruled table (brief
 * `release-r7-sync-base-step0` §D, ADDENDUM 1 §B.5; rulings `release-r7-bug-burndown` ADDENDUM 389 and 390).
 * Pure: `mergeAdoption(local, remote, base)` over hand-built records with real ms stamps (a toy stamp is refused by
 * recency.js and turns every case into a question, §0).
 *
 *   R1–R10  the record table (B = base, L = local, R = remote)
 *   F1–F5   the unit table, inside R9
 *   S       stamps never make a question; the later comparable stamp is kept
 *   A       an absent slot is a value (added / removed on one side)
 *   ARR     an array is one value: a different gear item added on each side → one question, each candidate whole
 *   C1–C5   coupled units (389 C-1, 390): skill vs talent; gear vs weapon; wounds vs talent; craft material vs companion;
 *           Core X off vs Core Y off
 *   W       WHOLE values: map pins per planet, vehicle overrides per key, the draft whole
 *   N       no base: `mergeAdoption(l, r)` and `mergeAdoption(l, r, undefined)` give the same result on every case here
 *
 * BITES: `--bites` runs the mutants below against a copy of lib/shared/ (never this tree's).
 * Exit 0 all pass · 1 any fail / crash / zero harvest.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const LIB = process.env.SYNC_MERGE_BASE_LIB || path.join(ROOT, 'lib/shared');

const MUTANTS = [
  { name: 'the base ignored (today\'s rule)', from: 'var b3 = baseOf(key, id);', to: 'var b3 = undefined;' },
  { name: 'units split to slots (no groups)', from: "var id = unitOf[s] || ('slot:' + s);", to: "var id = 'slot:' + s;" },
  { name: 'a two-sided unit picks local silently', from: '      else from = null;\n', to: '      else from = \'local\';\n' },
  { name: 'one-sided remote not taken', from: "      else if (l === b) from = 'remote';\n", to: '' },
  { name: 'stamps compared as fields', from: "      if ((u.stamps || []).indexOf(k) !== -1) return;\n", to: '' },
  { name: 'the remote candidate keeps local', from: '        else if (from === null) slotSet(uu, rc, s, rv);\n', to: '' },
  { name: 'WHOLE values ignore the base', from: "      var bw = baseOf(key, '');", to: 'var bw = undefined;' },
  { name: 'active_sources merged per book', from: '    swrpg_active_sources: { whole: true },', to: '    swrpg_active_sources: { nest: \'override\' },' },
];

if (process.argv.includes('--bites')) {
  const src = path.join(ROOT, 'lib/shared');
  const tmp = fs.mkdtempSync(path.join(process.env.CLAUDE_JOB_DIR ? path.join(process.env.CLAUDE_JOB_DIR, 'tmp') : os.tmpdir(), 'sync-merge-base-bites-'));
  const copy = (name, text) => {
    const dir = path.join(tmp, name);
    fs.mkdirSync(dir);
    fs.readdirSync(src).filter((f) => f.endsWith('.js')).forEach((f) => fs.copyFileSync(path.join(src, f), path.join(dir, f)));
    if (text != null) fs.writeFileSync(path.join(dir, 'syncMerge.js'), text);
    return dir;
  };
  const run = (dir) => {
    try { return { code: 0, out: execFileSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { SYNC_MERGE_BASE_LIB: dir }), stdio: 'pipe' }).toString() }; }
    catch (e) { return { code: e.status == null ? -1 : e.status, out: String(e.stdout || '') + String(e.stderr || '') }; }
  };
  const crashed = (out) => /without a crash/.test(out);
  const rows = (out) => Array.from(new Set((out.match(/^ {2}✗ (\S+)/gm) || []).map((l) => l.trim().slice(2))));
  let bad = 0;
  const noop = run(copy('noop'));
  const noopOk = noop.code === 0 && !crashed(noop.out);
  console.log((noopOk ? '  PASS  ' : '  FAIL  ') + 'NO-OP copy exits 0 — got ' + noop.code);
  if (!noopOk) bad += 1;
  const text = fs.readFileSync(path.join(src, 'syncMerge.js'), 'utf8');
  MUTANTS.forEach((m, i) => {
    const hits = text.split(m.from).length - 1;
    if (hits !== 1) { bad += 1; console.log('  FAIL  "' + m.name + '": anchor matched ' + hits + ' times'); return; }
    const r = run(copy('m' + i, text.replace(m.from, m.to)));
    const bit = noopOk && r.code === 1 && rows(r.out).length > 0 && !crashed(r.out);
    if (!bit) bad += 1;
    console.log((bit ? '  PASS  ' : '  FAIL  ') + 'BIT "' + m.name + '" — exit ' + r.code + (crashed(r.out) ? ' CRASHED' : '') + ', rows: ' + rows(r.out).join(' '));
  });
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('\n' + (MUTANTS.length + 1 - bad) + '/' + (MUTANTS.length + 1) + ' bite rows');
  process.exit(bad ? 1 : 0);
}

const M = require(path.join(LIB, 'syncMerge.js'));
let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass += 1; console.log('  ✓ ' + label); }
  else { fail += 1; console.log('  ✗ ' + label + (detail === undefined ? '' : '  -> ' + JSON.stringify(detail).slice(0, 400))); }
}

const RK = 'swrpg_saved_characters';
const T0 = 1786036920326;
const clone = (v) => JSON.parse(JSON.stringify(v));
// a character as the app stores it: the record, its sheet, a purse and an XP ledger that agree
function char(id, at, sheet) {
  return { id, name: 'Kira', species: 'human', career: 'smuggler', updatedAt: at, savedAt: T0 - 5000,
    sheetData: Object.assign({
      name: 'Kira', currentWounds: 4, currentStrain: 0, notes: '',
      xp: { total: 225, spent: 150, remaining: 75 }, skills: { COORD: 1 }, talents: [{ id: 'grit', rank: 1 }],
      specializations: [{ id: 'pilot', owned: ['r1c1'] }], characteristics: { brawn: 2, agility: 3 },
      equipment: { credits: 500, weapons: [{ id: 'blaster_pistol' }], gear: [{ id: 'datapad', qty: 1 }], armor: null },
      crafts: [], companions: [{ id: 'r2', name: 'R2' }],
    }, sheet || {}) };
}
const edit = (c, at, sheet, top) => Object.assign(clone(c), top || {}, { updatedAt: at, sheetData: Object.assign(clone(c.sheetData), sheet || {}) });
const env = (...cs) => ({ version: 1, characters: cs });
function run(L, R, B) {
  const l = {}, r = {}, b = {};
  if (L) l[RK] = env(L); if (R) r[RK] = env(R); if (B) b[RK] = { [B.id]: B };
  return M.mergeAdoption(l, r, B ? b : undefined);
}
const one = (res) => (res.merged[RK] ? res.merged[RK].characters : []);
const NOBASE = [];          // every case's (l, r) pair, for N

(() => {
  console.log('sync_merge_base — the three-argument merge, row by row (§D, §B.5; ADDENDUM 389/390)');
  try {
    const B = char('k', T0);
    // ── the record table ──
    let res = run(char('k', T0), null, null);
    check('R1 added here (no base, no remote) → local', one(res).length === 1 && res.conflicts.length === 0);
    res = run(null, char('k', T0), null);
    check('R2 added there → remote', one(res).length === 1 && res.conflicts.length === 0);
    { const l = {}, r = {}; l[RK] = env(char('k', T0)); r[RK] = env(); const out = M.mergeAdoption(l, r, { [RK]: { k: B } });
      check('R3 in the base, here, not on the account (no tombstone) → kept (union)', out.merged[RK].characters.length === 1 && out.conflicts.length === 0); }
    { const l = {}, r = {}; l[RK] = env(); r[RK] = env(char('k', T0)); const out = M.mergeAdoption(l, r, { [RK]: { k: B } });
      check('R4 in the base, on the account, not here (no tombstone) → kept (union)', out.merged[RK].characters.length === 1 && out.conflicts.length === 0); }
    res = run(clone(B), clone(B), B);
    check('R5 equal → local, no question', res.conflicts.length === 0 && JSON.stringify(one(res)[0]) === JSON.stringify(B));
    { const L = edit(B, T0 + 2000, { currentStrain: 3 }), R = edit(B, T0 + 1000, { currentWounds: 5 });
      const nb = run(L, R, null);
      check('R6 no base → today\'s rule: the newer whole record (the loss B-1650 names, kept for a first sign-in)',
        nb.conflicts.length === 0 && one(nb)[0].sheetData.currentWounds === 4 && one(nb)[0].sheetData.currentStrain === 3, one(nb)[0].sheetData);
      NOBASE.push([L, R]); }
    { const R = edit(B, T0 + 1000, { currentWounds: 5 }); res = run(clone(B), R, B);
      check('R7 L = B, R moved → R, silently', res.conflicts.length === 0 && one(res)[0].sheetData.currentWounds === 5); NOBASE.push([clone(B), R]); }
    { const L = edit(B, T0 + 1000, { currentStrain: 3 }); res = run(L, clone(B), B);
      check('R8 R = B, L moved → L, silently', res.conflicts.length === 0 && one(res)[0].sheetData.currentStrain === 3); NOBASE.push([L, clone(B)]); }
    { const L = edit(B, T0 + 2000, { currentStrain: 3 }), R = edit(B, T0 + 1000, { currentWounds: 5 }); res = run(L, R, B);
      const c = one(res)[0];
      check('R9 / D-421: both moved, different units → both kept, no question (wounds 5, strain 3)',
        res.conflicts.length === 0 && c.sheetData.currentWounds === 5 && c.sheetData.currentStrain === 3, c.sheetData); }
    { const l = {}, r = {}; l[RK] = env(edit(B, T0 + 1, { notes: 'x' })); r[RK] = env(edit(B, T0 + 2, { notes: 'y' }));
      l.swrpg_deleted_ids = ['k']; const out = M.mergeAdoption(l, r, { [RK]: { k: B } });
      check('R10 tombstoned → removed after the union, whatever the units say', out.merged[RK].characters.length === 0); }

    // ── the unit table (inside R9) ──
    { const L = edit(B, T0 + 2000, { notes: 'same' }, {}), R = edit(B, T0 + 1000, { notes: 'same', currentWounds: 6 }); res = run(L, R, B);
      check('F1 a unit equal on both sides → that value', res.conflicts.length === 0 && one(res)[0].sheetData.notes === 'same' && one(res)[0].sheetData.currentWounds === 6); }
    { const L = edit(B, T0 + 2000, { currentStrain: 1 }), R = edit(B, T0 + 1000, { notes: 'there' }); res = run(L, R, B);
      check('F2 one-sided there → taken', res.conflicts.length === 0 && one(res)[0].sheetData.notes === 'there'); }
    check('F3 one-sided here → kept', res.conflicts.length === 0 && one(res)[0].sheetData.currentStrain === 1);
    { const L = edit(B, T0 + 2000, { notes: 'here', currentStrain: 2 }), R = edit(B, T0 + 1000, { notes: 'there', currentWounds: 7 }); res = run(L, R, B);
      const q = res.conflicts[0] || {};
      check('F4 the same unit moved on both sides → ONE question, even with comparable stamps (CONTRACT 2)', res.conflicts.length === 1 && q.kind === 'record' && q.id === 'k', res.conflicts.length);
      check('F4 the provisional value is the local candidate', one(res)[0].sheetData.notes === 'here');
      check('F4 each candidate holds every one-sided unit (wounds 7 from there, strain 2 from here)',
        q.local && q.remote && [q.local, q.remote].every((x) => x.sheetData.currentWounds === 7 && x.sheetData.currentStrain === 2), { l: q.local && q.local.sheetData, r: q.remote && q.remote.sheetData });
      check('F4 … and differ only in the asked unit', !!q.local && q.local.sheetData.notes === 'here' && q.remote.sheetData.notes === 'there');
      NOBASE.push([L, R]); }
    { const L = edit(B, T0 + 2000, { bio: 'a' }), R = edit(B, T0 + 1000, { bio: 'b' }); res = run(L, R, B);
      check('F5 a slot no base holds, added differently on each side → the question', res.conflicts.length === 1); }

    // ── stamps ──
    { const L = edit(B, T0 + 2000, {}, { lastOpenedAt: T0 + 9000 }), R = edit(B, T0 + 3000, { currentWounds: 5 }); res = run(L, R, B);
      const c = one(res)[0];
      check('S stamps never make a question (updatedAt and lastOpenedAt differ on both sides)', res.conflicts.length === 0);
      check('S the later comparable stamp is kept (updatedAt from there, lastOpenedAt from here)', c.updatedAt === T0 + 3000 && c.lastOpenedAt === T0 + 9000, { u: c.updatedAt, o: c.lastOpenedAt }); }

    // ── absent is a value ──
    { const L = edit(B, T0 + 2000, { mark: 'new' }), R = edit(B, T0 + 1000, { currentWounds: 5 }); res = run(L, R, B);
      check('A a slot added here only → kept', res.conflicts.length === 0 && one(res)[0].sheetData.mark === 'new'); }
    { const R = edit(B, T0 + 1000, {}); delete R.sheetData.notes; const L = edit(B, T0 + 2000, { currentStrain: 1 }); res = run(L, R, B);
      check('A a slot removed there only → removed', res.conflicts.length === 0 && !('notes' in one(res)[0].sheetData), one(res)[0].sheetData); }

    // ── arrays are one value ──
    { const L = edit(B, T0 + 2000, { equipment: Object.assign(clone(B.sheetData.equipment), { gear: B.sheetData.equipment.gear.concat([{ id: 'stimpack', qty: 1 }]) }), currentStrain: 2 });
      const R = edit(B, T0 + 1000, { equipment: Object.assign(clone(B.sheetData.equipment), { gear: B.sheetData.equipment.gear.concat([{ id: 'comlink', qty: 1 }]) }), currentWounds: 3 });
      res = run(L, R, B); const q = res.conflicts[0] || {};
      check('ARR a different gear item added on each side → one question (the list is one value)', res.conflicts.length === 1);
      check('ARR both candidates hold the one-sided units (wounds 3, strain 2)', q.local && [q.local, q.remote].every((x) => x.sheetData.currentWounds === 3 && x.sheetData.currentStrain === 2)); }

    // ── C-1: coupled units ──
    const xpBuy = (c, at, cost, patch) => edit(c, at, Object.assign({ xp: { total: 225, spent: 150 + cost, remaining: 75 - cost } }, patch));
    { const L = xpBuy(B, T0 + 2000, 10, { skills: { COORD: 2 } });
      const R = xpBuy(B, T0 + 1000, 15, { talents: [{ id: 'grit', rank: 1 }, { id: 'toughened', rank: 1 }] });
      res = run(L, R, B); const q = res.conflicts[0] || {};
      check('C1 a skill bought here, a talent there → ONE question (the XP ledger is one unit)', res.conflicts.length === 1, res.conflicts.length);
      check('C1 each candidate\'s xp agrees with its own purchase (160 with the skill, 165 with the talent)',
        q.local && q.local.sheetData.xp.spent === 160 && q.local.sheetData.skills.COORD === 2 && q.local.sheetData.talents.length === 1
        && q.remote.sheetData.xp.spent === 165 && q.remote.sheetData.skills.COORD === 1 && q.remote.sheetData.talents.length === 2,
        q.local && { l: q.local.sheetData.xp, r: q.remote.sheetData.xp });
      NOBASE.push([L, R]); }
    { const eq = B.sheetData.equipment;
      const L = edit(B, T0 + 2000, { equipment: Object.assign(clone(eq), { credits: 450, gear: eq.gear.concat([{ id: 'stimpack', qty: 1 }]) }) });
      const R = edit(B, T0 + 1000, { equipment: Object.assign(clone(eq), { credits: 100, weapons: eq.weapons.concat([{ id: 'blaster_rifle' }]) }) });
      res = run(L, R, B); const q = res.conflicts[0] || {};
      check('C2 gear bought here, a weapon there → ONE question (the purse is one unit)', res.conflicts.length === 1);
      check('C2 each candidate\'s credits agree with its own purchase (450 + stimpack; 100 + rifle)',
        q.local && q.local.sheetData.equipment.credits === 450 && q.local.sheetData.equipment.weapons.length === 1
        && q.remote.sheetData.equipment.credits === 100 && q.remote.sheetData.equipment.gear.length === 1, q.local && { l: q.local.sheetData.equipment, r: q.remote.sheetData.equipment }); }
    { const L = edit(B, T0 + 2000, { currentWounds: 9 });
      const R = xpBuy(B, T0 + 1000, 15, { talents: [{ id: 'grit', rank: 1 }, { id: 'toughened', rank: 1 }] });
      res = run(L, R, B); const c = one(res)[0];
      check('C3 wounds here, a talent there → both kept, no question', res.conflicts.length === 0 && c.sheetData.currentWounds === 9 && c.sheetData.talents.length === 2 && c.sheetData.xp.spent === 165, c.sheetData); }
    { const L = edit(B, T0 + 2000, { crafts: [{ id: 'p1', materials: { method: 'bought', paid: 50 } }], equipment: Object.assign(clone(B.sheetData.equipment), { credits: 450 }) });
      const R = edit(B, T0 + 1000, { companions: [{ id: 'r2', name: 'R2-D2' }] });
      res = run(L, R, B);
      check('C4 a craft material bought here, a companion edited there → ONE question (the purse holds both)', res.conflicts.length === 1); }
    { const SK = 'swrpg_active_sources'; const base = { version: 2, override: {} };
      const out = M.mergeAdoption({ [SK]: { version: 2, override: { core_x: false } } }, { [SK]: { version: 2, override: { core_y: false } } }, { [SK]: { '': base } });
      check('C5 Core X off here, Core Y off there → ONE question (active sources merge whole)', out.conflicts.length === 1 && out.conflicts[0].kind === 'envelope', out.conflicts);
      const one2 = M.mergeAdoption({ [SK]: { version: 2, override: { core_x: false } } }, { [SK]: clone(base) }, { [SK]: { '': base } });
      check('C5 … and a change on one side only is taken silently (no false question)', one2.conflicts.length === 0 && one2.merged[SK].override.core_x === false); }

    // ── WHOLE values ──
    { const PK = 'swrpg_map_pins'; const base = { version: 1, pins: { tatooine: { note: 'a', when: '2026-10-05' } } };
      const L = clone(base); L.pins.corellia = { note: 'here', when: '2026-11-01' };
      const R = clone(base); R.pins.nar_shaddaa = { note: 'there', when: '2026-11-02' };
      const out = M.mergeAdoption({ [PK]: L }, { [PK]: R }, { [PK]: { '': base } });
      check('W map pins: a pin added on each side → both kept, no question', out.conflicts.length === 0 && Object.keys(out.merged[PK].pins).sort().join() === 'corellia,nar_shaddaa,tatooine', out.merged[PK]);
      const L2 = clone(base); L2.pins.tatooine.note = 'x'; const R2 = clone(base); R2.pins.tatooine.note = 'y';
      check('W map pins: one planet edited differently on each side → the question', M.mergeAdoption({ [PK]: L2 }, { [PK]: R2 }, { [PK]: { '': base } }).conflicts.length === 1); }
    { const OK = 'swrpg_gm_vehicle_overrides'; const base = { YT1300: { affiliation: 'rebellion' } };
      const out = M.mergeAdoption({ [OK]: Object.assign(clone(base), { XWING: { affiliation: 'rebellion' } }) }, { [OK]: Object.assign(clone(base), { TIE: { affiliation: 'empire' } }) }, { [OK]: { '': base } });
      check('W vehicle overrides: a key added on each side → both kept', out.conflicts.length === 0 && Object.keys(out.merged[OK]).length === 3, out.merged[OK]); }
    { const DK = 'swrpg_creation_draft'; const base = { character: { name: 'A', species: 'human' } };
      const out = M.mergeAdoption({ [DK]: { character: { name: 'B', species: 'human' } } }, { [DK]: { character: { name: 'A', species: 'twilek' } } }, { [DK]: { '': base } });
      check('W the draft is one unit: different choices on each side → the question', out.conflicts.length === 1); }

    // ── no base: the ruled rule, byte for byte ──
    const same = NOBASE.every(([L, R]) => JSON.stringify(run(L, R, null)) === JSON.stringify(M.mergeAdoption({ [RK]: env(L) }, { [RK]: env(R) }, undefined)));
    check('N mergeAdoption(l, r) = mergeAdoption(l, r, undefined) on ' + NOBASE.length + ' cases', same && NOBASE.length >= 5);
    const ob = M.mergeAdoption({ [RK]: env(edit(B, T0 + 2000, { currentStrain: 3 })) }, { [RK]: env(edit(B, T0 + 1000, { currentWounds: 5 })) }, { [RK]: {} });
    check('N a base without this record → the ruled rule (newer whole record)', ob.conflicts.length === 0 && ob.merged[RK].characters[0].sheetData.currentWounds === 4);
  } catch (e) {
    check('the run finished without a crash', false, String(e && e.stack || e).slice(0, 600));
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail || pass < 20 ? 1 : 0);
})();
