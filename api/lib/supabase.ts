import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL ?? "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";

if (!supabaseUrl || !supabaseKey) {
  // Log but do NOT throw — a module-level throw crashes the entire serverless function
  // before any request handler runs, causing Twilio to receive a 500 and play its error message.
  console.error("[supabase] SUPABASE_URL and SUPABASE_ANON_KEY must be set — Supabase queries will fail gracefully");
}

export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseKey || "placeholder-key"
);
