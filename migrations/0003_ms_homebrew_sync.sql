-- F-100 MS — homebrew sync, the server half. Card `f100-ms-build` R-MSB-3; contract `f100-homebrew-sync-contract`
-- R-HSC-5 (the declared entry count) and R-HSC-8 (the application-level usage counters, one row per UTC day).
--
-- ADDITIVE, and nothing else (R-MSB-3): one column with a default, one new table. Today's worker (the lap's cut) keeps
-- working against a database migrated with this file — its INSERT names no `entries`, so the default fills it — which
-- is why Jason's order (this migration first, the push second) is safe; test/ms_worker_pack_lane.cjs W10 proves it.
-- The early-warning column of R-OPS-9.2 is NOT here: that line was struck by Jason's word (R-HSC-9).

-- The entry count a PUT declares beside its value (R-HSC-5). The server never reads inside a payload; the breaker
-- tells homebrew GROWTH (declared > stored) from a rewrite by this number alone. Every existing row reads 0.
ALTER TABLE "user_data" ADD COLUMN "entries" INTEGER NOT NULL DEFAULT 0;

-- One row per UTC day (`YYYY-MM-DD`): what the sync worker wrote, read and served that day, from the D1 binding's own
-- `meta` (R-HSC-8). `tripped_at` is when the free-limit breaker first refused homebrew growth that day (ISO time).
CREATE TABLE "usage_day" (
  "day"          TEXT PRIMARY KEY,
  "rows_written" INTEGER,
  "rows_read"    INTEGER,
  "requests"     INTEGER,
  "tripped_at"   TEXT
);
