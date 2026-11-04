import Link from "next/link";
import { addDays, fmtDay, fmtTime, startOfMonth, startOfWeek, ymd } from "@/lib/dates";

type CalendarPost = { id: string; scheduledAt: Date; account: { id: string; platform: string; handle: string }; piece: { id: string; title: string } };
const ACCOUNT_COLORS: Record<string, string> = { Instagram: "bg-pink-100 text-pink-900", TikTok: "bg-slate-900 text-white", Facebook: "bg-blue-100 text-blue-900", YouTube: "bg-red-100 text-red-900", "Google Business": "bg-amber-100 text-amber-900" };

export function accountColor(platform: string) { return ACCOUNT_COLORS[platform] ?? "bg-brand-soft text-brand-dark"; }

export function ContentCalendar({ posts, mode, cursor }: { posts: CalendarPost[]; mode: "week" | "month"; cursor: Date }) {
  const first = mode === "week" ? startOfWeek(cursor) : startOfWeek(startOfMonth(cursor));
  const days = Array.from({ length: mode === "week" ? 7 : 42 }, (_, index) => addDays(first, index));
  const byDay = new Map<string, CalendarPost[]>();
  for (const post of posts) { const key = ymd(post.scheduledAt); byDay.set(key, [...(byDay.get(key) ?? []), post]); }
  const activeMonth = ymd(startOfMonth(cursor)).slice(0, 7);
  return <div className="overflow-x-auto rounded-xl border border-border bg-surface"><div className="grid min-w-[44rem] grid-cols-7 border-b border-border bg-surface-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <div key={day} className="border-r border-border py-2 last:border-r-0">{day}</div>)}</div><div className="grid min-w-[44rem] grid-cols-7">{days.map((day) => { const key = ymd(day); const inMonth = mode === "week" || key.slice(0, 7) === activeMonth; return <div key={key} className={`min-h-28 border-b border-r border-border p-1.5 last:border-r-0 ${inMonth ? "bg-surface" : "bg-surface-2/60 text-muted"}`}><p className="mb-1 text-xs font-semibold">{fmtDay(day).replace(/^[A-Za-z]+, /, "")}</p><div className="space-y-1">{(byDay.get(key) ?? []).map((post) => <Link key={post.id} href={`/content/${post.piece.id}`} title={`${post.account.platform}: ${post.piece.title}`} className={`block truncate rounded px-1.5 py-1 text-[11px] font-medium ${accountColor(post.account.platform)}`}><span className="opacity-80">{fmtTime(post.scheduledAt)} · </span>{post.piece.title}</Link>)}</div></div>; })}</div></div>;
}
