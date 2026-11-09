// Telnyx Messaging Profile webhook: inbound texts (STOP, START, replies) and delivery updates.
// Paste this URL in Telnyx: Messaging > your profile > Inbound > Webhook URL.
import { telnyxWebhook } from "@/lib/messaging/webhook";
import { messagingDeps } from "@/lib/messaging";
import { handleSmsEvent } from "@/lib/messaging/service";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return telnyxWebhook(req, "sms", async (body) => {
    const deps = messagingDeps();
    const e = deps.provider.parseInboundWebhook(body);
    return e ? handleSmsEvent(deps, e) : { action: "ignored" };
  });
}
