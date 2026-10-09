import { getSupabaseServer } from "@/lib/auth/supabase";
import { getAppBaseUrl } from "@/lib/auth/app-url";
import { getCurrentUser } from "@/lib/auth/server";
import { getPrismaClient } from "@/lib/db/client";
import { redirect } from "next/navigation";
import { profileUpdateSchema } from "@/lib/validation/index";
import { zErrorMessage } from "@/lib/validation/index";

export interface SignUpInput {
  email: string;
  password: string;
  name?: string;
  redirectTo?: string;
}

export interface SignInInput {
  email: string;
  password: string;
}

export type AuthResult =
  | { ok: true; session?: boolean; alreadyExists?: boolean }
  | { ok: false; error: string };

const EMAIL_ERROR = "Invalid email, password, or account not found.";

/**
 * Resolve an SSR Supabase client bound to the current request cookies.
 * @throws Error when Supabase isn't configured (app still runs without it).
 */
async function assertServerClient() {
  const client = await getSupabaseServer();
  if (!client) throw new Error("Supabase is not configured.");
  return client;
}

/**
 * Sign up a new user with Supabase Auth. On success a `public.users` profile
 * row is created (mirroring the Auth user id) so ownership/RLS can key on
 * it. When confirmation is enabled no session cookie is set yet and the app
 * shows a check-your-inbox message. Returns a client-safe result object.
 *
 * Supabase intentionally returns *no error* for an existing confirmed email
 * when email confirmation is enabled (anti-enumeration): it echoes an
 * obfuscated user object whose `identities` array is empty and sends no mail.
 * That case is surfaced as `alreadyExists` so callers never imply a new
 * account was created.
 */
export async function signUp(input: SignUpInput): Promise<AuthResult> {
  const supabase = await assertServerClient();

  const email = input.email.trim().toLowerCase();
  const redirectTo = input.redirectTo ?? `${(await getAppBaseUrl())}/auth/callback`;
  const { data, error } = await supabase.auth.signUp({
    email,
    password: input.password,
    options: {
      data: { name: input.name ?? null },
      emailRedirectTo: redirectTo,
    },
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const hasSession = Boolean(data.session);
  const authUser = data.user;

  // Existing confirmed email: no session is produced, and the echoed user
  // carries no identities. Nothing was created and nothing was emailed, so
  // neither a success nor a "you already have an account" claim is sent.
  if (
    !hasSession &&
    authUser &&
    Array.isArray(authUser.identities) &&
    authUser.identities.length === 0
  ) {
    return { ok: true, alreadyExists: true };
  }

  if (!authUser) {
    return { ok: false, error: "Unable to create your account. Please try again." };
  }

  // Provision the public.users profile row mirroring auth.users.id so RLS and
  // the service layer can resolve ownership. Best-effort: if it fails, the
  // auth user still exists and the profile is created on first login. Only
  // done when a real session was established (confirmations disabled).
  if (hasSession) {
    await syncUserProfile(authUser.id, authUser.email ?? email, input.name);
  }

  return { ok: true, session: hasSession };
}

/**
 * Sign an existing user in. The SSR client writes the session cookie into the
 * current response so subsequent server requests are authenticated.
 */
export async function signIn(input: SignInInput): Promise<AuthResult> {
  const supabase = await assertServerClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: input.email.trim().toLowerCase(),
    password: input.password,
  });

  if (error) {
    return { ok: false, error: EMAIL_ERROR };
  }

  return { ok: true };
}

/** Sign the current user out. */
export async function signOut(): Promise<void> {
  const supabaseServer = await getSupabaseServer();
  if (supabaseServer) await supabaseServer.auth.signOut();
}

/**
 * Request a password-reset email. The link leads through the existing auth
 * callback (which exchanges the PKCE code and sanitizes `next`) to the
 * /reset-password page, so the recovery session is established server-side.
 * Supabase intentionally returns success even for unknown emails, so this
 * never leaks whether an account exists — callers should show a neutral
 * message.
 */
export async function requestPasswordReset(
  email: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await assertServerClient();
  const redirectTo = `${(await getAppBaseUrl())}/auth/callback?next=/reset-password`;

  const { error } = await supabase.auth.resetPasswordForEmail(
    email.trim().toLowerCase(),
    { redirectTo },
  );

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Update the password for the currently authenticated (recovery) session.
 * The recovery session is only present after the user follows the emailed
 * link; the /reset-password page guards on it, and this service re-checks so
 * an expired/absent session is never silently accepted.
 */
export async function updatePassword(
  password: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      ok: false,
      error: "Your password-reset session has expired. Please request a new link.",
    };
  }

  const supabase = await assertServerClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false, error: error.message };

  // A password change means the old credential material is compromised —
  // revoke the refresh token on every *other* device so a stale stolen
  // session can't be refreshed. `scope: "others"` is verified against the
  // pinned @supabase/auth-js (2.112.4): it revokes other sessions but never
  // the current one (the SDK skips removing the local session for "others").
  // Best-effort: the password update already succeeded, so a revocation
  // failure is logged, not fatal.
  const { error: revokeError } = await supabase.auth.signOut({ scope: "others" });
  if (revokeError) {
    console.error("[auth] update-password: revoking other sessions failed", {
      error: revokeError.message,
    });
  }

  return { ok: true };
}

/**
 * Update the authenticated user's display name (Supabase metadata + the
 * public.users profile used for tenant ownership). Rejects on invalid input
 * or when no user is signed in.
 */
export async function updateOwnProfile(
  name: string,
): Promise<{ ok: boolean; error?: string }> {
  const parsed = profileUpdateSchema.safeParse({ name });
  if (!parsed.success) {
    return { ok: false, error: zErrorMessage(parsed.error) };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "You must be signed in." };
  }

  const supabase = await assertServerClient();
  const { error } = await supabase.auth.updateUser({
    data: { name: parsed.data.name },
  });
  if (error) return { ok: false, error: error.message };

  await syncUserProfile(user.id, user.email, parsed.data.name);
  return { ok: true };
}

/**
 * Ensure a `public.users` profile row exists for an authenticated Auth user.
 * Used at sign-in/sign-up so the app profile is always ready.
 */
export async function syncUserProfile(
  authUserId: string,
  email: string,
  name?: string | null,
) {
  const prisma = getPrismaClient();
  if (!prisma) return;

  await prisma.user.upsert({
    where: { id: authUserId },
    update: { email, name: name ?? undefined },
    create: { id: authUserId, email, name: name ?? null },
  });
}

/**
 * Create the user's first business (onboarding). Returns the created
 * business id; safe to call multiple times.
 */
export async function createInitialBusiness(input: {
  userId: string;
  name: string;
  type?: string | null;
  country?: string;
  currency?: string;
  size?: string | null;
}) {
  const prisma = getPrismaClient();
  if (!prisma) throw new Error("DATABASE_URL is not configured.");

  const existing = await prisma.business.findFirst({
    where: { userId: input.userId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (existing) return existing.id;

  const business = await prisma.business.create({
    data: {
      userId: input.userId,
      name: input.name,
      type: input.type ?? null,
      country: input.country ?? "NG",
      currency: input.currency ?? "NGN",
      size: input.size ?? null,
    },
    select: { id: true },
  });
  return business.id;
}

export interface EnsureOnboardingOptions {
  /**
   * Redirect to /onboarding when the business profile has no `type` yet —
   * the marker for an auto-provisioned, not-yet-set-up business. Defaults to
   * true so every app page gates on it. Pass false on the auth callback
   * (a `next=/reset-password` recovery must reach the reset page) and on the
   * onboarding page itself.
   */
  bounce?: boolean;
}

/**
 * Ensure the current user has a `public.users` profile row and at least one
 * business to scope the dashboard to. Called on first sign-in so tenant
 * isolation (which key on `users.id` and `business.user_id`) always holds.
 * Safe to call repeatedly; returns the session user or null when signed out.
 * When `bounce` is on (the default) an unfinished profile is redirected to
 * /onboarding — Next.js `redirect` throws, so callers relying on the return
 * value after an unfinished profile never continue past this point.
 */
export async function ensureOnboarding(
  options: EnsureOnboardingOptions = {},
): Promise<{ id: string; email: string } | null> {
  const { bounce = true } = options;
  const user = await getCurrentUser();
  if (!user) return null;

  await syncUserProfile(user.id, user.email, user.name);
  const businessName = user.name?.split(/\s+/).filter(Boolean)[0] || "My business";
  await createInitialBusiness({ userId: user.id, name: businessName });

  if (bounce) {
    const prisma = getPrismaClient();
    const business = prisma
      ? await prisma.business.findFirst({
          where: { userId: user.id },
          orderBy: { createdAt: "asc" },
          select: { type: true },
        })
      : null;
    if (business && business.type === null) redirect("/onboarding");
  }

  return { id: user.id, email: user.email };
}