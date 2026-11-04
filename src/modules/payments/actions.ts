"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { int, oneOf, str } from "@/lib/form-data";
import { parseYmd } from "@/lib/dates";
import { nextPlanDue } from "./plans";
export async function createPaymentPlan(fd: FormData) { await requireAdmin(); const clientId = str(fd, "clientId"); const amount = int(fd, "amount"); if (!clientId || amount <= 0) throw new Error("Client and amount are required"); const startDate = parseYmd(str(fd, "startDate")); const frequency = oneOf(str(fd, "frequency"), ["weekly", "biweekly", "monthly"] as const, "monthly"); await prisma.paymentPlan.create({ data: { clientId, name: str(fd, "name", 120) || "Payment plan", amount, frequency, startDate, installments: int(fd, "installments") || null, nextDueDate: nextPlanDue(startDate, frequency), note: str(fd, "note", 1000) } }); for (const path of ["/revenue", "/today", "/crm", "/metrics"]) revalidatePath(path); }
export async function logPlanPayment(id: string) { await requireAdmin(); const plan = await prisma.paymentPlan.findUniqueOrThrow({ where: { id } }); const next = nextPlanDue(plan.nextDueDate, plan.frequency); await prisma.$transaction([prisma.payment.create({ data: { date: new Date(), amount: plan.amount, kind: "payment_plan", clientId: plan.clientId, paymentPlanId: plan.id, note: `${plan.name} payment` } }), prisma.paymentPlan.update({ where: { id }, data: { nextDueDate: next } })]); for (const path of ["/revenue", "/today", "/crm", "/metrics"]) revalidatePath(path); }
