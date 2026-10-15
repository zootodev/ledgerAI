import { PageLoading, TableSkeleton } from "@/components/layout/page-loading";

export default function TransactionsLoading() {
  return (
    <PageLoading title="Transactions">
      <TableSkeleton />
    </PageLoading>
  );
}
