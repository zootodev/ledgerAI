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
  INSUFFICIENT_ANSWER,
  UNSUPPORTED_ANSWER,
} from "@/lib/finance/assistant";
import { classifyFollowUp } from "@/lib/finance/assistant";

const userA = { id: "auth-user-a", email: "a@example.com", name: "User A" };
const businessA = { id: "biz-a", name: "A Ltd", currency: "NGN" };
// Real-world QA ran on 2026-09-10: "last month" = August 2026, "this month" = September.
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

/**
 * The three real three-account reproductions. Each conversation starts with
 * the assistant's own August total narration, then the bare-pronoun passive
 * follow-up. All three must anchor the SAME period and figure — never a
 * re-read of the current (September) month.
 */
const REAL_CASES: {
  label: string;
  priorAnswer: string;
  figure: number;
  categories: [string, string, number][];
}[] = [
  {
    label: "account A (August ₦379,050, vacant September)",
    priorAnswer:
      "Spending in August 2026 was ₦379,050. That's -8% vs the prior period (₦379,050 now vs ₦413,300 before).",
    figure: 379_050,
    categories: [
      ["cat-rent", "Rent", 150_000],
      ["cat-software", "Software", 120_000],
      ["cat-marketing", "Marketing", 60_000],
      ["cat-food", "Food", 31_050],
      ["cat-transport", "Transport", 18_000],
    ],
  },
  {
    label: "account B (August ₦187,600)",
    priorAnswer: "Spending in August 2026 was ₦187,600.",
    figure: 187_600,
    categories: [
      ["cat-software", "Software", 97_200],
      ["cat-rent", "Rent", 36_500],
      ["cat-marketing", "Marketing", 30_000],
      ["cat-inventory", "Inventory", 23_900],
    ],
  },
  {
    label: "account C (August ₦559,000)",
    priorAnswer: "Spending in August 2026 was ₦559,000.",
    figure: 559_000,
    categories: [
      ["cat-inventory", "Inventory", 300_000],
      ["cat-rent", "Rent", 120_000],
      ["cat-software", "Software", 89_000],
      ["cat-transport", "Transport", 50_000],
    ],
  },
];

describe("real-world QA: bare-pronoun passive follow-up after our own narration", () => {
  it.each(REAL_CASES.map((c) => [c.label, c] as const))(
    "anchors the narrated figure for %s",
    async (_label, c) => {
      mockFindLastUserQuestion.mockResolvedValue({
        content: "What were my expenses last month?",
        createdAt: "2026-09-05T10:00:00.000Z",
        answer: c.priorAnswer,
      });
      let expenseGroup = 0;
      for (const [, , amt] of c.categories) expenseGroup += amt;
      const currentCats = c.categories.map(([id, , amt]) => [id, amt] as [string, number]);
      stubExpenseMetrics(
        [
          { type: "income", amount: 500_000 },
          { type: "expense", amount: expenseGroup },
        ],
        [],
        currentCats,
        [],
        c.categories.map(([id, name]) => ({ id, name })),
      );

      const outcome = await askAssistantQuestion("What was that spent on?", "c1", NOW);

      expect(outcome.kind).toBe("answer");
      expect(outcome.text).toContain(`the ₦${c.figure.toLocaleString("en-NG")} you asked about`);
      expect(outcome.text).toContain("August 2026");
      expect(outcome.text).not.toContain("September 2026");
      expect(outcome.text).not.toBe(INSUFFICIENT_ANSWER);
      expect(mockFindLastUserQuestion).toHaveBeenCalledWith(mockPrisma, "biz-a", "c1");
      expect(mockPersistExchange.mock.calls[0][3]).toBe("Spending breakdown — Last month");
    },
  );

  it.each(REAL_CASES.map((c) => [c.label, c] as const))(
    "never falls back to the current month for %s",
    async (_label, c) => {
      mockFindLastUserQuestion.mockResolvedValue({
        content: "What were my expenses last month?",
        createdAt: "2026-09-05T10:00:00.000Z",
        answer: c.priorAnswer,
      });
      let expenseGroup = 0;
      const currentCats = c.categories.map(([id, , amt]) => {
        expenseGroup += amt;
        return [id as string, amt as number] as [string, number];
      });
      stubExpenseMetrics(
        [
          { type: "income", amount: 500_000 },
          { type: "expense", amount: expenseGroup },
        ],
        [],
        currentCats,
        [],
        c.categories.map(([id, name]) => ({ id, name })),
      );

      const outcome = await askAssistantQuestion("What was that spent on?", "c1", NOW);

      expect(outcome.kind).toBe("answer");
      expect(outcome.text).not.toMatch(/Spending in September 2026/);
      expect(outcome.text).not.toMatch(/Spending in (this month|the current month)/);
      expect(outcome.conversationId).toBe("c1");
    },
  );
});

describe("real-world QA: generalized follow-up variants", () => {
  function seedAccountC() {
    mockFindLastUserQuestion.mockResolvedValue({
      content: "What were my expenses last month?",
      createdAt: "2026-09-05T10:00:00.000Z",
      answer: "Spending in August 2026 was ₦559,000.",
    });
    stubExpenseMetrics(
      [
        { type: "income", amount: 700_000 },
        { type: "expense", amount: 559_000 },
      ],
      [],
      [
        ["cat-inventory", 300_000],
        ["cat-rent", 120_000],
        ["cat-software", 89_000],
        ["cat-transport", 50_000],
      ],
      [],
      [
        { id: "cat-inventory", name: "Inventory" },
        { id: "cat-rent", name: "Rent" },
        { id: "cat-software", name: "Software" },
        { id: "cat-transport", name: "Transport" },
      ],
    );
  }

  it.each([
    "What was it spent on?",
    "What made up that expense?",
    "Break that down.",
    "Where did that spending go?",
    "How was that spending divided?",
    "What did I spend that on?",
    "What categories made up that amount?",
  ])("resolves %s to the August breakdown", async (question) => {
    seedAccountC();

    const outcome = await askAssistantQuestion(question, "c1", NOW);

    expect(outcome.kind).toBe("answer");
    expect(outcome.text).toContain("the ₦559,000 you asked about");
    expect(outcome.text).toContain("August 2026");
  });

  it("does not force 'Show me the categories.' into a question it isn't", async () => {
    seedAccountC();

    const outcome = await askAssistantQuestion("Show me the categories.", "c1", NOW);

    expect(outcome.kind).toBe("unsupported");
    expect(outcome.text).toBe(UNSUPPORTED_ANSWER);
    expect(mockPrisma.transaction.groupBy).not.toHaveBeenCalled();
  });

  it("keeps independent metric questions independent (revenue stays revenue)", async () => {
    mockFindLastUserQuestion.mockResolvedValue({
      content: "What were my expenses last month?",
      createdAt: "2026-09-05T10:00:00.000Z",
      answer: "Spending in August 2026 was ₦559,000.",
    });
    stubExpenseMetrics(
      [{ type: "income", amount: 900_000 }],
      [],
      [],
      [],
      [],
    );

    const outcome = await askAssistantQuestion("What was my revenue this month?", "c1", NOW);

    expect(outcome.kind).toBe("answer");
    expect(outcome.text).toContain("Income in September 2026 was ₦900,000");
    expect(outcome.text).not.toContain("breakdown");
  });

  it("reads an explicit August figure as a standalone August breakdown", async () => {
    stubExpenseMetrics(
      [
        { type: "income", amount: 500_000 },
        { type: "expense", amount: 379_050 },
      ],
      [],
      [
        ["cat-rent", 150_000],
        ["cat-software", 120_000],
        ["cat-marketing", 60_000],
        ["cat-food", 31_050],
        ["cat-transport", 18_000],
      ],
      [],
      [
        { id: "cat-rent", name: "Rent" },
        { id: "cat-software", name: "Software" },
        { id: "cat-marketing", name: "Marketing" },
        { id: "cat-food", name: "Food" },
        { id: "cat-transport", name: "Transport" },
      ],
    );

    const outcome = await askAssistantQuestion("What was the August spending spent on?", null, NOW);

    expect(outcome.kind).toBe("answer");
    expect(outcome.text).toContain("your ₦379,050 spending");
    expect(outcome.text).toContain("August 2026");
    expect(outcome.text).not.toContain("September 2026");
  });
});

describe("real-world QA: explicit overrides and honest clarification", () => {
  it("clarifies when a cited figure matches no owned total (#15)", async () => {
    mockFindLastUserQuestion.mockResolvedValue({
      content: "What were my expenses last month?",
      createdAt: "2026-09-05T10:00:00.000Z",
      answer: "Spending in August 2026 was ₦379,050.",
    });

    const outcome = await askAssistantQuestion("What did I spend 559,000 on?", "c1", NOW);

    expect(outcome.kind).toBe("clarification");
    expect(outcome.text).toBe(AMOUNT_CLARIFICATION_ANSWER);
    expect(mockPrisma.transaction.groupBy).not.toHaveBeenCalled();
  });
});

describe("real-world QA: older-frame recall and period disambiguation", () => {
  it("recalls an explicitly cited OLDER frame over a newer, different one (#16)", async () => {
    mockFindLastUserQuestion.mockResolvedValue({
      content: "How much did I spend in July 2026?",
      createdAt: "2026-08-10T10:00:00.000Z",
      answer: "Spending in July 2026 was ₦300,000.",
    });
    mockFindRecentExchanges.mockResolvedValue([
      {
        content: "What were my expenses last month?",
        answer: "Spending in August 2026 was ₦379,050.",
      },
    ]);
    stubExpenseMetrics(
      [
        { type: "income", amount: 400_000 },
        { type: "expense", amount: 300_000 },
      ],
      [],
      [
        ["cat-rent", 200_000],
        ["cat-food", 100_000],
      ],
      [],
      [
        { id: "cat-rent", name: "Rent" },
        { id: "cat-food", name: "Food" },
      ],
    );

    const outcome = await askAssistantQuestion("What was the ₦300,000 spent on?", "c1", NOW);

    expect(outcome.kind).toBe("answer");
    expect(outcome.text).toContain("the ₦300,000 you asked about");
    expect(outcome.text).toContain("July 2026");
    expect(mockPersistExchange.mock.calls[0][3]).toBe("Spending breakdown — July 2026");
  });

  it("clarifies when the same figure was narrated in DIFFERENT periods (#17)", async () => {
    mockFindLastUserQuestion.mockResolvedValue({
      content: "How much did I spend in August 2026?",
      createdAt: "2026-09-05T10:00:00.000Z",
      answer: "Spending in August 2026 was ₦250,000.",
    });
    mockFindRecentExchanges.mockResolvedValue([
      {
        content: "How much did I spend in July 2026?",
        answer: "Spending in July 2026 was ₦250,000.",
      },
    ]);

    const outcome = await askAssistantQuestion("What was the 250,000 spent on?", "c1", NOW);

    expect(outcome.kind).toBe("clarification");
    expect(outcome.text).toBe(AMOUNT_CLARIFICATION_ANSWER);
    expect(mockPrisma.transaction.groupBy).not.toHaveBeenCalled();
    expect(mockPersistExchange.mock.calls[0][3]).toBe("Amount clarification");
  });

  it("resolves when the same figure appears in the SAME period twice (#17)", async () => {
    mockFindLastUserQuestion.mockResolvedValue({
      content: "How much did I spend in August 2026?",
      createdAt: "2026-09-05T10:00:00.000Z",
      answer: "Spending in August 2026 was ₦187,600.",
    });
    mockFindRecentExchanges.mockResolvedValue([
      {
        content: "What was the 187600 spent on?",
        answer:
          "Of the ₦187,600 you asked about in August 2026, Software (₦97,200), Rent (₦36,500), and Marketing (₦30,000) accounted for 87%.",
      },
    ]);
    stubExpenseMetrics(
      [
        { type: "income", amount: 500_000 },
        { type: "expense", amount: 187_600 },
      ],
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
    expect(mockPersistExchange.mock.calls[0][3]).toBe("Spending breakdown — August 2026");
  });
});

describe("real-world QA: metric fidelity (#18)", () => {
  it("never turns a revenue follow-up into an expense breakdown", async () => {
    mockFindLastUserQuestion.mockResolvedValue({
      content: "What was my revenue last month?",
      createdAt: "2026-09-05T10:00:00.000Z",
      answer: "Income in August 2026 was ₦500,000.",
    });

    const outcome = await askAssistantQuestion("Break that down.", "c1", NOW);

    expect(outcome.kind).toBe("clarification");
    expect(outcome.text).toBe(AMOUNT_CLARIFICATION_ANSWER);
    expect(mockPrisma.transaction.groupBy).not.toHaveBeenCalled();
  });

  it("keeps profit questions on the profit surface", async () => {
    mockFindLastUserQuestion.mockResolvedValue({
      content: "What were my expenses last month?",
      createdAt: "2026-09-05T10:00:00.000Z",
      answer: "Spending in August 2026 was ₦100,000.",
    });
    stubExpenseMetrics(
      [
        { type: "income", amount: 700_000 },
        { type: "expense", amount: 300_000 },
      ],
      [],
      [],
      [],
      [],
    );

    const outcome = await askAssistantQuestion("What was my profit last month?", "c1", NOW);

    expect(outcome.kind).toBe("answer");
    expect(outcome.text).toContain("Net profit in August 2026 was ₦400,000");
    expect(outcome.text).not.toContain("breakdown");
  });
});

describe("ask-layer classification of the failing phrasing", () => {
  it("classifies every account's exact second question as an anchored breakdown", () => {
    for (const q of [
      "What was that spent on?",
      "What was it spent on?",
    ]) {
      expect(classifyFollowUp(q, NOW)).toEqual({
        kind: "expenseBreakdown",
        amount: null,
        referential: true,
      });
    }
  });
});