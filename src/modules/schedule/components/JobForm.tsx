"use client";

import { useState } from "react";
import { btn, input, label } from "@/components/app/ui";
import { Submit } from "@/components/app/client";

type Opt = { id: string; name: string };
export type JobFormProps = {
  action: (fd: FormData) => Promise<void>;
  clients: (Opt & { address: string; city: string; vehicles: (Opt & { label: string })[]; memberships: { id: string; label: string }[] })[];
  services: (Opt & { price: number; durationMin: number })[];
  team: Opt[];
  job?: {
    id: string; clientId: string; vehicleId: string | null; serviceId: string | null; membershipId: string | null; assigneeId: string | null;
    title: string; price: number; startAt: string; durationMin: number; address: string; city: string; notes: string;
  };
  defaults: { clientId?: string; startAt: string };
};

export function JobForm({ action, clients, services, team, job, defaults }: JobFormProps) {
  const [clientId, setClientId] = useState(job?.clientId ?? defaults.clientId ?? "");
  const [price, setPrice] = useState(String(job?.price ?? ""));
  const [duration, setDuration] = useState(String(job?.durationMin ?? 180));
  const [membershipId, setMembershipId] = useState(job?.membershipId ?? "");
  const client = clients.find((c) => c.id === clientId);

  return (
    <form action={action} className="grid gap-3 md:grid-cols-2">
      {job && <input type="hidden" name="id" value={job.id} />}
      <div className="md:col-span-2">
        <label className={label}>Client *</label>
        <select name="clientId" required value={clientId} onChange={(e) => setClientId(e.target.value)} className={input}>
          <option value="">Pick a client...</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}{c.city ? ` (${c.city})` : ""}</option>)}
        </select>
      </div>
      <div>
        <label className={label}>Service</label>
        <select
          name="serviceId"
          defaultValue={job?.serviceId ?? ""}
          className={input}
          onChange={(e) => {
            const s = services.find((x) => x.id === e.target.value);
            if (s) {
              if (!membershipId) setPrice(String(s.price));
              setDuration(String(s.durationMin));
            }
          }}
        >
          <option value="">Custom</option>
          {services.map((s) => <option key={s.id} value={s.id}>{s.name} (${s.price})</option>)}
        </select>
      </div>
      <div>
        <label className={label}>Reference</label>
        <select name="vehicleId" defaultValue={job?.vehicleId ?? ""} className={input} key={clientId}>
          <option value="">{client?.vehicles.length ? "Pick..." : "None on file"}</option>
          {client?.vehicles.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
        </select>
      </div>
      {client && client.memberships.length > 0 && (
        <div className="md:col-span-2">
          <label className={label}>Member visit?</label>
          <select
            name="membershipId"
            value={membershipId}
            onChange={(e) => {
              setMembershipId(e.target.value);
              if (e.target.value) setPrice("0");
            }}
            className={input}
          >
            <option value="">No, charge for this job</option>
            {client.memberships.map((m) => <option key={m.id} value={m.id}>Yes: {m.label} (covered by plan)</option>)}
          </select>
        </div>
      )}
      <div>
        <label className={label}>Date and time *</label>
        <input type="datetime-local" name="startAt" required defaultValue={job?.startAt ?? defaults.startAt} className={input} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={label}>Price ($)</label>
          <input name="price" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} className={input} />
        </div>
        <div>
          <label className={label}>Minutes</label>
          <input name="durationMin" inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value)} className={input} />
        </div>
      </div>
      <div>
        <label className={label}>Assigned to</label>
        <select name="assigneeId" defaultValue={job?.assigneeId ?? ""} className={input}>
          <option value="">Unassigned</option>
          {team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      <div>
        <label className={label}>Title (optional)</label>
        <input name="title" defaultValue={job?.title} className={input} placeholder="Uses the service name if blank" />
      </div>
      <div>
        <label className={label}>Address</label>
        <input name="address" defaultValue={job?.address ?? ""} placeholder={client?.address || "Client's address"} className={input} key={`a${clientId}`} />
      </div>
      <div>
        <label className={label}>City</label>
        <input name="city" defaultValue={job?.city ?? ""} placeholder={client?.city || ""} className={input} key={`c${clientId}`} />
      </div>
      <div className="md:col-span-2">
        <label className={label}>Notes for the crew</label>
        <textarea name="notes" rows={2} defaultValue={job?.notes} className={input} placeholder="Gate code, water spigot on left side, dog in yard..." />
      </div>
      {!job && (
        <label className="flex items-center gap-2 text-sm md:col-span-2">
          <input type="checkbox" name="confirmed" className="h-4 w-4" /> Client already confirmed
        </label>
      )}
      <div className="md:col-span-2">
        <Submit className={btn.primary}>{job ? "Save changes" : "Book job"}</Submit>
      </div>
    </form>
  );
}
