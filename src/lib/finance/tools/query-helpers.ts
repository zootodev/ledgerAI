// ============================================================
// LedgerAI — trusted query helpers (finance/tools)
// ------------------------------------------------------------
// The ONLY tenant-scoped Prisma aggregates used by the /ask pipeline.
// Extracted from the original assistant service so the finance tool
// registry and the deterministic service path share one implementation
// (a requirement for offline parity). Every read is scoped to the
// caller-supplied `businessId` — which only requireAuthContext() may
// populate.
// ============================================================

import { computeSummary, type PeriodSummary } from "@/lib/finance/engine";
import type {
  AssistantCategorySpend,
  ResolvedPeriod,
} from "@/lib/finance/assistant";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { TransactionModel } from "@/generated/prisma/models/Transaction";

export interface TypeGroup {
  type: string;
  _sum: { amount: TransactionModel["amount"] | null } | null;
  _count?: number | null;
}

export function nowIsoDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Tenant-scoped transaction predicate. Null bounds mean "open-ended". */
export function buildWhere(
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
export function summarizeGroups(groups: TypeGroup[]): PeriodSummary {
  return computeSummary(
    groups.map((g) => ({
      type: g.type as "income" | "expense" | "transfer",
      amount: Number(g._sum?.amount?.toString() ?? 0),
    })),
  );
}

/** Per-type counts from a `_count`-augmented type groupBy. */
export function countGroups(groups: TypeGroup[]): {
  income: number;
  expenses: number;
  transfers: number;
} {
  let income = 0;
  let expenses = 0;
  let transfers = 0;
  for (const g of groups) {
    const n = g._count ?? 0;
    if (g.type === "income") income = n;
    else if (g.type === "expense") expenses = n;
    else if (g.type === "transfer") transfers = n;
  }
  return { income, expenses, transfers };
}

/** Cumulative net cash up to the end of the implied window. */
export async function asOfBalance(
  prisma: PrismaClient,
  businessId: string,
  period: ResolvedPeriod,
  now: Date,
): Promise<number> {
  const cap = period.to ?? nowIsoDay(now);
  const groups = await prisma.transaction.groupBy({
    by: ["type"],
    where: buildWhere(businessId, null, cap),
    _sum: { amount: true },
  });
  return summarizeGroups(groups).netProfit;
}

/** Expense categories with prior totals, sorted by current amount desc. */
export async function categorySpends(
  prisma: PrismaClient,
  businessId: string,
  currentWhere: Prisma.TransactionWhereInput,
  priorWhere: Prisma.TransactionWhereInput | null,
): Promise<AssistantCategorySpend[]> {
  const [currentGroups, priorGroups] = await Promise.all([
    prisma.transaction.groupBy({
      by: ["categoryId"],
      where: { ...currentWhere, type: "expense" },
      _sum: { amount: true },
    }),
    priorWhere
      ? prisma.transaction.groupBy({
          by: ["categoryId"],
          where: { ...priorWhere, type: "expense" },
          _sum: { amount: true },
        })
      : Promise.resolve([]),
  ]);

  const priorByCategory = new Map(
    priorGroups.map((g) => [g.categoryId ?? "", Number(g._sum?.amount?.toString() ?? 0)]),
  );

  const categories = await prisma.category.findMany({
    where: { OR: [{ businessId: null }, { businessId }] },
    select: { id: true, name: true },
  });
  const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

  return currentGroups
    .map((g) => ({
      categoryName: categoryMap.get(g.categoryId ?? "") ?? "Other",
      amount: Number(g._sum?.amount?.toString() ?? 0),
      priorAmount: priorByCategory.get(g.categoryId ?? "") ?? 0,
    }))
    .sort((a, b) => b.amount - a.amount)
    .filter((c) => c.amount > 0);
}