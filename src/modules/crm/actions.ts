"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { geocode } from "@/lib/geocode";
import { bool, int, list, num, oneOf, str } from "@/lib/form-data";
import { parseLocalDateTime } from "@/lib/dates";
import { SOURCES, STAGES, STAGE_LABEL, VEHICLE_SIZES, type StageKey } from "./constants";

function refresh(id?: string) {
  revalidatePath("/crm");
  revalidatePath("/today");
  revalidatePath("/map");
  if (id) revalidatePath(`/crm/${id}`);
}

export async function createClient(fd: FormData) {
  await requireAdmin();
  const name = str(fd, "name", 120);
  if (!name) throw new Error("Name is required");
  const address = str(fd, "address", 200);
  const city = str(fd, "city", 80);
  const pos = address ? await geocode(address, city) : null;
  const c = await prisma.client.create({
    data: {
      name,
      phone: str(fd, "phone", 40),
      email: str(fd, "email", 200).toLowerCase(),
      address,
      city,
      lat: pos?.lat,
      lng: pos?.lng,
      source: oneOf(str(fd, "source"), SOURCES, "OTHER"),
      stage: oneOf(str(fd, "stage"), STAGES, "NEW"),
      notes: str(fd, "notes"),
      tags: list(fd, "tags"),
      leadAt: new Date(),
    },
  });
  const vehicle = str(fd, "vehicle", 120);
  if (vehicle) {
    const [year, make, ...model] = vehicle.split(/\s+/);
    const y = Number(year);
    await prisma.vehicle.create({
      data: Number.isFinite(y) && y > 1950
        ? { clientId: c.id, year: y, make: make ?? "", model: model.join(" ") }
        : { clientId: c.id, make: vehicle },
    });
  }
  await prisma.activity.create({ data: { clientId: c.id, kind: "system", body: "Lead added by hand" } });
  refresh();
  redirect(`/crm/${c.id}`);
}

export async function updateClient(id: string, fd: FormData) {
  await requireAdmin();
  const before = await prisma.client.findUniqueOrThrow({ where: { id } });
  const address = str(fd, "address", 200);
  const city = str(fd, "city", 80);
  let lat = num(fd, "lat");
  let lng = num(fd, "lng");
  if ((address !== before.address || city !== before.city) && address && lat === before.lat) {
    const pos = await geocode(address, city);
    if (pos) ({ lat, lng } = pos);
  }
  await prisma.client.update({
    where: { id },
    data: {
      name: str(fd, "name", 120) || before.name,
      phone: str(fd, "phone", 40),
      email: str(fd, "email", 200).toLowerCase(),
      address,
      city,
      zip: str(fd, "zip", 10),
      lat,
      lng,
      source: oneOf(str(fd, "source"), SOURCES, before.source),
      tags: list(fd, "tags"),
      ceramic: bool(fd, "ceramic"),
      notes: str(fd, "notes", 5000),
    },
  });
  refresh(id);
}

export async function setStage(id: string, stage: string, reason = "") {
  await requireAdmin();
  const s = oneOf(stage, STAGES, "NEW") as StageKey;
  const before = await prisma.client.findUniqueOrThrow({ where: { id } });
  if (before.stage === s) return;
  await prisma.client.update({
    where: { id },
    data: {
      stage: s,
      lostReason: s === "LOST" ? reason : before.lostReason,
      // Moving a lead forward counts as the first reply if nobody logged one.
      firstReplyAt: before.firstReplyAt ?? (s !== "NEW" && s !== "LOST" ? new Date() : null),
    },
  });
  await prisma.activity.create({
    data: { clientId: id, kind: "stage", body: `${STAGE_LABEL[before.stage as StageKey]} → ${STAGE_LABEL[s]}${reason ? ` (${reason})` : ""}` },
  });
  refresh(id);
}

export async function setStageForm(id: string, fd: FormData) {
  await setStage(id, str(fd, "stage"), str(fd, "reason", 200));
}

/** Log a call/text/email/note. Any outbound touch also counts as the first reply. */
export async function logActivity(id: string, fd: FormData) {
  await requireAdmin();
  const kind = oneOf(str(fd, "kind"), ["note", "call", "text", "email"] as const, "note");
  const body = str(fd, "body", 4000);
  if (!body && kind === "note") return;
  const now = new Date();
  const c = await prisma.client.findUniqueOrThrow({ where: { id } });
  await prisma.activity.create({ data: { clientId: id, kind, body: body || `${kind[0].toUpperCase()}${kind.slice(1)} logged` } });
  if (kind !== "note") {
    await prisma.client.update({
      where: { id },
      data: {
        lastContactAt: now,
        firstReplyAt: c.firstReplyAt ?? now,
        stage: c.stage === "NEW" ? "CONTACTED" : c.stage,
      },
    });
  }
  refresh(id);
}

export async function markReplied(id: string) {
  await requireAdmin();
  const fd = new FormData();
  fd.set("kind", "text");
  fd.set("body", "First reply sent");
  await logActivity(id, fd);
}

export async function deleteClient(id: string) {
  await requireAdmin();
  await prisma.client.delete({ where: { id } });
  refresh();
  redirect("/crm");
}

export async function saveVehicle(clientId: string, vehicleId: string | null, fd: FormData) {
  await requireAdmin();
  const year = int(fd, "year", 0) || null;
  const data = {
    year,
    make: str(fd, "make", 60),
    model: str(fd, "model", 60),
    color: str(fd, "color", 40),
    size: oneOf(str(fd, "size"), VEHICLE_SIZES, "sedan"),
    condition: str(fd, "condition", 2000),
    photos: str(fd, "photos", 4000)
      .split(/\s+/)
      .filter((u) => /^https?:\/\//.test(u))
      .slice(0, 20),
  };
  if (vehicleId) await prisma.vehicle.update({ where: { id: vehicleId }, data });
  else await prisma.vehicle.create({ data: { ...data, clientId } });
  refresh(clientId);
}

export async function deleteVehicle(clientId: string, vehicleId: string) {
  await requireAdmin();
  await prisma.vehicle.delete({ where: { id: vehicleId } });
  refresh(clientId);
}

export async function addFollowUp(clientId: string | null, fd: FormData) {
  await requireAdmin();
  const title = str(fd, "title", 200);
  if (!title) return;
  const due = parseLocalDateTime(str(fd, "dueAt")) ?? new Date(Date.now() + 86_400_000);
  await prisma.followUp.create({
    data: { clientId, title, dueAt: due, assigneeId: str(fd, "assigneeId") || null },
  });
  if (clientId) refresh(clientId);
  revalidatePath("/today");
  revalidatePath("/crm/tasks");
}

export async function toggleFollowUp(id: string) {
  await requireAdmin();
  const f = await prisma.followUp.findUniqueOrThrow({ where: { id } });
  await prisma.followUp.update({ where: { id }, data: { doneAt: f.doneAt ? null : new Date() } });
  if (f.clientId) refresh(f.clientId);
  revalidatePath("/today");
  revalidatePath("/crm/tasks");
}
