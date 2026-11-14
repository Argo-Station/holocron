// test/party_bases.cjs — R6 lane D's arms of the group record's one writer (lib/shared/partyStore.js):
//   B1 the `bases` normalizer (S4 + ruling release-r6-bases-registry Q3 (i) `focusSkill`): only carried fields normalize,
//      unknown fields kept, a save this build did not change writes back equal;
//   B2 the base ops (addBase / updateBase / removeBase) through save → reload; keys only, nothing derived stored;
//   B3 the Mentor's kind (Q4, amending R-R6PC-1): `mentor` rides only a mentor pick, closed to five; absent = jedi;
//      unknown kept and inert.
// `--bite` runs each mutant against its leg (the party_store.cjs pattern).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'lib/shared/partyStore.js');
const PARTY_SRC = fs.readFileSync(process.env.PARTY_SRC_OVERRIDE || SRC, 'utf8');
const VG = require('../lib/shared/versionGuard.js');
const D = require('../lib/shared/baseDerive.js');
const REG = require('../public/data/canonical/bases.json');
const PKEY = 'swrpg_party_v1';

const MUTANTS = [
  ['base-fills-fields', 'B1', "['id', 'type', 'name', 'place', 'notes'].forEach(function (k) { if (own(b, k)) known[k] = str(b[k]); });",
    "['id', 'type', 'name', 'place', 'notes'].forEach(function (k) { known[k] = str(b[k]); });"],
  ['bases-whole', 'B1', '(Array.isArray(p.bases) ? p.bases : []).map(normalizeBase).filter(Boolean),', "Array.isArray(p.bases) ? p.bases : [],"],
  ['any-paid', 'B2', "if (BASE_PAID.indexOf(u.paid) === -1) throw", 'if (false) throw'],
  ['mentor-any-kind', 'B3', "return MENTOR_KINDS.indexOf(r.mentor) !== -1 ? r.mentor : null;", 'return r.mentor;'],
  ['mentor-no-default', 'B3', "if (!own(r, 'mentor') || r.mentor == null) return 'jedi';", "if (!own(r, 'mentor') || r.mentor == null) return null;"],
  ['mentor-on-holocron', 'B3', "if (res.pick !== 'mentor') throw new Error('setResource: mentor rides only a mentor pick');", ''],
];

if (process.argv.includes('--bite')) {
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'party-bases-bite-'));
  let bad = 0;
  for (const [name, leg, find, repl] of MUTANTS) {
    const src = fs.readFileSync(SRC, 'utf8');
    if (src.split(find).length !== 2) { console.log('  BROKEN MUTANT ' + name); bad++; continue; }
    const f = path.join(tmp, name + '.js');
    fs.writeFileSync(f, src.replace(find, repl));
    const r = spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { PARTY_SRC_OVERRIDE: f }), encoding: 'utf8' });
    const ok = r.status === 1 && new RegExp('FAIL  ' + leg + ' ').test(r.stdout);
    console.log((ok ? '  BIT   ' : '  MISSED') + ' ' + name.padEnd(20) + ' → ' + leg + (ok ? '' : ' (exit ' + r.status + ')'));
    if (!ok) bad++;
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(bad ? bad + ' mutant(s) survived' : 'every mutant bit (' + MUTANTS.length + ')');
  process.exit(bad ? 1 : 0);
}

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ok    ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail !== undefined ? '  -> ' + JSON.stringify(detail).slice(0, 400) : '')); }
}
function world(seed) {
  const store = Object.assign({}, seed || {});
  const ls = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  const ctx = { localStorage: ls, SWRPGVersionGuard: VG, console, Date, JSON, Math };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(PARTY_SRC, ctx, { filename: 'partyStore.js' });
  return { store, P: ctx.SWRPGParty };
}
const RANCH = { type: 'HOMESTEAD', name: 'Hollow Ridge', place: 'Lothal', focus: 'BASERANCH', start: 'bought',
  upgrades: [{ key: 'HOMECORE', option: null, paid: 'credits' }, { key: 'HOMENPC', option: 'HOMENPC2', paid: 'obligation' }], notes: '' };

// ── B1 the normalizer ──
{
  const raw = { v: 1, parties: [{ id: 'party', name: '', members: [], duty: [], obligation: [], rank: 0, rankUps: [],
    bases: [{ id: 'base-x', anything: 1 }, Object.assign({ id: 'base-y', future: { deep: 1 } }, RANCH, {
      upgrades: [{ key: 'HOMECORE', option: null, paid: 'credits', why: 'kept' }], start: 'someday' }), 7, null], updatedAt: 1 }] };
  const { P } = world({ [PKEY]: JSON.stringify(raw) });
  const p = P.partyOf(P.load());
  check('B1 a partial base gains no fields (nothing filled in)', JSON.stringify(p.bases[0]) === JSON.stringify({ id: 'base-x', anything: 1 }), p.bases[0]);
  check('B1 unknown fields kept at base and upgrade level; an unknown start kept as stored',
    p.bases[1].future.deep === 1 && p.bases[1].upgrades[0].why === 'kept' && p.bases[1].start === 'someday', p.bases[1]);
  check('B1 a non-object entry is dropped', p.bases.length === 2, p.bases.length);
  check('B1 a numeric name normalizes to a string in place', P.normalizeBase({ id: 'b', name: 3 }).name === '3');
  check('B1 focusSkill joins only when carried', !('focusSkill' in P.normalizeBase({ id: 'b', focus: 'BASERANCH' }))
    && P.normalizeBase({ id: 'b', focus: 'BASESERVICE', focusSkill: 'xenology' }).focusSkill === 'xenology');
  const clean = { v: 1, parties: [{ id: 'party', name: '', members: [], duty: [], obligation: [], rank: 0, rankUps: [],
    bases: [Object.assign({ id: 'base-z' }, RANCH)], updatedAt: 1 }] };
  const w2 = world({ [PKEY]: JSON.stringify(clean) });
  w2.P.save(w2.P.load());
  check('B1 an untouched save with a full base writes back equal', JSON.stringify(JSON.parse(w2.store[PKEY]).parties[0].bases) === JSON.stringify(clean.parties[0].bases));
}

// ── B2 the ops, through save → reload ──
{
  const w = world({});
  const added = w.P.addBase(w.P.load(), RANCH);
  check('B2 addBase mints a base- id and returns it', /^base-[0-9a-z]+$/.test(added.id), added.id);
  w.P.save(added.state);
  let back = world(w.store).P;
  let base = back.partyOf(back.load()).bases[0];
  check('B2 the ranch is held after a reload, keys only', base.focus === 'BASERANCH' && base.upgrades.length === 2 && base.place === 'Lothal', base);
  check('B2 nothing derived is stored (Obligation, profit, skills)', !/"total"|perMemberPerMonth|"survival"|"obligation":\s*\d/.test(w.store[PKEY]), w.store[PKEY]);
  check('B2 the read derives the printed numbers from the stored keys', D.obligation(base, REG).total === 6 && D.profit(base, REG).perMemberPerMonth === 100);
  const st2 = back.updateBase(back.load(), base.id, { upgrades: base.upgrades.concat([{ key: 'HOMEINF', option: null, paid: 'obligation' }]) });
  w.P.save(st2);
  back = world(w.store).P;
  base = back.partyOf(back.load()).bases[0];
  check('B2 updateBase: a third upgrade (Infirmary, +3 Obligation) → 9 after a reload', D.obligation(base, REG).total === 9, D.obligation(base, REG));
  let threw = false;
  try { back.updateBase(back.load(), base.id, { upgrades: [{ key: 'HOMEINF', paid: 'favours' }] }); } catch (e) { threw = true; }
  check('B2 a live write refuses a paid outside credits/obligation/rank/story', threw);
  threw = false;
  try { back.addBase(back.load(), Object.assign({}, RANCH, { start: 'someday' })); } catch (e) { threw = true; }
  check('B2 a live write refuses a start outside the vocabulary', threw);
  const st3 = back.removeBase(back.load(), base.id);
  check('B2 removeBase: the group holds no base, and grants no skill', back.partyOf(st3).bases.length === 0 && D.groupCareerSkills(back.partyOf(st3).bases, REG).length === 0);
}

// ── B3 the Mentor's kind ──
{
  const { P } = world({});
  check('B3 the five kinds (FaD p.109 + Disciples of Harmony pp.79-80)', JSON.stringify(P.MENTOR_KINDS) === JSON.stringify(['jedi', 'baran_do', 'dagoyan', 'findsmen', 'sith']));
  let p = P.partyOf(P.setResource(P.load(), { from: 'fad', pick: 'mentor' }));
  check('B3 a mentor with no kind reads jedi (the core default)', P.mentorKind(p) === 'jedi' && !('mentor' in p.resource));
  p = P.partyOf(P.setResource(P.load(), { from: 'fad', pick: 'mentor', mentor: 'baran_do' }));
  check('B3 a Baran Do mentor is held and read', P.mentorKind(p) === 'baran_do' && p.resource.mentor === 'baran_do');
  let threw = false;
  try { P.setResource(P.load(), { from: 'fad', pick: 'holocron', skills: ['lore', 'lightsaber'], mentor: 'jedi' }); } catch (e) { threw = true; }
  check('B3 a live write refuses a mentor kind on another pick', threw);
  threw = false;
  try { P.setResource(P.load(), { from: 'fad', pick: 'mentor', mentor: 'grey' }); } catch (e) { threw = true; }
  check('B3 a live write refuses an unknown kind', threw);
  const odd = P.normalizeParty({ id: 'party', resource: { from: 'fad', pick: 'mentor', mentor: 'grey' } });
  check('B3 an unknown stored kind is kept and inert', odd.resource.mentor === 'grey' && P.mentorKind(odd) === null);
  check('B3 no mentor pick → no kind', P.mentorKind(P.normalizeParty({ id: 'party', resource: { from: 'aor', pick: 'base' } })) === null
    && P.mentorKind(P.normalizeParty({ id: 'party' })) === null);
}

console.log(`\nparty bases: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
