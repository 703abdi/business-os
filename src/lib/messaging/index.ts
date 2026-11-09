// Wires the messaging flows to the real database and the provider chosen by env vars.
import { BRAND } from "@/config/brand";
import { appUrl } from "@/lib/messaging/url";
import { getProvider, messagingStatus } from "@/lib/messaging/provider";
import { prismaStore } from "@/lib/messaging/prisma-store";
import type { Deps } from "@/lib/messaging/service";

export function messagingDeps(): Deps {
  const s = messagingStatus();
  return {
    store: prismaStore,
    provider: getProvider(),
    followUpMinutes: BRAND.speedToLeadMinutes,
    statusWebhookUrl: `${appUrl()}/api/messaging/telnyx/sms`,
    forwardTo: s.forwardTo || undefined,
    forwardTimeoutSecs: Number(process.env.TELNYX_FORWARD_TIMEOUT_SECS) || 20,
  };
}

export function webhookUrls() {
  const base = appUrl();
  return { sms: `${base}/api/messaging/telnyx/sms`, voice: `${base}/api/messaging/telnyx/voice` };
}
