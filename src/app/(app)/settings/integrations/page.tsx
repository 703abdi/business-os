import Link from "next/link";
import { Card, Page, PageHeader, Badge, btn, input, label } from "@/components/app/ui";
import { INTEGRATIONS } from "@/modules/integrations/registry";
import { prisma } from "@/lib/prisma";
import { saveContentAccount } from "@/modules/content/actions";
import { requireAdmin } from "@/lib/auth";

export default async function IntegrationsPage() {
  await requireAdmin();
  const accounts = await prisma.contentAccount.findMany({ orderBy: { platform: "asc" } });
  return <Page wide>
    <PageHeader title="Integrations" sub="Connection status reflects the configured services." actions={<Link href="/settings" className={btn.outline}>Settings</Link>} />
    <div className="grid gap-3 md:grid-cols-2">
      {INTEGRATIONS.map((provider) => {
        const connected = !!provider.env?.length && provider.env.every((key) => Boolean(process.env[key]));
        return <Card key={provider.key} title={provider.name} action={<Badge color={connected ? "green" : "gray"}>{connected ? "Connected" : provider.comingSoon ? "Coming soon" : "Not connected"}</Badge>}><p className="text-sm text-muted">{provider.what}</p>{provider.env?.length ? <p className="mt-3 text-xs text-muted">Needs: <code>{provider.env.join(", ")}</code></p> : <p className="mt-3 text-xs text-muted">Coming soon.</p>}<button disabled={!connected} className={`${btn.small} mt-3`}>{connected ? "Test connection configured" : provider.comingSoon ? "Coming soon" : "Add keys to test"}</button></Card>;
      })}
    </div>
    <Card title="Content accounts" className="mt-4"><p className="mb-3 text-sm text-muted">These are the accounts shown in the posting calendar. Instagram and TikTok are prefilled by the sample seed.</p><form action={saveContentAccount} className="grid gap-2 md:grid-cols-4"><div><label className={label}>Platform</label><select name="platform" className={input}><option>Instagram</option><option>TikTok</option><option>Facebook</option><option>YouTube</option><option>Google Business</option></select></div><div><label className={label}>Handle</label><input name="handle" className={input} placeholder="@yourbusiness" /></div><div><label className={label}>Profile URL</label><input name="profileUrl" className={input} placeholder="https://..." /></div><div className="flex items-end"><button className={btn.primary}>Save account</button></div></form><ul className="mt-3 text-sm text-muted">{accounts.map((account) => <li key={account.id}>{account.platform} · {account.handle || "no handle"}</li>)}</ul></Card>
  </Page>;
}
