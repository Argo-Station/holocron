/**
 * sheetPool.js — THE SHEET'S DICE PATH, one unit, for both apps (ruling `shipyard-s4-ship-pool-path` R-S4PP-1..3).
 *
 * What a character rolls for a skill: the saved sheet's characteristic and rank, the carried items' and owned
 * talents' auto-applying dice (the ONE assembler, `SWRPGPoolMods`), composed by the ONE dice core
 * (`SWRPGDice.buildPool`). The player's sheet, its dice hub and the Ship Yard's seats on BOTH apps ask this
 * module, so a character cannot show one pool on the sheet and another in a ship's seat (PRAXIS §5: a second
 * path for the same number is a defect).
 *
 * VERBATIM. Everything between BEGIN and END was moved, unedited, from `player/app.jsx` @ `766f215c`:
 * `sheetPoolFor`'s closure as `scripts/census_s4_pool_path.cjs` measured it (15 declarations), plus
 * `loadCanonicalCharacterBuild` and its cache invalidator (R-S4PP-3). `scripts/check_sheet_pool_verbatim.cjs`
 * proves it line for line against that base. Members changed since sit below the region under MERGED AFTER THE MOVE
 * headers (`loadCanonicalCharacterBuild` among them since F-100 M12). It owns nothing it calls: ItemResolve, CharResolve, SWRPGDice,
 * SWRPGPoolMods and SWRPGItemRegistries stay the owners. A later move of a member into its owning core is a
 * separate refactor (R-S4PP-1).
 *
 * HOSTS.
 *   player — a `defer` script before app.js; app.jsx binds every name below by the same name (R-S4PP-2), so
 *            its 64 call sites and the page globals the smokes read are unchanged.
 *   gm     — loaded LAZILY with fetchJson.js, portraits.js and poolMods.js when the Yard mounts under K9
 *            (`ensureYardCharCore`, gm/app.jsx); with K9 OFF the GM app requests none of it (R-S4PP-3).
 *
 * FREE NAMES it reads at CALL time (never at load): window.SWRPGDice, SWRPGPoolMods, SWRPGItemRegistries,
 * ItemResolve, SWItems, CharResolve, _canonicalCharbuild, _canonicalRegistries, _canonicalRegistriesBase (B-984), SWRPGUserData, SWRPGMods;
 * `qbFetchJson` (lib/shared/fetchJson.js) and `speciesPortraitIndexReady` (lib/shared/portraits.js).
 *
 * Exports window.SWRPGSheetPool = { charPool, loadCanonicalCharacterBuild, deriveItemState, sheetItemRegistries, resolveSheetEquipment, OGG_TO_SHEET_SKILL, CHAR_KEY_TO_PROP, poolModSkillIndex, collectPoolMods, withPoolMods, collectRollNumbers, SHEET_KEY_TO_OGG, skillEntryRank, sheetSkillRank, sheetSkillCharacteristic, sheetPoolOf, sheetPoolFor, yardCharPool, yardSeatLines, weaponPoolOf }.
 * `charPool(charRec, skillId, upgradeAbility, taken?)` is `yardCharPool`: a character record's pool for a canonical
 * skill id, plus a ship's upgrade — the pool object {proficiency, ability, boost, setback}, or null before the
 * vocabulary is loaded.
 */
(function () {
// ── BEGIN VERBATIM (player/app.jsx @ 766f215c) ─────────────────────────────────────────────────────────────────
// F-9 B2 (cont.) — a toggle flip invalidates the cached charbuild so the next load re-resolves
// against the new active set. The live creator re-render kick lands with the toggle itself (Phase
// C, the srcTick pattern); this just guarantees no stale overlaid view survives the flip.
if (typeof window !== 'undefined' && !window._modsInvalidatorWired) {
  window._modsInvalidatorWired = true;
  window.addEventListener('swrpg-mods-changed', function() {
    window._canonicalCharbuild = null;
    window._canonicalCharbuildPromise = null;
  });
  // F-100 UD-1f: a user-pack change (import, edit, ON/OFF) invalidates the same discovery view.
  window.addEventListener('swrpg-user-packs-changed', function() {
    window._canonicalCharbuild = null;
    window._canonicalCharbuildPromise = null;
  });
}

// Resolve persisted equipment (canonical id-refs / {_inline} / legacy old-shape) -> DISPLAY
// equipment for render. GRACEFUL: an unresolvable old-saved-char entry or dangling ref is skipped,
// never thrown (verification add #2). Emits `damage`, the display string
// ("+N"/N via canonicalToStore). `damageTotal` REMOVED (F-60): it carried the Brawn-added arithmetic
// for the encounter attack POST (ADR 0004), and the encounter system was removed in 189e24e — 0
// readers since. NOTE `IR.weaponDamage` itself STAYS: it is itemResolve's public API, pinned by
// test/item_resolve.cjs, and it is what keeps "Brawn lands exactly once" true for the next consumer.
// C-LIM-1 read-side migration: absent state resolves from loc/worn (no rewrite of old saves).
function deriveItemState(entry, kind) {
  if (entry && entry.state) return entry.state;
  if (entry && entry.loc === 'stored') return 'stowed';
  if (kind === 'armor' && entry && entry.worn) return 'worn';
  return 'carried';
}

// F-100 UD-1f (ruling f100-ud1-contracts H2): the items view a SHEET owns — its `user:` stamps over the
// pristine base (SWRPGItemRegistries.forStampSync). No user stamp → the pristine base, byte-equal to
// before this lap (test/sheet_equipment_stamp_seam.cjs); `_canonicalRegistries` is now DISCOVERY.
// B-852 (ruling f100-b852): EVERY sheet-path item read comes through here — the item detail, the modify
// bench, the gear list and the OggDude export (census scripts/b852_registry_reads_census.cjs, pinned by
// test/b852_sheet_registry_reads.cjs). Its fallback to the discovery global is gone: the page loads
// itemRegistries.js (deferred) before app.js, and forStampSync's own pre-load fallback is the contract's.
// null = no view yet; each caller keeps its own empty default.
function sheetItemRegistries(character) {
  return window.SWRPGItemRegistries ? window.SWRPGItemRegistries.forStampSync(character && character.mods, character && character.own) : null;
}

// Oggdude skill-key → SKILL_NAMES key. Oggdude uses different abbreviations
// (PERC vs PERCEP, SW vs STREET, etc.); the character sheet + review iterate
// SKILL_NAMES keys, so we translate at dispatch-time in the FullCreator.
const OGG_TO_SHEET_SKILL = {
  PERC:'PERCEP', PILOTSP:'PILSP', PILOTPL:'PILPLAN', SW:'STREET',
  UND:'KNOWUND', CORE:'KNOWCORE', EDU:'KNOWED', LORE:'KNOWLORE',
  OUT:'KNOWOUT', WARF:'KNOWWARF', XEN:'KNOWXENO',
  SKUL:'SKULL', NEG:'NEGOT', LTSABER:'LTSAB',
};

var CHAR_KEY_TO_PROP = { BR: 'brawn', AG: 'agility', INT: 'intellect', CUN: 'cunning', WIL: 'willpower', PR: 'presence' };

// A RANK UNDER THE OLDER KEY IS STILL A RANK (found by B-611's smoke): a saved record can carry a skill
// under its Oggdude spelling — the `maxed` persona holds LTSABER: 5 — and the legacy cockpit, reading
// SKILL_NAMES keys only, showed three trained skills where the record has four; the dice hub reads the
// same way. The stage reads BOTH spellings through the creator's own alias table (OGG_TO_SHEET_SKILL,
// inverted once). The legacy sheet's and the hub's gap is filed as its own row (B-619), not fixed here.
var SHEET_KEY_TO_OGG = Object.keys(OGG_TO_SHEET_SKILL).reduce(function (m, ogg) { m[OGG_TO_SHEET_SKILL[ogg]] = ogg; return m; }, {});

// R-B658 READ-SIDE TOLERANCE (ruling `b658-sheet-skill-grant-shape`, Scope). A saved sheet's `skills`
// map holds one NUMBER per key, and the writer that broke that contract is fixed at its source
// (`CharResolve.speciesAskPatch`). But sheets ALREADY saved by the species ask before the fix carry an
// object entry, and `Number(obj) || 0` reads those as 0 — a rank the player answered for, shown as
// untrained. So every rank read goes through the shared flatten rule instead of a bare `Number()`:
// the object renders its real rank, and the next write flattens it. NOT a migration, and NOT a second
// writer — read tolerance only. Defensive about the global because these are render-hot paths that
// must not throw before `vendor.js` has installed the core.
function skillEntryRank(entry) {
  return (window.CharResolve && window.CharResolve.skillRankOf)
    ? window.CharResolve.skillRankOf(entry)
    : (Number(entry) || 0);
}

function sheetSkillRank(skills, key) {
  skills = skills || {};
  if (skills[key] != null) return skillEntryRank(skills[key]);
  var ogg = SHEET_KEY_TO_OGG[key];
  return ogg && skills[ogg] != null ? skillEntryRank(skills[ogg]) : 0;
}

function sheetPoolFor(sheet, sheetKey, mods, extra) {
  var Dice = window.SWRPGDice; if (!Dice || !Dice.buildPool || !Dice.renderPool) return null;
  return Dice.renderPool(sheetPoolOf(sheet, sheetKey, mods, extra), { size: 1 });
}

// ── END VERBATIM ────────────────────────────────────────────────────────────────────────────────────────────────

// ── MERGED AFTER THE MOVE (F-100 M12 step 3, B-1244; ruling `f100-m12-build-card` R-M12B-8) ─────────────────────────────────
// `loadCanonicalCharacterBuild` changed after the move, so — as `collectPoolMods`, `sheetPoolOf`, `withPoolMods` and
// `resolveSheetEquipment` did — it lives outside the VERBATIM region; the region's other chunks are still proven against
// 766f215c. Its one change: it also fetches `signature_abilities.json` into the view's `signatureAbilities` (the r[]
// indices after it shift by one). The cache invalidator below the region is unchanged and stays inside it.
// Character-build canonical registries (ADR 0003 charbuild cluster, sub-step 3a). Same
// fetch-once/cache-on-window pattern as loadCanonicalRegistries above. Replaces the raw
// oggdude_merged.json fetch + normalizeOggdude for the creator. skillNames = canonical
// skill id -> display label (the backward half of the vocab convention, from
// skills.vocab.json).
function loadCanonicalCharacterBuild() {
  if (window._canonicalCharbuild) return Promise.resolve(window._canonicalCharbuild);
  if (window._canonicalCharbuildPromise) return window._canonicalCharbuildPromise;
  var base = 'public/data/canonical/';
  window._canonicalCharbuildPromise = Promise.all([
    qbFetchJson(base + 'species.json'),
    qbFetchJson(base + 'careers.json'),
    qbFetchJson(base + 'specializations.json'),
    qbFetchJson(base + 'talents.json'),
    qbFetchJson(base + 'force_powers.json'),
    // F-100 M12 (B-1244; rulings f100-m12-census-card R-M12C-38/39, f100-m12-build-card R-M12B-8): the 38 book signature
    // abilities, as the charbuild view's `signatureAbilities` (the view's camelCase, as force_powers → forcePowers). Read by
    // CharResolve's signature readers and by the OggDude import's index.
    // A missing file fails SOFT to {} — an older deploy without it must still boot the creator.
    qbFetchJson(base + 'signature_abilities.json').catch(function() { return null; }),
    qbFetchJson(base + 'skills.vocab.json'),
    // C15: the motivation registry — built and validated since B-91 but never FETCHED, because no
    // surface read it until the picker existed. 32 categories / 283 specifics, joined on the
    // category NAME (`specific.category_source_key` holds "Ambition", not the `AMB` source key).
    qbFetchJson(base + 'motivations.json'),
    // R-ST-4: the creator's per-LINE step cites — corpus pages recorded in
    // `scripts/derive_step_cites.py`, printed pages produced through the one converter. A line
    // absent from the map draws NO cite, never another line's.
    qbFetchJson(base + 'creator_step_cites.json'),
    // The portrait index (index.html). Joined here rather than fetched independently so the species
    // browser cannot render before it lands: `speciesImgPath` fails CLOSED to the Monogram while the
    // index is null, and a species flashing a placeholder and then an image would be a worse bug
    // than the empty tile this replaces. The promise never rejects, so it cannot take charbuild down.
    speciesPortraitIndexReady,
  ]).then(function(r) {
    var skillNames = {}, skillSheetKeys = {}, skillGroups = {}, skillDescs = {}, skillCites = {};
    // F-101 cluster one: the skill's GOVERNING CHARACTERISTIC. It has been in
    // `skills.vocab.json` all along and nothing read it; the board's career screen prints it beside
    // every career skill ("Athletics BR"), which is the fact that makes a career skill list mean
    // something rather than being eight words.
    var skillChars = {};
    (r[6].entries || []).forEach(function(e) {
      skillNames[e.id] = e.label;
      // The creator state + saved sheets key skills by the SWItems short key (PERCEP, STREET, …)
      // — every vocab entry carries it as its ALL-CAPS alias (verified 35/35). 3b migrates the
      // save shape; until then this is the canonical-id -> state-key bridge.
      skillSheetKeys[e.id] = ((e.aliases || []).find(function(a) { return /^[A-Z]+$/.test(a); })) || e.id;
      // F-58: the skill's plain-language explanation, now REGISTRY data resolved at render. It used
      // to be `FC_SKILL_DESC`, a hardcoded map in this file — a display string living in a component,
      // which is the class the R0 census catalogued. Keyed by the same SHEET key the consumers hold,
      // so the lookup shape at the three render sites is unchanged.
      skillDescs[skillSheetKeys[e.id]] = e.description || '';
      // B-181: the skill's page cite, keyed by the same SHEET key as skillDescs — the talent-choice
      // picker's reading strip shows it verbatim beneath the description (R-TCPK-7). Same registry
      // (skills.vocab.json `cite`), resolved at render; one home, no prop-drilled copy.
      skillCites[skillSheetKeys[e.id]] = e.cite || '';
      // B-22: the skill category (combat/knowledge/general/social) — feeds the option-level
      // category pools (Mandalorian Human's combat/knowledge grants) resolved in the picker.
      if (e.group) skillGroups[e.id] = e.group;
      if (e.characteristic) skillChars[e.id] = e.characteristic;
    });
    var baseView = {
      species: r[0].species, careers: r[1].careers, specializations: r[2].specializations,
      talents: r[3].talents, forcePowers: r[4].force_powers,
      signatureAbilities: (r[5] && r[5].signature_abilities) || {},
      skillNames: skillNames, skillSheetKeys: skillSheetKeys, skillGroups: skillGroups, skillDescs: skillDescs, skillCites: skillCites, skillChars: skillChars,
      motivationCategories: (r[7] && r[7].categories) || [],
      motivationSpecifics: (r[7] && r[7].specifics) || [],
      // R-MRR-2: the category-tier roll table, line-keyed; absent on old data (then: no roll).
      categoryRolls: (r[7] && r[7].category_rolls) || null,
      stepCites: r[8] || null,
    };
    // F-9 B2 — the ONE merge point. Keep the PRISTINE base for stamp resolution (the sheet
    // resolves against its OWN stamp via SWRPGMods.resolveForStamp, never this toggle view). The
    // CREATOR reads _canonicalCharbuild = the base overlaid with whatever variant the toggle has
    // active (empty toggle → base unchanged, zero fetch). Discovery (toggle) vs ownership (stamp).
    window._canonicalCharbuildBase = baseView;
    // F-100 UD-1f (R-FUD-6): the active USER packs fold AFTER the variants, through the same seam —
    // base → variants → imported → own → my_data. The pristine base above stays pristine (a sheet's
    // stamp resolves from it); only the discovery view below carries the packs.
    var UD = window.SWRPGUserData || null;
    if (UD) UD.provideBase({ species: baseView.species, careers: baseView.careers, specializations: baseView.specializations,
      talents: baseView.talents, force_powers: baseView.forcePowers,
      signature_abilities: baseView.signatureAbilities });   // F-100 M12 (ADDENDUM 33 R-M12B-112): the ninth applied section's base
    return (UD ? UD.ready().catch(function() { return null; }) : Promise.resolve()).then(function() {
      var activeMods = ((window.SWRPGMods && window.SWRPGMods.active()) || []).concat(UD ? UD.activeStamps() : []);
      if (!activeMods.length) { window._canonicalCharbuild = baseView; return baseView; }
      return window.SWRPGMods.resolveForStamp(activeMods, baseView).then(function(view) {
        window._canonicalCharbuild = view || baseView;
        return window._canonicalCharbuild;
      });
    });
  }).catch(function(err) { console.warn('[canonical] charbuild registry load failed:', err); return null; });
  return window._canonicalCharbuildPromise;
}

// ── MERGED AFTER THE MOVE (F-100 M8 C7, ruling `f100-m8-build` R-M8G-16: card item 17's re-base, by ruling) ─────────────
// `resolveSheetEquipment` changed after the move, so — as `collectPoolMods` and `sheetPoolOf` did — it lives outside the
// VERBATIM region; the region's other chunks are still proven against 766f215c. Its one change is the last step: the
// owner's talents' item changes (CharResolve.ownedItemEffects, read through the marks R-M8G-12 puts on the entries) are
// projected onto the RESOLVED display by ItemResolve.applyCharacterEffects. The saved entry is never written.
function resolveSheetEquipment(equipment, character) {
  var out = { weapons: [], armor: null, gear: [], credits: equipment ? equipment.credits : 0, _owner: character };  // F-100: collectPoolMods adds its talents' dice
  if (!equipment) return out;
  var IR = window.ItemResolve, SW = window.SWItems;
  var regs = sheetItemRegistries(character) || { weapons: {}, armor: {}, gear: {} };
  if (!IR || !SW) return out;
  // B-1185 (R-B1185-1): an entry's installed attachments, base fields AND selected options, are applied to the RECORD by the
  // one shared path before canonicalToStore, so the row, `_qualitiesRaw` (what computeDerived's defence reads) and every
  // derived number see the same record as the MODIFY preview. A granted quality is named from the vocabulary (R-B1185-11).
  var qLabels = IR.qualityLabelsOf ? IR.qualityLabelsOf(window._qualitiesDb) : {};
  // R-SPF-18 (`f100-surfacing-preflip-species-card`): an ARMOUR always goes through the one path, with or without
  // attachments (an empty list), so a quality it carries itself (Superior's armor_effects) is read once there; weapons and
  // gear are unchanged.
  function withAttachments(kind, rec, entry) {
    var atts = entry && typeof entry === 'object' && Array.isArray(entry.attachments) ? entry.attachments : null;
    if (rec && kind === 'armor' && IR.applyInstalledAttachments && !(atts && atts.length))
      return IR.applyInstalledAttachments('armor', rec, [], regs.attachments || {}, { qualityLabels: qLabels });
    return (rec && atts && atts.length && IR.applyInstalledAttachments)
      ? IR.applyInstalledAttachments(kind, rec, atts, regs.attachments || {}, { qualityLabels: qLabels }) : rec;
  }
  // What the shared path counted travels on the display beside `_qualitiesRaw`: the skipped selection keys and the
  // attachments' carry bonuses (computeEncumbrance reads `_attachmentCarry`, R-B1185-5).
  function attachmentMarks(disp, rec) {
    if (rec._attachmentModsSkipped) disp._attachmentModsSkipped = rec._attachmentModsSkipped;
    if (rec._attachmentCarry) disp._attachmentCarry = rec._attachmentCarry;
    if (rec._qualitiesReduced) disp._qualitiesReduced = rec._qualitiesReduced;   // B-1204 (QR1): what lowered a rating
    if (rec._qualityOffers) disp._qualityOffers = rec._qualityOffers;            // and the conditional ones, offered
    if (rec._characterEffects) disp._characterEffects = rec._characterEffects;   // F-100 M12 MV3 (R-M12B-59): CharResolve reads them in use
    if (rec._spendCostDeltas) disp._spendCostDeltas = rec._spendCostDeltas;      // F-100 M12 QS2 (R-M12B-70): spendRows reads them
    return disp;
  }
  // Instance state (qty / currentAmmo / state / …) lives on the ENTRY, not the catalog record
  // (approved). Overlay every entry field except the resolution keys onto the resolved display, so
  // catalog stats come from the registry and instance state from the entry.
  function overlay(disp, entry, kind) {
    if (entry && typeof entry === 'object') {
      Object.keys(entry).forEach(function(k) { if (k !== 'id' && k !== '_inline') disp[k] = entry[k]; });
    }
    disp.state = deriveItemState(entry, kind);
    return disp;
  }
  // MAP-PRESERVE: weapons/gear arrays keep their length + index (a dangling canonical ref becomes a
  // visible marker, not a skip) so SheetLoadout's edit-by-index stays aligned with the persisted
  // entries. Legacy old-shape entries pass through (best-effort); nothing throws.
  (equipment.weapons || []).forEach(function(entry) {
    if (IR.isCanonicalEntry(entry, regs.weapons)) {
      var rec = IR.pcResolveEntry(entry, regs.weapons);
      if (!rec) { out.weapons.push({ name: '(unknown weapon)', damage: '', crit: '', range: '', qualities: [], _qualitiesRaw: [], _unresolved: true }); return; }
      rec = withAttachments('weapon', rec, entry);
      var disp = SW.canonicalToStore(rec, 'weapons');     // damage = "+N"/N display string
      disp._qualitiesRaw = rec.qualities || [];
      // F-100 M12 QK1: a talent row's KIND test (ItemResolve.applyCharacterEffects) reads the record's categories (R-M12F-8)
      disp._categories = Array.isArray(rec.categories) ? rec.categories : [];
      out.weapons.push(attachmentMarks(overlay(disp, entry, 'weapon'), rec));
    } else if (entry && entry.name) {
      entry.state = deriveItemState(entry, 'weapon');
      // C-BDS-2: DELIBERATELY NOT STAMPED. This entry is a pre-id-ref save, whose `.qualities` is the
      // DISPLAY shape canonicalToStore emits — an array of strings ("Defensive 1"), not the
      // {id, rank} records the defence loop reads. There is no truthful `_qualitiesRaw` to write
      // without inventing a string parser, so the field stays ABSENT and computeDerived's
      // unknowable-branch reports it. Absent (never resolved) and [] (resolved, none) must stay
      // distinguishable — that difference is the whole signal.
      out.weapons.push(entry);                            // legacy old-shape: best-effort passthrough
    } else {
      out.weapons.push({ name: '(unknown weapon)', _qualitiesRaw: [], _unresolved: true });
    }
  });
  var aEntry = equipment.armor;
  if (aEntry) {
    if (IR.isCanonicalEntry(aEntry, regs.armor)) {
      var aRec = withAttachments('armor', IR.pcResolveEntry(aEntry, regs.armor), aEntry);
      out.armor = aRec ? attachmentMarks(overlay(SW.canonicalToStore(aRec, 'armor'), aEntry, 'armor'), aRec) : { name: '(unknown armor)', soak: 0, defense: 0, _unresolved: true, state: deriveItemState(aEntry, 'armor') };
    } else if (aEntry.name) {
      aEntry.state = deriveItemState(aEntry, 'armor');
      out.armor = aEntry;
    }
  }
  (equipment.gear || []).forEach(function(entry) {
    // R-ASS-1 (ruling armor-save-shape; B-613 — F-59 closes): a SPARE suit is an ordinary inventory
    // entry carrying the ARMOUR record's id-ref. It resolves from the armour registry, carries its
    // encumbrance in full (a carried-not-worn suit counts full — EotE p.168 / p.207), and is marked
    // so the pack lists it under PROTECTION with WEAR. Before this line it read "(unknown gear)".
    // (`isCanonicalEntry` tests the entry's SHAPE, not registry membership — so the registries are asked directly.)
    // An `{_inline}` suit (a crafted one, a homebrew copy) has no id to look up: it is a spare when its own record is
    // armour-shaped (ItemResolve.isArmorRecord — ruling release-r5-crafting-kp-c0 Q1 (a); B-1162's sheet half), or when the
    // store filed it marked `as: 'armor'` (B-1162, ruling release-r7-bug-burndown ADDENDUM 55: the key's acting reader on the sheet; the OggDude export is the second, ADDENDUM 266) — a
    // homebrew suit's record need carry no soak or defence to be armour.
    if (entry && typeof entry === 'object' && ((entry.id != null && !(regs.gear && regs.gear[entry.id]) && regs.armor && regs.armor[entry.id])
        || (entry._inline && (entry.as === 'armor' || IR.isArmorRecord(entry._inline))))) {
      var sRec = withAttachments('armor', IR.pcResolveEntry(entry, regs.armor), entry);
      if (sRec) { out.gear.push(Object.assign(attachmentMarks(overlay(SW.canonicalToStore(sRec, 'armor'), entry, 'gear'), sRec), { _armorSpare: true, section: 'armor', type: 'Armour (spare)' })); return; }
    }
    if (IR.isCanonicalEntry(entry, regs.gear)) {
      var gRec = withAttachments('gear', IR.pcResolveEntry(entry, regs.gear), entry);
      // R-R7-GD1 (ruling release-r7-bug-burndown ADDENDUM 345; B-1626): a LOOSE PART — an id that no gear or armour record
      // holds but an attachment record does — is history a live path wrote (the store's MOVE TO INVENTORY on a PARTS card).
      // It is NAMED from its attachment record, display only: nothing written or migrated, no number of the part's applied,
      // no fit offered from here (a part in the pack is the shape D-279 declined). Before this line it read "(unknown gear)".
      var looseRec = !gRec && entry && typeof entry === 'object' && entry.id != null && regs.attachments ? regs.attachments[entry.id] : null;
      if (looseRec && looseRec.name) { out.gear.push({ name: looseRec.name, qty: entry.qty || 1, _looseAttachment: true }); return; }
      if (!gRec) { out.gear.push({ name: (entry && entry.name) || '(unknown gear)', qty: (entry && entry.qty) || 1, _unresolved: true }); return; }
      var gDisp = attachmentMarks(overlay(SW.canonicalToStore(gRec, 'gear'), entry, 'gear'), gRec);
      // ruling release-r6-companions-d365 R-R6CD-8 (D-378): a cybernetic implant's OWN lines join its installed attachments'
      // rows, so CharResolve.itemCharacterEffects reads them while it is in use (not stowed)
      var implantFx = IR.implantEffectLines ? IR.implantEffectLines(gRec) : [];
      if (implantFx.length) gDisp._characterEffects = implantFx.concat(Array.isArray(gDisp._characterEffects) ? gDisp._characterEffects : []);
      out.gear.push(gDisp);
    } else if (typeof entry === 'string') {
      out.gear.push({ name: entry, qty: 1 });             // legacy gear string
    } else if (entry && entry.name) {
      out.gear.push(entry);
    } else {
      out.gear.push({ name: '(unknown gear)', qty: 1, _unresolved: true });
    }
  });
  // F-100 M8 C7 (R-M8K-7, R-M8G-16): the owner's talents' item changes, PROJECTED onto the display (never the entry).
  // B-1185 (R-B1185-7): read through the character's STAMP VIEW; the discovery view answers only where there is none (C4.4,
  // as collectPoolMods reads).
  var CR = window.CharResolve;
  var tview = (CR && CR.talentViewFor) ? CR.talentViewFor(character) : null;
  if (CR && CR.ownedItemEffects && IR.applyCharacterEffects) IR.applyCharacterEffects(out, CR.ownedItemEffects(character, tview || window._canonicalCharbuild));
  return out;
}

// ── MERGED AFTER THE MOVE (carry 19708d5c · F-100 M5 C4.1, ruling `f100-m5-talents`) ──────────────────────────────────
// The one member changed on carry after this lap moved it, so it lives outside the VERBATIM region (which
// scripts/check_sheet_pool_verbatim.cjs keeps proving against 766f215c). Carry's change: the owner's talent dice resolve
// through the character's STAMP VIEW, not the device's toggles. That view is `sheetTalentView` (lib/shared/talentView.js),
// which BOTH hosts register at boot as CharResolve's talent-view resolver (`f100-m5-contracts` ADDENDUM 3, A3-2); this
// shared copy asks `CharResolve.talentViewFor`, so the player and the GM get the same view, and a host with no resolver
// registered falls back to the discovery view — carry's own C4.4 fallback — never a bare call to a host-only name.
// ── MERGED AFTER THE MOVE (F-100 M7 C2, ruling `f100-m7-contracts` R-M7K-9/10) ─────────────────────────────────────────
// `sheetPoolOf` changed after the move, so — as `collectPoolMods` did above — it lives outside the VERBATIM region; the
// region's other chunks are still proven against 766f215c. Its one change: the characteristic is THE shared answer,
// CharResolve.skillCharacteristic (best-of, R-M7K-10), never the hand-typed SKILL_CHARS, which is DELETED (its last reader
// went with this lap). The GM's seat pool (`yardCharPool` → here) moves with the sheet through this one function.
// A sheet's skill → { characteristic, base, because, alternatives, reminders, unpicked } (CharResolve.skillCharacteristic,
// over the loaded vocabulary), or null before the vocabulary is here. `sheetKey` may be a sheet key or a canonical id.
function sheetSkillCharacteristic(sheet, sheetKey) {
  var CR = window.CharResolve;
  // B-984's second link (ruling `shipyard-s5-ready` ADDENDUM 3, R-S5R-12): an own-pack save or a variant toggle nulls the
  // DISCOVERY view (the invalidators above) and nothing re-loads it under an open sheet. Only the skills vocabulary is read
  // from `cb` here — no pack section defines skills (R-S5R-6 pins it), and a character's talents reach the answer through
  // its STAMP VIEW (talentView.js, itself built on the base) — so the pristine base answers while the discovery view is gone.
  var cb = window._canonicalCharbuild || window._canonicalCharbuildBase;
  return (CR && CR.skillCharacteristic && cb) ? CR.skillCharacteristic(sheet || {}, sheetKey, cb) : null;
}

// THE ROW'S PREVIEW IS THE POOL THE HUB ROLLS (verify lap; Architect UI on group A): the SAME `buildPool` with the
// SAME auto-applying item dice (`withPoolMods` over `collectPoolMods`) the hub folds in, so a row cannot draw one pool
// while its ROLL rolls another. Difficulty stays off the preview (the hub sets it); the item dice (boost, setback) draw.
// `mods` is the caller's `collectPoolMods(equipment)`; omitted, the preview is the bare characteristic + rank.
// `extra` (SHIP YARD S4, the sheet's VESSELS face): fields folded into the spec before the item dice — the one use is
// a seat's `upgradeAbility` from the ONE resolver (`SWRPGVesselResolve.seatPool`/`skillPool`). Absent, unchanged.
// → null before the vocabulary loads (R-M7G-9); `sheetPoolFor` then draws an empty pool, and `yardCharPool` passes the null on.
// F-100 M10 (ruling f100-m10-shapes-card R-M10S-5/6; build card step 5) — `extra.forceCommitted` (optional): the session's
// committed set (never saved), read through CharResolve's committed-effects readers — a characteristic_delta behind a commit
// (Enhance's Brawn, cap 6) and V5's skill_rank_delta (Farsight's Perception, max 5). Taken off `extra` before the fold, so it never reaches buildPool. Absent (every caller before M10),
// the spec is exactly the one it always was.
// F-100 M12 MV3 (R-M12B-59/-60): an in-use attachment's skill_rank_delta / characteristic_delta raise the
// rank and characteristic this check reads (CharResolve.skillRankInUse / characteristicsInUse), never the saved sheet.
// THE CHECK'S CHARACTERISTICS AND RANK — sheetPoolOf's own two steps, named so every reader of a sheet check takes them from
// HERE (post1-one-number-hub-build S1/S2, ruling release-r7-bug-burndown ADDENDUM 644; B-1836, B-1837): the dice hub's skill
// row (diceHubSkillRow) and its treat roll (critTreatSpec) read this, never a copy. `committed` (optional) = the session's
// committed Force set; null/undefined → none. → { chars, rank }; `chars` a NEW map whenever a step moved it.
function sheetCheckInputs(sheet, sheetKey, committed) {
  var CR = window.CharResolve, chars = sheet.characteristics || {}, rank = sheetSkillRank(sheet.skills, sheetKey);
  if (committed != null) {
    var cbv = (CR && CR.talentViewFor && CR.talentViewFor(sheet)) || window._canonicalCharbuild || window._canonicalCharbuildBase || null;
    if (CR && CR.characteristicsWithCommits) chars = CR.characteristicsWithCommits(sheet, cbv, committed);
    if (CR && CR.skillRankWithCommits) rank = CR.skillRankWithCommits(sheet, cbv, committed, sheetKey, rank);
  }
  // F-100 M12 MV3 (f100-m12-build-card R-M12B-59/-60): an attachment's skill or characteristic bonus "as if" a rank, while
  // its item is in use (CharResolve.itemCharacterEffects) — the DERIVED numbers this check reads, never the sheet's own.
  if (CR && CR.characteristicsInUse) {
    var inUse = resolveSheetEquipment(sheet.equipment, sheet);
    var cbu = (CR.talentViewFor && CR.talentViewFor(sheet)) || window._canonicalCharbuild || window._canonicalCharbuildBase || null;
    chars = CR.characteristicsInUse(chars, inUse);
    rank = CR.skillRankInUse(inUse, cbu, sheetKey, rank);
  }
  return { chars: chars, rank: rank };
}

function sheetPoolOf(sheet, sheetKey, mods, extra) {
  var Dice = window.SWRPGDice; if (!Dice || !Dice.buildPool) return null;
  var sc = sheetSkillCharacteristic(sheet, sheetKey), prop = (sc && sc.characteristic) || '';
  if (!sc) return null;   // R-M7G-9: no pool until the vocabulary answers — never one drawn from a characteristic of 0
  var committed = extra && extra.forceCommitted;
  if (committed != null) { extra = Object.assign({}, extra); delete extra.forceCommitted; }
  var io = sheetCheckInputs(sheet, sheetKey, committed), chars = io.chars, rank = io.rank;
  var spec = Object.assign({ characteristic: Number(chars[prop]) || 0, skillRank: rank, difficulty: 0 }, extra || {});
  var pl = Dice.buildPool(mods && mods.length ? withPoolMods(spec, mods, sheetKey, prop) : spec);   // B-1065: the best-of re-matches
  return { proficiency: pl.proficiency || 0, ability: pl.ability || 0, boost: pl.boost || 0, setback: pl.setback || 0 };
}

// ── MERGED AFTER THE MOVE (F-100 M8 step 1, ruling `f100-m8-contracts` R-M8K-2 (iii); B-1065) ────────────────────────────
// `withPoolMods` changed after the move, so — as `collectPoolMods` and `sheetPoolOf` did — it lives outside the VERBATIM
// region (scripts/check_sheet_pool_verbatim.cjs still proves the rest against 766f215c). Its one change: the check's
// CHARACTERISTIC is passed through to `contextFor`, so an item entry anchored to a characteristic matches the
// characteristic the check ROLLS — the best-of (`sheetPoolOf`) or the hub's one-roll switch — not the vocabulary's base.
/**
 * Fold the AUTO-APPLYING item dice for this check into a buildPool spec, and return a NEW spec.
 * `skillKeyOrId` may be a sheet key (RANGHVY) or a canonical id (ranged_heavy) — the vocabulary
 * carries both, which is why no hand-typed translation table exists here. `characteristic` (optional) is the one
 * the check rolls; absent, the vocabulary's base. `roll` (optional, F-100 M8 C2, B-1061/B-1062) names the pool
 * builder's kind (`craft`, `force_power`) so a row anchored to that roll applies there and nowhere else; absent, a
 * `roll` anchor matches nothing.
 */
// F-100 M10 (R-M10S-3, V4): `powerId` (optional) — the Force power whose check a `force_power` roll is; passed to contextFor,
// so a row anchored to that one power reaches it (DARK in SWRPGPoolMods.matches). Absent, unchanged.
function withPoolMods(spec, mods, skillKeyOrId, characteristic, roll, powerId) {
  var P = window.SWRPGPoolMods, idx = poolModSkillIndex();
  if (!P || !idx || !mods || !mods.length) return spec;
  var ctx = P.contextFor(skillKeyOrId, idx, characteristic, roll, powerId);
  if (!ctx) return spec;
  return P.augment(spec, mods, ctx);
}

/** Every carried item's pool_mods + (F-100 R-F100-6) every owned talent's — the owner rides in on `_owner`, set by resolveSheetEquipment; ranks from CharResolve.ownedRankCounts. */
// F-100 M10 (R-M10B-6c): `session` (optional) = { committed } — the hub's session state, never saved — handed to
// ownedTalentPoolSources, so a `count_of force_rating` row reads the dice left (CharResolve.forceDiceAvailable) — DARK.
function collectPoolMods(resolvedEquipment, session) {
  // F-100 M5 C4.1: the owner's talent dice resolve through ITS STAMP VIEW (sheetTalentView), not the device's toggles;
  // the discovery view answers only in C4.4's fallback (a stamped pack not on this device), as it did before.
  var P = window.SWRPGPoolMods, who = resolvedEquipment && resolvedEquipment._owner;
  var CR = window.CharResolve, view = (who && CR && CR.talentViewFor) ? CR.talentViewFor(who) : null;
  var cb = view || window._canonicalCharbuild;
  return (P && resolvedEquipment) ? P.collect(resolvedEquipment, (who && cb && cb.talents) ? CharResolve.ownedTalentPoolSources(who, cb, session) : []) : [];
}

// ── MERGED AFTER THE MOVE (S5 · B-984, ruling `shipyard-s5-ready` P1, ADDENDUM 3 R-S5R-13, ADDENDUM 4) ──────────────────
// `poolModSkillIndex` and `yardCharPool` changed after the move, so — as `collectPoolMods` and `sheetPoolOf` did — they
// live outside the VERBATIM region, each with the comment it was moved with (one chunk each); the region's other chunks are
// still proven against 766f215c. The change in both: the skills vocabulary is read from the pristine base when the
// discovery view has been nulled by a pack change or a variant toggle (B-984). The premise — no pack section defines
// skills — is pinned (R-S5R-6). `yardCharPool` also takes the seat card's optional `taken` (ADDENDUM 4, R-M8C8-7).
// ══ THE POOL-MODS CONSUMER SEAM (R-PCA-2) ════════════════════════════════════════════════════
// Every surface that ROLLS or RENDERS a check asks `window.SWRPGPoolMods` — the one assembler —
// through these four helpers, and through nothing else. They exist so the two joins each happen in
// exactly ONE place: sheet key -> canonical id/group/characteristic (the vocabulary index), and
// resolved equipment -> flattened mods (`collect`). A second copy of either is the bolt-on
// `pool-mods-certify-then-apply-card` R-PCA-2 forecloses by name.
//
// EVERY HELPER IS TOTAL OVER A MISSING MODULE. `poolMods.js` is a `defer` script and the registries
// arrive over the wire, so a sheet can render before either exists. Each helper then returns the
// caller's own spec unchanged, or an empty list — the pre-lap behaviour exactly, never a throw and
// never a partially-applied pool.
function poolModSkillIndex() {
  var P = window.SWRPGPoolMods;
  // B-984 (ruling shipyard-s5-ready): a pack change nulls the DISCOVERY view (`swrpg-user-packs-changed` →
  // SWRPGItemRegistries.invalidate), and nothing re-loads it while a sheet stays open. No pack section defines
  // skills (SWRPGMods.SECTIONS: weapons · armor · gear · species · careers · specializations · talents · force_powers),
  // so the PRISTINE base's vocabulary is the same vocabulary, and the index survives the invalidation.
  var entries = (window._canonicalRegistries || {}).skills || (window._canonicalRegistriesBase || {}).skills || null;
  if (!P || !entries || !entries.length) return null;
  // Keyed on the ARRAY IDENTITY, not a boolean: `loadCanonicalRegistries` replaces the object on a
  // re-load, and a "built once" flag would then serve an index built from the previous vocabulary.
  // The memo hangs on the FUNCTION rather than on module-level vars so that `band_arithmetic.cjs`
  // can slice this declaration out by name and run the shipped code — its whole discipline is
  // "never retype the function it is checking", and free variables are what break that.
  if (poolModSkillIndex._src !== entries) {
    poolModSkillIndex._src = entries;
    poolModSkillIndex._idx = P.indexSkills(entries);
  }
  return poolModSkillIndex._idx;
}

// SHIP YARD S4 · ONE PATH FOR A CHARACTER'S SEAT POOL (PRAXIS §5): the player host hands the Yard's hangar this
// function, so a PC's pool on the floor (H1/H3/U1) is the sheet's own — the saved sheet, its resolved equipment's
// and owned talents' dice (`collectPoolMods`), the hub's `buildPool` — plus the ship's upgrade from the resolver.
// → the pool object ({proficiency, ability, boost, setback}) or null before the vocabulary is here.
// `taken` (optional; F-100 M8's open seat card, ruling `f100-m8-c8-signature-vehicle` R-M8C8-7): the card's ticked offers,
// folded by the hub's own `SWRPGPoolMods.takeOffers`; absent — or before poolMods.js carries it — the mods are unchanged.
// THE SURFACING MISSION (card `f100-surfacing-yard-concept` R-SYC-5; ADDENDUM 2 Q2/Q3 (a); ADDENDUM 8 Q1 (a), Q3 (a), R3): a ship's
// `out.seat_talents` (vesselResolve — a fitted part's option granting whoever uses the system a talent) read as the SITTER's own
// talents for this roll. Each grant is a source in the owned-talent shape, its record through the sitter's view (the stamp view,
// else the discovery view), named "<talent> (<part>)", one rank, so its offer key stays `t:<talentId>:<row id>`. Q3 (a), RAW
// SILENT: a grant of a talent the sitter already OWNS adds nothing (their own row stands, one tick); two parts granting one
// talent are one grant. The talent's own anchors choose the seat (`matches`, at the fold). → [{id, name, ranked, ranks,
// pool_mods, told, grant}] in `grants` order; [] for none.
function seatGrantSources(sheet, grants) {
  if (!sheet || !Array.isArray(grants) || !grants.length) return [];
  var CR = window.CharResolve, view = (CR && CR.talentViewFor ? CR.talentViewFor(sheet) : null) || window._canonicalCharbuild || window._canonicalCharbuildBase;
  var tal = view && view.talents, skip = {}, out = [];
  if (!tal) return [];
  (CR && CR.ownedTalentIdsOfSheet ? CR.ownedTalentIdsOfSheet(sheet) : []).forEach(function (id) { skip[id] = true; });
  grants.forEach(function (g) {
    var tid = g && g.talentId, rec = tid && Object.prototype.hasOwnProperty.call(tal, tid) ? tal[tid] : null;
    if (!rec || skip[tid]) return;
    skip[tid] = true;
    out.push({ id: tid, name: (rec.name || tid) + ' (' + (g.part || '') + ')', ranked: !!rec.ranked, ranks: 1,
      pool_mods: Array.isArray(rec.pool_mods) ? rec.pool_mods : [], told: Array.isArray(rec.told) ? rec.told : [], grant: g });
  });
  return out;
}
// the grants' dice rows, through the one assembler's owned-talent arm (SWRPGPoolMods.collect) → poolMods entries; [] for none
function seatGrantMods(sheet, grants) {
  var P = window.SWRPGPoolMods, src = seatGrantSources(sheet, grants).filter(function (t) { return t.pool_mods.length; });
  return P && P.collect && src.length ? P.collect(null, src) : [];
}

// `grants` (optional, THE SURFACING MISSION R-SYC-5): the ship's `out.seat_talents` — the sitter's for this roll (seatGrantMods).
function yardCharPool(charRec, skillId, upgradeAbility, taken, grants) {
  var cb = window._canonicalCharbuild || window._canonicalCharbuildBase, sheet = charRec && charRec.sheetData;   // R-S5R-13
  var key = cb && cb.skillSheetKeys && cb.skillSheetKeys[skillId];
  if (!sheet || !key) return null;
  var P = window.SWRPGPoolMods, mods = collectPoolMods(resolveSheetEquipment(sheet.equipment, sheet)).concat(seatGrantMods(sheet, grants));
  if (taken && P && typeof P.takeOffers === 'function') mods = P.takeOffers(mods, taken);
  return sheetPoolOf(sheet, key, mods, { upgradeAbility: upgradeAbility || 0 });
}

// F-100 M8 step 3 (ruling f100-m8-c8-signature-vehicle R-M8C8-5; f100-m8-build-card R-M8B-16): a Ship Yard seat's
// LINES — what the pool path applied (augment's change records) and what it offers (the reminders) — for the check
// `yardCharPool` prices, through the SAME collect → contextFor → augment. The seat card draws them; the numbers stay
// `yardCharPool`'s. → { changes, reminders }, or null where `yardCharPool` would be null.
// `taken` (R-M8C8-7, optional) = the open seat card's ticks, { <offerKey>: true }: the changes fold them through the SAME
// `takeOffers` → `augment` as the hub, so the lines say what the dice show; the reminders stay the UNTAKEN list, so a
// ticked offer keeps its row (and its tick) to be unticked.
// The skill key falls back to the pristine base as `yardCharPool`'s does (`shipyard-s5-ready` ADDENDUM 3 R-S5R-13, merged
// into this lap by `f100-m8-build` R-M8G-75), so "null where `yardCharPool` would be null" (R-M8C8-5) stays true after a
// pack change or a variant toggle nulls the discovery view.
// `grants` (optional, THE SURFACING MISSION R-SYC-5; ADDENDUM 8 Q1 (a)): the ship's `out.seat_talents`, folded as `yardCharPool`
// folds them; `told` = the grants whose talent TELLS a rule at THIS check (a `told` row at a check, anchored, matching —
// `diceHubToldFor`'s rule; an unanchored row is told on the talent, not at a check, Q4 (a)), one line per grant, in the part's
// own words (`grant.words`, the caller's — R-SYC-6) and the hub's look with no limit tag (the approved record's Y5). → { changes,
// reminders, told }.
function yardSeatLines(charRec, skillId, upgradeAbility, taken, grants) {
  var cb = window._canonicalCharbuild || window._canonicalCharbuildBase, sheet = charRec && charRec.sheetData, P = window.SWRPGPoolMods, idx = poolModSkillIndex();
  var key = cb && cb.skillSheetKeys && cb.skillSheetKeys[skillId];
  if (!sheet || !key || !P || !idx) return null;
  var sc = sheetSkillCharacteristic(sheet, key), prop = (sc && sc.characteristic) || '';
  if (!sc) return null;
  var ctx = P.contextFor(key, idx, prop), told = [];
  seatGrantSources(sheet, grants).forEach(function (t) {
    var at = ctx && t.told.filter(function (row) {
      return row && (row.moment || 'check') === 'check' && Array.isArray(row.applies_to) && row.applies_to.length && P.matches({ appliesTo: row.applies_to }, ctx);
    })[0];
    if (at) told.push({ key: t.id + ':' + at.id, name: t.name, words: (t.grant && t.grant.words) || '', line: t.grant && t.grant.line != null ? t.grant.line : undefined, talentId: t.id });   // line: S2
  });
  var mods = collectPoolMods(resolveSheetEquipment(sheet.equipment, sheet)).concat(seatGrantMods(sheet, grants));
  if (!mods.length) return { changes: [], reminders: [], told: told };
  var spec = withPoolMods({ characteristic: Number((sheet.characteristics || {})[prop]) || 0, skillRank: sheetSkillRank(sheet.skills, key), difficulty: 0,
    upgradeAbility: upgradeAbility || 0 }, taken ? P.takeOffers(mods, taken) : mods, key, prop);
  return { changes: (spec && spec._poolModChanges) || [], reminders: ctx ? P.reminders(mods, ctx) : [], told: told };
}

// F-100 M8 C11 (R-M8K-16): the owner's talents carrying ROLL NUMBERS, through the SAME view `collectPoolMods` reads
// (the stamp view, else the discovery view), so a roll number and a die row agree on what the owner owns.
function collectRollNumbers(sheet) {
  var CR = window.CharResolve, view = (sheet && CR && CR.talentViewFor) ? CR.talentViewFor(sheet) : null;
  var cb = view || window._canonicalCharbuild;
  return (sheet && cb && cb.talents && CR && CR.ownedTalentRollSources) ? CR.ownedTalentRollSources(sheet, cb) : [];
}

// ── MERGED AFTER THE MOVE (F-100 surfacing, the sheet family: ruling `f100-surfacing-sheet-concept` R-SSC-4, ADDENDUM 10 C3 (a)) ──
// THE ONE WEAPON DICE-POOL BUILDER. Moved from player/app.jsx's `computeWeaponPool` (whose header stays there as the hub
// row's one-line caller) so the sheet's WEAPONS card and the dice hub's row read ONE function: the weapon's own pool at a
// band — characteristic best-of, rank, Table 6-1/6-4 band price and legality, encumbrance setbacks, the roll numbers and
// crit lines, the weapon's quality rows and modes, the quality damage, the owner's item/talent dice, `taken`. The Ship
// Yard's gun rows and the GM bench's NPC rows ride their own cards (C3 (a)). test/f100_sheet_weapon_pool.cjs proves no
// other file builds a weapon pool.
// opts = { skillKey, band, equipment, taken, difficultySet, accent, forceCommitted }: `skillKey` the sheet key the caller resolved
// (resolveWeaponSkillKey, app.jsx) — absent → null; `band` the target band (absent → the printed range); `equipment` the
// resolved equipment; `taken` the row's ticks; `difficultySet` the hub's DIFFICULTY chip. → computeWeaponPool's spec
// exactly, or null where it was null.
// RAW: Table 6-1 target-range→difficulty, +1 Ranged-Heavy/Gunnery into Engaged, encumbrance setbacks. Pure over its inputs.
// THE ONE WEAPON DAMAGE (post1-one-number-hub-build C3, ruling release-r7-bug-burndown ADDENDUM 644 S3; D-521 bind 1) — what
// the sheet's WEAPONS card and the dice hub's row BOTH print: the weapon's damage with Brawn added by ItemResolve.weaponDamage
// (the ONE place, R-ISM-3; read at call time), then each GRANTED quality's change (QualityRows.damageRows, carried as
// `qualityDamage`: Superior +1 / Inferior −1, only when an attachment granted it — a printed profile already holds its own).
// → { total, base, parts: [{ text }], changes: [text] } — `parts` the Brawn and the weapon's add ("Brawn 2", "Staff of Office
// +2"; none for a flat weapon), `changes` each quality's line in the hub's words ("Damage 4 → 5 — Superior") — or null when
// the weapon prints no damage. A resolve-at-render projection: never saved (R-Y2-1).
function sheetWeaponDamage(sheet, weapon, qualityRows) {
  var IR = window.ItemResolve, raw = weapon && weapon.damage;
  if (!IR || !IR.weaponDamage || raw == null || raw === '') return null;
  var dt = IR.damageTextValue(raw);
  if (dt.value == null) return null;
  var r = IR.weaponDamage({ damage: { value: dt.value, base: dt.base } }, sheet);
  var parts = dt.base === 'brawn' ? [{ text: 'Brawn ' + (r.total - dt.value) }, { text: (weapon.name || '') + ' ' + IR.brawnDamageText(dt.value) }] : [];
  var now = r.total, changes = [];
  (qualityRows || []).forEach(function (f) {
    if (!f || !f.amount) return;
    changes.push('Damage ' + now + ' → ' + (now + f.amount) + ' — ' + f.source);
    now += f.amount;
  });
  return { total: now, base: r.total, parts: parts, changes: changes };
}

function weaponPoolOf(sheet, weapon, opts) {
  opts = opts || {};
  var critNum = Number(weapon.crit);   // the printed threshold, both arms (B-1195: a 0 prints "—", so it is never a threshold)
  // ── THE VEHICLE ARM (THE SURFACING MISSION, card `f100-surfacing-yard-concept` R-SYC-2; ADDENDUM 2 Q1 (a), Q4 (a)(b)(c), Q5;
  // ADDENDUM 8 Q1 (a), R1): a SHIP's gun rolled by its gunner — `weapon` is the resolver's row (`vesselResolve.resolve`'s
  // `weapons[i]`, the flat shape), `opts.vehicle = { upgradeAbility, because, index, weapons, grants }` the seat's upgrade
  // and its credits (`vesselResolve.seatPool(…, 'gunner')`), the row's index, the vehicle-weapons registry by id, and the ship's
  // `out.seat_talents` (folded as the gunner's own talents, seatGrantMods; `spec.grantMods` names them). The TO HIT is
  // the SHIP's (EotE p.235), so no band, no difficulty, no bar, no encumbrance; no roll numbers or quality damage (no
  // `regId`). The weapon's qualities are joined to the vocabulary ONCE here by `qualityKeyIs`; a quality the registry stores
  // UNRATED (`count: null`, its corrections row) is passed `rank: null` — the ONE rule `weapons` serves (R1; the resolver's
  // row carries the library's 1, B-1377); absent, the row's own count. A HELD rating (`heldOut` with the holder's rows blind)
  // → `held: true` and no dice, as a held damage prints "—". `opts.taken` = the row's ticks, as the personal arm's.
  // → the spec the hub reads, or null before the skills or qualities vocabulary is here.
  // ── THE NPC ARM (ENCOUNTERS, D-507 bind 1; ruling `encounters-e3-screens` ADDENDUM 15 CONTRACT 5, ADDENDUM 16 R-E3S-R2 on
  // R-SHC-12): an NPC's weapon rolled by the NPC — `weapon` is the library's weapon record (inline, or the weapons.json
  // record a minion names: `skill` a vocabulary id, `qualities` [{ id, rank }]), `sheet` is null (an NPC has no sheet), and
  // `opts.npc = { characteristic, rank, brawn }` what the CALLER read off the record: the value of the skill's characteristic,
  // the skill's rank, the Brawn. A minion line's rank is BenchStore.minionGroupRanks(standing) for a LISTED group skill and 0
  // otherwise (RAW EotE Core p.390), handed in so this file takes no BenchStore dependency. THE THREE CONDITIONS (R-E3S-R2):
  // (i) the weapon's qualities through Q.poolRows ONLY — Accurate, Inaccurate, Cumbersome against the Brawn handed in — no
  // talent, gear, attachment or mode offer; (ii) the owner's offer set is EMPTY (no owner is built); (iii) the fold is
  // withPoolMods, so its `_poolModChanges` read through SWRPGUI.appliedLineText, the one line the hub and the bench draw.
  // No roll numbers (damage, crit lines). `opts.difficultySet` the window's DIFFICULTY chip, else Average (2), before the fold.
  // → the spec, or null before the skills or qualities vocabulary is here.
  var N = opts.npc;
  if (N) {
    var nSkill = weapon && weapon.skill ? String(weapon.skill) : '', nP = window.SWRPGPoolMods, nQ = window.SWRPGQualityRows, nIdx = poolModSkillIndex();
    var nQs = (weapon && Array.isArray(weapon.qualities) ? weapon.qualities : []).filter(function (q) { return q && q.id; });
    if (!nIdx || (nQs.length && !window._qualitiesDb)) return null;
    var nCtx = nP && nSkill ? nP.contextFor(nSkill, nIdx) : null;
    var nDiff = opts.difficultySet != null && isFinite(Number(opts.difficultySet)) ? Number(opts.difficultySet) : 2;
    var nSpec = { characteristic: Number(N.characteristic) || 0, skillRank: Number(N.rank) || 0, difficulty: nDiff, setback: 0, boost: 0,
      upgradeAbility: 0, critThreshold: isFinite(critNum) && critNum > 0 ? critNum : null, rangeDifficulty: null, encumbranceSetback: 0,
      difficultySet: opts.difficultySet != null && isFinite(Number(opts.difficultySet)) ? nDiff : null, barred: false, rangeCap: null,
      skillKey: nCtx ? nCtx.skillId : nSkill, qualityMods: [], modes: [], npc: true };
    if (nQ && nQ.poolRows && nCtx) nSpec.qualityMods = nQ.poolRows({ _qualitiesRaw: nQs.map(function (q) { return { id: q.id, rank: q.rank }; }) },
      { vocab: window._qualitiesDb, characteristics: { brawn: Number(N.brawn) || 0 }, anchor: { scope: 'skill', value: nCtx.skillId }, ownedTalentIds: [] });
    return withPoolMods(nSpec, nSpec.qualityMods, nSkill);
  }
  var V = opts.vehicle;
  if (V) {
    var vs = weapon && weapon.skill ? String(weapon.skill) : 'GUNN', vKey = OGG_TO_SHEET_SKILL[vs] || vs;
    var vsc = sheetSkillCharacteristic(sheet, vKey), vqs = (weapon && weapon.qualities_resolved) || [], vdb = window._qualitiesDb;
    if (!vsc || (vqs.length && !vdb)) return null;
    var vChar = vsc.characteristic || '', VR = window.SWRPGVesselResolve, vP = window.SWRPGPoolMods, vQ = window.SWRPGQualityRows, vIdx = poolModSkillIndex();
    var vVocab = vdb ? (Array.isArray(vdb) ? vdb : Object.keys(vdb).map(function (k) { return vdb[k]; })) : [];
    var vReg = V.weapons && weapon.key ? V.weapons[weapon.key] : null;
    var vRegQ = vReg && vReg.profile && Array.isArray(vReg.profile.qualities) ? vReg.profile.qualities : null;
    var joined = [], missed = [], vHeld = false;
    vqs.forEach(function (q) {
      var e = VR && VR.qualityKeyIs ? vVocab.filter(function (x) { return x && x.id && VR.qualityKeyIs(q.key, x.id); })[0] : null;
      if (!e) { missed.push(q.key); return; }
      if (q.held) vHeld = true;
      var rq = vRegQ ? vRegQ.filter(function (x) { return x && VR.qualityKeyIs(x.key, e.id); })[0] : null;
      joined.push({ id: e.id, rank: rq && rq.count == null ? null : q.count });
    });
    // B-1465 (release-r7-force-engine): a committed Control's characteristic_delta (Enhance's Agility, FaD p.289) reaches the
    // gunner's pool through CharResolve's ONE reader, as every other pool on the sheet does. Absent, the saved map.
    var vCR = window.CharResolve, vChars = sheet.characteristics || {};
    if (opts.forceCommitted != null && vCR && vCR.characteristicsWithCommits)
      vChars = vCR.characteristicsWithCommits(sheet, (vCR.talentViewFor && vCR.talentViewFor(sheet)) || window._canonicalCharbuild || window._canonicalCharbuildBase || null, opts.forceCommitted);
    var vSpec = { characteristic: Number(vChars[vChar]) || 0,
      skillRank: sheetSkillRank(sheet.skills, vKey), difficulty: 0, setback: 0, boost: 0, upgradeAbility: Number(V.upgradeAbility) || 0,
      critThreshold: isFinite(critNum) && critNum > 0 ? critNum : null, rangeDifficulty: null, encumbranceSetback: 0, barred: false,
      skillKey: vKey, qualityMods: [], modes: [], grantMods: [], qualityMissed: missed, held: vHeld, because: V.because || [], index: V.index };
    if (vHeld) return vSpec;
    var vw = Object.assign({}, weapon, { _qualitiesRaw: joined });
    var vctx = vP && vIdx ? vP.contextFor(vKey, vIdx, vChar || undefined) : null, vAnchor = vctx ? { scope: 'skill', value: vctx.skillId } : null;
    if (vQ && vQ.poolRows && vAnchor) vSpec.qualityMods = vQ.poolRows(vw, { vocab: vdb, characteristics: vChars, anchor: vAnchor,
      ownedTalentIds: window.CharResolve && window.CharResolve.ownedTalentIdsOfSheet ? window.CharResolve.ownedTalentIdsOfSheet(sheet) : [] });
    if (vQ && vQ.modeOffers && vAnchor) vSpec.modes = vQ.modeOffers(vw, { vocab: vdb, anchor: vAnchor });
    var vModeRows = [];
    vSpec.modes.forEach(function (m) { vModeRows = vModeRows.concat(m.poolRows || []); });
    vSpec.grantMods = seatGrantMods(sheet, V.grants);
    var vMods = vSpec.qualityMods.concat(vModeRows, collectPoolMods(resolveSheetEquipment(sheet.equipment, sheet)), vSpec.grantMods);
    if (opts.taken && vP && vP.takeOffers) vMods = vP.takeOffers(vMods, opts.taken);
    return withPoolMods(vSpec, vMods, vKey, vChar || undefined);
  }
  // the skill the CALLER resolved with the app's one resolver (resolveWeaponSkillKey stays in app.jsx with SKILL_NAMES); absent
  // → no pool, never a guess. '' (a weapon whose skill no resolver knows) rolls as it always did: no characteristic, no rank.
  if (opts.skillKey == null) return null;
  var CR = window.CharResolve, targetBand = opts.band, resolvedEquipment = opts.equipment, taken = opts.taken, accent = opts.accent;
  var chars = sheet.characteristics || {};
  // THE FORCE SWITCH (ruling `f100-surfacing-force-flip-card` ADDENDUM 12 F2 (i) (a)): `opts.forceCommitted` = the session's
  // committed set (never saved). A committed Control's characteristic_delta (Enhance's Brawn/Agility, FaD p.289 "increases
  // his Brawn characteristic") raises the characteristic THIS pool and its quality rows read, through CharResolve's ONE
  // reader — the stage's row and the weapon row under it agree. Absent, the sheet's own map, exactly as before.
  // The encumbrance and the derived numbers stay on the saved characteristics (F2 (ii): a board row).
  if (opts.forceCommitted != null && CR && CR.characteristicsWithCommits) {
    chars = CR.characteristicsWithCommits(sheet, (CR.talentViewFor && CR.talentViewFor(sheet)) || window._canonicalCharbuild || window._canonicalCharbuildBase || null, opts.forceCommitted);
  }
  var skKey = String(opts.skillKey);
  var _sc = skKey ? sheetSkillCharacteristic(sheet, skKey) : null;   // F-100 M7 C2 (R-M7K-9/10): the one answer, best-of
  if (skKey && !_sc) return null;   // R-M7G-9: before the vocabulary loads there is no pool — never one drawn from a characteristic of 0
  // B-219 (R-B219C-6): the same rule for the QUALITIES vocabulary — a weapon carrying qualities has no pool until it is here,
  // never one drawn without its Accurate (the hub re-renders when `qualitiesDb` lands, as it does for the skills vocabulary).
  if (Array.isArray(weapon._qualitiesRaw) && weapon._qualitiesRaw.length && !window._qualitiesDb) return null;
  var charLong = (_sc && _sc.characteristic) || '';
  var skCharKey = (charLong && CR.CHAR_ABBR[charLong]) || '';
  var charValue = charLong && chars[charLong] != null ? Number(chars[charLong]) : 0;
  var rank = 0, skillsObj = sheet.skills || {};
  // R-B658 read tolerance — the same flatten rule `sheetSkillRank` reads through (see its comment):
  // a pre-fix object entry for this weapon's skill is a rank, not a zero.
  if (skKey && skillsObj[skKey] != null) rank = skillEntryRank(skillsObj[skKey]);
  else if (skKey) { var skU = skKey.toUpperCase(); Object.keys(skillsObj).forEach(function (k) { if ((k || '').toUpperCase() === skU) rank = skillEntryRank(skillsObj[k]); }); }
  // ── Band arithmetic + legality (B-207, all four ways) ────────────────────────────────────────
  // Rulings `dice-hub-mockup` ADDENDUM 3 ANSWER (arithmetic) + `b207-band-legality` R-BBL-1..5.
  // Guarded by test/band_arithmetic.cjs, which executes THIS function rather than restating it.
  //
  //   BASE. Table 6-1 prints a separate Engaged row — "Easy (1) plus modifiers depending on weapon
  //   used" (AoR Core p.218; EotE Beginner Game p.55; EotE's own row is OCR-garbled in the corpus
  //   and the two clean copies agree). This base was 2 here since the cockpit shipped: `ede906db`
  //   fixed Table 6-4's MODIFIERS and nobody pulled the base, so point-blank ranged fire cost one
  //   difficulty too many. Three shipped weapons are affected on live sheets today —
  //   a95_stingbeam, rivet_gun, wrist_blaster, all printed-Engaged Ranged (Light).
  //
  //   SCOPE (R-BBL-2, CONTRACT). Table 6-4 names exactly two skills, so the Easy(1) base is theirs
  //   alone. Every other skill keeps Average (2) — without this, Lightsaber (22 weapons) and the
  //   five `mechanics` placed charges would be silently re-priced to 1 by the base change.
  //
  //   LEGALITY (R-BBL-1). A weapon's PRINTED range is its maximum (range-entry definition, EotE
  //   printed ~p.158; corroborated by the stun-setting range cap ~p.157): closer is always legal,
  //   beyond it is BARRED. Legality is a property of the WEAPON, never of the skill — the first
  //   draft of this rule barred melee beyond Engaged and would have broken the seven shipped whips
  //   and shock prods whose printed reach is Short precisely because reach is what they are.
  //
  //   MELEE (R-BBL-1). "Melee attack difficulties are always Average (2)" (EotE printed ~p.204) —
  //   band-INVARIANT, so melee-class needs no bar, gets no band control, and its legality edge
  //   cases carry no encoding consequence.
  //
  //   THE SEAM (C-BBA-1). The canonical registries store band tokens LOWERCASE ('engaged',
  //   'medium', 'long'), `weaponForDisplay` passes `range` through untouched
  //   (lib/shared/itemResolve.js), and all three call sites consume that resolve — while every
  //   fixture in this programme fed capitalized strings. So the table below matched NOTHING on the
  //   live path and every ranged weapon collapsed to the `diff == null` default of 2, regardless of
  //   range: 95 short-range weapons charged a die too many, 69 long/extreme charged one to two too
  //   few, and medium's 98 right only by coincidence with the default. Old code, this lap's
  //   arithmetic, and this lap's bar were ALL dead the same way. Both band inputs are canonicalized
  //   HERE, once, before anything consults them — one map, no consumer-side patches, no second
  //   path. (The neighbouring shipped code already tests `/^engaged$/i` case-insensitively, which
  //   is this same knowledge discovered one call site at a time.)
  var RANGE_ORDER = ['Engaged', 'Short', 'Medium', 'Long', 'Extreme'];
  var BAND_CANON = { engaged: 'Engaged', short: 'Short', medium: 'Medium', long: 'Long', extreme: 'Extreme' };
  function canonBand(v) { return BAND_CANON[String(v == null ? '' : v).trim().toLowerCase()] || ''; }
  var RANGE_DIFFICULTY = { Engaged: 1, Short: 1, Medium: 2, Long: 3, Extreme: 4 };
  var ENGAGED_WEAPON_MOD = { RANGLT: 1, RANGHVY: 2 };   // Table 6-4's two named skills
  var MELEE_CLASS = { MELEE: 1, BRAWL: 1, LTSAB: 1 };
  var printedBand = canonBand(weapon.range);
  // R7 B-1454: a TICKED mode's range cap is the weapon's maximum for this roll — Stun setting: "their range changes to short
  // and cannot be increased" (EotE p.157; FaD p.164 the same words). The mode's own data (`range_max`, qualityRows.modeOffers)
  // through the same tick key the fold takes (`taken[<mode key>]`); unticked, or no such mode, nothing changes. A band past
  // the cap is then BARRED by the legality below ("Beyond the weapon's range."); no band chosen rolls at the cap.
  var rangeCap = '';
  var Qc = window.SWRPGQualityRows, Pc = window.SWRPGPoolMods, idxc = taken ? poolModSkillIndex() : null;
  var cctx = (taken && Qc && Qc.modeOffers && Pc && idxc && skKey) ? Pc.contextFor(skKey, idxc, charLong || undefined) : null;
  (cctx ? Qc.modeOffers(weapon, { vocab: window._qualitiesDb, anchor: { scope: 'skill', value: cctx.skillId } }) : []).forEach(function (m) {
    var c = canonBand(m.rangeMax);
    if (c && taken[m.key] && RANGE_ORDER.indexOf(c) < RANGE_ORDER.indexOf(rangeCap || printedBand)) rangeCap = c;
  });
  if (rangeCap) printedBand = rangeCap;
  var band = canonBand(targetBand) || printedBand;
  var skU = skKey ? skKey.toUpperCase() : '';
  // A BARRED result must never present a number: buildPool reads `spec.difficulty || 0`, so a
  // number here would read as an EASIER roll rather than an impossible one. Consumers check
  // `barred` before offering a roll.
  var barred = false, barredReason = null, diff = null;
  if (MELEE_CLASS[skU]) {
    diff = 2;
  } else if (band === 'Engaged' && skU === 'GUNN') {
    barred = true; barredReason = 'Gunnery weapons cannot fire at a target at Engaged range.';
  } else {
    var pIdx = RANGE_ORDER.indexOf(printedBand), bIdx = RANGE_ORDER.indexOf(band);
    if (pIdx >= 0 && bIdx > pIdx) {
      barred = true; barredReason = "Beyond the weapon's range.";
    } else if (band === 'Engaged') {
      diff = ENGAGED_WEAPON_MOD[skU] ? RANGE_DIFFICULTY.Engaged + ENGAGED_WEAPON_MOD[skU] : 2;
    } else {
      diff = RANGE_DIFFICULTY[band]; if (diff == null) diff = 2;
    }
  }
  // the surfacing hub's DIFFICULTY chip (R-SHC-10; D-229 Q3 (a); ADDENDUM 7 Q6 (a)): `opts.difficultySet` — the difficulty
  // the player set for ONE roll — replaces the range's price BEFORE the fold, so a removal (Master Doctor) lands on the number
  // rolled. Absent, nothing changes. `rangeDifficulty` keeps the range's own price.
  var diffSet = opts.difficultySet, rangeDiff = diff;
  if (!barred && diffSet != null && isFinite(Number(diffSet))) diff = Number(diffSet);
  var setback = 0;
  var enc = CR.computeEncumbrance(resolvedEquipment, sheet.characteristics || {}, CR.speciesEncumbranceDelta(sheet));
  setback += enc.setbacks;
  var spec = { characteristic: charValue, skillRank: rank, difficulty: diff, setback: setback, boost: 0,
    // B-224: NO force term. An attack pool is characteristic/skill vs difficulty plus
    // boost/setback (FaD Core p.30-31); Force dice enter a check through a FORCE POWER check or
    // explicit talent/upgrade text (FaD Core p.282), never as a standing bonus on every swing.
    // This read the character's full Force Rating unconditionally, so a Force user rolled it into
    // every blaster shot on the cockpit and on LOADOUT. Behaviour change, oracle-cited and
    // approved by Jason (ruling `dice-hub-mockup` §5). The Force-power spines keep their dice —
    // they build their own pool with `force: available` and never came through here.
    upgradeAbility: 0, accent: accent,
    critThreshold: isFinite(critNum) && critNum > 0 ? critNum : null,
    // B-219: the RANGE's own difficulty and the encumbrance's own setbacks, kept before the fold — `difficulty` and
    // `setback` then carry Cumbersome, Unwieldy and Inaccurate too, and the hub's range and encumbrance lines must print
    // what the range and the load cost, never a quality's dice (each quality has its own applied line).
    rangeDifficulty: rangeDiff, encumbranceSetback: setback,
    difficultySet: (!barred && diffSet != null && isFinite(Number(diffSet))) ? diff : null,   // the hub's DIFFICULTY chip, moved
    // R-BBL-1 / R-DRB-5: an impossible shot returns BARRED and no difficulty, so a surface can
    // render it inert with its reason instead of pricing it.
    barred: barred, barredReason: barredReason,
    rangeCap: rangeCap || null,   // R7 B-1454: a ticked mode's maximum band this roll (canonical, 'Short'); null when none
    // The skill this attack rolls, resolved ONCE here. Consumers that want this weapon's item
    // reminders ask with THIS key rather than re-deriving it — `resolveWeaponSkillKey` has four
    // fallbacks and a second caller would be a second answer.
    skillKey: skKey };
  // R-PCA-2: certified item dice fold in LAST, after characteristic/skill/difficulty/encumbrance
  // have contributed, so a 'remove' can actually find the die it is meant to remove. Folding here
  // rather than at the call sites is what makes cockpit, weapon modal and Dice Hub agree by
  // construction — all three already come through this one builder (dc3-smart-weapon-frame §2).
  //
  // A BARRED shot is NOT augmented. The row offers no roll and prices nothing, so adding a boost
  // to it would put dice on a pool no one can roll and make the changes list claim a modifier had
  // an effect it never had.
  if (barred) return spec;
  // F-100 M8 C11 (R-M8K-16, R-M8K-26): the owner's ROLL NUMBERS at this attack, through the one matcher
  // (SWRPGPoolMods.rollNumbersAt) with this row's check context and its band — the SAME band that priced the difficulty.
  // `damageLines` ride BESIDE the printed damage ("+N damage to one hit", EotE p.135/p.140) and are never folded into it
  // (soak is per hit, EotE p.207). `critThreshold` takes the APPLIED crit_rating_delta rows, never below their floor;
  // the printed rating stays in `critPrinted` (restored at B2 with Iron Body, f100-m8-build-card R-M8B-23, from c0e03b56).
  // `rctx.weapon` is the row's weapons.json id, so a `weapon_record` anchor matches the row whose weapon IS that record
  // (R-M8K-25: Iron Body's 'unarmed'). OFFERED rows (a condition, cost or limit) are returned, never applied.
  var P = window.SWRPGPoolMods, idx = poolModSkillIndex();
  if (P && P.rollNumbersAt && idx && skKey) {
    var rctx = P.contextFor(skKey, idx, charLong || undefined), owned = collectRollNumbers(sheet);
    if (weapon.regId) rctx.weapon = weapon.regId;
    var ropts = { ctx: rctx, band: band.toLowerCase(), sheet: sheet,
      pickFor: function (tid, pid) { var v = CR.pickOf ? CR.pickOf(sheet, '_talent', tid, pid) : undefined; return v == null ? null : v; } };
    spec.damageLines = P.rollNumbersAt(owned, 'damage_delta', ropts);
    spec.critLines = P.rollNumbersAt(owned, 'crit_rating_delta', ropts);
    spec.critSetLines = P.rollNumbersAt(owned, 'crit_rating_set', ropts);   // F-100 M9 (R-M9S-4): a species SET — DARK
    // the surfacing hub (`b1205:offered-crit-sets`): a TICKED offered SET (the Tarc's claws, "When using claws") is taken for
    // this roll through the one core, so the rating below reads it as applied; the offered line stays for the tick
    if (taken && P.takeRollNumbers) spec.critSetLines = P.takeRollNumbers(spec.critSetLines, taken);
    spec.critPrinted = spec.critThreshold;
    spec.critThreshold = P.critRatingWith(spec.critThreshold, spec.critLines, spec.critSetLines);
  }
  // F-100 M8 step 3 (R-M8B-12 (a)): `taken` = this row's ticked offers, for ONE roll — folded by the one fold, in RAW order
  // with every other entry (SWRPGPoolMods.takeOffers); absent, the pool is exactly as before.
  // B-219 (f100-b219-card ADDENDUM 1, R-B219C-6..8): THIS weapon's quality rows, from the ONE reader (SWRPGQualityRows,
  // lib/shared/qualityRows.js) off its RESOLVED qualities, scaled by its rating (Cumbersome/Unwieldy by the Brawn/Agility
  // deficit) and anchored to this attack's skill. They join THIS call's mods only — never collectPoolMods (two copies of
  // one record share a regId) — first, so the weapon's own lines lead; Cumbersome beside a reducer or Burly is an OFFER.
  // `spec.qualityMods` carries them so the hub's offers (diceHubWeaponReminders) read the same list the fold took.
  var Q = window.SWRPGQualityRows, qrows = [];
  if (Q && Q.poolRows && P && idx && skKey) {
    var qctx = P.contextFor(skKey, idx, charLong || undefined);
    if (qctx) qrows = Q.poolRows(weapon, { vocab: window._qualitiesDb, characteristics: chars, anchor: { scope: 'skill', value: qctx.skillId },
      ownedTalentIds: CR.ownedTalentIdsOfSheet ? CR.ownedTalentIdsOfSheet(sheet) : [] });
  }
  spec.qualityMods = qrows;
  // R-SHC-4 (QM1): the weapon's MODES (Auto-fire, Stun setting), OFFERED — each mode's rows carry the `limit: 'mode'` mark,
  // so they fold only when the row's tick takes the mode's key (takeOffers, below); unticked a mode applies nothing.
  // `spec.modes` is what the hub's MODE ticks draw; their rows ride this call's mods and never the offer list.
  var mctx = (Q && Q.modeOffers && P && idx && skKey) ? P.contextFor(skKey, idx, charLong || undefined) : null;
  var modes = mctx ? Q.modeOffers(weapon, { vocab: window._qualitiesDb, anchor: { scope: 'skill', value: mctx.skillId } }) : [];
  spec.modes = modes;
  var modeRows = [];
  modes.forEach(function (m) { modeRows = modeRows.concat(m.poolRows || []); });
  // R-B219C-14 (2): a quality an ATTACHMENT granted changes the base damage (Superior +1); a native one is in the printed
  // profile already. `native` = this weapon's registry record's own qualities (the regId the row resolved from).
  // (`typeof`: a vm that slices this function without sheetItemRegistries reads no quality damage, as it did before the move)
  var wRec = (Q && Q.damageRows && weapon.regId && typeof sheetItemRegistries === 'function')
    ? (((sheetItemRegistries(sheet) || {}).weapons || {})[weapon.regId] || null) : null;
  spec.qualityDamage = wRec ? Q.damageRows(weapon, wRec.qualities) : [];
  spec.damage = sheetWeaponDamage(sheet, weapon, spec.qualityDamage);   // C3 (644 S3): the ONE damage the card and the hub print
  var mods = qrows.concat(modeRows, collectPoolMods(resolvedEquipment));
  if (taken && window.SWRPGPoolMods && window.SWRPGPoolMods.takeOffers) mods = window.SWRPGPoolMods.takeOffers(mods, taken);
  return withPoolMods(spec, mods, skKey, charLong || undefined);   // B-1065: the rolled characteristic
}

  window.SWRPGSheetPool = {
    charPool: yardCharPool,
    loadCanonicalCharacterBuild: loadCanonicalCharacterBuild,
    deriveItemState: deriveItemState,
    sheetItemRegistries: sheetItemRegistries,
    resolveSheetEquipment: resolveSheetEquipment,
    OGG_TO_SHEET_SKILL: OGG_TO_SHEET_SKILL,
    CHAR_KEY_TO_PROP: CHAR_KEY_TO_PROP,
    poolModSkillIndex: poolModSkillIndex,
    collectPoolMods: collectPoolMods,
    withPoolMods: withPoolMods,
    collectRollNumbers: collectRollNumbers,
    SHEET_KEY_TO_OGG: SHEET_KEY_TO_OGG,
    skillEntryRank: skillEntryRank,
    sheetSkillRank: sheetSkillRank,
    sheetSkillCharacteristic: sheetSkillCharacteristic,
    sheetPoolOf: sheetPoolOf,
    sheetCheckInputs: sheetCheckInputs,
    sheetWeaponDamage: sheetWeaponDamage,   // post1-one-number-hub-build C3: the one damage, card + hub   // post1-one-number-hub-build S1/S2: the check's characteristics and rank, one path
    sheetPoolFor: sheetPoolFor,
    yardCharPool: yardCharPool,
    yardSeatLines: yardSeatLines,   // F-100 M8 step 3: a Ship Yard seat's applied lines and offers (R-M8C8-5)
    seatGrantMods: seatGrantMods,   // THE SURFACING MISSION (R-SYC-5): a ship's seat_talents as the sitter's dice rows (the sheet's seat pools)
    weaponPoolOf: weaponPoolOf,     // the one weapon pool builder: the hub row and the sheet's WEAPONS card (R-SSC-4)
  };
})();
