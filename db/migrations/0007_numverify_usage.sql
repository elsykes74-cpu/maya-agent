-- 0007 — Numverify line-type check.
--
-- Validates phone numbers (validity, carrier, line type) before VAPI voice
-- dials and SMS, since Tavily-sourced numbers are unverified.
--
-- numverify_usage is the monthly quota ledger (mirrors rentcast_usage);
-- NUMVERIFY_MONTHLY_CAP defaults to 100 (the free-tier allowance).
--
-- phone_validation was already in the drizzle schema but never migrated, so
-- it is created here too. All statements are idempotent.

DO $$ BEGIN
  CREATE TYPE "phone_status" AS ENUM ('valid','invalid','disconnected','voip','landline','mobile','unknown');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "line_type" AS ENUM ('mobile','landline','voip','unknown');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "phone_validation" (
  "id" bigserial PRIMARY KEY,
  "lead_id" bigint NOT NULL,
  "phone" varchar(20) NOT NULL,
  "status" "phone_status" NOT NULL DEFAULT 'unknown',
  "carrier" varchar(100),
  "line_type" "line_type" NOT NULL DEFAULT 'unknown',
  "validated_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "phone_validation_phone_idx" ON "phone_validation" ("phone");

CREATE TABLE IF NOT EXISTS "numverify_usage" (
  "id" bigserial PRIMARY KEY,
  "endpoint" varchar(120) NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "numverify_usage_created_at_idx" ON "numverify_usage" ("created_at" DESC);
