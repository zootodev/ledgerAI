import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ensureOnboarding } from "@/lib/services/auth";
import { requireAuthContext } from "@/lib/services/auth-context";
import { signOutAction } from "@/lib/auth/actions";
import { getBusinessProfile } from "@/lib/services";
import { SettingsShell } from "@/components/settings/settings-shell";
import { BusinessSettings } from "@/components/settings/business-settings";

export const metadata: Metadata = {
  title: "Business · Settings",
};

export default async function SettingsBusinessPage() {
  await ensureOnboarding();

  const ctx = await requireAuthContext().catch(() => null);
  if (!ctx) redirect("/login");

  const business = await getBusinessProfile();

  return (
    <SettingsShell
      active="business"
      userName={ctx.user.name ?? undefined}
      userEmail={ctx.user.email}
      businessName={ctx.business.name}
      onSignOut={signOutAction}
    >
      <BusinessSettings business={business} />
    </SettingsShell>
  );
}