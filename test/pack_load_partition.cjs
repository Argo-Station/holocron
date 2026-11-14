#!/usr/bin/env node
/**
 * pack_load_partition.cjs — STANDING guard for the LOAD partition and the AUTHORING refusals of
 * lib/shared/packValidate.js (F-100 UD-1c; ruling f100-ud1-contracts R-FUD-3 + §6 acceptance 4;
 * R-FPA-3's two rows; brief §3's table).
 *
 *   ACCEPTANCE 4 (the three rows the ruling names):
 *     1. an unknown effect op is REFUSED at authoring, with its NAMED reason;
 *     2. the SAME pack LOADS byte-faithful (the input deep-frozen, returned as `stored`, its JSON
 *        unchanged), the entry quarantined — absent from the applied copy, listed on `_unapplied` with
 *        `unknown-op:<value>` — and NOT applied: the applied talent goes through
 *        charResolve.talentEffectsOf without a throw and yields only its known effect;
 *     3. charResolve.talentEffectsOf still THROWS on an unknown op placed in the app's own registry.
 *   THE REST OF §3's TABLE, one row each (HARVEST = rows run): unknown when / target; unknown die /
 *   direction / anchor scope in pool_mods; unknown field (pruned, listed, applies); unknown section;
 *   unknown envelope key; formatVersion > 1; another record failure (kept, not applied); an `add` on a
 *   canonical id; an un-namespaced add; a dangling ref (applies, warned); the per_rank refusals; the
 *   preserved sections; the share-record hook; and the committed fixture (authoring clean, all applied).
 *
 * Run: node test/pack_load_partition.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PV = require(path.join(ROOT, 'lib/shared/packValidate.js'));
const CR = require(path.join(ROOT, 'lib/shared/charResolve.js'));
const V = PV.create(PV.readSchemaDir(path.join(ROOT, 'schema')));

let failures = 0, rows = 0;
const fail = (m) => { failures += 1; console.error('  FAIL  ' + m); };
const pass = (m) => console.log('  PASS  ' + m);
const check = (ok, m) => (ok ? pass(m) : fail(m));
const clone = (x) => JSON.parse(JSON.stringify(x));
const deepFreeze = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); } return o; };

const reg = (s) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', s + '.json'), 'utf8'))[s];
const base = {};
for (const s of PV.APPLIED_SECTIONS) base[s] = reg(s);
const vocabIds = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', f), 'utf8')).entries.map((e) => e.id);
const ctx = { base, vocab: { skills: vocabIds('skills.vocab.json'), qualities: vocabIds('qualities.vocab.json') } };

const env = (sections, extra) => Object.assign({ formatVersion: 1, packId: 'my_data', name: 'My Data', _provenance: 'custom', sections }, extra || {});
const IRON = 'custom_my_data_iron_will';
const ironWill = (effects) => ({ _mode: 'add', id: IRON, name: 'Iron Will', description: 'Strain threshold +1 per rank.', ranked: true, activation: 'passive', sources: [], effects });
const GOOD = { op: 'strain_threshold_delta', amount: 1, per_rank: true };
const FUTURE = { op: 'upgrade_die', amount: 1, per_rank: true };
const blaster = () => Object.assign({ _mode: 'redefine' }, clone(base.weapons.blaster_pistol));

// ── ACCEPTANCE 4 ─────────────────────────────────────────────────────────────────────────────────
{
  rows += 1;
  const pack = env({ talents: { [IRON]: ironWill([GOOD, FUTURE]) } });
  const a = V.authoring(pack, ctx);
  // re-aimed by ruling f100-m7-build R-M7G-4: the op count is the schema's own enum length, as the refusal message derives it
  const OPN = JSON.parse(fs.readFileSync(path.join(ROOT, 'schema/charbuild-common.schema.json'), 'utf8')).$defs.effect.properties.op.enum.length;
  const NAMED = `talents.${IRON}.effects[1].op: "upgrade_die" is not an effect this app can apply (charbuild-common $defs/effect: ${OPN} ops) — refused`;
  check(!a.ok && a.reasons.includes(NAMED), '4.1 an unknown op is REFUSED at authoring with its named reason');
  check(a.reasons.length === 1, `4.1 …and only that reason (no raw schema noise under the named entry): ${a.reasons.length} reason(s)`);

  rows += 1;
  const bytes = JSON.stringify(pack);
  deepFreeze(pack);
  let L, threw = null;
  try { L = V.load(pack, ctx); } catch (e) { threw = e; }
  check(!threw, '4.2 load never writes into the pack (input deep-frozen; strict-mode writes would throw)' + (threw ? ' — ' + threw.message : ''));
  if (L) {
    check(L.status === 'ok' && L.stored === pack && JSON.stringify(L.stored) === bytes, '4.2 the pack LOADS and is returned as `stored`, byte-faithful (same object, same JSON)');
    check(JSON.stringify(L.stored).includes('"upgrade_die"') && !JSON.stringify(L.stored).includes('_unapplied'), '4.2 the quarantined entry is KEPT in the store; `_unapplied` never reaches it');
    const t = L.applied.talents && L.applied.talents[IRON];
    check(!!t && t.effects.length === 1 && t.effects[0].op === 'strain_threshold_delta', '4.2 the entry is QUARANTINED: absent from the applied copy, the known effect applies');
    const u = t && t._unapplied;
    check(Array.isArray(u) && u.length === 1 && u[0].path === 'effects[1]' && u[0].reason === 'unknown-op:upgrade_die' && u[0].entry.op === 'upgrade_die',
      '4.2 the applied record lists it on `_unapplied` — {path effects[1], reason unknown-op:upgrade_die, entry}');
    check(L.unapplied.length === 1 && L.unapplied[0].section === 'talents' && L.unapplied[0].id === IRON, '4.2 the load result lists it too');
    let effs = null, e2 = null;
    try { effs = CR.talentEffectsOf(IRON, { [IRON]: t }); } catch (e) { e2 = e; }
    check(!e2 && effs && effs.length === 1, '4.2 NOT applied: talentEffectsOf over the applied copy does not throw and yields the one known effect');
  }

  rows += 1;
  let e3 = null;
  try { CR.talentEffectsOf('own_broken', { own_broken: { id: 'own_broken', ranked: false, effects: [FUTURE] } }); } catch (e) { e3 = e; }
  check(!!e3 && /does not implement/.test(e3.message), '4.3 talentEffectsOf still THROWS on an unknown op in the app\'s own registry');
}

// ── the rest of §3's table ───────────────────────────────────────────────────────────────────────
function loadAndAuthor(pack) { return { L: V.load(deepFreeze(clone(pack)), ctx), A: V.authoring(pack, ctx) }; }
const has = (list, re) => list.some((r) => re.test(r));

{ // unknown when / target on an effect entry
  rows += 1;
  const { L, A } = loadAndAuthor(env({ talents: { [IRON]: ironWill([GOOD, { op: 'soak_delta', amount: 1, per_rank: true, when: 'wounded' }, { op: 'defense_delta', target: 'both', amount: 1, per_rank: true }]) } }));
  const u = (L.applied.talents[IRON]._unapplied || []).map((x) => x.reason).sort();
  check(JSON.stringify(u) === JSON.stringify(['unknown-target:both', 'unknown-when:wounded']) && L.applied.talents[IRON].effects.length === 1,
    'unknown `when` / `target` → those entries quarantined, the known effect applies');
  check(has(A.reasons, /effects\[1\]\.when: "wounded" is not a condition/) && has(A.reasons, /effects\[2\]\.target: "both" is not a target/), '…and each is refused at authoring by name');
}
{ // unknown die / direction / scope in pool_mods (an item)
  rows += 1;
  const w = blaster();
  // RE-POINTED by F-100 M8 (f100-m8-contracts R-M8K-3): `upgrade` (step 1) and `proficiency` (step 2) are C3 members now,
  // so the unknown samples are values no contract names. KEPT: one unknown die, one unknown direction, one unknown scope.
  w.pool_mods = [
    { die: 'boost', count: 1, direction: 'add', applies_to: [{ scope: 'all' }] },
    { die: 'purple', count: 1, direction: 'add', applies_to: [{ scope: 'all' }] },
    { die: 'boost', count: 1, direction: 'flip', applies_to: [{ scope: 'all' }] },
    { die: 'boost', count: 1, direction: 'add', applies_to: [{ scope: 'galaxy', value: 'x' }] },
  ];
  const { L, A } = loadAndAuthor(env({ weapons: { blaster_pistol: w } }));
  const ap = L.applied.weapons && L.applied.weapons.blaster_pistol;
  const u = ((ap && ap._unapplied) || []).map((x) => x.reason).sort();
  check(!!ap && ap.pool_mods.length === 1 && JSON.stringify(u) === JSON.stringify(['unknown-die:purple', 'unknown-direction:flip', 'unknown-scope:galaxy']),
    'unknown die / direction / anchor scope in pool_mods → those entries quarantined, the record applies');
  check(A.reasons.filter((r) => /pool_mods\[\d\]\.(die|direction|applies_to\[0\]\.scope):/.test(r)).length === 3, '…and each is refused at authoring by name');
}
{ // unknown field
  rows += 1;
  const w = blaster(); w.recoil = 2; w.damage.spread = 1;
  const { L, A } = loadAndAuthor(env({ weapons: { blaster_pistol: w } }));
  const ap = L.applied.weapons && L.applied.weapons.blaster_pistol;
  const u = ((ap && ap._unapplied) || []).map((x) => x.reason).sort();
  check(!!ap && !('recoil' in ap) && !('spread' in ap.damage) && JSON.stringify(u) === JSON.stringify(['unknown-field:damage.spread', 'unknown-field:recoil']),
    'an unknown field at any depth → pruned from the applied copy, listed unknown-field:<path>, the record applies');
  check(A.reasons.includes('weapons.blaster_pistol.recoil: not a field this app knows — refused') && A.reasons.includes('weapons.blaster_pistol.damage.spread: not a field this app knows — refused'),
    '…and refused at authoring');
}
{ // unknown section + unknown envelope key
  rows += 1;
  const pack = env({ gear: {}, vehicle_attachments: { a: { id: 'a' } } }, { zz_future_key: 'x' });
  const { L, A } = loadAndAuthor(pack);
  check(L.status === 'ok' && JSON.stringify(L.ignoredSections) === '["vehicle_attachments"]' && JSON.stringify(L.ignoredKeys) === '["zz_future_key"]' && L.stored.sections.vehicle_attachments,
    'unknown section → ignoredSections; unknown envelope key → ignoredKeys; both kept in `stored`, merged nowhere');
  check(has(A.reasons, /^sections\.vehicle_attachments: not a section this app can write/) && has(A.reasons, /^<envelope>\.zz_future_key: not an envelope field/), '…and both refused at authoring');
}
{ // formatVersion > 1
  rows += 1;
  const pack = env({ weapons: { blaster_pistol: blaster() } }, { formatVersion: 2 });
  const L = V.load(deepFreeze(pack), ctx);
  check(L.status === 'newer-format' && Object.keys(L.applied).length === 0 && L.stored === pack, 'formatVersion 2 → newer-format: stored whole, nothing applied');
}
{ // any other record failure
  rows += 1;
  const w = blaster(); w.damage.value = '7';
  const { L, A } = loadAndAuthor(env({ weapons: { blaster_pistol: w } }));
  check(!(L.applied.weapons && L.applied.weapons.blaster_pistol) && L.kept.length === 1 && has(L.kept[0].reasons, /damage\.value: "7" is not of type integer/),
    'another record failure (wrong type) → the RECORD is kept, not applied, with the rail\'s reason');
  check(has(A.reasons, /^weapons\.blaster_pistol\.damage\.value: "7" is not of type integer — refused$/), '…and refused at authoring');
}
{ // add on a canonical id; un-namespaced add
  rows += 1;
  const w = blaster(); w._mode = 'add';
  const gadd = { _mode: 'add', id: 'lucky_dice', name: 'Lucky Dice', type: 'Trinket' };
  const { L, A } = loadAndAuthor(env({ weapons: { blaster_pistol: w }, gear: { lucky_dice: gadd } }));
  check(L.kept.some((k) => k.id === 'blaster_pistol' && has(k.reasons, /add-collides-with-base/)) && !(L.applied.weapons && L.applied.weapons.blaster_pistol),
    'an add whose id is canonical → kept, not applied, add-collides-with-base');
  check(L.applied.gear && L.applied.gear.lucky_dice && L.applied.gear.lucky_dice._mode === 'add', 'an un-namespaced add → applied at load');
  check(has(A.reasons, /blaster_pistol: add-collides-with-base/) && has(A.reasons, /gear\.lucky_dice: add-id-not-namespaced/), '…and both refused at authoring by name');
}
{ // dangling ref
  rows += 1;
  const spec = Object.assign({ _mode: 'redefine' }, clone(Object.values(base.specializations)[0]));
  spec.talent_tree[0].talents[0].talent = 'no_such_talent';
  const { L, A } = loadAndAuthor(env({ specializations: { [spec.id]: spec } }));
  check(L.applied.specializations && L.applied.specializations[spec.id] && L.warnings.length === 1 && /dangling-ref: talent "no_such_talent"/.test(L.warnings[0].reason),
    'a dangling reference → the record APPLIES, listed as a warning');
  check(has(A.reasons, /talent_tree\[0\]\.talents\[0\]\.talent: talent "no_such_talent" does not exist — refused/), '…and refused at authoring');
  // a ref to a talent THIS pack adds resolves (base ∪ pack)
  const spec2 = clone(spec); spec2.talent_tree[0].talents[0].talent = IRON;
  const L2 = V.load(env({ specializations: { [spec.id]: spec2 }, talents: { [IRON]: ironWill([GOOD]) } }), ctx);
  check(L2.warnings.length === 0, 'a ref to a talent the same pack adds resolves (base ∪ pack)');
}
{ // per_rank refusals (L1cb.prk)
  rows += 1;
  const unranked = ironWill([{ op: 'soak_delta', amount: 1, per_rank: true }]); unranked.ranked = false;
  const w = blaster(); w.pool_mods = [{ die: 'boost', count: 1, direction: 'add', applies_to: [{ scope: 'all' }], per_rank: false }];
  const { L, A } = loadAndAuthor(env({ talents: { [IRON]: unranked }, weapons: { blaster_pistol: w } }));
  check(L.kept.length === 2 && has(L.kept.map((k) => k.reasons.join()), /UNRANKED talent's effect/) && has(L.kept.map((k) => k.reasons.join()), /items have no ranks/),
    'per_rank true on an unranked talent\'s effect, per_rank on an item\'s pool_mods → kept, not applied (L1cb.prk)');
  check(A.reasons.filter((r) => /L1cb\.prk\) — refused$/.test(r)).length === 2, '…and refused at authoring');
}
{ // preserved sections
  rows += 1;
  const { L, A } = loadAndAuthor(env({ vehicles: { x_wing: { id: 'x_wing' } }, npcs: { a: { id: 'a' } } }));
  check(JSON.stringify(L.preservedSections) === '["vehicles","npcs"]' && !L.applied.vehicles && !L.applied.npcs, 'vehicles / npcs → preservedSections: stored, applied nowhere (H5, R-FEDC-8)');
  check(has(A.reasons, /^sections\.vehicles: not a section this app writes in v1/), '…and not authorable in v1');
}
{ // the share-record hook (R-FUD-10's rebuild arrives in UD-1e)
  rows += 1;
  const share = { _mode: 'redefine', _base: { ref: 'sha256:p1:' + '0'.repeat(64), editedAt: 'x' }, _changes: { damage: { value: 7 } } };
  const pack = env({ weapons: { blaster_pistol: share } }, { projection: 'share' });
  const L0 = V.load(pack, ctx);
  check(L0.kept.length === 1 && /share-not-rebuilt/.test(L0.kept[0].reasons[0]), 'a share record with no rebuild hook → kept, not applied (share-not-rebuilt)');
  const L1 = V.load(pack, Object.assign({}, ctx, { rebuild: () => null }));
  check(L1.kept.length === 1 && /base-missing/.test(L1.kept[0].reasons[0]), 'a hook answering null → kept, not applied (base-missing)');
  const L2 = V.load(pack, Object.assign({}, ctx, { rebuild: (s, id, r) => { const b = blaster(); b.damage.value = 7; b._base = r._base; return b; } }));
  check(L2.applied.weapons && L2.applied.weapons.blaster_pistol.damage.value === 7 && L2.applied.weapons.blaster_pistol._base.ref === share._base.ref,
    'a hook answering a full record → validated and applied, carrying the share\'s anchor');
  check(V.authoring(pack, ctx).reasons.some((r) => /share-projection record is not an authored record/.test(r)), 'a share record is never an AUTHORED record');
}
{ // the committed fixture
  rows += 1;
  const fx = JSON.parse(fs.readFileSync(path.join(ROOT, 'schema/fixtures/user-pack.example.json'), 'utf8'));
  const A = V.authoring(fx, ctx);
  const L = V.load(deepFreeze(fx), ctx);
  const n = Object.values(L.applied).reduce((a, s) => a + Object.keys(s).length, 0);
  check(A.ok, 'the committed fixture passes the authoring rail' + (A.ok ? '' : ': ' + A.reasons.slice(0, 3).join(' | ')));
  check(L.status === 'ok' && n === 4 && L.kept.length === 0 && L.unapplied.length === 0 && L.warnings.length === 0, `the committed fixture loads whole: ${n}/4 applied, 0 kept, 0 unapplied, 0 warnings`);
}
{ // code paths stay loud: a caller without the context throws
  rows += 1;
  let t = 0;
  try { V.load(env({}), {}); } catch (e) { t += 1; }
  try { V.authoring(env({}), null); } catch (e) { t += 1; }
  check(t === 2, 'load / authoring without { base, vocab } THROW — a caller without data is a code-path defect');
}

console.log(`  HARVEST partition rows run: ${rows}`);
check(rows >= 16, `all ${rows} partition rows ran (a short harvest is a FAILED run)`);
if (failures) { console.error(`\npack_load_partition guard: ${failures} FAIL`); process.exit(1); }
console.log('\npack_load_partition guard: ALL PASS');
