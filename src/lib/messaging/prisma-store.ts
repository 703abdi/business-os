// MessagingStore on Prisma (business_os schema) plus the sales-tool automation runs (public schema).
import { prisma } from "@/lib/prisma";
import { q } from "@/lib/db";
import { resolveConfig } from "@/lib/messaging/settings";
import { phoneKey } from "@/lib/messaging/phone";
import type { CallRow, ClientLite, MessageRow, MessagingStore } from "@/lib/messaging/store";
import type { Message, PhoneCall } from "@prisma/client";

const lite = { id: true, name: true, phone: true, stage: true, smsConsent: true, smsOptOutAt: true } as const;
const toRow = (m: Message): MessageRow => ({ ...m, direction: m.direction as MessageRow["direction"], status: m.status as MessageRow["status"], provider: m.provider as MessageRow["provider"] });
const toCall = (c: PhoneCall): CallRow => ({ callSessionId: c.callSessionId, fromNumber: c.fromNumber, toNumber: c.toNumber, answered: c.answered, hangupCause: c.hangupCause, missed: c.missed, handledAt: c.handledAt, clientId: c.clientId });
const isUnique = (e: unknown) => typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "P2002";

async function ownerMemberId(): Promise<string | null> {
  const m = await prisma.teamMember.findFirst({ where: { isOwner: true, active: true }, select: { id: true } });
  return m?.id ?? null;
}

export const prismaStore: MessagingStore = {
  async getConfig() {
    return resolveConfig(await prisma.messagingSettings.findUnique({ where: { id: "default" } }));
  },
  getClient: (id) => prisma.client.findUnique({ where: { id }, select: lite }) as Promise<ClientLite | null>,
  async findClientsByPhone(e164) {
    const key = phoneKey(e164);
    if (key.length < 7) return [];
    const rows = await prisma.client.findMany({ where: { phone: { contains: key.slice(-4) } }, select: lite, orderBy: { createdAt: "asc" }, take: 50 });
    return rows.filter((c) => phoneKey(c.phone) === key);
  },
  async createClient({ name, phone, source, note }) {
    const c = await prisma.client.create({ data: { name, phone, source, stage: "NEW", leadAt: new Date(), notes: note }, select: lite });
    await prisma.activity.create({ data: { clientId: c.id, kind: "system", body: `Lead captured (${source === "MISSED_CALL" ? "missed call" : "text to the business line"})` } });
    return c;
  },
  async updateConsent(ids, patch) {
    if (ids.length) await prisma.client.updateMany({ where: { id: { in: ids } }, data: patch });
  },
  async addActivity(clientId, kind, body) {
    await prisma.activity.create({ data: { clientId, kind, body: body.slice(0, 2000) } });
  },
  async createFollowUp({ clientId, title, dueAt, sequence }) {
    await prisma.followUp.create({ data: { clientId, title, dueAt, sequence, assigneeId: await ownerMemberId() } });
  },
  async lastMessageAt(toNumber, template) {
    const m = await prisma.message.findFirst({
      where: { toNumber, template, direction: "outbound", status: { in: ["queued", "sending", "sent", "delivered"] } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    return m?.createdAt ?? null;
  },
  async createMessage(m) {
    try {
      return toRow(await prisma.message.create({ data: m }));
    } catch (e) {
      if (m.providerId && isUnique(e)) return null;
      throw e;
    }
  },
  async updateMessage(id, patch) {
    await prisma.message.update({ where: { id }, data: patch });
  },
  async findMessageByProviderId(providerId) {
    const m = await prisma.message.findUnique({ where: { providerId } });
    return m ? toRow(m) : null;
  },
  async claimQueued(now, limit) {
    const due = await prisma.message.findMany({ where: { status: "queued", sendAfter: { lte: now }, isSample: false }, orderBy: { sendAfter: "asc" }, take: limit, select: { id: true } });
    const out: MessageRow[] = [];
    for (const { id } of due) {
      const { count } = await prisma.message.updateMany({ where: { id, status: "queued" }, data: { status: "sending" } });
      if (count) out.push(toRow((await prisma.message.findUnique({ where: { id } }))!));
    }
    return out;
  },
  async cancelQueued(toNumber, reason) {
    const { count } = await prisma.message.updateMany({ where: { toNumber, status: "queued" }, data: { status: "canceled", error: reason } });
    return count;
  },
  async stopSequences(toNumber, reason) {
    const key = phoneKey(toNumber);
    if (key.length < 7) return 0;
    const rows = await q(
      `update automation_runs r set status = 'skipped', updated_at = now(),
         log = r.log || jsonb_build_array(jsonb_build_object('at', now(), 'step', r.step, 'ok', true, 'message', $2::text))
       from contacts c
       where c.id = r.contact_id and r.status = 'waiting' and right(regexp_replace(c.phone, '\\D', '', 'g'), 10) = $1
       returning r.id`,
      [key, `Stopped: ${reason}`],
    );
    return rows.length;
  },
  async getCall(callSessionId) {
    const c = await prisma.phoneCall.findUnique({ where: { callSessionId } });
    return c ? toCall(c) : null;
  },
  async saveCall({ callSessionId, ...rest }) {
    const data = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
    const c = await prisma.phoneCall.upsert({
      where: { callSessionId },
      create: { callSessionId, fromNumber: rest.fromNumber ?? "", toNumber: rest.toNumber ?? "", ...data },
      update: data,
    });
    return toCall(c);
  },
  async claimCall(callSessionId, now) {
    const { count } = await prisma.phoneCall.updateMany({ where: { callSessionId, handledAt: null }, data: { handledAt: now } });
    return count === 1;
  },
};
