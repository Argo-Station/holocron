/* scrollCue.js — THE SCROLL CUE'S ONE DRIVER: window.SWRPGScrollCue (both shells; no deps).
 *
 * Ruling `paper-n3-bench` R-PN3-4 (B-908, DECISIONS D-24). A bounded scroller says there is more by an
 * ATTRIBUTE, and the stylesheet draws it: `data-more="1"` while more remains below, `data-more-above="1"`
 * while more remains above. The creator's B-586 cue (paper.css, sheet.css) fades on `data-more`; the paper
 * kit's `.hp-zone` (paper.css) draws its dashed mark and its fade on both. One implementation, two bundles:
 * the creator's `fcUpdateScrollCues` (player/app.jsx) is a call into this, with its own selector list.
 *
 * WHEN IT RECOMPUTES:
 *   - on every scroll (capture, so a pane's own scroll reaches it) and on resize, for everything registered;
 *   - on `update()`, which a surface calls after it renders (the creator does, after every render);
 *   - for a WATCHED element, also when its content changes WITHOUT a scroll — a ResizeObserver on the
 *     element and on each of its children (opening the vehicle picker, adding a member, a note growing),
 *     and a MutationObserver on its child list so a child added later is observed too.
 * THE THRESHOLD is the creator's: more than 8px hidden on a side (player/app.jsx, B-586).
 *
 *   SWRPGScrollCue.register(selectorList)  — keep every element the selector list matches current
 *   SWRPGScrollCue.watch(el) -> unwatch    — keep one element current, observing its content
 *   SWRPGScrollCue.update()                — recompute everything now
 *   SWRPGScrollCue.mark(el)                — recompute one element now
 */
(function (root) {
  'use strict';
  var THRESHOLD = 8;
  var selectors = [];
  var watched = [];

  function setFlag(el, name, on) {
    if (on) { if (el.getAttribute(name) !== '1') el.setAttribute(name, '1'); }
    else if (el.hasAttribute(name)) el.removeAttribute(name);
  }

  function mark(el) {
    if (!el || el.nodeType !== 1) return;
    var below = el.scrollHeight - el.clientHeight - el.scrollTop > THRESHOLD;
    var above = el.scrollTop > THRESHOLD;
    setFlag(el, 'data-more', below);
    setFlag(el, 'data-more-above', above);
  }

  function update() {
    try {
      for (var s = 0; s < selectors.length; s++) {
        var els = document.querySelectorAll(selectors[s]);
        for (var i = 0; i < els.length; i++) mark(els[i]);
      }
      for (var w = 0; w < watched.length; w++) mark(watched[w].el);
    } catch (e) {}
  }

  function register(selectorList) {
    if (typeof selectorList === 'string' && selectors.indexOf(selectorList) === -1) selectors.push(selectorList);
    update();
  }

  function watch(el) {
    if (!el || el.nodeType !== 1) return function () {};
    var rec = { el: el, ro: null, mo: null };
    var again = function () { mark(el); };
    try {
      if (typeof ResizeObserver === 'function') {
        rec.ro = new ResizeObserver(again);
        rec.ro.observe(el);
        for (var i = 0; i < el.children.length; i++) rec.ro.observe(el.children[i]);
      }
      if (typeof MutationObserver === 'function') {
        rec.mo = new MutationObserver(function (list) {
          for (var m = 0; m < list.length; m++) {
            var added = list[m].addedNodes;
            for (var a = 0; a < added.length; a++) if (added[a].nodeType === 1 && rec.ro) rec.ro.observe(added[a]);
          }
          mark(el);
        });
        rec.mo.observe(el, { childList: true });
      }
    } catch (e) {}
    watched.push(rec);
    mark(el);
    return function unwatch() {
      try { if (rec.ro) rec.ro.disconnect(); if (rec.mo) rec.mo.disconnect(); } catch (e) {}
      var k = watched.indexOf(rec);
      if (k !== -1) watched.splice(k, 1);
    };
  }

  try {
    document.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
  } catch (e) {}

  root.SWRPGScrollCue = { THRESHOLD: THRESHOLD, register: register, watch: watch, update: update, mark: mark };
})(typeof window !== 'undefined' ? window : this);
