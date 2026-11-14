#!/usr/bin/env node
/**
 * f47_aa_species.cjs — STANDING guard for the Allies & Adversaries playable species
 * (F-47; ruling f47-aaa-species-concept). Proves against the SHIPPED registry:
 *   1. The four A&A species exist with the human-verified profile (chars / WT·ST base / XP), sourced
 *      "Allies and Adversaries", official (_provenance oggdude-class, NOT community).
 *   2. The G11 enumerated skill grant: pool is an explicit canonical-id LIST, every id resolves in the
 *      skills vocab; Lasat/Jawa/Ewok = 2 options, Tusken = 1 (fixed, same shape).
 *   3. BOTH collisions coexist, labeled (concept §3.1, applied to Jawa too): the community Menagerie
 *      records keep their ids (ewok / jawa) with "(Menagerie)" labels; the official records take new
 *      ids (ewok_aaa / jawa_aaa) with the clean display name — zero retroactive change to existing saves.
 *
 * Run:  node test/f47_aa_species.cjs
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

let fails = 0;
const check = (label, ok, detail) => {
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (ok || detail === undefined ? '' : '  — ' + JSON.stringify(detail)));
  if (!ok) fails++;
};

const sp = rd('public/data/canonical/species.json').species;
const skillIds = new Set(rd('public/data/canonical/skills.vocab.json').entries.map((e) => e.id));

// ── 1. the four profiles (human-verified, ruling §2) ──
const EXPECT = {
  lasat:         { chars: [3, 3, 2, 1, 2, 1], wt: 12, st: 10, xp: 90,  pool: ['brawl', 'lore'] },
  jawa_aaa:      { chars: [1, 2, 2, 3, 2, 1], wt: 8,  st: 8,  xp: 120, pool: ['negotiation', 'skulduggery'] },
  // TUSKEN IS A FIXED GRANT, not a one-item pool (ruling `species-parity` A5-1; Jason read the
  // A&A page at p.106: "begin the game with one rank in Survival" — no choice at all). `fixed`
  // routes it past the G11 list-pool asserts below to its own pair.
  tusken_raider: { chars: [3, 2, 2, 2, 2, 1], wt: 11, st: 11, xp: 105, fixed: ['survival'] },
  ewok_aaa:      { chars: [1, 2, 2, 3, 1, 2], wt: 9,  st: 11, xp: 120, pool: ['stealth', 'survival'] },
};
const CH = ['brawn', 'agility', 'intellect', 'cunning', 'willpower', 'presence'];
for (const id of Object.keys(EXPECT)) {
  const s = sp[id];
  const e = EXPECT[id];
  check(`${id}: record exists`, !!s, id);
  if (!s) continue;
  check(`${id}: characteristics match the page`, CH.every((c, i) => s.characteristics[c] === e.chars[i]), s.characteristics);
  check(`${id}: WT/ST base + starting XP match`, s.wound_threshold_base === e.wt && s.strain_threshold_base === e.st && s.starting_xp === e.xp,
        { wt: s.wound_threshold_base, st: s.strain_threshold_base, xp: s.starting_xp });
  check(`${id}: sourced "Allies and Adversaries", official (not community)`,
        (s.sources || []).includes('allies_adversaries') /* B-336 species wave (ADDENDUM 62): the KEY */ && s._provenance !== 'community', { src: s.sources, prov: s._provenance });
  // ── 2. G11 enumerated list pool — for the three that ARE choices ──
  if (e.fixed) {
    // THE FIXED GRANT LIVES WHERE FIXED GRANTS LIVE (species-parity A5-1). It is asserted BOTH
    // ways round: present as `starting_skills`, and ABSENT from `skill_choice_grants` — a check
    // that only looked for the new shape would pass while the old one sat there too, which is how
    // a half-applied migration reads as green.
    const ss = s.starting_skills || [];
    check(`${id}: FIXED grant lives in starting_skills (A5-1)`,
          ss.length === e.fixed.length
            && ss.every((r, i) => r.skill === e.fixed[i] && r.rank_start === 1 && skillIds.has(r.skill)), ss);
    check(`${id}: and carries NO skill_choice_grants — it was never a choice`,
          !s.skill_choice_grants, s.skill_choice_grants);
  } else {
    const g = (s.skill_choice_grants || [])[0];
    check(`${id}: grant pool is an explicit LIST (G11)`, !!g && Array.isArray(g.pool), g && g.pool);
    check(`${id}: grant pool = the expected skills, all resolving in vocab`,
          !!g && Array.isArray(g.pool) && g.pool.length === e.pool.length
            && g.pool.every((k, i) => k === e.pool[i] && skillIds.has(k)) && g.rank_cap === 2, g && g.pool);
  }
}
check('Tusken is a FIXED grant, not a one-item pool (A5-1)',
      (sp.tusken_raider.starting_skills || []).length === 1 && !sp.tusken_raider.skill_choice_grants,
      { ss: sp.tusken_raider.starting_skills, scg: sp.tusken_raider.skill_choice_grants });
check('Lasat + Ewok are 2-option choices', sp.lasat.skill_choice_grants[0].pool.length === 2 && sp.ewok_aaa.skill_choice_grants[0].pool.length === 2);

// ── 3. both collisions coexist — RE-POINTED by ruling `menagerie-rename-name-resolution` §4(i) ──
// A-MSP-2 retired the "(Unofficial Species Menagerie)" labels. The parenthetical was F-47's way of
// letting both records stand when a NAME was the only thing that could separate them; the source
// picker now separates them by SOURCE, so the label is spent. What F-47 actually protected — BOTH
// records coexist, DISTINCT, ids and stats intact, no silent replacement — is asserted here instead,
// and the homonym is now stated as DELIBERATE rather than tolerated.
check('EWOK pair: community `ewok` survives under the bare name (A-MSP-2 retired the label)',
      sp.ewok && sp.ewok.name === 'Ewok' && sp.ewok._provenance === 'community', sp.ewok && sp.ewok.name);
check('EWOK pair: `ewok_aaa` shares the display name by DESIGN — distinct record, distinct id',
      sp.ewok_aaa && sp.ewok_aaa.name === 'Ewok' && sp.ewok_aaa.id !== sp.ewok.id, sp.ewok_aaa && sp.ewok_aaa.id);
check('JAWA pair: community `jawa` survives under the bare name (A-MSP-2 retired the label)',
      sp.jawa && sp.jawa.name === 'Jawa' && sp.jawa._provenance === 'community', sp.jawa && sp.jawa.name);
check('JAWA pair: `jawa_aaa` shares the display name by DESIGN — distinct record, distinct id',
      sp.jawa_aaa && sp.jawa_aaa.name === 'Jawa' && sp.jawa_aaa.id !== sp.jawa.id, sp.jawa_aaa && sp.jawa_aaa.id);
check('no silent replacement: the community ids (ewok/jawa) survive with the SAME characteristics',
      sp.ewok.characteristics.willpower === 2 && sp.jawa.characteristics.presence === 2, null);

// ── the A&A book row is in the shipped vocab (F-32 C3; the species need it to shelf) ──
const bv = rd('public/data/canonical/books.vocab.json').entries;
check('books.vocab ships the "Allies and Adversaries" row (Supplement)',
      bv.some((e) => e.id === 'allies_adversaries' && e.group === 'Supplement'), null);

console.log(fails === 0 ? '\nf47 A&A species guard: ALL PASS' : '\nf47 A&A species guard: ' + fails + ' FAILURES');
process.exit(fails === 0 ? 0 : 1);
