#!/usr/bin/env node
/* test/campaign_store.cjs — the campaign record's one writer (lib/shared/campaignStore.js; ENCOUNTERS E6 plumbing).
 *
 * Ruling `encounters-e6-plumbing` §4 and ADDENDUM 1; save shape `encounters-e4-campaign-redraw` §5. The roster and the
 * party store are the REAL modules in a vm, so ADD's award and a campaign's party take the paths every write takes. Legs:
 *   S1 the shape: both roles' fields, `camp_`/`party_` ids, the envelope `{version: 1, campaigns}`, unknown fields kept
 *      at every level, an untouched save equal; a role's fields only on that role
 *   S2 F-54: an envelope ahead of v1 is held — no op writes, no act writes either key
 *   S3 the merge by id (syncMerge's LISTS row): two devices' campaigns union by id; a tombstoned id stays gone
 *   S4 tombstones: a deleted campaign's id is appended to the shared list, other entries kept
 *   S5 the inbox: addOffer idempotent by id; a malformed offer refused; take awards through SWRPGRoster.addXp and removes
 *      the offer; take refuses a character not in the campaign, and a refused award keeps the offer; dismiss writes no sheet;
 *      `handled` (ruling `encounters-e6-plumbing-gate` C1): a taken or dismissed id, re-sent, never re-enters the inbox
 *   S6 party per campaign: each campaign its own party; receiveParty replaces + re-points; the old party retires only if
 *      nothing else points at it AND it holds nothing but members; unlinked refused; a linked party refuses a local edit
 *   S7 the log: append-only (the store's id and time), DELETE YES, no edit op exported
 *   S8 R-E6F-6: SEND XP logs one xp_sent per SESSION; a re-send re-uses its offerId, so the player holds ONE offer
 *   S9 R-E6F-7: the player record's frame is the GM's last table_hello frame
 *
 * `node test/campaign_store.cjs --bite` runs each mutant (a COPY of the module) against its leg; exit 1 if one survives.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'lib/shared/campaignStore.js');
const CAMP_SRC = fs.readFileSync(process.env.CAMP_SRC_OVERRIDE || SRC, 'utf8');
const PARTY_SRC = fs.readFileSync(path.join(ROOT, 'lib/shared/partyStore.js'), 'utf8');
const ROSTER_SRC = fs.readFileSync(path.join(ROOT, 'lib/shared/roster.js'), 'utf8');
const VG = require('../lib/shared/versionGuard.js');
const RP = require('../lib/shared/recordPortrait.js');
const CR = { repairPoisonedXp: require('../lib/shared/charResolve.js').repairPoisonedXp };
const M = require('../lib/shared/syncMerge.js');
const CKEY = 'swrpg_campaigns', PKEY = 'swrpg_party_v1', RKEY = 'swrpg_saved_characters', DEL = 'swrpg_deleted_ids';

const MUTANTS = [
  ['no-keep', 'S1', "if (isObj(src)) Object.keys(src).forEach(function (k) { out[k] = own(known, k) ? known[k] : src[k]; });", ''],
  ['no-f54-hold', 'S2', 'if (_stale || (state && state.stale)) return null;', 'if (false) return null;'],
  ['no-tombstone', 'S4', 'writeTombstones(ls, state && state[DELETED]);', ''],
  // two defences hold the inbox to one entry per id (the op's skip and the normalizer's by-id pass): this mutant drops both
  ['offer-not-idempotent', 'S5', "if (c.inbox.some(function (o) { return o.id === str(offer.offerId); })) return c;", '',
    ['known.inbox = byId(c.inbox, normalizeOffer);', 'known.inbox = (Array.isArray(c.inbox) ? c.inbox : []).map(normalizeOffer).filter(Boolean);']],
  ['offer-any-amount', 'S5', "if (!isObj(offer) || !str(offer.offerId) || !amountOk(offer.amount)) return state;", "if (!isObj(offer) || !str(offer.offerId)) return state;"],
  ['take-any-char', 'S5', "if (c.characterIds.indexOf(str(charId)) === -1) return { ok: false, why: 'not-in-campaign' };", ''],
  ['offer-revives', 'S5', "if (c.handled.indexOf(str(offer.offerId)) !== -1) return c;", ''],
  ['take-keeps-nothing', 'S5', "try { if (raw == null) ls.removeItem(KEY); else ls.setItem(KEY, raw); } catch (e) {}", ''],
  ['shared-party', 'S6', "var pid = 'party_' + uuid();", "var pid = 'party';"],
  ['retire-pointed', 'S6', "if (pointedAt(s, oldId, exceptId)) return { partyId: oldId, kept: 'pointed-at' };", ''],
  ['retire-full', 'S6', "if (!holdsOnlyMembers(p)) return { partyId: oldId, kept: 'holds-more-than-members' };", ''],
  ['edit-while-linked', 'S6', "if (c.role === 'player' && c.table) return { ok: false, why: 'linked' };", ''],
  ['party-unlinked', 'S6', "if (!c.table) return { ok: false, why: 'not-linked' };", ''],
  ['xp-resend-fresh-offer', 'S8', 'if (had) return { state: state, entry: had };', ''],
  ['player-frame-dropped', 'S9', "if (own(hello, 'frame')) next.frame = normalizeFrame(hello.frame);", ''],
  ['log-keeps-caller-id', 'S7', "Object.assign({}, entry, { id: 'clog_' + uuid(), at: now() })", 'Object.assign({ id: \'clog_\' + uuid(), at: now() }, entry)'],
];

if (process.argv.includes('--bite')) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'camp-bite-'));
  let bad = 0;
  for (const [name, leg, find, repl, more] of MUTANTS) {
    let src = fs.readFileSync(SRC, 'utf8');
    const edits = [[find, repl]].concat(more ? [more] : []);
    if (edits.some(([f]) => src.split(f).length !== 2)) { console.log('  BROKEN MUTANT ' + name + ': a find is not unique/present'); bad++; continue; }
    edits.forEach(([f, r]) => { src = src.replace(f, r); });
    const f = path.join(tmp, name + '.js');
    fs.writeFileSync(f, src);
    const r = spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { CAMP_SRC_OVERRIDE: f }), encoding: 'utf8' });
    const ok = r.status === 1 && new RegExp('FAIL  ' + leg + ' ').test(r.stdout);
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
function leg(name, fn) { try { fn(); } catch (e) { check(name + ' threw: ' + (e && e.message), false); } }

// a fresh world: localStorage, the real roster, the real party store, this store
function world(seed) {
  const store = Object.assign({}, seed || {});
  const ls = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  let n = 0;
  const ctx = { localStorage: ls, SWRPGVersionGuard: VG, SWRPGRecordPortrait: RP, CharResolve: CR, console, Date, JSON, Math,
    crypto: { randomUUID: () => 'u' + (++n) } };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(ROSTER_SRC, ctx, { filename: 'roster.js' });
  vm.runInContext(PARTY_SRC, ctx, { filename: 'partyStore.js' });
  vm.runInContext(CAMP_SRC, ctx, { filename: 'campaignStore.js' });
  return { store, C: ctx.SWRPGCampaigns, P: ctx.SWRPGParty, R: ctx.SWRPGRoster };
}
const camps = (w) => JSON.parse(w.store[CKEY]);
const parties = (w) => JSON.parse(w.store[PKEY] || '{"parties":[]}').parties;
const charRec = (id, xp) => ({ id, name: 'Kael', source: 'custom', selectedChar: { id, name: 'Kael' },
  sheetData: { name: 'Kael', xp: xp || { total: 110, spent: 100, remaining: 10 } }, updatedAt: 1 });
const roster = (recs) => JSON.stringify({ version: 1, characters: recs });

// ── S1 the shape ──
leg('S1', () => {
  const w = world();
  const g = w.C.createCampaign('gm', 'Rogue Cell', { frame: { book: 'aor', moralityLayer: true } });
  const p = w.C.createCampaign('player', 'My table');
  check('S1 both acts answer ok with camp_ and party_ ids', g.ok && p.ok && /^camp_/.test(g.id) && /^party_/.test(g.partyId) && /^party_/.test(p.partyId), [g, p]);
  const env = camps(w), G = env.campaigns.find((c) => c.id === g.id), Pl = env.campaigns.find((c) => c.id === p.id);
  check('S1 the envelope is { version: 1, campaigns }', env.version === 1 && Array.isArray(env.campaigns) && env.campaigns.length === 2, env);
  check('S1 the GM record: role, name, partyId, cast, log, frame, stamps', G.role === 'gm' && G.name === 'Rogue Cell' && G.partyId === g.partyId
    && Array.isArray(G.cast) && Array.isArray(G.log) && G.frame.book === 'aor' && G.frame.moralityLayer === true && typeof G.createdAt === 'number' && typeof G.updatedAt === 'number', G);
  check('S1 the player record: characterIds, table null, inbox, handled []', Pl.role === 'player' && Array.isArray(Pl.characterIds) && Pl.table === null && Array.isArray(Pl.inbox) && Array.isArray(Pl.handled) && Pl.handled.length === 0, Pl);
  check('S1 a role\'s fields only on that role', !('inbox' in G) && !('handled' in G) && !('characterIds' in G) && !('cast' in Pl) && !('log' in Pl), [Object.keys(G), Object.keys(Pl)]);   // `frame` is on both roles since R-E6F-7 (encounters-e6-frames ADDENDUM 2)
  const seeded = world({ [CKEY]: JSON.stringify({ version: 1, future: 'kept', campaigns: [{ id: 'camp_x', role: 'player', name: 'X', partyId: null, createdAt: 1, updatedAt: 1,
    characterIds: ['a'], table: { gmCampaignId: 'camp_g', gmLabel: 'GM', lastSeen: 1, deep: 1 }, inbox: [{ id: 'o1', at: 1, kind: 'xp', amount: 5, fromLabel: 'GM', note: 'x' }], handled: ['o0'], extra: { y: 1 } }] }) });
  const before = seeded.store[CKEY];
  seeded.C.save(seeded.C.load());
  const back = camps(seeded), r0 = back.campaigns[0];
  check('S1 unknown fields kept: the envelope, the record, the table, an inbox entry', back.future === 'kept' && r0.extra.y === 1 && r0.table.deep === 1 && r0.inbox[0].note === 'x', back);
  check('S1 an untouched save writes back equal', seeded.store[CKEY] === before, [seeded.store[CKEY], before]);
});

// ── S2 F-54 ──
leg('S2', () => {
  const ahead = JSON.stringify({ version: 2, campaigns: [{ id: 'camp_x', role: 'player', name: 'Newer', inbox: [{ id: 'o1', amount: 5 }], characterIds: ['a'] }] });
  const w = world({ [CKEY]: ahead, [RKEY]: roster([charRec('a')]) });
  const s = w.C.load();
  check('S2 the newer envelope reads as held', w.C.isStale() && s.stale === true);
  check('S2 save writes nothing', w.C.save(w.C.setName(s, 'camp_x', 'Mine')) === null && w.store[CKEY] === ahead);
  const made = w.C.createCampaign('gm', 'x');
  check('S2 an act refuses before ANY write (no party made either)', made.ok === false && made.why === 'held' && w.store[PKEY] === undefined, made);
  const t = w.C.take('camp_x', 'o1', 'a');
  check('S2 take refuses and no XP is awarded', t.ok === false && JSON.parse(w.store[RKEY]).characters[0].sheetData.xp.total === 110, t);
});

// ── S3 the merge by id ──
leg('S3', () => {
  const a = { version: 1, campaigns: [{ id: 'camp_a', role: 'gm', name: 'A', updatedAt: 1 }, { id: 'camp_gone', role: 'gm', name: 'old', updatedAt: 1 }] };
  const b = { version: 1, campaigns: [{ id: 'camp_b', role: 'player', name: 'B', updatedAt: 2 }] };
  const r = M.mergeAdoption({ [CKEY]: a, [DEL]: [] }, { [CKEY]: b, [DEL]: ['camp_gone'] });
  const merged = typeof r.merged[CKEY] === 'string' ? JSON.parse(r.merged[CKEY]) : r.merged[CKEY];
  const ids = (merged.campaigns || []).map((c) => c.id).sort().join();
  check('S3 two devices\' campaigns union by id; a tombstoned id stays gone', ids === 'camp_a,camp_b' && merged.version === 1 && r.conflicts.length === 0, { ids, conflicts: r.conflicts });
  check('S3 the UNITS row names every field of the shape', ['id', 'role', 'name', 'partyId', 'createdAt', 'cast', 'log', 'frame', 'characterIds', 'table', 'inbox']
    .every((k) => M.UNITS[CKEY].alone.includes(k)) && M.UNITS[CKEY].stamps.includes('updatedAt'));
});

// ── S4 tombstones ──
leg('S4', () => {
  const w = world({ [DEL]: JSON.stringify(['old']) });
  const g = w.C.createCampaign('gm', 'A');
  const d = w.C.deleteCampaign(g.id);
  check('S4 the campaign is gone and its id appended to the shared list, other entries kept', d.ok && camps(w).campaigns.length === 0
    && JSON.stringify(JSON.parse(w.store[DEL])) === JSON.stringify(['old', g.id, g.partyId]), [d, w.store[DEL]]);
  check('S4 its empty party retired with it (tombstoned too)', parties(w).length === 0 && d.retired && d.retired.removed === true, d);
});

// ── S5 the inbox ──
leg('S5', () => {
  const w = world({ [RKEY]: roster([charRec('a'), charRec('b')]) });
  const p = w.C.createCampaign('player', 'Mine');
  w.C.apply((s) => w.C.attachCharacter(s, p.id, 'a'));
  const offer = { offerId: 'o1', amount: 20, fromLabel: 'The GM', note: 'well played' };
  w.C.apply((s) => w.C.addOffer(s, p.id, offer, 5));
  w.C.apply((s) => w.C.addOffer(s, p.id, offer, 6));
  let inbox = camps(w).campaigns[0].inbox;
  check('S5 the same offer id twice is held once, in the inbox shape (no note)', inbox.length === 1 && JSON.stringify(inbox[0]) === JSON.stringify({ id: 'o1', at: 5, kind: 'xp', amount: 20, fromLabel: 'The GM' }), inbox);
  [0, 1001, 2.5, '20', null].forEach((amt) => w.C.apply((s) => w.C.addOffer(s, p.id, { offerId: 'bad' + amt, amount: amt, fromLabel: 'x' })));
  check('S5 an amount outside integer 1–1000 is refused', camps(w).campaigns[0].inbox.length === 1, camps(w).campaigns[0].inbox);
  const no = w.C.take(p.id, 'o1', 'b');
  check('S5 take refuses a character not in the campaign; nothing awarded, the offer kept', no.ok === false && no.why === 'not-in-campaign'
    && JSON.parse(w.store[RKEY]).characters[1].sheetData.xp.total === 110 && camps(w).campaigns[0].inbox.length === 1, no);
  const yes = w.C.take(p.id, 'o1', 'a');
  const xa = JSON.parse(w.store[RKEY]).characters[0].sheetData.xp;
  check('S5 take awards through the roster (total and remaining +20, spent kept) and removes the offer', yes.ok && yes.amount === 20
    && JSON.stringify(xa) === JSON.stringify({ total: 130, spent: 100, remaining: 30 }) && camps(w).campaigns[0].inbox.length === 0, [yes, xa]);
  check('S5 take marks the offer handled', JSON.stringify(camps(w).campaigns[0].handled) === '["o1"]', camps(w).campaigns[0].handled);
  w.C.apply((s) => w.C.addOffer(s, p.id, offer, 7));
  const twice = w.C.take(p.id, 'o1', 'a');
  check('S5 C1: the GM\'s re-sent offer after take stays out of the inbox, and a second take is no-offer (one award)',
    camps(w).campaigns[0].inbox.length === 0 && twice.ok === false && twice.why === 'no-offer'
    && JSON.parse(w.store[RKEY]).characters[0].sheetData.xp.total === 130, [camps(w).campaigns[0], twice]);
  w.C.apply((s) => w.C.addOffer(s, p.id, { offerId: 'o2', amount: 7, fromLabel: 'GM' }));
  w.C.apply((s) => w.C.detachCharacter(s, p.id, 'a'));
  w.C.apply((s) => w.C.attachCharacter(s, p.id, 'ghost'));
  const lost = w.C.take(p.id, 'o2', 'ghost');
  check('S5 a refused award (the character is not stored) keeps the offer, NOT handled', lost.ok === false && lost.why === 'award-refused'
    && camps(w).campaigns[0].inbox.length === 1 && camps(w).campaigns[0].handled.indexOf('o2') === -1, [lost, camps(w).campaigns[0]]);
  const rosterBefore = w.store[RKEY];
  w.C.apply((s) => w.C.dismiss(s, p.id, 'o2'));
  check('S5 dismiss removes the offer and writes no sheet', camps(w).campaigns[0].inbox.length === 0 && w.store[RKEY] === rosterBefore);
  w.C.apply((s) => w.C.addOffer(s, p.id, { offerId: 'o2', amount: 7, fromLabel: 'GM' }));
  check('S5 C1: a dismissed offer, re-sent, stays out; handled holds both ids once', camps(w).campaigns[0].inbox.length === 0
    && JSON.stringify(camps(w).campaigns[0].handled) === '["o1","o2"]', camps(w).campaigns[0]);
});

// ── S6 party per campaign ──
leg('S6', () => {
  const w = world();
  const g1 = w.C.createCampaign('gm', 'One'), g2 = w.C.createCampaign('gm', 'Two');
  check('S6 two GM campaigns, two party records, neither "party"', g1.partyId !== g2.partyId && parties(w).length === 2 && parties(w).every((p) => p.id !== 'party'), parties(w));
  const p = w.C.createCampaign('player', 'Mine');
  const gmParty = { id: 'party_gm', name: 'Rogue Cell', members: [{ who: 'char:a', last: 'Kael' }], duty: [], obligation: [], rank: 0, rankUps: [], bases: [], updatedAt: 50 };
  const unl = w.C.receiveParty(p.id, gmParty);
  check('S6 an unlinked campaign refuses a received party', unl.ok === false && unl.why === 'not-linked' && !parties(w).some((x) => x.id === 'party_gm'), unl);
  w.C.apply((s) => w.C.setTable(s, p.id, { campaignId: 'camp_gm', gmLabel: 'Jason' }, 9));
  check('S6 table_hello writes the link', JSON.stringify(camps(w).campaigns.find((c) => c.id === p.id).table) === JSON.stringify({ gmCampaignId: 'camp_gm', gmLabel: 'Jason', lastSeen: 9 }));
  const got = w.C.receiveParty(p.id, gmParty);
  const pc = camps(w).campaigns.find((c) => c.id === p.id);
  check('S6 the GM record is held whole and the campaign re-points at it', got.ok && pc.partyId === 'party_gm' && parties(w).find((x) => x.id === 'party_gm').updatedAt === 50, [got, pc.partyId]);
  check('S6 the old empty party, pointed at by nothing, retired', got.retired && got.retired.removed === true && !parties(w).some((x) => x.id === p.partyId), got);
  const ed = w.C.editParty(p.id, (ps, pid) => w.P.setName(ps, 'Hacked', pid));
  check('S6 a linked party refuses a local edit', ed.ok === false && ed.why === 'linked' && parties(w).find((x) => x.id === 'party_gm').name === 'Rogue Cell', ed);
  w.C.apply((s) => w.C.clearTable(s, p.id));
  check('S6 unlinked, the copy is the player\'s own (an edit lands)', w.C.editParty(p.id, (ps, pid) => w.P.setName(ps, 'Ours', pid)).ok && parties(w).find((x) => x.id === 'party_gm').name === 'Ours');
  // kept: the old party holds more than members
  const p2 = w.C.createCampaign('player', 'Rows');
  w.C.editParty(p2.id, (ps, pid) => w.P.setGroupRows(ps, 'duty', [{ type: 'Combat Victory', magnitude: 5 }], pid));
  w.C.apply((s) => w.C.setTable(s, p2.id, { campaignId: 'camp_gm2', gmLabel: 'GM' }));
  const kept = w.C.receiveParty(p2.id, Object.assign({}, gmParty, { id: 'party_gm2' }));
  check('S6 an old party holding more than members is kept and said so', kept.ok && kept.retired && kept.retired.kept === 'holds-more-than-members' && parties(w).some((x) => x.id === p2.partyId), kept);
  // kept: another campaign points at the old party
  const p3 = w.C.createCampaign('player', 'Shared');
  const shared = camps(w).campaigns.find((c) => c.id === p3.id).partyId;
  const p4 = w.C.createCampaign('player', 'Also');
  w.C.apply((s) => Object.assign({}, s, { campaigns: s.campaigns.map((c) => c.id === p4.id ? Object.assign({}, c, { partyId: shared }) : c) }));
  w.C.apply((s) => w.C.setTable(s, p3.id, { campaignId: 'camp_gm3', gmLabel: 'GM' }));
  const kept2 = w.C.receiveParty(p3.id, Object.assign({}, gmParty, { id: 'party_gm3' }));
  check('S6 an old party another campaign points at is kept and said so', kept2.ok && kept2.retired && kept2.retired.kept === 'pointed-at' && parties(w).some((x) => x.id === shared), kept2);
});

// ── S7 the log ──
leg('S7', () => {
  const w = world();
  const g = w.C.createCampaign('gm', 'A');
  w.C.apply((s) => w.C.appendLog(s, g.id, { kind: 'session', xp: 15, text: 'the heist', id: 'mine', at: 1 }));
  w.C.apply((s) => w.C.appendLog(s, g.id, { kind: 'encounter', groupId: 'g1', rounds: 3, items: [] }));
  const log = camps(w).campaigns[0].log;
  check('S7 appended in order, each with the store\'s clog_ id and time, never the caller\'s', log.length === 2 && log.every((e) => /^clog_/.test(e.id)) && log[0].at !== 1 && log[0].xp === 15, log);
  let threw = false; try { w.C.appendLog(w.C.load(), g.id, { kind: 'wiki' }); } catch (e) { threw = true; }
  check('S7 a kind outside encounter | session | xp_sent is refused', threw);
  w.C.apply((s) => w.C.removeLog(s, g.id, log[0].id));
  check('S7 DELETE YES: an entry is removed by id', camps(w).campaigns[0].log.length === 1 && camps(w).campaigns[0].log[0].id === log[1].id);
  check('S7 EDIT NO: no edit op is exported', !Object.keys(w.C).some((k) => /^(edit|update|set)Log/i.test(k)), Object.keys(w.C));
});

// ── S8 R-E6F-6 (ruling `encounters-e6-frames` ADDENDUM 2): SEND XP logs ONE xp_sent per SESSION; a re-send keeps its offerId ──
leg('S8', () => {
  const w = world();
  const g = w.C.createCampaign('gm', 'A');
  w.C.apply((s) => w.C.appendLog(s, g.id, { kind: 'session', xp: 20 }));
  const sid = camps(w).campaigns[0].log[0].id;
  const r1 = w.C.sendXp(w.C.load(), g.id, sid, 20); w.C.save(r1.state);
  const r2 = w.C.sendXp(w.C.load(), g.id, sid, 20); w.C.save(r2.state);   // after a "reload": the GM taps again
  const sent = camps(w).campaigns[0].log.filter((e) => e.kind === 'xp_sent');
  check('S8 one xp_sent entry {session, offerId, amount}, with the store\'s id and time', sent.length === 1 && sent[0].session === sid && /^offer_/.test(sent[0].offerId)
    && sent[0].amount === 20 && /^clog_/.test(sent[0].id) && typeof sent[0].at === 'number', sent);
  check('S8 the re-send answers the SAME offerId', r1.entry.offerId === r2.entry.offerId && w.C.xpSentOf(w.C.load(), g.id, sid).offerId === r1.entry.offerId, [r1.entry, r2.entry]);
  // the player's side: both offers arrive; the inbox holds one, and once handled a re-send never returns
  const pw = world({ [RKEY]: roster([charRec('a')]) });
  const p = pw.C.createCampaign('player', 'Mine');
  pw.C.apply((s) => pw.C.attachCharacter(s, p.id, 'a'));
  [r1, r2].forEach((r) => pw.C.apply((s) => pw.C.addOffer(s, p.id, { offerId: r.entry.offerId, amount: 20, fromLabel: 'Dana' })));
  check('S8 both sends reach the player as ONE inbox offer', camps(pw).campaigns[0].inbox.length === 1, camps(pw).campaigns[0].inbox);
  check('S8 a SESSION id that is no session, or an amount out of range, sends nothing', w.C.sendXp(w.C.load(), g.id, 'nope', 20) === null && w.C.sendXp(w.C.load(), g.id, sid, 0) === null);
  check('S8 xp_sent is a LOG kind; the answers have no op (never logged, D-497 b4)', w.C.LOG_KINDS.indexOf('xp_sent') !== -1 && !Object.keys(w.C).some((k) => /answer|taken/i.test(k)), w.C.LOG_KINDS);
});

// ── S9 R-E6F-7: the player record's `frame` is the GM's last table_hello frame, display-only ──
leg('S9', () => {
  const w = world();
  const p = w.C.createCampaign('player', 'Mine');
  check('S9 a new player record has frame null', camps(w).campaigns[0].frame === null, camps(w).campaigns[0]);
  w.C.apply((s) => w.C.setTable(s, p.id, { campaignId: 'camp_g', gmLabel: 'Dana', frame: { book: 'eote' } }, 5));
  check('S9 table_hello writes table AND its frame', camps(w).campaigns[0].frame && camps(w).campaigns[0].frame.book === 'eote' && camps(w).campaigns[0].table.gmLabel === 'Dana', camps(w).campaigns[0]);
  w.C.apply((s) => w.C.setTable(s, p.id, { campaignId: 'camp_g', gmLabel: 'Dana', frame: null }, 6));
  check('S9 a later hello with frame null clears it (the last hello wins)', camps(w).campaigns[0].frame === null, camps(w).campaigns[0]);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
