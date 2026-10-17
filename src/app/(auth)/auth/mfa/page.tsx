import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/server";
import { getAppBaseUrl } from "@/lib/auth/app-url";
import { resolveInternalNext } from "@/lib/auth/redirect";
import { getMfaStatus } from "@/lib/services/mfa";
import { MfaChallengeForm } from "@/components/auth/mfa-challenge-form";

export const metadata: Metadata = {
  title: "Two-step verification",
};

// The challenge depends on the live session's assurance level, so it can never
// be cached or statically rendered.
export const dynamic = "force-dynamic";

/**
 * Step-up challenge shown when an account has a verified second factor but the
 * just-created session is still at aal1 (password only). The proxy parks every
 * such session here, so this page is the only protected surface an aal1 session
 * can reach. Completing it promotes the session to aal2.
 */
export default async function MfaChallengePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const status = await getMfaStatus();

  // Nothing to challenge: 2FA isn't enabled, or this session already stepped up.
  if (!status.enabled || status.currentLevel === "aal2") redirect("/overview");

  // Pre-sanitize the target before it enters the hidden field: only an already
  // validated, same-origin path survives. `verifyMfaAction` re-validates the
  // posted value with the same allowlist, so neither hop trusts the client.
  const { next } = await searchParams;
  const nextPath =
    resolveInternalNext(typeof next === "string" ? next : null, await getAppBaseUrl()) ??
    "/overview";

  return <MfaChallengeForm next={nextPath} email={user.email} />;
}
