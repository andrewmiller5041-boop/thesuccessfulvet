import { applyCors, handlePreflight } from '../../lib/cors.js';
import { verifyUser } from '../../lib/verifyUser.js';
import { docxRegenLimiter } from '../../lib/rateLimit.js';
import { generateResumeDocx } from '../../lib/generateResumeDocx.js';
import { generateChangeMemoDocx } from '../../lib/generateChangeMemoDocx.js';
import { computeKeywordCoverage } from '../../lib/keywordCoverage.js';
import { validateTailoredPayload } from '../../lib/validate.js';

// This exists specifically for the review step: after /api/resume/tailor
// returns, the frontend shows any flagged bullets/summary as editable
// fields (needs_your_input). Once the candidate fills those in, this
// endpoint takes the edited "tailored" object and rebuilds both
// documents from it — no Claude call, no session credit charged. It's
// pure formatting of content the candidate has already reviewed and
// edited themselves, which is also why validation here is about
// size/shape, not fact-checking — a human already vouched for this
// content.
export default async function handler(req, res) {
  applyCors(req, res);
  if (handlePreflight(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });

  const { success: withinRateLimit } = await docxRegenLimiter.limit(user.id);
  if (!withinRateLimit) {
    return res.status(429).json({ error: 'Too many requests in a short window. Try again shortly.' });
  }

  const validated = validateTailoredPayload(req.body || {});
  if (validated.error) {
    return res.status(400).json({ error: validated.error });
  }

  // The client sends back whatever jd_keywords came from the original
  // /api/resume/tailor response (untouched by the edit step) so
  // coverage can be recomputed against the edited content — a bullet
  // edit that adds "SharePoint" should move that keyword from missing
  // to matched without requiring a fresh Claude call.
  const jobKeywords = Array.isArray(req.body?.jobKeywords)
    ? req.body.jobKeywords.slice(0, 20).map((k) => String(k).slice(0, 60))
    : [];
  const keywordCoverage = computeKeywordCoverage(jobKeywords, validated.tailored);

  let docxBase64, memoBase64;
  try {
    const [resumeBuffer, memoBuffer] = await Promise.all([
      generateResumeDocx(validated.tailored, validated.track),
      generateChangeMemoDocx(validated.tailored, {
        targetRole: req.body?.targetRole,
        targetCompany: req.body?.targetCompany,
        track: validated.track,
        keywordCoverage,
      }),
    ]);
    docxBase64 = resumeBuffer.toString('base64');
    memoBase64 = memoBuffer.toString('base64');
  } catch (err) {
    console.error('Resume document regeneration failed', err);
    return res.status(500).json({ error: 'Could not rebuild the Word documents from your edits.' });
  }

  const baseName = buildBaseFileName(validated.tailored.candidate_name, req.body?.targetRole);

  return res.status(200).json({
    docxBase64,
    fileName: baseName + '_Resume.docx',
    memoBase64,
    memoFileName: baseName + '_Changes_Explained.docx',
    keywordCoverage,
  });
}

function buildBaseFileName(name, role) {
  const safeName = (name || 'Resume').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const safeRole = (role || 'Tailored').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `${safeName}_${safeRole}`;
}
