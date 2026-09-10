import { Document, Packer, Paragraph, TextRun } from 'docx';

// Same reasoning as the resume generator: plain, professional
// formatting. A cover letter doesn't face the same ATS-parsing
// concerns a resume does, but there's no upside to decorating it
// either — a clean, quiet letter reads as more serious, not less.

const FONT = 'Calibri';

function run(text, opts = {}) {
  return new TextRun(Object.assign({ text, size: 22, font: FONT }, opts));
}
function para(children, opts = {}) {
  return new Paragraph(Object.assign({ spacing: { after: 200 } }, opts, {
    children: Array.isArray(children) ? children : [children],
  }));
}

export async function generateCoverLetterDocx(letter) {
  const children = [];

  children.push(
    para(run(letter.candidate_name || 'Your Name', { bold: true, size: 24 }), { spacing: { after: 40 } })
  );
  if (letter.contact_line) {
    children.push(para(run(letter.contact_line, { size: 20, color: '333333' }), { spacing: { after: 40 } }));
  }
  if (letter.date) {
    children.push(para(run(letter.date, { size: 20, color: '333333' }), { spacing: { after: 240 } }));
  }

  children.push(para(run(letter.greeting || 'Dear Hiring Team,'), { spacing: { after: 200 } }));

  (letter.paragraphs || []).forEach((p) => {
    if (p) children.push(para(run(p)));
  });

  children.push(para(run(letter.closing || 'Sincerely,'), { spacing: { before: 100, after: 260 } }));
  children.push(para(run(letter.candidate_name || 'Your Name', { bold: true })));

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1000, bottom: 1000, left: 1200, right: 1200 },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
