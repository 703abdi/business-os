import { prisma } from "@/lib/prisma";
import { addDays, endOfDay, startOfDay, startOfWeek } from "@/lib/dates";

export async function contentStats(now = new Date()) {
  const week = startOfWeek(now);
  const end = addDays(week, 7);
  const [planned, filmed, posted, overdue, accounts, dueToday] = await Promise.all([
    prisma.contentPiece.count({ where: { createdAt: { gte: week, lt: end }, status: { not: "ARCHIVED" } } }),
    prisma.contentPiece.count({ where: { status: { in: ["FILMED", "EDITED", "SCHEDULED", "POSTED"] }, updatedAt: { gte: week, lt: end } } }),
    prisma.contentPost.count({ where: { status: "POSTED", postedAt: { gte: week, lt: end } } }),
    prisma.contentPost.count({ where: { status: "SCHEDULED", scheduledAt: { lt: now } } }),
    prisma.contentAccount.findMany({ where: { active: true }, include: { posts: { where: { scheduledAt: { gte: week, lt: end } } } }, orderBy: { platform: "asc" } }),
    prisma.contentPost.findMany({ where: { status: "SCHEDULED", scheduledAt: { gte: startOfDay(now), lt: endOfDay(now) } }, include: { piece: true, account: true }, orderBy: { scheduledAt: "asc" } }),
  ]);
  return { planned, filmed, posted, overdue, dueToday, consistency: accounts.map((a) => ({ account: a, scheduled: a.posts.length })) };
}

export async function executorContent(userId?: string, now = new Date()) {
  const today = startOfDay(now);
  const tomorrow = endOfDay(now);
  return prisma.contentPiece.findMany({
    where: { ...(userId ? { assignedToId: userId } : {}), status: { in: ["READY_TO_FILM", "FILMED", "EDITED", "SCHEDULED"] }, OR: [{ dueAt: { gte: today, lt: tomorrow } }, { posts: { some: { status: "SCHEDULED", scheduledAt: { gte: today, lt: tomorrow } } } }] },
    include: { posts: { include: { account: true }, orderBy: { scheduledAt: "asc" } }, assignedTo: true }, orderBy: [{ dueAt: "asc" }, { updatedAt: "desc" }],
  });
}
