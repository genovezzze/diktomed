// Period filter shared by the overview and quality pages ("7 d.", "30 d." ...).

export type Period = "7d" | "30d" | "90d" | "all";

export const PERIODS: { value: Period; label: string }[] = [
  { value: "7d", label: "7 d." },
  { value: "30d", label: "30 d." },
  { value: "90d", label: "90 d." },
  { value: "all", label: "Viss" },
];

export function parsePeriod(raw: string | string[] | undefined): Period {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === "7d" || v === "30d" || v === "90d" ? v : "all";
}

export function periodStart(period: Period, now = new Date()): Date | null {
  if (period === "all") return null;
  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}
