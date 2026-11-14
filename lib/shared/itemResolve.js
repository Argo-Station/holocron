/**
 * itemResolve.js — the SHARED canonical weapon/item resolution core (ADR 0003).
 *
 * Extracted from lib/gm/npcCombat.js so the Player Datapad and the GM Holocron run the SAME
 * brawn-math and id-ref resolution — one implementation, no drift. This is the anti-drift lesson
 * from the combat cluster: the double-brawn bug stays dead because there is exactly ONE place that
 * adds Brawn to weapon damage.
 *
 * Two resolution disciplines, deliberately distinct:
 *   - resolveWeapon (LOUD): bare id-ref string -> registry, THROWS on a dangling ref; an object is
 *     an inline canonical profile, returned as-is. This is the NPC/canonical-integrity contract —
 *     a missed/renamed id surfaces, never silently renders dashes.
 *   - pcResolveEntry (GRACEFUL): the Player equipment-entry convention — {id, qty?} catalog ref OR
 *     {_inline: <full canonical record>} custom — returns null (skip) on an unresolvable/legacy
 *     entry instead of throwing, so an OLD saved character with the pre-canonical shape degrades
 *     gracefully rather than crashing the sheet.
 *
 * weaponDamage is the single brawn-add: base==='brawn' -> Brawn + value; base==='flat' -> value.
 * Pure + dual-export (browser window.ItemResolve / CommonJS module.exports) for node harnesses.
 */
(function (root) {
  'use strict';

  var MELEE_SKILLS = { brawl: 1, melee: 1, lightsaber: 1 };

  // Brawn off any actor that carries the canonical lowercase characteristics block (NPC or PC).
  function brawnOf(actor) {
    return (actor && actor.characteristics && actor.characteristics.brawn) || 0;
  }

  // LOUD: weapon entry (id-ref string | inline canonical profile) -> canonical weapon.
  // Dangling id-ref THROWS. (NPC/canonical-integrity contract; unchanged from npcCombat.)
  function resolveWeapon(entry, weaponRegistry) {
    if (typeof entry === 'string') {
      var w = weaponRegistry[entry];
      if (!w) throw new Error('itemResolve: dangling weapon id-ref ' + entry);
      return w;
    }
    return entry;   // inline profile — already canonical
  }

  // THE damage computation — the single place Brawn is added to weapon damage.
  // base==='brawn' -> { total: Brawn + value, bonus: value }  (Br+value; never Br+0 when value>0)
  // base==='flat'  -> { total: value, bonus: null }
  function weaponDamage(canonWeapon, actor) {
    var d = canonWeapon.damage;            // canonical: always present {value, base}
    if (d.base === 'brawn') {
      return { total: brawnOf(actor) + d.value, base: 'brawn', bonus: d.value };
    }
    return { total: d.value, base: 'flat', bonus: null };
  }

  // Full render shape for one weapon. `damage` is the BASE value (what the sheet shows, and what a
  // consumer adds Brawn to IFF damageBase==='brawn') — NOT the brawn-added total, so a consumer's
  // own `+ Brawn` never double-counts. The brawn-add keys on damageBase (canonical), not isMelee,
  // so a flat-skilled melee weapon (lightsaber: base 'flat') shows its absolute damage. The
  // FFG-table display string is exposed as `damageDisplay`: brawnDamageText for brawn ("+0", "+2", "−1"; B-1429),
  // plain N for flat. damage/name/range ALWAYS present (kills "— / —").
  // B-1195 — THE one crit display. The registry stores "no critical rating" as `crit: 0` (40 weapons: the training
  // lightsaber, nets, stun grenades…), and the roll already reads ≤ 0 as no threshold (`computeWeaponPool`'s critThreshold
  // null; the dice hub prints "—"); every place that PRINTS a weapon's Critical goes through here so none prints the raw 0.
  // null / '' / a number ≤ 0 → "—"; anything else prints as itself (String), so a printed 3 reads "3" everywhere.
  function critText(c) {
    if (c == null || c === '') return '\u2014';
    var n = Number(c);
    return (isFinite(n) && n <= 0) ? '\u2014' : String(c);
  }

  // B-1429 — THE one Brawn damage label and its one reader. A Brawn weapon prints its add SIGNED, as the books do: "+2",
  // "+0", "−1" (a true minus, as the editor's `signed`); a flat weapon prints its number. Every label site writes through
  // brawnDamageText, and every reader that must tell a Brawn label from a flat one reads damageTextValue — a leading "+"
  // alone is not the mark, because a −1 has none. A flat damage is never negative (schema/weapon.schema.json), so a leading
  // minus can only be a Brawn add.
  function brawnDamageText(n) {
    var v = Number(n) || 0;
    return v < 0 ? '−' + (-v) : '+' + v;
  }
  // "+2" → {base:'brawn', value:2} · "−1"/"-1" → {base:'brawn', value:-1} · 7 or "7" → {base:'flat', value:7};
  // value null when the text holds no number.
  function damageTextValue(s) {
    if (typeof s === 'number') return { base: 'flat', value: isFinite(s) ? s : null };
    if (typeof s !== 'string' || s === '') return { base: 'flat', value: null };
    var c = s.charAt(0), brawn = c === '+' || c === '-' || c === '−';
    var n = Number(brawn ? s.slice(1) : s);
    if (!isFinite(n)) return { base: brawn ? 'brawn' : 'flat', value: null };
    return { base: brawn ? 'brawn' : 'flat', value: c === '+' || !brawn ? n : -n };
  }

  function weaponForDisplay(entry, weaponRegistry) {
    var w = resolveWeapon(entry, weaponRegistry);
    return {
      name: w.name,
      damage: w.damage.value,            // BASE; effective = damageBase==='brawn' ? value+Brawn : value
      damageBase: w.damage.base,         // 'brawn' | 'flat'
      damageDisplay: w.damage.base === 'brawn' ? brawnDamageText(w.damage.value) : '' + w.damage.value,
      isMelee: !!MELEE_SKILLS[w.skill],  // skill class — drives band/difficulty, NOT the brawn-add
      crit: (w.crit != null) ? w.crit : null,
      range: w.range,
      skill: w.skill,
      qualities: w.qualities || [],
    };
  }

  // GRACEFUL: a Player equipment entry -> its canonical record, or null when unresolvable.
  //   - bare id-ref string                 -> registry[entry]   | null
  //   - { _inline: <full canonical record> } -> that record (custom/homebrew; schema-valid, never a
  //                                             display shape, so it resolves identically to catalog)
  //   - { id, qty? } catalog ref           -> registry[id]      | null
  //   - anything else (legacy pre-canonical {name,damage:string,...}, or a missing ref) -> null
  // Returns null (NOT throw) so the sheet skips/falls back on an old or dangling item.
  function pcResolveEntry(entry, registry) {
    if (entry == null) return null;
    if (typeof entry === 'string') return registry[entry] || null;
    if (entry._inline) return entry._inline;
    if (entry.id != null) return registry[entry.id] || null;
    return null;
  }

  // True iff `rec` is an ARMOUR record by the schemas' own discriminator: armor.schema's anyOf requires `soak`, or a
  // `defense` of 1 or more; gear.schema admits neither (additionalProperties false); a weapon carries `damage`. The ONE
  // test for "is this inline record a suit" (ruling release-r5-crafting-kp-c0 Q1 (a)): the sheet's spare branch
  // (sheetPool.resolveSheetEquipment) and the craft's landing (craftStore.outputOf) both ask it.
  function isArmorRecord(rec) {
    return !!rec && typeof rec === 'object' && !rec.damage && (rec.soak != null || Number(rec.defense) >= 1);
  }

  // True iff `entry` is a canonical PC equipment entry (catalog {id} / {_inline}) rather than a
  // legacy pre-canonical object. Lets a consumer choose: resolve canonical, or best-effort render
  // the legacy fields it carries.
  //
  // B-242 — `registry` is OPTIONAL and only a STRING consults it. This used to claim EVERY string,
  // which contradicted the PC convention documented at the head of this file: `{id, qty?}` or
  // `{_inline}`. A bare string is the PRE-canonical save shape (`gear: ["Blaster power pack"]`), so
  // claiming it sent old saves down the canonical path, where they failed to resolve and rendered
  // "(unknown gear)" — while the legacy branch written for exactly that shape sat unreachable.
  //
  // "Is this string canonical?" is a question only the REGISTRY can answer, never the string's
  // shape: a display name and an id are both just strings, and any lowercase/underscore heuristic
  // would be guessing. Given a registry, a string is canonical iff the registry holds that key.
  // Given NO registry the old answer stands, so callers that never had one do not move.
  // `typeof registry === 'object'` is LOAD-BEARING, not defensive noise. This function is called
  // point-free — `arr.every(isCanonicalEntry)` — and Array.every passes (element, INDEX, array), so
  // a second parameter silently receives a NUMBER. Without this check the existing call in
  // test/item_resolve.cjs would pass or fail depending on where the string sits in its fixture
  // array: index 0 is falsy and takes the compatibility path, index 1+ is truthy and gets asked
  // `hasOwnProperty` of a number, which is always false. It passes today only because the string
  // happens to be first. A registry is always an object; a number never is.
  function isCanonicalEntry(entry, registry) {
    if (entry == null) return false;
    if (typeof entry === 'string') {
      if (!registry || typeof registry !== 'object') return true;
      return Object.prototype.hasOwnProperty.call(registry, entry);
    }
    return entry._inline != null || entry.id != null;
  }

  // ── the quality WRITE (F-56, ruling `crafting-quality-mutation-helper` Q1 option (c)) ──────────
  // Until now this module only READ qualities. Crafting is the first feature that changes one: 12 of
  // its 29 spend rows grant a quality or raise one already present, and F-53 attachments will make
  // the identical move (R-CQM-3 binds it to consume THIS function rather than write a second one).
  //
  // DELIBERATELY MINIMAL. It knows nothing about crafting, attachments, or where a cap came from:
  //   - PURE — returns a NEW array; the input is never mutated (the mods.js applyOverlay posture).
  //   - unranked -> a bare grant, and a second grant is a no-op (Knockdown, Sunder).
  //   - ranked   -> grant at rank 1 when absent, +1 when present.
  //   - cap      -> clamps when supplied; ABSENT MEANS UNCLAMPED. This function NEVER invents a
  //                 ceiling, and that is load-bearing law, not a style choice (R-CQM-2): crafting's
  //                 printed maxima are CRAFTING's, not the game's. Our own catalogue legally ships
  //                 Vicious 6 / Pierce 6 / Stun 8 against crafting's Vicious 5, so a helper that
  //                 clamped by default would silently corrupt canon. Caps live in the per-row code
  //                 (`crafting-v1-spend` §4) and arrive here as an argument.
  //   - NEUTRAL on a bad id: the CALLER decides loud vs graceful, because only the caller knows
  //     which path it is on (crafting ids come from a closed map, so there an unknown id is a bug).
  //   - `by` (F-100 M12 QG1, census card R-M12C-60): the STEP, a positive integer, default 1. A ranked grant enters at
  //     `by` and a raise adds `by` (a talent's "Pierce 2", "+1 per rank"); the cap clamps the result as above. Crafting
  //     never passes it, and test/f100_m12_crafting_bytes.cjs proves its calls write the bytes they wrote before. An
  //     unranked quality ignores it. "Raise only, never grant" (QG1's raise_only) is the CALLER's test, not a mode here.
  //   - R-R5CC-1 (`release-r5-crafting-contract`): three optional parameters, each absent = the behaviour above, unchanged.
  //     `start` — the rank a ranked grant ENTERS at when the quality is absent (Stun 3, Blast 5); a raise still adds `by`;
  //     the cap clamps it. `if_present` — raise only: an item without the quality gains nothing (and loses nothing).
  //     `replaces` — a quality id removed in the same act, before the grant (Unwieldy ↔ Cumbersome); not removed when
  //     `if_present` refuses the grant. test/release_r5_attachment_bytes.cjs proves no attachment path moves.
  function grantOrIncrementQuality(qualities, id, opts) {
    var list = Array.isArray(qualities) ? qualities : [];
    var o = opts || {};
    var ranked = !!o.ranked;
    var cap = (typeof o.cap === 'number') ? o.cap : null;
    var step = (typeof o.by === 'number' && o.by >= 1 && Math.floor(o.by) === o.by) ? o.by : 1;
    var start = (typeof o.start === 'number' && o.start >= 1 && Math.floor(o.start) === o.start) ? o.start : step;
    var out = list.map(function (q) { return q; });   // new array; entries copied on write below
    var i, found = -1;
    for (i = 0; i < out.length; i += 1) { if (out[i] && out[i].id === id) { found = i; break; } }
    if (found === -1 && o.if_present) return out;     // raise only: nothing held, nothing granted, nothing replaced
    if (o.replaces && o.replaces !== id) {
      out = out.filter(function (q) { return !(q && q.id === o.replaces); });
      found = -1;
      for (i = 0; i < out.length; i += 1) { if (out[i] && out[i].id === id) { found = i; break; } }
    }

    if (found === -1) {
      var granted = { id: id, name: (o.name || id), ranked: ranked };
      if (ranked) granted.rank = (cap != null && cap < start) ? cap : start;
      out.push(granted);
      return out;
    }
    if (!ranked) return out;                          // bare quality already present — nothing to raise
    var cur = out[found];
    var curRank = (typeof cur.rank === 'number' ? cur.rank : 0);
    var next = curRank + step;
    // A cap CLAMPS THE INCREMENT; it must never REDUCE a value already above it. Sounds pedantic,
    // is not: catalogue weapons legally carry ranks above crafting's maxima (shipped Vicious 6 vs
    // crafting's 5), so a naive `next = cap` would quietly DOWNGRADE canon the moment someone
    // crafted onto such a weapon. R-CQM-2's whole point, caught by its own guard.
    if (cap != null && next > cap) next = (curRank > cap) ? curRank : cap;
    var copy = {};
    for (var k in cur) { if (Object.prototype.hasOwnProperty.call(cur, k)) copy[k] = cur[k]; }
    copy.rank = next;
    out[found] = copy;                                // replace, never mutate the caller's object
    return out;
  }

  // ── attachment resolution (Lap B, ruling loadout-lap-b-attachment-schema) ─────────────────────
  // LOUD: attachment entry (id-ref string | inline) -> canonical attachment.
  function resolveAttachment(entry, attachmentRegistry) {
    if (typeof entry === 'string') {
      var a = attachmentRegistry[entry];
      if (!a) throw new Error('itemResolve: dangling attachment id-ref ' + entry);
      return a;
    }
    if (entry && entry.id != null) {
      var a2 = attachmentRegistry[entry.id];
      if (!a2) throw new Error('itemResolve: dangling attachment id-ref ' + entry.id);
      return a2;
    }
    return entry;
  }

  // GRACEFUL: the PLAYER-lane twin of resolveAttachment (B-227, ruling `gear-consolidation-build`
  // §3). Returns null for a dangling id-ref instead of throwing, exactly as `pcResolveEntry` does
  // for weapons/armor/gear — the sheet then renders a visible marker and the panel still mounts.
  //
  // WHY TWO LANES AND NOT ONE SOFTENED LANE: `resolveAttachment`'s throw is the canonical-integrity
  // contract, and it is right for code and NPC paths — a registry that disagrees with itself should
  // stop the build, loudly. What it is NOT right for is a PLAYER'S OLD SAVE, which can name an
  // attachment that no longer exists through no fault of the data. One bad id inside
  // hardpointAccounting took down the whole loadout panel render (B-226 diagnosis: the panel simply
  // did not mount while the face still did), which is a worse outcome for that player than showing
  // them one unreadable row.
  //
  // The null is NOT a skip. Callers push a marker so the index stays aligned with the persisted
  // entries — the same reason pcResolveEntry's callers push '(unknown weapon)' rather than dropping
  // the element: attachments are edited BY INDEX, and a silent drop re-points every later edit.
  function pcResolveAttachment(entry, attachmentRegistry) {
    if (entry == null) return null;
    var reg = attachmentRegistry || {};
    if (typeof entry === 'string') return reg[entry] || null;
    if (entry.id != null) return reg[entry.id] || null;
    return entry;                       // inline attachment record — same as the loud lane
  }

  // GRACEFUL HP accounting for the PC lane. Same arithmetic as hardpointAccounting, but an entry
  // that does not resolve is COUNTED, never thrown on and never silently zero-cost — the C-LBA-1
  // principle ("unknown is not free") applied one step earlier, to "unknown attachment" rather than
  // "unknown cost". `unresolved` is what lets the panel say something true about the row it cannot
  // read; folding it into `uncosted` would have merged "we don't know its cost" with "we don't know
  // what it is", two facts a GM would act on differently.
  // F-100 M12 5b-4 MV4 (census card R-M12C-55/-95; f100-m12-build-card R-M12B-53/-57): an installed
  // attachment's `host_hard_points_delta` (its BASE field) and a SELECTED option's `host_hard_points_delta`
  // effect change the HOST's capacity, the sibling of a talent item_effect's hard_points_delta. `value` applies ONCE,
  // never × the line's rank (R-M12B-57: the hilt's "Add 4 Hard Point(s)" at rank 4 is 4). The capacity never goes below 0
  // (Cyphers and Masks p.80/81: the item loses 1 available hard point for good, and an item with no hard
  // points can still be altered this way). The moved amount rides on `hostDelta`, present only when non-zero.
  function _hostHardPointsDelta(entry, att) {
    var d = Number(att.host_hard_points_delta) || 0;
    _installedOptions(entry, att).picked.forEach(function (p) {
      var fx = !p.m.never_modelled && p.m.effect;
      if (fx && fx.type === 'host_hard_points_delta') d += Number(fx.value) || 0;
    });
    return d;
  }
  // B-1468 (ruling `release-r7-bug-burndown` ADDENDUM 9, D-396): `host`, the item's CANONICAL record, optional. A stock
  // saber is a hilt holding a stock Ilum crystal that takes up two of the weapon's hard
  // points (FaD p.176; CotR p.55; KtP p.46; KoF p.43–44), and every saber's `hardpoints` is its printed TOTAL. So while no
  // installed attachment replaces it — the one rule applyInstalledAttachments reads (R-B11FU-5): an attachment that SETS
  // the damage is the crystal now — the host's `crystal_default` is counted as installed; its id rides on `crystalDefault`.
  // A caller without the record (or a host with no default) reads exactly as before.
  function pcHardpointAccounting(itemHardpoints, installedAttachments, attachmentRegistry, host) {
    var capacity = (typeof itemHardpoints === 'number') ? itemHardpoints : 0;
    var used = 0, uncosted = 0, unresolved = 0, hostDelta = 0, crystalFitted = false;
    var list = installedAttachments || [];
    for (var i = 0; i < list.length; i++) {
      var att = pcResolveAttachment(list[i], attachmentRegistry);
      if (!att) { unresolved++; continue; }
      if (att.hp != null && typeof att.hp === 'number') used += att.hp;
      else uncosted++;
      if (att.damage_set != null) crystalFitted = true;
      hostDelta += _hostHardPointsDelta(list[i], att);                                            // MV4
    }
    var def = (host && host.crystal_default && !crystalFitted) ? pcResolveAttachment(host.crystal_default, attachmentRegistry) : null;
    if (def) {
      if (def.hp != null && typeof def.hp === 'number') used += def.hp;
      else uncosted++;
    }
    if (hostDelta) capacity = Math.max(0, capacity + hostDelta);
    var out = { used: used, capacity: capacity, over: used > capacity,
                uncosted: uncosted, unresolved: unresolved };
    if (hostDelta) out.hostDelta = hostDelta;
    if (def) out.crystalDefault = def.id || host.crystal_default;
    return out;
  }

  // HP accounting: total HP consumed by installed attachments vs item capacity.
  // Returns {used, capacity, over, uncosted} — over=true means hard-point budget exceeded;
  // uncosted counts attachments whose cost is unknown (hp: null, R-LBS-3). Unknown ≠ free:
  // a null-cost attachment is flagged, never silently zero-cost (C-LBA-1).
  function hardpointAccounting(itemHardpoints, installedAttachments, attachmentRegistry) {
    var capacity = (typeof itemHardpoints === 'number') ? itemHardpoints : 0;
    var used = 0;
    var uncosted = 0;
    for (var i = 0; i < installedAttachments.length; i++) {
      var att = resolveAttachment(installedAttachments[i], attachmentRegistry);
      if (att.hp != null && typeof att.hp === 'number') {
        used += att.hp;
      } else {
        uncosted++;
      }
    }
    return { used: used, capacity: capacity, over: used > capacity, uncosted: uncosted };
  }

  // ── attachmentFit — does this attachment go on THIS item? (F-86 MODIFY takeover) ──────────
  //
  // The personal-gear counterpart of vesselStore's `fit`, and it DIVERGES from that core on
  // purpose. vesselStore quotes `category_limit`/`item_limit` as UNEVALUATED and never scores them,
  // because the vehicle constraint vocabulary does not match vehicle records. For personal items it
  // matches exactly — census over the shipped registries: every `category_limit` term used by a
  // weapon attachment appears in some weapon's `categories` (0 orphans), the same for armor, and
  // every `item_limit` key resolves to a real record (0 orphans). So here the verdict IS computed,
  // which is what Mock 2 draws: a won't-fit candidate stays visible and inert WITH its reason.
  //
  // FAIL-OPEN on absent data: turning "we cannot tell" into "no" is the C-LBA-1 error (unknown is
  // flagged, never scored) — an unevaluable constraint goes to `unevaluated`, never to `reasons`.
  // EXCEPT a weapon's or armour's category (R-B11FU-7; F-100 M12 R-M12C-69): every uncategorised one's page
  // was read, and the few whose page names none (6 weapons; the Individual Field Disruptor) are KNOWN to have
  // none, so a category_limit refuses them. Gear carries no categories and stays fail-open.
  //
  // Takes the CANONICAL record, not the display shape: canonicalToStore whitelists fields and drops
  // `categories`/`_source_key`, so a caller holding a resolved sheet item looks the canonical record
  // back up by id. The display shape is a projection; the constraint lives on the record.
  //
  // Reason strings come from the STRUCTURE, never from a stored sentence — one grammar, so a new
  // threshold cannot ship with prose that disagrees with the bound it enforces.
  function _statPhrase(field, bound) {
    if (bound.min != null && bound.max != null) return field + ' ' + bound.min + '\u2013' + bound.max;
    if (bound.min != null) return field + ' ' + bound.min + ' or higher';
    return field + ' ' + bound.max + ' or lower';
  }

  // Returns { fits, reasons[], unevaluated[] } — `fits` is false only when a reason fired.
  function attachmentFit(canonItem, attachment, opts) {
    var o = opts || {};
    var reasons = [], unevaluated = [];
    var item = canonItem || {};
    var att = attachment || {};

    // 1. Kind. An armor attachment never goes on a weapon, whatever its hard points allow.
    if (o.kind && att.type && att.type !== o.kind) reasons.push(att.type + ' attachment');

    var cons = att.constraints || {};

    // 2. category_limit — the item must carry at least one of the named categories.
    var catLimit = Array.isArray(cons.category_limit) ? cons.category_limit : null;
    if (catLimit && catLimit.length) {
      var cats = Array.isArray(item.categories) ? item.categories : null;
      if (!cats || !cats.length) {
        // an item with no category is refused (R-B11FU-7 (a)): every weapon's page was read, and the six left without one
        // name no kind (apply_weapon_categories' UNCLASSIFIED). F-100 M12 B-1232 (R-M12C-69): armour takes the weapon posture
        // — its pages were read too (apply_armor_categories' UNCLASSIFIED: the Individual Field Disruptor). Gear stays
        // fail-open (no gear record carries categories).
        if (o.kind === 'weapon' || o.kind === 'armor') reasons.push(catLimit.join(' or ') + ' only — this one is uncategorised');
        else unevaluated.push('fits ' + catLimit.join(' or ') + ' — this one is uncategorised');
      } else {
        var hit = false;
        for (var i = 0; i < catLimit.length; i++) {
          if (cats.indexOf(catLimit[i]) >= 0) { hit = true; break; }
        }
        if (!hit) reasons.push(catLimit.join(' or ') + ' only');
      }
    }

    // 2b. F-100 M12 B-1230 (R-M12C-64): a host whose page bars crystals (`refuses_crystals`, the lightwhip, Endless Vigil
    //     p.43) refuses every crystal, whatever its categories admit.
    if (item.refuses_crystals === true && att.is_crystal === true) reasons.push('no crystals');

    // 3. item_limit — named models only, matched on the OggDude source key. `itemLimitNames` lets
    //    the caller pass readable names; without it the raw keys are shown rather than invented.
    var itemLimit = Array.isArray(cons.item_limit) ? cons.item_limit : null;
    if (itemLimit && itemLimit.length) {
      var names = (o.itemLimitNames && o.itemLimitNames.length) ? o.itemLimitNames : itemLimit;
      if (item._source_key == null) {
        unevaluated.push('fits ' + names.join(' or ') + ' — this one is unkeyed');
      } else if (itemLimit.indexOf(item._source_key) < 0) {
        reasons.push(names.join(' or ') + ' only');
      }
    }

    // 3b. type_limit — the item's OggDude Type taxonomy (Melee, Energy Weapon, Slugthrower…),
    //     matched EXACTLY against `item.type`. A DIFFERENT AXIS from category_limit, not a synonym:
    //     the two coexist on the same record, and only one of the six type terms in play is even a
    //     legal category term. Pinned by R-ACV-2 §3 after a registry run — `type` carries that
    //     taxonomy verbatim (Energy Weapon 131 · Melee 89 · Slugthrower 32 · Lightsaber 18).
    var typeLimit = Array.isArray(cons.type_limit) ? cons.type_limit : null;
    if (typeLimit && typeLimit.length) {
      if (!item.type) {
        unevaluated.push('fits ' + typeLimit.join(' or ') + ' — this one has no type');
      } else if (typeLimit.indexOf(item.type) < 0) {
        reasons.push(typeLimit.join(' or ') + ' only');
      }
    }

    // 3c. skill_limit — CANONICAL skill ids (`ranged_heavy`), matched against the item's resolved
    //     `skill`. The stored terms are never raw OggDude keys (`RANGHVY`): the registries hold the
    //     snake_case ids, so a raw key would match nothing and this branch would quietly pass
    //     everything — silence wearing a constraint's clothes. The importer translates via
    //     skills.vocab.json aliases and the validator closes the vocabulary; this side just matches.
    var skillLimit = Array.isArray(cons.skill_limit) ? cons.skill_limit : null;
    if (skillLimit && skillLimit.length) {
      var skill = item.skill || item.skillKey || null;
      if (!skill) {
        unevaluated.push('fits ' + skillLimit.join(' or ') + ' weapons — this one has no skill');
      } else if (skillLimit.indexOf(skill) < 0) {
        reasons.push(skillLimit.join(' or ') + ' only');
      }
    }

    // 3d. stat_limit — numeric thresholds on the item's PRINTED profile (R-ANE-1). Keys are a
    //     closed vocabulary (soak/defense/encumbrance); bounds inclusive; multiple keys AND.
    //     Read from the BASE record and NEVER from a resolved-with-attachments shape (R-ANE-2):
    //     eligibility that moved with what is already installed would make install ORDER decide
    //     what fits, and the books quote the item's printed stat. Deterministic beats clever.
    var statLimit = (cons.stat_limit && typeof cons.stat_limit === 'object') ? cons.stat_limit : null;
    if (statLimit) {
      for (var f in statLimit) {
        if (!Object.prototype.hasOwnProperty.call(statLimit, f)) continue;
        var bound = statLimit[f] || {};
        var have = item[f];
        if (have == null || typeof have !== 'number') {
          unevaluated.push(_statPhrase(f, bound) + ' — this one has no ' + f);
          continue;
        }
        if ((bound.min != null && have < bound.min) || (bound.max != null && have > bound.max)) {
          reasons.push(_statPhrase(f, bound) + ' only');
        }
      }
    }

    // 3e. B-1403 (ruling `b1403-store-attachments-owns` R-B1403-16) — ALREADY FITTED: with `installed` (the host's installed
    //     ids) handed in, a host already carrying this attachment's id refuses a second copy, MODIFY's posture (D-GMD-3: a
    //     genuine duplicate is Jason's call). Absent → no leg, so every caller that does not pass it (MODIFY's list, which
    //     drops installed ids itself) is unchanged. The reason is PROPOSED copy, carried to Jason with the gate.
    if (Array.isArray(o.installed) && att.id != null && o.installed.indexOf(att.id) >= 0) reasons.push('already fitted');

    // 4. Hard points. `hpFree` absent means the caller is asking about fit alone, not budget.
    if (o.hpFree != null) {
      var cost = (att.hp != null && typeof att.hp === 'number') ? att.hp : null;
      if (cost == null) unevaluated.push('hard-point cost unknown');
      else if (cost > o.hpFree) reasons.push(o.hpFree + ' HP free');
    }

    return { fits: reasons.length === 0, reasons: reasons, unevaluated: unevaluated };
  }

  // ── writeAttachment — THE ONE WRITER of an item's `attachments[]` (B-1403, card `b1403-store-attachments-card` R-B1403-7) ──
  // writeAttachment(equipment, host, op) → the NEXT equipment, or the SAME object when nothing is written. Every write to
  // an item's attachments goes through here, on both hosts: the store's FINALIZE, MODIFY's install/uninstall and the
  // loadout panel's add/remove/toggle-mod. `host` is { kind: 'weapon' | 'armor' | 'gear', idx } (idx is ignored for armor).
  //   { op: 'attach', id, registry, record, hp?, itemLimitNames?, check? }: pushes `{ id, mods: [] }` (R-B1403-6: the shape
  //       MODIFY always wrote, nothing else). Refused when the id does not resolve, and then by the caller's CHECK
  //       (ruling `b1403-store-attachments-owns` R-B1403-13), both computed HERE, never trusted from the caller:
  //         check 'fit' (the default; the store's FINALIZE and MODIFY's install): `attachmentFit(record, att, { kind, hpFree,
  //           itemLimitNames, installed })` — kind, limits, HP free and a copy already fitted (R-B1403-16), the one verdict
  //           GOES ON also reads;
  //         check 'room' (the pack's Add attachment, D-279 "keep it free"): today's arithmetic only, moved here unchanged —
  //           used + uncosted + cost > capacity refuses, cost 1 when unknown; no kind, no limits, a duplicate allowed.
  //       Capacity is `pcHardpointAccounting(hp)`; `hp` defaults to the record's `hardpoints`.
  //   { op: 'detach', index } removes one entry · { op: 'toggle-mod', index, mod } flips one added-mod key.
  //   D1 (release-r5-f1, R-R5A-1: N installs = N entries of the key): { op: 'mod-add', index, mod, registry } pushes one
  //   entry of the key, refused at the option's printed count (`optionInstallCap`, the one cap rule `_installedOptions` reads) or when
  //   the key resolves to no option · { op: 'mod-drop', index, mod } removes the key's LAST entry.
  // The sheet's fitting stays free (D-279): no price, no ownership. Pure; never mutates its inputs.
  function writeAttachment(equipment, host, op) {
    var eq = equipment || {}, h = host || {}, o = op || {};
    var entry = h.kind === 'weapon' ? (eq.weapons || [])[h.idx]
      : h.kind === 'armor' ? eq.armor
      : h.kind === 'gear' ? (eq.gear || [])[h.idx] : null;
    if (!entry || typeof entry !== 'object') return equipment;
    var atts = (entry.attachments || []).slice();
    if (o.op === 'attach') {
      var reg = o.registry || {}, att = reg[o.id];
      if (!att) return equipment;
      var acct = pcHardpointAccounting(o.hp != null ? o.hp : (o.record || {}).hardpoints, atts, reg, o.record);   // B-1468
      if (o.check === 'room') {
        var cost = (att.hp != null && typeof att.hp === 'number') ? att.hp : 1;
        if (acct.used + acct.uncosted + cost > acct.capacity) return equipment;
      } else {
        var hpFree = Math.max(0, acct.capacity - acct.used - acct.uncosted);
        var installed = atts.map(function (a) { return a && typeof a === 'object' ? a.id : a; });
        if (!attachmentFit(o.record || {}, att, { kind: h.kind, hpFree: hpFree, itemLimitNames: o.itemLimitNames || [],
                                                  installed: installed }).fits) return equipment;
      }
      atts.push({ id: o.id, mods: [] });
    } else if (o.op === 'detach') {
      if (!(o.index >= 0 && o.index < atts.length)) return equipment;
      atts.splice(o.index, 1);
    } else if (o.op === 'toggle-mod') {
      var cur = atts[o.index];
      if (cur == null) return equipment;
      var one = typeof cur === 'string' ? { id: cur } : Object.assign({}, cur);
      var mods = (one.mods || []).slice(), at = mods.indexOf(o.mod);
      if (at >= 0) mods.splice(at, 1); else mods.push(o.mod);
      one.mods = mods;
      atts[o.index] = one;
    } else if (o.op === 'mod-add' || o.op === 'mod-drop') {
      var cur2 = atts[o.index];
      if (cur2 == null) return equipment;
      var one2 = typeof cur2 === 'string' ? { id: cur2 } : Object.assign({}, cur2);
      var mods2 = (one2.mods || []).slice();
      if (o.op === 'mod-add') {
        var attRec = (o.registry || {})[one2.id], opt = attRec && _optionAt(attRec, o.mod);
        if (!opt) return equipment;
        var have = mods2.filter(function (k) { return k === o.mod; }).length;
        if (have >= optionInstallCap(opt)) return equipment;
        mods2.push(o.mod);
      } else {
        var last = mods2.lastIndexOf(o.mod);
        if (last < 0) return equipment;
        mods2.splice(last, 1);
      }
      one2.mods = mods2;
      atts[o.index] = one2;
    } else {
      return equipment;
    }
    var nextEntry = Object.assign({}, entry, { attachments: atts });
    var next = Object.assign({}, eq);
    if (h.kind === 'armor') next.armor = nextEntry;
    else {
      var list = (h.kind === 'weapon' ? eq.weapons : eq.gear).slice();
      list[h.idx] = nextEntry;
      if (h.kind === 'weapon') next.weapons = list; else next.gear = list;
    }
    return next;
  }

  // ── B-1185 · THE ONE PATH FOR AN ITEM'S INSTALLED ATTACHMENTS (ruling `f100-b1185-card` R-B1185-1/-2) ─────────────────
  // applyInstalledAttachments(kind, rec, entries, attachmentRegistry, opts) → a NEW canonical record ('weapon' | 'armor' |
  // 'gear'), in the record's own shape, with every installed attachment applied. The sheet (resolveSheetEquipment, before
  // canonicalToStore), the pool (its `_qualitiesRaw`), every derived number and the MODIFY preview (installed vs installed +
  // pending) all read this one function, so there is no second formula (PRAXIS §5). Never mutates `rec` or `entries`.
  //   TWO PASSES (R-B1189-1). PASS 1, weapons: every attachment's SETS — `damage_set` replaces the base (and writes
  //   `base: 'flat'`: a crystal's printed damage is the number, never Brawn + n, FaD p.196) and `crit_set` replaces the
  //   Critical rating — then the HOST's `crystal_damage_mod` (R-B1189-7; the shoto's "reduce the damage of that lightsaber
  //   crystal by 1", FaD p.177) is added to a set damage. Two sets of one field (two crystals, which RAW forbids) → the
  //   later wins and the item carries `_attachmentSetConflicts: 1`. So nothing listed before a crystal is overwritten by it.
  //   Then, after a set, the HOST's `crystal_default`'s qualities_add come off (R-B11FU-5), and an installed attachment with
  //   `qualities_replace` clears the qualities (R-B11FU-6), so PASS 2's additions are the new crystal's, never stacked.
  //   PASS 2, in installation order, per attachment: its BASE adjustments, then its SELECTED options in index order, then its
  //   `qualities_remove` (after every addition of that attachment, as before).
  //   BASE adjustments: damage_mod, crit_mod (floor 1, R-B1185-16: Special Modifications p.54, the Enhanced XCiter's
  //   "to a minimum of 1"; a weapon with no rating, crit null or ≤ 0, is left alone as the character crit_delta op leaves it,
  //   R-B11FU-1: FaD p.177 prints the training lightsaber's Crit "—"), range_mod (one band per step through stepRange, the range_delta option's own step, R-B1189-2),
  //   encumbrance_mod, qualities_add (weapons); soak_mod, defense_melee_mod, defense_ranged_mod, encumbrance_mod (armour);
  //   encumbrance_mod (gear).
  //   SELECTED options: `entry.mods` holds the panel's keys, `m.key || m.id || 'mod_<index>'` into the attachment's
  //   `added_mods` (no shipped option carries key or id, so every stored key is 'mod_<index>'). An option applies its
  //   `effect` AS WRITTEN, what its chip reads: quality_add (ranked: the rank is ADDED, or granted at that rank; unranked:
  //   granted once), damage_delta, crit_delta (floor 1, EotE's minimum; no rating left alone, R-B11FU-1), encumbrance_delta (floor 0), range_delta (one band
  //   per step, clamped to engaged…extreme), defense_delta (`general` raises the defence; `melee`/`ranged` one side),
  //   soak_delta. Not applied, and shown as their text: talent_grant, quality_add_contextual, meta_hp_crystal and every
  //   `never_modelled` option. A key that resolves to no option is SKIPPED and counted on `_attachmentModsSkipped`.
  //   INSTALLS (RELEASE 1.0 R5, card `release-r5-attachments` R-R5A-1 C1, B-1186; retires R-B1185-3's "no saved shape"): an
  //   option installed N times is N entries of its key in `entry.mods`, the ship idiom (R-S1C-4), and each entry applies
  //   the option's `effect`, which is ONE install's (C2). N is capped at the option's printed count, `rank` (absent = 1):
  //   the entries past it are SKIPPED and counted on `_attachmentModsSkipped`, never thrown (old-data history). One helper,
  //   `_installedOptions`, is the cap for every reader of `entry.mods` here.
  //   F-100 M12 B-1204 (QR1, `qualities_reduce`; f100-m12-build-card R-M12B-8, census card R-M12C-9/-53 and its erratum):
  //   a BASE `qualities_reduce` row lowers a ranked quality's rating by `by`, after that attachment's qualities_add, to
  //   `floor` (default 0: at 0 the quality is gone; EotE p.193's "Decrease … Cumbersome rating by 2"). LIVE. A row with a
  //   `condition` (the bipod's "when firing from a prone or crouched position…", EotE p.188; the tripod's "when set up",
  //   p.193) is NOT applied: it rides the record on `_qualityOffers` ({key, by, condition, source, cite}) and
  //   SWRPGQualityRows.poolRows OFFERS that quality's rows, naming it. An unrated quality has no rating to lower and is left.
  //   Each applied reduction is listed on `_qualitiesReduced` ({key, by, from, to, source}). An OPTION's `qualities_reduce`
  //   effect (the SUBQUAL* lines) is a newly MODELLED line (R-M12F-8).
  //   F-100 M12 5b-4 (census card R-M12C-55/-95/-98; f100-m12-build-card R-M12B-53), each a newly MODELLED arm:
  //   R1   an attachment's `pool_mods` rows are CARRIED onto the item's own (`out.pool_mods` = the record's, then theirs, in
  //        installation order): a row from `base_mods` always, a row from `added_mods` once per install of that option
  //        (R-R5A-1: an option's rows are one install's), none while it is not selected.
  //        `from` is dropped (it points into the attachment); MV1's `applies_to {scope: host_item}` becomes M8's
  //        {scope: weapon_record, value: <this record's id>} ("checks made with THIS weapon", R-M8K-25), on a weapon only —
  //        a host_item row with no weapon record to name is not carried and is counted on `_poolModsUnanchored`.
  //        SWRPGPoolMods.collect then reads them off the resolved equipment, the one path (R-PCA-2).
  //   MV2  an option's `talent_grant` (selected) or a base line's is listed on `_innateTalents` ({talent, ranks, source}):
  //        the user has the talent only while wielding the gear, and only for that gear (EotE p.187).
  //        Listed, not applied: no reader yet applies a talent scoped to one item.
  //   MV3  (f100-m12-build-card ADDENDUM 20, R-M12B-59/-60) the record's `character_effects` (its base lines) and each
  //        SELECTED option's `item_character_effect` line effect are listed on `_characterEffects` ({op, key, value, source,
  //        attachment}). Nothing here applies them: they act on the CHARACTER, item → character, so CharResolve's
  //        itemCharacterEffects reads them off the resolved equipment while the item is in use (armour worn; weapons and
  //        gear not stowed) — "when using the modded item" (EotE p.187).
  //   QS2  (f100-m12-build-card ADDENDUM 22, R-M12B-70) a SELECTED option's `spend_cost_delta` (jury_rigged_weapon's "Takes 1
  //        Less [AD] to Activate", EotE p.138) is listed on a weapon's `_spendCostDeltas` ({key, value, source}). Nothing
  //        here lowers a price: SWRPGQualityRows.spendRows reads them at the spend menu (floor 1), and `key: "any"` rides
  //        unapplied there — the player names the quality.
  // An entry that resolves to no attachment is counted on `_attachmentsUnresolved` and contributes nothing (B-227's PC lane:
  // the panel still renders it as '(unknown attachment)'). An attachment's carry bonus (`encumbrance_threshold_bonus`), read
  // from the attachment RECORD by id, is listed on `_attachmentCarry` ({name, bonus}) for CharResolve's encumbrance count (R-B1185-5).
  // Per-side defence: when a side moved, `defense_melee` / `defense_ranged` are written (each = the side's own value, or
  // `defense`, plus that side's deltas); canonicalToStore carries them (R-B1185-10) and computeDerived reads
  // `defense_<side> ?? defense`. `opts.qualityLabels` ({id: label}, from qualityLabelsOf) names a GRANTED quality; a quality
  // already on the record keeps its own name.
  var RANGE_BANDS = ['engaged', 'short', 'medium', 'long', 'extreme'];
  //   R-R5CC-1 (`release-r5-crafting-contract`, ADDENDUM 2): crafting's spend rows are inline attachments whose options are
  //   their `effects`, so the ops they need are written HERE, once: `hands_set` (a weapon's `hands`, the result_profile.hands
  //   enum, a SET), `hard_points_delta` (the record's `hardpoints`), `quality_grant` (grantOrIncrementQuality with `ranked`,
  //   `cap`, `by`, `start`, `if_present`, `replaces`), and `encumbrance_delta`'s optional `floor` (the item_effect rule,
  //   _floored: an item at or below the floor is never raised; absent = the floor 0 above). No held attachment carries any
  //   of them (test/release_r5_attachment_bytes.cjs).
  var OPTION_APPLIED = { quality_add: 1, damage_delta: 1, crit_delta: 1, encumbrance_delta: 1, range_delta: 1, defense_delta: 1, soak_delta: 1,
    hands_set: 1, hard_points_delta: 1, quality_grant: 1 };
  var HANDS = { one_handed: 1, two_handed: 1 };
  // the newly MODELLED option effects (F-100 M12); `withoutModelled` (applyInstalledAttachments) leaves them out
  var OPTION_DARK = { qualities_reduce: 1, spend_cost_delta: 1 };
  // S3 (R-AE-7): a copy whose book text was removed (SWRPGSources.bookTextRemoved, its one reader); false without the module
  function _bookTextRemoved() {
    var S = root && root.SWRPGSources;
    return !!(S && typeof S.bookTextRemoved === 'function' && S.bookTextRemoved());
  }
  function _optionAt(att, key) {
    var mods = Array.isArray(att.added_mods) ? att.added_mods : [];
    for (var i = 0; i < mods.length; i++) {
      var m = mods[i];
      if (m && (m.key || m.id || ('mod_' + i)) === key) return m;
    }
    return null;
  }
  // R-R5A-1 C1: an option's printed install count — `rank`, absent = 1. The ONE cap rule (ruling `release-r5-f1` C1): the
  // readers' cap (`_installedOptions`), the writer's refusal (`writeAttachment` op mod-add) and MODIFY's count call it.
  function optionInstallCap(m) { return Math.max(1, Number(m && m.rank) || 1); }
  // R-R5A-1 C1: an entry's selected options, capped per option at `optionInstallCap`, in `entry.mods` order. { picked: [{at, m}], skipped }: `skipped` counts keys that resolve to no option AND installs past
  // the count. Every reader of `entry.mods` goes through here, so the cap is one rule.
  function _installedOptions(entry, att) {
    var keys = (entry && typeof entry === 'object' && Array.isArray(entry.mods)) ? entry.mods : [];
    var picked = [], skipped = 0, seen = {};
    keys.forEach(function (k) {
      var m = _optionAt(att, k);
      if (!m) { skipped++; return; }
      var at = att.added_mods.indexOf(m), cap = optionInstallCap(m);
      seen[at] = (seen[at] || 0) + 1;
      if (seen[at] > cap) { skipped++; return; }
      picked.push({ at: at, m: m });
    });
    return { picked: picked, skipped: skipped };
  }
  function applyInstalledAttachments(kind, rec, entries, attachmentRegistry, opts) {
    if (!rec) return rec;
    var out = Object.assign({}, rec);
    var list = Array.isArray(entries) ? entries : [];
    if (!list.length) return kind === 'armor' ? applyQualityArmorEffects(out, opts) : out;   // R-SPF-3 (b): a quality the armour carries itself
    var labels = (opts && opts.qualityLabels) || {};
    var weapon = kind === 'weapon';
    if (weapon) {
      out.damage = rec.damage ? { value: rec.damage.value, base: rec.damage.base } : rec.damage;
      out.qualities = Array.isArray(rec.qualities) ? rec.qualities.slice() : [];
    } else if (Array.isArray(rec.qualities)) {
      out.qualities = rec.qualities.slice();
    }
    var sideDelta = { melee: 0, ranged: 0 };
    var skipped = 0, unresolved = 0, carry = [], reduced = [], offers = [];
    // `opts.withoutModelled === true` resolves WITHOUT M12's newly modelled arms (R1, MV2, MV3, QS2 and OPTION_DARK's
    // effects), for ONE caller: the engine one-time line counts an attachment's rules with them minus without them
    // (CharResolve.engineFlipNotice; card `f100-surfacing-engine-flip-card` ADDENDUM 12 F1 (b); named by ADDENDUM 638 Q1).
    var modelled = !(opts && opts.withoutModelled === true), carriedPool = [], unanchored = 0, innate = [], charFx = [], spendDeltas = [];   // F-100 M12 5b-4 (R1, MV2, MV3) + QS2
    // R1: one attachment row onto the item; MV1's host_item names THIS weapon record (R-M8K-25)
    function carryPoolRow(pm, slot) {
      var row = Object.assign({}, pm);
      delete row.from;
      if (slot) row.own_slot = slot;   // S3 (R-AE-7): the attachment row's key in own_words.json — set only at 'removed'
      var at = Array.isArray(row.applies_to) ? row.applies_to : null;
      if (at && at.some(function (a) { return a && a.scope === 'host_item'; })) {
        if (!weapon || !rec.id) { unanchored++; return; }
        row.applies_to = at.map(function (a) { return a && a.scope === 'host_item' ? { scope: 'weapon_record', value: rec.id } : a; });
      }
      carriedPool.push(row);
    }
    // QR1 (B-1204): lower a ranked quality by `by` to `floor`; a rating at or below the floor is never raised
    function reduceQuality(key, by, floor, source) {
      var n = Number(by), f = floor != null ? Math.max(0, Number(floor) || 0) : 0;
      var q = (out.qualities || []).filter(function (x) { return x && x.id === key; })[0];
      if (!q || !(n > 0) || !q.ranked || !(Number(q.rank) > 0)) return;
      var cur = Number(q.rank), next = cur > f ? Math.max(f, cur - n) : cur;
      if (next === cur) return;
      out.qualities = next > 0
        ? out.qualities.map(function (x) { return x === q ? Object.assign({}, x, { rank: next }) : x; })
        : out.qualities.filter(function (x) { return x !== q; });
      reduced.push({ key: key, by: n, from: cur, to: next, source: source });
    }
    function addQuality(key, rank) {
      var ranked = rank != null;
      var name = labels[key] || key;
      var n = ranked ? Math.max(1, Number(rank) || 1) : 1;
      out.qualities = grantOrIncrementQuality(out.qualities || [], key, { ranked: ranked, name: name, cap: null });
      for (var r = 1; r < n; r++) out.qualities = grantOrIncrementQuality(out.qualities, key, { ranked: true, name: name, cap: null });
    }
    function addEnc(v, floor0) {
      var e = (out.encumbrance || 0) + v;
      out.encumbrance = floor0 ? Math.max(0, e) : e;
    }
    // ONE range step for the base range_mod and the range_delta option (R-B1189-2): one band per step, clamped
    function stepRange(v) {
      var at = RANGE_BANDS.indexOf(String(out.range || '').toLowerCase());
      if (at >= 0 && isFinite(v)) out.range = RANGE_BANDS[Math.max(0, Math.min(RANGE_BANDS.length - 1, at + v))];
    }

    var resolved = [];
    for (var r0 = 0; r0 < list.length; r0++) {
      var a0 = pcResolveAttachment(list[r0], attachmentRegistry);
      if (!a0) { unresolved++; continue; }
      resolved.push({ entry: list[r0], att: a0 });
    }
    // PASS 1 — SETS (R-B1189-1): every damage_set / crit_set replaces the base before any adjustment reads it
    if (weapon) {
      var damageSets = 0, critSets = 0;
      resolved.forEach(function (x) {
        if (x.att.damage_set != null) { out.damage = { value: x.att.damage_set, base: 'flat' }; damageSets++; }
        if (x.att.crit_set != null) { out.crit = x.att.crit_set; critSets++; }
      });
      // the HOST's printed crystal modifier, after the set (R-B1189-7: shoto, guard shoto, lightfoil, sabercane −1;
      // broadsaber, great lightsaber +1 — "reduce/increase the damage of that lightsaber crystal by 1")
      if (damageSets && rec.crystal_damage_mod) out.damage.value += rec.crystal_damage_mod;
      if (damageSets > 1 || critSets > 1) out._attachmentSetConflicts = 1;   // RAW allows one crystal per hilt (R-B1189-1); the later wins
      // the HOST's printed crystal comes out before the new one goes in (R-B11FU-5; FaD p.196: one crystal per lightsaber, and
      // a removed crystal's qualities are lost): its qualities_add off the record — a ranked quality loses that rank and goes
      // at 0, an unranked one goes. Its qualities_remove is not reversed, nor its options: the printed host is "unmodded".
      var def = (damageSets && rec.crystal_default) ? pcResolveAttachment(rec.crystal_default, attachmentRegistry) : null;
      if (def) (def.qualities_add || []).forEach(function (qa) {
        if (!qa || !qa.key) return;
        var q = out.qualities.filter(function (x) { return x.id === qa.key; })[0];
        if (!q) return;
        var left = (q.ranked && qa.rank != null) ? (Number(q.rank) || 0) - Math.max(1, Number(qa.rank) || 1) : 0;
        out.qualities = left > 0
          ? out.qualities.map(function (x) { return x === q ? Object.assign({}, x, { rank: left }) : x; })
          : out.qualities.filter(function (x) { return x !== q; });
      });
      // an attachment printed to REPLACE the item's qualities clears them; PASS 2 then adds its own (R-B11FU-6: the krayt
      // dragon pearl, FaD p.198: the saber's qualities become Breach 1, Sunder and Vicious 1)
      if (resolved.some(function (x) { return x.att.qualities_replace === true; })) out.qualities = [];
    }

    // PASS 2 — ADJUSTMENTS, in installation order
    for (var i = 0; i < resolved.length; i++) {
      var entry = resolved[i].entry;
      var att = resolved[i].att;
      // BASE fields
      if (weapon) {
        if (att.damage_mod != null && out.damage) out.damage.value = (out.damage.value || 0) + att.damage_mod;
        if (att.crit_mod != null && out.crit > 0) out.crit = Math.max(1, out.crit + att.crit_mod);   // R-B1185-16: floor 1; no rating stays none (R-B11FU-1)
        if (att.range_mod != null) stepRange(Number(att.range_mod));                                     // R-B1189-2
        (att.qualities_add || []).forEach(function (qa) { if (qa && qa.key) addQuality(qa.key, qa.rank); });
        (att.qualities_reduce || []).forEach(function (qr) {                                              // B-1204 (QR1), LIVE
          if (!qr || !qr.key) return;
          if (qr.condition) offers.push({ key: qr.key, by: Number(qr.by) || 0, condition: qr.condition, source: att.name, cite: qr.cite || null });
          else reduceQuality(qr.key, qr.by, qr.floor, att.name);
        });
      } else if (kind === 'armor') {
        // B-1297 (R-SPF-3 (a)): an armour attachment's granted qualities reach the armour, as a weapon's do (Superior Armor
        // Customization "gives the armor the Superior Quality", EotE p.195); their armour NUMBERS are the quality's own, applied
        // once after every attachment (applyQualityArmorEffects), never here
        // — an ARMOUR attachment's only (cortosis_weave, superior_armor_customization): a weapon attachment resolved onto an
        // armour host grants it nothing
        if (att.type === 'armor') (att.qualities_add || []).forEach(function (qa) { if (qa && qa.key) addQuality(qa.key, qa.rank); });
        if (att.soak_mod != null) out.soak = (out.soak || 0) + att.soak_mod;
        if (att.defense_melee_mod != null) sideDelta.melee += att.defense_melee_mod;
        if (att.defense_ranged_mod != null) sideDelta.ranged += att.defense_ranged_mod;
      }
      if (att.encumbrance_mod != null) addEnc(att.encumbrance_mod, false);
      if (att.encumbrance_threshold_bonus) carry.push({ name: att.name, bonus: Number(att.encumbrance_threshold_bonus) || 0 });
      // SELECTED options, in index order
      var inst = _installedOptions(entry, att), picked = inst.picked;                        // R-R5A-1 C1: capped
      skipped += inst.skipped;
      picked.sort(function (a, b) { return a.at - b.at; });
      if (modelled) {
        var pickedAt = picked.map(function (p) { return p.at; });
        var ownSlot = _bookTextRemoved() && att.id != null;   // S3 (R-AE-7): holocron's rows keep their exact shape
        (Array.isArray(att.pool_mods) ? att.pool_mods : []).forEach(function (pm, j) {             // R1
          if (!pm) return;
          var src = pm.from || {}, slot = ownSlot ? ['item:attachments:' + att.id, 'pool_mods[' + j + ']'] : null;
          if (src.channel !== 'added_mods') { carryPoolRow(pm, slot); return; }
          // R-R5A-1: once per INSTALL of its option (the option's rows are one install's)
          pickedAt.forEach(function (at) { if (at === src.index) carryPoolRow(pm, slot); });
        });
        var grants = (Array.isArray(att.base_mods) ? att.base_mods : []).concat(picked.map(function (p) { return p.m; }));
        grants.forEach(function (m) {                                                            // MV2
          var g = m && !m.never_modelled && m.effect;
          if (g && g.type === 'talent_grant' && g.talent) innate.push({ talent: g.talent, ranks: 1, source: att.name });
        });
        // MV3: the record's `character_effects` (the base lines), then each SELECTED option's line effect
        (Array.isArray(att.character_effects) ? att.character_effects : []).forEach(function (ce) {
          if (ce && ce.op) charFx.push({ op: ce.op, key: ce.key, value: Number(ce.value) || 0, source: att.name, attachment: att.id || null });
        });
        picked.forEach(function (p) {
          var ce = !p.m.never_modelled && p.m.effect;
          if (ce && ce.type === 'item_character_effect' && ce.op) charFx.push({ op: ce.op, key: ce.key, value: Number(ce.value) || 0, source: att.name, attachment: att.id || null });
        });
      }
      picked.forEach(function (p) {
        var fx = p.m.effect;
        if (!fx || p.m.never_modelled || !(OPTION_APPLIED[fx.type] || (OPTION_DARK[fx.type] && modelled))) return;
        var v = Number(fx.value);
        if (fx.type === 'quality_add') { if (fx.key) addQuality(fx.key, fx.rank); }
        else if (fx.type === 'qualities_reduce') { if (weapon && fx.key) reduceQuality(fx.key, v, null, att.name); }
        else if (fx.type === 'damage_delta') { if (weapon && out.damage && isFinite(v)) out.damage.value = (out.damage.value || 0) + v; }
        else if (fx.type === 'crit_delta') { if (weapon && out.crit > 0 && isFinite(v)) out.crit = Math.max(1, out.crit + v); }
        else if (fx.type === 'encumbrance_delta') { if (isFinite(v)) { if (fx.floor != null) out.encumbrance = _floored(out.encumbrance || 0, v, fx.floor); else addEnc(v, true); } }
        else if (fx.type === 'hands_set') { if (weapon && HANDS[fx.value]) out.hands = fx.value; }
        else if (fx.type === 'hard_points_delta') { if (isFinite(v)) out.hardpoints = (out.hardpoints || 0) + v; }
        else if (fx.type === 'quality_grant') {
          if (fx.key) out.qualities = grantOrIncrementQuality(out.qualities || [], fx.key, { ranked: !!fx.ranked, name: labels[fx.key] || fx.key,
            cap: fx.cap, by: fx.by, start: fx.start, if_present: fx.if_present, replaces: fx.replaces });
        }
        else if (fx.type === 'range_delta') { if (weapon) stepRange(v); }
        else if (fx.type === 'defense_delta') {
          if (kind !== 'armor' || !isFinite(v)) return;
          if (fx.subtype === 'melee' || fx.subtype === 'ranged') sideDelta[fx.subtype] += v;
          else out.defense = (out.defense || 0) + v;
        }
        else if (fx.type === 'soak_delta') { if (kind === 'armor' && isFinite(v)) out.soak = (out.soak || 0) + v; }
        else if (fx.type === 'spend_cost_delta') { if (weapon && fx.key && isFinite(v)) spendDeltas.push({ key: fx.key, value: v, source: att.name }); }
      });
      // removals, after every addition of this attachment. The training emitter's unprinted Breach/Sunder removal STAYS
      // (R-B11FU-5 Q3): redundant on a defaulted host, it is the only thing that takes a silent host's baked-in crystal off.
      (att.qualities_remove || []).forEach(function (id) {
        if (out.qualities) out.qualities = out.qualities.filter(function (q) { return q.id !== id; });
      });
    }

    if (kind === 'armor' && (sideDelta.melee || sideDelta.ranged || rec.defense_melee != null || rec.defense_ranged != null)) {
      var general = (out.defense || 0) - (rec.defense || 0);   // a `general` option raised both sides with the defence
      ['melee', 'ranged'].forEach(function (side) {
        var own = rec['defense_' + side] != null ? rec['defense_' + side] : (rec.defense || 0);
        out['defense_' + side] = own + general + sideDelta[side];
      });
    }
    if (skipped) out._attachmentModsSkipped = skipped;
    if (unresolved) out._attachmentsUnresolved = unresolved;
    if (carry.length) out._attachmentCarry = carry;
    if (reduced.length) out._qualitiesReduced = reduced;
    if (offers.length) out._qualityOffers = offers;
    if (carriedPool.length) out.pool_mods = (Array.isArray(rec.pool_mods) ? rec.pool_mods : []).concat(carriedPool);
    if (unanchored) out._poolModsUnanchored = unanchored;
    if (innate.length) out._innateTalents = innate;
    if (charFx.length) out._characterEffects = charFx;
    if (spendDeltas.length) out._spendCostDeltas = spendDeltas;
    return kind === 'armor' ? applyQualityArmorEffects(out, opts) : out;
  }

  // ── R-SPF-3 (b) (`f100-surfacing-preflip-species-card`, B-1297): A QUALITY'S ARMOUR NUMBERS, ONE READER ──────────────
  // A quality's `armor_effects` (quality.schema.json; Superior: soak +1, encumbrance −1, EotE p.157) apply to an ARMOUR
  // that carries it, ONCE, after every attachment — so a quality an attachment granted and a quality the armour carries
  // itself give the same numbers. Per quality present, never per rank (Superior is a state, not a rating). The weapon
  // clause (Superior's `pool_mods` row, damage +1) is the weapon path's and never reaches here. `opts.qualityArmorEffects`
  // ({id: [effect]}) when the caller holds one, else read off the vocabulary the host holds (window._qualitiesDb).
  // Encumbrance floors at 0. Marks `_qualityArmorEffects` [{quality, type, value}] so a surface can say why.
  var _qaSrc = null, _qaMap = {};
  function qualityArmorEffectsOf(db) {
    if (!db || typeof db !== 'object') return {};
    if (db === _qaSrc) return _qaMap;
    var m = {};
    Object.keys(db).forEach(function (k) { var q = db[k]; if (q && q.id && Array.isArray(q.armor_effects) && !m[q.id]) m[q.id] = q.armor_effects; });
    _qaSrc = db; _qaMap = m;
    return m;
  }
  function applyQualityArmorEffects(out, opts) {
    var fx = (opts && opts.qualityArmorEffects) || qualityArmorEffectsOf(root && root._qualitiesDb);
    var seen = {}, applied = [];
    (Array.isArray(out.qualities) ? out.qualities : []).forEach(function (q) {
      var id = q && typeof q === 'object' ? q.id : q;
      if (!id || seen[id] || !Object.prototype.hasOwnProperty.call(fx, id)) return;
      seen[id] = true;
      fx[id].forEach(function (e) {
        var v = Number(e && e.value);
        if (!isFinite(v) || !v) return;
        if (e.type === 'soak_delta') out.soak = (out.soak || 0) + v;
        else if (e.type === 'encumbrance_delta') out.encumbrance = Math.max(0, (out.encumbrance || 0) + v);
        else return;
        applied.push({ quality: id, type: e.type, value: v });
      });
    });
    if (applied.length) out._qualityArmorEffects = applied;
    return out;
  }

  // {id: label} from the qualities vocabulary as a host holds it (window._qualitiesDb: entries keyed by label and alias,
  // lower-cased). Memoized on the db's identity; → {} before the vocabulary lands (a granted quality then reads its id).
  var _qlSrc = null, _qlMap = {};
  function qualityLabelsOf(db) {
    if (!db || typeof db !== 'object') return {};
    if (db === _qlSrc) return _qlMap;
    var m = {};
    Object.keys(db).forEach(function (k) { var q = db[k]; if (q && q.id && q.label && !m[q.id]) m[q.id] = q.label; });
    _qlSrc = db; _qlMap = m;
    return m;
  }

  // THE OLD APPLIERS, now thin wrappers over the one path (R-B1185-1): same inputs, the shapes they always returned.
  function applyWeaponAttachmentMods(canonWeapon, installedAttachments, attachmentRegistry) {
    var r = applyInstalledAttachments('weapon', canonWeapon, installedAttachments, attachmentRegistry);
    var out = { damage: { value: r.damage.value, base: r.damage.base }, crit: r.crit, qualities: r.qualities || [], encumbrance: r.encumbrance };
    if (r._attachmentsUnresolved) out.unresolved = r._attachmentsUnresolved;
    return out;
  }
  function applyArmorAttachmentMods(canonArmor, installedAttachments, attachmentRegistry) {
    var r = applyInstalledAttachments('armor', canonArmor, installedAttachments, attachmentRegistry);
    var out = { soak: r.soak || 0, defense_melee: r.defense_melee != null ? r.defense_melee : (r.defense || 0),
      defense_ranged: r.defense_ranged != null ? r.defense_ranged : (r.defense || 0), encumbrance: r.encumbrance };
    if (r._attachmentsUnresolved) out.unresolved = r._attachmentsUnresolved;
    return out;
  }

  // ── F-100 M8 C7 · THE CHARACTER'S CHANNEL INTO AN ITEM (ruling `f100-m8-contracts` R-M8K-7; `f100-m8-build` R-M8G-16) ──
  // applyCharacterEffects(display, effects) → the same display object, with each effect PROJECTED onto the resolved
  // DISPLAY entry it names. `display` is resolveSheetEquipment's output ({weapons[], armor, gear[]}); `effects` are
  // CharResolve.ownedItemEffects' rows ({section, index, op, amount, source}). The record is NEVER written: the target is
  // replaced by a shallow COPY before it changes (a legacy passthrough display IS the saved entry). A missing or
  // unresolved target is skipped (a lost item fails the pick closed). Each change is listed on the copy's
  // `_talentEffects` ({op, amount, source, talent, from, to[, target]}). Ops (R-F100-9: a member enters with its user):
  //   hard_points_delta — the item's hard points (`hp`, the capacity pcHardpointAccounting reads); none printed = 0.
  //   Jury Rigged's four (f100-m8-contracts ADDENDUM 3 A3.3, ruled by ADDENDUM 6 R-M8K-35..39; EotE p.138):
  //   damage_delta      — a weapon's `damage`: the display string "+N" (Brawn-based) becomes "+(N+amount)", a number N
  //                       becomes N+amount, so every reader of the display reads it unchanged. Weapons only.
  //   crit_delta        — a weapon's `crit`, floor f: crit > f ? max(f, crit + amount) : crit. No printed crit (null, 0)
  //                       is skipped. Weapons only.
  //   encumbrance_delta — any item's `encumbrance` (the RATING), floor f, the same rule: an item at or below the floor is
  //                       never raised. Worn armour's −3 stays in CharResolve.computeEncumbrance, after this (JR-5).
  //   defense_delta     — the armour's `defense_<target>` = (defense_<target> ?? defense ?? 0) + amount; the other side is
  //                       left as it was (R-M8K-39 (P): the armour's own provided defence, per side). Armour only.
  //   qualities_reduce  — F-100 M12 B-1204 (QR1; f100-m12-build-card ADDENDUM 14 R-M12B-40/41): a weapon's ranked quality
  //                       `key` on `_qualitiesRaw` (and its display string) lowered by `amount`, floor f by the same rule —
  //                       a weapon WITHOUT the quality gains nothing, a rating at or below the floor is never raised (Burly,
  //                       Dangerous Covenants p.32: Cumbersome by ranks, to a minimum of 1). Weapons only.
  //   F-100 M12 (f100-m12-build-card ADDENDUM 22; the qualities paper), both reached only through CharResolve.ownedItemEffects'
  //   newly MODELLED arms (R-M12F-8):
  //   quality_grant     — QG1: a weapon's quality `key` granted at `amount` or raised by it (grantOrIncrementQuality's
  //                       `by`, R-M12C-60), on `_qualitiesRaw` and its display string; `mode: raise_only` touches only a
  //                       weapon that already carries the quality rated (Powerful Blast; a Blast-less micro-rocket is
  //                       untouched by construction, R-M12B-68). An unrated grant (Cortosis, Sunder) is a bare grant.
  //   spend_effect_set  — QS3: listed on `_spendEffectSets` ({key, field, amount, source}) for SWRPGQualityRows.spendRows;
  //                       nothing on the profile moves (Sunder (Improved): Sunder's {steps} = 2).
  //   A row carrying `kind` (QK1) applies only to an entry of that kind: its `skillKey` among `skills`, its `_categories`
  //   holding one of `categories_any` and none of `categories_none`. `marked_by` is drawn, not read: a row naming it gives
  //   nothing (fail closed). `attest` is the pick's own, never a test here. `improvised` (ruling f100-surfacing-sheet-concept
  //   ADDENDUM 10 C2 (a), D-215) is the PLAYER's mark: the entry must carry `improvised === true` (the sheet's tick, R-SSC-5);
  //   an entry without it fails closed (Creative Killer, AoR p.145).
  // `in_use` (R-M8K-38): the row applies only while the entry is in use — a weapon or gear entry not `stowed`, the armour
  // slot only `worn`; otherwise nothing changes (the mark is kept by the record). A change that leaves the number as it
  // was is not listed.
  function _kindFits(cur, kind) {
    if (!kind || typeof kind !== 'object') return true;
    if (kind.marked_by) return false;
    if (kind.improvised === true && cur.improvised !== true) return false;
    var cats = Array.isArray(cur._categories) ? cur._categories : [];
    if (Array.isArray(kind.skills) && kind.skills.indexOf(cur.skillKey) === -1) return false;
    if (Array.isArray(kind.categories_any) && !kind.categories_any.some(function (c) { return cats.indexOf(c) !== -1; })) return false;
    if (Array.isArray(kind.categories_none) && kind.categories_none.some(function (c) { return cats.indexOf(c) !== -1; })) return false;
    return true;
  }
  function _qLabel(q) { return q.ranked && q.rank ? q.name + ' ' + q.rank : q.name; }
  function _inUse(section, cur) {
    var st = cur.state || (section === 'armor' && cur.worn ? 'worn' : 'carried');
    return section === 'armor' ? st === 'worn' : st !== 'stowed';
  }
  function _floored(v, amt, f) {
    return f != null && isFinite(Number(f)) ? (v > f ? Math.max(Number(f), v + amt) : v) : v + amt;
  }
  function applyCharacterEffects(display, effects) {
    if (!display || !Array.isArray(effects)) return display;
    effects.forEach(function (fx) {
      if (!fx) return;
      var cur = fx.section === 'armor' ? (fx.index === 0 ? display.armor : null)
        : Array.isArray(display[fx.section]) ? display[fx.section][fx.index] : null;
      if (!cur || typeof cur !== 'object' || cur._unresolved) return;
      var amt = Number(fx.amount);
      if (!isFinite(amt)) return;
      if (fx.in_use === true && !_inUse(fx.section, cur)) return;
      if (fx.kind && !_kindFits(cur, fx.kind)) return;
      var key, from, to, extra = null;
      if (fx.op === 'quality_grant') {
        if (fx.section !== 'weapons' || !fx.key) return;
        var rawG = Array.isArray(cur._qualitiesRaw) ? cur._qualitiesRaw : [];
        var had = rawG.filter(function (q) { return q && q.id === fx.key; })[0] || null;
        if (fx.mode === 'raise_only' && !(had && had.ranked && Number(had.rank) > 0)) return;
        if (fx.ranked && !(amt >= 1)) return;
        var labels = qualityLabelsOf(root && root._qualitiesDb);
        var gname = had ? had.name : (labels[fx.key] || fx.key);
        var rawN = grantOrIncrementQuality(rawG, fx.key, fx.ranked ? { ranked: true, name: gname, by: amt } : { ranked: false, name: gname });
        var now = rawN.filter(function (q) { return q && q.id === fx.key; })[0];
        if (had && JSON.stringify(had) === JSON.stringify(now)) return;
        var cg = Object.assign({}, cur);
        cg._qualitiesRaw = rawN;
        var shown = Array.isArray(cur.qualities) ? cur.qualities.slice() : [];
        var at = had ? shown.indexOf(_qLabel(had)) : -1;
        if (at !== -1) shown[at] = _qLabel(now); else shown.push(_qLabel(now));
        cg.qualities = shown;
        cg._talentEffects = (Array.isArray(cur._talentEffects) ? cur._talentEffects : [])
          .concat([{ op: fx.op, key: fx.key, amount: amt, source: fx.source, talent: fx.talent, from: had ? (had.ranked ? Number(had.rank) : true) : null, to: now.ranked ? Number(now.rank) : true }]);
        display.weapons[fx.index] = cg;
        return;
      }
      if (fx.op === 'spend_effect_set') {
        if (fx.section !== 'weapons' || !fx.key || !fx.field) return;
        var cs = Object.assign({}, cur);
        cs._spendEffectSets = (Array.isArray(cur._spendEffectSets) ? cur._spendEffectSets : [])
          .concat([{ key: fx.key, field: fx.field, amount: amt, source: fx.source, talent: fx.talent }]);
        display.weapons[fx.index] = cs;
        return;
      }
      if (fx.op === 'qualities_reduce') {
        var raw0 = Array.isArray(cur._qualitiesRaw) ? cur._qualitiesRaw : null;
        var qi = raw0 ? raw0.map(function (q) { return q && q.id; }).indexOf(fx.key) : -1;
        if (fx.section !== 'weapons' || qi < 0 || !raw0[qi].ranked || !(Number(raw0[qi].rank) > 0)) return;
        var q0 = raw0[qi], r0 = Number(q0.rank), r1 = _floored(r0, -amt, fx.floor);
        if (r1 === r0) return;
        var cq = Object.assign({}, cur);
        var oldLabel = q0.name + ' ' + r0;
        cq._qualitiesRaw = r1 > 0 ? raw0.map(function (q, k) { return k === qi ? Object.assign({}, q, { rank: r1 }) : q; })
          : raw0.filter(function (q, k) { return k !== qi; });
        if (Array.isArray(cur.qualities)) {
          cq.qualities = r1 > 0 ? cur.qualities.map(function (t) { return t === oldLabel ? q0.name + ' ' + r1 : t; })
            : cur.qualities.filter(function (t) { return t !== oldLabel; });
        }
        cq._talentEffects = (Array.isArray(cur._talentEffects) ? cur._talentEffects : [])
          .concat([{ op: fx.op, key: fx.key, amount: amt, source: fx.source, talent: fx.talent, from: r0, to: r1 }]);
        display.weapons[fx.index] = cq;
        return;
      }
      if (fx.op === 'hard_points_delta') {
        key = 'hp'; from = Number(cur.hp) || 0; to = from + amt;
      } else if (fx.op === 'damage_delta') {
        if (fx.section !== 'weapons') return;
        var raw = cur.damage, dt = damageTextValue(raw), n = dt.value;
        if (raw == null || raw === '' || n == null) return;
        key = 'damage'; from = raw; to = dt.base === 'brawn' ? brawnDamageText(n + amt) : n + amt;
      } else if (fx.op === 'crit_delta') {
        var c = Number(cur.crit);
        if (fx.section !== 'weapons' || cur.crit == null || cur.crit === '' || !isFinite(c) || c <= 0) return;
        key = 'crit'; from = c; to = _floored(c, amt, fx.floor);
      } else if (fx.op === 'encumbrance_delta') {
        var e = Number(cur.encumbrance);
        if (cur.encumbrance == null || cur.encumbrance === '' || !isFinite(e)) return;
        key = 'encumbrance'; from = e; to = _floored(e, amt, fx.floor);
      } else if (fx.op === 'defense_delta') {
        if (fx.section !== 'armor' || (fx.target !== 'melee' && fx.target !== 'ranged')) return;
        key = 'defense_' + fx.target;
        from = cur[key] != null ? Number(cur[key]) || 0 : Number(cur.defense) || 0; to = from + amt;
        extra = { target: fx.target };
      } else return;
      if (to === from) return;
      var copy = Object.assign({}, cur);
      copy._talentEffects = (Array.isArray(cur._talentEffects) ? cur._talentEffects : [])
        .concat([Object.assign({ op: fx.op, amount: amt, source: fx.source, talent: fx.talent, from: from, to: to }, extra)]);
      copy[key] = to;
      if (fx.section === 'armor') display.armor = copy; else display[fx.section][fx.index] = copy;
    });
    return display;
  }

  // ── A CYBERNETIC IMPLANT'S OWN LINES (ruling release-r6-companions-d365 ADDENDUM 2 R-R6CD-8; D-378) ───────────────────
  // A `type: "Cybernetics"` gear record's `character_effects` (gear.schema.json, `$defs/cybernetic_effect`, page-cited by
  // scripts/canonical/apply_cybernetic_effects.py) as the resolved item's `_characterEffects` rows — the shape the MV3
  // attachment rows take, owner-named as the implant (`source` its name, `attachment` null) and marked `implant: true`, which
  // CharResolve's cybernetic cap reads (R-R6CD-4). All nine ops ride the row; only the four item ops have a player consumer
  // (the five droid ops are companions.js droidOf's). Any other record, or none → []. Pure: the record is not written.
  function implantEffectLines(rec) {
    if (!rec || rec.type !== 'Cybernetics' || !Array.isArray(rec.character_effects)) return [];
    return rec.character_effects.filter(function (ce) { return ce && ce.op; }).map(function (ce) {
      return { op: ce.op, key: ce.key, value: Number(ce.value) || 0, source: rec.name || null, attachment: null, implant: true };
    });
  }

  var api = {
    MELEE_SKILLS: MELEE_SKILLS,
    brawnOf: brawnOf,
    resolveWeapon: resolveWeapon,
    weaponDamage: weaponDamage,
    weaponForDisplay: weaponForDisplay,
    critText: critText,
    brawnDamageText: brawnDamageText,
    damageTextValue: damageTextValue,
    pcResolveEntry: pcResolveEntry,
    isCanonicalEntry: isCanonicalEntry,
    isArmorRecord: isArmorRecord,
    grantOrIncrementQuality: grantOrIncrementQuality,
    resolveAttachment: resolveAttachment,
    pcResolveAttachment: pcResolveAttachment,
    pcHardpointAccounting: pcHardpointAccounting,
    hardpointAccounting: hardpointAccounting,
    attachmentFit: attachmentFit,
    writeAttachment: writeAttachment,   // B-1403 R-B1403-7: the one attachments[] writer
    optionInstallCap: optionInstallCap,   // ruling release-r5-f1 C1: an option's printed install count, the one cap rule
    applyWeaponAttachmentMods: applyWeaponAttachmentMods,
    applyArmorAttachmentMods: applyArmorAttachmentMods,
    applyQualityArmorEffects: applyQualityArmorEffects, qualityArmorEffectsOf: qualityArmorEffectsOf,   // R-SPF-3 (b)
    applyInstalledAttachments: applyInstalledAttachments,
    implantEffectLines: implantEffectLines,   // release-r6-companions-d365 R-R6CD-8
    qualityLabelsOf: qualityLabelsOf,
    applyCharacterEffects: applyCharacterEffects,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof root !== 'undefined') root.ItemResolve = api;
})(typeof window !== 'undefined' ? window : this);
