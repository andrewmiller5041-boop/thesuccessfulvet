import { supabaseAdmin } from './supabaseAdmin.js';
import { getPlan } from './plans.js';

const FREE_RESUME_CREDITS = 2;

// Interview sessions and resume tailoring draw from the same monthly
// "AI session" credit pool — one Starter/Pro subscription, one usage
// counter. This is a v1 simplification (see the build reference doc,
// Section 11) and easy to split into per-feature pools later if usage
// patterns end up wanting that.

// Cover letters and elevator pitches also draw from that same paid
// pool via checkSubscriptionEligibility/recordUsage below. Resume
// tailoring is the one exception — see checkResumeEligibility, which
// gives every account 2 free tailorings (mirroring the market's
// existing free offer) before falling back to the paid pool.

// Ensures a `users` row exists for this Supabase-authenticated
// person, without requiring a Stripe customer yet — free-tier usage
// needs somewhere to track credits before anyone has gone anywhere
// near checkout. stripe_customer_id stays null until they actually
// subscribe (see api/stripe/create-checkout-session.js, which fills
// it in at that point).
async function ensureUserRow(userId, email) {
  const { data: existing } = await supabaseAdmin.from('users').select('*').eq('id', userId).maybeSingle();
  if (existing) return existing;

  const { data: inserted, error } = await supabaseAdmin
    .from('users')
    .insert({ id: userId, email })
    .select()
    .single();

  if (error) {
    // Race condition guard: another request may have inserted the row
    // between our select and insert. Re-fetch rather than fail.
    const { data: retryFetch } = await supabaseAdmin.from('users').select('*').eq('id', userId).maybeSingle();
    if (retryFetch) return retryFetch;
    throw error;
  }
  return inserted;
}

// Resume-specific eligibility: free credits first, paid pool after.
// userEmail is only used the first time (creating the users row) —
// pass it through from the verified Supabase user object.
export async function checkResumeEligibility(userId, userEmail) {
  const userRow = await ensureUserRow(userId, userEmail);
  const freeUsed = userRow.free_resume_credits_used || 0;

  if (freeUsed < FREE_RESUME_CREDITS) {
    return {
      ok: true,
      source: 'free',
      freeUsed,
      freeRemaining: FREE_RESUME_CREDITS - freeUsed,
    };
  }

  // Free credits exhausted — fall back to the normal paid check.
  const paidEligibility = await checkSubscriptionEligibility(userId);
  if (!paidEligibility.ok) {
    // Make the "you're out of free ones, here's how to keep going"
    // message specific to the resume tool rather than the generic
    // subscription-required copy.
    if (paidEligibility.code === 'SUBSCRIPTION_REQUIRED') {
      return {
        ...paidEligibility,
        error: `You've used your ${FREE_RESUME_CREDITS} free tailored resumes. Subscribe to keep going.`,
      };
    }
    return paidEligibility;
  }
  return { ...paidEligibility, source: 'paid' };
}

// Call only after the resume tailoring this credit pays for has
// actually succeeded. Routes to whichever pool checkResumeEligibility
// said this request was drawing from.
export async function recordResumeUsage(userId, eligibility) {
  if (eligibility.source === 'free') {
    await supabaseAdmin
      .from('users')
      .update({ free_resume_credits_used: eligibility.freeUsed + 1 })
      .eq('id', userId);
    return;
  }
  await recordUsage(userId, eligibility.periodMonth, eligibility.sessionsUsed);
}

// Checks eligibility WITHOUT consuming a credit. Callers should do
// the actual work (Claude call, document generation, etc.) first,
// and only call recordUsage() once that work has actually succeeded
// — mirrors the interview endpoint's "don't charge for a failure"
// pattern.
export async function checkSubscriptionEligibility(userId) {
  const { data: activeSub, error: subError } = await supabaseAdmin
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (subError) {
    return { ok: false, status: 500, error: 'Could not verify subscription' };
  }
  if (!activeSub) {
    return {
      ok: false,
      status: 402,
      code: 'SUBSCRIPTION_REQUIRED',
      error: 'An active subscription is required to use this feature.',
    };
  }

  const plan = getPlan(activeSub.plan);
  if (!plan) {
    return { ok: false, status: 500, error: 'Plan configuration error' };
  }

  const periodMonth = firstOfMonthUTC();
  const { data: usageRow } = await supabaseAdmin
    .from('usage_counters')
    .select('sessions_used')
    .eq('user_id', userId)
    .eq('period_month', periodMonth)
    .maybeSingle();

  const sessionsUsed = usageRow?.sessions_used || 0;

  if (sessionsUsed >= plan.monthlySessions) {
    return {
      ok: false,
      status: 402,
      code: 'LIMIT_REACHED',
      error: `You've used all ${plan.monthlySessions} sessions on the ${plan.name} plan this month.`,
      sessionsUsed,
      monthlyLimit: plan.monthlySessions,
    };
  }

  return {
    ok: true,
    plan,
    periodMonth,
    sessionsUsed,
    monthlyLimit: plan.monthlySessions,
  };
}

// Call only after the work this credit pays for has actually
// succeeded (Claude call returned, docx generated, etc).
export async function recordUsage(userId, periodMonth, sessionsUsedBeforeThisCall) {
  await supabaseAdmin.from('usage_counters').upsert(
    {
      user_id: userId,
      period_month: periodMonth,
      sessions_used: sessionsUsedBeforeThisCall + 1,
    },
    { onConflict: 'user_id,period_month' }
  );
  return sessionsUsedBeforeThisCall + 1;
}

function firstOfMonthUTC() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}
