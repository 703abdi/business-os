export class AcuityAppointmentLookupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AcuityAppointmentLookupError";
  }
}

type Fetcher = typeof fetch;

/**
 * Load the authoritative appointment data after Acuity has authenticated an
 * event. Lookup failures are deliberately distinct from malformed webhook
 * payloads so callers can return 500 and let Acuity retry them.
 */
export async function fetchAcuityAppointment(
  id: string,
  credentials: { userId?: string; apiKey?: string },
  fetcher: Fetcher = fetch,
) {
  const { userId, apiKey } = credentials;
  if (!userId || !apiKey) throw new AcuityAppointmentLookupError("Acuity API credentials are not configured");

  const basic = Buffer.from(`${userId}:${apiKey}`).toString("base64");
  let response: Response;
  try {
    response = await fetcher(`https://acuityscheduling.com/api/v1/appointments/${encodeURIComponent(id)}`, {
      headers: { authorization: `Basic ${basic}`, accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new AcuityAppointmentLookupError("Acuity appointment lookup could not be completed");
  }

  if (!response.ok) throw new AcuityAppointmentLookupError(`Acuity appointment lookup failed (${response.status})`);

  let appointment: unknown;
  try {
    appointment = await response.json();
  } catch {
    throw new AcuityAppointmentLookupError("Acuity appointment lookup returned invalid JSON");
  }
  if (!appointment || typeof appointment !== "object" || Array.isArray(appointment)) {
    throw new AcuityAppointmentLookupError("Acuity appointment lookup returned invalid data");
  }
  return appointment as Record<string, unknown>;
}
