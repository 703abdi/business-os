import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { BRAND } from "@/config/brand";
import { Badge, Card, Page, PageHeader, Progress, btn } from "@/components/app/ui";
import { Icon } from "@/components/app/Icon";
import { addDays, endOfDay, fmtDay, fmtTime, parseYmd, startOfWeek, weekWindows, ymd } from "@/lib/dates";
import { usd } from "@/lib/money";
import { ACTIVE_JOB, JOB_STATUS_COLOR, JOB_STATUS_LABEL } from "@/modules/schedule/constants";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Schedule" };

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ week?: string; who?: string; view?: string; date?: string }> }) {
  const sp = await searchParams;
  const viewer = await requireUser();
  const employeeWhere = viewer.role === "EMPLOYEE" ? { assigneeId: viewer.teamMemberId ?? "__none__" } : {};
  const view = sp.view === "day" ? "day" : "week";
  const day = parseYmd(sp.date);
  const weekStart = startOfWeek(parseYmd(sp.week));
  const weekEnd = addDays(weekStart, 7);
  const capacityFilter = { ...employeeWhere, ...(viewer.role === "ADMIN" && sp.who ? { assigneeId: sp.who === "none" ? null : sp.who } : {}) };
  const capacityWeeks = weekWindows(weekStart, 4);
  const [jobs, team, nextWeeks] = await Promise.all([
    prisma.job.findMany({
      where: { startAt: view === "day" ? { gte: day, lt: endOfDay(day) } : { gte: weekStart, lt: weekEnd }, ...employeeWhere, ...(viewer.role === "ADMIN" && sp.who ? { assigneeId: sp.who === "none" ? null : sp.who } : {}) },
      orderBy: { startAt: "asc" },
      include: { client: true, service: true, assignee: true, vehicle: true },
    }),
    prisma.teamMember.findMany({ where: viewer.role === "EMPLOYEE" ? { id: viewer.teamMemberId ?? "__none__", active: true } : { active: true }, orderBy: { createdAt: "asc" } }),
    Promise.all(capacityWeeks.map(async ({ start, end }) => ({ start, n: await prisma.job.count({ where: { startAt: { gte: start, lt: end }, status: { in: ACTIVE_JOB }, ...capacityFilter } }) }))),
  ]);
  const active = jobs.filter((j) => ACTIVE_JOB.includes(j.status));
  const currentCapacity = nextWeeks[0]?.n ?? 0;
  const max = BRAND.capacity.maxJobsPerWeek;
  const today = ymd(new Date());
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ week: sp.week, who: sp.who, ...patch })) if (v) p.set(k, v);
    return `/schedule?${p}`;
  };

  return (
    <Page wide>
      <PageHeader
        title="Schedule"
        sub={`${view === "day" ? fmtDay(day) : `Week of ${fmtDay(weekStart)}`} · ${active.length} jobs${viewer.role === "ADMIN" ? ` · ${usd(active.reduce((s, j) => s + j.price, 0))} booked` : ""}`}
        actions={
          <>
            <Link href={view === "day" ? `/schedule?view=day&date=${ymd(addDays(day, -1))}` : qs({ week: ymd(addDays(weekStart, -7)) })} className={btn.outline} aria-label="Previous">←</Link>
            <Link href={view === "day" ? "/schedule?view=day" : qs({ week: undefined })} className={btn.outline}>Today</Link>
            <Link href={view === "day" ? `/schedule?view=day&date=${ymd(addDays(day, 1))}` : qs({ week: ymd(addDays(weekStart, 7)) })} className={btn.outline} aria-label="Next">→</Link>
            {viewer.role === "ADMIN" && <Link href="/schedule/new" className={btn.primary}><Icon name="plus" className="h-4 w-4" /> Book job</Link>}
          </>
        }
      />

      <div className="mb-3 flex gap-2"><Link href={`/schedule?view=week&week=${ymd(weekStart)}`} className={view === "week" ? btn.primary : btn.outline}>Week</Link><Link href={`/schedule?view=day&date=${ymd(day)}`} className={view === "day" ? btn.primary : btn.outline}>Day</Link></div>

      {view === "day" ? <DayGrid jobs={jobs} team={team} day={day} /> : <>

      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_2fr]">
        <Card>
          <div className="mb-1 flex items-baseline justify-between">
            <p className="text-sm font-semibold">Capacity this week</p>
            <p className="text-sm tabular-nums"><b>{currentCapacity}</b> / {max} jobs</p>
          </div>
          <Progress value={currentCapacity} max={max} tone={currentCapacity >= max ? "warn" : "brand"} />
          <p className="mt-1.5 text-xs text-muted">{Math.max(0, max - currentCapacity)} open slots.</p>
        </Card>
        <Card>
          <p className="mb-2 text-sm font-semibold">Next 4 weeks</p>
          <div className="grid grid-cols-4 gap-2">
            {nextWeeks.map((w) => (
              <Link key={w.start.toISOString()} href={qs({ week: ymd(w.start) })} className="rounded-lg border border-border p-2 hover:border-brand">
                <p className="text-[11px] text-muted">{fmtDay(w.start)}</p>
                <p className="font-bold tabular-nums">{w.n}<span className="text-xs font-normal text-muted">/{max}</span></p>
                <Progress value={w.n} max={max} />
              </Link>
            ))}
          </div>
        </Card>
      </div>

      {viewer.role === "ADMIN" && <div className="-mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:px-0">
        <Link href={qs({ who: undefined })} className={`rounded-full border px-3 py-1 text-xs ${!sp.who ? "border-brand bg-brand text-white" : "border-border bg-surface"}`}>Everyone</Link>
        {team.map((t) => (
          <Link key={t.id} href={qs({ who: t.id })} className={`rounded-full border px-3 py-1 text-xs ${sp.who === t.id ? "border-brand bg-brand text-white" : "border-border bg-surface"}`}>{t.name}</Link>
        ))}
        <Link href={qs({ who: "none" })} className={`rounded-full border px-3 py-1 text-xs ${sp.who === "none" ? "border-brand bg-brand text-white" : "border-border bg-surface"}`}>Unassigned</Link>
      </div>}

      {view === "week" && <div className="grid gap-3 md:grid-cols-7">
        {days.map((d) => {
          const dayJobs = jobs.filter((j) => j.startAt >= d && j.startAt < addDays(d, 1));
          const isToday = ymd(d) === today;
          return (
            <div key={d.toISOString()} className={`rounded-xl border bg-surface ${isToday ? "border-brand" : "border-border"} ${dayJobs.length === 0 ? "hidden md:block" : ""}`}>
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <p className={`text-sm font-semibold ${isToday ? "text-brand" : ""}`}>{fmtDay(d)}</p>
                {dayJobs.length > 0 && (
                  <Link href={`/map?view=route&day=${ymd(d)}`} className="text-[11px] text-brand">Route</Link>
                )}
              </div>
              <div className="space-y-2 p-2">
                {dayJobs.map((j) => (
                  <Link
                    key={j.id}
                    href={`/schedule/${j.id}`}
                    className={`block rounded-lg border-l-4 bg-surface-2 p-2 hover:bg-brand-soft ${j.status === "CANCELED" || j.status === "NO_SHOW" ? "opacity-50" : ""}`}
                    style={{ borderLeftColor: j.assignee?.color ?? "var(--muted-2)" }}
                  >
                    <p className="text-xs text-muted">{fmtTime(j.startAt)} · {Math.round(j.durationMin / 60 * 10) / 10}h</p>
                    <p className="text-sm font-semibold leading-tight">{j.client.name}</p>
                    <p className="truncate text-xs text-muted">{j.service?.name ?? j.title}{j.city ? ` · ${j.city}` : ""}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <Badge color={JOB_STATUS_COLOR[j.status]}>{JOB_STATUS_LABEL[j.status]}</Badge>
                      {j.assignee ? <span className="text-[11px] text-muted">{j.assignee.name}</span> : <span className="text-[11px] font-semibold text-warn">Unassigned</span>}
                    </div>
                  </Link>
                ))}
                {dayJobs.length === 0 && <p className="py-3 text-center text-xs text-muted-2">Open</p>}
              </div>
            </div>
          );
        })}
      </div>
      }
      </>}
      {active.length === 0 && <p className="mt-4 text-center text-sm text-muted md:hidden">No jobs this week.</p>}
      <p className="mt-6 text-xs text-muted">Bookings added through Acuity appear here automatically once the integration is connected.</p>
    </Page>
  );
}

function DayGrid({ jobs, team, day }: { jobs: { id: string; startAt: Date; durationMin: number; status: string; client: { name: string }; service: { name: string } | null; title: string; assignee: { name: string } | null }[]; team: { id: string; name: string }[]; day: Date }) { const hours = Array.from({ length: 14 }, (_, i) => i + 7); return <div className="overflow-x-auto rounded-xl border border-border bg-surface"><div className="grid min-w-[620px]" style={{ gridTemplateColumns: `64px repeat(${Math.max(team.length, 1)}, minmax(180px, 1fr))` }}><div className="border-b border-border p-2 text-xs text-muted">Time</div>{team.map((m) => <div key={m.id} className="border-b border-l border-border p-2 text-sm font-semibold">{m.name}</div>)}{hours.map((hour) => <><div key={`h-${hour}`} className="border-b border-border p-2 text-xs text-muted">{hour > 12 ? hour - 12 : hour}:00 {hour >= 12 ? "PM" : "AM"}</div>{team.map((m) => <div key={`${hour}-${m.id}`} className="min-h-16 border-b border-l border-border p-1">{jobs.filter((j) => j.assignee?.name === m.name && j.startAt.getHours() === hour).map((j) => <Link key={j.id} href={`/schedule/${j.id}`} className="block rounded bg-brand-soft p-1.5 text-xs text-brand-dark"><b>{j.client.name}</b><br />{j.service?.name ?? j.title}</Link>)}</div>)}</>)}</div><p className="p-3 text-xs text-muted">{fmtDay(day)} · day capacity {jobs.length}/{BRAND.capacity.maxJobsPerDay} jobs</p></div>; }
