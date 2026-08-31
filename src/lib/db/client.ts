import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// The Prisma client connects to PostgreSQL through the @prisma/adapter-pg
// driver adapter (mandatory in Prisma 7). It uses the elevated (service)
// connection string, which BYPASSES Supabase RLS by design — RLS is the
// boundary for direct/data-plane access. Accordingly, every service-layer
// call must enforce tenant isolation (scoping to the authenticated user's
// business_id) and must never trust client-supplied IDs as the sole
// authority. See SUPABASE_RLS.md for the full auth->DB authorization flow.

let prisma: PrismaClient | null = null;

/**
 * Returns a lazily-constructed shared PrismaClient. Constructs only when a
 * DATABASE_URL is present (so lint/typecheck/build stay green without a DB).
 * Use the service layer (src/lib/services) rather than calling this directly.
 */
export function getPrismaClient(): PrismaClient | null {
  if (prisma) return prisma;

  const url = process.env.DATABASE_URL;
  if (!url) return null;

  const adapter = new PrismaPg({ connectionString: url });
  prisma = new PrismaClient({ adapter });
  return prisma;
}

/** Convenience guard that throws a clear error only when a DB op is attempted. */
export function requirePrisma(): PrismaClient {
  const client = getPrismaClient();
  if (!client) {
    throw new Error("DATABASE_URL is not configured.");
  }
  return client;
}
