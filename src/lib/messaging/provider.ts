// Messaging providers. The app talks to MessagingProvider only, so a second carrier can be added
// later without touching the flows.
//
// - ConsoleProvider (default): logs the text and records it. Nothing reaches a phone.
// - TelnyxProvider: real SMS through Telnyx. OFF unless TELNYX_API_KEY, TELNYX_PUBLIC_KEY and
//   TELNYX_FROM_NUMBER are all set.
//
// Telnyx docs used for the shapes below:
// - Send a message: https://developers.telnyx.com/api/messaging/send-message (POST https://api.telnyx.com/v2/messages)
// - Messaging webhooks (message.received, message.sent, message.finalized):
//   https://developers.telnyx.com/docs/messaging/messages/receiving-webhooks
// - Voice API (Call Control) webhooks: https://developers.telnyx.com/docs/voice/programmable-voice/receiving-webhooks
//   and the call.hangup schema: https://developers.telnyx.com/api-reference/callbacks/call-hangup
// - Transfer command: POST https://api.telnyx.com/v2/calls/{call_control_id}/actions/transfer
//   (OpenAPI: https://developers.telnyx.com/openapi/source/external/call-control/call-control.json)
// - Signatures: Ed25519 over "{telnyx-timestamp}|{raw body}", headers telnyx-signature-ed25519 and
//   telnyx-timestamp, 5 minute tolerance, public key is base64 of the raw 32 bytes. Matches the
//   official SDK: https://github.com/team-telnyx/telnyx-node/blob/master/src/lib/webhooks.ts
//   and https://developers.telnyx.com/docs/development/sdk/node/webhooks.md

import { createPublicKey, verify as edVerify, randomUUID } from "node:crypto";
import { toE164 } from "@/lib/messaging/phone";

export type ProviderName = "console" | "telnyx";

export type SendInput = { to: string; from?: string; text: string; idempotencyKey?: string; webhookUrl?: string };
export type SendResult = { ok: true; providerId: string; status: "sent" } | { ok: false; error: string };

export type InboundWebhook =
  | { kind: "inbound"; providerId: string; from: string; to: string; text: string; at: Date }
  | { kind: "status"; providerId: string; status: "sent" | "delivered" | "failed"; error: string };

export type CallWebhook = {
  kind: "initiated" | "answered" | "bridged" | "hangup";
  callSessionId: string;
  callControlId: string;
  from: string; // E.164 when it parses, otherwise as sent
  to: string;
  direction?: "incoming" | "outgoing";
  hangupCause?: string;
  at: Date;
};

export type HeaderBag = Headers | Record<string, string | string[] | undefined>;

export interface MessagingProvider {
  name: ProviderName;
  /** Number texts are sent from (empty for the console provider). */
  fromNumber: string;
  sendSms(input: SendInput): Promise<SendResult>;
  /** Messaging webhook body -> an inbound text or a delivery status update. null = not ours / ignore. */
  parseInboundWebhook(body: unknown): InboundWebhook | null;
  /** Call Control webhook body -> a call event. The service decides "missed" from the call's history. */
  parseMissedCallWebhook(body: unknown): CallWebhook | null;
  /** True when the request really came from the provider. */
  verifySignature(rawBody: string, headers: HeaderBag, nowSec?: number): boolean;
  /** Optional: ring the owner's phone for an incoming call (Telnyx transfer with a timeout). */
  forwardCall?(callControlId: string, to: string, timeoutSecs: number): Promise<{ ok: boolean; error?: string }>;
}

/* ------------------------------ env and status ------------------------------ */

export const TELNYX_ENV = ["TELNYX_API_KEY", "TELNYX_PUBLIC_KEY", "TELNYX_FROM_NUMBER"] as const;

export function messagingStatus(env: NodeJS.ProcessEnv = process.env) {
  const missing = TELNYX_ENV.filter((k) => !env[k]?.trim());
  const provider: ProviderName = missing.length === 0 ? "telnyx" : "console";
  return { provider, missing, forwardTo: env.TELNYX_FORWARD_TO?.trim() || "", fromNumber: provider === "telnyx" ? env.TELNYX_FROM_NUMBER!.trim() : "" };
}

export function getProvider(env: NodeJS.ProcessEnv = process.env): MessagingProvider {
  const s = messagingStatus(env);
  if (s.provider === "telnyx") return new TelnyxProvider(env.TELNYX_API_KEY!.trim(), env.TELNYX_PUBLIC_KEY!.trim(), s.fromNumber);
  return new ConsoleProvider(env.TELNYX_PUBLIC_KEY?.trim() || "", env.NODE_ENV === "production");
}

/* ------------------------------ webhook parsing ------------------------------ */

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const str = (v: unknown) => (typeof v === "string" ? v : "");
const date = (v: unknown) => {
  const d = new Date(str(v));
  return Number.isNaN(d.getTime()) ? new Date() : d;
};
const num = (raw: string) => toE164(raw) ?? raw;

/** Telnyx messaging webhook envelope: { data: { event_type, payload: {...} } }. */
export function parseTelnyxMessaging(body: unknown): InboundWebhook | null {
  const data = obj(obj(body).data);
  const type = str(data.event_type);
  const p = obj(data.payload);
  const id = str(p.id);
  if (!id) return null;
  if (type === "message.received") {
    const toList = Array.isArray(p.to) ? p.to : [];
    return {
      kind: "inbound",
      providerId: id,
      from: num(str(obj(p.from).phone_number)),
      to: num(str(obj(toList[0]).phone_number)),
      text: str(p.text),
      at: date(p.received_at || data.occurred_at),
    };
  }
  if (type === "message.sent" || type === "message.finalized") {
    const toList = Array.isArray(p.to) ? p.to : [];
    const raw = str(obj(toList[0]).status);
    const errors = Array.isArray(p.errors) ? p.errors.map((e) => [str(obj(e).code), str(obj(e).title), str(obj(e).detail)].filter(Boolean).join(" ")) : [];
    // to[].status: queued, sending, sent, delivered, sending_failed, delivery_failed, delivery_unconfirmed
    const status = raw === "delivered" ? "delivered" : /failed/.test(raw) ? "failed" : "sent";
    return { kind: "status", providerId: id, status, error: errors.join("; ").slice(0, 500) };
  }
  return null;
}

const CALL_EVENTS: Record<string, CallWebhook["kind"]> = {
  "call.initiated": "initiated",
  "call.answered": "answered",
  "call.bridged": "bridged",
  "call.hangup": "hangup",
};

/** Telnyx Call Control webhook: { data: { event_type: "call.hangup", payload: { call_session_id, ... } } }. */
export function parseTelnyxCall(body: unknown): CallWebhook | null {
  const data = obj(obj(body).data);
  const kind = CALL_EVENTS[str(data.event_type)];
  const p = obj(data.payload);
  const session = str(p.call_session_id);
  if (!kind || !session) return null;
  const direction = str(p.direction);
  return {
    kind,
    callSessionId: session,
    callControlId: str(p.call_control_id),
    from: num(str(p.from)),
    to: num(str(p.to)),
    direction: direction === "incoming" || direction === "outgoing" ? direction : undefined,
    hangupCause: kind === "hangup" ? str(p.hangup_cause) || "unspecified" : undefined,
    at: date(data.occurred_at || p.start_time),
  };
}

/* ---------------------------- signature checking ---------------------------- */

// An Ed25519 public key in SPKI DER is this fixed 12-byte header plus the raw 32-byte key.
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function header(h: HeaderBag, name: string): string {
  if (typeof (h as Headers).get === "function") return (h as Headers).get(name) ?? "";
  for (const [k, v] of Object.entries(h)) if (k.toLowerCase() === name) return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
  return "";
}

export function verifyTelnyxSignature(rawBody: string, headers: HeaderBag, publicKeyB64: string, nowSec = Math.floor(Date.now() / 1000)): boolean {
  try {
    const sig = Buffer.from(header(headers, "telnyx-signature-ed25519"), "base64");
    const ts = header(headers, "telnyx-timestamp");
    if (sig.length !== 64 || !/^\d+$/.test(ts)) return false;
    if (Math.abs(nowSec - Number(ts)) > 300) return false; // replay window, same as the SDK
    const raw = Buffer.from(publicKeyB64, "base64");
    if (raw.length !== 32) return false;
    const key = createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, raw]), format: "der", type: "spki" });
    return edVerify(null, Buffer.from(`${ts}|${rawBody}`, "utf8"), key, sig);
  } catch {
    return false;
  }
}

/* --------------------------------- providers -------------------------------- */

export class ConsoleProvider implements MessagingProvider {
  name = "console" as const;
  fromNumber = "";
  constructor(
    private publicKey = "",
    private production = false,
  ) {}

  async sendSms(input: SendInput): Promise<SendResult> {
    console.log(`[sms:console] to ${input.to}: ${input.text}`);
    return { ok: true, providerId: `console_${randomUUID()}`, status: "sent" };
  }
  parseInboundWebhook = parseTelnyxMessaging;
  parseMissedCallWebhook = parseTelnyxCall;

  /** With a key set, check it like Telnyx. Without one, unsigned test posts are allowed outside production only. */
  verifySignature(rawBody: string, headers: HeaderBag, nowSec?: number): boolean {
    if (this.publicKey) return verifyTelnyxSignature(rawBody, headers, this.publicKey, nowSec);
    return !this.production;
  }

  async forwardCall(callControlId: string, to: string) {
    console.log(`[sms:console] would forward call ${callControlId} to ${to}`);
    return { ok: true };
  }
}

const TELNYX_API = "https://api.telnyx.com/v2";

export class TelnyxProvider implements MessagingProvider {
  name = "telnyx" as const;
  constructor(
    private apiKey: string,
    private publicKey: string,
    public fromNumber: string,
  ) {}

  private async call(path: string, body: unknown, idempotencyKey?: string) {
    const res = await fetch(`${TELNYX_API}${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
        accept: "application/json",
        ...(idempotencyKey ? { "idempotency-key": idempotencyKey.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 255) } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    const json = obj(await res.json().catch(() => ({})));
    const errors = Array.isArray(json.errors) ? json.errors.map((e) => str(obj(e).detail) || str(obj(e).title)).filter(Boolean) : [];
    return { ok: res.ok, status: res.status, data: obj(json.data), error: errors.join("; ") || (res.ok ? "" : `Telnyx answered ${res.status}`) };
  }

  async sendSms(input: SendInput): Promise<SendResult> {
    const r = await this.call(
      "/messages",
      { from: input.from || this.fromNumber, to: input.to, text: input.text, ...(input.webhookUrl ? { webhook_url: input.webhookUrl } : {}) },
      input.idempotencyKey,
    );
    const id = str(r.data.id);
    if (!r.ok || !id) return { ok: false, error: r.error.slice(0, 500) || "Telnyx did not return a message id" };
    return { ok: true, providerId: id, status: "sent" };
  }

  parseInboundWebhook = parseTelnyxMessaging;
  parseMissedCallWebhook = parseTelnyxCall;

  verifySignature(rawBody: string, headers: HeaderBag, nowSec?: number): boolean {
    return verifyTelnyxSignature(rawBody, headers, this.publicKey, nowSec);
  }

  async forwardCall(callControlId: string, to: string, timeoutSecs: number) {
    // If the owner doesn't pick up before timeout_secs, Telnyx hangs up with hangup_cause "timeout".
    const r = await this.call(`/calls/${encodeURIComponent(callControlId)}/actions/transfer`, { to, timeout_secs: Math.min(600, Math.max(5, timeoutSecs)) });
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  }
}
