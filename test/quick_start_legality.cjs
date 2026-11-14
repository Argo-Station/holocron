#!/usr/bin/env node
/**
 * quick_start_legality.cjs — R-QSR1: the shipped Quick Start roster is creation-legal BY GUARD.
 *
 * Ruling `quick-start-roster-scope`: "every shipped pregen must pass RAW creation arithmetic
 * (characteristic cost within pool, skills within allowance, talents placeable under the connection
 * rule). Any future archetype added to the roster meets the guard or doesn't ship."
 *
 * WHY THIS EXISTS. The roster used to be two products in one picker: eighteen archetypes we authored
 * and twelve FFG Beginner Game characters. The twelve were hand-built to teach a boxed adventure —
 * Pash spends 150 XP on characteristics against a 110-point pool, which creation rules do not permit
 * at any budget — so a player picked a character they could never have built and then advanced it
 * against rules it was never inside. The twelve retired; this guard is what stops the roster drifting
 * back into that state one well-meaning addition at a time.
 *
 * THE ARITHMETIC, all RAW:
 *   characteristics  cost 10 x new rank, from the SPECIES base            (eote p.101)
 *   skill ranks      free allowance = career.free_ranks (+species bonus) + 2 spec picks
 *                    (+species bonus) + the species' own starting_skills; beyond that, 5 x new rank
 *   talents          must exist in the character's specialization tree, and a starting character's
 *                    talents must be reachable — row 0 is always legal (connection rule, eote p.102)
 *   Force powers     characters start with no Force powers but may buy them
 *                    with XP at creation (fad p.103); the cost is
 *                    printed per-power (fad p.102, Table 2-2) and `force_powers.json` carries it
 *   creation caps    no characteristic above 5, no skill above rank 2 (eote p.92 / fad p.102)
 *   gear budget      500 credits to spend on personal gear (eote p.97 / fad p.107), PLUS whatever a
 *                    recorded creation trade adds; the leftover is the character's starting cash
 *   the three trades THE PAGES ARE CITED SO THE NEXT READER CAN CHECK THE AMOUNTS WITHOUT THE ORACLE,
 *                    and `BOOK_TABLES` below pins every amount against `narrative-mechanics.json`:
 *
 *     Edge of the Empire — TABLE 2-3: ADDITIONAL OBLIGATION (eote p.40)
 *       +5 XP / +5 Obligation · +10 XP / +10 Obligation
 *       +1,000 credits / +5 Obligation · +2,500 credits / +10 Obligation
 *       each option may be taken once per player, and a PC may not take on more
 *        extra Obligation than they started with (eote p.40) — Obligation RISES.
 *
 *     Age of Rebellion — TABLE 2-2: DUTY REDUCTIONS (aor p.46)
 *       the same four bonuses, but the cost is SPENT Duty: -5 Duty · -10 Duty · -5 Duty · -10 Duty
 *       each option may be taken once per player, and a PC may not spend
 *        more Duty than they started with (aor p.46) — Duty is a contribution, so the
 *        trade REDUCES it. A guard that treated it as a debt would read the sign backwards.
 *
 *     Force and Destiny — STARTING MORALITY VALUES (fad p.49)
 *       "each character begins with a Morality of 50 ... each player may select ONE of the following
 *        options": +10 starting XP · +2,500 starting credits · +5 starting XP and +1,000 starting
 *        credits · increase or decrease starting Morality by 21 (to 71 or 29).
 *       ONE option, not a stack — and the XP and credit options do NOT move Morality, so a Force
 *       character who took one of them still starts at 50.
 *       PAGE NOTE: `narrative-mechanics.json`'s own `_raw` string and ruling `morality-creation-trade-raw`
 *       cite "fad p.48". Read at HEAD: the four options are on CORPUS page 52 of the `fad` PDF, whose
 *       record carries `printed_offset: 3`, so the PRINTED page is 49. p.48 and p.52 are both wrong by
 *       one direction of that offset. The AMOUNTS in the registry are correct either way and are pinned
 *       below; only the page string differs, and it is flagged rather than edited (that file is not this
 *       row's to touch).
 *
 * ── THE LEDGER THAT WAS SET EQUAL TO ITSELF (B-733, `character-math-audit` §3.1, finding 2/14) ──
 *
 * This file used to assert exactly two things about experience: that an `xp` block EXISTS and that
 * `remaining === 0`. The authoring commit's own decision record says why that proves nothing — "D-3
 * xp.total == xp.spent, the only internally consistent way to reach remaining 0" — so the ledger was
 * set equal to itself by fiat and a quantity equal to itself cannot be checked. Three FaD archetypes
 * were carrying a basic Force power nobody had paid for and one of them was creation-ILLEGAL, under a
 * guard that read ALL PASS.
 *
 * So the ledger is now DERIVED from each record's own content and reconciled against what it stores:
 * characteristics from the species base, the row-0 talent, the basic Force power where the record
 * owns one, and every skill rank above the free allowance. Three claims are kept apart on purpose,
 * because they fail for different reasons and a human fixes them differently:
 *
 *   BALANCE    `xp.total === xp.spent + xp.remaining` — the invariant finding 14 says is asserted
 *              once, at birth, on one creator fixture and nowhere a saved record can drift.
 *   SOLVENCY   derived spend <= the species' starting pool (plus any RECORDED trade). This is the
 *              RAW legality claim, and it is the one Orin Vael fails.
 *   FIDELITY   derived spend === the stored `xp.spent`. This is the ledger telling the truth about
 *              the character it describes.
 *
 * `xp.total` is deliberately NOT asserted to equal the species pool. Storing `total === spent` is
 * the pick-and-play convention Jason ruled on 2026-07-30 (nothing left to spend), not an arithmetic
 * error — so the convention is asserted AS the convention and the pool is asserted separately as the
 * ceiling. Conflating the two would demand a re-authoring that nobody has asked for.
 *
 * ── WHAT WAS PENDING, AND WHAT DISCHARGED IT (Jason, 2026-09-20) ────────────────────────────────
 *
 * Every shortfall used to be an EDITORIAL choice nobody had made, so it was MEASURED exactly and
 * DECLARED. Jason answered B-740 and with it the rest: **"Unless it makes sense to get money from
 * trading duty, obligation, or morality, restrict to 500 credits"**, plus **"1. Morality trade okay"**
 * and **"2. Can have a container"**. That settles all three open questions at once:
 *
 *   B-740  the pregens' equipment is a PURCHASE LEDGER, not a kit — 500 credits, plus a recorded trade
 *          where the kit does not fit inside 500, and the leftover is the character's cash.
 *   B-733  the ledger is DERIVED. Sixteen of eighteen kits exceeded 500 and eleven now carry a trade;
 *          the six Force records that owned an unpaid power (or an uncharged sixth skill rank) are
 *          CHARGED, so `xp.spent` is the derived figure. Orin Vael, who was creation-ILLEGAL at 95
 *          against a Muun's 90, takes fad p.49's `+5 starting XP and +1,000 starting credits` — the
 *          only one of the five FaD options that fixes BOTH his 5 of XP and his 625 of overspend.
 *   B-734  Patch (technician) gets a container: a Backpack (`gear.json`, 50 credits, encumbrance 0,
 *          +4 threshold) takes his limit 7 → 11 against a carried 9.
 *
 * THE TRADE IS RECORDED, NOT IMPLIED. A bare credit figure would leave the next reader holding a
 * character with 1,500 credits of gear and no explanation. The record carries `mechanicTradeIds` — the
 * ratified G9 save field `charResolve.js` already reads at the reverse transform (:2050) and writes at
 * the forward one (:1644) — naming the option by its id out of `public/data/narrative-mechanics.json`,
 * and the mechanic's own `value` is the POST-trade figure (Obligation 10 → 15, Duty 10 → 5, Morality
 * unmoved at 50). NOTHING in this file reads a typed `xpAdjustment`/`creditAdjustment` off the record:
 * both are DERIVED from the trade ids through the registry, because a second resolution path for the
 * same number is a defect.
 *
 * So the DECLARED list below is EMPTY, and its four arms are still armed — UNDECLARED, ORPHAN, STALE
 * and DRIFT — because an empty list has to be a measured FACT and not a skip. The non-vacuity arm
 * prints the walked roster and the measured divergences so a reader can see that it is empty because
 * nothing diverges.
 *
 * Run: node test/quick_start_legality.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let failures = 0;
function check(label, cond, detail) {
  if (cond) console.log('  PASS  ' + label);
  else { failures += 1; console.error('  FAIL  ' + label + (detail !== undefined ? '  — ' + JSON.stringify(detail).slice(0, 500) : '')); }
}

const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical/' + f), 'utf8'));
const SPECIES = J('species.json').species;
const CAREERS = J('careers.json').careers;
const SPECS = J('specializations.json').specializations;
const TALENTS = J('talents.json').talents;
const ARMOR = J('armor.json').armor;
const GEAR = J('gear.json').gear;
const WEAPONS = J('weapons.json').weapons;
const FORCE_POWERS = J('force_powers.json').force_powers;
const SKILLKEY = (J('skills.vocab.json').entries || []).reduce((m, e) => {
  m[e.id] = (e.aliases || []).find((a) => /^[A-Z]+$/.test(a)) || e.id; return m;
}, {});
const SKILL_ALIAS = (J('skills.vocab.json').entries || []).reduce((m, e) => {
  (e.aliases || []).forEach((a) => { if (/^[A-Z]+$/.test(a)) m[a] = e.id; }); return m;
}, {});
const PREGENS = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/pregen_sheets.json'), 'utf8')).characters;
const CharResolve = require('../lib/shared/charResolve.js');

// ── RESOLVE BY `speciesId`, NEVER BY NAME (`character-math-audit` §3.4, B-733) ───────────────────
//
// F-67 re-pointed this from a LAST-WINS private name map to the SHARED index, which fixed the
// symptom — after the Complete Species Guide import the private map silently handed every archetype
// the CSG record instead of the one it was built on, and Orin Vael's Muun went 90 XP → 85 so the
// arithmetic "failed". But it left the CLASS in place: the guard still asked a NAME a question only
// an ID can answer. Measured at HEAD, EVERY ONE of the eighteen species names is a homonym — 2
// registry records each, and *three* answer to "Ewok" (`ewok` 100 XP / `ewok_aaa` 120 / `csg_ewok`
// 110) — so on all eighteen the guard's subject was decided by an ELECTION ORDER rather than by the
// record. The election happens to land on each record's own `speciesId` today; that is an accident
// and this file no longer depends on it. Every record carries a `speciesId`; that is what is read.
//
// The name index is still consulted — as a REPORTED FACT, not as the resolution. When the election
// stops landing on the id, the arm below says so while every number above it stays correct, which is
// the opposite of what happened in F-67.
const SP_IDX = CharResolve.speciesNameIndex(SPECIES);
const speciesOf = (p) => (p.speciesId ? SPECIES[p.speciesId] : null) || null;

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   THE CREATION TRADE — one resolution, read by every claim below
   `public/data/narrative-mechanics.json` is the shipped table and `charResolve.computeMechanic`
   is the shipped applier; this file reads the SAME table by the SAME ids, so a guard number and a
   surface number cannot disagree. `BOOK_TABLES` is the only place typed numbers appear, and each
   one carries its printed page (eote p.40 · aor p.46 · fad p.49 — read at HEAD, see the header).
══════════════════════════════════════════════════════════════════════════════════════════════ */
const NM = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/narrative-mechanics.json'), 'utf8'));
const MECH_FIELD = { eote: 'obligation', aor: 'duty', fad: 'morality' };
const MECH_BOOK = { obligation: 'eote', duty: 'aor', morality: 'fad' };
const BOOK_TABLES = {
  // eote p.40, TABLE 2-3: ADDITIONAL OBLIGATION. Obligation RISES by the cost.
  obligation: {
    page: 'eote p.40', stacking: true, eachOptionOnce: true, capIsOriginal: true, sign: +1,
    rows: [[5, 5, 0], [10, 10, 0], [5, 0, 1000], [10, 0, 2500]],   // [|valueDelta|, xpDelta, creditsDelta]
  },
  // aor p.46, TABLE 2-2: DUTY REDUCTIONS. The same four bonuses; Duty is SPENT, so the value FALLS.
  duty: {
    page: 'aor p.46', stacking: true, eachOptionOnce: true, capIsOriginal: true, sign: -1,
    rows: [[5, 5, 0], [10, 10, 0], [5, 0, 1000], [10, 0, 2500]],
  },
  // fad p.49, PLAYER CHARACTER STARTING MORALITY VALUES. Exactly ONE option; default Morality 50.
  morality: {
    page: 'fad p.49', stacking: false, eachOptionOnce: true, capIsOriginal: false, sign: 0,
    defaultValue: 50,
    rows: [[0, 10, 0], [0, 0, 2500], [0, 5, 1000], [21, 0, 0], [21, 0, 0]],   // ±21 is one row twice
  },
};
const CREDIT_BUDGET = 500;   // eote p.97 / fad p.107

console.log('\n── the three creation-trade tables, pinned against the books ──');
Object.keys(BOOK_TABLES).forEach((mech) => {
  const book = BOOK_TABLES[mech];
  const opts = ((NM.mechanics || {})[mech] || {}).tradeOptions || null;
  if (!opts) { check('`narrative-mechanics.json` carries a ' + mech + ' trade table', false, mech); return; }
  const got = (opts.choices || []).map((c) => [Math.abs(Number(c.valueDelta) || 0), Number(c.xpDelta) || 0, Number(c.creditsDelta) || 0]);
  const key = (rows) => rows.map((r) => r.join('/')).sort().join(' · ');
  check(mech.toUpperCase() + ': every amount in the shipped table is the amount the book prints ('
    + book.page + ') — ' + key(book.rows) + ' as |value cost| / XP / credits',
    key(got) === key(book.rows), { book: key(book.rows), registry: key(got) });
  check('and the ' + mech + ' table\'s RULES match the book — '
    + (book.stacking ? 'options stack, each taken once' : 'exactly ONE option (single_pick)')
    + (book.capIsOriginal ? ', and no more than the original starting value may be traded' : ''),
    !!opts.eachOptionOnce === book.eachOptionOnce
    && (book.stacking ? !!opts.maxAbsDeltaEqualsBase === book.capIsOriginal : opts.mode === 'single_pick'),
    { eachOptionOnce: opts.eachOptionOnce, maxAbsDeltaEqualsBase: opts.maxAbsDeltaEqualsBase, mode: opts.mode });
  if (book.sign !== 0) {
    const signs = (opts.choices || []).map((c) => Math.sign(Number(c.valueDelta) || 0));
    check('and the ' + mech + ' cost moves in the direction the book gives it — '
      + (book.sign > 0 ? 'Obligation RISES (a debt taken on)' : 'Duty FALLS (a contribution spent)')
      + ', which a sign error would invert while every magnitude stayed right',
      signs.every((s) => s === book.sign) && opts.direction === (book.sign > 0 ? 'increase_value' : 'decrease_value'),
      { signs: signs, direction: opts.direction });
  }
});

// tradeOf — the ONE resolution. Reads `mechanicTradeIds` off the record, resolves each id in the
// record's OWN line's table, and returns the sums plus the pre-trade original value. `original` is
// derived (final - sum of valueDelta) rather than stored, because the sheet shape persists only the
// FINAL value (charResolve.js:2055 says so in as many words) and a second stored copy would rot.
function tradeOf(p) {
  const mechKey = MECH_FIELD[p.book] || null;
  const block = mechKey ? (p[mechKey] || null) : null;
  const opts = mechKey ? (((NM.mechanics || {})[mechKey] || {}).tradeOptions || null) : null;
  const ids = Array.isArray(p.mechanicTradeIds) ? p.mechanicTradeIds.slice() : null;
  const resolved = [], unknown = [];
  (ids || []).forEach((id) => {
    const c = opts && (opts.choices || []).find((x) => x.id === id);
    if (c) resolved.push(c); else unknown.push(id);
  });
  const valueDelta = resolved.reduce((a, c) => a + (Number(c.valueDelta) || 0), 0);
  const xpDelta = resolved.reduce((a, c) => a + (Number(c.xpDelta) || 0), 0);
  const creditsDelta = resolved.reduce((a, c) => a + (Number(c.creditsDelta) || 0), 0);
  const finalValue = block ? Number(block.value) : null;
  return {
    mechKey, block, ids, unknown, resolved,
    valueDelta, xpDelta, creditsDelta,
    finalValue,
    original: finalValue === null ? null : finalValue - valueDelta,
    dupes: (ids || []).filter((id, i) => (ids || []).indexOf(id) !== i),
    budget: CREDIT_BUDGET + creditsDelta,
  };
}
const TRADE = PREGENS.reduce((m, p) => { m[p.id] = tradeOf(p); return m; }, {});

console.log('\n── R-QSR1: every shipped Quick Start archetype is creation-legal ──');

check('the roster is non-empty (a vacuous sweep proves nothing)', PREGENS.length > 0, PREGENS.length);

const noId = PREGENS.filter((p) => !p.speciesId || !SPECIES[p.speciesId]).map((p) => [p.name, p.speciesId]);
check('every archetype carries a `speciesId` that RESOLVES, and this guard scores it against THAT '
  + 'record and not against its display name (' + (PREGENS.length - noId.length) + '/' + PREGENS.length + ')',
  noId.length === 0, noId);
const homonyms = PREGENS.map((p) => {
  const n = (p.species || '').toLowerCase();
  const hits = Object.keys(SPECIES).filter((k) => (SPECIES[k].name || '').toLowerCase() === n);
  return { name: p.name, species: p.species, id: p.speciesId, hits: hits.length, elected: SP_IDX.byName[n] };
});
check('and the NAME is not a usable key here — all ' + homonyms.length + ' of the eighteen species '
  + 'names are homonyms in the registry (' + JSON.stringify(homonyms.map((h) => [h.species, h.hits]))
  + '), so a name lookup picks its subject by election order rather than by the record',
  homonyms.every((h) => h.hits > 1), homonyms.filter((h) => h.hits <= 1));
const elected = homonyms.filter((h) => h.elected !== h.id);
check('REPORTED, NOT RELIED ON: the shared name index\'s election still lands on each record\'s own '
  + '`speciesId` today (' + (homonyms.length - elected.length) + '/' + homonyms.length + ') — an '
  + 'accident of election order, which is why the arithmetic above reads the id. When it stops '
  + 'landing there this goes red and every number in this file stays correct',
  elected.length === 0, elected);

const illegal = [];
const unresolvable = [];
PREGENS.forEach((p) => {
  const sp = speciesOf(p);
  if (!sp) { unresolvable.push({ name: p.name, why: 'speciesId not in the registry: ' + p.speciesId }); return; }
  const cid = p.careerId || Object.keys(CAREERS).find((k) => (CAREERS[k].name || '').toLowerCase() === (p.career || '').toLowerCase());
  const car = cid ? CAREERS[cid] : null;
  if (!car) { unresolvable.push({ name: p.name, why: 'career not in the registry: ' + p.career }); return; }
  const spec = SPECS[(p.specializationIds || [])[0]];
  if (!spec) { unresolvable.push({ name: p.name, why: 'specialization not in the registry' }); return; }

  const pool = (sp.starting_xp || 100) + TRADE[p.id].xpDelta;

  // ── characteristics: cost from the species base, 10 x new rank ──
  let chrCost = 0;
  ['brawn', 'agility', 'intellect', 'cunning', 'willpower', 'presence'].forEach((a) => {
    const base = (sp.characteristics || {})[a] || 2;
    const cur = (p.characteristics || {})[a] || 2;
    for (let r = base + 1; r <= cur; r++) chrCost += r * 10;
  });
  if (chrCost > pool) {
    illegal.push({ name: p.name, kind: 'characteristics', cost: chrCost, pool: pool });
  }

  // ── skills: ranks vs the RAW free allowance ──
  const bonus = sp.bonus_free_ranks || {};
  const allowance = ((car.free_ranks || 4) + (bonus.career || 0))
    + (2 + (bonus.spec || 0))
    + (sp.starting_skills || []).length;
  const ranks = Object.values(p.skills || {}).reduce((a, b) => a + b, 0);
  // Over the allowance is legal ONLY if the excess is affordable alongside the characteristics.
  // Creation caps a skill at rank 2, so each excess rank costs 5 x its rank; the cheapest possible
  // excess is 5/rank, which is the bound this asserts against.
  if (ranks > allowance) {
    const excess = ranks - allowance;
    if (chrCost + excess * 5 > pool) {
      illegal.push({ name: p.name, kind: 'skills', ranks: ranks, allowance: allowance, chrCost: chrCost, pool: pool });
    }
  }

  // ── talents: present in the spec tree, and placeable ──
  (p.talents || []).forEach((t) => {
    const tid = t && t.id;
    if (!tid || !TALENTS[tid]) {
      illegal.push({ name: p.name, kind: 'talent-unknown', talent: tid });
      return;
    }
    const cells = [];
    (spec.talent_tree || []).forEach((row, r) => (row.talents || []).forEach((c, ci) => {
      if (c && c.talent === tid) cells.push({ row: r, col: ci });
    }));
    if (!cells.length) {
      illegal.push({ name: p.name, kind: 'talent-not-in-tree', talent: tid, spec: spec.id });
    }
  });
});

check('every archetype resolves against species / career / specialization',
  unresolvable.length === 0, unresolvable);
check('R-QSR1 no archetype exceeds RAW creation arithmetic',
  illegal.length === 0, illegal);

// ── the guard must be able to SEE an illegal build, or it proves nothing ────────────────────────
// A synthetic offender modelled on the worst real one that used to ship (Pash: five characteristics
// raised from an all-2 base = 150 XP against a 110 pool). If this does not trip, the checker above
// is decoration.
(function selfTest() {
  const human = SPECIES['human'];   // by ID, like everything else in this file
  if (!human) { check('self-test fixture available', false, 'no Human in the registry'); return; }
  const pool = human.starting_xp || 100;
  let cost = 0;
  ['brawn', 'agility', 'intellect', 'cunning', 'presence'].forEach((a) => {
    const base = (human.characteristics || {})[a] || 2;
    for (let r = base + 1; r <= 3; r++) cost += r * 10;
  });
  check('the legality arithmetic DETECTS the build that used to ship (5 raises = 150 > pool)',
    cost === 150 && cost > pool, { cost: cost, pool: pool });
})();

console.log('\n── the roster is what the door promises ──');
const ffg = PREGENS.filter((p) => /Beginner Game/i.test(p.source || ''));
check('no FFG Beginner Game character remains in the shipped roster',
  ffg.length === 0, ffg.map((p) => p.name));
check('every archetype carries an XP ledger', PREGENS.every((p) => p.xp), PREGENS.filter((p) => !p.xp).map((p) => p.name));
check('and nothing is left to spend (Quick Start is pick-and-play — Jason, 2026-07-30)',
  PREGENS.every((p) => p.xp && p.xp.remaining === 0), PREGENS.filter((p) => p.xp && p.xp.remaining !== 0).map((p) => ({ n: p.name, r: p.xp.remaining })));
check('every archetype carries positional talent ownership',
  PREGENS.every((p) => Array.isArray(p.specializations) && p.specializations.length
    && Array.isArray(p.specializations[0].owned)),
  PREGENS.filter((p) => !(Array.isArray(p.specializations) && p.specializations.length)).map((p) => p.name));
check('every archetype can fight unarmed (RAW for everyone — aor p.225)',
  PREGENS.every((p) => ((p.equipment || {}).weapons || []).some((w) => w && w.id === 'unarmed')),
  PREGENS.filter((p) => !(((p.equipment || {}).weapons || []).some((w) => w && w.id === 'unarmed'))).map((p) => p.name));


/* ══════════════════════════════════════════════════════════════════════════════════════════════
   B-740 · EVERY RECORDED TRADE IS ONE THE BOOK ALLOWS
   Jason 2026-09-20: "Unless it makes sense to get money from trading duty, obligation, or morality,
   restrict to 500 credits" · "1. Morality trade okay" · "2. Can have a container".
   Eleven of the eighteen carry a trade; seven carry none. Both are checked — an EMPTY `mechanicTradeIds`
   is a claim ("this character bought nothing extra") and it is scored against the 500 budget below.
══════════════════════════════════════════════════════════════════════════════════════════════ */
console.log('\n── B-740 the recorded trades ──');
console.log('  id             line        trade id                        val  xp    cr   orig -> final');
PREGENS.forEach((p) => {
  const t = TRADE[p.id];
  console.log('  ' + String(p.id).padEnd(14) + ' ' + String(t.mechKey).padEnd(11) + ' '
    + (t.ids && t.ids.length ? t.ids.join('+') : '(none)').padEnd(31) + ' '
    + String(t.valueDelta).padEnd(4) + ' ' + String(t.xpDelta).padEnd(5) + ' '
    + String(t.creditsDelta).padEnd(4) + ' ' + String(t.original) + ' -> ' + String(t.finalValue));
});

const noIds = PREGENS.filter((p) => TRADE[p.id].ids === null).map((p) => p.name);
check('every archetype carries `mechanicTradeIds` — the RATIFIED G9 save field (`charResolve.js`:1644 '
  + 'writes it, :2050 reads it back), so which option was taken is RECORDED and not implied by a bare '
  + 'credit figure. An absent array is a record whose money cannot be explained',
  noIds.length === 0, noIds);
const wrongLine = PREGENS.filter((p) => TRADE[p.id].unknown.length > 0)
  .map((p) => ({ n: p.name, line: TRADE[p.id].mechKey, unknown: TRADE[p.id].unknown }));
check('and every trade id resolves in the table of the record\'s OWN game line — a Duty reduction on an '
  + 'Edge character (or a name that is in no table at all) is refused, which is the class a hand-typed '
  + 'id would produce', wrongLine.length === 0, wrongLine);
const reDupes = PREGENS.filter((p) => TRADE[p.id].dupes.length > 0)
  .map((p) => ({ n: p.name, dupes: TRADE[p.id].dupes }));
check('EACH OPTION ONCE on the two stacking lines, and at all (eote p.40 "each player can only choose '
  + 'each option once" / aor p.46 "only once") — the same id twice would double a bonus the book gives '
  + 'once', reDupes.length === 0, reDupes);
const multiFad = PREGENS.filter((p) => p.book === 'fad' && (TRADE[p.id].ids || []).length > 1)
  .map((p) => ({ n: p.name, ids: TRADE[p.id].ids }));
check('EXACTLY ONE OPTION on Force and Destiny (fad p.49: "each player may select one of the following '
  + 'options") — the five FaD choices are mutually exclusive, so two of them on one record is illegal '
  + 'however affordable it looks', multiFad.length === 0, multiFad);
const unaffordable = PREGENS.filter((p) => {
  const t = TRADE[p.id];
  const book = BOOK_TABLES[t.mechKey];
  if (!book || !book.capIsOriginal) return false;
  return Math.abs(t.valueDelta) > Number(t.original);
}).map((p) => ({ n: p.name, cost: Math.abs(TRADE[p.id].valueDelta), original: TRADE[p.id].original }));
check('AFFORDABLE: no archetype trades more than its ORIGINAL starting value — eote p.40 "cannot gain '
  + 'more additional Obligation than their original starting value" / aor p.46 "cannot spend more Duty '
  + 'than their original starting value". The original is DERIVED (final minus the trade), because the '
  + 'sheet shape persists only the final value (charResolve.js:2055)',
  unaffordable.length === 0, unaffordable);
const wrongSign = PREGENS.filter((p) => {
  const t = TRADE[p.id];
  const book = BOOK_TABLES[t.mechKey];
  if (!book || !book.sign || !t.valueDelta) return false;
  return Math.sign(t.valueDelta) !== book.sign;
}).map((p) => ({ n: p.name, line: TRADE[p.id].mechKey, delta: TRADE[p.id].valueDelta }));
check('and the recorded VALUE moved the way its line moves — Obligation UP (a debt taken on, 10 -> 15), '
  + 'Duty DOWN (a contribution spent, 10 -> 5). A record that subtracted Obligation would still look '
  + 'arithmetically tidy and would be the wrong book',
  wrongSign.length === 0, wrongSign);
const morOff = PREGENS.filter((p) => p.book === 'fad'
  && Number(TRADE[p.id].original) !== BOOK_TABLES.morality.defaultValue)
  .map((p) => ({ n: p.name, original: TRADE[p.id].original, stored: TRADE[p.id].finalValue }));
check('MORALITY STARTS AT 50 (fad p.49: "each character begins with a Morality of 50") on all six Force '
  + 'archetypes, before and after their trade — the XP and credit options do not touch Morality, and '
  + 'the +-21 option is the only one that may, so a 50 that had drifted would mean an unrecorded move',
  morOff.length === 0, morOff);
const noBase = PREGENS.filter((p) => {
  const t = TRADE[p.id];
  return BOOK_TABLES[t.mechKey] && BOOK_TABLES[t.mechKey].capIsOriginal && !(Number(t.original) > 0);
}).map((p) => ({ n: p.name, original: TRADE[p.id].original }));
check('and every Obligation/Duty archetype has a positive ORIGINAL value for the trade to be measured '
  + 'against — a 0 would make the affordability arm above pass by having nothing to spend',
  noBase.length === 0, noBase);
const traded = PREGENS.filter((p) => (TRADE[p.id].ids || []).length > 0).map((p) => p.id);
check('and the trade arms are NON-VACUOUS — ' + traded.length + ' of ' + PREGENS.length + ' archetypes '
  + 'actually carry a trade (' + JSON.stringify(traded) + '), across all three lines, so the asserts '
  + 'above are scoring recorded options and not an empty field eighteen times',
  traded.length > 0
  && ['obligation', 'duty', 'morality'].every((k) => traded.some((id) => TRADE[id].mechKey === k)),
  { traded: traded.length, lines: traded.map((id) => TRADE[id].mechKey) });

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   B-740 · THE 500-CREDIT BUDGET, PRICED FROM THE REGISTRIES
   "This budget is 500 credits" (eote p.97); "500 credits to spend on personal gear" (fad p.107),
   plus whatever the recorded trade adds. The app's own arithmetic is
   `charResolve.js`:1480 — `creditTotal = 500 + creditAdjustment + pocketMoney` (and its comment says
   "pregens never set pocketMoney so this is +0 for them") against :1481's summed inventory price, with
   `equipment.credits` as the REMAINDER (:2069 "the sheet keeps only the REMAINDER"). So the identity is
   asserted, not just the inequality: a kit that grows without the purse shrinking is a defect the
   inequality alone would miss for as long as the budget had slack.
══════════════════════════════════════════════════════════════════════════════════════════════ */
console.log('\n── B-740 the credit budget ──');
function pricedRows(p) {
  const rows = [];
  ((p.equipment || {}).weapons || []).forEach((e) => rows.push({ id: e.id, qty: e.qty || 1, rec: WEAPONS[e.id] || null, lane: 'weapons' }));
  const a = (p.equipment || {}).armor;
  if (a && a.id) rows.push({ id: a.id, qty: 1, rec: ARMOR[a.id] || null, lane: 'armor' });
  ((p.equipment || {}).gear || []).forEach((e) => rows.push({ id: e.id, qty: e.qty || 1, rec: GEAR[e.id] || ARMOR[e.id] || null, lane: 'gear' }));
  return rows;
}
const purse = PREGENS.map((p) => {
  const rows = pricedRows(p);
  const t = TRADE[p.id];
  let spend = 0;
  const unresolved = [], unpriced = [];
  rows.forEach((r) => {
    if (!r.rec) { unresolved.push(r.id); return; }
    const pr = r.rec.price;
    if (typeof pr === 'number') { spend += pr * r.qty; return; }
    unpriced.push({ id: r.id, price: pr === null ? 'null' : typeof pr,
      authored: r.rec._provenance === 'authored', hidden: r.rec.store_hidden === true,
      sources: (r.rec.sources || []).length });
  });
  return { id: p.id, name: p.name, rows: rows.length, spend, budget: t.budget,
    stored: Number((p.equipment || {}).credits), want: t.budget - spend,
    over: spend - t.budget, unresolved, unpriced,
    priced: rows.length - unresolved.length - unpriced.length };
});
console.log('  id             items priced spend  budget  remainder stored  unpriced');
purse.forEach((r) => console.log('  ' + String(r.id).padEnd(14) + ' ' + String(r.rows).padEnd(5) + ' '
  + String(r.priced).padEnd(6) + ' ' + String(r.spend).padStart(5) + ' ' + String(r.budget).padStart(7) + ' '
  + String(r.want).padStart(9) + ' ' + String(r.stored).padStart(7) + '  '
  + JSON.stringify(r.unpriced.map((u) => u.id)) + (r.over > 0 ? '   <<< OVER BUDGET by ' + r.over : '')));

const badResolve = purse.filter((r) => r.unresolved.length);
check('every equipment entry on the roster RESOLVES against `weapons.json` / `armor.json` / `gear.json` '
  + '— an entry that resolved nowhere would price at 0 and make the budget arm pass by being blind to '
  + 'it', badResolve.length === 0, badResolve.map((r) => [r.name, r.unresolved]));
// TWO ENTRIES CARRY NO PRICE, AND THAT IS A CLASS, NOT A WAIVER. `fine_clothing` and `salvage_parts`
// are `_provenance: "authored"`, NO `price` key, `store_hidden: true`, `sources: []` — authored narrative
// props that the store cannot sell and no book prices. They contribute 0 to the spend, and this arm is
// what makes that honest: an unpriced entry is allowed ONLY if it is that shape. A real registry item
// whose price went missing (an OggDude row, a book source, a store-visible entry) fails here instead of
// silently lightening a character's bill.
// HONEST RE-POINT (norm 3; ruling f100-items-live R-FILG-2, D-FIL1 (a)). KEPT: the claim — only an authored,
// store-hidden, source-less prop may be unpriced. CHANGED: its "no price" is the key ABSENT, the shape
// R-FILC-6(b) ruled (the schema's legal no-price) — `price: null` is now schema-invalid (validate_registries
// L1.items.ship) and reads RED here like any other broken price. BITES recorded in the gate: a pregen's priced
// weapon losing its price → red; a prop carrying `price: null` → red.
const badUnpriced = purse.filter((r) => r.unpriced.some((u) => !(u.price === 'undefined' && u.authored && u.hidden && u.sources === 0)));
check('and every UNPRICED entry is an authored, store-hidden, source-less narrative prop — the only '
  + 'shape allowed to contribute 0 to a purchase ledger. A priced registry item that lost its price '
  + 'fails here rather than quietly discounting the kit',
  badUnpriced.length === 0, badUnpriced.map((r) => [r.name, r.unpriced]));
const overBudget = purse.filter((r) => r.over > 0);
check('BUDGET: no archetype spends more than 500 credits plus its RECORDED trade (eote p.97 / fad '
  + 'p.107 + the trade table) — this is Jason\'s 2026-09-20 line, and a future gear edit that busts a '
  + 'budget goes red here',
  overBudget.length === 0,
  overBudget.map((r) => ({ n: r.name, spend: r.spend, budget: r.budget, over: r.over })));
const purseOff = purse.filter((r) => r.stored !== r.want);
check('and the stored `equipment.credits` IS the remainder — `500 + trade - spend`, the same arithmetic '
  + '`charResolve.js`:1480 runs on the surface. The identity, not the inequality: a kit that grew '
  + 'without the purse shrinking would keep passing the budget arm while the money stopped adding up',
  purseOff.length === 0,
  purseOff.map((r) => ({ n: r.name, stored: r.stored, want: r.want, spend: r.spend, budget: r.budget })));
check('and the budget arms are NON-VACUOUS — ' + purse.reduce((a, r) => a + r.priced, 0) + ' priced '
  + 'entries across ' + purse.length + ' records totalling ' + purse.reduce((a, r) => a + r.spend, 0)
  + ' credits, with ' + purse.filter((r) => r.spend > CREDIT_BUDGET).length + ' kits costing more than '
  + 'the bare 500, so the budget is a ceiling the data actually presses against',
  purse.every((r) => r.priced > 0) && purse.some((r) => r.spend > CREDIT_BUDGET),
  purse.filter((r) => r.priced === 0).map((r) => r.name));

// ── B-703 · EVERY SHIPPED SUIT IS WORN, AND THE PRINTED SOAK IS WHY ─────────────────────────────
// All eighteen armour entries shipped as `{id}` with no `state`, so `deriveItemState` fell through
// to 'carried': a Quick Start character arrived with their suit UNWORN, the pack's PROTECTION head
// read "1 carried", and `computeEncumbrance` charged the full profile instead of the RAW reduction
// (EotE p.168: worn armor counts 3 less encumbrance). Measured before the
// fix: Kaelen Dray carried 7 against a limit of 6 — over-encumbered on arrival — and 5 of 6 once
// the suit is worn. Same defect as B-699, one layer out: the assembly was fixed there, the shipped
// data here.
//
// THE EVIDENCE THAT IT IS WORN AND NOT CARRIED IS THE CHARACTER'S OWN PRINTED SOAK. Each folio
// prints a soak that already INCLUDES the armour, so `derived.soak === Brawn + <registry soak>` is
// the stat block saying the suit is on. A suit whose soak were absent from the printed number would
// be genuinely carried and would keep its bare `{id}`; this arm is what would tell us, per entry,
// rather than a blanket assumption. Both sides are DERIVED — the soak from `armor.json`, the Brawn
// from the character — so a registry change moves the expectation instead of rotting a typed number.
console.log('\n── B-703 the shipped suits ──');
const _armorRows = PREGENS.map((p) => {
  const a = ((p.equipment || {}).armor) || null;
  const rec = a && a.id ? ARMOR[a.id] : null;
  const brawn = Number(((p.characteristics || {}).brawn)) || 0;
  const regSoak = rec ? (Number(rec.soak) || 0) : null;
  return {
    name: p.name, id: a && a.id, state: a ? a.state : undefined,
    printed: Number(((p.derived || {}).soak)),
    brawn: brawn, regSoak: regSoak,
    want: regSoak === null ? null : brawn + regSoak,
  };
});
check('B-703: every archetype ships an armour entry that RESOLVES against armor.json',
  _armorRows.every((r) => r.id && r.regSoak !== null),
  _armorRows.filter((r) => !r.id || r.regSoak === null));
check('B-703: every archetype\'s armour entry carries an EXPLICIT state — no fall-through to '
  + '\'carried\' (' + _armorRows.filter((r) => r.state).length + ' of ' + _armorRows.length + ')',
  _armorRows.every((r) => typeof r.state === 'string' && r.state.length > 0),
  _armorRows.filter((r) => !r.state).map((r) => ({ n: r.name, id: r.id })));
check('B-703: and every state is one the resolver reads (worn · carried · stowed)',
  _armorRows.every((r) => ['worn', 'carried', 'stowed'].indexOf(r.state) >= 0),
  _armorRows.filter((r) => ['worn', 'carried', 'stowed'].indexOf(r.state) < 0)
    .map((r) => ({ n: r.name, state: r.state })));
// The arm that JUSTIFIES the state, per entry, from the folio's own arithmetic.
const _soakOff = _armorRows.filter((r) => r.want !== null && r.printed !== r.want);
check('B-703: every archetype\'s PRINTED soak equals Brawn + the registry\'s armour soak — the '
  + 'stat block wearing the suit, derived from armor.json and never typed ('
  + (_armorRows.length - _soakOff.length) + ' of ' + _armorRows.length + ')',
  _soakOff.length === 0,
  _soakOff.map((r) => ({ n: r.name, printed: r.printed, brawn: r.brawn, soak: r.regSoak })));
check('B-703: so every entry is marked WORN, and each one\'s soak is inside its printed soak — an '
  + 'entry whose soak were absent would be genuinely carried and is named here, not assumed',
  _armorRows.every((r) => r.state !== 'worn' || r.printed === r.want),
  _armorRows.filter((r) => r.state === 'worn' && r.printed !== r.want)
    .map((r) => ({ n: r.name, printed: r.printed, want: r.want })));
// NON-VACUITY. "printed === brawn + soak" is only a claim about the ARMOUR while the armour's soak
// is non-zero; a registry of 0-soak suits would satisfy it without saying anything.
check('B-703: the soak arm is NON-VACUOUS — every shipped suit has a soak > 0, so Brawn alone '
  + 'cannot satisfy the equality',
  _armorRows.every((r) => (r.regSoak || 0) > 0),
  _armorRows.filter((r) => !(r.regSoak > 0)).map((r) => ({ n: r.name, id: r.id, soak: r.regSoak })));

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   B-733 · THE XP LEDGER, DERIVED FROM EACH RECORD'S OWN CONTENT
   `character-math-audit` §3.1 (finding 2) + §5.7 (finding 14). The derivation is written here, in
   the open, for the same reason the shelf reconciler writes its own: the creator's own spend path
   (`normalizeCreated`, charResolve.js) is GRACEFUL and a reconciler cannot be.
══════════════════════════════════════════════════════════════════════════════════════════════ */
console.log('\n── B-733 the XP ledger ──');

const CHARS = ['brawn', 'agility', 'intellect', 'cunning', 'willpower', 'presence'];

// The BASIC power's cost, off the power's own tree — row 0's `<id>basic` cell. fad p.102 Table 2-2
// prints it per-power and `force_powers.json` carries it, so nothing here is typed.
function basicPowerCost(pid) {
  const p = FORCE_POWERS[pid];
  if (!p || !Array.isArray(p.tree) || !p.tree[0]) return null;
  const cells = p.tree[0].cells || [];
  const cell = cells.find((c) => /basic$/.test(c.ability || '')) || cells[0];
  return cell ? (Number(cell.cost) || 0) : null;
}
// The row a talent sits on in a given specialization tree; row 0 costs 5, row N costs (N+1)*5.
function talentRowIn(specId, tid) {
  const s = SPECS[specId];
  if (!s) return null;
  let row = null;
  (s.talent_tree || []).forEach((r, ri) => (r.talents || []).forEach((c) => {
    if (c && c.talent === tid && row === null) row = ri;
  }));
  return row;
}

const ledger = PREGENS.map((p) => {
  const sp = speciesOf(p);
  const cid = p.careerId || Object.keys(CAREERS).find((k) => (CAREERS[k].name || '').toLowerCase() === (p.career || '').toLowerCase());
  const car = cid ? CAREERS[cid] : null;
  const specId = (p.specializationIds || [])[0];
  const spec = SPECS[specId];

  // characteristics — 10 x each rank above the SPECIES base, per rank (eote p.101)
  let chrCost = 0;
  CHARS.forEach((a) => {
    const base = Number((sp.characteristics || {})[a]) || 0;
    const cur = Number((p.characteristics || {})[a]) || 0;
    for (let r = base + 1; r <= cur; r++) chrCost += r * 10;
  });

  // the row-0 talent — (row + 1) x 5
  const t0 = (p.talents || [])[0];
  const t0row = t0 ? talentRowIn(specId, t0.id) : null;
  const talentCost = (t0row === null) ? null : (t0row + 1) * 5;

  // the basic Force power, where the record owns one (fad p.103: never free, always purchased)
  const power = (p.forcePowers || [])[0];
  const powerCost = power ? basicPowerCost(power.id) : 0;

  // skills — every rank above the free allowance, at the CHEAPEST legal price. The allowance is the
  // career's free ranks + 2 from the first specialization + the species' own starting skills
  // (fad p.43-44 gives FaD careers THREE of six and the first specialization TWO of four; eote p.93
  // gives EotE/AoR careers four of eight — `careers.json`'s `free_ranks` carries whichever applies,
  // so the line is not typed here). Creation caps a skill at rank 2, and every shipped rank on this
  // roster is in a CAREER skill, so the cheapest excess is 5 x its rank.
  const bonus = sp.bonus_free_ranks || {};
  const speciesStart = (sp.starting_skills || []).map((g) => (g && g.skill) || g);
  const allowance = ((car ? (car.free_ranks || 4) : 4) + (bonus.career || 0))
    + (2 + (bonus.spec || 0))
    + speciesStart.length;
  const ranks = Object.values(p.skills || {}).reduce((a, b) => a + b, 0);
  const excess = Math.max(0, ranks - allowance);
  const careerSkills = new Set([].concat((car && car.career_skills) || [], (spec && spec.career_skills) || []));
  const nonCareer = Object.keys(p.skills || {}).filter((k) => !careerSkills.has(SKILL_ALIAS[k] || k));
  const skillCost = excess * 5;       // cheapest legal: a rank-1 CAREER skill

  // The trade's XP, DERIVED from the recorded `mechanicTradeIds` through the shipped table — never
  // read as a typed number off the record (one resolution per quantity).
  const trade = TRADE[p.id].xpDelta;
  const pool = (Number(sp.starting_xp) || 0) + trade;
  const derivedSpent = chrCost + (talentCost || 0) + (powerCost || 0) + skillCost;

  return {
    id: p.id, name: p.name, species: sp.name, speciesId: p.speciesId,
    chrCost, t0: t0 && t0.id, t0row, talentCost, power: power && power.id, powerCost,
    ranks, allowance, excess, skillCost, nonCareer,
    pool, trade, derivedSpent, storedSpent: (p.xp || {}).spent, storedTotal: (p.xp || {}).total,
    storedRemaining: (p.xp || {}).remaining,
    deltaSpent: derivedSpent - ((p.xp || {}).spent || 0),
    overPool: derivedSpent - pool,
  };
});

// THE TABLE, printed whether green or red, because a reader checking a DECLARED entry should not
// have to run a separate script to see the numbers it waives.
console.log('  id             species       pool  chr  tal  pow  skl | derived stored   Δ  |  over pool');
ledger.forEach((r) => console.log('  ' + String(r.id).padEnd(14) + ' ' + String(r.species).padEnd(13) + ' '
  + String(r.pool).padEnd(5) + ' ' + String(r.chrCost).padEnd(4) + ' ' + String(r.talentCost).padEnd(4) + ' '
  + String(r.powerCost).padEnd(4) + ' ' + String(r.skillCost).padEnd(4) + '| ' + String(r.derivedSpent).padEnd(7)
  + ' ' + String(r.storedSpent).padEnd(7) + ' ' + String(r.deltaSpent).padEnd(3) + ' |  '
  + (r.overPool > 0 ? 'OVER by ' + r.overPool : '')));

const noPowerCost = ledger.filter((r) => r.power && (r.powerCost === null || r.powerCost === 0));
check('every basic Force power on the roster RESOLVES a cost out of `force_powers.json` — a power '
  + 'that priced at 0 would make "unpaid" unfalsifiable', noPowerCost.length === 0,
  noPowerCost.map((r) => [r.name, r.power]));
const noTalentRow = ledger.filter((r) => r.talentCost === null);
check('every archetype\'s first talent resolves a ROW in its own first specialization tree, so its '
  + 'price is derived and not assumed', noTalentRow.length === 0, noTalentRow.map((r) => [r.name, r.t0]));
const offCareer = ledger.filter((r) => r.nonCareer.length > 0);
check('every shipped skill rank is in a CAREER skill of the record\'s own career or first '
  + 'specialization, which is what makes 5/rank the cheapest legal price for an excess rank '
  + '(a non-career rank costs 5 more — fad p.102)', offCareer.length === 0,
  offCareer.map((r) => [r.name, r.nonCareer]));

// ── CLAIM 1 · BALANCE (finding 14) ──────────────────────────────────────────────────────────────
const unbalanced = ledger.filter((r) => Number(r.storedTotal) !== Number(r.storedSpent) + Number(r.storedRemaining));
check('BALANCE: `xp.total === xp.spent + xp.remaining` on all ' + PREGENS.length + ' — the invariant '
  + 'finding 14 records as asserted ONCE, at birth, on one creator fixture (creation_buyout.cjs:139) '
  + 'and at none of the five sheet-side mutation sites and not at load',
  unbalanced.length === 0, unbalanced.map((r) => [r.name, r.storedTotal, r.storedSpent, r.storedRemaining]));
const conventionOff = ledger.filter((r) => Number(r.storedTotal) !== Number(r.storedSpent));
check('and `xp.total === xp.spent` is the pick-and-play CONVENTION, asserted as the convention it is '
  + '(Jason 2026-07-30: nothing left to spend) — NOT as the species pool, which is a separate claim '
  + 'below. Stored totals run ' + Math.min.apply(null, ledger.map((r) => r.pool - r.storedTotal)) + '–'
  + Math.max.apply(null, ledger.map((r) => r.pool - r.storedTotal)) + ' XP under the pool by design',
  conventionOff.length === 0, conventionOff.map((r) => [r.name, r.storedTotal, r.storedSpent]));

// ── CLAIM 2 · SOLVENCY, and CLAIM 3 · FIDELITY — both DECLARED where they fail ──────────────────
const insolvent = ledger.filter((r) => r.overPool > 0).map((r) => r.name);
const infidelity = ledger.filter((r) => r.deltaSpent !== 0).map((r) => r.name);

/* ── THE DECLARED LIST (the c4dfdda1 device, reused) — NOW EMPTY, AND STILL ARMED ────────────────
   Each entry carries the EXACT measurement it waives and the options a human has. Four arms below:
   UNDECLARED (a divergence with no entry) · ORPHAN (an entry naming nobody this file walks) ·
   STALE (an entry whose divergence has closed) · DRIFT (an entry whose numbers have moved). The
   first three are `pregen_force_rating.cjs`'s, unchanged; DRIFT is added because these entries carry
   numbers, and a waiver still green after its number moved is covering something it does not name.

   EVERY ENTRY THIS LIST CARRIED IS DISCHARGED, on Jason's 2026-09-20 word. Kept here verbatim as the
   record of what was closed and by what, so the next reader does not have to dig for it:

     solvency  'Orin Vael'    was 95 derived against a Muun's 90 pool — CREATION-ILLEGAL.
                              CLOSED by fad p.49's `+5 starting XP and +1,000 starting credits`
                              (`fad_raw_xp5_cr1000`): pool 95, spend 95, and the +1,000 covers his 625
                              of overspend. It is the ONLY one of the five FaD options that closes both
                              — +10 XP leaves him 625 over on credits, +2,500 credits leaves him 5 over
                              on XP, and +-21 Morality gives neither.
     fidelity  'Tidal'        was 90 derived against 75 stored (unpaid Heal/Harm, 15 XP) — CLOSED,
                              charged: xp.spent/total 90.
               'Zara Koth'    was 85 against 75 (unpaid Sense, 10 XP) — CLOSED, charged to 85.
               'Orin Vael'    was 95 against 85 (unpaid Influence, 10 XP) — CLOSED, charged to 95.
               'Kiran Sol'    was 80 against 75 (an uncharged SIXTH skill rank, fad p.43-44's three
                              career + two spec free ranks) — CLOSED, charged to 80.
               'Renna Tide'   same shape — CLOSED, charged to 80.
               'Tovan Kade'   same shape — CLOSED, charged to 80.
     encumbr.  'Patch'        was carried 9 against a limit of 7 — CLOSED by Jason's "2. Can have a
                              container": a Backpack (`gear.json` `backpack`, 50 credits, encumbrance
                              0, `encumbrance_threshold_bonus` 4, `threshold_bonus_requires: carried`,
                              sourced eote/aor/fad) takes the limit to 11. Load-bearing gear (+3, 100
                              credits) would also clear him but is `sources: ["aor"]` on an Edge
                              character; a utility belt (+1) would not clear him at all.

   An empty list is not a weakened guard: the four arms measure INDEPENDENTLY of it, so the emptiness
   is a measured fact. Bite-checked with a fake entry in each arm after the emptying. */
const DECLARED = {
  solvency: {},
  fidelity: {},
  encumbrance: {},
};

check('SOLVENCY: no UNDECLARED archetype spends more than its species pool (declared: '
  + (Object.keys(DECLARED.solvency).join(', ') || 'none') + ')',
  insolvent.every((n) => !!DECLARED.solvency[n]),
  ledger.filter((r) => r.overPool > 0 && !DECLARED.solvency[r.name])
    .map((r) => ({ n: r.name, derived: r.derivedSpent, pool: r.pool, over: r.overPool })));
check('FIDELITY: no UNDECLARED archetype\'s derived spend differs from its stored `xp.spent` '
  + '(declared: ' + (Object.keys(DECLARED.fidelity).join(', ') || 'none') + ')',
  infidelity.every((n) => !!DECLARED.fidelity[n]),
  ledger.filter((r) => r.deltaSpent !== 0 && !DECLARED.fidelity[r.name])
    .map((r) => ({ n: r.name, derived: r.derivedSpent, stored: r.storedSpent, delta: r.deltaSpent })));

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   B-734 · EVERY ARCHETYPE IS INSIDE ITS ENCUMBRANCE THRESHOLD
   Driven through the app's own `computeEncumbrance` over registry-resolved equipment — the same
   function the pack head and the PDF export read, so this cannot disagree with the surface.
══════════════════════════════════════════════════════════════════════════════════════════════ */
console.log('\n── B-734 the encumbrance threshold ──');
function resolveForEncumbrance(p) {
  const a = (p.equipment || {}).armor || {};
  const ar = a.id ? ARMOR[a.id] : null;
  return {
    weapons: ((p.equipment || {}).weapons || []).map((e) =>
      Object.assign({}, WEAPONS[e.id] || {}, e, { state: e.state || 'carried' })),
    armor: ar ? Object.assign({}, ar, a, { state: a.state || 'carried' }) : null,
    // A SPARE SUIT is an ordinary inventory entry carrying an ARMOUR id-ref (R-ASS-1), so the gear
    // lane asks both registries — exactly as `resolveSheetEquipment` does. An entry that resolved in
    // neither would contribute 0 encumbrance and silently lighten the character; named below.
    gear: ((p.equipment || {}).gear || []).map((e) => {
      const rec = GEAR[e.id] || ARMOR[e.id] || null;
      return Object.assign({}, rec || {}, e, { state: e.state || 'carried', qty: e.qty || 1, _unresolved: !rec });
    }),
  };
}
const encRows = PREGENS.map((p) => {
  const resolved = resolveForEncumbrance(p);
  const e = CharResolve.computeEncumbrance(resolved, p.characteristics);
  return Object.assign({ id: p.id, name: p.name }, e, {
    unresolved: resolved.gear.filter((g) => g._unresolved).map((g) => g.id),
  });
});
console.log('  id             brawn limit carried over setbacks freeManLost  container');
encRows.forEach((r) => console.log('  ' + String(r.id).padEnd(14) + ' ' + String(r.brawn).padEnd(5) + ' '
  + String(r.limit).padEnd(5) + ' ' + String(r.carried).padEnd(7) + ' ' + String(r.over).padEnd(4) + ' '
  + String(r.setbacks).padEnd(9) + ' ' + String(r.freeManeuverLost).padEnd(12) + ' '
  + JSON.stringify(r.containerSources.map((s) => s.name + '+' + s.bonus)) + (r.over > 0 ? '   <<< OVER' : '')));

const unresolvedGear = encRows.filter((r) => r.unresolved.length);
check('every gear entry on the roster RESOLVES against `gear.json` or `armor.json` — an entry that '
  + 'resolved in neither would weigh 0 and lighten the character silently, which would make the '
  + 'threshold arm below pass for the wrong reason',
  unresolvedGear.length === 0, unresolvedGear.map((r) => [r.name, r.unresolved]));
const overEnc = encRows.filter((r) => r.over > 0).map((r) => r.name);
check('ENCUMBRANCE: no UNDECLARED archetype is over its threshold — 5 + Brawn + any container '
  + '(eote p.152 / p.168\'s worn reduction) (declared: '
  + (Object.keys(DECLARED.encumbrance).join(', ') || 'none') + ')',
  overEnc.every((n) => !!DECLARED.encumbrance[n]),
  encRows.filter((r) => r.over > 0 && !DECLARED.encumbrance[r.name])
    .map((r) => ({ n: r.name, carried: r.carried, limit: r.limit, over: r.over })));
// CONTAINERS ARE LOAD-BEARING, AND THIS ARM PROVES IT. Jason's "2. Can have a container" is what
// closed B-734, so the guard must be able to tell a roster that fits inside 5 + Brawn from one that
// fits only because of what it carries. Recomputed with the container bonus removed: the records that
// would then go over are exactly the ones a container is doing real work for.
const needContainer = encRows.filter((r) => r.carried > (r.limit - (r.containerBonus || 0)))
  .map((r) => ({ n: r.name, carried: r.carried, bare: r.limit - (r.containerBonus || 0), withContainer: r.limit }));
check('and the container bonus is LOAD-BEARING on ' + needContainer.length + ' of ' + encRows.length
  + ' records (' + JSON.stringify(needContainer.map((r) => r.n)) + ') — so the threshold arm above is '
  + 'not passing because every kit happens to fit inside 5 + Brawn. Patch is here by design: his '
  + 'Backpack (+4) is what takes 9 against 7 to 9 against 11',
  needContainer.length > 0 && needContainer.some((r) => r.n === 'Patch'), needContainer);
check('and the threshold arm is NON-VACUOUS — the roster actually carries weight (total '
  + encRows.reduce((a, r) => a + r.carried, 0) + ' encumbrance across ' + encRows.length
  + ' records, ' + encRows.filter((r) => r.carried > 0).length + ' of them non-zero), so a roster '
  + 'that resolved to nothing could not satisfy it',
  encRows.filter((r) => r.carried > 0).length === encRows.length,
  encRows.filter((r) => r.carried === 0).map((r) => r.name));

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   §3.4 · RIGHT MATHS THAT NOTHING WATCHED — the row-0 rule and the two creation caps
══════════════════════════════════════════════════════════════════════════════════════════════ */
console.log('\n── §3.4 the unasserted invariants ──');

// THE CONNECTION RULE. A starting character's talents must be reachable, and row 0 always is
// (any talent in the top row may be picked, eote p.93). All eighteen sit on row 0
// and nothing said so. Two separate claims: the ROW, and that the stored `talents[0].id` is the
// talent standing at the record's own owned POSITION — a projection that could drift apart.
const rowRows = PREGENS.map((p) => {
  const specId = (p.specializationIds || [])[0];
  const spec = SPECS[specId];
  const t0 = (p.talents || [])[0];
  const owned0 = ((p.specializations || [])[0] || {}).owned || [];
  const cellId = (pos) => {
    const m = /^(\d+)-(\d+)$/.exec(String(pos || ''));
    if (!m || !spec) return null;
    const row = (spec.talent_tree || [])[Number(m[1])];
    const cell = row && (row.talents || [])[Number(m[2])];
    return cell ? cell.talent : null;
  };
  return {
    name: p.name, specId, t0: t0 && t0.id, owned: owned0,
    rows: owned0.map((o) => Number((/^(\d+)-/.exec(String(o)) || [])[1])),
    atPositions: owned0.map(cellId),
  };
});
const offRow0 = rowRows.filter((r) => !r.rows.length || r.rows.some((n) => n !== 0));
check('CONNECTION RULE: every owned talent position on every archetype is on ROW 0 of its own first '
  + 'specialization — the only row a starting character can always reach (eote p.93). True 18/18 '
  + 'and unasserted until now; a record placed deeper would be unbuildable and would still ship',
  offRow0.length === 0, offRow0.map((r) => [r.name, r.owned]));
const projMismatch = rowRows.filter((r) => r.atPositions.indexOf(r.t0) < 0);
check('and each archetype\'s stored `talents[0].id` IS the talent standing at one of its own owned '
  + 'POSITIONS — `talents` is a projection rewritten from the owned set, so the two can drift and '
  + 'the sheet would render the stale list beside a fresh tree',
  projMismatch.length === 0, projMismatch.map((r) => [r.name, r.t0, r.atPositions]));
const unknownCell = rowRows.filter((r) => r.atPositions.some((x) => x === null));
check('and every owned POSITION resolves to a real cell in that tree, so the arm above cannot pass '
  + 'by comparing two absences', unknownCell.length === 0, unknownCell.map((r) => [r.name, r.owned]));

// THE TWO CREATION CAPS (eote p.92 / fad p.102): nothing above characteristic 5, nothing above
// skill rank 2. Both true on all eighteen and both unasserted.
const overChar = [];
PREGENS.forEach((p) => CHARS.forEach((a) => {
  const v = Number((p.characteristics || {})[a]) || 0;
  if (v > 5) overChar.push([p.name, a, v]);
}));
check('CREATION CAP: no characteristic above 5 on any archetype (eote p.92 / fad p.102) — the '
  + 'in-play cap is 6 via Dedication, so a 6 here would be a character nobody could have BUILT',
  overChar.length === 0, overChar);
const overSkill = [];
PREGENS.forEach((p) => Object.entries(p.skills || {}).forEach(([k, v]) => {
  if (Number(v) > 2) overSkill.push([p.name, k, v]);
}));
check('CREATION CAP: no skill above rank 2 on any archetype (eote p.92 / fad p.102) — and it is '
  + 'the same cap the excess-rank pricing above assumes, so the two cannot disagree',
  overSkill.length === 0, overSkill);
const atCap = [];
PREGENS.forEach((p) => Object.entries(p.skills || {}).forEach(([k, v]) => { if (Number(v) === 2) atCap.push([p.name, k]); }));
check('and the skill cap is NON-VACUOUS — ' + atCap.length + ' ranks on this roster sit AT the cap '
  + '(' + JSON.stringify(atCap.slice(0, 6)) + '…), so it is a ceiling the data actually touches '
  + 'rather than one nothing approaches', atCap.length > 0, atCap.length);

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   THE STALENESS ARMS — the c4dfdda1 device (`pregen_force_rating.cjs`), reused, plus DRIFT.
   A waiver that outlives its subject is a permanent hole under a name; that is how 'Dao Jodh' and
   'Wicket' sat in the sibling guard covering nothing at all. The measurements below happen
   INDEPENDENTLY of the DECLARED list — an arm cannot tell a closed hole from an open one otherwise.
══════════════════════════════════════════════════════════════════════════════════════════════ */
console.log('\n── the DECLARED list\'s staleness arms ──');
const walked = PREGENS.map((p) => p.name);
const MEASURED = {
  solvency: insolvent,
  fidelity: infidelity,
  encumbrance: overEnc,
};
const DRIFT_FIELDS = {
  solvency: (name) => { const r = ledger.find((x) => x.name === name); return r && { derivedSpent: r.derivedSpent, pool: r.pool }; },
  fidelity: (name) => { const r = ledger.find((x) => x.name === name); return r && { derivedSpent: r.derivedSpent, storedSpent: r.storedSpent }; },
  encumbrance: (name) => { const r = encRows.find((x) => x.name === name); return r && { carried: r.carried, limit: r.limit }; },
};
const orphaned = [], stale = [], drifted = [];
Object.keys(DECLARED).forEach((claim) => {
  Object.keys(DECLARED[claim]).forEach((name) => {
    if (walked.indexOf(name) < 0) { orphaned.push([claim, name]); return; }
    if (MEASURED[claim].indexOf(name) < 0) { stale.push([claim, name]); return; }
    const now = DRIFT_FIELDS[claim](name), was = DECLARED[claim][name];
    Object.keys(now).forEach((k) => { if (now[k] !== was[k]) drifted.push([claim, name, k, 'declared ' + was[k], 'measured ' + now[k]]); });
  });
});
check('no DECLARED name is an ORPHAN — a waiver must name a record this file walks ' +
  '(\'Dao Jodh\' was one in the sibling guard, naming a character retired 2026-07-30)',
  orphaned.length === 0, orphaned);
check('no DECLARED entry is STALE — a name whose divergence has CLOSED comes off the list '
  + '(\'Wicket\' had, in the sibling guard, for a discrepancy that no longer existed)',
  stale.length === 0, stale);
check('no DECLARED entry has DRIFTED — each carries the exact numbers it waives, so a waiver that '
  + 'stayed green while its subject moved is refused instead of silently covering something else',
  drifted.length === 0, drifted);
check('the arms are NON-VACUOUS — walked roster ' + walked.length + ', measured divergences '
  + JSON.stringify({ solvency: insolvent, fidelity: infidelity, encumbrance: overEnc })
  + ', so an empty or a full DECLARED list is a FACT and not a skip',
  walked.length === PREGENS.length && PREGENS.length > 0
  && Object.keys(MEASURED).every((k) => Array.isArray(MEASURED[k])),
  { walked: walked.length, MEASURED });
console.log('  DECLARED, pending Jason: '
  + Object.keys(DECLARED).map((c) => c + ' [' + (Object.keys(DECLARED[c]).join(', ') || 'EMPTY') + ']').join(' · '));

console.log('');
if (failures) { console.error('quick_start_legality: ' + failures + ' FAILED'); process.exit(1); }
console.log('quick_start_legality: ALL PASS');
