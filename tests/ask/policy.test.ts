import { describe, expect, it } from "vitest";
import {
  evaluateInterpretationPolicy,
  INTERPRETER_CONFIDENCE_MIN,
} from "@/lib/ask/policy";
import type { Interpretation } from "@/lib/ask/contracts";

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

describe("evaluateInterpretationPolicy", () => {
  it("allows a confident query proposal", () => {
    expect(evaluateInterpretationPolicy(queryProposal(), ["none"])).toEqual({ allowed: true });
  });

  it("denies low-confidence query proposals (below the 0.6 floor)", () => {
    const decision = evaluateInterpretationPolicy(
      queryProposal({ confidence: INTERPRETER_CONFIDENCE_MIN - 0.01 }),
      ["none"],
    );
    expect(decision).toEqual({ allowed: false, denyReason: "low_confidence" });
  });

  it("denies a category_spend proposal without an entity", () => {
    const decision = evaluateInterpretationPolicy(
      queryProposal({ intent: "category_spend", reference: "last_category" }),
      ["none", "last_category"],
    );
    expect(decision).toEqual({ allowed: false, denyReason: "missing_entity" });
  });

  it("denies a proposal referencing a slot the caller never advertised", () => {
    const decision = evaluateInterpretationPolicy(
      queryProposal({ reference: "older_amount_anchor" }),
      ["none"],
    );
    expect(decision).toEqual({ allowed: false, denyReason: "invalid_reference" });
  });

  it("allows clarify + unsupported proposals (deterministic result still wins)", () => {
    expect(
      evaluateInterpretationPolicy(
        { disposition: "clarify", reason: "ambiguous_amount", reference: "none", confidence: 0.9 },
        ["none"],
      ),
    ).toEqual({ allowed: true });
    expect(
      evaluateInterpretationPolicy(
        { disposition: "unsupported", safeReason: "not_financial", confidence: 0.9 },
        ["none"],
      ),
    ).toEqual({ allowed: true });
  });
});