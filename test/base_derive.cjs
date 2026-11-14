// test/base_derive.cjs — R6 lane D: S4's derived base numbers (lib/shared/baseDerive.js) against the printed rules,
// read through the shipped registry (public/data/canonical/bases.json). Card release-r6-backend-card §6 ACCEPTANCE:
// the ranch homestead (Survival, Far Horizons p.84) with one upgrade bought in credits and one in Obligation.
'use strict';
const path = require('path');
const D = require('../lib/shared/baseDerive.js');
const reg = require(path.join(__dirname, '..', 'public', 'data', 'canonical', 'bases.json'));

let fail = 0, n = 0;
function ok(c, msg) { n++; if (c) console.log('  ✓ ' + msg); else { fail++; console.log('  ✗ ' + msg); } }
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const ranch = {
  id: 'base-r1', type: 'HOMESTEAD', name: 'Hollow Ridge', place: 'Lothal', focus: 'BASERANCH', start: 'bought',
  upgrades: [{ key: 'HOMECORE', option: null, paid: 'credits' }, { key: 'HOMENPC', option: 'HOMENPC2', paid: 'obligation' }],
  notes: '',
};

console.log('G1 · the ranch (card §6 ACCEPTANCE)');
const ob = D.obligation(ranch, reg);
// FH p.82: basic 5 Obligation; the NPC Ally bought in Obligation adds its printed 1 (Table 3-4, p.83) to the SAME Obligation
ok(ob.total === 6, 'Obligation = 5 basic + 1 (NPC Ally paid in Obligation) = 6 — got ' + ob.total);
ok(eq(ob.parts.map(p => p.why + ':' + p.amount), ['basic:5', 'upgrade:1']), 'its parts: basic 5, upgrade 1');
const pr = D.profit(ranch, reg);
ok(pr.perMemberPerMonth === 100 && pr.purchases === 1, 'profit = 100 cr per member per month for one Increase Core Focus (FH p.83)');
ok(pr.rule && pr.rule.cite === 'Far Horizons p.82' && /GM may lower/.test(pr.rule.text), 'the profit line carries FH p.82\'s sidebar as told rule text (GM discretion, no number)');
ok(eq(D.careerSkills(ranch, reg).map(g => g.skill + '@' + g.because), ['survival@group-base:base-r1']), 'Survival is the granted career skill (FH p.84)');
const left = D.purchasesLeft(ranch, reg);
ok(left.HOMECORE.left === 4 && left.HOMENPC.left === 3 && left.HOMEINF.left === 1, 'purchases left: Core Focus 4, NPC Ally 3, Infirmary 1');
ok(eq(left.HOMENPC.options, ['HOMENPC1', 'HOMENPC3', 'HOMENPC4']), 'NPC Ally: the Doctor is picked, three left ("a different NPC each time")');

console.log('G2 · taken at creation in lieu of the ship: the basic cost is waived (FH p.82)');
const created = Object.assign({}, ranch, { start: 'creation' });
ok(D.obligation(created, reg).total === 1, 'Obligation = 0 + the upgrade\'s 1');

console.log('G3 · a business: 200 a purchase; Service takes its stored focusSkill only from its list');
const shop = { id: 'b2', type: 'BUSINESS', focus: 'BASESERVICE', focusSkill: 'xenology', start: 'bought',
  upgrades: [{ key: 'BUSCORE', paid: 'credits' }, { key: 'BUSCORE', paid: 'obligation' }, { key: 'BUSLIC', paid: 'credits' }] };
ok(D.profit(shop, reg).perMemberPerMonth === 400, 'two Increase Core Focus = 400 cr per member per month (FH p.85)');
ok(D.obligation(shop, reg).total === 7, 'Obligation = 5 + 2');
ok(eq(D.careerSkills(shop, reg).map(g => g.skill), ['xenology']), 'Service grants the chosen Knowledge skill');
ok(D.careerSkills(Object.assign({}, shop, { focusSkill: 'brawl' }), reg).length === 0, 'a focusSkill outside the list grants nothing (kept, inert)');
ok(D.purchasesLeft(shop, reg).BUSLIC.left === null, 'Specialized License: no printed cap → null');

console.log('G4 · a Rebel base: credits or rank, no Obligation; the Training Facility\'s skill (DA p.89)');
const rebel = { id: 'rb', type: 'REBELBASE', focus: 'BASETRAIN', start: 'creation',
  upgrades: [{ key: 'REBELTRAIN', option: 'warfare', paid: 'rank' }, { key: 'REBELMED', paid: 'obligation' }] };
ok(D.obligation(rebel, reg).total === 0, 'no Obligation (a paid:obligation entry on a type that pays none adds 0)');
ok(eq(D.careerSkills(rebel, reg).map(g => g.because), ['group-train:rb']), 'Training Facility: Knowledge (Warfare), tagged group-train');
ok(D.profit(rebel, reg).perMemberPerMonth === 0, 'no profit line');

console.log('G5 · union over a group\'s bases; foreign entries are kept and inert');
const two = D.groupCareerSkills([ranch, Object.assign({}, ranch, { id: 'base-r2' }), rebel], reg);
ok(eq(two.map(g => g.skill), ['survival', 'warfare']), 'Survival once (a grant owned twice counts once), then Warfare');
const odd = { id: 'x', type: 'HOMESTEAD', focus: 'BASESAFE', start: 'bought', upgrades: [{ key: 'CIVREFITHANG', paid: 'obligation' }] };
ok(D.careerSkills(odd, reg).length === 0 && D.obligation(odd, reg).total === 5, 'a focus or upgrade from another type derives nothing');
ok(eq(D.groupCareerSkills([], reg), []) && D.obligation(null, reg).total === 0, 'no base → nothing');

console.log('G6 · a civilian facility: refits taken by rank are concealed (FO p.75)');
const civ = { id: 'c', type: 'CIVREFIT', start: 'story', upgrades: [{ key: 'CIVREFITHANG', paid: 'rank' }, { key: 'CIVREFITINFIRM', paid: 'credits' }] };
ok(D.unconcealed(civ, reg) === 1, 'one unconcealed refit');
const civ2 = Object.assign({}, civ, { upgrades: civ.upgrades.concat([{ key: 'CIVREFITCONCEAL', paid: 'credits' }]) });
ok(D.unconcealed(civ2, reg) === 1, 'Concealed Upgrades (1,000 cr, D-373) is not itself counted as an unconcealed refit');
ok(reg.upgrades.CIVREFITCONCEAL.credits === 1000 && reg.upgrades.CIVREFITCONCEAL.decision === 'D-373', 'its price is D-373\'s 1,000 credits');

console.log(`\n${n - fail}/${n} passed`);
process.exit(fail ? 1 : 0);
