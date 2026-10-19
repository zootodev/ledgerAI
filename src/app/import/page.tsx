import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ensureOnboarding } from "@/lib/services/auth";
import {
  requireAuthContext,
  AuthorizationError,
} from "@/lib/services/auth-context";
import { signOutAction } from "@/lib/auth/actions";
import { listAccounts, listCategories, listImportHistory } from "@/lib/services";
import { ImportWizard } from "@/components/import/import-wizard";
import { ImportLoadError } from "@/components/import/import-load-error";
import { reportHandledError } from "@/lib/observability/server-report";
import { isNextControlFlowError } from "@/lib/utils/next-errors";

export const metadata: Metadata = {
  title: "Import transactions",
};

export default async function ImportPage() {
  // Resolve the session + business. A transient DB failure here must NOT be
  // treated as "signed out" (that would sign the user out on a blip) nor crash
  // to the global error page: catch it, report it as handled, and render an
  // inline retry. Next.js control-flow (redirect from onboarding) is rethrown.
  let ctx: Awaited<ReturnType<typeof requireAuthContext>>;
  try {
    await ensureOnboarding();
    ctx = await requireAuthContext();
  } catch (error) {
    if (isNextControlFlowError(error)) throw error;
    if (error instanceof AuthorizationError) redirect("/login");
    reportHandledError("import.load.context", error);
    return <ImportLoadError onSignOut={signOutAction} />;
  }

  let accounts: Awaited<ReturnType<typeof listAccounts>>;
  let categories: Awaited<ReturnType<typeof listCategories>>;
  let histories: Awaited<ReturnType<typeof listImportHistory>>;
  try {
    [accounts, categories, histories] = await Promise.all([
      listAccounts(),
      listCategories(),
      listImportHistory(20),
    ]);
  } catch (error) {
    if (isNextControlFlowError(error)) throw error;
    reportHandledError("import.load.data", error);
    return (
      <ImportLoadError
        userName={ctx.user.name ?? undefined}
        userEmail={ctx.user.email}
        onSignOut={signOutAction}
      />
    );
  }

  return (
    <ImportWizard
      accounts={accounts}
      categories={categories}
      histories={histories}
      currency={ctx.business.currency}
      businessId={ctx.business.id}
      userName={ctx.user.name ?? undefined}
      userEmail={ctx.user.email}
      businessName={ctx.business.name}
      onSignOut={signOutAction}
    />
  );
}
