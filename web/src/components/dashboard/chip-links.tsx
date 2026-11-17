import Link from "next/link";
import { cn } from "@/lib/utils";
import { CHIP_GROUP, chipClass } from "./apple";

export type ChipLink = { label: string; href: string; active: boolean; count?: number };

/** A pill group of links (filters, periods), as on the Shadowy overview. */
export function ChipLinks({ items, className, label }: { items: ChipLink[]; className?: string; label: string }) {
  return (
    <nav aria-label={label} data-slot="segmented" className={cn(CHIP_GROUP, "w-fit max-w-full overflow-x-auto", className)}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          data-state={item.active ? "active" : "inactive"}
          aria-current={item.active ? "page" : undefined}
          className={cn(chipClass(item.active), "h-8 px-3.5 text-[14px]")}
        >
          {item.label}
          {item.count != null && <span className="tabular-nums text-muted-foreground">{item.count}</span>}
        </Link>
      ))}
    </nav>
  );
}
