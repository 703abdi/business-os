// Every module in the OS. The nav (desktop sidebar, phone bottom bar and the
// "More" sheet) is built from this list, so adding a module is:
//   1. put its code in src/modules/<key>/
//   2. add its page at src/app/(app)/<key>/page.tsx
//   3. add one entry below
// See HANDOFF.md for the full checklist.

import type { IconName } from "@/components/app/Icon";

export type ModuleEntry = {
  key: string;
  href: string;
  label: string;
  icon: IconName;
  /** Shown in the phone bottom bar (keep it to 4; "More" is added after them). */
  mobile?: boolean;
  group: "run" | "grow" | "money" | "system";
  /** Not built yet: shows a "coming soon" badge in the nav. */
  slot?: boolean;
};

export const MODULES: ModuleEntry[] = [
  { key: "today", href: "/today", label: "Today", icon: "sun", mobile: true, group: "run" },
  { key: "map", href: "/map", label: "Map", icon: "map", mobile: true, group: "run" },
  { key: "schedule", href: "/schedule", label: "Schedule", icon: "calendar", mobile: true, group: "run" },
  { key: "crm", href: "/crm", label: "Clients", icon: "users", mobile: true, group: "run" },
  { key: "team", href: "/team", label: "Team", icon: "team", group: "run" },
  { key: "sales", href: "/sales", label: "Sales", icon: "bolt", group: "grow" },
  { key: "memberships", href: "/memberships", label: "Members", icon: "repeat", group: "grow" },
  { key: "ads", href: "/ads", label: "Ads", icon: "megaphone", group: "grow" },
  { key: "reviews", href: "/reviews", label: "Google", icon: "star", group: "grow" },
  { key: "content", href: "/content", label: "Content", icon: "film", group: "grow" },
  { key: "revenue", href: "/revenue", label: "Revenue", icon: "dollar", group: "money" },
  { key: "metrics", href: "/metrics", label: "Metrics", icon: "chart", group: "money" },
  { key: "settings", href: "/settings", label: "Settings", icon: "gear", group: "system" },
];

export const GROUP_LABELS: Record<ModuleEntry["group"], string> = {
  run: "Run the day",
  grow: "Grow",
  money: "Money",
  system: "System",
};

/** Sales tools ported from LeadFlow keep their own URLs; they count as the Sales module in the nav. */
export const SALES_TOOL_PATHS = ["/forms", "/pages", "/contacts", "/blasts", "/automations", "/insights"];

export function activeModule(pathname: string) {
  if (SALES_TOOL_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return "sales";
  return MODULES.find((m) => pathname === m.href || pathname.startsWith(`${m.href}/`))?.key;
}
