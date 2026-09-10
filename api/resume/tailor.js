import { applyCors, handlePreflight } from '../../lib/cors.js';
import { verifyUser } from '../../lib/verifyUser.js';
import { supabaseAdmin } from '../../lib/supabaseAdmin.js';
import { resumeLimiter } from '../../lib/rateLimit.js';
import { checkResumeEligibility, recordResumeUsage } from '../../lib/subscriptionGate.js';
import { extractResumeText } from '../../lib/resumeParse.js';
import { buildResumeSystemPrompt, callClaudeForResume } from '../../lib/resumePrompt.js';
import { generateResumeDocx } from '../../lib/generateResumeDocx.js';
import { generateChangeMemoDocx } from '../../lib/generateChangeMemoDocx.js';
import { computeKeywordCoverage } from '../../lib/keywordCoverage.js';
import { validateResumePayload } from '../../lib/validate.js';

// Resumes arrive as base64 in a JSON body rather than multipart form
// data — simpler and more reliable in a serverless function, at the
// cost of ~33% size overhead from base64 encoding. The default body
// size limit needs raising to comfortably fit that.
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
    return res.status(429).json({ error: 'Too many resume requests in a short window. Try again shortly.' });
  }

  const eligibility = await checkResumeEligibility(user.id, user.email);
  if (!eligibility.ok) {
    const { ok, ...body } = eligibility;
    return res.status(eligibility.status).json(body);
  }

  const payload = validateResumePayload(req.body || {});
  if (payload.error) {
    return res.status(400).json({ error: payload.error });
  }

  // --- Extract text from the uploaded file (falls back to OCR for scanned PDFs) ---
  let resumeText, usedOcr;
  try {
    const extraction = await extractResumeText(payload.fileBase64, payload.mimeType);
    resumeText = extraction.text;
    usedOcr = extraction.usedOcr;
  } catch (err) {
    console.error('Resume text extraction failed', err);
    return res.status(400).json({
      error: err.message || 'Could not read that file. Upload a .docx or .pdf resume.',
    });
  }
  if (!resumeText || resumeText.trim().length < 50) {
    return res.status(400).json({
      error: usedOcr
        ? 'We tried reading this as a scanned document but couldn\u2019t find enough text. Try a clearer scan, or upload a .docx export instead.'
        : 'Could not find readable text in that file. If it\u2019s a scanned/image PDF, we\u2019ll try to read it automatically \u2014 if this keeps happening, try a .docx export instead.',
    });
  }

  // --- Tailor with Claude ---
  const systemPrompt = buildResumeSystemPrompt({
    track: payload.track,
    targetRole: payload.targetRole,
    targetCompany: payload.targetCompany,
    jobDescription: payload.jobDescription,
    mosCode: payload.mosCode,
  });

  let tailored;
  try {
    tailored = await callClaudeForResume(systemPrompt, resumeText);
  } catch (err) {
    console.error('Claude resume tailoring failed', err);
    return res.status(502).json({ error: 'The resume tailoring service is unavailable right now. Try again shortly.' });
  }

  // Deterministic — see lib/keywordCoverage.js for why this isn't
  // left to the model to self-report. Computed before doc generation
  // since the change memo includes it.
  const keywordCoverage = payload.jobDescription
    ? computeKeywordCoverage(tailored.jd_keywords, tailored)
    : { matched: [], missing: [] };

  // --- Generate both documents: the ATS-safe resume, and the readable change memo ---
  let docxBase64, memoBase64;
  try {
    const [resumeBuffer, memoBuffer] = await Promise.all([
      generateResumeDocx(tailored, payload.track),
      generateChangeMemoDocx(tailored, {
        targetRole: payload.targetRole,
        targetCompany: payload.targetCompany,
        track: payload.track,
        keywordCoverage,
      }),
    ]);
    docxBase64 = resumeBuffer.toString('base64');
    memoBase64 = memoBuffer.toString('base64');
  } catch (err) {
    console.error('Resume document generation failed', err);
    return res.status(500).json({ error: 'Could not generate the Word documents from your tailored resume.' });
  }

  // --- Only now consume the credit — the work succeeded ---
  await recordResumeUsage(user.id, eligibility);

  if (payload.saveHistory) {
    await supabaseAdmin.from('resume_sessions').insert({
      user_id: user.id,
      track: payload.track,
      target_role: payload.targetRole || null,
      target_company: payload.targetCompany || null,
      change_summary: tailored.change_summary || null,
    });
  }

  const baseName = buildBaseFileName(tailored.candidate_name, payload.targetRole);

  return res.status(200).json({
    tailored,
    docxBase64,
    fileName: baseName + '_Resume.docx',
    memoBase64,
    memoFileName: baseName + '_Changes_Explained.docx',
    usedOcr,
    keywordCoverage,
    creditSource: eligibility.source, // 'free' | 'paid' — lets the frontend show "1 free tailoring left" accurately
    freeRemaining: eligibility.source === 'free' ? eligibility.freeRemaining - 1 : null,
    sessionsRemaining: eligibility.source === 'paid' ? eligibility.monthlyLimit - (eligibility.sessionsUsed + 1) : null,
  });
}

function buildBaseFileName(name, role) {
  const safeName = (name || 'Resume').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const safeRole = (role || 'Tailored').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `${safeName}_${safeRole}`;
}
