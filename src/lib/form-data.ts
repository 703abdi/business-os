// Small readers for server actions that take FormData.
export const str = (fd: FormData, k: string, max = 2000) => String(fd.get(k) ?? "").trim().slice(0, max);
export const int = (fd: FormData, k: string, fallback = 0) => {
  const n = Number(String(fd.get(k) ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && String(fd.get(k) ?? "").trim() !== "" ? Math.round(n) : fallback;
};
export const num = (fd: FormData, k: string): number | null => {
  const raw = String(fd.get(k) ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};
export const bool = (fd: FormData, k: string) => ["on", "true", "1", "yes"].includes(String(fd.get(k) ?? ""));
export const list = (fd: FormData, k: string) =>
  str(fd, k)
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 30);
export function oneOf<T extends string>(v: string, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}
