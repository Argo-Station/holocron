"""Embedder abstraction + batch embedding pass.

Phase 2 default: BAAI/bge-small-en-v1.5 via sentence-transformers. 384-dim,
~130MB model cache, ~50-200 docs/sec on CPU depending on length. Produces
normalized float32 vectors so cosine similarity = dot product.

Design:
* Interface is `encode(texts: list[str]) -> np.ndarray(N, dim, float32)`.
  Vectors are L2-normalized at encode time; query-time cosine is just matmul.
* Embeddings are stored as float32 BLOBs in the passages table — loaded into
  a numpy (N, dim) array at query time. 6-10k passages × 384 × 4 bytes ≈
  10-15MB RAM. Plenty fast without sqlite-vec.
* Swappable: subclass Embedder for OpenAI / Voyage later; the ingest +
  search code only sees `.encode()` and `.model_id`.
"""
import datetime
import os
import sys
import time

import numpy as np


# Instructions BGE models expect on the query side (the asymmetric retrieval
# pattern from the BAAI papers). Keeps queries separate from passages at
# encode-time.
BGE_QUERY_PREFIX = 'Represent this sentence for searching relevant passages: '


class Embedder:
    """Base interface. Subclasses implement `_encode_batch`."""
    model_id = 'unknown'
    dim = 0
    batch_size = 32

    def encode(self, texts, is_query=False):
        raise NotImplementedError


class STEmbedder(Embedder):
    """sentence-transformers local embedder. Default for phase 2."""

    def __init__(self, model_name='BAAI/bge-small-en-v1.5', device=None):
        try:
            from sentence_transformers import SentenceTransformer
        except ImportError:
            print('ERROR: sentence-transformers not installed. Run: pip install sentence-transformers',
                  file=sys.stderr)
            raise
        self._ST = SentenceTransformer
        t0 = time.time()
        self.model = SentenceTransformer(model_name, device=device)
        self.model_id = model_name.split('/')[-1]  # 'bge-small-en-v1.5'
        # Prefer the new API when present; fall back to the old name for
        # older sentence-transformers versions.
        try:
            self.dim = self.model.get_embedding_dimension()
        except AttributeError:
            self.dim = self.model.get_sentence_embedding_dimension()
        self.batch_size = 32
        print(f'[embed] loaded {model_name} dim={self.dim} in {time.time()-t0:.1f}s', file=sys.stderr)

    def encode(self, texts, is_query=False):
        if not texts:
            return np.zeros((0, self.dim), dtype=np.float32)
        # BGE papers: use query prefix for queries, no prefix for passages.
        prepared = [BGE_QUERY_PREFIX + t for t in texts] if is_query else list(texts)
        arr = self.model.encode(
            prepared,
            batch_size=self.batch_size,
            normalize_embeddings=True,
            show_progress_bar=False,
            convert_to_numpy=True,
        )
        # sentence-transformers returns float32 by default; enforce it.
        return arr.astype(np.float32, copy=False)


# ── Global default ─────────────────────────────────────────────────────────

_DEFAULT_EMBEDDER = None


def default_embedder():
    """Lazy-load the default embedder once per process."""
    global _DEFAULT_EMBEDDER
    if _DEFAULT_EMBEDDER is None:
        _DEFAULT_EMBEDDER = STEmbedder()
    return _DEFAULT_EMBEDDER


# ── BLOB (de)serialization ─────────────────────────────────────────────────

def vec_to_blob(v):
    """numpy 1-D float32 array → SQLite BLOB bytes."""
    arr = np.asarray(v, dtype=np.float32)
    return arr.tobytes()


def blob_to_vec(blob, dim):
    return np.frombuffer(blob, dtype=np.float32, count=dim)


# ── Batch embedding pass ───────────────────────────────────────────────────

def embed_unembedded(conn, alias=None, embedder=None, batch_size=64, verbose=True):
    """Compute embeddings for any passages lacking one. If alias is given,
    restrict to that PDF. Returns (passages_embedded, passages_skipped)."""
    if embedder is None:
        embedder = default_embedder()

    where = 'WHERE embedding IS NULL'
    params = []
    if alias:
        where += ' AND alias = ?'
        params.append(alias)
    rows = conn.execute(
        f'SELECT id, text FROM passages {where} ORDER BY id',
        params,
    ).fetchall()
    if not rows:
        if verbose:
            print('[embed] nothing to do — all passages already embedded')
        return 0, 0

    total = len(rows)
    if verbose:
        print(f'[embed] model={embedder.model_id} dim={embedder.dim} batch={batch_size} total={total}', file=sys.stderr)

    written = 0
    t0 = time.time()
    for start in range(0, total, batch_size):
        batch = rows[start:start + batch_size]
        texts = [r[1] for r in batch]
        vectors = embedder.encode(texts, is_query=False)
        for (rid, _), v in zip(batch, vectors):
            conn.execute(
                'UPDATE passages SET embedding = ?, embedding_model = ? WHERE id = ?',
                (vec_to_blob(v), embedder.model_id, rid),
            )
            written += 1
        conn.commit()
        if verbose and (start + batch_size) % (batch_size * 10) == 0:
            dt = time.time() - t0
            rate = written / max(dt, 0.001)
            eta = (total - written) / max(rate, 0.001)
            print(f'  [{written:>5}/{total}] {rate:.1f} pass/s  eta {eta:.0f}s', file=sys.stderr)

    # Update embeddings_meta for every alias we touched.
    affected = conn.execute(
        'SELECT alias, COUNT(*) FROM passages WHERE embedding IS NOT NULL GROUP BY alias'
    ).fetchall()
    now = datetime.datetime.now().isoformat(timespec='seconds')
    for a, n in affected:
        conn.execute(
            '''INSERT OR REPLACE INTO embeddings_meta (alias, model, dim, embedded_at, passage_count)
               VALUES (?, ?, ?, ?, ?)''',
            (a, embedder.model_id, embedder.dim, now, n),
        )
    conn.commit()

    if verbose:
        dt = time.time() - t0
        print(f'[embed] {written} passage(s) embedded in {dt:.1f}s ({written/max(dt,0.001):.1f}/s)', file=sys.stderr)
    return written, total - written


# ── Query-time retrieval ──────────────────────────────────────────────────

def _field(row, key):
    """row[key] off a dict or sqlite3.Row; None when the row has no such column."""
    if isinstance(row, dict):
        return row.get(key)
    try:
        return row[key]
    except (IndexError, KeyError):
        return None


def tie_key(row):
    """A result's place among EQUAL scores (C-OHY-4): built only from what a re-ingest keeps — the book, the
    pages, the content type, the passage's sequence in its page, and the text itself — never from a row id.
    Ids are AUTOINCREMENT and re-minted by every ingest, so an id tie-break (or none: insertion order) put the
    same question's equal-scored pages in a different order after each rebuild. Identical passages in two
    copies of a book score bit-for-bit equal, so these ties are real. Every score sort in the search path
    breaks its ties with this key (or, in SQL, with the same columns in the same order)."""
    return (_field(row, 'alias') or '', _field(row, 'page_start') or 0, _field(row, 'page_end') or 0,
            _field(row, 'content_type') or '', _field(row, 'seq') or 0, _field(row, 'text') or '')


def semantic_search(conn, query, alias_filter=None, limit=20, embedder=None):
    """Return list of dicts with passage-level semantic ranks via cosine
    similarity. Loads all candidate vectors into numpy once, matmul for
    similarity."""
    if embedder is None:
        embedder = default_embedder()

    where = 'WHERE pg.embedding IS NOT NULL'
    params = []
    if alias_filter:
        ph = ','.join('?' * len(alias_filter))
        where += f' AND pg.alias IN ({ph})'
        params.extend(alias_filter)

    # Book identity (name + tier) is joined HERE, on the semantic leg, so it is
    # carried the same way the BM25 leg carries it (api.bm25_search's `JOIN pdfs`).
    # Before this, only BM25 looked identity up, so a chunk that arrived by meaning
    # rather than by words came back with no book name — and the community marker
    # lives only on that name (R-TP2-2).
    #
    # LEFT, not INNER, on purpose: a passage whose alias has no `pdfs` row keeps its
    # place in the ranking and arrives with book_name=None, which downstream cites as
    # unverified. An inner join would drop it instead, trading a labelling bug for a
    # silent recall bug. (Measured 2026-08-13: 0 such orphans across 11,841 passages —
    # so this is future-proofing, not a live case.)
    rows = conn.execute(
        f'''SELECT pg.id, pg.chunk_id, pg.alias, pg.page_start, pg.page_end,
                   pg.chapter, pg.section, pg.content_type, pg.seq, pg.text, pg.embedding,
                   pdf.name AS book_name, pdf.tier AS tier
            FROM passages pg
            LEFT JOIN pdfs pdf ON pdf.alias = pg.alias
            {where}''',
        params,
    ).fetchall()
    if not rows:
        return []

    # Stack BLOBs into (N, dim) numpy array
    dim = embedder.dim
    n = len(rows)
    matrix = np.empty((n, dim), dtype=np.float32)
    for i, r in enumerate(rows):
        matrix[i] = np.frombuffer(r['embedding'], dtype=np.float32, count=dim)

    # Encode query (normalized), then dot for cosine similarity.
    q_vec = embedder.encode([query], is_query=True)[0]  # (dim,)
    sims = matrix @ q_vec   # (N,)
    # The top `limit` by similarity, equal similarities in tie_key order (C-OHY-4). Every row scoring at least
    # the limit-th best similarity is a candidate, so a tie that straddles the cut is settled by the key too.
    k = min(limit, n)
    if k <= 0:
        return []
    cut = np.partition(sims, n - k)[n - k]
    cand = np.flatnonzero(sims >= cut)
    top_idx = sorted(cand.tolist(), key=lambda i: (-float(sims[i]), tie_key(rows[i])))[:k]

    results = []
    for idx in top_idx:
        r = rows[int(idx)]
        results.append({
            'passage_id': r['id'],
            'chunk_id':   r['chunk_id'],
            'alias':      r['alias'],
            'page_start': r['page_start'],
            'page_end':   r['page_end'],
            'chapter':    r['chapter'],
            'section':    r['section'],
            'content_type': r['content_type'],
            'seq':        r['seq'],
            'text':       r['text'],
            'book_name':  r['book_name'],
            'tier':       r['tier'],
            'similarity': float(sims[int(idx)]),
        })
    return results
