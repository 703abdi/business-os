import { prisma } from "@/lib/prisma";
import { BRAND } from "@/config/brand";

/** Latest known rating/count, and how many reviews were added since a date. */
export async function reviewStats(since: Date) {
  const [latest, before, reviewedSince] = await Promise.all([
    prisma.reviewSnapshot.findFirst({ orderBy: { date: "desc" } }),
    prisma.reviewSnapshot.findFirst({ where: { date: { lt: since } }, orderBy: { date: "desc" } }),
    prisma.reviewRequest.count({ where: { reviewed: true, reviewedAt: { gte: since } } }),
  ]);
  const count = latest?.count ?? BRAND.baseline.reviews;
  const rating = latest?.rating ?? BRAND.baseline.rating;
  // Snapshots are the source of truth; tracked requests are the fallback when no snapshot was logged.
  const added = latest && before ? Math.max(0, latest.count - before.count) : reviewedSince;
  return { count, rating, added, latestDate: latest?.date ?? null };
}
