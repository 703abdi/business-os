// Inbound lead webhook for Meta lead ads (through Zapier/Make), Squarespace
// forms, or anything that can POST JSON. Auth: header
// "Authorization: Bearer <LEADS_WEBHOOK_SECRET>".
// Body: { name, phone?, email?, address?, city?, service?, message?, source? ("meta", "google", ...) }
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { captureLead } from "@/modules/crm/capture";
import { guessSource } from "@/modules/crm/constants";

function authorized(req: NextRequest) {
  const secret = process.env.LEADS_WEBHOOK_SECRET;
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || !got) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

const s = (v: unknown, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Send JSON" }, { status: 400 });
  const event = await prisma.inboundEvent.create({ data: { source: "leads", payload: body as object } });
  const name = s(body.name, 120) || [s(body.first_name, 60), s(body.last_name, 60)].filter(Boolean).join(" ");
  if (!name && !s(body.phone) && !s(body.email)) {
    await prisma.inboundEvent.update({ where: { id: event.id }, data: { status: "ignored", error: "no name, phone or email" } });
    return NextResponse.json({ error: "Need a name, phone or email" }, { status: 400 });
  }
  const r = await captureLead({
    name,
    phone: s(body.phone, 40),
    email: s(body.email, 200),
    address: s(body.address, 200),
    city: s(body.city, 80),
    vehicle: s(body.vehicle, 120),
    note: s(body.message, 2000),
    source: guessSource(s(body.source)),
    sourceHint: s(body.source),
    externalId: s(body.id, 100) ? `inbound:${s(body.id, 100)}` : undefined,
    alert: true,
  });
  await prisma.inboundEvent.update({ where: { id: event.id }, data: { status: "processed" } });
  return NextResponse.json({ ok: true, clientId: r.id, created: r.created });
}
