"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-renders the page from the server every few seconds while work is pending. */
export function AutoRefresh({ active, intervalMs = 3000 }: { active: boolean; intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => router.refresh(), intervalMs);
    return () => window.clearInterval(id);
  }, [active, intervalMs, router]);
  return null;
}
