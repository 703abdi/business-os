// Pure rules for texting: opt-out keywords, the consent gate, quiet hours and repeat suppression.
// No database or network here, so every rule is unit tested (scripts/messaging-test.mts).

// CTIA opt-out and opt-in keywords. Telnyx also blocks STOP at the carrier side:
// https://support.telnyx.com/en/articles/1270091-sms-opt-out-keywords-and-stop-words
export const STOP_WORDS = ["STOP", "STOPALL", "STOP ALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "REVOKE", "OPTOUT", "OPT OUT"];
export const START_WORDS = ["START", "UNSTOP"];

const keyword = (text: string) => text.trim().toUpperCase().replace(/[.!\s]+$/g, "").replace(/\s+/g, " ");
export const isStopKeyword = (text: string) => STOP_WORDS.includes(keyword(text));
export const isStartKeyword = (text: string) => START_WORDS.includes(keyword(text));

export type ConsentState = { smsConsent: boolean; smsOptOutAt: Date | null };

/** The one gate every outbound text passes. */
export function canText(c: ConsentState | null | undefined): { ok: true } | { ok: false; reason: string } {
  if (!c) return { ok: false, reason: "No CRM record for this number" };
  if (c.smsOptOutAt) return { ok: false, reason: "Texted STOP" };
  if (!c.smsConsent) return { ok: false, reason: "No texting consent on file" };
  return { ok: true };
}

/**
 * Consent to record for an event. STOP always wins: a later form or call never turns texting
 * back on. Only an inbound START does that (handled in the service).
 */
export function consentAfter(
  c: ConsentState,
  event: { kind: "form"; showedConsentLine: boolean } | { kind: "missed_call" },
): boolean {
  if (c.smsOptOutAt) return false;
  if (c.smsConsent) return true;
  if (event.kind === "form") return event.showedConsentLine;
  return true; // calling a published business line implies consent to a reply about that call
}

/** True when a text with this template went (or is queued) to this number inside the window. */
export function isDuplicate(lastAt: Date | null | undefined, now: Date, hours: number): boolean {
  if (!lastAt) return false;
  return now.getTime() - lastAt.getTime() < Math.max(0, hours) * 3_600_000;
}

/* ------------------------------ quiet hours ------------------------------ */

function parts(d: Date, tz: string) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, s: +p.second };
}

/** Minutes the zone is ahead of UTC at this instant (New York in winter: -300). */
function offsetMinutes(d: Date, tz: string): number {
  const p = parts(d, tz);
  return Math.round((Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(d.getTime() / 1000) * 1000) / 60_000);
}

/** The UTC instant of a wall-clock time in a zone (handles daylight saving changes). */
export function zonedTime(y: number, m: number, d: number, h: number, tz: string): Date {
  const guess = Date.UTC(y, m - 1, d, h, 0, 0);
  let t = guess - offsetMinutes(new Date(guess), tz) * 60_000;
  t = guess - offsetMinutes(new Date(t), tz) * 60_000;
  return new Date(t);
}

export function validTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * When a text may go out. Inside the window (start <= local hour < end) that is now;
 * outside it is the next window opening in the business time zone.
 */
export function nextSendTime(now: Date, tz: string, startHour = 8, endHour = 20): Date {
  const start = Math.min(23, Math.max(0, Math.floor(startHour)));
  const end = Math.min(24, Math.max(start + 1, Math.floor(endHour)));
  const p = parts(now, tz);
  if (p.h >= start && p.h < end) return now;
  if (p.h < start) return zonedTime(p.y, p.m, p.d, start, tz);
  const tomorrow = new Date(Date.UTC(p.y, p.m - 1, p.d + 1));
  return zonedTime(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth() + 1, tomorrow.getUTCDate(), start, tz);
}

export const inQuietHours = (now: Date, tz: string, startHour = 8, endHour = 20) => nextSendTime(now, tz, startHour, endHour).getTime() > now.getTime();

/* ------------------------------ missed calls ----------------------------- */

// Telnyx call.hangup causes: https://developers.telnyx.com/api-reference/callbacks/call-hangup
// A call counts as missed when nobody answered it, whatever the cause
// (caller gave up = originator_cancel, transfer timed out = timeout, busy, no_answer...).
export function isMissedCall(call: { answered: boolean; direction?: string } | null | undefined): boolean {
  if (!call) return false;
  if (call.direction && call.direction !== "incoming") return false;
  return !call.answered;
}
