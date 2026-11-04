"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { hashPassword, requireAdmin, requireUser, verifyPassword } from "@/lib/auth";
import { str } from "@/lib/form-data";

export async function createLogin(memberId: string, fd: FormData) { await requireAdmin(); const email = str(fd, "email", 200).toLowerCase(); const password = str(fd, "password", 200); if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8) throw new Error("Use a valid email and an 8+ character temporary password"); await prisma.user.create({ data: { email, passwordHash: await hashPassword(password), role: "EMPLOYEE", teamMemberId: memberId, name: str(fd, "name", 100) || null } }); revalidatePath(`/team/${memberId}`); }
export async function resetPassword(userId: string, fd: FormData) { await requireAdmin(); const password = str(fd, "password", 200); if (password.length < 8) throw new Error("Password must have at least 8 characters"); await prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(password), sessionVersion: { increment: 1 } } }); }
export async function setUserActive(userId: string, active: boolean) { await requireAdmin(); await prisma.user.update({ where: { id: userId }, data: { active, sessionVersion: { increment: 1 } } }); revalidatePath("/team"); }
export async function changeOwnPassword(fd: FormData) { const user = await requireUser(); const current = str(fd, "currentPassword", 200); const password = str(fd, "password", 200); const record = await prisma.user.findUniqueOrThrow({ where: { id: user.id } }); if (!(await verifyPassword(current, record.passwordHash))) throw new Error("Current password is incorrect"); if (password.length < 8) throw new Error("Password must have at least 8 characters"); await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password), sessionVersion: { increment: 1 } } }); }
