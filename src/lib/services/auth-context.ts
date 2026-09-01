import { getCurrentUser, type SessionUser } from "@/lib/auth/server";
import { getPrismaClient } from "@/lib/db/client";

/** Raised when an authenticated owner context cannot be established. */
export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthorizationError";
  }
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
  const business = await prisma.business.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, currency: true },
  });

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
  const business = await prisma.business.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, currency: true },
  });
  if (!business) return null;
  return { user, business, prisma };
}

export type { SessionUser };