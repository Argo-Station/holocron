#!/usr/bin/env node
/**
 * scroll_cue.cjs — THE SCROLL CUE HAS ONE DRIVER (ruling `paper-n3-bench` R-PN3-4, B-908).
 *
 * lib/shared/scrollCue.js keeps `data-more` (more below) and `data-more-above` (more above) on every registered
 * or watched element, at the creator's 8px threshold. This guard loads it raw into a vm with a fake DOM and
 * pins: the threshold and both attributes at every edge; register() re-reads its selector on update(); watch()
 * observes the element AND its children (a ResizeObserver: content that grows without a scroll), observes a
 * child added later (a MutationObserver), and unwatch() lets go; the scroll listener is CAPTURE. It also pins
 * that both shells load the module before their app, that the creator's fcUpdateScrollCues is a call into it
 * with its own selector list (no second driver), and that the bench's zones watch through it.
 */
const fs = require('fs'); const path = require('path'); const vm = require('vm'); const assert = require('assert');
const ROOT = path.join(__dirname, '..');
const rd = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
let n = 0; const ok = (l, c, d) => { n++; assert(c, l + (d ? ' — ' + JSON.stringify(d) : '')); console.log('  ok', l); };

function el(sh, ch, st) {
  const a = {};
  return { nodeType: 1, scrollHeight: sh, clientHeight: ch, scrollTop: st || 0, children: [],
    getAttribute: k => (k in a ? a[k] : null), setAttribute: (k, v) => { a[k] = String(v); },
    hasAttribute: k => k in a, removeAttribute: k => { delete a[k]; }, _a: a };
}
const listeners = []; const ros = []; const mos = [];
let matched = [];
const sandbox = {
  document: { addEventListener: (t, f, c) => listeners.push({ on: 'document', t, c }), querySelectorAll: () => matched },
  ResizeObserver: function (cb) { this.cb = cb; this.seen = []; this.observe = e => this.seen.push(e); this.disconnect = () => { this.off = true; }; ros.push(this); },
  MutationObserver: function (cb) { this.cb = cb; this.observe = (e, o) => { this.on = e; this.opts = o; }; this.disconnect = () => { this.off = true; }; mos.push(this); },
};
sandbox.window = sandbox; sandbox.window.addEventListener = (t, f) => listeners.push({ on: 'window', t });
vm.createContext(sandbox);
vm.runInContext(rd('lib/shared/scrollCue.js'), sandbox);
const C = sandbox.SWRPGScrollCue;

ok('the module exposes register · watch · update · mark', C && ['register', 'watch', 'update', 'mark'].every(k => typeof C[k] === 'function'));
ok('its threshold is the creator\'s 8px', C.THRESHOLD === 8);
ok('it listens to scroll in CAPTURE (a pane\'s own scroll reaches it) and to resize',
  listeners.some(l => l.on === 'document' && l.t === 'scroll' && l.c === true) && listeners.some(l => l.on === 'window' && l.t === 'resize'));

const f = (sh, ch, st) => { const e = el(sh, ch, st); C.mark(e); return [e.getAttribute('data-more'), e.getAttribute('data-more-above')]; };
ok('a zone that fits carries neither', JSON.stringify(f(500, 500, 0)) === '[null,null]');
ok('8px hidden below is not "more" (the threshold is strict)', JSON.stringify(f(508, 500, 0)) === '[null,null]');
ok('9px hidden below is more below, none above', JSON.stringify(f(509, 500, 0)) === '["1",null]');
ok('at its end: more above, none below', JSON.stringify(f(1000, 500, 500)) === '[null,"1"]');
ok('in the middle: both', JSON.stringify(f(1000, 500, 250)) === '["1","1"]');
ok('9px from the top is more above; 8px is not', JSON.stringify(f(1000, 500, 9)) === '["1","1"]' && JSON.stringify(f(1000, 500, 8)) === '["1",null]');
const e1 = el(1000, 500, 0); C.mark(e1); e1.scrollTop = 500; C.mark(e1);
ok('a flag is REMOVED when its side runs out (never left at "0")', !e1.hasAttribute('data-more') && e1.getAttribute('data-more-above') === '1');

const p1 = el(900, 300, 0); matched = [p1];
C.register('.hpw-shell .hp-pane');
ok('register() marks what its selector matches', p1.getAttribute('data-more') === '1');
p1.scrollTop = 600; C.update();
ok('update() re-reads the registered selector', !p1.hasAttribute('data-more') && p1.getAttribute('data-more-above') === '1');

const z = el(500, 500, 0); const kid = el(400, 400, 0); z.children = [kid];
const unwatch = C.watch(z);
const ro = ros[ros.length - 1], mo = mos[mos.length - 1];
ok('watch() observes the zone and each child with a ResizeObserver', ro.seen.includes(z) && ro.seen.includes(kid));
ok('watch() observes the zone\'s child list (not its subtree)', mo.on === z && mo.opts.childList === true && !mo.opts.subtree);
ok('a fitting zone starts with neither flag', !z.hasAttribute('data-more') && !z.hasAttribute('data-more-above'));
z.scrollHeight = 900; ro.cb([]);
ok('content grows WITHOUT a scroll: the ResizeObserver\'s call marks more below', z.getAttribute('data-more') === '1');
const late = el(10, 10, 0); mo.cb([{ addedNodes: [late] }]);
ok('a child added later is observed too', ro.seen.includes(late));
unwatch(); z.scrollHeight = 500; C.update();
ok('unwatch() disconnects both observers and drops the zone from update()', ro.off && mo.off && z.getAttribute('data-more') === '1');

// ── the consumers ──
const pl = rd('player/index.html'), gm = rd('gm/index.html');
ok('the player shell loads the module before /player/app.js', pl.indexOf('/lib/shared/scrollCue.js') > -1 && pl.indexOf('/lib/shared/scrollCue.js') < pl.indexOf('/player/app.js'));
ok('the GM shell loads it before the NPC module and /gm/app.js', gm.indexOf('/lib/shared/scrollCue.js') > -1
  && gm.indexOf('/lib/shared/scrollCue.js') < gm.indexOf('/lib/library/npc/view.js') && gm.indexOf('/lib/shared/scrollCue.js') < gm.indexOf('/gm/app.js'));
const app = rd('player/app.jsx');
const fn = (app.match(/function fcUpdateScrollCues\(\) \{([\s\S]*?)\n\}/) || [])[1] || '';
ok('fcUpdateScrollCues is a call into the module, with no driver of its own', /SWRPGScrollCue\.update\(\)/.test(fn) && !/setAttribute|scrollHeight/.test(fn), fn);
ok('the creator registers its own selector list, which still names the creator and sheet panes',
  /SWRPGScrollCue\.register\(FC_SCROLL_CUE_PANES\)/.test(app) && /var FC_SCROLL_CUE_PANES = '\.hpw-shell \.hp-pane, [^']*\[data-sheet-shell\] \.sb-pk-list > \.hp-plate';/.test(app));
ok('player/app.jsx sets data-more nowhere else (one driver)', (app.match(/'data-more'/g) || []).length === 0);
const view = rd('lib/library/npc/view.jsx');
ok('the bench\'s zones watch through the module (and set no attribute of their own)', /window\.SWRPGScrollCue;[\s\S]{0,120}cue\.watch\(ref\.current\)/.test(view) && !/'data-more/.test(view));
console.log(`scroll_cue: ${n}/${n} ok`);
