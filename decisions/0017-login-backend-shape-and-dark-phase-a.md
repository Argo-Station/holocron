# 0017. F-34 login: Pages advanced mode, structural availability isolation, and a dark Phase A

- **Date:** 2026-07-25
- **Status:** accepted

## Context

F-34 (user login) introduces the first backend this repo has ever had. Until now the product was
100% static: no runtime npm dependencies, no `_worker.js`, no `wrangler.toml`, no `functions/` — just
`_headers`/`_redirects` and assets on Cloudflare Pages, with the SPA soft-200'ing every unknown path.
The stated goal behind login is not login itself: it is **Phase B, characters following you across
devices**. Login is the gate in front of it.

Four forces shaped the decision, three of them discovered by building rather than planning:

1. The original architecture assumed a standalone Worker on a zone route (`holocron.work/api/*`) in
   front of Pages. Cloudflare's own docs refute this: zone Worker routes and Pages custom domains are
   incompatible on the same domain.
2. Production's Pages build outputs to the repo ROOT — exactly where a `_worker.js` would sit. Pages
   "advanced mode" then routes **every** request through that worker, so an auth fault becomes a
   whole-site outage in a product whose static serve was previously unbreakable at runtime.
3. `better-auth` REQUIRES an email column on its user model; it cannot be omitted. The project's
   privacy law ("nothing identity-valuable to breach") therefore could not be satisfied by schema
   absence.
4. As originally phased, Phase A would ship a login that changes nothing for the user (sync is Phase
   B) — the same defect shape the reSpecialized lap had just cost a lap to fix: a state whose success
   is indistinguishable from nothing happening.

## Decision

**Backend shape.** The API is a `_worker.js` at the deploy root (Pages advanced mode), bundled by
`worker/build.mjs` from `worker/index.js` with `node:*`/`cloudflare:*` external under `nodejs_compat`.
The backend rides the existing deploy — no second pipeline — and is the shape that ports to
Workers-static-assets later. Proven end to end locally before any auth code (`/api/ping` with a live
`node:crypto` UUID; static assets byte-identical through `env.ASSETS`).

**Availability is structural, and it is a law:** *login and sync may fail; the game tools may not.*
"Logged-out is byte-identical forever" now includes availability. Two independent levers:
- `_routes.json` includes ONLY `/api/*`, so static assets never enter the worker at all (auth code is
  not in the app's request path; app traffic also spends no Workers quota);
- the worker fails open — any `/api/*` fault returns an honest JSON 500, and any non-API request that
  somehow reaches it falls through to `env.ASSETS`.

**Config is versioned, staged, and guarded.** `wrangler.toml` lives in the repo (dashboard-only config
is unversioned drift), spike-branch-only during Phase 0, merged corrected at Phase A. `test/deploy_shape.cjs`
asserts the contract: on `commercial` it REQUIRES the real production project name (a constant, null
today) and rejects the spike's, so the unknown blocks the merge rather than being remembered; it also
pins `nodejs_compat`, the compat date, the output dir, and fails if a secret is ever pasted in.

**Preview shares nothing with production:** a separate Pages project, its own D1, its own throwaway
OAuth apps. Production's OAuth identities are registered fresh at Phase A carrying only production
redirect URIs.

**The no-email promise is structural, not behavioural.** The C1 migration carries a CHECK constraint
requiring the `@placeholder.invalid` suffix — the database refuses a real address regardless of code —
plus a standing zero-real-PII dump assert, plus a **read-never mapper**: the placeholder is constructed
deterministically from provider + subject and the provider's email field is never read at all. There is
no code path to regress.

> ⚠ **SUPERSEDED IN PART BY AMENDMENT 1 (below).** Two claims in the paragraph above were measured
> FALSE during the build and are corrected there: the mapper did not deliver "never read at all" (the
> library requested and received the address; only persistence was protected), and the CHECK constraint
> is not unbypassable (it guarantees shape, not the absence of PII). **Read Amendment 1 before relying
> on this paragraph.** The paragraph is left standing rather than rewritten so the correction is
> visible as a correction.

**Phase A ships DARK.** It builds, gates, and deploys to production in full — proving the auth
round-trip against real cookies, providers, and D1 — with no visible affordance. Phase B's gate carries
the light-up (the corner door and account chip) the day login carries characters across devices.
**Hard condition:** C4's floor (privacy page + delete-account) ships WITH the dark deploy, not with the
light-up — the moment an endpoint can mint an account for anyone holding the URL, the trust surface
must already exist.

## Alternatives considered

- **A standalone Worker on a zone route** — refuted by Cloudflare's docs; would have failed at deploy
  time, after the code was written.
- **One availability lever instead of two** — `_routes.json` alone leaves a fail-closed worker in the
  path if the config regresses; a fail-open catch alone still runs auth code for every asset request.
  Both were kept because the failure they prevent is a whole-product outage. (A mutation test also
  showed the catch is an information-disclosure control, not only an uptime one: without it the
  runtime answers a worker fault with a raw stack trace as `text/plain`.)
- **Dashboard-only config** — cheaper, but unversioned and unguardable; rejected under the
  "overbuild the seams" directive.
- **A shared OAuth registration for preview and production** — halves the console work, at the cost of
  production app identities that carried preview hostnames. Rejected: identity hygiene cannot be
  retrofitted, and the Microsoft publisher-wall test is better hit by a throwaway app.
- **Enforcing the email promise in code only** (a mapper that discards, or refuses) — the promise would
  then be true by policy while the privacy page asserted it as fact; one regression breaks it silently.
- **Ship Phase A visibly** (a door that changes nothing) or **merge A into B's gate** (which un-de-risks
  the riskiest half). Dark launch keeps the engineering releases separate while making the USER release
  a single moment — the one where accounts pay for themselves.

## Consequences

- Production enters advanced mode exactly once, at a named ceremony ("P-FLIP") with its own mini-gate:
  the dashboard build command changes to build the worker too, in a change where `_routes.json` and the
  fail-open wrapper are ALREADY in the tree; rollback is one dashboard revert, documented before.
- A worker bug can no longer take the apps down, but the worker is now on the deploy's critical path in
  the sense that a broken worker BUILD fails the deploy — the same posture the frontend build already has.
- The dark-period flag must be a named constant carrying its expiry on its face (pointing at Phase B's
  gate). Dormant flags that outlive their purpose are a known hazard here — `COMMERCIAL_MODE` nearly bit
  the Nunes retirement, and its emptied `QB_PORTRAITS` consumers are still dead code awaiting a sweep.
- The zero-PII dump assert and the break-glass availability smoke enter the standing battery together at
  the dark deploy: availability and privacy become permanent regression classes on the same day.
- Six OAuth registrations across the program, in two sessions weeks apart. The spike apps are deletable
  after Phase A.
- `_worker.js` is a build artifact and must stay gitignored. **Until the spike branch merges, that ignore
  entry does not exist on `commercial`** — a stray built artifact there could put production into advanced
  mode by accident. (Removed once already during this checkpoint.)

---

## Amendment 1 — the no-email law restated, after measurement (2026-07-25)

**Source:** ruling `Docs/rulings/f34-credential-free-build.md` (F1 RATIFIED, F4) — which states in terms
that this ADR is amended by it. Recorded here because an ADR that only a ruling corrects is an ADR that
still misinforms whoever reads it first.

**What was wrong.** The Decision section above claimed the provider's email "is never read at all" and
that there is "no code path to regress." Both were measured false during the credential-free build:

1. **better-auth's built-in Google and Microsoft providers request the `email` scope by default.**
   Measured at the authorize URL before any change: Google asked for `email profile openid`. Their
   `getUserInfo` then assigns `email: user.email` into the user object *before* our `mapProfileToUser`
   spreads over it. The address was therefore received and held in memory on every sign-in. The mapper
   protected **persistence**, never **receipt** — which is not what the sentence promised.
2. **The CHECK constraint is not unbypassable.** A suffix-only `LIKE` admitted a case variant
   (`x@PLACEHOLDER.INVALID`; `LIKE` is case-insensitive) and an embedded address
   (`a@b.com#@placeholder.invalid`).

**The law as it now stands — three layers, in order of primacy:**

1. **SCOPE MINIMISATION — we never ask.** Every provider is configured `disableDefaultScope: true`
   with an explicit list omitting email: Google and Microsoft get `openid profile`, Discord rides
   generic-oauth with `identify` alone. The address never arrives, so there is nothing to read. **This
   is the mechanism.** Verified live at all three authorize URLs.
2. **THE MAPPER — we override anyway.** `<provider>_<subject>@placeholder.invalid`, deterministic. A
   second line of defence, not the mechanism.
3. **THE CONSTRAINT — the database refuses the wrong shape.** Case-sensitive `GLOB` pinning the
   mapper's exact form, plus a no-double-`@` clause. 8/9 against the adversarial matrix, verified on
   real D1 as well as `node:sqlite`.

**The honest limit, which no layer closes:** an email passed as the *subject* argument yields
`google_jason-gmail.com@placeholder.invalid` — PII, and shape-identical to a legitimate opaque id. No
constraint can distinguish them. What prevents that class is the **mapper's contract** (subject is the
provider's opaque id, never an address), enforced by code review and `test/placeholder_email.cjs`, not
by SQLite. Asserted in executable form so the limit cannot decay into prose.

**Standing consequence (R-F34-1):** the scope guard asserts CONFIGURATION, not provider behaviour — it
cannot see a library ignoring an option. Any bump of `better-auth` **or its transitive
`@better-auth/core`**, where the provider code actually lives, re-measures all three authorize URLs and
records the scope strings in the gate. Pinning `better-auth` exactly does not pin `@better-auth/core`.
