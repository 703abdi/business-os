import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { BRAND } from "@/config/brand";
import { Badge, Card, Page, PageHeader, Tabs, btn, input } from "@/components/app/ui";
import { addDays, fmtDay, fmtTime, parseYmd, ymd } from "@/lib/dates";
import { usd } from "@/lib/money";
import MapView, { type Pin } from "@/modules/map/MapView";
import { PIN_COLOR, PIN_LABEL, pinKind, type PinKind } from "@/modules/crm/constants";
import { JOB_STATUS_COLOR, JOB_STATUS_LABEL } from "@/modules/schedule/constants";

export const metadata = { title: "Map" };

type SP = Promise<{ view?: string; day?: string; from?: string; to?: string; service?: string; city?: string; kind?: string }>;

export default async function MapPage({ searchParams }: { searchParams: Promise<Awaited<SP>> }) {
  const sp = await searchParams;
  const view = sp.view === "route" ? "route" : "clients";
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) p.set(k, v);
    return `/map?${p}`;
  };

  return (
    <Page wide>
      <PageHeader title="Map" sub={BRAND.serviceArea} />
      <Tabs
        current={view}
        tabs={[
          { key: "clients", label: "Clients & jobs", href: qs({ view: undefined }) },
          { key: "route", label: "Daily route", href: qs({ view: "route" }) },
        ]}
      />
      {view === "route" ? <RouteView day={sp.day} qs={qs} /> : <ClientsView sp={sp} />}
    </Page>
  );
}

async function ClientsView({ sp }: { sp: Awaited<SP> }) {
  const services = await prisma.service.findMany({ orderBy: { sort: "asc" } });
  const cities = await prisma.client.findMany({ distinct: ["city"], select: { city: true }, where: { city: { not: "" } }, orderBy: { city: "asc" } });

  // Date range and service filter apply to jobs: a client shows when they had a matching job (or, with no filter, always).
  const jobFilter: Prisma.JobWhereInput = {};
  if (sp.from || sp.to) jobFilter.startAt = { ...(sp.from ? { gte: parseYmd(sp.from) } : {}), ...(sp.to ? { lt: addDays(parseYmd(sp.to), 1) } : {}) };
  if (sp.service) jobFilter.serviceId = sp.service;
  const filteringJobs = Object.keys(jobFilter).length > 0;

  const clients = await prisma.client.findMany({
    where: {
      lat: { not: null },
      lng: { not: null },
      ...(sp.city ? { city: sp.city } : {}),
      ...(filteringJobs ? { jobs: { some: jobFilter } } : {}),
    },
    include: {
      memberships: { where: { status: "ACTIVE" }, select: { id: true } },
      jobs: { where: filteringJobs ? jobFilter : { status: "DONE" }, select: { price: true, startAt: true }, orderBy: { startAt: "desc" } },
    },
  });
  const withKind = clients.map((c) => ({ c, kind: pinKind({ stage: c.stage, ceramic: c.ceramic, hasActiveMembership: c.memberships.length > 0 }) }));
  const shown = sp.kind ? withKind.filter((x) => x.kind === sp.kind) : withKind;
  const pins: Pin[] = shown.map(({ c, kind }) => ({
    id: c.id,
    lat: c.lat!,
    lng: c.lng!,
    color: PIN_COLOR[kind],
    title: c.name,
    sub: [PIN_LABEL[kind], c.city, c.jobs.length ? `${c.jobs.length} jobs · ${usd(c.jobs.reduce((s, j) => s + j.price, 0))}` : ""].filter(Boolean).join(" · "),
    href: `/crm/${c.id}`,
  }));
  const counts = Object.fromEntries((Object.keys(PIN_COLOR) as PinKind[]).map((k) => [k, withKind.filter((x) => x.kind === k).length]));
  const missing = await prisma.client.count({ where: { OR: [{ lat: null }, { lng: null }] } });

  return (
    <>
      <form action="/map" className="mb-3 grid grid-cols-2 gap-2 md:flex md:flex-wrap">
        <input type="date" name="from" defaultValue={sp.from} className={`${input} md:w-auto`} aria-label="Jobs from" />
        <input type="date" name="to" defaultValue={sp.to} className={`${input} md:w-auto`} aria-label="Jobs to" />
        <select name="service" defaultValue={sp.service ?? ""} className={`${input} md:w-auto`}>
          <option value="">Any service</option>
          {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select name="city" defaultValue={sp.city ?? ""} className={`${input} md:w-auto`}>
          <option value="">Any city</option>
          {cities.map((c) => <option key={c.city} value={c.city}>{c.city}</option>)}
        </select>
        <select name="kind" defaultValue={sp.kind ?? ""} className={`${input} md:w-auto`}>
          <option value="">All pins</option>
          {(Object.keys(PIN_LABEL) as PinKind[]).map((k) => <option key={k} value={k}>{PIN_LABEL[k]}</option>)}
        </select>
        <div className="flex gap-2">
          <button className={btn.primary}>Apply</button>
          <Link href="/map" className={btn.ghost}>Reset</Link>
        </div>
      </form>
      <div className="mb-3 flex flex-wrap gap-3 text-xs">
        {(Object.keys(PIN_COLOR) as PinKind[]).map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full border-2 border-white shadow" style={{ background: PIN_COLOR[k] }} />
            {PIN_LABEL[k]} ({counts[k]})
          </span>
        ))}
      </div>
      <MapView pins={pins} center={BRAND.mapCenter} />
      <p className="mt-2 text-xs text-muted">
        {pins.length} pins shown.{missing > 0 && ` ${missing} clients have no map location yet (add an address on their page).`} Tap a pin to open the client.
      </p>
    </>
  );
}

async function RouteView({ day, qs }: { day?: string; qs: (p: Record<string, string | undefined>) => string }) {
  const start = parseYmd(day);
  const jobs = await prisma.job.findMany({
    where: { startAt: { gte: start, lt: addDays(start, 1) }, status: { notIn: ["CANCELED", "NO_SHOW"] } },
    orderBy: { startAt: "asc" },
    include: { client: true, service: true, assignee: true },
  });
  const located = jobs
    .map((j) => ({ j, lat: j.lat ?? j.client.lat, lng: j.lng ?? j.client.lng }))
    .filter((x): x is typeof x & { lat: number; lng: number } => x.lat != null && x.lng != null);
  const pins: Pin[] = located.map(({ j, lat, lng }, i) => ({
    id: j.id,
    lat,
    lng,
    n: i + 1,
    color: j.assignee?.color ?? "#0e7c86",
    title: `${i + 1}. ${j.client.name}`,
    sub: `${fmtTime(j.startAt)} · ${j.service?.name ?? j.title}`,
    href: `/schedule/${j.id}`,
  }));
  const route = located.map((x) => [x.lat, x.lng] as [number, number]);
  const stops = jobs.map((j) => `${j.address || j.client.address} ${j.city || j.client.city}`.trim()).filter(Boolean);
  const gmaps =
    stops.length > 0
      ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(stops[stops.length - 1])}${
          stops.length > 1 ? `&waypoints=${encodeURIComponent(stops.slice(0, -1).join("|"))}` : ""
        }&travelmode=driving`
      : null;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link href={qs({ day: ymd(addDays(start, -1)) })} className={btn.outline}>←</Link>
        <p className="min-w-32 text-center font-semibold">{fmtDay(start)}</p>
        <Link href={qs({ day: ymd(addDays(start, 1)) })} className={btn.outline}>→</Link>
        <Link href={qs({ day: undefined })} className={btn.ghost}>Today</Link>
        {gmaps && <a href={gmaps} target="_blank" rel="noreferrer" className={`${btn.primary} ml-auto`}>Open route in Google Maps</a>}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <MapView pins={pins} route={route} center={BRAND.mapCenter} className="h-[50dvh] lg:h-[70dvh]" />
        <Card title={`${jobs.length} stops`} pad={false}>
          {jobs.length === 0 ? (
            <p className="p-4 text-sm text-muted">No jobs this day.</p>
          ) : (
            <ol className="divide-y divide-border">
              {jobs.map((j, i) => (
                <li key={j.id}>
                  <Link href={`/schedule/${j.id}`} className="flex gap-3 px-4 py-3 hover:bg-surface-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: j.assignee?.color ?? "#0e7c86" }}>{i + 1}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{fmtTime(j.startAt)} · {j.client.name}</p>
                      <p className="truncate text-xs text-muted">{j.address || j.client.address}, {j.city || j.client.city}</p>
                      <div className="mt-1 flex items-center gap-1.5">
                        <Badge color={JOB_STATUS_COLOR[j.status]}>{JOB_STATUS_LABEL[j.status]}</Badge>
                        <span className="text-xs text-muted">{j.service?.name ?? j.title}{j.assignee ? ` · ${j.assignee.name}` : ""}</span>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </>
  );
}
