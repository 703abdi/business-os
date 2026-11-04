import { timingSafeEqual } from "node:crypto";

export function contentApiAuthorized(headers: Headers, token = process.env.CONTENT_API_TOKEN) {
  if (!token) return false;
  const candidate = headers.get("x-content-api-token") || headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const a = Buffer.from(candidate); const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}
