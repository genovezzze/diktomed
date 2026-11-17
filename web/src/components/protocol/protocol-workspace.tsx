"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { FieldCheck, FieldStatus, ProtocolStatus } from "@prisma/client";
import { AlertTriangle, Check, CheckCircle2, Download, FileText, Pencil, Play, RotateCcw, ShieldCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTimeLV } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { APPLE_CARD_LABEL, METRIC_SURFACE, TINT_TILE } from "@/components/dashboard/apple";
import {
  FIELD_CHECK_LABELS,
  FIELD_STATUS_LABELS,
  PROTOCOL_STATUS_BADGE,
  PROTOCOL_STATUS_LABELS,
  highlight,
  isWarning,
  pendingFields,
} from "@/lib/protocol";
import { DEMO_BANNER } from "@/lib/demo";
import {
  approveProtocol,
  decideField,
  editField,
  redraftProtocol,
  type ActionResult,
} from "@/app/(app)/diktati/[id]/protokols/actions";

export type ProtocolFieldView = {
  id: string;
  title: string;
  value: string | null;
  quotes: string[];
  check: FieldCheck;
  checkMessage: string | null;
  status: FieldStatus;
  range: { start: number; end: number } | null;
};

interface ProtocolWorkspaceProps {
  demo: boolean;
  recordingId: string;
  recordingTitle: string;
  plannedSide: string | null;
  status: ProtocolStatus;
  engine: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  audioAvailable: boolean;
  paragraphs: string[];
  fields: ProtocolFieldView[];
}

const pill =
  "inline-flex h-7 items-center gap-1.5 rounded-full border border-black/[0.08] bg-white px-3 text-[13px] font-medium transition-colors hover:bg-black/[0.03] disabled:opacity-50 dark:border-white/[0.1] dark:bg-white/[0.04] dark:hover:bg-white/[0.08]";

function checkTone(check: FieldCheck): string {
  if (check === "OK") return "bg-[#0A84FF]/12 text-[#007AFF] dark:text-[#0A84FF]";
  if (check === "EMPTY") return "bg-black/[0.05] text-muted-foreground dark:bg-white/[0.08]";
  if (check === "SIDE_MISMATCH" || check === "QUOTE_NOT_FOUND") return "bg-[#FF453A]/12 text-[#D70015] dark:text-[#FF453A]";
  return "bg-[#FF9F0A]/15 text-[#C93400] dark:text-[#FF9F0A]";
}

export function ProtocolWorkspace(props: ProtocolWorkspaceProps) {
  const { recordingId, fields, paragraphs, status } = props;
  const router = useRouter();
  const audioRef = useRef<HTMLAudioElement>(null);
  const stopAt = useRef<number | null>(null);
  const sourceRef = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(fields.find((f) => f.value)?.id ?? null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const editable = status === "READY";
  const selected = fields.find((f) => f.id === selectedId) ?? null;
  const decided = fields.filter((f) => f.value && f.status !== "SUGGESTED").length;
  const withValue = fields.filter((f) => f.value || f.status === "REJECTED").length;
  const waiting = pendingFields(fields).length;

  // Bring the highlighted source into view inside the text panel only: the
  // page itself must not jump when a field is picked.
  useEffect(() => {
    const box = sourceRef.current;
    const mark = box?.querySelector("mark");
    if (!box || !mark) return;
    const top = mark.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    box.scrollTo({ top: Math.max(0, top - box.clientHeight / 3), behavior: "smooth" });
  }, [selectedId]);

  function run(action: () => Promise<ActionResult>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await action();
      if (!res.ok) setError(res.error);
      else {
        after?.();
        router.refresh();
      }
    });
  }

  function listen(field: ProtocolFieldView) {
    const a = audioRef.current;
    if (!a || !field.range) return;
    setSelectedId(field.id);
    a.currentTime = Math.max(0, field.range.start - 0.2);
    stopAt.current = field.range.end + 0.3;
    void a.play().catch(() => {});
  }

  function accept(field: ProtocolFieldView) {
    if (isWarning(field.check)) {
      const ok = window.confirm(
        `${FIELD_CHECK_LABELS[field.check]}: ${field.checkMessage ?? ""}\n\nVai pārbaudījāt šo lauku pret audio un tekstu?`,
      );
      if (!ok) return;
    }
    run(() => decideField({ fieldId: field.id, decision: "ACCEPTED" }));
  }

  return (
    <div className="space-y-4">
      {props.demo && (
        <div role="alert" className="rounded-2xl border-2 border-[#FF453A] bg-[#FF453A]/15 px-5 py-4 text-[15px] font-semibold text-[#D70015] dark:text-[#FF6961]">
          {DEMO_BANNER}
        </div>
      )}
      <audio
        ref={audioRef}
        preload="none"
        src={props.audioAvailable ? `/api/recordings/${recordingId}/audio` : undefined}
        onTimeUpdate={(e) => {
          if (stopAt.current != null && e.currentTarget.currentTime >= stopAt.current) {
            e.currentTarget.pause();
            stopAt.current = null;
          }
        }}
      />

      <section className={cn(METRIC_SURFACE, "p-5")}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-[24px] font-medium leading-tight">Operācijas protokols</h1>
              <Badge variant={PROTOCOL_STATUS_BADGE[status]}>{PROTOCOL_STATUS_LABELS[status]}</Badge>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-2 text-[13px] text-muted-foreground">
              <span>{props.recordingTitle}</span>
              {props.plannedSide && <span>· Plānotā puse: {props.plannedSide.toLowerCase()}</span>}
              {props.engine && <span>· Sagatavoja: {props.engine}</span>}
            </div>
            {props.approvedBy && props.approvedAt && (
              <div className="mt-2 inline-flex items-center gap-1.5 text-[14px] text-[#248A3D] dark:text-[#30D158]">
                <CheckCircle2 className="h-4 w-4" />
                Apstiprināja {props.approvedBy}, {formatDateTimeLV(props.approvedAt)}
              </div>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {editable && (
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => {
                  if (window.confirm("Sagatavot protokolu no jauna? Pašreizējie lēmumi par laukiem tiks dzēsti.")) {
                    run(() => redraftProtocol({ recordingId }));
                  }
                }}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                No jauna
              </Button>
            )}
            <Button asChild variant="outline" size="sm">
              <a href={`/api/recordings/${recordingId}/protocol-docx`}>
                <Download className="h-3.5 w-3.5" />
                {status === "APPROVED" ? "Protokols DOCX" : "Melnraksts DOCX"}
              </a>
            </Button>
            {editable && (
              <Button
                size="sm"
                disabled={pending || waiting > 0}
                title={waiting > 0 ? "Vispirms pārbaudiet visus laukus" : undefined}
                onClick={() => run(() => approveProtocol({ recordingId }))}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                Apstiprināt protokolu
              </Button>
            )}
          </div>
        </div>
        <div className="mt-4">
          <div className="flex justify-between text-[13px] text-muted-foreground">
            <span>
              Pārbaudīti {decided} no {withValue} aizpildītajiem laukiem
            </span>
            {editable && waiting > 0 && <span>{waiting} lauki gaida lēmumu</span>}
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/[0.05] dark:bg-white/[0.08]">
            <div
              className="h-full rounded-full bg-[#0A84FF] transition-[width]"
              style={{ width: `${withValue ? (decided / withValue) * 100 : 0}%` }}
            />
          </div>
        </div>
        {error && (
          <p role="alert" className="mt-3 rounded-xl bg-[#FF453A]/10 px-4 py-2.5 text-[14px] text-[#D70015] dark:text-[#FF453A]">
            {error}
          </p>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          {fields.map((f) => {
            const isSelected = f.id === selectedId;
            const editing = editingId === f.id;
            return (
              <article
                key={f.id}
                data-field-id={f.id}
                onClick={() => setSelectedId(f.id)}
                className={cn(
                  METRIC_SURFACE,
                  "cursor-pointer p-4 transition-colors",
                  isSelected && "ring-1 ring-[#0A84FF]/50",
                  f.status === "REJECTED" && "opacity-60",
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-[15px] font-medium">{f.title}</h2>
                  <span className={cn("inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-[12px] font-medium", checkTone(f.check))}>
                    {isWarning(f.check) && <AlertTriangle className="h-3 w-3" />}
                    {FIELD_CHECK_LABELS[f.check]}
                  </span>
                  {f.status !== "SUGGESTED" && (
                    <span className="ml-auto text-[12px] text-muted-foreground">{FIELD_STATUS_LABELS[f.status]}</span>
                  )}
                </div>

                {editing ? (
                  <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                    <Textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      autoFocus
                      rows={Math.min(8, Math.max(2, Math.ceil(draft.length / 80)))}
                      className="min-h-0 text-[15px]"
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setEditingId(null);
                        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) run(() => editField({ fieldId: f.id, value: draft }), () => setEditingId(null));
                      }}
                    />
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" disabled={pending} onClick={() => run(() => editField({ fieldId: f.id, value: draft }), () => setEditingId(null))}>
                        <Check className="h-3.5 w-3.5" />
                        Saglabāt
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                        Atcelt
                      </Button>
                    </div>
                  </div>
                ) : f.value ? (
                  <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed">{f.value}</p>
                ) : (
                  <p className="mt-2 text-[14px] italic text-muted-foreground">
                    {f.status === "REJECTED" ? "Noraidīts, protokolā netiks iekļauts." : "Diktātā nav minēts."}
                  </p>
                )}

                {f.checkMessage && isWarning(f.check) && (
                  <p className="mt-2 text-[13px] text-[#C93400] dark:text-[#FF9F0A]">{f.checkMessage}</p>
                )}

                {f.quotes.length > 0 && (
                  <div className="mt-2.5 space-y-1 border-l-2 border-black/[0.08] pl-3 dark:border-white/[0.1]">
                    {f.quotes.map((q, i) => (
                      <p key={i} className="text-[13px] leading-snug text-muted-foreground">
                        «{q}»
                      </p>
                    ))}
                  </div>
                )}

                {editable && !editing && (
                  <div className="mt-3 flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
                    {f.value && f.status === "SUGGESTED" && (
                      <button
                        type="button"
                        className={cn(pill, "border-transparent bg-[#007AFF] text-white hover:bg-[#0062CC] dark:border-transparent dark:bg-[#0A84FF] dark:hover:bg-[#0A74E0]")}
                        disabled={pending}
                        onClick={() => accept(f)}
                      >
                        <Check className="h-3 w-3" />
                        Pieņemt
                      </button>
                    )}
                    <button
                      type="button"
                      className={pill}
                      disabled={pending}
                      onClick={() => {
                        setDraft(f.value ?? "");
                        setEditingId(f.id);
                      }}
                    >
                      <Pencil className="h-3 w-3" />
                      {f.value ? "Labot" : "Aizpildīt"}
                    </button>
                    {f.value && f.status === "SUGGESTED" && (
                      <button type="button" className={pill} disabled={pending} onClick={() => run(() => decideField({ fieldId: f.id, decision: "REJECTED" }))}>
                        <X className="h-3 w-3" />
                        Noraidīt
                      </button>
                    )}
                    {f.range && props.audioAvailable && (
                      <button type="button" className={pill} onClick={() => listen(f)}>
                        <Play className="h-3 w-3" />
                        Noklausīties
                      </button>
                    )}
                    {f.status !== "SUGGESTED" && f.status !== "EDITED" && (
                      <button type="button" className={pill} disabled={pending} onClick={() => run(() => decideField({ fieldId: f.id, decision: "SUGGESTED" }))}>
                        <RotateCcw className="h-3 w-3" />
                        Atcelt lēmumu
                      </button>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>

        <aside className={cn(METRIC_SURFACE, "h-fit p-5 xl:sticky xl:top-4")}>
          <div className={cn(APPLE_CARD_LABEL, TINT_TILE.blue)}>
            <FileText />
            Apstiprinātais teksts
          </div>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {selected ? `Izcelts avots laukam «${selected.title}».` : "Izvēlieties lauku, lai redzētu, no kurienes tas ņemts."}
          </p>
          <div ref={sourceRef} className="mt-3 max-h-[calc(100vh-12rem)] space-y-3 overflow-y-auto pr-1 text-[15px] leading-relaxed">
            {paragraphs.map((p, i) => (
              <p key={i}>
                {highlight(p, selected?.quotes ?? []).map((piece, j) =>
                  piece.mark ? (
                    <mark key={j} className="rounded bg-[#0A84FF]/25 px-0.5 text-foreground">
                      {piece.text}
                    </mark>
                  ) : (
                    <span key={j}>{piece.text}</span>
                  ),
                )}
              </p>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
