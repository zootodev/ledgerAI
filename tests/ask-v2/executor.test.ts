import { describe, expect, it, vi, beforeEach } from "vitest";
import { internalToolKeySchema, type ExecutionPlan } from "@/lib/ask/contracts";
import { executePlan } from "@/lib/finance/tools/executor";
import {
  buildFinanceToolContext,
  executeAskV2Plan,
  type AskV2ExecutorContext,
} from "@/lib/ask-v2/executor";
import type { AskV2ToolKeys } from "@/lib/ask-v2/contracts";

vi.mock("@/lib/finance/tools/executor", () => ({
  executePlan: vi.fn(),
}));

const mockExecutePlan = vi.mocked(executePlan);

const NOW = new Date("2026-08-15T12:00:00.000Z");

function ctx(businessId = "biz-a"): AskV2ExecutorContext {
  return {
    prisma: {} as never,
    businessId,
    currency: "NGN",
    now: NOW,
    traceId: "t-1",
  };
}

const PLAN: ExecutionPlan = {
  kind: "answer",
  query: { intent: "expenses", category: null, period: { kind: "thisMonth" } },
  toolKeys: ["summary.get"],
};

const TOOL_KEYS: AskV2ToolKeys = ["summary.get"];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("buildFinanceToolContext — server-side tenant injection", () => {
  it("maps the injected context onto the canonical finance-tool context", () => {
    const context = buildFinanceToolContext(ctx("biz-42"));
    expect(context).toEqual({
      prisma: ctx("biz-42").prisma,
      businessId: "biz-42",
      currency: "NGN",
      now: NOW,
      traceId: "t-1",
    });
  });
});

describe("executeAskV2Plan — read-only, verified, deterministic boundary", () => {
  it("executes with the injected businessId, never one derived from the client", async () => {
    const answerOutcome = {
      kind: "answer",
      query: PLAN.query,
      answer: { kind: "answer", text: "Spending was ₦187,600.", data: {} },
      metrics: {},
      toolResults: [],
    };
    mockExecutePlan.mockResolvedValue(answerOutcome as never);

    const outcome = await executeAskV2Plan(ctx("biz-42"), PLAN, PLAN.query, TOOL_KEYS);
    expect(mockExecutePlan).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: "biz-42" }),
      PLAN,
    );
    expect(outcome.kind).toBe("answer");
  });

  it("passes verified figures through untouched — nothing is fabricated", async () => {
    const text = "Spending in June 2026 was ₦900,000.00 for rent.";
    mockExecutePlan.mockResolvedValue({
      kind: "answer",
      query: PLAN.query,
      answer: { kind: "answer", text, data: { amount: 900000 } },
      metrics: {},
      toolResults: [],
    } as never);

    const outcome = await executeAskV2Plan(ctx(), PLAN, PLAN.query, TOOL_KEYS);
    expect(outcome.kind).toBe("answer");
    if (outcome.kind === "answer") {
      expect(outcome.answer.text).toBe(text);
      expect(outcome.toolKeys).toEqual(TOOL_KEYS);
    }
  });

  it("keeps the plan on read-only allow-listed keys only", () => {
    for (const key of PLAN.toolKeys) {
      expect(internalToolKeySchema.options).toContain(key);
    }
  });

  it("folds an engine clarification through as a clarification", async () => {
    mockExecutePlan.mockResolvedValue({ kind: "clarification", reason: "needs_subject" } as never);
    const outcome = await executeAskV2Plan(ctx(), PLAN, PLAN.query, TOOL_KEYS);
    expect(outcome).toEqual({ kind: "clarification", reason: "needs_subject" });
  });

  it("maps an engine unsupported onto a typed unsupported boundary", async () => {
    mockExecutePlan.mockResolvedValue({ kind: "unsupported" } as never);
    const outcome = await executeAskV2Plan(ctx(), PLAN, PLAN.query, TOOL_KEYS);
    expect(outcome).toEqual({ kind: "unsupported", reason: "not_supported" });
  });
});