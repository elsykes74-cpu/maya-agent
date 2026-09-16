-- 0007 — Fix the hot-dial partial index predicate.
--
-- Rationale: 0005 created idx_leads_hot_dial with the predicate
--   WHERE pipeline_stage = 'hot_routing' AND appointment_set IS NULL
-- to back processHotLeads()'s selection query. But appointment_set is a boolean
-- with DEFAULT false, and the scrapers never set it, so it lands as false, NOT
-- NULL. Verified in prod (2026-09-16): all 371 leads have appointment_set =
-- false, zero are NULL — so `IS NULL` matched 0 rows. Both the query and this
-- index have now been corrected to `IS NOT TRUE` (false OR NULL), which is what
-- "no appointment yet" actually means (the webhook only sets it true on booking).
--
-- Lock profile: plain CREATE INDEX takes a SHARE lock (blocks writes, not reads)
-- for the build. At current volume (leads ~371 rows / 1.3 MB) the build is
-- sub-millisecond, so this is safe inside the migration transaction. BEFORE
-- leads exceeds ~100k rows, switch to CREATE INDEX CONCURRENTLY (must run
-- OUTSIDE a transaction) to avoid blocking writes during the rebuild.
--
-- All statements are guarded (IF EXISTS / IF NOT EXISTS) → idempotent and safe
-- to re-run. Rollback restores the original (broken) predicate; see bottom.

-- Drop the old index (predicate matched 0 rows) and recreate it matching the
-- corrected query: pipeline_stage='hot_routing' AND appointment_set IS NOT TRUE,
-- ordered by lead_score DESC.
DROP INDEX IF EXISTS "idx_leads_hot_dial";

CREATE INDEX IF NOT EXISTS "idx_leads_hot_dial"
  ON "leads" ("lead_score" DESC)
  WHERE "pipeline_stage" = 'hot_routing' AND "appointment_set" IS NOT TRUE;

-- ── Rollback ──────────────────────────────────────────────────────────────────
-- Restores the original 0005 predicate (which indexed 0 rows):
-- DROP INDEX IF EXISTS "idx_leads_hot_dial";
-- CREATE INDEX IF NOT EXISTS "idx_leads_hot_dial"
--   ON "leads" ("lead_score" DESC)
--   WHERE "pipeline_stage" = 'hot_routing' AND "appointment_set" IS NULL;
