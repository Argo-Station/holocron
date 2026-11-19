#!/usr/bin/env node
/* test/party_store.cjs — the group record's one writer (lib/shared/partyStore.js; R6 lane A).
 *
 * Card `release-r6-backend-card` §3; rulings `release-r4-shapes` R-R4S-4..7, R-R4S-9 and `release-r6-party-c0`
 * R-R6PC-1/2. The roster is the REAL lib/shared/roster.js in a vm (its F-54 hold, its record write), so a rank-up's
 * sheet write is the one every sheet edit takes. Legs:
 *   P1 envelope: v:1, a list by id, unknown fields kept at every level; a record with no `resource` writes back equal
 *   P2 F-54: an envelope ahead of v:1 is held — save writes nothing
 *   P3 derivations: the S5 scene (Kael 40 · Jae 30 · Mira 10 · the group 5) = Duty 85; a missing member is named, 0
 *   P4 R-R4S-9: `last` is written on add and refreshed on a write while the sheet resolves
 *   P5 the rank-up (R-R4S-6): one act; every char: sheet's Duty rows read 0 from the STORED roster; stubs and group 0
 *   P6 it STOPS before any write: a missing char: member (named), an F-54-held roster (named), Duty not over 100
 *   P7 the undo restores every sheet, stub and group row exactly, and the rank; a sheet edited since stops it
 *   P8 the starting resource (R-R6PC-1/2): the ruled pairs, the holocron's two skills, the printed effects
 *      (holocron two career skills, mentor, AoR base +1,000 cr, Y-wings ceil(members/2)); any other pair kept, inert
 *   P9 removeParty (ruling `encounters-e6-plumbing` ADDENDUM 1, P1.3): removes that one party; `save` tombstones its id
 *      FIRST in the shared `swrpg_deleted_ids` (kept entries kept); an unknown id is a no-op; a held store writes neither
 *   P10 replaceParty (P1.3; wire §6 `party`): the received record replaces ITS id whole, its updatedAt kept, unknown fields
 *      kept; another party untouched; an absent id is appended; a record with no id is refused
 *
 * `node test/party_store.cjs --bite` runs each mutant against its leg and exits 1 if one survives.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'lib/shared/partyStore.js');
const PARTY_SRC = process.env.PARTY_SRC_OVERRIDE ? fs.readFileSync(process.env.PARTY_SRC_OVERRIDE, 'utf8') : fs.readFileSync(SRC, 'utf8');
const ROSTER_SRC = fs.readFileSync(path.join(ROOT, 'lib/shared/roster.js'), 'utf8');
const VG = require('../lib/shared/versionGuard.js');
const RP = require('../lib/shared/recordPortrait.js');
const SKILL_IDS = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical/skills.vocab.json'), 'utf8')).entries.map((e) => e.id);
const PKEY = 'swrpg_party_v1', RKEY = 'swrpg_saved_characters';

// ── the mutants: [name, the leg it must fail, find, replace] ──
const MUTANTS = [
  ['no-keep', 'P1', "if (isObj(src)) Object.keys(src).forEach(function (k) { out[k] = own(known, k) ? known[k] : src[k]; });", ''],
  ['no-f54-hold', 'P2', 'if (_stale || (state && state.stale)) return null;', 'if (false) return null;'],
  ['missing-dropped', 'P3', "if (!rec) { out.push({ who: m.who, name: m.last || '', type: '', magnitude: 0, missing: true }); return; }", 'if (!rec) return;'],
  ['group-rows-uncounted', 'P3', "rows(party[f]).forEach(function (r) { out.push({ who: 'group',", "[].forEach(function (r) { out.push({ who: 'group',"],
  ['no-last-refresh', 'P4', 'if (!rec || !nm || m.last === nm) return m;', 'return m;'],
  ['sheet-not-zeroed', 'P5', 'if (isObj(undo.sheets[cid])) writeSheetDuty(R, cid, zeroDuty(undo.sheets[cid]));', ''],
  ['stub-not-zeroed', 'P5', "return m.who.indexOf('name:') === 0 ? Object.assign({}, m, { duty: zeroRows(m.duty) }) : m;", 'return m;'],
  ['missing-not-stopping', 'P6', "if (!rec) out.push({ who: m.who, name: m.last || '', why: 'missing' });", "if (false) out.push({});"],
  ['held-not-stopping', 'P6', "else if (held) out.push({ who: m.who, name: str(rec.name) || m.last || '', why: 'held' });", ''],
  ['no-threshold', 'P6', "if (!rankProgress(party).canRankUp) return", 'if (false) return'],
  ['no-tombs-rollback', 'P5', 'if (R) { try { if (snap.tombs == null)', 'if (false) { try { if (snap.tombs == null)'],
  ['no-roster-rollback', 'P5', 'if (R) { try { if (snap.roster == null)', 'if (false) { try { if (snap.roster == null)'],
  ['undo-skips-sheets', 'P7', 'writeSheetDuty(R, cid, u.sheets[cid]);', ''],
  ['undo-keeps-rank', 'P7', 'rank: last.from,', 'rank: p.rank,'],
  ['undo-ignores-edits', 'P7', "else if (op === 'undo' && !undoFits(party, m.who, rec)) out.push(", "else if (false) out.push("],
  ['any-pair', 'P8', 'return isObj(r) && own(RESOURCE_PAIRS, r.from) && RESOURCE_PAIRS[r.from].indexOf(r.pick) !== -1;', 'return isObj(r);'],
  ['fh-base-pays', 'P8', "if (r.from === 'aor' && r.pick === 'base') out.extraCredits", "if (r.pick === 'base') out.extraCredits"],
  ['ywings-floor', 'P8', 'Math.ceil(((party.members', 'Math.floor(((party.members'],
  ['remove-no-tombstone', 'P9', 'writeTombstones(ls, gone);', ''],
  ['remove-all', 'P9', "if (!p || p.id !== pid) return true;", 'if (!p) return true;'],
  ['tombs-clobbered', 'P9', 'if (add.length) ls.setItem(TOMBSTONES_KEY, JSON.stringify(list.concat(add)));', 'if (add.length) ls.setItem(TOMBSTONES_KEY, JSON.stringify(add));'],
  ['replace-merges', 'P10', '      found = true;\n      return rec;', '      found = true;\n      return normalizeParty(Object.assign({}, p, rec, { members: p.members.concat(rec.members) }));'],
  ['replace-restamps', 'P10', 'var rec = normalizeParty(record);', 'var rec = normalizeParty(Object.assign({}, record, { updatedAt: now() }));'],
  ['replace-no-append', 'P10', 'if (!found) parties = parties.concat([rec]);', ''],
  ['three-skill-holocron', 'P8', 'if (!Array.isArray(list) || list.length !== 2) return false;', 'if (!Array.isArray(list) || list.length < 2) return false;'],
];

if (process.argv.includes('--bite')) {
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'party-bite-'));
  let bad = 0;
  for (const [name, leg, find, repl] of MUTANTS) {
    const src = fs.readFileSync(SRC, 'utf8');
    if (src.split(find).length !== 2) { console.log('  BROKEN MUTANT ' + name + ': its find is not unique/present'); bad++; continue; }
    const f = path.join(tmp, name + '.js');
    fs.writeFileSync(f, src.replace(find, repl));
    const r = spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { PARTY_SRC_OVERRIDE: f }), encoding: 'utf8' });
    const legFailed = new RegExp('FAIL  ' + leg + ' ').test(r.stdout);
    const ok = r.status === 1 && legFailed;
    console.log((ok ? '  BIT   ' : '  MISSED') + ' ' + name.padEnd(22) + ' → ' + leg + (ok ? '' : ' (exit ' + r.status + ')'));
    if (!ok) bad++;
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(bad ? bad + ' mutant(s) survived' : 'every mutant bit (' + MUTANTS.length + ')');
  process.exit(bad ? 1 : 0);
}

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ok    ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail !== undefined ? '  -> ' + JSON.stringify(detail).slice(0, 400) : '')); }
}

// A fresh world: localStorage, the version guard, the real roster, the party store.
function world(seed) {
  const store = Object.assign({}, seed || {});
  const ls = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  const ctx = { localStorage: ls, SWRPGVersionGuard: VG, SWRPGRecordPortrait: RP, CharResolve: {}, console, Date, JSON, Math };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(ROSTER_SRC, ctx, { filename: 'roster.js' });
  vm.runInContext(PARTY_SRC, ctx, { filename: 'partyStore.js' });
  return { store, ls, P: ctx.SWRPGParty, R: ctx.SWRPGRoster };
}
function vmLs(w) { return w.ls; }
function sheet(name, duty) { return { name, duty }; }
function charRec(id, name, duty) {
  return { id, name, species: 'Human', career: 'Soldier', book: 'aor', source: 'test', selectedChar: { id, name }, sheetData: sheet(name, duty), updatedAt: 1 };
}
function rosterRaw(recs, version) { return JSON.stringify({ version: version == null ? 1 : version, characters: recs }); }
function stored(w) { return JSON.parse(w.store[PKEY]); }
function storedChar(w, id) { return JSON.parse(w.store[RKEY]).characters.find((c) => c.id === id); }

// The S5 scene (release-r4-shapes S5 wireframe): Kael 40 (Combat Victory), Jae 30 (Resource Acquisition, two rows),
// Mira 10 (a typed-in member), the group's Rebel Base 5 → Duty 85, Contribution Rank 2.
function scene(extra) {
  const kael = charRec('c_kael', 'Kael', { type: 'Combat Victory', value: 40 });
  const jae = charRec('c_jae', 'Jae', { type: 'Resource Acquisition', value: 30,
    entries: [{ type: 'Resource Acquisition', magnitude: 20 }, { type: 'Sabotage', magnitude: 10, note: 'kept' }] });
  const party = { v: 1, future: 'kept', parties: [{
    id: 'party', name: 'Rogue Cell', future: { deep: 1 },
    members: [{ who: 'char:c_kael', last: 'Kael' }, { who: 'char:c_jae', last: 'Jae' },
      { who: 'name:Mira', duty: [{ type: 'Intelligence', magnitude: 10, x: 1 }], obligation: [] }],
    duty: [{ type: 'Rebel Base', magnitude: 5 }], obligation: [], rank: 2, rankUps: [], bases: [{ id: 'base-x', anything: 1 }],
    updatedAt: 1 }] };
  return Object.assign({ [RKEY]: rosterRaw([kael, jae]), [PKEY]: JSON.stringify(party) }, extra || {});
}

// ── P1 envelope ──
{
  const w = world(scene());
  const s = w.P.load();
  check('P1 the envelope reads: v 1, one party by id', s.v === 1 && s.parties.length === 1 && s.parties[0].id === 'party', s);
  const before = w.store[PKEY];
  w.P.save(s);
  const after = stored(w);
  const P0 = after.parties[0] || {};
  check('P1 unknown fields kept on the envelope, the party, a member row and a base', after.future === 'kept'
    && (P0.future || {}).deep === 1 && ((((P0.members || [])[2] || {}).duty || [])[0] || {}).x === 1 && ((P0.bases || [])[0] || {}).anything === 1, after);
  check('P1 a record with no `resource` writes back with none (the field joins only when set)', !('resource' in after.parties[0]), after.parties[0]);
  check('P1 an untouched save writes back equal', JSON.stringify(after) === before, [JSON.stringify(after), before]);
  const n = w.P.normalizeParty({ id: 'party', members: [{ who: 'npc:x' }, { who: 'char:a' }, { who: 'char:a' }, { who: 'name:' }] });
  check('P1 members: npc: and empty names dropped, one row per member', n.members.length === 1 && n.members[0].who === 'char:a', n.members);
}

// ── P2 F-54 ──
{
  const w = world(Object.assign(scene(), { [PKEY]: JSON.stringify({ v: 2, parties: [{ id: 'party', name: 'Newer', members: [] }] }) }));
  const s = w.P.load();
  const raw = w.store[PKEY];
  const r = w.P.save(w.P.setName(s, 'Downgraded'));
  check('P2 an envelope ahead of v:1 is held: save writes nothing', r === null && w.store[PKEY] === raw && w.P.isStale(), w.store[PKEY]);
}

// ── P3 derivations ──
{
  const w = world(scene());
  const party = w.P.partyOf(w.P.load());
  const parts = w.P.dutyParts(party);
  check('P3 the S5 scene sums to Duty 85', w.P.dutyTotal(party) === 85, parts);
  check('P3 the parts are the printed sheet\'s rows, members then the group', JSON.stringify(parts.map((p) => [p.name, p.type, p.magnitude])) ===
    JSON.stringify([['Kael', 'Combat Victory', 40], ['Jae', 'Resource Acquisition', 20], ['Jae', 'Sabotage', 10], ['Mira', 'Intelligence', 10], ['Rogue Cell', 'Rebel Base', 5]]), parts);
  const pr = w.P.rankProgress(party);
  check('P3 progress: 85 is not over 100; 16 more to exceed it; rank stays 2', !pr.canRankUp && pr.toNext === 16 && pr.rank === 2, pr);
  check('P3 nothing derived is stored on the record', !/total|progress|toNext|canRankUp/.test(w.store[PKEY]));
  const w2 = world(Object.assign(scene(), { [RKEY]: rosterRaw([charRec('c_jae', 'Jae', { type: 'X', value: 30, entries: [{ type: 'X', magnitude: 30 }] })]) }));
  const p2 = w2.P.dutyParts(w2.P.partyOf(w2.P.load()));
  const miss = p2.find((p) => p.who === 'char:c_kael');
  check('P3 a missing char: member is one part, named by `last`, counted 0', !!miss && miss.missing === true && miss.name === 'Kael' && miss.magnitude === 0, p2);
}

// ── P4 R-R4S-9 ──
{
  const w = world(scene());
  let s = w.P.addCharMember(w.P.load(), 'c_new', 'Tarn');
  check('P4 `last` is written when a char: member is added', w.P.partyOf(s).members.some((m) => m.who === 'char:c_new' && m.last === 'Tarn'));
  const roster = JSON.parse(w.store[RKEY]); roster.characters[0].name = 'Kael Voss'; w.store[RKEY] = JSON.stringify(roster);
  w.P.save(w.P.setName(w.P.load(), 'Rogue Cell'));
  check('P4 `last` is refreshed on a write while the sheet resolves', stored(w).parties[0].members[0].last === 'Kael Voss', stored(w).parties[0].members[0]);
}

// ── P5 the rank-up ──
function overScene() {
  // the session's Duty: Kael's sheet goes 40 → 60, so the total is 105, over 100
  const seed = scene();
  const r = JSON.parse(seed[RKEY]); r.characters[0].sheetData.duty.value = 60; seed[RKEY] = JSON.stringify(r);
  return seed;
}
{
  const w = world(overScene());
  const kaelBefore = JSON.stringify(storedChar(w, 'c_kael').sheetData.duty);
  const jaeBefore = JSON.stringify(storedChar(w, 'c_jae').sheetData.duty);
  const res = w.P.rankUp({ reward: 'vehicle', note: 'a U-wing', at: 1786000000000 });
  check('P5 the rank-up runs over 100 (105)', res.ok === true, res);
  // reload: a fresh world over the same bytes
  const w2 = world(w.store);
  const p = w2.P.partyOf(w2.P.load());
  check('P5 rank 2 → 3 and one rankUps entry {from 2, to 3, reward vehicle}', p.rank === 3 && p.rankUps.length === 1
    && p.rankUps[0].from === 2 && p.rankUps[0].to === 3 && p.rankUps[0].reward === 'vehicle', p.rankUps);
  const k = storedChar(w2, 'c_kael').sheetData.duty, j = storedChar(w2, 'c_jae').sheetData.duty;
  check('P5 every char: sheet\'s Duty reads 0 from the STORED roster after a reload', k.value === 0 && j.value === 0
    && j.entries.every((e) => e.magnitude === 0) && j.entries[1].note === 'kept' && k.type === 'Combat Victory', [k, j]);
  check('P5 the stub\'s and the group\'s Duty rows are 0; the total is 0', p.members[2].duty[0].magnitude === 0 && p.duty[0].magnitude === 0
    && w2.P.dutyTotal(p) === 0, p);
  check('P5 the sheets were written by the roster\'s own write (updatedAt moved)', storedChar(w2, 'c_kael').updatedAt > 1);
  // stash for P7
  module.exports._p5 = { store: Object.assign({}, w.store), kaelBefore, jaeBefore };
}

{
  // A write that fails partway (the group record's write throws: quota) puts BOTH keys back as they were.
  const w = world(overScene());
  const before = JSON.stringify(w.store);
  const ls = w.P && vmLs(w);
  const realSet = ls.setItem;
  let partyWrites = 0;
  ls.setItem = (k, v) => { if (k === PKEY && partyWrites++ === 0) throw new Error('QuotaExceededError'); return realSet(k, v); };
  const res = w.P.rankUp({ reward: 'gear' });
  ls.setItem = realSet;
  check('P5 a write that fails partway reports it and puts both keys back exactly', res.ok === false && res.stopped[0].why === 'write-failed'
    && JSON.stringify(w.store) === before, [res, JSON.stringify(w.store) === before]);
}

// ── P6 it stops before any write ──
{
  const seed = overScene();
  const r = JSON.parse(seed[RKEY]); r.characters = r.characters.filter((c) => c.id !== 'c_kael'); seed[RKEY] = JSON.stringify(r);
  // Kael gone: 105 − 60 = 45 — the blocker is named before the threshold is read
  const w = world(seed);
  const before = JSON.stringify(w.store);
  const res = w.P.rankUp({ reward: 'gear' });
  check('P6 a missing char: member STOPS the act, named', res.ok === false && res.stopped.some((b) => b.who === 'char:c_kael' && b.why === 'missing' && b.name === 'Kael'), res.stopped);
  check('P6 …and nothing was written (every key byte-equal)', JSON.stringify(w.store) === before);
}
{
  const seed = overScene();
  seed[RKEY] = rosterRaw(JSON.parse(seed[RKEY]).characters, 2);    // a newer build's roster: F-54 holds it
  const w = world(seed);
  const before = JSON.stringify(w.store);
  const res = w.P.rankUp({ reward: 'gear' });
  check('P6 an F-54-held roster STOPS the act, naming each member sheet', res.ok === false
    && ['char:c_kael', 'char:c_jae'].every((who) => res.stopped.some((b) => b.who === who && b.why === 'held')), res.stopped);
  check('P6 …and nothing was written', JSON.stringify(w.store) === before);
}
{
  const w = world(scene());
  const before = JSON.stringify(w.store);
  const res = w.P.rankUp({ reward: 'gear' });
  check('P6 Duty 85 (not over 100) does not rank up, and writes nothing', res.ok === false && res.stopped[0].why === 'below-threshold'
    && JSON.stringify(w.store) === before, res);
  let threw = false; try { world(overScene()).P.rankUp({ reward: 'ship' }); } catch (e) { threw = true; }
  check('P6 a reward outside S5\'s four throws (a live write is loud)', threw);
}

// ── P7 the undo ──
{
  const { store, kaelBefore, jaeBefore } = module.exports._p5;
  const w = world(store);
  const res = w.P.undoRankUp();
  check('P7 the undo runs', res.ok === true, res);
  const w2 = world(w.store);
  const p = w2.P.partyOf(w2.P.load());
  check('P7 every sheet\'s Duty is restored exactly', JSON.stringify(storedChar(w2, 'c_kael').sheetData.duty) === kaelBefore
    && JSON.stringify(storedChar(w2, 'c_jae').sheetData.duty) === jaeBefore,
    [storedChar(w2, 'c_kael').sheetData.duty, storedChar(w2, 'c_jae').sheetData.duty]);
  check('P7 the stub, the group rows, the rank and the history are restored', p.rank === 2 && p.rankUps.length === 0
    && p.members[2].duty[0].magnitude === 10 && p.members[2].duty[0].x === 1 && p.duty[0].magnitude === 5 && w2.P.dutyTotal(p) === 105, p);
  check('P7 nothing is left to undo', !w2.P.canUndo(p) && w2.P.undoRankUp().ok === false);
}
{
  const { store } = module.exports._p5;
  const w = world(store);
  const r = JSON.parse(w.store[RKEY]); r.characters.find((c) => c.id === 'c_kael').sheetData.duty.value = 15; w.store[RKEY] = JSON.stringify(r);
  const before = JSON.stringify(w.store);
  const res = w.P.undoRankUp();
  check('P7 a sheet whose Duty moved since STOPS the undo, named, and nothing is written', res.ok === false
    && res.stopped.some((b) => b.who === 'char:c_kael' && b.why === 'changed') && JSON.stringify(w.store) === before, res.stopped);
}

// ── P8 the starting resource ──
{
  const { P } = world(scene());
  const pairs = { eote: ['ship'], fh: ['base'], aor: ['ship', 'ywings', 'base'], fad: ['ship', 'holocron', 'mentor'] };
  check('P8 the ruled pairs, exactly (R-R6PC-1)', JSON.stringify(P.RESOURCE_PAIRS) === JSON.stringify(pairs), P.RESOURCE_PAIRS);
  const two = ['lore', 'lightsaber'];   // FaD p.109 Table 2-7, d10 result 7: Knowledge (Lore) / Lightsaber
  check('P8 the holocron pair is two skills.vocab ids', two.every((id) => SKILL_IDS.includes(id)), SKILL_IDS);
  let s = P.setResource(P.load(), { from: 'fad', pick: 'holocron', skills: two }, SKILL_IDS);
  let p = P.partyOf(s);
  check('P8 holocron (FaD p.109): two career skills, nothing else', JSON.stringify(P.resourceEffects(p, SKILL_IDS)) ===
    JSON.stringify({ careerSkills: two, mentor: false, extraCredits: 0, ywings: 0 }), P.resourceEffects(p, SKILL_IDS));
  const bad = [[{ from: 'fad', pick: 'holocron', skills: [two[0]] }, 'one skill'], [{ from: 'fad', pick: 'holocron', skills: [two[0], two[0]] }, 'a repeated skill'],
    [{ from: 'fad', pick: 'holocron', skills: SKILL_IDS.slice(0, 3) }, 'three skills'],
    [{ from: 'fad', pick: 'holocron', skills: [two[0], 'not_a_skill'] }, 'a skill outside the vocab'],
    [{ from: 'eote', pick: 'base' }, 'eote + base'], [{ from: 'fh', pick: 'ship' }, 'fh + ship'], [{ from: 'aor', pick: 'mentor' }, 'aor + mentor'],
    [{ from: 'fad', pick: 'ship', skills: two }, 'skills on a ship']];
  bad.forEach(([res, why]) => { let threw = false; try { P.setResource(P.load(), res, SKILL_IDS); } catch (e) { threw = true; } check('P8 a live write refuses ' + why, threw); });
  p = P.partyOf(P.setResource(P.load(), { from: 'fad', pick: 'mentor' }));
  check('P8 mentor (FaD p.109): the discount flag only', JSON.stringify(P.resourceEffects(p)) === JSON.stringify({ careerSkills: [], mentor: true, extraCredits: 0, ywings: 0 }));
  p = P.partyOf(P.setResource(P.load(), { from: 'aor', pick: 'base' }));
  check('P8 AoR base (AoR p.111): +1,000 credits of starting gear per PC', P.resourceEffects(p).extraCredits === 1000);
  p = P.partyOf(P.setResource(P.load(), { from: 'fh', pick: 'base' }));
  check('P8 a Far Horizons base pays no credits (the pair is aor + base only)', P.resourceEffects(p).extraCredits === 0);
  p = P.partyOf(P.setResource(P.load(), { from: 'aor', pick: 'ywings' }));
  check('P8 Y-wings (AoR p.111): one per two PCs, rounding up — 3 members → 2', P.resourceEffects(p).ywings === 2, P.resourceEffects(p));
  p = P.partyOf(P.addNameMember(P.setResource(P.load(), { from: 'aor', pick: 'ywings' }), 'Vel'));
  check('P8 …4 members → 2', P.resourceEffects(p).ywings === 2);
  p = P.partyOf(P.removeMember(P.setResource(P.load(), { from: 'aor', pick: 'ywings' }), 'name:Mira'));
  check('P8 …2 members → 1', P.resourceEffects(p).ywings === 1);
  const odd = P.normalizeParty({ id: 'party', resource: { from: 'eote', pick: 'base', future: 1 } });
  check('P8 an unruled pair is kept as stored and does nothing', JSON.stringify(odd.resource) === JSON.stringify({ from: 'eote', pick: 'base', future: 1 })
    && JSON.stringify(P.resourceEffects(odd)) === JSON.stringify({ careerSkills: [], mentor: false, extraCredits: 0, ywings: 0 }));
  const oneSkill = P.normalizeParty({ id: 'party', resource: { from: 'fad', pick: 'holocron', skills: ['astrogation'] } });
  check('P8 a malformed holocron is kept and grants nothing', oneSkill.resource.skills.length === 1 && P.resourceEffects(oneSkill).careerSkills.length === 0);
  const w = world(scene());
  w.P.save(w.P.setResource(w.P.load(), { from: 'fad', pick: 'holocron', skills: two, refs: [] }, SKILL_IDS));
  const back = world(w.store).P.partyOf(world(w.store).P.load());
  check('P8 the holocron pick is held after a reload, and nothing derived is stored', JSON.stringify(back.resource) ===
    JSON.stringify({ from: 'fad', pick: 'holocron', skills: two, note: '' }) && !/careerSkills|extraCredits|ywings|mentor"/.test(w.store[PKEY]), back.resource);
}

// ── P9 removeParty (E6 plumbing P1.3) ──
{
  const two = JSON.stringify({ v: 1, parties: [{ id: 'party_a', name: 'A', members: [{ who: 'char:c_kael', last: 'Kael' }], updatedAt: 5 },
    { id: 'party_b', name: 'B', members: [], updatedAt: 6 }] });
  const w = world(scene({ [PKEY]: two, swrpg_deleted_ids: JSON.stringify(['old_id']) }));
  const next = w.P.removeParty(w.P.load(), 'party_a');
  check('P9 the op is pure: nothing written before save', w.store[PKEY] === two && JSON.parse(w.store.swrpg_deleted_ids).length === 1);
  check('P9 the mark never serializes', !/_deletedIds/.test(JSON.stringify(next)));
  w.P.save(next);
  check('P9 only that party is removed', stored(w).parties.map((p) => p.id).join() === 'party_b', stored(w).parties);
  check('P9 its id is tombstoned, the list\'s other entries kept', JSON.stringify(JSON.parse(w.store.swrpg_deleted_ids)) === JSON.stringify(['old_id', 'party_a']), w.store.swrpg_deleted_ids);
  const same = w.P.removeParty(w.P.load(), 'nobody');
  w.P.save(same);
  check('P9 an unknown id removes nothing and tombstones nothing', stored(w).parties.length === 1 && JSON.parse(w.store.swrpg_deleted_ids).length === 2);
  const held = world(scene({ [PKEY]: JSON.stringify({ v: 2, parties: [{ id: 'party_a', members: [] }] }) }));
  const r = held.P.save(held.P.removeParty(held.P.load(), 'party_a'));
  check('P9 a held store (F-54) writes neither the parties nor a tombstone', r === null && held.store.swrpg_deleted_ids === undefined && JSON.parse(held.store[PKEY]).v === 2);
}

// ── P10 replaceParty (E6 plumbing P1.3; wire §6 `party`) ──
{
  const local = JSON.stringify({ v: 1, parties: [{ id: 'party_gm', name: 'Old', members: [{ who: 'char:c_kael', last: 'Kael' }, { who: 'name:Gone' }], updatedAt: 3 },
    { id: 'party_mine', name: 'Mine', members: [], updatedAt: 4 }] });
  const w = world(scene({ [PKEY]: local }));
  const gm = { id: 'party_gm', name: 'Rogue Cell', members: [{ who: 'char:c_kael', last: 'Kael' }, { who: 'char:theirs', last: 'Vel' }],
    duty: [{ type: 'Rebel Base', magnitude: 5 }], obligation: [], rank: 1, rankUps: [], bases: [], updatedAt: 99, future: 'kept' };
  w.P.save(w.P.replaceParty(w.P.load(), gm));
  const got = stored(w).parties.find((p) => p.id === 'party_gm');
  check('P10 the copy replaces its id WHOLE (no local member survives)', got && got.name === 'Rogue Cell' && got.members.map((m) => m.who).join() === 'char:c_kael,char:theirs', got);
  check('P10 the sender\'s updatedAt is kept, and an unknown field rides', got && got.updatedAt === 99 && got.future === 'kept', got);
  check('P10 another party is untouched', JSON.stringify(stored(w).parties.find((p) => p.id === 'party_mine')) === JSON.stringify(w.P.normalizeParty(JSON.parse(local).parties[1])));
  const w2 = world(scene({ [PKEY]: JSON.stringify({ v: 1, parties: [] }) }));
  w2.P.save(w2.P.replaceParty(w2.P.load(), gm));
  check('P10 an id not held is appended', stored(w2).parties.length === 1 && stored(w2).parties[0].id === 'party_gm');
  const s0 = w2.P.load();
  check('P10 a record with no id is refused', w2.P.replaceParty(s0, { name: 'x', members: [] }) === s0);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
