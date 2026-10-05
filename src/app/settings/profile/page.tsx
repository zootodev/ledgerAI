import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ensureOnboarding } from "@/lib/services/auth";
import { requireAuthContext } from "@/lib/services/auth-context";
import { signOutAction } from "@/lib/auth/actions";
import { SettingsShell } from "@/components/settings/settings-shell";
import { ProfileSettings } from "@/components/settings/profile-settings";

export const metadata: Metadata = {
  title: "Profile · Settings",
};

export default async function SettingsProfilePage() {
  await ensureOnboarding();

  const ctx = await requireAuthContext().catch(() => null);
  if (!ctx) redirect("/login");

  return (
    <SettingsShell
      active="profile"
      userName={ctx.user.name ?? undefined}
      userEmail={ctx.user.email}
      businessName={ctx.business.name}
      onSignOut={signOutAction}
    >
      <ProfileSettings
        initialName={ctx.user.name ?? ""}
        email={ctx.user.email}
      />
    </SettingsShell>
  );
}