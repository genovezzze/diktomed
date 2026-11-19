"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { DocumentKind } from "@prisma/client";
import { CHIP_GROUP, chipClass } from "@/components/dashboard/apple";
import { DOCUMENT_KIND_LABELS } from "@/lib/labels";
import { setDocumentKind } from "./actions";

const KINDS: DocumentKind[] = ["OPERATION", "EPICRISIS"];

/** Which document this dictation becomes. Changing it drafts the document again. */
export function KindSwitch({ recordingId, kind, locked, hasDraft }: { recordingId: string; kind: DocumentKind; locked: boolean; hasDraft: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function choose(next: DocumentKind) {
    if (next === kind || locked) return;
    if (hasDraft && !window.confirm(`Mainīt uz "${DOCUMENT_KIND_LABELS[next]}"? Dokuments tiks sagatavots no jauna, pašreizējie lēmumi par laukiem tiks dzēsti.`)) return;
    setError(null);
    startTransition(async () => {
      const res = await setDocumentKind({ recordingId, kind: next });
      if (!res.ok) setError(res.error);
      router.refresh();
    });
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <span className="text-[13px] text-muted-foreground">Dokumenta veids</span>
      <div className={CHIP_GROUP} data-slot="segmented" role="radiogroup" aria-label="Dokumenta veids">
        {KINDS.map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            data-state={kind === k ? "active" : "inactive"}
            disabled={pending || locked}
            onClick={() => choose(k)}
            className={chipClass(kind === k)}
          >
            {DOCUMENT_KIND_LABELS[k]}
          </button>
        ))}
      </div>
      {error && <span role="alert" className="text-[13px] text-[#FF453A]">{error}</span>}
    </div>
  );
}
