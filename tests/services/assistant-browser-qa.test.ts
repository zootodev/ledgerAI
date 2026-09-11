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
  findRecentOwnedExchanges: vi.fn(),
}));

import { requireAuthContext } from "@/lib/services/auth-context";
import { askAssistantQuestion } from "@/lib/services/assistant";
import { getAIService } from "@/lib/ai/provider";
import {
  findLastUserQuestionForContext,
  findRecentOwnedExchanges,
  persistAssistantExchange,
} from "@/lib/services/assistant-conversations";
import {
  AMOUNT_CLARIFICATION_ANSWER,
  SAVINGS_CLARIFICATION_ANSWER,
  UNSUPPORTED_ANSWER,
} from "@/lib/finance/assistant";

const userA = { id: "auth-user-a", email: "a@example.com", name: "User A" };
const businessA = { id: "biz-a", name: "A Ltd", currency: "NGN" };
const NOW = new Date("2026-09-10T12:00:00.000Z");

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
const mockFindRecentExchanges = vi.mocked(findRecentOwnedExchanges);

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
  mockFindRecentExchanges.mockReset();
  mockFindRecentExchanges.mockResolvedValue([]);
});

/** The four aggregate reads a bounded expense question needs. */
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

describe("browser QA issue 1: amount reference + conversation context", () => {
  it("resolves 'What did I spend 187,600 on?' against the preceding owned total", async () => {
    // Preceding exchange: our own deterministic answer cited the total.
    mockFindLastUserQuestion.mockResolvedValue({
      content: "How much did I spend in August 2026?",
      createdAt: "2026-08-10T10:00:00.000Z",
      answer: "Spending in August 2026 was ₦187,600.",
    });
    stubExpenseMetrics(
      [{ type: "income", amount: 500_000 }, { type: "expense", amount: 187_600 }],
      [],
      [
        ["cat-software", 97_200],
        ["cat-rent", 36_500],
        ["cat-marketing", 30_000],
      ],
      [],
      [
        { id: "cat-software", name: "Software" },
        { id: "cat-rent", name: "Rent" },
        { id: "cat-marketing", name: "Marketing" },
      ],
    );

    const outcome = await askAssistantQuestion("What did I spend 187,600 on?", "c1", NOW);

    expect(outcome.kind).toBe("answer");
    // Anchored wording: the narration brackets the figure we cited ourselves.
    expect(outcome.text).toContain("the ₦187,600 you asked about");
    expect(outcome.text).toContain("Software");
    expect(mockFindLastUserQuestion).toHaveBeenCalledWith(mockPrisma, "biz-a", "c1");
    expect(mockPersistExchange.mock.calls[0][3]).toBe("Spending breakdown — August 2026");
  });

  it("clarifies when the user's cited amount does not match our own total", async () => {
    mockFindLastUserQuestion.mockResolvedValue({
      content: "How much did I spend in August 2026?",
      createdAt: "2026-08-10T10:00:00.000Z",
      answer: "Spending in August 2026 was ₦150,000.",
    });

    const outcome = await askAssistantQuestion("What did I spend 187,600 on?", "c1", NOW);

    expect(outcome.kind).toBe("clarification");
    expect(outcome.text).toBe(AMOUNT_CLARIFICATION_ANSWER);
    expect(mockPrisma.transaction.groupBy).not.toHaveBeenCalled();
    expect(mockPersistExchange.mock.calls[0][3]).toBe("Amount clarification");
  });

  it("clarifies when there is no owned context to anchor against", async () => {
    mockFindLastUserQuestion.mockResolvedValue(null);

    const outcome = await askAssistantQuestion("What did I spend 187,600 on?", "c1", NOW);

    expect(outcome.kind).toBe("clarification");
    expect(outcome.text).toBe(AMOUNT_CLARIFICATION_ANSWER);
    expect(mockPrisma.transaction.groupBy).not.toHaveBeenCalled();
  });

  it("never resolves an amount reference against another tenant's or unrelated context", async () => {
    // The owned context is an UNRELATED figure (a profit answer), not our
    // "Spending in … was ₦…" narration — nothing is cited, so no guessing.
    mockFindLastUserQuestion.mockResolvedValue({
      content: "What was my profit in July 2026?",
      createdAt: "2026-08-10T10:00:00.000Z",
      answer: "Your profit in July 2026 was ₦200,000.",
    });

    const outcome = await askAssistantQuestion("What did I spend 187,600 on?", "c1", NOW);

    expect(outcome.kind).toBe("clarification");
    expect(outcome.text).toBe(AMOUNT_CLARIFICATION_ANSWER);
    expect(mockPrisma.transaction.groupBy).not.toHaveBeenCalled();
  });
});

describe("browser QA issue 2: category-spending is a breakdown, not an impact lecture", () => {
  it("answers 'What category made my spending in August 187,600?' as a breakdown", async () => {
    stubExpenseMetrics(
      [{ type: "income", amount: 500_000 }, { type: "expense", amount: 187_600 }],
      [],
      [
        ["cat-software", 97_200],
        ["cat-rent", 36_500],
        ["cat-marketing", 30_000],
      ],
      [],
      [
        { id: "cat-software", name: "Software" },
        { id: "cat-rent", name: "Rent" },
        { id: "cat-marketing", name: "Marketing" },
      ],
    );

    const outcome = await askAssistantQuestion(
      "What category made my spending in August 187,600?",
      null,
      NOW,
    );

    expect(outcome.kind).toBe("answer");
    // A breakdown with category amounts — NOT a revenue/profit narration.
    expect(outcome.text).toContain("your ₦187,600 spending");
    expect(outcome.text).toContain("Software");
    expect(outcome.text).toContain("Rent");
    expect(outcome.text).not.toContain("revenue");
    expect(mockPersistExchange.mock.calls[0][3]).toBe("Spending breakdown — August 2026");
  });
});

describe("browser QA issue 4: conversational amount re-anchoring flows", () => {
  it("re-anchors 'What was the 187,600 spent on?' against the plain expense narration", async () => {
    mockFindLastUserQuestion.mockResolvedValue({
      content: "How much did I spend in August 2026?",
      createdAt: "2026-08-10T10:00:00.000Z",
      answer: "Spending in August 2026 was ₦187,600.",
    });
    stubExpenseMetrics(
      [{ type: "income", amount: 500_000 }, { type: "expense", amount: 187_600 }],
      [],
      [
        ["cat-software", 97_200],
        ["cat-rent", 36_500],
        ["cat-marketing", 30_000],
      ],
      [],
      [
        { id: "cat-software", name: "Software" },
        { id: "cat-rent", name: "Rent" },
        { id: "cat-marketing", name: "Marketing" },
      ],
    );

    const outcome = await askAssistantQuestion("What was the 187,600 spent on?", "c1", NOW);

    expect(outcome.kind).toBe("answer");
    expect(outcome.text).toContain("the ₦187,600 you asked about");
    expect(outcome.text).toContain("Software");
    expect(mockPersistExchange.mock.calls[0][3]).toBe("Spending breakdown — August 2026");
  });

  it("re-anchors the same figure even after our own breakdown narration", async () => {
    // Prior exchange is ALREADY a breakdown answer — the earlier
    // "Spending in …" template and the period are gone from it, but our
    // breakdown narration still cites the total and its label.
    mockFindLastUserQuestion.mockResolvedValue({
      content: "What did I spend 187600 on?",
      createdAt: "2026-08-10T10:00:00.000Z",
      answer:
        "Of the ₦187,600 you asked about in August 2026, Software (₦97,200), Rent (₦36,500), and Marketing (₦30,000) accounted for 87%.",
    });
    stubExpenseMetrics(
      [{ type: "income", amount: 500_000 }, { type: "expense", amount: 187_600 }],
      [],
      [
        ["cat-software", 97_200],
        ["cat-rent", 36_500],
        ["cat-marketing", 30_000],
      ],
      [],
      [
        { id: "cat-software", name: "Software" },
        { id: "cat-rent", name: "Rent" },
        { id: "cat-marketing", name: "Marketing" },
      ],
    );

    const outcome = await askAssistantQuestion("What was that amount spent on?", "c1", NOW);

    expect(outcome.kind).toBe("answer");
    expect(outcome.text).toContain("the ₦187,600 you asked about");
    expect(mockPersistExchange.mock.calls[0][3]).toBe("Spending breakdown — August 2026");
  });

  it("walks back through our own clarification to re-anchor a bare figure continuation", async () => {
    // "the 187600" right after our amount clarification: the clarifier itself
    // cites no figure, but the breakdown narration one exchange earlier does.
    mockFindRecentExchanges.mockResolvedValue([
      {
        content: "What was the 187600 spent on?",
        answer: AMOUNT_CLARIFICATION_ANSWER,
      },
      {
        content: "What did I spend 187600 on?",
        answer:
          "Of the ₦187,600 you asked about in August 2026, Software (₦97,200), Rent (₦36,500), and Marketing (₦30,000) accounted for 87%.",
      },
    ]);
    stubExpenseMetrics(
      [{ type: "income", amount: 500_000 }, { type: "expense", amount: 187_600 }],
      [],
      [
        ["cat-software", 97_200],
        ["cat-rent", 36_500],
        ["cat-marketing", 30_000],
      ],
      [],
      [
        { id: "cat-software", name: "Software" },
        { id: "cat-rent", name: "Rent" },
        { id: "cat-marketing", name: "Marketing" },
      ],
    );

    const outcome = await askAssistantQuestion("the 187600", "c1", NOW);

    expect(outcome.kind).toBe("answer");
    expect(outcome.text).toContain("the ₦187,600 you asked about");
    expect(mockFindRecentExchanges).toHaveBeenCalledWith(mockPrisma, "biz-a", "c1");
    expect(mockPersistExchange.mock.calls[0][3]).toBe("Spending breakdown — August 2026");
  });

  it("does not resolve a register continuation when nothing owned cites a figure", async () => {
    // Recent exchanges carry narrations that cite NO total (profit wording) —
    // "that amount" must not grab numbers from anywhere else.
    mockFindRecentExchanges.mockResolvedValue([
      {
        content: "What was my profit last month?",
        answer: "Your net profit in August 2026 was ₦200,000.",
      },
    ]);

    const outcome = await askAssistantQuestion("That amount", "c1", NOW);

    expect(outcome.kind).toBe("clarification");
    expect(outcome.text).toBe(AMOUNT_CLARIFICATION_ANSWER);
    expect(mockPrisma.transaction.groupBy).not.toHaveBeenCalled();
  });
});

describe("browser QA issue 5: no-amount category breakdown", () => {
  it("answers 'What category made my spending in August?' as a breakdown", async () => {
    stubExpenseMetrics(
      [{ type: "income", amount: 500_000 }, { type: "expense", amount: 187_600 }],
      [],
      [
        ["cat-software", 97_200],
        ["cat-rent", 36_500],
        ["cat-marketing", 30_000],
      ],
      [],
      [
        { id: "cat-software", name: "Software" },
        { id: "cat-rent", name: "Rent" },
        { id: "cat-marketing", name: "Marketing" },
      ],
    );

    const outcome = await askAssistantQuestion("What category made my spending in August?", null, NOW);

    expect(outcome.kind).toBe("answer");
    expect(outcome.text).toContain("your ₦187,600 spending");
    expect(outcome.text).toContain("Software");
    expect(outcome.text).not.toContain("revenue");
    expect(mockPersistExchange.mock.calls[0][3]).toBe("Spending breakdown — August 2026");
  });

  it("answers 'How was my August spending divided by category?' as a breakdown", async () => {
    stubExpenseMetrics(
      [{ type: "income", amount: 500_000 }, { type: "expense", amount: 187_600 }],
      [],
      [
        ["cat-software", 97_200],
        ["cat-rent", 36_500],
        ["cat-marketing", 30_000],
      ],
      [],
      [
        { id: "cat-software", name: "Software" },
        { id: "cat-rent", name: "Rent" },
        { id: "cat-marketing", name: "Marketing" },
      ],
    );

    const outcome = await askAssistantQuestion("How was my August spending divided by category?", null, NOW);

    expect(outcome.kind).toBe("answer");
    expect(outcome.text).toContain("your ₦187,600 spending");
    expect(outcome.text).toContain("Software");
  });
});

describe("browser QA: savings both-readings are explicit and honest", () => {
  /** Drops a persisted savings clarification into owned context. */
  function seedSavingsClarification() {
    mockFindLastUserQuestion.mockResolvedValue({
      content: "How much did I save last month?",
      createdAt: "2026-09-05T10:00:00.000Z",
      answer: SAVINGS_CLARIFICATION_ANSWER,
    });
  }

  it("reports a saving only when spending actually fell", async () => {
    seedSavingsClarification();
    stubExpenseMetrics(
      [{ type: "income", amount: 900_000 }, { type: "expense", amount: 720_000 }],
      [{ type: "income", amount: 850_000 }, { type: "expense", amount: 800_000 }],
      [],
      [],
      [],
    );

    const outcome = await askAssistantQuestion("Both", "c1", NOW);

    expect(outcome.kind).toBe("answer");
    expect(outcome.text).toContain("spent ₦80,000 less than in July 2026");
    expect(outcome.text).toContain("the amount you saved under this reading");
    expect(outcome.text).not.toContain("nothing to report as money you spent less");
    expect(mockPersistExchange.mock.calls[0][3]).toBe("Savings — both readings");
  });

  it("states plainly when spending rose instead of claiming a saving", async () => {
    seedSavingsClarification();
    stubExpenseMetrics(
      [{ type: "income", amount: 900_000 }, { type: "expense", amount: 900_000 }],
      [{ type: "income", amount: 850_000 }, { type: "expense", amount: 850_000 }],
      [],
      [],
      [],
    );

    const outcome = await askAssistantQuestion("Both", "c1", NOW);

    expect(outcome.kind).toBe("answer");
    expect(outcome.text).toContain("spent ₦50,000 more than in July 2026");
    expect(outcome.text).toContain("nothing to report as money you spent less");
    expect(outcome.text).not.toContain("the amount you saved under this reading");
  });
});

describe("browser QA issue 3: clarification selection (The two / Both)", () => {
  /** Drops a persisted savings clarification into owned context. */
  function seedSavingsClarification() {
    mockFindLastUserQuestion.mockResolvedValue({
      content: "How much did I save last month?",
      createdAt: "2026-09-05T10:00:00.000Z",
      answer: SAVINGS_CLARIFICATION_ANSWER,
    });
  }

  it("resolves 'The two' by combining both clarification readings", async () => {
    seedSavingsClarification();
    stubExpenseMetrics(
      [{ type: "income", amount: 900_000 }, { type: "expense", amount: 720_000 }],
      [{ type: "income", amount: 850_000 }, { type: "expense", amount: 800_000 }],
      [],
      [],
      [],
    );

    const outcome = await askAssistantQuestion("The two", "c1", NOW);

    expect(outcome.kind).toBe("answer");
    // Reading A: expenses spent less vs prior period. Reading B: money left.
    expect(outcome.text).toContain("expenses");
    expect(outcome.text).toContain("profit");
    expect(mockFindLastUserQuestion).toHaveBeenCalledWith(mockPrisma, "biz-a", "c1");
    expect(mockPersistExchange.mock.calls[0][3]).toBe("Savings — both readings");
  });

  it("resolves 'Both' the same way", async () => {
    seedSavingsClarification();
    stubExpenseMetrics(
      [{ type: "income", amount: 900_000 }, { type: "expense", amount: 720_000 }],
      [{ type: "income", amount: 850_000 }, { type: "expense", amount: 800_000 }],
      [],
      [],
      [],
    );

    const outcome = await askAssistantQuestion("Both", "c1", NOW);

    expect(outcome.kind).toBe("answer");
    expect(mockPersistExchange.mock.calls[0][3]).toBe("Savings — both readings");
  });

  it("does NOT interpret 'Both' without a preceding owned savings clarification", async () => {
    // The immediately preceding exchange is a normal answer, not our
    // two-option savings clarification — "Both" must not invent meaning.
    mockFindLastUserQuestion.mockResolvedValue({
      content: "What was my profit last month?",
      createdAt: "2026-09-05T10:00:00.000Z",
      answer: "Net profit in August 2026 was ₦200,000.",
    });

    const outcome = await askAssistantQuestion("Both", "c1", NOW);

    expect(outcome.kind).toBe("unsupported");
    expect(outcome.text).toBe(UNSUPPORTED_ANSWER);
    expect(mockPrisma.transaction.groupBy).not.toHaveBeenCalled();
    expect(mockPersistExchange).not.toHaveBeenCalled();
  });

  it("keeps savings clarifications persisted for context reuse", async () => {
    mockFindLastUserQuestion.mockResolvedValue(null);

    const outcome = await askAssistantQuestion("How much did I save last month?", "c1", NOW);

    expect(outcome.kind).toBe("clarification");
    expect(outcome.text).toBe(SAVINGS_CLARIFICATION_ANSWER);
    expect(outcome.conversationId).toBe("c1");
    expect(mockPersistExchange).toHaveBeenCalledWith(
      mockPrisma,
      "biz-a",
      "c1",
      "Savings clarification",
      "How much did I save last month?",
      SAVINGS_CLARIFICATION_ANSWER,
    );
    expect(mockPrisma.transaction.groupBy).not.toHaveBeenCalled();
  });
});