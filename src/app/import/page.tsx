import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ensureOnboarding } from "@/lib/services/auth";
import { requireAuthContext } from "@/lib/services/auth-context";
import { signOutAction } from "@/lib/auth/actions";
import { listAccounts, listCategories, listImportHistory } from "@/lib/services";
import { ImportWizard } from "@/components/import/import-wizard";

export const metadata: Metadata = {
  title: "Import transactions",
};

export default async function ImportPage() {
  await ensureOnboarding();

  const ctx = await requireAuthContext().catch(() => null);
  if (!ctx) redirect("/login");

  const [accounts, categories, histories] = await Promise.all([
    listAccounts(),
    listCategories(),
    listImportHistory(20),
  ]);

  return (
    <ImportWizard
      accounts={accounts}
      categories={categories}
      histories={histories}
      currency={ctx.business.currency}
      userName={ctx.user.name ?? undefined}
      userEmail={ctx.user.email}
      businessName={ctx.business.name}
      onSignOut={signOutAction}
    />
  );
}