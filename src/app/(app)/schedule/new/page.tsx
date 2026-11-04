import Link from "next/link";
import { Card, Page, PageHeader } from "@/components/app/ui";
import { addDays, startOfDay, toLocalInput, zoned, localParts } from "@/lib/dates";
import { saveJob } from "@/modules/schedule/actions";
import { JobForm } from "@/modules/schedule/components/JobForm";
import { jobFormOptions } from "@/modules/schedule/form-data";
import { requireAdmin } from "@/lib/auth";

export const metadata = { title: "Book a job" };

export default async function NewJobPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  await requireAdmin();
  const { client } = await searchParams;
  const opts = await jobFormOptions();
  const tomorrow = localParts(addDays(startOfDay(), 1));
  return (
    <Page>
      <Link href="/schedule" className="mb-3 inline-flex text-sm text-muted">← Schedule</Link>
      <PageHeader title="Book a job" />
      <Card>
        <JobForm action={saveJob} {...opts} defaults={{ clientId: client, startAt: toLocalInput(zoned(tomorrow.y, tomorrow.m, tomorrow.d, 9)) }} />
      </Card>
    </Page>
  );
}
