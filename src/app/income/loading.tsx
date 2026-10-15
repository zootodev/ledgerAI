import { PageLoading, TableSkeleton } from "@/components/layout/page-loading";

export default function IncomeLoading() {
  return (
    <PageLoading title="Income">
      <TableSkeleton />
    </PageLoading>
  );
}
