#!/usr/bin/env node
/**
 * npc_cast_store.cjs — STANDING guard for the My Cast persistence contract
 * (lib/library/npc/castStore.js; GM table-mode Lap C1, scope gm-lap-c1-cast-store-scope.md).
 *
 * Pins the durable custom-NPC record shape (the "two-faces" contract) so a future edit — especially
 * C2's editor — can't silently break it:
 *   1. emptyState / normalize: schema-versioned; garbage degrades to empty, never throws; forward-tolerant.
 *   2. cloneFromRecord copies EVERY source field verbatim + stamps _provenance:'custom',
 *      _source_key:'custom:*' (== key), card:null, attachedProfileKey:null, timestamps; returns {state,key};
 *      immutable (source state + source record untouched).
 *   3. update/delete round-trip; updateNpc merges (card shaped) but CANNOT change identity.
 *   4. normalize drops a custom with no _source_key (unresolvable ghost) + shapes a stored card.
 *   7. R-NPC-13 (ruling npc-library-paper-concept AMENDMENT 1): a custom's weapons[] carries two lanes —
 *      a canon weapon as its registry ID STRING, a hand weapon as the object with `range` in the
 *      personal-scale bands and `skill` in the six combat skills — and both round-trip the store.
 *
 * B-757 (census npc-library-foundations): the clone legs drive REAL records read from the shipped
 * registry (public/data/canonical/npcs.json), chosen by property — one whose weapons are all id-ref
 * strings and one carrying an inline weapon object — never a hand-made object. The vocabularies the
 * hand lane is held to are READ (skills.vocab.json's combat group; the weapons registry's ranges).
 *
 * Run:  node test/npc_cast_store.cjs   (pure logic over the shipped data files; no browser)
 */
const S = require('../lib/library/npc/castStore.js');
const REG = require('../public/data/canonical/npcs.json').npcs;
const WEAPONS = require('../public/data/canonical/weapons.json').weapons;
const SKILLS = require('../public/data/canonical/skills.vocab.json').entries;

let failures = 0;
function check(label, cond) {
  if (cond) { console.log('  PASS  ' + label); }
  else { failures += 1; console.error('  FAIL  ' + label); }
}

// REAL registry records (B-757), chosen by property in a stable (id-sorted) order so the guard
// follows the data. `canonLane`: a minion whose weapons are all registry id strings (the id-ref lane
// WeaponTable resolves at render); `inlineLane`: the first record carrying an inline weapon object.
const BY_ID = Object.values(REG).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
const CANON_LANE = BY_ID.find(r => r.tier === 'minion' && Array.isArray(r.weapons) && r.weapons.length > 1
  && r.weapons.every(w => typeof w === 'string'));
const INLINE_LANE = BY_ID.find(r => Array.isArray(r.weapons) && r.weapons.some(w => w && typeof w === 'object'));
if (!CANON_LANE || !INLINE_LANE) { console.error('PARSE ERROR — the registry holds no record for a lane'); process.exit(2); }
function sampleRecord() { return JSON.parse(JSON.stringify(CANON_LANE)); }
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

function main() {
  // ── 1. emptyState / normalize ──
  const empty = S.emptyState();
  check('emptyState is versioned + empty', empty.version === S.SCHEMA_VERSION && empty.npcs.length === 0);
  check('normalize(null) -> empty, no throw', S.normalize(null).npcs.length === 0);
  check('normalize(garbage) -> empty, no throw', S.normalize({ npcs: 'nope' }).npcs.length === 0);
  const fwd = S.normalize({ version: 99, npcs: [] });
  check('forward version tolerated (npcs kept, version pinned)', fwd.version === S.SCHEMA_VERSION && fwd.npcs.length === 0);

  // ── 2. cloneFromRecord: verbatim copy + envelope stamp + immutability ──
  const src = sampleRecord();
  check('the clone source is a REGISTRY record (' + src.id + ': ' + src.weapons.length + ' id-ref weapons, each a key of weapons.json)',
        src.weapons.every(w => Object.prototype.hasOwnProperty.call(WEAPONS, w)) && !!src.derived && !!src.characteristics);
  const r = S.cloneFromRecord(empty, src, '');
  check('cloneFromRecord returns {state,key}', !!r.key && r.state.npcs.length === 1);
  check('cloneFromRecord immutable (empty untouched)', empty.npcs.length === 0);
  const c = r.state.npcs[0];
  check('stat block copied verbatim (characteristics)', same(c.characteristics, src.characteristics));
  check('stat block copied verbatim (derived: soak · wounds · defences · strain)', same(c.derived, src.derived));
  check('weapons copied verbatim — the id-ref STRINGS stay strings (never resolved into objects)',
        same(c.weapons, src.weapons) && c.weapons.every(w => typeof w === 'string'));
  check('skills · gear · source copied verbatim',
        same(c.skills, src.skills) && same(c.gear, src.gear) && c.source === src.source && c.source_code === src.source_code);
  check('affiliation fields copied (pool resolution works)',
        c.affiliation === src.affiliation && same(c.affiliation_path, src.affiliation_path));
  const overwritten = ['_source_key', 'key', '_provenance', 'name', 'card', 'attachedProfileKey', 'createdAt', 'updatedAt'];
  check('EVERY other source field copied verbatim (' + Object.keys(src).filter(k => overwritten.indexOf(k) < 0).length + ' fields)',
        Object.keys(src).filter(k => overwritten.indexOf(k) < 0).every(k => same(c[k], src[k])));
  const inl = S.cloneFromRecord(S.emptyState(), INLINE_LANE, '').state.npcs[0];
  check('an INLINE weapon object is copied as the object (' + INLINE_LANE.id + ')', same(inl.weapons, INLINE_LANE.weapons));
  check('provenance stamped', c._provenance === 'custom');
  check('_source_key is custom:* and == key (unique pool identity)',
        /^custom:/.test(c._source_key) && c.key === c._source_key && c._source_key !== src._source_key);
  check('card is null (C1 MEET face empty)', c.card === null);
  check('attachedProfileKey null (C2 seam)', c.attachedProfileKey === null);
  check('timestamps stamped', typeof c.createdAt === 'number' && c.updatedAt === c.createdAt);
  check('default name = "<source> (custom)" when blank', c.name === src.name + ' (custom)');
  check('source record NOT mutated by clone', same(src, CANON_LANE));

  const r2 = S.cloneFromRecord(r.state, src, 'Sergeant Kreel');
  check('explicit clone name kept', S.getNpc(r2.state, r2.key).name === 'Sergeant Kreel');
  check('two clones of one source get distinct keys', r2.key !== r.key && r2.state.npcs.length === 2);

  // ── 3. update / delete round-trip; identity immutable ──
  let st = S.updateNpc(r2.state, r2.key, { name: 'Kreel', card: { personality: 'cold', junk: 'x' } });
  const u = S.getNpc(st, r2.key);
  check('updateNpc merges name', u.name === 'Kreel');
  check('updateNpc shapes card (known keys kept, unknown dropped)', u.card.personality === 'cold' && !('junk' in u.card));
  check('updateNpc bumps updatedAt', u.updatedAt >= u.createdAt);
  const st2 = S.updateNpc(st, r2.key, { _source_key: 'hacked', key: 'hacked', _provenance: 'canon' });
  check('updateNpc CANNOT change identity', S.getNpc(st2, r2.key)._source_key === r2.key && S.getNpc(st2, r2.key)._provenance === 'custom');
  const del = S.deleteNpc(st2, r.key);
  check('deleteNpc removes one, keeps the other', del.npcs.length === 1 && !S.getNpc(del, r.key) && !!S.getNpc(del, r2.key));

  // ── 4. normalize drops ghost + round-trips a stored record ──
  const drop = S.normalize({ npcs: [{ name: 'no key' }, sampleRecord()] });
  check('normalize drops a custom with no _source_key', drop.npcs.length === 1);
  const rt = S.normalize(del);
  check('normalize round-trips a live cast (count + identity preserved)',
        rt.npcs.length === 1 && rt.npcs[0]._source_key === r2.key);

  // ── 5. C2-BUILD usage: CREATE (clone a seed, not a canon record) + multi-field edits ──
  const seed = { name: 'Vex Rell', tier: 'nemesis', characteristics: { brawn: 3, cunning: 4 },
                 derived: { soak: 4, wounds: 16, strain: 15 }, skills: [], talents: [], abilities: [], weapons: [], gear: [] };
  const cr = S.cloneFromRecord(S.emptyState(), seed, 'Vex Rell');
  const made = S.getNpc(cr.state, cr.key);
  check('CREATE-from-seed stamps a custom (tier + chars from the archetype seed)',
        made._provenance === 'custom' && made.tier === 'nemesis' && made.characteristics.cunning === 4 && made.card === null);
  let e = S.updateNpc(cr.state, cr.key, { characteristics: { brawn: 4 }, skills: [{ skill_ref: 'coercion', rank: 3 }] });
  e = S.updateNpc(e, cr.key, { attachedProfileKey: 'stormtrooper', card: { wants: 'the Kessel route' } });
  const ed = S.getNpc(e, cr.key);
  check('FIGHT edits write whole fields (characteristics + skills replaced)',
        ed.characteristics.brawn === 4 && ed.skills.length === 1 && ed.skills[0].skill_ref === 'coercion');
  check('TALK card + attach seam write through updateNpc (never touch identity)',
        ed.card.wants === 'the Kessel route' && ed.attachedProfileKey === 'stormtrooper' && ed._source_key === cr.key);

  // ── 7. R-NPC-13 — the two weapons[] lanes round-trip (AMENDMENT 1; castStore stays v1) ──
  const combat = SKILLS.filter(e => e.group === 'combat').map(e => e.id);
  const ranges = Array.from(new Set(Object.values(WEAPONS).map(w => w.range).filter(Boolean)));
  check('the vocabularies READ: six combat skills, five personal-scale range bands',
        combat.length === 6 && ranges.length === 5);
  const canonId = CANON_LANE.weapons[0];
  const hand = { name: 'Hold-out pistol, filed', damage: { value: 5, base: 'flat' }, crit: 4,
                 range: ranges[ranges.length - 1], skill: combat[combat.length - 1], qualities: [] };
  let w7 = S.updateNpc(cr.state, cr.key, { weapons: [canonId, hand] });
  const back = S.normalize(JSON.parse(JSON.stringify(w7)));   // what load() reads after persist()
  const bw = S.getNpc(back, cr.key).weapons;
  check('lane 1 — a canon weapon stored as its registry ID STRING survives the round trip as that string (' + canonId + ')',
        bw.length === 2 && bw[0] === canonId && Object.prototype.hasOwnProperty.call(WEAPONS, bw[0]));
  check('lane 2 — a hand weapon object survives verbatim, range and skill inside their vocabularies',
        same(bw[1], hand) && ranges.indexOf(bw[1].range) >= 0 && combat.indexOf(bw[1].skill) >= 0);
  const legacy = { name: 'Old entry', damage: { value: 4, base: 'flat' }, range: 'short', skill: '', qualities: [] };
  const lg = S.getNpc(S.normalize(JSON.parse(JSON.stringify(S.updateNpc(cr.state, cr.key, { weapons: [legacy] })))), cr.key);
  check('a legacy hand object with skill \'\' is kept as written (no migration)', same(lg.weapons[0], legacy));
  check('the store stays v1 through both lanes', back.version === S.SCHEMA_VERSION && S.SCHEMA_VERSION === 1);

  // ── 6. RECENT (ruling custom-npc-tab-space-triage Addendum 1 §C) ──
  // The repurposed HISTORY tab's list. Pure transforms, so the contract is provable here rather
  // than only in a browser: dedupe-by-move, the cap, and the TOLERANT reader (the whole reason it
  // needs no schema version — garbage degrades to [] instead of throwing).
  check('recent: an empty/garbage read degrades to [] (never throws)',
        S.normalizeRecent(null).length === 0 && S.normalizeRecent('nope').length === 0
        && S.normalizeRecent([null, {}, { viewedAt: 5 }]).length === 0);
  const r_a = S.touchRecent([], 'stormtrooper', 100);
  const r_b = S.touchRecent(r_a, 'gamorrean', 200);
  check('recent: newest first', r_b.length === 2 && r_b[0].key === 'gamorrean' && r_b[1].key === 'stormtrooper');
  const r_c = S.touchRecent(r_b, 'stormtrooper', 300);
  check('recent: re-viewing MOVES to the top, never duplicates (a shortcut, not a log)',
        r_c.length === 2 && r_c[0].key === 'stormtrooper' && r_c[0].viewedAt === 300);
  let big = [];
  for (let i = 0; i < 30; i++) big = S.touchRecent(big, 'npc_' + i, i);
  check('recent: capped at RECENT_CAP, oldest evicted',
        big.length === S.RECENT_CAP && big[0].key === 'npc_29'
        && !big.some(e => e.key === 'npc_0'));
  check('recent: a bad viewedAt normalizes to 0 rather than NaN/undefined',
        S.normalizeRecent([{ key: 'x', viewedAt: 'yesterday' }])[0].viewedAt === 0);
  check('recent: NOT a save-shape — no version field is written or required',
        S.normalizeRecent([{ key: 'x', viewedAt: 1 }]).every(e => Object.keys(e).sort().join() === 'key,viewedAt'));

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`);
  process.exit(failures ? 1 : 0);
}
main();
