import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sessionForApi } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { buildDocx } from "@/lib/docx";
import { buildParagraphs } from "@/lib/document-text";

export const dynamic = "force-dynamic";

/** The approved document, or a clearly marked draft before approval. */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const session = await sessionForApi();
  if (!session) return NextResponse.json({ error: "Nepieciešama pieslēgšanās." }, { status: 401 });

  const recording = await prisma.recording.findUnique({
    where: { id: params.id },
    include: {
      segments: { orderBy: { idx: "asc" }, select: { start: true, end: true, text: true } },
      document: { include: { approvedBy: { select: { name: true } } } },
    },
  });
  if (!recording || recording.status === "QUEUED" || recording.status === "PROCESSING") {
    return NextResponse.json({ error: "Dokuments vēl nav gatavs." }, { status: 404 });
  }

  const paragraphs = recording.document
    ? recording.document.text.split(/\n{2,}/)
    : buildParagraphs(recording.segments);

  const buffer = await buildDocx({
    title: recording.title,
    originalName: recording.originalName,
    durationSec: recording.durationSec,
    createdAt: recording.createdAt,
    paragraphs,
    approval: recording.document
      ? { name: recording.document.approvedBy.name, at: recording.document.approvedAt }
      : null,
  });

  await audit("DOCX_EXPORTED", {
    userId: session.userId,
    recordingId: recording.id,
    details: { draft: !recording.document },
  });

  const safeName = recording.title.replace(/[^\p{L}\p{N} _-]+/gu, "").trim().slice(0, 80) || "diktats";
  const fileName = `${safeName}${recording.document ? "" : " (melnraksts)"}.docx`;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="diktats.docx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "no-store",
    },
  });
}
