/**
 * oggImport.js — OGG-1: the OggDude character-save PARSER (slice 1 of the importer).
 *
 * DEPENDENCY-FREE by design: there is no XML library in node_modules, and a browser-only DOMParser
 * path could not be exercised by a node guard. OggDude / SWCharGen v2.3 exports are stable,
 * machine-generated XML; targeted extraction of the known element set is robust for a known format and
 * is proven against the five real fixtures (`data-sources/ogg-saves/`, ruling `ogg-0-saves-arrived`).
 * Browser and node run the identical code.
 *
 * SCOPE (this slice): parse an export string into a structured character, and flatten every KEYED
 * record into a manifest — the input the resolver classifies into matched / adapted / absent
 * (R-OGG1-3: nothing silently dropped, proven by iterating the manifest, not by inspection). The
 * (type, key) resolution against our registries and the assembly through the existing core are the
 * next slices; this file resolves nothing and writes no sheet.
 *
 * Field map: `Docs/OGGDUDE_FIELD_MAP.md` §B/§B.1. Element names read at the fixtures:
 *   identity   <Character><Name>/<Key>  (before <Characteristics>)
 *   species    <Species><SpeciesKey>/<SubSpeciesKey>
 *   career     <Career><CareerKey>/<StartingSpecKey>
 *   specs      <CharSpecialization><Key> + <Talents><CharTalent><Key><Col><Row>
 *   ledger     <CharCharacteristic>/<CharSkill> with <SpeciesRanks>/<CareerRanks>/<PurchasedRanks>/… + <isCareer>
 *   gear       <Weapons><CharWeapon><ItemKey><Count> · <Armor><CharArmor><ItemKey> · <Gear><CharGear><ItemKey>
 *   force      <ForcePowers><CharForcePower><Key> + <CharForceAbility><Key><Col><Row><Span><Cost><Purchased>
 *   signature  <SigAbilities><CharSigAbility><Key><Name><SpecKey> + <CharSigAbilityNode><Key><Col><Row><Span><Cost><Purchased>
 *   narrative  <Duties><CharDuty><DutKey><Size> · <Obligations><CharObligation><ObKey> · <Morality><MoralityPair><StrengthKey><WeaknessKey>
 *   vehicles   <Vehicles><CharVehicle><ItemKey><Name><Description>  (empty <ItemKey/> = custom, no registry key)
 *   portrait   <Portrait> (presence; the bytes are handled by the portrait slice, R-OGG-21)
 *   schematics <Schematics><CharSchematic><TemplateKey><Level> + <refTemplate><Name> (R-R5CC-3; the name is for the receipt)
 *   rigger     <Rigger><VehicleKey><WeaponIndex> (release-r5-rigger-card ADDENDUM 2 C2; custRigger / MaxSilhouette never read)
 *   rewards    <Rewards><CharReward><RewardKey> + <SelectedOptions><CharOption><ChoiceKey><OptionKey>[<SelectedCraftImprovementKey>]
 *              (R6 lane C, ruling release-r6-rewards-c0; the option's own <StartingAttribs> XP is not read — the price is the registry's)
 *
 * Dual-export (browser window.SWRPGOggImport / CommonJS) so test/ogg_import_parse.cjs runs it in node.
 */
(function (root) {
  'use strict';

  // ── extraction helpers (no XML lib) ──────────────────────────────────────
  // R-OGG1-18 / C-OGG1-5 — the parse-completeness census must derive "what we consume" from the RUNNING
  // parser, never a hand-kept list beside it (a check whose two sides are authored together can only
  // agree with itself). So EVERY tag the parser looks up flows through these three helpers, and each
  // records the tag name when a trace is armed. `tracedTags(xml)` re-runs the real parse and returns
  // exactly the tag set the parser queried — point the talent parse at a tag that isn't there and that
  // tag leaves the set, so the file's real `<CharTalent>` becomes UNACCOUNTED and the census goes red.
  // Null in production; a single `if (_trace)` per lookup, no output, zero footprint when off.
  var _trace = null;
  function _tag(t) { if (_trace) _trace.add(t); return t; }
  // firstTag: inner content of the FIRST <tag …>…</tag> (non-greedy; our target elements never
  // self-nest). `\b[^>]*` allows attributes on the opening tag — the root <Character> carries xmlns.
  function firstTag(xml, tag) {
    _tag(tag);
    if (xml == null) return null;
    var m = xml.match(new RegExp('<' + tag + '\\b[^>]*>([\\s\\S]*?)</' + tag + '>'));
    return m ? m[1] : null;
  }
  // allBlocks: every <tag …>…</tag> block (whole match). Elements here (CharWeapon, CharSpecialization…)
  // do not contain another element of their own name, so a non-greedy body is exact.
  function allBlocks(xml, tag) {
    _tag(tag);
    if (xml == null) return [];
    return xml.match(new RegExp('<' + tag + '\\b[^>]*>[\\s\\S]*?</' + tag + '>', 'g')) || [];
  }
  // decodeEntities: XML escapes → text (&amp; LAST so we never double-decode). Curly quotes and other
  // UTF-8 sit in the string as-is; only the five XML entities + numeric refs need turning back.
  function decodeEntities(s) {
    if (s == null) return s;
    return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
            .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(parseInt(n, 10)); })
            .replace(/&amp;/g, '&');
  }
  // field: text of the first <tag>text</tag> (also matches a self-closing <tag/> as empty), entity-decoded.
  function field(xml, tag) {
    _tag(tag);
    if (xml == null) return null;
    var m = xml.match(new RegExp('<' + tag + '>([^<]*)</' + tag + '>'));
    if (m) return decodeEntities(m[1].trim());
    return new RegExp('<' + tag + '\\s*/>').test(xml) ? '' : null;
  }
  function intField(xml, tag) { var v = field(xml, tag); return v ? (parseInt(v, 10) || 0) : 0; }
  function boolField(xml, tag) { return field(xml, tag) === 'true'; }
  function nz(s) { return s != null && s !== ''; }   // non-empty
  // Raw base64 (no data: prefix, as OggDude stores it) → a data: URI, MIME recovered from the image
  // magic bytes. null for absent / STRIPPED. PNG (iVBORw0) and JPEG (/9j/) cover the OggDude corpus;
  // anything else defaults to png so the browser still attempts it (an unreadable image is a receipt row).
  function portraitDataUri(b64) {
    if (!nz(b64) || b64 === 'STRIPPED') return null;
    var mime = b64.indexOf('/9j/') === 0 ? 'image/jpeg' : (b64.indexOf('R0lGOD') === 0 ? 'image/gif' : 'image/png');
    return 'data:' + mime + ';base64,' + b64;
  }

  // R7 R-R7-O3 (B-1475 (c); ruling release-r7-bug-burndown ADDENDUM 5) — THE ONE CROSSWALK between OggDude's creation-bonus
  // flags (CharObDutyOptions: Plus5XP, Plus10XP, Plus1000Cr, Plus2500Cr) and the creator's trade ids
  // (narrative-mechanics.json `tradeOptions.choices`), the same four choices one to one. oggExport.js reads it from here
  // (SWRPGOggImport.OB_DUTY_TRADES); the oracle's _OB_DUTY_TRADES is its twin.
  var OB_DUTY_FLAGS = ['Plus5XP', 'Plus10XP', 'Plus1000Cr', 'Plus2500Cr'];
  var OB_DUTY_TRADES = {
    obligation: { el: 'ObOptions', flags: { Plus5XP: 'eote_obl_plus5_for_xp5', Plus10XP: 'eote_obl_plus10_for_xp10',
                                            Plus1000Cr: 'eote_obl_plus5_for_cr1000', Plus2500Cr: 'eote_obl_plus10_for_cr2500' } },
    duty: { el: 'DutOptions', flags: { Plus5XP: 'aor_duty_minus5_for_xp5', Plus10XP: 'aor_duty_minus10_for_xp10',
                                      Plus1000Cr: 'aor_duty_minus5_for_cr1000', Plus2500Cr: 'aor_duty_minus10_for_cr2500' } },
  };

  // R7 B-1538 (ruling release-r7-bug-burndown ADDENDUM 266, Q2 A) — THE ONE CROSSWALK between a Force and Destiny file's
  // starting-Morality <Option> (under <Morality><Options>) and the creator's morality trade ids, beside OB_DUTY_TRADES. Only
  // the key a save attests is mapped (jihn: Plus20Morality); OggDude's 20 is its label, the rule is +21 (FaD p.49). No other
  // key is mapped until a save attests it. oggExport.js reads it from here (SWRPGOggImport.MORALITY_TRADES); the oracle's
  // _MORALITY_TRADES is its twin.
  var MORALITY_TRADES = { el: 'Options', options: { Plus20Morality: 'fad_raw_morality_plus21' } };

  // ── the parser ───────────────────────────────────────────────────────────
  function parseOggCharacter(xmlString) {
    var xml = String(xmlString || '').replace(/^\uFEFF/, '');   // strip a UTF-8 BOM if present
    var char = firstTag(xml, 'Character');
    if (char == null) return null;                       // not an OggDude <Character> export
    var head = char.split(_tag('Characteristics') && '<Characteristics')[0];   // identity before the ledger; _tag records the container traversed by split (not a helper)
    // A PC file can embed OWNED NPCs (<NPCs> — companions / minions), each a nested character with its
    // OWN <Characteristics>/<Skills>/gear. Those are not the PC's data (the Droid parsed 12
    // characteristics = its 6 + a nested NPC's 6). Exclude the block so every extraction below reads the
    // PLAYER character only. (Importing owned NPCs is a separate, later concern.)
    // B-1409 (card `b1409-import-receipt-card` ADDENDUM 2): what the strip removes is still COUNTED and
    // NAMED first, so the receipt can say it was left in the file (R-OGG1-3: nothing silently dropped).
    // An entry's name is its block's OWN direct-child <Name> — before its <Characteristics>, whose first
    // <Name> tags are Brawn, Agility… — and it is empty (<Name />) in every attested save, so `names`
    // carries only the non-empty ones and `count` carries every entry.
    var companions = allBlocks(firstTag(char, 'NPCs'), 'Adversary');
    var companionNames = companions.map(function (b) {
      return field(b.split('<Characteristics')[0].replace(/^<Adversary\b[^>]*>/, ''), 'Name');
    }).filter(nz);
    char = char.replace(/<NPCs>[\s\S]*?<\/NPCs>/, '');

    // The character's own <Portrait> is a direct child of <Character>; the save ALSO stores a <Portrait>
    // inside each owned <CharVehicle> (N4567 carries two vehicle portraits BEFORE its own, so an
    // unscoped match returns a vehicle's picture). Strip <Vehicles> for portrait extraction only — the
    // vehicle refs are still read from `char` below.
    var portraitRaw = field(char.replace(/<Vehicles>[\s\S]*?<\/Vehicles>/, ''), 'Portrait');

    // Species/Career keys are read from the LEAF tags directly, not the <Species>/<Career> container:
    // a boolean `<Career>true</Career>` appears elsewhere in the file (e.g. the Droid), so matching the
    // container by name grabs the wrong block. `<CareerKey>`/`<SpeciesKey>` are unambiguous leaves.
    // NAME: `<Name>` is empty in every real save and `<FileName>` is OggDude's own "CharN.xml"; OggDude keeps
    // the character's name in `<Description><CharName>` (B-1050: 9 of 9 real saves). So the name is `<Name>`,
    // else `<CharName>`; the assembly's fallbacks (the file name, then "Imported character") stay behind it.
    return {
      name: field(head, 'Name') || field(head, 'CharName'),
      fileName: field(head, 'FileName'),
      key: field(head, 'Key'),
      species: {
        key: field(char, 'SpeciesKey') || null, subKey: field(char, 'SubSpeciesKey') || null,
        // The OPTION PAYLOADS we deliberately do not read (R-BPI-3). OggDude writes a species
        // option twice: the payload states the RULE ("this option grants Brawl 1") and the
        // CharSkill ledger states the RESULT (SpeciesRanks 1). We consume the ledger, so nothing
        // is lost — but a tag nothing reads is worth SAYING rather than leaving to be discovered,
        // and B-282 was filed on exactly that ambiguity. Only the kinds are collected; the
        // contents are not parsed, because we do not act on them.
        // B-293 — the CHOICE/OPTION pairs themselves, which the bridge reads back into picks.
        // Scoped to the Species block for the same reason the kinds below are: <CharOption> also
        // appears under careers and specializations.
        options: (function () {
          var sp = (allBlocks(char, 'Species') || [])[0] || '';
          var out = [];
          (allBlocks(sp, 'CharOption') || []).forEach(function (block) {
            var ck = field(block, 'ChoiceKey'), okey = field(block, 'OptionKey');
            if (nz(ck) && nz(okey)) out.push({ choice: ck, option: okey });
          });
          return out;
        })(),
        optionPayloadKinds: (function () {
          // Scoped TWICE on purpose: to the Species block, because <CharOption> also appears under
          // careers and specializations; and to each option's DIRECT children, because a nested
          // <Key>/<RankStart> is part of a payload, not a kind of one. An unscoped scan reported
          // seven "kinds" for a file that carries one.
          var sp = (allBlocks(char, 'Species') || [])[0] || '';
          var kinds = {};
          (allBlocks(sp, 'CharOption') || []).forEach(function (block) {
            // allBlocks returns the wrapper too; the direct children are what is inside it.
            var b = block.replace(/^<CharOption[^>]*>/, '').replace(/<\/CharOption>$/, '');
            var re = /<([A-Za-z_][\w.-]*)(\s[^>]*?)?(\/?)>/g, m;
            while ((m = re.exec(b))) {
              if (m[1] !== 'ChoiceKey' && m[1] !== 'OptionKey') kinds[m[1]] = 1;
              if (m[3] !== '/') {           // skip this element's whole subtree
                var close = b.indexOf('</' + m[1] + '>', re.lastIndex);
                if (close !== -1) re.lastIndex = close + m[1].length + 3;
              }
            }
          });
          return Object.keys(kinds).sort();
        })(),
      },
      career: { key: field(char, 'CareerKey') || null, startingSpecKey: field(char, 'StartingSpecKey') || null },
      specializations: allBlocks(char, 'CharSpecialization').map(function (b) {
        return {
          key: field(b, 'Key'),
          isStarting: boolField(b, 'isStartingSpec'),
          isCareer: boolField(b, 'isCareerSpec'),
          // B-225: `purchased` was DROPPED here, so ownership never reached the manifest and every
          // enumerated tree cell imported as a talent the player never bought. OggDude omits the
          // element entirely when false (censused: in all six shipped saves and the repro file, the
          // "<Purchased> present" count equals the "true" count), so absence IS not-purchased.
          talents: allBlocks(b, 'CharTalent').map(function (t) {
            return { key: field(t, 'Key'), col: intField(t, 'Col'), row: intField(t, 'Row'),
                     purchased: boolField(t, 'Purchased') };
          }),
        };
      }),
      // per-source rank ledger — the free/purchased split (field map §B.1); not a join record.
      // B-778: THREE contributors, not two. §B.1's per-source ledger gives a characteristic as
      // SpeciesRanks + TalentRanks + PurchasedRanks, and `talent` — a post-creation Dedication rank — was
      // never read, so it could not reach the sheet however the assembly summed the other two. It is kept
      // as its own term rather than folded in here, because the assembly needs the two halves SEPARATELY
      // (see the note at `ch.characteristics`). Absent element = 0, as everywhere else in this ledger.
      characteristics: allBlocks(char, 'CharCharacteristic').map(function (b) {
        return { key: field(b, 'Key'), species: intField(b, 'SpeciesRanks'),
                 talent: intField(b, 'TalentRanks'), purchased: intField(b, 'PurchasedRanks') };
      }),
      skills: allBlocks(char, 'CharSkill').map(function (b) {
        return {
          key: field(b, 'Key'), isCareer: boolField(b, 'isCareer'),
          species: intField(b, 'SpeciesRanks'), career: intField(b, 'CareerRanks'),
          purchased: intField(b, 'PurchasedRanks'), starting: intField(b, 'StartingRanks'),
        };
      }),
      weapons: gearList(char, 'Weapons', 'CharWeapon'),
      armor: gearList(char, 'Armor', 'CharArmor'),
      gear: gearList(char, 'Gear', 'CharGear'),
      forcePowers: allBlocks(char, 'CharForcePower').map(function (b) {
        return {
          key: field(b, 'Key'),
          name: field(b, 'Name'),   // F-100 M10 D-144: the receipt names a refused upgrade's power, never by its raw key
          nodes: allBlocks(b, 'CharForceAbility').map(function (a) {
            return {
              key: field(a, 'Key'), col: intField(a, 'Col'), row: intField(a, 'Row'),
              span: intField(a, 'Span'), cost: intField(a, 'Cost'), purchased: boolField(a, 'Purchased'),
            };
          }),
        };
      }),
      // F-100 M12 B-1244 (f100-m12-sig-shape §5): the signature abilities. The file writes each tree cell by cell (the base
      // as four span-1 cells); a cell is bought iff <Purchased>true</Purchased> (absent = not bought, as for talents).
      sigAbilities: allBlocks(char, 'CharSigAbility').map(function (b) {
        return {
          key: field(b, 'Key'), name: field(b, 'Name'), specKey: field(b, 'SpecKey'),
          nodes: allBlocks(b, 'CharSigAbilityNode').map(function (a) {
            return {
              key: field(a, 'Key'), col: intField(a, 'Col'), row: intField(a, 'Row'),
              span: intField(a, 'Span'), cost: intField(a, 'Cost'), purchased: boolField(a, 'Purchased'),
            };
          }),
        };
      }),
      duties: allBlocks(char, 'CharDuty').map(function (b) { return { key: field(b, 'DutKey'), size: intField(b, 'Size'), name: field(b, 'Name') }; }),
      obligations: allBlocks(char, 'CharObligation').map(function (b) { return { key: field(b, 'ObKey'), size: intField(b, 'Size'), name: field(b, 'Name') }; }),
      morality: parseMorality(firstTag(char, 'Morality')),
      // owned vehicles: inline CharVehicle refs. An empty <ItemKey/> is a custom vehicle (no registry
      // key → the resolver's skip/absent lane). Name/Description are user-authored (R-OGG-15).
      vehicles: allBlocks(char, 'Vehicles').length ? allBlocks(firstTag(char, 'Vehicles'), 'CharVehicle').map(parseVehicleRef) : [],
      // release-r5-rigger (card ADDENDUM 2 C2): the Signature Vehicle. VehicleKey is a <CharVehicle>'s <Key> in this file
      // (SWCharGenLib · CharRigger · SigVehicle finds `cveh.Key == VehicleKey`); WeaponIndex is kept for the receipt only.
      // custRigger and MaxSilhouette are never read: CharRigger · Recalc rebuilds both from talents.
      rigger: parseRigger(firstTag(char, 'Rigger')),
      portrait: nz(portraitRaw) && portraitRaw !== 'STRIPPED',
      // The portrait bytes as a data: URI (R-OGG-21 — carried into sheet.portrait, re-encoded at wiring).
      // OggDude stores raw base64 with no MIME prefix; the image magic recovers the type. STRIPPED → null.
      portraitData: portraitDataUri(portraitRaw),
      // R7 R-R7-O1 (B-1474): the file's own <Credits> (a direct child of <Character>; null when the file has none). The
      // assembly lands the sheet on it through pocketMoney. R-R7-O2: <CharMotivation>, keyed by OggDude's motive keys.
      // R7 B-1474 (2) (ADDENDUM 17): <Story> is plain text (the D-397 save); read with the vehicles and NPCs cut out, as Credits is
      story: field(char.replace(/<Vehicles>[\s\S]*?<\/Vehicles>/, '').replace(/<NPCs>[\s\S]*?<\/NPCs>/, ''), 'Story') || '',
      credits: (function (v) { return nz(v) && /^-?\d+$/.test(v) ? parseInt(v, 10) : null; })(field(char.replace(/<Vehicles>[\s\S]*?<\/Vehicles>/, ''), 'Credits')),
      // R7 R-R7-O3 (B-1475 (c)): the creation-bonus choices on <ObOptions>/<DutOptions> (CharObDutyOptions' four flags).
      obOptions: OB_DUTY_FLAGS.filter(function (f) { return boolField(firstTag(char, 'ObOptions') || '', f); }),
      dutOptions: OB_DUTY_FLAGS.filter(function (f) { return boolField(firstTag(char, 'DutOptions') || '', f); }),
      motivations: allBlocks(firstTag(char, 'Motivations'), 'CharMotivation').map(function (b) {
        return { key: field(b, 'MotiveKey') || null, spec: field(b, 'SpecMotiveKey') || null, name: field(b, 'Name') || null };
      }),
      // Character-level XP ledger (the FIRST <Experience> — a direct child of <Character>, before the
      // Skills block's own per-source <Experience>). ExperienceRanks split the pool by source; the free
      // grants (Starting/Species) plus the earned award (Purchased) are the total available XP. §B.1.
      experience: parseExperience(firstTag(char, 'Experience')),
      // B-1409 — what the import leaves in the file, read for the receipt and nothing else. Companions
      // were counted above, before the strip; rewards are read AFTER it, from the PC's own text
      // (<Rewards> is a <Character> child after </NPCs>, so an owned NPC's could never be counted —
      // ruling ADDENDUM 2 R-3). The KEYS are kept; a reward's name resolves at render (R-1).
      // release-r5-crafting-sm (R-R5CC-3, card ADDENDUM 4): the schematics — the template's KEY and Level; the file's own
      // template name (refTemplate's first <Name>) is kept only so the receipt can name a key we do not hold.
      schematics: allBlocks(firstTag(char, 'Schematics'), 'CharSchematic').map(function (b) {
        return { key: field(b, 'TemplateKey'), level: intField(b, 'Level'), name: field(firstTag(b, 'refTemplate'), 'Name') || null };
      }).filter(function (x) { return nz(x.key); }),
      // ruling release-r6-companions-npcs: each owned Adversary, parsed for the companion import (companionsOf) and kept
      // as its own block for the verbatim export (Q2 (a), C1).
      adversaries: companions.map(parseAdversary),
      // R6 lane C (ruling `release-r6-rewards-c0`): each reward's key and its picked options, mapped by rewardsOf below
      rewards: allBlocks(firstTag(char, 'Rewards'), 'CharReward').map(function (b) {
        return { key: field(b, 'RewardKey'), options: allBlocks(firstTag(b, 'SelectedOptions'), 'CharOption').map(function (o) {
          return { choice: field(o, 'ChoiceKey'), option: field(o, 'OptionKey'), improvement: field(o, 'SelectedCraftImprovementKey') || null };
        }) };
      }).filter(function (r) { return nz(r.key); }),
      leftOut: {
        companions: { count: companions.length, names: companionNames },
        rewardKeys: allBlocks(firstTag(char, 'Rewards'), 'CharReward').map(function (b) {
          return field(b, 'RewardKey');
        }).filter(nz),
      },
    };
  }
  // ── an owned Adversary (ruling release-r6-companions-npcs Q1 (a); brief F1) ──
  // Every rank child of a block summed (StartingRanks, PurchasedRanks, ItemRanks, CharRanks, …); `parts` keeps them.
  var RANK_TAGS = ['StartingRanks', 'PurchasedRanks', 'ItemRanks', 'CharRanks', 'SpeciesRanks', 'CareerRanks', 'TalentRanks'];
  function rankParts(b) {
    var parts = {}, any = false;
    RANK_TAGS.forEach(function (t) { var v = field(b, t); if (nz(v)) { parts[t] = parseInt(v, 10) || 0; any = true; } });
    return any ? parts : null;
  }
  function sumParts(parts) { var n = 0; Object.keys(parts || {}).forEach(function (k) { n += parts[k]; }); return n; }
  // The block LF-normalized and dedented (its first line holds no indent; the rest lose their common one), so the export
  // can re-indent it at its own depth.
  function dedentBlock(block) {
    var lines = String(block).replace(/\r\n?/g, '\n').split('\n');
    var min = null;
    lines.slice(1).forEach(function (l) { if (!l.trim()) return; var n = l.match(/^ */)[0].length; if (min === null || n < min) min = n; });
    return [lines[0]].concat(lines.slice(1).map(function (l) { return l.slice(Math.min(min || 0, l.match(/^ */)[0].length)); })).join('\n');
  }
  var ATTR_TAGS = ['SoakValue', 'WoundThreshold', 'StrainThreshold', 'DefenseRanged', 'DefenseMelee', 'ForceRating'];
  function parseAdversary(block) {
    var head = block.split('<Characteristics')[0].replace(/^<Adversary\b[^>]*>/, '');
    var attrs = {}, at = firstTag(block, 'Attributes');
    ATTR_TAGS.forEach(function (t) { var b = firstTag(at, t); attrs[t] = b == null ? null : (rankParts(b) || {}); });
    function items(container, tag) {
      return allBlocks(firstTag(block, container), tag).map(function (b) {
        return { key: field(b, 'ItemKey'), equipped: boolField(b, 'Equipped') };
      }).filter(function (x) { return nz(x.key); });
    }
    return {
      key: field(head, 'Key'), name: field(head, 'Name') || '', type: field(block.split('</SpecialArmor>').pop(), 'Type') || '',
      silhouette: (function () { var v = field(block.split('</SpecialArmor>').pop(), 'Silhouette'); return nz(v) ? parseInt(v, 10) : null; })(),
      characteristics: allBlocks(firstTag(block, 'Characteristics'), 'CharCharacteristic').map(function (b) {
        return { key: field(b, 'Key'), rank: sumParts(rankParts(firstTag(b, 'Rank') || '')) };
      }),
      talents: allBlocks(firstTag(block, 'Talents'), 'CharTalent').map(function (b) {
        return { key: field(b, 'Key'), ranks: intField(b, 'Ranks') };
      }).filter(function (x) { return nz(x.key); }),
      skills: allBlocks(firstTag(block, 'Skills'), 'CharSkill').map(function (b) {
        var r = firstTag(b, 'Rank');
        var parts = r == null ? null : rankParts(r);
        return { key: field(b, 'Key'), rank: parts ? sumParts(parts) : null };
      }).filter(function (x) { return nz(x.key); }),
      attributes: attrs,
      weapons: items('Weapons', 'CharWeapon'), armor: items('Armor', 'CharArmor'), gear: items('Gear', 'CharGear'),
      abilities: allBlocks(firstTag(block, 'Abilities'), 'AdvAbility').map(function (b) {
        return { name: field(b, 'Name') || '', mods: allBlocks(b, 'DieModifier').map(function (m) {
          var counts = {};
          (m.match(/<([A-Za-z]+)Count>(\d+)<\/\1Count>/g) || []).forEach(function (c) {
            var mm = c.match(/<([A-Za-z]+)Count>(\d+)</); counts[mm[1]] = parseInt(mm[2], 10) || 0;
          });
          return { skill: field(m, 'SkillKey'), counts: counts };
        }) };
      }),
      items: allBlocks(firstTag(block, 'Items'), 'AdvItem').map(function (b) { return { name: field(b, 'Name') || '' }; }),
      specialWeapons: allBlocks(firstTag(block, 'SpecialWeapons'), 'AdvWeapon').map(function (b) {
        return { name: field(b, 'Name') || '', skill: field(b, 'SkillKey'), damage: intField(b, 'Damage'), crit: intField(b, 'Crit'),
                 range: field(b, 'Range') || null };
      }),
      specialArmor: allBlocks(firstTag(block, 'SpecialArmor'), 'AdvArmor').map(function (b) {
        return { name: field(b, 'Name') || '', soak: intField(b, 'Soak'), defense: intField(b, 'Defense') };
      }),
      xml: dedentBlock(block),
    };
  }

  // { starting, species, purchased, used, granted, total } — R-OGG1-15. `granted` = the three rank
  // sources summed (what the file SAYS was granted); `used` = UsedExperience (what was SPENT). OggDude's
  // ExperienceRanks is a record of grants it happens to know about, NOT a total — jihn carries 0
  // PurchasedRanks despite 655 spent. A character demonstrably had at least what they spent, so the
  // TOTAL available is max(granted, used): the sum alone lands a played character deep in the red;
  // `used` alone silently deletes genuinely-unspent XP (Aroo'Meh's 40). `max` is correct on all five.
  function parseExperience(exp) {
    if (exp == null) return { starting: 0, species: 0, purchased: 0, used: 0, granted: 0, total: 0 };
    var ranks = firstTag(exp, 'ExperienceRanks');
    var starting = intField(ranks, 'StartingRanks');
    var species = intField(ranks, 'SpeciesRanks');
    var purchased = intField(ranks, 'PurchasedRanks');
    var used = intField(exp, 'UsedExperience');
    var granted = starting + species + purchased;
    // `usedPresent` (ADDENDUM 40 C1): intField reads an ABSENT <UsedExperience> as 0; settleXpCounted tells only a figure
    // the file actually holds. Every other reader keeps `used`/`total` as before.
    return { starting: starting, species: species, purchased: purchased,
             used: used, usedPresent: field(exp, 'UsedExperience') !== null, granted: granted, total: Math.max(granted, used) };
  }

  function gearList(char, container, item) {
    return allBlocks(firstTag(char, container), item).map(function (b) {
      // Name is user-authored, present on custom/renamed items — the receipt shows it for an unkeyed
      // item so "1 custom weapon" can name the weapon (R-OGG-15 same class as the vehicle Name/Notes).
      return { itemKey: field(b, 'ItemKey') || null, count: intField(b, 'Count') || 1,
               guid: field(b, 'Key'), name: field(b, 'Name') || null };
    });
  }
  function parseVehicleRef(b) {
    return { itemKey: field(b, 'ItemKey') || null, guid: field(b, 'Key'), count: intField(b, 'Count') || 1,
             name: field(b, 'Name') || null, notes: field(b, 'Description') || null };
  }
  function parseRigger(rg) {
    if (rg == null) return null;
    var wi = field(rg, 'WeaponIndex');
    return { vehicleKey: field(rg, 'VehicleKey') || null, weaponIndex: nz(wi) ? (parseInt(wi, 10)) : -1 };
  }
  function parseMorality(m) {
    if (m == null) return null;
    var pair = firstTag(m, 'MoralityPair');
    return {
      strengthKey: pair ? field(pair, 'StrengthKey') : null,
      weaknessKey: pair ? field(pair, 'WeaknessKey') : null,
      value: intField(m, 'MoralityValue'),
      options: allBlocks(m, 'Option').map(function (o) { return o.replace(/<\/?Option>/g, ''); }),
    };
  }

  // ── record manifest — every KEYED record as { type, key, ... } for the resolver ──────────────
  // R-OGG1-3 is an ACCEPTANCE, not a description: the resolver iterates THIS, so every record is
  // accounted for by construction. `type` names the registry the key resolves against (R-OGG-11/12:
  // (type, key), never key-alone). Ledger characteristics/skills are NOT here — they carry no registry
  // key-ref that could be "absent"; they are rank data, applied to the resolved character.
  function recordManifest(parsed) {
    if (!parsed) return [];
    var recs = [];
    if (parsed.species.key) recs.push({ type: 'species', key: parsed.species.key });
    if (parsed.career.key) recs.push({ type: 'careers', key: parsed.career.key });
    parsed.specializations.forEach(function (s) {
      if (s.key) recs.push({ type: 'specializations', key: s.key });
      // B-225 §3.2 — a talent is owned iff ITS OWN cell is purchased. A specialization's cells are
      // the full tree GRID as OggDude writes it (proven: ArooMeh's PILOT/CHARMER cell coordinates
      // are identical to our registry's 4x5 trees, with zero purchased), so an unfiltered push
      // imports the catalog, not the character.
      // R7 B-1584 (ADDENDUM 313): the cell carries its tree's key so the resolver can test the cell, not only the key.
      s.talents.forEach(function (t) { if (t.key && t.purchased) recs.push({ type: 'talents', key: t.key, col: t.col, row: t.row, spec: s.key }); });
    });
    parsed.weapons.forEach(function (w) { recs.push({ type: 'weapons', key: w.itemKey, count: w.count, name: w.name }); });
    parsed.armor.forEach(function (a) { recs.push({ type: 'armor', key: a.itemKey, count: a.count, name: a.name }); });
    parsed.gear.forEach(function (g) { recs.push({ type: 'gear', key: g.itemKey, count: g.count, name: g.name }); });
    // B-225 §3.2 — a power is owned iff ANY of its ability nodes is purchased (the base is its
    // col0/row0 cell). The file enumerates the whole catalog; without this the character receives
    // the base of every power in the game.
    parsed.forcePowers.forEach(function (f) {
      if (!f.key) return;
      var owned = (f.nodes || []).some(function (n) { return n.purchased; });
      if (owned) recs.push({ type: 'force_powers', key: f.key, nodes: f.nodes });
    });
    // F-100 M12 B-1244: a signature ability is owned iff any of its cells is purchased (the file may list one it never
    // bought, as it lists the power catalog).
    (parsed.sigAbilities || []).forEach(function (a) {
      if (!a.key) return;
      if ((a.nodes || []).some(function (n) { return n.purchased; })) recs.push({ type: 'signature_abilities', key: a.key, name: a.name, specKey: a.specKey });
    });
    parsed.vehicles.forEach(function (v) { recs.push({ type: 'vehicles', key: v.itemKey, name: v.name, notes: v.notes }); });
    return recs;
  }

  // F-100 M10 (ruling f100-m10-shapes-card R-M10S-10, C-OGG1-3) — ONE decision for an owned power's purchased UPGRADE
  // cells: each `<Purchased>true</Purchased>` cell past the base (col0/row0, which IS the power) is CARRIED by its
  // lowercased Key when the resolved power record's `abilities` holds that key — one entry per cell, so a ranked upgrade
  // bought twice is two entries (R-M10S-2's count) — and REFUSED otherwise: named in the receipt, never invented.
  // Cells in tree order (row, then column). assembleCore carries `carried`; buildReport counts both.
  // R7 B-1536 (ADDENDUM 269): `cells` is each carried cell's 'row-col', one per `carried` element in the same order — the
  // entry's `owned` (charResolve.forcePowerOwnedProblems reads a mismatch as absent, so it is never refused here).
  function forceUpgradeCells(f, rec) {
    var carried = [], cells = [], refused = [], abilities = (rec && rec.abilities) || null;
    (f && f.nodes ? f.nodes.slice() : []).sort(function (a, b) { return (a.row - b.row) || (a.col - b.col); }).forEach(function (n) {
      if (!n.purchased || (n.col === 0 && n.row === 0)) return;
      var k = String(n.key || '').toLowerCase();
      if (k && abilities && Object.prototype.hasOwnProperty.call(abilities, k)) { carried.push(k); cells.push(n.row + '-' + n.col); }
      else refused.push((f.key || '?') + '/' + (n.key || '(no key)'));
    });
    return { carried: carried, cells: cells, refused: refused };
  }

  // F-100 M12 B-1244 (rulings f100-m12-census-card R-M12C-19 (c)/-39, f100-m12-build-card R-M12B-8; brief f100-m12-sig-shape
  // §5) — ONE decision for an owned signature ability's purchased CELLS: each `<Purchased>true</Purchased>` cell is mapped to
  // the registry tree's cell that COVERS its row and column (so the base's four span-1 cells fold to '0-0'), and CARRIED as
  // that cell's position when the file's lowercased Key is the cell's node, or the node a named fill `replaces` there
  // (Unmatched Heroism's INCREASERANGEUF, R-M12C-19 (c)). Anything else is REFUSED and named '<ABILITY>/<KEY>', never
  // invented. Positions in tree order, each once. The legality of what is carried (V1–V7) is settleSigAbilities' — after
  // the sheet exists, through CharResolve.sigAbilityChecks, the one legality function.
  function sigAbilityCells(a, rec) {
    var owned = [], refused = [], tree = (rec && Array.isArray(rec.tree)) ? rec.tree : [];
    var fills = (rec && Array.isArray(rec.fills)) ? rec.fills : [];
    (a && a.nodes ? a.nodes.slice() : []).sort(function (x, y) { return (x.row - y.row) || (x.col - y.col); }).forEach(function (n) {
      if (!n.purchased) return;
      var row = tree[n.row], cell = null;
      ((row && Array.isArray(row.cells)) ? row.cells : []).forEach(function (c) {
        var col = typeof c.col === 'number' ? c.col : 0, span = typeof c.span === 'number' && c.span > 0 ? c.span : 1;
        if (!cell && n.col >= col && n.col < col + span) cell = { c: c, col: col };
      });
      var k = String(n.key || '').toLowerCase();
      var fill = cell && fills.filter(function (f) { return f && f.row === n.row && f.col === cell.col && f.ability === cell.c.ability; })[0];
      if (cell && k && (k === cell.c.ability || (fill && fill.replaces === k))) {
        var pos = n.row + '-' + cell.col;
        if (owned.indexOf(pos) === -1) owned.push(pos);
      } else refused.push((a.key || '?') + '/' + (n.key || '(no key)'));
    });
    return { owned: owned, refused: refused };
  }

  // ── resolution — classify every manifest record vs our registries (slice 2) ──────────────────
  // R-OGG1-3 is the ACCEPTANCE: matched + adapted + absent === every record, nothing silently dropped.
  //
  // indexBy(records, keyField) → { key: record }. Decoupled from WHERE registries load: the host
  // (browser: window._canonicalCharbuild + _canonicalRegistries + the vehicle library; node guard: the
  // JSON files) builds `index = { <type>: indexBy(records, keyField) }` and passes it in. The key field
  // differs by type — canonical registries join on `_source_key` (field map §A); the vehicle library on
  // `key`. Resolution is (type, key) SCOPED to the one registry the type designates (R-OGG-11/12): a
  // careers key is looked up in `index.careers` and nowhere else.
  // SPECIES INDEX — the `_source_key` index PLUS the CSG key map, inverted (B-282 as re-aimed,
  // ruling `ogg-b282-premise-and-import-species` R-BPI-2).
  //
  // R-OGG-25 boarded the two-vocabularies problem and did not reconcile it: 408 of our 537 species
  // store a CSG-SPREADSHEET ROW ID where a save names a mnemonic key. indexBy correctly refuses
  // numeric keys as join targets (R-OGG-24) — they can never match — so those species resolved to
  // NOTHING and the character imported with no species at all. `lib/shared/oggCsgMap.json` is the
  // reconciliation R-OGG-25 was waiting for; turned around it reads dataset key -> our id, which is
  // exactly the join this index needs. No new source, no hand-maintained table.
  //
  // A REAL KEY IS NEVER OVERRIDDEN. Our stock `droid` record owns 'DROID' through its own
  // _source_key and the map would also point 'DROID' at `csg_droid`; the record that OWNS the key
  // wins, and the alias only fills a slot nothing else claims. That is what keeps this additive:
  // no character that imported correctly yesterday resolves differently today.
  function indexSpecies(records, csgMap) {
    var idx = indexBy(records, '_source_key');
    var byId = {};
    (Array.isArray(records) ? records : (records ? Object.keys(records).map(function (k) { return records[k]; }) : []))
      .forEach(function (r) { if (r && r.id) byId[r.id] = r; });
    var mapped = (csgMap && csgMap.speciesKeyById) || {};
    Object.keys(mapped).forEach(function (ourId) {
      var datasetKey = mapped[ourId];
      var rec = byId[ourId];
      if (!rec || !datasetKey || idx[datasetKey]) return;   // never override a record that owns it
      if (/^\d+$/.test(String(datasetKey))) return;         // R-OGG-24 holds for aliases too
      idx[String(datasetKey)] = rec;
    });
    // B-293 — KEEP the map this function was already given. `player/app.jsx` hands the importer an
    // index and no csgMap, and the B-293 card fences that file off; retaining what we were passed
    // is not new plumbing, it is not discarding it. NON-ENUMERABLE so every existing consumer —
    // Object.keys, for-in, JSON.stringify, resolveManifest's probes — behaves exactly as before.
    try { Object.defineProperty(idx, '_csgMap', { value: csgMap || null, enumerable: false }); }
    catch (e) { /* frozen/exotic object: the bridge simply stays unavailable, as it was before */ }
    return idx;
  }

  // The file's specializations with its starting one first (by isStartingSpec, else StartingSpecKey); the rest keep their
  // order. Pure; a list with no starting mark comes back as it was.
  function _startingFirst(list, startKey) {
    var at = -1;
    list.forEach(function (s, i) { if (at < 0 && s && s.isStarting) at = i; });
    if (at < 0 && startKey) list.forEach(function (s, i) { if (at < 0 && s && s.key === startKey) at = i; });
    return at <= 0 ? list.slice() : [list[at]].concat(list.slice(0, at), list.slice(at + 1));
  }
  function indexBy(records, keyField) {
    var recs = Array.isArray(records) ? records : (records ? Object.keys(records).map(function (k) { return records[k]; }) : []);
    var out = {};
    recs.forEach(function (r) {
      var k = r && r[keyField];
      if (k == null || k === '') return;
      // R-OGG-24 — EXPLICIT REFUSAL: a NUMERIC key is a CSG row index, never an OggDude key (of 2,040
      // keys in the staged OggDude Data/, zero are numeric). It can never satisfy an import join, so it
      // is not indexed as a join target. This also defuses the §A′b `339` collision (csg_ssi_ruu vs
      // csg_svivreni — both numeric) BY CONSTRUCTION, without a disambiguation tiebreak for a case the
      // data cannot produce: a probe of `339` finds nothing. (R-OGG-25: the two-vocabularies problem —
      // 408 of 537 species on numeric keys — is boarded, not reconciled here.)
      if (/^\d+$/.test(String(k))) return;
      out[String(k)] = r;
    });
    return out;
  }

  // F-100 M11 R-M11B-3 (f100-m11-build-card ADDENDUM 1) — the import room's ONE index build. `view` is the BOOK
  // view (`window._canonicalCharbuildBase`), never the device's folded discovery view: an imported sheet carries no
  // stamp (normalizeCreated gets no deps), so it resolves against the books, and a pack's record under a book id
  // (same id, the PACK's `_source_key`) would steal that book key's join. From the book view every book key joins its
  // book id whatever the switch, and a pack-only key joins nothing: the resolver puts it in `absent`, so it is never
  // written and the receipt names it.
  function importIndex(view, registries, csgMap) {
    view = view || {}; registries = registries || {};
    return {
      species: indexSpecies(view.species || {}, csgMap), careers: indexBy(view.careers || {}, '_source_key'),
      specializations: indexBy(view.specializations || {}, '_source_key'), talents: indexBy(view.talents || {}, '_source_key'),
      force_powers: indexBy(view.forcePowers || {}, '_source_key'),
      signature_abilities: indexBy(view.signatureAbilities || {}, '_source_key'),   // F-100 M12 B-1244: the book view's 38
      weapons: indexBy(registries.weapons || {}, '_source_key'), armor: indexBy(registries.armor || {}, '_source_key'),
      gear: indexBy(registries.gear || {}, '_source_key'),
    };
  }

  // adaptMap: { <type>: { <fromKey>: { toType, toKey, note } } } — DECLARED modelling differences, e.g.
  // the 10 lightsaber HILTS → their complete saber (field map §A: "we model the saber; the hilt variant
  // is an adapt-not-map row"). Applied BEFORE the absent test so an adaptable record never reports absent.
  // `toKey` is the target's OggDude key in `index[toType]`; the adapted row carries the target RECORD, so
  // assembleCore lands it exactly as a match. A target our registry lacks is ABSENT, named, never adapted
  // to nothing. The live table is ADAPT_MAP below; callers hand it in as `deps.adaptMap`.
  // R7 B-1584 (ruling release-r7-bug-burndown ADDENDUM 313; R-M11B-3 at the cell, as R-M10S-10 refuses an upgrade cell
  // that does not map): a purchased talent cell whose (row, col) on the resolved tree holds a DIFFERENT talent is pack
  // layout under book keys (reSpecialized trees reuse the book's spec and talent keys), so it is refused, never written,
  // and named in absent. A record with no drawn tree makes no claim. Never re-seated: one talent can sit in several cells.
  function offBookCell(specRec, cell, talRec) {
    var tree = specRec && specRec.talent_tree;
    if (!Array.isArray(tree) || !talRec) return false;
    var row = tree[cell.row], at = row && row.talents && row.talents[cell.col];
    return !at || at.talent !== talRec.id;
  }

  function resolveManifest(manifest, index, adaptMap) {
    var report = { matched: [], adapted: [], absent: [] };
    index = index || {}; adaptMap = adaptMap || {};
    (manifest || []).forEach(function (rec) {
      var t = rec.type, k = rec.key;
      if (k == null || k === '') { report.absent.push({ rec: rec, reason: 'no key (custom / unkeyed) — nothing invented in its place' }); return; }
      var ad = adaptMap[t] && adaptMap[t][k];
      if (ad) {
        var treg = index[ad.toType], target = treg && Object.prototype.hasOwnProperty.call(treg, String(ad.toKey)) ? treg[String(ad.toKey)] : null;
        if (target) { report.adapted.push({ rec: rec, to: ad, ourId: target.id, record: target }); return; }
        report.absent.push({ rec: rec, reason: 'adapts to ' + ad.toType + ' ' + ad.toKey + ', which is not in our ' + ad.toType + ' registry' });
        return;
      }
      var reg = index[t];
      if (reg && Object.prototype.hasOwnProperty.call(reg, String(k))) {
        var specs = t === 'talents' && rec.spec != null ? index.specializations : null;
        var specRec = specs && Object.prototype.hasOwnProperty.call(specs, String(rec.spec)) ? specs[String(rec.spec)] : null;
        if (specRec && offBookCell(specRec, rec, reg[String(k)])) {
          report.absent.push({ rec: rec, reason: 'not on our ' + (specRec.name || specRec.id) + ' tree at row ' + rec.row + ', column ' + rec.col });
          return;
        }
        report.matched.push({ rec: rec, ourId: reg[String(k)].id, record: reg[String(k)] }); return;
      }
      report.absent.push({ rec: rec, reason: 'not in our ' + t + ' registry' });
    });
    return report;
  }

  // RELEASE 1.0 R5 C8 (card `release-r5-data` ADDENDUM 2 Q2) — THE adapt table, one home. OggDude sells each
  // lightsaber's HILT as its own weapon; the books print the hilt beside its saber and we hold only the saber, so
  // the 10 hilt keys are declined in Docs/RELEASE_1_0_DECLINED.json ("hilt alone; held as the complete saber <id>")
  // and an imported hilt arrives as that saber. `toKey` is the saber's `_source_key`; the export writes the
  // saber's own key, so a round trip turns hilt → saber (disclosed). test/release_r5_hilt_adapt.cjs holds this
  // table and the declined rows to the same pairs.
  var HILT_NOTE = 'a bare hilt arrives as its complete saber';
  var ADAPT_MAP = {
    weapons: {
      LTSABERBASICHILT: { toType: 'weapons', toKey: 'LTSABERBASIC', note: HILT_NOTE },
      LTSABERDBLHILT: { toType: 'weapons', toKey: 'LTSABERDBL', note: HILT_NOTE },
      LTSABERPIKEHILT: { toType: 'weapons', toKey: 'LTSABERPIKE', note: HILT_NOTE },
      LTSABERSHOTOHILT: { toType: 'weapons', toKey: 'LTSABERSHOTO', note: HILT_NOTE },
      LTSABERTEMGUAPIKEHILT: { toType: 'weapons', toKey: 'LTSABERTEMGUAPIKE', note: HILT_NOTE },
      LTSABERGUASHHILT: { toType: 'weapons', toKey: 'LTSABERGUASH', note: HILT_NOTE },
      LTSABERCROSSHILT: { toType: 'weapons', toKey: 'LTSABERCROSSG', note: HILT_NOTE },
      BROADSABERHILT: { toType: 'weapons', toKey: 'BROADSABER', note: HILT_NOTE },
      GRLIGHTSABERHILT: { toType: 'weapons', toKey: 'GRLIGHTSABER', note: HILT_NOTE },
      LIGHTFOILHILT: { toType: 'weapons', toKey: 'LIGHTFOIL', note: HILT_NOTE },
    },
  };

  // ── the receipt (slice 4a) — the re-readable "what came across", R-OGG-19 ────────────────────────
  // MATCHED stays a COUNT (reconstructible from the character itself); ADAPTED and ABSENT persist as
  // FULL lists — they are the trust content (R-OGG1-3), small, and their whole value is being readable
  // months later. The universal OggDude "Unarmed" default (a weapon carrying NEITHER key NOR name) is
  // excluded from the user-facing absent list — every character has it, so it is not a lost item; the
  // resolver still accounted for it, so R-OGG1-3 holds at the manifest layer. (Classifying which absents
  // are homebrew-module content vs base items we don't carry needs the base catalog — a later refinement,
  // R-OGG-25-adjacent; the `reason` string already distinguishes custom/unkeyed from not-in-registry.)
  function isUnarmedDefault(rec) { return rec && rec.type === 'weapons' && !rec.key && !rec.name; }
  // B-1409 — a reward KEY's display name, resolved at RENDER (the record keeps the key; ruling ADDENDUM 2
  // R-1). `map` is `oggAttestation.json`'s `rewardNames` (generated from OggDude's Rewards.xml); the browser
  // hands it in from the room's boot, node reads the file the way `importToCharacter` reads `oggCsgMap.json`.
  // A key the map does not hold prints as is — never a name made up here.
  var _nodeRewardNames = null;
  function rewardNamesOf(keys, map) {
    if (!map && typeof module !== 'undefined' && module.exports) {
      if (_nodeRewardNames === null) {
        try {
          var _fs = require('fs'), _path = require('path');
          _nodeRewardNames = JSON.parse(_fs.readFileSync(_path.resolve(__dirname, 'oggAttestation.json'), 'utf8')).rewardNames || {};
        } catch (e) { _nodeRewardNames = {}; }
      }
      map = _nodeRewardNames;
    }
    map = map || {};
    return (keys || []).map(function (k) { return map[k] || k; });
  }

  // ── Rewards (R6 lane C; ruling `release-r6-rewards-c0` R-R6RC-2..4; release-r4-shapes S2 + ADDENDUM 4) ─────────────────
  // Each <CharReward> becomes ONE S2 row through `rewards.json` (handed in, or in node read from the file):
  //   a bought type (ALLY …)  `tier` = its option; `xp` = the tiers up to it SUMMED (S2; the file's own per-option XP is the
  //                           price of that tier, so it is not read)
  //   HONTITLE                the kind option → the kind's two skills (R-R6RC-2: the kind is derived from them, never
  //                           stored); the strength option → `tier`
  //   REP                     the level option → `tier` and `level`, agreeing
  //   BS                      the severity option → `tier` and its price; the talent option → `talent` (its talents.json id)
  //   MAKERSMARK              <SelectedCraftImprovementKey> → `improvement`, the crafting_spend row whose ogg_key it is
  //   an honour               its option → `tier`
  // LEFT IN THE FILE (a receipt row, D-273): a key the registry does not hold (JEDI, R-R6RC-1) and an improvement key no
  // crafting_spend row carries (R-R6RC-3: "An unresolvable key is a receipt row"); the row itself still comes across
  // with `improvement: null`. OggDude's name for a reward is unattested (ruling D1), so `name` imports as ''.
  // → { held: [S2 rows], left: [{ key, reason }] }
  function rewardsOf(parsed, rewardsReg, spendReg) {
    var types = (rewardsReg && (rewardsReg.types || rewardsReg)) || {};
    var byOgg = {};
    var spend = (spendReg && (spendReg.spend || spendReg)) || {};
    Object.keys(spend).forEach(function (cat) {
      ['improvements', 'flaws'].forEach(function (side) {
        ((spend[cat] && spend[cat][side]) || []).forEach(function (r) { if (r && r.ogg_key) byOgg[r.ogg_key] = r.id; });
      });
    });
    var held = [], left = [], n = 0;
    ((parsed && parsed.rewards) || []).forEach(function (cr) {
      var t = Object.prototype.hasOwnProperty.call(types, cr.key) ? types[cr.key] : null;
      if (!t || t.ogg_key !== cr.key) { left.push({ key: cr.key, reason: 'no such reward here' }); return; }
      var pick = function (choice) { var o = (cr.options || []).filter(function (x) { return x.choice === choice; })[0]; return o ? o.option : null; };
      var row = { id: 'rwd-ogg' + (n++).toString(36), key: cr.key, tier: null, name: '', level: null, skills: [], xp: 0, talent: null };
      if (cr.key === 'HONTITLE') {
        var kind = (t.kinds || []).filter(function (k) { return k.key === pick(t.kind_choice); })[0];
        if (kind) row.skills = kind.skills.slice();
      }
      var opt = pick(t.choice);
      var ti = -1;
      (t.tiers || []).forEach(function (x, i) { if (x.key === opt) ti = i; });
      if (ti >= 0) {
        row.tier = opt;
        row.xp = t.kind === 'bought' ? t.tiers.slice(0, ti + 1).reduce(function (a, x) { return a + x.xp; }, 0) : t.tiers[ti].xp;
      } else if (opt) {
        var o = (t.options || []).filter(function (x) { return x.key === opt; })[0];
        row.tier = opt;
        if (o && cr.key === 'REP') row.level = o.level;
      }
      if (cr.key === 'BS') {
        var tal = (t.options || []).filter(function (x) { return x.key === ((cr.options || []).filter(function (y) { return y.choice !== t.choice; })[0] || {}).option; })[0];
        if (tal) row.talent = tal.talent;
      }
      if (cr.key === 'MAKERSMARK') {
        var imp = (cr.options || []).map(function (x) { return x.improvement; }).filter(Boolean)[0] || null;
        row.improvement = imp && Object.prototype.hasOwnProperty.call(byOgg, imp) ? byOgg[imp] : null;
        if (imp && !row.improvement) left.push({ key: cr.key, reason: 'its crafting result ' + imp + ' is not one we hold', improvement: imp });
      }
      held.push(row);
    });
    return { held: held, left: left };
  }
  // The sheet half, run by the caller after normalizeCreated (the settleSchematics pattern): the held rows become
  // sheet.rewards, and the XP they cost moves into the ONE ledger (spent + Σxp, remaining − Σxp): normalizeCreated derives
  // `spent` from the build, which holds no reward, while the file's total already counts it (UsedExperience). None → nothing.
  // The Σ is CharResolve.sheetOwnedXpSpend's, the ONE sum of a sheet-owned row's persisted xp (ruling release-r6-rewards C2).
  function settleRewards(out, sheet) {
    var held = (out && out.rewards) || [];
    if (!sheet || !held.length) return;
    sheet.rewards = held.map(function (r) { return JSON.parse(JSON.stringify(r)); });
    var cost = _CR.sheetOwnedXpSpend({ rewards: sheet.rewards });
    if (cost && sheet.xp) {
      var xp = sheet.xp, left = xp.remaining != null ? Number(xp.remaining) || 0 : (Number(xp.total) || 0) - (Number(xp.spent) || 0);
      sheet.xp = Object.assign({}, xp, { spent: (Number(xp.spent) || 0) + cost, remaining: left - cost });
    }
  }

  // R7 B-1038's told line (ruling release-r7-bug-burndown ADDENDUM 33, R-Y2-1 shape on paper): the import-moment record
  // report.xpCounted = { file: the file's <UsedExperience>, sheet: sheet.xp.spent as imported }, written ONLY when they
  // differ, and only when the file HOLDS a <UsedExperience> (ADDENDUM 40 C1; a present 0 still compares). The caller runs it LAST, after normalizeCreated and every settle* that moves spent (settleRewards). The live
  // spent stays derived; this is what the receipt told at import, never re-derived. Equal, or no file figure → nothing.
  function settleXpCounted(out, sheet) {
    var rep = out && out.oggSource && out.oggSource.report;
    var exp = out && out.parsed && out.parsed.experience;
    if (!rep || !exp || !sheet || !sheet.xp) return;
    if (!exp.usedPresent) { delete rep.xpCounted; return; }   // ADDENDUM 40 C1: no figure in the file → nothing counted, no line
    var file = Number(exp.used) || 0, mine = Number(sheet.xp.spent) || 0;
    if (file === mine) { delete rep.xpCounted; return; }
    rep.xpCounted = { file: file, sheet: mine };
  }

  // ── Schematics (R-R5CC-3; card ADDENDUM 4) ─────────────────────────────────────────────────────────────────────
  // TemplateKey → our template through its `ogg_keys` (import maps ANY listed key); Level → level. Two entries for one
  // template keep the higher level. A key no template lists is LEFT IN THE FILE (D-273), named by the file's own template
  // name. `templates` is crafting_templates.json's `templates` map (or the whole registry); absent → every key is left.
  // → { held: [{ template_id, level }], left: [{ key, name }] }
  function schematicsOf(parsed, templates) {
    var t = (templates && templates.templates) || templates || {};
    var byKey = {};
    Object.keys(t).forEach(function (id) { ((t[id] && t[id].ogg_keys) || []).forEach(function (k) { byKey[k] = id; }); });
    var held = [], at = {}, left = [];
    ((parsed && parsed.schematics) || []).forEach(function (s) {
      var id = Object.prototype.hasOwnProperty.call(byKey, s.key) ? byKey[s.key] : null;
      if (!id) { left.push({ key: s.key, name: s.name || null }); return; }
      if (Object.prototype.hasOwnProperty.call(at, id)) { held[at[id]].level = Math.max(held[at[id]].level, s.level || 0); return; }
      at[id] = held.length;
      held.push({ template_id: id, level: s.level || 0 });
    });
    return { held: held, left: left };
  }
  // The sheet half, run by the caller after normalizeCreated (the settleSigAbilities pattern): the held schematics become
  // sheet.craft_schematics; none held → the field is not written.
  function settleSchematics(out, sheet) {
    var held = (out && out.craftSchematics) || [];
    if (sheet && held.length) sheet.craft_schematics = held.map(function (s) { return { template_id: s.template_id, level: s.level }; });
  }

  // ── Companions (ruling release-r6-companions-npcs Q1 (a) + C4, Q2 (a) + C1/C2, Q3 (a); D1) ────────────────────────────
  // Each owned Adversary becomes a `sheetData.companions` row (R4 S1). Its `own` is the library's record shape, TOTALS
  // only (Q1): each characteristic and attribute is the sum of its rank children; a minion's strain is null; a skill with
  // an empty <Rank> is a group skill `{skill_ref}`; a ForceRating above 0 is the ability "Force Rating N" and a silhouette
  // other than 1 the ability "Silhouette N" (C4, the library's precedent). A key that does not resolve keeps the file's key
  // as its name and is listed by name on the receipt (C4, R-OGG-19). `ref` instead of `own` only on a unique case-blind
  // name match whose characteristics, soak, wounds and tier all equal that library row (Q3). Either way the ROW carries
  // `_ogg: {key, xml, mapped}` (C1): the Adversary's <Key>, its block (LF, dedented) and SWRPGCompanions.oggMapped over
  // what the export's rebuild path reads (C2). Read by NO resolver (R-SPP-12).
  // deps: { index (importIndex), skillVocab: [entries], npcs: {id → record} }. → { rows, absent: [{type, key, name, reason}],
  // failed: [name] }. In node the vocab, npcs and the companion core are read from the repo.
  var COMPANION_CHAR = { BR: 'brawn', AG: 'agility', INT: 'intellect', CUN: 'cunning', WIL: 'willpower', PR: 'presence' };
  var _nodeCompanionDeps = null;
  function companionDeps(deps) {
    var out = { skillVocab: deps.skillVocab || null, npcs: deps.npcs || null,
      C: deps.companions || (typeof root !== 'undefined' && root && root.SWRPGCompanions) || null };
    if (typeof module !== 'undefined' && module.exports && (!out.skillVocab || !out.npcs || !out.C)) {
      if (!_nodeCompanionDeps) {   // fail soft (the schematics' rule): a module copied away from the repo reads none
        var _fs = require('fs'), _path = require('path'), C = _path.resolve(__dirname, '../../public/data/canonical');
        var rd = function (f, k) { try { return JSON.parse(_fs.readFileSync(_path.join(C, f), 'utf8'))[k]; } catch (e) { return null; } };
        var core = null;
        try { core = require('./companions.js'); } catch (e) { core = null; }
        _nodeCompanionDeps = { skillVocab: rd('skills.vocab.json', 'entries'), npcs: rd('npcs.json', 'npcs'), C: core };
      }
      out.skillVocab = out.skillVocab || _nodeCompanionDeps.skillVocab;
      out.npcs = out.npcs || _nodeCompanionDeps.npcs;
      out.C = out.C || _nodeCompanionDeps.C;
    }
    return out;
  }
  function companionsOf(parsed, deps) {
    deps = deps || {};
    var d = companionDeps(deps), index = deps.index || {};
    var skillOf = {}, skillLabel = {};
    (d.skillVocab || []).forEach(function (e) {
      skillLabel[e.id] = e.label || e.id;
      (e.aliases || []).forEach(function (a) { skillOf[String(a).toUpperCase()] = e.id; });
    });
    var byName = {};
    Object.keys(d.npcs || {}).forEach(function (id) {
      var r = d.npcs[id], n = r && String(r.name || '').toLowerCase();
      if (n) (byName[n] = byName[n] || []).push(r);
    });
    function hit(type, key) {
      var reg = index[type];
      return reg && Object.prototype.hasOwnProperty.call(reg, String(key)) ? reg[String(key)] : null;
    }
    var rows = [], absent = [], failed = [];
    ((parsed && parsed.adversaries) || []).forEach(function (a, i) {
      var label = a.name || ('companion ' + (i + 1));
      function lost(type, key) { absent.push({ type: 'companion ' + type, key: key, name: label, reason: 'not in our ' + type + ' (' + label + ')' }); }
      try {
        var tier = String(a.type || '').toLowerCase() || 'minion';
        var ch = { brawn: 0, agility: 0, intellect: 0, cunning: 0, willpower: 0, presence: 0 };
        a.characteristics.forEach(function (c) { var k = COMPANION_CHAR[String(c.key || '').toUpperCase()]; if (k) ch[k] = c.rank; });
        var at = a.attributes || {};
        var tot = function (t) { return at[t] ? sumParts(at[t]) : 0; };
        var rec = { name: a.name || '', tier: tier, _provenance: 'custom', characteristics: ch,
          derived: { soak: tot('SoakValue'), wounds: tot('WoundThreshold'), strain: tier === 'minion' ? null : tot('StrainThreshold'),
                     melee_defense: tot('DefenseMelee'), ranged_defense: tot('DefenseRanged') },
          skills: [], talents: [], weapons: [], gear: [], abilities: [] };
        a.skills.forEach(function (s) {
          var id = skillOf[String(s.key).toUpperCase()];
          if (!id) lost('skills', s.key);
          var e = { skill_ref: id || s.key };
          if (s.rank != null) e.rank = s.rank;
          rec.skills.push(e);
        });
        a.talents.forEach(function (t) {
          var r = hit('talents', t.key);
          if (!r) { lost('talents', t.key); rec.talents.push({ talent_ref: null, name: t.key, rank: t.ranks }); return; }
          rec.talents.push({ talent_ref: r.id, name: r.name || r.id, rank: t.ranks });
        });
        a.weapons.forEach(function (w) { var r = hit('weapons', w.key); if (!r) lost('weapons', w.key); rec.weapons.push(r ? r.id : { name: w.key }); });
        a.specialWeapons.forEach(function (w) {
          var sk = skillOf[String(w.skill || '').toUpperCase()];
          if (w.skill && !sk) lost('skills', w.skill);
          rec.weapons.push({ name: w.name, skill: sk || w.skill || null, damage: { value: w.damage, base: 'flat' }, crit: w.crit,
                             range: w.range ? String(w.range).toLowerCase() : null });
        });
        a.armor.forEach(function (x) { var r = hit('armor', x.key); if (!r) lost('armor', x.key); rec.gear.push(r ? r.id : x.key); });
        a.gear.forEach(function (x) { var r = hit('gear', x.key); if (!r) lost('gear', x.key); rec.gear.push(r ? r.id : x.key); });
        a.specialArmor.forEach(function (x) { rec.gear.push(x.name); });
        a.items.forEach(function (x) { rec.gear.push(x.name); });
        a.abilities.forEach(function (ab) {
          var groups = {}, order = [];
          ab.mods.forEach(function (m) {
            Object.keys(m.counts).forEach(function (kind) {
              var n = m.counts[kind];
              if (!n) return;
              var g = kind + (n > 1 ? ' ×' + n : '');
              if (!groups[g]) { groups[g] = []; order.push(g); }
              var id = skillOf[String(m.skill || '').toUpperCase()];
              groups[g].push(id ? skillLabel[id] : m.skill);
            });
          });
          rec.abilities.push({ name: ab.name, description: order.map(function (g) { return g + ' on ' + groups[g].join(', '); }).join('; ') });
        });
        if (a.silhouette != null && a.silhouette !== 1) rec.abilities.push({ name: 'Silhouette ' + a.silhouette });
        var fr = tot('ForceRating');
        if (fr > 0) rec.abilities.push({ name: 'Force Rating ' + fr });
        var cands = rec.name ? (byName[rec.name.toLowerCase()] || []) : [];
        var lib = cands.length === 1 ? cands[0] : null;
        var same = lib && lib.tier === tier && (lib.derived || {}).soak === rec.derived.soak && (lib.derived || {}).wounds === rec.derived.wounds
          && Object.keys(ch).every(function (k) { return (lib.characteristics || {})[k] === ch[k]; });
        var row = same ? { ref: lib.id, own: null, name: '' } : { ref: null, own: rec, name: '' };
        row.young = false; row.mount = null;
        row._ogg = { key: a.key || null, xml: a.xml, mapped: d.C.oggMapped(same ? lib : rec, row) };
        rows.push(row);
      } catch (e) { failed.push(label); }
    });
    return { rows: rows, absent: absent, failed: failed };
  }
  // The sheet half (the settleSchematics pattern): the brought companions become sheet.companions; none → not written.
  function settleCompanions(out, sheet) {
    var rows = (out && out.companions) || [];
    if (sheet && rows.length) sheet.companions = JSON.parse(JSON.stringify(rows));
  }

  // ── Signature Vehicle (release-r5-rigger-card ADDENDUM 2 C2; ruling oggdude-decompile R-ODC-2) ───────────────────────
  // The host's step on the sheet normalizeCreated made (the settleSchematics pattern). The file's Rigger · VehicleKey names the
  // <CharVehicle> whose <Key> equals it; that vehicle's <ItemKey> is a Ship Yard vehicle key (the vehicle library's `key`, which
  // is OggDude's). The ship that becomes MY SHIP is the ONE vessel on this device with that key that this character may bond
  // (vesselResolve.resolveBond's rule: the party's, or this character's own; neither retired nor destroyed; a built frame has no
  // OggDude key). The bond is written by the bond's own writer (vesselResolve.markRefusal, then markMyShip) into
  // sheet.myShipId, and no other field. No vessel is ever created here (the card's STOP clause stands for that).
  // An empty VehicleKey is no Signature Vehicle: nothing is written and no row is drawn (D-144: a line only when something is
  // left off). Otherwise every outcome is one record on out.oggSource.report.rigger, with its player line when no bond was set:
  //   BONDED · NO_VEHICLE (the key matches no <CharVehicle>) · CUSTOM (that vehicle has no ItemKey) · NO_SHIP · SEVERAL
  //   (more than one ship qualifies; never guessed) · REFUSED (markRefusal: held, too_large).
  // opts: { vessels (list or store state), vehicles (key → row: a function, a list of rows or a map), characterId?, talents?
  //         ({ <talent id>: ranks }, the resolver ctx's), roster? (resolver ctx characters, for markRefusal's `held`),
  //         vesselResolve? }
  // → the record, or null when the file names no Signature Vehicle.
  function settleRigger(out, sheet, opts) {
    opts = opts || {};
    var rg = out && out.parsed && out.parsed.rigger;
    if (!sheet || !rg || !nz(rg.vehicleKey)) return null;
    var VR = opts.vesselResolve || (typeof root !== 'undefined' && root.SWRPGVesselResolve)
      || (typeof module !== 'undefined' && module.exports ? require('./vesselResolve.js').SWRPGVesselResolve : null);
    var vessels = Array.isArray(opts.vessels) ? opts.vessels : ((opts.vessels && opts.vessels.vessels) || []);
    var look = opts.vehicles;
    function rowOf(k) {
      if (!nz(k)) return null;
      if (typeof look === 'function') return look(k) || null;
      if (Array.isArray(look)) return look.filter(function (r) { return r && r.key === k; })[0] || null;
      return (look && look[k]) || null;
    }
    var cv = ((out.parsed.vehicles) || []).filter(function (v) { return v && v.guid === rg.vehicleKey; })[0] || null;
    var vrow = cv ? rowOf(cv.itemKey) : null;
    var name = (vrow && vrow.name) || (cv && (cv.name || cv.itemKey)) || 'your Signature Vehicle';
    var recd;
    function no(status, detail, player) { recd = { status: status, vehicleKey: rg.vehicleKey, itemKey: (cv && cv.itemKey) || null,
      vessel: null, detail: detail, player: player }; }
    if (!cv) no('NO_VEHICLE', 'Rigger.VehicleKey matches no <CharVehicle> Key in the file',
      'The file names a Signature Vehicle that isn\'t in it, so no ship is marked as yours.');
    // finding 8 (release-r5-f1-drawings): a custom vehicle with no name of its own falls to the fallback above, and the line
    // doubled it ("Your Signature Vehicle, your Signature Vehicle, is…"); with no name the line names none
    else if (!nz(cv.itemKey)) no('CUSTOM', 'the <CharVehicle> has no ItemKey (a custom vehicle)', nz(cv.name)
      ? 'Your Signature Vehicle, ' + name + ', is a custom ship in OggDude, so no ship is marked as yours.'
      : 'Your Signature Vehicle is a custom ship in OggDude, so no ship is marked as yours.');
    else if (!VR) no('NO_SHIP', 'no Ship Yard resolver loaded', 'Your Signature Vehicle, ' + name + ', isn\'t in this device\'s Shipyard, so no ship is marked as yours.');
    else {
      var me = { id: opts.characterId, sheetData: sheet, talents: opts.talents || {} };
      var fits = vessels.filter(function (r) {
        if (!r || r.vehicleKey !== cv.itemKey || (r.build && r.build.frame)) return false;
        return VR.resolveBond(VR.markMyShip(me, r.id, vessels), vessels) === r;
      });
      if (!fits.length) no('NO_SHIP', 'no bondable Ship Yard vessel with vehicleKey ' + cv.itemKey,
        'Your Signature Vehicle, ' + name + ', isn\'t in this device\'s Shipyard, so no ship is marked as yours.');
      else if (fits.length > 1) no('SEVERAL', fits.length + ' bondable Ship Yard vessels with vehicleKey ' + cv.itemKey,
        'This device\'s Shipyard holds more than one ' + name + ', so no ship is marked as yours. Mark yours on your sheet.');
      else {
        var refusal = VR.markRefusal(me, fits[0].id, vessels, vrow, opts.roster || []);
        if (refusal) no('REFUSED', 'markRefusal: ' + refusal.kind, refusal.kind === 'held'
          ? name + ' is already another character\'s Signature Vehicle, so it isn\'t marked as yours.'
          : name + ' is too big to be your Signature Vehicle, so it isn\'t marked as yours.');
        else {
          sheet.myShipId = VR.markMyShip(me, fits[0].id, vessels).sheetData.myShipId;
          recd = { status: 'BONDED', vehicleKey: rg.vehicleKey, itemKey: cv.itemKey, vessel: sheet.myShipId, detail: null, player: null };
        }
      }
    }
    var rep = out.oggSource && out.oggSource.report;
    if (rep) rep.rigger = recd;
    return recd;
  }

  function buildReport(resolveReport, parsed, schemLeft, comp, rewardsLeft) {
    var r = resolveReport || { matched: [], adapted: [], absent: [] };
    var out = {
      matched: (r.matched || []).length,
      adapted: (r.adapted || []).map(function (a) {
        return { from: (a.rec && (a.rec.name || a.rec.key)) || null,
                 to: a.record ? a.record.name : (a.to ? (a.to.toKey || a.to.toName || null) : null),
                 note: a.to ? (a.to.note || null) : null };
      }),
      absent: (r.absent || []).filter(function (a) { return !isUnarmedDefault(a.rec); }).map(function (a) {
        return { type: a.rec.type, key: a.rec.key || null, name: a.rec.name || null, reason: a.reason };
      }).concat((comp && comp.absent) || []),   // ruling release-r6-companions-npcs C4: a companion's unresolved keys, by name
    };
    // B-1409 — LEFT IN THE FILE: the companions the parser strips and the rewards nothing imports, by
    // count and by the file's own data (names for companions, KEYS for rewards — a reward's display name
    // is resolved at render through `rewardNamesOf`, never persisted). Absent when there is nothing, the
    // same rule D-144 gives the Force line; an entry is present only when its count is above zero.
    // RETIRED-BY: R4's S1/S2 import (R5) brings these across and retires this row for what it imports.
    if (parsed && parsed.leftOut) {
      var lo = [];
      // RETIRED for the companions brought across (ruling release-r6-companions-npcs D1): only an Adversary that failed to
      // import stays LEFT IN THE FILE, by name.
      var failedComp = (comp && comp.failed) || null;
      var lc = parsed.leftOut.companions || { count: 0, names: [] };
      if (failedComp ? failedComp.length : lc.count) {
        lo.push(failedComp ? { kind: 'companions', count: failedComp.length, names: failedComp.slice() }
                           : { kind: 'companions', count: lc.count, names: lc.names.slice() });
      }
      // R6 lane C (card R-R6B-1; ruling release-r6-rewards-c0 D2): B-1409's Rewards half RETIRES for what the import brings
      // across; what stays is what rewardsOf left (JEDI, a key we do not hold, an unresolvable Maker's Mark result). With no
      // `rewardsLeft` handed in (an old caller), every key stays, as before.
      var rk = rewardsLeft ? rewardsLeft.map(function (x) { return x.key; }) : (parsed.leftOut.rewardKeys || []);
      if (rk.length) lo.push({ kind: 'rewards', count: rk.length, keys: rk.slice() });
      // release-r5-crafting-sm (card ADDENDUM 4): a schematic for a template we do not hold, named by the file's name
      if (schemLeft && schemLeft.length) {
        lo.push({ kind: 'schematics', count: schemLeft.length, keys: schemLeft.map(function (s) { return s.key; }),
                  names: schemLeft.map(function (s) { return s.name || s.key; }) });
      }
      // release-r5-rigger (card ADDENDUM 2 C2): a WeaponIndex other than -1 is LEFT IN THE FILE (D-273), by its value
      var rgw = parsed.rigger && parsed.rigger.weaponIndex;
      if (typeof rgw === 'number' && rgw !== -1) lo.push({ kind: 'rigger_weapon', count: 1, index: rgw });
      if (lo.length) out.leftOut = lo;
    }
    // R-OGG-22 — the portrait is a receipt row like any other: brought across (and re-encoded, since a
    // lossy re-encode nobody mentioned would be a silent change), or absent. The re-encode is a browser
    // step at wiring; `brought` records that a portrait was present to carry.
    if (parsed) out.portrait = { brought: !!parsed.portrait };
    // R-BPI-3 — visibility WITHOUT a guard that could never be red. The file's species-option
    // payloads are not read, and the receipt says so along with why that is safe: OggDude persists
    // the RESULT beside the RULE, and the result is what we consume. Stated, never silent.
    if (parsed && parsed.species && (parsed.species.optionPayloadKinds || []).length) {
      out.speciesOptions = {
        kinds: parsed.species.optionPayloadKinds,
        note: 'this file states its species options twice — as the rule (' +
              parsed.species.optionPayloadKinds.join(', ') + ') and as the result, in the skill and ' +
              'characteristic ledgers. We read the ledgers, so nothing here is lost; the rule text ' +
              'itself is not carried.',
      };
    }
    // R-OGG1-16 — where the file's grant record and its spend DISAGREE, the receipt says so. An XP total
    // quietly synthesised is exactly the silent change R-OGG1-3 exists to prevent: "your file records N
    // granted but M spent — we set your total to M, so nothing is lost; unspent XP could not be
    // determined." Only when the grant record undercounts the spend (used > granted).
    if (parsed && parsed.experience && parsed.experience.used > parsed.experience.granted) {
      out.xp = { granted: parsed.experience.granted, spent: parsed.experience.used,
                 total: parsed.experience.total, note: 'grant record incomplete — total set to XP spent; unspent XP could not be determined' };
    }
    // C-OGG1-3 — force-power UPGRADE cells. F-100 M10 (R-M10S-10): they are CARRIED now (forceUpgradeCells, by
    // lowercased Key into the power's `upgrades`); R-OGG1-3 still holds for the rest — a purchased upgrade this app's
    // tree does not hold is REFUSED and NAMED here, never silently dropped. A base cell (col0/row0) IS the power.
    // B-225 / R-OGG1-3 — the enumerated/owned split, stated per class. Filtering catalog echoes is
    // a SHRINK, and an unexplained shrink is the same defect inverted: the receipt says how many the
    // file listed and how many the character owns, so the difference is disclosed rather than
    // discovered. Mechanics voice: plain counts, no euphemism.
    if (parsed) {
      var talListed = 0, talOwned = 0;
      (parsed.specializations || []).forEach(function (sp) {
        (sp.talents || []).forEach(function (t) { if (!t.key) return; talListed++; if (t.purchased) talOwned++; });
      });
      var fpListed = (parsed.forcePowers || []).filter(function (f) { return f.key; }).length;
      var fpOwned = (parsed.forcePowers || []).filter(function (f) {
        return f.key && (f.nodes || []).some(function (n) { return n.purchased; });
      }).length;
      out.ownership = {};
      if (fpListed) out.ownership.force_powers = { listed: fpListed, owned: fpOwned,
        note: fpListed + ' force powers listed by the file, ' + fpOwned + ' owned and imported — the rest are the catalog, not your character' };
      if (talListed) out.ownership.talents = { listed: talListed, owned: talOwned,
        note: talListed + ' talent cells listed by the file, ' + talOwned + ' purchased and imported — the rest are unbought tree cells' };
    }
    if (parsed && parsed.forcePowers) {
      // R-M10S-10: `count` = the upgrades CARRIED, plus the REFUSED list. A power that did not resolve carries none of
      // its upgrades — each is refused here by name (the power's own absence is reported with the other records).
      var carriedN = 0, refusedAll = [], refusedPowers = [];
      parsed.forcePowers.forEach(function (fp) {
        if (!(fp.nodes || []).some(function (n) { return n.purchased; })) return;   // the catalog, not the character
        var m = ((r && r.matched) || []).find(function (x) { return x.rec && x.rec.type === 'force_powers' && x.rec.key === fp.key; });
        var cells = forceUpgradeCells(fp, m ? m.record : null);
        carriedN += cells.carried.length;
        refusedAll = refusedAll.concat(cells.refused);
        // D-144: the power's DISPLAY name — ours when it resolved, else the file's own <Name> — once per power
        var nm = (m && m.record && m.record.name) || fp.name || 'a power with no name';
        if (cells.refused.length && refusedPowers.indexOf(nm) === -1) refusedPowers.push(nm);
      });
      // Jason D-144: the receipt DRAWS a Force line only when something was left off (`refused`); the data keeps the
      // carried count beside it (R-M10S-10).
      if (carriedN + refusedAll.length > 0) out.forceUpgrades = { count: carriedN, refused: refusedAll, refusedPowers: refusedPowers,
        note: carriedN + ' purchased Force power upgrade' + (carriedN === 1 ? '' : 's') + ' carried'
          + (refusedAll.length ? '; ' + refusedAll.length + ' not in this app\'s power trees, left off: ' + refusedAll.join(', ') : '') };
    }
    if (parsed && parsed.sigAbilities) {
      // F-100 M12 B-1244: the signature abilities' cells — CARRIED (sigAbilityCells) plus the REFUSED list, as forceUpgrades.
      // This is the KEY half; settleSigAbilities adds the legality half (V1–V7) once the sheet exists. D-144's posture: the
      // data keeps the count; a line is drawn only when something was left off.
      var sCarried = 0, sRefused = [], sNames = [];
      parsed.sigAbilities.forEach(function (sa) {
        if (!(sa.nodes || []).some(function (n) { return n.purchased; })) return;
        var m = ((r && r.matched) || []).find(function (x) { return x.rec && x.rec.type === 'signature_abilities' && x.rec.key === sa.key; });
        if (!m) return;                           // the ability's own absence is reported with the other records
        var cells = sigAbilityCells(sa, m.record);
        sCarried += cells.owned.length;
        sRefused = sRefused.concat(cells.refused);
        var nm = (m.record && m.record.name) || sa.name || 'a signature ability with no name';
        if (cells.refused.length && sNames.indexOf(nm) === -1) sNames.push(nm);
      });
      if (sCarried + sRefused.length > 0) out.sigAbilities = sigReceipt(sCarried, sRefused, sNames, [], sRefused.length);
    }
    return out;
  }
  // The receipt's signature-ability record, written in ONE place (buildReport's key half, settleSigAbilities' whole):
  // { count: boxes carried, refused: ['<ABILITY>/<KEY>' | '<ABILITY>'], refusedAbilities: [display names], problems:
  // [{ ability, check, pos?, words }] (V1–V7's own words, CharResolve's SIG_WORDS), boxesLeftOff, note }.
  // `boxesLeftOff` is the PURCHASED BOXES left off (f100-m12-build-card R-M12B-39): a key the trees lack is 1; an ability
  // refused whole counts every box the save owned in it — so it can exceed refused.length, which names entries.
  function sigReceipt(count, refused, names, problems, boxesLeftOff) {
    return { count: count, refused: refused, refusedAbilities: names, problems: problems, boxesLeftOff: boxesLeftOff,
      note: count + ' purchased signature ability box' + (count === 1 ? '' : 'es') + ' carried'
        + (boxesLeftOff ? '; ' + boxesLeftOff + ' left off: ' + refused.join(', ') : '') };
  }

  // F-100 M12 B-1244 (rulings f100-m12-census-card R-M12C-40, f100-m12-build-card R-M12B-8; D-144) — THE IMPORT'S LEGALITY
  // STEP, run by the host on the sheet `normalizeCreated` made from `out.character` (the checks read the sheet's career,
  // specializations and owned tree cells, which exist only then). Through CharResolve.sigAbilityChecks — the ONE V1–V7,
  // key-independent — never a copy:
  //   an entry failing V0–V4 is LEFT OFF whole; a cell failing V5–V7 is left off and the cells that still join the base
  //   stand (an entry left with no standing cell is left off whole);
  //   everything left off is named on `out.oggSource.report.sigAbilities` beside the key half buildReport wrote;
  //   XP stays the file's — nothing is charged (R-M12C-36).
  // Mutates `sheet.signatureAbilities` (deleted when nothing stands) and the report; returns the report's record (or null).
  function settleSigAbilities(out, sheet, charbuild) {
    if (!sheet || !Array.isArray(sheet.signatureAbilities) || !sheet.signatureAbilities.length) return null;
    var rep = out && out.oggSource && out.oggSource.report;
    var prev = (rep && rep.sigAbilities) || { refused: [], refusedAbilities: [], problems: [] };
    var refused = prev.refused.slice(), names = prev.refusedAbilities.slice(), problems = prev.problems.slice();
    var leftOff = prev.boxesLeftOff != null ? prev.boxesLeftOff : prev.refused.length;
    var keep = [], count = 0;
    var checks = (_CR && typeof _CR.sigAbilityChecks === 'function') ? _CR.sigAbilityChecks(sheet, charbuild) : [];
    checks.forEach(function (c) {
      var key = (c.rec && c.rec._source_key) || String(c.id).toUpperCase();
      var entryLevel = c.problems.some(function (p) { return /^V[0-4]$/.test(p.check); });
      // the standing cells, in the entry's own (tree) order — never the search's
      var standSet = entryLevel ? [] : c.cells.map(function (x) { return x.pos; });
      var stand = (Array.isArray(c.entry.owned) ? c.entry.owned : []).map(String)
        .filter(function (p, i, a) { return standSet.indexOf(p) !== -1 && a.indexOf(p) === i; });
      c.problems.forEach(function (p) { problems.push({ ability: c.name, check: p.check, pos: p.pos || null, words: p.words }); });
      // R-M12B-39: every owned box that does not stand is a purchased box left off (a whole refusal: all of them)
      var ownedU = (Array.isArray(c.entry.owned) ? c.entry.owned : []).map(String).filter(function (p, i, a) { return a.indexOf(p) === i; });
      leftOff += ownedU.length - stand.length;
      if (!stand.length) refused.push(key);
      else {
        c.problems.forEach(function (p) {
          var cell = p.pos && (_CR.sigTreeCells(c.rec).filter(function (x) { return x.pos === p.pos; })[0]);
          refused.push(key + '/' + (cell ? String(cell.ability).toUpperCase() : (p.pos || '?')));
        });
        keep.push({ id: c.entry.id, tree: c.entry.tree, owned: stand });
        count += stand.length;
      }
      if ((entryLevel || !stand.length || c.problems.length) && names.indexOf(c.name) === -1) names.push(c.name);
    });
    if (keep.length) sheet.signatureAbilities = keep; else delete sheet.signatureAbilities;
    var recd = sigReceipt(count, refused, names, problems, leftOff);
    if (rep) rep.sigAbilities = recd;
    return recd;
  }

  // R-OGG-20 — the retained raw source is kept PORTRAIT-STRIPPED. The portrait (up to 273 KB) rides in
  // sheet.portrait re-encoded (R-OGG-21); keeping it in the raw source too would store it twice. The
  // 'STRIPPED' sentinel matches the parser's own portrait-presence test (a re-parse reports no portrait).
  function stripPortrait(rawXml) {
    return String(rawXml == null ? '' : rawXml).replace(/<Portrait>[\s\S]*?<\/Portrait>/g, '<Portrait>STRIPPED</Portrait>');
  }

  // sheet.oggSource — provenance, READ BY NO RESOLVER (R-SPP-12), absent-tolerant (a native character has
  // none). The host supplies the environment facts it cannot compute here: `ref` (the side-store key for
  // the stripped raw XML, R-OGG-20), `sourceHash`, `importedAt`, `filename`. Pure assembly, no I/O.
  function buildOggSource(source, report) {
    source = source || {};
    return {
      ref: source.ref || null, filename: source.filename || null,
      version: source.version || 'SWCharGen v2.3',
      importedAt: source.importedAt || null, sourceHash: source.sourceHash || null,
      report: report || null,
    };
  }

  // ── assembly (slice 3) — build the character object the EXISTING creator core consumes ──────────
  // R-OGG1-4: import resolves keys → our ids and hands the result to `normalizeCreated`, NEVER a fifth
  // assembly path. `character.species/career` carry our `id` (identity), not the OggDude key (the join
  // key) — the two are distinct (R-OGG-24). Characteristics (B-778): the LIVE value is
  // SpeciesRanks + TalentRanks + PurchasedRanks from the ledger (§B.1), mapped from OggDude's
  // characteristic keys to ours, and the TalentRanks part is ALSO handed over on its own as
  // `characteristicGainsAfterCreation` so the creation-time stamp the thresholds read excludes it.
  // SLICE 3a: identity / species / career / characteristics / gameLine.
  // SLICE 3b (this commit): skills · specializations · talents · gear inventory · force powers · the
  // narrative mechanic · the earned-XP pool — every keyed record mapped to our id by CONSUMING the
  // resolver's decisions (deps.resolveReport), never re-resolving (one resolution path, §5). A record
  // the resolver put in `absent` is skipped here — nothing is invented in its place (R-OGG1-3).
  var CHAR_KEY = {
    BR: 'brawn', BRAWN: 'brawn', AG: 'agility', AGILITY: 'agility', INT: 'intellect', INTELLECT: 'intellect',
    CUN: 'cunning', CUNNING: 'cunning', WIL: 'willpower', WILL: 'willpower', WILLPOWER: 'willpower',
    PR: 'presence', PRES: 'presence', PRESENCE: 'presence',
  };
  // RAW skill-advancement cost (eote p.104 / charResolve.skillRankCost): rank×5, +5 if out-of-career.
  // Local copy — oggImport.js is dependency-free and cannot import charResolve. The reconstructed
  // per-rank costs feed the creator state's `bought[]`, which normalizeCreated sums for xpSpentOnSkills.
  function oggSkillCost(newRank, inCareer) { return newRank * 5 + (inCareer ? 0 : 5); }
  // Game line is not tagged in an OggDude save (field map §B, ADAPT) — inferred from the narrative
  // mechanic present: Duty → aor, Morality → fad, Obligation → eote.
  function inferGameLine(parsed) {
    if (parsed.duties && parsed.duties.length) return 'aor';
    if (parsed.morality && parsed.morality.strengthKey) return 'fad';
    return 'eote';
  }
  // The full empty-character shape `normalizeCreated` expects (player/index.html createEmptyCharacter).
  // In the BROWSER the importer passes the REAL createEmptyCharacter as deps.emptyCharacter (no second
  // definition on the live path); this fallback keeps assembleCore node-testable. Kept in sync by the
  // assembly guard, which runs the real core over it.
  function baseCharacter(gl) {
    return {
      id: 'ogg-import', meta: { schemaVersion: 1 }, gameLine: gl,
      identity: { name: '', playerName: '' }, narrative: { backstory: '' }, appearance: {},
      species: null, career: null, specializations: [],
      characteristics: { brawn: 2, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
      derived: { woundThresholdBonus: 0, strainThresholdBonus: 0, soakBonus: 0, meleeDefenseBonus: 0, rangedDefenseBonus: 0, forceRatingBonus: 0 },
      skills: {}, talents: {}, forcePowers: {}, mechanic: null, forceSensitive: false,
      gearLedger: { startingCredits: 500, credits: 500, inventory: [] },
      pocketMoney: null, motivations: { strength: null, flaw: null, desire: null, fear: null }, notes: { personal: '', gm: '' },
    };
  }

  // Narrative mechanic, in `CharResolve.mechanicRecord`'s shape — the ONE constructor of the persisted
  // record (the engine moved out of the shell into the core; this used to rebuild the object by hand).
  // As-PLAYED: finalValue is the save's current magnitude (a played Morality is 96, not a creation 50).
  // descriptor is the KEY (DutKey/ObKey/StrengthKey) — normalizeCreated reads it directly and, for
  // morality, resolves the strength/weakness NAMES from morPairs by that key.
  var _CR = (typeof root !== 'undefined' && root.CharResolve) || (typeof require === 'function' ? require('./charResolve.js') : null);
  function buildMechanic(parsed, gl) {
    // R7 R-R7-O3: the file's creation-bonus flags become the trade PICKS (tradeIds) through OB_DUTY_TRADES. Only the picks are
    // recorded: finalValue stays the file's as-played Size (re-entry derives the base by subtraction, R-RTD-1), the XP pool is
    // the file's total (below), and a credits trade is already inside the file's credit pool (R-R7-O1).
    function pack(type, key, value, entries) {
      var tw = OB_DUTY_TRADES[type];
      var flags = type === 'obligation' ? parsed.obOptions : (type === 'duty' ? parsed.dutOptions : null);
      var ids = (tw && flags) ? flags.map(function (f) { return tw.flags[f]; }).filter(Boolean) : [];
      // R7 B-1538: the morality <Option>s through MORALITY_TRADES. Recorded as a pick only, like the flags above: finalValue
      // stays the file's as-played MoralityValue, which already holds the +21, so the delta is never applied a second time.
      if (type === 'morality') ids = ((parsed.morality && parsed.morality.options) || [])
        .map(function (o) { return MORALITY_TRADES.options[o]; }).filter(Boolean);
      return _CR.mechanicRecord({ type: type, descriptor: key || '', baseValue: value || 0, finalValue: value || 0, entries: entries, tradeIds: ids });
    }
    if (parsed.duties && parsed.duties.length) {
      return pack('duty', parsed.duties[0].key,
        parsed.duties[0].size, parsed.duties.map(function (d) { return { type: d.key || '', magnitude: d.size || 0 }; }));
    }
    if (parsed.morality && parsed.morality.strengthKey) {
      return pack('morality', parsed.morality.strengthKey, parsed.morality.value, undefined);
    }
    if (parsed.obligations && parsed.obligations.length) {
      return pack('obligation', parsed.obligations[0].key,
        parsed.obligations[0].size, parsed.obligations.map(function (o) { return { type: o.key || '', magnitude: o.size || 0 }; }));
    }
    return null;
  }

  function assembleCore(parsed, deps) {
    deps = deps || {};
    var gl = inferGameLine(parsed);
    var ch = typeof deps.emptyCharacter === 'function' ? deps.emptyCharacter(gl) : baseCharacter(gl);
    ch.gameLine = gl;
    ch.identity = ch.identity || {};
    ch.identity.name = parsed.name || deps.sourceName || 'Imported character';
    // R7 B-1474 (2): the file's Story is the character's backstory (narrative.backstory → sheet.backstory, normalizeCreated)
    if (parsed.story) { ch.narrative = ch.narrative || {}; ch.narrative.backstory = parsed.story; }
    ch.species = { key: deps.speciesRecord ? deps.speciesRecord.id : null, name: deps.speciesRecord ? deps.speciesRecord.name : '' };
    ch.career = { key: deps.careerRecord ? deps.careerRecord.id : null, name: deps.careerRecord ? deps.careerRecord.name : '' };

    // ── SPECIES OPTION PICKS (B-293) — the export's bridge, read BACKWARDS ────────────────────
    // Same table, both directions: a second table for the return trip is the one-shared-core
    // defect by name. Writes `speciesOption.picks`, which is G8's EXISTING pre-normalize shape
    // (`charResolve.js:1428` persists it as `sheet.speciesOptionPicks`) — no new persisted field,
    // so card term 6 holds and no save needs migrating.
    // KEYED OFF THE RESOLVED RECORD, NOT THE FILE'S SpeciesKey. A save saying <SpeciesKey>DROID</>
    // resolves to whichever of OUR records owns that key — our STOCK `droid`, which has no option
    // groups — while the CSG dataset also defines a DROID with them. Reading the bridge off the
    // file's key would write `modifications` picks onto a record that has no such group: picks for
    // a species this character is not. The record decides, and if it has no dataset key it has no
    // bridge and no picks are written.
    var csgMap = deps.csgMap || null;
    var ourKey = deps.speciesRecord && csgMap
      ? (csgMap.speciesKeyById || {})[deps.speciesRecord.id] : null;
    var brIn = ourKey ? ((csgMap.optionBridge || {})[ourKey] || null) : null;
    if (brIn) {
      var picksIn = {};
      var addPick = function (group, id) {
        if (!group) return;
        if (!picksIn[group]) picksIn[group] = [];
        // A group named by a COMPLEMENT with nothing to add still records the group as ASKED —
        // an empty list is an answer ("no jetpack"), an absent key is silence. The export reads
        // exactly that distinction back (R-PCB-2 iii).
        if (id && picksIn[group].indexOf(id) === -1) picksIn[group].push(id);
      };
      var chosen = {};
      ((parsed.species && parsed.species.options) || []).forEach(function (o) { chosen[o.choice] = o.option; });

      var applyChoices = function (choices) {
        Object.keys(choices || {}).forEach(function (ck) {
          var c = choices[ck] || {};
          var got = chosen[ck];
          if (!got || !c.ourGroup) return;
          var byOur = c.byOurOption || {};
          var hit = Object.keys(byOur).filter(function (ourId) { return byOur[ourId] === got; })[0];
          if (hit) { addPick(c.ourGroup, hit); return; }
          var comp = c.complementOf || {};
          var member = Object.keys(comp).filter(function (ourId) { return comp[ourId] === got; })[0];
          // Their "without" option: the group WAS asked and the member was not taken.
          if (member) addPick(c.ourGroup, null);
        });
      };
      applyChoices(brIn.choices);

      var ssIn = brIn.subSpecies || {};
      var theirSub = parsed.species && parsed.species.subKey;
      if (theirSub && ssIn.group) {
        var byOpt = ssIn.byOurOption || {};
        var single = Object.keys(byOpt).filter(function (ourId) { return byOpt[ourId] === theirSub; })[0];
        if (single) addPick(ssIn.group, single);
        else {
          var byset = ssIn.byPickSet || {};
          var setKey = Object.keys(byset).filter(function (k) { return byset[k] === theirSub; })[0];
          if (setKey) setKey.split('|').forEach(function (id) { addPick(ssIn.group, id); });
        }
        // The sub-species' OWN choices only exist once we know which sub-species it is.
        if ((ssIn.defs || {})[theirSub]) applyChoices(ssIn.defs[theirSub].choices);
      }
      Object.keys(picksIn).forEach(function (g) { picksIn[g].sort(); });
      if (Object.keys(picksIn).length) ch.speciesOption = { picks: picksIn };
    }
    // Characteristics — B-778: BOTH HALVES of one sum, and NOTHING ELSE changes.
    //   LIVE  `characteristics[k]`                  = SpeciesRanks + TalentRanks + PurchasedRanks
    //   GAIN  `characteristicGainsAfterCreation[k]` = TalentRanks alone, the POST-CREATION part
    // The importer read only the first and third terms, so jihn's Brawn imported as 5 where OggDude's own
    // live value is 6 (his file says 2 + 1 + 3) — the Dedication rank vanished even though the resolver
    // MATCHES `dedication` and `charResolve.js`'s own note says Dedication is persisted into
    // `characteristics`. A played character's raised chars ride PurchasedRanks; a TALENT-granted one rides
    // TalentRanks, and the two are not interchangeable.
    //
    // WHY THE GAIN IS DECLARED AND NOT JUST ADDED IN — this is the whole row, and the wrong fix is the
    // obvious one. `normalizeCreated` stamps `characteristicsAtCreation` as the LIVE block MINUS this
    // declared gain, per key (B-754 / `reentry-trade-deltas-shape` R-RTD-6). Add TalentRanks to the live
    // block and declare nothing, and there is no gain to subtract: the creation stamp inherits the
    // Dedication rank and the FROZEN wound threshold rises by one — B-736 / `threshold-freezing-shape`
    // reintroduced through the import door, where no other guard is watching. RAW is explicit: once
    // the starting value is set, later Brawn gains leave the
    // wound threshold alone (EotE p.94 · AoR p.104 · FaD p.104), and the parallel Willpower/strain sentence.
    // Declaring the gain reuses the EXISTING, already-bitten subtraction — nothing was added to
    // `charResolve.js` for this and there is no second mechanism to keep in step. The live block keeps all
    // three terms because `soak` legitimately tracks the live value for life and must move (R-TF-3).
    // ABSENT-TOLERANT, per key: a characteristic with no TalentRanks writes no gain entry, and a file with
    // none writes no block at all — so absence keeps meaning "no post-creation gain", not zero, and every
    // save without a Dedication rank imports byte-identically to before.
    // KNOWN, MEASURED, AND NOT THIS ROW'S: `normalizeCreated` derives `xp.spent` on characteristics from
    // the LIVE block, so a declared gain is also charged as though XP-purchased (jihn 545 → 605). Fixing
    // that means changing `charResolve.js`, which this row's shape forbids; it is reported, not touched.
    (parsed.characteristics || []).forEach(function (c) {
      var k = CHAR_KEY[String(c.key || '').toUpperCase()];
      if (!k) return;
      ch.characteristics[k] = (c.species || 0) + (c.talent || 0) + (c.purchased || 0);
      if (c.talent) {
        ch.characteristicGainsAfterCreation = ch.characteristicGainsAfterCreation || {};
        ch.characteristicGainsAfterCreation[k] = c.talent;
      }
    });

    // Resolution lookup — built ONCE from the resolver's decisions (§5, one path). `type:key` → our
    // record. Adapted records map to their target's record when the caller supplied one.
    var report = deps.resolveReport || { matched: [], adapted: [], absent: [] };
    var lut = {};
    (report.matched || []).forEach(function (m) { lut[m.rec.type + ':' + m.rec.key] = m.record || null; });
    (report.adapted || []).forEach(function (a) { if (a.record) lut[a.rec.type + ':' + a.rec.key] = a.record; });
    var lookup = function (type, key) { return key != null ? lut[type + ':' + key] : null; };

    // ── Skills (§B.1 per-source ledger) ──────────────────────────────────────────────────────────
    // Free grants (Species/Career/Starting) cost no XP → the freeSpecies/freeCareer/freeSpec booleans.
    // The remaining ranks up to the OggDude total are XP-bought → `bought[]` carries a reconstructed
    // per-rank cost. rank on the sheet = booleans-set + bought.length, which sums to the save's total.
    // Skill KEYS are the FFG key space our creator already uses (QB_DEFAULT_SKILLS: CHARM/ASTRO/…) — a
    // 1:1 with OggDude's <CharSkill><Key>, so no translation table.
    (parsed.skills || []).forEach(function (s) {
      var total = (s.species || 0) + (s.career || 0) + (s.purchased || 0) + (s.starting || 0);
      if (total <= 0) return;
      var entry = { freeCareer: false, freeSpec: false, freeSpecies: false, purchased: 0, bought: [] };
      var freeSet = 0;
      if (s.species > 0) { entry.freeSpecies = true; freeSet++; }
      if (s.career > 0) { entry.freeCareer = true; freeSet++; }
      // R7 B-1539: <CareerRanks>2</CareerRanks> is the career pick's free rank AND the starting specialization's on the same
      // skill, which RAW allows (the spec's free rank may go on a skill the career step already trained,
      // EotE p.35; that makes two ranks in it, AoR p.41).
      // The second is the spec's free rank (freeSpec), never a bought one.
      if (s.starting > 0 || s.career > 1) { entry.freeSpec = true; freeSet++; }
      for (var r = freeSet + 1; r <= total; r++) entry.bought.push(oggSkillCost(r, !!s.isCareer));
      ch.skills[s.key] = entry;
    });

    // ── Specializations + talents (owned tree positions) ─────────────────────────────────────────
    // character.specializations = [{ key: ourSpecId, name }] (drives specializationIds + owned-spec seed);
    // character.talents[posKey] = { talentKey: ourId, specKey: ourSpecId, row, col, cost } — the creator's
    // positional map (buildTestPc posKey = specId + '_r' + row + 'c' + col). Cost = (row+1)*5 (RAW tree).
    ch.specializations = [];
    var seenSpec = {};
    // B-1537 (ADDENDUM 21): the file's STARTING spec goes first — [0] is the starting spec everywhere (F-45's transform's
    // isStarting, the spec summer's free first) — and OggDude lists trees in purchase-screen order (N4567: AMBASSADOR last).
    _startingFirst(parsed.specializations || [], parsed.career && parsed.career.startingSpecKey).forEach(function (spec) {
      var specRec = lookup('specializations', spec.key);
      if (!specRec) return;                       // absent spec: already reported, nothing invented
      if (!seenSpec[specRec.id]) { seenSpec[specRec.id] = true; ch.specializations.push({ key: specRec.id, name: specRec.name }); }
      (spec.talents || []).forEach(function (t) {
        // R7 B-1244's residual (ruling release-r7-bug-burndown ADDENDUM 5): only a PURCHASED cell is owned (B-225 §3.2, as the
        // manifest reads it). `lookup` joins by key, so without this an unbought cell of a talent bought ELSEWHERE in the
        // tree (jihn's Reflect r0c3, Parry r2c0) imported as owned: +20 XP spent and a rank the file never bought.
        if (!t.purchased) return;
        var talRec = lookup('talents', t.key);
        if (!talRec) return;                      // absent talent: skip
        if (offBookCell(specRec, t, talRec)) return;   // R7 B-1584: off the resolved tree's cell — refused, named in absent
        var posKey = specRec.id + '_r' + t.row + 'c' + t.col;
        ch.talents[posKey] = { talentKey: talRec.id, specKey: specRec.id, row: t.row, col: t.col, cost: _CR.buildPrice('talent', { row: t.row }) };
      });
    });

    // ── Gear (weapons / armor / gear → one inventory; section carried for buildCanonicalEquipment) ──
    ch.gearLedger = ch.gearLedger || { startingCredits: 500, credits: 500, inventory: [] };
    function addGear(list, type) {
      (list || []).forEach(function (g) {
        var rec = lookup(type, g.itemKey);
        if (!rec) return;                         // absent / custom / unkeyed: skip, reported elsewhere
        ch.gearLedger.inventory.push({ key: rec.id, name: rec.name, price: rec.price || 0,
          enc: rec.encumbrance || 0, section: type, qty: g.count || 1 });
      });
    }
    addGear(parsed.weapons, 'weapons');
    addGear(parsed.armor, 'armor');
    addGear(parsed.gear, 'gear');

    // ── Force powers (ownership; powersFromCreatorState keys on the id) ──────────────────────────
    ch.forcePowers = ch.forcePowers || {};
    (parsed.forcePowers || []).forEach(function (f) {
      var rec = lookup('force_powers', f.key);
      if (!rec) return;
      // R7 B-1536: the basic at the power's own row-0 price (CharResolve.forcePowerBasicCost, the one basic price re-entry
      // reads too), not a flat 10 — jihn's Alter basic is 15 (the file's own <Cost>), half of the row's measured −10.
      var basic = _CR && _CR.forcePowerBasicCost ? _CR.forcePowerBasicCost(rec) : null;
      ch.forcePowers[rec.id] = { cost: basic == null ? 10 : basic };
      // F-100 M10 R-M10S-10: the purchased upgrade cells this power's tree holds (forceUpgradeCells, the ONE decision)
      var fuc = forceUpgradeCells(f, rec), ups = fuc.carried;
      if (ups.length) { ch.forcePowers[rec.id].upgrades = ups; ch.forcePowers[rec.id].owned = fuc.cells; }   // R7 B-1536
    });

    // ── Signature abilities (F-100 M12 B-1244, R-M12C-39) ────────────────────────────────────────────────────────
    // [{ id, tree, owned }] — `tree` the specialization the file attaches it under (<SpecKey>, through the resolver's own
    // specialization match; an unresolved one stays the file's key, so V2 refuses it by name), `owned` the carried cells
    // (sigAbilityCells, the ONE decision). Legality waits for the sheet (settleSigAbilities). Nothing is charged.
    var sigs = [];
    (parsed.sigAbilities || []).forEach(function (a) {
      var rec = lookup('signature_abilities', a.key);
      if (!rec) return;                           // absent: already reported, nothing invented
      var specRec = lookup('specializations', a.specKey);
      sigs.push({ id: rec.id, tree: specRec ? specRec.id : String(a.specKey || ''), owned: sigAbilityCells(a, rec).owned });
    });
    if (sigs.length) ch.signatureAbilities = sigs;

    // ── Mechanic + the earned-XP pool ───────────────────────────────────────────────────────────
    ch.mechanic = buildMechanic(parsed, gl);
    // The pool the creator core sums is `speciesData.starting_xp + mechanic.xpAdjustment` (charResolve
    // :1245). To land the pool on the save's total AVAILABLE XP without double-counting the species base,
    // the adjustment is (available − starting_xp). Precedent: buildTestPc injects tier XP the same way
    // (player/app.jsx:7212, extraXp → mechanic.xpAdjustment). GATE: see notes on XP-home + exactness.
    if (ch.mechanic && parsed.experience && parsed.experience.total > 0) {
      var base = deps.speciesRecord ? (deps.speciesRecord.starting_xp || 0) : 0;
      ch.mechanic.xpAdjustment = parsed.experience.total - base;   // R-OGG1-15: total = max(granted, spent)
    }

    // ── Motivation (R7 R-R7-O2, B-1474 (3)) ─────────────────────────────────────────────────────────────────────────
    // The file's first <CharMotivation> whose MotiveKey is a registry category becomes the sheet's one Motivation
    // ({category, specific}, B-103's shape); its SpecMotiveKey is kept only when it is a specific of THAT category.
    // Every other entry (an unknown key, or a second motivation the sheet has no place for) is told by motivationsOf.
    var mot = deps.motivation || null;
    if (mot) ch.motivation = mot;

    // ── Credits (R7 R-R7-O1, B-1474 (1); ruling release-r7-bug-burndown ADDENDUM 8) ──────────────────────────────────
    // OggDude's <Credits> is the POOL before gear (the corpus holds 500 beside bought gear). The sheet's credits are DERIVED
    // (normalizeCreated: purse + after + pocketMoney − the gear's prices), so the pool lands through pocketMoney = the file's
    // credits − (purse + after), the same reader (CharResolve.startingCredits). The balance is whatever the gear leaves —
    // below 0 is stored as it is and told (importToCharacter's receipt), never clamped.
    if (typeof parsed.credits === 'number' && _CR && _CR.startingCredits) {
      var sc = _CR.startingCredits(ch.mechanic ? (ch.mechanic.creditAdjustment || 0) : 0, deps.speciesRecord,
        ch.speciesOptionPicks, ch.creationBuyouts, ch);
      ch.pocketMoney = { value: parsed.credits - (sc.purse + sc.after) };
    }
    return ch;
  }

  // R7 R-R7-O2 (B-1474 (3)) — ONE decision for the file's motivations against the registry (motivations.json:
  // `categories[]` and `specifics[]`, each joined by `_source_key`). → { motivation: {category, specific} | null,
  // absent: [receipt rows] }. The first entry whose MotiveKey is a category is carried; its SpecMotiveKey only when that
  // specific belongs to the category (an unknown specific is told, the category still carried). An unknown MotiveKey is
  // told, never invented (LIB Character.LinkMotivations drops it in OggDude too); a further entry is told because the
  // sheet holds one Motivation.
  function motivationsOf(parsed, reg) {
    var out = { motivation: null, absent: [] };
    var list = (parsed && parsed.motivations) || [];
    if (!list.length) return out;
    var cats = {}, specs = {};
    ((reg && reg.categories) || []).forEach(function (c) { if (c && c._source_key) cats[c._source_key] = c; });
    ((reg && reg.specifics) || []).forEach(function (x) { if (x && x._source_key) specs[x._source_key] = x; });
    list.forEach(function (m) {
      var cat = m.key ? cats[m.key] : null;
      if (!cat) { out.absent.push({ type: 'motivations', key: m.key, name: m.name, reason: 'no such motivation here' }); return; }
      if (out.motivation) { out.absent.push({ type: 'motivations', key: m.key, name: cat.name, reason: 'a character here holds one Motivation' }); return; }
      var sp = m.spec ? specs[m.spec] : null;
      var fits = sp && (cat.specific_ids || []).indexOf(sp.id) !== -1;
      if (m.spec && !fits) out.absent.push({ type: 'motivations', key: m.spec, name: null, reason: 'no such ' + cat.name + ' motivation here' });
      out.motivation = { category: cat.id, specific: fits ? sp.id : null };
    });
    return out;
  }

  // ── the importer's single entry (slice 5) — XML → everything the sheet load needs ────────────────
  // ONE orchestration: parse → resolve → assemble the character + build the receipt/oggSource. The
  // caller (browser) then runs the REAL `normalizeCreated` over `character` and attaches `oggSource` +
  // the re-encoded `portraitData` — this function NEVER writes a sheet (R-OGG1-4: import loads through
  // the same core as the Custom door). Species/career records are read from the resolver's OWN matched
  // set (no separate resolution). A file that is not an OggDude character returns `{ error }`, never a
  // throw (R-OGG-23 honest failure — the mockup's unreadable-file state).
  function importToCharacter(xmlString, deps) {
    deps = deps || {};
    var parsed = parseOggCharacter(xmlString);
    if (!parsed) return { error: 'unreadable', parsed: null };
    var report = resolveManifest(recordManifest(parsed), deps.index || {}, deps.adaptMap || {});
    function matchedRecord(type) {
      var m = (report.matched || []).find(function (x) { return x.rec.type === type; });
      return m ? m.record : null;
    }
    var speciesRecord = matchedRecord('species');
    var careerRecord = matchedRecord('careers');
    // The bridge comes from whatever the caller already had: the species index kept the map it was
    // handed (indexSpecies), an explicit dep wins, and node falls back to the file. `player/app.jsx`
    // is untouched — the card fences it.
    var csgMap = deps.csgMap
      || (deps.index && deps.index.species && deps.index.species._csgMap)
      || (deps.index && deps.index._csgMap)
      || null;
    if (!csgMap && typeof module !== 'undefined' && module.exports) {
      try {
        var _fs = require('fs'), _path = require('path');
        csgMap = JSON.parse(_fs.readFileSync(_path.resolve(__dirname, 'oggCsgMap.json'), 'utf8'));
      } catch (e) { csgMap = null; }
    }
    // R-R5CC-3: the schematics map through the crafting templates' ogg_keys — handed in, or in node read from the file
    var craftTpl = deps.craftTemplates || null;
    if (!craftTpl && typeof module !== 'undefined' && module.exports) {
      try {
        var _fs2 = require('fs'), _path2 = require('path');
        craftTpl = JSON.parse(_fs2.readFileSync(_path2.resolve(__dirname, '../../public/data/canonical/crafting_templates.json'), 'utf8'));
      } catch (e) { craftTpl = null; }
    }
    var schem = schematicsOf(parsed, craftTpl);
    var comp = companionsOf(parsed, { index: deps.index || {}, skillVocab: deps.skillVocab, npcs: deps.npcs, companions: deps.companions });
    // R6 lane C: the rewards map through rewards.json and crafting_spend.json — handed in, or in node read from the files
    var rewReg = deps.rewards || null, spendReg = deps.craftSpend || null;
    if ((!rewReg || !spendReg) && typeof module !== 'undefined' && module.exports) {
      try {
        var _fs3 = require('fs'), _path3 = require('path');
        var _canon = _path3.resolve(__dirname, '../../public/data/canonical');
        rewReg = rewReg || JSON.parse(_fs3.readFileSync(_path3.join(_canon, 'rewards.json'), 'utf8'));
        spendReg = spendReg || JSON.parse(_fs3.readFileSync(_path3.join(_canon, 'crafting_spend.json'), 'utf8'));
      } catch (e) { /* absent → every reward is left in the file */ }
    }
    var rew = rewReg ? rewardsOf(parsed, rewReg, spendReg) : { held: [], left: null };
    // R7 R-R7-O2: the motive keys join motivations.json — handed in, or in node read from the file
    var motReg = deps.motivations || null;
    if (!motReg && typeof module !== 'undefined' && module.exports) {
      try {
        var _fs4 = require('fs'), _path4 = require('path');
        motReg = JSON.parse(_fs4.readFileSync(_path4.resolve(__dirname, '../../public/data/canonical/motivations.json'), 'utf8'));
      } catch (e) { motReg = null; }
    }
    var mots = motivationsOf(parsed, motReg);
    var character = assembleCore(parsed, {
      emptyCharacter: deps.emptyCharacter, speciesRecord: speciesRecord, careerRecord: careerRecord,
      resolveReport: report, sourceName: parsed.name || parsed.fileName, csgMap: csgMap, motivation: mots.motivation,
    });
    var rep = buildReport(report, parsed, schem.left, comp, rew.left);
    if (mots.absent.length) rep.absent = (rep.absent || []).concat(mots.absent);
    // R7 R-R7-O1 (ADDENDUM 8): a pool smaller than the gear's price leaves a balance below 0 — stored as it is and told.
    if (typeof parsed.credits === 'number') {
      var gearPrice = ((character.gearLedger && character.gearLedger.inventory) || []).reduce(function (t, it) { return t + (it.price || 0) * (it.qty || 1); }, 0);
      if (parsed.credits - gearPrice < 0) {
        rep.credits = { pool: parsed.credits, gear: gearPrice, balance: parsed.credits - gearPrice,
          player: 'The file gives you ' + parsed.credits + ' credits and your gear costs ' + gearPrice + ', so you start '
            + (gearPrice - parsed.credits) + ' credits short.' };
      }
    }
    var oggSource = buildOggSource({
      filename: parsed.fileName || null, ref: deps.ref || null,
      importedAt: deps.importedAt || null, sourceHash: deps.sourceHash || null, version: deps.version,
    }, rep);
    return {
      error: null, parsed: parsed, report: report, character: character, craftSchematics: schem.held, companions: comp.rows, rewards: rew.held,
      speciesRecord: speciesRecord, gameLine: character.gameLine,
      oggSource: oggSource, portraitData: parsed.portraitData,
    };
  }

  var api = {
    parseOggCharacter: parseOggCharacter, recordManifest: recordManifest,
    indexBy: indexBy, indexSpecies: indexSpecies, importIndex: importIndex, resolveManifest: resolveManifest,
    ADAPT_MAP: ADAPT_MAP,   // RELEASE 1.0 R5 C8: the hilt → saber table, handed in as deps.adaptMap (test/release_r5_hilt_adapt.cjs)
    buildReport: buildReport, rewardNamesOf: rewardNamesOf, stripPortrait: stripPortrait, buildOggSource: buildOggSource,
    assembleCore: assembleCore, inferGameLine: inferGameLine, importToCharacter: importToCharacter,
    OB_DUTY_TRADES: OB_DUTY_TRADES,
    MORALITY_TRADES: MORALITY_TRADES,   // R7 B-1538: the one Morality option ↔ trade crosswalk (oggExport.js reads it)   // R7 R-R7-O3: the one flag ↔ trade crosswalk (oggExport.js reads it)
    motivationsOf: motivationsOf,   // R7 R-R7-O2 (test/r7_b1474_ogg_credits_motivations.cjs)
    forceUpgradeCells: forceUpgradeCells,   // F-100 M10 R-M10S-10 (test/f100_m10_ogg_upgrades.cjs)
    sigAbilityCells: sigAbilityCells, settleSigAbilities: settleSigAbilities,   // F-100 M12 B-1244 (test/f100_m12_ogg_sig.cjs)
    schematicsOf: schematicsOf, settleSchematics: settleSchematics, rewardsOf: rewardsOf, settleRewards: settleRewards, settleXpCounted: settleXpCounted,
    companionsOf: companionsOf, settleCompanions: settleCompanions,   // ruling release-r6-companions-npcs (test/release_r6_ogg_npcs.cjs)
    settleRigger: settleRigger,   // release-r5-rigger card ADDENDUM 2 C2 (test/release_r5_rigger_io.cjs)   // release-r5-crafting-sm R-R5CC-3 (test/release_r5_crafting_schematic_io.cjs)
    // C-OGG1-5 — the set of element tags the parser ACTUALLY queried for this input, captured from the
    // running extraction helpers. The census's consumed side derives from this, never a hand-kept list.
    tracedTags: function (xmlString) {
      var prev = _trace; _trace = new Set();
      try { parseOggCharacter(xmlString); } catch (e) { /* completeness only; value asserts live elsewhere */ }
      var out = _trace; _trace = prev; return out;
    },
  };
  if (typeof root !== 'undefined') root.SWRPGOggImport = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
