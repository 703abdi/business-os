import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { BRAND } from "@/config/brand";
import { Badge, Card, Empty, Page, PageHeader, Stat, btn } from "@/components/app/ui";
import { Icon } from "@/components/app/Icon";
import { addDays, ago, duration, fmtDate, fmtDay } from "@/lib/dates";
import { pct, safeDiv, usd } from "@/lib/money";
import { speedToLead } from "@/modules/sales/speed";
import { SOURCE_LABEL, type SourceKey } from "@/modules/crm/constants";

export const metadata = { title: "Sales" };

const TOOLS = [
  { href: "/forms", title: "Lead forms", sub: "Quote request and booking forms for the site, ads and bio links" },
  { href: "/sales/quote", title: "Quote builder", sub: "Line items, discount, text it to the client" },
  { href: "/sales/scripts", title: "Reply scripts", sub: "First reply, follow-ups, objections, package pitch" },
  { href: "/sales/sequences", title: "Follow-up sequences", sub: "Dated reminders so no lead goes cold" },
  { href: "/automations", title: "Automations", sub: "Emails and tags when a form comes in" },
  { href: "/pages", title: "Landing pages", sub: "Offer and Priority pages with video" },
  { href: "/blasts", title: "Email blasts", sub: "Seasonal offers to past clients" },
  { href: "/contacts", title: "Email list", sub: "Everyone who filled out a form" },
  { href: "/insights", title: "Form insights", sub: "Drop-off and where leads come from" },
];

export default async function SalesPage() {
  const now = new Date();
  const d30 = addDays(now, -30);
  const [waiting, s7, s30, pitchJobs, quotes, leads30, booked30] = await Promise.all([
    prisma.client.findMany({ where: { stage: "NEW", firstReplyAt: null }, orderBy: { leadAt: "asc" } }),
    speedToLead(addDays(now, -7)),
    speedToLead(d30),
    prisma.job.findMany({
      where: { status: "DONE", membershipId: null, startAt: { gte: d30 } },
      orderBy: { startAt: "desc" },
      include: { client: { include: { memberships: { where: { status: "ACTIVE" }, select: { id: true } } } }, service: true },
    }),
    prisma.quote.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { client: true } }),
    prisma.client.count({ where: { leadAt: { gte: d30 } } }),
    prisma.client.count({ where: { leadAt: { gte: d30 }, jobs: { some: {} } } }),
  ]);
  const oneOffs = pitchJobs.filter((j) => j.client.memberships.length === 0 || j.pitchOutcome);
  const pitched = oneOffs.filter((j) => j.pitchOutcome);
  const signed = oneOffs.filter((j) => j.pitchOutcome === "signed");

  return (
    <Page wide>
      <PageHeader
        title="Sales"
        sub="Get every lead a fast reply, a quote and a follow-up"
        actions={<Link href="/crm?new=1" className={btn.primary}><Icon name="plus" className="h-4 w-4" /> New lead</Link>}
      />

      {waiting.length > 0 && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="mb-2 flex items-center gap-2 font-semibold text-red-900"><Icon name="alert" className="h-5 w-5" /> {waiting.length} leads waiting on a first reply</p>
          <ul className="space-y-1.5">
            {waiting.map((c) => {
              const tel = c.phone.replace(/[^\d+]/g, "");
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <Link href={`/crm/${c.id}`} className="font-semibold text-red-900 underline">{c.name}</Link>
                  <span className="text-red-800">{SOURCE_LABEL[c.source as SourceKey]} · waiting {duration((now.getTime() - c.leadAt.getTime()) / 60000)}</span>
                  {tel && <a href={`tel:${tel}`} className={btn.small}>Call</a>}
                  {tel && <a href={`sms:${tel}`} className={btn.small}>Text</a>}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Median first reply (7d)" value={s7.median != null ? duration(s7.median) : "—"} sub={`goal under ${BRAND.speedToLeadMinutes}m`} tone={s7.median != null && s7.median <= BRAND.speedToLeadMinutes ? "good" : "warn"} />
        <Stat label={`Replied < ${BRAND.speedToLeadMinutes}m (30d)`} value={pct(s30.fastShare)} sub={`${s30.replied}/${s30.leads} leads replied`} />
        <Stat label="Lead → booked (30d)" value={pct(safeDiv(booked30, leads30))} sub={`${booked30} of ${leads30} leads`} tone="brand" />
        <Stat label="Pitched after job" value={pct(safeDiv(pitched.length, oneOffs.length))} sub={`${pitched.length}/${oneOffs.length} one-off jobs`} />
        <Stat label="Pitch → member" value={pct(safeDiv(signed.length, pitched.length))} sub={`${signed.length} signed`} tone="good" />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((t) => (
          <Link key={t.href} href={t.href} className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3.5 hover:border-brand">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{t.title}</p>
              <p className="text-xs text-muted">{t.sub}</p>
            </div>
            <Icon name="arrow" className="h-4 w-4 text-muted" />
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Package pitch after one-off jobs (30 days)" pad={false}>
          {oneOffs.length === 0 ? <Empty>No one-off jobs in the last 30 days.</Empty> : (
            <ul className="divide-y divide-border">
              {oneOffs.slice(0, 12).map((j) => (
                <li key={j.id}>
                  <Link href={`/schedule/${j.id}`} className="flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-surface-2">
                    <div>
                      <p className="text-sm font-semibold">{j.client.name}</p>
                      <p className="text-xs text-muted">{fmtDay(j.startAt)} · {j.service?.name ?? j.title}</p>
                    </div>
                    {j.pitchOutcome ? (
                      <Badge color={j.pitchOutcome === "signed" ? "green" : j.pitchOutcome === "declined" ? "gray" : "amber"}>{j.pitchOutcome}</Badge>
                    ) : (
                      <Badge color="red">not pitched</Badge>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Recent quotes" action={<Link href="/sales/quote" className="text-xs text-brand">New quote</Link>} pad={false}>
          {quotes.length === 0 ? <Empty>No quotes yet.</Empty> : (
            <ul className="divide-y divide-border">
              {quotes.map((q) => (
                <li key={q.id}>
                  <Link href={`/sales/quote?id=${q.id}`} className="flex items-center justify-between px-4 py-2.5 hover:bg-surface-2">
                    <div>
                      <p className="text-sm font-semibold">{q.client.name}</p>
                      <p className="text-xs text-muted">{fmtDate(q.createdAt)} · {ago(q.createdAt)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold">{usd(q.total)}</p>
                      <Badge color={q.status === "accepted" ? "green" : q.status === "declined" ? "gray" : q.status === "sent" ? "blue" : "amber"}>{q.status}</Badge>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Lead capture" className="lg:col-span-2">
          <ul className="space-y-1.5 text-sm text-muted">
            <li>Forms built in <Link href="/forms" className="text-brand">Lead forms</Link> drop every finished submission into Clients as a New lead, with the source from the link&apos;s UTM tags.</li>
            <li>Meta lead ads, Squarespace or Zapier can POST leads to <code>/api/leads/inbound</code> with the <code>LEADS_WEBHOOK_SECRET</code> bearer token. Each new lead emails a speed-to-lead alert when email is set up.</li>
            <li>The red box above and the Today page show every lead that hasn&apos;t had a reply yet.</li>
          </ul>
        </Card>
      </div>
    </Page>
  );
}
