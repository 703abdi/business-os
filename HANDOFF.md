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
6. Check that Vercel accepts two cron entries with the same path; if not, give the second one
   `/api/cron/messages?w=1`.
