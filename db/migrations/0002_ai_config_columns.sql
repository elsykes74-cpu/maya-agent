-- Migration: ai_config calling provider columns
-- Adds ElevenLabs and Twilio credential fields to ai_config

ALTER TABLE ai_config
  ADD COLUMN IF NOT EXISTS elevenlabs_api_key    TEXT,
  ADD COLUMN IF NOT EXISTS elevenlabs_voice_id   TEXT,
  ADD COLUMN IF NOT EXISTS elevenlabs_voice_name TEXT,
  ADD COLUMN IF NOT EXISTS twilio_account_sid    TEXT,
  ADD COLUMN IF NOT EXISTS twilio_auth_token     TEXT,
  ADD COLUMN IF NOT EXISTS twilio_from_number    TEXT;
