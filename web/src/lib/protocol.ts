import type { FieldCheck, FieldStatus, ProtocolStatus } from "@prisma/client";

export const PROTOCOL_STATUS_LABELS: Record<ProtocolStatus, string> = {
  QUEUED: "Rindā",
  PROCESSING: "Sagatavo",
  READY: "Gaida pārbaudi",
  APPROVED: "Apstiprināts",
  FAILED: "Kļūda",
};

export const PROTOCOL_STATUS_BADGE: Record<ProtocolStatus, "default" | "success" | "warning" | "destructive" | "muted"> = {
  QUEUED: "muted",
  PROCESSING: "default",
  READY: "warning",
  APPROVED: "success",
  FAILED: "destructive",
};

export const FIELD_CHECK_LABELS: Record<FieldCheck, string> = {
  OK: "Atbilst tekstam",
  EMPTY: "Nav diktātā",
  NO_QUOTE: "Nav avota",
  QUOTE_NOT_FOUND: "Citāts nav tekstā",
  NUMBER_MISMATCH: "Skaitlis neatbilst",
  SIDE_MISMATCH: "Puse neatbilst",
};

export const FIELD_STATUS_LABELS: Record<FieldStatus, string> = {
  SUGGESTED: "Ieteikums",
  ACCEPTED: "Pieņemts",
  EDITED: "Labots",
  REJECTED: "Noraidīts",
};

/** A check that a person must look at before accepting. */
export function isWarning(check: FieldCheck): boolean {
  return check !== "OK" && check !== "EMPTY";
}

/** Fields still waiting for a person: a value nobody has accepted, edited or rejected. */
export function pendingFields<T extends { value: string | null; status: FieldStatus }>(fields: T[]): T[] {
  return fields.filter((f) => f.value && f.status === "SUGGESTED");
}

export function parseQuotes(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((q): q is string => typeof q === "string" && q.trim().length > 0) : [];
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLocaleLowerCase("lv");

type TimedSegment = { start: number; end: number; text: string };

/**
 * Where in the audio a quote was said: the segments that contain its start and
 * its end. Used by "Noklausīties" on a protocol field.
 */
export function quoteRange(quote: string, segments: TimedSegment[]): { start: number; end: number } | null {
  const q = norm(quote);
  if (!q) return null;
  const head = q.slice(0, 24);
  const tail = q.slice(-24);
  const first = segments.find((s) => norm(s.text).includes(head));
  if (!first) return null;
  const last = [...segments].reverse().find((s) => s.start >= first.start && norm(s.text).includes(tail)) ?? first;
  return { start: first.start, end: Math.max(first.end, last.end) };
}

export type Piece = { text: string; mark: boolean };

/** Splits a paragraph into marked / unmarked pieces for the given quotes. */
export function highlight(paragraph: string, quotes: string[]): Piece[] {
  const lower = paragraph.toLocaleLowerCase("lv");
  const ranges: [number, number][] = [];
  for (const quote of quotes) {
    const q = quote.replace(/\s+/g, " ").trim().toLocaleLowerCase("lv");
    if (!q) continue;
    const at = lower.indexOf(q);
    if (at >= 0) ranges.push([at, at + q.length]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const pieces: Piece[] = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start < cursor) continue;
    if (start > cursor) pieces.push({ text: paragraph.slice(cursor, start), mark: false });
    pieces.push({ text: paragraph.slice(start, end), mark: true });
    cursor = end;
  }
  if (cursor < paragraph.length) pieces.push({ text: paragraph.slice(cursor), mark: false });
  return pieces;
}
