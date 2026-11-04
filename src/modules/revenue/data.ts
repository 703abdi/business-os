// Revenue and cost numbers. Revenue = Payment rows (job payments are created
// when a job is marked done, membership charges from the Members page).
// Costs = Expense rows + ad spend (Ads module) + crew pay (Team module), so
// ads and payroll are never typed in twice.
import { prisma } from "@/lib/prisma";
import { addDays, addMonths, fmtMonth, startOfDay, startOfMonth, ymd } from "@/lib/dates";

export const EXPENSE_CATEGORIES = ["supplies", "fuel", "equipment", "ads", "payroll", "insurance", "other"] as const;
import { SOURCE_LABEL, type SourceKey } from "@/modules/crm/constants";

export async function revenueBetween(from: Date, to: Date) {
  const rows = await prisma.payment.findMany({ where: { date: { gte: from, lt: to } }, select: { amount: true, kind: true } });
  const oneTime = rows.filter((r) => r.kind !== "recurring").reduce((s, r) => s + r.amount, 0);
  const recurring = rows.filter((r) => r.kind === "recurring").reduce((s, r) => s + r.amount, 0);
  return { total: oneTime + recurring, oneTime, recurring, count: rows.length };
}

export async function costsBetween(from: Date, to: Date) {
  const [expenses, ads, pay] = await Promise.all([
    prisma.expense.groupBy({ by: ["category"], where: { date: { gte: from, lt: to } }, _sum: { amount: true } }),
    prisma.adStat.aggregate({ where: { date: { gte: from, lt: to } }, _sum: { spend: true } }),
    prisma.payEntry.aggregate({ where: { date: { gte: from, lt: to } }, _sum: { amount: true } }),
  ]);
  const by: Record<string, number> = {};
  for (const e of expenses) by[e.category] = (by[e.category] ?? 0) + (e._sum.amount ?? 0);
  by.ads = (by.ads ?? 0) + (ads._sum.spend ?? 0);
  by.payroll = (by.payroll ?? 0) + (pay._sum.amount ?? 0);
  return { total: Object.values(by).reduce((s, n) => s + n, 0), by };
}

export async function breakdowns(from: Date, to: Date) {
  const rows = await prisma.payment.findMany({
    where: { date: { gte: from, lt: to } },
    select: { amount: true, kind: true, client: { select: { source: true } }, job: { select: { service: { select: { name: true } }, title: true } }, membership: { select: { plan: { select: { name: true } } } } },
  });
  const byService: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  for (const r of rows) {
    const svc = r.kind === "recurring" ? `Membership: ${r.membership?.plan.name ?? "plan"}` : r.job?.service?.name ?? (r.job?.title || "Other");
    byService[svc] = (byService[svc] ?? 0) + r.amount;
    const src = r.client ? SOURCE_LABEL[r.client.source as SourceKey] : "Unknown";
    bySource[src] = (bySource[src] ?? 0) + r.amount;
  }
  const sort = (o: Record<string, number>) => Object.entries(o).sort((a, b) => b[1] - a[1]);
  return { byService: sort(byService), bySource: sort(bySource) };
}

export async function dailySeries(days: number, now = new Date()) {
  const from = startOfDay(addDays(now, -(days - 1)));
  const rows = await prisma.payment.findMany({ where: { date: { gte: from } }, select: { amount: true, kind: true, date: true } });
  return Array.from({ length: days }, (_, i) => {
    const key = ymd(addDays(from, i));
    const day = rows.filter((r) => ymd(r.date) === key);
    return {
      label: key.slice(5).replace("-", "/"),
      oneTime: day.filter((r) => r.kind !== "recurring").reduce((s, r) => s + r.amount, 0),
      recurring: day.filter((r) => r.kind === "recurring").reduce((s, r) => s + r.amount, 0),
    };
  });
}

export async function monthlySeries(months: number, now = new Date()) {
  return Promise.all(
    Array.from({ length: months }, async (_, i) => {
      const s = addMonths(startOfMonth(now), i - (months - 1));
      const e = addMonths(s, 1);
      const [rev, cost] = await Promise.all([revenueBetween(s, e), costsBetween(s, e)]);
      return { label: fmtMonth(s), oneTime: rev.oneTime, recurring: rev.recurring, revenue: rev.total, costs: cost.total };
    }),
  );
}
