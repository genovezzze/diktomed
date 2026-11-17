import { NextResponse, type NextRequest } from "next/server";
import { clearSession, getSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (session) await audit("LOGOUT", { userId: session.userId });
  clearSession();
  return NextResponse.redirect(new URL("/login", request.url));
}
