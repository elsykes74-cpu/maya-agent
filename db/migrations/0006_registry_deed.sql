-- Registry deed lookup: per-address Hampden County Registry of Deeds lookups.
-- RentCast has no sale history for Hampden County, so last-purchase dates come
-- from recorded deeds instead. This marks when a lead's address was checked so
-- lookups aren't repeated; the deeds themselves land in leads.sale_history with
-- source='registry' (last_sale_date holds the most recent recording date).
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "registry_deed_checked_at" timestamptz;
