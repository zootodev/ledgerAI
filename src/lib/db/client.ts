import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// The Prisma client connects to PostgreSQL through the @prisma/adapter-pg
// driver adapter (mandatory in Prisma 7). It uses the elevated (service)
// connection string, which BYPASSES Supabase RLS by design — RLS is the
// boundary for direct/data-plane access. Accordingly, every service-layer
// call must enforce tenant isolation (scoping to the authenticated user's
// business_id) and must never trust client-supplied IDs as the sole
// authority. See SUPABASE_RLS.md for the full auth->DB authorization flow.

// Keep the singleton on globalThis instead of a module-level `let` so that
// Next.js/Turbopack development hot reload reuses the same PrismaClient and
// underlying pg Pool. A module-scoped variable gets re-evaluated on reload,
// orphaning the previous client and pool without $disconnect() and churning
// connections; the pooler then sees stale sockets that surface as P1017.
type PrismaGlobal = { prisma?: PrismaClient };
const globalForPrisma = globalThis as unknown as PrismaGlobal;

// pg Pool settings tuned for the Supabase PgBouncer session-mode pooler the
// app connects to (pooler.supabase.com:5432). The primary P1017 trigger is the
// pooler closing an established idle connection: with TCP keepalive enabled,
// pg detects the dead socket at the transport layer and recycles the client,
// instead of the first query after an idle gap writing to a reset socket
// (ECONNRESET -> DriverAdapterError "ConnectionClosed"). maxUses rotates
// long-lived connections so they are refreshed rather than left to decay.
// connectionTimeoutMillis fails fast if the pooler is unreachable instead of
// hanging the request. SSL is intentionally left to pg defaults (the URL has
// no sslmode params; changing it risks breaking the current working link).
const PG_POOL_CONFIG = {
  keepAlive: true,
  keepAliveInitialDelayMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 30_000,
  max: 5,
  maxUses: 1_000,
  application_name: "ledgerai",
} as const;

/**
 * Returns a lazily-constructed shared PrismaClient. Constructs only when a
 * DATABASE_URL is present (so lint/typecheck/build stay green without a DB).
 * Use the service layer (src/lib/services) rather than calling this directly.
 */
export function getPrismaClient(): PrismaClient | null {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;

  const url = process.env.DATABASE_URL;
  if (!url) return null;

  const adapter = new PrismaPg(
    { ...PG_POOL_CONFIG, connectionString: url },
    {
      // Idle sockets dropped by the pooler are handled by pg itself; log a
      // compact, secret-free line instead of letting the pool 'error' event
      // go unobserved. This only fires on genuine pool failures, not per query.
      onPoolError: (error) => {
        console.warn("[db] pg pool error (connection recycled):", error.message);
      },
      // Connection errors during transactions are already surfaced to the
      // caller as query errors; keep this at debug level to avoid duplicating
      // every failure in production logs.
      onConnectionError: (error) => {
        console.debug("[db] pg connection error:", error.message);
      },
    },
  );
  globalForPrisma.prisma = new PrismaClient({ adapter });
  return globalForPrisma.prisma;
}

/** Convenience guard that throws a clear error only when a DB op is attempted. */
export function requirePrisma(): PrismaClient {
  const client = getPrismaClient();
  if (!client) {
    throw new Error("DATABASE_URL is not configured.");
  }
  return client;
}
