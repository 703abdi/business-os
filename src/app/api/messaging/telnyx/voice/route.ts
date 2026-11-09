// Telnyx Voice API (Call Control) application webhook: call.initiated / answered / bridged / hangup.
// An incoming call nobody answered turns into a missed-call text-back.
// Paste this URL in Telnyx: Voice > Programmable Voice > your Voice API application > Webhook URL.
import { telnyxWebhook } from "@/lib/messaging/webhook";
import { messagingDeps } from "@/lib/messaging";
import { handleCallEvent } from "@/lib/messaging/service";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return telnyxWebhook(req, "voice", async (body) => {
    const deps = messagingDeps();
    const e = deps.provider.parseMissedCallWebhook(body);
    return e ? handleCallEvent(deps, e) : { action: "ignored" };
  });
}
