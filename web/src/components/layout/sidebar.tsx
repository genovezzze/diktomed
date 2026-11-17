"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, PanelLeftClose, PanelLeftOpen, Pin, UserCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { LogoMark } from "@/components/brand/logo";
import { NAV_ITEMS, isActive } from "./nav";
import type { Role } from "@/lib/session-token";

interface SidebarProps {
  role: Role;
  roleLabel: string;
  userName: string;
  organizationName: string;
  /** Desktop icon rail: labels hidden until hovered or pinned. */
  collapsed: boolean;
  peeking: boolean;
  onToggleCollapsed?: () => void;
  onClose?: () => void;
}

// Row geometry from the Shadowy rail: a 40px icon box, then the label.
const railRow =
  "flex h-9 items-center rounded-lg text-muted-foreground transition-colors hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.05]";
const railBox = "flex h-9 w-10 shrink-0 items-center justify-center";
const railLabel = "select-none truncate whitespace-nowrap pr-3 text-[15px]";
const divider = "mx-3.5 h-px bg-sidebar-border dark:bg-white/[0.07]";

export function Sidebar({
  role,
  roleLabel,
  userName,
  organizationName,
  collapsed,
  peeking,
  onToggleCollapsed,
  onClose,
}: SidebarProps) {
  const pathname = usePathname();
  const rail = collapsed;
  const showLabel = !rail || peeking;
  const items = NAV_ITEMS.filter((i) => !i.roles || i.roles.includes(role));

  return (
    <aside
      className={cn(
        "relative flex h-full shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar font-app transition-[width] duration-200 ease-out dark:border-white/[0.07]",
        rail && !peeking ? "w-[68px]" : "w-64",
      )}
    >
      <div className="relative z-10">
        <div className={cn("flex h-14 items-center", rail ? "px-3.5" : "justify-between px-5")}>
          <Link href="/" onClick={onClose} className="flex h-10 items-center transition-opacity hover:opacity-75" aria-label="DiktoMed">
            <span className={cn("flex shrink-0 items-center justify-center", rail ? "h-10 w-10" : "mr-1.5")}>
              <LogoMark />
            </span>
            {showLabel && (
              <span className="whitespace-nowrap font-display text-[24px] font-normal leading-none tracking-tight">DiktoMed</span>
            )}
          </Link>
          {!rail && onToggleCollapsed && (
            <button
              type="button"
              onClick={onToggleCollapsed}
              className="hidden h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-black/[0.04] hover:text-foreground md:flex dark:hover:bg-white/[0.05]"
              title="Sakļaut izvēlni"
              aria-label="Sakļaut izvēlni"
            >
              <PanelLeftClose className="h-[18px] w-[18px]" />
            </button>
          )}
        </div>
        <div aria-hidden className={divider} />
      </div>

      <div className="relative z-10 flex-1 overflow-hidden">
        <nav className={cn("flex h-full flex-col overflow-y-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", rail ? "px-3.5 pt-3" : "px-3 pt-3")}>
          <div className="space-y-0.5">
            {rail && onToggleCollapsed && (
              <>
                <button
                  type="button"
                  onClick={onToggleCollapsed}
                  className={cn(railRow, showLabel ? "w-full" : "w-10")}
                  title={showLabel ? "Piespraust izvēlni" : "Izvērst izvēlni"}
                  aria-label={showLabel ? "Piespraust izvēlni" : "Izvērst izvēlni"}
                >
                  <span className={railBox}>
                    {showLabel ? <Pin className="h-[18px] w-[18px]" /> : <PanelLeftOpen className="h-[18px] w-[18px]" />}
                  </span>
                  {showLabel && <span className={railLabel}>Piespraust izvēlni</span>}
                </button>
                <div aria-hidden className="!my-3 h-px bg-sidebar-border dark:bg-white/[0.07]" />
              </>
            )}
            {items.map((item) => {
              const active = isActive(item.href, pathname);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  title={rail && !showLabel ? item.label : undefined}
                  aria-label={rail && !showLabel ? item.label : undefined}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "sidebar-nav-link group relative flex h-9 items-center overflow-hidden rounded-lg text-[15px] transition-colors duration-150",
                    rail ? (showLabel ? "w-full" : "w-10") : "gap-2.5 px-3",
                    active
                      ? "bg-[#007AFF]/10 font-medium text-[#007AFF] dark:bg-[#0A84FF]/20 dark:text-[#4DA3FF]"
                      : "text-muted-foreground hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.05]",
                  )}
                >
                  <span className={cn("relative z-10 flex shrink-0 items-center justify-center", rail ? "h-9 w-10" : "h-[18px] w-[18px]")}>
                    <Icon className="sidebar-nav-icon h-[18px] w-[18px]" />
                  </span>
                  {showLabel && <span className={cn("relative z-10 flex-1", rail && "truncate whitespace-nowrap pr-3")}>{item.label}</span>}
                </Link>
              );
            })}
          </div>
        </nav>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-sidebar to-transparent" />
      </div>

      <div className="relative z-10">
        <div aria-hidden className={divider} />
        {rail ? (
          <div className="flex flex-col gap-1 px-3.5 py-3">
            <div className={cn(railRow, showLabel ? "w-full" : "w-10")} title={`${userName} · ${roleLabel}`}>
              <span className={railBox}>
                <UserCircle className="h-[18px] w-[18px]" />
              </span>
              {showLabel && <span className={cn(railLabel, "text-foreground")}>{userName}</span>}
            </div>
            <div className={cn(railRow, "[&_button]:!bg-transparent", showLabel ? "w-full" : "w-10")}>
              <span className={railBox}>
                <ThemeToggle />
              </span>
              {showLabel && <span className={railLabel}>Tēma</span>}
            </div>
            <a href="/api/auth/logout" className={cn(railRow, showLabel ? "w-full" : "w-10")} title="Iziet" aria-label="Iziet">
              <span className={railBox}>
                <LogOut className="h-4 w-4" />
              </span>
              {showLabel && <span className={railLabel}>Iziet</span>}
            </a>
          </div>
        ) : (
          <div className="p-4">
            <div className="mb-3 px-1">
              <div className="text-xs text-muted-foreground">Iestāde</div>
              <div className="mt-1 truncate text-[15px] font-medium">{organizationName}</div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="-mx-1 min-w-0 px-2 py-1.5">
                <div className="truncate text-[15px]">{userName}</div>
                <div className="text-[13px] text-muted-foreground">{roleLabel}</div>
              </div>
              <div className="flex items-center gap-1">
                <ThemeToggle />
                <a
                  href="/api/auth/logout"
                  className="inline-flex items-center rounded-md p-2 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground dark:hover:bg-white/[0.07]"
                  title="Iziet"
                  aria-label="Iziet"
                >
                  <LogOut className="h-4 w-4" />
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
