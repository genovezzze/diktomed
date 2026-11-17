import { BookOpen, Brain, Database } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/layout/page-header";
import { SectionTitle } from "@/components/dashboard/section-title";
import { StatTile } from "@/components/dashboard/stat-tile";
import { APPLE_CARD_LABEL, METRIC_SURFACE, TINT_TILE } from "@/components/dashboard/apple";
import { formatMinutes } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CorrectionsTable, TermsEditor } from "./vocabulary-client";

export const metadata = { title: "Vārdnīca" };
export const dynamic = "force-dynamic";

/** Matches CORRECTION_MIN_COUNT in the worker. */
const MIN_COUNT = Number(process.env.CORRECTION_MIN_COUNT ?? 2);

export default async function VocabularyPage() {
  await requireUser();
  const [terms, corrections, trainable] = await Promise.all([
    prisma.term.findMany({ orderBy: { text: "asc" } }),
    prisma.termCorrection.findMany({ orderBy: [{ count: "desc" }, { updatedAt: "desc" }], take: 300 }),
    prisma.segment.aggregate({
      where: { recording: { status: "APPROVED", audioDeletedAt: null } },
      _count: true,
      _sum: { end: true, start: true },
    }),
  ]);
  const trainableSeconds = Math.max(0, (trainable._sum.end ?? 0) - (trainable._sum.start ?? 0));
  const approvedWithAudio = await prisma.recording.count({ where: { status: "APPROVED", audioDeletedAt: null } });

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Vārdnīca"
        description="Termini palīdz modelim atpazīt medicīnisko leksiku. Sistēma mācās no cilvēku labojumiem, bet tekstu pati nekad nemaina - tikai piedāvā."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className={cn(METRIC_SURFACE, "p-5")}>
          <div className={cn(APPLE_CARD_LABEL, TINT_TILE.blue)}>
            <BookOpen />
            Termini atpazīšanai
          </div>
          <p className="mb-4 mt-2 text-[14px] text-muted-foreground">
            Tiek padoti modelim kā vārdnīcas mājiens (Whisper initial prompt). Pievienojiet vārdus, ko modelis bieži sadzird nepareizi:
            procedūras, instrumentus, medikamentus.
          </p>
          <TermsEditor terms={terms.map((t) => ({ id: t.id, text: t.text }))} />
        </section>

        <section className={cn(METRIC_SURFACE, "p-5")}>
          <div className={cn(APPLE_CARD_LABEL, TINT_TILE.indigo)}>
            <Database />
            Dati modeļa pielāgošanai
          </div>
          <p className="mt-2 text-[14px] text-muted-foreground">
            Apstiprinātie diktāti ir pāri &quot;audio + pareizs teksts&quot;. No tiem slimnīcas serverī var pielāgot (fine-tune)
            atpazīšanas modeli. Dati neatstāj slimnīcu.
          </p>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <StatTile icon={<Database />} tint="neutral" title="Diktāti" value={approvedWithAudio} />
            <StatTile icon={<Database />} tint="neutral" title="Fragmenti" value={trainable._count} />
            <StatTile icon={<Database />} tint="neutral" title="Audio" value={formatMinutes(trainableSeconds)} />
          </div>
          <pre className="mt-4 overflow-x-auto rounded-xl bg-black/[0.04] p-3 font-mono text-[12px] leading-relaxed text-muted-foreground dark:bg-white/[0.05]">
{`# slimnīcas serverī, worker konteinerā
python -m training.export_dataset --out /data/training
python -m training.evaluate --manifest /data/training/test.jsonl
python -m training.finetune_whisper --train /data/training/train.jsonl`}
          </pre>
        </section>
      </div>

      <SectionTitle>Iemācītie labojumi</SectionTitle>
      <section className={cn(METRIC_SURFACE, "p-5")}>
        <div className={cn(APPLE_CARD_LABEL, TINT_TILE.green)}>
          <Brain />
          Ko cilvēki labo visbiežāk
        </div>
        <p className="mb-4 mt-2 text-[14px] text-muted-foreground">
          Kad tas pats labojums atkārtojas vismaz {MIN_COUNT} reizes, jaunajos diktātos sistēma to izceļ kā ieteikumu. Pieņemt vai noraidīt
          vienmēr izlemj cilvēks.
        </p>
        <CorrectionsTable
          minCount={MIN_COUNT}
          rows={corrections.map((c) => ({ id: c.id, wrong: c.wrong, right: c.right, count: c.count, enabled: c.enabled }))}
        />
      </section>
    </div>
  );
}
