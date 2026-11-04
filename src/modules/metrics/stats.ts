import { prisma } from "@/lib/prisma";
import { BRAND } from "@/config/brand";
import { addDays, startOfWeek } from "@/lib/dates";
import { safeDiv } from "@/lib/money";
import { membershipStats } from "@/modules/memberships/stats";
import { reviewStats } from "@/modules/reviews/stats";
import { paymentPlanStats } from "@/modules/payments/plans";

export async function day30Metrics(now = new Date()) {
  const from = addDays(now, -30);
  const week = startOfWeek(now);
  const [memberships, plans, reviews, jobsThisWeek, bookedOrDone, leads, replied, ads, completedClients, repeatClients] = await Promise.all([
    membershipStats(now),
    paymentPlanStats(now),
    reviewStats(new Date(BRAND.baseline.date)),
    prisma.job.count({ where: { startAt: { gte: week, lt: addDays(week, 7) }, status: { notIn: ["CANCELED", "NO_SHOW"] } } }),
    prisma.client.count({ where: { leadAt: { gte: from }, stage: { in: ["BOOKED", "COMPLETED", "MEMBER"] } } }),
    prisma.client.findMany({ where: { leadAt: { gte: from } }, select: { leadAt: true, firstReplyAt: true } }),
    prisma.client.findMany({ where: { leadAt: { gte: from }, firstReplyAt: { not: null } }, select: { leadAt: true, firstReplyAt: true } }),
    prisma.adStat.aggregate({ where: { date: { gte: from } }, _sum: { spend: true, leads: true } }),
    prisma.client.count({ where: { jobs: { some: { status: "DONE", startAt: { gte: addDays(now, -90) } } } } }),
    prisma.client.count({ where: { jobs: { some: { status: "DONE", startAt: { gte: addDays(now, -90) } } }, payments: { some: {} } } }),
  ]);
  const responseMinutes = replied.map((r) => (r.firstReplyAt!.getTime() - r.leadAt.getTime()) / 60_000).filter((m) => m >= 0);
  const avgReplyMinutes = responseMinutes.length ? responseMinutes.reduce((sum, m) => sum + m, 0) / responseMinutes.length : null;
  const adSpend = ads._sum.spend ?? 0;
  const adLeads = ads._sum.leads ?? 0;
  return {
    memberships,
    plans,
    reviews,
    jobsThisWeek,
    leadCount: leads.length,
    bookedOrDone,
    avgReplyMinutes,
    repliedWithinTarget: responseMinutes.filter((m) => m <= BRAND.speedToLeadMinutes).length,
    adSpend,
    adLeads,
    cpl: adLeads ? safeDiv(adSpend, adLeads) : null,
    leadToBooked: safeDiv(bookedOrDone, leads.length),
    repeatCustomerRate: safeDiv(repeatClients, completedClients),
    retention90: safeDiv(repeatClients, completedClients),
  };
}
