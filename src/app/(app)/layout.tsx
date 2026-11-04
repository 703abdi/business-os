import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import NavShell from "@/components/app/NavShell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const sampleData = (await prisma.client.count({ where: { isSample: true } })) > 0;
  return (
    <NavShell email={user.email} role={user.role} sampleData={sampleData}>
      {children}
    </NavShell>
  );
}
