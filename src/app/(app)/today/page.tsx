import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { BRAND } from "@/config/brand";
import { Badge, Card, Empty, Page, Stat, btn } from "@/components/app/ui";
import { Icon } from "@/components/app/Icon";
import { addDays, addMonths, duration, endOfDay, fmtDay, fmtTime, localParts, startOfDay, startOfMonth, startOfWeek, ymd } from "@/lib/dates";
import { safeDiv, usd } from "@/lib/money";
import MapView, { type Pin } from "@/modules/map/MapView";
import { revenueBetween } from "@/modules/revenue/data";
import { membershipStats } from "@/modules/memberships/stats";
import { reviewStats } from "@/modules/reviews/stats";
import { speedToLead } from "@/modules/sales/speed";
import { toggleFollowUp } from "@/modules/crm/actions";
import { SOURCE_LABEL, type SourceKey } from "@/modules/crm/constants";
import { JOB_STATUS_COLOR, JOB_STATUS_LABEL } from "@/modules/schedule/constants";
import { contentStats } from "@/modules/content/stats";
import { paymentPlanStats } from "@/modules/payments/plans";
import { requireUser } from "@/lib/auth";
import { executorContent } from "@/modules/content/stats";

export const metadata = { title: "Today" };

export default async function TodayPage() {
  const viewer = await requireUser();
  if (viewer.role === "EMPLOYEE") return <EmployeeToday userId={viewer.id} teamMemberId={viewer.teamMemberId} />;
  const now = new Date();
  const sod = startOfDay(now);
  const eod = endOfDay(now);
  const sow = startOfWeek(now);
  const som = startOfMonth(now);

  const [jobs, unreplied, newLeads, unconfirmed, members, unassigned, followUps, noReviewAsk, revToday, revWeek, revMonth, mrr, reviews, ads, speed, content, paymentPlans] = await Promise.all([
    prisma.job.findMany({
      where: { startAt: { gte: sod, lt: eod }, status: { notIn: ["CANCELED"] } },
      orderBy: { startAt: "asc" },
      include: { client: true, service: true, assignee: true, vehicle: true },
    }),
    prisma.client.findMany({ where: { stage: "NEW", firstReplyAt: null }, orderBy: { leadAt: "asc" } }),
    prisma.client.findMany({ where: { leadAt: { gte: addDays(sod, -6) } }, orderBy: { leadAt: "desc" }, take: 12 }),
    prisma.job.findMany({ where: { status: "SCHEDULED", startAt: { gte: now, lt: addDays(eod, 2) } }, orderBy: { startAt: "asc" }, include: { client: true } }),
    prisma.membership.findMany({
      where: { status: "ACTIVE", nextVisitDue: { lte: addDays(now, 7) }, jobs: { none: { startAt: { gte: now }, status: { in: ["SCHEDULED", "CONFIRMED"] } } } },
      include: { client: true, plan: true },
      orderBy: { nextVisitDue: "asc" },
    }),
    prisma.job.count({ where: { assigneeId: null, startAt: { gte: now, lt: addDays(now, 7) }, status: { in: ["SCHEDULED", "CONFIRMED"] } } }),
    prisma.followUp.findMany({ where: { doneAt: null, dueAt: { lt: eod } }, orderBy: { dueAt: "asc" }, include: { client: true }, take: 15 }),
    prisma.job.count({ where: { status: "DONE", startAt: { gte: addDays(sod, -7) }, reviewAsked: false, membershipId: null } }),
    revenueBetween(sod, eod),
    revenueBetween(sow, addDays(sow, 7)),
    revenueBetween(som, addMonths(som, 1)),
    membershipStats(now),
    reviewStats(sow),
    prisma.adStat.aggregate({ where: { date: { gte: som } }, _sum: { spend: true, leads: true } }),
    speedToLead(addDays(now, -7)),
    contentStats(now),
    paymentPlanStats(now),
  ]);

  const hour = localParts(now).h;
  const hello = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const spend = ads._sum.spend ?? 0;
  const adLeads = ads._sum.leads ?? 0;

  const attention: { key: string; tone: "bad" | "warn"; text: string; href: string }[] = [];
  if (unreplied.length) attention.push({ key: "lead", tone: "bad", text: `${unreplied.length} lead${unreplied.length > 1 ? "s" : ""} with no reply yet (oldest ${duration((now.getTime() - unreplied[0].leadAt.getTime()) / 60000)})`, href: "/sales" });
  if (unconfirmed.length) attention.push({ key: "conf", tone: "warn", text: `${unconfirmed.length} job${unconfirmed.length > 1 ? "s" : ""} in the next 2 days not confirmed`, href: `/schedule/${unconfirmed[0].id}` });
  if (members.length) attention.push({ key: "mem", tone: "warn", text: `${members.length} member${members.length > 1 ? "s" : ""} due to rebook`, href: "/memberships" });
  if (followUps.length) attention.push({ key: "fu", tone: followUps.some((f) => f.dueAt < sod) ? "bad" : "warn", text: `${followUps.length} follow-up${followUps.length > 1 ? "s" : ""} due`, href: "/crm/tasks" });
  if (unassigned) attention.push({ key: "un", tone: "warn", text: `${unassigned} job${unassigned > 1 ? "s" : ""} this week with nobody assigned`, href: "/schedule?who=none" });
  if (noReviewAsk) attention.push({ key: "rev", tone: "warn", text: `${noReviewAsk} finished job${noReviewAsk > 1 ? "s" : ""} this week with no review ask`, href: "/reviews" });
  if (content.overdue) attention.push({ key: "content", tone: "bad", text: `${content.overdue} scheduled post${content.overdue > 1 ? "s" : ""} overdue`, href: "/content?view=calendar" });
  if (content.dueToday.length) attention.push({ key: "content-today", tone: "warn", text: `${content.dueToday.length} post${content.dueToday.length > 1 ? "s" : ""} scheduled today`, href: "/content" });
  if (paymentPlans.overdue.length) attention.push({ key: "plan", tone: "bad", text: `${paymentPlans.overdue.length} payment plan payment${paymentPlans.overdue.length > 1 ? "s" : ""} overdue`, href: "/revenue" });

  const pins: Pin[] = jobs
    .map((j, i) => ({ j, i, lat: j.lat ?? j.client.lat, lng: j.lng ?? j.client.lng }))
    .filter((x) => x.lat != null && x.lng != null)
    .map(({ j, i, lat, lng }) => ({ id: j.id, lat: lat!, lng: lng!, n: i + 1, color: j.assignee?.color ?? "#0e7c86", title: `${i + 1}. ${j.client.name}`, sub: `${fmtTime(j.startAt)} · ${j.service?.name ?? j.title}`, href: `/schedule/${j.id}` }));

  return (
    <Page wide>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-sm text-muted">{fmtDay(now)}</p>
          <h1 className="text-2xl font-bold tracking-tight">{hello}, {BRAND.owner}</h1>
          <p className="text-sm text-muted">{jobs.length ? `${jobs.length} job${jobs.length > 1 ? "s" : ""} today, ${usd(jobs.reduce((s, j) => s + j.price, 0))} on the books.` : "No jobs on the books today."}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/crm?new=1" className={btn.outline}><Icon name="plus" className="h-4 w-4" /> Lead</Link>
          <Link href="/schedule/new" className={btn.primary}><Icon name="plus" className="h-4 w-4" /> Job</Link>
        </div>
      </div>

      {attention.length > 0 && (
        <Card title="Needs attention" className="mb-4" pad={false}>
          <ul className="divide-y divide-border">
            {attention.map((a) => (
              <li key={a.key}>
                <Link href={a.href} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${a.tone === "bad" ? "bg-bad" : "bg-warn"}`} />
                  <span className="flex-1 text-sm font-medium">{a.text}</span>
                  <Icon name="arrow" className="h-4 w-4 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Stat label="Revenue today" value={usd(revToday.total)} href="/revenue" />
        <Stat label="This week" value={usd(revWeek.total)} href="/revenue?range=week" />
        <Stat label="This month" value={usd(revMonth.total)} sub={`best ${usd(BRAND.baseline.bestMonthRevenue)}`} href="/revenue" tone="brand" />
        <Stat label="MRR" value={usd(mrr.mrr)} sub={`${mrr.members} membership${mrr.members === 1 ? "" : "s"} · ${mrr.paymentPlans} payment plan${mrr.paymentPlans === 1 ? "" : "s"}`} href="/memberships" tone="good" />
        <Stat label="Reviews this week" value={`+${reviews.added}`} sub={`${reviews.count} total · ${reviews.rating.toFixed(1)}★`} href="/reviews" />
        <Stat label="Ad spend (month)" value={usd(spend)} sub={adLeads ? `${usd(safeDiv(spend, adLeads))} per lead` : "no leads logged"} href="/ads" />
        <Stat label="New leads (7d)" value={speed.leads} sub={`${speed.replied} replied`} href="/crm" />
        <Stat label="First reply (7d)" value={speed.median != null ? duration(speed.median) : "—"} sub="median" tone={speed.median != null && speed.median <= BRAND.speedToLeadMinutes ? "good" : "warn"} href="/sales" />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <Card title={`Today's jobs (${jobs.length})`} action={jobs.length > 0 ? <Link href={`/map?view=route&day=${ymd(now)}`} className="text-xs text-brand">Route view</Link> : undefined} pad={false}>
            {jobs.length > 0 && pins.length > 0 && (
              <div className="p-3 pb-0">
                <MapView pins={pins} route={pins.map((p) => [p.lat, p.lng])} center={BRAND.mapCenter} className="h-56 md:h-72" />
              </div>
            )}
            {jobs.length === 0 ? <Empty>Nothing scheduled. <Link href="/schedule/new" className="text-brand">Book a job</Link></Empty> : (
              <ul className="divide-y divide-border">
                {jobs.map((j, i) => (
                  <li key={j.id}>
                    <Link href={`/schedule/${j.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: j.assignee?.color ?? "#0e7c86" }}>{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{fmtTime(j.startAt)} · {j.client.name}</p>
                        <p className="truncate text-xs text-muted">
                          {j.service?.name ?? j.title} · {[j.vehicle?.make, j.vehicle?.model].filter(Boolean).join(" ") || "service?"} · {j.city || j.client.city}
                        </p>
                      </div>
                      <div className="text-right">
                        <Badge color={JOB_STATUS_COLOR[j.status]}>{JOB_STATUS_LABEL[j.status]}</Badge>
                        <p className="mt-0.5 text-xs text-muted">{j.assignee?.name ?? "Unassigned"}</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {members.length > 0 && (
            <Card title="Members due to rebook" pad={false}>
              <ul className="divide-y divide-border">
                {members.map((m) => (
                  <li key={m.id} className="flex items-center justify-between px-4 py-2.5">
                    <div>
                      <Link href={`/crm/${m.clientId}`} className="text-sm font-semibold">{m.client.name}</Link>
                      <p className="text-xs text-muted">{m.plan.name} · due {fmtDay(m.nextVisitDue!)}</p>
                    </div>
                    <Link href={`/schedule/new?client=${m.clientId}`} className={btn.small}>Book</Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-4 lg:col-span-2">
          <Card title="New leads, last 7 days" action={<Link href="/crm?stage=NEW" className="text-xs text-brand">All</Link>} pad={false}>
            {newLeads.length === 0 ? <Empty>No new leads this week.</Empty> : (
              <ul className="divide-y divide-border">
                {newLeads.map((c) => {
                  const mins = c.firstReplyAt ? (c.firstReplyAt.getTime() - c.leadAt.getTime()) / 60000 : null;
                  return (
                    <li key={c.id}>
                      <Link href={`/crm/${c.id}`} className="flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-surface-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{c.name}</p>
                          <p className="text-xs text-muted">{SOURCE_LABEL[c.source as SourceKey]} · {fmtDay(c.leadAt)} {fmtTime(c.leadAt)}</p>
                        </div>
                        {mins == null ? (
                          <Badge color="red">no reply</Badge>
                        ) : (
                          <Badge color={mins <= BRAND.speedToLeadMinutes ? "green" : mins <= 60 ? "amber" : "red"}>replied {duration(mins)}</Badge>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card title="Follow-ups due" action={<Link href="/crm/tasks" className="text-xs text-brand">All</Link>} pad={false}>
            {followUps.length === 0 ? <Empty>All caught up.</Empty> : (
              <ul className="divide-y divide-border">
                {followUps.map((f) => (
                  <li key={f.id} className="flex items-start gap-3 px-4 py-2.5">
                    <form action={toggleFollowUp.bind(null, f.id)}>
                      <button className="mt-0.5 h-5 w-5 rounded border border-border" aria-label="Mark done" />
                    </form>
                    <div className="min-w-0">
                      <p className="text-sm">{f.title}</p>
                      <p className={`text-xs ${f.dueAt < sod ? "font-semibold text-bad" : "text-muted"}`}>
                        {f.client ? <Link href={`/crm/${f.client.id}`} className="text-brand">{f.client.name}</Link> : "General"} · {fmtDay(f.dueAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </Page>
  );
}

async function EmployeeToday({ userId, teamMemberId }: { userId: string; teamMemberId: string | null }) {
  const [jobs, content] = await Promise.all([prisma.job.findMany({ where: { assigneeId: teamMemberId ?? "__none__", startAt: { gte: startOfDay(), lt: endOfDay() }, status: { notIn: ["CANCELED", "NO_SHOW"] } }, include: { client: true, service: true }, orderBy: { startAt: "asc" } }), executorContent(userId)]);
  return <Page><div className="mb-4"><p className="text-sm text-muted">{fmtDay(new Date())}</p><h1 className="text-2xl font-bold">My day</h1></div><Card title={`My jobs (${jobs.length})`} pad={false}>{jobs.length ? <ul className="divide-y divide-border">{jobs.map((j) => <li key={j.id}><Link href={`/schedule/${j.id}`} className="block px-4 py-3"><p className="font-semibold">{fmtTime(j.startAt)} · {j.service?.name ?? j.title}</p><p className="text-sm text-muted">{j.client.name} · {j.address}</p></Link></li>)}</ul> : <Empty>No assigned jobs today.</Empty>}</Card><Card title="My content today" className="mt-4" pad={false}>{content.length ? <ul className="divide-y divide-border">{content.map((p) => <li key={p.id}><Link href={`/content/${p.id}`} className="block px-4 py-3"><p className="font-semibold">{p.format} · {p.title}</p><p className="text-xs text-muted">{p.hook || "Open checklist"}</p></Link></li>)}</ul> : <Empty>No content tasks assigned today.</Empty>}</Card></Page>;
}
