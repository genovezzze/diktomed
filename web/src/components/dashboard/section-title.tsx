import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Section heading of the Shadowy overview ("Kopsavilkums", "Klienti"). */
export function SectionTitle({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-4 mt-9 flex items-end justify-between gap-3 first:mt-0", className)}>
      <h2 className="font-display text-[20px] font-bold leading-tight tracking-tight">{children}</h2>
      {action}
    </div>
  );
}
