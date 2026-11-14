/*
 * lib/items.js — Shared item data layer for player.html and gm.html.
 *
 * Oggdude raw data uses coded fields (RangeValue: "wrShort", SkillKey: "RANGLT",
 * Qualities: [{Key:'ACCURATE',Count:2}]). Consumers need display-ready strings.
 * This module translates oggdude raw → a flat "display shape" item that every
 * UI (NPC cards, character sheet, creator, session store) can render without
 * further lookups.
 *
 * Exposes `window.SWItems` with:
 *   - Translation maps: RANGE_LABELS, SKILL_KEY_TO_NAME, QUALITY_NAMES, GEAR_CATEGORIES
 *   - init(rawOggdude): populate runtime skill map from raw.skills.items
 *   - formatQualities(raw): oggdude quality array → flat display strings
 *   - normalizeWeapon / normalizeArmor / normalizeGear: section-specific shapers
 *   - routeSection(raw, categoryHint): 'weapons' | 'armor' | 'gear' routing
 *   - normalizeForStore(raw, section): dispatcher used by the session store
 *   - cleanMarkup(text): strip oggdude tag markup
 */
(function (global) {
  'use strict';

  // ── Range codes (weapon and sensor/ship range) ─────────────────────────
  var RANGE_LABELS = {
    wrEngaged: 'Engaged', wrClose: 'Close', wrShort: 'Short',
    wrMedium: 'Medium',   wrLong: 'Long',   wrExtreme: 'Extreme',
    srClose: 'Close',     srShort: 'Short', srMedium: 'Medium',
    srLong: 'Long',       srExtreme: 'Extreme',
  };

  // ── Canonical range_ref → display label ─────────────────────────────────
  // Canonical weapon.range is a lowercase ref ('short'); the legacy display
  // shape wants 'Short'. (Distinct from RANGE_LABELS, which decodes the raw
  // OggDude wr*/sr* codes.)
  var RANGE_REF_LABELS = {
    engaged: 'Engaged', close: 'Close', short: 'Short',
    medium: 'Medium', long: 'Long', extreme: 'Extreme',
  };

  // ── Canonical skill_ref → display label ─────────────────────────────────
  // Weapons only ever use these eight refs; anything else falls back to a
  // titlecased form so a future non-combat item still renders sanely. Static
  // (not runtimeSkillMap) so the shop shaper is independent of init() order.
  var SKILL_REF_TO_NAME = {
    ranged_light: 'Ranged (Light)', ranged_heavy: 'Ranged (Heavy)',
    gunnery: 'Gunnery', melee: 'Melee', lightsaber: 'Lightsaber',
    mechanics: 'Mechanics', brawl: 'Brawl', skulduggery: 'Skulduggery',
    // B-865 (A15, ruling npc-library-paper-concept R-NPC-8): the two skills the title-cased fallback
    // gets wrong against the skills vocab — measured over the registry, 291 of 8,954 skill uses.
    piloting_planetary: 'Piloting (Planetary)', piloting_space: 'Piloting (Space)',
  };

  // ── Weapon quality name canonicalization ───────────────────────────────
  // Oggdude stores quality identifiers as UPPERCASE keys with inconsistent
  // spelling (INACURATE vs INACCURATE, STUNDAMAGE vs STUN DAMAGE). Map
  // everything to a single display form.
  var QUALITY_NAMES = {
    ACCURATE: 'Accurate', AUTOFIRE: 'Auto-fire', BLAST: 'Blast', BREACH: 'Breach',
    BURN: 'Burn', CONCUSSIVE: 'Concussive', CORTOSIS: 'Cortosis',
    CUMBERSOME: 'Cumbersome', DEFENSIVE: 'Defensive', DEFLECTION: 'Deflection',
    DISORIENT: 'Disorient', ENSNARE: 'Ensnare', GUIDED: 'Guided',
    INACCURATE: 'Inaccurate', INACURATE: 'Inaccurate', INFERIOR: 'Inferior',
    ION: 'Ion', KNOCKDOWN: 'Knockdown', LIMITEDAMMO: 'Limited Ammo',
    LINKED: 'Linked', PIERCE: 'Pierce', PREPARE: 'Prepare',
    SLOWFIRING: 'Slow-Firing', STUN: 'Stun', STUNDAMAGE: 'Stun Damage',
    STUNDAMAGEDROID: 'Stun Damage (Droids)', STUNSETTING: 'Stun Setting',
    SUNDER: 'Sunder', SUPERIOR: 'Superior', TRACTOR: 'Tractor',
    UNWIELDY: 'Unwieldy', VICIOUS: 'Vicious', VICIOUSDROID: 'Vicious (Droids)',
  };

  // ── Skill key fallback map ─────────────────────────────────────────────
  // Used when init() hasn't been called yet or a weapon references a skill
  // missing from raw.skills.items. Runtime map built from oggdude replaces
  // this at init time.
  var SKILL_KEY_TO_NAME = {
    ASTRO: 'Astrogation', ATHL: 'Athletics', BRAWL: 'Brawl', CHARM: 'Charm',
    COERC: 'Coercion', COMP: 'Computers', COOL: 'Cool', COORD: 'Coordination',
    DECEP: 'Deception', DISC: 'Discipline', GUNN: 'Gunnery',
    KNOWCORE: 'Core Worlds', KNOWED: 'Education', KNOWLORE: 'Lore',
    KNOWOUT: 'Outer Rim', KNOWUND: 'Underworld', KNOWWARF: 'Warfare',
    KNOWXENO: 'Xenology', LEAD: 'Leadership', LTSAB: 'Lightsaber',
    MECH: 'Mechanics', MED: 'Medicine', MELEE: 'Melee', NEGOT: 'Negotiation',
    PERCEP: 'Perception', PILPLAN: 'Piloting (Planetary)',
    PILSP: 'Piloting (Space)', RANGHVY: 'Ranged (Heavy)',
    RANGLT: 'Ranged (Light)', RESIL: 'Resilience', SKULL: 'Skulduggery',
    STEAL: 'Stealth', STREET: 'Streetwise', SURV: 'Survival',
    VIGIL: 'Vigilance',
  };

  // Runtime-populated map (larger scope if raw.skills.items includes keys
  // missing from the static map).
  var runtimeSkillMap = Object.assign({}, SKILL_KEY_TO_NAME);

  // ── Gear categorization ────────────────────────────────────────────────
  // Shared with FCGearBrowser. Order matters (first match wins for routing).
  var GEAR_CATEGORIES = [
    { id: 'blasters',    label: 'Blasters',    section: 'weapons', matchType: ['Energy Weapon'] },
    { id: 'melee',       label: 'Melee',       section: 'weapons', matchType: ['Melee', 'Brawling', 'Lightsaber', 'Lightwhip'] },
    { id: 'explosives',  label: 'Explosives',  section: 'weapons', matchType: ['Explosives/Other', 'Thrown'] },
    { id: 'slugthrowers',label: 'Slugs',       section: 'weapons', matchType: ['Slugthrower'] },
    { id: 'armor',       label: 'Armor',       section: 'armor',   matchType: null },
    { id: 'survival',    label: 'Survival',    section: 'gear',    matchType: ['Survival'] },
    { id: 'medical',     label: 'Medical',     section: 'gear',    matchType: ['Medical'] },
    { id: 'tools',       label: 'Tools',       section: 'gear',    matchType: ['Tools/Electronics', 'Construction/Salvage Tools', 'Slicing Tools'] },
    { id: 'comms',       label: 'Comms',       section: 'gear',    matchType: ['Communications', 'Detection/Surveillance Devices'] },
    { id: 'security',    label: 'Security',    section: 'gear',    matchType: ['Security/Espionage'] },
    { id: 'storage',     label: 'Storage',     section: 'gear',    matchType: ['Carrying/Storage'] },
    { id: 'consumables', label: 'Consumables', section: 'gear',    matchType: ['Drugs and Consumables', 'Reloads/Ammo'] },
  ];

  // Canonicalize a raw oggdude skill name into the form used across the UI
  // and shipped pregens. Oggdude ships "Ranged - Light", "Piloting - Space",
  // "Knowledge - Core Worlds". UI + pregens expect "Ranged (Light)" etc.
  function canonicalizeSkillName(name) {
    if (!name) return name;
    // "Foo - Bar" → "Foo (Bar)"
    var m = /^([^-]+?)\s+-\s+(.+)$/.exec(name);
    if (m) {
      var lead = m[1].trim();
      var tail = m[2].trim();
      // Strip "Knowledge" prefix — pregens use the bare qualifier ("Core
      // Worlds", "Outer Rim") not "Knowledge (Core Worlds)".
      if (lead.toLowerCase() === 'knowledge') return tail;
      return lead + ' (' + tail + ')';
    }
    return name;
  }

  // ── Initialization ─────────────────────────────────────────────────────
  // Extend the skill map from oggdude's raw.skills.items. Safe to call
  // multiple times; merges additional keys without clobbering static
  // fallbacks.
  function init(skillsVocab) {
    // blob-retirement-2: the runtime skill-name map builds from the canonical skills
    // VOCAB (id + aliases -> label) — the oggdude skills.items source is retired. The
    // vocab aliases carry both the legacy short keys (PERCEP, ...) and the blob's own
    // key spellings (PILOTPL, ...), so coverage is a superset of the old init().
    var entries = (skillsVocab && skillsVocab.entries) || [];
    entries.forEach(function (e) {
      if (!e || !e.id || !e.label) return;
      runtimeSkillMap[e.id] = e.label;
      (e.aliases || []).forEach(function (a) { runtimeSkillMap[a] = e.label; });
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────
  function toNum(v) {
    if (v == null) return null;
    if (typeof v === 'number') return v;
    var n = parseInt(v, 10);
    return isNaN(n) ? null : n;
  }

  // THE EATER — STRUCTURAL OggDude MARKUP ONLY. It must NEVER carry a `\[.*?\]` catch-all.
  //
  // R3 Q2b (ruling item-dice-glyphs-r3 §3, "ONE eater"): line 157 used to be a `\[.*?\]` catch-all
  // in a `replace`, running AFTER the structural tags and deleting every FFG dice-glyph
  // token it met. Its verbatim Python port (harness.clean_markup, now deleted) is why 2,144 item
  // rows shipped reading "adds ␣ to any check" where a Setback die belongs. The catch-all is the
  // defect; a bracket token this does not recognise is now LEFT ALONE for the drawer to resolve.
  //
  // NOTE FOR WHOEVER CALLS THIS NEXT — IT CURRENTLY HAS ZERO CALLERS. Measured this lap:
  // `git grep -F '.cleanMarkup('` returns nothing repo-wide; it is reachable only as
  // `window.SWItems.cleanMarkup`, and nothing reads that. Retiring the export is a subtraction
  // outside Q2b's ruled scope (the ruling named the catch-all, not the function), so it is flagged
  // for the architect rather than taken here. If you DO call it, pair it with the drawer
  // (`window.SWRPGUI.glyphText`) — this function eats structure, it does not draw symbols.
  function cleanMarkup(text) {
    if (!text) return '';
    return String(text)
      .replace(/\[H\d\].*?\[h\d\]\s*/gi, '')
      .replace(/\[p\]/gi, '\n')
      .replace(/\[br\]/gi, '\n')
      .replace(/\[B\](.*?)\[b\]/gi, '$1')
      // R-Y3e-2's empty-paren collapse. It was added because the catch-all above turned
      // "Average ([DI][DI]) check" into "Average () check"; with the catch-all gone that residue is
      // no longer PRODUCED here, so this pass is now only a tidier of empty parens already present
      // in source. Kept because `item_markup.strip_glyph_tokens` still replays it on the Python
      // side (a token adjudicated AWAY can still leave "()"), and the parity guard pins the pair.
      .replace(/[ \t]*\(\s*\)[ \t]*/g, ' ')
      .replace(/ +(\.(?![.\d])|[,;])/g, '$1')
      .replace(/^\s+/, '').trim();
  }

  function rangeLabel(code) {
    if (!code) return null;
    return RANGE_LABELS[code] || code;
  }

  function skillName(key) {
    if (!key) return null;
    return runtimeSkillMap[key] || key;
  }

  // Canonical skill_ref → display label (static; see SKILL_REF_TO_NAME).
  function skillRefLabel(ref) {
    if (!ref) return null;
    if (SKILL_REF_TO_NAME[ref]) return SKILL_REF_TO_NAME[ref];
    return String(ref).replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  // Format weapon qualities. Accepts oggdude's {Quality: obj|array} shape
  // OR a pre-normalized array of strings OR a comma-separated string.
  // Always returns a flat array of display strings like ["Accurate 2"].
  function formatQualities(raw) {
    if (!raw) return [];
    // Try to resolve a raw quality key or name to its display form.
    // Handles all shapes: "STUNSETTING" → "Stun Setting",
    // "stunsetting" → "Stun Setting", "Stun Setting" → "Stun Setting",
    // "Accurate 2" → "Accurate 2", "ACCURATE2" → "Accurate 2".
    function resolveQualityString(s) {
      if (!s) return s;
      // Strip trailing rank digits for the lookup key
      var base = s.replace(/\s*\d+$/, '');
      var rank = s.match(/\d+$/);
      var rankStr = rank ? ' ' + rank[0] : '';
      // Try uppercase lookup (STUNSETTING, stunsetting → STUNSETTING)
      var upper = base.toUpperCase();
      if (QUALITY_NAMES[upper]) return QUALITY_NAMES[upper] + rankStr;
      // Try as-is (already formatted like "Stun Setting")
      if (QUALITY_NAMES[base]) return QUALITY_NAMES[base] + rankStr;
      // Already a display string with spaces — return unchanged
      return s;
    }

    if (Array.isArray(raw)) {
      return raw.map(function (q) {
        if (typeof q === 'string') return resolveQualityString(q);
        // Canonical quality object {id, name, ranked, rank} (ADR 0003). Display-ready already —
        // append the rank only when ranked. (Distinct from the raw OggDude {Key, Count} shape below.)
        if (q && typeof q === 'object' && q.name && q.Key == null) {
          return q.name + (q.ranked && q.rank ? ' ' + q.rank : '');
        }
        var key = (q && q.Key) || '';
        var count = toNum(q && q.Count);
        var name = QUALITY_NAMES[key] || key;
        return name + (count != null && count > 0 ? ' ' + count : '');
      }).filter(Boolean);
    }
    if (typeof raw === 'string') {
      return raw.split(/\s*,\s*/).map(resolveQualityString).filter(Boolean);
    }
    if (raw.Quality) {
      var arr = raw.Quality;
      if (!Array.isArray(arr)) arr = [arr];
      return formatQualities(arr);
    }
    return [];
  }

  // NOTE: the raw-OggDude display shapers (normalizeWeapon / normalizeArmor / normalizeGear /
  // routeSection / normalizeForStore) were RETIRED in the items cluster (ADR 0003): they had zero
  // live call sites once the shop fed from canonical (sub-step 2 -> canonicalToStore) and PC
  // equipment moved to canonical id-refs (sub-step 3). The GM weapon-reference browser still uses
  // rangeLabel/skillName/formatQualities directly (a later cluster). cleanMarkup/rangeLabel/
  // skillName are retained as utilities.

  // Canonical registry record (weapon/armor/gear, ADR 0003) → the same
  // display "store shape" normalizeForStore produces from raw OggDude. The
  // shop now feeds from canonical, but the persisted curatedItems contract +
  // the GM/Player render sites are UNCHANGED — this shapes to that contract.
  // the shared item core, read at call time (this file loads before it in both hosts)
  function itemResolveCore() {
    return global.ItemResolve || (typeof require === 'function' ? require('./shared/itemResolve.js') : null);
  }
  function canonicalToStore(rec, section) {
    if (!rec) return null;
    if (section === 'weapons') {
      var dmg = rec.damage || {};
      return {
        // R-SPC-3 (ruling `store-paper-concept`, B-663): the store's item key is SECTION-QUALIFIED.
        // `thermal_cutter` is a record in BOTH weapons.json and gear.json, and a bare-id map made
        // the two one item — the weapons shelf opened the tool. `regId` is the BARE registry id and
        // is the only thing that may be written to a sheet (id-refs, §8), an art path, or a GM
        // shelf; `key` addresses the CATALOG. Anything that persists reads `regId`.
        key: rec.id ? 'weapons:' + rec.id : null,
        regId: rec.id || null,
        name: rec.name || '',
        section: 'weapons',
        type: rec.type || null,
        // FFG weapon-table convention (fad-ocr p.175 / eote p.169): Brawn-based
        // weapons print their add signed ("+0", "+2", "−1": ItemResolve.brawnDamageText, B-1429); flat weapons print "N".
        damage: dmg.base === 'brawn'
          ? itemResolveCore().brawnDamageText(dmg.value != null ? dmg.value : 0)
          : (dmg.value != null ? dmg.value : null),
        crit: rec.crit != null ? rec.crit : null,
        range: rec.range ? (RANGE_REF_LABELS[rec.range] || rec.range) : null,
        rangeCode: rec.range || null,
        skill: skillRefLabel(rec.skill),
        skillKey: rec.skill || null,
        qualities: (rec.qualities || []).map(function (q) {
          return q.ranked && q.rank ? q.name + ' ' + q.rank : q.name;
        }),
        encumbrance: rec.encumbrance != null ? rec.encumbrance : null,
        hp: rec.hardpoints != null ? rec.hardpoints : null,
        price: rec.price != null ? rec.price : null,
        rarity: rec.rarity != null ? rec.rarity : null,
        restricted: rec.restricted === true,
        description: rec.description || '',
        // R-PCA-2: the certified dice effects ride the SAME projection every other rendered field
        // uses, so the sheet, the cockpit and the Dice Hub all read one resolution path. Carried
        // as authored (id-refs + resolve-at-render, PRAXIS §5) — never re-derived downstream.
        pool_mods: rec.pool_mods || undefined,
      };
    }
    if (section === 'armor') {
      var out = {
        key: rec.id ? 'armor:' + rec.id : null,       // R-SPC-3, as above
        regId: rec.id || null,
        name: rec.name || '',
        section: 'armor',
        soak: rec.soak != null ? rec.soak : null,
        defense: rec.defense != null ? rec.defense : null,
        encumbrance: rec.encumbrance != null ? rec.encumbrance : null,
        encumbrance_threshold_bonus: rec.encumbrance_threshold_bonus != null ? rec.encumbrance_threshold_bonus : null,
        hp: rec.hardpoints != null ? rec.hardpoints : null,
        price: rec.price != null ? rec.price : null,
        rarity: rec.rarity != null ? rec.rarity : null,
        restricted: rec.restricted === true,
        description: rec.description || '',
        // R-PCA-2: the certified dice effects ride the SAME projection every other rendered field
        // uses, so the sheet, the cockpit and the Dice Hub all read one resolution path. Carried
        // as authored (id-refs + resolve-at-render, PRAXIS §5) — never re-derived downstream.
        pool_mods: rec.pool_mods || undefined,
      };
      // B-1185 (R-B1185-10): an armour record whose installed attachments moved ONE side of its defence
      // (ItemResolve.applyInstalledAttachments) carries `defense_melee` / `defense_ranged`; they pass through, only when
      // present, so computeDerived's `defense_<side> ?? defense` reads them. No shipped armour carries either.
      if (rec.defense_melee != null) out.defense_melee = rec.defense_melee;
      if (rec.defense_ranged != null) out.defense_ranged = rec.defense_ranged;
      return out;
    }
    // gear
    return {
      key: rec.id ? 'gear:' + rec.id : null,          // R-SPC-3, as above
      regId: rec.id || null,
      name: rec.name || '',
      section: 'gear',
      type: rec.type || null,
      encumbrance: rec.encumbrance != null ? rec.encumbrance : null,
      encumbrance_threshold_bonus: rec.encumbrance_threshold_bonus != null ? rec.encumbrance_threshold_bonus : null,
      hp: rec.hardpoints != null ? rec.hardpoints : null,
      price: rec.price != null ? rec.price : null,
      rarity: rec.rarity != null ? rec.rarity : null,
      restricted: rec.restricted === true,
      description: rec.description || '',
      pool_mods: rec.pool_mods || undefined,   // R-PCA-2, as above
    };
  }

  var DICE_TOKENS = {
    '[SE]': 'Setback', '[BO]': 'Boost', '[DI]': 'Difficulty',
    '[CH]': 'Challenge', '[AB]': 'Ability', '[PR]': 'Proficiency',
    '[AD]': 'Advantage', '[SU]': 'Success', '[TR]': 'Triumph',
    '[TH]': 'Threat', '[FA]': 'Failure', '[DE]': 'Despair',
    '[FO]': 'Force', '[LI]': 'Light Side', '[DA]': 'Dark Side', '[FP]': 'Force Point',
  };
  function readableModText(text) {
    return text.replace(/\[[A-Z]{2}\]/g, function(m) { return DICE_TOKENS[m] || m; });
  }
  // B-137 (D-395 (a)) — THE one reader of an item's built-in mods ("What it does"): each `base_mods` line's words with
  // the dice KEPT AS TOKENS ("Grants [BO][BO] to all Athletics…"), whitespace folded. The caller draws the tokens through
  // the ONE shared glyph path (window.SWRPGUI.glyphText), as the description above it does; spelling them as words
  // ("Boost Boost") here put words where the description draws dice. The sheet's item detail and the store's item read
  // both call it; a line with no words is no line.
  function baseModLines(rec) {
    // A non-array is none: a record can come from a saved file now (B-1769), ruling release-r7-bug-burndown ADDENDUM 569.
    // R-AE-10: a line the public copy's scan blanked reads its own_words label (SWRPGSources.modWords); holocron unchanged
    var S = typeof window !== 'undefined' ? window.SWRPGSources : null;
    return ((rec && Array.isArray(rec.base_mods)) ? rec.base_mods : [])
      .map(function (m, i) { return S && S.modWords ? S.modWords(rec, 'base_mods', i) : (m && m.description); })
      .filter(Boolean)
      .map(function (d) { return String(d).replace(/\s+/g, ' ').trim(); })
      .filter(Boolean);
  }

  // F-1 (release-r7-bug-burndown ADDENDUM 37): THE one clamp for a line that carries [XX] dice tokens. It cuts at `n`
  // characters, never inside a token (a cut that would split "[BO]" backs off to before its "["), then drops the trailing
  // partial word as the modify bench always did, and marks the cut with an ellipsis. A line within `n` is returned as is.
  function clampTokenText(text, n) {
    var t = String(text || '');
    if (t.length <= n) return t;
    var cut = t.slice(0, n);
    var open = cut.lastIndexOf('[');
    if (open > cut.lastIndexOf(']') && /^\[[A-Z]{2}\]/.test(t.slice(open))) cut = cut.slice(0, open);
    return cut.replace(/\s+\S*$/, '').replace(/\s+$/, '') + '\u2026';
  }

  // B-1723 (ruling release-r7-bug-burndown ADDENDUM 566, Q2 B): THE one teaser of a closed fold over text that can carry [XX]
  // dice tokens. It ends before the first token inside `n`, with glyphText's own pattern, so a head never prints machine
  // notation and an unknown [XX] never shows either; a head draws no mark, and the opened fold has the whole text. Nothing
  // readable before that token: no teaser, ''. A line with no token inside `n` reads as the old slice did, byte for byte.
  function teaserBeforeToken(text, n) {
    var t = String(text || '');
    var at = t.search(/\[[A-Z]{2}\]/);
    if (at < 0 || at >= n) return t.length > n ? t.slice(0, n).replace(/\s+\S*$/, '') + '\u2026' : t;
    var cut = t.slice(0, at).replace(/\s+\S*$/, '');
    return /[\p{L}\p{N}]/u.test(cut) ? cut + '\u2026' : '';
  }

  // ── Public API ─────────────────────────────────────────────────────────
  global.SWItems = {
    RANGE_LABELS: RANGE_LABELS,
    RANGE_REF_LABELS: RANGE_REF_LABELS,
    QUALITY_NAMES: QUALITY_NAMES,
    SKILL_KEY_TO_NAME: SKILL_KEY_TO_NAME,
    SKILL_REF_TO_NAME: SKILL_REF_TO_NAME,
    GEAR_CATEGORIES: GEAR_CATEGORIES,

    init: init,
    cleanMarkup: cleanMarkup,
    rangeLabel: rangeLabel,
    skillName: skillName,
    skillRefLabel: skillRefLabel,
    formatQualities: formatQualities,
    canonicalToStore: canonicalToStore,
    readableModText: readableModText,
    baseModLines: baseModLines,
    clampTokenText: clampTokenText,
    teaserBeforeToken: teaserBeforeToken,
  };
})(typeof window !== 'undefined' ? window : this);
