// test/b1504_qb_default_skills.cjs — B-1504 (ruling `release-r7-bug-burndown` ADDENDUM 76): Quick Build's free skill
// ranks are LEGAL for every career. `QB_DEFAULT_SKILLS[career]` sets the career-step free ranks (`freeCareer`) and
// `QB_AUTO_BUILD[career].specSkills` the specialization's (`freeSpec`), both in player/app.jsx. RAW:
//   · career step — one rank in each of N career skills; N = 4 in EotE/AoR (Edge of the Empire Core Rulebook p.80,
//     Age of Rebellion Core Rulebook p.88), 3 in F&D (Force and Destiny Core Rulebook p.43) — the career record's
//     `free_ranks`; the skills come from the CAREER's list (`careers.json` `career_skills`);
//   · specialization — "two of the four additional career skills", not the same skill twice (Edge of the Empire Core
//     Rulebook p.35; F&D p.44) — the spec record's `career_skills`; the spec must be one of the career's own.
// The measured defect: a Quick Build Mystic took a free rank in Cool, which is neither a Mystic career skill nor an
// Advisor bonus skill (Force and Destiny Core Rulebook p.81). Read against the shipped registries, never a typed list.
// `B1504_REF=<sha>` reads player/app.jsx at that commit (the red-first run).
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log('✓ ' + label); } else { fail++; console.log('✗ ' + label + (detail !== undefined ? '  — ' + JSON.stringify(detail).slice(0, 300) : '')); }
}
const REF = process.env.B1504_REF || null;
const app = REF ? execFileSync('git', ['show', REF + ':player/app.jsx'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 })
                : fs.readFileSync(path.join(ROOT, 'player/app.jsx'), 'utf8');
const json = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const careers = json('public/data/canonical/careers.json').careers;
const specs = json('public/data/canonical/specializations.json').specializations;
const alias = {};
json('public/data/canonical/skills.vocab.json').entries.forEach((s) => (s.aliases || []).forEach((a) => { alias[a] = s.id; }));

// the two consts, evaluated from the shipped source (object literals of strings/arrays — no code inside)
function constOf(name) {
  const m = new RegExp('const ' + name + ' = (\\{[\\s\\S]*?\\n\\});').exec(app);
  return m ? new Function('return ' + m[1])() : null;
}
const DEF = constOf('QB_DEFAULT_SKILLS'), AUTO = constOf('QB_AUTO_BUILD');
check('QB_DEFAULT_SKILLS and QB_AUTO_BUILD are read from player/app.jsx', !!DEF && !!AUTO);
const careerByName = {};
Object.keys(careers).forEach((id) => { careerByName[careers[id].name] = id; });
const specBySource = {};
Object.keys(specs).forEach((id) => { if (specs[id]._source_key) specBySource[specs[id]._source_key] = id; });

check('every Quick Build career has defaults, and every default career has an auto-build (12)',
  Object.keys(DEF).length === 12 && Object.keys(DEF).every((c) => AUTO[c]), Object.keys(DEF));
Object.keys(DEF).forEach((name) => {
  const cid = careerByName[name], car = careers[cid];
  check(name + ': the career resolves in careers.json', !!car);
  if (!car) return;
  const ids = DEF[name].map((k) => alias[k]);
  check(name + ': every default key is a known skill (' + DEF[name].join(', ') + ')', ids.every(Boolean), DEF[name]);
  const off = ids.filter((id) => car.career_skills.indexOf(id) < 0);
  check('B-1504 ' + name + ': every free career rank is a ' + name + ' career skill (off-list: ' + (off.join(', ') || 'none') + ')', off.length === 0, { off, career_skills: car.career_skills });
  check('B-1504 ' + name + ': ' + car.free_ranks + ' free career ranks, as the career grants (has ' + ids.length + ')', ids.length === car.free_ranks, ids);
  check(name + ': no skill twice at the career step', new Set(ids).size === ids.length, ids);
  const ab = AUTO[name], sid = specBySource[ab && ab.talent && ab.talent.specKey], spec = specs[sid];
  check(name + ': the auto-build specialization (' + (ab && ab.talent && ab.talent.specKey) + ') is one of the career\'s own', !!spec && car.specializations.indexOf(sid) >= 0, sid);
  if (!spec) return;
  const sids = (ab.specSkills || []).map((k) => alias[k]);
  const soff = sids.filter((id) => spec.career_skills.indexOf(id) < 0);
  check('B-1504 ' + name + ' / ' + spec.name + ': both free specialization ranks are the spec\'s own skills (off-list: ' + (soff.join(', ') || 'none') + ')',
    sids.length === 2 && new Set(sids).size === 2 && soff.length === 0, { sids, spec_skills: spec.career_skills });
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
