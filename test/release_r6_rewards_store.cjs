#!/usr/bin/env node
/**
 * release_r6_rewards_store.cjs — lib/shared/rewardsStore.js, the one writer of `sheetData.rewards` and `sheetData.contacts`
 * (card `release-r6-backend` §5, lane C; release-r4-shapes S2 + ADDENDUM 4, S3; ruling `release-r6-rewards-c0`).
 *
 *   S1  normalizers: the `keep` idiom (an unknown field rides through), S2/S3's fields only otherwise; a keyless reward and a
 *       non-object are dropped; ratings clamp to 1..5; `improvement` is written on MAKERSMARK alone.
 *   S2  THE ONE XP LEDGER: Ally Grateful → Indebted pays 5 then 10; the row's `xp` sums to 15, its `tier` is replaced, and
 *       the patch's `xp` moves spent +15 / remaining −15 exactly as the growth room's buyers do. A buy the XP cannot
 *       cover is refused and returns no patch. The top tier is refused.
 *   S3  HONTITLE: the kind is DERIVED from the row's two skills (R-R6RC-2); a title with no kind's pair is refused.
 *   S4  Battle Scar: the severity's price (Average 15, D-280 (3)), any talents.json id; REP: `tier` follows `level`.
 *   S5  contacts (Endless Vigil pp.77–79): new 10 XP on a career Knowledge skill, 15 on a non-career one; raising Scope to 2
 *       costs 10 (+5 non-career); 5 is the top; the pool of Scope 3 / Expertise 2 is two yellow and one green, from
 *       diceEngine.buildPool; the prominent award's ratings (ranks − 1, ranks − 2, minimum 1).
 *   S6  an Ally's pool from its tier, a School's part folded in (Local Gym: one boost), from buildPool.
 *   S7  rider 4: no writer reads `max_shown` (grep of the module's code, comments stripped); and the patch's only XP
 *       write is `charge` (one ledger), with `moveBack` its one reverse (B-1533).
 *   S8  resolve at render: a stored row holds only S2's fields (no words, no dice, no price, no kind).
 *   S9  removal (B-1533; the full cases are test/b1533_reward_remove.cjs): the patch names only the ruled keys, and a buy then
 *       a remove leaves the ledger and the row list where they began.
 *
 * Run: node test/release_r6_rewards_store.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RS = require(path.join(ROOT, 'lib/shared/rewardsStore.js'));
const REG = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical/rewards.json'), 'utf8'));
const reg = (s) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', s + '.json'), 'utf8'))[s];
const CB = { species: reg('species'), careers: reg('careers'), specializations: reg('specializations'), talents: reg('talents') };
CB.skillSheetKeys = {};
const BASE = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/native/creator_human_smuggler.json'), 'utf8'));

let failures = 0;
function check(ok, msg, detail) {
  if (ok) console.log('  PASS  ' + msg);
  else { failures += 1; console.log('  FAIL  ' + msg + (detail !== undefined ? '  — ' + JSON.stringify(detail).slice(0, 300) : '')); }
}
const clone = (v) => JSON.parse(JSON.stringify(v));
const S2 = ['id', 'key', 'tier', 'name', 'level', 'skills', 'xp', 'talent'];
const sheetWith = (xp, extra) => Object.assign(clone(BASE), { xp: { total: xp, spent: 0, remaining: xp }, rewards: [], contacts: [] }, extra || {});

// S1
const r1 = RS.normalizeReward({ id: 'rwd-a', key: 'ALLY', tier: 'ALLYAB1OP1', name: 'Dex', xp: '5', future: { x: 1 } });
check(r1 && r1.future && r1.future.x === 1 && r1.xp === 5 && Array.isArray(r1.skills) && r1.level === null && r1.talent === null,
  'S1: a reward keeps an unknown field and fills S2\'s fields', r1);
check(RS.normalizeRewards([{ name: 'no key' }, null, 'x', { key: 'ACE', name: 'Ace' }]).length === 1, 'S1: a keyless row and non-objects are dropped');
check(RS.normalizeReward({ key: 'MAKERSMARK', improvement: 'armor_lessons_learned' }).improvement === 'armor_lessons_learned'
  && !('improvement' in RS.normalizeReward({ key: 'ALLY' })), 'S1: `improvement` is written on MAKERSMARK alone');
check(RS.normalizeReward({ key: 'ALLY', improvement: 'x' }).improvement === 'x', 'S1: a stray improvement on another key is kept as stored');
const c1 = RS.normalizeContact({ name: 'N', skill: 'underworld', scope: 9, expertise: 0, colour: 'red' });
check(c1.scope === 5 && c1.expertise === 1 && c1.colour === 'red', 'S1: ratings clamp to 1..5; an unknown field rides through', c1);

// S2
let sh = sheetWith(40);
const a1 = RS.buyRewardTier(sh, REG, { key: 'ALLY', name: 'Dex Tarrow' });
check(a1.ok && a1.row.tier === 'ALLYAB1OP1' && a1.row.xp === 5 && a1.patch.xp.spent === 5 && a1.patch.xp.remaining === 35,
  'S2: Grateful Ally costs 5 through the ledger', a1);
sh = Object.assign(clone(sh), a1.patch);
const a2 = RS.buyRewardTier(sh, REG, { rowId: a1.row.id });
check(a2.ok && a2.row.tier === 'ALLYAB1OP2' && a2.row.xp === 15 && a2.patch.xp.spent === 15 && a2.patch.xp.remaining === 25
  && a2.patch.rewards.length === 1, 'S2: Indebted replaces Grateful; the row\'s xp sums 5 + 10 = 15; spent 15, remaining 25', a2);
sh = Object.assign(clone(sh), a2.patch);
const a3 = RS.buyRewardTier(sh, REG, { rowId: a1.row.id });
sh = Object.assign(clone(sh), a3.patch);
check(RS.buyRewardTier(sh, REG, { rowId: a1.row.id }).ok === false, 'S2: past Loyal, the buy is refused');
const poor = sheetWith(4);
const pr = RS.buyRewardTier(poor, REG, { key: 'FOLLOWER' });
check(pr.ok === false && !pr.patch && /not enough XP/.test(pr.reason), 'S2: a buy the XP cannot cover is refused with no patch', pr);
check(RS.buyRewardTier(sheetWith(40), REG, { key: 'MEDALS' }).ok === false, 'S2: an honour is not bought with XP');
const before = sheetWith(40), snap = JSON.stringify(before);
RS.buyRewardTier(before, REG, { key: 'ALLY' });
check(JSON.stringify(before) === snap, 'S2: pure — the sheet handed in is not written');

// S3
const t1 = RS.buyRewardTier(sheetWith(40), REG, { key: 'HONTITLE', name: 'Champion of Teth', skills: ['deception', 'charm'] });
check(t1.ok && RS.titleKindOf(REG, t1.row).key === 'CLASSTITLEAB1OP2' && !('kind' in t1.row), 'S3: Charm + Deception derives Championship; no kind stored', t1.row);
check(RS.buyRewardTier(sheetWith(40), REG, { key: 'HONTITLE', skills: ['charm', 'coercion'] }).ok === false, 'S3: a pair that names no kind is refused');

// S4
const b1 = RS.buyBattleScar(sheetWith(40), REG, { tier: 'BSAB1OP2', talent: 'grit', name: 'Blaster burn' });
check(b1.ok && b1.row.xp === 15 && b1.patch.xp.spent === 15 && b1.row.talent === 'grit', 'S4: an Average scar\'s talent costs 15', b1.row);
check(RS.buyBattleScar(sheetWith(40), REG, { tier: 'BSAB1OP1', talent: 'quick_draw' }).ok, 'S4: any talent may be a scar (FiB p.95), not only the suggested 21');
const g1 = RS.giveReward(sheetWith(0), REG, { key: 'REP', name: 'Mos Eisley', level: 2 });
check(g1.ok && g1.row.level === 2 && g1.row.tier === 'REPAB1OP2' && g1.row.xp === 0 && !g1.patch.xp, 'S4: a given Reputation: level 2 = REPAB1OP2, no XP', g1.row);
const g2 = RS.setReputation(Object.assign(sheetWith(0), g1.patch), REG, g1.row.id, -1);
check(g2.ok && g2.row.level === -1 && g2.row.tier === 'REPAB1OP5', 'S4: setReputation moves tier with level', g2.row);
check(RS.giveReward(sheetWith(0), REG, { key: 'REP', level: 4 }).ok === false, 'S4: a level outside -3..3 is refused');

// S5
const isCareer = (skill) => RS.contactPrice(sheetWith(0), CB, skill, null) === 10;
const careerK = ['underworld', 'core_worlds', 'outer_rim', 'education', 'lore', 'xenology', 'warfare'].find(isCareer);
const otherK = ['underworld', 'core_worlds', 'outer_rim', 'education', 'lore', 'xenology', 'warfare'].find((k) => !isCareer(k));
check(careerK && otherK, 'S5 fixture: the Smuggler fixture has a career and a non-career Knowledge skill', { careerK, otherK });
const n1 = RS.buyContact(sheetWith(60), CB, { name: 'Coruscant Underworld', skill: careerK });
check(n1.ok && n1.cost === 10 && n1.row.scope === 1 && n1.row.expertise === 1 && n1.patch.xp.spent === 10, 'S5: a new network on a career skill is 10 XP, at 1/1', n1.row);
const n2 = RS.buyContact(sheetWith(60), CB, { name: 'Far', skill: otherK });
check(n2.ok && n2.cost === 15, 'S5: on a non-career Knowledge skill, 15 XP', n2.cost);
const up = RS.raiseContact(Object.assign(sheetWith(60), { xp: n1.patch.xp, contacts: n1.patch.contacts }), CB, n1.row.id, 'scope');
check(up.ok && up.cost === 10 && up.row.scope === 2 && up.row.xp === 20 && up.patch.xp.spent === 20, 'S5: Scope 1 → 2 costs 5 × 2 = 10', up);
const top = { contacts: [{ id: 'cnt-t', name: 'T', skill: careerK, scope: 5, expertise: 5, xp: 0 }], xp: { total: 99, spent: 0, remaining: 99 } };
check(RS.raiseContact(Object.assign(sheetWith(0), top), CB, 'cnt-t', 'expertise').ok === false, 'S5: 5 is the top rating');
const pool = RS.contactPool({ name: 'x', skill: 'underworld', scope: 3, expertise: 2 });
check(pool.proficiency === 2 && pool.ability === 1, 'S5: Scope 3, Expertise 2 builds two yellow and one green (buildPool)', pool);
check(JSON.stringify(RS.prominentRatings(4, false)) === '{"scope":2,"expertise":3}' && JSON.stringify(RS.prominentRatings(1, true)) === '{"scope":1,"expertise":1}',
  'S5: the prominent award: ranks 4 → 2 and 3 (EV p.78\'s own example); minimum 1');

// S6
let s6 = sheetWith(40);
const al = RS.buyRewardTier(s6, REG, { key: 'ALLY', name: 'Dex' }); s6 = Object.assign(s6, al.patch);
const al2 = RS.buyRewardTier(s6, REG, { rowId: al.row.id }); s6 = Object.assign(s6, al2.patch);
const p0 = RS.rewardPool(REG, s6, al.row.id);
check(p0 && p0.pool.ability === 2 && p0.pool.proficiency === 1 && p0.pool.boost === 0 && p0.per === 'session', 'S6: an Indebted Ally rolls two green and one yellow', p0);
const sc = RS.buyRewardTier(s6, REG, { key: 'SCHOOL', name: 'Gym' }); s6 = Object.assign(s6, sc.patch);
const p1 = RS.rewardPool(REG, s6, al.row.id);
check(p1 && p1.pool.boost === 1 && p1.pool.ability === 2 && p1.pool.proficiency === 1, 'S6: with a Local Gym, one boost die more (KoF p.95)', p1);

// S7
const code = fs.readFileSync(path.join(ROOT, 'lib/shared/rewardsStore.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
check(!/max_shown/.test(code), 'S7 (rider 4): no code in the writer reads max_shown');
check((code.match(/xp: c\.xp/g) || []).length === 4 && !/\.xp\s*=[^=]/.test(code), 'S7: every XP write is the one charge() patch (four buyers: tier, scar, new network, raise), no other assignment');

// S8
const stored = [a3.patch.rewards[0], t1.row, b1.row, g1.row];
const extra = stored.map((r) => Object.keys(r).filter((k) => S2.indexOf(k) === -1)).filter((x) => x.length);
check(extra.length === 0, 'S8: stored reward rows hold only S2\'s fields', extra);
check(Object.keys(n1.row).sort().join() === 'expertise,id,name,scope,skill,xp', 'S8: a stored network holds only S3\'s fields', Object.keys(n1.row));

// S9
const s9 = sheetWith(40);
const s9buy = RS.buyRewardTier(s9, REG, { key: 'ALLY', name: 'Dex' });
const s9had = Object.assign(clone(s9), s9buy.patch);
const s9rm = RS.removeReward(s9had, s9buy.row.id);
check(s9rm.ok && s9rm.refund === 5 && s9rm.patch.rewards.length === 0 && s9rm.patch.xp.spent === 0 && s9rm.patch.xp.remaining === 40 && s9rm.patch.xp.total === 40,
  'S9: buy then remove returns the ledger and the row list to where they began', s9rm);
check(Object.keys(s9rm.patch).sort().join() === 'rewards,xp', 'S9: a Reward\'s remove patches rewards and xp', Object.keys(s9rm.patch));
const s9c = RS.buyContact(s9, CB, { skill: 'underworld', name: 'N' });
const s9chad = Object.assign(clone(s9), s9c.patch);
const s9crm = RS.removeContact(s9chad, s9c.row.id);
check(s9crm.ok && s9crm.refund === s9c.cost && s9crm.patch.xp.remaining === 40 && s9crm.patch.contacts.length === 0, 'S9: a network\'s remove returns its price', s9crm);
check(Object.keys(s9crm.patch).sort().join() === 'contacts,xp', 'S9: a network\'s remove patches contacts and xp', Object.keys(s9crm.patch));

console.log(failures ? '\n' + failures + ' FAILED' : '\nall passed');
process.exit(failures ? 1 : 0);
