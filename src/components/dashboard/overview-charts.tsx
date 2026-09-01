import { TrendingUp } from "lucide-react";
import { getAnalyticsTrends, type AnalyticsQuery, type AnalyticsTrends } from "@/lib/services";
import { BarChart } from "@/components/charts/bar-chart";
import { LineChart } from "@/components/charts/line-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";

export interface OverviewChartsProps {
  /** Already-validated page range; when omitted the charts show all time. */
  range?: AnalyticsQuery;
}

/**
 * Server-rendered analytics charts for the Overview page. Fetches the trend
 * service with the SAME validated range the KPI grid uses, so chart and KPI
 * numbers come from the same aggregation path and cannot diverge.
 */
export async function OverviewCharts({ range }: OverviewChartsProps) {
  let trends: AnalyticsTrends;
  try {
    trends = await getAnalyticsTrends({ ...(range ?? {}), groupBy: trendGroupBy(range) });
  } catch (err) {
    return (
      <ErrorState
        title="Couldn't load your charts"
        description={err instanceof Error ? err.message : undefined}
      />
    );
  }

  if (trends.points.length === 0) {
    return (
      <EmptyState
        icon={<TrendingUp className="h-6 w-6" />}
        title="No chart data yet"
        description="Add transactions to see revenue and profit trends here."
      />
    );
  }

  const data = trends.points.map((p) => ({
    label: p.label,
    revenue: p.revenue,
    expenses: p.expenses,
    netProfit: p.netProfit,
  }));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Revenue vs expenses</CardTitle>
        </CardHeader>
        <CardContent>
          <BarChart
            xKey="label"
            height={240}
            data={data}
            series={[
              { key: "revenue", name: "Revenue" },
              { key: "expenses", name: "Expenses" },
            ]}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Net profit trend</CardTitle>
        </CardHeader>
        <CardContent>
          <LineChart
            xKey="label"
            height={240}
            data={data}
            series={[{ key: "netProfit", name: "Net profit" }]}
          />
        </CardContent>
      </Card>
    </div>
  );
}

/** Skeleton chart cards shown while the trend data is loading. */
export function ChartsFallback() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {["Revenue vs expenses", "Net profit trend"].map((title) => (
        <Card key={title}>
          <CardHeader>
            <CardTitle>{title}</CardTitle>
          </CardHeader>
          <CardContent>
            <Skeleton height={240} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** Day granularity for short spans, otherwise monthly buckets. */
function trendGroupBy(range?: AnalyticsQuery): "day" | "month" {
  if (range?.dateFrom && range?.dateTo) {
    const start = new Date(`${range.dateFrom}T00:00:00.000Z`).getTime();
    const end = new Date(`${range.dateTo}T00:00:00.000Z`).getTime();
    if (Number.isFinite(start) && Number.isFinite(end) && end - start <= 45 * 86_400_000) {
      return "day";
    }
  }
  return "month";
}