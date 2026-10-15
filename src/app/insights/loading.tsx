import { PageLoading } from "@/components/layout/page-loading";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function InsightsLoading() {
  return (
    <PageLoading title="AI Insights">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="p-5">
            <Skeleton className="h-9 w-9" height={36} />
            <Skeleton className="mt-4 h-4 w-2/3" height={16} />
            <Skeleton className="mt-2 h-12 w-full" height={48} />
          </Card>
        ))}
      </div>
    </PageLoading>
  );
}
