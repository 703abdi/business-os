import { prisma } from "@/lib/prisma";

/** Options for the job form (clients with their cars and memberships, services, crew). */
export async function jobFormOptions() {
  const [clients, services, team] = await Promise.all([
    prisma.client.findMany({
      where: { stage: { not: "LOST" } },
      orderBy: { name: "asc" },
      include: { vehicles: true, memberships: { where: { status: "ACTIVE" }, include: { plan: true } } },
      take: 2000,
    }),
    prisma.service.findMany({ where: { active: true }, orderBy: { sort: "asc" } }),
    prisma.teamMember.findMany({ where: { active: true }, orderBy: { createdAt: "asc" } }),
  ]);
  return {
    clients: clients.map((c) => ({
      id: c.id,
      name: c.name,
      address: c.address,
      city: c.city,
      vehicles: c.vehicles.map((v) => ({ id: v.id, name: v.make, label: [v.year, v.make, v.model, v.color && `(${v.color})`].filter(Boolean).join(" ") })),
      memberships: c.memberships.map((m) => ({ id: m.id, label: m.plan.name })),
    })),
    services: services.map((s) => ({ id: s.id, name: s.name, price: s.price, durationMin: s.durationMin })),
    team: team.map((t) => ({ id: t.id, name: t.name })),
  };
}
