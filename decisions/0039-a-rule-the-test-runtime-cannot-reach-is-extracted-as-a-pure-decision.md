# 0039. A rule the test runtime cannot reach is extracted as a pure DECISION; the runtime only APPLIES it

- **Date:** 2026-08-26
- **Status:** accepted

## Context

`room-server/src/room.js` imports the Cloudflare Workers runtime module. Plain Node cannot resolve
it, so **no guard in this repo's battery can load the room Worker at all**. Everything written
inside it — authorization, lifecycle, the version gate — was therefore unreachable by every test we
actually run, and the Stage A gate had to record three acceptance rows as PART for that single
reason.

Two rules were sitting in exactly that dead zone: the version-gated join (inline in a `fetch`
handler) and the 30-day expiry TTL (inline in a Durable Object method). One decides whether an
out-of-date client may enter a table; the other decides whether an abandoned room bills forever.
Both are consequential, and neither had ever been executed by anything.

The obvious response was to wait for a Workers test runtime. That was authorized as its own item
(`holotable-workerd-harness`, R-HSA-1) — but it is future work, and "untested until the harness
lands" is a position that has to be held for as long as the harness takes.

## Decision

**When a rule lives in a module the test runtime cannot load, the rule is EXTRACTED to a pure
module and the runtime module is reduced to APPLYING it.** The decision becomes an ordinary
function with injected inputs; the untestable file keeps only the wiring.

Applied twice here: `roomState.joinDecision(claimedVersion, roomVersion)` and
`room-server/src/ttl.mjs` (`shouldArmTtl` / `shouldCancelTtl` / `ttlDeadline`, clock injected).
`index.js` and `room.js` now call them rather than carrying copies. `rights.js` was already built
this way and says so in its own header — this makes the pattern the standing answer rather than
one file's good instinct.

**It is not a substitute for the runtime harness, and the split says so explicitly:** extraction
removes the possibility of the RULES being wrong; only a runtime can prove the WIRING. Both halves
are named wherever this is cited, so a reader never mistakes one for the other.

## Alternatives considered

- **Wait for workerd / `vitest-pool-workers`.** Correct for the wiring half and commissioned for
  it. Rejected as the whole answer because it leaves consequential rules unexecuted for the
  duration, and the duration is not ours to control.
- **Test through the deployed Worker only.** This is real and we do it (the synthetic client walks
  the live room), but it needs a deploy, a network, and Jason's word each time — it cannot be the
  first line of defence, and it cannot run in a battery.
- **Leave it and write a note in the gate.** Rejected on evidence: the extraction is what CAUGHT
  the defect below. A note would have described the risk and changed nothing.

## Consequences

- **It immediately found a rule that had never run.** Writing the guard for `joinDecision` failed
  at once: `SCHEMA_VERSION` is 1, so there is no version *below* 1, and the 409 `room_schema_newer`
  branch was **unreachable in production**. R-V7S-3's headline refusal would have shipped never
  having executed, and would have run for the first time on the day v2 shipped and every existing
  client became the old one. The room version is now injectable so the branch is exercised today.
- Injected inputs are the price and they are cheap: `roomVersion`, a clock, a `rand`. Each defaults
  to the production value, so no caller changes and the injection exists only for the test.
- The untestable file gets thinner, which is its own benefit — `room.js` now reads as wiring.
- **The pattern has a boundary.** It applies to DECISIONS (pure input → verdict). It does not apply
  to genuinely runtime-shaped behaviour — hibernation, socket lifecycle, alarm delivery — which
  stays in the untestable file and stays honestly marked PART until a runtime can reach it.
- A related trap, recorded because it cost four commits: a rule extracted into a NEW FILE is only
  as good as the import that reaches it. A `git mv && sed` chain left the Worker unbuildable while
  the entire battery read green (nothing could load it to notice). `test/room_server_imports.cjs`
  now checks relative-import resolution statically, and `wrangler deploy --dry-run` is a ruled
  pre-deploy step (A2-HSA-2).
