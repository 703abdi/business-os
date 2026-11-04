import { redirect } from "next/navigation";
import { BRAND } from "@/config/brand";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import LoginForm from "./LoginForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ message?: string }> }) {
  const [session, params] = await Promise.all([getSession(), searchParams]);
  if (session) {
    const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { active: true, sessionVersion: true } });
    if (user?.active && user.sessionVersion === session.sessionVersion) redirect("/today");
    return <LoginForm brandName={BRAND.name} expired />;
  }
  return <LoginForm brandName={BRAND.name} expired={params.message === "session-expired"} />;
}
