import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/services/auth-context", () => ({
  requireAuthContext: vi.fn(),
  AuthorizationError: class AuthorizationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "AuthorizationError";
    }
  },
}));

vi.mock("@/lib/ai/provider", () => ({
  getAIService: vi.fn(),
}));

vi.mock("@/lib/services/assistant-conversations", () => ({
  persistAssistantExchange: vi.fn(),
  findLastUserQuestionForContext: vi.fn(),
}));

import { requireAuthContext } from "@/lib/services/auth-context";
import { getAssistantAnswer } from "@/lib/services/assistant";
import { getAIService } from "@/lib/ai/provider";
import { persistAssistantExchange } from "@/lib/services/assistant-conversations";

const userA = { id: "auth-user-a", email: "a@example.com", name: "User A" };
const businessA = { id: "biz-a", name: "A Ltd", currency: "NGN" };
const NOW = new Date("2026-08-15T12:00:00.000Z");

function makeDecimal(value: number) {
  return { toString: () => value.toFixed(2) };
}

function makeTypeGroup(type: string, amount: number, count = 1) {
  return { type, _sum: { amount: makeDecimal(amount) }, _count: count };
}

function makeCategoryGroup(categoryId: string, amount: number) {
  return { categoryId, _sum: { amount: makeDecimal(amount) } };
}

const mockedRequireAuthContext = vi.mocked(requireAuthContext);
const mockedGetAIService = vi.mocked(getAIService);
const mockPersistExchange = vi.mocked(persistAssistantExchange);

const mockAssistant = { answer: vi.fn().mockResolvedValue("") };
const mockAIService = {
  categorizer: {} as never,
  insightGenerator: undefined,
  assistant: mockAssistant,
};

const mockPrisma = {
  business: { findFirst: vi.fn() },
  transaction: { groupBy: vi.fn() },
  category: { findMany: vi.fn() },
  $transaction: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.transaction.groupBy.mockReset();
  mockPrisma.category.findMany.mockReset();
  mockAssistant.answer.mockReset();
  mockAssistant.answer.mockResolvedValue("");
  mockedRequireAuthContext.mockReset();
  mockedRequireAuthContext.mockResolvedValue({
    user: userA,
    business: businessA,
    prisma: mockPrisma as never,
  });
  mockedGetAIService.mockReset();
  mockedGetAIService.mockReturnValue(mockAIService);
  mockPersistExchange.mockReset();
});

describe("expense impact (the revenue-vs-profit question)", () => {
  it("explains that expenses cut PROFIT (not revenue) and names the drivers", async () => {
    mockPrisma.transaction.groupBy
      .mockResolvedValueOnce([
        makeTypeGroup("income", 1_000_000),
        makeTypeGroup("expense", 400_000),
      ]) // current types
      .mockResolvedValueOnce([makeTypeGroup("income", 800_000)]) // prior types
      .mockResolvedValueOnce([
        makeCategoryGroup("cat-inventory", 200_000),
        makeCategoryGroup("cat-rent", 150_000),
        makeCategoryGroup("cat-utilities", 50_000),
      ]) // current categories
      .mockResolvedValueOnce([]); // prior categories
    mockPrisma.category.findMany.mockResolvedValueOnce([
      { id: "cat-inventory", name: "Inventory" },
      { id: "cat-rent", name: "Rent" },
      { id: "cat-utilities", name: "Utilities" },
    ]);

    const answer = await getAssistantAnswer(
      "In this year, what have I spent money on that made my revenue lesser than before?",
      NOW,
    );
    expect(answer.kind).toBe("answer");
    expect(answer.text).toContain("Spending doesn’t reduce your revenue");
    expect(answer.text).toContain("leaving ₦600,000 profit");
    expect(answer.text).toContain("Inventory (₦200,000), Rent (₦150,000), Utilities (₦50,000)");
    expect(answer.text).toContain("together 100% of your spending");
    expect(answer.text).toContain("Revenue rose +25%");

    // Category subtotals are scoped to expenses only, and the window is the
    // full current year with the prior year as comparison.
    const categoryCalls = mockPrisma.transaction.groupBy.mock.calls.filter((c) => {
      const args = c[0] as { by?: string[] };
      return args.by?.[0] === "categoryId";
    });
    expect(categoryCalls.length).toBe(2);
    for (const c of categoryCalls) {
      const args = c[0] as { where: { type?: string; businessId: string; date?: object } };
      expect(args.where.type).toBe("expense");
      expect(args.where.businessId).toBe("biz-a");
    }
    const where = (mockPrisma.transaction.groupBy.mock.calls[0][0] as { where: { date: { gte: Date; lte: Date } } }).where;
    expect(where.date.gte.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(where.date.lte.toISOString()).toBe("2026-12-31T23:59:59.999Z");
  });

  it("falls back to the revenue delta wording without fabricating drivers", async () => {
    mockPrisma.transaction.groupBy
      .mockResolvedValueOnce([
        makeTypeGroup("income", 1_000_000),
        makeTypeGroup("expense", 400_000),
      ])
      .mockResolvedValueOnce([makeTypeGroup("income", 800_000)])
      .mockResolvedValueOnce([]) // no current expense categories
      .mockResolvedValueOnce([]);
    mockPrisma.category.findMany.mockResolvedValueOnce([]);

    const answer = await getAssistantAnswer(
      "What have I spent money on that made my profit lower this year?",
      NOW,
    );
    expect(answer.kind).toBe("answer");
    expect(answer.text).toContain("Spending doesn’t reduce your revenue");
    expect(answer.text).not.toContain("The biggest drivers were");
  });
});

describe("spending distribution (service pipeline)", () => {
  it("breaks spending down by category share, expenses only", async () => {
    mockPrisma.transaction.groupBy
      .mockResolvedValueOnce([makeTypeGroup("expense", 600_000, 6)])
      .mockResolvedValueOnce([makeTypeGroup("expense", 400_000, 4)])
      .mockResolvedValueOnce([
        makeCategoryGroup("cat-rent", 360_000),
        makeCategoryGroup("cat-utilities", 240_000),
      ])
      .mockResolvedValueOnce([]);
    mockPrisma.category.findMany.mockResolvedValueOnce([
      { id: "cat-rent", name: "Rent" },
      { id: "cat-utilities", name: "Utilities" },
    ]);

    const answer = await getAssistantAnswer(
      "Which categories did I spend on this month?",
      NOW,
    );
    expect(answer.kind).toBe("answer");
    expect(answer.text).toContain("broke down as Rent (60%) and Utilities (40%)");

    const categoryCalls = mockPrisma.transaction.groupBy.mock.calls.filter((c) => {
      const args = c[0] as { by?: string[] };
      return args.by?.[0] === "categoryId";
    });
    for (const c of categoryCalls) {
      const args = c[0] as { where: { type?: string } };
      expect(args.where.type).toBe("expense");
    }
  });
});

describe("period comparison (income, explicit months)", () => {
  it("compares June 2026 income against the prior month's", async () => {
    mockPrisma.transaction.groupBy
      .mockResolvedValueOnce([makeTypeGroup("income", 1_000_000)])
      .mockResolvedValueOnce([makeTypeGroup("income", 400_000)]);

    const answer = await getAssistantAnswer(
      "How does my income in June 2026 compare to May 2026?",
      NOW,
    );
    expect(answer.kind).toBe("answer");
    expect(answer.text).toBe(
      "Compared to May 2026, your income went from ₦400,000 to ₦1,000,000 (+150%).",
    );

    const current = mockPrisma.transaction.groupBy.mock.calls[0][0] as {
      where: { date: { gte: Date; lte: Date } };
    };
    expect(current.where.date.gte.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(current.where.date.lte.toISOString()).toBe("2026-06-30T23:59:59.999Z");

    const prior = mockPrisma.transaction.groupBy.mock.calls[1][0] as {
      where: { date: { gte: Date; lte: Date } };
    };
    expect(prior.where.date.lte.toISOString()).toBe("2026-05-31T23:59:59.999Z");
    expect(prior.where.date.gte.toISOString()).toBe("2026-05-02T00:00:00.000Z");
  });
});

describe("conscious period windows (last year, rolling recent)", () => {
  it("binds last year to calendar bounds through the pipeline", async () => {
    mockPrisma.transaction.groupBy
      .mockResolvedValueOnce([makeTypeGroup("income", 6_000_000)])
      .mockResolvedValueOnce([makeTypeGroup("income", 5_000_000)]);

    const answer = await getAssistantAnswer("How much income did I earn last year?", NOW);
    expect(answer.kind).toBe("answer");
    expect(answer.text).toContain("Income in 2025 was ₦6,000,000");

    const where = (mockPrisma.transaction.groupBy.mock.calls[0][0] as {
      where: { date: { gte: Date; lte: Date } };
    }).where;
    expect(where.date.gte.toISOString()).toBe("2025-01-01T00:00:00.000Z");
    expect(where.date.lte.toISOString()).toBe("2025-12-31T23:59:59.999Z");
  });

  it("scopes a 30-day rolling window to today backwards", async () => {
    mockPrisma.transaction.groupBy
      .mockResolvedValueOnce([makeTypeGroup("expense", 90_000)])
      .mockResolvedValueOnce([makeTypeGroup("expense", 70_000)]);

    const answer = await getAssistantAnswer("How much did I spend in the past few weeks?", NOW);
    expect(answer.kind).toBe("answer");
    expect(answer.text).toContain("Spending in last 30 days was ₦90,000");

    const where = (mockPrisma.transaction.groupBy.mock.calls[0][0] as {
      where: { date: { gte: Date; lte: Date } };
    }).where;
    expect(where.date.gte.toISOString()).toBe("2026-07-17T00:00:00.000Z");
    expect(where.date.lte.toISOString()).toBe("2026-08-15T23:59:59.999Z");
  });
});