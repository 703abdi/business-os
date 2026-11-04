"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireUser } from "@/lib/auth";
import { bool, int, oneOf, str } from "@/lib/form-data";
import { parseLocalDateTime } from "@/lib/dates";
import { JOB_STATUSES } from "./constants";
import { completeJob } from "./complete";

function refresh(id?: string, clientId?: string) {
  for (const p of ["/schedule", "/today", "/map", "/revenue", "/team"]) revalidatePath(p);
  if (id) revalidatePath(`/schedule/${id}`);
  if (clientId) revalidatePath(`/crm/${clientId}`);
}

export async function saveJob(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "id");
  const clientId = str(fd, "clientId");
  if (!clientId) throw new Error("Pick a client");
  const startAt = parseLocalDateTime(str(fd, "startAt"));
  if (!startAt) throw new Error("Pick a date and time");
  const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });
  const service = str(fd, "serviceId") ? await prisma.service.findUnique({ where: { id: str(fd, "serviceId") } }) : null;
  const membershipId = str(fd, "membershipId") || null;
  const address = str(fd, "address", 200) || client.address;
  const sameAddress = address === client.address;
  const data = {
    clientId,
    vehicleId: str(fd, "vehicleId") || null,
    serviceId: service?.id ?? null,
    membershipId,
    assigneeId: str(fd, "assigneeId") || null,
    title: str(fd, "title", 120) || service?.name || "",
    price: membershipId ? int(fd, "price", 0) : int(fd, "price", service?.price ?? 0),
    startAt,
    durationMin: int(fd, "durationMin", service?.durationMin ?? 180),
    address,
    city: str(fd, "city", 80) || client.city,
    lat: sameAddress ? client.lat : null,
    lng: sameAddress ? client.lng : null,
    notes: str(fd, "notes", 3000),
  };
  const job = id ? await prisma.job.update({ where: { id }, data }) : await prisma.job.create({ data: { ...data, status: bool(fd, "confirmed") ? "CONFIRMED" : "SCHEDULED" } });
  if (!id) {
    if (["NEW", "CONTACTED", "QUOTED", "LOST"].includes(client.stage)) {
      await prisma.client.update({ where: { id: clientId }, data: { stage: "BOOKED", firstReplyAt: client.firstReplyAt ?? new Date() } });
    }
    await prisma.activity.create({ data: { clientId, kind: "system", body: `Job booked: ${data.title || "job"}` } });
  }
  refresh(job.id, clientId);
  redirect(`/schedule/${job.id}`);
}

export async function setJobStatus(id: string, fd: FormData) {
  const user = await requireUser();
  const current = await prisma.job.findUniqueOrThrow({ where: { id }, select: { assigneeId: true } });
  if (user.role !== "ADMIN" && current.assigneeId !== user.teamMemberId) throw new Error("Not allowed");
  const status = oneOf(str(fd, "status"), JOB_STATUSES, "SCHEDULED");
  if (status === "DONE") await completeJob(id);
  else await prisma.job.update({ where: { id }, data: { status } });
  const job = await prisma.job.findUniqueOrThrow({ where: { id } });
  refresh(id, job.clientId);
}

export async function setChecklist(id: string, fd: FormData) {
  const user = await requireUser();
  const current = await prisma.job.findUniqueOrThrow({ where: { id }, select: { assigneeId: true } });
  if (user.role !== "ADMIN" && current.assigneeId !== user.teamMemberId) throw new Error("Not allowed");
  const job = await prisma.job.update({
    where: { id },
    data: {
      photosBefore: bool(fd, "photosBefore"),
      photosAfter: bool(fd, "photosAfter"),
      walkthrough: bool(fd, "walkthrough"),
      reviewAsked: bool(fd, "reviewAsked"),
    },
  });
  // Ticking "review ask" logs a review request for the Google module.
  if (job.reviewAsked) {
    const exists = await prisma.reviewRequest.findFirst({ where: { jobId: id } });
    if (!exists) await prisma.reviewRequest.create({ data: { clientId: job.clientId, jobId: id, sentAt: new Date(), channel: "in_person" } });
  }
  refresh(id);
  revalidatePath("/reviews");
}

export async function deleteJob(id: string) {
  await requireAdmin();
  const job = await prisma.job.delete({ where: { id } });
  refresh(undefined, job.clientId);
  redirect("/schedule");
}
