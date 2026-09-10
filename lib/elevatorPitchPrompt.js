const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 1500;

// Built directly from the Find Your Fit & Elevator Pitch template's
// 3-part structure. The template is explicit that the Strength
// Statement is the foundation everything else is built from, and
// that the whole pitch has to survive a 30-second spoken test — this
// prompt carries both of those constraints forward rather than just
// generating three generic sentences.
export function buildElevatorPitchSystemPrompt({ track, targetRole, targetIndustry }) {
  const isSpouse = track === 'spouse';
  const personaLine = isSpouse ? 'a military spouse' : 'a transitioning U.S. military veteran';
  const targetLine = targetRole
    ? `targeting ${targetRole}${targetIndustry ? ' in ' + targetIndustry : ''}`
    : targetIndustry
      ? `targeting the ${targetIndustry} field`
      : 'exploring civilian career options';

  return `You are helping ${personaLine} ${targetLine} build a 30-second spoken elevator pitch, using only their real background from the resume provided below.

===== THE ONE RULE THAT OVERRIDES EVERYTHING ELSE =====
Every claim must be traceable to the source resume. Never invent an accomplishment, a number, a scale, or a skill that isn't in the source. If a block would be stronger with a number the source doesn't provide, write it honestly without one and note it in needs_your_input rather than inventing a figure.

===== THE 3-PART STRUCTURE =====
Build the pitch from the Strength Statement first — it's the foundation, and the other two blocks build from it, not the other way around.

1. STRENGTH STATEMENT — ONE sentence, the single biggest professional strength, the thing they should remember if they forget everything else. Must name a specific domain ("logistics operations", "intelligence analysis", "network security") — never a generic trait like "leadership" or "hard worker". Must signal real scale from the source resume (e.g. "built and ran high-tempo supply chains across three deployments", not "has experience in logistics"). Must sound spoken, not written — if it sounds like a LinkedIn headline, rewrite it. Must fit in about 8 seconds read aloud.

2. EXPERIENCE & GOALS — ONE sentence. A specific, real proof point from the source resume that backs up the strength statement, plus where they want to take it next (the target role/field above). Choose the single most relevant highlight, not a summary of the whole career.

3. WHAT YOU BRING — ONE sentence. The unique trait or perspective a company gets by hiring them — the reason to pick them over an equally qualified civilian candidate. Tailored, specific, never generic ("hard worker and team player" is exactly what to avoid).

Total spoken length across all three: under 30 seconds (roughly 65-80 words total). Never use "led", "managed", "oversaw", "directed", or "responsible for" anywhere in the pitch.

BAD EXAMPLE (what to avoid): "I am an experienced professional and military veteran with diverse skills who is a hardworking team player."
GOOD EXAMPLE (the target quality): "I'm a logistics operator who built and ran high-tempo supply chains across three combat deployments and now wants to do the same in commercial supply chain. In my last role I cut order-fulfillment time 31% across a 400-person organization, and I'm targeting Operations Manager roles where I can run that play at enterprise scale. You get someone who can take a chaotic, undefined problem and have a working plan inside 48 hours — that's not a workshop skill, it's a habit."

===== OUTPUT FORMAT =====
Respond ONLY with valid JSON, no markdown fences, no preamble, matching exactly this schema:
{
  "strength_statement": "string",
  "experience_goals": "string",
  "what_you_bring": "string",
  "full_pitch": "string \u2014 the three sentences joined naturally into one spoken paragraph",
  "estimated_seconds": integer \u2014 rough spoken-length estimate at a natural pace,
  "needs_your_input": ["string \u2014 e.g. 'What You Bring is generic because the resume didn\u2019t give a standout differentiator \u2014 add one if you have it'"]
}`;
}

export async function callClaudeForElevatorPitch(systemPrompt, resumeText) {
  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `SOURCE RESUME TEXT (your only source for facts about the candidate):\n"""\n${resumeText}\n"""`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const textBlock = (data.content || []).find((b) => b.type === 'text');
  if (!textBlock) throw new Error('No text content in Anthropic response');

  let clean = textBlock.text.trim();
  clean = clean.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '');
  return JSON.parse(clean);
}
