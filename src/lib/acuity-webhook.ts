import crypto from "node:crypto";

/** Acuity signs the exact URL-encoded request body with the API key. */
export function verifyAcuitySignature(rawBody: string, signature: string | null, apiKey: string | undefined) {
  if (!signature || !apiKey) return false;
  const expected = crypto.createHmac("sha256", apiKey).update(rawBody).digest("base64");
  const actual = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  return actual.length === wanted.length && crypto.timingSafeEqual(actual, wanted);
}
