import type { Metadata } from "next";
import { TransactionsTypePage } from "@/components/transactions/type-page";

export const metadata: Metadata = {
  title: "Income",
};

export default async function IncomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <TransactionsTypePage type="income" title="Income" searchParams={searchParams} />;
}