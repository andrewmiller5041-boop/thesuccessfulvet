// Restricts the API to requests from your own site. Update
// ALLOWED_ORIGIN in your Vercel env vars if you ever serve this from
// a different domain (staging, etc). Returns true if the request was
// a preflight OPTIONS request and has already been responded to.

export function applyCors(req, res) {
  const origin = process.env.ALLOWED_ORIGIN || 'https://thesuccessfulvet.com';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Vary', 'Origin');
}

export function handlePreflight(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }
  return false;
}
