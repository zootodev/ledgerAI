import type { Metadata } from "next";
import { TransactionsTypePage } from "@/components/transactions/type-page";

export const metadata: Metadata = {
  title: "Expenses",
};

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <TransactionsTypePage type="expense" title="Expenses" searchParams={searchParams} />;
}