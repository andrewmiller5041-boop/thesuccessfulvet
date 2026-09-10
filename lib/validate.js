const ALLOWED_COUNTS = [5, 6, 8];
const ALLOWED_TRACKS = ['veteran', 'spouse'];

export function sanitizeString(value, maxLen) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

// Used on /api/interview/start — the only place a client can specify
// interview parameters. Every value is coerced to a safe default
// rather than rejected outright, so a malformed request degrades
// gracefully instead of erroring.
export function validateStartPayload(body) {
  const track = ALLOWED_TRACKS.includes(body?.track) ? body.track : 'veteran';
  const role = sanitizeString(body?.role || '', 100);
  const company = sanitizeString(body?.company || '', 100);
  const count = ALLOWED_COUNTS.includes(body?.count) ? body.count : 6;
  const saveTranscript = body?.saveTranscript === true;
  return { track, role, company, count, saveTranscript };
}

// Used on /api/interview/turn. Caps answer length generously (2000
// chars is well beyond a two-minute spoken STAR answer transcribed)
// to prevent someone from pasting in huge blocks of text to run up
// token costs.
export function validateAnswerText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 2000);
}

// Used on /api/resume/tailor. File bytes are capped generously (8MB
// base64-encoded, comfortably covering any real resume) — actual
// enforcement of that cap happens in the API route via the request
// body size limit, this just validates everything else.
export function validateResumePayload(body) {
  const track = ALLOWED_TRACKS.includes(body?.track) ? body.track : 'veteran';
  const targetRole = sanitizeString(body?.targetRole || '', 100);
  const targetCompany = sanitizeString(body?.targetCompany || '', 100);
  const jobDescription = sanitizeString(body?.jobDescription || '', 6000);
  const mosCode = sanitizeString(body?.mosCode || '', 20);
  const saveHistory = body?.saveHistory === true;

  const fileBase64 = typeof body?.fileBase64 === 'string' ? body.fileBase64 : null;
  const mimeType = typeof body?.mimeType === 'string' ? body.mimeType : null;
  const allowedMimeTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];

  if (!fileBase64) {
    return { error: 'No resume file was uploaded.' };
  }
  if (!mimeType || !allowedMimeTypes.includes(mimeType)) {
    return { error: 'Upload your resume as a .docx or .pdf file.' };
  }
  // Rough size check on the base64 string itself (base64 is ~1.37x
  // the original byte size) — keeps obviously oversized uploads from
  // reaching the parser at all.
  if (fileBase64.length > 7_000_000) {
    return { error: 'That file is too large. Try a resume under 5MB.' };
  }

  return { track, targetRole, targetCompany, jobDescription, mosCode, saveHistory, fileBase64, mimeType };
}

// Used on /api/resume/generate-docx. The client sends back the same
// "tailored" object it received from /api/resume/tailor, possibly
// with edits from the review step. This isn't re-validating facts
// (that ship sailed — a human edited it) — it's guarding against
// malformed or oversized input reaching the docx generator, since
// this endpoint doesn't go through the Claude call that would
// otherwise naturally bound the output size.
const MAX_EXPERIENCE_ROLES = 12;
const MAX_BULLETS_PER_ROLE = 10;
const MAX_BULLET_LENGTH = 400;
const MAX_ORIGINAL_BULLET_LENGTH = 600; // source-quoted text can run longer than a tightened bullet
const MAX_SUMMARY_LENGTH = 800;
const MAX_EDUCATION_ENTRIES = 10;
const MAX_CERTIFICATIONS = 25;
const MAX_SKILL_CATEGORIES = 6;
const MAX_SKILL_ITEMS = 20;

// A bullet may arrive as the current object shape ({tailored, original})
// or, defensively, as a plain string — normalize either into the
// object shape so downstream code (docx generation, the review UI)
// only ever has one shape to deal with.
function sanitizeBullet(b) {
  if (typeof b === 'string') {
    return { tailored: sanitizeString(b, MAX_BULLET_LENGTH), original: null };
  }
  if (b && typeof b === 'object') {
    return {
      tailored: sanitizeString(b.tailored || '', MAX_BULLET_LENGTH),
      original: b.original ? sanitizeString(b.original, MAX_ORIGINAL_BULLET_LENGTH) : null,
    };
  }
  return null;
}

export function validateTailoredPayload(body) {
  const t = body?.tailored;
  if (!t || typeof t !== 'object') {
    return { error: 'No tailored resume content was provided.' };
  }

  const track = ALLOWED_TRACKS.includes(body?.track) ? body.track : 'veteran';

  const clean = {
    candidate_name: sanitizeString(t.candidate_name || '', 120),
    contact_line: sanitizeString(t.contact_line || '', 200),
    professional_summary: sanitizeString(t.professional_summary || '', MAX_SUMMARY_LENGTH),
    original_summary: t.original_summary ? sanitizeString(t.original_summary, MAX_SUMMARY_LENGTH) : null,
    security_clearance: t.security_clearance ? sanitizeString(t.security_clearance, 100) : null,
    additional_section: null,
    experience: [],
    education: [],
    certifications: [],
    skills: [],
  };

  if (t.additional_section && typeof t.additional_section === 'object' && Array.isArray(t.additional_section.items)) {
    const items = t.additional_section.items.slice(0, 15).map((i) => sanitizeString(i || '', 300)).filter(Boolean);
    if (items.length) {
      clean.additional_section = {
        title: sanitizeString(t.additional_section.title || 'Additional Information', 60),
        items,
      };
    }
  }

  if (Array.isArray(t.experience)) {
    clean.experience = t.experience.slice(0, MAX_EXPERIENCE_ROLES).map((role) => ({
      title: sanitizeString(role?.title || '', 150),
      org_line: sanitizeString(role?.org_line || '', 200),
      bullets: Array.isArray(role?.bullets)
        ? role.bullets.slice(0, MAX_BULLETS_PER_ROLE).map(sanitizeBullet).filter((b) => b && b.tailored)
        : [],
    }));
  }

  if (Array.isArray(t.education)) {
    clean.education = t.education.slice(0, MAX_EDUCATION_ENTRIES).map((e) => ({
      degree: sanitizeString(e?.degree || '', 150),
      school: sanitizeString(e?.school || '', 150),
    }));
  }

  if (Array.isArray(t.certifications)) {
    clean.certifications = t.certifications.slice(0, MAX_CERTIFICATIONS).map((c) => sanitizeString(c || '', 200)).filter(Boolean);
  }

  if (Array.isArray(t.skills)) {
    clean.skills = t.skills.slice(0, MAX_SKILL_CATEGORIES).map((s) => ({
      category: sanitizeString(s?.category || '', 60),
      items: Array.isArray(s?.items)
        ? s.items.slice(0, MAX_SKILL_ITEMS).map((i) => sanitizeString(i || '', 100)).filter(Boolean)
        : [],
    }));
  }

  if (!clean.candidate_name) {
    return { error: 'Resume content is missing a candidate name.' };
  }

  return { track, tailored: clean };
}
