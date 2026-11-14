/*
 * talent_view_epoch_keys.cjs — A3-2's census (ruling `f100-m5-contracts` ADDENDUM 3; HANDOFF `f100-talent-view-shared`):
 * "Every surface on either host that shows a character's talent numbers or dice keys its memos on the same epoch
 * (C4's epoch key; B-844's lesson), so an own-pack edit on that device moves it."
 *
 * Static, over the sources. A MEMO over a character's talent numbers or dice is a `React.useMemo` whose body calls
 * `collectPoolMods(` (the dice — carried items' and owned talents', through the stamp view), `computeDerived(` (the
 * numbers) or `sheetTalentTiers(` (the tiers). Each must name `_tvEpoch` in its deps, and its component must take
 * `_tvEpoch` from the ONE shared hook (window.SWRPGTalentView.useTalentViewEpoch). The Ship Yard draws a character's seat
 * dice at render, with no memo, inside two shared rooms on both hosts; each room subscribes to the epoch, so an edit
 * re-renders it. The GM app holds no memo of its own over a character's numbers — asserted, so one that appears later
 * enters this census.
 *
 * What it cannot see: whether the re-run memo reaches the screen. `scripts/probe_talent_view_epoch_memo.py` reads the
 * live memo after an own-pack edit; the rendered pool is blocked by a separate, pre-existing defect that
 * `scripts/probe_pack_change_drops_pool_dice.py` measures (registries dropped on any pack change).
 * BITE: drop `_tvEpoch` from any one census memo's deps → exit 1.
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let pass = 0, fail = 0;
const check = (ok, label, detail) => { if (ok) { pass++; console.log('  PASS  ' + label); } else { fail++; console.log('  FAIL  ' + label + (detail ? '  ->  ' + detail : '')); } };

// the top-level function a line sits in (these sources declare components at column 0)
function componentAt(lines, i) { for (let j = i; j >= 0; j--) { const m = /^function ([A-Za-z0-9_$]+)\s*\(/.exec(lines[j]); if (m) return { name: m[1], at: j }; } return null; }
function bodyOf(lines, c) { let k = c.at + 1; while (k < lines.length && !/^}\s*$/.test(lines[k])) k++; return lines.slice(c.at, k + 1).join('\n'); }
const HOOK_RE = /var _tvEpoch = window\.SWRPGTalentView\.useTalentViewEpoch\(\);/;
const MEMO_RE = /React\.useMemo\(function\s*\(\)\s*\{\s*return (?:CharResolve\.computeDerived|collectPoolMods|sheetTalentTiers)\(/;

// D-507 (handoff `encounters-e3-dicehub-move`): DiceHub moved VERBATIM to lib/shared/diceHub.jsx (column 0 inside its IIFE), so the
// census reads that file too — each file on its own, its components by their own column-0 declarations. 3190960e2 (CONTRACT 3, the
// sheet-less window) wrapped DiceHub's collect in `sheet ? … : []`; MEMO_RE admits that one guard, the memo and its deps unchanged.
const MEMO_RE_HUB = /React\.useMemo\(function\s*\(\)\s*\{\s*return (?:sheet \? )?(?:CharResolve\.computeDerived|collectPoolMods|sheetTalentTiers)\(/;
console.log('A3-2 — THE EPOCH CENSUS (player/app.jsx, lib/shared/diceHub.jsx, lib/shared/vesselView.jsx, gm/app.jsx)');
const app = read('player/app.jsx').split('\n');
const kinds = { collectPoolMods: 0, computeDerived: 0, sheetTalentTiers: 0 };
[['player/app.jsx', app, MEMO_RE], ['lib/shared/diceHub.jsx', read('lib/shared/diceHub.jsx').split('\n'), MEMO_RE_HUB]].forEach(([file, src, re]) => {
  const memos = [];
  src.forEach((l, i) => { if (re.test(l)) memos.push(i); });
  for (const i of memos) {
    const l = src[i], c = componentAt(src, i);
    const kind = /collectPoolMods\(/.test(l) ? 'collectPoolMods' : /computeDerived\(/.test(l) ? 'computeDerived' : 'sheetTalentTiers';
    kinds[kind]++;
    const deps = /\}, \[([^\]]*)\]\);/.exec(l);
    check(!!deps && /(^|,\s*)_tvEpoch(\s*,|$)/.test(deps[1].trim()), `${file}:${i + 1} ${c ? c.name : '?'} — its ${kind} memo keys on _tvEpoch`, deps ? '[' + deps[1] + ']' : 'no deps array on the line');
    check(!!c && HOOK_RE.test(bodyOf(src, c)), `  …and ${c ? c.name : '?'} takes _tvEpoch from the shared hook`);
  }
});
// non-vacuity: the census found the memos A3-2 names (C4.6's three derived memos and the tiers; this lap's six dice memos)
// RE-POINTED (N-post, lap paper-sheet-delete PART 2, 2026-09-30; the merge of carry b57615fd). The claim before: 6 dice
// memos · 3 derived-number memos · 1 tiers memo, counted at b57615fd, where four of them lived in the old CharacterSheet
// face's components — PlayerSkillGrid's and SheetSkills' collectPoolMods, SheetCombat's and SheetLoadout's computeDerived.
// The lap deleted those four components (census §2.1–§2.5), and the merge resolved JOB 3b's hunks in them by deletion
// (card ADDENDUM 2). After: the surviving census, 4 · 1 · 1 — DiceHub, SheetVesselsS4, SheetStage, SheetStack ·
// SheetPaper · SheetAbilitiesRoom. KEPT: the check label word for word, every per-memo _tvEpoch check, the exact-count
// form (a memo added or lost still reads red). DROPPED: the four deleted components' memos (no subject left to key).
// RE-POINTED (f100-surfacing-sheet-build, ruling f100-surfacing-sheet-concept ADDENDUM 10 C3 (a)): SheetStack's WEAPONS card
// draws the weapon's own pool through SWRPGSheetPool.weaponPoolOf at render (the hub row's one builder, which collects the
// dice itself), so its collectPoolMods memo — the old SKILL-pool preview's — left with the preview: 4 → 3 dice memos (DiceHub,
// SheetVesselsS4, SheetStage). KEPT: the label word for word, the exact-count form, every per-memo check. ADDED: SheetStack
// still takes _tvEpoch from the shared hook, so a new stamp-view epoch re-renders the cards' pools.
check(kinds.collectPoolMods === 3 && kinds.computeDerived === 1 && kinds.sheetTalentTiers === 1,
  `non-vacuity: 6 dice memos, 3 derived-number memos, 1 tiers memo (found ${kinds.collectPoolMods} · ${kinds.computeDerived} · ${kinds.sheetTalentTiers})`);
{ const ss = app.findIndex((l) => /^function SheetStack\(p\)/.test(l));
  check(ss >= 0 && HOOK_RE.test(bodyOf(app, { name: 'SheetStack', at: ss })) && /SWRPGSheetPool\.weaponPoolOf\(/.test(bodyOf(app, { name: 'SheetStack', at: ss })),
    'SheetStack draws its weapon pools at render (weaponPoolOf) and takes _tvEpoch from the shared hook (a new epoch re-renders them)'); }
// the Yard's two rooms draw seat dice (seatDice → the host's charPool) at render, on both hosts
const vv = read('lib/shared/vesselView.jsx').split('\n');
for (const room of ['YardHangar', 'YardShip']) {
  const at = vv.findIndex((l) => new RegExp('^  function ' + room + '\\(props\\) \\{').test(l));
  let end = at + 1; while (end < vv.length && !/^  }\s*$/.test(vv[end])) end++;
  const body = at >= 0 ? vv.slice(at, end + 1) : [];
  const hook = body.findIndex((l) => /TV\.useTalentViewEpoch\(\)/.test(l));
  const firstReturn = body.findIndex((l) => /^\s{4}(if \(.*\) )?return\b/.test(l));
  check(at >= 0 && hook > 0, `lib/shared/vesselView.jsx ${room} subscribes to the epoch (an own-pack edit re-renders its seat dice)`);
  check(hook > 0 && (firstReturn < 0 || hook < firstReturn), `  …before its first return (a hook every render calls)`, `hook at +${hook}, first return at +${firstReturn}`);
  check(body.some((l) => /charPool: props\.charPool/.test(l)), `  …and ${room} is a room that hands its seats the host's charPool (non-vacuity)`);
}
const gm = read('gm/app.jsx');
check(!/React\.useMemo\([^\n]*(computeDerived|collectPoolMods|sheetTalentTiers)\(/.test(gm) && !/\buseMemo\([^\n]*(computeDerived|collectPoolMods)\(/.test(gm),
  'gm/app.jsx holds no memo of its own over a character\'s talent numbers or dice (its PCs are drawn by the shared Yard rooms)');

console.log(`\ntalent_view_epoch_keys: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
