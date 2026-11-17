"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileAudio, Mic, Square, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatBytes, formatClock } from "@/lib/format";
import { CHIP_GROUP, METRIC_SURFACE, chipClass } from "@/components/dashboard/apple";

const ACCEPT = ".wav,.mp3,.m4a,.aac,.ogg,.opus,.flac,.webm,.wma,.dss,audio/*";

const SIDES = [
  { value: "", label: "Nav norādīta" },
  { value: "LEFT", label: "Kreisā" },
  { value: "RIGHT", label: "Labā" },
  { value: "BOTH", label: "Abas" },
] as const;

export function UploadCard({ maxBytes }: { maxBytes: number }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [side, setSide] = useState<(typeof SIDES)[number]["value"]>("");
  const [dragging, setDragging] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  function pick(f: File | undefined | null) {
    setError(null);
    if (!f) return;
    if (f.size > maxBytes) {
      setError(`Fails ir pārāk liels (${formatBytes(f.size)}). Maksimums: ${formatBytes(maxBytes)}.`);
      return;
    }
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
  }

  // Dictating straight into the browser. Needs HTTPS or localhost: browsers
  // only give the microphone to secure pages.
  async function startRecording() {
    setError(null);
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError("Ierakstīšana pārlūkā darbojas tikai caur HTTPS (vai localhost). Izmantojiet diktofona failu.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, noiseSuppression: true } });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "";
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const stamp = new Date().toISOString().slice(0, 16).replace("T", " ").replace(":", "-");
        pick(new File([blob], `diktats ${stamp}.webm`, { type: blob.type }));
      };
      recorder.start(1000);
      recorderRef.current = recorder;
      setRecording(true);
      setRecordSeconds(0);
      timerRef.current = window.setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    } catch {
      setError("Neizdevās piekļūt mikrofonam. Pārbaudiet pārlūka atļaujas.");
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
  }

  function upload() {
    if (!file) return;
    setError(null);
    setProgress(0);
    const form = new FormData();
    form.append("file", file);
    form.append("title", title.trim());
    form.append("plannedSide", side);

    // XHR rather than fetch: fetch cannot report upload progress, and a
    // six-minute WAV is tens of megabytes.
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/recordings");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let body: { id?: string; error?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300 && body.id) {
        router.push(`/diktati/${body.id}`);
        router.refresh();
        return;
      }
      setProgress(null);
      setError(body.error ?? "Augšupielāde neizdevās. Mēģiniet vēlreiz.");
    };
    xhr.onerror = () => {
      setProgress(null);
      setError("Nav savienojuma ar serveri.");
    };
    xhr.send(form);
  }

  const uploading = progress !== null;

  return (
    <section id="augsupielade" className={cn(METRIC_SURFACE, "scroll-mt-6 p-5")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-display text-[15px] font-medium">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#007AFF] text-white dark:bg-[#0A84FF]">
            <Upload className="h-4 w-4" />
          </span>
          Jauns diktāts
        </div>
        {recording ? (
          <Button size="sm" variant="outline" onClick={stopRecording}>
            <Square className="h-3.5 w-3.5 fill-[#FF453A] text-[#FF453A]" />
            Apturēt · {formatClock(recordSeconds)}
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={startRecording} disabled={uploading}>
            <Mic className="h-3.5 w-3.5" />
            Ierakstīt pārlūkā
          </Button>
        )}
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          pick(e.dataTransfer.files?.[0]);
        }}
        onClick={() => !uploading && !recording && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        className={cn(
          "mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-8 text-center transition-colors",
          dragging || recording
            ? "border-[#0A84FF] bg-[#0A84FF]/[0.08]"
            : "border-black/[0.12] hover:bg-black/[0.02] dark:border-white/[0.12] dark:hover:bg-white/[0.03]",
        )}
      >
        {recording ? (
          <>
            <span className="relative flex h-7 w-7 items-center justify-center">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#FF453A]/40" />
              <Mic className="relative h-5 w-5 text-[#FF453A]" />
            </span>
            <div className="text-[15px]">Notiek ierakstīšana · {formatClock(recordSeconds)}</div>
            <div className="text-[13px] text-muted-foreground">Kad beidzat, nospiediet &quot;Apturēt&quot;</div>
          </>
        ) : (
          <>
            <FileAudio className="h-7 w-7 text-muted-foreground" />
            {file ? (
              <div className="flex items-center gap-2 text-[15px]">
                <span className="font-medium">{file.name}</span>
                <span className="text-muted-foreground">{formatBytes(file.size)}</span>
                {!uploading && (
                  <button
                    type="button"
                    aria-label="Noņemt failu"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                    }}
                    className="rounded-full p-1 text-muted-foreground hover:bg-white/[0.08] hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="text-[15px]">Ievelciet diktofona failu šeit vai noklikšķiniet, lai izvēlētos</div>
                <div className="text-[13px] text-muted-foreground">WAV, MP3, M4A, OGG, FLAC, DSS · līdz {formatBytes(maxBytes)}</div>
              </>
            )}
          </>
        )}
        <input ref={inputRef} type="file" aria-label="Izvēlēties audio failu" accept={ACCEPT} className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center">
        <label htmlFor="recording-title" className="sr-only">Nosaukums</label>
        <Input
          id="recording-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Nosaukums, piem. Operācijas protokols"
          maxLength={200}
          disabled={uploading}
          className="h-10"
        />
        <div className="flex items-center gap-2">
          <span className="whitespace-nowrap text-[13px] text-muted-foreground">Plānotā puse</span>
          <div className={CHIP_GROUP} data-slot="segmented" role="radiogroup" aria-label="Plānotā operācijas puse">
            {SIDES.map((s) => (
              <button
                key={s.value}
                type="button"
                role="radio"
                aria-checked={side === s.value}
                data-state={side === s.value ? "active" : "inactive"}
                onClick={() => setSide(s.value)}
                className={chipClass(side === s.value)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <Button onClick={upload} disabled={!file || uploading || recording} className="h-10 px-5">
          {uploading ? `Augšupielādē... ${progress}%` : "Augšupielādēt"}
        </Button>
      </div>

      {uploading && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/[0.05] dark:bg-white/[0.08]">
          <div className="h-full rounded-full bg-[#0A84FF] transition-[width]" style={{ width: `${progress}%` }} />
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-[14px] text-[#FF453A]">
          {error}
        </p>
      )}
      <p className="mt-3 text-[13px] text-muted-foreground">
        Fails paliek slimnīcas serverī, atpazīšana notiek lokāli. Plānotā puse ļauj sistēmai pamanīt, ja diktātā minēta otra puse.
      </p>
    </section>
  );
}
