# 0001. Enforce commit/push discipline with a PreToolUse hook; pin Opus

- **Date:** 2026-05-30
- **Status:** accepted

## Context
The "halt and surface verbatim before commit/push" rule lived only in CLAUDE.md
prose, which depends on the model voluntarily complying — exactly what erodes
across session resets. The opus-only preference wasn't encoded anywhere either;
it rode on a single auto-memory note.

## Decision
Added a project-scoped PreToolUse hook (.claude/hooks/commit-gate.py, wired in
.claude/settings.json) that intercepts any `git commit` / `git push` Claude
attempts and forces an `ask` confirmation surfacing the verbatim command. Set
`model: opus` in project settings and in agent frontmatter.

## Alternatives considered
A hard `deny` (rejected — no clean approval path for a solo dev who does need to
commit). A bare permission `ask` rule instead of a hook (simpler, but can be
shadowed by a conflicting allow rule and skipped in bypass modes; the hook fires
regardless). A single-`command` shell form for the hook (tried, then reverted to
the exec `if`/`args` form once both fields were confirmed valid in the published
hook schema; the `if: "Bash(git *)"` pre-filter is a cheap git-only narrowing).

## Consequences
Commits/pushes require explicit per-action approval even if a future session
forgets the prose rule. The hook only gates commands Claude runs through its Bash
tool, not commits made by hand.

Verification: the hook's stdin/filter logic was confirmed on 2026-05-30 by piping
mock tool-input JSON (git commit -> ask; git status -> silent). In-harness firing
through settings.json takes effect only after the next session restart (hooks load
at startup), so it is re-confirmed there rather than claimed here.
