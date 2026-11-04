"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useState } from "react";
import { BRAND } from "@/config/brand";
import { GROUP_LABELS, MODULES, activeModule, type ModuleEntry } from "@/modules/registry";
import { Icon } from "@/components/app/Icon";

const GROUPS = ["run", "grow", "money", "system"] as const;

export default function NavShell({ children, email, role, sampleData }: { children: ReactNode; email: string; role: "ADMIN" | "EMPLOYEE"; sampleData: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpenedFor, setMoreOpenedFor] = useState<string | null>(null);
  const active = activeModule(pathname);
  // Scope the sheet to the current URL. A route change naturally closes it
  // without a state-changing effect.
  const moreOpen = moreOpenedFor === pathname;

  async function logout() {
    const response = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    if (response.ok) {
      router.push("/login");
      router.refresh();
    }
  }

  const visibleModules = role === "ADMIN" ? MODULES : MODULES.filter((m) => ["today", "schedule", "content"].includes(m.key));
  const mobile = visibleModules.filter((m) => m.mobile);

  return (
    <div className="min-h-dvh md:pl-60">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col bg-ink text-white md:flex">
        <Link href="/today" className="flex items-center gap-2.5 px-5 py-5">
          <Logo />
          <span className="text-[15px] font-bold tracking-tight">{BRAND.name}</span>
        </Link>
        <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Main">
          {GROUPS.map((g) => {
            const groupModules = visibleModules.filter((m) => m.group === g);
            if (!groupModules.length) return null;
            return <div key={g} className="mb-4">
              <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/40">{GROUP_LABELS[g]}</p>
              {groupModules.map((m) => (
                <NavLink key={m.key} m={m} active={active === m.key} />
              ))}
            </div>;
          })}
        </nav>
        <div className="border-t border-white/10 px-5 py-3 text-xs text-white/60">
          <p className="truncate">{email}</p>
          <button onClick={logout} className="mt-1.5 flex items-center gap-1.5 text-white/80 hover:text-white">
            <Icon name="logout" className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>
      </aside>

      {/* Phone top bar */}
      <header className="sticky top-0 z-40 flex items-center justify-between bg-ink px-4 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] text-white md:hidden">
        <Link href="/today" className="flex items-center gap-2">
          <Logo />
          <span className="text-[15px] font-bold tracking-tight">{BRAND.name}</span>
        </Link>
        <Link href="/crm?new=1" className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold">
          <Icon name="plus" className="h-3.5 w-3.5" /> Lead
        </Link>
      </header>

      {sampleData && (
        <div className="border-b border-amber-300 bg-amber-100 px-4 py-1.5 text-center text-xs font-medium text-amber-900">
          Sample data. None of these clients or numbers are real.{" "}
          <Link href="/settings#sample" className="underline">
            Clear it
          </Link>
        </div>
      )}

      <main className="pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">{children}</main>

      {/* Phone bottom bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
        aria-label="Main"
      >
        {mobile.map((m) => (
          <Link
            key={m.key}
            href={m.href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${active === m.key ? "text-brand" : "text-muted"}`}
          >
            <Icon name={m.icon} className="h-5 w-5" />
            {m.label}
          </Link>
        ))}
        <button
          onClick={() => setMoreOpenedFor(pathname)}
          className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${mobile.some((m) => m.key === active) ? "text-muted" : "text-brand"}`}
        >
          <Icon name="menu" className="h-5 w-5" />
          More
        </button>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal aria-label="All modules">
          <button className="absolute inset-0 bg-black/40" aria-label="Close" onClick={() => setMoreOpenedFor(null)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-2xl bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-semibold">All modules</p>
              <button onClick={() => setMoreOpenedFor(null)} aria-label="Close" className="p-1 text-muted">
                <Icon name="close" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {visibleModules.map((m) => (
                <Link
                  key={m.key}
                  href={m.href}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-xs font-medium ${
                    active === m.key ? "border-brand bg-brand-soft text-brand" : "border-border"
                  }`}
                >
                  <Icon name={m.icon} className="h-6 w-6" />
                  {m.label}
                  {m.slot && <span className="text-[10px] text-muted-2">soon</span>}
                </Link>
              ))}
            </div>
            <button onClick={logout} className="mt-4 w-full rounded-lg border border-border py-2.5 text-sm text-muted">
              Sign out ({email})
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function NavLink({ m, active }: { m: ModuleEntry; active: boolean }) {
  return (
    <Link
      href={m.href}
      className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm ${
        active ? "bg-brand font-semibold text-white" : "text-white/75 hover:bg-white/5 hover:text-white"
      }`}
    >
      <Icon name={m.icon} className="h-4 w-4" />
      {m.label}
      {m.slot && <span className="ml-auto rounded bg-white/10 px-1.5 text-[10px] text-white/60">soon</span>}
    </Link>
  );
}

function Logo() {
  return (
    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand text-[12px] font-extrabold text-white">
      {BRAND.shortName}
    </span>
  );
}
