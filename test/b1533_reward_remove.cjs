#!/usr/bin/env node
/**
 * b1533_reward_remove.cjs — B-1533: SWRPGRewards.removeReward / removeContact, the verb ruled on paper at
 * `release-r7-bug-burndown` ADDENDUM 460, with ADDENDUM 461 item 4; the face's guard is scripts/smoke_b1533_reward_remove.py.
 *
 *   V1  whole row: the row goes, `spent` falls and `remaining` rises by what was paid, `total` kept, the other rows untouched
 *   V2  a given row refunds nothing, and its patch has no `xp`
 *   V3  the hard cases: a tier under a raise, a given row raised, a raised network, a second row of a type, XP spent elsewhere
 *   V4  the floor: `spent` below the row's price moves only what `spent` holds, and `refund` is the amount moved
 *   V5  refusals: an unknown id, a hold; neither returns a patch
 *   V6  no new field: the patch carries only the ruled keys; an unknown field on a surviving row rides through; pure
 *   V7  a re-buy pays the same printed prices (ADDENDUM 460 Q1 (a))
 *   V8  a scar's talent leaves at render, and two scars on one talent drop one rank
 *   V9  the scar's stored pick: gone with the talent's last source, kept while another source owns the talent (460 Q3)
 *
 * Run: node test/b1533_reward_remove.cjs            · --cut <sha> (red at that commit, by exit code) · --bites (every mutant reds)
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const STORE = 'lib/shared/rewardsStore.js';

function runWith(file) {
  try { return { code: 0, out: execFileSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { B1533_STORE: file }), stdio: 'pipe' }).toString() }; }
  catch (e) { return { code: e.status == null ? -1 : e.status, out: String(e.stdout || '') + String(e.stderr || '') }; }
}
const scratch = () => fs.mkdtempSync(path.join(process.env.CLAUDE_JOB_DIR ? path.join(process.env.CLAUDE_JOB_DIR, 'tmp') : os.tmpdir(), 'b1533-'));

if (process.argv.includes('--cut')) {
  const sha = process.argv[process.argv.indexOf('--cut') + 1];
  const dir = scratch(), file = path.join(dir, 'rewardsStore.js');
  fs.writeFileSync(file, execFileSync('git', ['show', sha + ':' + STORE], { cwd: ROOT }));
  const r = runWith(file);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(r.out.trim().split('\n').filter((l) => /FAIL|FAILED|passed/.test(l)).slice(0, 8).join('\n'));
  console.log('AT ' + sha + ': exit ' + r.code + (r.code === 1 ? ' (RED, as owed)' : ' (NOT RED)'));
  process.exit(r.code === 1 ? 0 : 1);
}
if (process.argv.includes('--bites')) {
  const MUTANTS = [
    { name: 'no floor: refund is row.xp whatever `spent` holds', from: 'var refund = Math.min(spent, paid);', to: 'var refund = paid;' },
    { name: 'total moves too', from: "spent: spent - refund, remaining: available(sheet) + refund }", to: "spent: spent - refund, remaining: available(sheet) + refund, total: (Number(xp.total) || 0) - refund }" },
    { name: 'remaining not raised', from: 'remaining: available(sheet) + refund }', to: 'remaining: available(sheet) }' },
    { name: 'a hold does not refuse', from: "if (opts && opts.held) return refused('buying is held');", to: '' },
    { name: 'an unknown id refunds nothing and writes', from: "if (!row) return refused('no reward row ' + id);", to: "if (!row) return { ok: true, patch: { rewards: rows }, row: null, refund: 0 };" },
    { name: 'a free row still patches xp', from: 'var out = !back.refund ? { ok: true, patch: { rewards: rest }, row: row, refund: 0 }\n      : {', to: 'var out = {' },
    { name: 'the scar pick stays', from: 'var picks = scarPickCleared(sheet, rest, row);', to: 'var picks = null;' },
    { name: 'the scar pick goes while another source holds the talent', from: 'if (rest.some(function (r) { return r.key === \'BS\' && r.talent === row.talent; })) return null;', to: '' },
    { name: 'the contact verb removes the wrong row', from: 'var rest = rows.filter(function (r) { return r.id !== id; });\n    var back = moveBack(sheet, row.xp);\n    if (!back.refund) return { ok: true, patch: { contacts: rest }', to: 'var rest = rows.slice(1);\n    var back = moveBack(sheet, row.xp);\n    if (!back.refund) return { ok: true, patch: { contacts: rest }' },
  ];
  const src = fs.readFileSync(path.join(ROOT, STORE), 'utf8');
  const dir = scratch();
  let bad = 0;
  const copy = (name, text) => { const f = path.join(dir, name + '.js'); fs.writeFileSync(f, text); return f; };
  const clean = runWith(copy('clean', src));
  console.log((clean.code === 0 ? 'ok   ' : 'BAD  ') + 'the no-op copy exits ' + clean.code);
  if (clean.code !== 0) bad += 1;
  MUTANTS.forEach((m, i) => {
    if (!src.includes(m.from)) { bad += 1; console.log('BAD  mutant text not found: ' + m.name); return; }
    const r = runWith(copy('m' + i, src.replace(m.from, m.to)));
    const bit = r.code === 1 && /FAIL /.test(r.out);
    if (!bit) bad += 1;
    console.log((bit ? 'bit  ' : 'BAD  ') + m.name + ' — exit ' + r.code);
  });
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(bad ? bad + ' BAD' : 'every mutant bit');
  process.exit(bad ? 1 : 0);
}

const RS = require(process.env.B1533_STORE || path.join(ROOT, STORE));
const CR = require(path.join(ROOT, 'lib/shared/charResolve.js'));
const REG = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical/rewards.json'), 'utf8'));
const reg = (s) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', s + '.json'), 'utf8'))[s];
const CB = { species: reg('species'), careers: reg('careers'), specializations: reg('specializations'), talents: reg('talents'), skillSheetKeys: {} };

let failures = 0, passes = 0;
function check(ok, msg, detail) {
  if (ok) { passes += 1; console.log('  PASS  ' + msg); }
  else { failures += 1; console.log('  FAIL  ' + msg + (detail !== undefined ? '  — ' + JSON.stringify(detail).slice(0, 300) : '')); }
}
function done() {
  console.log(failures ? '\n' + failures + ' FAILED' : '\n' + passes + ' passed');
  process.exit(failures ? 1 : 0);
}
if (typeof RS.removeReward !== 'function' || typeof RS.removeContact !== 'function') {
  check(false, 'SWRPGRewards has removeReward and removeContact');
  done();
}

const clone = (v) => JSON.parse(JSON.stringify(v));
const sheetOf = (total) => ({ xp: { total, spent: 0, remaining: total }, rewards: [], contacts: [] });
const ap = (s, r) => { if (!r.ok) throw new Error(r.reason); return Object.assign(clone(s), r.patch); };
const freeze = (o) => { if (o && typeof o === 'object') { Object.values(o).forEach(freeze); Object.freeze(o); } return o; };

// V1 whole row
let s = ap(sheetOf(100), RS.buyRewardTier(sheetOf(100), REG, { key: 'ALLY', name: 'Dex Tarrow' }));
const allyId = s.rewards[0].id;
s = ap(s, RS.buyRewardTier(s, REG, { rowId: allyId }));
s = ap(s, RS.buyRewardTier(s, REG, { key: 'FOLLOWER', name: 'Vel' }));
check(s.xp.spent === 20 && s.xp.remaining === 80, 'V1 the fixture paid 15 + 5', s.xp);
let r = RS.removeReward(s, allyId);
check(r.ok && r.refund === 15, 'V1 Ally Grateful + Indebted refunds 15', r);
check(r.ok && r.patch.xp.spent === 5 && r.patch.xp.remaining === 95 && r.patch.xp.total === 100, 'V1 spent −15, remaining +15, total kept', r.patch && r.patch.xp);
check(r.ok && r.patch.rewards.length === 1 && r.patch.rewards[0].name === 'Vel' && r.row.id === allyId, 'V1 only that row goes; the verb returns it', r.patch && r.patch.rewards);
check(r.ok && !('contacts' in r.patch), 'V1 a Reward\'s patch does not touch contacts', r.patch && Object.keys(r.patch));

let c = sheetOf(100);
const cn = RS.buyContact(c, {}, { name: 'Mos Eisley', skill: 'underworld' });
c = ap(c, cn);
const cr1 = RS.raiseContact(c, {}, cn.row.id, 'scope');
c = ap(c, cr1);
const paidNet = cn.cost + cr1.cost;
r = RS.removeContact(c, cn.row.id);
check(r.ok && r.refund === paidNet && r.patch.contacts.length === 0, 'V1 a raised network goes whole, every raise refunded (' + paidNet + ')', r);
check(r.ok && r.patch.xp.spent === 0 && r.patch.xp.remaining === 100 && r.patch.xp.total === 100, 'V1 the network\'s ledger returns to where it began', r.patch && r.patch.xp);
check(r.ok && !('rewards' in r.patch), 'V1 a network\'s patch does not touch rewards', r.patch && Object.keys(r.patch));

// V2 a gift
let g = ap(sheetOf(100), RS.giveReward(sheetOf(100), REG, { key: 'MEDALS', tier: REG.types.MEDALS.options[0].key }));
r = RS.removeReward(g, g.rewards[0].id);
check(r.ok && r.refund === 0 && r.patch.rewards.length === 0, 'V2 a given Reward clears and refunds 0', r);
check(r.ok && !('xp' in r.patch), 'V2 a given Reward\'s patch has no xp', r.patch && Object.keys(r.patch));
let gc = ap(sheetOf(100), RS.giveContact(sheetOf(100), { skill: 'lore', scope: 3, expertise: 2 }));
r = RS.removeContact(gc, gc.contacts[0].id);
check(r.ok && r.refund === 0 && r.patch.contacts.length === 0 && !('xp' in r.patch), 'V2 a given network clears, no xp in its patch', r);

// V3 the hard cases
let h = ap(sheetOf(100), RS.giveReward(sheetOf(100), REG, { key: 'ALLY', tier: REG.types.ALLY.tiers[0].key }));
h = ap(h, RS.buyRewardTier(h, REG, { rowId: h.rewards[0].id }));
r = RS.removeReward(h, h.rewards[0].id);
check(r.ok && r.refund === 10 && r.patch.rewards.length === 0, 'V3 a gift under a raise goes with its row; the refund is the 10 paid (460 Q2)', r);
let e = ap(sheetOf(100), RS.giveContact(sheetOf(100), { skill: 'lore', scope: 3, expertise: 2 }));
const eRaise = RS.raiseContact(e, {}, e.contacts[0].id, 'scope');
e = ap(e, eRaise);
r = RS.removeContact(e, e.contacts[0].id);
check(r.ok && r.refund === eRaise.cost, 'V3 a given network raised refunds only the raise', r);
let two = ap(sheetOf(100), RS.giveReward(sheetOf(100), REG, { key: 'ALLY', tier: REG.types.ALLY.tiers[1].key, name: 'Given' }));
two = ap(two, RS.buyRewardTier(two, REG, { key: 'ALLY', name: 'Bought' }));
const bought = two.rewards.filter((x) => x.name === 'Bought')[0];
r = RS.removeReward(two, bought.id);
check(r.ok && r.refund === 5 && r.patch.rewards.length === 1 && r.patch.rewards[0].name === 'Given', 'V3 a second row of a type: only the named row goes', r);
let nets = ap(sheetOf(100), RS.giveContact(sheetOf(100), { skill: 'lore', name: 'First', scope: 1, expertise: 1 }));
nets = ap(nets, RS.buyContact(nets, {}, { skill: 'underworld', name: 'Second' }));
r = RS.removeContact(nets, nets.contacts[1].id);
check(r.ok && r.patch.contacts.length === 1 && r.patch.contacts[0].name === 'First' && r.row.name === 'Second', 'V3 two networks: only the named one goes', r);
let later = { xp: { total: 15, spent: 0, remaining: 15 } };
later = ap(later, RS.buyRewardTier(later, REG, { key: 'ALLY' }));
later = Object.assign(later, { xp: { total: 15, spent: 15, remaining: 0 } });
r = RS.removeReward(later, later.rewards[0].id);
check(r.ok && r.refund === 5 && r.patch.xp.spent === 10 && r.patch.xp.remaining === 5, 'V3 XP later spent elsewhere: the price still comes back, the later spend still counted', r);
let nr = { xp: { total: 50, spent: 10 } };
nr = ap(nr, RS.buyRewardTier(nr, REG, { key: 'FOLLOWER' }));
delete nr.xp.remaining;
r = RS.removeReward(nr, nr.rewards[0].id);
check(r.ok && r.patch.xp.remaining === 40 && r.patch.xp.spent === 10, 'V3 a sheet with no stored remaining reads it as the buyers do', r.patch && r.patch.xp);

// V4 the floor
let f = ap(sheetOf(100), RS.buyRewardTier(sheetOf(100), REG, { key: 'ALLY' }));
f = ap(f, RS.buyRewardTier(f, REG, { rowId: f.rewards[0].id }));
f = Object.assign(f, { xp: { total: 100, spent: 3, remaining: 97 } });
r = RS.removeReward(f, f.rewards[0].id);
check(r.ok && r.refund === 3 && r.patch.xp.spent === 0 && r.patch.xp.remaining === 100, 'V4 spent 3 under a 15 row: 3 moves, and refund says 3', r);
f = Object.assign(f, { xp: { total: 100, spent: 0, remaining: 100 } });
r = RS.removeReward(f, f.rewards[0].id);
check(r.ok && r.refund === 0 && !('xp' in r.patch) && r.patch.rewards.length === 0, 'V4 spent 0: the row goes, nothing moves, no xp in the patch', r);

// V5 refusals
r = RS.removeReward(s, 'rwd-nope');
check(r.ok === false && !r.patch, 'V5 an unknown Reward id refuses, no patch', r);
r = RS.removeContact(c, 'cnt-nope');
check(r.ok === false && !r.patch, 'V5 an unknown network id refuses, no patch', r);
r = RS.removeReward(s, null);
check(r.ok === false && !r.patch, 'V5 no id refuses, no patch', r);
r = RS.removeReward(s, allyId, { held: true });
check(r.ok === false && !r.patch, 'V5 a held sheet refuses a Reward remove', r);
r = RS.removeContact(c, cn.row.id, { held: true });
check(r.ok === false && !r.patch, 'V5 a held sheet refuses a network remove', r);
r = RS.removeReward(s, allyId, { held: false });
check(r.ok === true, 'V5 not held removes', r);

// V6 no new field; keep; pure
r = RS.removeReward(s, allyId);
check(Object.keys(r.patch).sort().join() === 'rewards,xp', 'V6 a Reward\'s patch is { rewards, xp }', Object.keys(r.patch));
r = RS.removeContact(c, cn.row.id);
check(Object.keys(r.patch).sort().join() === 'contacts,xp', 'V6 a network\'s patch is { contacts, xp }', Object.keys(r.patch));
const kept = clone(s); kept.rewards[1].future = { x: 1 }; kept.xp.note = 'kept';
r = RS.removeReward(kept, allyId);
check(r.patch.rewards[0].future && r.patch.rewards[0].future.x === 1, 'V6 an unknown field on a surviving row rides through', r.patch.rewards);
check(r.patch.xp.note === 'kept', 'V6 an unknown field on xp rides through', r.patch.xp);
const frozen = freeze(clone(s));
let threw = null;
try { RS.removeReward(frozen, allyId); } catch (err) { threw = String(err); }
check(threw === null, 'V6 pure: the verb writes nothing it was given', threw);
const frozenC = freeze(clone(c));
threw = null;
try { RS.removeContact(frozenC, cn.row.id); } catch (err) { threw = String(err); }
check(threw === null, 'V6 pure: the network verb too', threw);

// V7 a re-buy pays the same printed prices
const before = clone(s.xp);
let again = ap(s, RS.removeReward(s, allyId));
again = ap(again, RS.buyRewardTier(again, REG, { key: 'ALLY', name: 'Dex Tarrow' }));
again = ap(again, RS.buyRewardTier(again, REG, { rowId: again.rewards[again.rewards.length - 1].id }));
check(JSON.stringify(again.xp) === JSON.stringify(before), 'V7 remove and re-buy lands on the same ledger', [before, again.xp]);

// V8 a scar's talent leaves at render
const tid = REG.types.BS.options[0].talent;
const sevs = REG.types.BS.tiers;
const scarIds = (sh) => CR.scarTalentGrants(sh).map((g2) => g2.id);
let sc = ap(sheetOf(200), RS.buyBattleScar(sheetOf(200), REG, { tier: sevs[0].key, talent: tid }));
sc = ap(sc, RS.buyBattleScar(sc, REG, { tier: sevs[0].key, talent: tid }));
check(scarIds(sc).length === 2, 'V8 two scars on one talent are two grants', scarIds(sc));
let sc2 = ap(sc, RS.removeReward(sc, sc.rewards[0].id));
check(scarIds(sc2).length === 1 && sc2.xp.spent === sevs[0].xp, 'V8 one remove drops one rank and refunds its price', sc2.xp);
sc2 = ap(sc2, RS.removeReward(sc2, sc2.rewards[0].id));
check(scarIds(sc2).length === 0 && sc2.xp.spent === 0, 'V8 the last remove takes the talent', sc2.xp);
check(!CR.grantedTalentsAtRender(sc2, CB).some((g2) => g2.origin === 'battle_scar'), 'V8 the one core no longer grants it');

// V9 the scar's stored pick. `smooth_talker` declares a per-talent pick (buyBattleScar takes any talents.json id)
const PT = 'smooth_talker';
const decl = Object.values(CB.talents).filter((t) => t.id === PT)[0];
const pickDecl = ['effects', 'pool_mods', 'told', 'item_effects', 'vehicle_effects', 'roll_numbers'].flatMap((k) => decl[k] || []).map((x) => x && x.pick).filter(Boolean)[0];
const pickId = pickDecl.id;
let p = ap(sheetOf(200), RS.buyBattleScar(sheetOf(200), REG, { tier: sevs[0].key, talent: PT }));
const pickVal = pickDecl.kind === 'option' ? pickDecl.options[0].id : 'charm';
const wrote = CR.pickWrite(p, CB, PT, '_talent', PT, pickId, pickVal);
check(!wrote.refused && wrote.talentChoices, 'V9 the fixture holds a stored pick on a scar\'s talent', wrote);
p = Object.assign(p, wrote);
r = RS.removeReward(p, p.rewards[0].id);
const after = ap(p, r);
check(!(after.talentChoices && after.talentChoices._talent && after.talentChoices._talent[PT]), 'V9 the last source gone: the stored pick is gone', after.talentChoices);
let rebought = ap(after, RS.buyBattleScar(after, REG, { tier: sevs[0].key, talent: PT }));
const live = CR.picksOf(rebought, CB, PT).filter((x) => x.pick.id === pickId)[0];
check(live && live.values.length === 0, 'V9 a re-bought scar asks its pick again', live);
let p2 = ap(p, RS.buyBattleScar(p, REG, { tier: sevs[0].key, talent: PT }));
r = RS.removeReward(p2, p2.rewards[0].id);
check(r.ok && !('talentChoices' in r.patch), 'V9 another scar on the talent: the pick stays', r.patch && Object.keys(r.patch));
const p3 = Object.assign(clone(p), { talents: [{ id: PT, rank: 1 }] });
r = RS.removeReward(p3, p3.rewards[0].id);
check(r.ok && !('talentChoices' in r.patch), 'V9 a tree rank of the talent: the pick stays', r.patch && Object.keys(r.patch));
const p4 = Object.assign(clone(p), { talentChoices: { _talent: { [PT]: wrote.talentChoices._talent[PT], other_talent: { x: 1 } } } });
r = RS.removeReward(p4, p4.rewards[0].id);
check(r.ok && r.patch.talentChoices && r.patch.talentChoices._talent.other_talent && !r.patch.talentChoices._talent[PT], 'V9 only that talent\'s pick goes', r.patch && r.patch.talentChoices);
const pGift = ap(sheetOf(200), RS.giveReward(sheetOf(200), REG, { key: 'BS', tier: sevs[0].key, talent: PT }));
const pGift2 = Object.assign(pGift, wrote);
r = RS.removeReward(pGift2, pGift2.rewards[0].id);
check(r.ok && r.refund === 0 && r.patch.talentChoices && !r.patch.talentChoices._talent && !('xp' in r.patch), 'V9 a given scar\'s pick goes too; no xp in its patch', r.patch);

done();
