"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Badge } from "@/components/app/ui";
import { usd } from "@/lib/money";
import { setStage } from "./actions";
import { SOURCE_LABEL, STAGES, STAGE_COLOR, STAGE_LABEL, type SourceKey, type StageKey } from "./constants";

type PipelineClient = {
  id: string;
  name: string;
  city: string;
  source: string;
  stage: StageKey;
  leadAt: Date;
  firstReplyAt: Date | null;
  jobs: { price: number }[];
};

/** Desktop drag/drop with a deliberately visible mobile select fallback. */
export function CrmBoard({ clients }: { clients: PipelineClient[] }) {
  const [, startTransition] = useTransition();
  const move = (id: string, stage: StageKey) => startTransition(() => { void setStage(id, stage); });

  return (
    <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-4 md:mx-0 md:px-0">
      {STAGES.map((stage) => {
        const column = clients.filter((client) => client.stage === stage);
        const value = column.reduce((sum, client) => sum + client.jobs.reduce((jobSum, job) => jobSum + job.price, 0), 0);
        return (
          <section
            key={stage}
            className="w-72 shrink-0 snap-start rounded-xl border border-border bg-surface-2/60"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const id = event.dataTransfer.getData("text/plain");
              if (id) move(id, stage);
            }}
          >
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <Badge color={STAGE_COLOR[stage]}>{STAGE_LABEL[stage]}</Badge>
              <span className="text-right text-xs text-muted">{column.length} · {usd(value)}</span>
            </div>
            <div className="min-h-16 max-h-[65dvh] space-y-2 overflow-y-auto px-2 pb-2">
              {column.map((client) => (
                <article
                  key={client.id}
                  draggable
                  onDragStart={(event) => event.dataTransfer.setData("text/plain", client.id)}
                  className="rounded-lg border border-border bg-surface p-2.5"
                >
                  <Link href={`/crm/${client.id}`} className="block hover:text-brand">
                    <p className="text-sm font-semibold">{client.name}</p>
                    <p className="truncate text-xs text-muted">{[client.city, SOURCE_LABEL[client.source as SourceKey]].filter(Boolean).join(" · ")}</p>
                    {stage === "NEW" && !client.firstReplyAt && <p className="mt-1 text-xs font-semibold text-bad">No reply yet</p>}
                  </Link>
                  <select
                    aria-label={`Move ${client.name} to pipeline stage`}
                    className="mt-2 w-full rounded border border-border bg-surface px-2 py-1 text-xs md:hidden"
                    value={client.stage}
                    onChange={(event) => move(client.id, event.target.value as StageKey)}
                  >
                    {STAGES.map((option) => <option key={option} value={option}>{STAGE_LABEL[option]}</option>)}
                  </select>
                </article>
              ))}
              {!column.length && <p className="py-4 text-center text-xs text-muted">Drop here</p>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
