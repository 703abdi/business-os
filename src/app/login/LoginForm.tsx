"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginForm({ brandName, expired }: { brandName: string; expired: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(expired ? "Your session ended. Please sign in again." : null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Login failed");
        setLoading(false);
        return;
      }
      const from = params.get("from") || "";
      router.push(from.startsWith("/") && !from.startsWith("//") ? from : "/today");
      router.refresh();
    } catch {
      setError("Something went wrong. Try again.");
      setLoading(false);
    }
  }

  return <div className="min-h-screen w-full flex items-center justify-center px-4"><form onSubmit={onSubmit} className="w-full max-w-sm border border-border bg-surface rounded-lg p-8 shadow-sm"><h1 className="text-lg font-bold tracking-tight mb-1">{brandName}</h1><p className="text-sm text-muted mb-6">Business dashboard. Sign in to continue.</p><label className="block text-xs font-medium text-muted mb-1.5">Email</label><input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} className="w-full mb-4 rounded-md border border-border bg-surface px-3 py-2.5 text-base outline-none focus:border-muted-2 transition-colors" /><label className="block text-xs font-medium text-muted mb-1.5">Password</label><input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full mb-5 rounded-md border border-border bg-surface px-3 py-2.5 text-base outline-none focus:border-muted-2 transition-colors" />{error && <p className="text-sm text-bad mb-4" role="alert">{error}</p>}<button type="submit" disabled={loading} className="w-full rounded-md bg-brand text-white font-semibold text-sm py-2.5 disabled:opacity-50 transition-opacity">{loading ? "Signing in..." : "Sign in"}</button></form></div>;
}
