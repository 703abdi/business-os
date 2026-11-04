// What happens when a job is marked done: revenue, crew pay, client stage,
// membership rebook date. Kept in one place so the job page, Acuity sync and
// tests all do the same thing.
import { prisma } from "@/lib/prisma";
import { addDays } from "@/lib/dates";

export async function completeJob(jobId: string, at = new Date()) {
  const job = await prisma.job.findUniqueOrThrow({
    where: { id: jobId },
    include: { assignee: true, client: true, membership: { include: { plan: true } }, payments: true, payEntries: true },
  });
  await prisma.job.update({ where: { id: jobId }, data: { status: "DONE", completedAt: job.completedAt ?? at } });

  if (job.price > 0 && job.payments.length === 0) {
    await prisma.payment.create({
      data: { date: at, amount: job.price, kind: "one_time", clientId: job.clientId, jobId, isSample: job.isSample },
    });
  }

  const a = job.assignee;
  if (a && a.payType !== "owner" && job.payEntries.length === 0) {
    const hours = Math.round((job.durationMin / 60) * 10) / 10;
    const amount = a.payType === "hourly" ? Math.round(a.payRate * hours) : a.payRate;
    if (amount > 0) {
      await prisma.payEntry.create({
        data: { memberId: a.id, jobId, date: at, hours: a.payType === "hourly" ? hours : null, amount, isSample: job.isSample },
      });
    }
  }

  if (job.membership) {
    const every = Math.max(7, Math.round(30 / Math.max(1, job.membership.plan.visitsPerMonth)));
    await prisma.membership.update({ where: { id: job.membership.id }, data: { nextVisitDue: addDays(at, every) } });
  } else if (["NEW", "CONTACTED", "QUOTED", "BOOKED"].includes(job.client.stage)) {
    await prisma.client.update({ where: { id: job.clientId }, data: { stage: "COMPLETED" } });
  }
  await prisma.activity.create({ data: { clientId: job.clientId, kind: "system", body: `Job done${job.price ? `: $${job.price}` : ""}` } });
}
