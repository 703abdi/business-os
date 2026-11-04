"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

/** Remove only rows created by prisma/seed.ts. Live data is never touched. */
export async function clearSampleData() {
  await requireAdmin();

  // Delete dependent records explicitly so this remains safe if a relationship
  // is changed from Cascade to SetNull later. Models not linked to a sample
  // parent are also individually marked by the seed.
  await prisma.$transaction([
    prisma.reviewRequest.deleteMany({ where: { isSample: true } }),
    prisma.payEntry.deleteMany({ where: { isSample: true } }),
    prisma.trainingProgress.deleteMany({ where: { isSample: true } }),
    prisma.teamNote.deleteMany({ where: { isSample: true } }),
    prisma.followUp.deleteMany({ where: { isSample: true } }),
    prisma.contentPost.deleteMany({ where: { isSample: true } }),
    prisma.contentStageEvent.deleteMany({ where: { piece: { isSample: true } } }),
    prisma.contentPiece.deleteMany({ where: { isSample: true } }),
    prisma.contentAccount.deleteMany({ where: { isSample: true } }),
    prisma.paymentPlan.deleteMany({ where: { isSample: true } }),
    prisma.activity.deleteMany({ where: { isSample: true } }),
    prisma.quote.deleteMany({ where: { isSample: true } }),
    prisma.payment.deleteMany({ where: { isSample: true } }),
    prisma.job.deleteMany({ where: { isSample: true } }),
    prisma.membership.deleteMany({ where: { isSample: true } }),
    prisma.vehicle.deleteMany({ where: { isSample: true } }),
    prisma.client.deleteMany({ where: { isSample: true } }),
    prisma.adStat.deleteMany({ where: { isSample: true } }),
    prisma.adCreative.deleteMany({ where: { isSample: true } }),
    prisma.adCampaign.deleteMany({ where: { isSample: true } }),
    prisma.expense.deleteMany({ where: { isSample: true } }),
    prisma.reviewSnapshot.deleteMany({ where: { isSample: true } }),
    prisma.gbpPost.deleteMany({ where: { isSample: true } }),
    prisma.script.deleteMany({ where: { isSample: true } }),
    prisma.service.deleteMany({ where: { isSample: true } }),
    prisma.plan.deleteMany({ where: { isSample: true } }),
    prisma.teamMember.deleteMany({ where: { isSample: true } }),
    prisma.user.deleteMany({ where: { isSample: true } }),
  ]);

  for (const path of ["/today", "/content", "/crm", "/schedule", "/memberships", "/revenue", "/ads", "/reviews", "/metrics", "/settings"]) {
    revalidatePath(path);
  }
}
