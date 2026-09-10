import {
  Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle, LevelFormat,
} from 'docx';

// Deliberately NOT using the site's navy/gold brand system here. Their
// own ATS formatting tips are explicit: no tables, no text boxes, no
// columns, no graphics in the resume body — a real ATS parser chokes
// on decorative formatting. This generates a plain, single-column,
// black-on-white resume that happens to be well-organized, which is
// exactly what should get through both a bot and a human.

const FONT = 'Calibri';

function nameRun(text) {
  return new TextRun({ text, bold: true, size: 32, font: FONT });
}
function contactRun(text) {
  return new TextRun({ text, size: 20, font: FONT, color: '333333' });
}
function sectionHeaderParagraph(text) {
  return new Paragraph({
    spacing: { before: 240, after: 100 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: '000000' } },
    children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 22, font: FONT })],
  });
}
function bodyRun(text, opts = {}) {
  return new TextRun(Object.assign({ text, size: 21, font: FONT }, opts));
}
function bodyParagraph(children, opts = {}) {
  return new Paragraph(Object.assign({ spacing: { after: 120 } }, opts, {
    children: Array.isArray(children) ? children : [children],
  }));
}
function bulletParagraph(text) {
  return new Paragraph({
    numbering: { reference: 'resume-bullets', level: 0 },
    spacing: { after: 60 },
    children: [bodyRun(text)],
  });
}

export async function generateResumeDocx(tailored, track) {
  const children = [];

  // --- Header: name + contact line ---
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [nameRun(tailored.candidate_name || 'Your Name')],
    })
  );
  if (tailored.contact_line) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: tailored.security_clearance ? 40 : 160 },
        children: [contactRun(tailored.contact_line)],
      })
    );
  }
  if (tailored.security_clearance) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 160 },
        children: [
          bodyRun('Security Clearance: ', { bold: true, size: 20 }),
          bodyRun(tailored.security_clearance, { size: 20 }),
        ],
      })
    );
  }

  // --- Professional Summary ---
  if (tailored.professional_summary) {
    children.push(sectionHeaderParagraph('Professional Summary'));
    children.push(bodyParagraph(bodyRun(tailored.professional_summary)));
  }

  // --- Experience ---
  if (Array.isArray(tailored.experience) && tailored.experience.length) {
    children.push(sectionHeaderParagraph(track === 'spouse' ? 'Experience' : 'Experience'));
    for (const role of tailored.experience) {
      children.push(
        bodyParagraph(
          [
            bodyRun(role.title || '', { bold: true }),
            role.org_line ? bodyRun('  |  ' + role.org_line, { italics: true }) : bodyRun(''),
          ],
          { spacing: { after: 60 } }
        )
      );
      for (const bullet of role.bullets || []) {
        const text = typeof bullet === 'string' ? bullet : (bullet && bullet.tailored) || '';
        if (text) children.push(bulletParagraph(text));
      }
      children.push(new Paragraph({ spacing: { after: 100 }, children: [] }));
    }
  }

  // --- Education ---
  if (Array.isArray(tailored.education) && tailored.education.length) {
    children.push(sectionHeaderParagraph('Education'));
    for (const edu of tailored.education) {
      children.push(
        bodyParagraph([
          bodyRun(edu.degree || '', { bold: true, italics: true }),
        ], { spacing: { after: 20 } })
      );
      if (edu.school) {
        children.push(bodyParagraph(bodyRun(edu.school, { italics: true }), { spacing: { after: 100 } }));
      }
    }
  }

  // --- Certifications ---
  if (Array.isArray(tailored.certifications) && tailored.certifications.length) {
    children.push(sectionHeaderParagraph('Certifications'));
    for (const cert of tailored.certifications) {
      children.push(bulletParagraph(cert));
    }
  }

  // --- Technical Skills ---
  if (Array.isArray(tailored.skills) && tailored.skills.length) {
    children.push(sectionHeaderParagraph('Technical Skills'));
    for (const group of tailored.skills) {
      const items = (group.items || []).join(', ');
      children.push(
        bodyParagraph([
          bodyRun((group.category || '') + ':  ', { bold: true }),
          bodyRun(items),
        ])
      );
    }
  }

  // --- Additional section (conditional — volunteer work, projects, publications, etc.) ---
  if (tailored.additional_section && Array.isArray(tailored.additional_section.items) && tailored.additional_section.items.length) {
    children.push(sectionHeaderParagraph(tailored.additional_section.title || 'Additional Information'));
    for (const item of tailored.additional_section.items) {
      children.push(bulletParagraph(item));
    }
  }

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: 'resume-bullets',
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: '\u2022',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 360, hanging: 260 } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 }, // US Letter
            margin: { top: 900, bottom: 900, left: 1000, right: 1000 },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
