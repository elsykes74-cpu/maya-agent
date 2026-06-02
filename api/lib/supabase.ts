import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL ?? "https://dhyzixjwupyeiassmhzl.supabase.co";
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRoeXppeGp3dXB5ZWlhc3NtaHpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5MTUxNjIsImV4cCI6MjA5NTQ5MTE2Mn0.bUMeUgrPpPGZFzHE8fpo0EngZ0j4eu9Eg6SHnAIM5yw";

export const supabase = createClient(supabaseUrl, supabaseKey);
