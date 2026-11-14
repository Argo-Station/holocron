"""Chunk → passage splitter.

Phase 1 chunks = one per cleaned PDF page (~1k-3k tokens typical for a CRB
page). For semantic retrieval we want smaller, more focused passages so
cosine similarity lands on the right rule paragraph, not the page.

Strategy:
* Target 500-800 tokens per passage, ~100 token overlap.
* Prefer paragraph boundaries (double-newline) when a cut lands mid-paragraph.
* Don't inflate short chunks — if the parent is ≤ max_tokens we keep it
  as a single passage.
* Token count is approximated as 0.75 × word_count. Good enough for window
  sizing; the actual embedder tokenizes internally.
"""
import re


TARGET_TOKENS = 600       # middle of 500-800
MAX_TOKENS    = 800
OVERLAP_TOKENS = 100
MIN_TOKENS    = 80        # drop passages smaller than this (noise, headers)


def _estimate_tokens(text):
    """Rough English token count. ~0.75 tokens per word with ASCII text."""
    return int(len(text.split()) / 0.75)


# Paragraph split: double-newline is the canonical break after clean_page_text.
# Fall back to single-newline groups for pages with unusual formatting.
_PARAGRAPH_SPLIT_RE = re.compile(r'\n\s*\n')


def _paragraphs(text):
    parts = [p.strip() for p in _PARAGRAPH_SPLIT_RE.split(text) if p.strip()]
    if len(parts) >= 2:
        return parts
    # Fallback: treat every line as a paragraph if double-newlines are missing.
    lines = [l.strip() for l in text.split('\n') if l.strip()]
    return lines if lines else [text.strip()]


def split_into_passages(text, target=TARGET_TOKENS, max_tokens=MAX_TOKENS,
                        overlap=OVERLAP_TOKENS, min_tokens=MIN_TOKENS):
    """Return list of passage strings. Preserves paragraph boundaries when
    possible; uses overlap for continuity across passages."""
    text = (text or '').strip()
    if not text:
        return []
    total_tokens = _estimate_tokens(text)
    if total_tokens <= max_tokens:
        return [text] if total_tokens >= min_tokens else []

    paragraphs = _paragraphs(text)
    # Pre-compute each paragraph's approximate token count.
    sizes = [_estimate_tokens(p) for p in paragraphs]

    passages = []
    i = 0
    n = len(paragraphs)
    while i < n:
        # Greedy fill: accumulate paragraphs until we reach target_tokens.
        buf = []
        buf_size = 0
        j = i
        while j < n and (buf_size + sizes[j] <= max_tokens or not buf):
            buf.append(paragraphs[j])
            buf_size += sizes[j]
            j += 1
            if buf_size >= target:
                break

        passage = '\n\n'.join(buf).strip()
        if _estimate_tokens(passage) >= min_tokens:
            passages.append(passage)

        # Overlap: step back so the next passage starts ~overlap tokens earlier.
        if j >= n:
            break
        # Walk backward from j to find an overlap start.
        step_back = 0
        k = j - 1
        while k > i and step_back < overlap:
            step_back += sizes[k]
            k -= 1
        i = max(i + 1, k + 1)  # guarantee forward progress

    return passages


def split_chunk(chunk_text, content_type=None):
    """Entry point used by ingest. Returns list of passage strings.

    Special cases:
    * Tiny chunks (covers, TOC pages) return a single passage unchanged.
    * 'cover' / 'toc' content types are returned as a single passage — no
      value in splitting table-of-contents pages, and cosine vs embedding
      of a numeric index isn't meaningful.
    """
    if not chunk_text:
        return []
    if content_type in ('cover', 'toc'):
        return [chunk_text.strip()]
    return split_into_passages(chunk_text)
