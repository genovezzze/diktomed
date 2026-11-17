"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { temporaryPassword } from "@/lib/password";

export type UserActionResult = { ok: true; password?: string } | { ok: false; error: string };

const role = z.enum(["ADMIN", "TRANSCRIBER", "DOCTOR"]);

/** The last active administrator cannot be switched off or demoted. */
async function wouldRemoveLastAdmin(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, active: true } });
  if (!user || user.role !== "ADMIN" || !user.active) return false;
  return (await prisma.user.count({ where: { role: "ADMIN", active: true } })) <= 1;
}

export async function createUser(input: { name: string; email: string; role: string }): Promise<UserActionResult> {
  const admin = await requireUser(["ADMIN"]);
  const parsed = z
    .object({ name: z.string().trim().min(2).max(120), email: z.string().trim().toLowerCase().email().max(200), role })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Pārbaudiet vārdu un e-pastu." };

  const password = temporaryPassword();
  try {
    const user = await prisma.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        role: parsed.data.role,
        passwordHash: await bcrypt.hash(password, 12),
        mustChangePassword: true,
      },
    });
    await audit("USER_CREATED", { userId: admin.userId, details: { user: user.id, role: user.role } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: "Lietotājs ar šo e-pastu jau ir." };
    }
    throw e;
  }
  revalidatePath("/lietotaji");
  return { ok: true, password };
}

export async function resetPassword(input: { userId: string }): Promise<UserActionResult> {
  const admin = await requireUser(["ADMIN"]);
  const parsed = z.string().uuid().safeParse(input.userId);
  if (!parsed.success) return { ok: false, error: "Nederīgi dati." };
  const password = temporaryPassword();
  await prisma.user.update({
    where: { id: parsed.data },
    data: { passwordHash: await bcrypt.hash(password, 12), mustChangePassword: true, sessionVersion: { increment: 1 } },
  });
  await audit("PASSWORD_RESET", { userId: admin.userId, details: { user: parsed.data } });
  revalidatePath("/lietotaji");
  return { ok: true, password };
}

export async function setActive(input: { userId: string; active: boolean }): Promise<UserActionResult> {
  const admin = await requireUser(["ADMIN"]);
  const parsed = z.object({ userId: z.string().uuid(), active: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Nederīgi dati." };
  if (parsed.data.userId === admin.userId) return { ok: false, error: "Sevi atslēgt nevar." };
  if (!parsed.data.active && (await wouldRemoveLastAdmin(parsed.data.userId))) {
    return { ok: false, error: "Jāpaliek vismaz vienam aktīvam administratoram." };
  }
  await prisma.user.update({
    where: { id: parsed.data.userId },
    data: { active: parsed.data.active, ...(parsed.data.active ? {} : { sessionVersion: { increment: 1 } }) },
  });
  await audit(parsed.data.active ? "USER_ACTIVATED" : "USER_DEACTIVATED", { userId: admin.userId, details: { user: parsed.data.userId } });
  revalidatePath("/lietotaji");
  return { ok: true };
}

export async function setRole(input: { userId: string; role: string }): Promise<UserActionResult> {
  const admin = await requireUser(["ADMIN"]);
  const parsed = z.object({ userId: z.string().uuid(), role }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Nederīgi dati." };
  if (parsed.data.userId === admin.userId) return { ok: false, error: "Savu lomu mainīt nevar." };
  if (parsed.data.role !== "ADMIN" && (await wouldRemoveLastAdmin(parsed.data.userId))) {
    return { ok: false, error: "Jāpaliek vismaz vienam aktīvam administratoram." };
  }
  await prisma.user.update({ where: { id: parsed.data.userId }, data: { role: parsed.data.role } });
  await audit("USER_ROLE_CHANGED", { userId: admin.userId, details: { user: parsed.data.userId, role: parsed.data.role } });
  revalidatePath("/lietotaji");
  return { ok: true };
}
