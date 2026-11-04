import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie, getSession, invalidateUserSessions } from "@/lib/auth";
import { logoutRequestAllowed } from "@/lib/logout-csrf";

export async function POST(req: NextRequest) {
  if (!logoutRequestAllowed(req.headers)) return NextResponse.json({ error: "Invalid logout origin" }, { status: 403 });
  const session = await getSession();
  if (session) await invalidateUserSessions(session.userId).catch(() => {});
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
