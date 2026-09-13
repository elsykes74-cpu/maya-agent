-- Public-record enrichment: sale history on leads + RentCast quota ledger
-- Every RentCast API call (registry scan + record enrichment) is logged here so
-- a monthly cap can be enforced in code and the free tier is never exceeded.

-- Full deed-derived sale history from RentCast property records (public records /
-- tax assessor aggregation). lastSaleDate / lastSalePrice columns already exist;
-- this keeps the whole chain for the UI timeline.
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "sale_history" jsonb;

-- Ledger of RentCast API calls for monthly quota enforcement.
CREATE TABLE IF NOT EXISTS "rentcast_usage" (
  "id" bigserial PRIMARY KEY,
  "endpoint" varchar(120) NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "rentcast_usage_created_at_idx" ON "rentcast_usage" ("created_at" DESC);
