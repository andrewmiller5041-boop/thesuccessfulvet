import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';
import { extractPdfTextViaVision } from './pdfOcr.js';

const SUPPORTED_DOCX =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const SUPPORTED_PDF = 'application/pdf';

// A real one-page resume's text layer runs well into the hundreds of
// characters at minimum. Below this threshold, pdf-parse almost
// certainly hit a scanned/image-only page rather than a genuinely
// sparse resume — that's the signal to fall back to OCR rather than
// a fixed "empty means scanned" check, since some malformed PDFs
// return a few stray characters rather than a clean empty string.
const MIN_TEXT_LENGTH_FOR_DIRECT_EXTRACTION = 150;

// Returns { text, usedOcr }. usedOcr lets the caller tell the
// candidate "we read this from a scan, double-check it" rather than
// silently trusting OCR output the same as a clean text extraction.
export async function extractResumeText(fileBase64, mimeType) {
  if (!fileBase64 || typeof fileBase64 !== 'string') {
    throw new Error('No file provided.');
  }

  const buffer = Buffer.from(fileBase64, 'base64');

  if (mimeType === SUPPORTED_DOCX) {
    const result = await mammoth.extractRawText({ buffer });
    return { text: (result.value || '').trim(), usedOcr: false };
  }

  if (mimeType === SUPPORTED_PDF) {
    const data = await pdfParse(buffer);
    const directText = (data.text || '').trim();

    if (directText.length >= MIN_TEXT_LENGTH_FOR_DIRECT_EXTRACTION) {
      return { text: directText, usedOcr: false };
    }

    // Likely scanned — fall back to Claude reading the document directly.
    const ocrText = await extractPdfTextViaVision(fileBase64);
    return { text: ocrText, usedOcr: true };
  }

  throw new Error('Unsupported file type. Upload a resume as .docx or .pdf.');
}
