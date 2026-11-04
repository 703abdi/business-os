// Resolves the runtime database URL. DATABASE_URL wins; otherwise the
// variables Vercel's Supabase and Neon integrations create are used, so
// connecting a database from the Vercel dashboard needs no copy-pasting.
//
// Prisma's tables live in the "business_os" schema (see prisma/schema.prisma),
// while the sales-tool tables use the raw URL's public schema through src/lib/db.ts.
export const PRISMA_SCHEMA = "business_os";

export function rawDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.DATABASE_URL || env.POSTGRES_PRISMA_URL || env.POSTGRES_URL || env.POSTGRES_URL_NON_POOLING || env.DATABASE_URL_UNPOOLED || undefined;
}

export function runtimeDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const url = rawDatabaseUrl(env);
  return url ? withPrismaParams(url) : undefined;
}

// Supabase's transaction pooler (port 6543) can't hold prepared statements,
// so Prisma must be told it's talking to PgBouncer.
export function withPrismaParams(url: string) {
  try {
    const u = new URL(url);
    if (u.hostname.endsWith("pooler.supabase.com") && u.port === "6543" && !u.searchParams.has("pgbouncer")) {
      u.searchParams.set("pgbouncer", "true");
    }
    if (!u.searchParams.has("schema")) u.searchParams.set("schema", PRISMA_SCHEMA);
    return u.toString();
  } catch {
    // Not a URL Node can parse; hand it to Prisma unchanged.
    return url;
  }
}
