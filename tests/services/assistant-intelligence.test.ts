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
}));

import { requireAuthContext, AuthorizationError } from "@/lib/services/auth-context";
import {
  askAssistantQuestion,
  getAssistantAnswer,
} from "@/lib/services/assistant";
import { getAIService } from "@/lib/ai/provider";
import { persistAssistantExchange } from "@/lib/services/assistant-conversations";
import type { QuestionUnderstanding } from "@/lib/ai/understanding";

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

function understanding(configured: boolean, classify: () => Promise<unknown>): QuestionUnderstanding {
  return { configured, classify: vi.fn(classify) };
}

/** Seed a this-month window: current + prior types, then current + prior categories. */
function seedThisMonthWithCategories(categoryGroups: ReturnType<typeof makeCategoryGroup>[]) {
  mockPrisma.transaction.groupBy
    .mockResolvedValueOnce([makeTypeGroup("expense", 600_000, 6)]) // current types
    .mockResolvedValueOnce([makeTypeGroup("expense", 400_000, 4)]) // prior types
    .mockResolvedValueOnce(categoryGroups) // current categories
    .mockResolvedValueOnce([]); // prior categories
}

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

describe("lowest expense category (service pipeline)", () => {
  it("answers from the min expense category, scoped to the session business and expenses only", async () => {
    seedThisMonthWithCategories([
      makeCategoryGroup("cat-rent", 300_000),
      makeCategoryGroup("cat-utilities", 80_000),
    ]);
    mockPrisma.category.findMany.mockResolvedValueOnce([
      { id: "cat-rent", name: "Rent" },
      { id: "cat-utilities", name: "Utilities" },
    ]);

    const answer = await getAssistantAnswer(
      "Which category did I spend the least on?",
      NOW,
    );
    expect(answer.kind).toBe("answer");
    expect(answer.text).toContain("Utilities");
    expect(answer.text).toContain("80,000");

    const categoryCalls = mockPrisma.transaction.groupBy.mock.calls.filter((c) => {
      const args = c[0] as { by?: string[] };
      return args.by?.[0] === "categoryId";
    });
    expect(categoryCalls.length).toBe(2);
    for (const c of categoryCalls) {
      const args = c[0] as { where: { type: string; businessId: string } };
      expect(args.where.type).toBe("expense"); // transfers can never leak in
      expect(args.where.businessId).toBe(businessA.id);
    }
  });

  it("lists every tied lowest category, alphabetically and deterministically", async () => {
    seedThisMonthWithCategories([
      makeCategoryGroup("cat-rent", 200_000),
      makeCategoryGroup("cat-software", 25_000),
      makeCategoryGroup("cat-utilities", 25_000),
    ]);
    mockPrisma.category.findMany.mockResolvedValueOnce([
      { id: "cat-rent", name: "Rent" },
      { id: "cat-software", name: "Software" },
      { id: "cat-utilities", name: "Utilities" },
    ]);

    const answer = await getAssistantAnswer(
      "Which category did I spend the least on?",
      NOW,
    );
    expect(answer.kind).toBe("answer");
    expect(answer.text).toBe(
      "You spent the least on Software and Utilities, at ₦25,000 each, August 2026.",
    );
    expect(answer.text).not.toContain("Rent");
  });

  it("ignores zero-activity categories when picking the lowest", async () => {
    seedThisMonthWithCategories([
      makeCategoryGroup("cat-rent", 300_000),
      makeCategoryGroup("cat-software", 0),
      makeCategoryGroup("cat-food", 60_000),
    ]);
    mockPrisma.category.findMany.mockResolvedValueOnce([
      { id: "cat-rent", name: "Rent" },
      { id: "cat-software", name: "Software" },
      { id: "cat-food", name: "Food" },
    ]);

    const answer = await getAssistantAnswer(
      "Which category did I spend the least on?",
      NOW,
    );
    expect(answer.kind).toBe("answer");
    expect(answer.text).toContain("Food");
    expect(answer.text).toContain("60,000");
    expect(answer.text).not.toContain("Software");
  });

  it("answers an all-time lowest category without a prior-window fetch", async () => {
    mockPrisma.transaction.groupBy
      .mockResolvedValueOnce([makeTypeGroup("expense", 600_000, 6)]) // current types (all time)
      .mockResolvedValueOnce([makeCategoryGroup("cat-rent", 100_000)]); // current categories
    mockPrisma.category.findMany.mockResolvedValueOnce([
      { id: "cat-rent", name: "Rent" },
    ]);

    const answer = await getAssistantAnswer(
      "Which category did I spend the least on overall?",
      NOW,
    );
    expect(answer.kind).toBe("answer");
    expect(answer.text).toContain("all time");

    expect(mockPrisma.transaction.groupBy.mock.calls).toHaveLength(2); // types + categories only
  });

  it("returns insufficient when the window has no active expense categories", async () => {
    mockPrisma.transaction.groupBy
      .mockResolvedValueOnce([]) // current types
      .mockResolvedValueOnce([]) // prior types
      .mockResolvedValueOnce([]) // current categories
      .mockResolvedValueOnce([]); // prior categories
    mockPrisma.category.findMany.mockResolvedValueOnce([]);

    const answer = await getAssistantAnswer(
      "Which category did I spend the least on?",
      NOW,
    );
    expect(answer.kind).toBe("insufficient");
  });
});

describe("clarification and out-of-scope (no data, no DB)", () => {
  it("asks for clarification on vague financial questions and touches nothing", async () => {
    const answer = await getAssistantAnswer("How did I do?", NOW);
    expect(answer.kind).toBe("unsupported");
    expect(answer.text).toContain("clarify");
    expect(mockedRequireAuthContext).not.toHaveBeenCalled();
    expect(mockPrisma.transaction.groupBy).not.toHaveBeenCalled();
  });

  it("answers out-of-scope questions professionally and touches nothing", async () => {
    for (const q of ["What is the weather in Lagos?", "Who won the football match?"]) {
      const answer = await getAssistantAnswer(q, NOW);
      expect(answer.kind).toBe("unsupported");
      expect(answer.text).toContain("business finances");
      expect(mockedRequireAuthContext).not.toHaveBeenCalled();
      expect(mockPrisma.transaction.groupBy).not.toHaveBeenCalled();
    }
  });

  it("never persists clarification or out-of-scope answers", async () => {
    const clarification = await askAssistantQuestion("What happened?", "c1", NOW);
    expect(clarification.kind).toBe("unsupported");
    expect(clarification.conversationId).toBeNull();
    expect(clarification.text).toContain("clarify");

    const unsupported = await askAssistantQuestion("Play me a song", "c1", NOW);
    expect(unsupported.kind).toBe("unsupported");
    expect(unsupported.conversationId).toBeNull();

    expect(mockPersistExchange).not.toHaveBeenCalled();
    expect(mockPrisma.transaction.groupBy).not.toHaveBeenCalled();
  });
});

describe("configured understanding provider (future AI seam)", () => {
  it("uses a provider's valid output to rescue a grammar-missed finance question", async () => {
    mockPrisma.transaction.groupBy
      .mockResolvedValueOnce([makeTypeGroup("expense", 600_000, 6)]) // current types
      .mockResolvedValueOnce([]); // prior types
    mockedGetAIService.mockReturnValue({
      ...mockAIService,
      understanding: understanding(true, async () => ({
        classification: "query",
        intent: "expenses",
        period: { kind: "this_month" },
      })),
    });

    const answer = await getAssistantAnswer("fiscal outlay tallied", NOW);
    expect(answer.kind).toBe("answer");
    expect(answer.text).toContain("600,000");
  });

  it("keeps the deterministic engine authoritative for grammar-answerable questions", async () => {
    mockPrisma.transaction.groupBy
      .mockResolvedValueOnce([makeTypeGroup("income", 1_000_000)])
      .mockResolvedValueOnce([]); // prior types
    mockedGetAIService.mockReturnValue({
      ...mockAIService,
      understanding: understanding(true, async () => ({
        classification: "query",
        intent: "insert garbage",
        period: { kind: "this_month" },
      })),
    });

    const answer = await getAssistantAnswer("How much income did I earn?", NOW);
    expect(answer.kind).toBe("answer");
    expect(answer.text).toContain("1,000,000");
  });

  it("silently falls back when a configured provider throws", async () => {
    mockedGetAIService.mockReturnValue({
      ...mockAIService,
      understanding: understanding(true, async () => {
        throw new Error("provider exploded");
      }),
    });

    const answer = await getAssistantAnswer("fiscal outlay tallied", NOW);
    expect(answer.kind).toBe("unsupported");
    expect(answer.text).not.toContain("provider exploded");
    expect(mockPrisma.transaction.groupBy).not.toHaveBeenCalled();
  });

  it("ignores malformed structured output and falls back deterministically", async () => {
    mockedGetAIService.mockReturnValue({
      ...mockAIService,
      understanding: understanding(true, async () => ({
        classification: "query",
        intent: "delete_everything",
        period: { kind: "this_month" },
      })),
    });

    const answer = await getAssistantAnswer("fiscal outlay tallied", NOW);
    expect(answer.kind).toBe("unsupported");
    expect(answer.text).toContain("business finances");
  });

  it("honors a provider clarification for a vague question the grammar missed", async () => {
    mockedGetAIService.mockReturnValue({
      ...mockAIService,
      understanding: understanding(true, async () => ({
        classification: "clarification",
        reason: "ambiguous_financial_metric",
      })),
    });

    const answer = await getAssistantAnswer("fiscal outlay tallied", NOW);
    expect(answer.kind).toBe("unsupported");
    expect(answer.text).toContain("clarify");
    expect(mockedRequireAuthContext).not.toHaveBeenCalled();
  });

  it("rethrows authorization errors from the data path as before", async () => {
    mockedRequireAuthContext.mockRejectedValue(new AuthorizationError("No business"));
    mockPrisma.transaction.groupBy.mockResolvedValueOnce([makeTypeGroup("expense", 1, 1)]);
    await expect(
      askAssistantQuestion("How much did I spend?", null, NOW),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});