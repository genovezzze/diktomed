"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { clientIp, createSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { clearFailures, isRateLimited, recordFailures } from "@/lib/rate-limit";

const schema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});

// Compared against when the email is unknown, so the answer takes the same
// time either way and does not reveal which accounts exist.
const DUMMY_HASH = bcrypt.hashSync("diktomed-timing-equaliser", 10);

export type LoginResult = { ok: true; mustChangePassword: boolean } | { ok: false; error: string };

const GENERIC_ERROR = "Nepareizs e-pasts vai parole.";

export async function loginAction(formData: FormData): Promise<LoginResult> {
  const parsed = schema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { ok: false, error: GENERIC_ERROR };
  const { email, password } = parsed.data;

  // The account itself is limited whatever IP the request claims; behind a
  // trusted proxy the client's IP is limited as well.
  const ip = clientIp();
  const limitKeys = [`account:${email}`, ...(ip ? [`ip:${ip}`] : [])];
  if (limitKeys.some((k) => isRateLimited(k))) {
    return { ok: false, error: "Pārāk daudz mēģinājumu. Mēģiniet vēlreiz pēc 15 minūtēm." };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !user.active || !valid) {
    recordFailures(limitKeys);
    await audit("LOGIN_FAILED", { userId: user?.id ?? null, details: { email } });
    return { ok: false, error: GENERIC_ERROR };
  }

  clearFailures(`account:${email}`);
  await createSession({ userId: user.id, name: user.name, email: user.email, role: user.role, sv: user.sessionVersion });
  await audit("LOGIN", { userId: user.id });
  return { ok: true, mustChangePassword: user.mustChangePassword };
}
