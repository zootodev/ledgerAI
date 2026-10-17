import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ensureOnboarding } from "@/lib/services/auth";
import { requireAuthContext } from "@/lib/services/auth-context";
import { signOutAction } from "@/lib/auth/actions";
import { SettingsShell } from "@/components/settings/settings-shell";
import { AccountSettings } from "@/components/settings/account-settings";

export const metadata: Metadata = {
  title: "Account · Settings",
};

export default async function SettingsAccountPage() {
  await ensureOnboarding();

  const ctx = await requireAuthContext().catch(() => null);
  if (!ctx) redirect("/login");

  return (
    <SettingsShell
      active="account"
      userName={ctx.user.name ?? undefined}
      userEmail={ctx.user.email}
      businessName={ctx.business.name}
      onSignOut={signOutAction}
    >
      <AccountSettings email={ctx.user.email} />
    </SettingsShell>
  );
}
