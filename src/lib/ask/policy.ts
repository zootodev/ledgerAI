// ============================================================
// LedgerAI — Interpretation policy gate (Stage 1)
// ------------------------------------------------------------
// Feasibility / safety checks that run on a Zod-validated interpreter
// proposal BEFORE the context resolver and compiler see it (spec §8.
// 4). Denials always fall back to the deterministic result — a
// provider can never lower the bar, only (at best) unlock a
// genuinely financial phrasing the deterministic classifier missed.
// ============================================================

import {
  type Interpretation,
  type ReferenceSlot,
} from "./contracts";

/** Minimum confidence for a provider QUERY proposal to proceed. */
export const INTERPRETER_CONFIDENCE_MIN = 0.6;

export type PolicyDenyReason =
  | "low_confidence"
  | "missing_entity"
  | "invalid_reference"
  | "unstable_query";

export type PolicyDecision =
  | { allowed: true }
  | { allowed: false; denyReason: PolicyDenyReason };

/**
 * Evaluate a parsed interpretation against capability and feasibility rules.
 * `availableReferences` are the slots the caller actually advertised from
 * OWNED context — a proposal may only reference those.
 */
export function evaluateInterpretationPolicy(
  interpretation: Interpretation,
  availableReferences: readonly ReferenceSlot[],
): PolicyDecision {
  if (interpretation.disposition === "unsupported") {
    // "Couldn't say either" is safe (the deterministic result wins anyway).
    return { allowed: true };
  }
  if (interpretation.disposition === "clarify") {
    // A proposed clarification is allowed; the compiler still normalizes it.
    return { allowed: true };
  }

  // Query proposals must be confident enough to displace an authoritative
  // deterministic clarification/unsupported classification.
  if (interpretation.confidence < INTERPRETER_CONFIDENCE_MIN) {
    return { allowed: false, denyReason: "low_confidence" };
  }

  if (interpretation.intent === "category_spend" && !interpretation.entity) {
    return { allowed: false, denyReason: "missing_entity" };
  }

  if (
    interpretation.reference !== "none" &&
    !availableReferences.includes(interpretation.reference)
  ) {
    return { allowed: false, denyReason: "invalid_reference" };
  }

  return { allowed: true };
}