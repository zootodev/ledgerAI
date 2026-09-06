import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ensureOnboarding } from "@/lib/services/auth";
import { requireAuthContext } from "@/lib/services/auth-context";
import { signOutAction } from "@/lib/auth/actions";
import { listCategoryRules } from "@/lib/services/rules";
import { SettingsShell } from "@/components/settings/settings-shell";
import { RulesManager } from "@/components/settings/rules-manager";

export const metadata: Metadata = {
  title: "Rules · Settings",
};

export default async function SettingsRulesPage() {
  await ensureOnboarding();

  const ctx = await requireAuthContext().catch(() => null);
  if (!ctx) redirect("/login");

  const rules = await listCategoryRules();

  return (
    <SettingsShell
      active="rules"
      userName={ctx.user.name ?? undefined}
      userEmail={ctx.user.email}
      businessName={ctx.business.name}
      onSignOut={signOutAction}
    >
      <RulesManager rules={rules} />
    </SettingsShell>
  );
}