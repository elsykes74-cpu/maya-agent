-- Migration: bot upgrade fields
-- Adds research/messaging fields to leads + new follow_up_messages table

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS research_summary  TEXT,
  ADD COLUMN IF NOT EXISTS call_briefing     TEXT,
  ADD COLUMN IF NOT EXISTS distress_signals  TEXT,
  ADD COLUMN IF NOT EXISTS web_mentions      TEXT,
  ADD COLUMN IF NOT EXISTS created_by        BIGINT;

CREATE TABLE IF NOT EXISTS follow_up_messages (
  id           BIGSERIAL PRIMARY KEY,
  lead_id      BIGINT       NOT NULL,
  message_type VARCHAR(50)  NOT NULL,
  tone         VARCHAR(50)  DEFAULT 'friendly',
  content      TEXT         NOT NULL,
  created_by   VARCHAR(50)  DEFAULT 'ladyjaye',
  created_at   TIMESTAMP    NOT NULL DEFAULT NOW()
);
