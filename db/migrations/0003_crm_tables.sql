-- CRM expansion: tasks, activities, offers, property_analyses,
-- buyers, buyer_criteria, follow_up_sequences, follow_up_enrollments,
-- lead_attributions, duplicate_flags

-- ── New enums ─────────────────────────────────────────────────────────────────

CREATE TYPE "task_type" AS ENUM (
  'call_back', 'send_sms', 'send_email', 'follow_up', 'visit', 'contract', 'other'
);

CREATE TYPE "task_status" AS ENUM (
  'pending', 'in_progress', 'completed', 'cancelled', 'snoozed'
);

CREATE TYPE "activity_type" AS ENUM (
  'call', 'sms', 'email', 'note', 'visit', 'offer', 'appointment', 'status_change', 'system'
);

CREATE TYPE "offer_status" AS ENUM (
  'draft', 'submitted', 'countered', 'accepted', 'rejected', 'expired', 'withdrawn'
);

CREATE TYPE "buyer_status" AS ENUM (
  'active', 'inactive', 'closed'
);

CREATE TYPE "analysis_type" AS ENUM (
  'stack_score', 'comps', 'flip', 'brrrr', 'buy_hold', 'rental', 'custom'
);

CREATE TYPE "follow_up_enrollment_status" AS ENUM (
  'active', 'paused', 'completed', 'cancelled'
);

CREATE TYPE "duplicate_flag_status" AS ENUM (
  'pending', 'confirmed', 'dismissed'
);

CREATE TYPE "attribution_channel" AS ENUM (
  'direct_mail', 'cold_call', 'sms', 'facebook', 'google', 'referral',
  'list_import', 'driving_for_dollars', 'other'
);

-- ── Tasks ─────────────────────────────────────────────────────────────────────

CREATE TABLE "tasks" (
  "id"           bigserial PRIMARY KEY,
  "lead_id"      bigint NOT NULL,
  "type"         "task_type" NOT NULL DEFAULT 'other',
  "title"        varchar(255) NOT NULL,
  "notes"        text,
  "due_at"       timestamp,
  "status"       "task_status" NOT NULL DEFAULT 'pending',
  "snoozed_until" timestamp,
  "completed_at" timestamp,
  "created_by"   bigint,
  "created_at"   timestamp NOT NULL DEFAULT now(),
  "updated_at"   timestamp NOT NULL DEFAULT now()
);

CREATE INDEX "tasks_lead_id_idx" ON "tasks" ("lead_id");
CREATE INDEX "tasks_due_at_idx"  ON "tasks" ("due_at") WHERE "status" = 'pending';

-- ── Activities (unified timeline) ─────────────────────────────────────────────

CREATE TABLE "activities" (
  "id"           bigserial PRIMARY KEY,
  "lead_id"      bigint NOT NULL,
  "type"         "activity_type" NOT NULL DEFAULT 'note',
  "body"         text NOT NULL,
  "linked_table" varchar(50),
  "linked_id"    bigint,
  "metadata"     text,
  "created_by"   bigint,
  "created_at"   timestamp NOT NULL DEFAULT now()
);

CREATE INDEX "activities_lead_id_idx" ON "activities" ("lead_id");
CREATE INDEX "activities_created_at_idx" ON "activities" ("lead_id", "created_at" DESC);

-- ── Offers ────────────────────────────────────────────────────────────────────

CREATE TABLE "offers" (
  "id"              bigserial PRIMARY KEY,
  "lead_id"         bigint NOT NULL,
  "offer_amount"    numeric(12, 2) NOT NULL,
  "status"          "offer_status" NOT NULL DEFAULT 'draft',
  "counter_amount"  numeric(12, 2),
  "assignment_fee"  numeric(12, 2),
  "arv_used"        numeric(12, 2),
  "repair_estimate" numeric(12, 2),
  "notes"           text,
  "submitted_at"    timestamp,
  "responded_at"    timestamp,
  "expires_at"      timestamp,
  "created_by"      bigint,
  "created_at"      timestamp NOT NULL DEFAULT now(),
  "updated_at"      timestamp NOT NULL DEFAULT now()
);

CREATE INDEX "offers_lead_id_idx" ON "offers" ("lead_id");

-- ── Property analyses ─────────────────────────────────────────────────────────

CREATE TABLE "property_analyses" (
  "id"            bigserial PRIMARY KEY,
  "lead_id"       bigint NOT NULL,
  "analysis_type" "analysis_type" NOT NULL DEFAULT 'custom',
  "title"         varchar(255),
  "content"       text NOT NULL,
  "created_by"    varchar(50) DEFAULT 'quickkick',
  "created_at"    timestamp NOT NULL DEFAULT now()
);

CREATE INDEX "property_analyses_lead_id_idx" ON "property_analyses" ("lead_id");

-- ── Buyers ────────────────────────────────────────────────────────────────────

CREATE TABLE "buyers" (
  "id"                 bigserial PRIMARY KEY,
  "name"               varchar(255) NOT NULL,
  "company"            varchar(255),
  "phone"              varchar(20),
  "email"              varchar(320),
  "status"             "buyer_status" NOT NULL DEFAULT 'active',
  "notes"              text,
  "last_purchase_date" timestamp,
  "total_purchases"    integer DEFAULT 0,
  "created_at"         timestamp NOT NULL DEFAULT now(),
  "updated_at"         timestamp NOT NULL DEFAULT now()
);

-- ── Buyer criteria (buy box) ──────────────────────────────────────────────────

CREATE TABLE "buyer_criteria" (
  "id"                  bigserial PRIMARY KEY,
  "buyer_id"            bigint NOT NULL,
  "zip_codes"           text,
  "cities"              text,
  "min_price"           numeric(12, 2),
  "max_price"           numeric(12, 2),
  "min_beds"            integer,
  "max_beds"            integer,
  "min_baths"           numeric(3, 1),
  "max_baths"           numeric(3, 1),
  "min_sqft"            integer,
  "max_sqft"            integer,
  "property_types"      text,
  "min_arv"             numeric(12, 2),
  "max_arv"             numeric(12, 2),
  "prefers_vacant"      boolean DEFAULT false,
  "prefers_off_market"  boolean DEFAULT true,
  "notes"               text,
  "created_at"          timestamp NOT NULL DEFAULT now(),
  "updated_at"          timestamp NOT NULL DEFAULT now()
);

CREATE INDEX "buyer_criteria_buyer_id_idx" ON "buyer_criteria" ("buyer_id");

-- ── Follow-up sequences ───────────────────────────────────────────────────────

CREATE TABLE "follow_up_sequences" (
  "id"          bigserial PRIMARY KEY,
  "name"        varchar(255) NOT NULL,
  "description" text,
  "steps"       text NOT NULL,
  "is_active"   boolean DEFAULT true,
  "created_at"  timestamp NOT NULL DEFAULT now(),
  "updated_at"  timestamp NOT NULL DEFAULT now()
);

-- ── Follow-up enrollments ─────────────────────────────────────────────────────

CREATE TABLE "follow_up_enrollments" (
  "id"           bigserial PRIMARY KEY,
  "lead_id"      bigint NOT NULL,
  "sequence_id"  bigint NOT NULL,
  "current_step" integer DEFAULT 0,
  "status"       "follow_up_enrollment_status" NOT NULL DEFAULT 'active',
  "next_run_at"  timestamp,
  "started_at"   timestamp NOT NULL DEFAULT now(),
  "completed_at" timestamp,
  "created_at"   timestamp NOT NULL DEFAULT now()
);

CREATE INDEX "follow_up_enrollments_lead_id_idx"     ON "follow_up_enrollments" ("lead_id");
CREATE INDEX "follow_up_enrollments_next_run_at_idx" ON "follow_up_enrollments" ("next_run_at")
  WHERE "status" = 'active';

-- ── Lead attributions ─────────────────────────────────────────────────────────

CREATE TABLE "lead_attributions" (
  "id"             bigserial PRIMARY KEY,
  "lead_id"        bigint NOT NULL,
  "source_id"      bigint,
  "channel"        "attribution_channel" DEFAULT 'other',
  "campaign"       varchar(255),
  "list_name"      varchar(255),
  "import_date"    timestamp,
  "estimated_cost" numeric(10, 2),
  "notes"          text,
  "created_at"     timestamp NOT NULL DEFAULT now()
);

CREATE INDEX "lead_attributions_lead_id_idx" ON "lead_attributions" ("lead_id");

-- ── Duplicate flags ───────────────────────────────────────────────────────────

CREATE TABLE "duplicate_flags" (
  "id"                bigserial PRIMARY KEY,
  "lead_id"           bigint NOT NULL,
  "duplicate_lead_id" bigint NOT NULL,
  "match_score"       integer DEFAULT 0,
  "match_fields"      text,
  "status"            "duplicate_flag_status" NOT NULL DEFAULT 'pending',
  "resolved_by"       bigint,
  "resolved_at"       timestamp,
  "created_at"        timestamp NOT NULL DEFAULT now()
);

CREATE INDEX "duplicate_flags_lead_id_idx" ON "duplicate_flags" ("lead_id");
CREATE UNIQUE INDEX "duplicate_flags_pair_idx"
  ON "duplicate_flags" (LEAST("lead_id", "duplicate_lead_id"), GREATEST("lead_id", "duplicate_lead_id"));
