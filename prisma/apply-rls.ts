import "dotenv/config";
import pg from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const { Client } = pg;

// Applies prisma/rls.sql against the live Supabase database. The statements
// reference the Supabase-managed `auth` schema, so they run outside Prisma
// Migrate (which validates against a shadow DB lacking `auth`). Idempotent:
// safe to re-run (policies/FKs created with IF NOT EXISTS semantics via
// CREATE OR REPLACE / separate guards).

async function main() {
  // Admin/DDL work needs a session or direct connection; the runtime
  // DATABASE_URL is the transaction pooler (port 6543), which cannot run this.
  // Mirrors prisma.config.ts so CLI scripts share the same precedence.
  const c = new Client({
    connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  });
  await c.connect();
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const sql = readFileSync(path.join(here, "../prisma/rls.sql"), "utf8");
    await c.query(sql);
    console.log("Applied prisma/rls.sql successfully.");
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});