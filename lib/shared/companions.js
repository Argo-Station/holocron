/* lib/shared/companions.js — R6 S1: a character's companions (`sheetData.companions`), their normalizer and the
 * two pure transforms. Card `release-r6-backend` §4 (LANE B); shapes `release-r4-shapes` S1, R-R4S-1/3.
 *
 * THE SAVE SHAPE (R4 S1, CONTRACT as written — this module is its one normalizer):
 *   sheetData.companions: [{ id: 'cmp-<base36>',
 *                            ref:  '<npcs.json id>' | null,   // a library creature, resolved at render
 *                            own:  <full NPC record> | null,   // "make your own": the castStore clone idiom
 *                            name: '',                         // '' shows the creature's own name
 *                            young: false,                     // FaD Core p.415, applied at render
 *                            mount: null | { trained: 0..2 },  // Stay on Target pp.80-83
 *                            wounds: 0, strain: 0, crits: [] }]
 *   Exactly one of `ref`/`own` is set; a row with neither (or both) is not a companion and is dropped, the
 *   bench's ghost-member rule. Unknown fields are KEPT (vesselStore's `keep` idiom), so a newer build's field
 *   survives this build's read and write.
 *
 * RESOLVE AT RENDER (charter §8): nothing here persists a display shape. `profileOf` builds the NPC record the
 * library's ONE stat block draws (`npcFromLibrary` → `NpcPaperStatBlock`, R-R4S-3) from the stored row, with the
 * young transform applied and a `because` list beside it (the why-sheet's lines: "Kaaten 12 · Young ½ · Total 6").
 *
 * THE TWO TRANSFORMS (R-R4S-3: one pure function each, printed values pinned by test/release_r6_companions.cjs):
 *   youngOf(record)          FaD Core p.415 "Juvenile Creatures": silhouette −1 (minimum 0); wound threshold, strain
 *                            threshold (if it has one) and every weapon's damage halved, rounded up. Nothing else
 *                            changes (the sidebar lists only these; soak, defence, characteristics and skills stay).
 *   mountOf(record, trained) Stay on Target pp.80-81 (= Savage Spirits pp.71-72): silhouette 2 unless the profile
 *                            states one; speed ⌈Agility ÷ 2⌉ (a Flyer: Agility in the air, 1 on the ground);
 *                            handling = Agility − silhouette − Willpower; Trained Mount N adds N dice to riding
 *                            Survival checks. Animal Bond's limit and "silhouette 1 or less can't be ridden" are SHOWN
 *                            elsewhere, never enforced (the Non-Goals forbid a legality engine, charter §3.4).
 *
 * Pure + dual-export (browser window.SWRPGCompanions / CommonJS) for node harnesses.
 */
(function (root) {
  'use strict';

  var MAX_TRAINED = 2;                              // R4 S1: mount.trained 0..2

  // ── the keep idiom (vesselStore.js R-S3K-1 (a)): known fields in place, unknown fields copied through ──
  function keep(src, known) {
    var out = {};
    if (src && typeof src === 'object' && !Array.isArray(src)) {
      Object.keys(src).forEach(function (k) {
        out[k] = Object.prototype.hasOwnProperty.call(known, k) ? known[k] : src[k];
      });
    }
    Object.keys(known).forEach(function (k) {
      if (!Object.prototype.hasOwnProperty.call(out, k)) out[k] = known[k];
    });
    return out;
  }
  function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
  function count(v) { var n = Math.floor(Number(v)); return isFinite(n) && n > 0 ? n : 0; }

  // ── ids: stable per character; never a template or creature id (decisions/0016) ──
  function mintId(existing) {
    var taken = {};
    (existing || []).forEach(function (c) { if (c && c.id) taken[c.id] = 1; });
    var id;
    do { id = 'cmp-' + Math.random().toString(36).slice(2, 10); } while (taken[id]);
    return id;
  }

  function normalizeMount(m) {
    if (!m || typeof m !== 'object') return null;
    return keep(m, { trained: Math.min(MAX_TRAINED, count(m.trained)) });
  }

  // One row. Returns null for a row that is not a companion (no id-ref and no record, or both).
  function normalizeCompanion(c) {
    if (!c || typeof c !== 'object' || Array.isArray(c)) return null;
    var ref = (typeof c.ref === 'string' && c.ref) ? c.ref : null;
    var own = (c.own && typeof c.own === 'object' && !Array.isArray(c.own)) ? c.own : null;
    if (!ref === !own) return null;
    if (isCrafted(own)) own = normalizeCraftedOwn(own);   // R-R6CC-4: the thin recipe, told apart by `_provenance`
    return keep(c, {
      id: (typeof c.id === 'string' && c.id) ? c.id : null,
      ref: ref,
      own: own,
      name: typeof c.name === 'string' ? c.name : '',
      young: c.young === true,
      mount: normalizeMount(c.mount),
      wounds: count(c.wounds),
      strain: count(c.strain),
      crits: Array.isArray(c.crits) ? c.crits.slice() : [],
    });
  }

  // The array. A row without an id is minted one (an import's or a legacy row's); two rows sharing an id keep the
  // first, so a sync union that doubled a row cannot show it twice.
  function normalizeCompanions(list) {
    var out = [], seen = {};
    (Array.isArray(list) ? list : []).forEach(function (c) {
      var n = normalizeCompanion(c);
      if (!n) return;
      if (!n.id) n.id = mintId(out.concat((list || []).filter(Boolean)));
      if (seen[n.id]) return;
      seen[n.id] = 1;
      out.push(n);
    });
    return out;
  }

  // ── the writer's three edits, each returning a NEW array (the sheet writer saves it as `{ companions }`) ──
  // `fields` carries ref XOR own plus any of name/young/mount; the rest default.
  function addCompanion(list, fields) {
    var cur = normalizeCompanions(list);
    var row = normalizeCompanion(Object.assign({}, fields, { id: mintId(cur) }));
    if (!row) throw new Error('companions.add: exactly one of ref/own is required');
    return cur.concat([row]);
  }
  function updateCompanion(list, id, patch) {
    return normalizeCompanions(list).map(function (c) {
      if (c.id !== id) return c;
      var next = normalizeCompanion(Object.assign({}, c, patch, { id: c.id }));
      return next || c;
    });
  }
  function removeCompanion(list, id) {
    return normalizeCompanions(list).filter(function (c) { return c.id !== id; });
  }

  // ── reading a profile's numbers ──
  var SIL_RE = /^\s*silhouette\s+(\d+)\s*$/i;
  function abilityName(a) { return (a && typeof a === 'object') ? String(a.name || '') : String(a || ''); }
  // The silhouette a profile STATES, or null (the library prints it as an ability, "Silhouette 0").
  function statedSilhouette(record) {
    var abs = (record && record.abilities) || [];
    for (var i = 0; i < abs.length; i++) {
      var m = SIL_RE.exec(abilityName(abs[i]));
      if (m) return Number(m[1]);
    }
    return null;
  }
  // 1 unless stated: the default the library's own "Silhouette N" ability text ("a smaller or larger silhouette than
  // normal for their species") departs from.
  function silhouetteOf(record) { var s = statedSilhouette(record); return s == null ? 1 : s; }
  function isFlyer(record) {
    return ((record && record.abilities) || []).some(function (a) { return /^\s*fly(er|ing)\s*$/i.test(abilityName(a)); });
  }
  function setSilhouette(record, n) {
    var abs = (record.abilities || []).slice(), done = false;
    for (var i = 0; i < abs.length; i++) {
      if (SIL_RE.test(abilityName(abs[i]))) {
        abs[i] = (abs[i] && typeof abs[i] === 'object')
          ? Object.assign({}, abs[i], { name: 'Silhouette ' + n }) : 'Silhouette ' + n;
        done = true;
        break;
      }
    }
    if (!done) abs.push({ name: 'Silhouette ' + n });
    record.abilities = abs;
  }
  function halfUp(n) { return Math.ceil(n / 2); }

  // ── YOUNG (FaD Core p.415) ── `opts.weaponsById` resolves a weapon the profile names by id, so its damage halves
  // too (the copy is inline on the returned record only). Returns { record, because }.
  function youngOf(record, opts) {
    var rec = clone(record) || {};
    var because = [];
    var byId = (opts && opts.weaponsById) || null;
    var silFrom = silhouetteOf(rec), silTo = Math.max(0, silFrom - 1);
    if (silTo !== silFrom || statedSilhouette(rec) == null) setSilhouette(rec, silTo);
    because.push({ field: 'silhouette', from: silFrom, to: silTo, source: 'young' });
    rec.derived = Object.assign({}, rec.derived);
    if (typeof rec.derived.wounds === 'number') {
      var w = rec.derived.wounds;
      rec.derived.wounds = halfUp(w);
      because.push({ field: 'wounds', from: w, to: rec.derived.wounds, source: 'young' });
    }
    if (typeof rec.derived.strain === 'number') {
      var s = rec.derived.strain;
      rec.derived.strain = halfUp(s);
      because.push({ field: 'strain', from: s, to: rec.derived.strain, source: 'young' });
    }
    var brawn = Number((rec.characteristics || {}).brawn) || 0;
    rec.weapons = (rec.weapons || []).map(function (w0) {
      var w = w0;
      if (typeof w === 'string') {
        if (!byId || !byId[w]) return w0;          // unresolvable here: drawn as the library draws it
        w = byId[w];
      }
      var d = w && w.damage;
      if (!d || typeof d.value !== 'number') return w0;
      var total = d.base === 'brawn' ? brawn + d.value : d.value;
      var out = Object.assign({}, clone(w), { damage: { value: halfUp(total), base: 'flat' } });
      because.push({ field: 'weapon', name: w.name || null, from: total, to: halfUp(total), source: 'young' });
      return out;
    });
    return { record: rec, because: because };
  }

  // ── MOUNT (Stay on Target pp.80-81; Savage Spirits pp.71-72) ── pure numbers, never written onto the record.
  function mountOf(record, trained) {
    var ch = (record && record.characteristics) || {};
    var ag = Number(ch.agility) || 0, will = Number(ch.willpower) || 0;
    var stated = statedSilhouette(record);
    var sil = stated == null ? 2 : stated;
    var flyer = isFlyer(record);
    var out = {
      silhouette: sil,
      speed: flyer ? ag : Math.ceil(ag / 2),
      handling: ag - sil - will,
      trained: Math.min(MAX_TRAINED, count(trained)),
    };
    if (flyer) { out.flying = true; out.groundSpeed = 1; }
    return out;
  }

  // ── A CRAFTED DROID (ruling release-r6-companions-c0 Q4 (a), R-R6CC-4/5; release-r4-shapes ADDENDUM 5) ──
  // A crafted `own` is THIN: the recipe, never its numbers. Told apart from a hand-made record by `_provenance`.
  //   own: { _provenance: 'crafted', template_id, built_with[], directive_id|null, programmed_with[], picks{}, traits[],
  //          craft_id }
  // picks: '<row id>#<n>' (the n-th purchase, 1-based) → { characteristic } | { skill } | { sign } | { talent } |
  //        { cybernetic } | { trait_id } | { text, polarity, by }; plus `directive: { skills: [...] }` for the directive
  //        template's own skill picks, in order.
  function isCrafted(own) { return !!own && own._provenance === 'crafted'; }
  function idList(v) { return Array.isArray(v) ? v.filter(function (x) { return typeof x === 'string' && x; }) : []; }
  function normalizeCraftedOwn(own) {
    return keep(own, {
      _provenance: 'crafted',
      template_id: typeof own.template_id === 'string' ? own.template_id : null,
      built_with: idList(own.built_with),
      directive_id: (typeof own.directive_id === 'string' && own.directive_id) ? own.directive_id : null,
      programmed_with: idList(own.programmed_with),
      picks: (own.picks && typeof own.picks === 'object' && !Array.isArray(own.picks)) ? own.picks : {},
      traits: Array.isArray(own.traits) ? own.traits.slice() : [],
      craft_id: typeof own.craft_id === 'string' ? own.craft_id : null,
    });
  }

  // THE ONE DROID RESOLVER (R-R6CC-4; rider 2: here, because both hosts load the companion stat block and the GM loads
  // no craftStore — craftStore calls it). The NPC record a crafted `own` resolves to, at render, in this order:
  //   1. the chassis template's result_profile;
  //   2. `built_with`, in purchase order, the n-th purchase of a row reading picks['<row>#<n>'];
  //   3. Elimination (`becomes_nemesis`): the tier becomes nemesis BEFORE the directive's skills land;
  //   4. the directive's skills and talents; its `skill_picks` read picks.directive.skills in order;
  //   5. `programmed_with`, as `built_with`;
  //   6. a droid made a nemesis by its directive gets a strain threshold = its RESOLVED wound threshold (D3); a chassis
  //      that is already a nemesis keeps its own (the directive's nemesis step is for a chassis not already one, SM printed 82);
  //   7. traits: the trait_add picks, then `own.traits`.
  // THE MINION RULE (R-R6CC-2, encoded here, not as a row field): on a minion every skill lands as a GROUP skill
  // `{skill_ref}` with no rank, and a rank-raising row is not applied. A persistent text row prints as an ability
  // `{name, description: row.effect}`; a told row lands nothing and is listed in `unapplied`. The max_value limit is NOT
  // read here (the one limitOf refuses the purchase, rider 1).
  // `reg`: { templates: {id → template}, spend: crafting_spend.json, cybernetics?: {id → record} }.
  // → the npcs.json record shape { name, tier, characteristics, derived, skills, talents, weapons, abilities } plus
  //   `traits`, `because` [{field, from, to, source}], `unapplied` [{id, reason}], `unresolved` [id]. GRACEFUL (C-J3).
  var DROID_CATEGORIES = ['droid_chassis', 'droid_directive'];
  var DEFENSE_FIELD = { melee: 'melee_defense', ranged: 'ranged_defense' };
  function droidRows(reg) {
    var out = {}, spend = (reg && reg.spend && reg.spend.spend) || {};
    DROID_CATEGORIES.forEach(function (cat) {
      var b = spend[cat] || {};
      (b.improvements || []).concat(b.flaws || []).forEach(function (r) { if (r && r.id) out[r.id] = r; });
    });
    return out;
  }
  function findSkill(rec, id) {
    for (var i = 0; i < rec.skills.length; i++) if (rec.skills[i] && rec.skills[i].skill_ref === id) return rec.skills[i];
    return null;
  }
  function findTalent(rec, id) {
    for (var i = 0; i < rec.talents.length; i++) if (rec.talents[i] && rec.talents[i].talent_ref === id) return rec.talents[i];
    return null;
  }
  // A skill lands: a minion's as a group skill (no rank); otherwise at `rank`, an owned skill rising to it if lower.
  function landSkill(rec, id, rank, source, because) {
    var cur = findSkill(rec, id);
    if (rec.tier === 'minion') {
      if (!cur) { rec.skills.push({ skill_ref: id }); because.push({ field: 'skill:' + id, from: null, to: 'group', source: source }); }
      return;
    }
    var from = cur ? (Number(cur.rank) || 0) : null;
    if (cur) { if ((Number(cur.rank) || 0) < rank) cur.rank = rank; }
    else rec.skills.push({ skill_ref: id, rank: rank });
    because.push({ field: 'skill:' + id, from: from, to: Math.max(from || 0, rank), source: source });
  }
  function landTalent(rec, id, rank, source, because) {
    var cur = findTalent(rec, id), from = cur ? (Number(cur.rank) || 0) : null;
    if (cur) cur.rank = (Number(cur.rank) || 0) + rank;
    else rec.talents.push({ talent_ref: id, rank: rank });
    because.push({ field: 'talent:' + id, from: from, to: (from || 0) + rank, source: source });
  }
  // One purchase of a droid row onto `rec`. `pick` is that purchase's stored pick (or undefined).
  function applyDroidRow(rec, row, pick, ctx) {
    var src = row.name || row.id;
    if (!Array.isArray(row.droid_effects)) {
      if (row.flags && row.flags.persistent && !row.flags.schematic) rec.abilities.push({ name: row.name, description: row.effect });
      else ctx.unapplied.push({ id: row.id, reason: (row.told && row.told.reason) || '' });
      return;
    }
    row.droid_effects.forEach(function (fx) {
      var op = fx.op, amt = Number(fx.amount) || 0, d = rec.derived, f, from;
      function needPick(key) {
        if (pick && pick[key] != null) return pick[key];
        ctx.unapplied.push({ id: row.id, reason: 'no ' + key + ' chosen' });
        return null;
      }
      if (op === 'wound_threshold_delta' || op === 'soak_delta') {
        f = op === 'soak_delta' ? 'soak' : 'wounds';
        from = Number(d[f]) || 0; d[f] = from + amt;
        ctx.because.push({ field: f, from: from, to: d[f], source: src });
      } else if (op === 'defense_delta') {
        f = DEFENSE_FIELD[fx.target];
        from = Number(d[f]) || 0; d[f] = from + amt;
        ctx.because.push({ field: f, from: from, to: d[f], source: src });
      } else if (op === 'characteristic_delta') {
        var ch = needPick('characteristic');
        if (ch == null) return;
        from = Number(rec.characteristics[ch]) || 0;
        rec.characteristics[ch] = fx.max != null ? Math.min(fx.max, from + amt) : from + amt;
        ctx.because.push({ field: ch, from: from, to: rec.characteristics[ch], source: src });
      } else if (op === 'silhouette_delta') {
        var sign = needPick('sign');
        if (sign == null) return;
        from = silhouetteOf(rec);
        var to = Math.max(fx.floor != null ? fx.floor : 0, from + (sign < 0 ? -1 : 1) * (amt || 1));
        setSilhouette(rec, to);
        ctx.because.push({ field: 'silhouette', from: from, to: to, source: src });
      } else if (op === 'skill_add') {
        var sk = needPick('skill');
        if (sk == null) return;
        if (findSkill(rec, sk)) { ctx.unapplied.push({ id: row.id, reason: 'already has ' + sk }); return; }
        landSkill(rec, sk, Number(fx.rank) || 1, src, ctx.because);
      } else if (op === 'skill_rank_delta') {
        if (rec.tier === 'minion') { ctx.unapplied.push({ id: row.id, reason: 'not on a minion' }); return; }
        var sr = needPick('skill');
        if (sr == null) return;
        var s = findSkill(rec, sr);
        if (!s) { ctx.unapplied.push({ id: row.id, reason: 'has no ' + sr }); return; }
        from = Number(s.rank) || 0; s.rank = from + amt;
        ctx.because.push({ field: 'skill:' + sr, from: from, to: s.rank, source: src });
      } else if (op === 'talent_add') {
        landTalent(rec, fx.talent, Number(fx.rank) || 1, src, ctx.because);
      } else if (op === 'talent_rank_delta') {
        var tl = needPick('talent');
        if (tl == null) return;
        if (!findTalent(rec, tl)) { ctx.unapplied.push({ id: row.id, reason: 'has no ' + tl }); return; }
        landTalent(rec, tl, amt, src, ctx.because);
      } else if (op === 'cybernetic_add') {
        // D-365 (ruling release-r6-companions-d365 R-R6CD-1, ADDENDA 1–2): the picked implant is named on the stat block and
        // its own page-cited `character_effects` apply (applyImplant); its dice (`pool_mods`) are told on that line.
        var cy = needPick('cybernetic');
        if (cy == null) return;
        var cyRec = ctx.cybernetics && ctx.cybernetics[cy];
        if (!cyRec) { ctx.unapplied.push({ id: row.id, reason: 'no implant ' + cy }); rec.abilities.push({ name: cy, description: row.name }); return; }
        rec.abilities.push({ name: cyRec.name || cy, description: implantDiceWords(cyRec) || row.name });
        applyImplant(rec, cyRec, row.id, ctx);
      } else if (op === 'trait_add') {
        var tp = pick && (pick.trait_id || pick.text) ? pick : null;
        if (!tp) { ctx.unapplied.push({ id: row.id, reason: 'no trait chosen' }); return; }
        ctx.traits.push(tp.trait_id ? { trait_id: tp.trait_id }
          : { text: String(tp.text), polarity: tp.polarity || fx.polarity, by: tp.by || null, secret: fx.how === 'secret' || undefined });
      } else {
        ctx.unapplied.push({ id: row.id, reason: 'unknown op ' + op });
      }
    });
  }
  // A picked implant's dice, told in the page's own words: each `pool_mods` row's source line (`from`, a base_mods index).
  function implantDiceWords(cyRec) {
    var seen = {}, out = [];
    (Array.isArray(cyRec.pool_mods) ? cyRec.pool_mods : []).forEach(function (pm) {
      var i = pm && pm.from && pm.from.channel === 'base_mods' ? pm.from.index : null;
      var S = root && root.SWRPGSources;   // R-AE-10: the public copy's label where the scan blanked the line
      var line = i != null && cyRec.base_mods && cyRec.base_mods[i] && (S && S.modWords ? S.modWords(cyRec, 'base_mods', i) : cyRec.base_mods[i].description);
      if (line && !seen[i]) { seen[i] = 1; out.push(String(line).trim()); }
    });
    return out.join(' ');
  }
  // THE IMPLANT'S LINES ON A DROID (R-R6CD-1 + ADDENDUM 1; gear.json `character_effects`, `$defs/cybernetic_effect`), each
  // with the item line's meaning and its `because` naming the implant. No clamp (droidOf clamps nothing; the limit is the
  // purchase's). A skill delta raises the skill, or lands it at that rank (a minion: a group skill, R-R6CC-2); a talent op
  // as the droid's own talent ops; a line the stat block has no field for is named in `unapplied`.
  function applyImplant(rec, cyRec, rowId, ctx) {
    var src = cyRec.name || cyRec.id, d = rec.derived;
    (Array.isArray(cyRec.character_effects) ? cyRec.character_effects : []).forEach(function (ce) {
      var op = ce && ce.op, v = Number(ce && ce.value) || 0, k = ce && ce.key, f, from;
      function bump(field, obj) { from = Number(obj[field]) || 0; obj[field] = from + v; ctx.because.push({ field: field, from: from, to: obj[field], source: src }); }
      if (op === 'talent_add') landTalent(rec, k, v || 1, src, ctx.because);
      else if (op === 'talent_rank_delta') {
        if (!findTalent(rec, k)) { ctx.unapplied.push({ id: rowId, reason: src + ': has no ' + k }); return; }
        landTalent(rec, k, v, src, ctx.because);
      } else if (op === 'soak_delta') bump('soak', d);
      else if (op === 'wound_threshold_delta') bump('wounds', d);
      else if (op === 'strain_threshold_delta') {
        if (d.strain == null) { ctx.unapplied.push({ id: rowId, reason: src + ': has no strain threshold' }); return; }
        bump('strain', d);
      } else if (op === 'defense_delta') {
        f = DEFENSE_FIELD[k];
        if (!f) { ctx.unapplied.push({ id: rowId, reason: src + ': defence ' + k }); return; }
        bump(f, d);
      } else if (op === 'characteristic_delta') {
        if (!(k in rec.characteristics)) { ctx.unapplied.push({ id: rowId, reason: src + ': no characteristic ' + k }); return; }
        bump(k, rec.characteristics);
      } else if (op === 'skill_rank_delta') {
        var s = findSkill(rec, k);
        if (!s || rec.tier === 'minion') { if (!s) landSkill(rec, k, v, src, ctx.because); return; }
        from = Number(s.rank) || 0; s.rank = from + v;
        ctx.because.push({ field: 'skill:' + k, from: from, to: s.rank, source: src });
      } else ctx.unapplied.push({ id: rowId, reason: src + ': ' + (op === 'encumbrance_threshold_delta' ? 'a stat block has no encumbrance threshold' : 'unknown op ' + op) });
    });
  }
  // The `reg.cybernetics` droidOf reads: the gear registry's `type: "Cybernetics"` records by id ({id → record} or a list).
  function cyberneticsOf(gear) {
    var out = {};
    (Array.isArray(gear) ? gear : Object.keys(gear || {}).map(function (k) { return gear[k]; })).forEach(function (r) {
      if (r && r.id && r.type === 'Cybernetics') out[r.id] = r;
    });
    return out;
  }
  function applyPurchases(rec, ids, rows, picks, ctx) {
    var seen = {};
    ids.forEach(function (id) {
      var row = rows[id];
      seen[id] = (seen[id] || 0) + 1;
      if (!row) { ctx.unresolved.push(id); return; }
      applyDroidRow(rec, row, picks[id + '#' + seen[id]], ctx);
    });
  }
  function droidOf(own, reg) {
    var o = normalizeCraftedOwn(own || {});
    var tpls = (reg && reg.templates) || {};
    var chassis = o.template_id && tpls[o.template_id];
    var ctx = { because: [], unapplied: [], unresolved: [], traits: [], cybernetics: reg && reg.cybernetics };
    if (!chassis || !chassis.result_profile) {
      return { name: '', tier: null, missing: true, traits: [], because: [], unapplied: [], unresolved: [o.template_id] };
    }
    var rp = clone(chassis.result_profile);
    var rec = {
      name: rp.name || chassis.name || '',
      tier: rp.tier || 'minion',
      characteristics: Object.assign({}, rp.characteristics),
      derived: Object.assign({}, rp.derived),
      skills: (rp.skills || []).slice(),
      talents: (rp.talents || []).slice(),
      weapons: (rp.weapons || []).slice(),
      abilities: (rp.abilities || []).slice(),
    };
    var rows = droidRows(reg);
    applyPurchases(rec, o.built_with, rows, o.picks, ctx);
    var dir = o.directive_id ? tpls[o.directive_id] : null;
    var madeNemesis = false;
    if (o.directive_id && !(dir && dir.result_profile)) ctx.unresolved.push(o.directive_id);
    if (dir && dir.result_profile) {
      var dp = dir.result_profile, dsrc = dir.name || dir.id;
      if (dp.becomes_nemesis && rec.tier !== 'nemesis') {
        ctx.because.push({ field: 'tier', from: rec.tier, to: 'nemesis', source: dsrc });
        rec.tier = 'nemesis';
        madeNemesis = true;
      }
      (dp.skills || []).forEach(function (s) { landSkill(rec, s.skill_ref, Number(s.rank) || 1, dsrc, ctx.because); });
      var chosen = ((o.picks.directive && o.picks.directive.skills) || []).slice(), at = 0;
      (dp.skill_picks || []).forEach(function (sp) {
        for (var k = 0; k < (Number(sp.count) || 0); k++) {
          var id = chosen[at++];
          if (!id) { ctx.unapplied.push({ id: dir.id, reason: 'no ' + sp.group + ' skill chosen' }); continue; }
          landSkill(rec, id, Number(sp.rank) || 1, dsrc, ctx.because);
        }
      });
      (dp.talents || []).forEach(function (t) { landTalent(rec, t.talent_ref, Number(t.rank) || 1, dsrc, ctx.because); });
    }
    applyPurchases(rec, o.programmed_with, rows, o.picks, ctx);
    if (madeNemesis) {
      var st = rec.derived.strain;
      rec.derived.strain = Number(rec.derived.wounds) || 0;
      ctx.because.push({ field: 'strain', from: st == null ? null : st, to: rec.derived.strain, source: dir.name || dir.id });
    }
    rec.traits = ctx.traits.concat(o.traits);
    rec.because = ctx.because;
    rec.unapplied = ctx.unapplied;
    rec.unresolved = ctx.unresolved;
    return rec;
  }

  // ── THE ONE RESOLVER: a stored row → the record the library's stat block draws ──
  // `npcs` is the canonical registry's `npcs` map (id → record). A `ref` that no longer resolves returns
  // { missing: true } with the row's own name: GRACEFUL at render (C-J3), the row is never stripped.
  // A crafted `own` resolves through droidOf with `opts.droid` (its registries); without them it reads as missing.
  function profileOf(row, npcs, opts) {
    var c = normalizeCompanion(row);
    if (!c) return null;
    var base = c.ref ? (npcs && npcs[c.ref]) || null : c.own, droidWhy = [], droidExtra = null;
    if (base && isCrafted(base)) {
      var d = droidOf(base, opts && opts.droid);
      if (d.missing) base = null;
      else {
        droidWhy = d.because;
        droidExtra = { traits: d.traits, unapplied: d.unapplied, unresolved: d.unresolved };
        base = d;
        delete base.because; delete base.traits; delete base.unapplied; delete base.unresolved;
      }
    }
    if (!base) return { id: c.id, name: c.name || c.ref, missing: true, because: [] };
    var r = c.young ? youngOf(base, opts) : { record: clone(base), because: [] };
    if (droidWhy.length) r.because = droidWhy.concat(r.because);
    var out = {
      id: c.id,
      name: c.name || base.name || '',
      creature: base.name || '',
      tier: base.tier || null,
      record: r.record,
      because: r.because,
      young: c.young,
      wounds: c.wounds, strain: c.strain, crits: c.crits,
    };
    if (c.mount) out.mount = mountOf(r.record, c.mount.trained);
    if (droidExtra) out.droid = droidExtra;
    return out;
  }

  // ── `_ogg.mapped` (ruling release-r6-companions-npcs Q2 (a), C1, C2) ──
  // The hash over EVERYTHING the OggDude export's rebuild path reads for one companion: the resolved record
  // (profileOf's `record`) and the row's name, young and mount. textHash (the one span hash) of the sorted-key JSON,
  // written to match Python's json.dumps(sort_keys=True, separators=(',', ':'), ensure_ascii=False); the Python export
  // twin computes the same (scripts/ogg_export.py, test/release_r6_ogg_npcs.cjs). The live track is outside it.
  function stableJson(v) {
    if (v === undefined) return 'null';
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(stableJson).join(',') + ']';
    return '{' + Object.keys(v).filter(function (k) { return v[k] !== undefined; }).sort()
      .map(function (k) { return JSON.stringify(k) + ':' + stableJson(v[k]); }).join(',') + '}';
  }
  function textHashCore() {
    if (typeof module !== 'undefined' && module.exports) return require('./textHash.js');
    return root && root.SWRPGTextHash;
  }
  function oggMapped(record, row) {
    var r = row || {};
    return textHashCore().textHash(stableJson({ record: record || null, name: typeof r.name === 'string' ? r.name : '',
      young: r.young === true, mount: r.mount || null }));
  }

  var api = {
    MAX_TRAINED: MAX_TRAINED,
    stableJson: stableJson,
    oggMapped: oggMapped,
    normalizeCompanion: normalizeCompanion,
    normalizeCompanions: normalizeCompanions,
    addCompanion: addCompanion,
    updateCompanion: updateCompanion,
    removeCompanion: removeCompanion,
    mintId: mintId,
    statedSilhouette: statedSilhouette,
    silhouetteOf: silhouetteOf,
    youngOf: youngOf,
    mountOf: mountOf,
    profileOf: profileOf,
    isCrafted: isCrafted,
    normalizeCraftedOwn: normalizeCraftedOwn,
    droidOf: droidOf, cyberneticsOf: cyberneticsOf,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SWRPGCompanions = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
