"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { int, oneOf, str } from "@/lib/form-data";
import { parseYmd } from "@/lib/dates";
import { EXPENSE_CATEGORIES } from "./data";

export async function addExpense(fd: FormData) {
  await requireAdmin();
  const amount = int(fd, "amount");
  if (!amount) return;
  await prisma.expense.create({
    data: { date: parseYmd(str(fd, "date")), amount, category: oneOf(str(fd, "category"), EXPENSE_CATEGORIES, "other"), note: str(fd, "note", 200) },
  });
  revalidatePath("/revenue");
}

export async function deleteExpense(id: string) {
  await requireAdmin();
  await prisma.expense.delete({ where: { id } });
  revalidatePath("/revenue");
}

export async function addPayment(fd: FormData) {
  await requireAdmin();
  const amount = int(fd, "amount");
  if (!amount) return;
  await prisma.payment.create({
    data: { date: parseYmd(str(fd, "date")), amount, kind: oneOf(str(fd, "kind"), ["one_time", "recurring"] as const, "one_time"), note: str(fd, "note", 200), clientId: str(fd, "clientId") || null },
  });
  revalidatePath("/revenue");
}
