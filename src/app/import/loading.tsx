import { PageLoading } from "@/components/layout/page-loading";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function ImportLoading() {
  return (
    <PageLoading title="Import">
      <Card className="p-6">
        <Skeleton className="h-5 w-48" height={20} />
        <Skeleton className="mt-4 h-28 w-full" height={112} />
        <div className="mt-4 flex flex-wrap gap-3">
          <Skeleton className="h-9 w-28" height={36} />
          <Skeleton className="h-9 w-28" height={36} />
        </div>
      </Card>
    </PageLoading>
  );
}
