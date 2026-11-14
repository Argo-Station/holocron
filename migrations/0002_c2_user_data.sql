-- F-34 Phase B — C2, the sync schema. Ruling `accounts-sync-architecture` §4 (contract C2) +
-- `f34-phase-b-scope` §3-4 (the composed v1 key set).
--
-- ── THE ONE LAW THIS SCHEMA ENCODES ────────────────────────────────────────────────────────────
-- `value_json` is the localStorage envelope VERBATIM. The server NEVER parses inside it. Each store
-- module's own `version` field keeps governing its own shape migrations, client-side, exactly as it
-- does today — which is why the roster's envelope (F-B3) had to land before this table existed.
-- Anything the server would need to understand about a payload is a design error, not a missing
-- column.
--
-- `version` here is the SERVER's row version and has nothing to do with the payload's own schema
-- version. It exists for one purpose: the conditional update that makes a stale writer lose cleanly
-- (§3.3). A client sends the version it believes is current; if the row has moved on, the write is
-- refused and the client re-pulls. It is a counter, not a timestamp, because two devices can write
-- inside the same millisecond and a counter cannot tie.
--
-- ── NON-DESTRUCTIVE BY CONSTRUCTION (§4) ──────────────────────────────────────────────────────
-- Every successful write appends the REPLACED value to `user_data_history` before overwriting, so
-- the loser of any conflict is recoverable from day one. A restore surface can ship later; the data
-- being unrecoverable was never acceptable, even for a version of the feature nobody has used yet.
--
-- ── WHAT IS NOT HERE, deliberately ────────────────────────────────────────────────────────────
-- No per-key table, no columns describing a payload's contents, no analytics. The store shelves and
-- the store hold-list are absent from the v1 key set by ruling (D-B7/D-B8) — shelf ids encode local
-- list position and collide across devices, and holds is a bare string array whose reader deletes
-- anything richer. Neither can be merged honestly yet, so neither syncs.

-- ── user_data — one row per (person, storage key) ────────────────────────────────────────────
CREATE TABLE "user_data" (
  "userId"     text    not null references "user" ("id") on delete cascade,
  "key"        text    not null,
  "value_json" text    not null,
  "version"    integer not null,
  "updatedAt"  integer not null,          -- ms epoch; the server's clock, for observability only
  PRIMARY KEY ("userId", "key")
);

-- ── user_data_history — the safety net, append-only ──────────────────────────────────────────
-- Holds the value that WAS there before each overwrite. Pruned to the most recent ~10 per key by
-- the writer, so a busy key cannot grow without bound inside a 500 MB free-plan database.
CREATE TABLE "user_data_history" (
  "id"         integer primary key autoincrement,
  "userId"     text    not null references "user" ("id") on delete cascade,
  "key"        text    not null,
  "value_json" text    not null,
  "version"    integer not null,          -- the version this value HAD before it was replaced
  "replacedAt" integer not null
);

CREATE INDEX "user_data_history_lookup" on "user_data_history" ("userId", "key", "id");
