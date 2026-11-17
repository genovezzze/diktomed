"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronRight, Download, FileAudio, Pause, Play, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatClock, formatDateTimeLV, formatPercent } from "@/lib/format";
import { SIDE_LABELS } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/recordings/status-badge";
import { APPLE_CARD_LABEL, CHIP_GROUP, METRIC_SURFACE, TINT_TILE, chipClass } from "@/components/dashboard/apple";
import { acceptSuggestion, approveRecording, saveSegment, setFlagStatus, type ActionResult } from "@/app/(app)/diktati/[id]/actions";
import { Waveform, computePeaks } from "./waveform";
import { SegmentRow } from "./segment-row";
import { FlagCard } from "./flag-card";
import type { FlagView, RecordingView, SegmentView } from "./types";
import type { FlagSeverity } from "@prisma/client";

const SPEEDS = [0.75, 1, 1.25, 1.5];
const SEVERITY_ORDER: Record<FlagSeverity, number> = { HIGH: 0, MEDIUM: 1, INFO: 2 };
type SeverityFilter = "ALL" | FlagSeverity;

interface ReviewWorkspaceProps {
  recording: RecordingView;
  segments: SegmentView[];
  flags: FlagView[];
}

export function ReviewWorkspace({ recording, segments, flags }: ReviewWorkspaceProps) {
  const router = useRouter();
  const audioRef = useRef<HTMLAudioElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const stopAtRef = useRef<number | null>(null);

  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [audioState, setAudioState] = useState<"loading" | "ready" | "missing">(recording.audioAvailable ? "loading" : "missing");
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [follow, setFollow] = useState(true);
  const [lineThreshold, setLineThreshold] = useState(0.7);
  const [wordThreshold, setWordThreshold] = useState(0.5);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [severity, setSeverity] = useState<SeverityFilter>("ALL");
  const [showResolved, setShowResolved] = useState(false);
  const [selectedFlagId, setSelectedFlagId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const canEdit = recording.status === "READY";
  const duration = recording.durationSec ?? segments.at(-1)?.end ?? 0;

  // Load the audio once: the same blob feeds the player and the waveform.
  useEffect(() => {
    if (!recording.audioAvailable) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/recordings/${recording.id}/audio`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        if (audioRef.current) audioRef.current.src = objectUrl;
        setAudioState("ready");
        const ctx = new AudioContext();
        try {
          const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
          if (!cancelled) setPeaks(computePeaks(decoded.getChannelData(0), 1600));
        } finally {
          void ctx.close();
        }
      } catch {
        if (!cancelled) setAudioState("missing");
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [recording.id, recording.audioAvailable]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed]);

  const seek = useCallback((seconds: number, play = false) => {
    const a = audioRef.current;
    if (!a) return;
    stopAtRef.current = null;
    a.currentTime = Math.max(0, seconds);
    setCurrentTime(a.currentTime);
    if (play) void a.play().catch(() => {});
  }, []);

  const togglePlay = useCallback(() => {
    const a = audioRef.current;
    if (!a || audioState !== "ready") return;
    stopAtRef.current = null;
    if (a.paused) void a.play().catch(() => {});
    else a.pause();
  }, [audioState]);

  const currentSegment = useMemo(
    () => segments.find((s) => currentTime >= s.start && currentTime < s.end) ?? null,
    [segments, currentTime],
  );

  // Follow playback: keep the spoken fragment in view.
  useEffect(() => {
    if (!follow || !playing || !currentSegment || editingId) return;
    const el = transcriptRef.current?.querySelector(`[data-segment-id="${currentSegment.id}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [follow, playing, currentSegment, editingId]);

  const openFlags = flags.filter((f) => f.status === "OPEN");
  const topFlagBySegment = useMemo(() => {
    const map = new Map<string, FlagView>();
    for (const f of openFlags) {
      if (!f.segmentId) continue;
      const prev = map.get(f.segmentId);
      if (!prev || SEVERITY_ORDER[f.severity] < SEVERITY_ORDER[prev.severity]) map.set(f.segmentId, f);
    }
    return map;
  }, [openFlags]);

  const visibleFlags = flags
    .filter((f) => (showResolved ? true : f.status === "OPEN"))
    .filter((f) => severity === "ALL" || f.severity === severity)
    .sort((a, b) => a.start - b.start);

  const counts = {
    ALL: openFlags.length,
    HIGH: openFlags.filter((f) => f.severity === "HIGH").length,
    MEDIUM: openFlags.filter((f) => f.severity === "MEDIUM").length,
    INFO: openFlags.filter((f) => f.severity === "INFO").length,
  };
  const reviewed = flags.length - openFlags.length;

  function run(action: () => Promise<ActionResult>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await action();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      after?.();
      router.refresh();
    });
  }

  const onSave = useCallback(
    (segmentId: string, text: string) =>
      run(() => saveSegment({ recordingId: recording.id, segmentId, text }), () => setEditingId(null)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recording.id],
  );

  const focusFlag = useCallback(
    (flag: FlagView) => {
      setSelectedFlagId(flag.id);
      seek(Math.max(0, flag.start - 0.3));
      if (flag.segmentId) {
        transcriptRef.current
          ?.querySelector(`[data-segment-id="${flag.segmentId}"]`)
          ?.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    },
    [seek],
  );

  const playRange = useCallback(
    (start: number, end: number) => {
      seek(Math.max(0, start - 0.2), true);
      stopAtRef.current = end + 0.3;
    },
    [seek],
  );

  const playFlag = useCallback(
    (flag: FlagView) => {
      focusFlag(flag);
      const a = audioRef.current;
      if (!a) return;
      void a.play().catch(() => {});
      stopAtRef.current = flag.end + 0.4;
    },
    [focusFlag],
  );

  const nextFlag = useCallback(() => {
    const sorted = [...openFlags].sort((a, b) => a.start - b.start);
    if (!sorted.length) return;
    const selected = sorted.findIndex((f) => f.id === selectedFlagId);
    const next = selected >= 0 ? sorted[(selected + 1) % sorted.length] : sorted.find((f) => f.start > currentTime) ?? sorted[0];
    focusFlag(next);
    document.querySelector(`[data-flag-id="${next.id}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [openFlags, selectedFlagId, currentTime, focusFlag]);

  // Space: play/pause, N: next flag (not while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, button, [contenteditable=true]")) return;
      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "n" || e.key === "N") {
        nextFlag();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, nextFlag]);

  function approve() {
    if (counts.MEDIUM + counts.INFO > 0 && counts.HIGH === 0) {
      const ok = window.confirm(`Vēl ir ${counts.MEDIUM + counts.INFO} nepārbaudītas vietas. Apstiprināt dokumentu?`);
      if (!ok) return;
    }
    run(() => approveRecording({ recordingId: recording.id }));
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <section className={cn(METRIC_SURFACE, "p-5")}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="truncate font-display text-[24px] font-medium leading-tight">{recording.title}</h1>
              <StatusBadge status={recording.status} />
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <FileAudio className="h-3.5 w-3.5" />
                {recording.originalName}
              </span>
              <span>· {formatClock(duration)}</span>
              {recording.language && (
                <span>
                  · Valoda: {recording.language}
                  {recording.languageProb != null && ` (${formatPercent(recording.languageProb)})`}
                </span>
              )}
              {recording.plannedSide && <span>· Plānotā puse: {SIDE_LABELS[recording.plannedSide].toLowerCase()}</span>}
              {recording.modelName && <span>· Modelis: {recording.modelName}</span>}
              <span>
                · {recording.uploadedBy}, {formatDateTimeLV(recording.createdAt)}
              </span>
            </div>
            {recording.approvedBy && recording.approvedAt && (
              <div className="mt-2 inline-flex items-center gap-1.5 text-[14px] text-[#248A3D] dark:text-[#30D158]">
                <CheckCircle2 className="h-4 w-4" />
                Apstiprināja {recording.approvedBy}, {formatDateTimeLV(recording.approvedAt)}
              </div>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <span className="mr-1 text-[13px] text-muted-foreground">Lejupielādēt:</span>
            <Button asChild variant="outline" size="sm">
              <a href={`/api/recordings/${recording.id}/docx`}>
                <Download className="h-3.5 w-3.5" />
                {recording.status === "APPROVED" ? "DOCX" : "Melnraksts DOCX"}
              </a>
            </Button>
            {canEdit && (
              <Button size="sm" onClick={approve} disabled={pending || counts.HIGH > 0} title={counts.HIGH > 0 ? "Vispirms pārbaudiet augsta riska vietas" : undefined}>
                <ShieldCheck className="h-3.5 w-3.5" />
                Apstiprināt dokumentu
              </Button>
            )}
          </div>
        </div>

        {flags.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-[13px] text-muted-foreground">
              <span>
                Pārbaudīts {reviewed} no {flags.length}
              </span>
              {counts.HIGH > 0 && canEdit && <span className="text-[#FF453A]">{counts.HIGH} augsta riska vietas jāpārbauda</span>}
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/[0.05] dark:bg-white/[0.08]">
              <div className="h-full rounded-full bg-[#0A84FF] transition-[width]" style={{ width: `${(reviewed / flags.length) * 100}%` }} />
            </div>
          </div>
        )}
        {error && (
          <p role="alert" className="mt-3 rounded-xl bg-[#FF453A]/10 px-4 py-2.5 text-[14px] text-[#D70015] dark:text-[#FF453A]">
            {error}
          </p>
        )}
      </section>

      {/* Player */}
      <section className={cn(METRIC_SURFACE, "p-5")}>
        <audio
          ref={audioRef}
          preload="auto"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onTimeUpdate={(e) => {
            const t = e.currentTarget.currentTime;
            setCurrentTime(t);
            if (stopAtRef.current != null && t >= stopAtRef.current) {
              e.currentTarget.pause();
              stopAtRef.current = null;
            }
          }}
        />
        {audioState === "missing" ? (
          <p className="text-[14px] text-muted-foreground">
            Audio vairs nav pieejams (dzēsts pēc glabāšanas termiņa vai vēl nav sagatavots). Teksts saglabāts.
          </p>
        ) : (
          <>
            <Waveform audioRef={audioRef} peaks={peaks} duration={duration} flags={flags} onSeek={(s) => seek(s)} />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={togglePlay}
                disabled={audioState !== "ready"}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-[#007AFF] text-white transition-colors hover:bg-[#0062CC] disabled:opacity-50 dark:bg-[#0A84FF] dark:hover:bg-[#0A74E0]"
                aria-label={playing ? "Pauze" : "Atskaņot"}
              >
                {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
              </button>
              <span className="font-mono text-[14px] tabular-nums">
                {formatClock(currentTime)} <span className="text-muted-foreground">/ {formatClock(duration)}</span>
              </span>
              <div className={cn(CHIP_GROUP, "ml-auto")} data-slot="segmented" aria-label="Ātrums">
                {SPEEDS.map((s) => (
                  <button key={s} type="button" data-state={speed === s ? "active" : "inactive"} onClick={() => setSpeed(s)} className={chipClass(speed === s)}>
                    {s}×
                  </button>
                ))}
              </div>
              <span className="hidden text-[12px] text-muted-foreground lg:inline">Atstarpe: atskaņot · N: nākamā vieta</span>
            </div>
          </>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        {/* Transcript */}
        <section className={cn(METRIC_SURFACE, "min-w-0 p-5")}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className={cn(APPLE_CARD_LABEL, TINT_TILE.blue)}>
              <FileAudio />
              Transkripts (MI melnraksts)
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-[14px] text-muted-foreground">
              <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} className="h-4 w-4 accent-[#0A84FF]" />
              Sekot atskaņošanai
            </label>
          </div>

          <div className="mt-4 grid gap-3 rounded-xl bg-black/[0.03] p-3 text-[13px] sm:grid-cols-2 dark:bg-white/[0.04]">
            <label className="flex items-center gap-3">
              <span className="w-36 shrink-0 text-muted-foreground">Rindas ticamība &lt; {Math.round(lineThreshold * 100)}%</span>
              <input
                type="range"
                min={0.3}
                max={0.95}
                step={0.05}
                value={lineThreshold}
                onChange={(e) => setLineThreshold(Number(e.target.value))}
                className="apple-range w-full"
              />
              <span className="shrink-0 whitespace-nowrap text-right tabular-nums">{segments.filter((s) => s.confidence < lineThreshold && !s.edited).length} rindas</span>
            </label>
            <label className="flex items-center gap-3">
              <span className="w-36 shrink-0 text-muted-foreground">Vārdu ticamība &lt; {Math.round(wordThreshold * 100)}%</span>
              <input
                type="range"
                min={0.1}
                max={0.9}
                step={0.05}
                value={wordThreshold}
                onChange={(e) => setWordThreshold(Number(e.target.value))}
                className="apple-range w-full"
              />
              <span className="shrink-0 whitespace-nowrap text-right tabular-nums">
                {segments.reduce((n, s) => n + (s.edited ? 0 : s.words.filter((w) => w.p < wordThreshold).length), 0)} vārdi
              </span>
            </label>
          </div>
          <p className="mt-2 text-[13px] text-muted-foreground">
            Noklikšķiniet uz vārda, lai to noklausītos; ar zīmuli labo fragmentu.{" "}
            <span className="underline decoration-[#FF9F0A] decoration-dotted decoration-2 underline-offset-4">zema vārda ticamība</span>
          </p>

          <div ref={transcriptRef} className="mt-3 space-y-0.5">
            {segments.length === 0 ? (
              <p className="py-6 text-center text-[14px] text-muted-foreground">Ierakstā netika atpazīta runa.</p>
            ) : (
              segments.map((s) => {
                const isCurrent = currentSegment?.id === s.id;
                return (
                  <SegmentRow
                    key={s.id}
                    segment={s}
                    topFlag={topFlagBySegment.get(s.id) ?? null}
                    isCurrent={isCurrent}
                    currentTime={isCurrent ? currentTime : null}
                    lineThreshold={lineThreshold}
                    wordThreshold={wordThreshold}
                    canEdit={canEdit}
                    editing={editingId === s.id}
                    pending={pending}
                    onSeek={seek}
                    onPlayRange={playRange}
                    onEdit={setEditingId}
                    onSave={onSave}
                  />
                );
              })
            )}
          </div>
        </section>

        {/* Flags */}
        <aside className={cn(METRIC_SURFACE, "h-fit p-5 xl:sticky xl:top-4")}>
          <div className="flex items-center justify-between gap-2">
            <div className="font-display text-[16px] font-medium">Pārbaudāmās vietas</div>
            <Button size="sm" onClick={nextFlag} disabled={openFlags.length === 0}>
              Nākamā
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="mt-1 text-[13px] text-muted-foreground">
            Pārbaudīts {reviewed} no {flags.length}
          </div>

          <div className={cn(CHIP_GROUP, "mt-3 w-fit max-w-full overflow-x-auto")} data-slot="segmented">
            {(
              [
                ["ALL", "Visi"],
                ["HIGH", "Augsts"],
                ["MEDIUM", "Vidējs"],
                ["INFO", "Info"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                data-state={severity === value ? "active" : "inactive"}
                onClick={() => setSeverity(value)}
                className={chipClass(severity === value)}
              >
                {label}
                <span className="tabular-nums text-muted-foreground">{counts[value]}</span>
              </button>
            ))}
          </div>
          <label className="mt-3 flex cursor-pointer items-center gap-2 text-[13px] text-muted-foreground">
            <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} className="h-4 w-4 accent-[#0A84FF]" />
            Rādīt arī pārbaudītās
          </label>

          <div className="mt-3 max-h-[calc(100vh-14rem)] space-y-2 overflow-y-auto pr-1">
            {visibleFlags.length === 0 ? (
              <p className="py-6 text-center text-[14px] text-muted-foreground">
                {openFlags.length === 0 ? "Visas vietas pārbaudītas." : "Šim filtram nav vietu."}
              </p>
            ) : (
              visibleFlags.map((f) => (
                <FlagCard
                  key={f.id}
                  flag={f}
                  selected={selectedFlagId === f.id}
                  canEdit={canEdit}
                  pending={pending}
                  onSelect={focusFlag}
                  onPlay={playFlag}
                  onStatus={(flag, status) => run(() => setFlagStatus({ flagId: flag.id, status }))}
                  onAccept={(flag) => run(() => acceptSuggestion({ flagId: flag.id }))}
                />
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
