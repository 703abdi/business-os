# Handoff notes

## Adding a module

See the comment at the top of `src/modules/registry.ts`: code in `src/modules/<key>/`, a page at
`src/app/(app)/<key>/page.tsx`, one entry in `MODULES`.

## Messaging (branch `lead-reply`, 2026-11-08)

What was added: the 60-second lead reply, missed-call text-back, STOP handling, a Message log,
a "Send text (SMS)" automation step, and a Messaging card in Settings. Full notes in
`docs/messaging.md`.

- Safe by default. With no Telnyx keys the console provider logs texts and sends nothing. The
  Settings test button always uses the console provider.
- Migration `20261108120000_messaging_lead_reply` is additive: one enum value (`MISSED_CALL`),
  five defaulted Client columns, three new tables.
- New public routes (listed in `src/proxy.ts`): `/api/messaging/telnyx/sms`,
  `/api/messaging/telnyx/voice` (Ed25519 signature checked), `/api/cron/messages` (CRON_SECRET).
  Without `TELNYX_PUBLIC_KEY`, unsigned webhook posts are accepted only outside production.
- New crons in `vercel.json` for the quiet-hours queue: 14:00 and 17:00 UTC.
- Tests: `npm test` runs `scripts/messaging-test.mts` (no database or network needed).

How it was checked: lint, typecheck, `npm test`, `npm run build`; migrations applied to a
throwaway local Postgres; a production build run locally with Telnyx-shaped signed fixtures
posted to both webhooks (lead reply, missed call, duplicate hangup, reply, STOP stopping a waiting
automation run, unsigned post rejected); the Settings card driven in headless Chrome (save,
template validation, console test).

Open items before a real client:

1. 10DLC brand and campaign registration in Telnyx. Fee and review time not confirmed.
2. A Telnyx number per client and a test with the owner's own cell.
3. Per-client consent wording on every lead form.
4. Compare one real Telnyx webhook body with `scripts/fixtures/telnyx/`.
5. Voicemail on a forwarded call counts as answered (no text). Answering machine detection not wired.
6. Done 2026-11-09: the second cron entry is now `/api/cron/messages?w=1`, so the paths differ.

## 2026-11-09: messaging merged to main

PR #1 (https://github.com/703abdi/business-os/pull/1) merged into `main` by fast-forward
(`8ca278f`). The second quiet-hours cron is `/api/cron/messages?w=1`; the route and `src/proxy.ts`
match on pathname, so the query string needs nothing else.

Checked on 2026-11-09: lint, typecheck, `npm test`, `npm run build` all pass. Runtime run against a
scratch Postgres (dropped after) with `next dev`: all four migrations applied, seed ran, admin login
returned 200, `/settings` returned 200 with the Messaging card, an unsigned Telnyx SMS post returned
401, a signed STOP from a client's number returned 200 "opted out" and set `smsConsent` false and
`smsOptOutAt`, a replay returned "duplicate", and `/api/cron/messages` with and without `?w=1`
returned 200 with `CRON_SECRET` and 404 without it.

Telnyx items Abdi still owns:

1. Create or pick the Telnyx account and a Messaging Profile. Paste
   `https://<your-domain>/api/messaging/telnyx/sms` as its inbound webhook and
   `https://<your-domain>/api/messaging/telnyx/voice` on the Call Control app.
2. 10DLC brand and campaign registration. Check the current fee and review time in Telnyx first.
3. Buy one number per client, assign it to the profile, and test with the owner's own cell.
4. Set `TELNYX_API_KEY`, `TELNYX_PUBLIC_KEY`, `TELNYX_FROM_NUMBER` (and optionally
   `TELNYX_FORWARD_TO`, `TELNYX_FORWARD_TIMEOUT_SECS`) in Vercel. Until all three required ones
   are set, texts stay on the console provider and nothing is sent.
5. Set `CRON_SECRET` in Vercel if it is not there, then confirm both message crons show in the
   Vercel Crons tab after the next deploy.
6. Per-client consent wording on every lead form.
7. Post one real Telnyx webhook body and compare it with `scripts/fixtures/telnyx/`.
8. Decide on answering machine detection. Today a voicemail on a forwarded call counts as answered,
   so no text goes out.
