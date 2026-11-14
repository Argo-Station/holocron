/**
 * packValidate.js — window.SWRPGPackValidate: THE validation rail at the user-pack boundary (F-100 UD-1c;
 * ruling f100-ud1-contracts R-FUD-3 + R-FUD-9; brief f100-ud1-contracts §3, §9).
 *
 * ONE reader of the schema files the Python validator reads (schema/*.schema.json): a draft-2020-12
 * SUBSET interpreter — no ajv, no copied schemas, no code generation. It implements exactly the
 * keywords those files use (the brief's measured 25, plus `maxLength`, which the ratified baseAnchor
 * literal brought in) and THROWS at construction on any other keyword, so a schema that grows a keyword
 * this reader does not implement fails loud instead of validating nothing. test/pack_validate_parity.cjs
 * holds its verdict equal to Python `jsonschema`'s over every canonical record plus mutants.
 *
 * FOUR ARMS, in order (brief §9): (1) ENVELOPE — user-pack.schema.json; (2) RECORD SHAPE — each record,
 * with the pack-owned keys (_base, _mode, _changes) and `_provenance` set aside, against ITS section's
 * entity schema; (3) CROSS-FIELD — the L1cb.prk per_rank refusals, `_mode` vs namespace, key == id;
 * (4) REFS — the L1.1 / L1cb.1 joins against base ∪ this pack ∪ the other active packs.
 *
 * TWO MODES (R-FUD-3, charter §8's split — loud on a code path, graceful on a data path):
 *   authoring(pack, ctx) — every save and every SHARE export: anything outside the known part is
 *     REFUSED with a named reason, one line each, `section.id.path: what — why`.
 *   load(pack, ctx) — PARTITIONS: the pack is returned as `stored`, the very object passed in, never
 *     mutated (byte-faithful); the KNOWN part comes back as `applied` (fresh copies for the merge).
 *       · unknown op / when / target in a talent's effects[] entry, or unknown die / direction / anchor
 *         scope in a pool_mods[] entry → that ENTRY is quarantined: left out of the applied copy and
 *         listed on the copy's `_unapplied` (a resolved-view field, never persisted). The rest applies.
 *       · an unknown field (additionalProperties) at any depth → pruned from the applied copy, listed
 *         `unknown-field:<path>` on `_unapplied`; the record still applies.
 *       · an unknown section → `ignoredSections`; vehicles / npcs → `preservedSections` (H5, R-FEDC-8);
 *         an unknown envelope key → `ignoredKeys`. Stored, merged nowhere.
 *       · formatVersion > 1 → status `newer-format`: stored, nothing applied.
 *       · any other record failure (and an `add` whose id is canonical) → the RECORD is `kept`, not
 *         applied, with the rail's reasons.
 *       · a dangling reference → the record APPLIES; listed in `warnings`.
 *     charResolve.talentEffectsOf keeps THROWING on an unknown op inside the app's own registry — it
 *     never sees a quarantined entry, so its throw keeps meaning "our own data is broken".
 *
 * A share-projection record (`_changes`, R-FUD-8/10) is rebuilt through `ctx.rebuild(section, id, rec)`
 * (UD-1e supplies it); without that hook such a record is kept, not applied (`share-not-rebuilt`); a
 * hook that THROWS keeps the record with `share-rebuild-failed — <message>` (UD-1e).
 *
 * Dual-export (browser window.SWRPGPackValidate / CommonJS), sources.js idiom. Pure; the only I/O is
 * two loaders of the SAME files: `readSchemaDir` (node, the guards) and `fetchSchemas` (the browser,
 * over the /schema/* path ruling H4 serves — UD-1f). No copy of a schema exists anywhere else.
 */
(function (root) {
  'use strict';

  var SECTION_SCHEMAS = {
    weapons: 'weapon.schema.json', armor: 'armor.schema.json', gear: 'gear.schema.json',
    species: 'species.schema.json', careers: 'career.schema.json',
    specializations: 'specialization.schema.json', talents: 'talent.schema.json',
    force_powers: 'force-power.schema.json',
    signature_abilities: 'signature-ability.schema.json',   // F-100 M12 (R-M12B-101): the ninth applied section
  };
  var APPLIED_SECTIONS = Object.keys(SECTION_SCHEMAS);
  var PRESERVED_SECTIONS = ['vehicles', 'npcs'];          // known to the envelope, applied nowhere in v1
  var ENVELOPE_SCHEMA = 'user-pack.schema.json';
  var SCHEMA_FILES = APPLIED_SECTIONS.map(function (s) { return SECTION_SCHEMAS[s]; })
    .concat(['charbuild-common.schema.json', 'item-common.schema.json', ENVELOPE_SCHEMA]);
  var SET_ASIDE = ['_base', '_mode', '_changes', '_provenance', '_from'];   // brief §9 arm 2
  // B-1021 F1 (b) (ruling release-r7-bug-burndown ADDENDUM 80): fields the schema admits but only a GENERATOR writes. A talent's
  // `same_as` is stamped by scripts/canonical/respec_same_as.py onto shipped reSpecialized records (ADDENDUM 67, the ONE
  // generator); a user pack carrying it would be a second writer, and CharResolve.resolveSheetTalents would fold a talent
  // whose rules differ into another's row. So a user record never carries it: LOAD prunes it (listed `generator-only:<f>`
  // on `_unapplied`, the record still applies, its own identity) and AUTHORING refuses it.
  var GENERATOR_ONLY = { talents: ['same_as'] };
  var ITEM_SECTIONS = { weapons: true, armor: true, gear: true };

  var KEYWORDS = ['$ref', 'type', 'enum', 'const', 'properties', 'required', 'additionalProperties',
                  'propertyNames', 'minProperties', 'items', 'minItems', 'maxItems', 'uniqueItems', 'minLength',
                  'maxLength', 'pattern', 'minimum', 'maximum', 'exclusiveMinimum', 'allOf', 'anyOf',
                  'oneOf', 'not', 'if', 'then', 'else'];
  var ANNOTATIONS = ['$schema', '$id', '$comment', '$defs', 'title', 'description', 'default',
                     'examples', 'deprecated', 'readOnly', 'writeOnly'];

  var hasOwn = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  // R-SPF-4 (`f100-surfacing-preflip-species-card`): the ONE span hash (lib/shared/textHash.js), for the species arm's
  // stale-words leg. Off window in a shell, by require in node; absent (an old shell), the leg is skipped, never guessed.
  function TH() {
    var T = (root && root.SWRPGTextHash) || null;
    if (!T && typeof require === 'function') { try { T = require('./textHash.js'); } catch (e) { T = null; } }
    return T;
  }
  // R-AES-10 (`argo-a1-export-scan` ADDENDUM 1): the ONE removed-text predicate, read at minLength, pattern and required
  function removedAt(path, v) { var T = TH(); return !!(T && T.removedHolds && T.removedHolds(path, v)); }
  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function jtype(v) {
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'array';
    return typeof v;                                        // boolean | number | string | object
  }
  function isType(v, t) {
    switch (t) {
      case 'null': return v === null;
      case 'boolean': return typeof v === 'boolean';
      case 'number': return typeof v === 'number' && isFinite(v);
      case 'integer': return typeof v === 'number' && isFinite(v) && Math.floor(v) === v;
      case 'string': return typeof v === 'string';
      case 'array': return Array.isArray(v);
      case 'object': return isObj(v);
    }
    throw new Error('packValidate: unknown type name `' + t + '` in a schema');
  }
  function deepEqual(a, b) {                               // jsonschema's `equal`: types strict, 1 == 1.0
    if (a === b) return true;
    var ta = jtype(a), tb = jtype(b);
    if (ta !== tb) return false;
    if (ta === 'array') {
      if (a.length !== b.length) return false;
      for (var i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
      return true;
    }
    if (ta === 'object') {
      var ka = Object.keys(a), kb = Object.keys(b);
      if (ka.length !== kb.length) return false;
      for (var j = 0; j < ka.length; j++) if (!hasOwn(b, ka[j]) || !deepEqual(a[ka[j]], b[ka[j]])) return false;
      return true;
    }
    return false;
  }
  function codePoints(s) { var n = 0; for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); if (c < 0xd800 || c > 0xdbff || i + 1 >= s.length) n++; else { var d = s.charCodeAt(i + 1); if (d >= 0xdc00 && d <= 0xdfff) { n++; i++; } else n++; } } return n; }
  function basename(u) { var i = u.lastIndexOf('/'); return i >= 0 ? u.slice(i + 1) : u; }
  function show(v) { var s = JSON.stringify(v); return s === undefined ? String(v) : (s.length > 60 ? s.slice(0, 57) + '…' : s); }
  function pathStr(path) {
    var s = '';
    for (var i = 0; i < path.length; i++) s += typeof path[i] === 'number' ? '[' + path[i] + ']' : (s ? '.' : '') + path[i];
    return s;
  }
  function clone(v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); }

  // ── the draft-2020-12 subset interpreter ────────────────────────────────────────────────────
  function Interpreter(schemas) {
    var docs = {};
    Object.keys(schemas).forEach(function (name) {
      var s = schemas[name];
      docs[basename(name)] = s;
      if (s && typeof s.$id === 'string') docs[basename(s.$id)] = s;
    });
    var regexCache = {};

    // construction-time lint: every keyword in every schema position is one this reader implements
    function lint(node, where) {
      if (node === true || node === false) return;
      if (!isObj(node)) throw new Error('packValidate: schema at ' + where + ' is not a schema');
      Object.keys(node).forEach(function (k) {
        if (KEYWORDS.indexOf(k) === -1 && ANNOTATIONS.indexOf(k) === -1) {
          throw new Error('packValidate: keyword `' + k + '` at ' + where + ' is not implemented by this reader — ' +
                          'implement it (and its parity row) before the schema may use it');
        }
      });
      ['properties', '$defs'].forEach(function (k) {
        if (isObj(node[k])) Object.keys(node[k]).forEach(function (p) { lint(node[k][p], where + '/' + k + '/' + p); });
      });
      ['additionalProperties', 'propertyNames', 'items', 'not', 'if', 'then', 'else'].forEach(function (k) {
        if (hasOwn(node, k)) lint(node[k], where + '/' + k);
      });
      ['allOf', 'anyOf', 'oneOf'].forEach(function (k) {
        if (Array.isArray(node[k])) node[k].forEach(function (s, i) { lint(s, where + '/' + k + '/' + i); });
      });
    }
    Object.keys(docs).forEach(function (n) { lint(docs[n], n + '#'); });

    function deref(ref, doc) {
      var h = ref.indexOf('#');
      var file = h >= 0 ? ref.slice(0, h) : ref, ptr = h >= 0 ? ref.slice(h + 1) : '';
      var d = file ? docs[basename(file)] : doc;
      if (!d) throw new Error('packValidate: unresolvable $ref `' + ref + '`');
      var node = d;
      if (ptr) {
        var toks = ptr.split('/').slice(1);
        for (var i = 0; i < toks.length; i++) {
          var t = decodeURIComponent(toks[i]).replace(/~1/g, '/').replace(/~0/g, '~');
          if (node === null || typeof node !== 'object' || !hasOwn(node, t)) throw new Error('packValidate: unresolvable $ref `' + ref + '`');
          node = node[t];
        }
      }
      return { schema: node, doc: d };
    }
    function re(p) { return regexCache[p] || (regexCache[p] = new RegExp(p)); }
    function err(path, keyword, message, extra) {
      var e = { path: path, keyword: keyword, message: message };
      if (extra) Object.keys(extra).forEach(function (k) { e[k] = extra[k]; });
      return e;
    }
    function ok(schema, inst, doc, path) { var o = []; walk(schema, inst, doc, path, o); return o.length === 0; }

    function walk(schema, inst, doc, path, out) {
      if (schema === true) return;
      if (schema === false) { out.push(err(path, 'false', 'no value is allowed here')); return; }
      var t = jtype(inst);
      if (hasOwn(schema, '$ref')) { var r = deref(schema.$ref, doc); walk(r.schema, inst, r.doc, path, out); }
      if (hasOwn(schema, 'type')) {
        var ts = Array.isArray(schema.type) ? schema.type : [schema.type];
        if (!ts.some(function (x) { return isType(inst, x); })) out.push(err(path, 'type', show(inst) + ' is not of type ' + ts.join(' | ')));
      }
      if (hasOwn(schema, 'enum') && !schema.enum.some(function (x) { return deepEqual(x, inst); })) {
        out.push(err(path, 'enum', show(inst) + ' is not one of ' + show(schema.enum)));
      }
      if (hasOwn(schema, 'const') && !deepEqual(schema.const, inst)) out.push(err(path, 'const', show(inst) + ' is not ' + show(schema.const)));
      if (t === 'object') {
        var props = isObj(schema.properties) ? schema.properties : null;
        if (props) Object.keys(props).forEach(function (k) { if (hasOwn(inst, k)) walk(props[k], inst[k], doc, path.concat(k), out); });
        if (Array.isArray(schema.required)) schema.required.forEach(function (k) {
          // R-AES-10: a removed book text (BOOK_CONTENT 'removed', a blanked path) is not a missing one
          if (!hasOwn(inst, k) && !(RB && removedAt(RB.concat(path, [k]), undefined))) out.push(err(path, 'required', '`' + k + '` is required', { missing: k }));
        });
        if (hasOwn(schema, 'additionalProperties')) {
          var extras = Object.keys(inst).filter(function (k) { return !props || !hasOwn(props, k); });
          if (schema.additionalProperties === false) {
            if (extras.length) out.push(err(path, 'additionalProperties', 'unknown field(s) ' + extras.join(', '), { extras: extras }));
          } else if (extras.length) {
            extras.forEach(function (k) { walk(schema.additionalProperties, inst[k], doc, path.concat(k), out); });
          }
        }
        if (hasOwn(schema, 'propertyNames')) Object.keys(inst).forEach(function (k) { walk(schema.propertyNames, k, doc, path.concat(k), out); });
        if (hasOwn(schema, 'minProperties') && Object.keys(inst).length < schema.minProperties) {
          out.push(err(path, 'minProperties', 'has fewer than ' + schema.minProperties + ' properties'));
        }
      }
      if (t === 'array') {
        if (hasOwn(schema, 'items')) for (var i = 0; i < inst.length; i++) walk(schema.items, inst[i], doc, path.concat(i), out);
        if (hasOwn(schema, 'minItems') && inst.length < schema.minItems) out.push(err(path, 'minItems', 'has fewer than ' + schema.minItems + ' items'));
        if (hasOwn(schema, 'maxItems') && inst.length > schema.maxItems) out.push(err(path, 'maxItems', 'has more than ' + schema.maxItems + ' items'));
        if (schema.uniqueItems === true && inst.some(function (x, xi) { return inst.some(function (y, yi) { return yi > xi && deepEqual(x, y); }); })) {
          out.push(err(path, 'uniqueItems', show(inst) + ' has non-unique elements'));   // F-100 M8 C11 (R-M8K-26's range_band)
        }
      }
      // R-AES-10: an empty string at a blanked path under BOOK_CONTENT 'removed' passes minLength and pattern
      var removed = t === 'string' && inst === '' && !!RB && removedAt(RB.concat(path), inst);
      if (t === 'string') {
        if (hasOwn(schema, 'minLength') && !removed && codePoints(inst) < schema.minLength) out.push(err(path, 'minLength', show(inst) + ' is shorter than ' + schema.minLength));
        if (hasOwn(schema, 'maxLength') && codePoints(inst) > schema.maxLength) out.push(err(path, 'maxLength', show(inst) + ' is longer than ' + schema.maxLength));
        if (hasOwn(schema, 'pattern') && !removed && !re(schema.pattern).test(inst)) out.push(err(path, 'pattern', show(inst) + ' does not match ' + schema.pattern));
      }
      if (t === 'number') {
        if (hasOwn(schema, 'minimum') && inst < schema.minimum) out.push(err(path, 'minimum', inst + ' is less than ' + schema.minimum));
        if (hasOwn(schema, 'maximum') && inst > schema.maximum) out.push(err(path, 'maximum', inst + ' is more than ' + schema.maximum));
        if (hasOwn(schema, 'exclusiveMinimum') && inst <= schema.exclusiveMinimum) out.push(err(path, 'exclusiveMinimum', inst + ' is not more than ' + schema.exclusiveMinimum));
      }
      if (Array.isArray(schema.allOf)) schema.allOf.forEach(function (s) { walk(s, inst, doc, path, out); });
      if (Array.isArray(schema.anyOf) && !schema.anyOf.some(function (s) { return ok(s, inst, doc, path); })) {
        out.push(err(path, 'anyOf', show(inst) + ' matches none of the allowed shapes'));
      }
      if (Array.isArray(schema.oneOf)) {
        var n = schema.oneOf.filter(function (s) { return ok(s, inst, doc, path); }).length;
        if (n !== 1) out.push(err(path, 'oneOf', show(inst) + (n ? ' matches more than one allowed shape' : ' matches none of the allowed shapes')));
      }
      if (hasOwn(schema, 'not') && ok(schema.not, inst, doc, path)) out.push(err(path, 'not', show(inst) + ' is a shape that is not allowed here'));
      if (hasOwn(schema, 'if')) {
        if (ok(schema['if'], inst, doc, path)) { if (hasOwn(schema, 'then')) walk(schema.then, inst, doc, path, out); }
        else if (hasOwn(schema, 'else')) walk(schema['else'], inst, doc, path, out);
      }
    }

    // base: [section, record] when `inst` is one registry record, so R-AES-10's predicate can name the path
    // (the error paths stay record-relative, as before); absent for an envelope, which the predicate never covers
    var RB = null;
    function validate(file, inst, base) {
      var d = docs[basename(file)];
      if (!d) throw new Error('packValidate: no schema `' + file + '` loaded');
      var out = [], prev = RB;
      RB = Array.isArray(base) ? base : null;
      try { walk(d, inst, d, [], out); } finally { RB = prev; }
      return out;
    }
    return { validate: validate, doc: function (f) { return docs[basename(f)]; } };
  }

  // ── the rail ──────────────────────────────────────────────────────────────────────────────────
  function create(schemas) {
    SCHEMA_FILES.forEach(function (f) { if (!schemas || !schemas[f]) throw new Error('packValidate.create: schema `' + f + '` missing'); });
    var I = Interpreter(schemas);

    // The entry vocabularies, READ FROM THE SCHEMAS (never hand-typed): what "unknown" means for §3.
    var eff = I.doc('charbuild-common.schema.json').$defs.effect.properties;
    var pm = I.doc('item-common.schema.json').$defs.pool_mod_entry.properties;
    var anchorArm = (pm.applies_to.oneOf || []).filter(function (s) { return s.type === 'array'; })[0];
    if (!eff || !eff.op.enum || !eff.when.enum || !eff.target.enum || !pm.die.enum || !pm.direction.enum || !anchorArm) {
      throw new Error('packValidate: the effect / pool_mod_entry vocabularies moved — re-point the rail at the schema');
    }
    var SCOPES = [];
    anchorArm.items.oneOf.forEach(function (b) {
      var s = b.properties.scope;
      if (s.enum) SCOPES = SCOPES.concat(s.enum); else if (hasOwn(s, 'const')) SCOPES.push(s.const);
    });
    var VOCAB = {
      effect: [['op', eff.op.enum, 'is not an effect this app can apply', 'charbuild-common $defs/effect: ' + eff.op.enum.length + ' ops'],
               ['when', eff.when.enum, 'is not a condition this app can evaluate', 'charbuild-common $defs/effect: ' + eff.when.enum.length + ' whens'],
               ['target', eff.target.enum, 'is not a target this app knows', 'charbuild-common $defs/effect: ' + eff.target.enum.length + ' targets']],
      pool: [['die', pm.die.enum, 'is not a die this app can roll', 'item-common pool_mod_entry: ' + pm.die.enum.length + ' dice'],
             ['direction', pm.direction.enum, 'is not a direction this app knows', 'item-common pool_mod_entry: ' + pm.direction.enum.length + ' directions']],
    };
    var ENVELOPE_KEYS = Object.keys(I.doc(ENVELOPE_SCHEMA).properties);
    var ENVELOPE_SECTIONS = Object.keys(I.doc(ENVELOPE_SCHEMA).properties.sections.properties);

    // One entry's first unknown value, or null. Only a non-null value outside the enum is "unknown"
    // (a value from a newer app); a null or a wrong type is an ordinary record failure (brief §3 table).
    function entryUnknown(kind, entry) {
      if (!isObj(entry)) return null;
      var rows = VOCAB[kind];
      for (var i = 0; i < rows.length; i++) {
        var f = rows[i][0];
        if (hasOwn(entry, f) && entry[f] !== null && typeof entry[f] === 'string' && rows[i][1].indexOf(entry[f]) === -1) {
          return { field: f, value: entry[f], what: rows[i][2], why: rows[i][3] };
        }
      }
      if (kind === 'pool' && Array.isArray(entry.applies_to)) {
        for (var j = 0; j < entry.applies_to.length; j++) {
          var a = entry.applies_to[j];
          if (isObj(a) && typeof a.scope === 'string' && SCOPES.indexOf(a.scope) === -1) {
            return { field: 'applies_to[' + j + '].scope', value: a.scope, what: 'is not an anchor scope this app knows',
                     why: 'item-common pool_mod_entry: ' + SCOPES.length + ' scopes' };
          }
        }
      }
      return null;
    }
    // Every entry array the §3 row covers on one record: [arrayKey, kind]
    function entryArrays(section) {
      var out = [];
      if (section === 'talents') out.push(['effects', 'effect']);
      if (section === 'talents' || ITEM_SECTIONS[section]) out.push(['pool_mods', 'pool']);
      return out;
    }
    function body(rec) {
      var b = {};
      Object.keys(rec).forEach(function (k) { if (SET_ASIDE.indexOf(k) === -1) b[k] = rec[k]; });
      return b;
    }
    function startsWithPath(p, prefix) {
      if (p.length < prefix.length) return false;
      for (var i = 0; i < prefix.length; i++) if (p[i] !== prefix[i]) return false;
      return true;
    }

    // The L1cb.prk refusals (validate_registries.py layer1_talent_effects), on one record — and L1cb.spid's.
    function crossField(section, rec) {
      var out = [];
      // R-SPF-10 (`f100-surfacing-preflip-species-card` ADDENDUM 2): `unless` belongs to a SPECIES-ABILITY pool_mods or
      // roll_numbers row only (speciesRows checks it there); anywhere else in any record it is refused (L1cb.unless)
      unlessElsewhere(section, rec).forEach(function (c) { out.push(c); });
      // F-100 M8 (ruling f100-m8-contracts R-M8K-23): a specialization id never begins with `_`, so a specId cannot
      // collide with M8's per-talent pick key `talentChoices._talent` (R-M8K-6 (b)). Refused at authoring; at load the
      // record is kept, never applied.
      if (section === 'specializations' && typeof rec.id === 'string' && rec.id.charAt(0) === '_') {
        out.push({ path: ['id'], msg: 'specialization id ' + show(rec.id) + ' begins with \'_\' — reserved for the pick container (L1cb.spid)' });
      }
      if (section === 'talents') {
        var ranked = !!rec.ranked;
        (Array.isArray(rec.effects) ? rec.effects : []).forEach(function (e, i) {
          if (isObj(e) && e.per_rank === true && !ranked) out.push({ path: ['effects', i, 'per_rank'], msg: 'per_rank true on an UNRANKED talent\'s effect (L1cb.prk)' });
        });
        (Array.isArray(rec.pool_mods) ? rec.pool_mods : []).forEach(function (e, i) {
          if (isObj(e) && hasOwn(e, 'per_rank') && !ranked) out.push({ path: ['pool_mods', i, 'per_rank'], msg: 'per_rank on an UNRANKED talent\'s pool_mods entry (L1cb.prk)' });
        });
      } else if (ITEM_SECTIONS[section]) {
        (Array.isArray(rec.pool_mods) ? rec.pool_mods : []).forEach(function (e, i) {
          if (isObj(e) && hasOwn(e, 'per_rank')) out.push({ path: ['pool_mods', i, 'per_rank'], msg: 'per_rank on an item\'s pool_mods entry — items have no ranks (L1cb.prk)' });
        });
      } else if (section === 'species') {
        speciesRows(rec).forEach(function (c) { out.push(c); });
        // F-100 M10 B-1227 (f100-m10-editor-card R-M10E-6): two abilities of one name are refused on EVERY path — the editor's
        // save and an imported pack alike — in the words the editor shows (K4 (b)'s drawn string, DISCLOSED)
        var seenN = {};
        (Array.isArray(rec.special_abilities) ? rec.special_abilities : []).forEach(function (a, i) {
          var n = isObj(a) && typeof a.name === 'string' ? a.name.trim() : '', key = n.toLowerCase();
          if (!key) return;
          if (seenN[key] === 1) out.push({ path: ['special_abilities', i, 'name'], msg: 'Two abilities are called ' + n + '. Rename one. (B-1227)' });
          seenN[key] = (seenN[key] || 0) + 1;
        });
      } else if (section === 'force_powers') {
        forcePowerRows(rec).forEach(function (c) { out.push(c); });
        // R-M10E-3: the ONE tree check (powerTreeProblems, below), so an imported power whose tree cannot be bought is refused too
        powerTreeProblems(rec).forEach(function (t) {
          out.push({ path: t.col == null ? ['tree', t.row] : ['tree', t.row, 'cells', t.cell], msg: t.words + ' (tree check, R-M10E-3)' });
        });
      }
      if (section !== 'force_powers') fpMembersElsewhere(section, rec).forEach(function (c) { out.push(c); });
      if (section === 'signature_abilities') sigAbilityRows(rec).forEach(function (c) { out.push(c); });
      else sigMembersElsewhere(section, rec).forEach(function (c) { out.push(c); });
      return out;
    }

    // F-100 M12 — L1cb.sig's SIGNATURE-ABILITY ARM (validate_registries.py signature_ability_problems; ruling
    // f100-m12-build-card step 5 and ADDENDUM 5). Since R-M12B-101 (`#sigsection`) `signature_abilities` IS an applied pack
    // section (SECTION_SCHEMAS above, mods.js's SECTION_TABLE), so a pack record meets its schema here too; the span hash
    // stays the Python validator's. Here: tree cells name nodes of the record; use_cost/activation_base on the base (row 0) only,
    // activation_mods on an upgrade only; a mod's cite book one of `sources`, `floor` on a *_delta op only, a *_set op at
    // most once per (ability, op) counted per BOX; every pool_mods row an id unique within the node, a cite book from
    // `sources`, a `words` span (required) and a span `condition` inside the node's own description, SV1 this ability,
    // SV2's key `<ability>.<node>` a node of it. And the other way (sigMembersElsewhere): a talent, species, item or
    // Force-power row carrying SV1, SV2 or SV5 is refused — they are the signature rows' own.
    var SIG_DELTA_OPS = ['uses_per_session_delta', 'range_delta', 'duration_delta', 'strain_cost_delta', 'target_silhouette_delta'];
    var SIG_SET_OPS = ['destiny_cost_set', 'range_set'];
    // B-336 (ruling release-r7-bug-burndown ADDENDUM 62, (C)): a row's `cite.book` is ONE of its record's `sources` when
    // the two name the same BOOK, whatever form each holds — a vocabulary key, an alias or a display title. A wave converts
    // both to keys, but a player's own record may still hold a title on either side, and a string-equal check would refuse
    // it. Resolved through the shared index when it is up (SWRPGSources); without it (node, a cold load) the strings are
    // compared as they are, which is what every converted pair needs.
    function bookIdOf(s) {
      var S = root && root.SWRPGSources, c = S && S.current ? S.current() : null, ix = c && c.index;
      var id = ix && ix.aliasToId ? ix.aliasToId[s] : null;
      return id || s;
    }
    // B-336 (ADDENDUM 62 condition 1): a refusal NAMES the book by its title, never a raw key (the B-1544 class); with no
    // index up (node, a cold load) it names the stored string, as before.
    function bookShow(s) {
      var S = root && root.SWRPGSources, c = S && S.current ? S.current() : null, ix = c && c.index;
      return show(typeof s === 'string' && ix && S.sourceLabel ? S.sourceLabel(ix, s) : s);
    }
    function bookIn(book, srcs) {
      if (typeof book !== 'string' || !Array.isArray(srcs)) return false;
      if (srcs.indexOf(book) !== -1) return true;
      var k = bookIdOf(book);
      return srcs.some(function (x) { return typeof x === 'string' && bookIdOf(x) === k; });
    }
    function sigAbilityRows(rec) {
      var out = [], srcs = Array.isArray(rec.sources) ? rec.sources : [], nodes = isObj(rec.abilities) ? rec.abilities : {};
      var boxes = {}, base = null, sets = {};
      (Array.isArray(rec.tree) ? rec.tree : []).forEach(function (row, ri) {
        (isObj(row) && Array.isArray(row.cells) ? row.cells : []).forEach(function (c, ci) {
          if (!isObj(c)) return;
          if (ri === 0 && ci === 0) base = c.ability;
          if (!hasOwn(nodes, c.ability)) out.push({ path: ['tree', ri, 'cells', ci, 'ability'], msg: 'tree cell names ' + show(c.ability) + ', no node of the record (L1cb.sig)' });
          boxes[c.ability] = (boxes[c.ability] || 0) + 1;
        });
      });
      Object.keys(nodes).forEach(function (key) {
        var nd = nodes[key];
        if (!isObj(nd)) return;
        var at0 = ['abilities', key], len = typeof nd.description === 'string' ? nd.description.length : 0, seen = {};
        if (key !== base) {
          ['use_cost', 'activation_base'].forEach(function (f) { if (hasOwn(nd, f)) out.push({ path: at0.concat(f), msg: f + ' on an upgrade; the BASE node only (L1cb.sig)' }); });
        } else if (hasOwn(nd, 'activation_mods')) out.push({ path: at0.concat('activation_mods'), msg: 'activation_mods on the base; an UPGRADE node only (L1cb.sig)' });
        (Array.isArray(nd.activation_mods) ? nd.activation_mods : []).forEach(function (m, i) {
          if (!isObj(m)) return;
          var at = at0.concat(['activation_mods', i]);
          // ADDENDUM 35 R-M12B-119: `cite` is optional in the schema (a user's own change has no page); one present names a
          // source. The SHIPPED registry still requires it (validate_registries.signature_ability_problems).
          if (m.cite !== undefined && !(isObj(m.cite) && bookIn(m.cite.book, srcs))) out.push({ path: at.concat(['cite', 'book']), msg: 'cite book ' + bookShow(isObj(m.cite) ? m.cite.book : undefined) + ' is not one of the ability\'s sources (L1cb.sig)' });
          if (hasOwn(m, 'floor') && SIG_DELTA_OPS.indexOf(m.op) === -1) out.push({ path: at.concat('floor'), msg: 'floor on ' + show(m.op) + '; a *_delta op only (R-M12B-21, L1cb.sig)' });
          if (SIG_SET_OPS.indexOf(m.op) !== -1) sets[m.op] = (sets[m.op] || 0) + (boxes[key] || 0);
        });
        (Array.isArray(nd.pool_mods) ? nd.pool_mods : []).forEach(function (row, i) {
          if (!isObj(row)) return;
          var at = at0.concat(['pool_mods', i]);
          if (typeof row.id === 'string' && row.id) {
            if (seen[row.id]) out.push({ path: at.concat('id'), msg: 'row id ' + show(row.id) + ' repeats within the node (L1cb.sig)' });
            seen[row.id] = true;
          } else out.push({ path: at.concat('id'), msg: 'a signature row carries no id (L1cb.sig)' });
          if (isObj(row.cite) && !bookIn(row.cite.book, srcs)) out.push({ path: at.concat(['cite', 'book']), msg: 'cite book ' + bookShow(row.cite.book) + ' is not one of the ability\'s sources (L1cb.sig)' });
          if (!isObj(row.words)) out.push({ path: at.concat('words'), msg: 'a signature row carries no words span (L1cb.sig)' });
          ['words', 'condition'].forEach(function (k) {
            var sp = row[k];
            if (k === 'condition' && typeof sp === 'string') { out.push({ path: at.concat(k), msg: 'condition is a string; a signature row carries a span (L1cb.sig)' }); return; }
            if (isObj(sp) && !(sp.start >= 0 && sp.end > sp.start && sp.end <= len)) out.push({ path: at.concat(k), msg: 'span [' + sp.start + ',' + sp.end + ') is outside the node\'s description (' + len + ' chars) (L1cb.sig)' });
          });
          var cof = row.count_of;
          if (isObj(cof) && cof.of === 'sig_upgrades') {
            var k2 = String(cof.key || ''), dot = k2.indexOf('.');
            if (dot < 0 || k2.slice(0, dot) !== rec.id || !hasOwn(nodes, k2.slice(dot + 1))) out.push({ path: at.concat(['count_of', 'key']), msg: 'count_of key ' + show(k2) + ' names no node of ' + show(rec.id) + ' (SV2, L1cb.sig)' });
          }
          (Array.isArray(row.applies_to) ? row.applies_to : []).forEach(function (a, j) {
            if (isObj(a) && a.scope === 'signature_ability' && a.value !== rec.id) out.push({ path: at.concat(['applies_to', j, 'value']), msg: 'applies_to signature_ability ' + show(a.value) + ' is not this ability ' + show(rec.id) + ' (SV1, L1cb.sig)' });
          });
        });
      });
      Object.keys(sets).forEach(function (op) {
        if (sets[op] > 1) out.push({ path: ['abilities'], msg: op + ' on ' + sets[op] + ' boxes; at most one per (ability, op), counted per box (R-M12B-6, L1cb.sig)' });
      });
      return out;
    }
    function sigMembers(row) {
      var f = [];
      if (!isObj(row)) return f;
      if (isObj(row.count_of) && row.count_of.of === 'sig_upgrades') f.push('count_of sig_upgrades (SV2)');
      (Array.isArray(row.applies_to) ? row.applies_to : []).forEach(function (a) {
        if (isObj(a) && a.scope === 'signature_ability') f.push('applies_to signature_ability (SV1)');
        if (isObj(a) && a.scope === 'career_skills') f.push('applies_to career_skills (SV5)');
      });
      return f;
    }
    function sigMembersElsewhere(section, rec) {
      var out = [], push = function (at, row) { var f = sigMembers(row); if (f.length) out.push({ path: at, msg: 'carries ' + f.join(', ') + ' — signature rows only (L1cb.sig)' }); };
      var arrays = function (holder, at) {
        FP_ROW_ARRAYS.forEach(function (arr) { (Array.isArray(holder[arr]) ? holder[arr] : []).forEach(function (row, i) { push(at.concat([arr, i]), row); }); });
      };
      if (section === 'talents' || ITEM_SECTIONS[section]) arrays(rec, []);
      if (section === 'force_powers' && isObj(rec.abilities)) Object.keys(rec.abilities).forEach(function (k) { if (isObj(rec.abilities[k])) arrays(rec.abilities[k], ['abilities', k]); });
      if (section === 'species') {
        (Array.isArray(rec.special_abilities) ? rec.special_abilities : []).forEach(function (ab, i) { if (isObj(ab)) arrays(ab, ['special_abilities', i]); });
        (Array.isArray(rec.option_choices) ? rec.option_choices : []).forEach(function (oc, a) {
          (isObj(oc) && Array.isArray(oc.options) ? oc.options : []).forEach(function (o, b) {
            (isObj(o) && Array.isArray(o.special_abilities) ? o.special_abilities : []).forEach(function (ab, i) {
              if (isObj(ab)) arrays(ab, ['option_choices', a, 'options', b, 'special_abilities', i]);
            });
          });
        });
      }
      return out;
    }

    // F-100 M10 — L1cb.fp's FORCE-POWER ARM (validate_registries.py force_power_row_problems; ruling f100-m10-build-card
    // R-M10B-3): on every row of every upgrade, an id unique within the upgrade across its four arrays; a cite's book one of
    // the record's `sources`; a `words` span (required) and a span `condition` inside the upgrade's own description (the
    // hash is the Python validator's); V1's key `<power>.<ability>` names an upgrade of THIS power; an effect's cost
    // commit_force only (the schema's refusal too). V4's power id and V5's skill are the refs arm's (they need the folded
    // view and the vocabulary). The family enum and the per-op rules are the schema's (force-power.schema $defs).
    var FP_ROW_ARRAYS = ['pool_mods', 'roll_numbers', 'effects', 'told'];
    function forcePowerRows(rec) {
      var out = [], srcs = Array.isArray(rec.sources) ? rec.sources : null, abs = isObj(rec.abilities) ? rec.abilities : {};
      Object.keys(abs).forEach(function (key) {
        var ab = abs[key];
        if (!isObj(ab)) return;
        var len = typeof ab.description === 'string' ? ab.description.length : 0, seen = {};
        FP_ROW_ARRAYS.forEach(function (arr) {
          (Array.isArray(ab[arr]) ? ab[arr] : []).forEach(function (row, i) {
            if (!isObj(row)) return;
            var at = ['abilities', key, arr, i];
            if (typeof row.id === 'string' && row.id) {
              if (seen[row.id]) out.push({ path: at.concat('id'), msg: 'row id ' + show(row.id) + ' repeats within the upgrade (L1cb.fp)' });
              seen[row.id] = true;
            } else out.push({ path: at.concat('id'), msg: 'an upgrade row carries no id (L1cb.fp)' });
            var c = row.cite;
            if (isObj(c) && typeof c.book === 'string' && srcs && !bookIn(c.book, srcs)) {
              out.push({ path: at.concat(['cite', 'book']), msg: 'cite book ' + bookShow(c.book) + ' is not one of the power\'s sources (L1cb.fp)' });
            }
            if (!isObj(row.words)) out.push({ path: at.concat('words'), msg: 'an upgrade row carries no words span (L1cb.fp)' });
            ['words', 'condition'].forEach(function (k) {
              var sp = row[k];
              if (k === 'condition' && typeof sp === 'string') { out.push({ path: at.concat(k), msg: 'condition is a string; an upgrade row carries a span (L1cb.fp)' }); return; }
              if (isObj(sp) && !(sp.start >= 0 && sp.end > sp.start && sp.end <= len)) out.push({ path: at.concat(k), msg: 'span [' + sp.start + ',' + sp.end + ') is outside the upgrade\'s description (' + len + ' chars) (L1cb.fp)' });
            });
            var cof = row.count_of;
            if (isObj(cof) && cof.of === 'power_upgrades') {
              var k2 = String(cof.key || ''), dot = k2.indexOf('.');
              if (dot < 0 || k2.slice(0, dot) !== rec.id || !hasOwn(abs, k2.slice(dot + 1))) {
                out.push({ path: at.concat(['count_of', 'key']), msg: 'count_of key ' + show(k2) + ' names no upgrade of ' + show(rec.id) + ' (V1, L1cb.fp)' });
              }
            }
            // F-100 M11 (D-M11C1 (a)): replaces_step_of names a power_dial row of ANOTHER upgrade of THIS power, the same unit
            if (hasOwn(row, 'replaces_step_of')) {
              var rso = String(row.replaces_step_of || ''), rd = rso.indexOf('.'), sa = rd < 0 ? '' : rso.slice(0, rd), sr = rd < 0 ? '' : rso.slice(rd + 1);
              var sib = (sa && sa !== key && isObj(abs[sa]) && Array.isArray(abs[sa].roll_numbers) ? abs[sa].roll_numbers : [])
                .filter(function (r) { return isObj(r) && r.id === sr; })[0];
              if (!sib || sib.op !== 'power_dial') out.push({ path: at.concat('replaces_step_of'), msg: 'replaces_step_of ' + show(rso) + ' names no sibling power_dial row of ' + show(rec.id) + ' (D-M11C1)' });
              else if (sib.unit !== row.unit) out.push({ path: at.concat('replaces_step_of'), msg: 'replaces_step_of ' + show(rso) + ' is a ' + show(sib.unit) + ' dial; this row\'s unit is ' + show(row.unit) + ' (D-M11C1)' });
            }
            if (arr === 'effects' && isObj(row.cost) && (Object.keys(row.cost).length !== 1 || !hasOwn(row.cost, 'commit_force'))) {
              out.push({ path: at.concat('cost'), msg: 'an effect\'s cost is commit_force only (R-M10S-5, L1cb.fp)' });
            }
          });
        });
      });
      return out;
    }
    // The five words are the upgrades' own (L1cb.fp's other half): a talent, species-ability or item row carrying one is refused.
    function fpMembers(row) {
      var f = [];
      if (!isObj(row)) return f;
      if (isObj(row.count_of) && row.count_of.of === 'power_upgrades') f.push('count_of power_upgrades (V1)');
      if (Array.isArray(row.applies_to) && row.applies_to.some(function (a) { return isObj(a) && a.scope === 'force_power'; })) f.push('applies_to force_power (V4)');
      if (row.op === 'power_dial') f.push('power_dial (V2)');
      if (isObj(row.cost) && hasOwn(row.cost, 'force_points')) f.push('cost.force_points (V2)');
      if (row.op === 'skill_rank_delta') f.push('skill_rank_delta (V5)');
      if (row.op === 'characteristic_delta' && hasOwn(row, 'cost')) f.push('characteristic_delta behind a commit (V3)');
      return f;
    }
    function fpMembersElsewhere(section, rec) {
      var out = [], push = function (at, row) { var f = fpMembers(row); if (f.length) out.push({ path: at, msg: 'carries ' + f.join(', ') + ' — Force-power rows only (L1cb.fp)' }); };
      var arrays = function (holder, at) {
        FP_ROW_ARRAYS.forEach(function (arr) { (Array.isArray(holder[arr]) ? holder[arr] : []).forEach(function (row, i) { push(at.concat([arr, i]), row); }); });
      };
      if (section === 'talents' || ITEM_SECTIONS[section]) arrays(rec, []);
      if (section === 'species') {
        (Array.isArray(rec.special_abilities) ? rec.special_abilities : []).forEach(function (ab, i) { if (isObj(ab)) arrays(ab, ['special_abilities', i]); });
        (Array.isArray(rec.option_choices) ? rec.option_choices : []).forEach(function (oc, a) {
          (isObj(oc) && Array.isArray(oc.options) ? oc.options : []).forEach(function (o, b) {
            (isObj(o) && Array.isArray(o.special_abilities) ? o.special_abilities : []).forEach(function (ab, i) {
              if (isObj(ab)) arrays(ab, ['option_choices', a, 'options', b, 'special_abilities', i]);
            });
          });
        });
      }
      return out;
    }

    // F-100 M9 — L1cb.prv's SPECIES ARM (validate_registries.py, ruling f100-m9-shapes-card R-M9S-2/4): on every row of every
    // ability (top level and each option's), an id unique within the ability across its four arrays; a printed cite's book
    // one of the record's `sources` (a pack record without `sources` cites `cite_unprinted`, which the schema decides); a
    // `words` span (required) and a span `condition` inside the ability's own description (the hash is the Python
    // validator's — a pack is re-checked there on export); at most ONE crit_rating_set reaching one attack. The members a
    // species row refuses (per_rank, count_of, floor, pick) are the schema's (species.schema $defs/ability_row_refusals).
    var SPECIES_ROW_ARRAYS = ['pool_mods', 'roll_numbers', 'effects', 'told'];
    var UNLESS_ARRAYS = { pool_mods: true, roll_numbers: true };
    function unlessElsewhere(section, rec) {
      var out = [];
      function walk(node, path, rowOk) {
        if (Array.isArray(node)) { node.forEach(function (v, i) { walk(v, path.concat(i), false); }); return; }
        if (!isObj(node)) return;
        if (hasOwn(node, 'unless') && !rowOk) out.push({ path: path.concat('unless'), msg: 'unless belongs to a species ability\'s pool_mods or roll_numbers row only (L1cb.unless, R-SPF-10)' });
        Object.keys(node).forEach(function (k) {
          var v = node[k];
          if (section === 'species' && k === 'special_abilities' && Array.isArray(v)) {
            v.forEach(function (a, i) {
              if (!isObj(a)) return;
              Object.keys(a).forEach(function (ak) {
                var at = path.concat([k, i, ak]);
                if (UNLESS_ARRAYS[ak] && Array.isArray(a[ak])) a[ak].forEach(function (r, j) { walk(r, at.concat(j), true); });
                else walk(a[ak], at, false);
              });
            });
          } else if (k !== 'unless' || !rowOk) walk(v, path.concat(k), false);
        });
      }
      walk(rec, [], false);
      return out;
    }
    function speciesRows(rec) {
      var out = [], srcs = Array.isArray(rec.sources) ? rec.sources : null;
      var holders = [[['special_abilities'], rec.special_abilities]];
      (Array.isArray(rec.option_choices) ? rec.option_choices : []).forEach(function (oc, a) {
        (isObj(oc) && Array.isArray(oc.options) ? oc.options : []).forEach(function (o, b) {
          holders.push([['option_choices', a, 'options', b, 'special_abilities'], isObj(o) ? o.special_abilities : null]);
        });
      });
      var setsTop = 0, setsOpt = 0;
      var sibs = {};   // R-SPF-1: every ability of the record by its (whitespace-normal) name, top level and each option's
      holders.forEach(function (hd) { (Array.isArray(hd[1]) ? hd[1] : []).forEach(function (ab) {
        if (isObj(ab) && typeof ab.name === 'string') { var nm = ab.name.replace(/\s+/g, ' ').trim(); if (!hasOwn(sibs, nm)) sibs[nm] = ab; }
      }); });
      holders.forEach(function (hd, hi) {
        var sets = 0;
        (Array.isArray(hd[1]) ? hd[1] : []).forEach(function (ab, ai) {
          if (!isObj(ab)) return;
          var len = typeof ab.description === 'string' ? ab.description.length : 0, seen = {};
          SPECIES_ROW_ARRAYS.forEach(function (arr) {
            (Array.isArray(ab[arr]) ? ab[arr] : []).forEach(function (row, i) {
              if (!isObj(row)) return;
              var at = hd[0].concat([ai, arr, i]);
              if (typeof row.id === 'string' && row.id) {
                if (seen[row.id]) out.push({ path: at.concat('id'), msg: 'row id ' + show(row.id) + ' repeats within the ability (L1cb.prv species)' });
                seen[row.id] = true;
              } else out.push({ path: at.concat('id'), msg: 'a species-ability row carries no id (L1cb.prv species)' });
              var c = row.cite;
              if (isObj(c) && typeof c.book === 'string' && srcs && !bookIn(c.book, srcs)) {
                out.push({ path: at.concat(['cite', 'book']), msg: 'cite book ' + bookShow(c.book) + ' is not one of the species\' sources (L1cb.prv species)' });
              }
              if (!isObj(row.words)) out.push({ path: at.concat('words'), msg: 'a species-ability row carries no words span (L1cb.prv species)' });
              ['words', 'condition'].forEach(function (k) {
                var sp = row[k];
                if (k === 'condition' && typeof sp === 'string') { out.push({ path: at.concat(k), msg: 'condition is a string; a species row carries a span (L1cb.prv species)' }); return; }
                // a REMOVED text (public copy, R-AAC-27 (a)) has no length to bound a span by: the span gate below decides
                var removed = !len && TH() && typeof TH().bookContent === 'function' && TH().bookContent() === 'removed';
                if (isObj(sp) && !removed && !(sp.start >= 0 && sp.end > sp.start && sp.end <= len)) out.push({ path: at.concat(k), msg: 'span [' + sp.start + ',' + sp.end + ') is outside the ability\'s description (' + len + ' chars) (L1cb.prv species)' });
                // R-SPF-4: in bounds, the span's hash must recompute over the ability's OWN words, or the row was read from
                // words that are no longer there (an edited description) and is refused, never applied
                // (`stale: true`: an AUTHORED pack is refused; a LOADED record keeps, the row held by the reader, so a homebrew
                // copy edited while the key is OFF is never dropped from its owner's shelf — R-SPF-6's zero)
                else if (isObj(sp) && TH() && !TH().spanHolds(ab.description, sp)) out.push({ stale: true, path: at.concat(k), msg: 'the ' + (k === 'words' ? 'words' : 'condition') + ' this row was read from are no longer in the ability\'s description — mark them again (L1cb.prv species, R-SPF-4)' });
              });
              // R-SPF-1: an `unless` names a SIBLING of this record and its span recomputes over the sibling's words
              if (hasOwn(row, 'unless') && UNLESS_ARRAYS[arr]) {
                var u = row.unless, un = isObj(u) && typeof u.ability === 'string' ? u.ability.replace(/\s+/g, ' ').trim() : null;
                var sib = un != null && hasOwn(sibs, un) ? sibs[un] : null;
                if (un == null || !isObj(u.words)) out.push({ path: at.concat('unless'), msg: 'unless is { ability, words } (L1cb.unless species)' });
                else if (!sib) out.push({ path: at.concat(['unless', 'ability']), msg: show(un) + ' is not an ability of this species (L1cb.unless species)' });
                else if (sib === ab) out.push({ path: at.concat(['unless', 'ability']), msg: 'unless names the row\'s own ability; a sibling negates a row (L1cb.unless species)' });
                else if (TH() && !TH().spanHolds(sib.description, u.words)) out.push({ stale: true, path: at.concat(['unless', 'words']), msg: 'the words of ' + show(un) + ' this row\'s unless was read from are no longer in its description — mark them again (L1cb.unless species, R-SPF-4)' });
              }
              if (arr === 'roll_numbers' && row.op === 'crit_rating_set') sets += 1;
            });
          });
        });
        if (hi === 0) setsTop = sets; else if (sets > setsOpt) setsOpt = sets;
      });
      if (setsTop + setsOpt > 1) out.push({ path: ['special_abilities'], msg: (setsTop + setsOpt) + ' crit_rating_set rows can reach one attack — one SET per attack (L1cb.prv species, R-M9S-4)' });
      return out;
    }

    // The refs arm (L1.1 / L1cb.1 joins). `has(section, id)` answers base ∪ this pack ∪ active packs.
    function refs(section, rec, has, vocab) {
      var out = [];
      var skill = function (v, p) { if (typeof v === 'string' && vocab.skills.indexOf(v) === -1) out.push({ path: p, msg: 'skill ' + show(v) + ' is not in the skills vocabulary' }); };
      var arr = function (v) { return Array.isArray(v) ? v : []; };
      if (section === 'specializations') {
        arr(rec.talent_tree).forEach(function (row, r) {
          arr(row && row.talents).forEach(function (c, i) {
            if (c && typeof c.talent === 'string' && !has('talents', c.talent)) out.push({ path: ['talent_tree', r, 'talents', i, 'talent'], msg: 'talent ' + show(c.talent) + ' does not exist' });
          });
        });
      }
      if (section === 'careers') {
        arr(rec.specializations).forEach(function (s, i) { if (typeof s === 'string' && !has('specializations', s)) out.push({ path: ['specializations', i], msg: 'specialization ' + show(s) + ' does not exist' }); });
      }
      if (section === 'careers' || section === 'specializations') {
        arr(rec.career_skills).forEach(function (s, i) { skill(s, ['career_skills', i]); });
        if (section === 'specializations') arr(rec.addl_career_skills).forEach(function (s, i) { skill(s, ['addl_career_skills', i]); });
      }
      if (section === 'species') {
        arr(rec.starting_talents).forEach(function (t, i) { if (t && typeof t.talent === 'string' && !has('talents', t.talent)) out.push({ path: ['starting_talents', i, 'talent'], msg: 'talent ' + show(t.talent) + ' does not exist' }); });
        arr(rec.starting_skills).forEach(function (g, i) { if (g) skill(g.skill, ['starting_skills', i, 'skill']); });
        arr(rec.option_choices).forEach(function (oc, a) {
          arr(oc && oc.options).forEach(function (o, b) {
            arr(o && o.skill_grants).forEach(function (g, c) { if (g) skill(g.skill, ['option_choices', a, 'options', b, 'skill_grants', c, 'skill']); });
          });
        });
      }
      if (section === 'force_powers') {
        var ab = isObj(rec.abilities) ? rec.abilities : {};
        arr(rec.tree).forEach(function (row, r) {
          arr(row && row.cells).forEach(function (c, i) {
            if (c && typeof c.ability === 'string' && !hasOwn(ab, c.ability)) out.push({ path: ['tree', r, 'cells', i, 'ability'], msg: 'ability ' + show(c.ability) + ' is not in this power\'s abilities' });
          });
        });
        // F-100 M10 (L1cb.fp, R-M10S-3/6): V4's power id resolves in the folded view (base ∪ this pack ∪ active packs —
        // this record's own id included); V5's skill is a vocabulary id; an anchor's skill is one too.
        Object.keys(ab).forEach(function (key) {
          ['pool_mods', 'roll_numbers', 'effects', 'told'].forEach(function (a2) {
            arr(ab[key] && ab[key][a2]).forEach(function (row, i) {
              var at = ['abilities', key, a2, i];
              arr(row && row.applies_to).forEach(function (x, j) {
                if (x && x.scope === 'force_power' && typeof x.value === 'string' && x.value !== rec.id && !has('force_powers', x.value)) {
                  out.push({ path: at.concat(['applies_to', j, 'value']), msg: 'force power ' + show(x.value) + ' does not exist (V4, L1cb.fp)' });
                }
                if (x && x.scope === 'skill') skill(x.value, at.concat(['applies_to', j, 'value']));
              });
              if (row && row.op === 'skill_rank_delta') skill(row.skill, at.concat('skill'));
            });
          });
        });
      }
      if (section === 'weapons') {
        skill(rec.skill, ['skill']);
        arr(rec.qualities).forEach(function (q, i) { if (q && typeof q.id === 'string' && vocab.qualities.indexOf(q.id) === -1) out.push({ path: ['qualities', i, 'id'], msg: 'quality ' + show(q.id) + ' is not in the qualities vocabulary' }); });
        // weapons.range is a schema enum (weapon.schema.json) — arm 2 decides it, never this arm.
      }
      if (section === 'talents' || ITEM_SECTIONS[section]) {
        arr(rec.pool_mods).forEach(function (pmE, i) {
          arr(pmE && pmE.applies_to).forEach(function (a, j) { if (a && a.scope === 'skill') skill(a.value, ['pool_mods', i, 'applies_to', j, 'value']); });
        });
      }
      return out;
    }

    function requireCtx(ctx, who) {
      if (!ctx || !isObj(ctx.base) || !ctx.vocab || !Array.isArray(ctx.vocab.skills) || !Array.isArray(ctx.vocab.qualities)) {
        throw new TypeError('packValidate.' + who + ': ctx needs { base: <pristine sections>, vocab: { skills: [ids], qualities: [ids] } }');
      }
    }
    function makeHas(ctx, pack) {
      var layers = [ctx.base, (pack && isObj(pack.sections)) ? pack.sections : {}].concat(Array.isArray(ctx.also) ? ctx.also : []);
      return function (section, id) {
        for (var i = 0; i < layers.length; i++) if (isObj(layers[i]) && isObj(layers[i][section]) && hasOwn(layers[i][section], id)) return true;
        return false;
      };
    }
    function isCanonical(ctx, section, id) { return isObj(ctx.base[section]) && hasOwn(ctx.base[section], id); }
    function deriveMode(ctx, section, id, rec) {
      if (hasOwn(rec, '_mode')) return rec._mode;
      return isCanonical(ctx, section, id) ? 'redefine' : 'add';
    }

    // The envelope's KNOWN view: unknown envelope keys and unknown sections left out (never mutates).
    function knownEnvelope(pack) {
      var view = {}, ignoredKeys = [], ignoredSections = [];
      Object.keys(pack).forEach(function (k) {
        if (ENVELOPE_KEYS.indexOf(k) === -1) { ignoredKeys.push(k); return; }
        if (k === 'sections' && isObj(pack.sections)) {
          var s = {};
          Object.keys(pack.sections).forEach(function (sec) {
            if (ENVELOPE_SECTIONS.indexOf(sec) === -1) ignoredSections.push(sec); else s[sec] = pack.sections[sec];
          });
          view.sections = s;
        } else view[k] = pack[k];
      });
      return { view: view, ignoredKeys: ignoredKeys, ignoredSections: ignoredSections };
    }

    // One record through arms 2-4. mode 'author' → refusals; 'load' → the partition verdict.
    function recordPass(mode, ctx, pack, section, id, rec, has) {
      var at = function (p) { return section + '.' + id + (p && p.length ? '.' + pathStr(p) : ''); };
      var fatal = [], unapplied = [], warnings = [], authorReasons = [];
      var working = clone(body(rec));
      // `_from` is the own layer's alone (f100-m13-layer R-M13L-16): any other pack carrying it reads as the unknown field it always was.
      if (hasOwn(rec, '_from') && !(isObj(pack) && pack.packId === 'own_layer')) working._from = clone(rec._from);
      (GENERATOR_ONLY[section] || []).forEach(function (f) {
        if (!hasOwn(working, f)) return;
        if (mode === 'author') authorReasons.push(at([f]) + ': stamped by the reSpecialized emitter, never authored — refused');
        else unapplied.push({ path: f, entry: working[f], reason: 'generator-only:' + f });
        delete working[f];
      });
      var packId = pack.packId;
      var derived = deriveMode(ctx, section, id, rec);

      // arm 3 — `_mode` vs namespace, key == id. A DERIVE is a new record and takes an add's id rules
      // (f100-editor-contracts-2 R-EC2-2); its link to the book lives in `_base.id`, never in its key.
      var isNew = derived === 'add' || derived === 'derive';
      if (isNew && isCanonical(ctx, section, id)) {
        fatal.push(at([]) + ': add-collides-with-base — an add may not take a canonical id (D-PS3)');
      }
      if (isNew && !isCanonical(ctx, section, id) && typeof packId === 'string' && id.indexOf('custom_' + packId + '_') !== 0) {
        if (mode === 'author') authorReasons.push(at([]) + ': add-id-not-namespaced — a new record\'s id must be custom_' + packId + '_<slug> — refused');
      }
      if (working.id !== id) fatal.push(at(['id']) + ': id ' + show(working.id) + ' does not equal its key');

      // §3 row 1 — the entry quarantine (op / when / target; die / direction / scope)
      var quarantined = [];
      entryArrays(section).forEach(function (pair) {
        var key = pair[0], kind = pair[1];
        if (!Array.isArray(working[key])) return;
        var keep = [];
        working[key].forEach(function (entry, i) {
          var u = entryUnknown(kind, entry);
          if (!u) { keep.push(entry); return; }
          var p = [key, i];
          quarantined.push(p);
          if (mode === 'author') authorReasons.push(at(p) + '.' + u.field + ': ' + show(u.value) + ' ' + u.what + ' (' + u.why + ') — refused');
          else unapplied.push({ path: pathStr(p), entry: entry, reason: 'unknown-' + (u.field.indexOf('.') >= 0 ? 'scope' : u.field) + ':' + u.value });
        });
        if (mode === 'load') working[key] = keep;
      });

      // arm 2 — record shape (in author mode, errors under a quarantined entry are already named)
      var file = SECTION_SCHEMAS[section];
      var errs = I.validate(file, working, [section, '*']);
      if (mode === 'author') {
        errs.forEach(function (e) {
          if (quarantined.some(function (q) { return startsWithPath(e.path, q); })) return;
          if (e.keyword === 'additionalProperties') e.extras.forEach(function (x) { authorReasons.push(at(e.path.concat(x)) + ': not a field this app knows — refused'); });
          else authorReasons.push(at(e.path) + ': ' + e.message + ' — refused');
        });
      } else {
        // prune unknown fields (additionalProperties), re-validate until none remain
        for (var guard = 0; guard < 16; guard++) {
          var extra = errs.filter(function (e) { return e.keyword === 'additionalProperties'; });
          if (!extra.length) break;
          extra.forEach(function (e) {
            var host = working;
            for (var i = 0; i < e.path.length; i++) host = host[e.path[i]];
            e.extras.forEach(function (x) {
              var p = e.path.concat(x);
              unapplied.push({ path: pathStr(p), entry: host[x], reason: 'unknown-field:' + pathStr(p) });
              delete host[x];
            });
          });
          errs = I.validate(file, working, [section, '*']);
        }
        errs.forEach(function (e) { fatal.push(at(e.path) + ': ' + e.message); });
      }

      // arm 3 — the per_rank refusals
      crossField(section, working).forEach(function (c) {
        if (mode === 'author') authorReasons.push(at(c.path) + ': ' + c.msg + ' — refused');
        else if (c.stale) warnings.push({ section: section, id: id, path: pathStr(c.path), reason: 'stale-words: ' + c.msg });
        else fatal.push(at(c.path) + ': ' + c.msg);
      });
      // arm 4 — refs
      refs(section, working, has, ctx.vocab).forEach(function (r) {
        if (mode === 'author') authorReasons.push(at(r.path) + ': ' + r.msg + ' — refused');
        else warnings.push({ section: section, id: id, path: pathStr(r.path), reason: 'dangling-ref: ' + r.msg });
      });

      if (mode === 'author') {
        return { reasons: fatal.map(function (f) { return f + ' — refused'; }).concat(authorReasons) };
      }
      if (fatal.length) return { kept: fatal, warnings: warnings };
      working._mode = derived;
      if (hasOwn(rec, '_base')) working._base = clone(rec._base);
      if (unapplied.length) working._unapplied = unapplied;
      return { applied: working, unapplied: unapplied, warnings: warnings };
    }

    // ── AUTHORING / SHARE EXPORT: refuse anything outside the known part ──
    function authoring(pack, ctx) {
      requireCtx(ctx, 'authoring');
      var reasons = [];
      if (!isObj(pack)) return { ok: false, reasons: ['<pack>: not an object — refused'] };
      var k = knownEnvelope(pack);
      k.ignoredKeys.forEach(function (x) { reasons.push('<envelope>.' + x + ': not an envelope field this app knows — refused'); });
      k.ignoredSections.forEach(function (x) { reasons.push('sections.' + x + ': not a section this app can write — refused'); });
      I.validate(ENVELOPE_SCHEMA, k.view).forEach(function (e) {
        reasons.push('<envelope>' + (e.path.length ? '.' + pathStr(e.path) : '') + ': ' + e.message + ' — refused');
      });
      var sections = isObj(pack.sections) ? pack.sections : {};
      PRESERVED_SECTIONS.forEach(function (sec) {
        if (isObj(sections[sec]) && Object.keys(sections[sec]).length) reasons.push('sections.' + sec + ': not a section this app writes in v1 (preserved, never applied) — refused');
      });
      var has = makeHas(ctx, pack);
      APPLIED_SECTIONS.forEach(function (sec) {
        if (!isObj(sections[sec])) return;
        Object.keys(sections[sec]).forEach(function (id) {
          var rec = sections[sec][id];
          if (!isObj(rec)) return;                                   // the envelope arm named it
          if (hasOwn(rec, '_changes')) { reasons.push(sec + '.' + id + ': a share-projection record is not an authored record — refused'); return; }
          reasons = reasons.concat(recordPass('author', ctx, pack, sec, id, rec, has).reasons);
        });
      });
      return { ok: reasons.length === 0, reasons: reasons };
    }

    // ── LOAD: partition; store everything, apply the known part ──
    function load(pack, ctx) {
      requireCtx(ctx, 'load');
      var res = { status: 'ok', packId: isObj(pack) ? pack.packId : undefined, stored: pack, applied: {},
                  kept: [], unapplied: [], warnings: [], ignoredKeys: [], ignoredSections: [],
                  preservedSections: [], reasons: [] };
      if (!isObj(pack)) { res.status = 'rejected'; res.reasons.push('<pack>: not an object'); return res; }
      if (typeof pack.formatVersion === 'number' && pack.formatVersion > 1) { res.status = 'newer-format'; return res; }
      var k = knownEnvelope(pack);
      res.ignoredKeys = k.ignoredKeys; res.ignoredSections = k.ignoredSections;
      var byRecord = {};                                          // "sec\u0000id" → envelope errors on that record
      I.validate(ENVELOPE_SCHEMA, k.view).forEach(function (e) {
        if (e.path[0] === 'sections' && e.path.length >= 3) {
          var key = e.path[1] + '\u0000' + e.path[2];
          (byRecord[key] = byRecord[key] || []).push(e.path[1] + '.' + e.path[2] + (e.path.length > 3 ? '.' + pathStr(e.path.slice(3)) : '') + ': ' + e.message);
        } else res.reasons.push('<envelope>' + (e.path.length ? '.' + pathStr(e.path) : '') + ': ' + e.message);
      });
      if (res.reasons.length) { res.status = 'rejected'; return res; }
      var sections = pack.sections;
      PRESERVED_SECTIONS.forEach(function (sec) { if (hasOwn(sections, sec)) res.preservedSections.push(sec); });
      var has = makeHas(ctx, pack);
      APPLIED_SECTIONS.forEach(function (sec) {
        if (!isObj(sections[sec])) return;
        Object.keys(sections[sec]).forEach(function (id) {
          var rec = sections[sec][id];
          var envErrs = byRecord[sec + '\u0000' + id];
          if (envErrs) { res.kept.push({ section: sec, id: id, reasons: envErrs }); return; }
          if (hasOwn(rec, '_changes')) {
            var rebuilt;
            try { rebuilt = typeof ctx.rebuild === 'function' ? ctx.rebuild(sec, id, rec) : undefined; }
            catch (e) { res.kept.push({ section: sec, id: id, reasons: [sec + '.' + id + ': share-rebuild-failed — ' + (e && e.message ? e.message : String(e))] }); return; }
            if (rebuilt === undefined) { res.kept.push({ section: sec, id: id, reasons: [sec + '.' + id + ': share-not-rebuilt — no rebuild hook supplied'] }); return; }
            if (rebuilt === null) { res.kept.push({ section: sec, id: id, reasons: [sec + '.' + id + ': base-missing — the book record this change applies to is not in this version'] }); return; }
            rec = rebuilt;
          }
          var r = recordPass('load', ctx, pack, sec, id, rec, has);
          res.warnings = res.warnings.concat(r.warnings || []);
          if (r.kept) { res.kept.push({ section: sec, id: id, reasons: r.kept }); return; }
          (res.applied[sec] = res.applied[sec] || {})[id] = r.applied;
          r.unapplied.forEach(function (u) { res.unapplied.push({ section: sec, id: id, path: u.path, entry: u.entry, reason: u.reason }); });
        });
      });
      return res;
    }

    return {
      validate: I.validate,
      validateEnvelope: function (pack) { return I.validate(ENVELOPE_SCHEMA, pack); },
      validateRecord: function (section, rec) {
        if (!SECTION_SCHEMAS[section]) throw new Error('packValidate.validateRecord: no entity schema for `' + section + '`');
        return I.validate(SECTION_SCHEMAS[section], body(rec), [section, '*']);
      },
      authoring: authoring,
      load: load,
      crossField: crossField,   // F-100 M9: the cross-field refusals on one record (test/f100_m9_species_rows.cjs mirrors them against the validator)
      refs: refs,   // F-100 M10: the refs arm on one record — (section, rec, has(section, id), vocab) → [{path, msg}] (test/f100_m10_force_rows.cjs bites V4/V5 on it)
    };
  }

  // ── F-100 M10 — THE ONE POWER-TREE CHECK (ruling f100-m10-editor-card R-M10E-3; frame F4 "a tree that will not save") ──
  // A Force power's tree that cannot be bought is refused with the three reasons F4 draws, by THIS function, at the editor's
  // save (lib/editor/view.jsx powerCheck) AND in this rail's force-power arm (crossField), so an imported pack with a broken
  // tree is refused too (authoring) or kept, never applied (load). A box is named `Box <row>-<column>`, both counted from 1.
  //   basic — row 1 holds no box, or a box whose upgrade is not of the `basic` family (R-M10S-1's family);
  //   none  — a box naming no upgrade of this power;
  //   link  — a box no chain of links reaches from row 1. A link joins two boxes when BOTH claim it: up/down between boxes
  //           in neighbouring rows whose columns overlap (a wide box links per column), left/right between side-by-side
  //           boxes. Measured: all 21 book trees pass (test/f100_m10_power_tree_check.cjs), several only through a side link.
  // → [{ code, row, col, cell, words }] (row/col 0-based, `cell` the index in row.cells; `col` null for `basic`), in F4's order: basic, then each none, then each link.
  var PT_WORDS = {
    basic: function () { return 'Row 1 has to be the basic power.'; },
    none: function (r, c) { return 'Box ' + (r + 1) + '-' + (c + 1) + ' has no upgrade. Pick one.'; },
    link: function (r, c) { return 'Box ' + (r + 1) + '-' + (c + 1) + ' isn’t linked to the row above.'; },
  };
  // THE ONE LINK RULE between two boxes {r, c, span, L} (row, first column, columns covered, links), shared with
  // CharResolve.sigAbilityChecks' V6 (F-100 M12, R-M12C-40) so a signature tree's owned cells join exactly as a power
  // tree's boxes do — never a second link rule.
  function treeCellsJoined(a, b) {
    var overlap = a.c < b.c + b.span && b.c < a.c + a.span;
    if (b.r === a.r + 1) return overlap && !!a.L.down && !!b.L.up;
    if (b.r === a.r - 1) return overlap && !!a.L.up && !!b.L.down;
    if (b.r === a.r && b.c === a.c + a.span) return !!a.L.right && !!b.L.left;
    if (b.r === a.r && a.c === b.c + b.span) return !!a.L.left && !!b.L.right;
    return false;
  }
  function powerTreeProblems(power) {
    var abs = isObj(power) && isObj(power.abilities) ? power.abilities : {};
    var tree = isObj(power) && Array.isArray(power.tree) ? power.tree : [];
    var boxes = [];
    tree.forEach(function (row, ri) {
      (isObj(row) && Array.isArray(row.cells) ? row.cells : []).forEach(function (c, ci) {
        if (!isObj(c)) return;
        var col = typeof c.col === 'number' ? c.col : 0, span = typeof c.span === 'number' && c.span > 0 ? c.span : 1;
        boxes.push({ r: ri, i: ci, c: col, span: span, L: isObj(c.links) ? c.links : {}, ab: c.ability });
      });
    });
    var out = [], first = boxes.filter(function (b) { return b.r === 0; });
    var known = function (b) { return typeof b.ab === 'string' && hasOwn(abs, b.ab) && isObj(abs[b.ab]); };
    if (!first.length || first.some(function (b) { return !known(b) || abs[b.ab].family !== 'basic'; })) out.push({ code: 'basic', row: 0, col: null, words: PT_WORDS.basic() });
    boxes.forEach(function (b) { if (!known(b)) out.push({ code: 'none', row: b.r, col: b.c, cell: b.i, words: PT_WORDS.none(b.r, b.c) }); });
    var joined = treeCellsJoined;
    var seen = first.slice(), queue = first.slice();
    while (queue.length) {
      var a = queue.shift();
      boxes.forEach(function (b) { if (seen.indexOf(b) === -1 && joined(a, b)) { seen.push(b); queue.push(b); } });
    }
    boxes.forEach(function (b) { if (b.r > 0 && seen.indexOf(b) === -1) out.push({ code: 'link', row: b.r, col: b.c, cell: b.i, words: PT_WORDS.link(b.r, b.c) }); });
    return out;
  }

  // node-only: read every schema file the rail needs from a directory (the guards' loader).
  function readSchemaDir(dir) {
    var fs = require('fs'), path = require('path');
    var out = {};
    SCHEMA_FILES.forEach(function (f) { out[f] = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); });
    return out;
  }

  // browser: fetch every schema file the rail needs from the served /schema/ tree (H4). Rejects on the
  // first file that does not arrive as JSON — a shell served in place of a schema must never be read
  // as one (PRAXIS §4: the SPA answers unknown paths with HTML at 200).
  function fetchSchemas(base, fetchImpl) {
    var f = fetchImpl || (typeof fetch === 'function' ? fetch : null);
    if (!f) return Promise.reject(new Error('packValidate.fetchSchemas: no fetch'));
    base = base || '/schema/';
    return Promise.all(SCHEMA_FILES.map(function (name) {
      return f(base + name).then(function (r) {
        if (!r.ok) throw new Error('schema ' + name + ': HTTP ' + r.status);
        return r.text();
      }).then(function (t) {
        var j;
        try { j = JSON.parse(t); } catch (e) { throw new Error('schema ' + name + ': not JSON (' + t.length + ' bytes) — is /schema/* served?'); }
        if (!isObj(j) || (!j.$schema && !j.$defs && !j.properties)) throw new Error('schema ' + name + ': not a schema');
        return [name, j];
      });
    })).then(function (pairs) { var out = {}; pairs.forEach(function (p) { out[p[0]] = p[1]; }); return out; });
  }

  var api = {
    fetchSchemas: fetchSchemas,
    SECTION_SCHEMAS: SECTION_SCHEMAS, APPLIED_SECTIONS: APPLIED_SECTIONS, PRESERVED_SECTIONS: PRESERVED_SECTIONS,
    SCHEMA_FILES: SCHEMA_FILES, SET_ASIDE: SET_ASIDE, KEYWORDS: KEYWORDS,
    Interpreter: Interpreter, create: create, readSchemaDir: readSchemaDir,
    powerTreeProblems: powerTreeProblems,
    treeCellsJoined: treeCellsJoined,   // F-100 M12: the one link rule, read by CharResolve.sigAbilityChecks (V6)   // F-100 M10 R-M10E-3: the ONE power-tree check (the editor's save reads it here)
  };
  if (typeof root !== 'undefined' && root) root.SWRPGPackValidate = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
