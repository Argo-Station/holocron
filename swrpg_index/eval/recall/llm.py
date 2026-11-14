"""One headless LLM call, logged and cached — the only door the benchmark's pipeline uses to a model.

Every call is `claude -p --model <explicit id>` with the default system prompt REPLACED, every tool
disabled, no MCP, no settings sources and no session persistence, run from an empty temp directory, so
the model sees only the prompt file and the message (measured: 527 input tokens for a one-line message).
The model is always named explicitly (ruling `model-by-work-type` R-MWT-4: never the settings default).

Each call is appended to a JSONL log (role, model, prompt sha1, message sha1, output, usage, ms). The
log doubles as a cache: a call whose (role, model, prompt sha1, message) was already logged is not
re-spent, so an interrupted run resumes where it stopped.
"""
import hashlib
import json
import os
import subprocess
import tempfile
import threading
import time

PIPELINE_MODEL = 'claude-sonnet-5'   # generator, filter, judge (Sonnet-class; R-MWT-4)
PROMPT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'prompts')

_LOCK = threading.Lock()
_CWD = tempfile.mkdtemp(prefix='recall-llm-')


def prompt(name):
    with open(os.path.join(PROMPT_DIR, name + '.txt'), encoding='utf-8') as f:
        text = f.read()
    return text, hashlib.sha1(text.encode('utf-8')).hexdigest()


def _key(role, model, prompt_sha1, message):
    return hashlib.sha1('\x1f'.join((role, model, prompt_sha1, message)).encode('utf-8')).hexdigest()


class CallLog(object):
    def __init__(self, path):
        self.path = path
        self.cache = {}
        if os.path.exists(path):
            with open(path, encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line:
                        rec = json.loads(line)
                        if not rec.get('is_error'):
                            self.cache[rec['key']] = rec

    def append(self, rec):
        with _LOCK:
            with open(self.path, 'a', encoding='utf-8') as f:
                f.write(json.dumps(rec, ensure_ascii=False, sort_keys=True) + '\n')
            if not rec.get('is_error'):
                self.cache[rec['key']] = rec


def call(log, role, prompt_name, message, schema, model=PIPELINE_MODEL, timeout=180, retries=2):
    """Returns the logged record; rec['output'] is the structured object (or None on failure)."""
    system, psha = prompt(prompt_name)
    key = _key(role, model, psha, message)
    hit = log.cache.get(key)
    if hit is not None:
        return hit
    cmd = ['claude', '-p', '--model', model, '--system-prompt', system, '--tools', '',
           '--strict-mcp-config', '--no-session-persistence', '--setting-sources', '',
           '--output-format', 'json', '--json-schema', json.dumps(schema)]
    last = None
    for attempt in range(retries + 1):
        t0 = time.perf_counter()
        try:
            p = subprocess.run(cmd, input=message, capture_output=True, text=True, timeout=timeout, cwd=_CWD)
            ms = int((time.perf_counter() - t0) * 1000)
            d = json.loads(p.stdout)
            out = d.get('structured_output')
            usage = d.get('usage') or {}
            rec = {
                'key': key, 'role': role, 'model': model, 'models_reported': sorted((d.get('modelUsage') or {}).keys()),
                'prompt': prompt_name, 'prompt_sha1': psha,
                'message_sha1': hashlib.sha1(message.encode('utf-8')).hexdigest(),
                'output': out, 'is_error': bool(d.get('is_error')) or out is None, 'ms': ms,
                'input_tokens': usage.get('input_tokens'), 'output_tokens': usage.get('output_tokens'),
                'cost_usd': d.get('total_cost_usd'),
            }
        except (subprocess.TimeoutExpired, ValueError) as e:
            rec = {'key': key, 'role': role, 'model': model, 'prompt': prompt_name, 'prompt_sha1': psha,
                   'output': None, 'is_error': True, 'error': f'{type(e).__name__}: {e}'[:300],
                   'ms': int((time.perf_counter() - t0) * 1000)}
        log.append(rec)
        if not rec['is_error']:
            return rec
        last = rec
        time.sleep(2 * (attempt + 1))
    return last
