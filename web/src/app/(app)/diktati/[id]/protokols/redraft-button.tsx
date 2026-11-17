"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { redraftProtocol } from "./actions";

export function RedraftButton({ recordingId, label }: { recordingId: string; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-center gap-2">
      <Button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await redraftProtocol({ recordingId });
            if (!res.ok) setError(res.error);
            else router.refresh();
          })
        }
      >
        <FileText className="h-4 w-4" />
        {label}
      </Button>
      {error && <p className="text-[14px] text-[#FF453A]">{error}</p>}
    </div>
  );
}
