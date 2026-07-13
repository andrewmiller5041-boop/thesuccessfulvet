import { applyCors, handlePreflight } from '../../lib/cors.js';
import { verifyUser } from '../../lib/verifyUser.js';
import { supabaseAdmin } from '../../lib/supabaseAdmin.js';

export default async function handler(req, res) {
  applyCors(req, res);
  if (handlePreflight(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });

  // Only ever populated for sessions where the user opted into
  // saveHistory — the resume text and tailored output itself are
  // never stored, only the lightweight change summary and metadata.
  const { data, error } = await supabaseAdmin
    .from('resume_sessions')
    .select('id, track, target_role, target_company, change_summary, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('Resume history fetch failed', error);
    return res.status(500).json({ error: 'Could not load resume history' });
  }

  return res.status(200).json({ sessions: data });
}
