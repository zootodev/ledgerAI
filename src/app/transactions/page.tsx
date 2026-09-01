import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ensureOnboarding } from "@/lib/services/auth";
import { requireAuthContext } from "@/lib/services/auth-context";
import { signOutAction } from "@/lib/auth/actions";
import { listTransactions, listAccounts, listCategories } from "@/lib/services";
import { transactionListQuerySchema } from "@/lib/validation/transaction";
import { TransactionsView } from "@/components/transactions/transactions-view";
import type { TransactionListQuery } from "@/lib/validation/transaction";

export const metadata: Metadata = {
  title: "Transactions",
};

type SearchParamValue = string | string[] | undefined;

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, SearchParamValue>>;
}) {
  await ensureOnboarding();

  const ctx = await requireAuthContext().catch(() => null);
  if (!ctx) redirect("/login");

  const sp = await searchParams;
  const raw: Record<string, string> = {};
  for (const [key, value] of Object.entries(sp)) {
    if (typeof value === "string" && value !== "") raw[key] = value;
  }
  const params: TransactionListQuery = transactionListQuerySchema.parse(raw);

  const [result, accounts, categories] = await Promise.all([
    listTransactions(params),
    listAccounts(),
    listCategories(),
  ]);

  return (
    <TransactionsView
      result={result}
      params={params}
      accounts={accounts}
      categories={categories}
      currency={ctx.business.currency}
      title="Transactions"
      userName={ctx.user.name ?? undefined}
      userEmail={ctx.user.email}
      businessName={ctx.business.name}
      onSignOut={signOutAction}
    />
  );
}