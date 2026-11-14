/**
 * mods.js — window.SWRPGMods: the GAME VARIANTS overlay resolver (F-9 reSpecialized; ruling
 * respec-architecture §3.3 + build-plan B1). Built to the sources.js idiom (IIFE, dual-export,
 * thin localStorage edge, change broadcast). Pure logic + a fetch edge; no deps.
 *
 * THE LAW (architecture §3.4): the TOGGLE governs what NEW characters are built with; every sheet
 * carries a STAMP (sheet.mods) of the variant it was built with and resolves against that stamp
 * FOREVER. Discovery-vs-ownership, one layer below the books filter. So:
 *   · active()   — the toggle's current set (localStorage 'swrpg_mods', default []), each SUPERSEDED stamp read
 *                  as its successor (SUPERSEDES; storage untouched). Used at CREATION.
 *   · applyOverlay(reg, pack) — PURE: base registries + one overlay pack → a NEW view (spec records
 *     field-merged, overlay talents added). NEVER mutates its input.
 *   · resolveForStamp(mods, base) — a SHEET's stamp → its view; empty/absent stamp → base at zero cost.
 * Overlay ids are `respec_*` and never enter the canonical registries (R-F9-3); the pack is versioned
 * (a stamp pins its own version; new versions ADD directories, never replace — non-destructive).
 *
 * F-100 UD-1 (ruling f100-ud1-contracts R-FUD-5/6): the SAME seam folds USER PACKS. applyOverlay is
 * driven by one SECTION TABLE and reads two input shapes (the variant shape above, byte-for-byte; a
 * user pack, `replace` in all 8 applied sections); applyOverlays returns the fold AND its ties; a
 * `user:<packId>[@<v12>]` stamp resolves through the pack store (lib/shared/userData.js), never fetch.
 * THE ORDER: base → variants → imported packs → own packs → my_data (orderLayers).
 */
(function (root) {
  'use strict';
  var KEY = 'swrpg_mods';
  var STORE_VERSION = 2;   // F-100 M11 R-M11F-12: a version-2 list is read exactly (no JOINS); see load()/active()

  // EVERY OFFERED PACK, oldest line first — the ONE home for "which overlays a new character can be
  // built with" (F-102, R-FSA-A5-2: the sources box's row list is the vocabulary's books PLUS the
  // overlay index, and an overlay is never a vocabulary entry). The GAME VARIANTS card in
  // `lib/shared/ui.jsx` carries the same list under `RESPEC_STAMPS`; `test/respec_pack_stamps.cjs`
  // holds the two equal, every offered pack on disk, and every pack on disk either offered or
  // superseded, so a slice that ships a pack and lists it in one place only does not ship. A browser
  // cannot glob `public/data/mods/*/*/manifest.json`, which is why the index is a constant and not a
  // directory walk.
  var SHIPPED_STAMPS = ['respecialized@eote-v2', 'respecialized@aor-v2', 'respecialized@fad-v1'];

  // F-100 M6 — OFFERED vs SUPERSEDED (ruling `f100-m6-contracts` R-M6K-5, C4 (a), extended by R-M6K-25;
  // `f100-m6-pack` R-M6G-13.1, R-M6G-17.3). A superseded pack stays on disk and resolves BY PATH
  // (`packPath`), because every sheet stamped with it reads it forever (the stamp law, above).
  // SUPERSEDES maps a superseded stamp to its successor ON READ, in active() ONLY: a device whose stored
  // choice names the old version reads ON for the new one, and no read rewrites the stored bytes, so a
  // synced 'swrpg_mods' raises no conflict. A sheet's own stamp is NEVER mapped (resolveForStamp reads
  // sheet.mods as written), so an existing character keeps its trees; only what a NEW character is
  // built with moves.
  var SUPERSEDES = {
    'respecialized@eote-v1': 'respecialized@eote-v2',
    'respecialized@aor-v1': 'respecialized@aor-v2',
  };

  // F-100 M11 — "COMES ON WITH IT" (ruling `f100-m11-finish-line` ADDENDUM 4 R-M11F-12, D-147 Q3 (a)). A JOINING stamp →
  // the prior offered set it joins. Read in active() ONLY, and ONLY for a stored payload of version 0 or 1: after
  // SUPERSEDES, a list holding every stamp of the set gains the joining stamp — so a player who had reSpecialized on
  // finds Force and Destiny on too. A version-2 list (written by this build's setActive) is read EXACTLY, so a player
  // who then switches FaD off alone keeps it off. A read never rewrites the stored bytes (sync raises no conflict); a
  // sheet's own stamps are never mapped (resolveForStamp reads sheet.mods as written). Disclosed edge: an OLD build on
  // another device writes version 1, so its toggle can re-trigger the join here; old builds age out, accepted.
  var JOINS = {
    'respecialized@fad-v1': ['respecialized@eote-v2', 'respecialized@aor-v2'],
  };

  // ── localStorage edge (browser only) — the toggle's active set, default [] (vanilla) ──
  //
  // R-B-1 (ruling `f34-phase-b-scope` §5): `STORE_VERSION` was declared and EXPORTED here while
  // `setActive` wrote a bare array — the constant was decorative, and a version constant that is
  // never written is a lie in waiting. It stopped being cosmetic when Phase B made `swrpg_mods` a
  // SYNCING key: two devices on two builds is the case sync creates, and every synced payload
  // should be able to say what shape it is.
  //
  // Persisted shape is now `{ version, mods[] }`; a BARE ARRAY is still read forever as version 0
  // (that is every existing user's data, and several smokes deliberately seed it that way). Nothing
  // reads the raw value — every consumer goes through `active()` — so this migrates invisibly.
  //
  // NOTE ON THE SENTINEL, stated rather than assumed: mods carries no per-record structure, only
  // opaque id strings, so there are no unknown fields for an older build to strip and the F-54
  // write-hold buys nothing here. The version is for self-description, not protection. If this ever
  // grows structure, the guard is one call away — `versionGuard.isAhead` already exists.
  // loadEnvelope() → { version, mods }: a bare array is version 0; an envelope's `version` (absent → 1, the shape every
  // pre-M11 setActive wrote). R-M11F-12: only active()'s JOINS read the version.
  function loadEnvelope() {
    try {
      if (typeof root === 'undefined' || !root.localStorage) return { version: 0, mods: [] };
      var raw = JSON.parse(root.localStorage.getItem(KEY));
      if (Array.isArray(raw)) return { version: 0, mods: raw.map(String) };                    // legacy, version 0
      if (raw && Array.isArray(raw.mods)) {                                                     // envelope
        var v = Number(raw.version);
        return { version: isFinite(v) ? v : 1, mods: raw.mods.map(String) };
      }
      return { version: 0, mods: [] };
    } catch (e) { return { version: 0, mods: [] }; }
  }
  function load() { return loadEnvelope().mods; }
  // The stored list, each superseded stamp read as its successor (first occurrence wins, no duplicate); then, for a
  // version-0/1 payload only, each JOINS stamp whose prior set is all present is appended (R-M11F-12).
  // A player's own toggle still writes through setActive(), as before.
  function active() {
    var env = loadEnvelope(), out = [];
    env.mods.forEach(function (stamp) {
      var s = Object.prototype.hasOwnProperty.call(SUPERSEDES, stamp) ? SUPERSEDES[stamp] : stamp;
      if (out.indexOf(s) === -1) out.push(s);
    });
    if (env.version < 2) {
      Object.keys(JOINS).forEach(function (joiner) {
        var prior = JOINS[joiner];
        if (out.indexOf(joiner) === -1 && prior.every(function (p) { return out.indexOf(p) !== -1; })) out.push(joiner);
      });
    }
    return out;
  }
  function setActive(list) {
    try {
      if (typeof root !== 'undefined' && root.localStorage) {
        root.localStorage.setItem(KEY, JSON.stringify({
          version: STORE_VERSION,
          mods: Array.isArray(list) ? list.map(String) : [],
        }));
      }
    } catch (e) { /* quota / private mode — keep the app alive */ }
    broadcast();
  }
  function broadcast() {
    try { if (root.dispatchEvent && typeof root.CustomEvent === 'function') root.dispatchEvent(new root.CustomEvent('swrpg-mods-changed')); } catch (e) { /* non-DOM host */ }
  }

  // ── THE SECTION TABLE (F-100 UD-1d; ruling f100-ud1-contracts R-FUD-6, brief §6) ──────────────
  // ONE applyOverlay, driven by this table, reading TWO input shapes:
  //   · a USER PACK (it carries `sections`, user-pack.schema.json): `replace` in every applied section —
  //     a FULL record, by id, add or override (G4). Merged records carry the resolved-view markers
  //     `_provenance:'custom'` + `_pack:<packId>` (never persisted; the transparency law — a redefined
  //     blaster_pistol stops claiming oggdude).
  //   · the shipped VARIANT shape (reSpecialized): its three verbs, byte-for-byte as before —
  //     `field` (specializations: the partial-record completion), `replace` (talents), `roster`
  //     (careers: specializations_add / _remove). User packs never use `field` or `roster`.
  //     F-100 M10 (ruling f100-m10-shapes-card R-M10S-8, D-M10C3 (a)): force_powers joins as `replace` —
  //     a variant adds a power by id, or replaces a whole record by id, as talents do. No partial-record
  //     verb: the dataset carries no shared ability key.
  // `viewKey` is the key in the loaded VIEW (the charbuild view calls force_powers `forcePowers`). A
  // section applies to a view only when that view carries its viewKey, so one pack folds into both the
  // charbuild view and the items view, each taking its own sections. vehicles / npcs are NOT in the
  // table: preserved, never applied (H5, R-FEDC-8) — the rail lists them, this function never sees them.
  var SECTION_TABLE = {
    weapons:         { viewKey: 'weapons',         funnel: 'items',     user: 'replace', variant: null },
    armor:           { viewKey: 'armor',           funnel: 'items',     user: 'replace', variant: null },
    gear:            { viewKey: 'gear',            funnel: 'items',     user: 'replace', variant: null },
    species:         { viewKey: 'species',         funnel: 'charbuild', user: 'replace', variant: null },
    careers:         { viewKey: 'careers',         funnel: 'charbuild', user: 'replace', variant: 'roster' },
    specializations: { viewKey: 'specializations', funnel: 'charbuild', user: 'replace', variant: 'field' },
    talents:         { viewKey: 'talents',         funnel: 'charbuild', user: 'replace', variant: 'replace' },
    force_powers:    { viewKey: 'forcePowers',     funnel: 'charbuild', user: 'replace', variant: 'replace' },
    // F-100 M12 (f100-m12-build-card R-M12B-101; R-M12C-41): signature abilities, a whole record by id, as force powers are
    signature_abilities: { viewKey: 'signatureAbilities', funnel: 'charbuild', user: 'replace', variant: 'replace' },
  };
  var SECTIONS = ['weapons', 'armor', 'gear', 'species', 'careers', 'specializations', 'talents', 'force_powers', 'signature_abilities'];
  // The variant shape's own fold order, as it always ran: specs, then talents, then careers; force powers (M10), then
  // signature abilities (M12), last.
  var VARIANT_ORDER = ['specializations', 'talents', 'careers', 'force_powers', 'signature_abilities'];

  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  // F-100 M12 (R-M12B-5, D-157): the line-less label for a record more than one pack places. One string, here.
  var PLAIN_LABEL = 'reSpecialized';
  // B-134: a mod id's plain name, for a reader with no manifest loaded (the conflict sheet's fallback, lib/shared/ui.jsx modTitle).
  var PLAIN_LABELS = { respecialized: PLAIN_LABEL };
  function plainVariant(v) { return { mod: (v && v.mod) || 'respecialized', label: PLAIN_LABEL, line: null }; }
  function isUserPack(pack) { return !!pack && isObj(pack.sections); }

  // ── the verbs. Each is PURE: it copies the base map and never writes into it. ──
  // field — the variant's partial-record completion (specializations).
  function verbField(baseMap, packMap, pack) {
    var k, f, specs = {};
    for (k in baseMap) specs[k] = baseMap[k];
    for (k in packMap) {
      var merged = {};
      var base = specs[k] || {};
      for (f in base) merged[f] = base[f];       // base fields
      for (f in packMap[k]) merged[f] = packMap[k][f];  // overlay wins on carried fields (talent_tree, description)
      // F-100 B-1313 (card f100-career-powers-data ADDENDUM 2 F1): a row of only `bonus_career_powers` is an ANNOTATION on
      // a tree the pack does not rebuild — its field folds, but the tree is not marked as the pack's.
      if (isAnnotation(packMap[k])) { specs[k] = merged; continue; }
      // F-9 legibility (respec-visibility-triage): mark ONLY the rebuilt specs with the variant, so the
      // tree can show a "REBUILT" chip. Resolved-view field — never persisted, no R-SY4 contract.
      // F-100 M12 (R-M12B-5, D-157 K-MK (b)): a spec an EARLIER pack of this fold already placed under another label
      // is placed by more than one pack, so it carries the plain variant ("reSpecialized"); the fold records it, so a
      // stamped sheet and the toggle view answer alike. variantOfRecord reads it.
      if (pack._variant) merged._variant = (isObj(base._variant) && base._variant.label !== pack._variant.label)
        ? plainVariant(pack._variant) : pack._variant;
      specs[k] = merged;
    }
    return specs;
  }
  // replace — a whole record by id, add or override. `mark` (user packs only) returns the record to
  // place: a copy carrying the resolved-view markers. The variant shape places its record verbatim.
  function verbReplace(baseMap, packMap, pack, mark) {
    var k, out = {};
    for (k in baseMap) out[k] = baseMap[k];
    for (k in packMap) out[k] = mark ? mark(packMap[k]) : packMap[k];   // add overlay talents (respec_*)
    return out;
  }
  // ── F-9-S2 §4.3: careers — a pack may EXTEND a career's specialization roster ──────────
  // This is the piece that makes an added spec REACHABLE. Without it a new id exists in the
  // resolved view and nothing points at it: not the creator's career shelf, not NewSpecJourney,
  // not costForNewSpec's career-vs-other-career pricing. `reg.careers` used to be copied by
  // reference below, which is why adding a spec was impossible before this.
  // APPEND-ONLY by construction: `specializations_add` concatenates and de-dupes; there is no
  // "replace" or "remove" verb, so a pack cannot delete a base career's specs. Appended ids land
  // AFTER the base ids, so base rosters keep their printed order. Stays PURE — the base career
  // record is copied, never mutated.
  // F-100 M12 (ruling f100-m12-build-card R-M12B-3, ADDENDUM 28 E1) — THE CAREERS ADD VERB. `roster` is kept for an id the
  // base HOLDS. An entry whose id the base LACKS is ADDED, verbatim, only when careerAddProblems finds nothing: a full
  // career record that packValidate passes against schema/career.schema.json, its specializations resolving in the folded
  // view. Anything else is REFUSED and named (refusedCareers), never silently ignored. `specs` is the folded view's
  // specializations (this pack's specs fold first, VARIANT_ORDER).
  function verbRoster(baseMap, packMap, pack, mark, specs) {
    var k, f, careers = {};
    for (k in baseMap) careers[k] = baseMap[k];
    for (k in packMap) {
      if (!careers[k]) {
        if (!careerAddProblems(k, packMap[k], specs).length) careers[k] = packMap[k];
        continue;
      }
      var addIds = (packMap[k] || {}).specializations_add || [];
      var dropIds = (packMap[k] || {}).specializations_remove || [];
      // F-100 B-1313 (card f100-career-powers-data R-CPD-3): a roster entry may also carry the career's Career Powers pair
      var powers = (packMap[k] || {}).career_powers;
      if (!addIds.length && !dropIds.length && powers === undefined) continue;
      var baseCareer = careers[k];
      // F-9-S2b (Amendment 1): REMOVE is ROSTER-ONLY. It filters which specs the career OFFERS for a
      // new pick under this variant; it never deletes, masks or alters the specialization RECORD,
      // which stays in `out.specializations` and therefore resolvable for anyone who already owns it.
      // A sheet renders an owned spec from the registry and resolves against its OWN stamp, so
      // nothing a player owns can be taken away by a pack. That line does not move.
      var roster = (baseCareer.specializations || []).filter(function (sid) {
        return dropIds.indexOf(sid) === -1;
      });
      for (var i = 0; i < addIds.length; i++) {
        if (roster.indexOf(addIds[i]) === -1) roster.push(addIds[i]);
      }
      var merged = {};
      for (f in baseCareer) merged[f] = baseCareer[f];
      merged.specializations = roster;
      if (powers !== undefined) merged.career_powers = Array.isArray(powers) ? powers.slice() : powers;
      careers[k] = merged;
    }
    return careers;
  }
  var VERBS = { field: verbField, replace: verbReplace, roster: verbRoster };

  // ── the careers ADD verb's ONE check (R-M12B-3) ──
  // The rail is packValidate over the SAME schema files, plus the skills vocabulary its refs arm reads. Node builds it on
  // first use from the repo's own files; the browser has it built by fetchPack, before it resolves a pack whose careers
  // overlay carries a full record (shipped packs carry roster entries only, so they fetch nothing more). No rail → the
  // add is refused, named `rail-unavailable`: an add is never let through unchecked.
  var _careerRail = null, _careerRailPromise = null;
  function careerRail() {
    if (_careerRail) return _careerRail;
    if (typeof module !== 'undefined' && module.exports && typeof require === 'function' && typeof __dirname === 'string') {
      try {
        var path = require('path'), PV = require('./packValidate.js');
        _careerRail = { rail: PV.create(PV.readSchemaDir(path.join(__dirname, '../../schema'))),
          skills: (require(path.join(__dirname, '../../public/data/canonical/skills.vocab.json')).entries || []).map(function (e) { return e.id; }) };
      } catch (e) { _careerRail = null; }
    }
    return _careerRail;
  }
  function ensureCareerRail() {
    if (careerRail()) return Promise.resolve(_careerRail);
    if (_careerRailPromise) return _careerRailPromise;
    var PV = typeof root !== 'undefined' && root ? root.SWRPGPackValidate : null;
    if (!PV || typeof fetch !== 'function') return Promise.resolve(null);
    _careerRailPromise = Promise.all([
      PV.fetchSchemas('/schema/'),
      // B-139 (433 (d)): the page's one read per URL when it has one.
      typeof root.qbFetchJson === 'function' ? root.qbFetchJson('/public/data/canonical/skills.vocab.json')
        : fetch('/public/data/canonical/skills.vocab.json').then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }),
    ]).then(function (r) {
      _careerRail = { rail: PV.create(r[0]), skills: (r[1].entries || []).map(function (e) { return e.id; }) };
      return _careerRail;
    }).catch(function (e) {
      console.warn('[mods] careers rail unavailable:', e);
      _careerRailPromise = null;   // a later pack load may retry
      return null;
    });
    return _careerRailPromise;
  }
  function isRosterEntry(entry) {
    return isObj(entry) && Object.keys(entry).every(function (f) { return f === 'specializations_add' || f === 'specializations_remove' || f === 'career_powers'; });
  }
  // F-100 B-1313 (card f100-career-powers-data ADDENDUM 2 F1): a specialization row whose keys are exactly
  // {bonus_career_powers} annotates a tree; it places nothing (no `_variant`) and defines nothing (no layer key).
  function isAnnotation(entry) {
    return isObj(entry) && Object.keys(entry).length === 1 && Object.prototype.hasOwnProperty.call(entry, 'bonus_career_powers');
  }
  // careerAddProblems(id, entry, specs) → [reason] — empty when `entry` may be ADDED as career `id` (whose id the base
  // lacks): key == id; the record passes career.schema.json (required id, name, career_skills, specializations,
  // free_ranks; optional force_rating, sources …; no other field); every career skill is in the skills vocabulary and every
  // specialization is in `specs`. One line each, `careers.<id>[.path]: what — refused`.
  function careerAddProblems(id, entry, specs) {
    var at = function (p) { return 'careers.' + id + (p && p.length ? '.' + p.join('.') : ''); };
    if (!isObj(entry)) return [at() + ': not a career record — refused'];
    var R = careerRail();
    if (!R) return [at() + ': rail-unavailable — the career schema could not be read, so the career is not added — refused'];
    var out = [];
    if (entry.id !== id) out.push(at(['id']) + ': ' + JSON.stringify(entry.id) + ' is not the key ' + JSON.stringify(id) + ' — refused');
    R.rail.validateRecord('careers', entry).forEach(function (e) {
      if (e.keyword === 'additionalProperties' && e.extras) e.extras.forEach(function (x) { out.push(at(e.path.concat(x)) + ': not a career field — refused'); });
      else out.push(at(e.path) + ': ' + e.message + ' — refused');
    });
    var has = function (section, sid) { return section === 'specializations' && isObj(specs) && Object.prototype.hasOwnProperty.call(specs, sid); };
    R.rail.refs('careers', entry, has, { skills: R.skills, qualities: [] }).forEach(function (e) { out.push(at(e.path) + ': ' + e.msg + ' — refused'); });
    return out;
  }
  // refusedCareers(reg, pack) → [{ id, reasons }] — the entries of a variant pack's careers overlay that name a career
  // `reg` lacks and are NOT added, folded over `reg` exactly as applyOverlay folds them. Pure. [] for a user pack (its
  // records reach a fold only through packValidate.load, which names its own refusals as `kept`).
  function refusedCareers(reg, pack) {
    if (!reg || !pack || isUserPack(pack) || !isObj(pack.careers)) return [];
    var specs = isObj(reg.specializations) ? verbField(reg.specializations, pack.specializations || {}, pack) : null;
    var base = isObj(reg.careers) ? reg.careers : {};
    return Object.keys(pack.careers).filter(function (id) { return !base[id]; }).map(function (id) {
      return { id: id, reasons: careerAddProblems(id, pack.careers[id], specs) };
    }).filter(function (r) { return r.reasons.length; });
  }

  // A user record placed in a view: a shallow copy with the resolved-view markers. `_changes` never
  // reaches a view (a share record is rebuilt to a full record before it is applied, R-FUD-10).
  function markUser(packId) {
    return function (rec) {
      if (!isObj(rec)) return rec;
      var out = {};
      for (var f in rec) if (f !== '_changes') out[f] = rec[f];
      out._provenance = 'custom';
      out._pack = packId;
      return out;
    };
  }

  // ── applyOverlay — PURE. base registries + one overlay pack → a NEW view; never mutates input ──
  // variant shape: { specializations: {id: {talent_tree, description?}}, talents: {id}, careers: {id: {specializations_add?, specializations_remove?}}, force_powers?: {id: FULL record} }
  // user shape:    { formatVersion, packId, sections: { <section>: { id: FULL record } } }

  function applyOverlay(reg, pack) {
    if (!reg || !pack) return reg;
    var k, out = {};
    if (isUserPack(pack)) {
      var mark = markUser(pack.packId);
      for (k in reg) out[k] = reg[k];            // everything else same ref
      SECTIONS.forEach(function (s) {
        var recs = pack.sections[s], vk = SECTION_TABLE[s].viewKey;
        if (!isObj(recs) || !Object.keys(recs).length) return;
        if (!isObj(reg[vk])) return;             // this view does not carry the section (items vs charbuild)
        out[vk] = VERBS[SECTION_TABLE[s].user](reg[vk], recs, pack, mark);
      });
      return out;
    }
    // the variant shape — specs and talents are ALWAYS re-mapped (a new map even when the pack has no
    // entries for them); careers only when the pack carries a careers overlay. As it always ran.
    // F-100 M10 (R-M10S-8, Q4): every section reads and writes the VIEW's key (`viewKey`) — force_powers
    // is `forcePowers` in the charbuild view. Force powers only when the pack carries them AND the view
    // does (a power-less pack leaves `forcePowers` by ref; the items view never gains it).
    var made = {};
    VARIANT_ORDER.forEach(function (s) {
      var T = SECTION_TABLE[s], vk = T.viewKey;
      if (s === 'careers' && !pack.careers) return;
      if (s === 'force_powers' && (!isObj(pack.force_powers) || !isObj(reg[vk]))) return;
      if (s === 'signature_abilities' && (!isObj(pack.signature_abilities) || !isObj(reg[vk]))) return;   // M12: as force powers
      made[vk] = VERBS[T.variant](reg[vk], pack[s] || {}, pack, null, made.specializations || reg.specializations);
    });
    for (k in reg) out[k] = reg[k];              // everything else same ref
    for (k in made) out[k] = made[k];
    return out;
  }

  // ── ties (R-FUD-6: "every tie is reported, never silent") ─────────────────────────────────────
  // The (section, id) pairs one layer DEFINES. A user pack: every record in an applied section. The
  // variant shape: its rebuilt/added specs, its talents, its force powers (M10), and each career whose roster it changes.
  function layerKeys(pack) {
    var out = [];
    if (!pack) return out;
    if (isUserPack(pack)) {
      SECTIONS.forEach(function (s) {
        if (isObj(pack.sections[s])) Object.keys(pack.sections[s]).forEach(function (id) { out.push([s, id]); });
      });
      return out;
    }
    Object.keys(pack.specializations || {}).forEach(function (id) { if (!isAnnotation(pack.specializations[id])) out.push(['specializations', id]); });
    Object.keys(pack.talents || {}).forEach(function (id) { out.push(['talents', id]); });
    Object.keys(isObj(pack.force_powers) ? pack.force_powers : {}).forEach(function (id) { out.push(['force_powers', id]); });
    Object.keys(pack.careers || {}).forEach(function (id) {
      var c = pack.careers[id] || {};
      // R-M12B-3: a full career record (not a roster entry) defines its career, as a replace does
      if ((c.specializations_add || []).length || (c.specializations_remove || []).length || (isObj(c) && !isRosterEntry(c))) out.push(['careers', id]);
    });
    return out;
  }
  function layerLabel(layer, i) {
    if (layer && layer.pack && typeof layer.label === 'string') return layer.label;
    var p = layer && layer.pack ? layer.pack : layer;
    // a user layer is labelled by its STAMP (f100-sync-instance-index R-SII-6): two own collections sharing a packId
    // (this device's My Data and another's) are two layers with two labels, never folded into one
    if (isUserPack(p)) return (typeof p.instance === 'string' && /^[0-9a-f]{12}$/.test(p.instance)) ? 'user:' + p.packId + '#' + p.instance : 'user:' + p.packId;
    return (p && p._variant && p._variant.mod) || ('layer#' + i);
  }
  // tiesOf(layers[, view]) → [{section, id, layers:[label…] in fold order, winner}] — one row for every
  // (section, id) defined by two or more layers. With a view, only sections that view carries.
  function tiesOf(layers, view) {
    var seen = {}, order = [];
    (layers || []).forEach(function (layer, i) {
      var p = layer && layer.pack ? layer.pack : layer;
      var label = layerLabel(layer, i);
      layerKeys(p).forEach(function (pair) {
        if (view && !isObj(view[SECTION_TABLE[pair[0]].viewKey])) return;
        var key = pair[0] + '\u0000' + pair[1];
        if (!seen[key]) { seen[key] = { section: pair[0], id: pair[1], layers: [] }; order.push(key); }
        if (seen[key].layers.indexOf(label) === -1) seen[key].layers.push(label);
      });
    });
    return order.filter(function (key) { return seen[key].layers.length > 1; }).map(function (key) {
      var t = seen[key];
      return { section: t.section, id: t.id, layers: t.layers, winner: t.layers[t.layers.length - 1] };
    });
  }
  // applyOverlays(reg, layers) → { view, conflicts }: the fold, left to right (the LAST layer wins), and
  // its ties. layers: packs, or { label, pack }.
  function applyOverlays(reg, layers) {
    var view = reg;
    (layers || []).forEach(function (layer) { view = applyOverlay(view, layer && layer.pack ? layer.pack : layer); });
    return { view: view, conflicts: tiesOf(layers, reg) };
  }
  // orderLayers(userPacks, order) — THE documented total order of the user layers (R-FUD-6):
  //   imported packs (in `order`), then own packs other than My Data (in `order`), then every `my_data`
  //   row ALWAYS last. The variants fold BEFORE all of these (the caller puts SWRPGMods.active() first).
  //   A pack absent from `order` sorts after those in it, in input order. Pure; returns a new array.
  //   A character's own layer (`sheetData.own`) is the rank AFTER my_data. It is no row here: foldOwn lands it on a sheet's view (R-M13L-2).
  //   Since the store's v2 (R-SII-6) a row's position is its collection key `ck` in `order`; a row with no ck (a caller
  //   older than v2) is placed by its packId, as before.
  function orderLayers(userPacks, order) {
    order = Array.isArray(order) ? order : [];
    var rank = function (p) { return p.packId === 'my_data' ? 2 : (p.origin === 'imported' ? 0 : 1); };
    var pos = function (p) { var i = order.indexOf(typeof p.ck === 'string' ? p.ck : p.packId); return i === -1 ? order.length : i; };
    return (userPacks || []).map(function (p, i) { return { p: p, i: i }; }).sort(function (a, b) {
      return (rank(a.p) - rank(b.p)) || (pos(a.p) - pos(b.p)) || (a.i - b.i);
    }).map(function (x) { return x.p; });
  }

  // ── user: stamps (R-FUD-5) ────────────────────────────────────────────────────────────────────
  //   user:<packId>#<inst>   own pack  → LIVE (the pack's current records), THAT collection only:
  //                          <inst> is minted once per collection (ruling f100-editor-contracts-2 R-EC2-1),
  //                          so HOME's "My Data" is never read as SECOND's. An own stamp without `#` is
  //                          unheld (nothing shipped writes one).
  //   user:<packId>@<v12>    imported  → FROZEN at that version (the versions store)
  // A user: stamp NEVER reaches fetchPack: the pack lives on this device, not under public/data/mods.
  // The records come from a PROVIDER (window.SWRPGUserData in the browser; a guard passes its own
  // store through useUserPacks): { loadStamp(stamp) → Promise<pack|null>, stampSync(stamp) → pack|null }.
  var USER_STAMP_RE = /^user:([a-z0-9_]+)(?:@([0-9a-f]{12})|#([0-9a-f]{12}))?$/;
  function isUserStamp(stamp) { return typeof stamp === 'string' && stamp.indexOf('user:') === 0; }
  function parseUserStamp(stamp) {
    var m = USER_STAMP_RE.exec(String(stamp));
    return m ? { packId: m[1], version: m[2] || null, instance: m[3] || null } : null;
  }
  var _userProvider = null;
  function useUserPacks(provider) { _userProvider = provider || null; }
  function userProvider() {
    return _userProvider || ((typeof root !== 'undefined' && root && root.SWRPGUserData) || null);
  }
  function userPackSync(stamp) {
    var P = userProvider();
    try { return (P && P.stampSync) ? (P.stampSync(stamp) || null) : null; } catch (e) { return null; }
  }
  function userPackAsync(stamp) {
    var P = userProvider();
    if (!P || !P.loadStamp) return Promise.resolve(null);
    try {
      return Promise.resolve(P.loadStamp(stamp)).then(function (p) { return p || null; }, function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  }

  // ── stamp resolution (browser fetch edge) ──
  // stamp form: "respecialized@eote-v1" → public/data/mods/respecialized/eote-v1/
  function packPath(stamp) {
    var parts = String(stamp).split('@');
    return 'public/data/mods/' + parts[0] + '/' + (parts[1] || '') + '/';
  }
  var _cache = {};      // stamp -> Promise<pack|null>
  var _packSync = {};   // stamp -> pack (populated once the fetch resolves; for the sync render path)
  var _failed = {};     // B-30: stamp -> true when its LAST fetch failed (flaky mobile network). Lets
                        // consumers surface an HONEST notice instead of silently rendering base trees
                        // with the toggle still ON (rider R-F9-5). A retry() clears it + re-fetches.
  function broadcastError() {
    try { if (root.dispatchEvent && typeof root.CustomEvent === 'function') root.dispatchEvent(new root.CustomEvent('swrpg-mods-loaderror')); } catch (e) { /* non-DOM host */ }
  }
  // F-100 M6 (ruling f100-m6-pack ADDENDUM 1; B-1000): a pack LANDED. Its own event, fired once per successful fetch, so
  // a view cached before the pack arrived can move on (lib/shared/talentView.js bumps its epoch). Deliberately NOT
  // broadcast(): 'swrpg-mods-changed' means the TOGGLES changed, and the creator re-resolves its charbuild on it.
  function broadcastLoaded(stamp) {
    try { if (root.dispatchEvent && typeof root.CustomEvent === 'function') root.dispatchEvent(new root.CustomEvent('swrpg-mods-pack-loaded', { detail: { stamp: stamp } })); } catch (e) { /* non-DOM host */ }
  }
  // failed() → the stamps whose last fetch failed. retry() clears those flags + their cached failure
  // (so the NEXT resolveForStamp actually re-fetches) and fires 'swrpg-mods-changed' so consumers
  // re-resolve. NOT auto-called on failure — only a user's RETRY re-fetches (no silent retry loop).
  function failed() { return Object.keys(_failed); }
  function retry() {
    Object.keys(_failed).forEach(function (s) { delete _failed[s]; delete _cache[s]; delete _packSync[s]; });
    broadcast();
  }
  function fetchPack(stamp) {
    if (isUserStamp(stamp)) return Promise.resolve(null);   // R-FUD-5: a user: stamp is never fetched
    if (_cache[stamp]) return _cache[stamp];
    var p = packPath(stamp);
    // B-1394 (ruling `release-r7-bug-burndown` ADDENDUM 115, the shape ruled there): the manifest's `overlays` lists the
    // OPTIONAL sections the pack ships as `<section>.overlay.json`; an optional overlay is fetched ONLY when listed, so a
    // pack without powers no longer logs a 404 at every build open. A manifest WITHOUT the key fetches exactly as before.
    // The manifest is read first for that reason; the required overlays are unchanged.
    // F-9 variant marker (respec-visibility-triage): manifest is metadata only — its absence must
    // NOT fail the pack, so this arm swallows errors and the label falls back to the stamp's mod.
    var manP = fetch(p + 'manifest.json').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    _cache[stamp] = manP.then(function (man) {
      var listed = man && Array.isArray(man.overlays) ? man.overlays : null;
      var optional = function (section) {
        if (listed && listed.indexOf(section) === -1) return Promise.resolve(null);
        return fetch(p + section + '.overlay.json').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
      };
      return Promise.all([
      fetch(p + 'specializations.overlay.json').then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }),
      fetch(p + 'talents.overlay.json').then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }),
      man,
      // F-9-S2: careers overlay — OPTIONAL, same posture as the manifest. A pack built before this
      // format existed has no such file and must still load, so this arm swallows errors.
      optional('careers'),
      // F-100 M11 R2 (f100-m11-census-card ADDENDUM 3; f100-m11-build-card step 7): the force powers overlay — OPTIONAL, as
      // careers are, so a pack without powers (eote-v2, aor-v2) still loads; absent, the pack carries no `force_powers` and
      // applyOverlay leaves the view's `forcePowers` by ref.
      optional('force_powers'),
      // F-100 M12 (R-M12B-101): the signature abilities overlay — OPTIONAL, as force powers are; absent, the pack carries no
      // `signature_abilities` and applyOverlay leaves the view's `signatureAbilities` by ref.
      optional('signature_abilities'),
    ]); }).then(function (r) {
      var man = r[2] || {};
      var pack = { specializations: r[0].specializations, talents: r[1].talents,
        careers: (r[3] && r[3].careers) || null,
        // resolved-view-only marker applyOverlay stamps on each rebuilt spec (never persisted).
        // `line` rides along so the GAME VARIANTS card can say WHICH game lines a pack covers
        // without anyone hand-typing a list (Jason's R-F96-3 choice: derived, never typed, so it
        // cannot go stale as slices ship). Metadata only — absence is survivable, as above.
        _variant: { mod: man.mod || String(stamp).split('@')[0], label: man.label || man.mod || 'variant',
                    line: man.line || null,
                    // F-102 (R-FSA-A4-1 / A5-2): the manifest is the DEFINITION of what a variant
                    // rewrites and adds — the sources box derives its row from these, never from a
                    // typed figure. Absent on a pre-F-102 manifest, and `variantCounts` then says
                    // nothing rather than guessing.
                    group: man.group || null, kind: man.kind || null,
                    counts: man.counts || null,
                    base_talents_reused: (typeof man.base_talents_reused === 'number') ? man.base_talents_reused : null } };
      if (r[4] && isObj(r[4].force_powers)) pack.force_powers = r[4].force_powers;
      if (r[5] && isObj(r[5].signature_abilities)) pack.signature_abilities = r[5].signature_abilities;
      // R-M12B-3: a careers overlay carrying a full record needs the rail at fold time — build it before the pack lands
      var adds = Object.keys(pack.careers || {}).some(function (id) { return !isRosterEntry(pack.careers[id]); });
      return (adds ? ensureCareerRail() : Promise.resolve(null)).then(function () { return pack; });
    }).then(function (pack) {
      _packSync[stamp] = pack;
      delete _failed[stamp];   // B-30: a good load clears any prior failure flag
      broadcastLoaded(stamp);  // F-100 M6 (B-1000): after _packSync, so a listener's re-resolve sees the pack
      return pack;
    }).catch(function (e) {
      console.warn('[mods] pack load failed for ' + stamp + ':', e);
      // B-30: record the failure + DROP the cached rejected promise so a RETRY actually re-fetches
      // (previously the null promise stayed cached, so retry could never recover). Signal consumers.
      _failed[stamp] = true;
      delete _cache[stamp];
      broadcastError();
      return null;
    });
    return _cache[stamp];
  }
  // applyStampSync — the SYNCHRONOUS render-path accessor (module-level display helpers can't await).
  // Applies only ALREADY-CACHED packs; an uncached stamp returns base (the async resolveForStamp on
  // sheet-load warms the cache, so by steady-state render the pack is present). base defaults to the
  // pristine charbuild (never the toggle view — the stamp, not the toggle, owns a sheet).
  function applyStampSync(mods, base) {
    base = base || (typeof root !== 'undefined' ? (root._canonicalCharbuildBase || root._canonicalCharbuild) : null);
    if (!mods || !mods.length || !base) return base;
    var view = base;
    for (var i = 0; i < mods.length; i++) {
      // UD-1e: a user: stamp asks the pack store (its already-loaded records), never _packSync.
      var p = isUserStamp(mods[i]) ? userPackSync(mods[i]) : _packSync[mods[i]];
      if (p) view = applyOverlay(view, p);
    }
    return view;
  }
  // resolveForStamp(mods, base) → Promise<view>. mods = a sheet's stamp list (["respecialized@eote-v1"]);
  // empty/absent → base unchanged (zero fetch). base defaults to the loaded canonical charbuild.
  function resolveForStamp(mods, base) {
    // Default to the PRISTINE base (never the toggle-overlaid _canonicalCharbuild) — so a sheet's
    // stamp resolves independent of the global toggle (the (b)/(d) fixtures). B2 keeps the pristine
    // view at _canonicalCharbuildBase; fall back to _canonicalCharbuild if B2 hasn't run yet.
    base = base || (typeof root !== 'undefined' ? (root._canonicalCharbuildBase || root._canonicalCharbuild) : null);
    if (!mods || !mods.length || !base) return Promise.resolve(base);
    return mods.reduce(function (acc, stamp) {
      return acc.then(function (view) {
        // UD-1e: ONE branch — a user: stamp asks the pack store; a missing pack resolves to the view
        // unchanged (graceful, never re-stamped: R-FUD-5's old-data path).
        var got = isUserStamp(stamp) ? userPackAsync(stamp) : fetchPack(stamp);
        return got.then(function (pack) { return pack ? applyOverlay(view, pack) : view; });
      });
    }, Promise.resolve(base));
  }
  // ── F-100 M13 (ruling f100-m13-layer R-M13L-1/-2/-13) — A CHARACTER'S OWN LAYER, `sheetData.own`: a private user pack
  // `{ formatVersion: 1, packId: 'own_layer', name: 'own_layer', sections }` stored inside the save and folded LAST, after every
  // stamp. foldOwn is the ONLY fold of it. Its callers are named: stampTalentView, resolveForSheet below, and the items fold
  // (itemRegistries.js forStampSync / forStamp). A guard reads the sources (test/f100_m13_fold.cjs). Pure; no own → `view` itself.
  function foldOwn(view, sheet) {
    var own = sheet && sheet.own;
    return (view && isUserPack(own)) ? applyOverlay(view, own) : view;
  }
  // resolveForSheet(sheet, base) → Promise<view>: resolveForStamp's twin for a reader holding the SHEET, so its layer folds too.
  function resolveForSheet(sheet, base) {
    return resolveForStamp(sheet && sheet.mods, base).then(function (view) { return foldOwn(view, sheet); });
  }
  // tiesForStamps(stamps[, view]) — the ties among the packs these stamps name, from what is already
  // loaded (variant packs from the fetch cache, user packs from the store). Sync; the discovery
  // conflicts are tiesForStamps(active().concat(SWRPGUserData.activeStamps())).
  function tiesForStamps(stamps, view) {
    var layers = [];
    (stamps || []).forEach(function (st) {
      var p = isUserStamp(st) ? userPackSync(st) : _packSync[st];
      if (p) layers.push({ label: st, pack: p });
    });
    return tiesOf(layers, view);
  }

  /**
   * warm(stamps) — fetch these packs so their manifests are readable. Returns a Promise the caller
   * can re-render on. Uses the SAME `_cache` as every other path, so warming costs nothing extra
   * when a sheet has already resolved the pack.
   */
  function warm(stamps) {
    return Promise.all((stamps || []).filter(function (s) { return !isUserStamp(s); }).map(function (s) { return fetchPack(s); }));
  }
  /** variantOf(stamp) — the pack's manifest-derived identity (`_variant`), or null until warm(). */
  function variantOf(stamp) {
    var p = _packSync[stamp];
    return (p && p._variant) || null;
  }
  /**
   * variantCounts(v) — what a variant REWRITES and ADDS, derived from its manifest by the ruled
   * definition (R-FSA-A4-1, generator `scripts/build_sources_box_mockup.py:overlays`):
   *   rewrites = specs - added_specs      (a tree the overlay carries that the base already had)
   *   specs    = added_specs
   *   talents  = overlay_talents - base_talents_reused   (the remainder are the base's own talents
   *              reused inside rebuilt trees — not this mod's to claim)
   * Returns null when the manifest carries no `counts`: an absence is not a zero.
   */
  function variantCounts(v) {
    var c = v && v.counts;
    if (!c) return null;
    var specs = c.specs || 0, added = c.added_specs || 0, ot = c.overlay_talents || 0;
    var reused = (v.base_talents_reused == null) ? 0 : v.base_talents_reused;
    return { rewrites: Math.max(0, specs - added), specs: added, talents: Math.max(0, ot - reused) };
  }
  /**
   * carries(stamps, section) — whether any of these loaded packs defines records in `section` (a SECTION_TABLE key).
   * false until warm(). F-100 M11 K1 (b) (DECISIONS D-148): the GAME VARIANTS sentence names Force powers only when a
   * covered pack carries them — built from the packs, never typed, as the "Covers …" sentence is.
   */
  function carries(stamps, section) {
    return (stamps || []).some(function (s) {
      var p = _packSync[s], m = p && p[section];
      return isObj(m) && Object.keys(m).length > 0;
    });
  }
  /**
   * variantOfRecord(stamps, section, rec) — the label identity (`_variant`) of the reSpecialized pack that placed this
   * record, else null: a book record, a user-pack record, or a pack not yet loaded. F-100 M11 K4 (b) (DECISIONS D-148):
   * the pack's own label, the approved tree marker's form. F-100 M12 R-M12B-5 (D-157 K-MK (b)): a record that MORE THAN
   * ONE pack places (packs of different labels) gets the plain variant, label "reSpecialized". The ONE label path for
   * the tree marker (treeView.jsx) and the creator's source sites (player/app.jsx fcRecordSourceLabel, srcLabel).
   *   specializations — the fold already recorded it on the record (verbField), so `stamps` is not read: the answer is
   *                     the view's own, whichever stamps built it (a toggle view or a stamped sheet).
   *   other sections  — among these loaded packs, each one whose section holds this id places it (a careers ROSTER
   *                     entry edits a book career and places nothing); the record must be one of theirs (the same
   *                     ref, its release `_source_key`, or a byte-equal copy, as the line-less copies are).
   */
  function variantOfRecord(stamps, section, rec) {
    if (!rec || rec.id == null) return null;
    if (section === 'specializations') return isObj(rec._variant) ? rec._variant : null;
    var placed = [], ours = false, recJson = null;
    (stamps || []).forEach(function (s) {
      var p = _packSync[s], m = p && p[section], pr = isObj(m) ? m[rec.id] : null;
      if (!pr || !p._variant || (section === 'careers' && isRosterEntry(pr))) return;
      if (!ours) {
        if (pr === rec || (pr._source_key && pr._source_key === rec._source_key)) ours = true;
        else { if (recJson === null) recJson = JSON.stringify(rec); ours = JSON.stringify(pr) === recJson; }
      }
      placed.push(p._variant);
    });
    if (!ours || !placed.length) return null;
    var last = placed[placed.length - 1];
    return placed.some(function (v) { return v.label !== last.label; }) ? plainVariant(last) : last;
  }
  /** linesOf(stamps) — the game lines these packs declare, from their manifests. [] until warm(). */
  function linesOf(stamps) {
    var out = [];
    (stamps || []).forEach(function (s) {
      var p = _packSync[s];
      var line = p && p._variant && p._variant.line;
      if (line && out.indexOf(line) === -1) out.push(line);
    });
    return out;
  }

  var api = {
    KEY: KEY, STORE_VERSION: STORE_VERSION,
    active: active, setActive: setActive, warm: warm, linesOf: linesOf,
    carries: carries, variantOfRecord: variantOfRecord,   // F-100 M11 K1 (b) / K4 (b), DECISIONS D-148
    // F-102: the overlay index + a variant's manifest-derived identity and counts (sources box).
    SHIPPED_STAMPS: SHIPPED_STAMPS, variantOf: variantOf, variantCounts: variantCounts, PLAIN_LABELS: PLAIN_LABELS,
    SUPERSEDES: SUPERSEDES,   // F-100 M6 (R-M6K-5): a superseded stamp → its successor, read in active()
    JOINS: JOINS,             // F-100 M11 (R-M11F-12): a joining stamp → the prior set it joins, for a version-0/1 payload only
    refusedCareers: refusedCareers,   // F-100 M12 R-M12B-3: a variant pack's careers it names and may NOT add, with reasons
    applyOverlay: applyOverlay, resolveForStamp: resolveForStamp, applyStampSync: applyStampSync, foldOwn: foldOwn, resolveForSheet: resolveForSheet, packPath: packPath,
    failed: failed, retry: retry,   // B-30: honest load-failure surface (rider R-F9-5)
    // F-100 UD-1d/1e: the section table, the fold + its ties, the layer order, the user: stamp grammar.
    SECTION_TABLE: SECTION_TABLE, SECTIONS: SECTIONS, applyOverlays: applyOverlays, tiesOf: tiesOf,
    tiesForStamps: tiesForStamps, layerKeys: layerKeys, orderLayers: orderLayers, layerLabel: layerLabel,
    USER_STAMP_RE: USER_STAMP_RE, isUserStamp: isUserStamp, parseUserStamp: parseUserStamp, useUserPacks: useUserPacks,
  };
  if (typeof root !== 'undefined') root.SWRPGMods = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
