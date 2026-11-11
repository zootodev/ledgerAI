import { cache } from "react";
import { headers } from "next/headers";
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

/** The session user's primary (oldest) business, including onboarding state. */
export interface PrimaryBusiness {
  id: string;
  name: string;
  currency: string;
  /** Null means the auto-provisioned business has not finished onboarding. */
  type?: string | null;
}

interface PrismaLike {
  business: {
    findFirst: (args: {
      where: { userId: string };
      orderBy: { createdAt: "asc" };
      select: { id: true; name: true; currency: true; type: true };
    }) => Promise<PrimaryBusiness | null>;
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
        select: { id: true, name: true, currency: true, type: true },
      }),
    {
      attempts: 2,
      onRetry: () =>
        console.warn("[auth-context] retrying business lookup after a transient DB error"),
    },
  );
}

interface BusinessRequestState {
  loaded: boolean;
  value: PrimaryBusiness | null;
  promise: Promise<PrimaryBusiness | null> | null;
}

type BusinessStateMap = Map<string, BusinessRequestState>;

/**
 * Request-scoped state keyed by the request's Headers object.
 *
 * A Server Action and the re-render Next includes in its response run in
 * separate React render passes, so React cache() alone cannot dedupe between
 * them. They do, however, share the same request Headers object (Next memoizes
 * `headers()` per request). Using that object as a WeakMap key binds the cache
 * to one request without putting tenant data in module scope: entries become
 * unreachable as soon as the request's Headers object is collected. Entries are
 * also keyed by userId, so even a shared request can never return another
 * user's business.
 */
const statesByRequestHeaders = new WeakMap<object, BusinessStateMap>();

async function getStateMap(): Promise<BusinessStateMap> {
  try {
    const requestHeaders = await headers();
    let states = statesByRequestHeaders.get(requestHeaders);
    if (!states) {
      states = new Map();
      statesByRequestHeaders.set(requestHeaders, states);
    }
    return states;
  } catch {
    // No Next.js request (unit tests, scripts, or a non-request context):
    // there is no request to scope the cache to, so use a one-off map.
    return new Map();
  }
}

/**
 * React cache() dedupes within one render pass; the Headers-keyed map above
 * carries the same state into the re-render that a Server Action includes in
 * its response.
 */
const getBusinessRequestState = cache(async (userId: string): Promise<BusinessRequestState> => {
  const states = await getStateMap();
  let state = states.get(userId);
  if (!state) {
    state = { loaded: false, value: null, promise: null };
    states.set(userId, state);
  }
  return state;
});

/**
 * Read the authenticated user's primary business once per request. Every
 * service that needs a tenant reuses this value instead of issuing its own
 * `business.findFirst` (the Sentry N+1).
 */
export async function getPrimaryBusiness(userId: string): Promise<PrimaryBusiness | null> {
  const state = await getBusinessRequestState(userId);
  if (state.loaded) return state.value;

  if (!state.promise) {
    state.promise = (async () => {
      const prisma = getPrismaClient();
      if (!prisma) throw new Error("DATABASE_URL is not configured.");

      const business = await findPrimaryBusiness(prisma as unknown as PrismaLike, userId);
      state.value = business;
      state.loaded = true;
      return business;
    })();
  }

  return state.promise;
}

/**
 * Prime the request cache after onboarding creates the user's first business.
 * Without this, a request that creates a business would keep seeing the cached
 * "no business" read and redirect the brand-new user to /login.
 */
export async function seedPrimaryBusiness(
  userId: string,
  business: PrimaryBusiness,
): Promise<void> {
  const state = await getBusinessRequestState(userId);
  state.loaded = true;
  state.value = business;
  state.promise = Promise.resolve(business);
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
  const business = await getPrimaryBusiness(user.id);

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
  const business = await getPrimaryBusiness(user.id);
  if (!business) return null;
  return { user, business, prisma };
}

export type { SessionUser };