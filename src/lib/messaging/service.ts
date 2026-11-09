// The two Conversion automations and the plumbing they share.
//
//   leadCreated()      60-second lead reply: a new lead with texting consent gets one text
//                      right away (or at the start of the next texting window), and the owner
//                      gets a follow-up task.
//   handleCallEvent()  missed-call text-back: an unanswered call to the business line creates a
//                      lead if the caller is new and texts them back, once per number per 24 hours.
//   handleSmsEvent()   inbound texts: STOP turns texting off and stops every sequence, START turns
//                      it back on, anything else lands as a task for the owner. Delivery updates
//                      from Telnyx update the Message log.
//   flushQueue()       sends texts that waited for quiet hours to end (cron and page loads).
//
// Every function takes its storage and provider as arguments, so the whole flow is tested
// without a database or a phone (scripts/messaging-test.mts).

import type { MessagingProvider, CallWebhook, InboundWebhook } from "@/lib/messaging/provider";
import { ConsoleProvider } from "@/lib/messaging/provider";
import type { ClientLite, MessageRow, MessagingStore } from "@/lib/messaging/store";
import { canText, consentAfter, isDuplicate, isMissedCall, isStartKeyword, isStopKeyword, nextSendTime } from "@/lib/messaging/rules";
import { firstNameOf, renderSms, templateVars, type TemplateKey } from "@/lib/messaging/templates";
import { toE164 } from "@/lib/messaging/phone";
import type { MessagingConfig } from "@/lib/messaging/settings";

export type Deps = {
  store: MessagingStore;
  provider: MessagingProvider;
  now?: () => Date;
  /** Owner task due this many minutes after a lead comes in (brand.ts speedToLeadMinutes). */
  followUpMinutes?: number;
  /** Where Telnyx should post delivery updates for each text. */
  statusWebhookUrl?: string;
  /** Owner's phone to ring before a call counts as missed (TELNYX_FORWARD_TO). */
  forwardTo?: string;
  forwardTimeoutSecs?: number;
};

export type SendOutcome = { status: "sent" | "queued" | "skipped" | "failed"; reason?: string; messageId?: string };

const clock = (d: Deps) => (d.now ? d.now() : new Date());

function vars(cfg: MessagingConfig, name: string) {
  return { first_name: firstNameOf(name), business_name: cfg.businessName, booking_link: cfg.bookingUrl };
}

/**
 * Record and send (or queue) one outbound text. Consent, opt-out, repeat suppression and quiet
 * hours are all checked here, so no caller can skip them.
 */
export async function sendText(
  d: Deps,
  input: { to: string; client: ClientLite | null; template: string; body: string; dedupe?: boolean },
): Promise<SendOutcome> {
  const { store } = d;
  const cfg = await store.getConfig();
  const now = clock(d);
  const to = toE164(input.to);
  const base = { clientId: input.client?.id ?? null, direction: "outbound" as const, fromNumber: d.provider.fromNumber, body: input.body, template: input.template, provider: d.provider.name };
  const skip = async (reason: string): Promise<SendOutcome> => {
    const m = await store.createMessage({ ...base, toNumber: to ?? input.to, status: "skipped", error: reason });
    return { status: "skipped", reason, messageId: m?.id };
  };
  if (!to) return skip("Not a textable phone number");
  const gate = canText(input.client);
  if (!gate.ok) return skip(gate.reason);
  if (input.dedupe !== false && isDuplicate(await store.lastMessageAt(to, input.template), now, cfg.dedupeHours)) {
    return skip(`Already texted this number in the last ${cfg.dedupeHours} hours`);
  }
  const at = nextSendTime(now, cfg.timezone, cfg.quietStartHour, cfg.quietEndHour);
  if (at.getTime() > now.getTime()) {
    const m = await store.createMessage({ ...base, toNumber: to, status: "queued", sendAfter: at });
    return { status: "queued", reason: `Quiet hours: goes out ${at.toISOString()}`, messageId: m?.id };
  }
  const m = await store.createMessage({ ...base, toNumber: to, status: "sending" });
  if (!m) return { status: "failed", reason: "Could not record the message" };
  return deliver(d, m);
}

async function deliver(d: Deps, m: MessageRow): Promise<SendOutcome> {
  const res = await d.provider
    .sendSms({ to: m.toNumber, text: m.body, idempotencyKey: m.id, webhookUrl: d.provider.name === "telnyx" ? d.statusWebhookUrl : undefined })
    .catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "Send failed" }));
  if (res.ok) {
    await d.store.updateMessage(m.id, { status: "sent", providerId: res.providerId, sentAt: clock(d), provider: d.provider.name, fromNumber: d.provider.fromNumber });
    return { status: "sent", messageId: m.id };
  }
  await d.store.updateMessage(m.id, { status: "failed", error: res.error.slice(0, 500) });
  return { status: "failed", reason: res.error, messageId: m.id };
}

function bookingMissing(cfg: MessagingConfig, tpl: string) {
  return templateVars(tpl).includes("booking_link") && !cfg.bookingUrl;
}

/** Hold the text back rather than send one with an empty link. Logged so the owner sees why. */
async function skipNoLink(d: Deps, client: ClientLite, template: TemplateKey): Promise<SendOutcome> {
  const reason = "Add a booking link in Settings > Messaging";
  const m = await d.store.createMessage({ clientId: client.id, direction: "outbound", toNumber: toE164(client.phone) ?? client.phone, fromNumber: d.provider.fromNumber, body: "", template, status: "skipped", provider: d.provider.name, error: reason });
  return { status: "skipped", reason, messageId: m?.id };
}

/* ---------------------------- 60-second lead reply ---------------------------- */

export type LeadConsent = { showedConsentLine: boolean; text?: string; source?: string };

/**
 * Call right after a lead is captured. `consent` describes the form they sent; leads from
 * sources without a consent line (CSV imports, booking syncs) pass nothing and are never texted.
 */
export async function leadCreated(d: Deps, clientId: string, consent?: LeadConsent): Promise<SendOutcome & { task: boolean }> {
  const { store } = d;
  const cfg = await store.getConfig();
  let client = await store.getClient(clientId);
  if (!client) return { status: "skipped", reason: "Lead not found", task: false };
  const now = clock(d);

  if (consent?.showedConsentLine) {
    const next = consentAfter(client, { kind: "form", showedConsentLine: true });
    if (next && !client.smsConsent) {
      await store.updateConsent([client.id], { smsConsent: true, smsConsentAt: now, smsConsentSource: (consent.source || "form").slice(0, 120), smsConsentText: (consent.text || "").slice(0, 1000) });
      client = { ...client, smsConsent: true };
    }
  }

  let out: SendOutcome;
  if (!cfg.leadReplyEnabled) out = { status: "skipped", reason: "Lead reply is turned off" };
  else if (!client.phone) out = { status: "skipped", reason: "No phone number" };
  else if (canText(client).ok && bookingMissing(cfg, cfg.leadReplyTemplate)) out = await skipNoLink(d, client, "lead_reply");
  else {
    const body = renderSms(cfg.leadReplyTemplate, vars(cfg, client.name));
    out = await sendText(d, { to: client.phone, client, template: "lead_reply", body });
    if (out.status === "sent" || out.status === "queued") await store.addActivity(client.id, "text", `Auto text ${out.status === "sent" ? "sent" : "queued for the morning"}: ${body}`);
  }

  const label = out.status === "sent" ? "auto text sent" : out.status === "queued" ? "auto text queued for quiet hours" : `no auto text: ${out.reason}`;
  await store.createFollowUp({ clientId: client.id, title: `Call ${client.name || "new lead"} back (${label})`.slice(0, 200), dueAt: new Date(now.getTime() + (d.followUpMinutes ?? 15) * 60_000), sequence: "lead_reply" });
  return { ...out, task: true };
}

/* --------------------------- missed-call text-back --------------------------- */

export async function handleCallEvent(d: Deps, e: CallWebhook): Promise<{ action: string; outcome?: SendOutcome }> {
  const { store } = d;
  const now = clock(d);
  const existing = await store.getCall(e.callSessionId);

  if (e.kind === "initiated") {
    if (e.direction !== "incoming") return { action: "ignored outgoing leg" };
    if (!existing) await store.saveCall({ callSessionId: e.callSessionId, fromNumber: e.from, toNumber: e.to });
    if (d.forwardTo && d.provider.forwardCall && e.callControlId) {
      const r = await d.provider.forwardCall(e.callControlId, d.forwardTo, d.forwardTimeoutSecs ?? 20);
      return { action: r.ok ? "forwarding to owner" : `forward failed: ${r.error ?? ""}` };
    }
    return { action: "recorded" };
  }

  if (e.kind === "answered" || e.kind === "bridged") {
    await store.saveCall({ callSessionId: e.callSessionId, ...(existing ? {} : { fromNumber: e.from, toNumber: e.to }), answered: true });
    return { action: "answered" };
  }

  // hangup. The first leg's numbers win: a transfer leg shares the session but dials the owner.
  const call = await store.saveCall({ callSessionId: e.callSessionId, ...(existing ? {} : { fromNumber: e.from, toNumber: e.to }), hangupCause: e.hangupCause ?? "" });
  // A session we never saw start: count it only if it rang our number (or we're in console mode).
  const direction = existing ? "incoming" : !d.provider.fromNumber || toE164(call.toNumber) === toE164(d.provider.fromNumber) ? "incoming" : "outgoing";
  if (!isMissedCall({ answered: call.answered, direction })) return { action: "not missed" };
  if (!(await store.claimCall(e.callSessionId, now))) return { action: "already handled" };
  await store.saveCall({ callSessionId: e.callSessionId, missed: true });
  return { action: "missed", outcome: await missedCall(d, call.fromNumber, call.toNumber, e.callSessionId) };
}

export async function missedCall(d: Deps, fromRaw: string, toRaw: string, callSessionId?: string): Promise<SendOutcome> {
  const { store } = d;
  const cfg = await store.getConfig();
  const now = clock(d);
  const from = toE164(fromRaw);
  if (!from) return { status: "skipped", reason: "Caller ID hidden or not a phone number" };

  let [client] = await store.findClientsByPhone(from);
  if (!client) {
    client = await store.createClient({ name: `Missed call ${from}`, phone: from, source: "MISSED_CALL", note: `Called ${toRaw} and nobody answered.` });
  }
  if (callSessionId) await store.saveCall({ callSessionId, clientId: client.id });
  await store.addActivity(client.id, "call", `Missed call to ${toRaw || "the business line"}.`);

  if (consentAfter(client, { kind: "missed_call" }) && !client.smsConsent) {
    await store.updateConsent([client.id], { smsConsent: true, smsConsentAt: now, smsConsentSource: "missed_call", smsConsentText: `Called the business line ${toRaw}`.trim() });
    client = { ...client, smsConsent: true };
  }

  let out: SendOutcome;
  if (!cfg.missedCallEnabled) out = { status: "skipped", reason: "Missed-call text-back is turned off" };
  else if (canText(client).ok && bookingMissing(cfg, cfg.missedCallTemplate)) out = await skipNoLink(d, client, "missed_call");
  else {
    const body = renderSms(cfg.missedCallTemplate, vars(cfg, ""));
    out = await sendText(d, { to: from, client, template: "missed_call", body });
    if (out.status === "sent" || out.status === "queued") await store.addActivity(client.id, "text", `Missed-call text ${out.status === "sent" ? "sent" : "queued for the morning"}: ${body}`);
  }
  const label = out.status === "sent" ? "text-back sent" : out.status === "queued" ? "text-back queued" : `no text: ${out.reason}`;
  await store.createFollowUp({ clientId: client.id, title: `Missed call from ${client.name.startsWith("Missed call") ? from : client.name}: call back (${label})`.slice(0, 200), dueAt: new Date(now.getTime() + (d.followUpMinutes ?? 15) * 60_000), sequence: "missed_call" });
  return out;
}

/* ------------------------------- inbound texts ------------------------------- */

export async function handleSmsEvent(d: Deps, e: InboundWebhook): Promise<{ action: string }> {
  const { store } = d;
  const now = clock(d);
  if (e.kind === "status") {
    const m = await store.findMessageByProviderId(e.providerId);
    if (!m) return { action: "unknown message" };
    // Webhooks can arrive out of order: never move a final status back to "sent".
    if (e.status === "sent" && m.status !== "queued" && m.status !== "sending") return { action: "kept final status" };
    await store.updateMessage(m.id, { status: e.status, error: e.error });
    return { action: `status ${e.status}` };
  }

  const from = toE164(e.from) ?? e.from;
  const clients = await store.findClientsByPhone(from);
  const logged = await store.createMessage({ clientId: clients[0]?.id ?? null, direction: "inbound", toNumber: e.to, fromNumber: from, body: e.text.slice(0, 2000), template: "inbound", status: "received", provider: d.provider.name, providerId: e.providerId });
  if (!logged) return { action: "duplicate" };

  if (isStopKeyword(e.text)) {
    if (clients.length) await store.updateConsent(clients.map((c) => c.id), { smsConsent: false, smsOptOutAt: now });
    const canceled = await store.cancelQueued(from, "Texted STOP");
    const stopped = await store.stopSequences(from, "Texted STOP");
    for (const c of clients) await store.addActivity(c.id, "text", `Texted STOP. Texting is off for this number (${canceled} queued text${canceled === 1 ? "" : "s"} canceled, ${stopped} sequence${stopped === 1 ? "" : "s"} stopped).`);
    // Telnyx sends the carrier opt-out confirmation itself, so we don't text again.
    return { action: "opted out" };
  }

  if (isStartKeyword(e.text)) {
    if (clients.length) await store.updateConsent(clients.map((c) => c.id), { smsConsent: true, smsOptOutAt: null, smsConsentAt: now, smsConsentSource: "start_keyword", smsConsentText: `Texted ${e.text.trim().toUpperCase()}` });
    for (const c of clients) await store.addActivity(c.id, "text", "Texted START. Texting is back on.");
    return { action: "opted in" };
  }

  let client = clients[0];
  if (!client) client = await store.createClient({ name: `Text from ${from}`, phone: from, source: "OTHER", note: `Texted the business line: ${e.text.slice(0, 500)}` });
  await store.addActivity(client.id, "text", `Text from lead: ${e.text.slice(0, 1000)}`);
  await store.createFollowUp({ clientId: client.id, title: `Reply to ${client.name}: "${e.text.trim().slice(0, 80)}"`, dueAt: now, sequence: "inbound_text" });
  return { action: "reply task created" };
}

/* --------------------------------- queue --------------------------------- */

export async function flushQueue(d: Deps, limit = 50): Promise<{ sent: number; skipped: number; requeued: number; failed: number }> {
  const { store } = d;
  const cfg = await store.getConfig();
  const now = clock(d);
  const out = { sent: 0, skipped: 0, requeued: 0, failed: 0 };
  for (const m of await store.claimQueued(now, limit)) {
    const client = m.clientId ? await store.getClient(m.clientId) : ((await store.findClientsByPhone(m.toNumber))[0] ?? null);
    const gate = canText(client); // STOP may have come in while it waited
    if (!gate.ok) {
      await store.updateMessage(m.id, { status: "skipped", error: gate.reason });
      out.skipped++;
      continue;
    }
    const at = nextSendTime(now, cfg.timezone, cfg.quietStartHour, cfg.quietEndHour);
    if (at.getTime() > now.getTime()) {
      await store.updateMessage(m.id, { status: "queued", sendAfter: at });
      out.requeued++;
      continue;
    }
    const r = await deliver(d, m);
    if (r.status === "sent") out.sent++;
    else out.failed++;
  }
  return out;
}

/* ---------------------------------- test ---------------------------------- */

/** Settings > Messaging test button. Always the console provider: a test never texts anyone. */
export async function sendTest(store: MessagingStore, to: string, template: TemplateKey, name = "Sam") {
  const cfg = await store.getConfig();
  const tpl = template === "lead_reply" ? cfg.leadReplyTemplate : cfg.missedCallTemplate;
  const body = renderSms(tpl, vars(cfg, template === "lead_reply" ? name : ""));
  const provider = new ConsoleProvider();
  const res = await provider.sendSms({ to, text: body });
  const m = await store.createMessage({ clientId: null, direction: "outbound", toNumber: toE164(to) ?? to, fromNumber: "", body, template: "test", status: res.ok ? "sent" : "failed", provider: "console", providerId: res.ok ? res.providerId : null, sentAt: new Date() });
  return { body, messageId: m?.id };
}

/* --------------------------- automation step --------------------------- */

/** The send_sms automation step: same gates as everything else. */
export async function automationText(d: Deps, phone: string, body: string): Promise<SendOutcome> {
  const to = toE164(phone);
  if (!to) return { status: "skipped", reason: "Contact has no textable phone number" };
  const [client] = await d.store.findClientsByPhone(to);
  return sendText(d, { to, client: client ?? null, template: "automation", body, dedupe: false });
}
