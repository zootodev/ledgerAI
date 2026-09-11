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
import { askAssistantQuestion } from "@/lib/services/assistant";
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

function makeCategoryGroup(categoryId: string | null, amount: number) {
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

function seedThisMonth(
  windowGroups: ReturnType<typeof makeTypeGroup>[] = [],
) {
  mockPrisma.transaction.groupBy
    .mockResolvedValueOnce(windowGroups) // current types
    .mockResolvedValueOnce(windowGroups); // prior types
}

describe("askAssistantQuestion (persistent pipeline)", () => {
  it("creates a conversation and returns the persisted exchange ids", async () => {
    seedThisMonth([makeTypeGroup("expense", 600_000, 3)]);
    mockPersistExchange.mockResolvedValueOnce({
      conversationId: "c-new",
      userMessageId: "m-u",
      assistantMessageId: "m-a",
      created: true,
    });

    const result = await askAssistantQuestion(
      "How much did I spend last month?",
      null,
      NOW,
    );

    expect(result.kind).toBe("answer");
    expect(result.conversationId).toBe("c-new");
    expect(result.userMessageId).toBe("m-u");
    expect(result.assistantMessageId).toBe("m-a");
  });

  it("scopes persistence to the session business and derives a stable title", async () => {
    mockPrisma.transaction.groupBy
      .mockResolvedValueOnce([makeTypeGroup("income", 1_000_000, 5)])
      .mockResolvedValueOnce([]); // prior types
    mockPersistExchange.mockResolvedValueOnce({
      conversationId: "c-new",
      userMessageId: "m-u",
      assistantMessageId: "m-a",
      created: true,
    });

    await askAssistantQuestion("How much income in June 2026?", null, NOW);

    expect(mockPersistExchange).toHaveBeenCalledTimes(1);
    const [prisma, businessId, conversationId, title, question, answerText] =
      mockPersistExchange.mock.calls[0];
    expect(businessId).toBe(businessA.id);
    expect(conversationId).toBeNull();
    expect(title).toBe("Income — June 2026");
    expect(question).toBe("How much income in June 2026?");
    expect(answerText).toContain("1,000,000");
    expect(prisma as unknown).toBe(mockPrisma);
  });

  it("derives a category title for category questions", async () => {
    mockPrisma.transaction.groupBy
      .mockResolvedValueOnce([makeTypeGroup("expense", 500_000, 4)])
      .mockResolvedValueOnce([makeTypeGroup("expense", 400_000, 3)])
      .mockResolvedValueOnce([makeCategoryGroup("cat-rent", 280_000)])
      .mockResolvedValueOnce([makeCategoryGroup("cat-rent", 260_000)]);
    mockPrisma.category.findMany.mockResolvedValueOnce([{ id: "cat-rent", name: "Rent" }]);
    mockPersistExchange.mockResolvedValueOnce({
      conversationId: "c-new",
      userMessageId: "m-u",
      assistantMessageId: "m-a",
      created: true,
    });

    await askAssistantQuestion("How much did I spend on rent?", null, NOW);

    expect(mockPersistExchange.mock.calls[0][3]).toBe("Rent spending — This month");
  });

  it("continues an existing conversation when an id is given", async () => {
    seedThisMonth([makeTypeGroup("expense", 600_000, 3)]);
    mockPersistExchange.mockResolvedValueOnce({
      conversationId: "c1",
      userMessageId: "m-u",
      assistantMessageId: "m-a",
      created: false,
    });

    await askAssistantQuestion("How much did I spend last month?", "c1", NOW);

    const conversationId = mockPersistExchange.mock.calls[0][2];
    expect(conversationId).toBe("c1");
  });

  it("persists insufficient answers too (they were asked and answered)", async () => {
    mockPrisma.transaction.groupBy
      .mockResolvedValueOnce([]) // current
      .mockResolvedValueOnce([]); // prior
    mockPersistExchange.mockResolvedValueOnce({
      conversationId: "c-new",
      userMessageId: "m-u",
      assistantMessageId: "m-a",
      created: true,
    });

    const result = await askAssistantQuestion("How much did I spend?", null, NOW);
    expect(result.kind).toBe("insufficient");
    expect(mockPersistExchange).toHaveBeenCalledTimes(1);
  });

  it("persists the narrated text (the seam decides the final wording)", async () => {
    seedThisMonth([makeTypeGroup("expense", 600_000, 3)]);
    mockAssistant.answer.mockResolvedValueOnce("Narrated spending summary");
    mockPersistExchange.mockResolvedValueOnce({
      conversationId: "c-new",
      userMessageId: "m-u",
      assistantMessageId: "m-a",
      created: true,
    });

    await askAssistantQuestion("How much did I spend last month?", null, NOW);

    expect(mockPersistExchange.mock.calls[0][5]).toBe("Narrated spending summary");
  });

  it("short-circuits unsupported questions WITHOUT auth or persistence", async () => {
    const result = await askAssistantQuestion("What is the meaning of life?", "c1", NOW);

    expect(result.kind).toBe("unsupported");
    expect(result.conversationId).toBeNull();
    expect(mockedRequireAuthContext).not.toHaveBeenCalled();
    expect(mockPersistExchange).not.toHaveBeenCalled();
    expect(mockPrisma.transaction.groupBy).not.toHaveBeenCalled();
  });

  it("rethrows authorization errors so the action can redirect", async () => {
    mockedRequireAuthContext.mockRejectedValue(
      new AuthorizationError("You must be signed in."),
    );
    await expect(
      askAssistantQuestion("How much did I spend last month?", null, NOW),
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(mockPersistExchange).not.toHaveBeenCalled();
  });

  it("rethrows vanished-conversation errors without never writing answers", async () => {
    seedThisMonth([makeTypeGroup("expense", 600_000, 3)]);
    mockPersistExchange.mockRejectedValueOnce(new Error("Conversation not found."));

    await expect(
      askAssistantQuestion("How much did I spend last month?", "c-gone", NOW),
    ).rejects.toThrow("Conversation not found.");
  });
});