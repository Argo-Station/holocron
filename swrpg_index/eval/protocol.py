"""Generate Docs/EVAL_PROTOCOL.md from queries.yaml.

The protocol is the manual agent-eval path. A human grader (or a Claude
Code subagent) takes the list of queries, asks them one by one to an
agent connected to the swrpg MCP server, and checks the boxes for each
expected reference / forbidden citation. Totals at the bottom become the
score for that prompt/model combination.

Keeping the protocol generated from queries.yaml (rather than hand-written)
means the two sources of truth for eval cases — retrieval + agent — can
never drift.

Usage:
    python3 -m swrpg_index.eval.protocol                 # writes Docs/EVAL_PROTOCOL.md
    python3 -m swrpg_index.eval.protocol --stdout        # prints instead of writes
"""
import argparse
import datetime
import os
import sys
from pathlib import Path

import yaml

sys.stdout.reconfigure(encoding='utf-8')

from .retrieval import QUERIES_PATH, load_cases


REPO_ROOT = Path(__file__).resolve().parents[2]
OUTPUT_PATH = REPO_ROOT / 'Docs' / 'EVAL_PROTOCOL.md'


# ── Preamble (static, doesn't come from YAML) ──────────────────────────────

PREAMBLE = """# swrpg_index — Agent Eval Protocol

**Generated from `swrpg_index/eval/queries.yaml`.** Do not edit by hand —
run `python3 -m swrpg_index.eval.protocol` after changing the YAML.

## What this is

The **retrieval-only eval** (`python3 -m swrpg_index.eval.retrieval`) is
automated — it runs in milliseconds, scores 22/26 as of last baseline,
and fires on every commit.

The **agent-in-loop eval** is manual. Fire it on:
- System-prompt changes
- Tool-docstring rewrites (the retrieval number stays flat, so agent
  lift is the only signal)
- Embedding-model swaps (affects both layers)
- Before shipping the vet-GM agent

## How to run the manual eval

### Option A — Run yourself in a Claude Code chat

1. Add the swrpg MCP server to your `.mcp.json` (see
   `Docs/MCP_INTEGRATION.md`).
2. Open a new Claude Code session. Paste the system prompt being tested
   at the top.
3. Work through the queries below one at a time. For each, watch which
   tools the agent calls and what it cites in its final answer.
4. Tick the ✓ / ✗ boxes as you go. Do not grade on "did it sound
   confident" — grade ONLY on whether the cited pages match
   `expected_refs` and no `must_not_cite` entries were hit.
5. Fill in the tally at the bottom. Compare to the last run.

### Option B — Spawn a Claude Code subagent

In a Claude Code session, use the `Agent()` tool with a prompt like:

> You are a Star Wars FFG RPG reference agent. You have access to the
> `swrpg` MCP server with 7 tools (search, topic, topics, toc,
> list_pdfs, read_pages, chapter). System prompt: [paste current prompt].
>
> Answer each of these queries with a cited response:
> [paste queries from this doc]
>
> Format each answer as:
>   Q<n>: <query>
>   A<n>: <answer with [alias p.N] citations>

Grade the returned text against the expected_refs below. Subagent runs
inside your Claude Code subscription — zero incremental cost.

### Grading rules

- **Check `Must NOT cite` FIRST** on any case that has them. Forbidden
  hits are what manual graders miss most often — it's easier to tick
  "yes cited p.331" than to notice "also cited an advanced sourcebook
  we told it not to." The ⛔ block is rendered before expected
  citations on purpose — do not skip it.
- **PASS** a case if: every `required: true` expected_ref is cited
  (alias + page overlaps the expected range) AND no `must_not_cite`
  entry appears in any citation.
- Partial matches (alias right, page off by ±3) count as PASS — agents
  sometimes cite the chapter's opening page rather than the specific
  rule page. Vet's call on edge cases.
- A case with `any_of: [...]` passes if at least one alternative is
  cited.
- For `tool: topic` cases: the agent should typically call `topic()`
  first. If it only calls `search()` and still lands the right pages,
  that's a PASS but flag it for prompt tuning ("nudge toward topic
  shortcut for known concepts").

### Session hygiene

- **One sitting, fresh head.** 26 cases with checkbox + citation
  verification + must-not-cite checks ≈ 45-60 minutes of focused work.
  Grader calibration drifts measurably across a session and drifts
  worse across split sessions. Schedule accordingly.
- **Stop if you rush.** If the last 5 cases feel hurried, leave them
  partially graded with a note and finish another day. Partial grades
  with a note beat sloppy grades that look complete.
- **Don't re-normalize mid-run.** If case 12 makes you reconsider your
  grading standard, keep the old standard for cases 13-26 and note the
  issue in the results file. Adjust the standard for the NEXT run, not
  this one.

### Iteration discipline (between runs)

- **Change one thing at a time.** Add the citation-discipline rule to
  the system prompt → re-grade. Add the retrieval-strategy playbook →
  re-grade. If three changes stacked into one run move the score +2,
  you don't know which one earned it, and the one that didn't is now
  permanent technical debt.
- **Keep old prompts.** Each prompt version goes in its own file
  (`prompts/v1.md`, `prompts/v2.md`, ...) and the results file names
  the version. Rollback is free if you didn't flatten history.
- **Slow is fast.** 3 small iterations with clear cause/effect beats
  1 big rewrite that ambiguously improved things.

### Reporting template

Copy the block at the bottom into a new results file:
`Docs/eval-results/agent-<YYYYMMDD>-<model>-<prompt-version>.md`.
Commit the file so the history is grep-able.

"""


TEMPLATE_RESULTS = """
---

## Run record (copy + fill in)

- **Date:** YYYY-MM-DD
- **Agent runtime:** Claude Code main chat | Agent() subagent
- **Model:** claude-sonnet-4-5 | claude-opus-4-7 | claude-haiku-4-5
- **System prompt version:** V1 (baseline) | V2 (...) | ...
- **Grader:** [name or "self"]

### Scores

| Bucket       | Passed | Total |
|--------------|-------:|------:|
| easy         |        | 8     |
| medium       |        | 8     |
| hard         |        | 4     |
| adversarial  |        | 3     |
| negative     |        | 3     |
| **TOTAL**    |        | **26** |

### Notes

[Any patterns in the failures. Which tools did the agent lean on?
 Where did it hallucinate? Which queries need prompt work?]
"""


def _format_ref(ref):
    """Pretty-print a single ref or any_of group for the checklist."""
    if 'any_of' in ref:
        alts = [f'{s["alias"]} pp.{s["page_range"][0]}–{s["page_range"][1]}'
                for s in ref['any_of']]
        req = ' (required, ≥1 of)' if ref.get('required', True) else ' (optional, ≥1 of)'
        return f'ANY-OF{req}: ' + ' / '.join(alts)
    pr = ref['page_range']
    req = ' (required)' if ref.get('required', True) else ' (optional)'
    return f'{ref["alias"]} pp.{pr[0]}–{pr[1]}{req}'


def _format_forbidden(rule):
    parts = []
    if 'alias' in rule:
        parts.append(f'alias={rule["alias"]}')
    if 'section_contains' in rule:
        parts.append(f'section~"{rule["section_contains"]}"')
    reason = rule.get('reason', '')
    return ' + '.join(parts) + (f' — {reason}' if reason else '')


def _render_case(i, case):
    """Markdown block for one case."""
    lines = []
    lines.append(f'### Q{i}. `{case["id"]}`  ({case["difficulty"]})')
    lines.append('')
    lines.append(f'**Query:** {case["query"]}')
    tool = case.get('tool', 'search')
    extras = [f'tool: `{tool}`']
    if case.get('mode'):   extras.append(f'mode: `{case["mode"]}`')
    if case.get('tier'):   extras.append(f'tier: `{case["tier"]}`')
    if case.get('alias'):  extras.append(f'alias: `{case["alias"]}`')
    if case.get('content_type'): extras.append(f'content_type: `{case["content_type"]}`')
    if case.get('k'):      extras.append(f'k: `{case["k"]}`')
    lines.append(f'<sub>{" · ".join(extras)}</sub>')
    lines.append('')

    # Must-not-cite rendered FIRST when present — graders reliably miss
    # forbidden-hit checks if they're an afterthought at the bottom.
    # Reversing the order turns "remember to verify" into "verify to move on."
    if case.get('must_not_cite'):
        lines.append('**⛔ Must NOT cite** (fail if any hit — CHECK FIRST):')
        lines.append('')
        for rule in case['must_not_cite']:
            lines.append(f'- [ ] NOT: {_format_forbidden(rule)}')
        lines.append('')

    lines.append('**Expected citations:**')
    lines.append('')
    if not case.get('expected_refs'):
        lines.append('- (none)')
    for ref in case['expected_refs']:
        lines.append(f'- [ ] {_format_ref(ref)}')

    if case.get('notes'):
        lines.append('')
        lines.append('**Notes:** ' + case['notes'].replace('\n', ' ').strip())

    lines.append('')
    lines.append('**Grader:** ✅ PASS  /  ❌ FAIL  /  ⚠ FLAKY (only if N>1)  —  _circle one_')
    lines.append('')
    return '\n'.join(lines)


def build_document():
    cases = load_cases()
    # Order: easy → medium → hard → adversarial → negative (matches
    # difficulty ordering in the retrieval eval report)
    order = {'easy': 0, 'medium': 1, 'hard': 2, 'adversarial': 3, 'negative': 4}
    cases.sort(key=lambda c: (order.get(c.get('difficulty', 'medium'), 99), c['id']))

    from collections import Counter
    bucket_counts = Counter(c.get('difficulty', 'medium') for c in cases)

    out = [PREAMBLE]
    out.append(f'_Last regenerated: {datetime.datetime.now().isoformat(timespec="seconds")}_')
    out.append('')
    out.append('## Case summary')
    out.append('')
    out.append('| Bucket       | Count |')
    out.append('|--------------|------:|')
    for b in ('easy', 'medium', 'hard', 'adversarial', 'negative'):
        if b in bucket_counts:
            out.append(f'| {b:<12} | {bucket_counts[b]:>5} |')
    out.append(f'| **TOTAL**    | **{len(cases)}** |')
    out.append('')

    # Group by difficulty for readability
    current_bucket = None
    idx = 0
    for c in cases:
        b = c.get('difficulty', 'medium')
        if b != current_bucket:
            out.append('')
            out.append(f'## {b.upper()} ({bucket_counts[b]} cases)')
            out.append('')
            current_bucket = b
        idx += 1
        out.append(_render_case(idx, c))

    out.append(TEMPLATE_RESULTS)
    return '\n'.join(out)


def main(argv=None):
    p = argparse.ArgumentParser(description='Generate EVAL_PROTOCOL.md from queries.yaml')
    p.add_argument('--stdout', action='store_true', help="Print instead of writing to Docs/")
    p.add_argument('--output', default=str(OUTPUT_PATH), help='Override output path')
    args = p.parse_args(argv)

    md = build_document()
    if args.stdout:
        print(md)
        return 0

    out_path = Path(args.output)
    out_path.parent.mkdir(exist_ok=True, parents=True)
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(md)
    print(f'[eval-protocol] wrote {out_path} ({len(md):,} chars)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
