// Design choice worth being explicit about: Claude identifies WHICH
// terms in the job description are worth tracking (that's a judgment
// call — "Senior", "responsibilities", and "team" aren't useful
// signals, "SAP", "Lean Six Sigma", "PMP" are). But whether each of
// those terms actually made it into the tailored resume is checked
// here with a plain substring match, not asked of the model. An LLM
// grading its own homework on "did I include X" is a weaker signal
// than a deterministic string search — this keeps the one claim that
// really matters (matched vs missing) verifiable rather than another
// generated opinion.

const MAX_KEYWORDS = 20;
const MAX_KEYWORD_LENGTH = 60;

function normalize(str) {
  return (str || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function flattenTailoredText(tailored) {
  const parts = [];
  if (tailored.professional_summary) parts.push(tailored.professional_summary);

  (tailored.experience || []).forEach((role) => {
    (role.bullets || []).forEach((b) => {
      const text = typeof b === 'string' ? b : (b && b.tailored) || '';
      if (text) parts.push(text);
    });
  });

  (tailored.skills || []).forEach((group) => {
    if (group.category) parts.push(group.category);
    (group.items || []).forEach((item) => parts.push(item));
  });

  (tailored.certifications || []).forEach((c) => parts.push(c));

  if (tailored.additional_section && Array.isArray(tailored.additional_section.items)) {
    tailored.additional_section.items.forEach((i) => parts.push(i));
  }

  return normalize(parts.join(' \n '));
}

// jdKeywords: array of strings the model flagged as ATS-relevant
// terms from the job description. tailored: the tailored resume
// object (same shape used for docx generation).
export function computeKeywordCoverage(jdKeywords, tailored) {
  if (!Array.isArray(jdKeywords) || !jdKeywords.length || !tailored) {
    return { matched: [], missing: [] };
  }

  const haystack = flattenTailoredText(tailored);
  const matched = [];
  const missing = [];
  const seen = new Set();

  for (const raw of jdKeywords.slice(0, MAX_KEYWORDS)) {
    const kw = typeof raw === 'string' ? raw.trim().slice(0, MAX_KEYWORD_LENGTH) : '';
    if (!kw) continue;
    const key = normalize(kw);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    if (haystack.includes(key)) {
      matched.push(kw);
    } else {
      missing.push(kw);
    }
  }

  return { matched, missing };
}
