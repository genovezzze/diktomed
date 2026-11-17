"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requeueRecording } from "./actions";

export function RequeueButton({ recordingId }: { recordingId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-center gap-2">
      <Button
        onClick={() =>
          startTransition(async () => {
            const res = await requeueRecording({ recordingId });
            if (!res.ok) setError(res.error);
            else router.refresh();
          })
        }
        disabled={pending}
      >
        <RotateCcw className="h-4 w-4" />
        Mēģināt vēlreiz
      </Button>
      {error && <p className="text-[14px] text-[#FF453A]">{error}</p>}
    </div>
  );
}
