"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { int, oneOf, str } from "@/lib/form-data";
import { SEQUENCES } from "./sequences";

export async function startSequence(clientId: string, fd: FormData) {
  await requireAdmin();
  const seq = SEQUENCES.find((s) => s.key === str(fd, "sequence"));
  if (!seq) return;
  const now = Date.now();
  await prisma.followUp.createMany({
    data: seq.steps.map((s) => ({
      clientId,
      title: s.title,
      dueAt: new Date(now + s.day * 86_400_000 + s.hour * 3_600_000),
      sequence: seq.name,
    })),
  });
  await prisma.activity.create({ data: { clientId, kind: "system", body: `Started sequence: ${seq.name}` } });
  revalidatePath(`/crm/${clientId}`);
  revalidatePath("/today");
}

type Item = { label: string; price: number };

function readItems(fd: FormData): Item[] {
  const labels = fd.getAll("itemLabel").map(String);
  const prices = fd.getAll("itemPrice").map((p) => Number(String(p).replace(/[$,]/g, "")));
  return labels
    .map((l, i) => ({ label: l.trim().slice(0, 120), price: Math.round(prices[i] || 0) }))
    .filter((it) => it.label && it.price >= 0)
    .slice(0, 20);
}

export async function saveQuote(fd: FormData) {
  await requireAdmin();
  const clientId = str(fd, "clientId");
  if (!clientId) throw new Error("Pick a client");
  const items = readItems(fd);
  const discount = Math.max(0, int(fd, "discount"));
  const total = Math.max(0, items.reduce((s, i) => s + i.price, 0) - discount);
  const status = oneOf(str(fd, "status"), ["draft", "sent", "accepted", "declined"] as const, "draft");
  const id = str(fd, "id");
  const data = { clientId, items, discount, total, status, message: str(fd, "message", 3000), sentAt: status === "sent" ? new Date() : undefined };
  const q = id ? await prisma.quote.update({ where: { id }, data }) : await prisma.quote.create({ data });
  const c = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });
  if (status === "sent" && ["NEW", "CONTACTED"].includes(c.stage)) {
    await prisma.client.update({ where: { id: clientId }, data: { stage: "QUOTED", firstReplyAt: c.firstReplyAt ?? new Date(), lastContactAt: new Date() } });
  }
  if (status === "accepted" && ["NEW", "CONTACTED", "QUOTED"].includes(c.stage)) {
    await prisma.client.update({ where: { id: clientId }, data: { stage: "BOOKED" } });
  }
  await prisma.activity.create({ data: { clientId, kind: "system", body: `Quote ${status}: $${total}` } });
  revalidatePath("/sales");
  revalidatePath(`/crm/${clientId}`);
  redirect(`/sales/quote?id=${q.id}&saved=1`);
}

export async function saveScript(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "id");
  const data = { category: str(fd, "category", 40) || "first_reply", title: str(fd, "title", 120), body: str(fd, "body", 4000) };
  if (!data.title || !data.body) return;
  if (id) await prisma.script.update({ where: { id }, data });
  else await prisma.script.create({ data });
  revalidatePath("/sales/scripts");
}

export async function deleteScript(id: string) {
  await requireAdmin();
  await prisma.script.delete({ where: { id } });
  revalidatePath("/sales/scripts");
}

/** Record how the package pitch went after a one-off job. */
export async function setPitch(jobId: string, fd: FormData) {
  await requireAdmin();
  const outcome = oneOf(str(fd, "outcome"), ["", "pitched", "interested", "signed", "declined"] as const, "");
  const job = await prisma.job.update({ where: { id: jobId }, data: { pitchOutcome: outcome } });
  if (outcome) await prisma.activity.create({ data: { clientId: job.clientId, kind: "system", body: `Package pitch: ${outcome}` } });
  revalidatePath("/sales");
  revalidatePath("/today");
}
