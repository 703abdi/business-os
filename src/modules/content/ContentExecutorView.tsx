import Link from "next/link";
import { Badge, Card, Empty } from "@/components/app/ui";
import { fmtTime } from "@/lib/dates";
import { CONTENT_STATUS_COLOR } from "./constants";
import type { executorContent } from "./stats";

type ExecutorPiece = Awaited<ReturnType<typeof executorContent>>[number];
type Assignee = { id: string; name: string | null; email: string };

export function ContentExecutorView({ pieces, assignees, selectedAssigneeId }: { pieces: ExecutorPiece[]; assignees?: Assignee[]; selectedAssigneeId?: string }) {
  return <>{assignees && <div className="-mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:px-0"><Link href="/content/today" className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs ${!selectedAssigneeId ? "border-brand bg-brand text-white" : "border-border bg-surface"}`}>Everyone</Link>{assignees.map((assignee) => <Link key={assignee.id} href={`/content/today?assignee=${encodeURIComponent(assignee.id)}`} className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs ${selectedAssigneeId === assignee.id ? "border-brand bg-brand text-white" : "border-border bg-surface"}`}>{assignee.name ?? assignee.email}</Link>)}</div>}{pieces.length ? <div className="space-y-3">{pieces.map((piece) => <Link key={piece.id} href={`/content/${piece.id}`} className="block rounded-xl border border-border bg-surface p-4 active:bg-surface-2"><div className="flex items-center justify-between gap-2"><Badge color={CONTENT_STATUS_COLOR[piece.status]}>{piece.format}</Badge><span className="text-xs text-muted">{piece.dueAt ? fmtTime(piece.dueAt) : "Today"}</span></div><h2 className="mt-2 text-lg font-bold">{piece.title}</h2><p className="mt-1 text-sm text-muted">{piece.hook || "Open for the full shot list and caption."}</p>{assignees && <p className="mt-2 text-xs text-muted">Assigned to {piece.assignedTo?.name ?? piece.assignedTo?.email ?? "Unassigned"}</p>}{piece.posts.filter((post) => post.status === "SCHEDULED").map((post) => <p key={post.id} className="mt-3 rounded-lg bg-brand-soft px-3 py-2 text-sm font-semibold text-brand-dark">Post at {fmtTime(post.scheduledAt)} on {post.account.platform}</p>)}</Link>)}</div> : <Card><Empty>No filming or posting tasks are due today.</Empty></Card>}</>;
}
