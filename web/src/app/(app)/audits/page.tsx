import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/layout/page-header";
import { APPLE_SEPARATOR, METRIC_SURFACE } from "@/components/dashboard/apple";
import { ChipLinks } from "@/components/dashboard/chip-links";
import { EmptyState } from "@/components/ui/empty-state";
import { AUDIT_LABELS } from "@/lib/labels";
import { formatDateTimeLV } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Audits" };
export const dynamic = "force-dynamic";

const GROUPS: { value: string; label: string; actions?: string[] }[] = [
  { value: "all", label: "Visi" },
  { value: "access", label: "Piekļuve", actions: ["LOGIN", "LOGIN_FAILED", "LOGOUT"] },
  { value: "data", label: "Dati", actions: ["RECORDING_VIEWED", "DOCX_EXPORTED", "RECORDING_UPLOADED", "AUDIO_DELETED"] },
  {
    value: "changes",
    label: "Izmaiņas",
    actions: ["SEGMENT_EDITED", "SUGGESTION_ACCEPTED", "FLAG_RESOLVED", "FLAG_DISMISSED", "DOCUMENT_APPROVED"],
  },
];

export default async function AuditPage({ searchParams }: { searchParams: { group?: string } }) {
  await requireUser(["ADMIN"]);
  const group = GROUPS.find((g) => g.value === searchParams.group) ?? GROUPS[0];

  const rows = await prisma.auditLog.findMany({
    where: group.actions ? { action: { in: group.actions } } : {},
    orderBy: { createdAt: "desc" },
    take: 300,
    include: { user: { select: { name: true } }, recording: { select: { id: true, title: true } } },
  });

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Audits"
        description="Kas, kad un ar kuru diktātu strādāja. Žurnālu pārskata datu aizsardzības speciālists; diktātu teksts šeit netiek glabāts."
        actions={
          <ChipLinks
            label="Notikumu grupa"
            items={GROUPS.map((g) => ({
              label: g.label,
              href: g.value === "all" ? "/audits" : `/audits?group=${g.value}`,
              active: g.value === group.value,
            }))}
          />
        }
      />

      {rows.length === 0 ? (
        <EmptyState title="Žurnāls ir tukšs" />
      ) : (
        <div className={cn(METRIC_SURFACE, "overflow-hidden")}>
          <div className="hidden grid-cols-[170px_200px_minmax(0,1fr)_minmax(0,1fr)_130px] gap-4 px-5 py-3 text-[13px] text-muted-foreground md:grid">
            <span>Laiks</span>
            <span>Lietotājs</span>
            <span>Darbība</span>
            <span>Diktāts</span>
            <span>IP</span>
          </div>
          <ul>
            {rows.map((r) => (
              <li
                key={r.id}
                className={cn(
                  "grid grid-cols-1 gap-x-4 gap-y-0.5 border-t px-5 py-2.5 text-[14px] md:grid-cols-[170px_200px_minmax(0,1fr)_minmax(0,1fr)_130px]",
                  APPLE_SEPARATOR,
                )}
              >
                <span className="tabular-nums text-muted-foreground">{formatDateTimeLV(r.createdAt)}</span>
                <span className="truncate">{r.user?.name ?? <span className="text-muted-foreground">Sistēma</span>}</span>
                <span className={cn("truncate", r.action === "LOGIN_FAILED" && "text-[#FF453A]")}>{AUDIT_LABELS[r.action] ?? r.action}</span>
                <span className="truncate">
                  {r.recording ? (
                    <Link href={`/diktati/${r.recording.id}`} className="text-[#007AFF] hover:underline dark:text-[#0A84FF]">
                      {r.recording.title}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </span>
                <span className="truncate font-mono text-[13px] text-muted-foreground">{r.ip ?? "-"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
