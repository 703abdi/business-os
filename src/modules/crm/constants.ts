import type { BadgeColor } from "@/components/app/ui";

export const STAGES = ["NEW", "CONTACTED", "QUOTED", "BOOKED", "COMPLETED", "MEMBER", "LOST"] as const;
export type StageKey = (typeof STAGES)[number];

export const STAGE_LABEL: Record<StageKey, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  QUOTED: "Quoted",
  BOOKED: "Booked",
  COMPLETED: "Completed",
  MEMBER: "Member",
  LOST: "Lost",
};
export const STAGE_COLOR: Record<StageKey, BadgeColor> = {
  NEW: "blue",
  CONTACTED: "purple",
  QUOTED: "amber",
  BOOKED: "teal",
  COMPLETED: "green",
  MEMBER: "gold",
  LOST: "gray",
};
/** Stages that still count as an open lead. */
export const LEAD_STAGES: StageKey[] = ["NEW", "CONTACTED", "QUOTED"];

export const SOURCES = ["META", "GOOGLE", "INSTAGRAM", "TIKTOK", "REFERRAL", "REPEAT", "WEBSITE", "MISSED_CALL", "OTHER"] as const;
export type SourceKey = (typeof SOURCES)[number];
export const SOURCE_LABEL: Record<SourceKey, string> = {
  META: "Meta ads",
  GOOGLE: "Google",
  INSTAGRAM: "Instagram",
  TIKTOK: "TikTok",
  REFERRAL: "Referral",
  REPEAT: "Repeat",
  WEBSITE: "Website",
  MISSED_CALL: "Missed call",
  OTHER: "Unknown",
};

/** Guess a lead source from a UTM source, referrer or free-text answer. */
export function guessSource(...hints: (string | undefined | null)[]): SourceKey {
  const s = hints.filter(Boolean).join(" ").toLowerCase();
  if (/facebook|fb|meta|\bfbclid/.test(s)) return "META";
  if (/instagram|\big\b/.test(s)) return "INSTAGRAM";
  if (/tiktok/.test(s)) return "TIKTOK";
  if (/google|gbp|maps|gclid/.test(s)) return "GOOGLE";
  if (/referr|friend|neighbor|word of mouth/.test(s)) return "REFERRAL";
  if (/repeat|returning|again/.test(s)) return "REPEAT";
  if (/site|web|squarespace/.test(s)) return "WEBSITE";
  return "OTHER";
}

export const VEHICLE_SIZES = ["sedan", "suv", "truck", "van"] as const;

/** Map pin categories. */
export type PinKind = "member" | "ceramic" | "one_time" | "lead";
export const PIN_COLOR: Record<PinKind, string> = {
  member: "#d4a017",
  ceramic: "#7c3aed",
  one_time: "#0e7c86",
  lead: "#2563eb",
};
export const PIN_LABEL: Record<PinKind, string> = {
  member: "Member",
  ceramic: "ceramic client",
  one_time: "One-time client",
  lead: "Lead",
};

export function pinKind(c: { stage: string; ceramic: boolean; hasActiveMembership?: boolean }): PinKind {
  if (c.hasActiveMembership || c.stage === "MEMBER") return "member";
  if (c.ceramic) return "ceramic";
  if (LEAD_STAGES.includes(c.stage as StageKey) || c.stage === "LOST") return "lead";
  return "one_time";
}
