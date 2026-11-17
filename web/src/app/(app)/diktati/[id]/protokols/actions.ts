"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { pendingFields } from "@/lib/protocol";

export type ActionResult = { ok: true } | { ok: false; error: string };

const uuid = z.string().uuid();
const LOCKED = "Protokols jau apstiprināts vai vēl nav gatavs.";

/** Loads a field and checks its protocol can still be changed. */
async function editableField(fieldId: string) {
  const field = await prisma.protocolField.findUnique({
    where: { id: fieldId },
    select: { id: true, sectionKey: true, protocol: { select: { status: true, recordingId: true } } },
  });
  if (!field) return { error: "Lauks nav atrasts." } as const;
  if (field.protocol.status !== "READY") return { error: LOCKED } as const;
  return { field } as const;
}

export async function decideField(input: { fieldId: string; decision: "ACCEPTED" | "REJECTED" | "SUGGESTED" }): Promise<ActionResult> {
  const session = await requireUser();
  const parsed = z.object({ fieldId: uuid, decision: z.enum(["ACCEPTED", "REJECTED", "SUGGESTED"]) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Nederīgi dati." };
  const found = await editableField(parsed.data.fieldId);
  if ("error" in found) return { ok: false, error: found.error ?? "Kļūda." };

  await prisma.protocolField.update({
    where: { id: found.field.id },
    data: { status: parsed.data.decision, editedById: session.userId },
  });
  if (parsed.data.decision !== "SUGGESTED") {
    await audit(parsed.data.decision === "ACCEPTED" ? "PROTOCOL_FIELD_ACCEPTED" : "PROTOCOL_FIELD_REJECTED", {
      userId: session.userId,
      recordingId: found.field.protocol.recordingId,
      details: { section: found.field.sectionKey },
    });
  }
  revalidatePath(`/diktati/${found.field.protocol.recordingId}/protokols`);
  return { ok: true };
}

export async function editField(input: { fieldId: string; value: string }): Promise<ActionResult> {
  const session = await requireUser();
  const parsed = z.object({ fieldId: uuid, value: z.string().max(4000) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Nederīgi dati." };
  const found = await editableField(parsed.data.fieldId);
  if ("error" in found) return { ok: false, error: found.error ?? "Kļūda." };

  const value = parsed.data.value.trim();
  await prisma.protocolField.update({
    where: { id: found.field.id },
    // An emptied field is a person saying "not in this dictation".
    data: { value: value || null, status: value ? "EDITED" : "REJECTED", editedById: session.userId },
  });
  await audit("PROTOCOL_FIELD_EDITED", {
    userId: session.userId,
    recordingId: found.field.protocol.recordingId,
    details: { section: found.field.sectionKey },
  });
  revalidatePath(`/diktati/${found.field.protocol.recordingId}/protokols`);
  return { ok: true };
}

export async function approveProtocol(input: { recordingId: string }): Promise<ActionResult> {
  const session = await requireUser();
  const parsed = z.object({ recordingId: uuid }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Nederīgi dati." };
  const { recordingId } = parsed.data;

  const protocol = await prisma.protocol.findUnique({
    where: { recordingId },
    select: { id: true, status: true, fields: { select: { value: true, status: true } } },
  });
  if (!protocol || protocol.status !== "READY") return { ok: false, error: LOCKED };
  const pending = pendingFields(protocol.fields).length;
  if (pending > 0) return { ok: false, error: `Vispirms pārbaudiet visus laukus (atlikuši ${pending}).` };
  if (!protocol.fields.some((f) => f.value && f.status !== "REJECTED")) {
    return { ok: false, error: "Protokolā nav neviena aizpildīta lauka." };
  }

  await prisma.protocol.update({
    where: { id: protocol.id },
    data: { status: "APPROVED", approvedById: session.userId, approvedAt: new Date() },
  });
  await audit("PROTOCOL_APPROVED", { userId: session.userId, recordingId });
  revalidatePath(`/diktati/${recordingId}/protokols`);
  return { ok: true };
}

/** Drafts the protocol again from the approved transcript (not after approval). */
export async function redraftProtocol(input: { recordingId: string }): Promise<ActionResult> {
  const session = await requireUser();
  const parsed = z.object({ recordingId: uuid }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Nederīgi dati." };
  const { recordingId } = parsed.data;

  const recording = await prisma.recording.findUnique({
    where: { id: recordingId },
    select: { status: true, protocol: { select: { status: true } } },
  });
  if (!recording || recording.status !== "APPROVED") return { ok: false, error: "Vispirms apstipriniet transkriptu." };
  if (recording.protocol?.status === "APPROVED") return { ok: false, error: "Apstiprinātu protokolu nevar sagatavot no jauna." };
  if (recording.protocol?.status === "QUEUED" || recording.protocol?.status === "PROCESSING") return { ok: true };

  await prisma.$transaction([
    prisma.protocol.upsert({
      where: { recordingId },
      create: { recordingId },
      update: { status: "QUEUED", errorMessage: null },
    }),
    prisma.job.create({ data: { recordingId, kind: "PROTOCOL" } }),
  ]);
  await audit("PROTOCOL_REQUESTED", { userId: session.userId, recordingId });
  revalidatePath(`/diktati/${recordingId}/protokols`);
  return { ok: true };
}
