import { describe, expect, it } from "vitest";
import {
  buildInterpreterSurface,
  parseUserAmountSpan,
  intentToSemanticKind,
  periodToSemanticKind,
  resolveInterpretationContext,
  deriveContextFrameV2,
  referenceSlotsFor,
} from "@/lib/ask/context-resolver";
import type { FinancialContextFrame } from "@/lib/finance/context-frame";
import type { Interpretation, FinancialFact, QueryInterpretation } from "@/lib/ask/contracts";

const NOW = new Date("2026-08-15T12:00:00.000Z");

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
  } as Interpretation;
}

/** A re-computed OWNED frame exactly as buildContextFrame would store one. */
function expenseBreakdownFrame(
  overrides: Partial<FinancialContextFrame> = {},
): FinancialContextFrame {
  return {
    conversationId: "c-1",
    businessId: "biz-a",
    createdAt: NOW.toISOString(),
    exchangeIndex: 0,
    question: "How did my spending in July break down?",
    answer:
      "Of your ₦600,000 spending in July 2026, Rent (₦500,000), Marketing (₦100,000) accounted for 100%.",
    classification: "answer",
    clarificationReason: null,
    query: {
      intent: "expenseBreakdown",
      category: null,
      period: { kind: "month", month: 6, year: 2026 },
    },
    period: { kind: "month", month: 6, year: 2026 },
    resolved: { from: "2026-07-01", to: "2026-07-31", label: "July 2026" },
    reported: {
      metric: "expenses",
      total: 600_000,
      periodLabel: "July 2026",
      categoryName: null,
      categories: ["Rent", "Marketing"],
    },
    ...overrides,
  };
}

describe("buildInterpreterSurface (redacted)", () => {
  it("exposes only kinds and slot names — zero financial data", () => {
    const frame = expenseBreakdownFrame();
    const surface = buildInterpreterSurface([frame]);
    expect(surface.availableReferenceSlots).toContain("none");
    expect(surface.availableReferenceSlots).toContain("last_expense_total");
    expect(surface.lastIntent).toBe("expense_breakdown");
    expect(surface.lastPeriodKind).toBe("month");
    expect(surface.allowedIntents.length).toBeGreaterThan(0);
    // Redaction: nothing money/category/id shaped on the wire.
    const serialized = JSON.stringify(surface);
    expect(serialized).not.toMatch(/₦/);
    expect(serialized).not.toMatch(/600,000/);
    expect(serialized).not.toContain("conversationId");
    expect(serialized).not.toContain("businessId");
    expect(serialized).not.toMatch(/rent/i);
  });

  it("declares an empty surface for an empty context", () => {
    const surface = buildInterpreterSurface([]);
    expect(surface.availableReferenceSlots).toEqual(["none"]);
    expect(surface.lastIntent).toBeNull();
    expect(surface.lastPeriodKind).toBeNull();
  });
});

describe("referenceSlotsFor", () => {
  it("advertises a category slot when the last exchange reported a category", () => {
    const frame = expenseBreakdownFrame({
      question: "How much did I spend on rent in July?",
      query: { intent: "categorySpend", category: "Rent", period: { kind: "month", month: 6, year: 2026 } },
      period: { kind: "month", month: 6, year: 2026 },
      reported: {
        metric: "category",
        total: 500_000,
        periodLabel: "July 2026",
        categoryName: "Rent",
        categories: [],
      },
    });
    expect(referenceSlotsFor([frame])).toContain("last_category");
  });

  it("advertises last_clarification after a clarification turn", () => {
    const frame = expenseBreakdownFrame({
      question: "Do you mean savings?",
      answer: "In July 2026, your regular savings balance was ₦420,000; your fixed-deposit savings balance was ₦1,200,000.",
      classification: "clarification",
      clarificationReason: "ambiguous_savings",
      query: null,
      period: { kind: "month", month: 6, year: 2026 },
      reported: { metric: "balance", total: null, periodLabel: null, categoryName: null, categories: [] },
    });
    expect(referenceSlotsFor([frame])).toContain("last_clarification");
  });
});

describe("kind mappings", () => {
  it("maps engine intents to semantic kinds", () => {
    expect(intentToSemanticKind("expenseBreakdown")).toBe("expense_breakdown");
    expect(intentToSemanticKind("periodComparison")).toBe("period_comparison");
  });

  it("maps engine periods to semantic periods and refuses custom", () => {
    expect(periodToSemanticKind({ kind: "thisMonth" })).toEqual({ kind: "this_month" });
    expect(periodToSemanticKind({ kind: "recent", days: 30 })).toEqual({ kind: "recent", days: 30 });
    expect(periodToSemanticKind({ kind: "custom", from: "2026-01-01", to: "2026-01-31", label: "Jan" })).toBeNull();
  });
});

describe("parseUserAmountSpan", () => {
  it("parses a user-stated span with trusted money logic", () => {
    expect(parseUserAmountSpan("600,000")).toBe(600_000);
    expect(parseUserAmountSpan("about 100k")).toBe(100_000);
    expect(parseUserAmountSpan(null)).toBeNull();
    expect(parseUserAmountSpan("")).toBeNull();
  });
});

describe("resolveInterpretationContext (reference grounding)", () => {
  it("passes an explicit, non-conversation period through unchanged", () => {
    const proposal = queryProposal({ intent: "expenses", period: { kind: "this_month" } });
    const resolved = resolveInterpretationContext(proposal, "How much did I spend?", [], NOW);
    expect(resolved.kind).toBe("resolved");
    if (resolved.kind === "resolved") {
      expect((resolved.interpretation as QueryInterpretation).period).toEqual({ kind: "this_month" });
    }
  });

  it("clarifies a conversation_reference period that is not an expense breakdown", () => {
    const resolved = resolveInterpretationContext(
      queryProposal({ period: { kind: "conversation_reference" }, intent: "income" }),
      "What about that?",
      [],
      NOW,
    );
    expect(resolved).toEqual({ kind: "clarify", reason: "needs_subject" });
  });

  it("grounds a conversation_reference breakdown against an OWNED frame", () => {
    const frame = expenseBreakdownFrame();
    const resolved = resolveInterpretationContext(
      queryProposal({
        intent: "expense_breakdown",
        period: { kind: "conversation_reference" },
        userAmountSpan: null,
      }),
      "how did that break down?",
      [frame],
      NOW,
    );
    expect(resolved.kind).toBe("resolved");
    if (resolved.kind === "resolved") {
      const grounded = resolved.interpretation as QueryInterpretation;
      expect(grounded.period).toEqual({ kind: "month", month: 6, year: 2026 });
      expect(grounded.reference).toBe("none");
      expect(grounded.userAmountSpan).toBeNull();
    }
  });

  it("clarifies ambiguous amounts that match multiple owned periods (§22)", () => {
    const july = expenseBreakdownFrame();
    const june = expenseBreakdownFrame({
      exchangeIndex: 1,
      question: "How did my spending in June break down?",
      answer:
        "Of your ₦600,000 spending in June 2026, Rent (₦400,000), Marketing (₦200,000) accounted for 100%.",
      query: { intent: "expenseBreakdown", category: null, period: { kind: "month", month: 5, year: 2026 } },
      period: { kind: "month", month: 5, year: 2026 },
      resolved: { from: "2026-06-01", to: "2026-06-30", label: "June 2026" },
    });
    const resolved = resolveInterpretationContext(
      queryProposal({
        intent: "expense_breakdown",
        period: { kind: "conversation_reference" },
        userAmountSpan: "600,000",
      }),
      "what about that 600,000?",
      [july, june],
      NOW,
    );
    expect(resolved.kind).toBe("clarify");
    if (resolved.kind === "clarify") expect(resolved.reason).toBe("ambiguous_amount");
  });

  it("grounds a CITED amount that matches exactly one owned period", () => {
    const frame = expenseBreakdownFrame();
    const resolved = resolveInterpretationContext(
      queryProposal({
        intent: "expense_breakdown",
        period: { kind: "conversation_reference" },
        userAmountSpan: "600,000",
      }),
      "what about the 600,000?",
      [frame],
      NOW,
    );
    expect(resolved.kind).toBe("resolved");
  });
});

describe("deriveContextFrameV2", () => {
  it("derives a validated V2 frame with anchors", () => {
    const frame = expenseBreakdownFrame();
    const facts: FinancialFact[] = [
      { id: "F1", kind: "period", display: "July 2026", required: true },
      { id: "F2", kind: "money", display: "₦600,000", required: true },
    ];
    const v2 = deriveContextFrameV2({
      turnOrdinal: 1,
      frame,
      facts,
      moneyFactId: "F2",
    });
    expect(v2.schemaVersion).toBe(2);
    expect(v2.answerKind).toBe("answer");
    expect(v2.anchors.map((a) => a.id)).toContain("last_expense_total");
    expect(v2.anchors.map((a) => a.id)).toContain("period");
    expect(v2.period).toEqual({ kind: "month", month: 6, year: 2026 });
  });
});