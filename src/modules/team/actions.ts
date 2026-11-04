"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { bool, int, num, oneOf, str } from "@/lib/form-data";
import { parseYmd } from "@/lib/dates";
import { TRAINING, TRAINING_STATUS } from "./training";

function refresh(id?: string) {
  revalidatePath("/team");
  revalidatePath("/revenue");
  if (id) revalidatePath(`/team/${id}`);
}

export async function saveMember(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "id");
  const data = {
    name: str(fd, "name", 80),
    role: str(fd, "role", 80) || "Team member",
    phone: str(fd, "phone", 40),
    color: /^#[0-9a-f]{6}$/i.test(str(fd, "color")) ? str(fd, "color") : "#0e7c86",
    payType: oneOf(str(fd, "payType"), ["per_job", "hourly", "owner"] as const, "per_job"),
    payRate: int(fd, "payRate"),
    active: id ? bool(fd, "active") : true,
  };
  if (!data.name) return;
  const m = id ? await prisma.teamMember.update({ where: { id }, data }) : await prisma.teamMember.create({ data });
  refresh(m.id);
  if (!id) redirect(`/team/${m.id}`);
}

export async function addTeamNote(memberId: string, fd: FormData) {
  await requireAdmin();
  const body = str(fd, "body", 3000);
  if (!body) return;
  await prisma.teamNote.create({ data: { memberId, body, kind: oneOf(str(fd, "kind"), ["praise", "issue", "note"] as const, "note") } });
  refresh(memberId);
}

export async function setTraining(memberId: string, skill: string, fd: FormData) {
  await requireAdmin();
  if (!TRAINING.some((t) => t.key === skill)) return;
  const status = oneOf(str(fd, "status"), TRAINING_STATUS, "not_started");
  await prisma.trainingProgress.upsert({
    where: { memberId_skill: { memberId, skill } },
    create: { memberId, skill, status },
    update: { status },
  });
  refresh(memberId);
}

export async function addPayEntry(memberId: string, fd: FormData) {
  await requireAdmin();
  const amount = int(fd, "amount");
  if (!amount) return;
  await prisma.payEntry.create({ data: { memberId, amount, hours: num(fd, "hours"), date: parseYmd(str(fd, "date")), note: str(fd, "note", 200) } });
  refresh(memberId);
}

export async function markAllPaid(memberId: string) {
  await requireAdmin();
  await prisma.payEntry.updateMany({ where: { memberId, paid: false }, data: { paid: true } });
  refresh(memberId);
}
