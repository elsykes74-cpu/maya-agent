-- 0005 — Performance indexes for the hot query paths.
--
-- Rationale: the 15-min pipeline tick and the scrapers filter/sort leads,
-- call_queue, scrape_runs, activities, and tasks on columns that currently
-- have no supporting index (every such query is a sequential scan).
--
-- Lock profile: plain CREATE INDEX takes a SHARE lock (blocks writes, not
-- reads) for the build. At current volume (leads ~371 rows / 1.3 MB, all
-- other tables < 1 MB) each build is sub-millisecond, so this is safe to run
-- inside the migration transaction. BEFORE any of these tables exceeds ~100k
-- rows, switch new indexes to CREATE INDEX CONCURRENTLY (which must run
-- OUTSIDE a transaction) to avoid blocking writes during the build.
--
-- All statements are IF NOT EXISTS → idempotent and safe to re-run.
-- Rollback: DROP INDEX IF EXISTS <name>;  (see bottom of file.)

-- Routing pass: runPipelineTick scans leads WHERE pipeline_stage = 'lead';
-- routeLead/digest also filter by stage.
CREATE INDEX IF NOT EXISTS "idx_leads_pipeline_stage"
  ON "leads" ("pipeline_stage");

-- Hot-dial pass: processHotLeads selects
--   WHERE pipeline_stage='hot_routing' AND appointment_set IS NULL
--   ORDER BY lead_score DESC.
-- Partial + ordered index matches that query exactly and stays tiny.
CREATE INDEX IF NOT EXISTS "idx_leads_hot_dial"
  ON "leads" ("lead_score" DESC)
  WHERE "pipeline_stage" = 'hot_routing' AND "appointment_set" IS NULL;

-- Anti-hammer check: processHotLeads looks up the most recent call_queue row
-- per lead within the last 48h.
CREATE INDEX IF NOT EXISTS "idx_call_queue_lead_created"
  ON "call_queue" ("lead_id", "created_at" DESC);

-- getLatestScrapeRun orders scrape_runs by started_at DESC (bot /findleads).
CREATE INDEX IF NOT EXISTS "idx_scrape_runs_started_at"
  ON "scrape_runs" ("started_at" DESC);

-- Lead timeline (activities) and per-lead call history.
CREATE INDEX IF NOT EXISTS "idx_activities_lead_created"
  ON "activities" ("lead_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_calls_lead_created"
  ON "calls" ("lead_id", "created_at" DESC);

-- Nurture: enrollInTrack checks pending send_sms tasks per lead; the SMS
-- worker scans due pending tasks.
CREATE INDEX IF NOT EXISTS "idx_tasks_lead_type_status"
  ON "tasks" ("lead_id", "type", "status");
CREATE INDEX IF NOT EXISTS "idx_tasks_due_pending"
  ON "tasks" ("due_at")
  WHERE "status" = 'pending';

-- ── Rollback ──────────────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS "idx_tasks_due_pending";
-- DROP INDEX IF EXISTS "idx_tasks_lead_type_status";
-- DROP INDEX IF EXISTS "idx_calls_lead_created";
-- DROP INDEX IF EXISTS "idx_activities_lead_created";
-- DROP INDEX IF EXISTS "idx_scrape_runs_started_at";
-- DROP INDEX IF EXISTS "idx_call_queue_lead_created";
-- DROP INDEX IF EXISTS "idx_leads_hot_dial";
-- DROP INDEX IF EXISTS "idx_leads_pipeline_stage";
