// What the messaging flows need from storage. The Prisma version lives in prisma-store.ts;
// the tests use an in-memory one (scripts/messaging-test.mts).
import type { MessagingConfig } from "@/lib/messaging/settings";
import type { ProviderName } from "@/lib/messaging/provider";

export type ClientLite = {
  id: string;
  name: string;
  phone: string;
  stage: string;
  smsConsent: boolean;
  smsOptOutAt: Date | null;
};

export type MessageStatus = "queued" | "sending" | "sent" | "delivered" | "failed" | "skipped" | "canceled" | "received";

export type MessageRow = {
  id: string;
  clientId: string | null;
  direction: "outbound" | "inbound";
  toNumber: string;
  fromNumber: string;
  body: string;
  template: string;
  status: MessageStatus;
  provider: ProviderName;
  providerId: string | null;
  error: string;
  sendAfter: Date | null;
  sentAt: Date | null;
  createdAt: Date;
};

export type NewMessage = Omit<MessageRow, "id" | "createdAt" | "sentAt" | "sendAfter" | "providerId" | "error"> &
  Partial<Pick<MessageRow, "sentAt" | "sendAfter" | "providerId" | "error">>;

export type CallRow = { callSessionId: string; fromNumber: string; toNumber: string; answered: boolean; hangupCause: string; missed: boolean; handledAt: Date | null; clientId: string | null };

export type ConsentPatch = { smsConsent: boolean; smsConsentAt?: Date | null; smsConsentSource?: string; smsConsentText?: string; smsOptOutAt?: Date | null };

export interface MessagingStore {
  getConfig(): Promise<MessagingConfig>;
  getClient(id: string): Promise<ClientLite | null>;
  findClientsByPhone(e164: string): Promise<ClientLite[]>;
  createClient(input: { name: string; phone: string; source: "MISSED_CALL" | "OTHER"; note: string }): Promise<ClientLite>;
  updateConsent(clientIds: string[], patch: ConsentPatch): Promise<void>;
  addActivity(clientId: string, kind: "text" | "call" | "system", body: string): Promise<void>;
  createFollowUp(input: { clientId: string; title: string; dueAt: Date; sequence: string }): Promise<void>;

  /** Latest automatic text with this template to this number that was queued or sent (skipped/failed/canceled don't count). */
  lastMessageAt(toNumber: string, template: string): Promise<Date | null>;
  createMessage(m: NewMessage): Promise<MessageRow | null>; // null = providerId already recorded (duplicate webhook)
  updateMessage(id: string, patch: Partial<Pick<MessageRow, "status" | "providerId" | "error" | "sentAt" | "sendAfter" | "provider" | "fromNumber">>): Promise<void>;
  findMessageByProviderId(providerId: string): Promise<MessageRow | null>;
  /** Moves due queued messages to "sending" and returns them, so two workers never send one twice. */
  claimQueued(now: Date, limit: number): Promise<MessageRow[]>;
  cancelQueued(toNumber: string, reason: string): Promise<number>;
  /** Stop every waiting automation run for contacts with this number. */
  stopSequences(toNumber: string, reason: string): Promise<number>;

  getCall(callSessionId: string): Promise<CallRow | null>;
  saveCall(row: Partial<CallRow> & { callSessionId: string }): Promise<CallRow>;
  /** Atomically mark the call handled. False when another webhook already did. */
  claimCall(callSessionId: string, now: Date): Promise<boolean>;
}
