#!/usr/bin/env python3
"""pdf_ref.py — deprecation shim.

The real implementation lives in `swrpg_index/` (SQLite FTS5 + BM25 +
structured citations). This file forwards every call to the new CLI so
existing invocations in memory, scripts, and docs keep working.

Migrate when you touch the call site:
    python3 pdf_ref.py search "X"     →   python3 swrpg_index.py search "X"
    python3 pdf_ref.py topic combat   →   python3 swrpg_index.py topic combat
    python3 pdf_ref.py ocr <alias>    →   python3 swrpg_index.py ocr <alias>

The new `search` does tokenized AND/OR/phrase queries, BM25 ranking, and
tier filtering via `--tier beginner|mid|late`. See `swrpg_index.py --help`.
"""
import sys

from swrpg_index.cli import main as _real_main

# Print a one-time deprecation notice to stderr so humans (and agents) see
# the new path, but don't break piped output by printing to stdout.
_HINT = (
    '[pdf_ref.py] deprecated; forwarding to swrpg_index. '
    'Use `python3 swrpg_index.py <command>` directly.\n'
)

if __name__ == '__main__':
    sys.stderr.write(_HINT)
    _real_main()
