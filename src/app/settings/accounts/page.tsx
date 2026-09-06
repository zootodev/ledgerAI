import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ensureOnboarding } from "@/lib/services/auth";
import { requireAuthContext } from "@/lib/services/auth-context";
import { signOutAction } from "@/lib/auth/actions";
import { listAccounts } from "@/lib/services";
import { SettingsShell } from "@/components/settings/settings-shell";
import { AccountsManager } from "@/components/settings/accounts-manager";

export const metadata: Metadata = {
  title: "Accounts · Settings",
};

export default async function SettingsAccountsPage() {
  await ensureOnboarding();

  const ctx = await requireAuthContext().catch(() => null);
  if (!ctx) redirect("/login");

  const accounts = await listAccounts();

  return (
    <SettingsShell
      active="accounts"
      userName={ctx.user.name ?? undefined}
      userEmail={ctx.user.email}
      businessName={ctx.business.name}
      onSignOut={signOutAction}
    >
      <AccountsManager accounts={accounts} currency={ctx.business.currency} />
    </SettingsShell>
  );
}