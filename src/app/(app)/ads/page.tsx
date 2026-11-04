import { prisma } from "@/lib/prisma";
import { Badge, Card, Empty, Page, PageHeader, Stat, Tabs, btn, input, label } from "@/components/app/ui";
import { AutoSelect, ConfirmSubmit, Disclosure, Submit } from "@/components/app/client";
import { Bars } from "@/components/app/charts";
import { addDays, addMonths, fmtDate, startOfMonth, startOfWeek, ymd } from "@/lib/dates";
import { safeDiv, usd } from "@/lib/money";
import { addAdStat, deleteAdStat, saveCampaign, saveCreative, setCreativeStatus } from "@/modules/ads/actions";
import { adApiStatus } from "@/modules/ads/api";

export const metadata = { title: "Ads" };

const RANGES = { month: "This month", last: "Last month", "90d": "Last 90 days" } as const;
type RangeKey = keyof typeof RANGES;
const CREATIVE_COLOR = { testing: "amber", winner: "green", killed: "gray" } as const;

export default async function AdsPage({ searchParams }: { searchParams: Promise<{ range?: string; platform?: string }> }) {
  const sp = await searchParams;
  const range: RangeKey = sp.range && sp.range in RANGES ? (sp.range as RangeKey) : "month";
  const platform = sp.platform === "meta" || sp.platform === "google" ? sp.platform : undefined;
  const from = range === "month" ? startOfMonth() : range === "last" ? addMonths(startOfMonth(), -1) : addDays(new Date(), -90);
  const to = range === "last" ? startOfMonth() : addDays(new Date(), 1);

  const [campaigns, creatives, crmLeads, weekly] = await Promise.all([
    prisma.adCampaign.findMany({
      where: platform ? { platform } : {},
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: { stats: { orderBy: { date: "desc" } } },
    }),
    prisma.adCreative.findMany({ where: platform ? { campaign: { platform } } : {}, orderBy: { createdAt: "desc" }, include: { campaign: true } }),
    prisma.client.count({ where: { leadAt: { gte: from, lt: to }, source: platform === "google" ? "GOOGLE" : platform === "meta" ? "META" : { in: ["META", "GOOGLE"] } } }),
    Promise.all(
      Array.from({ length: 8 }, async (_, i) => {
        const s = addDays(startOfWeek(), (i - 7) * 7);
        const a = await prisma.adStat.aggregate({ where: { date: { gte: s, lt: addDays(s, 7) }, ...(platform ? { campaign: { platform } } : {}) }, _sum: { spend: true, leads: true } });
        return { label: ymd(s).slice(5).replace("-", "/"), spend: a._sum.spend ?? 0, leads: a._sum.leads ?? 0 };
      }),
    ),
  ]);
  const inRange = (d: Date) => d >= from && d < to;
  const rows = campaigns.map((c) => {
    const st = c.stats.filter((s) => inRange(s.date));
    const spend = st.reduce((s, x) => s + x.spend, 0);
    const leads = st.reduce((s, x) => s + x.leads, 0);
    const booked = st.reduce((s, x) => s + x.booked, 0);
    return { c, spend, leads, booked };
  });
  const tot = rows.reduce((a, r) => ({ spend: a.spend + r.spend, leads: a.leads + r.leads, booked: a.booked + r.booked }), { spend: 0, leads: 0, booked: 0 });
  const api = adApiStatus();
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ range, platform, ...patch })) if (v) p.set(k, v);
    return `/ads?${p}`;
  };

  return (
    <Page wide>
      <PageHeader title="Ads" sub="Meta and Google: spend, leads, booked jobs" />
      <Tabs
        current={platform ?? "all"}
        tabs={[
          { key: "all", label: "All", href: qs({ platform: undefined }) },
          { key: "meta", label: "Meta", href: qs({ platform: "meta" }) },
          { key: "google", label: "Google", href: qs({ platform: "google" }) },
        ]}
      />
      <div className="-mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:px-0">
        {(Object.keys(RANGES) as RangeKey[]).map((k) => (
          <a key={k} href={qs({ range: k })} className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs ${range === k ? "border-brand bg-brand text-white" : "border-border bg-surface"}`}>{RANGES[k]}</a>
        ))}
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Spend" value={usd(tot.spend)} />
        <Stat label="Leads" value={tot.leads} sub={`${crmLeads} in CRM from ads`} />
        <Stat label="Cost per lead" value={tot.leads ? usd(safeDiv(tot.spend, tot.leads)) : "—"} tone="brand" />
        <Stat label="Booked jobs" value={tot.booked} sub={tot.leads ? `${Math.round(safeDiv(tot.booked, tot.leads) * 100)}% of leads` : undefined} />
        <Stat label="Cost per booked job" value={tot.booked ? usd(safeDiv(tot.spend, tot.booked)) : "—"} tone="brand" />
      </div>

      <Card title="Weekly spend and leads" className="mb-4">
        <Bars data={weekly} series={[{ key: "spend", label: "Spend", color: "#0e7c86" }]} height={180} />
      </Card>

      <Card title="Campaigns" pad={false} className="mb-4">
        {rows.length === 0 ? <Empty>No campaigns yet.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className="px-4 py-2">Campaign</th><th className="px-3 py-2 text-right">Spend</th><th className="px-3 py-2 text-right">Leads</th>
                  <th className="px-3 py-2 text-right">CPL</th><th className="px-3 py-2 text-right">Booked</th><th className="px-3 py-2 text-right">Cost/booked</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ c, spend, leads, booked }) => (
                  <tr key={c.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5">
                      <p className="font-semibold">{c.name}</p>
                      <p className="text-xs text-muted"><Badge color={c.platform === "meta" ? "blue" : "green"}>{c.platform}</Badge> {c.status}{c.angle && ` · ${c.angle}`}</p>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{usd(spend)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{leads}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{leads ? usd(safeDiv(spend, leads)) : "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{booked}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{booked ? usd(safeDiv(spend, booked)) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Enter numbers">
          <p className="mb-3 text-xs text-muted">
            Once a week, copy spend, leads and booked jobs per campaign from Ads Manager. API sync: Meta {api.meta ? "keys set (sync not built yet)" : "not connected"}, Google {api.google ? "keys set (sync not built yet)" : "not connected"}.
          </p>
          <form action={addAdStat} className="grid grid-cols-2 gap-2 md:grid-cols-3">
            <div className="col-span-2 md:col-span-3">
              <label className={label}>Campaign</label>
              <select name="campaignId" required className={input}>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.platform}: {c.name}</option>)}</select>
            </div>
            <div><label className={label}>Week of</label><input type="date" name="date" defaultValue={ymd(startOfWeek())} className={input} /></div>
            <div><label className={label}>Spend $</label><input name="spend" inputMode="numeric" required className={input} /></div>
            <div><label className={label}>Leads</label><input name="leads" inputMode="numeric" className={input} /></div>
            <div><label className={label}>Booked jobs</label><input name="booked" inputMode="numeric" className={input} /></div>
            <div className="col-span-2 flex items-end"><Submit className={btn.primary}>Save week</Submit></div>
          </form>
          <Disclosure summary="Recent entries" className="mt-4">
            <ul className="divide-y divide-border text-sm">
              {campaigns.flatMap((c) => c.stats.slice(0, 8).map((s) => ({ s, c }))).sort((a, b) => +b.s.date - +a.s.date).slice(0, 20).map(({ s, c }) => (
                <li key={s.id} className="flex items-center justify-between py-1.5">
                  <span>{fmtDate(s.date)} · {c.name}</span>
                  <span className="flex items-center gap-2 tabular-nums">{usd(s.spend)} · {s.leads}L · {s.booked}B
                    <form action={deleteAdStat.bind(null, s.id)}><ConfirmSubmit message="Delete this entry?" className="text-muted">×</ConfirmSubmit></form>
                  </span>
                </li>
              ))}
            </ul>
          </Disclosure>
          <Disclosure summary="+ New campaign" className="mt-4">
            <form action={saveCampaign} className="grid grid-cols-2 gap-2">
              <div><label className={label}>Platform</label><select name="platform" className={input}><option value="meta">Meta</option><option value="google">Google</option></select></div>
              <div><label className={label}>Status</label><select name="status" className={input}><option value="active">Active</option><option value="paused">Paused</option><option value="ended">Ended</option></select></div>
              <div className="col-span-2"><label className={label}>Name</label><input name="name" required className={input} /></div>
              <div className="col-span-2"><label className={label}>Angle / offer</label><input name="angle" className={input} placeholder="Interior reset for dog owners" /></div>
              <Submit className={btn.outline}>Add campaign</Submit>
            </form>
          </Disclosure>
        </Card>

        <Card title="Creative & angle log">
          <Disclosure summary="+ Log a creative" className="mb-3">
            <form action={saveCreative} className="grid grid-cols-2 gap-2">
              <div className="col-span-2"><label className={label}>Angle</label><input name="angle" required className={input} placeholder="Before/after of a minivan with kid mess" /></div>
              <div className="col-span-2"><label className={label}>Hook (first line / first 3 seconds)</label><input name="hook" className={input} /></div>
              <div><label className={label}>Format</label><select name="format" className={input}><option value="video">Video</option><option value="image">Image</option><option value="carousel">Carousel</option></select></div>
              <div>
                <label className={label}>Campaign</label>
                <select name="campaignId" className={input}><option value="">None</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
              </div>
              <div className="col-span-2"><label className={label}>Result / notes</label><input name="result" className={input} placeholder="$9 CPL after 5 days" /></div>
              <Submit className={btn.outline}>Save</Submit>
            </form>
          </Disclosure>
          <ul className="space-y-2">
            {creatives.map((cr) => (
              <li key={cr.id} className="rounded-lg border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{cr.angle}</p>
                    {cr.hook && <p className="text-sm text-muted">&ldquo;{cr.hook}&rdquo;</p>}
                    <p className="mt-1 text-xs text-muted">{cr.format}{cr.campaign && ` · ${cr.campaign.name}`} · {fmtDate(cr.createdAt)}{cr.result && ` · ${cr.result}`}</p>
                  </div>
                  <form action={setCreativeStatus.bind(null, cr.id)}>
                    <AutoSelect
                      name="status"
                      defaultValue={cr.status}
                      className={`rounded-md border px-2 py-1 text-xs ${cr.status === "winner" ? "border-green-300 bg-green-50" : "border-border bg-surface"}`}
                      options={[{ value: "testing", label: "Testing" }, { value: "winner", label: "Winner" }, { value: "killed", label: "Killed" }]}
                    />
                  </form>
                </div>
                <span className="sr-only"><Badge color={CREATIVE_COLOR[cr.status as keyof typeof CREATIVE_COLOR] ?? "gray"}>{cr.status}</Badge></span>
              </li>
            ))}
            {creatives.length === 0 && <li className="text-sm text-muted">No creatives logged.</li>}
          </ul>
        </Card>
      </div>
    </Page>
  );
}
