"use client";
import Link from "next/link";
import { useTransition } from "react";
import { Badge } from "@/components/app/ui";
import { setContentStatus } from "./actions";
import { CONTENT_STATUSES, CONTENT_STATUS_COLOR, CONTENT_STATUS_LABEL, type ContentStatusKey } from "./constants";

type Piece = { id: string; title: string; hook: string; format: string; priority: number; status: ContentStatusKey; dueAt: Date | null; assignedTo: { name: string | null; email: string } | null; posts: { id: string }[] };
export function ContentBoard({ pieces }: { pieces: Piece[] }) {
  const [, start] = useTransition();
  const move = (id: string, status: ContentStatusKey) => start(() => { void setContentStatus(id, status); });
  return <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-4 md:mx-0 md:px-0">
    {CONTENT_STATUSES.filter((s) => s !== "ARCHIVED").map((status) => { const col = pieces.filter((p) => p.status === status); return <section key={status} className="w-72 shrink-0 snap-start rounded-xl border border-border bg-surface-2/60" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData("text/plain"); if (id) move(id, status); }}><div className="flex items-center justify-between px-3 py-2"><Badge color={CONTENT_STATUS_COLOR[status]}>{CONTENT_STATUS_LABEL[status]}</Badge><span className="text-xs text-muted">{col.length}</span></div><div className="min-h-16 space-y-2 px-2 pb-2">{col.map((p) => <article key={p.id} draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", p.id)} className="rounded-lg border border-border bg-surface p-2.5"><Link href={`/content/${p.id}`} className="block"><p className="text-sm font-semibold">{p.title}</p>{p.hook && <p className="mt-1 line-clamp-2 text-xs text-muted">{p.hook}</p>}<p className="mt-2 text-xs text-muted">{p.format}{p.assignedTo ? ` · ${p.assignedTo.name ?? p.assignedTo.email}` : ""}</p></Link><select aria-label={`Move ${p.title}`} className="mt-2 w-full rounded border border-border bg-surface px-2 py-1 text-xs md:hidden" value={p.status} onChange={(e) => move(p.id, e.target.value as ContentStatusKey)}>{CONTENT_STATUSES.map((s) => <option key={s} value={s}>{CONTENT_STATUS_LABEL[s]}</option>)}</select></article>)}{!col.length && <p className="py-3 text-center text-xs text-muted">Drop here</p>}</div></section>; })}
  </div>;
}
