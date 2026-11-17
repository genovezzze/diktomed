import { NextResponse, type NextRequest } from "next/server";
import { clearSession, getSession, revokeSessions } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { SESSION_COOKIE } from "@/lib/session-token";
import { browserUrl } from "@/lib/request-url";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (session) {
    // A copied cookie must not outlive "Iziet".
    await revokeSessions(session.userId);
    await audit("LOGOUT", { userId: session.userId });
  }
  clearSession();
  const res = NextResponse.redirect(browserUrl("/login", request.headers, request.url), 303);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
