#!/usr/bin/env python3
"""swrpg_index — canonical entry point.

SQLite FTS5-backed retrieval for Star Wars FFG rulebooks. Replaces the old
pdf_ref.py substring matcher with real tokenized AND/OR/phrase queries,
BM25 ranking, structured citation metadata, and tier-aware filtering.

Quick reference:
    python3 swrpg_index.py ingest                  # build/refresh the DB
    python3 swrpg_index.py list                    # what's indexed
    python3 swrpg_index.py search "nemesis encounter building"
    python3 swrpg_index.py search "lightsaber" --tier mid
    python3 swrpg_index.py topic "encounter building"
    python3 swrpg_index.py topics
    python3 swrpg_index.py toc eote --json
    python3 swrpg_index.py read eote --pages 331-333

See swrpg_index/cli.py for the full command surface.
"""
from swrpg_index.cli import main

if __name__ == '__main__':
    main()
