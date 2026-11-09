import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { BRAND } from "../src/config/brand";
import { runtimeDatabaseUrl } from "../src/lib/database-url";

const url = runtimeDatabaseUrl();
const prisma = new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
const daysFromNow = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

async function main() {
  const email = process.env.ADMIN_EMAIL || "owner@example.com";
  const password = process.env.ADMIN_PASSWORD || "change-me-before-production";

  // Re-running the seed only replaces records explicitly marked as samples.
  await prisma.message.deleteMany({ where: { isSample: true } });
  await prisma.phoneCall.deleteMany({ where: { isSample: true } });
  await prisma.contentPost.deleteMany({ where: { isSample: true } });
  await prisma.contentPiece.deleteMany({ where: { isSample: true } });
  await prisma.contentAccount.deleteMany({ where: { isSample: true } });
  await prisma.payment.deleteMany({ where: { isSample: true } });
  await prisma.job.deleteMany({ where: { isSample: true } });
  await prisma.membership.deleteMany({ where: { isSample: true } });
  await prisma.paymentPlan.deleteMany({ where: { isSample: true } });
  await prisma.activity.deleteMany({ where: { isSample: true } });
  await prisma.followUp.deleteMany({ where: { isSample: true } });
  await prisma.client.deleteMany({ where: { isSample: true } });
  await prisma.service.deleteMany({ where: { isSample: true } });
  await prisma.plan.deleteMany({ where: { isSample: true } });
  await prisma.teamMember.deleteMany({ where: { isSample: true } });
  await prisma.user.deleteMany({ where: { isSample: true } });

  const owner = await prisma.user.upsert({
    where: { email },
    update: { name: BRAND.ownerFullName, passwordHash: await bcrypt.hash(password, 12), role: "ADMIN", active: true },
    create: { email, name: BRAND.ownerFullName, passwordHash: await bcrypt.hash(password, 12), role: "ADMIN" },
  });

  const [service] = await Promise.all(BRAND.services.map((item, index) => prisma.service.create({ data: { ...item, sort: index + 1, isSample: true } })));
  const plan = await prisma.plan.create({ data: { name: "Sample Membership", price: 50, visitsPerMonth: 1, includes: ["Sample benefit"], sort: 1, isSample: true } });
  const teamMember = await prisma.teamMember.create({ data: { name: "Sample Team Member", role: "Team member", color: BRAND.colors.primary, payType: "hourly", payRate: 20, isSample: true } });
  const client = await prisma.client.create({ data: { name: "Sample Client", email: "sample.client@example.test", stage: "BOOKED", source: "WEBSITE", tags: ["sample"], isSample: true } });
  const job = await prisma.job.create({ data: { clientId: client.id, serviceId: service.id, assigneeId: teamMember.id, title: service.name, price: service.price, startAt: daysFromNow(1), durationMin: service.durationMin, status: "CONFIRMED", isSample: true } });
  await prisma.membership.create({ data: { clientId: client.id, planId: plan.id, price: plan.price, nextVisitDue: daysFromNow(30), isSample: true } });

  await Promise.all([
    prisma.payment.create({ data: { date: new Date(), amount: service.price, clientId: client.id, jobId: job.id, note: "Sample payment", isSample: true } }),
    prisma.activity.create({ data: { clientId: client.id, body: "Sample client record. Safe to clear from Settings.", isSample: true } }),
    prisma.followUp.create({ data: { clientId: client.id, assigneeId: teamMember.id, title: "Follow up with sample client", dueAt: daysFromNow(1), isSample: true } }),
    prisma.contentAccount.create({ data: { platform: "Instagram", handle: "@yourbusiness", isSample: true } }),
  ]);
  // Sample texts so Settings > Messaging shows what the log looks like. Console provider: never sent.
  const lead = await prisma.client.create({
    data: {
      name: "Sample Lead", phone: "+15555550123", stage: "NEW", source: "WEBSITE", tags: ["sample"], isSample: true,
      smsConsent: true, smsConsentAt: new Date(), smsConsentSource: "form:Sample form", smsConsentText: "Sample consent line. Replace with your form's wording.",
    },
  });
  await prisma.message.createMany({
    data: [
      { clientId: lead.id, direction: "outbound", toNumber: "+15555550123", body: `Hi Sample, this is ${BRAND.name}. We got your request and will be in touch shortly. Reply STOP to stop texts.`, template: "lead_reply", status: "sent", provider: "console", sentAt: new Date(), isSample: true },
      { clientId: lead.id, direction: "inbound", toNumber: "", fromNumber: "+15555550123", body: "Thanks, is Thursday open?", template: "inbound", status: "received", provider: "console", isSample: true },
      { clientId: null, direction: "outbound", toNumber: "+15555550188", body: `Hi, this is ${BRAND.name}. Sorry we missed your call. Reply STOP to stop texts.`, template: "missed_call", status: "queued", provider: "console", sendAfter: daysFromNow(0.5), isSample: true },
    ],
  });
  await prisma.contentPiece.create({ data: { title: "Sample content idea", hook: "Share how your service helps clients.", platforms: ["Instagram"], status: "IDEA", assignedToId: owner.id, isSample: true } });

  console.log(`Seeded generic sample data and admin ${email}. Clear sample data in Settings before using real records.`);
}

main().finally(() => prisma.$disconnect());
