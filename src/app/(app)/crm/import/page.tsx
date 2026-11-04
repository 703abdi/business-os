import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { Card, Page, PageHeader, btn, input } from "@/components/app/ui";
import { Submit } from "@/components/app/client";
import { importAcuityCsv } from "@/modules/crm/acuity-import";

export const metadata = { title: "Import from Acuity" };

async function runImport(fd: FormData) {
  "use server";
  await requireAdmin();
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) redirect("/crm/import?error=Pick+a+CSV+file");
  if (file.size > 8_000_000) redirect("/crm/import?error=File+is+over+8MB");
  const r = await importAcuityCsv(await file.text());
  revalidatePath("/crm");
  redirect(`/crm/import?rows=${r.rows}&created=${r.clientsCreated}&matched=${r.clientsMatched}&jobs=${r.jobsCreated}&skipped=${r.skipped}`);
}

export default async function ImportPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return (
    <Page>
      <Link href="/crm" className="mb-3 inline-flex text-sm text-muted">← Clients</Link>
      <PageHeader title="Import from Acuity" sub="Brings in past clients and appointments. Safe to run again: duplicates are skipped." />
      {sp.rows && (
        <div className="mb-4 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
          Read {sp.rows} rows: {sp.created} new clients, {sp.matched} matched existing, {sp.jobs} jobs added, {sp.skipped} skipped.{" "}
          <Link href="/crm" className="font-semibold underline">See clients</Link>
        </div>
      )}
      {sp.error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">{sp.error}</div>}
      <Card title="1. Export from Acuity">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
          <li>In Acuity, open Reports, then Import/Export.</li>
          <li>Export appointments, pick the full date range, format CSV.</li>
          <li>Upload the file below. Past appointments become completed jobs with revenue; future ones show on the schedule.</li>
        </ol>
      </Card>
      <Card title="2. Upload the CSV" className="mt-4">
        <form action={runImport} className="space-y-3">
          <input type="file" name="file" accept=".csv,text/csv" required className={input} />
          <Submit className={btn.primary} pending="Importing...">Import</Submit>
        </form>
      </Card>
    </Page>
  );
}
