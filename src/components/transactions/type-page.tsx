import { redirect } from "next/navigation";
import { ensureOnboarding } from "@/lib/services/auth";
import { requireAuthContext } from "@/lib/services/auth-context";
import { signOutAction } from "@/lib/auth/actions";
import { listTransactions, listAccounts, listCategories } from "@/lib/services";
import { transactionListQuerySchema } from "@/lib/validation/transaction";
import { TransactionsView } from "@/components/transactions/transactions-view";
import { summarizeTransactionLoads } from "@/components/transactions/transactions-load-state";

type SearchParamValue = string | string[] | undefined;

/** Server-rendered single-type list, shared by /income and /expenses. */
export async function TransactionsTypePage({
  type,
  title,
  searchParams,
}: {
  type: "income" | "expense";
  title: string;
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
  // The type is owned by the route, not the client — force it.
  raw.type = type;
  // Malformed query strings must not 500 the page — fall back to the route's
  // default list (page 1, newest first) while keeping the forced type.
  const queryParsed = transactionListQuerySchema.safeParse(raw);
  const params = queryParsed.success
    ? queryParsed.data
    : transactionListQuerySchema.parse({ type });

  // Load every panel independently so one failure still renders an error
  // panel (with retry) instead of a white-screen page error.
  const [txs, accounts, categories] = await Promise.allSettled([
    listTransactions(params),
    listAccounts(),
    listCategories(),
  ]);

  const result = txs.status === "fulfilled" ? txs.value : { items: [], total: 0, page: 1, pageSize: 20, pages: 1 };
  const { loadError, accountsError, categoriesError } = summarizeTransactionLoads(txs, accounts, categories);
  if (txs.status === "rejected") console.error("[type-page] list failed", txs.reason);
  if (accounts.status === "rejected") console.error("[type-page] accounts failed", accounts.reason);
  if (categories.status === "rejected") console.error("[type-page] categories failed", categories.reason);

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
      title={title}
      lockedType={type}
      userName={ctx.user.name ?? undefined}
      userEmail={ctx.user.email}
      businessName={ctx.business.name}
      onSignOut={signOutAction}
    />
  );
}