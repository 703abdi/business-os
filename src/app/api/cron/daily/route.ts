// Vercel Cron daily operating brief. Vercel supplies CRON_SECRET as a Bearer
// token; local callers can use the same header for a smoke test.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { BRAND } from "@/config/brand";
import { addDays, fmtDay, startOfDay } from "@/lib/dates";
import { defaultAlertTo, emailConfigured, sendEmail } from "@/lib/notify";
import { revenueBetween } from "@/modules/revenue/data";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new NextResponse(null, { status: 404 });
  const now = new Date(); const today = startOfDay(now); const tomorrow = addDays(today, 1);
  const [jobs, unreplied, followUps, unconfirmed, revenue] = await Promise.all([
    prisma.job.findMany({ where: { startAt: { gte: today, lt: tomorrow }, status: { notIn: ["CANCELED", "NO_SHOW"] } }, orderBy: { startAt: "asc" }, include: { client: true, service: true, assignee: true } }),
    prisma.client.count({ where: { stage: "NEW", firstReplyAt: null } }),
    prisma.followUp.count({ where: { doneAt: null, dueAt: { lte: tomorrow } } }),
    prisma.job.count({ where: { startAt: { gte: today, lt: tomorrow }, status: "SCHEDULED" } }),
    revenueBetween(today, tomorrow),
  ]);
  const dashboard = process.env.APP_URL || "";
  const lines = jobs.map((j) => `- ${fmtDay(j.startAt)}: ${j.client.name} — ${j.service?.name || j.title || "Job"}${j.assignee ? ` (${j.assignee.name})` : ""}`).join("\n") || "- No jobs scheduled.";
  const text = `Your Business daily brief\n\nToday's jobs:\n${lines}\n\nNeeds attention:\n- ${unreplied} unreplied new lead(s)\n- ${followUps} follow-up(s) due by tomorrow\n- ${unconfirmed} unconfirmed job(s) today\n\nRevenue logged today: $${revenue.total}\n${dashboard ? `\nOpen dashboard: ${dashboard}/today` : ""}`;
  let email: { ok: boolean; error?: string } | null = null;
  if (emailConfigured() && defaultAlertTo()) email = await sendEmail({ to: defaultAlertTo(), subject: `${BRAND.name} daily brief — ${fmtDay(now)}`, text, html: `<pre style="font:14px system-ui;white-space:pre-wrap">${text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>` });
  return NextResponse.json({ ok: true, jobs: jobs.length, unreplied, followUps, unconfirmed, revenue: revenue.total, email: email?.ok ?? false, emailError: email?.error });
}
