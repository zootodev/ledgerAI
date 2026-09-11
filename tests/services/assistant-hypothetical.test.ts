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
import { askAssistantQuestion } from "@/lib/services/assistant";
import { getAIService } from "@/lib/ai/provider";
import {
  findLastUserQuestionForContext,
  persistAssistantExchange,
} from "@/lib/services/assistant-conversations";
import { CLARIFICATION_ANSWER, SAVINGS_CLARIFICATION_ANSWER } from "@/lib/finance/assistant";

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
const mockFindLastUserQuestion = vi.mocked(findLastUserQuestionForContext);

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
  mockPersistExchange.mockResolvedValue({
    conversationId: "c1",
    userMessageId: "um-1",
    assistantMessageId: "am-1",
    created: false,
  });
  mockFindLastUserQuestion.mockReset();
});

/** The four aggregate reads a bounded (non-balance) expense question needs. */
function stubExpenseMetrics(
  current: { type: string; amount: number }[],
  prior: { type: string; amount: number }[],
  currentCategories: [string, number][],
  priorCategories: [string, number][],
  categoryNames: { id: string; name: string }[],
) {
  mockPrisma.transaction.groupBy
    .mockResolvedValueOnce(current.map((g) => makeTypeGroup(g.type, g.amount)))
    .mockResolvedValueOnce(prior.map((g) => makeTypeGroup(g.type, g.amount)))
    .mockResolvedValueOnce(currentCategories.map(([id, a]) => makeCategoryGroup(id, a)))
    .mockResolvedValueOnce(priorCategories.map(([id, a]) => makeCategoryGroup(id, a)));
  mockPrisma.category.findMany.mockResolvedValueOnce(categoryNames);
}

describe("hypothetical: the duplicate/stale-answer regression", () => {
  it("answers the profit question and the expenses question DIFFERENTLY", async () => {
    const profitQuestion = "If I spent less on others, would my profit increase than before?";
    const expensesQuestion = "If I spent less on others, would my expense reduce than before?";

    // Turn 1: profit hypothetical.
    stubExpenseMetrics(
      [{ type: "income", amount: 1_000_000 }, { type: "expense", amount: 400_000 }],
      [{ type: "income", amount: 800_000 }],
      [["cat-other", 300_000]],
      [],
      [{ id: "cat-other", name: "Other" }],
    );
    const profit = await askAssistantQuestion(profitQuestion, "c1", NOW);

    // Turn 2: same conversation, next turn asks about EXPENSES. The answer
    // must be derived from THIS question, not the previous one's narration.
    stubExpenseMetrics(
      [{ type: "income", amount: 1_000_000 }, { type: "expense", amount: 700_000 }],
      [{ type: "income", amount: 800_000 }],
      [["cat-other", 300_000]],
      [],
      [{ id: "cat-other", name: "Other" }],
    );
    const expenses = await askAssistantQuestion(expensesQuestion, "c1", NOW);

    expect(profit.kind).toBe("answer");
    expect(expenses.kind).toBe("answer");
    expect(profit.text).not.toBe(expenses.text);

    expect(profit.text).toContain("increase your profit by exactly the amount you save");
    expect(profit.text).toContain("on other");
    expect(profit.text).not.toContain("doesn’t reduce your revenue");

    expect(expenses.text).toContain(
      "Reducing your spending on other reduces your total expenses",
    );
    expect(expenses.text).not.toContain("profit by exactly the amount you save");
  });

  it("never reads the conversation context for a self-contained hypothetical", async () => {
    stubExpenseMetrics(
      [{ type: "income", amount: 1_000_000 }, { type: "expense", amount: 400_000 }],
      [{ type: "income", amount: 800_000 }],
      [],
      [],
      [],
    );
    await askAssistantQuestion("If I spent less on others, would my profit increase?", "c1", NOW);
    expect(mockFindLastUserQuestion).not.toHaveBeenCalled();
  });
});

describe("hypothetical: resolvable fragments in a conversation", () => {
  it("resolves 'that' to the category the previous answer cited", async () => {
    mockFindLastUserQuestion.mockResolvedValue({
      content: "What did I spend the most on last month?",
      createdAt: "2026-08-10T10:00:00.000Z",
      answer: "Your top expense category in July 2026 was Rent at ₦300,000 — 50% of all expenses.",
    });
    stubExpenseMetrics(
      [{ type: "income", amount: 1_000_000 }, { type: "expense", amount: 800_000 }],
      [{ type: "income", amount: 900_000 }],
      [["cat-rent", 300_000]],
      [],
      [{ id: "cat-rent", name: "Rent" }],
    );

    const outcome = await askAssistantQuestion("What if I reduced that by ₦50,000?", "c1", NOW);

    expect(outcome.kind).toBe("answer");
    // "that" → Rent (from OUR deterministic answer, never user text).
    expect(outcome.text).toContain("Reducing your spending on rent reduces your total expenses");
    expect(outcome.text).toContain("spending ₦50,000 less would take them to ₦750,000");
    // The context read is bounded to the tenant's conversation.
    expect(mockFindLastUserQuestion).toHaveBeenCalledWith(mockPrisma, "biz-a", "c1");
  });

  it("merges a bare hypothetical amount against a previous profit question", async () => {
    mockFindLastUserQuestion.mockResolvedValue({
      content: "What was my profit last month?",
      createdAt: "2026-08-10T10:00:00.000Z",
      answer: "Your profit in July 2026 was ₦200,000.",
    });
    stubExpenseMetrics(
      [{ type: "income", amount: 1_000_000 }, { type: "expense", amount: 800_000 }],
      [{ type: "income", amount: 900_000 }],
      [["cat-rent", 400_000]],
      [],
      [{ id: "cat-rent", name: "Rent" }],
    );

    const outcome = await askAssistantQuestion("What if I spent ₦50,000 less?", "c1", NOW);

    expect(outcome.kind).toBe("answer");
    expect(outcome.text).toContain("If you cut ₦50,000 from spending, profit would rise to ₦250,000");
    expect(outcome.text).toContain("as long as your income stays the same");
  });

  it("repeats the prior subject one window earlier for 'what about before?'", async () => {
    mockFindLastUserQuestion.mockResolvedValue({
      content: "How much did I spend on rent?",
      createdAt: "2026-08-10T10:00:00.000Z",
      answer: "Spending on rent in August 2026 was ₦150,000.",
    });
    // Merged query is a custom July 2026 window: types (July), prior (June),
    // then rent current + prior.
    mockPrisma.transaction.groupBy
      .mockResolvedValueOnce([makeTypeGroup("expense", 150_000)])
      .mockResolvedValueOnce([makeTypeGroup("expense", 120_000)])
      .mockResolvedValueOnce([makeCategoryGroup("cat-rent", 150_000)])
      .mockResolvedValueOnce([makeCategoryGroup("cat-rent", 120_000)]);
    mockPrisma.category.findMany.mockResolvedValueOnce([{ id: "cat-rent", name: "Rent" }]);

    const outcome = await askAssistantQuestion("What about before?", "c1", NOW);

    expect(outcome.kind).toBe("answer");
    expect(outcome.text).toContain("Spending on rent in July 2026 was ₦150,000");
    // The re-derived window is labelled with the prior period, proving the
    // merge changed the window (not the previous answer being replayed).
    expect(mockPersistExchange).toHaveBeenCalledWith(
      mockPrisma,
      "biz-a",
      "c1",
      "Rent spending — July 2026",
      "What about before?",
      outcome.text,
    );
  });
});

describe("hypothetical: honest fallbacks", () => {
  it("clarifies a bare referential question instead of guessing", async () => {
    const outcome = await askAssistantQuestion("how would that affect my profit?", null, NOW);

    expect(outcome.kind).toBe("clarification");
    expect(outcome.text).toBe(CLARIFICATION_ANSWER);
    expect(outcome.conversationId).toBe("c1");
    expect(mockedRequireAuthContext).toHaveBeenCalled();
    expect(mockPersistExchange).toHaveBeenCalled();
  });

  it("does not resolve a fragment when there is no owned context", async () => {
    mockFindLastUserQuestion.mockResolvedValue(null);

    const outcome = await askAssistantQuestion("What if I reduced that by ₦50,000?", "c1", NOW);

    expect(outcome.kind).toBe("clarification");
    expect(outcome.conversationId).toBe("c1");
    expect(mockPersistExchange).toHaveBeenCalled();
    expect(mockPrisma.transaction.groupBy).not.toHaveBeenCalled();
  });
});

describe("savings: ambiguity, owned-context resolution, and no invented definitions", () => {
  it("clarifies a savings question instead of inventing a definition", async () => {
    mockFindLastUserQuestion.mockResolvedValue(null);

    const outcome = await askAssistantQuestion("How much did I save last month?", "c1", NOW);

    expect(outcome.kind).toBe("clarification");
    expect(outcome.text).toBe(SAVINGS_CLARIFICATION_ANSWER);
    expect(outcome.conversationId).toBe("c1");
    expect(mockedRequireAuthContext).toHaveBeenCalled();
    expect(mockPersistExchange).toHaveBeenCalled();
    expect(mockPrisma.transaction.groupBy).not.toHaveBeenCalled();
  });

  it("resolves 'how much would I save?' against an owned hypothetical context", async () => {
    mockFindLastUserQuestion.mockResolvedValue({
      content: "What if I spent ₦50,000 less on Other?",
      createdAt: "2026-08-10T10:00:00.000Z",
      answer: "If you cut ₦50,000 from spending on other, profit would rise by exactly the amount saved.",
    });
    stubExpenseMetrics(
      [{ type: "income", amount: 1_000_000 }, { type: "expense", amount: 800_000 }],
      [{ type: "income", amount: 900_000 }],
      [["cat-other", 800_000]],
      [],
      [{ id: "cat-other", name: "Other" }],
    );

    const outcome = await askAssistantQuestion("How much would I save?", "c1", NOW);

    expect(outcome.kind).toBe("answer");
    expect(outcome.text).toContain("If you cut ₦50,000 from spending");
    expect(outcome.text).toContain("on other");
    expect(mockFindLastUserQuestion).toHaveBeenCalledWith(mockPrisma, "biz-a", "c1");
  });

  it("does not resolve a savings question to a metric when the owned context is unrelated", async () => {
    mockFindLastUserQuestion.mockResolvedValue({
      content: "What was my profit last month?",
      createdAt: "2026-08-10T10:00:00.000Z",
      answer: "Your profit in July 2026 was ₦200,000.",
    });

    const outcome = await askAssistantQuestion("How much did I save?", "c1", NOW);

    // Past-tense "did I save" is not a modal hypothetical fragment, so it
    // stays genuinely ambiguous → clarification rather than a guessed number.
    // The clarification is persisted (owned conversation context), but no
    // financial data is ever computed.
    expect(outcome.kind).toBe("clarification");
    expect(outcome.text).toBe(SAVINGS_CLARIFICATION_ANSWER);
    expect(mockPrisma.transaction.groupBy).not.toHaveBeenCalled();
  });
});