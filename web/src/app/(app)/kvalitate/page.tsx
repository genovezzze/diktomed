import Link from "next/link";
import { CheckCheck, Gauge, PenLine, Timer } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { approvedQuality } from "@/lib/quality";
import { parsePeriod, periodStart } from "@/lib/period";
import { PageHeader } from "@/components/layout/page-header";
import { TopBarSlot } from "@/components/layout/top-bar-slot";
import { PeriodPills } from "@/components/dashboard/period-pills";
import { SectionTitle } from "@/components/dashboard/section-title";
import { StatTile } from "@/components/dashboard/stat-tile";
import { APPLE_SEPARATOR, METRIC_SURFACE, TINT_FILL } from "@/components/dashboard/apple";
import { EmptyState } from "@/components/ui/empty-state";
import { formatClock, formatDateLV, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Kvalitāte" };
export const dynamic = "force-dynamic";

export default async function QualityPage({ searchParams }: { searchParams: { period?: string } }) {
  await requireUser();
  const period = parsePeriod(searchParams.period);
  const { rows, pooled } = await approvedQuality(periodStart(period));

  const audioSeconds = rows.reduce((s, r) => s + (r.durationSec ?? 0), 0);
  const withTiming = rows.filter((r) => r.processingSec != null && r.durationSec);
  const speed = withTiming.length
    ? withTiming.reduce((s, r) => s + (r.processingSec ?? 0), 0) / withTiming.reduce((s, r) => s + (r.durationSec ?? 0), 0)
    : null;
  const flagsPerDoc = rows.length ? rows.reduce((s, r) => s + r.flags, 0) / rows.length : null;

  return (
    <div className="mx-auto max-w-[1400px]">
      <TopBarSlot>
        <PeriodPills current={period} basePath="/kvalitate" />
      </TopBarSlot>
      <PageHeader
        title="Kvalitāte"
        description="Cik daudz no MI melnraksta cilvēkam bija jālabo. Mērījums raksturo modeli un audio kvalitāti, nevis darbiniekus."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={<PenLine />}
          tint="neutral"
          title="Labots vārdu (WER)"
          value={pooled.referenceWords ? formatPercent(pooled.wer, 1) : "-"}
          description={`${pooled.edits} labojumi uz ${pooled.referenceWords} vārdiem`}
        />
        <StatTile icon={<CheckCheck />} tint="neutral" title="Apstiprināti diktāti" value={rows.length} description={`${formatClock(audioSeconds)} audio`} />
        <StatTile
          icon={<Timer />}
          tint="neutral"
          title="Apstrādes ātrums"
          value={speed != null ? `${speed.toFixed(2)}×` : "-"}
          description="Apstrādes laiks pret audio garumu"
        />
        <StatTile
          icon={<Gauge />}
          tint="neutral"
          title="Pārbaudāmās vietas"
          value={flagsPerDoc != null ? flagsPerDoc.toFixed(1) : "-"}
          description="Vidēji uz vienu diktātu"
        />
      </div>

      <section className={cn(METRIC_SURFACE, "mt-4 p-5 text-[14px] leading-relaxed text-muted-foreground")}>
        <span className="font-medium text-foreground">Kā lasīt:</span> ja labots ir mazāk par ~10-15% vārdu, labošana parasti ir ātrāka par
        pārrakstīšanu no nulles. Ja vairāk par ~25%, vispirms jāuzlabo modelis: jāpievieno termini vārdnīcā vai jāpielāgo modelis uz
        slimnīcas datiem.
      </section>

      <SectionTitle>Pa diktātiem</SectionTitle>
      {rows.length === 0 ? (
        <EmptyState title="Vēl nav apstiprinātu diktātu" description="Kvalitāti var izmērīt tikai pēc tam, kad cilvēks apstiprina dokumentu." />
      ) : (
        <div className={cn(METRIC_SURFACE, "overflow-hidden")}>
          <div className="hidden grid-cols-[minmax(0,1fr)_110px_90px_90px_220px] gap-4 px-5 py-3 text-[13px] text-muted-foreground md:grid">
            <span>Diktāts</span>
            <span>Apstiprināts</span>
            <span className="text-right">Vārdi</span>
            <span className="text-right">Vietas</span>
            <span>Labots vārdu</span>
          </div>
          <ul>
            {rows.map((r) => (
              <li key={r.id} className={cn("border-t", APPLE_SEPARATOR)}>
                <Link
                  href={`/diktati/${r.id}`}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-3 transition-colors hover:bg-black/[0.02] md:grid-cols-[minmax(0,1fr)_110px_90px_90px_220px] dark:hover:bg-white/[0.03]"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-medium">{r.title}</div>
                    <div className="truncate text-[13px] text-muted-foreground">
                      {formatClock(r.durationSec)}
                      {r.modelName ? ` · ${r.modelName}` : ""}
                    </div>
                  </div>
                  <span className="hidden text-[14px] text-muted-foreground md:block">{formatDateLV(r.approvedAt)}</span>
                  <span className="hidden text-right text-[14px] tabular-nums md:block">{r.referenceWords}</span>
                  <span className="hidden text-right text-[14px] tabular-nums md:block">{r.flags}</span>
                  <div className="flex items-center gap-3">
                    <div className="hidden h-1.5 flex-1 overflow-hidden rounded-full bg-black/[0.05] sm:block dark:bg-white/[0.08]">
                      <div className={cn("h-full rounded-full", TINT_FILL.neutral)} style={{ width: `${Math.min(100, r.wer * 100)}%` }} />
                    </div>
                    <span className="w-14 text-right text-[14px] tabular-nums">{formatPercent(r.wer, 1)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
