import { applyCors, handlePreflight } from '../../lib/cors.js';
import { verifyUser } from '../../lib/verifyUser.js';
import { supabaseAdmin } from '../../lib/supabaseAdmin.js';
import { turnLimiter } from '../../lib/rateLimit.js';
import { buildSystemPrompt, callClaude } from '../../lib/claude.js';
import { validateAnswerText } from '../../lib/validate.js';

export default async function handler(req, res) {
  applyCors(req, res);
  if (handlePreflight(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });

  const { success: withinRateLimit } = await turnLimiter.limit(user.id);
  if (!withinRateLimit) {
    return res.status(429).json({ error: 'Slow down a little — too many requests in a short window.' });
  }

  const { sessionId, messages, answerText } = req.body || {};
  if (!sessionId || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Missing sessionId or messages' });
  }

  const cleanAnswer = validateAnswerText(answerText);
  if (!cleanAnswer) {
    return res.status(400).json({ error: 'Answer text is required' });
  }

  // Re-fetch the session from the DB — track/role/company/count come
  // from here, never from the client, so a tampered request body
  // can't redirect the interview to a different persona or question
  // count mid-session.
  const { data: session, error: sessionErr } = await supabaseAdmin
    .from('interview_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (sessionErr || !session) return res.status(404).json({ error: 'Session not found' });
  if (session.status !== 'in_progress') {
    return res.status(409).json({ error: 'This session has already ended.' });
  }

  const systemPrompt = buildSystemPrompt({
    track: session.track,
    role: session.role,
    company: session.company,
    count: session.question_count,
  });

  const updatedMessages = [...messages, { role: 'user', content: cleanAnswer }];

  let result;
  try {
    result = await callClaude(systemPrompt, updatedMessages);
  } catch (err) {
    console.error('Claude call failed on turn', err);
    return res.status(502).json({ error: 'The interview service is unavailable right now. Try sending that again.' });
  }

  const finalMessages = [...updatedMessages, { role: 'assistant', content: JSON.stringify(result) }];

  const updates = {};
  if (session.save_transcript) updates.transcript = finalMessages;
  if (result.is_final) {
    updates.status = 'completed';
    updates.completed_at = new Date().toISOString();
    updates.final_summary = result.final_summary || null;
  }
  if (Object.keys(updates).length) {
    await supabaseAdmin.from('interview_sessions').update(updates).eq('id', sessionId);
  }

  return res.status(200).json({ result, messages: finalMessages });
}
