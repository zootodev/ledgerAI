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

describe("conversational follow-ups", () => {
  it("resolves a period-only follow-up against the conversation's own last question", async () => {
    mockFindLastUserQuestion.mockResolvedValue({
      content: "How much did I spend on rent?",
      createdAt: "2026-08-10T10:00:00.000Z",
      answer: null,
    });
    mockPrisma.transaction.groupBy
      .mockResolvedValueOnce([makeTypeGroup("expense", 150_000)]) // July types
      .mockResolvedValueOnce([makeTypeGroup("expense", 100_000)]) // prior (June) types
      .mockResolvedValueOnce([makeCategoryGroup("cat-rent", 150_000)]) // July rent
      .mockResolvedValueOnce([makeCategoryGroup("cat-rent", 100_000)]); // June rent
    mockPrisma.category.findMany.mockResolvedValueOnce([
      { id: "cat-rent", name: "Rent" },
    ]);

    const outcome = await askAssistantQuestion("What about last month?", "c1", NOW);

    expect(outcome.kind).toBe("answer");
    expect(outcome.text).toContain("Spending on rent in July 2026 was ₦150,000");
    expect(outcome.conversationId).toBe("c1");

    // The context read is bounded to the tenant's conversation.
    expect(mockFindLastUserQuestion).toHaveBeenCalledWith(
      mockPrisma,
      "biz-a",
      "c1",
    );

    // The merge kept the prior intent (categorySpend on Rent) and only
    // changed the period — no client flag is involved.
    expect(mockPersistExchange).toHaveBeenCalledWith(
      mockPrisma,
      "biz-a",
      "c1",
      "Rent spending — Last month",
      "What about last month?",
      outcome.text,
    );
  });

  it("merges a last-year follow-up and never calls the balance path", async () => {
    mockFindLastUserQuestion.mockResolvedValue({
      content: "Do I have money in my account?",
      createdAt: "2026-08-01T09:00:00.000Z",
      answer: null,
    });
    // balance snapshot (2025 as-of), current 2025 types, prior 2024 types.
    mockPrisma.transaction.groupBy
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const outcome = await askAssistantQuestion("And last year?", "c1", NOW);

    expect(outcome.kind).toBe("answer");
    expect(outcome.text).toContain("Your cash balance across all accounts is ₦0");
    expect(mockPersistExchange).toHaveBeenCalledWith(
      mockPrisma,
      "biz-a",
      "c1",
      "Cash balance — Last year",
      "And last year?",
      expect.any(String),
    );
  });

  it("does not resolve a follow-up when the owned context yields no prior question", async () => {
    // Conversation missing or owned by another tenant: no prior, and the
    // period-only turn itself is a needs_subject clarification — which is
    // persisted as part of owned conversation context.
    mockFindLastUserQuestion.mockResolvedValue(null);

    const outcome = await askAssistantQuestion("What about last month?", "c1", NOW);

    expect(outcome.kind).toBe("clarification");
    expect(outcome.conversationId).toBe("c1");
    expect(mockPersistExchange).toHaveBeenCalled();
    expect(mockPrisma.transaction.groupBy).not.toHaveBeenCalled();
  });

  it("never reads conversation context for a normal question", async () => {
    mockPrisma.transaction.groupBy
      .mockResolvedValueOnce([makeTypeGroup("income", 700_000)])
      .mockResolvedValueOnce([makeTypeGroup("income", 600_000)]);

    const outcome = await askAssistantQuestion("How much income did I earn last month?", "c1", NOW);

    expect(outcome.kind).toBe("answer");
    expect(mockFindLastUserQuestion).not.toHaveBeenCalled();
  });

  it("persists a period-only turn without a conversation as a needs_subject clarification", async () => {
    const outcome = await askAssistantQuestion("What about last month?", null, NOW);

    expect(outcome.kind).toBe("clarification");
    expect(outcome.conversationId).toBe("c1");
    expect(mockedRequireAuthContext).toHaveBeenCalled();
    expect(mockPersistExchange).toHaveBeenCalled();
  });
});