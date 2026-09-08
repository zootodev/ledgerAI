// ============================================================
// LedgerAI — Insights Service (Phase 8A)
// ------------------------------------------------------------
// Reads real transaction aggregates for the session-scoped business,
// feeds them into the deterministic Insight Engine, and returns
// serializeable insight DTOs for the UI. No business logic lives here
// beyond aggregation; every number is derived by the finance engine.
//
// Tenancy: the businessId always comes from the auth context (never the
// client), matching every other service in this app.
// ============================================================

import { requireAuthContext } from "@/lib/services/auth-context";
import { analyticsQuerySchema, zErrorMessage } from "@/lib/validation/index";
import { computeSummary, type PeriodSummary } from "@/lib/finance/engine";
import {
  deriveInsights,
  type CategorySpend,
  type DerivedInsight,
} from "@/lib/finance/insights";
import { getAIService } from "@/lib/ai/provider";
import type { InspectInsight } from "@/lib/types/insights";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { TransactionModel } from "@/generated/prisma/models/Transaction";

/** Query params for insights (dates in YYYY-MM-DD, same convention as analytics). */
export interface InsightsQuery {
  dateFrom?: string;
  dateTo?: string;
}

/** All insights for the current business over an optional period. */
export async function getInsights(query: InsightsQuery = {}): Promise<InspectInsight[]> {
  const parsed = analyticsQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw new Error(zErrorMessage(parsed.error));
  }
  const { dateFrom, dateTo } = parsed.data;

  const { prisma, business } = await requireAuthContext();

  // No selection -> all time (mirrors the Overview convention, so the range
  // control's active preset always agrees with the data shown). A partial
  // window keeps only the bound the user gave.
  const currentWhere = buildWhere(business.id, dateFrom ?? null, dateTo ?? null);

  // Prior-period comparison only makes sense for a fully bounded window;
  // partial or all-time spans have no comparable "same length before".
  let priorWhere: Prisma.TransactionWhereInput | null = null;
  if (dateFrom && dateTo) {
    const [priorFrom, priorTo] = shiftRangeBack(dateFrom, dateTo);
    priorWhere = buildWhere(business.id, priorFrom, priorTo);
  }

  const [currentGroups, currentLargest, categoryRows] = await Promise.all([
    prisma.transaction.groupBy({
      by: ["type"],
      where: currentWhere,
      _sum: { amount: true },
    }),
    prisma.transaction.findFirst({
      where: { ...currentWhere, type: "expense" },
      orderBy: { amount: "desc" },
      select: { amount: true, category: { select: { name: true } } },
    }),
    prisma.category.findMany({
      where: { OR: [{ businessId: null }, { businessId: business.id }] },
      select: { id: true, name: true },
    }),
  ]);

  const priorGroups = priorWhere
    ? await prisma.transaction.groupBy({
        by: ["type"],
        where: priorWhere,
        _sum: { amount: true },
      })
    : [];

  const summary = summarizeGroups(currentGroups);
  const priorSummary = summarizeGroups(priorGroups);

  // No activity in the selected window: show the empty state, not a hollow
  // "Period snapshot" of zeroes.
  if (summary.revenue === 0 && summary.expenses === 0 && summary.transfers === 0) {
    return [];
  }

  const categoryMap = new Map(categoryRows.map((c) => [c.id, c.name]));

  const topCategories = await categorySpends(prisma, currentWhere, priorWhere, categoryMap);

  const largestExpense = currentLargest
    ? {
        categoryName: currentLargest.category?.name ?? null,
        amount: Number(currentLargest.amount.toString()),
      }
    : null;

  const derived = deriveInsights({
    summary,
    priorSummary,
    topCategories,
    topIncome: [],
    largestExpense,
  });

  // Deterministic narration (no LLM): derived cards pass through the
  // provider seam so a future LLM narrator can be swapped in unchanged.
  const ai = getAIService();
  const narrated = (await ai.insightGenerator?.generateInsights(derived)) ?? derived;
  const rows = Array.isArray(narrated) ? (narrated as DerivedInsight[]) : [];

  return rows.map((d) => ({
    kind: d.kind,
    title: d.title,
    description: d.description,
    metadata: d.metadata,
    period: { from: dateFrom ?? null, to: dateTo ?? null },
  }));
}

/** Shift an inclusive [from, to] range one full span back (prior period). */
function shiftRangeBack(from: string, to: string): [string, string] {
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  const lengthMs = Math.max(end.getTime() - start.getTime(), 0);
  const priorEnd = new Date(start.getTime() - 1);
  const priorStart = new Date(priorEnd.getTime() - lengthMs);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return [iso(priorStart), iso(priorEnd)];
}

/** Tenant-scoped transaction predicate. Null bounds mean "open-ended". */
function buildWhere(
  businessId: string,
  from: string | null,
  to: string | null,
): Prisma.TransactionWhereInput {
  const where: Prisma.TransactionWhereInput = { businessId };
  if (from || to) {
    where.date = {
      gte: from ? new Date(`${from}T00:00:00.000Z`) : undefined,
      lte: to ? new Date(`${to}T23:59:59.999Z`) : undefined,
    };
  }
  return where;
}

/** Fold groupBy subtotals into a PeriodSummary via the finance engine. */
function summarizeGroups(groups: TypeGroup[]): PeriodSummary {
  return computeSummary(
    groups.map((g) => ({
      type: g.type as "income" | "expense" | "transfer",
      amount: Number(g._sum?.amount?.toString() ?? 0),
    })),
  );
}

interface TypeGroup {
  type: string;
  _sum: { amount: TransactionModel["amount"] | null } | null;
}

/** Expense categories, sorted by current amount desc, each with its prior total. */
async function categorySpends(
  prisma: PrismaClient,
  currentWhere: Prisma.TransactionWhereInput,
  priorWhere: Prisma.TransactionWhereInput | null,
  categoryMap: Map<string, string>,
): Promise<CategorySpend[]> {
  const priorGroups = priorWhere
    ? await prisma.transaction.groupBy({
        by: ["categoryId"],
        where: { ...priorWhere, type: "expense" },
        _sum: { amount: true },
      })
    : [];

  const currentGroups = await prisma.transaction.groupBy({
    by: ["categoryId"],
    where: { ...currentWhere, type: "expense" },
    _sum: { amount: true },
    _count: true,
  });

  const priorByCategory = new Map(
    priorGroups.map((g) => [g.categoryId ?? "", Number(g._sum?.amount?.toString() ?? 0)]),
  );

  return currentGroups
    .map((g) => ({
      categoryId: g.categoryId,
      categoryName: categoryMap.get(g.categoryId ?? "") ?? "Other",
      amount: Number(g._sum?.amount?.toString() ?? 0),
      priorAmount: priorByCategory.get(g.categoryId ?? "") ?? 0,
      transactions: g._count,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);
}