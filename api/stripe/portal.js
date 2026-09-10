import Stripe from 'stripe';
import { applyCors, handlePreflight } from '../../lib/cors.js';
import { verifyUser } from '../../lib/verifyUser.js';
import { supabaseAdmin } from '../../lib/supabaseAdmin.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  applyCors(req, res);
  if (handlePreflight(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });

  const { data: userRow } = await supabaseAdmin.from('users').select('*').eq('id', user.id).maybeSingle();
  if (!userRow?.stripe_customer_id) {
    return res.status(400).json({ error: 'No billing account found for this user' });
  }

  const origin = process.env.ALLOWED_ORIGIN || 'https://thesuccessfulvet.com';

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: userRow.stripe_customer_id,
    return_url: `${origin}/tools/mock-interview`,
  });

  return res.status(200).json({ url: portalSession.url });
}
