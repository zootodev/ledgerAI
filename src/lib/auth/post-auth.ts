import {
  MFA_CHALLENGE_PATH,
  needsMfaStepUp,
  readAalFromAccessToken,
  type FactorBearing,
} from "@/lib/auth/mfa";
import { resolvePostAuthRedirect } from "@/lib/auth/redirect";
import { ensureOnboarding, needsOnboarding } from "@/lib/services/auth";

/** The password-reset page — public, so the proxy never steps it up. */
const RESET_PASSWORD_PATH = "/reset-password";

/**
 * The session a verification just produced. Used only to decide whether the
 * account needs a second-factor step-up before it can reach its target.
 */
export interface VerifiedSession {
  /** The user returned by the provider on verification. */
  user: FactorBearing | null | undefined;
  /** The new session's access token (carries its `aal` claim). */
  accessToken: string | null | undefined;
}

/** True when a resolved (absolute) redirect target is the password-reset page. */
function isResetPasswordTarget(target: string, baseUrl: string): boolean {
  try {
    return new URL(target, baseUrl).pathname === RESET_PASSWORD_PATH;
  } catch {
    return false;
  }
}

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
 *
 * When the account has a verified factor, the freshly verified session is only
 * `aal1`. The proxy steps every *protected* route up to `aal2`, but
 * `/reset-password` is public — without this the recovery session would reach
 * Supabase's password update at `aal1`, which the provider refuses. Park on the
 * challenge first and carry the reset target through it.
 */
export async function resolvePostVerificationTarget(
  rawNext: string | null,
  baseUrl: string,
  session?: VerifiedSession,
): Promise<string> {
  // Idempotent: profile upsert + first-business lookup-or-create. Never bounce
  // to /onboarding from here — `next` may point at the password-reset page.
  await ensureOnboarding({ bounce: false }).catch(() => null);

  const target = rawNext
    ? resolvePostAuthRedirect(rawNext, baseUrl)
    : (await needsOnboarding().catch(() => false))
      ? `${baseUrl}/onboarding`
      : `${baseUrl}/overview`;

  if (
    session &&
    isResetPasswordTarget(target, baseUrl) &&
    needsMfaStepUp(session.user, readAalFromAccessToken(session.accessToken))
  ) {
    return `${baseUrl}${MFA_CHALLENGE_PATH}?next=${encodeURIComponent(RESET_PASSWORD_PATH)}`;
  }

  return target;
}
