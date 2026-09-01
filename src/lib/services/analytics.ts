import { requireAuthContext } from "@/lib/services/auth-context";
import { analyticsQuerySchema, zErrorMessage } from "@/lib/validation/index";
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