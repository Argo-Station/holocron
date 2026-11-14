#!/usr/bin/env node
/* test/e6_group_pick.cjs — which party a character's grants read when two parties list it (ruling `encounters-e6-plumbing`
 * ADDENDUM 1, P1.1). One character may play in two campaigns (E4 §5), so two party records can list `char:<id>`, and
 * after a sync their ARRAY order differs device to device. `CharResolve.groupOf` never reads that order:
 *   G1 'party' wins when it lists the character, in either array order
 *   G2 else the highest comparable `updatedAt`, in either array order
 *   G3 equal (or missing) stamps: the lowest id, in either array order
 *   G4 a party that does not list the character is never picked; none → null
 *
 * `node test/e6_group_pick.cjs --bite` runs each mutant (a COPY of charResolve.js, never the tree) and exits 1 if one survives.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SRC = path.join(__dirname, '..', 'lib/shared/charResolve.js');
const MUTANTS = [
  ['array-order', 'G2', 'if (!best || _groupBefore(p, best)) best = p;', 'if (!best) best = p;'],
  ['no-party-first', 'G1', 'if (ap !== bp) return ap;', ''],
  ['oldest-stamp', 'G2', 'if (at !== bt) return at > bt;', 'if (at !== bt) return at < bt;'],
  ['highest-id', 'G3', 'return String(a.id) < String(b.id);', 'return String(a.id) > String(b.id);'],
];

if (process.argv.includes('--bite')) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'e6-group-pick-'));
  let bad = 0;
  for (const [name, leg, find, repl] of MUTANTS) {
    const src = fs.readFileSync(SRC, 'utf8');
    if (src.split(find).length !== 2) { console.log('  BROKEN MUTANT ' + name); bad++; continue; }
    const f = path.join(tmp, 'charResolve.js');
    fs.writeFileSync(f, src.replace(find, repl));
    const r = spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { CR_SRC_OVERRIDE: f }), encoding: 'utf8' });
    const ok = r.status === 1 && new RegExp('FAIL  ' + leg + ' ').test(r.stdout);
    console.log((ok ? '  BIT   ' : '  MISSED') + ' ' + name.padEnd(16) + ' → ' + leg + (ok ? '' : ' (exit ' + r.status + ')'));
    if (!ok) bad++;
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(bad ? bad + ' mutant(s) survived' : 'every mutant bit (' + MUTANTS.length + ')');
  process.exit(bad ? 1 : 0);
}

const CR = require(process.env.CR_SRC_OVERRIDE || SRC);
let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ok    ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail !== undefined ? '  -> ' + JSON.stringify(detail) : '')); }
}
const P = (id, updatedAt, whos) => ({ id, updatedAt, members: (whos || ['char:k']).map((w) => ({ who: w })) });
function pick(parties) {
  CR.setGroupResolver(() => ({ parties, bases: null, chars: [] }));
  const g = CR.groupOf({ id: 'k' });
  return g ? g.party.id : null;
}
function both(leg, label, a, b, want) {
  const x = pick([a, b]), y = pick([b, a]);
  check(leg + ' ' + label + ' (both array orders)', x === want && y === want, [x, y]);
}

both('G1', "'party' beats a newer campaign party", P('party', 1), P('party_z', 999), 'party');
both('G2', 'the higher updatedAt wins', P('party_a', 10), P('party_b', 20), 'party_b');
both('G2', 'a comparable stamp beats a missing one', P('party_a', null), P('party_b', 5), 'party_b');
both('G3', 'equal stamps: the lowest id', P('party_b', 7), P('party_a', 7), 'party_a');
both('G3', 'both stamps missing: the lowest id', P('party_b'), P('party_a'), 'party_a');
both('G4', 'a party that does not list the character is never picked', P('party', 1, ['char:other']), P('party_b', 2), 'party_b');
check('G4 no party lists the character → null', pick([P('party', 1, ['name:Mira'])]) === null);
check('G4 the grants read the picked party', (CR.setGroupResolver(() => ({ parties: [P('party_a', 1), Object.assign(P('party_b', 9), { name: 'Rogue' })], bases: null, chars: [] })),
  CR.groupGrants({ id: 'k' }).group === 'party_b'));
CR.setGroupResolver(null);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
