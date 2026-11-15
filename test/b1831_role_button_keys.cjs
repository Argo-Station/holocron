// test/b1831_role_button_keys.cjs — B-1831 (ruling `release-r7-bug-burndown` ADDENDUM 679): NO PRODUCT role="button"
// LACKS ITS KEYS. A keyboard user could focus the NPC bench's board card (the card whose press opens the statblock overlay,
// gate `post1-card-focus-2` F7) but not press it: `role="button"` with only an onClick. The census
// (`scripts/b1831_role_button_census.cjs`) reads every element given role="button" over the tracked `player/ gm/ lib/ dice/`
// sources, JSX and createElement, and asks for an onKey* handler of its own that names Enter and Space. At the cut it found
// 28 sites and 3 bare, all `.nl-bcard` in `lib/library/npc/view.jsx` (BenchBoardCard; EncCard's PC and NPC cards). Each
// holds its own controls, so none can be a real <button> (B-1710's pattern, 589); each takes Enter and Space on the handler
// its press calls, through `cardPressKeys`, which acts only when the card itself is the key's target.
//
// A SOURCE GUARD plus the helper run in a vm. The rendered truth (the board card opens the statblock overlay by Enter and by
// Space) is the gate's keyboard leg. RED AT THE CUT `2ac26f9df` by exit code.
'use strict';
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const { census, scan } = require(path.join(ROOT, 'scripts/b1831_role_button_census.cjs'));
let pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log('✓ ' + label); } else { fail++; console.log('✗ ' + label + (detail !== undefined ? '  — ' + JSON.stringify(detail) : '')); }
}

// ── 1. the census reaches what it claims (a zero harvest is a failed run) ──
const sites = census();
check('the census reads at least the 28 role="button" sites it found at the cut', sites.length >= 28, sites.length);
check('every site resolved to an element (no unparsed span)', sites.every(x => x.kind !== '?'), sites.filter(x => x.kind === '?').map(x => x.file + ':' + x.line));

// ── 2. the census bites: a planted bare site and a planted one-key site read bare; a keyed one and a comment do not ──
const plant = scan('plant.jsx', [
  '<div className="bare" role="button" tabIndex={0} onClick={go}>x</div>',
  '<div className="enter-only" role="button" tabIndex={0} onClick={go} onKeyDown={e => { if (e.key === \'Enter\') go(); }}>x</div>',
  '<div className="keyed" role="button" tabIndex={0} onClick={go} onKeyDown={e => { if (e.key === \'Enter\' || e.key === \' \') go(); }}>x</div>',
  "h('span', { className: 'made', role: 'button', tabIndex: 0, onClick: go })",
  '// <div role="button"> in a comment is not a site',
].join('\n'));
check('the census reads a planted bare JSX site, an Enter-only site and a bare createElement site as bare',
  plant.filter(x => !x.keys).map(x => x.cls).join(',') === 'bare,enter-only,made', plant.map(x => [x.cls, x.keys]));
check('the census reads a planted Enter-and-Space site as keyed, and skips a comment', plant.length === 4 && plant.find(x => x.cls === 'keyed').keys, plant.length);

// ── 3. the law: no product role="button" lacks Enter and Space ──
const bare = sites.filter(x => !x.keys);
check('no product role="button" lacks its own Enter and Space handling', bare.length === 0, bare.map(x => x.file + ':' + x.line + ' .' + (x.cls || x.tag)));

// ── 4. the bench's statblock card (F7) by name: BenchBoardCard, and EncCard's two cards ──
const npcPath = 'lib/library/npc/view.jsx';
const npc = fs.readFileSync(path.join(ROOT, npcPath), 'utf8');
function fnBody(name) {
  const at = npc.indexOf('function ' + name + '(');
  if (at < 0) return null;
  const open = npc.indexOf('{', npc.indexOf(')', at));
  let d = 0;
  for (let i = open; i < npc.length; i++) { if (npc[i] === '{') d++; else if (npc[i] === '}' && --d === 0) return { at, end: i }; }
  return null;
}
const lineOf = (i) => npc.slice(0, i).split('\n').length;
for (const [name, want] of [['BenchBoardCard', 1], ['EncCard', 2]]) {
  const b = fnBody(name);
  const inside = b ? sites.filter(x => x.file === npcPath && x.line >= lineOf(b.at) && x.line <= lineOf(b.end)) : [];
  check(name + (name === 'EncCard' ? ' (the encounter board\'s PC and NPC cards)' : ' (the bench\'s statblock card, F7)') + ' draws ' + want + ' role="button" card(s), each with Enter and Space',
    inside.length === want && inside.every(x => x.keys), inside.map(x => [x.line, x.keys]));
  const text = b ? npc.slice(b.at, b.end) : '';
  const presses = (text.match(/onKeyDown=\{cardPressKeys\(\(\) => selectMember\(m\)\)\}/g) || []).length;
  check(name + "'s keys call the handler its press calls (selectMember(m))", presses === want, presses);
}

// ── 5. cardPressKeys, run: Enter and Space press, only on the card itself, and the page does not scroll ──
const def = /const cardPressKeys = \(press\) => \(e\) => \{[\s\S]*?\n\};/.exec(npc);
check('cardPressKeys is defined in ' + npcPath, !!def);
if (def) {
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(def[0].replace('const cardPressKeys', 'globalThis.cardPressKeys'), ctx);
  const card = {};
  const fire = (key, target) => { let n = 0, prevented = false; ctx.cardPressKeys(() => { n++; })({ key, target, currentTarget: card, preventDefault() { prevented = true; } }); return { n, prevented }; };
  const enter = fire('Enter', card), space = fire(' ', card);
  check('Enter on the card presses once and prevents the default', enter.n === 1 && enter.prevented, enter);
  check('Space on the card presses once and prevents the default (no page scroll)', space.n === 1 && space.prevented, space);
  const tab = fire('Tab', card), a = fire('a', card);
  check('Tab and a letter on the card do nothing and keep their default', tab.n === 0 && !tab.prevented && a.n === 0 && !a.prevented, { tab, a });
  const inner = {}, inEnter = fire('Enter', inner), inSpace = fire(' ', inner);
  check('Enter or Space in a control inside the card (its menu, a glyph, an input) never presses the card, and keeps its default',
    inEnter.n === 0 && !inEnter.prevented && inSpace.n === 0 && !inSpace.prevented, { inEnter, inSpace });
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
