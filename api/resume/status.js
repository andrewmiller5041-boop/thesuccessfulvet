import { applyCors, handlePreflight } from '../../lib/cors.js';
import { verifyUser } from '../../lib/verifyUser.js';
import { checkResumeEligibility } from '../../lib/subscriptionGate.js';

// Distinct from /api/account/status: this reports the resume tool's
// specific free-tier state (2 free tailorings before any
// subscription is needed) rather than only subscription status. The
// frontend calls this before showing the upload screen so someone on
// their first visit sees "2 free tailorings" rather than an upgrade
// prompt they haven't earned yet.
export default async function handler(req, res) {
  applyCors(req, res);
  if (handlePreflight(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });

  const eligibility = await checkResumeEligibility(user.id, user.email);

  if (!eligibility.ok) {
    const { ok, ...body } = eligibility;
    return res.status(200).json({ eligible: false, ...body });
  }

  return res.status(200).json({
    eligible: true,
    source: eligibility.source,
    freeRemaining: eligibility.source === 'free' ? eligibility.freeRemaining : null,
    sessionsRemaining: eligibility.source === 'paid' ? (eligibility.monthlyLimit - eligibility.sessionsUsed) : null,
    monthlyLimit: eligibility.source === 'paid' ? eligibility.monthlyLimit : null,
  });
}
