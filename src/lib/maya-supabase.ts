import { createClient } from '@supabase/supabase-js';

// Dedicated client targeting the maya-agent Supabase project
export const mayaDB = createClient(
  'https://dhyzixjwupyeiassmhzl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRoeXppeGp3dXB5ZWlhc3NtaHpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5MTUxNjIsImV4cCI6MjA5NTQ5MTE2Mn0.bUMeUgrPpPGZFzHE8fpo0EngZ0j4eu9Eg6SHnAIM5yw'
);
