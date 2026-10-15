import Link from "next/link";
import { Download } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatAmount } from "@/lib/finance/engine";
import {
  getReportData,
  monthBounds,
  reportPeriodLabel,
} from "@/lib/services/reports";
import type {
  CategoryReport,
  ProfitReport,
  ReportsQuery,
  TypeReport,
} from "@/lib/services/reports";
import type { AnalyticsSummary, AnalyticsTrends } from "@/lib/services/analytics";
import { cn } from "@/lib/utils/cn";

/** Human window caption ("All time", "1 Jun – 30 Jun 2026", …) for a query. */
function sectionPeriod(range?: ReportsQuery): string {
  return reportPeriodLabel({
    from: range?.dateFrom ?? null,
    to: range?.dateTo ?? null,
  });
}

/** CSV export link for a section, carrying the applied range + account. */
function exportHref(type: string, range?: ReportsQuery): string {
  const qs = new URLSearchParams();
  qs.set("type", type);
  if (range?.dateFrom) qs.set("from", range.dateFrom);
  if (range?.dateTo) qs.set("to", range.dateTo);
  if (range?.accountId) qs.set("accountId", range.accountId);
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

/**
 * Drill-through link from a report row to the filtered transactions that
 * produced it. Stays a plain row label when printed.
 */
function DrillLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="transition-colors hover:text-brand hover:underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 rounded print:no-underline"
    >
      {children}
    </Link>
  );
}

/** /transactions for one transaction type within the report scope. */
function transactionsHref(type: string, range?: ReportsQuery): string {
  const p = new URLSearchParams();
  p.set("type", type);
  if (range?.dateFrom) p.set("dateFrom", range.dateFrom);
  if (range?.dateTo) p.set("dateTo", range.dateTo);
  if (range?.accountId) p.set("accountId", range.accountId);
  return `/transactions?${p.toString()}`;
}

/** /transactions for one calendar month bucket (overrides the page range). */
function monthTransactionsHref(key: string, range?: ReportsQuery): string {
  const { from, to } = monthBounds(key);
  const p = new URLSearchParams();
  p.set("dateFrom", from);
  p.set("dateTo", to);
  if (range?.accountId) p.set("accountId", range.accountId);
  return `/transactions?${p.toString()}`;
}

/** /transactions for a category row (uncategorized rows use the focus flag). */
function categoryTransactionsHref(
  categoryId: string | null,
  type: string,
  range?: ReportsQuery,
): string {
  const p = new URLSearchParams();
  p.set("type", type);
  if (categoryId) p.set("categoryId", categoryId);
  else p.set("uncategorized", "1");
  if (range?.dateFrom) p.set("dateFrom", range.dateFrom);
  if (range?.dateTo) p.set("dateTo", range.dateTo);
  if (range?.accountId) p.set("accountId", range.accountId);
  return `/transactions?${p.toString()}`;
}

/**
 * Which direction a metric moved FOR the business: revenue, profit, and cash
 * rising are favorable, while expenses rising is adverse. Deltas are toned
 * and described per metric — a higher expense is never styled or narrated as
 * universally "good".
 */
type DeltaPolarity = "up-is-good" | "up-is-adverse";

/** Signed percent change between two figures, or null when the prior figure
 *  is zero — a comparison is never fabricated from a zero baseline. */
function deltaPercent(current: number, prior: number): number | null {
  if (prior === 0) return null;
  return (current - prior) / Math.abs(prior);
}

/** True when the previous period recorded anything worth comparing against. */
function priorHadActivity(prior: {
  revenue: number;
  expenses: number;
  netProfit: number;
  cashBalance: number;
}): boolean {
  return (
    prior.revenue !== 0 ||
    prior.expenses !== 0 ||
    prior.netProfit !== 0 ||
    prior.cashBalance !== 0
  );
}

/** One delta line for the prior-period comparison block. */
function PriorDelta({
  label,
  current,
  prior,
  polarity,
}: {
  label: string;
  current: number;
  prior: number;
  polarity: DeltaPolarity;
}) {
  const delta = deltaPercent(current, prior);
  if (delta === null) {
    return (
      <li className="flex items-baseline justify-between gap-4">
        <span className="text-muted">{label}</span>
        <span className="tabular-nums text-muted">
          —
          <span className="sr-only">: no prior figure to compare against</span>
        </span>
      </li>
    );
  }
  const rounded = Math.round(delta * 100);
  if (rounded === 0) {
    return (
      <li className="flex items-baseline justify-between gap-4">
        <span className="text-muted">{label}</span>
        <span className="tabular-nums text-muted">
          0%
          <span className="sr-only">: unchanged from the previous period</span>
        </span>
      </li>
    );
  }
  const rose = rounded > 0;
  const favorable = polarity === "up-is-good" ? rose : !rose;
  return (
    <li className="flex items-baseline justify-between gap-4">
      <span className="text-muted">{label}</span>
      <span
        className={cn(
          "tabular-nums font-medium",
          favorable ? "text-success" : "text-danger",
        )}
      >
        {rose ? `+${rounded}%` : `${rounded}%`}
        <span className="sr-only">
          {rose ? "up" : "down"} from the previous period —{" "}
          {favorable ? "favorable" : "adverse"} for {label.toLowerCase()}
        </span>
      </span>
    </li>
  );
}

function SummarySection({
  summary,
  currency,
  range,
}: {
  summary: AnalyticsSummary;
  currency: string;
  range?: ReportsQuery;
}) {
  const rows: Array<{
    label: string;
    value: string;
    href?: string;
  }> = [
    { label: "Revenue", value: formatAmount(summary.revenue, currency), href: transactionsHref("income", range) },
    { label: "Expenses", value: formatAmount(summary.expenses, currency), href: transactionsHref("expense", range) },
    { label: "Transfers", value: formatAmount(summary.transfers, currency), href: transactionsHref("transfer", range) },
    { label: "Net profit", value: formatAmount(summary.netProfit, currency) },
    { label: "Profit margin", value: percent(summary.profitMargin) },
    { label: "Cash balance", value: formatAmount(summary.cashBalance, currency) },
  ];
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Summary</CardTitle>
            <p className="mt-0.5 text-sm text-muted">
              {sectionPeriod(range)}
            </p>
          </div>
          <ExportCsvLink href={exportHref("summary", range)} />
        </div>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <tbody>
            {rows.map(({ label, value, href }) => (
              <tr key={label} className="border-b border-border last:border-0">
                <td className="py-2.5 text-muted">
                  {href ? <DrillLink href={href}>{label}</DrillLink> : label}
                </td>
                <td className="py-2.5 text-right font-medium text-foreground tabular-nums">
                  {value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {summary.prior && (
          <div className="mt-4 rounded-field border border-border bg-surface-subtle/40 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              vs previous period · {reportPeriodLabel(summary.prior.period)}
            </p>
            {priorHadActivity(summary.prior) ? (
              <ul className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
                <PriorDelta label="Revenue" current={summary.revenue} prior={summary.prior.revenue} polarity="up-is-good" />
                <PriorDelta label="Expenses" current={summary.expenses} prior={summary.prior.expenses} polarity="up-is-adverse" />
                <PriorDelta label="Net profit" current={summary.netProfit} prior={summary.prior.netProfit} polarity="up-is-good" />
                <PriorDelta label="Cash balance" current={summary.cashBalance} prior={summary.prior.cashBalance} polarity="up-is-good" />
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted">
                No activity in the previous period, so there is nothing to compare against yet.
              </p>
            )}
          </div>
        )}
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
              Income, expenses and net result per month · {sectionPeriod(range)}
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
                    <td className="py-2.5 pr-4 text-foreground">
                      <DrillLink href={monthTransactionsHref(p.key, range)}>
                        {p.label}
                      </DrillLink>
                    </td>
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
              share of its type total. Transfers excluded · {sectionPeriod(range)}
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
                    <td className="py-2.5 px-4 text-foreground">
                      <DrillLink href={categoryTransactionsHref(r.categoryId, r.type, range)}>
                        {r.name}
                      </DrillLink>
                    </td>
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
              of total revenue. Transfers excluded · {sectionPeriod(range)}
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
                    <td className="py-2.5 pr-4 text-foreground">
                      <DrillLink href={categoryTransactionsHref(r.categoryId, "income", range)}>
                        {r.name}
                      </DrillLink>
                    </td>
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
              share of total expenses. Transfers excluded · {sectionPeriod(range)}
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
                    <td className="py-2.5 pr-4 text-foreground">
                      <DrillLink href={categoryTransactionsHref(r.categoryId, "expense", range)}>
                        {r.name}
                      </DrillLink>
                    </td>
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
  const rows: Array<{ label: string; value: string; href?: string }> = [
    { label: "Revenue", value: formatAmount(report.revenue, currency), href: transactionsHref("income", range) },
    { label: "Expenses", value: formatAmount(report.expenses, currency), href: transactionsHref("expense", range) },
    { label: "Net profit", value: formatAmount(report.netProfit, currency) },
    { label: "Profit margin", value: percent(report.profitMargin) },
  ];
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Profit (P&amp;L)</CardTitle>
            <p className="mt-0.5 text-sm text-muted">
              {sectionPeriod(range)}
            </p>
          </div>
          <ExportCsvLink href={exportHref("profit", range)} />
        </div>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <tbody>
            {rows.map(({ label, value, href }) => (
              <tr key={label} className="border-b border-border last:border-0">
                <td className="py-2.5 text-muted">
                  {href ? <DrillLink href={href}>{label}</DrillLink> : label}
                </td>
                <td className="py-2.5 text-right font-medium text-foreground tabular-nums">
                  {value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {report.prior && (
          <div className="mt-4 rounded-field border border-border bg-surface-subtle/40 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              vs previous period · {reportPeriodLabel(report.prior.period)}
            </p>
            {priorHadActivity(report.prior) ? (
              <ul className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
                <PriorDelta label="Revenue" current={report.revenue} prior={report.prior.revenue} polarity="up-is-good" />
                <PriorDelta label="Expenses" current={report.expenses} prior={report.prior.expenses} polarity="up-is-adverse" />
                <PriorDelta label="Net profit" current={report.netProfit} prior={report.prior.netProfit} polarity="up-is-good" />
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted">
                No activity in the previous period, so there is nothing to compare against yet.
              </p>
            )}
          </div>
        )}
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
  accountId,
}: {
  range?: ReportsQuery;
  currency: string;
  /** Tenant-validated account filter (applied by the server to every section). */
  accountId?: string;
}) {
  // The account scope rides along with the range so every section, CSV link,
  // and drill-through carries the same filter.
  const query: ReportsQuery = { ...range, accountId };
  const data = await getReportData(query);
  return (
    <>
      <SummarySection summary={data.summary} currency={currency} range={query} />
      <MonthlySection trends={data.monthly} currency={currency} range={query} />
      <CategorySection report={data.category} currency={currency} range={query} />
      <IncomeStatementSection report={data.income} currency={currency} range={query} />
      <ExpenseBreakdownSection report={data.expense} currency={currency} range={query} />
      <ProfitSection report={data.profit} currency={currency} range={query} />
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