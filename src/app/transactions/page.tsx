import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ensureOnboarding } from "@/lib/services/auth";
import { requireAuthContext } from "@/lib/services/auth-context";
import { signOutAction } from "@/lib/auth/actions";
import { listTransactions, listAccounts, listCategories } from "@/lib/services";
import { transactionListQuerySchema } from "@/lib/validation/transaction";
import { TransactionsView } from "@/components/transactions/transactions-view";
import { summarizeTransactionLoads } from "@/components/transactions/transactions-load-state";
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
  // Malformed query strings must not 500 the page — fall back to a clean
  // default list (page 1, newest first) instead.
  const queryParsed = transactionListQuerySchema.safeParse(raw);
  const params: TransactionListQuery = queryParsed.success
    ? queryParsed.data
    : transactionListQuerySchema.parse({});

  // Load every panel independently so one failure still renders an error
  // panel (with retry) instead of a white-screen page error.
  const [txs, accounts, categories] = await Promise.allSettled([
    listTransactions(params),
    listAccounts(),
    listCategories(),
  ]);

  const result = txs.status === "fulfilled" ? txs.value : { items: [], total: 0, page: 1, pageSize: 20, pages: 1 };
  const { loadError, accountsError, categoriesError } = summarizeTransactionLoads(txs, accounts, categories);
  if (txs.status === "rejected") console.error("[transactions] list failed", txs.reason);
  if (accounts.status === "rejected") console.error("[transactions] accounts failed", accounts.reason);
  if (categories.status === "rejected") console.error("[transactions] categories failed", categories.reason);

  return (
    <TransactionsView
      result={result}
      params={params}
      accounts={accounts.status === "fulfilled" ? accounts.value : []}
      categories={categories.status === "fulfilled" ? categories.value : []}
      loadError={loadError}
      accountsError={accountsError}
      categoriesError={categoriesError}
      currency={ctx.business.currency}
      title="Transactions"
      userName={ctx.user.name ?? undefined}
      userEmail={ctx.user.email}
      businessName={ctx.business.name}
      onSignOut={signOutAction}
    />
  );
}