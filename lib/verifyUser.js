import { supabaseAdmin } from './supabaseAdmin.js';

// Expects the frontend to send: Authorization: Bearer <supabase_access_token>
// (this is the token the supabase-js client gives you after sign-in).
// Returns the Supabase user object, or null if the token is missing/invalid.
export async function verifyUser(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}
