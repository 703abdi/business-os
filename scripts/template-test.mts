import assert from "node:assert/strict";
import { parseAcuityDate } from "../src/modules/crm/acuity-import.ts";
import { rawDatabaseUrl, withPrismaParams } from "../src/lib/database-url.ts";
import { canAccessPath } from "../src/lib/access.ts";
import { retentionSnapshot } from "../src/modules/crm/retention.ts";
import { nextPlanDue } from "../src/modules/payments/plans.ts";
import { contentApiAuthorized } from "../src/lib/content-api.ts";
import { canBootstrapAdmin } from "../src/lib/admin-bootstrap.ts";
import { totalMrr } from "../src/modules/payments/mrr.ts";
import { verifyAcuitySignature } from "../src/lib/acuity-webhook.ts";
import { fetchAcuityAppointment, AcuityAppointmentLookupError } from "../src/lib/acuity-appointment.ts";
import { logoutRequestAllowed } from "../src/lib/logout-csrf.ts";
import { LOGIN_EMAIL_FAILURE_LIMIT, LOGIN_FAILURE_LIMIT, LOGIN_WINDOW_MS, loginClientIp, loginRateLimitDecision, loginRateLimitStatus } from "../src/lib/login-rate-limit.ts";
import { weekWindows } from "../src/lib/dates.ts";
import crypto from "node:crypto";
import { NextRequest } from "next/server";

const iso = parseAcuityDate("2026-11-03 09:30");
assert.ok(iso instanceof Date && !Number.isNaN(iso.getTime()), "ISO Acuity timestamp parses");
assert.ok(parseAcuityDate("November 3, 2026 9:30 am") instanceof Date, "human Acuity timestamp parses");
assert.equal(parseAcuityDate("not a date"), null);
assert.equal(rawDatabaseUrl({ POSTGRES_URL: "postgresql://example.com/db" } as NodeJS.ProcessEnv), "postgresql://example.com/db");
assert.ok(withPrismaParams("postgresql://example.com/db").includes("schema=business_os"));
assert.equal(canAccessPath("EMPLOYEE", "/revenue"), false, "employee is blocked from revenue");
assert.equal(canAccessPath("EMPLOYEE", "/content/abc"), true, "employee can open assigned content executor routes");
assert.equal(canAccessPath("ADMIN", "/revenue"), true, "admin can access money");
const retention = retentionSnapshot({ lastServiceAt: new Date("2026-08-01T12:00:00Z"), intervalDays: 30, visits: 3, lifetimeValue: 897 }, new Date("2026-11-03T12:00:00Z"));
assert.equal(retention.daysSince, 94);
assert.equal(retention.bucket, "lost", "90+ days is lost");
assert.equal(nextPlanDue(new Date("2026-11-03T12:00:00Z"), "biweekly").toISOString().slice(0, 10), "2026-11-17");
assert.equal(contentApiAuthorized(new Headers({ authorization: "Bearer test-token" }), "test-token"), true, "scheduled-post API accepts valid bearer token");
assert.equal(contentApiAuthorized(new Headers({ authorization: "Bearer wrong" }), "test-token"), false, "scheduled-post API rejects wrong token");
assert.equal(canBootstrapAdmin({ emailMatches: true, passwordMatches: true, activeAdminCount: 0, existingUser: null }), true, "sample employees do not block first-admin bootstrap");
assert.equal(canBootstrapAdmin({ emailMatches: true, passwordMatches: true, activeAdminCount: 0, existingUser: { role: "EMPLOYEE", active: true } }), false, "an existing non-admin account is never promoted by bootstrap credentials");
assert.equal(canBootstrapAdmin({ emailMatches: true, passwordMatches: true, activeAdminCount: 1, existingUser: null }), false, "an active admin disables bootstrap");
assert.equal(totalMrr([{ price: 129, status: "ACTIVE" }], [{ amount: 150, frequency: "biweekly", status: "ACTIVE" }]), 429, "MRR includes memberships and active payment plans");
const acuityBody = "action=scheduled&id=123&calendarID=7&appointmentTypeID=11";
const acuityKey = "unit-test-acuity-key";
const acuitySignature = crypto.createHmac("sha256", acuityKey).update(acuityBody).digest("base64");
assert.equal(verifyAcuitySignature(acuityBody, acuitySignature, acuityKey), true, "native Acuity signatures verify against the raw body");
assert.equal(verifyAcuitySignature(`${acuityBody}&changed=1`, acuitySignature, acuityKey), false, "native Acuity signatures reject changed bodies");
await assert.rejects(
  () => fetchAcuityAppointment("123", { userId: "user", apiKey: "key" }, async () => new Response("busy", { status: 429 })),
  AcuityAppointmentLookupError,
  "Acuity lookup failures are distinguished so the webhook can return 500 and retry",
);
await assert.rejects(
  () => fetchAcuityAppointment("123", { userId: "user", apiKey: "key" }, async () => { throw new Error("offline"); }),
  AcuityAppointmentLookupError,
  "Acuity network failures are retryable",
);
const priorAcuityUser = process.env.ACUITY_USER_ID;
const priorAcuityKey = process.env.ACUITY_API_KEY;
const nativeFetch = globalThis.fetch;
try {
  process.env.ACUITY_USER_ID = "unit-test-user";
  process.env.ACUITY_API_KEY = acuityKey;
  globalThis.fetch = async () => new Response("busy", { status: 429 });
  const { POST: acuityWebhookPost } = await import("../src/app/api/acuity/webhook/route.ts");
  const retryResponse = await acuityWebhookPost(new NextRequest("http://localhost/api/acuity/webhook", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "x-acuity-signature": acuitySignature },
    body: acuityBody,
  }));
  assert.equal(retryResponse.status, 500, "a signed Acuity event retries after an upstream 429");
} finally {
  globalThis.fetch = nativeFetch;
  if (priorAcuityUser === undefined) delete process.env.ACUITY_USER_ID;
  else process.env.ACUITY_USER_ID = priorAcuityUser;
  if (priorAcuityKey === undefined) delete process.env.ACUITY_API_KEY;
  else process.env.ACUITY_API_KEY = priorAcuityKey;
}
assert.equal(logoutRequestAllowed(new Headers({ host: "app.example.com", origin: "https://app.example.com" })), true, "same-origin POST logout is accepted");
assert.equal(logoutRequestAllowed(new Headers({ host: "app.example.com", origin: "https://evil.example" })), false, "cross-site logout is rejected");
assert.equal(logoutRequestAllowed(new Headers({ host: "app.example.com" })), false, "logout requires an Origin or Referer");
const limitStart = new Date("2026-11-03T12:00:00Z");
assert.equal(loginRateLimitStatus({ failures: LOGIN_FAILURE_LIMIT, windowStartedAt: limitStart }, new Date(limitStart.getTime() + 60_000)).limited, true, "five login failures are rate limited");
assert.equal(loginRateLimitStatus({ failures: LOGIN_FAILURE_LIMIT, windowStartedAt: limitStart }, new Date(limitStart.getTime() + LOGIN_WINDOW_MS)).limited, false, "login rate limit expires after fifteen minutes");
assert.equal(loginRateLimitDecision({ failures: 1, windowStartedAt: limitStart }, LOGIN_EMAIL_FAILURE_LIMIT, new Date(limitStart.getTime() + 60_000)).limited, true, "per-email login cap applies across IPs");
const forwarded = new Headers({ "x-vercel-forwarded-for": "198.51.100.10, 10.0.0.1", "x-forwarded-for": "203.0.113.8, 10.0.0.1", "x-real-ip": "192.0.2.1" });
assert.equal(loginClientIp(forwarded, true), "198.51.100.10", "Vercel login rate limits use the first client IP");
assert.equal(loginClientIp(forwarded, false), "untrusted", "local login rate limits do not trust spoofable proxy headers");
const weeks = weekWindows(new Date("2026-11-04T17:00:00Z"), 2);
assert.equal(weeks[0].start.toISOString(), "2026-11-02T05:00:00.000Z", "schedule capacity weeks start Monday in New York");
assert.equal(weeks[0].end.toISOString(), weeks[1].start.toISOString(), "capacity windows share the same boundary");
console.log("business_os: all assertions passed");
