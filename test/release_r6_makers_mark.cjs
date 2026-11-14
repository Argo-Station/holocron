#!/usr/bin/env node
/**
 * release_r6_makers_mark.cjs — ruling `release-r6-rewards-c0` R-R6RC-3 and rider 2: a Maker's Mark's discount is LIVE in
 * craftStore's one row-cost read, cheaper for the HOLDER and the printed price for anyone else.
 *
 * THE PRINTED RULE (Fully Operational p.96, read through the rules index at this lap): "For all future crafting checks,
 * the character reduces the [Advantage] cost of this benefit by one, to a minimum of one." No Triumph alternative is
 * printed (silent, reported).
 *
 *   M1  craftStore's MARK_LESS / MARK_FLOOR equal rewards.json MAKERSMARK's effect (advantage_less 1, advantage_floor 1).
 *   M2  the attested row (`IMPARMLESSON` = armor_lessons_learned, Keeping the Peace p.91, req [AD][AD] or [TR]): for a
 *       holder whose MAKERSMARK row names it, costOf reads [AD] or [TR]; for another character, the printed [AD][AD] or [TR].
 *   M3  the price is the price PAID: spendLedger with one Advantage pays the row for the holder and leaves it unpaid for
 *       anyone else; affordableFrom and affordable agree.
 *   M4  the floor: a marked row priced at one Advantage stays at one; a Triumph-only alternative is untouched.
 *   M5  the row is not rewritten: the index's row and its tier (the grade's cost ladder) are the printed ones.
 *   M6  a stray `improvement` on a non-MAKERSMARK row gives no discount.
 *   BITE  MARK_LESS set to 0 in a mutated copy of the store → M2/M3 red, exit 1.
 *
 * Run: node test/release_r6_makers_mark.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const STORE = process.env.R6_MM_STORE || path.join(ROOT, 'lib/shared/craftStore.js');
const C = require(STORE);
const SPEND = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical/crafting_spend.json'), 'utf8'));
const REW = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/canonical/rewards.json'), 'utf8'));

let failures = 0;
function check(ok, msg, detail) {
  if (ok) console.log('  PASS  ' + msg);
  else { failures += 1; console.log('  FAIL  ' + msg + (detail !== undefined ? '  — ' + JSON.stringify(detail).slice(0, 300) : '')); }
}
const J = (v) => JSON.stringify(v);
const mark = (improvement, key) => ({ rewards: [{ id: 'rwd-m', key: key || 'MAKERSMARK', tier: 'MMAB1OP1', name: 'Teth works', level: null, skills: [], xp: 0, talent: null, improvement: improvement }] });

// M1
const fx = REW.types.MAKERSMARK.effect;
check(C.MARK_LESS === fx.advantage_less && C.MARK_FLOOR === fx.advantage_floor && C.MARK_LESS === 1 && C.MARK_FLOOR === 1,
  'M1: the store\'s discount equals rewards.json MAKERSMARK (one less, minimum one)', { store: [C.MARK_LESS, C.MARK_FLOOR], reg: fx });

// M2
const index = C.indexSpend(SPEND, 'armor');
const e = index.armor_lessons_learned;
check(e && J(e.row.req) === J([{ ad: 2 }, { tr: 1 }]) && e.row.ogg_key === 'IMPARMLESSON', 'fixture: armor_lessons_learned is IMPARMLESSON at [AD][AD] or [TR]', e && e.row);
const holder = mark('armor_lessons_learned'), other = { rewards: [] };
check(J(C.costOf(e.row, holder)) === J([{ ad: 1 }, { tr: 1 }]), 'M2: for the holder it costs [AD] or [TR]', C.costOf(e.row, holder));
check(J(C.costOf(e.row, other)) === J(e.row.req) && J(C.costOf(e.row)) === J(e.row.req), 'M2: for anyone else (or no holder) the printed price');

// M3
const tally = { ad: 1, tr: 0 };
const paidH = C.spendLedger(['armor_lessons_learned'], index, tally, undefined, undefined, holder);
const paidO = C.spendLedger(['armor_lessons_learned'], index, tally, undefined, undefined, other);
check(J(paidH.paid) === '["armor_lessons_learned"]' && paidH.remaining.ad === 0, 'M3: one Advantage pays the row for the holder', paidH);
check(J(paidO.unpaid) === '["armor_lessons_learned"]' && paidO.remaining.ad === 1, 'M3: one Advantage does not pay it for anyone else', paidO);
check(C.affordableFrom(e.row, tally, undefined, holder) === true && C.affordableFrom(e.row, tally, undefined, other) === false
  && C.affordable(e.row, tally, undefined, holder) === true && C.affordable(e.row, tally) === false, 'M3: affordableFrom and affordable agree');

// M4
const oneAd = Object.keys(index).map((k) => index[k].row).find((r) => (r.req || []).some((a) => a.ad === 1));
check(oneAd && C.costOf(oneAd, mark(oneAd.id)).every((a, i) => a.ad == null || a.ad === 1) && C.costOf(oneAd, mark(oneAd.id)).length === oneAd.req.length,
  'M4: a marked row at one Advantage stays at one (' + (oneAd && oneAd.id) + ')');
check(C.costOf(e.row, holder)[1].tr === 1 && !('ad' in C.costOf(e.row, holder)[1]), 'M4: the Triumph alternative is untouched');

// M5
check(J(index.armor_lessons_learned.row.req) === J([{ ad: 2 }, { tr: 1 }]) && C.tierOf(e.row) === 2, 'M5: the row and its tier (2) stay as printed');

// M6
check(J(C.costOf(e.row, mark('armor_lessons_learned', 'ALLY'))) === J(e.row.req), 'M6: a stray improvement on a non-MAKERSMARK row gives no discount');

// BITE
if (!process.env.R6_MM_STORE) {
  const src = fs.readFileSync(path.join(ROOT, 'lib/shared/craftStore.js'), 'utf8');
  const cut = 'var MARK_LESS = 1, MARK_FLOOR = 1;';
  if (src.indexOf(cut) === -1) { failures += 1; console.log('  FAIL  BITE: the constant line is not in the store'); }
  else {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r6mm-'));
    // the store requires its siblings by relative path: copy them beside the mutant
    for (const f of fs.readdirSync(path.join(ROOT, 'lib/shared'))) if (f.endsWith('.js')) fs.copyFileSync(path.join(ROOT, 'lib/shared', f), path.join(dir, f));
    fs.writeFileSync(path.join(dir, 'craftStore.js'), src.replace(cut, 'var MARK_LESS = 0, MARK_FLOOR = 1;'));
    const r = spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { R6_MM_STORE: path.join(dir, 'craftStore.js') }), encoding: 'utf8' });
    fs.rmSync(dir, { recursive: true, force: true });
    check(r.status === 1 && /FAIL  M2: for the holder/.test(r.stdout) && /FAIL  M3: one Advantage pays/.test(r.stdout),
      'BITE: no discount in the store → M2 and M3 red, exit 1', { status: r.status });
  }
}

console.log(failures ? '\n' + failures + ' FAILED' : '\nall passed');
process.exit(failures ? 1 : 0);
