import { prisma } from "@/lib/prisma";
import { addDays, addMonths, startOfMonth } from "@/lib/dates";
import { totalMrr } from "./mrr";

export function nextPlanDue(from: Date, frequency: string) { return frequency === "weekly" ? addDays(from, 7) : frequency === "biweekly" ? addDays(from, 14) : addMonths(from, 1); }
export async function paymentPlanStats(now = new Date()) {
  const [plans, memberships] = await Promise.all([prisma.paymentPlan.findMany({ where: { status: "ACTIVE" }, include: { client: true }, orderBy: { nextDueDate: "asc" } }), prisma.membership.findMany({ where: { status: "ACTIVE" }, select: { price: true, status: true } })]);
  const mrr = totalMrr(memberships, plans, now);
  return { mrr, plans, dueThisWeek: plans.filter((p) => p.nextDueDate <= addDays(now, 7)), overdue: plans.filter((p) => p.nextDueDate < now), newMrr: plans.filter((p) => p.startDate >= startOfMonth(now)).reduce((s, p) => s + p.amount, 0) };
}
