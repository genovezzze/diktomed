import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ChevronLeft, Loader2 } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { auditView } from "@/lib/audit";
import { ReviewWorkspace } from "@/components/review/review-workspace";
import { AutoRefresh } from "@/components/recordings/auto-refresh";
import { StatusBadge } from "@/components/recordings/status-badge";
import { METRIC_SURFACE } from "@/components/dashboard/apple";
import { formatClock, formatDateTimeLV } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { WordView } from "@/components/review/types";
import { RequeueButton } from "./requeue-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pārbaude" };

function parseWords(value: unknown): WordView[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((w) =>
    w && typeof w === "object" && typeof w.w === "string" && typeof w.s === "number" && typeof w.e === "number" && typeof w.p === "number"
      ? [{ w: w.w, s: w.s, e: w.e, p: w.p }]
      : [],
  );
}

export default async function ReviewPage({ params }: { params: { id: string } }) {
  const session = await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();

  const recording = await prisma.recording.findUnique({
    where: { id: params.id },
    include: {
      uploadedBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
      segments: { orderBy: { idx: "asc" } },
      flags: { orderBy: { start: "asc" } },
    },
  });
  if (!recording) notFound();

  await auditView(session.userId, recording.id);

  const back = (
    <Link href="/diktati" className="mb-4 inline-flex items-center gap-1 text-[14px] text-muted-foreground hover:text-foreground">
      <ChevronLeft className="h-4 w-4" />
      Diktāti
    </Link>
  );

  if (recording.status === "QUEUED" || recording.status === "PROCESSING") {
    const p = recording.status === "PROCESSING" ? recording.progress ?? 0 : null;
    const elapsed = recording.processingStart ? (Date.now() - recording.processingStart.getTime()) / 1000 : 0;
    const remaining = p != null && p > 0.03 ? (elapsed * (1 - p)) / p : null;
    return (
      <div className="mx-auto max-w-[1400px]">
        {back}
        <AutoRefresh active />
        <section className={cn(METRIC_SURFACE, "flex flex-col items-center px-6 py-14 text-center")}>
          <Loader2 className="h-8 w-8 animate-spin text-[#0A84FF]" />
          <h1 className="mt-4 font-display text-[22px] font-medium">{recording.title}</h1>
          <div className="mt-2">
            <StatusBadge status={recording.status} />
          </div>
          <p className="mt-3 max-w-md text-[15px] text-muted-foreground">
            {recording.status === "QUEUED"
              ? "Diktāts gaida rindā. Atpazīšana sāksies, tiklīdz serveris atbrīvosies."
              : "Notiek runas atpazīšana slimnīcas serverī. Lapa atjaunosies automātiski."}
          </p>
          {p != null && (
            <div className="mt-5 w-full max-w-md">
              <div className="h-1.5 overflow-hidden rounded-full bg-black/[0.05] dark:bg-white/[0.08]">
                <div className="h-full rounded-full bg-[#0A84FF] transition-[width]" style={{ width: `${Math.max(3, p * 100)}%` }} />
              </div>
              <div className="mt-2 flex justify-between text-[13px] tabular-nums text-muted-foreground">
                <span>{Math.round(p * 100)}%</span>
                <span>{remaining != null ? `atlicis ~${formatClock(remaining)}` : "novērtē laiku..."}</span>
              </div>
            </div>
          )}
          <p className="mt-3 text-[13px] text-muted-foreground">Augšupielādēts {formatDateTimeLV(recording.createdAt)}</p>
        </section>
      </div>
    );
  }

  if (recording.status === "FAILED") {
    return (
      <div className="mx-auto max-w-[1400px]">
        {back}
        <section className={cn(METRIC_SURFACE, "flex flex-col items-center px-6 py-14 text-center")}>
          <AlertTriangle className="h-8 w-8 text-[#FF453A]" />
          <h1 className="mt-4 font-display text-[22px] font-medium">{recording.title}</h1>
          <p className="mt-3 max-w-lg text-[15px] text-muted-foreground">
            Apstrāde neizdevās{recording.errorMessage ? `: ${recording.errorMessage}` : "."}
          </p>
          <div className="mt-5">
            <RequeueButton recordingId={recording.id} />
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px]">
      {back}
      <ReviewWorkspace
        recording={{
          id: recording.id,
          title: recording.title,
          originalName: recording.originalName,
          status: recording.status,
          durationSec: recording.durationSec,
          language: recording.language,
          languageProb: recording.languageProb,
          plannedSide: recording.plannedSide,
          modelName: recording.modelName,
          createdAt: recording.createdAt.toISOString(),
          uploadedBy: recording.uploadedBy.name,
          approvedBy: recording.approvedBy?.name ?? null,
          approvedAt: recording.approvedAt?.toISOString() ?? null,
          audioAvailable: !recording.audioDeletedAt,
        }}
        segments={recording.segments.map((s) => ({
          id: s.id,
          idx: s.idx,
          start: s.start,
          end: s.end,
          text: s.text,
          originalText: s.originalText,
          confidence: s.confidence,
          words: parseWords(s.words),
          edited: s.text !== s.originalText,
        }))}
        flags={recording.flags.map((f) => ({
          id: f.id,
          segmentId: f.segmentId,
          kind: f.kind,
          severity: f.severity,
          start: f.start,
          end: f.end,
          message: f.message,
          excerpt: f.excerpt,
          suggestion: f.suggestion,
          status: f.status,
        }))}
      />
      <p className="mt-4 text-center text-[12px] text-muted-foreground">
        {formatClock(recording.durationSec)} audio · melnrakstu sagatavoja MI, gala tekstu apstiprina cilvēks
      </p>
    </div>
  );
}
