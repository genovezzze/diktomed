"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createSession, requireUser } from "@/lib/auth";
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

  // A new password ends every other session; this browser gets a fresh one.
  const updated = await prisma.user.update({
    where: { id: session.userId },
    data: { passwordHash: await bcrypt.hash(next, 12), mustChangePassword: false, sessionVersion: { increment: 1 } },
    select: { sessionVersion: true },
  });
  await createSession({ userId: session.userId, name: session.name, email: session.email, role: session.role, sv: updated.sessionVersion });
  await audit("PASSWORD_CHANGED", { userId: session.userId });
  return { ok: true };
}
