/**
 * oggExport.js — the shipped OggDude character-file EXPORTER, twin of oggImport.js.
 *
 * DEPENDENCY-FREE, browser and node identical, exactly as the import parser is: there is no XML
 * library here and the output is built as a string. That is not a shortcut — the format is
 * machine-generated XML with no attributes and a fixed element order, and a serializer that matches
 * the oracle byte-for-byte is more checkable than a library whose whitespace we would then have to
 * wrestle.
 *
 * THE ORACLE. `scripts/ogg_export.py` is the proven exporter: two real consumers loaded its output
 * and one round-tripped 236 of 239 fields byte-identical. It cannot ship (no Python in a browser),
 * so this file ships and `test/ogg_export_equivalence.cjs` asserts the two produce identical bytes
 * for every pregen, permanently. This file is never the authority on the format; the corpus is,
 * via the attestation artifact both engines read.
 *
 * WHAT IT KNOWS COMES FROM `lib/shared/oggAttestation.json` — element order by path and by type,
 * required children, the skill vocabulary and its order, the background defaults and their display
 * names, the innate weapon, per-species option blocks, the default portrait. Generated at build
 * time from `data-sources/ogg-saves/`, which is build input and runtime-dead (C-OGG2B-6).
 *
 * Dual-export (browser window.SWRPGOggExport / CommonJS) so the node guards can run it.
 */
(function (root) {
  'use strict';

  var CANONICAL_ORDER = ['LastChanged', 'NotPersisted', 'FileName', 'Name', 'Key', 'Description',
    'Characteristics', 'Motivations', 'Specializations', 'ForcePowers', 'SigAbilities', 'Skills',
    'ObOptions', 'Obligations', 'DutOptions', 'Duties', 'Experience', 'Attributes', 'Species',
    'Career', 'Class', 'Hook', 'Attitude', 'Weapons', 'Armor', 'Gear', 'Vehicles', 'NPCs',
    'SummaryPriorities', 'Story', 'Credits', 'Morality', 'Grants', 'Rigger', 'Schematics',
    'Rewards', 'UseGrants', 'Portrait', 'AutoRecalc'];

  var CHAR_KEYS = [['brawn', 'BR', 'Brawn'], ['agility', 'AG', 'Agility'],
    ['intellect', 'INT', 'Intellect'], ['cunning', 'CUN', 'Cunning'],
    ['willpower', 'WIL', 'Willpower'], ['presence', 'PR', 'Presence']];

  // ── a minimal element tree (no XML lib, exactly as the import parser has none) ──────────────
  function El(tag, text) { return { tag: tag, text: (text === undefined || text === null) ? null : String(text), kids: [] }; }
  // A sibling core by absolute path: the twin harnesses compile this file under another name or in a vm, where a relative
  // require resolves from the caller (loadDeps reads __dirname the same way).
  function sibling(f) { return typeof __dirname !== 'undefined' ? __dirname + '/' + f : './' + f; }
  function sub(parent, tag, text) { var e = El(tag, text); parent.kids.push(e); return e; }
  function find(el, tag) { for (var i = 0; i < el.kids.length; i++) if (el.kids[i].tag === tag) return el.kids[i]; return null; }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* Matches minidom's toprettyxml(indent='  ') with blank lines stripped — the oracle's exact
   * shape, including the space in `<?xml version="1.0" ?>` and self-closing empties. */
  function serialize(root_) {
    var out = ['<?xml version="1.0" ?>'];
    (function walk(el, depth) {
      var pad = new Array(depth + 1).join('  ');
      if (el.kids.length) {
        out.push(pad + '<' + el.tag + '>');
        for (var i = 0; i < el.kids.length; i++) walk(el.kids[i], depth + 1);
        out.push(pad + '</' + el.tag + '>');
      } else if (el.text !== null && el.text !== '') {
        out.push(pad + '<' + el.tag + '>' + esc(el.text) + '</' + el.tag + '>');
      } else {
        out.push(pad + '<' + el.tag + '/>');
      }
    })(root_, 0);
    return out.join('\n') + '\n';
  }

  // ── scaffolding OggDude writes for every character (absent object => null => its crash) ─────
  var NEUTRAL_FORM = {
    Obligations: [], Motivations: [], ForcePowers: [], SigAbilities: [], Duties: [], Vehicles: [],
    NPCs: [], SummaryPriorities: [], Grants: [], Schematics: [], Rewards: [], Story: [],
    ObOptions: [['StartingSize', '5']], DutOptions: [['StartingSize', '5']],
    Class: [['ClassKey', null]], Hook: [['HookKey', null]], Attitude: [['AttitudeKey', null]],
    Morality: [['MoralityValue', '50']],
    Rigger: [['VehicleKey', null], ['WeaponIndex', '-1'], ['custRigger', null],
             ['MaxSilhouette', '0']]
  };
  var NESTED_FORM = {
    'Character/Attributes': [['DefenseRanged', null], ['DefenseMelee', null], ['ForceRating', null]],
    // SpeciesKey is here because an unmapped species writes none (term 7 as amended) and an ABSENT
    // required child is the crash class this lane was born fixing (R-OEF-4). Always present, empty
    // when we have nothing true for it. Mirrors the oracle's NESTED_FORM.
    'Character/Species': [['SpeciesKey', null], ['SubSpeciesKey', null], ['SelectedOptions', null]],
    'Character/Specializations/CharSpecialization': [['AddlCareerSkills', null]],
    'Character/Career': [['CareerSkills', null], ['CareerSpecSkills', null]]
  };
  var FIXED_LEAVES = [['NotPersisted', 'false'], ['UseGrants', 'false'], ['AutoRecalc', 'true']];

  function ensure(parent, tag, children, text) {
    var el = find(parent, tag), created = false;
    if (!el) { el = sub(parent, tag, text); created = true; }
    (children || []).forEach(function (c) {
      if (!find(el, c[0])) sub(el, c[0], c[1]);
    });
    return { el: el, created: created };
  }

  function findAll(el, path) {
    var parts = path.split('/'), cur = [el];
    for (var i = 0; i < parts.length; i++) {
      var next = [];
      cur.forEach(function (n) {
        n.kids.forEach(function (k) { if (k.tag === parts[i]) next.push(k); });
      });
      cur = next;
    }
    return cur;
  }

  function orderTree(root_, att, unplaceable) {
    (function order(el, path) {
      var kids = el.kids.slice();
      var want = att.orderByPath[path];
      if (kids.length && (!want || kids.some(function (c) { return want.indexOf(c.tag) < 0; }))) {
        var byTag = att.orderByType[el.tag];
        if (byTag && kids.every(function (c) { return byTag.indexOf(c.tag) >= 0; })) want = byTag;
      }
      if (kids.length && want) {
        kids.forEach(function (c) {
          if (want.indexOf(c.tag) < 0) unplaceable.push(path + '/' + c.tag);
        });
        // STABLE sort: repeated siblings (CharSkill, CharGear…) keep their emitted order.
        var idx = kids.map(function (c, i) { return [c, i]; });
        idx.sort(function (a, b) {
          var ka = want.indexOf(a[0].tag), kb = want.indexOf(b[0].tag);
          ka = ka < 0 ? want.length : ka; kb = kb < 0 ? want.length : kb;
          return ka === kb ? a[1] - b[1] : ka - kb;
        });
        el.kids = idx.map(function (x) { return x[0]; });
      }
      el.kids.forEach(function (c) { order(c, path + '/' + c.tag); });
    })(root_, 'Character');
  }

  // ── data access: node reads the files, the browser is handed what it already holds ──────────
  // B-852 (ruling f100-b852): the browser has NO default. The items a file carries are the items the
  // SHEET owns (its user: stamps over the pristine base, `sheetItemRegistries(sheet)` — ruling
  // f100-ud1-contracts H2), which only the caller knows, so the one browser caller (the files room's
  // `runExport`) hands every registry in `deps`. The default this replaces read the DISCOVERY global
  // `_canonicalRegistries` (every ACTIVE pack folded in) and handed id-keyed maps to byId(), so it threw
  // a TypeError for any caller once the registries had loaded; no caller reached it.
  function loadDeps(opts) {
    if (opts && opts.deps) return opts.deps;
    if (typeof module !== 'undefined' && module.exports) {
      var fs = require('fs'), path = require('path');
      var ROOT = path.resolve(__dirname, '..', '..');
      var C = path.join(ROOT, 'public', 'data', 'canonical');
      var rd = function (f) { return JSON.parse(fs.readFileSync(path.join(C, f + '.json'), 'utf8')); };
      var list = function (name, key) {
        var d = rd(name), items = d[key || name] || d;
        return Array.isArray(items) ? items : Object.keys(items).map(function (k) { return items[k]; });
      };
      return {
        attestation: JSON.parse(fs.readFileSync(path.join(ROOT, 'lib', 'shared',
          'oggAttestation.json'), 'utf8')),
        csgMap: JSON.parse(fs.readFileSync(path.join(ROOT, 'lib', 'shared',
          'oggCsgMap.json'), 'utf8')),
        species: list('species'), careers: list('careers'),
        specializations: list('specializations'), talents: list('talents'),
        signatureAbilities: list('signature_abilities'),   // F-100 M12 B-1244
        forcePowers: list('force_powers'),   // R7 B-1225: the owned powers' trees
        motivations: rd('motivations'),   // R7 R-R7-O2: categories[] + specifics[], joined by _source_key
        weapons: list('weapons'), armor: list('armor'), gear: list('gear'),
        skillVocab: rd('skills.vocab').entries,
        qualityVocab: rd('qualities.vocab').entries,   // R7 B-1432: a crafted weapon's quality ids → OggDude's Quality Key
        craftTemplates: rd('crafting_templates').templates,  // release-r5-crafting-sm: the schematic rows' names
        rewards: rd('rewards'), craftSpend: rd('crafting_spend'),   // R6 lane C: the reward rows' keys and Maker's Mark's ogg_key
        // release-r6-companions-npcs: a `ref` companion's creature and a crafted droid's registries, read only when a
        // companion asks (npcs.json is 4 MB and no pregen has a companion).
        get npcs() { return rd('npcs').npcs; },
        get droid() {
          return { templates: rd('crafting_templates').templates, spend: rd('crafting_spend'),
                   cybernetics: require('./companions.js').cyberneticsOf(rd('gear').gear) };   // release-r6-companions-d365
        }
      };
    }
    throw new Error('oggExport: a browser caller hands `deps` — the registries the SHEET owns (B-852)');
  }

  // R7 R-R7-O1: the price of the gear a sheet holds — catalogue items at their record's price, a crafted `{_inline}` at its
  // own, each times its qty (normalizeCreated's creditSpent, read off the persisted equipment). Twin: _gear_price in the oracle.
  function gearPrice(eq, weapons, armors, gears) {
    function one(it, reg) {
      if (!it) return 0;
      var rec = it._inline || reg[(it && it.id) || it];
      var q = (it && typeof it.qty === 'number' && it.qty > 0) ? it.qty : 1;
      return ((rec && Number(rec.price)) || 0) * q;
    }
    var t = 0;
    (eq.weapons || []).forEach(function (w) { t += one(w, weapons); });
    (eq.gear || []).forEach(function (g) { t += one(g, gears); });
    if (eq.armor) t += one(eq.armor, armors);
    return t;
  }

  // R7 R-R7-O3: the importer's one flag ↔ trade crosswalk (OB_DUTY_TRADES) — the browser's loaded importer, node's file.
  function obDutyTrades() {
    var I = (typeof root !== 'undefined' && root.SWRPGOggImport) || null;
    if (!I && typeof module !== 'undefined' && module.exports) { try { I = require('./oggImport.js'); } catch (e) { I = null; } }
    return I ? I.OB_DUTY_TRADES : null;
  }
  // R7 B-1538: the importer's one Morality option ↔ trade crosswalk (MORALITY_TRADES), loaded the same way.
  function moralityTrades() {
    var I = (typeof root !== 'undefined' && root.SWRPGOggImport) || null;
    if (!I && typeof module !== 'undefined' && module.exports) { try { I = require('./oggImport.js'); } catch (e) { I = null; } }
    return I ? I.MORALITY_TRADES : null;
  }

  function byId(rows) {
    var m = {};
    (rows || []).forEach(function (r) { if (r && r.id) m[r.id] = r; });
    return m;
  }

  function exportCharacter(character, opts) {
    opts = opts || {};
    // THE READER'S RECEIPT, authored HERE beside the technical register (the two-register rule).
    // The UI renders these lines verbatim and may not paraphrase, condense or drop one — so they
    // are written in the engine that knows what happened, not composed by the page.
    // `opts.receipt`, when supplied, is filled with {field, status, detail, player} rows; the
    // return value stays the XML STRING so the equivalence guard is unaffected.
    // Kept word-for-word identical to scripts/ogg_export.py, and `test/ogg_export_receipt.cjs`
    // asserts that across every pregen — two registers, one wording, checked rather than intended.
    var receiptRows = opts.receipt;
    // NAMED `note`, not `rec`: the equipment loop below declares its own `rec` for the registry
    // record, and a collector shadowed there would silently drop every row written inside it.
    function note(field, status, detail, player) {
      if (receiptRows) receiptRows.push({ field: field, status: status, detail: detail,
                                          player: player === undefined ? null : player });
    }
    var deps = loadDeps(opts);
    var att = deps.attestation;
    var csg = deps.csgMap || { speciesKeyById: {}, choiceOptions: {}, subSpecies: {} };
    var vol = opts.volatile || {};
    // Volatile GUIDs are supplied BY ITEM KEY (see the equivalence guard): assignment order and
    // document order differ, so a positional list matched the wrong rows.
    var itemKeys = vol.itemKeys || {};
    var nextKey = function (itemKey) {
      var q = itemKeys[itemKey];
      return (q && q.length) ? q.shift() : randomGuid();
    };

    var species = byId(deps.species), careers = byId(deps.careers),
        specs = byId(deps.specializations), talents = byId(deps.talents),
        weapons = byId(deps.weapons), armors = byId(deps.armor), gears = byId(deps.gear);

    var sp = species[character.speciesId] || null;
    var car = careers[character.career] || careers[character.careerId] || null;
    if (!car) {
      // the sheet names the career by display name in some pregens; match on name as the oracle does
      (deps.careers || []).forEach(function (c) {
        if (!car && c && (c.name === character.career || c.id === character.career)) car = c;
      });
    }

    var root_ = El('Character');

    // ── DESCRIPTION ──────────────────────────────────────────────────────────────────────────
    var desc = sub(root_, 'Description');
    sub(desc, 'CharName', character.name || 'Unnamed');
    ['GenderValue', 'Gender'].forEach(function (t) {
      var v = att.defaults['Description/' + t];
      if (v) sub(desc, t, v);
    });

    sub(root_, 'Name');                                  // empty in every real save
    sub(root_, 'Key', vol.charKey || randomGuid());

    // ── SPECIES ──────────────────────────────────────────────────────────────────────────────
    // A key we have not VERIFIED is worse than no key — build card term 7 as AMENDED. Our csg_*
    // records carry CSG-SPREADSHEET ROW IDS ('260' for Icehead, '185' for Droid) where the
    // dataset's own keys are mnemonic (ICEHEAD, DROID + DROIDSUB8), so a "faithful" key is a wrong
    // key that resolves nowhere while looking like a clean export. The test is the key's SHAPE —
    // all digits — because not one of the 90 dataset-sourced keys is numeric and the numeric set
    // is exactly the falsified class; provenance and corpus-attestation were both tried and strip
    // good keys. <Species> has no <Name> child in the corpus, so an unverified species is simply
    // absent from the file and the receipt tells the reader to pick it by hand. Mirrors the
    // oracle's `_is_row_id` in scripts/ogg_export.py, where the reasoning lives in full.
    var spEl = sub(root_, 'Species');
    var csgKey = sp ? (csg.speciesKeyById || {})[sp.id] : null;
    if (csgKey) {
      // Mapped through the CSG dataset's own definitions, and joined to OUR option groups by the
      // BRIDGE that rides in the same artifact (`optionBridge`, built by scripts/ogg_option_bridge.py).
      // The matching happened ONCE at build time so this engine, the oracle and the import leg
      // cannot drift — the one-shared-core law applied to a join. Rules and their refusal
      // conditions: card A3 term 2 (payload) and ruling `b293-payloadless-choice-bridge`
      // (R-PCB-1 name, R-PCB-2 complement). What no rule bridges is LEFT OUT and receipted:
      // defaulting a pick we do not hold would put someone else's choice on this character.
      // Mirrors the oracle, where the reasoning lives in full.
      sub(spEl, 'SpeciesKey', csgKey);
      var br = (csg.optionBridge || {})[csgKey] || {};
      var picks = (character.speciesOptionPicks && typeof character.speciesOptionPicks === 'object')
        ? character.speciesOptionPicks : {};
      // "ASKED" is R-PCB-2(iii): a group whose key is PRESENT — even with an empty list — was put
      // to the player; an ABSENT key was never asked, and a legacy character created before the
      // group existed must not be told it answered. charResolve's `_pickIdsOf` cannot tell those
      // apart (both read []), so presence is tested here rather than inferred from the list.
      var askedOf = function (slug) {
        return !!slug && Object.prototype.hasOwnProperty.call(picks, slug) && picks[slug] != null;
      };
      var pickIdsOf = function (slug) {
        if (!askedOf(slug)) return [];
        var raw = picks[slug];
        return Array.isArray(raw) ? raw.slice() : [raw];
      };

      // ── SUB-SPECIES (card term 3) ─────────────────────────────────────────────────────────
      var ss = br.subSpecies || {};
      var claimed = {};
      Object.keys(br.choices || {}).forEach(function (ck) {
        var c = br.choices[ck] || {};
        Object.keys(c.byOurOption || {}).forEach(function (k) { claimed[k] = 1; });
        Object.keys(c.complementOf || {}).forEach(function (k) { claimed[k] = 1; });
      });
      var subKey = null;
      var subIds = pickIdsOf(ss.group);
      for (var si = 0; si < subIds.length && !subKey; si++) {
        subKey = (ss.byOurOption || {})[subIds[si]] || null;
      }
      if (!subKey && subIds.length) {
        // COMBINATION form (the droid): a sub-species name IS a set of our option names. Members
        // a CHOICE already claims are not part of the combination, which is how `with_jetpack`
        // stays out of it without being named anywhere.
        var setKey = subIds.filter(function (i) { return !claimed[i]; }).sort().join('|');
        subKey = (ss.byPickSet || {})[setKey] || null;
      }
      if (subKey) sub(spEl, 'SubSpeciesKey', subKey);

      // ── SELECTED OPTIONS — the species' own choices, then the chosen sub-species' ─────────
      var attested = {};
      ((att.orderByType && att.orderByType.CharOption) || []).forEach(function (t) { attested[t] = 1; });
      var payloads = csg.optionPayloadXml || {};
      var emit = [], unbridged = [], unasked = [];
      var collect = function (choices) {
        Object.keys(choices || {}).sort().forEach(function (ck) {
          var c = choices[ck] || {};
          if (c.rule === 'forced') { emit.push([ck, (c.options || [])[0]]); return; }
          if (c.rule === 'refused') { unbridged.push(ck); return; }
          var ids = pickIdsOf(c.ourGroup), hit = null;
          for (var i = 0; i < ids.length && !hit; i++) hit = (c.byOurOption || {})[ids[i]] || null;
          if (hit) { emit.push([ck, hit]); return; }
          if (c.rule === 'complement') {
            // Absence is evidence ONLY when the question was asked (R-PCB-2 iii/iv).
            if (!askedOf(c.ourGroup)) { unasked.push(ck); return; }
            var member = Object.keys(c.complementOf || {})[0];
            if (member && ids.indexOf(member) === -1) { emit.push([ck, c.complementOf[member]]); return; }
          }
          unbridged.push(ck);
        });
      };
      collect(br.choices);
      if (subKey && ss.defs && ss.defs[subKey]) collect(ss.defs[subKey].choices);

      if (emit.length) {
        // The option's mechanical payload travels inline beside the keys (R-OEF-3), copied from
        // the vendored dataset. A kind no reference save has ever carried is NOT emitted: we know
        // neither its save-side tag nor its position, and .NET refuses an element out of sequence.
        // Mirrors the oracle, where the reasoning and the alias table live in full.
        var optsEl = El('SelectedOptions');
        spEl.kids.push(optsEl);
        var carried = [], skipped = [];
        emit.forEach(function (pair) {
          var ce = El('CharOption');
          optsEl.kids.push(ce);
          sub(ce, 'ChoiceKey', pair[0]);
          sub(ce, 'OptionKey', pair[1]);
          (payloads[pair[1]] || []).forEach(function (frag) {
            var el = parseFragment(frag);
            if (!el) return;
            el.tag = PAYLOAD_TAG_ALIASES[el.tag] || el.tag;
            if (attested[el.tag]) { ce.kids.push(el); carried.push(pair[1] + '/' + el.tag); }
            else skipped.push(pair[1] + '/' + el.tag);
          });
        });
        note('Species/SelectedOptions', 'RECONSTRUCTED',
          emit.length + ' option choice(s) emitted from the dataset definition ('
          + emit.map(function (p) { return p[0]; }).join(', ') + ')'
          + (carried.length ? '; payload carried for ' + carried.join(', ') : ''));
        if (skipped.length) {
          note('Species/SelectedOptions', 'DROPPED',
            'payload NOT emitted for ' + skipped.join(', ') + ' — the dataset defines this element '
            + 'but no reference save carries one, so its position in the sequence is unattested '
            + 'and .NET refuses an element in the wrong place',
            'One of ' + (sp.name || 'this species') + '\'s option effects can\'t be written into '
            + 'the file yet — it will need setting by hand.');
        }
      }
      if (unbridged.length) {
        note('Species/SelectedOptions', 'DROPPED',
          unbridged.length + ' option choice(s) NOT emitted (' + unbridged.sort().join(', ')
          + '): no bridge rule resolves them, so writing one would put a choice on this character '
          + 'that nobody made',
          (sp.name || 'This species') + ' gets to choose ' + unbridged.length + ' thing(s) we cannot '
          + 'match up yet, so they are left unset — set them at the other end.');
      }
      if (unasked.length) {
        note('Species/SelectedOptions', 'DROPPED',
          unasked.length + ' option choice(s) NOT emitted (' + unasked.sort().join(', ')
          + '): the group was never put to this character, so its absence is not an answer',
          (sp.name || 'This species') + ' has ' + unasked.length + ' choice(s) this character was '
          + 'never asked, so they are left unset — set them at the other end.');
      }
      if (!subKey && (ss.defs && Object.keys(ss.defs).length)) {
        note('Species/SubSpeciesKey', 'DROPPED',
          (sp.name || 'This species') + ' has ' + Object.keys(ss.defs).length + ' sub-species in the '
          + 'dataset and this character\'s picks match none of them, so none is written',
          (sp.name || 'This species') + ' comes in several varieties and we cannot tell which this '
          + 'is, so pick it at the other end.');
      }
    } else if (sp && sp._source_key && !isRowId(sp._source_key)) {
      sub(spEl, 'SpeciesKey', sp._source_key);
      var optsXml = att.speciesSelectedOptionsXml[sp._source_key];
      if (optsXml) spEl.kids.push(parseFragment(optsXml));
    } else if (sp && isRowId(sp._source_key)) {
      note('Species', 'DROPPED',
        sp.name + ' is ' + sp._provenance + '-provenance and its stored key ' + pyRepr(sp._source_key) + ' is all '
        + 'digits — a source-spreadsheet row id, not an OggDude species key (the CSG reference saves attest mnemonic '
        + 'keys: ICEHEAD, DROID+DROIDSUB8), so NO <SpeciesKey> is written: a wrong key resolves nowhere and reads as a '
        + 'successful export. <Species> has no <Name> child in any corpus save, so the species cannot be carried by '
        + 'name either; it is absent from the file',
        sp.name + ' can\'t be named in a way OggDude looks up, so this file opens with no species set — choose '
        + sp.name + ' by hand at the other end. Everything else is intact.');
    } else {
      // B-891: a homebrew (keyless) species is absent from the file — the receipt says so (the oracle's row + a player line).
      var spName = (sp && sp.name) || character.species;
      note('Species', 'DROPPED', 'no _source_key for ' + pyRepr(character.speciesId),
        spName ? 'Your species, ' + spName + ', is homebrew, so it isn\'t in the file. Pick a species by hand at the other end.' : undefined);
    }

    // B-891: a homebrew (keyless) career is absent from the file. Noted HERE, not in the CAREER block below, so the reader
    // rows keep the oracle's order (scripts/ogg_export.py writes Career before the specializations).
    if (!(car && car._source_key)) {
      var carName = (car && car.name) || character.career;
      note('Career', 'DROPPED', 'no _source_key for ' + pyRepr(character.career),
        carName ? 'Your career, ' + carName + ', is homebrew, so it isn\'t in the file. Pick a career by hand at the other end.' : undefined);
    }

    // ── SPECIALIZATIONS + the whole talent grid ──────────────────────────────────────────────
    var specsEl = sub(root_, 'Specializations');
    var treeCells = {};
    (character.specializationIds || []).forEach(function (sid, i) {
      var s = specs[sid];
      if (!s || !s._source_key) {
        // B-891: the oracle's row + a player line; the talents bought in it go with it.
        note('Specialization[' + i + ']', 'DROPPED', 'no _source_key for ' + pyRepr(sid),
          'Your specialization, ' + ((s && s.name) || sid) + ', is homebrew, so it isn\'t in the file, and neither are the '
          + 'talents you bought in it.');
        return;
      }
      var cs = sub(specsEl, 'CharSpecialization');
      sub(cs, 'Key', s._source_key);
      sub(cs, 'Name', s.name || sid);
      sub(cs, 'isStartingSpec', i === 0 ? 'true' : 'false');
      sub(cs, 'isCareerSpec', 'true');
      var talEl = sub(cs, 'Talents');
      (s.talent_tree || []).forEach(function (row, rowI) {
        ((row || {}).talents || []).forEach(function (cell, colI) {
          var tid = cell && (cell.talent || cell);
          if (!tid) return;
          var trec = talents[tid];
          if (!trec || !trec._source_key) return;
          var ct = sub(talEl, 'CharTalent');
          sub(ct, 'Key', trec._source_key);
          sub(ct, 'Col', colI);
          sub(ct, 'Row', rowI);
          if (!treeCells[tid]) treeCells[tid] = ct;
        });
      });
    });

    // ── SIGNATURE ABILITIES (F-100 M12 B-1244; brief f100-m12-sig-shape §5) ──────────────────────────────────────────
    // One <CharSigAbility> per sheet entry: Key the record's `_source_key`, Name the record's, SpecKey the attached tree's
    // `_source_key`. EVERY cell of the tree is written, as OggDude writes it: a spanning cell as span-1 cells, one per
    // column, the first carrying the cost and the rest 0 (the base reads 30/0/0/0); each cell's Key is its node's OggDude
    // key (the node id upper-cased, or the key a named fill `replaces`, R-M12C-19 (c)); Purchased from `owned`; Upgrades 0.
    // An entry whose record or tree does not resolve is not written, and the receipt says so. Element order: the
    // attestation's Character/SigAbilities paths (orderTree).
    var sigRecs = byId(deps.signatureAbilities);
    var sigEntries = Array.isArray(character.signatureAbilities) ? character.signatureAbilities : [];
    if (sigEntries.length) {
      var sigsEl = sub(root_, 'SigAbilities'), sigLeft = [];
      sigEntries.forEach(function (e) {
        var sr = e && sigRecs[e.id], st = e && specs[e.tree];
        if (!sr || !sr._source_key || !st || !st._source_key) { sigLeft.push((sr && sr.name) || (e && e.id) || '?'); return; }
        var owned = (Array.isArray(e.owned) ? e.owned : []).map(String);
        var fills = Array.isArray(sr.fills) ? sr.fills : [];
        var csa = sub(sigsEl, 'CharSigAbility');
        sub(csa, 'Key', sr._source_key);
        sub(csa, 'Name', sr.name || e.id);
        sub(csa, 'SpecKey', st._source_key);
        var nodesEl = sub(csa, 'SigAbilityNodes');
        (sr.tree || []).forEach(function (row, rowI) {
          ((row && row.cells) || []).forEach(function (c) {
            if (!c) return;
            var col = typeof c.col === 'number' ? c.col : 0, span = typeof c.span === 'number' && c.span > 0 ? c.span : 1;
            var fill = fills.filter(function (f) { return f && f.row === rowI && f.col === col && f.ability === c.ability; })[0];
            var key = String((fill && fill.replaces) || c.ability || '').toUpperCase();
            var bought = owned.indexOf(rowI + '-' + col) !== -1;
            for (var k = 0; k < span; k++) {
              var cn = sub(nodesEl, 'CharSigAbilityNode');
              sub(cn, 'Key', key);
              sub(cn, 'Col', col + k);
              sub(cn, 'Row', rowI);
              sub(cn, 'Span', 1);
              sub(cn, 'Cost', k === 0 ? (Number(c.cost) || 0) : 0);
              sub(cn, 'Purchased', bought && k === 0 ? 'true' : 'false');
              sub(cn, 'Upgrades', 0);
            }
          });
        });
      });
      // The technical register only: the reader's words for this row are on a brief (f100-m12-build-receipt-words), so no
      // player line is authored here until they are ruled.
      if (sigLeft.length) note('SigAbilities', 'DROPPED', sigLeft.join(', ') + ': not in this export\'s registries');
    }

    // ── FORCE POWERS (R7 B-1225; census `oggdude-save-census` row ForcePowers, attested by jihn__Human_Sentinel.xml) ─────
    // One <CharForcePower> per owned power: Key the record's `_source_key`, Name the record's, and EVERY cell of its tree as
    // OggDude writes it: a spanning cell as span-1 cells, one per column, the first carrying the cost and the rest 0; each
    // cell's Key its ability upper-cased. <Purchased>true</Purchased> only on a bought cell (OggDude omits it otherwise).
    // The base (0-0) is bought with the power. An upgrade is stored as its ability key, one per bought cell, so a ranked
    // upgrade bought twice marks its first two cells in tree order (row, then column) — the cells the sheet PRICED, by
    // charResolve's one rule (forcePowerEntryXp: the n-th copy of a key costs its n-th cell). An unresolved power, or an upgrade
    // key with no cell left in its tree, is not written, and the receipt says so.
    var fpRecs = byId(deps.forcePowers);
    var fpRaw = character.forcePowers;
    var fpEntries = Array.isArray(fpRaw) ? fpRaw
      : (fpRaw && typeof fpRaw === 'object') ? Object.keys(fpRaw).map(function (id) { return Object.assign({ id: id }, fpRaw[id]); }) : [];
    if (fpEntries.length) {
      var fpsEl = sub(root_, 'ForcePowers'), fpLeft = [];
      fpEntries.forEach(function (e) {
        var fr = e && fpRecs[e.id];
        if (!fr || !fr._source_key) { fpLeft.push((fr && fr.name) || (e && (e.id || e.name)) || '?'); return; }
        var cells = [];
        (fr.tree || []).forEach(function (row, rowI) {
          ((row && row.cells) || []).forEach(function (c) { if (c) cells.push({ c: c, row: rowI, col: typeof c.col === 'number' ? c.col : 0 }); });
        });
        cells.sort(function (a, b) { return (a.row - b.row) || (a.col - b.col); });
        var bought = {};
        cells.forEach(function (x) { if (x.row === 0 && x.col === 0) bought['0-0'] = true; });
        // R7 B-1536 (ADDENDUM 269): a VALID `owned` names the bought cells; absent or mismatched (CharResolve's one check),
        // tree order as before. The oracle (scripts/ogg_export.py) is its twin.
        var CRf = root.CharResolve || require(sibling('charResolve.js'));
        var ownedOk = e && Array.isArray(e.owned) && e.owned.length && CRf.forcePowerOwnedProblems
          && !CRf.forcePowerOwnedProblems(e, fr.tree || []).length;
        if (ownedOk) e.owned.forEach(function (pos) { bought[pos] = true; });
        else (Array.isArray(e.upgrades) ? e.upgrades : []).forEach(function (u) {
          var k = String((u && typeof u === 'object') ? u.key : u || '').toLowerCase();
          var hit = cells.filter(function (x) { return x.c.ability === k && !(x.row === 0 && x.col === 0) && !bought[x.row + '-' + x.col]; })[0];
          if (hit) bought[hit.row + '-' + hit.col] = true;
          else fpLeft.push(fr.name + ' / ' + (k || '(no key)'));
        });
        var cfp = sub(fpsEl, 'CharForcePower');
        sub(cfp, 'Key', fr._source_key);
        sub(cfp, 'Name', fr.name || e.id);
        var abEl = sub(cfp, 'ForceAbilities');
        cells.forEach(function (x) {
          var span = typeof x.c.span === 'number' && x.c.span > 0 ? x.c.span : 1;
          for (var k = 0; k < span; k++) {
            var ca = sub(abEl, 'CharForceAbility');
            sub(ca, 'Key', String(x.c.ability || '').toUpperCase());
            sub(ca, 'Col', x.col + k);
            sub(ca, 'Row', x.row);
            sub(ca, 'Span', 1);
            sub(ca, 'Cost', k === 0 ? (Number(x.c.cost) || 0) : 0);
            if (k === 0 && bought[x.row + '-' + x.col]) sub(ca, 'Purchased', 'true');
          }
        });
      });
      if (fpLeft.length) note('ForcePowers', 'DROPPED', fpLeft.join(', ') + ': not in this export\'s registries');
    }

    // ── CHARACTERISTICS ──────────────────────────────────────────────────────────────────────
    var chEl = sub(root_, 'Characteristics');
    var base = (sp && sp.characteristics) || {};
    var now = character.characteristics || {};
    // B-782 — THE POST-CREATION PART IS WRITTEN AS `TalentRanks`, the export half of B-778. OggDude
    // reads a characteristic as SpeciesRanks + TalentRanks + PurchasedRanks, and our importer (B-778)
    // stamps the CREATION value — the one both thresholds are frozen at (B-736) — from Species +
    // Purchased alone. Writing everything above the species base as Purchased therefore turned a
    // Dedication rank into a creation rank on the way out, and a re-import froze the threshold one
    // point high. The post-creation part is what B-754 carries as the gain: the live value minus
    // `characteristicsAtCreation`, per key. A key with no creation value recorded (every pre-B-736
    // save, every pregen) has no separable gain, writes none, and exports exactly as before — which is
    // the "freeze at migration" reading, so no number a player holds moves.
    var atCreation = (character.characteristicsAtCreation && typeof character.characteristicsAtCreation === 'object')
      ? character.characteristicsAtCreation : {};
    CHAR_KEYS.forEach(function (t) {
      var our = t[0], key = t[1], name = t[2];
      var final = now[our];
      if (final === undefined || final === null) return;
      var cc = sub(chEl, 'CharCharacteristic');
      sub(cc, 'Key', key);
      sub(cc, 'Name', name);
      var rank = sub(cc, 'Rank');
      var atC = atCreation[our] != null ? Number(atCreation[our]) : NaN;
      var talentRanks = isFinite(atC) ? Math.max(0, final - atC) : 0;
      var spRanks = base[our];
      if (spRanks !== undefined && spRanks !== null) {
        sub(rank, 'SpeciesRanks', spRanks);
        if (talentRanks > 0) sub(rank, 'TalentRanks', talentRanks);
        if (final - talentRanks - spRanks > 0) sub(rank, 'PurchasedRanks', final - talentRanks - spRanks);
      } else {
        sub(rank, 'SpeciesRanks', final - talentRanks);
        if (talentRanks > 0) sub(rank, 'TalentRanks', talentRanks);
      }
    });

    // ── SKILLS ───────────────────────────────────────────────────────────────────────────────
    var aliasToId = {}, idToOgg = {};
    (deps.skillVocab || []).forEach(function (e) {
      (e.aliases || []).forEach(function (al) { aliasToId[al] = e.id; });
      var ogg = (e.aliases || []).filter(function (al) { return att.skillKeys.indexOf(al) >= 0; })[0];
      if (ogg) idToOgg[e.id] = ogg;
    });
    var skillSet = function (ids) {
      var out = {};
      (ids || []).forEach(function (i) { if (idToOgg[i]) out[idToOgg[i]] = true; });
      return out;
    };
    var careerSkills = skillSet(car && car.career_skills);
    var specSkills = {};
    (character.specializationIds || []).forEach(function (sid) {
      var m = skillSet(specs[sid] && specs[sid].career_skills);
      Object.keys(m).forEach(function (k) { specSkills[k] = true; });
    });
    // R7 B-1053 (ruling release-r7-bug-burndown ADDENDUM 17): "is this a career skill?" is CharResolve.careerSkillStatus, the
    // ONE reader (career, specs, spec choices, and a talent's career_skill grant such as Insight's). Jason's D-397 save
    // attests the tag for the talent route: Discipline is career there only through INSIGHT, and OggDude writes
    // <isCareer>true</isCareer> for it. Its ranks follow the career lump below (no save holds a ranked talent-only skill).
    var CRs = root.CharResolve || require(sibling('charResolve.js'));
    var allCareer = {};
    var cst = CRs.careerSkillStatus(character, { careers: careers, specializations: specs, talents: talents });
    Object.keys(cst).forEach(function (k) { var o = idToOgg[cst[k].id]; if (o && cst[k].career) allCareer[o] = true; });

    var ours = {};
    Object.keys(character.skills || {}).forEach(function (sk) {
      var ogg = idToOgg[aliasToId[sk]];
      if (ogg) ours[ogg] = character.skills[sk];
    });

    var skEl = sub(root_, 'Skills');
    var nSpecies = 0;
    var order = att.skillOrder.slice();
    Object.keys(ours).sort().forEach(function (k) { if (order.indexOf(k) < 0) order.push(k); });
    order.forEach(function (ogg) {
      var cs = sub(skEl, 'CharSkill');
      sub(cs, 'Key', ogg);
      var rank = sub(cs, 'Rank');
      var isCareer = !!allCareer[ogg];
      if (ours[ogg]) {
        sub(rank, isCareer ? 'CareerRanks' : 'SpeciesRanks', ours[ogg]);
        if (!isCareer) nSpecies++;
      }
      if (isCareer) sub(cs, 'isCareer', 'true');
    });
    if (nSpecies === 0 && sp && sp.skill_choice_grants) {
      note('Species skill grant', 'DROPPED',
        sp.name + ' grants '
        + (sp.skill_choice_grants || []).map(function (gr) {
            return gr.count + ' x' + (gr.rank_cap === undefined ? 1 : gr.rank_cap) + ' from ' + gr.pool;
          }).join('; ')
        + ', and our sheet records no non-career rank to spend it on — every ranked skill this '
        + 'character has belongs to the career or the specialization. The grant is therefore '
        + 'unrepresented rather than misassigned',
        "Your free " + (sp.name || 'species') + " skill choices aren't in the file — whatever you "
        + 'open it in will ask you to pick them again.');
    }

    // ── CAREER ───────────────────────────────────────────────────────────────────────────────
    var carEl = sub(root_, 'Career');
    if (car && car._source_key) {
      sub(carEl, 'CareerKey', car._source_key);
      var first = (character.specializationIds || [])[0];
      var fs_ = specs[first];
      if (fs_ && fs_._source_key) sub(carEl, 'StartingSpecKey', fs_._source_key);
      var chosen = Object.keys(ours).sort().filter(function (k) { return careerSkills[k]; });
      if (chosen.length) {
        var csk = sub(carEl, 'CareerSkills');
        chosen.forEach(function (k) { sub(csk, 'Key', k); });
      }
      var specOnly = Object.keys(ours).sort().filter(function (k) {
        return specSkills[k] && !careerSkills[k];
      });
      if (specOnly.length) {
        var ssk = sub(carEl, 'CareerSpecSkills');
        specOnly.forEach(function (k) { sub(ssk, 'Key', k); });
      }
    }

    // ── TALENTS PURCHASED ────────────────────────────────────────────────────────────────────
    (character.talents || []).forEach(function (t) {
      var tid = (t && t.id) || t;
      var trec = talents[tid];
      if (!trec || !trec._source_key) {
        // B-891: a homebrew (keyless) talent is not in the file — the oracle's row + a player line.
        // R7 (ADDENDUM 5 finding (ii)): "homebrew" only for a talent that IS one (a `custom` record or a `custom_` id); any other
        // talent this export has no OggDude key for (a pack's, or one whose record did not load) says so plainly.
        var thb = (trec && trec._provenance === 'custom') || /^custom_/.test(String(tid));
        note('Talent ' + tid, 'DROPPED', 'no _source_key', ((trec && trec.name) || tid)
          + (thb ? ' is a homebrew talent, so it isn\'t in the file.' : ' has no match in OggDude, so it isn\'t in the file.'));
        return;
      }
      var ct = treeCells[tid];
      if (ct) sub(ct, 'Purchased', 'true');
    });

    // ── EXPERIENCE + ATTRIBUTES ──────────────────────────────────────────────────────────────
    var xp = character.xp || {};
    var ex = sub(root_, 'Experience');
    var er = sub(ex, 'ExperienceRanks');
    if (sp && sp.starting_xp !== undefined && sp.starting_xp !== null) {
      sub(er, 'SpeciesRanks', sp.starting_xp);
    }
    if (xp.spent !== undefined && xp.spent !== null) sub(ex, 'UsedExperience', xp.spent);

    var at = sub(root_, 'Attributes');
    var der = character.derived || {};
    if (now.brawn !== undefined && now.brawn !== null) {
      sub(sub(at, 'SoakValue'), 'StartingRanks', now.brawn);
    } else if (der.soak !== undefined) {
      sub(sub(at, 'SoakValue'), 'StartingRanks', der.soak);
    }
    [['WoundThreshold', 'brawn', 'wound_threshold_base', 'woundThreshold'],
     ['StrainThreshold', 'willpower', 'strain_threshold_base', 'strainThreshold']]
      .forEach(function (t) {
        var el = sub(at, t[0]);
        var contrib = now[t[1]], b = sp && sp[t[2]];
        if (contrib !== undefined && contrib !== null && b !== undefined && b !== null) {
          sub(el, 'StartingRanks', contrib);
          sub(el, 'SpeciesRanks', b);
        } else if (der[t[3]] !== undefined && der[t[3]] !== null) {
          sub(el, 'StartingRanks', der[t[3]]);
        }
      });

    // ── EQUIPMENT ────────────────────────────────────────────────────────────────────────────
    var eq = character.equipment || {};
    // R7 B-1432 (ruling release-r7-bug-burndown ADDENDUM 17): a crafted `{_inline}` item is written as OggDude writes its
    // own crafted item: an empty ItemKey, a GUID Key, the Count, and a CustomWeap / CustomArmor / CustomGear holding the
    // record, ONLY at the members Jason's D-397 save attests (R7__Human_Smuggler_ForceExile__all-pieces.xml). Skill ids
    // go through skills.vocab's attested alias (idToOgg, above), quality ids through qualities.vocab's capitalised alias
    // (OggDude's ItemDescriptor key). What the save attests no member for is TOLD per item, never invented: Brawn-added
    // damage (no DamageAdd), armour defence and ranged defence (no Defense member, no attested ranged Mod key; melee defence
    // is the save's MELEEDEFADD Mod), two hands, a weapon's
    // base mods, an unkeyed skill or quality. An armour-shaped `{_inline}` spare (R-ASS-1) is a CharArmor, not worn.
    var qualKey = {};
    (deps.qualityVocab || []).forEach(function (e) {
      var k = (e.aliases || []).filter(function (al) { return /^[A-Z0-9]+$/.test(al); })[0];
      if (e.id && k) qualKey[e.id] = k;
    });
    var cap = function (s) { s = String(s); return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(); };
    var has = function (v) { return v !== undefined && v !== null && v !== ''; };
    function writeCustom(parentEl, kind, it, worn) {
      var rec = it._inline, nm = rec.name || 'crafted item', left = [];
      var ce = sub(parentEl, kind === 'weapon' ? 'CharWeapon' : kind === 'armor' ? 'CharArmor' : 'CharGear');
      sub(ce, 'ItemKey');
      sub(ce, 'Key', nextKey(''));
      if (worn) sub(ce, 'Equipped', 'true');
      sub(ce, 'Count', it.qty || 1);
      var cu = sub(ce, kind === 'weapon' ? 'CustomWeap' : kind === 'armor' ? 'CustomArmor' : 'CustomGear');
      sub(cu, 'Name', nm);
      if (has(rec.description)) sub(cu, 'Description', rec.description);
      if (kind !== 'armor' && has(rec.type)) sub(cu, 'Type', rec.type);
      var cats = sub(cu, 'Categories');
      (rec.categories || []).forEach(function (c) { sub(cats, 'Category', c); });
      if (has(rec.encumbrance)) sub(cu, 'Encumbrance', rec.encumbrance);
      if (kind === 'weapon' && has(rec.hardpoints)) sub(cu, 'HP', rec.hardpoints);
      if (has(rec.price)) sub(cu, 'Price', rec.price);
      if (kind !== 'armor' && has(rec.rarity)) sub(cu, 'Rarity', rec.rarity);
      var mods = (rec.base_mods || []).filter(function (m) { return m && has(m.description); });
      if (kind === 'weapon') {
        if (rec.restricted === true) sub(cu, 'Restricted', 'true');
        if (idToOgg[rec.skill]) sub(cu, 'SkillKey', idToOgg[rec.skill]); else if (rec.skill) left.push('its skill');
        var dm = rec.damage || {};
        if (dm.base === 'brawn') left.push('its damage (Brawn +' + dm.value + ')');
        else if (typeof dm.value === 'number') sub(cu, 'Damage', dm.value);
        if (has(rec.crit)) sub(cu, 'Crit', rec.crit);
        if (rec.range) { sub(cu, 'RangeValue', 'wr' + cap(rec.range)); sub(cu, 'Range', cap(rec.range)); }
        var qs = (rec.qualities || []).filter(function (q) { return q && q.id; });
        if (qs.length) {
          var qEl = sub(cu, 'Qualities');
          qs.forEach(function (q) {
            if (!qualKey[q.id]) { left.push(q.name || q.id); return; }
            var qe = sub(qEl, 'Quality');
            sub(qe, 'Key', qualKey[q.id]);
            if (q.ranked && has(q.rank)) sub(qe, 'Count', q.rank);
          });
          if (!qEl.kids.length) cu.kids.splice(cu.kids.indexOf(qEl), 1);
        }
        if (rec.hands === 'two_handed') left.push('two hands');
        if (mods.length) left.push('its notes');
      } else {
        // An armour's melee defence is the save's own `<Mod><Key>MELEEDEFADD</Key><Count>`; no save attests a ranged one.
        var melee = kind === 'armor' ? Number(rec.defense_melee) || 0 : 0;
        if (mods.length || melee >= 1) {
          var bm = sub(cu, 'BaseMods');
          if (melee >= 1) { var mm = sub(bm, 'Mod'); sub(mm, 'Key', 'MELEEDEFADD'); sub(mm, 'Count', melee); }
          mods.forEach(function (m) { sub(sub(bm, 'Mod'), 'MiscDesc', m.description); });
        }
        if (kind === 'armor') {
          if (has(rec.soak)) sub(cu, 'Soak', rec.soak);
          if (Number(rec.defense) >= 1) left.push('defence ' + rec.defense);
          if (Number(rec.defense_ranged) >= 1) left.push('ranged defence ' + rec.defense_ranged);
        } else {
          sub(cu, 'AdvImportPath');
        }
      }
      if (left.length) {
        note((kind === 'weapon' ? 'Weapon ' : kind === 'armor' ? 'Armor ' : 'Gear ') + nm, 'DROPPED',
          'crafted; no attested member for: ' + left.join(', ') + ' (B-1432)',
          nm + ' goes to OggDude as a custom item, but OggDude\'s file has no place for ' + left.join(', ')
            + ', so the file leaves that off. Your character here keeps it.');
      }
    }
    var isArmorRec = function (r) {   // read only when a crafted gear item is written (twin harnesses copy this file alone)
      var IRes = root.ItemResolve || (typeof module !== 'undefined' && module.exports ? require(sibling('itemResolve.js')) : null);
      return !!(IRes && IRes.isArmorRecord(r));
    };
    var spareArmor = [];
    [['Weapons', 'CharWeapon', eq.weapons, weapons], ['Gear', 'CharGear', eq.gear, gears]]
      .forEach(function (g) {
        var el = sub(root_, g[0]);
        (g[2] || []).forEach(function (it) {
          if (it && it._inline) {
            // R7 B-1554 (ruling release-r7-bug-burndown ADDENDUM 266, B-1162's contract amended): the export is the SECOND acting
            // reader of `as: "armor"`, so a spare suit filed as armour is a CharArmor whatever its shape (no soak, no defence).
            if (g[1] === 'CharGear' && (it.as === 'armor' || isArmorRec(it._inline))) { spareArmor.push(it); return; }
            writeCustom(el, g[1] === 'CharWeapon' ? 'weapon' : 'gear', it, false);
            return;
          }
          var iid = (it && it.id) || it;
          var rec = g[3][iid];
          if (!rec || !rec._source_key) {
            note(g[1].slice(4) + ' ' + iid, 'DROPPED', 'no _source_key',
              String(iid).toLowerCase() === 'unarmed'
                ? 'Unarmed travels as the innate attack every character has, not as an item in '
                  + 'your gear.'
                : null);
            return;
          }
          var ce = sub(el, g[1]);
          sub(ce, 'ItemKey', rec._source_key);
          sub(ce, 'Key', nextKey(rec._source_key));
          sub(ce, 'Count', (it && it.qty) || 1);
          // R7 B-1354: the player's improvised mark (`equipment.weapons[i].improvised`, R-SSC-5) has no member in OggDude's
          // Weapon (census `oggdude-save-census`: NOT CARRIED), so the file cannot hold it: a DROPPED row says so.
          if (g[1] === 'CharWeapon' && it && it.improvised === true) {
            var wname = rec.name || iid;
            note('Weapon ' + iid + ' improvised', 'DROPPED', 'the improvised mark; OggDude\'s Weapon has no member for it',
              'You marked ' + wname + ' as an improvised weapon. OggDude has no such mark, so the file leaves it off. '
                + 'Your character here keeps it.');
          }
        });
      });
    var iw = att.innateWeaponXml;
    if (iw) find(root_, 'Weapons').kids.push(parseFragment(iw));

    var arEl = sub(root_, 'Armor');
    var ar = eq.armor;
    if (ar) {
      // B-1479 (card release-r5-pre-f1 §2.2): the worn suit is never dropped SILENTLY. A `{_inline}` suit (crafted, or a
      // homebrew copy) has no OggDude item, and a catalogue suit without a `_source_key` has none to name: each is a
      // DROPPED row, worded as the gear loop above words its own.
      if (ar._inline) {
        writeCustom(arEl, 'armor', ar, true);   // R7 B-1432: the worn crafted suit, as the gear loop writes a spare
      } else {
        var aid = (ar && ar.id) || ar;
        var arec = armors[aid];
        if (arec && arec._source_key) {
          var ce2 = sub(arEl, 'CharArmor');
          sub(ce2, 'ItemKey', arec._source_key);
          sub(ce2, 'Key', nextKey(arec._source_key));
          sub(ce2, 'Equipped', 'true');
          sub(ce2, 'Count', 1);
        } else {
          note('Armor ' + aid, 'DROPPED', 'no _source_key', null);
        }
      }
    }
    spareArmor.forEach(function (it) { writeCustom(arEl, 'armor', it, false); });   // R7 B-1432: crafted spares, not worn

    // ── SIGNATURE VEHICLE (release-r5-rigger-card ADDENDUM 2 C3; ruling oggdude-decompile R-ODC-2) ─────────────────
    // OggDude points at the ship BY ITS FILE KEY: SWCharGenLib · CharRigger · SigVehicle resolves
    // `allVehicles.Find(vv => vv.cveh.Key == VehicleKey)`, and CharVehicle · Key is a GUID serialized with the vehicle. So the
    // bonded vessel goes into the file as ONE <CharVehicle> (ItemKey, Key, Count: the held saves' order) and Rigger · VehicleKey
    // is that same Key. WeaponIndex stays -1 and custRigger / MaxSilhouette stay the scaffold: CharRigger · Recalc rebuilds both
    // from talents, and a RIGGER attachment is never written (OggDude adds it at runtime and strips any it finds).
    // WHO: the ONE bond reader and the ONE holder rule (vesselResolve resolveBond + signatureOf). The caller hands
    // `opts.rigger = { characterId, resolveCtx, vessels, vehicles }`: resolveCtx is the vesselView deviceResolveCtx shape and
    // carries this character under characterId; vessels the Ship Yard state (a list or { vessels }); vehicles the library
    // (key → row: a function, a list of rows or a map), whose `key` is OggDude's vehicle key.
    // No context, no bond or no talent → nothing here runs and the file is byte-identical to before. A bonded talent-holder
    // whose ship has no OggDude key (a built frame, or a row the library does not hold) or who is not its holder (too large,
    // or a second holder) gets the scaffold and a DROPPED row. Other vessels the character owns are not written.
    (function rigger() {
      var rig = opts.rigger || {}, ctx = rig.resolveCtx, cid = rig.characterId;
      if (!ctx || cid == null) return;
      var VR = rig.vesselResolve || root.SWRPGVesselResolve
        || (typeof module !== 'undefined' && module.exports ? require('./vesselResolve.js').SWRPGVesselResolve : null);
      if (!VR) return;
      var me = ((ctx && ctx.characters) || []).filter(function (c) { return c && String(c.id) === String(cid); })[0];
      if (!me) return;
      var rec = VR.resolveBond(me, rig.vessels || []);
      if (!rec || !(me.talents && me.talents.signature_vehicle)) return;
      var look = rig.vehicles, vk = rec.vehicleKey;
      var vrow = (rec.build && rec.build.frame) || !vk ? null
        : typeof look === 'function' ? look(vk)
        : Array.isArray(look) ? look.filter(function (r) { return r && r.key === vk; })[0]
        : (look && look[vk]) || null;
      var shipName = rec.nickname || (vrow && vrow.name) || 'your ship';
      if (!vrow || vrow.key !== vk) {
        note('Signature Vehicle ' + shipName, 'DROPPED', 'no OggDude vehicle key for ' + (vk || (rec.build && rec.build.frame) || rec.id),
          shipName + ' has no OggDude version, so your Signature Vehicle isn\'t in this file. Your character here keeps it.');
        return;
      }
      var sig = VR.signatureOf(rec, vrow, ctx);
      if (!sig.holder || String(sig.holder.character) !== String(cid)) {
        var big = (sig.too_large || []).some(function (s) { return String(s.character) === String(cid); });
        note('Signature Vehicle ' + shipName, 'DROPPED', big ? 'silhouette above the holder\'s limit' : 'another character holds it',
          big ? shipName + ' is too big to be your Signature Vehicle, so it isn\'t in this file.'
            : shipName + ' is another character\'s Signature Vehicle, so it isn\'t in this file as yours.');
        return;
      }
      var guid = nextKey(vk);
      var cv = sub(sub(root_, 'Vehicles'), 'CharVehicle');
      sub(cv, 'ItemKey', vk);
      sub(cv, 'Key', guid);
      sub(cv, 'Count', 1);
      sub(sub(root_, 'Rigger'), 'VehicleKey', guid);
    })();

    // ── SCHEMATICS (release-r5-rigger-card ADDENDUM 2 C6; ruling oggdude-decompile R-ODC-3) ─────────────────────────
    // Each held schematic is <CharSchematic><TemplateKey/><Level/></CharSchematic>, in that order (the held saves agree), with
    // NO <refTemplate>: SWCharGenLib · Character · LinkSchematics finds `CraftTemplates.FindByKey(TemplateKey)` and REPLACES
    // refTemplate with it, and removes a schematic whose key it does not hold, never throwing. Level is the contract's level
    // (R-ODC-3: CTL frmCraftItem · FinishUp counts the Schematic improvements; LIB CraftTemplate · CheckRequired floors at 0).
    // The TemplateKey is the template's ONE `ogg_keys` entry. A template with none (a homebrew recipe) is DROPPED and TOLD. A
    // template with SEVERAL (powered_melee_weapon, cybernetic_appendage) is DROPPED and TOLD too: the sheet keeps no record of
    // which of OggDude's templates it was, and which key to write is on the gate for its ruling, never guessed here.
    var tpls = deps.craftTemplates || {};
    (character.craft_schematics || []).forEach(function (sc) {
      var tid = sc && sc.template_id;
      var tpl = tpls[tid];
      var tname = (tpl && tpl.name) || tid;
      var keys = (tpl && Array.isArray(tpl.ogg_keys)) ? tpl.ogg_keys : [];
      if (keys.length !== 1) {
        note('Schematic ' + tname, 'DROPPED', keys.length ? 'several OggDude templates (' + keys.join(', ') + ')' : 'no OggDude key',
          keys.length ? 'OggDude splits ' + tname + ' into ' + keys.length + ' recipes, so your schematic is left out of this file. '
              + 'Your character here keeps it.'
            : tname + ' is a homebrew recipe, so its schematic isn\'t in the file. Your character here keeps it.');
        return;
      }
      var cs = sub(find(root_, 'Schematics') || sub(root_, 'Schematics'), 'CharSchematic');
      sub(cs, 'TemplateKey', keys[0]);
      sub(cs, 'Level', Math.max(0, parseInt(sc.level, 10) || 0));
    });

    // ── REWARDS (R6 lane C; ruling release-r6-rewards-c0 R-R6RC-2..4 and D1; release-r4-shapes S2 + ADDENDUM 4) ───────────
    // Each row is <CharReward><RewardKey/><SelectedOptions><CharOption><ChoiceKey/><OptionKey/>[<SelectedCraftImprovementKey/>]
    // [<StartingAttribs><Experience/></StartingAttribs>]</CharOption>…</SelectedOptions></CharReward>, the attested saves'
    // order; the Experience written is the picked tier's own price (as the attested FOLLAB1OP1 = 5 carries). HONTITLE writes its
    // kind, derived from the row's two skills, before its strength; a pair that names no kind writes the strength only and is
    // TOLD. BS writes its talent pick only for a talent on OggDude's list; another talent is TOLD. EXPLOIT, ACE and TROPHY have
    // no OggDude reward and are TOLD (R-R6RC-4). OggDude's name element is unattested, so a row's `name` is TOLD, never a guessed
    // tag (D1, C-OGG2B-6). Twin of scripts/ogg_export.py.
    var rtypes = (deps.rewards && (deps.rewards.types || deps.rewards)) || {};
    var oggOfSpend = {};
    var spendCats = (deps.craftSpend && (deps.craftSpend.spend || deps.craftSpend)) || {};
    Object.keys(spendCats).forEach(function (cat) {
      ['improvements', 'flaws'].forEach(function (side) {
        ((spendCats[cat] && spendCats[cat][side]) || []).forEach(function (r) { if (r && r.ogg_key) oggOfSpend[r.id] = r.ogg_key; });
      });
    });
    (character.rewards || []).forEach(function (r) {
      var t = r && Object.prototype.hasOwnProperty.call(rtypes, r.key) ? rtypes[r.key] : null;
      var label = 'Reward ' + ((t && t.name) || (r && r.key) || '?') + (r && r.name ? ' (' + r.name + ')' : '');
      if (!t) {
        note(label, 'DROPPED', 'not a reward type here', 'This reward isn\'t one we know, so it is left out of this file. Your character here keeps it.');
        return;
      }
      if (!t.ogg_key) {
        note(label, 'DROPPED', 'OggDude has no ' + t.name + ' reward', 'OggDude has no ' + t.name + ' reward, so it is left out of this file. Your character here keeps it.');
        return;
      }
      var opts = [];
      if (r.key === 'HONTITLE') {
        var have = (r.skills || []).slice().sort().join('|');
        var kind = (t.kinds || []).filter(function (k) { return k.skills.slice().sort().join('|') === have; })[0];
        if (kind) opts.push({ choice: t.kind_choice, option: kind.key });
        else note(label + ' kind', 'DROPPED', 'its skills name no kind', 'Its two skills don\'t match a Classroom, Championship or Legendary title, so the file has no kind for it.');
      }
      if (r.tier) {
        var tier = (t.tiers || []).filter(function (x) { return x.key === r.tier; })[0];
        opts.push({ choice: t.choice, option: r.tier, xp: tier && tier.xp ? tier.xp : null,
                    improvement: r.key === 'MAKERSMARK' && r.improvement ? (oggOfSpend[r.improvement] || null) : null });
        if (r.key === 'MAKERSMARK' && r.improvement && !oggOfSpend[r.improvement]) {
          note(label + ' result', 'DROPPED', 'crafting result ' + r.improvement + ' has no OggDude key', 'Its crafting result has no OggDude key, so the file doesn\'t say which one.');
        }
      }
      if (r.key === 'BS' && r.talent) {
        var to = (t.options || []).filter(function (o) { return o.talent === r.talent; })[0];
        if (to && t.talent_choice) opts.push({ choice: t.talent_choice, option: to.key });
        else note(label + ' talent', 'DROPPED', 'talent ' + r.talent + ' is not on OggDude\'s scar list', 'OggDude\'s scars offer a fixed list of talents, so this one isn\'t in the file. Your character here keeps it.');
      }
      if (r.name) note(label + ' name', 'DROPPED', 'OggDude\'s name field is unattested', 'The name isn\'t written to the file. Your character here keeps it.');
      var cr = sub(find(root_, 'Rewards') || sub(root_, 'Rewards'), 'CharReward');
      sub(cr, 'RewardKey', t.ogg_key);
      var so = sub(cr, 'SelectedOptions');
      opts.forEach(function (o) {
        var co = sub(so, 'CharOption');
        sub(co, 'ChoiceKey', o.choice);
        sub(co, 'OptionKey', o.option);
        if (o.improvement) sub(co, 'SelectedCraftImprovementKey', o.improvement);
        if (o.xp) sub(sub(co, 'StartingAttribs'), 'Experience', o.xp);
      });
    });

    // ── FORTIFICATIONS (ruling release-r5-crafting-fib-c0 Q5 (b); R7 B-1487, ruling release-r7-bug-burndown ADDENDUM 17) ────
    // OggDude holds a built fortification as a <CharVehicle> with an empty ItemKey and a vtStructure <CustomVehicle> (CTL
    // frmCraftItem · InitRealItem; LIB CharVehicle · CustomVehicle), as Jason's D-397 save writes its Bunker: CharVehicle
    // ItemKey (empty), Key (a GUID), Count, Name (the player's name for it); CustomVehicle Name and Type (the template's name:
    // OggDude's own three profiles carry Type = Name), Categories/Category Fortification, SensorRangeValue srNone,
    // Passengers, Silhouette, Armor, HullTrauma, VehicleType vtStructure, DefRanged, SensorRange "No Sensors". The NUMBERS are
    // the ONE fortification resolver's (craftStore fortificationOf: the template's profile, then built_with), handed in as
    // `opts.fortificationProfiles` {entry id → its output} or resolved here over deps.craftTemplates / deps.craftSpend; the
    // oracle never resolves (--fortifications-json). Only numbers the resolver holds are written (OggDude's dead
    // `Fortification` bool is not). Concealment has no member: TOLD. An entry that does not resolve is DROPPED and TOLD.
    (function fortifications() {
      var list = character.fortifications || [];
      if (!list.length) return;
      var given = opts.fortificationProfiles || null, CS = null, fidx = null, ftpls = deps.craftTemplates || null;
      if (Array.isArray(ftpls)) { var bt = {}; ftpls.forEach(function (t) { if (t && t.id) bt[t.id] = t; }); ftpls = bt; }
      if (!given) {
        CS = root.SWRPGCraft || (typeof module !== 'undefined' && module.exports ? require(sibling('craftStore.js')) : null);
        fidx = CS && deps.craftSpend ? CS.indexSpend(deps.craftSpend, 'fortification') : null;   // as the sheet's fortification card indexes
      }
      var vEl = find(root_, 'Vehicles') || sub(root_, 'Vehicles');
      list.forEach(function (f) {
        var fname = (f && f.name) || 'fortification';
        var prof = given ? given[f && f.id] : (CS && ftpls && fidx ? CS.fortificationOf(f, ftpls, fidx) : null);
        if (!prof || (prof.unresolved && prof.unresolved.length) || prof.passengers == null) {
          note('Fortification ' + fname, 'DROPPED', 'its numbers do not resolve here (B-1487)',
            fname + ' couldn\'t be worked out for this file, so it\'s left out. Your character here keeps it.');
          return;
        }
        var tname = (ftpls && ftpls[f.template_id] && ftpls[f.template_id].name) || fname;
        var cv = sub(vEl, 'CharVehicle');
        sub(cv, 'ItemKey');
        sub(cv, 'Key', nextKey(''));
        sub(cv, 'Count', 1);
        sub(cv, 'Name', fname);
        var cu = sub(cv, 'CustomVehicle');
        sub(cu, 'Name', tname);
        sub(cu, 'Type', tname);
        sub(sub(cu, 'Categories'), 'Category', 'Fortification');
        sub(cu, 'SensorRangeValue', 'srNone');
        sub(cu, 'Passengers', prof.passengers);
        if (prof.silhouette != null) sub(cu, 'Silhouette', prof.silhouette);
        if (prof.armor != null) sub(cu, 'Armor', prof.armor);
        if (prof.hull_trauma != null) sub(cu, 'HullTrauma', prof.hull_trauma);
        sub(cu, 'VehicleType', 'vtStructure');
        if (prof.defense_ranged != null) sub(cu, 'DefRanged', prof.defense_ranged);
        sub(cu, 'SensorRange', 'No Sensors');
        if (prof.concealment != null && Number(prof.concealment) > 0) {
          note('Fortification ' + fname, 'DROPPED', 'no attested member for: concealment ' + prof.concealment + ' (B-1487)',
            fname + ' goes to OggDude as a fortification, but OggDude\'s file has no place for concealment '
              + prof.concealment + ', so the file leaves that off. Your character here keeps it.');
        }
      });
    })();

    // ── COMPANIONS → <NPCs> (ruling release-r6-companions-npcs Q2 (a) + C1/C2, Q4 (a) + C3; RR-1) ──────────────────────
    // Each `sheetData.companions` row is one <Adversary>. Its resolved profile comes from `opts.companionProfiles`
    // {row id → SWRPGCompanions.profileOf output}, else profileOf here over deps.npcs / deps.droid (the ONE resolver; the
    // oracle never resolves). VERBATIM when the row's `_ogg.mapped` equals oggMapped over what the rebuild would read (C2):
    // the file's own block goes back in, byte for byte, re-indented at its depth after serialize. Otherwise REBUILT from the
    // record with attested children only, the attributes split as OggDude derives them (C3). Twin of `_companions` in
    // scripts/ogg_export.py; test/release_r6_ogg_npcs_export.cjs holds the two byte-equal on both paths.
    var raws = [];
    (function companions() {
      var list = Array.isArray(character.companions) ? character.companions : [];
      if (!list.length) return;
      var C = deps.companions || root.SWRPGCompanions
        || (typeof module !== 'undefined' && module.exports ? require('./companions.js') : null);
      var given = opts.companionProfiles || null;
      var npcs = given ? null : (deps.npcs || {}), droid = given ? null : deps.droid;
      var npcKeys = (vol.npcKeys || []).slice();
      var npcsEl = find(root_, 'NPCs') || sub(root_, 'NPCs');
      var skillAlias = {};
      (deps.skillVocab || []).forEach(function (e) {
        var hit = (e.aliases || []).filter(function (a) { return (att.skillKeys || []).indexOf(a) >= 0; })[0];
        if (hit) skillAlias[e.id] = hit;
      });
      list.forEach(function (row) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) return;
        var hasRef = typeof row.ref === 'string' && !!row.ref, hasOwn = !!row.own && typeof row.own === 'object' && !Array.isArray(row.own);
        if (hasRef === hasOwn) return;
        var label = row.name || (hasOwn && row.own.name) || row.ref || 'Your companion';
        var crafted = hasOwn && row.own._provenance === 'crafted';
        var prof = given ? given[row.id] : null;
        if (!given && C && !(crafted && !(droid && droid.spend))) {
          prof = C.profileOf(row, npcs, { droid: droid, weaponsById: weapons });
        }
        if (!prof || prof.missing || !prof.record) {
          note('Companion ' + label, 'DROPPED', 'its profile does not resolve here',
            label + ' couldn\'t be worked out for this file, so it\'s left out. Your character here keeps it.');
          return;
        }
        var rec = prof.record, og = row._ogg || null;
        var live = (Number(row.wounds) || 0) || (Number(row.strain) || 0) || (Array.isArray(row.crits) && row.crits.length);
        if (live) {
          note('Companion ' + label + ' track', 'DROPPED', 'an Adversary has no live track (wounds, strain, crits)',
            label + '\'s current wounds, strain and crits stay here; OggDude has no place for them.');
        }
        if (row.mount) {
          note('Companion ' + label + ' mount', 'DROPPED', 'no mount in an Adversary',
            label + ' goes to OggDude as a creature, not a mount.');
        }
        if (og && typeof og.xml === 'string' && og.mapped && C && og.mapped === C.oggMapped(rec, row)) {
          sub(npcsEl, 'Adversary', '@@OGGRAW' + raws.length + '@@');
          raws.push(og.xml);
          note('Companion ' + label, 'EXACT', 'unchanged since import: the file\'s own <Adversary> block, verbatim');
          return;
        }
        var lost = [];
        var a = sub(npcsEl, 'Adversary');
        sub(a, 'Name', prof.name || rec.name || '');
        sub(a, 'Key', (og && og.key) || npcKeys.shift() || randomGuid());
        var ch = rec.characteristics || {};
        var chEl = sub(a, 'Characteristics');
        CHAR_KEYS.forEach(function (k) {
          var v = Math.max(0, parseInt(ch[k[0]], 10) || 0);
          var cc = sub(chEl, 'CharCharacteristic');
          sub(cc, 'Key', k[1]);
          sub(cc, 'Name', k[2]);
          var rk = sub(cc, 'Rank');
          if (v > 0) sub(rk, 'StartingRanks', 1);
          if (v > 1) sub(rk, 'PurchasedRanks', v - 1);
        });
        var tEl = sub(a, 'Talents');
        (rec.talents || []).forEach(function (t) {
          var tr = t && talents[t.talent_ref];
          if (!tr || !tr._source_key) { lost.push((t && (t.name || t.talent_ref)) || 'a talent'); return; }
          var ct = sub(tEl, 'CharTalent');
          sub(ct, 'Key', tr._source_key);
          sub(ct, 'Ranks', parseInt(t.rank, 10) || 1);
        });
        var sEl = sub(a, 'Skills');
        (rec.skills || []).forEach(function (s) {
          var ref = s && s.skill_ref;
          var key = skillAlias[ref] || ((att.skillKeys || []).indexOf(ref) >= 0 ? ref : null);
          if (!key) { lost.push(ref || 'a skill'); return; }
          var cs = sub(sEl, 'CharSkill');
          sub(cs, 'Key', key);
          var rk = sub(cs, 'Rank');
          var n = parseInt(s.rank, 10) || 0;
          if (n > 0) sub(rk, 'PurchasedRanks', n);
        });
        // The worn armour (every armour row is written Equipped) and the parts C3 splits out.
        var armorRows = [], gearRows = [], items = [];
        (rec.gear || []).forEach(function (g) {
          var gid = typeof g === 'string' ? g : null;
          if (gid && armors[gid]) {
            if (armors[gid]._source_key) armorRows.push(armors[gid]); else lost.push(armors[gid].name || gid);
          } else if (gid && gears[gid]) {
            if (gears[gid]._source_key) gearRows.push(gears[gid]); else lost.push(gears[gid].name || gid);
          } else {
            var gname = gid || (g && g.name) || '';
            if (gname) items.push(gname);
          }
        });
        var aSoak = 0, aDef = 0;
        armorRows.forEach(function (r) { aSoak += Number(r.soak) || 0; aDef += Number(r.defense) || 0; });
        var abil = [], sil = null, force = 0;
        (rec.abilities || []).forEach(function (ab) {
          var nm = String((ab && typeof ab === 'object') ? (ab.name || '') : (ab || ''));
          var m = /^Silhouette (\d+)$/.exec(nm), f = /^Force Rating (\d+)$/.exec(nm);
          if (m) sil = parseInt(m[1], 10);
          else if (f) force = parseInt(f[1], 10);
          else {
            abil.push(nm);
            if (ab && typeof ab === 'object' && ab.description) lost.push(nm + ' (its text)');
          }
        });
        var d = rec.derived || {};
        var br = Math.max(0, parseInt(ch.brawn, 10) || 0), wil = Math.max(0, parseInt(ch.willpower, 10) || 0);
        var atEl = sub(a, 'Attributes');
        function attr(tag, total, parts) {
          var el = sub(atEl, tag), pathList = att.orderByPath['Character/NPCs/Adversary/Attributes/' + tag] || [];
          var typeList = att.orderByType[tag] || [];
          var restTag = ['PurchasedRanks', 'StartingRanks'].filter(function (t) { return pathList.indexOf(t) >= 0; })[0]
            || ['PurchasedRanks', 'StartingRanks'].filter(function (t) { return typeList.indexOf(t) >= 0; })[0];
          var used = 0;
          parts.forEach(function (p) { used += p[1]; });
          var rest = total == null ? 0 : total - used;
          if (rest < 0) {
            note('Companion ' + label + ' ' + tag, 'RECONSTRUCTED',
              tag + ' ' + total + ' is below its derived parts (' + parts.map(function (p) { return p[0] + ' ' + p[1]; }).join(', ')
                + '); written at the parts with the remainder at 0',
              label + '\'s ' + ATTR_WORDS[tag] + ' here is ' + total + '; OggDude works it out as ' + used + ' from '
                + ATTR_FROM[tag] + '.');
            rest = 0;
          }
          var all = parts.concat([[restTag, rest]]);
          var order = pathList.length ? pathList : typeList;
          all.sort(function (x, y) { return order.indexOf(x[0]) - order.indexOf(y[0]); });
          all.forEach(function (p) { if (p[1]) sub(el, p[0], p[1]); });
        }
        attr('SoakValue', Number(d.soak) || 0, [['CharRanks', br], ['ItemRanks', aSoak]]);
        attr('WoundThreshold', Number(d.wounds) || 0, [['CharRanks', br]]);
        attr('StrainThreshold', d.strain == null ? null : (Number(d.strain) || 0), [['CharRanks', wil]]);
        attr('DefenseRanged', Number(d.ranged_defense) || 0, [['ItemRanks', aDef]]);
        attr('DefenseMelee', Number(d.melee_defense) || 0, [['ItemRanks', aDef]]);
        attr('ForceRating', force, []);
        var wEl = sub(a, 'Weapons'), swEl = sub(a, 'SpecialWeapons');
        var qual = [];
        (rec.weapons || []).forEach(function (w) {
          if (typeof w === 'string') {
            var wr = weapons[w];
            if (!wr || !wr._source_key) { lost.push((wr && wr.name) || w); return; }
            var cw = sub(wEl, 'CharWeapon');
            sub(cw, 'ItemKey', wr._source_key);
            sub(cw, 'Key', nextKey(wr._source_key));
            sub(cw, 'Equipped', 'true');
            sub(cw, 'Count', 1);
            return;
          }
          if (!w || typeof w !== 'object') return;
          var aw = sub(swEl, 'AdvWeapon');
          sub(aw, 'Key', swEl.kids.length - 1);
          sub(aw, 'Name', w.name || 'Weapon');
          var sk = skillAlias[w.skill] || ((att.skillKeys || []).indexOf(w.skill) >= 0 ? w.skill : null);
          if (sk) sub(aw, 'SkillKey', sk); else if (w.skill) lost.push((w.name || 'a weapon') + '\'s skill');
          var dm = w.damage || {};
          if (typeof dm.value === 'number') sub(aw, 'Damage', dm.base === 'brawn' ? br + dm.value : dm.value);
          if (w.crit != null && w.crit !== '') sub(aw, 'Crit', w.crit);
          if (w.range) {
            var rg = String(w.range).charAt(0).toUpperCase() + String(w.range).slice(1).toLowerCase();
            sub(aw, 'Range', rg);
            sub(aw, 'RangeValue', 'wr' + rg);
          }
          if (Array.isArray(w.qualities) && w.qualities.length) qual.push(w.name || 'a weapon');
        });
        var arEl2 = sub(a, 'Armor');
        armorRows.forEach(function (r) {
          var ca = sub(arEl2, 'CharArmor');
          sub(ca, 'ItemKey', r._source_key);
          sub(ca, 'Key', nextKey(r._source_key));
          sub(ca, 'Equipped', 'true');
          sub(ca, 'Count', 1);
        });
        var gEl = sub(a, 'Gear');
        gearRows.forEach(function (r) {
          var cg = sub(gEl, 'CharGear');
          sub(cg, 'ItemKey', r._source_key);
          sub(cg, 'Key', nextKey(r._source_key));
          sub(cg, 'Equipped', 'true');
          sub(cg, 'Count', 1);
        });
        var abEl = sub(a, 'Abilities');
        abil.forEach(function (nm, i) { var ae = sub(abEl, 'AdvAbility'); sub(ae, 'Key', i); sub(ae, 'Name', nm); });
        var itEl = sub(a, 'Items');
        items.forEach(function (nm, i) { var ie = sub(itEl, 'AdvItem'); sub(ie, 'Key', i); sub(ie, 'Name', nm); });
        sub(a, 'Silhouette', sil == null ? 1 : sil);
        var tier = String(rec.tier || 'minion');
        sub(a, 'Type', tier.charAt(0).toUpperCase() + tier.slice(1).toLowerCase());
        // What the file's own block held that the rebuild no longer writes (it has no field in our record).
        var held = og && typeof og.xml === 'string' ? og.xml : '';
        OGG_ONLY.forEach(function (t) { if (held.indexOf('<' + t[0] + '>') >= 0) lost.push(t[1]); });
        qual.forEach(function (n) { lost.push(n + '\'s qualities'); });
        if (crafted) lost.push('its droid recipe (the numbers go; how it was built stays here)');
        note('Companion ' + label, 'RECONSTRUCTED',
          (og ? 'changed since import' : 'made here') + ': rebuilt from the record'
            + (lost.length ? '; not written: ' + lost.join(', ') : ''),
          lost.length ? label + ' goes to OggDude rebuilt from your companion here. Left out: ' + lost.join(', ') + '.' : null);
        if (row.young === true) {
          note('Companion ' + label + ' young', 'RECONSTRUCTED', 'young: the halved numbers are written',
            label + ' is young, so the file holds its halved numbers.');
        }
      });
    })();

    // ── OBLIGATION · DUTY · MORALITY ─────────────────────────────────────────────────────────
    // B-289: the stored `type` is a VOCABULARY KEY, not a display name — the importer writes
    // `ObKey`/`DutKey` into it (oggImport.js:185-186) and the creator's mechanic step persists the
    // type's own key. The attestation map is NAME -> KEY, so a key-form type missed the lookup and
    // we emitted <CharObligation> with no <ObKey> AND the raw key as its <Name>. Resolve BOTH
    // directions off the one map: a name still resolves exactly as it did (all 18 pregens are
    // name-form), and a key now resolves to itself plus its display name. The inversion is a
    // bijection — 41 obligation and 46 duty keys, none carrying two names, and no name that is
    // also a key — which `ogg_export_mechanic_keys.cjs` holds as an invariant rather than an
    // assumption; if a future dataset broke it, resolution here would be ambiguous.
    function mechanicIdentity(map, type, fallbackName) {
      var t = String(type == null ? '' : type).trim();
      if (!t) return { key: null, name: fallbackName };
      var m = map || {};
      if (m[t]) return { key: m[t], name: t };            // NAME form — unchanged behaviour
      var names = Object.keys(m);
      for (var i = 0; i < names.length; i++) {
        if (m[names[i]] === t) return { key: t, name: names[i] };  // KEY form — the B-289 fix
      }
      return { key: null, name: t };                      // neither — carried by name, receipt says so
    }
    var ob = character.obligation;
    if (ob) {
      var obEl = sub(root_, 'Obligations');
      var oc = sub(obEl, 'CharObligation');
      var obId = mechanicIdentity(att.obligationKeys, ob.type, 'Obligation');
      sub(oc, 'Key', 0);
      sub(oc, 'Name', obId.name || 'Obligation');
      sub(oc, 'Size', ob.value || 0);
      // R7 B-1475 (b) (ADDENDUM 17): the note, at the position Jason's D-397 save attests (Key, Name, Size, Notes, ObKey);
      // an empty note is left out, as OggDude does. Twin: ogg_export.py.
      if (ob.description) sub(oc, 'Notes', ob.description);
      var obk = obId.key;
      if (obk) sub(oc, 'ObKey', obk);
      // R7 B-1475 (a): OggDude's loader (Character.LinkObligations) REMOVES an entry with no key when it opens the file, so the
      // receipt says DROPPED, not carried. It is still written by name (other importers join on it). Twin: ogg_export.py.
      else note('Obligation', 'DROPPED', pyStr(ob.type) + ' ' + pyStr(ob.value) + ' has no OggDude key (it matches no entry in the attested obligation '
        + 'vocabulary); OggDude\'s loader (Character.LinkObligations) removes a keyless entry when it opens the file',
        'OggDude doesn\'t know the Obligation type ' + pyStr(ob.type) + ', so it drops your Obligation when it opens the file. '
          + 'Your character here keeps it.');
    }
    var du = character.duty;
    if (du) {
      var duEl = sub(root_, 'Duties');
      var dc = sub(duEl, 'CharDuty');
      var duId = mechanicIdentity(att.dutyKeys, du.type, 'Duty');
      sub(dc, 'Key', 0);
      sub(dc, 'Name', duId.name || 'Duty');
      sub(dc, 'Size', du.value || 0);
      if (du.description) sub(dc, 'Notes', du.description);   // R7 B-1475 (b): Key, Name, Size, Notes, DutKey (the D-397 save)
      var dk = duId.key;
      if (dk) sub(dc, 'DutKey', dk);
      // R7 B-1475 (a): OggDude's loader (Character.LinkDuties) REMOVES an entry with no key when it opens the file, so the
      // receipt says DROPPED, not carried. It is still written by name (other importers join on it). Twin: ogg_export.py.
      else note('Duty', 'DROPPED', pyStr(du.type) + ' ' + pyStr(du.value) + ' has no OggDude key (it matches no entry in the attested duty '
        + 'vocabulary); OggDude\'s loader (Character.LinkDuties) removes a keyless entry when it opens the file',
        'OggDude doesn\'t know the Duty type ' + pyStr(du.type) + ', so it drops your Duty when it opens the file. '
          + 'Your character here keeps it.');
    }
    // ── CREATION-BONUS CHOICES (R7 R-R7-O3, B-1475 (c)) ──────────────────────────────────────────────────────────────
    // The sheet's trade picks (`mechanicTradeIds`, G9) go back to their OggDude flag through the importer's one crosswalk
    // (OB_DUTY_TRADES), on <ObOptions> (an obligation) or <DutOptions> (a duty). A flag is written only at a position the
    // attestation holds; any other is DROPPED and told (F-1: no save we hold carries it yet).
    var tradeX = obDutyTrades();
    var tradeIds = Array.isArray(character.mechanicTradeIds) ? character.mechanicTradeIds : [];
    [['obligation', character.obligation], ['duty', character.duty]].forEach(function (m) {
      var tw = tradeX && tradeX[m[0]];
      if (!tw || !m[1] || !tradeIds.length) return;
      var attested = (att.orderByPath && att.orderByPath['Character/' + tw.el]) || [];
      Object.keys(tw.flags).forEach(function (flag) {
        if (tradeIds.indexOf(tw.flags[flag]) === -1) return;
        if (attested.indexOf(flag) !== -1) {
          var oe = find(root_, tw.el) || sub(root_, tw.el);
          if (!find(oe, 'StartingSize')) sub(oe, 'StartingSize', '5');
          sub(oe, flag, 'true');
        } else {
          var label = m[0] === 'obligation' ? 'Obligation' : 'Duty';
          note(tw.el + '/' + flag, 'DROPPED', 'no save attests the position of ' + tw.el + '/' + flag,
            'The starting bonus you took for your ' + label + ' isn\'t written to the file yet, so OggDude won\'t show it. '
              + 'Your character here keeps it.');
        }
      });
    });

    // ── MOTIVATION (R7 R-R7-O2, B-1474 (3)) ──────────────────────────────────────────────────────────────────────────
    // The sheet's one Motivation ({category, specific}, B-103) is written as OggDude writes one: <CharMotivation> Key 0, Name the
    // category's name, MotiveKey the category's `_source_key`, SpecMotiveKey the specific's when it belongs to the category.
    // A Motivation with no OggDude key (the player's own words, or an id the registry lacks) is not written, and told: LIB
    // Character.LinkMotivations drops an unkeyed one on open.
    var motv = character.motivation;
    if (motv && (motv.category || motv.specific || motv.custom)) {
      var mreg = deps.motivations || {};
      var mcat = (mreg.categories || []).filter(function (c) { return c && c.id === motv.category; })[0];
      var mspec = (mreg.specifics || []).filter(function (x) { return x && x.id === motv.specific; })[0];
      if (mcat && mcat._source_key) {
        var cm = sub(sub(root_, 'Motivations'), 'CharMotivation');
        sub(cm, 'Key', 0);
        sub(cm, 'Name', mcat.name);
        sub(cm, 'MotiveKey', mcat._source_key);
        if (mspec && mspec._source_key && (mcat.specific_ids || []).indexOf(mspec.id) !== -1) sub(cm, 'SpecMotiveKey', mspec._source_key);
      } else {
        var mwords = motv.custom || motv.category || motv.specific;
        note('Motivation', 'DROPPED', 'no OggDude motive key for ' + pyRepr(mwords),
          'Your Motivation, ' + mwords + ', has no match in OggDude, so it is left out of the file. Your character here keeps it.');
      }
    }

    var mo = character.morality;
    if (mo && mo.value !== undefined && mo.value !== null) {
      var moEl = sub(root_, 'Morality');
      // R7 B-1538 (ADDENDUM 266 Q2 A): the starting-Morality pick goes back as its <Option> (Character/Morality's attested first
      // child) through MORALITY_TRADES. A morality trade the crosswalk does not map is DROPPED and told in R-R7-O3's words.
      var moX = moralityTrades(), moOpts = moX ? moX.options : {};
      tradeIds.filter(function (id) { return /^fad_raw_/.test(id); }).forEach(function (id) {
        var opt = Object.keys(moOpts).filter(function (k) { return moOpts[k] === id; })[0];
        if (opt) sub(find(moEl, 'Options') || sub(moEl, 'Options'), 'Option', opt);
        else note('Morality/Options', 'DROPPED', 'no save attests the OggDude option for ' + id,
          'The starting bonus you took for your Morality isn\'t written to the file yet, so OggDude won\'t show it. '
            + 'Your character here keeps it.');
      });
      sub(moEl, 'MoralityValue', mo.value);
    }

    // R7 R-R7-O1 (ruling release-r7-bug-burndown ADDENDUM 8): OggDude's <Credits> is the POOL before gear (the corpus holds
    // 500 beside bought gear), so the file carries the pool, not the balance: the sheet's balance plus the price of the gear it
    // holds — which is the purse + after-creation credits + pocketMoney by normalizeCreated's own subtraction. Twin: the oracle.
    var credits = eq.credits !== undefined ? eq.credits : character.credits;
    if (typeof credits === 'number') credits += gearPrice(eq, weapons, armors, gears);
    if (credits !== undefined && credits !== null) sub(root_, 'Credits', credits);

    // R7 B-1474 (2) Story (ADDENDUM 17): the sheet's backstory as <Story>'s plain text (the D-397 save: <Story>I am Legend</Story>).
    // An empty one is the scaffolding's empty <Story/>, as before. Twin: ogg_export.py.
    if (character.backstory) sub(root_, 'Story', character.backstory);

    // ── PORTRAIT (R7 B-1051; census `oggdude-save-census`: `Character.Portrait` is a byte[], base64, written when set) ──
    // The player's own picture is `sheet.portrait`, a data: URI (an upload or an import, re-encoded by reEncodePortrait,
    // R-OGG-21). Its bytes are the element's text. Anything else (no picture, a species portrait's path) leaves the
    // element to the scaffold below, which writes OggDude's own default as it always did.
    var portraitM = /^data:image\/(?:png|jpeg|gif|bmp);base64,([A-Za-z0-9+\/=]+)$/.exec(String(character.portrait || ''));
    if (portraitM) sub(root_, 'Portrait', portraitM[1]);

    // ── COMMUNITY-CONTENT DEPENDENCIES (build card term 7) ───────────────────────────────────
    // Gathered from the records this character actually USED, never from the registries at large:
    // 440 of 537 species are community-sourced, so a whole-registry statement would be true of the
    // catalogue and useless about the person in front of you. ONE LINE PER CLASS, derived from
    // `_provenance` — a hand-listed set of names would be wrong within a lap.
    // Word-for-word the oracle's `_community_lines`; test/ogg_export_receipt.cjs holds them equal.
    var COMMUNITY_LABEL = {
      species: ['species', 'this species'], careers: ['career', 'this career'],
      specializations: ['specialization', 'this specialization'], talents: ['talent', 'these talents']
    };
    // `_dataset` names the SET (R-FRC-1). An unknown token falls back to ITSELF, and a class whose
    // records disagree — or carry none — gets the generic wording: an install instruction naming
    // the wrong data set is worse than one naming none. Mirrors the oracle's DATASET_NAMES.
    var DATASET_NAMES = { csg: 'the Complete Species Guide', tor: 'the Old Republic set',
                          respec: 'reSpecialized' };
    var used = {
      species: [sp], careers: [car],
      specializations: (character.specializationIds || []).map(function (i) { return specs[i]; }),
      talents: (character.talents || []).map(function (t) { return talents[(t && t.id) || t]; })
    };
    ['species', 'careers', 'specializations', 'talents'].forEach(function (kind) {
      var comm = (used[kind] || []).filter(function (r) { return r && r._provenance === 'community'; });
      if (!comm.length) return;
      var noun = COMMUNITY_LABEL[kind][0], subject = COMMUNITY_LABEL[kind][1];
      var uniq = [];
      comm.forEach(function (r) {
        var n = r.name || r.id;
        if (uniq.indexOf(n) < 0) uniq.push(n);
      });
      var names = uniq.sort().slice(0, 3).join(', ');
      var more = comm.length <= 3 ? '' : ' (+' + (comm.length - 3) + ' more)';
      var sets = [];
      comm.forEach(function (r) { if (sets.indexOf(r._dataset) < 0) sets.push(r._dataset); });
      var one = sets.length === 1 ? sets[0] : null;
      var setName = one ? (DATASET_NAMES[one] || one) : null;
      note('Community ' + noun, 'DEPENDENCY',
        comm.length + ' community-sourced ' + noun + ' record(s) exported with their own keys, '
        + 'never remapped to a nearest official record. Data set named from `_dataset`: '
        + (setName || 'MIXED OR ABSENT — generic wording used'),
        setName
          ? names + more + ' is from ' + setName + ' — wherever you open this file needs that data '
            + "set installed, or " + subject + " won't resolve."
          : names + more + ' is community content — wherever you open this file needs the matching '
            + "community data set installed, or " + subject + " won't resolve.");
    });

    // ── SCAFFOLDING, DEFAULTS, ORDER ─────────────────────────────────────────────────────────
    Object.keys(NEUTRAL_FORM).forEach(function (tag) { ensure(root_, tag, NEUTRAL_FORM[tag]); });
    FIXED_LEAVES.forEach(function (t) { ensure(root_, t[0], null, t[1]); });
    Object.keys(NESTED_FORM).forEach(function (p) {
      var rel = p.slice('Character/'.length);
      findAll(root_, rel).forEach(function (parent) {
        NESTED_FORM[p].forEach(function (c) { if (!find(parent, c[0])) sub(parent, c[0], c[1]); });
      });
    });
    [['Class', 'ClassKey'], ['Hook', 'HookKey'], ['Attitude', 'AttitudeKey']].forEach(function (t) {
      var el = find(root_, t[0]);
      var d = att.defaults[t[0] + '/' + t[1]];
      if (el && d) {
        var k = find(el, t[1]) || sub(el, t[1]);
        if (!k.text) k.text = d;
      }
    });
    if (!find(root_, 'LastChanged')) sub(root_, 'LastChanged', vol.stamp || new Date().toISOString());
    var fn = ensure(root_, 'FileName', null, opts.fileName || 'Char0.xml');
    fn.el.text = opts.fileName || 'Char0.xml';
    var port = find(root_, 'Portrait');
    if (!port || !port.text) {
      var blob = att.defaultPortraitBase64;
      if (blob) (port || sub(root_, 'Portrait')).text = blob;
    }

    var unplaceable = [];
    orderTree(root_, att, unplaceable);
    if (unplaceable.length) {
      throw new Error('no attested position for: ' + unplaceable.join(', ') + ' — refusing to emit');
    }
    var out = serialize(root_);
    // The verbatim Adversaries: each placeholder LINE becomes the file's block, every line at the placeholder's pad.
    if (raws.length) {
      out = out.replace(/^( *)<Adversary>@@OGGRAW(\d+)@@<\/Adversary>$/gm, function (_, pad, n) {
        return raws[+n].split('\n').map(function (l) { return pad + l; }).join('\n');
      });
    }
    return out;
  }

  // A rebuilt Adversary's receipt words (ruling release-r6-companions-npcs C3, Q2 (a)). Twin of the oracle's.
  var ATTR_WORDS = { SoakValue: 'soak', WoundThreshold: 'wound threshold', StrainThreshold: 'strain threshold',
                     DefenseRanged: 'ranged defence', DefenseMelee: 'melee defence', ForceRating: 'Force rating' };
  var ATTR_FROM = { SoakValue: 'Brawn and armour', WoundThreshold: 'Brawn', StrainThreshold: 'Willpower',
                    DefenseRanged: 'armour', DefenseMelee: 'armour', ForceRating: 'nothing' };
  var OGG_ONLY = [['DieModifier', 'die modifiers'], ['ItemDescInfo', 'item descriptors'], ['Descriptor', 'weapon descriptors'],
                  ['UsedExperience', 'used experience'], ['AdvArmor', 'special armour']];

  function parseFragment(xml) {
    // The attestation carries a few blocks VERBATIM (the species option choices, the innate
    // weapon). They are re-parsed rather than re-authored so the shipped bytes are the corpus's.
    var stack = [], cur = null, rootEl = null;
    var re = /<([A-Za-z_][\w.-]*)\s*(\/?)>|<\/([A-Za-z_][\w.-]*)>|([^<]+)/g, m;
    while ((m = re.exec(xml))) {
      if (m[1]) {
        var e = El(m[1]);
        if (cur) cur.kids.push(e); else rootEl = e;
        if (!m[2]) { stack.push(cur); cur = e; }
      } else if (m[3]) {
        cur = stack.pop();
      } else if (m[4] && cur && m[4].trim()) {
        cur.text = m[4].trim();
      }
    }
    return rootEl;
  }

  /* The dataset writes <StartingAttributes> where a character file writes <StartingAttribs>.
   * ATTESTED, not guessed: Jason's droid save carries DROIDCH3OP1 with <StartingAttribs>, and the
   * dataset's definition of that same option carries <StartingAttributes> with identical content.
   * Twin of PAYLOAD_TAG_ALIASES in scripts/ogg_export.py. */
  var PAYLOAD_TAG_ALIASES = { StartingAttributes: 'StartingAttribs' };

  /* Twin of `_is_row_id` in scripts/ogg_export.py — one rule, mirrored, not re-derived. */
  // Python's repr of a str/None, for the technical register's "%r" (the oracle's wording, kept word for word).
  function pyRepr(v) {
    if (v === undefined || v === null) return 'None';
    var t = String(v);
    return t.indexOf("'") !== -1 && t.indexOf('"') === -1 ? '"' + t + '"' : "'" + t.replace(/'/g, "\\'") + "'";
  }
  function isRowId(key) {
    return !!key && /^[0-9]+$/.test(String(key));
  }
  // Python's "%s" of a value (None, True/False, a number, a str) — the oracle's wording, kept word for word (R7 B-1475).
  function pyStr(v) {
    if (v === undefined || v === null) return 'None';
    if (v === true) return 'True';
    if (v === false) return 'False';
    return String(v);
  }

  function randomGuid() {
    var s = '';
    for (var i = 0; i < 36; i++) {
      s += (i === 8 || i === 13 || i === 18 || i === 23) ? '-'
        : (i === 14 ? '4' : Math.floor(Math.random() * 16).toString(16));
    }
    return s;
  }

  /* THE CARRIED COUNT (R7 B-711) — how many fields the file the player is about to download carries.
   * "Field" is the unit the "239 fields" figure was measured in (`ogg-2b-export-experiment`): a
   * distinct leaf path, with repeated siblings told apart by their natural key, then their own text,
   * then their position. Twin of `flatten` in scripts/ogg_roundtrip_diff.py — one rule, mirrored, not
   * re-derived; test/b711_export_carried_count.cjs holds the two to the same number. */
  var NATURAL_KEY = {
    CharSkill: 'Key', CharCharacteristic: 'Key', CharTalent: 'Key',
    CharSpecialization: 'Key', CharGear: 'ItemKey', CharArmor: 'ItemKey',
    CharWeapon: 'Key', CharObligation: 'ObKey', CharDuty: 'DutKey',
    CharOption: 'ChoiceKey', CharMotivation: 'MotiveKey'
  };
  function fieldCount(xml) {
    var paths = {};
    (function flatten(el, path) {
      if (!el.kids.length) { paths[path] = true; return; }
      var counts = {}, seen = {};
      el.kids.forEach(function (c) { counts[c.tag] = (counts[c.tag] || 0) + 1; });
      el.kids.forEach(function (c) {
        var step = c.tag;
        if (counts[c.tag] > 1) {
          var nk = NATURAL_KEY[c.tag], k = nk ? find(c, nk) : null;
          var ident = (k && k.text) || c.text || null;
          if (!ident) { seen[c.tag] = (seen[c.tag] || 0) + 1; ident = '#' + seen[c.tag]; }
          step = c.tag + '[' + ident + ']';
        }
        flatten(c, path + '/' + step);
      });
    })(parseFragment(xml), 'Character');
    return Object.keys(paths).length;
  }

  var api = { CANONICAL_ORDER: CANONICAL_ORDER, exportCharacter: exportCharacter, fieldCount: fieldCount,
              _serialize: serialize, _El: El, _parseFragment: parseFragment };
  root.SWRPGOggExport = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
