import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ChevronLeft, FileText, Loader2 } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { AutoRefresh } from "@/components/recordings/auto-refresh";
import { METRIC_SURFACE } from "@/components/dashboard/apple";
import { ProtocolWorkspace } from "@/components/protocol/protocol-workspace";
import { parseQuotes, quoteRange } from "@/lib/protocol";
import { DOCUMENT_KIND_ACC, DOCUMENT_KIND_GEN, DOCUMENT_KIND_LABELS, SIDE_LABELS } from "@/lib/labels";
import { isDemoModel } from "@/lib/demo";
import { cn } from "@/lib/utils";
import { RedraftButton } from "./redraft-button";
import { KindSwitch } from "./kind-switch";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dokuments" };

function StateCard({ icon, title, text, children }: { icon: React.ReactNode; title: string; text: string; children?: React.ReactNode }) {
  return (
    <section className={cn(METRIC_SURFACE, "flex flex-col items-center px-6 py-14 text-center")}>
      {icon}
      <h1 className="mt-4 font-display text-[22px] font-medium">{title}</h1>
      <p className="mt-3 max-w-lg text-[15px] text-muted-foreground">{text}</p>
      {children && <div className="mt-5">{children}</div>}
    </section>
  );
}

export default async function ProtocolPage({ params }: { params: { id: string } }) {
  await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();

  const recording = await prisma.recording.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      title: true,
      status: true,
      plannedSide: true,
      documentKind: true,
      modelName: true,
      audioDeletedAt: true,
      document: { select: { text: true } },
      segments: { orderBy: { idx: "asc" }, select: { start: true, end: true, text: true } },
      protocol: {
        include: {
          approvedBy: { select: { name: true } },
          fields: { orderBy: { position: "asc" } },
        },
      },
    },
  });
  if (!recording) notFound();

  const back = (
    <Link href={`/diktati/${recording.id}`} className="mb-4 inline-flex items-center gap-1 text-[14px] text-muted-foreground hover:text-foreground">
      <ChevronLeft className="h-4 w-4" />
      {recording.title}
    </Link>
  );
  const protocol = recording.protocol;
  const kind = recording.documentKind;
  const acc = DOCUMENT_KIND_ACC[kind];

  let body: React.ReactNode;
  if (recording.status !== "APPROVED" || !recording.document) {
    body = (
      <StateCard
        icon={<FileText className="h-8 w-8 text-muted-foreground" />}
        title="Vispirms apstipriniet transkriptu"
        text={`${DOCUMENT_KIND_LABELS[kind]} tiek sagatavots tikai no cilvēka apstiprināta teksta, nekad tieši no audio.`}
      />
    );
  } else if (!protocol) {
    body = (
      <StateCard
        icon={<FileText className="h-8 w-8 text-[#0A84FF]" />}
        title={`${DOCUMENT_KIND_LABELS[kind]}: vēl nav sagatavots`}
        text={`Sistēma sadalīs apstiprināto tekstu pa ${DOCUMENT_KIND_GEN[kind]} sadaļām. Katram laukam būs norādīts citāts no teksta.`}
      >
        <RedraftButton recordingId={recording.id} label={`Sagatavot ${acc}`} />
      </StateCard>
    );
  } else if (protocol.status === "QUEUED" || protocol.status === "PROCESSING") {
    body = (
      <>
        <AutoRefresh active />
        <StateCard
          icon={<Loader2 className="h-8 w-8 animate-spin text-[#0A84FF]" />}
          title={`Sagatavo ${acc}`}
          text="Teksts tiek sadalīts pa sadaļām un katrs lauks pārbaudīts pret apstiprināto tekstu. Lapa atjaunosies automātiski."
        />
      </>
    );
  } else if (protocol.status === "FAILED") {
    body = (
      <StateCard
        icon={<AlertTriangle className="h-8 w-8 text-[#FF453A]" />}
        title={`Neizdevās sagatavot ${acc}`}
        text={protocol.errorMessage ?? "Nezināma kļūda."}
      >
        <RedraftButton recordingId={recording.id} label="Mēģināt vēlreiz" />
      </StateCard>
    );
  } else {
    body = (
      <ProtocolWorkspace
        demo={isDemoModel(recording.modelName)}
        documentKind={kind}
        recordingId={recording.id}
        recordingTitle={recording.title}
        plannedSide={recording.plannedSide ? SIDE_LABELS[recording.plannedSide] : null}
        status={protocol.status}
        engine={protocol.engine}
        approvedBy={protocol.approvedBy?.name ?? null}
        approvedAt={protocol.approvedAt?.toISOString() ?? null}
        audioAvailable={!recording.audioDeletedAt}
        paragraphs={recording.document.text.split(/\n{2,}/)}
        fields={protocol.fields.map((f) => {
          const quotes = parseQuotes(f.quotes);
          const ranges = quotes.map((q) => quoteRange(q, recording.segments)).filter((r): r is { start: number; end: number } => r != null);
          return {
            id: f.id,
            title: f.title,
            value: f.value,
            quotes,
            check: f.check,
            checkMessage: f.checkMessage,
            status: f.status,
            range: ranges.length
              ? { start: Math.min(...ranges.map((r) => r.start)), end: Math.max(...ranges.map((r) => r.end)) }
              : null,
          };
        })}
      />
    );
  }

  return (
    <div className="mx-auto max-w-[1400px]">
      {back}
      <KindSwitch recordingId={recording.id} kind={kind} locked={protocol?.status === "APPROVED"} hasDraft={protocol?.status === "READY"} />
      {body}
    </div>
  );
}
