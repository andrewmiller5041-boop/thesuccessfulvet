import { applyCors, handlePreflight } from '../../lib/cors.js';
import { verifyUser } from '../../lib/verifyUser.js';
import { supabaseAdmin } from '../../lib/supabaseAdmin.js';

export default async function handler(req, res) {
  applyCors(req, res);
  if (handlePreflight(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });

  // Deliberately excludes the `transcript` column — history is meant
  // for a lightweight "here's your progress" view, not for replaying
  // full past answers back to the client on every page load.
  const { data, error } = await supabaseAdmin
    .from('interview_sessions')
    .select('id, track, role, company, question_count, status, final_summary, started_at, completed_at')
    .eq('user_id', user.id)
    .order('started_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('History fetch failed', error);
    return res.status(500).json({ error: 'Could not load session history' });
  }

  return res.status(200).json({ sessions: data });
}
