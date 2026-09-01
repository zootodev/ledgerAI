import { requireAuthContext } from "@/lib/services/auth-context";
import {
  analyticsQuerySchema,
  analyticsTrendsQuerySchema,
  zErrorMessage,
} from "@/lib/validation/index";
import { computeSummary, type ProfitRow, type PeriodSummary } from "@/lib/finance/engine";
import type { Prisma } from "@/generated/prisma/client";
import type { TransactionModel } from "@/generated/prisma/models/Transaction";

/** Query params for analytics KPIs (dates in YYYY-MM-DD). */
export interface AnalyticsQuery {
  dateFrom?: string;
  dateTo?: string;
}

/**
 * KPI summary for the current user's business.
 *
 * - revenue / expenses / transfers / netProfit / profitMargin are PERIOD
 *   figures (filtered by the optional date range).
 * - cashBalance is a point-in-time as-of snapshot: cumulative net cash
 *   position up to dateTo (or all-time when no range is given). Because the
 *   Account model stores no opening balance, the balance is ledger-derived:
 *   cumulative revenue minus cumulative expenses, transfers excluded
 *   (a transfer between the owner's own accounts never changes the
 *   aggregate cash position, mirroring profitImpact semantics in the engine).
 *
 * Aggregation happens in the database (groupBy/_sum); no rows are pulled
 * into the app. All number conversion is reduced to edge work — the money
 * math itself lives in the finance engine.
 */
export async function getAnalyticsSummary(
  query: AnalyticsQuery = {},
): Promise<AnalyticsSummary> {
  const parsed = analyticsQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw new Error(zErrorMessage(parsed.error));
  }
  const { dateFrom, dateTo } = parsed.data;

  const { prisma, business } = await requireAuthContext();

  // Period subtotals — scoped to the session-derived business id.
  const periodGroups = await prisma.transaction.groupBy({
    by: ["type"],
    where: buildWhere(business.id, dateFrom, dateTo),
    _sum: { amount: true },
  });

  // As-of snapshot for the balance — ignores dateFrom, capped at dateTo.
  const balanceGroups = await prisma.transaction.groupBy({
    by: ["type"],
    where: buildWhere(business.id, undefined, dateTo),
    _sum: { amount: true },
  });

  const period = summarizeGroups(periodGroups);
  const balance = summarizeGroups(balanceGroups);

  return {
    revenue: period.revenue,
    expenses: period.expenses,
    transfers: period.transfers,
    netProfit: period.netProfit,
    profitMargin: period.profitMargin,
    cashBalance: balance.netProfit,
    period: { from: dateFrom ?? null, to: dateTo ?? null },
  };
}

export interface AnalyticsSummary {
  revenue: number;
  expenses: number;
  transfers: number;
  netProfit: number;
  profitMargin: number | null;
  cashBalance: number;
  period: { from: string | null; to: string | null };
}

/** Query params for trend charts (dates in YYYY-MM-DD). */
export interface AnalyticsTrendsQuery {
  dateFrom?: string;
  dateTo?: string;
  groupBy?: "day" | "month";
}

export interface AnalyticsTrendPoint {
  key: string;
  label: string;
  revenue: number;
  expenses: number;
  transfers: number;
  netProfit: number;
  profitMargin: number | null;
}

export interface AnalyticsTrends {
  points: AnalyticsTrendPoint[];
  period: { from: string | null; to: string | null };
}

/**
 * Bucketed revenue/expenses/net-profit trend for the current user's business.
 *
 * One database aggregation (groupBy type + date) is turned into time buckets
 * in plain code; every bucket is folded through the finance engine's
 * computeSummary so chart numbers can never diverge from KPI numbers.
 * Missing buckets are emitted as zero-value points so a trend line does not
 * incorrectly jump across dates with no transactions.
 */
export async function getAnalyticsTrends(
  query: AnalyticsTrendsQuery = {},
): Promise<AnalyticsTrends> {
  const parsed = analyticsTrendsQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw new Error(zErrorMessage(parsed.error));
  }
  const { dateFrom, dateTo, groupBy } = parsed.data;

  const { prisma, business } = await requireAuthContext();

  const groups = await prisma.transaction.groupBy({
    by: ["type", "date"],
    where: buildWhere(business.id, dateFrom, dateTo),
    _sum: { amount: true },
  });
  const rows = groups as DateTypeGroup[];

  const byBucket = new Map<string, ProfitRow[]>();
  let minDate: Date | null = null;
  let maxDate: Date | null = null;

  for (const row of rows) {
    const key = bucketKey(row.date, groupBy);
    let bucket = byBucket.get(key);
    if (!bucket) {
      bucket = [];
      byBucket.set(key, bucket);
    }
    bucket.push({
      type: row.type as ProfitRow["type"],
      amount: Number(row._sum?.amount?.toString() ?? 0),
    });
    if (!minDate || row.date < minDate) minDate = row.date;
    if (!maxDate || row.date > maxDate) maxDate = row.date;
  }

  // Visible span = the explicit range when given, otherwise the observed data.
  const start = dateFrom ? utcDate(dateFrom) : minDate;
  const end = dateTo ? utcDate(dateTo) : maxDate;

  if (!start || !end) {
    return { points: [], period: { from: dateFrom ?? null, to: dateTo ?? null } };
  }

  const points: AnalyticsTrendPoint[] = [];
  if (groupBy === "day") {
    for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
      points.push(pointFor(cursor, groupBy, byBucket));
    }
  } else {
    for (let cursor = addMonths(start, 0); cursor <= end; cursor = addMonths(cursor, 1)) {
      points.push(pointFor(cursor, groupBy, byBucket));
    }
  }

  return {
    points,
    period: { from: dateFrom ?? null, to: dateTo ?? null },
  };
}

/** Shape of one groupBy row (type + date subtotal). */
interface DateTypeGroup {
  type: string;
  date: Date;
  _sum: { amount: TransactionModel["amount"] | null } | null;
}

/** UTC date key for a bucket: YYYY-MM-DD (day) or YYYY-MM (month). */
function bucketKey(date: Date, groupBy: "day" | "month"): string {
  const iso = date.toISOString();
  return groupBy === "day" ? iso.slice(0, 10) : iso.slice(0, 7);
}

function utcDate(isoDay: string): Date {
  return new Date(`${isoDay}T00:00:00.000Z`);
}

function addDays(date: Date, days: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

function addMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** Human label for a bucket key, e.g. "2026-03" → "Mar 2026", "2026-03-05" → "Mar 5". */
function bucketLabel(key: string, groupBy: "day" | "month"): string {
  const [year, month, day] = key.split("-").map(Number);
  const monthName = MONTH_LABELS[month - 1];
  return groupBy === "month" ? `${monthName} ${year}` : `${monthName} ${day}`;
}

/** Fold one bucket through the finance engine into a chart point. */
function pointFor(
  cursor: Date,
  groupBy: "day" | "month",
  byBucket: Map<string, ProfitRow[]>,
): AnalyticsTrendPoint {
  const key = bucketKey(cursor, groupBy);
  const summary = computeSummary(byBucket.get(key) ?? []);
  return {
    key,
    label: bucketLabel(key, groupBy),
    revenue: summary.revenue,
    expenses: summary.expenses,
    transfers: summary.transfers,
    netProfit: summary.netProfit,
    profitMargin: summary.profitMargin,
  };
}

/** Build a tenant-scoped where clause using the shared date-boundary convention. */
function buildWhere(
  businessId: string,
  dateFrom?: string,
  dateTo?: string,
): Prisma.TransactionWhereInput {
  return {
    businessId,
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

/** Shape of one groupBy row (amount as Decimal-string). */
interface TypeGroup {
  type: string;
  _sum: { amount: TransactionModel["amount"] | null } | null;
}

/** Fold groupBy subtotals into a PeriodSummary via the finance engine. */
function summarizeGroups(groups: TypeGroup[]): PeriodSummary {
  const rows: ProfitRow[] = groups.map((g) => ({
    type: g.type as ProfitRow["type"],
    amount: Number(g._sum?.amount?.toString() ?? 0),
  }));
  return computeSummary(rows);
}