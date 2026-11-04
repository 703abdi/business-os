import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Badge, Card, Empty, Page, btn, input, label } from "@/components/app/ui";
import { AutoSelect, ConfirmSubmit, Disclosure, Submit } from "@/components/app/client";
import { Icon } from "@/components/app/Icon";
import { ago, duration, fmtDate, fmtDay, fmtTime, toLocalInput, addDays } from "@/lib/dates";
import { usd } from "@/lib/money";
import { BRAND } from "@/config/brand";
import {
  addFollowUp, deleteClient, deleteVehicle, logActivity, markReplied, saveVehicle, setStageForm, toggleFollowUp, updateClient,
} from "@/modules/crm/actions";
import { SOURCES, SOURCE_LABEL, STAGES, STAGE_COLOR, STAGE_LABEL, VEHICLE_SIZES, type SourceKey, type StageKey } from "@/modules/crm/constants";
import { SEQUENCES } from "@/modules/sales/sequences";
import { startSequence } from "@/modules/sales/actions";
import { JOB_STATUS_COLOR, JOB_STATUS_LABEL } from "@/modules/schedule/constants";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await prisma.client.findUnique({
    where: { id },
    include: {
      vehicles: { orderBy: { createdAt: "asc" } },
      jobs: { orderBy: { startAt: "desc" }, include: { service: true, assignee: true } },
      activities: { orderBy: { createdAt: "desc" }, take: 100 },
      followUps: { orderBy: [{ doneAt: "asc" }, { dueAt: "asc" }], include: { assignee: true } },
      quotes: { orderBy: { createdAt: "desc" } },
      memberships: { include: { plan: true }, orderBy: { startedAt: "desc" } },
      payments: { select: { amount: true } },
    },
  });
  if (!c) notFound();
  const team = await prisma.teamMember.findMany({ where: { active: true }, orderBy: { createdAt: "asc" } });

  const stage = c.stage as StageKey;
  const now = new Date();
  const lifetime = c.payments.reduce((s, p) => s + p.amount, 0);
  const replyMin = c.firstReplyAt ? (c.firstReplyAt.getTime() - c.leadAt.getTime()) / 60000 : null;
  const waitingMin = (now.getTime() - c.leadAt.getTime()) / 60000;
  const tel = c.phone.replace(/[^\d+]/g, "");
  const activeMember = c.memberships.find((m) => m.status === "ACTIVE");

  return (
    <Page>
      <Link href="/crm" className="mb-3 inline-flex items-center gap-1 text-sm text-muted">← Clients</Link>

      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{c.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge color={STAGE_COLOR[stage]}>{STAGE_LABEL[stage]}</Badge>
            {activeMember && <Badge color="gold">{activeMember.plan.name}{activeMember.founding ? " · founding" : ""}</Badge>}
            {c.ceramic && <Badge color="purple">Ceramic</Badge>}
            <Badge>{SOURCE_LABEL[c.source as SourceKey]}</Badge>
            {c.tags.map((t) => <Badge key={t} color="blue">{t}</Badge>)}
            {c.isSample && <Badge color="amber">Sample</Badge>}
          </div>
          <p className="mt-1.5 text-sm text-muted">
            Lead {fmtDate(c.leadAt)} ·{" "}
            {replyMin !== null ? (
              <span className={replyMin <= BRAND.speedToLeadMinutes ? "text-good" : "text-warn"}>first reply in {duration(replyMin)}</span>
            ) : (
              <span className="font-semibold text-bad">no reply yet ({duration(waitingMin)})</span>
            )}
            {lifetime > 0 && <> · {usd(lifetime)} lifetime</>}
          </p>
        </div>
        <form action={setStageForm.bind(null, c.id)} className="flex items-center gap-2">
          <AutoSelect name="stage" defaultValue={stage} className={`${input} w-auto`} options={STAGES.map((s) => ({ value: s, label: STAGE_LABEL[s] }))} />
        </form>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2 md:flex md:flex-wrap">
        {tel && <a href={`tel:${tel}`} className={btn.primary}><Icon name="phone" className="h-4 w-4" /> Call</a>}
        {tel && <a href={`sms:${tel}`} className={btn.outline}><Icon name="message" className="h-4 w-4" /> Text</a>}
        {c.address && (
          <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${c.address} ${c.city}`)}`} target="_blank" rel="noreferrer" className={btn.outline}>
            <Icon name="pin" className="h-4 w-4" /> Directions
          </a>
        )}
        <Link href={`/schedule/new?client=${c.id}`} className={btn.outline}>Book job</Link>
        <Link href={`/sales/quote?client=${c.id}`} className={btn.outline}>Quote</Link>
        {!activeMember && <Link href={`/memberships?client=${c.id}#join`} className={btn.outline}>Membership</Link>}
        {!c.firstReplyAt && (
          <form action={markReplied.bind(null, c.id)} className="contents">
            <Submit className={`${btn.outline} border-green-300 text-good`}>Mark replied</Submit>
          </form>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Log a touch">
            <form action={logActivity.bind(null, c.id)} className="space-y-2">
              <textarea name="body" rows={2} className={input} placeholder="What happened? (e.g. Texted price for Elite, waiting on date)" />
              <div className="flex flex-wrap gap-2">
                {(["text", "call", "email", "note"] as const).map((k) => (
                  <button key={k} name="kind" value={k} className={k === "text" ? btn.primary : btn.outline}>
                    {k === "note" ? "Save note" : `Log ${k}`}
                  </button>
                ))}
              </div>
            </form>
          </Card>

          <Card title={`Vehicles (${c.vehicles.length})`}>
            <div className="space-y-3">
              {c.vehicles.map((v) => (
                <Disclosure
                  key={v.id}
                  className="rounded-lg border border-border p-3"
                  summary={
                    <span>
                      <Icon name="car" className="mr-1.5 inline h-4 w-4 text-muted" />
                      {[v.year, v.make, v.model].filter(Boolean).join(" ") || "Reference"}
                      <span className="ml-1 font-normal text-muted">{[v.color, v.size].filter(Boolean).join(" · ")}</span>
                    </span>
                  }
                >
                  {v.condition && <p className="mb-2 whitespace-pre-wrap text-sm text-muted">{v.condition}</p>}
                  {v.photos.length > 0 && (
                    <div className="mb-3 flex gap-2 overflow-x-auto">
                      {v.photos.map((p) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <a key={p} href={p} target="_blank" rel="noreferrer"><img src={p} alt="" className="h-20 w-28 rounded-md object-cover" /></a>
                      ))}
                    </div>
                  )}
                  <VehicleForm action={saveVehicle.bind(null, c.id, v.id)} v={v} />
                  <form action={deleteVehicle.bind(null, c.id, v.id)} className="mt-2">
                    <ConfirmSubmit message="Delete this reference?" className="text-xs text-bad">Delete reference</ConfirmSubmit>
                  </form>
                </Disclosure>
              ))}
              <Disclosure summary="+ Add reference" className="rounded-lg border border-dashed border-border p-3" open={c.vehicles.length === 0}>
                <VehicleForm action={saveVehicle.bind(null, c.id, null)} />
              </Disclosure>
            </div>
          </Card>

          <Card title={`Jobs (${c.jobs.length})`} pad={false}>
            {c.jobs.length === 0 ? (
              <Empty>No jobs yet.</Empty>
            ) : (
              <ul className="divide-y divide-border">
                {c.jobs.map((j) => (
                  <li key={j.id}>
                    <Link href={`/schedule/${j.id}`} className="flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-surface-2">
                      <div>
                        <p className="text-sm font-medium">{j.service?.name ?? j.title ?? "Job"}</p>
                        <p className="text-xs text-muted">{fmtDay(j.startAt)} {fmtTime(j.startAt)}{j.assignee ? ` · ${j.assignee.name}` : ""}</p>
                      </div>
                      <div className="text-right">
                        <Badge color={JOB_STATUS_COLOR[j.status]}>{JOB_STATUS_LABEL[j.status]}</Badge>
                        <p className="mt-0.5 text-xs text-muted">{j.price ? usd(j.price) : j.membershipId ? "member visit" : ""}</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Timeline" pad={false}>
            {c.activities.length === 0 ? (
              <Empty>Nothing logged yet.</Empty>
            ) : (
              <ul className="divide-y divide-border">
                {c.activities.map((a) => (
                  <li key={a.id} className="px-4 py-2.5">
                    <p className="text-xs text-muted">
                      <span className="font-semibold uppercase">{a.kind}</span> · {fmtDay(a.createdAt)} {fmtTime(a.createdAt)} · {ago(a.createdAt)}
                    </p>
                    <p className="whitespace-pre-wrap text-sm">{a.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Follow-ups">
            <ul className="mb-3 space-y-2">
              {c.followUps.map((f) => (
                <li key={f.id} className="flex items-start gap-2">
                  <form action={toggleFollowUp.bind(null, f.id)}>
                    <button className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded border ${f.doneAt ? "border-good bg-good text-white" : "border-border"}`} aria-label="Toggle done">
                      {f.doneAt && <Icon name="check" className="h-3.5 w-3.5" />}
                    </button>
                  </form>
                  <div className={f.doneAt ? "text-muted line-through" : ""}>
                    <p className="text-sm">{f.title}</p>
                    <p className={`text-xs ${!f.doneAt && f.dueAt < new Date() ? "font-semibold text-bad" : "text-muted"}`}>
                      {fmtDay(f.dueAt)} {fmtTime(f.dueAt)}{f.assignee ? ` · ${f.assignee.name}` : ""}{f.sequence ? ` · ${f.sequence}` : ""}
                    </p>
                  </div>
                </li>
              ))}
              {c.followUps.length === 0 && <li className="text-sm text-muted">None.</li>}
            </ul>
            <form action={addFollowUp.bind(null, c.id)} className="space-y-2">
              <input name="title" placeholder="Follow up about..." className={input} />
              <div className="flex gap-2">
                <input name="dueAt" type="datetime-local" defaultValue={toLocalInput(addDays(new Date(), 1))} className={input} />
                <select name="assigneeId" className={`${input} w-auto`}>
                  <option value="">Anyone</option>
                  {team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <button className={btn.outline}>Add follow-up</button>
            </form>
            <div className="mt-3 border-t border-border pt-3">
              <p className={label}>Start a sequence</p>
              <form action={startSequence.bind(null, c.id)} className="flex gap-2">
                <select name="sequence" className={input}>
                  {SEQUENCES.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
                </select>
                <button className={btn.outline}>Start</button>
              </form>
            </div>
          </Card>

          {(c.memberships.length > 0 || c.quotes.length > 0) && (
            <Card title="Memberships & quotes">
              <ul className="space-y-2 text-sm">
                {c.memberships.map((m) => (
                  <li key={m.id} className="flex justify-between">
                    <span>{m.plan.name} {m.founding && <Badge color="gold">founding</Badge>}</span>
                    <span className="text-muted">{usd(m.price)}/mo · {m.status.toLowerCase()}</span>
                  </li>
                ))}
                {c.quotes.map((q) => (
                  <li key={q.id} className="flex justify-between">
                    <Link href={`/sales/quote?id=${q.id}`} className="text-brand">Quote {fmtDate(q.createdAt)}</Link>
                    <span className="text-muted">{usd(q.total)} · {q.status}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title="Contact info">
            <form action={updateClient.bind(null, c.id)} className="space-y-2.5">
              <div><label className={label}>Name</label><input name="name" defaultValue={c.name} className={input} /></div>
              <div><label className={label}>Phone</label><input name="phone" type="tel" defaultValue={c.phone} className={input} /></div>
              <div><label className={label}>Email</label><input name="email" type="email" defaultValue={c.email} className={input} /></div>
              <div><label className={label}>Address</label><input name="address" defaultValue={c.address} className={input} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className={label}>City</label><input name="city" defaultValue={c.city} className={input} /></div>
                <div><label className={label}>ZIP</label><input name="zip" defaultValue={c.zip} className={input} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className={label}>Lat</label><input name="lat" defaultValue={c.lat ?? ""} className={input} /></div>
                <div><label className={label}>Lng</label><input name="lng" defaultValue={c.lng ?? ""} className={input} /></div>
              </div>
              <div>
                <label className={label}>Source</label>
                <select name="source" defaultValue={c.source} className={input}>
                  {SOURCES.map((s) => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
                </select>
              </div>
              <div><label className={label}>Tags (comma separated)</label><input name="tags" defaultValue={c.tags.join(", ")} className={input} /></div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="ceramic" defaultChecked={c.ceramic} className="h-4 w-4" /> Has ceramic coating</label>
              <div><label className={label}>Notes</label><textarea name="notes" rows={3} defaultValue={c.notes} className={input} /></div>
              <Submit className={btn.primary}>Save</Submit>
            </form>
          </Card>

          <form action={deleteClient.bind(null, c.id)}>
            <ConfirmSubmit message={`Delete ${c.name} and all their jobs, vehicles and notes?`} className={`${btn.danger} w-full`}>
              Delete client
            </ConfirmSubmit>
          </form>
        </div>
      </div>
    </Page>
  );
}

function VehicleForm({
  action,
  v,
}: {
  action: (fd: FormData) => Promise<void>;
  v?: { year: number | null; make: string; model: string; color: string; size: string; condition: string; photos: string[] };
}) {
  return (
    <form action={action} className="grid grid-cols-2 gap-2 md:grid-cols-4">
      <div><label className={label}>Year</label><input name="year" inputMode="numeric" defaultValue={v?.year ?? ""} className={input} /></div>
      <div><label className={label}>Make</label><input name="make" defaultValue={v?.make} className={input} /></div>
      <div><label className={label}>Model</label><input name="model" defaultValue={v?.model} className={input} /></div>
      <div><label className={label}>Color</label><input name="color" defaultValue={v?.color} className={input} /></div>
      <div>
        <label className={label}>Size</label>
        <select name="size" defaultValue={v?.size ?? "sedan"} className={input}>
          {VEHICLE_SIZES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
      <div className="col-span-2 md:col-span-3"><label className={label}>Condition notes</label><input name="condition" defaultValue={v?.condition} className={input} placeholder="Pet hair in back, light swirls on hood" /></div>
      <div className="col-span-2 md:col-span-4">
        <label className={label}>Photo links (one per line or space separated)</label>
        <textarea name="photos" rows={2} defaultValue={v?.photos.join("\n")} className={input} placeholder="https://..." />
      </div>
      <div className="col-span-2"><Submit className={btn.outline}>Save reference</Submit></div>
    </form>
  );
}
