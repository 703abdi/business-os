import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, Empty, Page, PageHeader, btn, input } from "@/components/app/ui";
import { Icon } from "@/components/app/Icon";
import { addDays, endOfDay, fmtDay, fmtTime, toLocalInput } from "@/lib/dates";
import { addFollowUp, toggleFollowUp } from "@/modules/crm/actions";

export const metadata = { title: "Follow-ups" };

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ done?: string }> }) {
  const { done } = await searchParams;
  const [items, team] = await Promise.all([
    prisma.followUp.findMany({
      where: done ? { doneAt: { not: null } } : { doneAt: null },
      orderBy: done ? { doneAt: "desc" } : { dueAt: "asc" },
      include: { client: true, assignee: true },
      take: 300,
    }),
    prisma.teamMember.findMany({ where: { active: true } }),
  ]);
  const now = new Date();
  const eod = endOfDay(now);
  const groups = done
    ? [{ label: "Done", rows: items }]
    : [
        { label: "Overdue", rows: items.filter((f) => f.dueAt < now) },
        { label: "Today", rows: items.filter((f) => f.dueAt >= now && f.dueAt < eod) },
        { label: "Upcoming", rows: items.filter((f) => f.dueAt >= eod) },
      ];

  return (
    <Page>
      <PageHeader
        title="Follow-ups"
        sub="Every call, text and reminder that's due"
        actions={<Link href={done ? "/crm/tasks" : "/crm/tasks?done=1"} className={btn.outline}>{done ? "Show open" : "Show done"}</Link>}
      />
      <Card className="mb-4">
        <form action={addFollowUp.bind(null, null)} className="flex flex-wrap gap-2">
          <input name="title" placeholder="New task (not tied to a client)" className={`${input} min-w-0 flex-1`} />
          <input name="dueAt" type="datetime-local" defaultValue={toLocalInput(addDays(now, 1))} className={`${input} w-auto`} />
          <select name="assigneeId" className={`${input} w-auto`}>
            <option value="">Anyone</option>
            {team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button className={btn.primary}>Add</button>
        </form>
      </Card>
      <div className="space-y-4">
        {groups.map((g) => (
          <Card key={g.label} title={`${g.label} (${g.rows.length})`} pad={false}>
            {g.rows.length === 0 ? (
              <Empty>Nothing here.</Empty>
            ) : (
              <ul className="divide-y divide-border">
                {g.rows.map((f) => (
                  <li key={f.id} className="flex items-start gap-3 px-4 py-2.5">
                    <form action={toggleFollowUp.bind(null, f.id)}>
                      <button className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded border ${f.doneAt ? "border-good bg-good text-white" : "border-border"}`} aria-label="Toggle done">
                        {f.doneAt && <Icon name="check" className="h-4 w-4" />}
                      </button>
                    </form>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">{f.title}</p>
                      <p className={`text-xs ${g.label === "Overdue" ? "font-semibold text-bad" : "text-muted"}`}>
                        {fmtDay(f.dueAt)} {fmtTime(f.dueAt)}
                        {f.client && <> · <Link href={`/crm/${f.client.id}`} className="text-brand">{f.client.name}</Link></>}
                        {f.assignee && ` · ${f.assignee.name}`}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>
    </Page>
  );
}
