import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, Page, PageHeader } from "@/components/app/ui";
import { executorContent } from "@/modules/content/stats";
import { ContentExecutorView } from "@/modules/content/ContentExecutorView";

export const metadata = { title: "What I am making today" };

export default async function ContentTodayPage({ searchParams }: { searchParams: Promise<{ assignee?: string }> }) {
  const [user, sp] = await Promise.all([requireUser(), searchParams]);
  const admin = user.role === "ADMIN";
  const [pieces, assignees] = await Promise.all([
    executorContent(admin ? sp.assignee : user.id),
    admin ? prisma.user.findMany({ where: { active: true }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }) : Promise.resolve([]),
  ]);
  return <Page><PageHeader title="What I&apos;m making today" sub={admin ? "See the same executor view Owner uses, filtered by assignee." : "Open a card, follow the steps, then mark it done."} />{admin && <Card title="Today&apos;s execution" className="mb-4"><p className="text-sm text-muted">Choose an assignee, then open a card to film or post.</p></Card>}<ContentExecutorView pieces={pieces} assignees={admin ? assignees : undefined} selectedAssigneeId={admin ? sp.assignee : undefined} /></Page>;
}
