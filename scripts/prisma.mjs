// Runs the Prisma CLI against the "business_os" schema: `node scripts/prisma.mjs migrate dev --name x`.
// Reads .env / .env.local, then adds ?schema=business_os to DATABASE_URL like the app does.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

for (const f of [".env.local", ".env"]) if (existsSync(f)) process.loadEnvFile(f);
const url = process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL;
if (!url) {
  console.error("Set DATABASE_URL in .env.local first.");
  process.exit(1);
}
const u = new URL(url);
if (!u.searchParams.has("schema")) u.searchParams.set("schema", "business_os");
const r = spawnSync("prisma", process.argv.slice(2), {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, PATH: `node_modules/.bin:${process.env.PATH}`, DATABASE_URL: u.toString() },
});
process.exit(r.status ?? 1);
