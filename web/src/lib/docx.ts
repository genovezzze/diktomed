import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { formatClock, formatDateTimeLV } from "@/lib/format";

export type DocxInput = {
  title: string;
  originalName: string;
  durationSec: number | null;
  createdAt: Date;
  paragraphs: string[];
  approval: { name: string; at: Date } | null;
};

const FONT = "Calibri";

function meta(label: string, value: string): Paragraph {
  return new Paragraph({
    spacing: { after: 40 },
    children: [
      new TextRun({ text: `${label}: `, bold: true, font: FONT, size: 20, color: "555555" }),
      new TextRun({ text: value, font: FONT, size: 20, color: "555555" }),
    ],
  });
}

/** The approved (or draft) dictation as a Word document. */
export async function buildDocx(input: DocxInput): Promise<Buffer> {
  const header: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 120 },
      children: [new TextRun({ text: input.title, font: FONT, size: 32, bold: true })],
    }),
  ];

  if (!input.approval) {
    header.push(
      new Paragraph({
        spacing: { after: 160 },
        children: [
          new TextRun({
            text: "MELNRAKSTS - nav pārbaudīts un apstiprināts",
            font: FONT,
            size: 22,
            bold: true,
            color: "C93400",
          }),
        ],
      }),
    );
  }

  header.push(
    meta("Diktāts", input.originalName),
    meta("Ilgums", formatClock(input.durationSec)),
    meta("Augšupielādēts", formatDateTimeLV(input.createdAt)),
  );
  if (input.approval) {
    header.push(meta("Apstiprināja", `${input.approval.name}, ${formatDateTimeLV(input.approval.at)}`));
  }
  header.push(new Paragraph({ spacing: { after: 200 }, children: [] }));

  const body = input.paragraphs.map(
    (text) =>
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        spacing: { after: 160, line: 300 },
        children: [new TextRun({ text, font: FONT, size: 24 })],
      }),
  );

  const footer = new Paragraph({
    spacing: { before: 400 },
    children: [
      new TextRun({
        text: input.approval
          ? "Melnrakstu sagatavoja DiktoMed; tekstu pārbaudīja un apstiprināja cilvēks."
          : "Melnrakstu sagatavoja DiktoMed. Pirms lietošanas teksts jāpārbauda un jāapstiprina.",
        font: FONT,
        size: 18,
        italics: true,
        color: "888888",
      }),
    ],
  });

  const doc = new Document({
    creator: "DiktoMed",
    title: input.title,
    sections: [{ children: [...header, ...body, footer] }],
  });
  return Packer.toBuffer(doc);
}

export type ProtocolDocxInput = {
  recordingTitle: string;
  plannedSide: string | null;
  durationSec: number | null;
  createdAt: Date;
  engine: string | null;
  fields: { title: string; value: string | null }[];
  approval: { name: string; at: Date } | null;
};

/** The structured protocol: one heading per section, empty sections marked. */
export async function buildProtocolDocx(input: ProtocolDocxInput): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 120 },
      children: [new TextRun({ text: "Operācijas protokols", font: FONT, size: 32, bold: true })],
    }),
  ];
  if (!input.approval) {
    children.push(
      new Paragraph({
        spacing: { after: 160 },
        children: [new TextRun({ text: "MELNRAKSTS - nav apstiprināts", font: FONT, size: 22, bold: true, color: "C93400" })],
      }),
    );
  }
  children.push(meta("Diktāts", input.recordingTitle), meta("Ilgums", formatClock(input.durationSec)), meta("Datums", formatDateTimeLV(input.createdAt)));
  if (input.plannedSide) children.push(meta("Plānotā puse", input.plannedSide));
  if (input.approval) children.push(meta("Apstiprināja", `${input.approval.name}, ${formatDateTimeLV(input.approval.at)}`));
  children.push(new Paragraph({ spacing: { after: 120 }, children: [] }));

  for (const field of input.fields) {
    children.push(
      new Paragraph({
        spacing: { before: 160, after: 60 },
        children: [new TextRun({ text: field.title, font: FONT, size: 24, bold: true })],
      }),
      new Paragraph({
        spacing: { after: 80, line: 300 },
        children: [
          field.value
            ? new TextRun({ text: field.value, font: FONT, size: 24 })
            : new TextRun({ text: "Nav minēts", font: FONT, size: 22, italics: true, color: "888888" }),
        ],
      }),
    );
  }

  children.push(
    new Paragraph({
      spacing: { before: 400 },
      children: [
        new TextRun({
          text: `Sadaļas sagatavoja DiktoMed (${input.engine ?? "-"}) no apstiprinātā diktāta teksta; katrs lauks pārbaudīts pret tekstu${
            input.approval ? ", protokolu apstiprināja cilvēks." : ". Pirms lietošanas protokols jāapstiprina."
          }`,
          font: FONT,
          size: 18,
          italics: true,
          color: "888888",
        }),
      ],
    }),
  );

  const doc = new Document({ creator: "DiktoMed", title: "Operācijas protokols", sections: [{ children }] });
  return Packer.toBuffer(doc);
}
