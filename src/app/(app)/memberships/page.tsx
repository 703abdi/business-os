import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { BRAND } from "@/config/brand";
import { Badge, Card, Empty, Page, PageHeader, Progress, Stat, btn, input, label } from "@/components/app/ui";
import { AutoSelect, Disclosure, Submit } from "@/components/app/client";
import { Lines } from "@/components/app/charts";
import { addDays, fmtDate, fmtDay, ymd } from "@/lib/dates";
import { pct, usd } from "@/lib/money";
import { chargeMonth, savePlan, setMembershipStatus, startMembership } from "@/modules/memberships/actions";
import { membershipStats } from "@/modules/memberships/stats";

export const metadata = { title: "Memberships" };

export default async function MembershipsPage({ searchParams }: { searchParams: Promise<{ client?: string; show?: string }> }) {
  const sp = await searchParams;
  const now = new Date();
  const [stats, plans, members, clients] = await Promise.all([
    membershipStats(now),
    prisma.plan.findMany({ orderBy: { sort: "asc" }, include: { memberships: { where: { status: "ACTIVE" }, select: { id: true } } } }),
    prisma.membership.findMany({
      where: sp.show === "all" ? {} : { status: { in: ["ACTIVE", "PAUSED"] } },
      include: { client: true, plan: true, jobs: { where: { startAt: { gte: now }, status: { in: ["SCHEDULED", "CONFIRMED"] } }, select: { id: true, startAt: true }, take: 1, orderBy: { startAt: "asc" } } },
      orderBy: { nextVisitDue: "asc" },
    }),
    prisma.client.findMany({ where: { memberships: { none: { status: "ACTIVE" } }, stage: { not: "LOST" } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const dueSoon = members.filter((m) => m.status === "ACTIVE" && m.jobs.length === 0 && m.nextVisitDue && m.nextVisitDue <= addDays(now, 7));
  const goal = BRAND.goals.mrr;

  return (
    <Page wide>
      <PageHeader
        title="Memberships"
        sub="Monthly maintenance plans and MRR"
        actions={
          <form action={chargeMonth}>
            <Submit className={btn.outline} pending="Logging...">Log this month&apos;s charges</Submit>
          </form>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="MRR" value={usd(stats.mrr)} sub={`${pct(stats.mrr / goal)} of ${usd(goal)} goal`} tone="brand" />
        <Stat label="Members" value={stats.members} sub={`${stats.founding} founding`} />
        <Stat label="Joined (30d)" value={stats.joined30} tone="good" />
        <Stat label="Churned (30d)" value={stats.churned30} sub={`${pct(stats.churnRate30, 1)} churn`} tone={stats.churned30 ? "warn" : "default"} />
        <Stat label="Rebook due" value={dueSoon.length} sub="next 7 days, not booked" tone={dueSoon.length ? "bad" : "default"} />
      </div>
      <Card className="mb-4">
        <div className="mb-2 flex items-baseline justify-between">
          <p className="text-sm font-semibold">MRR, last 12 months</p>
          <p className="text-xs text-muted">Goal {usd(goal)}</p>
        </div>
        <Progress value={stats.mrr} max={goal} tone="good" />
        <div className="mt-3">
          <Lines data={stats.history} series={[{ key: "mrr", label: "MRR", color: "#0e7c86" }]} goal={goal} />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {dueSoon.length > 0 && (
            <Card title="Rebook these members" pad={false}>
              <ul className="divide-y divide-border">
                {dueSoon.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                    <div>
                      <Link href={`/crm/${m.clientId}`} className="text-sm font-semibold">{m.client.name}</Link>
                      <p className={`text-xs ${m.nextVisitDue! < now ? "font-semibold text-bad" : "text-muted"}`}>Visit due {fmtDay(m.nextVisitDue!)}</p>
                    </div>
                    <Link href={`/schedule/new?client=${m.clientId}`} className={btn.small}>Book</Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card
            title={`Members (${members.length})`}
            action={<Link href={sp.show === "all" ? "/memberships" : "/memberships?show=all"} className="text-xs text-brand">{sp.show === "all" ? "Hide canceled" : "Show canceled"}</Link>}
            pad={false}
          >
            {members.length === 0 ? (
              <Empty>No members yet. Pitch the plan after every one-off job.</Empty>
            ) : (
              <ul className="divide-y divide-border">
                {members.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Link href={`/crm/${m.clientId}`} className="font-semibold">{m.client.name}</Link>
                        {m.founding && <Badge color="gold">Founding</Badge>}
                        {m.status !== "ACTIVE" && <Badge color={m.status === "PAUSED" ? "amber" : "gray"}>{m.status.toLowerCase()}</Badge>}
                      </div>
                      <p className="text-xs text-muted">
                        {m.plan.name} · {usd(m.price)}/mo · since {fmtDate(m.startedAt)}
                        {m.jobs[0] ? ` · next visit ${fmtDay(m.jobs[0].startAt)}` : m.nextVisitDue ? ` · due ${fmtDay(m.nextVisitDue)}` : ""}
                      </p>
                    </div>
                    <form action={setMembershipStatus.bind(null, m.id)}>
                      <AutoSelect
                        name="status"
                        defaultValue={m.status}
                        className="rounded-md border border-border bg-surface px-2 py-1 text-xs"
                        options={[{ value: "ACTIVE", label: "Active" }, { value: "PAUSED", label: "Paused" }, { value: "CANCELED", label: "Canceled" }]}
                      />
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Add a member" className="scroll-mt-20" >
            <form action={startMembership} className="space-y-2.5" id="join">
              <div>
                <label className={label}>Client</label>
                <select name="clientId" required defaultValue={sp.client ?? ""} className={input}>
                  <option value="">Pick...</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className={label}>Plan</label>
                <select name="planId" required className={input}>
                  {plans.filter((p) => p.active).map((p) => (
                    <option key={p.id} value={p.id}>{p.name}: {usd(p.price)}/mo{p.foundingPrice ? ` (founding ${usd(p.foundingPrice)})` : ""}</option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="founding" defaultChecked className="h-4 w-4" /> Founding member (rate locked for life)</label>
              <div className="grid grid-cols-2 gap-2">
                <div><label className={label}>Custom price</label><input name="price" inputMode="numeric" placeholder="optional" className={input} /></div>
                <div><label className={label}>Start date</label><input type="date" name="startedAt" defaultValue={ymd(now)} className={input} /></div>
              </div>
              <Submit className={`${btn.primary} w-full`}>Start membership</Submit>
            </form>
          </Card>

          <Card title="Plans">
            <div className="space-y-3">
              {plans.map((p) => (
                <Disclosure
                  key={p.id}
                  className="rounded-lg border border-border p-3"
                  summary={
                    <span>
                      {p.name} <span className="font-normal text-muted">{usd(p.price)}/mo · {p.memberships.length} members{!p.active && " · hidden"}</span>
                    </span>
                  }
                >
                  <ul className="mb-3 list-disc pl-5 text-sm text-muted">{p.includes.map((i) => <li key={i}>{i}</li>)}</ul>
                  <PlanForm p={p} />
                </Disclosure>
              ))}
              <Disclosure summary="+ New plan" className="rounded-lg border border-dashed border-border p-3">
                <PlanForm />
              </Disclosure>
            </div>
          </Card>
        </div>
      </div>
    </Page>
  );
}

function PlanForm({ p }: { p?: { id: string; name: string; price: number; foundingPrice: number | null; visitsPerMonth: number; includes: string[]; active: boolean } }) {
  return (
    <form action={savePlan} className="space-y-2">
      {p && <input type="hidden" name="id" value={p.id} />}
      <div><label className={label}>Name</label><input name="name" defaultValue={p?.name} className={input} /></div>
      <div className="grid grid-cols-3 gap-2">
        <div><label className={label}>$/month</label><input name="price" inputMode="numeric" defaultValue={p?.price} className={input} /></div>
        <div><label className={label}>Founding $</label><input name="foundingPrice" inputMode="numeric" defaultValue={p?.foundingPrice ?? ""} className={input} /></div>
        <div><label className={label}>Visits/mo</label><input name="visitsPerMonth" inputMode="numeric" defaultValue={p?.visitsPerMonth ?? 1} className={input} /></div>
      </div>
      <div><label className={label}>What&apos;s included (one per line)</label><textarea name="includes" rows={3} defaultValue={p?.includes.join("\n")} className={input} /></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={p?.active ?? true} className="h-4 w-4" /> Offer this plan</label>
      <Submit className={btn.outline}>Save plan</Submit>
    </form>
  );
}
