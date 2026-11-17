import type { RecordingStatus } from "@prisma/client";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { STATUS_BADGE, STATUS_LABELS } from "@/lib/labels";

export function StatusBadge({ status }: { status: RecordingStatus }) {
  return (
    <Badge variant={STATUS_BADGE[status]} className="gap-1.5 whitespace-nowrap">
      {status === "PROCESSING" && <Loader2 className="h-3 w-3 animate-spin" />}
      {STATUS_LABELS[status]}
    </Badge>
  );
}
