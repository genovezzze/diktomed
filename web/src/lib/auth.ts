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

export type CurrentUser = SessionPayload & { mustChangePassword: boolean };

export async function getSession(): Promise<CurrentUser | null> {
  const session = await verifySession(cookies().get(SESSION_COOKIE)?.value);
  if (!session) return null;
  // A deactivated account loses access at once, not when its cookie expires.
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { active: true, role: true, name: true, mustChangePassword: true, sessionVersion: true },
  });
  if (!user || !user.active) return null;
  // Logged out, password changed or reset since this cookie was issued.
  if (user.sessionVersion !== session.sv) return null;
  return { ...session, role: user.role, name: user.name, mustChangePassword: user.mustChangePassword };
}

/**
 * For pages and server actions: the signed-in user, or a redirect to the login
 * page. Someone still on a temporary password is sent to /parole first; only
 * that page passes allowTemporaryPassword.
 */
export async function requireUser(roles?: Role[], opts: { allowTemporaryPassword?: boolean } = {}): Promise<CurrentUser> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.mustChangePassword && !opts.allowTemporaryPassword) redirect("/parole");
  if (roles && !roles.includes(session.role)) redirect("/");
  return session;
}

/** For route handlers: the signed-in user or null (the caller answers 401). */
export async function sessionForApi(roles?: Role[]): Promise<SessionPayload | null> {
  const session = await getSession();
  if (!session || session.mustChangePassword) return null;
  if (roles && !roles.includes(session.role)) return null;
  return session;
}

/**
 * The client's IP for the audit log, or null. Forwarding headers are written
 * by whoever sends the request, so they are believed only when the operator
 * says a trusted reverse proxy sets them (TRUST_PROXY=true): otherwise anyone
 * could fake their IP in the audit log and dodge per-IP login limits.
 */
export function clientIp(): string | null {
  if (process.env.TRUST_PROXY !== "true") return null;
  const h = headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrators",
  TRANSCRIBER: "Diktātu speciālists",
  DOCTOR: "Ārsts",
};

/** Ends every session the user has, on any computer. */
export async function revokeSessions(userId: string): Promise<number> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { sessionVersion: { increment: 1 } },
    select: { sessionVersion: true },
  });
  return user.sessionVersion;
}
