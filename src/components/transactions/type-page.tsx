import { redirect } from "next/navigation";
import { ensureOnboarding } from "@/lib/services/auth";
import { requireAuthContext } from "@/lib/services/auth-context";
import { signOutAction } from "@/lib/auth/actions";
import { listTransactions, listAccounts, listCategories } from "@/lib/services";
import { transactionListQuerySchema } from "@/lib/validation/transaction";
import { TransactionsView } from "@/components/transactions/transactions-view";

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
  const params = transactionListQuerySchema.parse(raw);

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
      title={title}
      lockedType={type}
      userName={ctx.user.name ?? undefined}
      userEmail={ctx.user.email}
      businessName={ctx.business.name}
      onSignOut={signOutAction}
    />
  );
}