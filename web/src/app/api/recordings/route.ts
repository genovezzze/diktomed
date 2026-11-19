import path from "node:path";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { NextResponse } from "next/server";
import type { DocumentKind, Side } from "@prisma/client";
import { prisma } from "@/lib/db";
import { sessionForApi } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { ALLOWED_EXTENSIONS, ensureDir, maxUploadBytes, recordingDir } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Upload a dictation: the file goes to local disk, a job goes to the queue. */
export async function POST(request: Request) {
  const session = await sessionForApi();
  if (!session) return NextResponse.json({ error: "Nepieciešama pieslēgšanās." }, { status: 401 });

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > maxUploadBytes() + 1024 * 1024) {
    return NextResponse.json({ error: "Fails ir pārāk liels." }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Nederīgs pieprasījums." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Izvēlieties audio failu." }, { status: 400 });
  }
  if (file.size > maxUploadBytes()) {
    return NextResponse.json({ error: "Fails ir pārāk liels." }, { status: 413 });
  }

  const ext = path.extname(file.name).toLowerCase();
  if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
    return NextResponse.json({ error: "Šis faila formāts netiek atbalstīts." }, { status: 415 });
  }

  const rawSide = String(form.get("plannedSide") ?? "");
  const plannedSide: Side | null = rawSide === "LEFT" || rawSide === "RIGHT" || rawSide === "BOTH" ? rawSide : null;

  const documentKind: DocumentKind = String(form.get("documentKind") ?? "") === "EPICRISIS" ? "EPICRISIS" : "OPERATION";

  const rawTitle = String(form.get("title") ?? "").trim().slice(0, 200);
  const originalName = path.basename(file.name).slice(0, 255);
  const title = rawTitle || originalName.replace(/\.[^.]+$/, "");

  // The directory name is random, never derived from the file name.
  const storageKey = path.join("recordings", randomUUID());
  const dir = recordingDir(storageKey);
  await ensureDir(dir);
  await fs.writeFile(path.join(dir, `original${ext}`), Buffer.from(await file.arrayBuffer()), { mode: 0o640 });

  const recording = await prisma.$transaction(async (tx) => {
    const rec = await tx.recording.create({
      data: {
        title,
        originalName,
        storageKey,
        mimeType: file.type || null,
        sizeBytes: file.size,
        plannedSide,
        documentKind,
        uploadedById: session.userId,
      },
    });
    await tx.job.create({ data: { recordingId: rec.id } });
    return rec;
  });

  await audit("RECORDING_UPLOADED", {
    userId: session.userId,
    recordingId: recording.id,
    details: { sizeBytes: file.size, extension: ext, plannedSide, documentKind },
  });

  return NextResponse.json({ id: recording.id }, { status: 201 });
}
