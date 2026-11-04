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
  await prisma.contentPiece.create({ data: { title: "Sample content idea", hook: "Share how your service helps clients.", platforms: ["Instagram"], status: "IDEA", assignedToId: owner.id, isSample: true } });

  console.log(`Seeded generic sample data and admin ${email}. Clear sample data in Settings before using real records.`);
}

main().finally(() => prisma.$disconnect());
