"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { passwordProblem } from "@/lib/password";

export type ChangeResult = { ok: true } | { ok: false; error: string };

export async function changePassword(formData: FormData): Promise<ChangeResult> {
  const session = await requireUser(undefined, { allowTemporaryPassword: true });
  const parsed = z
    .object({ current: z.string().min(1).max(200), next: z.string().max(200), repeat: z.string().max(200) })
    .safeParse({ current: formData.get("current"), next: formData.get("next"), repeat: formData.get("repeat") });
  if (!parsed.success) return { ok: false, error: "Aizpildiet visus laukus." };
  const { current, next, repeat } = parsed.data;

  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { passwordHash: true } });
  if (!user || !(await bcrypt.compare(current, user.passwordHash))) return { ok: false, error: "Pašreizējā parole nav pareiza." };
  if (next !== repeat) return { ok: false, error: "Jaunās paroles nesakrīt." };
  if (next === current) return { ok: false, error: "Jaunajai parolei jāatšķiras no pašreizējās." };
  const problem = passwordProblem(next);
  if (problem) return { ok: false, error: problem };

  await prisma.user.update({
    where: { id: session.userId },
    data: { passwordHash: await bcrypt.hash(next, 12), mustChangePassword: false },
  });
  await audit("PASSWORD_CHANGED", { userId: session.userId });
  return { ok: true };
}
