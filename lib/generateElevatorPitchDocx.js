import { Document, Packer, Paragraph, TextRun, AlignmentType, ShadingType, LevelFormat } from 'docx';

const NAVY = '1F3A5F';
const GOLD = 'C8A24B';
const INK = '14212F';
const LIGHT = 'F1EDE0';

function h1(text) {
  return new Paragraph({ spacing: { before: 280, after: 100 }, children: [new TextRun({ text, bold: true, color: NAVY, size: 24 })] });
}
function body(text, opts = {}) {
  return new Paragraph({ spacing: { after: 140 }, children: [new TextRun(Object.assign({ text, size: 22, color: INK }, opts))] });
}
function block(label, text) {
  return new Paragraph({
    shading: { type: ShadingType.CLEAR, fill: LIGHT },
    spacing: { after: 140 },
    indent: { left: 180, right: 180 },
    children: [
      new TextRun({ text: label.toUpperCase() + '\n', bold: true, color: GOLD, size: 17, font: 'Consolas' }),
      new TextRun({ text, size: 22, color: INK, break: 1 }),
    ],
  });
}
function bullet(text) {
  return new Paragraph({ numbering: { reference: 'pitch-bullets', level: 0 }, spacing: { after: 60 }, children: [new TextRun({ text, size: 20, color: INK })] });
}

export async function generateElevatorPitchDocx(pitch, meta) {
  const { targetRole, targetIndustry, track } = meta || {};
  const needsInput = pitch.needs_your_input || [];

  const children = [
    new Paragraph({ children: [new TextRun({ text: 'THE SUCCESSFUL VET', bold: true, color: GOLD, size: 18, font: 'Consolas' })] }),
    new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: 'Your Elevator Pitch', bold: true, color: NAVY, size: 34 })] }),
    new Paragraph({
      spacing: { after: 260 },
      children: [new TextRun({
        text: (targetRole ? 'Built for ' + targetRole + (targetIndustry ? ' in ' + targetIndustry : '') : 'General purpose') + (track === 'spouse' ? ' \u2014 Military Spouse track' : ' \u2014 Veteran track') + ` \u2014 ~${pitch.estimated_seconds || 30} seconds spoken`,
        italics: true, color: '5A5A5A', size: 20,
      })],
    }),

    h1('The Full Pitch'),
    body(pitch.full_pitch || '', { italics: true }),

    h1('The Three Blocks'),
    block('1. Strength Statement', pitch.strength_statement || ''),
    block('2. Experience & Goals', pitch.experience_goals || ''),
    block('3. What You Bring', pitch.what_you_bring || ''),
  ];

  if (needsInput.length) {
    children.push(h1('Worth Strengthening'));
    needsInput.forEach((n) => children.push(bullet(n)));
  }

  children.push(
    h1('Practice Protocol'),
    bullet('Record yourself delivering it on your phone. Listen back once. Cut anything that sounds rehearsed.'),
    bullet('Deliver it cold to three people this week \u2014 a networking event, a veteran group meetup, a coffee with a contact.'),
    bullet('Expect some blank stares early. Every delivery is data \u2014 adjust and re-deliver. Most people\u2019s fifth version is twice as strong as their first.')
  );

  const doc = new Document({
    numbering: {
      config: [{ reference: 'pitch-bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '\u2022', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 260 } } } }] }],
    },
    sections: [
      {
        properties: {
          page: { size: { width: 12240, height: 15840 }, margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
