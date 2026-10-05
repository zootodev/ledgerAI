// ============================================================
// LedgerAI — Ask v2 goal_impact delta provenance (Phase 27B-1)
// ------------------------------------------------------------
// F-1 hardening: the numeric `delta` inside a goal_impact proposal is a
// financial amount. It must NOT be trusted merely because an LLM (or any
// caller) placed it in a structured field. This module deterministically
// PROVES the delta against the user's own words before policy may turn it
// into a finance-engine query.
//
// It reuses the existing trusted v1 determinism — `detectHypothetical` (and
// the same money-token grammar as `extractHypotheticalAmount`) from
// @/lib/ask/understanding — so provenance is enforced by the SAME parser and
// semantics the v1 boundary already ships. This layer never computes a
// figure; it only verifies that a figure the user stated was understood.
// ============================================================

import { detectHypothetical } from "@/lib/ask/understanding";

export type GoalImpactProvenanceResult =
  | { ok: true; amount: number; operation: "increase" | "decrease" | null }
  | { ok: false; reason: "not_goal_impact" | "no_user_amount" | "amount_mismatch" | "direction_mismatch" };

/** Money-token grammar — MUST mirror `extractHypotheticalAmount` exactly so
 *  accepted figures and their values stay in lockstep with the v1 parser. */
const MONEY_TOKEN_RE =
  /(?:₦|ngn|#|naira)?\s*(\d[\d,._]*)\s*(k|thousand|million|m|b)?\b/g;

/** Spending-change register: localized textual markers of a change claim. */
const CHANGE_IDIOM =
  /\b(cut|cuts|cutting|reduce|reduces|reduced|reducing|decrease|decreases|decreasing|decreased|save|saving|saved|raise|raises|raising|increase|increases|increasing|lower|lowers|lowering|less|more)\b/i;

/** Sentence terminator + following whitespace/end — a decimal dot inside
 *  "5,000.50" must never end a sentence. */
const SENTENCE_BOUNDARY = /(?<=[.!?])\s+/;

interface MoneyToken {
  value: number;
  index: number;
}

/** Every ACCEPTED money figure in the message with its position (same
 *  acceptance rules as `extractHypotheticalAmount`, including the bare
 *  four-digit year guard and the 1e12 bound). */
function moneyTokens(text: string): MoneyToken[] {
  const lowered = text.toLowerCase();
  const tokens: MoneyToken[] = [];
  for (const match of lowered.matchAll(MONEY_TOKEN_RE)) {
    if (match.index === undefined) continue;
    const raw = match[1].replace(/[,_]/g, "");
    if (!/^\d+(\.\d+)?$/.test(raw)) continue;
    const base = Number(raw);
    if (!Number.isFinite(base) || base <= 0) continue;
    const suffix = match[2] ?? "";
    const value =
      suffix === "k" || suffix === "thousand"
        ? base * 1_000
        : suffix === "million" || suffix === "m"
          ? base * 1_000_000
          : suffix === "b"
            ? base * 1_000_000_000
            : base;
    if (value > 1_000_000_000_000) continue;
    if (/^\d{4}$/.test(raw) && !suffix && value >= 1900 && value <= 2100) continue;
    tokens.push({ value: Math.round(value * 100) / 100, index: match.index });
  }
  return tokens;
}

interface Sentence {
  start: number;
  end: number;
  body: string;
}

function sentencesOf(text: string): Sentence[] {
  const out: Sentence[] = [];
  let start = 0;
  for (const part of text.split(SENTENCE_BOUNDARY)) {
    out.push({ start, end: start + part.length, body: part });
    start += part.length;
  }
  return out;
}

/**
 * Localize the user-stated change amount by deterministic semantic context:
 * the FIRST accepted money figure inside a SENTENCE that also carries a
 * spending-change idiom. This is deliberate: it is NOT "first number in the
 * message" (that happily accepts a comparative/current balance figure) and
 * NOT "largest number" — the amount must sit INSIDE the change claim.
 */
function localizedChangeAmount(text: string): number | null {
  const tokens = moneyTokens(text);
  if (tokens.length === 0) return null;
  for (const sentence of sentencesOf(text)) {
    if (!CHANGE_IDIOM.test(sentence.body)) continue;
    const inClaim = tokens.filter(
      (t) => t.index >= sentence.start && t.index < sentence.end,
    );
    if (inClaim.length > 0) return inClaim[0].value;
  }
  return null;
}

export interface VerifyGoalImpactDeltaProvenanceInput {
  /** The raw user message for the turn (never the model's summary). */
  message: string;
  /** The signed delta the LLM (or caller) proposed. */
  delta: number;
  /** Reference time for base-period resolution (deterministic default). */
  now?: Date;
}

/**
 * F-1 boundary: prove a proposed goal_impact delta before it may execute.
 *
 * Control flow:
 *   1. The message must be a hypothetical spending-change claim
 *      (`detectHypothetical` — the v1 framing rules, e.g. "what if I spent
 *      less", "cut X by N"). Non-goal-impact wording → `not_goal_impact`.
 *   2. The message must localize a user-stated change amount inside a
 *      change-claim sentence. Otherwise → `no_user_amount` (also when the
 *      message carries no money figure at all).
 *   3. The proposed magnitude must equal the localized amount
 *      (cents-exact). Otherwise → `amount_mismatch`.
 *   4. The delta's SIGN must match the claim's direction (decrease ⇒
 *      negative delta, increase ⇒ positive). Otherwise → `direction_mismatch`.
 *
 * On any failure the caller must CLARIFY — never execute, never guess.
 */
export function verifyGoalImpactDeltaProvenance(
  input: VerifyGoalImpactDeltaProvenanceInput,
): GoalImpactProvenanceResult {
  const text = (input.message ?? "").trim();
  if (!text) return { ok: false, reason: "no_user_amount" };

  const hypothetical = detectHypothetical(text, input.now ?? new Date());
  if (!hypothetical) return { ok: false, reason: "not_goal_impact" };

  const localized = localizedChangeAmount(text);
  if (localized === null) return { ok: false, reason: "no_user_amount" };

  const magnitude = Math.abs(input.delta);
  if (Math.round(magnitude * 100) !== Math.round(localized * 100)) {
    return { ok: false, reason: "amount_mismatch" };
  }

  const operation = hypothetical.operation;
  if (operation === "decrease" && !(input.delta < 0)) {
    return { ok: false, reason: "direction_mismatch" };
  }
  if (operation === "increase" && !(input.delta > 0)) {
    return { ok: false, reason: "direction_mismatch" };
  }

  return { ok: true, amount: localized, operation };
}