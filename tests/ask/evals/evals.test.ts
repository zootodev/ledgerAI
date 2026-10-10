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

vi.mock("@/lib/ai/ask-provider", () => ({
  getAskAi: vi.fn(),
}));

vi.mock("@/lib/services/assistant-conversations", () => ({
  findLastUserQuestionForContext: vi.fn(),
  findRecentOwnedExchanges: vi.fn(),
  persistAssistantExchange: vi.fn(),
}));

import { requireAuthContext } from "@/lib/services/auth-context";
import { getAIService } from "@/lib/ai/provider";
import { getAskAi } from "@/lib/ai/ask-provider";
import {
  findLastUserQuestionForContext,
  findRecentOwnedExchanges,
  persistAssistantExchange,
} from "@/lib/services/assistant-conversations";
import { askAssistantQuestion } from "@/lib/services/assistant";
import type { AskAiRuntime } from "@/lib/ai/ask-provider";
import { INTERPRETER_FIXTURES } from "./fixtures";
import { assertCase, assertFixtureContract } from "./harness";

const userA = { id: "auth-user-a", email: "a@example.com", name: "User A" };
const businessA = { id: "biz-a", name: "A Ltd", currency: "NGN" };
const NOW = new Date("2026-08-15T12:00:00.000Z");

function decimal(value: number) {
  return { toString: () => value.toFixed(2) };
}
function typeGroup(type: string, amount: number, count = 1) {
  return { type, _sum: { amount: decimal(amount) }, _count: count };
}

const mockPrisma = {
  business: { findFirst: vi.fn() },
  transaction: { groupBy: vi.fn() },
  category: { findMany: vi.fn() },
};

const mockedRequireAuthContext = vi.mocked(requireAuthContext);
const mockedGetAIService = vi.mocked(getAIService);
const mockedGetAskAi = vi.mocked(getAskAi);
const mockPersistExchange = vi.mocked(persistAssistantExchange);
const mockFindLastUserQuestion = vi.mocked(findLastUserQuestionForContext);
const mockFindRecentExchanges = vi.mocked(findRecentOwnedExchanges);

const interpreter = { interpret: vi.fn() };

function runtimeAI(fixture?: string): AskAiRuntime {
  if (fixture) {
    interpreter.interpret.mockResolvedValue(JSON.parse(fixture));
  }
  return {
    config: {
      mode: "canary",
      interpreterEnabled: true,
      narrationEnabled: false,
      structuredStateWrite: false,
      shadowSampleRate: 1,
      askV2Enabled: false,
      askEnabled: false,
    },
    providers: {
      interpreter: { name: "fixture", configured: true, model: null, interpret: interpreter.interpret },
      narrationPlanner: { name: "fixture", configured: false, plan: vi.fn() },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  interpreter.interpret.mockReset();
  mockPrisma.transaction.groupBy.mockReset();
  mockPrisma.category.findMany.mockReset();
  mockedRequireAuthContext.mockReset();
  mockedRequireAuthContext.mockResolvedValue({
    user: userA,
    business: businessA,
    prisma: mockPrisma as never,
  });
  mockedGetAIService.mockReset();
  mockedGetAIService.mockReturnValue({ categorizer: {} as never, assistant: undefined });
  mockedGetAskAi.mockReset();
  mockedGetAskAi.mockReturnValue(runtimeAI());
  mockPersistExchange.mockReset();
  mockPersistExchange.mockResolvedValue({
    conversationId: "c1",
    userMessageId: "um-1",
    assistantMessageId: "am-1",
    created: false,
  });
  mockFindLastUserQuestion.mockResolvedValue(null);
  mockFindRecentExchanges.mockResolvedValue([]);
});

describe("ask evaluations (§22 goldens + canary band)", () => {
  it("the fixtures themselves satisfy the interpreter contract", () => {
    assertFixtureContract(INTERPRETER_FIXTURES);
  });

  it("improved: a confident reading turns an undecided question into a verified answer", async () => {
    mockedGetAskAi.mockReturnValue(runtimeAI(INTERPRETER_FIXTURES.improved));
    mockPrisma.transaction.groupBy
      .mockResolvedValueOnce([typeGroup("expense", 600_000, 3)])
      .mockResolvedValueOnce([typeGroup("expense", 500_000, 2)]);

    const outcome = await askAssistantQuestion("Where should I focus my cuts next month?", null, NOW);
    assertCase({ label: "improved", kind: outcome.kind, text: outcome.text, generatedBy: "deterministic" }, {
      label: "improved",
      question: "Where should I focus my cuts next month?",
      expected: { kind: "answer", contains: ["₦600,000"] },
    });
  });

  it("gating: an authoritative deterministic query is never overridden by the provider", async () => {
    mockedGetAskAi.mockReturnValue(runtimeAI(INTERPRETER_FIXTURES.gating));
    mockPrisma.transaction.groupBy
      .mockResolvedValueOnce([typeGroup("expense", 600_000, 3)])
      .mockResolvedValueOnce([typeGroup("expense", 500_000, 2)]);

    const outcome = await askAssistantQuestion(
      "What were my total expenses last month?",
      null,
      NOW,
    );
    expect(outcome.kind).toBe("answer");
    expect(outcome.text).toContain("₦600,000");
    expect(outcome.text).not.toContain("1,000,000");
    expect(interpreter.interpret).not.toHaveBeenCalled();
  });

  it("fallback: a provider clarification never displaces the deterministic result", async () => {
    mockedGetAskAi.mockReturnValue(runtimeAI(INTERPRETER_FIXTURES.fallback));
    const outcome = await askAssistantQuestion("Where should I focus my cuts next month?", null, NOW);
    expect(outcome.kind).toBe("unsupported");
  });

  it("clarity (§22): a cited duplicate figure across distinct periods asks, never guesses", async () => {
    // The recorded conversation carry TWO owned spending totals of ₦600,000 in
    // different windows (the exact scenario the canary re-uses §22 for).
    mockFindLastUserQuestion.mockResolvedValue({
      content: "How did my spending in July break down?",
      createdAt: "2026-08-02T10:00:00.000Z",
      answer:
        "Of your ₦600,000 spending in July 2026, Rent (₦500,000), Marketing (₦100,000) accounted for 100%.",
    });
    mockFindRecentExchanges.mockResolvedValue([
      {
        content: "How did my spending in June break down?",
        answer:
          "Of your ₦600,000 spending in June 2026, Rent (₦400,000), Marketing (₦200,000) accounted for 100%.",
      },
    ]);

    const outcome = await askAssistantQuestion(
      "What about the 600,000 figure?",
      "c1",
      NOW,
    );
    expect(outcome.kind).toBe("clarification");
    if (outcome.kind === "clarification") {
      expect(outcome.text).toMatch(/which/i);
    }
  });
});