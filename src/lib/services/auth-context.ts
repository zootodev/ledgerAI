import { getCurrentUser, type SessionUser } from "@/lib/auth/server";
import { getPrismaClient } from "@/lib/db/client";
import { retryOnTransient } from "@/lib/db/transient";

/** Raised when an authenticated owner context cannot be established. */
export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthorizationError";
  }
}

interface PrismaLike {
  business: {
    findFirst: (args: {
      where: { userId: string };
      orderBy: { createdAt: "asc" };
      select: { id: true; name: true; currency: true };
    }) => Promise<{ id: string; name: string; currency: string } | null>;
  };
}

/**
 * Resolve the session user's oldest business. Retried once on a transient
 * connection error (P1001/P1017/pool/timeout): the Supabase pooler can drop an
 * idle socket, and that should not sign a user out or crash a page. The userId
 * always comes from the authenticated session, never the client.
 */
async function findPrimaryBusiness(prisma: PrismaLike, userId: string) {
  return retryOnTransient(
    () =>
      prisma.business.findFirst({
        where: { userId },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, currency: true },
      }),
    {
      attempts: 2,
      onRetry: () =>
        console.warn("[auth-context] retrying business lookup after a transient DB error"),
    },
  );
}

/**
 * Resolve the authenticated user AND their active business. This is the
 * single source of truth for tenant isolation: every service-layer operation
 * must obtain its `businessId` here (from the session), never from the
 * client. Throws AuthorizationError when unauthenticated or the user has no
 * business yet.
 */
export async function requireAuthContext() {
  const user = await getCurrentUser();
  if (!user) throw new AuthorizationError("You must be signed in.");

  const prisma = getPrismaClient();
  if (!prisma) throw new Error("DATABASE_URL is not configured.");

  // Resolve the active business WITHOUT trusting any client input. We derive
  // it from the authenticated session: the user's first business (a single
  // business is the MVP default; multi-business is a later concern).
  const business = await findPrimaryBusiness(prisma as unknown as PrismaLike, user.id);

  if (!business) {
    throw new AuthorizationError("No business is set up for this account.");
  }

  return { user, business, prisma };
}

/** Non-throwing variant returning null when no context exists (e.g. nav). */
export async function getAuthContext() {
  const user = await getCurrentUser();
  if (!user) return null;
  const prisma = getPrismaClient();
  if (!prisma) return null;
  const business = await findPrimaryBusiness(prisma as unknown as PrismaLike, user.id);
  if (!business) return null;
  return { user, business, prisma };
}

export type { SessionUser };