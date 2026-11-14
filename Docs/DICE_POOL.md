# Dice Pool System — Reference

**Status:** Canonical
**Files:** `lib/shared/diceEngine.js`, `lib/shared/diceUI.jsx`
**Loaded in:** `gm.html`, `player.html`
**Last updated:** 2026-04-19

---

## What it is

A shared dice-pool system for FFG Star Wars RPG (Narrative Dice). Split in two layers:

- **`diceEngine.js`** — pure JS logic. No React, no DOM. Safe to call from anywhere, including silent/background rolls.
- **`diceUI.jsx`** — Babel-transpiled React components that render pools, results, and a full modal builder. Opt-in per screen.

Both expose their API on **`window.SWRPGDice`**. The engine is a plain `<script>`; the UI is a `<script type="text/babel" src="...">`.

---

## When to use each layer

| Need | Use |
|------|-----|
| Silent roll (NPC auto-attack, test harness, AI) | `diceEngine` only |
| Inline pool preview on a weapon/skill card | `InlinePoolPreview` |
| Let the user adjust and roll | the player sheet's paper dice hub (`DiceHub`, `player/app.jsx`); the shared modal below is RETIRED |
| Floating quick-roller on a screen | `FloatingDiceButton` |
| Render pool symbols somewhere custom | `renderPool(pool)` |
| Render result symbols | `renderResults(resolved)` |

---

## Loading

Both apps already load the scripts. If you start a new HTML entry point:

```html
<script src="lib/shared/diceEngine.js"></script>
<script type="text/babel" src="lib/shared/diceUI.jsx"></script>
```

The engine depends on nothing. The UI depends on React + ReactDOM global + the Genesys/SWRPGIcons fonts (already in both apps' `<head>`).

---

## Engine API (`window.SWRPGDice`)

### `buildPool(spec) → pool`

Takes a high-level spec and returns the concrete die counts.

```js
const pool = SWRPGDice.buildPool({
  characteristic: 3,   // character's characteristic rating
  skillRank: 2,        // skill rank
  difficulty: 3,       // base difficulty dice
  challenge: 0,        // challenge dice (pre-upgraded, optional)
  boost: 1,            // boost dice from aim/cover/etc
  setback: 0,          // setback dice from conditions
  force: 0,            // force dice
  adversary: 2,        // Adversary X — upgrades min(difficulty, X) to challenge
});
// → { ability: 1, proficiency: 2, boost: 1, difficulty: 1, challenge: 2, setback: 0, force: 0 }
```

**Formula:** FFG standard — `min(char, rank)` ability dice upgrade to proficiency, `max(char, rank) - min(char, rank)` stay as ability.

**Adversary interaction:** If `adversary` is passed and `challenge` is not, `min(difficulty, adversary)` difficulty dice upgrade to challenge.

### `roll(pool) → results`

Rolls the pool. Returns an object with face arrays per die type:

```js
SWRPGDice.roll(pool)
// → { ability: [{s:1,a:1}, {s:2}], proficiency: [{s:1,t:1}], difficulty: [{f:2}], boost: [{a:1}], ... }
```

Each face is an object mapping symbol keys → counts. Keys: `s`=success, `f`=failure, `a`=advantage, `h`=threat, `t`=triumph, `d`=despair, `l`=light, `dk`=dark.

### `resolve(results) → resolved`

Tallies and nets the results:

```js
SWRPGDice.resolve(results)
// → {
//   success: 1,        // net (positive = success, negative = failure)
//   advantage: -2,     // net (positive = advantage, negative = threat)
//   triumph: 1,
//   despair: 0,
//   light: 0,
//   dark: 0,
//   raw: { s: 3, f: 2, a: 1, h: 3, t: 1, ... },
//   succeeded: true,
//   netFailure: 0,
//   netThreat: 2,
// }
```

Triumph counts as success too; despair counts as failure too (baked into net values). Force light/dark pips don't cancel.

### `rollAndResolve(pool) → { pool, results, resolved }`

Convenience for silent rolls.

```js
const r = SWRPGDice.rollAndResolve(SWRPGDice.buildPool({ characteristic: 3, skillRank: 2, difficulty: 2 }));
if (r.resolved.succeeded) {
  // NPC attack hits
}
```

### `formatPool(pool) → string`

Compact text form: `"2P 1A 1B vs 2D · 1F"` (prof / ability / boost / force).

### `formatResults(resolved) → string`

Plain-language summary: `"1 success, 2 threat"` or `"2 failure, 1 triumph, 1 despair"`.

---

## UI API (`window.SWRPGDice`)

### `renderPool(pool, opts?) → React node`

Inline symbol fragment. Renders proficiency/ability/boost, a `vs` separator, then challenge/difficulty/setback, then force dice.

```jsx
{window.SWRPGDice.renderPool(pool, { size: 1.4 })}
```

`opts.size` is the em-scale for symbols (default 1.3).

### `renderResults(resolved, opts?) → React node`

Inline success/failure/advantage/threat/triumph/despair/light/dark symbols. Net cancellation applied.

### `<InlinePoolPreview pool onClick?>`

Small tappable chip showing the pool. Use in weapon rows, skill rows, stat blocks.

```jsx
<window.SWRPGDice.InlinePoolPreview
  pool={pool}
  onClick={() => window.SWRPGDice.openModal({ characteristic: 3, skillRank: 2, difficulty: 2, accent: '#F5C842' })}
/>
```

### `<RollResults resolved critThreshold?>`

Results panel: symbols + plain-text summary + optional CRIT?! badge (shown when `advantage >= critThreshold` or `triumph > 0`).

> **RETIRED 2026-10-14 (B-1209, D-172):** `DicePoolModal` and `openModal` below are deleted from `lib/shared/diceUI.jsx`. Their one caller, the crit plate's Medicine check, opens the paper dice hub on that injury (its TREAT AN INJURY section); no other caller existed. The two entries are kept as the record of what was there.

### `<DicePoolModal open onClose preset accent onRoll?>` (RETIRED)

Full builder sheet. Usually you don't render this directly — use `openModal()` below. Controlled variant is available if you want to manage state yourself.

### `openModal(preset) → Promise<lastRoll | null>` (RETIRED)

Imperative one-shot modal. Mounts itself into `<body>`, resolves with the last roll result when closed.

```js
const result = await window.SWRPGDice.openModal({
  characteristic: 3,
  skillRank: 2,
  difficulty: 2,
  boost: 1,
  accent: '#F5C842',           // theme color
  critThreshold: 3,            // weapon crit rating — shows CRIT?! when triggered
  adversary: 0,                // for NPC attacks
});
```

All fields optional. The modal lets the user adjust all of them before rolling.

### `<FloatingDiceButton accent? preset? onRoll?>`

Opt-in corner button that opens the modal empty. Drop it anywhere you want a persistent quick-roller.

```jsx
{window.SWRPGDice.FloatingDiceButton &&
  React.createElement(window.SWRPGDice.FloatingDiceButton, { accent: charAccent })}
```

Not included by default — each screen opts in so silent-rolling contexts stay quiet.

### `DIFFICULTY_PRESETS`

Array of the six canonical difficulty levels used by the modal's picker:

```js
[
  { name: 'Simple',     difficulty: 0, label: '—' },
  { name: 'Easy',       difficulty: 1, label: 'I' },
  { name: 'Average',    difficulty: 2, label: 'II' },
  { name: 'Hard',       difficulty: 3, label: 'III' },
  { name: 'Daunting',   difficulty: 4, label: 'IV' },
  { name: 'Formidable', difficulty: 5, label: 'V' },
]
```

---

## Symbol fonts

Two icon fonts (already loaded in both apps' `<head>`):

| Font | Use |
|------|-----|
| **Genesys** | Die shapes (ability/proficiency/boost/difficulty/challenge/setback) |
| **SWRPGIcons** | Result symbols (success/advantage/triumph/failure/threat/despair/force/light/dark) |

See `memory/project_ffg_dice_symbols.md` for Unicode mappings and color values. The UI module duplicates the symbol table so it's self-contained; if you add a new symbol there, also update `SYMBOLS` in `diceUI.jsx`.

---

## Conventions

### When to pass `adversary`

Pass it for **NPC attack pools** (rival or nemesis with Adversary X talent). The engine upgrades `min(difficulty, adversary)` difficulty dice to challenge. Don't pass it for PC pools.

Parse it from an NPC's talents:

```js
const adversary = (npc.talents || []).reduce((n, t) => {
  const tn = typeof t === 'string' ? t : (t.name || '');
  const m = tn.match(/Adversary\s+(\d+)/i);
  return Math.max(n, m ? parseInt(m[1]) : 0);
}, 0);
```

### Skill → characteristic mapping

Neither module ships a full skill→characteristic table because the existing character-sheet data already has that. When building pools from NPC skill data, use a minimal lookup:

```js
const SKILL_CHAR = {
  'brawl': 'brawn', 'melee': 'brawn', 'lightsaber': 'brawn',
  'ranged (light)': 'agility', 'ranged (heavy)': 'agility',
  'gunnery': 'agility',
  // add as needed
};
```

The player side uses `SKILL_CHARS` (full table, already in `player.html`).

### Crit threshold

FFG convention: crit fires when attacker spends advantage equal to weapon's crit rating (or rolls any triumph). The modal's CRIT?! badge uses that rule:

```js
showCrit = critThreshold != null && success > 0 && (advantage >= critThreshold || triumph > 0);
```

Labeled `CRIT?!` not `CRIT` so the GM/player decides whether to spend the advantage on crit or on other effects.

### PC defense → setback

For NPC attacks against a specific PC, pass the PC's ranged/melee defense as `setback`. The GM EncounterPlayMode wires this automatically from the active PC in the arena.

### Silent rolls

When rolling behind the scenes (AI, test harness), use `rollAndResolve()` — no UI state. Safe to call in useEffect, event handlers, or loops.

---

## Examples

### Player weapon attack (from EncounterRoom ATTACKS tab)

```jsx
const pool = window.SWRPGDice.buildPool({
  characteristic: Number(skCharVal) || 0,  // character's Agility/Brawn etc.
  skillRank: skillRank,
  difficulty: 2,                            // Average default
});

<PoolPreview
  pool={pool}
  onClick={() => window.SWRPGDice.openModal({
    characteristic: Number(skCharVal) || 0,
    skillRank: skillRank,
    difficulty: 2,
    accent: charAccent,
    critThreshold: Number(w.crit),
  })}
/>
```

### GM NPC attack with Adversary + PC defense

```jsx
const poolSpec = {
  characteristic: npcChar,       // e.g. Agility for Ranged skills
  skillRank: skillRank,
  difficulty: 2,
  setback: activePcRangedDefense,
  adversary: adversaryValue,
};
const pool = window.SWRPGDice.buildPool(poolSpec);
```

### Silent auto-roll

```js
const pool = SWRPGDice.buildPool({ characteristic: 3, skillRank: 2, difficulty: 2 });
const { resolved } = SWRPGDice.rollAndResolve(pool);
console.log(SWRPGDice.formatResults(resolved));   // "2 success, 1 threat"
if (resolved.succeeded) {
  // apply damage, advance narrative, etc.
}
```

---

## Where it's wired up today

- **Player `EncounterRoom`** (`player.html`)
  - ATTACKS tab — inline preview on each weapon card
  - SKILLS tab — inline preview on each skill row
  - FloatingDiceButton — bottom-right

- **GM `EncounterPlayMode`** (`gm.html`)
  - ATTACKS tab — per-weapon preview with Adversary X upgrade + active PC's defense as setback
  - SKILLS tab — per-skill preview using skill→characteristic map
  - FloatingDiceButton — bottom-right

Other screens are opt-in. See **Conventions → Floating button** above for wiring into a new screen.

---

## Testing

The engine has a self-test (`SWRPGDice.selfTest()`) that rolls 1000 ability dice and checks the average net success against the expected `5/8 = 0.625`. Useful smoke check after changing face tables.

To validate a JSX edit didn't break parsing:

```bash
node -e "require('@babel/parser').parse(require('fs').readFileSync('lib/shared/diceUI.jsx','utf8'), {sourceType:'module', plugins:['jsx']})"
```

---

## What this does *not* do (yet)

- No dice animation (roll happens instantly — we can add tumbling dice later)
- No roll history (each roll is transient, per the design spec)
- No triumph/despair auto-effects (just displays; GM/player interprets)
- No per-die face visualization (results are collapsed to net totals — raw faces available in `results` object if needed)

These are deliberate scope limits. Extend the UI on top of the engine rather than rewriting the engine.
