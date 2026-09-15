-- 0006 — Referential integrity (FKs) + scoped timestamptz conversion.
--
-- Verified pre-flight (2026-09-15): 0 orphan rows across every child table,
-- so every constraint below validates immediately. At current sizes
-- (all tables < 1.3 MB) the ADD CONSTRAINT validation scan is sub-millisecond
-- and safe inside a transaction. BEFORE any child table exceeds ~1M rows,
-- switch to the two-step online pattern: ADD CONSTRAINT ... NOT VALID, then
-- ALTER TABLE ... VALIDATE CONSTRAINT (the latter takes only SHARE UPDATE
-- EXCLUSIVE, not a full table lock).
--
-- DELIBERATELY OMITTED: call_queue.campaign_id / call_queue.campaign_lead_id.
-- The pipeline inserts those as sentinel 0 (non-campaign dials), so a FK to
-- campaigns/campaign_leads would reject every pipeline dial insert. Left as
-- documented sentinels rather than breaking production writes.
--
-- All statements are guarded (idempotent) and safe to re-run.

-- ── 1. lead_id → leads(id) ON DELETE CASCADE (16 child tables) ────────────────
DO $$
DECLARE
  t text;
  tbls text[] := ARRAY[
    'activities','appointments','call_queue','calls','campaign_leads',
    'compliance_logs','duplicate_flags','follow_up_enrollments',
    'follow_up_messages','lead_attributions','lead_call_logs','offers',
    'phone_validation','property_analyses','sms_logs','tasks'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    -- Skip tables that don't exist here (schema.ts is a subset of prod), and
    -- skip any table that ALREADY has a FK on lead_id under any name — e.g.
    -- lead_call_logs pre-existed with lead_call_logs_lead_id_fkey (SET NULL,
    -- intentionally kept for audit-record preservation). This prevents
    -- creating a second, conflicting FK on the same column.
    IF to_regclass(format('public.%I', t)) IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM pg_constraint c
         WHERE c.contype='f' AND c.conrelid = to_regclass(format('public.%I', t))
           AND (SELECT attname FROM pg_attribute
                WHERE attrelid=c.conrelid AND attnum=c.conkey[1]) = 'lead_id'
       ) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE',
        t, 'fk_'||t||'_lead'
      );
    END IF;
  END LOOP;
END $$;

-- ── 2. Other lead references + lookups ────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_duplicate_flags_duplicate_lead') THEN
    ALTER TABLE duplicate_flags ADD CONSTRAINT fk_duplicate_flags_duplicate_lead
      FOREIGN KEY (duplicate_lead_id) REFERENCES leads(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_buyer_criteria_buyer') THEN
    ALTER TABLE buyer_criteria ADD CONSTRAINT fk_buyer_criteria_buyer
      FOREIGN KEY (buyer_id) REFERENCES buyers(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_leads_source') THEN
    ALTER TABLE leads ADD CONSTRAINT fk_leads_source
      FOREIGN KEY (source_id) REFERENCES lead_sources(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_leads_profile') THEN
    ALTER TABLE leads ADD CONSTRAINT fk_leads_profile
      FOREIGN KEY (profile_id) REFERENCES lead_profiles(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_lead_attributions_source') THEN
    ALTER TABLE lead_attributions ADD CONSTRAINT fk_lead_attributions_source
      FOREIGN KEY (source_id) REFERENCES lead_sources(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── 3. Scoped timestamptz conversion (scheduling / forward-looking columns) ────
-- These carry wall-clock scheduling meaning (an appointment, a follow-up, a
-- due task) that is compared against "now in ET" or shown to a human, so a
-- naive `timestamp` is a correctness/DST hazard. Existing values were written
-- as UTC, so reinterpret them AS UTC. Audit columns (created_at/updated_at)
-- are intentionally left as `timestamp` — UTC-consistent and tz-irrelevant.
DO $$
DECLARE
  r record;
  cols text[][] := ARRAY[
    ['appointments','scheduled_date'],
    ['leads','appointment_date'],
    ['leads','next_follow_up_date'],
    ['tasks','due_at'],
    ['tasks','snoozed_until'],
    ['calls','appointment_date']
  ];
  i int;
BEGIN
  FOR i IN 1 .. array_length(cols,1) LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=cols[i][1] AND column_name=cols[i][2]
        AND data_type='timestamp without time zone'
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ALTER COLUMN %I TYPE timestamptz USING %I AT TIME ZONE ''UTC''',
        cols[i][1], cols[i][2], cols[i][2]
      );
    END IF;
  END LOOP;
END $$;

-- ── Rollback ──────────────────────────────────────────────────────────────────
-- FKs:  ALTER TABLE <t> DROP CONSTRAINT IF EXISTS fk_<t>_lead;  (+ the named ones above)
-- TZ:   ALTER TABLE <t> ALTER COLUMN <c> TYPE timestamp USING <c> AT TIME ZONE 'UTC';
