"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { bool, int, num, oneOf, str } from "@/lib/form-data";
import { parseYmd } from "@/lib/dates";

const refresh = () => {
  for (const p of ["/reviews", "/today", "/metrics"]) revalidatePath(p);
};

export async function addSnapshot(fd: FormData) {
  await requireAdmin();
  const rating = num(fd, "rating");
  const count = int(fd, "count", -1);
  if (rating == null || count < 0) return;
  await prisma.reviewSnapshot.create({ data: { date: parseYmd(str(fd, "date")), rating: Math.min(5, Math.max(1, rating)), count } });
  refresh();
}

export async function requestReview(jobId: string, fd: FormData) {
  await requireAdmin();
  const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
  await prisma.reviewRequest.create({
    data: { jobId, clientId: job.clientId, sentAt: new Date(), channel: oneOf(str(fd, "channel"), ["text", "email", "in_person"] as const, "text") },
  });
  await prisma.job.update({ where: { id: jobId }, data: { reviewAsked: true } });
  refresh();
}

export async function updateRequest(id: string, fd: FormData) {
  await requireAdmin();
  const reviewed = bool(fd, "reviewed");
  const before = await prisma.reviewRequest.findUniqueOrThrow({ where: { id } });
  await prisma.reviewRequest.update({
    where: { id },
    data: {
      reviewed,
      reviewedAt: reviewed ? (before.reviewedAt ?? new Date()) : null,
      rating: int(fd, "rating", 0) || null,
      reviewText: str(fd, "reviewText", 2000),
      replied: bool(fd, "replied"),
      replyText: str(fd, "replyText", 2000),
    },
  });
  refresh();
}

export async function addPost(fd: FormData) {
  await requireAdmin();
  const title = str(fd, "title", 200);
  if (!title) return;
  await prisma.gbpPost.create({
    data: { date: parseYmd(str(fd, "date")), kind: oneOf(str(fd, "kind"), ["update", "offer", "photo", "event"] as const, "update"), title, body: str(fd, "body", 1500) },
  });
  refresh();
}

export async function deletePost(id: string) {
  await requireAdmin();
  await prisma.gbpPost.delete({ where: { id } });
  refresh();
}
