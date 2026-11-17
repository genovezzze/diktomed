"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { extractCorrections } from "@/lib/text-diff";
import { buildDocumentText } from "@/lib/document-text";

export type ActionResult = { ok: true } | { ok: false; error: string };

const id = z.string().uuid();
const LOCKED = "Dokuments jau apstiprināts vai vēl nav gatavs labošanai.";

/** Remembers short replacements so the next dictations can suggest them. */
async function learn(tx: Prisma.TransactionClient, before: string, after: string): Promise<number> {
  const corrections = extractCorrections(before, after);
  for (const c of corrections) {
    await tx.termCorrection.upsert({
      where: { wrong_right: { wrong: c.wrong, right: c.right } },
      create: { wrong: c.wrong, right: c.right },
      update: { count: { increment: 1 } },
    });
  }
  return corrections.length;
}

export async function saveSegment(input: { recordingId: string; segmentId: string; text: string }): Promise<ActionResult> {
  const session = await requireUser();
  const parsed = z
    .object({ recordingId: id, segmentId: id, text: z.string().max(5000) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Nederīgi dati." };
  const { recordingId, segmentId } = parsed.data;
  const text = parsed.data.text.replace(/\s+/g, " ").trim();

  const result = await prisma.$transaction(async (tx) => {
    const segment = await tx.segment.findUnique({
      where: { id: segmentId },
      select: { id: true, idx: true, text: true, recordingId: true, recording: { select: { status: true } } },
    });
    if (!segment || segment.recordingId !== recordingId) return { error: "Fragments nav atrasts." };
    if (segment.recording.status !== "READY") return { error: LOCKED };
    if (segment.text === text) return { learned: 0, idx: segment.idx, unchanged: true };

    await tx.segment.update({ where: { id: segmentId }, data: { text, editedAt: new Date() } });
    await tx.edit.create({
      data: { recordingId, segmentId, userId: session.userId, before: segment.text, after: text },
    });
    // Editing a fragment means a person listened to it: its open flags are done.
    await tx.flag.updateMany({
      where: { segmentId, status: "OPEN" },
      data: { status: "RESOLVED", resolvedById: session.userId, resolvedAt: new Date() },
    });
    const learned = await learn(tx, segment.text, text);
    return { learned, idx: segment.idx, unchanged: false };
  });

  if ("error" in result) return { ok: false, error: result.error ?? "Kļūda." };
  if (!result.unchanged) {
    await audit("SEGMENT_EDITED", {
      userId: session.userId,
      recordingId,
      details: { segment: result.idx, correctionsLearned: result.learned },
    });
  }
  revalidatePath(`/diktati/${recordingId}`);
  return { ok: true };
}

export async function setFlagStatus(input: { flagId: string; status: "OPEN" | "RESOLVED" | "DISMISSED" }): Promise<ActionResult> {
  const session = await requireUser();
  const parsed = z.object({ flagId: id, status: z.enum(["OPEN", "RESOLVED", "DISMISSED"]) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Nederīgi dati." };

  const flag = await prisma.flag.findUnique({
    where: { id: parsed.data.flagId },
    select: { id: true, recordingId: true, recording: { select: { status: true } } },
  });
  if (!flag) return { ok: false, error: "Atzīme nav atrasta." };
  if (flag.recording.status !== "READY") return { ok: false, error: LOCKED };

  const open = parsed.data.status === "OPEN";
  await prisma.flag.update({
    where: { id: flag.id },
    data: {
      status: parsed.data.status,
      resolvedById: open ? null : session.userId,
      resolvedAt: open ? null : new Date(),
    },
  });
  if (!open) {
    await audit(parsed.data.status === "RESOLVED" ? "FLAG_RESOLVED" : "FLAG_DISMISSED", {
      userId: session.userId,
      recordingId: flag.recordingId,
    });
  }
  revalidatePath(`/diktati/${flag.recordingId}`);
  return { ok: true };
}

/** Applies a flag's proposed replacement. Only ever on a person's click. */
export async function acceptSuggestion(input: { flagId: string }): Promise<ActionResult> {
  const session = await requireUser();
  const parsed = z.object({ flagId: id }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Nederīgi dati." };

  const result = await prisma.$transaction(async (tx) => {
    const flag = await tx.flag.findUnique({
      where: { id: parsed.data.flagId },
      include: { segment: true, recording: { select: { status: true } } },
    });
    if (!flag || !flag.segment || !flag.excerpt || flag.suggestion == null) return { error: "Ieteikums nav atrasts." };
    if (flag.recording.status !== "READY") return { error: LOCKED };

    const before = flag.segment.text;
    const at = before.indexOf(flag.excerpt);
    const ci = at >= 0 ? at : before.toLocaleLowerCase("lv").indexOf(flag.excerpt.toLocaleLowerCase("lv"));
    if (ci < 0) return { error: "Teksts šajā vietā jau mainīts. Labojiet to manuāli." };
    const after = (before.slice(0, ci) + flag.suggestion + before.slice(ci + flag.excerpt.length))
      .replace(/\s+/g, " ")
      .replace(/\s+([.,;:!?])/g, "$1")
      .trim();

    await tx.segment.update({ where: { id: flag.segment.id }, data: { text: after, editedAt: new Date() } });
    await tx.edit.create({
      data: {
        recordingId: flag.recordingId,
        segmentId: flag.segment.id,
        userId: session.userId,
        source: "SUGGESTION_ACCEPTED",
        before,
        after,
      },
    });
    await tx.flag.update({
      where: { id: flag.id },
      data: { status: "RESOLVED", resolvedById: session.userId, resolvedAt: new Date() },
    });
    await learn(tx, before, after);
    return { recordingId: flag.recordingId, kind: flag.kind };
  });

  if ("error" in result) return { ok: false, error: result.error ?? "Kļūda." };
  await audit("SUGGESTION_ACCEPTED", { userId: session.userId, recordingId: result.recordingId, details: { kind: result.kind } });
  revalidatePath(`/diktati/${result.recordingId}`);
  return { ok: true };
}

export async function approveRecording(input: { recordingId: string }): Promise<ActionResult> {
  const session = await requireUser();
  const parsed = z.object({ recordingId: id }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Nederīgi dati." };
  const { recordingId } = parsed.data;

  const result = await prisma.$transaction(async (tx) => {
    const recording = await tx.recording.findUnique({
      where: { id: recordingId },
      select: { status: true, segments: { select: { start: true, end: true, text: true } } },
    });
    if (!recording) return { error: "Diktāts nav atrasts." };
    if (recording.status !== "READY") return { error: LOCKED };

    const high = await tx.flag.count({ where: { recordingId, status: "OPEN", severity: "HIGH" } });
    if (high > 0) return { error: `Vispirms pārbaudiet augsta riska vietas (${high}).` };

    const text = buildDocumentText(recording.segments);
    if (!text) return { error: "Dokuments ir tukšs." };

    const now = new Date();
    await tx.document.create({ data: { recordingId, text, approvedById: session.userId, approvedAt: now } });
    await tx.recording.update({
      where: { id: recordingId },
      data: { status: "APPROVED", approvedAt: now, approvedById: session.userId },
    });
    return { ok: true as const };
  });

  if ("error" in result) return { ok: false, error: result.error ?? "Kļūda." };
  await audit("DOCUMENT_APPROVED", { userId: session.userId, recordingId });
  revalidatePath(`/diktati/${recordingId}`);
  revalidatePath("/diktati");
  return { ok: true };
}

export async function requeueRecording(input: { recordingId: string }): Promise<ActionResult> {
  const session = await requireUser();
  const parsed = z.object({ recordingId: id }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Nederīgi dati." };
  const { recordingId } = parsed.data;

  const updated = await prisma.recording.updateMany({
    where: { id: recordingId, status: "FAILED" },
    data: { status: "QUEUED", errorMessage: null },
  });
  if (updated.count === 0) return { ok: false, error: "Atkārtot var tikai neizdevušos apstrādi." };
  await prisma.job.create({ data: { recordingId } });
  await audit("RECORDING_REQUEUED", { userId: session.userId, recordingId });
  revalidatePath(`/diktati/${recordingId}`);
  return { ok: true };
}
