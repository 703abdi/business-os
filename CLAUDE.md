# Set up your Business OS

You are helping a non-technical business owner make this template theirs. Use plain words, make one small change at a time, and explain what each step does.

Start by asking for their name and business name. Until they answer, use they/them pronouns.

## Step 0 — Make their own private copy

This repository is only the template. Never push changes to `703abdi/business-os`.

1. Help them install GitHub CLI if needed, then run `gh auth login`.
2. Have them run:
   ```bash
   gh repo create <their-username>/business-os --template 703abdi/business-os --private --clone
   cd business-os
   ```
3. Work only in that cloned copy.

## Step 1 — Deploy it

1. Create a free Supabase project and open its database connection settings.
2. Generate three secrets, keeping the values private:
   ```bash
   openssl rand -base64 32
   ```
3. Create `.env` from `.env.example`. Set `DATABASE_URL` to Supabase's pooled URL on port `6543` with `?pgbouncer=true&schema=business_os`; set `DIRECT_URL` to the direct URL on port `5432` with `?schema=business_os`. Also set `AUTH_SECRET`, `CRON_SECRET`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD`.
4. Install and prepare the database:
   ```bash
   npm install
   npm run db:deploy
   npm run db:seed
   ```
5. Deploy with `npx vercel`. Add the same environment variables in the Vercel project, redeploy, then open the site and verify the admin login works.
6. Vercel Hobby permits daily cron jobs only; keep the included crons daily unless they upgrade.

Integration variables are optional. Do not block deployment for a calendar, ads, email, payment, or webhook integration that they do not use.

## Step 2 — Learn the business

Interview them before changing the template:

- What does the business do? What services and prices should clients see?
- How do clients find them and book them?
- How are they paid: one-off payments, payment plans, memberships, or a mix?
- Who is on the team, and what are their roles?
- What content do they post, and where?
- Which numbers do they care about every week?

Write down the answers in the plan you show them, not in a public issue or a secret file.

## Step 3 — Customize it

Propose a short plan and get their OK before editing. Then adapt `src/config/brand.ts`, page copy and labels, CRM pipeline stages, metrics, colors, and services/pricing to their business. `brand.ts` is the single source for business name, colors, services, and pricing.

After each meaningful change, run:

```bash
npm run lint
npx tsc --noEmit
npm run build
```

Fix failures, commit the work in their repository, and redeploy with Vercel.

## Step 4 — Make it live

1. Clear the sample data in Settings once they have entered real information.
2. Set up only the optional integrations they actually use; the dashboard should say “not connected” for the rest.
3. Show their daily routine: open Today, reply to new clients in CRM, update jobs in Schedule, record payments, and check the weekly metrics.

## Rules

- Never commit `.env`, credentials, customer data, or generated secrets.
- Keep changes small and confirm the result after each step.
- Explain technical actions in plain words.
- Put later ideas in `WISHLIST.md`; do not expand the project without their agreement.
