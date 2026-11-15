/**
 * charResolve.js — the SHARED canonical talent / Force-power resolution core
 * (ADR 0003 charbuild cluster, sub-step 3b; ruling Docs/rulings/charbuild-3b-recon.md).
 *
 * Saved characters persist canonical id-refs (D-3B1):
 *   talents:     [{ id, rank }]                       rank = collapsed purchase count
 *   forcePowers: [{ id, basic: true, upgrades: [abilityKey, …], granted?, granted_upgrade? }]
 *     F-100 M12 (f100-m12-build-card ADDENDUM 25, R-M12B-78/79; B-1246) — THE GRANT MARKER: `granted` "career" | "bonus" |
 *     "both" marks a FREE creation pick (Career Powers); `granted_upgrade` (only with "both", present once in `upgrades`)
 *     is the double pick's free upgrade. Readers key on `granted`, never on cost 0, and are key-independent; the creator
 *     map entry is {cost: 0, basic: true, granted, granted_upgrade?}. Contract in Docs/CREATOR_PLUMBING.md §2.1 forcePowers.
 * and the sheet resolves them at render through these helpers — the ADR 0004 equipment
 * precedent applied to character build. Legacy display-shape entries ({name, description, …})
 * are discriminated by shape and passed through GRACEFULLY, never dropped.
 *
 * Migration discipline (D-3B4, both ruling conditions):
 *   - name → id matching uses a collision-aware index: a name matching MORE THAN ONE registry
 *     record is NO match (live homonym on file: "Temple Training" ×2) — the entry stays as a
 *     marked legacy display entry, never guessed.
 *   - migration is PURE here; the caller owns storage, including the one-time pre-migration
 *     roster backup key (ruling condition 2).
 *   - force-power upgrade matching is by ability KEY only (keys are unique per power and
 *     globally lowercase-unique; names collide 8×) — any unmatched upgrade keeps the WHOLE
 *     power entry legacy (atomic; partial migration would silently drop owned upgrades).
 *
 * Pure + dual-export (browser window.CharResolve / CommonJS) for node harnesses.
 */
(function (root) {
  'use strict';

  // ── shape discrimination ─────────────────────────────────────────────
  // Canonical save entries carry a string id and NO display name (the registry owns names).
  function isCanonicalTalentEntry(e) {
    return !!(e && typeof e === 'object' && typeof e.id === 'string' && e.name == null);
  }
  function isCanonicalPowerEntry(e) {
    return !!(e && typeof e === 'object' && typeof e.id === 'string' && e.name == null);
  }

  // ── collision-aware name index (D-3B4 condition 1) ───────────────────
  // byName[lcName] = id, or false when the name is ambiguous (collision = NO match).
  //
  // F-67 / C-CSG-6 — `opts.incumbentWins`, and why it is opt-in per registry.
  //
  // THE DEFECT IT FIXES: the Complete Species Guide import adds a second record named "Barabel"
  // (`csg_barabel`, its own id — D-PS3 is satisfied by construction). Under the rule above, the
  // NAME "Barabel" then collides and resolves to NOTHING, so every legacy sheet that stored its
  // species as a WORD rather than an id, on any of the name paths, silently stops resolving a species it had resolved for a year. The guard's
  // purpose (never guess between two records that could both be the thing) is right; a deliberate
  // cross-source duplicate simply is not that situation.
  //
  // THE RULE: with `incumbentWins`, the FIRST-indexed record keeps the name. Object key order is
  // insertion order for string keys, and the CSG import APPENDS (scripts/canonical/
  // import_csg_species.py), so "first" is "the record that was already in the catalogue when the
  // sheet was written" — which is exactly what the word on that sheet meant. Ownership is
  // preserved, not guessed at.
  //
  // IT IS OFF EVERYWHERE ELSE, DELIBERATELY. The live homonym on file is TALENTS: "Temple Training"
  // exists twice (`temple_training` / Rise of the Separatists, `temple_training__temptrain` / Dawn
  // of Rebellion). Those are two different talents that happen to share a name — there is no
  // incumbent, and first-wins would GUESS. So talents, careers, specializations and force powers
  // call buildNameIndex with no options and behave byte-identically to before this lap.
  // test/csg_import.cjs asserts both halves: species resolves, Temple Training still refuses.
  function buildNameIndex(registry, opts) {
    var incumbentWins = !!(opts && opts.incumbentWins);
    var byName = {}, collisions = [];
    Object.keys(registry || {}).forEach(function (id) {
      var n = (registry[id] && registry[id].name || '').trim().toLowerCase();
      if (!n) return;
      if (Object.prototype.hasOwnProperty.call(byName, n)) {
        if (byName[n] !== false) {
          collisions.push(n);
          if (!incumbentWins) byName[n] = false;   // strict: a homonym is NO match, never a guess
        }
      } else {
        byName[n] = id;
      }
    });
    return { byName: byName, collisions: collisions };
  }
  // THE species name index. One home, so every species-by-name path in this file speaks the same
  // rule and none of them can drift back to the poisoned one.
  //
  // ── R-MRN-3 DISCHARGED — PRECEDENCE, NOT REGISTRY ORDER (ruling `menagerie-rename-name-resolution`
  //    §7, HANDOFF `species-name-precedence`) ────────────────────────────────────────────────────
  // It used to be `incumbentWins`: with three records named "Ewok" it returned whichever the
  // registry happened to list first. That was a placeholder with a known wrong answer — lap B left
  // the READ paths on it deliberately, because the WRITE seam had to stop guessing first (R-MRN-2)
  // and a save must never be stamped with a guess.
  //
  // The rule now is the one the species browser already applies, `SWRPGSources.dedupeByName`:
  // LOWEST `namePrecedenceOf` wins — official before community, earlier book before later — and
  // equal ranks break on the lower id so the answer is TOTAL and stable rather than positional.
  // One rule, one answer, no second opinion: the list and a legacy save now name the same record.
  //
  // THE RANK IS READ, NOT COMPUTED. `namePrecedenceOf` needs the books index, which arrives over
  // the network; this module is the shared PURE core and takes no dependency on the sources module
  // (see `speciesKey` below for the same reasoning applied to the key). So the rank is stamped onto
  // each record at build time by `scripts/canonical/stamp_species_name_precedence.cjs`, which
  // IMPORTS `namePrecedenceOf` itself — one implementation of the rule, drift impossible by
  // construction. `test/species_name_precedence.cjs` re-derives every rank and reddens on a stale
  // stamp, which is also what catches `species.json` being regenerated without a re-stamp.
  //
  // WHY THE WHOLE REGISTRY AND NOT THE ACTIVE SHELF. `dedupeByName` runs after the active-source
  // filter, so ITS winner moves when a shelf switch moves. Resolution must not: Amendment 1 A-3 —
  // "a character built on the Menagerie's `barabel` keeps the Menagerie's stats forever no matter
  // which shelf switches move". Ranking the full registry is deterministic, shelf-independent, and
  // agrees with the list whenever the winner is active — which is the agreement the card asks for.
  var SPECIES_PRECEDENCE = '_name_precedence';
  function speciesPrecedenceOf(rec) {
    var r = rec && rec[SPECIES_PRECEDENCE];
    return (typeof r === 'number' && isFinite(r)) ? r : Infinity;   // unstamped sorts last, never wins
  }
  function speciesNameIndex(speciesReg) {
    var byName = {}, rankOf = {}, collisions = [];
    Object.keys(speciesReg || {}).forEach(function (id) {
      var rec = speciesReg[id];
      var n = speciesKey(rec && rec.name);
      if (!n) return;
      var r = speciesPrecedenceOf(rec);
      if (!Object.prototype.hasOwnProperty.call(byName, n)) { byName[n] = id; rankOf[n] = r; return; }
      collisions.push(n);                                    // still REPORTED, not silently resolved
      if (r < rankOf[n] || (r === rankOf[n] && String(id) < String(byName[n]))) {
        byName[n] = id; rankOf[n] = r;
      }
    });
    // `key` travels WITH the index so `lookupByName` asks the same question the index answered.
    // Species fold the typographic apostrophe (29 of 532 names carry `’`); the other registries
    // deliberately do not, and they get no `key`, so their behaviour is byte-identical to before.
    return { byName: byName, collisions: collisions, key: speciesKey };
  }
  // The comparison key for "is this species name ambiguous" — trim + case + the typographic
  // apostrophe, matching `SWRPGSources.dedupeName` exactly. Duplicated rather than imported because
  // this module is the shared PURE core and takes no dependency on the sources module; the rule is
  // one line and its divergence would be caught by `test/species_name_migration.cjs`, which counts
  // the shared names both ways.
  function speciesKey(name) {
    return String(name || '').replace(/’/g, "'").trim().toLowerCase();
  }
  function lookupByName(index, name) {
    // An index may carry the KEY FUNCTION it was built with. Without one this is exactly the old
    // behaviour (trim + case), so careers, talents, specialisations and force powers are untouched;
    // the species index supplies `speciesKey`, so a save spelling "Pau'an" reaches the record spelled
    // "Pau’an". Keying the index one way and the lookup another is how a name goes unresolvable while
    // both halves look correct in isolation.
    var key = (index && typeof index.key === 'function')
      ? index.key
      : function (n) { return String(n || '').trim().toLowerCase(); };
    var id = index && index.byName ? index.byName[key(name)] : undefined;
    return (typeof id === 'string') ? id : null;   // false (collision) and undefined both → null
  }
  // B-659 — A SHEET'S CAREER ID, by the ONE name→id resolver: the id-ref when the registry holds it,
  // else the collision-strict name lookup `migrateSheet` writes back with. A surface that reads
  // `sheet.careerId` alone misprices a pre-id-ref save's own career on its first render, because the
  // migrated id reaches the PERSISTED record before it reaches the copy the surface renders.
  // F-100 M12 (ruling f100-m12-census-card R-M12C-71): ONE tie-break, here only — lookupByName stays collision-strict
  // everywhere (B-659). When a name matches exactly one BOOK career and one or more user- or pack-added careers, it means
  // the book's: a name-only save predates id-refs, and so predates every user career. A collision between two non-book
  // records still returns null. A record is not a book's when the folds mark it (a user pack's `_pack` / `_provenance:
  // 'custom'`, a variant's view-only `_variant`).
  function _isBookCareer(rec) {
    return !!rec && !rec._pack && rec._provenance !== 'custom' && !rec._variant;
  }
  function sheetCareerId(sheet, careerReg) {
    if (!sheet) return null;
    careerReg = careerReg || {};
    if (sheet.careerId && careerReg[sheet.careerId]) return sheet.careerId;
    if (!sheet.career) return null;
    var id = lookupByName(buildNameIndex(careerReg), sheet.career);
    if (id) return id;
    var want = String(sheet.career).trim().toLowerCase(), named = [], book = [];
    Object.keys(careerReg).forEach(function (k) {
      var r = careerReg[k];
      if (!r || String(r.name || '').trim().toLowerCase() !== want) return;
      named.push(k);
      if (_isBookCareer(r)) book.push(k);
    });
    return (named.length > 1 && book.length === 1) ? book[0] : null;
  }


  // ── render-time resolution (GRACEFUL — the PC save contract) ─────────
  // clean: optional plain-text projector (the apps pass cleanMarkup); identity by default.
  function resolveTalentEntry(entry, talentReg, clean) {
    clean = clean || function (s) { return s; };
    if (isCanonicalTalentEntry(entry)) {
      var rec = (talentReg || {})[entry.id];
      if (!rec) return { name: '(unknown talent)', description: '', descriptionRaw: '', rank: entry.rank || 1, _unresolved: true, id: entry.id };
      return {
        id: rec.id,
        name: rec.name,
        rank: entry.rank || 1,
        ranked: !!rec.ranked,
        activation: rec.activation || null,
        description: clean(rec.description || ''),
        descriptionRaw: rec.description || '',
        // the registry knows which books carry this talent; the reading surfaces cite it (the
        // teaching entry's third beat). Dropped here before, so no consumer could show a source.
        sources: (rec.sources && rec.sources.length) ? rec.sources.slice() : null,
      };
    }
    if (typeof entry === 'string') return { name: entry, description: '', descriptionRaw: '', rank: 1, _legacy: true };
    if (entry && entry.name) return Object.assign({ rank: 1, _legacy: true }, entry);
    return { name: '(unknown talent)', description: '', descriptionRaw: '', rank: 1, _unresolved: true };
  }
  // B-1021 (ruling release-r7-bug-burndown ADDENDUM 65/66): ONE talent can reach a sheet under two emitted ids — a
  // reSpecialized line keys Savvy SAVY, another SAVVY — so the list printed it twice at rank 1. A record's `same_as`
  // (stamped by the emitter from the signed `_same_as` ledger, never by name) names its identity; entries of one identity
  // fold here into ONE row at the first one's place, ranks SUMMED, named by the identity's own record when this view holds
  // it. The ONE reader of `same_as`: nothing else folds. The dice are untouched (each id's own pool_mods already sum).
  function resolveSheetTalents(list, talentReg, clean) {
    var reg = talentReg || {}, rows = [], at = {};
    (Array.isArray(list) ? list : []).forEach(function (e) {
      var row = resolveTalentEntry(e, reg, clean);
      var rec = (isCanonicalTalentEntry(e) && !row._unresolved) ? reg[e.id] : null;
      var ident = rec ? (rec.same_as || rec.id) : null;
      if (ident == null || !Object.prototype.hasOwnProperty.call(at, ident)) {
        if (ident != null) at[ident] = rows.length;
        rows.push(row);
        return;
      }
      var i = at[ident], first = rows[i];
      var named = reg[ident] ? resolveTalentEntry({ id: ident, rank: 1 }, reg, clean) : first;
      // An UNRANKED talent held twice is held once (it has no ranks to sum): Blather stays one row with no count.
      var ranked = !!(first.ranked || row.ranked);
      rows[i] = Object.assign({}, named, { rank: ranked ? (first.rank || 1) + (row.rank || 1) : 1, ranked: ranked,
        ids: (first.ids || [first.id]).concat(row.id) });
    });
    return rows;
  }

  function resolvePowerEntry(entry, powerReg, clean) {
    clean = clean || function (s) { return s; };
    if (isCanonicalPowerEntry(entry)) {
      var rec = (powerReg || {})[entry.id];
      if (!rec) return { name: '(unknown power)', desc: '', description: '', descriptionRaw: '', basic: !!entry.basic, upgrades: [], upgradeNames: [], _unresolved: true, id: entry.id };
      var keys = Array.isArray(entry.upgrades) ? entry.upgrades : [];
      var names = keys.map(function (k) {
        var ab = (rec.abilities || {})[k];
        return ab ? ab.name : k;
      });
      var d = clean(rec.description || '');
      return {
        id: rec.id,
        name: rec.name,
        basic: entry.basic !== false,
        upgrades: names.slice(),              // display-facing (consumers list/count these)
        upgradeKeys: keys.slice(),            // mechanical (tree-view ownership, persistence)
        upgradeNames: names,
        desc: d,                              // legacy alias — sheet readers use .desc and .description
        description: d,
        descriptionRaw: rec.description || '',
        sources: (rec.sources && rec.sources.length) ? rec.sources.slice() : null,
      };
    }
    if (typeof entry === 'string') return { name: entry, desc: '', description: '', descriptionRaw: '', basic: true, upgrades: [], upgradeNames: [], _legacy: true };
    if (entry && entry.name) {
      var ups = Array.isArray(entry.upgrades) ? entry.upgrades : [];
      return Object.assign({}, entry, {
        desc: entry.desc || entry.description || '',
        description: entry.description || entry.desc || '',
        descriptionRaw: entry.descriptionRaw || entry.desc || entry.description || '',
        upgrades: ups,
        upgradeKeys: ups.map(function (u) { return typeof u === 'string' ? u : (u && u.key || ''); }).filter(Boolean),
        upgradeNames: ups.map(function (u) { return typeof u === 'string' ? u : (u && (u.name || u.key) || ''); }).filter(Boolean),
        _legacy: true,
      });
    }
    return { name: '(unknown power)', desc: '', description: '', descriptionRaw: '', basic: true, upgrades: [], upgradeNames: [], _unresolved: true };
  }
  function resolveSheetForcePowers(list, powerReg, clean) {
    return (Array.isArray(list) ? list : []).map(function (e) { return resolvePowerEntry(e, powerReg, clean); });
  }

  // ── creation-time projection (canonical creator state → save entries) ─
  // talentsPosMap: { posKey: { talentKey, specKey, row, col, cost } } — collapse by talentKey.
  // C-PFR1-1 — THE DELIBERATE TWIN of `talentsFromOwnedPositions` (below). Two rank-collapse
  // functions exist, on purpose, and this comment is the reason so nobody "tidies" one away.
  //
  // They take DIFFERENT INPUTS: this one reads the CREATOR's position->talentKey map (the key
  // already carries the talent); its twin reads SHEET spec positions and resolves each cell through
  // the specialization registry. Same output SHAPE — [{id, rank}] — same collapse rule.
  //
  // WHY THEY ARE NOT MERGED — the STRUCTURAL argument, which does not decay:
  //   · The two traverse differently. This one walks the creator's position map FLAT, so it emits
  //     the player's BUY order. The twin walks SPECS then positions, so it emits SPEC-GROUPED order.
  //   · The divergence is REACHABLE and ordinary, not exotic: the Guided archetype table
  //     (`player/app.jsx:5970-5980`) grants a bonus talent from a SECOND specialization, so a
  //     multi-spec creator state is the normal case rather than an edge one.
  //   · The property worth guarding is CONTENT agreement — a talent bought after creation must
  //     reach the sheet — and that is what the binding assert holds them to.
  //
  // C-PD-3 — TWO THINGS THIS COMMENT USED TO SAY HAVE BEEN REMOVED, and both removals matter more
  // than the sentence they cost:
  //   1. A statistic ("4,000 randomised states, 1,654 = 41% divergent"). The experiment was real but
  //      it lives NOWHERE IN THE REPO — it was a one-off script, so the number could not be
  //      re-derived by anyone reading this. R-PD-3: a statistic in a durable comment must be
  //      reproducible or must not be load-bearing. The structural argument above carries the
  //      decision without it.
  //   2. The claim that merging "would reshuffle the talent list on every character already saved".
  //      **That was FALSE.** The merge changes what CREATION emits; it does not re-project stored
  //      saves. And the buy order being defended is not durable anyway — `buyTalent`
  //      (`player/app.jsx:12236`) rewrites this whole array in SPEC-GROUPED order the first time a
  //      player buys any talent after creation. The decision stands; the overstated defence does not.
  //
  // That inconsistency is itself an open PRODUCT question (B-127 / R-PD-2): buy order at creation,
  // spec-grouped after the first advancement purchase. It wants a concept ruling, and nobody may
  // resolve it by quietly making these two agree — that is the merge this comment declines.
  //
  // The binding assert is `test/pfr1_advancement_talents.cjs` — it holds the two producers to the
  // same CONTENT (the property that protects the player: a talent bought after creation must reach
  // the sheet) and no longer claims they share one implementation, because they do not.
  // ── THE ONE RANK COUNTER (F-100, ruling f100-effects-grammar-contracts R-FEGC-2) ──────────────
  // "How many ranks of X do I own" is answered HERE and nowhere else: a list of owned talent ids in which
  // a repeat is a rank (positional ownership, R-CS4b; a species grant pushes its id `ranks` times) →
  // [{id, rank}] in first-seen order. Both talent projections below, the derived seam
  // (`derivedBonusesFromTalents`) and poolMods.collect's owned-talents arm (`ownedTalentPoolSources`)
  // consume it; a second count is the charter-§8 defect the ruling names. It COUNTS only — whether a
  // count MULTIPLIES is the consumer's rule (an effect's `per_rank`, a pool_mods entry's `per_rank` or its
  // talent's `ranked`), so an unranked talent owned twice reads rank 2 here and applies once there.
  function ownedRankCounts(ids) {
    var rankById = {}, order = [];
    (Array.isArray(ids) ? ids : []).forEach(function (id) {
      if (id == null || id === '') return;
      if (!rankById[id]) { rankById[id] = 0; order.push(id); }
      rankById[id] += 1;
    });
    return order.map(function (id) { return { id: id, rank: rankById[id] }; });
  }
  function talentsFromCreatorState(talentsPosMap) {
    var ids = [];
    Object.keys(talentsPosMap || {}).forEach(function (posKey) {
      var t = talentsPosMap[posKey];
      if (t && t.talentKey) ids.push(t.talentKey);
    });
    return ownedRankCounts(ids);
  }
  // ── THE ONE PROJECTION FROM OWNED TREE POSITIONS → THE TALENT LIST (R-PFR-1) ──────────────
  //
  // WHY THIS EXISTS. The sheet kept TWO records of talents: `specializations[].owned` (positions)
  // and `talents` (id-refs). Creation wrote both; ADVANCEMENT wrote only the first — and `talents`
  // is the one ABILITIES, the OVERVIEW cockpit and BOTH PDF exports read. So a talent bought after
  // creation deducted the player's XP, filled in on the tree, and existed nowhere else. The player
  // paid for something invisible, including on the sheet they print.
  //
  // Two producers must now agree, so there is ONE implementation and both call it — a second copy
  // inside the sheet is the rejected shape (R-PFR-1, charter §8). Ownership is POSITIONAL because
  // every spec tree repeats at least one talent internally; collapsing by name would merge distinct
  // cells. Ranks collapse to `rank: N` exactly as creation already does, so the two producers emit
  // the SAME shape rather than two dialects of it.
  //
  // `specRegistry` is the canonical specializations map; a spec it does not know contributes
  // nothing rather than throwing — a save naming a retired spec must still open.
  //
  // C-PFR1-1 — ITS TWIN IS `talentsFromCreatorState` (above), and the duplication is DELIBERATE.
  // That one serves CREATION from the creator's own position map; this one serves ADVANCEMENT from
  // sheet spec positions. They traverse differently — flat buy order vs spec-grouped — and the
  // divergence is reachable through the Guided archetypes' cross-spec bonus talent, so merging them
  // would change emitted order. Bound by `test/pfr1_advancement_talents.cjs`, which holds the two
  // producers to the same CONTENT — not to one implementation. Full reasoning above; the ORDER
  // inconsistency it exposes is B-127, an open product question.
  // F-100 M13 (R-M13L-6/-18): `sheetData.looseTalents` { <talentId>: { ranks, xp } } — the talents a character holds outside its
  // trees. Its ids, one repeat per rank, for the producers below: they join the positions on every write of `talents`.
  function looseTalentIds(loose) {
    var ids = [];
    Object.keys((loose && typeof loose === 'object') ? loose : {}).forEach(function (id) {
      var n = Math.max(0, Math.floor(Number(loose[id] && loose[id].ranks) || 0));
      for (var i = 0; i < n; i++) ids.push(id);
    });
    return ids;
  }
  function talentsFromOwnedPositions(specsList, specRegistry, loose) {
    var ids = [];
    (Array.isArray(specsList) ? specsList : []).forEach(function (s) {
      var rec = specRegistry ? specRegistry[s && s.id] : null;
      var tree = rec && rec.talent_tree;
      if (!tree) return;
      ((s && s.owned) || []).forEach(function (pos) {
        var rc = String(pos).split('-');
        var r = +rc[0], c = +rc[1];
        var row = tree[r];
        var cell = row && row.talents ? row.talents[c] : null;
        var id = cell && cell.talent;
        if (id) ids.push(id);
      });
    });
    return ownedRankCounts(ids.concat(looseTalentIds(loose)));
  }

  // ── F-100 M5 · R-M5B-1/2 (ruling f100-m5-talents-buy-after-deleted-tree): THE ONE WRITER OF `talents` FROM POSITIONS
  // when a tree the character owns may be ABSENT from the view (an own specialization deleted from a present pack, C5.2).
  // `talentsFromOwnedPositions` projects nothing for such a tree, so a buy in any other tree would silently drop what it
  // held. Per talent id: the projection of the present trees AFTER the write, plus max(0, persisted − projection of the
  // present trees BEFORE it) — so a ranked talent held through two trees keeps exactly the absent tree's share. With
  // every tree present this IS talentsFromOwnedPositions(after) (test/f100_m5_buy_keeps_deleted_tree.cjs case 3); it
  // wraps that projection and never adds a second one. Order: the projection's order, then kept ids in persisted order.
  function talentsKeepingAbsentTrees(persisted, specsBefore, specsAfter, specRegistry, loose, looseBefore, keepAlways) {
    var after = talentsFromOwnedPositions(specsAfter, specRegistry, loose);
    var reg = specRegistry || {};
    var absent = (Array.isArray(specsAfter) ? specsAfter : []).concat(Array.isArray(specsBefore) ? specsBefore : [])
      .some(function (s) { return s && s.id && !(reg[s.id] && reg[s.id].talent_tree); });
    if (!absent && !keepAlways) return after;   // keepAlways (F-100 M13 R-M13L-19, a Save): a hand-kept talent no tree projects stays too
    var before = {}; talentsFromOwnedPositions(specsBefore, specRegistry, looseBefore === undefined ? loose : looseBefore).forEach(function (t) { before[t.id] = t.rank || 1; });
    var out = after.map(function (t) { return { id: t.id, rank: t.rank }; }), at = {};
    out.forEach(function (t, i) { at[t.id] = i; });
    (Array.isArray(persisted) ? persisted : []).forEach(function (t) {
      if (!t || typeof t.id !== 'string' || !t.id) return;
      var kept = Math.max(0, (Number(t.rank) || 1) - (before[t.id] || 0));
      if (!kept) return;
      if (at[t.id] != null) out[at[t.id]].rank += kept;
      else { at[t.id] = out.length; out.push({ id: t.id, rank: kept }); }
    });
    return out;
  }

  // CS-4 (R-CS4a): specialization ownership projected from the creator's positional talent map
  // → [{ id, owned: ["<row>-<col>", …] }]. Ownership is POSITIONAL ONLY — never talent-name-keyed:
  // the census proved all 120 spec trees repeat at least one talent internally, so a name key is a
  // latent defect. The sheet's ADVANCEMENT resolves the tree from the registry by id and marks owned
  // cells by row-col (the §8 id-ref/resolve-at-render law; the tree is never copied into the save).
  // B-29: `chosenSpecIds` seeds the OWNED-with-zero-cells state. Owning a specialization is a
  // creation entitlement independent of buying its tree talents — Guided Build has no talent
  // step, and Custom's "CONTINUE WITHOUT TALENTS" is a first-class path, so a spec with no
  // purchased cells is a legal, common state. Without this, a zero-talent character was born
  // with an empty spec list and ADVANCEMENT misfiled it as pre-tree-tracking legacy.
  function specsFromCreatorState(talentsPosMap, chosenSpecIds) {
    var bySpec = {}, order = [];
    (Array.isArray(chosenSpecIds) ? chosenSpecIds : []).forEach(function (id) {
      if (id && !bySpec[id]) { bySpec[id] = []; order.push(id); }
    });
    Object.keys(talentsPosMap || {}).forEach(function (posKey) {
      var t = talentsPosMap[posKey];
      if (!t || !t.specKey || t.row == null || t.col == null) return;
      if (!bySpec[t.specKey]) { bySpec[t.specKey] = []; order.push(t.specKey); }
      var key = t.row + '-' + t.col;
      if (bySpec[t.specKey].indexOf(key) === -1) bySpec[t.specKey].push(key);
    });
    return order.map(function (id) { return { id: id, owned: bySpec[id] }; });
  }

  // B-855 — THE HOLD's one predicate (ruling f100-b854 R-B854-1/2; R-B854-2 as amended by
  // f100-editor-contracts-2 R-EC2-1, released by f100-editor-drc-census-gate ADDENDUM 1 R-EDG-A1-2).
  // A writer that PROJECTS through `data` (the view the sheet resolves through) is HELD when
  //   (1) any owned reference is absent from `data`: speciesId, careerId, specializations[].id,
  //       specializationIds[], talents[].id, forcePowers[].id — read from the SAME `data` the writer
  //       uses, never from a stamp's spelling or a `custom_` prefix; or
  //   (2) the sheet carries a `user:` stamp this build cannot resolve (`missingStamps`: the store's
  //       missingFor on a build with one; every `user:` stamp on a build without one) — because a
  //       RESOLVED reference may be the book's record standing in for a house rule (U-6).
  // Returns null (not held) or { variant, refs:[{field, id, kind, name}], stamps }. variant 'A' = homebrew
  // missing (a build WITH a store, and a stamp is missing); 'B' = this build can't read it (an older
  // build, or a retired id) — B must never say "homebrew" (R-B854-2). Pure; the words are the frame's.
  function sheetHold(sheet, data, missingStamps, hasStore) {
    if (!sheet || !data) return null;
    var refs = [];
    function miss(field, id, kind, reg, name) {
      if (typeof id !== 'string' || !id) return;
      if (reg && Object.prototype.hasOwnProperty.call(reg, id)) return;
      if (refs.some(function (r) { return r.field === field && r.id === id; })) return;
      refs.push({ field: field, id: id, kind: kind, name: (typeof name === 'string' && name) ? name : null });
    }
    miss('speciesId', sheet.speciesId, 'species', data.species, sheet.species);
    miss('careerId', sheet.careerId, 'career', data.careers, sheet.career);
    (Array.isArray(sheet.specializations) ? sheet.specializations : []).forEach(function (s) { miss('specializations', s && s.id, 'specialization', data.specializations); });
    (Array.isArray(sheet.specializationIds) ? sheet.specializationIds : []).forEach(function (id) { miss('specializations', id, 'specialization', data.specializations); });
    (Array.isArray(sheet.talents) ? sheet.talents : []).forEach(function (t) { miss('talents', t && t.id, 'talent', data.talents); });
    (Array.isArray(sheet.forcePowers) ? sheet.forcePowers : []).forEach(function (p) { if (isCanonicalPowerEntry(p)) miss('forcePowers', p.id, 'force power', data.forcePowers); });
    var stamps = (Array.isArray(missingStamps) ? missingStamps : []).filter(function (s) { return typeof s === 'string' && s.indexOf('user:') === 0; });
    // F-100 M5 C5.2 (ruling f100-m5-contracts §3 C5, shape (iii)): a TALENT or SPECIALIZATION the sheet owns that is
    // absent from `data` while every `user:` stamp the sheet carries IS on this device (and it carries at least one)
    // was deleted from a present own pack, or is missing from a present import — NOT A HOLD. No in-app path brings
    // such a record back (R-FILC-5), so a hold would lock buying for good; the sheet shows it as a deleted record that
    // does nothing, and the reason-line slot tells once (U9, sheetDeletedRefs below). Variant B keeps its meaning (an
    // app too old for the data): a sheet with no present `user:` stamp is held as before.
    // B-1190 (ruling f100-m9-build-card step 10; F-100 WORD on the board row): a pack carries species, careers and Force
    // powers too (lib/shared/mods.js SECTION_TABLE), so the same release covers a SPECIES, CAREER or FORCE POWER, with
    // F5's words for each (the host's reason-line slot). C5_RELEASED is the one list both functions read.
    if (!stamps.length && hasStore && refs.length && presentUserStamps(sheet, missingStamps).length) {
      refs = refs.filter(function (r) { return C5_RELEASED.indexOf(r.kind) === -1; });
    }
    if (!refs.length && !stamps.length) return null;
    return { variant: (hasStore && stamps.length) ? 'A' : 'B', refs: refs, stamps: stamps };
  }
  // the kinds C5.2 releases from the hold (M5: talent, specialization; B-1190: species, career, force power)
  var C5_RELEASED = ['talent', 'specialization', 'species', 'career', 'force power'];
  // The sheet's `user:` stamps this device holds (its `mods` minus the missing ones).
  function presentUserStamps(sheet, missingStamps) {
    var miss = Array.isArray(missingStamps) ? missingStamps : [];
    return (Array.isArray(sheet && sheet.mods) ? sheet.mods : []).filter(function (s) {
      return typeof s === 'string' && s.indexOf('user:') === 0 && miss.indexOf(s) === -1;
    });
  }
  // sheetDeletedRefs(sheet, data, missingStamps, hasStore) → the records C5.2 releases from the hold — talents and
  // specializations (M5), and the species, career and Force powers (B-1190) — ([{field, id, kind}], possibly empty): what
  // U9's and F5's words are about. Pure; the same predicate as sheetHold's. A registry `data` does not carry is not read
  // (an absent section is not a deletion).
  function sheetDeletedRefs(sheet, data, missingStamps, hasStore) {
    if (!sheet || !data || !hasStore) return [];
    var stamps = (Array.isArray(missingStamps) ? missingStamps : []).filter(function (s) { return typeof s === 'string' && s.indexOf('user:') === 0; });
    if (stamps.length || !presentUserStamps(sheet, missingStamps).length) return [];
    var out = [];
    function miss(field, id, kind, reg) {
      if (typeof id !== 'string' || !id) return;
      if (reg && Object.prototype.hasOwnProperty.call(reg, id)) return;
      if (out.some(function (r) { return r.field === field && r.id === id; })) return;
      out.push({ field: field, id: id, kind: kind });
    }
    function regOf(r) { return r && typeof r === 'object' ? r : null; }
    if (regOf(data.species)) miss('speciesId', sheet.speciesId, 'species', data.species);
    if (regOf(data.careers)) miss('careerId', sheet.careerId, 'career', data.careers);
    if (regOf(data.forcePowers)) (Array.isArray(sheet.forcePowers) ? sheet.forcePowers : []).forEach(function (p) { if (isCanonicalPowerEntry(p)) miss('forcePowers', p.id, 'force power', data.forcePowers); });
    (Array.isArray(sheet.specializations) ? sheet.specializations : []).forEach(function (s) { miss('specializations', s && s.id, 'specialization', data.specializations); });
    (Array.isArray(sheet.specializationIds) ? sheet.specializationIds : []).forEach(function (id) { miss('specializations', id, 'specialization', data.specializations); });
    (Array.isArray(sheet.talents) ? sheet.talents : []).forEach(function (t) { miss('talents', t && t.id, 'talent', data.talents); });
    return out;
  }

  // B-1595 (D-411 bind 2; D-412 item 1, ADDENDUM 306): REMOVED, not deleted — THE ONE PREDICATE the sheet's notice, the
  // creator door and the tree box read. A ref ({field, id}, sheetDeletedRefs' shape) is removed when its id is minted
  // (`custom_<packId>_…`, userData mintId) and the sheet no longer carries that collection (`user:<packId>` stamp). Returns
  // null (deleted, or not an own record: the deleted words stay) or { name }: the sheet's saved name (species, career),
  // else the record in the removed collection where this device still holds it (`ud`: SWRPGUserData), else null (the
  // collection is not on this device). Pure over its inputs; `parseStamp` is SWRPGMods.parseUserStamp.
  var REMOVED_SECTION = { speciesId: 'species', careerId: 'careers', specializations: 'specializations', forcePowers: 'force_powers', talents: 'talents' };
  function removedRef(sheet, ref, ud, parseStamp) {
    if (!sheet || !ref || typeof ref.id !== 'string' || !/^custom_/.test(ref.id) || !REMOVED_SECTION[ref.field]) return null;
    var carried = (Array.isArray(sheet.mods) ? sheet.mods : []).map(function (m) { var q = typeof parseStamp === 'function' ? parseStamp(m) : null; return q && q.packId; }).filter(Boolean);
    if (carried.some(function (pid) { return ref.id.indexOf('custom_' + pid + '_') === 0; })) return null;
    // F-100 M13 (R-M13L-17): the character's own layer supplies it (a `custom_own_layer_` record, or a whole copy of a detached collection's), so it resolves
    var ownSec = sheet.own && sheet.own.sections && sheet.own.sections[REMOVED_SECTION[ref.field]];
    if (ownSec && Object.prototype.hasOwnProperty.call(ownSec, ref.id)) return null;
    if (ref.field === 'speciesId' && typeof sheet.species === 'string' && sheet.species) return { name: sheet.species };
    if (ref.field === 'careerId' && typeof sheet.career === 'string' && sheet.career) return { name: sheet.career };
    var nm = null, sec = REMOVED_SECTION[ref.field];
    ((ud && typeof ud.list === 'function' && ud.list()) || []).forEach(function (c) {
      var k = !nm && c && typeof ud.get === 'function' ? ud.get(c.ck) : null, t = k && k.pack && k.pack.sections && k.pack.sections[sec];
      if (t && Object.prototype.hasOwnProperty.call(t, ref.id) && t[ref.id] && typeof t[ref.id].name === 'string' && t[ref.id].name) nm = t[ref.id].name;
    });
    return { name: nm };
  }

  // B-29 read-time HEAL (derive-at-render): a sheet born with an empty `specializations` but
  // carrying chosen-spec evidence (specializationIds, or a resolvable specialization NAME) gets
  // its owned-spec entry synthesized at render — so existing Guided/no-talent characters
  // un-legacy on next open with NO migration. A TRUE legacy sheet (no resolvable evidence)
  // returns [] and keeps the honest pre-tracking stub. charbuild = the runtime charbuild
  // registry (has `.specializations`); absent → the raw list (graceful, never a throw).
  function resolveSheetSpecs(sheet, charbuild) {
    var specs = Array.isArray(sheet && sheet.specializations) ? sheet.specializations : [];
    if (specs.length || !charbuild || !charbuild.specializations) return specs;
    var reg = charbuild.specializations;
    var ids = [];
    (Array.isArray(sheet && sheet.specializationIds) ? sheet.specializationIds : []).forEach(function (id) {
      if (reg[id] && ids.indexOf(id) === -1) ids.push(id);
    });
    if (!ids.length && sheet && sheet.specialization) {
      var id = lookupByName(buildNameIndex(reg), sheet.specialization);
      if (id && ids.indexOf(id) === -1) ids.push(id);
    }
    return ids.map(function (id) { return { id: id, owned: [] }; });
  }

  // B-1651 (ruling release-r7-bug-burndown ADDENDUM 390): THE OWNED-SPEC ID LIST. `specializationIds` holds every owned tree in
  // `specializations`, since the OggDude export and careerPowersOf read it raw. A tree bought after creation (buyNewSpec)
  // used to land in `specializations` only, so the export left it out of the file and a reSpecialized bonus tree gave no
  // career powers. Returns `ids` with each owned tree id it lacks appended in tree order (the starting spec stays first),
  // or `ids` ITSELF when none is missing, so a writer can test identity and a correct record stays byte-identical. It never
  // removes or reorders an id. The writers (buyNewSpec, buyTalent) and the load repair (migrateSheet) both read it. Pure.
  function ownedSpecIds(ids, specs) {
    var have = Array.isArray(ids) ? ids : [];
    var add = [];
    (Array.isArray(specs) ? specs : []).forEach(function (s) {
      var id = s && s.id;
      if (typeof id === 'string' && id && have.indexOf(id) === -1 && add.indexOf(id) === -1) add.push(id);
    });
    return add.length ? have.concat(add) : ids;
  }

  // forcePowersMap: { powerId: { name, desc, cost, basic, upgrades? } } (creator buy state, id-keyed post-3a).
  // F-100 M10 B-1222 + R-M10S-10: `upgrades` (ability keys, one per bought cell) rides through — a re-entered
  // sheet's and an OggDude import's purchased cells. A fresh creation's
  // entry carries none, so it still persists `upgrades: []`.
  function powersFromCreatorState(forcePowersMap) {
    return Object.keys(forcePowersMap || {}).map(function (id) {
      var e = forcePowersMap[id], ups = (e && Array.isArray(e.upgrades)) ? e.upgrades.slice() : [];
      // F-100 M12 R-M12B-78: the grant marker rides through as written (absent stays absent, so no save changes shape)
      if (e && (e.granted != null || e.granted_upgrade != null)) {
        var marked = { id: id, basic: true, upgrades: ups };
        if (e.granted != null) marked.granted = e.granted;
        if (e.granted_upgrade != null) marked.granted_upgrade = e.granted_upgrade;
        return _withOwned(marked, e);
      }
      return _withOwned({ id: id, basic: true, upgrades: ups }, e);
    });
  }

  // ── F-100 M12 THE GRANT MARKER (f100-m12-build-card ADDENDUM 25, R-M12B-78/79; B-1246) ──────────────────────────────────
  // A FREE creation pick (Career Powers) is marked `granted` ("career" | "bonus" | "both"); the double pick's one free
  // upgrade is `granted_upgrade`. forcePowerGrantProblems is the SHAPE check (contract (i)): an unknown `granted`, or a
  // `granted_upgrade` without `granted: "both"` or absent from `upgrades`, is refused by name. `both` without a
  // `granted_upgrade` is an unclaimed free upgrade — read as none, not refused. _grantOf is what the readers act on: they
  // key on `granted`, NEVER on `cost: 0` (contract (ii): a cost-0 entry without `granted` reads as before), and a refused
  // upgrade marker frees nothing. KEY-INDEPENDENT (R-M12B-79): a saved grant is a fact about how the character was built;
  // the key never re-prices it. The WRITER (the free-pick screen) is the surfacing mission's (R-M12B-80).
  var GRANT_KINDS = { career: true, bonus: true, both: true };
  function _upgradeKey(u) { return (u && typeof u === 'object') ? u.key : u; }
  function forcePowerGrantProblems(entry) {
    var bad = [];
    if (!entry || typeof entry !== 'object') return bad;
    if (entry.granted != null && !Object.prototype.hasOwnProperty.call(GRANT_KINDS, entry.granted)) bad.push('granted ' + JSON.stringify(entry.granted) + ' is not career | bonus | both');
    if (entry.granted_upgrade != null) {
      if (entry.granted !== 'both') bad.push('granted_upgrade ' + JSON.stringify(entry.granted_upgrade) + ' without granted "both"');
      var ups = Array.isArray(entry.upgrades) ? entry.upgrades : [];
      if (!ups.some(function (u) { return _upgradeKey(u) === entry.granted_upgrade; })) bad.push('granted_upgrade ' + JSON.stringify(entry.granted_upgrade) + ' is not in upgrades');
    }
    return bad;
  }
  // ── R7 B-1536 THE BOUGHT CELLS (ruling release-r7-bug-burndown ADDENDUM 269, R-Y2-1; the talent / signature-ability idiom) ─
  // A Force power entry MAY carry `owned: ['row-col', …]` beside `upgrades`: the bought upgrade cells (row ≥ 1), one per
  // element of `upgrades`, in the same order, each cell's ability its key. Absent means today (tree-order pricing). A
  // MISMATCH (a length differing from `upgrades`, a cell outside the tree or whose ability is not its key, a duplicate
  // cell) also reads as absent, never a refusal of the save: forcePowerOwnedProblems is the ONE check, _ownedCells the read
  // forcePowerEntryXp (the ONE pricer) acts on. Carriers copy `owned` whole (_withOwned).
  function _withOwned(out, src) { if (src && Array.isArray(src.owned)) out.owned = src.owned.slice(); return out; }
  function _forceCellAt(tree, pos) {
    var m = /^(\d+)-(\d+)$/.exec(String(pos || '')); if (!m) return null;
    var r = +m[1], c = +m[2], row = tree && tree[r];
    if (r < 1 || !row) return null;
    return ((row.cells) || []).filter(function (x) { return x && x.col === c && x.ability; })[0] || null;
  }
  function forcePowerOwnedProblems(entry, tree) {
    var bad = [];
    if (!entry || typeof entry !== 'object' || entry.owned == null) return bad;
    var own = entry.owned, ups = Array.isArray(entry.upgrades) ? entry.upgrades : [];
    if (!Array.isArray(own)) return ['owned is not a list'];
    if (own.length !== ups.length) bad.push('owned holds ' + own.length + ' cell(s) for ' + ups.length + ' upgrade(s)');
    var seen = {};
    own.forEach(function (pos, i) {
      if (seen[pos]) bad.push('owned repeats ' + JSON.stringify(pos)); seen[pos] = true;
      var cell = _forceCellAt(tree, pos);
      if (!cell) bad.push('owned ' + JSON.stringify(pos) + ' is no upgrade cell of the tree');
      else if (i < ups.length && cell.ability !== _upgradeKey(ups[i])) bad.push('owned ' + JSON.stringify(pos) + ' is ' + cell.ability + ', not ' + _upgradeKey(ups[i]));
    });
    return bad;
  }
  function _ownedCells(entry, tree) {
    if (!entry || !Array.isArray(entry.owned) || !entry.owned.length || forcePowerOwnedProblems(entry, tree).length) return null;
    return entry.owned.map(function (pos) { return _forceCellAt(tree, pos); });
  }
  function _grantOf(entry) {
    var g = { basicFree: false, freeUpgrade: null };
    if (!entry || typeof entry !== 'object' || entry.granted == null) return g;
    if (!Object.prototype.hasOwnProperty.call(GRANT_KINDS, entry.granted)) return g;
    g.basicFree = true;
    if (entry.granted === 'both' && entry.granted_upgrade != null && !forcePowerGrantProblems(entry).length) g.freeUpgrade = entry.granted_upgrade;
    return g;
  }

  // F-100 M10 B-1222 (ruling f100-m10-build-card step 11) — THE XP a creator-map power entry holds: its basic `cost`
  // (10 when absent, as before) plus each bought upgrade's CELL cost, read from the view's tree (`charbuild.forcePowers`,
  // the stamp view on re-entry). ONE function: normalizeCreated (the save) and the creator's live bar sum through it.
  // A key bought n times takes its first n cells in tree order (a ranked upgrade, e.g. Heal/Harm Magnitude ×2); a
  // purchase past the tree's cells re-prices at that key's last cell; a key the view's tree does not hold costs 0
  // (a held sheet never reaches re-entry: sheetHoldOf).
  // F-100 M12 B-1246 (ruling f100-m12-census-card R-M12C-88; f100-m12-build-card §4 step 4) — THE ONE BASIC PRICE of a Force
  // power: its canonical tree's row-0 cell cost (5–20 XP, FaD p.285), or null when the record carries none (a registry bug,
  // which the app's basicForcePowerCost makes loud and refuses to charge). Every price of a basic power asks here: the app's
  // basicForcePowerCost (the creator's buy, its list, the guided seed and the sheet's advancement) and re-entry
  // (deleted, R-M13B-103). Before this, the creator's handleForcePowerBuy and re-entry each read row 0 inline, so
  // one quantity had three readers (PRAXIS §5).
  // `ctx` (optional) = careerPowerPriceCtx's answer, the sheet's only: F-100 M12 Career Powers' MENTOR DISCOUNT (R-M12C-87),
  // the BOOK's rule reused — FaD Core p.109: a PC buying a Force power's basic form may take 5 XP off its cost; this
  // does not cover upgrades, and only counts once the
  // character's starting XP is spent at creation (Disciples of Harmony p.75 points to it). The primer
  // (p.4) names its trigger: a power among "all career powers that the character has" (careerPowersOf). The four SILENT
  // points are encoded as nothing beyond the page: no stacking, no floor, no invented upgrade pick. With no ctx (the
  // creator, the guided seed), the price is row 0's.
  //
  // R6 lane D (ruling `release-r6-bases-registry` Q4/Q5; R-R6PC-2 read 2): the GROUP's Mentor rides the same ctx as
  // `groupMentor` (the kind, partyStore.mentorKind). It is the BOOK's rule:
  //   jedi      FaD Core p.109: every basic power −5, no floor;
  //   baran_do  Disciples of Harmony p.79: Foresee, Move, Protect/Unleash basic −5, to a minimum of 5;
  //   findsmen  Disciples of Harmony p.80: Foresee and Seek basic −5, to a minimum of 5 (Jason's page read, D-376; its
  //             upgrade half is a board row);
  //   sith      Disciples of Harmony p.80: Heal/Harm, Misdirect, Protect/Unleash basic −15, to a minimum of 5 (ruling
  //             ADDENDUM 1, read from the render); dagoyan discounts upgrades only — no basic arm (Q4).
  // The traditions REPLACE the core benefit (DoH p.79), so a group has one kind. D-372 (Jason): a power that is BOTH a
  // reSpecialized career power and under the group Mentor takes ONE −5 — the discounts do not add.
  function forcePowerBasicCost(rec, ctx) {
    var cell = rec && rec.tree && rec.tree[0] && rec.tree[0].cells && rec.tree[0].cells[0];
    var cost = (cell && cell.cost != null) ? cell.cost : null;
    if (cost == null || !ctx || !ctx.afterCreation) return cost;
    var career = (Array.isArray(ctx.careerPowers) && ctx.careerPowers.indexOf(rec.id) !== -1) ? MENTOR_DISCOUNT_XP : 0;
    var m = ctx.groupMentor && Object.prototype.hasOwnProperty.call(GROUP_MENTORS, ctx.groupMentor) ? GROUP_MENTORS[ctx.groupMentor] : null;
    var mentor = (m && (!m.powers || m.powers.indexOf(rec.id) !== -1)) ? m.off : 0;
    var off = Math.max(career, mentor);                  // D-372: one discount, never added
    if (!off) return cost;
    var floor = (m && mentor === off) ? m.floor : 0;
    return Math.max(cost - off, Math.min(cost, floor));
  }
  var MENTOR_DISCOUNT_XP = 5;   // FaD Core p.109
  var GROUP_MENTORS = {
    jedi: { off: 5, powers: null, floor: 0 },                                         // FaD Core p.109
    baran_do: { off: 5, powers: ['foresee', 'move', 'protect_unleash'], floor: 5 },    // Disciples of Harmony p.79
    findsmen: { off: 5, powers: ['foresee', 'seek'], floor: 5 },                       // Disciples of Harmony p.80; D-376
    sith: { off: 15, powers: ['heal_harm', 'misdirect', 'protect_unleash'], floor: 5 }, // Disciples of Harmony p.80
  };

  // B-1526 (ruling release-r7-bug-burndown ADDENDUM 47): THE ONE UPGRADE PRICE of a Force power — its printed cell `cost`, less
  // the group Mentor's UPGRADE discount where its tradition prints one (Disciples of Harmony pp.79–80):
  //   dagoyan  p.79: Control upgrades on Foresee, Seek or Sense −5, to a minimum of 5;
  //   findsmen p.80: Control or Mastery upgrades on Seek −5, to a minimum of 5.
  // The core Mentor (jedi, FaD p.109) "does not apply when purchasing upgrades", and no career-power discount applies to an
  // upgrade, so every other kind prices the cell as printed. `ctx` = careerPowerPriceCtx's (the sheet's, after creation); none
  // (the creator) → the printed cell. A family the record does not name (`abilities[key].family`) is never discounted.
  function forcePowerUpgradeCost(rec, abilityKey, cost, ctx) {
    if (cost == null || !ctx || !ctx.afterCreation) return cost;
    var m = ctx && ctx.groupMentor && Object.prototype.hasOwnProperty.call(GROUP_MENTOR_UPGRADES, ctx.groupMentor) ? GROUP_MENTOR_UPGRADES[ctx.groupMentor] : null;
    var ab = rec && rec.abilities && rec.abilities[abilityKey];
    if (!m || !ab || m.powers.indexOf(rec.id) === -1 || m.families.indexOf(ab.family) === -1) return cost;
    return Math.max(cost - m.off, Math.min(cost, m.floor));
  }
  // The sheet's price: forcePowerUpgradeCost under the sheet's own ctx (careerPowerPriceCtx), so the app holds ONE ctx read.
  function sheetForcePowerUpgradeCost(sheet, charbuild, rec, abilityKey, cost) {
    return forcePowerUpgradeCost(rec, abilityKey, cost, careerPowerPriceCtx(sheet, charbuild));
  }
  var GROUP_MENTOR_UPGRADES = {
    dagoyan: { off: 5, floor: 5, powers: ['foresee', 'seek', 'sense'], families: ['control'] },   // Disciples of Harmony p.79
    findsmen: { off: 5, floor: 5, powers: ['seek'], families: ['control', 'mastery'] },          // Disciples of Harmony p.80
  };

  // ── F-100 M12 CAREER POWERS (ruling f100-m12-census-card R-M12C-86/87; f100-m12-build-card R-M12B-2; B-1235's engine half)
  // careerPowersOf(who, charbuild) → { career: [ids], bonus: [{ spec, powers } | { spec, choice }], starting: spec id | null,
  // all: [ids] } — the character's career powers (primer p.4): the career's `career_powers` pair plus every OWNED tree's
  // `bonus_career_powers` (a later tree adds its pair: the Prophet example). A CHOICE row (Padawan, Master) is returned as a
  // choice, never as a list, so `all` holds only named powers. `who` = a sheet ({careerId | career, specializationIds}) or
  // the creator's {careerId, specializationIds}; `starting` is the first tree, the one the creation pick reads ("one from the
  // STARTING tree's"). The free picks themselves are a GRANT the surfacing mission writes (D-124); this is the list they read.
  function careerPowersOf(who, charbuild) {
    var out = { career: [], bonus: [], starting: null, all: [] };
    if (!who) return out;
    var careers = (charbuild && charbuild.careers) || {}, specs = (charbuild && charbuild.specializations) || {};
    var cid = sheetCareerId(who, careers), crec = cid ? careers[cid] : null;
    var add = function (id) { if (out.all.indexOf(id) === -1) out.all.push(id); };
    if (crec && Array.isArray(crec.career_powers)) { out.career = crec.career_powers.slice(); out.career.forEach(add); }
    (Array.isArray(who.specializationIds) ? who.specializationIds : []).forEach(function (sid, i) {
      if (i === 0) out.starting = sid;
      var b = specs[sid] && specs[sid].bonus_career_powers;
      if (Array.isArray(b)) { out.bonus.push({ spec: sid, powers: b.slice() }); b.forEach(add); }
      else if (b && typeof b === 'object') out.bonus.push({ spec: sid, choice: { choose: b.choose, count: b.count, upgrade_if_owned: b.upgrade_if_owned } });
    });
    return out;
  }
  // The sheet's price context for forcePowerBasicCost: its career powers, after creation (a saved sheet is past creation by
  // construction).
  // R6 lane D: the group's Mentor kind joins it (`groupMentor`).
  function careerPowerPriceCtx(sheet, charbuild) {
    var gm = groupGrants(sheet).mentor;
    var kind = gm && (Object.prototype.hasOwnProperty.call(GROUP_MENTORS, gm) || Object.prototype.hasOwnProperty.call(GROUP_MENTOR_UPGRADES, gm)) ? gm : null;   // B-1526: dagoyan's arm is upgrades only
    var ctx = { careerPowers: careerPowersOf(sheet, charbuild).all, afterCreation: true };
    if (kind) ctx.groupMentor = kind;
    return ctx;
  }

  // ── F-100 M12 CAREER ATTRIBUTES (R-M12C-79 shape B, R-M12C-100; Docs/briefs/f100-m12-gate-table.md §4) ─────────────────
  // careerEffectsOf(who, charbuild) → the career record's `effects` rows ([] for a career with none — every shipped
  // career). Each row is checked by the ONE effect checker (_checkEffect: an op or `when` the engine does
  // not implement throws). careerEffectBonuses folds the rows with no `when` into derivedBonuses' keys; computeDerived
  // evaluates the `when` rows against the live armour beside the conditional talents. A career has no ranks: each row
  // counts once.
  function careerEffectsOf(who, charbuild) {
    if (!who) return [];
    var careers = (charbuild && charbuild.careers) || {}, cid = sheetCareerId(who, careers), rec = cid ? careers[cid] : null;
    var effs = (rec && Array.isArray(rec.effects)) ? rec.effects : [];
    effs.forEach(function (e) { _checkEffect('career ' + cid, e); });
    return effs;
  }
  function careerEffectBonuses(who, charbuild, _rows) {
    var b = { soakBonus: 0, woundThresholdBonus: 0, strainThresholdBonus: 0, meleeDefenseBonus: 0, rangedDefenseBonus: 0 };
    careerEffectsOf(who, charbuild).forEach(function (e) {
      if (e.when != null) return;
      var key = e.op === 'defense_delta' ? (e.target === 'melee' ? 'meleeDefenseBonus' : 'rangedDefenseBonus') : EFFECT_DELTA_BONUS[e.op];
      if (!key || !Object.prototype.hasOwnProperty.call(b, key)) _unimplementedEffect('career', e, 'op on a career');
      b[key] += Number(e.amount) || 0;
      if (_rows) _rows.push({ key: key, op: e.op, amount: Number(e.amount) || 0 });
    });
    return b;
  }
  // careerXpAdjustment(careerRec) → the career's `xp_adjustment` (the one flat field; OggDude's Attributes `Experience`), a
  // delta on the creation XP pool beside the mechanic's and the species option's. 0 when absent.
  function careerXpAdjustment(careerRec) {
    if (!careerRec) return 0;
    return Number(careerRec.xp_adjustment) || 0;
  }
  // F-100 B-1264 (ruling f100-surfacing-creator-concept R-SCC-4; ADDENDUM 11, brief §3.2, ADDENDUM 18 D1): THE ONE CREATION XP
  // POOL. normalizeCreated (the save) and the creator's live bar (useFullCreatorController's xpPool) both read it; before this
  // each summed its own four terms. The species' effective starting_xp (100 with no record) under the SAVE's picks
  // (`speciesOption.picks`), the mechanic's trade XP, the chosen species option's XP delta (B-22), and the career's
  // `xp_adjustment` (dark, 0 OFF) — the career keyed as normalizeCreated's careerId read keys it (the key, else the
  // collision-aware name index), so the pool and the saved careerId always name the same record.
  function _creationCareerRec(character, charbuild) {
    var c = character && character.career, careers = (charbuild && charbuild.careers) || {};
    if (!c) return null;
    if (c.key && careers[c.key]) return careers[c.key];
    var hit = buildNameIndex(careers).byName[(c.name || '').trim().toLowerCase()];
    return typeof hit === 'string' ? careers[hit] : null;
  }
  function creationXpPool(character, speciesData, charbuild) {
    character = character || {};
    var eff = speciesEffective(speciesData, character.speciesOption && character.speciesOption.picks);
    return (speciesData ? eff.starting_xp : 100)
      + (character.mechanic ? (character.mechanic.xpAdjustment || 0) : 0)
      + (character.speciesOption ? (character.speciesOption.xp || 0) : 0)   // B-22: chosen-option XP (Gand lunged +10)
      + careerXpAdjustment(_creationCareerRec(character, charbuild));
  }
  // F-100 M12 R-M12B-78 (iii): a GRANTED basic costs 0 and the first `granted_upgrade` occurrence is uncharged; a second
  // purchase of that key pays its next cell (the occurrence count includes the granted one). Keyed on `granted` (_grantOf).
  // `ctx` (F-100 M13, the sheet's price): each upgrade priced through forcePowerUpgradeCost, as the sheet's own buy is. None = the printed cell.
  function forcePowerEntryXp(id, entry, charbuild, ctx) {
    var grant = _grantOf(entry);
    var total = grant.basicFree ? 0 : ((entry && entry.cost) || 10);
    var ups = (entry && Array.isArray(entry.upgrades)) ? entry.upgrades : [];
    if (!ups.length) return total;
    var pRec = ((charbuild && charbuild.forcePowers) || {})[id] || {}, tree = pRec.tree || [], cells = {};
    tree.forEach(function (row, r) {
      if (r === 0) return;                                   // row 0 is the basic power, priced by `cost`
      ((row && row.cells) || []).forEach(function (c) { if (c && c.ability) (cells[c.ability] = cells[c.ability] || []).push(Number(c.cost) || 0); });
    });
    var seen = {}, freeLeft = grant.freeUpgrade, at = _ownedCells(entry, tree);   // R7 B-1536: a valid `owned` prices each cell
    ups.forEach(function (u, i) {
      var key = _upgradeKey(u), list = cells[key];
      if (!list || !list.length) return;
      var n = seen[key] = (seen[key] || 0) + 1;
      if (freeLeft != null && key === freeLeft) { freeLeft = null; return; }   // the double pick's free upgrade
      total += forcePowerUpgradeCost(pRec, key, at ? (Number(at[i].cost) || 0) : list[Math.min(n, list.length) - 1], ctx);
    });
    return total;
  }
  // B-1038 / B-1537 (ruling release-r7-bug-burndown ADDENDUM 21, R-RRD-1): THE ONE SPECIALIZATION SUMMER — every
  // specialization after the first, priced by costForNewSpec in owned order (ownedCount = its index; EotE p.102/p.284).
  // The derived sum had no such term, so every re-derivation (import, re-entry) dropped the bought trees. The creator's
  // live bar and normalizeCreated read this; advancement's buyNewSpec adds the same price to the STORED spent (not a
  // re-derivation). An id the view lacks is skipped (it prices nothing it cannot read).
  function specializationsSpend(character, charbuild) {
    var keys = ((character && character.specializations) || []).map(function (s) { return s && s.key; });
    var reg = (charbuild && charbuild.specializations) || {};
    var career = _creationCareerRec(character, charbuild), sum = 0;
    keys.forEach(function (k, i) { if (i > 0 && k && reg[k]) sum += costForNewSpec(reg[k], i, career); });
    return sum;
  }
  function forcePowersXp(forcePowersMap, charbuild) {
    return Object.keys(forcePowersMap || {}).reduce(function (s, id) { return s + forcePowerEntryXp(id, forcePowersMap[id], charbuild); }, 0);
  }

  // ── migration (legacy saved display shapes → id-refs; D-CB2 + D-3B4) ─
  // Returns { value, changed }. Anything not matched with certainty stays AS-IS, marked
  // _legacy (never dropped, never guessed).
  // B-977 C1 (ruling `release-r7-bug-burndown` ADDENDUM 93): IDEMPOTENT. An entry a past pass already MARKED, and that
  // still does not resolve, is kept exactly as it is (the same object: keys, order, no re-mark) and is NOT a change. It used
  // to be re-marked on every pass, so `migrateRoster` re-stamped its record on every call; once the migration ran on every
  // landing, two tabs or two devices re-stamped each other forever. A marked entry the registry NOW resolves still
  // migrates (the lookup runs first), and that change is real.
  function _isMarkedLegacy(e) { return !!(e && typeof e === 'object' && e._legacy === true); }
  function migrateSheetTalents(list, talentReg) {
    if (!Array.isArray(list) || list.length === 0) return { value: list, changed: false };
    var index = buildNameIndex(talentReg);
    var counts = {}, order = [], legacyByName = {};
    var alreadyCanonical = [];
    list.forEach(function (e) {
      if (isCanonicalTalentEntry(e)) { alreadyCanonical.push(e); return; }
      var name = typeof e === 'string' ? e : (e && e.name || '');
      var lc = name.trim().toLowerCase();
      if (!counts[lc]) { counts[lc] = { n: 0, entries: [] }; order.push(lc); }
      counts[lc].n += 1;
      counts[lc].entries.push(e);
    });
    if (order.length === 0) return { value: list, changed: false };
    var out = alreadyCanonical.slice(), changed = false;
    order.forEach(function (lc) {
      var group = counts[lc];
      var id = lookupByName(index, lc);
      var rec = id ? talentReg[id] : null;
      // duplicates of an UNRANKED talent are a data anomaly — preserve, don't collapse
      if (rec && (group.n === 1 || rec.ranked)) {
        out.push({ id: id, rank: group.n });
        changed = true;
      } else {
        group.entries.forEach(function (e) {
          if (_isMarkedLegacy(e)) { out.push(e); return; }   // B-977 C1: already marked, still unresolved — kept as is
          out.push(typeof e === 'string' ? { name: e, _legacy: true } : Object.assign({ _legacy: true }, e));
          changed = true;   // marking is a write
        });
      }
    });
    return { value: out, changed: changed };
  }

  function migrateSheetForcePowers(list, powerReg) {
    if (!Array.isArray(list) || list.length === 0) return { value: list, changed: false };
    var index = buildNameIndex(powerReg);
    var out = [], changed = false;
    list.forEach(function (e) {
      if (isCanonicalPowerEntry(e)) { out.push(e); return; }
      var name = typeof e === 'string' ? e : (e && e.name || '');
      var id = lookupByName(index, name);
      var rec = id ? powerReg[id] : null;
      if (!rec) {
        if (_isMarkedLegacy(e)) { out.push(e); return; }   // B-977 C1: already marked, still unresolved — kept as is
        out.push(typeof e === 'string' ? { name: e, _legacy: true } : Object.assign({ _legacy: true }, e));
        changed = true;
        return;
      }
      // upgrades migrate by ability KEY only — atomic: one miss keeps the whole entry legacy
      var ups = (e && Array.isArray(e.upgrades)) ? e.upgrades : [];
      var keys = [], ok = true;
      ups.forEach(function (u) {
        var k = (typeof u === 'string' ? u : (u && u.key || '')).toLowerCase();
        if (k && (rec.abilities || {})[k]) keys.push(k);
        else ok = false;
      });
      if (!ok) {
        if (_isMarkedLegacy(e)) { out.push(e); return; }   // B-977 C1: the same miss as last pass — kept as is
        out.push(Object.assign({ _legacy: true }, e));
        changed = true;
        return;
      }
      out.push(_withOwned({ id: id, basic: true, upgrades: keys }, e));   // R7 B-1536: `owned` copied whole
      changed = true;
    });
    return { value: out, changed: changed };
  }

  // Additive id-refs for the sheet's name-string fields (D-3B2: ids land NEXT TO the strings;
  // the strings retire at 3c). charbuild: { species, careers, specializations, talents, forcePowers }.
  function migrateSheet(sheet, charbuild) {
    if (!sheet || typeof sheet !== 'object' || !charbuild) return { value: sheet, changed: false };
    var changed = false;
    var t = migrateSheetTalents(sheet.talents, charbuild.talents || {});
    var p = migrateSheetForcePowers(sheet.forcePowers, charbuild.forcePowers || {});
    if (t.changed) { sheet.talents = t.value; changed = true; }
    if (p.changed) { sheet.forcePowers = p.value; changed = true; }
    if (!sheet.careerId && sheet.career) {
      var cid = lookupByName(buildNameIndex(charbuild.careers || {}), sheet.career);
      if (cid) { sheet.careerId = cid; changed = true; }
    }
    if (!sheet.speciesId && sheet.species) {
      // ── R-MRN-2 — THE WRITING SEAM MUST NOT GUESS (ruling `menagerie-rename-name-resolution`) ──
      // STRICT index here, NOT `speciesNameIndex`. The difference is one option and it decides
      // whether a wrong answer is temporary or permanent.
      //
      // `speciesNameIndex` is incumbent-wins: with three records named "Ewok" it returns whichever
      // the registry lists first. That is tolerable at a READ (wrong today, corrected when
      // `species-name-precedence` lands, and nothing is written down) and intolerable HERE, because
      // this line PERSISTS its answer onto the player's saved character. A guess written into a save
      // is a silent one-way migration onto another publisher's stat block — the A-MSP-2 renames made
      // 117 names deliberately ambiguous, so this seam would have re-homed an unknown number of
      // legacy saves on their next open.
      //
      // `buildNameIndex` with no options sets `byName[n] = false` for a homonym — "a homonym is NO
      // match, never a guess" — so `lookupByName` returns null, nothing is stamped, and the save
      // stays name-keyed and stays CONVERTIBLE. Refusing to write is the graceful, reversible branch;
      // writing a guess is neither.
      //
      // R-MRN-3: the five READ paths are deliberately untouched and still resolve incumbent-wins.
      // Flipping them strict here would turn "possibly the wrong species" into "no species at all"
      // for that same legacy population — a product-visible regression, and not this lap's to make.
      // …AND THE AMBIGUITY TEST USES THE APP'S OWN NOTION OF "THE SAME NAME". `buildNameIndex` keys
      // on `trim().toLowerCase()`, which treats "Pau'an" and "Pau’an" as two different species — but
      // the shelf does not: `sources.dedupeName` collapses the typographic apostrophe because the two
      // are one character in two encodings (we ship `'`, the Complete Species Guide prints `’`), and
      // the browser therefore shows ONE Pau'an row. Strict-mode alone let exactly those two names
      // through — measured, 2 of 117 — and each would have stamped whichever encoding the save's
      // string happened to match, which can be the record the list never shows. Same hazard, quieter
      // spelling. R-MRN-2 binds the OUTCOME ("no ambiguous name is ever written"), and leaves the
      // mechanism here, so the test is applied on the collapsed key rather than the raw one.
      // Deliberately LOCAL to this writing seam: `buildNameIndex` is shared with careers, specs,
      // talents and force powers, and changing its key for all of them is not this lap's to do.
      var __specReg = charbuild.species || {};
      var __wanted = speciesKey(sheet.species);
      var __hits = [];
      Object.keys(__specReg).forEach(function (id) {
        if (speciesKey(__specReg[id] && __specReg[id].name) === __wanted) __hits.push(id);
      });
      if (__wanted && __hits.length === 1) { sheet.speciesId = __hits[0]; changed = true; }
    }
    if (!sheet.specializationIds && sheet.specialization) {
      var spid = lookupByName(buildNameIndex(charbuild.specializations || {}), sheet.specialization);
      if (spid) { sheet.specializationIds = [spid]; changed = true; }
    }
    // B-1651: a save that bought a tree before the fix lacks its id. Append it (ownedSpecIds). A complete record is untouched.
    var specIds = ownedSpecIds(sheet.specializationIds, sheet.specializations);
    if (specIds !== sheet.specializationIds) { sheet.specializationIds = specIds; changed = true; }
    return { value: sheet, changed: changed };
  }

  // Roster records: [{ …, sheetData }] (the localStorage 'swrpg_saved_characters' list).
  // A MIGRATION IS NOT AN EDIT: it never moves `updatedAt`, stamped or not (ruling `release-r7-bug-burndown`
  // ADDENDUM 453, superseding C-B-8.1 here). Only a user's edit moves the clock. A migrated copy that loses a
  // merge is re-migrated on the winner at landing (ADDENDUM 81); one that won on a minted stamp destroyed a
  // real edit made on another device (Docs/SYNC_RECENCY_AUDIT.md's own reading of these writes).
  function migrateRoster(list, charbuild) {
    if (!Array.isArray(list) || !charbuild) return { value: list, changed: false };
    var changed = false;
    list.forEach(function (rec) {
      if (rec && rec.sheetData && migrateSheet(rec.sheetData, charbuild).changed) changed = true;
    });
    return { value: list, changed: changed };
  }

  // ── talent derived-effects map (CS-4 / R-CS4b) — NOW THE OLD-DATA FALLBACK ONLY ──────────
  // F-100 (rulings `f100-effects-census` §6, `f100-effects-grammar-contracts` R-FEGC-1): a talent's
  // effects are DATA — `talents.json` `effects[]` (charbuild-common $defs/effect), read through the
  // charbuild registry by `talentEffectsOf` below. This frozen table survives ONLY for a record that
  // carries no `effects[]` (an overlay twin such as `respec_grit`, or a pack served before the
  // grammar lap) — R-F100-5 "the respec_ fallback KEPT", with its retirement row. It is never the
  // answer for a code path that simply forgot the registry: that path THROWS (charter §8 loud).
  // test/talent_effects.cjs holds a byte-copy of this table as the ORACLE the registry must match.
  // Cited at printed pages in Docs/RULES_FOUNDATION_ADVANCEMENT.md.
  var TALENT_DERIVED_EFFECTS = {
    grit:              { bonus: 'strainThresholdBonus', amount: 1, ranked: true },   // eote p.136
    toughened:         { bonus: 'woundThresholdBonus',  amount: 2, ranked: true },   // eote p.145
    enduring:          { bonus: 'soakBonus',            amount: 1, ranked: true },   // eote p.135
    sixth_sense:       { bonus: 'rangedDefenseBonus',   amount: 1, ranked: false },  // eote p.142 (flat)
    superior_reflexes: { bonus: 'meleeDefenseBonus',    amount: 1, ranked: false },  // eote p.144 (flat)
    force_rating:      { bonus: 'forceRatingBonus',     amount: 1, ranked: true },   // eote p.277 (R-FR1): +1 Force Rating / rank — was a 38-cell live gap (bought → nothing)
    dedication:        { characteristic: 1, ranked: true },                          // eote p.134, +1 chosen char, cap 6
    // Equipment-CONDITIONAL (R-CS4d): effect depends on LIVE armor, so NOT summed into derivedBonuses —
    // persisted as owned-id flags (sheet.derivedConditional) and applied in computeDerived against the
    // resolved armor. Both passive + unranked (flat, no stacking).
    armor_master:          { conditional: 'armored',   soak: 1 },                     // eote p.132: +1 soak while wearing armor
    armor_master_improved: { conditional: 'armorSoak2', meleeDef: 1, rangedDef: 1 },  // eote p.132: +1 melee+ranged def while armor soak>=2
  };
  // AN OVERLAY TWIN RESOLVES TO ITS CANONICAL EFFECT. GAME VARIANTS packs ship their own copies of
  // talents under a prefixed id (`respec_grit` is "Grit", "+1 strain threshold", ranked — mods.js:
  // "overlay ids are respec_*", R-F9-3), and the table above is keyed by the CANONICAL id. Looked up
  // raw, `respec_grit` matched nothing and a reSpecialized character who bought Grit gained no strain
  // threshold — silently, on the 51 (eote) + 66 (aor) tree cells that carry it. Found by the
  // exception census's OVERLAY-TWIN check, which now pins that an overlay twin and its canonical
  // twin grant the same bonus. One normaliser, used by every lookup below; a prefix is stripped
  // ONLY when the stripped id is a table entry, so an overlay original (`respec_opp`) stays inert.
  var OVERLAY_ID_PREFIXES = ['respec_'];
  function derivedEffectOf(id) {
    if (id == null) return undefined;
    var e = TALENT_DERIVED_EFFECTS[id];
    if (e) return e;
    for (var i = 0; i < OVERLAY_ID_PREFIXES.length; i++) {
      var p = OVERLAY_ID_PREFIXES[i];
      if (String(id).indexOf(p) === 0) { e = TALENT_DERIVED_EFFECTS[String(id).slice(p.length)]; if (e) return e; }
    }
    return undefined;
  }
  var CHARACTERISTIC_CAP = 6;  // eote p.134 (Dedication) + the general in-play cap

  // ── F-100 effects grammar — THE ONE READER of a talent's effects (R-FEGC-1) ─────────────────
  // The op vocabulary is charbuild-common $defs/effect's, closed at seven; the `when` vocabulary is
  // closed at two. An op or `when` this engine does not implement THROWS — a record the engine
  // cannot apply must never be silently read as "no effect" (R-F100-9: nothing enters the palette
  // without its resolver arm and guard row).
  var EFFECT_OPS = ['soak_delta', 'wound_threshold_delta', 'strain_threshold_delta', 'defense_delta',
                    'force_rating_delta', 'force_rating_floor', 'characteristic_delta',
                    // F-100 M7 C1 (R-M7K-1/2): the two SKILL ops. They move no number — their resolver arms are
                    // careerSkillStatus and skillCharacteristic; the number folds below skip them by name.
                    'career_skill', 'skill_characteristic',
                    // F-100 M8 M2 (f100-m8-batches R-M8BG-233): skill_substitute moves no number either; its arm is
                    // skillCharacteristicsOf's `substitutes`, offered at the roll (applies: reminder).
                    'skill_substitute',
                    // F-100 M9 (R-M9S-5): the two species-only number ops. Each has ONE reader of its own — computeEncumbrance's
                    // species delta and startingCredits — so the derived-bonus fold skips them by name (no NaN, a guard leg).
                    'encumbrance_threshold_delta', 'starting_credits_delta'];
  var SKILL_EFFECT_OPS = { career_skill: true, skill_characteristic: true, skill_substitute: true };
  var OWN_READER_EFFECT_OPS = { encumbrance_threshold_delta: true, starting_credits_delta: true };
  var EFFECT_DELTA_BONUS = { soak_delta: 'soakBonus', wound_threshold_delta: 'woundThresholdBonus',
                             strain_threshold_delta: 'strainThresholdBonus', force_rating_delta: 'forceRatingBonus' };
  var CHAR_ABBR_OF = { brawn: 1, agility: 1, intellect: 1, cunning: 1, willpower: 1, presence: 1 };
  function _unimplementedEffect(id, e, why) {
    throw new Error('charResolve: talent `' + id + '` carries an effect this engine does not implement (' +
                    why + '): ' + JSON.stringify(e) + ' — an op enters only with its resolver arm (R-F100-9)');
  }
  function _checkEffect(id, e) {
    if (!e || EFFECT_OPS.indexOf(e.op) === -1) _unimplementedEffect(id, e, 'op');
    if (e.op === 'defense_delta' && e.target !== 'melee' && e.target !== 'ranged') _unimplementedEffect(id, e, 'defense target');
    if (e.when != null && e.when !== 'armored' && e.when !== 'armor_soak_2') _unimplementedEffect(id, e, 'when');
    if (e.op === 'skill_characteristic' && e.to !== 'chosen' && !CHAR_ABBR_OF[e.to]) _unimplementedEffect(id, e, 'characteristic');
    return e;
  }
  // The frozen table's entry for `id` (respec_ normaliser included), spelled as effect records, so
  // ONE evaluator serves the registry and the old-data fallback alike. Translation is 1:1 with the
  // applier's SEED (scripts/canonical/apply_talent_effects.py); the 84-tuple proof pins both.
  var _FROZEN_BONUS_EFFECT = {
    soakBonus: { op: 'soak_delta' }, woundThresholdBonus: { op: 'wound_threshold_delta' },
    strainThresholdBonus: { op: 'strain_threshold_delta' }, forceRatingBonus: { op: 'force_rating_delta' },
    meleeDefenseBonus: { op: 'defense_delta', target: 'melee' }, rangedDefenseBonus: { op: 'defense_delta', target: 'ranged' },
  };
  function frozenEffectsOf(id) {
    var e = derivedEffectOf(id);
    if (!e || typeof e !== 'object') return [];
    var out = [];
    if (e.bonus) {
      var t = _FROZEN_BONUS_EFFECT[e.bonus];
      var one = { op: t.op };
      if (t.target) one.target = t.target;
      one.amount = e.amount; one.per_rank = e.ranked !== false;
      out.push(one);
    }
    if (e.characteristic) out.push({ op: 'characteristic_delta', target: 'chosen', amount: e.characteristic, per_rank: e.ranked !== false });
    if (e.conditional) {
      var when = e.conditional === 'armored' ? 'armored' : e.conditional === 'armorSoak2' ? 'armor_soak_2' : null;
      if (e.soak) out.push({ op: 'soak_delta', amount: e.soak, per_rank: false, when: when });
      if (e.meleeDef) out.push({ op: 'defense_delta', target: 'melee', amount: e.meleeDef, per_rank: false, when: when });
      if (e.rangedDef) out.push({ op: 'defense_delta', target: 'ranged', amount: e.rangedDef, per_rank: false, when: when });
    }
    return out;
  }
  // `talents` = the charbuild talent registry (id → record). REQUIRED: a call without it throws —
  // the frozen fallback answers for a RECORD without effects[], never for a caller without data.
  function _requireTalentRegistry(talents, who) {
    if (!talents || typeof talents !== 'object') {
      throw new Error('charResolve.' + who + ': no talent registry — pass the charbuild `talents` ' +
                      '(ruling f100-effects-grammar-contracts R-FEGC-1: a code path without the registry throws)');
    }
  }
  function talentEffectsOf(id, talents) {
    _requireTalentRegistry(talents, 'talentEffectsOf');
    var rec = (id != null && Object.prototype.hasOwnProperty.call(talents, id)) ? talents[id] : null;
    var effs = (rec && Array.isArray(rec.effects)) ? rec.effects : frozenEffectsOf(id);  // OLD-DATA fallback (R-F100-5)
    effs.forEach(function (e) { _checkEffect(id, e); });
    return effs;
  }
  // Witchcraft's FLOOR (R-FEC-1): the highest `force_rating_floor` amount among the owned ids, 0 when
  // none. Applied at computeDerived's seam as max(base, floor) + deltas — the floor acts on the BASE.
  function forceRatingFloorFromTalents(ownedTalentIds, talents) {
    _requireTalentRegistry(talents, 'forceRatingFloorFromTalents');
    var floor = 0;
    (Array.isArray(ownedTalentIds) ? ownedTalentIds : []).forEach(function (id) {
      talentEffectsOf(id, talents).forEach(function (e) {
        if (e.op !== 'force_rating_floor') return;
        if (e.when != null) _unimplementedEffect(id, e, 'a floor under a `when`');
        if (e.amount > floor) floor = e.amount;
      });
    });
    return floor;
  }

  // CR-RAW #2 (creation skill purchase) — THE skill-rank cost function; the sheet's ADVANCEMENT
  // and the creator's buy-ranks screen both call this (ruling creator-raw-defects-scope §3.2:
  // a second pricing path is the defect class). RAW: training a skill's next rank costs
  // 5 × the new rank for a CAREER skill; a non-career skill costs 5 more (EotE p.93 /
  // creation spending p.44). Returns null past rank 5 (the table's ceiling). Rank CAPS are the
  // caller's context: creation caps at rank 2 (EotE p.48), post-creation at 5.
  // ── B-250 — repair a NaN-poisoned XP budget on load (R-B250-1) ────────────────────────────────
  //
  // THE DAMAGE: before B-239, a missing cost slipped past a bare `availableXp < cost` (in JS
  // `100 < undefined` is FALSE), and the next line computed `availableXp - cost` — turning the
  // budget into NaN. Every later comparison against NaN is also false, so one missing cost
  // silently converted the whole budget to unlimited. B-239's `cannotAfford` now fails closed on
  // BOTH sides, which stopped the cascade and left the already-poisoned unable to transact at all.
  //
  // WHY ZERO AND NOT A RECOMPUTE. The ruled shape was originally "recompute spent from owned
  // purchases". It cannot be done: `xp.spent` counts ADVANCEMENT spend only, and the saved sheet
  // stores what a character HAS, never how they got it — `skills` is a flat rank with no creation
  // baseline, `specializations[].owned` mixes creation grants with bought talents, creation seeds
  // `forcePowers` directly, and the creation draft is not persisted at all. The costs are
  // derivable; the PURCHASES are not. A best-effort recompute would move a real player's budget
  // in either direction with a confident-looking number, which is worse than an honest zero
  // (brief `b250-recompute-is-not-derivable`; ruled R-B250-1).
  //
  // ANY non-finite field poisons the whole block: total/spent/remaining are read together, and a
  // sound-looking `total` beside a NaN `spent` is how a half-repair produces a wrong budget.
  //
  // PURE. Returns a NEW xp object; never mutates the input. Callers decide whether to persist.
  function repairPoisonedXp(xp) {
    var finite = function(v) { return typeof v === 'number' && isFinite(v); };
    if (xp && finite(xp.total) && finite(xp.spent) && finite(xp.remaining)) {
      return { repaired: false, xp: xp };          // healthy — returned BY IDENTITY, untouched
    }
    // An ABSENT xp block is not damage: a character who never advanced has none, and the
    // advancement tab already defaults it. Only a PRESENT-but-broken block is repaired, or the
    // repair marker would be stamped on every untouched character in the roster.
    if (xp == null) return { repaired: false, xp: xp };
    return { repaired: true, xp: { total: 0, spent: 0, remaining: 0 } };
  }

  function skillRankCost(newRank, inCareer) {
    if (!newRank || newRank < 1 || newRank > 5) return null;
    return newRank * 5 + (inCareer ? 0 : 5);
  }

  // ── F-100 M13 (R-M13L-8) — THE ONE PRICE CORE. Every build change the creator or Modify prices is priced here, by part, at book
  // prices (D-4); the creator's inline figures were lifted into it, and a second price path is a defect (test/f100_m13_price_core.cjs).
  //   characteristic { rank }                        reaching `rank` costs rank×10 (AoR Core p.102); refunding it returns the same
  //   skill          { rank, inCareer }              skillRankCost
  //   talent         { tree, row }                   the tree row's printed cost, else (row+1)×5
  //   specialization { rec, ownedCount, career }     costForNewSpec
  //   force_basic    { rec, ctx }                    forcePowerBasicCost
  //   force_entry    { id, entry, charbuild, ctx }   forcePowerEntryXp: a sheet entry's basic + upgrades
  //   signature      { state, charbuild, id }        an ability's owned cells (sigAbilitiesXp)
  function buildPrice(part, a) {
    a = a || {};
    switch (part) {
      case 'characteristic': return (Number(a.rank) || 0) * 10;
      case 'skill': return skillRankCost(a.rank, a.inCareer);
      case 'talent': { var row = a.tree && a.tree[a.row]; return row && row.cost != null ? row.cost : (Number(a.row) + 1) * 5; }
      case 'specialization': return costForNewSpec(a.rec, a.ownedCount, a.career);
      case 'force_basic': return forcePowerBasicCost(a.rec, a.ctx);
      case 'force_entry': return forcePowerEntryXp(a.id, a.entry, a.charbuild, a.ctx);
      case 'signature': return sigAbilitiesXp(a.state, a.charbuild).filter(function (x) { return x.id === a.id; }).reduce(function (t, x) { return t + x.xp; }, 0);
      default: throw new Error('buildPrice: unknown part ' + part);
    }
  }

  // Sum the BONUS-type effects of an owned talent-id list into a full derivedBonuses object. Repeats
  // in the list = ranks (positional ownership yields a repeat per owned instance of a ranked talent).
  // IDEMPOTENT: recompute from the whole owned list on every ownership change — no incremental drift.
  // Dedication is NOT summed here — it raises a CHOSEN characteristic (persisted into `characteristics`),
  // applied once at buy, never recomputed from ownership.
  // F-100: REGISTRY-FED — `talents` (the charbuild talent registry) is REQUIRED; each id's effects are
  // read by `talentEffectsOf` (its record's `effects[]`, or the frozen old-data fallback). Summed here:
  // the four plain deltas and defense_delta, with no `when`. NOT summed: a `when` effect (live armor,
  // computeDerived via derivedConditional), `force_rating_floor` (computeDerived's seam), and
  // `characteristic_delta` (Dedication — applied once at buy). The output shape is unchanged.
  // `_rows` (internal; derivedBecause's trace, R-SSC-1): when an array, each sum is also pushed where it is added —
  // { key, op, amount, id, times }. The sums are unchanged.
  function derivedBonusesFromTalents(ownedTalentIds, talents, _rows) {
    _requireTalentRegistry(talents, 'derivedBonusesFromTalents');
    var b = { soakBonus: 0, woundThresholdBonus: 0, strainThresholdBonus: 0, meleeDefenseBonus: 0, rangedDefenseBonus: 0, forceRatingBonus: 0 };
    // Ranks come from THE ONE COUNTER (ownedRankCounts); this function only decides what a rank is worth.
    ownedRankCounts(ownedTalentIds).forEach(function (o) {
      talentEffectsOf(o.id, talents).forEach(function (e) {
        if (e.when != null) return;
        if (e.op === 'force_rating_floor' || e.op === 'characteristic_delta' || SKILL_EFFECT_OPS[e.op] || OWN_READER_EFFECT_OPS[e.op]) return;
        // R-CS4e: a `per_rank: false` effect (an unranked talent owned in >1 tree) counts ONCE; per-rank stacks.
        var times = e.per_rank === false ? 1 : o.rank;
        var key = e.op === 'defense_delta' ? (e.target === 'melee' ? 'meleeDefenseBonus' : 'rangedDefenseBonus') : EFFECT_DELTA_BONUS[e.op];
        b[key] += e.amount * times;
        if (_rows) _rows.push({ key: key, op: e.op, amount: e.amount * times, id: o.id, times: times });
      });
    });
    return b;
  }

  // The subset of owned talents whose derived effect is EQUIPMENT-CONDITIONAL (R-CS4d). These do NOT
  // produce a flat derivedBonuses entry (their value depends on live armor) — their ids persist as
  // `sheet.derivedConditional` and computeDerived applies them against the resolved equipment. De-duped
  // (both are unranked, so a repeat is meaningless).
  function conditionalTalentsFromOwned(ownedTalentIds, talents) {
    _requireTalentRegistry(talents, 'conditionalTalentsFromOwned');
    var out = [];
    (Array.isArray(ownedTalentIds) ? ownedTalentIds : []).forEach(function (id) {
      var cond = talentEffectsOf(id, talents).some(function (e) { return e.when != null; });
      if (cond && out.indexOf(id) === -1) out.push(id);
    });
    return out;
  }

  // ── B-23: species starting talents, DERIVED at render (never persisted) ──────────────
  // The species is already on the sheet and the registry says what it grants, so the sheet
  // derives its species talents at render — the same posture as soak/defense (CS-2), so
  // errata flows and existing sheets gain their talent on next open. The ONLY thing persisted
  // is the irreproducible pick (sheet.speciesOptionPicks — G8), resolved here into its grant.
  // charbuild = the runtime canonical charbuild registry (window._canonicalCharbuild); absent →
  // [] (legacy/pre-load path renders from the persisted tree only — graceful, never a throw).
  // speciesAbilityGrants — the species' printed SPECIAL ABILITIES, resolved from the registry at
  // render (B-47 Lap A, ruling `b47-unresolved-talent-loses-its-text` §5).
  //
  // The sheet used to build its SPECIES group from `sheet.speciesAbility`, a PERSISTED DISPLAY STRING
  // — which only 3 of the 30 shipped pregens carried, so 27 of them silently omitted an ability their
  // own species record holds. That is the standing invariant broken (id-refs + resolve-at-render;
  // never persist a display shape), and B-23 had already solved it for species TALENTS while
  // abilities were left behind. This is the missing half, and it deliberately mirrors
  // speciesTalentGrants' species resolution: id first, then the name index, then a graceful [] for an
  // unresolvable legacy species.
  //
  // Whitespace is normalised HERE as well as in the data: 48 of 145 shipped `special_abilities`
  // descriptions carry newline+indent artifacts from ingest, and old saves can reach this path with
  // data we have not swept.
  function speciesAbilityGrants(sheet, charbuild) {
    if (!sheet || !charbuild || !charbuild.species) return [];
    var speciesReg = charbuild.species;
    var sid = sheet.speciesId;
    if (!sid && sheet.species) sid = lookupByName(speciesNameIndex(speciesReg), sheet.species);
    var rec = sid ? speciesReg[sid] : null;
    if (!rec) return [];   // unresolvable legacy species — graceful, the persisted string still shows

    // C-OAB-2 — a chosen variant's abilities UNION with the species', in that order.
    //
    // WHY UNION AND NOT REPLACE, since the same option's `characteristics` DO replace: the source
    // was measured, not guessed. Across every variant block in the guide there are ZERO cases where
    // a variant redefines an ability its species already has — it lists EXTRAS after the species'
    // own. A variant states a whole stat spread (an absolute, which can only replace) but adds
    // abilities. The asymmetry is deliberate; harmonising the two in either direction produces
    // wrong character sheets, and the schema says so at both fields.
    //
    // The de-dup is BELT-AND-BRACES, not a behaviour: with 0 collisions today the union is a
    // concatenation in every case that exists. It is here so a future edition that introduces one
    // cannot silently print a line twice.
    // R-SFC-2: a bought-out ability is OMITTED from the resolved sheet. The persisted entry is the
    // FACT (what the player paid for); the removal is a PROJECTION at render — the id-refs law. A
    // sheet with no `creationBuyouts` key resolves exactly as before, so old saves are untouched.
    var bought = (sheet.creationBuyouts && typeof sheet.creationBuyouts === 'object')
      ? sheet.creationBuyouts : {};
    return speciesAbilitiesResolved(rec, sheet.speciesOptionPicks)
      .filter(function (a) { return !bought[abilitySlug(a.name)]; })
      .map(function (a) {
        return {
          name: a.name,
          description: a.description,
          // origin stays 'species' for an option's ability too: a variant's ability IS a species
          // ability, and inventing a distinct display origin here would be deciding a surface.
          // C-OAB-8 — the first lap that RENDERS these differently owes a shape ruling and a mockup.
          origin: 'species',
          _ability: true,
          _path: a._path,   // A5: display-only (above)
        };
      });
  }

  // ── ONE WALK OF A SPECIES RECORD'S ABILITIES (top level + every PICKED option) ────────────────
  // Extracted from speciesAbilityGrants so the CREATOR (which holds the record and the picks, and
  // has no sheet yet) and the SHEET (which holds a sheet and the registry) read the same list
  // through the same normalisation. Two walks would be two vocabularies for one fact — the shape
  // B-124 already cost this codebase once, when the picker keyed by index and the sheet by slug.
  //
  // Whitespace is normalised here as well as in the data: 48 of 145 shipped `special_abilities`
  // descriptions carry newline+indent artifacts from ingest, and old saves reach this path with
  // data we have not swept. Name-keyed de-dup is BELT-AND-BRACES (0 collisions on today's shelf).
  // Carries `buyout_xp` / `buyout_window` through UNTOUCHED — the field is the contract (R-SFC-1),
  // and reading it here is what keeps every reader off the prose and off the name `Primitive`.
  function speciesAbilitiesResolved(rec, picks) {
    if (!rec) return [];
    var out = [];
    var seen = {};
    // A5 (ruling argo-dataset-import-draft ADDENDUM 5 Q3 (a)): `path` is where the ability sits in the record; it rides
    // the row as `_path` {id, path}, a DISPLAY-ONLY address for the imported-text accessor (SWRPGSources.ruleText). It is
    // never saved (test/argo_a5_import.cjs G3 pins it).
    function push(a, path) {
      if (!a || (!a.name && !a.description)) return;
      var name = String(a.name || 'Species Ability').replace(/\s+/g, ' ').trim();
      var key = name.toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      var r = {
        name: name,
        description: String(a.description || '').replace(/\s+/g, ' ').trim(),
        buyout_xp: a.buyout_xp,
        buyout_window: a.buyout_window,
      };
      // F-100 M9 (R-M9S-1): the ability's working rows ride through (the projection stopped whitelisting them away). Present
      // only where the ability carries them, so an ability without rows resolves to exactly the shape it always had.
      SPECIES_ROW_ARRAYS.forEach(function (k) { if (Array.isArray(a[k]) && a[k].length) r[k] = a[k]; });
      if (path && rec.id) r._path = { id: rec.id, path: path };
      out.push(r);
    }
    (rec.special_abilities || []).forEach(function (a, i) { push(a, ['special_abilities', i, 'description']); });
    var p = (picks && typeof picks === 'object') ? picks : {};
    (rec.option_choices || []).forEach(function (oc, i) {
      // Q1: every chosen option contributes. An unpicked group still grants nothing (B-19's gate),
      // and a pick naming an option that no longer exists is still dropped — both now per element.
      _chosenOptions(oc, p).forEach(function (opt) {
        var j = (oc.options || []).indexOf(opt);
        (opt.special_abilities || []).forEach(function (a, k) {
          push(a, j >= 0 ? ['option_choices', i, 'options', j, 'special_abilities', k, 'description'] : null);
        });
      });
    });
    return out;
  }

  // ── THE BUYOUT OFFERS a resolved species makes (R-SFC-1/2, R-CBC-1/2) ────────────────────────
  // The creation surface's ONLY source. Reads the FIELD `buyout_xp` off the RESOLVED ability set,
  // so:
  //   · Kamarian's offer appears only once Badlander is picked, and disappears if the pick changes
  //     — correct by construction, not by special-casing;
  //   · nothing is keyed to the ability NAME. Four names carry this offer today (Primitive, Easily
  //     Distracted, Small Comforts, Social Anxiety) and a name-keyed implementation misses FOUR of
  //     the 35 stamped records on the day it ships (R-CBC-4).
  //   · the PRICE comes from the record. Two prices are already on the shelf (10 and 5 XP), so a
  //     hard-coded 10 is wrong for Roonan and Toong today, never mind the next book.
  // `window` is carried but NOT filtered here: at creation both vocabulary values are offerable
  // ("creation" = only now; "any" = now or later). The advancement side offers NOTHING — creation-
  // only by RAW — and the window=`any` post-creation offer is a deferred lap (R-CBC-4/5).
  function speciesBuyoutOffers(rec, picks) {
    return speciesAbilitiesResolved(rec, picks)
      .filter(function (a) { return typeof a.buyout_xp === 'number' && a.buyout_xp > 0; })
      .map(function (a) {
        return {
          slug: abilitySlug(a.name),
          name: a.name,
          description: a.description,
          xp: a.buyout_xp,
          window: a.buyout_window || 'creation',   // absent = "creation" (R-CBC-1's default)
          _path: a._path,   // A5: display-only (speciesAbilitiesResolved)
        };
      });
  }

  // The ability's stable key for sheet.creationBuyouts (R-SFC-2) — slug of its name, the same idiom
  // `_groupId` uses for speciesOptionPicks. Names are unique within a species (the de-dup above
  // enforces it), so the slug is stable across a reorder, and it survives the ability's description
  // being errata'd, which an index or a prose hash would not.
  function abilitySlug(name) {
    return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }

  // The XP a character has committed to buyouts. One summer, read by the live creation budget AND
  // by the saved sheet's audit — the D-CS4-2 one-source rule, which is why the live bar and the
  // finished sheet cannot disagree about what was spent.
  function creationBuyoutSpend(buyouts) {
    if (!buyouts || typeof buyouts !== 'object') return 0;
    return Object.keys(buyouts).reduce(function (t, k) {
      var e = buyouts[k];
      return t + ((e && Number(e.xp)) || 0);
    }, 0);
  }

  function speciesTalentGrants(sheet, charbuild) {
    if (!sheet || !charbuild || !charbuild.species) return [];
    var speciesReg = charbuild.species;
    var sid = sheet.speciesId;
    if (!sid && sheet.species) sid = lookupByName(speciesNameIndex(speciesReg), sheet.species);
    var rec = sid ? speciesReg[sid] : null;
    if (!rec) return [];   // unresolvable legacy species — graceful null
    var out = [];
    // flat species grants
    (rec.starting_talents || []).forEach(function (g) {
      if (g && g.talent) out.push({ id: g.talent, rank: g.ranks || 1, origin: 'species' });
    });
    // option-picked grants (Sluissi Gearhead-vs-Solid-Repairs) — the persisted pick, resolved
    var picks = (sheet.speciesOptionPicks && typeof sheet.speciesOptionPicks === 'object') ? sheet.speciesOptionPicks : {};
    (rec.option_choices || []).forEach(function (oc) {
      _chosenOptions(oc, picks).forEach(function (opt) {
        (opt.starting_talents || []).forEach(function (g) {
          if (g && g.talent) out.push({ id: g.talent, rank: g.ranks || 1, origin: 'option' });
        });
      });
    });
    return out;
  }
  // ── R6 R-R4D-4 (card `release-r6-backend` §5): A BATTLE SCAR'S TALENT, resolved at render ──────────────────────────
  // A scar is a `sheetData.rewards` row (release-r4-shapes S2: key 'BS', `talent` the talents.json id it bought). The talent
  // is owned but sits in no tree, so it is NOT in `sheet.talents` (R-R4D-4 accepts that). It reaches the engine HERE, the one
  // character core, joining the species grants wherever "every talent the sheet owns" is read, and is never written onto the
  // sheet. A row buys one talent or one rank (S2's single `talent`; Forged in Battle p.95), so two scars on one ranked talent
  // are two ranks. Pure; a row with no talent id grants nothing.
  function scarTalentGrants(sheet) {
    var out = [];
    (Array.isArray(sheet && sheet.rewards) ? sheet.rewards : []).forEach(function (r) {
      if (r && r.key === 'BS' && typeof r.talent === 'string' && r.talent) out.push({ id: r.talent, rank: 1, origin: 'battle_scar', reward: r.id || null });
    });
    return out;
  }
  // B-1518's talent half (ruling release-r7-bug-burndown ADDENDUM 47 (a), engine only; D-378): an in-use cybernetic implant's
  // `talent_add` lines (gear.json `character_effects`; Adrenal Implant → Rapid Recovery, Lords of Nal Hutta p.106) as grants —
  // the ops droidOf lands for a droid. `talent_rank_delta` adds ranks to a talent the sheet already owns (none ship today). In
  // use = not stowed (itemInUse, R-M12B-40). The record is the stamp's item registry (_itemRecordOf).
  function implantTalentGrants(sheet, charbuild) {
    var out = [];
    var owned = ownedTreeTalentIds(sheet);
    (Array.isArray(sheet && sheet.equipment && sheet.equipment.gear) ? sheet.equipment.gear : []).forEach(function (entry) {
      if (!itemInUse('gear', entry)) return;
      var rec = _itemRecordOf(sheet, charbuild, 'gear', entry);
      if (!rec || rec.type !== 'Cybernetics' || !Array.isArray(rec.character_effects)) return;
      rec.character_effects.forEach(function (ce) {
        if (!ce || typeof ce.key !== 'string' || !ce.key) return;
        var n = Math.max(1, Math.floor(Number(ce.value) || 1));
        if (ce.op === 'talent_add' || (ce.op === 'talent_rank_delta' && owned[ce.key])) out.push({ id: ce.key, rank: n, origin: 'implant', item: rec.name || entry.id || null });
      });
    });
    return out;
  }
  // B-1039 (ruling release-r7-bug-burndown ADDENDUM 314, C1–C5): an OWNED gear item's career-skill rows (gear.json
  // `character_effects`, `$defs/item_career_skill`: Hologoggles, DoH p.49; a holocron, FaD Core p.191) →
  // [{ skill, gearId, name, scope: 'owner' | 'group' }], in equipment.gear[] order. OWNED = every entry, a STOWED one
  // included (C3: "owns", "possession" — not itemInUse, on purpose). `exclusive`: among the entries whose rows carry the
  // same key, only the FIRST grants (one pair of hologoggles at a time). Resolved at render; nothing is saved. Read by
  // careerSkillStatus (the owner, every scope) and groupGrants (another member's `scope: 'group'` rows).
  function itemCareerSkillGrants(sheet, charbuild) {
    var out = [], taken = {};
    (Array.isArray(sheet && sheet.equipment && sheet.equipment.gear) ? sheet.equipment.gear : []).forEach(function (entry) {
      var rec = _itemRecordOf(sheet, charbuild, 'gear', entry);
      var rows = (rec && Array.isArray(rec.character_effects) ? rec.character_effects : []).filter(function (ce) {
        return ce && ce.op === 'career_skill' && typeof ce.key === 'string' && ce.key;
      });
      if (!rows.length) return;
      var keys = [];
      rows.forEach(function (ce) { if (ce.exclusive && keys.indexOf(ce.exclusive) === -1) keys.push(ce.exclusive); });
      if (keys.some(function (k) { return taken[k]; })) return;
      keys.forEach(function (k) { taken[k] = true; });
      var gid = entry.id != null ? String(entry.id) : '';
      rows.forEach(function (ce) {
        out.push({ skill: ce.key, gearId: gid, name: rec.name || gid, scope: ce.scope === 'group' ? 'group' : 'owner' });
      });
    });
    return out;
  }
  // The item a career mark's `because` names ('item:<gear id>' | 'group-item:<gear id>') → its registry NAME (C7: the
  // receipt shows the record's own name, no new word), or null.
  function itemCareerSkillOwner(because, sheet, charbuild) {
    var m = /^(?:group-)?item:(.+)$/.exec(String(because || ''));
    if (!m) return null;
    var rec = _itemRecordOf(sheet || {}, charbuild, 'gear', { id: m[1] });
    return { id: m[1], name: (rec && rec.name) || m[1] };
  }
  // The talents granted at render rather than bought on a tree: the species' (B-23), the Battle Scars' (R-R4D-4) and an in-use
  // implant's (B-1518).
  function grantedTalentsAtRender(sheet, charbuild) {
    return speciesTalentGrants(sheet, charbuild).concat(scarTalentGrants(sheet), implantTalentGrants(sheet, charbuild));
  }
  // ── B-19: species SKILL grants, the FORWARD applier — pure, shared (R-SAM-1) ──────────────────
  // EXTRACTED from FullCreator's `speciesSkillGrants` (player/app.jsx) so the creator's confirm AND
  // the sheet's unanswered-choice mount resolve ONE skill-grant map through ONE function — the
  // apply-path twin of the one-component rule Lap 2a settled for the render (species-surface-concept
  // §5; a second banker is the B-124 defect). Returns `{ starting_skills } ∪ { each chosen option's
  // skill_grants }`, keyed by the SHEET key so the caller merges straight through `speciesGrantMerge`.
  //
  // Reads the picks through `_chosenOptions` — the same normalizer every other species resolver here
  // uses — NOT the raw scalar `picks[slug]` the creator read. Behaviour-identical on ALL shipped data:
  // no skill-granting group is multi-pick (census over species.json: 0 of 170 skill groups carry
  // `max_picks > 1`), so `_chosenOptions` returns exactly the one option the scalar filter did. The
  // only divergence is a future multi-pick skill group, where this sums across the picks the old
  // scalar code would have dropped — an improvement, not reachable today.
  function speciesSkillGrants(rec, picks, skillSheetKeys) {
    var out = {};
    if (!rec) return out;
    var keys = skillSheetKeys || {};
    function add(g) { if (g && g.skill) out[keys[g.skill] || g.skill] = g.rank_start || 1; }
    (rec.starting_skills || []).forEach(add);
    var p = (picks && typeof picks === 'object') ? picks : {};
    (rec.option_choices || []).forEach(function (oc) {
      _chosenOptions(oc, p).forEach(function (opt) {
        (opt.skill_grants || []).forEach(add);
      });
    });
    return out;
  }

  // The option group's stable key for sheet.speciesOptionPicks — slug of its name (reorder-proof;
  // names are unique within a species). Matches the finalize writer.
  function _groupId(oc) {
    return String((oc && oc.name) || 'group').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }

  // ── A GROUP'S PICK IS LOGICALLY A LIST (ruling `species-option-menu-multiselect-save-shape` Q1) ─
  // Droid's menu is "choose 0-3", so one id per group can no longer express every group. The shape
  // at rest is UNCHANGED for everything shipped: a scalar stays legal forever and is READ as a
  // one-element list. No saved character is rewritten, which is what the card required in words —
  // "a scalar today must read as a one-element list tomorrow without touching anyone's character".
  //
  // EVERY READER GOES THROUGH HERE AND NONE SEES A RAW VALUE. That is B-124's lesson applied before
  // the bug instead of after: that one cost this codebase a release when the picker keyed by array
  // index while the sheet keyed by slug, and the fix was one implementation for every reader.
  function _pickIdsOf(oc, picks) {
    var raw = (picks && typeof picks === 'object') ? picks[_groupId(oc)] : undefined;
    if (raw == null) return [];
    return Array.isArray(raw) ? raw.slice() : [raw];
  }

  // The chosen OPTIONS for a group, in the group's own option order — NOT the order they were
  // picked in. Order-independence is the contract property (Q2): option order is presentation, and
  // resolving in pick order would let a reorder change a character.
  // An id nobody recognises is dropped rather than treated as a reason to fall back — same rule the
  // single-pick path already applied to a stale id, now applied per element.
  function _chosenOptions(oc, picks) {
    var ids = _pickIdsOf(oc, picks);
    if (!ids.length) return [];
    return (oc.options || []).filter(function (o) {
      return o && o.id != null && ids.indexOf(o.id) !== -1;
    });
  }

  // Bounds, defaulting to pick-exactly-one when absent (Q1) — every one of the 205 shipped groups
  // predates the keys, so absence MUST keep meaning 1/1 or they all change meaning at once.
  function _pickBounds(oc) {
    var mn = (oc && oc.min_picks != null) ? oc.min_picks : 1;
    var mx = (oc && oc.max_picks != null) ? oc.max_picks : 1;
    return { min: mn, max: mx };
  }

  // ── FORK B — THE ONE PLACE A SPECIES RECORD IS RESOLVED AGAINST ITS PICKS ────────────────────
  // Ruling `csg-v7-subspecies-and-sex` (FORK B) + `csg-v7-option-characteristics-schema` (C-OCS-1):
  // an option may override the six characteristics and the two thresholds (absolute, a complete
  // replacement) and may carry an absolute `starting_xp`.
  //
  // WHY A FUNCTION AND NOT THIRTEEN PATCHES. The consumer census (ruling `csg-option-contract-inert`
  // §2.4) found 4 sheet-side reads and 9 creator-side ones, including two that SEED
  // `character.characteristics` and four that price the XP purchase ladder off the base. Patching
  // each is how the two vocabularies for one fact appear, which this codebase has already paid for:
  // B-124 hoisted `groupIdSlug` for exactly this reason after the picker keyed by array index while
  // the sheet keyed by slug. One implementation, every reader.
  //
  // XP IS DELIBERATELY HALF-DONE HERE, and that is not an omission. Q2 ruled BOTH forms legal:
  // `starting_xp` (absolute) or `xp_adjustment` (delta), never both on one option — the schema's
  // `not` clause enforces it. This returns the ABSOLUTE after any override; the DELTA keeps flowing
  // through `character.speciesOption.xp`, which B-22 built and prod-verified for Gand. Summing them
  // at the call site gives the ruled formula
  //     effectiveXp = (option.starting_xp ?? species.starting_xp) + (option.xp_adjustment ?? 0)
  // with each term read where it already lives, and migrates no shipped record.
  //
  // NO RECORDED PICK: a `preselect` group resolves to its FIRST option (ruling §4-STATES — a legacy
  // sheet predating the variant must still print a complete stat block). Every other group resolves
  // to NOTHING, which is today's behaviour and Jason's 2026-08-10 answer: Gand shows base XP 100
  // until the player chooses, because the app does not pick a drawback for anyone.
  // C-SVR-1 (ruling `species-variant-resolver` §4) — DOES A PICK CHANGE ANYTHING RESOLVED?
  // The re-seed introduced for C-OCS-4 fired on EVERY pick change, so flipping a Twi'lek's free
  // skill from Charm to Deception reset the characteristics and silently reverted XP the player had
  // spent raising them. Changing a skill pick has no characteristic consequence; it must not touch
  // them.
  //
  // R-B161G-1 — THE CLAIM THAT USED TO STAND HERE IS GONE, AND ITS EXPIRY IS THE POINT. This
  // comment read "no shipped option carries `characteristics`, so the resolved set IS the base
  // record for all N shipped species" — true when written, FALSE since the v7 re-import, which
  // ships options carrying characteristics, both thresholds and absolute XP. A present-tense claim
  // about the shelf's contents is a claim with an expiry date, and this one outlived its data
  // while reading as current. No count is restated here on purpose: the guard measures the shelf
  // (test/species_variant_resolver.cjs), and a number in a comment is a number nobody re-runs.
  //
  // The predicate lives HERE, next to the resolution it compares, so the creator cannot drift from
  // it and so a node guard can exercise the real rule rather than a copy of it. Compare the resolved
  // set BEFORE the pick against the resolved set AFTER — never against the character's CURRENT
  // characteristics, which legitimately sit above the base once XP has been spent.
  function speciesResolvedEqual(a, b) {
    if (!a || !b) return a === b;
    var ca = a.characteristics || {}, cb = b.characteristics || {};
    var attrs = ['brawn', 'agility', 'intellect', 'cunning', 'willpower', 'presence'];
    for (var i = 0; i < attrs.length; i++) {
      if ((ca[attrs[i]] || 0) !== (cb[attrs[i]] || 0)) return false;
    }
    return a.wound_threshold_base === b.wound_threshold_base
      && a.strain_threshold_base === b.strain_threshold_base
      && a.starting_xp === b.starting_xp;
  }

  // The DECISION, not just the comparison, so a guard can pin the thing the creator actually asks.
  // Keeping only `speciesResolvedEqual` here left a hole: app.jsx could hardwire its re-seed to true
  // and every node check would stay green, which is R-PM-4's family (a green that is true and about
  // something else). `prevPicks === undefined` is the confirm path, where there is no previous state
  // and seeding is the whole point.
  function speciesReseedNeeded(rec, prevPicks, nextPicks) {
    if (prevPicks === undefined) return true;
    return !speciesResolvedEqual(speciesEffective(rec, prevPicks), speciesEffective(rec, nextPicks));
  }

  // C-SVRA-2 — WHICH resolved value a pick moved, not merely WHETHER one did.
  //
  // `speciesReseedNeeded` answers a yes/no, and the creator's re-seed action answered it by
  // re-seeding ALL SIX characteristics. That is a superset of what the predicate detected: an
  // option moving only `starting_xp` or a threshold made the predicate true and reset
  // characteristics for no reason, silently reverting every XP the player had spent raising them.
  // Latent while no shipped option carried those fields; the v7 import ends that, which is where
  // this condition was bound.
  //
  // Pure and exported for the same reason `speciesGrantMerge` is: so the guard pins the rule the
  // creator actually runs rather than a lookalike re-implemented beside it.
  function speciesCharsMoved(rec, prevPicks, nextPicks) {
    if (prevPicks === undefined) return true;   // first confirm — seeding is the whole point
    var a = speciesEffective(rec, prevPicks).characteristics || {};
    var b = speciesEffective(rec, nextPicks).characteristics || {};
    var attrs = ['brawn', 'agility', 'intellect', 'cunning', 'willpower', 'presence'];
    for (var i = 0; i < attrs.length; i++) {
      if ((a[attrs[i]] || 0) !== (b[attrs[i]] || 0)) return true;
    }
    return false;
  }

  // B-147 — MERGE THE SPECIES SKILL GRANT, NEVER REPLACE THE SKILLS OBJECT.
  // `handleSpeciesConfirm` used to build a fresh object from the species grants and dispatch it as
  // `skills`; the creator's reducer replaces wholesale, so re-selecting a species threw away every
  // purchased rank, every `bought` entry, and the freeCareer / freeSpec flags the career and
  // specialisation steps had set. Latent going forwards, reachable by going back.
  //
  // The species' fixed grant lands in `purchased`, the same field a bought rank uses, so it cannot
  // be identified after the fact. `applied` is what this step last granted (the creator persists it
  // as `character.speciesGrantApplied`), so a re-confirm removes exactly that and nothing else.
  // Absent-tolerant: with no `applied` there is nothing to remove and this is identical to the old
  // replacement on a first confirm, which is why the forward flow is unchanged.
  //
  // ── R-B658-1/2 — THE ONE FLATTEN RULE: what rank does a skills-map entry carry? ────────────────
  // TWO SHAPES reach a rank read in this product, and they are not interchangeable:
  //   · the CREATOR's RECORD — {freeCareer, freeSpec, freeSpecies, purchased, bought[]} — one field
  //     per SOURCE of the rank, because the creator must be able to take each source back on its own
  //     (that is exactly what `speciesGrantMerge` below needs `purchased` for).
  //   · a SAVED SHEET's NUMBER — the rank, summed, because the sheet has no per-source undo to serve.
  // `normalizeCreated` is where the first becomes the second at save, and its inline sum WAS the only
  // statement of the rule. This is that sum, NAMED — one home, never a second copy (R-B658-2): the
  // save and the sheet-side writer `speciesAskPatch` cannot drift apart, because they call this.
  //
  // It is also the READ-side TOLERANCE the ruling's Scope asks for: a saved sheet that ALREADY carries
  // an object-shaped entry — one the species ask wrote before this fix — renders its real rank instead
  // of 0, and is flattened by the next write rather than by a migration nobody can verify.
  //
  // `purchased` goes through `Number()` where the inline expression used a bare `|| 0`: identical for
  // every numeric value any path writes, and it refuses to turn a stray string into concatenation.
  function skillRankOf(entry) {
    if (entry == null) return 0;
    if (typeof entry !== 'object') return Number(entry) || 0;
    return (entry.freeCareer ? 1 : 0) + (entry.freeSpec ? 1 : 0) + (entry.freeSpecies ? 1 : 0)
      + (Number(entry.purchased) || 0) + (entry.bought ? entry.bought.length : 0);
  }

  // Pure and exported so the guard pins the rule the creator actually runs rather than a lookalike.
  function speciesGrantMerge(prevSkills, applied, grants) {
    var next = Object.assign({}, prevSkills || {});
    var g = grants || {};
    Object.keys(applied || {}).forEach(function (k) {
      var s = next[k];
      if (!s) return;
      var left = Math.max(0, (s.purchased || 0) - applied[k]);
      var bare = !s.freeCareer && !s.freeSpec && !s.freeSpecies && !(s.bought && s.bought.length);
      // Keep the key when the new grant re-uses it: re-confirming the SAME pick must be a no-op, and
      // delete-then-re-add would churn the object's key order for nothing.
      if (left === 0 && bare && g[k] == null) delete next[k];
      else next[k] = Object.assign({}, s, { purchased: left });
    });
    Object.keys(g).forEach(function (k) {
      var s = next[k] || { freeCareer: false, freeSpec: false, purchased: 0 };
      next[k] = Object.assign({}, s, { purchased: (s.purchased || 0) + g[k] });
    });
    return next;
  }

  function speciesEffective(rec, picks) {
    var out = {
      characteristics: Object.assign({}, (rec && rec.characteristics) || {}),
      wound_threshold_base: rec ? rec.wound_threshold_base : 10,
      strain_threshold_base: rec ? rec.strain_threshold_base : 10,
      starting_xp: rec ? rec.starting_xp : 100,
    };
    if (!rec) return out;
    var p = (picks && typeof picks === 'object') ? picks : {};
    (rec.option_choices || []).forEach(function (oc) {
      var opts = oc.options || [];
      var chosen = _chosenOptions(oc, p);
      var opt = chosen[0] || null;
      // An id nobody recognises is treated as NO pick, not as a reason to fall back to the base
      // record. Caught by test/species_variant_resolver.cjs, which is why it is worth stating: for a
      // variant species the base is "a fallback no live path prints" (ruling
      // `csg-v7-option-characteristics-schema` Correction 2), so dropping to it on a stale or
      // corrupt id would print a stat block belonging to no variant at all. Reaching the first
      // option instead keeps the card complete and matches what a sheet with no recorded pick gets.
      if (!opt && oc.preselect) opt = opts[0] || null;
      if (!opt) return;
      // A complete replacement, never a patch — L1cb.oc asserts group completeness so a half-
      // specified option cannot reach here and leave some numbers from the base and some from the
      // pick with no way to tell which is which.
      if (opt.characteristics) out.characteristics = Object.assign({}, opt.characteristics);
      if (opt.wound_threshold_base != null) out.wound_threshold_base = opt.wound_threshold_base;
      if (opt.strain_threshold_base != null) out.strain_threshold_base = opt.strain_threshold_base;
      if (opt.starting_xp != null) out.starting_xp = opt.starting_xp;
      // Q2 — the DELTA family SUMS across every option taken from this group, and is schema-barred
      // from co-existing with the absolutes above on a multi-pick group (an absolute cannot combine
      // order-independently). Droid Large +2 WT and Small -2 WT are the first users. `xp_adjustment`
      // is deliberately NOT summed here — it keeps flowing through `character.speciesOption.xp` at
      // the call site, exactly as the block above this function describes; summing it in both places
      // is a double-count, which is why the two delta families part company at this line.
      (chosen.length > 1 ? chosen : (opt ? [opt] : [])).forEach(function (o) {
        if (o.wound_threshold_adjustment) out.wound_threshold_base += o.wound_threshold_adjustment;
        if (o.strain_threshold_adjustment) out.strain_threshold_base += o.strain_threshold_adjustment;
        // R-SOP-6 (`species-option-payload-contract` §9.4) — characteristic_overrides is the PARTIAL
        // counterpart to the absolute `characteristics` block above: an object of characteristic ->
        // VALUE applied OVER the resolved block, never a delta. The schema bars an option from carrying
        // both, so this never fights the absolute branch on the same option. It lands here with the
        // adjustment family — free to vary across a group's options — rather than in the absolute
        // branch, which is why the completeness rule (L1cb.oc) does not require it all-or-none.
        if (o.characteristic_overrides) out.characteristics = Object.assign({}, out.characteristics, o.characteristic_overrides);
      });
    });
    return out;
  }

  // ── R-SAM-8: WHICH species option groups the SHEET may answer, and which it DEFERS ─────────────
  // The ask surface (species-ask-mount) offers a group only when answering it grants exactly what the
  // creator would AND writes nothing the sheet reads BAKED. Two classes defer to the creator, BY
  // PREDICATE not by list (R-SAM-5 + R-SAM-8, ruling `species-ask-variant-reseed`) so a future import
  // is caught automatically instead of reaching an unbuilt path:
  //   · `skill_choice_grants` — the option opens a SECOND question the slim ask line does not draw
  //     (R-SAM-5). 3 groups today.
  //   · any BAKED-AT-CREATION stat field — `characteristics`, `wound_threshold_base`,
  //     `strain_threshold_base`, `wound_threshold_adjustment`, `strain_threshold_adjustment`, or an
  //     absolute `starting_xp`. `computeDerived` reads those from the saved sheet (this file, the
  //     `sheet.characteristics`/`woundBase`/`strainBase` reads) and NEVER re-derives them from the
  //     pick, so answering on the sheet would show stale stats or need the creator's DESTRUCTIVE
  //     re-seed (`app.jsx` `applySpeciesPicks`, cost stated at its own comment), which is gated behind
  //     the C-SVRA-3 review the ask line has no room for. 21 groups today (all CSG subspecies/variant).
  // Result on the shipped shelf: 183 answerable, 24 deferred (C-SAVR-1 asserts the split from the
  // registry, never a hard-coded number). A deferred group stays VISIBLE and routed to the creator
  // (frame H) — the entitlement is never hidden.
  var SPECIES_DEFERRED_STAT_FIELDS = ['characteristics', 'wound_threshold_base', 'strain_threshold_base',
    'wound_threshold_adjustment', 'strain_threshold_adjustment', 'starting_xp'];
  function speciesGroupDeferred(oc) {
    return ((oc && oc.options) || []).some(function (o) {
      if (!o) return false;
      if (o.skill_choice_grants) return true;
      return SPECIES_DEFERRED_STAT_FIELDS.some(function (f) { return o[f] != null; });
    });
  }

  // The option groups a loaded character has NOT answered — split into what the sheet may answer and
  // what it routes to the creator. `picks` is the persisted pick map (`sheet.speciesOptionPicks`, or
  // equivalently `character.speciesOption.picks` — same shape). A group is UNANSWERED when its slug
  // carries no pick (`_pickIdsOf` empty). One reader for the surface AND the detection guard, so the
  // count the guard checks is the count the surface shows (the B-124 lesson, applied to detection).
  //
  // The species' career PICK (`speciesCareerPickGroups`, the Cerean's Intellectuals — card `f100-cerean-intellectuals`
  // ADDENDUM 2 Q3 (b-ii)) joins as DEFERRED while fewer than `count` picks are honoured in `skillChoices`
  // (`sheet.speciesSkillChoices`): the creator is its ONE writer, so the sheet only routes to it. With no `charbuild` the
  // career groups are not read (callers that pass two arguments see the option groups only, as before).
  function speciesUnansweredGroups(rec, picks, skillChoices, charbuild) {
    var out = { answerable: [], deferred: [] };
    if (!rec) return out;
    var p = (picks && typeof picks === 'object') ? picks : {};
    (rec.option_choices || []).forEach(function (oc) {
      if (_pickIdsOf(oc, p).length) return;   // already answered — not an ask
      (speciesGroupDeferred(oc) ? out.deferred : out.answerable).push(oc);
    });
    if (charbuild) speciesCareerPickGroups(rec, charbuild).forEach(function (g) {
      if (speciesCareerPicksHonoured(rec, g, skillChoices).length < g.min_picks) out.deferred.push(g);
    });
    return out;
  }

  // ── C-SAE-2 / R-SAE-4 rider: the ONE computation of a species' option XP DELTA ─────────────────
  // The creator banks this at confirm (was an inline reduce inside `applySpeciesPicks`) and the sheet
  // ask mount banks the SAME number when it answers a group — one reduce over the chosen options'
  // `xp_adjustment`, never a second. `speciesEffective` owns the ABSOLUTE `starting_xp`; this owns the
  // DELTA, and the schema bars one option from carrying both (the XP-is-half-done note above
  // `speciesEffective`), so summing the two at the pool cannot double-count. Read through the shared
  // `_chosenOptions` normalizer, so a scalar or a multi-pick group both resolve correctly.
  function speciesOptionXpDelta(rec, picks) {
    if (!rec) return 0;
    var p = (picks && typeof picks === 'object') ? picks : {};
    var total = 0;
    (rec.option_choices || []).forEach(function (oc) {
      var chosen = _chosenOptions(oc, p);
      // NO RECORDED PICK: the SAME fallback `speciesEffective` applies above — a `preselect` group
      // resolves to its FIRST option (§4-STATES). Before this the two paths disagreed on an untouched
      // Vaathkree: thresholds read the Bulky form (WT 13) while XP ignored its +15 (80, not 95) —
      // and the saved character gets 95, because confirm records the preselect (B-418). Found by
      // `scripts/probe_exception_contract.py` on the transplanted species step, which records the
      // preselect at display time and so showed the number the core would not.
      if (!chosen.length && oc.preselect && (oc.options || [])[0]) chosen = [oc.options[0]];
      chosen.forEach(function (opt) {
        if (opt && opt.xp_adjustment) total += opt.xp_adjustment;
      });
    });
    return total;
  }

  // ── R-SAM-2/3: ANSWER a species option group FROM THE SHEET — the pure patch the mount persists ──
  // The forward twin of the creator's `handleSpeciesConfirm`, for a SAVED sheet rather than a draft.
  // Given the sheet, the species record, a group slug and its answer, returns the PATCH the
  // write-through persists — and NOTHING baked-at-creation. Only:
  //   · the pick (so abilities `speciesAbilitiesResolved` and talents `speciesTalentGrants` re-derive
  //     LIVE at the next render — no baking needed for them);
  //   · the skill grant, MERGED through the shared applier + `speciesGrantMerge` with the
  //     `speciesGrantApplied` provenance marker (the FREE species grant lands in `purchased`, B-147);
  //   · the XP delta, from the ONE shared reduce (C-SAE-2).
  // It NEVER writes `characteristics` / `woundBase` / `strainBase` (C-SAVR-2) — groups whose option
  // carries those DEFER (R-SAM-8), so this is only ever reached for an answerable group. IDEMPOTENT
  // (R-SAM-4): `speciesGrantMerge` removes exactly the prior applied grant before adding the new, and
  // the pick/xp recompute from the full `nextPicks`, so answering the same group twice is a no-op.
  // `optionIdOrIds` is a scalar id or (multi-pick) an id array — both flow through the normalizer.
  // ── THE NARRATIVE MECHANIC ENGINE — one home ────────────────────────────────────────────────
  // Obligation / Duty / Morality at creation: the base value, the trades taken (from
  // `public/data/narrative-mechanics.json`), and the persisted record shape. This lived INLINE in
  // `player/index.html` (the shell — reachable by neither the GM app nor node), and `oggImport.js`
  // rebuilt its output shape by hand because it could not call it. The census flagged both. Moved
  // verbatim; the shell keeps a same-named global that forwards here.
  //
  // mechanicRecord — THE persisted shape (`character.mechanic` / `sheet.mechanic`), one constructor.
  // T2-C (ruled shape): `entries` is the list the sheet's PROFILE editor may split/rename (RAW Table
  // 2-1, printed p.39); creation emits one typed entry at the final value; an import emits the
  // save's own entries. Legacy saves without entries map to one entry at read.
  function mechanicRecord(f) {
    f = f || {};
    var base = Number(f.baseValue) || 0;
    var fin = f.finalValue == null ? base : Number(f.finalValue) || 0;
    return {
      type: f.type, descriptor: f.descriptor || '', baseValue: base, finalValue: fin,
      xpAdjustment: Number(f.xpAdjustment) || 0, creditAdjustment: Number(f.creditAdjustment) || 0,
      tradeIds: Array.isArray(f.tradeIds) ? f.tradeIds.slice() : [],
      entries: Array.isArray(f.entries) ? f.entries : [{ type: f.descriptor || '', magnitude: fin }],
    };
  }
  // inferRuleset — which mechanic a career's book implies (the guided build's default).
  function inferRuleset(careerSource) {
    if (!careerSource) return null;
    if (careerSource.indexOf('Edge of the Empire') >= 0) return 'obligation';
    if (careerSource.indexOf('Age of Rebellion') >= 0)  return 'duty';
    if (careerSource.indexOf('Force and Destiny') >= 0) return 'morality';
    return null;
  }
  // tradeDeltas — THE ONE PLACE A TRADE BECOMES NUMBERS (B-744 / R-RTD-1 (4), PRAXIS §5). Extracted
  // from `computeMechanic`'s body, which now calls it, so the FORWARD direction (creation) and the
  // REVERSE one (F-45's transform, deleted at R-M13B-103, which recovered the pre-trade base by subtracting the very
  // same sum) cannot drift apart. Sums the registry's three signed deltas over the de-duplicated ids
  // and reports the id list it actually summed plus whether the mechanic's table caps the combination.
  //
  // ONE FORMULA SERVES ALL THREE MECHANICS because the registry already SIGNS them: Obligation `+5/+10`
  // (taken ON), Duty `-5/-10` (Duty is SPENT — B-740 verified the direction from the book rather than
  // assuming it from Obligation), Morality `0` for the three XP/credit options and `±21` for the two
  // track moves. A per-mechanic branch here would be evidence the registry was wrong.
  //
  // Returns null when the table is not reachable at all (no config, no such mechanic, no choices). That
  // is a DECLARED condition at both callers — `computeMechanic` returns null and the creator's panel
  // falls back to no trades; the reverse transform `mark()`s the loss (R-RTD-3) — never a quiet zero.
  function tradeDeltas(mechType, tradeIds, config) {
    var mech = config && config.mechanics && config.mechanics[mechType];
    var opts = mech && mech.tradeOptions;
    if (!opts || !Array.isArray(opts.choices)) return null;
    var seen = {}; var uniqueIds = [];
    (tradeIds || []).forEach(function(id) { if (!seen[id]) { seen[id] = true; uniqueIds.push(id); } });
    var valueDelta = 0, xpDelta = 0, creditsDelta = 0;
    uniqueIds.map(function(id) { return opts.choices.find(function(t) { return t.id === id; }); })
      .filter(Boolean)
      .forEach(function(t) {
        valueDelta += Number(t.valueDelta) || 0;
        xpDelta += Number(t.xpDelta) || 0;
        creditsDelta += Number(t.creditsDelta) || 0;
      });
    return { valueDelta: valueDelta, xpDelta: xpDelta, creditsDelta: creditsDelta,
             ids: uniqueIds, capped: !!opts.maxAbsDeltaEqualsBase };
  }
  // computeMechanic — apply the chosen trades to the base value under the config's rules. Returns
  // null when there is no config / no such mechanic, or when the trades exceed the cap
  // (`maxAbsDeltaEqualsBase`); the creator's panel disables such combos and falls back to no trades.
  function computeMechanic(mechType, baseValue, descriptor, selectedTradeIds, config) {
    var d = tradeDeltas(mechType, selectedTradeIds, config);
    if (!d) return null;
    if (d.capped && Math.abs(d.valueDelta) > baseValue) return null;
    return mechanicRecord({ type: mechType, descriptor: descriptor, baseValue: baseValue, finalValue: baseValue + d.valueDelta,
      xpAdjustment: d.xpDelta, creditAdjustment: d.creditsDelta, tradeIds: d.ids });
  }

  // ── SPECIALIZATION GATES AND COST — one home ────────────────────────────────────────────────
  // Three registry keys the creator used to resolve in app.jsx (the census's UI-RESIDENT list):
  //   `min_force_rating` — General/Knight 2, Master 3 (CotR p.29): a HARD gate, on specs AND Force
  //     powers (the same predicate reads `powerData`).
  //   `species_requirement` — Retired Clone Trooper → clone: the detail tells the player the switch.
  //   `universal` — not a label: it sets the COST of a new spec (eote p.284) and its shelf.
  // `specGate` answers "may this build take this spec, and if not, why" in one place; the three
  // small functions beneath it are the pieces the app's existing call sites already name.
  function minForceRatingOf(rec) {
    var n = Number(rec && rec.min_force_rating);
    return n > 0 ? n : 0;
  }
  function meetsForceRating(rec, forceRating) {
    return (Number(forceRating) || 0) >= minForceRatingOf(rec);
  }
  // specGate(specRec, { forceRating, speciesId }) → { met, forceOk, needForce, speciesOk, needSpecies }
  function specGate(specRec, ctx) {
    ctx = ctx || {};
    var needForce = minForceRatingOf(specRec);
    var forceOk = meetsForceRating(specRec, ctx.forceRating);
    var needSpecies = (specRec && specRec.species_requirement) || null;
    var speciesOk = !needSpecies || !ctx.speciesId || ctx.speciesId === needSpecies;
    return { met: forceOk && speciesOk, forceOk: forceOk, needForce: needForce, speciesOk: speciesOk, needSpecies: needSpecies };
  }
  // costForNewSpec — first career spec FREE (eote p.35); universal = base (p.284); another career's
  // = base + 10 (p.102); base = 10 × (owned + 1). Was app.jsx's; the ADVANCEMENT buy and the
  // creator's preview both price through here.
  function costForNewSpec(specRec, ownedCount, career) {
    var inCareer = career && Array.isArray(career.specializations) && specRec && career.specializations.indexOf(specRec.id) !== -1;
    if (ownedCount === 0 && inCareer) return 0;
    var base = 10 * (ownedCount + 1);
    if (specRec && specRec.universal) return base;
    return inCareer ? base : base + 10;
  }

  // ── FORCE ACCESS AT CREATION — one home ─────────────────────────────────────────────────────
  // Does this build start with Force Rating 1? Four clauses, RAW-cited where they were first added:
  //   the Force and Destiny line (fad p.282) · a FaD CAREER regardless of campaign line (B-20,
  //   fad p.282; the career carries force_rating:1) · a Force-granting universal SPEC (T2-D — Force
  //   Sensitive Exile/Emergent, eote p.276) · a species with innate FR (no shipped record carries
  //   one today; the exception census marks the clause UNMEASURED and keeps it visible).
  // This disjunction was written twice — the creator's controller (`_hasForceAccess`, which gates the
  // Force-powers step and the Morality layering) and the sheet assembly below (forceRatingBase) — and
  // the census flagged the DUPLICATE. One implementation; both callers read it.
  function forceAccessAtCreation(gameLine, speciesData, careerData, specData) {
    return gameLine === 'fad'
      || !!(careerData && Number(careerData.force_rating) >= 1)
      || !!(specData && Number(specData.force_rating) >= 1)
      || !!(speciesData && Number(speciesData.force_rating) > 0);
  }
  // B-701 (f100-triage-census-card ADDENDUM 8, the brief's §2): does a SAVED sheet have Force access? The creator's own
  // predicate above, over the sheet's game line (`book`), species, career and EVERY owned specialization — so the sheet
  // and the creator cannot disagree. FaD p.282: a non-Force-sensitive character may buy a Force talent but gets
  // nothing from it until Force-sensitive, Force Rating talents included
  // computeDerived reads it to hold a Force Rating talent's bonus; null charbuild → false.
  // B-1334 (release-r7-bug-burndown ADDENDUM 76): THE ONE FORCE RATING FORMULA, read by `computeDerived` (a saved sheet)
  // and the creator's `creatorForceRating` (mid-creation) alike — max(base, floor) + the talent deltas, the deltas counted
  // only WITH Force access (R-FEC-1, B-701, FaD p.282). Without access the bonus is HELD, not lost. Access is the
  // caller's: the sheet's `frAccess`, the creator's `hasForceAccess` (the same `forceAccessAtCreation` predicate).
  function forceRatingOf(base, floor, bonus, access) {
    base = Number(base) || 0; floor = Number(floor) || 0;
    return Math.max(base, floor) + ((access || base > 0 || floor > 0) ? (Number(bonus) || 0) : 0);
  }
  function sheetForceAccess(sheet, charbuild) {
    if (!sheet || !charbuild) return false;
    var speciesReg = charbuild.species || {}, careerReg = charbuild.careers || {}, specReg = charbuild.specializations || {};
    var sid = sheet.speciesId;
    if (!sid && sheet.species) sid = lookupByName(speciesNameIndex(speciesReg), sheet.species);
    var cid = sheetCareerId(sheet, careerReg);
    if (forceAccessAtCreation(sheet.book, sid ? speciesReg[sid] : null, cid ? careerReg[cid] : null, null)) return true;
    var specIds = resolveSheetSpecs(sheet, charbuild).map(function (x) { return x && x.id; })
      .concat(Array.isArray(sheet.specializationIds) ? sheet.specializationIds : []);
    return specIds.some(function (id) { return !!id && forceAccessAtCreation(null, null, null, specReg[id]); });
  }

  // ── THE FREE-CHOICE SKILL GRANT — one home, in the shared core ──────────────────────────────
  // "One rank in a skill of your choice" (Human 2×non-career, Geonosian 1×any, Mandalorian Human's
  // combat/knowledge, Xi'Dec Constructor's Athletics-or-Mechanics). The rule lived in
  // `player/app.jsx` (`speciesChoiceGrantOf` / `speciesChoicePoolOf`) — the one species exception
  // whose resolution sat inside the creator rather than beside the other ten option keys here, so
  // the exception census could not pin it and a creator revision could break it unseen. Moved
  // verbatim; the app's two functions are now thin wrappers over these. 23 species carry the key
  // (18 on the record, 5 on an option); `speciesGroupDeferred` already keys on it above.
  //
  // speciesChoiceGrants(rec, picks) -> [{count, pool, rank_cap}, ...]
  //   the record's own grants followed by every CHOSEN option's, resolved from (rec, picks) exactly
  //   like `speciesSkillGrants` — never from banked UI state. The LIST, always; the caller decides
  //   how many it honours (the creator still takes the first — B-37 latent, unchanged).
  function speciesChoiceGrants(rec, picks) {
    if (!rec) return [];
    var out = (rec.skill_choice_grants || []).slice();
    (rec.option_choices || []).forEach(function (oc) {
      _chosenOptions(oc, picks).forEach(function (o) {
        if (o.skill_choice_grants) out = out.concat(o.skill_choice_grants);
      });
    });
    return out;
  }
  // speciesChoicePool(grant, charbuild, careerStatusIds) -> sorted canonical skill ids the grant may
  //   be spent on. `charbuild` supplies `skillNames` (id -> label) and `skillGroups` (id -> group);
  //   `careerStatusIds` (id -> truthy) marks career skills for the `non_career` pool.
  //   Pool forms: an explicit id list (G11 — unresolvable ids drop; a 1-item list is a fixed grant),
  //   'non_career', 'any', or a skill-GROUP name from skills.vocab.json (combat / general / knowledge /
  //   social). An unknown group THROWS rather than silently offering every skill (ruling
  //   `f-eds-6-pool-enum-halt` §3 — the enum is pinned to the vocab by validate_registries L1cb.5).
  function speciesChoicePool(grant, charbuild, careerStatusIds) {
    if (!grant || !charbuild) return [];
    var names = charbuild.skillNames || {};
    var groups = charbuild.skillGroups || {};
    var all = Object.keys(names);
    if (Array.isArray(grant.pool)) {
      all = grant.pool.filter(function (id) { return names[id] != null; });
    } else if (grant.pool === 'non_career') {
      all = all.filter(function (id) { return !(careerStatusIds && careerStatusIds[id]); });
    } else if (grant.pool && grant.pool !== 'any') {
      if (!Object.keys(groups).some(function (id) { return groups[id] === grant.pool; })) {
        throw new Error('speciesChoicePoolOf: unknown skill-group pool ' + JSON.stringify(grant.pool)
          + ' — not a group in skills.vocab.json. Refusing to fall back to every skill.');
      }
      all = all.filter(function (id) { return groups[id] === grant.pool; });
    }
    return all.sort(function (a, b) { return (names[a] || a).localeCompare(names[b] || b); });
  }

  // R-M13B-115: `chosenRanks` ({ <sheet key>: 1 }) is an option's skill choice, written with the pick and retracted the same way (speciesGrantMerge).
  // R-M13B-114: what a pick does to `characteristics`. after = current + (effective after − effective before), both from
  // speciesEffective, so raises the player bought are kept and a change of pick runs from `picksBefore` without stacking. Never below 1.
  function speciesPickMove(rec, picksBefore, picksAfter) {
    var a = speciesEffective(rec, picksBefore).characteristics, b = speciesEffective(rec, picksAfter).characteristics, out = {};
    Object.keys(b).forEach(function (k) { var d = (Number(b[k]) || 0) - (Number(a[k]) || 0); if (d) out[k] = d; });
    return out;
  }
  // `saved` is the record's characteristics, `draft` the draft's. Any step the player added in the draft rides on top, and the move always runs from the saved picks.
  function speciesPickCharacteristics(saved, draft, rec, picksSaved, picksDraft, picksNext) {
    var was = speciesPickMove(rec, picksSaved, picksDraft), now = speciesPickMove(rec, picksSaved, picksNext), out = Object.assign({}, draft), floored = [];
    var settled = function (k, m) { return Math.max(1, (Number(saved[k]) || 0) + (m[k] || 0)); };
    Object.keys(was).concat(Object.keys(now)).forEach(function (k) {
      if ((Number(saved[k]) || 0) + (now[k] || 0) < 1) floored.push(k);
      out[k] = settled(k, now) + ((Number(draft[k]) || 0) - settled(k, was));
    });
    return { characteristics: out, floored: floored };
  }
  // R-CI-2 as R-M13B-116 amends it: ONE WRITER of `speciesSkillChoices`, two callers (the creator's commit, the Modify page). `pickedOf(group)` gives a
  // career group's ids. `{ [rec.id]: { [poolId]: [ids] } }` for this species and nothing for any other, so a species change leaves no stale pick.
  function speciesSkillChoicesFor(rec, groups, pickedOf) {
    var byPool = {};
    (groups || []).forEach(function (g) {
      var ids = pickedOf(g) || [];
      if (ids.length) byPool[g.career_pick.poolId] = ids.slice(0, g.max_picks != null ? g.max_picks : 1);
    });
    var out = {};
    if (rec && Object.keys(byPool).length) out[rec.id] = byPool;
    return out;
  }

  // R-M13B-117: a stepper moves the number `speciesEffective` shows. An option carrying that number replaces the record's, so a step on the record alone would change nothing
  // the player sees; the step lands on the option that wins, in the walk `speciesEffective` makes, or on the record when none does. `rec` is the caller's own copy.
  function speciesStepEffective(rec, picks, key, d) {
    var at = rec, p = (picks && typeof picks === 'object') ? picks : {};
    (rec.option_choices || []).forEach(function (oc) {
      var opt = _chosenOptions(oc, p)[0] || (oc.preselect ? (oc.options || [])[0] : null);
      if (opt && opt[key] != null) at = opt;
    });
    at[key] = (Number(at[key]) || 0) + d;
    return rec;
  }

  function speciesAskPatch(sheet, rec, slug, optionIdOrIds, skillSheetKeys, chosenRanks) {
    var prevPicks = (sheet && sheet.speciesOptionPicks && typeof sheet.speciesOptionPicks === 'object') ? sheet.speciesOptionPicks : {};
    var nextPicks = Object.assign({}, prevPicks);
    nextPicks[slug] = optionIdOrIds;
    var grants = speciesSkillGrants(rec, nextPicks, skillSheetKeys || {});
    Object.keys(chosenRanks || {}).forEach(function (k) { grants[k] = (grants[k] || 0) + chosenRanks[k]; });
    var applied = (sheet && sheet.speciesGrantApplied) || {};
    // ── R-B658-1/2 — LIFT · MERGE · FLATTEN. The sheet-side writer stores the SHEET's shape. ──────
    // `speciesGrantMerge` speaks the CREATOR's record shape and has to: only `purchased` vs
    // `freeCareer`/`freeSpec`/`bought` tells a species grant apart from a rank the player bought, which
    // is the whole reason a re-pick can retract exactly what it granted. A SAVED sheet's `skills` map
    // holds one NUMBER per key (R-B658-1, what `normalizeCreated` flattens to at save). Handing the
    // merge that number map made it read `.purchased` off a number — `undefined` — with two consequences:
    //   · a first grant wrote `{freeCareer:false, freeSpec:false, purchased:1}` INTO a number map, and
    //     every sheet reader read it as 0 (`Number(obj) || 0`) or printed it ("[object Object] · NaN XP"
    //     on the legacy ADVANCEMENT row) — the visible defect, B-658.
    //   · RETRACTING a grant from a skill that also carries ranks from elsewhere computed
    //     `left = max(0, undefined - 1)` = 0 with `bare` true, and DELETED the rank the player paid for
    //     (Stealth 2 bought + the grant, then the other option picked → Stealth gone). Latent, in scope,
    //     and fixed by the same three lines.
    // So: LIFT each previous entry into the merge's shape, merge UNCHANGED, then FLATTEN every entry of
    // the result through `skillRankOf` — the same rule the save uses. The deletion rule stays the
    // merge's (`left === 0 && bare && g[k] == null` → the key goes), which is what "as today" means;
    // a key it keeps at a flattened 0 keeps saying 0, exactly as a saved sheet already may.
    // The CREATOR's caller of the merge (`player/app.jsx` speciesGrantMerge at its confirm) is untouched:
    // its skills are already records, so its lift is the identity and it never reaches this function.
    var prevSkills = (sheet && sheet.skills) || {};
    var liftedPrev = {};
    Object.keys(prevSkills).forEach(function (k) {
      var e = prevSkills[k];
      liftedPrev[k] = (e && typeof e === 'object') ? e : { purchased: Number(e) || 0 };
    });
    var merged = speciesGrantMerge(liftedPrev, applied, grants);
    var nextSkills = {};
    Object.keys(merged).forEach(function (k) { nextSkills[k] = skillRankOf(merged[k]); });
    var xpDelta = speciesOptionXpDelta(rec, nextPicks);
    var prevOption = (sheet && sheet.speciesOption && typeof sheet.speciesOption === 'object') ? sheet.speciesOption : {};
    return {
      speciesOptionPicks: nextPicks,
      // Keep the two pick stores convergent (top-level mirror drives the live resolvers; `.picks`
      // drives `speciesEffective` and the F-45 round-trip) — never let them diverge.
      speciesOption: Object.assign({}, prevOption, { picks: nextPicks, xp: xpDelta }),
      skills: nextSkills,
      speciesGrantApplied: grants,
    };
  }

  // The species/option talents' derived bonuses (Enduring +1 soak), as a derivedBonuses-shaped
  // object — ADDED to the persisted tree bonuses at render (computeDerived).
  //
  // THE INVARIANT, and it is no longer "species never grants a non-ranked derived talent"
  // (ruling `csg-grant-fidelity-data` R-GFD-2). CSG's Sakiyan grants Superior Reflexes, which is
  // {meleeDefenseBonus, ranked:false}, so the two sources CAN now name the same flat talent.
  // The rule that holds instead, and that this function enforces:
  //   * RANKED derived talents STACK across sources — species Enduring 1 + tree Enduring 1 = +2
  //     soak, which is RAW and is what the ranks are for.
  //   * NON-RANKED (flat) derived talents count ONCE no matter how many sources grant them —
  //     the same rule R-CS4e already applies WITHIN a tree (a flat talent auto-populated into
  //     two trees is +1, not +2), now extended ACROSS the tree/species boundary.
  // It has to live here rather than in derivedBonusesFromTalents because the species bonuses are
  // summed separately and then ADDED to the already-summed persisted tree object, so that function
  // never sees both sources at once. This is the merged {id→ranks} view its predecessor comment
  // asked for, applied at the only place that can see both.
  //
  // Deliberately NOT done: recomputing the tree half from `sheet.talents`. Legacy sheets carry
  // string-shaped talents with no ids, so a recompute would silently zero their real persisted
  // bonuses — the fallback law (R-DAR1) keeps history rendering, and this keeps it.
  function ownedTreeTalentIds(sheet) {
    var out = {};
    (Array.isArray(sheet && sheet.talents) ? sheet.talents : []).forEach(function (e) {
      if (e && e.id) out[e.id] = true;
    });
    return out;
  }

  function speciesTalentBonuses(sheet, charbuild, _rows) {
    var owned = ownedTreeTalentIds(sheet);
    var ids = [];
    var talents = charbuild && charbuild.talents;
    speciesTalentGrants(sheet, charbuild).forEach(function (g) {
      var effs = talentEffectsOf(g.id, talents);
      // flat talent the tree already contributes → the species copy adds nothing
      var flat = effs.length > 0 && effs.every(function (e) { return e.per_rank === false; });
      if (flat && owned[g.id]) return;
      for (var i = 0; i < g.rank; i++) ids.push(g.id);
    });
    return derivedBonusesFromTalents(ids, talents, _rows);
  }

  // R-R4D-4: the Battle Scars' talents' plain deltas (Grit's +1 strain threshold), summed as the species' are and never
  // stored. A FLAT talent already owned (tree, species, or an earlier scar) adds nothing, the R-CS4e rule above.
  function scarTalentBonuses(sheet, charbuild, _rows) {
    var owned = ownedTreeTalentIds(sheet);
    speciesTalentGrants(sheet, charbuild).forEach(function (g) { owned[g.id] = true; });
    var talents = charbuild && charbuild.talents;
    var ids = [];
    scarTalentGrants(sheet).forEach(function (g) {
      var effs = talentEffectsOf(g.id, talents);
      var flat = effs.length > 0 && effs.every(function (e) { return e.per_rank === false; });
      if (flat && owned[g.id]) return;
      owned[g.id] = true;
      ids.push(g.id);
    });
    return derivedBonusesFromTalents(ids, talents, _rows);
  }

  // ── the owned talents that carry DICE, for poolMods.collect's owned-talents arm (R-F100-6, R-FEGC-2) ──
  // Every talent the sheet owns — the id-ref tree list (`sheet.talents`, {id, rank}: the record creation and
  // advancement both write, R-PFR-1) PLUS the species grants resolved at render (B-23) — counted by THE ONE
  // COUNTER, returned as the records collect multiplies: [{id, name, ranked, ranks, pool_mods}], only those
  // whose registry record carries `pool_mods[]`. collect decides the multiplier (count × ranks for a ranked
  // talent, ×1 for an unranked one or a `per_rank: false` entry); this function never does. Legacy string
  // talents (no id) contribute nothing, as in ownedTreeTalentIds. REQUIRES the registry (a caller without it
  // throws, R-FEGC-1) — the app's helper asks only once the charbuild has landed.
  function ownedTalentPoolSources(sheet, charbuild, session) {
    var talents = charbuild && charbuild.talents;
    _requireTalentRegistry(talents, 'ownedTalentPoolSources');
    var ids = [];
    (Array.isArray(sheet && sheet.talents) ? sheet.talents : []).forEach(function (e) {
      if (!e || !e.id) return;
      for (var i = 0, n = Math.max(1, Number(e.rank) || 1); i < n; i++) ids.push(e.id);
    });
    grantedTalentsAtRender(sheet, charbuild).forEach(function (g) {
      for (var i = 0, n = Math.max(1, Number(g.rank) || 1); i < n; i++) ids.push(g.id);
    });
    var out = [];
    ownedRankCounts(ids).forEach(function (o) {
      var rec = Object.prototype.hasOwnProperty.call(talents, o.id) ? talents[o.id] : null;
      if (!rec || !Array.isArray(rec.pool_mods) || !rec.pool_mods.length) return;
      var mods = _resolveCountOf(_resolveChosenAnchors(rec.pool_mods, sheet, charbuild, o.id), sheet, charbuild, session);   // R-M8G-9; R-M8BG-223
      if (mods.length) out.push({ id: o.id, name: rec.name || o.id, ranked: !!rec.ranked, ranks: o.rank, pool_mods: mods });
    });
    // F-100 M9 (R-M9S-1): the species abilities' dice rows, their owner the ability
    speciesAbilityRowSources(sheet, charbuild).forEach(function (a) {
      if (a.pool_mods) out.push({ id: a.id, name: a.name, ranked: false, ranks: 1, species: a.species, pool_mods: a.pool_mods });
    });
    // F-100 M10 (R-M10S-1/2): the owned upgrades' dice rows, their owner the upgrade, `count_of` resolved here
    forcePowerRowSources(sheet, charbuild).forEach(function (a) {
      if (!a.pool_mods) return;
      var mods = _resolveCountOf(a.pool_mods, sheet, charbuild, session);
      if (mods.length) out.push({ id: a.id, name: a.name, ranked: false, ranks: 1, power: a.power, pool_mods: mods });
    });
    // F-100 M12 (R-M12C-42): the owned signature nodes' dice rows, their owner the node, SV2's count resolved here
    sigAbilityRowSources(sheet, charbuild).forEach(function (a) {
      if (!a.pool_mods) return;
      var mods = _resolveCountOf(a.pool_mods, sheet, charbuild, session);
      if (mods.length) out.push({ id: a.id, name: a.name, ranked: false, ranks: 1, signature: a.ability, pool_mods: mods });
    });
    return out;
  }

  // B-1462 (roll-options card ADDENDUM 38 F1 (a); brief f100-surfacing-roll-options-e §6.1): EVERY fixed `skill_ranks` amount
  // names its skill by the vocabulary id (`amount: {of: skill_ranks, key: 'coordination'}`, the paper's shape, as count_of
  // writes it); poolMods.rollAmount reads the SHEET's key, so the id is mapped HERE, the one place — beside
  // _resolveChosenAnchors (a chosen key) and _resolveCountOf (a count_of key). Martial Grace's Brawl damage read 0 before
  // (LIVE). It subsumes 5c's ticked/dark-only arm (_tickedSkillKeys, retired): those rows are fixed keys too. rollAmount and
  // its callers are unchanged.
  function _skillRankKeys(rows, charbuild) {
    var keys = (charbuild && charbuild.skillSheetKeys) || {};
    return rows.map(function (r) {
      var a = r && r.amount;
      if (!(a && typeof a === 'object' && a.of === 'skill_ranks' && a.key && keys[a.key])) return r;
      var c = JSON.parse(JSON.stringify(r));
      c.amount.key = keys[a.key];
      return c;
    });
  }

  // F-100 M8 C11 (R-M8K-16): the owner's talents that carry `roll_numbers` — the same ownership and rank count as
  // ownedTalentPoolSources (bought ranks + species grants), so a roll number and a die row cannot disagree on who owns
  // what. → [{id, name, ranked, ranks, roll_numbers}]; SWRPGPoolMods.rollNumbersAt reads it.
  function ownedTalentRollSources(sheet, charbuild) {
    var talents = charbuild && charbuild.talents;
    _requireTalentRegistry(talents, 'ownedTalentRollSources');
    var ids = [];
    (Array.isArray(sheet && sheet.talents) ? sheet.talents : []).forEach(function (e) {
      if (!e || !e.id) return;
      for (var i = 0, n = Math.max(1, Number(e.rank) || 1); i < n; i++) ids.push(e.id);
    });
    grantedTalentsAtRender(sheet, charbuild).forEach(function (g) {
      for (var i = 0, n = Math.max(1, Number(g.rank) || 1); i < n; i++) ids.push(g.id);
    });
    var out = [];
    ownedRankCounts(ids).forEach(function (o) {
      var rec = Object.prototype.hasOwnProperty.call(talents, o.id) ? talents[o.id] : null;
      if (!rec || !Array.isArray(rec.roll_numbers) || !rec.roll_numbers.length) return;
      var rows = _skillRankKeys(_resolveChosenAnchors(rec.roll_numbers, sheet, charbuild, o.id), charbuild);   // R-M8G-9; B-1462
      if (rows.length) out.push({ id: o.id, name: rec.name || o.id, ranked: !!rec.ranked, ranks: o.rank, roll_numbers: rows });
    });
    // F-100 M9 (R-M9S-1, R-M9S-4): the species abilities' roll numbers (Claws' damage and Crit SET)
    speciesAbilityRowSources(sheet, charbuild).forEach(function (a) {
      if (a.roll_numbers) out.push({ id: a.id, name: a.name, ranked: false, ranks: 1, species: a.species, roll_numbers: a.roll_numbers });
    });
    // F-100 M10 (R-M10S-4): the owned upgrades' dials (V2), V1's count resolved into each row's `count`
    // F-100 M11 (R-M11C-12): a dial's `amount: {of: force_rating}` resolved here to the owner's rating (_resolveDialAmounts,
    // through _resolveCountOf's force_rating arm — the one reader); a rating of 0 drops the row, as count_of's does.
    forcePowerRowSources(sheet, charbuild).forEach(function (a) {
      if (!a.roll_numbers) return;
      var rows = _resolveDialAmounts(_resolveCountOf(a.roll_numbers, sheet, charbuild), sheet, charbuild);
      if (rows.length) out.push({ id: a.id, name: a.name, ranked: false, ranks: 1, power: a.power, ability: a.ability, roll_numbers: rows });
    });
    // F-100 M12 (R-M12C-42): the owned signature nodes' roll numbers (none ship today; the arm is the shape's)
    sigAbilityRowSources(sheet, charbuild).forEach(function (a) {
      if (!a.roll_numbers) return;
      var rows = _resolveCountOf(a.roll_numbers, sheet, charbuild);
      if (rows.length) out.push({ id: a.id, name: a.name, ranked: false, ranks: 1, signature: a.ability, roll_numbers: rows });
    });
    return out;
  }

  // F-100 THE SURFACING MISSION (card f100-surfacing-roll-options-card R-SRO-3/4; brief f100-surfacing-roll-options-vocab
  // §3, ruled ADDENDUM 8 F1): the owner's talents that carry `spend` or `target` rows — ownedTalentRollSources' ownership
  // and rank count (bought ranks + species grants, ownedRankCounts) and its chosen-anchor resolution, one walk for both
  // arrays. `arr` ∈ 'spend' | 'target'. → [{id, name, ranked, ranks, description, rows}]. Read by
  // SWRPGQualityRows.talentSpendRows / talentTargetOffers / targetRows' talent leg.
  function ownedTalentRowSources(sheet, charbuild, arr) {
    var talents = charbuild && charbuild.talents;
    _requireTalentRegistry(talents, 'ownedTalentRowSources');
    if (arr !== 'spend' && arr !== 'target') return [];
    var ids = [];
    (Array.isArray(sheet && sheet.talents) ? sheet.talents : []).forEach(function (e) {
      if (!e || !e.id) return;
      for (var i = 0, n = Math.max(1, Number(e.rank) || 1); i < n; i++) ids.push(e.id);
    });
    grantedTalentsAtRender(sheet, charbuild).forEach(function (g) {
      for (var i = 0, n = Math.max(1, Number(g.rank) || 1); i < n; i++) ids.push(g.id);
    });
    var out = [];
    ownedRankCounts(ids).forEach(function (o) {
      var rec = Object.prototype.hasOwnProperty.call(talents, o.id) ? talents[o.id] : null;
      if (!rec || !Array.isArray(rec[arr]) || !rec[arr].length) return;
      var rows = _resolveChosenAnchors(rec[arr], sheet, charbuild, o.id);   // R-M8G-9
      if (rows.length) out.push({ id: o.id, name: rec.name || o.id, ranked: !!rec.ranked, ranks: o.rank,
                                  description: String(rec.description || ''), rows: rows });
    });
    return out;
  }

  // F-100 M12 (f100-m12-build-card ADDENDUM 38, R-M12B-131): a talent's M12 item rows apply
  // (ownedItemEffects), so a TOLD row whose words those rows now carry — the spans overlap — is not said twice and drops;
  // OFF, every TOLD row stands (byte-identical to before M12). By SHAPE, never an id list: an item row is M12's when
  // ownedItemEffects asks the key for it — {all: weapons} other than qualities_reduce (Burly's LIVE half), another
  // talent's pick (item.talent), a dark op (ITEM_OPS_DARK), or a pick whose pool names a KIND (QK1).
  function _m12ItemRow(rec, row) {
    var it = row && row.item;
    if (!it || typeof it !== 'object') return false;
    if (it.all === 'weapons') return row.op !== 'qualities_reduce';
    if (typeof it.talent === 'string' || ITEM_OPS_DARK[row.op]) return true;
    var kind = false;
    ['roll_numbers', 'item_effects', 'pool_mods', 'told'].forEach(function (k) {
      (Array.isArray(rec[k]) ? rec[k] : []).forEach(function (r) {
        var p = r && r.pick;
        if (p && p.id === it.chosen && p.kind === 'item' && p.pool && typeof p.pool === 'object' && p.pool.kind && typeof p.pool.kind === 'object') kind = true;
      });
    });
    return kind;
  }
  function _toldLessM12ItemWords(rec, told) {
    var spans = (Array.isArray(rec.item_effects) ? rec.item_effects : [])
      .filter(function (r) { return r && r.words && _m12ItemRow(rec, r); }).map(function (r) { return r.words; });
    if (!spans.length) return told;
    return told.filter(function (t) {
      var w = t && t.words;
      return !(w && spans.some(function (s) { return s.start < w.end && w.start < s.end; }));
    });
  }

  // F-100 THE SURFACING MISSION (card f100-surfacing-roll-options-card R-SRO-6 as amended at ADDENDUM 8 F8): R-M12B-131's
  // mechanism, three more row kinds. A talent's spend row (`words`), target row (`condition`) and reroll
  // pool_mods row (`words`) are OFFERED at the roll, so a TOLD row whose span they overlap is not said twice and drops.
  // By SHAPE, never an id list. The told rows retire in DATA at the deletion lap (R-EFL-9 / R-FFL-9).
  function _toldLessRollOptionWords(rec, told) {
    var spans = [];
    (Array.isArray(rec.spend) ? rec.spend : []).forEach(function (r) { if (r && r.words) spans.push(r.words); });
    (Array.isArray(rec.target) ? rec.target : []).forEach(function (r) { if (r && r.condition && typeof r.condition === 'object') spans.push(r.condition); });
    (Array.isArray(rec.pool_mods) ? rec.pool_mods : []).forEach(function (r) { if (r && r.direction === 'reroll' && r.words) spans.push(r.words); });
    // roll-options card ADDENDUM 14 (brief §3.4): a row marked `dark: roll_options` of any live kind (family A's pool_mods /
    // roll_numbers / effects) is offered at the roll too, so its words drop the told row they overlap.
    ['pool_mods', 'roll_numbers', 'effects'].forEach(function (k) {
      (Array.isArray(rec[k]) ? rec[k] : []).forEach(function (r) { if (r && r.dark && r.words && r.direction !== 'reroll') spans.push(r.words); });
    });
    if (!spans.length) return told;
    return told.filter(function (t) {
      var w = t && t.words;
      return !(w && spans.some(function (s) { return s.start < w.end && w.start < s.end; }));
    });
  }

  // F-100 M12 (ADDENDUM 39, R-M12B-134): a TOLD row whose `words` span lies wholly INSIDE another SHOWN TOLD row of the same
  // talent is not shown separately — the wider row already tells it. Key-independent, by span: Ichor Blade's whole-text row
  // (restored) holds its two narrow rows OFF; ON R-M12B-131 drops the wide row first and the narrow two show. Two equal
  // spans keep the first. No talent nested TOLD rows before M12 (0 of 1,429 rows over six registries at 5c57b7cf).
  function _toldLessContained(told) {
    var w = function (t) { return t && t.words && typeof t.words.start === 'number' ? t.words : null; };
    return told.filter(function (t, i) {
      var a = w(t);
      return !a || !told.some(function (u, j) {
        var b = w(u);
        if (j === i || !b || b.start > a.start || a.end > b.end) return false;
        return (b.end - b.start) > (a.end - a.start) || j < i;
      });
    });
  }

  // F-100 M8 step 3 (frame F6, "a TOLD row at its moment"; R-M8K-5, told_entry): the owner's talents that carry `told`
  // rows — the same ownership as ownedTalentRollSources (bought ranks + species grants). A told row is SHOWN, never
  // computed; a surface places it at its moment when its anchors reach that screen. → [{ id, name, description, told }]
  function ownedTalentToldSources(sheet, charbuild) {
    var talents = charbuild && charbuild.talents;
    _requireTalentRegistry(talents, 'ownedTalentToldSources');
    var seen = {}, out = [];
    (Array.isArray(sheet && sheet.talents) ? sheet.talents : []).concat(grantedTalentsAtRender(sheet, charbuild)).forEach(function (e) {
      var id = e && e.id;
      if (!id || seen[id] || !Object.prototype.hasOwnProperty.call(talents, id)) return;
      seen[id] = 1;
      var rec = talents[id], told = rec.told;
      if (Array.isArray(told) && told.length) told = _toldLessRollOptionWords(rec, _toldLessM12ItemWords(rec, told));   // R-M12B-131 (+ ADDENDUM 8 F8)
      if (Array.isArray(told) && told.length > 1) told = _toldLessContained(told);                           // R-M12B-134
      if (Array.isArray(told) && told.length) told = _resolveChosenAnchors(told, sheet, charbuild, id);     // B-1484: a chosen anchor → the pick (R-M8G-9)
      // A5 (ruling argo-dataset-import-draft ADDENDUM 5 Q4 (b)): each source carries `_path` {kind, id, path}, the DISPLAY-ONLY
      // address of the text its told spans slice, for the imported-text accessor (SWRPGSources.ruleTextSpan). Never saved.
      if (Array.isArray(told) && told.length) out.push({ id: id, name: rec.name || id, description: String(rec.description || ''), told: told,
        _path: { kind: 'talents', id: id, path: 'description' } });
    });
    // F-100 M9 (R-M9S-1): a species ability's TOLD rows, their words a span of the ability's own text
    speciesAbilityRowSources(sheet, charbuild).forEach(function (a) {
      if (a.told) out.push({ id: a.id, name: a.name, description: a.description, species: a.species, told: a.told,
        _path: a._path ? { kind: 'species', id: a._path.id, path: a._path.path } : null });
    });
    // F-100 M10 (R-M10S-1): an owned upgrade's TOLD rows, their words a span of the upgrade's own text
    forcePowerRowSources(sheet, charbuild).forEach(function (a) {
      if (a.told) out.push({ id: a.id, name: a.name, description: a.description, power: a.power, told: a.told,
        _path: { kind: 'force_powers', id: a.power, path: 'abilities.' + a.ability + '.description' } });
    });
    // F-100 M12 (R-M12C-42): an owned signature node's TOLD rows
    sigAbilityRowSources(sheet, charbuild).forEach(function (a) {
      if (a.told) out.push({ id: a.id, name: a.name, description: a.description, signature: a.ability, told: a.told,
        _path: { kind: 'signature_abilities', id: a.ability, path: 'abilities.' + a.node + '.description' } });
    });
    return out;
  }

  // ── F-100 M9: A SPECIES ABILITY'S WORKING ROWS (rulings f100-m9-shapes-card R-M9S-1..6; f100-m9-build-card R-M9B-2) ──
  // A species ability carries the talent record's four row arrays ON the ability (R-M9S-1). Its OWNER is the ability:
  // { id: 'species:<speciesId>:<abilitySlug>', name, description, species, ranked: false, ranks: 1, …its arrays }, the
  // same shape the owned-talent readers return, so every consumer of ownedTalent{Pool,Roll,Told}Sources (poolMods.collect,
  // rollNumbersAt, the hub's told lines, the Yard's credits) reads a species line with the SAME parts as a talent's
  // ("no-compromise mirror", shapes card §4) and its origin in the id. The walk is speciesAbilitiesResolved (top level +
  // every PICKED option), so an unpicked option's ability works for nobody; a bought-out ability (R-SFC-2,
  // `creationBuyouts` by abilitySlug) drops WITH its rows. A species row has no ranks (per_rank refused, R-M9S-2), so
  // `ranked: false` and collect multiplies by 1. `description` is the resolved (whitespace-normal) text, which is the
  // stored text on every row-carrying ability today (0 of 404 differ; test/f100_m9_species_readers.cjs pins it), so a
  // row's `words`/`condition` span reads it as the validator does.
  // (The species rules' key that gated every arm here, R-M9B-2, was deleted at release-r7-bug-burndown ADDENDUM 638.)
  var SPECIES_ROW_ARRAYS = ['pool_mods', 'roll_numbers', 'effects', 'told'];
  // R-SPF-4 (`f100-surfacing-preflip-species-card`, executing R-M9B-48 (2)): a row is applied ONLY while every span it
  // carries recomputes — `words` and a span `condition` over its own ability's STORED words, an `unless` over its sibling's —
  // through the ONE hash (lib/shared/textHash.js). A row whose words moved is not applied anywhere; it rides on the owner as
  // `stale: [{…row, stale: true, array}]` so a surface can say so (the words of that notice are the frames cards'). No hash
  // module loaded = nothing can be checked = nothing applied (unknown never applies).
  // R-SPF-1: a row carrying `unless` rides with `unless_text` ("unless <Sibling>: <the sibling's words>"), which poolMods
  // offers on the hub's existing condition line; it is never applied on its own.
  function _textHashCore() {
    var T = (root && root.SWRPGTextHash) || null;
    if (!T && typeof require === 'function') { try { T = require('./textHash.js'); } catch (e) { T = null; } }
    return T && typeof T.spanOk === 'function' ? T : null;
  }
  function _speciesAbilityWords(rec) {   // every ability of the record (top level + every option's) by its normal name → STORED words
    var m = {};
    function add(a) { if (a && a.name) { var k = String(a.name).replace(/\s+/g, ' ').trim(); if (!Object.prototype.hasOwnProperty.call(m, k)) m[k] = String(a.description || ''); } }
    (rec.special_abilities || []).forEach(add);
    (rec.option_choices || []).forEach(function (oc) { ((oc && oc.options) || []).forEach(function (op) { ((op && op.special_abilities) || []).forEach(add); }); });
    return m;
  }
  function speciesAbilityRowSources(sheet, charbuild) {
    var rec = _sheetSpecies(sheet, charbuild);
    if (!rec) return [];
    var sid = rec.id || sheet.speciesId;
    var bought = (sheet.creationBuyouts && typeof sheet.creationBuyouts === 'object') ? sheet.creationBuyouts : {};
    var TH = _textHashCore(), words = _speciesAbilityWords(rec);
    var H = TH && typeof TH.spanHolds === 'function' ? TH.spanHolds : (TH ? TH.spanOk : null);
    var out = [];
    speciesAbilitiesResolved(rec, sheet.speciesOptionPicks).forEach(function (a) {
      var slug = abilitySlug(a.name);
      if (bought[slug]) return;
      var o = { id: 'species:' + sid + ':' + slug, name: a.name, description: a.description, species: sid, ranked: false, ranks: 1, _path: a._path };   // A5: display-only
      var own = Object.prototype.hasOwnProperty.call(words, a.name) ? words[a.name] : a.description, any = false, stale = [];
      SPECIES_ROW_ARRAYS.forEach(function (k) {
        if (!Array.isArray(a[k]) || !a[k].length) return;
        var kept = [];
        a[k].forEach(function (row) {
          if (!row || typeof row !== 'object') return;
          var u = row.unless, sib = u && typeof u.ability === 'string' ? u.ability.replace(/\s+/g, ' ').trim() : null;
          var sibWords = sib != null && Object.prototype.hasOwnProperty.call(words, sib) && sib !== a.name ? words[sib] : null;
          // R-AAC-27 (a): spanHolds, not spanOk — in a copy whose book text was REMOVED (siteSettings BOOK_CONTENT), a row
          // whose words are gone applies exactly as with them present; an EDITED text still goes stale (textHash.js).
          var holds = !!TH && H(own, row.words) &&
            (row.condition == null || typeof row.condition === 'string' || H(own, row.condition)) &&
            (u == null || (sibWords != null && H(sibWords, u.words)));
          if (!holds) { stale.push(Object.assign({}, row, { stale: true, array: k })); return; }
          kept.push(u == null ? row : Object.assign({}, row, {
            unless_text: 'unless ' + sib + ': ' + sibWords.slice(u.words.start, u.words.end).replace(/\s+/g, ' ').trim() }));
        });
        if (kept.length) { o[k] = kept; any = true; }
      });
      if (stale.length) { o.stale = stale; any = true; }
      if (any) out.push(o);
    });
    return out;
  }
  // ── THE SPECIES SWITCH'S ONE-TIME LINE (ruling `f100-surfacing-species-flip-card` R-SFL-3 as amended by ADDENDUM 4 F5;
  // D-229 N1 (b) · W1 (a); the stamp ruled at ADDENDUM 14). speciesFlipNotice → { species, lines, words } when the
  // character's species has at least one WORKING row — `pool_mods` + `roll_numbers` + `effects` through the one owner walk
  // above (a stale row is not working; a TOLD row never counts, so a TOLD-only species gets no line) — and the sheet carries
  // no `rules_seen.species` of this generation; null otherwise. (The switch that hid the walk is deleted, ADDENDUM 638 Q1 (a):
  // the line stays, its predicate less only the key.) THE STAMP (R-Y2-1, on paper at ADDENDUM 14): `sheet.rules_seen` is an object, `rules_seen.species: 1` = the
  // species flip of generation 1 seen, absent = unseen; ONE writer (the line's "Got it", speciesFlipSeenPatch), ONE reader
  // (this predicate); nothing derives a number from it. The Force and engine flips add their own keys to the same object.
  var SPECIES_FLIP_GENERATION = 1;
  function speciesFlipNotice(sheet, charbuild) {
    if (!sheet) return null;
    var rs = (sheet.rules_seen && typeof sheet.rules_seen === 'object') ? sheet.rules_seen : {};
    if (typeof rs.species === 'number' && rs.species >= SPECIES_FLIP_GENERATION) return null;
    var n = 0;
    speciesAbilityRowSources(sheet, charbuild).forEach(function (o) {
      ['pool_mods', 'roll_numbers', 'effects'].forEach(function (k) { if (Array.isArray(o[k])) n += o[k].length; });
    });
    if (!n) return null;
    var rec = _sheetSpecies(sheet, charbuild);
    var name = String((rec && rec.name) || sheet.species || '').replace(/\s+/g, ' ').trim();
    // W1 (a), Jason's words verbatim, with the "1 line" singular (ADDENDUM 4 F4, ADDENDUM 7 R6)
    return { species: name, lines: n,
      words: 'Your ' + name + '\u2019s abilities now work on this sheet: ' + n + (n === 1 ? ' line' : ' lines') + '. See them in ABILITIES.' };
  }
  function speciesFlipSeenPatch(sheet) {
    var prev = (sheet && sheet.rules_seen && typeof sheet.rules_seen === 'object') ? sheet.rules_seen : {};
    return { rules_seen: Object.assign({}, prev, { species: SPECIES_FLIP_GENERATION }) };
  }
  // ── THE ENGINE SWITCH'S ONE-TIME LINE (ruling `f100-surfacing-engine-flip-card` R-EFL-4 as ruled at ADDENDUM 12: F1 (b) ·
  // F2 (a) · F3 (a); DECISIONS D-284 (1)). engineFlipNotice(sheet, charbuild, deps) → { lines, parts, missing, words } when
  // the character has at least one rule that works on the sheet, and the sheet carries no `rules_seen.engine` of this
  // generation; null otherwise. THE WALK is the engine-flip frames' (scripts/f100_engine_flip_fixture.cjs
  // walk(), the independent oracle test/f100_engine_flip.cjs S3 compares against), part for part:
  //   signature        the owned signature abilities' working rows (pool_mods + roll_numbers + effects)
  //   attachments      each modded weapon / armour entry's lines with M12's modelled arms minus without — the entry
  //                    resolved twice, the second with `withoutModelled: true` (ItemResolve.applyInstalledAttachments'
  //                    one such option, ADDENDUM 638 Q1), a multiset diff over
  //                    the row fields plus one per moved scalar
  //   qualities        each resolved weapon's spend rows + its target rows against a person (the hub's own question)
  //   qualityTalents   the owned talents' item rows
  //   careerPowers     the career's powers + one per specialization bonus (a list or a choice)
  //   careerAttributes the career's effect rows
  // deps = { equipment (the sheet's resolved equipment), registries (weapons / armor / attachments), qualities (the
  // vocabulary) }; a part whose input is absent counts 0 and its input is named in `missing` (never silent). THE STAMP
  // `sheet.rules_seen.engine: 1` beside `species` (the shape on paper at the species card ADDENDUM 14; this adds the key):
  // ONE writer (the line's "Got it", engineFlipSeenPatch), ONE reader (this predicate); nothing derives a number from it.
  var ENGINE_FLIP_GENERATION = 1;
  var _EFL_ROWS = ['pool_mods', 'roll_numbers', 'qualities', '_attachmentCarry', '_characterEffects', '_innateTalents',
    '_qualitiesReduced', '_qualityOffers', '_spendCostDeltas'];
  var _EFL_SCALARS = ['damage', 'crit', 'range', 'encumbrance', 'soak', 'defense', 'defense_melee', 'defense_ranged'];
  function _eflModule(name, file) {
    var M = (root && root[name]) || null;
    if (!M && typeof require === 'function') { try { M = require(file); } catch (e) { M = null; } }
    return M;
  }
  function _eflAttachmentLines(IR, kind, rec, entries, attachments) {
    var on = IR.applyInstalledAttachments(kind, rec, entries, attachments, {}) || {};
    var off = IR.applyInstalledAttachments(kind, rec, entries, attachments, { withoutModelled: true }) || {};
    var n = 0;
    _EFL_ROWS.forEach(function (k) {
      var left = (Array.isArray(off[k]) ? off[k] : []).map(function (x) { return JSON.stringify(x); });
      (Array.isArray(on[k]) ? on[k] : []).forEach(function (x) { var i = left.indexOf(JSON.stringify(x)); if (i >= 0) left.splice(i, 1); else n++; });
    });
    _EFL_SCALARS.forEach(function (k) { if (JSON.stringify(on[k]) !== JSON.stringify(off[k])) n++; });
    return n;
  }
  function engineFlipNotice(sheet, charbuild, deps) {
    if (!sheet) return null;
    var rs = (sheet.rules_seen && typeof sheet.rules_seen === 'object') ? sheet.rules_seen : {};
    if (typeof rs.engine === 'number' && rs.engine >= ENGINE_FLIP_GENERATION) return null;
    deps = deps || {};
    var cb = charbuild || {}, missing = [];
    var parts = { signature: 0, attachments: 0, qualities: 0, qualityTalents: 0, careerPowers: 0, careerAttributes: 0 };
    sigAbilityRowSources(sheet, cb).forEach(function (o) {
      ['pool_mods', 'roll_numbers', 'effects'].forEach(function (k) { if (Array.isArray(o[k])) parts.signature += o[k].length; });
    });
    var IR = _eflModule('ItemResolve', './itemResolve.js'), regs = deps.registries || null, raw = sheet.equipment || {};
    if (!IR || typeof IR.applyInstalledAttachments !== 'function') missing.push('ItemResolve');
    else if (!regs) missing.push('registries');
    else {
      var modded = function (kind, list, reg) {
        (list || []).forEach(function (e) {
          var rec = e && reg && reg[e.id];
          if (rec && Array.isArray(e.attachments) && e.attachments.length) parts.attachments += _eflAttachmentLines(IR, kind, rec, e.attachments, regs.attachments);
        });
      };
      modded('weapon', Array.isArray(raw.weapons) ? raw.weapons : [], regs.weapons);
      modded('armor', raw.armor ? [raw.armor] : [], regs.armor);
    }
    var QR = _eflModule('SWRPGQualityRows', './qualityRows.js'), eq = deps.equipment || null, vocab = deps.qualities || null;
    if (!QR || typeof QR.spendRows !== 'function') missing.push('SWRPGQualityRows');
    else if (!eq) missing.push('equipment');
    else if (!vocab) missing.push('qualities');
    else (eq.weapons || []).forEach(function (w) {
      parts.qualities += (QR.spendRows(w, { vocab: vocab }) || []).length + (((QR.targetRows(w, { kind: 'personal' }, { vocab: vocab }) || {}).rows) || []).length;
    });
    parts.qualityTalents = (ownedItemEffects(sheet, cb) || []).length;
    var who = { careerId: sheetCareerId(sheet, cb.careers || {}),
      specializationIds: (Array.isArray(sheet.specializations) ? sheet.specializations : []).map(function (s) { return s && s.id; }) };
    var cp = careerPowersOf(who, cb);
    parts.careerPowers = (cp.career || []).length + (cp.bonus || []).length;
    parts.careerAttributes = careerEffectsOf(sheet, cb).length;
    var n = 0;
    Object.keys(parts).forEach(function (k) { n += parts[k]; });
    if (!n) return null;
    // D-284 (1) verbatim, with the singular (card ADDENDUM 9: the species "1 line" precedent)
    return { lines: n, parts: parts, missing: missing,
      words: n + (n === 1 ? ' more rule now works' : ' more rules now work') + ' on this sheet. See ABILITIES and GEAR.' };
  }
  function engineFlipSeenPatch(sheet) {
    var prev = (sheet && sheet.rules_seen && typeof sheet.rules_seen === 'object') ? sheet.rules_seen : {};
    return { rules_seen: Object.assign({}, prev, { engine: ENGINE_FLIP_GENERATION }) };
  }
  // The owner a species row's line names, by its owner id (a surface holding a reminder's `talentId` or a swap's `because`):
  // { name, description } off the species record — its top-level abilities, then every option's (names are unique
  // within a species, the walk's own de-dup) — or null. A NAME lookup for the words a line prints; it decides nothing.
  function speciesAbilityOwner(ownerId, charbuild) {
    var m = /^species:([^:]+):(.+)$/.exec(String(ownerId || ''));
    var rec = m && charbuild && charbuild.species ? charbuild.species[m[1]] : null;
    if (!rec) return null;
    var all = (rec.special_abilities || []).slice();
    (rec.option_choices || []).forEach(function (oc) {
      ((oc && oc.options) || []).forEach(function (o) { all = all.concat((o && o.special_abilities) || []); });
    });
    var hit = all.filter(function (a) { return a && abilitySlug(String(a.name || '').replace(/\s+/g, ' ').trim()) === m[2]; })[0];
    return hit ? { name: String(hit.name).replace(/\s+/g, ' ').trim(), description: String(hit.description || '').replace(/\s+/g, ' ').trim() } : null;
  }
  // The owner's species effects of the ops asked, [{ owner, effect }].
  function _speciesEffects(sheet, charbuild, ops) {
    var out = [];
    speciesAbilityRowSources(sheet, charbuild).forEach(function (o) {
      (o.effects || []).forEach(function (e) { if (e && ops.indexOf(e.op) !== -1) out.push({ owner: o, effect: e }); });
    });
    return out;
  }
  // computeDerived's species arm (R-M9S-1): an always-on `defense_delta` (no `when`, no condition) — Kobok's Natural Armor.
  // `_rows` (internal; derivedBecause's trace): { key, op, amount, owner } pushed where each is added.
  function speciesDefenseBonuses(sheet, charbuild, _rows) {
    var b = { meleeDefenseBonus: 0, rangedDefenseBonus: 0 };
    _speciesEffects(sheet, charbuild, ['defense_delta']).forEach(function (x) {
      var e = x.effect;
      if (e.when != null || e.condition || e.cost || e.limit) return;
      var key = e.target === 'melee' ? 'meleeDefenseBonus' : (e.target === 'ranged' ? 'rangedDefenseBonus' : null);
      if (!key) return;
      b[key] += Number(e.amount) || 0;
      if (_rows) _rows.push({ key: key, op: e.op, amount: Number(e.amount) || 0, owner: x.owner });
    });
    return b;
  }
  // R-M9S-5's two readers' species input: the summed `encumbrance_threshold_delta` / `starting_credits_delta`.
  // `charbuild` omitted (the app's 7 callers): the sheet's own stamp view, else the discovery view — the species record its
  // rows resolve on (B-1194's rule).
  function speciesEncumbranceDelta(sheet, charbuild) {
    return speciesEncumbranceRows(sheet, charbuild).reduce(function (t, x) { return t + x.amount; }, 0);
  }
  // The same walk, each owner's delta named — [{ amount, owner }]: the sum above, and derivedBecause's rows.
  function speciesEncumbranceRows(sheet, charbuild) {
    charbuild = charbuild || talentViewFor(sheet) || (root && root._canonicalCharbuild) || null;
    return _speciesEffects(sheet, charbuild, ['encumbrance_threshold_delta']).map(function (x) { return { amount: Number(x.effect.amount) || 0, owner: x.owner }; });
  }
  function speciesCreditsDelta(sheet, charbuild) {
    return _speciesEffects(sheet, charbuild, ['starting_credits_delta']).reduce(function (t, x) { return t + (Number(x.effect.amount) || 0); }, 0);
  }
  // The same deltas off a species RECORD, for the creator (which holds the record, the picks and the buyouts, and no sheet
  // yet): the same walk, the same buyout drop.
  // F-100 surfacing (R-SCC-6, brief §3.8): the walk returns its ROWS ({amount, ability, species}) so a because line names
  // each delta's owner off the SAME walk the sum reads — never a second one. The sum is the rows' total, unchanged.
  function _speciesEffectRowsOf(rec, picks, buyouts, op) {
    var out = [];
    if (!rec) return out;
    var bought = (buyouts && typeof buyouts === 'object') ? buyouts : {};
    speciesAbilitiesResolved(rec, picks).forEach(function (a) {
      if (bought[abilitySlug(a.name)]) return;
      (a.effects || []).forEach(function (e) {
        if (e && e.op === op) out.push({ amount: Number(e.amount) || 0, ability: a.name, species: rec.name || rec.id });
      });
    });
    return out;
  }
  function _speciesEffectSumOf(rec, picks, buyouts, op) {
    return _speciesEffectRowsOf(rec, picks, buyouts, op).reduce(function (t, r) { return t + r.amount; }, 0);
  }
  function speciesCreditsDeltaOf(rec, picks, buyouts) { return _speciesEffectSumOf(rec, picks, buyouts, 'starting_credits_delta'); }
  function speciesEncumbranceDeltaOf(rec, picks, buyouts) { return _speciesEffectSumOf(rec, picks, buyouts, 'encumbrance_threshold_delta'); }
  // the creator's encumbrance because (R-SCC-6, csg_fefze's "No Hands"): the limit's species rows, off the one walk
  function speciesEncumbranceRowsOf(rec, picks, buyouts) { return _speciesEffectRowsOf(rec, picks, buyouts, 'encumbrance_threshold_delta'); }
  // ── F-100 M10: A FORCE POWER'S UPGRADE ROWS (rulings f100-m10-shapes-card R-M10S-1..7; f100-m10-build-card step 5) ──
  // An upgrade carries the talent record's row arrays ON the ability (R-M10S-1). Its OWNER is the upgrade:
  // { id: 'force:<powerId>:<abilityKey>', name, description, power, ability, family, ranked: false, ranks: 1, …its arrays },
  // the same shape the owned-talent readers return, so every consumer of ownedTalent{Pool,Roll,Told}Sources reads an
  // upgrade's line with the SAME parts as a talent's and its origin in the id (the M9 species precedent). A basic-power row
  // applies when the power is owned; an upgrade's rows when V1's count of it is ≥ 1 (R-M10S-2) — ONCE, never per rank
  // (`ranked: false`): a SCALED row says so with `count_of: {of: power_upgrades}` and multiplies by the count there. The
  // record is read off the character's own view (the stamp view's `forcePowers`, else the charbuild handed in). (The force
  // key that once kept these DARK, R-M10S-7, was deleted by post1-switch-deletion, ADDENDUM 638.)
  var FORCE_ROW_ARRAYS = ['pool_mods', 'roll_numbers', 'effects', 'told'];
  function _sheetPowerEntries(sheet) {
    return (Array.isArray(sheet && sheet.forcePowers) ? sheet.forcePowers : []).filter(isCanonicalPowerEntry);
  }
  // V1 — THE ONE COUNT READER (R-M10S-2): the ranks of ONE upgrade bought = the times `key` ('<powerId>.<abilityKey>')
  // appears in the owner's sheet.forcePowers[power].upgrades. No new save field (Q1). 0 for an unowned power, or for a
  // malformed key. A second count path is a defect (PRAXIS §5).
  function powerUpgradeCount(sheet, key) {
    var k = String(key || ''), dot = k.indexOf('.');
    if (dot < 1) return 0;
    var pid = k.slice(0, dot), ab = k.slice(dot + 1), n = 0;
    _sheetPowerEntries(sheet).forEach(function (p) {
      if (p.id !== pid) return;
      (Array.isArray(p.upgrades) ? p.upgrades : []).forEach(function (u) { if (u === ab) n += 1; });
    });
    return n;
  }
  // F-100 M11 R4 (f100-m11-census-card ADDENDUM 3; f100-m11-build-card step 7) — FAIL CLOSED on a replaced power. A STAMPED
  // sheet's powers resolve through its OWN stamp view. While a host's view resolver is registered and answers null for it
  // (a shipped pack it names has not loaded, or a user pack is not on this device — stampTalentView's C4.4), which ids its
  // stamps replace is unknowable, so NO power yields rows ({}) — never the book's record under an id a pack replaces (or
  // the device's toggle view). The rows return when the pack lands (talentView's epoch). An unstamped sheet, or a host
  // with no resolver (node callers that hand the view in), reads as before.
  function _powerRegistry(sheet, charbuild) {
    var v = talentViewFor(sheet);
    if (v && v.forcePowers) return v.forcePowers;
    var stamped = Array.isArray(sheet && sheet.mods) && sheet.mods.some(function (m) { return typeof m === 'string' && m; });
    if (stamped && _talentViewResolver) return {};
    return (charbuild && charbuild.forcePowers) || (root && root._canonicalCharbuild && root._canonicalCharbuild.forcePowers) || {};
  }
  function forcePowerRowSources(sheet, charbuild) {
    var reg = _powerRegistry(sheet, charbuild), out = [];
    _sheetPowerEntries(sheet).forEach(function (p) {
      var rec = Object.prototype.hasOwnProperty.call(reg, p.id) ? reg[p.id] : null;
      if (!rec || !rec.abilities) return;
      Object.keys(rec.abilities).forEach(function (k) {
        var a = rec.abilities[k];
        if (!a) return;
        var owned = a.family === 'basic' ? true : powerUpgradeCount(sheet, p.id + '.' + k) >= 1;
        if (!owned) return;
        var o = { id: 'force:' + p.id + ':' + k, name: (rec.name || p.id) + ': ' + (a.name || k), description: String(a.description || ''),
                  power: p.id, ability: k, family: a.family || null, ranked: false, ranks: 1 }, any = false;
        FORCE_ROW_ARRAYS.forEach(function (arr) { if (Array.isArray(a[arr]) && a[arr].length) { o[arr] = a[arr]; any = true; } });
        if (any) out.push(o);
      });
    });
    return out;
  }
  // V3 — THE COMMITTED COUNT, ONE FUNCTION (R-M10S-5; FaD p.280: each committed Force die lowers the
  // Force rating by one). `committed` is SESSION state, never saved (Q7): a number (the hub's count today), or a set
  // { <key>: true | n } — a power's id (B-622's paper commits: one die each; keyed by INDEX until the surfacing hub, R-SHC-5)
  // or an upgrade's '<powerId>.<abilityKey>' holding n dice (commitValueOf). It counts DICE (true = 1, n = n), not keys.
  // KEY-INDEPENDENT on purpose: it is the arithmetic the hub's `available` already did, now in one home.
  function committedForceDice(committed) {
    if (typeof committed === 'number') return committed > 0 ? Math.floor(committed) : 0;
    if (!committed || typeof committed !== 'object') return 0;
    return Object.keys(committed).reduce(function (t, k) {
      var v = committed[k];
      return t + (v === true ? 1 : (typeof v === 'number' && v > 0 ? Math.floor(v) : 0));
    }, 0);
  }
  // R-SHC-5 as errata'd (ruling f100-surfacing-hub-concept ADDENDUM 7 C2 (a)) — A DURATION COMMIT'S DICE, ONE READER: the
  // count of `[FO]` tokens in the Duration ability's OWN words ("Commit [FO][FO][FO] to sustain…": Bind 3). No field
  // restates it (D-215: one number, one home — the record's printed words). 0 = the ability names no commit (the STAYS
  // TOLD class): no spend row, no commit. The hub's spend row and the committed set's writer both read this.
  //
  // ARGO A1 — THE FIELD FIRST (ruling argo-a1-export-fields D3/D4, R-AAC-27 (b)). `commit_dice`, written from these same
  // words by scripts/canonical/apply_text_encodings.py, is read when present; a record WITHOUT it (a homebrew pack, an
  // editor-made power) falls back to today's parse, unchanged (`textParse.commitDice`). That is a second path for one
  // number, written once, here: test/argo_same_numbers.cjs equates the field to this parse over every shipped record and
  // reds on a difference. In a copy whose book text was removed the parse reads "" and so "none"; every shipped record
  // there carries its field.
  function durationCommitDice(ability) {
    if (ability && typeof ability.commit_dice === 'number') return ability.commit_dice > 0 ? Math.floor(ability.commit_dice) : 0;
    return textParse.commitDice(ability);
  }
  // TODAY'S PARSES of a record's printed words, kept ONE each, here, so the app's readers fall back to them and the
  // equivalence census runs exactly the code the app runs (D4's condition). Never call these for a decision directly:
  // the readers below put the field first.
  var TALENT_POINTER_RE = /^receive\s+(?:\d+\s+ranks?\s+in\s+)?the\s+talent\s+[\u201c"]?([^\u201c\u201d".]+)[.\s]*[\u201d"]?\s*\.?\s*$/i;
  var AFTER_POWER_RE = /after successfully activating the (.+?) power/i;
  var SIG_CHECK_RE = /(Simple|Easy|Average|Hard|Daunting|Formidable) \((?:\[[A-Z]{2}\])+\) ((?:[A-Z][a-z]+)(?: \([A-Z][a-z]+\))?(?: or [A-Z][a-z]+(?: \([A-Z][a-z]+\))?)?) check/;
  var textParse = {
    // durationCommitDice's count: `[FO]` tokens in the ability's own words.
    commitDice: function (ability) {
      var m = String((ability && ability.description) || '').match(/\[FO\]/g);
      return m ? m.length : 0;
    },
    // basicPowerCommits' test on ONE basic ability: its words name a commit.
    basicCommits: function (ab) { return /\bcommit/i.test(String((ab && ab.description) || '')); },
    // fcTalentPointerName: the talent a pure pointer ability names, lowercased; null when it is not one.
    talentPointerName: function (ability) {
      var m = TALENT_POINTER_RE.exec(String((ability && ability.description) || '').trim());
      return m ? m[1].trim().toLowerCase() : null;
    },
    // diceHubDurationCommits' tag: the power named by "after successfully activating the <P> power", as printed.
    afterPowerName: function (ability) {
      var m = AFTER_POWER_RE.exec(String((ability && ability.description) || ''));
      return m ? m[1] : null;
    },
    // sheetSignatureEntries' activation term: [difficulty, skill] from the base ability's words.
    sigCheck: function (ability) {
      var m = SIG_CHECK_RE.exec(String((ability && ability.description) || ''));
      return m ? [m[1], m[2]] : null;
    },
  };
  function _normName(n) { return String(n || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
  // P3 · the talent a species ability only points to: { id } from `talent_pointer`, else { name } from the parse.
  function speciesTalentPointer(ability) {
    if (ability && typeof ability.talent_pointer === 'string' && ability.talent_pointer) return { id: ability.talent_pointer };
    var n = textParse.talentPointerName(ability);
    return n ? { name: n } : null;
  }
  // P4 · the name of the power a commit follows, for the hub's tag: the `after_power` record's name, else the parse.
  // R-AE-4: a SELF-reference (`after_power` is the power that owns this ability, "the base/basic power") renders the
  // parse word when the words yield one (holocron: "base"/"basic", as printed), else the power's name (the public copy).
  function afterPowerName(ability, charbuild) {
    if (ability && typeof ability.after_power === 'string' && ability.after_power) {
      var rec = charbuild && charbuild.forcePowers ? charbuild.forcePowers[ability.after_power] : null;
      if (rec && rec.name) {
        var own = rec.abilities && Object.keys(rec.abilities).some(function (k) { return rec.abilities[k] === ability; });
        return (own && textParse.afterPowerName(ability)) || rec.name;
      }
    }
    return textParse.afterPowerName(ability);
  }
  // P5 · a signature base ability's activation check, [difficulty, skill]: `activation_check`, else the parse.
  function sigActivationCheck(ability) {
    var c = ability && ability.activation_check;
    if (c && typeof c === 'object' && c.difficulty && c.skill) return [c.difficulty, c.skill];
    return textParse.sigCheck(ability);
  }
  // B-1505 (D-402 = A; ruling `release-r7-bug-burndown` ADDENDUM 111) — DOES THE BASIC POWER ITSELF COMMIT? true when the
  // power record's `basic` ability names a commit in its OWN words ("…commit [FO] to temporarily ignore…": Endure, Knights of
  // Fate p.36). The sheet's plain Commit button shows exactly on this set; a bought upgrade's commit is the tick's, never this.
  // Read from the record, never a power name; the census over every shipped power (base and the fad-v1 overlay) is Endure
  // alone (test/b1505_basic_commit.cjs). `rec` = the power record the sheet resolves through.
  function basicPowerCommits(rec) {
    var ab = rec && rec.abilities, k;
    if (!ab || typeof ab !== 'object') return false;
    // ARGO A1 (D3/D4): `commit_dice` on the basic ability when present, else today's parse (textParse.basicCommits).
    for (k in ab) if (Object.prototype.hasOwnProperty.call(ab, k) && ab[k] && ab[k].family === 'basic'
      && (typeof ab[k].commit_dice === 'number' ? ab[k].commit_dice > 0 : textParse.basicCommits(ab[k]))) return true;
    return false;
  }
  // THE COMMITTED SET'S VALUE for one key (R-SHC-5; ADDENDUM 7 C2): '<power id>' (the sheet's basic commit) holds ONE die
  // (true); '<power id>.<ability key>' (a Duration commit) holds durationCommitDice(that ability) dice — null when the
  // ability is unknown or names no commit, so the writer commits nothing. `charbuild` = the view the sheet resolves through.
  function commitValueOf(key, charbuild) {
    var k = String(key || ''), dot = k.indexOf('.');
    if (!k) return null;
    if (dot === -1) return true;
    var rec = charbuild && charbuild.forcePowers ? charbuild.forcePowers[k.slice(0, dot)] : null;
    var n = durationCommitDice(rec && rec.abilities ? rec.abilities[k.slice(dot + 1)] : null);
    return n > 0 ? n : null;
  }
  // The Force dice a check may roll (the hub's `available`) and the Force rating `count_of force_rating` reads:
  // max(0, rating − committed). One function, both readers (R-M10S-5).
  function forceDiceAvailable(forceRating, committed) {
    return Math.max(0, (Number(forceRating) || 0) - committedForceDice(committed));
  }
  // V3 + V5 — the committed upgrades' EFFECTS: [{ owner, effect, times }] for every `effects` row of an OWNED upgrade the
  // session's committed set holds (its '<powerId>.<abilityKey>' key). A row applies only while
  // committed (R-M10S-5); nothing here is saved. `times` (ruling f100-surfacing-force-flip-card ADDENDUM 10; D-300 (3)) = the
  // COMMITS the key holds: its value counts DICE, so times = value / commitValueOf(key) — one commit for every key but a
  // stacking one (`each_time`, Farsight's Control: Perception), whose value grows by one commit's dice per commit. The ONE
  // place the division lives; the readers below multiply a row's amount by it.
  function committedForceEffects(sheet, charbuild, committed) {
    if (!committed || typeof committed !== 'object') return [];
    var out = [];
    forcePowerRowSources(sheet, charbuild).forEach(function (o) {
      var key = o.power + '.' + o.ability, v = committed[key];
      if (!(v === true || (typeof v === 'number' && v > 0))) return;
      var per = commitValueOf(key, charbuild), times = (v === true || !(typeof per === 'number' && per > 0)) ? 1 : Math.max(1, Math.floor(v / per));
      (o.effects || []).forEach(function (e) { if (e && e.cost && e.cost.commit_force) out.push({ owner: o, effect: e, times: times }); });
    });
    return out;
  }
  // The characteristics a check reads with the committed effects held: characteristic_delta behind a commit, cap 6 (EotE
  // p.134; Enhance's "to a maximum of 6"). A NEW object; the sheet's own map is never written. Key OFF → the sheet's own map.
  var CHARACTERISTIC_CAP = 6;
  function characteristicsWithCommits(sheet, charbuild, committed) {
    var base = (sheet && sheet.characteristics) || {};
    var fx = committedForceEffects(sheet, charbuild, committed).filter(function (x) { return x.effect.op === 'characteristic_delta' && x.effect.characteristic; });
    if (!fx.length) return base;
    var out = Object.assign({}, base);
    fx.forEach(function (x) {
      var c = x.effect.characteristic, cur = Number(out[c]) || 0;
      out[c] = Math.max(cur, Math.min(CHARACTERISTIC_CAP, cur + (Number(x.effect.amount) || 0) * (x.times || 1)));
    });
    return out;
  }
  // V5 — a skill's ranks with the committed skill_rank_delta rows held: rank + every delta on that skill, capped at the row's
  // `max` (never lowered below the saved rank). `skillKey` a skills.vocab id or the sheet key; `rank` the saved rank.
  function skillRankWithCommits(sheet, charbuild, committed, skillKey, rank) {
    var r = Number(rank) || 0;
    var keys = (charbuild && charbuild.skillSheetKeys) || (root && root._canonicalCharbuild && root._canonicalCharbuild.skillSheetKeys) || {};
    var add = 0, cap = null;
    committedForceEffects(sheet, charbuild, committed).forEach(function (x) {
      var e = x.effect;
      if (e.op !== 'skill_rank_delta' || !e.skill) return;
      if (e.skill !== skillKey && keys[e.skill] !== skillKey) return;
      add += (Number(e.amount) || 0) * (x.times || 1);
      if (e.max != null) cap = cap == null ? Number(e.max) : Math.min(cap, Number(e.max));
    });
    if (!add) return r;
    var v = r + add;
    if (cap != null) v = Math.min(v, cap);
    return Math.max(r, v);
  }

  // ── THE STACKING COMMIT AND THE CAP (ruling `f100-surfacing-force-flip-card` ADDENDA 10 and 12 F5; D-300 (3)) ──────────────
  // A key STACKS when its ability carries an `effects` row costed `commit_force` with `each_time: true` (the schema's
  // commit-costed branches; ONE data row: Farsight's Control: Perception, Savage Spirits p.37 as read by Jason): the writer
  // may commit it again, each commit holding commitValueOf(key) more dice, and the readers apply the row once per commit.
  function _commitRows(key, charbuild) {
    var k = String(key || ''), dot = k.indexOf('.');
    if (dot < 1) return [];
    var rec = charbuild && charbuild.forcePowers ? charbuild.forcePowers[k.slice(0, dot)] : null;
    var ab = rec && rec.abilities ? rec.abilities[k.slice(dot + 1)] : null;
    return ((ab && ab.effects) || []).filter(function (e) { return e && e.cost && e.cost.commit_force; });
  }
  function commitStacks(key, charbuild) {
    return _commitRows(key, charbuild).some(function (e) { return e.each_time === true; });
  }
  // ONE MORE COMMIT WOULD MOVE NOTHING (F5 (a), every commit-costed key): each of the key's commit-costed rows already at its
  // cap with the set AS HELD — a skill_rank_delta at its row's `max`, a characteristic_delta at 6. → the capped quantity's
  // NAME ('Brawn', 'Perception': the refusal's words "<name> at its maximum"), or null (not at cap, or nothing to cap).
  function commitAtCap(sheet, charbuild, committed, key) {
    var rows = _commitRows(key, charbuild);
    if (!rows.length) return null;
    var cbk = charbuild || (root && root._canonicalCharbuild) || {};
    var keys = cbk.skillSheetKeys || (root && root._canonicalCharbuild && root._canonicalCharbuild.skillSheetKeys) || {};
    var names = cbk.skillNames || (root && root._canonicalCharbuild && root._canonicalCharbuild.skillNames) || {};
    var set = (committed && typeof committed === 'object') ? committed : {};
    var name = null, all = rows.every(function (e) {
      if (e.op === 'characteristic_delta' && e.characteristic) {
        name = e.characteristic.charAt(0).toUpperCase() + e.characteristic.slice(1);
        return (Number(characteristicsWithCommits(sheet, charbuild, set)[e.characteristic]) || 0) >= CHARACTERISTIC_CAP;
      }
      if (e.op === 'skill_rank_delta' && e.skill && e.max != null) {
        var sk = keys[e.skill] || e.skill, saved = skillRankOf(((sheet && sheet.skills) || {})[sk]);
        name = names[e.skill] || (e.skill.charAt(0).toUpperCase() + e.skill.slice(1));
        return skillRankWithCommits(sheet, charbuild, set, sk, saved) >= Number(e.max);
      }
      return false;
    });
    return all ? name : null;
  }

  // ── THE FORCE SWITCH'S ONE-TIME LINE (ruling `f100-surfacing-force-flip-card` R-FFL-4 as amended at ADDENDA 4 R3 and 6, as
  // ruled at ADDENDUM 12 F1 (a); DECISIONS D-292 (1)). forceFlipNotice(sheet, charbuild, deps) → { lines, parts, missing,
  // words } when the character owns at least one Force rule that works on the sheet, and the sheet carries no `rules_seen.force`
  // of this generation; null otherwise. ONE OWNER WALK over the owned canonical powers, part for
  // part (the first four are the Force frames' walk, scripts/f100_force_flip_fixture.cjs walk() — the independent oracle
  // test/f100_force_flip.cjs S3 compares against):
  //   rowOffers         the owned rows' pool_mods (offered at a check)
  //   dials             each owned power's dials at its own check (SWRPGPoolMods.powerDialsAt)
  //   committedEffects  committedForceEffects at the set a sheet OPENS with ({}): 0 by construction (F1 (a)); the ticks count
  //                     what a commit would apply
  //   toldLines         the owned rows' told lines
  //   durations         each owned Duration upgrade whose own words name a commit (durationCommitDice > 0; ADDENDUM 4 R3)
  //   ticks             each owned upgrade with an `effects` row costed commit_force (the commit tick, ADDENDUM 6)
  // deps = { poolIndex } (the sheet's poolModSkillIndex(), the dials' context); absent, `dials` counts 0 and `missing` names
  // it (never silent). THE STAMP `sheet.rules_seen.force: 1` beside `species` and `engine` (the shape on paper at the species
  // card ADDENDUM 14; this adds the key): ONE writer (the line's "Got it", forceFlipSeenPatch), ONE reader (this predicate).
  var FORCE_FLIP_GENERATION = 1;
  function forceFlipNotice(sheet, charbuild, deps) {
    if (!sheet) return null;
    var rs = (sheet.rules_seen && typeof sheet.rules_seen === 'object') ? sheet.rules_seen : {};
    if (typeof rs.force === 'number' && rs.force >= FORCE_FLIP_GENERATION) return null;
    deps = deps || {};
    var cb = charbuild || {}, missing = [];
    var parts = { rowOffers: 0, dials: 0, committedEffects: 0, toldLines: 0, durations: 0, ticks: 0 };
    var rows = forcePowerRowSources(sheet, cb);
    rows.forEach(function (o) {
      parts.rowOffers += (o.pool_mods || []).length;
      parts.toldLines += (o.told || []).length;
      if (o.family !== 'basic' && (o.effects || []).some(function (e) { return e && e.cost && e.cost.commit_force; })) parts.ticks += 1;
    });
    parts.committedEffects = committedForceEffects(sheet, cb, {}).length;
    var reg = _powerRegistry(sheet, cb);
    _sheetPowerEntries(sheet).forEach(function (p) {
      var rec = Object.prototype.hasOwnProperty.call(reg, p.id) ? reg[p.id] : null;
      if (!rec || !rec.abilities) return;
      Object.keys(rec.abilities).forEach(function (k) {
        var a = rec.abilities[k];
        if (a && a.family === 'duration' && powerUpgradeCount(sheet, p.id + '.' + k) >= 1 && durationCommitDice(a) > 0) parts.durations += 1;
      });
    });
    var P = (root && root.SWRPGPoolMods) || null;
    if (!P && typeof require === 'function') { try { P = require('./poolMods.js'); } catch (e) { P = null; } }
    if (!P || typeof P.powerDialsAt !== 'function') missing.push('SWRPGPoolMods');
    else if (!deps.poolIndex) missing.push('poolIndex');
    else _sheetPowerEntries(sheet).forEach(function (p) {
      var ctx = P.contextFor(null, deps.poolIndex, undefined, 'force_power', p.id);
      parts.dials += (ctx ? P.powerDialsAt(rows, ctx, sheet) : []).length;
    });
    var n = 0;
    Object.keys(parts).forEach(function (k) { n += parts[k]; });
    if (!n) return null;
    // D-292 (1) verbatim, with the singular (card ADDENDUM 6: the engine precedent)
    return { lines: n, parts: parts, missing: missing,
      words: n + (n === 1 ? ' more Force rule now works' : ' more Force rules now work') + ' on this sheet. See FORCE POWERS.' };
  }
  function forceFlipSeenPatch(sheet) {
    var prev = (sheet && sheet.rules_seen && typeof sheet.rules_seen === 'object') ? sheet.rules_seen : {};
    return { rules_seen: Object.assign({}, prev, { force: FORCE_FLIP_GENERATION }) };
  }

  // ── F-100 M12 MV3 · AN ITEM'S CHARACTER EFFECTS, WHILE IN USE (f100-m12-build-card ADDENDUM 20, R-M12B-59/-60) ──────────
  // The item source of the owned-effects channel: item → character (applyCharacterEffects runs the other way, R-M12B-59's
  // errata). ItemResolve lists an attachment's MV3 rows on the resolved item's `_characterEffects` (the record's
  // character_effects + each SELECTED option's item_character_effect); this reads them off the RESOLVED equipment while the
  // item is IN USE — "when using the modded item" (EotE p.187), encoded: armour → `state === 'worn'` (wearing is using;
  // carried armour gives no soak either); weapons and gear → not `stowed` (R-M12B-40's test).
  // → [{ owner: { name, source, attachment, section, index }, effect: { op, key, value } }].
  function itemInUse(section, item) {
    if (!item || typeof item !== 'object') return false;
    return section === 'armor' ? item.state === 'worn' : item.state !== 'stowed';
  }
  function itemCharacterEffects(resolvedEquipment) {
    if (!resolvedEquipment) return [];
    var out = [];
    function take(section, item, index) {
      if (!itemInUse(section, item) || !Array.isArray(item._characterEffects)) return;
      item._characterEffects.forEach(function (fx) {
        if (!fx || !fx.op) return;
        out.push({ owner: { name: item.name || null, source: fx.source || null, attachment: fx.attachment || null, section: section, index: index,
                            implant: fx.implant === true },   // R-R6CD-8: the implant's own line (ItemResolve.implantEffectLines)
                   effect: { op: fx.op, key: fx.key, value: Number(fx.value) || 0 } });
      });
    }
    (Array.isArray(resolvedEquipment.weapons) ? resolvedEquipment.weapons : []).forEach(function (w, i) { take('weapons', w, i); });
    if (resolvedEquipment.armor) take('armor', resolvedEquipment.armor, null);
    (Array.isArray(resolvedEquipment.gear) ? resolvedEquipment.gear : []).forEach(function (g, i) { take('gear', g, i); });
    return out;
  }
  // "As if" a rank, never a rank (R-M12B-60): the DERIVED characteristic a check reads — a NEW object, the sheet's own map is
  // never written, no purchase or XP reads it. CAPPED at the normal maximum, 6 (R-M12B-64: EotE p.30/p.92; only cybernetics
  // print a step above, p.173; attachments are SILENT, so the cap is INFERRED and tabled): the excess is dropped, and a value
  // already above the cap is never lowered. The characteristic's derived THRESHOLDS (wound, soak, encumbrance) never read this
  // (RAW-silent, reported; checks only). Key OFF, or nothing in use → `chars` itself.
  var MV3_CHARACTERISTIC_MAX = 6, MV3_SKILL_MAX = 5;
  // THE CYBERNETIC CAP (ruling release-r6-companions-d365 ADDENDUM 1 R-R6CD-4; D-378): a delta whose owner is a cybernetic
  // implant's own line (owner.implant) may take the derived value ONE STEP above the normal maximum — "seven for
  // characteristics, six for skills" (EotE p.173). Mixed sources: the other deltas cap at the normal maximum FIRST, then the
  // implant's deltas apply to the cybernetic cap. Never lowered (R-M12B-64 unchanged); checks only (R-M12B-60).
  var CYBERNETIC_CHARACTERISTIC_MAX = 7, CYBERNETIC_SKILL_MAX = 6;
  function capInUse(cur, plain, implant, max, cyberMax) {
    var v = plain ? Math.max(cur, Math.min(max, cur + plain)) : cur;
    return implant ? Math.max(v, Math.min(cyberMax, v + implant)) : v;
  }
  function characteristicsInUse(chars, resolvedEquipment) {
    var base = chars || {};
    var fx = itemCharacterEffects(resolvedEquipment).filter(function (x) { return x.effect.op === 'characteristic_delta' && CHAR_ABBR_OF[x.effect.key]; });
    if (!fx.length) return base;
    var add = {};   // characteristic → { plain, implant }
    fx.forEach(function (x) {
      var a = add[x.effect.key] || (add[x.effect.key] = { plain: 0, implant: 0 });
      a[x.owner.implant ? 'implant' : 'plain'] += x.effect.value;
    });
    var out = Object.assign({}, base);
    Object.keys(add).forEach(function (c) {
      out[c] = capInUse(Number(out[c]) || 0, add[c].plain, add[c].implant, MV3_CHARACTERISTIC_MAX, CYBERNETIC_CHARACTERISTIC_MAX);
    });
    return out;
  }
  // The derived skill rank a check reads: `rank` + every in-use skill_rank_delta on that skill (`skillKey` a skills.vocab id or
  // the sheet key, matched as skillRankWithCommits matches), CAPPED at 5 (R-M12B-64, EotE p.92) and an implant's own delta at 6
  // (R-R6CD-4, above), excess dropped, a rank never lowered. Never written, never priced.
  function skillRankInUse(resolvedEquipment, charbuild, skillKey, rank) {
    var r = Number(rank) || 0;
    var keys = (charbuild && charbuild.skillSheetKeys) || (root && root._canonicalCharbuild && root._canonicalCharbuild.skillSheetKeys) || {};
    var plain = 0, implant = 0;
    itemCharacterEffects(resolvedEquipment).forEach(function (x) {
      var e = x.effect;
      if (e.op !== 'skill_rank_delta' || !e.key || (e.key !== skillKey && keys[e.key] !== skillKey)) return;
      if (x.owner.implant) implant += e.value; else plain += e.value;
    });
    return (plain || implant) ? capInUse(r, plain, implant, MV3_SKILL_MAX, CYBERNETIC_SKILL_MAX) : r;
  }
  // The plain thresholds (R-M12B-60): strain_threshold_delta (computeDerived) and encumbrance_threshold_delta
  // (computeEncumbrance), summed over the items in use.
  function itemThresholdDelta(resolvedEquipment, op) {
    return itemThresholdRows(resolvedEquipment, op).reduce(function (t, x) { return t + x.value; }, 0);
  }
  // The same walk, each item's delta named — [{ value, source }] (the attachment's name, else the item's): the sum above and
  // derivedBecause's "while in use" rows.
  function itemThresholdRows(resolvedEquipment, op) {
    return itemCharacterEffects(resolvedEquipment).filter(function (x) { return x.effect.op === op; })
      .map(function (x) { return { value: x.effect.value, source: x.owner.source || x.owner.name }; });
  }

  // ── F-100 M12: SIGNATURE ABILITIES (rulings f100-m12-census-card R-M12C-14/15/20/39/40/42; f100-m12-build-card R-M12B-2,
  // ADDENDUM 5 R-M12B-21/25) ──────────────────────────────────────────────────────────────────────────────────────────
  // The owned shape (R-M12C-39): sheet.signatureAbilities = [{ id, tree, owned: ['row-col', …] }] — `tree` the in-career
  // specialization it attaches under, `owned` the bought CELLS by position (a node may sit in several; the base is '0-0').
  // The record is read off the character's own view (the stamp view's `signatureAbilities`, else the charbuild handed in),
  // as _powerRegistry reads powers. sigAbilityChecks (V1–V7): the import calls it live (B-1244). (M12's key, R-M12B-2, that
  // once kept the rows, counts and folds below DARK was deleted by post1-switch-deletion, ADDENDUM 638.)
  function _sigRegistry(sheet, charbuild) {
    var v = talentViewFor(sheet);
    if (v && v.signatureAbilities) return v.signatureAbilities;
    var stamped = Array.isArray(sheet && sheet.mods) && sheet.mods.some(function (m) { return typeof m === 'string' && m; });
    if (stamped && _talentViewResolver) return {};   // fail closed, as _powerRegistry (M11 R4)
    return (charbuild && charbuild.signatureAbilities) || (root && root._canonicalCharbuild && root._canonicalCharbuild.signatureAbilities) || {};
  }
  function _sheetSigEntries(sheet) {
    return (Array.isArray(sheet && sheet.signatureAbilities) ? sheet.signatureAbilities : [])
      .filter(function (e) { return e && typeof e.id === 'string' && e.id; });
  }
  // The record's cells: [{ r, c, span, L, ability, cost, cost_status, pos: 'r-c' }] (pos = row and FIRST column).
  function sigTreeCells(rec) {
    var out = [];
    ((rec && Array.isArray(rec.tree)) ? rec.tree : []).forEach(function (row, ri) {
      ((row && Array.isArray(row.cells)) ? row.cells : []).forEach(function (c) {
        if (!c) return;
        var col = typeof c.col === 'number' ? c.col : 0;
        out.push({ r: ri, c: col, span: typeof c.span === 'number' && c.span > 0 ? c.span : 1, L: c.links || {},
                   ability: c.ability, cost: Number(c.cost) || 0, cost_status: c.cost_status || null, pos: ri + '-' + col });
      });
    });
    return out;
  }
  function _treeCellsJoined() {
    var PV = (root && root.SWRPGPackValidate) || null;
    if (!PV && typeof require === 'function') { try { PV = require('./packValidate.js'); } catch (e) { PV = null; } }
    return PV && typeof PV.treeCellsJoined === 'function' ? PV.treeCellsJoined : null;
  }
  var SIG_ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'];
  function sigBoxName(rec, pos) {
    var cells = sigTreeCells(rec), me = cells.filter(function (x) { return x.pos === String(pos); })[0];
    var ab = me && rec && rec.abilities ? rec.abilities[me.ability] : null;
    var name = (ab && ab.name) || ((rec && rec.name) ? 'This box of ' + rec.name : 'This box');
    if (!me) return name;
    var row = cells.filter(function (x) { return x.r === me.r; }).sort(function (a, b) { return a.c - b.c; });
    var at = row.indexOf(me);
    return row.length > 1 && SIG_ORDINALS[at] ? name + ', ' + SIG_ORDINALS[at] + ' in its row,' : name;
  }
  var SIG_WORDS = {
    V0: function (e) { return 'No signature ability is called ' + JSON.stringify(e.id) + '.'; },
    V1: function (n) { return n + ' belongs to another career.'; },
    V2: function (n) { return n + ' must attach to one of your own career’s specializations.'; },
    V3: function (n, cols) { return n + ' needs the bottom-row talents in column' + (cols.length > 1 ? 's ' : ' ') + cols.join(' and ') + ' of that tree.'; },
    V4: function (n) { return 'That tree already has a signature ability; ' + n + ' can’t attach to it too.'; },
    V5: function (n) { return 'An upgrade of ' + n + ' needs the ability itself first.'; },
    // B-1627 (DECISIONS D-417 item 4): the box is named by what the player sees, its upgrade's name and its place in its
    // row ("Reduce Setback, first in its row"), never by the internal `pos` (a row counted from 1 beside a column from 0)
    V6: function (n, pos, rec) { return sigBoxName(rec, pos) + ' isn’t linked to the ability or an upgrade you own.'; },
    V7: function (n, pos) { return n + ' has no box at ' + pos + '.'; },
  };
  // V1–V7 — THE ONE LEGALITY FUNCTION for a sheet's signature abilities (R-M12C-40; brief f100-m12-sig-shape §3), called by
  // the import (a failing entry or cell is left off and named on the receipt) and by every reader below (a stored entry
  // that fails is KEPT, its rows not applied, its reason readable). No copy anywhere else. The books' sentences:
  //   V1 the ability's careers hold the sheet's career ("only … from his career");
  //   V2 `tree` is one of that career's specializations the sheet owns ("can only attach … to in-career talent trees");
  //   V3 the sheet owns the tree's bottom-row talents at `attach.columns` ("all of the talents along the bottom row …");
  //   V4 at most one entry per tree (a tree takes no second signature ability); no per-character cap;
  //   V5 an upgrade needs the base ('0-0', "must first purchase the basic form");
  //   V6 each upgrade cell links to the base or another owned cell (the ONE link rule, packValidate.treeCellsJoined);
  //   V7 every position is a cell of the ability's tree.
  // → [{ index, id, name, entry, rec, ok, problems: [{ check, pos?, words }], cells: [the owned cells that stand] }], in
  // the sheet's order. An entry-level failure (V0–V4) refuses the whole entry; a cell-level one (V5–V7) refuses that cell
  // and leaves the rest standing only when they still join the base.
  function sigAbilityChecks(sheet, charbuild) {
    var reg = _sigRegistry(sheet, charbuild), cb = charbuild || {};
    var careerId = sheetCareerId(sheet, cb.careers || {});
    var career = careerId && cb.careers ? cb.careers[careerId] : null;
    var specs = resolveSheetSpecs(sheet, cb), seenTree = {}, joined = _treeCellsJoined();
    return _sheetSigEntries(sheet).map(function (entry, index) {
      var rec = Object.prototype.hasOwnProperty.call(reg, entry.id) ? reg[entry.id] : null;
      var name = (rec && rec.name) || entry.id, problems = [], out = { index: index, id: entry.id, name: name, entry: entry, rec: rec, problems: problems, cells: [] };
      if (!rec) { problems.push({ check: 'V0', words: SIG_WORDS.V0(entry) }); out.ok = false; return out; }
      if (!(careerId && (rec.careers || []).indexOf(careerId) !== -1)) problems.push({ check: 'V1', words: SIG_WORDS.V1(name) });
      var spec = specs.filter(function (s) { return s && s.id === entry.tree; })[0] || null;
      if (!(spec && career && (career.specializations || []).indexOf(entry.tree) !== -1)) problems.push({ check: 'V2', words: SIG_WORDS.V2(name) });
      else {
        var t = cb.specializations && cb.specializations[entry.tree], tt = t && Array.isArray(t.talent_tree) ? t.talent_tree : [];
        var bottom = tt.length - 1, owned = (spec.owned || []).map(String);
        var missing = ((rec.attach && rec.attach.columns) || []).filter(function (col) { return bottom < 0 || owned.indexOf(bottom + '-' + (col - 1)) === -1; });
        if (missing.length) problems.push({ check: 'V3', words: SIG_WORDS.V3(name, missing) });
      }
      if (entry.tree && seenTree[entry.tree]) problems.push({ check: 'V4', words: SIG_WORDS.V4(name) });
      if (entry.tree) seenTree[entry.tree] = true;
      if (problems.length) { out.ok = false; return out; }
      var cells = sigTreeCells(rec), byPos = {}, pos = [];
      cells.forEach(function (c) { byPos[c.pos] = c; });
      (Array.isArray(entry.owned) ? entry.owned : []).forEach(function (p) {
        p = String(p);
        if (pos.indexOf(p) !== -1) return;
        if (!byPos[p]) problems.push({ check: 'V7', pos: p, words: SIG_WORDS.V7(name, p) });
        else pos.push(p);
      });
      var base = byPos['0-0'];
      if (pos.indexOf('0-0') === -1) {
        pos.forEach(function (p) { problems.push({ check: 'V5', pos: p, words: SIG_WORDS.V5(name) }); });
        out.ok = !problems.length; return out;
      }
      var have = pos.map(function (p) { return byPos[p]; }), seen = [base], queue = [base];
      while (queue.length && joined) {
        var a = queue.shift();
        have.forEach(function (b) { if (seen.indexOf(b) === -1 && joined(a, b)) { seen.push(b); queue.push(b); } });
      }
      have.forEach(function (b) { if (seen.indexOf(b) === -1) problems.push({ check: 'V6', pos: b.pos, words: SIG_WORDS.V6(name, b.pos, rec) }); });
      out.cells = seen;
      out.ok = !problems.length;
      return out;
    });
  }
  // SV2 — THE ONE COUNT READER (R-M12C-15): the boxes of ONE node bought = the owner's standing cells (sigAbilityChecks)
  // whose node is `key`'s ('<ability id>.<node id>'); a node in two cells counts both. 0 for an unowned or failing
  // ability, or a malformed key. powerUpgradeCount's sibling, read by the same consumer code (_resolveCountOf).
  function sigUpgradeCount(sheet, key, charbuild) {
    var k = String(key || ''), dot = k.indexOf('.');
    if (dot < 1) return 0;
    var aid = k.slice(0, dot), node = k.slice(dot + 1), n = 0;
    sigAbilityChecks(sheet, charbuild).forEach(function (s) {
      if (s.id !== aid || !s.ok) return;
      s.cells.forEach(function (c) { if (c.ability === node) n += 1; });
    });
    return n;
  }
  // SV5 (R-M12C-20): `{scope: career_skills, value: 'owner'}` → one `{scope: skill, value: <id>}` per career skill of the
  // OWNER, read through careerSkillStatus (never a second list) — resolved HERE, where the rows are made per sheet, as
  // _resolveChosenAnchors resolves a pick (poolMods.matches has no sheet). A plain copy; other anchors pass through.
  function _resolveCareerSkillAnchors(rows, sheet, charbuild) {
    var ids = null;
    return (Array.isArray(rows) ? rows : []).map(function (row) {
      var at = row && row.applies_to;
      if (!Array.isArray(at) || !at.some(function (a) { return a && a.scope === 'career_skills'; })) return row;
      if (ids === null) {
        var st = careerSkillStatus(sheet, charbuild || {});
        ids = Object.keys(st).map(function (k) { return st[k].id; }).filter(Boolean).sort();
      }
      var r = JSON.parse(JSON.stringify(row));
      r.applies_to = [];
      at.forEach(function (a) {
        if (a && a.scope === 'career_skills') ids.forEach(function (id) { r.applies_to.push({ scope: 'skill', value: id }); });
        else r.applies_to.push(a);
      });
      return r;
    });
  }
  // The owned nodes' rows (R-M12C-42: inside the same three arms as forcePowerRowSources). Each owned node — the base, and
  // every upgrade with a standing cell — is an owner { id: 'sig:<abilityId>:<nodeId>', name, description, ability, node,
  // ranked: false, ranks: 1, …its arrays }, the shape the owned-talent readers return. A node's rows apply ONCE; a scaled
  // row says so with `count_of: {of: sig_upgrades}` and multiplies there (SV2).
  function sigAbilityRowSources(sheet, charbuild) {
    var out = [];
    sigAbilityChecks(sheet, charbuild).forEach(function (s) {
      if (!s.ok) return;
      var nodes = (s.rec && s.rec.abilities) || {}, done = {};
      s.cells.forEach(function (c) {
        if (done[c.ability] || !Object.prototype.hasOwnProperty.call(nodes, c.ability)) return;
        done[c.ability] = 1;
        var a = nodes[c.ability], o = { id: 'sig:' + s.id + ':' + c.ability, name: s.name + ': ' + (a.name || c.ability),
          description: String(a.description || ''), ability: s.id, node: c.ability, ranked: false, ranks: 1 }, any = false;
        FORCE_ROW_ARRAYS.forEach(function (arr) {
          if (!Array.isArray(a[arr]) || !a[arr].length) return;
          o[arr] = arr === 'pool_mods' || arr === 'roll_numbers' ? _resolveCareerSkillAnchors(a[arr], sheet, charbuild) : a[arr];
          any = true;
        });
        if (any) out.push(o);
      });
    });
    return out;
  }
  // QG1 (f100-m12-build-card ADDENDUM 22, R-M12B-70): the activation's quality grant, OFFERED — session state, never saved,
  // never applied here. Per standing ability whose BASE node carries `quality_grant` (Unmatched Ingenuity, Fully Operational
  // p.35): { ability, name, node, id, rating, item, except, allowed, choices, cite } — `allowed` the qualities the owner's
  // standing upgrades' `quality_grant_allow` lift off the base's `except`; `except` what stays barred; `choices` the
  // qualities vocabulary's ids (its order) less what stays barred (null with no vocabulary).
  function sigQualityGrantOffers(sheet, charbuild, vocab) {
    var list = !vocab ? null : Array.isArray(vocab) ? vocab : Array.isArray(vocab.entries) ? vocab.entries
      : Object.keys(vocab).map(function (k) { return vocab[k]; });
    var out = [];
    sigAbilityChecks(sheet, charbuild).forEach(function (s) {
      if (!s.ok || !s.cells.length) return;
      var nodes = (s.rec && s.rec.abilities) || {}, baseId = s.cells[0].ability, g = nodes[baseId] && nodes[baseId].quality_grant;
      if (!g) return;
      var allowed = [];
      s.cells.forEach(function (c) {
        ((nodes[c.ability] && nodes[c.ability].quality_grant_allow) || []).forEach(function (q) { if (allowed.indexOf(q) === -1) allowed.push(q); });
      });
      var barred = (g.except || []).filter(function (q) { return allowed.indexOf(q) === -1; }), choices = null;
      if (list) {
        choices = [];
        list.forEach(function (e) { if (e && e.id && barred.indexOf(e.id) === -1 && choices.indexOf(e.id) === -1) choices.push(e.id); });
      }
      out.push({ ability: s.id, name: s.name, node: baseId, id: g.id, rating: g.rating, item: g.item, except: barred,
        allowed: allowed.filter(function (q) { return (g.except || []).indexOf(q) !== -1; }), choices: choices, cite: g.cite || null });
    });
    return out;
  }
  // THE ONE CELL-COST WALK (creator concept ADDENDUM 18, C1 (a)): an entry's OWNED cells — every position in `owned` that is
  // a cell of the ability's tree, once each, standing or not — priced from the record. XP paid is never re-summed away:
  // the V-checks gate BUYING (buySigAbility), never the spend, so an ability whose attach tree or career check later fails
  // still cost what it cost. A position with no box (V7) or an entry with no record (V0) has no price and reads 0.
  // → { xp, inferred: <any owned cell's cost_status inferred>, cells: n }. Read by sigAbilitiesXp and sigAbilitiesSpend.
  function _sigOwnedCost(entry, rec) {
    var byPos = {}, seen = {}, out = { xp: 0, inferred: false, cells: 0 };
    sigTreeCells(rec).forEach(function (c) { byPos[c.pos] = c; });
    (Array.isArray(entry && entry.owned) ? entry.owned : []).forEach(function (p) {
      p = String(p);
      if (seen[p] || !byPos[p]) return;
      seen[p] = 1;
      out.xp += byPos[p].cost; out.cells += 1;
      if (byPos[p].cost_status === 'inferred') out.inferred = true;
    });
    return out;
  }
  // XP (R-M12C-42; R-M12C-36's "shown, never charged" SUPERSEDED by D-229 Q1 (a) for charged sheets, creator concept
  // ADDENDUM 18 C1 (a)): per ability, the registry costs of its OWNED cells (_sigOwnedCost) — the panel's figure and the
  // charge are ONE quantity (PRAXIS §5). Key-independent arithmetic. → [{ id, name, xp, inferred, cells: n owned and
  // priced, ok: the entry stands }]; a failing entry keeps its price, its problems on sigAbilityChecks.
  function sigAbilitiesXp(sheet, charbuild) {
    return sigAbilityChecks(sheet, charbuild).map(function (s) {
      var o = _sigOwnedCost(s.entry, s.rec);
      return { id: s.id, name: s.name, xp: o.xp, inferred: o.inferred, cells: o.cells, ok: !!s.ok };
    });
  }
  // THE BUY PLAN (creator concept ADDENDUM 11 / R-SCC-1; D-229 Q1 (a)): ONE cell of ONE ability, for the ONE writer
  // (buySigAbility). The base '0-0' starts an entry { id, tree, owned: ['0-0'] }; an upgrade appends 'r-c' to the entry
  // already owned under `tree`. → { ok, cost, pos, signatureAbilities: <the next list>, refusal: null | { check, words },
  // held: null | { book, page, words } }. FAIL-CLOSED: no such ability (V0) · the cell already owned · the proposed entry failing sigAbilityChecks (V1–V7,
  // SIG_WORDS — the ONE copy source; for an upgrade, an entry-level failure or one at the new cell) · a cell whose cost is
  // `inferred` (held: "cost unverified — <book> p.<tree_page>", ADDENDUM 18 Q5 (a)). `cost` is the record's, never the
  // caller's. Affordability and the growth room's hold are the writer's, as on every spine.
  // B-336 (ruling release-r7-bug-burndown ADDENDUM 62, (C)): a held cost's book prints its TITLE, whether the record holds
  // a vocabulary key or a title (a raw key on screen is the B-1544 class). Without the shared index it prints the string.
  // S1's formatter (lib/shared/sources.js) — the page's global, or in a node `require` its module (as textHash reads
  // siteSettings).
  function sourcesApi() {
    var S = root && root.SWRPGSources;
    if (!S && typeof module !== 'undefined' && module.exports && typeof require === 'function') { try { S = require('./sources.js'); } catch (e) { S = null; } }
    return S;
  }
  function bookLabelOf(s) {
    var S = root && root.SWRPGSources, c = S && S.current ? S.current() : null;
    var lab = S && S.sourceLabel && c && c.index ? S.sourceLabel(c.index, s) : null;
    return lab || s;
  }
  function sigBuyPlan(sheet, charbuild, id, tree, cell) {
    var pos = String(cell || ''), out = { ok: false, cost: 0, pos: pos, signatureAbilities: null, refusal: null, held: null };
    var refuse = function (check, words) { out.refusal = { check: check, words: words || null }; return out; };
    var reg = _sigRegistry(sheet, charbuild), rec = Object.prototype.hasOwnProperty.call(reg, id) ? reg[id] : null;
    if (!rec) return refuse('V0', SIG_WORDS.V0({ id: id }));
    var entries = JSON.parse(JSON.stringify(_sheetSigEntries(sheet)));
    var at = -1;
    entries.forEach(function (e, i) { if (at === -1 && e.id === id && e.tree === tree) at = i; });
    if (pos === '0-0') {
      if (entries.some(function (e) { return e.id === id; })) return refuse('OWNED');
      entries.push({ id: id, tree: tree, owned: ['0-0'] });
      at = entries.length - 1;
    } else {
      if (at === -1) return refuse('V5', SIG_WORDS.V5(rec.name || id));
      var owned = Array.isArray(entries[at].owned) ? entries[at].owned.map(String) : [];
      if (owned.indexOf(pos) !== -1) return refuse('OWNED');
      entries[at].owned = owned.concat([pos]);
    }
    var probe = Object.assign({}, sheet, { signatureAbilities: entries });
    var s = sigAbilityChecks(probe, charbuild)[at];
    var bad = (s ? s.problems : []).filter(function (p) { return !p.pos || p.pos === pos || p.check === 'V5'; })[0];
    if (bad) return refuse(bad.check, bad.words);
    var c = sigTreeCells(rec).filter(function (x) { return x.pos === pos; })[0];
    if (!c) return refuse('V7', SIG_WORDS.V7(rec.name || id, pos));
    out.cost = c.cost;
    if (c.cost_status === 'inferred') {
      var book = bookLabelOf((rec.cite && rec.cite.book) || (rec.sources || [])[0] || ''), page = rec.tree_page != null ? rec.tree_page : rec.cite && rec.cite.page;
      out.held = { book: book, page: page, words: 'cost unverified — ' + sourcesApi().pageCite(book, page) };   // S1's formatter (B-1809)
      return out;
    }
    out.ok = true;
    out.signatureAbilities = entries;
    return out;
  }
  // THE ONE SIGNATURE SPEND SUMMER (creator concept ADDENDUM 18, C1 (a)): Σ sigAbilitiesXp over every entry of
  // `state.signatureAbilities` (a sheet or the creator's state — both carry the member), added to normalizeCreated's
  // xp.spent and the creator's xpRemaining, so a bought ability survives creator re-entry.
  function sigAbilitiesSpend(state, charbuild) {
    if (!_sheetSigEntries(state).length) return 0;
    return sigAbilitiesXp(state, charbuild).reduce(function (t, x) { return t + x.xp; }, 0);
  }
  // THE ACTIVATION FOLD (R-M12C-97 as corrected by R-M12C-105, R-M12B-6, R-M12B-21, R-M12B-25), one ability (null
  // when the ability is not owned and standing). Each term:
  //   { value, base: 'stated' | 'unstated', delta?, set? } — value = the `*_set` value when an owned box sets it (then each
  //   delta adds), else base + Σ (delta × boxes bought), clamped at the largest `floor` any owned mod names; a term the base
  //   does not state folds as the modification alone: { value: null, delta, base: 'unstated' }. Range steps the personal
  //   bands, capped at the last. destiny reads use_cost.destiny as its base; strain and silhouette have no base term
  //   (R-M12B-31), so their deltas always fold `unstated`. `activation_add` lists the added activations. Never charged.
  var SIG_BANDS = ['engaged', 'short', 'medium', 'long', 'extreme'];
  var SIG_TERM_OF = { destiny_cost_set: 'destiny', uses_per_session_delta: 'uses_per_session', range_set: 'range', range_delta: 'range',
                      duration_delta: 'duration_rounds', strain_cost_delta: 'strain', target_silhouette_delta: 'silhouette' };
  function sigActivation(sheet, charbuild, abilityId) {
    var s = sigAbilityChecks(sheet, charbuild).filter(function (x) { return x.id === abilityId && x.ok; })[0];
    if (!s) return null;
    var nodes = (s.rec && s.rec.abilities) || {}, baseNode = s.cells.length ? nodes[s.cells[0].ability] || {} : {};
    var ab = baseNode.activation_base || {}, base = { uses_per_session: ab.uses_per_session, range: ab.range, duration_rounds: ab.duration_rounds,
      destiny: baseNode.use_cost && baseNode.use_cost.destiny };
    var acc = {}, adds = [];
    s.cells.forEach(function (c) {
      ((nodes[c.ability] && nodes[c.ability].activation_mods) || []).forEach(function (m) {
        if (m.op === 'activation_add') { if (adds.indexOf(m.value) === -1) adds.push(m.value); return; }
        var t = SIG_TERM_OF[m.op];
        if (!t) return;
        var a = acc[t] || (acc[t] = { delta: 0, set: undefined, floor: undefined });
        if (/_set$/.test(m.op)) a.set = m.value;
        else a.delta += Number(m.value) || 0;   // one box: the cells walk counts each bought box once
        if (m.floor != null) a.floor = a.floor == null ? m.floor : Math.max(a.floor, m.floor);
      });
    });
    var out = { id: s.id, activation_add: adds };
    ['destiny', 'uses_per_session', 'range', 'duration_rounds', 'strain', 'silhouette'].forEach(function (t) {
      var a = acc[t], b = base[t], stated = b != null;
      if (!a) { out[t] = stated ? { value: b, base: 'stated' } : null; return; }
      var term = { base: stated || a.set !== undefined ? 'stated' : 'unstated' };
      if (a.set !== undefined) term.set = a.set;
      if (a.delta) term.delta = a.delta;
      var start = a.set !== undefined ? a.set : b;
      if (start == null) { term.value = null; term.base = 'unstated'; out[t] = term; return; }
      var v;
      if (t === 'range') v = SIG_BANDS[Math.max(0, Math.min(SIG_BANDS.length - 1, SIG_BANDS.indexOf(start) + a.delta))];
      else { v = Number(start) + a.delta; if (a.floor != null) v = Math.max(a.floor, v); }
      term.value = v;
      out[t] = term;
    });
    return out;
  }

  // THE ONE STARTING-CREDITS READER (R-M9S-5, R-M9S-12; F-100 THE SURFACING MISSION — ruling f100-surfacing-creator-concept
  // ADDENDUM 4 FLAG 1 (ii), ADDENDUM 11 R2, brief f100-surfacing-creator-build §3.3, ruled ADDENDUM 18; B-1315's reader half).
  // startingCredits(adjust, speciesRec, picks, buyouts[, who]) → { purse, after, rows }:
  //   purse = 500 + the creation adjustment + every `starting_credits_delta` WITHOUT `timing` — spendable at creation;
  //   after = Σ the deltas timed "after_creation" (the Muun's Deep Pockets, Endless Vigil p.21: "they may not spend these
  //           credits during character creation") — the save adds it ONCE (normalizeCreated), never the creator's purse;
  //   rows  = [{ amount, ability, species, timing }] — each delta's owner, for the creator's because line (R-SCC-6), read
  //           off this one walk, never a second sum.
  // The walk is _speciesEffectSumOf's (the same record, picks and buyout drop); no rows →
  // { purse: 500 + adjust, after: 0 }. EVERY site reads here (six: normalizeCreated,
  // buildTestPc, the mechanic step's and QuickBuild's SET_CREDITS, QBReviewStep's fallback, the creator's credits memo).
  var BASE_STARTING_CREDITS = 500;
  // R6 lane D (R-R6PC-2 read 3; ruling `release-r6-bases-registry` Q6 (c)): `who` (optional, 5th) is the character —
  // a member of a group whose resource is `{from: 'aor', pick: 'base'}` starts with 1,000 more credits of gear (AoR Core
  // p.111), one row named for the group. Membership is by saved id (groupOf), so a new character reads nothing.
  function startingCredits(adjust, speciesRec, picks, buyouts, who) {
    var out = { purse: BASE_STARTING_CREDITS + (Number(adjust) || 0), after: 0, rows: [] };
    var gg = groupGrants(who);
    if (gg.extraCredits) {
      out.purse += gg.extraCredits;
      out.rows.push({ amount: gg.extraCredits, ability: 'Base of operations', species: gg.name || 'the group', timing: null, group: gg.group });
    }
    if (!speciesRec) return out;
    var bought = (buyouts && typeof buyouts === 'object') ? buyouts : {};
    speciesAbilitiesResolved(speciesRec, picks).forEach(function (a) {
      if (bought[abilitySlug(a.name)]) return;
      (a.effects || []).forEach(function (e) {
        if (!e || e.op !== 'starting_credits_delta') return;
        var n = Number(e.amount) || 0, later = e.timing === 'after_creation';
        if (later) out.after += n; else out.purse += n;
        out.rows.push({ amount: n, ability: a.name, species: speciesRec.name || speciesRec.id, timing: later ? 'after_creation' : null });
      });
    });
    return out;
  }

  // F-100 M8 step 3 (frames F1 R6; R-M8K-6 (a)): the owner's UNMADE skill picks that a roll row anchors to — each
  // owned rank whose `chosen` anchor has no answer adds nothing (fail closed) and its talent ASKS. → [{ talentId, name,
  // pickId, pool, rank, specId, pos }], `pool` the pick's declared skill pool (a group id, or a list of skill ids), so a
  // surface asks only on the rows that pick could reach. Same ownership as ownedTalentRollSources.
  function unmadeRollPicks(sheet, charbuild) {
    var out = [];
    ownedTalentRollSources(sheet, charbuild);   // the same registry precondition, thrown the same way
    var talents = charbuild.talents, seen = {};
    (Array.isArray(sheet && sheet.talents) ? sheet.talents : []).concat(grantedTalentsAtRender(sheet, charbuild)).forEach(function (o) {
      var id = o && o.id;
      if (!id || seen[id] || !Object.prototype.hasOwnProperty.call(talents, id)) return;
      seen[id] = 1;
      var rec = talents[id], pids = {};
      (Array.isArray(rec.roll_numbers) ? rec.roll_numbers : []).forEach(function (row) {
        (row && Array.isArray(row.applies_to) ? row.applies_to : []).forEach(function (a) { if (a && a.scope === 'skill' && a.chosen) pids[a.chosen] = 1; });
      });
      if (!Object.keys(pids).length) return;
      picksOf(sheet, charbuild, id).forEach(function (e) {
        if (!pids[e.pick.id] || e.pick.kind !== 'skill') return;
        e.instances.forEach(function (inst, i) {
          if (inst.value != null) return;
          out.push({ talentId: id, name: rec.name || id, pickId: e.pick.id, pool: e.pick.pool || null, rank: i + 1,
                     specId: inst.specId, pos: inst.pos });
        });
      });
    });
    return out;
  }

  // F-100 M8 (ruling `f100-m8-build` R-M8G-9): a row anchored to a PICKED skill — an `applies_to` member
  // { scope: 'skill', chosen: <pick id> } — resolves HERE, through picksOf (so pickOf, the one reader), into one
  // concrete row per LIVE instance of that pick: the anchor becomes { scope: 'skill', value: <the picked skill> }; an
  // `amount: { of, chosen }` naming the same pick reads that skill (skill_ranks through the sheet key); and a `per: rank`
  // pick's row stands for its ONE rank (per_rank false), so each owned rank is its own anchor (Deadly Accuracy).
  // FAIL CLOSED: an unmade pick, or a distinct repeat, yields no row — it matches nothing, and the talent's own prompt
  // asks for it (R-M8K-6 (a)). A row with no chosen anchor passes through as the same object.
  // F-100 M8 M1 (f100-m8-batches R-M8BG-223; contracts ADDENDUM 5 A5.2): a row's `count_of` read off the OWNER's sheet,
  // HERE, where the rows are already made per sheet — so collect, augment, offerEffect and offerTags see only integers
  // (a plain copy: count × the source, `count_of` dropped). skill_ranks: the vocab id's sheet key (skillSheetKeys, as
  // _resolveChosenAnchors maps an amount's key), its rank read as rollAmount reads one. A source of 0 drops the row (no die
  // is offered). An unknown `of` drops it too: unknown never applies.
  // force_rating (M1′, f100-m8-batches R-M8BG-233, approved D-81): the owner's derived Force rating (computeDerived, read
  // once per call and only when a row asks); the resolved copy's condition reads "(your Force rating)", the approved
  // mockup's words (Docs/mockups/f100-m8-force-on-skill.html @ b2aeb49b) — the authored span stays on the registry row.
  // F-100 M10 (R-M10S-2, R-M10S-5): power_upgrades = V1's count (powerUpgradeCount, the one reader; a roll row
  // keeps its per-rank `amount` and carries the count as `count`, read by poolMods.powerDialsAt); force_rating with a
  // session's committed dice reads forceDiceAvailable — the hub's `available` — so a committed die lowers both at once.
  // `session` (optional) = { committed } — the hub's session state, never saved; absent (every caller before M10), the
  // rating is computeDerived's, as it always was.
  function _resolveCountOf(rows, sheet, charbuild, session) {
    var keys = (charbuild && charbuild.skillSheetKeys) || {}, sk = (sheet && sheet.skills) || {}, out = [], fr = null;
    (Array.isArray(rows) ? rows : []).forEach(function (row) {
      var c = row && row.count_of;
      if (!c) { out.push(row); return; }
      var n = 0;
      if (c.of === 'skill_ranks') {
        var v = sk[keys[c.key] || c.key];
        n = (v && typeof v === 'object') ? (Number(v.rank) || 0) : (Number(v) || 0);
      } else if (c.of === 'force_rating' && c.key === 'self') {
        if (fr === null) {
          try { fr = Number(computeDerived(sheet, null, charbuild).forceRating) || 0; }
          catch (e) { fr = Number(sheet && sheet.forceRatingBase) || 0; }
          if (session && session.committed != null) fr = forceDiceAvailable(fr, session.committed);
        }
        n = fr;
      } else if (c.of === 'power_upgrades') {
        n = powerUpgradeCount(sheet, c.key);
      } else if (c.of === 'sig_upgrades') {
        n = sigUpgradeCount(sheet, c.key, charbuild);   // F-100 M12 SV2 (R-M12C-15), the one count reader
      }
      if (!(n > 0)) return;
      var r = JSON.parse(JSON.stringify(row));
      delete r.count_of;
      r.count = (Number(row.count) || 1) * n;
      if (c.of === 'force_rating') r.condition = '(your Force rating)';
      out.push(r);
    });
    return out;
  }
  // F-100 M11 (R-M11C-12): a dial's `amount: {of: force_rating}` → the owner's rating, read through _resolveCountOf's own
  // `force_rating` arm (a one-row probe), so the Force rating keeps ONE reader (PRAXIS §5). A rating of 0 drops the row.
  function _resolveDialAmounts(rows, sheet, charbuild) {
    var out = [], fr = null;
    (Array.isArray(rows) ? rows : []).forEach(function (row) {
      var a = row && row.amount;
      if (!(a && typeof a === 'object' && a.of === 'force_rating')) { out.push(row); return; }
      if (fr === null) { var probe = _resolveCountOf([{ count: 1, count_of: { of: 'force_rating', key: 'self' } }], sheet, charbuild); fr = probe.length ? probe[0].count : 0; }
      if (!(fr > 0)) return;
      var r = JSON.parse(JSON.stringify(row));
      r.amount = fr;
      out.push(r);
    });
    return out;
  }
  function _resolveChosenAnchors(rows, sheet, charbuild, talentId) {
    var keys = (charbuild && charbuild.skillSheetKeys) || {}, picks = null, out = [];
    (Array.isArray(rows) ? rows : []).forEach(function (row) {
      var at = row && Array.isArray(row.applies_to) ? row.applies_to : null, pid = null;
      (at || []).forEach(function (a) { if (pid == null && a && a.scope === 'skill' && a.chosen) pid = a.chosen; });
      if (pid == null) { out.push(row); return; }
      picks = picks || picksOf(sheet, charbuild, talentId);
      var e = picks.filter(function (x) { return x.pick.id === pid; })[0];
      if (!e) return;
      e.instances.forEach(function (inst, rankIdx) {
        var v = inst.value;
        if (typeof v !== 'string' || !v) return;
        var r = JSON.parse(JSON.stringify(row));
        r._pick = { id: pid, value: v, rank: rankIdx + 1, per: e.pick.per };   // step 3: the line names its pick (frame R6)
        r.applies_to = at.filter(function (a) { return !(a && a.chosen) || a.chosen === pid; })
          .map(function (a) { return a && a.chosen ? { scope: 'skill', value: v } : a; });
        var amt = r.amount;
        if (amt && typeof amt === 'object' && amt.chosen === pid) {
          r.amount = { of: amt.of, key: amt.of === 'skill_ranks' ? (keys[v] || v) : v };
          if (amt.half_round_up) r.amount.half_round_up = true;
        }
        if (e.pick.per !== 'talent') r.per_rank = false;
        out.push(r);
      });
    });
    return out;
  }

  // ── a skill's plain-language explanation, resolved from the registry ─────────────────
  // C-SDS-1 (concept ruling `f58-sheet-skill-description-surface`): "registry-resolved … never
  // prop-drilled copies — one source, every caller." This is that one source. It lives HERE, in the
  // shared core, because three different callers need it and they do not share a file:
  //   · the creator's skill pickers + ADVANCEMENT's DETAILS (player/app.jsx, via a thin wrapper)
  //   · the shared DICE MODAL (lib/shared/diceUI.jsx), which cannot reach into the player app
  // Pure: `charbuild` is data (the loaded canonical view, whose `skillDescs` the loader builds from
  // skills.vocab.json). Keyed by the legacy SHEET key both the creator and the sheet hold.
  // GRACEFUL: a missing registry, a missing map or an unknown key all return '' — a caller renders
  // nothing rather than a placeholder, which is what every consumer here wants.
  function skillDescription(sheetKey, charbuild) {
    if (!sheetKey || !charbuild) return '';
    var m = charbuild.skillDescs;
    return (m && typeof m[sheetKey] === 'string') ? m[sheetKey] : '';
  }

  // ── R-F45-1: THE ASSEMBLY CORE, extracted (slice 2's precondition) ───────────────────────────
  // Ruling `f45-reverse-transform`: D-1's option (b) promoted — "the round-trip property
  // `assemble(inverse(sheet)) == sheet` is the feature's spine and needs the pair node-callable."
  // So `normalizeCreated` moves here VERBATIM from player/app.jsx, beside its own inverse, and the
  // three things it reached out of scope for become INJECTED dependencies instead of globals:
  //     deps.registries   — the canonical weapons/armor/gear registries (was window._canonicalRegistries)
  //     deps.activeMods   — the active variant stamp array           (was window.SWRPGMods.active())
  //     deps.portraitFor  — species name -> portrait path or null    (was speciesImgPath, in index.html)
  // player/app.jsx keeps a thin wrapper that supplies them, so every existing call site is unchanged.
  // This is R1's natural completion: one assembly, one inverse, one home, both testable in node.

function buildCanonicalEquipment(inventory, regs) {
  // Hardened at extraction (R-F45-1): `regs || {default}` only guarded a MISSING object, not a partial
  // one — a caller passing `{}` (or registries still loading) hit `regs.armor[id]` and threw. Unreachable
  // from the app, where the loader sets the whole object or leaves it undefined; reachable now that this
  // is a shared API taking injected deps, and found by the round-trip test doing exactly that.
  regs = regs || {};
  var armorReg = regs.armor || {};
  var weapons = []; var armorRef = null; var gear = []; var armorSoak = 0;
  (inventory || []).forEach(function(item) {
    var id = item.key;
    var section = item.section;
    if (section === 'weapons') {
      // B-1073: one weapon entry PER UNIT, as the store writes them ("one copy each", lib/store/view.jsx). The creator's
      // ADD_ITEM merges a second pick into qty 2 and an OggDude <CharWeapon> carries <Count>; one entry per row made two
      // pistols one. A row with no qty is one weapon.
      for (var wn = Math.max(1, Math.floor(Number(item.qty) || 1)); wn > 0; wn--) weapons.push({ id: id });
    } else if (section === 'armor') {
      // B-699: the suit the creator put on is WORN, and says so. `equipment.armor` IS the worn
      // singular by R-ASS-1 (ruling `armor-save-shape`), so an entry with no `state` was a shape that
      // contradicted its own slot: `deriveItemState` falls through to 'carried', the pack printed
      // "1 carried" over the suit, and `computeEncumbrance` charged the full encumbrance instead of
      // the RAW reduction — worn armor counts 3 less encumbrance (EotE p.168;
      // p.152 frames the carried value as "just another item"). This is the sheet's own WEAR shape
      // (`state: 'worn'`), not a new one.
      if (!armorRef) { armorRef = { id: id, state: 'worn' }; var arec = armorReg[id]; armorSoak = (arec && arec.soak) || 0; }
    } else {
      gear.push({ id: id, qty: item.qty || 1 });
    }
  });



  return { weapons: weapons, armor: armorRef, gear: gear, armorSoak: armorSoak };
}

// B-1055 MOUNT (ruling release-r7-bug-burndown ADDENDUM 99 item 14, ADDENDUM 102): a Dedication bought in the CREATOR
// files only its record (`talentCharacteristicChoices[spec]["r-c"]`); the draft's `characteristics` stay the bought
// values, so the creator's live characteristic XP never bills the point (it is paid as a talent). The +1 is applied
// HERE, after the stamp — STAMP BEFORE RAISE, the sheet's buyTalent order (B-736). → { brawn: n, … } the points still
// to add: the recorded Dedication picks, less the cells re-entry carried in with their point already in the live block
// (`dedicationCarried`), so a round trip never adds a second point (G4). Per CELL, not per gain: a pre-B-736 re-entry's
// gain reads 0 though its point is held, and a record-less pre-M7 point is a gain with no pick.
// THE SHAPE (ruling release-r7-bug-burndown ADDENDUM 108 C1, R-Y2-1): `character.dedicationCarried` = the creator's
// `talents` posKeys, inside swrpg_creation_draft.character only, never emitted on a sheet. `[]` on every new creation
// (createEmptyCharacter); the F-45 door, deleted at R-M13B-103, wrote every recorded Dedication cell on the drafts it left; a refund removes its key.
// ABSENT (a draft saved before this build) reads as EVERY recorded Dedication cell: the pre-build creator filed no
// record, so each one came in by re-entry with its point applied.
var _CR_CHARS6 = ['brawn', 'agility', 'intellect', 'cunning', 'willpower', 'presence'];
function _creatorDedicationCells(character) {
  var tcc = (character && character.talentCharacteristicChoices) || {};
  return Object.keys((character && character.talents) || {}).filter(function (posKey) {
    var t = character.talents[posKey], c = t && t.talentKey === 'dedication' && tcc[t.specKey] && tcc[t.specKey][t.row + '-' + t.col];
    return typeof c === 'string' && _CR_CHARS6.indexOf(c) !== -1;
  });
}
// the carried posKeys as a list, the absent field read per C1 (the writers materialize it before changing it)
function creatorDedicationCarried(character) {
  return (character && Array.isArray(character.dedicationCarried)) ? character.dedicationCarried.slice() : _creatorDedicationCells(character);
}
function creatorDedicationPending(character) {
  var out = {}, tcc = (character && character.talentCharacteristicChoices) || {}, carried = creatorDedicationCarried(character);
  _creatorDedicationCells(character).forEach(function (posKey) {
    if (carried.indexOf(posKey) !== -1) return;
    var t = character.talents[posKey], c = tcc[t.specKey][t.row + '-' + t.col];
    out[c] = (out[c] || 0) + 1;
  });
  return out;
}
// The draft's characteristics with the pending points on, capped at 6 — what the character will hold at finish.
function creatorCharacteristicsWithPending(character) {
  var chars = Object.assign({}, (character && character.characteristics) || {}), pend = creatorDedicationPending(character);
  Object.keys(pend).forEach(function (c) { chars[c] = Math.min(6, (Number(chars[c]) || 0) + pend[c]); });
  return chars;
}

function normalizeCreated(character, speciesData, specData, gameData, source, deps) {
    deps = deps || {};
  var gameLine = character.gameLine;

  // Skills → flat rank map (CR-RAW #1: freeSpecies = species free-choice grant picks;
  // CR-RAW #2: bought[] = creation XP purchases, one stored cost per rank)
  var skillRanks = {};
  Object.keys(character.skills).forEach(function(k) {
    // R-B658-2: the flatten rule has ONE home — `skillRankOf` above. This was the inline expression
    // that stated it, and the sheet-side writer's copy of the same idea is what B-658 was.
    var rank = skillRankOf(character.skills[k]);
    if (rank > 0) skillRanks[k] = rank;
  });

  // Talents → canonical id-refs, ranks collapsed from tree positions (ADR 0003 3b, D-3B1 +
  // D-CB2: the rank survives; names/descriptions resolve from the registry at render).
  var talentList = talentsFromCreatorState(character.talents);

  // Inventory → unified canonical id-ref equipment (D-3.8: shared builder). Persists id-refs only;
  // the sheet resolves them at render via resolveSheetEquipment. armorSoak (from the resolved
  // canonical armor) feeds the derived.soak SNAPSHOT below — the pre-existing build-time
  // computation, re-keyed to canonical (NOT the deferred live re-derivation).
  var builtEquip = buildCanonicalEquipment(character.gearLedger.inventory, deps.registries);

  // Derived stats
  var chars = character.characteristics;
  // FORK B: resolve the species record against its recorded picks ONCE, then read the four
  // sheet-side sites off it (thresholds here, starting XP and the purchase baseline below).
  var speciesEff = speciesEffective(speciesData, character.speciesOption && character.speciesOption.picks);
  var speciesWound = speciesData ? speciesEff.wound_threshold_base : 10;
  var speciesStrain = speciesData ? speciesEff.strain_threshold_base : 10;
  var armorSoak = builtEquip.armorSoak;

  // Credits — 500 budget + mechanic adjustment + the F-35 d100 pocket-money roll (kept on top of
  // the gear leftover; pregens never set pocketMoney so this is +0 for them).
  // F-100 M9 (R-M9S-5): THE ONE READER, startingCredits — 500 + the adjustment + the species delta.
  // The purse and the after-creation credits both land on the saved sheet: `after` is added HERE, once (FLAG 1 (ii)).
  var __start = startingCredits(character.mechanic ? (character.mechanic.creditAdjustment || 0) : 0,
    speciesData, character.speciesOptionPicks, character.creationBuyouts, character);   // R6 lane D: a member's group (Q6 c)
  var creditTotal = __start.purse + __start.after
    + (character.pocketMoney ? (character.pocketMoney.value || 0) : 0);
  var creditSpent = character.gearLedger.inventory.reduce(function(s, it) { return s + (it.price || 0) * (it.qty || 1); }, 0);

  // Mechanic display. Veteran review fix: for Morality, resolve the paired weakness
  // from morPairs so the sheet shows "Bravery / Anger" not just "Bravery".
  var mechDisplay = null;
  if (character.mechanic) {
    var m = character.mechanic;
    mechDisplay = { type: m.descriptor || '', value: m.finalValue, description: '' };
    // T2-C: the entries list rides the saved shape (obligation/duty only — morality has no
    // typed split). Legacy saves without entries map at READ (SheetProfile).
    if (m.type !== 'morality') {
      mechDisplay.entries = m.entries || [{ type: m.descriptor || '', magnitude: m.finalValue }];
    }
    // R-MEP-2: through the ONE resolver. This read used to derive the weakness from the strength's
    // `weakKey` directly, which silently overrode a player who had departed from the pairing.
    //
    // THE `m.type === 'morality'` GUARD STAYS, and it is load-bearing: `mechDisplay` describes
    // `character.mechanic`. For a TWO-TRACK character that is the OBLIGATION, and the pair lives on
    // `moralityLayer` — so resolving unguarded here would print "Bravery / Anger" where the sheet
    // means to print the character's Obligation. The two-track pair reaches its readers through
    // `moralityPair` at the surfaces that display a PAIR, not by overwriting this field.
    if (m.type === 'morality' && gameData && gameData.narrativeMechanics
        && gameData.narrativeMechanics.morPairs) {
      var _pair = moralityPair(character, gameData.narrativeMechanics.morPairs);
      if (_pair && _pair.weakness) {
        mechDisplay.strength = _pair.strength;
        mechDisplay.weakness = _pair.weakness;
        mechDisplay.type = _pair.strength + ' / ' + _pair.weakness;
      }
    }
  }

  // Portrait
  var portrait = speciesData ? ((typeof deps.portraitFor === 'function' ? deps.portraitFor(speciesData.name) : null) || '') : '';

  // Encumbrance

  // XP
  // FORK B / Q2: the two XP forms meet here and nowhere else. speciesEff.starting_xp is the
  // ABSOLUTE (base, or a variant option's own), speciesOption.xp is the DELTA B-22 banks at confirm.
  // The schema forbids one option carrying both, so this sum cannot double-count.
  // F-100 B-1264 (R-SCC-4): THE ONE CREATION XP POOL — creationXpPool, the creator's live bar reads the same function.
  var xpPool = creationXpPool(character, speciesData, gameData && gameData.charbuild);
  // B-754 / R-RTD-6 — the creation characteristics, recovered by subtracting the POST-CREATION gain the
  // reverse transform measured from the record it came from. `chars` is the flattened live block (creation
  // + every Dedication point); the gain is the second half of that sum, so `chars - gain` is the first.
  // ABSENT-TOLERANT and PER-KEY: no gain block, or a key it does not carry, subtracts 0 — which is the
  // previous `Object.assign({}, chars)` byte for byte, and therefore every fresh creation.
  // A gain can never leave a characteristic below 1; if the arithmetic says otherwise the pair of records
  // disagree and the LIVE value is the only defensible freeze point (it is also what absence would give).
  // B-778: THIS BLOCK MOVED UP, from just above `__sheet` to just above the XP sum, and the move is the
  // whole change — `xpSpentOnChars` below needs the creation values and used to run before they existed.
  // It is a pure function of `chars` (:1495) and the record's own gain block, so it computes identically
  // here; the subtraction still lives in exactly ONE place and `characteristicsAtCreation` below still
  // reads this same `charsAtCreation`. Nothing was duplicated to make the XP sum correct.
  var __gains = character.characteristicGainsAfterCreation;
  var charsAtCreation = {};
  Object.keys(chars).forEach(function(k) {
    var g = (__gains && isFinite(Number(__gains[k]))) ? Number(__gains[k]) : 0;
    var v = (Number(chars[k]) || 0) - g;
    charsAtCreation[k] = v >= 1 ? v : (Number(chars[k]) || 0);
  });

  // B-778 — THE WALK STOPS AT THE CREATION VALUE, NOT THE LIVE ONE, and this is a THIRD instance of the
  // same creation-versus-live correction as B-736 (the frozen thresholds) and B-754 (the re-entry carry).
  // Characteristic XP is spent DURING creation and nowhere else: the one post-creation way to raise a
  // characteristic is the Dedication talent, which is paid for as a TALENT and is already counted in
  // `xpSpentOnTalents` below. Walking to the live value therefore bills a Dedication rank TWICE — measured
  // on the imported `jihn`, whose live Brawn 6 billed ranks 3,4,5,6 = 180 where his creation Brawn 5 bills
  // 3,4,5 = 120, inflating `xp.spent` 545 → 605 and eating 60 XP the player actually has.
  // NOT AN IMPORT DEFECT, which is why the fix is here and not at the import door: since B-736's
  // stamp-before-raise, ANY record with a declared post-creation gain has live above creation, so every
  // path that recomputes this sum would double-charge. Fixing it at the sum covers the whole population.
  // ABSENT-TOLERANT by construction: with no gain block `charsAtCreation` equals `chars` key for key, so
  // every character without a post-creation gain bills exactly what it billed before.
  var xpSpentOnChars = 0;
  if (speciesData) {
    ['brawn','agility','intellect','cunning','willpower','presence'].forEach(function(attr) {
      var base = speciesEff.characteristics[attr] || 2;
      var cur = charsAtCreation[attr] || chars[attr] || 2;
      for (var r = base + 1; r <= cur; r++) xpSpentOnChars += buildPrice('characteristic', { rank: r });
    });
  }
  var xpSpentOnTalents = 0;
  Object.keys(character.talents).forEach(function(posKey) {
    var entry = character.talents[posKey];
    xpSpentOnTalents += entry.cost || 0;
  });
  // Veteran review fix: include Force powers in the final XP audit. Printed per-power
  // basic costs (5-20 XP, fad p.281) — summed from the purchase entries, not count×10.
  // F-100 M10 B-1222: plus the bought upgrades' cell costs from this view (forcePowersXp, the ONE summer).
  var xpSpentOnForcePowers = forcePowersXp(character.forcePowers, gameData && gameData.charbuild);
  // CR-RAW #2: creation skill purchases — summed from the SAME per-entry stored costs the live
  // budget bar sums (D-CS4-2 one-source rule).
  var xpSpentOnSkills = Object.keys(character.skills).reduce(function(t, k) {
    var b = character.skills[k].bought;
    return t + (b ? b.reduce(function(a, c) { return a + (c || 0); }, 0) : 0);
  }, 0);
  // R-SFC-2: the species-penalty buyouts are creation spending like any other — summed from the
  // SAME per-entry stored cost the live budget sums, so the bar and the finished sheet agree by
  // construction. Absent key = 0, which is every character built before this existed.
  var xpSpentOnBuyouts = creationBuyoutSpend(character.creationBuyouts);
  // F-100 creator concept ADDENDUM 18 C1 (a): the signature abilities bought on the sheet are spending like any other —
  // re-summed here through the ONE summer the creator's bar reads, so re-entry never refunds them.
  var xpSpentOnSignature = sigAbilitiesSpend(character, gameData && gameData.charbuild);
  var xpSpentOnSpecs = specializationsSpend(character, gameData && gameData.charbuild);   // B-1038 / B-1537
  var xpRemaining = xpPool - xpSpentOnChars - xpSpentOnTalents - xpSpentOnForcePowers - xpSpentOnSkills - xpSpentOnBuyouts - xpSpentOnSignature - xpSpentOnSpecs;

  // Force rating
  // Veteran review fix: F&D CRB p.68/p.282 — every F&D career includes a Force rating of 1.
  // Previously this only fired if species had an explicit "Force Rating" ability, leaving
  // Zabrak/Human/etc. Guardians shipping with FR 0.
  // Species / line / spec clauses of the Force-access rule — resolved below in ONE call together
  // with the career clause (`forceAccessAtCreation`), once the career id is known.
  var forceRating = 0;

  // Canonical id-refs ALONGSIDE the display name strings (D-3B2: additive — the strings stay
  // for out-of-cluster readers until 3c; ids are authoritative where both exist). The creator
  // state carries canonical ids post-3a; buildTestPc's career.key is a NAME, so fall back to a
  // collision-aware name lookup (never guessed: ambiguous -> no id).
  var cbRegs = gameData.charbuild;
  var careerId = null;
  if (character.career) {
    if (cbRegs.careers[character.career.key]) careerId = character.career.key;
    else {
      var cIdx = buildNameIndex(cbRegs.careers);
      var cHit = cIdx.byName[(character.career.name || '').trim().toLowerCase()];
      if (typeof cHit === 'string') careerId = cHit;
    }
  }

  // B-20: a FaD CAREER confers Force Rating 1 regardless of campaign line (FaD CRB p.282; the
  // career carries force_rating:1 in canonical data). The block above only detected species/spec/
  // gameLine, so a Sentinel (etc.) built in an EotE/AoR campaign persisted forceRatingBase 0 —
  // no FORCE tab, and the mode-c Morality layering (which keys on the same access flag) never got
  // the chance to attach Morality. Detect it from the resolved career.
  if (forceAccessAtCreation(gameLine, speciesData, careerId ? cbRegs.careers[careerId] : null, specData)) {
    forceRating = Math.max(forceRating, 1);
  }

  var __sheet = {
    name: character.identity.name || 'Unnamed',
    species: character.species ? character.species.name : '',
    speciesId: speciesData ? speciesData.id : (character.species && cbRegs.species[character.species.key] ? character.species.key : null),
    career: character.career ? character.career.name : '',
    careerId: careerId,
    specialization: character.specializations[0] ? character.specializations[0].name : '',
    specializationIds: character.specializations.map(function(s) { return s.key; }).filter(function(k) { return !!cbRegs.specializations[k]; }),
    book: gameLine,
    source: source || 'FullCreator',
    portrait: portrait,
    backstory: character.narrative.backstory || '',
    // B-103 rule 2 — THE LEGACY BLOCK IS FROZEN, VERBATIM, THROUGH EVERY PATH. These are the
    // player's own words from a build made before the motivation step existed. Never
    // auto-converted, never deleted, never partially updated: D-2's law (report, never invent).
    motivations: character.motivations || { strength: null, flaw: null, desire: null, fear: null },
    // B-103 rule 1 — the NEW structured field, ADDITIVE. `{category, specific, custom}` with
    // `specific` and `custom` mutually exclusive; ONE motivation, so an object and never an array
    // (Amendment 2). Written only when the creator produced one, so absence stays legal and NO
    // VERSION BUMP is owed (rule 3): additive new key + frozen old key is non-breaking by
    // construction — unlike a positional index, nothing here changes meaning under insertion.
    // B-1055 MOUNT: the creator's recorded Dedication points go on AFTER `charsAtCreation` and the walk above.
    characteristics: creatorCharacteristicsWithPending(character),
    // CS-2 (R-DAR): persist the INPUTS, not the computed snapshot — the sheet derives soak/thresholds/
    // defense/forceRating at render via computeDerived (so equipped armor flows through).
    // The legacy `derived` block is no longer written; old saves keep theirs as a fallback.
    // CS-4 backfill (§4.4): derived-effect talents now actually move the numbers at CREATION too (Grit/
    // Toughened/Enduring/Sixth Sense/Superior Reflexes) — previously derivedBonuses shipped all-zeros
    // because nothing wrote them. Summed from the owned tree talents via the shared effects map.
    derivedBonuses: derivedBonusesFromTalents(Object.keys(character.talents).map(function(pk) { return character.talents[pk].talentKey; }), cbRegs.talents),
    // CS-4d: owned equipment-conditional talents (armor_master pair) — computeDerived applies them live vs armor.
    derivedConditional: conditionalTalentsFromOwned(Object.keys(character.talents).map(function(pk) { return character.talents[pk].talentKey; }), cbRegs.talents),
    forceRatingBase: forceRating,
    woundBase: speciesWound,
    strainBase: speciesStrain,
    // B-736 (ruling `threshold-freezing-shape` R-TF-1/R-TF-2) — THE CREATION-TIME CHARACTERISTICS,
    // persisted as an INPUT beside the other two inputs of the very same sum. RAW freezes both
    // thresholds at the value held when creation ends: once set, later Brawn gains
    // leave the wound threshold alone — it grows only
    // through talents such as Toughened, and the parallel sentence for
    // Willpower and Grit (EotE p.94 · AoR p.104 · FaD p.104). `computeDerived` therefore reads the two
    // threshold characteristics from HERE and not from the live `characteristics` block above.
    // WHY ONE BLOCK rather than `brawnAtCreation`/`willpowerAtCreation` (R-TF-2 leaves the spelling to
    // the implementer): Dedication can raise ANY of the six, so the post-creation stamp in `buyTalent`
    // copies the whole pre-patch map in a single write and cannot forget a key, and a later rule that
    // freezes a third characteristic needs no new field. It also mirrors `characteristics` exactly, so
    // the read is one fallback rather than two.
    // ADDITIVE + ABSENT-TOLERANT on G9's template: absence means PRE-RULING, never zero — such a record
    // computes from the LIVE characteristic and so reads exactly the number it reads today, which is
    // what Jason chose in Addendum 1 ("freeze at migration"; nobody loses the point).
    // B-754 (`reentry-trade-deltas-shape` ADDENDUM 1, R-RTD-5/R-RTD-6) — this wrote `Object.assign({},
    // chars)` UNCONDITIONALLY, which is the leak: a character re-entered through EDIT IN CREATOR came back
    // stamped at its Dedication-inflated LIVE Brawn and its wound threshold rose by one, permanently, for
    // having been edited. It now subtracts the post-creation GAIN the reverse transform measured
    // (`characteristicGainsAfterCreation`, computed there from this very block), so re-entry does NOT
    // re-establish the creation point. FRESH CREATION carries no gain block and every gain reads 0, so
    // this is `Object.assign({}, chars)` exactly as before for every path that is not a re-entry.
    characteristicsAtCreation: charsAtCreation,
    // Veteran review fix: Profile tab's XP panel reads xp.spent explicitly; previous
    // build emitted only total + remaining, causing "SPENT 0" to disagree with Step 10 math.
    xp: { total: xpPool, remaining: xpRemaining, spent: xpSpentOnChars + xpSpentOnTalents + xpSpentOnForcePowers + xpSpentOnSkills + xpSpentOnBuyouts + xpSpentOnSignature + xpSpentOnSpecs },
    skills: skillRanks,
    talents: talentList,
    // CS-4 (R-CS4a): positional spec-tree ownership so ADVANCEMENT can render the tree + mark owned
    // cells and gate further buys by the connection rule (eote p.93). Non-destructive addition
    // alongside the `talents[]` display list; old saves without it simply have no buyable tree.
    // B-29: seed the chosen specs (owned-with-zero-cells) so a no-talent character is born OWNING
    // its specialization, not misfiled as pre-tree-tracking legacy on ADVANCEMENT.
    specializations: specsFromCreatorState(character.talents, character.specializations.map(function(s) { return s.key; }).filter(function(k) { return !!cbRegs.specializations[k]; })),
    // Purchased Force powers as canonical id-refs (creator buy state is id-keyed post-3a);
    // the sheet's FORCE tab resolves name/description from the registry at render.
    forcePowers: powersFromCreatorState(character.forcePowers),
    equipment: {
      weapons: builtEquip.weapons,
      armor: builtEquip.armor,
      gear: builtEquip.gear,
      credits: creditTotal - creditSpent,
    },
    // G9 (ratified, `post-crafting-sequencing` item 3): persist the mechanic's trade PICKS. The net
    // effect always survived in mechDisplay.value; WHICH trades a player took was discarded, so
    // re-entry (F-45) could never show them. ADDITIVE and absent-tolerant — an empty array for a path
    // with no trade step (Guided) is meaningfully different from the field being absent (pre-G9 saves).
    mechanicTradeIds: (character.mechanic && Array.isArray(character.mechanic.tradeIds))
      ? character.mechanic.tradeIds.slice() : [],
    obligation: character.mechanic && character.mechanic.type === 'obligation' ? mechDisplay : null,
    duty: character.mechanic && character.mechanic.type === 'duty' ? mechDisplay : null,
    // BOOKS-1c Part B: morality is the primary track's display, OR — when a Force character kept the
    // mode-c layer in an obligation/duty campaign — a locked-50 second track alongside it.
    morality: character.mechanic && character.mechanic.type === 'morality' ? mechDisplay
      : (character.moralityLayer ? { type: '', value: 50, description: '', strength: '', weakness: '' } : null),
  };
  // F-9 B4 — stamp the variant the character was BUILT under (R-Y2-1). ADDITIVE + absent = vanilla:
  // only written when the toggle was active at creation, so the sheet resolves its OWN trees/talents
  // forever regardless of the toggle's later state (the ownership half of discovery-vs-ownership).
  var __mods = Array.isArray(deps.activeMods) ? deps.activeMods : [];
  if (__mods.length) __sheet.mods = __mods;
  // B-23 (G8): persist the option PICK — the one thing the sheet can't re-derive (which option a
  // player chose, e.g. Sluissi Gearhead-vs-Solid-Repairs). ADDITIVE + absent-tolerant (R-Y2-1):
  // written only when a pick was made; readers derive the granted talent from it at render.
  var __picks = character.speciesOption && character.speciesOption.picks;
  if (__picks && Object.keys(__picks).length) __sheet.speciesOptionPicks = __picks;
  // R-SFC-2 (G8's idiom again): persist the BUYOUT — the other thing the sheet cannot re-derive,
  // because "this ability is absent" is indistinguishable from "this species never had it" unless
  // the purchase itself is recorded. `{ <ability-name-slug>: { xp: <cost paid> } }`, ADDITIVE and
  // absent-tolerant: written only when something was bought, so no old save needs migrating and the
  // resolver's omission simply never fires for them.
  var __buyouts = character.creationBuyouts;
  if (__buyouts && Object.keys(__buyouts).length) __sheet.creationBuyouts = Object.assign({}, __buyouts);
  // R-SFL-3 (ruling `f100-surfacing-species-flip-card` ADDENDUM 14): the seen-stamp rides BOTH directions of the creator
  // round trip, or a character edited in the creator would meet the species switch's one-time line again.
  var __rulesSeen = character.rules_seen;
  if (__rulesSeen && typeof __rulesSeen === 'object' && Object.keys(__rulesSeen).length) __sheet.rules_seen = JSON.parse(JSON.stringify(__rulesSeen));
  // B-103 rule 1, written the same additive way as the picks above.
  var __mot = character.motivation;
  if (__mot && (__mot.category || __mot.specific || __mot.custom)) __sheet.motivation = __mot;
  // B-40 (R-SY4 paper: ruling `f-eds-6-spec-choice-save-shape` §3): the spec choice-skill pick,
  // {specId: {poolId: [skillId]}}. Same discipline as above — persist only the pick, derive the
  // career-skill status at render; absent = no choice = the spec's fixed skills, so old saves
  // need no migration.
  var __specChoices = character.specSkillChoices;
  if (__specChoices && Object.keys(__specChoices).length) __sheet.specSkillChoices = __specChoices;
  // R-CI-2 (ruling `f100-cerean-intellectuals-card`, ADDENDUM 2 Q1): the species choice-skill pick,
  // {speciesId: {poolId: [skillId]}} — the same discipline, deep-copied, written only when a pick exists; absent = no
  // pick = nothing granted (careerSkillStatus folds it; no rank anywhere).
  var __speciesChoices = character.speciesSkillChoices;
  if (__speciesChoices && typeof __speciesChoices === 'object' && Object.keys(__speciesChoices).length)
    __sheet.speciesSkillChoices = JSON.parse(JSON.stringify(__speciesChoices));
  // R-SPP-9 (ruling `short-path-persist-shape`): persist a TREELESS talent purchase — a rank bought
  // OUTSIDE any specialization tree (Collapse of the Republic's Short Path: 30 XP → a Force Rating
  // rank, before a spec exists, to unlock Knight/General). The fourth irreproducible bit beside the
  // picks above: the reverse transform rebuilds talents ONLY from tree positions, so a treeless rank
  // is otherwise LOST on re-entry — silently, since the positionless mark only fires for a save with
  // no specs at all (CREATOR_PLUMBING §6). ONE ENTRY PER RANK (no `rank` field — rank is the count,
  // mirroring `character.talents`); `xp` = what it cost, so the ledger reconstructs with no tree row
  // and NO price in code; `source` = provenance (charter §8), read by no resolver.
  //
  // C-SPP-1 / R-SPP-12 (gate ruling `short-path-to-power-gate`): SELECT ON STRUCTURE, NOT PROVENANCE.
  // The reverse leg below rebuilds a treeless entry keyed by the sentinel `specKey === '__treeless__'`
  // and stamps `source: e.source || 'treeless'`. This forward leg MUST select on the SAME structural
  // marker, or a treeless entry that arrives without the `short_path` label — exactly what F-45's
  // importer will write — is rebuilt once, then silently dropped on the next save. `source` still
  // rides along as recorded provenance; it never decides whether the fact is saved. ADDITIVE +
  // absent-tolerant.
  var __treeless = Object.keys(character.talents || {}).reduce(function (acc, k) {
    var t = character.talents[k];
    // B-181 / R-TCP-2 (a1): a treeless instance carries its OWN picks, on the entry, one object per
    // rank — the same select-on-structure rule as the entry itself. Emitted only when present, so
    // absence stays absence rather than becoming an empty array (R-TCP-3).
    // THE PUSH LINE BELOW IS LOAD-BEARING VERBATIM: `test/short_path_treeless.cjs`'s `forward_name`
    // mutant rewrites it by exact string match to prove selection-on-STRUCTURE still matters
    // (C-SPP-1). B-181 therefore ENRICHES the pushed entry on the following line rather than
    // reformatting this one — a mutation guard's anchor is part of its contract, and re-pointing
    // another lap's assert to suit my diff is not mine to do.
    var __n = acc.length;
    if (t && t.specKey === '__treeless__' && t.talentKey) acc.push({ id: t.talentKey, xp: t.cost || 0, source: t.source || 'treeless' });
    // B-181 / R-TCP-2 (a1): the picks ride ON the entry this iteration pushed — keyed off the push
    // actually happening (length grew), so it can never enrich a previous rank of the same talent.
    if (acc.length > __n && Array.isArray(t.skillChoices) && t.skillChoices.length) {
      acc[acc.length - 1].skillChoices = t.skillChoices.slice();
    }
    return acc;
  }, []);
  if (__treeless.length) __sheet.treelessTalents = __treeless;
  // f100-m13-reach-paper §4.2: the creator's free labels die at the flatten above, so they are kept here. Flat ranks carry no labels and write no record.
  var __free = { career: [], specs: {} }, __labelled = false, __first = character.specializations[0] && character.specializations[0].key;
  Object.keys(character.skills).forEach(function (k) {
    var e = character.skills[k]; if (!e || typeof e !== 'object') return;
    __labelled = true;
    if (e.freeCareer) __free.career.push(k);
    if (e.freeSpec && __first) (__free.specs[__first] = __free.specs[__first] || []).push(k);
  });
  if (__labelled) __sheet.freeRanks = __free;
  // B-181 / R-TCP-1: the positional talent-choice map is the fifth irreproducible bit — it cannot be
  // rebuilt from tree positions (the positions say WHICH cells are owned, never which skills the
  // player chose there), so without this leg every pick is lost on re-entry, exactly as the treeless
  // rank was before C-SPP-1. Deep-copied, additive, absent-tolerant.
  if (character.talentSkillChoices && Object.keys(character.talentSkillChoices).length) {
    __sheet.talentSkillChoices = JSON.parse(JSON.stringify(character.talentSkillChoices));
  }
  // F-100 M8 (R-M8K-6 (d); B-1064; commercial's f100-dice-hotfix R-FDH-11 fixed the characteristic leg alone, subsumed
  // here at the merge): the other two pick maps ride the same hand-over, in the same change — M7's
  // characteristic swaps (Renegade Form, Dedication) were dropped here, and M8's container would inherit the gap.
  ['talentCharacteristicChoices', 'talentChoices'].forEach(function (k) {
    if (character[k] && typeof character[k] === 'object' && Object.keys(character[k]).length) __sheet[k] = JSON.parse(JSON.stringify(character[k]));
  });
  // F-100 M12 (B-1244; rulings f100-m12-census-card R-M12C-39, f100-m12-build-card R-M12B-8): the signature abilities ride
  // the same hand-over — [{ id, tree, owned: ['row-col', …] }], written by the OggDude import (already checked V1–V7) and
  // by F-45's door, deleted at R-M13B-103. Deep-copied, ADDITIVE, absent-tolerant: no entries, no field. Their XP is
  // in xp.spent above through sigAbilitiesSpend (creator concept ADDENDUM 18 C1 (a); R-M12C-36's "never summed" superseded
  // by D-229 Q1 (a)), every owned cell.
  if (Array.isArray(character.signatureAbilities) && character.signatureAbilities.length) __sheet.signatureAbilities = JSON.parse(JSON.stringify(character.signatureAbilities));
  // F-100 surfacing (ruling f100-surfacing-creator-concept R-SCC-3; brief §3.1, NEW member on paper): the starting
  // entitlements a player DECLINED — [{ id, declined: true }], written by the gear step's Decline tick only while ticked;
  // absent = every entitlement granted. The words resolve at render from the career record's `starting_entitlements`.
  // Deep-copied, ADDITIVE, absent-tolerant (the signature idiom): no declined entry, no field.
  if (Array.isArray(character.entitlements) && character.entitlements.length) __sheet.entitlements = JSON.parse(JSON.stringify(character.entitlements));
  return __sheet;
}

  // Ruling `release-r6-rewards-reentry-xp` C2: the CLOSED list of sheet-owned keys whose rows carry the XP paid for them
  // (R4 shapes: `rewards[].xp`, `contacts[].xp`). A priced key joins by name; test/b1408_sheet_owned_fields.cjs reds a
  // sheet-owned key written beside the ledger's `xp` that is missing here.
  var SHEET_OWNED_XP_FIELDS = Object.freeze(['rewards', 'contacts']);

  // C1: the XP paid for a sheet's own priced rows — `carried` maps a key to its rows. Sums each row's
  // persisted `xp` over SHEET_OWNED_XP_FIELDS only; a missing or non-numeric `xp` counts 0. Never re-priced from a table.
  function sheetOwnedXpSpend(carried) {
    var sum = 0;
    if (!carried || typeof carried !== 'object') return 0;
    SHEET_OWNED_XP_FIELDS.forEach(function (k) {
      var rows = carried[k];
      if (!Array.isArray(rows)) return;
      rows.forEach(function (r) {
        var x = r && Number(r.xp);
        if (typeof x === 'number' && isFinite(x)) sum += x;
      });
    });
    return sum;
  }

  // ── F-45 D-1 (ruling `f45-reentry-entry` §3) — the creation skill allowance ──────────────────
  // THE BUG THIS EXISTS TO KILL: a saved sheet records that a character HAS Athletics 3, never which
  // of those ranks were free. The first cut restored every rank into `purchased` — which in this
  // codebase is a FREE-grant field (app.jsx:6104/:6191 write species grants into it) while the XP
  // register charges from `bought` alone (app.jsx:1591). Result: re-entry handed back every rank AND
  // its experience. The field's name means the opposite of what it says; that is what fooled three
  // reviews in a row, and it now carries a comment at its declaration saying so.
  //
  // THE FIX, and why it invents nothing: the SIZE of the creation allowance is fixed by the book —
  // N career picks (the career's `free_ranks`, 4 unless the registry says otherwise), 2 spec picks,
  // plus the species' named grants, each a rank-1 creation pick. Only the LABELS are lost. So the
  // allowance is credited back at its RAW size and every remaining rank is charged at RAW cost
  // through the one shared pricing function. The reconstruction is deterministic (stable key order)
  // and recorded in `notes` — it is a reconstruction, and it says so.
  //
  // Returns { careerPicks, specPicks, speciesGrants, careerStatusKeys } in SHEET-key space.
  // ── THE FREE PICK COUNTS AT CREATION — one arithmetic ────────────────────────────────────────
  // Career free ranks: the career's own `free_ranks` (4; the FaD careers 3 — CR-RAW), raised by the
  // species' `bonus_free_ranks.career` (Droid +2, Arkanian Offshoot +2 — B-21). Spec free ranks: 2,
  // raised by `bonus_free_ranks.spec` (Droid +1). Was computed here AND inline in app.jsx
  // (`_fcSpBonus`); the exception census flagged the duplicate. Both now read this.
  function creationFreePicks(speciesData, careerData) {
    var spBonus = (speciesData && speciesData.bonus_free_ranks) || {};
    return {
      career: ((careerData && careerData.free_ranks) || 4) + (spBonus.career || 0),
      spec: 2 + (spBonus.spec || 0),
    };
  }

  function creationSkillAllowance(sheet, charbuild) {
    var cb = charbuild || {};
    var reg = cb.species || {}, careerReg = cb.careers || {}, specReg = cb.specializations || {};
    var keys = cb.skillSheetKeys || {};
    function sk(id) { return keys[id] || id; }

    var sid = (sheet && sheet.speciesId) || (sheet && sheet.species ? lookupByName(speciesNameIndex(reg), sheet.species) : null);
    var species = sid ? reg[sid] : null;
    var cid = (sheet && sheet.careerId) || (sheet && sheet.career ? lookupByName(buildNameIndex(careerReg), sheet.career) : null);
    var career = cid ? careerReg[cid] : null;
    var specIds = (sheet && Array.isArray(sheet.specializations))
      ? sheet.specializations.map(function (x) { return x && x.id; }).filter(Boolean) : [];
    var spec = specIds.length ? specReg[specIds[0]] : null;

    // The pick counts — ONE arithmetic, shared with the creator (`creationFreePicks`).
    var _picks = creationFreePicks(species, career);
    var careerPicks = _picks.career, specPicks = _picks.spec;

    // Species skill grants: the flat list plus the CHOSEN option's grants (G8's persisted pick —
    // the one species choice the sheet does record, so no guessing here either).
    // R-SAM-1: the species half of the allowance IS the forward applier — one function, not a twin.
    // `sk(id) === keys[id] || id`, so `speciesSkillGrants(species, picks, keys)` reproduces the former
    // inline reconstruction exactly (both walk starting_skills ∪ chosen skill_grants through
    // `_chosenOptions`, keyed by the sheet key). Folded onto the applier so the reverse transform and
    // the forward creator/sheet path can never drift.
    var picks = (sheet && sheet.speciesOptionPicks && typeof sheet.speciesOptionPicks === 'object') ? sheet.speciesOptionPicks : {};
    var speciesGrants = species ? speciesSkillGrants(species, picks, keys) : {};

    // Career STATUS at creation = the career's skills ∪ the chosen spec's (RAW: a specialization's
    // skills ARE career skills — eote p.35/p.102, the same union the creator and the sheet use),
    // plus B-40's chosen spec skill where the sheet recorded one. Drives BOTH eligibility and price.
    // B-181 (R-TCP-1) → F-100 M7 C2 (R-M7K-7): the status IS careerSkillStatus — the creation rule counts the FIRST
    // spec's own skills only (opts.specIds), and every owned talent's picks and fixed grants, and the species'
    // `as_career`, join the same union. One answer, never a second resolution path (R-PFR2-3).
    var careerStatusKeys = {};
    var _st = careerSkillStatus(sheet || {}, cb, { specIds: spec ? [spec.id] : [] });
    if (!career) Object.keys(_st).forEach(function (k) { _st[k].because = _st[k].because.filter(function (b) { return b !== 'career'; }); });
    // B-1039 C4 (ruling release-r7-bug-burndown ADDENDUM 319, (A)): re-entry prices as the creator does, whose own view
    // carries no equipment — an owned item's grant ('item:', 'group-item:') is dropped from the answer, so owning or
    // selling an item never moves the re-entry total. The one answer's OUTPUT is filtered; no second career test.
    Object.keys(_st).forEach(function (k) { _st[k].because = _st[k].because.filter(function (b) { return !/^(?:group-)?item:/.test(b); }); });
    Object.keys(_st).forEach(function (k) { if (_st[k].because.length) careerStatusKeys[sk(_st[k].id)] = true; });

    return {
      careerPicks: careerPicks, specPicks: specPicks, speciesGrants: speciesGrants,
      careerStatusKeys: careerStatusKeys,
      // Diagnostic, not decoration: without the id->sheet-key bridge nothing matches the sheet's
      // keys, every skill prices as non-career, and the character is silently OVERCHARGED. The
      // caller reports this rather than letting a bad number look like a considered one.
      unmapped: !cb.skillSheetKeys && !!(career || spec),
      careerEligible: career ? (career.career_skills || []).map(sk) : [],
      specEligible: spec ? (spec.career_skills || []).map(sk) : [],
    };
  }

  // Credit the allowance and charge the rest. `ranks` is the sheet's flat {sheetKey: rank} map.
  //
  // TWO RULES, both read out of the creator rather than inferred from it:
  //
  //   1. A skill may absorb ONE CAREER PICK AND ONE SPEC PICK, plus any species grant — bounded only
  //      by the RANK-2 CREATION CAP. Picking a skill your career already granted takes it to rank 2,
  //      and the app says so on the button: `app.jsx:3159` renders "★ Already Rank 1 from career —
  //      this grants Rank 2", and the specialization screen states it outright at `:2894`.
  //      THE DECIDING LINE is `FCSkillPicker`'s `canSelect` (app.jsx:3096):
  //          var canSelect = !atCap && (isSelected || count < max);
  //      `isOtherSelected` is computed but NEVER consulted there — its three uses are all display.
  //      RAW agrees: rank 2 is the only creation limit (eote p.92), and Step 6 contemplates a skill
  //      receiving several free ranks.
  //      CORRECTION (ruling `f45-disjoint-picks-correction`, R-DLR1): this comment previously claimed
  //      the opposite — "at most one free pick" — citing the two picker CALL SITES, which sit beside
  //      the truth without containing it. That cost a re-entering character 10 XP per stacked skill.
  //      Adjacency is not evidence; cite the line that decides.
  //   2. The allowance is credited AS FAVOURABLY AS THE RULES ALLOW. Charging a player for a rank
  //      their free picks could have covered is simply wrong. This also makes the result
  //      ORDER-INDEPENDENT: the maximum is unique in VALUE even where several assignments reach it,
  //      which is the invariance the guard perturbs for.
  //
  // Exact, not greedy. Each skill takes 0, 1 or 2 picks (at most one from each pool), so the choice
  // is a two-dimensional knapsack over the career and spec budgets — solved by DP rather than
  // enumeration, because stacking is now legal and a stacked skill is worth MORE than two separate
  // ones (the 2nd free rank on a skill saves rank-2's price, not rank-1's).
  function skillsFromRanks(ranks, allow) {
    var out = {};
    // ORIGINAL key order, deliberately: the round-trip property compares serialised sheets, so
    // re-ordering the skill map would fail it on nothing but insertion order.
    var keys = Object.keys(ranks || {}).filter(function (k) { return (Number(ranks[k]) || 0) > 0; });
    keys.forEach(function (k) {
      out[k] = { freeCareer: false, freeSpec: false, freeSpecies: 0, purchased: 0, bought: [] };
      var g = Number(allow.speciesGrants[k]) || 0;
      if (g > 0) out[k].freeSpecies = Math.min(g, Number(ranks[k]) || 0);
    });

    var careerOK = {}; (allow.careerEligible || []).forEach(function (k) { careerOK[k] = true; });
    var specOK = {}; (allow.specEligible || []).forEach(function (k) { specOK[k] = true; });
    // RAW creation cap — eote p.92; the only limiter on free ranks. Hardcoded rather than read from
    // the creator's per-skill `skillCaps` (B-19's Corellian Piloting → 3) because the SHEET DOES NOT
    // PERSIST THEM: honouring them here would mean inventing which species option a character took.
    // Capping at 2 can only under-credit, never over-credit (gate D-1, ratified).
    // RIDER (ruling `f45-disjoint-picks-fix`): if B-19-class per-skill caps are ever persisted on the
    // sheet, THIS IS THE LINE THAT READS THEM.
    var CAP = 2;

    // Per-skill options and what each is worth. Every free pick lands on a career-STATUS skill, so
    // the saved price is skillRankCost(position, true) — and the position is what makes stacking
    // worth more than spreading.
    var opts = keys.map(function (k) {
      var base = out[k].freeSpecies;
      var room = Math.min(Number(ranks[k]) || 0, CAP) - base;
      var one = room >= 1 ? (skillRankCost(base + 1, true) || 0) : 0;
      var two = room >= 2 ? one + (skillRankCost(base + 2, true) || 0) : 0;
      return { k: k, c: !!careerOK[k] && room >= 1, s: !!specOK[k] && room >= 1,
               both: !!careerOK[k] && !!specOK[k] && room >= 2, one: one, two: two };
    });

    var Cn = Math.max(0, allow.careerPicks | 0), Sn = Math.max(0, allow.specPicks | 0);

    // Two-dimensional knapsack, one LAYER PER SKILL so the choice can be walked back out. A single
    // rolling table with parent pointers cannot be backtracked — the pointers go stale the moment a
    // later skill overwrites a cell — which is exactly the bug the invariance guard caught here.
    var n = opts.length;
    var NEG = -1;
    var layer = [];                       // layer[i][c][s] = best savings using the first i skills
    for (var i0 = 0; i0 <= n; i0++) {
      var t = [];
      for (var c0 = 0; c0 <= Cn; c0++) t.push(new Array(Sn + 1).fill(NEG));
      layer.push(t);
    }
    layer[0][0][0] = 0;
    for (var i = 0; i < n; i++) {
      var o = opts[i];
      for (var c = 0; c <= Cn; c++) {
        for (var sIdx = 0; sIdx <= Sn; sIdx++) {
          var cur = layer[i][c][sIdx];
          if (cur < 0) continue;
          var put = function (nc, ns, gain) {
            if (nc > Cn || ns > Sn) return;
            if (cur + gain > layer[i + 1][nc][ns]) layer[i + 1][nc][ns] = cur + gain;
          };
          put(c, sIdx, 0);                                  // skip this skill
          if (o.c) put(c + 1, sIdx, o.one);                 // career pick
          if (o.s) put(c, sIdx + 1, o.one);                 // spec pick
          if (o.both) put(c + 1, sIdx + 1, o.two);          // BOTH — rank 2, the corrected rule
        }
      }
    }
    // best final cell
    var bc = 0, bs = 0, best = 0;
    for (var c1 = 0; c1 <= Cn; c1++) for (var s1 = 0; s1 <= Sn; s1++) {
      if (layer[n][c1][s1] > best) { best = layer[n][c1][s1]; bc = c1; bs = s1; }
    }
    // walk back: at each layer pick the choice that reproduces the stored optimum. Options are tried
    // in a FIXED order, so ties resolve identically on every run — the labelling is deterministic
    // even though only the VALUE is guaranteed unique.
    for (var j = n - 1; j >= 0; j--) {
      var oj = opts[j], want = layer[j + 1][bc][bs];
      if (oj.both && bc > 0 && bs > 0 && layer[j][bc - 1][bs - 1] >= 0 && layer[j][bc - 1][bs - 1] + oj.two === want) {
        out[oj.k].freeCareer = true; out[oj.k].freeSpec = true; bc -= 1; bs -= 1; continue;
      }
      if (oj.c && bc > 0 && layer[j][bc - 1][bs] >= 0 && layer[j][bc - 1][bs] + oj.one === want) {
        out[oj.k].freeCareer = true; bc -= 1; continue;
      }
      if (oj.s && bs > 0 && layer[j][bc][bs - 1] >= 0 && layer[j][bc][bs - 1] + oj.one === want) {
        out[oj.k].freeSpec = true; bs -= 1; continue;
      }
      // else: skipped
    }

    // Everything above the credited floor is CHARGED, at RAW cost, through the one pricing path.
    keys.forEach(function (k) {
      var total = Number(ranks[k]) || 0;
      var free = (out[k].freeCareer ? 1 : 0) + (out[k].freeSpec ? 1 : 0) + (out[k].freeSpecies || 0);
      var inCareer = !!allow.careerStatusKeys[k];
      for (var r = free + 1; r <= total; r++) {
        var cst = skillRankCost(r, inCareer);
        out[k].bought.push(cst == null ? 0 : cst);
      }
    });
    return out;
  }

  // F-100 M13 (f100-m13-reach-paper §4.3): THE ONE READER of `sheet.freeRanks` { career: [keys], specs: { <specId>: [keys] } }. The record if present,
  // else the reconstruction, marked `reconstructed`; nothing is minted. Each listed key is one free rank inside `skills[key]`; a key past its rank reads as
  // nothing, and a specialization no longer held takes its picks with it.
  function freeRanksOf(sheet, view) {
    var rec = sheet && sheet.freeRanks, out = { career: [], specs: {} }, skills = (sheet && sheet.skills) || {};
    var held = (Array.isArray(sheet && sheet.specializations) ? sheet.specializations : []).map(function (x) { return x && x.id; }).filter(Boolean);
    if (rec && typeof rec === 'object' && !Array.isArray(rec)) {
      out.career = Array.isArray(rec.career) ? rec.career.slice() : [];
      Object.keys((rec.specs && typeof rec.specs === 'object') ? rec.specs : {}).forEach(function (id) { if (Array.isArray(rec.specs[id])) out.specs[id] = rec.specs[id].slice(); });
    } else {
      var made = skillsFromRanks(skills, creationSkillAllowance(sheet, view));
      out.reconstructed = true;
      Object.keys(made).forEach(function (k) {
        if (made[k].freeCareer) out.career.push(k);
        if (made[k].freeSpec && held[0]) (out.specs[held[0]] = out.specs[held[0]] || []).push(k);
      });
    }
    var left = {}, keep = function (k) { if (!_has(left, k)) left[k] = Number(skills[k]) || 0; return left[k]-- > 0; };
    out.career = out.career.filter(keep);
    Object.keys(out.specs).forEach(function (id) { if (held.indexOf(id) < 0) delete out.specs[id]; else out.specs[id] = out.specs[id].filter(keep); });
    return out;
  }

  // ── encumbrance, resolved at render ─────────────────────────────────────
  // ONE computation for carried encumbrance, threshold, and over-state.
  // Called by the creator resolver (snapshot) and the sheet loadout (live).
  // F-100 M9 (R-M9S-5, R-M9B-3): `speciesDelta` is the species' encumbrance_threshold_delta (speciesEncumbranceDelta), an
  // INPUT so the callers get it from one place; absent or 0, the threshold is exactly
  // what it was.
  function computeEncumbrance(resolvedEquipment, characteristics, speciesDelta) {
    var eq = resolvedEquipment || {};
    var brawn = (characteristics && Number(characteristics.brawn)) || 0;
    var weapons = eq.weapons || [];
    var armor = eq.armor;
    var gear = eq.gear || [];

    var carried = 0;
    weapons.forEach(function(w) {
      if (w.state === 'stowed') return;
      carried += (Number(w.encumbrance) || 0);
    });
    if (armor) {
      if (armor.state !== 'stowed') {
        var armorEnc = Number(armor.encumbrance) || 0;
        if (armor.state === 'worn') armorEnc = Math.max(0, armorEnc - 3);
        carried += armorEnc;
      }
    }
    gear.forEach(function(g) {
      if (g.state === 'stowed') return;
      carried += (Number(g.encumbrance) || 0) * (Number(g.qty) || 1);
    });

    var containerBonus = 0;
    var containerSources = [];
    gear.forEach(function(g) {
      if (g.state === 'stowed') return;
      if (g.encumbrance_threshold_bonus) {
        var gBonus = Number(g.encumbrance_threshold_bonus) || 0;
        if (g.threshold_bonus_requires === 'worn' && g.state !== 'worn') return;
        containerBonus += gBonus;
        containerSources.push({ name: g.name, bonus: gBonus, source: 'carried' });
      }
    });
    if (armor && armor.state === 'worn' && armor.encumbrance_threshold_bonus) {
      var aBonus = Number(armor.encumbrance_threshold_bonus) || 0;
      containerBonus += aBonus;
      containerSources.push({ name: armor.name, bonus: aBonus, source: 'worn' });
    }
    // B-1185 (R-B1185-5): an id-ref attachment entry ({id, mods}) never carries the bonus, so the RECORD's bonus is read
    // by id on the shared path (ItemResolve.applyInstalledAttachments → resolveSheetEquipment's `_attachmentCarry`). An
    // item resolveSheetEquipment did not resolve (a legacy passthrough) has no `_attachmentCarry`, and its inline
    // attachment objects are read as before.
    function _attachmentBonus(item) {
      if (item && Array.isArray(item._attachmentCarry)) {
        return item._attachmentCarry.reduce(function(sum, c) {
          var cb = Number(c && c.bonus) || 0;
          if (cb) containerSources.push({ name: c.name, bonus: cb, source: 'attachment' });
          return sum + cb;
        }, 0);
      }
      var atts = item && item.attachments;
      if (!Array.isArray(atts)) return 0;
      var sum = 0;
      atts.forEach(function(a) {
        if (a && a.encumbrance_threshold_bonus) {
          var ab = Number(a.encumbrance_threshold_bonus) || 0;
          sum += ab;
          containerSources.push({ name: a.name, bonus: ab, source: 'attachment' });
        }
      });
      return sum;
    }
    gear.forEach(function(g) {
      if (g.state === 'stowed') return;
      containerBonus += _attachmentBonus(g);
    });
    if (armor && armor.state === 'worn') {
      containerBonus += _attachmentBonus(armor);
    }
    weapons.forEach(function(w) {
      if (w.state === 'stowed') return;
      containerBonus += _attachmentBonus(w);
    });

    // F-100 M12 MV3 (R-M12B-60): an in-use item's encumbrance_threshold_delta (an accessory pouch's +2, repulsor-assisted
    // lifting's own "+2 Brawn for determining encumbrance threshold") — a plain threshold, listed with its attachment. The
    // `brawn` above stays the sheet's: an "as if" Brawn feeds checks only (RAW-silent, reported).
    // `in_use: true` on its source marks it for derivedBecause's "while in use" (F2). `host` (B-1441, ruling
    // f100-surfacing-because-install-fold ADDENDUM 4 F1/F2) names the host item and the attachment — "<section>:<index>:<id>" —
    // so derivedBecause folds N installs of one option on one item into one row (R-SBF-1); internal, never saved.
    itemCharacterEffects(eq).forEach(function (x) {
      if (x.effect.op !== 'encumbrance_threshold_delta' || !x.effect.value) return;
      containerBonus += x.effect.value;
      containerSources.push({ name: x.owner.source || x.owner.name, bonus: x.effect.value, source: 'attachment', in_use: true,
        host: x.owner.section + ':' + x.owner.index + ':' + x.owner.attachment });
    });
    var spDelta = Number(speciesDelta) || 0;
    var limit = 5 + brawn + containerBonus + spDelta;
    var over = Math.max(0, carried - limit);
    var setbacks = over;
    var freeManeuverLost = over >= brawn && brawn > 0;

    return {
      carried: carried,
      limit: limit,
      over: over,
      setbacks: setbacks,
      freeManeuverLost: freeManeuverLost,
      brawn: brawn,
      containerBonus: containerBonus,
      containerSources: containerSources,
      speciesDelta: spDelta,
    };
  }

  // ── derived stats, resolved at render (CS-2 / R-DAR) ─────────────────
  // The sheet's derived numbers stop being a build-time snapshot and become a live computation
  // from the character's persisted INPUTS + its currently-equipped armor. This kills the bug class
  // "buy armor → soak doesn't move" (armorSoak is the one genuinely-live input) and un-manufactures
  // future tack-ons (§8 resolve-at-render law).
  //
  // Persisted inputs (written by the producers, NOT the computed finals):
  //   characteristics {brawn, willpower, …}            (already persisted) — the LIVE values; soak and
  //     the Dedication cap read these
  //   characteristicsAtCreation {brawn, willpower, …}   — B-736: the same six as they stood when
  //     creation ended, and the ONLY characteristic source the two THRESHOLDS read (EotE p.94 ·
  //     AoR p.104 · FaD p.104 freeze them there). Additive; ABSENT means pre-ruling, so the thresholds
  //     fall back to the live values and such a record reads exactly what it reads today.
  //   derivedBonuses  {soakBonus, woundThresholdBonus, strainThresholdBonus,
  //                    meleeDefenseBonus, rangedDefenseBonus}   — talent-pick bonuses (chosen state)
  //   forceRatingBase                                   — the granted Force rating (base + F&D floor)
  //   woundBase / strainBase                            — species base thresholds, looked up ONCE at
  //     build (the runtime sheet has no species registry — only weapons/armor/gear canonical regs —
  //     so the id-ref lookup happens at build and the immutable result persists as an input).
  // Live inputs: resolvedEquipment.armor.soak AND .defense (from resolveSheetEquipment — buying/
  //   equipping armor flows straight through; armor Defense raises melee+ranged defense, R-ADEF1).
  //
  // Fallback law (R-DAR1): a record with no derivedBonuses (old save / pregen with a baked snapshot)
  // renders from its legacy `derived` block exactly as before — graceful history, never a throw.
  // B-23: charbuild (the runtime canonical charbuild registry) is an OPTIONAL 3rd arg. When
  // present, species/option talent bonuses (Enduring +1 soak) are derived at render and ADDED
  // to the persisted tree bonuses — so the number matches the book and existing sheets gain
  // their talent on next open. Absent (legacy/pre-load/FR-only callers) → persisted tree only,
  // unchanged behavior. Pure: charbuild is data.
  // C-BDS-2 — the de-duped developer signal for a weapon whose qualities cannot be read. Keyed by
  // name and never cleared: computeDerived runs on every render, so an un-throttled warn would bury
  // the console it is meant to inform. Returns whether it actually spoke, so a caller can count.
  var _unreadableQualityNames = {};
  function reportUnreadableQualities(w) {
    var name = (w && w.name) || '(unnamed weapon)';
    if (_unreadableQualityNames[name]) return false;
    _unreadableQualityNames[name] = true;
    var shown = (w && w.qualities && w.qualities.length) ? ' Its display qualities read: ' + w.qualities.join(', ') + '.' : '';
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[C-BDS-2] "' + name + '" reached the defence derivation with no structured ' +
                   'qualities (_qualitiesRaw absent), so any Defensive or Deflection rating it ' +
                   'carries contributed 0 to defence.' + shown +
                   ' This is a pre-id-ref save shape, not a dangling reference — the sheet still ' +
                   'renders, but the rating is unreadable from this data.');
    }
    return true;
  }

  // ── F-100 M5 C4 (ruling f100-m5-contracts §3 C4, shape (b)) — A TALENT'S VALUES ARE WORKED OUT WHEN THE SHEET IS
  // SHOWN, through the SHEET'S OWN STAMP VIEW. `derivedBonuses` / `derivedConditional` were a buy-time projection
  // (R-CS4d's "no registry at render"), and M-1 measured that the code had stopped honouring that premise: a talent's
  // dice, text, `when` values and floor already resolved at render, while its plain deltas stayed baked — so a house
  // rule on Grit's number never reached a character who owned Grit. Now every value comes from the sheet's owned
  // talent list (`sheet.talents`, {id, rank} — the R-PFR-1 record every writer keeps, the same list the floor and the
  // dice already read) against the view the HOST names for this sheet.
  //
  // THE HOST NAMES THE VIEW, because only the host knows what is on this device. Both hosts register ONE resolver at
  // boot (lib/shared/talentView.js sheetTalentView; `f100-m5-contracts` ADDENDUM 3, A3-2) that answers, for a sheet, its stamp view — or NULL when a pack the sheet is
  // stamped with is not here (C4.4, the ONE FALLBACK: render from the persisted projection, the last values this sheet
  // was written with, so a character opened on another device keeps its numbers at the table). With no resolver
  // registered (node, or a host before it registers) the persisted projection answers exactly as before — every pre-existing caller and
  // guard is unchanged unless it opts in. The persisted fields are still WRITTEN at buy (C4.7), for that fallback and
  // for old builds; they no longer decide what renders. Parity with book data: test/f100_m5_talent_render.cjs.
  // ── R6 lane D · THE GROUP RECORD'S ONE ENGINE READER (ruling `release-r6-party-c0` R-R6PC-2; `release-r6-bases-registry`
  // Q6 (c), Q7) ─────────────────────────────────────────────────────────────────────────────────────────────────────
  // Both hosts register ONE resolver at boot answering `{ parties, bases }` — the stored groups (partyStore.load()'s
  // parties) and the bases registry (public/data/canonical/bases.json). A character reads the group whose `members` holds
  // `char:<its id>`: membership is by SAVED id, so a new character in the creator (a draft id no group lists) reads no
  // group — ruling Q6 (c)'s told cost — and a re-entered member reads its own. With no resolver (node, or a host before
  // it registers) every grant is empty and every number is as before. Never written onto a sheet.
  var _groupResolver = null;
  function setGroupResolver(fn) { _groupResolver = (typeof fn === 'function') ? fn : null; }
  function _groupLib(name, file) {
    var m = (root && root[name]) || null;
    if (!m && typeof require === 'function') { try { m = require(file); } catch (e) { m = null; } }
    return m;
  }
  // → { party, bases } for this character, or null
  function groupOf(sheet) {
    var id = sheet && sheet.id;
    if (!_groupResolver || id == null || id === '') return null;
    var g = null;
    try { g = _groupResolver(sheet); } catch (e) { g = null; }
    var parties = (g && Array.isArray(g.parties)) ? g.parties : [];
    var who = 'char:' + String(id);
    // E6 plumbing (ruling `encounters-e6-plumbing` ADDENDUM 1, P1.1): one character may play in two campaigns, so two
    // parties may list it, and their ARRAY order differs device to device after a sync. The pick never reads that order:
    // 'party' when it lists the character, then the highest comparable `updatedAt`, then the lowest id.
    var best = null;
    for (var i = 0; i < parties.length; i++) {
      var p = parties[i];
      if (p && Array.isArray(p.members) && p.members.some(function (m) { return m && m.who === who; })) {
        if (!best || _groupBefore(p, best)) best = p;
      }
    }
    if (!best) return null;
    return { party: best, bases: (g.bases && typeof g.bases === 'object') ? g.bases : null,
             chars: typeof g.chars === 'function' ? g.chars() : (Array.isArray(g.chars) ? g.chars : []) };
  }
  function _groupBefore(a, b) {
    var ap = String(a.id) === 'party', bp = String(b.id) === 'party';
    if (ap !== bp) return ap;
    var at = typeof a.updatedAt === 'number' && isFinite(a.updatedAt) ? a.updatedAt : -Infinity;
    var bt = typeof b.updatedAt === 'number' && isFinite(b.updatedAt) ? b.updatedAt : -Infinity;
    if (at !== bt) return at > bt;
    return String(a.id) < String(b.id);
  }
  // → { group: <party id> | null, name, careerSkills: [{ skill, because }], mentor: <kind> | null, extraCredits }
  //   careerSkills' `because`, the union with the first grant kept:
  //     'group-base:<base id>'   the focus's party career skill (Far Horizons p.84)
  //     'group-train:<base id>'  a Training Facility's chosen skill (Desperate Allies p.89)
  //     'group-holocron'         the holocron's two career skills (FaD Core p.109)
  //     'group-item:<gear id>'   another member's owned group-scoped item (B-1039, ADDENDUM 314 C5)
  function groupGrants(sheet) {
    var out = { group: null, name: '', careerSkills: [], mentor: null, extraCredits: 0 };
    var g = groupOf(sheet);
    if (!g) return out;
    out.group = String(g.party.id); out.name = g.party.name ? String(g.party.name) : '';
    var seen = {};
    function push(skill, because) { if (skill && !seen[skill]) { seen[skill] = 1; out.careerSkills.push({ skill: skill, because: because }); } }
    var D = _groupLib('SWRPGBaseDerive', './baseDerive.js');
    if (D && g.bases) D.groupCareerSkills(g.party.bases, g.bases).forEach(function (x) { push(x.skill, x.because); });
    var P = _groupLib('SWRPGParty', './partyStore.js');
    if (P) {
      var fx = P.resourceEffects(g.party);
      (fx.careerSkills || []).forEach(function (s) { push(s, 'group-holocron'); });
      out.extraCredits = fx.extraCredits || 0;
      out.mentor = P.mentorKind ? P.mentorKind(g.party) : null;
    }
    // B-1039 (ADDENDUM 314 C5): another member's OWNED `scope: 'group'` item (the Sanctuary holocron, FaD Core p.439;
    // Warde's, Chronicles of the Gatekeeper) grants this member while the group possesses it. The members' sheets are
    // the saved roster's records the group resolver already holds (`chars`), never a new saved or wire field; this
    // sheet's own items are careerSkillStatus' 'item:' fold, so its own record is skipped.
    var self = 'char:' + String(sheet.id);
    var byId = {};
    (Array.isArray(g.chars) ? g.chars : []).forEach(function (c) { if (c && c.id != null) byId[String(c.id)] = c; });
    (g.party.members || []).forEach(function (m) {
      if (!m || typeof m.who !== 'string' || m.who === self || m.who.indexOf('char:') !== 0) return;
      var rec = byId[m.who.slice(5)], ms = rec && rec.sheetData;
      if (!ms) return;
      itemCareerSkillGrants(ms, null).forEach(function (x) { if (x.scope === 'group') push(x.skill, 'group-item:' + x.gearId); });
    });
    return out;
  }

  var _talentViewResolver = null;
  function setTalentViewResolver(fn) { _talentViewResolver = (typeof fn === 'function') ? fn : null; }
  // The view a talent's values resolve through for this sheet, or null (= the persisted projection answers).
  // F-100 M13 R-M13B-52: the career's and the first specialization's names, through the sheet's view, so a character's own copy reads as renamed. The saved strings are the fallback.
  function buildNamesOf(sheet, view) {
    var v = view || talentViewFor(sheet) || (root && root._canonicalCharbuild) || {}, careers = v.careers || {}, specs = v.specializations || {};
    var cid = sheetCareerId(sheet, careers), first = (Array.isArray(sheet && sheet.specializations) ? sheet.specializations : [])[0];
    return { career: (cid && careers[cid] && careers[cid].name) || (sheet && sheet.career) || '', specialization: (first && specs[first.id] && specs[first.id].name) || (sheet && sheet.specialization) || '' };
  }
  function talentViewFor(sheet) {
    if (!_talentViewResolver) return null;
    var v = null;
    try { v = _talentViewResolver(sheet); } catch (e) { v = null; }
    return (v && typeof v === 'object' && v.talents && typeof v.talents === 'object') ? v : null;
  }
  // The owned talent ids, one repeat per rank — derivedBonusesFromTalents' input shape (ownedRankCounts re-collapses it).
  function ownedTalentIdsOfSheet(sheet) {
    var ids = [];
    (Array.isArray(sheet && sheet.talents) ? sheet.talents : []).forEach(function (t) {
      if (!t || typeof t.id !== 'string' || !t.id) return;
      var n = Math.max(1, Math.floor(Number(t.rank) || 1));
      for (var i = 0; i < n; i++) ids.push(t.id);
    });
    return ids;
  }
  // stampTalentView(sheet, base, M, UD) → THE SHEET'S STAMP VIEW (C4.1) or null (C4.4's fallback): the sheet's own `mods`
  // folded over the pristine `base` by SWRPGMods (`M`), with `UD` the user store. NULL when a `user:` stamp the sheet
  // carries is not on this device (UD.missingFor; every `user:` stamp without a store), or a shipped variant it names has
  // not loaded (M.variantOf) — never the book standing in for a house rule. No stamps → the base itself. The hosts'
  // resolver (lib/shared/talentView.js sheetTalentView) is this plus a cache; test/f100_m5_talent_render.cjs calls this one.
  function stampTalentView(sheet, base, M, UD) {
    if (!sheet || !base) return null;
    var mods = Array.isArray(sheet.mods) ? sheet.mods.filter(function (m) { return typeof m === 'string' && m; }) : [];
    var fold = function (view) { return (M && typeof M.foldOwn === 'function') ? M.foldOwn(view, sheet) : view; };   // F-100 M13 (R-M13L-13): the layer, last
    if (!mods.length) return fold(base);
    if (!M || typeof M.applyStampSync !== 'function') return null;
    var isUser = function (m) { return m.indexOf('user:') === 0; };
    var missing = (UD && typeof UD.missingFor === 'function') ? UD.missingFor(mods) : mods.filter(isUser);
    if (missing.length) return null;
    if (!mods.every(function (m) { return isUser(m) || typeof M.variantOf !== 'function' || !!M.variantOf(m); })) return null;
    return fold(M.applyStampSync(mods, base));
  }
  // talentValuesAtRender(sheet, view) → the two projections as the sheet renders them through `view`. Pure.
  function talentValuesAtRender(sheet, view) {
    var ids = ownedTalentIdsOfSheet(sheet);
    return { derivedBonuses: derivedBonusesFromTalents(ids, view && view.talents),
             derivedConditional: conditionalTalentsFromOwned(ids, view && view.talents) };
  }

  // HOMEBREW H1 (ruling `f100-h1-word` R-FHW-3; card `homebrew-h1-build-card` R-H1B-8): `_preFloor` (internal; no
  // caller passes it but derivedFloorHeld below) returns the three floored quantities BEFORE the floor, plus the snapshot
  // that floors them (`_snap`). One computation, no second formula; only the return's floor moved to its last lines.
  // `_trace` (internal; derivedBecause's, R-SSC-1): when an object, every sum below is also recorded WHERE IT IS ADDED —
  // `_trace.base` the part no row names, `_trace.rows` [{ key, op, amount, source, condition }] in the order the
  // arithmetic adds them. The numbers are unchanged; nothing is recomputed for the trace but the persisted-projection
  // attribution (_traceTalentRows).
  // B-1518 (ruling release-r7-bug-burndown ADDENDA 47 and 52; D-378): an in-use cybernetic IMPLANT's own soak / wound / defence
  // lines (Implant Armor's soak +1, EotE p.174) — the ops droidOf reads for a droid, read here for a player, implants only — added
  // to computeDerived's `out` ON BOTH BRANCHES: above the legacy floor beside the item strain (they hold only while in use), and
  // over a baked `derived` snapshot (ADDENDUM 52: no snapshot ever printed one, since no earlier reader read them). Defence keeps
  // its cap of 4.
  function _addImplantDeltas(out, resolvedEquipment, _tr) {
    itemCharacterEffects(resolvedEquipment).forEach(function (x) {
      var e = x.effect, src = x.owner.source || x.owner.name, k = e.op === 'soak_delta' ? 'soak' : e.op === 'wound_threshold_delta' ? 'woundThreshold'
        : e.op === 'defense_delta' ? (e.key === 'melee' ? 'meleeDefense' : e.key === 'ranged' ? 'rangedDefense' : null) : null;
      if (!x.owner.implant || !k || !e.value) return;
      var to = k === 'meleeDefense' || k === 'rangedDefense' ? Math.min(4, out[k] + e.value) : out[k] + e.value;
      if (_tr) _tr(k, e.op, to - out[k], src, WHILE_IN_USE);
      out[k] = to;
    });
    return out;
  }
  function computeDerived(sheet, resolvedEquipment, charbuild, _preFloor, _trace) {
    sheet = sheet || {};
    var _tr = (_trace && typeof _trace === 'object') ? function (key, op, amount, source, condition) {
      amount = Number(amount) || 0;
      if (amount) _trace.rows.push({ key: key, op: op, amount: amount, source: source == null ? null : source, condition: condition || null });
    } : null;
    if (_tr) { _trace.rows = []; _trace.base = {}; _trace.parts = {}; }
    var db = sheet.derivedBonuses;
    // C4: a record with a talent projection renders it from its stamp view when the host names one. The legacy branch
    // below (no derivedBonuses at all: a baked `derived` snapshot, R-DAR1) is untouched.
    var tview = (db && typeof db === 'object' && _preFloor !== _FLOOR_PASS) ? talentViewFor(sheet) : null;   // B-1180: a floor pass names its view
    var condIds = Array.isArray(sheet.derivedConditional) ? sheet.derivedConditional : [];
    if (tview) {
      var atRender = talentValuesAtRender(sheet, tview);
      db = atRender.derivedBonuses;
      condIds = atRender.derivedConditional;
      charbuild = tview;
    }
    if (!db || typeof db !== 'object') {
      var d = sheet.derived || {};
      // a legacy record's base is its saved snapshot, ONE part that says so (ruling f100-surfacing-sheet-concept ADDENDUM 27 Q-B1 (a))
      if (_tr) ['soak', 'woundThreshold', 'strainThreshold', 'meleeDefense', 'rangedDefense', 'forceRating'].forEach(function (k) {
        _trace.parts[k] = _baseParts([_basePart(null, Number(d[k]) || 0, false, 'Saved sheet')]); _trace.base[k] = _partsSum(_trace.parts[k]); });
      return _addImplantDeltas({
        soak: d.soak || 0,
        woundThreshold: d.woundThreshold || 0,
        strainThreshold: d.strainThreshold || 0,
        meleeDefense: d.meleeDefense || 0,
        rangedDefense: d.rangedDefense || 0,
        forceRating: d.forceRating || 0,
      }, resolvedEquipment, _tr);   // B-1518 (ADDENDUM 52): the snapshot branch reads the implant's own lines too
    }
    // the trace's talent rows, before the species/career sums join `db` (the persisted projection attributed, or as saved)
    var _talentRows = _tr ? _traceTalentRows(sheet, db, charbuild, !!tview) : null;
    var _spRows = _tr ? [] : null, _spdRows = _tr ? [] : null, _carRows = _tr ? [] : null, _scRows = _tr ? [] : null;
    if (charbuild) {
      var sp = speciesTalentBonuses(sheet, charbuild, _spRows);
      db = {
        soakBonus: (db.soakBonus || 0) + sp.soakBonus,
        woundThresholdBonus: (db.woundThresholdBonus || 0) + sp.woundThresholdBonus,
        strainThresholdBonus: (db.strainThresholdBonus || 0) + sp.strainThresholdBonus,
        meleeDefenseBonus: (db.meleeDefenseBonus || 0) + sp.meleeDefenseBonus,
        rangedDefenseBonus: (db.rangedDefenseBonus || 0) + sp.rangedDefenseBonus,
        forceRatingBonus: (db.forceRatingBonus || 0) + sp.forceRatingBonus,
      };
      // F-100 M9 (R-M9S-1): a species ability's always-on defense (Kobok's Natural Armor)
      var spd = speciesDefenseBonuses(sheet, charbuild, _spdRows);
      db.meleeDefenseBonus += spd.meleeDefenseBonus;
      db.rangedDefenseBonus += spd.rangedDefenseBonus;
      // F-100 M12 (R-M12C-79/100): the career's own Attributes rows with no `when`. A career is
      // fixed at creation, an immutable input, so its rows sit with the species' below the legacy floor.
      var cab = careerEffectBonuses(sheet, charbuild, _carRows);
      Object.keys(cab).forEach(function (k) { db[k] += cab[k]; });
      // R-R4D-4: the Battle Scars' talents, summed as the species' are (scarTalentBonuses); never stored.
      var scb = scarTalentBonuses(sheet, charbuild, _scRows);
      Object.keys(scb).forEach(function (k) { db[k] = (db[k] || 0) + scb[k]; });
    }
    var chars = sheet.characteristics || {};
    var brawn = Number(chars.brawn) || 0;
    var willpower = Number(chars.willpower) || 0;
    // ── B-736 (ruling `threshold-freezing-shape` R-TF-0/R-TF-1) — THE THRESHOLD CHARACTERISTICS ARE
    // FROZEN AT CREATION, AND THESE TWO READS ARE WHERE THAT RULE LIVES. The same in all three core
    // books: once the starting value is set, later Brawn gains
    // leave the wound threshold alone — it grows only through talents
    // such as Toughened, and the parallel Willpower/Grit sentence (EotE p.94 · AoR p.104 · FaD p.104).
    // The frozen thing persisted is the CHARACTERISTIC, never the threshold — a threshold is derived and
    // must still move when Toughened or Grit is bought, which is why storing the output was rejected.
    // ABSENT = PRE-RULING, NEVER ZERO. A record written before this ruling falls back to the LIVE
    // characteristic, which reproduces exactly the number that record shows today — Jason's "freeze at
    // migration" (Addendum 1 (2)): no untouched character changes. That fallback is safe ONLY because
    // `buyTalent` STAMPS this block from the pre-patch characteristics before it applies Dedication's +1
    // (Addendum 1 (1)), so the field always exists before any further raise. A fallback with no stamp
    // behind it would recompute from live Brawn on every read and a SECOND Dedication buy would lift the
    // threshold again — the present defect wearing the new field's name. Per-key tolerance, not
    // per-block, so a partially-written block still cannot read as 0.
    // SCOPE, so the fix cannot spread (R-TF-3): `soak` below reads the LIVE `brawn` and MUST — soak has
    // no freezing sentence and tracks Brawn for life; both defences stay live on equipped armour; and
    // `forceRating` stays live and floored, because a Force rating legitimately RISES after creation and
    // must not be frozen by association.
    var charsAtCreation = (sheet.characteristicsAtCreation && typeof sheet.characteristicsAtCreation === 'object')
      ? sheet.characteristicsAtCreation : {};
    var brawnAtCreation = (charsAtCreation.brawn != null) ? (Number(charsAtCreation.brawn) || 0) : brawn;
    var willpowerAtCreation = (charsAtCreation.willpower != null) ? (Number(charsAtCreation.willpower) || 0) : willpower;
    var armorSoak = (resolvedEquipment && resolvedEquipment.armor && Number(resolvedEquipment.armor.soak)) || 0;
    // R-M8K-39 (P) (f100-m8-contracts ADDENDUM 6): the armour's PROVIDED defence, PER SIDE — `defense_<side> ?? defense`.
    // A display without the split (every armour but a Jury Rigged suit) reads exactly as before: one number, both sides
    // (R-ADEF1). Measured before Jury Rigged applied: 41 golden records, 10,448 values, 0 moved.
    var armorDefense = (resolvedEquipment && resolvedEquipment.armor && Number(resolvedEquipment.armor.defense)) || 0;
    var _arm = resolvedEquipment && resolvedEquipment.armor;
    var armorDefenseOf = function (side) { return _arm && _arm['defense_' + side] != null ? (Number(_arm['defense_' + side]) || 0) : armorDefense; };
    var armorDefenseMelee = armorDefenseOf('melee'), armorDefenseRanged = armorDefenseOf('ranged');
    var woundBase = (sheet.woundBase != null) ? (Number(sheet.woundBase) || 0) : 10;
    var strainBase = (sheet.strainBase != null) ? (Number(sheet.strainBase) || 0) : 10;
    // Equipment-CONDITIONAL talents (R-CS4d): apply owned conditional talents against the LIVE armor —
    // Armor Master (+1 soak while any armor is worn), Armor Master Improved (+1 melee+ranged defense
    // while armor soak ≥ 2), eote p.132. Persisted as owned-id flags, so no armor = no bonus by
    // construction; recomputed nowhere — the condition is evaluated here each render.
    // F-100: REGISTRY-FED when the charbuild is present (`when` = armored | armor_soak_2, R-F100-3).
    // CHARBUILD-LESS RENDER — the one place the frozen table answers without a registry, stated so it
    // is checkable: a sheet surface first-paints BEFORE the charbuild lands (B-241, useCanonicalReady)
    // and several consumers memoize this call on [sheet, equipment] only, so they never re-run when it
    // arrives. Throwing here would crash that first paint; skipping would drop Armor Master's number
    // for the life of the memo — a moved number (R-F100-5). The ids are PERSISTED inputs
    // (derivedConditional), so this reads the same two talents the registry carries; the 84-tuple
    // proof pins registry == frozen. Flagged for the architect in LAP.md; retires with the fallback.
    var armorEquipped = !!(resolvedEquipment && resolvedEquipment.armor);
    var condSoak = 0, condMeleeDef = 0, condRangedDef = 0, condWound = 0, condStrain = 0;
    var condTalents = charbuild ? charbuild.talents : null;
    // F-100 M12 R-M12B-104: wound/strain under a `when` (careers and talents alike); summed here, added ABOVE the legacy
    // floor below (as MV3's itemStrain).
    // the trace's `when` rows: soak/defence join their sums below; wound/strain are added above the floor, so they wait
    var _condRows = _tr ? [] : null, _condLate = _tr ? [] : null;
    var condRow = function (who, e) {
      if (e.when == null) return;
      var holds = (e.when === 'armored' && armorEquipped) || (e.when === 'armor_soak_2' && armorSoak >= 2);
      if (!holds) return;
      var late = false;
      if (e.op === 'soak_delta') condSoak += e.amount;
      else if (e.op === 'defense_delta') { if (e.target === 'melee') condMeleeDef += e.amount; else condRangedDef += e.amount; }
      else if (e.op === 'wound_threshold_delta') { condWound += Number(e.amount) || 0; late = true; }
      else if (e.op === 'strain_threshold_delta') { condStrain += Number(e.amount) || 0; late = true; }
      else _unimplementedEffect(who, e, 'op under a `when`');
      if (_tr) {
        var key = e.op === 'soak_delta' ? 'soak' : e.op === 'defense_delta' ? (e.target === 'melee' ? 'meleeDefense' : 'rangedDefense')
          : e.op === 'wound_threshold_delta' ? 'woundThreshold' : 'strainThreshold';
        (late ? _condLate : _condRows).push({ key: key, op: e.op, amount: Number(e.amount) || 0,
          source: who === 'career' ? _careerName(sheet, charbuild) : _talentName(who, condTalents), condition: WHEN_WORDS[e.when] || null });
      }
    };
    condIds.forEach(function (id) {
      var effs = charbuild ? talentEffectsOf(id, condTalents) : frozenEffectsOf(id);
      effs.forEach(function (e) { condRow(id, e); });
    });
    // F-100 M12 (R-M12C-100): a career row's Requirement is its `when`, evaluated against the same live armour.
    if (charbuild) careerEffectsOf(sheet, charbuild).forEach(function (e) { condRow('career', e); });
    // Defense — R-ADEF1 (armor raises BOTH melee and ranged defense) as amended by the OFFICIAL errata
    // (DEF-1). EotE Errata v2.0 p.2 + FAQ v2.0 p.1 (11/20/2017) REPLACE the printed Defense sidebar
    // (EotE p.216 / AoR p.220 / FaD p.213 — R-EQW2 corrects the old drifted p.221/p.216 cites). Two kinds:
    //   • PROVIDE (a static number — armor, cover, Guarded Stance): do NOT stack; take the BEST one.
    //   • INCREASE ("+1"/"increase" wording — Superior Reflexes, Sixth Sense, Armor Master Improved):
    //     STACK, with each other AND on top of the chosen provide value.
    // Total defense CAPS at 4. Armor is the only PROVIDE source the sheet computes today → providedBest<Side> =
    // the armour's side; when a second provide-source lands (cover, shield generator), max() among providers
    // FIRST, then add the increases. Our shipped additive math was already correct (every talent we encode
    // "increases") — the errata only adds the cap. Soak is unaffected: the same errata says soak DOES stack.
    // Legacy records render from their snapshot (the fallback branch above), untouched.
    var providedBestMelee = armorDefenseMelee, providedBestRanged = armorDefenseRanged;  // each becomes max(armor's side, …other providers…) once >1 exists
    // B-202 / R-BDQ-1 + R-DQC-1: both Defensive and Deflection are PASSIVE "increases" qualities
    // (EotE p.165). Defensive → meleeDefense, Deflection → rangedDefense, both for carried
    // (non-stowed) items. Stacking policy unsettled (R-BDQ-2 governs both per R-DQC-2);
    // summing for now, capped at 4 with everything else.
    var weaponDeflection = 0;
    var weaponDefensive = 0;
    var _qualRows = _tr ? [] : null;
    if (resolvedEquipment && resolvedEquipment.weapons) {
      // C-BDS-2 — THE SILENT ZERO, MADE LOUD. This loop reads ONLY `_qualitiesRaw` ({id, rank}
      // records straight off the registry). A weapon that never went through the canonical resolve
      // path does not carry it, so its Defensive/Deflection contributed 0 with no signal — the same
      // shape as B-200's dropped purchases, and the reason that rider was written.
      //
      // ABSENT and EMPTY are now different facts, and every producer keeps them so:
      //   `[]`        — resolved against the registry, which listed no qualities. Contributing 0 is
      //                 the CORRECT answer and says nothing.
      //   `undefined` — never resolved at all (a pre-id-ref save's display shape, whose `.qualities`
      //                 is strings like "Defensive 1", not records). 0 here is not an answer, it is
      //                 an absence of one.
      // Restoring the old `|| w.qualities` fallback would NOT have fixed this: that array holds
      // display strings, so `quals[i].id` is undefined on every element and the sum stays 0. It read
      // as protection while providing none.
      //
      // GRACEFUL ON THE OLD-DATA PATH, LOUD IN THE CONSOLE. The standing invariant is loud on code
      // paths, graceful on old-data paths, and this is an old-data path: the render must not throw
      // or change for a player whose save predates id-refs. So the number stays 0 and the surface is
      // untouched; what changes is that a developer can now SEE it. De-duped by weapon name because
      // computeDerived runs on every render and an un-throttled warn would be its own defect.
      resolvedEquipment.weapons.forEach(function(w) {
        if (w.state === 'stowed') return;
        if (w._qualitiesRaw === undefined) { reportUnreadableQualities(w); return; }
        var quals = w._qualitiesRaw || [];
        for (var i = 0; i < quals.length; i++) {
          if (quals[i].id === 'deflection') weaponDeflection += Number(quals[i].rank) || 0;
          if (quals[i].id === 'defensive') weaponDefensive += Number(quals[i].rank) || 0;
          if (_qualRows && (quals[i].id === 'deflection' || quals[i].id === 'defensive')) {
            _qualRows.push({ key: quals[i].id === 'defensive' ? 'meleeDefense' : 'rangedDefense', op: 'quality', amount: Number(quals[i].rank) || 0,
              source: (w.name || w.regId || 'weapon') + ' (' + (quals[i].id === 'defensive' ? 'Defensive' : 'Deflection') + ' ' + (Number(quals[i].rank) || 0) + ')' });
          }
        }
      });
    }
    // ── THE LEGACY-SHAPE FLOOR ────────────────────────────────────────────────────────────────
    // B-49 Q2(b) + B-57. Ruling `b49-pregen-force-rating-base` §4 (fence amended: "flooring is not a
    // branching change"), EXTENDED to the two thresholds by `creator-plumbing-census` D-R0-1.
    //
    // A record written before an input existed keeps that value ONLY in its baked `derived` snapshot.
    // This branch computes from inputs, so a missing input reads 0/default and the number FALLS the
    // instant `derivedBonuses` appears — which `buyTalent` writes on the first talent purchase while
    // touching none of the bases. Both measured symptoms:
    //   · forceRating   — 10 shipped pregens went 1 -> 0, REMOVING the FORCE stat (it renders only
    //                     when > 0). Q1 repaired the shipped data; legacy localStorage saves in the
    //                     same shape cannot be counted from this repo and are what this floor serves.
    //   · wound/strain  — 11 of 30 shipped pregens moved a threshold, worst Lowhhrick 18 -> 14 (B-57).
    //
    // C-B49-1 — THE SAFETY ARGUMENT, STATED RATHER THAN ASSUMED. The floor can only ever RAISE a
    // reading, and it is sound on two independent grounds:
    //   (1) It cannot touch a modern record. NOTHING writes `sheet.derived` any more (normalizeCreated
    //       stopped; no sheet path writes it), so the snapshot exists only on legacy records and the
    //       floor is a structural no-op for every character either creator has ever produced.
    //   (2) On a legacy record nothing can legitimately DECREASE these three. They resolve from
    //       immutable inputs — woundBase/strainBase (species, fixed at creation), forceRatingBase
    //       (granted, and a Force rating never falls in RAW) — plus bonuses from talents, which the
    //       sheet can only ever BUY. There is no sheet-side talent refund (REMOVE_TALENT exists only
    //       inside the creator). So the snapshot is always a legitimate LOWER bound, never a ceiling —
    //       and real growth still shows, because a bonus that lifts the computed value above the
    //       snapshot wins on max().
    //       B-736 CORRECTION, AND THIS IS WHERE THE RULE WAS LOST. This clause used to read "and
    //       characteristics only rise (Dedication, capped)" — offering a RISING CHARACTERISTIC as
    //       grounds for a rising threshold, which is the exact opposite of what all three core books
    //       say (EotE p.94 · AoR p.104 · FaD p.104: further increases to Brawn do NOT increase the
    //       wound threshold). The defect it argued for is fixed above; the clause is struck rather than
    //       repaired, because it must not re-teach the error to the next reader. The floor's safety no
    //       longer depends on it at all: the wound/strain characteristic terms are now FROZEN INPUTS,
    //       so they cannot move in either direction, which makes this argument strictly stronger than
    //       it was. Dedication's live +1 still reaches `soak` on the line below, where it belongs.
    //
    // WHY EXACTLY THESE THREE, AND WHY soak/defense MUST NOT JOIN THEM. Those two have a LIVE input:
    // equipped armour. Unequipping armour is SUPPOSED to lower soak and defense — that is the whole
    // point of CS-2/R-DAR — so flooring them would pin a stale high value and re-break the bug class
    // this resolver exists to kill. The measurement agrees independently: across the same flip, soak,
    // meleeDefense and rangedDefense drop on 0 of 30 pregens. Extend this list only against BOTH tests
    // — an immutable input, and a measurement.
    //
    // R-DAR1 STANDS: this changes no branching. Which branch runs is untouched; the floor lives inside
    // this one. It is C1's floor (ADVANCEMENT-local, one consumer) moved into the shared core, where
    // math serving nine call sites belongs.
    var snap = sheet.derived || {};
    // R-FEC-1 floor: resolved at render from the id-ref talent list (`sheet.talents`, the record
    // creation and advancement both write — R-PFR-1) plus the species grants, against the registry.
    // Nothing new is persisted. Without a charbuild the floor is not applied — the same posture as
    // the species bonuses above (B-240: every app caller passes it; flagged in LAP.md).
    var frFloor = 0;
    if (charbuild) {
      var floorIds = Object.keys(ownedTreeTalentIds(sheet));
      grantedTalentsAtRender(sheet, charbuild).forEach(function (g) { floorIds.push(g.id); });
      frFloor = forceRatingFloorFromTalents(floorIds, charbuild.talents);
    }
    var frBase = Number(sheet.forceRatingBase) || 0;
    var frAccess = !charbuild || frBase > 0 || frFloor > 0 || sheetForceAccess(sheet, charbuild);
    var out = {
      soak: brawn + armorSoak + (Number(db.soakBonus) || 0) + condSoak,
      // B-736: `brawnAtCreation`/`willpowerAtCreation` are the FROZEN reads (see the block above), not
      // the live `brawn`/`willpower` that `soak` on the line above deliberately keeps using.
      woundThreshold: woundBase + brawnAtCreation + (Number(db.woundThresholdBonus) || 0),
      strainThreshold: strainBase + willpowerAtCreation + (Number(db.strainThresholdBonus) || 0),
      meleeDefense: Math.min(4, providedBestMelee + (Number(db.meleeDefenseBonus) || 0) + condMeleeDef + weaponDefensive),
      rangedDefense: Math.min(4, providedBestRanged + (Number(db.rangedDefenseBonus) || 0) + condRangedDef + weaponDeflection),
      // R-FEC-1: forceRating = max(base, floor) + deltas — Witchcraft's floor acts on the BASE, so a
      // Force Rating rank stacks on top of it. Floor 0 (no floor talent, or no charbuild) is base + deltas.
      // B-701: the deltas count only WITH Force access (sheetForceAccess, FaD p.282); without it the bonus is HELD,
      // not lost — the talent stays owned and counts the moment access arrives. No charbuild: ungated, as the floor.
      forceRating: forceRatingOf(frBase, frFloor, db.forceRatingBonus, frAccess),
    };
    if (_tr) {
      // the trace, in the order the sums above add: base · talents · species talents · species defence · career · `when` · qualities
      var spName = _speciesName(sheet, charbuild);
      // the base's PARTS (D-257; ruling f100-surfacing-sheet-concept ADDENDUM 24 `_baseParts`, ADDENDUM 27 Q-B1/Q-B2) from the
      // locals each base sums above, and the base IS their sum — one arithmetic, the same numbers. A Force rating's base is a MAX:
      // ONE part, the floor's talent when the floor is above the career's base (found among the ids the floor walk read), else the
      // career's — a tie is the career's.
      var armName = (_arm && _arm.name) || 'Armour';
      var floorId = frFloor > frBase ? floorIds.filter(function (id) {
        return talentEffectsOf(id, charbuild.talents).some(function (e) { return e.op === 'force_rating_floor' && e.amount === frFloor; }); })[0] : null;
      // B-1395 (f100-surfacing-sheet-concept ADDENDUM 30 F2; R-SRF-5): a talent's step on the worn armour's defence (Jury
      // Rigged, the display's own `_talentEffects`) is a ROW, not inside the armour's part — the part reads the armour's own
      // defence, so the base is the suit's and the printed number is marked. Only where the armour IS the side's provider; one
      // row per talent (m8ItemChanges' fold), marked `item` so the spine's J6 line (defNotes) is not told twice. 0 numbers move.
      var _armRows = { melee: [], ranged: [] }, _armStep = { melee: 0, ranged: 0 };
      ((_arm && _arm._talentEffects) || []).forEach(function (f) {
        if (!f || f.op !== 'defense_delta' || !_armRows[f.target]) return;
        if ((f.target === 'melee' ? providedBestMelee : providedBestRanged) !== armorDefenseOf(f.target)) return;
        var amt = Number(f.amount) || 0, at = _armRows[f.target].filter(function (r) { return r.talent === f.talent; })[0];
        if (at) at.amount += amt; else _armRows[f.target].push({ talent: f.talent, amount: amt, source: f.source });
        _armStep[f.target] += amt;
      });
      _trace.parts = {
        soak: _baseParts([_basePart('Brawn', brawn), _basePart(armName, armorSoak, true)]),
        woundThreshold: _baseParts([_basePart(spName || 'Species', woundBase), _basePart('Brawn', brawnAtCreation)]),
        strainThreshold: _baseParts([_basePart(spName || 'Species', strainBase), _basePart('Willpower', willpowerAtCreation)]),
        meleeDefense: _baseParts([_basePart(armName, providedBestMelee - _armStep.melee)]),
        rangedDefense: _baseParts([_basePart(armName, providedBestRanged - _armStep.ranged)]),
        forceRating: _baseParts([floorId ? _basePart(_talentName(floorId, charbuild.talents), frFloor) : _basePart(_careerName(sheet, charbuild), frBase)]),
      };
      Object.keys(_trace.parts).forEach(function (k) { _trace.base[k] = _partsSum(_trace.parts[k]); });
      ['melee', 'ranged'].forEach(function (side) { _armRows[side].forEach(function (r) {
        if (r.amount) _trace.rows.push({ key: side + 'Defense', op: 'defense_delta', amount: r.amount, source: r.source, condition: null, item: 'armor' }); }); });
      _talentRows.forEach(function (r) { if (r.key !== 'forceRating' || frAccess) _tr(r.key, r.op, r.amount, r.source, null); });
      _spRows.forEach(function (r) { if (r.key !== 'forceRatingBonus' || frAccess) _tr(BONUS_KEY_DERIVED[r.key], r.op, r.amount, _talentLabel(r, charbuild && charbuild.talents) + (spName ? ' (' + spName + ')' : ''), null); });
      _spdRows.forEach(function (r) { _tr(BONUS_KEY_DERIVED[r.key], r.op, r.amount, (r.owner && r.owner.name) + (spName ? ' (' + spName + ')' : ''), null); });
      _carRows.forEach(function (r) { _tr(BONUS_KEY_DERIVED[r.key], r.op, r.amount, _careerName(sheet, charbuild), null); });
      _scRows.forEach(function (r) { if (r.key !== 'forceRatingBonus' || frAccess) _tr(BONUS_KEY_DERIVED[r.key], r.op, r.amount, _talentLabel(r, charbuild && charbuild.talents) + ' (Battle Scar)', null); });
      _condRows.forEach(function (r) { _tr(r.key, r.op, r.amount, r.source, r.condition); });
      _qualRows.forEach(function (r) { _tr(r.key, r.op, r.amount, r.source, null); });
    }
    if (_preFloor === _FLOOR_PASS) return out;
    snap = _floorSnapshot(sheet, resolvedEquipment, charbuild, snap);   // B-1180: the floor a house rule did not lower
    if (_preFloor) { out._snap = snap; return out; }
    var _pre = _tr ? { woundThreshold: out.woundThreshold, strainThreshold: out.strainThreshold, forceRating: out.forceRating } : null;
    out.woundThreshold = _flooredBy(out.woundThreshold, snap.woundThreshold);
    out.strainThreshold = _flooredBy(out.strainThreshold, snap.strainThreshold);
    out.forceRating = _flooredBy(out.forceRating, snap.forceRating);
    // Q2 (a): a floor-held number says so — {op: floor, source: null}, "<from> → <to> — kept from the saved sheet"
    if (_tr) Object.keys(_pre).forEach(function (k) { _tr(k, 'floor', out[k] - _pre[k], null, null); });
    // F-100 M12 MV3 (R-M12B-60): an in-use item's strain_threshold_delta (the biofeedback system's +4) rides ABOVE the legacy
    // floor — it holds only while the item is in use, so a snapshot never absorbs it.
    var itemStrain = itemThresholdDelta(resolvedEquipment, 'strain_threshold_delta');
    if (itemStrain) out.strainThreshold += itemStrain;
    if (_tr) itemThresholdRows(resolvedEquipment, 'strain_threshold_delta').forEach(function (x) { _tr('strainThreshold', 'strain_threshold_delta', x.value, x.source, WHILE_IN_USE); });
    _addImplantDeltas(out, resolvedEquipment, _tr);   // B-1518 (ADDENDUM 47): an in-use implant's own soak / wound / defence
    // R-M12B-104: a career's or talent's wound/strain row under a `when` holds only while armoured — above the floor too.
    if (condWound) out.woundThreshold += condWound;
    if (condStrain) out.strainThreshold += condStrain;
    if (_tr) _condLate.forEach(function (r) { _tr(r.key, r.op, r.amount, r.source, r.condition); });
    return out;
  }

  // ── derivedBecause (ruling f100-surfacing-sheet-concept R-SSC-1, rider R1; ADDENDUM 10 Q2 (a), Q3 (a); D-230 Q1 (a)) ──────
  // derivedBecause(sheet, resolvedEquipment, charbuild) → { soak, woundThreshold, strainThreshold, meleeDefense, rangedDefense,
  // forceRating, encumbranceThreshold }, each an ordered list of rows { op, from, to, source, condition }: CHAINED from the part
  // no row names (non-enumerable `_base`) to the printed number — each row adds its amount where computeDerived /
  // computeEncumbrance add it (their `_trace` / `containerSources`, ONE WALK). Defence chains under its cap of 4. A projection
  // for the surface's words (becauseNoteText), NEVER SAVED; the dark readers add rows only where they add numbers, so a key
  // OFF lists exactly what OFF sums. Beside `_base`, non-enumerable `_baseParts` (D-257; ADDENDUM 24/27): per key the base's
  // parts [{ text, amount, source }] as the trace recorded them ("Brawn 3" · "Heavy Battle Armor +2"), the base their sum.
  var WHEN_WORDS = { armored: 'while wearing armour', armor_soak_2: 'while your armour\'s soak is 2 or more' };   // F1; Q3 (a)
  var WHILE_IN_USE = 'while in use';                                                                             // F2 (MV3)
  var BONUS_KEY_DERIVED = { soakBonus: 'soak', woundThresholdBonus: 'woundThreshold', strainThresholdBonus: 'strainThreshold',
    meleeDefenseBonus: 'meleeDefense', rangedDefenseBonus: 'rangedDefense', forceRatingBonus: 'forceRating' };
  var DERIVED_OP = { soak: 'soak_delta', woundThreshold: 'wound_threshold_delta', strainThreshold: 'strain_threshold_delta',
    meleeDefense: 'defense_delta', rangedDefense: 'defense_delta', forceRating: 'force_rating_delta' };
  function _talentName(id, talents) {
    var reg = talents || (root && root._canonicalCharbuild && root._canonicalCharbuild.talents) || null;
    return (reg && Object.prototype.hasOwnProperty.call(reg, id) && reg[id] && reg[id].name) || id;
  }
  function _talentLabel(r, talents) { return _talentName(r.id, talents) + (r.times > 1 ? ', ' + r.times + ' ranks' : ''); }
  function _speciesName(sheet, charbuild) { var rec = _sheetSpecies(sheet, charbuild); return (rec && rec.name) || (sheet && sheet.species) || null; }
  function _careerName(sheet, charbuild) {
    var careers = (charbuild && charbuild.careers) || {}, cid = sheetCareerId(sheet, careers);
    return (cid && careers[cid] && careers[cid].name) || (sheet && sheet.career) || 'career';
  }
  // The tree talents' rows. With a stamp view (`atRender`) `db` IS the at-render sum, so its rows are the view's. Without one,
  // `db` is the PERSISTED projection: re-walked against the registry per key — where the walk's sum equals the saved
  // number its rows name the talents; where it does not (or no registry, or an op the walk refuses), ONE row
  // "talents (as saved)" carries the saved amount, so the chain still ends on the printed number.
  function _traceTalentRows(sheet, db, charbuild, atRender) {
    var talents = charbuild && charbuild.talents, rows = [], sums = null, out = [];
    if (talents) { try { sums = derivedBonusesFromTalents(ownedTalentIdsOfSheet(sheet), talents, rows); } catch (e) { sums = null; rows = []; } }
    Object.keys(BONUS_KEY_DERIVED).forEach(function (bk) {
      var key = BONUS_KEY_DERIVED[bk], saved = Number(db && db[bk]) || 0;
      if (sums && (atRender || (Number(sums[bk]) || 0) === saved)) {
        rows.forEach(function (r) { if (r.key === bk) out.push({ key: key, op: r.op, amount: r.amount, source: _talentLabel(r, talents) }); });
      } else if (saved) out.push({ key: key, op: DERIVED_OP[key], amount: saved, source: 'talents (as saved)' });
    });
    return out;
  }
  // a base's part { text, amount, source } — "Brawn 3", "Heavy Battle Armor +2" (`signed`: an amount added to another); a 0 part is
  // omitted by _baseParts; `text` names a sourceless part (a legacy snapshot) by its label alone
  function _basePart(source, amount, signed, label) {
    amount = Number(amount) || 0;
    return { text: (source == null ? label : source) + ' ' + (signed ? '+' : '') + amount, amount: amount, source: source == null ? null : source };
  }
  function _baseParts(parts) { return parts.filter(function (x) { return x && x.amount; }); }
  function _partsSum(parts) { return parts.reduce(function (a, x) { return a + x.amount; }, 0); }
  function _chainRows(base, rows, cap) {
    var run = base, out = [];
    rows.forEach(function (r) {
      var from = cap != null ? Math.min(cap, run) : run;
      run += r.amount;
      var row = { op: r.op, from: from, to: cap != null ? Math.min(cap, run) : run, source: r.source, condition: r.condition || null };
      if (r.item) row.item = r.item;   // B-1395: a talent's step on an item (the spine tells it in its own words)
      out.push(row);
    });
    return out;
  }
  function derivedBecause(sheet, resolvedEquipment, charbuild) {
    sheet = sheet || {};
    var tr = {};
    computeDerived(sheet, resolvedEquipment, charbuild, false, tr);
    var out = {}, base = {}, parts = {};
    ['soak', 'woundThreshold', 'strainThreshold', 'meleeDefense', 'rangedDefense', 'forceRating'].forEach(function (k) {
      base[k] = Number(tr.base[k]) || 0;
      parts[k] = (tr.parts && tr.parts[k]) || [];
      out[k] = _chainRows(base[k], tr.rows.filter(function (r) { return r.key === k; }), (k === 'meleeDefense' || k === 'rangedDefense') ? 4 : null);
    });
    // the carrying limit: 5 + Brawn, each container/attachment source in computeEncumbrance's order, the species last. The
    // species delta is read as the hosts' callers read it (no charbuild: the sheet's own stamp view, else the discovery
    // view — B-1194's rule), so the last row is the limit the sheet prints.
    var enc = computeEncumbrance(resolvedEquipment, sheet.characteristics || {}, speciesEncumbranceDelta(sheet));
    var spName = _speciesName(sheet, charbuild);
    // B-1441 (R-SBF-1/2): N installs of one option on one item are ONE row — the sum, the name marked "×N" (one install: no
    // mark) — the talents' per-rank sum idiom; contributions sharing a `host` fold into the first one's place
    var encHosts = {}, encFold = [];
    (enc.containerSources || []).forEach(function (c) {
      var at = c.host ? encHosts[c.host] : null;
      if (at) { at.amount += Number(c.bonus) || 0; at.n++; return; }
      var row = { name: c.name, amount: Number(c.bonus) || 0, n: 1, in_use: c.in_use };
      if (c.host) encHosts[c.host] = row;
      encFold.push(row);
    });
    var encRows = encFold.map(function (c) {
      return { op: 'encumbrance_threshold_delta', amount: c.amount, source: c.n > 1 ? c.name + ' ×' + c.n : c.name, condition: c.in_use ? WHILE_IN_USE : null };
    }).concat(speciesEncumbranceRows(sheet).map(function (x) {
      return { op: 'encumbrance_threshold_delta', amount: x.amount, source: (x.owner && x.owner.name) + (spName ? ' (' + spName + ')' : ''), condition: null };
    })).filter(function (r) { return r.amount; });
    parts.encumbranceThreshold = _baseParts([_basePart('Base', 5), _basePart('Brawn', enc.brawn)]);
    base.encumbranceThreshold = _partsSum(parts.encumbranceThreshold);   // 5 + Brawn
    out.encumbranceThreshold = _chainRows(base.encumbranceThreshold, encRows, null);
    Object.defineProperty(out, '_base', { value: base, enumerable: false });
    // `_baseParts` (ADDENDUM 24's CONTRACT): each base's parts, from the same walk — a projection for the why-sheets, NEVER SAVED
    Object.defineProperty(out, '_baseParts', { value: parts, enumerable: false });
    return out;
  }

  // derivedFloorHeld(sheet, resolvedEquipment, charbuild) → { woundThreshold, strainThreshold, forceRating }, each
  // { computed, held } where THE LEGACY-SHAPE FLOOR above binds (the snapshot is higher than the computed value), else
  // null. HOMEBREW H1's preview states a held number with it (R-H1B-3, R-FHW-3); it never re-derives one. B-1180 (ADDENDUM 55
  // (A)): the floor it reads is computeDerived's own, lowered by what a house rule takes away (`_floorSnapshot`), so a
  // number the rule no longer gives is not held and H1's line stops by itself; hand extras with no house rule still hold.
  function derivedFloorHeld(sheet, resolvedEquipment, charbuild) {
    var d = computeDerived(sheet, resolvedEquipment, charbuild, true), out = { woundThreshold: null, strainThreshold: null, forceRating: null };
    if (!d._snap) return out;
    Object.keys(out).forEach(function (k) {
      var held = _flooredBy(d[k], d._snap[k]);
      if (held !== d[k]) out[k] = { computed: d[k], held: held };
    });
    return out;
  }

  // ── B-1180 (ruling release-r7-bug-burndown ADDENDUM 55 (A), ADDENDUM 75): THE FLOOR'S PREMISE, RE-RULED FOR HOUSE RULES ──
  // computeDerived's floor argument (2) holds that a legacy record's three floored numbers can only rise, because the
  // sheet can only BUY talents. A house rule breaks that: a collection that swaps Grit for Toughened in a tree the
  // character owns takes Grit's +1 strain away, and the snapshot (written under the book) held the number up. So:
  //   floor = snapshot − max(0, computed over the BOOK − computed over the character's OWN view),
  // per quantity. Both sides are one pass of this same computeDerived (`_FLOOR_PASS`: the stamp view is not consulted —
  // each names its view) over the record's owned tree positions projected through that view, by the producers a buy
  // writes with (resolveSheetSpecs → talentsFromOwnedPositions → derivedBonusesFromTalents / conditionalTalentsFromOwned).
  // Projected like for like, so a record with no house rule reads 0 difference however its persisted list stands (hand
  // extras keep their floor), and a house rule that GIVES more never raises the floor (max 0). Nothing is persisted.
  // The book is `_canonicalCharbuildBase` (the pristine shipped sections both hosts write; B-1180 is inert without it, and
  // on every modern record, which carries no snapshot).
  var _FLOOR_PASS = {};
  var FLOORED = ['woundThreshold', 'strainThreshold', 'forceRating'];
  function _bookView() {
    var g = root || (typeof globalThis !== 'undefined' ? globalThis : null);
    return (g && g._canonicalCharbuildBase) || null;
  }
  function _projectedThrough(sheet, view) {
    var talents = talentsFromOwnedPositions(resolveSheetSpecs(sheet, view), view.specializations || {}, sheet.looseTalents), ids = ownedTalentIdsOfSheet({ talents: talents });
    return Object.assign({}, sheet, { talents: talents, derivedBonuses: derivedBonusesFromTalents(ids, view.talents),
      derivedConditional: conditionalTalentsFromOwned(ids, view.talents) });
  }
  function _floorSnapshot(sheet, resolvedEquipment, ownView, snap) {
    var book = _bookView();
    if (!book || !ownView || book === ownView || !book.specializations || !ownView.specializations) return snap;
    if (!FLOORED.some(function (k) { return isFinite(Number(snap[k])) && snap[k] !== null && snap[k] !== ''; })) return snap;
    var own = computeDerived(_projectedThrough(sheet, ownView), resolvedEquipment, ownView, _FLOOR_PASS);
    var bk = computeDerived(_projectedThrough(sheet, book), resolvedEquipment, book, _FLOOR_PASS);
    var out = Object.assign({}, snap);
    FLOORED.forEach(function (k) {
      var s = Number(snap[k]), lower = Math.max(0, (bk[k] || 0) - (own[k] || 0));
      if (isFinite(s) && snap[k] !== null && snap[k] !== '' && lower) out[k] = s - lower;
    });
    return out;
  }

  // The floor itself. A non-numeric or absent snapshot (every modern record) returns the computed
  // value untouched — absence is not a floor of 0.
  function _flooredBy(computed, snapshot) {
    var s = Number(snapshot);
    return (isFinite(s) && s > computed) ? s : computed;
  }

  // ── B-736 · THE STAMP (ruling `threshold-freezing-shape` Addendum 1 (1)) ──────────────────────
  // The write half of the freeze `computeDerived` above reads. Given a sheet that is ABOUT to have a
  // characteristic raised, return the `characteristicsAtCreation` block to file in the SAME patch, or
  // `null` when there is nothing to do.
  //
  // WHY IT LIVES HERE AND NOT INLINE IN `buyTalent`. The read and the write of one save field are one
  // rule, and a rule with two homes drifts — this is R-B658's lesson applied to a field a day old. It
  // is also the only way the freeze can be GUARDED: `buyTalent` lives in player/app.jsx, which node
  // cannot load, so a stamp written inline could only ever be tested by a copy of itself inside the
  // guard — and a guard that holds its own copy of the thing it checks is exactly the failure mode
  // R-TF-4 was written about ("a formula guard that cannot fail is the thing that failed here").
  // `test/char_resolve_derived.cjs` calls THIS function, so removing the stamp reddens the leg.
  //
  // RETURNS null IN TWO CASES, and they mean different things:
  //   · the record already carries the block — its creation values are recorded, and re-stamping is the
  //     one thing that could let the frozen number drift UPWARD, so it never happens;
  //   · the record has no characteristics to copy — nothing to freeze, and inventing a zero would be
  //     the absent-means-zero error R-TF-2 forbids.
  // Pure: reads the sheet, writes nothing, copies the map so caller and record never alias.
  function creationCharacteristicsStamp(sheet) {
    if (!sheet || typeof sheet !== 'object') return null;
    if (sheet.characteristicsAtCreation) return null;
    var live = sheet.characteristics;
    if (!live || typeof live !== 'object') return null;
    return Object.assign({}, live);
  }

  // ── Specialization choice-skills (B-40; R-SY4 paper: ruling `f-eds-6-spec-choice-save-shape` §3)
  //
  // Some specializations grant a career skill the PLAYER picks — Republic Representative's printed
  // grant is "Charm, Cool, Knowledge (choose any one), and Negotiation", so `career_skills` can only
  // ever hold three of its four. The registry carries the open slot as `career_skill_choice_grants`;
  // the player's answer is the one irreproducible bit, so it is ALL that is persisted:
  //
  //     sheet.specSkillChoices = { <specId>: { <poolId>: [<skillId>, ...] } }
  //
  // Keyed by POOL id, never by grant position — the same reorder-proofing `_groupId` gives
  // speciesOptionPicks. L1cb.6 asserts pool values are unique within a record, which is what makes
  // that key unambiguous.
  //
  // OLD-DATA LANE (loud/graceful law): a pick whose grant no longer exists is SKIPPED, not thrown —
  // the picker simply re-offers. Only a bad REGISTRY pool throws, and that is B-36's branch, not
  // this function. Absent picks = no choice made = the spec's fixed career_skills alone, which is
  // exactly the pre-B-40 behaviour, so existing saves need no migration.
  function specChoiceSkillsFor(specRec, picks) {
    var grants = (specRec && specRec.career_skill_choice_grants) || [];
    if (!grants.length || !picks) return [];
    var byPool = picks[specRec.id] || {};
    var out = [];
    grants.forEach(function(g) {
      var poolId = Array.isArray(g.pool) ? g.pool.join('+') : g.pool;
      var chosen = byPool[poolId];
      if (!chosen) return;                       // no pick yet, or the pool changed — offer again
      (Array.isArray(chosen) ? chosen : [chosen])
        .slice(0, Number(g.count) || 1)          // never honour more picks than the grant allows
        .forEach(function(id) { if (id && out.indexOf(id) === -1) out.push(id); });
    });
    return out;
  }

  // ── Species choice-skills (ruling `f100-cerean-intellectuals-card` R-CI-1..3, ADDENDUM 2) ────────────────────
  //
  // The species twin of the reader above. The Cerean's Intellectuals (The Complete Species Guide p.55): "Receive 2 free
  // career skills of choice. These skills must be Knowledge skills. Still may not receive a free rank in them without
  // spending XP." — career STATUS, never a rank (`speciesSkillGrants` never reads this). The registry carries the grant
  // as the ONE `career_skill_choice_grants` definition; the player's pick is all that is persisted:
  //
  //     sheet.speciesSkillChoices = { <speciesId>: { <poolId>: [<skillId>, ...] } }
  //
  // poolId exactly as the spec twin computes it (`g.pool`, an array pool joined by '+'), so a registry reorder can never
  // re-attach a pick (ADDENDUM 2 Q1; L1cb.6 pins pools unique per species record, root and options). Two differences from
  // the twin, both ruled: each stored id must be one the grant's POOL offers (`speciesChoicePool`; R-CI-3 — a
  // non-Knowledge pick is refused), and that filter runs BEFORE `count`, so a stale id never takes a valid pick's slot
  // (D2). A charbuild with no skill vocabulary honours nothing rather than throwing (D3); with a vocabulary, an unknown
  // group pool still throws (B-36's branch). Absent picks = no choice made = nothing granted (fail closed).
  function speciesChoiceSkillsFor(speciesRec, picks, charbuild) {
    var grants = (speciesRec && speciesRec.career_skill_choice_grants) || [];
    if (!grants.length || !picks || typeof picks !== 'object') return [];
    var cb = charbuild || {};
    if (!cb.skillNames || !Object.keys(cb.skillNames).length) return [];
    if (!cb.skillGroups || !Object.keys(cb.skillGroups).length) return [];
    var byPool = picks[speciesRec.id];
    if (!byPool || typeof byPool !== 'object') return [];
    var out = [];
    grants.forEach(function(g) {
      var poolId = Array.isArray(g.pool) ? g.pool.join('+') : g.pool;
      var chosen = byPool[poolId];
      if (!chosen) return;                       // no pick yet, or the pool changed — the creator asks again
      var offered = speciesChoicePool(g, cb, null);
      (Array.isArray(chosen) ? chosen : [chosen])
        .filter(function(id) { return id && offered.indexOf(id) !== -1; })
        .slice(0, Number(g.count) || 1)          // never honour more picks than the grant allows
        .forEach(function(id) { if (out.indexOf(id) === -1) out.push(id); });
    });
    return out;
  }

  // ── The species' career PICK as a group (ruling `f100-cerean-intellectuals-card` ADDENDUM 6, brief ADDENDUM 1 B1) ────────
  //
  // speciesCareerPickGroups(rec, charbuild) -> one group per `career_skill_choice_grants` grant, in the species option
  // groups' own shape so the creator draws it with the same renderer (D-CI4: never appended to `rec.option_choices`):
  //   { name, min_picks: count, max_picks: count, options: [{id, name}], career_pick: { pool, poolId, noun } }
  // NAME — the ability the re-stamp marks `carried: ['career_skill_choice_grants']` (the data's own marking, R-CI-5), so
  // "Intellectuals" is read, never typed; with no stamped ability, "Career skills". NOUN — the pool in the hold's words
  // ("Knowledge skills"): the group token capitalised and pluralised (`fcSkillChoicePhrase`'s rule), a list pool its names.
  // OPTIONS — `speciesChoicePool`, the same pool `speciesChoiceSkillsFor` honours; no skill vocabulary → none (D3).
  // The creator, the sheet's ask and the computed career line read this one builder (one core).
  function speciesCareerPickNoun(grant, names) {
    var pool = grant && grant.pool;
    if (Array.isArray(pool)) {
      var list = pool.map(function (id) { return (names && names[id]) || id; });
      return list.length > 1 ? list.slice(0, -1).join(', ') + ' or ' + list[list.length - 1] : (list[0] || 'skills');
    }
    if (pool == null || pool === 'any') return 'skills';
    if (pool === 'non_career') return 'non-career skills';
    var key = String(pool);
    return key.charAt(0).toUpperCase() + key.slice(1) + ' skills';
  }
  function speciesCareerPickGroups(rec, charbuild) {
    var grants = (rec && rec.career_skill_choice_grants) || [];
    if (!grants.length) return [];
    var cb = charbuild || {};
    var names = cb.skillNames || {};
    var vocab = Object.keys(names).length > 0 && cb.skillGroups && Object.keys(cb.skillGroups).length > 0;
    var stamped = (rec.special_abilities || []).filter(function (a) {
      return a && Array.isArray(a.carried) && a.carried.indexOf('career_skill_choice_grants') !== -1;
    });
    return grants.map(function (g, i) {
      var count = Number(g.count) || 1;
      var poolId = Array.isArray(g.pool) ? g.pool.join('+') : g.pool;
      var ids = vocab ? speciesChoicePool(g, cb, null) : [];
      return {
        name: (stamped[i] && stamped[i].name) || 'Career skills',
        min_picks: count, max_picks: count,
        options: ids.map(function (id) { return { id: id, name: names[id] || id }; }),
        career_pick: { pool: g.pool, poolId: poolId, noun: speciesCareerPickNoun(g, names) },
      };
    });
  }
  // The picks a saved record HONOURS for one career-pick group: the stored ids its pool offers, at most `count` — the
  // `speciesChoiceSkillsFor` rule, per group (the ask's predicate reads it, so the line goes once two are saved).
  function speciesCareerPicksHonoured(rec, group, skillChoices) {
    var byPool = (skillChoices && rec && skillChoices[rec.id]) || {};
    var chosen = byPool[group.career_pick.poolId];
    var offered = group.options.map(function (o) { return o.id; });
    var out = [];
    (Array.isArray(chosen) ? chosen : (chosen ? [chosen] : [])).forEach(function (id) {
      if (id && offered.indexOf(id) !== -1 && out.indexOf(id) === -1 && out.length < group.max_picks) out.push(id);
    });
    return out;
  }

  // ── B-181 / R-TCP-1: THE TALENT CHOICE, ADDRESSED POSITIONALLY ────────────────────────────────
  //
  // `sheet.talentSkillChoices = { <specId>: { "<row>-<col>": [<skillId>, …] } }` — the SAME address
  // `specializations[].owned` uses, because a talent (unlike a specialization) can be owned MORE THAN
  // ONCE. Keying by talent id would merge distinct purchases, record no provenance, and make a rank
  // refund undecidable — the name-key defect :314 bans in writing. Consequences that fall out of the
  // address rather than being coded: R-TCT-2's per-rank scaling is the SUM over owned entries (never
  // stored), and R-TCT-3's bind-at-purchase is structural (a pick is filed against the cell that
  // created it, so removing the cell removes the pick).
  //
  // LOUD ON THE BUG PATH, GRACEFUL ON HISTORY (R-TCP-3, charter §8). The spec twin above SILENTLY
  // truncates over-picks (`.slice(0, count)`); this one THROWS, and the difference is ruled, not
  // accidental: there, an over-long list is old data; here, one entry is one purchase, so more picks
  // than the grant allows can only come from a writer bug — and silently dropping a career skill is
  // the exact class of arithmetic corruption B-181 exists to fix. Absent/unknown keys stay graceful:
  // no entry ⇒ no choices ⇒ today's behaviour byte-identically (R-TCP-3 absent-tolerance).
  function talentChoiceGrantsOf(talentRec) {
    return (talentRec && talentRec.career_skill_choice_grants) || [];
  }
  // ── F-100 M8 C6 · THE ONE READER OF A TALENT'S PICK (ruling `f100-m8-contracts` R-M8K-6 (b), (c)) ─────────────────
  // pickOf(sheet, specId, pos, pickId) → the recorded value, or undefined when nothing is recorded (FAIL CLOSED: the
  // caller gives nothing). It reads M8's ONE container first, then the two legacy maps — non-destructively; no save is
  // rewritten:
  //   per rank   — talentChoices[<specId>]["<row>-<col>"][<pickId>]   (pos is the owned cell)
  //   per talent — talentChoices._talent[<talentId>][<pickId>]        (specId '_talent', pos the talent id; the validator
  //                                                                    refuses a specId beginning '_', R-M8K-23)
  //   treeless   — specId null, pos the treelessTalents ENTRY: its `choices[<pickId>]` (R-TCP-2 (a1)'s companion)
  // THE LEGACY MAPS KEEP ONLY THEIR MEANINGS (R-M8K-6 (c)): a fallback happens for exactly two pick ids — the career
  // grant ('career_skills' → talentSkillChoices / a treeless entry's skillChoices: Well Rounded, Well Read) and M7's swap
  // ('characteristic' → talentCharacteristicChoices / characteristicChoice). Any other pick id (Deadly Accuracy's skill,
  // say) is read from talentChoices ONLY, so an M8 pick is never read as a career grant, and a career grant never as one.
  var LEGACY_PICK = {
    career_skills: { map: 'talentSkillChoices', treeless: 'skillChoices' },
    characteristic: { map: 'talentCharacteristicChoices', treeless: 'characteristicChoice' },
  };
  var _has = function (o, k) { return !!o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k); };
  // f100-m13-reach-paper §8: a loose rank is a treeless instance, `picks[i]` holding a treeless entry's own fields (R-M13R-16); its address { '_loose', '<id>#<i>' } (R-M13R-17).
  function _looseRanks(sheet) {
    var out = [], l = (sheet && sheet.looseTalents) || {};
    Object.keys(l).forEach(function (id) { var n = Math.max(0, Math.floor(Number(l[id] && l[id].ranks) || 0)); for (var i = 0; i < n; i++) out.push(Object.assign({}, l[id].picks && l[id].picks[i], { id: id, _pos: id + '#' + i })); });
    return out;
  }
  function pickOf(sheet, specId, pos, pickId, item) {
    if (!sheet || !pickId) return undefined;
    if (specId === '_loose') return item ? undefined : pickOf(sheet, null, _looseRanks(sheet).filter(function (e) { return e._pos === pos; })[0], pickId);
    // kind `item` (R-M8G-13, as amended by R-M8G-21): the pick is a MARK on the owned entry, read by scanning the three
    // lists — never talentChoices. `item` = { talent: <talent id> }. A treeless rank takes no item pick.
    if (item) return (specId == null || specId === '_talent') ? undefined : markedEntryOf(sheet, item.talent, specId, pos);
    var legacy = _has(LEGACY_PICK, pickId) ? LEGACY_PICK[pickId] : null;
    if (specId == null) {                                    // a treeless entry
      var e = pos;
      if (!e || typeof e !== 'object') return undefined;
      if (_has(e.choices, pickId)) return e.choices[pickId];
      return legacy && e[legacy.treeless] != null ? e[legacy.treeless] : undefined;
    }
    var tc = sheet.talentChoices, at = _has(tc, specId) && _has(tc[specId], pos) ? tc[specId][pos] : null;
    if (_has(at, pickId)) return at[pickId];
    if (!legacy || specId === '_talent') return undefined;
    var m = sheet[legacy.map];
    return _has(m, specId) && m[specId] && m[specId][pos] != null ? m[specId][pos] : undefined;
  }
  // ── F-100 M8 C6 · A TALENT'S PICKS, PER OWNED INSTANCE (ruling `f100-m8-contracts` R-M8K-6 (a)–(c)) ──────────────
  // picksOf(sheet, charbuild, talentId) → [{ pick, instances: [{ specId, pos, value }], values, unpicked }] — one entry
  // per pick the talent's rows DECLARE (`pick` on any row; one declaration per pick id), read through pickOf only:
  //   per rank   — one instance per OWNED CELL of the talent (then each treeless entry), so a pick dies with its cell;
  //   per talent — ONE instance at talentChoices._talent[<talentId>], read only while the talent is owned at all, so it
  //                dies with the talent's last owned rank (R-M8K-6 (b)). Nothing is ever deleted from the save.
  //   FAIL CLOSED — an instance with no recorded value is counted in `unpicked` and adds nothing to `values`.
  //   distinct   — a value an EARLIER instance (walk order: the sheet's trees, then treeless) already holds reads as
  //                unpicked again: two ranks of a distinct pick on one value give one (Deadly Accuracy, Tinkerer).
  // `values` are the live picks in walk order. Kinds are not interpreted here; a row's arm reads its own kind. A treeless
  // instance's address is { specId: null, pos: <its index in treelessTalents> } (two entries may share a talent id).
  function _pickDecls(rec) {
    var out = [], seen = {};
    ['effects', 'pool_mods', 'told', 'item_effects', 'vehicle_effects', 'roll_numbers'].forEach(function (k) {
      (Array.isArray(rec && rec[k]) ? rec[k] : []).forEach(function (row) {
        var p = row && row.pick;
        if (p && p.id && !seen[p.id]) { seen[p.id] = true; out.push(p); }
      });
    });
    return out;
  }
  function picksOf(sheet, charbuild, talentId) {
    var view = talentViewFor(sheet), cb = charbuild || {};
    var talents = (view && view.talents) || cb.talents || {};
    var cbv = view ? Object.assign({}, cb, { specializations: view.specializations || cb.specializations, talents: talents }) : cb;
    var rec = _has(talents, talentId) ? talents[talentId] : null;
    if (!sheet || !rec) return [];
    var cells = [];
    _eachOwnedCell(sheet.specializations, cbv.specializations, function (specId, pos, tid) { if (tid === talentId) cells.push({ specId: specId, pos: pos }); });
    (Array.isArray(sheet.treelessTalents) ? sheet.treelessTalents : []).forEach(function (t, i) { if (t && t.id === talentId) cells.push({ specId: null, pos: t, index: i }); });
    _looseRanks(sheet).forEach(function (t) { if (t.id === talentId) cells.push({ specId: '_loose', pos: t._pos }); });
    var owned = _ownedTalentIdSet(sheet, cbv).indexOf(talentId) !== -1;
    return _pickDecls(rec).map(function (p) {
      var at = p.per === 'talent' ? (owned ? [{ specId: '_talent', pos: talentId }] : []) : cells;
      var values = [], unpicked = 0;
      var instances = at.map(function (c) {
        var v = pickOf(sheet, c.specId, c.pos, p.id, p.kind === 'item' ? { talent: talentId } : undefined);
        var key = v == null ? null : JSON.stringify(v);
        if (v == null || (p.distinct && values.some(function (x) { return JSON.stringify(x) === key; }))) { unpicked++; v = undefined; }
        else values.push(v);
        return c.specId == null ? { specId: null, pos: c.index, value: v } : { specId: c.specId, pos: c.pos, value: v };
      });
      return { pick: p, instances: instances, values: values, unpicked: unpicked };
    });
  }
  // THE ONE WRITER of an M8 pick (R-M8K-6 (c), sharpened): every M8 pick is written to `talentChoices` ONLY — never to
  // talentSkillChoices / talentCharacteristicChoices, which keep their legacy meanings. → { talentChoices } (a patch for
  // onSheetChange; the sheet is not mutated), or { refused: <why> }:
  //   the pick id must be DECLARED by the talent (and never a legacy id, R-M8G-3);
  //   per talent → talentChoices._talent[<talentId>]; per rank → talentChoices[<specId>]["<row>-<col>"] of an OWNED cell;
  //   a TREELESS rank (specId null, pos its index) → that entry's own `choices[<pickId>]`, the place pickOf reads it, so
  //   the patch is { treelessTalents } instead;
  //   distinct → refused when another live instance already holds the value;
  //   kind option → refused when the value is not one of the pick's `options` (f100-m8-contracts A3.2 (1)).
  function pickWrite(sheet, charbuild, talentId, specId, pos, pickId, value) {
    var view = talentViewFor(sheet), cb = charbuild || {};
    var talents = (view && view.talents) || cb.talents || {};
    var rec = _has(talents, talentId) ? talents[talentId] : null;
    var decl = rec ? _pickDecls(rec).filter(function (p) { return p.id === pickId; })[0] : null;
    if (!decl) return { refused: 'the talent declares no pick `' + pickId + '`' };
    if (_has(LEGACY_PICK, pickId)) return { refused: '`' + pickId + '` is a legacy pick id; its writer is the legacy map (R-M8G-3)' };
    var entry = picksOf(sheet, charbuild, talentId).filter(function (e) { return e.pick.id === pickId; })[0];
    var addr = decl.per === 'talent' ? { specId: '_talent', pos: talentId } : { specId: specId, pos: pos };
    var mine = entry && entry.instances.filter(function (i) { return i.specId === addr.specId && i.pos === addr.pos; })[0];
    if (!mine) return { refused: decl.per === 'talent' ? 'the talent is not owned' : 'no owned cell of the talent at ' + specId + ' ' + pos };
    if (decl.kind === 'item') return addr.specId === '_loose' ? { refused: 'a loose rank takes no item pick (R-M13R-39)' } : _itemMarkWrite(sheet, cb, decl, talentId, addr, value);
    if (decl.kind === 'option' && value != null && !(Array.isArray(decl.options) ? decl.options : []).some(function (o) { return o && o.id === value; })) {
      return { refused: '`' + value + '` is not one of the pick\'s options' };
    }
    if (value != null && decl.distinct && entry.instances.some(function (i) { return i !== mine && i.value != null && JSON.stringify(i.value) === JSON.stringify(value); })) {
      return { refused: 'another rank already picked that (distinct)' };
    }
    if (addr.specId === '_loose') {
      var ll = JSON.parse(JSON.stringify(sheet.looseTalents)), hash = addr.pos.lastIndexOf('#'), en = ll[addr.pos.slice(0, hash)], ps = (en.picks = en.picks || []), at0 = Number(addr.pos.slice(hash + 1)), rk = (ps[at0] = ps[at0] || {}), cc = (rk.choices = rk.choices || {});
      if (value == null) delete cc[pickId]; else cc[pickId] = JSON.parse(JSON.stringify(value));
      return { looseTalents: ll };
    }
    if (addr.specId == null) {
      var tl = JSON.parse(JSON.stringify(sheet.treelessTalents));
      var ent = tl[addr.pos], ch = (ent.choices = ent.choices || {});
      if (value == null) delete ch[pickId]; else ch[pickId] = JSON.parse(JSON.stringify(value));
      return { treelessTalents: tl };
    }
    var tc = sheet.talentChoices ? JSON.parse(JSON.stringify(sheet.talentChoices)) : {};
    var at = (tc[addr.specId] = tc[addr.specId] || {});
    var cell = (at[addr.pos] = at[addr.pos] || {});
    if (value == null) delete cell[pickId]; else cell[pickId] = JSON.parse(JSON.stringify(value));
    return { talentChoices: tc };
  }

  // ── F-100 M8 C7 · THE ITEM MARK (ruling `f100-m8-build` R-M8G-12..15, as amended by R-M8G-21) ────────────────────
  // An equipment entry (a weapons[] or gear[] element, or the worn armor object) may carry
  // `talentMarks: [{ talent, spec, cell }]` — the owned rank whose kind-`item` pick chose THIS entry, addressed by the
  // same two-level pair talentChoices[<spec>][<cell>] uses. The mark moves with the entry object (wear, reorder, state,
  // stowage) and dies with it (sell, remove). Absent or empty = unpicked (FAIL CLOSED). A mark whose cell is no longer
  // owned is IGNORED (picksOf only walks owned cells) and never deleted. Old saves read unchanged; nothing is minted.
  // THE ONE MARK MATCHER (R-M8G-21: keep it one function).
  function _markMatches(mark, talentId, specId, cell) {
    return !!mark && typeof mark === 'object' && mark.talent === talentId && mark.spec === specId && mark.cell === cell;
  }
  // every entry of the three lists, as fn(entry, section, index); the worn armor is index 0 of section 'armor'
  function _eachEquipmentEntry(equipment, fn) {
    var eq = equipment || {};
    ['weapons', 'gear'].forEach(function (sec) {
      (Array.isArray(eq[sec]) ? eq[sec] : []).forEach(function (e, i) { if (e && typeof e === 'object') fn(e, sec, i); });
    });
    if (eq.armor && typeof eq.armor === 'object') fn(eq.armor, 'armor', 0);
  }
  // → { section, index } of the FIRST entry carrying the owned rank's mark, or undefined
  function markedEntryOf(sheet, talentId, specId, cell) {
    var found;
    _eachEquipmentEntry(sheet && sheet.equipment, function (e, sec, i) {
      if (found || !Array.isArray(e.talentMarks)) return;
      if (e.talentMarks.some(function (m) { return _markMatches(m, talentId, specId, cell); })) found = { section: sec, index: i };
    });
    return found;
  }
  var ITEM_CATEGORY = { weapons: 'weapon', armor: 'armor', gear: 'gear' };
  // R-M8G-28 · THE STAT-BLOCK RULE (a leg of the one mark rule below): an item mark lands only on EQUIPMENT WITH A STAT
  // BLOCK. A catalogue RULES PROFILE (`type: 'Rules Profile'`, the sheet's Unarmed) has none: a hard point is a stat-block
  // value (EotE Core p.187), and the unarmed profile is a rule with no stat block (p.211). A Brawl weapon that is real
  // equipment (Brass Knuckles) stays eligible. The record is the entry's own `_inline`, else the stamp's item registry
  // (`charbuild.items` when a caller passes it, as the validator does; else window.SWRPGItemRegistries, as the sheet
  // resolves it). An entry this cannot resolve is not refused HERE. → the refusal's words, or null.
  function _itemRecordOf(sheet, charbuild, section, entry) {
    if (!entry || typeof entry !== 'object') return null;
    if (entry._inline && typeof entry._inline === 'object') return entry._inline;
    var regs = (charbuild && charbuild.items) || (root && root.SWRPGItemRegistries ? root.SWRPGItemRegistries.forStampSync(sheet && sheet.mods, sheet && sheet.own) : null);
    var reg = regs && regs[section];
    return reg && entry.id != null && _has(reg, entry.id) ? reg[entry.id] : null;
  }
  function itemMarkRefusal(sheet, charbuild, section, entry) {
    var rec = _itemRecordOf(sheet, charbuild, section, entry);
    if (rec && rec.type === 'Rules Profile') return (rec.name || entry.id) + ' is a rule, not an item: it has no stat block and no hard points (R-M8G-28)';
    return null;
  }
  // pickWrite's kind-`item` arm → { equipment } (a patch; the sheet is not mutated), or { refused }. `value` is the
  // entry's { section, index } at the time of the write, or null to lift the mark. The rank's mark is first lifted off
  // every entry (a re-pick MOVES it); then:
  //   refused — a treeless rank (R-M8G-21), a per-talent item pick (unruled), no owned entry there, a section outside the
  //             pick's pool, an entry with no stat block (itemMarkRefusal, R-M8G-28), or (distinct) an entry already marked by this talent: Tinkerer's "each item may only be
  //             modified once" (R-M8G-13);
  //   the stack (R-M8G-15) — marking a gear entry with qty > 1 splits ONE copy off: a new entry at qty 1 right after it
  //             carries the mark, and the stack keeps qty − 1. Data path only at step 2 (the drawn line is step 3's).
  function _itemMarkWrite(sheet, charbuild, decl, talentId, addr, value) {
    if (addr.specId == null) return { refused: 'a treeless rank takes no item pick (R-M8G-21)' };
    if (decl.per === 'talent') return { refused: 'an item pick is per rank (no per-talent item pick is ruled)' };
    var eq = JSON.parse(JSON.stringify((sheet && sheet.equipment) || {}));
    _eachEquipmentEntry(eq, function (e) {
      if (!Array.isArray(e.talentMarks)) return;
      e.talentMarks = e.talentMarks.filter(function (m) { return !_markMatches(m, talentId, addr.specId, addr.pos); });
      if (!e.talentMarks.length) delete e.talentMarks;
    });
    if (value == null) return { equipment: eq };
    var sec = value && value.section, idx = value && value.index;
    var target = sec === 'armor' ? (idx === 0 ? eq.armor : null)
      : (sec === 'weapons' || sec === 'gear') && Array.isArray(eq[sec]) ? eq[sec][idx] : null;
    if (!target || typeof target !== 'object') return { refused: 'no owned entry at ' + sec + ' ' + idx };
    var cats = decl.pool && Array.isArray(decl.pool.categories) ? decl.pool.categories : null;
    if (cats && cats.indexOf(ITEM_CATEGORY[sec]) === -1) return { refused: 'the pick offers ' + cats.join('|') + ', not ' + ITEM_CATEGORY[sec] };
    var noBlock = itemMarkRefusal(sheet, charbuild, sec, target);
    if (noBlock) return { refused: noBlock };
    if (decl.distinct && Array.isArray(target.talentMarks) && target.talentMarks.some(function (m) { return m && m.talent === talentId; })) {
      return { refused: 'that item is already modified by this talent (each item may only be modified once)' };
    }
    var mark = { talent: talentId, spec: addr.specId, cell: addr.pos };
    if (sec !== 'armor' && Number(target.qty) > 1) {
      var one = JSON.parse(JSON.stringify(target));
      one.qty = 1; one.talentMarks = [mark];
      target.qty = Number(target.qty) - 1;
      eq[sec].splice(idx + 1, 0, one);
    } else {
      target.talentMarks = (Array.isArray(target.talentMarks) ? target.talentMarks : []).concat([mark]);
    }
    return { equipment: eq };
  }
  // THE MARK REFUSALS (R-M8G-13, R-M8G-21) — ONE rule, read by pickWrite's callers and by the validator's L1cb.mark leg
  // (scripts/canonical/f100_m8_mark_check.cjs). itemMarkProblems(sheet, charbuild) → ['<where>: <why>', …]:
  //   a mark with no `spec` (a treeless rank takes no item pick), or whose spec/cell does not hold its talent in the
  //   specialization registry (the stamp view's, as every other read); a talent with no kind-`item` pick; a mark on an
  //   entry with no stat block (itemMarkRefusal, R-M8G-28); and, for a `distinct` item pick, a second mark of that talent
  //   on one entry (Tinkerer: "each item may only be modified once").
  function itemMarkProblems(sheet, charbuild) {
    var view = talentViewFor(sheet), cb = charbuild || {};
    var talents = (view && view.talents) || cb.talents || {};
    var specs = (view && view.specializations) || cb.specializations || {};
    var out = [];
    _eachEquipmentEntry(sheet && sheet.equipment, function (e, sec, i) {
      if (e.talentMarks == null) return;
      var where = sec + '[' + i + ']';
      if (!Array.isArray(e.talentMarks)) { out.push(where + ': talentMarks is not a list'); return; }
      var noBlock = e.talentMarks.length ? itemMarkRefusal(sheet, cb, sec, e) : null;
      if (noBlock) out.push(where + ': ' + noBlock);
      var seen = {};
      e.talentMarks.forEach(function (m, j) {
        var at = where + '.talentMarks[' + j + ']';
        if (!m || typeof m !== 'object' || typeof m.talent !== 'string' || typeof m.cell !== 'string') { out.push(at + ': not a {talent, spec, cell} mark'); return; }
        if (!m.spec) { out.push(at + ': no spec (a treeless rank takes no item pick, R-M8G-21)'); return; }
        var rc = m.cell.split('-'), tree = _has(specs, m.spec) && specs[m.spec] ? specs[m.spec].talent_tree : null;
        var row = tree && tree[+rc[0]], cell = row && row.talents ? row.talents[+rc[1]] : null;
        if (!cell || cell.talent !== m.talent) { out.push(at + ': ' + m.spec + ' ' + m.cell + ' does not hold ' + m.talent); return; }
        var rec = _has(talents, m.talent) ? talents[m.talent] : null;
        var decl = rec ? _pickDecls(rec).filter(function (p) { return p.kind === 'item'; })[0] : null;
        if (!decl) { out.push(at + ': ' + m.talent + ' declares no item pick'); return; }
        if (decl.distinct && seen[m.talent]) out.push(at + ': a second ' + m.talent + ' mark on one entry (each item may only be modified once)');
        seen[m.talent] = true;
      });
    });
    return out;
  }
  // ── F-100 M8 C7 · THE OWNER'S ITEM EFFECTS (R-M8K-7; R-M8G-16) ──────────────────────────────────────────────────────
  // ownedItemEffects(sheet, charbuild) → [{ section, index, op, amount, talent, row, source, rank }] — every owned talent's
  // item_effects[] row, once per LIVE instance of the pick its `item.chosen` names (read through picksOf → pickOf, the
  // one reader), aimed at the entry that instance's mark sits on. An unmade pick, a lost item or an unowned cell yields
  // nothing (FAIL CLOSED). ItemResolve.applyCharacterEffects projects these onto the DISPLAY, never the record.
  // A row with an `option` gate (Jury Rigged, f100-m8-contracts ADDENDUM 3 A3.3) is emitted for an item instance only when
  // the kind-option pick's instance at the SAME (spec, cell) holds `option.is`, and that value's `categories` (if any)
  // hold the marked entry's category; anything else — unpicked, another value, a value that no longer fits the item —
  // gives nothing. `floor`, `target` and `in_use` ride through to the projection. `rank` = the instance's place among the
  // pick's owned instances (1-based; the stowed panel's "Jury Rigged (rank 1)", frame J7).
  // F-100 M12 (f100-m12-build-card ADDENDUM 22; the qualities paper's QG1 / QS3 / QK1): the two item ops M12 adds, each a
  // newly MODELLED arm (R-M12F-8).
  var ITEM_OPS_DARK = { quality_grant: 1, spend_effect_set: 1 };
  // A row's amount for one emission: quality_grant's `count_of {of: force_rating}` reads the owner's Force rating through
  // the ONE reader, _resolveCountOf's force_rating arm (PRAXIS §5; _resolveDialAmounts' probe); spend_effect_set's amount
  // is a VALUE, never × ranks; otherwise amount × ranks (Burly's {all} rows; 1 for a pick's instance). A Force rating of 0
  // gives nothing (null).
  function _itemRowAmount(row, ranks, sheet, charbuild) {
    if (row.op === 'quality_grant' && row.count_of && row.count_of.of === 'force_rating') {
      var probe = _resolveCountOf([{ count: 1, count_of: { of: 'force_rating', key: 'self' } }], sheet, charbuild);
      var fr = probe.length ? Number(probe[0].count) || 0 : 0;
      return fr > 0 ? fr : null;
    }
    if (row.op === 'spend_effect_set') return Number(row.amount) || 0;
    if (row.op === 'quality_grant' && row.amount == null) return 0;   // an unrated grant (Cortosis, Sunder): no step
    return (Number(row.amount) || 0) * ranks;
  }
  // What rides each emission for applyCharacterEffects: the quality key, QG1's mode, QS3's field, the floor, QK1's kind.
  function _itemRowCarry(fx, row, kind) {
    if (row.key) fx.key = row.key;
    if (row.floor != null) fx.floor = row.floor;
    if (row.mode) fx.mode = row.mode;
    if (row.field) fx.field = row.field;
    if (row.op === 'quality_grant') fx.ranked = row.amount != null || !!row.count_of;
    if (kind && typeof kind === 'object') fx.kind = kind;
  }
  function ownedItemEffects(sheet, charbuild) {
    var view = talentViewFor(sheet), cb = charbuild || {};
    var talents = (view && view.talents) || cb.talents || {};
    var cbv = view ? Object.assign({}, cb, { specializations: view.specializations || cb.specializations, talents: talents }) : cb;
    var out = [];
    if (!sheet) return out;
    _ownedTalentIdSet(sheet, cbv).forEach(function (tid) {
      var rec = _has(talents, tid) ? talents[tid] : null;
      var rows = rec && Array.isArray(rec.item_effects) ? rec.item_effects : [];
      if (!rows.length) return;
      var picks = picksOf(sheet, charbuild, tid);
      rows.forEach(function (row) {
        // F-100 M12 (f100-m12-build-card ADDENDUM 14, R-M12B-40..42): `item: {all: "weapons"}` — EVERY weapons[] entry in
        // use (not stowed; the schema requires `in_use`), no pick: Burly (Dangerous Covenants p.32, "any wielded or carried
        // weapon"). ONE row per weapon with the amount × the talent's owned ranks (ownedRankCounts' universe: sheet.talents
        // and species grants, as the pool's owned-talent arm counts them); applyCharacterEffects applies the floor once.
        // The Cumbersome half (qualities_reduce) is LIVE — B-1204; every other {all} op is a newly MODELLED arm
        // (R-M12B-42, R-M12F-8).
        if (row && row.item && row.item.all === 'weapons') {
          var ranks = _ownedTalentRanks(sheet, cbv, tid);
          if (!(ranks > 0)) return;
          var amt = _itemRowAmount(row, ranks, sheet, charbuild);
          if (amt === null) return;
          (Array.isArray(sheet.equipment && sheet.equipment.weapons) ? sheet.equipment.weapons : []).forEach(function (w, wi) {
            if (!w || typeof w !== 'object') return;
            var fxa = { section: 'weapons', index: wi, op: row.op, amount: amt, talent: tid, row: row.id,
              source: rec.name || tid, rank: ranks, in_use: true };
            _itemRowCarry(fxa, row, row.item.kind);
            out.push(fxa);
          });
          return;
        }
        // F-100 M12 QG1 (the paper's `item.talent`): the pick is ANOTHER talent's — Ichor Blade (Improved) on the weapon
        // Ichor Blade marked — read through the same picksOf. QK1: a pick whose pool names a KIND (Ichor Blade's), a
        // quality_grant / spend_effect_set row, or another talent's pick is a newly MODELLED arm (R-M12F-8).
        var pid = row && row.item && row.item.chosen;
        var other = row && row.item && typeof row.item.talent === 'string' ? row.item.talent : null;
        var from = other ? picksOf(sheet, charbuild, other) : picks;
        var entry = from.filter(function (e) { return e.pick.id === pid && e.pick.kind === 'item'; })[0];
        if (!entry) return;
        var kind = entry.pick.pool && typeof entry.pick.pool === 'object' && entry.pick.pool.kind && typeof entry.pick.pool.kind === 'object'
          ? entry.pick.pool.kind : null;
        var amtc = _itemRowAmount(row, 1, sheet, charbuild);
        if (amtc === null) return;
        var gate = row.option && typeof row.option === 'object' ? row.option : null;
        var opt = gate ? picks.filter(function (e) { return e.pick.id === gate.chosen && e.pick.kind === 'option'; })[0] : null;
        if (gate && !opt) return;
        entry.instances.forEach(function (inst, k) {
          var v = inst.value;
          if (!v || typeof v !== 'object') return;
          if (gate && optionValueAt(opt, inst.specId, inst.pos, v.section) !== gate.is) return;
          var fx = { section: v.section, index: v.index, op: row.op, amount: ITEM_OPS_DARK[row.op] ? amtc : row.amount, talent: tid, row: row.id, source: rec.name || tid, rank: k + 1 };
          if (row.floor != null) fx.floor = row.floor;
          if (row.target) fx.target = row.target;
          if (row.in_use === true) fx.in_use = true;
          _itemRowCarry(fx, row, kind);
          out.push(fx);
        });
      });
    });
    return out;
  }

  // THE OPTION VALUE THAT COUNTS at one owned instance (f100-m8-contracts A3.2 (1)): the kind-option pick `opt` (a picksOf
  // entry) at (specId, pos), or null when unpicked, unknown, or no longer fitting the marked item's `section` (its
  // `categories` do not hold the section's category — the prompt shows again, FAIL CLOSED). One reader for the engine and
  // the picker.
  function optionValueAt(opt, specId, pos, section) {
    var inst = opt ? opt.instances.filter(function (i) { return i.specId === specId && i.pos === pos; })[0] : null;
    var val = inst ? inst.value : null;
    if (val == null) return null;
    var od = (Array.isArray(opt.pick.options) ? opt.pick.options : []).filter(function (o) { return o && o.id === val; })[0];
    if (!od) return null;
    if (Array.isArray(od.categories) && od.categories.indexOf(ITEM_CATEGORY[section]) === -1) return null;
    return val;
  }
  function _collectTalentPicks(talentRec, chosen, where, out, each) {
    var grants = talentChoiceGrantsOf(talentRec);
    if (!grants.length || !chosen) return;
    var list = Array.isArray(chosen) ? chosen : [chosen];
    // count is PER RANK and one entry IS one rank, so the per-entry allowance is the grant's count.
    var allowed = grants.reduce(function (n, g) { return n + (Number(g.count) || 0); }, 0);
    if (list.length > allowed) {
      throw new Error('talentChoiceSkills: ' + where + ' carries ' + list.length +
        ' picks for ' + (talentRec && talentRec.id) + ', which allows ' + allowed + ' per rank');
    }
    list.forEach(function (id) { if (id && out.indexOf(id) === -1) out.push(id); if (id && each) each(id, talentRec && talentRec.id); });
  }
  // Every OWNED tree cell of `specsList`, as fn(specId, "r-c", talentId) — the positional walk the choice
  // grants, the fixed grants and the characteristic picks all read (one walk, R-TCP-1's address).
  function _eachOwnedCell(specsList, specRegistry, fn) {
    (Array.isArray(specsList) ? specsList : []).forEach(function (s) {
      var rec = specRegistry ? specRegistry[s && s.id] : null;
      var tree = rec && rec.talent_tree;
      if (!tree) return;                                  // retired spec contributes nothing
      ((s && s.owned) || []).forEach(function (pos) {
        var rc = String(pos).split('-');
        var row = tree[+rc[0]];
        var cell = row && row.talents ? row.talents[+rc[1]] : null;
        var tid = cell && cell.talent;
        if (tid) fn(s.id, pos, tid);
      });
    });
  }
  // B-1055 (ruling release-r7-bug-burndown ADDENDUM 86, CALL 1) — the Dedication cells still OWED their characteristic,
  // as ["<spec> <r-c>", …]. A Dedication bought in the creator files no pick and applies no +1, so the sheet's 'place'
  // offers it; a record-less Dedication bought on the sheet BEFORE M7 already holds its +1 (R-M7K-14) and must not be
  // offered a second. DERIVED, writes nothing:
  //   owed = owned Dedication ranks − recorded picks − the unrecorded post-creation gain,
  //   gain = Σ max(0, characteristics − characteristicsAtCreation), unrecorded = max(0, gain − recorded picks).
  // No `characteristicsAtCreation` (a pre-B-736 record) → nothing is owed: it cannot be told apart from a held point.
  // The first `owed` record-less cells, in spec then row-major order, carry it.
  function dedicationOwedCells(sheet, specRegistry) {
    var atC = sheet && sheet.characteristicsAtCreation;
    if (!sheet || !atC || typeof atC !== 'object') return [];
    var reg = specRegistry;
    if (Array.isArray(reg)) { reg = {}; specRegistry.forEach(function (r) { if (r && r.id) reg[r.id] = r; }); }
    var tcc = sheet.talentCharacteristicChoices || {};
    var owned = 0, recorded = 0, bare = [];
    _eachOwnedCell(sheet.specializations, reg, function (specId, pos, tid) {
      if (tid !== 'dedication') return;
      owned++;
      var c = tcc[specId] && tcc[specId][pos];
      if (typeof c === 'string' && CHAR_ABBR[c]) recorded++; else bare.push(specId + ' ' + pos);
    });
    if (!bare.length) return [];
    var chars = sheet.characteristics || {}, gain = 0;
    Object.keys(CHAR_ABBR).forEach(function (k) {
      var d = (Number(chars[k]) || 0) - (Number(atC[k]) || 0);
      if (atC[k] != null && d > 0) gain += d;
    });
    var owed = owned - recorded - Math.max(0, gain - recorded);
    bare.sort(function (a, b) {
      var A = a.split(' '), B = b.split(' '), ra = A[1].split('-'), rb = B[1].split('-');
      return A[0] < B[0] ? -1 : A[0] > B[0] ? 1 : ((+ra[0] - +rb[0]) || (+ra[1] - +rb[1]));
    });
    return owed > 0 ? bare.slice(0, owed) : [];
  }
  // specsList: sheet.specializations ([{id, owned:["r-c"]}]) · picks: sheet.talentSkillChoices
  // treeless: sheet.treelessTalents ([{id, xp, source, skillChoices}]) — R-TCP-2's (a1) companion,
  // selected by the entry carrying the field, never by a label (R-SPP-12).
  // `each` (optional, F-100 M7): fn(skillId, talentId) per pick, for careerSkillStatus's `because`.
  // `picks` is the legacy map, or (F-100 M8, R-M8K-6 (c)) a reader fn(specId, pos | treelessEntry) — careerSkillStatus
  // passes `pickOf(sheet, …, 'career_skills')`, so the career derive reads through the ONE reader.
  function talentChoiceSkillsAll(specsList, specRegistry, talentRegistry, picks, treeless, each) {
    var out = [];
    var read = typeof picks === 'function' ? picks : null;
    _eachOwnedCell(specsList, specRegistry, function (specId, pos, tid) {
      var chosen = read ? read(specId, pos) : ((picks && picks[specId]) || {})[pos];
      _collectTalentPicks(talentRegistry && talentRegistry[tid], chosen, specId + ' ' + pos, out, each);
    });
    (Array.isArray(treeless) ? treeless : []).forEach(function (e) {
      var chosen = !e ? null : read ? read(null, e) : e.skillChoices;
      if (!chosen) return;
      _collectTalentPicks(talentRegistry && talentRegistry[e.id], chosen, 'treeless ' + e.id, out, each);
    });
    return out;
  }

  // Every choice-skill across a character's owned specs, for the career-status union.
  function specChoiceSkillsAll(specRecs, picks) {
    var out = [];
    (specRecs || []).forEach(function(rec) {
      specChoiceSkillsFor(rec, picks).forEach(function(id) {
        if (out.indexOf(id) === -1) out.push(id);
      });
    });
    return out;
  }

  // ── F-100 M7 · C2 — ONE ANSWER PER QUANTITY (ruling `f100-m7-contracts` R-M7K-7/9/10) ────────────────────────
  //
  // `careerSkillStatus(sheet, charbuild[, opts])` IS "is this a career skill?" for a character, everywhere: the sheet's
  // stage mark and ADVANCEMENT price, the talent picker, the creator's buy-ranks, the reverse transform's allowance and
  // both exports read it. It folds, as SET MEMBERSHIP (OR — a grant owned twice counts once, R-M7K-1):
  //   the career's skills · each counted specialization's skills and its player-chosen skill (B-40) · every owned
  //   talent's choice picks (B-181, positional) · every owned talent's FIXED grant (C1's `career_skill` op) · the
  //   species' structured `as_career` (Squib's Mechanics — B-1034; the flat list and the chosen options' grants) · the
  //   species' player-CHOSEN career skills (`speciesChoiceSkillsFor`, the Cerean's Intellectuals — R-CI-3) · every OWNED
  //   gear item's career-skill rows (`itemCareerSkillGrants`, B-1039 — stowed included).
  // → { <sheetKey>: { career: true, id: <canonical id>, because: ['career' | 'spec:<id>' | 'spec-choice:<id>' |
  //     'talent:<id>' | 'species:<id>' | 'species-choice:<id>' | 'item:<gear id>' | 'group-base:<base id>' |
  //     'group-train:<base id>' | 'group-holocron' | 'group-item:<gear id>'] } }, `because` in that order (the mechanics voice reads it). The group's (R6 lane D) come from the
  //     member's group record through groupGrants, so the creator, the sheet and the growth room read one answer. A skill absent
  //     from the map is not a career skill. Owned talents = the positional cells ∪ `sheet.talents` ∪ the treeless
  //     entries ∪ the species' talent grants, read through the sheet's stamp view when one is registered (C4.1).
  // opts.specIds — the specializations whose OWN skills count (default: every owned spec, resolveSheetSpecs). The
  //   creation allowance passes the first spec only, its rule since R-SAM-1; talents still count from every tree.
  function careerSkillStatus(sheet, charbuild, opts) {
    var cb = charbuild || {}; opts = opts || {}; sheet = sheet || {};
    var keys = cb.skillSheetKeys || {};
    var view = talentViewFor(sheet);
    var talents = (view && view.talents) || cb.talents || {};
    var out = {};
    function add(id, why) {
      if (!id) return;
      var k = keys[id] || id;
      var e = out[k] || (out[k] = { career: true, id: id, because: [] });
      if (e.because.indexOf(why) === -1) e.because.push(why);
    }
    var career = cb.careers ? cb.careers[sheetCareerId(sheet, cb.careers)] : null;
    ((career && career.career_skills) || []).forEach(function (id) { add(id, 'career'); });
    var specIds = Array.isArray(opts.specIds) ? opts.specIds
      : resolveSheetSpecs(sheet, cb).map(function (x) { return x && x.id; }).filter(Boolean);
    specIds.forEach(function (sid) {
      var rec = cb.specializations ? cb.specializations[sid] : null;
      if (!rec) return;
      (rec.career_skills || []).forEach(function (id) { add(id, 'spec:' + sid); });
      specChoiceSkillsFor(rec, sheet.specSkillChoices).forEach(function (id) { add(id, 'spec-choice:' + sid); });
    });
    talentChoiceSkillsAll(sheet.specializations, cb.specializations, talents,
      function (specId, pos) { return pickOf(sheet, specId, pos, 'career_skills'); }, (sheet.treelessTalents || []).concat(_looseRanks(sheet)),   // M8: the one reader
      function (skillId, tid) { add(skillId, 'talent:' + tid); });
    _ownedTalentIdSet(sheet, cb).forEach(function (tid) {
      if (!Object.prototype.hasOwnProperty.call(talents, tid)) return;
      talentEffectsOf(tid, talents).forEach(function (e) {
        if (e.op === 'career_skill' && Array.isArray(e.skills)) e.skills.forEach(function (id) { add(id, 'talent:' + tid); });
      });
    });
    var species = _sheetSpecies(sheet, cb);
    if (species) {
      var asCareer = function (g) { if (g && g.skill && g.as_career === true) add(g.skill, 'species:' + species.id); };
      (species.starting_skills || []).forEach(asCareer);
      var picks = (sheet.speciesOptionPicks && typeof sheet.speciesOptionPicks === 'object') ? sheet.speciesOptionPicks : {};
      (species.option_choices || []).forEach(function (oc) {
        _chosenOptions(oc, picks).forEach(function (opt) { (opt.skill_grants || []).forEach(asCareer); });
      });
      // R-CI-3: the species' CHOSEN career skills (the Cerean's Intellectuals), beside its fixed `as_career` — status, no rank
      speciesChoiceSkillsFor(species, sheet.speciesSkillChoices, cb).forEach(function (id) { add(id, 'species-choice:' + species.id); });
    }
    // B-1039 (ADDENDUM 314 C3): the character's OWNED items' career-skill rows, a stowed one included
    itemCareerSkillGrants(sheet, cb).forEach(function (g) { add(g.skill, 'item:' + g.gearId); });
    // R6 lane D (R-R4S-8; R-R6PC-2 read 1): the GROUP's grants — its bases' focus and Training Facility skills and the
    // holocron's two — read from the group record at resolve time (groupGrants), never written onto the sheet.
    groupGrants(sheet).careerSkills.forEach(function (g) { add(g.skill, g.because); });
    return out;
  }
  // The canonical ids careerSkillStatus marks career, as an { id: true } set — the creator's readers hold ids.
  function careerSkillIds(status) {
    var ids = {};
    Object.keys(status || {}).forEach(function (k) { if (status[k] && status[k].career) ids[status[k].id] = true; });
    return ids;
  }
  function _sheetSpecies(sheet, cb) {
    var reg = cb && cb.species;
    if (!reg || !sheet) return null;
    var sid = sheet.speciesId && reg[sheet.speciesId] ? sheet.speciesId
      : (sheet.species ? lookupByName(speciesNameIndex(reg), sheet.species) : null);
    return sid ? reg[sid] : null;
  }
  // Every talent id the sheet owns, de-duplicated (C1's ops fold as OR / best-of, never per rank).
  // a talent's owned ranks, counted as ownedTalentPoolSources counts them (sheet.talents' ranks + species grants; ONE COUNTER)
  function _ownedTalentRanks(sheet, cb, tid) {
    var ids = [];
    (Array.isArray(sheet && sheet.talents) ? sheet.talents : []).forEach(function (e) {
      if (!e || e.id !== tid) return;
      for (var i = 0, n = Math.max(1, Number(e.rank) || 1); i < n; i++) ids.push(e.id);
    });
    grantedTalentsAtRender(sheet, cb).forEach(function (g) {
      if (g.id !== tid) return;
      for (var i = 0, n = Math.max(1, Number(g.rank) || 1); i < n; i++) ids.push(g.id);
    });
    var c = ownedRankCounts(ids)[0];
    return c ? c.rank : 0;
  }
  function _ownedTalentIdSet(sheet, cb) {
    var seen = [], push = function (id) { if (typeof id === 'string' && id && seen.indexOf(id) === -1) seen.push(id); };
    _eachOwnedCell(sheet && sheet.specializations, cb && cb.specializations, function (s, pos, tid) { push(tid); });
    (Array.isArray(sheet && sheet.talents) ? sheet.talents : []).forEach(function (t) { if (t) push(t.id); });
    (Array.isArray(sheet && sheet.treelessTalents) ? sheet.treelessTalents : []).forEach(function (t) { if (t) push(t.id); });
    _looseRanks(sheet).forEach(function (t) { push(t.id); });
    grantedTalentsAtRender(sheet, cb).forEach(function (g) { push(g.id); });
    return seen;
  }

  // `skillCharacteristic(sheet, sheetKey, charbuild)` IS "which characteristic does this skill roll with?" for a
  // character (R-M7K-9): the stage, every pool composer (sheetPoolOf, the hub, the weapon pool, the workshop), a
  // sheet's PDF. → { characteristic, base, because, alternatives, reminders, unpicked } | null for an unknown skill:
  //   base          — skills.vocab.json's linked characteristic (the only source; SKILL_CHARS is deleted);
  //   alternatives  — every ALWAYS-available swap an owned talent gives this skill (C1's `skill_characteristic`
  //                   without `applies`), [{ characteristic, because: 'talent:<id>' }]; `to: chosen` reads the pick
  //                   map (R-M7K-3) — `talentCharacteristicChoices[spec]["r-c"]`, or a treeless entry's
  //                   `characteristicChoice` — and a chosen swap with no recorded pick is listed in `unpicked`;
  //   characteristic — C3's best-of (R-M7K-10): the HIGHEST of base and the alternatives by the sheet's own
  //                   characteristics; a TIE GOES TO THE BASE (and between alternatives, to the first). Pools are
  //                   monotonic in the characteristic (brief §7 C3, 0 of 126), so "higher" is "better pool";
  //   because       — 'base' or the winning alternative's 'talent:<id>';
  //   reminders     — the swaps the roll OFFERS and never applies (R-M7K-4: a cost, a condition or a limit;
  //                   `skills: any` included), [{ characteristic, because, cost?, condition?, limit? }].
  // Nothing is stored: the per-roll switch is the dice window's (C3), and a stored override is rejected for M7.
  var CHAR_ABBR = { brawn: 'BR', agility: 'AG', intellect: 'INT', cunning: 'CUN', willpower: 'WIL', presence: 'PR' };
  // NOT cached (ruling f100-m7-build R-M7G-10): an answer is never computed from a sheet state that has since changed,
  // including a characteristic or a pick edited IN PLACE. Uncached, a full read of every skill costs ≤ 0.7 ms per pregen.
  function skillCharacteristicsOf(sheet, charbuild) {
    var cb = charbuild || {};
    var view = talentViewFor(sheet);
    var talents = (view && view.talents) || cb.talents || {};
    // the sheet's own trees and talents (its stamp view, C4.1), the vocabulary maps from the charbuild
    var cbv = view ? Object.assign({}, cb, { specializations: view.specializations || cb.specializations, talents: talents }) : cb;
    var keys = cb.skillSheetKeys || {}, chars = cb.skillChars || {};
    var chv = (sheet && sheet.characteristics) || {};
    var always = [], reminders = [], unpicked = [];      // [{ skills: [ids] | 'any', characteristic, because, ... }]
    var subs = [];                                         // F-100 M8 M2: skill_substitute rows, { skills, use, to, because, … }
    var chosenAt = {};                                     // talentId -> [characteristic picked], positional
    // F-100 M8 (R-M8K-6 (c)): the picks are read through the ONE reader, pickOf — talentChoices first, then M7's map.
    _eachOwnedCell(sheet && sheet.specializations, cbv.specializations, function (specId, pos, tid) {
      var c = pickOf(sheet, specId, pos, 'characteristic');
      if (CHAR_ABBR[c]) (chosenAt[tid] = chosenAt[tid] || []).push(c);
    });
    (Array.isArray(sheet && sheet.treelessTalents) ? sheet.treelessTalents : []).concat(_looseRanks(sheet)).forEach(function (t) {
      var c = t && t.id ? pickOf(sheet, null, t, 'characteristic') : null;
      if (CHAR_ABBR[c]) (chosenAt[t.id] = chosenAt[t.id] || []).push(c);
    });
    (sheet ? _ownedTalentIdSet(sheet, cbv) : []).forEach(function (tid) {
      if (!Object.prototype.hasOwnProperty.call(talents, tid)) return;
      talentEffectsOf(tid, talents).forEach(function (e) {
        if (e.op === 'skill_substitute' && Array.isArray(e.skills) && Array.isArray(e.use)) {
          var s = { skills: e.skills, use: e.use, to: e.to || null, because: 'talent:' + tid, talentId: tid };
          if (e.cost) s.cost = e.cost; if (e.condition) s.condition = e.condition; if (e.limit) s.limit = e.limit;
          subs.push(s);
          return;
        }
        if (e.op !== 'skill_characteristic') return;
        var why = 'talent:' + tid;
        if (e.applies === 'reminder') {
          var r = { skills: e.skills, characteristic: e.to, because: why };
          if (e.cost) r.cost = e.cost; if (e.condition) r.condition = e.condition; if (e.limit) r.limit = e.limit;
          reminders.push(r);
        } else if (e.to === 'chosen') {
          var got = chosenAt[tid] || [];
          if (!got.length) unpicked.push({ skills: e.skills, because: why });
          got.forEach(function (c) { always.push({ skills: e.skills, characteristic: c, because: why }); });
        } else {
          always.push({ skills: e.skills, characteristic: e.to, because: why });
        }
      });
    });
    // F-100 M9 (R-M9S-1): a species ability's skill swaps — `skill_characteristic` (Jawa's Clever Negotiators, Echani's Quick
    // Blows) and `skill_substitute` (Shistavanen's Hunter's Instincts) — read exactly as a talent's, `because` naming the
    // ability's owner id ('species:<id>:<slug>'; speciesAbilityOwner gives a surface its name).
    // A species row carries no `to: chosen` (a pick is refused on species rows), so there is no pick to read here.
    (sheet ? _speciesEffects(sheet, cbv, ['skill_characteristic', 'skill_substitute']) : []).forEach(function (x) {
      var e = x.effect, why = x.owner.id;
      if (e.op === 'skill_substitute') {
        if (!Array.isArray(e.skills) || !Array.isArray(e.use)) return;
        var s = { skills: e.skills, use: e.use, to: e.to || null, because: why, talentId: why };
        if (e.cost) s.cost = e.cost; if (e.condition) s.condition = e.condition; if (e.limit) s.limit = e.limit;
        subs.push(s);
        return;
      }
      if (!CHAR_ABBR_OF[e.to]) return;
      if (e.applies === 'reminder' || e.condition || e.cost || e.limit) {
        var r = { skills: e.skills, characteristic: e.to, because: why };
        if (e.cost) r.cost = e.cost; if (e.condition) r.condition = e.condition; if (e.limit) r.limit = e.limit;
        reminders.push(r);
      } else always.push({ skills: e.skills, characteristic: e.to, because: why });
    });
    var applies = function (entry, id) { return entry.skills === 'any' || (Array.isArray(entry.skills) && entry.skills.indexOf(id) !== -1); };
    // F-100 M8 M2 (f100-m8-batches R-M8BG-233, approved D-81): the row's skill substitutions, one per substitute skill —
    // an id always; a group reference `{group}` (M-4 (ii)) = that group's skills the sheet has ranks in, none at 0. The
    // row's own skill is never its own substitute. Characteristic: `to`, else the substitute's own (R-M8BG-230).
    var groups = cb.skillGroups || {}, sk = (sheet && sheet.skills) || {};
    var rankOf = function (id) { var v = sk[keys[id] || id]; return (v && typeof v === 'object') ? (Number(v.rank) || 0) : (Number(v) || 0); };
    function substitutesFor(id) {
      var got = [];
      subs.forEach(function (s) {
        if (!applies(s, id)) return;
        var ids = [];
        s.use.forEach(function (u) {
          if (u && typeof u === 'object' && u.group) Object.keys(chars).sort().forEach(function (g) { if (groups[g] === u.group && rankOf(g) > 0) ids.push(g); });
          else if (typeof u === 'string') ids.push(u);
        });
        ids.forEach(function (u) {
          if (u === id || !chars[u] || got.some(function (x) { return x.skill === u && x.because === s.because; })) return;
          var o = { skill: u, sheetKey: keys[u] || u, characteristic: s.to || chars[u], to: s.to, because: s.because, talentId: s.talentId };
          if (s.cost) o.cost = s.cost; if (s.condition) o.condition = s.condition; if (s.limit) o.limit = s.limit;
          got.push(o);
        });
      });
      return got;
    }
    var out = {};
    Object.keys(chars).forEach(function (id) {
      var base = chars[id];
      var alts = [], seen = {};
      always.forEach(function (a) {
        if (!applies(a, id) || a.characteristic === base || seen[a.characteristic + a.because]) return;
        seen[a.characteristic + a.because] = true;
        alts.push({ characteristic: a.characteristic, because: a.because });
      });
      var best = { characteristic: base, because: 'base' }, bestV = Number(chv[base]) || 0;
      alts.forEach(function (a) { var v = Number(chv[a.characteristic]) || 0; if (v > bestV) { best = a; bestV = v; } });
      var rec = {
        characteristic: best.characteristic, base: base, because: best.because, alternatives: alts,
        reminders: reminders.filter(function (r) { return applies(r, id) && r.characteristic !== base; })
          .map(function (r) { var o = Object.assign({}, r); delete o.skills; return o; }),
        unpicked: unpicked.filter(function (u) { return applies(u, id); }).map(function (u) { return { because: u.because }; }),
        substitutes: substitutesFor(id),
      };
      out[keys[id] || id] = rec;
      if (!out[id]) out[id] = rec;
    });
    return out;
  }
  // One skill's answer; `sheetKey` may be the sheet key (LTSAB) or the canonical id (lightsaber).
  function skillCharacteristic(sheet, sheetKey, charbuild) {
    var all = skillCharacteristicsOf(sheet, charbuild);
    return Object.prototype.hasOwnProperty.call(all, sheetKey) ? all[sheetKey] : null;
  }
  // The skill's BASE characteristic alone, from the vocabulary — the creator's pickers' read (R-M7K-9: base-only
  // readers read the vocab's characteristic through the charbuild map). → 'brawn' … or null.
  function skillBaseCharacteristic(sheetKeyOrId, charbuild) {
    var cb = charbuild || {}, chars = cb.skillChars || {};
    if (chars[sheetKeyOrId]) return chars[sheetKeyOrId];
    var keys = cb.skillSheetKeys || {};
    for (var id in keys) if (keys[id] === sheetKeyOrId) return chars[id] || null;
    return null;
  }

  // ── R-MEP-1/2 — THE MORALITY PAIR, RESOLVED ONCE ──────────────────────────────────────────────
  // PERSIST THE DEPARTURE, DERIVE THE DEFAULT. fad p.49 lets a player roll (or pick) the Strength
  // and the Weakness SEPARATELY, so the pair is no longer a function of the Strength alone. The
  // save gains ONE optional field, `descriptorWeak`, written only when the player leaves the
  // paired default and REMOVED when they return to it — so absence still MEANS the pairing, every
  // existing save keeps working unread, and B-117's derive-by-`weakKey` stays the resolution path
  // for everyone who never departed. Never store the resolved default: that is the second copy of
  // the pairing whose absence is the whole point.
  //
  // IT LOOKS IN THE RIGHT LAYER, which is the other half of the bug. A Force-sensitive character in
  // an Obligation/Duty campaign carries Morality as `moralityLayer` while `mechanic` holds the
  // Obligation, and the four consumers all read `mechanic` — so a two-track pair was invisible to
  // every one of them. Asking here, once, fixes that in the same stroke.
  //
  // R-MEP-2 said app-local, on the premise that all consumers live in `player/app.jsx`. THERE IS A
  // FOURTH, and it is this file's own `computeDerived` (the sheet's `mechDisplay`) — so app-local
  // would have left the shared core deriving the default over a player's override, which is the
  // defect the ruling exists to prevent. It lives in the core that already owned this quantity;
  // one line moves it if the architect prefers the parenthetical to the one-shared-core law.
  function moralityPair(character, morPairs) {
    if (!character || !morPairs) return null;
    var m = character.mechanic;
    var layer = (m && m.type === 'morality') ? m
      : (character.moralityLayer && character.moralityLayer.type === 'morality')
        ? character.moralityLayer : null;
    if (!layer || !layer.descriptor) return null;
    var strengths = morPairs.strengths || [];
    var weaknesses = morPairs.weaknesses || [];
    var strObj = null;
    for (var i = 0; i < strengths.length; i++) {
      if (strengths[i].key === layer.descriptor) { strObj = strengths[i]; break; }
    }
    if (!strObj) return null;
    var overridden = !!layer.descriptorWeak;
    var weakKey = overridden ? layer.descriptorWeak : strObj.weakKey;
    var weakObj = null;
    for (var j = 0; j < weaknesses.length; j++) {
      if (weaknesses[j].key === weakKey) { weakObj = weaknesses[j]; break; }
    }
    return {
      strengthKey: strObj.key, strength: strObj.name, strengthDescription: strObj.description || '',
      weaknessKey: weakObj ? weakObj.key : null,
      weakness: weakObj ? weakObj.name : '',
      weaknessDescription: weakObj ? (weakObj.description || '') : '',
      // The DEFAULT partner, always — the pair surface prints "Paired with X on the book's own
      // table" against it, and a player who has departed still deserves to see what they left.
      pairedKey: strObj.weakKey || null,
      overridden: overridden,
    };
  }

  // The WRITE half, so no surface has to remember the absence rule. Returns the patch to apply to
  // the morality-bearing layer: the override when the player departs, and a REMOVAL when they pick
  // the paired default back. `undefined` on the field means delete, which is how the callers spell
  // it; the guard asserts the key is gone, not that it is falsy.
  function moralityWeakPatch(strengthObj, weakKey) {
    if (!strengthObj) return {};
    if (!weakKey || weakKey === strengthObj.weakKey) return { descriptorWeak: undefined };
    return { descriptorWeak: weakKey };
  }

  // THE ONE DROID TEST (R7 B-1606; ruling `release-r7-bug-burndown` ADDENDA 281, 288). A droid is any species record that IS
  // a droid, whichever book published it: the stock `droid` (EotE) and the Complete Species Guide's `csg_droid`. The rule
  // is general to droids — a droid can never be Force-sensitive or gain a Force Rating (EotE p.47);
  // "with the exception of droids" (EotE p.275, AoR p.291) — so every reader asks HERE, never `id === 'droid'` inline.
  // A code predicate over the persisted species id: no field, key or wire changes (281). B-1586's treat row reads it too.
  // B-1612 (ADDENDUM 306): a save with NO id but a species NAME (pre-D-3B2, or an import that wrote no id) is answered by
  // the name, as a READ (R-MRN-3's side): it is a droid when every record so named is a droid. "Droid" names both `droid`
  // and `csg_droid`, so `migrateSheet` (R-MRN-2) rightly stamps no id, and the answer is still yes. A name shared with any
  // non-droid record, or no record, is no. Nothing is written. `speciesReg` defaults to the runtime charbuild's species.
  var DROID_SPECIES = { droid: true, csg_droid: true };
  function isDroidSpecies(speciesId, speciesName, speciesReg) {
    if (speciesId) return DROID_SPECIES[String(speciesId)] === true;
    var wanted = speciesKey(speciesName);
    if (!wanted) return false;
    var reg = speciesReg || (root && root._canonicalCharbuild && root._canonicalCharbuild.species) || {};
    var hits = Object.keys(reg).filter(function (id) { return speciesKey(reg[id] && reg[id].name) === wanted; });
    return hits.length > 0 && hits.every(function (id) { return DROID_SPECIES[id] === true; });
  }

  var api = {
    isDroidSpecies: isDroidSpecies,                                         // R7 B-1606: the one droid test (ADDENDUM 288)
    specChoiceSkillsFor: specChoiceSkillsFor,
    speciesChoiceSkillsFor: speciesChoiceSkillsFor,
    speciesCareerPickGroups: speciesCareerPickGroups,
    speciesCareerPicksHonoured: speciesCareerPicksHonoured,
    specChoiceSkillsAll: specChoiceSkillsAll,
    talentChoiceSkillsAll: talentChoiceSkillsAll,
    dedicationOwedCells: dedicationOwedCells,
    creatorDedicationPending: creatorDedicationPending,
    creatorDedicationCarried: creatorDedicationCarried,
    creatorCharacteristicsWithPending: creatorCharacteristicsWithPending,
    pickOf: pickOf,
    picksOf: picksOf,
    pickWrite: pickWrite,
    // B-1054: the legacy pick ids (R-M8G-3) — their writers are the legacy maps, so no M8 picker may offer them
    isLegacyPick: function (pickId) { return _has(LEGACY_PICK, pickId); },
    markedEntryOf: markedEntryOf,
    itemMarkProblems: itemMarkProblems,
    itemMarkRefusal: itemMarkRefusal,
    ownedItemEffects: ownedItemEffects,
    optionValueAt: optionValueAt,
    talentChoiceGrantsOf: talentChoiceGrantsOf,
    // F-100 M7 · C2 (R-M7K-7/9/10): the one career-status answer and the one characteristic answer.
    careerSkillStatus: careerSkillStatus,
    careerSkillIds: careerSkillIds,
    setGroupResolver: setGroupResolver, groupOf: groupOf, groupGrants: groupGrants,   // R6 lane D: the group record's one engine reader
    skillCharacteristic: skillCharacteristic,
    skillCharacteristicsOf: skillCharacteristicsOf,
    skillBaseCharacteristic: skillBaseCharacteristic,
    CHAR_ABBR: CHAR_ABBR,
    isCanonicalTalentEntry: isCanonicalTalentEntry,
    // R-MEP-2: the ONE resolver for {strength, weakness} and the write rule that keeps the
    // override absent unless the player departed. Four consumers route through these.
    moralityPair: moralityPair,
    moralityWeakPatch: moralityWeakPatch,
    computeEncumbrance: computeEncumbrance,
    computeDerived: computeDerived,
    derivedBecause: derivedBecause,   // R-SSC-1: computeDerived's / computeEncumbrance's trace, chained — never saved
    derivedFloorHeld: derivedFloorHeld,   // HOMEBREW H1, R-FHW-3: the floor's held numbers, from computeDerived's own computation
    sheetDeletedRefs: sheetDeletedRefs, removedRef: removedRef, talentsKeepingAbsentTrees: talentsKeepingAbsentTrees,
    setTalentViewResolver: setTalentViewResolver, stampTalentView: stampTalentView, talentViewFor: talentViewFor, talentValuesAtRender: talentValuesAtRender,
    ownedTalentIdsOfSheet: ownedTalentIdsOfSheet,
    // B-736: the write half of the threshold freeze (`buyTalent`'s Dedication branch calls it; the
    // guard calls the same function, so the stamp cannot be removed unnoticed).
    creationCharacteristicsStamp: creationCharacteristicsStamp,
    TALENT_DERIVED_EFFECTS: TALENT_DERIVED_EFFECTS,
    CHARACTERISTIC_CAP: CHARACTERISTIC_CAP,
    skillRankCost: skillRankCost,
    repairPoisonedXp: repairPoisonedXp,
    derivedBonusesFromTalents: derivedBonusesFromTalents,
    conditionalTalentsFromOwned: conditionalTalentsFromOwned,
    talentEffectsOf: talentEffectsOf,
    forceRatingFloorFromTalents: forceRatingFloorFromTalents,
    speciesTalentGrants: speciesTalentGrants,
    speciesAbilityGrants: speciesAbilityGrants,
    // R-SFC-1/2 — the creation-buyout core. The creator reads offers off a RECORD + picks; the
    // sheet's omission and both XP audits read the spend. Exported so the guards assert the SAME
    // functions the surfaces call, never a re-implementation of them.
    speciesAbilitiesResolved: speciesAbilitiesResolved,
    speciesBuyoutOffers: speciesBuyoutOffers,
    abilitySlug: abilitySlug,
    creationBuyoutSpend: creationBuyoutSpend,
    skillDescription: skillDescription,
    SHEET_OWNED_XP_FIELDS: SHEET_OWNED_XP_FIELDS,   // ruling release-r6-rewards-reentry-xp C2: the priced sheet-owned keys
    sheetOwnedXpSpend: sheetOwnedXpSpend,         // C1: the XP paid for a sheet's own priced rows
    skillsFromRanks: skillsFromRanks,
    freeRanksOf: freeRanksOf,
    creationSkillAllowance: creationSkillAllowance,
    normalizeCreated: normalizeCreated,
    creationXpPool: creationXpPool,   // B-1264 (R-SCC-4): the ONE creation XP pool, the save's and the creator bar's
    buildCanonicalEquipment: buildCanonicalEquipment,
    speciesTalentBonuses: speciesTalentBonuses,
    implantTalentGrants: implantTalentGrants,   // B-1518
    scarTalentGrants: scarTalentGrants, grantedTalentsAtRender: grantedTalentsAtRender, scarTalentBonuses: scarTalentBonuses,   // R-R4D-4
    // F-100 M9 (R-M9B-2/3): the species abilities' working rows and the ONE credits reader
    speciesAbilityRowSources: speciesAbilityRowSources, speciesAbilityOwner: speciesAbilityOwner,
    itemCareerSkillGrants: itemCareerSkillGrants, itemCareerSkillOwner: itemCareerSkillOwner,   // B-1039 (ADDENDUM 314)
    speciesFlipNotice: speciesFlipNotice, speciesFlipSeenPatch: speciesFlipSeenPatch,   // R-SFL-3: the switch's one-time line + its stamp
    engineFlipNotice: engineFlipNotice, engineFlipSeenPatch: engineFlipSeenPatch, ENGINE_FLIP_GENERATION: ENGINE_FLIP_GENERATION,   // R-EFL-4: the engine switch's one-time line + its stamp
    speciesDefenseBonuses: speciesDefenseBonuses, speciesEncumbranceDelta: speciesEncumbranceDelta,
    speciesCreditsDelta: speciesCreditsDelta, speciesCreditsDeltaOf: speciesCreditsDeltaOf, speciesEncumbranceDeltaOf: speciesEncumbranceDeltaOf, speciesEncumbranceRowsOf: speciesEncumbranceRowsOf, startingCredits: startingCredits, BASE_STARTING_CREDITS: BASE_STARTING_CREDITS,
    // F-100 M10 (R-M10S-2..7): the upgrades' rows, V1's ONE count reader, V3's ONE committed
    // count (the hub's `available` reads forceDiceAvailable) and the committed effects (V3 characteristics, V5 ranks)
    forcePowerRowSources: forcePowerRowSources, powerUpgradeCount: powerUpgradeCount,
    // F-100 M12 (R-M12C-39/40/42, R-M12B-25): V1–V7 in ONE function (key-independent, the import's), the nodes' rows and SV2's
    // ONE count, the XP shown and never charged, and the activation fold
    sigAbilityChecks: sigAbilityChecks, sigTreeCells: sigTreeCells, sigUpgradeCount: sigUpgradeCount,
    sigAbilityRowSources: sigAbilityRowSources, sigAbilitiesXp: sigAbilitiesXp, sigAbilitiesSpend: sigAbilitiesSpend, sigBuyPlan: sigBuyPlan, sigActivation: sigActivation,
    sigQualityGrantOffers: sigQualityGrantOffers,   // QG1 (R-M12B-70): OFFERED, session state
    committedForceDice: committedForceDice, forceDiceAvailable: forceDiceAvailable, committedForceEffects: committedForceEffects,
    durationCommitDice: durationCommitDice, commitValueOf: commitValueOf, basicPowerCommits: basicPowerCommits,
    textParse: textParse, speciesTalentPointer: speciesTalentPointer, afterPowerName: afterPowerName, sigActivationCheck: sigActivationCheck,
    commitStacks: commitStacks, commitAtCap: commitAtCap,   // ADDENDA 10 / 12 F5: the stacking commit and the cap (one rule)
    forceFlipNotice: forceFlipNotice, forceFlipSeenPatch: forceFlipSeenPatch, FORCE_FLIP_GENERATION: FORCE_FLIP_GENERATION,   // R-FFL-4: the Force switch's one-time line + its stamp   // R-SHC-5 / ADDENDUM 7 C2: a Duration commit's dice, the committed set's value
    characteristicsWithCommits: characteristicsWithCommits, skillRankWithCommits: skillRankWithCommits,
    itemInUse: itemInUse, itemCharacterEffects: itemCharacterEffects, characteristicsInUse: characteristicsInUse,   // F-100 M12 MV3
    skillRankInUse: skillRankInUse, itemThresholdDelta: itemThresholdDelta,
    ownedRankCounts: ownedRankCounts,
    ownedTalentPoolSources: ownedTalentPoolSources,
    ownedTalentRollSources: ownedTalentRollSources,
    ownedTalentRowSources: ownedTalentRowSources,   // F-100 THE SURFACING MISSION (ADDENDUM 8 F1): spend / target rows' owners
    unmadeRollPicks: unmadeRollPicks,
    ownedTalentToldSources: ownedTalentToldSources,
    isCanonicalPowerEntry: isCanonicalPowerEntry,
    buildNameIndex: buildNameIndex,
    sheetCareerId: sheetCareerId, buildNamesOf: buildNamesOf,
    // F-67 / C-CSG-6: the species name index (incumbent keeps the name across a cross-source
    // duplicate). Exported so the guard can assert the SAME function the five call sites use.
    speciesNameIndex: speciesNameIndex,
    resolveTalentEntry: resolveTalentEntry,
    resolveSheetTalents: resolveSheetTalents,
    resolvePowerEntry: resolvePowerEntry,
    resolveSheetForcePowers: resolveSheetForcePowers,
    talentsFromCreatorState: talentsFromCreatorState,
    talentsFromOwnedPositions: talentsFromOwnedPositions, looseTalentIds: looseTalentIds, buildPrice: buildPrice,
    specsFromCreatorState: specsFromCreatorState,
    resolveSheetSpecs: resolveSheetSpecs,
    ownedSpecIds: ownedSpecIds,   // B-1651
    sheetHold: sheetHold,
    powersFromCreatorState: powersFromCreatorState,
    forcePowersXp: forcePowersXp, forcePowerEntryXp: forcePowerEntryXp,   // F-100 M10 B-1222
    forcePowerBasicCost: forcePowerBasicCost,                              // F-100 M12 B-1246: the one basic price
    forcePowerGrantProblems: forcePowerGrantProblems,                      // F-100 M12 R-M12B-78: the grant marker's shape
    forcePowerOwnedProblems: forcePowerOwnedProblems,                      // R7 B-1536: the bought cells' one check (ADDENDUM 269)
    forcePowerUpgradeCost: forcePowerUpgradeCost, sheetForcePowerUpgradeCost: sheetForcePowerUpgradeCost,   // B-1526
    careerPowersOf: careerPowersOf, careerPowerPriceCtx: careerPowerPriceCtx,   // F-100 M12 Career Powers (dark)
    careerEffectsOf: careerEffectsOf, careerEffectBonuses: careerEffectBonuses, careerXpAdjustment: careerXpAdjustment,   // career Attributes (dark)
    migrateSheetTalents: migrateSheetTalents,
    migrateSheetForcePowers: migrateSheetForcePowers,
    migrateSheet: migrateSheet,
    migrateRoster: migrateRoster,
    speciesEffective: speciesEffective,
    speciesPickMove: speciesPickMove,
    speciesPickCharacteristics: speciesPickCharacteristics,
    speciesSkillChoicesFor: speciesSkillChoicesFor,
    speciesStepEffective: speciesStepEffective,
    // EXPORTED so `player/app.jsx` reads a group's picks through the SAME normalizer the resolver
    // uses. The app banks `xp_adjustment` at creation (B-22) and would otherwise need its own
    // scalar-or-array branch — a second implementation of one rule, which is precisely the B-124
    // defect this helper exists to prevent.
    speciesChosenOptions: _chosenOptions,
    speciesResolvedEqual: speciesResolvedEqual,
    speciesReseedNeeded: speciesReseedNeeded,
    speciesCharsMoved: speciesCharsMoved,
    speciesGrantMerge: speciesGrantMerge,
    // R-B658-2 — the ONE flatten rule (a skills-map entry -> its rank). `normalizeCreated` flattens the
    // creator's record with it at save, `speciesAskPatch` flattens the merge's result with it, and the
    // sheet's rank readers pass an entry through it so an object written before the fix still renders.
    skillRankOf: skillRankOf,
    // R-SAM-1: the forward skill-grant applier — the creator's confirm and the sheet's ask mount
    // resolve one skill-grant map through this, keyed by the sheet key for `speciesGrantMerge`.
    speciesSkillGrants: speciesSkillGrants,
    // R-SAM-8 (species-ask-mount): the deferral predicate + the unanswered-group split the ask surface
    // renders and C-SAVR-1 asserts. R-SAM-2/3: `speciesAskPatch` is the pure persist the mount writes;
    // C-SAE-2: `speciesOptionXpDelta` is the ONE XP-delta reduce the creator AND the sheet share.
    speciesGroupDeferred: speciesGroupDeferred,
    speciesUnansweredGroups: speciesUnansweredGroups,
    speciesOptionXpDelta: speciesOptionXpDelta,
    speciesAskPatch: speciesAskPatch,
    // The free-choice skill grant (was app.jsx-only): the grant list from (rec, picks) and the pool
    // a grant may be spent on. Pinned by test/species_choice_pool.cjs and the exception census.
    speciesChoiceGrants: speciesChoiceGrants,
    speciesChoicePool: speciesChoicePool,
    // Force access at creation — the four-clause rule, one implementation (was also in app.jsx).
    forceAccessAtCreation: forceAccessAtCreation,
    sheetForceAccess: sheetForceAccess,
    forceRatingOf: forceRatingOf,
    // The free pick counts at creation (career / spec), incl. species bonus_free_ranks — one arithmetic.
    creationFreePicks: creationFreePicks,
    // Specialization gates and cost (min_force_rating · species_requirement · universal) — one home.
    minForceRatingOf: minForceRatingOf,
    meetsForceRating: meetsForceRating,
    specGate: specGate,
    costForNewSpec: costForNewSpec,
    specializationsSpend: specializationsSpend,   // B-1038/B-1537: the one specialization summer (save + creator bar)
    // The narrative mechanic engine (was inline in player/index.html) and its one record constructor.
    mechanicRecord: mechanicRecord,
    inferRuleset: inferRuleset,
    computeMechanic: computeMechanic,
    // B-744 / R-RTD-1 (4): the ONE place a trade becomes numbers, exported so a guard asserts the same
    // summation both directions call rather than a re-implementation of it.
    tradeDeltas: tradeDeltas,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.CharResolve = api;
})(typeof window !== 'undefined' ? window : null);
