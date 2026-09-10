import { createClient } from '@supabase/supabase-js';

// SUPABASE_SERVICE_ROLE_KEY bypasses Row Level Security — this client
// must NEVER be sent to the browser or used outside /api functions.
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);
