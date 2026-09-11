import { describe, expect, it } from "vitest";
import {
  compileExecutionPlan,
  canonicalClarificationReason,
  toolKeysForIntent,
  interpretationToSemantic,
} from "@/lib/ask/compiler";
import type { Interpretation, InternalToolKey, QueryInterpretation } from "@/lib/ask/contracts";

function queryProposal(overrides: Record<string, unknown> = {}): QueryInterpretation {
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
  } as QueryInterpretation;
}

describe("compileExecutionPlan", () => {
  it("compiles a concrete income query to an answer plan with allowlisted tools", () => {
    const plan = compileExecutionPlan(queryProposal({ intent: "income" }));
    expect(plan.kind).toBe("answer");
    if (plan.kind === "answer") {
      expect(plan.query).toEqual({ intent: "income", category: null, period: { kind: "thisMonth" } });
      expect(plan.toolKeys).toEqual(["summary.get"]);
    }
  });

  it("maps every semantic intent to an engine query and its tools", () => {
    const cases: Array<[string, InternalToolKey[]]> = [
      ["balance", ["balance.get"]],
      ["expenses", ["summary.get"]],
      ["profit", ["summary.get"]],
      ["profit_margin", ["summary.get"]],
      ["income_vs_expenses", ["summary.get"]],
      ["transaction_count", ["summary.get", "transactions.count"]],
      ["top_category", ["categories.listSpending", "categories.extremity"]],
      ["category_spend", ["categories.listSpending"]],
      ["spending_distribution", ["categories.listSpending", "categories.distribution"]],
      ["expense_breakdown", ["summary.get", "categories.listSpending", "categories.distribution"]],
      ["expense_impact", ["summary.get", "categories.listSpending"]],
      ["period_comparison", ["period.compare"]],
    ];
    for (const [intent, keys] of cases) {
      const proposal = queryProposal({
        intent,
        entity: intent === "category_spend" ? "rent" : null,
      });
      const plan = compileExecutionPlan(proposal);
      expect(plan.kind, intent).toBe("answer");
      if (plan.kind === "answer") expect(plan.toolKeys).toEqual(keys);
    }
  });

  it("refuses a conversation_reference period the resolver has not grounded", () => {
    const plan = compileExecutionPlan(
      queryProposal({ intent: "expense_breakdown", period: { kind: "conversation_reference" } }),
    );
    expect(plan).toEqual({ kind: "clarification", reason: "needs_subject" });
  });

  it("clarifies a category_spend that forgot its entity", () => {
    const plan = compileExecutionPlan(queryProposal({ intent: "category_spend", entity: null }));
    expect(plan.kind).toBe("clarification");
  });

  it("canonicalizes clarify + unsupported dispositions", () => {
    expect(
      compileExecutionPlan({
        disposition: "clarify",
        reason: "ambiguous_savings",
        reference: "none",
        confidence: 0.9,
      } as Interpretation),
    ).toEqual({ kind: "clarification", reason: "ambiguous_savings" });
    expect(
      compileExecutionPlan({
        disposition: "unsupported",
        safeReason: "not_financial",
        confidence: 0.9,
      } as Interpretation),
    ).toEqual({ kind: "unsupported" });
  });
});

describe("canonicalClarificationReason", () => {
  it("maps unknown reasons to ambiguous_financial_metric", () => {
    expect(canonicalClarificationReason("something_else")).toBe("ambiguous_financial_metric");
    expect(canonicalClarificationReason("needs_subject")).toBe("needs_subject");
  });
});

describe("interpretationToSemantic", () => {
  it("carries a user amount span as a hypotheticalAmount (never computes it)", () => {
    const semantic = interpretationToSemantic(
      queryProposal({ intent: "expense_impact", userAmountSpan: "about 100k" }),
    );
    expect(semantic?.classification).toBe("query");
    if (semantic?.classification === "query") {
      expect(semantic.hypotheticalAmount).not.toBeNull();
    }
  });

  it("returns null for a malformed period", () => {
    expect(
      interpretationToSemantic(queryProposal({ period: { kind: "nope" } })),
    ).toBeNull();
  });
});

describe("toolKeysForIntent", () => {
  it("throws on an unknown intent (exhaustiveness guard)", () => {
    expect(() => toolKeysForIntent("sql.run")).toThrow("unknown semantic intent");
  });
});