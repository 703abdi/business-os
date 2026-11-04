"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireUser } from "@/lib/auth";
import { int, list, oneOf, str } from "@/lib/form-data";
import { parseLocalDateTime } from "@/lib/dates";
import { CONTENT_FORMATS, CONTENT_POST_STATUSES, CONTENT_STATUSES } from "./constants";

function refresh(id?: string) { for (const p of ["/content", "/content/today", "/today", "/metrics"]) revalidatePath(p); if (id) revalidatePath(`/content/${id}`); }
const splitLines = (value: string) => value.split(/\r?\n|,/).map((v) => v.trim()).filter(Boolean).slice(0, 50);

export async function createContentPiece(fd: FormData) {
  const admin = await requireAdmin();
  const title = str(fd, "title", 200); if (!title) throw new Error("A title is required");
  const format = oneOf(str(fd, "format"), CONTENT_FORMATS, "Short-form");
  const piece = await prisma.contentPiece.create({ data: {
    title, hook: str(fd, "hook", 500), format: format === "Custom" ? (str(fd, "customFormat", 80) || "Custom") : format,
    script: str(fd, "script", 20_000), researchNotes: str(fd, "researchNotes", 10_000), referenceLinks: splitLines(str(fd, "referenceLinks", 4000)),
    shotList: splitLines(str(fd, "shotList", 4000)), cta: str(fd, "cta", 500), caption: str(fd, "caption", 5000), hashtags: list(fd, "hashtags"),
    priority: Math.min(3, Math.max(1, int(fd, "priority", 2))), platforms: fd.getAll("platforms").map(String).slice(0, 5),
    assignedToId: str(fd, "assignedToId") || admin.id, dueAt: parseLocalDateTime(str(fd, "dueAt")), jobId: str(fd, "jobId") || null,
    mediaLinks: splitLines(str(fd, "mediaLinks", 4000)),
  }});
  await prisma.contentStageEvent.create({ data: { pieceId: piece.id, to: "IDEA" } });
  refresh(piece.id); redirect(`/content/${piece.id}`);
}

export async function updateContentPiece(id: string, fd: FormData) {
  await requireAdmin();
  const before = await prisma.contentPiece.findUniqueOrThrow({ where: { id } });
  const status = oneOf(str(fd, "status"), CONTENT_STATUSES, before.status);
  const format = oneOf(str(fd, "format"), CONTENT_FORMATS, before.format as (typeof CONTENT_FORMATS)[number]);
  await prisma.contentPiece.update({ where: { id }, data: { title: str(fd, "title", 200) || before.title, hook: str(fd, "hook", 500), format: format === "Custom" ? (str(fd, "customFormat", 80) || "Custom") : format, script: str(fd, "script", 20_000), researchNotes: str(fd, "researchNotes", 10_000), referenceLinks: splitLines(str(fd, "referenceLinks", 4000)), shotList: splitLines(str(fd, "shotList", 4000)), cta: str(fd, "cta", 500), caption: str(fd, "caption", 5000), hashtags: list(fd, "hashtags"), priority: Math.min(3, Math.max(1, int(fd, "priority", 2))), platforms: fd.getAll("platforms").map(String).slice(0, 5), assignedToId: str(fd, "assignedToId") || null, dueAt: parseLocalDateTime(str(fd, "dueAt")), jobId: str(fd, "jobId") || null, mediaLinks: splitLines(str(fd, "mediaLinks", 4000)), status } });
  if (status !== before.status) await prisma.contentStageEvent.create({ data: { pieceId: id, from: before.status, to: status } });
  refresh(id);
}

export async function setContentStatus(id: string, status: string) {
  const user = await requireUser();
  const piece = await prisma.contentPiece.findUniqueOrThrow({ where: { id } });
  if (user.role !== "ADMIN" && piece.assignedToId !== user.id) throw new Error("Not allowed");
  const to = oneOf(status, CONTENT_STATUSES, piece.status);
  if (to !== piece.status) { await prisma.contentPiece.update({ where: { id }, data: { status: to } }); await prisma.contentStageEvent.create({ data: { pieceId: id, from: piece.status, to } }); }
  refresh(id);
}

export async function createContentPost(pieceId: string, fd: FormData) {
  await requireAdmin();
  const accountId = str(fd, "accountId"); const scheduledAt = parseLocalDateTime(str(fd, "scheduledAt"));
  if (!accountId || !scheduledAt) throw new Error("Choose an account and scheduled time");
  await prisma.contentPost.create({ data: { pieceId, accountId, scheduledAt, caption: str(fd, "caption", 5000) } });
  const piece = await prisma.contentPiece.findUniqueOrThrow({ where: { id: pieceId } });
  if (["IDEA", "SCRIPTED", "READY_TO_FILM", "FILMED", "EDITED"].includes(piece.status)) await setContentStatus(pieceId, "SCHEDULED");
  refresh(pieceId);
}

export async function markContentPost(postId: string, fd?: FormData) {
  const user = await requireUser();
  const post = await prisma.contentPost.findUniqueOrThrow({ where: { id: postId }, include: { piece: true } });
  if (user.role !== "ADMIN" && post.piece.assignedToId !== user.id) throw new Error("Not allowed");
  const status = oneOf(str(fd ?? new FormData(), "status"), CONTENT_POST_STATUSES, "POSTED");
  await prisma.contentPost.update({ where: { id: postId }, data: { status, postedAt: status === "POSTED" ? new Date() : null, postedUrl: str(fd ?? new FormData(), "postedUrl", 2000) } });
  if (status === "POSTED") await setContentStatus(post.pieceId, "POSTED");
  refresh(post.pieceId);
}

export async function saveContentAccount(fd: FormData) { await requireAdmin(); const platform = str(fd, "platform", 80); if (!platform) return; await prisma.contentAccount.upsert({ where: { platform_handle: { platform, handle: str(fd, "handle", 120) } }, create: { platform, handle: str(fd, "handle", 120), profileUrl: str(fd, "profileUrl", 1000) }, update: { profileUrl: str(fd, "profileUrl", 1000), active: true } }); refresh(); }
