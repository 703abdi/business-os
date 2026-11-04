import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Badge, Card, Empty, Page, btn, input, label } from "@/components/app/ui";
import { AutoSelect, Disclosure, Submit } from "@/components/app/client";
import { fmtDate, fmtDay, fmtTime, startOfDay, ymd } from "@/lib/dates";
import { pct, usd } from "@/lib/money";
import { addPayEntry, addTeamNote, markAllPaid, saveMember, setTraining } from "@/modules/team/actions";
import { TRAINING, TRAINING_LABEL, TRAINING_STATUS } from "@/modules/team/training";
import { JOB_STATUS_COLOR, JOB_STATUS_LABEL } from "@/modules/schedule/constants";
import { createLogin, resetPassword, setUserActive } from "@/modules/team/access-actions";

const NOTE_COLOR = { praise: "green", issue: "red", note: "gray" } as const;

export default async function MemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = await prisma.teamMember.findUnique({
    where: { id },
    include: {
      jobs: { orderBy: { startAt: "desc" }, take: 60, include: { client: true, service: true } },
      payEntries: { orderBy: { date: "desc" }, take: 50, include: { job: { include: { client: true } } } },
      notes: { orderBy: { createdAt: "desc" } },
      training: true,
      user: true,
    },
  });
  if (!m) notFound();
  const today = startOfDay();
  const upcoming = m.jobs.filter((j) => j.startAt >= today && !["CANCELED", "NO_SHOW", "DONE"].includes(j.status)).reverse();
  const done = m.jobs.filter((j) => j.status === "DONE").slice(0, 20);
  const rate = (k: "photosBefore" | "photosAfter" | "walkthrough" | "reviewAsked") => (done.length ? done.filter((j) => j[k]).length / done.length : 0);
  const owed = m.payEntries.filter((p) => !p.paid).reduce((s, p) => s + p.amount, 0);
  const status = (skill: string) => m.training.find((t) => t.skill === skill)?.status ?? "not_started";

  return (
    <Page>
      <Link href="/team" className="mb-3 inline-flex text-sm text-muted">← Team</Link>
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold text-white" style={{ background: m.color }}>{m.name.slice(0, 1)}</span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{m.name}</h1>
          <p className="text-sm text-muted">{m.role}{m.phone && ` · ${m.phone}`}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={`Upcoming jobs (${upcoming.length})`} pad={false}>
          {upcoming.length === 0 ? <Empty>Nothing assigned.</Empty> : (
            <ul className="divide-y divide-border">
              {upcoming.map((j) => (
                <li key={j.id}>
                  <Link href={`/schedule/${j.id}`} className="flex items-center justify-between px-4 py-2.5 hover:bg-surface-2">
                    <div>
                      <p className="text-sm font-semibold">{j.client.name}</p>
                      <p className="text-xs text-muted">{fmtDay(j.startAt)} {fmtTime(j.startAt)} · {j.service?.name ?? j.title}</p>
                    </div>
                    <Badge color={JOB_STATUS_COLOR[j.status]}>{JOB_STATUS_LABEL[j.status]}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={`Checklist, last ${done.length} jobs`}>
          {done.length === 0 ? <Empty>No finished jobs yet.</Empty> : (
            <div className="grid grid-cols-2 gap-3">
              {([["photosBefore", "Before photos"], ["photosAfter", "After photos"], ["walkthrough", "Walkthrough"], ["reviewAsked", "Review ask"]] as const).map(([k, l]) => (
                <div key={k} className="rounded-lg bg-surface-2 p-3">
                  <p className="text-xs text-muted">{l}</p>
                  <p className={`text-xl font-bold ${rate(k) >= 0.9 ? "text-good" : rate(k) >= 0.6 ? "text-warn" : "text-bad"}`}>{pct(rate(k))}</p>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Customer-service training" className="lg:col-span-2" pad={false}>
          <ul className="divide-y divide-border">
            {TRAINING.map((t) => (
              <li key={t.key} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{t.title}</p>
                  <p className="text-xs text-muted">{t.detail}</p>
                </div>
                <form action={setTraining.bind(null, m.id, t.key)}>
                  <AutoSelect
                    name="status"
                    defaultValue={status(t.key)}
                    className={`rounded-md border px-2 py-1 text-xs ${status(t.key) === "passed" ? "border-green-300 bg-green-50" : status(t.key) === "practicing" ? "border-amber-300 bg-amber-50" : "border-border bg-surface"}`}
                    options={TRAINING_STATUS.map((s) => ({ value: s, label: TRAINING_LABEL[s] }))}
                  />
                </form>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Performance notes">
          <form action={addTeamNote.bind(null, m.id)} className="mb-3 space-y-2">
            <textarea name="body" rows={2} className={input} placeholder="What happened on the job?" />
            <div className="flex gap-2">
              <button name="kind" value="praise" className={btn.outline}>+ Praise</button>
              <button name="kind" value="issue" className={btn.outline}>+ Issue</button>
              <button name="kind" value="note" className={btn.ghost}>Note</button>
            </div>
          </form>
          <ul className="space-y-2">
            {m.notes.map((n) => (
              <li key={n.id} className="rounded-lg bg-surface-2 p-2.5 text-sm">
                <p className="mb-0.5 text-xs text-muted"><Badge color={NOTE_COLOR[n.kind as keyof typeof NOTE_COLOR] ?? "gray"}>{n.kind}</Badge> {fmtDate(n.createdAt)}</p>
                {n.body}
              </li>
            ))}
            {m.notes.length === 0 && <li className="text-sm text-muted">No notes yet.</li>}
          </ul>
        </Card>

        <Card
          title={`Pay · ${usd(owed)} owed`}
          action={owed > 0 ? <form action={markAllPaid.bind(null, m.id)}><Submit className={btn.small}>Mark all paid</Submit></form> : undefined}
        >
          {m.payType === "owner" ? <p className="text-sm text-muted">Owner: pay isn&apos;t tracked.</p> : (
            <>
              <p className="mb-2 text-xs text-muted">Pay is added automatically when a job assigned to {m.name} is marked done ({m.payType === "hourly" ? `${usd(m.payRate)}/hr × job length` : `${usd(m.payRate)} per job`}).</p>
              <ul className="mb-3 divide-y divide-border text-sm">
                {m.payEntries.map((p) => (
                  <li key={p.id} className="flex justify-between py-1.5">
                    <span>{fmtDate(p.date)} · {p.job?.client.name ?? p.note ?? "Manual"}{p.hours ? ` · ${p.hours}h` : ""}</span>
                    <span className={p.paid ? "text-muted" : "font-semibold"}>{usd(p.amount)}{p.paid ? " paid" : ""}</span>
                  </li>
                ))}
              </ul>
              <Disclosure summary="+ Add pay by hand">
                <form action={addPayEntry.bind(null, m.id)} className="grid grid-cols-2 gap-2">
                  <div><label className={label}>Date</label><input type="date" name="date" defaultValue={ymd(new Date())} className={input} /></div>
                  <div><label className={label}>Amount $</label><input name="amount" inputMode="numeric" className={input} /></div>
                  <div><label className={label}>Hours</label><input name="hours" inputMode="decimal" className={input} /></div>
                  <div><label className={label}>Note</label><input name="note" className={input} /></div>
                  <Submit className={btn.outline}>Add</Submit>
                </form>
              </Disclosure>
            </>
          )}
        </Card>

        <Card title="Dashboard login" className="lg:col-span-2">
          {m.user ? <div className="space-y-3"><p className="text-sm"><b>{m.user.email}</b> · {m.user.active ? <span className="text-good">Active</span> : <span className="text-bad">Deactivated</span>}</p><div className="flex flex-wrap gap-2"><form action={resetPassword.bind(null, m.user.id)} className="flex gap-2"><input name="password" type="password" minLength={8} required placeholder="New temp password" className={input} /><Submit className={btn.outline}>Reset password</Submit></form><form action={setUserActive.bind(null, m.user.id, !m.user.active)}><Submit className={m.user.active ? btn.danger : btn.outline}>{m.user.active ? "Deactivate" : "Reactivate"}</Submit></form></div></div> : <form action={createLogin.bind(null, m.id)} className="grid gap-2 md:grid-cols-3"><div><label className={label}>Login email</label><input name="email" type="email" required className={input} /></div><div><label className={label}>Temporary password</label><input name="password" type="password" minLength={8} required className={input} /></div><div className="flex items-end"><Submit className={btn.primary}>Create employee login</Submit></div></form>}
        </Card>

        <Card className="lg:col-span-2">
          <Disclosure summary="Edit profile">
            <form action={saveMember} className="grid gap-2 md:grid-cols-3">
              <input type="hidden" name="id" value={m.id} />
              <div><label className={label}>Name</label><input name="name" defaultValue={m.name} className={input} /></div>
              <div><label className={label}>Role</label><input name="role" defaultValue={m.role} className={input} /></div>
              <div><label className={label}>Phone</label><input name="phone" defaultValue={m.phone} className={input} /></div>
              <div>
                <label className={label}>Pay type</label>
                <select name="payType" defaultValue={m.payType} className={input}>
                  <option value="per_job">Per job</option>
                  <option value="hourly">Hourly</option>
                  <option value="owner">Owner</option>
                </select>
              </div>
              <div><label className={label}>Rate ($)</label><input name="payRate" defaultValue={m.payRate} className={input} /></div>
              <div><label className={label}>Color</label><input name="color" type="color" defaultValue={m.color} className="h-10 w-full rounded-lg border border-border" /></div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={m.active} className="h-4 w-4" /> Active</label>
              <div className="md:col-span-3"><Submit className={btn.primary}>Save</Submit></div>
            </form>
          </Disclosure>
        </Card>
      </div>
    </Page>
  );
}
