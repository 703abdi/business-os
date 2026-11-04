import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { canAccessPath } from "@/lib/access";

// Everything needs a signed-in session except login, the public lead-capture
// pages, and machine endpoints that check their own secret or signature.
const SESSION_COOKIE = "jl_session";

function isPublic(path: string) {
  return (
    path === "/login" ||
    path.startsWith("/api/auth/login") ||
    path.startsWith("/api/auth/logout") ||
    path === "/embed.js" ||
    path === "/robots.txt" ||
    path === "/apply" ||
    path.startsWith("/apply/") || // public forms (LeadFlow)
    path.startsWith("/api/apply/") ||
    path.startsWith("/u/") || // unsubscribe links (signed)
    path.startsWith("/p/") || // public pages (drafts 404 unless previewed by an admin)
    path.startsWith("/api/p/") ||
    path === "/api/cron/automations" || // checks CRON_SECRET itself
    path === "/api/cron/daily" || // checks CRON_SECRET itself
    path === "/api/calendly/webhook" || // signature-checked
    path === "/api/whop/webhook" || // signature-checked
    path === "/api/acuity/webhook" || // checks ACUITY_WEBHOOK_SECRET itself
    path === "/api/leads/inbound" || // checks LEADS_WEBHOOK_SECRET itself
    path === "/api/content/scheduled" || // checks CONTENT_API_TOKEN itself
    path.startsWith("/api/content/posts/")
  );
}

async function session(token: string | undefined): Promise<{ role: "ADMIN" | "EMPLOYEE" } | null> {
  const secret = process.env.AUTH_SECRET;
  if (!token || !secret) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    return payload.role === "ADMIN" || payload.role === "EMPLOYEE" ? { role: payload.role } : null;
  } catch {
    return null;
  }
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const auth = await session(req.cookies.get(SESSION_COOKIE)?.value);
  const valid = !!auth;

  // Login validates its cookie against the database. Redirecting here based on
  // JWT claims alone causes a loop after an admin deactivates a user.
  if (pathname === "/login") return NextResponse.next();
  if (isPublic(pathname)) return NextResponse.next();
  if (valid && !canAccessPath(auth!.role, pathname)) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.redirect(new URL("/today", req.url));
  }
  if (valid) return NextResponse.next();

  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
