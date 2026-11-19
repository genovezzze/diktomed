import type { DocumentKind, FlagKind, FlagSeverity, FlagStatus, RecordingStatus, Side } from "@prisma/client";

export type WordView = { w: string; s: number; e: number; p: number };

export type SegmentView = {
  id: string;
  idx: number;
  start: number;
  end: number;
  text: string;
  originalText: string;
  confidence: number;
  words: WordView[];
  edited: boolean;
};

export type FlagView = {
  id: string;
  segmentId: string | null;
  kind: FlagKind;
  severity: FlagSeverity;
  start: number;
  end: number;
  message: string;
  excerpt: string | null;
  suggestion: string | null;
  status: FlagStatus;
};

export type RecordingView = {
  id: string;
  title: string;
  originalName: string;
  status: RecordingStatus;
  durationSec: number | null;
  language: string | null;
  languageProb: number | null;
  plannedSide: Side | null;
  documentKind: DocumentKind;
  modelName: string | null;
  createdAt: string;
  uploadedBy: string;
  approvedBy: string | null;
  approvedAt: string | null;
  audioAvailable: boolean;
};

export const SEVERITY_HEX: Record<FlagSeverity, string> = {
  HIGH: "#FF453A",
  MEDIUM: "#FF9F0A",
  INFO: "#0A84FF",
};
