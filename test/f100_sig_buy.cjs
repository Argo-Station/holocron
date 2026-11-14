#!/usr/bin/env node
/* F-100 — THE ONE SIGNATURE WRITER (ruling f100-surfacing-creator-concept R-SCC-1 as errata'd; ADDENDUM 11 OWNS "ONE writer
 * buySigAbility(id, tree, cell) … fail-closed on cannotAfford and hold"; D-229 Q1 (a) "XP CHARGED"; ADDENDUM 18 Q2 (a) the
 * SYNTHETIC inferred cell; rider R1 the locked reason slot). The plan is CharResolve.sigBuyPlan (pure); the writer is
 * SheetAdvancement's buySigAbility, sliced from player/app.jsx and run against stubs.
 *
 *   B1  THE PLAN, key ON, on a standing Spy (Courier, columns 2–3 owned): the base '0-0' of Counterespionage → ok, cost 30,
 *       the entry {id, tree, owned: ['0-0']}; an upgrade '1-0' → ok, cost 10, owned += '1-0'; then '1-2' → 10 and '2-2' → 15.
 *   B2  REFUSED, each in SIG_WORDS' words (the one copy source): V0 no such ability · V1 another career · V2 a tree not the
 *       career's own · V3 the bottom row unowned · V4 a second ability on the tree · V5 an upgrade before the base · V6 a
 *       box not linked · V7 no such box; an owned cell. A refused plan carries no list (nothing to write).
 *       (post1-switch-deletion, ADDENDUM 638: M12's key is gone; B2's key-OFF refusal went with it, table 3.)
 *   B3  HELD (SYNTHETIC — no shipped cell is `inferred` after ef9f855d5): '1-0' planted `inferred` in a copy of the
 *       registry → not ok, held "cost unverified — Cyphers and Masks p.34" (tree_page, ADDENDUM 18 Q5 (a)).
 *   B4  THE WRITER (buySigAbility's own source): `hold` → no write; cannotAfford → no write; a refused plan → no write; a
 *       legal buy → ONE onSheetChange { signatureAbilities, xp } with spent + 30 and remaining − 30 exactly (then + 10).
 *   B5  R1: lib/shared/treeView.jsx's refusalText returns `buy.reason` for a `locked` cell that carries one, and the
 *       bottom sheet's locked block renders the slot (data-testid tree-locked-reason).
 *   BITE  `--mutant` drops the inferred hold from sigBuyPlan in memory → B3 must go red (exit 1). Read the exit code bare.
 *
 * Exit 0 = every leg green; 1 = a leg red (or the mutant's run); 2 = an unknown flag.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
if (args.some((a) => a !== '--mutant')) { console.error('usage: f100_sig_buy.cjs [--mutant]'); process.exit(2); }
const MUTANT = args.includes('--mutant');

const CR_PATH = path.join(ROOT, 'lib/shared/charResolve.js');
let src = fs.readFileSync(CR_PATH, 'utf8');
const HOLD = "if (c.cost_status === 'inferred') {";
if (MUTANT) {
  if (src.split(HOLD).length !== 2) { console.error('MUTANT NOT PLANTED: the hold moved'); process.exit(1); }
  src = src.replace(HOLD, 'if (false) {');
  console.log('MUTANT PLANTED: sigBuyPlan without the inferred hold');
}
// B-336 signature wave (ruling release-r7-bug-burndown ADDENDUM 62): `cite.book`/`sources` hold vocabulary KEYS, and the
// held words print the book's TITLE through the shared resolver (bookLabelOf → SWRPGSources.sourceLabel), which the app
// has up. Load it here over the shipped vocabulary, as the page does, so B3's "names the book" claim reads the real path.
{
  const vm = require('vm');
  const ctx = { window: {}, module: { exports: {} }, console: { log() {}, warn() {}, error() {} }, setTimeout };
  ctx.self = ctx.window; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'lib/shared/sources.js'), 'utf8'), ctx);
  const S0 = ctx.window.SWRPGSources || ctx.module.exports;
  const IDX = S0.buildIndex(JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical/books.vocab.json'), 'utf8')));
  global.window = { SWRPGSources: Object.assign({}, S0, { current: () => ({ index: IDX }) }) };
}
const m = new Module(CR_PATH, module);
m.filename = CR_PATH;
m.paths = Module._nodeModulePaths(path.dirname(CR_PATH));
m._compile(src, CR_PATH);
const CR = m.exports;

let failures = 0;
const check = (ok, label) => { console.log((ok ? '  PASS  ' : '  FAIL  ') + label); if (!ok) failures++; };
const clone = (x) => JSON.parse(JSON.stringify(x));
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical', f), 'utf8'));
const SIG = J('signature_abilities.json').signature_abilities;
const CB = { careers: J('careers.json').careers, specializations: J('specializations.json').specializations,
  talents: J('talents.json').talents, species: J('species.json').species, signatureAbilities: SIG };
const sheet = (career, spec, cols, entries) => {
  const bottom = CB.specializations[spec].talent_tree.length - 1;
  return { careerId: career, career: CB.careers[career].name, specializations: [{ id: spec, owned: cols.map((c) => bottom + '-' + (c - 1)) }],
    talents: [], skills: {}, characteristics: { brawn: 2, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
    signatureAbilities: entries, xp: { total: 200, spent: 100, remaining: 100 } };
};
const CE = 'counterespionage', NAME = SIG[CE].name;
const SPY = (entries) => sheet('spy', 'courier', [1, 2, 3, 4], entries || []);
const plan = (sh, id, tree, cell, cb) => CR.sigBuyPlan(sh, cb || CB, id, tree, cell);
const J1 = JSON.stringify;

// ── B1 · the plan ────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const p0 = plan(SPY(), CE, 'courier', '0-0');
  check(p0.ok && p0.cost === 30 && J1(p0.signatureAbilities) === J1([{ id: CE, tree: 'courier', owned: ['0-0'] }]),
    `B1 the base of ${NAME}: ok ${p0.ok}, cost ${p0.cost} (30), writes ${J1(p0.signatureAbilities)}`);
  const s1 = SPY(p0.signatureAbilities), p1 = plan(s1, CE, 'courier', '1-0');
  check(p1.ok && p1.cost === 10 && J1(p1.signatureAbilities[0].owned) === J1(['0-0', '1-0']),
    `B1 the upgrade '1-0': ok ${p1.ok}, cost ${p1.cost} (10), owned ${J1(p1.signatureAbilities && p1.signatureAbilities[0].owned)}`);
  const p2 = plan(SPY(p1.signatureAbilities), CE, 'courier', '1-2'), p3 = p2.ok ? plan(SPY(p2.signatureAbilities), CE, 'courier', '2-2') : p2;
  check(p2.ok && p2.cost === 10 && p3.ok && p3.cost === 15 && J1(p3.signatureAbilities[0].owned) === J1(['0-0', '1-0', '1-2', '2-2']),
    `B1 then '1-2' (${p2.cost}) and '2-2' linked under it: ok ${p3.ok}, cost ${p3.cost} (15)`);
}

// ── B2 · refused, in SIG_WORDS' words ────────────────────────────────────────────────────────────────────────────────
{
  const base = [{ id: CE, tree: 'courier', owned: ['0-0'] }];
  const legs = [
    ['V0', plan(SPY(), 'not_an_ability', 'courier', '0-0'), 'No signature ability is called "not_an_ability".'],
    ['V1', plan(Object.assign(SPY(), { careerId: 'smuggler', career: 'Smuggler' }), CE, 'courier', '0-0'), NAME + ' belongs to another career.'],
    ['V2', plan(SPY(), CE, 'shadow', '0-0'), NAME + ' must attach to one of your own career’s specializations.'],
    ['V3', plan(sheet('spy', 'courier', [2], []), CE, 'courier', '0-0'), NAME + ' needs the bottom-row talents in column 3 of that tree.'],
    ['V4', plan(SPY([{ id: 'unmatchedtradecraft', tree: 'courier', owned: ['0-0'] }]), CE, 'courier', '0-0'), 'That tree already has a signature ability; ' + NAME + ' can’t attach to it too.'],
    ['V5', plan(SPY(), CE, 'courier', '1-0'), 'An upgrade of ' + NAME + ' needs the ability itself first.'],
    // B-1627 (DECISIONS D-417 item 4): the box by what the player sees — box 2-3 is Turn Agent, the fourth of its row (was 'Box 2-3 of …')
    ['V6', plan(SPY(base), CE, 'courier', '2-3'), 'Turn Agent, fourth in its row, isn’t linked to the ability or an upgrade you own.'],
    ['V7', plan(SPY(base), CE, 'courier', '3-0'), NAME + ' has no box at 3-0.'],
    ['OWNED', plan(SPY(base), CE, 'courier', '0-0'), null],
  ];
  legs.forEach(([v, p, words]) => check(!p.ok && p.refusal && p.refusal.check === v && p.refusal.words === words && p.signatureAbilities === null,
    `B2 ${v} refused: ${J1(p.refusal)}`));
}

// ── B3 · held (SYNTHETIC) ────────────────────────────────────────────────────────────────────────────────────────────
{
  const planted = clone(SIG);
  planted[CE].tree[1].cells.forEach((c) => { if (c && (c.col || 0) === 0) c.cost_status = 'inferred'; });
  const cb = Object.assign({}, CB, { signatureAbilities: planted });
  const shipped = Object.values(SIG).every((a) => a.tree.every((r) => (r.cells || []).every((c) => !c || c.cost_status !== 'inferred')));
  const p = plan(SPY([{ id: CE, tree: 'courier', owned: ['0-0'] }]), CE, 'courier', '1-0', cb);
  check(shipped, 'B3 the shipped registry holds no `inferred` cell (the face is proven on a SYNTHETIC plant)');
  check(!p.ok && p.held && p.held.words === 'cost unverified — Cyphers and Masks p.34' && p.signatureAbilities === null,
    `B3 SYNTHETIC: '1-0' planted inferred is HELD: ${J1(p.held)}`);
}

// ── B4 · the writer, its own source ──────────────────────────────────────────────────────────────────────────────────
{
  const app = fs.readFileSync(path.join(ROOT, 'player/app.jsx'), 'utf8');
  const at = app.indexOf('  function buySigAbility(id, tree, cell) {');
  const body = at < 0 ? '' : app.slice(at, app.indexOf('\n  }\n', at) + 4);
  check(!!body, 'B4 buySigAbility(id, tree, cell) is defined in player/app.jsx (SheetAdvancement)');
  const make = (env) => new Function('CharResolve', 'hold', 'cannotAfford', 'sheet', 'data', 'xp', 'availableXp', 'spentXp', 'onSheetChange',
    body + '\nreturn buySigAbility;')(CR, env.hold, env.cannotAfford, env.sheet, CB, env.sheet.xp, env.sheet.xp.remaining, env.sheet.xp.spent, env.onSheetChange);
  const run = (sh, opts, id, tree, cell) => {
    const writes = [];
    make(Object.assign({ hold: null, cannotAfford: (c) => c > sh.xp.remaining, sheet: sh, onSheetChange: (p) => writes.push(p) }, opts))(id, tree, cell);
    return writes;
  };
  const sh = SPY();
  check(run(sh, { hold: { reason: 'held' } }, CE, 'courier', '0-0').length === 0, 'B4 `hold` → no write (B-855)');
  check(run(sh, { cannotAfford: () => true }, CE, 'courier', '0-0').length === 0, 'B4 cannotAfford → no write');
  check(run(sh, {}, CE, 'shadow', '0-0').length === 0, 'B4 a refused plan (V2) → no write');
  const w = run(sh, {}, CE, 'courier', '0-0');
  check(w.length === 1 && J1(Object.keys(w[0]).sort()) === J1(['signatureAbilities', 'xp']) && w[0].xp.spent === 130 && w[0].xp.remaining === 70
    && w[0].xp.total === 200 && J1(w[0].signatureAbilities) === J1([{ id: CE, tree: 'courier', owned: ['0-0'] }]),
    `B4 a legal base buy → ONE patch ${J1(w[0])} (spent 100 → 130, remaining 100 → 70)`);
  const sh2 = Object.assign(SPY(w[0].signatureAbilities), { xp: w[0].xp });
  const w2 = run(sh2, {}, CE, 'courier', '1-0');
  check(w2.length === 1 && w2[0].xp.spent === 140 && w2[0].xp.remaining === 60 && J1(w2[0].signatureAbilities[0].owned) === J1(['0-0', '1-0']),
    `B4 the upgrade '1-0' → spent ${w2[0] && w2[0].xp.spent} (140), owned ${J1(w2[0] && w2[0].signatureAbilities[0].owned)}`);
}

// ── B5 · R1, the locked reason slot ──────────────────────────────────────────────────────────────────────────────────
{
  const tv = fs.readFileSync(path.join(ROOT, 'lib/shared/treeView.jsx'), 'utf8');
  const rtAt = tv.indexOf('const refusalText = (cell) => {'), rt = rtAt < 0 ? '' : tv.slice(rtAt, tv.indexOf('\n  };', rtAt));
  check(/if \(buy\.state === 'locked' && buy\.reason\) return buy\.reason;/.test(rt) && rt.indexOf("buy.state === 'locked' && buy.reason") < rt.indexOf('Buy a connected talent'),
    'B5 refusalText: a `locked` cell with a reason returns it, before the row hint');
  check(/\{buy\.reason && <div [^>]*data-testid="tree-locked-reason"[^>]*>\{buy\.reason\}<\/div>\}/.test(tv),
    'B5 the bottom sheet\'s locked block renders the reason slot (tree-locked-reason)');
}

console.log(failures ? `\nf100_sig_buy${MUTANT ? ' --mutant' : ''}: ${failures} FAILED` : `\nf100_sig_buy${MUTANT ? ' --mutant' : ''}: all legs pass`);
process.exit(failures ? 1 : 0);
