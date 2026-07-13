import { applyCors, handlePreflight } from '../../lib/cors.js';
import { verifyUser } from '../../lib/verifyUser.js';
import { resumeLimiter } from '../../lib/rateLimit.js';
import { checkSubscriptionEligibility, recordUsage } from '../../lib/subscriptionGate.js';
import { extractResumeText } from '../../lib/resumeParse.js';
import { buildElevatorPitchSystemPrompt, callClaudeForElevatorPitch } from '../../lib/elevatorPitchPrompt.js';
import { generateElevatorPitchDocx } from '../../lib/generateElevatorPitchDocx.js';
import { sanitizeString } from '../../lib/validate.js';

const SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

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

  const body = req.body || {};
  const track = body.track === 'spouse' ? 'spouse' : 'veteran';
  const targetRole = sanitizeString(body.targetRole || '', 100);
  const targetIndustry = sanitizeString(body.targetIndustry || '', 100);
  const fileBase64 = typeof body.fileBase64 === 'string' ? body.fileBase64 : null;
  const mimeType = typeof body.mimeType === 'string' ? body.mimeType : null;

  if (!fileBase64 || !mimeType || !SUPPORTED_MIME_TYPES.includes(mimeType)) {
    return res.status(400).json({ error: 'Upload your resume as a .docx or .pdf file.' });
  }
  if (fileBase64.length > 7_000_000) {
    return res.status(400).json({ error: 'That file is too large. Try a resume under 5MB.' });
  }

  let resumeText, usedOcr;
  try {
    const extraction = await extractResumeText(fileBase64, mimeType);
    resumeText = extraction.text;
    usedOcr = extraction.usedOcr;
  } catch (err) {
    console.error('Elevator pitch: resume text extraction failed', err);
    return res.status(400).json({ error: err.message || 'Could not read that file. Upload a .docx or .pdf resume.' });
  }
  if (!resumeText || resumeText.trim().length < 50) {
    return res.status(400).json({ error: 'Could not find readable text in that resume. Try a clearer scan or a .docx export.' });
  }

  const systemPrompt = buildElevatorPitchSystemPrompt({ track, targetRole, targetIndustry });

  let pitch;
  try {
    pitch = await callClaudeForElevatorPitch(systemPrompt, resumeText);
  } catch (err) {
    console.error('Claude elevator pitch generation failed', err);
    return res.status(502).json({ error: 'The elevator pitch service is unavailable right now. Try again shortly.' });
  }

  let docxBase64;
  try {
    const buffer = await generateElevatorPitchDocx(pitch, { targetRole, targetIndustry, track });
    docxBase64 = buffer.toString('base64');
  } catch (err) {
    console.error('Elevator pitch docx generation failed', err);
    return res.status(500).json({ error: 'Could not generate the Word document.' });
  }

  await recordUsage(user.id, eligibility.periodMonth, eligibility.sessionsUsed);

  return res.status(200).json({
    pitch,
    docxBase64,
    fileName: 'Elevator_Pitch.docx',
    usedOcr,
    sessionsRemaining: eligibility.monthlyLimit - (eligibility.sessionsUsed + 1),
  });
}
