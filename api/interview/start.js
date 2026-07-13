import { applyCors, handlePreflight } from '../../lib/cors.js';
import { verifyUser } from '../../lib/verifyUser.js';
import { supabaseAdmin } from '../../lib/supabaseAdmin.js';
import { sessionStartLimiter } from '../../lib/rateLimit.js';
import { buildSystemPrompt, callClaude } from '../../lib/claude.js';
import { validateStartPayload } from '../../lib/validate.js';
import { getPlan } from '../../lib/plans.js';

export default async function handler(req, res) {
  applyCors(req, res);
  if (handlePreflight(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });

  const { success: withinRateLimit } = await sessionStartLimiter.limit(user.id);
  if (!withinRateLimit) {
    return res.status(429).json({ error: 'Too many session starts. Try again in a bit.' });
  }

  // --- Subscription check -------------------------------------------------
  const { data: activeSub, error: subError } = await supabaseAdmin
    .from('subscriptions')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (subError) {
    console.error('Subscription lookup failed', subError);
    return res.status(500).json({ error: 'Could not verify subscription' });
  }
  if (!activeSub) {
    return res.status(402).json({
      error: 'An active subscription is required to start a mock interview.',
      code: 'SUBSCRIPTION_REQUIRED',
    });
  }

  const plan = getPlan(activeSub.plan);
  if (!plan) {
    console.error('Subscription references unknown plan', activeSub.plan);
    return res.status(500).json({ error: 'Plan configuration error' });
  }

  // --- Usage check ----------------------------------------------------------
  const periodMonth = firstOfMonthUTC();
  const { data: usageRow } = await supabaseAdmin
    .from('usage_counters')
    .select('*')
    .eq('user_id', user.id)
    .eq('period_month', periodMonth)
    .maybeSingle();

  const sessionsUsed = usageRow?.sessions_used || 0;
  if (sessionsUsed >= plan.monthlySessions) {
    return res.status(402).json({
      error: `You've used all ${plan.monthlySessions} sessions on the ${plan.name} plan this month.`,
      code: 'LIMIT_REACHED',
      sessionsUsed,
      monthlyLimit: plan.monthlySessions,
    });
  }

  // --- Create the session row ------------------------------------------------
  const { track, role, company, count, saveTranscript } = validateStartPayload(req.body || {});

  const { data: session, error: sessionError } = await supabaseAdmin
    .from('interview_sessions')
    .insert({
      user_id: user.id,
      track,
      role,
      company,
      question_count: count,
      status: 'in_progress',
      save_transcript: saveTranscript,
    })
    .select()
    .single();

  if (sessionError || !session) {
    console.error('Could not create session', sessionError);
    return res.status(500).json({ error: 'Could not start a new session' });
  }

  // --- Kick off the interview with Claude -------------------------------------
  const systemPrompt = buildSystemPrompt({ track, role, company, count });
  const messages = [{ role: 'user', content: 'Please begin the interview with your first question.' }];

  let result;
  try {
    result = await callClaude(systemPrompt, messages);
  } catch (err) {
    console.error('Claude call failed on session start', err);
    // Roll the session back to abandoned rather than leaving a
    // phantom in_progress row with no first question.
    await supabaseAdmin.from('interview_sessions').update({ status: 'abandoned' }).eq('id', session.id);
    return res.status(502).json({ error: 'The interview service is unavailable right now. Try again shortly.' });
  }

  // Only now, having confirmed the session actually produced a first
  // question, do we count it against the monthly limit.
  await supabaseAdmin.from('usage_counters').upsert(
    {
      user_id: user.id,
      period_month: periodMonth,
      sessions_used: sessionsUsed + 1,
    },
    { onConflict: 'user_id,period_month' }
  );

  const updatedMessages = [...messages, { role: 'assistant', content: JSON.stringify(result) }];

  if (saveTranscript) {
    await supabaseAdmin.from('interview_sessions').update({ transcript: updatedMessages }).eq('id', session.id);
  }

  return res.status(200).json({
    sessionId: session.id,
    result,
    messages: updatedMessages,
    sessionsRemaining: plan.monthlySessions - (sessionsUsed + 1),
  });
}

function firstOfMonthUTC() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}
