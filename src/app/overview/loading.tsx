import { ChartSkeletons, KpiSkeletons, PageLoading } from "@/components/layout/page-loading";

export default function OverviewLoading() {
  return (
    <PageLoading title="Overview">
      <KpiSkeletons />
      <ChartSkeletons />
    </PageLoading>
  );
}
