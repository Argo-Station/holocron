# 0038. A right the schema cannot express is refused BY NAME, not guessed

- **Date:** 2026-08-26
- **Status:** accepted

## Context

`R-HT-4` grants a player exactly one spatial write: **their own token's position.** Building
HOLOTABLE slice 1's authorization check, that right turned out to be unenforceable against the
ruled schema.

The room-state contract carries two id spaces that the prose called by the same word. `members` is
keyed by an opaque **participant** id — a human at the table, deliberately PII-free and sized for a
future account system. `tokens` is keyed by a **bench member instance** id — a combatant on the
map. Nothing maps one to the other. So `is this token yours?` has no answer available to the
server, and the right cannot be checked.

This is not a bug in the ruling. The gap was invisible until code had to enforce the right, which
is the ordinary way schema gaps surface: a contract reads complete right up until something must
act on it.

## Decision

**Refuse the specific case with a reason that names the gap, and pin the refusal with a guard
assert that is explicitly a tripwire.**

A player's `token_move` returns `token_ownership_unmapped`. Not a generic denial, not a silent
drop — a string that says which edge is missing, visible in logs and greppable in the codebase.
The guard asserting it carries a comment stating that when the ownership edge lands, **the assert
is re-pointed BY A RULING and never quietly deleted.**

The gap is then reported at the gate as an item, not resolved in passing.

## Alternatives considered

- **Let any player move any token.** Breaks the right in the permissive direction and does so
  invisibly: a player drags someone else's token, it works, and nothing anywhere says why that was
  allowed. The failure surfaces at a table, mid-session, as a mystery.
- **Treat `token_move` as GM-only, no comment.** Breaks it in the restrictive direction and, worse,
  looks *deliberate* to the next reader — indistinguishable from a ruled decision. A future session
  would have no reason to question it.
- **Invent the ownership edge in code.** A participant→token mapping is net-new durable state on a
  wire contract. An implementer adding it is precisely the durable-contract change `R-Y2-1` exists
  to stop, however obvious the shape seems.
- **Halt the slice until the edge is ruled.** Over-halts. The gap touches one write on a surface
  that belongs to a later slice; the store, the transport, the lifecycle and every other right are
  unaffected. Halting all of them would trade a real week for a hypothetical one.

## Consequences

- The refusal string is now observable wire behaviour. Changing or removing it is a visible change
  to something, rather than the quiet disappearance of a rule nobody recorded.
- A guard assert exists whose *purpose is to fail later*. That is unusual and must stay legible:
  the test says so in its own comment, because a future reader clearing a red would otherwise
  "fix" it by deleting the case.
- Generalises beyond this instance. **When a ruling grants a right the schema cannot express, the
  refusal is where the gap gets named** — the code says what is missing, the guard holds the place,
  and the gate carries it up. The two tempting alternatives both convert a known gap into an
  unknown one, which is the actual cost being avoided.
- Related: `0035` (coverage is a property of the fixture, not the assertion) — both are about
  instruments that look green while measuring nothing.
