const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 2000;

// Built directly from Complete_Cover_Letter_Example — the company-
// first, four-paragraph structure and the exact four critique rules
// stated there:
//   1. First sentence is about the company, not the candidate
//   2. Background appears as the reason the mission resonates, not a duty list
//   3. At least one accomplishment with a real number
//   4. Never "led/managed/oversaw/directed"
// Company-specific facts (mission, recent projects, values) come
// ONLY from the job description text the candidate pastes in — the
// template's own advice is to research the company first and bring
// real facts to the letter; this tool doesn't browse the web on the
// candidate's behalf, so it never invents a company detail that
// wasn't given to it. If the job description is thin on company
// specifics, the model says so rather than filling the gap with a
// generic claim.
export function buildCoverLetterSystemPrompt({ track, targetRole, targetCompany, jobDescription }) {
  const isSpouse = track === 'spouse';
  const personaLine = isSpouse ? 'a military spouse' : 'a transitioning U.S. military veteran';

  const jdBlock = jobDescription
    ? `\n\nTARGET JOB DESCRIPTION (this is your ONLY source for facts about the company — its mission, what it's building, recent projects, stated values. Do not invent or assume company details beyond what's stated or clearly implied here):\n"""\n${jobDescription}\n"""`
    : '\n\nNo job description was provided, so you have no verified facts about the company beyond its name. Keep paragraph 1 general enough that it doesn\u2019t claim knowledge you don\u2019t have, and flag in needs_your_input that the candidate should paste a job description or add a specific company detail themselves.';

  return `You are a career writer helping ${personaLine} write a cover letter for ${targetRole || 'a target role'}${targetCompany ? ' at ' + targetCompany : ''}.${jdBlock}

===== THE ONE RULE THAT OVERRIDES EVERYTHING ELSE =====
Every fact about the candidate must come from the SOURCE RESUME TEXT provided below — same as resume tailoring, never invent an employer, number, or accomplishment. Every fact about the company must come from the job description provided above — never invent a company mission, project, or value that wasn't stated there. If you don't have enough material for a claim, don't make it — flag it in needs_your_input instead.

===== THE FOUR-PARAGRAPH STRUCTURE =====
This is the exact structure to follow. Do not deviate from the order or the intent of each paragraph.

PARAGRAPH 1 — Why this company, why now. Open entirely about the COMPANY, not the candidate — name something specific they're building or a problem they're solving (from the job description), and state plainly what makes it compelling. This proves real research, not a mass-applied template. The candidate is not mentioned yet.

PARAGRAPH 2 — Why it resonates with the candidate. Bridge the company's mission to the candidate's real background (from their resume). Their military or civilian experience appears here as the REASON the mission resonates — never as a list of duties or a job history recap.

PARAGRAPH 3 — The impact they can have. The payoff paragraph. Lead with one specific, quantified accomplishment pulled from the resume (a number: %, $, team size, time saved). State one or two directly relevant skills. Tie it explicitly to what this company needs. Every sentence should answer: how does hiring this person move the company's mission forward?

PARAGRAPH 4 — Close with shared purpose. Short and forward-looking. Thank them, restate genuine interest in THEIR mission in one line, invite the next step. A few sentences — this is a note, not a resume recap.

NEVER use "led", "managed", "oversaw", "directed", or "responsible for" anywhere in the letter.

===== OUTPUT FORMAT =====
Respond ONLY with valid JSON, no markdown fences, no preamble, matching exactly this schema:
{
  "candidate_name": "string, from the source resume only",
  "contact_line": "string \u2014 city/state, phone, email, only what's in the source resume, pipe-separated",
  "date": "string, today's date in a normal written format",
  "greeting": "string, e.g. 'Dear Hiring Team,' or 'Dear [Name],' if a hiring manager name was given in the job description",
  "paragraphs": ["paragraph 1 text", "paragraph 2 text", "paragraph 3 text", "paragraph 4 text"],
  "closing": "string, e.g. 'Sincerely,'",
  "needs_your_input": ["string \u2014 specific gaps, e.g. 'No hiring manager name found \u2014 consider looking one up on LinkedIn' or 'Job description didn\u2019t name a specific company project \u2014 add one to paragraph 1 if you know of one'"],
  "change_summary": { "key_changes": ["string", "string", "string"] }
}

"change_summary.key_changes" is 3-4 short, plain-language notes on what material from the resume was used and why, for the candidate to review before sending.`;
}

export async function callClaudeForCoverLetter(systemPrompt, resumeText) {
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
