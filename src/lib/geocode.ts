// Address -> lat/lng with OpenStreetMap's free Nominatim service (1 request a
// second, needs a User-Agent). Set GEOCODE_DISABLED=1 to turn it off; pins then
// need lat/lng typed in by hand or from an import.
import { BRAND } from "@/config/brand";

export async function geocode(address: string, city = ""): Promise<{ lat: number; lng: number } | null> {
  const q = [address, city].filter(Boolean).join(", ").trim();
  if (!q || process.env.GEOCODE_DISABLED === "1") return null;
  const query = /virginia|\bva\b/i.test(q) ? q : `${q}, Virginia`;
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "us");
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": `${BRAND.name} OS (${process.env.APP_URL || "dashboard"})` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const [hit] = (await res.json()) as { lat: string; lon: string }[];
    return hit ? { lat: Number(hit.lat), lng: Number(hit.lon) } : null;
  } catch {
    return null;
  }
}
