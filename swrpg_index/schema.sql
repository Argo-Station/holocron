-- swrpg_index schema — SQLite FTS5-backed rulebook retrieval.
--
-- Design notes:
-- * One chunk = one cleaned PDF page (phase 1). Phase 2 will sub-chunk into
--   500-800 token passages when embeddings land; schema is forward-compatible.
-- * chunks_fts is a contentless FTS5 mirror of the `chunks` table so
--   citations (alias, page_start, chapter, section, ...) stay authoritative
--   while BM25 + snippet() operate on the text + fielded columns.
-- * TOC is stored separately so `toc <alias>` and chapter-range queries are
--   O(1) DB lookups instead of re-parsing the PDF each call.

CREATE TABLE IF NOT EXISTS pdfs (
    alias       TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    path        TEXT NOT NULL,
    book_line   TEXT,                  -- 'eote'|'aor'|'fad'|'shared'|'beginner-game'|'supplement'|'folio'|'era'|'holocron'|'atlas'
    tier        TEXT,                  -- 'beginner'|'core'|'advanced'|'supplement'
    page_count  INTEGER,
    has_text    INTEGER DEFAULT 1,     -- 1 if PyMuPDF can extract native text
    has_ocr     INTEGER DEFAULT 0,     -- 1 if Docs/ocr_cache/<alias>.ocr.json exists
    ingested_at TEXT                   -- ISO timestamp of last successful ingest
);

CREATE TABLE IF NOT EXISTS toc (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    alias       TEXT NOT NULL,
    level       INTEGER NOT NULL,      -- 1 = chapter, 2 = section, 3+ = subsection
    title       TEXT NOT NULL,
    page_start  INTEGER NOT NULL,      -- 1-indexed
    page_end    INTEGER,               -- 1-indexed inclusive, inferred at ingest
    summary     TEXT,                  -- optional one-liner (hand or LLM written)
    FOREIGN KEY (alias) REFERENCES pdfs(alias) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_toc_alias       ON toc(alias);
CREATE INDEX IF NOT EXISTS idx_toc_alias_page  ON toc(alias, page_start);
CREATE INDEX IF NOT EXISTS idx_toc_alias_level ON toc(alias, level);

CREATE TABLE IF NOT EXISTS chunks (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    alias        TEXT NOT NULL,
    page_start   INTEGER NOT NULL,     -- 1-indexed
    page_end     INTEGER NOT NULL,     -- 1-indexed, inclusive (== page_start for unmerged pages)
    chapter      TEXT,                 -- top-level TOC title at page_start
    section      TEXT,                 -- deepest TOC title at page_start
    content_type TEXT DEFAULT 'rule',  -- 'rule'|'table'|'sidebar'|'example'|'adversary'|'flavor'|'toc'|'cover'
    char_count   INTEGER,
    text         TEXT NOT NULL,
    FOREIGN KEY (alias) REFERENCES pdfs(alias) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_chunks_alias      ON chunks(alias);
CREATE INDEX IF NOT EXISTS idx_chunks_alias_page ON chunks(alias, page_start);

-- FTS5 mirror. Contentless table so we manage rowids explicitly on ingest.
-- Porter stemming + unicode61 folding handles nemeses/nemesis, encountered/encounter, etc.
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
    text,
    chapter,
    section,
    alias UNINDEXED,
    page_start UNINDEXED,
    page_end UNINDEXED,
    content_type UNINDEXED,
    tokenize = 'porter unicode61'
);

-- Topic registry — hand-curated pointers used by `topic` and `topics` commands.
-- A topic is a named list of (alias, section-fragment) pairs that point at the
-- canonical rulebook passage(s) for that concept. Priority lets us order the
-- per-book results when rendering.
CREATE TABLE IF NOT EXISTS topics (
    name              TEXT NOT NULL,
    alias             TEXT NOT NULL,
    section_fragment  TEXT NOT NULL,
    priority          INTEGER DEFAULT 0,
    PRIMARY KEY (name, alias, section_fragment)
);
CREATE INDEX IF NOT EXISTS idx_topics_name ON topics(name);

-- Ingest log (for diagnostics; tiny).
CREATE TABLE IF NOT EXISTS ingest_runs (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    ran_at         TEXT NOT NULL,
    alias          TEXT,
    action         TEXT,               -- 'rebuild' | 'refresh' | 'embed'
    chunks_written INTEGER,
    error          TEXT
);

-- ── Phase 2: passages + embeddings ────────────────────────────────────────
-- A passage is a sub-chunk of a chunk (phase 1 chunks = one per page;
-- passages slide a 500-800 token window with ~100 token overlap). Vectors
-- are stored inline as float32 BLOBs — loaded into numpy at query time for
-- matmul cosine similarity. Kept in the same DB file as FTS5 so there's one
-- source of truth and one thing to back up.
CREATE TABLE IF NOT EXISTS passages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    chunk_id        INTEGER NOT NULL,
    alias           TEXT NOT NULL,
    page_start      INTEGER NOT NULL,
    page_end        INTEGER NOT NULL,
    chapter         TEXT,
    section         TEXT,
    content_type    TEXT,
    seq             INTEGER NOT NULL,     -- 0-based sequence within parent chunk
    char_count      INTEGER,
    text            TEXT NOT NULL,
    embedding       BLOB,                 -- float32 array (NULL until embedded)
    embedding_model TEXT,                 -- e.g. 'bge-small-en-v1.5'
    FOREIGN KEY (chunk_id) REFERENCES chunks(id) ON DELETE CASCADE,
    FOREIGN KEY (alias)    REFERENCES pdfs(alias)  ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_passages_alias    ON passages(alias);
CREATE INDEX IF NOT EXISTS idx_passages_chunk    ON passages(chunk_id);

-- Track which model each alias's passages were embedded with, so re-embed
-- after a model change is a cheap lookup.
CREATE TABLE IF NOT EXISTS embeddings_meta (
    alias           TEXT PRIMARY KEY,
    model           TEXT NOT NULL,
    dim             INTEGER NOT NULL,
    embedded_at     TEXT NOT NULL,
    passage_count   INTEGER,
    FOREIGN KEY (alias) REFERENCES pdfs(alias) ON DELETE CASCADE
);
