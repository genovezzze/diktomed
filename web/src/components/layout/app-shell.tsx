"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Menu, Upload } from "lucide-react";
import { Sidebar } from "./sidebar";
import { pageTitleFor } from "./nav";
import { TOP_BAR_SLOT_ID } from "./top-bar-slot";
import { LogoMark } from "@/components/brand/logo";
import type { Role } from "@/lib/session-token";

interface AppShellProps {
  role: Role;
  roleLabel: string;
  userName: string;
  organizationName: string;
  children: ReactNode;
}

/** The Shadowy platform frame: icon rail on the left, a thin top bar, the page. */
export function AppShell({ role, roleLabel, userName, organizationName, children }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const [peeking, setPeeking] = useState(false);
  const peekTimer = useRef<number | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    try {
      if (localStorage.getItem("diktomed_sidebar_collapsed") === "0") setCollapsed(false);
    } catch {}
  }, []);

  useEffect(() => () => {
    if (peekTimer.current !== null) window.clearTimeout(peekTimer.current);
  }, []);

  function startPeek() {
    if (!collapsed || !window.matchMedia("(min-width: 768px) and (hover: hover)").matches) return;
    if (peekTimer.current !== null) window.clearTimeout(peekTimer.current);
    peekTimer.current = window.setTimeout(() => setPeeking(true), 120);
  }

  function endPeek() {
    if (peekTimer.current !== null) window.clearTimeout(peekTimer.current);
    peekTimer.current = null;
    setPeeking(false);
  }

  function toggleCollapsed() {
    setPeeking(false);
    setCollapsed((v) => {
      try {
        localStorage.setItem("diktomed_sidebar_collapsed", v ? "0" : "1");
      } catch {}
      return !v;
    });
  }

  const title = pageTitleFor(pathname);

  return (
    <div className="app-shell flex h-screen bg-background font-app">
      {mobileOpen && <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setMobileOpen(false)} />}

      <div
        className={[
          "fixed inset-y-0 left-0 z-50 transition-transform duration-300 ease-in-out md:relative md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          collapsed ? "md:w-[68px] md:shrink-0" : "",
        ].join(" ")}
      >
        <div
          onMouseEnter={startPeek}
          onMouseLeave={endPeek}
          className={[
            "h-full",
            collapsed ? "md:absolute md:inset-y-0 md:left-0 md:z-50" : "",
            peeking ? "md:shadow-[12px_0_40px_rgba(0,0,0,0.28)]" : "",
          ].join(" ")}
        >
          <Sidebar
            role={role}
            roleLabel={roleLabel}
            userName={userName}
            organizationName={organizationName}
            collapsed={collapsed && !mobileOpen}
            peeking={peeking}
            onToggleCollapsed={toggleCollapsed}
            onClose={() => setMobileOpen(false)}
          />
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Mobile top bar */}
        <div className="flex items-center gap-3 border-b border-border bg-background px-4 py-3 md:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Atvērt izvēlni"
          >
            <Menu className="h-5 w-5" />
          </button>
          <LogoMark className="h-[22px] w-[22px]" />
          <span className="flex-1 text-sm font-semibold">DiktoMed</span>
        </div>

        {/* Desktop top bar: where you are on the left, controls on the right. */}
        <div className="hidden h-14 shrink-0 items-center justify-between gap-4 border-b border-sidebar-border bg-sidebar px-8 md:flex xl:px-10 dark:border-white/[0.07]">
          <nav aria-label="Atrašanās vieta" className="flex min-w-0 items-center gap-2 text-[14px]">
            <span className="truncate font-display text-[15px] font-medium">{organizationName}</span>
            {title && (
              <>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate rounded-full bg-black/[0.05] px-3 py-1 font-medium dark:bg-white/[0.08]">{title}</span>
              </>
            )}
          </nav>
          <div className="flex shrink-0 items-center gap-2">
            <div id={TOP_BAR_SLOT_ID} className="flex items-center gap-2" />
            {pathname !== "/diktati" && (
              <Link
                href="/diktati#augsupielade"
                className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full bg-[#007AFF] px-4 text-[14px] font-medium text-white transition-colors hover:bg-[#0062CC] dark:bg-[#0A84FF] dark:hover:bg-[#0A74E0]"
              >
                <Upload className="h-4 w-4" />
                Augšupielādēt diktātu
              </Link>
            )}
          </div>
        </div>

        <main className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
          <div className="w-full px-4 py-4 sm:px-8 sm:pb-8 sm:pt-6 xl:px-10">{children}</div>
        </main>
      </div>
    </div>
  );
}
