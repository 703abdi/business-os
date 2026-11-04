// Day/week/month boundaries in the business's time zone (servers run in UTC).
import { BRAND } from "@/config/brand";

const TZ = BRAND.timezone;
export const DAY = 86_400_000;

function parts(d: Date) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => Number(f.find((p) => p.type === t)?.value);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), min: get("minute"), s: get("second") };
}

/** Minutes the zone is ahead of UTC at instant d (negative in the US). */
function offsetMin(d: Date) {
  const p = parts(d);
  return Math.round((Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - d.getTime()) / 60000);
}

/** The UTC instant of local wall-clock time y-m-d h:min in the business zone. */
export function zoned(y: number, m: number, d: number, h = 0, min = 0) {
  const guess = Date.UTC(y, m - 1, d, h, min);
  const first = guess - offsetMin(new Date(guess)) * 60000;
  return new Date(guess - offsetMin(new Date(first)) * 60000);
}

export function localParts(d: Date) {
  return parts(d);
}

export function startOfDay(d = new Date()) {
  const p = parts(d);
  return zoned(p.y, p.m, p.d);
}
export function addDays(d: Date, n: number) {
  const p = parts(d);
  return zoned(p.y, p.m, p.d + n, p.h, p.min);
}
export function endOfDay(d = new Date()) {
  return addDays(startOfDay(d), 1);
}
/** Weeks start Monday. */
export function startOfWeek(d = new Date()) {
  const p = parts(d);
  const dow = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
  return zoned(p.y, p.m, p.d - ((dow + 6) % 7));
}
/** Consecutive Monday-to-Monday windows in the business time zone. */
export function weekWindows(start = new Date(), count = 1) {
  const first = startOfWeek(start);
  return Array.from({ length: count }, (_, i) => {
    const weekStart = addDays(first, i * 7);
    return { start: weekStart, end: addDays(weekStart, 7) };
  });
}
export function startOfMonth(d = new Date()) {
  const p = parts(d);
  return zoned(p.y, p.m, 1);
}
export function addMonths(d: Date, n: number) {
  const p = parts(d);
  return zoned(p.y, p.m + n, 1);
}
export function dayOfWeek(d: Date) {
  const p = parts(d);
  return new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
}
/** "2026-11-03" in the business zone, for <input type="date"> and keys. */
export function ymd(d: Date) {
  const p = parts(d);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}
export function parseYmd(s: string | undefined | null, fallback = new Date()) {
  const m = s?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? zoned(+m[1], +m[2], +m[3]) : startOfDay(fallback);
}
/** Parse "2026-11-03T09:30" (from <input type="datetime-local">) as business-zone time. */
export function parseLocalDateTime(s: string) {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return m ? zoned(+m[1], +m[2], +m[3], +m[4], +m[5]) : null;
}
export function toLocalInput(d: Date) {
  const p = parts(d);
  return `${ymd(d)}T${String(p.h).padStart(2, "0")}:${String(p.min).padStart(2, "0")}`;
}

const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { timeZone: TZ, ...o });
export const fmtTime = (d: Date) => fmt({ hour: "numeric", minute: "2-digit" }).format(d);
export const fmtDay = (d: Date) => fmt({ weekday: "short", month: "short", day: "numeric" }).format(d);
export const fmtDate = (d: Date) => fmt({ month: "short", day: "numeric", year: "numeric" }).format(d);
export const fmtMonth = (d: Date) => fmt({ month: "short", year: "2-digit" }).format(d);
export const fmtWeekday = (d: Date) => fmt({ weekday: "short" }).format(d);

export function ago(d: Date, now = new Date()) {
  const m = Math.round((now.getTime() - d.getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/** "4m", "2h 5m", "3d" */
export function duration(min: number) {
  if (min < 60) return `${Math.max(0, Math.round(min))}m`;
  if (min < 48 * 60) {
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  return `${Math.round(min / 1440)}d`;
}
