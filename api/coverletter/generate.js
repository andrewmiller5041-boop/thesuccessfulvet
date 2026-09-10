import { applyCors, handlePreflight } from '../../lib/cors.js';
import { verifyUser } from '../../lib/verifyUser.js';
import { resumeLimiter } from '../../lib/rateLimit.js';
import { checkSubscriptionEligibility, recordUsage } from '../../lib/subscriptionGate.js';
import { extractResumeText } from '../../lib/resumeParse.js';
import { buildCoverLetterSystemPrompt, callClaudeForCoverLetter } from '../../lib/coverLetterPrompt.js';
import { generateCoverLetterDocx } from '../../lib/generateCoverLetterDocx.js';
import { validateResumePayload } from '../../lib/validate.js';

// Cover letters draw from the same paid session pool as everything
// except resume tailoring's free tier (see lib/subscriptionGate.js).
// Reuses the same upload -> extract -> tailor -> docx shape as the
// resume endpoint, including the OCR fallback for scanned PDFs.
export const config = {
  api: { bodyParser: { sizeLimit: '9mb' } },
};

export default async function handler(req, res) {
  applyCors(req, res);
  if (handlePreflight(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });

  const { success: withinRateLimit } = await resumeLimiter.limit(user.id);
  if (!withinRateLimit) {
    return res.status(429).json({ error: 'Too many requests in a short window. Try again shortly.' });
  }

  const eligibility = await checkSubscriptionEligibility(user.id);
  if (!eligibility.ok) {
    const { ok, ...body } = eligibility;
    return res.status(eligibility.status).json(body);
  }

  // Reuses the resume payload validator — same shape of inputs
  // (file, track, target role/company, job description).
  const payload = validateResumePayload(req.body || {});
  if (payload.error) {
    return res.status(400).json({ error: payload.error });
  }

  let resumeText, usedOcr;
  try {
    const extraction = await extractResumeText(payload.fileBase64, payload.mimeType);
    resumeText = extraction.text;
    usedOcr = extraction.usedOcr;
  } catch (err) {
    console.error('Cover letter: resume text extraction failed', err);
    return res.status(400).json({ error: err.message || 'Could not read that file. Upload a .docx or .pdf resume.' });
  }
  if (!resumeText || resumeText.trim().length < 50) {
    return res.status(400).json({
      error: 'Could not find readable text in that resume. Try a clearer scan or a .docx export.',
    });
  }

  const systemPrompt = buildCoverLetterSystemPrompt({
    track: payload.track,
    targetRole: payload.targetRole,
    targetCompany: payload.targetCompany,
    jobDescription: payload.jobDescription,
  });

  let letter;
  try {
    letter = await callClaudeForCoverLetter(systemPrompt, resumeText);
  } catch (err) {
    console.error('Claude cover letter generation failed', err);
    return res.status(502).json({ error: 'The cover letter service is unavailable right now. Try again shortly.' });
  }

  let docxBase64;
  try {
    const buffer = await generateCoverLetterDocx(letter);
    docxBase64 = buffer.toString('base64');
  } catch (err) {
    console.error('Cover letter docx generation failed', err);
    return res.status(500).json({ error: 'Could not generate the Word document.' });
  }

  await recordUsage(user.id, eligibility.periodMonth, eligibility.sessionsUsed);

  const safeName = (letter.candidate_name || 'CoverLetter').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const safeCompany = (payload.targetCompany || 'Application').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');

  return res.status(200).json({
    letter,
    docxBase64,
    fileName: `${safeName}_CoverLetter_${safeCompany}.docx`,
    usedOcr,
    sessionsRemaining: eligibility.monthlyLimit - (eligibility.sessionsUsed + 1),
  });
}
