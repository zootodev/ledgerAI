import { describe, expect, it, vi } from "vitest";
import {
  computeMetricsFor,
  executePlan,
  type FinanceToolContext,
} from "@/lib/finance/tools/executor";
import type { ExecutionPlan, InternalToolKey } from "@/lib/ask/contracts";

const NOW = new Date("2026-08-15T12:00:00.000Z");

function makeDecimal(value: number) {
  return { toString: () => value.toFixed(2) };
}
function typeGroup(type: string, amount: number, count = 1) {
  return { type, _sum: { amount: makeDecimal(amount) }, _count: count };
}
function categoryGroup(categoryId: string, amount: number) {
  return { categoryId, _sum: { amount: makeDecimal(amount) } };
}

function ctxWith(mockPrisma: Record<string, unknown>): FinanceToolContext {
  return {
    businessId: "biz-a",
    currency: "NGN",
    now: NOW,
    traceId: "t-1",
    prisma: mockPrisma as never,
  };
}

type AnswerPlan = Extract<ExecutionPlan, { kind: "answer" }>;
function answerPlan(overrides: Partial<AnswerPlan> = {}): AnswerPlan {
  return {
    kind: "answer",
    query: { intent: "expenses", category: null, period: { kind: "thisMonth" } },
    toolKeys: ["summary.get"],
    ...overrides,
  };
}

describe("computeMetricsFor", () => {
  it("aggregates current+prior summaries, counts, and category totals", async () => {
    const groupBy = vi
      .fn()
      .mockResolvedValueOnce([
        typeGroup("income", 1_000_000),
        typeGroup("expense", 600_000, 3),
      ])
      .mockResolvedValueOnce([
        typeGroup("income", 800_000),
        typeGroup("expense", 500_000, 2),
      ])
      .mockResolvedValueOnce([categoryGroup("cat-r", 500_000)])
      .mockResolvedValueOnce([categoryGroup("cat-r", 400_000)]);
    const findMany = vi.fn().mockResolvedValueOnce([{ id: "cat-r", name: "Rent" }]);
    const mockPrisma = {
      transaction: { groupBy },
      category: { findMany },
    };

    const metrics = await computeMetricsFor(
      mockPrisma as never,
      "biz-a",
      { intent: "expenseBreakdown", category: null, period: { kind: "lastMonth" } },
      NOW,
    );

    expect(metrics.summary.revenue).toBe(1_000_000);
    expect(metrics.summary.expenses).toBe(600_000);
    expect(metrics.count).toEqual({ income: 1, expenses: 3, transfers: 0 });
    expect(metrics.categoryTotals[0]).toEqual({
      categoryName: "Rent",
      amount: 500_000,
      priorAmount: 400_000,
    });
    expect(groupBy).toHaveBeenCalledTimes(4);
  });

  it("computes an as-of balance cumulatively for the balance intent", async () => {
    const groupBy = vi
      .fn()
      // as-of (up to end of window)
      .mockResolvedValueOnce([
        typeGroup("income", 5_000_000),
        typeGroup("expense", 3_000_000),
      ])
      // current window
      .mockResolvedValueOnce([typeGroup("income", 500_000)])
      .mockResolvedValueOnce([]);
    const mockPrisma = {
      transaction: { groupBy },
      category: { findMany: vi.fn() },
    };

    const metrics = await computeMetricsFor(
      mockPrisma as never,
      "biz-a",
      { intent: "balance", category: null, period: { kind: "thisMonth" } },
      NOW,
    );

    expect(metrics.balance).toBe(2_000_000);
  });
});

describe("executePlan", () => {
  it("executes a summary plan and returns verified tool results + narration", async () => {
    const groupBy = vi
      .fn()
      .mockResolvedValueOnce([
        typeGroup("income", 1_000_000, 2),
        typeGroup("expense", 600_000, 3),
      ])
      .mockResolvedValueOnce([
        typeGroup("income", 800_000, 1),
        typeGroup("expense", 500_000, 2),
      ]);
    const prisma = { transaction: { groupBy }, category: { findMany: vi.fn() } };
    const plan = answerPlan();

    const outcome = await executePlan(ctxWith(prisma), plan);

    expect(outcome.kind).toBe("answer");
    if (outcome.kind === "answer") {
      expect(outcome.query).toEqual(plan.query);
      expect(outcome.answer.text).toContain("₦600,000");
      expect(outcome.toolResults["summary.get"]).toBeDefined();
      const summary = outcome.toolResults["summary.get"]!;
      if ("income" in summary) expect(summary.income).toBe(1_000_000);
    }
  });

  it("skips tool keys outside the allowlist without failing the answer", async () => {
    const groupBy = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const prisma = { transaction: { groupBy }, category: { findMany: vi.fn() } };

    const outcome = await executePlan(
      ctxWith(prisma),
      answerPlan({
        toolKeys: ["sql.run" as unknown as InternalToolKey, "summary.get"],
      }),
    );

    expect(outcome.kind).toBe("answer");
    if (outcome.kind === "answer") {
      const record = outcome.toolResults as Record<string, unknown>;
      expect(record["sql.run"]).toBeUndefined();
    }
  });

  it("returns clarification/unsupported plans without touching the DB", async () => {
    const prisma = { transaction: { groupBy: vi.fn() } };
    const outcome = await executePlan(
      ctxWith(prisma),
      { kind: "clarification", reason: "needs_subject" },
    );
    expect(outcome).toEqual({ kind: "clarification", reason: "needs_subject" });
    expect(prisma.transaction.groupBy).not.toHaveBeenCalled();
  });

  it("runs the full breakdown plan (summary + list + distribution)", async () => {
    const groupBy = vi
      .fn()
      .mockResolvedValueOnce([typeGroup("expense", 600_000, 2)])
      .mockResolvedValueOnce([typeGroup("expense", 500_000, 2)])
      .mockResolvedValueOnce([categoryGroup("cat-r", 500_000)])
      .mockResolvedValueOnce([categoryGroup("cat-r", 400_000)])
      .mockResolvedValueOnce([categoryGroup("cat-m", 100_000)])
      .mockResolvedValueOnce([]);
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([
        { id: "cat-r", name: "Rent" },
        { id: "cat-m", name: "Marketing" },
      ])
      .mockResolvedValueOnce([
        { id: "cat-r", name: "Rent" },
        { id: "cat-m", name: "Marketing" },
      ]);
    const prisma = { transaction: { groupBy }, category: { findMany } };

    const outcome = await executePlan(
      ctxWith(prisma),
      answerPlan({
        query: {
          intent: "expenseBreakdown",
          category: null,
          period: { kind: "lastMonth" },
        },
        toolKeys: ["summary.get", "categories.listSpending", "categories.distribution"],
      }),
    );

    expect(outcome.kind).toBe("answer");
    if (outcome.kind === "answer") {
      expect(outcome.toolResults["categories.listSpending"]).toBeDefined();
      expect(outcome.toolResults["categories.distribution"]).toBeDefined();
      expect(outcome.answer.text).toContain("Rent");
    }
  });

  it("computes a period comparison deltas from verified figures", async () => {
    const groupBy = vi
      .fn()
      .mockResolvedValueOnce([
        typeGroup("income", 1_000_000),
        typeGroup("expense", 400_000),
      ])
      .mockResolvedValueOnce([
        typeGroup("income", 800_000),
        typeGroup("expense", 500_000),
      ]);
    const prisma = { transaction: { groupBy }, category: { findMany: vi.fn() } };

    const outcome = await executePlan(
      ctxWith(prisma),
      answerPlan({
        query: {
          intent: "periodComparison",
          target: "profit",
          category: null,
          period: { kind: "thisMonth" },
        },
        toolKeys: ["period.compare"],
      }),
    );

    expect(outcome.kind).toBe("answer");
    if (outcome.kind === "answer") {
      const result = outcome.toolResults["period.compare"]!;
      if ("current" in result) {
        expect(result.target).toBe("profit");
        expect(result.current).toBe(600_000);
        expect(result.prior).toBe(300_000);
        expect(result.deltaPercent).toBe(100);
      }
    }
  });

  it("uses the explicitly requested comparison range for arbitrary tenant data", async () => {
    const groupBy = vi
      .fn()
      .mockResolvedValueOnce([
        typeGroup("income", 840_000),
        typeGroup("expense", 73_250),
      ])
      .mockResolvedValueOnce([
        typeGroup("income", 790_000),
        typeGroup("expense", 91_875),
      ]);
    const prisma = { transaction: { groupBy }, category: { findMany: vi.fn() } };

    await executePlan(
      ctxWith(prisma),
      answerPlan({
        query: {
          intent: "periodComparison",
          target: "expenses",
          category: null,
          period: { kind: "thisMonth" },
          comparisonPeriod: { kind: "lastMonth" },
        },
        toolKeys: ["period.compare"],
      }),
    );

    const priorWhere = groupBy.mock.calls[1][0].where;
    expect(priorWhere.businessId).toBe("biz-a");
    expect(priorWhere.date.gte).toEqual(new Date("2026-07-01T00:00:00.000Z"));
    expect(priorWhere.date.lte).toEqual(new Date("2026-07-31T23:59:59.999Z"));
  });

  it("uses the explicit comparison period instead of shiftRangeBack, and keeps shiftRangeBack as the absent-comparison fallback", async () => {
    const basePeriod = { kind: "month", month: 5, year: 2026 } as const;

    const explicitGroupBy = vi
      .fn()
      .mockResolvedValueOnce([typeGroup("expense", 100)])
      .mockResolvedValueOnce([typeGroup("expense", 50)]);
    await executePlan(
      ctxWith({ transaction: { groupBy: explicitGroupBy }, category: { findMany: vi.fn() } }),
      answerPlan({
        query: {
          intent: "periodComparison",
          target: "expenses",
          category: null,
          period: basePeriod,
          comparisonPeriod: { kind: "month", month: 4, year: 2026 },
        },
        toolKeys: ["period.compare"],
      }),
    );
    const explicitPriorWhere = explicitGroupBy.mock.calls[1][0].where;
    expect(explicitPriorWhere.date.gte).toEqual(new Date("2026-05-01T00:00:00.000Z"));
    expect(explicitPriorWhere.date.lte).toEqual(new Date("2026-05-31T23:59:59.999Z"));

    const fallbackGroupBy = vi
      .fn()
      .mockResolvedValueOnce([typeGroup("expense", 100)])
      .mockResolvedValueOnce([typeGroup("expense", 50)]);
    await executePlan(
      ctxWith({ transaction: { groupBy: fallbackGroupBy }, category: { findMany: vi.fn() } }),
      answerPlan({
        query: {
          intent: "periodComparison",
          target: "expenses",
          category: null,
          period: basePeriod,
        },
        toolKeys: ["period.compare"],
      }),
    );
    const fallbackPriorWhere = fallbackGroupBy.mock.calls[1][0].where;
    expect(fallbackPriorWhere.date.gte).toEqual(new Date("2026-05-02T00:00:00.000Z"));
    expect(fallbackPriorWhere.date.lte).toEqual(new Date("2026-05-31T23:59:59.999Z"));
  });
});
