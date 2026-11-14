#!/usr/bin/env node
/**
 * held_store.cjs — lib/shared/heldStore.js, the one cure for a surface that holds a store in React (B-1732, ruling `release-r7-bug-burndown`
 * ADDENDUM 514, 516). An act reads the store before it writes; a landing is heard. The driven proof is scripts/b1707_loss_drive.py.
 * Exit 0 all pass · 1 any fail.
 */
'use strict';
const listeners = {};
global.window = {
  localStorage: { getItem: () => null },
  addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); },
  removeEventListener: (t, f) => { listeners[t] = (listeners[t] || []).filter((x) => x !== f); },
  SWRPGSync: { subs: [], subscribe(f) { this.subs.push(f); return () => { this.subs = this.subs.filter((x) => x !== f); }; } },
};
const H = require('../lib/shared/heldStore.js');

let pass = 0, fail = 0;
const check = (label, cond, detail) => {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (detail !== undefined ? '  -> ' + JSON.stringify(detail) : '')); }
};

function store(start) {
  const s = { raw: JSON.stringify(start), loads: 0, refuse: false };
  s.held = H.create({
    key: 'k',
    get: () => s.raw,
    load: () => { s.loads += 1; return JSON.parse(s.raw); },
    persist: (v) => { if (!s.refuse) s.raw = JSON.stringify(v); },
  });
  return s;
}

{
  const s = store({ a: 1 });
  s.held.read();
  s.raw = JSON.stringify({ a: 1, landed: 2 });       // another device or tab wrote it
  check('moved() sees the landing', s.held.moved() === true);
  const next = s.held.apply((v) => Object.assign({}, v, { mine: 3 }));
  check('an act builds on the store, so a landed edit survives it', next.landed === 2 && next.mine === 3, next);
  check('and both reach the store', JSON.parse(s.raw).landed === 2 && JSON.parse(s.raw).mine === 3, s.raw);
  check('after the act nothing reads as moved', s.held.moved() === false);
}
{
  const s = store({ a: 1 });
  s.held.read();
  s.held.read();
  s.held.apply((v) => Object.assign({}, v, { b: 1 }));
  s.held.apply((v) => Object.assign({}, v, { c: 1 }));
  check('load() runs only when the stored string moved: a store that mints on read mints once', s.loads === 1, s.loads);
}
{
  const s = store({ a: 1 });
  s.held.read();
  s.refuse = true;
  const first = s.held.apply((v) => Object.assign({}, v, { b: 1 }));
  const second = s.held.apply((v) => Object.assign({}, v, { c: 1 }));
  check('a refused write leaves this page\'s state standing for the next act', first.b === 1 && second.b === 1 && second.c === 1, second);
}
{
  const s = store({ a: 1 });
  const cur = s.held.read();
  const raw = s.raw;
  check('an act that returns its input writes nothing', s.held.apply((v) => v) === cur && s.raw === raw);
}
{
  const s = store({ a: 1 });
  s.held.read();
  s.raw = JSON.stringify({ written: 'by the op' });
  s.held.adopt({ written: 'by the op' });
  check('adopt() takes what the op wrote itself, with no load', s.loads === 1 && s.held.moved() === false, s.loads);
}
{
  let heard = 0;
  const un = H.listen('k', () => { heard += 1; });
  const sub = window.SWRPGSync.subs[0];
  ['adopt_written', 'adopted', 'rechecked', 'resolved'].forEach((t) => sub(t));
  check('listen hears sync\'s four landings', heard === 4, heard);
  sub('pushed'); sub('conflict');
  check('and no other event', heard === 4, heard);
  listeners.storage[0]({ key: 'k' });
  check('it hears another tab\'s write of its key', heard === 5, heard);
  listeners.storage[0]({ key: 'other' });
  check('not another key', heard === 5, heard);
  listeners.storage[0]({ key: null });
  check('and a clear', heard === 6, heard);
  un();
  check('unsubscribe lets go of both', window.SWRPGSync.subs.length === 0 && listeners.storage.length === 0);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
