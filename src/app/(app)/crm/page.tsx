import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { Badge, Card, Empty, Page, PageHeader, Tabs, btn, input, label } from "@/components/app/ui";
import { Icon } from "@/components/app/Icon";
import { ago, duration } from "@/lib/dates";
import { usd } from "@/lib/money";
import { createClient } from "@/modules/crm/actions";
import { SOURCES, SOURCE_LABEL, STAGES, STAGE_COLOR, STAGE_LABEL, type SourceKey, type StageKey } from "@/modules/crm/constants";
import { retentionSnapshot } from "@/modules/crm/retention";
import { CrmBoard } from "@/modules/crm/CrmBoard";

export const metadata = { title: "Clients" };

type SP = Promise<{ q?: string; stage?: string; source?: string; tag?: string; view?: string; new?: string }>;

export default async function CrmPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const view = ["board", "retention"].includes(sp.view ?? "") ? sp.view! : "list";
  const where: Prisma.ClientWhereInput = {};
  if (sp.q) {
    where.OR = [
      { name: { contains: sp.q, mode: "insensitive" } },
      { phone: { contains: sp.q } },
      { email: { contains: sp.q, mode: "insensitive" } },
      { address: { contains: sp.q, mode: "insensitive" } },
      { city: { contains: sp.q, mode: "insensitive" } },
      { vehicles: { some: { OR: [{ make: { contains: sp.q, mode: "insensitive" } }, { model: { contains: sp.q, mode: "insensitive" } }] } } },
    ];
  }
  if (sp.stage && (STAGES as readonly string[]).includes(sp.stage)) where.stage = sp.stage as StageKey;
  if (sp.source && (SOURCES as readonly string[]).includes(sp.source)) where.source = sp.source as SourceKey;
  if (sp.tag) where.tags = { has: sp.tag };

  const [clients, counts, tagRows] = await Promise.all([
    prisma.client.findMany({
      where,
      orderBy: { leadAt: "desc" },
      take: 500,
      include: {
        vehicles: { take: 1 },
        jobs: { where: { status: "DONE" }, select: { price: true, startAt: true } },
        memberships: { where: { status: "ACTIVE" }, select: { id: true } },
      },
    }),
    prisma.client.groupBy({ by: ["stage"], _count: true }),
    prisma.$queryRaw<{ tag: string }[]>`select distinct unnest(tags) as tag from "business_os"."Client" order by 1 limit 50`,
  ]);
  const countBy = Object.fromEntries(counts.map((c) => [c.stage, c._count])) as Record<string, number>;
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: sp.q, stage: sp.stage, source: sp.source, tag: sp.tag, view, ...patch })) if (v) p.set(k, v);
    return `/crm?${p}`;
  };

  return (
    <Page wide>
      <PageHeader
        title="Clients"
        sub={`${clients.length} shown · ${(countBy.NEW ?? 0) + (countBy.CONTACTED ?? 0) + (countBy.QUOTED ?? 0)} open leads`}
        actions={
          <>
            <Link href="/crm/tasks" className={btn.outline}>Follow-ups</Link>
            <Link href="/crm/import" className={btn.outline}>Import Acuity CSV</Link>
            <Link href={qs({ new: "1" })} className={btn.primary}>
              <Icon name="plus" className="h-4 w-4" /> New lead
            </Link>
          </>
        }
      />

      {sp.new && (
        <Card title="New lead" className="mb-4" action={<Link href={qs({ new: undefined })} className="text-sm text-muted">Cancel</Link>}>
          <form action={createClient} className="grid gap-3 md:grid-cols-3">
            <div><label className={label}>Name *</label><input name="name" required className={input} autoFocus /></div>
            <div><label className={label}>Phone</label><input name="phone" type="tel" className={input} /></div>
            <div><label className={label}>Email</label><input name="email" type="email" className={input} /></div>
            <div className="md:col-span-2"><label className={label}>Address</label><input name="address" className={input} placeholder="Street address" /></div>
            <div><label className={label}>City</label><input name="city" className={input} placeholder="Your city" /></div>
            <div><label className={label}>Reference</label><input name="vehicle" className={input} placeholder="Optional client reference" /></div>
            <div>
              <label className={label}>Source</label>
              <select name="source" className={input} defaultValue="">
                <option value="">Unknown</option>
                {SOURCES.map((s) => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
              </select>
            </div>
            <div><label className={label}>Tags (comma separated)</label><input name="tags" className={input} placeholder="ceramic interest, dog hair" /></div>
            <div className="md:col-span-3"><label className={label}>Notes</label><textarea name="notes" rows={2} className={input} /></div>
            <div className="md:col-span-3"><button className={btn.primary}>Save lead</button></div>
          </form>
        </Card>
      )}

      <form className="mb-3 flex flex-wrap gap-2" action="/crm">
        <input name="q" defaultValue={sp.q} placeholder="Search name, phone, service, street..." className={`${input} min-w-0 flex-1 md:max-w-sm`} />
        <input type="hidden" name="view" value={view} />
        <select name="source" defaultValue={sp.source ?? ""} className={`${input} w-auto`}>
          <option value="">All sources</option>
          {SOURCES.map((s) => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
        </select>
        {tagRows.length > 0 && (
          <select name="tag" defaultValue={sp.tag ?? ""} className={`${input} w-auto`}>
            <option value="">All tags</option>
            {tagRows.map((t) => <option key={t.tag} value={t.tag}>{t.tag}</option>)}
          </select>
        )}
        <button className={btn.outline}>Filter</button>
      </form>

      <Tabs
        current={view}
        tabs={[
          { key: "list", label: "List", href: qs({ view: "list" }) },
          { key: "board", label: "Pipeline", href: qs({ view: "board", stage: undefined }) },
          { key: "retention", label: "Retention", href: qs({ view: "retention", stage: undefined }) },
        ]}
      />

      {view === "retention" ? <Retention clients={clients} /> : view === "list" ? (
        <>
          <div className="-mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:px-0">
            <Link href={qs({ stage: undefined })} className={`rounded-full border px-3 py-1 text-xs ${!sp.stage ? "border-brand bg-brand text-white" : "border-border bg-surface"}`}>All</Link>
            {STAGES.map((s) => (
              <Link key={s} href={qs({ stage: s })} className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs ${sp.stage === s ? "border-brand bg-brand text-white" : "border-border bg-surface"}`}>
                {STAGE_LABEL[s]} {countBy[s] ?? 0}
              </Link>
            ))}
          </div>
          <Card pad={false}>
            {clients.length === 0 ? (
              <Empty>No clients match.</Empty>
            ) : (
              <ul className="divide-y divide-border">
                {clients.map((c) => {
                  const v = c.vehicles[0];
                  const spent = c.jobs.reduce((s, j) => s + j.price, 0);
                  const replyMin = c.firstReplyAt ? (c.firstReplyAt.getTime() - c.leadAt.getTime()) / 60000 : null;
                  return (
                    <li key={c.id}>
                      <Link href={`/crm/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-semibold">{c.name}</span>
                            <Badge color={STAGE_COLOR[c.stage as StageKey]}>{STAGE_LABEL[c.stage as StageKey]}</Badge>
                            {c.memberships.length > 0 && <Badge color="gold">Member</Badge>}
                            {c.ceramic && <Badge color="purple">Ceramic</Badge>}
                          </div>
                          <p className="truncate text-xs text-muted">
                            {[c.city, v && [v.year, v.make, v.model].filter(Boolean).join(" "), SOURCE_LABEL[c.source as SourceKey]].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                        <div className="text-right text-xs text-muted">
                          {spent > 0 && <p className="font-semibold text-foreground">{usd(spent)}</p>}
                          {c.stage === "NEW" && !c.firstReplyAt ? (
                            <p className="font-semibold text-bad">No reply · {ago(c.leadAt)}</p>
                          ) : replyMin !== null && ["NEW", "CONTACTED", "QUOTED"].includes(c.stage) ? (
                            <p>Replied in {duration(replyMin)}</p>
                          ) : (
                            <p>{ago(c.leadAt)}</p>
                          )}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </>
      ) : <CrmBoard clients={clients} />}
    </Page>
  );
}

function Retention({ clients }: { clients: { id: string; name: string; phone: string; rebookIntervalDays: number; jobs: { price: number; startAt: Date }[]; memberships: { id: string }[] }[] }) { const rows = clients.map((c) => ({ ...c, ...retentionSnapshot({ lastServiceAt: c.jobs.sort((a, b) => b.startAt.getTime() - a.startAt.getTime())[0]?.startAt ?? null, intervalDays: c.rebookIntervalDays, visits: c.jobs.length, lifetimeValue: c.jobs.reduce((s, j) => s + j.price, 0) }) })).filter((r) => r.visits > 0); const groups = [{ key: "due", title: "Due to rebook" }, { key: "at_risk", title: "At risk · 60+ days" }, { key: "lost", title: "Lost · 90+ days" }, { key: "healthy", title: "Healthy" }] as const; return <div className="grid gap-4 lg:grid-cols-2">{groups.map((g) => <Card key={g.key} title={`${g.title} (${rows.filter((r) => r.bucket === g.key).length})`} pad={false}><ul className="divide-y divide-border">{rows.filter((r) => r.bucket === g.key).map((r) => <li key={r.id} className="flex items-center gap-2 px-4 py-3"><Link href={`/crm/${r.id}`} className="min-w-0 flex-1"><p className="font-semibold text-sm">{r.name}</p><p className="text-xs text-muted">{r.daysSince}d since service · {r.visits} visits · {usd(r.lifetimeValue)}</p></Link>{r.phone && <a className={btn.small} href={`sms:${r.phone.replace(/[^\d+]/g, "")}`}>Text</a>}</li>)}{!rows.some((r) => r.bucket === g.key) && <li className="p-4 text-sm text-muted">None.</li>}</ul></Card>)}</div>; }
