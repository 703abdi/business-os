"use client";

// Small client helpers used by server-rendered module pages.
import { useFormStatus } from "react-dom";
import { useState, type ReactNode } from "react";

/** A <select> that submits its form as soon as it changes. */
export function AutoSelect({ name, defaultValue, options, className }: { name: string; defaultValue: string; options: { value: string; label: string }[]; className?: string }) {
  return (
    <select name={name} defaultValue={defaultValue} className={className} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** A checkbox that submits its form as soon as it changes. */
export function AutoCheck({ name, defaultChecked, label }: { name: string; defaultChecked: boolean; label: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="h-5 w-5 accent-[var(--brand)]" onChange={(e) => e.currentTarget.form?.requestSubmit()} />
      {label}
    </label>
  );
}

export function Submit({ children, className, pending = "Saving..." }: { children: ReactNode; className?: string; pending?: string }) {
  const { pending: busy } = useFormStatus();
  return (
    <button type="submit" disabled={busy} className={className}>
      {busy ? pending : children}
    </button>
  );
}

/** Submit button that asks first. */
export function ConfirmSubmit({ children, className, message }: { children: ReactNode; className?: string; message: string }) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}

/** Collapsible section; starts closed unless `open`. */
export function Disclosure({ summary, children, open = false, className = "" }: { summary: ReactNode; children: ReactNode; open?: boolean; className?: string }) {
  const [isOpen, setOpen] = useState(open);
  return (
    <div className={className}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between text-left text-sm font-semibold">
        {summary}
        <span className="text-muted">{isOpen ? "−" : "+"}</span>
      </button>
      {isOpen && <div className="mt-3">{children}</div>}
    </div>
  );
}

/** Copy text to the clipboard (scripts, review links). */
export function CopyButton({ text, label = "Copy", className }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        await navigator.clipboard.writeText(text).catch(() => {});
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? "Copied" : label}
    </button>
  );
}
