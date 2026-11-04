// Acuity Scheduling CSV export -> clients, vehicles and jobs.
// Acuity: Reports > Import/Export > Export appointments (CSV). Column names vary
// with the account's intake form, so headers are matched loosely.
import Papa from "papaparse";
import { prisma } from "@/lib/prisma";
import { zoned } from "@/lib/dates";

type Row = Record<string, string>;

function pick(row: Row, ...patterns: RegExp[]) {
  for (const p of patterns) {
    const key = Object.keys(row).find((k) => p.test(k.trim()));
    if (key && row[key]?.trim()) return row[key].trim();
  }
  return "";
}

/** Acuity writes times like "November 3, 2026 9:00 am" or "2026-11-03 09:00". */
export function parseAcuityDate(s: string): Date | null {
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})/);
  if (iso) return zoned(+iso[1], +iso[2], +iso[3], +iso[4], +iso[5]);
  const m = s.match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\s+(\d{1,2}):(\d{2})\s*([ap]m)?/i);
  if (m) {
    const month = new Date(`${m[1]} 1, 2000`).getMonth() + 1;
    let h = +m[4] % 12;
    if (m[6]?.toLowerCase() === "pm") h += 12;
    if (!m[6]) h = +m[4];
    return month ? zoned(+m[3], month, +m[2], h, +m[5]) : null;
  }
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*([ap]m)?/i);
  if (us) {
    let h = +us[4] % 12;
    if (us[6]?.toLowerCase() === "pm") h += 12;
    if (!us[6]) h = +us[4];
    return zoned(+us[3], +us[1], +us[2], h, +us[5]);
  }
  return null;
}

export type ImportResult = { rows: number; clientsCreated: number; clientsMatched: number; jobsCreated: number; skipped: number };

export async function importAcuityCsv(text: string): Promise<ImportResult> {
  const parsed = Papa.parse<Row>(text, { header: true, skipEmptyLines: true });
  const result: ImportResult = { rows: parsed.data.length, clientsCreated: 0, clientsMatched: 0, jobsCreated: 0, skipped: 0 };
  const services = await prisma.service.findMany();
  const now = new Date();

  for (const row of parsed.data) {
    const first = pick(row, /^first name$/i);
    const last = pick(row, /^last name$/i);
    const name = [first, last].filter(Boolean).join(" ") || pick(row, /^name$/i);
    const email = pick(row, /^email$/i).toLowerCase();
    const phone = pick(row, /^phone$/i);
    if (!name && !email && !phone) {
      result.skipped++;
      continue;
    }
    const address = pick(row, /address/i, /street/i, /location/i);
    const city = pick(row, /^city$/i, /\bcity\b/i);
    const vehicle = pick(row, /vehicle/i, /make.*model/i, /\bcar\b/i);
    const apptId = pick(row, /appointment id/i, /^id$/i);
    const start = parseAcuityDate(pick(row, /^start time$/i, /^date$/i, /start/i));
    const type = pick(row, /^type$/i, /appointment type/i, /service/i);
    const price = Math.round(Number(pick(row, /appointment price/i, /^price$/i, /amount paid/i).replace(/[$,]/g, "")) || 0);
    const canceled = /cancel/i.test(pick(row, /status/i, /canceled/i));

    let client =
      (email && (await prisma.client.findFirst({ where: { email } }))) ||
      (phone && (await prisma.client.findFirst({ where: { phone } }))) ||
      null;
    if (client) result.clientsMatched++;
    else {
      client = await prisma.client.create({
        data: {
          name: name || email || phone,
          email,
          phone,
          address,
          city,
          source: "REPEAT",
          stage: start && start < now ? "COMPLETED" : "BOOKED",
          leadAt: start ?? now,
          firstReplyAt: start ?? now,
          notes: pick(row, /^notes$/i),
        },
      });
      result.clientsCreated++;
      if (vehicle) await prisma.vehicle.create({ data: { clientId: client.id, make: vehicle } });
    }

    if (start && !canceled) {
      const externalId = apptId ? `acuity:${apptId}` : `acuity:${client.id}:${start.toISOString()}`;
      const exists = await prisma.job.findUnique({ where: { externalId } });
      if (!exists) {
        const svc = services.find((s) => type && type.toLowerCase().includes(s.name.toLowerCase()));
        const done = start < now;
        const job = await prisma.job.create({
          data: {
            clientId: client.id,
            serviceId: svc?.id,
            title: type,
            price: price || svc?.price || 0,
            startAt: start,
            durationMin: svc?.durationMin ?? 180,
            status: done ? "DONE" : "CONFIRMED",
            completedAt: done ? start : null,
            address: client.address,
            city: client.city,
            lat: client.lat,
            lng: client.lng,
            externalId,
          },
        });
        if (done && job.price) {
          await prisma.payment.create({ data: { date: start, amount: job.price, kind: "one_time", clientId: client.id, jobId: job.id, note: "Imported from Acuity" } });
        }
        result.jobsCreated++;
      }
    }
  }
  return result;
}
