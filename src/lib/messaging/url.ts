// Public base URL of this deployment (same rule as the automations engine).
export function appUrl(): string {
  const u = process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  return (u || "http://localhost:3000").replace(/\/$/, "");
}
