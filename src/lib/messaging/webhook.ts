// Shared handling for the two Telnyx webhook routes: verify the signature on the raw body,
// keep a copy in InboundEvent for debugging, and always answer 200 for events we ignore
// (Telnyx retries anything that isn't 2xx).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { messagingDeps } from "@/lib/messaging";
import { flushQueue } from "@/lib/messaging/service";

export async function telnyxWebhook(req: Request, kind: "sms" | "voice", handle: (body: unknown) => Promise<{ action: string }>) {
  const raw = await req.text();
  const deps = messagingDeps();
  if (!deps.provider.verifySignature(raw, req.headers)) return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Send JSON" }, { status: 400 });
  }
  const event = await prisma.inboundEvent.create({ data: { source: `telnyx-${kind}`, payload: body as object } });
  try {
    const r = await handle(body);
    await prisma.inboundEvent.update({ where: { id: event.id }, data: { status: r.action === "ignored" ? "ignored" : "processed", error: r.action.slice(0, 200) } });
    // Any webhook is a good moment to send texts that waited for quiet hours to end.
    await flushQueue(deps, 10).catch((e) => console.error("sms queue flush failed", e));
    return NextResponse.json({ ok: true, action: r.action });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    await prisma.inboundEvent.update({ where: { id: event.id }, data: { status: "error", error: msg.slice(0, 500) } });
    console.error(`telnyx ${kind} webhook failed`, e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
