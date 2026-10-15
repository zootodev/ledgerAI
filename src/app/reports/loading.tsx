import { ChartSkeletons, PageLoading } from "@/components/layout/page-loading";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function ReportsLoading() {
  return (
    <PageLoading title="Reports">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="p-5">
            <Skeleton className="h-3.5 w-24" height={14} />
            <Skeleton className="mt-3 h-6 w-28" height={24} />
          </Card>
        ))}
      </div>
      <ChartSkeletons />
    </PageLoading>
  );
}
