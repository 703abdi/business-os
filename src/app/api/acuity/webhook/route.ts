import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { captureLead } from "@/modules/crm/capture";
import { parseAcuityDate } from "@/modules/crm/acuity-import";
import { verifyAcuitySignature } from "@/lib/acuity-webhook";
import { AcuityAppointmentLookupError, fetchAcuityAppointment } from "@/lib/acuity-appointment";

export const dynamic = "force-dynamic";

const text = (value: unknown, max = 300) => typeof value === "string" ? value.trim().slice(0, max) : value == null ? "" : String(value).slice(0, max);
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

class MalformedAcuityPayloadError extends Error {}

function relayAuthorized(req: NextRequest) {
  const secret = process.env.ACUITY_WEBHOOK_SECRET;
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || req.headers.get("x-acuity-webhook-secret") || "";
  if (!secret || !got) return false;
  const a = Buffer.from(got); const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Acuity event receiver. Native Acuity form posts are HMAC-signed; JSON relays use the legacy shared secret. */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const native = req.headers.get("content-type")?.toLowerCase().includes("application/x-www-form-urlencoded") ?? false;
  let payload: Record<string, unknown> | null = null;
  let appointment: Record<string, unknown> | null = null;
  if (native) {
    if (!verifyAcuitySignature(raw, req.headers.get("x-acuity-signature"), process.env.ACUITY_API_KEY)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const form = new URLSearchParams(raw);
    const id = text(form.get("id"), 100);
    if (!id) return NextResponse.json({ error: "Acuity event has no appointment id" }, { status: 400 });
    payload = Object.fromEntries(form.entries());
    try {
      appointment = await fetchAcuityAppointment(id, { userId: process.env.ACUITY_USER_ID, apiKey: process.env.ACUITY_API_KEY });
    } catch (error) {
      if (error instanceof AcuityAppointmentLookupError) {
        // A 500 tells Acuity to retry transient network, timeout, 429, and
        // upstream 5xx failures instead of silently dropping a signed event.
        return NextResponse.json({ error: "Acuity appointment could not be loaded" }, { status: 500 });
      }
      throw error;
    }
  } else {
    if (!relayAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    let decoded: unknown;
    try {
      decoded = JSON.parse(raw || "null") as unknown;
    } catch {
      return NextResponse.json({ error: "Send valid JSON" }, { status: 400 });
    }
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) return NextResponse.json({ error: "Send JSON" }, { status: 400 });
    payload = decoded as Record<string, unknown>;
  }
  const event = await prisma.inboundEvent.create({ data: { source: "acuity", payload: payload as object } });
  try {
    const root = record(payload); const details = appointment ?? record(root.appointment ?? root); const action = text(root.action ?? root.event ?? root.type).toLowerCase();
    const id = text(details.id ?? details.appointmentId ?? root.id, 100);
    const externalId = id ? `acuity:${id}` : "";
    if (!externalId) throw new MalformedAcuityPayloadError("Acuity event has no appointment id");
    const cancelled = /cancel/.test(action) || Boolean(details.cancelled);
    const existing = await prisma.job.findUnique({ where: { externalId } });
    if (cancelled && existing) await prisma.job.update({ where: { id: existing.id }, data: { status: "CANCELED" } });
    else if (!cancelled) {
      const first = text(details.firstName ?? details.first_name, 60); const last = text(details.lastName ?? details.last_name, 60);
      const client = record(details.client);
      const name = [first, last].filter(Boolean).join(" ") || text(details.name ?? client.name, 120) || "Acuity client";
      const lead = await captureLead({ name, email: text(details.email ?? client.email, 200), phone: text(details.phone ?? client.phone, 40), address: text(details.address ?? client.address, 200), city: text(details.city ?? client.city, 80), source: "WEBSITE", sourceHint: "Acuity", externalId: `acuity-client:${text(details.email ?? details.phone ?? id, 100)}`, alert: false });
      const start = parseAcuityDate(text(details.datetime ?? details.startTime ?? details.start));
      if (!start) throw new MalformedAcuityPayloadError("Acuity event has no readable appointment time");
      const serviceName = text(details.type ?? details.appointmentType ?? details.service, 120);
      const service = serviceName ? await prisma.service.findFirst({ where: { name: { equals: serviceName, mode: "insensitive" } } }) : null;
      const price = Math.round(Number(text(details.price ?? details.amount).replace(/[$,]/g, "")) || service?.price || 0);
      await prisma.job.upsert({ where: { externalId }, create: { clientId: lead.id, serviceId: service?.id, title: serviceName, price, startAt: start, durationMin: service?.durationMin ?? 180, status: "CONFIRMED", externalId }, update: { serviceId: service?.id, title: serviceName, price, startAt: start, durationMin: service?.durationMin ?? 180, status: "CONFIRMED" } });
    }
    await prisma.inboundEvent.update({ where: { id: event.id }, data: { status: "processed" } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Unknown error";
    await prisma.inboundEvent.update({ where: { id: event.id }, data: { status: "error", error: message } });
    const status = error instanceof MalformedAcuityPayloadError ? 400 : 500;
    return NextResponse.json({ error: "Webhook could not be processed" }, { status });
  }
}
