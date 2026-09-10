const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 3000;

// Fallback path for scanned/image-only PDFs, where pdf-parse's text
// layer comes back empty or near-empty — common for resumes that
// only ever existed as an old scan. Rather than rendering pages to
// images ourselves (which on a serverless function means dragging in
// native binaries like poppler/ghostscript — fragile, and a real
// source of "works locally, breaks on Vercel" bugs), we send the PDF
// straight to Claude as a document input. Claude's document
// understanding reads the rendered page the same way a person would
// when there's no embedded text layer to parse, so this reuses that
// instead of reinventing it.
export async function extractPdfTextViaVision(fileBase64) {
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
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 },
            },
            {
              type: 'text',
              text: 'Transcribe every word of readable text from this resume, in the same order it appears on the page(s). Plain text only — no commentary, no markdown formatting, no summarizing, no added structure beyond what\'s on the page. If a section is genuinely illegible, write [illegible] in its place rather than guessing at the content.',
            },
          ],
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
  if (!textBlock) throw new Error('No text returned from document OCR');
  return textBlock.text.trim();
}
