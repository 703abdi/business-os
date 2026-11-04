import { AdminNav } from "@/components/admin/AdminNav";

// Sales tools ported from LeadFlow (forms, pages, contacts, blasts, automations,
// insights). They keep their own light "tf-admin" look under the OS shell.
export const metadata = { title: "Sales tools" };
export const dynamic = "force-dynamic";

export default function SalesToolsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="tf-admin min-h-dvh bg-white text-[#262627]">
      <AdminNav />
      {children}
    </div>
  );
}
