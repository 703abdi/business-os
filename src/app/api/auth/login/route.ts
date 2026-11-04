import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSessionToken, setSessionCookie, verifyPassword } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { timingSafeEqual } from "crypto";
import { z } from "zod";
import { canBootstrapAdmin } from "@/lib/admin-bootstrap";
import { clearLoginFailures, isLoginRateLimited, loginClientIp, recordLoginFailure } from "@/lib/login-rate-limit";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 400 });
  }

  const { password } = parsed.data;
  const email = parsed.data.email.toLowerCase();
  const ip = loginClientIp(req.headers);
  if ((await isLoginRateLimited(email, ip)).limited) {
    return NextResponse.json({ error: "Too many sign-in attempts. Please wait 15 minutes and try again." }, { status: 429 });
  }
  const user =
    (await prisma.user.findUnique({ where: { email } })) ??
    (await createFirstUser(email, password));

  if (!user || !user.active) {
    return loginFailed(email, ip);
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return loginFailed(email, ip);
  }

  await clearLoginFailures(email, ip);
  const token = await createSessionToken({ userId: user.id, email: user.email, role: user.role, teamMemberId: user.teamMemberId, sessionVersion: user.sessionVersion });
  await setSessionCookie(token);

  return NextResponse.json({ ok: true });
}

async function loginFailed(email: string, ip: string) {
  const rate = await recordLoginFailure(email, ip);
  if (rate.limited) return NextResponse.json({ error: "Too many sign-in attempts. Please wait 15 minutes and try again." }, { status: 429 });
  return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
}

function safeEqual(a: string, b: string) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

// A configured owner can still bootstrap after sample employees are seeded.
// An existing account at ADMIN_EMAIL is never elevated or overwritten here.
async function createFirstUser(email: string, password: string) {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) return null;
  const normalizedEmail = email.toLowerCase();
  const [existingUser, activeAdminCount] = await Promise.all([
    prisma.user.findUnique({ where: { email: normalizedEmail }, select: { role: true, active: true } }),
    prisma.user.count({ where: { role: "ADMIN", active: true } }),
  ]);
  if (!canBootstrapAdmin({
    emailMatches: safeEqual(normalizedEmail, adminEmail),
    passwordMatches: safeEqual(password, adminPassword),
    activeAdminCount,
    existingUser,
  })) return null;
  return prisma.user.create({
    data: {
      email: adminEmail,
      passwordHash: await bcrypt.hash(adminPassword, 12),
      name: process.env.OWNER_NAME?.trim() || null,
      role: "ADMIN",
    },
  });
}
