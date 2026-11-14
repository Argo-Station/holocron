/* lib/shared/corpusUI.js — the CORPUS & INSTRUMENT primitives (Docs/DESIGN_IDENTITY.md), the shared
 * building blocks both the Ship Yard (Y1) and the item-store refit (R-DI2) render. ONE definition each
 * (§8 one-core law). Pairs with lib/shared/corpus.css (the visual language); these are thin structural
 * wrappers over those classes. Flat, hairline, one accent, document furniture — never glow.
 *
 * Plain JS (diceEngine/shipSchematic pattern): React.createElement captured lazily so nothing runs at
 * load. Classic script → window.SWRPGCorpus. The consuming surface wraps content in a `ci` root and sets
 * --ci-accent (the Yard passes YARD_ACCENT).
 */
(function (global) {
  'use strict';
  function h() { return (typeof React !== 'undefined') ? React.createElement.apply(null, arguments) : null; }

  // running head + folio ("SHIP YARD · STARFIGHTERS" … "ENTRY 214 / 415")
  function RunningHead(p) {
    p = p || {};
    return h('div', { className: 'ci-runhead' },
      h('span', null, p.left || ''),
      p.right != null ? h('span', { className: 'ci-folio' }, p.right) : null);
  }

  function Rule(p) { p = p || {}; return h('hr', { className: 'ci-rule' + (p.heavy ? ' ci-heavy' : '') }); }

  // designation block: maker/model (mono small) · NAME (the type spend) · class line (plain full words)
  function Designation(p) {
    p = p || {};
    return h('div', null,
      p.maker ? h('div', { className: 'ci-maker' }, p.maker) : null,
      h('h1', { className: 'ci-designation' }, p.name || ''),
      (p.classLine || p.restricted) ? h('div', { className: 'ci-classline' },
        p.classLine || '',
        p.restricted ? h('span', { className: 'ci-r' }, 'R · RESTRICTED') : null) : null);
  }

  // a plate: hairline frame + registration ticks + plate label + terse caption. Flat ground; NO glow.
  function Plate(p) {
    p = p || {};
    var frameStyle = {};
    if (p.height) frameStyle.height = p.height;
    if (p.pad) frameStyle.padding = p.pad;
    return h('figure', { className: 'ci-plate' },
      h('div', { className: 'ci-plate-frame', style: frameStyle },
        h('span', { className: 'ci-tick tl' }), h('span', { className: 'ci-tick tr' }),
        h('span', { className: 'ci-tick bl' }), h('span', { className: 'ci-tick br' }),
        p.label ? h('div', { className: 'ci-plate-label' }, p.label) : null,
        p.children),
      p.caption ? h('figcaption', null, p.caption) : null);
  }

  function SectionRule(p) { p = p || {}; return h('div', { className: 'ci-sechead' }, h('h2', null, p.label || '')); }

  // ruled ledger. rows = [{k, v}] — k a full-word label, v a string OR a React node (the find-chip rides
  // the Price/Rarity value). Null/empty values are dropped (the entry shows only the fields it has).
  function Ledger(p) {
    p = p || {};
    var rows = (Array.isArray(p.rows) ? p.rows : []).filter(function (r) {
      return r && r.v != null && r.v !== '';
    });
    return h('table', { className: 'ci-ledger' },
      h('tbody', null, rows.map(function (r, i) {
        return h('tr', { key: i },
          h('td', { className: 'ci-lkey' }, r.k),
          h('td', { className: 'ci-lval' }, r.v));
      })));
  }

  function Furniture(p) { p = p || {}; return h('div', { className: 'ci-furn' }, p.children); }

  global.SWRPGCorpus = {
    RunningHead: RunningHead, Rule: Rule, Designation: Designation, Plate: Plate,
    SectionRule: SectionRule, Ledger: Ledger, Furniture: Furniture,
  };
})(typeof window !== 'undefined' ? window : this);
