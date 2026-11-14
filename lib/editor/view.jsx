/* lib/editor/view.jsx — THE HOMEBREW EDITOR (window.SWRPGEditorView). One module, two faces (R-FEDC-1).
 *
 * Built from the approved record `Docs/mockups/f100-editor.html` (Artifact J6wtSGrKu235n3Xh9E3qoS; F1, F9, F10,
 * M1/M1b, M3a/b, M5a/b, M6, M7, M11, S1–S5, I-1…I-13 — rulings f100-editor-mockup, f100-m2c-frames,
 * f100-editor-drc-census, f100-items-frames + ADDENDUM 1). Step C2 of `f100-items-editor-contracts` §5: the
 * shell — HOME, MY COLLECTIONS, the store's states, and the "Your homebrew" group in the creator's Sources
 * overlay. Step D (R-FIFG-5): the three item shelves (I-1, S1), the weapon/armor/gear forms (F5 as revised by I-9,
 * I-2, I-3) with every approved state — F8 and its conflict row (I-6), S4, the blank start (I-5), leaving (I-7),
 * Brawn damage (I-8), the refused save (I-10), read-only (I-11), the qualities picker (I-12) and the IN ▾ (I-13).
 * The GM face is the same paper frames with the host's name (`f100-items-shell-faces` R-FISF-2).
 *
 * THE HOST HANDS IN: { host: 'player'|'gm', appName, path, navigate(path, {replace}), exit(), roster? }.
 * The module owns no route of its own: `SWRPGEditor.parse(path)` (lib/editor/switch.js) is the grammar and
 * `navigate` is the host's history. Nothing here mounts while the switch is off — the hosts ask
 * `SWRPGEditor.screenFor()` first.
 *
 * DATA: the one store (`window.SWRPGUserData`) and the books. Items come through THE ONE items loader
 * (`SWRPGItemRegistries.load()`, its pristine `_canonicalRegistriesBase`); the charbuild sections are the
 * player's pristine `_canonicalCharbuildBase` when the creator already loaded it, otherwise the same five
 * shipped files, handed to the store with `provideBase` exactly as the player's charbuild funnel does.
 * Nothing is persisted as a display shape; every figure is counted at render from what loaded.
 */
(function () {
  var h = React.createElement;
  var useState = React.useState, useEffect = React.useEffect, useRef = React.useRef, useCallback = React.useCallback, useLayoutEffect = React.useLayoutEffect;

  // ── THE WORDS (verbatim from the approved frames; `scripts/check_editor_words.py`-style guards grep them) ──
  var W = {
    legend: ['AUTOMATIC', 'SITUATIONAL', 'NARRATIVE'],
    whoever: 'Whoever opens it needs the same books switched on in Sources.',
    booksDead: 'The book data didn’t load, so the shelves are empty and nothing can be saved right now. Your collections are still here.',
    shared: function (n) { return 'Shared ' + n + (n === 1 ? ' record.' : ' records.'); },   // the ruled line; the singular is the implementer's (named in the gate)
    leftOut: function (n) { return 'Left out (' + n + ')'; },
    lo: { 'left-out-base-missing': "left out: it's based on a book record this app no longer has",
          'left-out-foreign-base': "left out: it changes another collection's version of a book record" },
    moved: function (nm) { return 'Note: the book changed ' + nm + ' since you edited it.'; },
    nothing: "Nothing to share. Every record here is based on a book record this app no longer has, or changes another collection's version of one.",
    unknown: "This collection has something the app doesn't recognise, so it can't be shared.",
    glance: function (p) { return p.name + ' · ' + p.records + (p.records === 1 ? ' record' : ' records') + ' · ' + (p.origin === 'imported' ? 'imported' : 'made on this device'); },
    group: 'Your homebrew',
    soon: 'SOON',   // R-FIL-7 / R-FILC-8: the shipped mark (lib/shared/ui.jsx SubTabs), bare letter-spaced text, never boxed
    tie: function (rec, win) { return 'Both change ' + rec + '. ' + win + " is used, because it's higher in this list."; },
    pin: 'Your own homebrew always wins over a collection you imported.',
    up: 'Move up', down: 'Move down',
    impAdded: function (nm) { return 'Added ' + nm + '.'; },
    impNew: function (nm) { return 'Updated ' + nm + '. Characters made with the earlier version keep it.'; },
    impSame: function (nm) { return 'You already have this version of ' + nm + '.'; },
    impNotJson: "That file isn't a homebrew collection.",
    impRejected: "This collection has errors, so it wasn't added.",
    impNewer: "This collection was made by a newer version of the app. It's saved, but none of it is used until you update.",
    impTaken: "That's your own collection. It's already here.",
    memory: "This browser isn't saving homebrew. Anything you make disappears when you close the tab.",
    newer: 'Your homebrew was saved by a newer version of the app. You can look, but not change it here. Reload to update.',
    stale: 'A newer version of the app is open in another tab. Reload to keep changing homebrew.',
    backup: 'Export backup',
    rmImp: function (nm) { return 'Remove ' + nm + '? Characters made with it keep the version they were made with.'; },
    myData: "My Data can't be removed. Delete its records instead.",
    // ── implementer's chrome words (undrawn states; each named in the gate for the architect's review) ──
    rmOwn: function (nm, n) {
      return 'Remove ' + nm + '? ' + (n === 0 ? 'No characters use it.' : n === 1 ? '1 character uses it. It can still be played, but can\'t buy until you add it back.'
        : n + " characters use it. They can still be played, but can't buy until you add it back.");
    },
    impUnchecked: "The app couldn't check this file right now, so it wasn't added. Try again.",
    emptyGlance: 'no records yet',
    nameTaken: function (nm) { return 'You already have a collection called ' + nm + '.'; },
    giveName: 'Give it a name.',
  };
  var SHELVES = [['weapons', 'Weapons', 'weapons'], ['armor', 'Armor', 'armor'], ['gear', 'Gear', 'gear'],
                 ['talents', 'Talents', 'talents'], ['specializations', 'Specializations', 'specializations'], ['species', 'Species', 'species'],
                 ['force_powers', 'Force powers', 'force_powers'],   // M10 (R-M10E-2): the seventh shelf
                 ['careers', 'Careers', 'careers']];   // M12 (R-M12B-9 F1, D-157): the eighth, last on the rail, books only
  var KIND = { weapons: ['weapon', 'weapons'], armor: ['armor', 'armor'], gear: ['gear', 'gear'], talents: ['talent', 'talents'],
               specializations: ['specialization', 'specializations'], species: ['species', 'species'], careers: ['career', 'careers'],
               force_powers: ['Force power', 'Force powers'], signature_abilities: ['signature ability', 'signature abilities'] };   // M12: shelf-less (R-M12B-102)
  var CHARBUILD = [['species', 'species'], ['careers', 'careers'], ['specializations', 'specializations'], ['talents', 'talents'], ['force_powers', 'force_powers']];
  var ARM_MS = 3000;   // the roster's own two-tap clock (player/app.jsx, the armed delete's 3-second disarm)

  function UD() { return window.SWRPGUserData || null; }
  function ED() { return window.SWRPGEditor || null; }
  function num(n) { return Number(n).toLocaleString('en-US'); }
  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function plural(n, one, many) { return n === 1 ? one : many; }
  // a shelf's label (SHELVES), e.g. 'Force powers' for force_powers (M10: the runheads read it, never capf of the key)
  function shelfName(sec) { var s = SHELVES.filter(function (x) { return x[0] === sec; })[0]; return s ? s[1] : KIND[sec] ? capf(KIND[sec][1]) : capf(sec); }
  function kindWord(sec, n) { var k = KIND[sec] || [sec, sec]; return n === 1 ? k[0] : k[1]; }

  // ── MS SYNC-LINES REGION START — plain JS, no JSX (test/ms_sync_lines.cjs slices and runs it) ──
  // Homebrew sync's lines (card f100-ms-build R-MSB-1, the approved record Docs/mockups/f100-homebrew-sync.html @ e91e924d,
  // D-90 F2 (a) / F3 (a)): WHICH line a collection carries, WHEN, and in the record's words. Where each renders is the
  // view's (CollectionPlate, Collections, InMenu, importLine, the homebrew group). Nothing shows while sync is fine.
  var MSW = {
    didntSync: 'On this device only — this collection didn’t sync',                      // F1
    paused: 'Sync is paused for new homebrew — everything is saved on this device',          // F2 (a)
    started: function (d) { return 'Started ' + d; },                                         // F3 (a)
    removedElsewhere: 'On this device only — removed from sync on another device',           // F4
    restored: function (nm) { return 'Restored ' + nm + ' as your own collection.'; },        // F5 (a), R-MSMG-4
    alreadyHere: 'This collection is already on this device',                                 // F5 (b), R-MSMG-3
    // F-100 M10 F7 (B-1172; f100-m10-editor-card R-M10E-7, D-141 K3 (a)), verbatim with the collection's name for "My Data"
    syncAgain: 'Sync this again',
  };
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  // dayOf(iso, withYear) → "3 Oct 2026" / "3 Oct" on this device's calendar, or null for no date
  function dayOf(iso, withYear) {
    if (typeof iso !== 'string' && typeof iso !== 'number') return null;
    var d = new Date(iso); if (isNaN(d.getTime())) return null;
    return d.getDate() + ' ' + MONTHS[d.getMonth()] + (withYear ? ' ' + d.getFullYear() : '');
  }
  // syncLabel(c, ps) — the one line inside an own collection's plate, or null. ps = the lane's packState() while signed
  // in, null signed out. F4 is this device's own state (R-HSC-13, R-MSB-11; a kept HOME too, R-MSB-15), so it shows
  // whatever sync is doing. F1 is a refusal of THIS collection (R-HSC-6's 413s, R-MSB-8's cap, R-MSB-4's floor), never
  // while the pause holds (D2); a version key's refusal names no collection (R-MSB-17).
  var DIDNT = { too_large: 1, over_cap: 1, cap: 1, 'no-compression': 1 };
  function syncLabel(c, ps) {
    if (!c || c.origin !== 'own') return null;
    if (c.local) return MSW.removedElsewhere;
    if (!ps || ps.paused || !ps.refused) return null;
    return DIDNT[ps.refused[c.ck]] ? MSW.didntSync : null;
  }
  // pauseShows(status, ps) — F2 (a)'s line on MY COLLECTIONS: while paused, on a store that persists. A memory-only
  // store's own notice holds the slot alone (R-MSB-16: "everything is saved on this device" is false there).
  function pauseShows(status, ps) { return !!(ps && ps.paused) && !(status && status.persistent === false); }
  // tellApart(c, shown) — R-MSMG-2's ONE helper: the lines that tell c from another collection of the SAME name among
  // those listed in one place, else []. F3 (a): its start date.
  function tellApart(c, shown) {
    if (!c || !(shown || []).some(function (x) { return x && x.ck !== c.ck && x.name === c.name; })) return [];
    var out = [], d = dayOf(c.createdAt, true);
    if (d) out.push(MSW.started(d));
    return out;
  }
  // inSuffix(c, shown) — the closed IN ▾ trigger's short tell-apart (R-MSMG-9): " · 3 Oct", only when the name is shared
  function inSuffix(c, shown) {
    if (!tellApart(c, shown).length) return '';
    var d = dayOf(c.createdAt, false);
    return d ? ' · ' + d : '';
  }
  // countUsers(stamp, origin, packId, chars, draft) — the armed Remove's count (W.rmOwn): the roster's characters that
  // use it, plus one for the creation draft when any string in it names it — the keep rule's own set (R-MSB-19, C4)
  function countUsers(stamp, origin, packId, chars, draft) {
    function names(m) { return origin === 'imported' ? String(m).indexOf('user:' + packId + '@') === 0 : m === stamp; }
    var n = (chars || []).filter(function (c) {
      var mods = c && c.sheetData && c.sheetData.mods;
      return Array.isArray(mods) && mods.some(names);
    }).length;
    var hit = false;
    (function walk(v) {
      if (hit) return;
      if (typeof v === 'string') { if (names(v)) hit = true; return; }
      if (Array.isArray(v)) { v.forEach(walk); return; }
      if (v && typeof v === 'object') Object.keys(v).forEach(function (k) { walk(v[k]); });
    })(draft);
    return n + (hit ? 1 : 0);
  }
  // ── MS SYNC-LINES REGION END ──

  // ── the layout mode (the shared SWRPGLayout seam; 390-class frames vs 1440-class frames) ──
  function useWide() {
    var D = window.SWRPGDesktop;
    var mode = D && D.useLayoutMode ? D.useLayoutMode() : 'mobile';
    return mode === 'desktop';
  }

  // ── the store: list, status, ties — re-read on every change event and on focus (a stale tab says so) ──
  // the lane's packState() while an account is signed in, else null (signed out shows no sync line — F1's control)
  function syncPS() {
    try {
      var A = window.SWRPGAccount, SY = window.SWRPGSync, st = A && A.state ? A.state() : null;
      return st && st.user && SY && SY.packState ? SY.packState() : null;
    } catch (e) { return null; }
  }
  // R-MSMG-2's line(s) under a name, in the meta line's idiom in full ink (the record's `subline`; its muted ink is under AA)
  function apartLines(c, shown, style) {
    return tellApart(c, shown).map(function (t, i) {
      return h('div', { key: 'ta' + i, className: 'ed-rm', style: Object.assign({ color: 'var(--doc-ink)' }, style || null), 'data-ms-line': 'apart' }, t);
    });
  }
  function useStore() {
    var _s = useState({ ready: false, rev: 0 }), s = _s[0], set = _s[1];
    useEffect(function () {
      var U = UD(), alive = true;
      if (!U) { set({ ready: true, missing: true, rev: 1 }); return; }
      function read() {
        if (!alive) return;
        set(function (o) { return { ready: true, status: U.status(), list: U.list(), ties: U.conflicts(), sync: syncPS(), rev: o.rev + 1 }; });
      }
      U.ready().then(read, read);
      var ev = U.EVENT || 'swrpg-user-packs-changed';
      window.addEventListener(ev, read);
      window.addEventListener('focus', read);
      // homebrew sync's lines (MS stage 2): a moved packState() and a sign-in/out re-read; signed out reads null (F1's control)
      var SY = window.SWRPGSync, A = window.SWRPGAccount;
      var unSync = SY && SY.subscribe ? SY.subscribe(function (type) { if (type === 'pack_state') read(); }) : null;
      var unAcct = A && A.subscribe ? A.subscribe(function () { read(); }) : null;
      return function () { alive = false; window.removeEventListener(ev, read); window.removeEventListener('focus', read);
        if (typeof unSync === 'function') unSync(); if (typeof unAcct === 'function') unAcct(); };
    }, []);
    return s;
  }

  // ── the books: counts and three samples per shelf, and the names a collection row cites ──
  // B-139 (ADDENDUM 433 (d)): the page's one JSON fetch (lib/shared/fetchJson.js qbFetchJson — one read per URL per load) when
  // the host has it, which the player always does; the GM page loads it only with the Yard, so its own read stays the fallback.
  function fetchJson(u) {
    if (typeof qbFetchJson === 'function') return qbFetchJson(u);
    return fetch(u).then(function (r) { if (!r.ok) throw new Error(u + ': ' + r.status); return r.json(); });
  }
  function loadBooks() {
    var IR = window.SWRPGItemRegistries;
    var items = (IR ? IR.load() : Promise.resolve(null)).then(function (v) {
      var b = window._canonicalRegistriesBase;
      if (!v || !b) throw new Error('items did not load');
      return { weapons: b.weapons, armor: b.armor, gear: b.gear };
    });
    var cb = window._canonicalCharbuildBase;
    var charbuild = cb ? Promise.resolve({ species: cb.species, careers: cb.careers, specializations: cb.specializations, talents: cb.talents, force_powers: cb.forcePowers })
      : Promise.all(CHARBUILD.map(function (c) { return fetchJson('/public/data/canonical/' + c[0] + '.json'); })).then(function (r) {
          var out = {}; CHARBUILD.forEach(function (c, i) { out[c[0]] = r[i] && r[i][c[1]]; });
          // the same hand-off the player's charbuild funnel makes (pristine shipped sections, never overlaid)
          var U = UD(); if (U) U.provideBase(out);
          return out;
        });
    // M12 (F2): the books' signature abilities, for the career form's list and (#sigsection) the store's base
    var sigs = cb && cb.signatureAbilities ? Promise.resolve(cb.signatureAbilities)
      : fetchJson('/public/data/canonical/signature_abilities.json').then(function (j) { return (j && j.signature_abilities) || {}; });
    return Promise.all([items, charbuild, sigs]).then(function (r) {
      var sec = Object.assign({}, r[0], r[1], { signature_abilities: r[2] });
      // #sigsection (R-M12B-101): the store's base gains the books' abilities, so a derive names its book record
      var U = UD(); if (U && r[2]) U.provideBase({ signature_abilities: r[2] });
      var shelves = SHELVES.map(function (s) {
        var t = sec[s[2]] || {};
        var names = Object.keys(t).map(function (k) { return t[k] && t[k].name; }).filter(function (n) { return typeof n === 'string'; }).sort();
        var n = names.length;
        return { key: s[0], label: s[1], count: n, samples: n ? [names[0], names[n >> 1], names[n - 1]] : [] };
      });
      return { sections: sec, shelves: shelves };
    });
  }
  function useBooks() {
    var _b = useState({ state: 'loading' }), b = _b[0], set = _b[1];
    var go = useCallback(function (retry) {
      set({ state: 'loading' });
      if (retry && window.SWRPGItemRegistries && window.SWRPGItemRegistries.invalidate) { try { window.SWRPGItemRegistries.invalidate(); } catch (e) {} }
      loadBooks().then(function (v) { set({ state: 'ok', sections: v.sections, shelves: v.shelves }); },
                       function (e) { set({ state: 'error', error: String(e && e.message || e) }); });
    }, []);
    useEffect(function () { go(false); }, [go]);
    return [b, go];
  }

  // ── a collection, read for display: its records, their modes, bases and change counts ──
  // Every record is read through THE SAME rebuilt view the shelf and the record form use (`recordIn`): an
  // IMPORTED record is stored share-shaped (changes + anchor), so read raw it would show its id and count every
  // book field as changed (R-FIEG-R1). The split is taken on the rebuilt record, whose `_base` is the anchor.
  // (keyed by the collection's ck — R-SII-11; a list() row's `ck`)
  function recordsOf(ck, books) {
    var U = UD(), p = U && U.get(ck), out = [];
    if (!p || !isObj(p.pack) || !isObj(p.pack.sections)) return out;
    Object.keys(p.pack.sections).forEach(function (sec) {
      var recs = p.pack.sections[sec]; if (!isObj(recs)) return;
      Object.keys(recs).forEach(function (id) {
        if (!isObj(recs[id])) return;
        var y = null; try { y = recordIn(ck, sec, id, books); } catch (e) { y = null; }
        if (!y) return;
        // B-1283: a shared derive/redefine whose book record is not loaded yet is only its patch (`_changes`) — its name is the
        // patch's, or nothing until the book arrives, never the record id; and its change count is unknown, not 0
        var pending = isObj(y.raw._changes) && !y.book;
        var sp = null; if (!pending) { try { sp = U.split(sec, id, y.eff); } catch (e) { sp = null; } }
        out.push({ section: sec, id: id, name: y.rec.name || (pending ? (typeof y.raw._changes.name === 'string' ? y.raw._changes.name : '') : id), mode: y.mode, baseId: y.baseId, baseName: y.book ? y.book.name : null,
                   anchored: y.mode === 'derive' || y.mode === 'redefine', changes: sp ? userChanged(sp, y.eff, y.book).length : null });
      });
    });
    return out.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
  }
  // The fields YOU changed, from the split (R-FIEC-3). A new record's `id` is its own identity (mintId), never
  // the book's, so the split always sees it differ — it is not a change the user made and is not counted.
  // C1.3a (ruling f100-m5-contracts ADDENDUM 1, R-M5K-A1-2 (a)): an ABSENT `effects` / `pool_mods` key and `[]` count as EQUAL —
  // the save writes both (C1.3), and a record whose book omits the key must not report a change nobody made.
  function emptyList(v) { return v === undefined || v === null || (Array.isArray(v) && !v.length); }
  function userChanged(sp, rec, book) {
    return sp.yours.concat(sp.conflict).filter(function (k) {
      if (k === 'id') return false;
      if ((k === 'effects' || k === 'pool_mods') && rec && emptyList(rec[k]) && emptyList(book && book[k])) return false;
      return true;
    });
  }
  function phrase(rs) {
    var c = {}, order = [];
    rs.forEach(function (r) { if (!c[r.section]) { c[r.section] = 0; order.push(r.section); } c[r.section]++; });
    return order.map(function (s) { return c[s] + ' ' + kindWord(s, c[s]); }).join(', ');
  }
  function plateGlance(name, recs) {
    var adds = recs.filter(function (r) { return r.mode !== 'redefine'; }), chg = recs.filter(function (r) { return r.mode === 'redefine'; });
    var parts = [];
    if (adds.length) parts.push('adds ' + phrase(adds));
    if (chg.length) parts.push('changes ' + phrase(chg));
    return name + ' — ' + (parts.length ? parts.join('; ') : W.emptyGlance);
  }
  function changeTotal(recs) { return recs.reduce(function (a, r) { return a + (r.changes || 0); }, 0); }
  function rowMeta(r) {
    var head = r.mode === 'redefine' ? 'changes the book’s' : 'new ' + kindWord(r.section, 1);
    var p = [head];
    if (r.baseName) p.push('from ' + r.baseName);
    if (r.changes != null) p.push(r.changes + ' ' + plural(r.changes, 'change', 'changes'));
    return p.join(' · ');
  }
  function usersOf(stamp, origin, packId, roster) {
    var list = roster;
    if (!Array.isArray(list)) {
      // the GM host holds no roster state: read the device's roster record read-only (the same key, both shapes)
      try { var raw = JSON.parse(window.localStorage.getItem('swrpg_saved_characters') || '[]'); list = Array.isArray(raw) ? raw : (raw && raw.characters) || []; } catch (e) { list = []; }
    }
    // the creation draft counts too — the keep rule's own set (C4; ruling f100-ms-build-card R-MSB-19)
    var draft = null;
    try { draft = JSON.parse(window.localStorage.getItem('swrpg_creation_draft') || 'null'); } catch (e) { draft = null; }
    return countUsers(stamp, origin, packId, list, draft);
  }
  function download(name, text) {
    try {
      var blob = new Blob([text], { type: 'application/json' }), url = URL.createObjectURL(blob);
      var a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click();
      setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
    } catch (e) {}
  }
  function slug(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40); }
  // ── the collection key (f100-sync-instance-index R-SII-11): every store verb and every React key here names a collection
  // by its `ck`; the data-editor-* testids keep their packId values (their consumers are the smokes). HOME is the store's
  // own answer (R-SII-4), and a record's route names its collection through the switch's one builder (R-SII-10).
  function homeCk() { var U = UD(); return U && U.home ? U.home() : ((U && U.MY_DATA) || 'my_data'); }
  function recRoute(sec, ck, id) {
    var U = UD(), rows = (U && U.list && U.list()) || [], row = rows.filter(function (c) { return c.ck === ck; })[0];
    var r = { view: 'record', shelf: sec, id: id };
    if (row) Object.assign(r, ED().inFor(row, rows)); else r.packId = String(ck || '').replace(/^(own|imp):/, '');
    return r;
  }

  // ── small parts ──
  function Chip(p) { return h('span', { className: 'ed-chip', 'data-chip': p.c }, p.c); }
  function Soon() { return h('span', { className: 'ed-soon-mk' }, W.soon); }
  function Legend() { return h('div', { className: 'ed-legend' }, W.legend.map(function (c) { return h('div', { key: c }, h(Chip, { c: c })); })); }
  function Sechead(p) { return h('div', { className: 'hp-sechead' }, h('h2', null, p.t), p.aside != null ? h('span', { className: 'ed-aside' }, p.aside) : null); }
  function Runhead(p) {
    return h('div', { className: 'hp-runhead ed-runhead' },
      h('button', { type: 'button', className: 'ed-back', onClick: p.onBack, 'data-editor-back': '1' }, '‹ ' + p.back),
      h('span', null, p.right));
  }
  function Wait(p) { return h('span', { className: 'ed-wait', style: { '--ed-w': p.w } }); }
  function Banner(p) {
    var st = p.status; if (!st) return null;
    var t = null, ctl = null;
    if (st.reason === 'newer-store') t = W.newer;
    else if (st.reason === 'stale-tab') t = W.stale;
    else if (st.persistent === false && st.reason !== 'not-open') { t = W.memory; ctl = p.onBackup ? h('button', { type: 'button', className: 'hp-quiet', onClick: p.onBackup }, W.backup) : null; }
    if (!t) return null;
    return h('div', { className: 'ed-banner', role: 'status', 'data-editor-banner': st.reason }, h('span', { className: 'ed-bt' }, t), ctl);
  }
  function held(store) { return !!(store.status && store.status.writable === false); }

  // ── the collection plate (F1 / F9; S3's held face) ──
  function CollectionPlate(p) {
    var c = p.col, recs = p.recs, isHeld = p.held;
    var _a = useState(false), armed = _a[0], setArmed = _a[1];
    var _r = useState(null), ren = _r[0], setRen = _r[1];
    var _e = useState(''), err = _e[0], setErr = _e[1];
    var _g = useState(false), again = _g[0], setAgain = _g[1];   // F7: "Sync this again" was pressed on this plate
    useEffect(function () { if (!armed) return; var t = setTimeout(function () { setArmed(false); }, ARM_MS); return function () { clearTimeout(t); }; }, [armed]);
    var own = c.origin === 'own', my = !!c.home;   // R-SII-4: HOME is unremovable; another device's My Data is ordinary
    function toggle() { if (!isHeld) UD().setActive(c.ck, !c.active); }
    function saveName() {
      var nm = (ren || '').trim();
      if (!nm) { setErr(W.giveName); return; }
      UD().renamePack(c.ck, nm).then(function (r) {
        if (r.ok) { setRen(null); setErr(''); }
        else setErr(String(r.reasons[0]).indexOf('name-taken') === 0 ? W.nameTaken(nm) : r.reasons[0]);
      });
    }
    function remove() { if (!armed) { setArmed(true); return; } setArmed(false); UD().removePack(c.ck); }
    var sw = h('button', { type: 'button', className: 'ed-switch', role: 'switch', 'aria-checked': c.active ? 'true' : 'false',
      'aria-label': c.name, disabled: isHeld, onClick: toggle, 'data-editor-switch': c.packId }, c.active ? 'On' : 'Off');
    var meta = p.dead ? recs.length + ' ' + plural(recs.length, 'record', 'records')
      : recs.length + ' ' + plural(recs.length, 'record', 'records') + ' · ' + changeTotal(recs) + ' ' + plural(changeTotal(recs), 'change', 'changes');
    var q = function (label, on, click, extra) { return h('button', Object.assign({ type: 'button', className: 'hp-quiet', onClick: click, 'data-on': on ? '1' : undefined }, extra || {}), label); };
    // R-FIEG-R5: an IMPORTED collection offers no Export for sharing — exportShare can only refuse it (the rail
    // refuses a share-projection record), so the control would be hollow. Export backup and Remove stay.
    var actions = p.dead ? null : h('div', { className: 'ed-btnrow', style: { marginTop: 12 } },
      own ? q('Export for sharing', p.sharing, function () { p.onShare(c.ck); }, { 'data-editor-share': c.packId }) : null,
      p.more && own ? q('Rename', ren != null, function () { setRen(ren == null ? c.name : null); setErr(''); }, { disabled: isHeld, 'data-held': isHeld ? '1' : undefined }) : null,
      p.more ? q(W.backup, p.backing, function () { p.onBackup(c.ck); }) : null,
      p.more && !my ? q('Remove', armed, remove, { disabled: isHeld, 'data-held': isHeld ? '1' : undefined, 'data-editor-remove': c.packId }) : null);
    var label = syncLabel(c, p.sync);   // F1 / F4 (R-MSMG-2: on the plate, both pages)
    // F7 (B-1172): on My Collections only (K3 (a)), for a kept row, signed in and not paused (frames-card item 9: otherwise the
    // label stands alone). One press, no second confirm: the store's one act (syncAgain), then the lane is nudged to send.
    var canAgain = !!(p.more && own && c.local && p.sync && !p.sync.paused && !isHeld);
    function syncAgain() {
      UD().syncAgain(c.ck).then(function (r) {
        if (!r || !r.ok) return;
        setAgain(true);
        var SY = window.SWRPGSync; if (SY && SY.packSend) SY.packSend();
      });
    }
    return h('div', { className: 'hp-plate', 'data-pad': 'read', 'data-editor-collection': c.packId },
      h('div', { className: 'ed-colhead' }, h('div', null, h('div', { className: 'ed-rn' }, c.name), h('div', { className: 'ed-rm' }, meta), apartLines(c, p.shown)), sw),
      again && !c.local ? null
        : label ? h('div', { className: 'ed-res-note', role: 'status', style: { marginTop: 10 }, 'data-ms-line': c.local ? 'removed' : 'didnt' }, label) : null,
      canAgain ? h('div', { style: { marginTop: 10 }, 'data-editor-syncagain': c.packId },
        h('div', { className: 'ed-btnrow' }, h('button', { type: 'button', className: 'hp-commit', onClick: syncAgain, 'data-editor-syncagain-go': c.packId }, MSW.syncAgain))) : null,
      p.records && recs.length ? h('div', { className: 'hp-bands', style: { marginTop: 8 } }, recs.map(function (r) {
        var item = ED() && (ED().OPEN_SHELVES || ED().ITEM_SHELVES).indexOf(r.section) !== -1;   // M5: talents and specializations open
        // P1b (R-FIL-10, census M-5 S2): a record of a kind the editor does not open yet keeps its name and kind line, drops
        // the ›, carries SOON, and is not focusable
        if (!item) return h('div', { key: r.section + '.' + r.id, className: 'ed-row ed-soon', 'data-soon': r.section, 'aria-disabled': 'true' },
          h('div', { className: 'ed-rb' }, h('div', { className: 'ed-rn' }, r.name, h(Soon)), h('div', { className: 'ed-rm' }, rowMeta(r))));
        var body = [h('div', { className: 'ed-rb', key: 'b' }, h('div', { className: 'ed-rn', 'data-yours': '1' }, r.name), h('div', { className: 'ed-rm' }, rowMeta(r))),
                    h('span', { className: 'ed-chev', key: 'c', 'aria-hidden': 'true' }, '›')];
        return item && p.onOpen ? h('button', { type: 'button', key: r.section + '.' + r.id, className: 'ed-row ed-recrow', onClick: function () { p.onOpen(c.ck, r); } }, body)
          : h('div', { key: r.section + '.' + r.id, className: 'ed-row' }, body);
      })) : null,
      h('div', { className: 'ed-glance', style: { marginTop: 10 }, 'data-off': c.active ? undefined : '1' }, plateGlance(c.name, recs)),
      ren != null ? h('div', { className: 'ed-rename' },
        h('input', { className: 'ed-input', value: ren, 'aria-label': 'Name', autoFocus: true, onChange: function (e) { setRen(e.target.value); setErr(''); },
          onKeyDown: function (e) { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setRen(null); } }),
        h('button', { type: 'button', className: 'hp-commit', onClick: saveName }, 'Save'),
        h('button', { type: 'button', className: 'hp-quiet', onClick: function () { setRen(null); setErr(''); } }, 'Cancel'),
        err ? h('div', { className: 'ed-hint', role: 'status', style: { flexBasis: '100%' } }, err) : null) : null,
      actions,
      my && p.more ? h('p', { className: 'ed-hint' }, W.myData) : null,
      armed ? h('div', { className: 'ed-arm', role: 'alert' },
        h('span', { className: 'ed-at' }, own ? W.rmOwn(c.name, usersOf(c.stamp, c.origin, c.packId, p.roster)) : W.rmImp(c.name)),
        h('div', { className: 'ed-btnrow' }, h('button', { type: 'button', className: 'ed-confirm', onClick: remove, 'aria-label': 'Tap again to confirm removing ' + c.name, 'data-editor-confirm': c.packId }, 'Tap again'))) : null);
  }

  // ── New collection / Import a collection (F1, F9; M6's outcomes) ──
  function CollectionTools(p) {
    var _n = useState(null), name = _n[0], setName = _n[1];
    var _e = useState(''), err = _e[0], setErr = _e[1];
    var _i = useState(null), imp = _i[0], setImp = _i[1];
    var fileRef = useRef(null);
    var isHeld = p.held;
    function create() {
      var nm = (name || '').trim();
      if (!nm) { setErr(W.giveName); return; }
      var U = UD(), base = slug(nm) || 'collection', id = base, n = 2;
      var have = {}; (U.list() || []).forEach(function (c) { have[c.packId] = true; });
      if (base === (U.MY_DATA || 'my_data')) id = base = base + '_2';
      while (have[id]) id = base + '_' + (n++);
      U.createPack({ packId: id, name: nm }).then(function (r) {
        if (r.ok) { setName(null); setErr(''); if (p.onCreated) p.onCreated(id); }
        else setErr(String(r.reasons[0]).indexOf('name-taken') === 0 ? W.nameTaken(nm) : r.reasons[0]);
      });
    }
    function onFile(e) {
      var f = e.target.files && e.target.files[0]; e.target.value = '';
      if (!f) return;
      f.text().then(function (text) { return UD().importPack(text); }).then(function (r) { setImp(r); }, function () { setImp({ ok: false, reasons: ['not-json'] }); });
    }
    return h('div', null,
      h('div', { className: 'ed-btnrow', style: { marginTop: p.gap || 12 } },
        h('button', { type: 'button', className: 'hp-quiet', disabled: isHeld, 'data-held': isHeld ? '1' : undefined, onClick: function () { if (fileRef.current) fileRef.current.click(); }, 'data-editor-import': '1' }, 'Import a collection'),
        h('button', { type: 'button', className: 'hp-quiet', disabled: isHeld, 'data-held': isHeld ? '1' : undefined, 'data-on': name != null ? '1' : undefined,
          onClick: function () { setName(name == null ? '' : null); setErr(''); }, 'data-editor-new': '1' }, 'New collection'),
        h('input', { ref: fileRef, type: 'file', accept: '.json,application/json', style: { display: 'none' }, onChange: onFile, 'data-editor-file': '1' })),
      name != null ? h('div', { className: 'hp-plate', 'data-pad': 'read', style: { marginTop: 12 } },
        h('div', { className: 'ed-fk' }, 'New collection'),
        h('div', { className: 'ed-rename', style: { marginTop: 4 } },
          h('input', { className: 'ed-input', value: name, 'aria-label': 'Name', autoFocus: true, onChange: function (e) { setName(e.target.value); setErr(''); },
            onKeyDown: function (e) { if (e.key === 'Enter') create(); if (e.key === 'Escape') setName(null); }, 'data-editor-newname': '1' }),
          h('button', { type: 'button', className: 'hp-commit', onClick: create }, 'Save'),
          h('button', { type: 'button', className: 'hp-quiet', onClick: function () { setName(null); setErr(''); } }, 'Cancel')),
        err ? h('div', { className: 'ed-hint', role: 'status' }, err) : null) : null,
      imp ? h('div', { className: 'hp-plate', 'data-pad': 'read', style: { marginTop: 12 }, 'data-editor-import-result': '1' },
        h('div', { className: 'ed-fk' }, 'Import a collection'), importLine(imp)) : null);
  }
  function importLine(r) {
    if (r.ok) {
      var U = UD(), c = (U.list() || []).filter(function (x) { return r.ck ? x.ck === r.ck : x.packId === r.packId; })[0], nm = c ? c.name : r.packId;
      if (r.status === 'newer-format') return h('div', { className: 'ed-res-refuse', role: 'status' }, W.impNewer);
      var head = r.restored ? MSW.restored(nm) : r.newVersion ? W.impNew(nm) : r.sameVersion ? W.impSame(nm) : W.impAdded(nm);   // F5 (a)
      return [h('div', { className: 'ed-res-h', role: 'status', key: 'h' }, head), countsLine(r) ? h('div', { className: 'ed-res-counts', key: 'c' }, countsLine(r)) : null];
    }
    var why = String((r.reasons && r.reasons[0]) || '');
    var t = /^(not-json|not-a-pack)/.test(why) ? W.impNotJson : /^already-here/.test(why) ? MSW.alreadyHere : /^pack-id-taken/.test(why) ? W.impTaken : /^rail-unavailable/.test(why) ? W.impUnchecked : W.impRejected;
    return h('div', { className: 'ed-res-refuse', role: 'status' }, t);
  }
  // THE ONE LINE NOT SPECCED (f100-m2c-frames L4): importPack's kept / unapplied counts, in the voice (as M6 draws it)
  function countsLine(r) {
    var p = [];
    if (r.kept) p.push(r.kept + (r.kept === 1 ? ' record has' : ' records have') + ' errors');
    if (r.unapplied) p.push(r.unapplied + (r.unapplied === 1 ? ' record uses' : ' records use') + ' something this app doesn’t know');
    return p.length ? p.join(' and ') + '. ' + (r.kept + r.unapplied === 1 ? 'It’s' : 'They’re') + ' kept with the collection but not used.' : '';
  }

  // ── Export for sharing (F9 before; M1/M1b after) and Back up (S5) ──
  // exportShare's warnings, read into M1's words: the records left out (with their reasons) and the book-moved notes
  function shareReport(r, recs) {
    var byKey = {}; recs.forEach(function (x) { byKey[x.section + '.' + x.id] = x.name; });
    var lo = [], mv = [], out = {};
    (r.warnings || []).forEach(function (w) {
      var m = /^([^.:]+)\.([^:]+): ([a-z-]+)/.exec(w); if (!m) return;
      var nm = byKey[m[1] + '.' + m[2]] || m[2];
      if (W.lo[m[3]]) { lo.push({ name: nm, reason: m[3] }); out[m[1] + '.' + m[2]] = true; } else if (m[3] === 'base-moved') mv.push(nm);
    });
    return { lo: lo, mv: mv, carried: recs.filter(function (x) { return !out[x.section + '.' + x.id]; }) };
  }
  function leftOutLines(lo) {
    return h(React.Fragment, { key: 'lo' }, lo.length ? h('div', { className: 'ed-res-sub' }, W.leftOut(lo.length)) : null,
      lo.map(function (x, i) { return h('div', { className: 'ed-res-l', key: 'l' + i, 'data-editor-leftout': '1' }, h('b', null, x.name), ' — ' + W.lo[x.reason]); }));
  }
  function refusal(r) {
    var why = String((r.reasons && r.reasons[0]) || '');
    return h('div', { className: 'ed-res-refuse', role: 'status', 'data-editor-refused': /^nothing-to-share/.test(why) ? 'nothing-to-share' : 'unknown' }, /^nothing-to-share/.test(why) ? W.nothing : W.unknown);
  }
  function SharePanel(p) {
    var c = p.col, recs = p.recs;
    var _r = useState(null), res = _r[0], setRes = _r[1];
    // THE PREVIEW IS exportShare's OWN ANSWER (R-FIEG-R2): a dry run of the export, never a second reading of the records
    var _d = useState(null), dry = _d[0], setDry = _d[1];
    var recKey = recs.map(function (r) { return r.section + '.' + r.id + ':' + r.changes; }).join('|');
    useEffect(function () { setRes(null); }, [c && c.ck]);
    useEffect(function () {
      if (!c) return; var alive = true; setDry(null);
      UD().exportShare(c.ck).then(function (r) { if (alive) setDry(r); }, function () { if (alive) setDry({ ok: false, reasons: [] }); });
      return function () { alive = false; };
    }, [c && c.ck, recKey]);
    if (!c) return null;
    function go() {
      UD().exportShare(c.ck).then(function (r) {
        setRes(r);
        if (r.ok) download(slug(c.name) + '.json', r.text);
      });
    }
    var body, refused;
    if (!res && !dry) body = h('div', { 'aria-busy': 'true', style: { margin: '8px 0' } }, h(Wait, { w: '100%' }));
    else if (!res && dry.ok) {
      var rp = shareReport(dry, recs), cr = rp.carried;
      var anchored = cr.some(function (r) { return r.anchored; });
      body = [
        h('p', { className: 'hp-prose', key: 'p', style: { margin: '4px 0 8px' } }, 'The file carries ', h('b', null, 'only your changes'), ': ' + cr.length + ' ' + plural(cr.length, 'record', 'records') + ', '
          + changeTotal(cr) + ' ' + plural(changeTotal(cr), 'change', 'changes') + '.'),
        cr.length ? h('table', { className: 'hp-ledger', key: 't' }, h('tbody', { className: 'hp-bands' }, cr.map(function (r) {
          return h('tr', { key: r.section + '.' + r.id }, h('td', { className: 'hp-lkey' }, r.name), h('td', { className: 'hp-lval', style: { fontSize: 15 } },
            (r.baseName ? 'from ' + r.baseName : 'new ' + kindWord(r.section, 1)) + (r.changes != null ? ' · ' + r.changes + ' ' + plural(r.changes, 'change', 'changes') : '')));
        }))) : null,
        leftOutLines(rp.lo),
        anchored ? h('p', { className: 'ed-hint', key: 'w' }, W.whoever) : null];
    } else if (!res) { body = refusal(dry); refused = true; }
    else if (res.ok) {
      var n = 0; Object.keys(res.pack.sections || {}).forEach(function (s) { n += Object.keys(res.pack.sections[s]).length; });
      var rr = shareReport(res, recs);
      body = [h('div', { className: 'ed-res-h', role: 'status', key: 'h' }, W.shared(n)),
        leftOutLines(rr.lo),
        rr.mv.map(function (nm, i) { return h('div', { className: 'ed-res-note', key: 'm' + i }, W.moved(nm)); })];
    } else { body = refusal(res); refused = true; }
    return h('div', { className: 'hp-plate', 'data-pad': 'read', 'data-editor-sharing': c.packId },
      h('div', { className: 'ed-fk' }, 'Export for sharing · ' + c.name), apartLines(c, p.shown, { marginTop: 2 }), body,
      refused || (!res && !dry) ? null : h('div', { className: 'ed-btnrow', style: { marginTop: 14 } },
        h('button', { type: 'button', className: 'hp-commit', onClick: res && res.ok ? function () { download(slug(c.name) + '.json', res.text); } : go, 'data-editor-save-share': '1' }, 'Save the file')));
  }
  function BackupPanel(p) {
    var c = p.col, recs = p.recs; if (!c) return null;
    function go() { UD().exportFull(c.ck).then(function (r) { if (r.ok) download(slug(c.name) + '-backup.json', r.text); }); }
    return h('div', { className: 'hp-plate', 'data-pad': 'read', 'data-editor-backup': c.packId },
      h('div', { className: 'ed-fk' }, 'Back up · ' + c.name), apartLines(c, p.shown, { marginTop: 2 }),
      recs.length ? h('table', { className: 'hp-ledger' }, h('tbody', { className: 'hp-bands' }, recs.map(function (r) {
        return h('tr', { key: r.section + '.' + r.id }, h('td', { className: 'hp-lkey' }, r.name), h('td', { className: 'hp-lval', style: { fontSize: 15 } }, 'whole record'));
      }))) : null,
      h('div', { className: 'ed-btnrow', style: { marginTop: 10 } }, h('button', { type: 'button', className: 'hp-commit', onClick: go, 'data-editor-save-backup': '1' }, 'Save the backup')));
  }

  // ── the collections, in display order: own (HOME first — R-SII-4; another device's My Data is an ordinary own row) then imported ──
  function ordered(list) {
    var own = list.filter(function (c) { return c.origin === 'own'; }), imp = list.filter(function (c) { return c.origin !== 'own'; });
    own.sort(function (a, b) { return (a.home ? -1 : 0) - (b.home ? -1 : 0); });
    return own.concat(imp);
  }

  // ── HOME (F1; S2 loading; S3 books not loaded; M7 banners) ──
  function Home(p) {
    var books = p.books, store = p.store, wide = p.wide, dead = books.state === 'error', loading = books.state === 'loading' || !store.ready;
    var cols = store.list ? ordered(store.list) : [];
    var yours = {};
    cols.forEach(function (c) { if (c.origin !== 'own') return; recordsOf(c.ck, books).forEach(function (r) { yours[r.section] = (yours[r.section] || 0) + 1; }); });
    var total = books.shelves ? books.shelves.reduce(function (a, s) { return a + s.count; }, 0) : null;
    var head = [h('div', { className: 'hp-maker', key: 'm' }, p.appName + ' · make your own'), h('h1', { className: 'hp-desig', key: 'd' }, 'Homebrew'),
      h('div', { className: 'hp-desig-rule', key: 'r' })];
    var legendBlock = wide ? h('div', { className: 'hp-plate', 'data-pad': 'read', style: { marginTop: 14 } }, h(Legend))
      : h('div', { className: 'hp-plate', 'data-pad': 'data', style: { marginTop: 14 } }, h(Legend));
    var shelfList = (books.shelves || SHELVES.map(function (s) { return { key: s[0], label: s[1] }; })).map(function (s) {
      if (loading) return h('div', { className: 'hp-plate ed-shelf', 'data-pad': 'read', 'aria-busy': 'true', key: s.key },
        h('div', { className: 'ed-top' }, h('span', { className: 'ed-t' }, s.label), h('span', { className: 'ed-fig', style: { minWidth: '3em', paddingTop: 6 } }, h(Wait, { w: '2.6em' }))),
        h('div', { className: 'ed-roll', style: { display: 'grid', gap: 7, padding: '4px 0 2px' } }, h(Wait, { w: '92%' }), h(Wait, { w: '64%' })));
      if (dead) return h('div', { className: 'hp-plate ed-shelf', 'data-pad': 'read', key: s.key },
        h('div', { className: 'ed-top' }, h('span', { className: 'ed-t' }, s.label)), h('div', { className: 'ed-fld' }, h('span', null, 'Books'), h('i', null, 'Not loaded')));
      var y = yours[s.key] || 0, isItem = (ED().OPEN_SHELVES || ED().ITEM_SHELVES).indexOf(s.key) !== -1;   // U6: SOON lifts off talents and specializations
      var top = h('div', { className: 'ed-top', key: 't' }, h('span', { className: 'ed-t' }, s.label, isItem ? null : h(Soon)), h('span', { className: 'ed-fig' }, h('b', null, num(s.count)), h('i', null, 'in the books')));
      var roll = h('div', { className: 'ed-roll', key: 'r' }, s.samples.join(' · '));
      // P1 SOON (R-FIL-7): a shelf that does not open yet keeps its label, real count and samples; it drops "none yours yet"
      // and the › (a chevron promises a destination), carries SOON, and is a plate that cannot be focused or tapped
      if (!isItem) return h('div', { className: 'hp-plate ed-shelf ed-soon', 'data-pad': 'read', key: s.key, 'data-editor-shelf': s.key, 'data-soon': s.key, 'aria-disabled': 'true' }, top, roll);
      return h('button', { type: 'button', className: 'hp-plate ed-shelf', 'data-pad': 'read', key: s.key, 'data-editor-shelf': s.key, onClick: function () { p.go({ view: 'shelf', shelf: s.key }); } },
        top, roll, h('div', { className: 'ed-foot', key: 'f' }, y ? h('span', { className: 'ed-yours' }, y + ' yours') : h('span', { className: 'ed-rm' }, 'none yours yet'), h('span', { className: 'ed-chev', 'aria-hidden': 'true' }, '›')));
    });
    var isHeld = held(store) || dead;
    var colBlock = loading && !store.ready ? h('div', { className: 'hp-plate', 'data-pad': 'read', 'aria-busy': 'true', style: { maxWidth: wide ? 640 : undefined } },
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 } }, h('div', { style: { display: 'grid', gap: 8, flex: 1 } }, h(Wait, { w: '9em' }), h(Wait, { w: '6em' })), h(Wait, { w: '3em' })),
        h('div', { style: { marginTop: 12 } }, h(Wait, { w: '100%' })))
      : cols.map(function (c, i) {
        return h('div', { key: c.ck, style: { marginTop: i ? 12 : 0, maxWidth: wide ? 640 : undefined } },
          h(CollectionPlate, { col: c, recs: recordsOf(c.ck, books), records: wide && !dead, dead: dead, held: held(store), roster: p.roster, sync: store.sync, shown: cols,
            onShare: function (id) { p.go({ view: 'collections' }, { share: id }); }, onOpen: p.openRecord }));
      });
    var tools = dead ? null : h(CollectionTools, { held: isHeld, onCreated: function () {} });
    var notice = dead ? h('div', { className: 'ed-notice', role: 'status', style: { marginTop: 14 } }, h('span', { className: 'ed-notice-t' }, W.booksDead),
      h('button', { type: 'button', className: 'hp-quiet', onClick: function () { p.retry(true); } }, 'Retry')) : null;
    var banner = h(Banner, { status: store.status, onBackup: function () { p.go({ view: 'collections' }, { backup: homeCk() }); } });
    var colsHead = h(Sechead, { t: 'My collections', aside: store.ready ? String(cols.length) : null });
    var shelvesHead = h(Sechead, { t: 'Shelves', aside: SHELVES.length + ' kinds' });
    if (!wide) return h('div', { className: 'ed-pad' }, h(Runhead, { back: p.appName, right: 'Homebrew', onBack: p.exit }), banner, head, notice,
      dead ? null : legendBlock, shelvesHead, h('div', { className: 'ed-shelves' }, shelfList), colsHead, colBlock, tools);
    return h('div', { className: 'ed-desk' }, h(Runhead, { back: p.appName, right: 'Homebrew' + (total != null && !dead ? ' · ' + num(total) + ' records to start from' : ''), onBack: p.exit }), banner,
      dead ? h('div', { style: { maxWidth: 900 } }, head, notice)
        : h('div', { className: 'ed-dgrid', style: { gridTemplateColumns: 'minmax(0,1fr) 420px', marginTop: 8 } }, h('div', null, head), legendBlock),
      shelvesHead, h('div', { className: 'ed-shelves' }, shelfList), colsHead,
      dead ? colBlock : h('div', { className: 'ed-dgrid', style: { gridTemplateColumns: 'minmax(0,640px) 1fr' } }, h('div', null, colBlock),
        h('div', null, tools)));
  }

  // ── MY COLLECTIONS (F9 + rename; M1/M1b; M6; M11; S5) ──
  function Collections(p) {
    var store = p.store, books = p.books, wide = p.wide;
    var cols = store.list ? ordered(store.list) : [];
    var pick = function (ck) { return cols.filter(function (c) { return c.ck === ck; })[0] || null; };
    var ownCols = cols.filter(function (c) { return c.origin === 'own'; });
    var firstWith = ownCols.filter(function (c) { return c.records > 0; })[0] || ownCols[0] || null;
    var _s = useState(p.intent && p.intent.share || null), shareId = _s[0], setShare = _s[1];
    var _b = useState(p.intent && p.intent.backup || null), backupId = _b[0], setBackup = _b[1];
    // the Sharing panel shows OWN collections only (R-FIEG-R5): a share intent or a Back-up press naming an imported one falls to firstWith
    var shareOwn = pick(shareId), shareCol = (shareOwn && shareOwn.origin === 'own' ? shareOwn : null) || firstWith, backCol = pick(backupId) || shareCol;
    var recsBy = {}; cols.forEach(function (c) { recsBy[c.ck] = recordsOf(c.ck, books); });
    var list = cols.map(function (c, i) {
      return h('div', { key: c.ck, style: { marginTop: i ? 12 : 0 } }, h(CollectionPlate, { col: c, recs: recsBy[c.ck], records: true, more: true, held: held(store), roster: p.roster, sync: store.sync, shown: cols,
        sharing: shareCol && shareCol.ck === c.ck, backing: backupId === c.ck,
        onShare: function (id) { setShare(id); }, onBackup: function (id) { setBackup(id); setShare(id); }, onOpen: p.openRecord }));
    });
    var head = [h('div', { className: 'hp-maker', key: 'm' }, 'Homebrew'), h('h1', { className: 'hp-desig', key: 'd' }, 'My collections')];
    var tools = h(CollectionTools, { held: held(store), gap: 14 });
    var glances = h('div', { className: 'hp-plate', 'data-pad': 'read' },
      cols.map(function (c) { return h('div', { key: c.ck, className: 'ed-glance', style: { marginTop: 6 }, 'data-off': c.active ? undefined : '1' }, plateGlance(c.name, recsBy[c.ck]) + (c.active ? '' : ' · off'), apartLines(c, cols, { marginTop: 2 })); }));
    var side = [h(Sechead, { t: 'Sources', key: 'sh' }), h('div', { key: 'sg' }, glances),
      h(Sechead, { t: 'Sharing', key: 'xh' }), h(SharePanel, { key: 'xp', col: shareCol, recs: shareCol ? recsBy[shareCol.ck] : [], shown: cols }),
      h(Sechead, { t: 'Backup', key: 'bh' }), h(BackupPanel, { key: 'bp', col: backCol, recs: backCol ? recsBy[backCol.ck] : [], shown: cols })];
    // F2 (a): the pause line in the page's notice slot, under the store's own Banner; never on a memory store (R-MSB-16)
    var banner = [h(Banner, { key: 'st', status: store.status, onBackup: function () { setBackup(homeCk()); } }),
      pauseShows(store.status, store.sync) ? h('div', { key: 'ps', className: 'ed-banner', role: 'status', 'data-ms-line': 'paused' }, h('span', { className: 'ed-bt' }, MSW.paused)) : null];
    var rh = h(Runhead, { back: 'Homebrew', right: 'Collections · ' + cols.length, onBack: function () { p.go({ view: 'home' }); } });
    if (!wide) return h('div', { className: 'ed-pad' }, rh, banner, head, h(Sechead, { t: 'Collections', aside: String(cols.length) }), list, tools, side);
    return h('div', { className: 'ed-desk' }, rh, banner, head,
      h('div', { className: 'ed-dgrid', style: { gridTemplateColumns: 'minmax(0,1fr) 520px', marginTop: 10 } },
        h('div', null, h(Sechead, { t: 'Collections', aside: String(cols.length) }), list, tools), h('div', null, side)));
  }

  // ══ STEP D — THE ITEM SHELVES AND FORMS (I-1 … I-13; F2, F5, F8, S1, S4 — `f100-items-frames` R-FIFG-5 + ADDENDUM 1,
  // `f100-items-qualities-class`, `f100-items-share-residual`). Every figure and chip is computed at render from the
  // loaded books and the store; the preview reads the store's own projection (lib/items.js canonicalToStore). ══
  var CHIPW = { resolves: 'AUTOMATIC', reminds: 'SITUATIONAL', prints: 'NARRATIVE' };
  var KIND1 = { weapons: 'weapon', armor: 'armor', gear: 'gear', talents: 'talent', specializations: 'specialization', species: 'species', force_powers: 'Force power', careers: 'career', signature_abilities: 'signature ability' };
  var DIES = ['boost', 'setback', 'difficulty', 'challenge', 'force'];
  var DIE_TOKEN = { boost: 'BO', setback: 'SE', difficulty: 'DI', challenge: 'CH', force: 'FO' };
  var SYM_TOKEN = { success: 'SU', advantage: 'AD' };   // a result symbol's glyph, as the sheet draws it (R-M8BG-6)
  var GROUPS = ['general', 'combat', 'social', 'knowledge'];
  var RANGES = ['engaged', 'short', 'medium', 'long', 'extreme'];
  var IW = {
    // ── the ruled words (f100-items-editor-contracts §3–§4, f100-items-frames ADDENDUM 1), verbatim ──
    conflict: 'You and the book both changed this.',
    headNoConflict: function (nm) { return nm + ', the book record this started from, has changed. Nothing in yours has changed. Pick what to keep.'; },   // J2 (ii)
    headConflict: function (nm) { return nm + ', the book record this started from, has changed. Pick what to keep.'; },                                  // J3 (ii)
    newFrom: function (k, nm) { return (k === 'armor' || k === 'gear' ? 'New ' : 'A new ') + k + ', from ' + nm; },                                        // J4 (b)
    changeBook: function (nm) { return 'Change the book’s ' + nm; },
    already: function (col, nm) { return 'Your ' + col + ' already changes ' + nm + '.'; },
    copyTo: function (col) { return 'Copy to ' + col; },
    oneColl: function (nm) { return 'A change to the book’s ' + nm + ' lives in one collection.'; },
    rulesDo: 'What its rules do', noRules: 'No rules', none: '—',
    sec: { what: 'What it is', protection: 'Protection', carrying: 'Carrying it', buying: 'Buying it', play: 'In play', text: 'Text for the table', attack: 'The attack', qualities: 'Qualities' },
    addSentence: 'Add a sentence for the table (optional)', addDice: '+ Add dice', addDiceLine: '+ Add a dice line',
    eyebrowNew: function (k) { return k.charAt(0).toUpperCase() + k.slice(1) + ' · new'; },
    leave: function (nm) { return 'Leave without saving? Your changes to ' + nm + ' will be lost.'; },
    // P3b (ii), Jason's pick (ruling f100-items-live-contracts R-FILC-1, A4-1): true for weapon, armor and gear on both sheets (M-3)
    del: function (nm) { return 'Delete ' + nm + '? Characters that have it can still be played, but it becomes an unknown item that does nothing.'; },
    leaveB: 'Leave', keepB: 'Keep editing',
    // P5 / P5b (R-FIL-2 C3; R-FILC-4 C3.b): a save refused because another tab got there first — I-10's refusal idiom
    notSaved: 'Not saved.',
    changedTab: function (k) { return 'This ' + k + ' was changed in another tab after you opened it here.'; },
    showThat: 'Show that version', saveMine: 'Save mine over it',
    removedTab: 'This collection was removed in another tab. Pick where to save it, then save again.',
    imported: function (col) { return 'From ' + col + ' · imported. You can’t change it here.'; },
    ownCopy: 'Make your own copy', newColl: 'New collection',
    reasonsHead: 'Not saved yet.',
    reasons: { name: 'Give it a name.', skill: 'Pick the skill it uses.' },
    keepMine: 'Keep mine', takeBook: 'Take the book’s',
    missing: function (nm) { return 'The ' + nm + ' this started from is not in this version of the app, so there is nothing to compare yours with. Yours is kept and still used, exactly as it is.'; },
    empty: function (n, pl) { return 'None of the ' + num(n) + ' ' + pl + ' here are yours yet.'; },
    // ── implementer's chrome words (undrawn; each listed in the D gate for the architect's review) ──
    reasonsMore: { damage: 'Give it its damage.', crit: 'Give it a critical number.', range: 'Pick its range.', type: 'Pick its type.', soak: 'Give it a soak or a defense.', defense: 'Give it a soak or a defense.' },
    reasonOther: function (label) { return 'Check ' + label + '.'; },
    noMatch: function (q) { return 'Nothing here matches “' + q + '”.'; },
    kept: 'Kept yours.', took: 'Took the book’s.', undo: 'Undo',
    removeLine: 'Remove this line', removeDice: 'Remove these dice',
    anyCheck: 'Choose the checks', noCond: 'No condition', unsettled: 'Not settled',
    saved: 'Saved.', addQ: function (s) { return 'Add ' + s; }, qCount: function (m, t) { return m + ' of ' + t + ' qualities'; },
  };
  var FIELD_LABEL = { name: 'Name', type: 'Type', description: 'Description', skill: 'Skill', damage: 'Damage', crit: 'Critical', range: 'Range', encumbrance: 'Encumbrance',
    hardpoints: 'Hardpoints', price: 'Price', rarity: 'Rarity', restricted: 'Restricted', qualities: 'Qualities', soak: 'Soak', defense: 'Defense',
    base_mods: 'In play · sentences', pool_mods: 'In play · dice', encumbrance_threshold_bonus: 'Encumbrance threshold', threshold_bonus_requires: 'Encumbrance threshold', short: 'Short text' };

  function EC() { return window.SWRPGEffectClass; }
  function SI() { return window.SWItems; }
  function clone(v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); }
  function capf(s) { return s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : s; }
  function glyph(s) { var G = window.SWRPGUI; return G && typeof G.glyphText === 'function' ? G.glyphText(String(s == null ? '' : s)) : String(s == null ? '' : s); }
  function chipOf(cls) { return CHIPW[cls] || 'NARRATIVE'; }
  function fieldChip(sec, field, value) { var c = EC() ? EC().fieldClassOf(sec, field, value) : null; return chipOf(c === 'resolves' ? 'resolves' : 'prints'); }
  function recChips(rec, sec) { return EC() ? EC().classesOf(rec, sec).map(chipOf) : []; }
  // R-M12B-136: a form field on an M12 key arm is chipped by SWRPGEffectClass.keyFieldClassOf, the key its one further input
  function keyChip(sec, field) { return chipOf(EC() ? EC().keyFieldClassOf(sec, field) : 'prints'); }
  function toStore(rec, sec) { return (SI() && SI().canonicalToStore(rec, sec)) || {}; }
  function para1(s) { return String(s || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean)[0] || ''; }

  // ── the vocabularies the forms offer (skills, qualities; the books' labels), fetched once ──
  var vocabP = null;
  function loadVocab() {
    if (vocabP) return vocabP;
    var S = window.SWRPGSources;
    vocabP = Promise.all([fetchJson('/public/data/canonical/skills.vocab.json'), fetchJson('/public/data/canonical/qualities.vocab.json'),
      S && S.ready ? S.ready().catch(function () { return null; }) : Promise.resolve(null)]).then(function (r) {
      return { skills: r[0].entries || [], qualities: r[1].entries || [] };
    }, function (e) { vocabP = null; throw e; });
    return vocabP;
  }
  function useVocab() {
    var _v = useState(null), v = _v[0], set = _v[1];
    useEffect(function () { var alive = true; loadVocab().then(function (x) { if (alive) set(x); }, function () { if (alive) set({ skills: [], qualities: [] }); }); return function () { alive = false; }; }, []);
    return v;
  }
  function bookLabel(src) {
    var S = window.SWRPGSources, c = S && S.current ? S.current() : null;
    return S && S.sourceLabel ? S.sourceLabel(c && c.index, src) : src;
  }
  function booksOf(rec) { return ((rec && rec.sources) || []).map(bookLabel); }
  // M12 (R-M12B-125, D-M12E2 (a)): a signature ability's book carries its printed page, "Fly Casual · p. 39" (F2 (d)), read
  // from the record's own `cite` {book: sources[0], page}; a record without one (a user's) prints its books alone
  function sigBooksOf(rec) {
    var b = booksOf(rec), c = rec && rec.cite, s0 = rec && rec.sources && rec.sources[0];
    // B-336 (ADDENDUM 62, (C)): the cite's book is the FIRST source when the two name one book, in any form (key, alias, title)
    if (b.length && c && typeof c.page === 'number' && typeof c.book === 'string' && (c.book === s0 || bookLabel(c.book) === bookLabel(s0))) b[0] = b[0] + ' · p. ' + c.page;
    return b;
  }
  function skillLabel(id, vocab) {
    var e = vocab && vocab.skills.filter(function (x) { return x.id === id; })[0];
    return e ? e.label : (SI() ? SI().skillRefLabel(id) : id);
  }
  function anchorLabel(p, vocab) {
    var a = (Array.isArray(p.applies_to) ? p.applies_to : []).map(function (x) {
      return x.scope === 'skill' ? skillLabel(x.value, vocab) : x.scope === 'group' ? capf(x.value) : x.scope === 'all' ? 'all' : capf(x.value);
    });
    return a.length > 1 ? a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1] : (a[0] || '');
  }
  // R-FIEC-2 Q2, the read-aloud, RENDERED at display time and never stored: `Add/Remove N [DIE] to <anchor> checks[, when <condition>]`
  function readAloud(p, vocab) {
    var cond = p.condition ? String(p.condition).replace(/^when\s+/i, '') : '';
    var anc = anchorLabel(p, vocab);
    if (p.direction === 'reroll') return 'Reroll one of ' + (anc || '…') + ' checks';   // F-100 THE SURFACING MISSION (V5)
    return (p.direction === 'remove' ? 'Remove ' : 'Add ') + p.count + ' [' + (DIE_TOKEN[p.die] || '') + '] to ' + (anc || '…') + ' checks' + (cond ? ', when ' + cond : '');
  }

  // R-FIL-6 / R-FILC-11 (10): a remove control's accessible name is its visible text plus the line it removes, the dice read as a
  // person would — a count, never a repeated word ("2 Boost dice"); a result symbol is counted too ("2 Threats"). The names are
  // the dice module's own (SWRPGDice.SYMBOLS). The helper is the implementer's (named in the gate).
  var DIE_KINDS = ['ability', 'proficiency', 'boost', 'difficulty', 'challenge', 'setback', 'force'];
  var SYM_PLURAL = { Success: 'Successes', Advantage: 'Advantage', 'Light side': 'Light side', 'Dark side': 'Dark side' };
  function countWords(tok, n) {
    var D = window.SWRPGDice || {}, key = D.BRACKET_TOKENS && D.BRACKET_TOKENS[tok], sym = key && D.SYMBOLS && D.SYMBOLS[key];
    if (!sym) return '';
    if (DIE_KINDS.indexOf(key) !== -1) return n + ' ' + sym.label + (n === 1 ? ' die' : ' dice');
    return n + ' ' + (n === 1 ? sym.label : (SYM_PLURAL[sym.label] || sym.label + 's'));
  }
  function spoken(s) {
    return String(s == null ? '' : s)
      .replace(/(\d+) \[([A-Z]{2})\]/g, function (m, n, k) { return countWords(k, +n) || m; })
      .replace(/(?:\[[A-Z]{2}\])+/g, function (run) {
        var parts = [];
        run.match(/[A-Z]{2}/g).forEach(function (k) { var l = parts[parts.length - 1]; if (l && l.k === k) l.n++; else parts.push({ k: k, n: 1 }); });
        var w = parts.map(function (x) { return countWords(x.k, x.n); }).filter(Boolean);
        return w.length > 1 ? w.slice(0, -1).join(', ') + ' and ' + w[w.length - 1] : (w[0] || '');
      }).replace(/\s+/g, ' ').trim();
  }

  // ── every record a shelf holds: the books, and YOURS across every collection (own and imported) ──
  function bookRecOf(books, sec, id) { var t = books && books.sections && books.sections[sec]; return t && Object.prototype.hasOwnProperty.call(t, id) ? t[id] : null; }
  function recordIn(ck, sec, id, books) {
    var U = UD(), p = U && U.get(ck);
    var raw = p && isObj(p.pack) && isObj(p.pack.sections) && isObj(p.pack.sections[sec]) ? p.pack.sections[sec][id] : null;
    if (!isObj(raw)) return null;
    var inBook = !!bookRecOf(books, sec, id);
    var mode = raw._mode || (inBook ? 'redefine' : 'add');
    var baseId = mode === 'derive' && isObj(raw._base) ? raw._base.id : mode === 'redefine' ? id : null;
    var book = baseId ? bookRecOf(books, sec, baseId) : null;
    var eff = raw._changes && book ? U.rebuildShare(book, raw) : raw;
    var rec = {}; Object.keys(eff).forEach(function (k) { if (k.charAt(0) !== '_') rec[k] = clone(eff[k]); });
    rec.id = id;
    // R-FIEC-4: a book-anchored record's sources are the LIVE book's, supplied here at view time
    if (book && (mode === 'derive' || mode === 'redefine')) rec.sources = clone(book.sources || []);
    var col = (U.list() || []).filter(function (c) { return c.ck === p.ck; })[0] || {};
    var bstate = mode === 'add' ? 'custom' : U.baseState(sec, id, raw);
    var changed = book ? U.bookChanged(sec, id, raw) : false;
    return { ck: p.ck, packId: p.packId, id: id, sec: sec, raw: raw, eff: eff, rec: rec, mode: mode, baseId: baseId, book: book, origin: p.origin, colName: col.name || p.packId,
             active: !!col.active, state: bstate === 'base-missing' ? 'missing' : changed ? 'moved' : 'unchanged' };
  }
  function yoursOf(sec, books, store) {
    var out = [];
    (store.list ? ordered(store.list) : []).forEach(function (c) {
      var U = UD(), p = U.get(c.ck), s = p && p.pack && p.pack.sections && p.pack.sections[sec];
      if (!isObj(s)) return;
      Object.keys(s).forEach(function (id) { var r = recordIn(c.ck, sec, id, books); if (r) out.push(r); });
    });
    return out.sort(function (a, b) { return String(a.rec.name || '').localeCompare(String(b.rec.name || '')); });
  }
  function yoursLine(y) {
    var k = KIND1[y.sec], bn = y.book ? y.book.name : null;
    return y.colName + (y.mode === 'redefine' ? ' · changes the book’s' + (bn ? ' · from ' + bn : '') : ' · new ' + k + (bn ? ' · from ' + bn : ''))
      + (y.origin === 'imported' ? ' · imported' : '') + (y.active ? '' : ' · off');
  }
  var SHCOL = { weapons: [['Skill', 'skill'], ['Damage', 'damage'], ['Crit', 'crit'], ['Range', 'range']],
                armor: [['Defense', 'defense'], ['Soak', 'soak'], ['Encumbrance', 'encumbrance']],
                gear: [['Encumbrance', 'encumbrance']] };
  var OPEN_GROUPS = 4;
  function cell(v) { return v == null || v === '' ? IW.none : String(v); }
  function shelfRow(rec, sec) {
    var s = toStore(rec, sec), chips = recChips(rec, sec);
    return { id: rec.id, name: rec.name || '', type: rec.type || '', chips: chips, s: s, book: booksOf(rec)[0] || '',
             key: chips.length ? chips.join('+') : 'none' };
  }
  function railCounts(rows) {
    var c = { AUTOMATIC: 0, SITUATIONAL: 0, NARRATIVE: 0, 'No rules': 0 };
    rows.forEach(function (r) { if (!r.chips.length) c['No rules']++; else r.chips.forEach(function (x) { c[x]++; }); });
    return c;
  }
  function matchCls(r, cls) { return !cls || (cls === 'No rules' ? !r.chips.length : r.chips.indexOf(cls) !== -1); }
  function matchQ(name, q) { return !q || String(name || '').toLowerCase().indexOf(q.toLowerCase()) !== -1; }
  var shelfCache = {};
  function bookRowsOf(books, sec) {
    var t = books.sections && books.sections[sec];
    if (!t) return [];
    if (shelfCache[sec] && shelfCache[sec].t === t) return shelfCache[sec].rows;
    var rows = Object.keys(t).map(function (id) { return shelfRow(t[id], sec); }).sort(function (a, b) { return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }); });
    shelfCache[sec] = { t: t, rows: rows };
    return rows;
  }

  // ── I-1 THE SHELF (F2's arrangement; S1's empty state) ──
  function Shelf(p) {
    var sec = p.sec, books = p.books, wide = p.wide, store = p.store;
    var _q = useState(''), q = _q[0], setQ = _q[1];
    var _s = useState('all'), show = _s[0], setShow = _s[1];
    var _c = useState(null), cls = _c[0], setCls = _c[1];
    var _o = useState({}), open = _o[0], setOpen = _o[1];
    var _m = useState(false), menu = _m[0], setMenu = _m[1];
    var label = capf(sec), pl = sec, k = KIND1[sec];
    var rows = bookRowsOf(books, sec), total = rows.length, rail = railCounts(rows);
    var yours = yoursOf(sec, books, store).map(function (y) { var r = shelfRow(y.rec, sec); r.y = y; return r; });
    var filtering = !!(q || cls);
    var ys = yours.filter(function (r) { return matchQ(r.name, q) && matchCls(r, cls); });
    var groups = [];
    if (show === 'all') {
      var fr = rows.filter(function (r) { return matchQ(r.name, q) && matchCls(r, cls); });
      if (sec === 'armor') groups = fr.length ? [{ key: '*', label: 'All armor · A–Z', rows: fr }] : [];
      else {
        var t = {}; fr.forEach(function (r) { (t[r.type] = t[r.type] || []).push(r); });
        groups = Object.keys(t).sort(function (a, b) { return (a === '') - (b === '') || a.localeCompare(b); }).map(function (g) { return { key: g, label: g || 'No type', rows: t[g] }; });
      }
    }
    var per = sec === 'armor' ? 12 : 3;
    function state(g, i) { var o = open[g.key]; if (filtering) return 'all'; if (o) return o; return i < OPEN_GROUPS ? 'some' : 'closed'; }
    function openBook(r) { p.go({ view: 'record', shelf: sec, id: r.id }); }
    function openYours(r) { p.go(recRoute(sec, r.y.ck, r.y.id)); }
    function blank() { p.go({ view: 'draft', shelf: sec }); }
    var search = h('label', { className: 'ed-search', style: { marginTop: 14, maxWidth: wide ? 640 : undefined } },
      h('input', { type: 'search', value: q, placeholder: 'Search ' + num(total) + ' ' + pl, 'aria-label': 'Search ' + pl, onChange: function (e) { setQ(e.target.value); }, 'data-editor-search': '1' }),
      h('span', { className: 'ed-k', 'aria-hidden': 'true' }, '⌕'));
    var startBlank = h('button', { type: 'button', className: 'hp-commit' + (wide ? '' : ' ed-wide-commit'), onClick: blank, 'data-editor-blank': sec }, 'Start from blank');
    var emptyYours = show === 'yours' && !yours.length ? h('div', { className: 'hp-plate', 'data-pad': 'read', style: { marginTop: 14 }, 'data-editor-empty': '1' },
      h('div', { className: 'ed-empty' }, h('p', null, IW.empty(total, pl)),
        h('div', { className: 'ed-btnrow', style: { justifyContent: 'center' } }, h('button', { type: 'button', className: 'hp-commit', onClick: blank }, 'Start from blank'),
          h('button', { type: 'button', className: 'hp-quiet', onClick: function () { setShow('all'); } }, 'Show all ' + num(total))))) : null;
    var nothing = !emptyYours && filtering && !ys.length && !groups.length ? h('p', { className: 'ed-hint', role: 'status', style: { marginTop: 14 } }, IW.noMatch(q || cls)) : null;
    var chipsEl = function (a) { return a.length ? h('span', { className: 'ed-chips' }, a.map(function (c) { return h(Chip, { c: c, key: c }); })) : h('span', { className: 'ed-muted' }, IW.none); };
    var showYours = ys.length && (show === 'yours' || show === 'all');
    if (!wide) {
      var nrow = function (r, y) {
        return h('button', { type: 'button', className: 'ed-irow', key: (y ? r.y.ck + ':' : '') + r.id, onClick: function () { y ? openYours(r) : openBook(r); }, 'data-editor-row': r.id },
          h('div', { className: 'ed-rb' }, h('div', { className: 'ed-rn', 'data-yours': y ? '1' : undefined }, r.name),
            h('div', { className: 'ed-rm' }, SHCOL[sec].map(function (c) { return c[0] + ' ' + cell(r.s[c[1]]); }).join(' · ') + ' · ' + (r.s.price == null ? IW.none : num(r.s.price) + ' cr')),
            y ? h('div', { className: 'ed-rm', style: { color: 'var(--doc-action)' } }, 'Yours · ' + yoursLine(r.y)) : h('div', { className: 'ed-rm' }, r.book)),
          chipsEl(r.chips));
      };
      var filters = [['AUTOMATIC', rail.AUTOMATIC], ['SITUATIONAL', rail.SITUATIONAL], ['NARRATIVE', rail.NARRATIVE], [IW.noRules, rail['No rules']]];
      var shown = groups.filter(function (g, i) { return state(g, i) !== 'closed'; }), closed = groups.filter(function (g, i) { return state(g, i) === 'closed'; });
      return h('div', { className: 'ed-pad' }, h(Runhead, { back: 'Homebrew', right: label + ' · ' + num(total), onBack: function () { p.go({ view: 'home' }); } }),
        h(Banner, { status: store.status }),
        h('div', { className: 'hp-maker' }, 'Shelf'), h('h1', { className: 'hp-desig' }, label), search,
        h('div', { className: 'ed-btnrow', style: { marginTop: 10 } },
          h('button', { type: 'button', className: 'hp-quiet', 'data-on': show === 'all' ? '1' : undefined, 'aria-pressed': show === 'all', onClick: function () { setShow('all'); } }, 'All ' + num(total)),
          h('button', { type: 'button', className: 'hp-quiet', 'data-on': show === 'yours' ? '1' : undefined, 'aria-pressed': show === 'yours', onClick: function () { setShow('yours'); }, 'data-editor-yours': '1' }, 'Yours ' + yours.length),
          h('button', { type: 'button', className: 'hp-quiet', 'data-on': cls ? '1' : undefined, 'aria-expanded': menu, onClick: function () { setMenu(!menu); } }, (cls || IW.rulesDo) + ' ▾')),
        menu ? h('div', { className: 'ed-menu', role: 'menu' }, h('button', { type: 'button', role: 'menuitemradio', 'aria-checked': !cls, className: 'ed-op', onClick: function () { setCls(null); setMenu(false); } }, 'All ' + num(total)),
          filters.map(function (f) { return h('button', { type: 'button', key: f[0], role: 'menuitemradio', 'aria-checked': cls === f[0], className: 'ed-op', onClick: function () { setCls(f[0]); setMenu(false); } },
            f[0] === IW.noRules ? h('b', { style: { fontWeight: 600 } }, f[0]) : h(Chip, { c: f[0] }), h('span', null, num(f[1]))); })) : null,
        h('div', { style: { marginTop: 12 } }, startBlank),
        emptyYours, nothing,
        showYours ? [h(Sechead, { t: 'Yours', aside: String(ys.length), key: 'ys' }), h('div', { className: 'hp-plate ed-stock', 'data-pad': 'data', key: 'yp' }, h('div', { className: 'hp-bands', 'data-run': '1' }, ys.map(function (r) { return nrow(r, true); })))] : null,
        shown.map(function (g) {
          var st = state(g, groups.indexOf(g)), list = st === 'some' ? g.rows.slice(0, per) : g.rows;
          return [h(Sechead, { t: g.label, aside: num(g.rows.length), key: 'h' + g.key }),
            h('div', { className: 'hp-plate ed-stock', 'data-pad': 'data', key: 'p' + g.key }, h('div', { className: 'hp-bands', 'data-run': '1' }, list.map(function (r) { return nrow(r, false); })),
              st === 'some' && g.rows.length > per ? h('button', { type: 'button', className: 'ed-addline', onClick: function () { var o = Object.assign({}, open); o[g.key] = 'all'; setOpen(o); } }, 'Show all ' + num(g.rows.length) + ' ›') : null)];
        }),
        closed.length ? [h(Sechead, { t: 'More types', aside: String(closed.length), key: 'mh' }), h('div', { className: 'hp-plate ed-stock', 'data-pad': 'data', key: 'mp' }, closed.map(function (g) {
          return h('button', { type: 'button', className: 'ed-grow', key: g.key, onClick: function () { var o = Object.assign({}, open); o[g.key] = 'all'; setOpen(o); } }, h('span', null, g.label), h('b', null, num(g.rows.length) + ' ›'));
        }))] : null);
    }
    var cols = SHCOL[sec], ncol = 4 + cols.length;
    var tr = function (r, y) {
      return h('tr', { className: 'ed-tr', key: (y ? r.y.ck + ':' : '') + r.id, onClick: function () { y ? openYours(r) : openBook(r); }, 'data-editor-row': r.id },
        h('td', { className: 'ed-nm', style: y ? { color: 'var(--doc-action)' } : undefined },
          h('button', { type: 'button', className: 'ed-link ed-rowname', onClick: function (e) { e.stopPropagation(); y ? openYours(r) : openBook(r); } }, r.name),
          y ? [' ', h('span', { className: 'ed-yours', key: 'y' }, 'yours'), h('div', { className: 'ed-rm', key: 'm', style: { fontWeight: 400, fontSize: 13, color: 'var(--doc-action)' } }, yoursLine(r.y))] : null),
        h('td', null, chipsEl(r.chips)),
        cols.map(function (c) { return h('td', { className: 'ed-mono', key: c[1] }, cell(r.s[c[1]])); }),
        h('td', { className: 'ed-mono' }, r.s.price == null ? IW.none : num(r.s.price)), h('td', { className: 'ed-bk' }, r.book));
    };
    var grpRow = function (key, text, onClick) { return h('tr', { className: 'ed-grp', key: key }, h('td', { colSpan: ncol }, onClick ? h('button', { type: 'button', className: 'ed-grpbtn', onClick: onClick }, text) : h('div', { className: 'ed-grpbtn', style: { cursor: 'default' } }, text))); };
    var body = [];
    if (showYours) { body.push(grpRow('gy', 'Yours · ' + ys.length)); ys.forEach(function (r) { body.push(tr(r, true)); }); }
    groups.forEach(function (g, i) {
      var st = state(g, i);
      var toggle = function () { var o = Object.assign({}, open); o[g.key] = st === 'closed' ? 'all' : 'closed'; setOpen(o); };
      if (st === 'closed') { body.push(grpRow('g' + g.key, g.label + ' · ' + num(g.rows.length) + ' ›', toggle)); return; }
      body.push(grpRow('g' + g.key, g.label + ' · ' + num(g.rows.length), null));
      (st === 'some' ? g.rows.slice(0, per) : g.rows).forEach(function (r) { body.push(tr(r, false)); });
      if (st === 'some' && g.rows.length > per) body.push(h('tr', { key: 'm' + g.key }, h('td', { colSpan: ncol }, h('button', { type: 'button', className: 'ed-addline', style: { margin: 0 },
        onClick: function () { var o = Object.assign({}, open); o[g.key] = 'all'; setOpen(o); } }, 'Show all ' + num(g.rows.length) + ' ›'))));
    });
    var railBtn = function (key, lbl, n, on, click, disabled) {
      return h('button', { type: 'button', className: 'ed-cat', key: key, 'aria-pressed': on ? 'true' : 'false', onClick: click, disabled: disabled }, lbl, h('b', null, num(n)));
    };
    var railEl = h('nav', { className: 'ed-rail', 'aria-label': 'Shelves' }, h('h4', null, 'Shelves'), shelfRail(p, sec),
      h('h4', null, 'Show'), railBtn('all', 'All', total, show === 'all', function () { setShow('all'); }), railBtn('yours', 'Yours', yours.length, show === 'yours', function () { setShow('yours'); }),
      h('h4', null, IW.rulesDo),
      ['AUTOMATIC', 'SITUATIONAL', 'NARRATIVE'].map(function (c) { return railBtn(c, h(Chip, { c: c }), rail[c], cls === c, function () { setCls(cls === c ? null : c); }); }),
      railBtn('none', IW.noRules, rail['No rules'], cls === IW.noRules, function () { setCls(cls === IW.noRules ? null : IW.noRules); }));
    return h('div', { className: 'ed-shelfgrid' }, railEl,
      h('div', { className: 'ed-desk', style: { paddingTop: 18, minWidth: 0 } }, h(Runhead, { back: 'Homebrew', right: label + ' · ' + num(total), onBack: function () { p.go({ view: 'home' }); } }),
        h(Banner, { status: store.status }),
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20 } }, h('div', null, h('div', { className: 'hp-maker' }, 'Shelf'), h('h1', { className: 'hp-desig' }, label)), startBlank),
        search, emptyYours, nothing,
        body.length ? h('div', { className: 'hp-plate ed-stock', 'data-pad': 'data', style: { marginTop: 14 } },
          h('table', { className: 'ed-tbl', 'data-editor-table': sec }, h('thead', null, h('tr', null, h('th', null, 'Name'), h('th', null, IW.rulesDo), cols.map(function (c) { return h('th', { key: c[1] }, c[0]); }), h('th', null, 'Price'), h('th', null, 'Book'))),
            edBands(body))) : null));
  }

  // ── the form's parts (F5's kit: fl · inp · tog; each field chipped by fieldClassOf — computed, never set) ──
  function Fl(p) {
    return h('div', { className: 'ed-fl' + (p.cls ? ' ' + p.cls : ''), 'data-bad': p.bad ? '1' : undefined, 'data-field': p.field }, p.chip ? h(Chip, { c: p.chip }) : h('span', null), h('div', { className: 'ed-fk' }, p.k), h('div', { className: 'ed-fv' }, p.children));
  }
  // R-SAP-3: a shelf's one tbody splits at its heads and foots; each run of rows takes the stripe, each head stands outside
  function edBands(body) {
    var out = [], run = null, rest = null;
    body.forEach(function (tr, i) {
      if (tr && tr.props && tr.props.className === 'ed-tr') { if (!run) { run = []; rest = null; out.push(h('tbody', { key: 'r' + i, className: 'hp-bands' }, run)); } run.push(tr); }
      else { if (!rest) { rest = []; run = null; out.push(h('tbody', { key: 'h' + i }, rest)); } rest.push(tr); }
    });
    return out;
  }
  function Grp(p) { return [h(Sechead, { t: p.t, aside: p.aside, key: 's' }), h('div', { className: 'hp-plate ed-stock', 'data-pad': 'data', key: 'p' }, p.children)]; }
  function NumIn(p) {
    return h('input', { className: 'ed-inp ed-num', inputMode: 'numeric', value: p.value == null ? '' : p.sep ? num(p.value) : String(p.value), readOnly: p.ro, 'aria-label': p.label,
      onChange: function (e) { var t = String(e.target.value).replace(/[^0-9]/g, ''); p.onChange(t === '' ? null : parseInt(t, 10)); }, 'data-editor-input': p.field });
  }
  function TextIn(p) {
    if (p.area) return h(GrowArea, p);
    return h('input', { className: 'ed-inp' + (p.cls ? ' ' + p.cls : ''), value: p.value == null ? '' : p.value, readOnly: p.ro, 'aria-label': p.label, placeholder: p.placeholder,
      onChange: function (e) { p.onChange(e.target.value); }, 'data-editor-input': p.field });
  }
  // R-FIEG-R4 (a): a prose field is as tall as its text, as I-2, I-12 and F5 draw it (never an inner scroll)
  function GrowArea(p) {
    var ref = useRef(null);
    function fit() { var t = ref.current; if (!t) return; t.style.height = 'auto'; t.style.height = t.scrollHeight + 2 + 'px'; }
    useLayoutEffect(fit, [p.value]);
    useEffect(function () { window.addEventListener('resize', fit); return function () { window.removeEventListener('resize', fit); }; }, []);
    return h('textarea', { ref: ref, className: 'ed-inp ed-grow' + (p.cls ? ' ' + p.cls : ''), value: p.value == null ? '' : p.value, readOnly: p.ro, 'aria-label': p.label, placeholder: p.placeholder,
      autoFocus: p.autoFocus, onBlur: p.onBlur, onFocus: p.onFocus, onChange: function (e) { p.onChange(e.target.value); }, 'data-editor-input': p.field,
      onSelect: p.onSel ? function (e) { p.onSel(e.target.selectionStart, e.target.selectionEnd); } : undefined });
  }
  // a sentence holding dice tokens reads with its glyphs (as the approved frames draw it) until it is focused for editing
  function GlyphArea(p) {
    var _f = useState(false), f = _f[0], setF = _f[1];
    if (!f && /\[[A-Z]{2}\]/.test(p.value || '')) return h('div', { className: 'ed-inp ed-area', role: p.ro ? undefined : 'textbox', tabIndex: p.ro ? undefined : 0, 'aria-label': p.label,
      'data-ro': p.ro ? '1' : undefined, onFocus: function () { if (!p.ro) { setF(true); if (p.onFocus) p.onFocus(); } }, onClick: function () { if (!p.ro) setF(true); }, 'data-editor-input': p.field }, glyph(p.value));
    return h(GrowArea, { value: p.value, ro: p.ro, label: p.label, autoFocus: f, onBlur: function () { setF(false); }, onFocus: p.onFocus, onSel: p.onSel, onChange: p.onChange, field: p.field });
  }
  function Sel(p) {
    var opts = p.options.slice();
    if (p.value != null && p.value !== '' && !opts.some(function (o) { return o[0] === p.value; })) opts.unshift([p.value, p.value]);
    return h('select', { className: 'ed-inp', value: p.value == null ? '' : p.value, disabled: p.ro, 'aria-label': p.label, onChange: function (e) { p.onChange(e.target.value); }, 'data-editor-input': p.field },
      p.blank !== false ? h('option', { value: '' }, p.blankLabel || '') : null,
      opts.map(function (o) { return h('option', { key: o[0], value: o[0] }, o[1]); }));
  }
  function Tog(p) {
    return h('button', { type: 'button', role: 'switch', className: 'ed-tog', 'aria-checked': p.on ? 'true' : 'false', disabled: p.ro, onClick: function () { p.onChange(!p.on); }, 'data-editor-input': p.field }, p.label);
  }

  // ── IN PLAY: a mod line = its sentence (NARRATIVE) with the dice read from it (R-FIEC-2); a bare dice line stands alone ──
  function modView(rec) {
    var pm = Array.isArray(rec.pool_mods) ? rec.pool_mods : [], bm = Array.isArray(rec.base_mods) ? rec.base_mods : [];
    var out = bm.map(function (b, i) { return { i: i, sentence: b, dice: [] }; });
    var bare = [];
    pm.forEach(function (p, j) {
      var f = p && p.from && p.from.channel === 'base_mods' && typeof p.from.index === 'number' ? p.from.index : null;
      if (f != null && out[f]) out[f].dice.push(j); else bare.push({ i: null, sentence: null, dice: [j] });
    });
    return out.concat(bare);
  }
  // deleting a sentence deletes its dice and renumbers every later from.index in the same edit (C-2.2 (5))
  function removeSentence(rec, i) {
    var r = clone(rec);
    r.base_mods.splice(i, 1);
    r.pool_mods = (r.pool_mods || []).filter(function (p) { return !(p.from && p.from.channel === 'base_mods' && p.from.index === i); })
      .map(function (p) { if (p.from && p.from.channel === 'base_mods' && p.from.index > i) { p = clone(p); p.from.index--; } return p; });
    return r;
  }
  function DiceRow(p) {
    var d = p.d, vocab = p.vocab, ro = p.ro;
    var anc = Array.isArray(d.applies_to) ? d.applies_to : null;
    var ancKey = !anc ? '' : anc.length === 1 ? (anc[0].scope === 'all' ? 'all' : anc[0].scope + ':' + anc[0].value) : 'multi';
    var ancOpts = [['all', 'all']].concat(GROUPS.map(function (g) { return ['group:' + g, capf(g)]; }),
      (vocab ? vocab.skills : []).map(function (s) { return ['skill:' + s.id, s.label]; }));
    if (ancKey === 'multi') ancOpts.unshift(['multi', anchorLabel(d, vocab)]);
    function set(k, v) { var n = clone(d); if (v === undefined) delete n[k]; else n[k] = v; p.onChange(n); }
    return h('div', { className: 'ed-pmrow' },
      h('div', { className: 'ed-inrow' },
        h('span', { className: 'ed-diesel' }, h('span', { className: 'ed-dieg', 'aria-hidden': 'true' }, glyph('[' + (DIE_TOKEN[d.die] || '') + ']')), h(Sel, { value: d.die, options: DIES.map(function (x) { return [x, capf(x)]; }), blank: false, ro: ro, label: 'Die', field: 'die', onChange: function (v) { set('die', v); } })),
        h(Sel, { value: d.direction == null ? '' : d.direction, options: [['add', 'Add'], ['remove', 'Remove']], blank: d.direction == null, blankLabel: IW.unsettled, ro: ro, label: 'Add or remove', field: 'direction',
          onChange: function (v) { set('direction', v === '' ? null : v); } }),
        h(NumIn, { value: d.count, ro: ro, label: 'How many', field: 'count', onChange: function (v) { set('count', v == null ? 1 : Math.max(1, v)); } })),
      h('div', { className: 'ed-inrow' }, h(Sel, { value: ancKey, options: ancOpts, blankLabel: IW.anyCheck, ro: ro, label: 'Which checks', field: 'applies_to',
        onChange: function (v) {
          if (v === 'multi') return;
          if (!v) return set('applies_to', null);
          if (v === 'all') return set('applies_to', [{ scope: 'all' }]);
          var i = v.indexOf(':'); set('applies_to', [{ scope: v.slice(0, i), value: v.slice(i + 1) }]);
        } })),
      h('div', { className: 'ed-inrow' }, h(TextIn, { value: d.condition || '', placeholder: IW.noCond, ro: ro, label: 'Condition', field: 'condition', onChange: function (v) { set('condition', v.trim() ? v : undefined); } })),
      p.bare ? null : h('div', { className: 'ed-fmt' }, glyph(readAloud(d, vocab))),
      !ro && p.onRemove ? h('div', { className: 'ed-lineacts' }, h('span'), h('button', { type: 'button', className: 'ed-addline ed-rm-act', onClick: p.onRemove,
        'aria-label': IW.removeDice + ': ' + spoken(readAloud(d, vocab)) }, IW.removeDice)) : null);
  }
  function InPlay(p) {
    var rec = p.rec, ro = p.ro, sec = p.sec, lines = modView(rec);
    function setPool(j, d) { var r = clone(rec); r.pool_mods[j] = d; p.onChange(r); }
    function dropPool(j) { var r = clone(rec); r.pool_mods.splice(j, 1); if (!r.pool_mods.length) delete r.pool_mods; p.onChange(r); }
    function addDice(i) { var r = clone(rec); r.pool_mods = r.pool_mods || []; var d = { die: 'boost', count: 1, direction: 'add', applies_to: null }; if (i != null) d.from = { channel: 'base_mods', index: i }; r.pool_mods.push(d); p.onChange(r); }
    function setSentence(i, text) { var r = clone(rec); var b = { description: text }; if (r.base_mods[i].rank) b.rank = r.base_mods[i].rank; r.base_mods[i] = b; p.onChange(r); }   // (6): effect / never_modelled dropped on edit
    function addSentenceFor(j) { var r = clone(rec); r.base_mods = r.base_mods || []; r.base_mods.push({ description: '' }); r.pool_mods[j] = Object.assign({}, r.pool_mods[j], { from: { channel: 'base_mods', index: r.base_mods.length - 1 } }); p.onChange(r); }
    var body = lines.map(function (l, n) {
      var dl = function (j, bare) {
        var d = rec.pool_mods[j];
        return h(Fl, { key: 'd' + j, chip: chipOf(EC() ? EC().classOfPoolMod(d) : 'prints'), k: 'Dice line' },
          h(DiceRow, { d: d, bare: bare, ro: ro, vocab: p.vocab, onChange: function (x) { setPool(j, x); }, onRemove: function () { dropPool(j); } }));
      };
      if (l.sentence === null) {
        var d0 = rec.pool_mods[l.dice[0]];
        return h('div', { className: 'ed-ml', key: 'b' + l.dice[0] }, dl(l.dice[0], true),
          h('div', { className: 'ed-ra' }, h('span', { className: 'ed-rk' }, 'Read aloud'), glyph(readAloud(d0, p.vocab))),
          ro ? null : h('button', { type: 'button', className: 'ed-addline', onClick: function () { addSentenceFor(l.dice[0]); } }, IW.addSentence));
      }
      return h('div', { className: 'ed-ml', key: 's' + l.i },
        h(Fl, { chip: 'NARRATIVE', k: 'Sentence' }, h(GlyphArea, { value: l.sentence.description, ro: ro, label: 'Sentence', field: 'base_mods', onChange: function (v) { setSentence(l.i, v); } })),
        l.dice.length ? h('div', { className: 'ed-dl' }, l.dice.map(function (j) { return dl(j, false); })) : null,
        ro ? null : h('div', { className: 'ed-lineacts' }, l.dice.length ? h('span') : h('button', { type: 'button', className: 'ed-addline', onClick: function () { addDice(l.i); } }, IW.addDice),
          h('button', { type: 'button', className: 'ed-addline ed-rm-act', onClick: function () { p.onChange(removeSentence(rec, l.i)); },
            'aria-label': IW.removeLine + ': ' + (spoken(l.sentence.description) || 'line ' + (n + 1)) }, IW.removeLine)));
    });
    return h(Grp, { t: IW.sec.play, aside: lines.length ? lines.length + ' line' + (lines.length === 1 ? '' : 's') : 'none' }, body,
      ro ? null : h('button', { type: 'button', className: 'ed-addline', onClick: function () { addDice(null); }, 'data-editor-adddice': '1' }, IW.addDiceLine));
  }

  // ── I-12 the qualities picker ──
  function rankedIds(books) {
    var o = {}, w = books.sections && books.sections.weapons;
    if (w) Object.keys(w).forEach(function (id) { (w[id].qualities || []).forEach(function (q) { if (q && q.ranked) o[q.id] = true; }); });
    return o;
  }
  function QualPicker(p) {
    var _q = useState(''), q = _q[0], setQ = _q[1];
    var _s = useState(null), sel = _s[0], setSel = _s[1];
    var _r = useState(1), rank = _r[0], setRank = _r[1];
    var all = (p.vocab ? p.vocab.qualities : []).filter(function (e) { return p.held.indexOf(e.id) === -1; });
    var ranked = rankedIds(p.books);
    var ql = q.trim().toLowerCase();
    var rows = all.filter(function (e) { return !ql || e.label.toLowerCase().split(/\s+/).some(function (w) { return w.indexOf(ql) === 0; }); }).sort(function (a, b) { return a.label.localeCompare(b.label); });
    return h('div', { className: 'ed-menu', style: { margin: '10px 0 4px' }, 'data-editor-picker': 'qualities' },
      h('div', { style: { padding: '10px 12px' } }, h('label', { className: 'ed-search' },
        h('input', { type: 'search', value: q, autoFocus: true, placeholder: 'Search qualities', 'aria-label': 'Search qualities', onChange: function (e) { setQ(e.target.value); setSel(null); } }),
        h('span', { className: 'ed-k' }, IW.qCount(rows.length, (p.vocab ? p.vocab.qualities.length : 0))))),
      h('div', { className: 'hp-bands' }, rows.map(function (e) {
        var on = sel === e.id, rk = !!ranked[e.id];
        var nm = e.label + (rk ? ' ' + rank : '');
        return h('div', { key: e.id, className: 'ed-qrow', 'data-on': on ? '1' : undefined, role: 'button', tabIndex: on ? -1 : 0, 'data-editor-quality': e.id,
          onClick: function () { if (!on) { setSel(e.id); setRank(1); } }, onKeyDown: function (ev) { if (!on && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); setSel(e.id); setRank(1); } } },
          h(Chip, { c: chipOf(EC() ? EC().qualityClassOf(e.id) : 'prints') }), h('span', { className: 'ed-qn' }, e.label), h('span', { className: 'ed-qr' }, rk ? 'Ranked' : 'Not ranked'),
          h('span', { className: 'ed-ql' }, glyph(para1(e.description))),
          on ? h('span', { className: 'ed-qadd' }, rk ? [h('span', { className: 'ed-fk', style: { margin: 0 }, key: 'k' }, 'Rank'),
              h(NumIn, { key: 'n', value: rank, label: 'Rank', field: 'rank', onChange: function (v) { setRank(v == null ? 1 : Math.max(1, v)); } })] : null,
            h('button', { type: 'button', className: 'hp-commit', style: { minHeight: 44 }, 'data-editor-addquality': e.id, onClick: function (ev) {
              ev.stopPropagation(); var qo = { id: e.id, name: e.label, ranked: rk }; if (rk) qo.rank = rank; p.onAdd(qo); } }, IW.addQ(nm))) : null);
      })));
  }
  function qualName(q) { return q && q.ranked && q.rank ? q.name + ' ' + q.rank : (q && q.name) || ''; }

  // ── the preview: the store's own projection (canonicalToStore) in the approved plate's paper ──
  function ItemPlate(p) {
    var rec = p.rec, sec = p.sec, s = toStore(rec, sec);
    var rows = sec === 'weapons' ? [['Damage', s.damage], ['Critical', s.crit], ['Range', s.range], ['Skill', s.skill], ['Encumbrance', s.encumbrance], ['Hardpoints', s.hp]]
      : sec === 'armor' ? [['Soak', s.soak], ['Defense', s.defense], ['Encumbrance', s.encumbrance], ['Hardpoints', s.hp]] : [['Type', s.type], ['Encumbrance', s.encumbrance]];
    rows.push(['Rarity', s.rarity == null ? null : s.rarity + (s.restricted ? ' (R)' : '')]);
    var etb = rec.encumbrance_threshold_bonus;
    var line = etb ? '+' + etb + ' encumbrance threshold' + (rec.threshold_bonus_requires ? ' — while ' + rec.threshold_bonus_requires : '')
      : (Array.isArray(rec.base_mods) && rec.base_mods[0] && rec.base_mods[0].description) || '';
    var bk = booksOf(rec);
    return h('div', { className: 'hp-plate', 'data-pad': 'read', 'data-editor-preview': '1' }, h('div', { className: 'ed-fk' }, 'Preview · the spec plate'),
      h('h3', { className: 'ed-plate-h' }, rec.name || ''), h('div', { className: 'ed-plate-cr' }, s.price == null ? IW.none : num(s.price) + ' cr'),
      h('table', { className: 'hp-ledger', style: { marginTop: 10 } }, h('tbody', null, rows.map(function (r) {
        return h('tr', { key: r[0] }, h('td', { className: 'hp-lkey' }, r[0]), h('td', { className: 'hp-lval' }, r[1] == null || r[1] === '' ? IW.none : String(r[1])));
      }))),
      sec === 'weapons' && s.qualities && s.qualities.length ? h('div', { className: 'ed-btnrow', style: { marginTop: 10 } }, (rec.qualities || []).map(function (q) {
        return h('span', { key: q.id, className: 'ed-chip', 'data-chip': chipOf(EC() ? EC().qualityClassOf(q.id) : 'prints'), style: { borderStyle: 'solid' } }, qualName(q));
      })) : null,
      line ? h('div', { className: 'ed-rs' }, glyph(line)) : null,
      bk.length ? h('div', { className: 'ed-rm', style: { marginTop: 10 } }, bk.join(' · ')) : null);
  }
  function peekLine(rec, sec) {
    var s = toStore(rec, sec);
    return sec === 'weapons' ? (rec.name || '') + ' · damage ' + cell(s.damage) + ' · crit ' + cell(s.crit)
      : sec === 'armor' ? (rec.name || '') + ' · soak ' + cell(s.soak) + ' · defense ' + cell(s.defense) : (rec.name || '') + ' · ' + cell(s.type);
  }
  function Peek(p) {
    var _o = useState(false), open = _o[0], setOpen = _o[1];
    return h('div', { className: 'ed-peek', 'data-editor-peek': open ? 'open' : 'closed' }, h('div', { className: 'ed-grab', 'aria-hidden': 'true' }),
      h('button', { type: 'button', className: 'ed-ph', 'aria-expanded': open, onClick: function () { setOpen(!open); } }, h('span', null, 'Preview · spec plate'), h('span', { className: 'ed-chev' }, open ? '▾' : '▴')),
      open ? h(ItemPlate, { rec: p.rec, sec: p.sec }) : h('div', { className: 'ed-rm', style: { marginTop: -4 } }, peekLine(p.rec, p.sec)));
  }

  // ── F8 · the book changed (R-FIEC-3's split; J2 (ii) / J3 (ii)); I-6's conflict row ──
  // M5 (U5): a talent's and a specialization's fields, read as the frames print them — "Number lines", "Dice lines", "The tree"
  var M5_LABEL = { talents: { effects: 'Stat changes', pool_mods: 'Dice lines', description: 'Text', ranked: 'Ranked', activation: 'Activation', name: 'Name' },
                   specializations: { talent_tree: 'The tree', career_skills: 'Career skills', career_skill_choice_grants: 'Career skills', description: 'Text', name: 'Name' } };
  function labelOf(sec, k) { return (M5_LABEL[sec] && M5_LABEL[sec][k]) || FIELD_LABEL[k] || k; }
  // the boxes whose talent differs between two trees: "Box 2-4 · Toughened"
  function treeBoxes(a, b) {
    var out = []; (a && a.talent_tree || []).forEach(function (row, r) { (row.talents || []).forEach(function (c, ci) {
      var o = b && b.talent_tree && b.talent_tree[r] && b.talent_tree[r].talents && b.talent_tree[r].talents[ci];
      if (!o || !c || o.talent !== c.talent) out.push({ r: r, c: ci, id: c && c.talent, was: o && o.talent });
    }); });
    return out;
  }
  function talentName(id, books) { var t = books && books.sections && books.sections.talents; return (t && t[id] && t[id].name) || (id ? String(id) : 'Deleted talent'); }
  function fmtField(sec, k, rec, vocab, other, books) {
    if (sec === 'talents' || sec === 'specializations') {
      if (!rec || rec[k] == null || (Array.isArray(rec[k]) && !rec[k].length)) return 'None';
      if (k === 'effects') { var _ne = rec.effects.filter(function (e) { return !isSkillOp(e); }); if (!_ne.length) return 'None'; return _ne.map(effRead).map(function (x) { return x.charAt(0).toUpperCase() + x.slice(1); }).join(' · '); }
      if (k === 'pool_mods') return rec.pool_mods.map(function (d) { return diceRead(d, !!rec.ranked, vocab); }).join(' · ');
      if (k === 'ranked') return rec.ranked ? 'Yes' : 'No';
      if (k === 'activation') return actLabel(rec.activation);
      if (k === 'career_skills') return rec.career_skills.map(function (id) { return skillLabel(id, vocab); }).join(', ');
      if (k === 'talent_tree') return treeBoxes(rec, other).map(function (x) { return 'Box ' + (x.r + 1) + '-' + (x.c + 1) + ' · ' + talentName(x.id, books); }).join(' · ') || 'Unchanged';
      if (typeof rec[k] === 'object') return JSON.stringify(rec[k]);
      return String(rec[k]);
    }
    if (!rec || rec[k] == null) return 'None';
    var v = rec[k], s = toStore(rec, sec);
    if (k === 'qualities') return v.length ? v.map(qualName).join(', ') : 'None';
    if (k === 'damage') return String(s.damage);
    if (k === 'range') return String(s.range);
    if (k === 'skill') return skillLabel(v, vocab);
    if (k === 'restricted') return v ? 'Yes' : 'No';
    if (k === 'base_mods') return v.map(function (b) { return b.description; }).join(' · ') || 'None';
    if (k === 'pool_mods') return v.map(function (p) { return readAloud(p, vocab).replace(/\[([A-Z]{2})\]/g, function (m, t) { return (DIES.filter(function (d) { return DIE_TOKEN[d] === t; })[0] || t); }); }).join(' · ') || 'None';
    if (typeof v === 'object') return JSON.stringify(v);
    return typeof v === 'number' ? num(v) : String(v);
  }
  var UNCHANGED = { weapons: ['damage', 'range', 'encumbrance', 'price', 'rarity'], armor: ['soak', 'defense', 'encumbrance', 'price', 'rarity'], gear: ['encumbrance', 'price', 'rarity'] };
  function BookChanged(p) {
    var R = p.R, sec = R.sec, sp = p.split, book = R.book, rec = p.rec, vocab = p.vocab;
    var ask = UD().askedFields(sec, sp, R.raw, book), fields = ask.asked;   // ADDENDUM 546 D: a span-only field follows its text's answer
    var conflict = sp.conflict.filter(function (k) { return fields.indexOf(k) !== -1; }).length > 0;
    var _c = useState({}), picks = _c[0], setPicks = _c[1];
    function choose(k, which) {
      var n = Object.assign({}, picks); n[k] = which; setPicks(n);
      if (!fields.every(function (f) { return n[f]; })) return;
      var all = Object.assign({}, n); Object.keys(ask.follow).forEach(function (f) { all[f] = n[ask.follow[f]]; });
      p.onResolve(all).then(function (ok) { if (!ok) setPicks({}); });   // B-1748: a refused answer isn't chosen
    }
    var unchanged = (UNCHANGED[sec] || []).filter(function (k) { return fields.indexOf(k) === -1 && book && book[k] != null; }).map(function (k) {
      var v = fmtField(sec, k, book, vocab); if (k === 'rarity' && book.restricted) v += ' (R)'; return k + ' ' + v; });
    var yours = sp.yours.filter(function (k) { return k !== 'id'; });
    return h('div', { className: 'hp-plate', 'data-pad': 'read', 'data-accent': '1', 'data-editor-f8': conflict ? 'conflict' : 'book' }, h('div', null,
      h('div', { className: 'ed-fk' }, 'The book changed · ' + fields.length + ' field' + (fields.length === 1 ? '' : 's')),
      h('p', { className: 'hp-prose', style: { margin: '4px 0 12px', maxWidth: 'none' } }, conflict ? IW.headConflict(book.name) : IW.headNoConflict(book.name)),
      fields.map(function (k) {
        var both = sp.conflict.indexOf(k) !== -1;
        return h('div', { key: k, style: { marginBottom: 10 } },
          h('div', { className: 'ed-cmp' }, h('div', { className: 'ed-ch' }, conflict ? 'Yours' : 'Yours · as you started it'), h('div', { className: 'ed-ch' }, 'The book now'),
            h('div', null, h('div', { className: 'ed-fk' }, labelOf(sec, k)), h('div', { className: 'ed-v' }, fmtField(sec, k, rec, vocab, book, p.books))),
            h('div', null, h('div', { className: 'ed-fk' }, labelOf(sec, k)), h('div', { className: 'ed-v ed-new' }, fmtField(sec, k, book, vocab, rec, p.books)), h('div', { className: 'ed-n' }, booksOf(book).join(' · ')))),
          both ? h('div', { className: 'ed-conf', role: 'status' }, IW.conflict) : null,
          p.ro ? null : h('div', { className: 'ed-cmp', style: { borderTop: 0 } },
            h('div', null, h('button', { type: 'button', className: 'hp-quiet', 'data-on': picks[k] !== 'book' ? '1' : undefined, onClick: function () { choose(k, 'mine'); }, 'data-editor-keep': k }, IW.keepMine)),
            h('div', null, h('button', { type: 'button', className: 'hp-quiet ed-red', 'data-on': picks[k] === 'book' ? '1' : undefined, onClick: function () { choose(k, 'book'); }, 'data-editor-take': k }, IW.takeBook))));
      }),
      conflict || !unchanged.length ? null : h('p', { className: 'ed-hint' }, 'Unchanged in the book: ' + unchanged.join(', ') + '.'),
      yours.length ? [h('table', { className: 'hp-ledger', key: 'yt', style: { marginTop: 12 } }, h('tbody', null, [].concat.apply([], yours.map(function (k) {
          // U5g: a tree lists each box you changed on its own row, "Box 1-2  Fleet Foot ~~Summon Item~~"
          if (k === 'talent_tree') return treeBoxes(rec, (R.raw && R.raw._base) ? R.book : book).map(function (x) {
            return h('tr', { key: 'b' + x.r + x.c }, h('td', { className: 'hp-lkey' }, 'Box ' + (x.r + 1) + '-' + (x.c + 1)), h('td', { className: 'hp-lval' }, talentName(x.id, p.books), ' ', h('span', { className: 'ed-was' }, talentName(x.was, p.books))));
          });
          return [h('tr', { key: k }, h('td', { className: 'hp-lkey' }, labelOf(sec, k)), h('td', { className: 'hp-lval' },
            k === 'description' ? 'your text' : [fmtField(sec, k, rec, vocab, book, p.books), ' ', h('span', { className: 'ed-was', key: 'w' }, fmtField(sec, k, book, vocab, rec, p.books))]))];
        }))))] : null));
  }
  function MissingPlate(p) {
    var nm = p.name, src = p.sources || [];
    return h('div', { className: 'hp-plate', 'data-pad': 'read', 'data-editor-missing': '1' }, h('div', { className: 'ed-fk' }, 'The book record · not in this version'),
      h('p', { className: 'hp-prose', style: { margin: '4px 0 8px' } }, IW.missing(nm)),
      h('table', { className: 'hp-ledger' }, h('tbody', null,
        h('tr', null, h('td', { className: 'hp-lkey' }, 'Started from'), h('td', { className: 'hp-lval' }, [nm].concat(src.map(bookLabel)).join(' · '))),
        h('tr', null, h('td', { className: 'hp-lkey' }, 'Compare'), h('td', { className: 'hp-lval' }, 'Not possible')))));
  }

  // ── the form body per face (I-2 armor, I-3 gear, F5/I-9 weapons) ──
  function FormBody(p) {
    var rec = p.rec, sec = p.sec, ro = p.ro, bad = p.bad || {}, vocab = p.vocab, books = p.books;
    var set = function (k, v) { var r = clone(rec); if (v === null || v === undefined || v === '') delete r[k]; else r[k] = v; p.onChange(r); };
    var types = {}; var t = books.sections[sec]; Object.keys(t).forEach(function (id) { if (t[id].type) types[t[id].type] = true; });
    var typeSel = h(Fl, { chip: fieldChip(sec, 'type'), k: 'Type', field: 'type', bad: bad.type }, h(Sel, { value: rec.type, ro: ro, label: 'Type', field: 'type', options: Object.keys(types).sort().map(function (x) { return [x, x]; }), onChange: function (v) { set('type', v); } }));
    var nameF = h(Fl, { chip: fieldChip(sec, 'name'), k: 'Name', field: 'name', bad: bad.name }, h(TextIn, { value: rec.name, ro: ro, label: 'Name', field: 'name', onChange: function (v) { set('name', v); } }));
    var what = h(Grp, { t: IW.sec.what }, nameF, sec === 'gear' ? typeSel : null);
    var etbRow = rec.encumbrance_threshold_bonus != null ? h(Fl, { chip: fieldChip(sec, 'encumbrance_threshold_bonus'), k: 'Encumbrance threshold', field: 'encumbrance_threshold_bonus' },
      h('div', { className: 'ed-inrow' }, h('span', { className: 'ed-fmt', style: { margin: 0 } }, '+'),
        h(NumIn, { value: rec.encumbrance_threshold_bonus, ro: ro, label: 'Encumbrance threshold', field: 'encumbrance_threshold_bonus', onChange: function (v) { set('encumbrance_threshold_bonus', v == null ? 0 : v); } }),
        h(Sel, { value: rec.threshold_bonus_requires || '', ro: ro, label: 'When', field: 'threshold_bonus_requires', blankLabel: 'Always', options: [['worn', 'When worn'], ['carried', 'When carried']], onChange: function (v) { set('threshold_bonus_requires', v || undefined); } })),
      h('div', { className: 'ed-hint' }, 'On the sheet: +' + rec.encumbrance_threshold_bonus + ' encumbrance threshold' + (rec.threshold_bonus_requires ? ' — while ' + rec.threshold_bonus_requires : '')))
      // B-910 (D-411 item 4, as page v1 @ 291c0128b drew it): armor and gear with none draw the qualities' "None · + Add";
      // + Add starts I-4's row above at +1
      : sec !== 'weapons' && !ro ? h(Fl, { chip: fieldChip(sec, 'encumbrance_threshold_bonus'), k: 'Encumbrance threshold', field: 'encumbrance_threshold_bonus' },
        h('div', { className: 'ed-btnrow' }, h('span', { className: 'ed-hint', style: { margin: 0 } }, 'None'),
          h('button', { type: 'button', className: 'ed-addline', style: { margin: 0 }, onClick: function () { set('encumbrance_threshold_bonus', 1); }, 'data-editor-addetb': '1' }, '+ Add'))) : null;
    var carrying = h(Grp, { t: IW.sec.carrying },
      h(Fl, { chip: fieldChip(sec, 'encumbrance'), k: sec === 'gear' ? 'Encumbrance' : 'Encumbrance · hardpoints', field: 'encumbrance' }, h('div', { className: 'ed-inrow' },
        h(NumIn, { value: rec.encumbrance, ro: ro, label: 'Encumbrance', field: 'encumbrance', onChange: function (v) { set('encumbrance', v); } }),
        sec === 'gear' ? null : h(NumIn, { value: rec.hardpoints, ro: ro, label: 'Hardpoints', field: 'hardpoints', onChange: function (v) { set('hardpoints', v); } }))),
      etbRow);
    var buying = h(Grp, { t: IW.sec.buying },
      h(Fl, { chip: fieldChip(sec, 'price'), k: 'Price · rarity', field: 'price', bad: bad.price || bad.rarity }, h('div', { className: 'ed-inrow' },
        h(NumIn, { value: rec.price, sep: true, ro: ro, label: 'Price', field: 'price', onChange: function (v) { set('price', v); } }),
        h(NumIn, { value: rec.rarity, ro: ro, label: 'Rarity', field: 'rarity', onChange: function (v) { set('rarity', v); } }),
        h('span', { className: 'ed-hint' }, 'credits · rarity'))),
      h(Fl, { chip: fieldChip(sec, 'restricted'), k: 'Restricted', field: 'restricted' }, h(Tog, { on: rec.restricted === true, ro: ro, label: 'Restricted (R)', field: 'restricted', onChange: function (v) { set('restricted', v ? true : undefined); } })));
    var inPlay = h(InPlay, { rec: rec, sec: sec, ro: ro, vocab: vocab, onChange: p.onChange });
    var desc = h(Fl, { chip: fieldChip(sec, 'description'), k: 'Description', field: 'description' }, h(GlyphArea, { value: rec.description, ro: ro, label: 'Description', field: 'description', onChange: function (v) { set('description', v); } }));
    if (sec === 'armor') return [what, h(Grp, { t: IW.sec.protection, key: 'pr' }, h(Fl, { chip: fieldChip(sec, 'defense'), k: 'Defense · soak', field: 'defense', bad: bad.defense || bad.soak },
      h('div', { className: 'ed-inrow' }, h(NumIn, { value: rec.defense, ro: ro, label: 'Defense', field: 'defense', onChange: function (v) { set('defense', v); } }),
        h(NumIn, { value: rec.soak, ro: ro, label: 'Soak', field: 'soak', onChange: function (v) { set('soak', v); } }), h('span', { className: 'ed-hint' }, 'defense · soak')))),
      carrying, buying, inPlay, h(Grp, { t: IW.sec.text, key: 'tx' }, desc)].map(function (x, i) { return h('div', { key: i }, x); });
    if (sec === 'gear') return [what, carrying, buying, inPlay, h(Grp, { t: IW.sec.text }, desc)].map(function (x, i) { return h('div', { key: i }, x); });
    // weapons
    var skills = {}; Object.keys(t).forEach(function (id) { if (t[id].skill) skills[t[id].skill] = true; });
    var dmg = rec.damage || {}, qs = Array.isArray(rec.qualities) ? rec.qualities : [];
    var negAdd = dmg.base === 'brawn' && Number(dmg.value) < 0;
    var qc = EC() ? EC().fieldClassOf('weapons', 'qualities', qs) : 'prints';
    var attack = h(Grp, { t: IW.sec.attack, aside: 'feeds the pool' },
      h(Fl, { chip: fieldChip(sec, 'skill'), k: 'Skill', field: 'skill', bad: bad.skill }, h(Sel, { value: rec.skill, ro: ro, label: 'Skill', field: 'skill',
        options: Object.keys(skills).map(function (x) { return [x, skillLabel(x, vocab)]; }).sort(function (a, b) { return a[1].localeCompare(b[1]); }), onChange: function (v) { set('skill', v); } })),
      h(Fl, { chip: fieldChip(sec, 'damage'), k: 'Damage · critical', field: 'damage', bad: bad.damage || bad.crit },
        h('div', { className: 'ed-inrow' },
          // B-1546: a Brawn add's sign as every label site prints it (ItemResolve.brawnDamageText: "+2", "−1") — the prefix
          // carries the sign, the box the number; the box takes digits only, so a typed number keeps the record's sign
          dmg.base === 'brawn' ? h('span', { className: 'ed-fmt', style: { margin: 0 } }, negAdd ? '−' : '+') : null,
          h(NumIn, { value: negAdd ? -dmg.value : dmg.value, ro: ro, label: 'Damage', field: 'damage', onChange: function (v) { var d = { base: dmg.base || 'flat' }; if (v != null) d.value = negAdd && v ? -v : v; set('damage', d.value == null && d.base === 'flat' ? null : d); } }),
          h(NumIn, { value: rec.crit, ro: ro, label: 'Critical', field: 'crit', onChange: function (v) { set('crit', v); } }),
          h('span', { className: 'ed-hint' }, 'damage · critical')),
        h('div', { className: 'ed-inrow', style: { marginTop: 8 } }, h(Tog, { on: dmg.base === 'brawn', ro: ro, label: 'Add Brawn', field: 'damage_base', onChange: function (v) {
          var d = { base: v ? 'brawn' : 'flat' }; if (dmg.value != null) d.value = dmg.value; else if (v) d.value = 0; set('damage', d.value == null ? null : d); } }))),
      h(Fl, { chip: fieldChip(sec, 'range'), k: 'Range', field: 'range', bad: bad.range }, h(Sel, { value: rec.range, ro: ro, label: 'Range', field: 'range',
        options: RANGES.map(function (r) { return [r, (SI() && SI().RANGE_REF_LABELS && SI().RANGE_REF_LABELS[r]) || capf(r)]; }), onChange: function (v) { set('range', v); } })));
    var quals = h(Grp, { t: IW.sec.qualities },
      h(Fl, { chip: chipOf(qc === 'resolves' ? 'resolves' : 'prints'), k: 'Qualities', field: 'qualities' },
        h('div', { className: 'ed-btnrow' }, qs.length ? qs.map(function (q, i) {
          return h('button', { type: 'button', key: q.id + i, className: 'ed-qchip', disabled: ro, 'aria-label': ro ? qualName(q) : 'Remove ' + qualName(q),
            onClick: function () { var n = qs.slice(); n.splice(i, 1); set('qualities', n.length ? n : []); } }, qualName(q) + (ro ? '' : ' ×'));
        }) : h('span', { className: 'ed-hint', style: { margin: 0 } }, 'None'),
          ro ? null : h('button', { type: 'button', className: 'ed-addline', style: { margin: 0 }, 'aria-expanded': !!p.picker, onClick: p.togglePicker, 'data-editor-addq': '1' }, '+ Add')),
        p.picker ? h(QualPicker, { vocab: vocab, books: books, held: qs.map(function (q) { return q.id; }), onAdd: function (q) { set('qualities', qs.concat([q])); p.togglePicker(); } }) : null));
    return [what, attack, carrying, buying, quals, inPlay, h(Grp, { t: IW.sec.text }, typeSel, desc)].map(function (x, i) { return h('div', { key: i }, x); });
  }

  // before a save: a sentence left empty is not a line (its dice stand bare), empty lists go, '' strings go
  function normalized(rec, sec) {
    var r = clone(rec);
    if (Array.isArray(r.base_mods)) {
      for (var i = r.base_mods.length - 1; i >= 0; i--) {
        if (String(r.base_mods[i].description || '').trim()) continue;
        r.base_mods.splice(i, 1);
        (r.pool_mods || []).forEach(function (p) {
          if (!p.from || p.from.channel !== 'base_mods') return;
          if (p.from.index === i) delete p.from; else if (p.from.index > i) p.from.index--;
        });
      }
      if (!r.base_mods.length) delete r.base_mods;
    }
    if (Array.isArray(r.pool_mods) && !r.pool_mods.length) delete r.pool_mods;
    ['name', 'type', 'skill', 'range', 'description'].forEach(function (k) { if (typeof r[k] === 'string' && !r[k].trim()) delete r[k]; });
    if (typeof r.name === 'string') r.name = r.name.trim();
    if (sec === 'weapons' && !Array.isArray(r.qualities)) r.qualities = [];   // the rail requires the key (R-FIFG-4's measured fact)
    return r;
  }
  // the rail's reasons in the user's words (I-10's accepted mapping + the chrome named in the gate)
  function reasonsOf(list, sec) {
    var words = [], bad = {};
    (list || []).forEach(function (r) {
      var m = /^[a-z_]+\.[a-z0-9_]+((?:\.[a-z_]+|\[\d+\])*): (.*)$/.exec(String(r)), field = null;
      if (m) {
        var seg = /^\.([a-z_]+)/.exec(m[1]);
        if (seg) field = seg[1];
        else { var b = /^`([a-z_]+)` is required/.exec(m[2]); if (b) field = b[1]; else if (sec === 'armor' && /matches none/.test(m[2])) field = 'soak'; }
      }
      var w = field ? (IW.reasons[field] || IW.reasonsMore[field] || IW.reasonOther(FIELD_LABEL[field] || field)) : String(r).replace(/ — refused$/, '');
      if (field) bad[field] = true;
      if (words.indexOf(w) === -1) words.push(w);
    });
    return { words: words, bad: bad };
  }
  function blankRec(sec) { return sec === 'weapons' ? { name: '', qualities: [] } : { name: '' }; }
  function editable(rec) { var o = {}; Object.keys(rec || {}).forEach(function (k) { if (k.charAt(0) !== '_') o[k] = clone(rec[k]); }); return o; }
  function newPackId(nm) {
    var U = UD(), base = slug(nm) || 'collection', id = base, n = 2, have = {};
    (U.list() || []).forEach(function (c) { have[c.packId] = true; });
    if (base === (U.MY_DATA || 'my_data')) id = base = base + '_2';
    while (have[id]) id = base + '_' + (n++);
    return id;
  }

  // ── the IN ▾ (R-FIEC-7 / I-13): a first save chooses; an existing add or derive copies; a redefine lives in one ──
  function InMenu(p) {
    var own = (p.store.list ? ordered(p.store.list) : []).filter(function (c) { return c.origin === 'own'; });
    var _n = useState(null), nm = _n[0], setNm = _n[1];
    var _e = useState(''), err = _e[0], setErr = _e[1];
    var off = function (c) { return c.active ? null : h('span', { key: 'o' }, 'off'); };
    var apart = function (c) { return apartLines(c, own, { flexBasis: '100%', order: 9, marginTop: 0 }); };   // R-MSMG-2 (F3a-in)
    function create() {
      var name = (nm || '').trim(); if (!name) { setErr(W.giveName); return; }
      var id = newPackId(name);
      UD().createPack({ packId: id, name: name }).then(function (r) {
        if (r.ok) { setNm(null); p.onPick(r.ck || id); } else setErr(String(r.reasons[0]).indexOf('name-taken') === 0 ? W.nameTaken(name) : r.reasons[0]);
      });
    }
    var items;
    if (p.state === 'first') items = own.map(function (c) {
      var on = c.ck === p.current;
      return h('button', { type: 'button', key: c.ck, role: 'menuitemradio', 'aria-checked': on, className: 'ed-op', onClick: function () { p.onPick(c.ck); }, 'data-editor-in': c.packId },
        c.name, off(c), on ? h('span', { className: 'ed-ck', key: 'k' }, '✓') : null, apart(c));
    }).concat([nm == null ? h('button', { type: 'button', key: '+new', className: 'ed-op', onClick: function () { setNm(''); setErr(''); } }, IW.newColl)
      : h('div', { key: '+new', style: { padding: '8px 12px', borderTop: '1px solid var(--doc-rule-fine)' } }, h('div', { className: 'ed-rename', style: { marginTop: 0 } },
        h('input', { className: 'ed-input', value: nm, autoFocus: true, 'aria-label': 'Name', onChange: function (e) { setNm(e.target.value); setErr(''); }, onKeyDown: function (e) { if (e.key === 'Enter') create(); } }),
        h('button', { type: 'button', className: 'hp-commit', onClick: create }, 'Save')), err ? h('div', { className: 'ed-hint', role: 'status' }, err) : null)]);
    else if (p.state === 'new') items = own.map(function (c) {
      var on = c.ck === p.current;
      return on ? h('div', { key: c.ck, role: 'menuitemradio', 'aria-checked': true, className: 'ed-op' }, c.name, off(c), h('span', { className: 'ed-ck', key: 'k' }, '✓'), apart(c))
        : h('button', { type: 'button', key: c.ck, role: 'menuitem', className: 'ed-op', onClick: function () { p.onCopy(c.ck); }, 'data-editor-copyto': c.packId }, IW.copyTo(c.name), off(c), apart(c));
    });
    else items = own.map(function (c) {
      var on = c.ck === p.current;
      return h('div', { key: c.ck, role: 'menuitemradio', 'aria-checked': on, 'aria-disabled': on ? undefined : 'true', className: 'ed-op' }, c.name, off(c), on ? h('span', { className: 'ed-ck', key: 'k' }, '✓') : null, apart(c));
    }).concat([h('div', { key: 'n', className: 'ed-note' }, IW.oneColl(p.bookName))]);
    return h('div', { className: 'ed-menu', role: 'menu', 'data-editor-inmenu': p.state }, items);
  }

  // F3 / F4 / F7 draw the books in the base mark ("From Grit · Edge of the Empire · Age of Rebellion · … · book unchanged"); the line
  // titles drop the shelf's " Core Rulebook" suffix, as the creator's cite does (gameLineTitle). Items' approved marks carry none.
  function m5Books(sec, rec) {
    // M12 (F2, R-M12B-9): the career's mark keeps the full title, as F1's BOOK column and F2's mark draw it
    if (sec === 'careers') { var cb = booksOf(rec); return cb.length ? ' · ' + cb.join(' · ') : null; }
    if (sec !== 'talents' && sec !== 'specializations' && sec !== 'species' && sec !== 'force_powers' && sec !== 'signature_abilities') return null;   // M10: F3 draws the power's books; M12 F2 (d) the ability's
    var b = (sec === 'signature_abilities' ? sigBooksOf(rec) : booksOf(rec)).map(function (x) { return String(x).replace(/ Core Rulebook$/, ''); });
    return b.length ? ' · ' + b.join(' · ') : null;
  }
  // ── each kind's FACE on the one record form (M5): its body, preview, normalization, the editor's own checks, its Delete words ──
  function faceOf(sec) {
    if (sec === 'talents') return { Body: TalentBody, Plate: TalentPlate, Peek: TalentPeek, normalize: normalizeTalent, blank: blankTalent, check: talentCheck,
      del: function (R, n) { var nm = R.rec.name || R.id; return R.mode === 'redefine' ? TW.delRedefTalent(nm, n) : TW.delNewTalent(nm, n); } };
    if (sec === 'specializations') return { Body: SpecBody, tree: true, normalize: normalizeSpec, blank: null, check: specCheck,
      del: function (R, n) { var nm = R.rec.name || R.id; return R.mode === 'redefine' ? TW.delRedefSpec(nm, n) : TW.delNewSpec(nm, n); } };
    if (sec === 'species') return { Body: SpeciesBody, Plate: SpeciesPlate, Peek: SpeciesPeek, normalize: normalizeSpecies, blank: null, check: speciesCheck, copyOnly: true,
      del: function (R, n) { var nm = R.rec.name || R.id; return R.mode === 'redefine' ? SW.delRedef(nm, n) : SW.delNew(nm, n); } };
    // M10 (R-M10E-2): the specialization's face — the tree editor, no blank, the intent radio — with W2's eyebrow (D-142)
    if (sec === 'force_powers') return { Body: PowerBody, tree: true, maker: FW.fromBook, normalize: normalizePower, blank: null, check: powerCheck,
      del: function (R, n) { var nm = R.rec.name || R.id; return R.mode === 'redefine' ? FW.delRedef(nm, n) : FW.delNew(nm, n); } };
    // M12 (R-M12B-9 F2, D-157): the career's face — the fields plate and the three sections side by side, no preview; no blank (NO_BLANK)
    if (sec === 'careers') return { Body: CareerBody, split: true, normalize: normalizeCareer, blank: null, check: careerCheck,
      del: function (R, n) { var nm = R.rec.name || R.id; return R.mode === 'redefine' ? CRW.delRedef(nm, n) : CRW.delNew(nm, n); } };
    // M12 (R-M12B-9 F2 (d)/(f), R-M12B-102): the signature ability's face — the power's tree editor, a shelf-less kind; its blank is
    // the held draft's (the career that opened it)
    if (sec === 'signature_abilities') return { Body: SigBody, tree: true, sig: true, maker: SGW.fromBook, normalize: normalizeSig, blank: blankSig, check: sigCheck,
      del: function (R, n) { var nm = R.rec.name || R.id; return R.mode === 'redefine' ? FW.delRedef(nm, n) : FW.delNew(nm, n); } };
    return { Body: FormBody, Plate: ItemPlate, Peek: Peek, normalize: function (r) { return normalized(r, sec); }, blank: function () { return blankRec(sec); }, check: null,
      del: function (R) { return IW.del(R.rec.name || R.id); } };
  }

  // M12 (R-M12B-102): the held draft of a new signature ability — the career that opened it. Page memory only, so a reload of
  // /signature_abilities/new holds none (the Editor sends it to the Careers shelf). `navedInApp`: this page has pushed a route of
  // its own, so a signature ability's Back can use the history.
  var sigHeld = null, navedInApp = false;
  // the career a signature ability names (its first `careers`): yours first (a copy or a change), else the book's — its name and
  // the route of its form
  function careerFor(books, store, cid) {
    if (!cid) return null;
    var y = yoursOf('careers', books, store).filter(function (r) { return r.id === cid; })[0];
    if (y) return { id: cid, name: y.rec.name || cid, rec: y.rec, route: recRoute('careers', y.ck, cid) };
    var b = bookRecOf(books, 'careers', cid);
    return b ? { id: cid, name: b.name || cid, rec: b, route: { view: 'record', shelf: 'careers', id: cid } } : null;
  }
  // ── THE RECORD FORM: a book record (F5/I-9/I-2/I-3), a pack record (F8/I-6/S4/I-11), a blank draft (I-5/I-10) ──
  function RecordForm(p) {
    var route = p.route, sec = route.shelf, books = p.books, store = p.store, wide = p.wide, vocab = p.vocab, U = UD(), k = KIND1[sec], face = faceOf(sec);
    var db = (sec === 'talents' || sec === 'specializations') ? talentViewOf(books, store) : null;   // M5: book ∪ own talents (the tree's names and the picker)
    var book = route.view === 'record' && !route.packId ? bookRecOf(books, sec, route.id) : null;
    // An OPEN form outlives its record: another tab may delete it, or remove its collection, while this one edits it —
    // the Save then says so (P5 / P5b) instead of the form vanishing with the user's edits (the Editor keeps it mounted).
    var rin = route.packId ? ED().resolveIn(route, store.list || []) : null;   // R-SII-10: which collection this route names
    var liveR = rin ? recordIn(rin.ck, sec, route.id, books) : null;
    var lastR = useRef(liveR); if (liveR) lastR.current = liveR;
    var R = liveR || lastR.current;
    var kind0 = route.view === 'draft' ? 'blank' : R ? (R.origin === 'own' ? 'pack' : 'imported') : 'book';
    // R-M13B-36: `aim` — the form opened by "Modify this Character". It starts from the character's copy, a save lands in that page's draft, Back returns there.
    var aim = p.aim || null;
    var start = function () { return aim && aim.rec ? editable(aim.rec) : kind0 === 'blank' ? face.blank() : kind0 === 'book' ? editable(book) : editable(R.rec); };
    var _d = useState(start), draft = _d[0], setDraft = _d[1];
    var _i = useState(function () { return JSON.stringify(start()); }), initial = _i[0], setInitial = _i[1];
    var _c = useState(false), copying = _c[0], setCopying = _c[1];   // I-11's "Make your own copy": the form becomes a draft in place
    var _t = useState(function () { return R && R.origin === 'own' ? R.ck : homeCk(); }), target = _t[0], setTarget = _t[1];
    var _n = useState(aim && aim.intent || 'new'), intent = _n[0], setIntent = _n[1];   // R-M13B-49: "Modify a …" opens on Change
    var _m = useState(false), menu = _m[0], setMenu = _m[1];
    var _a = useState(false), arm = _a[0], setArm = _a[1];
    var _r = useState(null), refused = _r[0], setRefused = _r[1];
    var _q = useState(false), picker = _q[0], setPicker = _q[1];
    var _u = useState(null), undo = _u[0], setUndo = _u[1];
    var _b = useState(true), review = _b[0], setReview = _b[1];   // F8 / I-6 at 390 draw the compare open; the mark folds it
    var _s = useState(false), busy = _s[0], setBusy = _s[1];
    var _x = useState(false), delArm = _x[0], setDelArm = _x[1];   // M11: the record's Delete, armed — the live two-tap
    var _e = useState(false), edited = _e[0], setEdited = _e[1];   // M12 (F2): the first edit opens the career's authoring view, and it stays open
    useEffect(function () { if (!delArm) return; var t = setTimeout(function () { setDelArm(false); }, ARM_MS); return function () { clearTimeout(t); }; }, [delArm]);
    // C3 (R-FIL-2; ruling f100-items-live-contracts R-FILC-4): the record exactly as stored when this form opened it — every
    // save of an own record names it, and it becomes what the save stored (so two saves in a row never raise P5, R-FILC-2 (a))
    var openedRef = useRef(R && R.origin === 'own' ? clone(R.raw) : undefined);
    var _k = useState(null), clash = _k[0], setClash = _k[1];     // P5 { stored } · P5b { removed: true }
    var _h = useState(false), rehome = _h[0], setRehome = _h[1];  // P5b: the record's collection is gone; the next Save goes where In: ▾ says
    var isHeld = held(store);
    var kind = copying ? 'blank' : kind0;
    var ro = isHeld || (kind0 === 'imported' && !copying);
    var dirty = JSON.stringify(draft) !== initial;
    var bookName = book ? book.name : R && R.book ? R.book.name : null;
    var rootId = book ? book.id : R ? R.baseId : null;
    var own = (store.list ? ordered(store.list) : []).filter(function (c) { return c.origin === 'own'; });
    var colName = function (ck) { var c = own.filter(function (x) { return x.ck === ck; })[0]; return c ? c.name : R && R.ck === ck ? R.colName : ck; };
    // R-FIEC-6: "Change the book's" is unavailable when an own collection already changes that record
    var changer = book ? own.filter(function (c) { var pk = U.get(c.ck); return !!(pk && pk.pack.sections && isObj(pk.pack.sections[sec]) && Object.prototype.hasOwnProperty.call(pk.pack.sections[sec], book.id)); })[0] : null;
    useEffect(function () { if (changer && intent === 'change') setIntent('new'); }, [changer && changer.ck]);
    // preview + display record: an anchored record's sources are its book's (R-FIEC-4)
    var view = clone(draft);
    if (kind0 === 'book' || (R && R.book)) view.sources = clone(((book || (R && R.book)) || {}).sources || []);
    // M12 (R-M12B-102): a signature ability has no shelf — its way out is its career's form (the first in its `careers`), and
    // Back uses the app's history when there is one
    var sigCareer = face.sig ? careerFor(books, store, arrOf(draft, 'careers')[0] || (sigHeld && sigHeld.career)) : null;
    function exitRoute() { return face.sig ? (sigCareer ? sigCareer.route : { view: 'home' }) : { view: 'shelf', shelf: sec }; }
    function back() { if (aim) { aim.onBack(); return; } if (face.sig && navedInApp) { window.history.back(); return; } p.go(exitRoute()); }
    // `arm` is true (leave by Back) or the route a tap asked for (the career form's ability rows, F2 (d)). A route's `view` is a
    // string: a click event handed straight in (its `view` is the window) is a plain Back, never a route (E5's I-7 red)
    function isRoute(to) { return !!to && typeof to.view === 'string'; }
    function leave(to) { if (dirty && !ro) { setArm(isRoute(to) ? to : true); setMenu(false); } else if (isRoute(to)) p.go(to); else back(); }
    function armGo() { if (isRoute(arm)) p.go(arm); else back(); }
    // R-FIEG-R3: an OWN record deletes with M11's two-tap (the same button, a second tap confirms, it disarms by itself)
    function del() {
      if (!delArm) { setDelArm(true); setMenu(false); return; }
      setDelArm(false);
      // Delete does not compare (C3.a); a record already gone — deleted, or its collection removed, in another tab — is what was asked for
      U.deleteRecord(R.ck, sec, R.id).then(function (r) {
        if (r.ok || /^no-such-(record|pack)/.test(String((r.reasons || [])[0] || ''))) p.go(exitRoute(), null, true);
        else setRefused(reasonsOf(r.reasons, sec));
      });
    }
    // a refused save: P5 when another tab changed the record after this form opened it; P5b when its collection is gone
    // (In: ▾ resets to My Data, the collection that always exists — R-FILC-4 C3.b); otherwise I-10's reasons
    function refusedSave(r) {
      if (r.changed) { setRefused(null); setClash({ stored: r.stored === undefined ? null : r.stored }); return; }
      if (/^no-such-pack/.test(String((r.reasons || [])[0] || ''))) { setRefused(null); setClash({ removed: true }); setRehome(true); setTarget(homeCk()); return; }
      setClash(null); setRefused(reasonsOf(r.reasons, sec));
    }
    function afterSave(r, ck, first) {
      setBusy(false);
      if (!r.ok) { refusedSave(r); return; }
      setRefused(null); setClash(null);
      if (first) { p.go(recRoute(sec, r.ck || ck, r.id), null, true); return; }
      if (r.record) openedRef.current = r.record;
      setInitial(JSON.stringify(draft));
    }
    function save() {
      if (busy || ro) return;
      setMenu(false);
      var rec = face.normalize(draft, book || (R && R.book) || null);
      var chk = face.check ? face.check(rec, { db: db }) : null;   // M5: U12 / U10b — the editor's own reasons, in I-10's idiom
      if (chk) { setClash(null); setRefused(chk); return; }
      if (aim) { var ar = aim.onSave(rec, { intent: intent }); if (ar && ar.ok === false) refusedSave(ar); return; }   // the aim's rail refused: I-10's reasons, the form stays open
      setBusy(true);
      if (kind === 'pack' && !rehome) { rec.id = R.id; return U.saveRecord(R.ck, sec, rec, { opened: openedRef.current }).then(function (r) { afterSave(r, R.ck, false); }); }
      // a FIRST save (and P5b's save into the collection picked): the id is minted inside the write (C1.a, R-FILC-2)
      var opts = { create: true };
      if (kind === 'pack') { if (R.mode === 'redefine') rec.id = R.id; else { opts.mint = true; if (R.mode === 'derive' && R.book) opts.from = R.baseId; } }
      else if (kind === 'book' && intent === 'change') rec.id = book.id;
      else { opts.mint = true; if (kind === 'book') opts.from = book.id; else if (copying && rootId && bookRecOf(books, sec, rootId)) opts.from = rootId; }
      U.saveRecord(target, sec, rec, opts).then(function (r) { afterSave(r, target, true); });
    }
    // P5's two choices. "Show that version" drops this form's edits and loads the stored record (the store's cache adopted it
    // when the save was refused); a record deleted there has nothing to show, so the form goes back to its shelf.
    function showStored() {
      var fresh = recordIn(R.ck, sec, R.id, books);
      setClash(null);
      if (!fresh) { p.go(exitRoute(), null, true); return; }
      var d = editable(fresh.rec); openedRef.current = clone(fresh.raw);
      setDraft(d); setInitial(JSON.stringify(d)); setUndo(null);
    }
    // "Save mine over it": the same save, over the version the other tab stored
    function saveMine() {
      if (busy || !clash) return;
      setBusy(true);
      var rec = face.normalize(draft, book || (R && R.book) || null); rec.id = R.id;
      U.saveRecord(R.ck, sec, rec, { opened: clash.stored }).then(function (r) { afterSave(r, R.ck, false); });
    }
    function copyTo(ck) {
      setMenu(false);
      var rec = face.normalize(draft, book || (R && R.book) || null), opts = { create: true, mint: true };
      if (R.mode === 'derive' && R.book) opts.from = R.baseId;
      U.saveRecord(ck, sec, rec, opts).then(function (r) {
        if (r.ok) p.go(recRoute(sec, r.ck || ck, r.id)); else refusedSave(r);
      });
    }
    // F8: the user's answer re-anchors on the live book (anchor 'reconcile'); Undo restores the prior anchor (R-EC2-4)
    function resolve(picks) {
      var prior = editable(R.raw), priorAnchor = clone(R.raw._base);
      var stored = editable(R.raw), took = [];
      Object.keys(picks).forEach(function (f) { if (picks[f] === 'book') { took.push(f); if (R.book[f] == null) delete stored[f]; else stored[f] = clone(R.book[f]); } });
      stored.id = R.id;
      return U.saveRecord(R.ck, sec, stored, { anchor: 'reconcile', opened: openedRef.current }).then(function (r) {
        if (!r.ok) { refusedSave(r); return false; }
        setRefused(null); setClash(null);
        if (r.record) openedRef.current = r.record;
        // the form takes the record as STORED: the store re-keys a taken row to the copy (B-1748), and a later Save re-sends the draft
        var kept = r.record || stored;
        var d = clone(draft); took.forEach(function (f) { if (kept[f] == null) delete d[f]; else d[f] = clone(kept[f]); });
        setDraft(d);
        var base = JSON.parse(initial); took.forEach(function (f) { if (kept[f] == null) delete base[f]; else base[f] = clone(kept[f]); }); setInitial(JSON.stringify(base));
        setUndo({ prior: prior, anchor: priorAnchor, took: took });
        return true;
      });
    }
    function undoIt() {
      var u = undo; if (!u) return;
      var rec = clone(u.prior); rec.id = R.id;
      U.saveRecord(R.ck, sec, rec, { anchor: u.anchor, opened: openedRef.current }).then(function (r) {
        if (!r.ok) { refusedSave(r); return; }
        if (r.record) openedRef.current = r.record;
        var d = clone(draft), base = JSON.parse(initial);
        u.took.forEach(function (f) { [d, base].forEach(function (o) { if (u.prior[f] == null) delete o[f]; else o[f] = clone(u.prior[f]); }); });
        setDraft(d); setInitial(JSON.stringify(base)); setUndo(null);
      });
    }
    var split = R && R.origin === 'own' && R.state === 'moved' && !copying ? U.split(sec, R.id, R.raw) : null;
    var f8 = split ? h(BookChanged, { key: 'f8:' + (R.raw._base && R.raw._base.ref), R: R, split: split, rec: draft, vocab: vocab, books: books, ro: isHeld, onResolve: resolve }) : null;
    var undoLine = undo ? h('div', { className: 'ed-fact', role: 'status', 'data-editor-undo': '1' }, undo.took.length ? IW.took : IW.kept,
      h('button', { type: 'button', className: 'hp-quiet', style: { marginLeft: 8 }, onClick: undoIt }, IW.undo)) : null;
    var missing = R && R.state === 'missing' && !copying ? h(MissingPlate, { name: R.mode === 'redefine' ? (R.rec.name || R.id) : (R.raw._base && R.raw._base.id) || R.id, sources: R.rec.sources }) : null;
    // ── the head ──
    var maker, desig, mark = null, under = null;
    var dn = draft.name && String(draft.name).trim() ? draft.name : null;
    if (kind === 'blank') {
      maker = IW.eyebrowNew(k); desig = h('h1', { className: 'hp-desig' + (dn ? '' : ' ed-desig-muted') }, dn || 'New ' + k);
      if (copying && rootId && bookName) under = h('span', { className: 'ed-fact' }, IW.newFrom(k, bookName));
    } else if (kind === 'book') {
      maker = face.maker ? face.maker : face.tree ? 'Specialization · tree editor' : face.copyOnly ? SW.newFrom(book.name) : capf(k) + ' · from the book'; desig = h('h1', { className: 'hp-desig' }, dn || book.name);
      mark = h('span', { className: 'ed-basemark' }, 'From ', h('b', null, book.name), m5Books(sec, book), ' · book unchanged');
      // M9 (F3/F6, R-M9B-9): a book species is always a new copy — the intent is fixed at 'new' and the radio is not drawn
      if (!face.copyOnly) under = h('div', { className: 'ed-intent', role: 'radiogroup', 'aria-label': book.name, 'data-editor-intent': intent },
        h('button', { type: 'button', role: 'radio', className: 'ed-io', 'aria-checked': intent === 'new' ? 'true' : 'false', disabled: ro, onClick: function () { setIntent('new'); }, 'data-editor-intent-new': '1' },
          h('span', { className: 'ed-rd' }), h('span', null, IW.newFrom(k, book.name))),
        changer ? h('div', { role: 'radio', className: 'ed-io', 'aria-checked': 'false', 'aria-disabled': 'true', 'data-off': '1', 'data-editor-intent-change': 'off' }, h('span', { className: 'ed-rd' }), h('span', null, IW.changeBook(book.name)),
            h('span', { className: 'ed-why' }, h('button', { type: 'button', className: 'ed-link', onClick: function () { p.go(recRoute(sec, changer.ck, book.id)); } }, IW.already(changer.name, book.name))))
          : h('button', { type: 'button', role: 'radio', className: 'ed-io', 'aria-checked': intent === 'change' ? 'true' : 'false', disabled: ro, onClick: function () { setIntent('change'); }, 'data-editor-intent-change': '1' },
            h('span', { className: 'ed-rd' }), h('span', null, IW.changeBook(book.name))));
    } else {
      maker = capf(k) + ' · ' + (R.origin === 'own' ? 'yours · ' : '') + R.colName; desig = h('h1', { className: 'hp-desig' }, dn || R.rec.name || R.id);
      if (R.mode !== 'add') {
        if (R.state === 'missing') mark = h('span', { className: 'ed-basemark', 'data-state': 'missing' }, 'From ', h('b', null, R.mode === 'redefine' ? (R.rec.name || R.id) : R.baseId), ' · not in this version');
        else if (R.state === 'moved' && R.origin === 'own') mark = h('button', { type: 'button', className: 'ed-basemark', 'data-state': 'moved', 'aria-expanded': review, onClick: function () { setReview(!review); }, 'data-editor-basemark': 'moved' },
          'From ', h('b', null, bookName), ' · the book changed · review ▾');
        else if (R.state === 'moved') mark = h('span', { className: 'ed-basemark', 'data-state': 'moved', style: { cursor: 'default' } }, 'From ', h('b', null, bookName), ' · the book changed');
        else mark = h('span', { className: 'ed-basemark' }, 'From ', h('b', null, bookName), m5Books(sec, R.book), ' · book unchanged');
        if (R.origin === 'own') under = h('span', { className: 'ed-fact', 'data-editor-fact': R.mode }, R.mode === 'redefine' ? IW.changeBook(bookName || R.rec.name) : IW.newFrom(k, bookName || R.baseId));
      }
      if (R.origin !== 'own') under = h('div', { className: 'ed-rohead' }, IW.imported(R.colName));
    }
    var head = [h('div', { className: 'hp-maker', key: 'm' }, maker), h('div', { key: 'd' }, desig), mark ? h('div', { style: { marginTop: 10 }, key: 'b' }, mark) : null, under ? h('div', { key: 'u' }, under) : null];
    // ── the save row, or the leave notice (I-7), or I-11's commit ──
    var firstSave = kind === 'blank' || kind === 'book' || rehome;   // P5b: a record whose collection is gone picks one, like a first save
    var inState = firstSave ? 'first' : R && R.mode === 'redefine' ? 'redefine' : 'new';
    var canDel = kind0 === 'pack' && !copying && !!R;
    var saveRow;
    if (isHeld) saveRow = null;
    else if (kind0 === 'imported' && !copying) saveRow = h('div', { className: 'ed-btnrow', style: { marginTop: 22 } },
      h('button', { type: 'button', className: 'hp-commit', onClick: function () { setCopying(true); setTarget(homeCk()); setInitial('{}'); }, 'data-editor-owncopy': '1' }, IW.ownCopy));
    else if (arm) saveRow = h('div', { className: 'ed-arm', role: 'alert', style: { marginTop: 22 }, 'data-editor-leave': '1' },
      h('span', { className: 'ed-at' }, IW.leave(dn || bookName || 'this ' + k)),
      h('div', { className: 'ed-btnrow' }, h('button', { type: 'button', className: 'ed-confirm', onClick: armGo, 'aria-label': 'Tap again to leave without saving', 'data-editor-leave-go': '1' }, IW.leaveB),
        h('button', { type: 'button', className: 'hp-quiet', onClick: function () { setArm(false); } }, IW.keepB)));
    else saveRow = h('div', null, h('div', { className: 'ed-btnrow', style: { marginTop: 22 } },
        h('button', { type: 'button', className: 'hp-commit', onClick: save, disabled: busy, 'data-editor-save': '1' }, 'Save'),
        aim ? null : h('button', { type: 'button', className: 'hp-quiet', style: { color: 'var(--doc-ink)', borderColor: menu || (clash && clash.removed) ? 'var(--doc-action)' : undefined }, 'aria-expanded': menu, onClick: function () { setMenu(!menu); }, 'data-editor-inbtn': '1' },
          'In: ' + colName(firstSave ? target : R.ck) + inSuffix(own.filter(function (x) { return x.ck === (firstSave ? target : R.ck); })[0], own) + (menu ? ' ▴' : ' ▾')),
        h('button', { type: 'button', className: 'hp-quiet', onClick: function () { leave(); }, 'data-editor-cancel': '1' }, 'Cancel'),
        canDel && !aim ? h('button', { type: 'button', className: 'hp-quiet', 'data-on': delArm ? '1' : undefined, onClick: del, 'data-editor-delete': '1' }, 'Delete') : null),
      canDel && delArm ? h('div', { className: 'ed-arm', role: 'alert', 'data-editor-delete-armed': '1' },
        h('span', { className: 'ed-at', 'data-editor-delete-words': '1' }, face.del(R, ownersOf(sec, R.id, p.roster))),   // U3: owners counted first (C5.1)
        h('div', { className: 'ed-btnrow' }, h('button', { type: 'button', className: 'ed-confirm', onClick: del, 'aria-label': 'Tap again to confirm deleting ' + (R.rec.name || R.id), 'data-editor-delete-go': '1' }, 'Tap again'))) : null,
      menu ? h(InMenu, { state: inState, store: store, current: firstSave ? target : R.ck, bookName: bookName, onPick: function (id) { setTarget(id); setMenu(false); }, onCopy: copyTo }) : null,
      refused ? h('div', { className: 'ed-reasons', role: 'alert', 'data-editor-reasons': '1' }, h('b', null, IW.reasonsHead), h('ul', null, refused.words.map(function (w) { return h('li', { key: w }, w); }))) : null,
      // P5 / P5b — I-10's idiom; P5b adds no control (its way on is the In: ▾ above, reset to My Data)
      clash ? h('div', { className: 'ed-reasons', role: 'alert', 'data-editor-clash': clash.removed ? 'removed' : 'changed' },
        h('b', null, IW.notSaved), ' ' + (clash.removed ? IW.removedTab : IW.changedTab(k)),
        clash.removed ? null : h('div', { className: 'ed-btnrow' },
          h('button', { type: 'button', className: 'hp-quiet', style: { color: 'var(--doc-ink)' }, onClick: showStored, 'data-editor-show-stored': '1' }, IW.showThat),
          h('button', { type: 'button', className: 'hp-quiet', style: { color: 'var(--doc-ink)' }, onClick: saveMine, disabled: busy, 'data-editor-save-mine': '1' }, IW.saveMine))) : null);
    var bodyProps = { rec: draft, sec: sec, ro: ro, bad: refused && refused.bad, vocab: vocab, books: books, picker: picker, wide: wide, db: db,
      base: book || (R && R.book) || JSON.parse(initial), togglePicker: function () { setPicker(!picker); }, onChange: function (r) { setDraft(r); setArm(false); setEdited(true); },
      own: kind0 === 'pack', total: sec === 'species' ? Object.keys((books.sections && books.sections.species) || {}).length : 0,
      // M12 F2 (d)/(f): the ability's career, and whether its columns are authored (a new ability of yours) or carried (a book's, or a copy)
      career: sigCareer, colsEdit: face.sig && (kind === 'blank' || (kind0 === 'pack' && !!R && R.mode === 'add')), store: store };
    // F6 (B-1201): the species picker — beside the form at wide (in the preview's place), a sheet on the phone
    var spPick = sec === 'species' && picker && !ro ? h(SpeciesPicker, { books: books, rec: draft, onDone: wide ? null : function () { setPicker(false); },
      onAdd: function (a) { var n = clone(draft); n.special_abilities = (Array.isArray(n.special_abilities) ? n.special_abilities : []).concat([takenAbility(a)]); setDraft(n); setArm(false); } }) : null;
    var banner = h(Banner, { status: store.status });
    var right = capf(k) + (dn || (book && book.name) || (R && R.rec.name) ? ' · ' + (dn || (book && book.name) || R.rec.name) : '');
    var side = f8 || missing;
    // M12 · the career (F2 (a)–(c)): the head across the page, then the fields plate (Save under it) beside the three sections;
    // the phone stacks them. F8 / S4 (undrawn for careers) sit above the body, as the phone draws them for every kind.
    if (face.split) {
      var newCareer = kind === 'blank' || (kind === 'book' && intent === 'new') || (kind === 'pack' && R && R.mode !== 'redefine');
      var sigId = kind === 'book' ? (intent === 'new' && (dirty || edited) ? null : book.id) : kind === 'blank' || !R ? null : R.id;
      var cbody = h(face.Body, Object.assign({}, bodyProps, { saveRow: saveRow, author: !(kind === 'book' && !dirty && !edited), makesNew: newCareer, sigId: sigId,
        // F2 (d): a row opens its ability; F2 (f): "+ Add a signature ability" opens a draft that holds this career (R-M12B-102) —
        // a career not saved yet has no id to hold, so it says so (implementer's chrome, named in the gate)
        onOpenSig: function (r) { leave(r); },
        onAddSig: ro ? null : function () {
          if (!sigId) { setClash(null); setRefused({ words: [CRW.saveFirst], bad: {} }); return; }
          sigHeld = { career: sigId }; leave({ view: 'draft', shelf: 'signature_abilities' });
        } }));
      var cside = side && (review || !f8) ? h('div', { style: { marginTop: 12, maxWidth: wide ? 760 : undefined } }, side) : null;
      return h('div', { className: wide ? 'ed-desk' : 'ed-pad' }, h(Runhead, { back: aim ? 'Modify this Character' : 'Homebrew · ' + shelfName(sec), right: right.replace(/^[^·]*· /, ''), onBack: function () { leave(); } }), banner,
        head, undoLine, cside, cbody);
    }
    // M5 · the tree editor (F7 / U1b / U13b): the head, the tree across the page, the Save row under it; F8 or S4 beside it
    if (face.tree) {
      var tr = h(face.Body, Object.assign({ compact: !!side && wide }, bodyProps));
      // M12 F2 (d)/(f): the breadcrumb names the ability's career, "<CAREER> · SIGNATURE ABILITIES" (R-M12B-102), at both widths
      var crumb = face.sig ? (sigCareer ? sigCareer.name + ' · ' : '') + shelfName(sec) : null;
      var treeNm = dn || (book && book.name) || (R && R.rec.name) || (face.sig && kind === 'blank' ? SGW.newName : null);
      if (!wide) return h('div', { className: 'ed-pad' }, h(Runhead, { back: aim ? 'Modify this Character' : crumb || shelfName(sec), right: 'Tree editor' + (face.sig && treeNm ? ' · ' + treeNm : ''), onBack: function () { leave(); } }), banner, head, undoLine,
        side && (review || !f8) ? h('div', { style: { marginTop: 12 } }, side) : null, h('div', { style: { marginTop: 14 } }, tr), saveRow);
      return h('div', { className: 'ed-desk' }, h(Runhead, { back: aim ? 'Modify this Character' : crumb || 'Homebrew · ' + shelfName(sec), right: 'Tree editor' + (treeNm ? ' · ' + treeNm : ''), onBack: function () { leave(); } }), banner,
        head, undoLine, side ? h('div', { className: 'ed-dgrid', style: { gridTemplateColumns: 'minmax(0,1fr) ' + (f8 ? 560 : 480) + 'px', marginTop: 14 } }, tr, h('div', null, side))
          : h('div', { style: { marginTop: 14 } }, tr), saveRow);
    }
    var form = h('div', { style: { maxWidth: wide ? 760 : undefined } }, h(face.Body, bodyProps), saveRow);
    if (!wide) return h('div', { className: 'ed-pad' + (side ? '' : ' ed-formpad') }, h(Runhead, { back: aim ? 'Modify this Character' : shelfName(sec), right: capf(k), onBack: function () { leave(); } }), banner, head, undoLine,
      side && (review || !f8) ? h('div', { style: { marginTop: 12 } }, side) : null, form, side || spPick ? null : h(face.Peek, { rec: view, sec: sec, vocab: vocab }),
      spPick ? h('div', { className: 'ed-sheet', role: 'dialog', 'aria-label': SW.pickHead }, h('div', { className: 'ed-grab', 'aria-hidden': 'true' }), spPick) : null);
    return h('div', { className: 'ed-desk' }, h(Runhead, { back: aim ? 'Modify this Character' : 'Homebrew · ' + shelfName(sec), right: right, onBack: function () { leave(); } }), banner,
      h('div', { className: 'ed-dgrid', style: { gridTemplateColumns: 'minmax(0,1fr) ' + (f8 ? 560 : missing ? 480 : 420) + 'px' } },
        h('div', null, head, undoLine, form), h('div', { style: { marginTop: 62 } }, side || spPick || h(face.Plate, { rec: view, sec: sec, vocab: vocab }))));
  }

  // ══ M5 — TALENTS AND SPECIALIZATIONS (ruling f100-m5-contracts; frames F2 · F3 · F4 · F7 approved, U1–U13 approved at
  // e9e7aa49 as ADDENDUM 2 R-M5K-A2-1). The talent form and the tree editor ride RecordForm (the same intent control, save,
  // In ▾, Delete, F8/S4/I-6, leave and refusal as the items — the no-compromise mirror); what differs is each kind's FACE. ══
  var TW = {
    // ── the ruled words, verbatim (ruling §5, A1, A2) ──
    numbers: 'On the sheet — numbers', dice: 'At the roll — dice', text: 'Text for the table',
    perRankHint: 'Lines marked “per rank” grow with each rank.',   // F3, verbatim
    addNumber: '+ Add a number', addDice: '+ Add dice', noNumber: 'This talent changes no number on the sheet.',
    giveName: 'Give it a name.', addSomething: 'Add a number, dice or text.',
    rmDice: 'Remove these dice', rmNumber: function (label) { return 'Remove ' + label; },
    menuHead: function (n) { return 'What it changes · only what the sheet can apply today (' + n + ')'; },
    nothingYet: 'Nothing to show yet.', previewHead: 'Preview · as the sheet draws it',
    goneEdit: 'Deleted talent — pick another', goneRefuse: function (r, c) { return 'Box ' + r + '-' + c + ' needs a talent.'; },
    pickHead: 'Pick a talent for this box',
    editTree: 'Edit the tree', previewBuying: 'Preview · buying',
    linksKey: 'Links:', joined: 'joined', open: 'open — tap to join', tapped: 'tapped — tap again to break',
    delNewTalent: function (nm, n) { return 'Delete ' + nm + '? ' + owners(n, 'have it') + (n ? ' They can still be played, but it becomes an unknown talent that does nothing.' : ''); },
    delRedefTalent: function (nm, n) { return 'Delete your change to ' + nm + '? ' + (n ? owners(n, 'have ' + nm) + ' They go back to the book’s ' + nm + '.' : 'No character has it.'); },
    delNewSpec: function (nm, n) { return 'Delete ' + nm + '? ' + owners(n, 'have it') + (n ? ' They can still be played and keep its talents, but its tree is gone.' : ''); },
    delRedefSpec: function (nm, n) { return 'Delete your change to ' + nm + '? ' + (n ? owners(n, 'have ' + nm) + ' They go back to the book’s tree.' : 'No character has it.'); },
  };
  // "2 characters have it." / "No character has it." (ruled) — the singular "1 character has it." is the implementer's (named in the gate)
  function owners(n, verb) { return n === 0 ? 'No character has it.' : n === 1 ? '1 character ' + verb.replace(/^have\b/, 'has') + '.' : n + ' characters ' + verb + '.'; }
  // U7 (ii), Jason's pick (R-M5K-A2-1): the six ops with an applier row; `characteristic_delta` is offered on NO list (B-845 open)
  var OPS = [['soak_delta', 'Soak'], ['wound_threshold_delta', 'Wound threshold'], ['strain_threshold_delta', 'Strain threshold'],
             ['defense_delta', 'Defense'], ['force_rating_delta', 'Force rating'], ['force_rating_floor', 'Force rating, at least']];
  var OPLAB = {}; OPS.forEach(function (o) { OPLAB[o[0]] = o[1]; });
  var OPWORD = { soak_delta: 'soak', wound_threshold_delta: 'wound threshold', strain_threshold_delta: 'strain threshold', force_rating_delta: 'Force rating' };
  // A1's corrected C3.4: `when` with its three values, as the approved F4 draws them; computeDerived applies a `when` to soak and defense only
  var WHENS = [['', 'Always'], ['armored', 'While wearing armor'], ['armor_soak_2', 'While wearing armor with soak 2+']];
  var WHENLAB = { armored: 'while wearing armor', armor_soak_2: 'while wearing armor with soak 2+' };
  var WHEN_OPS = ['soak_delta', 'defense_delta'];
  var ACTS = ['passive', 'incidental', 'maneuver', 'action', 'incidental_out_of_turn', 'action_out_of_turn', 'active'];   // `active`: F-100 M8 M3 (R-M8BG-225)
  function actLabel(a) { var U = window.SWRPGUI; return (U && U.formatActivation ? U.formatActivation(a) : a) || 'Passive'; }
  function talentChips(rec) { return EC() ? EC().classesOf(rec).map(chipOf) : ['NARRATIVE']; }
  function effLabel(e) { return e.op === 'defense_delta' ? (e.target === 'melee' ? 'Melee defense' : 'Ranged defense') : (OPLAB[e.op] || e.op); }
  // "+1 strain threshold (+1 per rank)" · "Force rating, at least 1" · "+1 soak · while wearing armor"
  // F-100 M7's two SKILL ops (career_skill, skill_characteristic) move no number. The editor draws no line for them and
  // never writes one: every display reader skips them, every write keeps them byte-equal and in place (ruling
  // f100-m7-build R-M7G-5, R-M7G-14). Content checks still count them (R-M7G-15). How the editor shows them is M8's.
  // F-100 M8 M2's skill_substitute (R-M8BG-233/234) moves no number either: it draws as "Use another skill" in
  // "At the roll — dice" (SubstituteLine), never as a number line.
  var SKILL_OPS = { career_skill: true, skill_characteristic: true, skill_substitute: true };
  function isSkillOp(e) { return !!(e && SKILL_OPS[e.op] === true); }
  function effRead(e) {
    if (isSkillOp(e)) return '';
    var body = e.op === 'force_rating_floor' ? 'Force rating, at least ' + e.amount
      : '+' + e.amount + ' ' + (e.op === 'defense_delta' ? (e.target === 'melee' ? 'melee defense' : 'ranged defense') : (OPWORD[e.op] || e.op));
    return body + (e.per_rank && e.op !== 'force_rating_floor' ? ' (+' + e.amount + ' per rank)' : '') + (e.when ? ' · ' + WHENLAB[e.when] : '');
  }
  // "Remove 1 setback per rank on Knowledge (Lore)" · "Remove 1 difficulty, once, on Knowledge (Lore)" (F3)
  function diceRead(d, ranked, vocab) {
    var per = d.per_rank === false ? false : ranked;
    // F-100 THE SURFACING MISSION (V5, D-294 L3): "Reroll one Medicine check, once per session, offered after the roll"
    if (d.direction === 'reroll') return 'Reroll one ' + (anchorLabel(d, vocab) || 'every') + ' check' + (d.limit ? ', ' + String(d.limit).replace(/_/g, ' ') : '')
      + (d.cost && d.cost.destiny ? ', paying a Destiny Point' : d.cost && d.cost.strain ? ', paying ' + d.cost.strain + ' strain' : '') + ', offered after the roll';
    // F-100 M8 C3/C4 (frame F2): "Downgrade the difficulty once per rank on Coercion, paying 1 strain each, offered at the roll"
    var verb = d.direction === 'upgrade' || d.direction === 'downgrade';
    if (verb || d.symbol || d.cost || d.limit || isObj(d.condition)) {
      var on = ' on ' + (anchorLabel(d, vocab) || 'every check');
      var body = verb ? capf(d.direction) + ' ' + (d.die === 'difficulty' || d.die === 'challenge' ? 'the difficulty ' : 'the check ') + (d.count === 1 ? 'once' : d.count + ' times') + (per ? ' per rank' : '') + on
        : d.symbol ? 'Add ' + d.count + ' ' + d.symbol + (per ? ' per rank' : '') + on
        : (d.direction === 'remove' ? 'Remove ' : 'Add ') + d.count + ' ' + d.die + (per ? ' per rank' : ranked ? ', once,' : '') + on;
      var c = d.cost || {};
      var paying = c.strain ? ', paying ' + c.strain + ' strain each' : c.destiny ? ', paying a Destiny Point' : c.commit_force ? ', committing ' + c.commit_force + ' Force' : '';
      var when = typeof d.condition === 'string' && d.condition ? ', when ' + String(d.condition).replace(/^when\s+/i, '') : '';
      var offered = d.condition || d.cost || d.limit ? ', offered at the roll' : '';
      return body + when + paying + (d.limit ? ', ' + String(d.limit).replace(/_/g, ' ') : '') + offered;
    }
    return (d.direction === 'remove' ? 'Remove ' : 'Add ') + d.count + ' ' + d.die + (per ? ' per rank' : ranked ? ', once,' : '') + ' on ' + (anchorLabel(d, vocab) || 'every check')
      + (d.condition ? ', when ' + String(d.condition).replace(/^when\s+/i, '') : '');
  }
  // F-100 M9 (R-M9S-3): a species row (`sp`) may also upgrade the difficulty — the ONE place it is admitted
  function verbsFor(d, sp) {
    // F-100 THE SURFACING MISSION (V5): a talent's dice line may instead offer a REROLL after the roll (no die, no count);
    // a species line never (validate_registries L1cb.sro R1)
    var rr = sp ? [] : [['reroll', 'Reroll the check']];
    if (d.direction === 'reroll') return [['add', 'Add'], ['remove', 'Remove']].concat(rr);
    if (d.symbol) return [['add', 'Add']];
    if (sp && d.die === 'difficulty') return [['add', 'Add'], ['remove', 'Remove'], ['upgrade', 'Upgrade']];
    if (d.die === 'ability') return [['upgrade', 'Upgrade']];
    return [['add', 'Add'], ['remove', 'Remove']].concat(d.die === 'challenge' ? [['downgrade', 'Downgrade']] : [], d.symbol || d.die === 'ability' ? [] : rr);
  }
  // use_limit (charbuild-common $defs/use_limit): shown, never tracked (R-M8K-4)
  var USE_LIMITS = [['once_per_round', 'Once per round'], ['once_per_encounter', 'Once per encounter'], ['once_per_session', 'Once per session']];
  function rankedDice(d, ranked) { return d.per_rank === false ? false : ranked; }

  // ── F2 THE TALENTS SHELF: yours first, then grouped by what it does; the rail at wide ──
  var TCOL = ['AUTOMATIC', 'SITUATIONAL', 'NARRATIVE'];
  function talentRow(rec) {
    var chips = talentChips(rec);
    return { id: rec.id, name: rec.name || rec.id, chips: chips, key: chips[0] || 'NARRATIVE', ranked: !!rec.ranked, act: actLabel(rec.activation),
             first: para1(rec.description), book: booksOf(rec)[0] || '' };
  }
  var talentCache = null;
  function talentRowsOf(books) {
    var t = books.sections && books.sections.talents; if (!t) return [];
    if (talentCache && talentCache.t === t) return talentCache.rows;
    var rows = Object.keys(t).map(function (id) { return talentRow(t[id]); }).sort(function (a, b) { return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }); });
    talentCache = { t: t, rows: rows }; return rows;
  }
  function TalentShelf(p) {
    var books = p.books, wide = p.wide, store = p.store, sec = 'talents';
    var _q = useState(''), q = _q[0], setQ = _q[1];
    var _s = useState('all'), show = _s[0], setShow = _s[1];
    var _c = useState(null), cls = _c[0], setCls = _c[1];
    var _o = useState({}), open = _o[0], setOpen = _o[1];
    var rows = talentRowsOf(books), total = rows.length;
    var rail = { AUTOMATIC: 0, SITUATIONAL: 0, NARRATIVE: 0 }; rows.forEach(function (r) { rail[r.key]++; });
    var yours = yoursOf(sec, books, store).map(function (y) { var r = talentRow(y.rec); r.y = y; return r; });
    var match = function (r) { return matchQ(r.name, q) && (!cls || r.key === cls); };
    var ys = yours.filter(match);
    var groups = show === 'all' ? TCOL.map(function (c) { return { key: c, label: c, rows: rows.filter(function (r) { return r.key === c && match(r); }) }; }).filter(function (g) { return g.rows.length; }) : [];
    var filtering = !!(q || cls), per = 4;
    var stateOf = function (g) { return filtering ? 'all' : open[g.key] || 'some'; };
    var openBook = function (r) { p.go({ view: 'record', shelf: sec, id: r.id }); };
    var openYours = function (r) { p.go(recRoute(sec, r.y.ck, r.y.id)); };
    var blank = function () { p.go({ view: 'draft', shelf: sec }); };
    var more = function (g) { var o = Object.assign({}, open); o[g.key] = 'all'; setOpen(o); };
    var chipsEl = function (a) { return h('span', { className: 'ed-chips' }, a.map(function (c) { return h(Chip, { c: c, key: c }); })); };
    var search = h('label', { className: 'ed-search', style: { marginTop: 14, maxWidth: wide ? 640 : undefined } },
      h('input', { type: 'search', value: q, placeholder: 'Search ' + num(total) + ' talents', 'aria-label': 'Search talents', onChange: function (e) { setQ(e.target.value); }, 'data-editor-search': '1' }),
      h('span', { className: 'ed-k', 'aria-hidden': 'true' }, '⌕'));
    var startBlank = h('button', { type: 'button', className: 'hp-commit' + (wide ? '' : ' ed-wide-commit'), onClick: blank, 'data-editor-blank': sec }, 'Start from blank');
    var emptyYours = show === 'yours' && !yours.length ? h('div', { className: 'hp-plate', 'data-pad': 'read', style: { marginTop: 14 }, 'data-editor-empty': '1' },
      h('div', { className: 'ed-empty' }, h('p', null, IW.empty(total, 'talents')),
        h('div', { className: 'ed-btnrow', style: { justifyContent: 'center' } }, h('button', { type: 'button', className: 'hp-commit', onClick: blank }, 'Start from blank'),
          h('button', { type: 'button', className: 'hp-quiet', onClick: function () { setShow('all'); } }, 'Show all ' + num(total))))) : null;
    var nothing = !emptyYours && filtering && !ys.length && !groups.length ? h('p', { className: 'ed-hint', role: 'status', style: { marginTop: 14 } }, IW.noMatch(q || cls)) : null;
    if (!wide) {
      var nrow = function (r, y) {
        return h('button', { type: 'button', className: 'ed-irow', key: (y ? r.y.ck + ':' : '') + r.id, onClick: function () { y ? openYours(r) : openBook(r); }, 'data-editor-row': r.id },
          h('div', { className: 'ed-rb' }, h('div', { className: 'ed-rn', 'data-yours': y ? '1' : undefined }, r.name),
            h('div', { className: 'ed-rm' }, (r.ranked ? 'Ranked' : 'Not ranked') + ' · ' + r.act),
            y ? h('div', { className: 'ed-rm', style: { color: 'var(--doc-action)' } }, 'Yours · ' + yoursLine(r.y)) : h('div', { className: 'ed-rm' }, r.book)),
          chipsEl(r.chips));
      };
      return h('div', { className: 'ed-pad' }, h(Runhead, { back: 'Homebrew', right: 'Talents · ' + num(total), onBack: function () { p.go({ view: 'home' }); } }),
        h(Banner, { status: store.status }), h('div', { className: 'hp-maker' }, 'Shelf'), h('h1', { className: 'hp-desig' }, 'Talents'), search,
        h('div', { className: 'ed-btnrow', style: { marginTop: 10 } },
          h('button', { type: 'button', className: 'hp-quiet', 'data-on': show === 'all' ? '1' : undefined, 'aria-pressed': show === 'all', onClick: function () { setShow('all'); } }, 'All ' + num(total)),
          h('button', { type: 'button', className: 'hp-quiet', 'data-on': show === 'yours' ? '1' : undefined, 'aria-pressed': show === 'yours', onClick: function () { setShow('yours'); }, 'data-editor-yours': '1' }, 'Yours ' + yours.length)),
        h('div', { style: { marginTop: 12 } }, startBlank), emptyYours, nothing,
        ys.length ? [h(Sechead, { t: 'Yours', aside: String(ys.length), key: 'ys' }), h('div', { className: 'hp-plate ed-stock', 'data-pad': 'data', key: 'yp' }, h('div', { className: 'hp-bands', 'data-run': '1' }, ys.map(function (r) { return nrow(r, true); })))] : null,
        groups.map(function (g) {
          var st = stateOf(g), list = st === 'some' ? g.rows.slice(0, per) : g.rows;
          return [h(Sechead, { t: g.label, aside: num(g.rows.length), key: 'h' + g.key }),
            h('div', { className: 'hp-plate ed-stock', 'data-pad': 'data', key: 'p' + g.key }, h('div', { className: 'hp-bands', 'data-run': '1' }, list.map(function (r) { return nrow(r, false); })),
              st === 'some' && g.rows.length > per ? h('button', { type: 'button', className: 'ed-addline', onClick: function () { more(g); } }, 'Show all ' + num(g.rows.length) + ' ›') : null)];
        }));
    }
    var tr = function (r, y) {
      return h('tr', { className: 'ed-tr', key: (y ? r.y.ck + ':' : '') + r.id, onClick: function () { y ? openYours(r) : openBook(r); }, 'data-editor-row': r.id },
        h('td', { className: 'ed-nm', style: y ? { color: 'var(--doc-action)' } : undefined },
          h('button', { type: 'button', className: 'ed-link ed-rowname', onClick: function (e) { e.stopPropagation(); y ? openYours(r) : openBook(r); } }, r.name),
          y ? [' ', h('span', { className: 'ed-yours', key: 'y' }, 'yours'), h('div', { className: 'ed-rm', key: 'm', style: { fontWeight: 400, fontSize: 13, color: 'var(--doc-action)' } }, yoursLine(r.y))] : null),
        h('td', null, chipsEl(r.chips)), h('td', { className: 'ed-mono' }, r.ranked ? 'Ranked' : IW.none), h('td', { className: 'ed-mono' }, r.act),
        h('td', { className: 'ed-first' }, glyph(r.first)), h('td', { className: 'ed-bk' }, r.book));
    };
    var ncol = 6;
    var grpRow = function (key, text, onClick) { return h('tr', { className: 'ed-grp', key: key }, h('td', { colSpan: ncol }, onClick ? h('button', { type: 'button', className: 'ed-grpbtn', onClick: onClick }, text) : h('div', { className: 'ed-grpbtn', style: { cursor: 'default' } }, text))); };
    var body = [];
    if (ys.length && show !== 'none') { body.push(grpRow('gy', 'Yours · ' + ys.length)); ys.forEach(function (r) { body.push(tr(r, true)); }); }
    groups.forEach(function (g) {
      var st = stateOf(g);
      body.push(grpRow('g' + g.key, g.label + ' · ' + num(g.rows.length), null));
      (st === 'some' ? g.rows.slice(0, per) : g.rows).forEach(function (r) { body.push(tr(r, false)); });
      if (st === 'some' && g.rows.length > per) body.push(h('tr', { key: 'm' + g.key }, h('td', { colSpan: ncol }, h('button', { type: 'button', className: 'ed-addline', style: { margin: 0 }, onClick: function () { more(g); } }, 'Show all ' + num(g.rows.length) + ' ›'))));
    });
    var railBtn = function (key, lbl, n, on, click) { return h('button', { type: 'button', className: 'ed-cat', key: key, 'aria-pressed': on ? 'true' : 'false', onClick: click }, lbl, h('b', null, num(n))); };
    var railEl = h('nav', { className: 'ed-rail', 'aria-label': 'Shelves' }, h('h4', null, 'Shelves'), shelfRail(p, sec),
      h('h4', null, 'Show'), railBtn('all', 'All', total, show === 'all', function () { setShow('all'); }), railBtn('yours', 'Yours', yours.length, show === 'yours', function () { setShow('yours'); }),
      h('h4', null, 'What it does'), TCOL.map(function (c) { return railBtn(c, h(Chip, { c: c }), rail[c], cls === c, function () { setCls(cls === c ? null : c); }); }));
    return h('div', { className: 'ed-shelfgrid' }, railEl,
      h('div', { className: 'ed-desk', style: { paddingTop: 18, minWidth: 0 } }, h(Runhead, { back: 'Homebrew', right: 'Talents · ' + num(total), onBack: function () { p.go({ view: 'home' }); } }),
        h(Banner, { status: store.status }),
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20 } }, h('div', null, h('div', { className: 'hp-maker' }, 'Shelf'), h('h1', { className: 'hp-desig' }, 'Talents')), startBlank),
        search, emptyYours, nothing,
        body.length ? h('div', { className: 'hp-plate ed-stock', 'data-pad': 'data', style: { marginTop: 14 } },
          h('table', { className: 'ed-tbl', 'data-editor-table': sec }, h('thead', null, h('tr', null, h('th', null, 'Talent'), h('th', null, 'What it does'), h('th', null, 'Ranks'), h('th', null, 'Activation'), h('th', null, 'First line'), h('th', null, 'Book'))),
            edBands(body))) : null));
  }
  // the rail's Shelves list, shared by every shelf (the shelves that OPEN are buttons; SPECIES stays SOON)
  function shelfRail(p, sec) {
    return (p.books.shelves || []).map(function (s) {
      var open = ED().OPEN_SHELVES.indexOf(s.key) !== -1;
      return h('button', { type: 'button', className: 'ed-cat', key: s.key, 'aria-current': s.key === sec ? 'page' : undefined, disabled: !open,
        onClick: open ? function () { p.go({ view: 'shelf', shelf: s.key }); } : undefined, 'data-editor-railshelf': s.key }, s.label, h('b', null, num(s.count)));
    });
  }

  // ── F4 / U7 (ii) THE OP MENU: the six ops, each with its id; defense notes its target ──
  function OpMenu(p) {
    var ops = p.ops || OPS;
    return h('div', { className: 'ed-menu ed-opmenu', role: 'listbox', 'aria-label': TW.menuHead(ops.length), 'data-editor-opmenu': '1' },
      h('div', { className: 'ed-oph' }, TW.menuHead(ops.length)),
      ops.map(function (o) {
        var on = o[0] === p.value;
        return h('button', { type: 'button', key: o[0], role: 'option', 'aria-selected': on ? 'true' : 'false', className: 'ed-op', 'data-on': on ? '1' : undefined, onClick: function () { p.onPick(o[0]); }, 'data-editor-op': o[0] },
          h('span', { className: 'ed-opn' }, o[1]), o[0] === 'defense_delta' ? h('span', { className: 'ed-opx' }, '+ melee or ranged') : null, h('span', { className: 'ed-opid' }, o[0]));
      }));
  }
  function EffectLine(p) {
    var e = p.e, ro = p.ro, ranked = p.ranked;
    if (isSkillOp(e)) return null;
    function set(k, v) { var n = clone(e); if (v === undefined || v === null || v === '') delete n[k]; else n[k] = v; p.onChange(n); }
    function pick(op) {
      var n = { op: op, amount: e.amount || 1, per_rank: op === 'force_rating_floor' ? false : !!(ranked && e.per_rank !== false) };
      if (op === 'defense_delta') n.target = e.target === 'melee' ? 'melee' : 'ranged';
      if (e.when && WHEN_OPS.indexOf(op) !== -1) n.when = e.when;
      p.onChange(n); p.onMenu(false);
    }
    var label = effLabel(e) + ' +' + e.amount;
    var hint = [e.op === 'defense_delta' ? null : OPLAB[e.op] + ' takes no target.',
      ranked ? '“Per rank” is offered because ' + (p.name || 'this talent') + ' is ranked.' : null].filter(Boolean).join(' ');
    return h(Fl, { chip: 'AUTOMATIC', k: 'Effect ' + (p.i + 1) + (p.menu ? ' · editing' : ''), field: 'effects' },
      h('div', { className: 'ed-inrow' },
        h('button', { type: 'button', className: 'ed-inp ed-opsel', disabled: ro, 'aria-haspopup': 'listbox', 'aria-expanded': p.menu ? 'true' : 'false', 'data-on': p.menu ? '1' : undefined,
          onClick: function () { p.onMenu(!p.menu); }, 'data-editor-input': 'op' }, h('b', null, OPLAB[e.op] || e.op), p.menu ? h('span', { className: 'ed-opid' }, e.op) : null, h('span', { className: 'ed-dd', 'aria-hidden': 'true' }, '▾')),
        p.menu ? null : h(NumIn, { value: e.amount, ro: ro, label: 'Amount', field: 'amount', onChange: function (v) { set('amount', v == null ? 1 : Math.max(1, v)); } }),
        p.menu || !ranked || e.op === 'force_rating_floor' ? null : h(Tog, { on: e.per_rank !== false, ro: ro, label: 'Per rank', field: 'per_rank', onChange: function (v) { set('per_rank', !!v); } })),
      p.menu ? h(OpMenu, { value: e.op, onPick: pick }) : null,
      p.menu ? h('div', { className: 'ed-inrow' }, h(NumIn, { value: e.amount, ro: ro, label: 'Amount', field: 'amount', onChange: function (v) { set('amount', v == null ? 1 : Math.max(1, v)); } }),
        !ranked || e.op === 'force_rating_floor' ? null : h(Tog, { on: e.per_rank !== false, ro: ro, label: 'Per rank', field: 'per_rank', onChange: function (v) { set('per_rank', !!v); } })) : null,
      e.op === 'defense_delta' ? h('div', { className: 'ed-inrow' }, h(Sel, { value: e.target || 'ranged', blank: false, ro: ro, label: 'Which defense', field: 'target', options: [['melee', 'Melee'], ['ranged', 'Ranged']], onChange: function (v) { set('target', v); } })) : null,
      h('div', { className: 'ed-inrow' }, h(Sel, { value: e.when || '', blank: false, ro: ro, label: 'Condition', field: 'when',
        options: WHEN_OPS.indexOf(e.op) === -1 ? [['', 'Always']] : WHENS, onChange: function (v) { set('when', v || undefined); } })),
      p.menu && hint ? h('div', { className: 'ed-hint' }, hint) : null,
      h('div', { className: 'ed-fmt' }, effRead(e), p.fresh ? h('span', { className: 'ed-muted' }, ' · new line') : null),
      ro ? null : h('div', { className: 'ed-lineacts' }, h('span'), h('button', { type: 'button', className: 'ed-addline ed-rm-act', onClick: p.onRemove, 'aria-label': TW.rmNumber(label) }, TW.rmNumber(label))));
  }
  function TalentDiceLine(p) {
    var d = p.d, ro = p.ro, vocab = p.vocab, ranked = p.ranked;
    function set(k, v) { var n = clone(d); if (v === undefined) delete n[k]; else n[k] = v; p.onChange(n); }
    var anc = Array.isArray(d.applies_to) ? d.applies_to : [];
    var ancOpts = [['all', 'every check']].concat(GROUPS.map(function (g) { return ['group:' + g, capf(g) + ' checks']; }), (vocab ? vocab.skills : []).map(function (s) { return ['skill:' + s.id, s.label]; }));
    var ancName = function (a) { return a.scope === 'skill' ? skillLabel(a.value, vocab) : a.scope === 'group' ? capf(a.value) + ' checks' : a.scope === 'all' ? 'every check' : capf(a.value); };
    var every = anchorLabel(d, vocab) || 'every';
    // F-100 M8 C3 (frame F2): the verbs the schema allows THIS die (pool_mod_entry allOf, R-M8K-3): upgrade on Ability only,
    // downgrade on Challenge only, a symbol only adds
    var m8 = d.direction === 'upgrade' || d.direction === 'downgrade' || d.cost != null || d.symbol != null;
    var rr = d.direction === 'reroll';   // F-100 THE SURFACING MISSION (V5): no die, no count, no condition; its limit shown
    var sp = !!p.sp, verbs = verbsFor(d, sp), mb = p.mb || (isObj(d.condition) ? markBits(d.condition, p.mk, ro) : [null, null]);
    var costW = d.cost && sp ? subCost(d.cost) || 'A cost' : d.cost ? (d.cost.strain ? 'Strain: ' + d.cost.strain + ' per ' + (d.direction === 'upgrade' || d.direction === 'downgrade' ? d.direction : 'use')
      : d.cost.destiny ? 'A Destiny Point' : d.cost.commit_force ? 'Commit ' + d.cost.commit_force + ' Force' : 'A cost') : '';
    // F-100 THE SURFACING MISSION (roll-options card ADDENDUM 14 F9): a talent line's Conflict rides its cost, worded beside
    // the strain ("Strain: 1 per use + Conflict: 1 per use"); a talent line's cost choices gain "Conflict" (L1cb.dark: talent only)
    var cfl = d.cost && !sp ? d.cost.conflict : 0, unit = ' per ' + (d.direction === 'upgrade' || d.direction === 'downgrade' ? d.direction : 'use');
    if (cfl) costW = (costW === 'A cost' ? '' : costW + ' + ') + 'Conflict: ' + cfl + (d.cost.strain_per_rank || d.cost.strain ? unit : '');
    return h(Fl, { chip: chipOf(EC() ? EC().classOfPoolMod(d) : 'prints'), k: 'Dice line ' + (p.i + 1), field: 'pool_mods', cls: m8 ? 'ed-m8' : undefined },
      h('div', { className: 'ed-inrow' },
        rr ? null : d.symbol ? h(Sel, { value: d.symbol, options: [['success', 'Success'], ['advantage', 'Advantage']], blank: false, ro: ro, label: 'Result', field: 'symbol', onChange: function (v) { set('symbol', v); } })
          : h('span', { className: 'ed-diesel' }, h('span', { className: 'ed-dieg', 'aria-hidden': 'true' }, glyph('[' + (DIE_TOKEN[d.die] || '') + ']')), h(Sel, { value: d.die, options: DIES.map(function (x) { return [x, capf(x)]; }), blank: false, ro: ro, label: 'Die', field: 'die', onChange: function (v) {
            var n = clone(d); n.die = v; var ok = verbsFor(n, sp).map(function (o) { return o[0]; }); if (n.direction != null && ok.indexOf(n.direction) === -1) n.direction = ok[0]; p.onChange(n); } })),
        h(Sel, { value: d.direction == null ? '' : d.direction, options: verbs, blank: d.direction == null, blankLabel: IW.unsettled, ro: ro, label: 'Add, remove, upgrade or downgrade', field: 'direction', onChange: function (v) {
          // `count: 'all'` rides `remove` only (R-M9S-6): another verb takes one
          var n = clone(d); n.direction = v === '' ? null : v; if (n.count === 'all' && n.direction !== 'remove') n.count = 1;
          // V5: a reroll carries no die, count, per-rank or condition, and a limit (once per session unless set); leaving it
          // makes the line a plain die again (a Boost, one)
          if (v === 'reroll') { ['die', 'symbol', 'count', 'count_of', 'per_rank', 'floor', 'condition'].forEach(function (k) { delete n[k]; }); n.limit = d.limit || 'once_per_session'; }
          else if (rr) { n.die = 'boost'; n.count = 1; delete n.limit; }
          p.onChange(n); } }),
        rr ? null : sp ? h(CountIn, { value: d.count, all: d.direction === 'remove', ro: ro, label: 'How many', field: 'count', onChange: function (v) { set('count', v); } })
          : h(NumIn, { value: d.count, ro: ro, label: 'How many', field: 'count', onChange: function (v) { set('count', v == null ? 1 : Math.max(1, v)); } })),
      h('div', { className: 'ed-inrow' },
        h('div', { className: 'ed-inp ed-anchors' }, anc.map(function (a, i) {
            return h('button', { type: 'button', key: i, className: 'ed-qchip', disabled: ro, 'aria-label': ro ? ancName(a) : 'Remove ' + ancName(a), onClick: function () { var n = anc.slice(); n.splice(i, 1); set('applies_to', n.length ? n : null); } }, ancName(a) + (ro ? '' : ' ×'));
          }),
          ro ? null : h(Sel, { value: '', options: ancOpts, blankLabel: anc.length ? '+ another' : IW.anyCheck, ro: ro, label: 'Which checks', field: 'applies_to',
            onChange: function (v) { if (!v) return; var a = v === 'all' ? { scope: 'all' } : { scope: v.slice(0, v.indexOf(':')), value: v.slice(v.indexOf(':') + 1) }; set('applies_to', anc.concat([a])); } })),
        !ranked || rr ? null : h(Tog, { on: rankedDice(d, ranked), ro: ro, label: 'Per rank', field: 'per_rank', onChange: function (v) { set('per_rank', v ? undefined : false); } })),
      rr ? h('div', { className: 'ed-inrow' }, h(Sel, { value: d.limit || 'once_per_session', options: USE_LIMITS, blank: false, ro: ro, label: 'How often', field: 'limit', onChange: function (v) { set('limit', v); } })) : null,
      // V1 (ADDENDUM 8 F2): the cost's choices gain "A Destiny Point" beside the line's own and "No cost"
      d.cost ? h('div', { className: 'ed-inrow' }, h(Sel, { value: 'cost', blank: false, ro: ro, label: 'Cost', field: 'cost',
        options: [['cost', costW]].concat(d.cost.destiny || sp ? [] : [['destiny', 'A Destiny Point']], cfl || sp ? [] : [['conflict', 'Conflict']], [['', 'No cost']]),
        onChange: function (v) { if (!v) set('cost', undefined); else if (v === 'destiny') set('cost', { destiny: 1 }); else if (v === 'conflict') set('cost', Object.assign(clone(d.cost), { conflict: 1 })); } })) : null,
      // B-968 (D-411 item 5, as page v1 drew it): a talent's line takes the item line's words box (the no-compromise
      // mirror); a marked-span condition keeps its select. A species line (sp) keeps the select as before.
      rr ? null : !sp && !isObj(d.condition) ? h('div', { className: 'ed-inrow' }, h(TextIn, { value: d.condition || '', placeholder: IW.noCond, ro: ro, label: 'Condition', field: 'condition',
        onChange: function (v) { set('condition', v.trim() ? v : null); } }))
      : h('div', { className: 'ed-inrow' }, h(Sel, { value: isObj(d.condition) ? 'span' : d.condition || '', blank: false, ro: ro, label: 'Condition', field: 'condition',
        options: [['', 'No condition — applies on every ' + every + ' check']].concat(isObj(d.condition) ? [['span', 'When: the words marked below']] : d.condition ? [[d.condition, d.condition]] : []), onChange: function (v) { if (v !== 'span') set('condition', v || null); } })),
      mb[0],
      h('div', { className: 'ed-fmt' }, glyph(sp ? spDiceRead(d, p.desc, vocab) : diceRead(d, ranked, vocab))),   // W4 (flip card ADDENDUM 75 C2): a condition span's [XX] draws as its symbol
      mb[1],
      ro ? null : h('div', { className: 'ed-lineacts' }, h('span'), h('button', { type: 'button', className: 'ed-addline ed-rm-act', onClick: p.onRemove, 'aria-label': TW.rmDice + ': ' + spoken(readAloud(d, vocab)) }, TW.rmDice)));
  }
  // ── F-100 M8 step 3 · THE EDITOR'S VERBS (frame F2, approved D-26; f100-m8-build-card R-M8B-11/15). Each M8 row kind as
  // the frames draw it, editable in the controls drawn, writing only the `$defs` shapes on paper (R-Y2-1). Starting a new
  // kind stays unbuilt (R-M8EV-1, B-1077). Remove, the mark states and "+ Add a pick" (i) are F2 v3's, approved by D-46
  // (ruling `f100-m8-editor-verbs` ADDENDUM 2, R-M8EV-2..4).
  var M8W = {
    rollNumbers: 'At the roll — numbers', picks: 'Choices — the player picks', items: 'On an item', vehicle: 'On the Signature Vehicle',
    addRollNumber: '+ Add a number at the roll', addItem: '+ Add an item line', addVehicle: '+ Add a vehicle line',
    bandsKey: 'At these range bands',
    bandHint: 'The range is the band set on the weapon row, the same one that sets the difficulty. At any other band the line is not there.',
    pickHint: 'Until the player picks, the lines that use this pick give nothing, and the talent asks for the pick.',
    vehicleHint: 'Applies to the one vessel this character holds as their Signature Vehicle, in the Ship Yard.',
    mark: 'Mark the selected words', stale: 'The description changed. Mark these words again.',
    // D-229 W2 (a), Jason's words verbatim — a SPECIES-form suffix after `stale` (ADDENDUM 4 F7: never an edit to `stale`,
    // which the talent and Force power forms share)
    spStaleTail: ' An unmarked species line keeps its words and drops its rows at save.',
    rmNumber: 'Remove this number', rmItem: 'Remove this item line', rmVehicle: 'Remove this vehicle line', rmTold: 'Remove this line',
    addPick: '+ Add a pick', addOption: '+ Add an option', newPick: function (n) { return 'Pick ' + n + ' · new'; }, pickLine: 'Which line uses this pick', pickLineBlank: 'Choose the line that uses it',
    pickNoLine: 'Every line already carries a pick. A line holds one pick.',
    addKind: '+ Add another kind of line', kindHead: function (n) { return 'Another kind of line (' + n + ')'; },   // B-1077, D-411 item 6
  };
  // R-M8EV-3's MECHANISM, moved to the shared core by R-SPF-4 (`f100-surfacing-preflip-species-card`): the span hash is
  // lib/shared/textHash.js (window.SWRPGTextHash), the ONE JS twin of scripts/canonical/talent_words.py, which packValidate's
  // species arm and charResolve's species reader call too. These three names stay as the editor's handles on it.
  function TH() { return window.SWRPGTextHash; }
  function normText(s) { return TH().normText(s); }
  function textHash(s) { return TH().textHash(s); }
  // a span holds when it is in bounds and its hash recomputes over the description (talent_words.span_ok's test)
  function spanOk(desc, w) { return TH().spanOk(desc, w); }
  // the SAVE gate's predicate (rowHolds / unlessHolds): spanOk, or a REMOVED text in a public copy (textHash.spanHolds,
  // R-AAC-27 (a)). Marks and read-backs keep spanOk: a removed text has nothing to mark.
  function spanHolds(desc, w) { return TH().spanHolds(desc, w); }
  // the selection made a span: whitespace at either edge is left out; an empty selection makes none
  function spanFrom(desc, sel) {
    var d = String(desc || ''); if (!sel) return null;
    var s = Math.max(0, Math.min(sel.start, sel.end)), e = Math.min(d.length, Math.max(sel.start, sel.end));
    while (s < e && /\s/.test(d.charAt(s))) s++;
    while (e > s && /\s/.test(d.charAt(e - 1))) e--;
    return e > s ? { start: s, end: e, hash: textHash(d.slice(s, e)) } : null;
  }
  // the marking controls a span row carries (R-M8EV-3): the stale line when its span no longer holds, and the button while the
  // description is being edited or the span is stale. `mk` = { desc, editing, sel, onMark } from TalentBody.
  function markBits(span, mk, ro) {
    if (ro || !mk) return [null, null];
    var stale = !spanOk(mk.desc, span);
    return [stale ? h('div', { className: 'ed-fmt ed-stale', 'data-editor-stale': '1' }, M8W.stale) : null,
      mk.editing || stale ? h('button', { type: 'button', className: 'ed-addline', 'data-editor-mark': '1', onMouseDown: function (e) { e.preventDefault(); },
        onClick: mk.onMark }, M8W.mark) : null];
  }
  function rmBit(ro, label, read, onRemove) {
    return ro || !onRemove ? null : h('div', { className: 'ed-lineacts' }, h('span'), h('button', { type: 'button', className: 'ed-addline ed-rm-act', onClick: onRemove,
      'aria-label': label + ': ' + spoken(read), 'data-editor-rm-m8': '1' }, label));   // the label speaks words, never [XX] (ADDENDUM 75 C1)
  }
  var BANDS = [['engaged', 'Engaged'], ['short', 'Short'], ['medium', 'Medium'], ['long', 'Long'], ['extreme', 'Extreme']];
  var BANDLAB = {}; BANDS.forEach(function (b) { BANDLAB[b[0]] = b[1]; });
  var RN_OPS = [['damage_delta', 'Damage, one hit'], ['crit_roll_delta', 'Your Critical Injury roll'], ['crit_rating_delta', 'Critical rating']];
  var SP_RN_OPS = [['damage_delta', 'Damage'], ['crit_rating_set', 'Critical rating, set to']];   // F-100 M9 frame F3's two
  // R-M8BG-37 (ruling f100-m8-batches ADDENDUM 9): Massive (Reinforced Frame) and Weapon quality (Overstocked Ammo,
  // R-M8C8-3). A third entry is the reading's own word where it is a quality's name and keeps its capital ("+1 Massive").
  var VEH_OPS = [['armor_delta', 'Armor'], ['hull_threshold_delta', 'Hull trauma threshold'], ['strain_threshold_delta', 'System strain threshold'],
                 ['handling_delta', 'Handling'], ['speed_delta', 'Speed'], ['hard_points_delta', 'Hard points'], ['massive_delta', 'Massive', 'Massive'],
                 ['weapon_quality_delta', 'Weapon quality']];
  var VEHLAB = {}; VEH_OPS.forEach(function (o) { VEHLAB[o[0]] = o[2] || o[1].toLowerCase(); });
  var MOMENTS = [['check', 'At a check'], ['critical_injury', 'At a Critical Injury roll'], ['buy', 'When it is bought'], ['', 'On the talent itself']];
  var SP_MOMENTS = [['check', 'At a check'], ['critical_injury', 'At a Critical Injury roll'], ['', 'On the ability']];   // a species is never bought
  var M8ARRAYS = ['roll_numbers', 'item_effects', 'vehicle_effects', 'told'];
  function arrOf(rec, k) { return Array.isArray(rec[k]) ? rec[k] : []; }
  function joinList(a, last) { return a.length > 1 ? a.slice(0, -1).join(', ') + ' ' + last + ' ' + a[a.length - 1] : (a[0] || ''); }
  function signed(n) { return n < 0 ? '−' + (-n) : '+' + n; }
  // a signed whole number (Durable's −10): "−" or "-" both read as minus; a lone sign waits for its digits. `plus`: a
  // positive amount reads with its sign, as J8 draws the item line's "+1"
  function SignedIn(p) {
    var mag = function (n) { return p.group ? num(n) : String(n); };   // `group`: 1,000 as F3 draws starting credits
    return h('input', { className: 'ed-inp ed-num', inputMode: 'text', value: p.value == null ? '' : p.value < 0 ? '−' + mag(-p.value) : (p.plus && p.value > 0 ? '+' : '') + mag(p.value), readOnly: p.ro, 'aria-label': p.label,
      onChange: function (e) { var t = String(e.target.value).replace(/−/g, '-').replace(/[^0-9-]/g, ''); if (!/^-?[0-9]+$/.test(t)) return; p.onChange(parseInt(t, 10)); }, 'data-editor-input': p.field });
  }
  // an anchor list (applies_to) as chips: a skill, a group, or the pick's own skill (`chosen`)
  function anchorName(a, vocab) { return a.chosen ? 'The picked skill' : a.scope === 'skill' ? skillLabel(a.value, vocab) : a.scope === 'weapon_record' ? weaponName(a.value, vocab) : a.scope === 'group' ? capf(a.value) : capf(a.value); }
  // F-100 M8 R-M8K-25 (ruling f100-m8-batches R-M8BG-6): a weapon_record anchor names ONE weapon record — the vocab's weapons
  // when the caller hands them, else the loaded item registries; a record neither holds reads as its own id
  function weaponsOf(vocab) { var b = window._canonicalRegistriesBase; return (vocab && vocab.weapons) || (b && b.weapons) || {}; }
  function weaponName(id, vocab) { var w = weaponsOf(vocab)[id]; return w && w.name ? w.name : capf(String(id).replace(/_/g, ' ')); }
  function weaponOpts(vocab) { var W = weaponsOf(vocab); return Object.keys(W).map(function (k) { return ['weapon_record:' + k, W[k].name || k]; }).sort(function (a, b) { return a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0; }); }
  // the reading's attack words: both Ranged skills read as "Ranged", as the frame's Point Blank line does
  function attackWords(anc, vocab) {
    var ids = anc.map(function (a) { return a.scope === 'skill' ? a.value : null; });
    var both = ids.indexOf('ranged_heavy') !== -1 && ids.indexOf('ranged_light') !== -1, out = [];
    anc.forEach(function (a) { if (both && a.scope === 'skill' && (a.value === 'ranged_heavy' || a.value === 'ranged_light')) { if (out.indexOf('Ranged') === -1) out.push('Ranged'); } else out.push(anchorName(a, vocab)); });
    return out;
  }
  // D-229 L3 (a) (ruling `f100-surfacing-species-flip-card` ADDENDA 9 and 14 F4 (a)): on the SPECIES form (`x`, handed down as
  // the line's `spx`) the chip shows the remove it already does — "BRAWL ×", the approved F3 frame; the talent and Force power
  // forms' chips are unchanged (their own approved frames). The aria-label "Remove <anchor>" is kept either way.
  function AnchorChips(p) {
    var anc = p.anc, ro = p.ro;
    return h('div', { className: 'ed-inp ed-anchors' }, anc.map(function (a, i) {
      var nm = anchorName(a, p.vocab);
      return h('button', { type: 'button', key: i, className: 'ed-qchip', disabled: ro, 'aria-label': ro ? nm : 'Remove ' + nm, onClick: function () { var n = anc.slice(); n.splice(i, 1); p.onChange(n); } }, p.x && !ro ? nm + ' \u00d7' : nm);
    }));
  }
  function anchorOpts(vocab) { return GROUPS.map(function (g) { return ['group:' + g, capf(g) + ' checks']; }).concat((vocab ? vocab.skills : []).map(function (s) { return ['skill:' + s.id, s.label]; })); }
  function anchorOf(v) { return { scope: v.slice(0, v.indexOf(':')), value: v.slice(v.indexOf(':') + 1) }; }
  // "+1 damage to one hit per rank, on Brawl and Melee attacks" · "−10 to your Critical Injury roll per rank, never below 1 (after every +10)"
  function rnRead(rn, vocab) {
    var anc = Array.isArray(rn.applies_to) ? rn.applies_to : [], per = rn.per_rank === true;
    // F-100 M9 (frame F3): the claws' SET, and the order the engine applies it in (set, then deltas, floor 1)
    if (rn.op === 'crit_rating_set') return 'Critical rating set to ' + rn.amount + (anc.length ? ', on ' + joinList(attackWords(anc, vocab), 'and') + ' attacks' : '') + '. A talent that lowers it (Iron Body) still does, after.';
    if (rn.op === 'crit_roll_delta') return signed(rn.amount) + ' to your Critical Injury roll' + (per ? ' per rank' : '') + (rn.floor ? ', never below ' + rn.floor + ' (after every +10)' : '');
    // "−1 to the Critical rating per rank, on Unarmed attacks (never below 1)" (R-M8BG-6), built from the row
    if (rn.op === 'crit_rating_delta') return signed(rn.amount) + ' to the Critical rating' + (per ? ' per rank' : '') + (anc.length ? ', on ' + joinList(attackWords(anc, vocab), 'and') + ' attacks' : '')
      + (rn.floor ? ' (never below ' + rn.floor + ')' : '');
    if (isObj(rn.amount) && rn.amount.of === 'skill_ranks' && rn.amount.key && !rn.amount.chosen) return '+ damage equal to your ranks in ' + skillLabel(rn.amount.key, vocab) + (anc.length ? ', on ' + joinList(attackWords(anc, vocab), 'and') + ' attacks' : '');
    // B-1543: an amount of one CHARACTERISTIC (Anatomy Lessons, Deathblow, …) reads as that characteristic, never as a picked skill;
    // an `all` anchor names no attack kind
    if (isObj(rn.amount) && rn.amount.of === 'characteristic' && rn.amount.key) {
      var canc = anc.filter(function (a) { return a.scope !== 'all'; });
      return '+ damage to one hit equal to your ' + capf(rn.amount.key) + (canc.length ? ', on ' + joinList(attackWords(canc, vocab), 'and') + ' attacks' : '');
    }
    if (isObj(rn.amount)) return '+ damage to one hit equal to your ranks in the picked skill, on attacks with that skill';
    var bands = Array.isArray(rn.range_band) ? rn.range_band.map(function (b) { return BANDLAB[b] || b; }) : [];
    return signed(rn.amount) + ' damage to one hit' + (per ? ' per rank' : '') + (anc.length ? ', on ' + joinList(attackWords(anc, vocab), 'and') + ' attacks' : '')
      + (bands.length ? ' at ' + joinList(bands, 'or') + ' range' : '');
  }
  function RollNumberLine(p) {
    var rn = p.rn, ro = p.ro, vocab = p.vocab, ranked = p.ranked;
    function put(n) { p.onChange(n); }
    function set(k, v) { var n = clone(rn); if (v === undefined || v === null) delete n[k]; else n[k] = v; put(n); }
    function setOp(op) {
      if (op === rn.op) return;
      var n = { op: op, moment: op === 'crit_roll_delta' ? 'critical_injury' : 'check', amount: op === 'crit_roll_delta' ? -10 : op === 'crit_rating_delta' ? -1 : op === 'crit_rating_set' ? 3 : 1 };
      ['id', 'cite', 'words'].forEach(function (k) { if (rn[k] !== undefined) n[k] = clone(rn[k]); });
      if (op === 'crit_rating_set') n.applies_to = [{ scope: 'weapon_record', value: 'unarmed' }];   // its anchor the unarmed attack only (R-M9S-4)
      if (ranked) n.per_rank = true;
      put(n);
    }
    // F-100 M9 (R-M9S-4): a species line (`sp`) offers the two verbs F3 draws; the Crit SET's one anchor is the unarmed attack
    var cset = rn.op === 'crit_rating_set';
    var dmg = rn.op === 'damage_delta', crit = rn.op === 'crit_rating_delta', anc = Array.isArray(rn.applies_to) ? rn.applies_to : [], bands = Array.isArray(rn.range_band) ? rn.range_band : null;
    var chosen = isObj(rn.amount), mb = p.mb || (isObj(rn.condition) ? markBits(rn.condition, p.mk, ro) : [null, null]);
    return h(Fl, { chip: chipOf(EC() ? EC().classOfRollNumber(rn) : 'resolves'), k: (p.sp ? 'Number at the roll ' : 'Number ') + (p.i + 1), field: 'roll_numbers', cls: 'ed-m8' },
      h('div', { className: 'ed-inrow' },
        h(Sel, { value: rn.op, options: p.sp ? SP_RN_OPS : RN_OPS, blank: false, ro: ro, label: 'What it changes', field: 'op', onChange: setOp }),
        chosen ? h(Sel, { value: 'of', options: [['of', rn.amount.of === 'skill_ranks' ? (rn.amount.key && !rn.amount.chosen ? 'Ranks in ' + skillLabel(rn.amount.key, vocab) : 'Ranks in the picked skill') : 'Your ' + (rn.amount.key || 'characteristic')]], blank: false, ro: ro, label: 'Amount', field: 'amount', onChange: function () {} })
          : rn.op === 'crit_roll_delta' || crit ? h(SignedIn, { value: rn.amount, ro: ro, label: 'Amount', field: 'amount', onChange: function (v) { if (v) set('amount', v); } })
          : p.sp && dmg ? h(SignedIn, { value: rn.amount, plus: true, ro: ro, label: 'Amount', field: 'amount', onChange: function (v) { if (v > 0) set('amount', v); } })   // F3: "+1"
          : h(NumIn, { value: rn.amount, ro: ro, label: 'Amount', field: 'amount', onChange: function (v) { set('amount', v == null ? 1 : Math.max(1, v)); } })),
      ranked && !chosen ? h('div', { className: 'ed-inrow' }, h(Tog, { on: rn.per_rank === true, ro: ro, label: 'Per rank', field: 'per_rank', onChange: function (v) { set('per_rank', v ? true : undefined); } })) : null,
      dmg ? h('div', { className: 'ed-inrow' }, h(AnchorChips, { anc: anc, ro: ro, vocab: vocab, x: p.spx, onChange: function (n) { set('applies_to', n.length ? n : undefined); } }),
        ro || chosen ? null : h(Sel, { value: '', options: anchorOpts(vocab), blankLabel: anc.length ? '+ another' : IW.anyCheck, ro: ro, label: 'Which attacks', field: 'applies_to',
          onChange: function (v) { if (v) set('applies_to', anc.concat([anchorOf(v)])); } })) : null,
      cset ? h('div', { className: 'ed-inrow' }, h(AnchorChips, { anc: anc, ro: ro, vocab: vocab, x: p.spx, onChange: function (n) { set('applies_to', n.length ? n : undefined); } }),
        ro ? null : h(Sel, { value: '', options: weaponOpts(vocab).filter(function (o) { return o[0] === 'weapon_record:unarmed' && !anc.some(function (a) { return a.value === 'unarmed'; }); }), blankLabel: anc.length ? '+ another' : IW.anyCheck, ro: ro, label: 'Which attacks', field: 'applies_to',
          onChange: function (v) { if (v) set('applies_to', anc.concat([anchorOf(v)])); } })) : null,
      crit ? h('div', { className: 'ed-inrow' }, h(AnchorChips, { anc: anc, ro: ro, vocab: vocab, x: p.spx, onChange: function (n) { set('applies_to', n.length ? n : undefined); } }),
        ro ? null : h(Sel, { value: '', options: weaponOpts(vocab), blankLabel: anc.length ? '+ another' : IW.anyCheck, ro: ro, label: 'Which weapons', field: 'applies_to',
          onChange: function (v) { if (v) set('applies_to', anc.concat([anchorOf(v)])); } })) : null,
      dmg && bands ? [h('div', { className: 'ed-fk', key: 'bk', style: { marginTop: 10 } }, M8W.bandsKey),
        h('div', { className: 'ed-inrow', key: 'bc' }, h('div', { className: 'ed-inp ed-anchors' }, bands.map(function (b, i) {
          return h('button', { type: 'button', key: b, className: 'ed-qchip', disabled: ro, 'aria-label': ro ? BANDLAB[b] : 'Remove ' + BANDLAB[b], onClick: function () { var n = bands.slice(); n.splice(i, 1); set('range_band', n.length ? n : undefined); } }, BANDLAB[b] || b);
        }))),
        ro ? null : h('div', { className: 'ed-inrow', key: 'ba' }, h(Sel, { value: '', options: BANDS.filter(function (b) { return bands.indexOf(b[0]) === -1; }), blankLabel: '+ another band', ro: ro, label: M8W.bandsKey, field: 'range_band',
          onChange: function (v) { if (v) set('range_band', BANDS.map(function (b) { return b[0]; }).filter(function (b) { return b === v || bands.indexOf(b) !== -1; })); } }))] : null,
      // F3 draws a species damage line with no condition row; one that carries a condition keeps it
      dmg && !bands && !chosen && !(p.sp && !rn.condition) ? h('div', { className: 'ed-inrow' }, h(Sel, { value: rn.condition ? 'span' : '', blank: false, ro: ro, label: 'Condition', field: 'condition',
        options: [['', 'No condition — always applies'], ['bands', M8W.bandsKey]].concat(rn.condition ? [['span', 'When: the words marked below']] : []),
        onChange: function (v) { if (v === 'bands') set('range_band', ['engaged']); else if (v === '') set('condition', undefined); } })) : null,
      rn.op === 'crit_roll_delta' || crit ? h('div', { className: 'ed-inrow' }, h(Sel, { value: rn.floor ? String(rn.floor) : '', blank: false, ro: ro, label: 'Never below', field: 'floor',
        options: [['', 'No floor'], ['1', 'Never below 1']], onChange: function (v) { set('floor', v ? parseInt(v, 10) : undefined); } })) : null,
      mb[0],
      h('div', { className: 'ed-fmt' }, rnRead(rn, vocab)),
      // F-100 THE SURFACING MISSION (brief §5 (d)): a number riding a strain line's tick says so, read-only
      rn.when && rn.when.ticked ? h('div', { className: 'ed-fmt', 'data-editor-rides': rn.when.ticked }, ROW.rides(p.rides || rn.when.ticked)) : null,
      dmg && bands ? h('div', { className: 'ed-hint' }, M8W.bandHint) : null,
      mb[1], rmBit(ro, M8W.rmNumber, rnRead(rn, vocab), p.onRemove));
  }
  // C6: the picks the talent's rows declare, one line per pick id (edits write every row that carries it)
  var PICK_ROWS = ['roll_numbers', 'item_effects', 'told'];
  function picksOf(rec) {
    var seen = {}, out = [];
    PICK_ROWS.forEach(function (k) { arrOf(rec, k).forEach(function (row) { var pk = row && row.pick; if (pk && pk.id && !seen[pk.id]) { seen[pk.id] = true; out.push(pk); } }); });
    return out;
  }
  // a line's name where the Choices group lists it: "Number 1 · Damage, one hit", "Item line 1 · Hard points", "Shown at the roll 1"
  function rowName(k, row, i) {
    if (k === 'roll_numbers') { var o = RN_OPS.filter(function (x) { return x[0] === row.op; })[0]; return 'Number ' + (i + 1) + (o ? ' · ' + o[1] : ''); }
    if (k === 'item_effects') return 'Item line ' + (i + 1) + ' · ' + itemOpName(row);
    return (row.moment === 'buy' ? 'Shown when bought ' : row.moment ? 'Shown at the roll ' : 'Shown on the talent ') + (i + 1);
  }
  // F-100 M8 R-M8BG-59 (frame J8, approved D-59): an item pick's categories, and a kind-option pick's values by name —
  // Jury Rigged's six read as J8 draws them; any other id reads as its own words
  var CATS = [['weapon', 'weapons', 'weapon'], ['armor', 'armor', 'armor'], ['gear', 'gear', 'piece of gear']];
  var OPT_NAMES = [['damage', 'Damage'], ['crit', 'Critical'], ['other_effect', 'Other effect'], ['defense_ranged', 'Ranged defense'], ['defense_melee', 'Melee defense'], ['encumbrance', 'Encumbrance']];
  function optName(id) { var o = OPT_NAMES.filter(function (x) { return x[0] === id; })[0]; return o ? o[1] : capf(String(id || '').replace(/_/g, ' ')); }
  function catsOf(pk) { var c = isObj(pk.pool) && Array.isArray(pk.pool.categories) ? pk.pool.categories : []; return CATS.filter(function (x) { return c.indexOf(x[0]) !== -1; }).map(function (x) { return x[0]; }); }
  function catName(c) { var x = CATS.filter(function (y) { return y[0] === c; })[0]; return x ? x[1] : c; }
  function catsLabel(cs) { return capf(joinList(cs.map(catName), 'and')); }
  function pickFrom(pk, pks) {
    if (pk.kind === 'item') {
      var opts = [['weapon,armor,gear'], ['weapon,armor'], ['weapon'], ['armor'], ['gear']].map(function (o) { return [o[0], catsLabel(o[0].split(','))]; }), cur = catsOf(pk).join(',');
      return cur && !opts.some(function (o) { return o[0] === cur; }) ? [[cur, catsLabel(cur.split(','))]].concat(opts) : opts;
    }
    if (pk.kind === 'option') return [['', 'Asked on its own']].concat((pks || []).map(function (q, i) { return q.kind === 'item' ? [q.id, 'Asked after Pick ' + (i + 1) + ' (the item)'] : null; }).filter(Boolean));
    if (pk.kind === 'characteristic') return [['any', 'Any characteristic']];
    return [['combat', 'Combat skills'], ['general', 'General skills'], ['social', 'Social skills'], ['knowledge', 'Knowledge skills'], ['any', 'Any skill'], ['non_career', 'Any non-career skill']];
  }
  function pickRead(pk, ranked) {
    if (pk.kind === 'option' && pk.for_item) return null;
    var cs = catsOf(pk);
    var what = pk.kind === 'item' ? 'one ' + (cs.length && cs.length < CATS.length ? joinList(cs.map(function (c) { return CATS.filter(function (x) { return x[0] === c; })[0][2]; }), 'or') : 'item') + ' the character owns'
      : pk.kind === 'option' ? 'one of the options' : pk.kind === 'characteristic' ? 'one characteristic'
      : 'one ' + (typeof pk.pool === 'string' && pk.pool !== 'any' ? (pk.pool === 'non_career' ? 'non-career' : pk.pool) + ' ' : '') + 'skill';
    if (!ranked) return 'Pick ' + what;
    if (pk.per !== 'rank') return 'Pick ' + what + ', once, for every rank';
    return 'At each rank, pick ' + what + (pk.distinct ? (pk.kind === 'item' ? ', a different one each time' : ', never the same one twice') : '');
  }
  // J8: a kind-option pick's values, one row each — its name, the item categories it is offered for, and its label (a span
  // of the description, R-M8K-35). Starting a NEW option pick stays unbuilt (R-M8EV-1): the kind is offered only where it is.
  function OptionRows(p) {
    var pk = p.pk, ro = p.ro, desc = p.desc, opts = Array.isArray(pk.options) ? pk.options : [];
    return opts.map(function (o, j) {
      var free = OPT_NAMES.filter(function (x) { return x[0] === o.id || !opts.some(function (y) { return y.id === x[0]; }); }).map(function (x) { return [x[0], 'Option · ' + x[1]]; });
      var cs = Array.isArray(o.categories) ? CATS.filter(function (x) { return o.categories.indexOf(x[0]) !== -1; }).map(function (x) { return capf(x[1]); }) : ['Any item'];
      var ok = spanOk(desc, o.words), mk = p.mkOpt ? p.mkOpt(j) : null;
      var mb = isObj(o.words) ? markBits(o.words, mk, ro) : [null, ro || !mk ? null : h('button', { type: 'button', className: 'ed-addline', 'data-editor-mark': '1', onMouseDown: function (e) { e.preventDefault(); }, onClick: mk.onMark }, M8W.mark)];
      return h('div', { key: 'o' + j, 'data-editor-option': o.id },
        h('div', { className: 'ed-inrow' },
          h(Sel, { value: o.id, options: free.length ? free : [[o.id, 'Option · ' + optName(o.id)]], blank: false, ro: ro, label: 'Option', field: 'option', onChange: function (v) { if (v && v !== o.id) p.onRename(o.id, v); } }),
          h('div', { className: 'ed-inp ed-anchors', 'aria-label': 'Offered for' }, cs.map(function (c) { return h('button', { type: 'button', key: c, className: 'ed-qchip', disabled: true, 'aria-label': 'Offered for ' + c }, c); }))),
        mb[0],
        ok ? h('div', { className: 'ed-hint', 'data-editor-option-label': o.id }, 'Label: the marked words “', glyph(String(desc).slice(o.words.start, o.words.end)), '”')
          : null,
        mb[1]);
    });
  }
  function PickLine(p) {
    var pk = p.pk, ro = p.ro, opt = pk.kind === 'option';
    function set(k, v) { var n = clone(pk); if (v === undefined) delete n[k]; else n[k] = v; p.onChange(n); }
    function setKind(kind) {
      var n = { id: pk.id, kind: kind, per: pk.per || 'rank' };
      if (pk.distinct) n.distinct = true;
      if (kind === 'skill') n.pool = 'combat'; else if (kind === 'item') n.pool = { categories: ['weapon', 'armor', 'gear'] };
      p.onChange(n);
    }
    function setFrom(v) {
      if (pk.kind === 'skill') set('pool', v);
      else if (pk.kind === 'item') set('pool', { categories: v.split(',') });
      else if (opt) set('for_item', v || undefined);
    }
    var from = pk.kind === 'item' ? catsOf(pk).join(',') : opt ? (pk.for_item || '') : pk.kind === 'characteristic' ? 'any' : (typeof pk.pool === 'string' ? pk.pool : 'any');
    var kinds = opt ? [['option', 'One of the talent’s options']] : [['skill', 'A skill'], ['characteristic', 'A characteristic'], ['item', 'An item they own']];
    return h(Fl, { chip: 'AUTOMATIC', k: 'Pick ' + (p.i + 1), field: 'pick', cls: 'ed-m8' },
      h('div', { className: 'ed-inrow' },
        h(Sel, { value: pk.kind, options: kinds, blank: false, ro: ro, label: 'Kind of pick', field: 'kind', onChange: opt ? function () {} : setKind }),
        h(Sel, { value: from, options: pickFrom(pk, p.pks), blank: false, ro: ro, label: opt ? 'Asked after' : 'From', field: opt ? 'for_item' : 'pool', onChange: setFrom })),
      h('div', { className: 'ed-inrow' },
        h(Sel, { value: pk.per === 'rank' ? 'rank' : 'talent', options: [['rank', 'Each rank picks its own'], ['talent', 'One pick for every rank']], blank: false, ro: ro, label: 'When', field: 'per',
          onChange: function (v) { var n = clone(pk); n.per = v; if (v !== 'rank') delete n.distinct; p.onChange(n); } }),
        pk.per === 'rank' && !opt ? h(Tog, { on: !!pk.distinct, ro: ro, label: 'No two ranks the same', field: 'distinct', onChange: function (v) { set('distinct', v ? true : undefined); } }) : null),
      opt ? h(OptionRows, { pk: pk, ro: ro, desc: p.desc, mkOpt: p.mkOpt, onRename: p.onRename }) : null,
      pk.kind === 'option' && pk.for_item ? null : h('div', { className: 'ed-fmt' }, pickRead(pk, p.ranked)),
      pk.kind === 'item' || opt ? null : h('div', { className: 'ed-hint' }, M8W.pickHint));
  }
  // J8's five ops beside Tinkerer's hard points; defense reads its side as two entries (`target`)
  var ITEM_OPS = [['hard_points_delta', 'Hard points'], ['damage_delta', 'Damage'], ['crit_delta', 'Critical cost'], ['defense_delta:ranged', 'Defense · ranged'], ['defense_delta:melee', 'Defense · melee'], ['encumbrance_delta', 'Encumbrance']];
  function itemOpKey(ie) { return ie.op === 'defense_delta' ? 'defense_delta:' + (ie.target || 'ranged') : ie.op; }
  function itemOpName(ie) { var o = ITEM_OPS.filter(function (x) { return x[0] === itemOpKey(ie); })[0]; return o ? o[1] : ie.op; }
  function itemRead(ie) {
    var n = ie.amount || 0;
    if (ie.op === 'hard_points_delta' && !ie.option && !ie.in_use) return signed(n) + ' hard point' + (Math.abs(n) === 1 ? '' : 's') + ' on each picked item. The item itself is not changed: remove the talent and the hard point goes.';
    var s = ie.op === 'damage_delta' ? signed(n) + ' damage on the picked weapon' : ie.op === 'crit_delta' ? signed(n) + ' to the picked weapon’s Critical cost'
      : ie.op === 'defense_delta' ? signed(n) + ' ' + (ie.target || 'ranged') + ' defense on the picked armor' : ie.op === 'encumbrance_delta' ? signed(n) + ' encumbrance on the picked item'
      : signed(n) + ' hard point' + (Math.abs(n) === 1 ? '' : 's') + ' on the picked item';
    return s + (ie.floor ? ', never below ' + ie.floor : '') + (isObj(ie.option) ? ', when its option is ' + optName(ie.option.is) : '') + (ie.in_use ? ', while it is ' + (ie.op === 'defense_delta' ? 'worn' : 'in use') : '');
  }
  // J8: the group's closing words, under its last line, where a line is gated by an option: the item is never changed
  function itemHint(rec) {
    if (!arrOf(rec, 'item_effects').some(function (ie) { return isObj(ie.option); })) return null;
    return 'The item itself is not changed: remove the talent, or stow the item, and the change goes.';
  }
  function ItemLine(p) {
    var ie = p.ie, ro = p.ro, pks = p.pks || [];
    function set(k, v) { var n = clone(ie); if (v === undefined) delete n[k]; else n[k] = v; p.onChange(n); }
    // an op change: defense carries its side; a floor stays only on the two ops that take one (the schema refuses it elsewhere)
    function setOp(v) {
      var n = clone(ie), c = v.indexOf(':');
      n.op = c === -1 ? v : v.slice(0, c);
      if (c !== -1) n.target = v.slice(c + 1); else delete n.target;
      if (n.op !== 'crit_delta' && n.op !== 'encumbrance_delta') delete n.floor;
      if (n.op === 'hard_points_delta' && !(n.amount >= 1)) n.amount = 1;
      p.onChange(n);
    }
    var hp = ie.op === 'hard_points_delta', floored = ie.op === 'crit_delta' || ie.op === 'encumbrance_delta';
    var which = h(Sel, { value: 'chosen', options: [['chosen', 'The picked item']], blank: false, ro: ro, label: 'Which item', field: 'item', onChange: function () {} });
    var gate = null;
    if (isObj(ie.option)) {
      var oi = -1, opk = pks.filter(function (q, i) { if (q.id === ie.option.chosen) { oi = i; return true; } return false; })[0];
      gate = h(Sel, { value: ie.option.is, options: (opk && opk.options || []).map(function (o) { return [o.id, 'When Pick ' + (oi + 1) + ' is ' + optName(o.id)]; }), blank: false, ro: ro, label: 'Only when Pick ' + (oi + 1) + ' is', field: 'option',
        onChange: function (v) { set('option', { chosen: ie.option.chosen, is: v }); } });
    }
    var opSel = h(Sel, { value: itemOpKey(ie), options: ITEM_OPS, blank: false, ro: ro, label: 'What it changes', field: 'op', onChange: setOp });
    // hard points stay a plain count of at least 1 (Tinkerer, as F2 draws it); the other ops are signed (J8's "+1", "−2")
    var amt = hp ? h(NumIn, { value: ie.amount, ro: ro, label: 'Amount', field: 'amount', onChange: function (v) { set('amount', v == null ? 1 : Math.max(1, v)); } })
      : h(SignedIn, { value: ie.amount, plus: true, ro: ro, label: 'Amount', field: 'amount', onChange: function (v) { if (v) set('amount', v); } });
    var floorSel = floored ? h(Sel, { value: ie.floor ? String(ie.floor) : '', blank: false, ro: ro, label: 'Never below', field: 'floor', options: [['', 'No floor'], ['1', 'Never below 1']],
      onChange: function (v) { set('floor', v ? parseInt(v, 10) : undefined); } }) : null;
    // `in_use_words` requires `in_use` (R-M8BG-67's validator line), so turning the gate off drops its span too
    var useTog = !hp || ie.in_use ? h(Tog, { on: ie.in_use === true, ro: ro, label: 'Only while in use', field: 'in_use',
      onChange: function (v) { var n = clone(ie); if (v) n.in_use = true; else { delete n.in_use; delete n.in_use_words; } p.onChange(n); } }) : null;
    var read = itemRead(ie);
    return h(Fl, { chip: chipOf(EC() ? EC().classOfItemEffect(ie) : 'resolves'), k: 'Item line ' + (p.i + 1), field: 'item_effects', cls: 'ed-m8' },
      gate ? [h('div', { className: 'ed-inrow', key: 'a' }, which, gate), h('div', { className: 'ed-inrow', key: 'b' }, opSel, amt, floorSel, useTog)]
        : [h('div', { className: 'ed-inrow', key: 'a' }, which, opSel, amt), floorSel || useTog ? h('div', { className: 'ed-inrow', key: 'b' }, floorSel, useTog) : null],
      h('div', { className: 'ed-fmt' }, read),
      p.hint ? h('div', { className: 'ed-hint', 'data-editor-item-hint': '1' }, p.hint) : null,
      rmBit(ro, M8W.rmItem, read, p.onRemove));
  }
  // R-M8BG-37: weapon_quality_delta reads the quality by its vocabulary label; it moves only weapons that already carry it
  function qualLabel(id, vocab) {
    var e = ((vocab && vocab.qualities) || []).filter(function (x) { return x.id === id; })[0];
    return e ? e.label : (id || 'the chosen quality');
  }
  function vehRead(ve, vocab) {
    if (ve.op === 'weapon_quality_delta') return signed(ve.amount) + ' ' + qualLabel(ve.quality, vocab) + (ve.per_rank ? ' per rank' : '') + ' on the Signature Vehicle’s weapons that already have it';
    return signed(ve.amount) + ' ' + (VEHLAB[ve.op] || ve.op) + (ve.per_rank ? ' per rank' : '') + ' on the character’s Signature Vehicle';
  }
  // "Which quality": the RATED qualities of the vocabulary the validator checks `quality` against (loadVocab's), rated as
  // the I-12 picker reads them (rankedIds over the books' weapons); the row's own value is always offered, so a saved
  // row never reads as unpicked while the books load.
  function qualOptions(vocab, books, cur) {
    var rk = rankedIds(books || {}), out = [];
    ((vocab && vocab.qualities) || []).forEach(function (e) { if (rk[e.id] || e.id === cur) out.push([e.id, e.label]); });
    return out;
  }
  function VehicleLine(p) {
    var ve = p.ve, ro = p.ro;
    function set(k, v) { var n = clone(ve); if (v === undefined) delete n[k]; else n[k] = v; p.onChange(n); }
    // an op change away from weapon_quality_delta drops `quality` (the schema forbids it on every other op)
    function setOp(v) { var n = clone(ve); n.op = v; if (v !== 'weapon_quality_delta') delete n.quality; p.onChange(n); }
    return h(Fl, { chip: chipOf(EC() ? EC().classOfVehicleEffect(ve) : 'resolves'), k: 'Vehicle line ' + (p.i + 1), field: 'vehicle_effects', cls: 'ed-m8' },
      h('div', { className: 'ed-inrow' },
        h(Sel, { value: ve.op, options: VEH_OPS.map(function (o) { return [o[0], o[1]]; }), blank: false, ro: ro, label: 'What it changes', field: 'op', onChange: setOp }),
        ve.op === 'weapon_quality_delta' ? h(Sel, { value: ve.quality || '', options: qualOptions(p.vocab, p.books, ve.quality), blank: !ve.quality, ro: ro, label: 'Which quality', field: 'quality',
          onChange: function (v) { set('quality', v || undefined); } }) : null,
        h(SignedIn, { value: ve.amount, ro: ro, label: 'Amount', field: 'amount', onChange: function (v) { if (v) set('amount', v); } }),
        p.ranked ? h(Tog, { on: ve.per_rank === true, ro: ro, label: 'Per rank', field: 'per_rank', onChange: function (v) { set('per_rank', v ? true : undefined); } }) : null),
      h('div', { className: 'ed-fmt' }, vehRead(ve, p.vocab)),
      h('div', { className: 'ed-hint' }, M8W.vehicleHint),
      rmBit(ro, M8W.rmVehicle, vehRead(ve, p.vocab), p.onRemove));
  }
  // C5: a TOLD row, the talent's own marked words shown at a moment
  function toldRead(t, vocab, sp) {
    var anc = Array.isArray(t.applies_to) ? t.applies_to : [];
    var at = t.moment === 'check' ? 'at ' + (anc.length ? joinList(anc.map(function (a) { return anchorName(a, vocab); }), 'and') + ' checks' : 'every check')
      : t.moment === 'critical_injury' ? 'at a Critical Injury roll' : t.moment === 'buy' ? 'when the talent is bought' : sp ? 'on the ability' : 'on the talent';
    return 'Shows the marked words ' + at + '. The app does not apply it.';
  }
  function ToldLine(p) {
    var t = p.t, ro = p.ro, vocab = p.vocab;
    function put(n) { p.onChange(n); }
    var anc = Array.isArray(t.applies_to) ? t.applies_to : [];
    var sp = !!p.sp, key = t.moment === 'buy' ? 'Shown when bought ' : t.moment ? 'Shown at the roll ' : sp ? 'Shown on the ability ' : 'Shown on the talent ';
    var mb = p.mb || markBits(t.words, p.mk, ro);
    return h(Fl, { chip: 'NARRATIVE', k: key + (p.i + 1), field: 'told', cls: 'ed-m8' },
      h('div', { className: 'ed-inrow' }, h(Sel, { value: t.moment || '', options: sp ? SP_MOMENTS : MOMENTS, blank: false, ro: ro, label: 'Where it shows', field: 'moment',
        onChange: function (v) { var n = clone(t); if (v) n.moment = v; else delete n.moment; if (v !== 'check') delete n.applies_to; put(n); } })),
      t.moment === 'check' ? h('div', { className: 'ed-inrow' }, h(AnchorChips, { anc: anc, ro: ro, vocab: vocab, x: p.spx, onChange: function (a) { var n = clone(t); if (a.length) n.applies_to = a; else delete n.applies_to; put(n); } }),
        ro ? null : h(Sel, { value: '', options: anchorOpts(vocab), blankLabel: anc.length ? '+ another' : IW.anyCheck, ro: ro, label: 'Which checks', field: 'applies_to',
          onChange: function (v) { if (!v) return; var n = clone(t); n.applies_to = anc.concat([anchorOf(v)]); put(n); } })) : null,
      mb[0],
      h('div', { className: 'ed-fmt' }, toldRead(t, vocab, sp)),
      mb[1], rmBit(ro, M8W.rmTold, toldRead(t, vocab, sp), p.onRemove));
  }
  // ── F-100 THE SURFACING MISSION (card f100-surfacing-roll-options-card ADDENDUM 8 F13; brief §5): a talent's SPEND and
  // TARGET rows, in the approved editor's row idiom (Fl / Sel / NumIn / AnchorChips / the mark) — UNDRAWN CHROME following
  // drawn patterns (R-M12B-126), listed on the gate's LIVE-vs-DRAWN table. A group draws only where the talent carries a row
  // of its kind; starting a new kind stays unbuilt (R-M8EV-1, B-1077). Writes only the shapes on paper (R-Y2-1). ──
  var ROW = {
    spend: 'On the spend menu', target: 'Damage as strain', spendK: 'Spend line ', targetK: 'Strain line ',
    when: 'On which results', price: 'Price', repeat: 'How many times', cost: 'It also costs', how: 'How often',
    rmSpend: 'Remove this spend line', rmTarget: 'Remove this strain line', rides: function (n) { return 'Rides the tick of ' + n; },
  };
  var SPEND_WHEN = [['hit', 'A success'], ['miss', 'A failure'], ['any', 'Either']];
  var SPEND_KEYS = [['ad', 'Advantage'], ['tr', 'Triumph'], ['fp', 'Force point']];
  var SPEND_TOK = { ad: 'AD', tr: 'TR', fp: 'FP' };
  function spendPrice(req) {
    return (req || []).map(function (c) { var k = Object.keys(c)[0], t = ''; for (var i = 0; i < (c[k] || 0); i++) t += '[' + (SPEND_TOK[k] || k) + ']'; return t; }).join(' or ');
  }
  function spendRead(sp, vocab) {
    var anc = Array.isArray(sp.applies_to) ? sp.applies_to : [], on = anc.length ? joinList(anc.map(function (a) { return anchorName(a, vocab); }), 'or') + ' check' : 'any check';
    var price = sp.req ? 'Spend ' + spendPrice(sp.req) : sp.cost && sp.cost.destiny ? 'Spend a Destiny Point' : 'Spend';
    var rep = sp.repeat === 'rating' ? ', up to once per rank' : sp.repeat === true ? ', as often as paid' : typeof sp.repeat === 'number' ? ', up to ' + sp.repeat + ' times' : '';
    var when = sp.when === 'hit' ? 'a successful ' : sp.when === 'miss' ? 'a failed ' : 'a ';
    return price + ' from ' + when + on + ' for the marked words' + rep + (sp.req && sp.cost && sp.cost.destiny ? ', paying a Destiny Point' : '')
      + (sp.limit ? ', ' + String(sp.limit).replace(/_/g, ' ') : '') + '. Listed after the roll; the table applies it.';
  }
  function SpendLine(p) {
    var sp = p.sp, ro = p.ro, vocab = p.vocab, anc = Array.isArray(sp.applies_to) ? sp.applies_to : [], req = Array.isArray(sp.req) ? sp.req : [];
    function put(n) { p.onChange(n); }
    function set(k, v) { var n = clone(sp); if (v === undefined || v === null) delete n[k]; else n[k] = v; put(n); }
    function setClause(i, k, v) { var r = req.map(clone); var o = {}; o[k] = Math.max(1, v || 1); r[i] = o; set('req', r); }
    var mb = p.mb || markBits(sp.words, p.mk, ro);
    var repV = sp.repeat === undefined ? '' : sp.repeat === true ? 'paid' : sp.repeat === 'rating' ? 'rating' : String(sp.repeat);
    return h(Fl, { chip: chipOf(EC() && EC().classOfSpend ? EC().classOfSpend(sp) : 'reminds'), k: ROW.spendK + (p.i + 1), field: 'spend', cls: 'ed-m8' },
      h('div', { className: 'ed-inrow' }, h(AnchorChips, { anc: anc, ro: ro, vocab: vocab, onChange: function (n) { if (n.length) set('applies_to', n); } }),
        ro ? null : h(Sel, { value: '', options: anchorOpts(vocab), blankLabel: anc.length ? '+ another' : IW.anyCheck, ro: ro, label: 'Which checks', field: 'applies_to',
          onChange: function (v) { if (v) set('applies_to', anc.concat([anchorOf(v)])); } })),
      h('div', { className: 'ed-inrow' }, h(Sel, { value: sp.when || 'any', options: SPEND_WHEN, blank: false, ro: ro, label: ROW.when, field: 'when', onChange: function (v) { set('when', v); } })),
      req.map(function (c, i) {
        var k = Object.keys(c)[0];
        return h('div', { className: 'ed-inrow', key: 'q' + i },
          h(Sel, { value: k, options: SPEND_KEYS, blank: false, ro: ro, label: ROW.price + (req.length > 1 ? ' ' + (i + 1) : ''), field: 'req', onChange: function (v) { setClause(i, v, c[k]); } }),
          h(NumIn, { value: c[k], ro: ro, label: 'How many', field: 'req', onChange: function (v) { setClause(i, k, v); } }));
      }),
      h('div', { className: 'ed-inrow' }, h(Sel, { value: repV, blank: false, ro: ro, label: ROW.repeat, field: 'repeat',
        options: [['', 'Once per check'], ['paid', 'As often as it is paid']].concat(p.ranked || sp.repeat === 'rating' ? [['rating', 'Up to once per rank']] : []),
        onChange: function (v) { set('repeat', v === '' ? undefined : v === 'paid' ? true : v === 'rating' ? 'rating' : +v); } })),
      h('div', { className: 'ed-inrow' }, h(Sel, { value: sp.cost && sp.cost.destiny ? 'destiny' : '', blank: false, ro: ro, label: ROW.cost, field: 'cost',
        options: [['', 'Nothing more'], ['destiny', 'A Destiny Point']], onChange: function (v) { if (v || req.length) set('cost', v ? { destiny: 1 } : undefined); } }),
        h(Sel, { value: sp.limit || '', blank: false, ro: ro, label: ROW.how, field: 'limit', options: [['', 'Every check']].concat(USE_LIMITS), onChange: function (v) { set('limit', v || undefined); } })),
      mb[0],
      h('div', { className: 'ed-fmt' }, glyph(spendRead(sp, vocab))),   // W4 (flip card ADDENDUM 75 C1): the price draws as the dice roller's symbols
      mb[1], rmBit(ro, ROW.rmSpend, spendRead(sp, vocab), p.onRemove));
  }
  function targetRead(t, vocab, riders) {
    var anc = Array.isArray(t.applies_to) ? t.applies_to : [];
    return 'Offers to deal the damage as strain on ' + (anc.length ? joinList(attackWords(anc, vocab), 'and') + ' attacks' : 'every attack') + ', when the marked words apply'
      + (riders.length ? ', with ' + joinList(riders, 'and') + ' riding the tick' : '') + '. Ticked before the roll.';
  }
  function TargetLine(p) {
    var t = p.t, ro = p.ro, vocab = p.vocab, anc = Array.isArray(t.applies_to) ? t.applies_to : [];
    function set(k, v) { var n = clone(t); if (v === undefined || v === null) delete n[k]; else n[k] = v; p.onChange(n); }
    var mb = p.mb || markBits(t.condition, p.mk, ro);
    return h(Fl, { chip: chipOf(EC() && EC().classOfTarget ? EC().classOfTarget(t) : 'reminds'), k: ROW.targetK + (p.i + 1), field: 'target', cls: 'ed-m8' },
      h('div', { className: 'ed-inrow' }, h(AnchorChips, { anc: anc, ro: ro, vocab: vocab, onChange: function (n) { if (n.length) set('applies_to', n); } }),
        ro ? null : h(Sel, { value: '', options: anchorOpts(vocab), blankLabel: anc.length ? '+ another' : IW.anyCheck, ro: ro, label: 'Which attacks', field: 'applies_to',
          onChange: function (v) { if (v) set('applies_to', anc.concat([anchorOf(v)])); } })),
      mb[0],
      h('div', { className: 'ed-fmt' }, targetRead(t, vocab, p.riders || [])),
      mb[1], rmBit(ro, ROW.rmTarget, targetRead(t, vocab, p.riders || []), p.onRemove));
  }
  // ── F-100 M8 M2 (ruling f100-m8-batches R-M8BG-233/234; the approved mockup f100-m8-skill-swap.html @ b2aeb49b, FLAG d,
  // drawn by f100_m8_shape_frames.py ED_USE): a skill_substitute effect as OFFERED "Use another skill" in "At the roll — dice",
  // editable in the controls drawn — the checks' chips, the substitutes' chips + "+ Add a skill", the characteristic, the cost ──
  var SUBW = {
    k: 'Use another skill', chip: 'OFFERED', checks: 'At which checks', ranks: 'Roll with the ranks of', chr: 'With which characteristic',
    costs: 'It costs', own: 'Its own (the skill used)', addSkill: '+ Add a skill', pickSkill: 'Choose a skill', nothing: 'Nothing',
    every: function (g) { return capf(g) + ' (every skill)'; }, ranked: function (g) { return capf(g) + ' (each skill with ranks)'; },
  };
  var CHARS = ['brawn', 'agility', 'intellect', 'cunning', 'willpower', 'presence'];
  // a group whose every skill the list names reads as that group: Talk the Talk's seven Knowledge skills are "Knowledge"
  function subChecks(ids, vocab) {
    var left = ids.slice(), out = [];
    GROUPS.forEach(function (g) {
      var all = (vocab ? vocab.skills : []).filter(function (s) { return s.group === g; }).map(function (s) { return s.id; });
      if (all.length && all.every(function (id) { return left.indexOf(id) !== -1; })) { out.push({ group: g, ids: all }); left = left.filter(function (id) { return all.indexOf(id) === -1; }); }
    });
    return out.concat(left.map(function (id) { return { id: id, ids: [id] }; }));
  }
  function subCost(c) { return !c ? '' : c.destiny ? c.destiny + ' Destiny Point' + (c.destiny === 1 ? '' : 's') : c.strain ? c.strain + ' strain' : c.commit_force ? 'Commit ' + c.commit_force + ' Force' : ''; }
  // the read-aloud: "Offers “Use Underworld this roll” and “Use Streetwise this roll” at every Knowledge check, for 1 Destiny
  // Point. The player presses one; the app rolls its ranks." — the condition is the print's own clause (R-M8BG-238)
  function subRead(e, vocab) {
    var use = Array.isArray(e.use) ? e.use : [];
    var offers = use.map(function (u) { return isObj(u) ? '“Use <skill> this roll” for each ' + capf(u.group) + ' skill with ranks' : '“Use ' + skillLabel(u, vocab) + ' this roll”'; });
    var at = subChecks(Array.isArray(e.skills) ? e.skills : [], vocab).map(function (c) { return c.group ? capf(c.group) : skillLabel(c.id, vocab); });
    var many = use.length > 1 || use.some(isObj);
    return 'Offers ' + joinList(offers, 'and') + ' at every ' + joinList(at, 'or') + ' check' + (e.condition ? ' ' + e.condition : '')
      + (e.to ? ', rolled with ' + capf(e.to) : '') + (e.cost ? ', for ' + subCost(e.cost) : '') + (e.limit ? ', ' + String(e.limit).replace(/_/g, ' ') : '')
      + '. The player presses ' + (many ? 'one' : 'it') + '.';
  }
  function SubstituteLine(p) {
    var e = p.e, ro = p.ro, vocab = p.vocab;
    var _a = useState(false), adding = _a[0], setAdding = _a[1];
    function put(k, v) { var n = clone(e); if (v === undefined) delete n[k]; else n[k] = v; p.onChange(n); }
    var checks = subChecks(Array.isArray(e.skills) ? e.skills : [], vocab), use = Array.isArray(e.use) ? e.use : [];
    var useName = function (u) { return isObj(u) ? SUBW.ranked(u.group) : skillLabel(u, vocab); };
    var taken = use.map(function (u) { return isObj(u) ? 'group:' + u.group : u; });
    var addOpts = [['group:knowledge', SUBW.ranked('knowledge')]].concat((vocab ? vocab.skills : []).map(function (s) { return [s.id, s.label]; }))
      .filter(function (o) { return taken.indexOf(o[0]) === -1; });
    var c = e.cost || {}, costV = c.destiny ? 'destiny' : c.strain ? 'strain' : c.commit_force ? 'commit_force' : '';
    var costOpts = [['', SUBW.nothing], ['destiny', subCost({ destiny: 1 })], ['strain', subCost({ strain: c.strain || 1 })]].concat(c.commit_force ? [['commit_force', subCost(c)]] : []);
    var chipsOf = function (items, name, onDrop) {
      return h('div', { className: 'ed-inp ed-anchors' }, items.map(function (x, i) {
        var nm = name(x), lone = items.length === 1;   // `skills` and `use` keep at least one entry (schema minItems)
        return h('button', { type: 'button', key: i, className: 'ed-qchip', disabled: ro || lone, 'aria-label': ro || lone ? nm : 'Remove ' + nm, onClick: function () { onDrop(i); } }, nm);
      }));
    };
    return h(Fl, { chip: SUBW.chip, k: SUBW.k, field: 'effects', cls: 'ed-m8' },
      h('div', { className: 'ed-hint' }, SUBW.checks),
      h('div', { className: 'ed-inrow' }, chipsOf(checks, function (x) { return x.group ? SUBW.every(x.group) : skillLabel(x.id, vocab); }, function (i) {
        var drop = checks[i].ids; put('skills', e.skills.filter(function (id) { return drop.indexOf(id) === -1; }));
      })),
      h('div', { className: 'ed-hint' }, SUBW.ranks),
      h('div', { className: 'ed-inrow' }, chipsOf(use, useName, function (i) { var n = use.slice(); n.splice(i, 1); put('use', n); }),
        ro ? null : adding ? h(Sel, { value: '', options: addOpts, blankLabel: SUBW.pickSkill, ro: ro, label: SUBW.ranks, field: 'use',
            onChange: function (v) { if (!v) return; setAdding(false); put('use', use.concat([v.indexOf('group:') === 0 ? { group: v.slice(6) } : v])); } })
          : h('button', { type: 'button', className: 'ed-addline', onClick: function () { setAdding(true); }, 'data-editor-adduse': '1' }, SUBW.addSkill)),
      h('div', { className: 'ed-hint' }, SUBW.chr),
      h('div', { className: 'ed-inrow' }, h(Sel, { value: e.to || '', blank: false, ro: ro, label: SUBW.chr, field: 'to',
        options: [['', SUBW.own]].concat(CHARS.map(function (x) { return [x, capf(x)]; })), onChange: function (v) { put('to', v || undefined); } })),
      h('div', { className: 'ed-hint' }, SUBW.costs),
      h('div', { className: 'ed-inrow' }, h(Sel, { value: costV, blank: false, ro: ro, label: SUBW.costs, field: 'cost', options: costOpts,
        onChange: function (v) { put('cost', v === 'destiny' ? { destiny: 1 } : v === 'strain' ? { strain: c.strain || 1 } : v === 'commit_force' ? clone(c) : undefined); } })),
      h('div', { className: 'ed-fmt' }, subRead(e, vocab)));
  }
  // the description's marked words: a TOLD row's span and a span condition (R-M8K-17), never C9's provenance `words`
  function marksOf(rec) {
    var out = [];
    arrOf(rec, 'told').forEach(function (t) { if (isObj(t.words)) out.push(t.words); });
    ['pool_mods', 'roll_numbers', 'target'].forEach(function (k) { arrOf(rec, k).forEach(function (row) { if (row && isObj(row.condition)) out.push(row.condition); }); });
    arrOf(rec, 'spend').forEach(function (row) { if (row && isObj(row.words)) out.push(row.words); });   // F-100 THE SURFACING MISSION
    // a stale span draws no mark: its line says so and asks again (R-M8EV-3)
    return out.filter(function (s) { return spanOk(rec.description, s); }).sort(function (a, b) { return a.start - b.start; });
  }
  // the description reads with its marks (as F2 draws it) until it is focused for editing, as GlyphArea reads its glyphs
  function MarkedArea(p) {
    var text = String(p.value || ''), marks = p.marks || [];
    function edit() { if (!p.ro && p.onEdit) p.onEdit(); }
    // `raw` (F-100 M10 F5, frames-card item 7): a Force power's words keep the registry's tokens as typed ([FP]), never glyphs
    var g = p.raw ? function (x) { return x; } : glyph;
    if (p.editing || !marks.length) return h(p.raw ? GrowArea : GlyphArea, Object.assign({}, p, { onFocus: edit }));
    var parts = [], at = 0;
    marks.forEach(function (s, i) {
      if (s.start < at) return;
      if (s.start > at) parts.push(g(text.slice(at, s.start)));
      parts.push(h('mark', { key: 'm' + i, className: 'ed-mark' }, g(text.slice(s.start, s.end))));
      at = s.end;
    });
    if (at < text.length) parts.push(g(text.slice(at)));
    return h('div', { className: 'ed-inp ed-area', role: p.ro ? undefined : 'textbox', tabIndex: p.ro ? undefined : 0, 'aria-label': p.label, 'data-ro': p.ro ? '1' : undefined,
      onFocus: edit, onClick: edit, 'data-editor-input': p.field, 'data-editor-marked': String(marks.length) }, parts);
  }
  // R8: each M8 row's preview line, as the sheet draws it → [head, line]
  function m8Preview(rec, vocab, r) {
    var out = [], times = function (per) { return per ? r : 1; };
    arrOf(rec, 'roll_numbers').forEach(function (rn) {
      var anc = Array.isArray(rn.applies_to) ? rn.applies_to : [];
      if (rn.op === 'crit_roll_delta') { out.push(['At the roll · your Critical Injury roll', signed(rn.amount * times(rn.per_rank === true)) + (rn.floor ? ', never below ' + rn.floor : '')]); return; }
      if (rn.op === 'crit_rating_delta') { out.push(['At the roll' + (anc.length ? ' · ' + attackWords(anc, vocab).join(', ') : ''), signed(rn.amount * times(rn.per_rank === true)) + ' to the Critical rating' + (rn.floor ? ', never below ' + rn.floor : '')]); return; }
      var bands = Array.isArray(rn.range_band) ? rn.range_band.map(function (b) { return BANDLAB[b] || b; }) : [];
      // B-1543: a characteristic amount names the characteristic, as rnRead does
      if (isObj(rn.amount) && rn.amount.of === 'characteristic' && rn.amount.key) {
        var canc = anc.filter(function (a) { return a.scope !== 'all'; });
        out.push(['At the roll' + (canc.length ? ' · ' + attackWords(canc, vocab).join(', ') : ''), '+ damage to one hit, equal to your ' + capf(rn.amount.key)]); return;
      }
      if (isObj(rn.amount)) { out.push(['At the roll · the skill you picked', '+ damage to one hit, equal to your ranks in it']); return; }
      out.push(['At the roll' + (anc.length ? ' · ' + attackWords(anc, vocab).join(', ') : '') + (bands.length ? ', at ' + joinList(bands, 'or') : ''), signed(rn.amount * times(rn.per_rank === true)) + ' damage to one hit']);
    });
    // J8: the lines an option gates read as ONE preview line — the player's own choice decides which applies
    var gated = arrOf(rec, 'item_effects').filter(function (ie) { return isObj(ie.option); });
    arrOf(rec, 'item_effects').forEach(function (ie) { if (!isObj(ie.option)) out.push(['On your picked items', signed(ie.amount || 0) + ' hard point' + (Math.abs(ie.amount) === 1 ? '' : 's') + ' each']); });
    arrOf(rec, 'vehicle_effects').forEach(function (ve) { out.push(['On your Signature Vehicle', signed(ve.amount * times(ve.per_rank === true)) + ' ' + (VEHLAB[ve.op] || ve.op)]); });
    arrOf(rec, 'told').forEach(function (t) {
      var anc = Array.isArray(t.applies_to) ? t.applies_to : [];
      var head = t.moment === 'check' ? 'At the roll' + (anc.length ? ' · ' + anc.map(function (a) { return anchorName(a, vocab); }).join(', ') : '')
        : t.moment === 'critical_injury' ? 'At the roll · your Critical Injury roll' : t.moment === 'buy' ? 'When it is bought' : 'On the talent';
      out.push([head, (rec.name || 'The talent') + '’s words, shown, not applied']);
    });
    // J8 draws it under the talent's own words
    if (gated.length) out.push(['On your picked item', 'The improvement you chose' + (gated.some(function (ie) { return ie.in_use === true; }) ? ', while you use it' : '')]);
    return out;
  }
  // the talent form's body (U1a / U12 order): What it is · On the sheet — numbers · At the roll — dice · Text for the table
  function TalentBody(p) {
    var rec = p.rec, ro = p.ro, bad = p.bad || {}, vocab = p.vocab;
    var _m = useState(-1), menu = _m[0], setMenu = _m[1];
    var _f = useState(-1), fresh = _f[0], setFresh = _f[1];
    // R-M8EV-3: the description's edit mode and its last selection (the span "Mark the selected words" writes); R-M8EV-4 (i):
    // a pick being added, unsaved until the author chooses the line that carries it
    var _e = useState(false), editing = _e[0], setEditing = _e[1];
    var _s = useState(null), sel = _s[0], setSel = _s[1];
    var _n = useState(false), newPick = _n[0], setNewPick = _n[1];
    var _k = useState(false), kindMenu = _k[0], setKindMenu = _k[1];   // B-1077's "+ Add another kind of line" menu
    var set = function (k, v) { var r = clone(rec); if (v === undefined) delete r[k]; else r[k] = v; p.onChange(r); };
    var effs = Array.isArray(rec.effects) ? rec.effects : [], pms = Array.isArray(rec.pool_mods) ? rec.pool_mods : [];
    var shown = [];   // the FULL indices of the lines drawn (number ops only); writes go to the full index (R-M7G-14 (iv))
    effs.forEach(function (e, fi) { if (!isSkillOp(e)) shown.push(fi); });
    var ranked = !!rec.ranked;
    function setRanked(v) {
      var r = clone(rec); r.ranked = !!v;
      // `per_rank: true` on an unranked talent is refused by the schema — an unranked talent's lines apply once
      if (!v) { (r.effects || []).forEach(function (e) { if (!isSkillOp(e)) e.per_rank = false; }); (r.pool_mods || []).forEach(function (d) { delete d.per_rank; }); }
      else (r.effects || []).forEach(function (e) { if (e.op !== 'force_rating_floor' && !isSkillOp(e)) e.per_rank = true; });
      p.onChange(r);
    }
    function setEff(i, e) { var r = clone(rec); r.effects = effs.slice(); r.effects[i] = e; p.onChange(r); }
    function dropEff(i) { var r = clone(rec); r.effects = effs.slice(); r.effects.splice(i, 1); setMenu(-1); p.onChange(r); }
    function addEff() { var r = clone(rec); r.effects = effs.concat([{ op: 'soak_delta', amount: 1, per_rank: ranked }]); setMenu(r.effects.length - 1); setFresh(r.effects.length - 1); p.onChange(r); }
    function setPm(i, d) { var r = clone(rec); r.pool_mods = pms.slice(); r.pool_mods[i] = d; p.onChange(r); }
    function dropPm(i) { var r = clone(rec); r.pool_mods = pms.slice(); r.pool_mods.splice(i, 1); p.onChange(r); }
    function addPm() { var r = clone(rec); r.pool_mods = pms.concat([{ die: 'boost', count: 1, direction: 'add', applies_to: null, condition: null }]); p.onChange(r); }
    // the span a row's mark button writes: a TOLD row's `words`, a span condition's `condition` (R-M8K-17)
    function mkFor(k, i, field) {
      return { desc: rec.description, editing: editing, onMark: function () {
        var sp = spanFrom(rec.description, sel); if (!sp) return;
        var r = clone(rec); r[k][i][field] = sp; p.onChange(r);
      } };
    }
    var what = h(Grp, { t: IW.sec.what },
      h(Fl, { chip: 'NARRATIVE', k: 'Name', field: 'name', bad: bad.name }, h(TextIn, { value: rec.name, ro: ro, label: 'Name', field: 'name', onChange: function (v) { set('name', v); } })),
      h(Fl, { chip: 'NARRATIVE', k: 'Activation', field: 'activation' }, h(Sel, { value: rec.activation || 'passive', blank: false, ro: ro, label: 'Activation', field: 'activation', options: ACTS.map(function (a) { return [a, actLabel(a)]; }), onChange: function (v) { set('activation', v); } })),
      h(Fl, { chip: 'AUTOMATIC', k: 'Ranked', field: 'ranked' }, h(Tog, { on: ranked, ro: ro, label: 'Can be bought more than once', field: 'ranked', onChange: setRanked }),
        // F3 (approved) draws this under a ranked talent's toggle — R-M5T-2 (ruling f100-m5-talents decision (e))
        ranked ? h('div', { className: 'ed-hint', 'data-editor-perrank-hint': '1' }, TW.perRankHint) : null));
    var numbers = h(Grp, { t: TW.numbers, aside: shown.length ? shown.length + ' line' + (shown.length === 1 ? '' : 's') : 'none' },
      shown.length ? null : h('p', { className: 'ed-hint', style: { margin: '2px 0 6px' } }, TW.noNumber),
      shown.map(function (i, j) {
        return h(EffectLine, { key: 'e' + i, e: effs[i], i: j, ro: ro, ranked: ranked, name: rec.name, menu: menu === i, fresh: fresh === i,
          onMenu: function (on) { setMenu(on ? i : -1); }, onChange: function (x) { setEff(i, x); }, onRemove: function () { dropEff(i); } });
      }),
      ro ? null : h('button', { type: 'button', className: 'ed-addline', onClick: addEff, 'data-editor-addnumber': '1' }, TW.addNumber));
    var dice = h(Grp, { t: TW.dice, aside: pms.length ? pms.length + ' line' + (pms.length === 1 ? '' : 's') : 'none' },
      pms.map(function (d, i) { return h(TalentDiceLine, { key: 'd' + i, d: d, i: i, ro: ro, ranked: ranked, vocab: vocab, mk: isObj(d.condition) ? mkFor('pool_mods', i, 'condition') : null, onChange: function (x) { setPm(i, x); }, onRemove: function () { dropPm(i); } }); }),
      ro ? null : h('button', { type: 'button', className: 'ed-addline', onClick: addPm, 'data-editor-adddice': '1' }, TW.addDice),
      // F-100 M8 M2: a skill_substitute effect, drawn after the dice lines as ED_USE draws it; writes go to its FULL index
      effs.map(function (e, fi) { return e && e.op === 'skill_substitute' ? h(SubstituteLine, { key: 'u' + fi, e: e, ro: ro, vocab: vocab, onChange: function (x) { setEff(fi, x); } }) : null; }));
    // F-100 M8 (frame F2): a group draws only where the talent carries a row of its kind (R-M8EV-1); writes go to the row's
    // own index; a pick edit writes every row that carries that pick id; Remove drops the row, and the array with its last row
    // (R-M8EV-2); "+ Add a pick" saves the new pick on the line the author chooses, never on the talent (R-M8EV-4 (i))
    function setRow(k, i, row) { var r = clone(rec); r[k] = arrOf(rec, k).slice(); r[k][i] = row; p.onChange(r); }
    function dropRow(k, i) { var r = clone(rec); r[k] = arrOf(rec, k).slice(); r[k].splice(i, 1); if (!r[k].length) delete r[k]; p.onChange(r); }
    function pickOnto(v) {
      if (!v) return;
      var k = v.slice(0, v.indexOf(':')), i = +v.slice(v.indexOf(':') + 1), used = {}, n = 1;
      picksOf(rec).forEach(function (pk) { used[pk.id] = true; });
      while (used['pick_' + n]) n++;
      var r = clone(rec); r[k][i].pick = { id: 'pick_' + n, kind: 'skill', pool: 'any', per: ranked ? 'rank' : 'talent' };
      setNewPick(false); p.onChange(r);
    }
    function addRow(k, row) { var r = clone(rec); r[k] = arrOf(rec, k).concat([row]); p.onChange(r); }
    function setPick(id, pk) { var r = clone(rec); PICK_ROWS.forEach(function (k) { if (Array.isArray(r[k])) r[k].forEach(function (row) { if (row && row.pick && row.pick.id === id) row.pick = clone(pk); }); }); p.onChange(r); }
    // J8: an option value's label is a span of the description, marked as a TOLD row's words are (R-M8EV-3)
    function mkOpt(pk, j) {
      return { desc: rec.description, editing: editing, onMark: function () {
        var sp = spanFrom(rec.description, sel); if (!sp) return;
        var n = clone(pk); n.options[j].words = sp; setPick(pk.id, n);
      } };
    }
    // a renamed value renames every line it gates, so no line is left pointing at a value the pick no longer has
    function renameOpt(id, a, b) {
      var r = clone(rec);
      PICK_ROWS.forEach(function (k) { if (Array.isArray(r[k])) r[k].forEach(function (row) {
        if (row && row.pick && row.pick.id === id) (row.pick.options || []).forEach(function (o) { if (o.id === a) o.id = b; });
        if (row && isObj(row.option) && row.option.chosen === id && row.option.is === a) row.option.is = b;
      }); });
      p.onChange(r);
    }
    function addOpt(pk) {
      var have = (pk.options || []).map(function (o) { return o.id; }), id = (OPT_NAMES.filter(function (x) { return have.indexOf(x[0]) === -1; })[0] || [])[0], n = 1;
      while (!id) { if (have.indexOf('option_' + n) === -1) id = 'option_' + n; n++; }
      var q = clone(pk); q.options = (q.options || []).concat([{ id: id }]); setPick(pk.id, q);
    }
    var rns = arrOf(rec, 'roll_numbers'), ies = arrOf(rec, 'item_effects'), ves = arrOf(rec, 'vehicle_effects'), tolds = arrOf(rec, 'told'), pks = picksOf(rec);
    var lines = function (n, one, many) { return n + ' ' + (n === 1 ? one : many); };
    // a new item line: Tinkerer's copies the first line's item and pick (as before); where the lines are gated by an option,
    // it takes the same item and option pick, gated on the first value no line uses yet, and keeps `in_use` (J8)
    function addItemLine() {
      var f = ies[0];
      if (!isObj(f.option)) { addRow('item_effects', { op: 'hard_points_delta', item: clone(f.item), amount: 1, pick: clone(f.pick) }); return; }
      var opk = pks.filter(function (q) { return q.id === f.option.chosen; })[0], used = ies.map(function (ie) { return isObj(ie.option) ? ie.option.is : null; });
      var free = (opk && opk.options || []).filter(function (o) { return used.indexOf(o.id) === -1; })[0];
      var row = { op: 'damage_delta', item: clone(f.item), amount: 1, option: { chosen: f.option.chosen, is: free ? free.id : f.option.is } };
      if (f.in_use) row.in_use = true;
      addRow('item_effects', row);
    }
    var free = [];   // the lines that can take a pick: a pick-bearing kind (PICK_ROWS) whose row carries none — a row holds ONE pick
    PICK_ROWS.forEach(function (k) { arrOf(rec, k).forEach(function (row, i) { if (row && !row.pick) free.push([k + ':' + i, rowName(k, row, i)]); }); });
    var picks = pks.length || newPick ? h(Grp, { t: M8W.picks, aside: lines(pks.length, 'pick', 'picks') },
      pks.map(function (pk, i) {
        var line = h(PickLine, { key: 'k' + pk.id, pk: pk, i: i, pks: pks, ro: ro, ranked: ranked, desc: rec.description, onChange: function (x) { setPick(pk.id, x); },
          mkOpt: pk.kind === 'option' ? function (j) { return mkOpt(pk, j); } : null, onRename: function (a, b) { renameOpt(pk.id, a, b); } });
        // J8 draws "+ Add an option" under the option pick's line
        return pk.kind === 'option' && !ro ? [line, h('button', { type: 'button', key: 'ao' + pk.id, className: 'ed-addline', onClick: function () { addOpt(pk); }, 'data-editor-addoption': pk.id }, M8W.addOption)] : line;
      }),
      !ro && newPick ? h(Fl, { chip: 'AUTOMATIC', k: M8W.newPick(pks.length + 1), field: 'pick', cls: 'ed-m8' },
        free.length ? h('div', { className: 'ed-inrow' }, h(Sel, { value: '', options: free, blankLabel: M8W.pickLineBlank, ro: ro, label: M8W.pickLine, field: 'pick_line', onChange: pickOnto })) : null,
        free.length ? null : h('div', { className: 'ed-hint' }, M8W.pickNoLine)) : null,
      ro ? null : h('button', { type: 'button', className: 'ed-addline', onClick: function () { setNewPick(true); }, 'data-editor-addpick': '1' }, M8W.addPick)) : null;
    var rollNums = rns.length ? h(Grp, { t: M8W.rollNumbers, aside: lines(rns.length, 'line', 'lines') },
      rns.map(function (rn, i) { return h(RollNumberLine, { key: 'r' + i, rn: rn, i: i, ro: ro, ranked: ranked, vocab: vocab, mk: isObj(rn.condition) ? mkFor('roll_numbers', i, 'condition') : null,
        rides: rn && rn.when && rn.when.ticked ? (arrOf(rec, 'target').map(function (t, j) { return t && t.id === rn.when.ticked ? ROW.targetK + (j + 1) : null; }).filter(Boolean)[0] || rn.when.ticked) : null,
        onChange: function (x) { setRow('roll_numbers', i, x); }, onRemove: function () { dropRow('roll_numbers', i); } }); }),
      ro ? null : h('button', { type: 'button', className: 'ed-addline', onClick: function () { addRow('roll_numbers', ranked ? { op: 'damage_delta', moment: 'check', amount: 1, per_rank: true } : { op: 'damage_delta', moment: 'check', amount: 1 }); }, 'data-editor-addrollnumber': '1' }, M8W.addRollNumber)) : null;
    // F-100 THE SURFACING MISSION (ADDENDUM 8 F13): the spend and strain lines, where the talent carries them
    var sps = arrOf(rec, 'spend'), tgs = arrOf(rec, 'target');
    var spendG = sps.length ? h(Grp, { t: ROW.spend, aside: lines(sps.length, 'line', 'lines') },
      sps.map(function (sp, i) { return h(SpendLine, { key: 's' + i, sp: sp, i: i, ro: ro, ranked: ranked, vocab: vocab, mk: mkFor('spend', i, 'words'),
        onChange: function (x) { setRow('spend', i, x); }, onRemove: function () { dropRow('spend', i); } }); })) : null;
    var targetG = tgs.length ? h(Grp, { t: ROW.target, aside: lines(tgs.length, 'line', 'lines') },
      tgs.map(function (t, i) {
        var riders = rns.map(function (rn, j) { return rn && rn.when && rn.when.ticked === t.id ? rowName('roll_numbers', rn, j) : null; }).filter(Boolean);
        return h(TargetLine, { key: 'g' + i, t: t, i: i, ro: ro, vocab: vocab, riders: riders, mk: mkFor('target', i, 'condition'),
          onChange: function (x) { setRow('target', i, x); }, onRemove: function () { dropRow('target', i); } }); })) : null;
    var items = ies.length ? h(Grp, { t: M8W.items, aside: lines(ies.length, 'line', 'lines') },
      ies.map(function (ie, i) { return h(ItemLine, { key: 'i' + i, ie: ie, i: i, ro: ro, pks: pks, hint: i === ies.length - 1 ? itemHint(rec) : null,
        onChange: function (x) { setRow('item_effects', i, x); }, onRemove: function () { dropRow('item_effects', i); } }); }),
      ro ? null : h('button', { type: 'button', className: 'ed-addline', onClick: addItemLine, 'data-editor-additem': '1' }, M8W.addItem)) : null;
    var vehicle = ves.length ? h(Grp, { t: M8W.vehicle, aside: lines(ves.length, 'line', 'lines') },
      ves.map(function (ve, i) { return h(VehicleLine, { key: 'v' + i, ve: ve, i: i, ro: ro, ranked: ranked, vocab: vocab, books: p.books, onChange: function (x) { setRow('vehicle_effects', i, x); }, onRemove: function () { dropRow('vehicle_effects', i); } }); }),
      ro ? null : h('button', { type: 'button', className: 'ed-addline', onClick: function () { addRow('vehicle_effects', ranked ? { op: 'armor_delta', amount: 1, per_rank: true } : { op: 'armor_delta', amount: 1 }); }, 'data-editor-addvehicle': '1' }, M8W.addVehicle)) : null;
    var text = h(Grp, { t: TW.text }, h(Fl, { chip: 'NARRATIVE', k: 'Description', field: 'description', bad: bad.description },
      h(MarkedArea, { value: rec.description, marks: marksOf(rec), ro: ro, label: 'Description', field: 'description', editing: editing, onEdit: function () { setEditing(true); },
        onSel: function (a, b) { setSel({ start: a, end: b }); }, onChange: function (v) { set('description', v); } })),
      tolds.map(function (t, i) { return h(ToldLine, { key: 't' + i, t: t, i: i, ro: ro, vocab: vocab, mk: mkFor('told', i, 'words'), onChange: function (x) { setRow('told', i, x); }, onRemove: function () { dropRow('told', i); } }); }));
    // B-1077 (D-411 item 6, as page v1 @ 291c0128b drew it): one "+ Add another kind of line" under the last group, opening
    // the OpMenu idiom with the M8 kinds the talent has none of; a pick starts as "+ Add a pick" starts one; Choices is
    // offered only when a line can carry a pick (`free`, the same lines "+ Add a pick" offers; D-412 item 3, page 2 §3 A)
    function startKind(k) {
      setKindMenu(false);
      if (k === 'picks') { setNewPick(true); return; }
      if (k === 'roll_numbers') { addRow(k, ranked ? { op: 'damage_delta', moment: 'check', amount: 1, per_rank: true } : { op: 'damage_delta', moment: 'check', amount: 1 }); return; }
      if (k === 'vehicle_effects') { addRow(k, ranked ? { op: 'armor_delta', amount: 1, per_rank: true } : { op: 'armor_delta', amount: 1 }); return; }
      var used = {}, n = 1; picksOf(rec).forEach(function (pk) { used[pk.id] = true; }); while (used['pick_' + n]) n++;
      // an item line names its item by a pick of kind item, Tinkerer's shape (the one item line the editor draws)
      addRow('item_effects', { op: 'hard_points_delta', item: { chosen: 'pick_' + n }, amount: 1,
        pick: { id: 'pick_' + n, kind: 'item', per: ranked ? 'rank' : 'talent', pool: { categories: ['weapon', 'armor', 'gear'] } } });
    }
    var kinds = [['roll_numbers', M8W.rollNumbers, !rns.length], ['picks', M8W.picks, !pks.length && !newPick && free.length > 0], ['item_effects', M8W.items, !ies.length], ['vehicle_effects', M8W.vehicle, !ves.length]]
      .filter(function (x) { return x[2]; });
    var another = ro || !kinds.length ? null : h('div', { style: { margin: '6px 0 18px' }, 'data-editor-anotherkind': '1' },
      h('button', { type: 'button', className: 'ed-addline', 'aria-expanded': kindMenu ? 'true' : 'false', 'aria-haspopup': 'listbox', onClick: function () { setKindMenu(!kindMenu); } }, M8W.addKind),
      kindMenu ? h('div', { className: 'ed-menu ed-opmenu', role: 'listbox', 'aria-label': M8W.kindHead(kinds.length) },
        h('div', { className: 'ed-oph' }, M8W.kindHead(kinds.length)),
        kinds.map(function (x) { return h('button', { type: 'button', key: x[0], role: 'option', 'aria-selected': 'false', className: 'ed-op', onClick: function () { startKind(x[0]); }, 'data-editor-kind': x[0] },
          h('span', { className: 'ed-opn' }, x[1])); })) : null);
    return [what, picks, numbers, dice, rollNums, spendG, targetG, items, vehicle, text, another].filter(Boolean).map(function (x, i) { return h('div', { key: i }, x); });
  }
  // ── the preview plate: the talent as the sheet draws it (F3 / F4 / U1a) — the rank tabs only where dice scale ──
  function TalentPlate(p) {
    var rec = p.rec, vocab = p.vocab;
    var _r = useState(1), rank = _r[0], setRank = _r[1];
    var effs = Array.isArray(rec.effects) ? rec.effects : [], pms = Array.isArray(rec.pool_mods) ? rec.pool_mods : [];
    var named = rec.name && String(rec.name).trim();
    if (!named && !effs.length && !pms.length && !M8ARRAYS.some(function (k) { return arrOf(rec, k).length; }) && !String(rec.description || '').trim())
      return h('div', { className: 'hp-plate', 'data-pad': 'read', 'data-editor-preview': 'talent' }, h('div', { className: 'ed-fk' }, TW.previewHead), h('p', { className: 'hp-prose', style: { margin: '4px 0 0' } }, TW.nothingYet));
    var tabs = rec.ranked && pms.length;
    var r = tabs ? rank : 1;
    var times = function (per) { return per ? r : 1; };
    var sheetLines = effs.filter(function (e) { return !isSkillOp(e); }).map(effRead);   // the book's own reading of each line ("+1 strain threshold (+1 per rank)"), as F4 / U1a draw it
    var anchor = pms.length ? anchorLabel(pms[0], vocab) : '';
    var roll = pms.map(function (d, i) {
      var c = d.count * times(rankedDice(d, !!rec.ranked));
      if (d.symbol) return h('span', { key: i }, i ? ' · ' : '', 'Add ', SYM_TOKEN[d.symbol] ? glyph('[' + SYM_TOKEN[d.symbol] + ']') : null, ' ' + d.symbol + ' ' + c);
      var verb = d.direction === 'remove' || d.direction === 'upgrade' || d.direction === 'downgrade' ? d.direction : 'add';   // F-100 M8 C3
      return h('span', { key: i }, i ? ' · ' : '', capf(verb) + ' ', DIE_TOKEN[d.die] ? glyph('[' + DIE_TOKEN[d.die] + ']') : null, ' ' + d.die + ' ' + c);
    });
    return h('div', { className: 'hp-plate', 'data-pad': 'read', 'data-editor-preview': 'talent' },
      h('div', { className: 'ed-fk' }, TW.previewHead),
      tabs ? h('div', { className: 'ed-ranks', role: 'group', 'aria-label': 'Try a rank' }, h('span', { className: 'ed-fk', style: { margin: 0 } }, 'Rank'),
        [1, 2, 3].map(function (n) { return h('button', { type: 'button', key: n, className: 'ed-rank', 'aria-pressed': rank === n ? 'true' : 'false', onClick: function () { setRank(n); } }, String(n)); }),
        h('span', { className: 'ed-fk', style: { margin: '0 0 0 auto' } }, 'Try a rank')) : null,
      h('div', { className: 'ed-tp' },
        h('div', { className: 'ed-tp-h' }, h('span', null, named ? rec.name : 'New talent'), rec.ranked ? h('span', { className: 'ed-tp-rank' }, 'Rank ' + r) : null),
        h('div', { className: 'ed-tp-b' },
          rec.description ? h('p', { className: 'hp-prose', style: { margin: 0 } }, glyph(rec.description)) : null,
          sheetLines.length ? h('div', { className: 'ed-tp-box' }, h('div', { className: 'ed-fk' }, 'On the sheet'), sheetLines.map(function (l, i) { return h('div', { key: i, className: 'ed-tp-l' }, l); })) : null,
          pms.length ? h('div', { className: 'ed-tp-box' }, h('div', { className: 'ed-fk' }, 'At the roll' + (anchor ? ' · ' + anchor : '')), h('div', { className: 'ed-tp-l' }, roll)) : null,
          // F-100 M8 R8: each M8 row's line, as the sheet draws it
          m8Preview(rec, vocab, r).map(function (x, i) { return h('div', { key: 'm8' + i, className: 'ed-tp-box', 'data-m8-preview': '1' }, h('div', { className: 'ed-fk' }, x[0]), h('div', { className: 'ed-tp-l' }, x[1])); }),
          h('span', { className: 'ed-tp-act' }, actLabel(rec.activation)))));
  }
  function TalentPeek(p) {
    var _o = useState(false), open = _o[0], setOpen = _o[1];
    return h('div', { className: 'ed-peek', 'data-editor-peek': open ? 'open' : 'closed' }, h('div', { className: 'ed-grab', 'aria-hidden': 'true' }),
      h('button', { type: 'button', className: 'ed-ph', 'aria-expanded': open, onClick: function () { setOpen(!open); } }, h('span', null, TW.previewHead), h('span', { className: 'ed-chev' }, open ? '▾' : '▴')),
      open ? h(TalentPlate, { rec: p.rec, vocab: p.vocab }) : h('div', { className: 'ed-rm', style: { marginTop: -4 } }, (p.rec.name || 'New talent') + ' · ' + actLabel(p.rec.activation)));
  }
  // C1.3: `effects` and `pool_mods` ALWAYS written ([] when empty); the name trimmed; the talent's required keys present
  // F-100 M8 (R-M8K-1): every row of every array carries a stable `id`; the save MINTS one for an id-less row (a pack
  // row written before M8, a line just added) and never renames one already there. The rule is the applier's back-fill
  // (scripts/canonical/apply_talent_effects.py `row_slug` / `backfill_ids`): the row's verb as a slug, `_2`, `_3`… on a
  // repeat in the record, in ROW_ARRAYS order — so a canonical record and its homebrew copy name a row the same way.
  var ROW_ARRAYS = ['effects', 'pool_mods', 'told', 'item_effects', 'vehicle_effects', 'roll_numbers', 'spend', 'target'];   // + the roll options (ADDENDUM 8)
  function rowSlug(arr, row) {
    var stem = arr === 'pool_mods' ? (row.direction || 'uncertified') + '_' + (row.die || row.symbol || 'die') : (row.op || arr.replace(/s$/, ''));
    return String(stem).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }
  function mintRowIds(r) {
    var used = {};
    ROW_ARRAYS.forEach(function (k) { (Array.isArray(r[k]) ? r[k] : []).forEach(function (row) { if (row && row.id) used[row.id] = true; }); });
    ROW_ARRAYS.forEach(function (k) {
      if (!Array.isArray(r[k])) return;
      r[k] = r[k].map(function (row) {
        if (!row || typeof row !== 'object' || row.id) return row;
        var stem = rowSlug(k, row).slice(0, 36) || 'row', id = stem, n = 1;
        while (used[id]) { n++; id = stem + '_' + n; }
        used[id] = true;
        return Object.assign({ id: id }, row);
      });
    });
    return r;
  }
  function normalizeTalent(rec) {
    var r = clone(rec);
    r.effects = Array.isArray(r.effects) ? r.effects : [];
    r.pool_mods = Array.isArray(r.pool_mods) ? r.pool_mods.map(function (d) { var n = clone(d); if (n.applies_to && !n.applies_to.length) n.applies_to = null; return n; }) : [];
    r.name = typeof r.name === 'string' ? r.name.trim() : '';
    if (!r.name) delete r.name;
    r.description = typeof r.description === 'string' ? r.description : '';
    r.ranked = !!r.ranked; r.activation = r.activation || 'passive';
    return mintRowIds(r);
  }
  // U12's refusal: the editor's two checks (the ruled words), then the store's own reasons
  function talentCheck(rec) {
    var w = [], bad = {};
    if (!rec.name || !String(rec.name).trim()) { w.push(TW.giveName); bad.name = true; }
    if (!(rec.effects || []).length && !(rec.pool_mods || []).length && !M8ARRAYS.some(function (k) { return arrOf(rec, k).length; }) && !String(rec.description || '').trim()) w.push(TW.addSomething);
    return w.length ? { words: w, bad: bad } : null;
  }
  function blankTalent() { return { name: '', activation: 'passive', ranked: false, description: '', effects: [], pool_mods: [] }; }

  // ── U13 THE SPECIALIZATIONS SHELF: F2's pattern — yours first, then by career A–Z with Universal last; the first three careers
  // open, the rest one line each; no "Start from blank" (a new specialization is always a copy, C2.2 / STOP-9) ──
  var SHOWN_CAREERS = 3;
  // a specialization's career is the career that LISTS it (careers.json `specializations`); a universal one, or one no career lists, is Universal.
  // An own derive reads its book record's career.
  var careerCache = null;
  function careerOfSpec(books, id) {
    var cr = books.sections.careers || {};
    if (!careerCache || careerCache.cr !== cr) {
      var m = {}; Object.keys(cr).forEach(function (cid) { (cr[cid].specializations || []).forEach(function (sid) { if (!m[sid]) m[sid] = cr[cid].name || capf(cid); }); });
      careerCache = { cr: cr, m: m };
    }
    return careerCache.m[id] || null;
  }
  function specRow(rec, books, baseId) {
    var cname = rec.universal ? 'Universal' : (careerOfSpec(books, rec.id) || (baseId && careerOfSpec(books, baseId)) || 'Universal');
    return { id: rec.id, name: rec.name || rec.id, career: cname, universal: cname === 'Universal', book: booksOf(rec)[0] || '' };
  }
  function SpecShelf(p) {
    var books = p.books, wide = p.wide, store = p.store, sec = 'specializations';
    var _q = useState(''), q = _q[0], setQ = _q[1];
    var _s = useState('all'), show = _s[0], setShow = _s[1];
    var _o = useState({}), open = _o[0], setOpen = _o[1];
    var t = books.sections[sec] || {};
    var rows = Object.keys(t).map(function (id) { return specRow(t[id], books); }).sort(function (a, b) { return a.name.localeCompare(b.name); });
    var total = rows.length;
    var yours = yoursOf(sec, books, store).map(function (y) { var r = specRow(y.rec, books, y.baseId); r.y = y; return r; });
    var ys = yours.filter(function (r) { return matchQ(r.name, q); });
    var by = {}; rows.filter(function (r) { return matchQ(r.name, q); }).forEach(function (r) { (by[r.career] = by[r.career] || []).push(r); });
    var careers = Object.keys(by).sort(function (a, b) { return (a === 'Universal') - (b === 'Universal') || a.localeCompare(b); });
    var filtering = !!q;
    var shown = show !== 'all' ? [] : careers.filter(function (c, i) { return filtering || open[c] || i < SHOWN_CAREERS; });
    var closed = show !== 'all' || filtering ? [] : careers.filter(function (c, i) { return !open[c] && i >= SHOWN_CAREERS; });
    var openRec = function (r) { r.y ? p.go(recRoute(sec, r.y.ck, r.y.id)) : p.go({ view: 'record', shelf: sec, id: r.id }); };
    var row = function (r) {
      return h('button', { type: 'button', className: 'ed-irow', key: (r.y ? r.y.ck + ':' : '') + r.id, onClick: function () { openRec(r); }, 'data-editor-row': r.id },
        h('div', { className: 'ed-rb' }, h('div', { className: 'ed-rn', 'data-yours': r.y ? '1' : undefined }, r.name),
          h('div', { className: 'ed-rm' }, r.y ? r.career : r.career + (r.book ? ' · ' + r.book : '')),
          r.y ? h('div', { className: 'ed-rm', style: { color: 'var(--doc-action)' } }, 'Yours · ' + yoursLine(r.y)) : null),
        h('span', { className: 'ed-chev', 'aria-hidden': 'true' }, '›'));
    };
    var search = h('label', { className: 'ed-search', style: { marginTop: 14, maxWidth: wide ? 640 : undefined } },
      h('input', { type: 'search', value: q, placeholder: 'Search ' + num(total) + ' specializations', 'aria-label': 'Search specializations', onChange: function (e) { setQ(e.target.value); }, 'data-editor-search': '1' }),
      h('span', { className: 'ed-k', 'aria-hidden': 'true' }, '⌕'));
    var toggles = h('div', { className: 'ed-btnrow', style: { marginTop: 10 } },
      h('button', { type: 'button', className: 'hp-quiet', 'data-on': show === 'all' ? '1' : undefined, 'aria-pressed': show === 'all', onClick: function () { setShow('all'); } }, 'All ' + num(total)),
      h('button', { type: 'button', className: 'hp-quiet', 'data-on': show === 'yours' ? '1' : undefined, 'aria-pressed': show === 'yours', onClick: function () { setShow('yours'); }, 'data-editor-yours': '1' }, 'Yours ' + yours.length));
    var list = [
      ys.length ? [h(Sechead, { t: 'Yours', aside: String(ys.length), key: 'ys' }), h('div', { className: 'hp-plate ed-stock', 'data-pad': 'data', key: 'yp' }, h('div', { className: 'hp-bands', 'data-run': '1' }, ys.map(row)))] : null,
      show === 'yours' && !yours.length ? h('div', { className: 'hp-plate', 'data-pad': 'read', key: 'empty', style: { marginTop: 14 }, 'data-editor-empty': '1' },
        h('div', { className: 'ed-empty' }, h('p', null, IW.empty(total, 'specializations')))) : null,
      filtering && !ys.length && !shown.length ? h('p', { className: 'ed-hint', role: 'status', key: 'nm', style: { marginTop: 14 } }, IW.noMatch(q)) : null,
      shown.map(function (c) { return [h(Sechead, { t: c, aside: String(by[c].length), key: 'h' + c }), h('div', { className: 'hp-plate ed-stock', 'data-pad': 'data', key: 'p' + c }, h('div', { className: 'hp-bands', 'data-run': '1' }, by[c].map(row)))]; }),
      closed.length ? [h(Sechead, { t: 'More careers', aside: String(closed.length), key: 'mh' }), h('div', { className: 'hp-plate ed-stock', 'data-pad': 'data', key: 'mp' }, closed.map(function (c) {
        return h('button', { type: 'button', className: 'ed-grow', key: c, onClick: function () { var o = Object.assign({}, open); o[c] = true; setOpen(o); } }, h('span', null, c), h('b', null, by[c].length + ' ›'));
      }))] : null];
    var head = [h(Runhead, { back: 'Homebrew', right: 'Specializations · ' + num(total), onBack: function () { p.go({ view: 'home' }); }, key: 'rh' }), h(Banner, { status: store.status, key: 'bn' }),
      h('div', { className: 'hp-maker', key: 'mk' }, 'Shelf'), h('h1', { className: 'hp-desig', key: 'dg' }, 'Specializations')];
    if (!wide) return h('div', { className: 'ed-pad' }, head, search, toggles, list);
    var railBtn = function (key, lbl, n, on, click) { return h('button', { type: 'button', className: 'ed-cat', key: key, 'aria-pressed': on ? 'true' : 'false', onClick: click }, lbl, h('b', null, num(n))); };
    return h('div', { className: 'ed-shelfgrid' },
      h('nav', { className: 'ed-rail', 'aria-label': 'Shelves' }, h('h4', null, 'Shelves'), shelfRail(p, sec),
        h('h4', null, 'Show'), railBtn('all', 'All', total, show === 'all', function () { setShow('all'); }), railBtn('yours', 'Yours', yours.length, show === 'yours', function () { setShow('yours'); })),
      h('div', { className: 'ed-desk', style: { paddingTop: 18, minWidth: 0, maxWidth: 900 } }, head, search, toggles, list));
  }

  // ══ M9 — THE SPECIES SHELF AND FORM (ruling f100-m9-build-card steps 8–9, ADDENDUM 1 R-M9B-6 and ADDENDUM 2 R-M9B-8..10; the
  // approved frames F1–F3 @ 9edd6618, DECISIONS D-125/D-126). A species ability's chip, and any chip group, filter or count on
  // this shelf, read the ability's rows (CHIPW). (The species rules' key and its OFF shelf — one "In the books" A–Z group — were
  // deleted at release-r7-bug-burndown ADDENDUM 638; this is the shelf live always drew.) ══
  var SW = {
    abilities: function (n) { return n + ' ' + plural(n, 'ability', 'abilities'); },
    chars: 'Characteristics', startChars: 'Starting characteristics', thresholds: 'Thresholds and XP', wound: 'Wound threshold', strain: 'Strain threshold',
    xp: 'Starting XP', plusBrawn: '+ Brawn', plusWill: '+ Willpower', abilitiesH: 'Abilities', ability: function (i) { return 'Ability ' + i; }, text: 'Text',
    carried: 'carried', carriedFrom: function (nm) { return 'Carried from ' + nm; },
    carriedHint: 'These come with the copy, as the book has them. They can’t be changed here yet.',   // F3, verbatim
    boughtOff: 'Bought off at creation', boughtHint: 'Bought off, this ability and its lines leave the sheet together.',   // F3b, verbatim
    freeSkill: 'Free skill', freeSkills: 'Free skills', freeTalent: 'Free talent', choice: function (nm) { return 'Choice · ' + nm; },
    preview: 'Preview · the species block', wounds: function (w, s, x) { return 'Wounds ' + w + ' · Strain ' + s + ' · XP ' + x; },
    noAbilities: 'This species has no abilities in the books.',
    newFrom: function (nm) { return 'Species · new, from ' + nm; },                                    // F3 / F6, verbatim
    // F-100 M10 F6 (B-1201; f100-m10-editor-card R-M10E-6, D-141 K4 (a), K5 (a)), verbatim
    addFrom: function (n) { return '+ Add from any species · ' + num(n); }, pickHead: 'Add an ability from any species',
    pickSearch: function (n) { return 'Search ' + num(n) + ' species'; }, addB: 'Add',
    rmAbility: 'Remove this ability', hasAlready: function (nm) { return 'This species already has ' + nm + '.'; },
    twoCalled: function (nm) { return 'Two abilities are called ' + nm + '. Rename one.'; },   // B-1227, drawn on K4 (b); DISCLOSED (the rename path)
    noAbilitiesYet: 'No abilities yet.',                                                        // B-1228, F3's "No upgrades yet." pattern; DISCLOSED
    // ── implementer's chrome words (undrawn; each listed in the gate for the architect's review) ──
    needChars: 'Give every characteristic a number of 1 or more.', needNum: function (l) { return 'Give it a ' + l.toLowerCase() + '.'; },
    needAbilityName: 'Give every ability a name.',
    delNew: function (nm, n) { return 'Delete ' + nm + '? ' + owners(n, 'have it') + (n ? ' They can still be played, but its abilities do nothing.' : ''); },
    delRedef: function (nm, n) { return 'Delete your change to ' + nm + '? ' + (n ? owners(n, 'have ' + nm) + ' They go back to the book’s ' + nm + '.' : 'No character has it.'); }
  };
  // a row's First ability is the ability's name and its text, cut at 150 characters as F2 draws it
  function speciesRow(rec) {
    var ab = Array.isArray(rec.special_abilities) ? rec.special_abilities : [];
    var a0 = ab[0], chips = speciesChips(rec);
    return { id: rec.id, name: rec.name || rec.id, n: ab.length, xp: rec.starting_xp, book: booksOf(rec)[0] || '', chips: chips, key: chips[0] || 'No rules',
             first: a0 ? (a0.name || '') + (a0.description ? ' · ' + a0.description : '') : '' };
  }
  var speciesCache = null;
  function speciesRowsOf(books) {
    var t = books.sections && books.sections.species; if (!t) return [];
    if (speciesCache && speciesCache.t === t) return speciesCache.rows;
    var rows = Object.keys(t).map(function (id) { return speciesRow(t[id]); }).sort(function (a, b) { return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || a.book.localeCompare(b.book); });
    speciesCache = { t: t, rows: rows }; return rows;
  }
  // ── the row editor and chip (R-M9B-1; ADDENDUM 14 R-M9B-46..48) ──
  // an ability's chip is a reading of its rows, the first of AUTOMATIC > SITUATIONAL > NARRATIVE (none: NARRATIVE); a species'
  // chips are its abilities', in that order; a species with no abilities groups under F2's "No rules" (R-M9B-48)
  var SP_GROUPS = ['AUTOMATIC', 'SITUATIONAL', 'NARRATIVE', 'No rules'];
  function abilityChip(a) { return talentChips(a)[0] || 'NARRATIVE'; }
  function speciesChips(rec) {
    var have = {}; (Array.isArray(rec.special_abilities) ? rec.special_abilities : []).forEach(function (a) { if (isObj(a)) have[abilityChip(a)] = true; });
    return TCOL.filter(function (c) { return have[c]; });
  }
  // R-M9B-46, ONE key-blind save rule: a row holds while every span it carries (`words`, a span `condition`) passes spanOk
  // over its own ability's text
  // ADDENDUM 4 R-SPF-15 (3) (`f100-surfacing-preflip-species-card`): a row's `unless` (R-SPF-1) is a span over the NAMED SIBLING's
  // current text (`abl`: the record's abilities), so it holds only while that recomputes, else the row drops at save as a stale
  // `words` span does (R-M9B-46's one key-blind rule; never the row kept with its unless dropped, which would apply it silently)
  function rowHolds(desc, row, abl) {
    return isObj(row) && spanHolds(desc, row.words) && (!isObj(row.condition) || spanHolds(desc, row.condition)) && (!isObj(row.unless) || unlessHolds(row.unless, abl));
  }
  function unlessHolds(u, abl) {
    var sib = (Array.isArray(abl) ? abl : []).filter(function (x) { return isObj(x) && x.name === u.ability; });
    return sib.length === 1 && spanHolds(sib[0].description, u.words);
  }
  // R-M9B-47: a new line's `words` is the whole ability text (trimmed bounds, hash included); no text, no line
  function newSpeciesRow(k, desc) {
    var d = String(desc || ''), w = spanFrom(d, { start: 0, end: d.length });
    if (!w) return null;
    var row = k === 'effects' ? { op: 'encumbrance_threshold_delta', amount: 1 } : k === 'pool_mods' ? { die: 'boost', count: 1, direction: 'add', applies_to: null, condition: null }
      : k === 'roll_numbers' ? { op: 'damage_delta', moment: 'check', amount: 1 } : {};
    row.words = w;
    return row;
  }
  // the text's marks, as F3 draws them: each row's span condition, else its words (only spans that hold)
  function spMarks(a) {
    var out = [];
    SPECIES_ROW_ARRAYS.forEach(function (k) { arrOf(a, k).forEach(function (row) { var sp = row && (isObj(row.condition) ? row.condition : row.words); if (isObj(sp) && spanOk(a.description, sp)) out.push(sp); }); });
    return out.sort(function (x, y) { return x.start - y.start; });
  }
  // "Upgrade the difficulty once on checks involving advanced technology, offered at the roll" (F3): a span condition is read
  // in its own words where the line names no checks; a cost reads "for 2 strain"
  function spDiceRead(d, desc, vocab) {
    var verb = d.direction === 'upgrade' || d.direction === 'downgrade', n = d.count === 'all' ? 'all' : d.count;
    var anc = (Array.isArray(d.applies_to) ? d.applies_to : []).filter(function (a) { return a && a.scope !== 'all'; });
    var cond = isObj(d.condition) && spanOk(desc, d.condition) ? String(desc).slice(d.condition.start, d.condition.end) : typeof d.condition === 'string' ? d.condition : '';
    var body = verb ? capf(d.direction) + ' the ' + (d.die === 'difficulty' || d.die === 'challenge' ? 'difficulty' : 'ability') + ' ' + (d.count === 1 ? 'once' : n + ' times')
      : (d.direction === 'remove' ? 'Remove ' : 'Add ') + n + ' ' + d.die;
    var where = anc.length ? ' on ' + joinList(anc.map(function (a) { return anchorName(a, vocab); }), 'and') + ' checks' : cond ? (verb ? ' on checks ' : ' ') + cond : ' on every check';
    var cost = d.cost ? ', for ' + (subCost(d.cost) || 'a cost') : '';
    return body + where + cost + (d.limit ? ', ' + String(d.limit).replace(/_/g, ' ') : '') + (d.condition || d.cost || d.limit ? ', offered at the roll' : '');
  }
  // a dice count that may read "All" on a remove line (R-M9S-6); a typed prefix is held until it is a number or "all"
  function CountIn(p) {
    var _t = useState(null), t = _t[0], setT = _t[1];
    var shown = t != null ? t : p.value === 'all' ? 'All' : p.value == null ? '' : String(p.value);
    return h('input', { className: 'ed-inp ed-num', inputMode: 'text', value: shown, readOnly: p.ro, 'aria-label': p.label, 'data-editor-input': p.field, onBlur: function () { setT(null); },
      onChange: function (e) { var v = e.target.value, x = v.trim(); setT(v); if (p.all && /^all$/i.test(x)) p.onChange('all'); else if (/^[0-9]+$/.test(x) && +x > 0) p.onChange(parseInt(x, 10)); } });
  }
  // "Number on the sheet": the three sheet numbers a species row moves (the dark readers' ops, R-M9B-48)
  var SP_EFF_OPS = [['encumbrance_threshold_delta', 'Encumbrance threshold'], ['starting_credits_delta', 'Starting credits'], ['defense_delta', 'Defense']];
  var SP_EFFLAB = { encumbrance_threshold_delta: 'Encumbrance threshold', starting_credits_delta: 'Starting credits' };
  function spSigned(e) { return e.op === 'starting_credits_delta' ? (e.amount < 0 ? '−' + num(-e.amount) : '+' + num(e.amount)) : signed(e.amount); }
  function spEffLabel(e) { return e.op === 'defense_delta' ? effLabel(e) : SP_EFFLAB[e.op] || e.op; }
  function spEffRead(e) {
    if (e.op === 'starting_credits_delta') return spSigned(e) + ' starting credits';
    if (e.op === 'encumbrance_threshold_delta') return 'Encumbrance threshold ' + spSigned(e);
    if (e.op === 'defense_delta') return spSigned(e) + ' ' + (e.target === 'melee' ? 'melee' : 'ranged') + ' defense';
    return spSigned(e) + ' ' + e.op;
  }
  function SpEffectLine(p) {
    var e = p.e, ro = p.ro;
    var _m = useState(false), menu = _m[0], setMenu = _m[1];
    function set(k, v) { var n = clone(e); if (v === undefined) delete n[k]; else n[k] = v; p.onChange(n); }
    function pick(op) {
      var n = clone(e); n.op = op; if (op === 'defense_delta') n.target = e.target === 'melee' ? 'melee' : 'ranged'; else delete n.target;
      setMenu(false); p.onChange(n);
    }
    var label = spEffLabel(e) + ' ' + spSigned(e);
    return h(Fl, { chip: chipOf(EC() ? EC().classOfEffect(e) : 'resolves'), k: 'Number on the sheet ' + (p.i + 1), field: 'effects' },
      h('div', { className: 'ed-inrow' },
        h('button', { type: 'button', className: 'ed-inp ed-opsel', disabled: ro, 'aria-haspopup': 'listbox', 'aria-expanded': menu ? 'true' : 'false', 'data-on': menu ? '1' : undefined,
          onClick: function () { setMenu(!menu); }, 'data-editor-input': 'op' }, h('b', null, spEffLabel(e)), h('span', { className: 'ed-dd', 'aria-hidden': 'true' }, '▾')),
        h(SignedIn, { value: e.amount, plus: true, group: e.op === 'starting_credits_delta', ro: ro, label: 'Amount', field: 'amount', onChange: function (v) { if (v) set('amount', v); } })),
      menu ? h(OpMenu, { ops: SP_EFF_OPS, value: e.op, onPick: pick }) : null,
      e.op === 'defense_delta' ? h('div', { className: 'ed-inrow' }, h(Sel, { value: e.target || 'ranged', blank: false, ro: ro, label: 'Which defense', field: 'target', options: [['melee', 'Melee'], ['ranged', 'Ranged']], onChange: function (v) { set('target', v); } })) : null,
      p.mb[0], h('div', { className: 'ed-fmt' }, spEffRead(e)), p.mb[1],
      ro ? null : h('div', { className: 'ed-lineacts' }, h('span'), h('button', { type: 'button', className: 'ed-addline ed-rm-act', onClick: p.onRemove, 'aria-label': TW.rmNumber(label) }, TW.rmNumber(label))));
  }
  // the four "+ Add …" buttons under an ability, in F3's order
  var SP_ADDS = [['effects', '+ Add a number'], ['pool_mods', '+ Add dice'], ['roll_numbers', '+ Add a number at the roll'], ['told', '+ Show words only']];
  // one drawn line per row: number, dice, roll number, TOLD (a SKILL op draws as the talent form draws it: a substitute as
  // "Use another skill", career_skill / skill_characteristic as nothing)
  var SP_DRAW = ['effects', 'pool_mods', 'roll_numbers', 'told'];
  // the preview's lines, as F3's preview draws them → [text]
  function spPreview(a, vocab) {
    var out = [];
    arrOf(a, 'effects').forEach(function (e) { if (!isSkillOp(e)) out.push('On the sheet: ' + spEffRead(e)); });
    arrOf(a, 'pool_mods').forEach(function (d) {
      var anc = (Array.isArray(d.applies_to) ? d.applies_to : []).filter(function (x) { return x && x.scope !== 'all'; });
      var r = spDiceRead(Object.assign({}, d, { applies_to: null, condition: null, cost: null, limit: null }), a.description, vocab).replace(/ on every check$/, '');
      out.push('At the roll · ' + (anc.length ? anc.map(function (x) { return anchorName(x, vocab); }).join(', ') : 'every check') + ': ' + r.charAt(0).toLowerCase() + r.slice(1) + (d.condition || d.cost || d.limit ? ', offered' : ''));
    });
    arrOf(a, 'roll_numbers').forEach(function (rn) {
      var anc = Array.isArray(rn.applies_to) ? rn.applies_to : [], head = 'At the roll' + (anc.length ? ' · ' + attackWords(anc, vocab).join(', ') : '') + ': ';
      out.push(head + (rn.op === 'crit_rating_set' ? 'Critical rating set to ' + rn.amount : rn.op === 'damage_delta' && !isObj(rn.amount) ? signed(rn.amount) + ' damage to one hit' : rnRead(rn, vocab)));
    });
    if (!out.length) out.push('Shown on the sheet as text');
    return out;
  }
  // ── F2 THE SPECIES SHELF: yours above the book's; the book's as one A–Z group (R-M9B-8); no Start from blank (NO_BLANK) ──
  function SpeciesShelf(p) {
    var books = p.books, wide = p.wide, store = p.store, sec = 'species';
    var _q = useState(''), q = _q[0], setQ = _q[1];
    var _s = useState('all'), show = _s[0], setShow = _s[1];
    // F2 as drawn (R-M9B-8's flip state): the four chip groups, the "What it does" column and rail, a chip filter
    var _c = useState(null), cls = _c[0], setCls = _c[1];
    var _g = useState({}), opened = _g[0], setOpened = _g[1];
    var rows = speciesRowsOf(books), total = rows.length, per = 4;
    var yours = yoursOf(sec, books, store).map(function (y) { var r = speciesRow(y.rec); r.y = y; return r; });
    var match = function (r) { return matchQ(r.name, q) && (!cls || r.key === cls); };
    var ys = yours.filter(match);
    var book = show === 'all' ? rows.filter(match) : [];
    var filtering = !!q || !!cls;
    var groups = SP_GROUPS.map(function (k) { return { key: k, rows: book.filter(function (r) { return r.key === k; }) }; }).filter(function (g) { return g.rows.length; });
    var gList = function (g) { return filtering || opened[g.key] ? g.rows : g.rows.slice(0, per); };
    var gMore = function (g, k, wideBtn) {
      return !filtering && !opened[g.key] && g.rows.length > per ? h('button', { type: 'button', className: 'ed-addline', key: k, style: wideBtn ? { margin: 0 } : undefined,
        onClick: function () { var o = Object.assign({}, opened); o[g.key] = true; setOpened(o); }, 'data-editor-showall': sec + ':' + g.key }, 'Show all ' + num(g.rows.length) + ' ›') : null;
    };
    var chipsEl = function (a) { return h('span', { className: 'ed-chips' }, a.map(function (c) { return h(Chip, { c: c, key: c }); })); };
    var openBook = function (r) { p.go({ view: 'record', shelf: sec, id: r.id }); };
    var openYours = function (r) { p.go(recRoute(sec, r.y.ck, r.y.id)); };
    var open = function (r, y) { y ? openYours(r) : openBook(r); };
    var search = h('label', { className: 'ed-search', style: { marginTop: 14, maxWidth: wide ? 640 : undefined } },
      h('input', { type: 'search', value: q, placeholder: 'Search ' + num(total) + ' species', 'aria-label': 'Search species', onChange: function (e) { setQ(e.target.value); }, 'data-editor-search': '1' }),
      h('span', { className: 'ed-k', 'aria-hidden': 'true' }, '⌕'));
    var emptyYours = show === 'yours' && !yours.length ? h('div', { className: 'hp-plate', 'data-pad': 'read', style: { marginTop: 14 }, 'data-editor-empty': '1' },
      h('div', { className: 'ed-empty' }, h('p', null, IW.empty(total, 'species')))) : null;
    var nothing = !emptyYours && filtering && !ys.length && !book.length ? h('p', { className: 'ed-hint', role: 'status', style: { marginTop: 14 } }, IW.noMatch(q || cls)) : null;
    var rh = h(Runhead, { back: 'Homebrew', right: 'Species · ' + num(total), onBack: function () { p.go({ view: 'home' }); } });
    if (!wide) {
      var nrow = function (r, y) {
        return h('button', { type: 'button', className: 'ed-irow', key: (y ? r.y.ck + ':' : '') + r.id, onClick: function () { open(r, y); }, 'data-editor-row': r.id },
          h('div', { className: 'ed-rb' }, h('div', { className: 'ed-rn', 'data-yours': y ? '1' : undefined }, r.name),
            h('div', { className: 'ed-rm' }, SW.abilities(r.n) + ' · ' + r.xp + ' XP'),
            y ? h('div', { className: 'ed-rm', style: { color: 'var(--doc-action)' } }, 'Yours · ' + yoursLine(r.y)) : h('div', { className: 'ed-rm' }, r.book)),
          chipsEl(r.chips));
      };
      return h('div', { className: 'ed-pad' }, rh, h(Banner, { status: store.status }), h('div', { className: 'hp-maker' }, 'Shelf'), h('h1', { className: 'hp-desig' }, 'Species'), search,
        h('div', { className: 'ed-btnrow', style: { marginTop: 10 } },
          h('button', { type: 'button', className: 'hp-quiet', 'data-on': show === 'all' ? '1' : undefined, 'aria-pressed': show === 'all', onClick: function () { setShow('all'); } }, 'All ' + num(total)),
          h('button', { type: 'button', className: 'hp-quiet', 'data-on': show === 'yours' ? '1' : undefined, 'aria-pressed': show === 'yours', onClick: function () { setShow('yours'); }, 'data-editor-yours': '1' }, 'Yours ' + yours.length)),
        emptyYours, nothing,
        ys.length ? [h(Sechead, { t: 'Yours', aside: String(ys.length), key: 'ys' }), h('div', { className: 'hp-plate ed-stock', 'data-pad': 'data', key: 'yp' }, h('div', { className: 'hp-bands', 'data-run': '1' }, ys.map(function (r) { return nrow(r, true); })))] : null,
        groups.map(function (g) {
          return [h(Sechead, { t: g.key, aside: num(g.rows.length), key: 'h' + g.key }),
            h('div', { className: 'hp-plate ed-stock', 'data-pad': 'data', key: 'p' + g.key, 'data-editor-group': g.key }, h('div', { className: 'hp-bands', 'data-run': '1' }, gList(g).map(function (r) { return nrow(r, false); })), gMore(g, 'm', false))];
        }));
    }
    var ncol = 6;
    var tr = function (r, y) {
      return h('tr', { className: 'ed-tr', key: (y ? r.y.ck + ':' : '') + r.id, onClick: function () { open(r, y); }, 'data-editor-row': r.id },
        h('td', { className: 'ed-nm', style: y ? { color: 'var(--doc-action)' } : undefined },
          h('button', { type: 'button', className: 'ed-link ed-rowname', onClick: function (e) { e.stopPropagation(); open(r, y); } }, r.name),
          y ? [' ', h('span', { className: 'ed-yours', key: 'y' }, 'yours'), h('div', { className: 'ed-rm', key: 'm', style: { fontWeight: 400, fontSize: 13, color: 'var(--doc-action)' } }, yoursLine(r.y))] : null),
        h('td', null, r.chips.length ? chipsEl(r.chips) : IW.none),
        h('td', { className: 'ed-mono' }, String(r.n)), h('td', { className: 'ed-mono' }, r.xp == null ? IW.none : String(r.xp)),
        h('td', { className: 'ed-first' }, r.first ? glyph(r.first.slice(0, 150)) : IW.none), h('td', { className: 'ed-bk' }, y ? '' : r.book));
    };
    var grpRow = function (key, text) { return h('tr', { className: 'ed-grp', key: key }, h('td', { colSpan: ncol }, h('div', { className: 'ed-grpbtn', style: { cursor: 'default' } }, text))); };
    var body = [];
    if (ys.length) { body.push(grpRow('gy', 'Yours · ' + ys.length)); ys.forEach(function (r) { body.push(tr(r, true)); }); }
    groups.forEach(function (g) {
      body.push(grpRow('g' + g.key, g.key + ' · ' + num(g.rows.length)));
      gList(g).forEach(function (r) { body.push(tr(r, false)); });
      var m = gMore(g, 'm', true); if (m) body.push(h('tr', { key: 'm' + g.key }, h('td', { colSpan: ncol }, m)));
    });
    var railBtn = function (key, lbl, n, on, click) { return h('button', { type: 'button', className: 'ed-cat', key: key, 'aria-pressed': on ? 'true' : 'false', onClick: click }, lbl, h('b', null, num(n))); };
    var railEl = h('nav', { className: 'ed-rail', 'aria-label': 'Shelves' }, h('h4', null, 'Shelves'), shelfRail(p, sec),
      h('h4', null, 'Show'), railBtn('all', 'All', total, show === 'all', function () { setShow('all'); }), railBtn('yours', 'Yours', yours.length, show === 'yours', function () { setShow('yours'); }),
      [h('h4', { key: 'wh' }, 'What it does'), SP_GROUPS.map(function (c) {
        return railBtn(c, c === 'No rules' ? c : h(Chip, { c: c }), rows.filter(function (r) { return r.key === c; }).length, cls === c, function () { setCls(cls === c ? null : c); });
      })]);
    return h('div', { className: 'ed-shelfgrid' }, railEl,
      h('div', { className: 'ed-desk', style: { paddingTop: 18, minWidth: 0 } }, rh, h(Banner, { status: store.status }),
        h('div', null, h('div', { className: 'hp-maker' }, 'Shelf'), h('h1', { className: 'hp-desig' }, 'Species')),
        search, emptyYours, nothing,
        body.length ? h('div', { className: 'hp-plate ed-stock', 'data-pad': 'data', style: { marginTop: 14 } },
          h('table', { className: 'ed-tbl', 'data-editor-table': sec }, h('thead', null, h('tr', null, h('th', null, 'Species'), h('th', null, 'What it does'), h('th', null, 'Abilities'), h('th', null, 'XP'), h('th', null, 'First ability'), h('th', null, 'Book'))),
            edBands(body))) : null));
  }

  // ── F3 THE SPECIES FORM (step 9; R-M9B-1, R-M9B-10): Characteristics · Thresholds and XP · Abilities (name and text; a buyout
  // read-only, F3b) · CARRIED (read-only). The ability chip, the row editor and the "+ Add …" row controls read or write the
  // rows, so they ride the DARK key: drawn only with it ON (ADDENDUM 14). No "+ Add from any species" and no add/remove ability
  // (B-1201, R-M9B-10). ──
  var SP_CHARS = ['brawn', 'agility', 'intellect', 'cunning', 'willpower', 'presence'];
  var SP_ABBR = { brawn: 'Br', agility: 'Ag', intellect: 'Int', cunning: 'Cun', willpower: 'Will', presence: 'Pr' };
  var POOLW = { non_career: 'non-career skills', career: 'career skills' };
  function rankWords(s) { return 'rank ' + (s.rank_start || 1) + ' at creation' + (s.rank_limit ? ', up to rank ' + s.rank_limit : ''); }
  function carriedRows(rec, books, vocab) {
    var out = [], T = (books.sections && books.sections.talents) || {};
    (rec.starting_skills || []).forEach(function (s) { out.push(['AUTOMATIC', SW.freeSkill, skillLabel(s.skill, vocab) + ' · ' + rankWords(s)]); });
    (rec.skill_choice_grants || []).forEach(function (g) {
      out.push(['AUTOMATIC', SW.freeSkills, 'Choose ' + g.count + ' ' + (POOLW[g.pool] || 'skills') + '; each starts at rank 1' + (g.rank_cap ? ', up to rank ' + g.rank_cap : '')]);
    });
    // the Cerean's Intellectuals (`f100-cerean-intellectuals-card` R-CI-5, wording ruled at ADDENDUM 7): career STATUS chosen
    // in the creator, no rank — the group's pool in the editor's own words
    (rec.career_skill_choice_grants || []).forEach(function (g) {
      var noun = Array.isArray(g.pool) ? joinList(g.pool.map(function (id) { return skillLabel(id, vocab); }), 'or') : (POOLW[g.pool] || capf(String(g.pool)) + ' skills');
      out.push(['AUTOMATIC', 'Career skills', 'Choose ' + g.count + ' ' + noun + ' as career skills · picked in the creator']);
    });
    (rec.starting_talents || []).forEach(function (t) { out.push(['AUTOMATIC', SW.freeTalent, ((T[t.talent] && T[t.talent].name) || t.talent) + (t.ranks > 1 ? ' · ' + t.ranks + ' ranks' : '')]); });
    var bf = rec.bonus_free_ranks;
    if (isObj(bf) && (bf.career || bf.spec)) out.push(['AUTOMATIC', 'Free ranks', [bf.career ? bf.career + ' more career skill ' + plural(bf.career, 'rank', 'ranks') : null,
      bf.spec ? bf.spec + ' more specialization skill ' + plural(bf.spec, 'rank', 'ranks') : null].filter(Boolean).join(', ') + ' at creation']);
    (rec.option_choices || []).forEach(function (o) {
      out.push(['AUTOMATIC', SW.choice(o.display_name || o.name), joinList((o.options || []).map(function (x) { return x.name; }), 'or') + ' · picked in the creator']);
    });
    return out;
  }
  function RoField(p) {
    return h('textarea', { className: 'ed-inp', readOnly: true, rows: 1, value: p.value, 'aria-label': p.label, style: { fieldSizing: 'content', resize: 'none', minHeight: 0 }, 'data-editor-carried': p.field });
  }
  function SpeciesBody(p) {
    var rec = p.rec, ro = p.ro, vocab = p.vocab, books = p.books;
    var ch = isObj(rec.characteristics) ? rec.characteristics : {};
    // key ON (R-M8EV-3's idiom): the ability whose text is being edited, and the last selection in it
    var _e = useState(-1), editing = _e[0], setEditing = _e[1];
    var _s = useState(null), sel = _s[0], setSel = _s[1];
    // ADDENDUM 4 R-SPF-15 (1): a write to a record field `carried` names takes that member off every ability (R-SPF-5's clearing rule)
    function set(fn) { var n = clone(rec); fn(n); clearCarried(rec, n); p.onChange(n); }
    var chars = SP_CHARS.map(function (c) {
      return h('div', { key: c, className: 'ed-sp-ch', 'data-editor-char': c }, h('span', { className: 'ed-fk' }, capf(c)),
        h(NumIn, { value: ch[c], ro: ro, label: capf(c), field: 'characteristics.' + c, onChange: function (v) { set(function (n) { n.characteristics = Object.assign({}, n.characteristics); n.characteristics[c] = v; }); } }));
    });
    var thr = function (k, label, plus) {
      return h(Fl, { chip: 'AUTOMATIC', k: label, field: k, bad: p.bad && p.bad[k], key: k }, h('div', { className: 'ed-inrow' },
        h(NumIn, { value: rec[k], ro: ro, label: label, field: k, onChange: function (v) { set(function (n) { n[k] = v; }); } }),
        plus ? h('span', { className: 'ed-hint', style: { margin: 0 } }, plus) : null));
    };
    var ab = Array.isArray(rec.special_abilities) ? rec.special_abilities : [];
    var baseN = p.base && Array.isArray(p.base.special_abilities) ? p.base.special_abilities.length : 0;
    var abilities = ab.map(function (a, i) {
      // R-SPF-15 (1): editing the ability's text clears its `carried` (the field link is a fact about THOSE words)
      var put = function (k, v) { set(function (n) { n.special_abilities = n.special_abilities.slice(); n.special_abilities[i] = Object.assign({}, n.special_abilities[i]); if (v) n.special_abilities[i][k] = v; else delete n.special_abilities[i][k]; if (k === 'description') delete n.special_abilities[i].carried; }); };
      // key ON: the ability's rows, each in the talent form's own line part; Remove drops the row, and the array with its last
      function rowsPut(k, fn) { set(function (n) { n.special_abilities = n.special_abilities.slice(); var o = n.special_abilities[i] = Object.assign({}, n.special_abilities[i]); o[k] = arrOf(o, k).slice(); fn(o[k]); if (!o[k].length) delete o[k]; }); }
      var lines = [];
      SP_DRAW.forEach(function (k) {
        arrOf(a, k).forEach(function (row, j) {
          if (k === 'effects' && isSkillOp(row) && row.op !== 'skill_substitute') return;
          var stale = !rowHolds(a.description, row, ab);
          // the stale line on exactly the rows the save drops (R-M9B-46); "Mark the selected words" while the text is being
          // edited or the row is stale: it writes the selection to the row's `words`, and to a span condition that no longer holds
          var mark = function () {
            var sp = sel && sel.i === i ? spanFrom(a.description, sel) : null; if (!sp) return;
            rowsPut(k, function (arr) { var n = clone(arr[j]); n.words = sp; if (isObj(n.condition) && !spanOk(a.description, n.condition)) n.condition = clone(sp); arr[j] = n; });
          };
          var mb = ro ? [null, null] : [stale ? h('div', { className: 'ed-fmt ed-stale', 'data-editor-stale': '1', key: 's' }, M8W.stale + M8W.spStaleTail) : null,
            editing === i || stale ? h('button', { type: 'button', className: 'ed-addline', key: 'b', 'data-editor-mark': '1', onMouseDown: function (e) { e.preventDefault(); }, onClick: mark }, M8W.mark) : null];
          var lp = { key: j, i: j, ro: ro, ranked: false, vocab: vocab, sp: true, spx: true, desc: a.description, mb: mb,   // spx: L3's chip (AnchorChips)
            onChange: function (x) { rowsPut(k, function (arr) { arr[j] = x; }); }, onRemove: function () { rowsPut(k, function (arr) { arr.splice(j, 1); }); } };
          var el = k === 'effects' ? (row.op === 'skill_substitute' ? h(SubstituteLine, { e: row, ro: ro, vocab: vocab, onChange: lp.onChange }) : h(SpEffectLine, Object.assign({ e: row }, lp)))
            : k === 'pool_mods' ? h(TalentDiceLine, Object.assign({ d: row }, lp)) : k === 'roll_numbers' ? h(RollNumberLine, Object.assign({ rn: row }, lp)) : h(ToldLine, Object.assign({ t: row }, lp));
          lines.push(h('div', { key: k + j, 'data-editor-spline': k }, el));
        });
      });
      var adds = !ro && newSpeciesRow('told', a.description) ? h('div', { className: 'ed-btnrow', style: { margin: '6px 0 14px', flexWrap: 'wrap' } }, SP_ADDS.map(function (x) {
        return h('button', { type: 'button', className: 'ed-addline', key: x[0], 'data-editor-spadd': x[0], onClick: function () { var row = newSpeciesRow(x[0], a.description); if (row) rowsPut(x[0], function (arr) { arr.push(row); }); } }, x[1]);
      })) : null;
      return h('div', { key: i, className: 'ed-sp-ab', 'data-editor-ability': String(i) },
        h(Fl, { chip: abilityChip(a), k: SW.ability(i + 1), field: 'special_abilities.' + i + '.name' }, h(TextIn, { value: a.name, ro: ro, label: SW.ability(i + 1), field: 'special_abilities.' + i + '.name', onChange: function (v) { put('name', v); } })),
        h(Fl, { chip: 'NARRATIVE', k: SW.text, field: 'special_abilities.' + i + '.description' },
          h(MarkedArea, { value: a.description, marks: spMarks(a), ro: ro, label: SW.text + ' · ' + (a.name || SW.ability(i + 1)), field: 'special_abilities.' + i + '.description', editing: editing === i,
            onEdit: function () { setEditing(i); }, onSel: function (x, y) { setSel({ i: i, start: x, end: y }); }, onChange: function (v) { put('description', v); } })),
        lines,
        a.buyout_xp ? [h(Fl, { chip: 'AUTOMATIC', key: 'b', k: [SW.boughtOff, ' ', h('span', { className: 'ed-yours', key: 'c', style: { marginLeft: 6 } }, SW.carried)], field: 'special_abilities.' + i + '.buyout_xp' },
            h(RoField, { value: a.buyout_xp + ' XP', label: SW.boughtOff, field: 'buyout' })), h('div', { className: 'ed-hint', key: 'h' }, SW.boughtHint)] : null,
        adds,   // F3b: the buyout under the lines, then "+ Add …"
        // F6 (B-1201): an ability taken from another species (past the copy's own) carries its Remove act
        !ro && i >= baseN ? h('div', { className: 'ed-lineacts', key: 'rm' }, h('span'), h('button', { type: 'button', className: 'ed-addline ed-rm-act', 'data-editor-rmability': String(i),
          onClick: function () { set(function (n) { n.special_abilities = n.special_abilities.slice(); n.special_abilities.splice(i, 1); }); } }, SW.rmAbility)) : null);
    });
    var carried = carriedRows(rec, books, vocab);
    var base = (p.base && p.base.name) || rec.name || '';
    return h('div', { 'data-editor-species': '1' },
      h('div', { className: 'hp-plate ed-stock', 'data-pad': 'data', style: { marginTop: 14 } },
        h(Fl, { chip: 'NARRATIVE', k: 'Name', field: 'name', bad: p.bad && p.bad.name }, h(TextIn, { value: rec.name, ro: ro, label: 'Name', field: 'name', onChange: function (v) { set(function (n) { n.name = v; }); } }))),
      h(Grp, { t: SW.chars }, h(Fl, { chip: 'AUTOMATIC', k: SW.startChars, field: 'characteristics', bad: p.bad && p.bad.characteristics }, h('div', { className: 'ed-sp-chars' }, chars))),
      h(Grp, { t: SW.thresholds }, thr('wound_threshold_base', SW.wound, SW.plusBrawn), thr('strain_threshold_base', SW.strain, SW.plusWill), thr('starting_xp', SW.xp, null)),
      h(Grp, { t: SW.abilitiesH, aside: String(ab.length) }, ab.length ? abilities : h('p', { className: 'ed-hint', style: { margin: 0 }, 'data-editor-noabilities': p.own ? 'yours' : 'book' }, p.own ? SW.noAbilitiesYet : SW.noAbilities),
        // F6 (B-1201, K5 (a)): the picker's door under the abilities; pressed while the picker is open
        ro ? null : h('div', { style: { margin: '10px 0 6px' }, key: 'af' }, h('button', { type: 'button', className: 'hp-quiet', style: { width: '100%', justifyContent: 'center' }, 'aria-expanded': p.picker ? 'true' : 'false',
          'data-on': p.picker ? '1' : undefined, onClick: p.togglePicker, 'data-editor-addfrom': '1' }, SW.addFrom(p.total || 0)))),
      carried.length ? h(Grp, { t: SW.carriedFrom(base), aside: String(carried.length) },
        carried.map(function (c, i) { return h(Fl, { chip: c[0], key: i, k: [c[1], ' ', h('span', { className: 'ed-yours', key: 'c', style: { marginLeft: 6 } }, SW.carried)], field: 'carried' }, h(RoField, { value: c[2], label: c[1], field: 'carried' })); }),
        h('div', { className: 'ed-hint', key: 'h' }, SW.carriedHint)) : null);
  }
  // the preview: F6's species block (spBlock), with each ability's name and its text (no chip and no lines while the key is OFF)
  function SpeciesPlate(p) {
    var rec = p.rec, ch = isObj(rec.characteristics) ? rec.characteristics : {}, ab = Array.isArray(rec.special_abilities) ? rec.special_abilities : [];
    var n = function (v) { return v == null ? IW.none : v; };
    var sum = function (a, b) { return a == null || b == null ? IW.none : a + b; };
    return h('div', { className: 'hp-plate', 'data-pad': 'read', 'data-editor-preview': 'species' }, h('div', { className: 'ed-fk' }, SW.preview),
      h('div', { className: 'ed-tp' }, h('div', { className: 'ed-tp-h' }, h('span', null, rec.name || 'New species'), h('span', { className: 'ed-tp-rank' }, 'Species')),
        h('div', { className: 'ed-tp-b' },
          h('div', { className: 'ed-sp-blk' }, SP_CHARS.map(function (c) { return h('div', { key: c }, h('b', null, n(ch[c])), h('div', { className: 'ed-fk' }, c.slice(0, 3).toUpperCase())); })),
          h('div', { className: 'ed-fk' }, SW.wounds(sum(rec.wound_threshold_base, ch.brawn), sum(rec.strain_threshold_base, ch.willpower), n(rec.starting_xp))),
          ab.map(function (a, i) {
            // the ability's chip beside its name and its working lines under it (F3's preview)
            return h('div', { key: i, className: 'ed-tp-box' }, h('div', { className: 'ed-fk' }, (a.name || SW.ability(i + 1)) + ' ', h(Chip, { c: abilityChip(a) })),
              spPreview(a, p.vocab).map(function (l, j) { return h('div', { key: j, className: 'ed-tp-l', 'data-editor-spprev': '1' }, l); }));
          }))));
  }
  // ── F6 (B-1201) THE PICKER: every book species A–Z (the search narrows; one match opens), a species' abilities, Add. An ability
  // whose name the species already has is greyed and cannot be added (K4 (a)). TreePicker's parts: the plate, the search with its
  // count, the list scrolling in its own box. ──
  function SpeciesPicker(p) {
    var _q = useState(''), q = _q[0], setQ = _q[1];
    var _o = useState({}), open = _o[0], setOpen = _o[1];
    var t = (p.books.sections && p.books.sections.species) || {}, total = Object.keys(t).length, ql = q.trim().toLowerCase();
    var rows = speciesRowsOf(p.books).filter(function (r) { return !ql || r.name.toLowerCase().indexOf(ql) !== -1; });
    var have = {}; (p.rec.special_abilities || []).forEach(function (a) { var n = String((a && a.name) || '').trim().toLowerCase(); if (n) have[n] = true; });
    var one = rows.length === 1;
    return h('div', { className: 'hp-plate ed-picker', 'data-pad': 'read', 'data-editor-picker': 'species' },
      p.onDone ? h('div', { style: { display: 'flex', justifyContent: 'flex-end' } }, h('button', { type: 'button', className: 'hp-quiet', onClick: p.onDone, 'data-editor-picker-done': '1' }, 'Done')) : null,
      h('div', { className: 'ed-fk' }, SW.pickHead),
      h('label', { className: 'ed-search', style: { marginTop: 10 } },
        h('input', { type: 'search', value: q, placeholder: SW.pickSearch(total), 'aria-label': SW.pickSearch(total), onChange: function (e) { setQ(e.target.value); }, 'data-editor-picker-search': '1' }),
        h('span', { className: 'ed-k' }, ql ? num(rows.length) + ' of ' + num(total) : num(total))),
      h('div', { className: 'ed-pick-list hp-bands', 'data-editor-pick-list': '1' }, rows.map(function (r) {
        var rec = t[r.id], abl = Array.isArray(rec.special_abilities) ? rec.special_abilities : [], ex = one || !!open[r.id];
        return h('div', { key: r.id, className: 'ed-pick', style: { display: 'block' }, 'data-editor-pick': r.id },
          h('button', { type: 'button', className: 'ed-link', style: { display: 'block', textAlign: 'left', width: '100%', padding: 0, border: 0, background: 'none', color: 'inherit', cursor: 'pointer' }, 'aria-expanded': ex ? 'true' : 'false',
            onClick: function () { var o = Object.assign({}, open); o[r.id] = !open[r.id]; setOpen(o); } },
            h('span', { className: 'ed-pick-n' }, r.name), h('span', { className: 'ed-pick-m', style: { display: 'block' } }, SW.abilities(abl.length) + ' · ' + r.book)),
          ex ? abl.map(function (a, i) {
            var nm = String(a.name || ''), same = !!have[nm.trim().toLowerCase()];
            return h('div', { key: i, className: 'ed-pick-ab', 'data-editor-pick-ability': r.id + ':' + i, 'data-same': same ? '1' : undefined,
                style: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: '4px 12px', padding: '10px 0 4px 12px', borderLeft: '2px solid var(--doc-rule)', opacity: same ? 0.55 : undefined } },
              h('b', null, nm), h('button', { type: 'button', className: 'hp-quiet', disabled: same, 'aria-disabled': same ? 'true' : undefined, 'data-editor-pick-add': r.id + ':' + i,
                onClick: function () { if (!same) p.onAdd(a); } }, SW.addB),
              h('span', { className: 'ed-pick-l', style: { gridColumn: '1/-1' } }, a.description || ''),
              same ? h('span', { className: 'ed-hint', style: { gridColumn: '1/-1', margin: 0, opacity: 1 }, 'data-editor-pick-same': '1' }, SW.hasAlready(nm)) : null);
          }) : null);
      })));
  }
  // the ability as taken: the source's own (name, text and its rows); a buyout is the source species' and stays there
  function takenAbility(a) { var n = clone(a); delete n.buyout_xp; return n; }
  function SpeciesPeek(p) {
    var _o = useState(false), open = _o[0], setOpen = _o[1];
    var ch = isObj(p.rec.characteristics) ? p.rec.characteristics : {};
    return h('div', { className: 'ed-peek', 'data-editor-peek': open ? 'open' : 'closed' }, h('div', { className: 'ed-grab', 'aria-hidden': 'true' }),
      h('button', { type: 'button', className: 'ed-ph', 'aria-expanded': open, onClick: function () { setOpen(!open); } }, h('span', null, SW.preview), h('span', { className: 'ed-chev' }, open ? '▾' : '▴')),
      open ? h(SpeciesPlate, { rec: p.rec, vocab: p.vocab }) : h('div', { className: 'ed-rm', style: { marginTop: -4 } },
        [p.rec.name || 'New species'].concat(SP_CHARS.map(function (c) { return SP_ABBR[c] + ' ' + (ch[c] == null ? IW.none : ch[c]); })).join(' · ')));
  }
  // R-M9B-46 (superseding R-M9B-39's whole-text compare, in BOTH key states): at save every row is kept only while each span it
  // carries passes spanOk over its own ability's saved text — a shortened or re-worded span drops its row, an unedited or
  // typed-back text keeps every row, a re-marked row holds; the test reads each ability alone, so no compare by index is owed
  // (R-M9B-45 retired). New rows take ids by the applier's row_slug rule, per ability (R-M9B-48).
  var SPECIES_ROW_ARRAYS = ['pool_mods', 'roll_numbers', 'effects', 'told'];
  // R-SPF-5 / ADDENDUM 4 R-SPF-15: the record fields an ability's `carried` may name (schema/species.schema.json's enum)
  var CARRIED_FIELDS = ['wound_threshold_base', 'strain_threshold_base', 'starting_xp', 'characteristics', 'starting_talents', 'skill_choice_grants', 'bonus_free_ranks', 'career_skill_choice_grants', 'option_choices'];
  // (1) a write to a named field (n against the record before it, prev) deletes that member from every ability's `carried`,
  // the array dropped when empty
  function clearCarried(prev, n) {
    var moved = CARRIED_FIELDS.filter(function (f) { return JSON.stringify(prev[f]) !== JSON.stringify(n[f]); });
    if (!moved.length || !Array.isArray(n.special_abilities)) return;
    n.special_abilities = n.special_abilities.map(function (a) {
      if (!isObj(a) || !Array.isArray(a.carried)) return a;
      var c = a.carried.filter(function (f) { return moved.indexOf(f) === -1; });
      if (c.length === a.carried.length) return a;
      var o = Object.assign({}, a); if (c.length) o.carried = c; else delete o.carried; return o;
    });
  }
  // (2) re-stamp at save: an ability with no `carried` whose text hashes equal to the BOOK record's same-named ability and
  // whose book-named fields equal the book's takes the book's `carried` back (a typed-then-reverted edit restores the chip);
  // a text or a field that differs stays cleared (no control is drawn: the "Mark these words again" words are the frames card's)
  function restampCarried(o, r, book) {
    if (!isObj(book) || !Array.isArray(book.special_abilities) || (Array.isArray(o.carried) && o.carried.length)) return o;
    var b = book.special_abilities.filter(function (x) { return isObj(x) && x.name === o.name; });
    if (b.length !== 1 || !Array.isArray(b[0].carried) || !b[0].carried.length) return o;
    if (textHash(String(o.description || '')) !== textHash(String(b[0].description || ''))) return o;
    if (!b[0].carried.every(function (f) { return JSON.stringify(r[f]) === JSON.stringify(book[f]); })) return o;
    o.carried = b[0].carried.slice();
    return o;
  }
  function normalizeSpecies(rec, book) {
    var r = clone(rec);
    if (typeof r.name === 'string') r.name = r.name.trim();
    if (!r.name) delete r.name;
    if (Array.isArray(r.special_abilities)) {
      var abl = r.special_abilities;
      r.special_abilities = abl.map(function (a) {
        if (!isObj(a)) return a;
        var o = Object.assign({}, a);
        if (typeof o.name === 'string') o.name = o.name.trim();
        SPECIES_ROW_ARRAYS.forEach(function (k) {
          if (!Array.isArray(o[k])) return;
          var kept = o[k].filter(function (row) { return rowHolds(o.description, row, abl); });
          if (kept.length) o[k] = kept; else delete o[k];
        });
        return mintRowIds(restampCarried(o, r, book));
      });
    }
    return r;
  }
  function speciesCheck(rec) {
    var w = [], bad = {};
    if (!rec.name) { w.push(TW.giveName); bad.name = true; }
    var ch = isObj(rec.characteristics) ? rec.characteristics : {};
    if (SP_CHARS.some(function (c) { return typeof ch[c] !== 'number' || ch[c] < 1; })) { w.push(SW.needChars); bad.characteristics = true; }
    [['wound_threshold_base', SW.wound], ['strain_threshold_base', SW.strain], ['starting_xp', SW.xp]].forEach(function (k) { if (typeof rec[k[0]] !== 'number') { w.push(SW.needNum(k[1])); bad[k[0]] = true; } });
    if ((rec.special_abilities || []).some(function (a) { return !a.name; })) w.push(SW.needAbilityName);
    // B-1227: two abilities of one name, from ANY path (a rename can still make one K4 (a) cannot reach), refused in the drawn words
    var seenN = {};
    (rec.special_abilities || []).forEach(function (a) {
      var n = String((a && a.name) || '').trim(), key = n.toLowerCase();
      if (!key) return;
      if (seenN[key] === 1) w.push(SW.twoCalled(n));
      seenN[key] = (seenN[key] || 0) + 1;
    });
    return w.length ? { words: w, bad: bad } : null;
  }

  // ── F7 THE TREE EDITOR (U1b, U10b, U11, U13b): the ONE tree (SWRPGTree.DirectionalTree, author mode) ──
  // talent view = the book ∪ every collection's own talents (M-3: an own talent is not in the pristine base)
  function talentViewOf(books, store) {
    var out = Object.assign({}, (books.sections && books.sections.talents) || {});
    yoursOf('talents', books, store).forEach(function (y) { out[y.id] = y.rec; });
    return out;
  }
  var chipGroup = { AUTOMATIC: 0, SITUATIONAL: 1, NARRATIVE: 2 };
  function TreePicker(p) {
    var _q = useState(''), q = _q[0], setQ = _q[1];
    var db = p.db, cell = p.cell, total = Object.keys(db).length;
    var ql = q.trim().toLowerCase();
    var rows = Object.keys(db).map(function (id) { var r = db[id]; return { id: id, name: r.name || id, chips: talentChips(r), rec: r }; })
      .filter(function (r) { return !ql || r.name.toLowerCase().indexOf(ql) !== -1; })
      .sort(function (a, b) { return (ql ? 0 : (chipGroup[a.chips[0]] - chipGroup[b.chips[0]])) || a.name.localeCompare(b.name); });
    var now = db[cell.talentId], was = p.was;
    return h('div', { className: 'hp-plate ed-picker', 'data-pad': 'read', 'data-editor-picker': 'talent' },
      p.onDone ? h('div', { style: { display: 'flex', justifyContent: 'flex-end' } }, h('button', { type: 'button', className: 'hp-quiet', onClick: p.onDone, 'data-editor-picker-done': '1' }, 'Done')) : null,
      h('div', { className: 'ed-fk' }, TW.pickHead),
      h('div', { className: 'ed-rm' }, 'Row ' + (cell.row + 1) + ' · ' + cell.cost + ' xp · now: ' + (now ? now.name : 'Deleted talent') + (was ? ' (was ' + was + ')' : '')),
      h('label', { className: 'ed-search', style: { marginTop: 10 } },
        h('input', { type: 'search', value: q, autoFocus: true, placeholder: 'Search talents', 'aria-label': 'Search talents for this box', onChange: function (e) { setQ(e.target.value); }, 'data-editor-picker-search': '1' }),
        h('span', { className: 'ed-k' }, num(rows.length) + ' of ' + num(total))),
      // R-M5T-6 (b): every match is listed — the count's first number IS the rows shown; the list scrolls in its own box (a)
      h('div', { className: 'ed-pick-list hp-bands', 'data-editor-pick-list': '1' }, rows.map(function (r) {
        var on = r.id === cell.talentId;
        return h('button', { type: 'button', key: r.id, className: 'ed-pick', 'data-on': on ? '1' : undefined, 'aria-pressed': on ? 'true' : 'false', onClick: function () { p.onPick(r.id); }, 'data-editor-pick': r.id },
          h('span', { className: 'ed-pick-n' }, r.name, on ? ' ✓' : ''),
          h('span', { className: 'ed-pick-m' }, (r.rec.ranked ? 'Ranked' : 'Not ranked') + ' · ' + actLabel(r.rec.activation)),
          h('span', { className: 'ed-chips' }, r.chips.map(function (c) { return h(Chip, { c: c, key: c }); })),
          h('span', { className: 'ed-pick-l' }, glyph(para1(r.rec.description))));
      })));
  }
  function PreviewTap(p) {
    var e = p.entry;
    return h('div', { className: 'hp-plate', 'data-pad': 'read', 'data-editor-tap': '1' },
      p.onDone ? h('div', { style: { display: 'flex', justifyContent: 'flex-end' } }, h('button', { type: 'button', className: 'hp-quiet', onClick: p.onDone }, 'Done')) : null,
      h('div', { className: 'ed-fk' }, 'Row ' + (e.row + 1) + ' · ' + e.cost + ' xp'),
      h('h3', { className: 'ed-plate-h' }, e.name),
      e.chips && e.chips.length ? h('span', { className: 'ed-chips' }, e.chips.map(function (c) { return h(Chip, { c: c, key: c }); })) : null,
      e.desc ? h('p', { className: 'hp-prose', style: { margin: '8px 0 0' } }, glyph(e.desc)) : null,
      e.gone || e.power ? null : h('div', { className: 'ed-rm', style: { marginTop: 8 } }, (e.ranked ? 'Ranked' : 'Not ranked') + ' · ' + actLabel(e.activation)));   // M10: an upgrade has no rank or activation
  }
  function SpecBody(p) {
    var rec = p.rec, ro = p.ro, wide = p.wide, db = p.db, base = p.base || {};
    var T = window.SWRPGTree;
    var _m = useState('edit'), mode = _m[0], setMode = _m[1];
    var _s = useState(null), sel = _s[0], setSel = _s[1];
    var _a = useState(null), armed = _a[0], setArmed = _a[1];
    var _i = useState(null), tap = _i[0], setTap = _i[1];
    useEffect(function () { if (!armed) return; var t = setTimeout(function () { setArmed(null); }, ARM_MS); return function () { clearTimeout(t); }; }, [armed]);
    var tree = rec.talent_tree || [];
    var was = {};
    tree.forEach(function (row, r) { (row.talents || []).forEach(function (c, ci) {
      var b = base.talent_tree && base.talent_tree[r] && base.talent_tree[r].talents && base.talent_tree[r].talents[ci];
      if (b && c && b.talent !== c.talent) was[r + '-' + ci] = (db[b.talent] && db[b.talent].name) || b.talent;
    }); });
    function put(r, c, fn) { var n = clone(rec); fn(n.talent_tree, n); p.onChange(n); }
    function pick(id) { var k = sel.split('-'), r = +k[0], c = +k[1]; put(r, c, function (t) { t[r].talents[c].talent = id; }); }
    function edge(r, c, dir) {
      var a = tree[r].talents[c], br = dir === 'right' ? r : r + 1, bc = dir === 'right' ? c + 1 : c, b = tree[br] && tree[br].talents[bc];
      if (!b) return;
      var joined = dir === 'right' ? (a.links.right && b.links.left) : (a.links.down && b.links.up), key = r + '-' + c + ':' + dir;
      if (joined && armed !== key) { setArmed(key); return; }
      var on = !joined;   // C2.3: a link is written on BOTH sides
      put(r, c, function (t) {
        var A = t[r].talents[c].links, B = t[br].talents[bc].links;
        if (dir === 'right') { A.right = on; B.left = on; } else { A.down = on; B.up = on; }
      });
      setArmed(null);
    }
    var model = T && T.specTreeToAuthorModel ? T.specTreeToAuthorModel({ specData: rec, talentDb: db, chipsOf: talentChips, mode: mode, selected: mode === 'edit' ? sel : null, was: was, armed: armed,
      onPick: ro ? null : function (r, c) { setSel(r + '-' + c); }, onEdge: ro ? null : edge }) : null;
    var selCell = null;
    if (sel && model) { var sk = sel.split('-'); selCell = model.rows[+sk[0]] && model.rows[+sk[0]].cells[+sk[1]]; }
    var tabs = h('div', { className: 'ed-modes', role: 'tablist' },
      h('button', { type: 'button', role: 'tab', className: 'ed-mode', 'aria-selected': mode === 'edit' ? 'true' : 'false', onClick: function () { setMode('edit'); setTap(null); }, 'data-editor-mode': 'edit' }, TW.editTree),
      h('button', { type: 'button', role: 'tab', className: 'ed-mode', 'aria-selected': mode === 'preview' ? 'true' : 'false', onClick: function () { setMode('preview'); setSel(null); }, 'data-editor-mode': 'preview' }, TW.previewBuying));
    var legend = mode === 'edit' ? h('div', { className: 'ed-links-key' }, TW.linksKey + ' ', h('b', { className: 'ed-lk-j' }, '▬ ' + TW.joined), ' ┄ + ' + TW.open + ' ', h('span', { className: 'ed-lk-x' }, '× ' + TW.tapped))
      : null;
    var board = model ? h('div', { className: 'ed-treewrap' }, h(T.DirectionalTree, { model: model, accent: 'var(--doc-action)', onInspect: function (e) { setTap(e); } })) : h(Wait, { w: '100%' });
    var cs = (rec.career_skills || []).map(function (id) { return skillLabel(id, p.vocab); });
    var fields = h('div', { className: 'hp-plate ed-stock', 'data-pad': 'data', 'data-editor-specfields': '1' },
      h(Fl, { chip: 'NARRATIVE', k: 'Name', field: 'name', bad: p.bad && p.bad.name }, h(TextIn, { value: rec.name, ro: ro, label: 'Name', field: 'name', onChange: function (v) { var n = clone(rec); n.name = v; p.onChange(n); } })),
      h(Fl, { chip: 'AUTOMATIC', k: 'Career skills', field: 'career_skills' }, h('div', { className: 'ed-btnrow' }, cs.length ? cs.map(function (c) { return h('span', { key: c, className: 'ed-skill' }, c); }) : h('span', { className: 'ed-hint', style: { margin: 0 } }, IW.none))),
      h(Fl, { chip: 'NARRATIVE', k: 'Description', field: 'description' }, h(GrowArea, { value: rec.description, ro: ro, label: 'Description', field: 'description', onChange: function (v) { var n = clone(rec); if (v) n.description = v; else delete n.description; p.onChange(n); } })));
    var picker = selCell && mode === 'edit' && !ro ? h(TreePicker, { key: sel, db: db, cell: selCell, was: was[sel] || null, onPick: pick, onDone: wide ? null : function () { setSel(null); } }) : null;
    var tapped = tap && mode === 'preview' ? h(PreviewTap, { entry: tap, onDone: wide ? null : function () { setTap(null); } }) : null;
    var stage = h('div', { style: { minWidth: 0 } }, tabs, legend, board);
    if (wide && !p.compact) return h('div', { className: 'ed-treegrid', 'data-editor-tree': mode, 'data-side': picker || tapped ? '1' : undefined }, h('div', null, fields), stage, picker || tapped ? h('div', null, picker || tapped) : null);
    return h('div', { 'data-editor-tree': mode }, stage, p.compact ? null : h('div', { style: { marginTop: 14 } }, fields),
      !wide && (picker || tapped) ? h('div', { className: 'ed-sheet', role: 'dialog', 'aria-label': picker ? TW.pickHead : 'Preview' }, h('div', { className: 'ed-grab', 'aria-hidden': 'true' }), picker || tapped) : (picker || tapped));
  }
  function normalizeSpec(rec) { var r = clone(rec); if (typeof r.name === 'string') r.name = r.name.trim(); if (!r.name) delete r.name; return r; }
  // U10b's refusal: a box whose talent is gone blocks the save (the store refuses a dangling id; I-10's idiom names the box)
  function specCheck(rec, ctx) {
    var w = [], db = ctx.db || {};
    if (!rec.name || !String(rec.name).trim()) w.push(TW.giveName);
    (rec.talent_tree || []).forEach(function (row, r) { (row.talents || []).forEach(function (c, ci) { if (!c || !c.talent || !Object.prototype.hasOwnProperty.call(db, c.talent)) w.push(TW.goneRefuse(r + 1, ci + 1)); }); });
    return w.length ? { words: w, bad: {} } : null;
  }
  // U3: owners counted over this device's characters, first (C5.1, the usersOf pattern per record)
  function ownersOf(sec, id, roster) {
    var list = roster;
    if (!Array.isArray(list)) { try { var raw = JSON.parse(window.localStorage.getItem('swrpg_saved_characters') || '[]'); list = Array.isArray(raw) ? raw : (raw && raw.characters) || []; } catch (e) { list = []; } }
    return list.filter(function (c) {
      var s = c && c.sheetData; if (!s) return false;
      if (sec === 'talents') return (s.talents || []).some(function (t) { return t && t.id === id; });
      if (sec === 'species') return s.speciesId === id;
      if (sec === 'force_powers') return (s.forcePowers || []).some(function (x) { return x && x.id === id; });   // M10
      if (sec === 'careers') return s.careerId === id;   // M12
      return (s.specializationIds || []).indexOf(id) !== -1 || (s.specializations || []).some(function (x) { return x && x.id === id; });
    }).length;
  }

  // ══ M10 — THE FORCE-POWERS SHELF AND THE POWER FORM (ruling f100-m10-editor-card R-M10E-1..5, ADDENDUM 1 R-M10E-10; the approved
  // frames F1–F5 @ e77127d4, DECISIONS D-141 (K1, K2 (a)) and D-142 (W1, W2)). A new power is always a copy of a book power (NO_BLANK),
  // opened as a specialization is: the tree editor's face, the intent radio defaulting to a new power, "Change the book's <name>" the
  // overwrite (IW.changeBook, disclosed). Its tree is the ONE DirectionalTree in author mode over SWRPGTree.powerToAuthorModel, and the
  // save is refused by the ONE tree check (SWRPGPackValidate.powerTreeProblems), the same function the pack rail runs on an import. ══
  var FW = {
    // ── the frames' words (frames gate §6 with D-141/D-142's picks), verbatim ──
    inBooks: 'In the books',
    fr: function (n) { return 'Force rating ' + n + '+'; },
    upgrades: function (n) { return n + ' ' + plural(n, 'upgrade', 'upgrades'); },
    fromBook: 'Force power · from the book',                                                               // F3, W2 (D-142)
    frK: 'Force rating needed', frHint: 'Characters need this Force rating or more to buy it.',
    books: 'Books', upgradesH: 'Upgrades', upgradeK: function (i) { return 'Upgrade ' + i; }, family: 'Family', words: 'Words',
    addUpgrade: '+ Add an upgrade', noUpgrades: 'No upgrades yet.',
    box: function (r, c) { return 'Box ' + r + '-' + c; }, rowNow: function (r, nm) { return 'Row ' + r + ' · now: ' + nm; },
    pick: 'Upgrade', cost: 'Cost', bookCost: function (n) { return 'The book’s is ' + n + ' XP.'; }, width: 'Width',
    widthHint: 'A wider box takes the boxes to its right. They have to be empty.', removeBox: 'Remove this box',
    addSlot: '+ Add an upgrade here', addRow: '+ Add a row', noUpgrade: 'No upgrade — pick one',
    // ── implementer's chrome words (undrawn; each listed in the gate for the architect's review) ──
    needUpgradeName: 'Give every upgrade a name.', needCost: function (b) { return b + ' needs a cost.'; },
    delNew: function (nm, n) { return 'Delete ' + nm + '? ' + owners(n, 'have it') + (n ? ' They can still be played, but its upgrades do nothing.' : ''); },
    delRedef: function (nm, n) { return 'Delete your change to ' + nm + '? ' + (n ? owners(n, 'have ' + nm) + ' They go back to the book’s ' + nm + '.' : 'No character has it.'); },
  };
  var NEW_BOX_COST = 5;   // a new box's cost before it is typed (undrawn; named in the gate)
  function powerRow(rec) {
    var m = rec.min_force_rating;
    return { id: rec.id, name: rec.name || rec.id, fr: typeof m === 'number' && m >= 1 ? FW.fr(m) : '', n: isObj(rec.abilities) ? Object.keys(rec.abilities).length : 0,
             desc: rec.description || '', book: String(booksOf(rec)[0] || '').replace(/ Core Rulebook$/, '') };   // F2 drops the suffix, as m5Books does
  }
  var powerCache = null;
  function powerRowsOf(books) {
    var t = books.sections && books.sections.force_powers; if (!t) return [];
    if (powerCache && powerCache.t === t) return powerCache.rows;
    var rows = Object.keys(t).map(function (id) { return powerRow(t[id]); }).sort(function (a, b) { return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }); });
    powerCache = { t: t, rows: rows }; return rows;
  }
  // F2 — THE SHELF: drawn on the Species shelf page, in its own table and rows (one "In the books" group, A–Z, all 21).
  // M12 (R-M12B-9 F1): the Careers shelf is "drawn on the live Force-powers shelf page, in its own table and rows", so the page is
  // ONE function, BookShelf, and each kind names only what differs (`cfg`): its rows, its words, its columns. M10's output is
  // unchanged (its cfg is its old literals).
  var FP_SHELF = { sec: 'force_powers', title: 'Force powers', plural: 'Force powers', rowsOf: function (b) { return powerRowsOf(b); }, rowOf: function (r) { return powerRow(r); },
    meta: function (r) { return [r.fr, FW.upgrades(r.n)].filter(Boolean).join(' · '); }, nameW: '24%', heads: ['Power', 'Force rating', 'Upgrades', 'What it does', 'Book'],
    cells: function (r) { return [h('td', { className: 'ed-mono', key: 'f' }, r.fr || IW.none), h('td', { className: 'ed-mono', key: 'n' }, String(r.n))]; } };
  function ForceShelf(p) { return h(BookShelf, Object.assign({}, p, { cfg: FP_SHELF })); }
  function BookShelf(p) {
    var cfg = p.cfg, books = p.books, wide = p.wide, store = p.store, sec = cfg.sec;
    var _q = useState(''), q = _q[0], setQ = _q[1];
    var _s = useState('all'), show = _s[0], setShow = _s[1];
    var rows = cfg.rowsOf(books), total = rows.length;
    var yours = yoursOf(sec, books, store).map(function (y) { var r = cfg.rowOf(y.rec); r.y = y; return r; });
    var ys = yours.filter(function (r) { return matchQ(r.name, q); });
    var book = show === 'all' ? rows.filter(function (r) { return matchQ(r.name, q); }) : [];
    var open = function (r, y) { y ? p.go(recRoute(sec, r.y.ck, r.y.id)) : p.go({ view: 'record', shelf: sec, id: r.id }); };
    var search = h('label', { className: 'ed-search', style: { marginTop: 14, maxWidth: wide ? 640 : undefined } },
      h('input', { type: 'search', value: q, placeholder: 'Search ' + num(total) + ' ' + cfg.plural, 'aria-label': 'Search ' + cfg.plural, onChange: function (e) { setQ(e.target.value); }, 'data-editor-search': '1' }),
      h('span', { className: 'ed-k', 'aria-hidden': 'true' }, '⌕'));
    var emptyYours = show === 'yours' && !yours.length ? h('div', { className: 'hp-plate', 'data-pad': 'read', style: { marginTop: 14 }, 'data-editor-empty': '1' },
      h('div', { className: 'ed-empty' }, h('p', null, IW.empty(total, cfg.plural)))) : null;
    var nothing = !emptyYours && q && !ys.length && !book.length ? h('p', { className: 'ed-hint', role: 'status', style: { marginTop: 14 } }, IW.noMatch(q)) : null;
    var rh = h(Runhead, { back: 'Homebrew', right: cfg.title + ' · ' + num(total), onBack: function () { p.go({ view: 'home' }); } });
    if (!wide) {
      var nrow = function (r, y) {
        return h('button', { type: 'button', className: 'ed-irow', key: (y ? r.y.ck + ':' : '') + r.id, onClick: function () { open(r, y); }, 'data-editor-row': r.id },
          h('div', { className: 'ed-rb' }, h('div', { className: 'ed-rn', 'data-yours': y ? '1' : undefined }, r.name),
            h('div', { className: 'ed-rm' }, cfg.meta(r)),
            y ? h('div', { className: 'ed-rm', style: { color: 'var(--doc-action)' } }, 'Yours · ' + yoursLine(r.y)) : h('div', { className: 'ed-rm' }, r.book)),
          h('span', { className: 'ed-chev', 'aria-hidden': 'true' }, '›'));
      };
      return h('div', { className: 'ed-pad' }, rh, h(Banner, { status: store.status }), h('div', { className: 'hp-maker' }, 'Shelf'), h('h1', { className: 'hp-desig' }, cfg.title), search,
        h('div', { className: 'ed-btnrow', style: { marginTop: 10 } },
          h('button', { type: 'button', className: 'hp-quiet', 'data-on': show === 'all' ? '1' : undefined, 'aria-pressed': show === 'all', onClick: function () { setShow('all'); } }, 'All ' + num(total)),
          h('button', { type: 'button', className: 'hp-quiet', 'data-on': show === 'yours' ? '1' : undefined, 'aria-pressed': show === 'yours', onClick: function () { setShow('yours'); }, 'data-editor-yours': '1' }, 'Yours ' + yours.length)),
        emptyYours, nothing,
        ys.length ? [h(Sechead, { t: 'Yours', aside: String(ys.length), key: 'ys' }), h('div', { className: 'hp-plate ed-stock', 'data-pad': 'data', key: 'yp' }, h('div', { className: 'hp-bands', 'data-run': '1' }, ys.map(function (r) { return nrow(r, true); })))] : null,
        book.length ? [h(Sechead, { t: FW.inBooks, aside: num(book.length), key: 'bh' }),
          h('div', { className: 'hp-plate ed-stock', 'data-pad': 'data', key: 'bp', 'data-editor-group': 'books' }, h('div', { className: 'hp-bands', 'data-run': '1' }, book.map(function (r) { return nrow(r, false); })))] : null);
    }
    var ncol = cfg.heads.length;
    var tr = function (r, y) {
      return h('tr', { className: 'ed-tr', key: (y ? r.y.ck + ':' : '') + r.id, onClick: function () { open(r, y); }, 'data-editor-row': r.id },
        h('td', { className: 'ed-nm', style: y ? { color: 'var(--doc-action)' } : undefined },
          h('button', { type: 'button', className: 'ed-link ed-rowname', onClick: function (e) { e.stopPropagation(); open(r, y); } }, r.name),
          y ? [' ', h('span', { className: 'ed-yours', key: 'y' }, 'yours'), h('div', { className: 'ed-rm', key: 'm', style: { fontWeight: 400, fontSize: 13, color: 'var(--doc-action)' } }, yoursLine(r.y))] : null),
        cfg.cells(r),
        h('td', { className: 'ed-first' }, r.desc ? glyph(r.desc) : IW.none), h('td', { className: 'ed-bk' }, y ? '' : r.book));
    };
    var grpRow = function (key, text) { return h('tr', { className: 'ed-grp', key: key }, h('td', { colSpan: ncol }, h('div', { className: 'ed-grpbtn', style: { cursor: 'default' } }, text))); };
    var body = [];
    if (ys.length) { body.push(grpRow('gy', 'Yours · ' + ys.length)); ys.forEach(function (r) { body.push(tr(r, true)); }); }
    if (book.length) { body.push(grpRow('gb', FW.inBooks + ' · ' + num(book.length))); book.forEach(function (r) { body.push(tr(r, false)); }); }
    var railBtn = function (key, lbl, n, on, click) { return h('button', { type: 'button', className: 'ed-cat', key: key, 'aria-pressed': on ? 'true' : 'false', onClick: click }, lbl, h('b', null, num(n))); };
    var railEl = h('nav', { className: 'ed-rail', 'aria-label': 'Shelves' }, h('h4', null, 'Shelves'), shelfRail(p, sec),
      h('h4', null, 'Show'), railBtn('all', 'All', total, show === 'all', function () { setShow('all'); }), railBtn('yours', 'Yours', yours.length, show === 'yours', function () { setShow('yours'); }));
    return h('div', { className: 'ed-shelfgrid' }, railEl,
      h('div', { className: 'ed-desk', style: { paddingTop: 18, minWidth: 0 } }, rh, h(Banner, { status: store.status }),
        h('div', null, h('div', { className: 'hp-maker' }, 'Shelf'), h('h1', { className: 'hp-desig' }, cfg.title)),
        search, emptyYours, nothing,
        body.length ? h('div', { className: 'hp-plate ed-stock', 'data-pad': 'data', style: { marginTop: 14 } },
          h('table', { className: 'ed-tbl', 'data-editor-table': sec }, h('thead', null, h('tr', null, cfg.heads.map(function (t, i) { return h('th', { key: t, style: i === 0 ? { width: cfg.nameW } : undefined }, t); }))),
            edBands(body))) : null));
  }

  // M12 (R-M12B-9 F1, D-157) — THE CAREERS SHELF, books only (R-M12R-7): yours, then the book's 21 A–Z. "What it is" is the
  // description's first sentence (F1 draws one per row); BOOK keeps the full title, as F1 draws it.
  var CW = {
    fr: function (n) { return 'Force rating ' + n; }, specs: function (n) { return n + ' ' + plural(n, 'specialization', 'specializations'); } };
  function sentence1(s) { var t = para1(s), m = /^(.+?[.!?])(\s|$)/.exec(t); return m ? m[1] : t; }
  function careerRow(rec) {
    var f = rec.force_rating, sp = Array.isArray(rec.specializations) ? rec.specializations.length : 0;
    return { id: rec.id, name: rec.name || rec.id, n: sp, fr: typeof f === 'number' && f >= 1 ? CW.fr(f) : '', desc: sentence1(rec.description), book: String(booksOf(rec)[0] || '') };
  }
  var careerCache = null;
  function careerRowsOf(books) {
    var t = books.sections && books.sections.careers; if (!t) return [];
    if (careerCache && careerCache.t === t) return careerCache.rows;
    var rows = Object.keys(t).map(function (id) { return careerRow(t[id]); }).sort(function (a, b) { return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }); });
    careerCache = { t: t, rows: rows }; return rows;
  }
  var CAREER_SHELF = { sec: 'careers', title: 'Careers', plural: 'careers', rowsOf: careerRowsOf, rowOf: careerRow,
    meta: function (r) { return [CW.specs(r.n), r.fr].filter(Boolean).join(' · '); }, nameW: '18%', heads: ['Career', 'Specializations', 'Force rating', 'What it is', 'Book'],
    // "Force rating 1" on one line, as F1's 1440 frame draws it (the auto layout wrapped it)
    cells: function (r) { return [h('td', { className: 'ed-mono', key: 'n' }, String(r.n)), h('td', { className: 'ed-mono', key: 'f', style: { whiteSpace: 'nowrap' } }, r.fr || IW.none)]; } };
  function CareerShelf(p) { return h(BookShelf, Object.assign({}, p, { cfg: CAREER_SHELF })); }

  // ── M12 F2 (a)–(c) — THE CAREER FORM (R-M12B-9, D-157; census ruled at ADDENDUM 31). The fields plate on the left with the Save
  // row under it; ATTRIBUTES, CAREER POWERS and SIGNATURE ABILITIES on the right (the phone: the plate, the three, then Save).
  // A book career still unchanged reads plain (chips without ×, no pickers, no "+ Add a Force power", Attributes hidden while all
  // 0 — D-157); the first edit, or a record of yours, opens the authoring view, as F2 (a) / (b) / (c) draw it. ──
  var CRW = {
    skills: 'Career skills', ranks: 'Free skill ranks',   // F2, verbatim
    specs: 'Specializations', fr: 'Force rating', books: 'Books', carried: 'carried',
    moreSkill: function (n) { return '+ another skill · ' + num(n) + ' to pick from'; },
    moreSpec: function (n) { return '+ another specialization · ' + num(n) + ' to pick from'; },
    attrs: 'Attributes', attrsNoteBooks: 'All 0 in every book.',
    armour: 'Only while wearing armour', no: 'No', yes: 'Yes', xp: 'Extra starting XP',
    powers: 'Career powers', powersNote: 'Force powers this career offers free at creation when the Career Powers rule is on.', none: 'None.', addPower: '+ Add a Force power',
    sigs: 'Signature abilities', addSig: '+ Add a signature ability', noSigs: 'No signature abilities yet.',
    sigMeta: function (n, xp) { return n + ' ' + plural(n, 'upgrade', 'upgrades') + ' · ' + num(xp) + ' XP in all'; },
    // F2 (c), verbatim (R-M12C-71's tie-break is live: a name-only save keeps the book's)
    dupe: function (nm) { return 'The books already have a career called ' + nm + '. You can keep the name, but two ' + nm + 's are hard to tell apart in the creator, and a character saved before careers had ids keeps the book\'s.'; },
    twos: 'A career\'s powers come in twos.',   // R-M12B-105 (chrome, the mechanics voice; listed in the gate)
    saveFirst: 'Save this career first, then add its signature abilities.',   // undrawn: "+ Add a signature ability" on a career with no id yet
    // ── implementer's chrome (undrawn states; each named in the gate) ──
    needSkill: 'Pick at least one career skill.', needSpec: 'Pick at least one specialization.', needRanks: 'Give it 1 to 8 free skill ranks.',
    delNew: function (nm, n) { return 'Delete ' + nm + '? ' + owners(n, 'have it') + (n ? ' They can still be played, but the app no longer knows their career.' : ''); },
    delRedef: function (nm, n) { return 'Delete your change to ' + nm + '? ' + (n ? owners(n, 'have ' + nm) + ' They go back to the book\'s ' + nm + '.' : 'No character has it.'); },
  };
  // the Attributes rows, in F2's order: [key, label, op, defence target]; storage is `effects` (career_attribute_effect, R-M12C-79)
  var CA_ROWS = [['wound', 'Extra wound threshold', 'wound_threshold_delta', null], ['strain', 'Extra strain threshold', 'strain_threshold_delta', null],
                 ['soak', 'Extra soak', 'soak_delta', null], ['melee', 'Extra melee defence', 'defense_delta', 'melee'], ['ranged', 'Extra ranged defence', 'defense_delta', 'ranged']];
  function caMatch(e, row) { return !!e && e.op === row[2] && (row[3] ? e.target === row[3] : true); }
  function caRowOf(rec, row) { return arrOf(rec, 'effects').filter(function (e) { return caMatch(e, row); })[0] || null; }
  // a career's signature abilities (the registry's `careers` names it), A–Z; the count line reads the tree (a base box, then upgrades)
  // → [{ rec, y?, route }]: the book's, then yours (a change of yours replaces its book row), A–Z
  function sigsOf(books, cid, store) {
    var t = (books.sections && books.sections.signature_abilities) || {};
    if (!cid) return [];
    var of = function (r) { return Array.isArray(r.careers) && r.careers.indexOf(cid) !== -1; };
    var mine = store ? yoursOf('signature_abilities', books, store).filter(function (y) { return of(y.rec); }) : [];
    var changed = mine.filter(function (y) { return y.mode === 'redefine'; }).map(function (y) { return y.id; });
    var out = Object.keys(t).filter(function (k) { return of(t[k]) && changed.indexOf(k) === -1; })
      .map(function (k) { return { rec: t[k], route: { view: 'record', shelf: 'signature_abilities', id: k } }; })
      .concat(mine.map(function (y) { return { rec: y.rec, y: y, route: recRoute('signature_abilities', y.ck, y.id) }; }));
    return out.sort(function (a, b) { return String(a.rec.name).localeCompare(String(b.rec.name)); });
  }
  function sigSum(a) {
    var rows = (Array.isArray(a.tree) ? a.tree : []).map(function (r) { return (r && Array.isArray(r.cells)) ? r.cells : []; });
    var all = [].concat.apply([], rows);
    return { up: all.length - (rows[0] || []).length, xp: all.reduce(function (s, c) { return s + (typeof c.cost === 'number' ? c.cost : 0); }, 0) };
  }
  // the picked list: chips with × and the "+ another …" picker while authoring; plain chips otherwise (F2 (a))
  function ChipBox(p) {
    if (!p.author || p.ro) return h('div', { className: 'ed-btnrow', 'data-editor-chips': p.field }, p.items.map(function (it) {
      return h('span', { key: it[0], className: 'ed-qchip', 'data-editor-chip': it[0] }, it[1]);
    }));
    return h('div', { className: 'ed-cbox', 'data-editor-chips': p.field },
      p.items.length ? h('div', { className: 'ed-btnrow' }, p.items.map(function (it, i) {
        return h('button', { type: 'button', key: it[0], className: 'ed-qchip', 'aria-label': 'Remove ' + it[1], onClick: function () { p.onRemove(i); }, 'data-editor-chip': it[0] }, it[1] + ' ×');
      })) : null,
      h(AddPick, { cls: 'ed-cadd', label: p.addLabel, options: p.options, onAdd: p.onAdd, field: p.field }));
  }
  // a picker that reads as its own line until it opens: a select whose blank option is the drawn words
  function AddPick(p) {
    return h('select', { className: p.cls, value: '', 'aria-label': p.label, onChange: function (e) { if (e.target.value) p.onAdd(e.target.value); }, 'data-editor-add': p.field },
      h('option', { value: '' }, p.label), p.options.map(function (o) { return h('option', { key: o[0], value: o[0] }, o[1]); }));
  }
  function CareerBody(p) {
    var rec = p.rec, ro = p.ro, vocab = p.vocab, books = p.books, author = p.author, bad = p.bad || {}, wide = p.wide;
    var _t = useState(false), typed = _t[0], setTyped = _t[1];   // F2 (c): the notice shows once a name is TYPED
    var _a = useState(function () { return arrOf(rec, 'effects').some(function (e) { return !!e.when; }); }), armour = _a[0], setArmour = _a[1];
    function set(fn) { var n = clone(rec); fn(n); p.onChange(n); }
    function put(k, v) { set(function (n) { if (v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)) delete n[k]; else n[k] = v; }); }
    var sk = arrOf(rec, 'career_skills'), sp = arrOf(rec, 'specializations'), cp = arrOf(rec, 'career_powers');
    var specT = (books.sections && books.sections.specializations) || {}, fpT = (books.sections && books.sections.force_powers) || {};
    var nameOf = function (t, id) { return t[id] && t[id].name ? t[id].name : id; };
    var skAll = ((vocab && vocab.skills) || []).map(function (e) { return [e.id, e.label]; }).sort(function (a, b) { return a[1].localeCompare(b[1]); });
    var spAll = Object.keys(specT).map(function (id) { return [id, nameOf(specT, id)]; }).sort(function (a, b) { return a[1].localeCompare(b[1]); });
    var fpAll = Object.keys(fpT).map(function (id) { return [id, nameOf(fpT, id)]; }).sort(function (a, b) { return a[1].localeCompare(b[1]); });
    var nm = String(rec.name || '').trim(), cr = (books.sections && books.sections.careers) || {};
    var dupe = typed && p.makesNew && nm ? Object.keys(cr).map(function (id) { return cr[id] && cr[id].name; }).filter(function (x) { return String(x || '').trim().toLowerCase() === nm.toLowerCase(); })[0] : null;
    var fields = h('div', { className: 'hp-plate ed-stock', 'data-pad': 'data', style: { marginTop: 14 }, 'data-editor-career': '1' },
      h(Fl, { chip: 'NARRATIVE', k: 'Name', field: 'name', bad: bad.name },
        h(TextIn, { value: rec.name, ro: ro, label: 'Name', field: 'name', onChange: function (v) { setTyped(true); put('name', v); } }),
        dupe ? h('div', { className: 'ed-dupe', role: 'status', 'data-editor-dupe': '1' }, CRW.dupe(dupe)) : null),
      h(Fl, { chip: 'NARRATIVE', k: 'Description', field: 'description' }, h(GrowArea, { value: rec.description, ro: ro, label: 'Description', field: 'description', onChange: function (v) { put('description', v); } })),
      h(Fl, { chip: 'AUTOMATIC', k: CRW.skills, field: 'career_skills', bad: bad.career_skills },
        h(ChipBox, { field: 'career_skills', author: author, ro: ro, addLabel: CRW.moreSkill(skAll.length),
          items: sk.map(function (id) { return [id, skillLabel(id, vocab)]; }), options: skAll.filter(function (o) { return sk.indexOf(o[0]) === -1; }),
          onRemove: function (i) { var n = sk.slice(); n.splice(i, 1); put('career_skills', n); }, onAdd: function (id) { put('career_skills', sk.concat([id])); } })),
      h(Fl, { chip: 'AUTOMATIC', k: CRW.ranks, field: 'free_ranks', bad: bad.free_ranks },
        h(NumIn, { value: rec.free_ranks, ro: ro, label: CRW.ranks, field: 'free_ranks', onChange: function (v) { put('free_ranks', v); } })),
      h(Fl, { k: CRW.specs, field: 'specializations', bad: bad.specializations },
        h(ChipBox, { field: 'specializations', author: author, ro: ro, addLabel: CRW.moreSpec(spAll.length),
          items: sp.map(function (id) { return [id, nameOf(specT, id)]; }), options: spAll.filter(function (o) { return sp.indexOf(o[0]) === -1; }),
          onRemove: function (i) { var n = sp.slice(); n.splice(i, 1); put('specializations', n); }, onAdd: function (id) { put('specializations', sp.concat([id])); } })),
      h(Fl, { chip: 'AUTOMATIC', k: CRW.fr, field: 'force_rating', bad: bad.force_rating },
        h(NumIn, { value: rec.force_rating, ro: ro, label: CRW.fr, field: 'force_rating', onChange: function (v) { put('force_rating', v ? v : null); } })),
      h(Fl, { k: [CRW.books, ' ', h('span', { className: 'ed-yours', key: 'c', style: { marginLeft: 6 } }, CRW.carried)], field: 'sources' },
        h(RoField, { value: booksOf(rec).join(' · '), label: CRW.books, field: 'sources' })));
    // ATTRIBUTES (R-M12B-104: the select as drawn; Yes writes when:'armored' on every non-zero row, No writes none)
    function setAmt(row, v) {
      set(function (n) {
        var out = [], put1 = false;
        arrOf(n, 'effects').forEach(function (e) {
          if (!caMatch(e, row)) { out.push(e); return; }
          if (put1 || !v) return;
          var x = Object.assign({}, e, { amount: v }); out.push(x); put1 = true;
        });
        if (v && !put1) { var x = { op: row[2], amount: v }; if (row[3]) x.target = row[3]; if (armour) x.when = 'armored'; out.push(x); }
        out.sort(function (a, b) { return CA_ROWS.findIndex(function (r) { return caMatch(a, r); }) - CA_ROWS.findIndex(function (r) { return caMatch(b, r); }); });
        if (out.length) n.effects = out; else delete n.effects;
      });
    }
    function setArmourTo(on) {
      setArmour(on);
      set(function (n) {
        if (!Array.isArray(n.effects)) return;
        n.effects = n.effects.map(function (e) { var x = Object.assign({}, e); if (on) { if (!x.when) x.when = 'armored'; } else delete x.when; return x; });
      });
    }
    var anyAttr = arrOf(rec, 'effects').length > 0 || !!rec.xp_adjustment;
    var attrs = author || anyAttr ? h(Grp, { t: CRW.attrs, aside: String(CA_ROWS.length + 2) },
      h('p', { className: 'ed-hint', style: { margin: '0 0 2px' }, key: 'n' }, CRW.attrsNoteBooks),
      CA_ROWS.map(function (row) {
        var e = caRowOf(rec, row);
        return h(Fl, { chip: keyChip('careers', 'effects'), k: row[1], field: 'effects.' + row[0], key: row[0] },
          h(NumIn, { value: e ? e.amount : 0, ro: ro, label: row[1], field: 'effects.' + row[0], onChange: function (v) { setAmt(row, v); } }));
      }),
      h(Fl, { k: CRW.armour, field: 'effects.when', key: 'when' }, h(Sel, { value: armour ? 'yes' : 'no', ro: ro, blank: false, label: CRW.armour, field: 'effects.when',
        options: [['no', CRW.no], ['yes', CRW.yes]], onChange: function (v) { setArmourTo(v === 'yes'); } })),
      h(Fl, { chip: keyChip('careers', 'xp_adjustment'), k: CRW.xp, field: 'xp_adjustment', key: 'xp' },
        h(NumIn, { value: rec.xp_adjustment || 0, ro: ro, label: CRW.xp, field: 'xp_adjustment', onChange: function (v) { put('xp_adjustment', v ? v : null); } }))) : null;
    // CAREER POWERS — a pair (career_power_pair); one alone is refused at save (R-M12B-105)
    var powers = h(Grp, { t: CRW.powers, aside: String(cp.length) },
      h('p', { className: 'ed-hint', style: { margin: '0 0 6px' }, key: 'n' }, CRW.powersNote),
      cp.length ? h('div', { className: 'ed-btnrow', key: 'l', 'data-editor-chips': 'career_powers' }, cp.map(function (id, i) {
        return author && !ro ? h('button', { type: 'button', key: id, className: 'ed-qchip', 'aria-label': 'Remove ' + nameOf(fpT, id), 'data-editor-chip': id,
            onClick: function () { var n = cp.slice(); n.splice(i, 1); put('career_powers', n); } }, nameOf(fpT, id) + ' ×')
          : h('span', { key: id, className: 'ed-qchip', 'data-editor-chip': id }, nameOf(fpT, id));
      })) : h('p', { className: 'ed-fmt', style: { margin: '4px 0 0', fontWeight: 400 }, key: 'l', 'data-editor-nopowers': '1' }, CRW.none),
      author && !ro && cp.length < 2 ? h(AddPick, { key: 'a', cls: 'ed-addpick', label: CRW.addPower, field: 'career_powers',
        options: fpAll.filter(function (o) { return cp.indexOf(o[0]) === -1; }), onAdd: function (id) { put('career_powers', cp.concat([id])); } }) : null);
    // SIGNATURE ABILITIES — the books' abilities for this career (not a field of the career record); opened and added at F2 (d) / (f)
    // F2 (d): each row opens its ability (›); yours sit with the book's, a change of yours in the book record's place
    var sigs = sigsOf(books, p.sigId, p.store);
    var sigList = h(Grp, { t: CRW.sigs, aside: String(sigs.length) },
      sigs.length ? sigs.map(function (x) {
        var a = x.rec, s = sigSum(a), bk = sigBooksOf(a).join(' · ');
        return h('button', { type: 'button', key: (x.y ? x.y.ck + ':' : '') + a.id, className: 'ed-irow', onClick: function () { p.onOpenSig && p.onOpenSig(x.route); }, 'data-editor-sig': a.id },
          h('div', { className: 'ed-rb' }, h('div', { className: 'ed-rn', 'data-yours': x.y ? '1' : undefined }, a.name || a.id), h('div', { className: 'ed-rm' }, CRW.sigMeta(s.up, s.xp)),
            x.y ? h('div', { className: 'ed-rm' }, x.y.colName) : bk ? h('div', { className: 'ed-rm' }, bk) : null),
          h('span', { className: 'ed-chev', 'aria-hidden': 'true' }, '›'));
      }) : h('p', { className: 'ed-fmt', style: { margin: '4px 0 0', fontWeight: 400 }, key: 'none', 'data-editor-nosigs': '1' }, CRW.noSigs),
      !ro && p.onAddSig ? h('button', { type: 'button', key: 'a', className: 'ed-addline', onClick: p.onAddSig, 'data-editor-addsig': '1' }, CRW.addSig) : null);
    var right = h('div', { className: 'ed-csec' }, attrs, powers, sigList);
    if (!wide) return h('div', null, fields, right, p.saveRow);
    return h('div', { className: 'ed-csplit' }, h('div', null, fields, p.saveRow), h('div', { style: { marginTop: 14 } }, right));
  }
  function normalizeCareer(rec) {
    var r = clone(rec);
    ['name', 'description'].forEach(function (k) { if (typeof r[k] === 'string') r[k] = r[k].trim(); if (!r[k]) delete r[k]; });
    ['career_skills', 'specializations', 'career_powers', 'effects'].forEach(function (k) { if (Array.isArray(r[k]) && !r[k].length) delete r[k]; });
    if (Array.isArray(r.effects)) { r.effects = r.effects.filter(function (e) { return e && e.amount; }); if (!r.effects.length) delete r.effects; }
    if (!r.xp_adjustment) delete r.xp_adjustment;
    if (!r.force_rating) delete r.force_rating;
    return r;
  }
  function careerCheck(rec) {
    var w = [], bad = {};
    if (!rec.name) { w.push(TW.giveName); bad.name = true; }
    if (!arrOf(rec, 'career_skills').length) { w.push(CRW.needSkill); bad.career_skills = true; }
    if (!arrOf(rec, 'specializations').length) { w.push(CRW.needSpec); bad.specializations = true; }
    if (typeof rec.free_ranks !== 'number' || rec.free_ranks < 1 || rec.free_ranks > 8) { w.push(CRW.needRanks); bad.free_ranks = true; }
    if (arrOf(rec, 'career_powers').length === 1) w.push(CRW.twos);
    return w.length ? { words: w, bad: bad } : null;
  }

  // ── the power's tree, edited (F4): every act writes the RECORD's `tree` (cells at their col, each its own cost, span and links) ──
  function cellsAt(tree, r) { return (tree[r] && Array.isArray(tree[r].cells)) ? tree[r].cells : []; }
  function cellIndex(tree, r, col) { var cs = cellsAt(tree, r); for (var i = 0; i < cs.length; i++) if (cs[i] && cs[i].col === col) return i; return -1; }
  function boxAt(tree, r, col) {   // the box COVERING column `col` in row r
    var cs = cellsAt(tree, r);
    for (var i = 0; i < cs.length; i++) { var c = cs[i]; if (c && col >= c.col && col < c.col + (c.span || 1)) return c; }
    return null;
  }
  function covers(c) { var out = []; for (var k = c.col; k < c.col + (c.span || 1); k++) out.push(k); return out; }
  // the box's partners across one side: the boxes under (dir 'down') or over ('up') its columns that claim the link back
  function partners(tree, r, c, dir) {
    var out = [], rr = dir === 'down' ? r + 1 : r - 1, back = dir === 'down' ? 'up' : 'down';
    covers(c).forEach(function (k) { var b = boxAt(tree, rr, k); if (b && out.indexOf(b) === -1 && b.links && b.links[back]) out.push(b); });
    return out;
  }
  // a link written on BOTH sides (C2.3). Breaking one pair takes the side whose other links it does not cut; when both boxes have
  // other partners there is no way to cut only this pair in one `links` per box, so the lower box's `up` goes (named in the gate).
  function setDown(tree, r, a, b, on) {
    a.links = Object.assign({}, a.links); b.links = Object.assign({}, b.links);
    if (on) { a.links.down = true; b.links.up = true; return; }
    var aOther = partners(tree, r, a, 'down').filter(function (x) { return x !== b; }).length, bOther = partners(tree, r + 1, b, 'up').filter(function (x) { return x !== a; }).length;
    if (aOther && !bOther) b.links.up = false;
    else if (bOther && !aOther) a.links.down = false;
    else if (!aOther && !bOther) { a.links.down = false; b.links.up = false; }
    else b.links.up = false;
  }
  function powerNames(rec) { var a = isObj(rec.abilities) ? rec.abilities : {}; return Object.keys(a).map(function (k) { return [k, (a[k] && a[k].name) || k]; }); }
  function newAbilityKey(rec) { var a = isObj(rec.abilities) ? rec.abilities : {}, n = Object.keys(a).length + 1; while (Object.prototype.hasOwnProperty.call(a, 'upgrade' + n)) n++; return 'upgrade' + n; }
  function BoxPanel(p) {
    var rec = p.rec, c = p.cell, r = p.row, tree = rec.tree || [], base = p.base || {};
    var ab = isObj(rec.abilities) && Object.prototype.hasOwnProperty.call(rec.abilities, c.ability) ? rec.abilities[c.ability] : null;
    var now = ab ? ab.name || c.ability : FW.noUpgrade;
    var bc = base.tree ? (function () { var cs = cellsAt(base.tree, r); for (var i = 0; i < cs.length; i++) if (cs[i] && cs[i].col === c.col) return cs[i]; return null; })() : null;
    var canWide = function (n) { if (c.col + n > 4) return false; for (var k = c.col + (c.span || 1); k < c.col + n; k++) if (boxAt(tree, r, k)) return false; return true; };
    var label = FW.box(r + 1, c.col + 1);
    var body = [h('div', { className: 'ed-fk', key: 'k' }, label), h('h3', { className: 'ed-plate-h', key: 'h' }, now), h('div', { className: 'ed-rm', key: 'n' }, FW.rowNow(r + 1, now)),
      h(Fl, { k: FW.pick, field: 'tree.ability', key: 'u' }, h(Sel, { value: ab ? c.ability : '', options: powerNames(rec), blankLabel: FW.noUpgrade, ro: p.ro, label: FW.pick, field: 'tree.ability',
        onChange: function (v) { p.put(function (cell) { cell.ability = v; }); } })),
      h(Fl, { chip: 'AUTOMATIC', k: FW.cost, field: 'tree.cost', key: 'c' }, h('div', { className: 'ed-inrow' },
        h(NumIn, { value: c.cost, ro: p.ro, label: FW.cost, field: 'tree.cost', onChange: function (v) { p.put(function (cell) { cell.cost = v; }); } }),
        h('span', { className: 'ed-hint', style: { margin: 0 } }, 'XP' + (bc ? ' · ' + FW.bookCost(bc.cost) : '')))),
      h(Fl, { k: FW.width, field: 'tree.span', key: 'w' }, h('div', { className: 'ed-btnrow' }, [1, 2, 3, 4].map(function (n) {
        var on = (c.span || 1) === n, ok = on || canWide(n);
        return h('button', { type: 'button', key: n, className: 'hp-quiet', 'aria-pressed': on ? 'true' : 'false', 'data-on': on ? '1' : undefined, disabled: p.ro || !ok,
          onClick: function () { p.put(function (cell) { cell.span = n; }); }, 'data-editor-width': String(n) }, String(n));
      })), h('p', { className: 'ed-hint' }, FW.widthHint)),
      p.ro ? null : h('div', { className: 'ed-btnrow', style: { marginTop: 10 }, key: 'x' }, h('button', { type: 'button', className: 'ed-addline', onClick: p.onRemove, 'data-editor-removebox': '1' }, FW.removeBox))];
    return h('div', { className: 'hp-plate ed-picker', 'data-pad': 'read', 'data-editor-boxpanel': label },
      p.onDone ? h('div', { style: { display: 'flex', justifyContent: 'flex-end' } }, h('button', { type: 'button', className: 'hp-quiet', onClick: p.onDone, 'data-editor-picker-done': '1' }, 'Done')) : null, body);
  }
  // ── F5 · AN UPGRADE'S ROWS (R-M10E-5). The M9 row editor's parts (Fl · Sel · NumIn · SignedIn · AnchorChips · MarkedArea ·
  // the mark/stale bits · rmBit) with F5's new words. Every part below carries `data-editor-fppart`
  // (test/f100_m10_power_rows.cjs counts them). (The Force key that once kept these DARK was deleted by
  // post1-switch-deletion, ADDENDUM 638.) ──
  var F5W = {
    // ── the frame's words (frames gate §6, F5), verbatim ──
    perBought: function (up) { return 'for each ' + up + ' upgrade you buy'; },                       // "for each Strength upgrade you buy"
    spendFp: function (n) { return 'Spend ' + n + ' Force ' + plural(n, 'point', 'points'); },          // "Spend 1 Force point"
    committed: function (n) { return 'While ' + n + ' Force ' + (n === 1 ? 'die is' : 'dice are') + ' committed'; },   // "While 1 Force die is committed"
    onPower: function (nm) { return 'on ' + (/^[AEIOU]/i.test(nm) ? 'an ' : 'a ') + nm + ' check'; },  // "on a Move check"
    forceRating: 'One for each point of Force rating', markedAbove: 'When: the words marked above', upToRank: 'Up to rank',
    atRoll: 'Number at the roll ', onSheet: 'Number on the sheet ', dice: 'Dice line ', skillRank: function (s) { return 'Skill rank · ' + s; },
    // ── implementer's chrome words (undrawn; each listed in the gate) ──
    once: 'Once', noCost: 'No cost', aNumber: 'A number', noCond: 'No condition — applies on every check',
  };
  var FP_UNITS = ['range_band', 'target', 'silhouette', 'round', 'minute', 'day', 'detail', 'encumbrance', 'severity', 'wound', 'strain', 'conjuration', 'damage', 'illusion'];
  var FP_CHARS = ['brawn', 'agility', 'intellect', 'cunning', 'willpower', 'presence'];
  function unitWord(u) { return String(u || '').replace(/_/g, ' '); }
  // a row's cost as one select value: c<n> = commit n Force dice, f<n> = spend n Force points; anything else keeps its own words
  function fpCostKey(c) { return !isObj(c) ? '' : c.commit_force ? 'c' + c.commit_force : c.force_points ? 'f' + c.force_points : 'x'; }
  function fpCostOf(k) { return !k ? undefined : k.charAt(0) === 'c' ? { commit_force: +k.slice(1) } : { force_points: +k.slice(1) }; }
  function fpCostWords(c) { return !isObj(c) ? '' : c.commit_force ? F5W.committed(c.commit_force) : c.force_points ? F5W.spendFp(c.force_points) : subCost(c); }
  function fpCostRead(c) { var w = fpCostWords(c); return w ? w.charAt(0).toLowerCase() + w.slice(1) : ''; }
  // the upgrade a count_of key names, by its name ("Strength"), else the key
  function fpUpName(rec, key) { var k = String(key || ''), a = isObj(rec.abilities) ? rec.abilities[k.slice(k.indexOf('.') + 1)] : null; return (a && a.name) || k; }
  function fpPowerName(rec, id, books) {
    if (id === rec.id) return rec.name || id;
    var t = books && books.sections && books.sections.force_powers; return (t && t[id] && t[id].name) || capf(String(id).replace(/_/g, ' '));
  }
  function fpHowOpts(rec) { return Object.keys(isObj(rec.abilities) ? rec.abilities : {}).map(function (k) { return ['up:' + k, F5W.perBought(fpUpName(rec, rec.id + '.' + k))]; }); }
  // "+1 silhouette for each Strength upgrade you buy, on a Move check · spend 1 Force point, offered at the roll" (F5)
  function fpDialRead(rn, rec, books) {
    var anc = Array.isArray(rn.applies_to) ? rn.applies_to : [], amt = isObj(rn.amount) ? capf(rn.amount.key || 'characteristic') : signed(rn.amount);
    var per = isObj(rn.count_of) && rn.count_of.of === 'power_upgrades' ? ' ' + F5W.perBought(fpUpName(rec, rn.count_of.key)) : '';
    var on = anc.filter(function (a) { return a && a.scope === 'force_power'; }).map(function (a) { return F5W.onPower(fpPowerName(rec, a.value, books)); });
    return amt + ' ' + unitWord(rn.unit) + per + (on.length ? ', ' + on.join(', ') : '') + (rn.cost ? ' · ' + fpCostRead(rn.cost) : '') + ', offered at the roll';
  }
  // "Upgrade the ability once on Perception and Vigilance checks, while 1 Force die is committed, offered at the roll" ·
  // "Add a Force die for each point of Force rating on Athletics checks, offered at the roll" (F5)
  function fpDiceRead(d, rec, vocab) {
    var verb = d.direction === 'upgrade' || d.direction === 'downgrade', cof = isObj(d.count_of) ? d.count_of : null;
    var what = d.symbol ? d.symbol : d.die;
    var body = verb ? capf(d.direction) + ' the ' + (d.die === 'difficulty' || d.die === 'challenge' ? 'difficulty' : 'ability') + ' ' + (d.count === 1 ? 'once' : d.count + ' times')
      : (d.direction === 'remove' ? 'Remove ' : 'Add ') + (cof && cof.of === 'force_rating' ? 'a ' + capf(what) + ' die for each point of Force rating'
        : cof ? d.count + ' ' + what + ' ' + F5W.perBought(fpUpName(rec, cof.key)) : d.count + ' ' + what);
    var anc = (Array.isArray(d.applies_to) ? d.applies_to : []).filter(function (a) { return a && a.scope !== 'all'; });
    var where = anc.length ? ' on ' + joinList(anc.map(function (a) { return anchorName(a, vocab); }), 'and') + ' checks' : ' on every check';
    return body + where + (d.cost ? ', ' + fpCostRead(d.cost) : '') + (d.condition || d.cost || d.limit ? ', offered at the roll' : '');
  }
  // "Perception +1, up to rank 5, while 1 Force die is committed" (F5) · "Brawn +1, while 1 Force die is committed"
  function fpEffName(e, vocab) { return e.op === 'skill_rank_delta' ? skillLabel(e.skill, vocab) : capf(e.characteristic || 'brawn'); }
  function fpEffRead(e, vocab) { return fpEffName(e, vocab) + ' ' + signed(e.amount) + (e.op === 'skill_rank_delta' && e.max ? ', up to rank ' + e.max : '') + (e.cost ? ', ' + fpCostRead(e.cost) : ''); }
  function FpDialLine(p) {
    var rn = p.rn, ro = p.ro, rec = p.rec;
    function set(k, v) { var n = clone(rn); if (v === undefined || v === null) delete n[k]; else n[k] = v; p.onChange(n); }
    var anc = Array.isArray(rn.applies_to) ? rn.applies_to : [], cof = isObj(rn.count_of) ? rn.count_of : null;
    var how = cof && cof.of === 'power_upgrades' ? 'up:' + String(cof.key).slice(String(cof.key).indexOf('.') + 1) : '';
    return h(Fl, { chip: chipOf(EC() ? EC().classOfRollNumber(rn) : 'resolves'), k: F5W.atRoll + (p.i + 1), field: 'roll_numbers', cls: 'ed-m8' },
      h('div', { className: 'ed-inrow' },
        h(Sel, { value: rn.unit || '', options: FP_UNITS.map(function (u) { return [u, capf(unitWord(u))]; }), blank: !rn.unit, ro: ro, label: 'What it changes', field: 'unit', onChange: function (v) { set('unit', v || undefined); } }),
        isObj(rn.amount) ? h(Sel, { value: 'of', options: [['of', 'Your ' + capf(rn.amount.key || 'characteristic')]], blank: false, ro: ro, label: 'Amount', field: 'amount', onChange: function () {} })
          : h(SignedIn, { value: rn.amount, plus: true, ro: ro, label: 'Amount', field: 'amount', onChange: function (v) { if (v > 0) set('amount', v); } })),
      h('div', { className: 'ed-inrow' }, h(Sel, { value: how, options: [['', F5W.once]].concat(fpHowOpts(rec)), blank: false, ro: ro, label: 'How many', field: 'count_of',
        onChange: function (v) { set('count_of', v ? { of: 'power_upgrades', key: rec.id + '.' + v.slice(3) } : undefined); } })),
      h('div', { className: 'ed-inrow' }, h('div', { className: 'ed-inp ed-anchors' }, anc.map(function (a, i) {
          var nm = a.scope === 'force_power' ? fpPowerName(rec, a.value, p.books) : anchorName(a, p.vocab);
          return h('button', { type: 'button', key: i, className: 'ed-qchip', disabled: ro, 'aria-label': ro ? nm : 'Remove ' + nm, onClick: function () { var n = anc.slice(); n.splice(i, 1); set('applies_to', n.length ? n : undefined); } }, nm + (ro ? '' : ' ×'));
        }),
        // F5 draws the dial's one anchor, this power, with no "+ another"; a removed anchor can be put back
        ro || anc.length ? null : h(Sel, { value: '', options: [['force_power:' + rec.id, rec.name || rec.id]], blankLabel: IW.anyCheck, ro: ro, label: 'Which power', field: 'applies_to',
          onChange: function (v) { if (v) set('applies_to', [anchorOf(v)]); } }))),
      h('div', { className: 'ed-inrow' }, h(Sel, { value: fpCostKey(rn.cost), options: [['f1', F5W.spendFp(1)], ['f2', F5W.spendFp(2)], ['', F5W.noCost]].concat(fpCostKey(rn.cost) === 'x' ? [['x', fpCostWords(rn.cost)]] : []),
        blank: false, ro: ro, label: 'Cost', field: 'cost', onChange: function (v) { if (v !== 'x') set('cost', fpCostOf(v)); } })),
      p.mb[0], h('div', { className: 'ed-fmt' }, fpDialRead(rn, rec, p.books)), p.mb[1], rmBit(ro, M8W.rmNumber, fpDialRead(rn, rec, p.books), p.onRemove));
  }
  function FpDiceLine(p) {
    var d = p.d, ro = p.ro, rec = p.rec, vocab = p.vocab;
    function set(k, v) { var n = clone(d); if (v === undefined) delete n[k]; else n[k] = v; p.onChange(n); }
    var anc = Array.isArray(d.applies_to) ? d.applies_to : [], cof = isObj(d.count_of) ? d.count_of : null;
    var how = !cof ? '' : cof.of === 'force_rating' ? 'fr' : 'up:' + String(cof.key).slice(String(cof.key).indexOf('.') + 1);
    var ancName = function (a) { return a.scope === 'all' ? 'every check' : a.scope === 'group' ? capf(a.value) + ' checks' : anchorName(a, vocab); };
    return h(Fl, { chip: chipOf(EC() ? EC().classOfPoolMod(d) : 'prints'), k: F5W.dice + (p.i + 1), field: 'pool_mods', cls: 'ed-m8' },
      h('div', { className: 'ed-inrow' },
        d.symbol ? h(Sel, { value: d.symbol, options: [['success', 'Success'], ['advantage', 'Advantage']], blank: false, ro: ro, label: 'Result', field: 'symbol', onChange: function (v) { set('symbol', v); } })
          : h('span', { className: 'ed-diesel' }, h('span', { className: 'ed-dieg', 'aria-hidden': 'true' }, glyph('[' + (DIE_TOKEN[d.die] || (d.die === 'ability' ? 'AB' : '')) + ']')),
            h(Sel, { value: d.die, options: DIES.map(function (x) { return [x, capf(x)]; }), blank: false, ro: ro, label: 'Die', field: 'die', onChange: function (v) {
              var n = clone(d); n.die = v; var ok = verbsFor(n, true).map(function (o) { return o[0]; }); if (ok.indexOf(n.direction) === -1) n.direction = ok[0]; p.onChange(n); } })),
        h(Sel, { value: d.direction || '', options: verbsFor(d, true), blank: !d.direction, ro: ro, label: 'Add, remove, upgrade or downgrade', field: 'direction', onChange: function (v) { set('direction', v || undefined); } }),
        cof ? h(Sel, { value: how, options: [['fr', F5W.forceRating]].concat(fpHowOpts(rec), [['n', F5W.aNumber]]), blank: false, ro: ro, label: 'How many', field: 'count_of',
            onChange: function (v) { var n = clone(d); if (v === 'n') delete n.count_of; else n.count_of = v === 'fr' ? { of: 'force_rating', key: 'self' } : { of: 'power_upgrades', key: rec.id + '.' + v.slice(3) }; p.onChange(n); } })
          : h(NumIn, { value: d.count, ro: ro, label: 'How many', field: 'count', onChange: function (v) { set('count', v == null ? 1 : Math.max(1, v)); } })),
      h('div', { className: 'ed-inrow' }, h('div', { className: 'ed-inp ed-anchors' }, anc.map(function (a, i) {
          return h('button', { type: 'button', key: i, className: 'ed-qchip', disabled: ro, 'aria-label': ro ? ancName(a) : 'Remove ' + ancName(a), onClick: function () { var n = anc.slice(); n.splice(i, 1); set('applies_to', n.length ? n : null); } }, ancName(a) + (ro ? '' : ' ×'));
        }),
        ro ? null : h(Sel, { value: '', options: [['all', 'every check']].concat(anchorOpts(vocab)), blankLabel: anc.length ? '+ another' : IW.anyCheck, ro: ro, label: 'Which checks', field: 'applies_to',
          onChange: function (v) { if (v) set('applies_to', anc.concat([v === 'all' ? { scope: 'all' } : anchorOf(v)])); } }))),
      d.cost ? h('div', { className: 'ed-inrow' }, h(Sel, { value: fpCostKey(d.cost), options: [['c1', F5W.committed(1)], ['f1', F5W.spendFp(1)], ['', F5W.noCost]].concat(fpCostKey(d.cost) === 'x' ? [['x', fpCostWords(d.cost)]] : []),
        blank: false, ro: ro, label: 'Cost', field: 'cost', onChange: function (v) { if (v !== 'x') set('cost', fpCostOf(v)); } })) : null,
      d.cost && !d.condition ? null : h('div', { className: 'ed-inrow' }, h(Sel, { value: isObj(d.condition) ? 'span' : d.condition || '', blank: false, ro: ro, label: 'Condition', field: 'condition',
        options: [['', F5W.noCond]].concat(isObj(d.condition) ? [['span', F5W.markedAbove]] : d.condition ? [[d.condition, d.condition]] : []), onChange: function (v) { if (v !== 'span') set('condition', v || null); } })),
      p.mb[0], h('div', { className: 'ed-fmt' }, fpDiceRead(d, rec, vocab)), p.mb[1], rmBit(ro, TW.rmDice, fpDiceRead(d, rec, vocab), p.onRemove));
  }
  function FpEffectLine(p) {
    var e = p.e, ro = p.ro, vocab = p.vocab;
    function set(k, v) { var n = clone(e); if (v === undefined || v === null) delete n[k]; else n[k] = v; p.onChange(n); }
    var what = e.op === 'skill_rank_delta' ? 'skill:' + e.skill : 'char:' + (e.characteristic || 'brawn');
    var opts = FP_CHARS.map(function (c) { return ['char:' + c, capf(c)]; }).concat((vocab ? vocab.skills : []).map(function (s) { return ['skill:' + s.id, F5W.skillRank(s.label)]; }));
    function pick(v) {
      var n = clone(e), i = v.indexOf(':'), kind = v.slice(0, i), id = v.slice(i + 1);
      if (kind === 'skill') { n.op = 'skill_rank_delta'; n.skill = id; delete n.characteristic; } else { n.op = 'characteristic_delta'; n.characteristic = id; delete n.skill; delete n.max; }
      p.onChange(n);
    }
    var label = fpEffName(e, vocab) + ' ' + signed(e.amount);
    return h(Fl, { chip: chipOf(EC() ? EC().classOfEffect(e) : 'resolves'), k: F5W.onSheet + (p.i + 1), field: 'effects' },
      h('div', { className: 'ed-inrow' }, h(Sel, { value: what, options: opts, blank: false, ro: ro, label: 'What it changes', field: 'op', onChange: pick }),
        h(SignedIn, { value: e.amount, plus: true, ro: ro, label: 'Amount', field: 'amount', onChange: function (v) { if (v) set('amount', v); } })),
      e.op === 'skill_rank_delta' ? h('div', { className: 'ed-inrow' }, h('span', { className: 'ed-hint', style: { margin: 0 } }, F5W.upToRank),
        h(NumIn, { value: e.max, ro: ro, label: F5W.upToRank, field: 'max', onChange: function (v) { set('max', v == null ? undefined : Math.max(1, v)); } })) : null,
      // an upgrade's sheet number is behind a commit only (R-M10S-5): the cost offers the commit and nothing else
      h('div', { className: 'ed-inrow' }, h(Sel, { value: fpCostKey(e.cost) || 'c1', options: [['c1', F5W.committed(1)], ['c2', F5W.committed(2)]], blank: false, ro: ro, label: 'Cost', field: 'cost',
        onChange: function (v) { set('cost', fpCostOf(v)); } })),
      p.mb[0], h('div', { className: 'ed-fmt' }, fpEffRead(e, vocab)), p.mb[1],
      ro ? null : h('div', { className: 'ed-lineacts' }, h('span'), h('button', { type: 'button', className: 'ed-addline ed-rm-act', onClick: p.onRemove, 'aria-label': TW.rmNumber(label) }, TW.rmNumber(label))));
  }
  // a new line (R-M9B-47's rule): its `words` is the whole upgrade text; its id is minted at the save (mintRowIds). The power's
  // own shapes: a sheet number behind a commit (R-M10S-5), a dial on this power's check (V2, V4)
  function newPowerRow(k, desc, rec) {
    var base = newSpeciesRow('told', desc);
    if (!base) return null;
    var row = k === 'effects' ? { op: 'characteristic_delta', characteristic: 'brawn', amount: 1, cost: { commit_force: 1 } }
      : k === 'pool_mods' ? { die: 'boost', count: 1, direction: 'add', applies_to: null, condition: null }
      : k === 'roll_numbers' ? { op: 'power_dial', moment: 'check', unit: 'range_band', amount: 1, applies_to: [{ scope: 'force_power', value: rec.id }] } : {};
    row.words = base.words;
    return row;
  }
  // one upgrade's rows, key ON: its marked words, one line per row in F5's parts, the four "+ Add …"
  function FpRows(p) {
    var a = p.a, k = p.k, ro = p.ro, rec = p.rec;
    var _e = useState(false), editing = _e[0], setEditing = _e[1];
    var _s = useState(null), sel = _s[0], setSel = _s[1];
    function rowsPut(arr, fn) { p.put(k, function (o) { o[arr] = arrOf(o, arr).slice(); fn(o[arr]); if (!o[arr].length) delete o[arr]; }); }
    var lines = [];
    SP_DRAW.forEach(function (arr) {
      arrOf(a, arr).forEach(function (row, j) {
        var stale = !rowHolds(a.description, row);
        var mark = function () {
          var sp = sel ? spanFrom(a.description, sel) : null; if (!sp) return;
          rowsPut(arr, function (rows) { var n = clone(rows[j]); n.words = sp; if (isObj(n.condition) && !spanOk(a.description, n.condition)) n.condition = clone(sp); rows[j] = n; });
        };
        var mb = ro ? [null, null] : [stale ? h('div', { className: 'ed-fmt ed-stale', 'data-editor-stale': '1', key: 's' }, M8W.stale) : null,
          editing || stale ? h('button', { type: 'button', className: 'ed-addline', key: 'b', 'data-editor-mark': '1', onMouseDown: function (e) { e.preventDefault(); }, onClick: mark }, M8W.mark) : null];
        var lp = { i: j, ro: ro, rec: rec, books: p.books, vocab: p.vocab, mb: mb,
          onChange: function (x) { rowsPut(arr, function (rows) { rows[j] = x; }); }, onRemove: function () { rowsPut(arr, function (rows) { rows.splice(j, 1); }); } };
        var el = arr === 'effects' ? h(FpEffectLine, Object.assign({ e: row }, lp)) : arr === 'pool_mods' ? h(FpDiceLine, Object.assign({ d: row }, lp))
          : arr === 'roll_numbers' ? h(FpDialLine, Object.assign({ rn: row }, lp)) : h(ToldLine, Object.assign({ t: row, sp: true, desc: a.description, key: j }, lp));
        lines.push(h('div', { key: arr + j, 'data-editor-fppart': 'line', 'data-editor-fpline': arr }, el));
      });
    });
    var adds = !ro && newSpeciesRow('told', a.description) ? h('div', { className: 'ed-btnrow', style: { margin: '6px 0 14px', flexWrap: 'wrap' }, 'data-editor-fppart': 'adds' }, SP_ADDS.map(function (x) {
      return h('button', { type: 'button', className: 'ed-addline', key: x[0], 'data-editor-fpadd': x[0], onClick: function () { var row = newPowerRow(x[0], a.description, rec); if (row) rowsPut(x[0], function (rows) { rows.push(row); }); } }, x[1]);
    })) : null;
    return [h(Fl, { chip: 'NARRATIVE', k: FW.words, field: 'abilities.' + k + '.description', key: 'w' }, h('div', { 'data-editor-fppart': 'words' },
        h(MarkedArea, { raw: true, value: a.description, marks: spMarks(a), ro: ro, label: FW.words + ' · ' + (a.name || k), field: 'abilities.' + k + '.description', editing: editing,
          onEdit: function () { setEditing(true); }, onSel: function (x, y) { setSel({ start: x, end: y }); }, onChange: function (v) { p.put(k, function (o) { o.description = v; }); } }))),
      h('div', { key: 'l' }, lines), adds ? h('div', { key: 'a' }, adds) : null];
  }
  // F3's upgrade list: each upgrade's name, its family as a plain label (R-M10S-1's eight, "Other" included) and its words with the
  // registry's tokens raw (frames-card items 1, 7), and its rows (F5, R-M10E-5).
  function UpgradeList(p) {
    var rec = p.rec, ro = p.ro, abs = isObj(rec.abilities) ? rec.abilities : {}, keys = Object.keys(abs);
    function put(k, fn) { var n = clone(rec); n.abilities = Object.assign({}, n.abilities); n.abilities[k] = Object.assign({}, n.abilities[k]); fn(n.abilities[k]); p.onChange(n); }
    function add() { var n = clone(rec), k = newAbilityKey(rec); n.abilities = Object.assign({}, n.abilities); n.abilities[k] = { name: '', description: '', family: 'other' }; p.onChange(n); }
    var ups = keys.map(function (k, i) {
      var a = abs[k] || {};
      // F5: the name's chip is a reading of the upgrade's rows (the species ability's idiom, abilityChip)
      return h('div', { key: k, className: 'ed-up', 'data-editor-upgrade': k },
        h(Fl, { chip: abilityChip(a), k: FW.upgradeK(i + 1), field: 'abilities.' + k + '.name' }, h(TextIn, { value: a.name, ro: ro, label: FW.upgradeK(i + 1), field: 'abilities.' + k + '.name', onChange: function (v) { put(k, function (o) { o.name = v; }); } })),
        h(Fl, { k: FW.family, field: 'abilities.' + k + '.family' }, h('span', { className: 'ed-skill', style: { cursor: 'default' }, 'data-editor-family': a.family || 'other' }, capf(a.family || 'other'))),
        h(FpRows, { k: k, a: a, rec: rec, ro: ro, put: put, books: p.books, vocab: p.vocab }));
    });
    return [h(Sechead, { t: FW.upgradesH, aside: String(keys.length), key: 'uh' }),
      h('div', { className: 'hp-plate ed-stock', 'data-pad': 'data', key: 'up', 'data-editor-upgrades': String(keys.length) },
        h('div', { className: 'ed-ups' }, keys.length ? ups : h('p', { className: 'ed-hint', style: { margin: 0 } }, FW.noUpgrades)),
        ro ? null : h('button', { type: 'button', className: 'ed-addline', onClick: add, 'data-editor-addupgrade': '1' }, FW.addUpgrade))];
  }
  // ── THE BOX TREE, EDITED — one hook for every face that draws a record's `tree` of boxes (the Force power, F4; the signature
  // ability, M12 F2 (d)/(f)): the mode, the selected box, the armed link, the preview's tapped entry, the struck "was <X>",
  // and the two acts (change the tree; join or break a link) ──
  function useBoxTree(p) {
    var rec = p.rec, base = p.base || {};
    var _m = useState('edit'), mode = _m[0], setMode = _m[1];
    var _s = useState(null), sel = _s[0], setSel = _s[1];
    var _a = useState(null), armed = _a[0], setArmed = _a[1];
    var _i = useState(null), tap = _i[0], setTap = _i[1];
    useEffect(function () { if (!armed) return; var t = setTimeout(function () { setArmed(null); }, ARM_MS); return function () { clearTimeout(t); }; }, [armed]);
    var tree = rec.tree || [];
    var was = {}, babs = isObj(base.abilities) ? base.abilities : {};
    tree.forEach(function (row, r) { cellsAt(tree, r).forEach(function (c) {
      var bi = base.tree ? cellIndex(base.tree, r, c.col) : -1, b = bi === -1 ? null : base.tree[r].cells[bi];
      if (b && c && b.ability !== c.ability) was[r + '-' + c.col] = (babs[b.ability] && babs[b.ability].name) || b.ability;
    }); });
    function change(fn) { var n = clone(rec); n.tree = n.tree || []; fn(n.tree, n); p.onChange(n); }
    function edge(r, c, dir, at) {
      var key = r + '-' + c + ':' + dir + (at != null ? ':' + at : '');
      var a = boxAt(tree, r, c), b = dir === 'right' ? boxAt(tree, r, c + ((a && a.span) || 1)) : boxAt(tree, r + 1, at != null ? at : c);
      if (!a || !b) return;
      var joined = dir === 'right' ? !!(a.links && a.links.right && b.links && b.links.left) : !!(a.links && a.links.down && b.links && b.links.up);
      if (joined && armed !== key) { setArmed(key); return; }
      change(function (t) {
        var A = boxAt(t, r, c), B = dir === 'right' ? boxAt(t, r, c + (A.span || 1)) : boxAt(t, r + 1, at != null ? at : c);
        if (dir === 'right') { A.links = Object.assign({}, A.links, { right: !joined }); B.links = Object.assign({}, B.links, { left: !joined }); }
        else setDown(t, r, A, B, !joined);
      });
      setArmed(null);
    }
    var selRC = sel ? sel.split('-').map(Number) : null, selCell = selRC ? boxAt(tree, selRC[0], selRC[1]) : null;
    if (selCell && selCell.col !== selRC[1]) selCell = null;
    return { mode: mode, setMode: setMode, sel: sel, setSel: setSel, armed: armed, tap: tap, setTap: setTap, was: was, tree: tree, change: change, edge: edge, selRC: selRC, selCell: selCell };
  }
  function TreeTabs(p) {
    var B = p.bt;
    return h('div', { className: 'ed-modes', role: 'tablist' },
      h('button', { type: 'button', role: 'tab', className: 'ed-mode', 'aria-selected': B.mode === 'edit' ? 'true' : 'false', onClick: function () { B.setMode('edit'); B.setTap(null); }, 'data-editor-mode': 'edit' }, TW.editTree),
      h('button', { type: 'button', role: 'tab', className: 'ed-mode', 'aria-selected': B.mode === 'preview' ? 'true' : 'false', onClick: function () { B.setMode('preview'); B.setSel(null); }, 'data-editor-mode': 'preview' }, TW.previewBuying));
  }
  function TreeLegend(p) {
    return p.mode === 'edit' ? h('div', { className: 'ed-links-key' }, TW.linksKey + ' ', h('b', { className: 'ed-lk-j' }, '▬ ' + TW.joined), ' ┄ + ' + TW.open + ' ', h('span', { className: 'ed-lk-x' }, '× ' + TW.tapped))
      : null;
  }
  function PowerBody(p) {
    var rec = p.rec, ro = p.ro, wide = p.wide, base = p.base || {};
    var T = window.SWRPGTree;
    var B = useBoxTree(p), mode = B.mode, sel = B.sel, setSel = B.setSel, armed = B.armed, tap = B.tap, setTap = B.setTap, was = B.was, change = B.change, edge = B.edge;
    function slot(r, c) {
      change(function (t) { t[r] = t[r] || { cells: [] }; t[r].cells = cellsAt(t, r).concat([{ ability: '', cost: NEW_BOX_COST, col: c, span: 1, links: { up: false, down: false, left: false, right: false } }]).sort(function (x, y) { return x.col - y.col; }); });
      setSel(r + '-' + c);
    }
    var model = T && T.powerToAuthorModel ? T.powerToAuthorModel({ power: rec, mode: mode, selected: mode === 'edit' ? sel : null, was: was, armed: armed,
      onPick: ro ? null : function (r, c) { setSel(r + '-' + c); }, onEdge: ro ? null : edge, onSlot: ro ? null : slot, slotLabel: FW.addSlot, goneLabel: FW.noUpgrade }) : null;
    var selRC = B.selRC, selCell = B.selCell;
    var tabs = h(TreeTabs, { bt: B }), legend = h(TreeLegend, { mode: mode });
    var board = model ? h('div', { className: 'ed-treewrap', 'data-editor-powertree': '1' }, h(T.DirectionalTree, { model: model, accent: 'var(--doc-action)', onInspect: function (e) { setTap(e); } })) : h(Wait, { w: '100%' });
    var under = mode === 'edit' && !ro ? [h('button', { type: 'button', className: 'ed-addline', key: 'ar', onClick: function () { change(function (t) { t.push({ cells: [] }); }); }, 'data-editor-addrow': '1' }, FW.addRow)] : null;
    var books = booksOf(Object.assign({}, rec, { sources: (p.base && p.base.sources) || rec.sources })).map(function (x) { return String(x).replace(/ Core Rulebook$/, ''); });
    var fields = h('div', { className: 'hp-plate ed-stock', 'data-pad': 'data', 'data-editor-powerfields': '1' },
      h(Fl, { chip: 'NARRATIVE', k: 'Name', field: 'name', bad: p.bad && p.bad.name }, h(TextIn, { value: rec.name, ro: ro, label: 'Name', field: 'name', onChange: function (v) { var n = clone(rec); n.name = v; p.onChange(n); } })),
      h(Fl, { chip: 'NARRATIVE', k: 'Description', field: 'description' }, h(GrowArea, { value: rec.description, ro: ro, label: 'Description', field: 'description', onChange: function (v) { var n = clone(rec); if (v) n.description = v; else delete n.description; p.onChange(n); } })),
      h(Fl, { chip: 'AUTOMATIC', k: FW.frK, field: 'min_force_rating' }, h(NumIn, { value: rec.min_force_rating, ro: ro, label: FW.frK, field: 'min_force_rating',
          onChange: function (v) { var n = clone(rec); if (v != null && v >= 1) n.min_force_rating = v; else delete n.min_force_rating; p.onChange(n); } }),
        h('p', { className: 'ed-hint', style: { marginBottom: 0 } }, FW.frHint)),
      books.length ? h(Fl, { k: [FW.books, ' ', h('span', { className: 'ed-yours', key: 'c', style: { marginLeft: 6 } }, SW.carried)], field: 'sources' }, h(RoField, { value: books.join(' · '), label: FW.books, field: 'sources' })) : null);
    var panel = selCell && mode === 'edit' && !ro ? h(BoxPanel, { key: sel, rec: rec, cell: selCell, row: selRC[0], base: base, ro: ro,
      put: function (fn) { change(function (t) { var c = boxAt(t, selRC[0], selRC[1]); if (c) fn(c); }); },
      onRemove: function () { change(function (t) { var i = cellIndex(t, selRC[0], selRC[1]); if (i !== -1) t[selRC[0]].cells.splice(i, 1); }); setSel(null); },
      onDone: wide ? null : function () { setSel(null); } }) : null;
    var tapped = tap && mode === 'preview' ? h(PreviewTap, { entry: tap, onDone: wide ? null : function () { setTap(null); } }) : null;
    var stage = h('div', { style: { minWidth: 0 } }, tabs, legend, board, under);
    var ups = h(UpgradeList, { rec: rec, ro: ro, onChange: p.onChange, books: p.books, vocab: p.vocab });
    var side = panel || tapped;
    if (wide) return h('div', { 'data-editor-tree': mode },
      h('div', { className: 'ed-treegrid', 'data-side': side ? '1' : undefined }, h('div', null, fields), stage, side ? h('div', null, side) : null),
      h('div', { className: 'ed-upsw' }, ups));
    return h('div', { 'data-editor-tree': mode }, stage, h('div', { style: { marginTop: 14 } }, fields), ups,
      side ? h('div', { className: 'ed-sheet', role: 'dialog', 'aria-label': panel ? FW.box(selRC[0] + 1, selRC[1] + 1) : 'Preview' }, h('div', { className: 'ed-grab', 'aria-hidden': 'true' }), side) : null);
  }
  // the save: a trimmed name; empty rows dropped (a row is "as many as needed", F4); cells in column order
  function normalizePower(rec) {
    var r = clone(rec);
    if (typeof r.name === 'string') r.name = r.name.trim();
    if (!r.name) delete r.name;
    if (Array.isArray(r.tree)) r.tree = r.tree.filter(function (row) { return row && Array.isArray(row.cells) && row.cells.length; })
      .map(function (row) { return Object.assign({}, row, { cells: row.cells.slice().sort(function (a, b) { return a.col - b.col; }) }); });
    // the M9 row editor's ONE key-blind save rule (R-M9B-46): a row is kept while every span it carries holds over its own
    // upgrade's words, so an edit of the words (live, key OFF) never saves a row whose span no longer reads; a new row's id is
    // minted by the applier's row_slug rule (R-M9B-48)
    if (isObj(r.abilities)) Object.keys(r.abilities).forEach(function (k) {
      var a = r.abilities[k]; if (!isObj(a)) return;
      if (typeof a.name === 'string') a.name = a.name.trim();
      SPECIES_ROW_ARRAYS.forEach(function (arr) {
        if (!Array.isArray(a[arr])) return;
        var kept = a[arr].filter(function (row) { return rowHolds(a.description, row); });
        if (kept.length) a[arr] = kept; else delete a[arr];
      });
      r.abilities[k] = mintRowIds(a);
    });
    return r;
  }
  // R-M10E-3: the ONE tree check's three refusals (the pack rail's own function), after the editor's own reasons, in I-10's idiom
  function powerCheck(rec) {
    var w = [], bad = {}, PV = window.SWRPGPackValidate;
    if (!rec.name) { w.push(TW.giveName); bad.name = true; }
    var abs = isObj(rec.abilities) ? rec.abilities : {};
    if (Object.keys(abs).some(function (k) { return !isObj(abs[k]) || !abs[k].name; })) w.push(FW.needUpgradeName);
    (rec.tree || []).forEach(function (row, r) { cellsAt(rec.tree, r).forEach(function (c) { if (typeof c.cost !== 'number' || c.cost < 1) w.push(FW.needCost(FW.box(r + 1, c.col + 1))); }); });
    if (PV && PV.powerTreeProblems) PV.powerTreeProblems(rec).forEach(function (t) { w.push(t.words); });
    return w.length ? { words: w, bad: bad } : null;
  }

  // ══ M12 F2 (d)/(f) — THE SIGNATURE ABILITY (R-M12B-9, D-157; routes R-M12B-102). The power's tree editor (useBoxTree, the one
  // author model, BoxPanel's parts) with the ability's own fields: Name, Career CARRIED, Attaches under, Books CARRIED; the box
  // panel draws Upgrade · Cost · What it changes · Words; under the tree, WHERE IT ATTACHES and WHAT THE UPGRADES CHANGE. A new
  // ability (F2 (f)) starts with "+ Add the base ability"; its columns are picked, not carried. ══
  var SGW = {
    // ── the frames' words (Docs/mockups/f100-m12-careers.html, scripts/f100_m12_frames.py SW), verbatim ──
    fromBook: 'Signature ability · from the book', newName: 'New signature ability',
    career: 'Career', attachK: 'Attaches under', attachV: function (cols, nm) { return 'Columns ' + joinList(cols.map(String), 'and') + ' of every ' + nm + ' tree'; },
    attachH: 'Where it attaches', attachAside: function (cols) { return 'columns ' + cols.join(' and '); },
    attachHint: 'Its base box sits under the bottom row of each of the career’s trees, joined at the marked columns.', joins: 'joins',
    actH: 'What the upgrades change', whatK: 'What it changes', boxes: function (n) { return n + ' boxes'; },
    uses: function (v) { return v === 1 ? 'One more use per session for each one bought' : v + ' more uses per session for each one bought'; },
    destiny: function (v, was) { return 'Costs ' + v + ' Destiny ' + plural(v, 'Point', 'Points') + ' to use' + (was != null && was !== v ? ' instead of ' + was : ''); },
    range: function (v) { return v === 1 ? 'Reaches one more range band for each one bought' : 'Reaches ' + v + ' more range bands for each one bought'; },
    addBase: '+ Add the base ability',
    // ── implementer's chrome (undrawn; each named in the gate) ──
    rangeSet: function (v) { return 'Reaches ' + String(v) + ' range'; },
    duration: function (v) { return 'Lasts ' + v + ' more ' + plural(v, 'round', 'rounds') + ' for each one bought'; },
    strain: function (v) { return 'Costs ' + Math.abs(v) + ' ' + (v < 0 ? 'less' : 'more') + ' strain to use for each one bought'; },
    actAdd: function (v) { return 'Can also be used as ' + (/^[aeiou]/i.test(String(v)) ? 'an ' : 'a ') + String(v).replace(/_/g, ' '); },
    silhouette: function (v) { return 'Reaches targets ' + v + ' silhouette larger for each one bought'; },
    needBase: 'Add the base ability.', needCols: 'Pick at least one column it attaches under.',
    noUpgrade: function (r, c) { return 'Box ' + r + '-' + c + ' has no upgrade. Pick one.'; },
    link: function (r, c) { return 'Box ' + r + '-' + c + ' isn’t linked to the row above.'; },
  };
  // every book ability is a base (30 XP) over two rows of four (10, then 15 XP) — measured over the 38 records; a new box takes its row's
  var SIG_COST = [30, 10, 15], SIG_ROWS = 3;
  // R-M12B-118: a cost the author wrote is `authored` — every cell of a /new ability, and a copied cell whose cost differs from its
  // book cell's (back at the book's cost, it keeps the book's status); an unchanged copied cell keeps the book's
  var AUTHORED = 'authored';
  function sigCostStatus(base, r, col, cost) {
    var bc = base && base.tree ? cellsAt(base.tree, r).filter(function (x) { return x && x.col === col; })[0] : null;
    return bc && bc.cost === cost && bc.cost_status ? bc.cost_status : AUTHORED;
  }
  function sigBaseKey(rec) { var c = cellsAt(rec.tree || [], 0)[0]; return c && typeof c.ability === 'string' ? c.ability : null; }
  function blankSig() { return { name: '', careers: sigHeld && sigHeld.career ? [sigHeld.career] : [], attach: { columns: [] }, abilities: {}, tree: [] }; }
  // one activation change, read in the mechanics voice (F2 (d) draws three; the rest are the implementer's, named in the gate)
  function sigModRead(m, rec) {
    var b = isObj(rec.abilities) ? rec.abilities[sigBaseKey(rec)] : null, was = b && isObj(b.use_cost) ? b.use_cost.destiny : null;
    if (!isObj(m)) return '';
    if (m.op === 'uses_per_session_delta') return SGW.uses(m.value);
    if (m.op === 'destiny_cost_set') return SGW.destiny(m.value, was);
    if (m.op === 'range_delta') return SGW.range(m.value);
    if (m.op === 'range_set') return SGW.rangeSet(m.value);
    if (m.op === 'duration_delta') return SGW.duration(m.value);
    if (m.op === 'strain_cost_delta') return SGW.strain(m.value);
    if (m.op === 'activation_add') return SGW.actAdd(m.value);
    if (m.op === 'target_silhouette_delta') return SGW.silhouette(m.value);
    return String(m.op).replace(/_/g, ' ');
  }
  function sigChanges(a, rec) { return arrOf(a || {}, 'activation_mods').map(function (m) { return sigModRead(m, rec); }).filter(Boolean); }
  // the Upgrade select: this ability's own upgrades, then every upgrade name the books' abilities use (picking one makes it this
  // ability's own, words empty — the open state is undrawn, named in the gate)
  var sigVocabCache = null;
  function sigVocab(books) {
    var t = (books.sections && books.sections.signature_abilities) || {};
    if (sigVocabCache && sigVocabCache.t === t) return sigVocabCache.names;
    var seen = {};
    Object.keys(t).forEach(function (id) { var r = t[id], bk = sigBaseKey(r); Object.keys(r.abilities || {}).forEach(function (k) { var n = r.abilities[k] && r.abilities[k].name; if (k !== bk && n) seen[String(n).trim()] = 1; }); });
    var names = Object.keys(seen).sort(function (a, b) { return a.localeCompare(b, 'en', { sensitivity: 'base' }); });
    sigVocabCache = { t: t, names: names }; return names;
  }
  // WHERE IT ATTACHES: the career's trees, A–Z, each tree's bottom row with the marked columns
  function SigAttach(p) {
    var cols = p.cols, car = p.career, books = p.books;
    var specT = (books.sections && books.sections.specializations) || {}, talT = (books.sections && books.sections.talents) || {};
    var trees = (car && car.rec ? arrOf(car.rec, 'specializations') : []).map(function (id) { return specT[id]; }).filter(Boolean)
      .sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
    return [h(Sechead, { t: SGW.attachH, aside: SGW.attachAside(cols), key: 'h' }),
      h('div', { className: 'hp-plate ed-stock', 'data-pad': 'data', key: 'p', 'data-editor-attach': car ? car.id : '' },
        h('p', { className: 'ed-hint', style: { marginTop: 0 } }, SGW.attachHint),
        trees.map(function (sp) {
          var tt = Array.isArray(sp.talent_tree) ? sp.talent_tree : [], last = tt.length ? (tt[tt.length - 1].talents || []) : [];
          return h('div', { key: sp.id, className: 'ed-atree', 'data-editor-attach-tree': sp.id }, h('div', { className: 'ed-fk' }, sp.name),
            h('div', { className: 'ed-agrid' }, [0, 1, 2, 3].map(function (i) {
              var c = last[i], id = c && c.talent, on = cols.indexOf(i + 1) !== -1;
              return h('div', { key: i, className: 'ed-acell', 'data-on': on ? '1' : undefined }, (id && talT[id] && talT[id].name) || id || '',
                on ? h('div', { className: 'ed-ajoin' }, '▼ ' + SGW.joins) : null);
            })));
        }))];
  }
  // WHAT THE UPGRADES CHANGE: one row per upgrade with a change, its boxes counted
  function SigChanges(p) {
    var rec = p.rec, abs = isObj(rec.abilities) ? rec.abilities : {}, bk = sigBaseKey(rec), n = {}, order = [];
    (rec.tree || []).forEach(function (row, r) { cellsAt(rec.tree, r).forEach(function (c) { if (c.ability === bk || !abs[c.ability] || !sigChanges(abs[c.ability], rec).length) return; if (!n[c.ability]) { n[c.ability] = 0; order.push(c.ability); } n[c.ability]++; }); });
    if (!order.length) return null;
    return [h(Sechead, { t: SGW.actH, aside: String(order.length), key: 'h' }),
      h('div', { className: 'hp-plate ed-stock', 'data-pad': 'data', key: 'p', 'data-editor-activation': String(order.length) }, order.map(function (k) {
        return h(Fl, { k: (abs[k].name || k) + (n[k] > 1 ? ' · ' + SGW.boxes(n[k]) : ''), field: 'abilities.' + k + '.activation_mods', key: k },
          sigChanges(abs[k], rec).map(function (w, i) { return h('div', { className: 'ed-fmt', key: i }, w); }));
      }))];
  }
  // the box panel, as F2 (d) draws it: Upgrade (not on the base) · Cost · What it changes · Words
  function SigBoxPanel(p) {
    var rec = p.rec, c = p.cell, r = p.row, abs = isObj(rec.abilities) ? rec.abilities : {}, isBase = r === 0;
    var ab = typeof c.ability === 'string' && Object.prototype.hasOwnProperty.call(abs, c.ability) ? abs[c.ability] : null;
    var now = ab ? ab.name || c.ability : FW.noUpgrade, label = FW.box(r + 1, c.col + 1), bk = sigBaseKey(rec);
    var own = Object.keys(abs).filter(function (k) { return k !== bk; }).map(function (k) { return [k, abs[k].name || k]; });
    var ownNames = own.map(function (o) { return String(o[1]).toLowerCase(); });
    var opts = own.concat(sigVocab(p.books).filter(function (nm) { return ownNames.indexOf(nm.toLowerCase()) === -1; }).map(function (nm) { return ['v:' + nm, nm]; }));
    function pick(v) {
      if (v.indexOf('v:') !== 0) { p.put(function (cell) { cell.ability = v; }); return; }
      p.edit(function (n) { var k = newAbilityKey(n); n.abilities = Object.assign({}, n.abilities); n.abilities[k] = { name: v.slice(2), description: '' }; var x = boxAt(n.tree, r, c.col); if (x) x.ability = k; });
    }
    var ch = ab ? sigChanges(ab, rec) : [];
    return h('div', { className: 'hp-plate ed-picker', 'data-pad': 'read', 'data-editor-boxpanel': label },
      p.onDone ? h('div', { style: { display: 'flex', justifyContent: 'flex-end' } }, h('button', { type: 'button', className: 'hp-quiet', onClick: p.onDone, 'data-editor-picker-done': '1' }, 'Done')) : null,
      h('div', { className: 'ed-fk' }, label), h('h3', { className: 'ed-plate-h' }, now),
      isBase ? null : h(Fl, { k: FW.pick, field: 'tree.ability' }, h(Sel, { value: ab ? c.ability : '', options: opts, blankLabel: FW.noUpgrade, ro: p.ro, label: FW.pick, field: 'tree.ability', onChange: function (v) { if (v) pick(v); } })),
      h(Fl, { chip: keyChip('signature_abilities', 'tree.cost'), k: FW.cost, field: 'tree.cost' }, h('div', { className: 'ed-inrow' },
        h(NumIn, { value: c.cost, ro: p.ro, label: FW.cost, field: 'tree.cost', onChange: function (v) { p.put(function (cell) { cell.cost = v; cell.cost_status = sigCostStatus(p.base, r, c.col, v); }); } }),
        h('span', { className: 'ed-hint', style: { margin: 0 } }, 'XP'))),
      ch.length ? h(Fl, { k: SGW.whatK, field: 'activation_mods' }, ch.map(function (w, i) { return h('div', { className: 'ed-fmt', key: i, style: { fontWeight: 400 } }, w); })) : null,
      ab ? h(Fl, { chip: 'NARRATIVE', k: FW.words, field: 'abilities.' + c.ability + '.description' }, h(GrowArea, { value: ab.description, ro: p.ro, label: FW.words + ' · ' + now, field: 'abilities.' + c.ability + '.description',
        onChange: function (v) { p.edit(function (n) { n.abilities = Object.assign({}, n.abilities); n.abilities[c.ability] = Object.assign({}, n.abilities[c.ability], { description: v }); }); } })) : null,
      p.ro || !p.canRemove || isBase ? null : h('div', { className: 'ed-btnrow', style: { marginTop: 10 } }, h('button', { type: 'button', className: 'ed-addline', onClick: p.onRemove, 'data-editor-removebox': '1' }, FW.removeBox)));
  }
  function SigBody(p) {
    var rec = p.rec, ro = p.ro, wide = p.wide, books = p.books, car = p.career, colsEdit = !!p.colsEdit;
    var T = window.SWRPGTree;
    var B = useBoxTree(p), mode = B.mode, sel = B.sel, setSel = B.setSel, tree = B.tree, change = B.change;
    var cols = isObj(rec.attach) && Array.isArray(rec.attach.columns) ? rec.attach.columns : [];
    var bk = sigBaseKey(rec), abs = isObj(rec.abilities) ? rec.abilities : {};
    function edit(fn) { var n = clone(rec); n.tree = n.tree || []; fn(n); p.onChange(n); }
    function setName(v) {
      edit(function (n) {
        // a base box named as the ability follows its name (F2 (f): "Lucky Break" is the record and its base box)
        var b = bk && n.abilities && n.abilities[bk]; if (b && (!b.name || b.name === rec.name)) n.abilities[bk] = Object.assign({}, b, { name: v });
        n.name = v;
      });
    }
    function addBase() {
      edit(function (n) { n.abilities = Object.assign({}, n.abilities); n.abilities.base = { name: rec.name || '', description: '' };
        n.tree = [{ cells: [{ ability: 'base', cost: SIG_COST[0], col: 0, span: 4, links: { up: false, down: true, left: false, right: false }, cost_status: AUTHORED }] }]; });
    }
    function slot(r, c) {
      change(function (t) { while (t.length <= r) t.push({ cells: [] }); t[r].cells = cellsAt(t, r).concat([{ ability: '', cost: SIG_COST[r] || SIG_COST[SIG_COST.length - 1], col: c, span: 1, links: { up: false, down: false, left: false, right: false }, cost_status: AUTHORED }]).sort(function (x, y) { return x.col - y.col; }); });
      setSel(r + '-' + c);
    }
    // the rows drawn: the record's, then (while authoring) the next open row of four, up to the base and two rows
    var shown = clone(rec); shown.tree = (shown.tree || []).slice();
    if (!ro && mode === 'edit' && shown.tree.length && shown.tree.length < SIG_ROWS && cellsAt(shown.tree, shown.tree.length - 1).length) shown.tree.push({ cells: [] });
    var model = T && T.powerToAuthorModel && tree.length ? T.powerToAuthorModel({ power: shown, mode: mode, selected: mode === 'edit' ? sel : null, was: B.was, armed: B.armed,
      onPick: ro ? null : function (r, c) { setSel(r + '-' + c); }, onEdge: ro ? null : B.edge, onSlot: ro ? null : slot, slotLabel: FW.addSlot, goneLabel: FW.noUpgrade }) : null;
    var board = !tree.length ? (ro ? h('p', { className: 'ed-hint' }, FW.noUpgrades) : h('button', { type: 'button', className: 'ed-slotbase', onClick: addBase, 'data-editor-addbase': '1' }, SGW.addBase))
      : model ? h('div', { className: 'ed-treewrap', 'data-editor-powertree': '1' }, h(T.DirectionalTree, { model: model, accent: 'var(--doc-action)', onInspect: function (e) { B.setTap(e); } })) : h(Wait, { w: '100%' });
    var stage = h('div', { style: { minWidth: 0 } }, h(TreeTabs, { bt: B }), h(TreeLegend, { mode: mode }), board);
    var bks = sigBooksOf(p.base && p.base.sources ? Object.assign({}, rec, { sources: p.base.sources, cite: p.base.cite }) : rec);
    var fields = h('div', { className: 'hp-plate ed-stock', 'data-pad': 'data', 'data-editor-sigfields': '1' },
      h(Fl, { chip: 'NARRATIVE', k: 'Name', field: 'name', bad: p.bad && p.bad.name }, h(TextIn, { value: rec.name, ro: ro, label: 'Name', field: 'name', placeholder: colsEdit ? SGW.newName : undefined, onChange: setName })),
      h(Fl, { k: [SGW.career, ' ', h('span', { className: 'ed-yours', key: 'c', style: { marginLeft: 6 } }, SW.carried)], field: 'careers' }, h(RoField, { value: car ? car.name : arrOf(rec, 'careers')[0] || '', label: SGW.career, field: 'careers' })),
      h(Fl, { chip: keyChip('signature_abilities', 'attach.columns'), k: SGW.attachK, field: 'attach.columns', bad: p.bad && p.bad.attach }, colsEdit
        ? [h('div', { className: 'ed-btnrow', key: 'b' }, [1, 2, 3, 4].map(function (n) {
            var on = cols.indexOf(n) !== -1;
            return h('button', { type: 'button', key: n, className: 'hp-quiet ed-colpick', 'aria-pressed': on ? 'true' : 'false', 'data-on': on ? '1' : undefined, disabled: ro, 'data-editor-col': String(n),
              onClick: function () { edit(function (x) { var c = cols.filter(function (k) { return k !== n; }); if (!on) c.push(n); x.attach = Object.assign({}, x.attach, { columns: c.sort() }); }); } }, String(n));
          }))]
        : h('div', { className: 'ed-fmt', style: { fontWeight: 400 } }, cols.length ? SGW.attachV(cols, car ? car.name : '') : IW.none)),
      bks.length ? h(Fl, { k: [FW.books, ' ', h('span', { className: 'ed-yours', key: 'c', style: { marginLeft: 6 } }, SW.carried)], field: 'sources' }, h(RoField, { value: bks.join(' · '), label: FW.books, field: 'sources' })) : null);
    var selRC = B.selRC, selCell = B.selCell;
    var panel = selCell && mode === 'edit' && !ro ? h(SigBoxPanel, { key: sel, rec: rec, cell: selCell, row: selRC[0], ro: ro, books: books, canRemove: colsEdit, edit: edit, base: p.colsEdit ? null : p.base,
      put: function (fn) { change(function (t) { var c = boxAt(t, selRC[0], selRC[1]); if (c) fn(c); }); },
      onRemove: function () { change(function (t) { var i = cellIndex(t, selRC[0], selRC[1]); if (i !== -1) t[selRC[0]].cells.splice(i, 1); }); setSel(null); } }) : null;
    var tapped = B.tap && mode === 'preview' ? h(PreviewTap, { entry: B.tap, onDone: wide ? null : function () { B.setTap(null); } }) : null;
    var side = panel || tapped;
    var att = colsEdit || !cols.length ? null : h(SigAttach, { cols: cols, career: car, books: books });
    var chg = h(SigChanges, { rec: rec });
    var anyChg = Object.keys(abs).some(function (k) { return k !== bk && sigChanges(abs[k], rec).length; });
    var below = att || anyChg ? h('div', { className: wide ? 'ed-dgrid ed-sigbelow' : 'ed-sigbelow' }, h('div', null, att), h('div', null, chg)) : null;
    if (wide) return h('div', { 'data-editor-tree': mode, 'data-editor-sig': rec.id || 'new' },
      h('div', { className: 'ed-treegrid', 'data-side': side ? '1' : undefined }, h('div', null, fields), stage, side ? h('div', null, side) : null), below);
    return h('div', { 'data-editor-tree': mode, 'data-editor-sig': rec.id || 'new' }, stage, h('div', { style: { marginTop: 14 } }, fields), side ? h('div', { style: { marginTop: 14 } }, side) : null, below);
  }
  function normalizeSig(rec) {
    var r = clone(rec);
    if (typeof r.name === 'string') r.name = r.name.trim();
    if (!r.name) delete r.name;
    if (Array.isArray(r.tree)) r.tree = r.tree.filter(function (row) { return row && Array.isArray(row.cells) && row.cells.length; })
      .map(function (row) { return Object.assign({}, row, { cells: row.cells.slice().sort(function (a, b) { return a.col - b.col; }) }); });
    var bk = sigBaseKey(r);
    if (isObj(r.abilities)) Object.keys(r.abilities).forEach(function (k) {
      var a = r.abilities[k]; if (!isObj(a)) return;
      if (typeof a.name === 'string') a.name = a.name.trim();
      if (k === bk && !a.name && r.name) a.name = r.name;
    });
    return r;
  }
  // the editor's own reasons (I-10's idiom); the tree's joins read THE ONE LINK RULE (packValidate.treeCellsJoined)
  function sigCheck(rec) {
    var w = [], bad = {}, PV = window.SWRPGPackValidate, abs = isObj(rec.abilities) ? rec.abilities : {}, tree = rec.tree || [];
    if (!rec.name) { w.push(TW.giveName); bad.name = true; }
    var bk = sigBaseKey(rec);
    if (!bk || !isObj(abs[bk])) w.push(SGW.needBase);
    if (!(isObj(rec.attach) && Array.isArray(rec.attach.columns) && rec.attach.columns.length)) { w.push(SGW.needCols); bad.attach = true; }
    var boxes = [];
    tree.forEach(function (row, r) { cellsAt(tree, r).forEach(function (c) {
      if (!(typeof c.ability === 'string' && isObj(abs[c.ability]))) w.push(SGW.noUpgrade(r + 1, c.col + 1));
      if (typeof c.cost !== 'number' || c.cost < 1) w.push(FW.needCost(FW.box(r + 1, c.col + 1)));
      boxes.push({ r: r, c: c.col, span: c.span || 1, L: isObj(c.links) ? c.links : {} });
    }); });
    if (PV && PV.treeCellsJoined) {
      var seen = boxes.filter(function (b) { return b.r === 0; }), q = seen.slice();
      while (q.length) { var a = q.shift(); boxes.forEach(function (b) { if (seen.indexOf(b) === -1 && PV.treeCellsJoined(a, b)) { seen.push(b); q.push(b); } }); }
      boxes.forEach(function (b) { if (b.r > 0 && seen.indexOf(b) === -1) w.push(SGW.link(b.r + 1, b.c + 1)); });
    }
    return w.length ? { words: w, bad: bad } : null;
  }

  // ── THE EDITOR (the one mount both hosts make) ──
  function Editor(p) {
    var E = ED(), route = E.parse(p.path) || { view: 'home', host: p.host };
    var store = useStore(), _b = useBooks(), books = _b[0], retry = _b[1];
    var vocab = useVocab();
    var wide = useWide();
    var intentRef = useRef(null);
    // a level whose record or collection does not exist falls back to its shelf (the URL replaced), once the data is here —
    // on ARRIVAL only: a form already open on this route stays open when another tab removes its record (P5 / P5b say so)
    var ready = books.state === 'ok' && store.ready;
    var openedRoute = useRef(null);
    var fallback = null;
    // R-SII-10: an /in/ route resolves through the switch's one resolver — an OLD link lands on home (my_data) or the first own
    // row of its packId, and the URL is replaced with the canonical form (the ~ form exactly when that packId is held twice)
    var rin = ready && route.view === 'record' && route.packId ? E.resolveIn(route, store.list || []) : null;
    var shelfless = (E.SHELFLESS || []).indexOf(route.shelf) !== -1;
    if (ready && route.view === 'record' && openedRoute.current !== route.canonical) {
      // a shelf-less kind (R-M12B-102) has no shelf to fall back to: HOME, replaced
      if (route.packId ? !(rin && recordIn(rin.ck, route.shelf, route.id, books)) : !bookRecOf(books, route.shelf, route.id)) fallback = shelfless ? { host: route.host, view: 'home' } : { host: route.host, view: 'shelf', shelf: route.shelf };
    }
    // R-M12B-102: a signature ability's draft holds its career; a reload (no held draft) resolves to the Careers shelf, replaced
    if (route.view === 'draft' && shelfless && !sigHeld) fallback = { host: route.host, view: 'shelf', shelf: 'careers' };
    var canonical = fallback ? E.pathFor(fallback) : (rin && openedRoute.current !== route.canonical ? rin.route.canonical : route.canonical);
    useEffect(function () { if (canonical !== String(p.path || '').replace(/\/+$/, '')) p.navigate(canonical, { replace: true }); }, [canonical, p.path]);
    var go = function (r, intent, replace) { intentRef.current = intent || null; if (!replace) navedInApp = true; p.navigate(E.pathFor(Object.assign({ host: route.host }, r)), replace ? { replace: true } : undefined); };
    var openRecord = function (ck, r) { go(recRoute(r.section, ck, r.id)); };
    var common = { store: store, books: books, wide: wide, appName: p.appName, roster: p.roster, go: go, exit: p.exit, retry: retry, openRecord: openRecord, aim: p.aim };
    var body;
    var item = route.view === 'shelf' || route.view === 'record' || route.view === 'draft';
    if (route.view === 'collections') body = h(Collections, Object.assign({ key: 'c', intent: intentRef.current }, common));
    else if (!item || books.state === 'error') body = h(Home, Object.assign({ key: 'h' }, common));   // S3: the books did not load, so HOME's notice says so
    else if (!ready || !vocab || fallback) body = h('div', { className: wide ? 'ed-desk' : 'ed-pad', 'aria-busy': 'true', key: 'w' },
      h(Runhead, { back: 'Homebrew', right: shelfName(route.shelf), onBack: function () { go({ view: 'home' }); } }), h(Wait, { w: '12em' }), h('div', { style: { height: 12 } }), h(Wait, { w: '100%' }));
    else if (route.view === 'shelf') body = h(route.shelf === 'talents' ? TalentShelf : route.shelf === 'specializations' ? SpecShelf : route.shelf === 'species' ? SpeciesShelf : route.shelf === 'force_powers' ? ForceShelf : route.shelf === 'careers' ? CareerShelf : Shelf, Object.assign({ key: 's:' + route.shelf, sec: route.shelf }, common));
    else body = h(RecordForm, Object.assign({ key: 'r:' + route.canonical, route: route, vocab: vocab }, common));
    openedRoute.current = body && body.type === RecordForm ? route.canonical : null;
    return h('div', { className: 'ed-page', 'data-doc-ground': 'creator', 'data-editor': E.screenId(route), 'data-band': wide ? 'wide' : 'narrow' }, body);
  }

  // ── "Your homebrew" — ONE module for both Sources surfaces (the mirror law; ruling f100-items-live-card R-FIL-5 as amended by
  // f100-items-live-contracts R-FILC-7): one data path, one switch, one order, one tie rule, here; each host renders it in its
  // own idiom — the creator's Sources overlay below (M3a/b, M5a/b; ruling f100-m2c-frames L1/L3/L6), the ⚙ Active sources
  // panel after it (P4, both apps, both faces). ──
  function useHomebrewGroup() {
    var store = useStore();
    // THE TIES NEED THE BOOKS: an imported record is stored as its changes over a book record, so the store can apply it —
    // and see two collections change one record — only once that book is loaded. The creator and the editor load them; ⚙
    // can open on a screen that has not (the GM toolbox), so the group loads them itself, once, and reads the ties again.
    var _b = useState(0), bump = _b[1];
    var needBooks = !!(store.list && store.list.some(function (c) { return c.origin === 'imported' && c.records > 0; }));
    useEffect(function () {
      if (!needBooks) return;
      var alive = true;
      booksOnce().then(function () { if (alive) bump(function (n) { return n + 1; }); }, function () {});
      return function () { alive = false; };
    }, [needBooks]);
    if (!store.ready || !store.list) return null;
    var list = store.list, U = UD(), ties = U.conflicts ? U.conflicts() : (store.ties || []);
    var own = ordered(list).filter(function (c) { return c.origin === 'own'; });
    var imported = list.filter(function (c) { return c.origin === 'imported'; }).slice().reverse();   // winner first (list() is fold order)
    var byStamp = {}; list.forEach(function (c) { if (c.stamp) byStamp[c.stamp] = c; });
    // the record's NAME as the layer applies it (resolve-at-render): an imported record is stored share-shaped — its changes
    // and its anchor, no name — so the stored copy would name it by its id (M5a / P4 draw the name, e.g. "Heavy Blaster Pistol")
    function recName(sec, id, stamp) {
      var p = U.stampSync ? U.stampSync(stamp) : null, r = p && p.sections && p.sections[sec] && p.sections[sec][id];
      if (!r) { var c = byStamp[stamp], k = c && U.get(c.ck); r = k && k.pack && k.pack.sections && k.pack.sections[sec] && k.pack.sections[sec][id]; }
      return (r && r.name) || id;
    }
    function tieFor(c) {
      var t = ties.filter(function (x) { return x.layers.indexOf(c.stamp) !== -1 && x.layers.some(function (l) { return l !== c.stamp && byStamp[l] && byStamp[l].origin === 'imported'; }); })[0];
      if (!t) return null;
      var win = byStamp[t.winner];
      return win ? W.tie(recName(t.section, t.id, t.winner), win.name) : null;
    }
    function move(c, dir) {
      // the fold order of the imported layer: a row moved UP is folded LATER (it wins more)
      var fold = list.map(function (x) { return x.ck; });
      var imps = list.filter(function (x) { return x.origin === 'imported'; }).map(function (x) { return x.ck; });
      var i = imps.indexOf(c.ck), j = dir === 'up' ? i + 1 : i - 1;
      if (i === -1 || j < 0 || j >= imps.length) return;
      var t = imps[i]; imps[i] = imps[j]; imps[j] = t;
      var k = 0; var next = fold.map(function (ck) { return list.filter(function (x) { return x.ck === ck; })[0].origin === 'imported' ? imps[k++] : ck; });
      U.setOrder(next);
    }
    return { store: store, own: own, imported: imported, held: held(store), tieFor: tieFor, move: move, shown: own.concat(imported),
      toggle: function (c) { U.setActive(c.ck, !c.active); },
      first: function (c) { return imported.indexOf(c) <= 0; }, last: function (c) { return imported.indexOf(c) === imported.length - 1; } };
  }
  // the creator's Sources overlay (M3a/b, M5a/b)
  function HomebrewSources() {
    var g = useHomebrewGroup();
    if (!g) return null;
    function row(c, ordered_) {
      var tie = ordered_ ? g.tieFor(c) : null;
      return h('div', { className: 'ed-hb-row', key: c.ck, 'data-editor-hb': c.packId },
        h('button', { type: 'button', className: 'ed-hb-hit', role: 'switch', 'aria-checked': c.active ? 'true' : 'false', disabled: g.held,
          onClick: function () { g.toggle(c); } },
          h('span', { className: 'sb-tick', 'aria-hidden': 'true' }, c.active ? '✓' : ''),
          h('span', { className: 'sb-bk-name', style: c.active ? undefined : { color: 'var(--doc-ink-muted)' } }, c.name)),
        ordered_ ? h('span', { className: 'ed-hb-ord' },
          h('button', { type: 'button', className: 'hp-quiet', disabled: g.held || g.first(c), onClick: function () { g.move(c, 'up'); } }, W.up),
          h('button', { type: 'button', className: 'hp-quiet', disabled: g.held || g.last(c), onClick: function () { g.move(c, 'down'); } }, W.down)) : null,
        h('span', { className: 'ed-hb-g' }, tellApart(c, g.shown).map(function (t, i) { return h('span', { key: 'ta' + i, style: { display: 'block', color: 'var(--doc-ink)' }, 'data-ms-line': 'apart' }, t); }), W.glance(c)),
        tie ? h('span', { className: 'ed-hb-tie' }, tie) : null);
    }
    return h('div', { 'data-doc-ground': 'creator', 'data-sources-homebrew': '1' },
      h(Banner, { status: g.store.status }),
      h('div', { className: 'sb-grp', 'data-sources-group': W.group },
        h('div', { className: 'sb-grp-h' }, h('span', { className: 'sb-tick', 'aria-hidden': 'true' }), h('span', { className: 'sb-bk-name' }, W.group), h('span', { className: 'mk-grp-sum' })),
        g.own.map(function (c) { return row(c, false); }),
        h('div', { className: 'ed-hb-pin' }, W.pin),
        g.imported.map(function (c) { return row(c, true); })));
  }
  // the ⚙ Active sources panel (P4a/P4c; R-FILC-7): the SAME group in the panel's idiom — a ledger head "YOUR HOMEBREW" with its
  // count and ▾ (a 44px collapse control, R8a), each collection a plated row with the panel's ON/OFF pill, MOVE UP / MOVE DOWN
  // as the panel's outlined button on their own 44px line, the pin and tie lines as the panel's note. Built from the panel's own
  // primitives (SWRPGUI.ledgerSectionHead / platedRow), so it is the panel's face on paper and on dark by construction.
  // props: { accent, paper, collapsed, onToggle } from ActiveSourcesPanel.
  function HomebrewSourcesPanel(p) {
    var g = useHomebrewGroup(), UI = window.SWRPGUI;
    if (!g || !UI || !UI.ledgerSectionHead || !UI.platedRow) return null;
    var paper = !!p.paper, accent = p.accent, noInk = paper ? { color: undefined } : null;
    var all = g.own.concat(g.imported), on = all.filter(function (c) { return c.active; }).length;
    var st = g.store.status || {};
    var status = st.reason === 'newer-store' ? W.newer : st.reason === 'stale-tab' ? W.stale : (st.persistent === false && st.reason !== 'not-open') ? W.memory : null;
    function note(key, text, extra) {
      return h('p', { key: key, className: paper ? 'pb-src-note' : undefined, role: key === 'status' ? 'status' : undefined,
        style: Object.assign({ fontFamily: 'var(--font-body)', fontSize: 'var(--fs-sm)', lineHeight: 1.55, color: 'var(--doc-ink-muted)', margin: '0 0 14px' }, extra || null, noInk) }, text);
    }
    function mv(c, dir) {
      var label = (dir === 'up' ? W.up : W.down).toUpperCase(), off = g.held || (dir === 'up' ? g.first(c) : g.last(c));
      // RESET ALL's button (the panel's outlined control) at the 44px floor; the name says which collection it moves
      return h('button', { type: 'button', key: dir, disabled: off, onClick: function () { g.move(c, dir); }, 'aria-label': label + ': ' + c.name,
        className: paper ? 'pb-src-reset' : undefined,
        style: Object.assign({ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)', letterSpacing: '0.14em', color: 'var(--doc-ink-muted)', background: 'none',
          border: '1px solid var(--doc-rule)', borderRadius: 8, padding: '0 13px', minHeight: 44, cursor: off ? 'default' : 'pointer' },
          paper ? { color: undefined, border: undefined, borderRadius: undefined } : null) }, label);
    }
    function row(c, ordered_) {
      var tie = ordered_ ? g.tieFor(c) : null;
      return h(React.Fragment, { key: c.ck },
        UI.platedRow({ on: c.active, accent: accent, tall: true, paper: paper, disabled: g.held, testid: 'homebrew-source-' + c.packId, onClick: function () { g.toggle(c); },
          body: h('span', { style: { flex: 1 } },
            h('span', { className: paper ? 'pb-src-lab' : undefined, 'data-off': (paper && !c.active) ? '1' : undefined,
              style: Object.assign({ display: 'block', fontFamily: 'var(--font-body)', fontSize: 'var(--fs-lg)', color: c.active ? 'var(--doc-ink)' : 'var(--doc-ink-muted)' }, noInk) }, c.name),
            tellApart(c, g.shown).map(function (t, i) {      // R-MSB-18: the glance's note idiom, in full ink
              return h('span', { key: 'ta' + i, className: paper ? 'pb-src-note' : undefined, 'data-ms-line': 'apart',
                style: Object.assign({ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)', letterSpacing: '0.03em', lineHeight: 1.5, color: 'var(--doc-ink)', marginTop: 5 }) }, t);
            }),
            h('span', { className: paper ? 'pb-src-note' : undefined,
              style: Object.assign({ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)', letterSpacing: '0.03em', lineHeight: 1.5, color: 'var(--doc-ink-muted)', marginTop: 5 }, noInk) }, W.glance(c))) }),
        ordered_ ? h('div', { style: { display: 'flex', gap: 7, margin: '-2px 0 7px 13px' } }, mv(c, 'up'), mv(c, 'down')) : null,
        tie ? note('tie', tie, { margin: '-2px 0 12px 13px', paddingLeft: 10, borderLeft: '3px solid ' + (paper ? 'var(--doc-mark)' : accent) }) : null);
    }
    return h('div', { style: { marginTop: 18 }, 'data-sources-homebrew': 'panel' },
      UI.ledgerSectionHead(accent, W.group.toUpperCase(), on + '/' + all.length, { onToggle: p.onToggle, collapsed: p.collapsed, paper: paper }),
      p.collapsed ? null : [
        status ? note('status', status) : null,
        g.own.map(function (c) { return row(c, false); }),
        note('pin', W.pin),
        g.imported.map(function (c) { return row(c, true); })]);
  }

  // ── the doors' figures (F10a's tile; the GM's fifth card carries none): the records to start from, and the
  // collections line. Counted from the same books HOME counts, only while the switch is on (the host asks). The count
  // is the shelves that OPEN (P7 (ii) with R8b, ruling f100-items-live-contracts R-FILC-A1-3): a SOON shelf is not
  // something to start from. ──
  // the books, loaded ONCE for the door's figure and the Sources group's ties (a failed load is retried on the next ask)
  var sharedBooks = null;
  function booksOnce() {
    if (!sharedBooks) sharedBooks = loadBooks().catch(function (e) { sharedBooks = null; throw e; });
    return sharedBooks;
  }
  function useDoorFigures() {
    var store = useStore();
    var _t = useState(null), total = _t[0], setTotal = _t[1];
    useEffect(function () {
      var alive = true;
      booksOnce().then(function (v) {
        var open = (ED() && (ED().OPEN_SHELVES || ED().ITEM_SHELVES)) || [];   // U6: the door counts the shelves that open (1,907 with talents + specializations)
        if (alive) setTotal(v.shelves.filter(function (s) { return open.indexOf(s.key) !== -1; }).reduce(function (a, s) { return a + s.count; }, 0));
      }, function () {});
      return function () { alive = false; };
    }, []);
    var list = store.list || [];
    return { total: total, collections: store.list ? list.length : null, records: list.reduce(function (a, c) { return a + (c.records || 0); }, 0) };
  }
  function doorRoll(f) {
    if (f.collections == null) return '';
    return f.collections + ' ' + plural(f.collections, 'collection', 'collections') + ' \u00b7 ' + f.records + ' ' + plural(f.records, 'record', 'records');
  }

  window.SWRPGEditorView = { Editor: Editor, HomebrewSources: HomebrewSources, HomebrewSourcesPanel: HomebrewSourcesPanel, WORDS: W, useDoorFigures: useDoorFigures, doorRoll: doorRoll,
    // HOMEBREW H1 (ruling `f100-h1-word` R-FHW-2): the MS SYNC-LINES region's helpers, exported in place, so the sheet's
    // add-homebrew list tells same-named collections apart by the ONE helper (R-H1K-14). The region is unchanged.
    SYNC_LINES: { MSW: MSW, dayOf: dayOf, tellApart: tellApart, inSuffix: inSuffix },
    // P7 (ii), Jason's pick (R-FILC-9, A4-1): the doors promise only the shelves that open; the GM card keeps its own shape
    // U6 as revised by R-M5K-A1-2 (b): both doors say what opens now
    // M10 (F1, R-M10E-8): the door names the seventh shelf; M12 (F1, R-M12B-9, D-157): and the eighth
    DOOR: { title: 'Homebrew', noun: 'to start from',
            gm: { eyebrow: 'CREATION', label: 'HOMEBREW' } },
    _test: { userChanged: userChanged, talentCheck: talentCheck, normalizeTalent: normalizeTalent, effRead: effRead, OPS: OPS, plateGlance: plateGlance, rowMeta: rowMeta, countsLine: countsLine, phrase: phrase, reasonsOf: reasonsOf, normalized: normalized, modView: modView,
             removeSentence: removeSentence, readAloud: readAloud, railCounts: railCounts, shelfRow: shelfRow, IW: IW, spoken: spoken,
             normText: normText, textHash: textHash, spanOk: spanOk, spanFrom: spanFrom, M8W: M8W } };
})();
