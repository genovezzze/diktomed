import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  signSession,
  verifySession,
  type Role,
  type SessionPayload,
} from "@/lib/session-token";

export type { Role, SessionPayload };

export async function createSession(payload: SessionPayload) {
  const token = await signSession(payload);
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    // Hospital LANs often run plain HTTP at first; COOKIE_SECURE=true once TLS is in place.
    secure: process.env.COOKIE_SECURE === "true",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSession() {
  cookies().delete(SESSION_COOKIE);
}

export async function getSession(): Promise<SessionPayload | null> {
  const session = await verifySession(cookies().get(SESSION_COOKIE)?.value);
  if (!session) return null;
  // A deactivated account loses access at once, not when its cookie expires.
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { active: true, role: true, name: true },
  });
  if (!user || !user.active) return null;
  return { ...session, role: user.role, name: user.name };
}

/** For pages and server actions: the signed-in user, or a redirect to the login page. */
export async function requireUser(roles?: Role[]): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (roles && !roles.includes(session.role)) redirect("/");
  return session;
}

/** For route handlers: the signed-in user or null (the caller answers 401). */
export async function sessionForApi(roles?: Role[]): Promise<SessionPayload | null> {
  const session = await getSession();
  if (!session) return null;
  if (roles && !roles.includes(session.role)) return null;
  return session;
}

export function clientIp(): string | null {
  const h = headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrators",
  TRANSCRIBER: "Diktātu speciālists",
  DOCTOR: "Ārsts",
};
