// Turns an inbound lead (website form, Meta lead form, webhook) into a CRM
// client. Matches an existing client by email or phone so repeat submissions
// don't create duplicates. Server-only; no session check (callers verify).
import { prisma } from "@/lib/prisma";
import type { Client } from "@prisma/client";
import { geocode } from "@/lib/geocode";
import { defaultAlertTo, emailConfigured, sendLeadEmail } from "@/lib/notify";
import { guessSource, SOURCE_LABEL, type SourceKey } from "./constants";

export type InboundLead = {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  vehicle?: string;
  note?: string;
  source?: SourceKey;
  sourceHint?: string;
  externalId?: string;
  at?: Date;
  /** Email the owner a speed-to-lead alert (forms send their own alerts, so they leave this off). */
  alert?: boolean;
};

const digits = (p = "") => p.replace(/\D/g, "").slice(-10);
const isUniqueConstraint = (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "P2002";

export async function captureLead(lead: InboundLead): Promise<{ id: string; created: boolean }> {
  const email = (lead.email ?? "").trim().toLowerCase();
  const phone = (lead.phone ?? "").trim();
  if (lead.externalId) {
    const byExt = await prisma.client.findUnique({ where: { externalId: lead.externalId } });
    if (byExt) return { id: byExt.id, created: false };
  }
  const candidates = email || phone
    ? await prisma.client.findMany({
        where: { OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone: { contains: digits(phone).slice(-4) } }] : [])] },
        take: 20,
      })
    : [];
  const existing = candidates.find((c) => (email && c.email === email) || (phone && digits(c.phone) === digits(phone)));
  const note = [lead.vehicle && `Reference: ${lead.vehicle}`, lead.note].filter(Boolean).join("\n");

  if (existing) {
    await prisma.activity.create({ data: { clientId: existing.id, kind: "system", body: `New inquiry came in.${note ? `\n${note}` : ""}` } });
    // A past client asking again is a new lead for the pipeline.
    if (existing.stage === "LOST" || existing.stage === "COMPLETED") {
      await prisma.client.update({ where: { id: existing.id }, data: { stage: "NEW", leadAt: lead.at ?? new Date(), firstReplyAt: null } });
    }
    return { id: existing.id, created: false };
  }

  const pos = lead.address ? await geocode(lead.address, lead.city) : null;
  let c: Client;
  try {
    c = await prisma.client.create({
      data: {
        name: lead.name.slice(0, 120) || email || phone || "New lead",
        email,
        phone,
        address: lead.address ?? "",
        city: lead.city ?? "",
        lat: pos?.lat,
        lng: pos?.lng,
        source: lead.source ?? guessSource(lead.sourceHint),
        stage: "NEW",
        leadAt: lead.at ?? new Date(),
        externalId: lead.externalId,
        notes: note,
      },
    });
  } catch (error) {
    // Concurrent webhook retries can both observe no client before the unique
    // external ID is written. Resolve that race to the one persisted client.
    if (!lead.externalId || !isUniqueConstraint(error)) throw error;
    const existingClient = await prisma.client.findUnique({ where: { externalId: lead.externalId } });
    if (!existingClient) throw error;
    return { id: existingClient.id, created: false };
  }
  await prisma.activity.create({ data: { clientId: c.id, kind: "system", body: `Lead captured${lead.sourceHint ? ` (${lead.sourceHint})` : ""}` } });
  if (lead.alert && emailConfigured() && defaultAlertTo()) {
    const base = process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
    await sendLeadEmail({
      to: [defaultAlertTo()],
      formTitle: `New ${SOURCE_LABEL[c.source as SourceKey]} lead: reply in 5 minutes`,
      lead: { name: c.name, email: c.email, phone: c.phone },
      lines: [["Reference", lead.vehicle ?? ""], ["Address", [c.address, c.city].filter(Boolean).join(", ")], ["Notes", lead.note ?? ""]],
      dashboardUrl: `${base}/crm/${c.id}`,
    }).catch((e) => console.error("lead alert failed", e));
  }
  return { id: c.id, created: true };
}
