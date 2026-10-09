import { Download } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatAmount } from "@/lib/finance/engine";
import { getReportData } from "@/lib/services/reports";
import type {
  CategoryReport,
  ProfitReport,
  ReportsQuery,
  TypeReport,
} from "@/lib/services/reports";
import type { AnalyticsSummary, AnalyticsTrends } from "@/lib/services/analytics";
import { cn } from "@/lib/utils/cn";

function exportHref(type: string, range?: ReportsQuery): string {
  const qs = new URLSearchParams();
  qs.set("type", type);
  if (range?.dateFrom) qs.set("from", range.dateFrom);
  if (range?.dateTo) qs.set("to", range.dateTo);
  return `/reports/export?${qs.toString()}`;
}

function ExportCsvLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      download
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-button border border-border-strong",
        "bg-surface px-3 text-sm font-medium text-foreground",
        "transition-colors hover:bg-surface-subtle",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
        "print:hidden",
      )}
    >
      <Download className="h-4 w-4" aria-hidden="true" />
      Export CSV
    </a>
  );
}

function percent(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

const cellNumber = "text-right tabular-nums";

function SummarySection({
  summary,
  currency,
  range,
}: {
  summary: AnalyticsSummary;
  currency: string;
  range?: ReportsQuery;
}) {
  const rows: Array<[string, string]> = [
    ["Revenue", formatAmount(summary.revenue, currency)],
    ["Expenses", formatAmount(summary.expenses, currency)],
    ["Transfers", formatAmount(summary.transfers, currency)],
    ["Net profit", formatAmount(summary.netProfit, currency)],
    ["Profit margin", percent(summary.profitMargin)],
    ["Cash balance", formatAmount(summary.cashBalance, currency)],
  ];
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Summary</CardTitle>
            <p className="mt-0.5 text-sm text-muted">
              {summary.period.from && summary.period.to
                ? `${summary.period.from} – ${summary.period.to}`
                : summary.period.from || summary.period.to
                  ? summary.period.from
                    ? `From ${summary.period.from}`
                    : `Up to ${summary.period.to}`
                  : "All time"}
            </p>
          </div>
          <ExportCsvLink href={exportHref("summary", range)} />
        </div>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label} className="border-b border-border last:border-0">
                <td className="py-2.5 text-muted">{label}</td>
                <td className="py-2.5 text-right font-medium text-foreground tabular-nums">
                  {value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-muted">
          Cash balance is as of the &quot;to&quot; date.
        </p>
      </CardContent>
    </Card>
  );
}

function MonthlySection({
  trends,
  currency,
  range,
}: {
  trends: AnalyticsTrends;
  currency: string;
  range?: ReportsQuery;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Monthly profit &amp; loss</CardTitle>
            <p className="mt-0.5 text-sm text-muted">
              Income, expenses and net result per month.
            </p>
          </div>
          <ExportCsvLink href={exportHref("monthly", range)} />
        </div>
      </CardHeader>
      <CardContent>
        {trends.points.length === 0 ? (
          <p className="text-sm text-muted">
            No transactions in this period.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-max text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th scope="col" className="py-2 pr-4 text-xs font-medium uppercase tracking-wide text-muted">
                    Month
                  </th>
                  <th scope="col" className="py-2 px-4 text-right text-xs font-medium uppercase tracking-wide text-muted">
                    Revenue
                  </th>
                  <th scope="col" className="py-2 px-4 text-right text-xs font-medium uppercase tracking-wide text-muted">
                    Expenses
                  </th>
                  <th scope="col" className="py-2 px-4 text-right text-xs font-medium uppercase tracking-wide text-muted">
                    Transfers
                  </th>
                  <th scope="col" className="py-2 px-4 text-right text-xs font-medium uppercase tracking-wide text-muted">
                    Net profit
                  </th>
                  <th scope="col" className="py-2 pl-4 text-right text-xs font-medium uppercase tracking-wide text-muted">
                    Margin
                  </th>
                </tr>
              </thead>
              <tbody>
                {trends.points.map((p) => (
                  <tr key={p.key} className="border-b border-border last:border-0">
                    <td className="py-2.5 pr-4 text-foreground">{p.label}</td>
                    <td className={cn(cellNumber, "py-2.5 px-4 text-success")}>
                      {formatAmount(p.revenue, currency)}
                    </td>
                    <td className={cn(cellNumber, "py-2.5 px-4 text-danger")}>
                      {formatAmount(p.expenses, currency)}
                    </td>
                    <td className={cn(cellNumber, "py-2.5 px-4 text-muted")}>
                      {formatAmount(p.transfers, currency)}
                    </td>
                    <td className={cn(cellNumber, "py-2.5 px-4 font-medium text-foreground")}>
                      {formatAmount(p.netProfit, currency)}
                    </td>
                    <td className={cn(cellNumber, "py-2.5 pl-4 text-muted")}>
                      {percent(p.profitMargin)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CategorySection({
  report,
  currency,
  range,
}: {
  report: CategoryReport;
  currency: string;
  range?: ReportsQuery;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Category breakdown</CardTitle>
            <p className="mt-0.5 text-sm text-muted">
              Income and expenses split by category, with each category&apos;s
              share of its type total. Transfers excluded.
            </p>
          </div>
          <ExportCsvLink href={exportHref("category", range)} />
        </div>
      </CardHeader>
      <CardContent>
        {report.rows.length === 0 ? (
          <p className="text-sm text-muted">
            No categorized income or expenses in this period.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-max text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th scope="col" className="py-2 pr-4 text-xs font-medium uppercase tracking-wide text-muted">
                    Type
                  </th>
                  <th scope="col" className="py-2 px-4 text-xs font-medium uppercase tracking-wide text-muted">
                    Category
                  </th>
                  <th scope="col" className="py-2 px-4 text-right text-xs font-medium uppercase tracking-wide text-muted">
                    Amount
                  </th>
                  <th scope="col" className="py-2 pl-4 text-right text-xs font-medium uppercase tracking-wide text-muted">
                    % of type
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={`${r.type}-${r.categoryId ?? "none"}`} className="border-b border-border last:border-0">
                    <td className="py-2.5 pr-4 capitalize text-muted">{r.type}</td>
                    <td className="py-2.5 px-4 text-foreground">{r.name}</td>
                    <td className={cn(cellNumber, "py-2.5 px-4 font-medium text-foreground")}>
                      {formatAmount(r.amount, currency)}
                    </td>
                    <td className={cn(cellNumber, "py-2.5 pl-4 text-muted")}>
                      {percent(r.share)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Income statement: revenue by category with the period total. */
function IncomeStatementSection({
  report,
  currency,
  range,
}: {
  report: TypeReport;
  currency: string;
  range?: ReportsQuery;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Income statement</CardTitle>
            <p className="mt-0.5 text-sm text-muted">
              Revenue by category for the period, with each category&apos;s share
              of total revenue. Transfers excluded.
            </p>
          </div>
          <ExportCsvLink href={exportHref("income", range)} />
        </div>
      </CardHeader>
      <CardContent>
        {report.rows.length === 0 ? (
          <p className="text-sm text-muted">No income in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-max text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th scope="col" className="py-2 pr-4 text-xs font-medium uppercase tracking-wide text-muted">
                    Category
                  </th>
                  <th scope="col" className="py-2 px-4 text-right text-xs font-medium uppercase tracking-wide text-muted">
                    Amount
                  </th>
                  <th scope="col" className="py-2 pl-4 text-right text-xs font-medium uppercase tracking-wide text-muted">
                    % of revenue
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={r.categoryId ?? "none"} className="border-b border-border">
                    <td className="py-2.5 pr-4 text-foreground">{r.name}</td>
                    <td className={cn(cellNumber, "py-2.5 px-4 font-medium text-success")}>
                      {formatAmount(r.amount, currency)}
                    </td>
                    <td className={cn(cellNumber, "py-2.5 pl-4 text-muted")}>
                      {percent(r.share)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-border">
                  <td className="py-2.5 pr-4 font-medium text-foreground">Total revenue</td>
                  <td className={cn(cellNumber, "py-2.5 px-4 font-semibold text-success")}>
                    {formatAmount(report.total, currency)}
                  </td>
                  <td className={cn(cellNumber, "py-2.5 pl-4 text-muted")}>100%</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Expense breakdown: expenses by category with the period total. */
function ExpenseBreakdownSection({
  report,
  currency,
  range,
}: {
  report: TypeReport;
  currency: string;
  range?: ReportsQuery;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Expense breakdown</CardTitle>
            <p className="mt-0.5 text-sm text-muted">
              Expenses by category for the period, with each category&apos;s
              share of total expenses. Transfers excluded.
            </p>
          </div>
          <ExportCsvLink href={exportHref("expense", range)} />
        </div>
      </CardHeader>
      <CardContent>
        {report.rows.length === 0 ? (
          <p className="text-sm text-muted">No expenses in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-max text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th scope="col" className="py-2 pr-4 text-xs font-medium uppercase tracking-wide text-muted">
                    Category
                  </th>
                  <th scope="col" className="py-2 px-4 text-right text-xs font-medium uppercase tracking-wide text-muted">
                    Amount
                  </th>
                  <th scope="col" className="py-2 pl-4 text-right text-xs font-medium uppercase tracking-wide text-muted">
                    % of expenses
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={r.categoryId ?? "none"} className="border-b border-border">
                    <td className="py-2.5 pr-4 text-foreground">{r.name}</td>
                    <td className={cn(cellNumber, "py-2.5 px-4 font-medium text-danger")}>
                      {formatAmount(r.amount, currency)}
                    </td>
                    <td className={cn(cellNumber, "py-2.5 pl-4 text-muted")}>
                      {percent(r.share)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-border">
                  <td className="py-2.5 pr-4 font-medium text-foreground">Total expenses</td>
                  <td className={cn(cellNumber, "py-2.5 px-4 font-semibold text-danger")}>
                    {formatAmount(report.total, currency)}
                  </td>
                  <td className={cn(cellNumber, "py-2.5 pl-4 text-muted")}>100%</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Profit (P&L): revenue minus expenses for the selected period. */
function ProfitSection({
  report,
  currency,
  range,
}: {
  report: ProfitReport;
  currency: string;
  range?: ReportsQuery;
}) {
  const rows: Array<[string, string]> = [
    ["Revenue", formatAmount(report.revenue, currency)],
    ["Expenses", formatAmount(report.expenses, currency)],
    ["Net profit", formatAmount(report.netProfit, currency)],
    ["Profit margin", percent(report.profitMargin)],
  ];
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Profit (P&amp;L)</CardTitle>
            <p className="mt-0.5 text-sm text-muted">
              {report.period.from && report.period.to
                ? `${report.period.from} – ${report.period.to}`
                : report.period.from || report.period.to
                  ? report.period.from
                    ? `From ${report.period.from}`
                    : `Up to ${report.period.to}`
                  : "All time"}
            </p>
          </div>
          <ExportCsvLink href={exportHref("profit", range)} />
        </div>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label} className="border-b border-border last:border-0">
                <td className="py-2.5 text-muted">{label}</td>
                <td className="py-2.5 text-right font-medium text-foreground tabular-nums">
                  {value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-muted">
          Net profit is revenue minus expenses; transfers are excluded.
        </p>
      </CardContent>
    </Card>
  );
}

/** Server-rendered report sections for the current business. */
export async function ReportSections({
  range,
  currency,
}: {
  range?: ReportsQuery;
  currency: string;
}) {
  const data = await getReportData(range ?? {});
  return (
    <>
      <SummarySection summary={data.summary} currency={currency} range={range} />
      <MonthlySection trends={data.monthly} currency={currency} range={range} />
      <CategorySection report={data.category} currency={currency} range={range} />
      <IncomeStatementSection report={data.income} currency={currency} range={range} />
      <ExpenseBreakdownSection report={data.expense} currency={currency} range={range} />
      <ProfitSection report={data.profit} currency={currency} range={range} />
    </>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-4 animate-pulse rounded bg-surface-subtle" />
      ))}
    </div>
  );
}

/** Loading placeholder for the Suspense boundary around ReportSections. */
export function ReportsFallback() {
  return (
    <div className="space-y-6">
      {[0, 1, 2].map((i) => (
        <Card key={i}>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>
                  <div className="h-5 w-32 animate-pulse rounded bg-surface-subtle" />
                </CardTitle>
                <div className="mt-2 h-3 w-48 animate-pulse rounded bg-surface-subtle" />
              </div>
              <div className="h-8 w-28 animate-pulse rounded-button bg-surface-subtle" />
            </div>
          </CardHeader>
          <CardContent>
            <SkeletonRows />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}