import {
  Document, Packer, Paragraph, TextRun, AlignmentType, ShadingType,
  Table, TableRow, TableCell, WidthType, LevelFormat,
} from 'docx';

// Unlike generateResumeDocx.js, this document is never submitted to
// an employer or an ATS — it's a reference document for the
// candidate to read before they send the actual resume out. That
// means the ATS constraints (no tables, no color, no brand fonts)
// don't apply here, so this uses the site's normal navy/gold system
// and a real before/after table, which is far more readable than
// what the plain resume format would allow.

const NAVY = '1F3A5F';
const GOLD = 'C8A24B';
const INK = '14212F';
const GOOD = '5E8C61';
const WARN = 'B5652E';
const LIGHT = 'F1EDE0';

function mono(text, opts = {}) {
  return new TextRun(Object.assign({ text, font: 'Consolas', size: 18, color: '5A5A5A' }, opts));
}
function body(text, opts = {}) {
  return new TextRun(Object.assign({ text, size: 21, color: INK }, opts));
}
function h1(text) {
  return new Paragraph({ spacing: { before: 320, after: 120 }, children: [new TextRun({ text, bold: true, color: NAVY, size: 26 })] });
}
function bullet(text) {
  return new Paragraph({ numbering: { reference: 'memo-bullets', level: 0 }, spacing: { after: 70 }, children: [body(text)] });
}
function cell(children, opts = {}) {
  return new TableCell({
    width: { size: opts.width || 4500, type: WidthType.DXA },
    shading: opts.shade ? { type: ShadingType.CLEAR, fill: opts.shade } : undefined,
    margins: { top: 90, bottom: 90, left: 110, right: 110 },
    children: Array.isArray(children) ? children : [children],
  });
}

function diffTable(rows) {
  return new Table({
    width: { size: 9350, type: WidthType.DXA },
    columnWidths: [4600, 4750],
    rows: [
      new TableRow({
        children: [
          cell([new Paragraph({ children: [new TextRun({ text: 'BEFORE', bold: true, size: 17, color: 'FFFFFF', font: 'Consolas' })] })], { width: 4600, shade: '9A9A9A' }),
          cell([new Paragraph({ children: [new TextRun({ text: 'AFTER', bold: true, size: 17, color: 'FFFFFF', font: 'Consolas' })] })], { width: 4750, shade: NAVY }),
        ],
      }),
      ...rows.map((r) => new TableRow({
        children: [
          cell([new Paragraph({ children: [new TextRun({ text: r.before, italics: true, size: 19, color: '6A6A6A' })] })], { width: 4600 }),
          cell([new Paragraph({ children: [new TextRun({ text: r.after, size: 20, color: INK })] })], { width: 4750, shade: LIGHT }),
        ],
      })),
    ],
  });
}

export async function generateChangeMemoDocx(tailored, meta) {
  const { targetRole, targetCompany, track, keywordCoverage } = meta || {};
  const changes = (tailored.change_summary && tailored.change_summary.key_changes) || [];
  const matched = (keywordCoverage && keywordCoverage.matched) || [];
  const missing = (keywordCoverage && keywordCoverage.missing) || [];

  const children = [];

  children.push(
    new Paragraph({ children: [new TextRun({ text: 'THE SUCCESSFUL VET', bold: true, color: GOLD, size: 18, font: 'Consolas' })] }),
    new Paragraph({
      spacing: { after: 60 },
      children: [new TextRun({ text: 'What We Changed \u2014 ' + (tailored.candidate_name || 'Your Resume'), bold: true, color: NAVY, size: 34 })],
    }),
    new Paragraph({
      spacing: { after: 260 },
      children: [new TextRun({
        text: (targetRole ? 'Tailored for ' + targetRole + (targetCompany ? ' at ' + targetCompany : '') : 'Tailored resume') + (track === 'spouse' ? ' \u2014 Military Spouse track' : ' \u2014 Veteran track'),
        italics: true, color: '5A5A5A', size: 20,
      })],
    })
  );

  // Key changes
  children.push(h1('Key Changes'));
  if (changes.length) {
    changes.forEach((c) => children.push(bullet(c)));
  } else {
    children.push(new Paragraph({ children: [body('Rewritten for civilian clarity and quantified impact throughout.')] }));
  }

  // Keyword coverage, if a job description was provided
  if (matched.length || missing.length) {
    children.push(h1('Job Description Keyword Coverage'));
    children.push(new Paragraph({
      spacing: { after: 120 },
      children: [new TextRun({ text: 'ATS systems scan for exact phrases from the job posting. Here\u2019s what made it into your tailored resume, and what you might still add if it\u2019s true to your background.', size: 19, italics: true, color: '5A5A5A' })],
    }));
    if (matched.length) {
      children.push(new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: 'In your resume:', bold: true, color: GOOD, size: 20 })] }));
      matched.forEach((k) => children.push(bullet(k)));
    }
    if (missing.length) {
      children.push(new Paragraph({ spacing: { before: 120, after: 60 }, children: [new TextRun({ text: 'Consider adding, if true to your background:', bold: true, color: WARN, size: 20 })] }));
      missing.forEach((k) => children.push(bullet(k)));
    }
  }

  // Professional summary before/after
  children.push(h1('Professional Summary'));
  children.push(diffTable([
    {
      before: tailored.original_summary || '(You didn\u2019t have a professional summary before \u2014 this is new.)',
      after: tailored.professional_summary || '',
    },
  ]));

  // Experience, role by role
  (tailored.experience || []).forEach((role) => {
    if (!role || !Array.isArray(role.bullets) || !role.bullets.length) return;

    children.push(new Paragraph({
      spacing: { before: 260, after: 100 },
      children: [new TextRun({ text: (role.title || 'Role').toUpperCase() + (role.org_line ? '  \u2014  ' + role.org_line : ''), bold: true, color: NAVY, size: 21 })],
    }));

    const rows = role.bullets.map((b) => {
      const tailoredText = typeof b === 'string' ? b : (b && b.tailored) || '';
      const originalText = typeof b === 'string' ? null : (b && b.original) || null;
      return {
        before: originalText || '(Combined from a few different lines in your original resume.)',
        after: tailoredText,
      };
    }).filter((r) => r.after);

    if (rows.length) children.push(diffTable(rows));
  });

  // Still needs your input, if anything was left unfilled
  if (Array.isArray(tailored.needs_your_input) && tailored.needs_your_input.length) {
    children.push(h1('Worth Double-Checking'));
    children.push(new Paragraph({
      spacing: { after: 100 },
      children: [body('A few spots didn\u2019t have a real number in your original resume. Make sure you filled these in with your own figures before sending this out \u2014 we never invent a statistic that wasn\u2019t already in your resume.')],
    }));
  }

  const doc = new Document({
    numbering: {
      config: [
        { reference: 'memo-bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '\u2022', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 260 } } } }] },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
