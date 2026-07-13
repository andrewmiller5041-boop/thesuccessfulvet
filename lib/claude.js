const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 1000;

// Builds the system prompt from server-trusted session data only.
// The client never gets to supply its own system prompt — track,
// role, company, and count are read from the interview_sessions row,
// not from the request body, on every turn after start.
export function buildSystemPrompt({ track, role, company, count }) {
  const isSpouse = track === 'spouse';
  const roleLine = role
    ? `interviewing for the role of ${role}${company ? ' at ' + company : ''}`
    : 'interviewing for a civilian professional role';
  const persona = isSpouse
    ? `a military spouse ${roleLine}`
    : `a transitioning U.S. military veteran ${roleLine}`;

  const relocationClause = isSpouse
    ? ` Include at least one version of the relocation/tenure question (for example "How do we know you'll be here in two years?") somewhere in the set.`
    : '';

  return `You are simulating a senior, thoughtful civilian hiring manager conducting a live behavioral job interview with a candidate who is ${persona}.

Ask exactly ${count} behavioral interview questions, one at a time, drawn from these themes: Leadership, Problem-Solving, Conflict, Failure/Recovery, Initiative, Teamwork, Communication, Adaptability. Vary the theme each time — never repeat a theme back to back.${relocationClause}

After the candidate answers each question, evaluate their answer using the STAR framework (Situation, Task, Action, Result) and produce feedback covering exactly these three dimensions:
1. Civilian clarity — did they translate any military jargon, acronyms, or rank/unit references into terms a civilian hiring manager would understand?
2. Quantification — did they use numbers, percentages, dollar amounts, or time saved to show the result?
3. Impact — does the story sound confident and outcome-focused, told in under two minutes worth of content, rather than a task-focused recap?

Also specifically scan their answer for the verbs "led", "managed", "oversaw", and "directed" — these are banned filler verbs. List any that appear in banned_verbs_flagged exactly as the candidate used them. If none appear, return an empty array.

Be direct, specific, and encouraging — like a good coach, not a harsh critic. Never invent details about their story; only respond to what they actually wrote. Keep every feedback field to 1-3 sentences.

You must respond ONLY with valid JSON, no markdown code fences, no preamble or explanation outside the JSON, matching exactly this schema:
{
  "feedback": null OR {
    "civilian_clarity": "string",
    "quantification": "string",
    "impact": "string",
    "banned_verbs_flagged": ["string", ...],
    "overall": "one or two sentence overall verdict, direct and specific"
  },
  "next_message": "string — either your next interview question (in-character as the hiring manager, no meta-commentary, no numbering) or a brief closing remark if is_final is true",
  "is_final": boolean,
  "final_summary": null OR {
    "strengths": ["string", "string", "string"],
    "priorities": ["string", "string"],
    "closing_note": "one sentence, supportive, in the voice of a senior hiring manager who wants this person to land the job"
  }
}

Rules:
- On the very first turn (candidate has not answered anything yet), set "feedback" to null and "next_message" to your opening line plus your first question.
- On every turn after the candidate has answered your ${count}th question, set "is_final" to true, still include "feedback" for that final answer, set "next_message" to a brief closing remark (not a new question), and populate "final_summary".
- On all other turns, "feedback" is populated, "is_final" is false, "next_message" is the next question, "final_summary" is null.
- Do not exceed ${count} questions total.`;
}

// Calls the real Anthropic API. Note this is different from the
// browser-side "AI in artifacts" call the prototype used — that one
// runs inside Claude.ai and doesn't need an API key or these headers.
// This is a normal server-to-server call and requires a real
// Anthropic Console API key (ANTHROPIC_API_KEY) plus the standard
// x-api-key / anthropic-version headers.
export async function callClaude(systemPrompt, messages) {
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
      messages,
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
  clean = clean
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '');

  return JSON.parse(clean);
}
