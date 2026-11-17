import Link from "next/link";
import type { Prisma, RecordingStatus } from "@prisma/client";
import { ChevronRight } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/layout/page-header";
import { UploadCard } from "@/components/recordings/upload-card";
import { StatusBadge } from "@/components/recordings/status-badge";
import { AutoRefresh } from "@/components/recordings/auto-refresh";
import { ChipLinks } from "@/components/dashboard/chip-links";
import { APPLE_SEPARATOR, METRIC_SURFACE } from "@/components/dashboard/apple";
import { EmptyState } from "@/components/ui/empty-state";
import { maxUploadBytes } from "@/lib/storage";
import { formatClock, formatDateTimeLV } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Diktāti" };
export const dynamic = "force-dynamic";

const FILTERS: { value: string; label: string; statuses?: RecordingStatus[] }[] = [
  { value: "all", label: "Visi" },
  { value: "queue", label: "Rindā", statuses: ["QUEUED", "PROCESSING"] },
  { value: "review", label: "Gaida pārbaudi", statuses: ["READY"] },
  { value: "approved", label: "Apstiprināti", statuses: ["APPROVED"] },
  { value: "failed", label: "Kļūdas", statuses: ["FAILED"] },
];

export default async function RecordingsPage({ searchParams }: { searchParams: { status?: string } }) {
  await requireUser();
  const filter = FILTERS.find((f) => f.value === searchParams.status) ?? FILTERS[0];
  const where: Prisma.RecordingWhereInput = filter.statuses ? { status: { in: filter.statuses } } : {};

  const [recordings, counts] = await Promise.all([
    prisma.recording.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        title: true,
        originalName: true,
        status: true,
        durationSec: true,
        createdAt: true,
        uploadedBy: { select: { name: true } },
        flags: { where: { status: "OPEN" }, select: { severity: true } },
      },
    }),
    prisma.recording.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const countFor = (statuses?: RecordingStatus[]) =>
    counts.filter((c) => !statuses || statuses.includes(c.status)).reduce((s, c) => s + c._count._all, 0);
  const pending = recordings.some((r) => r.status === "QUEUED" || r.status === "PROCESSING");

  return (
    <div className="mx-auto max-w-[1400px]">
      <AutoRefresh active={pending} />
      <PageHeader
        title="Diktāti"
        description="Augšupielādējiet ārsta diktātu. Sistēma izveido melnrakstu un izceļ vietas, kas jāpārbauda cilvēkam."
      />

      <UploadCard maxBytes={maxUploadBytes()} />

      <div className="mb-4 mt-9 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-[20px] font-bold tracking-tight">Visi diktāti</h2>
        <ChipLinks
          label="Filtrs pēc statusa"
          items={FILTERS.map((f) => ({
            label: f.label,
            href: f.value === "all" ? "/diktati" : `/diktati?status=${f.value}`,
            active: f.value === filter.value,
            count: countFor(f.statuses),
          }))}
        />
      </div>

      {recordings.length === 0 ? (
        <EmptyState title="Šeit nekā nav" description="Šim filtram neatbilst neviens diktāts." />
      ) : (
        <div className={cn(METRIC_SURFACE, "overflow-hidden")}>
          <div className="hidden grid-cols-[minmax(0,1fr)_90px_150px_170px_190px_24px] gap-4 px-5 py-3 text-[13px] text-muted-foreground md:grid">
            <span>Nosaukums</span>
            <span>Ilgums</span>
            <span>Statuss</span>
            <span>Pārbaudāmās vietas</span>
            <span>Augšupielādēts</span>
            <span />
          </div>
          <ul>
            {recordings.map((r) => {
              const high = r.flags.filter((f) => f.severity === "HIGH").length;
              return (
                <li key={r.id} className={cn("border-t", APPLE_SEPARATOR)}>
                  <Link
                    href={`/diktati/${r.id}`}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-5 py-3.5 transition-colors hover:bg-black/[0.02] md:grid-cols-[minmax(0,1fr)_90px_150px_170px_190px_24px] dark:hover:bg-white/[0.03]"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[15px] font-medium">{r.title}</div>
                      <div className="truncate text-[13px] text-muted-foreground">{r.originalName}</div>
                    </div>
                    <span className="hidden tabular-nums text-[14px] md:block">{formatClock(r.durationSec)}</span>
                    <span>
                      <StatusBadge status={r.status} />
                    </span>
                    <span className="hidden text-[14px] tabular-nums md:block">
                      {r.status === "READY" || r.status === "APPROVED" ? (
                        r.flags.length === 0 ? (
                          <span className="text-muted-foreground">Nav atvērtu</span>
                        ) : (
                          <>
                            {r.flags.length} atvērtas
                            {high > 0 && <span className="ml-1.5 text-[#FF453A]">· {high} augsts</span>}
                          </>
                        )
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </span>
                    <span className="hidden text-[13px] text-muted-foreground md:block">
                      {formatDateTimeLV(r.createdAt)}
                      <br />
                      {r.uploadedBy.name}
                    </span>
                    <ChevronRight className="hidden h-4 w-4 text-muted-foreground md:block" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
