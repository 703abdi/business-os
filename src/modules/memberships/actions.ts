"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { bool, int, oneOf, str } from "@/lib/form-data";
import { addDays, parseYmd, startOfMonth } from "@/lib/dates";

function refresh(clientId?: string) {
  for (const p of ["/memberships", "/today", "/revenue", "/metrics", "/map"]) revalidatePath(p);
  if (clientId) revalidatePath(`/crm/${clientId}`);
}

export async function savePlan(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "id");
  const data = {
    name: str(fd, "name", 80),
    price: int(fd, "price"),
    foundingPrice: int(fd, "foundingPrice", 0) || null,
    visitsPerMonth: Math.max(1, int(fd, "visitsPerMonth", 1)),
    includes: str(fd, "includes", 2000).split("\n").map((s) => s.trim()).filter(Boolean),
    active: bool(fd, "active"),
  };
  if (!data.name || !data.price) return;
  if (id) await prisma.plan.update({ where: { id }, data });
  else await prisma.plan.create({ data });
  refresh();
}

export async function startMembership(fd: FormData) {
  await requireAdmin();
  const clientId = str(fd, "clientId");
  const plan = await prisma.plan.findUniqueOrThrow({ where: { id: str(fd, "planId") } });
  const founding = bool(fd, "founding") && plan.foundingPrice != null;
  const price = int(fd, "price", 0) || (founding ? plan.foundingPrice! : plan.price);
  const startedAt = parseYmd(str(fd, "startedAt"));
  const m = await prisma.membership.create({
    data: { clientId, planId: plan.id, price, founding, startedAt, nextVisitDue: addDays(startedAt, Math.round(30 / plan.visitsPerMonth)) },
  });
  await prisma.payment.create({ data: { date: startedAt, amount: price, kind: "recurring", clientId, membershipId: m.id, note: `${plan.name} first month` } });
  await prisma.client.update({ where: { id: clientId }, data: { stage: "MEMBER" } });
  await prisma.activity.create({ data: { clientId, kind: "system", body: `Joined ${plan.name} at $${price}/mo${founding ? " (founding rate, locked)" : ""}` } });
  refresh(clientId);
}

export async function setMembershipStatus(id: string, fd: FormData) {
  await requireAdmin();
  const status = oneOf(str(fd, "status"), ["ACTIVE", "PAUSED", "CANCELED"] as const, "ACTIVE");
  const m = await prisma.membership.update({
    where: { id },
    data: { status, canceledAt: status === "CANCELED" ? new Date() : null, cancelReason: status === "CANCELED" ? str(fd, "reason", 300) : "" },
  });
  if (status === "CANCELED") {
    const others = await prisma.membership.count({ where: { clientId: m.clientId, status: "ACTIVE" } });
    if (!others) await prisma.client.update({ where: { id: m.clientId }, data: { stage: "COMPLETED" } });
  }
  await prisma.activity.create({ data: { clientId: m.clientId, kind: "system", body: `Membership ${status.toLowerCase()}${m.cancelReason ? `: ${m.cancelReason}` : ""}` } });
  refresh(m.clientId);
}

/** Log this month's charge for every active member who doesn't have one yet. */
export async function chargeMonth() {
  await requireAdmin();
  const now = new Date();
  const monthStart = startOfMonth(now);
  const active = await prisma.membership.findMany({ where: { status: "ACTIVE" }, include: { plan: true, payments: { where: { date: { gte: monthStart } } } } });
  for (const m of active) {
    if (m.payments.length) continue;
    await prisma.payment.create({ data: { date: now, amount: m.price, kind: "recurring", clientId: m.clientId, membershipId: m.id, note: m.plan.name, isSample: m.isSample } });
  }
  refresh();
}
