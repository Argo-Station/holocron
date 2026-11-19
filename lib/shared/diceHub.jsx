/* lib/shared/diceHub.jsx — the dice window (DiceHub) and what it needs, lifted out of player/app.jsx (D-507; ruling
 * `encounters-e3-screens` ADDENDUM 15, handoff `encounters-e3-dicehub-move`), so the GM pages can open it too.
 *
 * MOVED WHOLE AND VERBATIM: 68 top-level declarations of DiceHub's closure (the DiceHub* / diceHub* / DICE_HUB* family,
 * the weapon-pool and treat readers, the M7/M8 hub lines, useDragWindow, DiceReferenceBody). Each is defined here ONCE and
 * player/app.jsx reads it as SWRPGDiceHub.<name> (CONTRACT 2). window.SWRPGDiceHub = { <every moved name> }.
 * Compiled classic-script transform (build.mjs) → loads after /vendor.js (React, SWRPGUI) and after lib/shared/sheetPool.js.
 * The player loads it as the FIRST file of its 'sheet' part (player/app.jsx PLAYER_PARTS), so first paint is unchanged
 * and every sheet-chunk reader runs after it; the GM shell loads it as a deferred script.
 *
 * THE HOST SEAM (CONTRACT 3). Three kinds of name the moved bodies read, bound below and nowhere re-defined:
 *   ALREADY-SHARED  read off a module both shells load (SWRPGSheetPool, SWRPGUI, ItemResolve, React).
 *   HANDED-IN       the player's own readers, which stay where they live in player/app.jsx; the player publishes them
 *                   as window.SWRPGDiceHubHost at first paint (before this file can load). Every one is reached ONLY on a
 *                   SHEET path, so a window opened with `given` and no `sheet` (the GM's NPC roll) calls none of them:
 *                   no canonical, charbuild or rewards load (R-E3S-4; test/dicehub_module_sheetless.cjs).
 */
(function () {

var h = React.createElement;

// ── ALREADY-SHARED: the sheet's dice path (lib/shared/sheetPool.js; R-S4PP-1), bound by the same names ──
// The player loads sheetPool.js at boot, so the names bind as this file runs. The GM loads it LATE, with the Yard's character
// core (gm/app.jsx ensureYardCharCore; R-S4PP-3: its boot pays nothing for the Yard), so on the GM they bind on the first
// SHEET render (DiceHub calls bindSheetPool); the sheet-less window reads none of them. Bound, never re-defined
// (test/sheet_pool_one_path.cjs).
var resolveSheetEquipment, OGG_TO_SHEET_SKILL, sheetSkillCharacteristic, poolModSkillIndex, collectPoolMods, withPoolMods, sheetSkillRank;
function bindSheetPool() {
  if (resolveSheetEquipment || !window.SWRPGSheetPool) return;
  resolveSheetEquipment = window.SWRPGSheetPool.resolveSheetEquipment; OGG_TO_SHEET_SKILL = window.SWRPGSheetPool.OGG_TO_SHEET_SKILL;
  sheetSkillCharacteristic = window.SWRPGSheetPool.sheetSkillCharacteristic; poolModSkillIndex = window.SWRPGSheetPool.poolModSkillIndex;
  collectPoolMods = window.SWRPGSheetPool.collectPoolMods; withPoolMods = window.SWRPGSheetPool.withPoolMods; sheetSkillRank = window.SWRPGSheetPool.sheetSkillRank;
}
bindSheetPool();
// the M7 line styles live in lib/shared/ui.jsx (ruling release-r6-companions-lifts Q2 (a))
var M7_LINE_STYLE = window.SWRPGUI.M7_LINE_STYLE, M7_META_STYLE = window.SWRPGUI.M7_META_STYLE;

// ── HANDED-IN: the host's readers (player/app.jsx `window.SWRPGDiceHubHost`), read at call time; sheet paths only ──
function HOST() { return window.SWRPGDiceHubHost || {}; }
var SKILL_NAMES = HOST().SKILL_NAMES || {};   // the sheet's skill keys → names; {} on a host with no sheets
function useCanonicalReady() { return HOST().useCanonicalReady(); }
function useRewardsReg(need) { return HOST().useRewardsReg(need); }
function sheetOwnViewOr(sheet, fallback) { return HOST().sheetOwnViewOr(sheet, fallback); }
function sheetForcePowersForDisplay(sheet) { return HOST().sheetForcePowersForDisplay(sheet); }
function diceHubWeaponDamage(sheet, w) { return HOST().diceHubWeaponDamage(sheet, w); }
function m7CapChar(c) { return HOST().m7CapChar(c); }

// ── Page 0: Stats (with identity card) ──
// ── Page 0: COMBAT — runtime state the player adjusts mid-session ──
// ── THE hub's weapon row. The ONE weapon dice-pool builder is SWRPGSheetPool.weaponPoolOf (lib/shared/sheetPool.js, ruling
// f100-surfacing-sheet-concept R-SSC-4 + ADDENDUM 10 C3 (a)): the hub row and the sheet's WEAPONS card both read it, so the
// card's dice equal the row's. This header stays (30 readers slice it by name) and resolves the skill with the app's one
// resolver below. `derived` is unread (kept for the header). `arguments[7]` = the hub's DIFFICULTY chip; `arguments[8]` = the
// session's committed Force set (ruling `f100-surfacing-force-flip-card` ADDENDUM 12 F2 (i): a committed Control's characteristic).
function resolveWeaponSkillKey(rawSkill) {
  if (!rawSkill) return '';
  var norm = OGG_TO_SHEET_SKILL[rawSkill] || rawSkill;
  if (SKILL_NAMES[norm]) return norm;
  var target = String(rawSkill).toLowerCase().trim();
  var keys = Object.keys(SKILL_NAMES);
  for (var i = 0; i < keys.length; i++) { if (SKILL_NAMES[keys[i]].toLowerCase() === target) return keys[i]; }
  var stripped = target.replace(/[^a-z]/g, '');
  for (var j = 0; j < keys.length; j++) { if (SKILL_NAMES[keys[j]].toLowerCase().replace(/[^a-z]/g, '') === stripped) return keys[j]; }
  return '';
}

/** The display half for this check: relevant, NOT applied, each carrying its reason. `characteristic` (optional, F-100 M8
 *  B-1065) is the one the check rolls, so a characteristic-anchored entry is reminded where it would also apply. */
function poolModRemindersFor(mods, skillKeyOrId, characteristic) {
  var P = window.SWRPGPoolMods, idx = poolModSkillIndex();
  if (!P || !idx || !mods || !mods.length) return [];
  var ctx = P.contextFor(skillKeyOrId, idx, characteristic);
  if (!ctx) return [];
  return P.reminders(mods, ctx);
}

function computeWeaponPool(sheet, weapon, targetBand, derived, accent, resolvedEquipment, taken) {
  return window.SWRPGSheetPool.weaponPoolOf(sheet, weapon, { skillKey: resolveWeaponSkillKey(weapon.skillKey || weapon.skill || ''), band: targetBand,
    equipment: resolvedEquipment, taken: taken, difficultySet: arguments[7], accent: accent, forceCommitted: arguments[8] });
}

// THE MEDICINE CHECK on a critical injury — ONE function: the pool the crit plate's TREAT has always built, now rolled
// in the dice hub's treat section (B-1209 retire, D-172; card `paper-n7-b1209-rollwindow-lab-card` ADDENDUM 2 C-3).
// The injury's difficulty enters the spec `withPoolMods` folds, so an effect that removes difficulty (the shipped
// `gear/antishock_blanket`) still lands; nothing steps the difficulty raw afterwards (B-848's trap).
// B-1263 (card `paper-n7-b1263-build-card` C-1, D-187): the fold takes the HUB's one `poolMods` with this row's ticked offers
// TAKEN (SWRPGPoolMods.takeOffers), exactly as a skill row's spec does — no collect of its own, so the treat row's offers and
// its pool read the same list. `characteristic` is the one the treat roll rolls (Intellect), for the row's offers and told lines.
// → { difficulty: the injury's own (its dice, else its tier, else 2), tier: its tier word or '', characteristic, spec: the folded pool }
// B-1586: the skill a character treats its own injury with — Mechanics for a droid (EotE p.220), Medicine otherwise.
// The droid test is B-1606's one predicate over the sheet's species id — and, for a save with no id, its species name
// (B-1612: a legacy "Droid" save, which R-MRN-2 never stamps). Read by critTreatSpec and by the crit plate's
// button (ADDENDUM 300 F1), so the button names the skill the row it opens rolls. → { key: 'MECH'|'MED', name, droid }
function critTreatSkill(sheet) {
  var droid = !!(window.CharResolve && window.CharResolve.isDroidSpecies && window.CharResolve.isDroidSpecies((sheet || {}).speciesId, (sheet || {}).species));
  var key = droid ? 'MECH' : 'MED';
  return { key: key, name: (SKILL_NAMES && SKILL_NAMES[key]) || (droid ? 'Mechanics' : 'Medicine'), droid: droid };
}

// B-1837 (post1-one-number-hub-build S2, ADDENDUM 644): Intellect and the Medicine (Mechanics) rank are the sheet check's own —
// SWRPGSheetPool.sheetCheckInputs, the commits (`committed`, optional: the session's committed Force set, as the skill row
// reads it) and M12's in-use item bonuses (the Cybernetic Brain Implant's Intellect) — so the roll equals the sheet's pool.
function critTreatSpec(sheet, c, accent, poolMods, taken, committed) {
  var diffDice = c.difficulty_dice || ({Easy:1, Average:2, Hard:3, Daunting:4})[c.severityTier] || 2;
  // B-1586 (D-411 item 29; ruling release-r7-bug-burndown ADDENDA 281, 283, 293): a droid is repaired with Mechanics, not
  // Medicine, and a droid repairing itself with Mechanics adds only one to the difficulty (EotE p.220). The droid
  // test is the one B-1606 wrote (`CharResolve.isDroidSpecies`), through critTreatSkill.
  var tsk = critTreatSkill(sheet), droid = tsk.droid, sk = tsk.key;
  var io = window.SWRPGSheetPool.sheetCheckInputs(sheet, sk, committed);
  var intVal = Number(io.chars.intellect) || 0, medRank = Number(io.rank) || 0;
  var mods = taken && window.SWRPGPoolMods && window.SWRPGPoolMods.takeOffers ? window.SWRPGPoolMods.takeOffers(poolMods, taken) : poolMods;
  // R-B1263B-1: the fold reads the characteristic the row's offers are listed by, as a skill row passes `ch`
  var ch = 'intellect';
  // D-406 item 22 (B-1273; ruling release-r7-bug-burndown ADDENDUM 200 / 202 pick 1): the treat row always rolls the
  // character's own Medicine on the character's own injury, and treating yourself adds two difficulty (EotE p.219, Medical
  // Care; p.113, Medicine). The +2 goes into the pool before the offers fold, and its reason is the row's first applied line,
  // in the hub's own sentence ("+2 difficulty — treating your own injury (EotE p.219)").
  // A droid's self-repair adds one, in the same line's idiom ("+1 difficulty — a droid repairing itself (EotE p.220)").
  var selfDiff = diffDice + (droid ? 1 : 2);
  var spec = withPoolMods({
    characteristic: intVal, skillRank: medRank, difficulty: selfDiff, accent: accent,
    skill: { key: sk, name: tsk.name },
  }, mods, sk, ch);
  spec = Object.assign({}, spec, { _poolModChanges: [{ die: 'difficulty', direction: 'add', from: diffDice, to: selfDiff,
    source: droid ? 'a droid repairing itself (EotE p.220)' : 'treating your own injury (EotE p.219)' }].concat(spec._poolModChanges || []) });
  // `skill` is the key the row rolls (MED, or MECH for a droid): the hub reads its offers and told lines by it
  return { difficulty: selfDiff, tier: c.severityTier || '', characteristic: ch, skill: sk, spec: spec };
}

// ══ THE DICE HUB (F-87) ══════════════════════════════════════════════════════════════════════
// Built from the approved drawing `Docs/mockups/dice-hub.html` @ `5628fbdb`; Jason's approval is on
// record in `Docs/gates/dice-hub-mockup.md` (APPROVAL section, @ `3a891bdc`) and IS, by name, the
// R-PMP §5.1 range-picker reversal. Card: `dice-hub-build-card` (C-DHB-*). Concept: D-DH-1..7.
//
// CONTRACT — ONE CORE (D-DH-2). No arithmetic is restated here. Weapon pools come from
// `computeWeaponPool`, skills from the cockpit's own {characteristic, skillRank, difficulty:2}
// shape, Force from `SheetForceZone`'s FR-minus-committed, every die count from
// `SWRPGDice.buildPool`, and results from `SWRPGDice.rollAndResolve` + `BasicResultPanel`. A hub
// pool that disagreed with a cockpit pool would be the defect this repo calls one-core.
//
// CONTRACT — THE APPLIED LINE CLAIMS ONLY WHAT THE APP COMPUTES (card §2.4). Range difficulty,
// over-encumbrance setback and Force commitment are stated as FACT because the cores produce them.
// EVERY item-sourced modifier renders as a dimmed verbatim REMINDER until B-222 certifies
// `pool_mods`' semantics — the Medpac included, which the approved page drew as APPLIED. The
// drawing is one data lap ahead of the build and the ruled scope outranks the drawn exemplar
// (C-MU-4); this comment is that divergence, disclosed rather than silent.
var DICE_HUB_BANDS = ['Engaged', 'Short', 'Medium', 'Long', 'Extreme'];

// ── THE HUB'S OWN pool_mods READERS ARE GONE (R-PCA-2 / R-BPH-2) ─────────────────────────────
// Four functions stood here — `diceHubPoolMods`, `poolModAnchoredTo`, `poolModUnanchored`,
// `diceHubReminders`. The first read `window._canonicalRegistries` DIRECTLY, beside the resolve
// path, under a comment admitting it ("the resolve path does not carry it through … flagged in the
// gate"). That flag is discharged here: `canonicalToStore` now carries `pool_mods`, so the hub
// asks the same assembler the cockpit and the skills list ask, through the same seam
// (`collectPoolMods` / `withPoolMods` / `poolModRemindersFor`). A field carried BESIDE the core
// instead of THROUGH it is the bolt-on the card forecloses by name; deleting these is that
// foreclosure landing, not a tidy-up.
//
// The OR-semantics reader moved WITH them — `matches()` in poolMods.js is now the only one, so the
// hub's three bucketing sites and the sheet's cannot drift apart.
function DiceHubStatusLine(props) {
  // APPLIED — stated as fact, because a core computed it.
  // F-100 M8 step 3 (item 23, AS-9 SCALE at 2560/3840): the sheet's WEAPONS card and injury panel draw these lines too, so
  // they grow by the sheet's unitless unit `--u-k` (sheet.css: 1 → 1.3 → 1.8). Outside the sheet's .sbwrap (the hub's
  // drawer) it is absent and reads 1, so the hub, and every width below 2300, draws exactly as before.
  var k = 'var(--u-k, 1)';
  // `m8` marks a line M8 composes ('applied'), so a suite reads M8's lines by its mark (item 23's OWN filter)
  return h('div', { className: 'dh-sl', 'data-m8': props.m8 || undefined, style: {
    display: 'flex', gap: 'calc(7px * ' + k + ')', alignItems: 'flex-start', marginTop: 'calc(5px * ' + k + ')',
    fontSize: 'calc(var(--fs-sm) * ' + k + ')', lineHeight: 1.35, color: props.tone } },
    h('span', { 'aria-hidden': 'true', style: { fontSize: 'calc(11px * ' + k + ')', lineHeight: 1.5, flexShrink: 0 } }, props.glyph || '▸'),
    h('span', null, props.children),
    // B-1451 (D-406 item 14): a line with a source opens its words through the roll options' own (i); absent, as before
    props.info && (window.SWRPGUI || {}).OfferInfo ? h('span', { style: window.SWRPGUI.InfoSlot }, h(window.SWRPGUI.OfferInfo, { info: props.info, offerKey: props.infoKey })) : null);
}

// B-1451: the (i)'s box for a line whose owner is a talent or a species ability (`talentId`, `rowId`), or null — each reader
// calls SWRPGUI.offerInfo inline (the hub's readers are sliced by name), this one is the sheet card's
function diceHubLineInfo(talentId, rowId, tal) {
  var UI = window.SWRPGUI || {};
  return talentId && UI.offerInfo ? UI.offerInfo(talentId, rowId, tal) : null;
}

/**
 * The APPLIED item lines — the F-87 fence lifting (R-PCA-4 / R-BPH-4).
 *
 * D-DH-3 badged EVERY item-sourced modifier "not applied" because the data could not be trusted to
 * say which way it pointed or whether it had a condition. Its own premise was "until B-222
 * certifies"; that certification has landed, so an entry the walk settled as unconditional now
 * states its dice as FACT — the same class as the range difficulty and the encumbrance setback
 * beside it, and exactly what the approved drawing showed the Medpac doing (C-MU-4's designed
 * expiry). Keeping the badge here would be the new falsehood.
 *
 * The number comes from the assembler's own change record — from → to, floored — never from the
 * entry's raw `count`, so a 'remove' that found no die to remove reports nothing rather than
 * claiming a reduction that did not happen.
 */
function DiceHubAppliedLines(spec, checkName, qualityMods, sheet) {
  // F-100 M8 step 3: a TICKED offer's change is the offer's own (its tick shows it), never a second "applied" line; an
  // automatic symbol (C3) reads "+1 advantage on every Coercion check — Fearsome Rep" (frame R5).
  // B-219 (R-B219C-9): a WEAPON QUALITY's symbol is this weapon's, not every check's — "+1 advantage — Superior", the
  // shared sentence with no check name (its existing optional argument). `qualityMods` = computeWeaponPool's quality rows.
  var changes = ((spec && spec._poolModChanges) || []).filter(function (c) { return !c.taken; });
  var words = (window.SWRPGUI || {}).appliedLineText;   // the ONE sentence (lib/shared/ui.jsx), shared with the Yard's seat card
  var fromQuality = {};
  (qualityMods || []).forEach(function (m) { if (m && m.source) fromQuality[m.source] = true; });
  var UI = window.SWRPGUI || {}, tal = changes.length && UI.offerTalentsFor ? UI.offerTalentsFor(sheet || null, changes) : null;   // B-1451: the owner's view
  return changes.map(function (c, k) {
    // B-1590 (D-411 item 1): an item's line opens its item's words, as a talent's opens its talent's (SWRPGUI.offerInfoOf)
    var info = UI.offerInfoOf ? UI.offerInfoOf(c.talentId, c.rowId, c.item, tal) : null, ik = c.talentId ? c.talentId + ':' + c.rowId : info ? info.id : undefined;
    if (c.symbol) return h(DiceHubStatusLine, { key: 'pm' + k, m8: 'applied', tone: 'var(--text-info)', info: info, infoKey: ik }, words(c, fromQuality[c.source] ? undefined : checkName));
    var helps = (c.die === 'boost') ? c.direction === 'add' : c.direction === 'remove';
    return h(DiceHubStatusLine, { key: 'pm' + k, m8: 'applied', tone: helps ? 'var(--text-info)' : 'var(--text-caution)', info: info, infoKey: ik }, words(c, checkName));
  });
}

function DiceHubReminder(props) {
  var m = props.mod;
  // DISPLAYED, never applied (D-DH-3). Non-interactive to assistive tech as drawn: the whole row is
  // one presentational span, so a screen reader cannot mistake a reminder for a control.
  return h('div', { className: 'dh-rem', role: 'presentation', style: {
    display: 'flex', gap: 7, alignItems: 'flex-start', marginTop: 5,
    fontSize: 'var(--fs-sm)', lineHeight: 1.35, color: 'var(--text-muted)' } },
    h('span', { 'aria-hidden': 'true', style: { fontSize: 11, lineHeight: 1.5, flexShrink: 0 } }, '▫'),
    h('span', null,
      h('span', { style: { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)', color: 'var(--text-primary)' } },
        m.count + ' ' + m.die),
      ' — ' + (m.source || ''),
      m.condition ? h('span', { style: { fontStyle: 'italic' } }, ' “' + m.condition + '”') : null,
      h('span', { style: { fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.09em',
        color: 'var(--text-warning)', border: '1px solid rgba(255,138,61,.45)', borderRadius: 5,
        padding: '1px 5px', marginLeft: 6, whiteSpace: 'nowrap' } }, "GM's call")),   // B-1456 (D-406 item 11): why it has no tick
    props.info && (window.SWRPGUI || {}).OfferInfo ? h('span', { style: window.SWRPGUI.InfoSlot }, h(window.SWRPGUI.OfferInfo, { info: props.info, offerKey: m.key })) : null);   // B-1451
}

// the "+N on one hit" beside the damage: the APPLIED damage rows, plus an offered one only while it is ticked
function diceHubDamagePlus(lines, taken) {
  var P = window.SWRPGPoolMods, n = (lines && lines.total) || 0;
  // a number that RIDES a target tick (`tickedBy`) is never added into the hit: diceHubDamageAs words it (D-294 L2)
  ((lines && lines.offered) || []).forEach(function (l) { if (!l.tickedBy && taken && P && taken[P.offerKey({ talentId: l.talentId, id: l.rowId })]) n += l.amount; });
  return n;
}

// F-100 THE SURFACING MISSION (D-294 L2; card f100-surfacing-roll-options-card ADDENDUM 8 F6): with a talent's TARGET tick
// taken, the damage line reads "as strain", and each number riding that tick its amount and skill — "as strain (+1,
// Medicine)" — beside the damage, never in it. `offers` = SWRPGQualityRows.talentTargetOffers at the row; `lines` its
// damageLines; `taken` the row's ticks. Nothing ticked → null.
function diceHubDamageAs(offers, lines, taken) {
  var on = (offers || []).filter(function (o) { return taken && taken[o.key]; });
  if (!on.length) return null;
  var plus = [];
  on.forEach(function (o) {
    ((lines && lines.offered) || []).forEach(function (l) {
      if (l.tickedBy !== o.rowId || l.talentId !== o.talentId) return;
      var a = (l.row || {}).amount, sk = a && typeof a === 'object' && a.of === 'skill_ranks' ? (SKILL_NAMES[a.key] || a.key) : null;
      plus.push('+' + l.amount + (sk ? ', ' + sk : ''));
    });
  });
  return 'as strain' + (plus.length ? ' (' + plus.join('; ') + ')' : '');
}

// F-100 THE SURFACING MISSION (D-294 L3; ADDENDUM 8 F12): the reroll — `doRoll` itself, ONCE, over the pool the row ROLLED
// (`prev.spec`); the patch carries the ticks taken at the first roll (so a mode or a target tick still echoes) and names who
// rerolled it, so the row lists no second offer. The limit is shown, never tracked: the next fresh roll offers it again.
function diceHubReroll(doRoll, key, prev, name) {
  doRoll(key, prev.spec);
  return { taken: prev.taken || null, rerolledBy: name };
}

// D-352 (card f100-surfacing-roll-options-card ADDENDUM 67; D-350's constraint, ADDENDUM 64's design): ONE Reroll per hub,
// on the LATEST rolled result only, ON THE RESULT'S LINE right after the result box. The rerolls a rolled row offers come from
// SWRPGPoolMods.rerollsAt (DARK OFF: [] with the key OFF, so nothing draws). The model, pure:
//   done   — the result was rerolled: "Rerolled — <talent>" in the button's place (older results keep their mark);
//   one    — one talent qualifies: the Reroll button, then the talent's name with its (i) (the approved L3, moved);
//   choice — two or more qualify: ONE Reroll button that opens the talent choice (each with its (i));
//   null   — not rolled, not the latest result, or nothing qualifies.
function diceHubRerollModel(ro, rerolls, latest) {
  if (!ro) return null;
  if (ro.rerolledBy) return { kind: 'done', name: ro.rerolledBy };
  if (!latest || !(rerolls || []).length) return null;
  return { kind: rerolls.length === 1 ? 'one' : 'choice', rows: rerolls };
}

function diceHubRerollSlot(ro, rerolls, latest, onReroll) {
  var m = diceHubRerollModel(ro, rerolls, latest);
  return m ? h(DiceHubReroll, { model: m, onReroll: onReroll }) : null;
}

function diceHubRerollInfo(r) {
  var UI = window.SWRPGUI || {};
  return UI.offerInfo ? UI.offerInfo(r.talentId, r.id, null, { cost: UI.offerTags ? UI.offerTags(Object.assign({}, r, { limit: null })) : [] }) : null;
}

// the slot itself: the choice is a usePopover menu (Esc on the ONE stack, an outside press, Back), portalled to the body as
// the info box is (a fixed menu inside the hub's window would be clipped by it). THE BACK FENCE (ADDENDUM 67, D-352):
// a talent's box opened INSIDE the choice takes no Back entry (OfferInfo `noBack`). One entry, one Back: it closes the choice
// and the box with it. With two entries one Back would still close both, and the second entry would be a dead press (B-1702).
function DiceHubReroll(props) {
  var m = props.model, UI = window.SWRPGUI || {};
  var _o = React.useState(false), open = _o[0], setOpen = _o[1];
  var _p = React.useState(null), pos = _p[0], setPos = _p[1];
  var btnRef = React.useRef(null), popRef = React.useRef(null);
  (UI.usePopover || function () {})(open, function () { setOpen(false); }, btnRef, popRef);
  React.useLayoutEffect(function () {
    if (!open) { if (pos) setPos(null); return; }
    var b = btnRef.current, p = popRef.current; if (!b || !p) return;
    var br = b.getBoundingClientRect(), pr = p.getBoundingClientRect(), W = document.documentElement.clientWidth || window.innerWidth, H = window.innerHeight, G = 8;
    var top = br.bottom + 6; if (top + pr.height > H - G && br.top - 6 - pr.height >= G) top = br.top - 6 - pr.height;
    var next = { left: Math.max(G, Math.min(W - G - pr.width, br.left)), top: top };
    if (!pos || pos.left !== next.left || pos.top !== next.top) setPos(next);
  }, [open, pos]);
  var nameStyle = { fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 15, lineHeight: 1.3, color: 'var(--doc-ink)' };
  if (m.kind === 'done') return h('span', { 'data-testid': 'dice-hub-rerolled', 'data-m8': 'applied', className: 'dh-sl',
    style: { fontSize: 'var(--fs-sm)', lineHeight: 1.35, color: 'var(--text-info)' } }, 'Rerolled — ' + m.name);
  if (m.kind === 'one') {
    var r = m.rows[0], info = diceHubRerollInfo(r);
    return h('span', { className: 'm8-offer sb-dh-reroll', 'data-dh-reroll': 'one', 'data-offer-key': r.key || '', style: { display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 } },
      h('button', { type: 'button', className: 'hp-quiet', 'data-testid': 'dice-hub-reroll', 'aria-label': 'Reroll — ' + r.source, onClick: function () { props.onReroll(r.source); } }, 'Reroll'),
      h('b', { style: nameStyle }, r.source),
      info && UI.OfferInfo ? h(UI.OfferInfo, { info: info, offerKey: r.key }) : null);
  }
  var RD = window.ReactDOM, menu = open ? h('div', { ref: popRef, role: 'menu', 'aria-label': 'Which talent rerolls this check', 'data-testid': 'dice-hub-reroll-choice',
      'data-doc-ground': 'creator', style: { position: 'fixed', zIndex: 9400, left: pos ? pos.left : 0, top: pos ? pos.top : 0, visibility: pos ? 'visible' : 'hidden',
        width: 'min(320px, calc(100vw - 16px))', boxSizing: 'border-box', padding: '4px 0 4px 6px', background: 'var(--doc-paper-raised)', color: 'var(--doc-ink)',
        border: '1px solid var(--doc-rule)', borderRadius: 8, boxShadow: '0 10px 28px rgba(0,0,0,.22)' } },
    m.rows.map(function (r) {
      var info = diceHubRerollInfo(r);
      return h('div', { key: r.key, className: 'm8-offer', 'data-offer-key': r.key || '', style: { display: 'flex', alignItems: 'center' } },
        h('button', { type: 'button', role: 'menuitem', 'data-testid': 'dice-hub-reroll-pick', onClick: function () { setOpen(false); props.onReroll(r.source); },
          style: { flex: '1 1 auto', minWidth: 0, minHeight: 44, textAlign: 'left', background: 'none', border: 0, padding: '0 8px', cursor: 'pointer' } },
          h('b', { style: nameStyle }, r.source)),
        info && UI.OfferInfo ? h(UI.OfferInfo, { info: info, offerKey: r.key, noBack: true }) : null);
    })) : null;
  return h('span', { className: 'sb-dh-reroll', 'data-dh-reroll': 'choice', style: { display: 'inline-flex', alignItems: 'center' } },
    h('button', { ref: btnRef, type: 'button', className: 'hp-quiet', 'data-testid': 'dice-hub-reroll', 'aria-haspopup': 'menu', 'aria-expanded': open ? 'true' : 'false',
      'aria-label': 'Reroll — choose a talent', onClick: function () { setOpen(!open); } }, 'Reroll'),
    menu ? (RD && RD.createPortal && document.body ? RD.createPortal(menu, document.body) : menu) : null);
}

// one applied roll number's words: "+1 damage to one hit — Feral Strength", with its band (R-M8K-26) or its pick (R6)
function diceHubDamageLineText(l, band) {
  var r = l.row || {}, pk = r._pick, who = l.source;
  if (pk) who += ', ' + (SKILL_NAMES[(window._canonicalCharbuild && window._canonicalCharbuild.skillSheetKeys || {})[pk.value]] || pk.value) + (pk.per === 'rank' ? ' (rank ' + pk.rank + ')' : '');
  if (Array.isArray(r.range_band) && band) who += ' (' + band + ' range)';
  return (l.amount < 0 ? '−' : '+') + Math.abs(l.amount) + ' damage to one hit — ' + who;
}

// the APPLIED crit_rating_delta rows' line: "Crit 5 → 4 — Iron Body" (frame F1, the Unarmed row and the WEAPONS unit;
// NOT BUILT at step 3, drawn at B2 with the member, f100-m8-build-card R-M8B-23). `at` = rollNumbersAt's result; the
// numbers are the printed rating and SWRPGPoolMods.critRatingWith's (never below the floor). Nothing applied → null.
function diceHubCritLineText(printed, now, at) {
  var ap = at && at.applied ? at.applied.filter(function (l) { return l.amount; }) : [];
  if (!ap.length || printed == null || now == null) return null;
  return 'Crit ' + printed + ' → ' + now + ' — ' + ap.map(function (l) { return l.source; }).join(', ');
}

// the weapon row's ONE Crit line (the hub): a TICKED offered crit SET (`b1205:offered-crit-sets`) names itself first —
// "Crit 5 → 3 — Claws (Tarc)", H7's words — then any applied delta; otherwise diceHubCritLineText's (deltas only, so an
// APPLIED set such as the Trandoshan's draws no line, as M9 F4 has it). null = no line.
// `everySet` (the sheet's WEAPONS card, B-1316): every APPLIED set names itself — the card has no tick, and M9 F4 draws the
// Trandoshan's Unarmed card with "Crit 5 → 3 — Claws (Trandoshan)" (frame S3); the hub passes nothing and is unchanged.
function diceHubCritLine(spec, sheet, everySet) {
  var cst = ((spec && spec.critSetLines && spec.critSetLines.applied) || []).filter(function (l) { return everySet || l._taken; });
  if (!cst.length || spec.critPrinted == null || spec.critThreshold == null) return diceHubCritLineText(spec.critPrinted, spec.critThreshold, spec.critLines);
  var cb = (window.CharResolve && CharResolve.talentViewFor ? CharResolve.talentViewFor(sheet) : null) || window._canonicalCharbuild;
  return 'Crit ' + spec.critPrinted + ' → ' + spec.critThreshold + ' — ' + cst.map(function (l) { return diceHubRollOwnerName(l, cb); })
    .concat(((spec.critLines && spec.critLines.applied) || []).filter(function (l) { return l.amount; }).map(function (l) { return l.source; })).join(', ');
}

// F-100 M8 · a talent's changes to ONE item (Jury Rigged, frames J4–J7 @ d58a3bae, D-59), read from the display's
// `_talentEffects` (ItemResolve.applyCharacterEffects lists each change it made, {op, amount, source, talent, from, to[,
// target]}); never re-derived. Two ranks changing the same number on one item read as ONE line, first `from` → last `to`.
// `ops` narrows to the ops a surface prints; an unchanged number was never listed.
function m8ItemChanges(r, ops) {
  var by = {}, order = [];
  ((r && r._talentEffects) || []).forEach(function (f) {
    if (!f || (ops && ops.indexOf(f.op) === -1)) return;
    var k = f.op + ':' + (f.target || '') + ':' + f.talent;
    if (!by[k]) { by[k] = Object.assign({}, f); order.push(k); } else by[k].to = f.to;
  });
  return order.map(function (k) { return by[k]; });
}

// the hub's line under its damage and Crit (J4, Iron Body's form): "Crit 3 → 2 — Jury Rigged", "Damage 4 → 5 — Jury
// Rigged" — the damage as the hub prints it (Brawn added, diceHubWeaponDamage), the card keeps the table's "+1 → +2" (J5)
function m8WeaponChangeText(sheet, f, notation) {
  if (f.op === 'crit_delta') return 'Crit ' + f.from + ' → ' + f.to + ' — ' + f.source;
  if (f.op !== 'damage_delta') return null;
  var a = notation === 'card' ? f.from : diceHubWeaponDamage(sheet, { damage: f.from }), b = notation === 'card' ? f.to : diceHubWeaponDamage(sheet, { damage: f.to });
  return a == null || b == null ? null : 'Damage ' + a + ' → ' + b + ' — ' + f.source;
}

// B-219 (R-B219C-14 (2)): the damage the hub prints with a GRANTED quality's change on it, and that change's line in the
// item-change form — "Damage 6 → 7 — Superior". Native: nothing. post1-one-number-hub-build C3 (644 S3): the sum is no longer
// this function's — it reads the pool's ONE damage (`spec.damage`, SWRPGSheetPool.sheetWeaponDamage), the number the sheet's
// card prints too. A spec with none (the vehicle and NPC arms carry no quality damage) prints the weapon's own, as before.
function diceHubQualityDamage(sheet, w, spec) {
  var d = spec && spec.damage;
  return d ? { damage: d.total, lines: d.changes, parts: d.parts } : { damage: diceHubWeaponDamage(sheet, w), lines: [], parts: [] };
}

function DiceHubDamage(props) {
  var mono = { fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.16em', color: 'var(--doc-ink-muted)', textTransform: 'uppercase' };
  var big = { fontFamily: 'var(--font-body)', fontSize: 15, letterSpacing: 0, color: 'var(--doc-ink)', textTransform: 'none', fontWeight: 600 };
  return h('div', { className: 'm8-dmg', 'data-m8': 'damage', style: Object.assign({}, mono, { marginTop: 8, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'baseline' }) },
    h('span', null, 'Damage ', h('b', { style: big }, props.damage == null ? '—' : String(props.damage)),
      props.plus ? h('span', { className: 'm8-plus', style: { fontFamily: 'var(--font-body)', fontSize: 15, letterSpacing: 0, color: 'var(--doc-action)', textTransform: 'none' } }, ' +' + props.plus + ' on one hit') : null,
      // D-294 L2: a taken target tick's words ("as strain (+1, Medicine)"), the .m8-plus idiom
      props.as ? h('span', { className: 'm8-plus', style: { fontFamily: 'var(--font-body)', fontSize: 15, letterSpacing: 0, color: 'var(--doc-action)', textTransform: 'none' } }, ' ' + props.as) : null),
    h('span', null, 'Crit ', h('b', { style: big }, window.ItemResolve.critText(props.crit))));
}

// B-1499 (D-406 item 13): a rolled HIT prints its damage under DAMAGE — the weapon's damage plus each uncanceled success
// (every uncanceled success on a hit is +1 damage, EotE p.205): "Hit: 5 + 3 = 8 damage". A miss, an unrolled
// row or a weapon with no damage number draws nothing. Pure words, so a guard executes it.
function diceHubHitWords(damage, resolved) {
  var su = resolved && resolved.succeeded ? Number(resolved.success) || 0 : 0;
  if (!su || damage == null || isNaN(Number(damage))) return null;
  return 'Hit: ' + damage + ' + ' + su + ' = ' + (Number(damage) + su) + ' damage';
}

function diceHubHitDamage(damage, resolved) {
  var w = diceHubHitWords(damage, resolved);
  return w ? h('div', { 'data-testid': 'dice-hub-hit-damage', 'data-m8': 'hit', style: { marginTop: 6, fontFamily: 'var(--font-body)', fontSize: 15,
    fontWeight: 600, lineHeight: 1.35, color: 'var(--doc-ink)' } }, w) : null;
}

// an unmade pick a row could use: it adds nothing and asks (R-M8K-6 (a), frame R6)
function DiceHubPickPrompt(props) {
  var q = props.pick;
  return h('div', { className: 'm8-told', 'data-m8': 'prompt', 'data-pick': q.talentId + ':' + q.rank, style: {
    display: 'flex', gap: 7, alignItems: 'flex-start', marginTop: 8, fontFamily: 'var(--font-body)', fontSize: 15, lineHeight: 1.4, color: 'var(--doc-ink-muted)' } },
    h('span', { 'aria-hidden': 'true' }, '▫'),
    h('span', null, h('b', null, q.name + ', rank ' + q.rank + ' '), 'has no skill chosen yet, so it adds nothing.',
      props.onChoose ? h('button', { type: 'button', className: 'hp-quiet', 'data-testid': 'pick-prompt-choose', style: { marginTop: 6, display: 'block' },
        onClick: function () { props.onChoose(q); } }, 'Choose a skill') : null));
}

// the unmade picks a row reaches: the pick's pool is a skill group (the row's group) or a list of skill ids
function diceHubPromptsFor(unmade, ctx) {
  if (!ctx) return [];
  return (unmade || []).filter(function (q) {
    var pool = q.pool;
    if (!pool || pool === 'any') return true;
    if (Array.isArray(pool)) return pool.indexOf(ctx.skillId) !== -1;
    return ctx.group === pool;
  });
}

// a row's offers: every certified reminder is an OFFER (R-M8K-28); an uncertified one stays the "GM's call" reminder (B-1456),
// since it has no direction to fold. Offered roll numbers (a cost or a condition) are offers too.
function diceHubOfferEls(rowKey, reminders, rollOffered, taken, toggle, sheet) {
  var UI = window.SWRPGUI || {}, P = window.SWRPGPoolMods;
  var cb = (sheet && window.CharResolve && CharResolve.talentViewFor ? CharResolve.talentViewFor(sheet) : null) || window._canonicalCharbuild;
  // the owner's lookup is the ONE shared function (SWRPGUI.offerTalentsFor, R-SYC-3 / D-SYF2 (a)): the sheet's stamp view first
  var tal = UI.offerTalentsFor ? UI.offerTalentsFor(sheet, (reminders || []).concat(rollOffered || [])) : null;
  var out = [];
  (reminders || []).forEach(function (m, k) {
    // B-1590 (D-411 item 1): an item-owned reminder or offer opens its item's words (SWRPGUI.offerInfoOf); B-1609 (D-412
    // item 5): a weapon quality's, its quality's registry words
    if (m.reason === 'uncertified' || !UI.OfferRow || !UI.offerOf) { out.push(h(DiceHubReminder, { key: 'r' + k, mod: m, info: UI.offerInfoOf ? UI.offerInfoOf(m.talentId, m.id, m.item, tal, undefined, m.quality) : null })); return; }
    var o = UI.offerOf(m, tal);
    out.push(h(UI.OfferRow, { key: 'o' + k, offerKey: o.key, name: o.name, text: o.text, s3: o.s3, tags: o.tags, on: !!(taken && taken[o.key]),
      onToggle: function () { toggle(rowKey, o.key); },
      // 5h (brief §4/§5): the who tag and the (i) — null with the key OFF (offerOf itself is unchanged: a dozen suites slice it alone)
      who: UI.offerWho ? UI.offerWho(m) : null, info: UI.offerInfoOf ? UI.offerInfoOf(m.talentId, m.id, m.item, tal, { cost: UI.offerTags(Object.assign({}, m, { limit: null }), tal) }, m.quality) : null }));
  });
  // the offered ROLL NUMBERS: a damage row ("+1 damage to one hit") and a species crit SET ("Crit → 3 “When using claws”",
  // `b1205:offered-crit-sets`) — the SET through offerOf, so its condition is its ability's own words
  (rollOffered || []).forEach(function (l, k) {
    if (!UI.OfferRow || !P || l.tickedBy) return;   // a number riding a target tick draws no tick of its own (ADDENDUM 8 F6)
    var key = P.offerKey({ talentId: l.talentId, id: l.rowId });
    // B-1455 (D-406 item 10): the damage row quotes its condition as its crit SET sibling does — both through offerOf
    var oo = (l.op === 'crit_rating_set' || l.op === 'damage_delta') && UI.offerOf
      ? UI.offerOf({ key: key, op: l.op, amount: l.amount, talentId: l.talentId, id: l.rowId, condition: (l.row || {}).condition, source: l.source }, tal) : null;
    var text = oo ? oo.text : '+' + l.amount + ' damage to one hit';
    out.push(h(UI.OfferRow, { key: 'n' + k, offerKey: key, name: diceHubRollOwnerName(l, cb), text: text, s3: oo && oo.s3,
      tags: UI.offerTags ? UI.offerTags(l.row || {}) : [], on: !!(taken && taken[key]), onToggle: function () { toggle(rowKey, key); },
      who: UI.offerWho ? UI.offerWho(l.row) : null,   // 5h: null with the key OFF
      info: UI.offerInfo ? UI.offerInfo(l.talentId, l.rowId, tal, { cost: UI.offerTags(Object.assign({}, l.row || {}, { limit: null })) }) : null }));
  });
  return out;
}

// a roll number's owner as a line names it: the talent's name, or a species ability's with its species — "Claws (Tarc)"
// (H7's words). `cb` = the view the sheet resolves through (its stamp view, else the discovery view).
function diceHubRollOwnerName(l, cb) {
  var m = /^species:([^:]+):/.exec(String((l && l.talentId) || '')), rec = m && cb && cb.species ? cb.species[m[1]] : null;
  return rec && rec.name ? l.source + ' (' + rec.name + ')' : l.source;
}

// the automatic symbols a pool carries (C3 `symbol`; frame R5), in the app's own result glyphs, after the dice
function diceHubAutoSymbols(dice) {
  var a = dice && dice._autoSymbols, D = window.SWRPGDice;
  if (!a || !D || !D.renderResults || !Object.keys(a).some(function (k) { return a[k] > 0; })) return null;
  var r = { success: 0, advantage: 0, triumph: 0, despair: 0, threat: 0, failure: 0, light: 0, dark: 0 };
  Object.keys(a).forEach(function (k) { if (r[k] != null) r[k] += a[k]; });
  return h('span', { 'data-m8': 'symbol', style: { display: 'inline-flex', alignItems: 'center', gap: 3, marginLeft: 6 } },
    h('span', { className: 'm8-plus', style: { color: 'var(--doc-action)' } }, '+'), D.renderResults(r, { size: 1, fill: true }));   // D-447: the dice hub draws the Force family by fill
}

// One rollable row: identity · pool · ROLL (or the result, rolled in place, with its reroll slot) · status lines.
// ── ONE NUMBER PER ROW (post1-one-number-hub-build C2, ruling release-r7-bug-burndown ADDENDUM 642; D-521; the approved page
// Docs/mockups/post1-one-number-hub.html @ 66921f8d4) ── a row's REASONS are the lines it states as fact about its numbers: every
// DiceHubStatusLine among its children (the range and set difficulty, the setback, the talent damage, the crit line, the
// applied item dice, "The result includes …", a target's, a floor's, a granted quality's and an item's change), the rolled
// "Hit: …" (data-m8 hit) and the damage's "+N" / "as …" words (.m8-plus). They move, word for word and in their order, behind
// the row's ONE "Why these numbers" press (SWRPGUI.WhyPress, the sheet's own), placed under DAMAGE on a weapon row and under
// the row's line on a skill row. Everything else — the ticks, the switch lines, the folds, the told rows, the spend menu, the
// chips — stays in view (639 Q5: controls; D-521 bind 2). A line a host must keep in view says `keep`. No reason → no press.
function diceHubFlat(kids, out) {
  (Array.isArray(kids) ? kids : [kids]).forEach(function (k) { if (Array.isArray(k)) diceHubFlat(k, out); else if (k != null && k !== false && k !== '') out.push(k); });
  return out;
}
function diceHubIsReason(el) {
  if (!el || typeof el !== 'object' || !el.props) return false;
  if (el.type === DiceHubStatusLine) return !el.props.keep;
  return el.props['data-m8'] === 'hit';
}
// → { kids, reasons }: the row's children with its reasons taken out and the press in their place (null with no `why` group)
function diceHubWhySplit(props) {
  if (!props.why) return null;
  var kids = [], reasons = [], plus = [], at = 0;
  diceHubFlat(props.children, []).forEach(function (el) {
    if (diceHubIsReason(el)) { reasons.push(el); return; }
    if (el && el.type === DiceHubDamage) {
      if (el.props.plus) plus.push('+' + el.props.plus + ' on one hit');   // DiceHubDamage's own words, whole (642 C2: word for word; 671's re-point found the suffix dropped)
      if (el.props.as) plus.push(el.props.as);
      if (el.props.plus || el.props.as) el = React.cloneElement(el, { plus: null, as: null });
      kids.push(el); at = kids.length; return;
    }
    kids.push(el);
  });
  reasons = reasons.concat(plus.map(function (t, k) { return h(DiceHubStatusLine, { key: 'mp' + k }, t); }));
  if (reasons.length || (props.whyParts || []).length) kids.splice(at, 0, h('div', { key: 'why', style: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 9, flexWrap: 'wrap' } },
    h(window.SWRPGUI.WhyPress, { group: props.why, whyKey: props.rowKey, testid: 'dice-hub-why' })));
  return { kids: kids, reasons: reasons };
}

function DiceHubRow(props) {
  var accent = props.accent, rolled = props.rolled;
  var split = diceHubWhySplit(props), UIr = window.SWRPGUI || {};
  // B-1286 (hub frames ADDENDUM 5): while a result shows, the row draws the pool it ROLLED (`rolled.spec`, its ticks and
  // its chips included), never the pool the controls now describe — a lowered pool and its result never disagree
  var spec = (rolled && rolled.spec) || props.spec;
  var barred = !!(spec && spec.barred);
  var D = window.SWRPGDice;
  var dice = barred ? null : D.buildPool(spec);
  // D-352: the result box and the reroll slot as ONE unit on the row's line — the slot right after the box; where the pair
  // cannot fit (390) the slot wraps directly UNDER the box, still above the row's controls. No slot: the box alone, as before.
  var result = rolled ? h('span', { 'data-testid': 'dice-hub-result', className: 'sb-dh-result dh-result', role: 'img', 'aria-label': rolled.aria }, D.renderResults(rolled.resolved, { fill: true })) : null;   // D-447 (B-498): by fill
  if (result && props.reroll) result = h('span', { className: 'sb-dh-resline', 'data-dh-resline': '1',
    style: { display: 'inline-flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', rowGap: 8, minWidth: 0 } }, result, props.reroll);
  // B-638 · the row on PAPER: an entry — the name, the pool's glyphs, ROLL as the board's chevron (the result in
  // its place once rolled, the refusal word when barred), the status lines beneath. Same spec, same roll.
  return h('div', { 'data-testid': props.testid, 'data-dh-row': props.rowKey, className: 'sb-e sb-dh-row', 'data-rolled': rolled ? '1' : '0' },
    h('div', { className: 'sb-dh-line' },
      h('span', { className: 'sb-e-n sb-dh-name' }, props.name),
      dice ? h('span', { className: 'sb-pool dh-pool', 'data-dh-pool': JSON.stringify(dice) }, D.renderPool(dice, { size: 1, fill: true })) : null,
      dice ? diceHubAutoSymbols(dice) : null,
      // R-SHC-9: a barred Force row says how many dice the session holds ("+3 held"), in the stack's glyph
      barred && spec.held ? h('span', { className: 'sb-pool-held', 'aria-label': spec.held + ' committed' }, '+' + spec.held + ' held') : null,
      rolled
        ? result
        : (barred
          ? h('span', { 'data-testid': 'dice-hub-barred', className: 'sb-refuse' }, spec.barredReason)
          : h('button', { type: 'button', 'data-testid': 'dice-hub-roll', className: 'sb-roll', 'aria-label': 'Roll ' + props.name, onClick: props.onRoll }, 'Roll'))),
    split ? split.kids : props.children,
    // the sheet's why-sheet over the hub (its backdrop is 4000), the row's reasons kept as the hub drew them
    split && (split.reasons.length || (props.whyParts || []).length) ? h(UIr.WhySheet, { group: props.why, whyKey: props.rowKey, title: props.name, meta: props.whyMeta, testid: 'dice-hub-why-sheet', z: 4001 },
      h(UIr.SheetWhyBody, { whyKey: 'hub-' + props.rowKey, parts: props.whyParts, nodes: split.reasons, total: props.whyTotal })) : null);
}

// The overlay. Opens OVER the sheet, never routes, closes to the same scroll position (D-DH-6).
// B-638 · THE HUB IS A WINDOW YOU CAN MOVE (Jason 2026-09-16: "Can the dice hub window be able to be moved
// around the screen by the user?"). A pointer on the head drags it; the offset is clamped to the viewport and
// kept for the session; a touch drags it the same way (pointer events). The head is the only handle, so the
// rows' own presses never move the window.
function useDragWindow() {
  var _pos = React.useState(null), pos = _pos[0], setPos = _pos[1];   // null = where the shell put it
  var ref = React.useRef(null), drag = React.useRef(null);
  var onPointerDown = function (e) {
    if (e.button > 0) return;
    if (e.target.closest && e.target.closest('button, input, a')) return;
    var el = ref.current; if (!el) return;
    var r = el.getBoundingClientRect();
    drag.current = { x: e.clientX, y: e.clientY, left: r.left, top: r.top, w: r.width, h: r.height };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
    e.preventDefault();
  };
  var onPointerMove = function (e) {
    var d = drag.current; if (!d) return;
    var left = d.left + (e.clientX - d.x), top = d.top + (e.clientY - d.y);
    var maxL = Math.max(0, window.innerWidth - d.w), maxT = Math.max(0, window.innerHeight - 44);
    setPos({ left: Math.min(maxL, Math.max(0, left)), top: Math.min(maxT, Math.max(0, top)) });
  };
  var onPointerUp = function (e) { drag.current = null; try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {} };
  return { ref: ref, pos: pos, handle: { onPointerDown: onPointerDown, onPointerMove: onPointerMove, onPointerUp: onPointerUp, onPointerCancel: onPointerUp } };
}

// One trained-skill row of the dice hub: the characteristic is THE shared answer (F-100 M7 C2, R-M7K-9/10 — best-of).
// Named and top-level so a guard can EXECUTE it (R-M7G-8); `DiceHub` maps its trained keys through it.
// → null before the vocabulary loads (R-M7G-9): the hub drops the row and draws it when the charbuild lands.
// THE FORCE SWITCH (ruling `f100-surfacing-force-flip-card` ADDENDUM 9 E-FFL-4, §2.6 of its brief): `arguments[2]` (optional) =
// the session's committed Force set (the header stays two-argument: four guards slice it by name) — `cv`, `rank` and `chars` (the `using` switch's map) read CharResolve's two committed
// readers, so a committed Control's characteristic or Farsight's Perception reads at the row as at the stage. Absent, or
// the key OFF, the sheet's own numbers, exactly as before.
// B-1836 (post1-one-number-hub-build S1, ADDENDUM 644): `cv`, `rank` and `chars` are the sheet check's own — sheetPoolOf's
// two steps, the commits and M12's in-use item bonuses (Cybernetic Eyes' Perception), read through SWRPGSheetPool's ONE
// reader (sheetCheckInputs), so the row's dice equal the sheet's.
function diceHubSkillRow(sheet, k) {
  var committed = arguments[2];
  var _sc = sheetSkillCharacteristic(sheet, k), prop = (_sc && _sc.characteristic) || '';   // F-100 M7 C2
  if (!_sc) return null;
  var io = window.SWRPGSheetPool.sheetCheckInputs(sheet, k, committed), chars = io.chars, rank = io.rank;
  return { key: k, name: SKILL_NAMES[k], cv: chars[prop] || 0, rank: rank, sc: _sc, chars: chars };
}

// F-100 M8 B-1065 (ruling f100-m8-contracts R-M8K-2 (iii)) — a hub skill row's spec, named and top-level so a guard EXECUTES
// it (R-M7G-8). The row rolls the switch's characteristic for one roll (M7 W3), else the best-of; the item and talent dice
// RE-MATCH that characteristic, so an entry anchored to a characteristic follows the roll, not the vocabulary's base.
// `using` is the row's switch: a characteristic (M7 W3), or (F-100 M8 M2, f100-m8-batches R-M8BG-233) a SKILL SUBSTITUTION
// { skill, sheetKey, characteristic, talentId } — the substitute's ranks on `characteristic` for one roll.
function diceHubRolledCharacteristic(row, using) {
  if (using && typeof using === 'object') return using.characteristic;
  return using || (row && row.sc && row.sc.characteristic) || undefined;
}

function diceHubSkillSpec(sheet, row, poolMods, using, accent) {
  var sub = using && typeof using === 'object' ? using : null, mods = poolMods;
  if (sub) using = sub.characteristic;   // M2: from here the switch is the characteristic rolled, as in M7
  var ch = diceHubRolledCharacteristic(row, using);
  var cv = using ? (Number((row.chars || sheet.characteristics || {})[using]) || 0) : row.cv;   // the row's committed map (E-FFL-4)
  // M2: a pressed substitution rolls the substitute's ranks, and takes its talent's same-check offers with it (Natural
  // Remedy's +1 difficulty sibling, A5.4) — the line said so; they are not offered apart (diceHubSubstituteTalents)
  if (sub && sub.talentId && window.SWRPGPoolMods) {
    var taken = {};
    poolModRemindersFor(poolMods, row.key, ch).forEach(function (m) { if (m.talentId === sub.talentId && m.key) taken[m.key] = true; });
    mods = window.SWRPGPoolMods.takeOffers(poolMods, taken);
  }
  // the surfacing hub's DIFFICULTY chip (R-SHC-10): `arguments[5]` — the difficulty set for ONE roll; absent, Average (2)
  var dset = arguments[5];
  return withPoolMods({ characteristic: cv, skillRank: sub ? sheetSkillRank(sheet.skills, sub.sheetKey) : row.rank,
    difficulty: dset != null && isFinite(Number(dset)) ? Number(dset) : 2, accent: accent }, mods, row.key, ch);
}

// M2: the talents a row offers a skill substitution from — their same-check offers ride on the substitution's line
function diceHubSubstituteTalents(sc) {
  var out = {};
  ((sc && sc.substitutes) || []).forEach(function (u) { if (u.talentId) out[u.talentId] = true; });
  return out;
}

// F-100 M8 B-1061 (C2, R-M8K-2) — a hub Force row's spec, named and top-level so a guard EXECUTES it (R-M7G-8). The owner's
// auto-applying dice fold through the one fold with the pool builder's kind `force_power` and NO skill, so only a row
// anchored to `roll: force_power` reaches it (poolMods' roll-only context) — never an `all`/skill/characteristic entry.
// F-100 M10 (ruling f100-m10-shapes-card R-M10S-3, V4): `powerId` — the power this row rolls — rides on the roll-only
// context, so a row anchored to THAT power (`{scope: force_power, value}`) reaches it.
// F-100 M10 B-1223 (R-M10S-11; Jason D-143, overruling the dice-hub drawing @ 5628fbdb on this row only): a Force power
// check is Force dice only, up to the Force rating less committed dice (FaD p.280) — no characteristic or skill die. A
// combined check is offered on the SKILL's own roll by the power's pool rows, never built here.
function diceHubForceSpec(sheet, poolMods, available, accent, powerId) {
  return withPoolMods({ characteristic: 0, skillRank: 0,
                        difficulty: 0, force: available, accent: accent }, poolMods, null, undefined, 'force_power', powerId);
}

// A hub weapon row's item reminders, asked about the characteristic its pool rolls — the best-of `computeWeaponPool`
// rolled — so the hub itself reads no characteristic (R-M7G-8's composers). B-1065.
// F-100 M8 step 3 (frame F6: "a TOLD row at its moment", Surgeon at the Medicine check; R-M8K-5): the owner's TOLD rows
// whose moment is a check and whose anchors this row's check matches (the ONE matcher, SWRPGPoolMods.matches) — the
// talent's own words at its span, SHOWN and never computed, with the hub's "not applied" tag (contracts flag 8). A told row
// with no anchor is told on the talent, not at a check. `characteristic` omitted (a weapon row): the sheet's own, read here
// as diceHubWeaponReminders reads it, so DiceHub reads no characteristic itself (f100_m7_composers S1).
function diceHubToldFor(sheet, skillKey, characteristic) {
  var P = window.SWRPGPoolMods, idx = poolModSkillIndex(), CR = window.CharResolve;
  if (characteristic === undefined && skillKey) characteristic = (sheetSkillCharacteristic(sheet, skillKey) || {}).characteristic || undefined;
  var cb = (CR && CR.talentViewFor && CR.talentViewFor(sheet)) || window._canonicalCharbuild;
  if (!P || !idx || !skillKey || !cb || !cb.talents || !CR || !CR.ownedTalentToldSources) return [];
  var ctx = P.contextFor(skillKey, idx, characteristic), out = [];
  if (!ctx) return [];
  CR.ownedTalentToldSources(sheet, cb).forEach(function (t) {
    t.told.forEach(function (row) {
      if (!row || (row.moment || 'check') !== 'check' || !Array.isArray(row.applies_to) || !row.applies_to.length) return;
      if (!P.matches({ appliesTo: row.applies_to }, ctx)) return;
      var w = row.words || {}, words = t.description.slice(w.start, w.end).trim();
      if (!words && t._path) words = String(diceHubRuleTextSpan(t._path, w) || '').trim();   // A5 (ADDENDUM 5 Q4 (b)): only where spanOk holds
      // R-M8BG-38 (f100-m8-batches ADDENDUM 10): the row's ruled `limit` (use_limit: shown, never tracked) rides with it
      if (words) out.push({ key: t.id + ':' + row.id, name: t.name, words: words, limit: row.limit || null, talentId: t.id, rowId: row.id });   // B-1451: its owner
      else { var s2 = toldS2(t, row, cb); if (s2) out.push({ key: t.id + ':' + row.id, name: t.name, words: '', line: s2.line, at: s2.at, limit: row.limit || null, talentId: t.id, rowId: row.id }); }   // S2
    });
  });
  return out;
}

// the ONE told line (SWRPGUI.ToldLine, lib/shared/ui.jsx — frame F6's .m8-told, D-26; R-M8BG-38/40's limit tag): moved there by
// card `f100-surfacing-yard-concept` ADDENDUM 8 Q2 (a) so the sheet's gun rows and the Yard's seat card draw it too; this name
// stays as its one-line caller for its slicers
function DiceHubTold(props) {
  return h((window.SWRPGUI || {}).ToldLine, props);
}

// R6 S3 (card release-r6-ui ADDENDUM 6; D-278 S3-roll "a roll result with Table 3-8 shown on demand"): once a network's
// check has rolled, ONE door — "Spending the result", with the table's cite — opens Table 3-8's rows as told lines (the hub's
// DiceHubTold: told, never applied). The rows are rewards.json's `contact_results` (ruling release-r6-ui-c0 U7). The door is
// the hub's one fold (SWRPGUI.GearFold) with its own words, so it draws the fold's look. → [] before the roll or the registry.
function diceHubContactResults(given, rolledGiven, reg, open, onToggle) {
  var rows = given && given.kind === 'contact' && rolledGiven && reg && Array.isArray(reg.contact_results) ? reg.contact_results : [];
  var UI = window.SWRPGUI || {};
  if (!rows.length || !UI.GearFold) return [];
  var els = rows.map(function (r, i) { return h(DiceHubTold, { key: 't38' + i, name: r.spend, words: r.result }); });
  var fold = UI.GearFold('t38', els, open, onToggle, 'dice-hub-t38-door');
  return [React.cloneElement(fold[0], { key: 't38door' }, 'Spending the result ' + (open ? '▾' : '▸'),
    h('span', { 'data-testid': 'dice-hub-t38-cite', style: { marginLeft: 'auto', color: 'var(--doc-ink-muted)', fontSize: 'var(--fs-sm)' } }, rows[0].cite))]
    .concat(fold.slice(1));
}

function diceHubWeaponReminders(sheet, poolMods, spec) {
  var sk = spec && spec.skillKey;
  // B-219 (R-B219C-8): the weapon's own quality rows ride first — an OFFERED Cumbersome is this row's offer — the same list
  // computeWeaponPool folded, so a tick here is the tick it takes
  return poolModRemindersFor(((spec && spec.qualityMods) || []).concat(poolMods || []), sk, (sk && (sheetSkillCharacteristic(sheet, sk) || {}).characteristic) || undefined);
}

// F-100 M7 W3 — the lines under a hub skill row (Docs/mockups/f100-m7-correct.html @ 0e35174f, W3; ruling f100-m7-build
// R-M7G-21, -30). Pure and top-level, so a guard EXECUTES it. → { caption, others: [{ characteristic, text }],
// offers: [{ characteristic, text }] } from skillCharacteristic's answer `sc`:
//   caption — only when the skill HAS an alternative: "Rolls with Agility (Renegade Form)" (the best-of's source), or
//             "Rolls with Brawn" when the base wins; with a switch pressed (`using`), "Rolls with Brawn this roll" and the
//             comparison names what is not in use: "Agility would roll 1 yellow, 3 green" (R-M7G-21(b), -32);
//   others  — every characteristic the row could switch to for one roll, alternatives first, then the base. One:
//             "Brawn would roll 1 yellow, 1 green" (its pool, from the dice module). Two or more: "Presence 3 · Makashi
//             Technique", "Brawn 2" (value, and the talent that gives it). The button reads "Use <X> this roll";
//   offers  — the reminders (R-M7K-4: offered, never applied; the strain stays the player's to mark, R-M7G-21(d); a
//             once-per-session offer is offered every time, untracked, (e)): "<Talent> — suffer 2 strain to roll Charm
//             with Cunning" · "<Talent> — once per session, roll this with Cunning" · "<Talent> — navigating on a world?
//             Roll with Intellect". Their button reads "Use".
function m7Gerund(phrase) {
  var m = /^to\s+(\S+)(.*)$/.exec(String(phrase || '').trim());
  if (!m) return String(phrase || '').trim();
  var v = m[1], ing = /[^e]e$/.test(v) ? v.slice(0, -1) + 'ing' : v + 'ing';
  return ing + m[2];
}

function m7HubLines(sheet, key, rank, sc, cb, using) {
  var poolMods = arguments[6];   // F-100 M8 M2: optional, the row's pool mods (a substitution's "+N difficulty"); the header stays M7's (guards slice it)
  var out = { caption: null, others: [], offers: [], subCaption: null, subs: [] };
  if (!sc) return out;
  var chars = (sheet && sheet.characteristics) || {}, name = SKILL_NAMES[key] || key;
  var talentOf = function (because) { return because && because !== 'base' ? m7TalentName(cb, because) : ''; };
  var alts = sc.alternatives || [];
  var all = [{ characteristic: sc.characteristic, because: sc.because }].concat(alts, [{ characteristic: sc.base, because: 'base' }]);
  // R-M7G-21(b) (D-13, frames v5): a pressed switch rolls its characteristic this roll and the caption says so. On a
  // captioned row that is ANY pressed switch, an offer's included (R-M7G-41: the screen never contradicts its dice). The
  // comparison names what is NOT in use, with its pool (R-M7G-32).
  var pressedSub = using && typeof using === 'object' ? using : null;
  var pressed = pressedSub ? null : (using || null);
  if (alts.length) {
    var t = talentOf(sc.because);
    out.caption = pressed ? 'Rolls with ' + m7CapChar(pressed) + ' this roll' : 'Rolls with ' + m7CapChar(sc.characteristic) + (t ? ' (' + t + ')' : '');
    // the options the row could switch to, beside the best-of; each keeps ITS button ("Use <X> this roll")
    var opts = all.filter(function (o, i, a) {
      return o.characteristic !== sc.characteristic && a.findIndex(function (x) { return x.characteristic === o.characteristic; }) === i;
    });
    var poolWords = function (c) {
      var D = window.SWRPGDice, pool = D ? D.buildPool({ characteristic: Number(chars[c]) || 0, skillRank: rank, difficulty: 0 }) : {};
      return [[pool.proficiency, 'yellow'], [pool.ability, 'green']].filter(function (x) { return x[0]; }).map(function (x) { return x[0] + ' ' + x[1]; }).join(', ') || 'no dice';
    };
    opts.forEach(function (o) {
      var text;
      if (opts.length === 1) {
        // one alternative: the comparison names the characteristic NOT in use, with its pool (pressed: the best-of)
        var cmp = pressed === o.characteristic ? sc.characteristic : o.characteristic;
        text = m7CapChar(cmp) + ' would roll ' + poolWords(cmp);
      } else {
        var tn = talentOf(o.because);
        text = m7CapChar(o.characteristic) + ' ' + (Number(chars[o.characteristic]) || 0) + (tn ? ' · ' + tn : '');
      }
      out.others.push({ characteristic: o.characteristic, text: text });
    });
  }
  // offers in the frame's order: a paid offer, then a one-situation offer, then a once-per-session offer (W3 draws
  // Cunning Persona above Clever Solution); data order within a kind
  var kindOf = function (r) { return r.cost ? 0 : r.condition ? 1 : r.limit ? 2 : 3; };
  var LIM = { once_per_round: 'once per round', once_per_encounter: 'once per encounter', once_per_session: 'once per session' };
  (sc.reminders || []).map(function (r, i) { return { r: r, i: i }; })
    .sort(function (a, b) { return kindOf(a.r) - kindOf(b.r) || a.i - b.i; }).map(function (x) { return x.r; }).forEach(function (r) {
    var tn = talentOf(r.because), c = m7CapChar(r.characteristic), text;
    // F-100 THE SURFACING MISSION (roll-options card ADDENDUM 14 F5): a Destiny-priced swap words its price and its limit,
    // the substitute line's words — "Wise Warrior — once per round, spend 1 Destiny Point to roll Brawl with Presence"
    if (r.cost && r.cost.destiny) text = tn + ' — ' + (LIM[r.limit] ? LIM[r.limit] + ', ' : '') + 'spend ' + r.cost.destiny
      + (r.cost.destiny === 1 ? ' Destiny Point' : ' Destiny Points') + ' to roll ' + name + ' with ' + c;
    else if (r.cost && r.cost.strain) text = tn + ' — suffer ' + r.cost.strain + ' strain to roll ' + name + ' with ' + c;
    // R7 B-1471: every limit is worded, not only once per session (reSpecialized's Sly As A Tooka is once per encounter)
    else if (LIM[r.limit]) text = tn + ' — ' + LIM[r.limit] + ', roll this with ' + c;
    else if (r.condition) text = tn + ' — ' + m7Gerund(r.condition) + '? Roll with ' + c;
    else text = tn + ' — roll with ' + c;
    out.offers.push({ characteristic: r.characteristic, text: text });
  });
  // F-100 M8 M2 (f100-m8-batches R-M8BG-233; the approved mockup Docs/mockups/f100-m8-skill-swap.html @ b2aeb49b, drawing
  // (a), D-81): one line per substitute skill, its button "Use <Skill> this roll". The words are the talent's own (its
  // condition verbatim, R-M8BG-238), then what rolls: "Natural Remedy — healing wounds and critical injuries? Roll Survival
  // instead, +1 difficulty" · "Voice of Reason — once per encounter, roll Lore with Presence". Pressed, the row keeps its
  // name and a caption leads: "Rolls Survival this roll (Natural Remedy)" · "Rolls Lore with Presence this roll (…)".
  (sc.substitutes || []).forEach(function (u) {
    var tn = talentOf(u.because), sn = SKILL_NAMES[u.sheetKey] || u.skill, c = m7CapChar(u.characteristic);
    var verb = 'roll ' + sn + (u.to ? ' with ' + c : ' instead'), lead;
    if (u.cost && u.cost.strain) lead = 'suffer ' + u.cost.strain + ' strain to ' + verb;
    else if (u.cost && u.cost.destiny) lead = 'spend ' + u.cost.destiny + (u.cost.destiny === 1 ? ' Destiny Point' : ' Destiny Points') + ' to ' + verb;
    else if (u.limit && LIM[u.limit]) lead = LIM[u.limit] + ', ' + verb;
    else lead = verb;
    // the talent's same-check difficulty adds ride on the line (taken with the swap, diceHubSkillSpec); `poolMods` is the
    // row's own (optional: a caller without it draws no "+N difficulty")
    var add = 0;
    poolModRemindersFor(poolMods, key, u.characteristic).forEach(function (m) {
      if (m.talentId === u.talentId && m.die === 'difficulty' && m.direction === 'add') add += Number(m.count) || 0;
    });
    var text = tn + ' — ' + (u.condition ? m7Gerund(u.condition) + '? ' + lead.charAt(0).toUpperCase() + lead.slice(1) : lead) + (add ? ', +' + add + ' difficulty' : '');
    var val = { skill: u.skill, sheetKey: u.sheetKey, characteristic: u.characteristic, talentId: u.talentId };
    var on = !!(pressedSub && pressedSub.skill === u.skill && pressedSub.talentId === u.talentId);
    out.subs.push({ id: u.talentId + ':' + u.skill, value: val, text: text, btn: 'Use ' + sn + ' this roll', pressed: on });
    if (on) {
      var cap = 'Rolls ' + sn + (u.to ? ' with ' + c : '') + ' this roll' + (tn ? ' (' + tn + ')' : '');
      if (alts.length) out.caption = cap; else out.subCaption = cap;
    }
  });
  return out;
}

function M7HubLine(p) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }} data-m7-hub-line={p.kind}>
      <span style={Object.assign({}, M7_LINE_STYLE, { margin: 0, fontSize: 15 })}>{p.text}</span>
      {p.btn ? <button type="button" className="hp-quiet" aria-pressed={p.pressed ? 'true' : 'false'} data-testid="m7-hub-use" onClick={p.onPress}
        style={p.pressed ? { background: 'var(--doc-action)', color: 'var(--doc-paper-raised)', borderColor: 'var(--doc-action)' } : undefined}>{p.btn}</button> : null}
    </div>);
}

// ══ THE SURFACING HUB (ruling `f100-surfacing-hub-concept` R-SHC-1..13; HANDOFF f100-surfacing-hub-build — ADDENDUM 6 as
// ruled by ADDENDA 7–9). Built from the APPROVED frames `Docs/mockups/f100-surfacing-hub.html` @ 269d99205 (Artifact
// 475TjS78bdX3cheZsS8X4T; D-229 hub (b)(a)(a) @ 3adb14d96 — LAW, R-MIL-1): the chips on the band line (TARGET · DIFFICULTY,
// H1/H4/H5), the MODE ticks (H1), THE SPEND MENU after the roll (H2), the carried-gear fold (H3), the Force row's dials, its
// Duration commit and its barred state (H6). Every number below READS a core — the spend rows SWRPGQualityRows.spendRows,
// the target lines .targetRows, the dials SWRPGPoolMods.powerDialsAt, the commit's dice CharResolve.durationCommitDice,
// affordability SWRPGUI.spendAfford; the hub decides nothing and saves nothing (ticks and chips are EPHEMERAL, one roll).
// H8 (the signature activation) is OUT until B-1310; nothing of it is drawn here.
var DICE_HUB_DIFFICULTY = [['Simple', 0], ['Easy', 1], ['Average', 2], ['Hard', 3], ['Daunting', 4], ['Formidable', 5]];

var DICE_HUB_TARGETS = [['none', 'None'], ['personal', 'Personal'], ['droid', 'Droid'], ['vehicle', 'Vehicle']];

function diceHubDifficultyName(n) {
  var x = DICE_HUB_DIFFICULTY.filter(function (d) { return d[1] === n; })[0];
  return x ? x[0] : String(n);
}

// a spend price in the dice font's own tokens (SWRPGUI.glyphText draws them): [{ad: 2}] → "[AD][AD]"; alternatives " or "
// `fp` (F-100 THE SURFACING MISSION, ADDENDUM 8 F11): a talent spend row priced in Force points
// B-1510 (roll-options card ADDENDUM 38 F3): a third entry is the plural, read where a count is printed; only `fp` has one
var DICE_HUB_SYM = { ad: ['[AD]', 'advantage'], tr: ['[TR]', 'triumph'], th: ['[TH]', 'threat'], de: ['[DE]', 'despair'], su: ['[SU]', 'success'], fp: ['[FP]', 'Force point', 'Force points'] };

function diceHubPriceTokens(req) {
  return (req || []).map(function (c) {
    return Object.keys(c).map(function (k) { var t = (DICE_HUB_SYM[k] || [k])[0], s = ''; for (var i = 0; i < (Number(c[k]) || 0); i++) s += t; return s; }).join('');
  }).join(' or ');
}

function diceHubPriceWords(req) {
  return (req || []).map(function (c) {
    return Object.keys(c).map(function (k) { var s = DICE_HUB_SYM[k] || [k, k]; return c[k] + ' ' + (c[k] !== 1 && s[2] ? s[2] : s[1]); }).join(' + ');
  }).join(' or ');
}

// THE SPEND MENU's rows for one rolled weapon (R-SHC-2 as ADDENDUM 3 errs it; QS1–QS3), pure so a guard executes it.
// `menu` = SWRPGQualityRows.spendRows' rows; `resolved` = the roll's result; `spent` = the menu's ticks in tick order,
// { <row key>: true }. Ticked rows pay first, in tick order, from the roll's symbols (the first clause they can afford); an
// unticked row the rest cannot afford is INERT (R5). QS2: an `any` delta (Jury Rigged) is taken by the FIRST row ticked —
// its price lowered (never below 1), tagged "lowered — <source>", the head line saying where it went; until then every
// row's affordability reads the lowered price, its cap the printed one. QS3: a set field rides as "set — <source>".
// → { rows: [{ key, price (tokens), priceWords, name, text, tags, on, inert, cap }], lines: [text], tally: text }
function diceHubSpendModel(menu, resolved, spent) {
  var UI = window.SWRPGUI || {}, afford = UI.spendAfford || function () { return false; };
  // `fp` (ADDENDUM 8 F11): the roll's light-side pips, which a talent spend row may be priced in — the tally only
  // B-1490 (ADDENDUM 38 F3): the engine's `advantage` is NET (advantage − threat) and it returns `netThreat`, never `threat` —
  // so a net-threat roll offers 0 advantage (never a negative count), and `th` reads `netThreat`
  var r0 = resolved || {}, tally = { ad: Math.max(0, r0.advantage || 0), tr: r0.triumph || 0, th: r0.netThreat || 0, de: r0.despair || 0, su: r0.success || 0, fp: r0.light || 0 };
  var symWords = function (k, n) { var s = DICE_HUB_SYM[k] || [k, k]; return n + ' ' + (n !== 1 && s[2] ? s[2] : s[1]); };   // B-1510
  var left = Object.assign({}, tally);
  var anyD = ((menu && menu[0] && menu[0].anyDeltas) || []).filter(function (d) { return d && d.by; });
  var by = anyD.reduce(function (t, d) { return t + d.by; }, 0), anySrc = anyD.map(function (d) { return d.source; }).filter(Boolean).join(', ');
  var lower = function (req) { return (req || []).map(function (c) { var o = {}; Object.keys(c).forEach(function (k) { o[k] = k === 'ad' ? Math.max(1, c[k] - by) : c[k]; }); return o; }); };
  var hasAd = function (req) { return (req || []).some(function (c) { return c.ad > 0; }); };
  var keyOf = function (r) { return 'spend:' + r.quality + ':' + r.rowId; };
  // B-1470: what the roll shows of each symbol a price reads, in the order the price first names them ([{tr:1},{ad:2}] at
  // 0 triumph and 1 advantage → "0 triumph and 1 advantage"); an advantage-only price reads "<n> advantage" as before
  var shows = function (req) {
    var ks = [];
    (req || []).forEach(function (c) { Object.keys(c).forEach(function (k) { if (ks.indexOf(k) === -1) ks.push(k); }); });
    return ks.map(function (k) { return symWords(k, tally[k] || 0); }).join(' and ');
  };
  // W4 (ADDENDUM 47 F7): a count is a numeral + ONE symbol — "0 [TR] and 1 [AD]"
  var symTok = function (k, n) { return n + ' ' + (DICE_HUB_SYM[k] || [k])[0]; };
  var showsTokens = function (req) {
    var ks = [];
    (req || []).forEach(function (c) { Object.keys(c).forEach(function (k) { if (ks.indexOf(k) === -1) ks.push(k); }); });
    return ks.map(function (k) { return symTok(k, tally[k] || 0); }).join(' and ');
  };
  var byKey = {}; (menu || []).forEach(function (r) { byKey[keyOf(r)] = r; });
  var paid = {}, takenBy = null;
  Object.keys(spent || {}).filter(function (k) { return spent[k] && byKey[k]; }).forEach(function (k) {
    var r = byKey[k], low = !!(by && !takenBy && hasAd(r.req)), req = low ? lower(r.req) : r.req;
    // a talent row priced only in a Destiny Point (`cost`, no `req`) takes nothing from the roll (ADDENDUM 8 F2/F4)
    var clause = r.req ? (req || []).filter(function (c) { return afford([c], left); })[0] : {};
    if (!clause) return;
    Object.keys(clause).forEach(function (s) { left[s] = (left[s] || 0) - clause[s]; });
    if (low) takenBy = r;
    paid[k] = { req: req, lowered: low };
  });
  var rows = (menu || []).map(function (r) {
    var k = keyOf(r), p = paid[k], on = !!p;
    var lowerable = !!(by && hasAd(r.req) && (p ? p.lowered : !takenBy));
    var req = p ? p.req : (lowerable ? lower(r.req) : r.req);
    var inert = !on && !!r.req && !afford(req, left);
    var tags = [];
    // a talent row's price outside the roll and its limit, as offerTags words them (shown, never tracked)
    if ((r.cost || r.limit) && UI.offerTags) tags = tags.concat(UI.offerTags({ cost: r.cost, limit: r.limit }));
    if (r.set && r.set.length && r.set[0].source) tags.push('set — ' + r.set[0].source);
    if (r.repeatMax && r.repeatMax > 1) tags.push('up to ' + r.repeatMax);
    if (p && p.lowered) tags.push('lowered — ' + anySrc);
    var cap = by && hasAd(r.req) ? 'Printed ' + diceHubPriceWords(r.req) + '; ' + diceHubPriceWords(lower(r.req)) + ' with ' + anySrc + '.'
      : (inert ? 'The roll shows ' + shows(r.req) + '; this needs ' + diceHubPriceWords(r.req) + '.' : null);   // B-1470
    var shown = p && p.lowered ? p.req : r.req;
    // S3 (argo-a1-curation ADDENDUM 4): a talent row whose effect words the public copy removed reads its short label, the
    // book line under it (the row's cite); the label is own_words.json's at talents / <id> / spend/<row> (R-AE-7); null on
    // holocron, so the row is as before
    var SS = window.SWRPGSources, s1 = !r.effect && r.talentId && SS && SS.removedLine ? SS.removedLine(null, [r.cite]) : null;
    return { key: k, price: diceHubPriceTokens(shown), priceWords: diceHubPriceWords(shown), name: r.source, text: s1 != null ? ((SS.ownWords && SS.ownWords(r.talentId, 'spend/' + r.rowId)) || '') : r.effect,
      s3: s1 != null ? { label: '', line: s1 } : undefined, tags: tags, on: on, inert: inert, cap: cap };
  });
  // 5h (brief §4/§5/§8; ADDENDUM 62 F5 (a)): a talent row's who tag and box (its cost the row's price), and W4's token form
  // of a cap BESIDE its words (the words stay the screen-reader name)
  rows.forEach(function (o, i) {
    var r = menu[i];
    var who = r.talentId && UI.offerWho ? UI.offerWho(r) : null, info = r.talentId && UI.offerInfo
      ? UI.offerInfo(r.talentId, r.rowId, null, { price: r.req ? o.price : null, priceWords: r.req ? o.priceWords : null, cost: UI.offerTags({ cost: r.cost }) }) : null;
    if (who) o.who = who;
    if (info) o.info = info;
    if (o.cap) o.capTokens = by && hasAd(r.req) ? 'Printed ' + diceHubPriceTokens(r.req) + '; ' + diceHubPriceTokens(lower(r.req)) + ' with ' + anySrc + '.'
      : 'The roll shows ' + showsTokens(r.req) + '; this needs ' + diceHubPriceTokens(r.req) + '.';
  });
  var lines = by ? [by + ' less advantage on one quality you name — ' + anySrc + (takenBy ? ' — used on ' + String(takenBy.source || '').replace(/\s+\d+$/, '') : '')] : [];
  // B-1477 (ADDENDUM 38 F3): the footer names advantage first, as drawn, then every other symbol a ticked row spent, then a
  // ticked row's Destiny Point price (shown, never charged) — one sentence; an advantage-only menu reads as it always did
  var terms = ['ad'].concat(['tr', 'de', 'th', 'su', 'fp'].filter(function (k) { return tally[k] - left[k] > 0; }))
    .map(function (k) { return (tally[k] - left[k]) + ' of ' + symWords(k, tally[k]); });
  var dp = Object.keys(paid).reduce(function (n, k) { var c = byKey[k].cost; return n + ((c && Number(c.destiny)) || 0); }, 0);
  if (dp) terms.push(dp + (dp === 1 ? ' Destiny Point' : ' Destiny Points'));
  var said = terms.length > 1 ? terms.slice(0, -1).join(', ') + ' and ' + terms[terms.length - 1] : terms[0];
  // W4 (5h, F5 (a)): the tally's token form BESIDE its words (the words untouched)
  var tt = ['ad', 'tr', 'de', 'th', 'su', 'fp'].filter(function (k, i) { return !i || tally[k] - left[k] > 0; })
    .map(function (k) { return (tally[k] - left[k]) + ' of ' + symTok(k, tally[k]); });
  if (dp) tt.push(dp + (dp === 1 ? ' Destiny Point' : ' Destiny Points'));
  var withTokens = { rows: rows, lines: lines, tally: said + ' spent' };
  withTokens.tallyTokens = (tt.length > 1 ? tt.slice(0, -1).join(', ') + ' and ' + tt[tt.length - 1] : tt[0]) + ' spent';
  return withTokens;
}

// THE FORCE ROW's menu after its roll (H6; R-SHC-2/5): the power's DIALS (powerDialsAt) priced in Force points, and each
// owned Duration upgrade whose own words name a commit (CharResolve.durationCommitDice > 0) as "Commit ◆◆◆ to sustain" —
// the ONE spend that writes, through the sheet's one writer `onCommit` (session only). Pure, so a guard executes it.
// `light` = the roll's light pips; `spent` = the dial ticks in order; `committed` = the session's set; `available` = free dice.
function diceHubForceMenuModel(dials, durations, light, spent, committed, available) {
  var left = Number(light) || 0, paid = {};
  var keyOf = function (d) { return 'dial:' + d.talentId + ':' + d.rowId; };
  var costOf = function (d) { return Number(d && d.cost && d.cost.force_points) || 0; };
  var byKey = {}; (dials || []).forEach(function (d) { byKey[keyOf(d)] = d; });
  Object.keys(spent || {}).filter(function (k) { return spent[k] && byKey[k]; }).forEach(function (k) {
    var c = costOf(byKey[k]); if (c > left) return; left -= c; paid[k] = true;
  });
  var fp = function (n) { var s = ''; for (var i = 0; i < n; i++) s += '[FP]'; return s; };
  var fo = function (n) { var s = ''; for (var i = 0; i < n; i++) s += '[FO]'; return s; };
  var rows = (dials || []).map(function (d) {
    var k = keyOf(d), c = costOf(d), on = !!paid[k];
    return { key: k, price: fp(c), priceWords: c + (c === 1 ? ' Force point' : ' Force points'), name: d.source, text: d.words || '',
             tags: d.repeatable ? ['repeatable'] : [], on: on, inert: !on && c > left, cap: null };
  }).concat((durations || []).map(function (u) {
    var on = !!(committed && typeof committed === 'object' && committed[u.key]);
    // THE FORCE SWITCH (D-300 (2); ADDENDUM 12 F4 (a)): a Control's row reads '<power> (<upgrade>)' as Duration's does; a
    // STACKING row (Farsight's Control: Perception) counts its held commits as a tag ("×2"), offers ONE commit per roll —
    // ticked, it reads `on` and inert until the next roll (`spent['commit:<key>']`) — and never releases (the sheet's −
    // does). The cap (F5) is diceHubForceMenuCapped's, after this model.
    var tags = ['commit ' + u.dice + ' Force'].concat(u.tag ? [u.tag] : []), inert;
    if (u.stacks) {
      var n = on ? Math.floor((Number(committed[u.key]) || 0) / (u.dice || 1)) : 0;
      if (n) tags.push('×' + n);
      inert = !!(spent && spent['commit:' + u.key]) || (Number(available) || 0) < u.dice;
    } else inert = !on && (Number(available) || 0) < u.dice;
    return { key: 'commit:' + u.key, commitKey: u.key, stacks: !!u.stacks, price: fo(u.dice), priceWords: 'commit ' + u.dice + ' Force ' + (u.dice === 1 ? 'die' : 'dice'),
             name: u.power + ' (' + (u.label || 'Duration') + ')', text: u.words, tags: tags, on: on, inert: inert, cap: null };
  }));
  var used = (Number(light) || 0) - left;
  // W4 (5h, F5 (a)): the token form BESIDE the words
  return { rows: rows, lines: [], tally: used + ' of ' + (Number(light) || 0) + ' Force points spent',
           tallyTokens: used + ' of ' + (Number(light) || 0) + ' [FP] spent' };
}

// THE CAP ON THE HUB'S COMMIT ROWS (ruling `f100-surfacing-force-flip-card` ADDENDUM 12 F5 (a): commitAtCap on EVERY
// commit-costed key; pure, so a guard executes it): `capOf(key)` → the capped quantity's name or null (CharResolve.commitAtCap
// over the sheet and the set as held). A row one more commit would move nothing — a free Control, or a stacking one — is held
// inert with "<name> at its maximum"; a held non-stacking row stays live (its tick releases). Duration keys carry no
// commit-costed effect row, so commitAtCap answers null and their rows pass through untouched.
function diceHubForceMenuCapped(fm, capOf) {
  return Object.assign({}, fm, { rows: (fm.rows || []).map(function (r) {
    if (!r.commitKey || (r.on && !r.stacks)) return r;
    var c = capOf ? capOf(r.commitKey) : null;
    return c ? Object.assign({}, r, { inert: true, cap: c + ' at its maximum' }) : r;
  }) });
}

// a power's owned Duration upgrades that commit dice: [{ key: '<power>.<ability>', power, dice, words }] (R-SHC-5, C2)
// THE FORCE SWITCH (ruling `f100-surfacing-force-flip-card` §2.8 of its brief; D-300 (2); ADDENDUM 12 F4): WIDENED in place, the
// name kept — it also lists each owned non-basic upgrade with an `effects` row costed `commit_force`
// (Enhance's Control: Brawn / Agility, Farsight's Control: Perception), so the sheet's ticks and the hub's rows read ONE list.
// Every row: { key, power, dice, words, label ('Duration' | the upgrade's name), stacks (commitStacks), tag }. The TAG by one
// rule (ADDENDUM 8 F6): the ability's words "after successfully activating the <P> power" → "after a successful <P> check"
// (Farsight's Control: Perception alone today).
function diceHubDurationCommits(fp, cb) {
  var rec = fp && fp.id && cb && cb.forcePowers ? cb.forcePowers[fp.id] : null, out = [];
  if (!rec || !rec.abilities || !window.CharResolve || !CharResolve.durationCommitDice) return out;
  (fp.upgradeKeys || []).forEach(function (k) {
    var ab = rec.abilities[k];
    if (!ab) return;
    var abWords = ab.description || diceHubRuleText('force_powers', fp.id, 'abilities.' + k + '.description') || '';   // A5
    if (ab.family === 'duration') {
      var n = CharResolve.durationCommitDice(ab);
      if (n > 0) out.push({ key: fp.id + '.' + k, power: rec.name || fp.name, dice: n, words: abWords, label: 'Duration', stacks: false, tag: null });
      return;
    }
    if (ab.family === 'basic' || !(ab.effects || []).some(function (e) { return e && e.cost && e.cost.commit_force; })) return;
    if (out.some(function (u) { return u.key === fp.id + '.' + k; })) return;   // an upgrade owned twice ticks once
    var v = CharResolve.commitValueOf(fp.id + '.' + k, cb), d = v === true ? 1 : v;
    if (!(d > 0)) return;
    var tm = CharResolve.afterPowerName ? CharResolve.afterPowerName(ab, cb) : null;   // `after_power`, else the parse (D3/D4)
    out.push({ key: fp.id + '.' + k, power: rec.name || fp.name, dice: d, words: abWords, label: ab.name || k,
               stacks: !!(CharResolve.commitStacks && CharResolve.commitStacks(fp.id + '.' + k, cb)), tag: tm ? 'after a successful ' + tm + ' check' : null });
  });
  return out;
}

// H4 (R-SHC-8, D-229 Q2 (a)): what the weapon's qualities do to the TARGET chosen, after the roll — from targetRows' rows:
// "Ion: damage dealt as system strain — vs a vehicle (EotE p.156)", "Pierce 2 — ignores up to 2 soak". No soak or wound is
// entered (the app does not simulate the target).
function diceHubTargetLines(tr, kind) {
  var Q = window.SWRPGQualityRows, KIND = { personal: 'a person', droid: 'a droid', vehicle: 'a vehicle' };
  var cite = function (c) { return c && Q && Q.citeWords ? ' (' + Q.citeWords(c) + ')' : ''; };
  return ((tr && tr.rows) || []).map(function (r) {
    // W5 (D-332; ADDENDUM 58 ITEM 2, 5h): a soak-ignoring row says it in the book's own sentence — "…; this strain is not reduced by soak"
    if (r.op === 'damage_as') { var vw = String(r.value).replace(/_/g, ' ');
      return r.source + ': damage dealt as ' + vw + (r.soak === 'ignored' ? '; this ' + vw + ' is not reduced by soak' : '') + ' — vs ' + (KIND[kind] || kind) + cite(r.cite); }   // soak: a talent row's member (Pressure Point; ADDENDUM 25 F3, an ITEM for Jason)
    if (r.op === 'soak_ignore') return r.source + ' — ignores up to ' + r.amount + ' soak';
    if (r.op === 'armor_ignore') return kind === 'vehicle' ? r.source + ' — ignores up to ' + r.amount + ' armor' : r.source + ' — ignores up to ' + (10 * r.amount) + ' soak';
    return null;
  }).filter(Boolean);
}

// H5 (R-SHC-10): a TICKED floored difficulty removal the fold left alone (the pool is at its floor) says so — "Difficulty
// stays 1 — Master Doctor removes none below the floor (EotE p.138)". `reminders` = the row's offers, `taken` its ticks.
function diceHubFloorLines(spec, reminders, taken, talents) {
  var D = window.SWRPGDice, Q = window.SWRPGQualityRows, changes = (spec && spec._poolModChanges) || [];
  var built = D && spec ? D.buildPool(spec) || {} : {};
  return (reminders || []).map(function (m) {
    if (!m || !m.key || !(taken && taken[m.key]) || m.die !== 'difficulty' || m.direction !== 'remove') return null;
    var rec = talents && m.talentId ? talents[m.talentId] : null;
    var row = rec ? (rec.pool_mods || []).filter(function (r) { return r && r.id === m.id; })[0] : null;
    if (!row || row.floor == null) return null;
    if (changes.some(function (c) { return c.taken && c.source === m.source && c.die === 'difficulty'; })) return null;
    return 'Difficulty stays ' + (built.difficulty || 0) + ' — ' + m.source + ' removes none below the floor'
      + (row.cite && Q && Q.citeWords ? ' (' + Q.citeWords(row.cite) + ')' : '');
  }).filter(Boolean);
}

// the band chip's idiom for the two new chips (their OWN testids, so D2's one-band-chip pins hold; ink: sheet.css)
function DiceHubChip(p) {
  return h('span', { className: 'dh-chip', style: { display: 'inline-flex', alignItems: 'center', gap: 9 } },
    h('span', { style: { fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.16em', color: 'var(--doc-ink-muted)' } }, p.label),
    h('button', { type: 'button', 'data-testid': p.testid, 'aria-expanded': p.open ? 'true' : 'false', 'aria-label': p.aria + ': ' + p.value, onClick: p.onToggle,
      style: { minHeight: 44, padding: '0 13px', borderRadius: 9, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7, touchAction: 'manipulation',
        fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 'var(--fs-sm)' } },
      p.value, h('span', { 'aria-hidden': 'true', style: { fontSize: 10 } }, '▾')));
}

function DiceHubChipStrip(p) {
  return h('div', { role: 'group', 'aria-label': p.label, 'data-dh-strip': p.kind, style: { display: 'grid', gridTemplateColumns: 'repeat(' + (p.cols || 3) + ',1fr)', gap: 5, marginTop: 7 } },
    p.options.map(function (o) {
      return h('button', { key: o.key, type: 'button', 'data-testid': p.testid, 'aria-pressed': o.on ? 'true' : 'false', onClick: function () { p.onPick(o.key); },
        style: { minHeight: 44, minWidth: 0, borderRadius: 8, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 1, fontFamily: 'var(--font-body)', padding: '0 3px' } },
        h('span', { style: { fontSize: 13, fontWeight: 600, lineHeight: 1.1 } }, o.v),
        o.sub ? h('span', { style: { fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.06em' } }, o.sub) : null);
    }));
}

// THE SPEND MENU (R-SHC-2, the one new shape): under the result, in place — the head, any head line (QS2), one row per
// activation (its price in the dice symbols, the ONE offer row's tick, the effect, the source), the tally.
function DiceHubSpend(p) {
  var UI = window.SWRPGUI || {};
  if (!UI.OfferRow) return null;
  return h('div', { 'data-testid': 'dice-hub-spend', className: 'dh-spend' },
    h('div', { className: 'sb-grp dh-spend-head' }, 'What the roll buys', p.note ? h('span', null, p.note) : null),
    (p.lines || []).map(function (t, k) { return h(DiceHubStatusLine, { key: 'hl' + k, tone: 'var(--text-info)' }, t); }),
    p.rows.map(function (r) {
      return h('div', { key: r.key, 'data-testid': 'dice-hub-spend-row', 'data-spend-key': r.key, className: 'dh-spend-row', 'data-inert': r.inert ? '1' : '0' },
        h('span', { className: 'dh-spend-price', role: 'img', 'aria-label': r.priceWords }, UI.glyphText ? UI.glyphText(r.price) : r.price),
        h('div', { className: 'dh-spend-body' }, h(UI.OfferRow, { offerKey: r.key, name: r.name, text: r.text, s3: r.s3, tags: r.tags, on: r.on, inert: r.inert, cap: r.cap,
          capTokens: r.capTokens, who: r.who, info: r.info, onToggle: function () { p.onToggle(r); } })));
    }),
    h('div', { 'data-testid': 'dice-hub-spend-tally' }, h(DiceHubStatusLine, { tone: 'var(--doc-ink-muted)', glyph: '·' },
      // W4 (5h, F5 (a)): the token form drawn, the words its screen-reader name; absent (the key OFF), the words as before
      p.tallyTokens && UI.glyphText ? h('span', { role: 'img', 'aria-label': p.tally }, UI.glyphText(p.tallyTokens)) : p.tally)));
}

// H3 (D-229 Q1 (b), ADDENDUM 7 Q3 (a)): a row's offers OWNED by carried gear (holder 'gear'), folded behind ONE line. Worn armour
// and the weapon in hand stay open. Ephemeral per row. The fold is the ONE shared one (SWRPGUI.GearFold, lib/shared/ui.jsx; yard
// ADDENDUM 8 Q2 (a), B-1389's one style); this name stays as its one-line caller for its slicers.
function diceHubGearFold(rowKey, els, open, onToggle) {
  return (window.SWRPGUI || {}).GearFold(rowKey, els, open, onToggle, 'dice-hub-gear-fold');
}

// B-1453 (D-406 item 12): a talent's or species' conditional offer anchored to EVERY check (`anyCheck`: Shortcut's "During a
// chase") folds behind ONE line — "1 more for a situation ▸" — in the carried-gear fold's look (H3), closed by default; nothing
// prompts (D-319). Its open state rides gearOpen under '<rowKey>:sit'. Carried gear stays in its own fold.
function diceHubSituational(m) { return !!(m && m.holder !== 'gear' && m.anyCheck && m.reason === 'condition'); }

function diceHubSituationFold(rowKey, els, gearOpen, onToggle) {
  return (window.SWRPGUI || {}).GearFold(rowKey + ':sit', els, !!(gearOpen && gearOpen[rowKey + ':sit']), onToggle, 'dice-hub-situation-fold', ' more for a situation');
}

// B-1488 (roll-options card ADDENDUM 38 F4 (a)): every sheet's hub offers the Unarmed rules profile (weapons.json `unarmed`,
// store-hidden) — the row the pregens already list and draw — so a character made in the creator has its Brawn-damage Brawl
// row, and Iron Body's and a species' claws lines (`weapon_record: unarmed`) a row to sit on. Appended LAST and only when no
// listed weapon IS `unarmed` (its regId), so every existing row keeps its index (band, ticks, the 'w'+i keys). Pure, so a
// guard executes it; the sheet is never written (resolve-at-render).
function diceHubWeaponsWithUnarmed(weapons, sheet) {
  var list = weapons || [];
  if (list.some(function (w) { return w && w.regId === 'unarmed'; })) return list;
  var u = (resolveSheetEquipment({ weapons: [{ id: 'unarmed' }] }, sheet).weapons || [])[0];
  return u && !u._unresolved ? list.concat([u]) : list;
}

function DiceHub({ sheet, accent, onClose, initialStrip, committed: committedProp, onCommit, onChoosePick, treat, onTreated, given }) {
  var win = useDragWindow();
  // B-1779 (ruling release-r7-bug-burndown ADDENDUM 695): every close hands focus back to the control that opened the hub. The
  // door is read at the FIRST render, while the opener still holds focus, by SWRPGUI's door rule; on close it is focused only
  // when focus is LOST (nothing, BODY, or inside the hub), so a page control the user tabbed to keeps it. Non-modal: no trap
  // (D-DH-6, ADDENDUM 625). The back pick is holdFocus's own (`doorBack`), not a copy.
  var doorRef = React.useRef(null), scrimRef = React.useRef(null);
  if (!doorRef.current) doorRef.current = (window.SWRPGUI || {}).holdDoor ? window.SWRPGUI.holdDoor(document.activeElement) : { door: null, trigger: null };
  React.useEffect(function () {
    var scrim = scrimRef.current;
    return function () {
      var a = document.activeElement, UI = window.SWRPGUI || {};
      if (a && a !== document.body && !(scrim && scrim.contains(a))) return;
      var back = UI.doorBack ? UI.doorBack(doorRef.current, null) : null;
      if (back) back.focus();
    };
  }, []);
  var _band = React.useState({}), band = _band[0], setBand = _band[1];        // EPHEMERAL (R-DRB-2)
  // B-611 (R-PSC-2): ROLL on the paper stage opens the hub ON THAT SKILL's strip — the same overlay,
  // landing where the press was. `initialStrip` is a sheet skill key; the hub lists trained skills,
  // so an untrained key joins the list for this opening (its pool is the ability dice alone).
  var _open = React.useState(initialStrip != null ? initialStrip : null), openStrip = _open[0], setOpenStrip = _open[1];   // a weapon strip is its INDEX, and 0 is a strip
  // B-1930 (ruling release-r7-bug-burndown ADDENDUM 779, shape A): the hub LANDS on the pressed row. A row wholly inside the
  // body's visible box stays put; otherwise the body (the hub's own scroller) is set, at once, so the row's top sits under its
  // section's sticky head. Once per opening, and only the body moves: no focus change (B-1779), the sheet beneath untouched
  // (D-DH-6). A weapon strip is its index (row `w<i>`); a skill or Force strip is the row key itself.
  var landedRef = React.useRef(initialStrip == null);
  React.useLayoutEffect(function () {
    if (landedRef.current) return;
    var w = win.ref.current, body = w && w.querySelector('.sb-dh-body');
    var rk = typeof initialStrip === 'number' ? 'w' + initialStrip : String(initialStrip);
    var row = body && body.querySelector('[data-dh-row="' + (window.CSS && CSS.escape ? CSS.escape(rk) : rk) + '"]');
    if (!row) return;   // its rows are not drawn yet; the next render tries again
    landedRef.current = true;
    var br = body.getBoundingClientRect(), rr = row.getBoundingClientRect();
    var band = row.parentElement, head = band && band.previousElementSibling;
    // the head is offset only where it really sticks (measured: in the hub `.sb-grp` draws `relative` today, so the row's
    // top meets the body's top)
    var stick = head && head.classList.contains('sb-grp') && getComputedStyle(head).position === 'sticky' ? head.getBoundingClientRect().height : 0;
    if (rr.top >= br.top + stick && rr.bottom <= br.bottom) return;
    body.scrollTop += rr.top - br.top - stick;
  });
  var _rolled = React.useState({}), rolled = _rolled[0], setRolled = _rolled[1];
  // D-352: the row key of the LATEST roll — the one result that may offer a Reroll (older results show none)
  var _latest = React.useState(null), latestKey = _latest[0], setLatest = _latest[1];
  // F-100 M8 step 3 (R-M8B-12, way 1 of every fork): a row's ticked offers, { <rowKey>: { <offerKey>: true } }. A tick lasts
  // ONE roll — rolling clears the row's ticks (a); every offer opens unticked, with no setting (c); nothing is written to
  // the character or any store. EPHEMERAL, like the band and the switch.
  var _ticks = React.useState({}), ticks = _ticks[0], setTicks = _ticks[1];
  function toggleOffer(rowKey, key) {
    setTicks(function (m) { var n = Object.assign({}, m), r = Object.assign({}, n[rowKey] || {}); if (r[key]) delete r[key]; else r[key] = true; n[rowKey] = r; return n; });
    setRolled(function (m) { var n = Object.assign({}, m); delete n[rowKey]; return n; });
  }
  // THE SURFACING HUB's controls — EPHEMERAL like the band (never written anywhere; gone when the hub closes):
  //   dset    { <rowKey>: n }      the DIFFICULTY chip, moved (ADDENDUM 7 Q6 (a): an unmoved chip reads the row's own
  //                                price and follows RANGE; a moved one holds for ONE roll — the roll clears it)
  //   tgt     { <rowKey>: kind }   the TARGET chip (D-229 Q2 (a)); 'none' / absent = no target
  //   chipOpen{ <rowKey>: 'target' | 'difficulty' }  the one open chip strip of a row
  //   gearOpen{ <rowKey>: true }   the carried-gear fold, open (D-229 Q1 (b)); closed by default, a roll leaves it
  var _dset = React.useState({}), dset = _dset[0], setDset = _dset[1];
  var _tgt = React.useState({}), tgt = _tgt[0], setTgt = _tgt[1];
  var _chip = React.useState({}), chipOpen = _chip[0], setChipOpen = _chip[1];
  var _gf = React.useState({}), gearOpen = _gf[0], setGearOpen = _gf[1];
  // R6 S3 (card release-r6-ui ADDENDUM 6): after a network's check, Table 3-8 on demand — rewards.json's contact_results
  // (U7), fetched only when the hub opens on a network. The door is EPHEMERAL, like the gear fold.
  var _t38 = React.useState(false), t38Open = _t38[0], setT38Open = _t38[1];
  // ENCOUNTERS (R-E3S-4, CONTRACT 3): a window with NO sheet (the GM's NPC roll) draws its given row and the reference only,
  // and makes no host load — the host's hooks below run on a sheet path only (a mount's sheet never comes or goes)
  if (sheet) bindSheetPool();
  var rwdReg = sheet ? useRewardsReg(!!(given && given.kind === 'contact')) : null;
  var dropKey = function (m, k) { if (!(k in m)) return m; var n = Object.assign({}, m); delete n[k]; return n; };
  function toggleGear(rowKey) { setGearOpen(function (m) { var n = Object.assign({}, m); if (n[rowKey]) delete n[rowKey]; else n[rowKey] = true; return n; }); }
  function toggleChip(rowKey, kind) {
    setChipOpen(function (m) { var n = Object.assign({}, m); if (n[rowKey] === kind) delete n[rowKey]; else n[rowKey] = kind; return n; });
    setOpenStrip(null);   // one strip open at a time on a row: the RANGE strip closes
  }
  function pickDifficulty(rowKey, n) {
    setDset(function (m) { var x = Object.assign({}, m); x[rowKey] = n; return x; });
    setChipOpen(function (m) { return dropKey(m, rowKey); });
    setRolled(function (m) { return dropKey(m, rowKey); });
  }
  function pickTarget(rowKey, kind) {   // the pool does not change; a shown result keeps its lines, now for this target
    setTgt(function (m) { var x = Object.assign({}, m); if (kind === 'none') delete x[rowKey]; else x[rowKey] = kind; return x; });
    setChipOpen(function (m) { return dropKey(m, rowKey); });
  }
  // the spend menu's ticks live WITH the roll (`rolled[key].spent`): a new roll is a new menu; nothing is saved
  function toggleSpend(rowKey, key) {
    setRolled(function (m) {
      var r = m[rowKey]; if (!r) return m;
      var sp = Object.assign({}, r.spent || {}); if (sp[key]) delete sp[key]; else sp[key] = true;
      var n = Object.assign({}, m); n[rowKey] = Object.assign({}, r, { spent: sp }); return n;
    });
  }
  // F-100 M7 W3 (R-M7G-21(a), -30): a skill row's switch, { <key>: <characteristic> } — for ONE roll, then it reverts.
  // EPHEMERAL: never written to the sheet, gone when the hub closes.
  var _sw = React.useState({}), sw = _sw[0], setSw = _sw[1];
  var _ref = React.useState(false), refOpen = _ref[0], setRefOpen = _ref[1];
  var whyG = window.SWRPGUI.useWhyPress();   // post1-one-number-hub-build C2: the rows' ONE press, one sheet open at a time
  var canonReady = sheet ? useCanonicalReady() : true;   // B-241: now waits on the CHARBUILD too, not just the registries
  // Escape closes — the no-trap escape D-DH-6 requires, alongside the scrim and the ✕.
  React.useEffect(function () {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return function () { document.removeEventListener('keydown', onKey); };
  }, [onClose]);

  var equipment = React.useMemo(function () { return sheet ? resolveSheetEquipment(sheet.equipment, sheet) : null; }, [sheet, canonReady]);
  // B-240: mine, from the F-87 lap — six neighbouring call sites passed the charbuild and this
  // one did not. `derived` gates the FORCE section AND feeds computeWeaponPool's Force dice.
  var derived = sheet ? CharResolve.computeDerived(sheet, equipment, window._canonicalCharbuild) : null;
  var enc = sheet ? CharResolve.computeEncumbrance(equipment, sheet.characteristics || {}, CharResolve.speciesEncumbranceDelta(sheet)) : null;
  // R-PCA-2: ONE collect for the whole hub, through the seam every other surface uses. What each
  // row does with it — apply, remind, ignore — is the assembler's answer, not the hub's.
  var _tvEpoch = window.SWRPGTalentView.useTalentViewEpoch();   // A3-2 / B-844: a talent's dice resolve through the stamp view — the memo keys on its epoch
  // F-100 M10 (R-M10B-6c): the session's committed set rides in, so a row counting the Force rating reads the dice LEFT
  // (CharResolve.forceDiceAvailable, the same function as `available` below) — DARK: with the key OFF it reads nothing.
  var poolMods = React.useMemo(function () { return sheet ? collectPoolMods(equipment, { committed: committedProp || 0 }) : []; }, [equipment, _tvEpoch, committedProp]);
  var D = window.SWRPGDice;

  function doRoll(key, spec) {
    var res = D.rollAndResolve(D.buildPool(spec));
    var r = res.resolved || res;
    // the automatic symbols this roll carried, named under the result (frame R5)
    var auto = ((spec && spec._poolModChanges) || []).filter(function (c) { return c.symbol; });
    setRolled(function (m) {
      var n = Object.assign({}, m);
      // B-1263 C-4: the pool ROLLED, ticks included; `taken` = the ticks it rolled with (the spend menu lists a ticked
      // MODE's rows, R-SHC-4); `spent` = the spend menu's ticks (R-SHC-2), empty at the roll
      n[key] = { resolved: r, aria: D.formatResults(r), auto: auto, spec: spec, taken: ticks[key] || null, spent: {} };
      // B-1820 (release-r7-bug-burndown ADDENDUM 621 (c)): `set` = the DIFFICULTY chip it rolled at, so the chip reads the roll
      // while its result shows (the pool's own difficulty can sit under it: Master Doctor)
      n[key].set = dset[key];
      return n;
    });
    setTicks(function (m) { if (!m[key]) return m; var n = Object.assign({}, m); delete n[key]; return n; });   // (a): one roll
    setLatest(key);   // D-352: this result is now the latest
    setDset(function (m) { return dropKey(m, key); });   // ADDENDUM 7 Q6 (a): a moved DIFFICULTY chip holds for one roll
    return r;   // the treat row writes from the roll it made (B-1209 retire)
  }
  // F-100 THE SURFACING MISSION (D-294 L3): Reroll — the ONE roll again over the pool rolled, its ticks carried, marked
  function rerollRow(key, name) {
    var prev = rolled[key]; if (!prev) return;
    var patch = diceHubReroll(doRoll, key, prev, name);
    // B-1820: the reroll rolls the pool rolled, so it keeps that roll's chip (`set`); the hold already dropped `dset`
    setRolled(function (m) { if (!m[key]) return m; var n = Object.assign({}, m); n[key] = Object.assign({}, m[key], patch, { set: prev.set }); return n; });
  }
  // D-294 L2: a talent's target tick reads the roll's ticks while a result shows (the tick taken at the roll stays ticked,
  // as drawn); pressing it sets this row's ticks from what it SHOWS and clears the result, as toggleOffer does
  function toggleTarget(rowKey, key, shownOn) {
    setTicks(function (m) { var n = Object.assign({}, m), r = Object.assign({}, n[rowKey] || {}); if (shownOn) delete r[key]; else r[key] = true; n[rowKey] = r; return n; });
    setRolled(function (m) { var n = Object.assign({}, m); delete n[rowKey]; return n; });
  }
  // the lines under a rolled row: what the result already includes (an automatic symbol), named
  function rolledLines(key) {
    var r = rolled[key];
    return r && r.auto ? r.auto.map(function (c, k) {
      return h(DiceHubStatusLine, { key: 'ra' + k, m8: 'applied', tone: 'var(--text-info)' }, 'The result includes +' + (c.to - c.from) + ' ' + c.symbol + ' — ' + c.source);
    }) : [];
  }
  // the owner's unmade skill picks, asked on the rows they could reach (R-M8K-6 (a))
  var unmade = React.useMemo(function () {
    if (!sheet) return [];
    var cb = (CharResolve.talentViewFor && CharResolve.talentViewFor(sheet)) || window._canonicalCharbuild;
    try { return cb && cb.talents && CharResolve.unmadeRollPicks ? CharResolve.unmadeRollPicks(sheet, cb) : []; } catch (e) { return []; }
  }, [sheet, canonReady, _tvEpoch]);
  var poolIdx = sheet ? poolModSkillIndex() : null;

  // ── WEAPONS ────────────────────────────────────────────────────────────────────────────────
  var weaponRows = (sheet ? diceHubWeaponsWithUnarmed(equipment.weapons, sheet) : []).map(function (w, i) {   // B-1488
    var chosen = band[i] || null;
    var rk = 'w' + i;
    // R7 B-1454: a ticked mode's range cap (Stun setting: "their range changes to short and cannot be increased", EotE p.157)
    // is the core's (`rangeCap`); a band chosen past it gives way to it while the mode is ticked, and comes back unticked
    var capOf = ticks[rk] ? computeWeaponPool(sheet, w, null, derived, accent, equipment, ticks[rk], dset[rk], committedProp) : null;
    var cap = (capOf && capOf.rangeCap) || null;
    if (cap && chosen && DICE_HUB_BANDS.indexOf(chosen) > DICE_HUB_BANDS.indexOf(cap)) chosen = null;
    var spec = computeWeaponPool(sheet, w, chosen, derived, accent, equipment, ticks[rk], dset[rk], committedProp);
    if (!spec) return null;   // R-M7G-9: no pool before the vocabulary loads — the row draws when it lands
    // R-BBL-3: the chip appears only where CHOOSING CHANGES SOMETHING. Derived from what the core
    // returns for each band — never a skill list — so melee rows (band-invariant) and single-band
    // weapons both fall out as static labels without the hub deciding anything.
    // R7 B-1454: each band is read with ONLY the capping mode's tick, so a band past the cap reads BARRED (greyed, "Beyond the
    // weapon's range.") and no other ticked offer re-prices the strip
    var capTaken = null;
    if (cap) (spec.modes || []).forEach(function (m) { if (m.rangeMax && ticks[rk][m.key]) (capTaken = capTaken || {})[m.key] = true; });
    var byBand = DICE_HUB_BANDS.map(function (b) { return { band: b, spec: computeWeaponPool(sheet, w, b, derived, accent, equipment, capTaken) }; });
    var legal = byBand.filter(function (x) { return !x.spec.barred; });
    var prices = {}; legal.forEach(function (x) { prices[x.spec.difficulty] = 1; });
    var hasChip = legal.length > 1 && Object.keys(prices).length > 1;
    var shownBand = chosen || cap || w.range || '—';
    var name = w.nickname ? '“' + w.nickname + '” · ' + w.name : w.name;
    var lines = [];
    // B-1820 (ADDENDUM 621 (c)): while a result shows, the row's difficulty parts (this line, the chip, its strip) read the
    // pool ROLLED, as the drawn pool does (B-1286); with no result, the live spec
    var dSpec = (rolled[rk] && rolled[rk].spec) || spec;
    if (!spec.barred) {
      lines.push(dSpec.difficultySet != null
        // the DIFFICULTY chip moved (R-SHC-10): the number rolled is the player's for this roll, not the range's
        ? h(DiceHubStatusLine, { key: 'd', tone: 'var(--text-caution)' }, '+' + dSpec.difficultySet + ' difficulty — ' + diceHubDifficultyName(dSpec.difficultySet) + ', set at the table')
        : h(DiceHubStatusLine, { key: 'd', tone: 'var(--text-caution)' },
        '+' + dSpec.rangeDifficulty + ' difficulty — ' + shownBand + ' range ',   // B-219: the range's own, never a quality's
        h('span', { style: { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)', color: 'var(--doc-ink-muted)' } },
          '(' + (chosen || cap ? 'set at table' : 'printed') + ')')));
      if (spec.encumbranceSetback) lines.push(h(DiceHubStatusLine, { key: 's', tone: 'var(--text-caution)' },
        '+' + spec.encumbranceSetback + ' setback — over encumbrance (' + enc.carried + '/' + enc.limit + ')'));   // B-219: the load's own
    }
    // The item half. `computeWeaponPool` already FOLDED the auto-applying dice into `spec` — the
    // hub never applies anything itself — so these two calls only report what that one builder did
    // and what it deliberately left out. Both ask about THIS weapon's own skill (`spec.skillKey`,
    // resolved once inside the builder), which is why a Ranged (Light) weapon no longer collects
    // the whole `combat` group's reminders the way the hand-rolled bucket did.
    // F-100 M8 step 3 (frames F1 R1/R3): the talent damage APPLIED at this attack, beside the damage and never in it,
    // with its band or its pick named; an unmade pick this attack could use asks and adds nothing (R6)
    var dl = spec.damageLines || null;
    // B-1451: its (i), read through the owner's view so a species-owned line ("species:<id>:<ability>") resolves too
    var dlTal = dl && (window.SWRPGUI || {}).offerTalentsFor ? window.SWRPGUI.offerTalentsFor(sheet || null, dl.applied) : null;
    if (!spec.barred && dl) dl.applied.filter(function (l) { return l.amount; }).forEach(function (l, k) { lines.push(h(DiceHubStatusLine, { key: 'dl' + k, m8: 'applied', tone: 'var(--text-info)',
      info: diceHubLineInfo(l.talentId, l.rowId, dlTal), infoKey: l.talentId + ':' + l.rowId }, diceHubDamageLineText(l, shownBand))); });
    var cl = spec.barred ? null : diceHubCritLine(spec, sheet);
    if (cl) lines.push(h(DiceHubStatusLine, { key: 'cl', m8: 'applied', tone: 'var(--text-info)' }, cl));
    DiceHubAppliedLines(spec, SKILL_NAMES[spec.skillKey], spec.qualityMods, sheet).forEach(function (el) { lines.push(el); });
    if (!spec.barred && window.SWRPGPoolMods && poolIdx && spec.skillKey)
      diceHubPromptsFor(unmade, window.SWRPGPoolMods.contextFor(spec.skillKey, poolIdx)).forEach(function (q, k) {
        lines.push(h(DiceHubPickPrompt, { key: 'pp' + k, pick: q, onChoose: onChoosePick || null })); });
    // R-SHC-4 (H1): the weapon's MODES first, each ONE tick tagged MODE above the other offers — its words its rows' own
    // ("Auto-fire — +1 difficulty"), or the mode's (R3: "Stun Setting — damage dealt as strain; Short range at most"); the
    // tick toggles the mode's key, which computeWeaponPool's fold takes (unticked, a mode applies nothing)
    var UIh = window.SWRPGUI || {};
    if (!spec.barred && UIh.OfferRow) (spec.modes || []).forEach(function (m) {
      var txt = (m.poolRows || []).map(function (r) { return UIh.offerEffect ? UIh.offerEffect(r) : ''; }).filter(Boolean).join('; ') || m.words || '';
      lines.push(h(UIh.OfferRow, { key: 'md' + m.key, offerKey: m.key, name: m.source, text: txt, tags: ['mode'], on: !!(ticks[rk] && ticks[rk][m.key]),
        onToggle: function () { toggleOffer(rk, m.key); } }));
    });
    // F-100 THE SURFACING MISSION (D-294 L2; ADDENDUM 8 F5/F6): a talent's TARGET ticks right after the mode ticks, untagged —
    // "Pressure Point — Deal as strain (+Medicine)" (talentTargetOffers, DARK OFF); while a result shows, the tick reads the
    // roll's own ticks (`taken`), so the damage words and the TARGET echo below agree with it
    var Pw = window.SWRPGPoolMods, Qw = window.SWRPGQualityRows;
    var wcb = (CharResolve.talentViewFor && CharResolve.talentViewFor(sheet)) || window._canonicalCharbuild || {};
    var wctx = !spec.barred && Pw && poolIdx && spec.skillKey ? Pw.contextFor(spec.skillKey, poolIdx) : null; if (wctx && w.regId) wctx.weapon = w.regId;   // the row's record, as computeWeaponPool's rctx (R-M8K-25): Pressure Point's tick sits on the Unarmed row only (roll-options card ADDENDUM 25 F1)
    var tOffers = wctx && wcb.talents && Qw && Qw.talentTargetOffers ? Qw.talentTargetOffers(sheet, wcb, wctx) : [];
    var tNow = ticks[rk] || (rolled[rk] && rolled[rk].taken) || null;
    if (UIh.OfferRow) tOffers.forEach(function (o) {
      var on = !!(tNow && tNow[o.key]);
      lines.push(h(UIh.OfferRow, { key: 'tt' + o.key, offerKey: o.key, name: o.source, text: o.label, tags: [], on: on, onToggle: function () { toggleTarget(rk, o.key, on); },
        who: UIh.offerWho ? UIh.offerWho(o) : null, info: UIh.offerInfo ? UIh.offerInfo(o.talentId, o.rowId, wcb.talents) : null }));   // 5h: null with the key OFF
    });
    // H3 (D-229 Q1 (b)): carried gear's offers fold behind one line; the weapon's own, the armour's, talents' and species' stay open
    var wRem = diceHubWeaponReminders(sheet, poolMods, spec);
    diceHubOfferEls(rk, wRem.filter(function (m) { return m.holder !== 'gear' && !diceHubSituational(m); }),
      (!spec.barred && dl ? dl.offered : []).concat(!spec.barred && spec.critSetLines ? spec.critSetLines.offered : []), ticks[rk], toggleOffer, sheet)
      .forEach(function (el) { lines.push(el); });
    diceHubSituationFold(rk, diceHubOfferEls(rk, wRem.filter(diceHubSituational), [], ticks[rk], toggleOffer, sheet), gearOpen, toggleGear)
      .concat(diceHubGearFold(rk, diceHubOfferEls(rk, wRem.filter(function (m) { return m.holder === 'gear'; }), [], ticks[rk], toggleOffer, sheet), !!gearOpen[rk], toggleGear))
      .forEach(function (el) { lines.push(el); });
    if (!spec.barred) diceHubToldFor(sheet, spec.skillKey)
      .forEach(function (t) { lines.push(h(DiceHubTold, { key: 'td' + t.key, name: t.name, words: t.words, line: t.line, at: t.at, limit: t.limit, talentId: t.talentId, rowId: t.rowId })); });
    lines = lines.concat(rolledLines('w' + i));
    // H4 (R-SHC-8, D-229 Q2 (a)): the TARGET chip has something to say only with M12's key ON (targetRows null OFF —
    // ADDENDUM 7 Q1 (a)); after a roll, what the weapon's qualities do to the target chosen
    var Q = window.SWRPGQualityRows, qdb = window._qualitiesDb;
    var targetable = !spec.barred && !!(Q && Q.targetRows && qdb && Q.targetRows(w, { kind: 'personal' }, { vocab: qdb }));
    var kind = targetable ? (tgt[rk] || null) : null;
    var ro = rolled[rk];
    var tTaken = ro ? tOffers.filter(function (o) { return ro.taken && ro.taken[o.key]; }).map(function (o) { return { talentId: o.talentId, source: o.source, row: o.row }; }) : [];
    if (ro && kind) diceHubTargetLines(Q.targetRows(w, { kind: kind }, { vocab: qdb, talentTargets: tTaken }), kind)
      .forEach(function (t, k) { lines.push(h(DiceHubStatusLine, { key: 'tg' + k, m8: 'applied', tone: 'var(--text-info)' }, t)); });
    // H2 (R-SHC-2): after a roll, THE SPEND MENU — the weapon's activations (dark with M12's key OFF: spendRows lists none),
    // a ticked MODE's rows only while it was ticked at the roll (R-SHC-4), droid variants only against a droid (R6)
    // D-294 L1 (ADDENDUM 8 F12): the owner's talent spend rows join the SAME menu (talentSpendRows, DARK OFF)
    if (ro && Q && Q.spendRows) {
      var tk = ro.taken || {}, rspec = ro.spec || spec, hm = ro.resolved && ro.resolved.succeeded ? 'hit' : 'miss';
      var menu = Q.spendRows(w, { vocab: qdb, when: hm,   // no vocabulary → [] (spendRows' own test)
        modes: (rspec.modes || []).filter(function (m) { return tk[m.key]; }).map(function (m) { return m.modeId; }), target: kind ? { kind: kind } : undefined })
        .concat(wctx && wcb.talents && Q.talentSpendRows ? Q.talentSpendRows(sheet, wcb, wctx, { when: hm }) : []);
      if (menu.length) {
        var sm = diceHubSpendModel(menu, ro.resolved, ro.spent);
        lines.push(h(DiceHubSpend, { key: 'spend', rows: sm.rows, lines: sm.lines, tally: sm.tally, tallyTokens: sm.tallyTokens, onToggle: function (r) { toggleSpend(rk, r.key); } }));
      }
    }
    // D-294 L3 on a WEAPON row (ADDENDUM 8 F12: Natural Marksman's, Brawler's checks) — D-352: on the result's line
    var wReroll = diceHubRerollSlot(ro, ro && wctx && Pw.rerollsAt ? Pw.rerollsAt(poolMods, wctx) : [], latestKey === rk, function (nm) { rerollRow(rk, nm); });
    // the chips (H1): DIFFICULTY reads the row's own price ("Long · 3") until moved (ADDENDUM 7 Q6 (a))
    var dNow = dSpec.difficultySet != null ? diceHubDifficultyName(dSpec.difficultySet) : shownBand + ' · ' + dSpec.rangeDifficulty;
    var dPressed = dSpec.difficultySet != null ? dSpec.difficultySet : dSpec.rangeDifficulty;

    var wDmg = spec.barred ? null : diceHubQualityDamage(sheet, w, spec), wDmgNow = wDmg ? wDmg.damage : null;
    return h(DiceHubRow, { key: 'w' + i, testid: 'dice-hub-weapon', rowKey: 'w' + i, name: name,
      spec: spec, accent: accent, rolled: rolled['w' + i], reroll: wReroll, why: whyG,
      // C3: a Brawn weapon's parts and its total behind the press, as the sheet card's (SheetWhyBody's parts/total idiom)
      whyParts: wDmg && wDmg.parts.length ? wDmg.parts : null, whyTotal: wDmg && wDmg.parts.length && wDmgNow != null ? 'Total ' + wDmgNow : null,
      // the why-sheet's meta in the sheet card's words: "<skill> · Damage N · Critical N"
      whyMeta: [SKILL_NAMES[spec.skillKey] || w.skill || ''].concat(spec.barred ? [] : ['Damage ' + (wDmgNow == null ? '—' : wDmgNow), 'Critical ' + window.ItemResolve.critText(spec.critThreshold)]).filter(Boolean).join(' · '),
      onRoll: function () { doRoll('w' + i, spec); } },
      spec.barred ? null : h(DiceHubDamage, { damage: diceHubQualityDamage(sheet, w, spec).damage, crit: spec.critThreshold, plus: diceHubDamagePlus(dl, ticks['w' + i]),
        as: diceHubDamageAs(tOffers, dl, tNow) }),
      spec.barred ? null : diceHubHitDamage(diceHubQualityDamage(sheet, w, spec).damage, ro && ro.resolved),
      spec.barred ? null : diceHubQualityDamage(sheet, w, spec).lines.map(function (t, k) {
        return h(DiceHubStatusLine, { key: 'qd' + k, m8: 'applied', tone: 'var(--text-info)' }, t); }),
      spec.barred ? null : m8ItemChanges(w, ['crit_delta', 'damage_delta']).map(function (f, k) {
        var t = m8WeaponChangeText(sheet, f, 'hub');
        return t ? h(DiceHubStatusLine, { key: 'ic' + k, m8: 'applied', tone: 'var(--text-info)' }, t) : null; }),
      h('div', { 'data-dh-chips': rk, style: { display: 'flex', alignItems: 'center', gap: 9, marginTop: 8, flexWrap: 'wrap', rowGap: 8 } },
        h('span', { style: { fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.16em', color: 'var(--doc-ink-muted)' } }, 'RANGE'),
        hasChip
          ? h('button', { type: 'button', 'data-testid': 'dice-hub-band-chip',
              'aria-expanded': openStrip === i ? 'true' : 'false',
              'aria-label': 'Target range: ' + shownBand,
              onClick: function () { setOpenStrip(openStrip === i ? null : i); setChipOpen(function (m) { return dropKey(m, rk); }); },
              style: { minHeight: 44, padding: '0 13px', borderRadius: 9, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 7, touchAction: 'manipulation',
                fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 'var(--fs-sm)' } },   // its ink, edge and fill are sheet.css's (`.sb-dh [data-testid="dice-hub-band-chip"]`)
              shownBand, h('span', { 'aria-hidden': 'true', style: { fontSize: 10 } }, '▾'))
          : h('span', { 'data-testid': 'dice-hub-band-static', style: {
              fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 'var(--fs-sm)' } }, shownBand),
        targetable ? h(DiceHubChip, { label: 'TARGET', aria: 'Target', testid: 'dice-hub-target-chip', open: chipOpen[rk] === 'target',
          value: (DICE_HUB_TARGETS.filter(function (t) { return t[0] === (kind || 'none'); })[0] || ['', 'None'])[1], onToggle: function () { toggleChip(rk, 'target'); } }) : null,
        spec.barred ? null : h(DiceHubChip, { label: 'DIFFICULTY', aria: 'Difficulty', testid: 'dice-hub-difficulty-chip', open: chipOpen[rk] === 'difficulty',
          value: dNow, onToggle: function () { toggleChip(rk, 'difficulty'); } })),
      chipOpen[rk] === 'target' && targetable ? h(DiceHubChipStrip, { kind: 'target', label: 'Target', testid: 'dice-hub-target-option', cols: 4,
        options: DICE_HUB_TARGETS.map(function (t) { return { key: t[0], v: t[1], on: (kind || 'none') === t[0] }; }), onPick: function (k) { pickTarget(rk, k); } }) : null,
      chipOpen[rk] === 'difficulty' && !spec.barred ? h(DiceHubChipStrip, { kind: 'difficulty', label: 'Difficulty', testid: 'dice-hub-difficulty-option', cols: 3,
        options: DICE_HUB_DIFFICULTY.map(function (d) { return { key: d[1], v: d[0], sub: d[1] + 'D', on: d[1] === dPressed }; }), onPick: function (n) { pickDifficulty(rk, n); } }) : null,
      openStrip === i && hasChip ? h('div', { role: 'group', 'aria-label': 'Target range', style: {
        display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 5, marginTop: 7 } },
        byBand.map(function (x) {
          var inert = !!x.spec.barred, on = (x.band === shownBand) && !inert;
          return h('button', { key: x.band, type: 'button', disabled: inert,
            'aria-disabled': inert ? 'true' : 'false', 'aria-pressed': on ? 'true' : 'false',
            'data-testid': inert ? 'dice-hub-band-inert' : 'dice-hub-band-option',
            // The chip passes the CORE'S CANONICAL TOKEN, never a raw string — C-BBA-1's canonBand
            // seam is the mechanism, and handing it a display label would re-open the case bug.
            onClick: inert ? null : function () {
              setBand(function (m) { var n = Object.assign({}, m); n[i] = x.band; return n; });
              setOpenStrip(null);
              setRolled(function (m) { var n = Object.assign({}, m); delete n['w' + i]; return n; });
            },
            style: { minHeight: 44, minWidth: 0, borderRadius: 8, cursor: inert ? 'not-allowed' : 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
              opacity: inert ? 0.55 : 1,   // its ink, edge and fill (pressed, inert) are sheet.css's `.sb-dh [data-testid="dice-hub-band-…"]`
              fontFamily: 'var(--font-body)', padding: '0 3px' } },
            h('span', { style: { fontSize: 13, fontWeight: 600, lineHeight: 1.1 } }, x.band),
            h('span', { style: inert
              ? { fontSize: 10.5, lineHeight: 1.15, textAlign: 'center' }
              : { fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.06em' } },
              inert ? x.spec.barredReason : x.spec.difficulty + 'D'));
        })) : null,
      lines);
  }).filter(Boolean);

  // ── SKILLS ── the FULL trained list (C-DHM-5; the mockup's six was frame economy). Same call
  // shape the cockpit's own skill roller uses: {characteristic, skillRank, difficulty: 2}.
  // B-619: ranks read through `sheetSkillRank` — the alias-aware read the paper stage uses — so a rank
  // saved under the OggDude key (`LTSABER` for the sheet's `LTSAB`) draws its row and rolls its rank.
  // THE FORCE SWITCH (E-FFL-4): the trained test reads the row's rank WITH the session's commits, so Farsight's committed
  // Perception lists Perception at rank 0 + commits; the key OFF reads the saved rank, exactly as before.
  var trained = (sheet ? Object.keys(SKILL_NAMES) : []).map(function (k) { return diceHubSkillRow(sheet, k, committedProp); })
    .filter(function (r) { return r && (r.rank > 0 || (initialStrip && r.key === initialStrip)); }).sort(function (a, b) { return a.name.localeCompare(b.name); });

  var skillRows = trained.map(function (s) {
    var using = sw[s.key] || null;   // F-100 M7 W3: the switch, if pressed — the dice redraw from the spec they roll
    var rolledChar = diceHubRolledCharacteristic(s, using);
    var taken = ticks[s.key];   // F-100 M8 step 3: this row's ticked offers, for one roll
    var spec = diceHubSkillSpec(sheet, s, taken && window.SWRPGPoolMods ? window.SWRPGPoolMods.takeOffers(poolMods, taken) : poolMods, using, accent, dset[s.key]);
    // THE JOIN THAT USED TO BE A GUESS. This was `s.name.toLowerCase().replace(/ /g, '_')` — which
    // turns "Ranged (Light)" into `ranged_(light)` and matches no anchor in the registry, so every
    // parenthesised and hyphenated skill silently showed none of its item effects. The vocabulary
    // index does the join on registry data (`aliases` carries the sheet's ALL-CAPS key), so the
    // three spellings the ingest documents cannot come apart from the sheet's fourth.
    var applied = DiceHubAppliedLines(spec, s.name, null, sheet);
    // F-100 M8 step 3 (R-M8K-28): every certified offered entry is an OFFER row (the one row), an uncertified one stays reminded
    // F-100 M8 M2: a talent that offers this row a skill substitution draws its same-check offers ON that line (taken with it)
    var subT = diceHubSubstituteTalents(s.sc);
    var sRem = poolModRemindersFor(poolMods, s.key, rolledChar).filter(function (m) { return !subT[m.talentId]; });
    var tcb = (CharResolve.talentViewFor && CharResolve.talentViewFor(sheet)) || window._canonicalCharbuild || {};
    // H3 (D-229 Q1 (b)): the row's own offers open, then carried gear's behind the fold; H5: a ticked floored removal at its
    // floor says so ("Difficulty stays 1 — Master Doctor removes none below the floor (EotE p.138)")
    var reminders = diceHubOfferEls(s.key, sRem.filter(function (m) { return m.holder !== 'gear' && !diceHubSituational(m); }), [], taken, toggleOffer, sheet)
      .concat(diceHubFloorLines(spec, sRem, taken, tcb.talents).map(function (t, k) { return h(DiceHubStatusLine, { key: 'fl' + k, m8: 'applied', tone: 'var(--text-caution)' }, t); }))
      .concat(diceHubSituationFold(s.key, diceHubOfferEls(s.key, sRem.filter(diceHubSituational), [], taken, toggleOffer, sheet), gearOpen, toggleGear))
      .concat(diceHubGearFold(s.key, diceHubOfferEls(s.key, sRem.filter(function (m) { return m.holder === 'gear'; }), [], taken, toggleOffer, sheet), !!gearOpen[s.key], toggleGear))
      .concat(diceHubToldFor(sheet, s.key, rolledChar).map(function (t) { return h(DiceHubTold, { key: 'td' + t.key, name: t.name, words: t.words, limit: t.limit, talentId: t.talentId, rowId: t.rowId }); }))   // frame F6
      .concat(rolledLines(s.key));
    // F-100 M7 W3 (R-M7G-21(g), D-13): under one row, the characteristic line FIRST (with its switch), then the applied
    // dice, then the offers (M7's, then the items' reminders). The untrained strip ROLL opened is the same row (f).
    var m7 = m7HubLines(sheet, s.key, s.rank, s.sc, sheetOwnViewOr(sheet, window._canonicalCharbuild), using, poolMods);
    // the switch holds a characteristic (M7) or a substitution (M2); pressing the pressed one releases it
    var swId = function (v) { return v && typeof v === 'object' ? 'sub:' + v.talentId + ':' + v.skill : v; };
    var press = function (c) {
      setSw(function (m) { var n = Object.assign({}, m); if (swId(n[s.key]) === swId(c)) delete n[s.key]; else n[s.key] = c; return n; });
      setRolled(function (m) { var n = Object.assign({}, m); delete n[s.key]; return n; });
    };
    var m7Box = function (key, kids) { return h('div', { key: key, 'data-m7-hub': s.key, style: { display: 'grid', gap: 6, margin: '6px 0 2px' } }, kids); };
    var head = m7.caption ? m7Box('m7c', [h(M7HubLine, { key: 'c', kind: 'caption', text: m7.caption })].concat(
      m7.others.map(function (o) { return h(M7HubLine, { key: 'o' + o.characteristic, kind: 'other', text: o.text, btn: 'Use ' + m7CapChar(o.characteristic) + ' this roll',
        pressed: using === o.characteristic, onPress: function () { press(o.characteristic); } }); }))) : null;
    var offers = m7.offers.length ? m7Box('m7f', m7.offers.map(function (o, k) { return h(M7HubLine, { key: 'f' + k, kind: 'offer', text: o.text, btn: 'Use',
        pressed: using === o.characteristic, onPress: function () { press(o.characteristic); } }); })) : null;
    // M2 (drawing (a), D-81): the substitution lines, the pressed caption first
    var subsBox = m7.subs.length ? m7Box('m7s', (m7.subCaption ? [h(M7HubLine, { key: 'sc', kind: 'caption', text: m7.subCaption })] : []).concat(
      m7.subs.map(function (u) { return h(M7HubLine, { key: 's' + u.id, kind: 'offer', text: u.text, btn: u.btn, pressed: u.pressed,
        onPress: function () { press(u.value); } }); }))) : null;
    // H5 (R-SHC-10, D-229 Q3 (a)): the DIFFICULTY chip on the row's chip line — Average until the player sets it
    var sd = rolled[s.key] ? rolled[s.key].set : dset[s.key];   // B-1820 (ADDENDUM 621 (c)): while a result shows, the chip it rolled at
    var chips = h('div', { key: 'chips', 'data-dh-chips': s.key, style: { display: 'flex', alignItems: 'center', gap: 9, marginTop: 8, flexWrap: 'wrap', rowGap: 8 } },
      h(DiceHubChip, { label: 'DIFFICULTY', aria: 'Difficulty', testid: 'dice-hub-difficulty-chip', open: chipOpen[s.key] === 'difficulty',
        value: diceHubDifficultyName(sd != null ? sd : 2), onToggle: function () { toggleChip(s.key, 'difficulty'); } }));
    var strip = chipOpen[s.key] === 'difficulty' ? h(DiceHubChipStrip, { key: 'dstrip', kind: 'difficulty', label: 'Difficulty', testid: 'dice-hub-difficulty-option', cols: 3,
      options: DICE_HUB_DIFFICULTY.map(function (d) { return { key: d[1], v: d[0], sub: d[1] + 'D', on: d[1] === (sd != null ? sd : 2) }; }), onPick: function (n) { pickDifficulty(s.key, n); } }) : null;
    // F-100 THE SURFACING MISSION (D-294 L1/L3; ADDENDUM 8): after a roll, the owner's talent spend rows in the hub's ONE spend
    // menu (talentSpendRows); the reroll and its "Rerolled — <talent>" mark sit in the result's slot (D-352) — all DARK OFF
    var sro = rolled[s.key], Ps = window.SWRPGPoolMods, Qs = window.SWRPGQualityRows, extra = [];
    var sctx = sro && Ps && poolIdx ? Ps.contextFor(s.key, poolIdx) : null;
    var smenu = sctx && tcb.talents && Qs && Qs.talentSpendRows ? Qs.talentSpendRows(sheet, tcb, sctx, { when: sro.resolved && sro.resolved.succeeded ? 'hit' : 'miss' }) : [];
    if (smenu.length) {
      var ssm = diceHubSpendModel(smenu, sro.resolved, sro.spent);
      extra.push(h(DiceHubSpend, { key: 'spend', rows: ssm.rows, lines: ssm.lines, tally: ssm.tally, tallyTokens: ssm.tallyTokens, onToggle: function (r) { toggleSpend(s.key, r.key); } }));
    }
    var sReroll = diceHubRerollSlot(sro, sctx && Ps.rerollsAt ? Ps.rerollsAt(poolMods, sctx) : [], latestKey === s.key, function (nm) { rerollRow(s.key, nm); });   // D-352
    var lines = [chips, strip, head, subsBox].concat(applied, [offers], reminders, extra).filter(Boolean);
    return h(DiceHubRow, { key: s.key, testid: 'dice-hub-skill', rowKey: s.key, name: s.name,
      spec: spec, accent: accent, rolled: rolled[s.key], reroll: sReroll, why: whyG,
      onRoll: function () { doRoll(s.key, spec); if (using) setSw(function (m) { var n = Object.assign({}, m); delete n[s.key]; return n; }); } }, lines);
  });

  // ── FORCE ── absent ENTIRELY for a non-Force character, matching SheetForceZone's null (card §2.2).
  var fr = (derived && derived.forceRating) || 0;
  var powers = fr >= 1 ? sheetForcePowersForDisplay(sheet) : [];
  // B-622: the paper sheet's unit commits dice for the session and the hub rolls what is left; the legacy cockpit passes nothing (its zone kept its own).
  // F-100 M10 (R-M10S-5, R-M10B-6c): `committedProp` is the session's committed SET ({<power id>: true, <power>.<ability>: n},
  // R-SHC-5) or a count;
  // the ONE committed-count function reads either — the same max(0, fr − committed) as before.
  var available = CharResolve.forceDiceAvailable(fr, committedProp || 0);
  // H6 (R-SHC-2/5/9): after a power's roll, its DIALS (powerDialsAt, priced in Force points) and each owned Duration upgrade
  // that commits dice — the commit is the one spend that writes, through the sheet's ONE writer (`onCommit`, session only).
  // With every die committed the rows are BARRED (live, ADDENDUM 7 Q1 (a)).
  var fcb = sheet ? (CharResolve.talentViewFor && CharResolve.talentViewFor(sheet)) || window._canonicalCharbuild || {} : {};
  var fOwned = powers.length && CharResolve.forcePowerRowSources ? CharResolve.forcePowerRowSources(sheet, fcb) : [];
  var held = CharResolve.committedForceDice ? CharResolve.committedForceDice(committedProp || 0) : 0;
  var forceRows = powers.map(function (fp, i) {
    var nm = typeof fp === 'string' ? fp : (fp.name || 'Power');
    var pid = typeof fp === 'string' ? null : fp.id;
    var spec = diceHubForceSpec(sheet, poolMods, available, accent, pid);
    if (fr > 0 && available === 0) spec = Object.assign({}, spec, { barred: true, barredReason: 'No Force die free — release one on the sheet', held: held });
    // Natural Mystic (D-350; card ADDENDUM 62 F7 (a), brief §7): its reroll in the result's slot (D-352), as the skill rows
    // place theirs — gated by the talent's DARK row (rerollsAt)
    var ro = rolled['f' + i], kids = [];
    if (ro && pid && window.SWRPGPoolMods) {
      var P = window.SWRPGPoolMods;
      var ctx = poolIdx ? P.contextFor(null, poolIdx, undefined, 'force_power', pid) : null;
      var abil = (fcb.forcePowers && fcb.forcePowers[pid] && fcb.forcePowers[pid].abilities) || {};
      var dials = (ctx && P.powerDialsAt ? P.powerDialsAt(fOwned, ctx, sheet) : []).map(function (d) {
        var ak = String(d.talentId).split(':').pop();
        return Object.assign({}, d, { words: (abil[ak] || {}).description || diceHubRuleText('force_powers', pid, 'abilities.' + ak + '.description') || '' }); });   // A5
      var fm = diceHubForceMenuModel(dials, diceHubDurationCommits(fp, fcb), (ro.resolved && ro.resolved.light) || 0, ro.spent, committedProp, available);
      fm = diceHubForceMenuCapped(fm, function (k) { return CharResolve.commitAtCap ? CharResolve.commitAtCap(sheet, fcb, committedProp, k) : null; });   // F5
      if (fm.rows.length) kids.push(h(DiceHubSpend, { key: 'spend', note: 'priced in Force points', rows: fm.rows, lines: fm.lines, tally: fm.tally, tallyTokens: fm.tallyTokens,
        onToggle: function (r) {
          if (r.commitKey && r.stacks) { if (!r.inert && onCommit) { onCommit(r.commitKey, true); toggleSpend('f' + i, r.key); } }   // one more commit per roll, never a release
          else if (r.commitKey) { if (onCommit) onCommit(r.commitKey, !r.on); } else toggleSpend('f' + i, r.key); } }));
    }
    var Pr = window.SWRPGPoolMods, rctx = ro && Pr && poolIdx ? Pr.contextFor(null, poolIdx, undefined, 'force_power', pid) : null;
    var fReroll = diceHubRerollSlot(ro, rctx && Pr.rerollsAt ? Pr.rerollsAt(poolMods, rctx) : [], latestKey === 'f' + i, function (nm) { rerollRow('f' + i, nm); });   // D-352
    return h(DiceHubRow, { key: 'f' + i, testid: 'dice-hub-force', rowKey: 'f' + i, name: nm,
      spec: spec, accent: accent, rolled: ro, reroll: fReroll,
      onRoll: function () { doRoll('f' + i, spec); } }, kids);
  });

  // The footer's catch-all: entries where NO anchor was ever recorded. They match no check, so no
  // row can carry them and none of them can ever apply — showing them here is the only way the
  // player learns the item claims something at all. `unanchored` lives in the assembler so this
  // "null matches nothing" rule has one expression, not two (R-PCA-2).
  var unscoped = (window.SWRPGPoolMods
    ? poolMods.filter(window.SWRPGPoolMods.unanchored)
    : []);

  // PORTALLED to document.body, following this file's own precedent (`renderShell`, :3957). The
  // sheet sits inside an ancestor with `position: relative; z-index: 1`, which opens a stacking
  // context — so no z-index the hub could name would ever have lifted it above the suite bar and
  // the bottom nav; they are simply in a different context. Measured, not guessed: the first
  // attempt raised the number and changed nothing. The portal is the mechanism, the z-index only
  // orders it against the app's other body-level overlays.
  // ═══ B-638 · THE HUB ON PAPER: a window on the sheet, not a modal over it — no scrim (the sheet stays readable
  // and pressable beside it), the plate with a head you drag (⠿ · DICE · the name · ✕), the sections as entries,
  // the reference folded at the foot. Escape and ✕ close it. Same rows, same rolls, same testids.
  var secP = function (label, note) { return h('div', { className: 'sb-grp' }, label, note ? h('span', null, note) : null); };
  // ── TREAT AN INJURY — B-1209 retire (D-172; the Fork R frames, ui-lab 45dd0a8d8 `retire.*`, are LAW). Opened from the
  // crit plate's Medicine on ONE injury, the hub carries the three things it lacked: the injury's difficulty preset
  // (critTreatSpec, folded before the roll), the write at the roll (a success writes the injury off through the sheet's
  // writer, `onTreated`; a failure writes nothing) and the entry that names the injury. The hub's own parts, nothing new.
  // B-1263 (D-187's frames, ui-lab 2d19c0239, B1): the row draws the SKILL rows' own lines by their own calls on its MED context —
  // applied, then the offers (ticked through `ticks.treat`, taken by critTreatSpec's fold), then the told lines, then what a
  // roll carried — between its first line and its last (the promise or the outcome). After a roll the pool shown is the pool
  // ROLLED, and "difficulty N" reads that pool's difficulty dice, so neither contradicts a lowered pool (C-4, findings 6/7).
  // R6 U6 (card release-r6-ui ADDENDUM 5): the hub opened on ONE given check — a Follower's or a network's — { spec, label },
  // the spec from SWRPGRewards' rewardSpec/contactSpec only. An ordinary spec row: doRoll, the DIFFICULTY chip (Average until
  // set, as a skill's), a School's flat symbols riding the spec's `_autoSymbols` (the pool's existing added-result path).
  // ENCOUNTERS (R-E3S-R2 (iii)): a given spec FOLDED by the one fold (the NPC arm of SWRPGSheetPool.weaponPoolOf) draws its applied
  // lines through DiceHubAppliedLines' one sentence (SWRPGUI.appliedLineText); a Follower's or a network's spec carries no fold.
  var givenSection = null;
  if (given && given.spec) {
    var gd = rolled.given ? rolled.given.set : dset.given;   // B-1820 (ADDENDUM 621 (c)): while a result shows, the chip it rolled at
    // R-E3DM-R2 (ruling `encounters-e3-npc-press` §6, ADDENDUM 1): a FOLDED spec (the NPC arm) is never overwritten — the
    // caller's `specAt(difficultySet)` re-folds it through the arm at the chip's value (null = unmoved, Average). A Follower's
    // or a network's `given` carries no `specAt`, and keeps the overwrite it always had.
    var gSpec = given.specAt ? (given.specAt(gd != null ? gd : null) || given.spec) : Object.assign({}, given.spec, { difficulty: gd != null ? gd : 2 });
    var gChips = h('div', { key: 'chips', 'data-dh-chips': 'given', style: { display: 'flex', alignItems: 'center', gap: 9, marginTop: 8, flexWrap: 'wrap', rowGap: 8 } },
      h(DiceHubChip, { label: 'DIFFICULTY', aria: 'Difficulty', testid: 'dice-hub-difficulty-chip', open: chipOpen.given === 'difficulty',
        value: diceHubDifficultyName(gd != null ? gd : 2), onToggle: function () { toggleChip('given', 'difficulty'); } }));
    var gStrip = chipOpen.given === 'difficulty' ? h(DiceHubChipStrip, { key: 'dstrip', kind: 'difficulty', label: 'Difficulty', testid: 'dice-hub-difficulty-option', cols: 3,
      options: DICE_HUB_DIFFICULTY.map(function (d) { return { key: d[1], v: d[0], sub: d[1] + 'D', on: d[1] === (gd != null ? gd : 2) }; }), onPick: function (n) { pickDifficulty('given', n); } }) : null;
    givenSection = h('div', { 'data-testid': 'dice-hub-given' },
      h(DiceHubRow, { testid: 'dice-hub-given-row', rowKey: 'given', name: given.label || '', spec: gSpec, accent: accent, rolled: rolled.given,
        onRoll: function () { doRoll('given', gSpec); } }, [gChips, gStrip].concat(DiceHubAppliedLines(gSpec, given.label || '', gSpec.qualityMods, sheet || null), rolledLines('given'), diceHubContactResults(given, rolled.given, rwdReg, t38Open,
          function () { setT38Open(function (o) { return !o; }); })).filter(Boolean)));
  }
  var treatSection = null;
  if (treat && sheet) {
    var tTaken = ticks.treat;
    var tr = critTreatSpec(sheet, treat, accent, poolMods, tTaken, committedProp);
    var tDone = rolled.treat || null;
    var tSpec = (tDone && tDone.spec) || tr.spec;
    var tBuilt = D.buildPool(tSpec) || {};
    var tOk = tDone ? !!(tDone.resolved && tDone.resolved.success > 0) : null;
    var tName = tr.spec.skill.name;   // Medicine, or Mechanics for a droid (B-1586)
    var tMid = DiceHubAppliedLines(tSpec, tName, null, sheet)
      .concat(diceHubOfferEls('treat', poolModRemindersFor(poolMods, tr.skill, tr.characteristic), [], tTaken, toggleOffer, sheet))
      .concat(diceHubToldFor(sheet, tr.skill, tr.characteristic).map(function (t) { return h(DiceHubTold, { key: 'td' + t.key, name: t.name, words: t.words, limit: t.limit, talentId: t.talentId, rowId: t.rowId }); }))
      .concat(rolledLines('treat'));
    var tLines = [
      h(DiceHubStatusLine, { key: 'tn', tone: 'var(--text-caution)' }, 'Treating ' + treat.name + ' — '
        + (tr.tier ? (/^[AEIOU]/.test(tr.tier) ? 'an ' : 'a ') + tr.tier + ' injury, difficulty ' : 'difficulty ') + ((tBuilt.difficulty || 0) + (tBuilt.challenge || 0))),
    ].concat(tMid, [
      tDone ? h('div', { key: 'to', role: 'status', 'data-testid': 'dice-hub-treat-outcome' },
          h(DiceHubStatusLine, { tone: 'var(--text-info)', glyph: tOk ? '✓' : '▸' },
            tOk ? 'Treated — ' + treat.name + ' is off your injuries.' : 'Not treated — ' + treat.name + ' stays on your injuries.'))
        : h(DiceHubStatusLine, { key: 'tw', tone: 'var(--text-info)' }, 'A success removes it from your injuries.'),
    ]);
    // the head as the frames draw it: BOTH words are the group's note runs (`.sb-grp > span`), so the label reads in the
    // note's ink, not the section labels' (frame_delta, scripts/shots_b1209_retire.py, against lab 45dd0a8d8)
    treatSection = h('div', { 'data-testid': 'dice-hub-treat' },
      h('div', { className: 'sb-grp' }, h('span', null, 'Treat an injury'), h('span', null, 'the injury sets the difficulty')),
      h(DiceHubRow, { testid: 'dice-hub-treat-row', rowKey: 'treat', name: tName, spec: tSpec, accent: accent, rolled: tDone,
        onRoll: function () { var r = doRoll('treat', tr.spec); if (r && r.success > 0 && onTreated) onTreated(treat.id); } }, tLines));
  }
  return ReactDOM.createPortal(h('div', { 'data-testid': 'dice-hub-scrim', 'data-paper': '1', className: 'sb-dh-backdrop', ref: scrimRef },
    h('div', { 'data-testid': 'dice-hub', 'data-paper': '1', role: 'dialog', 'aria-label': 'Dice hub', className: 'hp-sheet sb-dh', 'data-doc-ground': 'creator', ref: win.ref,
      style: win.pos ? { left: win.pos.left, top: win.pos.top, right: 'auto' } : null },
      h('div', Object.assign({ className: 'sb-dh-head', 'data-testid': 'dice-hub-head' }, win.handle),
        h('span', { className: 'sb-dh-grip', 'aria-hidden': 'true' }, '⠿'),
        h('span', { className: 'sb-dh-title' }, 'Dice'),
        h('span', { className: 'sb-dh-name' }, sheet ? (sheet.name || '') : ((given && given.title) || '')),   // no sheet: the NPC's name its caller hands in (ADDENDUM 1 Q-B, as `title` per gate ruling N2)
        h('button', { type: 'button', 'data-testid': 'dice-hub-close', className: 'hp-quiet', onClick: onClose, 'aria-label': 'Close' }, '✕')),
      h('div', { className: 'hp-plate sb-dh-body', 'data-pad': 'data' },
        givenSection,
        treatSection,
        weaponRows.length ? secP('Weapons') : null, weaponRows.length ? h('div', { className: 'hp-bands', 'data-run': '1' }, weaponRows) : null,
        skillRows.length ? secP('Skills', trained.filter(function (t) { return (sheet.skills || {})[t.key] > 0; }).length + ' trained · difficulty 2 until the GM sets it') : null, skillRows.length ? h('div', { className: 'hp-bands', 'data-run': '1' }, skillRows) : null,
        forceRows.length ? secP('Force', available + ' of ' + fr + ' Force ' + (fr === 1 ? 'die' : 'dice')) : null, forceRows.length ? h('div', { className: 'hp-bands', 'data-run': '1' }, forceRows) : null,
        // R7 as ADDENDUM 9 rules it: the foot list KEPT for what it now holds — the UNCERTIFIED item rows (no direction: they
        // reach no roll and nothing else tells them); B-1196's directed rows left it as offers. Its head says so (C-MU-3:
        // no approved frame draws the foot; disclosed in the gate).
        unscoped.length ? secP('From your gear') : null,
        unscoped.map(function (m, k) { return h(DiceHubReminder, { key: 'u' + k, mod: m }); }),
        h('details', { className: 'sb-fold', 'data-testid': 'dice-hub-reference-fold', open: refOpen || undefined, onToggle: function (e) { setRefOpen(e.target.open); } },
          h('summary', { className: 'sb-e-h', 'data-testid': 'dice-hub-reference-door', 'aria-expanded': refOpen ? 'true' : 'false' }, h('span', { className: 'sb-e-n' }, 'Dice reference'), h('span', { className: 'sb-e-m sb-fold-teaser' }, 'What each symbol means'), h('i', { className: 'sb-grp-glyph', 'aria-hidden': 'true' }, '▾')),
          refOpen ? h('div', { 'data-testid': 'dice-hub-reference' }, h(DiceReferenceBody, { accent: accent })) : null))
    )), document.body);
}

// The reference the hub's footer door opens (D-DH-3 — the R-PMP reference, reachable where the
// rolling happens). Glyph IDENTITY comes from the shared SYMBOLS table, so the die shapes here are
// the same objects every other surface draws (D-3A2, one table app-wide); only the one-line
// explanations are local copy.
//
// FLAGGED, not decided: the Dice Tutor has its own `DiceReference` (lib/dice/diceSurface.jsx:1361)
// and the player shell does not load that module. Rather than reach across an app boundary — beyond
// this lap's OWNS — the seven rows are drawn here. That leaves TWO reference surfaces in the
// product, which is the shape Jason has rejected before; consolidating them into `lib/shared` is a
// real follow-up and the gate says so rather than this comment being the only record of it.
function DiceReferenceBody({ accent }) {
  var SY = (window.SWRPGDice && window.SWRPGDice.SYMBOLS) || {};
  var ROWS = [
    ['proficiency', 'Proficiency', 'Your best dice — one per rank, up to your characteristic.'],
    ['ability', 'Ability', 'The rest of the characteristic-vs-rank pair.'],
    ['boost', 'Boost', 'Something is helping. Added by gear, aim, allies.'],
    ['difficulty', 'Difficulty', 'How hard the task is. The GM sets it.'],
    ['challenge', 'Challenge', 'Difficulty upgraded — an adversary, or a nastier task.'],
    ['setback', 'Setback', 'Something is in the way. Darkness, load, cover.'],
    ['force', 'Force', 'Force rating. Light and dark pips, no cancellation.'],
  ];
  // B-639 · ON PAPER: the same seven rows as the kit's ledger rows; the symbol's ink is the ground's (--doc-sym-*, F-101)
  return h('div', { className: 'sb-dref hp-bands' }, ROWS.map(function (r) {
    var s = SY[r[0]];
    return h('div', { key: r[0], className: 'sb-dref-row', 'data-sym': r[0] },
      h('span', { 'aria-hidden': 'true', className: 'sb-dref-glyph', style: { fontFamily: s ? "'" + s.font + "'" : 'inherit', color: s ? s.color : 'inherit' } }, s ? s.char : ''),
      h('span', { className: 'sb-e-n' }, r[1]),
      h('span', { className: 'sb-e-t' }, r[2]));
  }));
}

function m7TalentName(cb, because) {
  // F-100 M9 (R-M9S-1): a species ability's swap names its OWNER, 'species:<id>:<slug>' — DARK (only a key-ON read makes one)
  if (/^species:/.test(String(because || ''))) { var so = CharResolve.speciesAbilityOwner(because, cb); return (so && so.name) || ''; }
  var id = String(because || '').split(':')[1] || '';
  var t = cb && cb.talents ? cb.talents[id] : null;
  return (t && t.name) || id;
}

// A5 (ruling argo-dataset-import-draft ADDENDUM 4 §A4.1 item 3): the user's imported rule text through the one accessor
// (SWRPGSources.ruleText / ruleTextSpan); null on holocron.work and wherever nothing was imported, so a row draws as before.
// A slice reads it by an address {kind, id, path} (charResolve's told sources carry it as `_path`) only where spanOk holds.
function diceHubRuleText(kind, id, path) {
  var S = window.SWRPGSources;
  return S && S.ruleText ? S.ruleText(kind, id, path) : null;
}
function diceHubRuleTextSpan(addr, span) {
  var S = window.SWRPGSources;
  return addr && S && S.ruleTextSpan ? S.ruleTextSpan(addr.kind, addr.id, addr.path, span) : null;
}

// S2 (argo-a1-curation ADDENDUM 4): a told row whose words were removed → { line, at }: its book line (the row's own cite,
// else its talent's) and the check it is told at ("at the Medicine check", from its skill anchors; '' with none). null on
// holocron, so the hub and the sheet draw the quote as before.
function toldS2(t, row, cb) {
  var S = window.SWRPGSources;
  if (!S || !S.bookTextRemoved || !S.bookTextRemoved()) return null;
  var rec = !t.species && !t.power && !t.signature && cb && cb.talents ? cb.talents[t.id] : null;
  var names = (cb && cb.skillNames) || {}, sk = (row.applies_to || []).filter(function (a) { return a && a.scope === 'skill' && a.value; })
    .map(function (a) { return names[a.value] || a.value; });
  return { line: S.removedLine(rec, [row.cite]) || '', at: sk.length ? 'at the ' + sk.join(' or ') + ' check' : '' };
}


window.SWRPGDiceHub = {
  diceHubRolledCharacteristic: diceHubRolledCharacteristic,
  diceHubWeaponsWithUnarmed: diceHubWeaponsWithUnarmed,
  diceHubSubstituteTalents: diceHubSubstituteTalents,
  diceHubWeaponReminders: diceHubWeaponReminders,
  diceHubForceMenuCapped: diceHubForceMenuCapped,
  diceHubDurationCommits: diceHubDurationCommits,
  resolveWeaponSkillKey: resolveWeaponSkillKey,
  diceHubDamageLineText: diceHubDamageLineText,
  diceHubContactResults: diceHubContactResults,
  diceHubDifficultyName: diceHubDifficultyName,
  diceHubForceMenuModel: diceHubForceMenuModel,
  diceHubQualityDamage: diceHubQualityDamage,
  diceHubRollOwnerName: diceHubRollOwnerName,
  diceHubSituationFold: diceHubSituationFold,
  poolModRemindersFor: poolModRemindersFor,
  DiceHubAppliedLines: DiceHubAppliedLines,
  diceHubCritLineText: diceHubCritLineText,
  DICE_HUB_DIFFICULTY: DICE_HUB_DIFFICULTY,
  diceHubRerollModel: diceHubRerollModel,
  m8WeaponChangeText: m8WeaponChangeText,
  diceHubAutoSymbols: diceHubAutoSymbols,
  diceHubPriceTokens: diceHubPriceTokens,
  diceHubTargetLines: diceHubTargetLines,
  diceHubSituational: diceHubSituational,
  computeWeaponPool: computeWeaponPool,
  DiceHubStatusLine: DiceHubStatusLine,
  diceHubDamagePlus: diceHubDamagePlus,
  diceHubRerollSlot: diceHubRerollSlot,
  diceHubRerollInfo: diceHubRerollInfo,
  DiceHubPickPrompt: DiceHubPickPrompt,
  diceHubPromptsFor: diceHubPromptsFor,
  diceHubPriceWords: diceHubPriceWords,
  diceHubSpendModel: diceHubSpendModel,
  diceHubFloorLines: diceHubFloorLines,
  DiceReferenceBody: DiceReferenceBody,
  diceHubHitDamage: diceHubHitDamage,
  diceHubSkillSpec: diceHubSkillSpec,
  diceHubForceSpec: diceHubForceSpec,
  DICE_HUB_TARGETS: DICE_HUB_TARGETS,
  DiceHubChipStrip: DiceHubChipStrip,
  diceHubLineInfo: diceHubLineInfo,
  DiceHubReminder: DiceHubReminder,
  diceHubDamageAs: diceHubDamageAs,
  diceHubCritLine: diceHubCritLine,
  diceHubHitWords: diceHubHitWords,
  diceHubOfferEls: diceHubOfferEls,
  diceHubSkillRow: diceHubSkillRow,
  diceHubGearFold: diceHubGearFold,
  critTreatSkill: critTreatSkill,
  DICE_HUB_BANDS: DICE_HUB_BANDS,
  diceHubToldFor: diceHubToldFor,
  critTreatSpec: critTreatSpec,
  diceHubReroll: diceHubReroll,
  DiceHubReroll: DiceHubReroll,
  m8ItemChanges: m8ItemChanges,
  DiceHubDamage: DiceHubDamage,
  useDragWindow: useDragWindow,
  DICE_HUB_SYM: DICE_HUB_SYM,
  DiceHubSpend: DiceHubSpend,
  m7TalentName: m7TalentName,
  DiceHubTold: DiceHubTold,
  DiceHubChip: DiceHubChip,
  DiceHubRow: DiceHubRow,
  m7HubLines: m7HubLines,
  M7HubLine: M7HubLine,
  m7Gerund: m7Gerund,
  DiceHub: DiceHub,
  toldS2: toldS2,
};
})();
