#!/usr/bin/env node
/**
 * pregen_shelf_reconciliation.cjs — B-720 / R-QSG-5 (1): THE NUMBERS ON THE QUICK START SHELF ARE
 * THE RULE'S, AND A DRAWING IS NOT EVIDENCE OF THAT.
 *
 * WHAT THE SHELF PRINTS. Each of the eighteen frontispieces prints the record's own `derived` block
 * — wound threshold, strain threshold, soak, and Force rating on the six that have one — and a gold
 * bead on every characteristic the record raised above its species' base. Both are claims about
 * arithmetic the record does not show its working for. This guard is that working: every threshold,
 * every soak and every Force rating on all eighteen is RECOMPUTED from the record's own
 * characteristics, the SPECIES registry's base, the ARMOUR registry's soak and the record's own
 * `derivedBonuses`, and a mismatch is refused.
 *
 *   woundThreshold  = woundBase  + brawn      + derivedBonuses.woundThresholdBonus
 *   strainThreshold = strainBase + willpower  + derivedBonuses.strainThresholdBonus
 *   soak            = brawn      + armor.soak + derivedBonuses.soakBonus
 *   forceRating     = forceRatingBase          + derivedBonuses.forceRatingBonus
 *   meleeDefense    = armor.defense + derivedBonuses.meleeDefenseBonus + Σ Defensive ranks, cap 4
 *   rangedDefense   = armor.defense + derivedBonuses.rangedDefenseBonus + Σ Deflection ranks, cap 4
 *   and woundBase / strainBase are the SPECIES REGISTRY's own two fields, not numbers the record
 *   may hold an opinion about.
 * (EotE p.101 characteristics from the species base · p.107 wound/strain thresholds · p.107 soak =
 * Brawn + armour soak · p.277 Force rating · p.165 Defensive/Deflection are passive "increases"
 * qualities and EotE Errata v2.0 p.2 caps total defence at 4.)
 *
 * THE TWO DEFENCES WERE THE GAP, AND ONE CHARACTER WAS IN IT (`character-math-audit` finding 5,
 * B-735). This file reconciled four numbers and skipped melee and ranged defence, so Zara Koth (the
 * `mystic` archetype) carried a Staff of Office — `weapons.json`'s `staff_of_office` holds
 * `{id:'defensive', ranked:true, rank:1}` — while her sheet displayed Melee Defence 0. She is the
 * ONLY record on this roster carrying a Defensive or Deflection weapon and no shipped suit carries
 * `defense > 0`, so the whole shipped blast radius was one number on one character, which is exactly
 * the size of hole a four-number reconciler cannot see. The two defences are now derived here from
 * `armor.json`'s `defense` and `weapons.json`'s own quality records, read the way
 * `charResolve.js`'s weapon loop reads them (only `_qualitiesRaw`, only non-stowed entries), and
 * Zara Koth reconciles at Melee Defence 1.
 *
 * WHY THE DEFENCE LEGS READ THE RESOLVED NUMBER AND NOT THE `derived` SNAPSHOT. Not one of the
 * eighteen `derived` blocks carries a `meleeDefense` or `rangedDefense` key at all — measured and
 * asserted below as an absence — and an absent key reading 0 through `(sheet.derived||{}).meleeDefense
 * || 0` is precisely how Zara Koth's 1 stayed invisible. So for these two the guard compares the rule
 * against what the SHEET RENDERS (`CharResolve.computeDerived` over the same resolved equipment the
 * app builds), which is the number a player can see; a snapshot that ever grows a defence key is
 * reconciled too, by its own arm, so it cannot drift in behind the rule.
 *
 * WHY IT IS NOT `CharResolve.computeDerived`, WHICH IS THE APP'S OWN SHARED CORE FOR THESE FOUR
 * NUMBERS. Because that function is built to be GRACEFUL and grace is exactly what a reconciler
 * cannot have. Two independent mechanisms make it structurally unable to contradict a stored
 * `derived` block on any of these eighteen records, and the guard DEMONSTRATES both below rather
 * than asserting them:
 *   (1) R-DAR1's legacy law — a record with no `derivedBonuses` renders from its `derived` snapshot
 *       verbatim. FIFTEEN of the eighteen carry no bonus block, so for fifteen the shared core is
 *       an echo.
 *   (2) The B-49/B-57 legacy-shape FLOOR — on the modern branch wound, strain and Force rating are
 *       `max(computed, snapshot)`. So even for the three that do carry a block, a snapshot that is
 *       too HIGH wins over the rule.
 * Both behaviours are correct where they live (a player's year-old save must still render) and both
 * would make this guard vacuous. So the rule is computed here, in the open, and the shared core is
 * asserted to AGREE — which is a second method, not a second copy.
 *
 * THE NON-VACUITY PROOF IS A LEG, NOT A RITUAL. The lab measured that only THREE of the eighteen
 * carried a `derivedBonuses` block at all, so a reconciler that ignored the block would pass fifteen
 * and lie about three — the exact shape of a guard that looks green and proves nothing. This file
 * therefore RUNS ITSELF TWICE: once honestly, and once with the bonus block dropped, and it refuses
 * unless the second run fails on exactly the records the block is load-bearing for. The bite
 * is permanent and runs on every invocation, so the day someone stops reading `derivedBonuses` the
 * guard says so without anyone remembering to bite it.
 *
 * THE LOAD-BEARING SET IS DERIVED, NEVER TYPED, AND IT GREW. It used to be the three records with a
 * non-zero bonus key (bounty_hunter · colonist · soldier). B-735 wrote an all-zeros block onto the
 * other fifteen, which moves every one of them off R-DAR1's fallback branch and onto the computing
 * one — so the block is now load-bearing for a FOURTH record by a different mechanism: drop it and
 * `mystic` falls back to a snapshot with no `meleeDefense` key and reads 0 against a rule that says
 * 1. The set is therefore the UNION of two derived populations — a non-zero bonus key, and a record
 * whose resolved defence CHANGES when the block is dropped — and it is computed, so the day a
 * nineteenth record joins either population nobody has to remember to widen a list.
 *
 * ABSENCES ARE ASSERTED AS ABSENCES (LAB_NOTES §194): no card prints a book page, because the
 * records carry no page field and all eighteen read `source: "Original"`. A record that grows a page
 * is a FINDING and turns this red, rather than quietly licensing a citation on a shelf card.
 *
 * Run: node test/pregen_shelf_reconciliation.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass += 1; console.log('  PASS  ' + label); }
  else {
    fail += 1;
    console.error('  FAIL  ' + label
      + (detail !== undefined ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 900)) : ''));
  }
}

const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical/' + f), 'utf8'));
const SPECIES = J('species.json').species;
const ARMOR = J('armor.json').armor;
const WEAPONS = J('weapons.json').weapons;
const VOCAB = J('skills.vocab.json').entries || [];
const RECORDS = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/pregen_sheets.json'), 'utf8')).characters;
const CharResolve = require('../lib/shared/charResolve.js');

const ORDER = ['brawn', 'agility', 'intellect', 'cunning', 'willpower', 'presence'];
// The register's three ids and the campaign mechanic each one decides. Both are the RECORD's own
// `book` field read two ways — the partition below proves the field carries both jobs.
const LINES = ['eote', 'aor', 'fad'];
const MECHANIC_FIELD = { eote: 'obligation', aor: 'duty', fad: 'morality' };

console.log('\n── B-720 / R-QSG-5 (1): the Quick Start shelf reconciles against the registries ──');

/* ── THE FLOOR. A sweep over nothing passes every assert below it. ─────────────────────────────── */
check('the roster is the eighteen and the registries loaded (a vacuous sweep proves nothing) — '
      + RECORDS.length + ' records, ' + Object.keys(SPECIES).length + ' species, '
      + Object.keys(ARMOR).length + ' armour, ' + VOCAB.length + ' skills',
      RECORDS.length === 18 && Object.keys(SPECIES).length > 100
      && Object.keys(ARMOR).length > 50 && VOCAB.length > 20,
      { records: RECORDS.length, species: Object.keys(SPECIES).length, armor: Object.keys(ARMOR).length, vocab: VOCAB.length });

/* ── THE APP'S OWN RESOLVED EQUIPMENT, MODELLED FAITHFULLY. ─────────────────────────────────────
   `resolveSheetEquipment` (lib/shared/sheetPool.js; moved from player/app.jsx by R-S4PP-1) hands computeDerived `{armor:{soak,defense}, weapons:[…]}`
   and stamps each canonical weapon's `_qualitiesRaw = rec.qualities || []` (app.jsx:10547) — the
   {id, rank} records off the registry, NOT the display strings. The defence loop reads that field and
   nothing else (charResolve.js ~:2386), so an entry without it contributes 0 with a console warning
   rather than a number. Modelled here so the guard drives the real resolver over the real shape. */
function resolvedEquipmentOf(rec) {
  const armorRef = (rec.equipment && rec.equipment.armor) || {};
  const armorRec = armorRef.id ? ARMOR[armorRef.id] : null;
  const weapons = ((rec.equipment && rec.equipment.weapons) || []).map((entry) => {
    const wr = (entry && entry.id) ? WEAPONS[entry.id] : null;
    const disp = { id: entry && entry.id, name: (wr && wr.name) || (entry && entry.id), state: entry && entry.state };
    if (wr) disp._qualitiesRaw = wr.qualities || [];   // ABSENT when unresolved — the C-BDS-2 signal
    return disp;
  });
  return {
    armor: armorRec ? { soak: Number(armorRec.soak) || 0, defense: Number(armorRec.defense) || 0 } : null,
    weapons,
  };
}

/* ── THE DEFENCE QUALITIES, read the way charResolve.js ~:2386 reads them. ──────────────────────
   Both Defensive and Deflection are PASSIVE "increases" qualities (EotE p.165 per the B-202 block in
   the resolver): Defensive raises melee defence, Deflection raises ranged defence, for CARRIED
   (non-stowed) items, summed, then capped with everything else at 4 by the official errata. A stowed
   weapon contributes nothing — the same `state === 'stowed'` filter, not an approximation of it. */
function weaponDefenceOf(resolved) {
  let defensive = 0, deflection = 0;
  (resolved.weapons || []).forEach((w) => {
    if (w.state === 'stowed') return;
    if (w._qualitiesRaw === undefined) return;          // unreadable: 0 is an absence, not an answer
    (w._qualitiesRaw || []).forEach((q) => {
      if (q && q.id === 'defensive') defensive += Number(q.rank) || 0;
      if (q && q.id === 'deflection') deflection += Number(q.rank) || 0;
    });
  });
  return { defensive, deflection };
}

/* ── THE RULE, ONCE. `dropBonuses` is the falsifier's only switch. ─────────────────────────────── */
const SNAPSHOT_KEYS = ['woundThreshold', 'strainThreshold', 'soak', 'forceRating'];
const DEFENCE_KEYS = ['meleeDefense', 'rangedDefense'];
function reconcileOne(rec, opts) {
  const ch = rec.characteristics || {};
  const sp = SPECIES[rec.speciesId];
  const drop = !!(opts && opts.dropBonuses);
  const db = drop ? {} : (rec.derivedBonuses || {});
  const armorRef = (rec.equipment && rec.equipment.armor) || {};
  const armorRec = armorRef.id ? ARMOR[armorRef.id] : null;
  const armorSoak = armorRec ? (Number(armorRec.soak) || 0) : 0;
  const armorDefense = armorRec ? (Number(armorRec.defense) || 0) : 0;
  const resolved = resolvedEquipmentOf(rec);
  const wq = weaponDefenceOf(resolved);
  const want = {
    woundThreshold: (Number(rec.woundBase) || 0) + (Number(ch.brawn) || 0) + (Number(db.woundThresholdBonus) || 0),
    strainThreshold: (Number(rec.strainBase) || 0) + (Number(ch.willpower) || 0) + (Number(db.strainThresholdBonus) || 0),
    soak: (Number(ch.brawn) || 0) + armorSoak + (Number(db.soakBonus) || 0),
    forceRating: (Number(rec.forceRatingBase) || 0) + (Number(db.forceRatingBonus) || 0),
    meleeDefense: Math.min(4, armorDefense + (Number(db.meleeDefenseBonus) || 0) + wq.defensive),
    rangedDefense: Math.min(4, armorDefense + (Number(db.rangedDefenseBonus) || 0) + wq.deflection),
  };
  // The four SNAPSHOT numbers are reconciled against the record's own `derived` block; the two
  // DEFENCES against the number the sheet renders, because no record carries a defence key and an
  // absent key reading 0 is how finding 5 hid. `dropBonuses` removes the block from BOTH sides of
  // that comparison, which is what makes the falsifier honest for the defences too.
  const snap = rec.derived || {};
  const sheet = drop ? Object.assign({}, rec, { derivedBonuses: undefined }) : rec;
  const shown = CharResolve.computeDerived(sheet, resolved, null);
  const got = {};
  SNAPSHOT_KEYS.forEach((k) => { got[k] = Number(snap[k]) || 0; });
  DEFENCE_KEYS.forEach((k) => { got[k] = Number(shown[k]) || 0; });
  const mismatched = Object.keys(want).filter((k) => got[k] !== want[k]);
  return {
    id: rec.id, species: sp || null, armorRef, armorRec, armorSoak, armorDefense, wq,
    want, got, shown, snap, mismatched,
    baseOk: !!sp && (Number(rec.woundBase) || 0) === (Number(sp.wound_threshold_base) || 0)
                 && (Number(rec.strainBase) || 0) === (Number(sp.strain_threshold_base) || 0),
  };
}

/* ── ONE LEG PER RECORD — named, so a red says WHICH character and by how much. ────────────────── */
const rows = RECORDS.map((r) => reconcileOne(r, null));
rows.forEach((row, i) => {
  const rec = RECORDS[i];
  check('[' + row.id + '] ' + rec.name + ' — the record\'s own `derived` block IS what the rule '
        + 'produces: wounds ' + row.want.woundThreshold + ' = ' + rec.woundBase + ' base + '
        + (rec.characteristics || {}).brawn + ' brawn' + bonusPhrase(rec, 'woundThresholdBonus')
        + ' · strain ' + row.want.strainThreshold + ' = ' + rec.strainBase + ' base + '
        + (rec.characteristics || {}).willpower + ' willpower' + bonusPhrase(rec, 'strainThresholdBonus')
        + ' · soak ' + row.want.soak + ' = ' + (rec.characteristics || {}).brawn + ' brawn + '
        + row.armorSoak + ' from ' + (row.armorRec ? row.armorRec.name : 'no armour')
        + bonusPhrase(rec, 'soakBonus')
        + ' · Force rating ' + row.want.forceRating
        + ' · melee defence ' + row.want.meleeDefense + ' = ' + row.armorDefense + ' from armour'
        + bonusPhrase(rec, 'meleeDefenseBonus')
        + (row.wq.defensive ? ' + ' + row.wq.defensive + ' Defensive' : '')
        + ' · ranged defence ' + row.want.rangedDefense + ' = ' + row.armorDefense + ' from armour'
        + bonusPhrase(rec, 'rangedDefenseBonus')
        + (row.wq.deflection ? ' + ' + row.wq.deflection + ' Deflection' : ''),
        row.mismatched.length === 0, { want: row.want, got: row.got, mismatched: row.mismatched });
});
function bonusPhrase(rec, key) {
  const v = (rec.derivedBonuses || {})[key];
  return v ? ' + ' + v + ' from the bonus block' : '';
}

/* ── THE SPECIES REGISTRY IS THE AUTHORITY FOR THE TWO BASES AND THE SIX CAPSULES. ─────────────── */
const noSpecies = rows.filter((r) => !r.species).map((r) => r.id);
check('every record resolves its `speciesId` in the species registry (' + rows.length + '/'
      + rows.length + ')', noSpecies.length === 0, noSpecies);
const badBase = rows.filter((r) => !r.baseOk).map((r) => r.id);
check('every record\'s `woundBase`/`strainBase` ARE the species registry\'s own two fields — the '
      + 'record holds no opinion about them', badBase.length === 0, badBase);
const shortBase = RECORDS.filter((r) => {
  const c = SPECIES[r.speciesId] && SPECIES[r.speciesId].characteristics;
  return !c || ORDER.some((a) => c[a] == null);
}).map((r) => r.id);
check('every record\'s species carries all six base characteristics — the gold bead on the shelf is '
      + 'a COMPARISON and a comparison against a missing base is a mark drawn on a guess',
      shortBase.length === 0, shortBase);

/* ── THE MARKS THEMSELVES, and the contrast that makes them mean something. ────────────────────── */
const raised = {};
RECORDS.forEach((r) => {
  const base = SPECIES[r.speciesId].characteristics;
  raised[r.id] = ORDER.filter((a) => (Number((r.characteristics || {})[a]) || 0) > (Number(base[a]) || 0));
});
const rc = Object.keys(raised).map((k) => raised[k].length);
check('every characteristic the shelf marks is one the record RAISED above its species base, and '
      + 'every one it leaves unmarked is one it did not — ' + JSON.stringify(raised).slice(0, 260)
      + '…', rc.every((n) => n >= 1 && n <= 6), raised);
check('the mark is not drawn on everything: across the eighteen, ' + rc.reduce((a, b) => a + b, 0)
      + ' of ' + (18 * 6) + ' capsules are raised, so a card carries marked AND unmarked tiles and '
      + 'the contrast is what a reader is reading (a mark always drawn proves nothing)',
      rc.reduce((a, b) => a + b, 0) > 0 && rc.reduce((a, b) => a + b, 0) < 18 * 6,
      rc.reduce((a, b) => a + b, 0));
// THE ZERO-RAISE CASE DOES NOT EXIST ON THIS ROSTER, and that is a fact to state rather than a leg
// to skip: the contrast the shelf shows is between CAPSULES on one card, never between a marked
// character and an unmarked one. If a record ever raises nothing, this says so.
const noneRaised = Object.keys(raised).filter((k) => raised[k].length === 0);
check('no record on this roster raises NOTHING (' + noneRaised.length + ') — so the smoke\'s '
      + 'present/absent contrast is per CAPSULE on one card, which is where it lives',
      noneRaised.length === 0, noneRaised);

/* ── THE REGISTER: six per line, and the same field decides the campaign mechanic. ─────────────── */
const partition = LINES.map((k) => [k, RECORDS.filter((r) => r.book === k).length]);
check('the game line partitions the eighteen SIX-SIX-SIX — ' + JSON.stringify(partition)
      + ' — which is what makes it a register the data supports rather than a taxonomy it lacks '
      + '(R-QSG-5 (2))',
      partition.every(([, n]) => n === 6)
      && partition.reduce((a, [, n]) => a + n, 0) === RECORDS.length, partition);
const mechMiss = [];
LINES.forEach((k) => {
  RECORDS.filter((r) => r.book === k).forEach((r) => {
    if (!r[MECHANIC_FIELD[k]]) mechMiss.push([r.id, k, MECHANIC_FIELD[k]]);
  });
});
check('and it is the SAME field that decides each character\'s campaign mechanic — six `obligation`, '
      + 'six `duty`, six `morality`, with nothing missing', mechMiss.length === 0, mechMiss);
const strayMech = RECORDS.filter((r) => LINES.some((k) => k !== r.book && r[MECHANIC_FIELD[k]])).map((r) => r.id);
check('and no record carries another line\'s mechanic, so the partition is a partition',
      strayMech.length === 0, strayMech);

/* ── THE SKILL ROW'S SUBJECT RESOLVES IN THE VOCABULARY. ───────────────────────────────────────── */
// The shelf's best-pool row reads the label and the governing characteristic out of
// `skills.vocab.json`, keyed by the ALL-CAPS alias the record uses. A key the vocabulary does not
// answer to is SKIPPED in the browser, so it would lose a character's best roll silently; refused
// here, it is a red instead.
const ALIAS = {};
VOCAB.forEach((e) => (e.aliases || []).forEach((a) => { if (/^[A-Z]+$/.test(a)) ALIAS[a] = e; }));
const dupAlias = [];
const seen = {};
VOCAB.forEach((e) => (e.aliases || []).forEach((a) => {
  if (!/^[A-Z]+$/.test(a)) return;
  if (seen[a] && seen[a] !== e.id) dupAlias.push([a, seen[a], e.id]);
  seen[a] = e.id;
}));
const unresolved = [];
RECORDS.forEach((r) => Object.keys(r.skills || {}).forEach((k) => {
  const e = ALIAS[k];
  if (!e) { unresolved.push([r.id, k, 'no vocabulary entry']); return; }
  if (!e.characteristic) { unresolved.push([r.id, k, 'entry carries no characteristic']); return; }
  if ((r.characteristics || {})[e.characteristic] == null) unresolved.push([r.id, k, 'record has no ' + e.characteristic]);
}));
check('every skill key on every record resolves in `skills.vocab.json` to a label AND a governing '
      + 'characteristic the record actually holds — so the best-pool row is derived end to end',
      unresolved.length === 0, unresolved);
check('the ALL-CAPS alias is 1:1 with a vocabulary entry, so the sheet-key inversion the shelf '
      + 'builds cannot collapse two skills into one row', dupAlias.length === 0, dupAlias);

/* ── ABSENCES STAY ABSENCES (§194). ────────────────────────────────────────────────────────────── */
const notOriginal = RECORDS.filter((r) => r.source !== 'Original').map((r) => [r.id, r.source]);
check('all eighteen read `source: "Original"` — these are the app\'s own characters, which is why '
      + 'no card prints a book page', notOriginal.length === 0, notOriginal);
const pageBearing = [];
(function scan(node, trail) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach((v, i) => scan(v, trail + '[' + i + ']')); return; }
  Object.keys(node).forEach((k) => {
    if (/^(page|pages|page_number|pageRef)$/.test(k)) pageBearing.push(trail + '.' + k + ' = ' + node[k]);
    scan(node[k], trail + '.' + k);
  });
}(RECORDS, 'characters'));
check('and no record carries a page field anywhere in its tree — an absence printed as an absence '
      + 'cannot become the wrong book page. A record that grows one is a FINDING, not a licence',
      pageBearing.length === 0, pageBearing);

/* ── THE TWO DEFENCES: the absence that hid finding 5, asserted as an absence (§194). ──────────── */
const snapDefence = [];
RECORDS.forEach((r) => DEFENCE_KEYS.forEach((k) => {
  if ((r.derived || {})[k] !== undefined) snapDefence.push([r.id, k, r.derived[k]]);
}));
// Reconciled, not waived: a record that GROWS a defence key must agree with the rule. Today none
// carries one, and stating that is the point — `(sheet.derived||{}).meleeDefense || 0` turned that
// absence into a confident 0 on the one character whose weapon says 1.
const snapDefenceWrong = RECORDS.filter((r) => {
  const row = reconcileOne(r, null);
  return DEFENCE_KEYS.some((k) => (r.derived || {})[k] !== undefined && (Number(r.derived[k]) || 0) !== row.want[k]);
}).map((r) => r.id);
check('no `derived` block carries a `meleeDefense`/`rangedDefense` key that disagrees with the rule '
      + '— and today none carries one at all (' + JSON.stringify(snapDefence) + '), which is exactly '
      + 'how `(sheet.derived||{}).meleeDefense || 0` printed a confident 0 over Zara Koth\'s '
      + 'Defensive 1. A record that grows one is reconciled, not trusted',
      snapDefenceWrong.length === 0, snapDefenceWrong);
const defenceCarriers = RECORDS.filter((r) => {
  const row = reconcileOne(r, null);
  return row.want.meleeDefense > 0 || row.want.rangedDefense > 0;
}).map((r) => {
  const row = reconcileOne(r, null);
  return [r.id, r.name, 'melee ' + row.want.meleeDefense, 'ranged ' + row.want.rangedDefense];
});
check('the defence legs are NON-VACUOUS — at least one record on this roster derives a NON-ZERO '
      + 'defence, so "0 === 0" cannot satisfy them: ' + JSON.stringify(defenceCarriers)
      + '. No shipped suit carries `defense > 0`, so the whole population comes from weapon '
      + 'qualities, and a roster that lost its last Defensive/Deflection weapon turns this red '
      + 'rather than going quietly vacuous',
      defenceCarriers.length > 0, defenceCarriers);

/* ── THE PERMANENT BITE: the guard reads the bonus block, proved by dropping it. ───────────────── */
const withBlock = RECORDS.filter((r) => r.derivedBonuses && Object.keys(r.derivedBonuses).length).map((r) => r.id);
// POPULATION ONE — a non-zero bonus key. This was the whole load-bearing set before B-735.
const bonusLoadBearing = RECORDS.filter((r) => {
  const b = r.derivedBonuses || {};
  return ['woundThresholdBonus', 'strainThresholdBonus', 'soakBonus', 'forceRatingBonus',
          'meleeDefenseBonus', 'rangedDefenseBonus'].some((k) => (Number(b[k]) || 0) !== 0);
}).map((r) => r.id);
// POPULATION TWO — a record whose RESOLVED defence changes when the block is dropped, because
// dropping it returns the record to R-DAR1's fallback branch, where the defence quality loop is
// never reached at all. Derived by measurement, so it cannot rot into a typed list.
const branchLoadBearing = RECORDS.filter((r) => {
  const resolved = resolvedEquipmentOf(r);
  const live = CharResolve.computeDerived(r, resolved, null);
  const fell = CharResolve.computeDerived(Object.assign({}, r, { derivedBonuses: undefined }), resolved, null);
  return DEFENCE_KEYS.some((k) => (Number(live[k]) || 0) !== (Number(fell[k]) || 0));
}).map((r) => r.id);
const loadBearing = RECORDS.filter((r) => bonusLoadBearing.indexOf(r.id) >= 0
                                       || branchLoadBearing.indexOf(r.id) >= 0).map((r) => r.id);
const bitten = RECORDS.map((r) => reconcileOne(r, { dropBonuses: true }))
  .filter((row) => row.mismatched.length > 0).map((row) => row.id);
check('THE BITE, RUN EVERY TIME: with `derivedBonuses` dropped the same reconciler FAILS on exactly '
      + 'the records the block is load-bearing for — bitten ' + JSON.stringify(bitten)
      + ' against load-bearing ' + JSON.stringify(loadBearing) + ' (a non-zero bonus key '
      + JSON.stringify(bonusLoadBearing) + ' UNION a defence that changes branch '
      + JSON.stringify(branchLoadBearing) + '). A reconciler that ignored the '
      + 'block would pass ' + (18 - loadBearing.length) + ' and lie about ' + loadBearing.length,
      loadBearing.length > 0
      && bitten.length === loadBearing.length
      && loadBearing.every((id) => bitten.indexOf(id) >= 0),
      { bitten, loadBearing, bonusLoadBearing, branchLoadBearing, withBlock });
check('and BOTH load-bearing populations are occupied — a bite whose second population emptied '
      + 'would still pass the arm above while having stopped testing the branch it was added for',
      bonusLoadBearing.length > 0 && branchLoadBearing.length > 0,
      { bonusLoadBearing, branchLoadBearing });
check('and the honest run passes all eighteen, so the bite above is the only difference between a '
      + 'green sweep and a red one', rows.every((r) => r.mismatched.length === 0),
      rows.filter((r) => r.mismatched.length).map((r) => [r.id, r.mismatched]));

/* ── THE SHARED CORE AGREES, AND CANNOT BE THE RECONCILER — both demonstrated. ─────────────────── */
function viaCore(rec, mutate) {
  const sheet = JSON.parse(JSON.stringify(rec));
  if (mutate) mutate(sheet);
  const armorRef = (sheet.equipment && sheet.equipment.armor) || {};
  const armorRec = armorRef.id ? ARMOR[armorRef.id] : null;
  const resolved = armorRec ? { armor: { soak: armorRec.soak || 0, defense: armorRec.defense || 0 } } : null;
  return CharResolve.computeDerived(sheet, resolved, null);
}
const coreDisagree = RECORDS.filter((r) => {
  const d = viaCore(r, null), got = r.derived || {};
  return ['soak', 'woundThreshold', 'strainThreshold', 'forceRating'].some((k) => (Number(d[k]) || 0) !== (Number(got[k]) || 0));
}).map((r) => r.id);
check('`CharResolve.computeDerived` — the app\'s own shared core, driven over the same registries — '
      + 'agrees with all eighteen stored blocks, so the rule above is not a second opinion',
      coreDisagree.length === 0, coreDisagree);

// (1) THE GRACE BRANCH. A record with no `derivedBonuses` renders from its snapshot (R-DAR1), so a
//     snapshot that is wrong by any amount comes back unchanged.
//
//     RE-POINTED BY B-735, and the re-point is the lap working rather than the demonstration becoming
//     unnecessary. Fifteen of the eighteen used to be in that shape and one of them was the subject
//     here; all eighteen now carry a block, so NO SHIPPED RECORD IS ON THE FALLBACK BRANCH ANY MORE.
//     The branch is still law and still load-bearing for the uncountable legacy saves in players'
//     localStorage, so the subject is now a record BUILT from a shipped archetype with its block
//     stripped — the same population, synthesized instead of shipped, which is exactly the move
//     `smoke_b57_legacy_shape_floors.py` already documents for the floor. The arm asserts the
//     synthesis really is in the legacy shape first, or it would demonstrate nothing.
const graceBase = RECORDS[0];
const graceSubject = Object.assign({}, JSON.parse(JSON.stringify(graceBase)), { derivedBonuses: undefined });
delete graceSubject.derivedBonuses;
check('the grace-branch subject is SYNTHESIZED and really is in the legacy shape (`' + graceBase.id
      + '` with its block stripped: has `derived`, no `derivedBonuses`) — and all ' + withBlock.length
      + ' of the eighteen shipped records now carry a block, so none is on that branch',
      !!graceSubject.derived && !graceSubject.derivedBonuses && withBlock.length === RECORDS.length,
      { snap: !!graceSubject.derived, bonuses: !!graceSubject.derivedBonuses, withBlock: withBlock.length });
const graced = viaCore(graceSubject, (s) => { s.characteristics.brawn = 99; s.woundBase = 0; });
check('DEMONSTRATED — the shared core cannot falsify a wrong block for a record with no '
      + '`derivedBonuses`: `' + graceSubject.id + '` with brawn forced to 99 and '
      + 'its wound base to 0 still returns soak ' + graced.soak + ' / wounds ' + graced.woundThreshold
      + ', its snapshot verbatim (R-DAR1 legacy law). Which is why the rule is computed in this file',
      graced.soak === graceSubject.derived.soak && graced.woundThreshold === graceSubject.derived.woundThreshold,
      { graced, snapshot: graceSubject.derived });
const graceReconciled = reconcileOne(Object.assign({}, graceSubject, {
  characteristics: Object.assign({}, graceSubject.characteristics, { brawn: 99 }), woundBase: 0,
}), null);
check('…and THIS guard does refuse that same corruption — ' + JSON.stringify(graceReconciled.mismatched)
      + ' would go red', graceReconciled.mismatched.length > 0, graceReconciled);

// (2) THE FLOOR. On the modern branch wound/strain/Force rating are `max(computed, snapshot)`
//     (B-49/B-57), so a snapshot that is too HIGH wins over the rule even where the core computes.
const floorSubject = RECORDS.find((r) => r.derivedBonuses && (Number(r.derivedBonuses.woundThresholdBonus) || 0) !== 0);
const floored = viaCore(floorSubject, (s) => { s.woundBase = 0; s.characteristics.brawn = 0; });
check('DEMONSTRATED — and for the ' + withBlock.length + ' that DO carry a block the core is floored '
      + 'by the snapshot: `' + floorSubject.id + '` with its wound base and brawn forced to 0 still '
      + 'returns wounds ' + floored.woundThreshold + ' (the snapshot), because the modern branch '
      + 'takes max(computed, snapshot). Correct for a year-old save, useless as a reconciler',
      floored.woundThreshold === floorSubject.derived.woundThreshold, { floored, snapshot: floorSubject.derived });
const floorReconciled = reconcileOne(Object.assign({}, floorSubject, {
  woundBase: 0, characteristics: Object.assign({}, floorSubject.characteristics, { brawn: 0 }),
}), null);
check('…and THIS guard refuses that one too — ' + JSON.stringify(floorReconciled.mismatched)
      + ' would go red', floorReconciled.mismatched.indexOf('woundThreshold') >= 0, floorReconciled);

console.log('\n' + (fail ? 'FAIL' : 'PASS') + '  ' + pass + '/' + (pass + fail)
  + ' — the eighteen Quick Start records reconcile against `species.json`, `armor.json` and their own '
  + '`derivedBonuses` — six numbers each, the two DEFENCES included, derived from `weapons.json`\'s '
  + 'own Defensive/Deflection quality records; the register partitions six-six-six and carries the '
  + 'campaign mechanic; every skill key resolves; every absence is asserted absent; and the '
  + 'reconciler is proved to READ the bonus block by failing without it on exactly the '
  + loadBearing.length + ' records it is load-bearing for (' + loadBearing.join(', ') + ').\n');
process.exit(fail ? 1 : 0);
