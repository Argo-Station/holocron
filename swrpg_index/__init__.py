"""swrpg_index — SQLite FTS5-backed retrieval for Star Wars FFG rulebooks.

Replaces pdf_ref.py's substring search with a real full-text index: tokenized
AND/OR/phrase queries, BM25 ranking, snippet highlighting, structured citation
metadata (book / chapter / section / page range / tier / content type). Phase 2
will add embedding-based semantic retrieval via sqlite-vec.
"""
from .utils import (
    SCRIPT_DIR, CONFIG_PATH, DB_PATH, OCR_CACHE_DIR,
    load_config, resolve_path, resolve_pdf, classify_tier, classify_book_line,
    clean_page_text, parse_page_range,
)

__all__ = [
    'SCRIPT_DIR', 'CONFIG_PATH', 'DB_PATH', 'OCR_CACHE_DIR',
    'load_config', 'resolve_path', 'resolve_pdf',
    'classify_tier', 'classify_book_line',
    'clean_page_text', 'parse_page_range',
]
