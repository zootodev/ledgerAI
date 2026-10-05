import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// B-2: the gate defaults OFF, so tests that exercise the normal v2 flow must
// enable it explicitly (restored per test). The gate is read from env at call
// time, so no module mock is needed — beforeEach/afterEach control it.
const ORIGINAL_ASK_V2_ENABLED = process.env.ASK_V2_ENABLED;

// B-1: keep createAskV2Trace real but intercept emission so tests can assert
// on the exact per-turn payload without polluting console output.
vi.mock("@/lib/observability/ask-v2-trace", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/observability/ask-v2-trace")>();
  return { ...actual, emitAskV2Trace: vi.fn() };
});

vi.mock("@/lib/services/auth-context", () => {
  class AuthorizationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "AuthorizationError";
    }
  }
  return { requireAuthContext: vi.fn(), AuthorizationError };
});

vi.mock("@/lib/services/assistant-conversations", () => {
  class ConversationNotFoundError extends Error {
    constructor() {
      super("Conversation not found.");
      this.name = "ConversationNotFoundError";
    }
  }
  return {
    persistAssistantExchange: vi.fn(),
    findRecentOwnedExchanges: vi.fn(),
    ConversationNotFoundError,
  };
});

vi.mock("@/lib/finance/assistant", () => ({
  clarificationText: vi.fn(() => "Please clarify: ambiguous"),
  conversationTitle: vi.fn(() => "Spending question"),
  UNSUPPORTED_ANSWER: "LedgerAI can only answer financial questions.",
}));

vi.mock("@/lib/ask-v2/executor", () => ({
  executeAskV2Plan: vi.fn(),
}));

vi.mock("@/lib/ask-v2/interpreter", () => ({
  interpretAskV2: vi.fn(),
}));

vi.mock("@/lib/ask-v2/narrator", () => ({
  narrateAskV2: vi.fn(async (input: { deterministicText: string }) => ({
    kind: "fallback",
    text: input.deterministicText,
    reason: "provider_unavailable",
    provider: {
      name: "deterministic",
      configured: false,
      model: null,
      promptVersion: "ask-v2-narrator/v1",
    },
  })),
}));

// Phase 4: isolate the fact manifest so the action's narration path can be
// exercised without pulling in the (mocked) finance/assistant selection.
vi.mock("@/lib/finance/facts", () => ({
  buildFactManifest: vi.fn(() => ({
    manifest: {
      answerKind: "summary",
      facts: [
        { id: "F1", kind: "period", display: "July 2026", required: true },
        { id: "F2", kind: "money", display: "₦187,600", required: true },
      ],
      allowedTemplates: ["direct"],
    },
    moneyFactId: null,
  })),
}));

import { askV2Ask, askV2Turn } from "@/app/ask-v2/actions";
import { requireAuthContext } from "@/lib/services/auth-context";
import {
  persistAssistantExchange,
  findRecentOwnedExchanges,
  ConversationNotFoundError,
} from "@/lib/services/assistant-conversations";
import { executeAskV2Plan } from "@/lib/ask-v2/executor";
import { interpretAskV2 } from "@/lib/ask-v2/interpreter";
import { narrateAskV2 } from "@/lib/ask-v2/narrator";
import { buildFactManifest } from "@/lib/finance/facts";
import { emitAskV2Trace } from "@/lib/observability/ask-v2-trace";
import { redactionViolations } from "@/lib/observability/ask-trace";
import { AuthorizationError } from "@/lib/services/auth-context";

const mockRequireAuthContext = vi.mocked(requireAuthContext);
const mockPersist = vi.mocked(persistAssistantExchange);
const mockExecute = vi.mocked(executeAskV2Plan);
const mockFindRecentExchanges = vi.mocked(findRecentOwnedExchanges);
const mockInterpret = vi.mocked(interpretAskV2);
const mockNarrate = vi.mocked(narrateAskV2);
const mockBuildManifest = vi.mocked(buildFactManifest);
const mockEmitV2Trace = vi.mocked(emitAskV2Trace);

const prismaMock = {
  assistantConversation: { findFirst: vi.fn() },
};

const AUTH = {
  user: { id: "u-1", name: "Ada", email: "ada@ledger.ai" },
  business: { id: "biz-42", name: "Ada & Co", currency: "NGN" },
  prisma: prismaMock,
};

// The verified engine always returns a structurally complete AssistantMetrics;
// the Phase 9E anchor builder reads it, so mocks must honour that contract.
const EMPTY_METRICS = {
  summary: { revenue: 0, expenses: 0, transfers: 0, netProfit: 0, profitMargin: null },
  priorSummary: null,
  categoryTotals: [],
  balance: null,
  count: null,
};

beforeEach(() => {
  process.env.ASK_V2_ENABLED = "true";
  vi.clearAllMocks();
  mockRequireAuthContext.mockReset();
  mockRequireAuthContext.mockResolvedValue(AUTH as never);
  mockPersist.mockReset();
  mockExecute.mockReset();
  mockFindRecentExchanges.mockReset();
  mockFindRecentExchanges.mockResolvedValue([]);
  mockInterpret.mockReset();
  mockNarrate.mockReset();
  mockNarrate.mockImplementation(async (input: { deterministicText: string }) => ({
    kind: "fallback",
    text: input.deterministicText,
    reason: "provider_unavailable",
    provider: {
      name: "deterministic",
      configured: false,
      model: null,
      promptVersion: "ask-v2-narrator/v1",
    },
  }));
  mockBuildManifest.mockReset();
  mockBuildManifest.mockReturnValue({
    manifest: {
      answerKind: "summary",
      facts: [
        { id: "F1", kind: "period", display: "July 2026", required: true },
        { id: "F2", kind: "money", display: "₦187,600", required: true },
      ],
      allowedTemplates: ["direct"],
    },
    moneyFactId: null,
  });
  mockEmitV2Trace.mockClear();
  prismaMock.assistantConversation.findFirst.mockReset();
  prismaMock.assistantConversation.findFirst.mockResolvedValue({ id: "conv-1" });
});

afterEach(() => {
  if (ORIGINAL_ASK_V2_ENABLED === undefined) {
    delete process.env.ASK_V2_ENABLED;
  } else {
    process.env.ASK_V2_ENABLED = ORIGINAL_ASK_V2_ENABLED;
  }
});

describe("askV2Turn — API surface", () => {
  it("answers a valid expense_summary proposal with the verified text", async () => {
    const text = "Spending in August 2026 was ₦187,600.";
    mockExecute.mockResolvedValue({
      kind: "answer",
      query: { intent: "expenses", category: null, period: { kind: "thisMonth" } },
      answer: { kind: "answer", text, data: {} },
      metrics: EMPTY_METRICS,
      toolKeys: ["summary.get"],
    } as never);
    mockPersist.mockResolvedValue({
      conversationId: "conv-1",
      userMessageId: "um-1",
      assistantMessageId: "am-1",
      created: false,
    });

    const response = await askV2Turn({
      proposal: { tool: "expense_summary", period: { kind: "thisMonth" } },
      conversationId: null,
    });

    expect(response.disposition).toBe("answer");
    if (response.disposition === "answer") {
      expect(response.text).toBe(text);
      expect(response.conversationId).toBe("conv-1");
    }
    expect(mockPersist).toHaveBeenCalledWith(
      AUTH.prisma,
      "biz-42",
      null,
      "Spending question",
      expect.any(String),
      text,
      expect.objectContaining({
        kind: "verified",
        intent: "expenses",
        category: null,
        topCategory: null,
        categorySet: [],
        toolKeys: ["summary.get"],
      }),
    );
  });

  it("derives businessId from the session, never from client input", async () => {
    mockExecute.mockResolvedValue({
      kind: "answer",
      query: { intent: "balance", category: null, period: { kind: "allTime" } },
      answer: { kind: "answer", text: "Balance is ₦2,000,000.", data: {} },
      metrics: EMPTY_METRICS,
      toolKeys: ["balance.get"],
    } as never);
    mockPersist.mockResolvedValue({
      conversationId: "conv-2",
      userMessageId: "um-1",
      assistantMessageId: "am-1",
      created: true,
    });

    // Deliberately no businessId anywhere in the client payload.
    await askV2Turn({ proposal: { tool: "balance" }, conversationId: null });

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: "biz-42", prisma: AUTH.prisma }),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it("rejects a request whose envelope leaks tenant context", async () => {
    const response = await askV2Turn({
      proposal: { tool: "balance" },
      businessId: "biz-42",
    } as never);
    expect(response).toEqual({
      disposition: "unsupported",
      reason: "not_financial",
      text: expect.any(String),
      conversationId: null,
    });
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("refuses search_transactions honestly at the boundary", async () => {
    const response = await askV2Turn({
      proposal: { tool: "search_transactions", query: "kwame" },
      conversationId: null,
    });
    expect(response.disposition).toBe("unsupported");
    if (response.disposition === "unsupported") expect(response.reason).toBe("not_supported");
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("folds an engine clarification into a clarification response", async () => {
    mockExecute.mockResolvedValue({ kind: "clarification", reason: "needs_subject" } as never);
    const response = await askV2Turn({
      proposal: { tool: "expense_summary", period: { kind: "thisMonth" } },
      conversationId: null,
    });
    expect(response.disposition).toBe("clarification");
    expect(mockPersist).not.toHaveBeenCalled();
  });

  it("never fabricates: the served text is exactly the engine's verified text", async () => {
    const text = "Spending in June 2026 was ₦900,000.00 for rent.";
    mockExecute.mockResolvedValue({
      kind: "answer",
      query: { intent: "categorySpend", category: "Rent", period: { kind: "month", month: 5, year: 2026 } },
      answer: { kind: "answer", text, data: { amount: 900000 } },
      metrics: EMPTY_METRICS,
      toolKeys: ["summary.get", "categories.listSpending", "categories.distribution"],
    } as never);
    mockPersist.mockResolvedValue({
      conversationId: "conv-3",
      userMessageId: "um-1",
      assistantMessageId: "am-1",
      created: true,
    });

    const response = await askV2Turn({
      proposal: { tool: "expense_breakdown", period: { kind: "month", month: 5, year: 2026 }, category: "Rent" },
      conversationId: null,
    });
    expect(response.disposition).toBe("answer");
    if (response.disposition === "answer") expect(response.text).toBe(text);
  });

  it("never executes a goal_impact delta without a user message to prove it", async () => {
    const response = await askV2Turn({
      proposal: { tool: "goal_impact", category: "Food", delta: -50000, period: { kind: "thisMonth" } },
      conversationId: null,
    });
    expect(response.disposition).toBe("clarification");
    expect(response).toMatchObject({ reason: "ambiguous_amount" });
    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockPersist).not.toHaveBeenCalled();
  });

  it("maps a vanished conversation onto a fresh-start response", async () => {
    mockExecute.mockResolvedValue({
      kind: "answer",
      query: { intent: "expenses", category: null, period: { kind: "thisMonth" } },
      answer: { kind: "answer", text: "x", data: {} },
      metrics: EMPTY_METRICS,
      toolKeys: ["summary.get"],
    } as never);
    mockPersist.mockRejectedValue(new ConversationNotFoundError());

    const response = await askV2Turn({
      proposal: { tool: "expense_summary", period: { kind: "thisMonth" } },
      conversationId: "stale-conv-id",
    });
    expect(response.disposition).toBe("unsupported");
  });

  it("re-throws authorization errors for the caller to redirect", async () => {
    mockRequireAuthContext.mockRejectedValue(new AuthorizationError("You must be signed in."));
    await expect(
      askV2Turn({ proposal: { tool: "balance" }, conversationId: null }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe("askV2Ask — interpreter flow", () => {
  const CONV = "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d";

  function successInterpretation(proposal: unknown) {
    return mockInterpret.mockResolvedValue({
      kind: "success",
      proposal,
      provider: { name: "fake-openai", configured: true, model: "gpt-fake-1", promptVersion: "ask-v2-interpreter/v1" },
    } as never);
  }

  function answerOutcome(text: string) {
    return mockExecute.mockResolvedValue({
      kind: "answer",
      query: { intent: "expenses", category: null, period: { kind: "lastMonth" } },
      answer: { kind: "answer", text, data: {} },
      metrics: EMPTY_METRICS,
      toolKeys: ["summary.get"],
    } as never);
  }

  it("routes an interpreted proposal through policy into the executor", async () => {
    successInterpretation({ tool: "expense_summary", period: { kind: "lastMonth" } });
    answerOutcome("Spending in July 2026 was ₦187,600.");
    mockPersist.mockResolvedValue({
      conversationId: CONV,
      userMessageId: "um-1",
      assistantMessageId: "am-1",
      created: false,
    });

    const response = await askV2Ask({ message: "What did I spend last month?", conversationId: CONV });

    expect(response.disposition).toBe("answer");
    if (response.disposition === "answer") expect(response.text).toBe("Spending in July 2026 was ₦187,600.");

    // Interpreter output reached the REAL Phase-2 policy: the executor received
    // the policy-built plan and allow-listed keys — never anything model-supplied.
    const call = mockExecute.mock.calls[0];
    expect(call).toBeDefined();
    if (!call) return;
    expect(call[1]).toMatchObject({ kind: "answer", query: { intent: "expenses" } });
    expect((call[1] as { query?: { period?: unknown } }).query?.period).toEqual({ kind: "lastMonth" });
    expect(call[3]).toEqual(["summary.get"]);
    expect(call[0]).toMatchObject({ businessId: "biz-42", prisma: prismaMock });

    expect(mockPersist).toHaveBeenCalledWith(
      prismaMock,
      "biz-42",
      CONV,
      "Spending question",
      "What did I spend last month?",
      "Spending in July 2026 was ₦187,600.",
      expect.objectContaining({
        kind: "verified",
        intent: "expenses",
        period: { kind: "lastMonth" },
        toolKeys: ["summary.get"],
      }),
    );
  });

  it("clarifies a goal_impact whose delta is not in the user's message (no execution)", async () => {
    successInterpretation({ tool: "goal_impact", category: "Food", delta: -50000, period: { kind: "thisMonth" } });

    const response = await askV2Ask({
      message: "What if I spent ₦10,000 less on Food this month?",
      conversationId: CONV,
    });

    expect(response.disposition).toBe("clarification");
    expect(response).toMatchObject({ reason: "ambiguous_amount" });
    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockPersist).not.toHaveBeenCalled();
  });

  it("executes a goal_impact only after the delta is proven in the user's message", async () => {
    successInterpretation({ tool: "goal_impact", category: "Food", delta: -50000, period: { kind: "thisMonth" } });
    mockExecute.mockResolvedValue({
      kind: "answer",
      query: {
        intent: "expenseImpact",
        category: "Food",
        period: { kind: "thisMonth" },
        mode: "hypothetical",
        effectGoal: "expenses",
        operation: "decrease",
        hypotheticalAmount: 50000,
      },
      answer: { kind: "answer", text: "Cutting Food by ₦50,000 this month lowers your spending.", data: {} },
      metrics: EMPTY_METRICS,
      toolKeys: ["summary.get", "categories.listSpending"],
    } as never);
    mockPersist.mockResolvedValue({
      conversationId: CONV,
      userMessageId: "um-1",
      assistantMessageId: "am-1",
      created: true,
    });

    const response = await askV2Ask({
      message: "What if I spent ₦50,000 less on Food this month?",
      conversationId: CONV,
    });

    expect(response.disposition).toBe("answer");
    const call = mockExecute.mock.calls[0];
    expect(call).toBeDefined();
    if (!call) return;
    expect(call[1]).toMatchObject({
      kind: "answer",
      query: { intent: "expenseImpact", hypotheticalAmount: 50000, operation: "decrease" },
    });
    expect(mockPersist).toHaveBeenCalled();
  });

  it("resolves conversation ownership and supplies bounded history to the interpreter", async () => {
    mockFindRecentExchanges.mockResolvedValue([
      { content: "What did I spend last month?", answer: "Spending was ₦187,600." },
    ]);
    mockInterpret.mockResolvedValue({
      kind: "clarification",
      reason: "needs_subject",
      provider: { name: "fake-openai", configured: true, model: "m", promptVersion: "v" },
    } as never);

    await askV2Ask({ message: "what was that spent on?", conversationId: CONV });

    expect(prismaMock.assistantConversation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: CONV, businessId: "biz-42" } }),
    );
    expect(mockFindRecentExchanges).toHaveBeenCalledWith(prismaMock, "biz-42", CONV);
    expect(mockInterpret).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "what was that spent on?",
        history: [
          { role: "user", content: "What did I spend last month?" },
          { role: "assistant", content: "Spending was ₦187,600." },
        ],
      }),
    );
  });

  it("returns a fresh-start response when the conversation is missing or foreign", async () => {
    prismaMock.assistantConversation.findFirst.mockResolvedValue(null);
    const response = await askV2Ask({ message: "balance?", conversationId: CONV });
    expect(response.disposition).toBe("unsupported");
    expect(mockInterpret).not.toHaveBeenCalled();
  });

  it("handles an unsupported interpretation safely without executing", async () => {
    mockInterpret.mockResolvedValue({
      kind: "unsupported",
      reason: "not_financial",
      provider: { name: "fake", configured: true, model: "m", promptVersion: "v" },
    } as never);
    const response = await askV2Ask({ message: "Who is Ada?" });
    expect(response.disposition).toBe("unsupported");
    if (response.disposition === "unsupported") expect(response.reason).toBe("not_financial");
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("handles the remaining-percent follow-up honestly without fabricating a result", async () => {
    mockInterpret.mockResolvedValue({
      kind: "unsupported",
      reason: "not_supported",
      provider: { name: "fake", configured: true, model: "m", promptVersion: "v" },
    } as never);
    const response = await askV2Ask({
      message: "What categories made up the remaining percent?",
      conversationId: CONV,
    });
    expect(response.disposition).toBe("unsupported");
    if (response.disposition === "unsupported") expect(response.reason).toBe("not_supported");
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("passes an interpreter clarification through as a clarification", async () => {
    mockInterpret.mockResolvedValue({
      kind: "clarification",
      reason: "ambiguous_amount",
      provider: { name: "fake", configured: true, model: "m", promptVersion: "v" },
    } as never);
    const response = await askV2Ask({ message: "What if I spent that 50k?" });
    expect(response.disposition).toBe("clarification");
    if (response.disposition === "clarification") expect(response.reason).toBe("ambiguous_amount");
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("never fabricates an answer when the provider is unavailable", async () => {
    mockInterpret.mockResolvedValue({
      kind: "provider_unavailable",
      provider: { name: "deterministic", configured: false, model: null, promptVersion: "v" },
    } as never);
    const response = await askV2Ask({ message: "What did I spend?" });
    expect(response.disposition).toBe("unsupported");
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("maps provider timeout and invalid output to safe non-answers", async () => {
    for (const kind of ["provider_timeout", "invalid_provider_output"]) {
      mockInterpret.mockResolvedValue({ kind, provider: { name: "fake", configured: true, model: "m", promptVersion: "v" } } as never);
      const response = await askV2Ask({ message: "balance?" });
      expect(response.disposition).toBe("unsupported");
      expect(mockExecute).not.toHaveBeenCalled();
    }
  });

  it("keeps policy authoritative for tool keys — the model gets no channel to choose them", async () => {
    successInterpretation({ tool: "balance" });
    answerOutcome("Balance is ₦2,000,000.");
    mockPersist.mockResolvedValue({
      conversationId: "conv-2",
      userMessageId: "um-1",
      assistantMessageId: "am-1",
      created: true,
    });

    const response = await askV2Ask({ message: "What's my balance?" });
    expect(response.disposition).toBe("answer");
    const call = mockExecute.mock.calls[0];
    expect(call).toBeDefined();
    if (call) {
      expect((call[1] as { query?: { intent?: string } }).query?.intent).toBe("balance");
      expect(call[3]).toEqual(["balance.get"]);
    }
  });

  it("validates the message envelope and never trusts a client-supplied tenant", async () => {
    const response = await askV2Ask({ message: "", businessId: "biz-42" } as never);
    expect(response.disposition).toBe("unsupported");
    if (response.disposition === "unsupported") expect(response.reason).toBe("not_financial");
    expect(mockInterpret).not.toHaveBeenCalled();
  });

  it("re-throws authorization errors so the caller redirects to login", async () => {
    mockRequireAuthContext.mockRejectedValue(new AuthorizationError("You must be signed in."));
    await expect(askV2Ask({ message: "balance?" })).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe("askV2Ask — Phase 4 narrator + grounding integration", () => {
  const CONV = "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d";

  function expensesOutcome(text: string, metrics: Record<string, unknown>) {
    return mockExecute.mockResolvedValue({
      kind: "answer",
      query: { intent: "expenses", category: null, period: { kind: "lastMonth" } },
      answer: { kind: "answer", text, data: {} },
      metrics,
      toolKeys: ["summary.get"],
    } as never);
  }

  it("serves the grounded LLM narration when the narrator validates it", async () => {
    mockInterpret.mockResolvedValue({
      kind: "success",
      proposal: { tool: "expense_summary", period: { kind: "lastMonth" } },
      provider: { name: "fake-openai", configured: true, model: "m", promptVersion: "v" },
    } as never);
    expensesOutcome("Spending in July 2026 was ₦187,600.", {
      summary: { revenue: 187600, expenses: 187600, transfers: 0, netProfit: 0, profitMargin: 0 },
      priorSummary: null,
      categoryTotals: [],
      balance: null,
      count: null,
    });
    mockNarrate.mockResolvedValue({
      kind: "answer",
      text: "You spent ₦187,600 in July 2026.",
      provider: { name: "fake-openai", configured: true, model: "m", promptVersion: "ask-v2-narrator/v1" },
    } as never);
    mockPersist.mockResolvedValue({ conversationId: CONV, userMessageId: "um-1", assistantMessageId: "am-1", created: false });

    const response = await askV2Ask({ message: "What did I spend last month?", conversationId: CONV });

    expect(response.disposition).toBe("answer");
    if (response.disposition === "answer") expect(response.text).toBe("You spent ₦187,600 in July 2026.");
    expect(mockNarrate).toHaveBeenCalled();
    const narrated = mockNarrate.mock.calls[0][0];
    expect(narrated.manifest.answerKind).toBe("summary");
    expect(JSON.stringify(narrated.manifest)).not.toMatch(/businessId|userId|tenantId|prisma|sql/i);
    expect(mockPersist).toHaveBeenCalledWith(
      prismaMock,
      "biz-42",
      CONV,
      "Spending question",
      "What did I spend last month?",
      "You spent ₦187,600 in July 2026.",
      expect.objectContaining({
        kind: "verified",
        intent: "expenses",
        toolKeys: ["summary.get"],
      }),
    );
  });

  it("falls back to verified deterministic text when the narrator rejects grounding", async () => {
    mockInterpret.mockResolvedValue({
      kind: "success",
      proposal: { tool: "expense_summary", period: { kind: "lastMonth" } },
      provider: { name: "fake-openai", configured: true, model: "m", promptVersion: "v" },
    } as never);
    const deterministic = "Spending in July 2026 was ₦187,600.";
    expensesOutcome(deterministic, {
      summary: { revenue: 187600, expenses: 187600, transfers: 0, netProfit: 0, profitMargin: 0 },
      priorSummary: null,
      categoryTotals: [],
      balance: null,
      count: null,
    });
    mockNarrate.mockResolvedValue({
      kind: "fallback",
      text: deterministic,
      reason: "not_grounded",
      provider: { name: "fake-openai", configured: true, model: "m", promptVersion: "ask-v2-narrator/v1" },
    } as never);
    mockPersist.mockResolvedValue({ conversationId: CONV, userMessageId: "um-1", assistantMessageId: "am-1", created: false });

    const response = await askV2Ask({ message: "What did I spend last month?", conversationId: CONV });

    expect(response.disposition).toBe("answer");
    if (response.disposition === "answer") {
      expect(response.text).toBe(deterministic);
      expect(response.text).not.toBe("You spent ₦187,600 in July 2026.");
    }
    expect(mockPersist).toHaveBeenCalledWith(
      prismaMock,
      "biz-42",
      CONV,
      "Spending question",
      "What did I spend last month?",
      deterministic,
      expect.objectContaining({ kind: "verified", intent: "expenses" }),
    );
  });

  it("skips the narrator entirely when no verified manifest can be built (insufficient data)", async () => {
    mockInterpret.mockResolvedValue({
      kind: "success",
      proposal: { tool: "expense_breakdown", period: { kind: "lastMonth" } },
      provider: { name: "fake-openai", configured: true, model: "m", promptVersion: "v" },
    } as never);
    const insufficient = "I don't have enough data to answer that accurately.";
    expensesOutcome(insufficient, {
      summary: { revenue: 0, expenses: 0, transfers: 0, netProfit: 0, profitMargin: null },
      priorSummary: null,
      categoryTotals: [],
      balance: null,
      count: null,
    });
    mockBuildManifest.mockReturnValue(null);
    mockPersist.mockResolvedValue({ conversationId: CONV, userMessageId: "um-1", assistantMessageId: "am-1", created: false });

    const response = await askV2Ask({ message: "break down my spending", conversationId: CONV });

    expect(response.disposition).toBe("answer");
    if (response.disposition === "answer") expect(response.text).toBe(insufficient);
    expect(mockNarrate).not.toHaveBeenCalled();
  });
});

describe("askV2Ask — B-2 gate (ASK_V2_ENABLED)", () => {
  it("blocks both surfaces when ASK_V2_ENABLED is false, with no side effects", async () => {
    process.env.ASK_V2_ENABLED = "false";

    const askResponse = await askV2Ask({ message: "What did I spend?" });
    expect(askResponse.disposition).toBe("unsupported");
    if (askResponse.disposition === "unsupported") expect(askResponse.reason).toBe("not_supported");

    const turnResponse = await askV2Turn({
      proposal: { tool: "balance" },
      conversationId: null,
    });
    expect(turnResponse.disposition).toBe("unsupported");

    // No interpreter, no finance execution, no persistence, no telemetry.
    expect(mockInterpret).not.toHaveBeenCalled();
    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockPersist).not.toHaveBeenCalled();
    expect(mockEmitV2Trace).not.toHaveBeenCalled();
  });

  it("treats an absent variable as disabled (safe default OFF)", async () => {
    delete process.env.ASK_V2_ENABLED;
    const response = await askV2Ask({ message: "What did I spend?" });
    expect(response.disposition).toBe("unsupported");
    expect(mockInterpret).not.toHaveBeenCalled();
    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockPersist).not.toHaveBeenCalled();
    expect(mockEmitV2Trace).not.toHaveBeenCalled();
  });

  it("never lets the client override the gate", async () => {
    process.env.ASK_V2_ENABLED = "false";
    const response = await askV2Ask({
      message: "What did I spend?",
      enabled: true,
    } as never);
    expect(response.disposition).toBe("unsupported");
    expect(mockInterpret).not.toHaveBeenCalled();
    expect(mockExecute).not.toHaveBeenCalled();
  });
});

describe("askV2Ask — B-1 structured telemetry", () => {
  const CONV = "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d";

  function successInterpretation(proposal: unknown) {
    return mockInterpret.mockResolvedValue({
      kind: "success",
      proposal,
      provider: { name: "fake-openai", configured: true, model: "gpt-fake-1", promptVersion: "ask-v2-interpreter/v7" },
    } as never);
  }

  function answerOutcome(text: string) {
    return mockExecute.mockResolvedValue({
      kind: "answer",
      query: { intent: "expenses", category: null, period: { kind: "lastMonth" } },
      answer: { kind: "answer", text, data: {} },
      metrics: EMPTY_METRICS,
      toolKeys: ["summary.get"],
    } as never);
  }

  function lastEmitted(): Record<string, unknown> {
    const calls = mockEmitV2Trace.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    return calls[calls.length - 1][0] as unknown as Record<string, unknown>;
  }

  it("emits one redacted structured trace for a successful grounded turn (J)", async () => {
    successInterpretation({ tool: "expense_summary", period: { kind: "lastMonth" } });
    answerOutcome("Spending in July 2026 was ₦187,600.");
    mockNarrate.mockResolvedValue({
      kind: "answer",
      text: "You spent ₦187,600 in July 2026.",
      provider: { name: "fake-openai", configured: true, model: "m", promptVersion: "ask-v2-narrator/v1" },
    } as never);
    mockPersist.mockResolvedValue({ conversationId: CONV, userMessageId: "um-1", assistantMessageId: "am-1", created: false });

    const response = await askV2Ask({ message: "What did I spend last month?", conversationId: CONV });
    expect(response.disposition).toBe("answer");

    const trace = lastEmitted();
    expect(trace.surface).toBe("ask-v2");
    expect(trace.gate).toBe("enabled");
    expect(trace.resultKind).toBe("grounded_answer");
    expect(trace.policyDisposition).toBe("executed");
    expect(trace.toolKeys).toEqual(["summary.get"]);
    expect(trace.provider).toBe("fake-openai");
    expect(trace.model).toBe("gpt-fake-1");
    expect(trace.interpreterPromptVersion).toBe("ask-v2-interpreter/v7");
    expect(trace.narratorPromptVersion).toBe("ask-v2-narrator/v1");
    expect(trace.narrationKind).toBe("narrated");
    expect(trace.groundingPassed).toBe(true);
    expect(trace.providerAttempted).toBe(true);
    expect(trace.providerStatus).toBe("ok");
    expect(trace.providerOutcome).toBe("accepted");
    expect(typeof (trace.latencyMs as Record<string, number>).total).toBe("number");
    expect((trace.latencyMs as Record<string, number>).interpreter).toBeGreaterThanOrEqual(0);
    expect((trace.latencyMs as Record<string, number>).narrator).toBeGreaterThanOrEqual(0);
  });

  it("represents a narrator fallback (provider unavailable) with the correct kinds (L)", async () => {
    successInterpretation({ tool: "expense_summary", period: { kind: "lastMonth" } });
    const deterministic = "Spending in July 2026 was ₦187,600.";
    answerOutcome(deterministic);
    mockNarrate.mockResolvedValue({
      kind: "fallback",
      text: deterministic,
      reason: "provider_unavailable",
      provider: { name: "deterministic", configured: false, model: null, promptVersion: "ask-v2-narrator/v1" },
    } as never);
    mockPersist.mockResolvedValue({ conversationId: CONV, userMessageId: "um-1", assistantMessageId: "am-1", created: false });

    await askV2Ask({ message: "What did I spend last month?", conversationId: CONV });

    const trace = lastEmitted();
    expect(trace.resultKind).toBe("narration_fallback");
    expect(trace.narrationKind).toBe("fallback");
    expect(trace.narrationFallbackReason).toBe("provider_unavailable");
    expect(trace.groundingPassed).toBe(false);
  });

  it("represents a grounding rejection as not_grounded (M)", async () => {
    successInterpretation({ tool: "expense_summary", period: { kind: "lastMonth" } });
    const deterministic = "Spending in July 2026 was ₦187,600.";
    answerOutcome(deterministic);
    mockNarrate.mockResolvedValue({
      kind: "fallback",
      text: deterministic,
      reason: "not_grounded",
      provider: { name: "fake-openai", configured: true, model: "m", promptVersion: "ask-v2-narrator/v1" },
    } as never);
    mockPersist.mockResolvedValue({ conversationId: CONV, userMessageId: "um-1", assistantMessageId: "am-1", created: false });

    await askV2Ask({ message: "What did I spend last month?", conversationId: CONV });

    const trace = lastEmitted();
    expect(trace.resultKind).toBe("narration_fallback");
    expect(trace.narrationKind).toBe("fallback");
    expect(trace.narrationFallbackReason).toBe("not_grounded");
    expect(trace.groundingPassed).toBe(false);
  });

  it("emits an answer trace when narration is skipped (no manifest) (N-counted)", async () => {
    successInterpretation({ tool: "expense_summary", period: { kind: "lastMonth" } });
    answerOutcome("Spending in July 2026 was ₦187,600.");
    mockBuildManifest.mockReturnValue(null);
    mockPersist.mockResolvedValue({ conversationId: CONV, userMessageId: "um-1", assistantMessageId: "am-1", created: false });

    await askV2Ask({ message: "What did I spend last month?", conversationId: CONV });

    const trace = lastEmitted();
    expect(trace.resultKind).toBe("answer");
    expect(trace.narrationKind).toBe("not_attempted");
    expect(trace.narratorPromptVersion).toBeNull();
  });

  it("emits a clarification trace for an interpreter clarification (N)", async () => {
    mockInterpret.mockResolvedValue({
      kind: "clarification",
      reason: "needs_subject",
      provider: { name: "fake-openai", configured: true, model: "m", promptVersion: "v" },
    } as never);

    const response = await askV2Ask({ message: "what was that spent on?" });
    expect(response.disposition).toBe("clarification");

    const trace = lastEmitted();
    expect(trace.resultKind).toBe("clarification");
    expect(trace.policyDisposition).toBe("clarified");
    expect(trace.providerStatus).toBe("ok");
    expect(trace.providerOutcome).toBe("accepted");
  });

  it("emits an unsupported trace for an unsupported interpretation (O)", async () => {
    mockInterpret.mockResolvedValue({
      kind: "unsupported",
      reason: "not_financial",
      provider: { name: "fake-openai", configured: true, model: "m", promptVersion: "v" },
    } as never);

    const response = await askV2Ask({ message: "Who is Ada?" });
    expect(response.disposition).toBe("unsupported");

    const trace = lastEmitted();
    expect(trace.resultKind).toBe("unsupported");
    expect(trace.policyDisposition).toBe("unsupported");
  });

  it("emits provider failure kinds without mislabelling them as answers (K)", async () => {
    mockInterpret.mockResolvedValue({
      kind: "provider_unavailable",
      provider: { name: "deterministic", configured: false, model: null, promptVersion: "v" },
    } as never);

    const response = await askV2Ask({ message: "What did I spend?" });
    expect(response.disposition).toBe("unsupported");

    const trace = lastEmitted();
    expect(trace.resultKind).toBe("provider_unavailable");
    expect(trace.providerAttempted).toBe(false);
    expect(trace.providerStatus).toBe("not_attempted");
    expect(trace.providerOutcome).toBe("not_used");
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("emits timeout with transport status timeout", async () => {
    mockInterpret.mockResolvedValue({
      kind: "provider_timeout",
      provider: { name: "fake-openai", configured: true, model: "m", promptVersion: "v" },
    } as never);
    await askV2Ask({ message: "balance?" });

    const trace = lastEmitted();
    expect(trace.resultKind).toBe("provider_timeout");
    expect(trace.providerAttempted).toBe(true);
    expect(trace.providerStatus).toBe("timeout");
  });

  it("emits an execution_error trace when the executor throws, then rethrows (P-adjacent)", async () => {
    successInterpretation({ tool: "balance" });
    mockExecute.mockRejectedValue(new Error("db down"));

    await expect(askV2Ask({ message: "balance?" })).rejects.toThrow("db down");
    const trace = lastEmitted();
    expect(trace.resultKind).toBe("execution_error");
    expect(trace.policyDisposition).toBe("executed");
  });

  it("telemetry failure does NOT fail the user request (P)", async () => {
    successInterpretation({ tool: "expense_summary", period: { kind: "lastMonth" } });
    answerOutcome("Spending in July 2026 was ₦187,600.");
    mockNarrate.mockResolvedValue({
      kind: "answer",
      text: "You spent ₦187,600 in July 2026.",
      provider: { name: "fake-openai", configured: true, model: "m", promptVersion: "ask-v2-narrator/v1" },
    } as never);
    mockPersist.mockResolvedValue({ conversationId: CONV, userMessageId: "um-1", assistantMessageId: "am-1", created: false });
    mockEmitV2Trace.mockImplementation(() => {
      throw new Error("telemetry exploded");
    });

    const response = await askV2Ask({ message: "What did I spend last month?", conversationId: CONV });
    expect(response.disposition).toBe("answer");
    if (response.disposition === "answer") expect(response.text).toBe("You spent ₦187,600 in July 2026.");
    expect(mockPersist).toHaveBeenCalled();
  });

  it("emitted traces contain no forbidden fields anywhere (Q)", async () => {
    successInterpretation({ tool: "expense_summary", period: { kind: "lastMonth" } });
    answerOutcome("Spending in July 2026 was ₦187,600.");
    mockNarrate.mockResolvedValue({
      kind: "answer",
      text: "You spent ₦187,600 in July 2026.",
      provider: { name: "fake-openai", configured: true, model: "m", promptVersion: "ask-v2-narrator/v1" },
    } as never);
    mockPersist.mockResolvedValue({ conversationId: CONV, userMessageId: "um-1", assistantMessageId: "am-1", created: false });

    await askV2Ask({ message: "What did I spend last month?", conversationId: CONV });
    for (const call of mockEmitV2Trace.mock.calls) {
      expect(redactionViolations(call[0])).toEqual([]);
    }
  });

  it("provider/model/prompt metadata carries no financial content (R)", async () => {
    successInterpretation({ tool: "expense_summary", period: { kind: "lastMonth" } });
    answerOutcome("Spending in July 2026 was ₦187,600.");
    mockNarrate.mockResolvedValue({
      kind: "answer",
      text: "You spent ₦187,600 in July 2026.",
      provider: { name: "fake-openai", configured: true, model: "m", promptVersion: "ask-v2-narrator/v1" },
    } as never);
    mockPersist.mockResolvedValue({ conversationId: CONV, userMessageId: "um-1", assistantMessageId: "am-1", created: false });

    await askV2Ask({ message: "What did I spend last month?", conversationId: CONV });
    for (const call of mockEmitV2Trace.mock.calls) {
      const trace = call[0] as unknown as Record<string, unknown>;
      expect(typeof trace.provider).toBe("string");
      expect(typeof trace.model).toBe("string");
      expect(typeof trace.interpreterPromptVersion).toBe("string");
      expect(typeof trace.narratorPromptVersion).toBe("string");
      expect(redactionViolations(trace)).toEqual([]);
    }
  });
});
