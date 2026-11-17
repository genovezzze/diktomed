import { AudioLines, BarChart2, BookOpen, LayoutDashboard, ShieldCheck, type LucideIcon } from "lucide-react";
import type { Role } from "@/lib/session-token";

export type NavItem = { href: string; label: string; icon: LucideIcon; roles?: Role[] };

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Pārskats", icon: LayoutDashboard },
  { href: "/diktati", label: "Diktāti", icon: AudioLines },
  { href: "/vardnica", label: "Vārdnīca", icon: BookOpen },
  { href: "/kvalitate", label: "Kvalitāte", icon: BarChart2 },
  { href: "/audits", label: "Audits", icon: ShieldCheck, roles: ["ADMIN"] },
];

export function isActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

/** The current page's name for the top bar. */
export function pageTitleFor(pathname: string): string {
  if (/^\/diktati\/[^/]+$/.test(pathname)) return "Pārbaude";
  const item = NAV_ITEMS.find((i) => isActive(i.href, pathname));
  return item?.label ?? "";
}
