// Messaging settings: one database row, with defaults so a fresh install works before anyone saves.
import { BRAND } from "@/config/brand";
import { DEFAULT_TEMPLATES } from "@/lib/messaging/templates";
import { validTimeZone } from "@/lib/messaging/rules";

export type MessagingConfig = {
  leadReplyEnabled: boolean;
  missedCallEnabled: boolean;
  leadReplyTemplate: string;
  missedCallTemplate: string;
  businessName: string;
  bookingUrl: string;
  timezone: string;
  quietStartHour: number;
  quietEndHour: number;
  dedupeHours: number;
};

export type StoredMessagingSettings = Partial<{ [K in keyof MessagingConfig]: MessagingConfig[K] | null }>;

/** Fill blanks from brand.ts and env. The stored row only keeps what the owner changed. */
export function resolveConfig(row: StoredMessagingSettings | null | undefined, env: NodeJS.ProcessEnv = process.env): MessagingConfig {
  const r = row ?? {};
  const tz = [r.timezone, env.APP_TIMEZONE, BRAND.timezone].map((t) => (t ?? "").trim()).find((t) => t && validTimeZone(t)) ?? "America/New_York";
  const hour = (v: number | null | undefined, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(24, Math.max(0, Math.floor(v))) : d);
  const start = hour(r.quietStartHour, 8);
  const end = Math.max(start + 1, hour(r.quietEndHour, 20));
  return {
    leadReplyEnabled: r.leadReplyEnabled ?? true,
    missedCallEnabled: r.missedCallEnabled ?? true,
    leadReplyTemplate: r.leadReplyTemplate?.trim() || DEFAULT_TEMPLATES.lead_reply,
    missedCallTemplate: r.missedCallTemplate?.trim() || DEFAULT_TEMPLATES.missed_call,
    businessName: r.businessName?.trim() || BRAND.name,
    bookingUrl: r.bookingUrl?.trim() || BRAND.links.booking || "",
    timezone: tz,
    quietStartHour: start,
    quietEndHour: Math.min(24, end),
    dedupeHours: typeof r.dedupeHours === "number" && r.dedupeHours >= 0 ? Math.min(168, r.dedupeHours) : 24,
  };
}
