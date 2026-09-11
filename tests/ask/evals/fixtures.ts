import type { EvalFixture } from "./harness";

/**
 * Recorded-like interpreter outcomes for the eval suite. Each is a model-
 * shaped JSON object exactly as the interpreter would surface it (before Zod).
 * They encode the three guarantees the spec pins to the canary band:
 *  - improved: a sane reading of an undecided question becomes a real answer;
 *  - gating:   a provider reading never displaces an authoritative query;
 *  - clarity:  a duplicate figure in distinct periods asks, it never guesses.
 */
export const INTERPRETER_FIXTURES: EvalFixture = {
  improved: JSON.stringify({
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
  }),
  gating: JSON.stringify({
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
  fallback: JSON.stringify({
    disposition: "clarify",
    reason: "ambiguous_amount",
    reference: "none",
    confidence: 0.9,
  }),
  clarity: JSON.stringify({
    disposition: "query",
    intent: "expense_breakdown",
    period: { kind: "conversation_reference" },
    entity: null,
    target: null,
    mode: "factual",
    operation: null,
    effectGoal: null,
    userAmountSpan: "600,000",
    reference: "older_amount_anchor",
    confidence: 0.85,
  }),
};