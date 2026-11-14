#!/usr/bin/env node
/*
 * b1518_implant_derived.cjs — B-1518's DERIVED half (ruling `release-r7-bug-burndown` ADDENDUM 47): a player character's
 * in-use cybernetic implant's own soak / wound / defence lines (gear.json `character_effects`, through
 * ItemResolve.implantEffectLines → the resolved item's `_characterEffects`, `implant: true`) reach computeDerived — the ONE
 * derivation (charter §8) — as droidOf reads them for a droid. Implant Armor: soak +1 (EotE p.174).
 *
 *   D1  Implant Armor in use: soak = the bare sheet's + 1; derivedBecause names "Implant Armor" on the soak chain;
 *   D2  stowed (not in use, R-M12B-40's test): soak unchanged;
 *   D3  a synthetic implant line wound_threshold_delta +2 / defense_delta melee +1: the wound threshold +2, melee defence +1
 *       (defence still capped at 4); a NON-implant item carrying the same ops adds nothing (implants only);
 *   D5  ADDENDUM 52: a sheet in the SNAPSHOT form (baked `derived`, no derivedBonuses — Kiran Sol with derivedBonuses removed)
 *       with Implant Armor in use reads soak = its snapshot + 1, and derivedBecause names Implant Armor there too;
 *   T1  the TALENT half, (a) engine only: an in-use Adrenal Implant's talent_add (Rapid Recovery, Lords of Nal Hutta p.106)
 *       is a grant in grantedTalentsAtRender — the one reader the pools, the Force-rating floor and the owned counts read;
 *       Cybernetic Reflexes' Rapid Reaction (a pool talent) reaches ownedTalentPoolSources;
 *   T2  stowed: no grant.
 *   (post1-switch-deletion, ADDENDUM 638: the engine key is gone; D4 and T2's key-OFF half went with it, table 3.)
 * Exit 0 green · 1 red.
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const CR = require(path.join(ROOT, 'lib/shared/charResolve.js'));
const IR = require(path.join(ROOT, 'lib/shared/itemResolve.js'));
const reg = (n) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', n + '.json'), 'utf8'));
let fails = 0;
const ok = (c, m, d) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (c || d === undefined ? '' : '  -> ' + JSON.stringify(d))); if (!c) fails++; };

const GEAR = reg('gear').gear, CB = { talents: reg('talents').talents, species: reg('species').species, careers: reg('careers').careers,
  specializations: reg('specializations').specializations, forcePowers: reg('force_powers').force_powers };
const ARMOR = GEAR.implant_armor;
ok(!!ARMOR && IR.implantEffectLines(ARMOR).some((l) => l.op === 'soak_delta' && l.value === 1 && l.implant), 'the record: implant_armor carries soak_delta +1 as an implant line');
const KIRAN = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/pregen_sheets.json'), 'utf8')).characters.find((c) => c.name === 'Kiran Sol');
ok(!!KIRAN && !!KIRAN.derivedBonuses, 'the sheet: Kiran Sol (pregen, SYNTHETIC) carries derivedBonuses (the derived branch, not a legacy snapshot)');
const SHEET = Object.assign(JSON.parse(JSON.stringify(KIRAN)), { equipment: { weapons: [], armor: null, gear: [] } });
const eq = (gear) => ({ weapons: [], armor: null, gear });
const item = (rec, state, lines) => ({ name: rec.name, state, _characterEffects: lines || IR.implantEffectLines(rec) });

const bare = CR.computeDerived(SHEET, eq([]), CB);
const worn = CR.computeDerived(SHEET, eq([item(ARMOR, 'carried')]), CB);
ok(worn.soak === bare.soak + 1, 'D1 Implant Armor in use: soak ' + bare.soak + ' → ' + worn.soak, { bare: bare.soak, worn: worn.soak });
const why = CR.derivedBecause ? CR.derivedBecause(SHEET, eq([item(ARMOR, 'carried')]), CB) : null;
ok(!!why && (why.soak || []).some((r) => r.source === 'Implant Armor' && r.to - r.from === 1), 'D1 derivedBecause names Implant Armor on the soak chain', why && why.soak);
const stowed = CR.computeDerived(SHEET, eq([item(ARMOR, 'stowed')]), CB);
ok(stowed.soak === bare.soak, 'D2 stowed: soak unchanged (' + stowed.soak + ')');
const SYN = { name: 'Test Implant', type: 'Cybernetics', character_effects: [{ op: 'wound_threshold_delta', key: 'self', value: 2 }, { op: 'defense_delta', key: 'melee', value: 1 }] };
const syn = CR.computeDerived(SHEET, eq([item(SYN, 'carried')]), CB);
ok(syn.woundThreshold === bare.woundThreshold + 2 && syn.meleeDefense === Math.min(4, bare.meleeDefense + 1) && syn.rangedDefense === bare.rangedDefense,
  'D3 an implant\'s wound +2 / melee defence +1 reach the derivation', { bare, syn });
const plain = CR.computeDerived(SHEET, eq([item(SYN, 'carried', IR.implantEffectLines(SYN).map((l) => Object.assign({}, l, { implant: false })))]), CB);
ok(plain.woundThreshold === bare.woundThreshold && plain.meleeDefense === bare.meleeDefense, 'D3 the same ops on a non-implant line add nothing (implants only)');
const SNAP = JSON.parse(JSON.stringify(SHEET)); delete SNAP.derivedBonuses;
const snapBare = CR.computeDerived(SNAP, eq([]), CB), snapWorn = CR.computeDerived(SNAP, eq([item(ARMOR, 'carried')]), CB);
const snapWhy = CR.derivedBecause ? CR.derivedBecause(SNAP, eq([item(ARMOR, 'carried')]), CB) : null;
ok(!!SNAP.derived && snapBare.soak === Number(SNAP.derived.soak) && snapWorn.soak === snapBare.soak + 1 && !!snapWhy && (snapWhy.soak || []).some((r) => r.source === 'Implant Armor'),
  'D5 ADDENDUM 52: the snapshot form (no derivedBonuses) with Implant Armor in use: soak ' + snapBare.soak + ' → ' + snapWorn.soak + ', the because names it', { snap: SNAP.derived && SNAP.derived.soak, bare: snapBare.soak, worn: snapWorn.soak, why: snapWhy && snapWhy.soak });
const CBI = Object.assign({}, CB, { items: { gear: GEAR, weapons: reg('weapons').weapons, armor: reg('armor').armor } });
const withGear = (list) => Object.assign(JSON.parse(JSON.stringify(SHEET)), { equipment: { weapons: [], armor: null, gear: list } });
const g1 = CR.grantedTalentsAtRender(withGear([{ id: 'adrenal_implant', state: 'carried' }]), CBI);
ok(g1.some((g) => g.id === 'rapid_recovery' && g.rank === 1 && g.origin === 'implant'), 'T1 Adrenal Implant in use → Rapid Recovery granted at render', g1);
const ps = CR.ownedTalentPoolSources(withGear([{ id: 'cybernetic_reflexes', state: 'carried' }]), CBI);
ok(ps.some((t) => t.id === 'rapid_reaction'), 'T1 Cybernetic Reflexes in use → Rapid Reaction\'s dice rows reach ownedTalentPoolSources', ps.map((t) => t.id));
const g2 = CR.grantedTalentsAtRender(withGear([{ id: 'adrenal_implant', state: 'stowed' }]), CBI);
ok(!g2.some((g) => g.origin === 'implant'), 'T2 stowed: no implant grant');

console.log(fails ? '\n✗ RED — ' + fails + ' failed' : '\n✓ GREEN');
process.exit(fails ? 1 : 0);
