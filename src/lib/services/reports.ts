import { requireAuthContext } from "@/lib/services/auth-context";
import { analyticsQuerySchema, zErrorMessage } from "@/lib/validation/index";
import {
  getAnalyticsSummary,
  getAnalyticsTrends,
} from "@/lib/services/analytics";
import type { AnalyticsSummary, AnalyticsTrends } from "@/lib/services/analytics";
import { computeSummary, round, type ProfitRow } from "@/lib/finance/engine";
import { numericCell, toCsv, type NumericCell } from "@/lib/csv";
import type { Prisma } from "@/generated/prisma/client";
import type { TransactionModel } from "@/generated/prisma/models/Transaction";

/** Supported CSV report types (one per section shown on the Reports page). */
export const REPORT_TYPES = ["summary", "monthly", "category"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

/** Query params for reports (dates in YYYY-MM-DD, same range convention as analytics). */
export interface ReportsQuery {
  dateFrom?: string;
  dateTo?: string;
}

/** One category line: amount plus its share of that transaction type's total. */
export interface CategoryReportRow {
  categoryId: string | null;
  name: string;
  type: "income" | "expense";
  amount: number;
  /** Percentage of the type total, null when the type total is zero. */
  share: number | null;
}

export interface CategoryReport {
  income: number;
  expenses: number;
  rows: CategoryReportRow[];
}

export interface ReportData {
  summary: AnalyticsSummary;
  monthly: AnalyticsTrends;
  category: CategoryReport;
}

/**
 * All three report sections for the current user's business, driven by a
 * single validated date range. Numbers come from the analytics service (which
 * itself folds every bucket through the finance engine), so the reports can
 * never diverge from the Overview KPIs. Aggregation happens in the database;
 * transfers never appear in income/expenses.
 */
export async function getReportData(query: ReportsQuery = {}): Promise<ReportData> {
  const parsed = analyticsQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw new Error(zErrorMessage(parsed.error));
  }

  const [summary, monthly, category] = await Promise.all([
    getAnalyticsSummary(parsed.data),
    getAnalyticsTrends({ ...parsed.data, groupBy: "month" }),
    getCategoryReport(parsed.data),
  ]);

  return { summary, monthly, category };
}

/** One database groupBy row: a category subtotal per transaction type. */
interface CategoryGroup {
  categoryId: string | null;
  type: string;
  _sum: { amount: TransactionModel["amount"] | null } | null;
}

/**
 * Category breakdown (income and expenses separately) for the current user's
 * business. Rows with no category surface as "Uncategorized". Transfers are
 * excluded from the aggregation entirely.
 */
export async function getCategoryReport(
  query: ReportsQuery = {},
): Promise<CategoryReport> {
  const parsed = analyticsQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw new Error(zErrorMessage(parsed.error));
  }
  const { dateFrom, dateTo } = parsed.data;

  const { prisma, business } = await requireAuthContext();

  const groups = (await prisma.transaction.groupBy({
    by: ["categoryId", "type"],
    where: buildWhere(business.id, dateFrom, dateTo),
    _sum: { amount: true },
  })) as unknown as CategoryGroup[];

  const ids = groups
    .map((g) => g.categoryId)
    .filter((id): id is string => id !== null);
  const categories = ids.length
    ? await prisma.category.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(categories.map((c) => [c.id, c.name]));

  // Type subtotals come from the engine so the reported totals can never
  // disagree with the KPI math.
  const totals = computeSummary(
    groups.map((g) => ({
      type: g.type as ProfitRow["type"],
      amount: Number(g._sum?.amount?.toString() ?? 0),
    })),
  );

  const rows: CategoryReportRow[] = groups
    .map((g) => {
      const type = g.type as "income" | "expense";
      const amount = round(Math.abs(Number(g._sum?.amount?.toString() ?? 0)), 2);
      const typeTotal = type === "income" ? totals.revenue : totals.expenses;
      return {
        categoryId: g.categoryId,
        name:
          (g.categoryId !== null ? nameById.get(g.categoryId) : undefined) ??
          "Uncategorized",
        type,
        amount,
        share: typeTotal === 0 ? null : round((amount / typeTotal) * 100, 2),
      };
    })
    .sort((a, b) =>
      a.type === b.type
        ? b.amount - a.amount
        : a.type === "income"
          ? -1
          : 1,
    );

  return { income: totals.revenue, expenses: totals.expenses, rows };
}

/** Build a tenant-scoped where clause (same date convention as analytics). */
function buildWhere(
  businessId: string,
  dateFrom?: string,
  dateTo?: string,
): Prisma.TransactionWhereInput {
  return {
    businessId,
    type: { in: ["income", "expense"] },
    ...(dateFrom || dateTo
      ? {
          date: {
            ...(dateFrom
              ? { gte: new Date(`${dateFrom}T00:00:00.000Z`) }
              : {}),
            ...(dateTo
              ? { lte: new Date(`${dateTo}T23:59:59.999Z`) }
              : {}),
          },
        }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// CSV report serializers — pure, deterministic, and countable by tests.
// ---------------------------------------------------------------------------

/**
 * Two-decimal fixed notation; the CSV format is machine-readable, not display.
 * Emitted as a tagged NUMERIC cell so a negative figure like -500.00 is never
 * mistaken for formula text and neutralized.
 */
function num(value: number): NumericCell {
  return numericCell(round(value, 2).toFixed(2));
}

/** Profit margin cell: blank when undefined (no revenue), else two decimals. */
function margin(value: number | null): NumericCell | "" {
  return value === null ? "" : numericCell(round(value, 2).toFixed(2));
}

/** Serialize the KPI summary to CSV rows (one metric per line). */
export function buildSummaryCsv(summary: AnalyticsSummary): string {
  return toCsv(
    ["Metric", "Value"],
    [
      ["Report period from", summary.period.from ?? ""],
      ["Report period to", summary.period.to ?? ""],
      ["Revenue", num(summary.revenue)],
      ["Expenses", num(summary.expenses)],
      ["Transfers", num(summary.transfers)],
      ["Net profit", num(summary.netProfit)],
      ["Profit margin (%)", margin(summary.profitMargin)],
      ["Cash balance", num(summary.cashBalance)],
    ],
  );
}

/** Serialize the monthly trend to CSV rows (month key is YYYY-MM). */
export function buildMonthlyCsv(trends: AnalyticsTrends): string {
  return toCsv(
    ["Month", "Revenue", "Expenses", "Transfers", "Net profit", "Profit margin (%)"],
    trends.points.map((p) => [
      p.key,
      num(p.revenue),
      num(p.expenses),
      num(p.transfers),
      num(p.netProfit),
      margin(p.profitMargin),
    ]),
  );
}

/** Serialize the category breakdown to CSV rows (income first, then expenses). */
export function buildCategoryCsv(report: CategoryReport): string {
  return toCsv(
    ["Type", "Category", "Amount", "% of type"],
    report.rows.map((r) => [r.type, r.name, num(r.amount), margin(r.share)]),
  );
}