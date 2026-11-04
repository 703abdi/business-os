// Shared building blocks for the Business OS modules. Server- and client-safe.
import Link from "next/link";
import type { ReactNode } from "react";

export const btn = {
  primary:
    "inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50",
  outline:
    "inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3.5 py-2 text-sm font-medium hover:bg-surface-2 disabled:opacity-50",
  ghost: "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-surface-2 hover:text-foreground",
  danger:
    "inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-surface px-3.5 py-2 text-sm font-medium text-bad hover:bg-red-50",
  small: "inline-flex items-center justify-center gap-1 rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium hover:bg-surface-2",
};

export const input =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-[15px] placeholder:text-muted-2 focus:border-brand focus:outline-none md:text-sm";
export const label = "mb-1 block text-xs font-medium text-muted";

export function Page({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return <div className={`mx-auto w-full px-4 py-4 md:px-8 md:py-7 ${wide ? "max-w-7xl" : "max-w-6xl"}`}>{children}</div>;
}

export function PageHeader({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3 md:mb-6">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight md:text-2xl">{title}</h1>
        {sub && <p className="mt-0.5 text-sm text-muted">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, action, children, className = "", pad = true }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={`rounded-xl border border-border bg-surface ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
          <h2 className="text-sm font-semibold">{title}</h2>
          {action}
        </div>
      )}
      <div className={pad ? "p-4" : ""}>{children}</div>
    </section>
  );
}

type Tone = "default" | "good" | "warn" | "bad" | "brand";
const TONE_TEXT: Record<Tone, string> = {
  default: "text-foreground",
  good: "text-good",
  warn: "text-warn",
  bad: "text-bad",
  brand: "text-brand",
};

export function Stat({ label, value, sub, tone = "default", href }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone; href?: string }) {
  const body = (
    <>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums md:text-2xl ${TONE_TEXT[tone]}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </>
  );
  const cls = "block rounded-xl border border-border bg-surface px-3.5 py-3";
  return href ? (
    <Link href={href} className={`${cls} hover:border-brand`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

const BADGE: Record<string, string> = {
  gray: "bg-surface-2 text-muted",
  green: "bg-green-100 text-green-800",
  amber: "bg-amber-100 text-amber-900",
  red: "bg-red-100 text-red-800",
  blue: "bg-blue-100 text-blue-800",
  teal: "bg-brand-soft text-brand-dark",
  gold: "bg-yellow-100 text-yellow-900",
  purple: "bg-purple-100 text-purple-800",
};
export type BadgeColor = keyof typeof BADGE;

export function Badge({ children, color = "gray" }: { children: ReactNode; color?: BadgeColor }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${BADGE[color]}`}>{children}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted">{children}</p>;
}

export function Tabs({ tabs, current }: { tabs: { href: string; label: string; key: string }[]; current: string }) {
  return (
    <div className="-mx-4 mb-4 flex gap-1 overflow-x-auto border-b border-border px-4 md:mx-0 md:px-0">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${current === t.key ? "border-brand font-semibold text-brand" : "border-transparent text-muted hover:text-foreground"}`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

/** Thin progress bar toward a goal. */
export function Progress({ value, max, tone = "brand" }: { value: number; max: number; tone?: "brand" | "good" | "warn" }) {
  const w = Math.max(0, Math.min(100, max ? (value / max) * 100 : 0));
  const color = tone === "good" ? "bg-good" : tone === "warn" ? "bg-warn" : "bg-brand";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${w}%` }} />
    </div>
  );
}
