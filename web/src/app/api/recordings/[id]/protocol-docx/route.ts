import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sessionForApi } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { buildProtocolDocx } from "@/lib/docx";
import { SIDE_LABELS } from "@/lib/labels";

export const dynamic = "force-dynamic";

/** The structured protocol as Word: rejected fields are left out as "not mentioned". */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const session = await sessionForApi();
  if (!session) return NextResponse.json({ error: "Nepieciešama pieslēgšanās." }, { status: 401 });

  const recording = await prisma.recording.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      title: true,
      plannedSide: true,
      durationSec: true,
      createdAt: true,
      protocol: {
        include: { approvedBy: { select: { name: true } }, fields: { orderBy: { position: "asc" } } },
      },
    },
  });
  const protocol = recording?.protocol;
  if (!recording || !protocol || (protocol.status !== "READY" && protocol.status !== "APPROVED")) {
    return NextResponse.json({ error: "Protokols vēl nav gatavs." }, { status: 404 });
  }

  const buffer = await buildProtocolDocx({
    recordingTitle: recording.title,
    plannedSide: recording.plannedSide ? SIDE_LABELS[recording.plannedSide] : null,
    durationSec: recording.durationSec,
    createdAt: recording.createdAt,
    engine: protocol.engine,
    fields: protocol.fields.map((f) => ({ title: f.title, value: f.status === "REJECTED" ? null : f.value })),
    approval: protocol.status === "APPROVED" && protocol.approvedBy && protocol.approvedAt
      ? { name: protocol.approvedBy.name, at: protocol.approvedAt }
      : null,
  });

  await audit("PROTOCOL_DOCX_EXPORTED", { userId: session.userId, recordingId: recording.id, details: { draft: protocol.status !== "APPROVED" } });

  const safeName = recording.title.replace(/[^\p{L}\p{N} _-]+/gu, "").trim().slice(0, 70) || "protokols";
  const fileName = `${safeName} - protokols${protocol.status === "APPROVED" ? "" : " (melnraksts)"}.docx`;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="protokols.docx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "no-store",
    },
  });
}
