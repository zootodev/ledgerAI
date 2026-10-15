import { PageLoading, TableSkeleton } from "@/components/layout/page-loading";

export default function ExpensesLoading() {
  return (
    <PageLoading title="Expenses">
      <TableSkeleton />
    </PageLoading>
  );
}
