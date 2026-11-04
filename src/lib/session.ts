// Signing helpers for public links (unsubscribe, email verification), from LeadFlow.
// Login itself is handled by src/lib/auth.ts.

function secret(): string | null {
  return process.env.AUTH_SECRET || process.env.SESSION_SECRET || null;
}

const enc = new TextEncoder();

async function hmac(msg: string, key: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(msg));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** Short HMAC for public links (e.g. unsubscribe). Null when no secret is configured. */
export async function signValue(value: string): Promise<string | null> {
  const key = secret();
  return key ? (await hmac(`v:${value}`, key)).slice(0, 32) : null;
}

export async function verifySignedValue(value: string, sig: string): Promise<boolean> {
  const want = await signValue(value);
  return !!want && safeEqual(want, sig);
}
