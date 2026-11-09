// SMS templates. Owners edit them in Settings > Messaging; only the variables below are allowed.

export const TEMPLATE_VARS = {
  first_name: "The person's first name (\"there\" when we don't have it)",
  business_name: "Your business name",
  booking_link: "Your booking link",
} as const;

export type TemplateVar = keyof typeof TEMPLATE_VARS;
export type TemplateKey = "lead_reply" | "missed_call";

export const DEFAULT_TEMPLATES: Record<TemplateKey, string> = {
  lead_reply:
    "Hi {{first_name}}, this is {{business_name}}. We got your request and will be in touch shortly. To pick a time now: {{booking_link}} Reply STOP to stop texts.",
  missed_call:
    "Hi, this is {{business_name}}. Sorry we missed your call. Text back what you need, or book a time here: {{booking_link}} Reply STOP to stop texts.",
};

export const TEMPLATE_LABEL: Record<string, string> = {
  lead_reply: "60-second lead reply",
  missed_call: "Missed-call text-back",
  automation: "Automation step",
  test: "Test",
  inbound: "Inbound text",
};

const VAR_RE = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;

export function templateVars(tpl: string): string[] {
  return [...tpl.matchAll(VAR_RE)].map((m) => m[1].toLowerCase());
}

/** Fill in {{variables}}. Unknown variables render as nothing (validateTemplate stops them at save time). */
export function renderSms(tpl: string, vars: Partial<Record<TemplateVar, string>>): string {
  const out = tpl.replace(VAR_RE, (_, k: string) => {
    const key = k.toLowerCase() as TemplateVar;
    if (key === "first_name") return (vars.first_name ?? "").trim() || "there";
    return (vars[key] ?? "").trim();
  });
  return out.replace(/[ \t]{2,}/g, " ").trim();
}

/** First word of a full name, cleaned up for a text ("JOHN smith" -> "John"). */
export function firstNameOf(name: string): string {
  const w = (name ?? "").trim().split(/\s+/)[0] ?? "";
  if (!w || /\d|@/.test(w)) return "";
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

/** Problems that block saving a template. Empty array = fine. */
export function validateTemplate(tpl: string): string[] {
  const errors: string[] = [];
  const t = tpl.trim();
  if (!t) return ["Write the message."];
  const unknown = templateVars(t).filter((v) => !(v in TEMPLATE_VARS));
  if (unknown.length) errors.push(`Unknown variable: ${[...new Set(unknown)].map((v) => `{{${v}}}`).join(", ")}. Allowed: ${Object.keys(TEMPLATE_VARS).map((v) => `{{${v}}}`).join(", ")}.`);
  if (!templateVars(t).includes("business_name")) errors.push("Say who is texting: include {{business_name}}.");
  if (!/\bSTOP\b/.test(t)) errors.push('Keep the opt-out line, for example "Reply STOP to stop texts."');
  if (t.length > 480) errors.push("Keep it under 480 characters (3 text segments).");
  return errors;
}

/** How many SMS segments a message costs (GSM-7: 160, or 153 per part; otherwise UCS-2: 70, or 67 per part). */
export function smsSegments(text: string): number {
  const gsm = /^[\n\r\x20-\x7E£¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ¡ÄÖÑÜ§¿äöñüà€^{}\\[\]~|]*$/.test(text);
  const [single, multi] = gsm ? [160, 153] : [70, 67];
  if (text.length <= single) return 1;
  return Math.ceil(text.length / multi);
}
