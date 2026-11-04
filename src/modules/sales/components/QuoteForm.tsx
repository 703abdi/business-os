"use client";

import { useMemo, useState } from "react";
import { btn, input, label } from "@/components/app/ui";
import { Submit } from "@/components/app/client";

type Line = { label: string; price: number };

export function QuoteForm({
  action,
  clients,
  services,
  quote,
  defaultClientId,
  brand,
}: {
  action: (fd: FormData) => Promise<void>;
  clients: { id: string; name: string; phone: string }[];
  services: { id: string; name: string; price: number; category: string }[];
  quote?: { id: string; clientId: string; items: Line[]; discount: number; status: string; message: string };
  defaultClientId?: string;
  brand: { name: string; owner: string };
}) {
  const [clientId, setClientId] = useState(quote?.clientId ?? defaultClientId ?? "");
  const [lines, setLines] = useState<Line[]>(quote?.items.length ? quote.items : []);
  const [discount, setDiscount] = useState(quote?.discount ?? 0);
  const [message, setMessage] = useState(quote?.message ?? "");
  const subtotal = lines.reduce((s, l) => s + (Number(l.price) || 0), 0);
  const total = Math.max(0, subtotal - discount);
  const client = clients.find((c) => c.id === clientId);

  const sms = useMemo(() => {
    if (!client) return "";
    const first = client.name.split(" ")[0];
    const body = [
      `Hey ${first}, it's ${brand.owner} with ${brand.name}. Here's your quote:`,
      ...lines.filter((l) => l.label).map((l) => `- ${l.label}: $${l.price}`),
      discount ? `- Discount: -$${discount}` : "",
      `Total: $${total}`,
      message,
      "Want me to lock in a day?",
    ]
      .filter(Boolean)
      .join("\n");
    const tel = client.phone.replace(/[^\d+]/g, "");
    return tel ? `sms:${tel}?&body=${encodeURIComponent(body)}` : "";
  }, [client, lines, discount, total, message, brand]);

  const update = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  return (
    <form action={action} className="space-y-4">
      {quote && <input type="hidden" name="id" value={quote.id} />}
      <div>
        <label className={label}>Client</label>
        <select name="clientId" required value={clientId} onChange={(e) => setClientId(e.target.value)} className={input}>
          <option value="">Pick a client...</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div>
        <p className={label}>Add a service</p>
        <div className="flex flex-wrap gap-1.5">
          {services.map((s) => (
            <button key={s.id} type="button" onClick={() => setLines((ls) => [...ls, { label: s.name, price: s.price }])} className={btn.small}>
              + {s.name} ${s.price}
            </button>
          ))}
          <button type="button" onClick={() => setLines((ls) => [...ls, { label: "", price: 0 }])} className={btn.small}>+ Custom line</button>
        </div>
      </div>

      <div className="space-y-2">
        {lines.map((l, i) => (
          <div key={i} className="flex gap-2">
            <input name="itemLabel" value={l.label} onChange={(e) => update(i, { label: e.target.value })} className={input} placeholder="What" />
            <input name="itemPrice" value={l.price} inputMode="numeric" onChange={(e) => update(i, { price: Number(e.target.value.replace(/[^\d]/g, "")) || 0 })} className={`${input} w-24`} />
            <button type="button" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="px-2 text-muted" aria-label="Remove line">×</button>
          </div>
        ))}
        {lines.length === 0 && <p className="text-sm text-muted">Tap a service above to add it.</p>}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div><label className={label}>Discount $</label><input name="discount" inputMode="numeric" value={discount} onChange={(e) => setDiscount(Number(e.target.value.replace(/[^\d]/g, "")) || 0)} className={input} /></div>
        <div className="flex flex-col justify-end text-right">
          <p className="text-xs text-muted">Subtotal ${subtotal}</p>
          <p className="text-2xl font-bold">${total}</p>
        </div>
      </div>
      <div><label className={label}>Note to client</label><textarea name="message" rows={2} value={message} onChange={(e) => setMessage(e.target.value)} className={input} placeholder="Add any helpful scope or timing notes." /></div>
      <div>
        <label className={label}>Status</label>
        <select name="status" defaultValue={quote?.status ?? "draft"} className={input}>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="accepted">Accepted</option>
          <option value="declined">Declined</option>
        </select>
      </div>
      <div className="flex flex-wrap gap-2">
        <Submit className={btn.primary}>Save quote</Submit>
        {sms && <a href={sms} className={btn.outline}>Text it to {client?.name.split(" ")[0]}</a>}
      </div>
    </form>
  );
}
