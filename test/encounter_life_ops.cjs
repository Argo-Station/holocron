/**
 * Guard — the encounter's life, one section per store op (ENCOUNTERS E3 lap A, card `encounters-e3-plumbing` §4
 * ACCEPTANCE 3; shape `encounters-e2-manager-shape` §3, §4.3, §10).
 *
 * Sections, each named in its PASS/FAIL lines so a bite reads which op it caught:
 *   [START] [NEXT] [BACK] [ROUND] [CLAIM] [SLOTS] [PAUSE] [END] [REOPEN] [TIMER] [CRIT] [DESTINY] [DELETE] [HEAL] [NEVER]
 * Rolls are made deterministic by the injected roller (`ctx.roll`) and die (`d100`); a `char:` PC's pool by a stand-in
 * for `SWRPGSheetPool` that records its calls, so the guard proves the pool is ASKED of the one path, not built here.
 *
 * ENCOUNTER_LIB_ROOT (optional) points the guard at a COPY of lib/ (the bite runs mutate the copy).
 * Run: node test/encounter_life_ops.cjs   — exit 0 green, 1 red.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const LIB = process.env.ENCOUNTER_LIB_ROOT ? path.resolve(process.env.ENCOUNTER_LIB_ROOT) : path.join(ROOT, 'lib');
const B = require(path.join(LIB, 'library/npc/benchStore.js'));
const E = require(path.join(LIB, 'library/npc/encounterLife.js'));
const R = require(path.join(LIB, 'shared/roomState.js'));

let fail = 0, section = '';
const sec = (name) => { section = name; console.log('[' + name + ']'); };
const check = (label, cond, detail) => {
  if (cond) console.log('  PASS  [' + section + '] ' + label);
  else { fail++; console.log('  FAIL  [' + section + '] ' + label + (detail !== undefined ? '  -> ' + JSON.stringify(detail) : '')); }
};
const J = (v) => JSON.stringify(v);

const NPCS = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical/npcs.json'), 'utf8')).npcs;
const CRIT_ROWS = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical/crit_tables.json'), 'utf8')).character.rows;
const resolve = (k) => NPCS[k] || null;
const tierOf = (m) => (m.kind === 'pc' ? null : (resolve(m._source_key) || {}).tier);
const CHARS = { abc: { id: 'abc', sheetData: { name: 'Kira' } } };
const spCalls = [];
const sheetPool = { charPool: (rec, skill, up) => { spCalls.push([rec && rec.id, skill, up]); return { proficiency: 1, ability: 2, boost: 0, setback: 0 }; } };
const ctxWith = (results, extra) => {
  let i = 0;
  return Object.assign({ resolve, charRecord: (id) => CHARS[id] || null, sheetPool, roll: () => results[i++] }, extra || {});
};

// ── the encounter: a rival, a minion line ×3, a char: PC, a name: PC, a nemesis aboard a craft ──────────────────────
let bench = B.emptyState();
let made = B.createGroup(bench, 'Bay 94'); bench = made.state; const gid = made.id;
bench = B.addMember(bench, gid, '000');                       // rival — Presence 2, Cool 4, Willpower 3, Vigilance 4
bench = B.addMember(bench, gid, 'bardottan_palace_guard');    // minion — Presence 2, group Cool, WT 8
bench = B.addPcMember(bench, gid, 'char:abc');
bench = B.addPcMember(bench, gid, 'name:Rook');
bench = B.addMember(bench, gid, '4lom');                      // nemesis
const ids = bench.groups[0].members.map((m) => m.id);
const [RIV, MIN, PCA, PCN, NEM] = ids;
bench = B.setMember(bench, gid, MIN, { count: 3 });
bench = B.addVehicle(bench, gid, 'tie_fighter');
bench = B.setMemberVehicle(bench, gid, NEM, bench.groups[0].vehicles[0].id, true);
let other = B.createGroup(bench, 'Second fight'); bench = other.state; const gid2 = other.id;
bench = B.addMember(bench, gid2, '000');
let room = R.write(Object.assign(R.emptyState(), { destiny: { light: 2, dark: 1 } }), null);

// ── START ───────────────────────────────────────────────────────────────────────────────────────────────────────
sec('START');
const results = [{ success: 1, advantage: 0 }, { success: 2, advantage: 1 }, { success: 1, advantage: 0 }, { success: 0, advantage: 3 }];
const prop = E.proposeStart(bench, gid, ctxWith(results, { skills: { [NEM]: 'vigilance' } }));
check('one proposed slot per combatant (rival, minion LINE, two PCs, a crewed nemesis — the craft takes none)', prop.slots.length === 5, prop.slots.length);
const bySlot = {}; prop.slots.forEach((s) => { bySlot[s.memberId] = s; });
check('the rival\'s Cool pool from the dice core: Presence 2 / Cool 4 → 2 proficiency + 2 ability', J(bySlot[RIV].pool) === J({ proficiency: 2, ability: 2, boost: 0, setback: 0 }), bySlot[RIV].pool);
check('a minion LINE of 3 rolls group Cool at (standing − 1) = 2 ranks: Presence 2 → 2 proficiency', J(bySlot[MIN].pool) === J({ proficiency: 2, ability: 0, boost: 0, setback: 0 }), bySlot[MIN].pool);
check('the nemesis rolls Vigilance (Willpower) when the GM picks it', bySlot[NEM].skill === 'vigilance' && bySlot[NEM].pool && bySlot[NEM].pool.proficiency + bySlot[NEM].pool.ability === Math.max(NPCS['4lom'].characteristics.willpower, (NPCS['4lom'].skills.find((s) => s.skill_ref === 'vigilance') || { rank: 0 }).rank));
check("a char: PC's pool is ASKED of the sheet pool path (charPool(record, 'cool', 0))", J(spCalls) === J([['abc', 'cool', 0]]) && bySlot[PCA].pool.ability === 2, spCalls);
check('a name: PC has no pool and no roll (the table types it)', bySlot[PCN].pool === null && bySlot[PCN].result === null);
const sideOrder = prop.slots.map((s) => s.memberId);
check('sorted by successes, then Advantage, then PC first; an unrolled slot last', J(sideOrder) === J([MIN, PCA, RIV, NEM, PCN]), sideOrder.map((id) => ids.indexOf(id)));
const tie = E.sortSlots([{ side: 'npc', result: { success: 1, advantage: 1 } }, { side: 'pc', result: { success: 1, advantage: 1 } }]);
check('a full tie goes to the PC', tie[0].side === 'pc');
let r = E.start(bench, room, gid, prop.slots);
check('START: the group is running', r.refused === null && r.bench.groups[0].state === 'running');
check('START: the order is sides only — round 1, active 0, every slot unclaimed', J(R.normalize(r.room).initiative) === J({ round: 1, slots: prop.slots.map((s) => ({ side: s.side, benchMemberId: null })), active: 0 }));
check('START: no roll result reaches either store', !/success|advantage|proficiency/.test(J(r.room) + J(B.normalize(r.bench))));
check('START: Destiny is untouched', J(R.normalize(r.room).destiny) === J({ light: 2, dark: 1 }));
const r2 = E.start(r.bench, r.room, gid2, [{ side: 'npc' }]);
check('START of a second encounter while one runs is refused, naming the running one', r2.refused === 'another-running' && r2.runningId === gid && r2.bench === r.bench);
bench = r.bench; room = r.room;
check('the table write round-trips the store\'s own edge (roomState.write → read)', (() => { const st = { _: {}, getItem(k) { return this._[k] || null; }, setItem(k, v) { this._[k] = v; } }; R.write(room, st); return J(R.read(st)) === J(R.normalize(room)); })());

// ── CLAIM ───────────────────────────────────────────────────────────────────────────────────────────────────────
sec('CLAIM');
// order: [npc MIN, pc PCA, npc RIV, npc NEM, pc PCN]
let c0 = E.candidates(bench, room, 0);
check('an NPC slot offers the NPC members, none acted yet', J(c0.fresh) === J([RIV, MIN, NEM]) && c0.acted.length === 0, c0);
room = E.claim(room, 0, MIN);
check('a claim fills the slot for this round', R.normalize(room).initiative.slots[0].benchMemberId === MIN);
const c2 = E.candidates(bench, room, 2);
check('a later NPC slot lists the acted member last, still claimable', J(c2.fresh) === J([RIV, NEM]) && J(c2.acted) === J([MIN]), c2);
check('a PC slot offers the PC members', J(E.candidates(bench, room, 1).fresh) === J([PCA, PCN]));
const stale = E.claim(room, 3, 'gone-member');
const view = E.slotView(bench, stale);
check('a stale slot id (not a member of the running group) reads as unfilled, id kept', view[3].member === null && view[3].benchMemberId === 'gone-member' && view[0].member && view[0].member.id === MIN);

// ── NEXT ───────────────────────────────────────────────────────────────────────────────────────────────────────
sec('NEXT');
let nx = E.next(room);
check('NEXT advances active by one', R.normalize(nx.room).initiative.active === 1 && R.normalize(nx.room).initiative.round === 1);
check('NEXT names the turn that ended (round, slot, its claim)', J(nx.ended) === J({ round: 1, index: 0, benchMemberId: MIN }));
check('NEXT keeps the claims inside the round', R.normalize(nx.room).initiative.slots[0].benchMemberId === MIN);
room = nx.room;

// ── BACK ───────────────────────────────────────────────────────────────────────────────────────────────────────
sec('BACK');
const bk = E.back(room);
check('BACK steps active down; nothing else moves', R.normalize(bk).initiative.active === 0 && J(R.normalize(bk).initiative.slots) === J(R.normalize(room).initiative.slots));
check('BACK at the first slot does nothing', J(E.back(bk)) === J(bk));
const deep = E.next(E.next(room).room).room;   // active 3
check('BACK from slot 3 lands on slot 2, not the start', R.normalize(E.back(deep)).initiative.active === 2);

// ── ROUND ──────────────────────────────────────────────────────────────────────────────────────────────────────
sec('ROUND');
room = E.claim(room, 1, PCA);
for (let i = 0; i < 3; i++) room = E.next(room).room;           // active 1 → 4 (the last slot)
check('the last slot is active before the turn', R.normalize(room).initiative.active === 4);
const turn = E.next(room);
const ti = R.normalize(turn.room).initiative;
check('past the last slot: round + 1, active 0', ti.round === 2 && ti.active === 0);
check('the round turn clears every claim (draw without replacement within a round)', ti.slots.every((s) => s.benchMemberId === null));
check('the order itself (its sides) repeats', J(ti.slots.map((s) => s.side)) === J(['npc', 'pc', 'npc', 'npc', 'pc']));
check('BACK never un-turns the round', R.normalize(E.back(turn.room)).initiative.round === 2);
room = turn.room;

// ── SLOTS (ADD / REMOVE) ───────────────────────────────────────────────────────────────────────────────────────
sec('SLOTS');
let added = E.addSlot(room, 'npc');
check('ADD appends one unclaimed slot at the very end', R.normalize(added).initiative.slots.length === 6 && J(R.normalize(added).initiative.slots[5]) === J({ side: 'npc', benchMemberId: null }));
check('ADD of a side that is not pc|npc does nothing', J(E.addSlot(room, 'vehicle')) === J(room));
let rm = E.claim(added, 2, RIV);
rm = E.next(E.next(E.next(rm).room).room).room;                  // active 3
rm = E.removeSlot(rm, 2);
const ri = R.normalize(rm).initiative;
check('REMOVE takes the slot and its claim with it', ri.slots.length === 5 && !ri.slots.some((s) => s.benchMemberId === RIV));
check('REMOVE before the active slot keeps the same slot acting', ri.active === 2);
check('REMOVE of the last slot while it is active clamps active to the new end', R.normalize(E.removeSlot(E.next(E.next(rm).room).room, 4)).initiative.active === 3);

// ── TIMER (and its ENDS proposal) ──────────────────────────────────────────────────────────────────────────────
sec('TIMER');
// round 2: the rival claims slot 0 and is staggered during its own turn
room = E.claim(room, 0, RIV);
bench = B.setMember(bench, gid, RIV, { conditions: ['staggered'] });
bench = E.noteCondition(bench, room, gid, RIV, 'staggered');
check('a chip set during the running fight records its clock (round, active)', J(B.getMember(bench, gid, RIV).timers) === J([{ condition: 'staggered', round: 2, active: 0 }]));
check('the clock is the slot acting when the chip is set (here slot 3)', B.getMember(E.noteCondition(bench, E.next(E.next(E.next(room).room).room).room, gid, MIN, 'disoriented'), gid, MIN).timers[0].active === 3);
check('a chip set outside the running fight records nothing', J(E.noteCondition(bench, room, gid2, ids[0], 'x')) === J(bench));
let t1 = E.next(room);
check('the turn the chip was set in is not "the next turn": no ENDS', E.endsProposals(bench, gid, t1.ended).length === 0);
room = t1.room;
for (let i = 0; i < 4; i++) room = E.next(room).room;           // into round 3
room = E.claim(room, 0, RIV);
const t2 = E.next(room);
check("at the end of the member's NEXT turn the manager proposes ENDS", J(E.endsProposals(bench, gid, t2.ended)) === J([{ memberId: RIV, condition: 'staggered' }]));
check('another member\'s turn ending proposes nothing for it', E.endsProposals(bench, gid, { round: 3, index: 0, benchMemberId: MIN }).length === 0);
check('the proposal is data: the chip is still set', J(B.getMember(bench, gid, RIV).conditions) === J(['staggered']));
const kept = B.dropTimer(bench, gid, RIV, 'staggered');
check('KEEP forgets the clock and keeps the chip', !B.getMember(kept, gid, RIV).timers && J(B.getMember(kept, gid, RIV).conditions) === J(['staggered']));
const gone = B.setMember(bench, gid, RIV, { conditions: [] });
check('a cleared chip is never proposed', E.endsProposals(gone, gid, t2.ended).length === 0);
room = t2.room;

// ── CRIT ───────────────────────────────────────────────────────────────────────────────────────────────────────
sec('CRIT');
const riv = () => B.getMember(bench, gid, RIV);
let cr = E.rollCrit(riv(), 'rival', CRIT_ROWS, 40);
check('no crits held: the total is the die (40) and the row is lit by range', cr.roll === 40 && cr.row && cr.row[0] === '36-40', cr);
bench = E.takeCrit(bench, room, gid, RIV, 'rival', cr.roll);
check('TAKE persists the id-ref {roll, at} — never the effect text', J(riv().crits) === J([{ roll: 40, at: 3 }]));
bench = E.takeCrit(bench, room, gid, RIV, 'rival', 77, 'Hamstrung (typed)');
cr = E.rollCrit(riv(), 'rival', CRIT_ROWS, 40);
check('+10 per crit already held: 40 with two held → 60', cr.roll === 60 && cr.row[0] === '56-60', cr);
check('a total past 150 reads the open-ended row (100 + 20 → 116-120; 160 → 151+)', E.rollCrit(riv(), 'rival', CRIT_ROWS, 100).row[0] === '116-120' && E.critRowOf(CRIT_ROWS, 160)[0] === '151+');
check('a typed crit keeps its label', riv().crits[1].label === 'Hamstrung (typed)');
check('a minion line never rolls or takes a crit', E.rollCrit(B.getMember(bench, gid, MIN), 'minion', CRIT_ROWS, 40) === null && J(E.takeCrit(bench, room, gid, MIN, 'minion', 40)) === J(bench));
check("a PC member's crits are its sheet's: none here", E.rollCrit(B.getMember(bench, gid, PCA), null, CRIT_ROWS, 40) === null && J(B.addCrit(bench, gid, PCA, { roll: 40 }, 'rival')) === J(bench));
check('a nemesis takes crits as a rival does', B.getMember(E.takeCrit(bench, room, gid, NEM, tierOf(B.getMember(bench, gid, NEM)), 12), gid, NEM).crits.length === 1);
check('the GM removing a crit is the only way one leaves', B.getMember(B.removeCrit(bench, gid, RIV, 0), gid, RIV).crits.length === 1);

// ── DESTINY ────────────────────────────────────────────────────────────────────────────────────────────────────
sec('DESTINY');
let fl = E.flipDestiny(room, 'light');
check('a light flip (a player spent) moves one point light → dark', fl.refused === null && J(R.normalize(fl.room).destiny) === J({ light: 1, dark: 2 }));
fl = E.flipDestiny(fl.room, 'dark');
check('a dark flip (the GM spent) moves it back', J(R.normalize(fl.room).destiny) === J({ light: 2, dark: 1 }));
const empty = E.setDestiny(room, 0, 3);
check('SET writes the session\'s counts', J(empty.destiny) === J({ light: 0, dark: 3 }));
const nope = E.flipDestiny(empty, 'light');
check('a flip from an empty side is refused, the pool unchanged', nope.refused === 'destiny_pool_empty' && J(nope.room) === J(empty));
check('SET leaves the order alone', J(empty.initiative) === J(R.normalize(room).initiative));

// ── PAUSE ──────────────────────────────────────────────────────────────────────────────────────────────────────
sec('PAUSE');
bench = B.setMember(bench, gid, MIN, { poolWounds: 9 });
const pz = E.pause(bench, room, gid);
check('PAUSE: the group back to prepped', pz.refused === null && pz.bench.groups[0].state === 'prepped');
check('PAUSE: every wound, pool, condition and crit kept', J(pz.bench.groups[0].members) === J(bench.groups[0].members));
check('PAUSE: the table order cleared', J(R.normalize(pz.room).initiative) === J({ round: 0, slots: [], active: 0 }));
check('PAUSE of an encounter that is not running is refused', E.pause(pz.bench, pz.room, gid).refused === 'not-running');
const resumed = E.start(pz.bench, pz.room, gid, E.proposeStart(pz.bench, gid, ctxWith(results.concat(results))).slots);
check('a paused encounter resumes with a fresh START (round 1)', resumed.refused === null && R.normalize(resumed.room).initiative.round === 1);

// ── END ────────────────────────────────────────────────────────────────────────────────────────────────────────
sec('END');
const en = E.end(bench, room, gid);
check('END: state done, rounds = the table\'s round (3)', en.refused === null && en.bench.groups[0].state === 'done' && en.bench.groups[0].rounds === 3);
check('END: the order cleared to {round: 0, slots: [], active: 0}', J(R.normalize(en.room).initiative) === J(E.EMPTY_ORDER) && J(E.EMPTY_ORDER) === J({ round: 0, slots: [], active: 0 }));
check('END: Destiny untouched', J(R.normalize(en.room).destiny) === J(R.normalize(room).destiny));
check('END: every member\'s paper kept', J(en.bench.groups[0].members) === J(bench.groups[0].members));
const sm = E.summary(en.bench, gid);
check("END's summary is derived data (rounds, members, crits by roll) plus the book's recovery lines, cited", sm.rounds === 3 && sm.members.length === 5 && J(sm.members.find((m) => m.id === RIV).crits) === J([40, 77]) && sm.recovery.length === 3 && sm.recovery.every((l) => /^eote p\.2(19|20)$/.test(l.cite)));
check('the summary is never stored: the bench carries no summary text', !/recovery|summary/.test(J(B.normalize(en.bench))));
check('END of an encounter that is not running is refused', E.end(en.bench, en.room, gid).refused === 'not-running');

// ── REOPEN ─────────────────────────────────────────────────────────────────────────────────────────────────────
sec('REOPEN');
const ro = E.reopen(en.bench, gid);
check('REOPEN: done → prepped, the paper intact', ro.groups[0].state === 'prepped' && J(ro.groups[0].members) === J(en.bench.groups[0].members));
check('REOPEN of an encounter that is not done does nothing', E.reopen(ro, gid) === ro);
check('a done encounter cannot START without REOPEN', E.start(en.bench, en.room, gid, prop.slots).refused === 'not-prepped');

// ── HEAL (HEAL & REPAIR ALL, R-E3P-1) ──────────────────────────────────────────────────────────────────────────
sec('HEAL');
let hb = B.setMember(bench, gid, RIV, { currentWounds: 6, currentStrain: 3 });
hb = E.noteCondition(hb, room, gid, RIV, 'staggered');
const pv = E.resetPreview(hb, gid);
check('the confirm\'s preview names what clears and that crits stay', pv.clears.wounds === 1 && pv.clears.timers === 1 && pv.keeps.crits === 2, pv);
const healed = E.healAndRepairAll(hb, gid);
const hr = B.getMember(healed, gid, RIV);
check('wounds, strain, conditions, pools cleared', hr.currentWounds === 0 && hr.currentStrain === 0 && hr.conditions.length === 0 && B.getMember(healed, gid, MIN).poolWounds === 0);
check('timers cleared (a timer without its chip means nothing)', !hr.timers);
check('crits KEPT (an injury lasts until treated, EotE p.216–218)', J(hr.crits) === J(B.getMember(hb, gid, RIV).crits) && hr.crits.length === 2);

// ── DELETE ─────────────────────────────────────────────────────────────────────────────────────────────────────
sec('DELETE');
const dp = E.deletePreview(bench, gid);
check('the confirm\'s preview names the encounter, its members, and that it is running', dp.name === 'Bay 94' && dp.members === 5 && dp.running === true);
const del = E.deleteEncounter(bench, room, gid);
check('DELETE removes the encounter', !del.bench.groups.some((g) => g.id === gid) && del.bench.groups.length === 1);
check('deleting the running encounter clears the table\'s order', J(R.normalize(del.room).initiative) === J(E.EMPTY_ORDER));
const delOther = E.deleteEncounter(bench, room, gid2);
check('deleting another encounter leaves the order alone', J(delOther.room) === J(room));

// ── NEVER (§10's "never" column, at the store) ─────────────────────────────────────────────────────────────────
sec('NEVER');
const pcW = B.setMember(bench, gid, PCA, { currentWounds: 7, currentStrain: 4, notes: 'ok' });
check("no op writes a PC member's wounds or strain (setMember ignores them)", B.getMember(pcW, gid, PCA).currentWounds === 0 && B.getMember(pcW, gid, PCA).currentStrain === 0 && B.getMember(pcW, gid, PCA).notes === 'ok');
const pcR = B.resetGroup(Object.assign(B.normalize(bench), {}), gid);
check("HEAL & REPAIR ALL does not write a PC member's wounds or strain either", B.getMember(pcR, gid, PCA).currentWounds === 0);
const src = (f) => fs.readFileSync(path.join(LIB, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const lifeSrc = src('library/npc/encounterLife.js'), benchSrc = src('library/npc/benchStore.js');
check('nothing writes campaignId (only normalize reads it through)', !/campaignId\s*=[^=]/.test(lifeSrc + benchSrc) && !/campaignId/.test(lifeSrc) && (benchSrc.match(/campaignId:(?!\s*(null|fromVersion))/g) || []).length === 0);
check('nothing advances on a timer (no setTimeout / setInterval)', !/setTimeout|setInterval/.test(lifeSrc + benchSrc));
check('the order is written only through roomState\'s applyDelta (no localStorage, no write() inside the module)', !/localStorage|\.write\(/.test(lifeSrc) && /applyDelta\(room, \{ type: 'initiative_change'/.test(lifeSrc));
check('one pool path: a PC pool only through charPool; no ffgDicePool or second builder', /SP\.charPool\(/.test(lifeSrc) && !/ffgDicePool|function buildPool/.test(lifeSrc));
check('the bench runs at most one encounter at a time', B.setGroupState(bench, gid2, 'running') === bench);

console.log(fail ? '\n' + fail + ' FAILURE' + (fail === 1 ? '' : 'S') : '\nALL PASS');
process.exit(fail ? 1 : 0);
