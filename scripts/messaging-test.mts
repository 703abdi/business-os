// Messaging: templates, consent gate, STOP, 24-hour dedupe, quiet hours, Telnyx webhook parsing
// and Ed25519 signature checks. No database and no network: an in-memory store and a fake provider.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { generateKeyPairSync, sign } from "node:crypto";
import { renderSms, validateTemplate, firstNameOf, DEFAULT_TEMPLATES, smsSegments, templateVars } from "../src/lib/messaging/templates.ts";
import { canText, consentAfter, isStopKeyword, isStartKeyword, isDuplicate, nextSendTime, inQuietHours, zonedTime, isMissedCall } from "../src/lib/messaging/rules.ts";
import { toE164, phoneKey } from "../src/lib/messaging/phone.ts";
import { parseTelnyxMessaging, parseTelnyxCall, verifyTelnyxSignature, ConsoleProvider, getProvider, messagingStatus, type MessagingProvider, type SendInput } from "../src/lib/messaging/provider.ts";
import { resolveConfig, type MessagingConfig } from "../src/lib/messaging/settings.ts";
import type { MessagingStore, ClientLite, MessageRow, CallRow } from "../src/lib/messaging/store.ts";
import { leadCreated, handleCallEvent, handleSmsEvent, flushQueue, sendTest, automationText, type Deps } from "../src/lib/messaging/service.ts";

const fx = (name: string) => readFileSync(new URL(`./fixtures/telnyx/${name}`, import.meta.url), "utf8");

// ---------------- templates
const vars = { first_name: "Sam", business_name: "Acme Detailing", booking_link: "https://cal.example/acme" };
assert.equal(renderSms("Hi {{first_name}}, {{ business_name }} here: {{booking_link}}", vars), "Hi Sam, Acme Detailing here: https://cal.example/acme");
assert.equal(renderSms("Hi {{first_name}}", { first_name: "" }), "Hi there", "missing first name reads naturally");
assert.equal(renderSms("Hi {{FIRST_NAME}} {{nope}}!", vars), "Hi Sam !", "unknown variables render as nothing");
for (const t of Object.values(DEFAULT_TEMPLATES)) assert.deepEqual(validateTemplate(t), [], t);
assert.ok(validateTemplate("Hi {{first_name}}").some((e) => /business_name/.test(e)), "must name the business");
assert.ok(validateTemplate("{{business_name}} hello").some((e) => /STOP/.test(e)), "must keep the STOP line");
assert.ok(validateTemplate("{{business_name}} {{price}} Reply STOP").some((e) => /Unknown variable: \{\{price\}\}/.test(e)), "unknown variables are rejected");
assert.deepEqual(validateTemplate(""), ["Write the message."]);
assert.deepEqual(templateVars("{{a}} {{ B }}"), ["a", "b"]);
assert.equal(firstNameOf("JOHN smith"), "John");
assert.equal(firstNameOf("Missed call +15715550177"), "Missed");
assert.equal(firstNameOf("+15715550177"), "");
assert.equal(smsSegments("a".repeat(160)), 1);
assert.equal(smsSegments("a".repeat(161)), 2);
assert.equal(smsSegments("Hi 👋"), 1);
assert.equal(smsSegments("👋".repeat(40)), 2, "emoji switch to 70-char segments");
console.log("messaging templates: all assertions passed");

// ---------------- phone numbers
assert.equal(toE164("(571) 555-0142"), "+15715550142");
assert.equal(toE164("571.555.0142"), "+15715550142");
assert.equal(toE164("+1 571 555 0142"), "+15715550142");
assert.equal(toE164("sip:+15715550142@sip.telnyx.com"), "+15715550142");
assert.equal(toE164("Anonymous"), null);
assert.equal(toE164(""), null);
assert.equal(phoneKey("+1 (571) 555-0142"), "5715550142");

// ---------------- consent gate and keywords
assert.deepEqual(canText({ smsConsent: true, smsOptOutAt: null }), { ok: true });
assert.equal(canText({ smsConsent: false, smsOptOutAt: null }).ok, false);
assert.equal(canText({ smsConsent: true, smsOptOutAt: new Date() }).ok, false, "STOP beats consent");
assert.equal(canText(null).ok, false);
for (const w of ["STOP", "stop", " Stop. ", "STOP ALL", "unsubscribe", "Cancel", "END", "quit", "opt out"]) assert.ok(isStopKeyword(w), w);
for (const w of ["please stop by thursday", "stopping by", "ok", "yes"]) assert.ok(!isStopKeyword(w), w);
assert.ok(isStartKeyword("start") && isStartKeyword("UNSTOP") && !isStartKeyword("yes"));
const optedOut = { smsConsent: false, smsOptOutAt: new Date() };
assert.equal(consentAfter(optedOut, { kind: "form", showedConsentLine: true }), false, "a new form never undoes STOP");
assert.equal(consentAfter(optedOut, { kind: "missed_call" }), false, "a call never undoes STOP");
assert.equal(consentAfter({ smsConsent: false, smsOptOutAt: null }, { kind: "form", showedConsentLine: false }), false);
assert.equal(consentAfter({ smsConsent: false, smsOptOutAt: null }, { kind: "form", showedConsentLine: true }), true);
assert.equal(consentAfter({ smsConsent: false, smsOptOutAt: null }, { kind: "missed_call" }), true);

// ---------------- dedupe window
const t0 = new Date("2026-11-08T15:00:00Z");
assert.equal(isDuplicate(null, t0, 24), false);
assert.equal(isDuplicate(new Date(t0.getTime() - 23.9 * 3_600_000), t0, 24), true);
assert.equal(isDuplicate(new Date(t0.getTime() - 24 * 3_600_000), t0, 24), false);

// ---------------- quiet hours (business time, with daylight saving)
const NY = "America/New_York";
assert.equal(zonedTime(2026, 11, 9, 8, NY).toISOString(), "2026-11-09T13:00:00.000Z", "8am EST = 13:00 UTC");
assert.equal(zonedTime(2026, 7, 1, 8, NY).toISOString(), "2026-07-01T12:00:00.000Z", "8am EDT = 12:00 UTC");
const noonNY = new Date("2026-11-08T17:00:00Z"); // 12pm EST
assert.equal(nextSendTime(noonNY, NY, 8, 20).getTime(), noonNY.getTime(), "inside the window: send now");
assert.equal(nextSendTime(new Date("2026-11-09T02:30:00Z"), NY, 8, 20).toISOString(), "2026-11-09T13:00:00.000Z", "9:30pm: next morning 8am");
assert.equal(nextSendTime(new Date("2026-11-08T10:00:00Z"), NY, 8, 20).toISOString(), "2026-11-08T13:00:00.000Z", "5am: 8am same day");
assert.equal(nextSendTime(new Date("2026-11-09T01:00:00Z"), NY, 8, 20).toISOString(), "2026-11-09T13:00:00.000Z", "8:00pm sharp is outside");
assert.equal(nextSendTime(new Date("2026-11-09T00:59:00Z"), NY, 8, 20).toISOString(), "2026-11-09T00:59:00.000Z", "7:59pm is inside");
assert.equal(nextSendTime(new Date("2026-03-08T05:00:00Z"), NY, 8, 20).toISOString(), "2026-03-08T12:00:00.000Z", "DST start day: 8am EDT");
assert.equal(nextSendTime(new Date("2026-11-08T06:00:00Z"), "America/Los_Angeles", 8, 20).toISOString(), "2026-11-08T16:00:00.000Z", "other zones work");
assert.ok(inQuietHours(new Date("2026-11-09T03:00:00Z"), NY) && !inQuietHours(noonNY, NY));
console.log("messaging rules: all assertions passed");

// ---------------- Telnyx webhook parsing from saved fixtures
const inbound = parseTelnyxMessaging(JSON.parse(fx("message-received.json")));
assert.deepEqual(inbound && { ...inbound, at: inbound.kind === "inbound" ? inbound.at.toISOString() : "" }, {
  kind: "inbound", providerId: "84cca175-9755-4859-b67f-4730d7f58aa3", from: "+15715550142", to: "+17035550100", text: "Is Thursday morning open?", at: "2026-11-08T15:02:10.668Z",
});
assert.deepEqual(parseTelnyxMessaging(JSON.parse(fx("message-finalized-delivered.json"))), { kind: "status", providerId: "PROVIDER_ID", status: "delivered", error: "" });
const failed = parseTelnyxMessaging(JSON.parse(fx("message-finalized-failed.json")));
assert.ok(failed?.kind === "status" && failed.status === "failed" && /40008 Undeliverable/.test(failed.error));
assert.equal(parseTelnyxMessaging(JSON.parse(fx("message-sent.json")))?.kind, "status");
assert.equal(parseTelnyxMessaging({ data: { event_type: "message.received", payload: {} } }), null, "no id = ignored");
assert.equal(parseTelnyxMessaging("junk"), null);
const init = parseTelnyxCall(JSON.parse(fx("call-initiated.json")));
assert.equal(init?.kind, "initiated");
assert.equal(init?.direction, "incoming");
assert.equal(init?.from, "+15715550177");
assert.equal(init?.callSessionId, "428c31b6-abf3-3bc1-b7f4-5013ef9657c1");
const hang = parseTelnyxCall(JSON.parse(fx("call-hangup-missed.json")));
assert.equal(hang?.kind, "hangup");
assert.equal(hang?.hangupCause, "originator_cancel");
assert.equal(parseTelnyxCall({ data: { event_type: "call.dtmf.received", payload: { call_session_id: "x" } } }), null, "other call events are ignored");
assert.ok(isMissedCall({ answered: false, direction: "incoming" }) && !isMissedCall({ answered: true }) && !isMissedCall({ answered: false, direction: "outgoing" }));

// ---------------- Ed25519 signature: generated key pair, exactly the way Telnyx signs
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const pubB64 = (publicKey.export({ format: "der", type: "spki" }) as Buffer).subarray(12).toString("base64"); // raw 32 bytes, like Mission Control shows
assert.equal(Buffer.from(pubB64, "base64").length, 32);
const raw = fx("message-received.json");
const ts = "1762614131";
const sig = sign(null, Buffer.from(`${ts}|${raw}`), privateKey).toString("base64");
const headers = { "telnyx-signature-ed25519": sig, "telnyx-timestamp": ts };
assert.equal(verifyTelnyxSignature(raw, headers, pubB64, Number(ts) + 10), true, "valid signature");
assert.equal(verifyTelnyxSignature(raw, new Headers(headers), pubB64, Number(ts)), true, "works with a fetch Headers object");
assert.equal(verifyTelnyxSignature(raw + " ", headers, pubB64, Number(ts)), false, "body changed by one byte");
assert.equal(verifyTelnyxSignature(JSON.stringify(JSON.parse(raw)), headers, pubB64, Number(ts)), false, "re-serialized JSON fails: verify the raw body");
assert.equal(verifyTelnyxSignature(raw, headers, pubB64, Number(ts) + 301), false, "older than 5 minutes");
assert.equal(verifyTelnyxSignature(raw, { ...headers, "telnyx-timestamp": "1762614132" }, pubB64, Number(ts)), false, "timestamp is part of what is signed");
const other = (generateKeyPairSync("ed25519").publicKey.export({ format: "der", type: "spki" }) as Buffer).subarray(12).toString("base64");
assert.equal(verifyTelnyxSignature(raw, headers, other, Number(ts)), false, "wrong key");
assert.equal(verifyTelnyxSignature(raw, {}, pubB64, Number(ts)), false, "no headers");
assert.equal(verifyTelnyxSignature(raw, headers, "not-a-key", Number(ts)), false, "bad key never throws");

// ---------------- provider selection: off unless all three env vars exist
assert.equal(messagingStatus({}).provider, "console");
assert.equal(messagingStatus({ TELNYX_API_KEY: "k", TELNYX_PUBLIC_KEY: "p" }).provider, "console");
assert.deepEqual(messagingStatus({ TELNYX_API_KEY: "k", TELNYX_PUBLIC_KEY: "p" }).missing, ["TELNYX_FROM_NUMBER"]);
assert.equal(getProvider({ TELNYX_API_KEY: "k", TELNYX_PUBLIC_KEY: "p", TELNYX_FROM_NUMBER: "+17035550100" }).name, "telnyx");
assert.equal(getProvider({ TELNYX_API_KEY: "k", TELNYX_PUBLIC_KEY: "p", TELNYX_FROM_NUMBER: " " }).name, "console", "blank counts as missing");
assert.equal(new ConsoleProvider("", true).verifySignature("{}", {}), false, "production without a key rejects unsigned posts");
assert.equal(new ConsoleProvider("", false).verifySignature("{}", {}), true, "local testing accepts unsigned posts");
assert.equal(new ConsoleProvider(pubB64, false).verifySignature(raw, headers, Number(ts)), true, "console checks signatures when a key is set");
console.log("messaging telnyx parsing + signatures: all assertions passed");

// ---------------- flows against an in-memory store
class MemStore implements MessagingStore {
  cfg: MessagingConfig = resolveConfig({ bookingUrl: "https://cal.example/acme", businessName: "Acme Detailing", timezone: NY });
  clients: ClientLite[] = [];
  messages: MessageRow[] = [];
  calls = new Map<string, CallRow>();
  activities: { clientId: string; kind: string; body: string }[] = [];
  tasks: { clientId: string; title: string; dueAt: Date; sequence: string }[] = [];
  runs: { phone: string; status: string }[] = [];
  consentLog: Record<string, unknown>[] = [];
  n = 0;
  constructor(public now: () => Date) {}
  async getConfig() { return this.cfg; }
  async getClient(id: string) { return this.clients.find((c) => c.id === id) ?? null; }
  async findClientsByPhone(e164: string) { return this.clients.filter((c) => phoneKey(c.phone) === phoneKey(e164)); }
  async createClient(i: { name: string; phone: string; source: string; note: string }) {
    const c: ClientLite = { id: `c${++this.n}`, name: i.name, phone: i.phone, stage: "NEW", smsConsent: false, smsOptOutAt: null };
    this.clients.push(c);
    return c;
  }
  async updateConsent(ids: string[], patch: { smsConsent: boolean; smsOptOutAt?: Date | null }) {
    for (const c of this.clients) if (ids.includes(c.id)) { c.smsConsent = patch.smsConsent; if (patch.smsOptOutAt !== undefined) c.smsOptOutAt = patch.smsOptOutAt; }
    this.consentLog.push({ ids, ...patch });
  }
  async addActivity(clientId: string, kind: string, body: string) { this.activities.push({ clientId, kind, body }); }
  async createFollowUp(t: { clientId: string; title: string; dueAt: Date; sequence: string }) { this.tasks.push(t); }
  async lastMessageAt(to: string, template: string) {
    const m = this.messages.filter((x) => x.toNumber === to && x.template === template && x.direction === "outbound" && ["queued", "sending", "sent", "delivered"].includes(x.status));
    return m.length ? m[m.length - 1].createdAt : null;
  }
  async createMessage(m: Parameters<MessagingStore["createMessage"]>[0]) {
    if (m.providerId && this.messages.some((x) => x.providerId === m.providerId)) return null;
    const row: MessageRow = { id: `m${++this.n}`, createdAt: this.now(), sentAt: null, sendAfter: null, providerId: null, error: "", ...m } as MessageRow;
    this.messages.push(row);
    return row;
  }
  async updateMessage(id: string, patch: Partial<MessageRow>) { Object.assign(this.messages.find((m) => m.id === id)!, patch); }
  async findMessageByProviderId(p: string) { return this.messages.find((m) => m.providerId === p) ?? null; }
  async claimQueued(now: Date, limit: number) {
    const due = this.messages.filter((m) => m.status === "queued" && m.sendAfter && m.sendAfter <= now).slice(0, limit);
    for (const m of due) m.status = "sending";
    return due.map((m) => ({ ...m }));
  }
  async cancelQueued(to: string, reason: string) {
    let n = 0;
    for (const m of this.messages) if (m.toNumber === to && m.status === "queued") { m.status = "canceled"; m.error = reason; n++; }
    return n;
  }
  async stopSequences(to: string) {
    let n = 0;
    for (const r of this.runs) if (phoneKey(r.phone) === phoneKey(to) && r.status === "waiting") { r.status = "skipped"; n++; }
    return n;
  }
  async getCall(id: string) { return this.calls.get(id) ?? null; }
  async saveCall(row: Partial<CallRow> & { callSessionId: string }) {
    const cur = this.calls.get(row.callSessionId) ?? { callSessionId: row.callSessionId, fromNumber: "", toNumber: "", answered: false, hangupCause: "", missed: false, handledAt: null, clientId: null };
    const next = { ...cur, ...Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined)) } as CallRow;
    this.calls.set(row.callSessionId, next);
    return next;
  }
  async claimCall(id: string, now: Date) {
    const c = this.calls.get(id);
    if (!c || c.handledAt) return false;
    c.handledAt = now;
    return true;
  }
}

class FakeProvider extends ConsoleProvider implements MessagingProvider {
  sent: SendInput[] = [];
  forwarded: string[] = [];
  fail = false;
  constructor() { super("", false); this.fromNumber = "+17035550100"; }
  async sendSms(i: SendInput) {
    if (this.fail) return { ok: false as const, error: "Telnyx answered 422" };
    this.sent.push(i);
    return { ok: true as const, providerId: `prov_${this.sent.length}`, status: "sent" as const };
  }
  async forwardCall(id: string, to: string) { this.forwarded.push(`${id}->${to}`); return { ok: true }; }
}

let now = new Date("2026-11-08T17:00:00Z"); // noon in New York: inside the window
const store = new MemStore(() => now);
const provider = new FakeProvider();
const deps: Deps = { store, provider, now: () => now, followUpMinutes: 15 };
const addClient = (c: Partial<ClientLite>) => { const row = { id: `c${++store.n}`, name: "Sam Lee", phone: "(571) 555-0142", stage: "NEW", smsConsent: false, smsOptOutAt: null, ...c }; store.clients.push(row); return row; };

// 60-second lead reply: consent line shown -> one text right away, plus an owner task
const sam = addClient({});
let r = await leadCreated(deps, sam.id, { showedConsentLine: true, text: "By sending this form you agree...", source: "form:Quote" });
assert.equal(r.status, "sent");
assert.equal(provider.sent.length, 1);
assert.equal(provider.sent[0].to, "+15715550142");
assert.equal(provider.sent[0].text, "Hi Sam, this is Acme Detailing. We got your request and will be in touch shortly. To pick a time now: https://cal.example/acme Reply STOP to stop texts.");
assert.equal(store.clients[0].smsConsent, true, "consent recorded from the form");
assert.equal(store.tasks.length, 1);
assert.match(store.tasks[0].title, /Call Sam Lee back \(auto text sent\)/);
assert.equal(store.tasks[0].dueAt.getTime() - now.getTime(), 15 * 60_000);
assert.equal(store.messages.at(-1)?.status, "sent");
assert.equal(store.messages.at(-1)?.providerId, "prov_1");
assert.equal(store.messages.at(-1)?.template, "lead_reply");

// same number again inside 24 hours: no second text, but still a task
r = await leadCreated(deps, sam.id, { showedConsentLine: true });
assert.equal(r.status, "skipped");
assert.match(r.reason!, /last 24 hours/);
assert.equal(provider.sent.length, 1);
assert.equal(store.tasks.length, 2);
now = new Date(now.getTime() + 24 * 3_600_000 + 1000);
r = await leadCreated(deps, sam.id, { showedConsentLine: true });
assert.equal(r.status, "sent", "after 24 hours the number can get the template again");
assert.equal(provider.sent.length, 2);

// consent gate: a lead whose form had no consent line is never texted
const noConsent = addClient({ name: "Ana Diaz", phone: "571-555-0150" });
r = await leadCreated(deps, noConsent.id, { showedConsentLine: false });
assert.equal(r.status, "skipped");
assert.equal(r.reason, "No texting consent on file");
r = await leadCreated(deps, noConsent.id); // CSV import / booking sync: no consent info at all
assert.equal(r.status, "skipped");
assert.equal(provider.sent.length, 2);
assert.equal(store.messages.at(-1)?.status, "skipped", "skipped attempts are still logged");
assert.match(store.tasks.at(-1)!.title, /no auto text: No texting consent/);

// quiet hours: 10pm New York -> queued for 8am, then sent by the queue flush
now = new Date("2026-11-10T03:00:00Z");
const late = addClient({ name: "Lee Park", phone: "+1 571 555 0160" });
r = await leadCreated(deps, late.id, { showedConsentLine: true });
assert.equal(r.status, "queued");
const q = store.messages.find((m) => m.id === r.messageId)!;
assert.equal(q.sendAfter?.toISOString(), "2026-11-10T13:00:00.000Z");
assert.equal(provider.sent.length, 2, "nothing goes out at night");
assert.deepEqual(await flushQueue(deps), { sent: 0, skipped: 0, requeued: 0, failed: 0 }, "not due yet");
now = new Date("2026-11-10T13:00:30Z");
assert.deepEqual(await flushQueue(deps), { sent: 1, skipped: 0, requeued: 0, failed: 0 });
assert.equal(provider.sent.at(-1)?.to, "+15715550160");
assert.equal(q.status, "sent");

// a queued text whose person texts STOP before morning is never sent
now = new Date("2026-11-11T02:00:00Z"); // 9pm
const night = addClient({ name: "Kai Moss", phone: "5715550170" });
r = await leadCreated(deps, night.id, { showedConsentLine: true });
assert.equal(r.status, "queued");
const stop = parseTelnyxMessaging({ data: { event_type: "message.received", payload: { id: "stop-1", from: { phone_number: "+15715550170" }, to: [{ phone_number: "+17035550100" }], text: "STOP" } } })!;
store.runs.push({ phone: "571-555-0170", status: "waiting" }, { phone: "571-555-0170", status: "done" }, { phone: "571-555-9999", status: "waiting" });
assert.deepEqual(await handleSmsEvent(deps, stop), { action: "opted out" });
assert.equal(night.smsConsent, false);
assert.ok(night.smsOptOutAt instanceof Date);
assert.equal(store.messages.find((m) => m.id === r.messageId)!.status, "canceled", "STOP cancels queued texts");
assert.deepEqual(store.runs.map((x) => x.status), ["skipped", "done", "waiting"], "STOP stops every waiting sequence for that number only");
assert.match(store.activities.at(-1)!.body, /Texted STOP. Texting is off/);
now = new Date("2026-11-11T14:00:00Z");
assert.equal((await flushQueue(deps)).sent, 0);
r = await leadCreated(deps, night.id, { showedConsentLine: true });
assert.equal(r.status, "skipped", "a new form after STOP does not turn texting back on");
assert.equal(r.reason, "Texted STOP");
assert.equal((await automationText(deps, "5715550170", "Follow up. Reply STOP to stop texts.")).status, "skipped", "automation texts respect STOP too");
assert.deepEqual(await handleSmsEvent(deps, stop), { action: "duplicate" }, "Telnyx retries are ignored");

// START turns it back on
const start = parseTelnyxMessaging(JSON.parse(fx("message-received-start.json").replace("+15715550142", "+15715550170")))!;
assert.deepEqual(await handleSmsEvent(deps, start), { action: "opted in" });
assert.equal(night.smsConsent, true);
assert.equal(night.smsOptOutAt, null);

// STOP from the fixture works with "Stop" in mixed case
assert.deepEqual(await handleSmsEvent(deps, parseTelnyxMessaging(JSON.parse(fx("message-received-stop.json")))!), { action: "opted out" });
assert.equal(sam.smsOptOutAt instanceof Date, true);

// an ordinary reply becomes a task for the owner
const reply = parseTelnyxMessaging(JSON.parse(fx("message-received.json")))!;
assert.deepEqual(await handleSmsEvent(deps, reply), { action: "reply task created" });
assert.match(store.tasks.at(-1)!.title, /Reply to Sam Lee: "Is Thursday morning open\?"/);

// delivery updates, including out-of-order webhooks
const sentRow = store.messages.find((m) => m.providerId === "prov_1")!;
const delivered = parseTelnyxMessaging(JSON.parse(fx("message-finalized-delivered.json").replace("PROVIDER_ID", "prov_1")))!;
assert.deepEqual(await handleSmsEvent(deps, delivered), { action: "status delivered" });
assert.equal(sentRow.status, "delivered");
const lateSent = parseTelnyxMessaging(JSON.parse(fx("message-sent.json").replace("PROVIDER_ID", "prov_1")))!;
assert.deepEqual(await handleSmsEvent(deps, lateSent), { action: "kept final status" });
assert.equal(sentRow.status, "delivered");

// missed call: new caller -> lead with source "missed call", one text-back, owner task
now = new Date("2026-11-12T16:00:00Z");
const calls = (f: string) => parseTelnyxCall(JSON.parse(fx(f)))!;
deps.forwardTo = "+15715550199";
assert.deepEqual(await handleCallEvent(deps, calls("call-initiated.json")), { action: "forwarding to owner" });
assert.equal(provider.forwarded.length, 1);
const sentBefore = provider.sent.length;
const missed = await handleCallEvent(deps, calls("call-hangup-missed.json"));
assert.equal(missed.action, "missed");
assert.equal(missed.outcome?.status, "sent");
assert.equal(provider.sent.length, sentBefore + 1);
assert.equal(provider.sent.at(-1)?.to, "+15715550177");
assert.equal(provider.sent.at(-1)?.text, "Hi, this is Acme Detailing. Sorry we missed your call. Text back what you need, or book a time here: https://cal.example/acme Reply STOP to stop texts.");
const caller = store.clients.find((c) => c.phone === "+15715550177")!;
assert.ok(caller, "new caller became a lead");
assert.equal(caller.smsConsent, true, "calling the business line implies consent to a reply");
assert.match(store.tasks.at(-1)!.title, /Missed call from \+15715550177: call back \(text-back sent\)/);
assert.equal((await handleCallEvent(deps, calls("call-hangup-missed.json"))).action, "already handled", "second hangup leg does nothing");

// same caller again an hour later (new call session): no second text inside 24 hours, no duplicate lead
now = new Date("2026-11-12T17:00:00Z");
const again = (session: string) => ({ ...calls("call-hangup-missed.json"), callSessionId: session });
await handleCallEvent(deps, { ...calls("call-initiated.json"), callSessionId: "s2" });
const second = await handleCallEvent(deps, again("s2"));
assert.equal(second.outcome?.status, "skipped");
assert.match(second.outcome!.reason!, /last 24 hours/);
assert.equal(store.clients.filter((c) => c.phone === "+15715550177").length, 1);
now = new Date("2026-11-13T17:00:01Z");
await handleCallEvent(deps, { ...calls("call-initiated.json"), callSessionId: "s3" });
assert.equal((await handleCallEvent(deps, again("s3"))).outcome?.status, "sent", "next day: text-back again");

// answered call: never a text
await handleCallEvent(deps, { ...calls("call-initiated.json"), callSessionId: "s4" });
await handleCallEvent(deps, { ...calls("call-answered.json"), callSessionId: "s4" });
assert.deepEqual(await handleCallEvent(deps, { ...calls("call-hangup-answered.json"), callSessionId: "s4" }), { action: "not missed" });

// caller who texted STOP earlier: becomes no new consent, no text, still a task
const stopper = addClient({ name: "Ray Cole", phone: "+15715550180", smsOptOutAt: new Date("2026-11-01"), smsConsent: false });
await handleCallEvent(deps, { ...calls("call-initiated.json"), callSessionId: "s5", from: "+15715550180" });
const blocked = await handleCallEvent(deps, { ...calls("call-hangup-missed.json"), callSessionId: "s5", from: "+15715550180" });
assert.equal(blocked.outcome?.status, "skipped");
assert.equal(blocked.outcome?.reason, "Texted STOP");
assert.equal(stopper.smsConsent, false);

// missed call at night: queued for the morning
now = new Date("2026-11-14T04:00:00Z"); // 11pm New York
await handleCallEvent(deps, { ...calls("call-initiated.json"), callSessionId: "s6", from: "+15715550190" });
assert.equal((await handleCallEvent(deps, { ...calls("call-hangup-missed.json"), callSessionId: "s6", from: "+15715550190" })).outcome?.status, "queued");

// hidden caller ID: no lead, no text
await handleCallEvent(deps, { ...calls("call-initiated.json"), callSessionId: "s7", from: "anonymous" });
assert.equal((await handleCallEvent(deps, { ...calls("call-hangup-missed.json"), callSessionId: "s7", from: "anonymous" })).outcome?.status, "skipped");

// turned off in settings
store.cfg = { ...store.cfg, missedCallEnabled: false, leadReplyEnabled: false };
now = new Date("2026-11-20T17:00:00Z");
await handleCallEvent(deps, { ...calls("call-initiated.json"), callSessionId: "s8", from: "+15715550195" });
assert.equal((await handleCallEvent(deps, { ...calls("call-hangup-missed.json"), callSessionId: "s8", from: "+15715550195" })).outcome?.reason, "Missed-call text-back is turned off");
assert.equal((await leadCreated(deps, late.id, { showedConsentLine: true })).reason, "Lead reply is turned off");

// no booking link: the text is held back instead of sending a broken link
store.cfg = { ...resolveConfig({ businessName: "Acme Detailing", timezone: NY }), bookingUrl: "" };
const nolink = addClient({ name: "Bo Fox", phone: "+15715550196" });
assert.equal((await leadCreated(deps, nolink.id, { showedConsentLine: true })).reason, "Add a booking link in Settings > Messaging");
assert.equal(store.messages.at(-1)?.error, "Add a booking link in Settings > Messaging", "held-back text is logged");
const nolinkNoConsent = addClient({ name: "Di Wu", phone: "+15715550198" });
assert.equal((await leadCreated(deps, nolinkNoConsent.id)).reason, "No texting consent on file", "consent is reported before the missing link");

// provider failure is logged as failed with the reason
store.cfg = resolveConfig({ bookingUrl: "https://cal.example/acme", businessName: "Acme Detailing", timezone: NY });
provider.fail = true;
const flaky = addClient({ name: "Cy Ng", phone: "+15715550197" });
const fr = await leadCreated(deps, flaky.id, { showedConsentLine: true });
assert.equal(fr.status, "failed");
assert.equal(store.messages.find((m) => m.id === fr.messageId)?.error, "Telnyx answered 422");
provider.fail = false;

// test button: console only, even if a live provider is passed elsewhere
const before = provider.sent.length;
const test = await sendTest(store, "+15715550142", "lead_reply");
assert.equal(provider.sent.length, before, "the test never uses the live provider");
assert.equal(store.messages.at(-1)?.provider, "console");
assert.equal(store.messages.at(-1)?.template, "test");
assert.match(test.body, /^Hi Sam, this is Acme Detailing/);

console.log("messaging flows: all assertions passed");
