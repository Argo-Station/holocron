/* lib/shared/packAttach.js — HOMEBREW H1: adding a homebrew collection to a character that already exists; HOMEBREW H2:
 * removing one, the held sheet's way out, and swapping in this device's My Data (window.SWRPGPackAttach). HOMEBREW's
 * module (card `homebrew-h1-build-card` R-H1B-5); the contract is
 * `homebrew-h1-contract` R-H1K-1..15, the approved frames Docs/mockups/homebrew-h1.html @ 813f0578 (D-110). H2's acts are
 * modes of the same attachPlan (card `homebrew-h2-build-card` R-H2B-3; contract `homebrew-h2-contract` R-H2K-1..10; frames
 * Docs/mockups/homebrew-h2.html @ f12904390, D-118): 'detach', 'missing', 'replace'. Their guard is CharResolve.sheetHold on
 * the after-state (R-H2F-3), and a removed specialization keeps its bought talents through talentsKeepingAbsentTrees (R-H2F-1).
 *
 * PURE. It writes nothing and reads only F-100's exports, handed in as `env` (envFromWindow() in a page):
 *   UD  SWRPGUserData — list() rows (the candidates, R-H1K-13), missingFor (resolvable here, F-2), stampSync (a
 *       layer's records and name)
 *   M   SWRPGMods — parseUserStamp, isUserStamp, orderLayers (placement, R-H1K-2)
 *   CR  CharResolve — stampTalentView, computeDerived, derivedFloorHeld (R-FHW-3), sheetHold; H2: resolveSheetSpecs,
 *       talentsKeepingAbsentTrees (R-H2F-1)
 *   PD  SWRPGProjectionDiff — diff, attributeTalents (talents and numbers, R-H1K-4 (c))
 *   SP  SWRPGSheetPool — resolveSheetEquipment (items before and after, R-H1K-4 (a); B-1185's, read only, R-H1B-7)
 *   IR  SWRPGItemRegistries — forStampSync (the records' stats)
 *   base  window._canonicalCharbuildBase (the pristine charbuild the stamp view folds over)
 *   tellApart  SWRPGEditorView.SYNC_LINES.tellApart, or null until the editor's view.js has loaded (R-FHW-2)
 *   signedIn  SWRPGAccount.state().user — H2's cross-device line (J1 (A), R-H2K-7)
 *
 * THE PREVIEW IS THE WRITE (R-H1K-4): attachPlan() returns the would-be `mods`, the preview's changes, and the
 * copies; patchFor() turns that and the player's ticks into the ONE patch the app hands onSheetChange. Nothing is
 * stored but `sheet.mods`, the three re-projected fields and the ticked swaps (R-H1K-1: no new save shape). Undo is
 * the caller's memory (undoFor / restore).
 */
(function (root) {
  'use strict';

  // ── THE WORDS (the approved frames' COPY, verbatim; R-H1B-3's held line) ──
  var W = {
    line: 'Homebrew:', none: 'none', add: '+ Add homebrew', update: 'Update available',
    already: 'Already on this character', otherMy: 'This character uses your other My Data',
    noneHere: 'No homebrew on this device yet. Make some in Homebrew.', noneHereLink: 'Homebrew',
    pickHead: 'Add homebrew', close: 'Close', imported: 'imported',
    titleAdd: function (c, n) { return 'Add ' + c + ' to ' + n + '?'; },
    titleUpdate: function (c, n) { return 'Update ' + c + ' on ' + n + '?'; },
    version: function (a, b) { return 'version ' + a + ' → ' + b; },
    sChanges: 'Changes', sCopies: 'Saved copies', sTalents: 'Talents and numbers',
    copyQ: function (i) { return i + ' (copy) — use the collection’s version?'; },
    copyCmp: function (a, b) { return 'Copy: ' + a + ' · Collection: ' + b; },
    copySame: 'Copy and collection match',
    tree: function (s, k) { return 'Your ' + s + ' tree changes: ' + k + ' ' + (k === 1 ? 'talent is' : 'talents are') + ' different'; },
    held: function (q, held, c, computed) { return q + ' stays ' + held + '. With ' + c + ' it would be ' + computed + ', but this character’s older saved number holds it.'; },
    // ruling homebrew-h2-build-readings R-H2R-3: a removal's held line says "Without" (detach: the collection; the way out:
    // the missing homebrew); attach, update and replace keep R-H1B-3's "With"
    heldWithout: function (q, held, c, computed) { return q + ' stays ' + held + '. Without ' + c + ' it would be ' + computed + ', but this character’s older saved number holds it.'; },
    theMissing: 'the missing homebrew',
    btnAdd: 'Add', btnUpdate: 'Update', btnCancel: 'Cancel',
    added: function (c) { return c + ' added.'; }, updated: function (c) { return c + ' updated.'; }, undo: 'Undo',
    offer: 'Your homebrew isn’t on this character yet.', offerAdd: 'Add homebrew', offerNot: 'Not now',
    // HOMEBREW H2 (contract R-H2K-3..8, frames R-H2F-1/-4/-7, D-118 J1 (A) J2 (A)): the approved frames' COPY, verbatim
    menuRemove: function (n) { return 'Remove from ' + n; }, removeMissing: 'Remove missing homebrew', useInstead: 'Use this one instead',
    titleRemove: function (c, n) { return 'Remove ' + c + ' from ' + n + '?'; },
    titleMissing: function (n) { return 'Remove the missing homebrew from ' + n + '?'; },
    titleReplace: function (n) { return 'Use this My Data on ' + n + ' instead?'; },
    sUnknown: 'Shows as unknown',
    unknown: function (i) { return i + ' — shows as unknown'; }, nothing: function (t) { return t + ' — does nothing now'; },
    specGone: function (s) { return s + ' — specialization goes away; talents bought in it stay.'; },
    specGoneN: function (k) { return k === 1 ? '1 specialization goes away; talents bought in it stay.' : k + ' specializations go away; talents bought in them stay.'; },
    changeNew: function (a, b, d) { return a + ' — this My Data’s ' + b + ': ' + d; },
    cross: function (n) { return 'This changes ' + n + ' on every device you’re signed in on.'; },
    nMissing: function (k) { return k === 1 ? '1 homebrew collection that isn’t on this device' : k + ' homebrew collections that aren’t on this device'; },
    nUnknown: function (k) { return k === 1 ? '1 item stays unknown' : k + ' items stay unknown'; },
    nNothing: function (k) { return k === 1 ? '1 talent does nothing now' : k + ' talents do nothing now'; },
    // B-1203 (D-411 items 7–9, the talent row's wording per kind, as page v1 @ 291c0128b drew it): F6 names, F7 counts
    lostSpecies: function (s) { return s + ' — its abilities do nothing now'; },
    lostCareer: function (c) { return c + ' — its career skills cost as non-career skills now'; },
    nLostPower: function (k) { return k === 1 ? '1 Force power does nothing now' : k + ' Force powers do nothing now'; },
    nLostSpecies: 'The species’ abilities do nothing now', nLostCareer: 'The career’s career skills cost as non-career skills now',
    buying: 'Buying works again.', btnRemove: 'Remove',
    removed: function (c) { return c + ' removed.'; }, nowUses: 'Now uses this My Data.', missingRemoved: 'Missing homebrew removed.',
    refusePresent: function (c, n, k, r) { return c + ' gives ' + n + '’s ' + k + ' ' + r + ', so it can’t be removed yet.'; },
    refuseMissing: function (n, k, r) { return n + '’s ' + k + (r ? ' ' + r : '') + ' comes from homebrew that isn’t on this device, so it can’t be removed yet.'; },
  };
  // the kinds C5.2 releases that H2's preview names by kind (B-1203, D-411 items 7–9; R-M9B-14's refusal retired)
  var RELEASED_KINDS = ['species', 'career', 'force power'];
  // sheetHold's ref kinds in the refusal's words (R-H2F-3)
  var KIND_WORD = { 'force power': 'Force power', species: 'species', career: 'career', talent: 'talent', specialization: 'specialization' };
  var H2_MODES = ['detach', 'missing', 'replace'];
  // the editor's own kind words (lib/editor/view.jsx KIND), in the list's count order
  var KIND = { weapons: ['weapon', 'weapons'], armor: ['armor', 'armor'], gear: ['gear', 'gear'], talents: ['talent', 'talents'],
               specializations: ['specialization', 'specializations'], force_powers: ['force power', 'force powers'],
               species: ['species', 'species'], careers: ['career', 'careers'] };
  var KIND_ORDER = ['weapons', 'armor', 'gear', 'talents', 'specializations', 'force_powers', 'species', 'careers'];
  var STAT = { weapons: ['damage', 'crit', 'range', 'encumbrance', 'price'], armor: ['soak', 'defense', 'encumbrance', 'price'], gear: ['encumbrance', 'price'] };
  var NUM = [['woundThreshold', 'wound threshold'], ['strainThreshold', 'strain threshold'], ['soak', 'soak'],
             ['meleeDefense', 'melee defense'], ['rangedDefense', 'ranged defense'], ['forceRating', 'Force rating']];
  var HELD = [['woundThreshold', 'Wound threshold'], ['strainThreshold', 'Strain threshold'], ['forceRating', 'Force rating']];

  function own(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
  function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  // B-1429: a Brawn damage is labelled by ItemResolve.brawnDamageText (the one signed label), read at call time
  function itemResolve() { return (root && root.ItemResolve) || (typeof require === 'function' ? require('./itemResolve.js') : null); }
  function fmt(v) { return (v && typeof v === 'object' && 'value' in v) ? (v.base === 'brawn' ? itemResolve().brawnDamageText(v.value) : String(v.value)) : String(v); }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  function envFromWindow() {
    var w = root || {};
    var EV = w.SWRPGEditorView, SL = EV && EV.SYNC_LINES, AC = w.SWRPGAccount;
    var st = (AC && typeof AC.state === 'function') ? AC.state() : null;
    return { UD: w.SWRPGUserData, M: w.SWRPGMods, CR: w.CharResolve, PD: w.SWRPGProjectionDiff, SP: w.SWRPGSheetPool,
             IR: w.SWRPGItemRegistries, base: w._canonicalCharbuildBase, tellApart: (SL && typeof SL.tellApart === 'function') ? SL.tellApart : null,
             signedIn: !!(st && st.user) };   // J1 (A), R-H2K-7: the cross-device line iff signed in
  }

  function userStamps(sheet, env) { return (Array.isArray(sheet && sheet.mods) ? sheet.mods : []).filter(function (s) { return env.M.isUserStamp(s); }); }
  function resolvable(stamp, env) { return env.UD.missingFor([stamp]).length === 0; }
  // rank from the stamp alone (R-H1K-2): imported 0, own 1, packId my_data 2
  function rankOf(stamp, env) { var p = env.M.parseUserStamp(stamp); return !p ? -1 : p.version ? 0 : (p.packId === 'my_data' ? 2 : 1); }
  // the list() row a stamp names: its own, or (an imported pin, maybe older) the current import of its packId
  function rowFor(stamp, rows, env) {
    var p = env.M.parseUserStamp(stamp); if (!p) return null;
    return rows.filter(function (r) { return r.stamp === stamp || (p.version && r.origin === 'imported' && r.packId === p.packId); })[0] || null;
  }
  function nameOf(stamp, rows, env) {
    var r = rowFor(stamp, rows, env); if (r && r.name) return r.name;
    var a = env.UD.stampSync(stamp); if (a && a.name) return a.name;   // known only through sync (R-H1K-12 (a))
    var p = env.M.parseUserStamp(stamp); return p ? p.packId : stamp;
  }
  function sectionsOf(stamp, env) {
    var a = env.UD.stampSync(stamp), out = {};
    Object.keys((a && a.sections) || {}).forEach(function (k) { var n = Object.keys(a.sections[k] || {}).length; if (n) out[k] = n; });
    return out;
  }
  function countWords(sections) {
    return KIND_ORDER.filter(function (k) { return sections[k]; }).map(function (k) { return sections[k] + ' ' + KIND[k][sections[k] === 1 ? 0 : 1]; }).join(', ');
  }

  // isHeld(sheet, env) — the hold's one predicate (CharResolve.sheetHold), as the growth room reads it
  function isHeld(sheet, env) {
    var mods = Array.isArray(sheet && sheet.mods) ? sheet.mods : [];
    var data = env.CR.stampTalentView(sheet, env.base, env.M, env.UD) || env.base;
    return !!env.CR.sheetHold(sheet, data, env.UD.missingFor(mods), true);
  }

  // lineNames(sheet, env, held) — F1's names: the character's collections in `mods` order; a held sheet names only what
  // this device resolves (R-H1F-3)
  function lineNames(sheet, env, held) {
    var rows = env.UD.list();
    return userStamps(sheet, env).filter(function (s) { return !held || resolvable(s, env); }).map(function (s) { return nameOf(s, rows, env); });
  }
  // lineStamps(sheet, env, held) — the same names with their stamps: J2 (A)'s Remove doors (R-H2B-5), one per name
  function lineStamps(sheet, env, held) {
    var rows = env.UD.list();
    return userStamps(sheet, env).filter(function (s) { return !held || resolvable(s, env); }).map(function (s) { return { stamp: s, name: nameOf(s, rows, env) }; });
  }

  // updates(sheet, env) — R-H1K-6 / R-H1K-12 (a): an imported stamp whose packId this device holds as a CURRENT import at
  // another version. Computed on every open; one collection at a time (the line offers the first).
  function updates(sheet, env) {
    var rows = env.UD.list();
    return userStamps(sheet, env).map(function (s) {
      var p = env.M.parseUserStamp(s); if (!p || !p.version) return null;
      var r = rows.filter(function (x) { return x.origin === 'imported' && x.packId === p.packId && x.version && x.version !== p.version; })[0];
      return r ? { from: s, to: r.stamp, name: r.name || p.packId, fromV: p.version, toV: r.version } : null;
    }).filter(Boolean);
  }

  // refusal(sheet, row, env) — R-H1K-3 / R-H1K-12 (b): null when offered, else the words said in place
  function refusal(carried, row, env) {
    if (carried.indexOf(row.stamp) >= 0) return W.already;
    var hit = carried.some(function (m) { var p = env.M.parseUserStamp(m); return p && p.packId === row.packId; });
    if (!hit) return null;
    return (row.origin === 'own' && row.packId === 'my_data') ? W.otherMy : W.already;   // same packId, another instance or version: H2's REPLACE
  }

  // candidates(sheet, env) — F1's list: every collection on this device with records (R-H1F-2), resolvable here (F-2),
  // its refusal in place, told apart from a same-named one by the ONE helper (R-H1K-14, R-FHW-2)
  function candidates(sheet, env) {
    var carried = userStamps(sheet, env);
    var rows = env.UD.list().filter(function (r) { return r && r.records > 0 && resolvable(r.stamp, env); });
    return rows.map(function (r) {
      var counts = countWords(sectionsOf(r.stamp, env));
      var meta = [r.origin === 'imported' ? W.imported : null, counts || null].filter(Boolean).join(' · ');
      return { ck: r.ck, stamp: r.stamp, packId: r.packId, name: r.name || r.packId, origin: r.origin, active: r.active === true,
               meta: meta, tell: env.tellApart ? env.tellApart(r, rows) : [], refuse: refusal(carried, r, env) };
    });
  }

  // offerFor(sheet, env, seen, held) — J3 (A), R-H1B-4 as corrected by R-H1BP-2: the collections that raise the offer —
  // ACTIVE on this device, offerable, and not yet put away by Not now for this character. Never on a held sheet.
  function offerFor(sheet, env, seen, held) {
    if (held) return [];
    seen = seen || {};
    return candidates(sheet, env).filter(function (c) { return c.active && !c.refuse && !seen[seenKey(sheet, c.ck)]; });
  }
  function seenKey(sheet, ck) { return ((sheet && sheet.name) || '') + '|' + ck; }

  // ── PLACEMENT (R-H1K-2) ──
  function placed(mods, stamp, env, mode) {
    var M = env.M, rows = env.UD.list();
    var ps = M.parseUserStamp(stamp);
    if (mode === 'update') {                     // R-H1K-6: replaced IN ITS SLOT; identity and slot kept
      var i = mods.findIndex(function (m) { var p = M.parseUserStamp(m); return p && p.version && p.packId === ps.packId; });
      var next = mods.slice(); next[i] = stamp; return next;
    }
    var ordOf = function (s) { var r = rowFor(s, rows, env); return r ? rows.indexOf(r) : -1; };
    var r = rankOf(stamp, env), o = ordOf(stamp), at = mods.length;
    for (var j = 0; j < mods.length; j++) {
      if (!M.isUserStamp(mods[j])) continue;    // variants first, untouched
      var rj = rankOf(mods[j], env), oj = ordOf(mods[j]);
      if (rj > r || (rj === r && o !== -1 && oj !== -1 && oj > o)) { at = j; break; }
    }
    return mods.slice(0, at).concat([stamp], mods.slice(at));
  }

  // ── THE ONE BEFORE/AFTER (R-H1K-4; R-H2K-2: every mode goes through it) — both states resolved by the shipped exports ──
  function beforeAfter(sheet, mods, next, env) {
    var CR = env.CR, SP = env.SP, IR = env.IR;
    var S0 = Object.assign({}, sheet, { mods: mods }), S1 = Object.assign({}, sheet, { mods: next }), eq = sheet.equipment || {};
    return { S0: S0, S1: S1, eq: eq, E0: SP.resolveSheetEquipment(eq, S0), E1: SP.resolveSheetEquipment(eq, S1),
             regs0: IR.forStampSync(mods, sheet.own) || {}, regs1: IR.forStampSync(next, sheet.own) || {},
             view0: CR.stampTalentView(S0, env.base, env.M, env.UD), view1: CR.stampTalentView(S1, env.base, env.M, env.UD) };
  }
  // the numbers that move (the shipped derive), and R-H1B-3's held rows — a number the legacy floor then holds (R-FHW-3)
  function numbersOf(ba, patched, env) {
    var CR = env.CR, base = env.base;
    var D0 = CR.computeDerived(ba.S0, ba.E0, base), D1 = CR.computeDerived(patched, ba.E1, base);
    var numbers = NUM.filter(function (n) { return D0[n[0]] !== D1[n[0]]; }).map(function (n) { return { key: n[0], k: n[1], from: D0[n[0]], to: D1[n[0]] }; });
    var H0 = CR.derivedFloorHeld(ba.S0, ba.E0, base), H1 = CR.derivedFloorHeld(patched, ba.E1, base);
    var pre = function (Hx, Dx, k) { return Hx[k] ? Hx[k].computed : Dx[k]; };
    var held = HELD.filter(function (q) { return H1[q[0]] && pre(H0, D0, q[0]) !== pre(H1, D1, q[0]); })
      .map(function (q) { return { key: q[0], q: q[1], computed: H1[q[0]].computed, held: H1[q[0]].held }; });
    return { numbers: numbers, held: held, D0: D0, D1: D1 };
  }
  // the tree lines: each spec the diff names, counting the OWNED positions whose cell talent differs between the views
  function treeSpecs(sheet, d, view0, view1) {
    var cellOf = function (v, sid, pos) {
      var t = v && v.specializations && v.specializations[sid] && v.specializations[sid].talent_tree; var rc = String(pos).split('-');
      var c = t && t[+rc[0]] && t[+rc[0]].talents && t[+rc[0]].talents[+rc[1]]; return c ? c.talent : null;
    };
    return d.specs.map(function (sid) {
      var s = (sheet.specializations || []).filter(function (x) { return x && x.id === sid; })[0] || { owned: [] };
      return { id: sid, name: recName(view1, 'specializations', sid) || sid, n: (s.owned || []).filter(function (pos) { return cellOf(view0, sid, pos) !== cellOf(view1, sid, pos); }).length };
    });
  }
  function recName(view, sec, id) { return ((view && view[sec] && view[sec][id]) || {}).name || null; }
  function mirrorOf(next, rows, env) {   // THE MIRROR: a character created with these collections carries them in layer order
    var M = env.M, userNext = next.filter(M.isUserStamp);
    var created = M.orderLayers(userNext.map(function (s) { return Object.assign({}, rowFor(s, rows, env) || {}, { _s: s }); }), rows.map(function (r) { return r.ck; }))
      .map(function (r) { return r._s; });
    return { created: created, mirror: same(created, userNext) };
  }
  var statLine = function (rec, keys) { return keys.filter(function (k) { return rec[k] !== undefined && rec[k] !== null && rec[k] !== ''; }); };
  var diffs = function (r0, r1, keys) { return keys.filter(function (k) { return !same(r0[k], r1[k]); }).map(function (k) { return { k: k, from: fmt(r0[k]), to: fmt(r1[k]) }; }); };
  var nowStats = function (rec1, sec) {
    return statLine(rec1, STAT[sec]).filter(function (k) { return k !== 'price' && k !== 'encumbrance' && k !== 'range' && !(k === 'defense' && fmt(rec1[k]) === '0'); })
      .map(function (k) { return { k: k, v: fmt(rec1[k]) }; });
  };
  // (b) a saved copy whose id the new layer defines (R-H1K-5) — H1's attach and update, and H2's replace (D-110 J2 (A))
  function copyOf(e, i, sec, lsec, regs1) {
    var cid = e._inline.id;
    var csec = own(lsec.weapons, cid) ? 'weapons' : own(lsec.armor, cid) ? 'armor' : own(lsec.gear, cid) ? 'gear' : null;
    if (!csec || !regs1[csec] || !regs1[csec][cid]) return null;
    var live = regs1[csec][cid];
    var cd = STAT[csec].filter(function (k) { return !same(e._inline[k], live[k]); }).map(function (k) { return { k: k, copy: fmt(e._inline[k]), live: fmt(live[k]) }; });
    // B-1162 F1 (ruling release-r7-bug-burndown ADDENDUM 69): `as` lives only on an {_inline} entry (ADDENDUM 55's paper), so it
    // leaves with `_inline` — the bare id resolves as armour by the registry already
    var swap = {}; Object.keys(e).forEach(function (k) { if (k !== '_inline' && k !== 'as') swap[k] = e[k]; }); swap.id = cid;
    return { i: i, sec: sec, id: cid, name: live.name, diffs: cd, swap: swap };
  }

  // attachPlan(sheet, stamp, env, mode) → { refused } | { mods, next, preview, copies, patch, … } (R-H1K-2/-4/-6; R-H2K-2)
  //   mode 'attach' (default) or 'update' (the imported pin replaced in its slot) — H1; `env.held` may carry the room's hold.
  //   H2's acts go through the same path (R-H2B-3): 'detach' (stamp = a carried, present collection), 'missing' (stamp
  //   ignored: EVERY missing `user:` stamp, R-H2K-4) and 'replace' (stamp = the device's row; it takes the slot of the
  //   carried stamp of the same packId, R-H2K-5).
  function attachPlan(sheet, stamp, env, mode) {
    if (H2_MODES.indexOf(mode) >= 0) return h2Plan(sheet, stamp, env, mode);
    mode = mode === 'update' ? 'update' : 'attach';
    var M = env.M, UD = env.UD, CR = env.CR, PD = env.PD;
    var mods = Array.isArray(sheet && sheet.mods) ? sheet.mods.slice() : [];
    var ps = M.parseUserStamp(stamp);
    if (!ps) return { refused: 'not-a-collection' };
    var held = env.held !== undefined ? !!env.held : isHeld(sheet, env);
    if (held) return { refused: 'held' };                                  // R-H1K-3: the preview could not be true
    if (!resolvable(stamp, env)) return { refused: 'missing' };
    var carried = userStamps(sheet, env);
    if (mode === 'attach') {
      var hit = carried.filter(function (m) { var p = M.parseUserStamp(m); return p && p.packId === ps.packId; });
      if (hit.length) return { refused: hit.indexOf(stamp) >= 0 ? 'carried' : 'replace' };   // REPLACE is H2's mode
    } else if (!carried.some(function (m) { var p = M.parseUserStamp(m); return p && p.version && p.packId === ps.packId && m !== stamp; })) {
      return { refused: 'no-pin' };
    }
    var rows = UD.list();
    var next = placed(mods, stamp, env, mode);
    var mi = mirrorOf(next, rows, env);
    var ba = beforeAfter(sheet, mods, next, env), eq = ba.eq, E0 = ba.E0, E1 = ba.E1, regs0 = ba.regs0, regs1 = ba.regs1;
    var layer = UD.stampSync(stamp), lsec = (layer && layer.sections) || {};
    var nowShows = [], changes = [], copies = [];
    ['weapons', 'gear'].forEach(function (sec) {
      (Array.isArray(eq[sec]) ? eq[sec] : []).forEach(function (entry, i) {
        var a = E0[sec][i], b = E1[sec][i], e = (entry && typeof entry === 'object') ? entry : null;
        if (!a || !b) return;
        if (e && e._inline) { var c = copyOf(e, i, sec, lsec, regs1); if (c) copies.push(c); return; }
        var id = e ? e.id : entry;
        var rsec = (sec === 'gear' && regs1.armor && regs1.armor[id]) ? 'armor' : sec;
        var rec1 = regs1[rsec] && regs1[rsec][id];
        if (a._unresolved && !b._unresolved && rec1) {        // (a) unknown → known
          nowShows.push({ i: i, sec: rsec, id: id, name: rec1.name, stats: nowStats(rec1, rsec) });
          return;
        }
        if (!a._unresolved && !b._unresolved) {                // (a) known → a different record
          var rec0 = regs0[rsec] && regs0[rsec][id];
          if (!rec0 || !rec1) return;
          var d = diffs(rec0, rec1, STAT[rsec]);
          if (d.length) changes.push({ i: i, sec: rsec, id: id, name: rec1.name, diffs: d });
        }
      });
    });
    (function () {                                // the worn suit (equipment.armor)
      var e = eq.armor; if (!e || typeof e !== 'object' || !e.id) return;
      var r0 = regs0.armor && regs0.armor[e.id], r1 = regs1.armor && regs1.armor[e.id];
      if (!r0 && r1) nowShows.push({ worn: true, sec: 'armor', id: e.id, name: r1.name, stats: [{ k: 'soak', v: fmt(r1.soak) }] });
      else if (r0 && r1) { var d = diffs(r0, r1, STAT.armor); if (d.length) changes.push({ worn: true, sec: 'armor', id: e.id, name: r1.name, diffs: d }); }
    })();
    // TALENTS AND NUMBERS — the would-be stamp view, the shipped diff and attribution, the shipped derive
    var view1 = ba.view1, view0 = ba.view0 || env.base;
    var d = PD.diff(sheet, view1);
    var supplier = function (section, id) { return own(lsec[section], id); };
    var at = PD.attributeTalents(sheet, view1, d, supplier, { book: env.base });
    var patched = Object.assign({}, ba.S1, d.stale ? PD.projectedFields(d) : {});
    var nh = numbersOf(ba, patched, env), numbers = nh.numbers, heldRows = nh.held;
    var nm = function (sec, id) { return recName(view1, sec, id) || id; };
    var talents = { changed: at.changed.map(function (id) { return nm('talents', id); }), specs: treeSpecs(sheet, d, view0, view1), stale: d.stale };
    var row = rowFor(stamp, rows, env) || {};
    var name = row.name || (layer && layer.name) || ps.packId;
    var patch = { mods: next };
    if (d.stale) Object.assign(patch, PD.projectedFields(d));
    var fromV = null;
    if (mode === 'update') carried.forEach(function (m) { var p = M.parseUserStamp(m); if (p && p.version && p.packId === ps.packId) fromV = p.version; });
    return {
      mode: mode, stamp: stamp, name: name, mods: mods, next: next, mirror: mi.mirror, created: mi.created,
      items: { nowShows: nowShows, changes: changes, copies: copies }, talents: talents, numbers: numbers, held: heldRows,
      patch: patch, cleanAfter: !PD.diff(patched, view1).stale, fromV: fromV, toV: ps.version,
      empty: !nowShows.length && !changes.length && !copies.length && !d.stale && !numbers.length && !heldRows.length,
    };
  }

  // ── HOMEBREW H2 — remove, the held way out, swap (contract R-H2K-1..10; card R-H2B-3; the reference is the frames
  //    script's PLAN, scripts/homebrew_h2_frames.py @ cf6080948, whose numbers the build must equal, R-H2B-4) ──
  function h2Plan(sheet, stamp, env, mode) {
    var M = env.M, UD = env.UD, CR = env.CR, PD = env.PD, base = env.base;
    var mods = Array.isArray(sheet && sheet.mods) ? sheet.mods.slice() : [];
    var missing0 = UD.missingFor(mods).filter(function (s) { return typeof s === 'string' && s.indexOf('user:') === 0; });
    var carried = userStamps(sheet, env), rows = UD.list();
    var next, gone, old = null;
    if (mode === 'detach') {                       // R-H2K-3: one carried, present collection; the after-state must be complete
      if (carried.indexOf(stamp) < 0) return { refused: 'not-carried' };
      if (missing0.length) return { refused: 'held' };
      next = mods.filter(function (m) { return m !== stamp; }); gone = [stamp];
    } else if (mode === 'missing') {               // R-H2K-4: EVERY missing `user:` stamp, in one act
      if (!missing0.length) return { refused: 'none-missing' };
      next = mods.filter(function (m) { return missing0.indexOf(m) < 0; }); gone = missing0.slice();
    } else {                                       // R-H2K-5: the new stamp takes the old one's SLOT
      var ps = M.parseUserStamp(stamp);
      if (!ps) return { refused: 'not-a-collection' };
      if (!resolvable(stamp, env)) return { refused: 'missing' };
      if (carried.indexOf(stamp) >= 0) return { refused: 'carried' };
      old = carried.filter(function (m) { var p = M.parseUserStamp(m); return p && p.packId === ps.packId; })[0] || null;
      if (!old) return { refused: 'no-pin' };
      if (missing0.some(function (m) { return m !== old; })) return { refused: 'held' };   // on a held sheet: only when old is the ONLY missing one
      next = mods.slice(); next[mods.indexOf(old)] = stamp; gone = [old];
    }
    var mi = mirrorOf(next, rows, env);
    var ba = beforeAfter(sheet, mods, next, env), eq = ba.eq, E0 = ba.E0, E1 = ba.E1, regs0 = ba.regs0, regs1 = ba.regs1;
    var book = env.IR.forStampSync([]) || {};
    var view0 = ba.view0, view1 = ba.view1;
    if (!view1) return { refused: 'incomplete', mods: mods, next: next };   // never offered: the preview could not be true
    var nl = mode === 'replace' ? UD.stampSync(stamp) : null, nsec = (nl && nl.sections) || {};
    var items = { toBook: [], unknown: [], changes: [], nowShows: [], stayUnknown: [], copies: [] };
    var one = function (a, b, id, rsec, at) {
      var r0 = regs0[rsec] && regs0[rsec][id], r1 = regs1[rsec] && regs1[rsec][id];
      if (!a._unresolved && b._unresolved) { items.unknown.push(Object.assign({ id: id, sec: rsec, name: a.name }, at)); return; }
      if (a._unresolved && b._unresolved) { items.stayUnknown.push(Object.assign({ id: id, sec: rsec }, at)); return; }
      if (a._unresolved && !b._unresolved) { if (r1) items.nowShows.push(Object.assign({ id: id, sec: rsec, name: r1.name, stats: nowStats(r1, rsec) }, at)); return; }
      var p0 = r0 || (book[rsec] && book[rsec][id]);   // a held sheet's before: the layers this device resolves (F-2)
      if (!p0 || !r1) return;
      var dd = diffs(p0, r1, STAT[rsec]);
      if (!dd.length) return;
      var bk = book[rsec] && book[rsec][id];
      var toBook = !!bk && STAT[rsec].every(function (k) { return same(bk[k], r1[k]); });
      var x = Object.assign({ id: id, sec: rsec, name0: p0.name, name1: r1.name, diffs: dd, fromNew: own(nsec[rsec], id) }, at);
      if (mode === 'detach' && toBook) items.toBook.push(x); else items.changes.push(x);
    };
    ['weapons', 'gear'].forEach(function (sec) {
      (Array.isArray(eq[sec]) ? eq[sec] : []).forEach(function (entry, i) {
        var a = E0[sec][i], b = E1[sec][i], e = (entry && typeof entry === 'object') ? entry : null;
        if (!a || !b) return;
        if (e && e._inline) {                    // R-H2K-3: saved copies are not shown; a replace offers them ticked (D-110)
          if (mode === 'replace') { var c = copyOf(e, i, sec, nsec, regs1); if (c) items.copies.push(c); }
          return;
        }
        var id = e ? e.id : entry;
        var rsec = (sec === 'gear' && ((regs1.armor && regs1.armor[id]) || (regs0.armor && regs0.armor[id]) || (book.armor && book.armor[id]))) ? 'armor' : sec;
        one(a, b, id, rsec, { i: i, list: sec });
      });
    });
    (function () { var e = eq.armor; if (!e || typeof e !== 'object' || !e.id) return;
      var a = E0.armor, b = E1.armor; if (a && b && !Array.isArray(a)) one(a, b, e.id, 'armor', { worn: true }); })();
    // TALENTS AND NUMBERS
    var d = PD.diff(sheet, view1);
    // R-H2F-1: wherever an owned specialization goes absent, `talents` is C5.2's own writer's (the growth room's buy uses
    // it): the absent tree's bought talents stay. Otherwise H1's projection.
    var absentSpec = (sheet.specializations || []).some(function (s) { return s && s.id && !own(view1.specializations, s.id); });
    var sp1 = CR.resolveSheetSpecs(sheet, view1);
    var keeping = CR.talentsKeepingAbsentTrees(sheet.talents || [], sp1, sp1, view1.specializations || {}, sheet.looseTalents);
    var talentsOut = absentSpec ? keeping : d.rendered.talents;
    var patched = Object.assign({}, ba.S1, d.stale ? Object.assign(PD.projectedFields(d), { talents: talentsOut }) : {});
    var nh = numbersOf(ba, patched, env);
    var ownedT = []; (sheet.talents || []).forEach(function (t) { if (t && t.id && ownedT.indexOf(t.id) < 0) ownedT.push(t.id); });
    var nothing = ownedT.filter(function (id) { return !own(view1.talents, id); }).map(function (id) { return { id: id, name: recName(view0, 'talents', id) }; });
    var deletedSpecs = (sheet.specializations || []).filter(function (s) { return s && s.id && !own(view1.specializations, s.id); })
      .map(function (s) { return { id: s.id, name: recName(view0, 'specializations', s.id) }; });
    // THE GUARD (R-H2F-3, F-100's word (a) @ 95157cb5): sheetHold on the after-state; a variant-B result refuses, whatever
    // the kind. Its own result decides — never a second predicate.
    var hold0 = CR.sheetHold(ba.S0, view0 || base, missing0, true);
    var hold1 = CR.sheetHold(patched, view1, UD.missingFor(next), true);
    var SECTION = { forcePowers: 'forcePowers', speciesId: 'species', careerId: 'careers' };
    var refs = hold1 && hold1.variant === 'B' ? hold1.refs.map(function (r) {
      return { field: r.field, id: r.id, kind: r.kind, name: r.name || recName(view0, SECTION[r.field] || r.field, r.id), saved: r.name };
    }) : null;
    // B-1203 (D-411 items 7–9; retires R-M9B-14's refusal, f100-m9-build-card ADDENDUM 6): a species, career or Force power
    // C5.2 RELEASES in the after-state (not a hold since B-1190) is allowed, and the preview names it per kind — the one
    // core's pair, sheetDeletedRefs, on the same after-state. Only what THIS act releases: a record already deleted before
    // it is not the removed collection's to name.
    var lost = { species: [], career: [], 'force power': [] };
    if (!refs && typeof CR.sheetDeletedRefs === 'function') {
      var had = CR.sheetDeletedRefs(ba.S0, view0 || base, missing0, true);
      CR.sheetDeletedRefs(patched, view1, UD.missingFor(next), true).forEach(function (r) {
        if (RELEASED_KINDS.indexOf(r.kind) < 0 || had.some(function (x) { return x.field === r.field && x.id === r.id; })) return;
        var saved = r.field === 'speciesId' ? sheet.species : r.field === 'careerId' ? sheet.career : null;
        lost[r.kind].push({ id: r.id, name: recName(view0, SECTION[r.field] || r.field, r.id) || saved || null });
      });
    }
    var patch = { mods: next };
    if (d.stale) Object.assign(patch, PD.projectedFields(d), { talents: talentsOut });
    var cleanAfter = (function () {
      var d2 = PD.diff(patched, view1); if (!d2.stale) return true;
      var sp2 = CR.resolveSheetSpecs(patched, view1);   // the absent tree's kept talents only (R-H2F-1), and nothing else
      return absentSpec && !d2.bonusFields.length && !d2.conditional && same(CR.talentsKeepingAbsentTrees(patched.talents || [], sp2, sp2, view1.specializations || {}), patched.talents);
    })();
    var newRow = mode === 'replace' ? rowFor(stamp, rows, env) : null;
    var shown = rows.filter(function (r) { return r && r.records > 0 && resolvable(r.stamp, env); });
    var plan = {
      mode: mode, stamp: mode === 'replace' ? stamp : (mode === 'detach' ? stamp : null), old: old,
      name: mode === 'detach' ? nameOf(stamp, rows, env) : (old ? nameOf(old, rows, env) : null),
      newName: newRow ? (newRow.name || newRow.packId) : null,
      tell: newRow && env.tellApart ? env.tellApart(newRow, shown) : [],
      mods: mods, next: next, gone: gone, missing0: missing0, gonePresent: gone.every(function (s) { return resolvable(s, env); }),
      mirror: mi.mirror, created: mi.created, items: items,
      talents: { nothing: nothing, deletedSpecs: deletedSpecs, specs: treeSpecs(sheet, d, view0 || base, view1), stale: d.stale },
      lost: { species: lost.species, careers: lost.career, powers: lost['force power'] },
      numbers: nh.numbers, held: nh.held, hold0: hold0 ? hold0.variant : null, hold1: hold1 ? hold1.variant : null,
      refs: refs, patch: patch, cleanAfter: cleanAfter, absentSpec: absentSpec, signedIn: !!env.signedIn,
      writers: { rendered: d.rendered.talents, keeping: keeping },
    };
    if (refs) plan.refused = 'would-hold';
    plan.empty = mode === 'detach' && !items.toBook.length && !items.unknown.length && !items.changes.length && !d.stale && !nh.numbers.length && !nh.held.length
      && !nothing.length && !deletedSpecs.length && !lost.species.length && !lost.career.length && !lost['force power'].length;
    return plan;
  }

  // refusalWords(plan, who) — R-H2K-6 in place of the act, from the guard's first ref: the present sentence when the
  // collection going is on this device, else the missing one (naming the record only where the sheet saved a name)
  function refusalWords(plan, who) {
    if (!plan || !plan.refs || !plan.refs.length) return null;
    var r = plan.refs[0], k = KIND_WORD[r.kind] || r.kind;
    if (plan.gonePresent && plan.name) return W.refusePresent(plan.name, who, k, r.name || r.id);
    return W.refuseMissing(who, k, r.saved);
  }
  // afterWords(plan) — F3 / F10's after-line (R-H1K-4, R-H2K-8)
  function afterWords(plan) {
    return plan.mode === 'update' ? W.updated(plan.name) : plan.mode === 'detach' ? W.removed(plan.name)
      : plan.mode === 'replace' ? W.nowUses : plan.mode === 'missing' ? W.missingRemoved : W.added(plan.name);
  }
  // seenOnCommit(plan, sheet, env) — ruling homebrew-h2-build-readings R-H2R-1: a Remove puts H1's offer away for the
  // collection it removed (`<name>|<ck>` in OFFER_SEEN_KEY, R-H1B-4's key and shape). Undo leaves it; a replace or the
  // held way out writes nothing.
  function seenOnCommit(plan, sheet, env) {
    if (!plan || plan.mode !== 'detach' || !plan.gone || !plan.gone.length) return [];
    var row = env.UD.list().filter(function (r) { return r && r.stamp === plan.gone[0]; })[0];
    return row ? [seenKey(sheet, row.ck)] : [];
  }
  // wayOuts(sheet, env) — on a held sheet: the replace rows that lift the hold (R-H2K-5, R-H2F-2), each with its plan;
  // the door is the drawn My Data refusal (W.otherMy; census reading R-2)
  function replaceRows(sheet, env) {
    return candidates(sheet, env).filter(function (c) { return c.refuse === W.otherMy; })
      .map(function (c) { return Object.assign({}, c, { plan: attachPlan(sheet, c.stamp, env, 'replace') }); });
  }
  function wayOutRows(sheet, env) {
    return replaceRows(sheet, env).filter(function (c) { return !c.plan.refused; });
  }

  // previewWords(plan, who, ticks) → the F2 payload: { title, sub, groups:[{h, rows:[{t, sub?, tick?, copy?}]}], last, primary,
  // cancel } — sections only when non-empty (§5); copies start TICKED (J2 (A), R-H1B-2) unless `ticks` says otherwise
  function previewWords(plan, who, ticks) {
    if (H2_MODES.indexOf(plan.mode) >= 0) return h2Words(plan, who, ticks);
    var c = plan.name, groups = [];
    var join = function (xs, f) { return xs.map(f).join(', '); };
    var now = plan.items.nowShows.map(function (x) { return { t: x.name + ' — ' + join(x.stats, function (s) { return s.k + ' ' + s.v; }) }; });
    if (now.length) groups.push({ h: null, rows: now });
    var ch = plan.items.changes.map(function (x) { return { t: x.name + ' — ' + join(x.diffs, function (d) { return d.k + ' ' + d.from + ' → ' + d.to; }) }; });
    if (ch.length) groups.push({ h: W.sChanges, rows: ch });
    if (plan.items.copies.length) {
      groups.push({ h: W.sCopies, rows: plan.items.copies.map(function (x, j) {
        return { t: W.copyQ(x.name), sub: x.diffs.length ? W.copyCmp(join(x.diffs, function (d) { return d.k + ' ' + d.copy; }), join(x.diffs, function (d) { return d.k + ' ' + d.live; })) : W.copySame,
                 tick: ticks ? !!ticks[j] : true, copy: j };
      }) });
    }
    var tal = [], nums = join(plan.numbers, function (n) { return n.k + ' ' + n.from + ' → ' + n.to; });
    if (plan.talents.changed.length && nums) tal.push({ t: plan.talents.changed.join(', ') + ' — ' + nums });
    else if (nums) tal.push({ t: cap(nums) });
    plan.held.forEach(function (h) { tal.push({ t: W.held(h.q, h.held, c, h.computed), held: h.key }); });
    plan.talents.specs.forEach(function (s) { tal.push({ t: W.tree(s.name, s.n) }); });
    if (tal.length) groups.push({ h: W.sTalents, rows: tal });
    var upd = plan.mode === 'update';
    return { title: upd ? W.titleUpdate(c, who) : W.titleAdd(c, who),
             sub: upd && plan.fromV && plan.toV ? W.version(plan.fromV.slice(0, 6), plan.toV.slice(0, 6)) : null,
             groups: groups, last: null,
             primary: upd ? W.btnUpdate : W.btnAdd, cancel: W.btnCancel };
  }

  // h2Words(plan, who, ticks) → H2's preview payload, the frames' words (F6 / F7 / F8): { title, sub, groups, lead, cross,
  // last, primary, cancel }. The cross-device line iff signed in (J1 (A), R-H2K-7); sections only when non-empty.
  function h2Words(plan, who, ticks) {
    var join = function (xs, f) { return xs.map(f).join(', '); };
    var stats = function (ds) { return join(ds, function (d) { return d.k + ' ' + d.from + ' → ' + d.to; }); };
    var nums = join(plan.numbers, function (n) { return n.k + ' ' + n.from + ' → ' + n.to; });
    var cross = plan.signedIn ? W.cross(who) : null;
    var talentRows = function (c, heldW) {         // R-H2F-1's line first, then "does nothing now", trees, numbers, held
      var L = plan.lost || { species: [], careers: [], powers: [] };
      var rows = L.species.map(function (x) { return { t: W.lostSpecies(x.name || x.id) }; })   // B-1203: F5's order, first
        .concat(L.careers.map(function (x) { return { t: W.lostCareer(x.name || x.id) }; }), L.powers.map(function (x) { return { t: W.nothing(x.name || x.id) }; }))
        .concat(plan.talents.deletedSpecs.map(function (x) { return { t: W.specGone(x.name || x.id) }; }))
        .concat(plan.talents.nothing.map(function (x) { return { t: W.nothing(x.name || x.id) }; }))
        .concat(plan.talents.specs.map(function (s) { return { t: W.tree(s.name, s.n) }; }));
      if (nums) rows.push({ t: cap(nums) });
      plan.held.forEach(function (h) { rows.push({ t: (heldW || W.held)(h.q, h.held, c, h.computed), held: h.key }); });
      return rows;
    };
    var groups = [], it = plan.items;
    if (plan.mode === 'missing') {                 // R-H2K-4: it counts, it does not name
      var rows = [{ t: W.nMissing(plan.gone.length) }];
      var u = it.stayUnknown.length + it.unknown.length;
      if (u) rows.push({ t: W.nUnknown(u) });
      if (plan.talents.deletedSpecs.length) rows.push({ t: W.specGoneN(plan.talents.deletedSpecs.length) });   // R-H2F-7
      if (plan.talents.nothing.length) rows.push({ t: W.nNothing(plan.talents.nothing.length) });
      var LM = plan.lost || { species: [], careers: [], powers: [] };   // B-1203: F7 counts, beside the talents' count
      if (LM.species.length) rows.push({ t: W.nLostSpecies });
      if (LM.careers.length) rows.push({ t: W.nLostCareer });
      if (LM.powers.length) rows.push({ t: W.nLostPower(LM.powers.length) });
      if (nums) rows.push({ t: cap(nums) });
      plan.held.forEach(function (h) { rows.push({ t: W.heldWithout(h.q, h.held, W.theMissing, h.computed), held: h.key }); });   // R-H2R-3
      if (plan.hold0 && !plan.hold1) rows.push({ t: W.buying });
      return { title: W.titleMissing(who), sub: null, groups: [{ h: null, rows: rows }], lead: null, cross: cross, last: null,
               primary: W.btnRemove, cancel: W.btnCancel };
    }
    if (plan.mode === 'detach') {                  // R-H2K-3
      var bk = it.toBook.map(function (x) { return { t: x.name1 + ' — ' + stats(x.diffs) }; });
      if (bk.length) groups.push({ h: null, rows: bk });
      var ch = it.changes.map(function (x) { return { t: x.name1 + ' — ' + stats(x.diffs) }; });   // a record another layer still changes
      if (ch.length) groups.push({ h: W.sChanges, rows: ch });
      var un = it.unknown.map(function (x) { return { t: W.unknown(x.name) }; });
      if (un.length) groups.push({ h: W.sUnknown, rows: un });
      var tal = talentRows(plan.name, W.heldWithout);   // R-H2R-3
      if (tal.length) groups.push({ h: W.sTalents, rows: tal });
      if (!groups.length) return { title: W.titleRemove(plan.name, who), sub: null, groups: [], lead: null, cross: cross, last: null,
                                   primary: W.btnRemove, cancel: W.btnCancel };   // R-H2F-4
      return { title: W.titleRemove(plan.name, who), sub: null, groups: groups, lead: null, cross: cross, last: null,
               primary: W.btnRemove, cancel: W.btnCancel };
    }
    // replace (R-H2K-5): H1's Now shows its stats · Changes (a same-key record of the new layer named both sides), Saved
    // copies ticked (D-110), plus Shows as unknown, Talents and numbers
    var now = it.nowShows.map(function (x) { return { t: x.name + ' — ' + join(x.stats, function (s) { return s.k + ' ' + s.v; }) }; });
    if (now.length) groups.push({ h: null, rows: now });
    var chg = it.changes.map(function (x) { return { t: x.fromNew ? W.changeNew(x.name0, x.name1, stats(x.diffs)) : x.name1 + ' — ' + stats(x.diffs) }; });
    if (chg.length) groups.push({ h: W.sChanges, rows: chg });
    var unk = it.unknown.map(function (x) { return { t: W.unknown(x.name) }; });
    if (unk.length) groups.push({ h: W.sUnknown, rows: unk });
    if (it.copies.length) {
      groups.push({ h: W.sCopies, rows: it.copies.map(function (x, j) {
        return { t: W.copyQ(x.name), sub: x.diffs.length ? W.copyCmp(join(x.diffs, function (d) { return d.k + ' ' + d.copy; }), join(x.diffs, function (d) { return d.k + ' ' + d.live; })) : W.copySame,
                 tick: ticks ? !!ticks[j] : true, copy: j };
      }) });
    }
    var tr = talentRows('this My Data');
    if (tr.length) groups.push({ h: W.sTalents, rows: tr });
    return { title: W.titleReplace(who), sub: plan.tell && plan.tell.length ? plan.tell : null, groups: groups, lead: null, cross: cross, last: null,
             primary: W.useInstead, cancel: W.btnCancel };
  }

  // patchFor(plan, sheet, ticks) — the ONE patch: mods (+ the three re-projected fields) + the ticked swaps (R-H1K-4)
  function patchFor(plan, sheet, ticks) {
    var p = Object.assign({}, plan.patch);
    var picked = plan.items.copies.filter(function (x, j) { return ticks ? !!ticks[j] : true; });
    if (picked.length) {
      var eq = clone(sheet.equipment || {});
      picked.forEach(function (x) { eq[x.sec][x.i] = clone(x.swap); });
      p.equipment = eq;
    }
    return p;
  }
  // undoFor(prev, patch) — the prior value of every key the patch writes ({absent: true} where it had none)
  function undoFor(prev, patch) {
    var u = {};
    Object.keys(patch).forEach(function (k) { u[k] = own(prev, k) ? { v: clone(prev[k]) } : { absent: true }; });
    return u;
  }
  // restore(cur, undo) — the record with those keys put back, in place (R-H1K-4: Undo from memory, nothing stored)
  function restore(cur, undo) {
    var next = Object.assign({}, cur);
    Object.keys(undo).forEach(function (k) { if (undo[k].absent) delete next[k]; else next[k] = clone(undo[k].v); });
    return next;
  }

  var api = { W: W, envFromWindow: envFromWindow, isHeld: isHeld, lineNames: lineNames, updates: updates, candidates: candidates,
              offerFor: offerFor, seenKey: seenKey, seenOnCommit: seenOnCommit, attachPlan: attachPlan, previewWords: previewWords, patchFor: patchFor,
              undoFor: undoFor, restore: restore, OFFER_SEEN_KEY: 'swrpg_homebrew_offer_seen',
              lineStamps: lineStamps, refusalWords: refusalWords, afterWords: afterWords, replaceRows: replaceRows, wayOutRows: wayOutRows };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SWRPGPackAttach = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
