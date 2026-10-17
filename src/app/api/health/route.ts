import { NextResponse } from "next/server";
import { getPrismaClient } from "@/lib/db/client";

/**
 * GET /api/health — liveness/readiness probe for uptime monitoring
 * (Section 5 — post-launch monitoring).
 *
 * Returns 200 when the process is up and the database answers a trivial
 * `SELECT 1`, or 503 when the database is unreachable. The body is a fixed,
 * non-sensitive shape — no versions, hosts, tenant data or error text — so it
 * can be public without leaking internals.
 *
 * The database check is memoized for a few seconds per instance so a tight
 * external poll can't turn the endpoint into a query amplifier.
 */

const DB_CHECK_TTL_MS = 5_000;
let lastCheck: { at: number; ok: boolean } | undefined;

async function databaseIsReachable(): Promise<boolean> {
  const now = Date.now();
  if (lastCheck && now - lastCheck.at < DB_CHECK_TTL_MS) {
    return lastCheck.ok;
  }
  let ok = false;
  try {
    const prisma = getPrismaClient();
    if (prisma) {
      await prisma.$queryRaw`SELECT 1`;
      ok = true;
    }
  } catch {
    ok = false;
  }
  lastCheck = { at: now, ok };
  return ok;
}

export async function GET() {
  const database = await databaseIsReachable();
  const body = {
    status: database ? "ok" : "degraded",
    checks: { database: database ? "ok" : "down" },
  };
  return NextResponse.json(body, {
    status: database ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
