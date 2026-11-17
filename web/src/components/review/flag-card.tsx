"use client";

import { Check, Play, RotateCcw, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatClock } from "@/lib/format";
import { FLAG_KIND_LABELS, SEVERITY_LABELS } from "@/lib/labels";
import { SEVERITY_HEX, type FlagView } from "./types";

const pill =
  "inline-flex h-7 items-center gap-1.5 rounded-full border border-black/[0.08] bg-white px-3 text-[13px] font-medium transition-colors hover:bg-black/[0.03] disabled:opacity-50 dark:border-white/[0.1] dark:bg-white/[0.04] dark:hover:bg-white/[0.08]";

interface FlagCardProps {
  flag: FlagView;
  selected: boolean;
  canEdit: boolean;
  pending: boolean;
  onSelect: (flag: FlagView) => void;
  onPlay: (flag: FlagView) => void;
  onStatus: (flag: FlagView, status: "OPEN" | "RESOLVED" | "DISMISSED") => void;
  onAccept: (flag: FlagView) => void;
}

export function FlagCard({ flag, selected, canEdit, pending, onSelect, onPlay, onStatus, onAccept }: FlagCardProps) {
  const open = flag.status === "OPEN";
  return (
    <div
      data-flag-id={flag.id}
      onClick={() => onSelect(flag)}
      className={cn(
        "cursor-pointer rounded-xl border border-l-[3px] border-black/[0.07] p-3 transition-colors dark:border-white/[0.07]",
        selected ? "bg-[#0A84FF]/[0.08] ring-1 ring-[#0A84FF]/40" : "hover:bg-black/[0.02] dark:hover:bg-white/[0.03]",
        !open && "opacity-60",
      )}
      style={{ borderLeftColor: SEVERITY_HEX[flag.severity] }}
    >
      <div className="flex items-center gap-2 text-[13px]">
        <span className="font-mono tabular-nums text-muted-foreground">{formatClock(flag.start)}</span>
        <span className="font-medium text-foreground">{FLAG_KIND_LABELS[flag.kind]}</span>
        <span className="ml-auto whitespace-nowrap text-[12px]" style={{ color: SEVERITY_HEX[flag.severity] }}>
          {SEVERITY_LABELS[flag.severity]}
        </span>
      </div>
      <p className="mt-1 text-[14px] leading-snug text-muted-foreground">{flag.message}</p>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        <button type="button" className={pill} onClick={() => onPlay(flag)}>
          <Play className="h-3 w-3" />
          Atskaņot
        </button>
        {canEdit && open && flag.suggestion != null && flag.excerpt && (
          <button
            type="button"
            className={cn(pill, "border-transparent bg-[#007AFF] text-white hover:bg-[#0062CC] dark:border-transparent dark:bg-[#0A84FF] dark:hover:bg-[#0A74E0]")}
            onClick={() => onAccept(flag)}
            disabled={pending}
            title={`Aizstāt «${flag.excerpt}» ar «${flag.suggestion}»`}
          >
            <Sparkles className="h-3 w-3" />
            {flag.suggestion ? `Pieņemt «${flag.suggestion}»` : "Dzēst tekstu"}
          </button>
        )}
        {canEdit && open && (
          <>
            <button type="button" className={pill} onClick={() => onStatus(flag, "RESOLVED")} disabled={pending}>
              <Check className="h-3 w-3" />
              Pārbaudīts
            </button>
            {(flag.kind === "TERM" || flag.kind === "AI_SUGGESTION") && (
              <button type="button" className={pill} onClick={() => onStatus(flag, "DISMISSED")} disabled={pending}>
                <X className="h-3 w-3" />
                Noraidīt
              </button>
            )}
          </>
        )}
        {canEdit && !open && (
          <button type="button" className={pill} onClick={() => onStatus(flag, "OPEN")} disabled={pending}>
            <RotateCcw className="h-3 w-3" />
            Atvērt vēlreiz
          </button>
        )}
      </div>
    </div>
  );
}
