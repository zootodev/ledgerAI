import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ensureOnboarding } from "@/lib/services/auth";
import { requireAuthContext } from "@/lib/services/auth-context";
import { signOutAction } from "@/lib/auth/actions";
import { listCategories } from "@/lib/services";
import { SettingsShell } from "@/components/settings/settings-shell";
import { CategoriesManager } from "@/components/settings/categories-manager";

export const metadata: Metadata = {
  title: "Categories · Settings",
};

export default async function SettingsCategoriesPage() {
  await ensureOnboarding();

  const ctx = await requireAuthContext().catch(() => null);
  if (!ctx) redirect("/login");

  const categories = await listCategories();

  return (
    <SettingsShell
      active="categories"
      userName={ctx.user.name ?? undefined}
      userEmail={ctx.user.email}
      businessName={ctx.business.name}
      onSignOut={signOutAction}
    >
      <CategoriesManager categories={categories} />
    </SettingsShell>
  );
}