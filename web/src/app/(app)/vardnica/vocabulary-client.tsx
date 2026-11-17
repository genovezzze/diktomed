"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { APPLE_SEPARATOR } from "@/components/dashboard/apple";
import { addTerm, removeCorrection, removeTerm, toggleCorrection, type ActionResult } from "./actions";

function useAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<ActionResult>, after?: () => void) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error);
      else {
        after?.();
        router.refresh();
      }
    });
  };
  return { pending, error, run };
}

export function TermsEditor({ terms }: { terms: { id: string; text: string }[] }) {
  const { pending, error, run } = useAction();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div>
      <form
        ref={formRef}
        action={(fd) => run(() => addTerm(fd), () => formRef.current?.reset())}
        className="flex gap-2"
      >
        <label htmlFor="term" className="sr-only">Jauns termins</label>
        <Input id="term" name="term" placeholder="Piem. holecistektomija" maxLength={80} required className="h-10" />
        <Button type="submit" disabled={pending} className="h-10 shrink-0">
          <Plus className="h-4 w-4" />
          Pievienot
        </Button>
      </form>
      {error && <p className="mt-2 text-[14px] text-[#FF453A]">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        {terms.length === 0 && <p className="text-[14px] text-muted-foreground">Vārdnīca ir tukša.</p>}
        {terms.map((t) => (
          <span
            key={t.id}
            className="inline-flex h-8 items-center gap-1 rounded-full bg-black/[0.05] pl-3 pr-1 text-[14px] dark:bg-white/[0.08]"
          >
            {t.text}
            <button
              type="button"
              onClick={() => run(() => removeTerm({ id: t.id }))}
              disabled={pending}
              className="rounded-full p-1 text-muted-foreground hover:bg-black/[0.06] hover:text-foreground dark:hover:bg-white/[0.1]"
              aria-label={`Dzēst ${t.text}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

type CorrectionRow = { id: string; wrong: string; right: string; count: number; enabled: boolean };

export function CorrectionsTable({ rows, minCount }: { rows: CorrectionRow[]; minCount: number }) {
  const { pending, error, run } = useAction();

  if (rows.length === 0) {
    return (
      <p className="text-[14px] text-muted-foreground">
        Vēl nav iemācītu labojumu. Tie parādīsies, kad cilvēki sāks labot melnrakstus.
      </p>
    );
  }

  return (
    <div>
      {error && <p className="mb-2 text-[14px] text-[#FF453A]">{error}</p>}
      <div className="hidden grid-cols-[minmax(0,1fr)_24px_minmax(0,1fr)_70px_150px_36px] gap-3 pb-2 text-[13px] text-muted-foreground md:grid">
        <span>Modelis dzirdēja</span>
        <span />
        <span>Cilvēks laboja uz</span>
        <span className="text-right">Reizes</span>
        <span>Ieteikt jaunos diktātos</span>
        <span />
      </div>
      <ul>
        {rows.map((r) => {
          const active = r.enabled && r.count >= minCount;
          return (
            <li
              key={r.id}
              className={cn(
                "grid grid-cols-[minmax(0,1fr)_24px_minmax(0,1fr)] items-center gap-3 border-t py-2.5 text-[15px] md:grid-cols-[minmax(0,1fr)_24px_minmax(0,1fr)_70px_150px_36px]",
                APPLE_SEPARATOR,
              )}
            >
              <span className="truncate font-mono text-[14px] text-muted-foreground line-through decoration-[#FF453A]/60">{r.wrong}</span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <span className="truncate font-medium">{r.right}</span>
              <span className="hidden text-right tabular-nums md:block">{r.count}</span>
              <label className="hidden cursor-pointer items-center gap-2 text-[14px] md:flex">
                <input
                  type="checkbox"
                  checked={r.enabled}
                  disabled={pending}
                  onChange={(e) => run(() => toggleCorrection({ id: r.id, enabled: e.target.checked }))}
                  className="h-4 w-4 accent-[#0A84FF]"
                />
                <span className={active ? "" : "text-muted-foreground"}>
                  {r.enabled ? (r.count >= minCount ? "Ieslēgts" : `pēc ${minCount} reizēm`) : "Izslēgts"}
                </span>
              </label>
              <button
                type="button"
                onClick={() => run(() => removeCorrection({ id: r.id }))}
                disabled={pending}
                className="hidden h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-black/[0.05] hover:text-foreground md:flex dark:hover:bg-white/[0.08]"
                aria-label="Dzēst labojumu"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
