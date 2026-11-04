import { prisma } from "@/lib/prisma";
import { BRAND } from "@/config/brand";

/** First-reply times for leads that came in since `since` (minutes). */
export async function speedToLead(since: Date) {
  const leads = await prisma.client.findMany({ where: { leadAt: { gte: since } }, select: { leadAt: true, firstReplyAt: true } });
  const replied = leads.filter((l) => l.firstReplyAt).map((l) => (l.firstReplyAt!.getTime() - l.leadAt.getTime()) / 60000);
  const sorted = [...replied].sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
  const fast = replied.filter((m) => m <= BRAND.speedToLeadMinutes).length;
  return { leads: leads.length, replied: replied.length, median, fastShare: replied.length ? fast / replied.length : 0 };
}
