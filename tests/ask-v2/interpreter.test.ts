import { describe, expect, it, vi } from "vitest";
import { interpretAskV2, type AskV2ConversationMessage } from "@/lib/ask-v2/interpreter";
import type { AskAiRuntime } from "@/lib/ai/ask-provider";
import type { AskTurnMessages } from "@/lib/ai/ask-provider";
import { askV2ProposalSchema } from "@/lib/ask-v2/contracts";
import { askV2PolicyDecision } from "@/lib/ask-v2/policy";
import { ASK_V2_INTERPRETER_PROMPT_VERSION } from "@/lib/ask-v2/prompts";

const NOW = new Date("2026-08-15T12:00:00.000Z");

const VALID_PROPOSAL_JSON: unknown = {
  kind: "proposal",
  proposal: { tool: "expense_summary", period: { kind: "lastMonth" } },
};

interface InterpreterStub {
  name: string;
  configured: boolean;
  model: string | null;
  interpret: ReturnType<typeof vi.fn>;
}

function interpreterStub(overrides: Partial<InterpreterStub> = {}): InterpreterStub {
  return {
    name: "fake-openai",
    configured: true,
    model: "gpt-fake-1",
    interpret: vi.fn().mockResolvedValue(VALID_PROPOSAL_JSON),
    ...overrides,
  };
}

function runtime(
  interpreter: InterpreterStub = interpreterStub(),
  mode: "off" | "shadow" | "canary" = "canary",
): AskAiRuntime {
  return {
    config: {
      mode,
      interpreterEnabled: true,
      narrationEnabled: false,
      structuredStateWrite: false,
      shadowSampleRate: 1,
      askV2Enabled: false,
    },
    providers: {
      interpreter: interpreter as never,
      narrationPlanner: { name: "deterministic", configured: false, plan: vi.fn() },
    },
  };
}

function providerPayloads(interpreter: InterpreterStub): AskTurnMessages {
  const messages = interpreter.interpret.mock.calls[0][0] as AskTurnMessages;
  return messages;
}

describe("interpretAskV2 — valid structured proposal", () => {
  it("accepts a schema-valid proposal and returns it for policy", async () => {
    const interpreter = interpreterStub();
    const result = await interpretAskV2({
      message: "What did I spend last month?",
      history: [],
      now: NOW,
      ai: runtime(interpreter),
    });

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.proposal).toEqual({ tool: "expense_summary", period: { kind: "lastMonth" } });
      expect(askV2ProposalSchema.safeParse(result.proposal).success).toBe(true);
    }
    expect(interpreter.interpret).toHaveBeenCalledTimes(1);
  });

  it("stamps provider metadata (redacted) on the result", async () => {
    const interpreter = interpreterStub();
    const result = await interpretAskV2({
      message: "What did I spend last month?",
      history: [],
      now: NOW,
      ai: runtime(interpreter),
    });
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.provider).toEqual({
        name: "fake-openai",
        configured: true,
        model: "gpt-fake-1",
        promptVersion: ASK_V2_INTERPRETER_PROMPT_VERSION,
      });
    }
  });

  it("uses the version-pinned v2 prompt contract", async () => {
    const interpreter = interpreterStub();
    await interpretAskV2({ message: "hi there", history: [], now: NOW, ai: runtime(interpreter) });
    const messages = providerPayloads(interpreter);
    expect(messages.promptVersion).toBe(ASK_V2_INTERPRETER_PROMPT_VERSION);
    expect(messages.system).toContain("YOU MUST NOT");
    expect(messages.system).toContain('"categoryOrigin"');
    expect(messages.user).toContain("today");
  });

  it("advertises category_ranking with ranking semantics to the provider", async () => {
    const interpreter = interpreterStub();
    await interpretAskV2({ message: "hi there", history: [], now: NOW, ai: runtime(interpreter) });
    const payload = JSON.parse(providerPayloads(interpreter).user) as {
      availableTools: string[];
    };
    const system = providerPayloads(interpreter).system;
    const normalized = system.replace(/\s+/g, " ");

    expect(payload.availableTools).toContain("category_ranking");
    expect(normalized).toContain("- category_ranking: {\"period\"}");
    expect(normalized).toContain('"what did I spend the most on?"');
    expect(normalized).toContain("category_ranking never clarifies for a missing category");
  });
});

describe("interpretAskV2 — invalid provider output", () => {
  it("rejects v1-style natural-language output", async () => {
    const v1Style = { disposition: "query", intent: "expenses", period: { kind: "last_month" } };
    const interpreter = interpreterStub({ interpret: vi.fn().mockResolvedValue(v1Style) });
    const result = await interpretAskV2({ message: "x", history: [], now: NOW, ai: runtime(interpreter) });
    expect(result.kind).toBe("invalid_provider_output");
  });

  it("rejects a proposal missing required semantic arguments", async () => {
    const bad = { kind: "proposal", proposal: { tool: "expense_summary" } };
    const interpreter = interpreterStub({ interpret: vi.fn().mockResolvedValue(bad) });
    const result = await interpretAskV2({ message: "x", history: [], now: NOW, ai: runtime(interpreter) });
    expect(result.kind).toBe("invalid_provider_output");
  });

  it("rejects arbitrary JSON that is not the interpretation wrapper", async () => {
    const interpreter = interpreterStub({ interpret: vi.fn().mockResolvedValue({ hello: "world" }) });
    const result = await interpretAskV2({ message: "x", history: [], now: NOW, ai: runtime(interpreter) });
    expect(result.kind).toBe("invalid_provider_output");
  });
});

describe("interpretAskV2 — tenant and database context can never enter", () => {
  it("rejects a proposal that smuggles tenant context inside its arguments", async () => {
    const poisoned = { kind: "proposal", proposal: { tool: "balance", businessId: "biz-42" } };
    const interpreter = interpreterStub({ interpret: vi.fn().mockResolvedValue(poisoned) });
    const result = await interpretAskV2({ message: "balance", history: [], now: NOW, ai: runtime(interpreter) });
    expect(result.kind).toBe("invalid_provider_output");
  });

  it("rejects a wrapper that smuggles tenant context outside the proposal", async () => {
    const poisoned = { kind: "proposal", proposal: { tool: "balance" }, userId: "usr-1" };
    const interpreter = interpreterStub({ interpret: vi.fn().mockResolvedValue(poisoned) });
    const result = await interpretAskV2({ message: "balance", history: [], now: NOW, ai: runtime(interpreter) });
    expect(result.kind).toBe("invalid_provider_output");
  });

  it("sends the provider ONLY the bounded, id-free payload", async () => {
    const interpreter = interpreterStub();
    const history: AskV2ConversationMessage[] = [
      { role: "user", content: "What did I spend last month?" },
      { role: "assistant", content: "Spending was ₦187,600." },
    ];
    await interpretAskV2({ message: "what was that spent on?", history, now: NOW, ai: runtime(interpreter) });

    const messages = providerPayloads(interpreter);
    const payload = JSON.parse(messages.user) as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(
      ["availableTools", "history", "message", "outputSchema", "today"].sort(),
    );
    expect(payload.history).toEqual(history);
    expect(payload.message).toBe("what was that spent on?");
    expect(payload.availableTools).toContain("expense_summary");
    // Every history item is exactly role+content — no ids, timestamps, prisma, or SQL
    // fields can be carried across the boundary.
    for (const turn of payload.history as Array<Record<string, unknown>>) {
      expect(Object.keys(turn).sort()).toEqual(["content", "role"]);
    }
    expect(JSON.stringify(payload)).not.toMatch(/prisma|SELECT|sql|conversationId|createdAt|updatedAt/i);
  });
});

describe("interpretAskV2 — provider failure never fabricates", () => {
  it("maps a hardened transport failure to provider_unavailable, no proposal", async () => {
    const interpreter = interpreterStub({ interpret: vi.fn().mockRejectedValue(new Error("fetch failed")) });
    const result = await interpretAskV2({ message: "x", history: [], now: NOW, ai: runtime(interpreter) });
    expect(result.kind).toBe("provider_unavailable");
  });

  it("maps abort/timeout to provider_timeout, no proposal", async () => {
    for (const name of ["TimeoutError", "AbortError"]) {
      const interpreter = interpreterStub({
        interpret: vi.fn().mockRejectedValue(Object.assign(new Error("deadline"), { name })),
      });
      const result = await interpretAskV2({ message: "x", history: [], now: NOW, ai: runtime(interpreter) });
      expect(result.kind).toBe("provider_timeout");
    }
  });

  it("reports the gap when no provider is wired (no rules-NLU fallback)", async () => {
    const interpreter = interpreterStub({ configured: false });
    const result = await interpretAskV2({ message: "balance", history: [], now: NOW, ai: runtime(interpreter) });
    expect(result.kind).toBe("provider_unavailable");
  });

  it("respects the deployment opt-in: mode off disables interpretation", async () => {
    const interpreter = interpreterStub();
    const result = await interpretAskV2({ message: "balance", history: [], now: NOW, ai: runtime(interpreter, "off") });
    expect(result.kind).toBe("provider_unavailable");
    expect(interpreter.interpret).not.toHaveBeenCalled();
  });
});

describe("interpretAskV2 — conversation history grounding", () => {
  it("passes history through so follow-up references are representable", async () => {
    const interpreter = interpreterStub({
      interpret: vi.fn().mockResolvedValue({
        kind: "proposal",
        proposal: { tool: "expense_breakdown", period: { kind: "lastMonth" } },
      }),
    });
    const history: AskV2ConversationMessage[] = [
      { role: "user", content: "What did I spend last month?" },
      { role: "assistant", content: "Spending was ₦187,600." },
    ];
    const result = await interpretAskV2({
      message: "what was that spent on?",
      history,
      now: NOW,
      ai: runtime(interpreter),
    });

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.proposal.tool).toBe("expense_breakdown");
      expect(result.proposal).toMatchObject({ period: { kind: "lastMonth" } });
    }
    const payload = JSON.parse(providerPayloads(interpreter).user) as { history: unknown };
    expect(payload.history).toEqual(history);
  });

  it("passes the model's clarification through instead of guessing when context is thin", async () => {
    const interpreter = interpreterStub({
      interpret: vi.fn().mockResolvedValue({ kind: "clarification", reason: "needs_subject" }),
    });
    const result = await interpretAskV2({ message: "where did that money go?", history: [], now: NOW, ai: runtime(interpreter) });
    expect(result.kind).toBe("clarification");
    if (result.kind === "clarification") expect(result.reason).toBe("needs_subject");
  });
});

describe("interpretAskV2 — category_ranking resolves, never clarifies", () => {
  it("maps 'What did I spend the most on?' to category_ranking, then policy answers (no clarification)", async () => {
    const interpreter = interpreterStub({
      interpret: vi.fn().mockResolvedValue({
        kind: "proposal",
        proposal: { tool: "category_ranking", period: { kind: "thisYear" } },
      }),
    });
    const result = await interpretAskV2({
      message: "What did I spend the most on?",
      history: [],
      now: NOW,
      ai: runtime(interpreter),
    });
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.proposal).toEqual({ tool: "category_ranking", period: { kind: "thisYear" } });

      const decision = askV2PolicyDecision(result.proposal, { categorySet: new Set() });
      expect(decision).not.toMatchObject({ kind: "clarification" });
      expect(decision).not.toMatchObject({ kind: "unsupported" });
      expect(decision.kind).toBe("answer");
      if (decision.kind === "answer") {
        expect(decision.query).toEqual({
          intent: "spendingDistribution",
          category: null,
          period: { kind: "thisYear" },
        });
      }
    }
  });
});

describe("Phase 14.2 — fresh-turn aggregate ranking period resolution (prompt + interpretation contract)", () => {
  const golden: Array<{ message: string; tool: string; period: unknown }> = [
    { message: "What did I spend the most on?", tool: "category_ranking", period: { kind: "thisYear" } },
    { message: "Which category did I spend the most on?", tool: "category_ranking", period: { kind: "thisYear" } },
    { message: "What was my biggest expense category?", tool: "category_ranking", period: { kind: "thisYear" } },
    { message: "What did I spend the most on last month?", tool: "category_ranking", period: { kind: "lastMonth" } },
  ];

  it("prompt v6 scopes the thisYear fallback to aggregate ranking/distribution only", async () => {
    const interpreter = interpreterStub();
    await interpretAskV2({ message: "hi there", history: [], now: NOW, ai: runtime(interpreter) });
    const system = providerPayloads(interpreter).system.replace(/\s+/g, " ");

    expect(ASK_V2_INTERPRETER_PROMPT_VERSION).toBe("ask-v2-interpreter/v7");
    expect(system).toContain("For aggregate ranking or distribution requests");
    expect(system).toContain('"category_ranking" or "expense_breakdown" without a category');
    expect(system).toContain('conversation history provides no relevant period to inherit, default to "thisYear"');
    expect(system).toContain("Do not ask for clarification solely because the period is missing from an aggregate ranking request");
    // Explicit-period precedence must remain intact — thisYear is scoped,
    // never a universal default.
    expect(system).toContain("Prefer an explicitly stated period in the current message over any period inherited from conversation history");
  });

  it("the v4 interpretation contract resolves each golden question to category_ranking + policy answer (no clarification)", async () => {
    for (const g of golden) {
      const interpreter = interpreterStub({
        interpret: vi.fn().mockResolvedValue({ kind: "proposal", proposal: { tool: g.tool, period: g.period } }),
      });
      const result = await interpretAskV2({ message: g.message, history: [], now: NOW, ai: runtime(interpreter) });
      expect(result.kind, `${g.message}`).toBe("success");
      if (result.kind === "success") {
        expect(result.proposal).toEqual({ tool: g.tool, period: g.period });
        const decision = askV2PolicyDecision(result.proposal, { categorySet: new Set() });
        expect(decision.kind, `${g.message} policy`).toBe("answer");
        if (decision.kind === "answer") {
          expect(decision.query).toEqual({ intent: "spendingDistribution", category: null, period: g.period });
        }
      }
    }
  });

  it("regression: ordinary expense_summary and expense_breakdown behavior unchanged", async () => {
    const summary = askV2PolicyDecision({ tool: "expense_summary", period: { kind: "lastMonth" } });
    expect(summary.kind).toBe("answer");
    if (summary.kind === "answer") {
      expect(summary.query).toMatchObject({ intent: "expenses", period: { kind: "lastMonth" } });
      expect(summary.toolKeys).toEqual(["summary.get"]);
    }

    const aggregate = askV2PolicyDecision({ tool: "expense_breakdown", period: { kind: "thisYear" } });
    expect(aggregate.kind).toBe("answer");
    if (aggregate.kind === "answer") {
      expect(aggregate.query).toMatchObject({ intent: "spendingDistribution", category: null });
      expect(aggregate.toolKeys).toEqual(["summary.get", "categories.listSpending", "categories.distribution"]);
    }

    const scoped = askV2PolicyDecision({ tool: "expense_breakdown", period: { kind: "thisMonth" }, category: "Rent" });
    expect(scoped.kind).toBe("answer");
    if (scoped.kind === "answer") {
      expect(scoped.query).toMatchObject({ intent: "categorySpend", category: "Rent" });
    }
  });
});

describe("interpretAskV2 — Phase 15 category complement ('remaining categories')", () => {
  it("prompt v6 advertises the complement scope on expense_breakdown", async () => {
    const interpreter = interpreterStub();
    await interpretAskV2({ message: "hi there", history: [], now: NOW, ai: runtime(interpreter) });
    const system = providerPayloads(interpreter).system.replace(/\s+/g, " ");

    expect(ASK_V2_INTERPRETER_PROMPT_VERSION).toBe("ask-v2-interpreter/v7");
    expect(system).toContain('"scope"?');
    expect(system).toContain('"scope":"complement"');
    expect(system).toContain("the aggregate remainder");
    expect(system).toContain("distribution excluding that ONE category");
    expect(system).toContain("You only mark the SCOPE");
    // The interpreter never computes the remainder itself.
    expect(system).not.toContain("calculate the remainder");
    expect(system).not.toContain("sum the remaining");
  });

  it("prompt v6 validates through the 'remaining percent' — without distribution context the policy clarifies", async () => {
    const interpreter = interpreterStub();
    await interpretAskV2({ message: "hi there", history: [], now: NOW, ai: runtime(interpreter) });
    const system = providerPayloads(interpreter).system.replace(/\s+/g, " ");

    // Phase 15 + 17: "percent" is BOTH the complement divider and the share
    // contract. The v6 prompt must keep the share-vs-amount-vs-remainder
    // distinction explicit.
    expect(system).toContain("category_share");
    expect(system).toContain("share (percentage) of the requested period's total spending");
  });

  it("a category-less complement proposal is schema-valid and policy clarifies without owned distribution context", async () => {
    const complementProposal = {
      kind: "proposal",
      proposal: { tool: "expense_breakdown", period: { kind: "thisYear" }, scope: "complement" },
    };
    const interpreter = interpreterStub({ interpret: vi.fn().mockResolvedValue(complementProposal) });
    const history: AskV2ConversationMessage[] = [
      { role: "user", content: "From the beginning of this year till now, what did I spend most of my money on?" },
      { role: "assistant", content: "Most of your spending went to Rent at 38% of the total." },
    ];
    const result = await interpretAskV2({
      message: "What categories made up the remaining percent?",
      history,
      now: NOW,
      ai: runtime(interpreter),
    });
    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(askV2ProposalSchema.safeParse(result.proposal).success).toBe(true);

    // No VERIFIED distribution context (the answer text alone is narrator
    // prose, not an anchored distribution) → the complement cannot run.
    const decision = askV2PolicyDecision(result.proposal);
    expect(decision).toEqual({ kind: "clarification", reason: "needs_subject" });
  });

  it("an excluding complement proposal carries the named category resolved by history (categoryOrigin)", async () => {
    const excluding = {
      kind: "proposal",
      proposal: {
        tool: "expense_breakdown",
        period: { kind: "thisYear" },
        category: "Rent",
        categoryOrigin: "referenced",
        scope: "complement",
      },
    };
    const result = await interpretAskV2({ message: "apart from rent", history: [], now: NOW, ai: runtime(interpreterStub({ interpret: vi.fn().mockResolvedValue(excluding) })) });
    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.proposal).toMatchObject({
      tool: "expense_breakdown",
      scope: "complement",
      category: "Rent",
      categoryOrigin: "referenced",
    });
    expect(askV2ProposalSchema.safeParse(result.proposal).success).toBe(true);
  });
});

describe("interpretAskV2 — 'remaining percent' semantic gap (closed)", () => {
  it("no new remainder-only tool key exists: remaining_breakdown stays rejected", () => {
    const result = askV2ProposalSchema.safeParse({
      tool: "remaining_breakdown",
      period: { kind: "thisYear" },
    });
    expect(result.success).toBe(false);
  });

  it("Phase 15 CLOSES the gap: the question is representable via expense_breakdown scope complement", async () => {
    const complementProposal = {
      kind: "proposal",
      proposal: { tool: "expense_breakdown", period: { kind: "thisYear" }, scope: "complement" },
    };
    const interpreter = interpreterStub({ interpret: vi.fn().mockResolvedValue(complementProposal) });
    const result = await interpretAskV2({
      message: "What categories made up the remaining percent?",
      history: [],
      now: NOW,
      ai: runtime(interpreter),
    });
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.proposal).toEqual({
        tool: "expense_breakdown",
        period: { kind: "thisYear" },
        scope: "complement",
      });
      expect(askV2ProposalSchema.safeParse(result.proposal).success).toBe(true);
    }
  });
});