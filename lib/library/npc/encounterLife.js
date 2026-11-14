/**
 * encounterLife.js — THE ENCOUNTER'S LIFE: start, the round, the end (ENCOUNTERS E3 lap A, the plumbing; DARK).
 *
 * Ruled by `encounters-e2-manager-shape` §3 (the RAW table), §4.1–4.4 (the shape) and §10 (propose-and-dispose), built
 * from the card `encounters-e3-plumbing` §4. No host loads this file yet: lap B's screens are its first caller.
 *
 * TWO STORES, ONE LINE BETWEEN THEM (R-V7S-1, R-E2S-1/2). The ENCOUNTER is a bench group (`benchStore.js`, v7): its
 * members' paper and its `state`. The ORDER and the session's DESTINY pool are the table store (`roomState.js`, v1,
 * read-only here): every write to it goes through that file's own pure transform, `applyDelta` (`initiative_change`,
 * `destiny_change`), so the solo manager and a future room run one function. `HOLOTABLE_ENABLED` is never read; no room
 * code. The running encounter is the one group whose `state` is 'running' — no pointer is added to the table store.
 *
 * PURE. Every function takes the states it reads and returns the states it changed; storage is the caller's
 * (`NpcBenchStore.persist`, `SWRPGRoomState.write`). Rolls go through the ONE dice core (`SWRPGDice.buildPool` /
 * `rollAndResolve`), a PC's pool through the ONE sheet pool path (`SWRPGSheetPool.charPool`, R-S4PP-1), a crit's +10s
 * through the ONE crit-roll core (`SWRPGPoolMods.critRoll`). A roll's RESULT is never persisted (§3 row 1, §4.4).
 *
 * PROPOSE AND DISPOSE (FIRST_PRINCIPLES_CHARTER §3.1 Amendment 1). The functions named `propose…`, `candidates`,
 * `endsProposals`, `rollCrit`, `summary` and the `…Preview` pair only READ: they hand the table a proposal. Every
 * function that changes a store is a disposal the host calls on the GM's tap. Nothing here heals anyone, writes a
 * sheet, writes `campaignId`, clears a condition chip, or advances on a timer.
 *
 * Dual-export (window.NpcEncounter / CommonJS) for test/encounter_*.cjs.
 */
(function (root) {
  'use strict';

  function need(globalName, rel) {
    var m = (typeof root !== 'undefined' && root && root[globalName]) || null;
    if (!m && typeof require === 'function') { try { m = require(rel); } catch (e) { m = null; } }
    return m;
  }
  function Bench() { return need('NpcBenchStore', './benchStore.js'); }
  function Room() { return need('SWRPGRoomState', '../../shared/roomState.js'); }
  function Dice() { return need('SWRPGDice', '../../shared/diceEngine.js'); }
  function PoolMods() { return need('SWRPGPoolMods', '../../shared/poolMods.js'); }

  var EMPTY_ORDER = { round: 0, slots: [], active: 0 };
  var INITIATIVE_SKILLS = { cool: 'presence', vigilance: 'willpower' };   // skills.vocab.json's characteristic for each

  function findGroup(bench, id) { return ((bench && bench.groups) || []).filter(function (g) { return g.id === id; })[0] || null; }
  function sideOf(m) { return m && m.kind === 'pc' ? 'pc' : 'npc'; }
  function order(room) { return Room().normalize(room).initiative; }
  function withOrder(room, initiative) { return Room().applyDelta(room, { type: 'initiative_change', initiative: initiative }); }

  // The running encounter (R-E2S-2): the bench group whose state is 'running', or null.
  function runningGroup(bench) {
    var id = Bench().runningGroupId(bench);
    return id ? findGroup(bench, id) : null;
  }

  // ── START (Step 1; §3 rows 1–2, 4, 9; §4.3) ────────────────────────────────────────────────────────────────────

  // One proposed slot per combatant: each rival, nemesis and PC member, each minion LINE (one slot's worth, §3 row 9),
  // each crew member (a craft has no slot, §3 row 4 — its crew are members and take slots as members).
  function proposeSlots(group) {
    return ((group && group.members) || []).map(function (m) { return { side: sideOf(m), memberId: m.id }; });
  }

  function skillRank(rec, skill) {
    var row = ((rec && rec.skills) || []).filter(function (s) { return s && s.skill_ref === skill; })[0];
    return row ? { listed: true, rank: parseInt(row.rank, 10) || 0 } : { listed: false, rank: 0 };
  }

  // A member's Cool or Vigilance pool, as the dice core builds it — or null where the table must type the result
  // (a `name:` PC, an unresolvable record, a PC before the vocabulary loads).
  //   `resolve(sourceKey)` → the canonical NPC record (the host's registry lookup; the stat block is never persisted).
  //   `charRecord(savedCharacterId)` → the saved character, for a `char:` PC (the host's roster lookup).
  // A minion line's group skill has (standing − 1) ranks (EotE p.390), through the ONE function (minionGroupRanks).
  function initiativePool(member, skill, ctx) {
    ctx = ctx || {};
    var prop = INITIATIVE_SKILLS[skill];
    if (!member || !prop) return null;
    if (member.kind === 'pc') {
      var ref = /^char:/.test(member.who || '') ? member.who.slice(5) : null;
      var SP = ctx.sheetPool || (root && root.SWRPGSheetPool);   // `ctx.sheetPool`: the guards' stand-in for the browser global
      var rec = ref && typeof ctx.charRecord === 'function' ? ctx.charRecord(ref) : null;
      return rec && SP && SP.charPool ? SP.charPool(rec, skill, 0) : null;
    }
    var npc = typeof ctx.resolve === 'function' ? ctx.resolve(member._source_key) : null;
    if (!npc) return null;
    var B = Bench(), sk = skillRank(npc, skill), rank = sk.rank;
    if (npc.tier === 'minion') {
      var wt = npc.derived && npc.derived.wounds;
      rank = sk.listed ? B.minionGroupRanks(B.minionStanding(member.poolWounds, wt, member.count)) : 0;
    }
    var p = Dice().buildPool({ characteristic: Number((npc.characteristics || {})[prop]) || 0, skillRank: rank, difficulty: 0 });
    return { proficiency: p.proficiency || 0, ability: p.ability || 0, boost: p.boost || 0, setback: p.setback || 0 };
  }

  // THE PROPOSAL: every slot with its pool and a rolled result, sorted. Nothing is written.
  //   `skills` — { <memberId>: 'cool' | 'vigilance' } (default 'cool' for everyone; the GM picks per combatant).
  //   `roll(pool)` → a resolved result ({success, advantage, …}); default the dice core's rollAndResolve. Injected by
  //   the guards so a proposal is deterministic.
  function proposeStart(bench, groupId, ctx) {
    ctx = ctx || {};
    var g = findGroup(bench, groupId);
    if (!g) return null;
    var D = Dice(), roll = typeof ctx.roll === 'function' ? ctx.roll : function (pool) { return D.rollAndResolve(pool).resolved; };
    var byId = {}; g.members.forEach(function (m) { byId[m.id] = m; });
    var slots = proposeSlots(g).map(function (s) {
      var skill = (ctx.skills && ctx.skills[s.memberId]) || 'cool';
      var pool = initiativePool(byId[s.memberId], skill, ctx);
      return { side: s.side, memberId: s.memberId, skill: skill, pool: pool, result: pool ? roll(pool) : null };
    });
    return { groupId: groupId, slots: sortSlots(slots) };
  }

  // §3 row 2: more successes first, then more Advantage, then the PC. A slot with no result (the table types it) sorts
  // after every rolled slot until one is typed. Stable otherwise.
  function sortSlots(slots) {
    return (slots || []).map(function (s, i) { return { s: s, i: i }; }).sort(function (a, b) {
      var ra = a.s.result, rb = b.s.result;
      if (!ra || !rb) return (ra ? 0 : 1) - (rb ? 0 : 1) || a.i - b.i;
      return (rb.success - ra.success) || (rb.advantage - ra.advantage) ||
        ((a.s.side === 'pc' ? 0 : 1) - (b.s.side === 'pc' ? 0 : 1)) || a.i - b.i;
    }).map(function (x) { return x.s; });
  }

  // THE DISPOSAL: the GM's START with the slots as they now stand (edited, re-typed, re-sorted). The bench group goes
  // 'running'; the table's order is written as sides only — `{side, benchMemberId: null}`, round 1, active 0 (a slot
  // belongs to a side; who fills it is this round's claim). Refused while another encounter runs: the host offers END or
  // PAUSE of that one first (§4.3). → { bench, room, refused }
  function start(bench, room, groupId, slots) {
    var B = Bench(), other = B.runningGroupId(bench);
    if (!findGroup(bench, groupId)) return { bench: bench, room: room, refused: 'no-group' };
    if (other && other !== groupId) return { bench: bench, room: room, refused: 'another-running', runningId: other };
    var nb = B.setGroupState(bench, groupId, 'running');
    if (nb === bench) return { bench: bench, room: room, refused: 'not-prepped' };
    var out = [];
    (slots || []).forEach(function (s) { if (s && (s.side === 'pc' || s.side === 'npc')) out.push({ side: s.side, benchMemberId: null }); });
    return { bench: nb, room: withOrder(room, { round: 1, slots: out, active: 0 }), refused: null };
  }

  // ── THE ROUND (§4.3) ──────────────────────────────────────────────────────────────────────────────────────────

  // The order as the manager reads it, against the running group. A slot id that is not a member of the running group
  // (an old order) reads as unfilled (R-E2S-2): `member` null, the id kept in `benchMemberId`.
  function slotView(bench, room) {
    var g = runningGroup(bench), ini = order(room), byId = {};
    (g ? g.members : []).forEach(function (m) { byId[m.id] = m; });
    return ini.slots.map(function (s, i) {
      return { index: i, side: s.side, benchMemberId: s.benchMemberId, member: s.benchMemberId ? byId[s.benchMemberId] || null : null, active: i === ini.active };
    });
  }

  // The members a slot may be claimed for: its side's members of the running group, those who have not acted this
  // round first (`fresh`), the rest after (`acted`). All are claimable — the table overrules (§10).
  function candidates(bench, room, index) {
    var g = runningGroup(bench), ini = order(room), slot = ini.slots[index];
    if (!g || !slot) return { fresh: [], acted: [] };
    var claimed = {};
    ini.slots.forEach(function (s, i) { if (i !== index && s.benchMemberId) claimed[s.benchMemberId] = true; });
    var mine = g.members.filter(function (m) { return sideOf(m) === slot.side; });
    return {
      fresh: mine.filter(function (m) { return !claimed[m.id]; }).map(function (m) { return m.id; }),
      acted: mine.filter(function (m) { return claimed[m.id]; }).map(function (m) { return m.id; }),
    };
  }

  // A claim: this round, slot `index` is filled by `memberId` (null clears it).
  function claim(room, index, memberId) {
    var ini = order(room);
    if (!ini.slots[index]) return room;
    ini.slots[index].benchMemberId = memberId == null ? null : String(memberId);
    return withOrder(room, ini);
  }

  // NEXT: `active` advances; past the last slot the round turns — `round += 1`, `active` 0, every claim cleared (draw
  // without replacement within a round, R-HRC-1). → { room, ended: {round, index, benchMemberId} } — the slot whose
  // turn just ended, which the timers read (endsProposals) before the round turn clears its claim.
  function next(room) {
    var ini = order(room);
    if (!ini.slots.length) return { room: room, ended: null };
    var ended = { round: ini.round, index: ini.active, benchMemberId: ini.slots[ini.active].benchMemberId };
    if (ini.active + 1 < ini.slots.length) ini.active += 1;
    else {
      ini.round += 1; ini.active = 0;
      ini.slots.forEach(function (s) { s.benchMemberId = null; });
    }
    return { room: withOrder(room, ini), ended: ended };
  }

  // BACK: `active` steps down; nothing else moves (it never un-turns a round).
  function back(room) {
    var ini = order(room);
    if (ini.active <= 0) return room;
    ini.active -= 1;
    return withOrder(room, ini);
  }

  // ADD a slot mid-fight: appended at the very end (§3 row 3 — the only printed precedent; SILENT otherwise).
  function addSlot(room, side) {
    if (side !== 'pc' && side !== 'npc') return room;
    var ini = order(room);
    ini.slots.push({ side: side, benchMemberId: null });
    return withOrder(room, ini);
  }
  // REMOVE a slot: its claim goes with it. The active slot stays the one that was acting where it can.
  function removeSlot(room, index) {
    var ini = order(room);
    if (!ini.slots[index]) return room;
    ini.slots.splice(index, 1);
    if (index < ini.active) ini.active -= 1;
    if (ini.active >= ini.slots.length) ini.active = Math.max(0, ini.slots.length - 1);
    return withOrder(room, ini);
  }

  // ── PAUSE, END, REOPEN (§4.3) ─────────────────────────────────────────────────────────────────────────────────

  // PAUSE: the group back to 'prepped' with every wound, pool and condition kept; the table's order cleared. It
  // re-rolls initiative when it resumes.
  function pause(bench, room, groupId) {
    var g = findGroup(bench, groupId);
    if (!g || g.state !== 'running') return { bench: bench, room: room, refused: 'not-running' };
    return { bench: Bench().setGroupState(bench, groupId, 'prepped'), room: withOrder(room, EMPTY_ORDER), refused: null };
  }

  // END (Step 5): `done`, `rounds` from the table's round, the order cleared to {round: 0, slots: [], active: 0}.
  // Nothing writes to any sheet; the summary is derived (summary(), below).
  function end(bench, room, groupId) {
    var g = findGroup(bench, groupId);
    if (!g || g.state !== 'running') return { bench: bench, room: room, refused: 'not-running' };
    var nb = Bench().setGroupState(bench, groupId, 'done', order(room).round);
    return { bench: nb, room: withOrder(room, EMPTY_ORDER), refused: null };
  }

  // REOPEN: a done encounter back to 'prepped', its paper intact.
  function reopen(bench, groupId) {
    var g = findGroup(bench, groupId);
    if (!g || g.state !== 'done') return bench;
    return Bench().setGroupState(bench, groupId, 'prepped');
  }

  // ── CONDITION TIMERS (§3 row 7) ───────────────────────────────────────────────────────────────────────────────

  // Setting a chip during the running fight records its clock (the table's round and active slot). A chip set outside a
  // running fight has no clock. The chip itself is the host's `setMember` write, unchanged.
  function noteCondition(bench, room, groupId, memberId, condition) {
    var g = runningGroup(bench);
    if (!g || g.id !== groupId) return bench;
    var ini = order(room);
    return Bench().addTimer(bench, groupId, memberId, { condition: condition, round: ini.round, active: ini.active });
  }

  // THE ENDS PROPOSAL: the conditions whose default duration ends with the turn that just ended — "until the end of the
  // character's next turn" (EotE p.218): the ended slot was claimed by the member, and it comes after the slot that was
  // acting when the chip was set. Data only: the host dims the chip with ENDS; KEEP or CLEAR is the GM's (dropTimer, and
  // for CLEAR the chip's own write). → [{ memberId, condition }]
  function endsProposals(bench, groupId, ended) {
    var g = findGroup(bench, groupId);
    if (!g || !ended || !ended.benchMemberId) return [];
    var m = g.members.filter(function (x) { return x.id === ended.benchMemberId; })[0];
    if (!m) return [];
    return (m.timers || []).filter(function (t) {
      return (m.conditions || []).indexOf(t.condition) !== -1 &&
        (ended.round > t.round || (ended.round === t.round && ended.index > t.active));
    }).map(function (t) { return { memberId: m.id, condition: t.condition }; });
  }

  // ── CRITICAL INJURIES (§3 row 6) ──────────────────────────────────────────────────────────────────────────────

  // The row a total lands on, by range, on a crit table's rows ([range, severity, result, …]) — read at render, never
  // stored. '151+' reads open-ended.
  function inRange(range, n) {
    range = String(range).trim();
    if (/\+$/.test(range)) return n >= parseInt(range, 10);
    var m = range.split('-'), lo = parseInt(m[0], 10), hi = parseInt(m.length > 1 ? m[1] : m[0], 10);
    return n >= lo && n <= hi;
  }
  function critRowOf(rows, total) {
    return (rows || []).filter(function (r) { return r && inRange(r[0], total); })[0] || null;
  }

  // THE PROPOSAL: d100 + 10 per Critical Injury the member already has → the row lit. `d100` is the die (injected by
  // the guards; default a fair 1–100). `rows` is `crit_tables.json`'s `character.rows`. Minions never (a crit on a group
  // is one minion's worth of wounds, `minionCritPool`); a PC's crits are its sheet's. → { d100, roll, row } | null
  function rollCrit(member, tier, rows, d100) {
    if (!member || member.kind === 'pc' || (tier !== 'rival' && tier !== 'nemesis')) return null;
    var die = d100 != null ? parseInt(d100, 10) : 1 + Math.floor(Math.random() * 100);
    var held = (member.crits || []).length, P = PoolMods();
    var total = P && P.critRoll ? P.critRoll(die, held, null).total : die + held * 10;
    return { d100: die, roll: total, row: critRowOf(rows, total) };
  }

  // TAKE (or PICK ANOTHER's chosen total, or TYPE OWN with its label): the crit's id-ref joins the member, at the
  // table's round. The effect text is never persisted.
  function takeCrit(bench, room, groupId, memberId, tier, roll, label) {
    var c = { roll: roll, at: order(room).round || undefined };
    if (label) c.label = label;
    return Bench().addCrit(bench, groupId, memberId, c, tier);
  }

  // ── DESTINY (§3 row 5, §4.3) ──────────────────────────────────────────────────────────────────────────────────

  // A FLIP moves one point from `from` ('light' — a player spent; 'dark' — the GM spent) through the table store's own
  // transform. An empty side is the transform's refusal, answered rather than thrown. → { room, refused }
  function flipDestiny(room, from) {
    try { return { room: Room().applyDelta(room, { type: 'destiny_change', from: from }), refused: null }; }
    catch (e) { if (e && e.refused) return { room: room, refused: e.refused }; throw e; }
  }
  // SET at session start: the players' Force-die tally, a local write of the counts. Never touched by START or END.
  function setDestiny(room, light, dark) {
    var s = Room().normalize(room);
    s.destiny = { light: light, dark: dark };
    return Room().normalize(s);
  }

  // ── END'S SUMMARY, DELETE, HEAL & REPAIR ALL ───────────────────────────────────────────────────────────────────

  // The book's recovery lines after an encounter (EotE p.219–220; shape ruling §3 row 8) — READ lines, never controls,
  // as data the host renders. Kept as references, not prose: the words are lap B's, the rule is cited here.
  var RECOVERY = [
    { key: 'strain', cite: 'eote p.220', check: 'discipline_or_cool', simple: true },     // Simple (–) Discipline or Cool; each success one strain
    { key: 'wounds_rest', cite: 'eote p.219', per: 'night' },                              // one wound per full night's rest
    { key: 'medicine', cite: 'eote p.219', table: 'healing_recovery.difficulty', perEncounter: 1 },   // one Medicine check per encounter; its difficulty is Table 6-11 (p.220)
  ];

  // END's summary, derived from the done (or running) encounter — never stored text.
  function summary(bench, groupId) {
    var g = findGroup(bench, groupId);
    if (!g) return null;
    return {
      groupId: g.id, state: g.state, rounds: g.rounds || 0,
      members: g.members.map(function (m) {
        return { id: m.id, kind: m.kind || 'npc', who: m.who || null, _source_key: m._source_key,
                 wounds: m.kind === 'pc' ? null : m.currentWounds, strain: m.kind === 'pc' ? null : m.currentStrain,
                 poolWounds: m.poolWounds || 0, count: m.count || 1,
                 conditions: (m.conditions || []).slice(), crits: (m.crits || []).map(function (c) { return c.roll; }) };
      }),
      recovery: RECOVERY.map(function (r) { return Object.assign({}, r); }),
    };
  }

  // What the confirm names before HEAL & REPAIR ALL (R-E3P-1): wounds, strain, conditions, pools and timers clear on the
  // NPC members; crits stay; PC members' wounds and strain are the sheet's and are not touched. Data only.
  function resetPreview(bench, groupId) {
    var g = findGroup(bench, groupId);
    if (!g) return null;
    var npc = g.members.filter(function (m) { return m.kind !== 'pc'; });
    return {
      clears: { wounds: npc.filter(function (m) { return m.currentWounds > 0; }).length,
                strain: npc.filter(function (m) { return m.currentStrain > 0; }).length,
                conditions: g.members.filter(function (m) { return (m.conditions || []).length; }).length,
                pools: g.members.filter(function (m) { return m.poolWounds > 0; }).length,
                timers: g.members.filter(function (m) { return (m.timers || []).length; }).length },
      keeps: { crits: g.members.reduce(function (n, m) { return n + (m.crits || []).length; }, 0) },
    };
  }
  // HEAL & REPAIR ALL, confirmed: the bench's reset (R-E3P-1). The table store is not touched.
  function healAndRepairAll(bench, groupId) { return Bench().resetGroup(bench, groupId); }

  // What the confirm names before DELETE: the encounter, its members, and whether it is the running one.
  function deletePreview(bench, groupId) {
    var g = findGroup(bench, groupId);
    if (!g) return null;
    return { name: g.name, members: g.members.length, crits: g.members.reduce(function (n, m) { return n + (m.crits || []).length; }, 0), running: g.state === 'running' };
  }
  // DELETE, confirmed: the bench's deleteGroup; deleting the running encounter also clears the table's order (the
  // order belongs to the fight that no longer exists). → { bench, room }
  function deleteEncounter(bench, room, groupId) {
    var g = findGroup(bench, groupId);
    if (!g) return { bench: bench, room: room };
    var nr = g.state === 'running' ? withOrder(room, EMPTY_ORDER) : room;
    return { bench: Bench().deleteGroup(bench, groupId), room: nr };
  }

  var api = {
    INITIATIVE_SKILLS: INITIATIVE_SKILLS,
    EMPTY_ORDER: EMPTY_ORDER,
    RECOVERY: RECOVERY,
    runningGroup: runningGroup,
    proposeSlots: proposeSlots,
    initiativePool: initiativePool,
    proposeStart: proposeStart,
    sortSlots: sortSlots,
    start: start,
    slotView: slotView,
    candidates: candidates,
    claim: claim,
    next: next,
    back: back,
    addSlot: addSlot,
    removeSlot: removeSlot,
    pause: pause,
    end: end,
    reopen: reopen,
    noteCondition: noteCondition,
    endsProposals: endsProposals,
    critRowOf: critRowOf,
    rollCrit: rollCrit,
    takeCrit: takeCrit,
    flipDestiny: flipDestiny,
    setDestiny: setDestiny,
    summary: summary,
    resetPreview: resetPreview,
    healAndRepairAll: healAndRepairAll,
    deletePreview: deletePreview,
    deleteEncounter: deleteEncounter,
  };

  if (typeof root !== 'undefined' && root) root.NpcEncounter = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
