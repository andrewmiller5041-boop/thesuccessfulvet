import Stripe from 'stripe';
import { supabaseAdmin } from '../../lib/supabaseAdmin.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Stripe webhook signature verification needs the RAW request body,
// so Vercel's default JSON body parsing has to be disabled here.
export const config = {
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const signature = req.headers['stripe-signature'];
  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch (err) {
    console.error('Could not read webhook body', err);
    return res.status(400).send('Could not read request body');
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.mode === 'subscription' && session.subscription) {
          const stripeSub = await stripe.subscriptions.retrieve(session.subscription);
          await upsertSubscriptionFromStripe(stripeSub);
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const stripeSub = event.data.object;
        await upsertSubscriptionFromStripe(stripeSub);
        break;
      }

      default:
        // Unhandled event types are fine to ignore — we only care
        // about subscription lifecycle events for access control.
        break;
    }
  } catch (err) {
    console.error('Webhook handler error', err);
    // Returning 500 tells Stripe to retry delivery.
    return res.status(500).json({ error: 'Webhook handler failed' });
  }

  return res.status(200).json({ received: true });
}

async function upsertSubscriptionFromStripe(stripeSub) {
  const userId = stripeSub.metadata?.user_id;
  const plan = stripeSub.metadata?.plan;

  if (!userId) {
    console.warn('Stripe subscription has no user_id metadata, skipping', stripeSub.id);
    return;
  }

  await supabaseAdmin.from('subscriptions').upsert(
    {
      user_id: userId,
      stripe_subscription_id: stripeSub.id,
      plan: plan || 'starter',
      status: stripeSub.status,
      current_period_end: stripeSub.current_period_end
        ? new Date(stripeSub.current_period_end * 1000).toISOString()
        : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'stripe_subscription_id' }
  );
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
