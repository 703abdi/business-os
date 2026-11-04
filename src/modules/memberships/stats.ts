import { prisma } from "@/lib/prisma";
import { addMonths, fmtMonth, startOfMonth } from "@/lib/dates";
import { totalMrr, type MrrPaymentPlan } from "@/modules/payments/mrr";

type M = { price: number; startedAt: Date; canceledAt: Date | null; status: string };

/** MRR from memberships active at instant t (paused ones don't count today). */
export function mrrAt(ms: M[], plans: MrrPaymentPlan[], t: Date, now = new Date()) {
  const eligibleMemberships = ms.map((m) => ({ ...m, status: m.status === "PAUSED" && t >= startOfMonth(now) ? "PAUSED" : "ACTIVE" }));
  return totalMrr(eligibleMemberships, plans, t);
}

export async function membershipStats(now = new Date()) {
  const [ms, plans] = await Promise.all([
    prisma.membership.findMany({ select: { price: true, startedAt: true, canceledAt: true, status: true, founding: true } }),
    prisma.paymentPlan.findMany({ select: { amount: true, frequency: true, status: true, startDate: true } }),
  ]);
  const active = ms.filter((m) => m.status === "ACTIVE");
  const activePlans = plans.filter((p) => p.status === "ACTIVE" && p.startDate <= now);
  const mrr = totalMrr(ms, plans, now);
  const d30 = new Date(now.getTime() - 30 * 86_400_000);
  const activeAt30 = ms.filter((m) => m.startedAt <= d30 && (!m.canceledAt || m.canceledAt > d30)).length;
  const churned30 = ms.filter((m) => m.canceledAt && m.canceledAt > d30 && m.canceledAt <= now).length;
  const joined30 = ms.filter((m) => m.startedAt > d30).length;
  const history = Array.from({ length: 12 }, (_, i) => {
    const monthStart = addMonths(startOfMonth(now), i - 11);
    const end = i === 11 ? now : addMonths(monthStart, 1);
    return { label: fmtMonth(monthStart), mrr: mrrAt(ms, plans, new Date(end.getTime() - 1), now), members: ms.filter((m) => m.startedAt < end && (!m.canceledAt || m.canceledAt >= end)).length };
  });
  return {
    mrr,
    members: active.length,
    paymentPlans: activePlans.length,
    founding: active.filter((m) => m.founding).length,
    paused: ms.filter((m) => m.status === "PAUSED").length,
    churned30,
    joined30,
    churnRate30: activeAt30 ? churned30 / activeAt30 : 0,
    history,
  };
}
