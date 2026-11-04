import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { BRAND } from "@/config/brand";
import { Card, Page, PageHeader, Stat, Tabs, btn, input, label } from "@/components/app/ui";
import { ConfirmSubmit, Disclosure, Submit } from "@/components/app/client";
import { Bars } from "@/components/app/charts";
import { addDays, addMonths, fmtDate, startOfDay, startOfMonth, startOfWeek, ymd } from "@/lib/dates";
import { pct, safeDiv, usd } from "@/lib/money";
import { addExpense, addPayment, deleteExpense } from "@/modules/revenue/actions";
import { EXPENSE_CATEGORIES, breakdowns, costsBetween, dailySeries, monthlySeries, revenueBetween } from "@/modules/revenue/data";
import { createPaymentPlan, logPlanPayment } from "@/modules/payments/actions";
import { paymentPlanStats } from "@/modules/payments/plans";

export const metadata = { title: "Revenue" };

const RANGES = {
  week: { label: "This week", from: () => startOfWeek(), to: () => addDays(startOfWeek(), 7) },
  month: { label: "This month", from: () => startOfMonth(), to: () => addMonths(startOfMonth(), 1) },
  last: { label: "Last month", from: () => addMonths(startOfMonth(), -1), to: () => startOfMonth() },
  "90d": { label: "Last 90 days", from: () => addDays(startOfDay(), -89), to: () => addDays(startOfDay(), 1) },
  ytd: { label: "This year", from: () => { const d = startOfMonth(); return addMonths(d, -Number(ymd(d).slice(5, 7)) + 1); }, to: () => addDays(startOfDay(), 1) },
} as const;
type RangeKey = keyof typeof RANGES;

export default async function RevenuePage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { range } = await searchParams;
  const key: RangeKey = range && range in RANGES ? (range as RangeKey) : "month";
  const r = RANGES[key];
  const from = r.from();
  const to = r.to();
  const now = new Date();
  const [today, week, month, rev, costs, bd, daily, monthly, expenses, clients, planStats] = await Promise.all([
    revenueBetween(startOfDay(now), addDays(startOfDay(now), 1)),
    revenueBetween(startOfWeek(now), addDays(startOfWeek(now), 7)),
    revenueBetween(startOfMonth(now), addMonths(startOfMonth(now), 1)),
    revenueBetween(from, to),
    costsBetween(from, to),
    breakdowns(from, to),
    dailySeries(30, now),
    monthlySeries(12, now),
    prisma.expense.findMany({ where: { date: { gte: from, lt: to } }, orderBy: { date: "desc" } }),
    prisma.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    paymentPlanStats(now),
  ]);
  const share = Math.round((rev.total * BRAND.revShare.percent) / 100);
  const profit = rev.total - costs.total - share;

  return (
    <Page wide>
      <PageHeader title="Revenue" sub="Money in, money out" />
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Stat label="Today" value={usd(today.total)} />
        <Stat label="This week" value={usd(week.total)} />
        <Stat label="This month" value={usd(month.total)} sub={`best month so far ${usd(BRAND.baseline.bestMonthRevenue)}`} tone="brand" />
      </div>

      <Tabs current={key} tabs={(Object.keys(RANGES) as RangeKey[]).map((k) => ({ key: k, label: RANGES[k].label, href: `/revenue?range=${k}` }))} />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-6">
        <Stat label="Revenue" value={usd(rev.total)} sub={`${rev.count} payments`} tone="brand" />
        <Stat label="One-time" value={usd(rev.oneTime)} sub={pct(safeDiv(rev.oneTime, rev.total))} />
        <Stat label="Recurring" value={usd(rev.recurring)} sub={pct(safeDiv(rev.recurring, rev.total))} tone="good" />
        <Stat label="Costs" value={usd(costs.total)} sub="ads + crew + expenses" tone="warn" />
        <Stat label={`${BRAND.revShare.partner} ${BRAND.revShare.percent}%`} value={usd(share)} />
        <Stat label="Left over" value={usd(profit)} tone={profit >= 0 ? "good" : "bad"} />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card title="Last 30 days">
          <Bars data={daily} stacked series={[{ key: "oneTime", label: "One-time", color: "#0e7c86" }, { key: "recurring", label: "Recurring", color: "#d4a017" }]} />
        </Card>
        <Card title="By month">
          <Bars data={monthly} series={[{ key: "revenue", label: "Revenue", color: "#0e7c86" }, { key: "costs", label: "Costs", color: "#f59e0b" }]} />
        </Card>
      </div>

      <div className="mb-4 grid gap-4 md:grid-cols-3">
        <Card title="By service">
          <Breakdown rows={bd.byService} total={rev.total} />
        </Card>
        <Card title="By lead source">
          <Breakdown rows={bd.bySource} total={rev.total} />
        </Card>
        <Card title="Costs">
          <Breakdown rows={Object.entries(costs.by).sort((a, b) => b[1] - a[1])} total={costs.total} />
          <p className="mt-2 text-xs text-muted">Ad spend comes from Ads, crew pay from Team. Log everything else below.</p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={`${BRAND.revShare.partner} rev share (${BRAND.revShare.percent}% of revenue)`} pad={false}>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-left text-xs text-muted"><th className="px-4 py-2">Month</th><th className="px-4 py-2 text-right">Revenue</th><th className="px-4 py-2 text-right">{BRAND.revShare.percent}%</th></tr></thead>
            <tbody>
              {[...monthly].reverse().filter((m) => m.revenue > 0).map((m) => (
                <tr key={m.label} className="border-b border-border last:border-0">
                  <td className="px-4 py-2">{m.label}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{usd(m.revenue)}</td>
                  <td className="px-4 py-2 text-right font-semibold tabular-nums">{usd(Math.round((m.revenue * BRAND.revShare.percent) / 100))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Expenses in range">
          <Disclosure summary="+ Log an expense" className="mb-3">
            <form action={addExpense} className="grid grid-cols-2 gap-2">
              <div><label className={label}>Date</label><input type="date" name="date" defaultValue={ymd(now)} className={input} /></div>
              <div><label className={label}>Amount $</label><input name="amount" inputMode="numeric" required className={input} /></div>
              <div>
                <label className={label}>Category</label>
                <select name="category" className={input}>{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
              </div>
              <div><label className={label}>Note</label><input name="note" className={input} placeholder="Chemical Guys order" /></div>
              <Submit className={btn.primary}>Save</Submit>
            </form>
          </Disclosure>
          <Disclosure summary="+ Log a payment by hand (tip, cash job)" className="mb-3">
            <form action={addPayment} className="grid grid-cols-2 gap-2">
              <div><label className={label}>Date</label><input type="date" name="date" defaultValue={ymd(now)} className={input} /></div>
              <div><label className={label}>Amount $</label><input name="amount" inputMode="numeric" required className={input} /></div>
              <div>
                <label className={label}>Client</label>
                <select name="clientId" className={input}><option value="">None</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
              </div>
              <div>
                <label className={label}>Type</label>
                <select name="kind" className={input}><option value="one_time">One-time</option><option value="recurring">Recurring</option></select>
              </div>
              <div className="col-span-2"><label className={label}>Note</label><input name="note" className={input} /></div>
              <Submit className={btn.primary}>Save</Submit>
            </form>
          </Disclosure>
          <ul className="divide-y divide-border text-sm">
            {expenses.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2 py-2">
                <span>{fmtDate(e.date)} · {e.category}{e.note && <span className="text-muted"> · {e.note}</span>}</span>
                <span className="flex items-center gap-2">
                  <b className="tabular-nums">{usd(e.amount)}</b>
                  <form action={deleteExpense.bind(null, e.id)}><ConfirmSubmit message="Delete this expense?" className="text-xs text-muted">×</ConfirmSubmit></form>
                </span>
              </li>
            ))}
            {expenses.length === 0 && <li className="py-2 text-muted">None logged.</li>}
          </ul>
        </Card>
      </div>
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card title="MRR — memberships + payment plans"><div className="grid grid-cols-3 gap-2"><Stat label="MRR" value={usd(planStats.mrr)} tone="brand" /><Stat label="Plans" value={planStats.plans.length} /><Stat label="Overdue" value={planStats.overdue.length} tone={planStats.overdue.length ? "bad" : "good"} /></div><p className="mt-3 text-xs text-muted">One shared MRR total: active memberships plus active payment plans. New plan MRR this month: {usd(planStats.newMrr)}.</p></Card>
        <Card title="Offer a payment plan"><form action={createPaymentPlan} className="grid grid-cols-2 gap-2"><select name="clientId" required className={`${input} col-span-2`}><option value="">Choose client</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><input name="name" className={input} placeholder="Sample payment plan" /><input name="amount" className={input} inputMode="numeric" placeholder="Amount $" required /><select name="frequency" className={input}><option value="monthly">Monthly</option><option value="biweekly">Every 2 weeks</option><option value="weekly">Weekly</option></select><input name="installments" className={input} inputMode="numeric" placeholder="Installments (optional)" /><input name="startDate" type="date" defaultValue={ymd(now)} className={`${input} col-span-2`} /><Submit className={`${btn.primary} col-span-2`}>Create payment plan</Submit></form></Card>
        <Card title="Due this week" className="lg:col-span-2" pad={false}>{planStats.dueThisWeek.length ? <ul className="divide-y divide-border">{planStats.dueThisWeek.map((p) => <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3"><div><p className="font-semibold text-sm">{p.client.name} · {p.name}</p><p className="text-xs text-muted">{usd(p.amount)} due {fmtDate(p.nextDueDate)}{p.nextDueDate < now ? " · overdue" : ""}</p></div><form action={logPlanPayment.bind(null, p.id)}><Submit className={btn.outline}>Log paid</Submit></form></li>)}</ul> : <p className="p-4 text-sm text-muted">No payment plans due this week.</p>}</Card>
      </div>
      <p className="mt-4 text-xs text-muted">Job revenue is logged when a job is marked done. <Link href="/memberships" className="text-brand">Membership charges</Link> are logged monthly.</p>
    </Page>
  );
}

function Breakdown({ rows, total }: { rows: [string, number][]; total: number }) {
  if (rows.length === 0) return <p className="text-sm text-muted">Nothing yet.</p>;
  return (
    <ul className="space-y-2">
      {rows.map(([k, v]) => (
        <li key={k}>
          <div className="flex justify-between text-sm"><span className="truncate">{k}</span><span className="tabular-nums font-semibold">{usd(v)}</span></div>
          <div className="mt-0.5 h-1.5 rounded-full bg-surface-2"><div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, safeDiv(v, total) * 100)}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}
