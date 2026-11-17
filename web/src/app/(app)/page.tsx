import Link from "next/link";
import { AlertTriangle, AudioLines, CheckCheck, ChevronRight, Clock, FileText, PenLine } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { StatTile } from "@/components/dashboard/stat-tile";
import { SectionTitle } from "@/components/dashboard/section-title";
import { PeriodPills } from "@/components/dashboard/period-pills";
import { TopBarSlot } from "@/components/layout/top-bar-slot";
import { StatusBadge } from "@/components/recordings/status-badge";
import { AutoRefresh } from "@/components/recordings/auto-refresh";
import { APPLE_CARD_LABEL, APPLE_SEPARATOR, METRIC_SURFACE, TINT_FILL, TINT_TILE } from "@/components/dashboard/apple";
import { EmptyState } from "@/components/ui/empty-state";
import { approvedQuality } from "@/lib/quality";
import { parsePeriod, periodStart } from "@/lib/period";
import { formatClock, formatDateTimeLV, formatMinutes, formatPercent } from "@/lib/format";
import { SEVERITY_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";

export const metadata = { title: "Pārskats" };
export const dynamic = "force-dynamic";

export default async function OverviewPage({ searchParams }: { searchParams: { period?: string } }) {
  await requireUser();
  const period = parsePeriod(searchParams.period);
  const since = periodStart(period);
  const createdFilter = since ? { createdAt: { gte: since } } : {};

  const [inQueue, awaitingReview, approvedCount, audio, openFlags, recent, quality] = await Promise.all([
    prisma.recording.count({ where: { status: { in: ["QUEUED", "PROCESSING"] } } }),
    prisma.recording.count({ where: { status: "READY" } }),
    prisma.recording.count({ where: { status: "APPROVED", ...(since ? { approvedAt: { gte: since } } : {}) } }),
    prisma.recording.aggregate({ where: createdFilter, _sum: { durationSec: true }, _count: true }),
    prisma.flag.groupBy({
      by: ["severity"],
      where: { status: "OPEN", recording: { status: "READY" } },
      _count: { _all: true },
    }),
    prisma.recording.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        title: true,
        status: true,
        durationSec: true,
        createdAt: true,
        _count: { select: { flags: { where: { status: "OPEN" } } } },
      },
    }),
    approvedQuality(since),
  ]);

  const flagsBySeverity = { HIGH: 0, MEDIUM: 0, INFO: 0 } as Record<"HIGH" | "MEDIUM" | "INFO", number>;
  for (const g of openFlags) flagsBySeverity[g.severity] = g._count._all;
  const openTotal = flagsBySeverity.HIGH + flagsBySeverity.MEDIUM + flagsBySeverity.INFO;

  return (
    <div className="mx-auto max-w-[1400px]">
      <TopBarSlot>
        <PeriodPills current={period} basePath="/" />
      </TopBarSlot>
      <AutoRefresh active={inQueue > 0} />

      <SectionTitle>Kopsavilkums</SectionTitle>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile icon={<Clock />} tint="neutral" title="Rindā un apstrādē" value={inQueue} description="Atpazīšana notiek slimnīcas serverī" />
        <StatTile icon={<FileText />} tint="neutral" title="Gaida pārbaudi" value={awaitingReview} description="Melnraksti, kas jāpārbauda" />
        <StatTile icon={<CheckCheck />} tint="neutral" title="Apstiprināti" value={approvedCount} description="Dokumenti periodā" />
        <StatTile
          icon={<AudioLines />}
          tint="neutral"
          title="Audio kopā"
          value={formatMinutes(audio._sum.durationSec ?? 0)}
          description={`${audio._count} diktāti periodā`}
        />
        <StatTile
          icon={<PenLine />}
          tint="neutral"
          title="Labots vārdu"
          value={quality.pooled.referenceWords ? formatPercent(quality.pooled.wer, 1) : "-"}
          description="Cik melnraksta vārdu cilvēkam bija jālabo"
          badge="Modelis"
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className={cn(METRIC_SURFACE, "p-5 lg:col-span-2")}>
          <div className="flex items-center justify-between">
            <div className={cn(APPLE_CARD_LABEL, TINT_TILE.blue)}>
              <AudioLines />
              Pēdējie diktāti
            </div>
            <Link href="/diktati" className="text-[14px] text-[#007AFF] hover:underline dark:text-[#0A84FF]">
              Visi diktāti
            </Link>
          </div>
          {recent.length === 0 ? (
            <EmptyState
              className="mt-4"
              title="Vēl nav neviena diktāta"
              description="Augšupielādējiet pirmo audio ierakstu, un sistēma sagatavos melnrakstu."
            />
          ) : (
            <ul className="mt-3">
              {recent.map((r) => (
                <li key={r.id} className={cn("border-t first:border-t-0", APPLE_SEPARATOR)}>
                  <Link
                    href={`/diktati/${r.id}`}
                    className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-medium">{r.title}</div>
                      <div className="text-[13px] text-muted-foreground">
                        {formatDateTimeLV(r.createdAt)} · {formatClock(r.durationSec)}
                      </div>
                    </div>
                    {r._count.flags > 0 && r.status === "READY" && (
                      <span className="hidden text-[13px] tabular-nums text-muted-foreground sm:inline">
                        {r._count.flags} pārbaudāmas vietas
                      </span>
                    )}
                    <StatusBadge status={r.status} />
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={cn(METRIC_SURFACE, "p-5")}>
          <div className={cn(APPLE_CARD_LABEL, TINT_TILE.orange)}>
            <AlertTriangle />
            Atvērtās pārbaudāmās vietas
          </div>
          <div className="mt-4 font-display text-[32px] font-medium leading-tight tabular-nums">{openTotal}</div>
          <div className="text-[13px] text-muted-foreground">melnrakstos, kas gaida pārbaudi</div>
          <div className="mt-5 space-y-3">
            {(["HIGH", "MEDIUM", "INFO"] as const).map((sev) => {
              const n = flagsBySeverity[sev];
              const tint = sev === "HIGH" ? "red" : sev === "MEDIUM" ? "orange" : "neutral";
              return (
                <div key={sev}>
                  <div className="flex items-center justify-between text-[14px]">
                    <span>{SEVERITY_LABELS[sev]}</span>
                    <span className="tabular-nums text-muted-foreground">{n}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/[0.05] dark:bg-white/[0.08]">
                    <div
                      className={cn("h-full rounded-full", TINT_FILL[tint])}
                      style={{ width: `${openTotal ? Math.max(4, (n / openTotal) * 100) : 0}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-5 text-[13px] leading-snug text-muted-foreground">
            Augsta riska vietas jāpārbauda pirms dokumenta apstiprināšanas.
          </p>
        </section>
      </div>
    </div>
  );
}
