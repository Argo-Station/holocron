#!/usr/bin/env node
/**
 * table_link.cjs — lib/shared/tableLink.js, the table link's client (ruling `encounters-e6-plumbing` §3 step 3; the wire
 * `encounters-e6-wire-online` §4/§6 + ADDENDUM 3 H1–H3 + ADDENDUM 4 R-E6W-7; `encounters-e5-wire` §6; brief C3 / P3.1).
 *
 * Two REAL links (a GM and a player) run against a small in-memory relay that keeps the table server's rules
 * (stars only, actorId stamped, type by role) and a fake RTCPeerConnection pair whose channel opens only when the
 * test lets the "Wi-Fi" work. Time is a manual clock. What it shows:
 *   S1–S3  summaryOf: the wire's fields only, every number from its core, null while a pool is null, no committed Force
 *   K1–K2  keys in session storage only; seq survives a reload of the tab
 *   L1     the local attempt starts only after LET IN, with iceServers [] (R-E6W-6.1, R-E6W-4)
 *   L2     channel open → local: play stops riding the server
 *   L3     channel killed → server at once, presence unchanged, the state re-sent (H2 "down")
 *   L4     a late duplicate from the old path is dropped by seq (R-E6W-5)
 *   L5     10 s without an open channel → server, a try spent
 *   L6     retry only on a network change, at most once a minute, 3 tries, reset by rejoin (H2)
 *   L7     permission `denied` → no local attempt (R-E6W-6.3)
 *   L8     a Firefox GM: the player's device starts the handshake (R-E6W-6.4), handed off by `signal {start: true}`
 *   D1     D-E6P1 (b) (ruling `encounters-e6-plumbing-gate`): every hand-off the link sends is `start: true`; a received
 *          signal with none of sdp, candidate or start is bad_frame and starts nothing. The fake relay runs the table
 *          server's own `readFrame` on every signal (table-server/src/rules.mjs), so it cannot pass what the server refuses
 *   X1     C1 end to end (the same ruling): ADD, the channel dies before xp_taken (and, again, a player reload), the GM
 *          re-sends its unacknowledged offer, and the player's campaign (the REAL campaignStore) holds ONE award
 *   P1–P2  presence: here on either path, dropped / lost only when both are down (H2)
 *   R1     the server drops: the link rejoins by key on ?table=, no LET IN, and the GM re-sends its state (§6)
 *   T1–T4  char_update at most one per 2 s · type by role · unknown type · v 2 → bye version · 64 KB
 *   B1     never in a backup: SWRPGBackup.readDevice reads localStorage over LOCAL_KEYS and IndexedDB only, no sessionStorage,
 *          and makeFile drops the link's key (ADDENDUM 6 R-E6P-R9; the CACHE row)
 *
 * `node test/table_link.cjs --bite` runs each mutant on a COPY of tableLink.js (B1's on backup.js, X1's on
 * campaignStore.js); exit 1 if one survives.
 * Run: node test/table_link.cjs
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), os = require('os');
const { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const LINK_SRC = process.env.TABLE_LINK_SRC || path.join(ROOT, 'lib/shared/tableLink.js');
const BACKUP_SRC = process.env.BACKUP_SRC || path.join(ROOT, 'lib/shared/backup.js');
const CAMP_SRC = process.env.CAMP_SRC || path.join(ROOT, 'lib/shared/campaignStore.js');

// [name, the leg it must red, find, replace]
const MUTANTS = [
  ['stun-server', 'L1', 'new env.RTCPeerConnection({ iceServers: [] })', "new env.RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })"],
  ['local-before-admit', 'L1', "case 'opened':                                               // open, rejoin and newcode (ADDENDUM 3 F1–F3)", "case 'opened': if (env.RTCPeerConnection) new env.RTCPeerConnection({ iceServers: [] });"],
  ['no-resend-on-switch', 'L3', "      emit({ kind: 'path', who: role === 'gm' ? p.id : 'gm', path: 'server' });\n      presence(p);\n      resendTo(p);", "      emit({ kind: 'path', who: role === 'gm' ? p.id : 'gm', path: 'server' });\n      presence(p);"],
  ['seq-ignored', 'L4', 'if (!guard.accept(from, msg.type, msg.seq)) return;', 'guard.accept(from, msg.type, msg.seq);'],
  ['no-local-timeout', 'L5', 'var LOCAL_UP_MS = 10 * 1000;', 'var LOCAL_UP_MS = 1e12;'],
  ['retry-any-time', 'L6', 'var LOCAL_GAP_MS = 60 * 1000;', 'var LOCAL_GAP_MS = 0;'],
  ['permission-ignored', 'L7', "return state !== 'denied';", 'return true;'],
  ['gm-always-starts', 'L8', "initiator: role === 'gm' ? !asFirefoxGm : false", "initiator: role === 'gm'"],
  ['presence-server-only', 'P1', "state = (p.local || p.server === 'here') ? 'here'", "state = (p.server === 'here') ? 'here'"],
  ['no-auto-rejoin', 'R1', 'retryTimer = env.setTimeout(function () { retryTimer = null; rejoin(true); }, ms);', 'void ms;'],
  ['summary-without-pool', 'S2', 'if (!cool || !vigil) return null;', 'cool = cool || {}; vigil = vigil || {};'],
  ['keys-in-localStorage', 'K1', "storage: (function () { try { return global.sessionStorage; }", "storage: (function () { try { return global.localStorage; }"],
  ['seq-from-zero', 'K2', 'var seq = Math.max((keys && keys.seq) || 0, env.now());', 'var seq = 0;'],
  ['char-update-unthrottled', 'T1', 'var CHAR_UPDATE_MS = 2000;', 'var CHAR_UPDATE_MS = 0;'],
  ['handoff-unnamed', 'L8', "else if (role === 'gm') signal(p, { start: true });", "else if (role === 'gm') signal(p, {});"],
  ['empty-signal-starts', 'D1', 'if (f.start === true) {', 'if (f.start === true || (f.sdp == null && f.candidate == null)) {'],
];
// the copies of OTHER modules: [name, leg, env var, source, find, replace]
const OTHER_MUTANTS = [
  ['backup-takes-link-key', 'B1', 'BACKUP_SRC', BACKUP_SRC, 'var LOCAL_KEYS = LOCAL.map(function (r) { return r[0]; });',
    "LOCAL.push(['swrpg_table_link_v1', 'CACHE']); var LOCAL_KEYS = LOCAL.map(function (r) { return r[0]; });"],
  ['offer-revives', 'X1', 'CAMP_SRC', CAMP_SRC, "if (c.handled.indexOf(str(offer.offerId)) !== -1) return c;", ''],
];

if (process.argv.includes('--bite')) {
  let bad = 0;
  const src = fs.readFileSync(LINK_SRC, 'utf8');
  for (const [name, leg, find, repl] of MUTANTS) {
    if (src.split(find).length !== 2) { console.log('  BROKEN MUTANT ' + name); bad++; continue; }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'table-link-'));
    const f = path.join(tmp, 'tableLink.js');
    fs.writeFileSync(f, src.replace(find, repl));
    const r = spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { TABLE_LINK_SRC: f }), encoding: 'utf8' });
    const ok = r.status === 1 && new RegExp('FAIL  ' + leg + ' ').test(r.stdout);
    console.log((ok ? '  BIT   ' : '  MISSED') + ' ' + name.padEnd(24) + ' → ' + leg + (ok ? '' : ' (exit ' + r.status + ')'));
    if (!ok) bad++;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  // B1's mutant on a copy of backup.js (the link's key joins LOCAL); X1's on a copy of campaignStore.js (no handled check)
  for (const [name, leg, envVar, file, find, repl] of OTHER_MUTANTS) {
    const osrc = fs.readFileSync(file, 'utf8');
    if (osrc.split(find).length !== 2) { console.log('  BROKEN MUTANT ' + name); bad++; continue; }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'table-link-'));
    const f = path.join(tmp, path.basename(file));
    fs.writeFileSync(f, osrc.replace(find, repl));
    const r = spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { [envVar]: f }), encoding: 'utf8' });
    const ok = r.status === 1 && new RegExp('FAIL  ' + leg + ' ').test(r.stdout);
    console.log((ok ? '  BIT   ' : '  MISSED') + ' ' + name.padEnd(24) + ' → ' + leg + (ok ? '' : ' (exit ' + r.status + ')'));
    if (!ok) bad++;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(bad ? bad + ' mutant(s) survived' : 'every mutant bit (' + (MUTANTS.length + OTHER_MUTANTS.length) + ')');
  process.exit(bad ? 1 : 0);
}

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ok    ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail !== undefined ? '  -> ' + JSON.stringify(detail).slice(0, 400) : '')); }
}

// ── the cores in a vm (as test/f100_force_flip.cjs loads them) ─────────────────────────────────────────────────────
const C = (f) => JSON.parse(read('public/data/canonical/' + f));
const vocab = C('skills.vocab.json').entries;
const CB = { species: C('species.json').species, careers: C('careers.json').careers, specializations: C('specializations.json').specializations,
  talents: C('talents.json').talents, forcePowers: C('force_powers.json').force_powers, signatureAbilities: C('signature_abilities.json').signature_abilities,
  skillSheetKeys: {}, skillChars: {}, skillNames: {}, skillGroups: {} };
vocab.forEach((e) => { CB.skillSheetKeys[e.id] = (e.aliases || []).find((a) => /^[A-Z]+$/.test(a)) || e.id; CB.skillNames[e.id] = e.label;
  if (e.characteristic) CB.skillChars[e.id] = e.characteristic; if (e.group) CB.skillGroups[e.id] = e.group; });
const FILES = ['lib/items.js', 'lib/shared/itemResolve.js', 'lib/shared/speciesRules.js', 'lib/shared/forceRules.js', 'lib/shared/engineRules.js',
  'lib/shared/textHash.js', 'lib/shared/charResolve.js', 'lib/shared/diceEngine.js', 'lib/shared/effectClass.js', 'lib/shared/poolMods.js',
  'lib/shared/qualityRows.js', 'lib/shared/packValidate.js', 'lib/shared/itemRegistries.js', 'lib/shared/sheetPool.js'];
function world() {
  const sb = { console, JSON, Math, Object, Array, String, Number, Boolean, isFinite, isNaN, parseInt, parseFloat, RegExp, Date, WeakMap, Map, Set, Symbol, Error,
    Promise, TextEncoder, TextDecoder, location: { search: '', pathname: '/player/' }, navigator: { userAgent: 'node' } };
  sb.window = sb; sb.global = sb; sb.globalThis = sb; sb.self = sb; sb.addEventListener = function () {}; sb.removeEventListener = function () {}; sb.dispatchEvent = function () {};
  vm.createContext(sb);
  for (const f of FILES) { sb.module = { exports: {} }; vm.runInContext(read(f), sb, { filename: f }); }
  sb.module = { exports: {} };
  vm.runInContext(fs.readFileSync(LINK_SRC, 'utf8'), sb, { filename: 'tableLink.js' });
  sb.module = undefined;
  const W = C('weapons.json').weapons, A = C('armor.json').armor, G = C('gear.json').gear;
  sb._canonicalRegistries = { skills: vocab, weapons: W, armor: A, gear: G, attachments: C('attachments.json').attachments };
  sb._canonicalRegistriesBase = sb._canonicalRegistries;
  sb._canonicalCharbuild = CB; sb._canonicalCharbuildBase = CB;
  sb.SWRPGSpeciesRules.setForTest(null); sb.SWRPGEngineRules.setForTest(null);
  return sb;
}
const sb = world();
const TL = sb.SWRPGTableLink;

// ── S: summaryOf ──
const sheet = JSON.parse(read('test/fixtures/f100_m13_character.json')).sheetData;
sheet.currentWounds = 4; sheet.currentStrain = 1;
const s = TL.summaryOf(sheet);
const eq = sb.SWRPGSheetPool.resolveSheetEquipment(sheet.equipment, sheet);
const d = sb.CharResolve.computeDerived(sheet, eq, CB);
const mods = sb.SWRPGSheetPool.collectPoolMods(eq);
const cool = sb.SWRPGSheetPool.sheetPoolOf(sheet, 'COOL', mods), vig = sb.SWRPGSheetPool.sheetPoolOf(sheet, 'VIGIL', mods);
check('S1 the summary carries the wire\'s fields and nothing else (wire §6)', s && JSON.stringify(Object.keys(s).sort()) === JSON.stringify(['career', 'defense', 'name', 'pools', 'soak', 'species', 'strain', 'wounds']), s && Object.keys(s));
check('S1 every number is its core\'s: thresholds, soak and defence from computeDerived, current values from the sheet',
  s && s.wounds.threshold === d.woundThreshold && s.strain.threshold === d.strainThreshold && s.soak === d.soak
  && s.defense.melee === d.meleeDefense && s.defense.ranged === d.rangedDefense && s.wounds.current === 4 && s.strain.current === 1
  && d.woundThreshold > 0, { s, d: { w: d.woundThreshold, st: d.strainThreshold, soak: d.soak } });
check('S1 the pools are sheetPoolOf\'s: Cool off Presence 2 → 2 green, Vigilance off Willpower 3 → 3 green (no ranks)',
  s && JSON.stringify(s.pools.cool) === JSON.stringify(Object.assign({}, cool)) && JSON.stringify(s.pools.vigilance) === JSON.stringify(Object.assign({}, vig))
  && s.pools.cool.ability === 2 && s.pools.vigilance.ability === 3, s && s.pools);
check('S1 names: the sheet\'s name and species, the career by buildNamesOf', s && s.name === 'Renna Tide' && s.species === 'Selkath' && s.career === 'Smuggler', s);
const keepCB = sb._canonicalCharbuild; sb._canonicalCharbuild = null; sb._canonicalCharbuildBase = null;
const sNull = TL.summaryOf(sheet);
sb._canonicalCharbuild = keepCB; sb._canonicalCharbuildBase = keepCB;
check('S2 null while a pool is null (the vocabulary not loaded, R-M7G-9)', sNull === null, sNull);
check('S3 no committed Force and nothing past the summary: no xp, talents, gear or forceCommitted', s && !('xp' in s) && !('talents' in s) && !('forceCommitted' in s) && !JSON.stringify(s).includes('credits'));

// the player's device for X1: the REAL roster, party store and campaign store over one localStorage (as campaign_store.cjs)
function campWorld() {
  const store = { swrpg_saved_characters: JSON.stringify({ version: 1, characters: [{ id: 'a', name: 'Kael', source: 'custom', selectedChar: { id: 'a', name: 'Kael' },
    sheetData: { name: 'Kael', xp: { total: 110, spent: 100, remaining: 10 } }, updatedAt: 1 }] }) };
  const ls = { getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  let n = 0;
  const ctx = { localStorage: ls, SWRPGVersionGuard: require('../lib/shared/versionGuard.js'), SWRPGRecordPortrait: require('../lib/shared/recordPortrait.js'),
    CharResolve: { repairPoisonedXp: require('../lib/shared/charResolve.js').repairPoisonedXp }, console, Date, JSON, Math, crypto: { randomUUID: () => 'x' + (++n) } };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('lib/shared/roster.js'), ctx, { filename: 'roster.js' });
  vm.runInContext(read('lib/shared/partyStore.js'), ctx, { filename: 'partyStore.js' });
  vm.runInContext(fs.readFileSync(CAMP_SRC, 'utf8'), ctx, { filename: 'campaignStore.js' });
  return { store, C: ctx.SWRPGCampaigns };
}

// ── the fakes: a manual clock, storage, a relay with the server's rules, an RTC pair ──
function harness(opts) {
  opts = opts || {};
  let now = 1_000_000, timers = [], tid = 0;
  const clock = {
    now: () => now,
    setTimeout: (f, ms) => { const id = ++tid; timers.push({ id, at: now + (ms || 0), f }); return id; },
    clearTimeout: (id) => { timers = timers.filter((t) => t.id !== id); },
    async advance(ms) {
      const end = now + ms;
      for (;;) {
        await flush();
        timers.sort((a, b) => a.at - b.at);
        const t = timers[0];
        if (!t || t.at > end) break;
        timers.shift(); now = t.at; t.f();
      }
      now = end; await flush();
    },
  };
  const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
  function store() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m }; }

  // the relay: one table, the server's §4 rules as far as this client's tests need them
  const relay = { gm: null, players: {}, seats: {}, knocks: {}, plays: 0, frames: [], tableId: 'tbl-1', down: false, nextKnock: 1 };
  class FakeWS {
    constructor(url) {
      this.url = url; this.readyState = 0; relay.frames.push({ open: url });
      if (relay.down) { Promise.resolve().then(() => { this.readyState = 3; this.onclose && this.onclose({}); }); return; }
      Promise.resolve().then(() => { this.readyState = 1; this.onopen && this.onopen({}); });
    }
    send(text) { if (this.readyState !== 1) throw new Error('not open'); Promise.resolve().then(() => serverGot(this, JSON.parse(text))); }
    close() { if (this.readyState === 3) return; this.readyState = 3; serverLost(this); const cb = this.onclose; Promise.resolve().then(() => cb && cb({})); }
    deliver(f) { if (this.readyState === 1) Promise.resolve().then(() => this.onmessage && this.onmessage({ data: JSON.stringify(Object.assign({ v: 1 }, f)) })); }
    drop() { if (this.readyState === 3) return; this.readyState = 3; serverLost(this); this.onclose && this.onclose({}); }
  }
  function serverLost(ws) {
    if (ws === relay.gm) { relay.gm = null; Object.values(relay.players).forEach((p) => p.deliver({ t: 'table', state: 'gm_away' })); }
    for (const k of Object.keys(relay.players)) if (relay.players[k] === ws) { delete relay.players[k]; if (relay.gm) relay.gm.deliver({ t: 'peer', knockId: k, state: 'dropped' }); }
  }
  function serverGot(ws, f) {
    relay.frames.push(f);
    if (f.t === 'open') { relay.gm = ws; ws.role = 'gm'; return ws.deliver({ t: 'opened', code: 'ABC123', codeExpiresAt: 0, gmKey: 'gm-key', tableId: relay.tableId }); }
    if (f.t === 'join') { const k = 'k' + relay.nextKnock++; relay.knocks[k] = ws; ws.knockId = k; if (relay.gm) relay.gm.deliver({ t: 'knock', knockId: k, deviceLabel: f.deviceLabel }); return; }
    if (f.t === 'admit') { const p = relay.knocks[f.knockId]; delete relay.knocks[f.knockId]; relay.players[f.knockId] = p; p.role = 'player'; relay.seats[f.knockId] = 'seat-' + f.knockId;
      p.deliver({ t: 'admitted', seatKey: relay.seats[f.knockId], tableId: relay.tableId }); return relay.gm.deliver({ t: 'peer', knockId: f.knockId, state: 'here' }); }
    if (f.t === 'rejoin') {
      if (f.gmKey === 'gm-key') { relay.gm = ws; ws.role = 'gm'; ws.deliver({ t: 'opened', code: 'ABC123', codeExpiresAt: 0, tableId: relay.tableId });
        Object.keys(relay.seats).forEach((k) => ws.deliver({ t: 'peer', knockId: k, state: relay.players[k] ? 'here' : 'dropped' }));
        Object.values(relay.players).forEach((p) => p.deliver({ t: 'table', state: 'here' })); return; }
      const k = Object.keys(relay.seats).find((x) => relay.seats[x] === f.seatKey);
      if (!k) return ws.deliver({ t: 'error', code: 'closed' });
      relay.players[k] = ws; ws.role = 'player'; ws.knockId = k; ws.deliver({ t: 'table', state: relay.gm ? 'here' : 'gm_away' });
      if (relay.gm) relay.gm.deliver({ t: 'peer', knockId: k, state: 'here' }); return;
    }
    if (f.t === 'play') {
      relay.plays++;
      const allowed = ws.role === 'gm' ? ['table_hello', 'party', 'xp_offer', 'bye'] : ['join', 'char_update', 'xp_taken', 'bye'];
      if (allowed.indexOf(f.msg.type) === -1) return ws.deliver({ t: 'error', code: 'bad_frame' });
      const msg = Object.assign({}, f.msg, { actorId: ws.role === 'gm' ? 'gm' : ws.knockId });
      if (ws.role === 'gm') Object.keys(relay.players).forEach((k) => { if (f.to === 'all' || f.to === k) relay.players[k].deliver({ t: 'play', msg }); });
      else if (relay.gm) relay.gm.deliver({ t: 'play', msg });
      return;
    }
    if (f.t === 'signal') {
      if (!RULES.readFrame(JSON.stringify(Object.assign({ v: 1 }, f))).ok) return ws.deliver({ t: 'error', code: 'bad_frame' });   // the server's own fence
      const out = { t: 'signal', knockId: ws.role === 'gm' ? f.knockId : ws.knockId };
      if (f.sdp != null) out.sdp = f.sdp; if (f.candidate != null) out.candidate = f.candidate; if (f.start === true) out.start = true;
      if (ws.role === 'gm') { const p = relay.players[f.knockId]; if (p) p.deliver(out); } else if (relay.gm) relay.gm.deliver(out);
    }
  }

  // the RTC pair: an offer names its pc; the channel opens when both descriptions are set AND lan.works
  const lan = { works: true, pcs: [], byName: {}, n: 0 };
  class FakeDC {
    constructor(label, pc) { this.label = label; this.pc = pc; this.readyState = 'connecting'; this.peer = null; this.sent = []; }
    send(t) { if (this.readyState !== 'open') throw new Error('dc not open'); this.sent.push(t); const p = this.peer; Promise.resolve().then(() => p && p.readyState === 'open' && p.onmessage && p.onmessage({ data: t })); }
    close() { if (this.readyState === 'closed') return; this.readyState = 'closed'; this.onclose && this.onclose({}); const p = this.peer; if (p && p.readyState !== 'closed') { p.readyState = 'closed'; p.onclose && p.onclose({}); } }
  }
  class FakePC {
    constructor(cfg) { this.cfg = cfg; this.name = 'pc' + (++lan.n); lan.pcs.push(this); lan.byName[this.name] = this; this.localDescription = null; this.remoteDescription = null; this.dc = null; this.closed = false; this.connectionState = 'new'; this.remotePc = null; }
    createDataChannel(label) { this.dc = new FakeDC(label, this); this.madeChannel = true; return this.dc; }
    async createOffer() { return { type: 'offer', sdp: this.name }; }
    async createAnswer() { return { type: 'answer', sdp: this.name }; }
    async setLocalDescription(dsc) { this.localDescription = dsc; Promise.resolve().then(() => this.onicecandidate && this.onicecandidate({ candidate: { candidate: 'host ' + this.name, toJSON() { return { candidate: this.candidate }; } } })); this.tryOpen(); }
    async setRemoteDescription(dsc) { this.remoteDescription = dsc; this.remotePc = lan.byName[dsc.sdp]; if (this.remotePc) this.remotePc.remotePc = this; this.tryOpen(); }
    async addIceCandidate() {}
    tryOpen() {
      const a = this, b = this.remotePc;
      if (!b || !lan.works || a.closed || b.closed || !a.localDescription || !a.remoteDescription || !b.localDescription || !b.remoteDescription) return;
      const off = a.dc ? a : b, ans = off === a ? b : a;
      if (!off.dc || off.dc.readyState !== 'connecting') return;
      const other = new FakeDC(off.dc.label, ans); other.peer = off.dc; off.dc.peer = other; ans.dc = other;
      Promise.resolve().then(() => { if (off.closed || ans.closed) return; off.dc.readyState = 'open'; other.readyState = 'open';
        ans.ondatachannel && ans.ondatachannel({ channel: other }); off.dc.onopen && off.dc.onopen({}); other.onopen && other.onopen({}); });
    }
    close() { this.closed = true; this.connectionState = 'closed'; }
  }

  const listeners = {};
  function makeEnv(storage, ua, perm) {
    return {
      WebSocket: FakeWS, RTCPeerConnection: opts.noRtc ? undefined : FakePC,
      setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, now: clock.now, storage,
      navigator: { userAgent: ua || 'Chrome/147', permissions: perm ? { query: async (q) => ({ state: perm[q.name] || 'prompt' }) } : undefined },
      on: (n, f) => { (listeners[n] = listeners[n] || []).push(f); }, off: () => {},
    };
  }
  function link(role, storage, o) {
    o = o || {};
    const events = [];
    const l = TL.createLink({ role, server: 'wss://table.test', onEvent: (e) => events.push(e), env: makeEnv(storage, o.ua, o.perm) });
    l.events = events;
    l.msgs = (type) => events.filter((e) => e.kind === 'message' && e.env.type === type);
    l.presence = (who) => { const p = events.filter((e) => e.kind === 'presence' && e.who === who); return p.length ? p[p.length - 1].state : null; };
    l.path = (who) => { const p = events.filter((e) => e.kind === 'path' && e.who === who); return p.length ? p[p.length - 1].path : 'server'; };
    return l;
  }
  async function table(o) {
    o = o || {};
    const gs = store(), ps = store();
    const gm = link('gm', gs, o.gm), pl = link('player', ps, o.player);
    gm.open('Night', false); await clock.advance(0);
    pl.join({ code: 'abc-123' }, 'Renna'); await clock.advance(0);
    const knock = gm.events.find((e) => e.kind === 'frame' && e.f.t === 'knock');
    const before = lan.pcs.length;
    if (o.beforeAdmit) o.beforeAdmit();
    gm.admit(knock.f.knockId); await clock.advance(0);
    return { gm, pl, gs, ps, knockId: knock.f.knockId, pcsBeforeAdmit: before };
  }
  return { clock, relay, lan, listeners, table, link, store, net: async () => { (listeners.online || []).forEach((f) => f()); await clock.advance(0); } };
}

let RULES = null;
(async () => {
  RULES = await import(require('url').pathToFileURL(path.join(ROOT, 'table-server/src/rules.mjs')).href);
  // ── K1 keys in session storage only ──
  {
    const H = harness({ noRtc: true });
    const T = await H.table();
    const g = JSON.parse(T.gs.getItem(TL.KEYS_KEY) || 'null'), p = JSON.parse(T.ps.getItem(TL.KEYS_KEY) || 'null');
    check('K1 the GM\'s gmKey and tableId, and the player\'s seatKey, sit in the storage the link was given (session storage by default)',
      g && g.gmKey === 'gm-key' && g.tableId === 'tbl-1' && p && p.seatKey === 'seat-' + T.knockId && p.tableId === 'tbl-1', { g, p });
    // the default storage is sessionStorage, never localStorage
    const s2 = { console, JSON, Math, Object, Array, String, Number, Promise, Date, isFinite };
    const ss = H.store(), ls = H.store();
    s2.window = s2; s2.sessionStorage = ss; s2.localStorage = ls; s2.WebSocket = class { send() {} close() {} };
    s2.setTimeout = setTimeout; s2.clearTimeout = clearTimeout;
    vm.createContext(s2); s2.module = { exports: {} }; vm.runInContext(fs.readFileSync(LINK_SRC, 'utf8'), s2); s2.module = undefined;
    const L = s2.SWRPGTableLink.createLink({ role: 'gm', server: 'wss://x', onEvent() {} });
    L.send('table_hello', { name: 'x' });   // writes seq beside keys only when keys exist; force a key write
    s2.sessionStorage.setItem(TL.KEYS_KEY, JSON.stringify({ v: 1, role: 'gm', tableId: 't', gmKey: 'k', seq: 5 }));
    const L2 = s2.SWRPGTableLink.createLink({ role: 'gm', server: 'wss://x', onEvent() {} });
    check('K1 with no storage given, the link reads its keys from sessionStorage and never touches localStorage', L2.hasKeys() && ls._m.size === 0, { ls: [...ls._m.keys()] });
    L.dispose(); L2.dispose();

    // ── K2 seq survives a reload ──
    T.gm.send('table_hello', { name: 'Night' }); await H.clock.advance(0);
    const seq1 = T.pl.msgs('table_hello').slice(-1)[0].env.seq;
    T.gm.dispose();
    const gm2 = H.link('gm', T.gs);           // the reloaded tab: same session storage, a clock that has NOT moved
    gm2.rejoin(); await H.clock.advance(0);
    gm2.send('table_hello', { name: 'Night, after reload' }); await H.clock.advance(0);
    const after = T.pl.msgs('table_hello').slice(-1)[0];
    check('K2 after a reload the GM\'s seq starts above its last, so the player applies its next table_hello', after && after.env.payload.name === 'Night, after reload' && after.env.seq > seq1, { seq1, after: after && after.env.seq });
  }

  // ── L1 the local attempt waits for LET IN; iceServers [] ──
  {
    const H = harness();
    const T = await H.table();
    check('L1 no RTCPeerConnection exists before LET IN (R-E6W-6.1)', T.pcsBeforeAdmit === 0, T.pcsBeforeAdmit);
    check('L1 after LET IN both devices hold a connection, each with iceServers [] and nothing else (R-E6W-4)',
      H.lan.pcs.length === 2 && H.lan.pcs.every((pc) => JSON.stringify(pc.cfg) === '{"iceServers":[]}'), H.lan.pcs.map((pc) => pc.cfg));
    check('L1 the GM\'s device made the channel (it starts the handshake), labelled holocron-table',
      H.lan.pcs[0].madeChannel && !H.lan.pcs[1].madeChannel && H.lan.pcs[0].dc.label === 'holocron-table');

    // ── L2 channel open → local ──
    check('L2 the channel opened: both sides on the local path', T.gm.path(T.knockId) === 'local' && T.pl.path('gm') === 'local', { gm: T.gm.path(T.knockId), pl: T.pl.path('gm') });
    const playsBefore = H.relay.plays;
    T.gm.send('table_hello', { name: 'Night' }); T.gm.send('party', { party: { id: 'party_1' } });
    T.pl.send('join', { who: 'char:1', summary: { name: 'Renna' } });
    await H.clock.advance(0);
    check('L2 play rides the channel: nothing new through the server, and each side received it', H.relay.plays === playsBefore
      && T.pl.msgs('table_hello').length === 1 && T.gm.msgs('join').length === 1 && T.gm.msgs('join')[0].env.actorId === T.knockId,
      { plays: H.relay.plays - playsBefore, hello: T.pl.msgs('table_hello').length, join: T.gm.msgs('join').length });
    T.gm.send('xp_offer', { offerId: 'o1', amount: 10, fromLabel: 'GM' }); await H.clock.advance(0);
    const lateHello = H.lan.pcs[0].dc.sent.find((t) => JSON.parse(t).type === 'table_hello');

    // ── L3 kill the channel → server at once ──
    const helloN = T.pl.msgs('table_hello').length, offerN = T.pl.msgs('xp_offer').length, joinN = T.gm.msgs('join').length;
    H.lan.works = false;
    H.lan.pcs[0].dc.close(); await H.clock.advance(0);
    check('L3 the channel closed: that player is on the server path at once, with no presence change',
      T.gm.path(T.knockId) === 'server' && T.pl.path('gm') === 'server' && T.gm.presence(T.knockId) === 'here' && T.pl.presence('gm') === 'here',
      { path: T.gm.path(T.knockId), pres: T.gm.presence(T.knockId) });
    check('L3 on the switch the GM re-sent table_hello, party and the unacknowledged xp_offer, and the player its join',
      T.pl.msgs('table_hello').length === helloN + 1 && T.pl.msgs('party').length === 2 && T.pl.msgs('xp_offer').length === offerN + 1 && T.gm.msgs('join').length === joinN + 1,
      { hello: T.pl.msgs('table_hello').length - helloN, offer: T.pl.msgs('xp_offer').length - offerN, join: T.gm.msgs('join').length - joinN });
    const playsAt = H.relay.plays;
    T.gm.send('table_hello', { name: 'Night, scene 2' }); await H.clock.advance(0);
    check('L3 play continues over the server', H.relay.plays === playsAt + 1 && T.pl.msgs('table_hello').slice(-1)[0].env.payload.name === 'Night, scene 2');

    // ── L4 a late duplicate from the old path ──
    const n = T.pl.msgs('table_hello').length;
    H.relay.players[T.knockId].deliver({ t: 'play', msg: Object.assign(JSON.parse(lateHello), { actorId: 'gm' }) }); await H.clock.advance(0);
    check('L4 a late table_hello with an older seq is dropped: the newer one stands (R-E6W-5)', T.pl.msgs('table_hello').length === n, { before: n, after: T.pl.msgs('table_hello').length });
    T.pl.send('xp_taken', { offerId: 'o1', took: true }); await H.clock.advance(0);
    check('L4 xp_taken passes, and its offer is no longer re-sent', T.gm.msgs('xp_taken').length === 1);

    // ── L6 retries: only on a network change, once a minute, 3 tries, reset by rejoin ──
    const pcs0 = H.lan.pcs.length;
    await H.clock.advance(120000);
    check('L6 no retry without a network change, however long', H.lan.pcs.length === pcs0, H.lan.pcs.length - pcs0);
    await H.net();
    check('L6 a network change after a minute retries once (a try the channel will not open in)', H.lan.pcs.length === pcs0 + 2, H.lan.pcs.length - pcs0);
    await H.clock.advance(11000); await H.net();
    check('L6 a second network change inside the minute does not retry', H.lan.pcs.length === pcs0 + 2, H.lan.pcs.length - pcs0);
    await H.clock.advance(60000); await H.net(); await H.clock.advance(11000);
    await H.clock.advance(60000); await H.net(); await H.clock.advance(11000);
    const at3 = H.lan.pcs.length;
    await H.clock.advance(60000); await H.net(); await H.clock.advance(11000);
    check('L6 three failed tries in all, then no more (H2)', at3 === pcs0 + 6 && H.lan.pcs.length === at3, { tries: (at3 - pcs0) / 2, after: H.lan.pcs.length - at3 });
    H.lan.works = true;
    H.relay.gm.drop(); await H.clock.advance(1000); await H.clock.advance(0);
    check('L6 a rejoin resets the tries: the GM\'s device tries again and the channel opens', T.gm.path(T.knockId) === 'local', { pcs: H.lan.pcs.length - at3, path: T.gm.path(T.knockId) });
  }

  // ── L5 10 s with no open channel ──
  {
    const H = harness();
    H.lan.works = false;
    const T = await H.table();
    const pc = H.lan.pcs[0];
    await H.clock.advance(9000);
    const at9 = pc.closed;
    await H.clock.advance(1500);
    check('L5 the try is abandoned at 10 s, not before: its connection closed and play stays on the server', !at9 && pc.closed && T.gm.path(T.knockId) === 'server', { at9, closed: pc.closed });
  }

  // ── L7 permission denied ──
  {
    const H = harness();
    await H.table({ gm: { perm: { 'local-network': 'denied' } }, player: { perm: { 'local-network-access': 'denied' } } });
    check('L7 `local-network` (or its alias) denied: no connection is made (R-E6W-6.3)', H.lan.pcs.length === 0, H.lan.pcs.length);
    const H2 = harness();
    await H2.table({ gm: { perm: {} }, player: { perm: {} } });
    check('L7 a query that answers `prompt` still tries', H2.lan.pcs.length === 2, H2.lan.pcs.length);
  }

  // ── L8 a Firefox GM ──
  {
    const H = harness();
    const T = await H.table({ gm: { ua: 'Mozilla/5.0 (Macintosh) Gecko/20100101 Firefox/151.0' } });
    check('L8 a Firefox GM: the player\'s device made the channel and the link opened', H.lan.pcs.length === 2 && H.lan.pcs[0].madeChannel && T.gm.path(T.knockId) === 'local'
      && H.relay.frames.some((f) => f.t === 'signal' && f.start === true), { made: H.lan.pcs.map((p) => !!p.madeChannel), path: T.gm.path(T.knockId) });
    check('L8 …and it was the player\'s offer: the GM\'s connection holds the player\'s description', H.lan.pcs.length === 2 && H.lan.pcs[0].remoteDescription
      && H.lan.pcs[0].remoteDescription.type === 'answer' && H.lan.pcs[1].remoteDescription && H.lan.pcs[1].remoteDescription.type === 'offer');
  }

  // ── D1 D-E6P1 (b): the hand-off by name; an empty signal refused ──
  {
    const H = harness();
    const T = await H.table({ gm: { ua: 'Mozilla/5.0 (Macintosh) Gecko/20100101 Firefox/151.0' } });
    const hand = H.relay.frames.filter((f) => f.t === 'signal' && f.sdp == null && f.candidate == null);
    check('D1 every hand-off the link sent is signal {start: true}, and the server\'s fence passed it (the channel opened)',
      hand.length > 0 && hand.every((f) => f.start === true) && T.gm.path(T.knockId) === 'local', { hand, path: T.gm.path(T.knockId) });
    // a table whose Wi-Fi never works: the 10 s timeout clears both connections, then the frames are delivered
    const H2 = harness();
    const T2 = await H2.table({ beforeAdmit: () => { H2.lan.works = false; } });
    await H2.clock.advance(11000);
    const pcs = H2.lan.pcs.length;
    H2.relay.players[T2.knockId].deliver({ t: 'signal', knockId: T2.knockId });
    await H2.clock.advance(0);
    check('D1 a received signal with no sdp, candidate or start is bad_frame on the client and starts nothing',
      H2.lan.pcs.length === pcs && T2.pl.events.some((e) => e.kind === 'frame' && e.f.t === 'error' && e.f.code === 'bad_frame' && e.f.of === 'signal'),
      { pcs: [pcs, H2.lan.pcs.length], ev: T2.pl.events.filter((e) => e.kind === 'frame').map((e) => e.f) });
    H2.relay.players[T2.knockId].deliver({ t: 'signal', knockId: T2.knockId, start: true });
    await H2.clock.advance(0);
    check('D1 …while the same frame with start: true does start one (the player\'s device makes its connection)', H2.lan.pcs.length > pcs && !!H2.lan.pcs[pcs].madeChannel, [pcs, H2.lan.pcs.length]);
  }

  // ── X1 C1 end to end: one award, through a dead channel and through a reload ──
  {
    const H = harness();
    const T = await H.table();
    const cw = campWorld();
    const camp = cw.C.createCampaign('player', 'Night');
    cw.C.apply((s) => cw.C.attachCharacter(s, camp.id, 'a'));
    const seen = new WeakMap();
    // the player app's glue (the wiring lap's): every xp_offer the link raises goes to addOffer
    const pump = (l) => { const m = l.msgs('xp_offer'); m.slice(seen.get(l) || 0).forEach((e) => cw.C.apply((s) => cw.C.addOffer(s, camp.id, e.env.payload))); seen.set(l, m.length); };
    const xp = () => JSON.parse(cw.store.swrpg_saved_characters).characters[0].sheetData.xp.total;
    const inbox = () => JSON.parse(cw.store.swrpg_campaigns).campaigns[0].inbox.map((o) => o.id);
    T.gm.send('xp_offer', { offerId: 'o1', amount: 10, fromLabel: 'GM' }); await H.clock.advance(0); pump(T.pl);
    const took = cw.C.take(camp.id, 'o1', 'a');
    // the channel dies BEFORE the player's xp_taken goes: the GM still holds o1 unacknowledged and re-sends it on the switch
    H.lan.works = false;
    H.lan.pcs[0].dc.close(); await H.clock.advance(0); pump(T.pl);
    const reSent = T.pl.msgs('xp_offer').filter((e) => e.env.payload.offerId === 'o1').length;
    const again = cw.C.take(camp.id, 'o1', 'a');
    check('X1 a dead channel: ADD, the GM\'s re-sent offer (it arrived again), and the campaign holds ONE award',
      took.ok && reSent >= 2 && inbox().length === 0 && again.ok === false && again.why === 'no-offer' && xp() === 120,
      { took, reSent, inbox: inbox(), again, xp: xp() });
    T.pl.send('xp_taken', { offerId: 'o1', charId: 'a' }); await H.clock.advance(0);
    // a reload: the player's tab forgets its `taken` list; the GM re-sends o2 on the rejoin
    T.gm.send('xp_offer', { offerId: 'o2', amount: 7, fromLabel: 'GM' }); await H.clock.advance(0); pump(T.pl);
    const took2 = cw.C.take(camp.id, 'o2', 'a');
    T.pl.dispose(); H.relay.players[T.knockId] && H.relay.players[T.knockId].drop(); await H.clock.advance(0);
    const pl2 = H.link('player', T.ps); pl2.rejoin(); await H.clock.advance(0); pump(pl2);
    const reSent2 = pl2.msgs('xp_offer').filter((e) => e.env.payload.offerId === 'o2').length;
    const again2 = cw.C.take(camp.id, 'o2', 'a');
    check('X1 a reload: ADD, the rejoin\'s re-sent offer, and still one award each (o1 10 + o2 7)',
      took2.ok && reSent2 >= 1 && inbox().length === 0 && again2.ok === false && again2.why === 'no-offer' && xp() === 127,
      { took2, reSent2, inbox: inbox(), again2, xp: xp() });
  }

  // ── P presence ──
  {
    const H = harness();
    const T = await H.table();
    H.relay.players[T.knockId].drop(); await H.clock.advance(0);
    check('P1 the player\'s server socket drops while the channel is up: the GM still shows it here', T.gm.presence(T.knockId) === 'here', T.gm.presence(T.knockId));
    H.lan.works = false; H.relay.down = true;
    H.lan.pcs[0].dc.close(); await H.clock.advance(0);
    check('P1 both paths down: dropped', T.gm.presence(T.knockId) === 'dropped', T.gm.presence(T.knockId));
    await H.clock.advance(70000);
    check('P2 on the player\'s device, both paths down and its retries spent: lost', T.pl.presence('gm') === 'lost', T.pl.presence('gm'));
  }

  // ── R1 the server drops; rejoin by key ──
  {
    const H = harness({ noRtc: true });
    const T = await H.table();
    T.gm.send('table_hello', { name: 'Night' }); T.gm.send('party', { party: { id: 'party_1' } });
    T.pl.send('join', { who: 'char:1', summary: { name: 'Renna' } }); await H.clock.advance(0);
    const hello = T.pl.msgs('table_hello').length, joins = T.gm.msgs('join').length;
    const opens = H.relay.frames.filter((f) => f.open).length;
    H.relay.players[T.knockId].drop(); H.relay.gm.drop(); await H.clock.advance(0);
    await H.clock.advance(1000);
    const reopened = H.relay.frames.filter((f) => f.open).slice(opens);
    const rejoins = H.relay.frames.filter((f) => f.t === 'rejoin');
    check('R1 both devices reconnect on their own to ?table=<tableId> with a rejoin frame carrying their key, and no join',
      reopened.length === 2 && reopened.every((f) => f.open === 'wss://table.test/t?table=tbl-1') && rejoins.some((f) => f.gmKey === 'gm-key')
      && rejoins.some((f) => f.seatKey === 'seat-' + T.knockId) && H.relay.frames.filter((f) => f.t === 'join').length === 1, { reopened, rejoins });
    check('R1 after the rejoin the GM re-sent table_hello and party, the player its join, with no LET IN', T.pl.msgs('table_hello').length > hello && T.gm.msgs('join').length > joins
      && !T.gm.events.some((e) => e.kind === 'frame' && e.f.t === 'knock' && T.gm.events.indexOf(e) > 5), { hello: T.pl.msgs('table_hello').length - hello, join: T.gm.msgs('join').length - joins });
    check('R1 presence back to here on both devices', T.gm.presence(T.knockId) === 'here' && T.pl.presence('gm') === 'here');
    // the table gone: `closed` ends it and clears the keys
    const H2 = harness({ noRtc: true });
    const ps = H2.store(); ps.setItem(TL.KEYS_KEY, JSON.stringify({ v: 1, role: 'player', tableId: 'tbl-1', seatKey: 'stale', seq: 1 }));
    const L = H2.link('player', ps); L.rejoin(); await H2.clock.advance(0);
    check('R1 a rejoin to an ended table: closed → `ended`, keys cleared', L.events.some((e) => e.kind === 'ended') && ps.getItem(TL.KEYS_KEY) === null);
  }

  // ── T: throttle, rights, unknown, version, size ──
  {
    const H = harness({ noRtc: true });
    const T = await H.table();
    T.pl.send('char_update', { who: 'char:1', summary: { n: 1 } });
    await H.clock.advance(500); T.pl.send('char_update', { who: 'char:1', summary: { n: 2 } });
    await H.clock.advance(500); T.pl.send('char_update', { who: 'char:1', summary: { n: 3 } });
    await H.clock.advance(0);
    const at1 = T.gm.msgs('char_update').length;
    await H.clock.advance(1100);
    const ups = T.gm.msgs('char_update');
    check('T1 char_update at most one per 2 s, the latest winning: one at once, one (n 3) at the 2 s mark', at1 === 1 && ups.length === 2 && ups[1].env.payload.summary.n === 3, { at1, ups: ups.map((u) => u.env.payload.summary.n) });
    check('T2 type by role: a player cannot send table_hello, nor the GM join', T.pl.send('table_hello', {}) === false && T.gm.send('join', {}) === false);
    H.relay.players[T.knockId].deliver({ t: 'play', msg: { v: 1, ts: 0, actorId: 'gm', type: 'join', payload: {}, seq: 9e15 } });
    H.relay.players[T.knockId].deliver({ t: 'play', msg: { v: 1, ts: 0, actorId: 'gm', type: 'map_ping', payload: {}, seq: 9e15 } });
    await H.clock.advance(0);
    check('T3 a player-only type from the GM is not applied; an unknown type is one `unknown` event, never applied',
      T.pl.msgs('join').length === 0 && T.pl.events.filter((e) => e.kind === 'unknown' && e.type === 'map_ping').length === 1 && T.pl.msgs('map_ping').length === 0);
    const byes = H.relay.frames.filter((f) => f.t === 'play' && f.msg.type === 'bye').length;
    H.relay.players[T.knockId].deliver({ t: 'play', msg: { v: 2, ts: 0, actorId: 'gm', type: 'table_hello', payload: {}, seq: 9e15 } });
    await H.clock.advance(0);
    const bye = H.relay.frames.filter((f) => f.t === 'play' && f.msg.type === 'bye').slice(byes)[0];
    check('T3 a v 2 envelope: the player sends bye reason version and raises `version`', bye && bye.msg.payload.reason === 'version' && T.pl.events.some((e) => e.kind === 'version'), bye);
    check('T4 a message over 64 KB is refused before it is sent', T.gm.send('party', { party: { pad: 'x'.repeat(66000) } }) === false);
  }

  // ── B1 never in a backup (R-E6P-R9) ──
  {
    const bsrc = fs.readFileSync(BACKUP_SRC, 'utf8');
    const bsb = { console, JSON, Math, Object, Array, String, Number, Boolean, Promise, Date, isFinite, RegExp, Error };
    bsb.window = bsb; bsb.globalThis = bsb; vm.createContext(bsb);
    bsb.module = { exports: {} }; vm.runInContext(read('lib/shared/syncMerge.js'), bsb, { filename: 'syncMerge.js' });
    bsb.module = { exports: {} }; vm.runInContext(bsrc, bsb, { filename: 'backup.js' });
    const B = bsb.module.exports && bsb.module.exports.makeFile ? bsb.module.exports : bsb.SWRPGBackup;
    const localKeys = (B.LOCAL || []).map((r) => r[0]);
    check('B1 the backup\'s exporter (SWRPGBackup.readDevice) reads no sessionStorage: backup.js never names it',
      !/sessionStorage/.test(bsrc) && /API\.readDevice = function/.test(bsrc), { sessionStorage: /sessionStorage/.test(bsrc) });
    check('B1 the link\'s key is not among the backup\'s LOCAL keys', localKeys.length > 0 && localKeys.indexOf(TL.KEYS_KEY) === -1, localKeys.length);
    const file = B.makeFile({ local: { [TL.KEYS_KEY]: '{"v":1,"gmKey":"k"}', swrpg_campaigns: '{"version":1,"campaigns":[]}' }, idb: {} }, 1, 'x');
    check('B1 makeFile drops the link\'s key even when a state carries it, and keeps a backed-up key beside it',
      !JSON.stringify(file).includes(TL.KEYS_KEY) && file.local && file.local.swrpg_campaigns != null, file && file.local);
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('  FAIL  harness threw: ' + (e && e.stack || e)); console.log('\n' + pass + ' passed, ' + (fail + 1) + ' failed'); process.exit(1); });
