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
import { UNSUPPORTED_ANSWER } from "@/lib/finance/assistant";
import type { AskAiRuntime } from "@/lib/ai/ask-provider";

const userA = { id: "auth-user-a", email: "a@example.com", name: "User A" };
const businessA = { id: "biz-a", name: "A Ltd", currency: "NGN" };
const NOW = new Date("2026-08-15T12:00:00.000Z");

function makeDecimal(value: number) {
  return { toString: () => value.toFixed(2) };
}
function typeGroup(type: string, amount: number, count = 1) {
  return { type, _sum: { amount: makeDecimal(amount) }, _count: count };
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

function runtimeAI(
  overrides: Partial<AskAiRuntime["config"]> = {},
): AskAiRuntime {
  return {
    config: {
      mode: "off",
      interpreterEnabled: true,
      narrationEnabled: false,
      structuredStateWrite: false,
      shadowSampleRate: 1,
      ...overrides,
    },
    providers: {
      interpreter: {
        name: "fake",
        configured: true,
        model: null,
        interpret: interpreter.interpret,
      },
      narrationPlanner: {
        name: "fake",
        configured: false,
        plan: vi.fn(),
      },
    },
  };
}

function seedExpenses() {
  mockPrisma.transaction.groupBy
    .mockResolvedValueOnce([typeGroup("expense", 600_000, 3)])
    .mockResolvedValueOnce([typeGroup("expense", 500_000, 2)]);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.transaction.groupBy.mockReset();
  mockPrisma.category.findMany.mockReset();
  interpreter.interpret.mockReset();
  mockedRequireAuthContext.mockReset();
  mockedRequireAuthContext.mockResolvedValue({
    user: userA,
    business: businessA,
    prisma: mockPrisma as never,
  });
  mockedGetAIService.mockReset();
  mockedGetAIService.mockReturnValue({
    categorizer: {} as never,
    insightGenerator: undefined,
    assistant: undefined,
  });
  mockedGetAskAi.mockReset();
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

describe("askAssistantQuestion — LLM mode gating", () => {
  it("OFF: never calls the interpreter, stays deterministic", async () => {
    mockedGetAskAi.mockReturnValue(runtimeAI({ mode: "off" }));
    seedExpenses();

    const outcome = await askAssistantQuestion(
      "What were my total expenses last month?",
      null,
      NOW,
    );

    expect(outcome.kind).toBe("answer");
    expect(interpreter.interpret).not.toHaveBeenCalled();
    if (outcome.kind === "answer") expect(outcome.text).toContain("₦600,000");
  });

  it("SHADOW: samples the interpreter but serves the deterministic answer", async () => {
    mockedGetAskAi.mockReturnValue(runtimeAI({ mode: "shadow" }));
    interpreter.interpret.mockResolvedValue({
      disposition: "query",
      intent: "income",
      period: { kind: "last_month" },
      entity: null,
      target: null,
      mode: "factual",
      operation: null,
      effectGoal: null,
      userAmountSpan: null,
      reference: "none",
      confidence: 0.9,
    });
    seedExpenses();

    const outcome = await askAssistantQuestion(
      "What were my total expenses last month?",
      null,
      NOW,
    );

    expect(outcome.kind).toBe("answer");
    // Deterministic answer, not the interpreter's would-be income reading.
    if (outcome.kind === "answer") {
      expect(outcome.text).toContain("₦600,000");
      expect(outcome.text).not.toContain("1,000,000");
    }
    await vi.waitFor(() => expect(interpreter.interpret).toHaveBeenCalledTimes(1));
  });

  it("SHADOW: skips the sample when shadowSampleRate is 0", async () => {
    mockedGetAskAi.mockReturnValue(runtimeAI({ mode: "shadow", shadowSampleRate: 0 }));
    seedExpenses();

    const outcome = await askAssistantQuestion(
      "What were my total expenses last month?",
      null,
      NOW,
    );

    expect(outcome.kind).toBe("answer");
    expect(interpreter.interpret).not.toHaveBeenCalled();
  });

  it("CANARY: a confident interpreter unlocks a real answer over unsupported", async () => {
    mockedGetAskAi.mockReturnValue(runtimeAI({ mode: "canary" }));
    interpreter.interpret.mockResolvedValue({
      disposition: "query",
      intent: "expenses",
      period: { kind: "this_month" },
      entity: null,
      target: null,
      mode: "factual",
      operation: null,
      effectGoal: null,
      userAmountSpan: null,
      reference: "none",
      confidence: 0.85,
    });
    seedExpenses();

    const outcome = await askAssistantQuestion(
      "What is the meaning of life?",
      null,
      NOW,
    );

    expect(outcome.kind).toBe("answer");
    if (outcome.kind === "answer") expect(outcome.text).toContain("₦600,000");
    expect(interpreter.interpret).toHaveBeenCalledTimes(1);
    expect(mockPersistExchange).toHaveBeenCalled();
  });

  it("CANARY: never overrides an authoritative deterministic query", async () => {
    mockedGetAskAi.mockReturnValue(runtimeAI({ mode: "canary" }));
    interpreter.interpret.mockResolvedValue({
      disposition: "query",
      intent: "income",
      period: { kind: "this_month" },
      entity: null,
      target: null,
      mode: "factual",
      operation: null,
      effectGoal: null,
      userAmountSpan: null,
      reference: "none",
      confidence: 0.99,
    });
    seedExpenses();

    const outcome = await askAssistantQuestion(
      "What were my total expenses last month?",
      null,
      NOW,
    );

    expect(outcome.kind).toBe("answer");
    if (outcome.kind === "answer") expect(outcome.text).toContain("₦600,000");
    expect(interpreter.interpret).not.toHaveBeenCalled();
  });

  it("CANARY: policy-denied interpretation falls back to deterministic unsupported", async () => {
    mockedGetAskAi.mockReturnValue(runtimeAI({ mode: "canary" }));
    // Refers to a slot the (empty) context never advertised.
    interpreter.interpret.mockResolvedValue({
      disposition: "query",
      intent: "expense_breakdown",
      period: { kind: "conversation_reference" },
      entity: null,
      target: null,
      mode: "factual",
      operation: null,
      effectGoal: null,
      userAmountSpan: null,
      reference: "older_amount_anchor",
      confidence: 0.85,
    });

    const outcome = await askAssistantQuestion("What is the meaning of life?", null, NOW);

    expect(outcome.kind).toBe("unsupported");
    expect(outcome.text).toBe(UNSUPPORTED_ANSWER);
  });

  it("CANARY: sends ONLY the redacted surface (kinds + slots, no ids/figures)", async () => {
    mockedGetAskAi.mockReturnValue(runtimeAI({ mode: "canary" }));
    interpreter.interpret.mockResolvedValue({
      disposition: "query",
      intent: "expenses",
      period: { kind: "this_month" },
      entity: null,
      target: null,
      mode: "factual",
      operation: null,
      effectGoal: null,
      userAmountSpan: null,
      reference: "none",
      confidence: 0.85,
    });
    seedExpenses();

    await askAssistantQuestion("What is the meaning of life?", null, NOW);

    const input = interpreter.interpret.mock.calls[0][0] as { user: string };
    expect(JSON.stringify(input)).not.toContain("biz-a");
    expect(JSON.stringify(input)).not.toContain("auth-user-a");
    expect(JSON.stringify(input)).not.toMatch(/₦/);
  });
});