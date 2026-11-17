import { cn } from "@/lib/utils";

/** DiktoMed mark: a microphone capsule with a medical cross. Inherits colour. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn("h-6 w-6 shrink-0", className)}
    >
      <rect x="8" y="2.5" width="8" height="12.5" rx="4" />
      <path d="M12 6.4v4.4M9.8 8.6h4.4" />
      <path d="M5 11.2a7 7 0 0 0 14 0" />
      <path d="M12 18.2v3.3" />
    </svg>
  );
}

export function LogoLockup({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-1.5", className)}>
      <LogoMark />
      <span className="whitespace-nowrap font-display text-[24px] font-normal leading-none tracking-tight">DiktoMed</span>
    </span>
  );
}
