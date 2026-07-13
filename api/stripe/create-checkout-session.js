import Stripe from 'stripe';
import { applyCors, handlePreflight } from '../../lib/cors.js';
import { verifyUser } from '../../lib/verifyUser.js';
import { supabaseAdmin } from '../../lib/supabaseAdmin.js';
import { getPlan } from '../../lib/plans.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  applyCors(req, res);
  if (handlePreflight(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });

  const plan = getPlan(req.body?.plan);
  if (!plan || !plan.priceId) {
    return res.status(400).json({ error: 'Unknown or unconfigured plan' });
  }

  // Ensure a users row (and a Stripe customer) exists for this
  // Supabase-authenticated person before we create a checkout session.
  let { data: userRow } = await supabaseAdmin.from('users').select('*').eq('id', user.id).maybeSingle();

  if (!userRow) {
    const customer = await stripe.customers.create({ email: user.email });
    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from('users')
      .insert({ id: user.id, email: user.email, stripe_customer_id: customer.id })
      .select()
      .single();
    if (insertErr) {
      console.error('Could not create users row', insertErr);
      return res.status(500).json({ error: 'Could not set up billing account' });
    }
    userRow = inserted;
  }

  const origin = process.env.ALLOWED_ORIGIN || 'https://thesuccessfulvet.com';

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: userRow.stripe_customer_id,
    line_items: [{ price: plan.priceId, quantity: 1 }],
    success_url: `${origin}/tools/mock-interview?checkout=success`,
    cancel_url: `${origin}/tools/mock-interview?checkout=cancelled`,
    metadata: { user_id: user.id, plan: plan.key },
    subscription_data: {
      metadata: { user_id: user.id, plan: plan.key },
    },
  });

  return res.status(200).json({ url: session.url });
}
