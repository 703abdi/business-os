/** A state-changing logout must originate from the host serving this app. */
export function logoutRequestAllowed(headers: Headers) {
  const source = headers.get("origin") || headers.get("referer");
  const host = headers.get("host")?.split(",")[0]?.trim().toLowerCase();
  if (!source || !host) return false;
  try {
    return new URL(source).host.toLowerCase() === host;
  } catch {
    return false;
  }
}
