"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function addTerm(formData: FormData): Promise<ActionResult> {
  const session = await requireUser();
  const parsed = z.string().trim().min(2).max(80).safeParse(formData.get("term"));
  if (!parsed.success) return { ok: false, error: "Termins: 2-80 rakstzīmes." };
  const text = parsed.data.replace(/\s+/g, " ");
  await prisma.term.upsert({ where: { text }, create: { text }, update: {} });
  await audit("TERM_ADDED", { userId: session.userId, details: { term: text } });
  revalidatePath("/vardnica");
  return { ok: true };
}

export async function removeTerm(input: { id: string }): Promise<ActionResult> {
  const session = await requireUser();
  const parsed = z.string().uuid().safeParse(input.id);
  if (!parsed.success) return { ok: false, error: "Nederīgi dati." };
  const term = await prisma.term.delete({ where: { id: parsed.data } }).catch(() => null);
  if (term) await audit("TERM_REMOVED", { userId: session.userId, details: { term: term.text } });
  revalidatePath("/vardnica");
  return { ok: true };
}

export async function toggleCorrection(input: { id: string; enabled: boolean }): Promise<ActionResult> {
  const session = await requireUser();
  const parsed = z.object({ id: z.string().uuid(), enabled: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Nederīgi dati." };
  await prisma.termCorrection.update({ where: { id: parsed.data.id }, data: { enabled: parsed.data.enabled } });
  await audit("CORRECTION_TOGGLED", { userId: session.userId, details: parsed.data });
  revalidatePath("/vardnica");
  return { ok: true };
}

export async function removeCorrection(input: { id: string }): Promise<ActionResult> {
  const session = await requireUser();
  const parsed = z.string().uuid().safeParse(input.id);
  if (!parsed.success) return { ok: false, error: "Nederīgi dati." };
  await prisma.termCorrection.delete({ where: { id: parsed.data } }).catch(() => null);
  await audit("CORRECTION_REMOVED", { userId: session.userId });
  revalidatePath("/vardnica");
  return { ok: true };
}
