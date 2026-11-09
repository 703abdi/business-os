// Phone numbers for texting: everything is stored and compared in E.164 (+15715550100).
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/min";

/** E.164 form of a number typed any way ("(571) 555-0100", "571.555.0100", "+1 571..."), or null. */
export function toE164(raw: string | null | undefined, country: CountryCode = "US"): string | null {
  // Telnyx can send SIP URIs ("sip:+15715550100@sip.telnyx.com"); keep the number part.
  const s = (raw ?? "").trim().replace(/^sip:/i, "").replace(/@.*$/, "");
  if (!s || !/\d/.test(s) || /[a-z]/i.test(s)) return null;
  const p = parsePhoneNumberFromString(s, country);
  return p && p.isPossible() ? p.number : null;
}

/** Last 10 digits, the same key the CRM uses to match a client by phone. */
export const phoneKey = (raw: string) => raw.replace(/\D/g, "").slice(-10);
