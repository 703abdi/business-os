import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { BRAND } from "@/config/brand";
import { Badge, Card, Empty, Page, PageHeader, Progress, Stat, btn, input, label } from "@/components/app/ui";
import { ConfirmSubmit, CopyButton, Disclosure, Submit } from "@/components/app/client";
import { Lines } from "@/components/app/charts";
import { addDays, fmtDate, fmtDay, startOfMonth, startOfWeek, ymd } from "@/lib/dates";
import { pct, safeDiv } from "@/lib/money";
import { addPost, addSnapshot, deletePost, requestReview, updateRequest } from "@/modules/reviews/actions";
import { reviewStats } from "@/modules/reviews/stats";

export const metadata = { title: "Google Business Profile" };

const REPLIES = [
  { title: "5 stars, short", body: "Thank you {name}! Glad the service came out the way you wanted. See you next time." },
  { title: "5 stars, mentions job", body: "Appreciate you {name}. That interior took some work but it was worth it. Thanks for trusting {brand} with it." },
  { title: "Under 5 stars", body: "Thanks for the honest feedback {name}. I want to make this right. I'll reach out today to set up a time to fix it." },
];

export default async function ReviewsPage() {
  const now = new Date();
  const d30 = addDays(now, -30);
  const [week, month, snapshots, requests, unasked, posts] = await Promise.all([
    reviewStats(startOfWeek(now)),
    reviewStats(startOfMonth(now)),
    prisma.reviewSnapshot.findMany({ orderBy: { date: "asc" }, take: 120 }),
    prisma.reviewRequest.findMany({ where: { sentAt: { gte: addDays(now, -60) } }, orderBy: { sentAt: "desc" }, include: { client: true, job: { include: { service: true } } } }),
    prisma.job.findMany({
      where: { status: "DONE", startAt: { gte: d30 }, reviewRequests: { none: {} }, client: { memberships: { none: { status: "ACTIVE" } } } },
      orderBy: { startAt: "desc" },
      include: { client: true, service: true },
    }),
    prisma.gbpPost.findMany({ orderBy: { date: "desc" }, take: 30 }),
  ]);
  const sent30 = requests.filter((r) => r.sentAt >= d30);
  const reviewed30 = sent30.filter((r) => r.reviewed);
  const unreplied = requests.filter((r) => r.reviewed && !r.replied);
  const postsMonth = posts.filter((p) => p.date >= startOfMonth(now)).length;
  const goal = BRAND.goals.reviews;

  return (
    <Page wide>
      <PageHeader title="Google Business Profile" sub="Reviews, review requests and posts" />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Reviews" value={week.count} sub={`goal ${goal} · from ${BRAND.baseline.reviews}`} tone="brand" />
        <Stat label="Rating" value={week.rating.toFixed(1)} sub="★ average" />
        <Stat label="New this week" value={week.added} tone={week.added ? "good" : "default"} />
        <Stat label="New this month" value={month.added} />
        <Stat label="Request → review" value={pct(safeDiv(reviewed30.length, sent30.length))} sub={`${reviewed30.length}/${sent30.length} last 30 days`} />
      </div>
      <Card className="mb-4">
        <div className="mb-1 flex justify-between text-sm"><span className="font-semibold">Road to {goal} reviews</span><span className="tabular-nums">{week.count}/{goal}</span></div>
        <Progress value={week.count} max={goal} tone="good" />
        {snapshots.length > 1 && (
          <div className="mt-3">
            <Lines data={snapshots.map((s) => ({ label: fmtDate(s.date).replace(/, \d{4}$/, ""), count: s.count }))} series={[{ key: "count", label: "Reviews", color: "#0e7c86" }]} isMoney={false} goal={goal} height={180} />
          </div>
        )}
        <Disclosure summary="+ Log today's count from Google" className="mt-3">
          <form action={addSnapshot} className="grid grid-cols-3 gap-2">
            <div><label className={label}>Date</label><input type="date" name="date" defaultValue={ymd(now)} className={input} /></div>
            <div><label className={label}>Rating</label><input name="rating" inputMode="decimal" defaultValue={week.rating.toFixed(1)} className={input} /></div>
            <div><label className={label}>Review count</label><input name="count" inputMode="numeric" defaultValue={week.count} className={input} /></div>
            <Submit className={btn.primary}>Save</Submit>
          </form>
        </Disclosure>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={`Jobs with no review ask (${unasked.length})`} pad={false}>
          {unasked.length === 0 ? <Empty>Every finished job got a review ask. Keep it up.</Empty> : (
            <ul className="divide-y divide-border">
              {unasked.map((j) => {
                const tel = j.client.phone.replace(/[^\d+]/g, "");
                const text = `Hey ${j.client.name.split(" ")[0]}, thanks again for having ${BRAND.name} out! Would you leave us a quick Google review? It helps a small business a lot: ${BRAND.links.googleReview || "[review link]"}`;
                return (
                  <li key={j.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <Link href={`/crm/${j.clientId}`} className="text-sm font-semibold">{j.client.name}</Link>
                      <p className="text-xs text-muted">{fmtDay(j.startAt)} · {j.service?.name ?? j.title}</p>
                    </div>
                    {tel && <a href={`sms:${tel}?&body=${encodeURIComponent(text)}`} className={btn.small}>Text link</a>}
                    <form action={requestReview.bind(null, j.id)}>
                      <button name="channel" value="text" className={btn.small}>Mark sent</button>
                    </form>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title={`Review requests, last 60 days (${requests.length})`} pad={false}>
          {requests.length === 0 ? <Empty>No requests logged yet.</Empty> : (
            <ul className="divide-y divide-border">
              {requests.map((r) => (
                <li key={r.id} className="px-4 py-2.5">
                  <Disclosure
                    summary={
                      <span className="flex flex-wrap items-center gap-1.5">
                        {r.client.name}
                        <span className="text-xs font-normal text-muted">{fmtDay(r.sentAt)} · {r.channel.replace("_", " ")}</span>
                        {r.reviewed ? <Badge color="green">Reviewed{r.rating ? ` ${r.rating}★` : ""}</Badge> : <Badge color="amber">Waiting</Badge>}
                        {r.reviewed && !r.replied && <Badge color="red">Reply</Badge>}
                      </span>
                    }
                  >
                    <form action={updateRequest.bind(null, r.id)} className="space-y-2">
                      <div className="flex flex-wrap gap-4">
                        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="reviewed" defaultChecked={r.reviewed} className="h-4 w-4" /> Left a review</label>
                        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="replied" defaultChecked={r.replied} className="h-4 w-4" /> We replied</label>
                        <label className="flex items-center gap-2 text-sm">Stars <input name="rating" inputMode="numeric" defaultValue={r.rating ?? ""} className="w-14 rounded border border-border px-2 py-1" /></label>
                      </div>
                      <textarea name="reviewText" rows={2} defaultValue={r.reviewText} className={input} placeholder="Paste their review" />
                      <textarea name="replyText" rows={2} defaultValue={r.replyText} className={input} placeholder="Our reply" />
                      <Submit className={btn.small}>Save</Submit>
                    </form>
                  </Disclosure>
                </li>
              ))}
            </ul>
          )}
          {unreplied.length > 0 && <p className="border-t border-border px-4 py-2 text-xs font-semibold text-bad">{unreplied.length} reviews still need a reply.</p>}
        </Card>

        <Card title="Reply templates">
          <ul className="space-y-3">
            {REPLIES.map((r) => {
              const body = r.body.replaceAll("{brand}", BRAND.name);
              return (
                <li key={r.title} className="rounded-lg bg-surface-2 p-3">
                  <div className="mb-1 flex items-center justify-between"><p className="text-sm font-semibold">{r.title}</p><CopyButton text={body} className={btn.small} /></div>
                  <p className="text-sm text-muted">{body}</p>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card title={`Posts (${postsMonth} this month, aim for 4)`}>
          <Disclosure summary="+ Log a post" className="mb-3">
            <form action={addPost} className="grid grid-cols-2 gap-2">
              <div><label className={label}>Date</label><input type="date" name="date" defaultValue={ymd(now)} className={input} /></div>
              <div><label className={label}>Type</label><select name="kind" className={input}><option value="update">Update</option><option value="offer">Offer</option><option value="photo">Photo</option><option value="event">Event</option></select></div>
              <div className="col-span-2"><label className={label}>Title</label><input name="title" required className={input} placeholder="Seasonal service update" /></div>
              <div className="col-span-2"><label className={label}>Text</label><textarea name="body" rows={3} className={input} /></div>
              <Submit className={btn.outline}>Save</Submit>
            </form>
          </Disclosure>
          <ul className="divide-y divide-border text-sm">
            {posts.map((p) => (
              <li key={p.id} className="flex items-start justify-between gap-2 py-2">
                <div><p className="font-medium">{p.title}</p><p className="text-xs text-muted">{fmtDate(p.date)} · {p.kind}</p></div>
                <form action={deletePost.bind(null, p.id)}><ConfirmSubmit message="Delete this post log?" className="text-muted">×</ConfirmSubmit></form>
              </li>
            ))}
            {posts.length === 0 && <li className="py-2 text-muted">No posts logged.</li>}
          </ul>
          <p className="mt-3 text-xs text-muted">Google Business Profile API is not connected; counts and posts are logged by hand for now.</p>
        </Card>
      </div>
    </Page>
  );
}
