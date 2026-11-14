/* lib/modify/view.jsx — "Modify this Character" (F-100 M13 Lap B; card f100-m13-build ADDENDUM 9, the frames @ b4bc72fd2, LAW).
 * window.SWRPGModifyView = { Page, PackEntries, sectionIds }.
 * The page holds a draft `patch`; everything it shows is sheet + patch. Price, fold, Save, Undo, offers and the draft's store are window.SWRPGModify's:
 * nothing here prices a rank or merges a layer. The host saves what Save returns (onApply). Reached only by its route until Lap C. */
(function () {
  'use strict';
  var h = React.createElement, useState = React.useState, useMemo = React.useMemo, useEffect = React.useEffect, useLayoutEffect = React.useLayoutEffect, useRef = React.useRef;
  var SECTIONS = ['line', 'track', 'species', 'career', 'specs', 'chars', 'skills', 'talents', 'force', 'sig', 'motiv', 'xptot', 'log'];   // R-M13B-22, in page order
  var CHARS = ['brawn', 'agility', 'intellect', 'cunning', 'willpower', 'presence'];
  var FOUR = ['desire', 'fear', 'strength', 'flaw'];
  var LINES = { eote: 'Edge of the Empire', aor: 'Age of Rebellion', fad: 'Force and Destiny' }, TRACK_OF = { eote: 'obligation', aor: 'duty', fad: 'morality' };
  var BOOK_NOTE = { book_species: { eote: 'Edge of the Empire says a species can never be changed (p.34)', fad: 'Force and Destiny says characters cannot change species (p.42)' },
    book_career: { eote: 'Edge of the Empire says a career stays with a character permanently (p.53)', fad: 'Force and Destiny says a career can\u2019t change during gameplay (p.43)' } };   // R-M13R-23, -36: final
  var NEVER_BLOCK = 1e9;   // R-M13L-8: nothing blocks; the price shows, the tree never says "not enough XP"

  function MOD() { return window.SWRPGModify; }
  function CR() { return window.CharResolve; }
  function env() { return MOD().envFromWindow(); }
  function same(a, b) { return JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b); }
  function cap(s) { return String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1); }
  function money(n) { return (n < 0 ? '\u2212' : '') + String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function ordinal(n) { return n + (n % 100 > 10 && n % 100 < 14 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'); }
  function tradeName(c) {   // R-M13R-29: the creator's list, this page's words
    if (c.label) return c.label.replace(/ \(to \d+\)$/, '');
    return [c.xpDelta ? '+' + c.xpDelta + ' XP' : '', c.creditsDelta ? '+' + money(c.creditsDelta) + ' credits' : ''].filter(Boolean).join(' and ');
  }
  function signed(n) { return n === 0 ? '0' : (n > 0 ? '+' + n : '−' + Math.abs(n)); }
  function clean(x) { var I = window.SWItems; return String((I && I.cleanMarkup) ? I.cleanMarkup(x || '') : (x || '')); }
  // S1 (argo-a1-curation ADDENDUM 4): a rule slot whose book words were removed says where to read them — `<words> || s1(rec)`,
  // the record's book line (SWRPGSources.removedLine; '' on holocron and for a record citing nothing, so the slot reads as before).
  function s1(rec) { var S = window.SWRPGSources; return (rec && S && S.removedLine && S.removedLine(rec)) || ''; }
  // B-1788: rule text draws its [XX] codes as the marks this page's tree cards draw (lib/shared/treeView.jsx `glyphs`: SWRPGUI.glyphText, size 1).
  // Guarded: an old cached vendor.js draws the text, never a throw (569 Rider 1). Empty stays empty, so `p.sub ? …` still reads it.
  function draw(x) { var U = window.SWRPGUI; return (x && U && U.glyphText) ? U.glyphText(x, 1) : x; }
  function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o || {}, k); }
  function dayOf(iso, year) {
    var d = new Date(iso); if (isNaN(d)) return '';
    return d.getDate() + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()] + (year ? ' ' + d.getFullYear() : '');
  }
  function viewOf(sheet) { var e = env(); return e.CR.stampTalentView(sheet, e.base, e.M, e.UD); }
  function charbuild() { return window._canonicalCharbuild || {}; }

  // ── the draft: a patch of the sheet's own fields. A key equal to the sheet is no change, so it leaves. ──────────────
  function withKey(patch, sheet, key, val) {
    var out = Object.assign({}, patch);
    if (same(val, sheet[key])) delete out[key]; else out[key] = val;
    return out;
  }
  function withKeys(patch, sheet, vals) { return Object.keys(vals).reduce(function (o, k) { return withKey(o, sheet, k, vals[k]); }, patch); }
  function effOf(sheet, patch) { return Object.assign({}, sheet, patch); }
  // A copy in `own` that equals what lies under it is no change: it is pruned, and an emptied layer goes with it.
  function bare(rec) { var o = Object.assign({}, rec); delete o._base; delete o._mode; delete o._from; return o; }
  function draftOwn(patch, sheet, section, id, rec) {
    var e = env(), eff = effOf(sheet, patch), lo = MOD().ownCopy(eff, section, id, e), layer = clone(eff.own) || MOD().emptyOwn();
    layer.sections[section] = layer.sections[section] || {};
    if (rec && !(lo && same(bare(lo), bare(rec)))) layer.sections[section][id] = rec; else delete layer.sections[section][id];
    if (!Object.keys(layer.sections[section]).length) delete layer.sections[section];
    if (!Object.keys(layer.sections).length && !sheet.own) { var o = Object.assign({}, patch); delete o.own; return o; }
    return withKey(patch, sheet, 'own', layer);
  }
  function copyOf(eff, section, id) {
    var cur = eff.own && eff.own.sections && eff.own.sections[section] && eff.own.sections[section][id];
    return cur ? clone(cur) : MOD().ownCopy(eff, section, id, env());
  }
  // R-M13B-65: an id is never printed. A word slug reads in title case; any other id reads as the plain words the caller gives.
  function idWords(id, plain) {
    if (!/^[a-z]+([_-][a-z]+)*$/i.test(String(id || ''))) return plain;
    return String(id).split(/[_-]/).map(cap).join(' ');
  }
  function nameKey(a) { return String(a && a.name || '').replace(/:$/, ''); }

  // ── the small parts: the kit's idiom ─────────────────────────────────────────────────────────────────────────────
  function Quiet(p) { return h('button', Object.assign({ type: 'button', className: p.commit ? 'hp-commit' : 'hp-quiet', onClick: p.onClick }, p.attrs || {}), p.children); }
  function Section(p) {
    return h(React.Fragment, null,
      h('div', { className: 'hp-sechead', 'data-m13-head': p.id }, h('h2', null, p.title)),
      h('div', { className: 'hp-plate', 'data-pad': 'read', 'data-m13-sec': p.id }, p.children));
  }
  function Row(p) {
    return h('div', Object.assign({ className: 'm13-row' }, p.attrs || {}),
      h('div', { className: 'm13-k' }, p.k, p.flag ? h('span', { className: 'm13-flag' }, p.flag) : null, p.sub ? h('small', null, p.sub) : null), p.right || null);
  }
  function Stepper(p) {
    return h('div', { className: 'm13-step' },
      h(Quiet, { onClick: p.onLower, attrs: { 'aria-label': p.lowerLabel || 'Lower' } }, '−'),
      p.value != null ? h('span', { className: 'm13-v' }, String(p.value)) : null,
      h(Quiet, { onClick: p.onRaise, attrs: { 'aria-label': p.raiseLabel || 'Raise' } }, '+'),
      p.price != null ? h('span', { className: 'm13-price' }, p.price) : null);
  }
  function Notice(p) {
    return h('div', { className: 'sb-notice', role: 'status', 'data-m13-notice': p.kind, style: p.style },
      h('span', { className: 'sb-notice-t' }, p.text),
      p.acts && p.acts.length ? h('span', { className: 'sb-notice-a' }, p.acts.map(function (a) { return h(Quiet, { key: a.t, onClick: a.on }, a.t); })) : null);
  }
  function Tick(p) {
    return h('label', { className: 'm13-tick', onClick: function (e) { e.preventDefault(); p.onToggle(); } },
      h('span', { className: 'm13-box', role: 'checkbox', tabIndex: 0, 'aria-checked': p.on ? 'true' : 'false', 'aria-label': p.name, 'data-on': p.on ? '1' : undefined,
        onKeyDown: function (e) { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); p.onToggle(); } } }),
      h('div', null, h('b', null, p.name), p.text ? h('p', null, p.text) : null));
  }
  function Tree(p) {
    var T = window.SWRPGTree;
    return h('div', { className: 'm13-treebox', 'data-scrollx': '1', 'data-m13-tree': p.id }, h(T.DirectionalTree, { model: p.model, accent: 'var(--doc-action)', onHeadPick: p.onHeadPick }));
  }

  // ── B1 / B2: one list and one preview, on R-M13F-19's host ───────────────────────────────────────────────────────
  function Host(p) {
    var ref = useRef(null);
    // B-1825 (ADDENDUM 631): the dialog holds focus. Focus-in stays its own — the dialog itself, which the hold reads as
    // inside (a selector cannot name the panel it is held to) — and runs first; Tab is kept inside; at close the hold
    // hands focus back to the door, which is the element this effect used to restore by hand (that copy is gone).
    useEffect(function () { if (ref.current) ref.current.focus(); }, []);
    window.SWRPGUI.useHoldFocus(ref, true);
    return h('div', { className: 'm13-scrim', 'data-m13-host': p.kind },
      h('div', { className: 'hp-scrim' }),
      h('div', { className: 'm13-dlg', role: 'dialog', 'aria-modal': 'true', 'aria-label': p.title, tabIndex: -1, ref: ref,
        onKeyDown: function (e) { if (e.key === 'Escape' && p.onBack) { e.stopPropagation(); p.onBack(); } } }, p.children));
  }
  function ListHost(p) {
    var _q = useState(''), q = _q[0], setQ = _q[1];
    var ql = q.trim().toLowerCase();
    var rows = ql ? p.rows.filter(function (r) { return String(r.name).toLowerCase().indexOf(ql) >= 0; }) : p.rows;
    return h(Host, { kind: 'list-' + p.kind, title: p.title, onBack: p.onBack },
      h('div', { className: 'm13-lhost' },
        h(Quiet, { onClick: p.onBack }, '‹ Modify this Character'),
        h('h1', { className: 'm13-h1 m13-lhead' }, p.title),
        p.search ? h('div', { className: 'hp-plate', 'data-flat': '1', 'data-input': '1' },
          h('input', { className: 'm13-search', type: 'search', placeholder: p.search, 'aria-label': p.search, value: q, onChange: function (e) { setQ(e.target.value); } })) : null,
        h('div', { className: 'hp-plate m13-lplate', 'data-pad': 'data' }, rows.map(function (r) {
          return h('button', { key: r.id, type: 'button', className: 'hp-row', 'data-noplate': '1', 'data-m13-row': r.id, 'data-selected': r.sel ? '1' : undefined, 'aria-current': r.sel ? 'true' : undefined,
            'aria-pressed': p.multi ? (r.on ? 'true' : 'false') : undefined, onClick: function () { p.onPick(r); } },
            p.multi ? h('span', { className: 'm13-box m13-lbox', 'data-on': r.on ? '1' : undefined }) : null,
            h('span', { className: 'hp-row-body' }, h('span', { className: 'hp-row-desig' }, r.name), r.src ? h('span', { className: 'hp-rowsrc' }, r.src) : null,
              r.rule ? h('span', { className: 'm13-lrule' }, draw(r.rule)) : null),
            r.price ? h('span', { className: 'm13-price m13-lprice' }, r.price) : null);
        })),
        (p.notes || []).map(function (n) { return h('div', { key: n, className: 'm13-note', 'data-m13-limit': '1' }, n); }),
        // R-M13B-120: an unfinished choice can't finish. The kit's held commit (R-EDG-2) says what's missing.
        p.left ? h('div', { className: 'hp-phoneact m13-bar m13-lbar' }, h(Quiet, { commit: true, attrs: { style: { width: '100%' }, disabled: true, 'aria-disabled': 'true', 'data-held': '1' } }, h('span', null, 'Pick ' + p.left + ' more')))
          : p.commit ? h('div', { className: 'hp-phoneact m13-bar m13-lbar' }, h(Quiet, { commit: true, onClick: p.onCommit, attrs: { style: { width: '100%' } } }, p.commit)) : null));
  }
  function Preview(p) {
    return h(Host, { kind: 'preview', title: p.name, onBack: p.onBack },
      h('div', { className: 'm13-lhost' },
        h(Quiet, { onClick: p.onBack }, '‹ Modify this Character'),
        h('h1', { className: 'm13-h1 m13-lhead' }, p.name),
        h('div', { className: 'm13-pgrid' }, [['Yours', p.mine], ['The book’s', p.book]].map(function (c) {
          return h('div', { key: c[0] }, h('div', { className: 'hp-sechead' }, h('h2', null, c[0])),
            h('div', { className: 'hp-plate', 'data-pad': 'read' }, h('div', { className: 'm13-k' }, p.name, h('small', { className: 'm13-psmall' }, draw(c[1])))));
        })),
        h('div', { className: 'm13-acts' }, h(Quiet, { onClick: p.onTake }, 'Take the update'), h(Quiet, { onClick: p.onKeep }, 'Keep mine'))));
  }
  // R-M13B-36: the approved Homebrew form, aimed at this character. A form save lands in the page's draft; Back returns to the page.
  function FormHost(p) {
    var E = window.SWRPGEditorView;
    return h(Host, { kind: 'form', title: p.title, onBack: null },
      h(E.Editor, { host: 'player', appName: 'Player Datapad', path: p.path, roster: [], navigate: function () {}, exit: p.onBack,
        aim: { rec: p.rec || null, onSave: p.onSave, onBack: p.onBack, intent: p.intent } }));
  }

  // ── lists' rows, from the sheet's own view ───────────────────────────────────────────────────────────────────────
  function sourceOf(r) {
    var SS = window.SWRPGSources, cur = SS && SS.current && SS.current(), ix = cur && cur.index, k = (r.sources || [])[0];
    return k ? ((ix && SS.sourceLabel) ? SS.sourceLabel(ix, k) : k) : '';
  }
  function byName(a, b) { return String(a.name).localeCompare(String(b.name)); }
  function recRow(r, extra) { return Object.assign({ id: r.id, name: r.name, src: sourceOf(r), rule: clean(r.description).replace(/\s+/g, ' ').trim() || s1(r) }, extra || {}); }
  function cheapestRow(view, tid) {
    var best = null, all = view.specializations || {};
    Object.keys(all).forEach(function (k) { (all[k].talent_tree || []).forEach(function (r) { (r.talents || []).forEach(function (c) { if (c && c.talent === tid && (best == null || r.cost < best)) best = r.cost; }); }); });
    return best;
  }

  // ── log words: from the item's ids, resolved now. Only the latest entry keeps before/after (R-M13L-9). ──────────────
  function itemWords(it, view) {
    var cb = charbuild(), byKey = {};
    Object.keys(cb.skillSheetKeys || {}).forEach(function (id) { byKey[cb.skillSheetKeys[id]] = cb.skillNames[id]; });
    var arrow = (it.before != null || it.after != null) ? ' ' + (Number(it.before) || 0) + ' → ' + (Number(it.after) || 0) : '';
    var rec = function (reg, id) { return (view[reg] || {})[id] || { name: id }; };
    if (it.part === 'skills') return (byKey[it.ref] || it.ref) + arrow;
    if (it.part === 'characteristics') return cap(it.ref) + arrow;
    if (it.part === 'species' || it.part === 'career') {
      var names = it.before && it.after ? (it.before[it.part] + ' → ' + it.after[it.part]) : rec(it.part === 'species' ? 'species' : 'careers', it.ref).name;
      return cap(it.part) + ' ' + names;
    }
    if (it.part === 'specializations') {
      var sp = rec('specializations', it.ref);
      if (it.op === 'modify' && it.before && it.after) {
        var had = it.before.owned || [], cells = (it.after.owned || []).filter(function (x) { return had.indexOf(x) < 0; }), gone = had.filter(function (x) { return (it.after.owned || []).indexOf(x) < 0; });
        var one = function (pos) { var rc = String(pos).split('-'), row = (sp.talent_tree || [])[rc[0]], c = row && row.talents && row.talents[rc[1]], t = c && (view.talents || {})[c.talent]; return (t ? t.name : pos) + ' (' + sp.name + ', row ' + (Number(rc[0]) + 1) + ')'; };
        return cells.map(one).concat(gone.map(function (x) { return 'Removed ' + one(x); })).join(', ') || sp.name;
      }
      return (it.op === 'remove' ? 'Removed ' : it.op === 'add' ? 'Added ' : '') + sp.name;
    }
    if (it.part === 'force_powers') return (it.op === 'remove' ? 'Removed ' : '') + rec('forcePowers', it.ref).name;
    if (it.part === 'signature_abilities') return (it.op === 'remove' ? 'Removed ' : '') + rec('signatureAbilities', it.ref).name;
    if (it.part === 'talents') return rec('talents', it.ref).name + ' (outside your trees)';
    if (it.part === 'motivations') return 'Motivations';
    if (it.part === 'speciesSkillChoices') {   // R-M13B-121, as pickWords
      var chosen = []; Object.keys(it.after || {}).forEach(function (sp) { Object.keys(it.after[sp] || {}).forEach(function (pool) { chosen = chosen.concat(it.after[sp][pool]); }); });
      if (it.after && !chosen.length) return null;
      return it.after ? 'Free career skills: ' + chosen.map(function (id) { return cb.skillNames[id] || id; }).join(', ') : 'Free career skills';
    }
    if (it.part === 'speciesGrantApplied' || it.part === 'speciesOption' || it.part === 'speciesOptionPicks' || it.part === 'talentSkillChoices' || it.part === 'talentCharacteristicChoices' || it.part === 'talentChoices' || it.part === 'treelessTalents' || it.part === 'freeRanks' || it.part === 'credits') return null;
    if (it.part === 'book') return 'Game line ' + (it.before ? (LINES[it.before] || it.before) + ' \u2192 ' : '') + (LINES[it.after] || it.after || '');
    if (TRACKS_NAMED[it.part]) return cap(it.part) + (it.before != null || it.after != null ? ' ' + (it.before ? it.before.value : 'none') + ' \u2192 ' + (it.after ? it.after.value : 'none') : '');
    if (it.part.indexOf('own.') === 0) { var s = it.part.slice(4), v = { force_powers: 'forcePowers', signature_abilities: 'signatureAbilities' }[s] || s; return ((view[v] || {})[it.ref] || { name: it.ref }).name; }
    return cap(it.part);
  }
  var TRACKS_NAMED = { obligation: 1, duty: 1, morality: 1 };
  function tradeWord(ref) {
    var cfg = window._narrativeMechConfig, mech = cfg && cfg.mechanics, found = [];
    String(ref || '').split('+').forEach(function (id) { Object.keys(mech || {}).forEach(function (m) { ((mech[m].tradeOptions || {}).choices || []).forEach(function (c) { if (c.id === id) found.push(tradeName(c)); }); }); });
    return found.join(', ');
  }
  // R-M13B-122: "Free" stays where the pick is a free thing; otherwise the noun alone, and "Pick" with none.
  function groupLabel(g) { return !g.noun ? (g.max_picks > 1 ? g.display_name || g.name : 'Pick') : g.noun === 'skill' || g.noun === 'talent' ? 'Free ' + g.noun : cap(g.noun); }
  // A choice's own words: "2 Knowledge skills", "1 combat skill", "2 non-career skills", "1 skill".
  function grantWords(g, names) {
    var n = Number(g.count) || 1, s = n === 1 ? 'skill' : 'skills';
    if (Array.isArray(g.pool)) return n + ' of ' + g.pool.map(function (id) { return names[id] || id; }).join(' or ');
    return n + ' ' + (g.pool === 'non_career' ? 'non-career ' : g.pool === 'knowledge' ? 'Knowledge ' : !g.pool || g.pool === 'any' ? '' : g.pool + ' ') + s;
  }
  // R-M13B-121: one line per pick, "Subspecies: Offshoot". An entry past the newest has lost before/after, so it reads by name alone. A species since changed reads by its group's id.
  function pickWords(it, rec, slugOf) {
    if (it.ref === 'speciesOptionPicks') return [];
    return String(it.ref).split('+').reduce(function (out, slug) {
      var g = ((rec && rec.option_choices) || []).filter(function (oc) { return slugOf(oc.name) === slug; })[0];
      var label = g ? groupLabel(g) : cap(idWords(slug, slug));
      if (!it.after) return out.concat([label]);
      var ids = [].concat(it.after[slug] == null ? [] : it.after[slug]);
      var names = ids.map(function (id) { var o = g && (g.options || []).filter(function (x) { return x.id === id; })[0]; return o ? o.name : cap(idWords(id, id)); });
      if (g && g.max_picks > 1 && names.length) return out.concat(names.map(function (n) { return label + ': ' + n; }));   // R-M13B-133: each pick its own first line
      return out.concat([label + ': ' + names.join(', ')]);
    }, []);
  }
  function logItems(entry, view, rec, slugOf) {
    var speciesName = rec && rec.name;
    var tr = (entry.items || []).filter(function (it) { return it.part === 'trades'; })[0], lined = (entry.items || []).some(function (it) { return it.part === 'book'; });
    if (tr && !lined) {   // one `trades` line (§5.1): the trade, then what it moved
      var x = (entry.items || []).filter(function (it) { return it.part === 'xp'; })[0];
      var bits = ['Trade: ' + tradeWord(tr.ref)].concat((entry.items || []).filter(function (it) { return TRACKS_NAMED[it.part]; }).map(function (it) { return itemWords(it, view); }));
      if (x && x.before && x.after && x.before.total !== x.after.total) bits.push('XP total ' + x.before.total + ' \u2192 ' + x.after.total);
      return [{ t: bits.join(' \u00b7 '), pastLimit: tr.pastLimit }];
    }
    var free = {};   // v7's words on a rank the species grants. Only the latest entry keeps before/after, so an older one reads by name alone.
    (entry.items || []).forEach(function (it) { if (it.part === 'speciesGrantApplied') Object.keys(it.after || {}).forEach(function (k) { if (Number(it.after[k]) > (Number((it.before || {})[k]) || 0)) free[k] = true; }); });
    var spItem = (entry.items || []).filter(function (it) { return it.part === 'species'; })[0], pickRec = (spItem && (view.species || {})[spItem.ref]) || rec, first = [];
    (entry.items || []).forEach(function (it) {
      if (it.part === 'speciesOptionPicks') pickWords(it, pickRec, slugOf).forEach(function (t) { first.push({ t: t }); });
      if (it.part === 'speciesSkillChoices') { var w = itemWords(it, view); if (w) first.push({ t: w }); }
    });
    return first.concat((entry.items || []).filter(function (it) { return it.part !== 'stored' && it.part !== 'xp' && it.part !== 'trades' && it.part !== 'speciesSkillChoices'; }).map(function (it) {
      var words = itemWords(it, view);
      return { t: words && it.part === 'skills' && free[it.ref] && speciesName ? words + ' · ' + speciesName + ' free rank' : words, offBook: it.offBook, pastLimit: it.pastLimit };
    })).filter(function (x) { return x.t; });
  }

  // ── the page ─────────────────────────────────────────────────────────────────────────────────────────────────────
  // p = { char, sheet, section, onApply(result), onBack(), onHeld(), sigTreeModel, sigShelfOf, groupSlug, MotivationPicker }
  function Page(p) {
    var sheet = p.sheet, id = p.char.id, M = MOD();
    var _d = useState(function () { var ds = M.draftState(id, sheet, undefined, env()); return ds.draft && !ds.stale ? (ds.draft.patch || {}) : {}; }), patch = _d[0], setPatchRaw = _d[1];
    var _s = useState(function () { var ds = M.draftState(id, sheet, undefined, env()); return ds.draft && ds.stale ? ds.draft : null; }), stale = _s[0], setStale = _s[1];
    var _t = useState(true), tracked = _t[0], setTracked = _t[1];
    var _n = useState(''), note = _n[0], setNote = _n[1];
    var _o = useState(null), over = _o[0], setOver = _o[1];    // the open list, preview or form
    var _f = useState(null), field = _f[0], setField = _f[1];  // a motivation word being written: { key, value }
    var _a = useState(false), adding = _a[0], setAdding = _a[1];
    var _r = useState(0), railTick = _r[1];
    var _w = useState(function () { return window.innerWidth >= 1024; }), desk = _w[0], setDesk = _w[1];
    var _err = useState(null), reasons = _err[0], setReasons = _err[1];
    useEffect(function () { var f = function () { setDesk(window.innerWidth >= 1024); }; window.addEventListener('resize', f); return function () { window.removeEventListener('resize', f); }; }, []);
    useEffect(function () { var live = true; M.ready().then(function () { if (live) railTick(function (n) { return n + 1; }); }); return function () { live = false; }; }, []);
    var root = useRef(null);
    // R-M13B-22: `?section=<key>` opens the page at that section; an unknown or absent one, at its top.
    useEffect(function () {
      if (!p.section || SECTIONS.indexOf(p.section) < 0 || !root.current) return;
      var at = root.current.querySelector('[data-m13-head="' + p.section + '"]');
      if (at) at.scrollIntoView({ block: 'start' });
    }, []);
    // R-M13B-152: another device's copy moved `sheet` under an open draft. This page's own Save and Undo empty the patch in the same batch, so they stop at the guard.
    var sheetWas = useRef(sheet), landedClash = useRef(false);
    useLayoutEffect(function () {
      var was = sheetWas.current;
      sheetWas.current = sheet;
      if (was === sheet || !Object.keys(patch).length) return;
      var res = M.rebase(was, sheet, patch);
      if (!res.clash) { setPatch(res.patch); return; }
      // 'landed' matches no fingerprint, so a reload offers this draft too, even when the moved field is outside the fingerprint.
      M.writeDraft(id, 'landed', patch);
      landedClash.current = true;
      setStale(M.readDraft(id) || { at: new Date().toISOString(), patch: patch });
      setPatchRaw({}); setOver(null); setField(null); setAdding(false); setReasons(null);
    }, [sheet]);
    useEffect(function () {
      if (!stale || !landedClash.current || !root.current) return;
      landedClash.current = false;
      var at = root.current.querySelector('[data-m13-notice="stale-draft"]');
      if (at) at.scrollIntoView({ block: 'center' });
    }, [stale]);

    var eff = effOf(sheet, patch);
    var view = useMemo(function () { return viewOf(eff); }, [JSON.stringify(patch.own || null), JSON.stringify(sheet.own || null), JSON.stringify(sheet.mods || null), sheet.id]);
    // R-M13B-23: a held sheet falls back to the sheet route, as a dangling id does.
    useEffect(function () { if (!view && p.onHeld) p.onHeld(); }, [!view]);
    if (!view) return null;

    var _pt = useState(4), party = _pt[0], setParty = _pt[1];
    function setPatch(next) {
      setPatchRaw(next); setReasons(null);
      if (Object.keys(next).length) M.writeDraft(id, M.fingerprint(sheet, env()), next); else M.dropDraft(id);
    }
    function set(key, val) { setPatch(withKey(patch, sheet, key, val)); }
    var quote = M.price(sheet, patch, { tracked: tracked }, env());
    var xp = sheet.xp || {}, changed = Object.keys(patch).length > 0;
    var freeWord = 'free';
    function priceWord(n) { return tracked ? n + ' XP' : freeWord; }

    function saveNow() {
      var res = M.save(sheet, patch, { tracked: tracked, note: note, creditsDelta: quote.credits }, env());
      if (!res.ok) { setReasons(res.reasons); return; }
      p.onApply(res);
      M.dropDraft(id); setPatchRaw({}); setNote(''); setField(null); setAdding(false); setReasons(null);
    }
    function undoNow() { var res = M.undo(sheet, env()); if (res.ok) { p.onApply(withoutGoneRows(sheet, res)); M.dropDraft(id); setPatchRaw({}); } else setReasons(res.reasons); }

    // ── the game line and its track (§5, §6): the engine writes; this reads ──
    var nm = window._narrativeMechConfig && window._narrativeMechConfig.mechanics, book = String(eff.book || 'eote').toLowerCase(), mech = TRACK_OF[book], track = eff[mech] || null, trackName = cap(mech);
    var lineMoved = book !== String(sheet.book || 'eote').toLowerCase(), rule = nm && nm[mech] && nm[mech].startingValueRule, parties = (rule && rule.valuesByPartySize) || null;
    function shareOf(n) { var f = (parties || []).filter(function (v) { return String(v.partySize) === String(n); })[0]; return f ? f.startingValuePerPC : 10; }
    function reLine(asks) {   // an answer re-asks the line, and the draft's trades stand
      var ids = eff.mechanicTradeIds || [], next = M.lineDraft(sheet, patch, book, asks, env());
      ids.forEach(function (x) { next = M.tradeDraft(sheet, next, x, env()); });
      setPatch(next);
    }
    function pickLine(r) { setParty(4); setPatch(M.lineDraft(sheet, patch, r.id, { value: nmShare(r.id) }, env())); setOver(null); }
    function nmShare(b) { var ru = nm && nm[TRACK_OF[b]] && nm[TRACK_OF[b]].startingValueRule, f = ((ru && ru.valuesByPartySize) || []).filter(function (v) { return String(v.partySize) === '4'; })[0]; return f ? f.startingValuePerPC : 10; }
    function typeOf() { return track ? (track.type || '') : ''; }
    function moneyRows(r, sub) {
      var total = Number(xp.total) || 0, dx = tracked ? r.xp : 0, out = [];
      if (r.trades && !r.line || dx) { out.push(['XP total', sub, total + ' \u2192 ' + (total + dx)]); sub = null; }
      if (r.trades && !r.line || r.credits) out.push(['Credits', sub, money(r.creditsFrom) + ' \u2192 ' + money(r.creditsFrom + r.credits)]);
      return out;
    }
    function effectRows() {
      var r = M.reach(sheet, patch, env()); if (!r.line && !r.trades) return null;
      if (!r.line) { var v0 = Number((sheet[mech] || {}).value) || 0, v1 = Number((track || {}).value) || 0; return [[trackName, null, v0 !== v1 ? v0 + ' \u2192 ' + v1 : 'no change']].concat(moneyRows(r, null)); }
      var rows = [], old = M.trackOf(sheet), had = sheet[old], oldIds = sheet.mechanicTradeIds || [], names = oldIds.map(function (x) { return tradeWord(x); }).filter(Boolean), kept = old === 'morality' && eff.morality;
      if (r.accessA !== r.accessB) rows.push(['Force access', r.accessB ? 'Force talents\u2019 bonuses now count' : 'A Force talent\u2019s bonus is held, not lost', (r.accessA ? 'Yes' : 'No') + ' \u2192 ' + (r.accessB ? 'Yes' : 'No')]);
      if (had) rows.push(old === 'morality' ? (kept ? ['Morality', 'Force access stays, so Morality stays as the second track', String(had.value)] : ['Morality', 'No Force access now, so it goes', had.value + ' \u2192 none'])
        : [cap(old), had.type + ' is removed', had.value + ' \u2192 none']);
      var was = sheet[mech]; rows.push([trackName, null, was ? (was.value === (track || {}).value ? String(was.value) : was.value + ' \u2192 ' + (track || {}).value) : 'none \u2192 ' + (track || {}).value]);
      var undone = names.length ? 'The ' + names.join(', ') + (kept ? '' : ' ' + cap(old)) + (names.length > 1 ? ' trades are undone' : ' trade is undone') : null;
      return rows.concat(moneyRows(r, undone));
    }
    function askRow(k, label, list) { return h(Row, { key: k, k: label, right: h(Quiet, { commit: true, onClick: function () { setOver({ kind: 'trackType', field: k, title: label, list: list }); } }, 'Pick one') }); }
    function typeChosen(o, r) {
      if (mech === 'morality') { var a = {}; a[o.field] = r.name; if (o.field === 'strength') { a.type = r.id; var w = ((p.narrative.morPairs || {}).weaknesses || []).filter(function (x) { return x.key === r.weakKey; })[0]; if (w) a.weakness = w.name; } reLine(Object.assign({}, track, a)); }
      else reLine({ type: r.name, value: shareOf(party) });
      setOver(null);
    }
    var lineSections = nm ? h(React.Fragment, null,
      h(Section, { id: 'line', title: 'Game line' }, h(Row, { k: LINES[book], sub: lineMoved ? 'Was ' + LINES[String(sheet.book || 'eote').toLowerCase()] : null, right: h(Quiet, { onClick: function () { setOver({ kind: 'line' }); } }, 'Change') })),
      h(Section, { id: 'track', title: trackName },
        lineMoved && mech !== 'morality' && !typeOf() ? askRow('type', trackName + ' type', mech === 'duty' ? p.narrative.dutyTypes.items : p.narrative.oblTypes.items) : null,
        lineMoved && mech === 'morality' && !(track || {}).strength ? askRow('strength', 'Strength', p.narrative.morPairs.strengths) : null,
        lineMoved && mech === 'morality' && !(track || {}).weakness ? askRow('weakness', 'Weakness', p.narrative.morPairs.weaknesses) : null,
        lineMoved && parties ? h(React.Fragment, null, h('div', { className: 'm13-grp' }, 'Party size sets the share'), h('div', { className: 'hp-partyrow' }, parties.map(function (v) {
          var on = String(v.partySize) === String(party);
          return h('button', { key: v.partySize, type: 'button', className: 'hp-party', 'data-on': on ? '1' : undefined, 'aria-pressed': on ? 'true' : 'false', 'aria-label': 'Party size ' + v.partySize,
            onClick: function () { setParty(v.partySize); reLine({ type: typeOf(), value: v.startingValuePerPC }); } }, h('span', null, String(v.partySize)), h('span', { className: 'hp-none' }, String(v.startingValuePerPC)));
        }))) : null,
        track ? h(Row, { k: trackName, sub: typeOf() ? ((track.strength && track.weakness) ? track.strength + ' / ' + track.weakness : track.type) : null, right: h('span', { className: 'm13-v' }, String(track.value)) }) : null,
        h('div', { className: 'm13-grp' }, 'Trade'),
        ((nm[mech].tradeOptions || {}).choices || []).map(function (c) {
          var on = (eff.mechanicTradeIds || []).indexOf(c.id) >= 0, v = Number(c.valueDelta) || 0;
          return h('div', { key: c.id, className: 'hp-buy', 'data-m13-trade': c.id }, h('span', { className: 'hp-buy-name' }, tradeName(c)), h('span', { className: 'hp-buy-step' }, v ? trackName + ' ' + signed(v) : 'no change to the track'),
            h('button', { type: 'button', className: 'hp-buy-btn', 'data-on': on ? '1' : undefined, 'aria-pressed': on ? 'true' : 'false', onClick: function () { setPatch(M.tradeDraft(sheet, patch, c.id, env())); } }, on ? 'Taken' : 'Take'));
        })),
      (function () { var rows = effectRows(); return rows ? h(Section, { id: 'effects', title: 'What this changes' }, rows.map(function (e) { return h(Row, { key: e[0], k: e[0], sub: e[1], attrs: { 'data-m13-effect': '1' }, right: h('span', { className: 'm13-v' }, e[2]) }); })) : null; })()) : null;

    // ── species ──
    var spId = eff.speciesId, spRec = (view.species || {})[spId] || null, oldRec = spId !== sheet.speciesId ? ((viewOf(sheet) || view).species || {})[sheet.speciesId] : null;
    var spLow = spRec ? (M.ownCopy(eff, 'species', spId, env()) || spRec) : null;
    function editSpecies(fn) { var c = copyOf(eff, 'species', spId); if (!c) return; fn(c); setPatch(draftOwn(patch, sheet, 'species', spId, c)); }
    function pickSpecies(r) {
      var next = withKeys(patch, sheet, Object.assign({ speciesId: r.id, species: r.name }, M.speciesChangeVals(sheet, patch, spRec, r.id, env())));
      // a copy made for a species no longer chosen goes with the choice; the sheet's own copy stays
      var eo = next.own && next.own.sections && next.own.sections.species;
      if (eo) Object.keys(eo).forEach(function (k) { if (k !== r.id && !(sheet.own && sheet.own.sections && sheet.own.sections.species && sheet.own.sections.species[k])) next = draftOwn(next, sheet, 'species', k, null); });
      setPatch(next); setOver(null);
    }
    function stepSpecies(key, d) { editSpecies(function (c) { CR().speciesStepEffective(c, eff.speciesOptionPicks, key, d); }); }
    var spEff = spRec ? CR().speciesEffective(spRec, eff.speciesOptionPicks) : null;
    function hasAbility(rec, name) { return (rec.special_abilities || []).some(function (a) { return nameKey(a) === name; }); }
    function hasTalent(rec, tid) { return (rec.starting_talents || []).some(function (t) { return t.talent === tid; }); }
    function toggleAbility(a) { var name = nameKey(a); editSpecies(function (c) { c.special_abilities = hasAbility(c, name) ? c.special_abilities.filter(function (x) { return nameKey(x) !== name; }) : (c.special_abilities || []).concat([clone(a)]); }); }
    function toggleTalent(t) { editSpecies(function (c) { c.starting_talents = hasTalent(c, t.talent) ? c.starting_talents.filter(function (x) { return x.talent !== t.talent; }) : (c.starting_talents || []).concat([clone(t)]); }); }
    function abilityRows(rec, against) {
      var out = [];
      (rec.special_abilities || []).forEach(function (a) { out.push(h(Tick, { key: 'a' + a.name, name: nameKey(a), text: draw(clean(a.description) || s1(Object.assign({}, a, { sources: rec.sources }))), on: hasAbility(against, nameKey(a)), onToggle: function () { toggleAbility(a); } })); });
      (rec.starting_talents || []).forEach(function (t) { var tr = (view.talents || {})[t.talent] || {}; out.push(h(Tick, { key: 't' + t.talent, name: (tr.name || t.talent) + (t.ranks > 1 ? ' ' + t.ranks : ''), text: draw(clean(tr.description) || s1(tr)), on: hasTalent(against, t.talent), onToggle: function () { toggleTalent(t); } })); });
      return out;
    }
    function ownAbilities() {   // what the lower record has, plus what this character's copy added
      var seen = {}, rec = { special_abilities: [], starting_talents: [] };
      [spLow, spRec].forEach(function (r) {
        (r.special_abilities || []).forEach(function (a) { if (!seen['a' + nameKey(a)]) { seen['a' + nameKey(a)] = 1; rec.special_abilities.push(a); } });
        (r.starting_talents || []).forEach(function (t) { if (!seen['t' + t.talent]) { seen['t' + t.talent] = 1; rec.starting_talents.push(t); } });
      });
      if (oldRec) { rec.special_abilities = rec.special_abilities.filter(function (a) { return hasAbility(spLow, nameKey(a)) || !hasAbility(oldRec, nameKey(a)); }); rec.starting_talents = rec.starting_talents.filter(function (t) { return hasTalent(spLow, t.talent) || !hasTalent(oldRec, t.talent); }); }
      return rec;
    }
    var cb = charbuild();
    function optionPick(g) {
      var slug = p.groupSlug(g.name), have = (eff.speciesOptionPicks || {})[slug];
      var picked = (g.options || []).filter(function (o) { return o.id === have || (Array.isArray(have) && have.indexOf(o.id) >= 0); });
      return { slug: slug, picked: picked };
    }
    var skillKeysOf = view.skillSheetKeys || cb.skillSheetKeys || {};
    var chosenRanks = spRec ? M.speciesChosenRanks(sheet, patch, spRec, skillKeysOf, env()) : {};
    function poolOf(grants) {
      var ids = [], careerIds = CR().careerSkillIds(CR().careerSkillStatus(eff, view));
      grants.forEach(function (g) { CR().speciesChoicePool(g, cb, careerIds).forEach(function (id) { if (ids.indexOf(id) < 0) ids.push(id); }); });
      return ids;
    }
    // R-M13B-115: an option with a skill choice goes straight to its list, and Done writes the pick and the ticks together. Back writes nothing.
    function chooseOption(g, opt) {
      if (opt.skill_choice_grants) {
        var keysIn = poolOf(opt.skill_choice_grants).map(function (sid) { return skillKeysOf[sid] || sid; });
        var mine = optionPick(g).picked.indexOf(opt) >= 0 ? Object.keys(chosenRanks).filter(function (k) { return keysIn.indexOf(k) >= 0; }) : [];
        setOver({ kind: 'optionSkills', group: g, opt: opt, ticks: mine });
        return;
      }
      setPatch(withKeys(patch, sheet, M.speciesPickVals(sheet, patch, spRec, p.groupSlug(g.name), opt.id, null, skillKeysOf, env()))); setOver(null);
    }
    function optionSkillsDone(o) {
      var ranks = {}; o.ticks.forEach(function (k) { ranks[k] = 1; });
      setPatch(withKeys(patch, sheet, M.speciesPickVals(sheet, patch, spRec, p.groupSlug(o.group.name), o.opt.id, ranks, skillKeysOf, env()))); setOver(null);
    }
    function careerGroups() { return spRec ? CR().speciesCareerPickGroups(spRec, cb) : []; }
    function careerHeld(g) { return CR().speciesCareerPicksHonoured(spRec, g, eff.speciesSkillChoices); }
    function careerDone(o) {
      // R-M13B-125: the first ticked are the ones that count; only then the list's order, as drawn. The writer's slice never picks between them.
      var counted = o.ticks.slice(0, o.group.max_picks), chosen = {};
      chosen[o.group.career_pick.poolId] = o.group.options.map(function (x) { return x.id; }).filter(function (id) { return counted.indexOf(id) >= 0; });
      setPatch(withKeys(patch, sheet, M.careerPickVals(sheet, patch, spRec, cb, chosen, env()))); setOver(null);
    }
    // R-M13B-133: a group of more than one pick: the same writer, given the ticked ids. Done with the same picks writes nothing.
    function optionPicksDone(o) {
      var held = optionPick(o.group).picked.map(function (x) { return x.id; });
      if (held.length !== o.ticks.length || held.some(function (x) { return o.ticks.indexOf(x) < 0; })) setPatch(withKeys(patch, sheet, M.speciesPickVals(sheet, patch, spRec, p.groupSlug(o.group.name), o.ticks.slice(), null, skillKeysOf, env())));
      setOver(null);
    }
    function tick(o, k) { setOver(Object.assign({}, o, { ticks: o.ticks.indexOf(k) >= 0 ? o.ticks.filter(function (x) { return x !== k; }) : o.ticks.concat([k]) })); }
    // R-M13R-4, R-M13R-40: past the count or the rank, the page's note. Never a block.
    function countNote(n, of, what) { return n > of ? (spRec.name + ' gives ' + of + ' ' + what + (of === 1 ? '' : 's') + '; this is a ' + ordinal(n) + '.') : null; }
    function rankNotes(ticks, cap_) {
      return ticks.map(function (k) {
        var r = (Number((eff.skills || {})[k]) || 0) - (Number(chosenRanks[k]) || 0) + 1;
        return r > cap_ ? skillName(k) + ' ' + r + ' is past the book’s limit: at creation, a skill stops at rank ' + cap_ + ' (' + M.creationRankCite(eff) + ').' : null;
      });
    }
    // Free skill ranks (skill_choice_grants): a tick grants rank 1 and marks it, so it prices 0 (R-M13B-32)
    function toggleGrant(key) {
      var skills = Object.assign({}, eff.skills), applied = Object.assign({}, eff.speciesGrantApplied);
      if (applied[key]) { delete applied[key]; var left = (Number(skills[key]) || 0) - 1; if (left > 0) skills[key] = left; else delete skills[key]; }
      else { applied[key] = 1; skills[key] = (Number(skills[key]) || 0) + 1; }
      setPatch(withKeys(patch, sheet, { skills: skills, speciesGrantApplied: applied }));
    }

    // ── career, specializations ──
    var careers = view.careers || {}, carId = eff.careerId || Object.keys(careers).filter(function (k) { return careers[k].name === eff.career; })[0], carRec = careers[carId] || null;
    var specEntries = Array.isArray(eff.specializations) ? eff.specializations : [], specReg = view.specializations || {};
    function setSpecs(list) { set('specializations', list); }
    function addSpec(r) { setPatch(M.specsDraft(sheet, patch, specEntries.concat([{ id: r.id, owned: [] }]), env())); setOver(null); }
    function withoutSpec(sid) {
      var vals = { specializations: specEntries.filter(function (e) { return e.id !== sid; }) };
      specEntries.filter(function (e) { return e.id === sid; }).forEach(function (e) { (e.owned || []).forEach(function (pos) { dropCellPicks(vals, sid, pos); }); });
      return vals;
    }
    function afterSpecs(next, list) { return M.specsDraft(sheet, next, list, env()); }
    function removeSpec(sid) { var vals = withoutSpec(sid), rest = vals.specializations; delete vals.specializations; setPatch(afterSpecs(withKeys(patch, sheet, vals), rest)); }
    var n = specEntries.length, inNext = CR().buildPrice('specialization', { rec: { id: 'x' }, ownedCount: n, career: { specializations: ['x'] } }), outNext = CR().buildPrice('specialization', { rec: { id: 'x' }, ownedCount: n, career: { specializations: [] } });

    // ── characteristics, skills ──
    var chars = eff.characteristics || {};
    function stepChar(k, d) { set('characteristics', Object.assign({}, chars, (function () { var o = {}; o[k] = Math.max(0, (Number(chars[k]) || 0) + d); return o; })())); }
    var limits = quote.lines.filter(function (l) { return l.pastLimit && l.limit; });
    function bookNote(part) { return limits.filter(function (l) { return l.part === part; }).map(function (l) { return h('div', { key: l.part, className: 'm13-note', 'data-m13-limit': '1' }, BOOK_NOTE[l.limit.kind][l.limit.book]); }); }
    function citeWords(c) { return String(c || '').replace(' Core Rulebook', ''); }
    var skillIds = Object.keys(cb.skillNames || {}).sort(function (a, b) { return String(cb.skillNames[a]).localeCompare(String(cb.skillNames[b])); });
    var status = CR().careerSkillStatus(eff, view);
    function stepSkill(k, d) {
      var s = Object.assign({}, eff.skills), v = Math.max(0, (Number(s[k]) || 0) + d);
      if (v > 0) s[k] = v; else delete s[k];
      set('skills', s);
    }
    var free = M.freePools(sheet, patch, env());
    function skillName(k) { return cb.skillNames[(status[k] || {}).id] || (function () { var f = skillIds.filter(function (sid) { return cb.skillSheetKeys[sid] === k; })[0]; return f ? cb.skillNames[f] : k; })(); }
    function freeOffWords(l) { var was = sheet.careerId !== eff.careerId && careers[sheet.careerId]; return was && l.to < l.from ? was.name + '\u2019s free rank comes off' : 'Free rank taken off'; }
    function nextSkillPrice(k, r) { return r >= 5 ? 'max' : (tracked ? CR().buildPrice('skill', { rank: r + 1, inCareer: !!(status[k] && status[k].career) }) + ' XP' : freeWord); }

    // ── talents ──
    function setOwned(sid, owned) { setSpecs(specEntries.map(function (e) { return e.id === sid ? Object.assign({}, e, { owned: owned }) : e; })); }
    var crossFree = [];
    // ── a talent's pick: the sheet's own choosers, no host; each writes the shape the sheet's buy writes (R-M13B-47, -57). ──
    var pickCb = Object.assign({}, cb, view);
    function cellTalent(sid, pos) { var rc = String(pos).split('-'), tree = specReg[sid] && specReg[sid].talent_tree, c = tree && tree[rc[0]] && tree[rc[0]].talents && tree[rc[0]].talents[rc[1]]; return c ? c.talent : null; }
    function ownedWith(sid, row, col) { return specEntries.map(function (e) { return e.id === sid ? Object.assign({}, e, { owned: (e.owned || []).concat([row + '-' + col]) }) : e; }); }
    function cellAnchor(sid, row, col) { var c = root.current && root.current.querySelector('[data-m13-tree="' + sid + '"] [data-testid="talent-cell-' + row + '-' + col + '"]'); return c ? (c.querySelector('button.hp-tab, .hp-head[role=button]') || c) : null; }
    function skillPickOf(sh, tk) { return (CR().picksOf(sh, pickCb, tk) || []).filter(function (x) { return x.pick.kind === 'skill' && !CR().isLegacyPick(x.pick.id); })[0] || null; }
    function itemPicked(sh, tk) { return (CR().picksOf(sh, pickCb, tk) || []).some(function (x) { return x.pick.kind === 'item'; }); }
    function mapWith(vals, key, sid, pos, value) { var m = clone(own(vals, key) ? vals[key] : eff[key]) || {}; (m[sid] = m[sid] || {})[pos] = value; vals[key] = m; }
    function prunedMap(m) { Object.keys(m).forEach(function (k) { if (!Object.keys(m[k]).length) delete m[k]; }); return Object.keys(m).length ? m : undefined; }
    // A refund takes the cell's pick with it, and a Dedication's point. Empty maps go, so a buy and its refund leave no change.
    function dropCellPicks(vals, sid, pos) {
      var tid = cellTalent(sid, pos);
      ['talentSkillChoices', 'talentCharacteristicChoices', 'talentChoices'].forEach(function (key) {
        var m = clone(own(vals, key) ? vals[key] : eff[key]); if (!m || !m[sid] || m[sid][pos] === undefined) return;
        if (key === 'talentCharacteristicChoices' && tid === 'dedication') { var c = m[sid][pos], chars2 = Object.assign({}, own(vals, 'characteristics') ? vals.characteristics : eff.characteristics); chars2[c] = Math.max(0, (Number(chars2[c]) || 0) - 1); vals.characteristics = chars2; }
        delete m[sid][pos];
        var left = prunedMap(m); vals[key] = left === undefined && own(sheet, key) ? {} : left;
      });
      var after = vals.specializations || specEntries, still = tid && (loose[tid] || after.some(function (e) { return (e.owned || []).some(function (x) { return !(e.id === sid && x === pos) && cellTalent(e.id, x) === tid; }); }));
      var tc = clone(own(vals, 'talentChoices') ? vals.talentChoices : eff.talentChoices);
      if (tid && !still && tc && tc._talent && tc._talent[tid] !== undefined) { delete tc._talent[tid]; var lft = prunedMap(tc); vals.talentChoices = lft === undefined && own(sheet, 'talentChoices') ? {} : lft; }
      return vals;
    }
    function askAfterBuy(next, tk, sk, row, col, cost) {
      var e = skillPickOf(next, tk), pos = row + '-' + col;
      var unmade = e && e.instances.some(function (i) { return i.value === undefined && (e.pick.per === 'talent' || (i.specId === sk && i.pos === pos)); });
      if (unmade) setOver({ kind: 'charPick', pick: { mode: 'm8', pickId: e.pick.id, kind: 'skill', optionId: null, talentKey: tk, specKey: sk, row: row, col: col, cost: cost, anchor: cellAnchor(sk, row, col) } });
    }
    function buyCell(tk, sk, row, col, cost) {
      var trec = view.talents && view.talents[tk], grants = CR().talentChoiceGrantsOf(trec) || [];
      if (tk === 'dedication' || p.chosenSwapOf(trec)) { setOver({ kind: 'charPick', pick: { mode: 'buy', talentKey: tk, specKey: sk, row: row, col: col, cost: cost, anchor: cellAnchor(sk, row, col) } }); return; }
      if (grants.length) { setOver({ kind: 'skillPick', mode: 'buy', talentKey: tk, talentName: (trec && trec.name) || tk, specKey: sk, row: row, col: col, cost: cost, grants: grants, initialPicks: [] }); return; }
      var next = withKeys(patch, sheet, { specializations: ownedWith(sk, row, col) });
      setPatch(next); askAfterBuy(effOf(sheet, next), tk, sk, row, col, cost);
    }
    function charChosen(pick, c) {
      var held = over && over.sheet; setOver(null);
      if (pick.add && pick.mode === 'm8') { var w8 = CR().pickWrite(held, pickCb, pick.talentKey, pick.specKey, pick.pos, pick.pickId, c); if (w8 && !w8.refused) setPatch(withKeys(patch, sheet, Object.assign({ looseTalents: held.looseTalents }, w8))); return; }
      if (pick.add) { var va = { looseTalents: looseWith(pick.talentKey, { characteristicChoice: c }) }; if (pick.talentKey === 'dedication') { va.characteristics = Object.assign({}, eff.characteristics); va.characteristics[c] = Math.min(CR().CHARACTERISTIC_CAP, (Number(va.characteristics[c]) || 0) + 1); } setPatch(withKeys(patch, sheet, va)); return; }
      if (pick.mode === 'm8') { var w = CR().pickWrite(eff, pickCb, pick.talentKey, pick.specKey, pick.row + '-' + pick.col, pick.pickId, c); if (w && !w.refused) setPatch(withKeys(patch, sheet, w)); return; }
      var pos = pick.row + '-' + pick.col, vals = {}, raise = pick.talentKey === 'dedication';
      if (pick.mode === 'place') raise = raise && CR().dedicationOwedCells(eff, specReg).indexOf(pick.specKey + ' ' + pos) !== -1;
      else vals.specializations = ownedWith(pick.specKey, pick.row, pick.col);
      mapWith(vals, 'talentCharacteristicChoices', pick.specKey, pos, c);
      if (raise) { var ch = Object.assign({}, eff.characteristics); ch[c] = Math.min(CR().CHARACTERISTIC_CAP, (Number(ch[c]) || 0) + 1); vals.characteristics = ch; }
      setPatch(withKeys(patch, sheet, vals));
    }
    function skillsChosen(o, skills) {
      if (o.mode === 'loose') { setLoose(looseWith(o.talentKey, { skillChoices: skills.slice() })); setOver(null); return; }
      var vals = o.mode === 'buy' ? { specializations: ownedWith(o.specKey, o.row, o.col) } : {};
      mapWith(vals, 'talentSkillChoices', o.specKey, o.row + '-' + o.col, skills.slice());
      setPatch(withKeys(patch, sheet, vals)); setOver(null);
    }
    function headPick(entry, el) {
      if (entry.m8Pick) { setOver({ kind: 'charPick', pick: { mode: 'm8', pickId: entry.m8Pick.id, kind: entry.m8Pick.kind, optionId: null, talentKey: entry.talentKey, specKey: entry.specKey, row: entry.row, col: entry.col, cost: entry.buy ? entry.buy.cost : entry.reachCost, anchor: el } }); return; }
      setOver({ kind: 'charPick', pick: { mode: entry.charChoiceNeeded ? 'place' : 'chosen', talentKey: entry.talentKey, specKey: entry.specKey, row: entry.row, col: entry.col, cost: entry.buy ? entry.buy.cost : entry.reachCost, receipt: entry.charChoiceReceipt, anchor: el } });
    }
    function talentModel(e) {
      var map = {}; (e.owned || []).forEach(function (pos) { var q = String(pos).split('-'); map[e.id + '_r' + q[0] + 'c' + q[1]] = true; });
      var m = window.SWRPGTree.talentTreeToModel({ skin: 'board', interactive: true, specData: specReg[e.id], talentDb: view.talents, character: { talents: map }, crossFreeIds: crossFree, allowRefund: true, readOnly: false, availableXp: NEVER_BLOCK,
        characteristicChoices: eff.talentCharacteristicChoices || {}, talentSkillChoices: eff.talentSkillChoices, talentChoices: eff.talentChoices, skillNames: cb.skillNames,
        characteristicOwed: CR().dedicationOwedCells(eff, specReg),
        onChooseSkills: function (tk, sk, row, col) { var trec = view.talents[tk]; setOver({ kind: 'skillPick', mode: 'choose', talentKey: tk, talentName: (trec && trec.name) || tk, specKey: sk, row: row, col: col, grants: CR().talentChoiceGrantsOf(trec) || [], initialPicks: CR().pickOf(eff, sk, row + '-' + col, 'career_skills') || [] }); },
        onBuy: function (tk, sk, row, col, cost) { buyCell(tk, sk, row, col, cost); },
        onRefund: function (key) {
          var q = String(key).match(/_r(\d+)c(\d+)$/); if (!q) return;
          var pos = q[1] + '-' + q[2], vals = { specializations: specEntries.map(function (x) { return x.id === e.id ? Object.assign({}, x, { owned: (x.owned || []).filter(function (o) { return o !== pos; }) }) : x; }) };
          setPatch(withKeys(patch, sheet, dropCellPicks(vals, e.id, pos)));
        } });
      // R-M13B-46: an item pick asks on the sheet, after Save, so its head opens nothing here. A per-talent skill pick re-opens from its head (the shared tree offers per-rank only).
      m.rows.forEach(function (row) { row.cells.forEach(function (cell) {
        var en = cell && cell.entry; if (!en) return;
        if (en.m8Pick && en.m8Pick.kind !== 'skill') en.m8Pick = null;
        if (!en.m8Pick && (e.owned || []).indexOf(en.row + '-' + en.col) >= 0) { var sp = skillPickOf(eff, en.talentKey); if (sp && sp.pick.per === 'talent') en.m8Pick = { id: sp.pick.id, kind: 'skill', optionId: null }; }
      }); });
      return m;
    }
    function itemLines(names) { return names.map(function (nm) { return h('div', { key: nm, className: 'm13-note', 'data-m13-itemline': '1' }, nm + ': choose its item on the sheet after you save.'); }); }   // R-M13B-54, verbatim
    function treeItemLines(e) {
      var was = (((Array.isArray(sheet.specializations) ? sheet.specializations : []).filter(function (x) { return x.id === e.id; })[0] || {}).owned) || [], seen = {};
      return itemLines((e.owned || []).filter(function (pos) { return was.indexOf(pos) < 0; }).map(function (pos) { return cellTalent(e.id, pos); }).filter(function (t) { if (!t || seen[t] || !itemPicked(eff, t)) return false; seen[t] = 1; return true; }).map(function (t) { return (view.talents[t] || {}).name || t; }));
    }
    var loose = eff.looseTalents || {};
    function setLoose(next) { set('looseTalents', next); }
    function looseWith(tid, pick) { var o = Object.assign({}, loose); o[tid] = { ranks: 1, xp: cheapestRow(view, tid) || 0 }; if (pick) o[tid].picks = [pick]; return o; }
    // R-M13R-19: a talent that needs a choice asks at the add, through the sheet's own chooser; Cancel leaves it out.
    function addLoose(r) {
      var trec = view.talents[r.id], grants = CR().talentChoiceGrantsOf(trec) || [], cost = cheapestRow(view, r.id) || 0, rw = cost / 5 - 1;
      if (grants.length) { setOver({ kind: 'skillPick', mode: 'loose', talentKey: r.id, talentName: trec.name, cost: cost, grants: grants, initialPicks: [] }); return; }
      if (r.id === 'dedication' || p.chosenSwapOf(trec)) { setOver({ kind: 'charPick', pick: { mode: 'buy', add: true, talentKey: r.id, specKey: '_loose', row: rw, col: 0, cost: cost } }); return; }
      var held = effOf(sheet, Object.assign({}, patch, { looseTalents: looseWith(r.id) })), e = skillPickOf(held, r.id);
      if (e) { setOver({ kind: 'charPick', sheet: held, pick: { mode: 'm8', add: true, pickId: e.pick.id, kind: 'skill', optionId: null, talentKey: r.id, specKey: e.instances[0].specId, pos: e.instances[0].pos, row: rw, col: 0, cost: cost } }); return; }
      setLoose(looseWith(r.id)); setOver(null);
    }
    function removeLoose(tid) {
      var o = Object.assign({}, loose), gone = o[tid], pk = gone && gone.picks && gone.picks[0]; delete o[tid]; var nx = withKey(patch, sheet, 'looseTalents', o);
      if (tid === 'dedication' && pk && pk.characteristicChoice) { var chd = Object.assign({}, eff.characteristics); chd[pk.characteristicChoice] = Math.max(0, (Number(chd[pk.characteristicChoice]) || 0) - 1); nx = withKey(nx, sheet, 'characteristics', chd); }
      var tcL = clone(eff.talentChoices); if (tcL && tcL._talent && tcL._talent[tid] !== undefined) { delete tcL._talent[tid]; var lf = prunedMap(tcL); nx = withKey(nx, sheet, 'talentChoices', lf === undefined && own(sheet, 'talentChoices') ? {} : lf); }
 if (eff.own && eff.own.sections && eff.own.sections.talents && eff.own.sections.talents[tid] && eff.own.sections.talents[tid]._mode === 'add') nx = draftOwn(nx, sheet, 'talents', tid, null); setPatch(nx);
    }
    function looseChosen(tid, e) {
      var pk = (e.picks && e.picks[0]) || {}, vals = [].concat(pk.skillChoices || [], pk.characteristicChoice ? [cap(pk.characteristicChoice)] : []);
      (CR().picksOf(eff, pickCb, tid) || []).forEach(function (x) { if (x.pick.kind === 'skill' && !CR().isLegacyPick(x.pick.id)) vals = vals.concat(x.values); });
      return vals.length ? ' Chosen: ' + vals.map(function (v) { return cb.skillNames[v] || v; }).join(', ') + '.' : '';
    }
    function closeForm() { setOver(null); }
    // R-M13B-56: "Modify a …". Change writes this character's copy under the same id; the form's "A new …, from" adds a record, then the part's own Add.
    function modifySaved(o, rec, how) {
      if (how && how.intent === 'new') {
        var a = M.addOwn(eff.own, o.section, rec, env()), no = railRefusal(a.own); if (no) return no;
        var vals = { own: a.own };
        if (o.section === 'talents') { vals.looseTalents = Object.assign({}, loose); vals.looseTalents[a.id] = { ranks: 1, xp: 0 }; }
        if (o.section === 'force_powers') vals.forcePowers = powerEntries.concat([{ id: a.id, basic: true, upgrades: [] }]);
        if (o.section === 'specializations') vals.specializations = specEntries.concat([{ id: a.id, owned: [] }]);
        if (o.section === 'careers') { vals.careerId = a.id; vals.career = rec.name; }
        setPatch(withKeys(patch, sheet, vals)); closeForm(); return;
      }
      var c = Object.assign(copyOf(eff, o.section, o.id) || {}, rec, { id: o.id }), refused = railRefusal(M.withRecord(eff.own, o.section, o.id, c)); if (refused) return refused;
      var next = draftOwn(patch, sheet, o.section, o.id, c);
      if (o.section === 'careers') next = withKey(next, sheet, 'careerId', o.id);   // a saved name alone would no longer find a renamed copy
      setPatch(next); closeForm();
    }
    function ownedTalentIds() {
      var seen = {}, out = [], add = function (id) { if (id && !seen[id] && view.talents[id]) { seen[id] = 1; out.push(id); } };
      (Array.isArray(eff.talents) ? eff.talents : []).forEach(function (t) { add(t && t.id); });
      specEntries.forEach(function (e) { (e.owned || []).forEach(function (pos) { add(cellTalent(e.id, pos)); }); });
      Object.keys(loose).forEach(add);
      return out;
    }
    function modifyList(section, noun, plural, recs) {
      return { kind: 'modifyList', section: section, title: 'Modify a ' + noun, search: 'Search ' + recs.length + ' ' + plural + '…', rows: recs.slice().sort(byName).map(function (r) { return recRow(r, { src: '' }); }) };
    }
    // a record the rail would refuse never reaches the draft: the form keeps it open and says why, in its own reasons
    function railRefusal(own) { var e = env(), a = e.rail && e.rail.authoring(own, e.railCtx || e.rail.ctx); return a && !a.ok ? a : null; }
    function newTalentSaved(rec) { var a = M.addOwn(eff.own, 'talents', rec, env()), lo = Object.assign({}, loose), no = railRefusal(a.own); if (no) return no; lo[a.id] = { ranks: 1, xp: 0 }; setPatch(withKeys(patch, sheet, { own: a.own, looseTalents: lo })); closeForm(); }
    function speciesFormSaved(rec) { var c = Object.assign(copyOf(eff, 'species', spId) || {}, rec, { id: spId }), next = draftOwn(patch, sheet, 'species', spId, c), no = railRefusal(M.withRecord(eff.own, 'species', spId, c)); if (no) return no; setPatch(next); closeForm(); }

    // ── Force powers ──
    var powerEntries = Array.isArray(eff.forcePowers) ? eff.forcePowers : [], forceReg = view.forcePowers || {};
    var hasForce = (Number(eff.forceRatingBase) || 0) > 0 || powerEntries.length > 0;
    function setPowers(list) { set('forcePowers', list); }
    function upgradeKey(u) { return (u && typeof u === 'object') ? u.key : u; }
    var GRANTED = { career: true, bonus: true, both: true };   // the record's grant marker (CharResolve's GRANT_KINDS)
    function bareEntry(x) { var o = Object.assign({}, x); ['upgrades', 'owned'].forEach(function (k) { if (Array.isArray(o[k]) && !o[k].length) delete o[k]; }); return o; }
    // a removal that lands the entry back where the sheet holds it is no change (R-M13B's "empty maps go")
    function asSaved(np) { var was = (Array.isArray(sheet.forcePowers) ? sheet.forcePowers : []).filter(function (x) { return x && x.id === np.id; })[0]; return was && same(bareEntry(np), bareEntry(was)) ? was : np; }
    // R-M13B-159: a removal's N is what the save will refund for it, from the one price core
    function refundOf(list) { return Math.max(0, M.price(sheet, patch, { tracked: true }, env()).xp - M.price(sheet, withKey(patch, sheet, 'forcePowers', list), { tracked: true }, env()).xp); }
    function powerModel(e, i) {
      var rec = forceReg[e.id], names = (e.upgrades || []).map(upgradeKey), tree = (rec && rec.tree) || [];
      var m = window.SWRPGTree.forcePowerToModel({ power: rec, ownedUpgradeNames: names, ownedCells: e.owned, basicOwned: !!e.basic, availableXp: NEVER_BLOCK, readOnly: false, skin: 'board', interactive: true, buyOnCell: true,
        upgradeCost: function (k, c) { return CR().sheetForcePowerUpgradeCost(eff, view, rec, k, c); },
        onBuy: function (abilityKey, abilityName, cost, cell) {
          var list = powerEntries.slice(), np = Object.assign({}, e), ups = (e.upgrades || []).slice(), ow = Array.isArray(e.owned) ? e.owned.slice() : (ups.length ? null : []);
          if (ow && ow.length === ups.length && cell) { ow.push(cell); np.owned = ow; }
          ups.push(abilityKey); np.upgrades = ups; list[i] = np; setPowers(list);
        } });
      var ownedValid = Array.isArray(e.owned) && e.owned.length > 0 && !CR().forcePowerOwnedProblems({ upgrades: names, owned: e.owned }, tree).length;
      function without(ri, ci, cell) {
        var ups = (e.upgrades || []).slice(), ow = Array.isArray(e.owned) ? e.owned.slice() : null, np = Object.assign({}, e);
        var at = ow && ow.length === ups.length ? ow.indexOf(ri + '-' + ci) : -1;
        if (at < 0) { var ak = cell._abilityKey || (cell.entry && cell.entry.abilityKey); at = ups.map(upgradeKey).lastIndexOf(ak); }
        if (at < 0) return null;
        ups.splice(at, 1); if (ow && ow.length > at) ow.splice(at, 1);
        np.upgrades = ups; if (ow) np.owned = ow; return asSaved(np);
      }
      // the cell's own badge refunds (R-M13B-157, R-M13L-8), on this page only
      m.rows.forEach(function (row, ri) {
        row.cells.forEach(function (cell, ci) {
          if (!cell || cell.filler || !cell.entry || cell.entry.granted) return;
          var list;
          if (ri === 0) {
            // the basic power removes the whole entry; a power the record holds as granted keeps "Granted"
            if (cell.state !== 'granted' || !e.basic || GRANTED[e.granted]) return;
            list = powerEntries.filter(function (_, x) { return x !== i; });
          } else {
            if (cell.state !== 'owned') return;
            var np = without(ri, ci, cell); if (!np) return;
            // R-M13B-161: the entry stays legal afterwards — its shape (the power's one check, when `owned` is valid) AND its connection (the talents' check)
            if (!cell.entry.keepsTree || (ownedValid && CR().forcePowerOwnedProblems({ upgrades: (np.upgrades || []).map(upgradeKey), owned: np.owned || [] }, tree).length)) { cell.entry.cannotRefund = true; return; }
            list = powerEntries.slice(); list[i] = np;
          }
          var n = refundOf(list);
          cell.cost = n;
          cell.entry.refund = { label: 'REFUND — +' + n + ' XP', doRefund: function () { setPowers(list); } };
        });
      });
      return m;
    }
    function addPower(r) { var row0 = (r.tree || [])[0], cost = 0; if (row0 && row0.cells && row0.cells[0]) cost = row0.cells[0].cost; setPowers(powerEntries.concat([{ id: r.id, basic: true, upgrades: [] }])); setOver(null); return cost; }

    // ── signature abilities: the sheet's own model and shelf, passed in ──
    var sigEntries = (Array.isArray(eff.signatureAbilities) ? eff.signatureAbilities : []).filter(function (e) { return e && e.id; });
    var sigReg = view.signatureAbilities || {};
    var specIds = specEntries.map(function (e) { return e && e.id; }).filter(Boolean);
    var shelf = p.sigShelfOf(eff, view, carRec, specIds);
    function sigModel(e, i) {
      var rec = sigReg[e.id], tree = e.tree, owned = (e.owned || []).map(String);
      var m = p.sigTreeModel(rec, { mode: 'stage',
        cellState: function (pos) {
          if (owned.indexOf(pos) !== -1) return { state: 'owned' };
          var plan = CR().sigBuyPlan(eff, view, e.id, tree, pos);
          if (plan.held) return { state: 'held', reason: plan.held.words };
          if (!plan.ok) return { state: 'locked', reason: plan.refusal && plan.refusal.words };
          return { state: 'buyable' };
        },
        onBuy: function (pos) { var plan = CR().sigBuyPlan(eff, view, e.id, tree, pos); if (plan.ok) set('signatureAbilities', plan.signatureAbilities); } });
      // a refund only where the entry stays legal (the one legality function)
      m.rows.forEach(function (row, ri) {
        row.cells.forEach(function (cell, ci) {
          var pos = ri + '-' + ci; if (!cell || cell.filler || owned.indexOf(pos) === -1 || pos === '0-0') return;
          var after = sigEntries.map(function (x, y) { return y === i ? Object.assign({}, x, { owned: owned.filter(function (q) { return q !== pos; }) }) : x; });
          var chk = CR().sigAbilityChecks(Object.assign({}, eff, { signatureAbilities: after }), view)[i];
          if (chk && chk.ok) cell.entry.refund = { label: 'REFUND — +' + (cell.cost || 0) + ' XP', doRefund: function () { set('signatureAbilities', after); } };
        });
      });
      return m;
    }
    function addSig(id2, tree) { var plan = CR().sigBuyPlan(eff, view, id2, tree, '0-0'); if (plan.ok) set('signatureAbilities', plan.signatureAbilities); setOver(null); }
    function removeSig(sid) { set('signatureAbilities', sigEntries.filter(function (e) { return e.id !== sid; })); }

    // ── motivations: the book's one pick first, then the four words (R-M13B-20, -21, -27; D-459) ──
    var mv = eff.motivations || {}, empties = FOUR.filter(function (k) { return !mv[k]; });
    var pick = eff.motivation || null, hasPick = !!(pick && (pick.category || pick.specific || pick.custom));
    var catsById = {}, specsById = {};
    (cb.motivationCategories || []).forEach(function (c) { catsById[c.id] = c.name; });
    (cb.motivationSpecifics || []).forEach(function (s) { specsById[s.id] = s.name; });
    var pickText = hasPick ? (pick.custom || [catsById[pick.category], specsById[pick.specific]].filter(Boolean).join(' — ')) : '';   // PROFILE's own join (`motText`)
    var offersAdd = (hasPick ? [] : ['motivation']).concat(empties);
    function offerTap(k) { setAdding(false); if (k === 'motivation') setOver({ kind: 'motivation' }); else setField({ key: k, value: '' }); }
    function pickDone(m) {
      var some = !!(m && (m.category || m.specific || m.custom)), had = !!(sheet.motivation && (sheet.motivation.category || sheet.motivation.specific || sheet.motivation.custom));
      setPatch(!some && !had ? (function () { var o = Object.assign({}, patch); delete o.motivation; return o; })() : withKey(patch, sheet, 'motivation', m));
      setOver(null);
    }
    function commitField() {
      var o = Object.assign({}, mv), v = String(field.value || '').trim();
      if (v) o[field.key] = v; else delete o[field.key];
      set('motivations', o); setField(null); setAdding(false);
    }
    function wordField(k) {
      return h(React.Fragment, { key: 'f' + k },
        h('label', { className: 'm13-field', 'data-m13-edit': k }, h('span', null, cap(k)),
          h('input', { type: 'text', 'aria-label': cap(k), value: field.value, autoFocus: true, onChange: function (e) { setField({ key: k, value: e.target.value }); } })),
        h('div', { className: 'm13-acts' }, h(Quiet, { onClick: commitField }, 'Done')));
    }

    // ── offers (R-M13L-4) ──
    var offers = M.offers(eff, env());
    function regOf(section) { return { force_powers: 'forcePowers', signature_abilities: 'signatureAbilities' }[section] || section; }
    function offerName(o) { var rec = eff.own.sections[o.section][o.id]; return rec.name || o.id; }
    function takeUpdate(o) { setPatch(draftOwn(patch, sheet, o.section, o.id, null)); setOver(null); }
    function keepMine(o) { var rec = clone(eff.own.sections[o.section][o.id]), fresh = M.ownCopy(eff, o.section, o.id, env()); rec._base = fresh._base; setPatch(draftOwn(patch, sheet, o.section, o.id, rec)); setOver(null); }
    function goneFrom(o) { var from = o.from, P = window.SWRPGMods && window.SWRPGMods.parseUserStamp && window.SWRPGMods.parseUserStamp(from); return idWords((P && P.packId) || from, 'a deleted collection'); }
    function offerNotices(sections, only) {
      return offers.filter(function (o) { return sections.indexOf(o.section) >= 0 && o.state !== 'current' && (!only || only(o)); }).map(function (o) {
        var name = offerName(o);
        if (o.state === 'gone') return h(Notice, { key: o.id, kind: 'gone-source', text: name + ' is from ' + goneFrom(o) + ', which is gone. Your copy still works.' });
        return h(Notice, { key: o.id, kind: 'update-offer', text: name + ' changed in its book since you modified it.', acts: [
          { t: 'Preview', on: function () { setOver({ kind: 'preview', offer: o }); } }, { t: 'Take the update', on: function () { takeUpdate(o); } }, { t: 'Keep mine', on: function () { keepMine(o); } }] });
      });
    }

    // v7: a talent's notice stands under the name of the first tree that holds it, an outside talent's under its row.
    function talentNoticeTree(o) {
      if (loose[o.id]) return null;
      var hit = knownEntries.filter(function (e) { return (specReg[e.id].talent_tree || []).some(function (row) { return (row.talents || []).some(function (c) { return c && c.talent === o.id; }); }); })[0];
      return hit ? hit.id : null;
    }

    // ── the XP row and the save block ──
    var net = quote.net;
    var xpBox = h('div', null,
      h('div', { className: 'm13-xp', 'data-m13-xprow': '1' }, h('div', { className: 'm13-q' }, 'Do you want to track XP for these changes?'),
        h('button', { type: 'button', className: 'm13-sw', role: 'switch', 'aria-checked': tracked ? 'true' : 'false', 'aria-label': 'Track XP', onClick: function () { setTracked(!tracked); } }, h('i'), h('b', null, tracked ? 'On' : 'Off'))),
      h('div', { className: 'm13-xpn', 'data-m13-xpn': '1' }, (Number(xp.remaining) || 0) + ' XP · this change ', h('em', null, tracked ? signed(net) : freeWord)));
    var act = h('div', { 'data-m13-save': '1' },
      h('label', { className: 'm13-field m13-notefield' }, h('input', { type: 'text', placeholder: 'Note (optional)', 'aria-label': 'Note (optional)', value: note, onChange: function (e) { setNote(e.target.value); } })),
      reasons ? h(Notice, { kind: 'refused', text: reasons.join(' ') }) : null,
      h('div', { className: 'm13-barin' },
        h(Quiet, { onClick: function () { M.dropDraft(id); p.onBack(); } }, 'Cancel'),
        h(Quiet, { commit: true, onClick: saveNow, attrs: { 'aria-disabled': changed ? undefined : 'true' } }, 'Save changes')));

    // ── the log, newest first; the Undo row follows canUndo, so it survives a reload ──
    var log = (Array.isArray(sheet.changes) ? sheet.changes : []).slice().reverse();
    var can = M.canUndo(sheet, env());

    // ── the overlays ──
    var overlay = null;
    if (over && over.kind === 'species') overlay = h(ListHost, { kind: 'species', title: 'Species', search: 'Search ' + Object.keys(view.species || {}).length + ' species…', onBack: closeForm, onPick: pickSpecies,
      rows: Object.keys(view.species || {}).map(function (k) { return view.species[k]; }).sort(function (a, b) { return a.id === spId ? -1 : b.id === spId ? 1 : byName(a, b); }).map(function (r) { return recRow(r, { sel: r.id === spId }); }) });
    if (over && over.kind === 'career') overlay = h(ListHost, { kind: 'career', title: 'Career', search: 'Search ' + Object.keys(careers).length + ' careers…', onBack: closeForm,
      onPick: function (r) { setPatch(M.careerDraft(sheet, patch, r.id, r.name, env())); setOver(null); },
      rows: Object.keys(careers).map(function (k) { return careers[k]; }).sort(byName).map(function (r) { return recRow(r, { sel: r.id === carId }); }) });
    if (over && over.kind === 'spec') overlay = h(ListHost, { kind: 'spec', title: 'Add a specialization', search: 'Search ' + Object.keys(specReg).length + ' specializations…', onBack: closeForm, onPick: addSpec,
      rows: Object.keys(specReg).map(function (k) { return specReg[k]; }).filter(function (r) { return specIds.indexOf(r.id) < 0; }).sort(function (a, b) {
        var ia = carRec && (carRec.specializations || []).indexOf(a.id) >= 0, ib = carRec && (carRec.specializations || []).indexOf(b.id) >= 0; return ia === ib ? byName(a, b) : (ia ? -1 : 1);
      }).map(function (r) { return recRow(r, { price: priceWord(CR().buildPrice('specialization', { rec: r, ownedCount: n, career: carRec })) }); }) });
    if (over && over.kind === 'talent') {
      var inTree = {}; specEntries.forEach(function (e) { var sr = specReg[e.id]; ((sr && sr.talent_tree) || []).forEach(function (r) { (r.talents || []).forEach(function (c) { if (c) inTree[c.talent] = 1; }); }); });
      var allT = Object.keys(view.talents || {}).map(function (k) { return view.talents[k]; }).filter(function (t) { return !inTree[t.id] && !loose[t.id] && cheapestRow(view, t.id) != null && !itemPicked(eff, t.id); }).sort(byName);
      overlay = h(ListHost, { kind: 'talent', title: 'A talent from outside your trees', search: 'Search ' + allT.length + ' talents…', onBack: closeForm, onPick: addLoose,
        rows: allT.map(function (r) { return recRow(r, { price: priceWord(cheapestRow(view, r.id)) }); }) });
    }
    if (over && over.kind === 'force') {
      var fpAll = Object.keys(forceReg).map(function (k) { return forceReg[k]; }).filter(function (r) { return !powerEntries.some(function (e) { return e.id === r.id; }); }).sort(byName);
      var fpCtx = CR().careerPowerPriceCtx(eff, view);
      overlay = h(ListHost, { kind: 'force', title: 'Add a Force power', search: 'Search ' + fpAll.length + ' Force powers…', onBack: closeForm, onPick: function (r) { addPower(forceReg[r.id]); },
        rows: fpAll.map(function (r) { return recRow(r, { price: priceWord(CR().buildPrice('force_basic', { rec: r, ctx: fpCtx })) }); }) });
    }
    if (over && over.kind === 'optionSkills') {
      var osG = over.opt.skill_choice_grants, osCount = osG.reduce(function (n, x) { return n + (Number(x.count) || 1); }, 0), osCap = osG[0].rank_cap;
      overlay = h(ListHost, { kind: 'grant', title: 'Free skill ranks · ' + osG.map(function (x) { return grantWords(x, cb.skillNames); }).join(', ') + ', rank 1', multi: true, commit: 'Done', left: Math.max(0, osCount - over.ticks.length), onCommit: function () { optionSkillsDone(over); }, onBack: closeForm, onPick: function (r) { tick(over, r.id); },
        notes: [countNote(over.ticks.length, osCount, 'free rank')].concat(osCap != null ? rankNotes(over.ticks, osCap) : []).filter(Boolean),
        rows: poolOf(osG).map(function (sid) { var k = skillKeysOf[sid] || sid; return { id: k, name: cb.skillNames[sid], rule: cap((cb.skillChars || {})[sid]), on: over.ticks.indexOf(k) >= 0 }; }) });
    }
    if (over && over.kind === 'careerPick') {
      var cpG = over.group;
      overlay = h(ListHost, { kind: 'career-pick', title: 'Free career skills · ' + cpG.min_picks + ' ' + cpG.career_pick.noun + ', no rank', multi: true, commit: 'Done', left: Math.max(0, cpG.min_picks - over.ticks.length), onCommit: function () { careerDone(over); }, onBack: closeForm, onPick: function (r) { tick(over, r.id); },
        notes: [over.ticks.length > cpG.max_picks ? countNote(over.ticks.length, cpG.max_picks, 'free career skill').replace(/\.$/, ', and it won’t count.') : null].filter(Boolean),   // R-M13B-124
        rows: cpG.options.map(function (o) { return { id: o.id, name: o.name, rule: cap((cb.skillChars || {})[o.id]), on: over.ticks.indexOf(o.id) >= 0 }; }) });
    }
    if (over && over.kind === 'option' && over.group.max_picks > 1) overlay = h(ListHost, { kind: 'option', title: groupLabel(over.group), multi: true, commit: 'Done', left: Math.max(0, (over.group.min_picks || 0) - over.ticks.length), onCommit: function () { optionPicksDone(over); }, onBack: closeForm, onPick: function (r) { tick(over, r.id); },
      notes: [countNote(over.ticks.length, over.group.max_picks, 'pick')].filter(Boolean),
      rows: (over.group.options || []).map(function (o) { return { id: o.id, name: o.name, rule: clean(o.description).replace(/\s+/g, ' ').trim() || s1(Object.assign({}, o, { sources: spRec && spRec.sources })), on: over.ticks.indexOf(o.id) >= 0 }; }) });
    else if (over && over.kind === 'option') overlay = h(ListHost, { kind: 'option', title: groupLabel(over.group), onBack: closeForm, onPick: function (r) { chooseOption(over.group, r.opt); },
      rows: (over.group.options || []).map(function (o) { return { id: o.id, name: o.name, rule: clean(o.description).replace(/\s+/g, ' ').trim() || s1(Object.assign({}, o, { sources: spRec && spRec.sources })), opt: o }; }) });
    if (over && over.kind === 'line') overlay = h(ListHost, { kind: 'line', title: 'Game line', onBack: closeForm, onPick: pickLine,
      rows: Object.keys(LINES).map(function (b) { return { id: b, name: LINES[b], rule: cap(TRACK_OF[b]), sel: b === book }; }) });
    if (over && over.kind === 'trackType') overlay = h(ListHost, { kind: 'type', title: over.title, onBack: closeForm, onPick: function (r) { typeChosen(over, r); },
      rows: p.typesOf(over.list).map(function (t) { return { id: t.key, name: t.name, weakKey: t.weakKey, rule: clean(t.description).replace(/\s+/g, ' ').trim() }; }) });
    if (over && over.kind === 'freePool') {
      var fp = free.pools.filter(function (x) { return x.id === over.pool; })[0];
      if (fp) overlay = h(ListHost, { kind: 'free', title: 'Free ranks: ' + fp.title + ' \u00b7 ' + fp.of + ' free', multi: true, commit: 'Done', onCommit: closeForm, onBack: closeForm, onPick: function (r) { setPatch(M.moveFree(sheet, patch, fp.id, r.id, env())); },
        rows: fp.eligible.map(function (k) { var sid = skillIds.filter(function (i) { return cb.skillSheetKeys[i] === k; })[0]; return { id: k, name: skillName(k), rule: 'Rank ' + (Number((eff.skills || {})[k]) || 0) + ' \u00b7 ' + cap((cb.skillChars || {})[sid]), on: fp.keys.indexOf(k) >= 0 }; }) });
    }
    if (over && over.kind === 'grant') {
      var g = over.group, applied = eff.speciesGrantApplied || {};
      var pool = poolOf([g]);
      var grantTitle = 'Free skill ranks · ' + grantWords(g, cb.skillNames) + ', rank 1';
      overlay = h(ListHost, { kind: 'grant', title: grantTitle, search: 'Search ' + pool.length + ' skills…', multi: true, commit: 'Done', onCommit: closeForm, onBack: closeForm, onPick: function (r) { toggleGrant(r.id); },
        rows: pool.map(function (sid) { var k = cb.skillSheetKeys[sid] || sid; return { id: k, name: cb.skillNames[sid], rule: cap((cb.skillChars || {})[sid]), on: !!applied[k] }; }) });
    }
    if (over && over.kind === 'sigtree') overlay = h(ListHost, { kind: 'sigtree', title: over.row.rec.name, onBack: closeForm, onPick: function (r) { addSig(over.row.id, r.id); },
      rows: over.row.legal.map(function (tid) { var r = specReg[tid]; return { id: tid, name: r.name, rule: clean(r.description).replace(/\s+/g, ' ').trim(), price: priceWord(over.row.base.cost) }; }) });
    if (over && over.kind === 'preview') {
      var o = over.offer, mine = eff.own.sections[o.section][o.id];
      overlay = h(Preview, { name: mine.name || o.id, mine: clean(mine.description), book: clean(o.lower && o.lower.description), onBack: closeForm, onTake: function () { takeUpdate(o); }, onKeep: function () { keepMine(o); } });
    }
    if (over && over.kind === 'motivation') overlay = h(Host, { kind: 'picker', title: 'Motivation', onBack: closeForm },
      h('div', { 'data-m13-picker': '1' }, h(p.MotivationPicker, { band: desk ? 'desktop' : 'mobile', stepName: 'Motivation', stepIndex: 0, stepReached: 0, stepTotal: 1, steps: [], stepLabels: {}, soFar: [], xpPool: 0, xpRemaining: 0,
        cats: cb.motivationCategories || [], specs: cb.motivationSpecifics || [], rolls: cb.categoryRolls || null, line: eff.gameLine || eff.book, existing: pick,
        modifyWords: { back: 'Modify this Character', use: 'Use this motivation', none: 'No motivation' }, onConfirm: pickDone, onBack: closeForm, onJump: function () {} })));
    if (over && over.kind === 'modifyList') overlay = h(ListHost, { kind: 'modify', title: over.title, search: over.search, rows: over.rows, onBack: closeForm, onPick: function (r) { setOver({ kind: 'modifyForm', section: over.section, id: r.id, title: r.name }); } });
    if (over && over.kind === 'modifyForm') overlay = h(FormHost, { title: over.title, path: '/player/homebrew/' + over.section + '/' + (copyOf(eff, over.section, over.id)._mode === 'add' ? 'new' : encodeURIComponent(over.id)), rec: copyOf(eff, over.section, over.id), intent: 'change', onBack: closeForm, onSave: function (rec, how) { return modifySaved(over, rec, how); } });
    if (over && over.kind === 'charPick') overlay = h(p.CharPicker, { pick: over.pick, charbuild: pickCb, characteristics: eff.characteristics, sheet: over.sheet || eff, onClose: closeForm, onStep: function () {}, onChoose: function (c) { charChosen(over.pick, c); } });
    if (over && over.kind === 'skillPick') overlay = h(p.SkillPicker, { talentName: over.talentName, grants: over.grants, charbuild: pickCb, careerStatusIds: CR().careerSkillIds(CR().careerSkillStatus(eff, view)), cost: over.cost, mode: over.mode === 'loose' ? 'buy' : over.mode, initialPicks: over.initialPicks, accent: 'var(--doc-action)', onConfirm: function (skills) { skillsChosen(over, skills); }, onCancel: closeForm });
    if (over && over.kind === 'newTalent') overlay = h(FormHost, { title: 'New talent', path: '/player/homebrew/talents/new', onBack: closeForm, onSave: newTalentSaved });
    if (over && over.kind === 'newAbility') overlay = h(FormHost, { title: spRec ? spRec.name : 'Species', path: '/player/homebrew/species/' + encodeURIComponent(spId), rec: copyOf(eff, 'species', spId), onBack: closeForm, onSave: speciesFormSaved });

    // ── the body ──
    var goneSpec = function (e) { return !specReg[e.id]; };
    var knownEntries = specEntries.filter(function (e) { return !goneSpec(e); });
    var main = h('div', { className: 'm13-main' },
      h('div', { className: 'm13-run' }, h(Quiet, { onClick: p.onBack }, '‹ Sheet')),
      h('div', { className: 'm13-eyebrow' }, p.char.name),
      h('h1', { className: 'm13-h1' }, 'Modify this Character'),
      stale ? h(Notice, { kind: 'stale-draft', style: { marginTop: 14 }, text: 'Unsaved changes from ' + dayOf(stale.at) + ', made before ' + p.char.name + ' last changed.', acts: [
        { t: 'Open them', on: function () { setStale(null); setPatch(stale.patch || {}); } }, { t: 'Discard', on: function () { M.dropDraft(id); setStale(null); } }] }) : null,
      desk ? null : xpBox,
      lineSections,
      h(Section, { id: 'species', title: 'Species' },
        spRec ? h(Row, { k: spRec.name, sub: (spRec.sources || []).indexOf('unofficial_species_menagerie') >= 0 ? 'Community species' : null, right: h(Quiet, { onClick: function () { setOver({ kind: 'species' }); } }, 'Change') }) : null,
        bookNote('species'),
        offerNotices(['species']),
        spRec ? h(React.Fragment, null,
          h(Row, { k: 'Wound threshold base', right: h(Stepper, { value: spEff.wound_threshold_base, onLower: function () { stepSpecies('wound_threshold_base', -1); }, onRaise: function () { stepSpecies('wound_threshold_base', 1); } }) }),
          h(Row, { k: 'Strain threshold base', right: h(Stepper, { value: spEff.strain_threshold_base, onLower: function () { stepSpecies('strain_threshold_base', -1); }, onRaise: function () { stepSpecies('strain_threshold_base', 1); } }) }),
          h(Row, { k: 'Starting XP', right: h(Stepper, { value: spEff.starting_xp + CR().speciesOptionXpDelta(spRec, eff.speciesOptionPicks), onLower: function () { stepSpecies('starting_xp', -5); }, onRaise: function () { stepSpecies('starting_xp', 5); } }) }),
          (spRec.option_choices || []).map(function (g) {
            var op = optionPick(g), name = op.picked.map(function (o) { return o.name; }).join(', ');
            var withChoice = op.picked.some(function (o) { return o.skill_choice_grants; }), ticked = withChoice ? Object.keys(chosenRanks) : [];
            return h(React.Fragment, { key: g.name },
              h(Row, { k: groupLabel(g), sub: ticked.length ? ticked.map(skillName).join(', ') + ', rank 1' : (g.options || []).map(function (o) { return o.name; }).join(' or '),
                right: h(Quiet, { commit: !name, onClick: function () { setOver({ kind: 'option', group: g, ticks: op.picked.map(function (o) { return o.id; }) }); } }, name || 'Pick one') }),
              withChoice ? op.picked.filter(function (o) { return o.skill_choice_grants; }).map(function (o) { var c = o.skill_choice_grants.reduce(function (n, x) { return n + (Number(x.count) || 1); }, 0), t = countNote(ticked.length, c, 'free rank'); return t ? h('div', { key: o.id, className: 'm13-note', 'data-m13-limit': '1' }, t) : null; }) : null);
          }),
          careerGroups().map(function (g) {
            var held = careerHeld(g), names = g.options.filter(function (o) { return held.indexOf(o.id) >= 0; }).map(function (o) { return o.name; });
            return h(Row, { key: g.career_pick.poolId, k: 'Free career skills', sub: names.length ? names.join(', ') : g.min_picks + ' ' + g.career_pick.noun + ', no rank',
              right: h(Quiet, { commit: names.length < g.min_picks, onClick: function () { setOver({ kind: 'careerPick', group: g, ticks: held.slice() }); } }, names.length >= g.min_picks ? 'Change' : 'Pick ' + (g.min_picks - names.length)) });
          }),
          (spRec.skill_choice_grants || []).map(function (g, i) { return h(Row, { key: 'g' + i, k: 'Free skill ranks', sub: grantWords(g, cb.skillNames) + ', rank 1', right: h(Quiet, { commit: true, onClick: function () { setOver({ kind: 'grant', group: g }); } }, 'Pick ' + g.count) }); }),
          h('div', { className: 'm13-grp' }, 'Abilities'),
          abilityRows(ownAbilities(), spRec),
          oldRec ? h(React.Fragment, null, h('div', { className: 'm13-grp' }, 'Keep from ' + oldRec.name), abilityRows(oldRec, spRec)) : null,
          h('div', { className: 'm13-acts' }, h(Quiet, { onClick: function () { setOver({ kind: 'newAbility' }); } }, 'New ability…'), ownAbilities().special_abilities.length ? h(Quiet, { onClick: function () { setOver({ kind: 'newAbility' }); } }, 'Modify an ability…') : null)) : null),
      h(Section, { id: 'career', title: 'Career' },
        h(Row, { k: carRec ? carRec.name : (eff.career || ''), right: h(Quiet, { onClick: function () { setOver({ kind: 'career' }); } }, 'Change') }), bookNote('career'), offerNotices(['careers']),
        carRec ? h('div', { className: 'm13-acts' }, h(Quiet, { onClick: function () { setOver({ kind: 'modifyForm', section: 'careers', id: carId, title: carRec.name }); } }, 'Modify this career…')) : null),
      h(Section, { id: 'specs', title: 'Specializations' },
        specEntries.map(function (e) {
          var r = specReg[e.id];
          if (!r) return h(React.Fragment, { key: e.id }, h(Row, { k: e.name || cap(idWords(e.id, 'a deleted specialization')) }),
            h(Notice, { kind: 'gone-spec', text: (e.name || idWords(e.id, null) ? (e.name || idWords(e.id, null)) + ' was deleted' : 'A specialization was deleted') + ' from your homebrew. Its talents still work.', acts: [{ t: 'Remove', on: function () { removeSpec(e.id); } }, { t: 'Pick another', on: function () { setPatchAfterRemove(e.id); } }] }));
          return h(Row, { key: e.id, k: r.name, sub: carRec && (carRec.specializations || []).indexOf(e.id) >= 0 ? 'Career specialization' : null, right: h(Quiet, { onClick: function () { removeSpec(e.id); } }, 'Remove') });
        }),
        offerNotices(['specializations']),
        h('div', { className: 'm13-acts' }, h(Quiet, { onClick: function () { setOver({ kind: 'spec' }); } }, 'Add a specialization'), knownEntries.length ? h(Quiet, { onClick: function () { setOver(modifyList('specializations', 'specialization', 'specializations', knownEntries.map(function (e) { return specReg[e.id]; }))); } }, 'Modify a specialization…') : null),
        h('div', { className: 'm13-price m13-priceline' }, tracked ? (inNext + ' XP in career · ' + outNext + ' XP other') : freeWord)),
      h(Section, { id: 'chars', title: 'Characteristics' },
        h('div', { className: 'hp-rail', 'data-cols': desk ? '6' : '3' }, CHARS.map(function (k) {
          var v = chars[k], raised = !same(v, (sheet.characteristics || {})[k]);
          return h('div', { key: k, className: 'hp-char', 'data-raised': raised ? '1' : undefined },
            h('span', { className: 'hp-char-val' }, h('span', { className: 'hp-char-bead' }, String(v))), h('i', { className: 'hp-char-lab' }, cap(k)),
            h('div', { className: 'm13-step m13-charstep' }, h(Quiet, { onClick: function () { stepChar(k, -1); }, attrs: { 'aria-label': 'Lower ' + cap(k) } }, '−'), h(Quiet, { onClick: function () { stepChar(k, 1); }, attrs: { 'aria-label': 'Raise ' + cap(k) } }, '+')));
        })),
        limits.filter(function (l) { return l.part === 'characteristics'; }).map(function (l) {
          return h('div', { key: l.ref, className: 'm13-note', 'data-m13-limit': '1' }, cap(l.ref) + ' ' + chars[l.ref] + ' is past the book’s limit: after creation, only Dedication raises a characteristic (' + citeWords(l.limit.cite) + ').');
        })),
      h(Section, { id: 'skills', title: 'Skills' },
        h('div', { 'data-m13-free': '1', className: 'm13-free' },
          free.reconstructed ? h('p', { className: 'm13-old', 'data-m13-old': '1' }, 'Worked out from this character\u2019s skills; it has no record of its free ranks.') : null,
          free.pools.map(function (x) {
            var asks = x.used < x.of;
            return h(React.Fragment, { key: x.id },
              h(Row, { k: 'Free ranks: ' + x.title, sub: x.used + ' of ' + x.of + (x.keys.length ? ': ' + x.keys.map(skillName).join(', ') : ''), attrs: { 'data-m13-pool': x.title },
                right: h(Quiet, { commit: asks, onClick: function () { setOver({ kind: 'freePool', pool: x.id }); } }, asks ? 'Pick ' + (x.of - x.used) : 'Change') }),
              x.used > x.of ? h('div', { className: 'm13-note', 'data-m13-limit': '1' }, x.title + ' gives ' + x.of + ' free rank' + (x.of === 1 ? '' : 's') + '; this is a ' + ordinal(x.used) + ' (' + x.cite + ').') : null);
          }),
          free.lines.slice().sort(function (a, b) { return (b.off ? 1 : 0) - (a.off ? 1 : 0); }).map(function (l) {   // as drawn: what comes off, then what goes on
            var q = quote.lines.filter(function (x) { return x.part === 'skills' && x.ref === l.key; })[0], cost = q ? q.xp : 0;
            return h(Row, { key: l.key, k: skillName(l.key) + ' ' + l.from + ' \u2192 ' + l.to, attrs: { 'data-m13-line': '1' },
              sub: !l.off ? (l.from > 0 ? 'Free rank put on; its first rank was paid' : 'Free rank put on') : freeOffWords(l),
              right: h('span', { className: 'm13-price' }, tracked ? (cost ? signed(-cost) + ' XP' : '0 XP') : freeWord) });
          })),
        h('div', { className: 'hp-bands m13-bands', 'data-m13-bands': '1' }, skillIds.map(function (sid) {   // D-459: the seven Knowledge skills show at rank 0

          var k = cb.skillSheetKeys[sid] || sid, r = Number((eff.skills || {})[k]) || 0, isCareer = !!(status[k] && status[k].career);
          return h(Row, { key: k, k: cb.skillNames[sid], sub: (isCareer ? 'Career · ' : '') + cap((cb.skillChars || {})[sid]) + (free.marks[k] ? ' · ' + free.marks[k] + ' free' : ''), attrs: { 'data-m13-changed': r !== (Number((sheet.skills || {})[k]) || 0) ? '1' : undefined, 'data-m13-skill': k },
            right: h(Stepper, { value: r, price: nextSkillPrice(k, r), onLower: function () { stepSkill(k, -1); }, onRaise: function () { stepSkill(k, 1); }, lowerLabel: 'Lower', raiseLabel: 'Raise' }) });
        })),
        limits.filter(function (l) { return l.part === 'skills'; }).map(function (l) {
          return h('div', { key: l.ref, className: 'm13-note', 'data-m13-limit': '1' }, skillName(l.ref) + ' ' + (eff.skills || {})[l.ref] + ' is past the book’s limit: ' + (l.limit.kind === 'free_rank_cap' ? 'at creation, a skill stops at rank ' : 'a skill stops at rank ') + l.limit.cap + ' (' + citeWords(l.limit.cite) + ').');
        })),
      h(Section, { id: 'talents', title: 'Talents' },
        knownEntries.map(function (e) { return h(React.Fragment, { key: e.id }, h('div', { className: 'm13-grp' }, specReg[e.id].name), offerNotices(['talents'], function (o) { return talentNoticeTree(o) === e.id; }), h(Tree, { id: e.id, model: talentModel(e), onHeadPick: headPick }), treeItemLines(e)); }),
        offerNotices(['talents'], function (o) { return !loose[o.id] && !talentNoticeTree(o); }),
        h('div', { className: 'm13-acts' }, h(Quiet, { onClick: function () { setOver({ kind: 'talent' }); } }, 'Add a talent from outside your trees…'), h(Quiet, { onClick: function () { setOver({ kind: 'newTalent' }); } }, 'New talent…'), ownedTalentIds().length ? h(Quiet, { onClick: function () { setOver(modifyList('talents', 'talent', 'talents', ownedTalentIds().map(function (t) { return view.talents[t]; }))); } }, 'Modify a talent…') : null),
        Object.keys(loose).length ? h(React.Fragment, null, h('div', { className: 'm13-grp' }, 'Outside your trees'), Object.keys(loose).map(function (tid) {
          var t = (view.talents || {})[tid] || { name: tid }, e = loose[tid];
          return h(React.Fragment, { key: tid }, h(Row, { k: t.name, flag: 'off-book', sub: draw(clean(t.description || s1(t)) + looseChosen(tid, e)), attrs: { 'data-m13-loose': tid },
            right: h('div', { className: 'm13-step' }, h('span', { className: 'm13-price' }, priceWord(Number(e.xp) || 0)), h(Quiet, { onClick: function () { removeLoose(tid); } }, 'Remove')) }),
            offerNotices(['talents'], function (o) { return o.id === tid; }));
        })) : null),
      hasForce ? h(Section, { id: 'force', title: 'Force powers' },
        powerEntries.map(function (e, i) { var r = forceReg[e.id]; return r ? h(React.Fragment, { key: e.id }, h('div', { className: 'm13-grp' }, r.name), h(Tree, { id: 'fp-' + e.id, model: powerModel(e, i) })) : null; }),
        offerNotices(['force_powers']),
        h('div', { className: 'm13-acts' }, h(Quiet, { onClick: function () { setOver({ kind: 'force' }); } }, 'Add a Force power'), powerEntries.some(function (e) { return forceReg[e.id]; }) ? h(Quiet, { onClick: function () { setOver(modifyList('force_powers', 'Force power', 'Force powers', powerEntries.map(function (e) { return forceReg[e.id]; }).filter(Boolean))); } }, 'Modify a Force power…') : null)) : null,
      h(Section, { id: 'sig', title: 'Signature abilities' },
        sigEntries.map(function (e, i) {
          var r = sigReg[e.id]; if (!r) return null;
          return h(React.Fragment, { key: e.id }, h(Row, { k: r.name, right: h(Quiet, { onClick: function () { removeSig(e.id); } }, 'Remove') }), h(Tree, { id: 'sig-' + e.id, model: sigModel(e, i) }));
        }),
        offerNotices(['signature_abilities']),
        !shelf.length && !sigEntries.length ? h('p', { className: 'hp-none' }, 'None for ' + (carRec ? carRec.name : (eff.career || 'this career')) + '.') : null,
        shelf.map(function (row) {
          var b = (row.rec.abilities || {})[row.id + 'basic'] || {};
          return h(Row, { key: row.id, k: row.rec.name, sub: draw(clean(b.description) || s1(Object.assign({}, b, { sources: row.rec.sources, cite: b.cite || row.rec.cite }))) || (row.ok ? null : (row.problems[0] && row.problems[0].words)), attrs: { 'data-m13-sigrow': row.id },
            right: h('div', { className: 'm13-step' }, row.base.cost ? h('span', { className: 'm13-price' }, priceWord(row.base.cost)) : null, row.ok ? h(Quiet, { onClick: function () {
              if (row.legal.length > 1) setOver({ kind: 'sigtree', row: row }); else addSig(row.id, row.tree);   // R-M13B-34 B3
            } }, 'Add') : null) });
        }),
        sigEntries.some(function (e) { return sigReg[e.id]; }) ? h('div', { className: 'm13-acts' }, h(Quiet, { onClick: function () { setOver(modifyList('signature_abilities', 'signature ability', 'signature abilities', sigEntries.map(function (e) { return sigReg[e.id]; }).filter(Boolean))); } }, 'Modify a signature ability…')) : null),
      h(Section, { id: 'motiv', title: 'Motivations' },
        hasPick ? h(Row, { k: 'Motivation', sub: pickText, attrs: { 'data-m13-pick': '1' }, right: h(Quiet, { onClick: function () { setOver({ kind: 'motivation' }); } }, 'Change') }) : null,
        FOUR.map(function (k) {
          if (field && field.key === k && mv[k]) return wordField(k);
          return mv[k] ? h(Row, { key: k, k: cap(k), sub: mv[k], right: h(Quiet, { onClick: function () { setField({ key: k, value: mv[k] }); setAdding(false); } }, 'Change') }) : null;
        }),
        field && !mv[field.key] ? wordField(field.key) : null,
        adding ? h('div', { className: 'm13-acts', 'data-m13-offers': '1' }, offersAdd.map(function (k) { return h(Quiet, { key: k, onClick: function () { offerTap(k); } }, cap(k)); })) : null,
        offersAdd.length && !adding && !(field && !mv[field.key]) ? h('div', { className: 'm13-acts' }, h(Quiet, { onClick: function () {   // R-M13B-27 (1), (2)
          if (offersAdd.length === 1) offerTap(offersAdd[0]); else setAdding(true);
        } }, 'Add a motivation')) : null),
      h(Section, { id: 'xptot', title: 'XP' },
        h(Row, { k: 'Total', right: h('span', { className: 'm13-v' }, String((Number(xp.total) || 0) + quote.total)) }),
        h(Row, { k: 'Spent', right: h('span', { className: 'm13-v' }, String((Number(xp.spent) || 0) + quote.xp)) }),
        h(Row, { k: 'Available', right: h('span', { className: 'm13-v' }, String((Number(xp.remaining) || 0) + net)) }),
        h(Row, { k: 'This change', sub: tracked ? null : 'Not tracked', right: h('span', { className: 'm13-v' }, tracked ? signed(net) : freeWord) })),
      h(Section, { id: 'log', title: 'Changes' },
        can.ok ? h('div', { className: 'm13-saved', 'data-m13-saved': '1' }, h('b', null, 'Saved'), h(Quiet, { onClick: undoNow }, 'Undo')) : null,
        can.reason ? h(Notice, { kind: 'undo-refused', text: can.reason, style: { marginTop: 8 } }) : null,
        !log.length ? h('p', { className: 'hp-none' }, 'No changes yet.') : h('ul', { className: 'm13-log' }, log.map(function (e) {
          return h('li', { key: e.id }, h('div', { className: 'm13-lh' }, h('span', null, dayOf(e.at, true)), h('span', null, e.tracked === false ? freeWord : signed(e.net != null ? e.net : -e.xp) + ' XP')),
            h('ul', null, logItems(e, view, spRec, p.groupSlug).map(function (it, i) { return h('li', { key: i }, it.t, it.offBook ? h('span', { className: 'm13-flag' }, 'off-book') : null, it.pastLimit ? h('span', { className: 'm13-flag' }, 'past the book’s limit') : null); })),
            e.note ? h('q', null, e.note) : null);
        }))));
    function setPatchAfterRemove(sid) { removeSpec(sid); setOver({ kind: 'spec' }); }

    return h('div', { ref: root, className: desk ? 'm13-desk' : 'm13-phone', 'data-m13-page': '1', 'data-doc-ground': 'creator', 'data-screen': 'modify' },
      h('div', { className: 'm13-wrap' }, main,
        desk ? h('aside', { className: 'm13-rail' }, h('div', { className: 'hp-plate', 'data-pad': 'read' }, xpBox, h('div', { className: 'hp-railact' }, act))) : null),
      desk ? null : h('div', { className: 'hp-phoneact m13-bar' }, act),
      overlay);
  }

  // ── the pack's entries (R-M13B-24): built here, dark until Lap C. The Homebrew item form, aimed at the character. ───
  // p = { sheet, onApply(result), item: { section, id } | null }. New item… adds a record to the layer; Modify item… a whole copy under the same id. Off the XP ledger.
  // R-M13B-41: a new item lands in the pack, in the shape the store writes: a suit into an empty armour slot, worn; any other suit as a gear line.
  function withPackRow(equipment, row) {
    var eq = Object.assign({ weapons: [], armor: null, gear: [] }, equipment || {});
    if (row.section === 'weapons') eq.weapons = (eq.weapons || []).concat([{ id: row.id }]);
    else if (row.section === 'armor' && !eq.armor) eq.armor = { id: row.id, state: 'worn' };
    else eq.gear = (eq.gear || []).concat([{ id: row.id, qty: 1 }]);
    return eq;
  }
  // R-M13B-41: Undo takes a new item's record away, so no pack row is left pointing at it. A copy under a book's id keeps its row: the book's record resolves it.
  function withoutGoneRows(sheet, res) {
    if (!Object.prototype.hasOwnProperty.call(res.patch, 'own') || !sheet.equipment) return res;
    var was = (sheet.own && sheet.own.sections) || {}, now = (res.patch.own && res.patch.own.sections) || {}, gone = {};
    ['weapons', 'armor', 'gear'].forEach(function (sec) { Object.keys(was[sec] || {}).forEach(function (rid) { if (was[sec][rid]._mode === 'add' && !(now[sec] && now[sec][rid])) gone[rid] = true; }); });
    if (!Object.keys(gone).length) return res;
    var eq = res.patch.equipment || sheet.equipment, keep = function (r) { return !(r && gone[r.id]); };
    var next = Object.assign({}, eq, { weapons: (eq.weapons || []).filter(keep), gear: (eq.gear || []).filter(keep), armor: eq.armor && gone[eq.armor.id] ? null : eq.armor });
    return Object.assign({}, res, { patch: Object.assign({}, res.patch, { equipment: next }) });
  }
  // F-100 M13 R-M13B-108: the entries themselves paint with the pack, in the sheet; this is the form a press opens.
  // p = { sheet, open: { section, id?, mode }, onClose(), onApply(result) }
  function PackEntries(p) {
    var sheet = p.sheet, M = MOD(), open = p.open;
    // A record this character made itself has no book entry for the form's route to find, so its form opens on the blank route with the record in hand, and a save changes it.
    var mine = open.mode === 'copy' && (((sheet.own || {}).sections || {})[open.section] || {})[open.id];
    var ownMade = !!mine && mine._mode !== 'redefine';
    useEffect(function () { M.ready(); }, []);   // a Save carrying `own` needs the validator's rail
    function commit(nextOwn, row) {
      var res = M.save(sheet, { own: nextOwn }, { tracked: false }, env());
      if (!res.ok) return res;   // the form says why, in its own reasons
      p.onApply(row ? Object.assign({}, res, { patch: Object.assign({}, res.patch, { equipment: withPackRow(sheet.equipment, row) }) }) : res); p.onClose();
    }
    function saved(rec, how) {   // R-M13B-36: the radio maps to addOwn / ownCopy
      if (open.mode === 'new' || (!ownMade && how && how.intent === 'new')) { var a = M.addOwn(sheet.own, open.section, rec, env()); return commit(a.own, { section: open.section, id: a.id }); }
      return commit(M.withRecord(sheet.own, open.section, open.id, Object.assign(copyOf(sheet, open.section, open.id) || {}, rec, { id: open.id })));
    }
    return h('div', { className: window.innerWidth >= 1024 ? 'm13-desk' : 'm13-phone' }, h(FormHost, { title: open.mode === 'new' ? 'New item' : 'Modify item',
      path: '/player/homebrew/' + open.section + '/' + (open.mode === 'new' || ownMade ? 'new' : encodeURIComponent(open.id)),
      rec: open.mode === 'copy' ? copyOf(sheet, open.section, open.id) : null, onBack: p.onClose, onSave: saved, intent: open.mode === 'copy' && !ownMade ? 'change' : undefined }));   // R-M13B-49, -128
  }

  window.SWRPGModifyView = { idWords: idWords, Page: Page, PackEntries: PackEntries, sectionIds: SECTIONS };
})();
