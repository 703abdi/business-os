import Link from "next/link";
import { Card, Page, PageHeader } from "@/components/app/ui";
import { SEQUENCES } from "@/modules/sales/sequences";

export const metadata = { title: "Follow-up sequences" };

export default function SequencesPage() {
  return (
    <Page>
      <Link href="/sales" className="mb-3 inline-flex text-sm text-muted">← Sales</Link>
      <PageHeader title="Follow-up sequences" sub="Start one from any client page. Each step becomes a dated follow-up on Today." />
      <div className="grid gap-4 md:grid-cols-2">
        {SEQUENCES.map((s) => (
          <Card key={s.key} title={s.name}>
            <p className="mb-3 text-sm text-muted">{s.when}</p>
            <ol className="space-y-2">
              {s.steps.map((st, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="w-16 shrink-0 text-xs font-semibold text-brand">Day {st.day}{st.hour ? ` +${st.hour}h` : ""}</span>
                  {st.title}
                </li>
              ))}
            </ol>
          </Card>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted">Email sequences for form leads are built in <Link href="/automations" className="text-brand">Automations</Link>.</p>
    </Page>
  );
}
