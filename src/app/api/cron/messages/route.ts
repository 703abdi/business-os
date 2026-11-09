// Vercel Cron: sends texts that were held back by quiet hours. Protected by CRON_SECRET.
// Hobby plans run crons once a day, so vercel.json calls this twice (morning East and West coast).
// The second entry is "/api/cron/messages?w=1" so the two cron paths differ; the query string is
// ignored here and by the proxy, which matches on pathname. On Pro, use one "*/10 * * * *" entry.
import { NextResponse } from "next/server";
import { messagingDeps } from "@/lib/messaging";
import { flushQueue } from "@/lib/messaging/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new NextResponse(null, { status: 404 });
  const r = await flushQueue(messagingDeps(), 200);
  return NextResponse.json({ ok: true, ...r });
}
