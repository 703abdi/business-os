import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { BRAND } from "@/config/brand";
import { Badge, Card, Page, btn } from "@/components/app/ui";
import { AutoCheck, AutoSelect, ConfirmSubmit, Disclosure } from "@/components/app/client";
import { Icon } from "@/components/app/Icon";
import { fmtDay, fmtTime, toLocalInput } from "@/lib/dates";
import { usd } from "@/lib/money";
import { deleteJob, saveJob, setChecklist, setJobStatus } from "@/modules/schedule/actions";
import { setPitch } from "@/modules/sales/actions";
import { JOB_STATUS_COLOR, JOB_STATUS_LABEL } from "@/modules/schedule/constants";
import { JobForm } from "@/modules/schedule/components/JobForm";
import { jobFormOptions } from "@/modules/schedule/form-data";
import { requireUser } from "@/lib/auth";

const NEXT: Record<string, { status: string; label: string }[]> = {
  SCHEDULED: [{ status: "CONFIRMED", label: "Mark confirmed" }, { status: "IN_PROGRESS", label: "Start job" }],
  CONFIRMED: [{ status: "IN_PROGRESS", label: "Start job" }, { status: "DONE", label: "Mark done" }],
  IN_PROGRESS: [{ status: "DONE", label: "Mark done" }],
  DONE: [],
  CANCELED: [{ status: "SCHEDULED", label: "Reopen" }],
  NO_SHOW: [{ status: "SCHEDULED", label: "Reopen" }],
};

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, viewer] = await Promise.all([params, requireUser()]);
  const j = await prisma.job.findUnique({
    where: { id },
    include: { client: true, service: true, assignee: true, vehicle: true, membership: { include: { plan: true } }, payments: true, payEntries: true },
  });
  if (!j) notFound();
  if (viewer.role === "EMPLOYEE" && j.assigneeId !== viewer.teamMemberId) notFound();
  const opts = await jobFormOptions();
  const tel = j.client.phone.replace(/[^\d+]/g, "");
  const addr = `${j.address || j.client.address} ${j.city || j.client.city}`.trim();
  const firstName = j.client.name.split(" ")[0];
  const reviewText = `Hey ${firstName}, thanks for choosing ${BRAND.name} today! If you're happy with the service, a quick Google review helps us a ton: ${BRAND.links.googleReview || "[review link]"}`;
  const checks = [
    { name: "photosBefore", label: "Before photos", on: j.photosBefore },
    { name: "photosAfter", label: "After photos", on: j.photosAfter },
    { name: "walkthrough", label: "Walked the customer around the service", on: j.walkthrough },
    { name: "reviewAsked", label: "Asked for a Google review", on: j.reviewAsked },
  ];
  const checklistDone = checks.filter((c) => c.on).length;

  return (
    <Page>
      <Link href="/schedule" className="mb-3 inline-flex text-sm text-muted">← Schedule</Link>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{fmtDay(j.startAt)} · {fmtTime(j.startAt)} · {Math.round((j.durationMin / 60) * 10) / 10}h</p>
          <h1 className="text-2xl font-bold tracking-tight">
            <Link href={`/crm/${j.client.id}`} className="hover:text-brand">{j.client.name}</Link>
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge color={JOB_STATUS_COLOR[j.status]}>{JOB_STATUS_LABEL[j.status]}</Badge>
            <span className="text-sm">{j.service?.name ?? j.title}</span>
            <span className="text-sm font-semibold">{j.membership ? `Member visit (${j.membership.plan.name})` : usd(j.price)}</span>
            {j.isSample && <Badge color="amber">Sample</Badge>}
          </div>
          {j.vehicle && <p className="mt-1 text-sm text-muted"><Icon name="car" className="mr-1 inline h-4 w-4" />{[j.vehicle.year, j.vehicle.make, j.vehicle.model, j.vehicle.color].filter(Boolean).join(" ")}{j.vehicle.condition && ` · ${j.vehicle.condition}`}</p>}
          <p className="text-sm text-muted">{j.assignee ? `Assigned to ${j.assignee.name}` : "Unassigned"}</p>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 md:flex md:flex-wrap">
        {NEXT[j.status].map((n) => (
          <form key={n.status} action={setJobStatus.bind(null, j.id)} className="contents">
            <button name="status" value={n.status} className={btn.primary}>{n.label}</button>
          </form>
        ))}
        {tel && <a href={`tel:${tel}`} className={btn.outline}><Icon name="phone" className="h-4 w-4" /> Call</a>}
        {tel && (
          <a href={`sms:${tel}?&body=${encodeURIComponent(`Hey ${firstName}, it's ${BRAND.owner} with ${BRAND.name}. Confirming your job ${fmtDay(j.startAt)} at ${fmtTime(j.startAt)}. Reply YES to confirm.`)}`} className={btn.outline}>
            <Icon name="message" className="h-4 w-4" /> Confirm text
          </a>
        )}
        {addr && (
          <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}`} target="_blank" rel="noreferrer" className={btn.outline}>
            <Icon name="pin" className="h-4 w-4" /> Navigate
          </a>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title={`Job checklist (${checklistDone}/4)`}>
          <form action={setChecklist.bind(null, j.id)} className="space-y-3">
            {checks.map((c) => <AutoCheck key={c.name} name={c.name} defaultChecked={c.on} label={c.label} />)}
          </form>
          {tel && (
            <a href={`sms:${tel}?&body=${encodeURIComponent(reviewText)}`} className={`${btn.outline} mt-4 w-full`}>
              <Icon name="star" className="h-4 w-4" /> Text the review link
            </a>
          )}
          {!BRAND.links.googleReview && <p className="mt-2 text-xs text-warn">A review link has not been configured yet.</p>}
        </Card>

        <Card title="Details">
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between gap-2"><dt className="text-muted">Address</dt><dd className="text-right">{addr || "—"}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted">Phone</dt><dd>{j.client.phone || "—"}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted">Paid</dt><dd>{j.payments.length ? usd(j.payments.reduce((s, p) => s + p.amount, 0)) : j.status === "DONE" ? "covered by plan" : "on completion"}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted">Crew pay</dt><dd>{j.payEntries.length ? usd(j.payEntries.reduce((s, p) => s + p.amount, 0)) : "—"}</dd></div>
          </dl>
          {j.notes && <p className="mt-3 whitespace-pre-wrap rounded-lg bg-surface-2 p-2.5 text-sm">{j.notes}</p>}
        </Card>

        {!j.membershipId && (j.status === "DONE" || j.status === "IN_PROGRESS") && (
          <Card title="Package pitch">
            <p className="mb-2 text-sm text-muted">Every one-off job gets the maintenance plan pitch before you leave. Scripts are in Sales.</p>
            <form action={setPitch.bind(null, j.id)}>
              <AutoSelect
                name="outcome"
                defaultValue={j.pitchOutcome}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                options={[
                  { value: "", label: "Not pitched yet" },
                  { value: "pitched", label: "Pitched, no answer yet" },
                  { value: "interested", label: "Interested, follow up" },
                  { value: "signed", label: "Signed up" },
                  { value: "declined", label: "Declined" },
                ]}
              />
            </form>
            {j.pitchOutcome === "signed" && (
              <Link href={`/memberships?client=${j.clientId}#join`} className={`${btn.primary} mt-3 w-full`}>Start their membership</Link>
            )}
          </Card>
        )}

        {viewer.role === "ADMIN" && <Card className="md:col-span-2">
          <Disclosure summary="Edit job">
            <JobForm
              action={saveJob}
              {...opts}
              defaults={{ startAt: toLocalInput(j.startAt) }}
              job={{
                id: j.id, clientId: j.clientId, vehicleId: j.vehicleId, serviceId: j.serviceId, membershipId: j.membershipId, assigneeId: j.assigneeId,
                title: j.title, price: j.price, startAt: toLocalInput(j.startAt), durationMin: j.durationMin, address: j.address, city: j.city, notes: j.notes,
              }}
            />
          </Disclosure>
        </Card>}
      </div>

      {viewer.role === "ADMIN" && <div className="mt-4 flex flex-wrap gap-2">
        {j.status !== "CANCELED" && j.status !== "DONE" && (
          <>
            <form action={setJobStatus.bind(null, j.id)}><button name="status" value="NO_SHOW" className={btn.outline}>No-show</button></form>
            <form action={setJobStatus.bind(null, j.id)}><button name="status" value="CANCELED" className={btn.outline}>Cancel job</button></form>
          </>
        )}
        <form action={deleteJob.bind(null, j.id)}>
          <ConfirmSubmit message="Delete this job for good?" className={btn.danger}>Delete</ConfirmSubmit>
        </form>
      </div>}
    </Page>
  );
}
