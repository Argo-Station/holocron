"""Agent-in-loop eval — **KEPT FOR REFERENCE ONLY; NOT THE CURRENT PATH**.

The project runs the agent-layer eval manually via a human grader (or a
Claude Code subagent) against `Docs/EVAL_PROTOCOL.md`. That's the current
flow. This SDK-driven automation exists because it was built before we
chose the manual path; kept in-tree so a future revisit doesn't pay the
build cost again.

Revisit this when ALL of:
  * Manual grading becomes a real bottleneck (you're doing it weekly+,
    not on rare prompt changes)
  * The 26-query set has grown past what a human can grade in 30 minutes
  * You're OK with the ~$1.50/run Anthropic bill for N=3

What this harness does, if re-enabled:
  * Reads queries.yaml, spawns swrpg_mcp.py as a subprocess, connects
    via the official mcp ClientSession over stdio
  * Drives Anthropic messages API with tool-use loop (temp=0, 8-turn cap)
  * Runs each case N times (default 3), headline grade = majority vote
  * Full per-attempt trace (tool name + args + output + tokens + wall) in
    swrpg_index/eval/results/agent-eval-<stamp>.json
  * Graceful-fail on missing ANTHROPIC_API_KEY via .env

To re-enable:
  1. `pip install anthropic` (already installed in this env)
  2. Add ANTHROPIC_API_KEY to .env
  3. `python3 -m swrpg_index.eval.agent --n 3`

Leaving in place because the citation regex, MCP-to-Anthropic tool-spec
translation, and grading logic are all worth preserving.
"""
import argparse
import asyncio
import datetime
import json
import os
import re
import sys
import time
from pathlib import Path

import yaml
from dotenv import load_dotenv

sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

from .retrieval import (
    QUERIES_PATH, grade_case, load_cases, _ranges_overlap, _match_ref, _match_forbidden,
)


RESULTS_DIR = Path(os.path.dirname(os.path.abspath(__file__))) / 'results'
DEFAULT_MODEL = 'claude-sonnet-4-5-20250929'
MAX_TOOL_TURNS = 8           # hard cap per attempt — prevents runaway loops


# ── .env + API key guard ───────────────────────────────────────────────────

def _load_env_or_fail():
    load_dotenv()
    if not os.getenv('ANTHROPIC_API_KEY'):
        sys.exit(
            'ANTHROPIC_API_KEY not set. Add it to .env (see .env.example)\n'
            'or export it in your shell. The agent eval needs it to drive\n'
            'the tool-use loop. Retrieval-only eval (swrpg_index.eval.retrieval)\n'
            'does not need any keys.'
        )


# ── System prompt ──────────────────────────────────────────────────────────
# This is intentionally minimal — the eval will drive iteration. Keep the
# initial version short so the docstrings are the primary lift signal.

SYSTEM_PROMPT_V1 = """You are a Star Wars FFG RPG reference agent. A GM is asking \
you rules questions. Answer ONLY from the indexed rulebook corpus; you have tools \
that search it and return cited passages.

Rules:
- Every rules claim MUST include a citation: alias + page number(s). Format as \
`[alias p.N]` or `[alias pp.N-M]` inline.
- If the corpus does not contain the answer, say so explicitly. Do not speculate \
from training-data knowledge of Star Wars or FFG rules.
- Prefer `topic()` over `search()` when the query maps to a known concept \
(nemesis, encounter building, crit table, lightsaber, force rating, etc.).
- When you have enough information to answer, STOP calling tools and write the \
answer. Do not burn your turn budget on exploratory tool calls."""


# ── MCP client setup ───────────────────────────────────────────────────────

async def _spawn_mcp_session():
    """Returns an async context manager yielding (session, tool_list).
    Server is launched as a subprocess; killed on context exit."""
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client

    repo_root = Path(__file__).resolve().parents[2]
    params = StdioServerParameters(
        command='py',
        args=['-3', str(repo_root / 'swrpg_mcp.py')],
    )
    return stdio_client(params), ClientSession


def _mcp_tools_to_anthropic_spec(mcp_tools):
    """Translate MCP tool schemas into Anthropic's tool_use format."""
    specs = []
    for t in mcp_tools:
        specs.append({
            'name': t.name,
            'description': (t.description or '').strip(),
            'input_schema': t.inputSchema or {'type': 'object', 'properties': {}},
        })
    return specs


# ── Citation extraction (for grading) ─────────────────────────────────────
# Agent's final answer should contain `[alias p.N]` or `[alias pp.N-M]` forms.
# We parse these and check them against expected_refs/must_not_cite.

_CITATION_RE = re.compile(
    r'\[([a-z][a-z0-9\-_]*)\s+pp?\.?\s*(\d+)(?:\s*[-–]\s*(\d+))?\s*(?:,\s*pp?\.?\s*(\d+)(?:\s*[-–]\s*(\d+))?)*\]',
    re.IGNORECASE,
)


def extract_citations(text):
    """Return list of {alias, page_start, page_end} tuples parsed from the
    agent's answer. Aliases are lowercased."""
    cites = []
    for m in _CITATION_RE.finditer(text):
        alias = m.group(1).lower()
        # Multiple (start,end) pairs can appear in one [..] — group(2,3) and
        # group(4,5) are two possible pairs. We parse the simple case; if an
        # agent wraps 3+ pairs we still catch the first two.
        for start_grp, end_grp in [(2, 3), (4, 5)]:
            if m.group(start_grp):
                start = int(m.group(start_grp))
                end = int(m.group(end_grp)) if m.group(end_grp) else start
                cites.append({'alias': alias, 'pages': [start, end]})
    # Also catch standalone "alias p.N" style anywhere in prose (no brackets)
    # so agents that don't format citations strictly aren't graded 0.
    loose = re.finditer(
        r'\b([a-z][a-z0-9\-_]{2,20})\s+pp?\.?\s*(\d+)(?:\s*[-–]\s*(\d+))?',
        text, flags=re.IGNORECASE)
    for m in loose:
        alias = m.group(1).lower()
        # Filter obvious non-aliases
        if alias in ('page', 'pages', 'the', 'and', 'see', 'per', 'or', 'in'):
            continue
        start = int(m.group(2))
        end = int(m.group(3)) if m.group(3) else start
        cites.append({'alias': alias, 'pages': [start, end]})
    # Dedupe
    seen = set()
    out = []
    for c in cites:
        key = (c['alias'], c['pages'][0], c['pages'][1])
        if key not in seen:
            seen.add(key)
            out.append(c)
    return out


def grade_agent_answer(case, answer_text, citations):
    """Same grading shape as retrieval eval but on the agent's cited pages."""
    hits = [{'alias': c['alias'], 'pages': c['pages'], 'section': None}
            for c in citations]
    return grade_case(case, hits)


# ── Agent loop ─────────────────────────────────────────────────────────────

async def run_one_attempt(case, anthropic_client, model, mcp_session, tool_specs, system_prompt, verbose=False):
    """One agent attempt on one query. Returns dict with grade + trace."""
    from anthropic import AsyncAnthropic  # re-import to keep lazy

    # Pose the query as-is; if case uses tool=topic, convert to a natural
    # prompt the agent can process (agent eval tests end-to-end, not just
    # the retrieval layer).
    if case.get('tool') == 'topic':
        user_prompt = f'Look up the rulebook topic: "{case["query"]}". Cite the pages.'
    else:
        user_prompt = case['query']

    messages = [{'role': 'user', 'content': user_prompt}]
    trace = []
    total_input_tokens = 0
    total_output_tokens = 0
    t0 = time.time()
    turns = 0
    final_text = ''
    stop_reason = None

    while turns < MAX_TOOL_TURNS:
        turns += 1
        resp = await anthropic_client.messages.create(
            model=model,
            max_tokens=2048,
            temperature=0,
            system=system_prompt,
            tools=tool_specs,
            messages=messages,
        )
        total_input_tokens  += resp.usage.input_tokens
        total_output_tokens += resp.usage.output_tokens
        stop_reason = resp.stop_reason

        # Collect assistant blocks (text + tool_use)
        assistant_blocks = []
        tool_uses = []
        text_parts = []
        for block in resp.content:
            assistant_blocks.append(block)
            if block.type == 'text':
                text_parts.append(block.text)
            elif block.type == 'tool_use':
                tool_uses.append(block)

        final_text = '\n'.join(text_parts).strip()

        # Append assistant turn (raw blocks via the API's content shape)
        messages.append({'role': 'assistant',
                         'content': [_block_to_dict(b) for b in assistant_blocks]})

        if stop_reason != 'tool_use' or not tool_uses:
            break  # agent produced a final answer

        # Execute each tool_use against the MCP server
        tool_results = []
        for tu in tool_uses:
            t_wall = time.time()
            try:
                result = await mcp_session.call_tool(tu.name, tu.input or {})
                tool_output = _mcp_result_to_text(result)
                error_flag = False
            except Exception as e:
                tool_output = f'ERROR: {e}'
                error_flag = True
            dt = time.time() - t_wall

            trace.append({
                'turn': turns,
                'tool': tu.name,
                'input': tu.input,
                'output_preview': (tool_output[:500] + '…') if len(tool_output) > 500 else tool_output,
                'output_chars': len(tool_output),
                'is_error': error_flag,
                'wall_ms': int(dt * 1000),
            })
            tool_results.append({
                'type': 'tool_result',
                'tool_use_id': tu.id,
                'content': tool_output,
                'is_error': error_flag,
            })

        messages.append({'role': 'user', 'content': tool_results})

    wall_s = time.time() - t0
    citations = extract_citations(final_text)
    grade = grade_agent_answer(case, final_text, citations)

    hit_turn_cap = turns >= MAX_TOOL_TURNS and stop_reason == 'tool_use'
    if hit_turn_cap:
        grade['passed'] = False
        grade['turn_cap_hit'] = True

    return {
        'case_id':    case['id'],
        'passed':     grade['passed'],
        'required_misses':    grade.get('required_misses', []),
        'forbidden_triggers': [{'rule': e, 'hit_alias': h['alias']} for (e, h) in grade.get('forbidden_triggers', [])],
        'turns':      turns,
        'wall_s':     round(wall_s, 2),
        'in_tokens':  total_input_tokens,
        'out_tokens': total_output_tokens,
        'final_text': final_text,
        'citations':  citations,
        'trace':      trace,
        'stop_reason': stop_reason,
        'turn_cap_hit': hit_turn_cap,
    }


def _block_to_dict(block):
    """Normalize an Anthropic content block back to the JSON-dict form we
    feed into the next messages.create call."""
    if block.type == 'text':
        return {'type': 'text', 'text': block.text}
    if block.type == 'tool_use':
        return {'type': 'tool_use', 'id': block.id, 'name': block.name, 'input': block.input}
    # Unknown block type — fall through defensively
    return {'type': block.type}


def _mcp_result_to_text(result):
    """Extract a single text blob from an MCP call_tool result for feeding
    back to the agent. MCP returns a CallToolResult with a .content list of
    TextContent items."""
    parts = []
    for item in getattr(result, 'content', []) or []:
        text = getattr(item, 'text', None)
        if text:
            parts.append(text)
    return '\n'.join(parts) if parts else '(empty)'


# ── Orchestration: N attempts per case ─────────────────────────────────────

async def run_eval(model, n_attempts, only_difficulty, only_case, verbose, system_prompt):
    _load_env_or_fail()
    from anthropic import AsyncAnthropic

    cases = load_cases()
    if only_case:
        cases = [c for c in cases if c['id'] == only_case]
    if only_difficulty:
        cases = [c for c in cases if c.get('difficulty') == only_difficulty]
    if not cases:
        sys.exit('No cases matched filters.')

    client = AsyncAnthropic()
    stdio_cm, ClientSession = await _spawn_mcp_session()

    from mcp import ClientSession as _CS  # keep type visible
    async with stdio_cm as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            tools_resp = await session.list_tools()
            tool_specs = _mcp_tools_to_anthropic_spec(tools_resp.tools)
            if verbose:
                print(f'[mcp] connected; {len(tool_specs)} tool(s) available', file=sys.stderr)

            all_attempts = []   # flat list across all cases+attempts
            per_case = {}       # case_id → list of attempt dicts

            for i, case in enumerate(cases, 1):
                attempts = []
                for n in range(n_attempts):
                    if verbose:
                        print(f'[{i}/{len(cases)} attempt {n+1}/{n_attempts}] {case["id"]} …',
                              file=sys.stderr, end=' ', flush=True)
                    try:
                        res = await run_one_attempt(
                            case, client, model, session, tool_specs, system_prompt, verbose,
                        )
                    except Exception as e:
                        res = {
                            'case_id': case['id'], 'passed': False,
                            'error': f'{type(e).__name__}: {e}',
                            'turns': 0, 'wall_s': 0,
                            'in_tokens': 0, 'out_tokens': 0,
                            'final_text': '', 'citations': [], 'trace': [],
                        }
                    attempts.append(res)
                    all_attempts.append(res)
                    if verbose:
                        print(f'{"PASS" if res.get("passed") else "FAIL"} '
                              f'({res["turns"]}t, {res["in_tokens"]}+{res["out_tokens"]}tok)',
                              file=sys.stderr)

                per_case[case['id']] = {
                    'case_id': case['id'],
                    'difficulty': case.get('difficulty'),
                    'query': case['query'],
                    'attempts': attempts,
                    'passes': sum(1 for a in attempts if a.get('passed')),
                    'total':  len(attempts),
                }

    # Aggregate
    majority_pass = sum(1 for c in per_case.values()
                        if c['passes'] >= (c['total'] + 1) // 2)
    any_pass     = sum(1 for c in per_case.values() if c['passes'] > 0)
    total_pass   = sum(c['passes'] for c in per_case.values())
    total_att    = sum(c['total']  for c in per_case.values())

    summary = {
        'ran_at':       datetime.datetime.now().isoformat(timespec='seconds'),
        'model':        model,
        'n_attempts':   n_attempts,
        'cases':        len(per_case),
        'majority_pass': majority_pass,
        'any_pass':      any_pass,
        'total_pass':    total_pass,
        'total_attempts': total_att,
        'per_case':     per_case,
        'system_prompt': system_prompt,
        'total_in_tokens':  sum(a['in_tokens']  for a in all_attempts),
        'total_out_tokens': sum(a['out_tokens'] for a in all_attempts),
    }
    return summary


# ── Reporting ──────────────────────────────────────────────────────────────

def _print_summary(s, verbose=False):
    print(f'# Agent eval — model={s["model"]} N={s["n_attempts"]}\n')
    from collections import defaultdict
    buckets = defaultdict(lambda: [0, 0])  # bucket → [majority_pass, total]
    for cid, rec in s['per_case'].items():
        b = rec['difficulty']
        buckets[b][1] += 1
        if rec['passes'] >= (rec['total'] + 1) // 2:
            buckets[b][0] += 1
        # Per-case line
        total = rec['total']
        passes = rec['passes']
        tag = '[PASS]' if passes >= (total + 1) // 2 else '[FAIL]'
        flaky = '  ⚠FLAKY' if 0 < passes < total else ''
        print(f'  {tag} {rec["case_id"]:<44} ({rec["difficulty"]:<11}) {passes}/{total}{flaky}')
        if verbose or passes < (total + 1) // 2:
            for i, a in enumerate(rec['attempts']):
                toks = f'{a["in_tokens"]}+{a["out_tokens"]}tok'
                t    = f'{a["turns"]}t'
                cite = ', '.join(f'{c["alias"]}·p{c["pages"][0]}' for c in a['citations'][:3]) or '(no citations)'
                pass_tag = 'PASS' if a.get('passed') else 'FAIL'
                extra = ''
                if a.get('turn_cap_hit'): extra += ' ⚠TURN-CAP'
                if a.get('error'):        extra += f' ERR:{a["error"]}'
                print(f'         {pass_tag} attempt {i+1}  {t} {toks}  cites: {cite}{extra}')

    print()
    print('## By difficulty (majority-vote):')
    for bucket in ('easy', 'medium', 'hard', 'adversarial', 'negative'):
        if bucket in buckets:
            p, t = buckets[bucket]
            pct = 100.0 * p / t if t else 0
            print(f'  {bucket:<12} {p}/{t}  ({pct:.0f}%)')
    t = sum(v[1] for v in buckets.values())
    p = sum(v[0] for v in buckets.values())
    pct = 100.0 * p / t if t else 0
    print(f'\n  TOTAL        {p}/{t}  ({pct:.0f}%) majority-vote')
    print(f'  ANY-PASS     {s["any_pass"]}/{s["cases"]}')
    print(f'  ATTEMPT-SUM  {s["total_pass"]}/{s["total_attempts"]}')
    print(f'\n  Tokens: {s["total_in_tokens"]:,} in + {s["total_out_tokens"]:,} out')


def _write_results(summary):
    RESULTS_DIR.mkdir(exist_ok=True)
    stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
    path = RESULTS_DIR / f'agent-eval-{stamp}.json'
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(summary, f, ensure_ascii=False, indent=2, default=str)
    return path


# ── CLI ────────────────────────────────────────────────────────────────────

def _build_parser():
    p = argparse.ArgumentParser(description='Agent-in-loop eval')
    p.add_argument('--model', default=DEFAULT_MODEL)
    p.add_argument('--n', type=int, default=3, help='Attempts per query (default 3)')
    p.add_argument('--only', default=None, help='Restrict to one difficulty bucket')
    p.add_argument('--case', default=None, help='Restrict to one case id')
    p.add_argument('--verbose', '-v', action='store_true')
    p.add_argument('--system-prompt-file', default=None,
                   help='Path to a file containing the system prompt (default: built-in V1)')
    p.add_argument('--no-save', action='store_true', help="Don't write a results/ JSON")
    return p


def main(argv=None):
    args = _build_parser().parse_args(argv)
    system_prompt = SYSTEM_PROMPT_V1
    if args.system_prompt_file:
        with open(args.system_prompt_file, 'r', encoding='utf-8') as f:
            system_prompt = f.read().strip()

    summary = asyncio.run(run_eval(
        model=args.model,
        n_attempts=args.n,
        only_difficulty=args.only,
        only_case=args.case,
        verbose=args.verbose,
        system_prompt=system_prompt,
    ))
    _print_summary(summary, verbose=args.verbose)
    if not args.no_save:
        path = _write_results(summary)
        print(f'\n  wrote: {path}')
    # Exit non-zero if any case fails majority vote
    majority_fail = summary['cases'] - summary['majority_pass']
    return 0 if majority_fail == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
