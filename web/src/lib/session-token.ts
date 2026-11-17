import { SignJWT, jwtVerify } from "jose";

// Shared by the middleware (edge runtime) and the server: no Node-only imports.

export const SESSION_COOKIE = "diktomed_session";

/** One working shift. A shared ward computer must not stay signed in for days. */
export const SESSION_TTL_SECONDS = 60 * 60 * 12;

export type Role = "ADMIN" | "TRANSCRIBER" | "DOCTOR";

export type SessionPayload = {
  userId: string;
  name: string;
  email: string;
  role: Role;
};

const DEV_FALLBACK_SECRET = "dev-only-insecure-secret-change-me-please-min32chars";

function secret(): Uint8Array {
  const configured = process.env.SESSION_SECRET;
  if (!configured && process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is not set. Refusing to sign sessions with the development fallback.");
  }
  if (configured && configured.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters.");
  }
  return new TextEncoder().encode(configured ?? DEV_FALLBACK_SECRET);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret());
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (
      typeof payload.userId !== "string" ||
      typeof payload.name !== "string" ||
      typeof payload.email !== "string" ||
      (payload.role !== "ADMIN" && payload.role !== "TRANSCRIBER" && payload.role !== "DOCTOR")
    ) {
      return null;
    }
    return { userId: payload.userId, name: payload.name, email: payload.email, role: payload.role };
  } catch {
    return null;
  }
}
