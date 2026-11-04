import { prisma } from "@/lib/prisma";

export const LOGIN_FAILURE_LIMIT = 5;
export const LOGIN_EMAIL_FAILURE_LIMIT = 20;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

type Attempt = { failures: number; windowStartedAt: Date } | null;

export function loginRateLimitStatus(attempt: Attempt, now = new Date()) {
  if (!attempt || now.getTime() - attempt.windowStartedAt.getTime() >= LOGIN_WINDOW_MS) return { limited: false, failures: 0 };
  return { limited: attempt.failures >= LOGIN_FAILURE_LIMIT, failures: attempt.failures };
}

export function loginRateLimitDecision(attempt: Attempt, emailFailures: number, now = new Date()) {
  const status = loginRateLimitStatus(attempt, now);
  return { limited: status.limited || emailFailures >= LOGIN_EMAIL_FAILURE_LIMIT, failures: status.failures, emailFailures };
}

export function loginClientIp(headers: Headers, runningOnVercel = Boolean(process.env.VERCEL)) {
  if (!runningOnVercel) return "untrusted";
  return headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim()
    || headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || headers.get("x-real-ip")?.trim()
    || "unknown";
}

export async function isLoginRateLimited(email: string, ip: string) {
  const now = new Date();
  const [attempt, emailTotal] = await Promise.all([
    prisma.loginRateLimit.findUnique({ where: { email_ip: { email, ip } }, select: { failures: true, windowStartedAt: true } }),
    prisma.loginRateLimit.aggregate({ where: { email, windowStartedAt: { gt: new Date(now.getTime() - LOGIN_WINDOW_MS) } }, _sum: { failures: true } }),
  ]);
  return loginRateLimitDecision(attempt, emailTotal._sum.failures ?? 0, now);
}

export async function recordLoginFailure(email: string, ip: string, now = new Date()) {
  const existing = await prisma.loginRateLimit.findUnique({ where: { email_ip: { email, ip } }, select: { failures: true, windowStartedAt: true } });
  const freshWindow = !existing || now.getTime() - existing.windowStartedAt.getTime() >= LOGIN_WINDOW_MS;
  const attempt = freshWindow
    ? await prisma.loginRateLimit.upsert({
        where: { email_ip: { email, ip } },
        create: { email, ip, failures: 1, windowStartedAt: now },
        update: { failures: 1, windowStartedAt: now },
        select: { failures: true, windowStartedAt: true },
      })
    : await prisma.loginRateLimit.update({
        where: { email_ip: { email, ip } },
        data: { failures: { increment: 1 } },
        select: { failures: true, windowStartedAt: true },
      });
  const emailTotal = await prisma.loginRateLimit.aggregate({
    where: { email, windowStartedAt: { gt: new Date(now.getTime() - LOGIN_WINDOW_MS) } },
    _sum: { failures: true },
  });
  return loginRateLimitDecision(attempt, emailTotal._sum.failures ?? 0, now);
}

export async function clearLoginFailures(email: string, ip: string) {
  await prisma.loginRateLimit.deleteMany({ where: { email, ip } });
}
