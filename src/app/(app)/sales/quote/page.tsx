import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { BRAND } from "@/config/brand";
import { Card, Page, PageHeader } from "@/components/app/ui";
import { saveQuote } from "@/modules/sales/actions";
import { QuoteForm } from "@/modules/sales/components/QuoteForm";

export const metadata = { title: "Quote builder" };

export default async function QuotePage({ searchParams }: { searchParams: Promise<{ id?: string; client?: string; saved?: string }> }) {
  const sp = await searchParams;
  const [clients, services, quote] = await Promise.all([
    prisma.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, phone: true } }),
    prisma.service.findMany({ where: { active: true }, orderBy: { sort: "asc" } }),
    sp.id ? prisma.quote.findUnique({ where: { id: sp.id } }) : null,
  ]);
  return (
    <Page>
      <Link href="/sales" className="mb-3 inline-flex text-sm text-muted">← Sales</Link>
      <PageHeader title={quote ? "Edit quote" : "New quote"} sub="Saving as Sent moves the lead to Quoted. Accepted moves it to Booked." />
      {sp.saved && <p className="mb-3 rounded-lg bg-green-50 p-3 text-sm text-green-900">Saved.{quote && <> <Link href={`/crm/${quote.clientId}`} className="underline">Open client</Link></>}</p>}
      <Card>
        <QuoteForm
          action={saveQuote}
          clients={clients}
          services={services.map((s) => ({ id: s.id, name: s.name, price: s.price, category: s.category }))}
          quote={quote ? { id: quote.id, clientId: quote.clientId, items: (quote.items as { label: string; price: number }[]) ?? [], discount: quote.discount, status: quote.status, message: quote.message } : undefined}
          defaultClientId={sp.client}
          brand={{ name: BRAND.name, owner: BRAND.owner }}
        />
      </Card>
    </Page>
  );
}
