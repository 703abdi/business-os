"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/forms", label: "Forms" },
  { href: "/pages", label: "Pages" },
  { href: "/contacts", label: "Contacts" },
  { href: "/blasts", label: "Blasts" },
  { href: "/automations", label: "Automations" },
  { href: "/insights", label: "Insights" },
];

export function AdminNav() {
  const pathname = usePathname();
  // inside a form, the form's own header (Content / Workflow / Connect / Share / Results) takes over
  if (/^\/forms\/(?!import(?:\/|$))[^/]+/.test(pathname)) return null;
  return (
    <header className="z-30 border-b md:sticky md:top-0 border-[#e3e3e3] bg-white">
      <div className="flex h-14 items-center gap-2 px-4 sm:px-6">
        <Link href="/sales" className="mr-2 flex items-center gap-1 text-[14px] font-semibold text-[#5e5e5e] hover:text-[#262627]">
          ← Sales
        </Link>
        <nav className="flex h-full items-stretch gap-1 overflow-x-auto" aria-label="Main">
          {TABS.map((t) => {
            const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center border-b-2 px-3 text-[14px] whitespace-nowrap transition-colors",
                  active ? "border-[#262627] font-medium text-[#262627]" : "border-transparent text-[#5e5e5e] hover:text-[#262627]",
                )}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <a href="/api/forms/backup" className="hidden text-[13px] text-[#5e5e5e] hover:text-[#262627] md:inline">Backup</a>
        </div>
      </div>
    </header>
  );
}
