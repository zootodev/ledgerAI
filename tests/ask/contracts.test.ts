import { describe, expect, it } from "vitest";
import {
  askTurnInputSchema,
  interpretationSchema,
  executionPlanSchema,
  assistantQuerySchema,
  summaryResultSchema,
  balanceResultSchema,
  periodComparisonResultSchema,
  expenseImpactResultSchema,
  narrationManifestSchema,
  narrationPlanSchema,
} from "@/lib/ask/contracts";

/** A canonically-valid generic query proposal. */
function queryProposal(overrides: Record<string, unknown> = {}) {
  return {
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
    confidence: 0.85,
    ...overrides,
  };
}

describe("interpretationSchema (provider output boundary)", () => {
  it("accepts a well-formed query proposal", () => {
    const result = interpretationSchema.safeParse(queryProposal());
    expect(result.success).toBe(true);
  });

  it("rejects unknown intents / periods", () => {
    expect(interpretationSchema.safeParse(queryProposal({ intent: "drop_tables" })).success).toBe(false);
    expect(interpretationSchema.safeParse(queryProposal({ period: { kind: "fiscal_era" } })).success).toBe(false);
  });

  it("rejects a model-authored numeric amount (money may only be a text span)", () => {
    const extra = interpretationSchema.safeParse(queryProposal({ hypotheticalAmount: 50_000 }));
    expect(extra.success).toBe(false);
    const span = interpretationSchema.safeParse(
      queryProposal({ intent: "expense_breakdown", userAmountSpan: "600,000" }),
    );
    expect(span.success).toBe(true);
  });

  it("is strict — extra keys never silently pass", () => {
    expect(interpretationSchema.safeParse(queryProposal({ categoryName: "Rent" })).success).toBe(false);
    expect(interpretationSchema.safeParse(queryProposal({ amount: 100 })).success).toBe(false);
  });

  it("rejects out-of-range confidence and oversized spans", () => {
    expect(interpretationSchema.safeParse(queryProposal({ confidence: 1.2 })).success).toBe(false);
    expect(
      interpretationSchema.safeParse(queryProposal({ userAmountSpan: "x".repeat(49) })).success,
    ).toBe(false);
  });

  it("accepts clarify and unsupported proposals", () => {
    expect(
      interpretationSchema.safeParse({
        disposition: "clarify",
        reason: "ambiguous_amount",
        reference: "none",
        confidence: 0.9,
      }).success,
    ).toBe(true);
    expect(
      interpretationSchema.safeParse({
        disposition: "unsupported",
        safeReason: "not_financial",
        confidence: 0.95,
      }).success,
    ).toBe(true);
  });
});

describe("executionPlanSchema + assistantQuerySchema", () => {
  it("mirrors the engine query union", () => {
    const plan = {
      kind: "answer",
      query: {
        intent: "expenses",
        category: null,
        period: { kind: "thisMonth" },
      },
      toolKeys: ["summary.get"],
    };
    expect(assistantQuerySchema.safeParse(plan.query).success).toBe(true);
    expect(executionPlanSchema.safeParse(plan).success).toBe(true);
  });

  it("rejects provider-invented tool keys at the plan boundary", () => {
    const plan = {
      kind: "answer",
      query: { intent: "expenses", category: null, period: { kind: "thisMonth" } },
      toolKeys: ["sql.run"],
    };
    expect(executionPlanSchema.safeParse(plan).success).toBe(false);
  });

  it("rejects an empty tool key list", () => {
    const plan = {
      kind: "answer",
      query: { intent: "expenses", category: null, period: { kind: "thisMonth" } },
      toolKeys: [],
    };
    expect(executionPlanSchema.safeParse(plan).success).toBe(false);
  });
});

describe("tool result contracts", () => {
  it("briefly asserts each verified result prefers its own contract", () => {
    const summary = {
      meta: {
        source: "deterministic_finance_engine",
        currency: "NGN",
        period: { from: "2026-08-01", to: "2026-08-31", label: "August 2026" },
      },
      income: 1_000_000,
      expenses: 600_000,
      netProfit: 400_000,
      counts: { income: 1, expenses: 2, transfers: 0 },
    };
    expect(summaryResultSchema.parse(summary).netProfit).toBe(400_000);
    expect(
      balanceResultSchema.parse({
        meta: summary.meta,
        balance: 2_000_000,
      }).balance,
    ).toBe(2_000_000);
  });

  it("rejects a model-authored source (results are verified only)", () => {
    expect(
      summaryResultSchema.safeParse({
        meta: { source: "llm_estimate", currency: "NGN", period: { from: null, to: null, label: "x" } },
        income: 1,
        expenses: 1,
        netProfit: 0,
        counts: { income: 1, expenses: 0, transfers: 0 },
      }).success,
    ).toBe(false);
  });

  it("bounds comparison + impact results to verified figures", () => {
    const comparison = {
      meta: { source: "deterministic_finance_engine", currency: "NGN", period: { from: null, to: null, label: "all time" } },
      target: "income",
      current: 100,
      prior: 80,
      deltaAmount: 20,
      deltaPercent: 25,
    };
    const parsed = periodComparisonResultSchema.parse(comparison);
    expect(parsed.deltaAmount).toBe(20);

    const impact = {
      meta: { source: "deterministic_finance_engine", currency: "NGN", period: { from: null, to: null, label: "x" } },
      revenue: 1_000_000,
      expenses: 600_000,
      netProfit: 400_000,
      scenario: { effectGoal: "profit", operation: "decrease", hypotheticalAmount: 100_000, shifted: 300_000 },
    };
    expect(expenseImpactResultSchema.parse(impact).scenario.shifted).toBe(300_000);
  });
});

describe("narration contracts", () => {
  it("validates a manifest with stable fact ids", () => {
    const manifest = {
      answerKind: "comparison",
      facts: [
        { id: "F1", kind: "period", display: "August 2026", required: true },
        { id: "F2", kind: "money", display: "₦600,000", required: true },
      ],
      allowedTemplates: ["direct", "explain"],
    };
    expect(narrationManifestSchema.parse(manifest).facts).toHaveLength(2);
    expect(narrationPlanSchema.parse({ template: "direct", factOrder: ["F1", "F2"], optionalLead: "none" }).template).toBe("direct");
  });

  it("rejects a fact id outside F[1-9][0-9]*", () => {
    const manifest = {
      answerKind: "summary",
      facts: [{ id: "F0", kind: "money", display: "₦600,000", required: true }],
      allowedTemplates: ["direct"],
    };
    expect(narrationManifestSchema.safeParse(manifest).success).toBe(false);
  });
});

describe("askTurnInputSchema", () => {
  it("accepts a client turn input with uuid id", () => {
    expect(
      askTurnInputSchema.safeParse({
        question: "How much did I spend?",
        conversationId: "0f8fad5b-d9cb-469f-a165-70867728950e",
        clientRequestId: "3f8fad5b-d9cb-469f-a165-70867728950e",
      }).success,
    ).toBe(true);
  });

  it("rejects missing clientRequestId and conversations without uuid", () => {
    expect(
      askTurnInputSchema.safeParse({
        question: "How much did I spend?",
        conversationId: "not-a-uuid",
        clientRequestId: "3f8fad5b-d9cb-469f-a165-70867728950e",
      }).success,
    ).toBe(false);
    expect(
      askTurnInputSchema.safeParse({
        question: "How much did I spend?",
        clientRequestId: "3f8fad5b-d9cb-469f-a165-70867728950e",
      }).success,
    ).toBe(true);
  });
});