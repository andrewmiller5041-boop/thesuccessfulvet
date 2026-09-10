import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// This is a second layer of defense on top of the plan-based monthly
// session cap. Its job isn't to enforce your business model — the
// Supabase usage_counters table does that — it's to stop a single
// account (or a compromised token) from hammering the endpoint faster
// than a human could plausibly type, which is what actually runs up
// an Anthropic bill in a hurry.

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Max 20 answer submissions per minute, per user. A real interview
// session sends roughly 1 every 30-90 seconds.
export const turnLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, '1 m'),
  analytics: true,
  prefix: 'tsv:turn',
});

// Max 10 new session starts per hour, per user.
export const sessionStartLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '1 h'),
  analytics: true,
  prefix: 'tsv:start',
});

// Resume tailoring is a heavier, less frequent action than an
// interview turn (file parsing + a longer Claude call + docx
// generation) — capped tighter accordingly.
export const resumeLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(8, '1 h'),
  analytics: true,
  prefix: 'tsv:resume',
});

// Regenerating the docx after the review/edit step does no AI call
// at all — it's just formatting — so this can be generous. Mainly
// here to stop a scripted loop rather than to protect any real cost.
export const docxRegenLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, '1 h'),
  analytics: true,
  prefix: 'tsv:docx-regen',
});
