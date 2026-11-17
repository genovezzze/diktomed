"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Check, Pencil, Play, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatClock, formatPercent } from "@/lib/format";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { SEVERITY_HEX, type FlagView, type SegmentView } from "./types";

interface SegmentRowProps {
  segment: SegmentView;
  /** Highest-severity open flag on this fragment, if any. */
  topFlag: FlagView | null;
  isCurrent: boolean;
  /** Playhead time while this row is current, otherwise null (keeps memo cheap). */
  currentTime: number | null;
  lineThreshold: number;
  wordThreshold: number;
  canEdit: boolean;
  editing: boolean;
  pending: boolean;
  onSeek: (seconds: number, play?: boolean) => void;
  onPlayRange: (start: number, end: number) => void;
  onEdit: (segmentId: string | null) => void;
  onSave: (segmentId: string, text: string) => void;
}

function SegmentRowImpl({
  segment,
  topFlag,
  isCurrent,
  currentTime,
  lineThreshold,
  wordThreshold,
  canEdit,
  editing,
  pending,
  onSeek,
  onPlayRange,
  onEdit,
  onSave,
}: SegmentRowProps) {
  const [draft, setDraft] = useState(segment.text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(segment.text);
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (el) {
          el.focus();
          el.setSelectionRange(el.value.length, el.value.length);
        }
      });
    }
  }, [editing, segment.text]);

  const lowLine = segment.confidence < lineThreshold;
  const accent = topFlag ? SEVERITY_HEX[topFlag.severity] : lowLine ? SEVERITY_HEX.MEDIUM : null;

  return (
    <div
      data-segment-id={segment.id}
      className={cn(
        "group grid grid-cols-[52px_minmax(0,1fr)_32px] gap-3 rounded-xl border-l-[3px] px-3 py-2.5 transition-colors",
        isCurrent ? "bg-[#0A84FF]/[0.08]" : "hover:bg-black/[0.02] dark:hover:bg-white/[0.03]",
      )}
      style={{ borderLeftColor: accent ?? "transparent" }}
    >
      <button
        type="button"
        onClick={() => onSeek(segment.start, true)}
        className="h-fit pt-0.5 text-left font-mono text-[13px] tabular-nums text-muted-foreground hover:text-[#0A84FF]"
        title="Atskaņot no šejienes"
      >
        {formatClock(segment.start)}
      </button>

      <div className="min-w-0">
        {editing ? (
          <div>
            <Textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={Math.min(8, Math.max(2, Math.ceil(draft.length / 90)))}
              className="min-h-0 text-[15px] leading-relaxed"
              onKeyDown={(e) => {
                if (e.key === "Escape") onEdit(null);
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) onSave(segment.id, draft);
              }}
              aria-label={`Labot fragmentu ${formatClock(segment.start)}`}
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => onSave(segment.id, draft)} disabled={pending}>
                <Check className="h-3.5 w-3.5" />
                Saglabāt
              </Button>
              <Button size="sm" variant="outline" onClick={() => onEdit(null)} disabled={pending}>
                Atcelt
              </Button>
              <Button size="sm" variant="outline" onClick={() => onPlayRange(segment.start, segment.end)}>
                <Play className="h-3.5 w-3.5" />
                Noklausīties
              </Button>
              <span className="text-[12px] text-muted-foreground">Ctrl+Enter saglabā, Esc atceļ</span>
            </div>
            {segment.edited && (
              <p className="mt-2 text-[13px] text-muted-foreground">
                Modeļa teksts: <span className="italic">{segment.originalText || "(tukšs)"}</span>
              </p>
            )}
          </div>
        ) : (
          <p className="text-[15px] leading-relaxed">
            {segment.edited || segment.words.length === 0 ? (
              <span className={cn(!segment.text && "italic text-muted-foreground")}>{segment.text || "(fragments izdzēsts)"}</span>
            ) : (
              segment.words.map((word, i) => {
                const low = word.p < wordThreshold;
                const playing = currentTime != null && currentTime >= word.s && currentTime < word.e;
                return (
                  <span
                    key={i}
                    onClick={() => onSeek(word.s)}
                    title={`Ticamība ${formatPercent(word.p)}`}
                    className={cn(
                      "cursor-pointer",
                      low && "underline decoration-[#FF9F0A] decoration-dotted decoration-2 underline-offset-4",
                      word.p < wordThreshold / 2 && "decoration-[#FF453A]",
                      playing && "word-current",
                    )}
                  >
                    {word.w}
                  </span>
                );
              })
            )}
            {lowLine && !segment.edited && (
              <span className="ml-2 inline-flex translate-y-[-1px] items-center rounded-full bg-[#FF9F0A]/15 px-2 py-0.5 align-middle text-[11px] font-medium text-[#C93400] dark:text-[#FF9F0A]">
                ticamība {formatPercent(segment.confidence)}
              </span>
            )}
            {segment.edited && (
              <span className="ml-2 inline-flex translate-y-[-1px] items-center rounded-full bg-[#0A84FF]/12 px-2 py-0.5 align-middle text-[11px] font-medium text-[#007AFF] dark:text-[#0A84FF]">
                labots
              </span>
            )}
          </p>
        )}
      </div>

      <div className="flex justify-end">
        {canEdit && !editing && (
          <button
            type="button"
            onClick={() => onEdit(segment.id)}
            className="h-8 w-8 rounded-lg text-muted-foreground opacity-0 transition hover:bg-black/[0.05] hover:text-foreground focus:opacity-100 group-hover:opacity-100 dark:hover:bg-white/[0.08]"
            aria-label="Labot fragmentu"
            title="Labot"
          >
            <Pencil className="mx-auto h-4 w-4" />
          </button>
        )}
        {editing && (
          <button
            type="button"
            onClick={() => onEdit(null)}
            className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-white/[0.08]"
            aria-label="Aizvērt"
          >
            <X className="mx-auto h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export const SegmentRow = memo(SegmentRowImpl);
