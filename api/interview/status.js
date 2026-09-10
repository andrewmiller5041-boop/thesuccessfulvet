import { applyCors, handlePreflight } from '../../lib/cors.js';
import { verifyUser } from '../../lib/verifyUser.js';
import { supabaseAdmin } from '../../lib/supabaseAdmin.js';
import { getPlan } from '../../lib/plans.js';

// Lets the frontend show "3 of 4 sessions left this month" or an
// upgrade prompt BEFORE the user fills out the setup screen, rather
// than letting them hit the paywall only after clicking "Begin".
export default async function handler(req, res) {
  applyCors(req, res);
  if (handlePreflight(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });

  const { data: activeSub } = await supabaseAdmin
    .from('subscriptions')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!activeSub) {
    return res.status(200).json({ subscribed: false });
  }

  const plan = getPlan(activeSub.plan);
  const periodMonth = firstOfMonthUTC();
  const { data: usageRow } = await supabaseAdmin
    .from('usage_counters')
    .select('sessions_used')
    .eq('user_id', user.id)
    .eq('period_month', periodMonth)
    .maybeSingle();

  const sessionsUsed = usageRow?.sessions_used || 0;

  return res.status(200).json({
    subscribed: true,
    plan: plan?.key || activeSub.plan,
    planName: plan?.name || activeSub.plan,
    sessionsUsed,
    monthlyLimit: plan?.monthlySessions ?? null,
    sessionsRemaining: plan ? Math.max(plan.monthlySessions - sessionsUsed, 0) : null,
    currentPeriodEnd: activeSub.current_period_end,
  });
}

function firstOfMonthUTC() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}
