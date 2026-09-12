-- Scrape dedup + run log: external_id on leads, scrape_runs table
-- Fixes: dedup via LIKE on free-text notes (slow, fragile, race-prone)

-- ── leads.external_id ─────────────────────────────────────────────────────────
ALTER TABLE "leads" ADD COLUMN "external_id" varchar(64);

-- Backfill from the [cl:ID] markers the old scraper stored in notes.
-- DISTINCT ON keeps one row per CL id so the UNIQUE constraint below succeeds.
UPDATE "leads" l SET "external_id" = 'cl:' || m.cl_id
FROM (
  SELECT DISTINCT ON (substring("notes" from '\[cl:([0-9]+)\]')) id,
         substring("notes" from '\[cl:([0-9]+)\]') AS cl_id
  FROM "leads"
  WHERE "notes" LIKE '%[cl:%' AND "external_id" IS NULL
  ORDER BY substring("notes" from '\[cl:([0-9]+)\]'), id
) m
WHERE l.id = m.id AND m.cl_id IS NOT NULL;

ALTER TABLE "leads" ADD CONSTRAINT "leads_external_id_unique" UNIQUE("external_id");

-- ── scrape_runs ───────────────────────────────────────────────────────────────
-- One row per scheduled scrape so the /findleads bot command can report the
-- latest cached results without scraping live (serverless function timeouts).
CREATE TABLE "scrape_runs" (
  "id" bigserial PRIMARY KEY,
  "source" varchar(32) DEFAULT 'craigslist' NOT NULL,
  "status" varchar(16) DEFAULT 'ok' NOT NULL,
  "found" integer DEFAULT 0 NOT NULL,
  "added" integer DEFAULT 0 NOT NULL,
  "new_leads_json" text,
  "error" text,
  "started_at" timestamp DEFAULT now() NOT NULL,
  "finished_at" timestamp
);
