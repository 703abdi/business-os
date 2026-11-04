import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { BRAND } from "@/config/brand";
import { Card, Page, PageHeader, btn, input, label } from "@/components/app/ui";
import { ConfirmSubmit, CopyButton, Disclosure, Submit } from "@/components/app/client";
import { deleteScript, saveScript } from "@/modules/sales/actions";

export const metadata = { title: "Reply scripts" };

const CATEGORIES: Record<string, string> = {
  first_reply: "First reply to a new lead",
  follow_up: "Follow-ups",
  quote: "Sending a quote",
  objection: "Objections",
  package_pitch: "Maintenance plan pitch",
  review_ask: "Review ask",
};

const fill = (s: string) => s.replaceAll("{brand}", BRAND.name).replaceAll("{owner}", BRAND.owner);

export default async function ScriptsPage() {
  const scripts = await prisma.script.findMany({ orderBy: [{ category: "asc" }, { sort: "asc" }] });
  return (
    <Page>
      <Link href="/sales" className="mb-3 inline-flex text-sm text-muted">← Sales</Link>
      <PageHeader title="Reply scripts" sub="Tap copy, paste into the text, swap in their name. {name} marks where it goes." />
      <div className="space-y-4">
        {Object.entries(CATEGORIES).map(([key, title]) => {
          const list = scripts.filter((s) => s.category === key);
          if (!list.length) return null;
          return (
            <Card key={key} title={title}>
              <ul className="space-y-3">
                {list.map((s) => (
                  <li key={s.id} className="rounded-lg bg-surface-2 p-3">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{s.title}</p>
                      <CopyButton text={fill(s.body)} className={btn.small} />
                    </div>
                    <p className="whitespace-pre-wrap text-sm">{fill(s.body)}</p>
                    <Disclosure summary={<span className="text-xs font-normal text-muted">Edit</span>} className="mt-2">
                      <ScriptForm s={s} />
                      <form action={deleteScript.bind(null, s.id)} className="mt-2">
                        <ConfirmSubmit message="Delete this script?" className="text-xs text-bad">Delete</ConfirmSubmit>
                      </form>
                    </Disclosure>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
        <Card title="Add a script">
          <ScriptForm />
        </Card>
      </div>
    </Page>
  );
}

function ScriptForm({ s }: { s?: { id: string; category: string; title: string; body: string } }) {
  return (
    <form action={saveScript} className="space-y-2">
      {s && <input type="hidden" name="id" value={s.id} />}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={label}>Category</label>
          <select name="category" defaultValue={s?.category ?? "first_reply"} className={input}>
            {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div><label className={label}>Title</label><input name="title" defaultValue={s?.title} className={input} /></div>
      </div>
      <textarea name="body" rows={4} defaultValue={s?.body} className={input} />
      <Submit className={btn.outline}>Save</Submit>
    </form>
  );
}
