// The approved document is the reviewed segments joined into paragraphs.
// A pause of two seconds or more in the dictation starts a new paragraph:
// doctors pause between the parts of a protocol.

export type DocSegment = { start: number; end: number; text: string };

const PARAGRAPH_PAUSE_SECONDS = 2;

export function buildParagraphs(segments: DocSegment[]): string[] {
  const sorted = [...segments].sort((a, b) => a.start - b.start);
  const paragraphs: string[] = [];
  let current: string[] = [];
  let lastEnd: number | null = null;

  for (const seg of sorted) {
    const text = seg.text.trim();
    if (!text) continue;
    if (lastEnd != null && seg.start - lastEnd >= PARAGRAPH_PAUSE_SECONDS && current.length) {
      paragraphs.push(current.join(" "));
      current = [];
    }
    current.push(text);
    lastEnd = seg.end;
  }
  if (current.length) paragraphs.push(current.join(" "));
  return paragraphs;
}

export function buildDocumentText(segments: DocSegment[]): string {
  return buildParagraphs(segments).join("\n\n");
}
