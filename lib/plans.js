// Plan configuration. Session counts and prices are yours to set in
// Stripe — this file just needs to match what you configure there.
// priceId values come from the Stripe Dashboard (Product > Pricing).

export const PLANS = {
  starter: {
    key: 'starter',
    name: 'Starter',
    monthlySessions: 4,
    priceId: process.env.STRIPE_PRICE_STARTER,
  },
  pro: {
    key: 'pro',
    name: 'Pro',
    monthlySessions: 20,
    priceId: process.env.STRIPE_PRICE_PRO,
  },
};

export function getPlan(planKey) {
  return PLANS[planKey] || null;
}
