import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

// One login for the whole OS (from the Abdi OS template): a signed JWT in an
// httpOnly cookie. The first sign-in matching ADMIN_EMAIL / ADMIN_PASSWORD
// creates the account (src/app/api/auth/login/route.ts).

export const SESSION_COOKIE_NAME = "jl_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getSecretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("AUTH_SECRET is not set or too short. Set a strong random value (openssl rand -hex 32).");
  }
  return new TextEncoder().encode(secret);
}

export type UserRole = "ADMIN" | "EMPLOYEE";
export type SessionPayload = { userId: string; email: string; role: UserRole; teamMemberId?: string | null; sessionVersion: number };

export async function createSessionToken(payload: SessionPayload) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (typeof payload.userId === "string" && typeof payload.email === "string" && typeof payload.sessionVersion === "number" && (payload.role === "ADMIN" || payload.role === "EMPLOYEE")) {
      return { userId: payload.userId, email: payload.email, role: payload.role, teamMemberId: typeof payload.teamMemberId === "string" ? payload.teamMemberId : null, sessionVersion: payload.sessionVersion };
    }
    return null;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function setSessionCookie(token: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
}

/** Invalidates every token currently issued for this user. */
export async function invalidateUserSessions(userId: string) {
  await prisma.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

/** True only for a current, active admin. Cookie claims are never enough. */
export async function isAdmin(): Promise<boolean> {
  const session = await getSession();
  if (!session) return false;
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { active: true, role: true, sessionVersion: true } });
  return !!user && user.active && user.role === "ADMIN" && user.sessionVersion === session.sessionVersion;
}

/** Looks up the currently active user. Never rely on the proxy alone for authorization. */
export async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/login");
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { id: true, email: true, name: true, role: true, teamMemberId: true, active: true, sessionVersion: true } });
  if (!user || !user.active || user.sessionVersion !== session.sessionVersion) redirect("/login?message=session-expired");
  return user;
}

/** Page/layout/action guard. */
export async function requireRole(...roles: UserRole[]) {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/today");
  return user;
}

export async function requireAdmin() {
  return requireRole("ADMIN");
}
