import { BRAND } from "@/config/brand";
import { Card, Page, PageHeader, Progress, Stat } from "@/components/app/ui";
import { duration } from "@/lib/dates";
import { pct, usd } from "@/lib/money";
import { day30Metrics } from "@/modules/metrics/stats";
import { contentStats } from "@/modules/content/stats";

export const metadata = { title: "Day 30 Metrics" };

export default async function MetricsPage() {
  const [m, content] = await Promise.all([day30Metrics(), contentStats()]);
  const reviewGain = Math.max(0, m.reviews.count - BRAND.baseline.reviews);
  return (
    <Page wide>
      <PageHeader title="Day 30 metrics" sub="The scorecard for the next Your Business growth call" />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Members" value={m.memberships.members} sub={`from ${BRAND.baseline.members} baseline`} tone="brand" />
        <Stat label="MRR" value={usd(m.memberships.mrr)} sub={`${pct(m.memberships.mrr / BRAND.goals.mrr)} of ${usd(BRAND.goals.mrr)} goal`} tone="brand" />
        <Stat label="Jobs this week" value={`${m.jobsThisWeek}/${BRAND.capacity.maxJobsPerWeek}`} sub={`baseline ${BRAND.baseline.jobsPerWeek}/week`} tone={m.jobsThisWeek >= BRAND.baseline.jobsPerWeek ? "good" : "default"} />
        <Stat label="Google reviews" value={m.reviews.count} sub={`+${reviewGain} since ${BRAND.baseline.reviews}`} tone="good" />
        <Stat label="Cost per lead" value={m.cpl == null ? "—" : usd(m.cpl)} sub={m.adLeads ? `${m.adLeads} paid leads, last 30d` : "Add ad stats to calculate"} />
        <Stat label="First reply" value={m.avgReplyMinutes == null ? "—" : duration(m.avgReplyMinutes)} sub={m.avgReplyMinutes != null ? `${m.repliedWithinTarget}/${m.leadCount} within ${BRAND.speedToLeadMinutes}m` : "No replied leads in last 30d"} tone={m.avgReplyMinutes != null && m.avgReplyMinutes <= BRAND.speedToLeadMinutes ? "good" : "default"} />
        <Stat label="Content posted" value={content.posted} sub={`${content.planned} planned this week`} tone="brand" />
        <Stat label="Repeat customers" value={pct(m.repeatCustomerRate)} sub={`90-day retention ${pct(m.retention90)}`} tone="good" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Goals at a glance">
          <MetricProgress label="MRR" value={m.memberships.mrr} max={BRAND.goals.mrr} valueLabel={`${usd(m.memberships.mrr)} / ${usd(BRAND.goals.mrr)}`} />
          <MetricProgress label="Reviews" value={m.reviews.count} max={BRAND.goals.reviews} valueLabel={`${m.reviews.count} / ${BRAND.goals.reviews}`} />
          <MetricProgress label="Weekly capacity" value={m.jobsThisWeek} max={BRAND.capacity.maxJobsPerWeek} valueLabel={`${m.jobsThisWeek} / ${BRAND.capacity.maxJobsPerWeek} jobs`} />
        </Card>
        <Card title="Lead conversion, last 30 days">
          <p className="text-3xl font-bold text-brand">{pct(m.leadToBooked)}</p>
          <p className="mt-1 text-sm text-muted">{m.bookedOrDone} booked, completed or member leads out of {m.leadCount} new leads.</p>
          <div className="mt-4"><Progress value={m.bookedOrDone} max={Math.max(m.leadCount, 1)} tone="good" /></div>
          <p className="mt-4 text-xs text-muted">This is a pipeline outcome rate, not an attribution claim. Keep lead sources and ad results updated for a reliable Day 30 discussion.</p>
        </Card>
        <Card title="Day 30 call prompts" className="lg:col-span-2">
          <ul className="grid gap-3 text-sm text-muted md:grid-cols-3">
            <li><strong className="block text-foreground">What is working?</strong> Review the winning lead source, response speed and packages that are converting.</li>
            <li><strong className="block text-foreground">Where is capacity?</strong> Compare booked jobs against the {BRAND.capacity.maxJobsPerWeek}-job weekly capacity before increasing spend.</li>
            <li><strong className="block text-foreground">What ships next?</strong> Choose one MRR action, one review action and one follow-up action for the next seven days.</li>
          </ul>
        </Card>
      </div>
    </Page>
  );
}

function MetricProgress({ label, value, max, valueLabel }: { label: string; value: number; max: number; valueLabel: string }) {
  return <div className="mb-4 last:mb-0"><div className="mb-1 flex justify-between text-sm"><span>{label}</span><span className="font-semibold tabular-nums">{valueLabel}</span></div><Progress value={value} max={max} tone="good" /></div>;
}
