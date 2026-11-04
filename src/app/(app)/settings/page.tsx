import { BRAND } from "@/config/brand";
import { prisma } from "@/lib/prisma";
import { Card, Page, PageHeader, btn } from "@/components/app/ui";
import { ConfirmSubmit } from "@/components/app/client";
import { clearSampleData } from "@/modules/settings/actions";
import Link from "next/link";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const sampleClients = await prisma.client.count({ where: { isSample: true } });
  return (
    <Page>
      <PageHeader title="Settings" sub="Business defaults, integrations and demo data" />
      <div className="space-y-4">
        <Link href="/settings/integrations" className={btn.primary}>Open integrations hub</Link>
        <Card title="Your Business defaults">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-muted">Service area</dt><dd>{BRAND.serviceArea}</dd></div>
            <div><dt className="text-xs text-muted">Weekly capacity</dt><dd>{BRAND.capacity.maxJobsPerWeek} jobs</dd></div>
            <div><dt className="text-xs text-muted">MRR goal</dt><dd>${BRAND.goals.mrr.toLocaleString()}/month</dd></div>
            <div><dt className="text-xs text-muted">Speed-to-lead target</dt><dd>{BRAND.speedToLeadMinutes} minutes</dd></div>
          </dl>
          <p className="mt-4 text-xs text-muted">Business branding and operating targets are set up for Your Business.</p>
        </Card>

        <Card title="Integrations">
          <ul className="space-y-2 text-sm text-muted">
            <li><span className="font-medium text-foreground">Acuity:</span> CSV import is available in Clients. Connect automatic booking events from the Integrations hub.</li>
            <li><span className="font-medium text-foreground">Daily brief:</span> Vercel calls <code>/api/cron/daily</code>; it needs <code>CRON_SECRET</code> and optional email settings.</li>
            <li><span className="font-medium text-foreground">Ads and Google:</span> manual entry is live. API credentials are reserved for a future connection.</li>
          </ul>
        </Card>

        <Card title="Sample data" className="border-amber-300" >
          <div id="sample" className="scroll-mt-24">
            <p className="text-sm">{sampleClients ? `${sampleClients} sample client${sampleClients === 1 ? " is" : "s are"} currently loaded.` : "No sample clients are loaded."}</p>
            <p className="mt-1 text-sm text-muted">Sample rows are clearly marked and are safe to remove. This action only deletes rows flagged as sample; it never deletes real client data.</p>
            {sampleClients > 0 && (
              <form action={clearSampleData} className="mt-4">
                <ConfirmSubmit className={btn.danger} message="Clear all sample data? This permanently deletes only records marked as sample. Real data is not touched.">Clear sample data</ConfirmSubmit>
              </form>
            )}
          </div>
        </Card>
      </div>
    </Page>
  );
}
