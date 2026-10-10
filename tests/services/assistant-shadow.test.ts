import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

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
import { OpenAiCompatibleInterpreter } from "@/lib/ai/providers/openai-compatible";
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

function shadowRuntime(interpreter: OpenAiCompatibleInterpreter): AskAiRuntime {
  return {
    config: {
      mode: "shadow",
      interpreterEnabled: true,
      narrationEnabled: false,
      structuredStateWrite: false,
      shadowSampleRate: 1,
      askV2Enabled: false,
      askEnabled: false,
    },
    providers: {
      interpreter,
      narrationPlanner: { name: "deterministic", configured: false, plan: vi.fn() },
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

afterEach(() => {
  delete process.env.ASK_DEBUG;
  vi.restoreAllMocks();
});

type JsonResponse = { choices: Array<{ message: { content: string | null } }> };

function jsonResponse(content: string): JsonResponse {
  return { choices: [{ message: { content } }] };
}

describe("askAssistantQuestion — real LLM shadow integration", () => {
  it("invokes the real OpenAI-compatible provider off-path and still serves the deterministic answer", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () =>
        jsonResponse(
          JSON.stringify({
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
            confidence: 0.99,
          }),
        ),
    });
    const interpreter = new OpenAiCompatibleInterpreter("openai", {
      baseUrl: "https://api.example.com/v1",
      apiKey: "k",
      model: "gpt-4o-mini",
      fetchImpl: fetchImpl as never,
    });
    mockedGetAskAi.mockReturnValue(shadowRuntime(interpreter));
    seedExpenses();

    const outcome = await askAssistantQuestion(
      "What were my total expenses last month?",
      null,
      NOW,
    );

    expect(outcome.kind).toBe("answer");
    if (outcome.kind === "answer") {
      expect(outcome.text).toContain("₦600,000");
      expect(outcome.text).not.toContain("1,000,000");
    }
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    const [, init] = fetchImpl.mock.calls[0];
    const sent = JSON.parse((init as RequestInit).body as string);
    expect(sent.model).toBe("gpt-4o-mini");
    expect(sent.response_format).toEqual({ type: "json_object" });
    expect((init as RequestInit).headers).toMatchObject({ authorization: "Bearer k" });
    expect(JSON.stringify(sent.messages)).not.toContain("biz-a");
    expect(JSON.stringify(sent.messages)).not.toMatch(/₦/);
  });

  it("never lets a valid shadow response override or annotate the deterministic answer", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () =>
        jsonResponse(
          JSON.stringify({
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
          }),
        ),
    });
    mockedGetAskAi.mockReturnValue(
      shadowRuntime(
        new OpenAiCompatibleInterpreter("openai", {
          baseUrl: "https://api.example.com/v1",
          apiKey: "k",
          model: "gpt-4o-mini",
          fetchImpl: fetchImpl as never,
        }),
      ),
    );
    seedExpenses();

    const outcome = await askAssistantQuestion(
      "What were my total expenses last month?",
      null,
      NOW,
    );

    expect(outcome.kind).toBe("answer");
    if (outcome.kind === "answer") {
      expect(outcome.text).toContain("₦600,000");
    }
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalled());
  });

  it("discards malformed provider JSON without touching the served answer", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => jsonResponse("this is not json {"),
    });
    mockedGetAskAi.mockReturnValue(
      shadowRuntime(
        new OpenAiCompatibleInterpreter("openai", {
          baseUrl: "https://api.example.com/v1",
          apiKey: "k",
          model: "gpt-4o-mini",
          fetchImpl: fetchImpl as never,
        }),
      ),
    );
    seedExpenses();

    const outcome = await askAssistantQuestion(
      "What were my total expenses last month?",
      null,
      NOW,
    );

    expect(outcome.kind).toBe("answer");
    if (outcome.kind === "answer") expect(outcome.text).toContain("₦600,000");
    // Let the off-path failure settle; it must not surface to the caller.
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

  it("keeps serving the answer when the provider transport fails", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("fetch failed"));
    mockedGetAskAi.mockReturnValue(
      shadowRuntime(
        new OpenAiCompatibleInterpreter("openai", {
          baseUrl: "https://api.example.com/v1",
          apiKey: "k",
          model: "gpt-4o-mini",
          fetchImpl: fetchImpl as never,
        }),
      ),
    );
    seedExpenses();

    const outcome = await askAssistantQuestion(
      "What were my total expenses last month?",
      null,
      NOW,
    );

    expect(outcome.kind).toBe("answer");
    if (outcome.kind === "answer") expect(outcome.text).toContain("₦600,000");
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

  it("never calls the provider when the API key is missing (configured=false)", async () => {
    const fetchImpl = vi.fn();
    mockedGetAskAi.mockReturnValue(
      shadowRuntime(
        new OpenAiCompatibleInterpreter("openai", {
          baseUrl: "https://api.example.com/v1",
          apiKey: undefined,
          model: "gpt-4o-mini",
          fetchImpl: fetchImpl as never,
        }),
      ),
    );
    seedExpenses();

    const outcome = await askAssistantQuestion(
      "What were my total expenses last month?",
      null,
      NOW,
    );

    expect(outcome.kind).toBe("answer");
    if (outcome.kind === "answer") expect(outcome.text).toContain("₦600,000");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("stays deterministic in shadow and does not accidentally activate canary (no persistence, hybrid mode, or narration)", async () => {
    process.env.ASK_DEBUG = "1";
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchImpl = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () =>
        jsonResponse(
          JSON.stringify({
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
            confidence: 0.95,
          }),
        ),
    });
    mockedGetAskAi.mockReturnValue(
      shadowRuntime(
        new OpenAiCompatibleInterpreter("openai", {
          baseUrl: "https://api.example.com/v1",
          apiKey: "k",
          model: "gpt-4o-mini",
          fetchImpl: fetchImpl as never,
        }),
      ),
    );
    mockPrisma.transaction.groupBy.mockResolvedValue([]);

    const outcome = await askAssistantQuestion(
      "What is the meaning of life?",
      null,
      NOW,
    );

    expect(outcome.kind).toBe("unsupported");
    expect(outcome.text).toBe(UNSUPPORTED_ANSWER);
    expect(mockPersistExchange).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(spy).toHaveBeenCalled());
    const emitted = spy.mock.calls[0][0] as string;
    expect(emitted).toContain('"mode":"deterministic"');
    expect(emitted).not.toContain('"mode":"hybrid"');
    expect(emitted).toContain('"providerOutcome":"not_used"');
    expect(emitted).toContain('"providerStatus":"ok"');
    expect(emitted).not.toContain("biz-a");
    expect(emitted).not.toContain("meaning of life");
    expect(emitted).not.toContain("Bearer");
    expect(emitted).not.toContain("api.example.com");
  });
});