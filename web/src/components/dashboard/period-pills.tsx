import { ChipLinks } from "./chip-links";
import { PERIODS, type Period } from "@/lib/period";

/** "7 d. / 30 d. / 90 d. / Viss" in the top bar, as on the Shadowy overview. */
export function PeriodPills({ current, basePath }: { current: Period; basePath: string }) {
  return (
    <ChipLinks
      label="Periods"
      items={PERIODS.map((p) => ({
        label: p.label,
        href: p.value === "all" ? basePath : `${basePath}?period=${p.value}`,
        active: current === p.value,
      }))}
    />
  );
}
