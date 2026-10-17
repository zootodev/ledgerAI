import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ensureOnboarding } from "@/lib/services/auth";
import { requireAuthContext } from "@/lib/services/auth-context";
import { signOutAction } from "@/lib/auth/actions";
import { getMfaStatus } from "@/lib/services/mfa";
import { SettingsShell } from "@/components/settings/settings-shell";
import { SecuritySettings } from "@/components/settings/security-settings";

export const metadata: Metadata = {
  title: "Security · Settings",
};

export default async function SettingsSecurityPage() {
  await ensureOnboarding();

  const ctx = await requireAuthContext().catch(() => null);
  if (!ctx) redirect("/login");

  const mfa = await getMfaStatus();
  const verifiedFactor = mfa.factors.find((factor) => factor.status === "verified");

  return (
    <SettingsShell
      active="security"
      userName={ctx.user.name ?? undefined}
      userEmail={ctx.user.email}
      businessName={ctx.business.name}
      onSignOut={signOutAction}
    >
      <SecuritySettings
        mfaEnabled={mfa.enabled}
        factorName={verifiedFactor?.friendlyName ?? null}
      />
    </SettingsShell>
  );
}
