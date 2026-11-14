/**
 * heldStore.js — THE ONE CURE for a surface that holds a store in React (B-1732, ruling `release-r7-bug-burndown` ADDENDUM 514, 516).
 *
 * THE LOSS. A surface read its store once, at mount, and every act wrote that copy back whole. Another device's edit landed in the store (sync) or
 * another tab wrote it (`storage`), the next act here wrote the old copy over it, and the sweep pushed that at the current version: no 409, no
 * question, the edit gone from the account and then from the other device.
 *
 * THE RULE, which `vesselStore.apply` already keeps: AN ACT READS THE STORE BEFORE IT WRITES, and a LANDING REDRAWS. Reading at the act is the half
 * that protects the data; the redraw only keeps the page honest. The read is one getItem and a string compare, and `load()` runs only when the
 * stored string moved, so a store that mints on read (the bench's pre-v5 ids) doesn't mint anew on every act. A write the store refused (quota, a
 * newer build's hold) leaves the string where it was, so the next act keeps this page's state rather than dropping it.
 *
 * `listen` hears what the bench's `relanded` heard: sync's four landing events and `storage` for the key. Inert signed out, but for `storage`.
 *
 * No stored shape, field or key: this holds nothing of its own. Pure but for its two window edges; `create` is the node guard's door.
 */
(function (root) {
  'use strict';

  var LANDINGS = { adopt_written: true, adopted: true, rechecked: true, resolved: true };

  function rawOf(key, get) {
    try { return get ? get(key) : root.localStorage.getItem(key); } catch (e) { return null; }
  }

  // create({ key, load, persist[, get] }) → { read, apply, adopt, moved }
  function create(opts) {
    var has = false, raw = null, state;
    function read() {
      var now = rawOf(opts.key, opts.get);
      if (has && now === raw) return state;
      has = true; raw = now; state = opts.load();
      return state;
    }
    function adopt(next) {                   // the op wrote the store itself (the bench's markCraft)
      has = true; raw = rawOf(opts.key, opts.get); state = next;
      return next;
    }
    function apply(fn) {
      var cur = read(), next = fn(cur);
      if (next === cur) return cur;
      opts.persist(next);
      return adopt(next);
    }
    function moved() { return !has || rawOf(opts.key, opts.get) !== raw; }
    return { read: read, apply: apply, adopt: adopt, moved: moved };
  }

  // listen(key, fn) → unsubscribe. `fn` runs on a landing that could have moved `key`; the caller compares.
  function listen(key, fn) {
    var onStorage = function (e) { if (!e || e.key == null || e.key === key) fn(); };
    root.addEventListener('storage', onStorage);
    var SY = root.SWRPGSync;
    var un = SY && SY.subscribe ? SY.subscribe(function (type) { if (LANDINGS[type]) fn(); }) : null;
    return function () {
      root.removeEventListener('storage', onStorage);
      if (typeof un === 'function') un();
    };
  }

  // use({ key, load, persist }) → { state, apply(fn) → next, read(), adopt(next) }: the hook, in the shape the hosts' `useState` + write held.
  function use(opts) {
    var R = root.React;
    var ref = R.useRef(null);
    if (!ref.current) ref.current = create(opts);
    var held = ref.current;
    var st = R.useState(function () { return held.read(); }), state = st[0], setState = st[1];
    R.useEffect(function () {
      var relanded = function () { if (held.moved()) setState(held.read()); };
      relanded();                            // a landing between the first draw and this effect
      return listen(opts.key, relanded);
    }, []);
    var api = R.useRef(null);
    if (!api.current) {
      api.current = {
        read: held.read,
        apply: function (fn) { var next = held.apply(fn); setState(next); return next; },
        adopt: function (next) { held.adopt(next); setState(next); return next; },
      };
    }
    return { state: state, apply: api.current.apply, read: api.current.read, adopt: api.current.adopt };
  }

  var API = { create: create, listen: listen, use: use };
  if (typeof window !== 'undefined') root.SWRPGHeldStore = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : this);
