import { resolvePostAuthRedirect } from "@/lib/auth/redirect";
import { ensureOnboarding, needsOnboarding } from "@/lib/services/auth";

/**
 * Provision the profile + first business for a freshly verified email link and
 * resolve where the user should land next.
 *
 * Shared by the PKCE branch of `/auth/callback` and the `/auth/confirm` action,
 * so the OTP flow reaches exactly the same post-verification state as the code
 * flow. Only ever called with a genuinely authenticated session.
 *
 * An explicit `next` (e.g. `next=/reset-password` from the reset email) always
 * wins — a recovery session must land on the reset page. Otherwise brand-new
 * users go to onboarding and everyone else to the dashboard.
 */
export async function resolvePostVerificationTarget(
  rawNext: string | null,
  baseUrl: string,
): Promise<string> {
  // Idempotent: profile upsert + first-business lookup-or-create. Never bounce
  // to /onboarding from here — `next` may point at the password-reset page.
  await ensureOnboarding({ bounce: false }).catch(() => null);

  if (rawNext) return resolvePostAuthRedirect(rawNext, baseUrl);

  return (await needsOnboarding().catch(() => false))
    ? `${baseUrl}/onboarding`
    : `${baseUrl}/overview`;
}
