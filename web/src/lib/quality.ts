import "server-only";
import { prisma } from "@/lib/db";
import { pooledWer, wordErrorRate } from "@/lib/wer";

export type RecordingQuality = {
  id: string;
  title: string;
  approvedAt: Date;
  durationSec: number | null;
  modelName: string | null;
  referenceWords: number;
  edits: number;
  wer: number;
  flags: number;
  processingSec: number | null;
};

/**
 * How much of each approved draft had to be corrected: the model's original
 * segment text against the approved segment text. A pilot is worth continuing
 * only if this number is low enough that correcting beats typing from scratch.
 */
export async function approvedQuality(since: Date | null, limit = 500): Promise<{
  rows: RecordingQuality[];
  pooled: { wer: number; edits: number; referenceWords: number };
}> {
  const recordings = await prisma.recording.findMany({
    where: { status: "APPROVED", ...(since ? { approvedAt: { gte: since } } : {}) },
    orderBy: { approvedAt: "desc" },
    take: limit,
    select: {
      id: true,
      title: true,
      approvedAt: true,
      durationSec: true,
      modelName: true,
      createdAt: true,
      processedAt: true,
      processingStart: true,
      segments: { select: { originalText: true, text: true } },
      _count: { select: { flags: true } },
    },
  });

  const rows: RecordingQuality[] = recordings.map((r) => {
    const pairs = r.segments.map((s) => ({ reference: s.text, hypothesis: s.originalText }));
    const q = pooledWer(pairs);
    return {
      id: r.id,
      title: r.title,
      approvedAt: r.approvedAt ?? r.createdAt,
      durationSec: r.durationSec,
      modelName: r.modelName,
      referenceWords: q.referenceWords,
      edits: q.edits,
      wer: q.wer,
      flags: r._count.flags,
      processingSec:
        r.processedAt && r.processingStart ? (r.processedAt.getTime() - r.processingStart.getTime()) / 1000 : null,
    };
  });

  const edits = rows.reduce((s, r) => s + r.edits, 0);
  const referenceWords = rows.reduce((s, r) => s + r.referenceWords, 0);
  return { rows, pooled: { wer: referenceWords ? edits / referenceWords : 0, edits, referenceWords } };
}

export { wordErrorRate };
