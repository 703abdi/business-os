# Messaging: lead reply and missed-call text-back

Two automations that answer every lead in minutes, plus the plumbing they share.

1. 60-second lead reply. A new lead comes in from the website form, a built-in form or the
   lead webhook. If their form showed the texting consent line, they get one text right away with
   the business name, their first name and the booking link. The owner gets a call-back task due
   in `BRAND.speedToLeadMinutes` (15 by default).
2. Missed-call text-back. Someone calls the business number and nobody answers. If the caller
   is new, they become a lead with source "Missed call". They get one text-back, at most once per
   number per 24 hours, and the owner gets a call-back task.

Both are on by default and both start in console test mode: nothing reaches a phone until the
Telnyx keys are set.

## How it works

| Piece | File |
|---|---|
| Provider interface, console and Telnyx providers, webhook parsing, signature check | `src/lib/messaging/provider.ts` |
| The flows (lead reply, missed call, inbound texts, queue, test) | `src/lib/messaging/service.ts` |
| Pure rules: STOP words, consent gate, quiet hours, 24-hour dedupe | `src/lib/messaging/rules.ts` |
| Templates and allowed variables | `src/lib/messaging/templates.ts` |
| Database access | `src/lib/messaging/prisma-store.ts` |
| Webhook routes | `src/app/api/messaging/telnyx/sms`, `src/app/api/messaging/telnyx/voice` |
| Queue cron | `src/app/api/cron/messages` (and the automations cron) |
| Settings card | `src/modules/settings/MessagingCard.tsx` (Settings page) |
| Automation step "Send text (SMS)" | `src/automations/engine.ts` |
| Tests | `scripts/messaging-test.mts`, fixtures in `scripts/fixtures/telnyx/` |

Data:

- `Client.smsConsent`, `smsConsentAt`, `smsConsentSource`, `smsConsentText`, `smsOptOutAt`: the
  consent record for each lead (when, where, and the exact words they saw).
- `Message`: every text in or out, with direction, provider id, template and status
  (queued, sending, sent, delivered, failed, skipped, canceled, received). Skipped texts are logged
  with the reason, so the owner can see why someone was not texted.
- `PhoneCall`: one row per call session, to tell an answered call from a missed one.
- `MessagingSettings`: one row. Templates, booking link, business name, time zone, texting hours.

Where the lead reply fires: `captureLead()` in `src/modules/crm/capture.ts`, for new leads and for
past clients who ask again. Built-in forms pass consent when the form has a consent line set
(Form > Settings > Access and privacy > "Texting consent line"); the line then shows under the
phone question. The lead webhook passes consent with `"sms_consent": true`, plus `consent_text`
and `page_url` for the record.

Missed calls: the business number sits on a Telnyx Voice API (Call Control) application. On
`call.initiated` we record the call and, if `TELNYX_FORWARD_TO` is set, transfer it to the owner's
phone with a 20 second timeout. If `call.answered` or `call.bridged` arrives, it was answered. On
`call.hangup` with no answer, it was missed. Telnyx sends a hangup for each leg; only the first
one runs the flow.

Quiet hours: texts only go out between the start and end hour in the business time zone (8am to
8pm by default). Outside that window they are saved as queued and sent when the window opens. The
queue is flushed by `/api/cron/messages` (twice a day on Vercel Hobby: 14:00 UTC, and 17:00 UTC as `/api/cron/messages?w=1` so the cron paths differ), by the
automations cron, and on every Telnyx webhook. On Vercel Pro, change the two cron entries to one
`*/10 * * * *` so morning texts leave close to 8am.

## Consent rules (built into the code)

- A lead from a form is texted only if that form showed the consent line. No line, no text.
  Imports and booking syncs never text.
- A missed call to the published business line counts as consent to a reply about that call.
- STOP (also STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT, REVOKE, OPT OUT) turns texting off for that
  number, cancels queued texts, and stops every waiting automation run for that contact. We do not
  send our own confirmation, because Telnyx sends the carrier opt-out reply.
- After STOP, a new form or a new call never turns texting back on. Only START or UNSTOP does.
- Every template must name the business and keep a STOP line. The settings page refuses to save
  one that doesn't.
- The texts here are about the person's own request (transactional). Offers, win-backs and package
  pushes need a separate opt-in. Don't send them under this consent.
- Keep a screenshot of the live form with the consent line. The 10DLC registration asks for it.

Consent wording to put under the phone field (replace the business name):

> By sending this form you agree that [Business] can call or text you at this number about your
> quote and your appointment. Message and data rates may apply. Reply STOP to stop texts.
> Privacy Policy

Not legal advice. Have it checked if volume gets high.

## 10DLC registration

US carriers block business texts from ordinary 10-digit numbers unless the brand and the use case
("campaign") are registered through The Campaign Registry. Telnyx does this from Mission Control
under Messaging > 10DLC. Expect a brand registration, a campaign registration with sample messages
and the consent wording, and a review that can take days. The fees and timeline are not listed on
the Telnyx or Twilio pricing pages we read. TODO: confirm the current brand and campaign fees and
review time in the Telnyx portal before quoting a client.

Per-text cost read on 2026-11-08 from https://telnyx.com/pricing/messaging: $0.004 per part plus
a carrier fee, and about $1/month per number. Check again before quoting.

## Turning it on for a Conversion Build client (about 30 minutes, after 10DLC is approved)

1. In Telnyx: buy a local number for the client's area. Create a Messaging Profile, add the
   number, and set its inbound webhook to the "Messaging profile" URL shown in Settings >
   Messaging (`https://<their-app>/api/messaging/telnyx/sms`).
2. In Telnyx: create a Voice API application, set its webhook to the "Voice API application" URL
   (`https://<their-app>/api/messaging/telnyx/voice`), and assign the same number to it.
3. Copy the API key (Account > Keys) and the public key (Keys & Credentials > Public Key).
4. In the client's Vercel project add `TELNYX_API_KEY`, `TELNYX_PUBLIC_KEY`, `TELNYX_FROM_NUMBER`
   (E.164, like +17035550100) and, to ring the owner first, `TELNYX_FORWARD_TO`. Redeploy.
5. In their dashboard, Settings > Messaging: check the badge says "Telnyx: live texts". Enter the
   business name and booking link, check the texting hours and time zone, edit the two templates.
6. On each lead form, set the texting consent line. For outside forms posting to
   `/api/leads/inbound`, add the line under the phone field and send `"sms_consent": true`.
7. Test with the owner's own cell, never a customer's: fill the form with it, then call the
   number and hang up. Both texts should arrive and both tasks should show in Clients. Text STOP
   and check that Settings > Messaging logs it.
8. Point the client's published number (Google Business Profile, site, ads) at the Telnyx number,
   or forward their existing line to it.

## Not tested against real Telnyx yet

The webhook shapes come from Telnyx's docs and OpenAPI spec, not from a live account. The tests use
saved fixtures and a generated Ed25519 key pair. Before the first client goes live, run step 7
above with a real number and compare one real `message.received` and `call.hangup` body against
`scripts/fixtures/telnyx/`.

Known gaps:

- If the owner's cell sends a forwarded call to voicemail, Telnyx sees it as answered and no text
  goes out. Telnyx has answering machine detection on transfer; not wired up.
- There is no inbox to reply from the business number inside the dashboard. Replies become tasks.
- `TELNYX_FROM_NUMBER` is one number per deployment, which fits one dashboard per client.
