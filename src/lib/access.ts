import type { UserRole } from "@/lib/auth";
export function canAccessPath(role: UserRole, path: string) { return role === "ADMIN" || ["/today", "/schedule", "/content", "/account"].some((prefix) => path === prefix || path.startsWith(`${prefix}/`)); }
