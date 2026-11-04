"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { int, oneOf, str } from "@/lib/form-data";
import { parseYmd } from "@/lib/dates";

const refresh = () => {
  for (const p of ["/ads", "/today", "/metrics", "/revenue"]) revalidatePath(p);
};

export async function saveCampaign(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "id");
  const data = {
    platform: oneOf(str(fd, "platform"), ["meta", "google"] as const, "meta"),
    name: str(fd, "name", 120),
    status: oneOf(str(fd, "status"), ["active", "paused", "ended"] as const, "active"),
    angle: str(fd, "angle", 300),
  };
  if (!data.name) return;
  if (id) await prisma.adCampaign.update({ where: { id }, data });
  else await prisma.adCampaign.create({ data });
  refresh();
}

/** Manual entry: spend / leads / booked jobs for a campaign over a week (dated to its Monday). */
export async function addAdStat(fd: FormData) {
  await requireAdmin();
  const campaignId = str(fd, "campaignId");
  if (!campaignId) return;
  await prisma.adStat.create({
    data: { campaignId, date: parseYmd(str(fd, "date")), spend: int(fd, "spend"), leads: int(fd, "leads"), booked: int(fd, "booked") },
  });
  refresh();
}

export async function deleteAdStat(id: string) {
  await requireAdmin();
  await prisma.adStat.delete({ where: { id } });
  refresh();
}

export async function saveCreative(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "id");
  const data = {
    campaignId: str(fd, "campaignId") || null,
    angle: str(fd, "angle", 200),
    hook: str(fd, "hook", 500),
    format: oneOf(str(fd, "format"), ["video", "image", "carousel"] as const, "video"),
    status: oneOf(str(fd, "status"), ["testing", "winner", "killed"] as const, "testing"),
    result: str(fd, "result", 500),
  };
  if (!data.angle) return;
  if (id) await prisma.adCreative.update({ where: { id }, data });
  else await prisma.adCreative.create({ data });
  refresh();
}

export async function setCreativeStatus(id: string, fd: FormData) {
  await requireAdmin();
  await prisma.adCreative.update({ where: { id }, data: { status: oneOf(str(fd, "status"), ["testing", "winner", "killed"] as const, "testing") } });
  refresh();
}
