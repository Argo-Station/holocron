#!/usr/bin/env node
/**
 * disclosure_section.cjs — R-SL3-2's contract: the `rSec`/`lSec` promotion changed NOTHING.
 *
 * `Docs/rulings/sheet-lab-three-questions.md` R-SL3-2 cut the card: lift ONE implementation of
 * Jason's 2026-07-20 expandable-section idiom to `lib/shared/ui.jsx`, both call sites consume it,
 * ZERO BEHAVIOUR CHANGE, guard-verified — "the disclosure ruling's own contract is the claim."
 *
 * "Zero behaviour change" is not a thing a diff can show. Two implementations that LOOK equivalent
 * can differ by a style key, an aria value, a testid derivation, or a flex number, and every one of
 * those is visible to a user or to a suite. So this guard does not read the diff: it holds BOTH
 * PRE-PROMOTION IMPLEMENTATIONS VERBATIM (copied from player/app.jsx at 72e5d183, before the lift)
 * and renders them against the promoted component with identical props, comparing the resulting
 * React element trees node for node.
 *
 * WHAT "IDENTICAL" MEANS HERE, precisely:
 *   - same element type, same key, same children shape, at every depth;
 *   - same prop keys IN THE SAME ORDER, with the same values;
 *   - same STYLE keys IN THE SAME ORDER. Order is checked because it is cheap to check and because
 *     the promotion had to thread the three call-site differences through the POSITIONS they
 *     already occupied rather than appending them. If a later edit appends instead, this goes red
 *     and someone gets to decide whether that is fine — rather than it passing unexamined.
 *   - handlers compare by ARITY and by EFFECT, not identity: each onToggle is invoked against a
 *     recording stub and the resulting setState call is compared.
 *
 * THE THREE DIFFERENCES BETWEEN THE TWO CALL SITES are preserved, not normalised: minHeight 50 vs
 * 46, `touchAction: 'manipulation'` on ADVANCEMENT's button only, and a flex-column body (cockpit)
 * vs a self-scrolling one (ADVANCEMENT). This guard pins all three, so a future "tidy-up" that
 * harmonises them has to come here and say so. Whether they SHOULD be harmonised is a ruling
 * question, raised in gate `rsec-promotion`; it is deliberately not answered by this lap.
 *
 * THE BITE (PRAXIS §6 — a guard that has never been red is not evidence): leg 4 mutates the shared
 * source four ways (drop the minHeight option, drop the buttonStyle merge, drop the bodyStyle
 * merge, reorder the body style keys) and requires each mutant to be CAUGHT. Read the exit code,
 * not the output — a mutant that throws must not be mistaken for one that was detected, so each
 * mutant's failure mode is classified.
 *
 * Run: node test/disclosure_section.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const React = require('react');

const ROOT = path.resolve(__dirname, '..');
const UI_SRC = fs.readFileSync(path.join(ROOT, 'lib/shared/ui.jsx'), 'utf8');

let failures = 0;
function check(label, cond, detail) {
  if (cond) console.log('  PASS  ' + label);
  else { failures += 1; console.error('  FAIL  ' + label + (detail !== undefined ? '  — ' + String(detail).slice(0, 500) : '')); }
}

// ── load the shared module the way the browser does: React on the global, IIFE extends SWRPGUI ──
function loadUI(mutate) {
  const src = mutate ? mutate(UI_SRC) : UI_SRC;
  const win = {};
  const ctx = {
    React, window: win, document: { documentElement: { style: {} }, addEventListener() {}, removeEventListener() {} },
    navigator: { userAgent: 'node' }, console: { log() {}, warn() {}, error() {} },
    setTimeout, clearTimeout, setInterval, clearInterval,
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  };
  ctx.self = win; ctx.globalThis = ctx; win.matchMedia = ctx.matchMedia;
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return win.SWRPGUI;
}

const UI = loadUI(null);

// ── THE FROZEN REFERENCES — player/app.jsx at 72e5d183, verbatim, before the lift ─────────────
// Only the free variables are parameterised (they were closure state in the components). Not one
// style key, aria value or number is retyped from memory: these are the shipped bodies.
const h = React.createElement;
function hexA(hex, a) { var n = Math.round(a * 255).toString(16); return hex + (n.length < 2 ? '0' + n : n); }

function makeRSec(env) {
  const { PANEL, accent, anyExp, expandedRight, setExpandedRight } = env;
  return function rSec(key, label, count, body, grow) {
    var isExp = expandedRight === key;
    return h('div', { key: key, style: Object.assign({}, PANEL, {
      flexGrow: anyExp ? (isExp ? 1 : 0) : grow, flexShrink: 1, flexBasis: 0, minHeight: 50,
      overflow: 'hidden', transition: 'flex-grow .35s cubic-bezier(.4,0,.2,1)' }) },
      h('button', { type: 'button', 'aria-expanded': isExp, 'aria-label': (isExp ? 'Restore ' : 'Expand ') + label + ' section',
        'data-testid': 'section-toggle-' + String(label).toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        onClick: function () { setExpandedRight(isExp ? null : key); },
        style: { display: 'flex', alignItems: 'center', gap: 10, width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 6, flex: '0 0 auto' } },
        h('span', { style: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--fs-sm)', letterSpacing: '0.15em', color: accent } }, label),
        count != null ? h('span', { style: { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)', letterSpacing: '0.1em', color: hexA(accent, 0.6) } }, String(count)) : null,
        h('span', { 'aria-hidden': true, style: { marginLeft: 'auto', color: hexA(accent, 0.75), fontSize: 'var(--fs-sm)', lineHeight: 1 } }, isExp ? '⤡' : '⤢')),
      h('div', { 'aria-hidden': true, style: { height: 1, background: 'linear-gradient(90deg,' + hexA(accent, 0.3) + ',transparent)', marginBottom: 10, flex: '0 0 auto' } }),
      h('div', { style: { flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', opacity: (anyExp && !isExp) ? 0 : 1, transition: 'opacity .25s ease' } }, body));
  };
}

function makeLSec(env) {
  const { SHEET_PANEL, accent, expandedLeft, setExpandedLeft } = env;
  return function lSec(key, label, count, body, grow) {
    var isExp = expandedLeft === key;
    return h('div', { key: key, style: Object.assign({}, SHEET_PANEL, {
        flexGrow: (expandedLeft != null) ? (isExp ? 1 : 0) : grow, flexShrink: 1, flexBasis: 0, minHeight: 46,
        overflow: 'hidden', transition: 'flex-grow .35s cubic-bezier(.4,0,.2,1)' }) },
      h('button', { type: 'button', 'aria-expanded': isExp, 'aria-label': (isExp ? 'Restore ' : 'Expand ') + label + ' section',
        'data-testid': 'section-toggle-' + String(label).toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        onClick: function() { setExpandedLeft(isExp ? null : key); },
        style: { display: 'flex', alignItems: 'center', gap: 10, width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 6, flex: '0 0 auto', touchAction: 'manipulation' } },
        h('span', { style: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--fs-sm)', letterSpacing: '0.15em', color: accent } }, label),
        count != null ? h('span', { style: { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)', letterSpacing: '0.1em', color: hexA(accent, 0.6) } }, String(count)) : null,
        h('span', { 'aria-hidden': true, style: { marginLeft: 'auto', color: hexA(accent, 0.75), fontSize: 'var(--fs-sm)', lineHeight: 1 } }, isExp ? '⤡' : '⤢')),
      h('div', { 'aria-hidden': true, style: { height: 1, background: 'linear-gradient(90deg,' + hexA(accent, 0.3) + ',transparent)', marginBottom: 10, flex: '0 0 auto' } }),
      h('div', { style: { flex: '1 1 auto', minHeight: 0, overflowY: 'auto', opacity: (expandedLeft != null && !isExp) ? 0 : 1, transition: 'opacity .25s ease' } }, body));
  };
}

// ── THE CALL SITES AS PROMOTED — exactly what player/app.jsx now does ─────────────────────────
function promotedRSec(DS, env) {
  const { accent, anyExp, expandedRight, setExpandedRight } = env;
  return function (key, label, count, body, grow) {
    var isExp = expandedRight === key;
    return DS({ sectionKey: key, label: label, count: count, body: body, grow: grow, accent: accent,
      expanded: isExp, anyExpanded: anyExp,
      onToggle: function () { setExpandedRight(isExp ? null : key); },
      minHeight: 50, buttonStyle: { touchAction: 'manipulation' },
      bodyStyle: { display: 'flex', flexDirection: 'column' } });
  };
}
function promotedLSec(DS, env) {
  const { accent, expandedLeft, setExpandedLeft } = env;
  return function (key, label, count, body, grow) {
    var isExp = expandedLeft === key;
    return DS({ sectionKey: key, label: label, count: count, body: body, grow: grow, accent: accent,
      expanded: isExp, anyExpanded: expandedLeft != null,
      onToggle: function() { setExpandedLeft(isExp ? null : key); },
      minHeight: 46, buttonStyle: { touchAction: 'manipulation' }, bodyStyle: { overflowY: 'auto' } });
  };
}

// ── structural comparison, ORDER-SENSITIVE on prop and style keys ─────────────────────────────
function diff(a, b, at) {
  at = at || '$';
  if (a === b) return null;
  if (React.isValidElement(a) !== React.isValidElement(b)) return at + ': one is an element, one is not';
  if (React.isValidElement(a)) {
    if (a.type !== b.type) return at + '.type: ' + String(a.type) + ' vs ' + String(b.type);
    if (a.key !== b.key) return at + '.key: ' + a.key + ' vs ' + b.key;
    return diff(a.props, b.props, at + '(' + String(a.type) + ').props');
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return at + ': array vs non-array';
    if (a.length !== b.length) return at + '.length: ' + a.length + ' vs ' + b.length;
    for (let i = 0; i < a.length; i++) { const d = diff(a[i], b[i], at + '[' + i + ']'); if (d) return d; }
    return null;
  }
  if (typeof a === 'function' || typeof b === 'function') {
    if (typeof a !== typeof b) return at + ': function vs ' + typeof b;
    if (a.length !== b.length) return at + '.arity: ' + a.length + ' vs ' + b.length;
    return null;   // effect is compared separately, by invocation
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return at + ' keys: [' + ka + '] vs [' + kb + ']';
    for (let i = 0; i < ka.length; i++) {
      if (ka[i] !== kb[i]) return at + ' key order at ' + i + ': ' + ka[i] + ' vs ' + kb[i];
      const d = diff(a[ka[i]], b[ka[i]], at + '.' + ka[i]); if (d) return d;
    }
    return null;
  }
  return at + ': ' + JSON.stringify(a) + ' vs ' + JSON.stringify(b);
}

// R-RPG-2's single ruled delta, applied to the frozen cockpit reference so the equality claim can
// stay TOTAL. Everything else must still match key-for-key; only this one key is licensed to move,
// and it is licensed by a ruling that is cited on the line.
function withRuledTouchAction(el) {
  const kids = el.props.children.slice();
  const i = kids.findIndex((x) => x && x.type === 'button');
  const btn = kids[i];
  kids[i] = React.cloneElement(btn, {
    style: Object.assign({}, btn.props.style, { touchAction: 'manipulation' }),
  });
  return React.cloneElement(el, {}, ...kids);
}

// ── the matrix: every shape-changing state the idiom has ──────────────────────────────────────
const CASES = [
  { name: 'collapsed, none expanded, count present', key: 'weapons', label: 'WEAPONS', count: 3, grow: 1.7, expanded: null },
  { name: 'this one expanded',                        key: 'weapons', label: 'WEAPONS', count: 3, grow: 1.7, expanded: 'weapons' },
  { name: 'a SIBLING expanded (this collapses)',      key: 'weapons', label: 'WEAPONS', count: 3, grow: 1.7, expanded: 'force' },
  { name: 'count null (no count span)',               key: 'force',   label: 'FORCE POWERS', count: null, grow: 1, expanded: null },
  { name: 'count 0 — must still render (0 != null)',  key: 'force',   label: 'FORCE POWERS', count: 0, grow: 1, expanded: null },
  { name: 'multi-word label -> hyphenated testid',    key: 'ab',      label: 'ABILITIES & TALENTS', count: 42, grow: 1, expanded: null },
  { name: 'string count (CAREER -5)',                 key: 'skills',  label: 'SKILLS', count: 'CAREER −5', grow: 1.7, expanded: null },
];

function runPair(DS, which) {
  const out = [];
  for (const c of CASES) {
    const calls = [];
    const setter = (v) => calls.push(v);
    const env = which === 'r'
      ? { PANEL: UI.SHEET_PANEL, accent: '#7fd4ff', anyExp: c.expanded != null, expandedRight: c.expanded, setExpandedRight: setter }
      : { SHEET_PANEL: UI.SHEET_PANEL, accent: '#7fd4ff', expandedLeft: c.expanded, setExpandedLeft: setter };
    const ref = (which === 'r' ? makeRSec(env) : makeLSec(env))(c.key, c.label, c.count, 'BODY', c.grow);
    const got = (which === 'r' ? promotedRSec(DS, env) : promotedLSec(DS, env))(c.key, c.label, c.count, 'BODY', c.grow);
    out.push({ c, ref, got, calls });
  }
  return out;
}

console.log('DISCLOSURE SECTION — R-SL3-2 zero-behaviour-change contract');
console.log('');

// ── leg 1: the component exists and is exported ───────────────────────────────────────────────
check('DisclosureSection is exported from lib/shared/ui.jsx', typeof UI.DisclosureSection === 'function', typeof UI.DisclosureSection);
const APP = fs.readFileSync(path.join(ROOT, 'player/app.jsx'), 'utf8');
check('NO local copy of the idiom survives in player/app.jsx (this is the point of the card)',
  (APP.match(/transition: 'flex-grow \.35s cubic-bezier\(\.4,0,\.2,1\)'/g) || []).length === 0,
  (APP.match(/transition: 'flex-grow \.35s cubic-bezier\(\.4,0,\.2,1\)'/g) || []).length + ' local copies remain');

// RE-POINTED (N-post, lap paper-sheet-delete step 4, 2026-09-30). Both call sites this guard read — the
// OVERVIEW cockpit's `rSec` and the old ADVANCEMENT tab's `lSec` — were deleted with the old sheet face, and
// player/app.jsx's `DisclosureSection` binding went with them (census T2). The claim before: the promotion
// is render-identical at both SHIPPED call sites, the app destructures the component, and the shipped
// options match the transcription. After: the shared component still reproduces both pre-promotion idioms
// (legs 2–4 below, unchanged), and no local copy of the idiom returns to player/app.jsx. KEPT: leg 1's export
// and no-local-copy asserts, legs 2, 3 and 4 (the bite) word for word. DROPPED: the destructure assert and the
// eight shipped-call-site transcription asserts — their subject is deleted. The component now has NO
// consumer in lib/ gm/ player/ dice/ (found here; carried to the gate).

// ── legs 2 + 3: render equality, both call sites, every state ─────────────────────────────────
for (const [which, site] of [['r', 'OVERVIEW cockpit (rSec)'], ['l', 'ADVANCEMENT (lSec)']]) {
  console.log('');
  console.log('  ' + site + ' — promoted output vs the pre-promotion implementation:');
  for (const { c, ref, got } of runPair(UI.DisclosureSection, which)) {
    // R-RPG-2: the cockpit's button legitimately differs from its pre-promotion self by exactly
    // ONE key, by ruling. Rather than weaken `diff`, the reference is given that one key here — so
    // the comparison stays total and the exception is a named line rather than a hole.
    const reference = (which === 'r') ? withRuledTouchAction(ref) : ref;
    const d = diff(reference, got);
    check('    ' + c.name, d === null, d);
  }
}

// ── the handler's EFFECT, not its identity ────────────────────────────────────────────────────
console.log('');
console.log('  the toggle handler does the same thing:');
{
  // explicit: expanding a collapsed section sets the key; collapsing sets null — both sites.
  for (const which of ['r', 'l']) {
    const collapsed = runPair(UI.DisclosureSection, which)[0];
    const expanded = runPair(UI.DisclosureSection, which)[1];
    collapsed.calls.length = 0; expanded.calls.length = 0;
    const btn = (el) => el.props.children.find((x) => x && x.type === 'button');
    btn(collapsed.ref).props.onClick(); btn(collapsed.got).props.onClick();
    check('    ' + (which === 'r' ? 'cockpit' : 'advancement') + ': collapsed -> click sets the key, identically',
      collapsed.calls.length === 2 && collapsed.calls[0] === collapsed.calls[1] && collapsed.calls[0] === collapsed.c.key,
      JSON.stringify(collapsed.calls));
    btn(expanded.ref).props.onClick(); btn(expanded.got).props.onClick();
    check('    ' + (which === 'r' ? 'cockpit' : 'advancement') + ': expanded -> click sets null, identically',
      expanded.calls.length === 2 && expanded.calls[0] === null && expanded.calls[1] === null,
      JSON.stringify(expanded.calls));
  }
}

// ── the three preserved differences, pinned ───────────────────────────────────────────────────
console.log('');
console.log('  the three call-site differences are PRESERVED, not normalised:');
{
  const r = runPair(UI.DisclosureSection, 'r')[0].got;
  const l = runPair(UI.DisclosureSection, 'l')[0].got;
  const btn = (el) => el.props.children.find((x) => x && x.type === 'button');
  const bodyOf = (el) => el.props.children[el.props.children.length - 1];
  check('    minHeight 50 (cockpit) vs 46 (advancement)', r.props.style.minHeight === 50 && l.props.style.minHeight === 46,
    r.props.style.minHeight + ' / ' + l.props.style.minHeight);
  check('    touchAction now on BOTH (R-RPG-2 harmonised the cockpit)',
    btn(r).props.style.touchAction === 'manipulation' && btn(l).props.style.touchAction === 'manipulation',
    btn(r).props.style.touchAction + ' / ' + btn(l).props.style.touchAction);
  check('    body: cockpit is a flex column; advancement scrolls itself',
    bodyOf(r).props.style.flexDirection === 'column' && bodyOf(r).props.style.overflowY === undefined &&
    bodyOf(l).props.style.overflowY === 'auto' && bodyOf(l).props.style.flexDirection === undefined);
}

// ── leg 4: THE BITE ───────────────────────────────────────────────────────────────────────────
console.log('');
console.log('  THE BITE — mutants of the shared component must be CAUGHT:');
const MUTANTS = [
  ['minHeight option dropped', (s) => s.replace('minHeight: opts.minHeight,', 'minHeight: 50,')],
  ['buttonStyle merge dropped', (s) => s.replace(
    "flex: '0 0 auto' }, opts.buttonStyle) },", "flex: '0 0 auto' }) },")],
  ['bodyStyle merge dropped', (s) => s.replace(
    "h('div', { style: Object.assign({ flex: '1 1 auto', minHeight: 0 }, opts.bodyStyle, {",
    "h('div', { style: Object.assign({ flex: '1 1 auto', minHeight: 0 }, {")],
  ['body style keys REORDERED (variant appended, not threaded)', (s) => s.replace(
    "h('div', { style: Object.assign({ flex: '1 1 auto', minHeight: 0 }, opts.bodyStyle, {\n          opacity: (anyExpanded && !isExp) ? 0 : 1, transition: 'opacity .25s ease' }) }, opts.body));",
    "h('div', { style: Object.assign({ flex: '1 1 auto', minHeight: 0,\n          opacity: (anyExpanded && !isExp) ? 0 : 1, transition: 'opacity .25s ease' }, opts.bodyStyle) }, opts.body));")],
];
for (const [label, mutate] of MUTANTS) {
  if (mutate(UI_SRC) === UI_SRC) { failures += 1; console.error('  FAIL  mutant anchor not found: ' + label); continue; }
  let caught = false, threw = null;
  try {
    const M = loadUI(mutate);
    if (typeof M.DisclosureSection !== 'function') throw new Error('mutant did not export the component');
    caught = ['r', 'l'].some((w) => runPair(M.DisclosureSection, w).some(({ ref, got }) => diff(ref, got) !== null));
  } catch (e) { threw = e.message; }
  // Read the FAILURE MODE, not just "did something go wrong": a mutant that CRASHES proves nothing
  // about the comparison, and would otherwise look exactly like one the guard detected.
  check('    ' + label + ' is caught by comparison (not by a crash)', caught && !threw, threw ? 'THREW: ' + threw : 'not detected');
}

console.log('');
console.log(failures ? 'FAILED (' + failures + ')' : 'OK — the shared component reproduces both pre-promotion idioms, and the guard bites.');
process.exit(failures ? 1 : 0);
