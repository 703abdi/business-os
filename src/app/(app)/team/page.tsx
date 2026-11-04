import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Badge, Card, Page, PageHeader, Progress, btn, input, label } from "@/components/app/ui";
import { Disclosure, Submit } from "@/components/app/client";
import { addDays, startOfWeek } from "@/lib/dates";
import { pct, usd } from "@/lib/money";
import { saveMember } from "@/modules/team/actions";
import { TRAINING } from "@/modules/team/training";

export const metadata = { title: "Team" };

export default async function TeamPage() {
  const ws = startOfWeek();
  const members = await prisma.teamMember.findMany({
    orderBy: [{ active: "desc" }, { createdAt: "asc" }],
    include: {
      jobs: { where: { status: "DONE" }, orderBy: { startAt: "desc" }, take: 20, select: { photosBefore: true, photosAfter: true, walkthrough: true, reviewAsked: true } },
      payEntries: { where: { paid: false }, select: { amount: true } },
      training: true,
      _count: { select: { jobs: { where: { startAt: { gte: ws, lt: addDays(ws, 7) }, status: { notIn: ["CANCELED", "NO_SHOW"] } } } } },
    },
  });

  return (
    <Page>
      <PageHeader title="Team" sub="Crew, pay, checklists and training" />
      <div className="grid gap-3 md:grid-cols-2">
        {members.map((m) => {
          const full = m.jobs.filter((j) => j.photosBefore && j.photosAfter && j.walkthrough && j.reviewAsked).length;
          const passed = m.training.filter((t) => t.status === "passed").length;
          const owed = m.payEntries.reduce((s, p) => s + p.amount, 0);
          return (
            <Link key={m.id} href={`/team/${m.id}`} className={`block rounded-xl border border-border bg-surface p-4 hover:border-brand ${m.active ? "" : "opacity-60"}`}>
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: m.color }}>
                  {m.name.slice(0, 1)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{m.name} {m.isOwner && <Badge color="teal">Owner</Badge>} {!m.active && <Badge>Inactive</Badge>}</p>
                  <p className="text-xs text-muted">{m.role} · {m.payType === "owner" ? "owner" : m.payType === "hourly" ? `${usd(m.payRate)}/hr` : `${usd(m.payRate)}/job`}</p>
                </div>
                <div className="text-right text-xs">
                  <p className="font-bold">{m._count.jobs} jobs</p>
                  <p className="text-muted">this week</p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
                <div>
                  <p className="text-muted">Checklist</p>
                  <p className="font-semibold">{m.jobs.length ? pct(full / m.jobs.length) : "—"}</p>
                </div>
                <div>
                  <p className="text-muted">Training</p>
                  <p className="font-semibold">{passed}/{TRAINING.length}</p>
                  <Progress value={passed} max={TRAINING.length} />
                </div>
                <div>
                  <p className="text-muted">Pay owed</p>
                  <p className={`font-semibold ${owed ? "text-warn" : ""}`}>{usd(owed)}</p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
      <Card className="mt-4">
        <Disclosure summary="+ Add team member">
          <form action={saveMember} className="grid gap-2 md:grid-cols-3">
            <div><label className={label}>Name</label><input name="name" required className={input} /></div>
            <div><label className={label}>Role</label><input name="role" defaultValue="Team member" className={input} /></div>
            <div><label className={label}>Phone</label><input name="phone" type="tel" className={input} /></div>
            <div>
              <label className={label}>Pay type</label>
              <select name="payType" className={input}>
                <option value="per_job">Per job</option>
                <option value="hourly">Hourly</option>
                <option value="owner">Owner (no pay tracking)</option>
              </select>
            </div>
            <div><label className={label}>Rate ($)</label><input name="payRate" inputMode="numeric" className={input} /></div>
            <div><label className={label}>Calendar color</label><input name="color" type="color" defaultValue="#2563eb" className="h-10 w-full rounded-lg border border-border" /></div>
            <div className="md:col-span-3"><Submit className={btn.primary}>Add</Submit></div>
          </form>
        </Disclosure>
      </Card>
    </Page>
  );
}
